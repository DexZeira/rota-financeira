import type {
  AnswerData,
  FinancialAnswer,
  FinancialQueryName,
  QueryPeriod,
} from './financial-answer';
export const assistantQuestions = [
  ['LARGEST_EXPENSES', 'Quais são meus maiores gastos?', 'getMonthlyExpenses'],
  ['NET_WORTH_GROWTH', 'Meu patrimônio cresceu?', 'getRecentChanges'],
  ['CURRENT_SITUATION', 'Como estou financeiramente?', 'getCurrentSituation'],
  ['MONTHLY_EXPENSES', 'Quanto gastei este mês?', 'getMonthlyExpenses'],
  ['INCOME', 'Quanto recebi?', 'getIncomeSummary'],
  ['COST_OF_LIVING', 'Quanto minha vida custa?', 'getCostOfLiving'],
  ['WORK_TARGET', 'Quanto preciso trabalhar hoje?', 'getWorkTarget'],
  ['DEBT_SUMMARY', 'Quanto tenho de dívida?', 'getDebtSummary'],
  ['RESERVE', 'Como está minha reserva?', 'getReserveSummary'],
  ['INVESTMENT_SUMMARY', 'Quanto tenho investido?', 'getInvestmentSummary'],
  [
    'PASSIVE_INCOME',
    'Quanto recebi de renda passiva?',
    'getPassiveIncomeSummary',
  ],
  [
    'UPCOMING_MATURITIES',
    'Quais investimentos vencem em breve?',
    'getUpcomingMaturities',
  ],
  ['NET_WORTH', 'Como está meu patrimônio?', 'getNetWorth'],
  ['RECENT_CHANGES', 'O que mudou no último mês?', 'getRecentChanges'],
  ['ACTIVE_ALERTS', 'Tem algo importante?', 'getActiveAlerts'],
  ['MOTORCYCLE_COST', 'Qual meu custo por km?', 'getMotorcycleCost'],
  ['UPCOMING_BILLS', 'O que vence em breve?', 'getUpcomingCommitments'],
  ['FORECAST', 'Como está o caixa projetado?', 'getCashFlowForecast'],
  ['BUDGET', 'Como está meu orçamento?', 'getBudgetSummary'],
  ['GOALS', 'Como estão meus planos?', 'getGoalForecast'],
  ['AUDIT_ISSUES', 'Meus dados estão consistentes?', 'getAuditIssues'],
  ['MONTHLY_REPORT', 'Qual é o resumo do período?', 'getMonthlyReport'],
] as const satisfies readonly (readonly [string, string, FinancialQueryName])[];
export type FinancialIntent = (typeof assistantQuestions)[number][0];
export interface FinancialAssistantProvider {
  ask(
    intent: FinancialIntent,
    period: QueryPeriod,
  ): FinancialAnswer<AnswerData>;
}
/** Receives only a read-only query capability, never the user's full state. No network. */
export class DeterministicFinancialAssistant implements FinancialAssistantProvider {
  constructor(
    private readonly query: {
      answer(
        name: FinancialQueryName,
        period: QueryPeriod,
      ): FinancialAnswer<AnswerData>;
    },
  ) {}
  ask(intent: FinancialIntent, period: QueryPeriod = 'current') {
    const question = assistantQuestions.find((q) => q[0] === intent);
    if (!question) throw Error('Pergunta não suportada.');
    return this.query.answer(question[2], period);
  }
}
