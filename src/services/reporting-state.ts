export type Completeness = 'complete' | 'partial' | 'insufficient';
export type MonthlyFinancialSnapshot = {
  period: string;
  closedAt: string;
  generatedAt: string;
  revision: number;
  snapshotRevision: number;
  sourceVersion: string;
  sourceSignature: string;
  through: string;
  incomeCents: number;
  workIncomeCents: number;
  otherIncomeCents: number;
  expenseCents: number;
  maintenanceCents: number;
  debtPaymentsCents: number;
  investmentContributionsCents: number;
  investmentWithdrawalsCents: number;
  investmentReturnCents: number;
  openingCashCents: number;
  closingCashCents: number;
  netCashFlowCents: number;
  openingNetWorthCents: number;
  grossAssetsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
  realNetWorthCents: number | null;
  inflationRate: number | null;
  categories: Record<string, number>;
  expenseGroups: Record<string, number>;
  debtPrincipalReductionCents: number | null;
  debtInterestCents: number | null;
  budgetSummary: {
    category: string;
    limitCents: number;
    actualCents: number;
    status: string;
  }[];
  reserveSummary: {
    before: number | null;
    after: number | null;
    beforeCents: number;
    afterCents: number;
  };
  workSummary: {
    targetCents: number | null;
    realizedCents: number;
    days: number;
    dailyCents: number | null;
    percent: number | null;
  };
  bridge: { label: string; amountCents: number }[];
  unexplainedCents: number;
  subscriptionCents: number;
  recurringCommitmentsCents: number;
  importedCount: number;
  dataCompleteness: Completeness;
  warnings: string[];
};
export type MonthlyClosure = {
  period: string;
  status: 'closed' | 'reopened';
  reopenedAt: string | null;
  regeneratedAt: string | null;
  revisions: MonthlyFinancialSnapshot[];
};
export type ReportingState = { closures: MonthlyClosure[] };
export const emptyReporting = (): ReportingState => ({ closures: [] });
export const validPeriod = (p: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(p) &&
  Number(p.slice(0, 4)) >= 1900 &&
  Number(p.slice(0, 4)) <= 9998;
const fail = () => {
  throw Error('Fechamento mensal inválido ou incompatível.');
};
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail();
  return v as Record<string, unknown>;
}
function text(v: unknown): asserts v is string {
  if (typeof v !== 'string' || v.length > 2000) fail();
}
function integer(v: unknown) {
  if (!Number.isSafeInteger(v)) fail();
}
function nullable(v: unknown) {
  if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) fail();
}
function timestamp(v: unknown) {
  text(v);
  if (!/^\d{4}-\d\d-\d\dT/.test(v) || !Number.isFinite(Date.parse(v))) fail();
}
function map(v: unknown) {
  for (const [key, value] of Object.entries(object(v))) {
    text(key);
    integer(value);
  }
}
const centsFields = [
  'incomeCents',
  'workIncomeCents',
  'otherIncomeCents',
  'expenseCents',
  'maintenanceCents',
  'debtPaymentsCents',
  'investmentContributionsCents',
  'investmentWithdrawalsCents',
  'investmentReturnCents',
  'openingCashCents',
  'closingCashCents',
  'netCashFlowCents',
  'openingNetWorthCents',
  'grossAssetsCents',
  'liabilitiesCents',
  'netWorthCents',
  'unexplainedCents',
  'subscriptionCents',
  'recurringCommitmentsCents',
  'importedCount',
] as const;
export function validateReporting(value: unknown): ReportingState {
  const state = object(value);
  if (!Array.isArray(state.closures) || state.closures.length > 1200)
    return fail();
  const seen = new Set<string>();
  for (const item of state.closures) {
    const c = object(item);
    text(c.period);
    if (
      !validPeriod(c.period) ||
      seen.has(c.period) ||
      !['closed', 'reopened'].includes(String(c.status))
    )
      fail();
    seen.add(c.period);
    for (const key of ['reopenedAt', 'regeneratedAt'])
      if (c[key] !== null) timestamp(c[key]);
    if (c.status === 'reopened' && c.reopenedAt === null) fail();
    if (
      !Array.isArray(c.revisions) ||
      !c.revisions.length ||
      c.revisions.length > 100
    )
      return fail();
    for (const [index, itemSnapshot] of c.revisions.entries()) {
      const s = object(itemSnapshot);
      if (
        s.period !== c.period ||
        s.revision !== index + 1 ||
        s.snapshotRevision !== index + 1 ||
        s.sourceVersion !== 'reporting-1'
      )
        fail();
      timestamp(s.closedAt);
      timestamp(s.generatedAt);
      text(s.sourceSignature);
      text(s.through);
      const end = new Date(
        Date.UTC(
          Number(c.period.slice(0, 4)),
          Number(c.period.slice(5)),
          0,
          12,
        ),
      )
        .toISOString()
        .slice(0, 10);
      if (s.through !== end || !/^[a-f0-9]{64}$/.test(s.sourceSignature))
        fail();
      for (const key of centsFields) integer(s[key]);
      for (const key of [
        'realNetWorthCents',
        'debtPrincipalReductionCents',
        'debtInterestCents',
      ])
        if (s[key] !== null) integer(s[key]);
      nullable(s.inflationRate);
      if (s.inflationRate !== null && Number(s.inflationRate) <= -1) fail();
      if ((s.inflationRate === null) !== (s.realNetWorthCents === null)) fail();
      map(s.categories);
      map(s.expenseGroups);
      if (!Array.isArray(s.budgetSummary) || s.budgetSummary.length > 10000)
        return fail();
      for (const itemBudget of s.budgetSummary) {
        const b = object(itemBudget);
        text(b.category);
        text(b.status);
        integer(b.limitCents);
        integer(b.actualCents);
      }
      const r = object(s.reserveSummary);
      nullable(r.before);
      nullable(r.after);
      integer(r.beforeCents);
      integer(r.afterCents);
      const w = object(s.workSummary);
      integer(w.realizedCents);
      integer(w.days);
      nullable(w.percent);
      for (const k of ['targetCents', 'dailyCents'])
        if (w[k] !== null) integer(w[k]);
      if (!Array.isArray(s.bridge) || s.bridge.length > 30) return fail();
      for (const component of s.bridge) {
        const b = object(component);
        text(b.label);
        integer(b.amountCents);
      }
      if (
        !['complete', 'partial', 'insufficient'].includes(
          String(s.dataCompleteness),
        ) ||
        !Array.isArray(s.warnings) ||
        s.warnings.length > 100
      )
        return fail();
      s.warnings.forEach(text);
      if (
        Number(s.closingCashCents) - Number(s.openingCashCents) !==
          s.netCashFlowCents ||
        Number(s.grossAssetsCents) - Number(s.liabilitiesCents) !==
          s.netWorthCents ||
        Number(s.workIncomeCents) + Number(s.otherIncomeCents) !== s.incomeCents
      )
        fail();
      const explained = s.bridge.reduce(
        (sum: number, item: unknown) => sum + Number(object(item).amountCents),
        0,
      );
      if (
        Number(s.netWorthCents) - Number(s.openingNetWorthCents) !==
        explained + Number(s.unexplainedCents)
      )
        fail();
      if (
        Object.values(object(s.expenseGroups)).reduce(
          (sum: number, n) => sum + Number(n),
          0,
        ) !== s.expenseCents
      )
        fail();
      if (
        Object.values(object(s.categories)).reduce(
          (sum: number, n) => sum + Number(n),
          0,
        ) +
          Number(s.maintenanceCents) !==
        s.expenseCents
      )
        fail();
    }
  }
  return structuredClone(value) as ReportingState;
}
