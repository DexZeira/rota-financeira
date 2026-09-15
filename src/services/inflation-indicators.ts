import { cachedSource, type FinancialIndicator } from './indicator-cache';
import { FINANCIAL_SOURCES } from './financial-sources';
import { parseMarketRate } from './market-rates';
import { accumulatedInflation } from './purchasing-power';

export type InflationMonth = { month: string; percent: number };
export function parseInflationHistory(body: unknown): InflationMonth[] | undefined {
  if (!Array.isArray(body) || !body.length || body.length > 120) return undefined;
  const months = new Map<string, number>();
  for (const row of body) {
    const rate = parseMarketRate(JSON.stringify([row]), '% no mês');
    if (!rate || rate.value <= -100 || months.has(rate.date.slice(0, 7))) return undefined;
    months.set(rate.date.slice(0, 7), rate.value);
  }
  return [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, percent]) => ({ month, percent }));
}
export type InflationHistory = { months: InflationMonth[]; latest: FinancialIndicator };
export async function loadInflationHistory(fetcher: typeof fetch = fetch): Promise<InflationHistory> {
  const source = FINANCIAL_SOURCES.BCB_SGS_IPCA_MONTH;
  const result = await cachedSource('rota-ipca-monthly-v1', source.url, source.cacheTtlMs, parseInflationHistory, fetcher);
  const latest = result?.value.at(-1);
  return { months: result?.value || [], latest: { value: latest?.percent ?? null, unit: '% no mês', source: 'IBGE · Banco Central SGS 433', referenceDate: latest ? latest.month + '-01' : null, fetchedAt: result?.fetchedAt ?? null, status: latest ? result?.cached ? 'cached' : 'actual' : 'unavailable' } };
}
// Whole calendar months only; partial months have no observed daily IPCA.
export function inflationBetweenMonths(history: InflationMonth[], first: string, last: string): number | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(first) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(last) || first > last) return null;
  const start = Number(first.slice(0, 4)) * 12 + Number(first.slice(5)) - 1;
  const end = Number(last.slice(0, 4)) * 12 + Number(last.slice(5)) - 1;
  if (end - start >= 120) return null;
  const rates: (number | null)[] = [];
  for (let m = start; m <= end; m++) {
    const key = `${Math.floor(m / 12)}-${String(m % 12 + 1).padStart(2, '0')}`;
    const row = history.find((r) => r.month === key);
    rates.push(row ? row.percent / 100 : null);
  }
  return accumulatedInflation(rates);
}
