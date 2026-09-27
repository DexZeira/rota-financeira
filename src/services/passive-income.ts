import { type Data, num } from '../model';
import { paidIncome, movementCosts } from './investment-ledger';
import { toCents } from './money-codec';

/** Actual cash receipts only; reinvested earnings and price changes are excluded. */
export function passiveIncome(d: Data, at: string) {
  const month = at.slice(0, 7),
    year = Number(month.slice(0, 4)),
    m = Number(month.slice(5));
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(Date.UTC(year, m - 12 + i, 1));
    return { month: date.toISOString().slice(0, 7), amountCents: 0 };
  });
  const monthly = new Map(months.map((row) => [row.month, row]));
  const assets = new Map(d.investments.map((row) => [row.id, row]));
  const byAsset = new Map<string, number>(),
    byClass = new Map<string, number>();
  for (const row of d.movements) {
    const bucket = monthly.get(String(row.date).slice(0, 7));
    if (!bucket || String(row.date) > at || !paidIncome(row)) continue;
    const amount = toCents(num(row.amount)) - movementCosts(row);
    bucket.amountCents += amount;
    const id = String(row.investmentId),
      category = String(assets.get(id)?.category || 'Não informado');
    byAsset.set(id, (byAsset.get(id) || 0) + amount);
    byClass.set(category, (byClass.get(category) || 0) + amount);
  }
  const totalCents = months.reduce((sum, row) => sum + row.amountCents, 0);
  return {
    months,
    thisMonthCents: monthly.get(month)!.amountCents,
    totalCents,
    average12Cents: Math.round(totalCents / 12),
    bestMonth: months.reduce((best, row) =>
      row.amountCents > best.amountCents ? row : best,
    ),
    byAsset,
    byClass,
  };
}
export function incomeYields(
  income12Cents: number,
  historicalCostCents: number | null,
  currentValueCents: number | null,
) {
  return {
    yieldOnCost:
      historicalCostCents !== null && historicalCostCents > 0
        ? income12Cents / historicalCostCents
        : null,
    currentYield:
      currentValueCents !== null && currentValueCents > 0
        ? income12Cents / currentValueCents
        : null,
  };
}
