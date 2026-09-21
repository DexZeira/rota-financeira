import { type Data, num } from '../model';
import { targets } from '../calculations';
import { workExpenseAmount } from '../expense-allocation';
import { addDays, recurrenceAt } from './recurrences';
import { getCashFlowForecast } from './cash-flow';
import {
  categoryKey,
  expenseGroup,
  monthContext,
  projectSpending,
} from './budget';
import { planningPreferences } from './cost-of-living';
import { toCents } from './money-codec';

export function workingDates(d: Data, at: string) {
  const config = planningPreferences(d),
    ctx = monthContext(at);
  const weekdays = new Set(String(config.workWeekdays).split(/[,\s]+/)),
    off = new Set(String(config.daysOff).split(/[,\s]+/));
  const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'],
    dates: string[] = [];
  if (config.scheduleEnabled === 'sim')
    for (let day = 1; day <= ctx.days; day++) {
      const date = `${ctx.month}-${String(day).padStart(2, '0')}`;
      if (
        weekdays.has(names[new Date(date + 'T12:00:00Z').getUTCDay()]) &&
        !off.has(date)
      )
        dates.push(date);
    }
  return dates;
}
export function calculateDynamicTarget(
  d: Data,
  at: string,
  spending = projectSpending(d, at),
  forecast = getCashFlowForecast(
    d,
    at,
    monthContext(at).days - monthContext(at).day,
  ),
) {
  const ctx = monthContext(at),
    config = planningPreferences(d),
    legacy = targets(d, at),
    b = legacy.breakdown;
  const monthRows = (rows: Data['expenses']) =>
    rows.filter(
      (r) => String(r.date).startsWith(ctx.month) && String(r.date) <= at,
    );
  const actualWorkCosts = monthRows(d.expenses).reduce(
    (sum, r) => sum + toCents(workExpenseAmount(r)),
    0,
  );
  const actualServices = monthRows(d.services).reduce(
    (sum, r) => sum + toCents(num(r.amount)),
    0,
  );
  const rules = new Map(d.recurrences.map((r) => [r.id, r]));
  const expenseById = new Map(d.expenses.map((r) => [r.id, r]));
  const professionalCategories = new Set(
    d.expenses
      .filter((r) => workExpenseAmount(r) > 0)
      .map((r) => categoryKey(r.category)),
  );
  const recurringWork = new Map<string, Data['expenses'][number]>();
  for (const row of d.expenses) {
    if (row.recurrence === 'única' || String(row.date) > at) continue;
    const key = [row.name, row.category, row.recurrence]
      .map(categoryKey)
      .join('|');
    const previous = recurringWork.get(key);
    if (!previous || String(row.date) > String(previous.date))
      recurringWork.set(key, row);
  }
  const professionalRecurringCents = [...recurringWork.values()].reduce(
    (sum, r) =>
      sum + toCents(workExpenseAmount(r) / (r.recurrence === 'anual' ? 12 : 1)),
    0,
  );
  const futureExpenses = d.expenses.filter(
    (r) => String(r.date).startsWith(ctx.month) && String(r.date) > at,
  );
  const futureExpenseGroups = new Set(
    futureExpenses.map((r) => expenseGroup(r, ctx.month)),
  );
  let professionalFutureCents = futureExpenses.reduce(
    (sum, r) => sum + toCents(workExpenseAmount(r)),
    0,
  );
  let futureDebt = 0,
    futureMaintenance = 0,
    futureInvestment = 0,
    futurePlans = 0;
  for (const event of forecast.events) {
    if (
      event.status === 'realizado' ||
      event.amount === null ||
      event.direction !== 'saída'
    )
      continue;
    const rule = rules.get(event.sourceId),
      kind =
        event.source === 'recurrences' && rule
          ? recurrenceAt(rule, event.originalDate).kind
          : '';
    if (event.source === 'debts' || kind === 'dívida')
      futureDebt += toCents(event.amount);
    if (event.source === 'maintenance' || kind === 'manutenção')
      futureMaintenance += toCents(event.amount);
    if (kind === 'aporte') futureInvestment += toCents(event.amount);
    if (event.impact === 'alocação') futurePlans += toCents(event.amount);
    const expense =
      event.source === 'expenses'
        ? expenseById.get(event.sourceId)
        : rule?.sourceKind === 'expenses'
          ? expenseById.get(String(rule.sourceId))
          : undefined;
    const replacedByFuture =
      event.source === 'expenses' &&
      expense &&
      futureExpenseGroups.has(
        expenseGroup(expense, event.originalDate.slice(0, 7)),
      );
    if (expense && !replacedByFuture && num(expense.amount) > 0)
      professionalFutureCents += Math.round(
        (toCents(event.amount) * workExpenseAmount(expense)) /
          num(expense.amount),
      );
  }
  const knownExpenses = spending.categories.reduce(
    (sum, r) =>
      sum +
      r.actualCents +
      r.knownCents +
      r.recurringEstimateCents +
      (r.reliable && !professionalCategories.has(r.category)
        ? r.estimatedCents
        : 0),
    0,
  );
  const weakEstimateCents = spending.categories.reduce(
    (sum, r) =>
      sum +
      (r.reliable && !professionalCategories.has(r.category)
        ? 0
        : r.estimatedCents),
    0,
  );
  const personalExpenses = Math.max(
    0,
    knownExpenses - actualWorkCosts - professionalFutureCents,
  );
  const recurringPersonal = Math.max(
    0,
    toCents(legacy.recurringGross) - professionalRecurringCents,
  );
  const expenseFloor =
    d.settings.expenseBaseMode === 'adicional às recorrentes'
      ? toCents(num(d.settings.essential)) + recurringPersonal
      : Math.max(toCents(num(d.settings.essential)), recurringPersonal);
  const expenses = Math.max(expenseFloor, personalExpenses);
  const debt =
    monthRows(d.payments).reduce((sum, r) => sum + toCents(num(r.amount)), 0) +
    futureDebt;
  const operating = Math.max(
    toCents(b.requiredOperatingCosts),
    actualWorkCosts +
      professionalFutureCents +
      actualServices +
      futureMaintenance,
  );
  const minimumMonthlyCents = expenses + debt + operating;
  // Existing margins cover optional goals; use the larger requirement, never add both envelopes.
  const provisions = Math.max(
    0,
    toCents(b.maintenanceProvision + b.otherMotoProvision) -
      actualServices -
      futureMaintenance,
  );
  const aportes = Math.max(
    toCents(legacy.plannedInvestmentGoal),
    toCents(legacy.investmentsPaid) + futureInvestment,
    num(config.emergencyContributionCents),
  );
  const planContributions = Math.max(
    toCents(b.activePlanContributions),
    futurePlans,
  );
  const optional = provisions + aportes + planContributions;
  const idealMonthlyCents =
    minimumMonthlyCents +
    Math.max(
      Math.round((minimumMonthlyCents * legacy.idealPercent) / 100),
      optional,
    );
  const acceleratedMonthlyCents = Math.max(
    idealMonthlyCents,
    minimumMonthlyCents +
      Math.max(
        Math.round((minimumMonthlyCents * legacy.acceleratedPercent) / 100),
        optional +
          toCents(
            b.extraDebtPayments + b.extraGoalContributions + b.extraInvestments,
          ),
      ),
  );
  const earnedBeforeCents = monthRows(d.work)
    .filter((r) => String(r.date) < at)
    .reduce((sum, r) => sum + toCents(num(r.revenue)), 0);
  const earnedTodayCents = d.work
    .filter((r) => r.date === at)
    .reduce((sum, r) => sum + toCents(num(r.revenue)), 0);
  const dates = workingDates(d, at),
    remainingDates = dates.filter((day) => day >= at),
    isWorkday = remainingDates.includes(at);
  const daily = (monthly: number) =>
    remainingDates.length
      ? Math.ceil(
          Math.max(0, monthly - earnedBeforeCents) / remainingDates.length,
        )
      : null;
  const minimumCents = daily(minimumMonthlyCents),
    idealCents = daily(idealMonthlyCents),
    acceleratedCents = daily(acceleratedMonthlyCents);
  const selected =
    d.settings.defaultTarget === 'minimum'
      ? minimumCents
      : d.settings.defaultTarget === 'accelerated'
        ? acceleratedCents
        : idealCents;
  const todayCents = isWorkday ? selected : remainingDates.length ? 0 : null;
  const maximum = num(config.maxDailyCents);
  const baseline = dates.length
    ? Math.ceil(idealMonthlyCents / dates.length)
    : null;
  const yesterday = addDays(at, -1);
  return {
    enabled: config.scheduleEnabled === 'sim',
    minimumCents,
    idealCents,
    acceleratedCents,
    todayCents,
    isWorkday,
    remainingDays: remainingDates.length,
    minimumMonthlyCents,
    idealMonthlyCents,
    acceleratedMonthlyCents,
    earnedBeforeCents,
    earnedTodayCents,
    remainingTodayCents:
      todayCents === null ? null : Math.max(0, todayCents - earnedTodayCents),
    surplusTodayCents:
      todayCents === null ? null : Math.max(0, earnedTodayCents - todayCents),
    aboveLimitCents:
      maximum > 0 && selected !== null ? Math.max(0, selected - maximum) : 0,
    changeFromBaselineCents:
      baseline !== null && idealCents !== null ? idealCents - baseline : null,
    weakScenarioDailyCents: remainingDates.length
      ? Math.ceil(weakEstimateCents / remainingDates.length)
      : null,
    partial: !forecast.complete,
    yesterday,
    components: {
      expenses,
      debt,
      operating,
      provisions,
      aportes,
      planContributions,
    },
  };
}
