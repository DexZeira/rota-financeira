import {
  collections,
  type Collection,
  type Data,
  num,
  debtTerms,
  validateRow,
} from '../model';
import { assetRows } from './assets';
import { validateReporting } from './reporting-state';
import {
  recurrenceHistory,
  recurrenceSignature,
  hasOccurrence,
} from './recurrences';
import { safeRule } from './import/categorization-rules';
import type { CashEvent } from './cash-flow';
export type AuditIssue = {
  id: string;
  severity: 'info' | 'warning' | 'error';
  domain: string;
  title: string;
  description: string;
  sourceId?: string;
  suggestedAction: { label: string; route: string };
};
const routes: Partial<Record<Collection, string>> = {
  work: 'Trabalho',
  bankReceipts: 'Importar',
  expenses: 'Gastos',
  maintenance: 'Manutenção',
  services: 'Manutenção',
  costs: 'Moto',
  plans: 'Planos',
  planTransactions: 'Planos',
  checklists: 'Moto',
  activities: 'Trabalho',
  fund: 'Moto',
  planningSettings: 'Planejamento',
  netWorthSnapshots: 'Patrimônio',
  debts: 'Dívidas',
  payments: 'Dívidas',
  recurrences: 'Planejamento',
  forecastResolutions: 'Planejamento',
  budgets: 'Gastos',
  categoryPolicies: 'Planejamento',
  reserveAllocations: 'Planejamento',
  assets: 'Patrimônio',
  assetValuations: 'Patrimônio',
  assetCostLinks: 'Patrimônio',
  investments: 'Investimentos',
  movements: 'Investimentos',
};
/** Read-only checks. Invalid records are reported, never normalized or repaired. */
export function auditFinancialData(
  d: Data,
  at: string,
  forecastEvents: CashEvent[] = [],
): AuditIssue[] {
  const issues = new Map<string, AuditIssue>();
  const add = (
    domain: string,
    id: string,
    code: string,
    title: string,
    description: string,
    severity: AuditIssue['severity'] = 'error',
    route = routes[domain as Collection] || 'Configurações',
  ) => {
    const key = `${domain}:${id}:${code}`;
    issues.set(key, {
      id: key,
      severity,
      domain,
      title,
      description,
      sourceId: id,
      suggestedAction: { label: `Revisar em ${route}`, route },
    });
  };
  const ids = new Map(
    collections.map((key) => [key, new Set(d[key].map((r) => r.id))]),
  );
  const has = (kind: string, id: string) =>
    ids.get(kind as Collection)?.has(id) ?? false;
  for (const key of collections) {
    const seen = new Set<string>();
    for (const r of d[key]) {
      if (!r.id || seen.has(r.id))
        add(
          key,
          r.id,
          'identity',
          'Identificação ausente ou duplicada',
          'Registros precisam de identificadores únicos para preservar seus vínculos.',
        );
      seen.add(r.id);
      try {
        validateRow(key, r);
      } catch (error) {
        add(
          key,
          r.id,
          'invalid',
          'Registro inválido',
          `${String(r.name || r.id)}: ${error instanceof Error ? error.message : 'Estrutura incompatível.'}`,
        );
      }
    }
  }
  const unique = (
    key: Collection,
    getKey: (r: Data[Collection][number]) => string,
  ) => {
    const seen = new Set<string>();
    for (const r of d[key]) {
      const identity = getKey(r);
      if (seen.has(identity))
        add(
          key,
          r.id,
          'duplicate',
          'Configuração duplicada',
          'Mais de um registro representa a mesma configuração ou ocorrência.',
        );
      seen.add(identity);
    }
  };
  unique(
    'budgets',
    (r) =>
      `${r.period}:${String(r.category).trim().toLocaleLowerCase('pt-BR')}`,
  );
  unique('reserveAllocations', (r) => String(r.investmentId));
  unique('forecastResolutions', (r) => `${r.recurrenceId}:${r.occurrenceDate}`);
  unique('categoryPolicies', (r) =>
    String(r.category).trim().toLocaleLowerCase('pt-BR'),
  );
  const rulesById = new Map(d.recurrences.map((r) => [r.id, r]));
  const signatures = new Set<string>(),
    origins = new Set<string>();
  for (const r of d.recurrences) {
    try {
      const history = recurrenceHistory(r);
      if (
        history.length &&
        (!r.effectiveFrom || history.at(-1)!.until >= String(r.effectiveFrom))
      )
        add(
          'recurrences',
          r.id,
          'history',
          'Vigências sobrepostas',
          'O histórico e a regra atual possuem vigências incompatíveis.',
        );
      if (r.status === 'ativa') {
        const signature = recurrenceSignature(r);
        if (signatures.has(signature))
          add(
            'recurrences',
            r.id,
            'schedule',
            'Recorrência ativa repetida',
            'Duas regras podem gerar a mesma obrigação.',
          );
        signatures.add(signature);
      }
    } catch {
      add(
        'recurrences',
        r.id,
        'history',
        'Histórico de vigências inválido',
        'Não é possível reconstruir as ocorrências com segurança.',
      );
    }
    if (r.sourceKind !== 'nenhum' && !r.archived) {
      const key = `${r.sourceKind}:${r.sourceId}`;
      if (origins.has(key))
        add(
          'recurrences',
          r.id,
          'origin',
          'Origem usada por mais de uma regra',
          'Confira a possível duplicação de obrigações.',
        );
      origins.add(key);
    }
  }
  for (const r of d.recurrences)
    if (
      r.sourceKind !== 'nenhum' &&
      !has(String(r.sourceKind), String(r.sourceId))
    )
      add(
        'recurrences',
        r.id,
        'orphan',
        'Origem da recorrência ausente',
        'A previsão aponta para um registro que não existe.',
      );
  const realized = new Set<string>();
  for (const r of d.forecastResolutions) {
    const rule = rulesById.get(String(r.recurrenceId));
    if (rule) {
      try {
        if (!hasOccurrence(rule, String(r.occurrenceDate)))
          add(
            'forecastResolutions',
            r.id,
            'occurrence',
            'Ocorrência não corresponde à regra',
            'A data conferida não pertence à programação registrada.',
          );
      } catch {
        add(
          'forecastResolutions',
          r.id,
          'occurrence',
          'Ocorrência não verificável',
          'Revise o histórico da regra de origem.',
        );
      }
    }
    if (!has('recurrences', String(r.recurrenceId)))
      add(
        'forecastResolutions',
        r.id,
        'orphan',
        'Recorrência ausente',
        'A conferência perdeu seu vínculo com a regra.',
      );
    if (r.action === 'vincular') {
      if (!has(String(r.recordKind), String(r.recordId)))
        add(
          'forecastResolutions',
          r.id,
          'missing-record',
          'Realizado ausente',
          'A ocorrência aponta para um lançamento inexistente.',
        );
      const key = `${r.recordKind}:${r.recordId}`;
      if (realized.has(key))
        add(
          'forecastResolutions',
          r.id,
          'duplicate-record',
          'Realizado conciliado mais de uma vez',
          'Confira se o mesmo lançamento foi usado para liquidar obrigações diferentes.',
          'warning',
        );
      realized.add(key);
    }
  }
  for (const r of d.reserveAllocations)
    if (!has('investments', String(r.investmentId)))
      add(
        'reserveAllocations',
        r.id,
        'orphan',
        'Investimento da reserva ausente',
        'Não é possível confirmar esta alocação.',
      );
  const assets = new Set(assetRows(d).map((r) => r.id));
  const paidByDebt = new Map<
    string,
    { amount: number; installments: number }
  >();
  for (const p of d.payments) {
    const key = String(p.debtId),
      total = paidByDebt.get(key) || { amount: 0, installments: 0 };
    total.amount += num(p.amount);
    total.installments += num(p.installments);
    paidByDebt.set(key, total);
  }
  for (const r of d.debts) {
    const paid = paidByDebt.get(r.id),
      terms = debtTerms(r);
    if (
      paid &&
      (paid.amount > terms.balance + 0.001 ||
        paid.installments > terms.remaining)
    )
      add(
        'debts',
        r.id,
        'overpaid',
        'Pagamentos acima das condições cadastradas',
        'O total pago ou as parcelas pagas superam o saldo de abertura. Confira pagamentos duplicados e termos da dívida.',
      );
  }
  const movements = new Map<string, Data['movements']>();
  for (const m of d.movements) {
    const key = String(m.investmentId);
    if (!movements.has(key)) movements.set(key, []);
    movements.get(key)!.push(m);
  }
  for (const r of d.investments) {
    let balance = num(r.balance);
    for (const m of (movements.get(r.id) || []).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    )) {
      if (String(m.date) < String(r.date))
        add(
          'movements',
          m.id,
          'date',
          'Movimentação anterior ao saldo inicial',
          'Confira a data de abertura do investimento e a movimentação.',
        );
      balance +=
        num(m.amount) *
        (['retirada', 'perda'].includes(String(m.kind)) ? -1 : 1);
      if (balance < -0.001) {
        add(
          'investments',
          r.id,
          'negative',
          'Retirada ou perda acima do saldo',
          'O histórico produz saldo negativo; confira os valores e a ordem das movimentações.',
        );
        break;
      }
    }
  }
  for (const r of d.assetCostLinks)
    if (
      !assets.has(String(r.assetId)) ||
      !has(String(r.recordKind), String(r.recordId))
    )
      add(
        'assetCostLinks',
        r.id,
        'orphan',
        'Custo patrimonial sem origem',
        'O bem ou lançamento associado não existe.',
      );
  for (const r of d.assetValuations) {
    if (!assets.has(String(r.assetId)))
      add(
        'assetValuations',
        r.id,
        'orphan',
        'Avaliação sem bem',
        'O bem avaliado não existe.',
      );
    if (r.source !== 'estimated' && String(r.date) > at)
      add(
        'assetValuations',
        r.id,
        'future',
        'Avaliação realizada no futuro',
        'Confirme a data ou registre a avaliação como estimativa.',
        'warning',
      );
  }
  for (const r of d.assets) {
    if (r.financingDebtId && !has('debts', String(r.financingDebtId)))
      add(
        'assets',
        r.id,
        'debt',
        'Financiamento ausente',
        'O bem aponta para uma dívida inexistente.',
      );
    if (r.active === 'sim' && r.soldAt && String(r.soldAt) <= at)
      add(
        'assets',
        r.id,
        'sold-active',
        'Bem vendido ainda ativo',
        'Confira a situação e a data da venda.',
        'warning',
      );
    if (r.cashSale === 'sim' && !r.soldAt)
      add(
        'assets',
        r.id,
        'sale-date',
        'Venda sem data',
        'Não é possível posicionar a entrada no fluxo de caixa.',
      );
  }
  for (const r of d.payments)
    if (!has('debts', String(r.debtId)))
      add(
        'payments',
        r.id,
        'orphan',
        'Pagamento sem dívida',
        'O pagamento aponta para uma dívida inexistente.',
      );
  for (const r of d.movements)
    if (!has('investments', String(r.investmentId)))
      add(
        'movements',
        r.id,
        'orphan',
        'Movimentação sem investimento',
        'O investimento de origem não existe.',
      );
  for (const r of d.investments)
    if (r.maturity && r.date && String(r.maturity) < String(r.date))
      add(
        'investments',
        r.id,
        'maturity',
        'Vencimento anterior ao início',
        'Confira as datas do investimento.',
      );
  for (const r of d.imports.rules) {
    try {
      safeRule(r);
    } catch (error) {
      add(
        'import',
        r.id,
        'rule',
        'Regra de importação inválida',
        error instanceof Error ? error.message : 'Confira a regra.',
        'error',
        'Importar',
      );
    }
  }
  const sessions = new Set(d.imports.sessions.map((s) => s.id));
  const sessionCounts = new Map<string, number>(),
    fitids = new Set<string>();
  for (const l of d.imports.links) {
    sessionCounts.set(l.sessionId, (sessionCounts.get(l.sessionId) || 0) + 1);
    if (!sessions.has(l.sessionId))
      add(
        'import',
        l.id,
        'session',
        'Importação sem sessão',
        'O vínculo não possui uma sessão de origem.',
        'error',
        'Importar',
      );
    if (l.recordId && !has(l.recordKind, l.recordId))
      add(
        'import',
        l.id,
        'record',
        'Registro importado não está mais disponível',
        'O vínculo histórico foi preservado para impedir reimportação. Confira se a exclusão foi intencional.',
        'info',
        'Importar',
      );
    if (l.transaction.externalId) {
      const key = JSON.stringify([
        l.transaction.source,
        l.transaction.accountId || l.transaction.accountLabel,
        l.transaction.externalId,
      ]);
      if (fitids.has(key))
        add(
          'import',
          l.id,
          'fitid',
          'Identificador bancário repetido',
          'Há mais de um vínculo com o mesmo identificador na mesma conta.',
          'warning',
          'Importar',
        );
      fitids.add(key);
    }
  }
  for (const s of d.imports.sessions)
    if (!sessionCounts.has(s.id) && s.importedCount + s.matchedCount > 0)
      add(
        'import',
        s.id,
        'empty',
        'Sessão sem vínculos',
        'A sessão informa lançamentos importados, mas não possui os vínculos correspondentes.',
        'warning',
        'Importar',
      );
  for (const c of d.reporting.closures) {
    try {
      validateReporting({ closures: [c] });
    } catch {
      add(
        'reporting',
        c.period,
        'invalid',
        'Fechamento inválido',
        'Revise período, assinatura, sequência das revisões e integridade do snapshot. O relatório salvo não foi alterado.',
        'error',
        'Relatórios',
      );
    }
  }
  const periods = new Set<string>();
  for (const c of d.reporting.closures) {
    if (periods.has(c.period))
      add(
        'reporting',
        c.period,
        'duplicate',
        'Fechamento duplicado',
        'Mais de um fechamento usa o mesmo período.',
        'error',
        'Relatórios',
      );
    periods.add(c.period);
  }
  if (
    num(d.planningVersion) > 6 ||
    num(d.reportingVersion) > 1 ||
    num(d.dataVersion) > 6
  )
    add(
      'system',
      'version',
      'future',
      'Versão incompatível',
      'Atualize o aplicativo antes de modificar este conjunto de dados.',
    );
  const priority = { error: 0, warning: 1, info: 2 };
  const eventIds = new Set<string>();
  const resolved = new Set(
    d.forecastResolutions.map((r) => `${r.recurrenceId}:${r.occurrenceDate}`),
  );
  for (const event of forecastEvents) {
    if (eventIds.has(event.id))
      add(
        'forecast',
        event.id,
        'duplicate',
        'Evento projetado duplicado',
        'A mesma identidade aparece mais de uma vez no fluxo.',
        'error',
        'Planejamento',
      );
    eventIds.add(event.id);
    if (!has(event.source, event.sourceId))
      add(
        'forecast',
        event.id,
        'orphan',
        'Previsão sem origem',
        'O registro que gerou a previsão não existe.',
        'error',
        'Planejamento',
      );
    if (
      event.amount !== null &&
      (!Number.isFinite(event.amount) || event.amount < 0)
    )
      add(
        'forecast',
        event.id,
        'amount',
        'Valor projetado inválido',
        'O valor precisa ser válido ou explicitamente desconhecido.',
        'error',
        'Planejamento',
      );
    if (
      event.source === 'recurrences' &&
      resolved.has(`${event.sourceId}:${event.originalDate}`) &&
      event.status !== 'realizado'
    )
      add(
        'forecast',
        event.id,
        'resolved',
        'Ocorrência conferida ainda projetada',
        'A previsão já tem uma resolução registrada e não deve ser somada novamente.',
        'error',
        'Planejamento',
      );
  }
  return [...issues.values()].sort(
    (a, b) =>
      priority[a.severity] - priority[b.severity] || a.id.localeCompare(b.id),
  );
}
