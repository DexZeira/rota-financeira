export type FinancialAnswerSource = {
  label: string;
  date: string;
  status: 'registrado' | 'estimado' | 'snapshot';
  revision?: number;
};
export type FinancialAnswer<T> = {
  status: 'available' | 'partial' | 'unavailable';
  data?: T;
  summary: string;
  assumptions: string[];
  warnings: string[];
  sources: FinancialAnswerSource[];
};
export type AnswerMetric = {
  label: string;
  value: number | string | null;
  unit: 'BRL' | 'meses' | 'R$/km' | 'texto' | 'dias';
};
export type AnswerData = { metrics: AnswerMetric[]; items?: string[] };
export type QueryPeriod = 'current' | 'previous' | 'last-closed' | 'year';
export const queryNames = [
  'getCurrentSituation',
  'getMonthlyExpenses',
  'getIncomeSummary',
  'getDebtSummary',
  'getInvestmentSummary',
  'getPassiveIncomeSummary',
  'getNetWorth',
  'getCashFlowForecast',
  'getBudgetSummary',
  'getReserveSummary',
  'getWorkTarget',
  'getCostOfLiving',
  'getMotorcycleCost',
  'getGoalForecast',
  'getUpcomingCommitments',
  'getUpcomingMaturities',
  'getActiveAlerts',
  'getAuditIssues',
  'getRecentChanges',
  'getMonthlyReport',
] as const;
export type FinancialQueryName = (typeof queryNames)[number];
