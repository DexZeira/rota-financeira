import { addMonths, daysBetween } from '../../calculations';
import type { Transaction } from './types';
export function detectSubscriptions(transactions: Transaction[], at: string) {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.direction !== 'debit') continue;
    const key = t.accountLabel + ':' + t.normalizedDescription;
    const group = groups.get(key) ?? [];
    group.push(t);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 3) return [];
    const last = sorted.slice(-3);
    const gaps = [
      daysBetween(last[0].date, last[1].date),
      daysBetween(last[1].date, last[2].date),
    ];
    if (gaps.some((g) => g < 25 || g > 35)) return [];
    const values = last.map((t) => t.amountCents),
      mean = Math.round(values.reduce((a, b) => a + b, 0) / 3);
    if (Math.max(...values) - Math.min(...values) > Math.max(500, mean * 0.2))
      return [];
    const name = last[2].description,
      subscription = /\b(netflix|spotify|disney|assinatura|prime video)\b/.test(
        last[2].normalizedDescription,
      );
    return [
      {
        key: group[0].accountLabel + ':' + last[2].normalizedDescription,
        name,
        category: subscription ? 'Possível assinatura' : 'Gasto recorrente',
        averageCents: mean,
        annualCents: mean * 12,
        lastDate: last[2].date,
        nextDate: addMonths(last[2].date, 1),
        inactive: daysBetween(last[2].date, at) > 75,
        increaseCents: Math.max(0, values[2] - values[1]),
        previousCents: values[1],
      },
    ];
  });
}
