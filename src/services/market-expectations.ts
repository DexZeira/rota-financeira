import { FINANCIAL_SOURCES } from './financial-sources';
import { cachedSource, type FinancialIndicator } from './indicator-cache';

export type FocusYear = { year: number; selic: FinancialIndicator; ipca: FinancialIndicator };
export type MarketExpectations = { selic?: number; ipca?: number; year?: number; updatedAt?: string; source: string; years?: FocusYear[] };
const source = FINANCIAL_SOURCES.BCB_FOCUS;
export function focusEndpoint(year: number) {
  const filter = `(Indicador eq 'Selic' or Indicador eq 'IPCA') and (DataReferencia eq '${year}' or DataReferencia eq '${year + 1}') and baseCalculo eq 0`;
  return `${source.url}?$format=json&$top=100&$orderby=Data%20desc&$filter=${encodeURIComponent(filter)}`;
}
export function parseFocus(body: unknown, year: number): FocusYear[] | undefined {
  if (!body || typeof body !== 'object' || !('value' in body) || !Array.isArray(body.value)) return undefined;
  const empty = (): FinancialIndicator => ({ value: null, unit: '%', source: 'Expectativa Focus · Banco Central', referenceDate: null, fetchedAt: null, status: 'unavailable' });
  const years = [year, year + 1].map((y) => ({ year: y, selic: empty(), ipca: empty() }));
  for (const row of body.value) {
    if (!row || typeof row !== 'object' || row.baseCalculo !== 0 || typeof row.Mediana !== 'number' || !Number.isFinite(row.Mediana) || row.Mediana <= -100 || !/^\d{4}-\d{2}-\d{2}$/.test(row.Data)) continue;
    const group = years.find((v) => String(v.year) === row.DataReferencia);
    const key = row.Indicador === 'Selic' ? 'selic' : row.Indicador === 'IPCA' ? 'ipca' : undefined;
    if (group && key && (!group[key].referenceDate || row.Data > group[key].referenceDate!)) {
      group[key] = { ...empty(), value: row.Mediana, referenceDate: row.Data, unit: key === 'selic' ? '% a.a. no fim do ano' : '% no ano', status: 'estimated' };
    }
  }
  return years.some((y) => y.selic.value !== null || y.ipca.value !== null) ? years : undefined;
}
export async function loadMarketExpectations(fetcher: typeof fetch = fetch): Promise<MarketExpectations> {
  const year = new Date().getFullYear();
  const result = await cachedSource(`rota-focus-${year}-v2`, focusEndpoint(year), source.cacheTtlMs, (body) => parseFocus(body, year), fetcher);
  const years = result?.value.map((y) => {
    const stamp = (v: FinancialIndicator): FinancialIndicator => ({ ...v, fetchedAt: result.fetchedAt, status: v.value === null ? 'unavailable' : result.cached ? 'cached' : 'estimated' });
    return { ...y, selic: stamp(y.selic), ipca: stamp(y.ipca) };
  });
  return { year, years, selic: years?.[0].selic.value ?? undefined, ipca: years?.[0].ipca.value ?? undefined, updatedAt: result?.fetchedAt, source: 'Expectativa Focus · Banco Central' };
}
