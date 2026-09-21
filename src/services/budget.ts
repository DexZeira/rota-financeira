import { type Data, type Row, num, validDate } from '../model';
import { getCashFlowForecast } from './cash-flow';
import { recurrenceAt } from './recurrences';
import { toCents } from './money-codec';

export const categoryKey = (value: string | number | null | undefined) =>
  String(value || 'outras')
    .trim()
    .toLocaleLowerCase('pt-BR');
export const expenseGroup = (row: Row, month: string) =>
  [row.name, row.category, row.recurrence, month].map(categoryKey).join('|');
export function monthContext(at: string) {
  if (!validDate(at)) throw Error('Data inválida.');
  const year = Number(at.slice(0, 4)),
    month = Number(at.slice(5, 7));
  const days = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return {
    month: at.slice(0, 7),
    day: Number(at.slice(8)),
    days,
    end: at.slice(0, 7) + '-' + days,
  };
}
export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return Math.round(
    sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2,
  );
}
export type Spending = {
  category: string;
  actualCents: number;
  variableCents: number;
  knownCents: number;
  estimatedCents: number;
  recurringEstimateCents: number;
  projectedCents: number | null;
  reliable: boolean;
  samples: number;
  unknown: boolean;
  seasonal: boolean;
};
export function projectSpending(
  d: Data,
  at: string,
  forecast = getCashFlowForecast(
    d,
    at,
    monthContext(at).days - monthContext(at).day,
  ),
) {
  const ctx = monthContext(at),
    categories = new Map<string, Spending>(),
    history = new Map<string, Map<string, number>>(),
    seasonal = new Map<string, Map<string, number>>();
  const get = (category: Row[string] | undefined) => {
    const key = categoryKey(category);
    if (!categories.has(key))
      categories.set(key, {
        category: key,
        actualCents: 0,
        variableCents: 0,
        knownCents: 0,
        estimatedCents: 0,
        recurringEstimateCents: 0,
        projectedCents: 0,
        reliable: false,
        samples: 0,
        unknown: false,
        seasonal: false,
      });
    return categories.get(key)!;
  };
  const rules = new Map(d.recurrences.map((r) => [r.id, r])),
    expenses = new Map(d.expenses.map((r) => [r.id, r]));
  const linked = new Set(
    d.forecastResolutions
      .filter((r) => r.action === 'vincular' && r.recordKind === 'expenses')
      .map((r) => r.recordId),
  );
  const futureExpenseGroups = new Set<string>();
  const first = new Date(at + 'T12:00:00Z');
  first.setUTCDate(1);
  first.setUTCMonth(first.getUTCMonth() - 3);
  for (const row of d.expenses) {
    const date = String(row.date),
      month = date.slice(0, 7),
      item = get(row.category),
      cents = toCents(num(row.amount));
    const variable = row.recurrence === 'única' && !linked.has(row.id);
    if (
      variable &&
      month < ctx.month &&
      month.slice(5) === ctx.month.slice(5)
    ) {
      if (!seasonal.has(item.category)) seasonal.set(item.category, new Map());
      const seasons = seasonal.get(item.category)!;
      seasons.set(month, (seasons.get(month) || 0) + cents);
    }
    if (month === ctx.month && date <= at) {
      item.actualCents += cents;
      if (variable) item.variableCents += cents;
    }
    if (month === ctx.month && date > at) {
      item.knownCents += cents;
      futureExpenseGroups.add(expenseGroup(row, month));
    }
    if (month < ctx.month && date >= first.toISOString().slice(0, 10)) {
      if (!history.has(item.category)) history.set(item.category, new Map());
      const months = history.get(item.category)!;
      months.set(month, (months.get(month) || 0) + (variable ? cents : 0));
    }
  }
  for (const budget of d.budgets) get(budget.category);
  for (const event of forecast.events) {
    if (
      event.status === 'realizado' ||
      event.impact !== 'caixa' ||
      event.direction !== 'saída' ||
      event.date > ctx.end
    )
      continue;
    const rule = rules.get(event.sourceId);
    const source =
      event.source === 'expenses'
        ? expenses.get(event.sourceId)
        : event.source === 'recurrences' && rule
          ? recurrenceAt(rule, event.originalDate)
          : undefined;
    if (
      !source ||
      (event.source === 'recurrences' && source.kind !== 'despesa')
    )
      continue;
    if (
      event.source === 'expenses' &&
      futureExpenseGroups.has(
        expenseGroup(source, event.originalDate.slice(0, 7)),
      )
    )
      continue;
    const item = get(source.category);
    if (event.amount === null) item.unknown = true;
    else if (event.status === 'estimado')
      item.recurringEstimateCents += toCents(event.amount);
    else item.knownCents += toCents(event.amount);
  }
  for (const item of categories.values()) {
    const samples = [...(history.get(item.category)?.entries() || [])];
    item.samples = samples.length;
    item.reliable = samples.length >= 3;
    let expectedRemaining = item.reliable
      ? median(
          samples.map(
            ([month, cents]) => cents / monthContext(month + '-01').days,
          ),
        ) *
        (ctx.days - ctx.day)
      : (item.variableCents / ctx.day) * (ctx.days - ctx.day);
    const seasons = [...(seasonal.get(item.category)?.values() || [])];
    if (item.reliable && seasons.length >= 2) {
      item.seasonal = true;
      expectedRemaining =
        (expectedRemaining +
          (median(seasons) / ctx.days) * (ctx.days - ctx.day)) /
        2;
    }
    // Known commitments cover part of statistical spending, rather than being added twice.
    item.estimatedCents = Math.max(
      0,
      Math.round(expectedRemaining) - item.knownCents,
    );
    item.projectedCents = item.unknown
      ? null
      : item.actualCents +
        item.knownCents +
        item.estimatedCents +
        item.recurringEstimateCents;
  }
  return {
    categories: [...categories.values()],
    partial: !forecast.complete,
    context: ctx,
  };
}
export function calculateBudgetStatus(
  spent: number,
  limit: number,
  attention = 70,
  near = 90,
): 'normal' | 'attention' | 'near_limit' | 'over_budget' {
  if (spent > limit) return 'over_budget';
  const percent = limit > 0 ? (spent / limit) * 100 : 0;
  return percent >= near
    ? 'near_limit'
    : percent > attention
      ? 'attention'
      : 'normal';
}
export function calculateCategoryBudget(
  budget: Row,
  spending: Spending,
  elapsedPercent: number,
) {
  const limitCents = num(budget.limitCents),
    percent = limitCents > 0 ? (spending.actualCents / limitCents) * 100 : null;
  return {
    ...spending,
    id: budget.id,
    limitCents,
    remainingCents: limitCents - spending.actualCents,
    percent,
    status: calculateBudgetStatus(
      spending.actualCents,
      limitCents,
      num(budget.alertThresholdPercent),
      num(budget.nearThresholdPercent),
    ),
    fastPace: percent !== null && percent > elapsedPercent,
    overProjection:
      spending.projectedCents !== null && spending.projectedCents > limitCents,
  };
}
export function calculateBudgets(
  d: Data,
  spending: ReturnType<typeof projectSpending>,
) {
  const indexed = new Map(spending.categories.map((r) => [r.category, r]));
  const rows = d.budgets
    .filter((b) => b.enabled === 'sim')
    .map((b) =>
      calculateCategoryBudget(
        b,
        indexed.get(categoryKey(b.category))!,
        (spending.context.day / spending.context.days) * 100,
      ),
    );
  const totals = rows.reduce(
    (a, r) => ({
      limitCents: a.limitCents + r.limitCents,
      actualCents: a.actualCents + r.actualCents,
      knownCents: a.knownCents + r.knownCents,
      estimatedCents:
        a.estimatedCents + r.estimatedCents + r.recurringEstimateCents,
    }),
    { limitCents: 0, actualCents: 0, knownCents: 0, estimatedCents: 0 },
  );
  return {
    rows,
    ...totals,
    remainingCents: totals.limitCents - totals.actualCents,
    projectedCents: rows.some((r) => r.unknown)
      ? null
      : totals.actualCents + totals.knownCents + totals.estimatedCents,
    partial: spending.partial,
  };
}
