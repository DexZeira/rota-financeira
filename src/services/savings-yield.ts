export type SavingsYieldResult = { status: 'estimated' | 'actual' | 'unavailable'; anniversaryDate: string; minimumBalance?: number; trPercent?: number; additionalRatePercent?: number; totalRatePercent?: number; estimatedYieldCents?: number; sourceDates: { tr?: string; selicTarget?: string } };
export type SavingsPeriod = { start: string; end: string; complete: boolean };
export function normalizeAnniversaryDay(day: number): number { return day >= 29 ? 1 : Math.max(1, Math.min(28, Math.trunc(day))); }
export function savingsPeriod(anniversaryDay: number, referenceDate = new Date()): SavingsPeriod {
  const day = normalizeAnniversaryDay(anniversaryDay), year = referenceDate.getUTCFullYear(), month = referenceDate.getUTCMonth();
  // No próprio dia do aniversário, o intervalo anterior acaba de fechar.
  const startMonth = referenceDate.getUTCDate() > day ? month : month - 1;
  const startDate = new Date(Date.UTC(year, startMonth, day));
  const nextDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, day));
  const endDate = new Date(nextDate.getTime() - 86400000);
  return { start: startDate.toISOString().slice(0, 10), end: endDate.toISOString().slice(0, 10), complete: referenceDate.getTime() >= nextDate.getTime() };
}
export function reconstructSavingsMinimumBalance(startBalance: number, movements: Array<{ date: string; amount: number; kind: string; timestamp?: string; id?: string }>, periodStart: string, periodEnd: string): number | undefined {
  if (!Number.isFinite(startBalance) || startBalance < 0) return undefined;
  const ordered = movements.filter((m) => m.date >= periodStart && m.date <= periodEnd && Number.isFinite(m.amount)).sort((a, b) => a.date.localeCompare(b.date) || String(a.timestamp || '').localeCompare(String(b.timestamp || '')) || String(a.id || '').localeCompare(String(b.id || '')));
  let balance = startBalance, minimum = balance;
  for (const movement of ordered) { balance += ['retirada', 'perda'].includes(movement.kind) ? -Math.abs(movement.amount) : Math.abs(movement.amount); if (balance < 0) return undefined; minimum = Math.min(minimum, balance); }
  return minimum;
}
export function monthlyAdditionalRate(targetSelicAnnualPercent: number): number | undefined {
  if (!Number.isFinite(targetSelicAnnualPercent) || targetSelicAnnualPercent < 0) return undefined;
  if (targetSelicAnnualPercent > 8.5) return 0.5;
  return (Math.pow(1 + (targetSelicAnnualPercent * 0.7) / 100, 1 / 12) - 1) * 100;
}
export function estimateSavingsYield(input: { balance: number; anniversaryDay?: number; trPercent?: number; targetSelicAnnualPercent?: number; anniversaryDate?: string; trDate?: string; selicDate?: string; actualMinimumBalance?: number; periodComplete?: boolean }): SavingsYieldResult {
  if (!Number.isFinite(input.balance) || input.balance < 0 || input.anniversaryDay === undefined || input.trPercent === undefined || input.targetSelicAnnualPercent === undefined) return { status: 'unavailable', anniversaryDate: input.anniversaryDate || '', sourceDates: {} };
  const additional = monthlyAdditionalRate(input.targetSelicAnnualPercent); if (additional === undefined) return { status: 'unavailable', anniversaryDate: input.anniversaryDate || '', sourceDates: {} };
  const minimum = input.actualMinimumBalance ?? input.balance;
  const totalRate = ((1 + input.trPercent / 100) * (1 + additional / 100) - 1) * 100;
  return { status: input.actualMinimumBalance === undefined || input.periodComplete === false ? 'estimated' : 'actual', anniversaryDate: input.anniversaryDate || '', minimumBalance: minimum, trPercent: input.trPercent, additionalRatePercent: additional, totalRatePercent: totalRate, estimatedYieldCents: Math.round(minimum * totalRate), sourceDates: { tr: input.trDate, selicTarget: input.selicDate } };
}
