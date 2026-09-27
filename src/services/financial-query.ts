import type {
  FinancialAnswer,
  AnswerData,
  AnswerMetric,
  FinancialQueryName,
  QueryPeriod,
  FinancialAnswerSource,
} from './financial-answer';
import { getFinancialSituation } from './financial-situation';
import { planningPhaseTwo } from './planning-phase-two';
import { investmentPortfolio } from './investment-portfolio';
import { passiveIncome } from './passive-income';
import { paidIncome } from './investment-ledger';
import { investmentMaturities } from './investment-maturities';
import { calculateNetWorth } from './net-worth';
import { deriveAlerts } from './alerts';
import { auditFinancialData } from './financial-audit';
import { shiftPeriod } from './month-close';
import { compareMonths } from './financial-change-explainer';
import { type Data, type Row, num, today, validDate } from '../model';
import {
  financial,
  targets,
  plan,
  investmentBalance,
  debtState,
  costs,
  addMonths,
} from '../calculations';
import { fromCents, toCents } from './money-codec';
import { getCashFlowForecast, type CashEvent } from './cash-flow';
import { addDays } from './recurrences';

/** Read-only boundary for new views. No snapshots, posting or external requests. */
export class FinancialQueryService {
  constructor(
    private readonly data: Data,
    readonly at = today(),
  ) {
    if (!validDate(at)) throw Error('Data de referência inválida.');
  }
  getCurrentSituation() {
    return getFinancialSituation(this.data, this.at);
  }
  getIncomeSummary(month = this.at.slice(0, 7)) {
    const inside = (r: Row) =>
      String(r.date).startsWith(month) && String(r.date) <= this.at;
    return (
      this.data.work
        .filter(inside)
        .reduce((s, r) => s + toCents(num(r.revenue)), 0) +
      this.data.bankReceipts
        .filter(inside)
        .reduce((s, r) => s + num(r.amountCents), 0)
    );
  }
  getPassiveIncomeSummary() {
    return passiveIncome(this.data, this.at);
  }
  getBudgetSummary() {
    return planningPhaseTwo(this.data, this.at).budget;
  }
  getReserveSummary() {
    return planningPhaseTwo(this.data, this.at).reserve;
  }
  getCostOfLiving() {
    return planningPhaseTwo(this.data, this.at).living;
  }
  getUpcomingCommitments() {
    return this.getCashFlowForecast(30);
  }
  getUpcomingMaturities() {
    return investmentMaturities(this.data, this.at);
  }
  getActiveAlerts() {
    return deriveAlerts(this.data, this.at);
  }
  getAuditIssues() {
    return auditFinancialData(this.data, this.at);
  }
  getMonthlyReport(period?: string) {
    return this.data.reporting.closures
      .filter(
        (c) =>
          c.status === 'closed' &&
          (!period || c.period === period) &&
          c.period < this.at.slice(0, 7),
      )
      .sort((a, b) => b.period.localeCompare(a.period))[0]
      ?.revisions.at(-1);
  }
  getRecentChanges(period?: string) {
    const last = this.getMonthlyReport(period);
    const previous =
      last && this.getMonthlyReport(shiftPeriod(last.period, -1));
    return last && previous
      ? { comparison: compareMonths(last, previous), last, previous }
      : null;
  }
  private answers = new Map<string, FinancialAnswer<AnswerData>>();
  /** Standard, minimal read-only envelope. Legacy getters remain compatible with Today/Calendar. */
  answer(
    query: FinancialQueryName,
    period: QueryPeriod = 'current',
  ): FinancialAnswer<AnswerData> {
    const key = query + ':' + period;
    const old = this.answers.get(key);
    if (old) return structuredClone(old);
    const value = this.resolveAnswer(query, period);
    this.answers.set(key, value);
    return structuredClone(value);
  }
  private resolveAnswer(
    query: FinancialQueryName,
    period: QueryPeriod,
  ): FinancialAnswer<AnswerData> {
    const d = this.data,
      month = this.at.slice(0, 7);
    const unavailable = (
      summary = 'Não há dados suficientes para esta consulta.',
    ): FinancialAnswer<AnswerData> => ({
      status: 'unavailable',
      summary,
      assumptions: [],
      warnings: [],
      sources: [],
    });
    const metric = (label: string, cents: number | null): AnswerMetric => ({
      label,
      value: cents === null ? null : fromCents(cents),
      unit: 'BRL',
    });
    const answer = (
      summary: string,
      metrics: AnswerMetric[],
      source: string,
      assumptions: string[],
      partial = false,
      items?: string[],
    ): FinancialAnswer<AnswerData> => ({
      status: partial ? 'partial' : 'available',
      summary,
      data: { metrics, ...(items ? { items: items.slice(0, 30) } : {}) },
      assumptions,
      warnings: [
        ...(partial
          ? ['Resultado parcial: confira os dados ausentes e as hipóteses.']
          : []),
        ...(items && items.length > 30
          ? [
              `Exibindo 30 de ${items.length} itens. Consulte a área de origem para ver todos.`,
            ]
          : []),
      ],
      sources: [
        {
          label: source,
          date: this.at,
          status: assumptions.some((s) => s.includes('Estimativa'))
            ? 'estimado'
            : 'registrado',
        },
      ],
    });
    const selected =
      period === 'previous'
        ? shiftPeriod(month, -1)
        : period === 'last-closed'
          ? this.getMonthlyReport()?.period
          : month;
    if (!selected)
      return unavailable('Ainda não existe fechamento mensal salvo.');
    if (query === 'getRecentChanges') {
      if (period === 'year')
        return unavailable(
          'A comparação usa dois fechamentos mensais consecutivos; selecione um mês.',
        );
      const changes = this.getRecentChanges(
        period === 'current' || period === 'last-closed' ? undefined : selected,
      );
      if (!changes)
        return unavailable(
          'São necessários dois fechamentos consecutivos para comparar sem recalcular o passado.',
        );
      const result = answer(
        `Variações de ${changes.previous.period} para ${changes.last.period}.`,
        changes.comparison.metrics.map((m) => metric(m.label, m.absolute)),
        'Fechamentos mensais',
        [
          'Diferença entre as últimas revisões salvas; não usa registros atuais.',
        ],
        changes.last.dataCompleteness !== 'complete' ||
          changes.previous.dataCompleteness !== 'complete',
      );
      result.sources = [changes.previous, changes.last].map((s) => ({
        label: `Snapshot ${s.period}`,
        date: s.through,
        status: 'snapshot',
        revision: s.revision,
      }));
      return result;
    }
    if (
      query === 'getMonthlyExpenses' ||
      query === 'getIncomeSummary' ||
      query === 'getMonthlyReport'
    ) {
      const periods =
        period === 'year'
          ? Array.from(
              { length: Number(month.slice(5)) },
              (_, i) =>
                month.slice(0, 4) + '-' + String(i + 1).padStart(2, '0'),
            )
          : [selected];
      let expense = 0,
        income = 0,
        found = false,
        incomplete = false;
      const sources: FinancialAnswerSource[] = [],
        categories = new Map<string, number>();
      for (const p of periods) {
        const snapshot = this.getMonthlyReport(p);
        if (snapshot?.dataCompleteness === 'insufficient') {
          incomplete = true;
          continue;
        }
        if (snapshot) {
          expense += snapshot.expenseCents;
          income += snapshot.incomeCents;
          found = true;
          incomplete ||= snapshot.dataCompleteness !== 'complete';
          for (const [name, cents] of Object.entries(snapshot.categories))
            categories.set(name, (categories.get(name) || 0) + cents);
          categories.set(
            'Manutenção',
            (categories.get('Manutenção') || 0) + snapshot.maintenanceCents,
          );
          sources.push({
            label: `Snapshot ${p}`,
            date: snapshot.through,
            status: 'snapshot',
            revision: snapshot.revision,
          });
        } else if (p === month) {
          const rows = [...d.expenses, ...d.services].filter(
            (r) => String(r.date).startsWith(p) && String(r.date) <= this.at,
          );
          expense +=
            toCents(this.getMonthlyExpenses(p)) +
            d.services
              .filter(
                (r) =>
                  String(r.date).startsWith(p) && String(r.date) <= this.at,
              )
              .reduce((s, r) => s + toCents(num(r.amount)), 0);
          income += this.getIncomeSummary(p);
          const hasIncome = [...d.work, ...d.bankReceipts].some(
            (r) => String(r.date).startsWith(p) && String(r.date) <= this.at,
          );
          found ||=
            query === 'getMonthlyExpenses'
              ? rows.length > 0
              : query === 'getIncomeSummary'
                ? hasIncome
                : rows.length > 0 || hasIncome;
          rows.forEach((r) => {
            const name = String(r.category || 'Manutenção');
            categories.set(
              name,
              (categories.get(name) || 0) + toCents(num(r.amount)),
            );
          });
          sources.push({
            label:
              'Gastos e serviços registrados; Trabalho e recebimentos registrados',
            date: this.at,
            status: 'registrado',
          });
        } else incomplete = true;
      }
      if (!found)
        return unavailable(
          'Não há registros neste período ou fechamento salvo. O passado não foi recalculado.',
        );
      const result = answer(
        period === 'year'
          ? 'Acumulado do ano: fechamentos disponíveis e mês atual.'
          : `Realizado em ${selected}.`,
        query === 'getMonthlyExpenses'
          ? [metric('Gastos do período', expense)]
          : query === 'getIncomeSummary'
            ? [metric('Receitas do período', income)]
            : [metric('Gastos', expense), metric('Receitas', income)],
        'Registros locais',
        [
          'Gastos incluem despesas e serviços de manutenção; excluem transferências internas e pagamentos de dívidas.',
          'Receitas incluem Trabalho e recebimentos; renda passiva é consultada separadamente.',
          ...(incomplete
            ? [
                'Há meses sem fechamento ou snapshots parciais; não foram tratados como zero.',
              ]
            : []),
        ],
        incomplete,
        query === 'getIncomeSummary'
          ? undefined
          : [...categories]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(
                ([name, cents]) =>
                  `${name}: ${fromCents(cents).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
              ),
      );
      result.sources = sources;
      return result;
    }
    if (period !== 'current') {
      if (period === 'year')
        return unavailable(
          'Esta consulta descreve uma posição ou projeção, não um acumulado anual. Selecione Este mês.',
        );
      const snapshot = this.getMonthlyReport(selected);
      if (!snapshot || snapshot.dataCompleteness === 'insufficient')
        return unavailable(
          'Não há fechamento com dados suficientes para este período.',
        );
      let metrics: AnswerMetric[];
      if (query === 'getNetWorth')
        metrics = [metric('Patrimônio líquido', snapshot.netWorthCents)];
      else if (query === 'getReserveSummary')
        metrics = [
          metric('Reserva', snapshot.reserveSummary.afterCents),
          {
            label: 'Cobertura',
            value: snapshot.reserveSummary.after,
            unit: 'meses',
          },
        ];
      else if (query === 'getBudgetSummary' && snapshot.budgetSummary.length)
        metrics = snapshot.budgetSummary.map((b) =>
          metric(b.category + ' — realizado', b.actualCents),
        );
      else
        return unavailable(
          'O fechamento não preserva os detalhes desta consulta. Selecione Este mês para consultar a posição atual.',
        );
      const result = answer(
        `Posição salva em ${selected}.`,
        metrics,
        'Fechamento mensal',
        ['Última revisão fechada; não usa o cadastro atual.'],
        snapshot.dataCompleteness !== 'complete',
      );
      result.sources = [
        {
          label: `Snapshot ${selected}`,
          date: snapshot.through,
          status: 'snapshot',
          revision: snapshot.revision,
        },
      ];
      return result;
    }
    switch (query) {
      case 'getCurrentSituation': {
        if (
          ![
            d.work,
            d.expenses,
            d.investments,
            d.debts,
            d.bankReceipts,
            d.assets,
            d.services,
          ].some((r) => r.length) &&
          !num(d.settings.openingCash)
        )
          return unavailable();
        const s = this.getCurrentSituation();
        return answer(
          'Situação financeira registrada hoje.',
          [
            metric('Patrimônio líquido', s.wealth.netCents),
            metric('Caixa', s.wealth.cashCents),
          ],
          'Cadastros financeiros e patrimônio',
          [
            'Caixa + investimentos + bens − obrigações, pelo serviço de patrimônio.',
          ],
          s.wealth.partial,
        );
      }
      case 'getDebtSummary': {
        if (!d.debts.length) return unavailable('Nenhuma dívida cadastrada.');
        const rows = this.getDebtSummary();
        return answer(
          'Saldo das dívidas cadastradas.',
          [
            metric(
              'Saldo devedor',
              rows.reduce((s, r) => s + toCents(r.balance), 0),
            ),
          ],
          'Dívidas e pagamentos',
          [
            'Saldo calculado pelas regras de parcelas e pagamentos já registradas.',
          ],
          false,
          rows.map((r) => `${r.name}: ${r.remaining} parcelas restantes`),
        );
      }
      case 'getInvestmentSummary': {
        if (!d.investments.some((r) => String(r.date) <= this.at))
          return unavailable('Nenhum investimento registrado até esta data.');
        const p = investmentPortfolio(d, this.at);
        return answer(
          'Valor registrado da carteira.',
          [
            metric(
              p.partial
                ? 'Investimentos — valores conhecidos'
                : 'Investimentos',
              p.positions.some((row) => row.valueCents !== null)
                ? p.knownValueCents
                : null,
            ),
          ],
          'Investimentos e movimentações',
          [
            'Posição contábil ou avaliação manual datada; não representa cotação ao vivo.',
            'Nenhuma taxa econômica externa foi consultada.',
          ],
          p.partial,
          p.positions.map(
            (r) => `${r.asset.name}: ${r.valuation} (${r.valuationDate})`,
          ),
        );
      }
      case 'getPassiveIncomeSummary': {
        if (
          !d.movements.some(
            (r) =>
              paidIncome(r) &&
              String(r.date).startsWith(month) &&
              String(r.date) <= this.at,
          )
        )
          return unavailable(
            'Nenhum recebimento de renda passiva registrado neste mês.',
          );
        return answer(
          'Renda passiva recebida neste mês.',
          [metric('Recebido', this.getPassiveIncomeSummary().thisMonthCents)],
          'Movimentações de investimentos',
          [
            'Somente proventos pagos em caixa, descontados os custos informados; reinvestimento e valorização não são recebimentos.',
          ],
        );
      }
      case 'getNetWorth': {
        if (
          ![
            d.investments,
            d.assets,
            d.debts,
            d.work,
            d.expenses,
            d.bankReceipts,
          ].some((r) => r.length) &&
          !num(d.settings.openingCash)
        )
          return unavailable();
        const w = calculateNetWorth(d, this.at);
        return answer(
          'Patrimônio líquido atual.',
          [
            metric('Patrimônio líquido', w.netCents),
            metric('Ativos brutos', w.grossCents),
            metric('Obrigações', w.liabilitiesCents),
          ],
          'Patrimônio, investimentos, caixa e dívidas',
          [
            'Valores pelo serviço de patrimônio, incluindo bens sem dupla contagem.',
          ],
          w.partial,
        );
      }
      case 'getReserveSummary': {
        const r = this.getReserveSummary();
        if (
          !d.reserveAllocations.length &&
          !d.investments.some((r) => r.category === 'reserva de emergência')
        )
          return unavailable('Não há investimentos destinados à reserva.');
        return answer(
          'Reserva de emergência registrada.',
          [
            metric('Reserva', r.totalCents),
            metric('Falta para a meta', r.missingCents),
            { label: 'Cobertura', value: r.coverage, unit: 'meses' },
          ],
          'Alocações da reserva e custo de vida',
          [
            'Cobertura = valor reservado ÷ custo mínimo mensal. Meta usa os meses configurados.',
          ],
          r.partial || r.coverage === null || r.unknownLiquidityCents > 0,
        );
      }
      case 'getCostOfLiving': {
        const l = this.getCostOfLiving();
        if (
          ![...d.expenses, ...d.services].some(
            (row) => String(row.date) <= this.at,
          )
        )
          return unavailable(
            'Histórico de despesas insuficiente para estimar o custo de vida.',
          );
        return answer(
          'Estimativa mensal do custo de vida.',
          [
            metric('Mínimo mensal', l.minimumCents),
            metric('Normal mensal', l.normalCents),
          ],
          'Histórico de gastos e planejamento',
          [
            'Estimativa pelo serviço de custo de vida, com categorias e janela configuradas.',
          ],
          l.partial,
        );
      }
      case 'getWorkTarget': {
        const t = planningPhaseTwo(d, this.at).target,
          legacy = t.enabled ? null : this.getWorkTarget();
        const value = t.enabled
          ? t.remainingTodayCents
          : legacy?.remaining === null
            ? null
            : toCents(legacy?.remaining || 0);
        if (value === null)
          return unavailable(
            'Configure a meta e os dias de trabalho para obter uma estimativa.',
          );
        return answer(
          'Quanto falta faturar hoje.',
          [metric('Faturamento restante hoje', value)],
          'Metas e Trabalho',
          [
            'Estimativa: usa a agenda dinâmica quando ativada; caso contrário, a meta existente. Deduz o faturamento de hoje.',
          ],
          t.enabled && t.partial,
        );
      }
      case 'getBudgetSummary': {
        const b = this.getBudgetSummary();
        if (!b.rows.length) return unavailable('Nenhum orçamento ativo.');
        return answer(
          'Orçamentos deste mês.',
          [
            metric('Limite mensal', b.limitCents),
            metric('Gasto realizado', b.actualCents),
          ],
          'Orçamentos e despesas',
          ['Soma das categorias com orçamento ativo.'],
          b.partial,
        );
      }
      case 'getCashFlowForecast':
      case 'getUpcomingCommitments': {
        const f =
          query === 'getCashFlowForecast'
            ? this.getCashFlowForecast(30)
            : this.getUpcomingCommitments();
        if (!f.events.length)
          return unavailable(
            'Nenhum compromisso encontrado para os próximos 30 dias.',
          );
        return answer(
          'Projeção dos próximos 30 dias.',
          [
            metric(
              'Entradas previstas conhecidas',
              f.events.some(
                (e) => e.direction === 'entrada' && e.amount === null,
              ) &&
                !f.events.some(
                  (e) => e.direction === 'entrada' && e.amount !== null,
                )
                ? null
                : toCents(f.income),
            ),
            metric(
              'Saídas previstas conhecidas',
              f.events.some(
                (e) => e.direction === 'saída' && e.amount === null,
              ) &&
                !f.events.some(
                  (e) => e.direction === 'saída' && e.amount !== null,
                )
                ? null
                : toCents(f.outflow),
            ),
          ],
          'Fluxo de caixa, recorrências e compromissos',
          [
            'Estimativa: eventos previstos não são lançamentos realizados. Valores desconhecidos permanecem parciais.',
          ],
          !f.complete,
          f.events.map((e) => `${e.date} — ${e.name} (${e.status})`),
        );
      }
      case 'getUpcomingMaturities': {
        const m = this.getUpcomingMaturities();
        if (!m.events.length)
          return unavailable(
            'Nenhuma data de vencimento ou evento cadastrada.',
          );
        return answer(
          'Vencimentos e eventos nos próximos 30 dias.',
          [],
          'Calendário dos investimentos',
          [
            'Somente datas cadastradas; nenhuma condição do produto foi presumida.',
          ],
          false,
          m.days30.map((e) => `${e.date} — ${e.name}: ${e.label}`),
        );
      }
      case 'getMotorcycleCost': {
        const c = this.getMotorcycleCost();
        if (!c.configured)
          return unavailable(
            'Configure consumo e preço do combustível da moto.',
          );
        return answer(
          'Custo estimado da moto por km.',
          [
            { label: 'Operacional', value: c.operating, unit: 'R$/km' },
            { label: 'Econômico', value: c.economic, unit: 'R$/km' },
          ],
          'Moto, manutenção e componentes',
          [
            'Estimativa: combustível + provisão de componentes; custo econômico inclui depreciação.',
          ],
          c.distance <= 0,
        );
      }
      case 'getGoalForecast': {
        const goals = this.getGoalForecast();
        if (!goals.length) return unavailable('Nenhum plano ativo.');
        return answer(
          'Planos ativos.',
          [],
          'Planos e transações',
          [
            'Estimativa de aporte necessário; depende do prazo e dos aportes registrados.',
          ],
          false,
          goals.map(
            (g) =>
              `${g.name} — faltam ${g.remaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}; estimativa mensal ${g.deadline ? g.monthly.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'indisponível'}; prazo ${g.deadline || 'não informado'}`,
          ),
        );
      }
      case 'getActiveAlerts': {
        const alerts = this.getActiveAlerts();
        return answer(
          'Pendências identificadas pela Central de Alertas.',
          [],
          'Central de Alertas',
          [
            'Mesmas condições da Central; consultar não altera nem resolve alertas.',
          ],
          false,
          alerts.map((a) => `${a.title}: ${a.description}`),
        );
      }
      case 'getAuditIssues': {
        const issues = this.getAuditIssues();
        return answer(
          'Verificação de consistência dos registros.',
          [],
          'Auditoria financeira',
          [
            'Verificação determinística das regras disponíveis; não é certificação contábil.',
          ],
          false,
          issues.map((i) => `${i.title}: ${i.description}`),
        );
      }
    }
  }
  getCashFlowForecast(horizon: number) {
    return getCashFlowForecast(this.data, this.at, horizon);
  }
  getMonthlyExpenses(month = this.at.slice(0, 7)) {
    return fromCents(
      this.data.expenses
        .filter(
          (r) => String(r.date).startsWith(month) && String(r.date) <= this.at,
        )
        .reduce((s, r) => s + toCents(num(r.amount)), 0),
    );
  }
  getDebtSummary() {
    return this.data.debts.map((r) => debtState(this.data, r, this.at));
  }
  getNetWorth() {
    return {
      amount: fromCents(calculateNetWorth(this.data, this.at).netCents),
      source: 'Patrimônio: caixa + investimentos + bens − obrigações',
      status: 'registrado' as const,
    };
  }
  getGoalForecast() {
    return this.data.plans
      .filter((r) => r.status !== 'concluído')
      .map((r) => ({
        id: r.id,
        name: String(r.name),
        deadline: String(r.deadline),
        ...plan(r, this.at, this.data),
      }));
  }
  getMotorcycleCost() {
    return costs(this.data);
  }
  getInvestmentSummary() {
    return this.data.investments.map((r) => ({
      id: r.id,
      name: String(r.name),
      balance: investmentBalance(this.data, r, this.at),
      maturity: String(r.maturity || ''),
    }));
  }
  getWorkTarget() {
    const t = targets(this.data, this.at),
      selection = this.data.settings.defaultTarget;
    const selected =
      selection === 'minimum'
        ? t.minimum
        : selection === 'accelerated'
          ? t.accelerated
          : t.ideal;
    const work = this.data.work.filter((r) => r.date === this.at);
    const earned = fromCents(
      work.reduce((s, r) => s + toCents(num(r.revenue)), 0),
    );
    const hours = work.reduce((s, r) => s + num(r.hours), 0);
    const target = t.configured ? selected : null;
    const remaining =
      target === null
        ? null
        : Math.max(0, fromCents(toCents(target) - toCents(earned)));
    return {
      target,
      earned,
      remaining,
      hours,
      estimatedHours:
        remaining === 0
          ? 0
          : remaining !== null && earned > 0 && hours > 0
            ? remaining / (earned / hours)
            : null,
      status: 'estimado' as const,
    };
  }
  getToday() {
    const cash = financial(this.data, this.at),
      forecast = this.getCashFlowForecast(7);
    const reserve = this.data.investments
      .filter((r) => r.category === 'reserva de emergência')
      .reduce((s, r) => s + investmentBalance(this.data, r, this.at), 0);
    const essential = num(this.data.settings.essential);
    const next =
      forecast.events.find(
        (e) => e.direction === 'saída' && e.impact === 'caixa',
      ) ?? null;
    const alerts = [
      ...forecast.events
        .filter((e) => e.originalDate < this.at && e.impact === 'caixa')
        .map((e) => `${e.name}: previsão pendente desde ${e.originalDate}.`),
      ...(forecast.minimumBalance !== null && forecast.minimumBalance < 0
        ? ['O saldo projetado pode ficar negativo nos próximos 7 dias.']
        : []),
      ...(!forecast.complete
        ? [
            'Há compromissos sem valor, sem data ou fora da janela de revisão; a projeção está incompleta.',
          ]
        : []),
    ];
    return {
      available: cash.available,
      cash: cash.cash,
      reservedForBike: cash.fund,
      work: this.getWorkTarget(),
      next,
      reserve,
      reserveMonths: essential > 0 ? reserve / essential : null,
      reserveDays: essential > 0 ? (reserve / essential) * 30 : null,
      goals: this.getGoalForecast(),
      alerts,
      nextSevenDays: {
        income: forecast.income,
        outflow: forecast.outflow,
        net: fromCents(toCents(forecast.income) - toCents(forecast.outflow)),
        partial: !forecast.complete,
      },
    };
  }
  getCalendar(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('Mês inválido.');
    const first = month + '-01',
      last = addDays(addMonths(first, 1), -1);
    const future = this.getCashFlowForecast(90);
    const realized: CashEvent[] = [];
    const append = (
      rows: Row[],
      source: string,
      label: (r: Row) => string,
      direction: (r: Row) => 'entrada' | 'saída',
      field = 'amount',
    ) => {
      for (const r of rows.filter(
        (r) =>
          String(r.date) >= first &&
          String(r.date) <= last &&
          String(r.date) <= this.at,
      ))
        realized.push({
          id: `${source}:${r.id}`,
          date: String(r.date),
          originalDate: String(r.date),
          name: label(r),
          amount: num(r[field]),
          direction: direction(r),
          impact: source === 'planTransactions' ? 'alocação' : 'caixa',
          status: 'realizado',
          source,
          sourceId: r.id,
        });
    };
    append(
      this.data.work,
      'work',
      (r) => String(r.activity),
      () => 'entrada',
      'revenue',
    );
    append(
      this.data.expenses,
      'expenses',
      (r) => String(r.name),
      () => 'saída',
    );
    append(
      this.data.payments,
      'payments',
      (r) =>
        String(
          this.data.debts.find((x) => x.id === r.debtId)?.name || 'Pagamento',
        ),
      () => 'saída',
    );
    append(
      this.data.services,
      'services',
      (r) =>
        String(
          this.data.maintenance.find((x) => x.id === r.maintenanceId)?.name ||
            'Serviço',
        ),
      () => 'saída',
    );
    append(
      this.data.movements.filter(
        (r) => r.kind === 'aporte' || r.kind === 'retirada',
      ),
      'movements',
      (r) =>
        String(
          this.data.investments.find((x) => x.id === r.investmentId)?.name ||
            'Investimento',
        ),
      (r) => (r.kind === 'aporte' ? 'saída' : 'entrada'),
    );
    append(
      this.data.planTransactions,
      'planTransactions',
      (r) =>
        String(this.data.plans.find((x) => x.id === r.planId)?.name || 'Plano'),
      (r) => (r.kind === 'deposit' ? 'saída' : 'entrada'),
    );
    return {
      events: [
        ...realized,
        ...future.events.filter((e) => e.date >= first && e.date <= last),
      ],
      days: Array.from({ length: Number(last.slice(-2)) }, (_, i) => {
        const date = addDays(first, i),
          projected = future.days.find((d) => d.date === date);
        return {
          date,
          balance:
            date < this.at
              ? financial(this.data, date).cash
              : (projected?.balance ?? null),
          status:
            date < this.at ? ('realizado' as const) : ('previsto' as const),
          outsideHorizon: date > future.end,
        };
      }),
    };
  }
}
