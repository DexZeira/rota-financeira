import { type Data, num, validDate, money } from '../model';
import { debtState, maintenanceState, daysBetween } from '../calculations';
import { planningPhaseTwo } from './planning-phase-two';
import { getCashFlowForecast } from './cash-flow';
import { calculateNetWorth } from './net-worth';
import { auditFinancialData, type AuditIssue } from './financial-audit';
import { shiftPeriod } from './month-close';
import { categorize, safeRule } from './import/categorization-rules';
export type AlertSource =
  | 'budget'
  | 'debt'
  | 'investment'
  | 'planning'
  | 'forecast'
  | 'asset'
  | 'maintenance'
  | 'import'
  | 'reporting'
  | 'reserve'
  | 'work'
  | 'system';
export type FinancialAlert = {
  id: string;
  type: string;
  severity: 'info' | 'attention' | 'important';
  title: string;
  description: string;
  source: AlertSource;
  sourceId?: string;
  date?: string;
  action: { label: string; route: string };
  auditId?: string;
};
export type AlertContext = {
  planning?: ReturnType<typeof planningPhaseTwo>;
  forecast?: ReturnType<typeof getCashFlowForecast>;
  wealth?: ReturnType<typeof calculateNetWorth>;
  audit?: AuditIssue[];
  stalePeriods?: string[];
  pendingImportCount?: number;
  storageUsage?: { bytes: number; quota: number };
  persistenceFailed?: boolean;
  backupFailed?: boolean;
  syncConflict?: boolean;
  appError?: boolean;
};
export const alertArea = (source: AlertSource) =>
  ({
    budget: 'Gastos',
    debt: 'Dívidas',
    investment: 'Investimentos',
    planning: 'Planejamento',
    forecast: 'Planejamento',
    asset: 'Patrimônio',
    maintenance: 'Moto',
    import: 'Sistema',
    reporting: 'Planejamento',
    reserve: 'Planejamento',
    work: 'Planejamento',
    system: 'Sistema',
  })[source];
