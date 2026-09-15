import { FINANCIAL_SOURCES } from './financial-sources';
import { cachedSource, type IndicatorStatus } from './indicator-cache';
export type MarketRate = {
  value: number;
  rawValue: number;
  unit: '% a.a.' | '% p.d.' | '% a.m.' | '% acumulado 12m' | '% no mês';
  date: string;
  source: string;
  fetchedAt?: string;
  status?: IndicatorStatus;
};
export type MarketRates = {
  selic?: MarketRate;
  cdi?: MarketRate;
  ipca?: MarketRate;
  tr?: MarketRate;
  selicTarget?: MarketRate;
  updatedAt?: string;
};

const CACHE_KEY = 'rota-financeira-market-rates-v1';
const TTL = 12 * 60 * 60 * 1000;
const endpoints = {
  selic: FINANCIAL_SOURCES.BCB_SGS_SELIC,
  cdi: FINANCIAL_SOURCES.BCB_SGS_CDI,
  ipca: FINANCIAL_SOURCES.BCB_SGS_IPCA12,
  tr: FINANCIAL_SOURCES.BCB_SGS_TR,
  selicTarget: FINANCIAL_SOURCES.BCB_SGS_SELIC_TARGET,
} as const;
let inFlight: Promise<MarketRates> | undefined;

export function annualizeDailyRate(dailyPercent: number, businessDays = 252): number {
  return (Math.pow(1 + dailyPercent / 100, businessDays) - 1) * 100;
}
export function annualizePercentOfCdi(cdiDailyPercent: number, percentOfCdi: number, businessDays = 252): number | undefined {
  if (!Number.isFinite(cdiDailyPercent) || !Number.isFinite(percentOfCdi) || cdiDailyPercent < 0 || percentOfCdi < 0) return undefined;
  const dailyRate = (cdiDailyPercent / 100) * (percentOfCdi / 100);
  return (Math.pow(1 + dailyRate, businessDays) - 1) * 100;
}

export function parseMarketRate(raw: string, unit: MarketRate['unit'] = '% a.a.'): MarketRate | undefined {
  try {
    const row = JSON.parse(raw)?.[0];
    if (typeof row?.valor !== 'string' || !/^-?\d+(?:[.,]\d+)?$/.test(row.valor.trim()) || !/^\d{2}\/\d{2}\/\d{4}$/.test(row?.data)) return undefined;
    const value = Number(row.valor.replace(',', '.'));
    if (!Number.isFinite(value)) return undefined;
    const [day, month, year] = String(row.data).split('/');
    const date = `${year}-${month}-${day}`;
    if (new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date) return undefined;
    return { value, rawValue: value, unit, date: `${year}-${month}-${day}`, source: 'Banco Central do Brasil · SGS' };
  } catch { return undefined; }
}

function readCache(): MarketRates | undefined {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return cached?.rates && typeof cached.savedAt === 'number' ? cached.rates : undefined;
  } catch { return undefined; }
}

export async function loadMarketRates(fetcher: typeof fetch = fetch): Promise<MarketRates> {
  if (inFlight) return inFlight;
  inFlight = loadMarketRatesInternal(fetcher);
  try { return await inFlight; } finally { inFlight = undefined; }
}
async function loadMarketRatesInternal(fetcher: typeof fetch): Promise<MarketRates> {
  const cached = readCache();
  const rates: MarketRates = {};
  await Promise.all(Object.entries(endpoints).map(async ([name, source]) => {
    const key = name as keyof typeof endpoints;
    const result = await cachedSource(`rota-indicator-${source.id}-v1`, source.url, source.cacheTtlMs,
      (body) => parseMarketRate(JSON.stringify(body), source.unit), fetcher);
    if (result) {
      const rate = { ...result.value, fetchedAt: result.fetchedAt, status: result.cached ? 'cached' as const : 'actual' as const };
      if (key === 'cdi') rate.value = annualizeDailyRate(rate.rawValue);
      rates[key] = rate;
    } else {
      const old = cached?.[key];
      if (old && Number.isFinite(old.value) && Number.isFinite(old.rawValue) && /^\d{4}-\d{2}-\d{2}$/.test(old.date))
        rates[key] = { ...old, unit: source.unit, fetchedAt: cached?.updatedAt, status: 'cached' };
    }
  }));
  rates.updatedAt = Object.values(rates).filter((v): v is MarketRate => typeof v === 'object').map((v) => v.fetchedAt || '').sort().at(-1) || undefined;
  return rates;
}

export const marketRatesCacheTtlMs = TTL;
