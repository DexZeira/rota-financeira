import { type Data, num, validDate } from '../model';
import { toCents, fromCents } from './money-codec';

/** Compare completed calendar months. No quantity history exists in expenses,
 * so this is spending variation, never a price index or official personal IPCA.
 */
export function personalExpenseVariation(d: Data, at: string) {
  if (!validDate(at)) throw Error('Data de comparação inválida.');
  const year = Number(at.slice(0, 4)), month = Number(at.slice(5, 7));
  const current = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
  const previous = new Date(Date.UTC(year, month - 3, 1)).toISOString().slice(0, 7);
  const rows = d.expenses.filter((r) => [current, previous].includes(String(r.date).slice(0, 7)));
  const categories = [...new Set(rows.map((r) => String(r.category)))];
  return { current, previous, method: 'spending' as const, priceIndex: null,
    categories: categories.map((category) => {
      const forMonth = (period: string) => rows.filter((r) => r.category === category && String(r.date).startsWith(period));
      const before = forMonth(previous), after = forMonth(current);
      const cents = (list: typeof rows) => list.reduce((sum, r) => sum + toCents(num(r.amount)), 0);
      const base = cents(before), now = cents(after);
      return { category, before: fromCents(base), after: fromCents(now), change: before.length && after.length && base > 0 ? now / base - 1 : null, status: 'estimated' as const };
    }) };
}