/** Conditions explain recorded data; thresholds are disclosed, never recommendations. */
export function deriveAlerts(
  d: Data,
  at: string,
  context: AlertContext = {},
): FinancialAlert[] {
  const planning = context.planning || planningPhaseTwo(d, at),
    forecast = context.forecast || getCashFlowForecast(d, at, 30),
    wealth = context.wealth || calculateNetWorth(d, at);
  const alerts = new Map<string, FinancialAlert>();
  const add = (
    source: AlertSource,
    sourceId: string,
    type: string,
    severity: FinancialAlert['severity'],
    title: string,
    description: string,
    route: string,
    date?: string,
  ) => {
    const id = `${source}:${sourceId}:${type}`;
    alerts.set(id, {
      id,
      source,
      sourceId,
      type,
      severity,
      title,
      description,
      action: { label: `Abrir ${route}`, route },
      ...(date ? { date } : {}),
    });
  };
  for (const b of planning.budget.rows) {
    const type =
      b.status !== 'normal'
        ? b.status
        : b.overProjection
          ? 'projected'
          : b.fastPace
            ? 'pace'
            : '';
    if (type)
      add(
        'budget',
        `${b.id}:${at.slice(0, 7)}`,
        type,
        'attention',
        `Orçamento: ${b.category}`,
        `${money(b.actualCents / 100)} de ${money(b.limitCents / 100)}. ${b.status === 'over_budget' ? 'Limite ultrapassado.' : b.overProjection ? 'Projeção acima do limite; é uma estimativa.' : b.fastPace ? 'Consumo percentual acima da parcela do mês transcorrida.' : 'Faixa de atenção configurada atingida.'}`,
        'Gastos',
      );
  }
  // Index linked rows before invoking existing calculation helpers.
  const payments = new Map<string, Data['payments']>();
  for (const p of d.payments) {
    const key = String(p.debtId);
    if (!payments.has(key)) payments.set(key, []);
    payments.get(key)!.push(p);
  }
  for (const r of d.debts) {
    const state = debtState(
      { ...d, payments: payments.get(r.id) || [] },
      r,
      at,
    );
    if (
      state.balance <= 0 ||
      state.status === 'quitada' ||
      !validDate(String(state.due))
    )
      continue;
    const days = daysBetween(at, String(state.due));
    if (days <= num(d.settings.nearDays))
      add(
        'debt',
        r.id,
        days < 0 ? 'overdue' : 'due',
        'attention',
        `${r.name}: ${days < 0 ? 'vencimento atrasado' : 'vencimento próximo'}`,
        `${state.remaining} parcelas restantes · saldo ${money(state.balance)}. Confira os pagamentos registrados.`,
        'Dívidas',
        String(state.due),
      );
  }
  const t = planning.target;
  if (t.enabled && (t.remainingDays === 0 || t.aboveLimitCents > 0))
    add(
      'planning',
      'target',
      t.remainingDays === 0 ? 'no-days' : 'daily-limit',
      'attention',
      'Revise a agenda da meta',
      t.remainingDays === 0
        ? 'Não há dias de trabalho restantes na agenda configurada.'
        : `Meta diária excede seu limite confortável em ${money(t.aboveLimitCents / 100)}.`,
      'Planejamento',
    );
  if (!forecast.complete)
    add(
      'forecast',
      '30-days',
      'partial',
      'info',
      'Fluxo dos próximos 30 dias é parcial',
      'Há valores ou datas desconhecidos; não foram substituídos por zero.',
      'Planejamento',
    );
  const firstNegative = forecast.days.find(
    (day) => day.balance !== null && day.balance < 0,
  );
  if (
    t.enabled &&
    t.changeFromBaselineCents !== null &&
    t.changeFromBaselineCents > 0 &&
    t.aboveLimitCents === 0
  )
    add(
      'planning',
      'target',
      'higher',
      'info',
      'Meta diária acima do ritmo inicial',
      `A meta ideal diária está ${money(t.changeFromBaselineCents / 100)} acima da média da agenda inicial. A comparação usa a agenda configurada.`,
      'Planejamento',
    );
  if (firstNegative)
    add(
      'forecast',
      '30-days',
      'negative',
      'attention',
      'Caixa negativo projetado',
      `Primeiro dia com saldo negativo no cenário: ${firstNegative.date}. Projeção, não saldo realizado.`,
      'Planejamento',
      firstNegative.date,
    );
  for (const event of forecast.events)
    if (event.overdue && event.source === 'recurrences')
      add(
        'planning',
        event.id,
        'overdue',
        'attention',
        `${event.name}: ocorrência pendente`,
        'A data passou e a ocorrência ainda não foi conferida.',
        'Planejamento',
        event.originalDate,
      );
  const reserve = planning.reserve;
  if (reserve.missingCents !== null && reserve.missingCents > 0)
    add(
      'reserve',
      'goal',
      'below',
      'attention',
      'Reserva abaixo da meta',
      `Faltam ${money(reserve.missingCents / 100)} para os meses de cobertura configurados.`,
      'Planejamento',
    );
  if (reserve.unknownLiquidityCents > 0)
    add(
      'reserve',
      'liquidity',
      'unknown',
      'info',
      'Liquidez da reserva incompleta',
      `${money(reserve.unknownLiquidityCents / 100)} sem disponibilidade informada; não presumimos resgate imediato.`,
      'Planejamento',
    );
  const closed = d.reporting.closures
    .filter((c) => c.status === 'closed')
    .sort((a, b) => b.period.localeCompare(a.period));
  const last = closed[0]?.revisions.at(-1);
  if (
    last &&
    last.reserveSummary.after !== null &&
    reserve.coverage !== null &&
    reserve.coverage < last.reserveSummary.after
  )
    add(
      'reserve',
      'coverage',
      'fell',
      'attention',
      'Cobertura da reserva diminuiu',
      'A cobertura atual é menor que a registrada no último fechamento; despesas e composição podem ter mudado.',
      'Planejamento',
    );
  if (
    reserve.targetCents !== null &&
    reserve.totalCents >= reserve.targetCents &&
    reserve.immediateCents < reserve.targetCents
  )
    add(
      'reserve',
      'liquidity',
      'restricted',
      'attention',
      'Meta sem disponibilidade imediata integral',
      'O total atende à meta, mas parte não foi identificada como imediatamente disponível.',
      'Planejamento',
    );
  for (const r of d.investments) {
    const missing: string[] = [];
    if (!r.liquidity || r.liquidity === 'não informado')
      missing.push('liquidez');
    if (!r.issuer) missing.push('emissor');
    if (
      ['CDB', 'LCI', 'LCA', 'Poupança', 'Conta remunerada'].includes(
        String(r.category),
      ) &&
      (!r.fgcStatus || r.fgcStatus === 'não informado')
    )
      missing.push('cobertura FGC confirmada');
    if (r.annualFeePercent === null || r.annualFeePercent === '')
      missing.push('custos');
    const fixed = [
      'CDB',
      'LCI',
      'LCA',
      'renda fixa',
      'Tesouro Prefixado',
      'Tesouro IPCA+',
      'Conta remunerada',
    ].includes(String(r.category));
    if (
      fixed &&
      (r.rateType === 'Pós-fixado'
        ? typeof r.indexerPercent !== 'number'
        : typeof r.yield !== 'number')
    )
      missing.push('taxa do produto');
    if (missing.length)
      add(
        'investment',
        r.id,
        'metadata',
        'info',
        `${r.name}: dados incompletos`,
        `Não informado: ${missing.join(', ')}. Isso limita a análise; não é recomendação de investimento.`,
        'Investimentos',
      );
    if (
      validDate(String(r.maturity)) &&
      daysBetween(at, String(r.maturity)) >= 0 &&
      daysBetween(at, String(r.maturity)) <= 30
    )
      add(
        'investment',
        r.id,
        'maturity',
        'attention',
        `${r.name}: vencimento próximo`,
        'Vencimento nos próximos 30 dias; confira as condições do produto.',
        'Investimentos',
        String(r.maturity),
      );
  }
  const issuers = new Map<string, number>();
  for (const r of d.investments)
    if (r.issuer)
      issuers.set(
        String(r.issuer),
        (issuers.get(String(r.issuer)) || 0) +
          Math.max(0, wealth.positions.investments[r.id] || 0),
      );
  for (const [issuer, cents] of issuers)
    if (wealth.investmentsCents > 0 && cents / wealth.investmentsCents > 0.5)
      add(
        'investment',
        issuer,
        'concentration',
        'info',
        'Concentração por emissor',
        `${issuer} representa mais de 50% do saldo registrado. Referência descritiva, não recomendação.`,
        'Investimentos',
      );
  for (const v of wealth.assets)
    if (
      v.current &&
      (v.valueCents === null || (v.date && daysBetween(v.date, at) > 365))
    )
      add(
        'asset',
        v.asset.id,
        v.valueCents === null ? 'missing' : 'old',
        v.valueCents === null ? 'info' : 'attention',
        `${v.asset.name}: avaliação ${v.valueCents === null ? 'ausente' : 'antiga'}`,
        v.valueCents === null
          ? 'O patrimônio está parcial; valor desconhecido não é zero.'
          : 'A última avaliação tem mais de 365 dias. Confira se ainda representa o bem.',
        'Patrimônio',
      );
  for (const r of d.maintenance) {
    const state = maintenanceState(d, r, at);
    if (
      r.value === null &&
      state.status !== 'não configurada' &&
      state.status !== 'concluída'
    )
      add(
        'maintenance',
        r.id,
        'unknown-cost',
        'info',
        `${r.name}: custo não informado`,
        'A manutenção tem prazo, mas seu valor previsto é desconhecido. O fluxo pode estar parcial.',
        'Manutenção',
      );
    if (state.status === 'atrasada' || state.status === 'próxima')
      add(
        'maintenance',
        r.id,
        state.status,
        'attention',
        `${r.name}: ${state.status}`,
        state.kmLeft === null
          ? 'Confira o prazo registrado.'
          : `${Math.abs(state.kmLeft)} km ${state.kmLeft < 0 ? 'além do prazo' : 'restantes'}.`,
        'Manutenção',
        state.nextDate || undefined,
      );
  }
  const rules = d.imports.rules.filter((r) => {
    try {
      safeRule(r);
      return true;
    } catch {
      return false;
    }
  });
  const descriptions = new Set(
    d.imports.links.map((l) => l.transaction.description),
  );
  if ([...descriptions].some((text) => categorize(text, rules).conflict))
    add(
      'import',
      'rules',
      'conflict',
      'attention',
      'Regras de categorização conflitantes',
      'Uma descrição do histórico recebe categorias diferentes. Revise as regras antes de importar novamente.',
      'Importar',
    );
  if (context.pendingImportCount)
    add(
      'import',
      'preview',
      'pending',
      'attention',
      'Importação aguardando revisão',
      `${context.pendingImportCount} linhas ainda precisam de confirmação.`,
      'Importar',
    );
  for (const s of d.imports.sessions)
    if (s.invalidCount > 0)
      add(
        'import',
        s.id,
        'partial',
        'info',
        'Importação com linhas inválidas',
        `${s.fileName}: ${s.invalidCount} linhas não foram importadas. Confira o arquivo original.`,
        'Importar',
        s.createdAt.slice(0, 10),
      );
  const previous = shiftPeriod(at.slice(0, 7), -1);
  if (!closed.some((c) => c.period === previous))
    add(
      'reporting',
      previous,
      'not-closed',
      'info',
      'Mês anterior ainda não fechado',
      'O fechamento é opcional e preserva um retrato para comparação.',
      'Relatórios',
    );
  if (last && last.dataCompleteness !== 'complete')
    add(
      'reporting',
      last.period,
      'partial',
      'info',
      'Último fechamento com dados parciais',
      'Abra o relatório para conhecer os valores estimados ou indisponíveis.',
      'Relatórios',
    );
  for (const period of context.stalePeriods || [])
    add(
      'reporting',
      period,
      'stale',
      'attention',
      'Fechamento com alterações posteriores',
      `${period}: os dados de origem mudaram. Revise antes de gerar outra revisão.`,
      'Relatórios',
    );
  const usage = context.storageUsage;
  if (context.appError)
    add(
      'system',
      'diagnostic',
      'active',
      'attention',
      'Diagnóstico pendente no aplicativo',
      'Há uma mensagem de erro ativa na interface. Confira o aviso exibido antes de repetir a operação.',
      'Configurações',
    );
  if (usage && usage.quota > 0 && usage.bytes / usage.quota >= 0.9)
    add(
      'system',
      'storage',
      'quota',
      'attention',
      'Armazenamento próximo da quota conhecida',
      'Uso de pelo menos 90% da quota da origem informada pelo navegador (inclui caches; não é a quota específica do localStorage). Confira os backups em Configurações.',
      'Configurações',
    );
  for (const [condition, id, title] of [
    [context.persistenceFailed, 'persistence', 'Falha ao salvar dados'],
    [context.backupFailed, 'backup', 'Falha ao gerar backup'],
    [context.syncConflict, 'sync', 'Conflito de versões pendente'],
  ] as const)
    if (condition)
      add(
        'system',
        id,
        'failure',
        'important',
        title,
        'Uma falha foi informada pelo aplicativo; confira o diagnóstico antes de continuar.',
        'Configurações',
      );
  for (const issue of context.audit ||
    auditFinancialData(d, at, forecast.events))
    if (issue.severity === 'error') {
      const id = `audit:${issue.id}`;
      alerts.set(id, {
        id,
        type: 'audit',
        source: 'system',
        sourceId: issue.sourceId,
        auditId: issue.id,
        severity: 'important',
        title: issue.title,
        description: issue.description,
        action: { label: 'Abrir Auditoria', route: 'Auditoria' },
      });
    }
  const order = { important: 0, attention: 1, info: 2 };
  return [...alerts.values()].sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      (a.date || '9999').localeCompare(b.date || '9999') ||
      a.id.localeCompare(b.id),
  );
}
