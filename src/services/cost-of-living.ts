import { type Data, emptyRow, num } from '../model';
import { targets } from '../calculations';
import { workExpenseAmount } from '../expense-allocation';
import { categoryKey, expenseGroup, median, monthContext } from './budget';
import { toCents } from './money-codec';
import { inflationBetweenMonths } from './inflation-indicators';
import type { InflationHistory } from './inflation-indicators';
import { getCashFlowForecast } from './cash-flow';
import { recurrenceAt } from './recurrences';

export const planningPreferences = (d: Data) =>
  d.planningSettings[0] || emptyRow('planningSettings');
export function calculateCostOfLiving(
  d: Data,
  at: string,
  inflation?: InflationHistory,
  forecast = getCashFlowForecast(
    d,
    at,
    monthContext(at).days - monthContext(at).day,
  ),
) {
  const config = planningPreferences(d),
    ctx = monthContext(at),
    window = Number(config.historyMonths) || 6;
  const first = new Date(at + 'T12:00:00Z');
  first.setUTCDate(1);
  first.setUTCMonth(first.getUTCMonth() - window);
  const levels = new Map(
    d.categoryPolicies.map((r) => [categoryKey(r.category), String(r.level)]),
  );
  const months = new Map<
    string,
    {
      essential: number;
      normal: number;
      discretionary: number;
      unclassified: number;
    }
  >();
  for (const row of [...d.expenses, ...d.services]) {
    const date = String(row.date);
    if (date < first.toISOString().slice(0, 10) || date > at) continue;
    const month = date.slice(0, 7),
      key = categoryKey(row.category || 'manutenção');
    if (!months.has(month))
      months.set(month, {
        essential: 0,
        normal: 0,
        discretionary: 0,
        unclassified: 0,
      });
    const bucket = months.get(month)!;
    const cents = Math.max(
      0,
      toCents(num(row.amount)) - toCents(workExpenseAmount(row)),
    );
    const level =
      levels.get(key) ||
      (row.essentiality === 'essencial'
        ? 'essencial'
        : row.essentiality === 'não essencial'
          ? 'discricionária'
          : 'não classificada');
    if (level === 'essencial') bucket.essential += cents;
    else if (level === 'discricionária') bucket.discretionary += cents;
    else {
      bucket.normal += cents;
      if (level === 'não classificada') bucket.unclassified += cents;
    }
  }
  const history = [...months.entries()].filter(([month]) => month < ctx.month);
  const sample = history.length ? history : [...months.entries()];
  const base = targets(d, at),
    paidDebt = d.payments
      .filter(
        (r) => String(r.date).startsWith(ctx.month) && String(r.date) <= at,
      )
      .reduce((n, r) => n + toCents(num(r.amount)), 0);
  const essential = median(sample.map(([, r]) => r.essential));
  const rules = new Map(d.recurrences.map((r) => [r.id, r])),
    expenses = new Map(d.expenses.map((r) => [r.id, r]));
  let futureEssential = 0,
    futureDebt = 0,
    futureUnclassified = false;
  const futureExpenses = d.expenses.filter(
    (r) => String(r.date).startsWith(ctx.month) && String(r.date) > at,
  );
  const futureGroups = new Set(
    futureExpenses.map((r) => expenseGroup(r, ctx.month)),
  );
  for (const row of futureExpenses) {
    const level =
      levels.get(categoryKey(row.category)) ||
      (row.essentiality === 'essencial' ? 'essencial' : undefined);
    if (!level) futureUnclassified = true;
    if (level === 'essencial')
      futureEssential += Math.max(
        0,
        toCents(num(row.amount)) - toCents(workExpenseAmount(row)),
      );
  }
  for (const event of forecast.events) {
    if (
      event.status === 'realizado' ||
      event.direction !== 'saída' ||
      event.impact !== 'caixa'
    )
      continue;
    const rule = rules.get(event.sourceId),
      source =
        event.source === 'recurrences' && rule
          ? recurrenceAt(rule, event.originalDate)
          : event.source === 'expenses'
            ? expenses.get(event.sourceId)
            : undefined;
    if (
      event.source === 'expenses' &&
      source &&
      futureGroups.has(expenseGroup(source, event.originalDate.slice(0, 7)))
    )
      continue;
    if (event.source === 'debts' || source?.kind === 'dívida') {
      if (event.amount !== null) futureDebt += toCents(event.amount);
      continue;
    }
    if (
      event.source !== 'expenses' &&
      event.source !== 'maintenance' &&
      !['despesa', 'manutenção'].includes(String(source?.kind))
    )
      continue;
    const key = categoryKey(
      event.source === 'maintenance' || source?.kind === 'manutenção'
        ? 'manutenção'
        : source?.category,
    );
    const level =
      levels.get(key) ||
      (source?.essentiality === 'essencial' ? 'essencial' : undefined);
    if (!level) futureUnclassified = true;
    if (level === 'essencial' && event.amount !== null)
      futureEssential += toCents(event.amount);
  }
  const minimumCents =
    Math.max(
      essential,
      (months.get(ctx.month)?.essential || 0) + futureEssential,
      toCents(num(d.settings.essential)),
    ) +
    paidDebt +
    Math.max(futureDebt, toCents(base.breakdown.mandatoryDebtPayments));
  const normalCents = minimumCents + median(sample.map(([, r]) => r.normal));
  const comfortableCents =
    normalCents +
    median(sample.map(([, r]) => r.discretionary)) +
    toCents(base.breakdown.activePlanContributions) +
    Math.max(
      toCents(base.plannedInvestmentGoal),
      num(config.emergencyContributionCents),
    ) +
    num(config.comfortExtraCents);
  const latest = history.sort(([a], [b]) => a.localeCompare(b)).slice(-2);
  const total = (r: (typeof sample)[number][1]) =>
    r.essential + r.normal + r.discretionary;
  const nextMonth = latest.length
    ? new Date(latest[0][0] + '-01T12:00:00Z')
    : null;
  if (nextMonth) nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const observed =
    latest.length === 2 && inflation && nextMonth
      ? inflationBetweenMonths(
          inflation.months,
          nextMonth.toISOString().slice(0, 7),
          latest[1][0],
        )
      : null;
  const nominalChange =
    latest.length === 2 && total(latest[0][1]) > 0
      ? total(latest[1][1]) / total(latest[0][1]) - 1
      : null;
  return {
    minimumCents,
    normalCents,
    comfortableCents,
    samples: history.length,
    window,
    partial:
      history.length < 3 ||
      !forecast.complete ||
      futureUnclassified ||
      sample.some(([, r]) => r.unclassified > 0),
    dailyMinimumCents: Math.round(minimumCents / ctx.days),
    dailyNormalCents: Math.round(normalCents / ctx.days),
    weeklyNormalCents: Math.round((normalCents * 12) / 52),
    yearlyNormalCents: normalCents * 12,
    nominalChange,
    inflation: observed,
    realChange:
      nominalChange !== null && observed !== null
        ? (1 + nominalChange) / (1 + observed) - 1
        : null,
  };
}
