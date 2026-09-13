export type MarketRate = {
  value: number;
  rawValue: number;
  unit: '% a.a.' | '% p.d.';
  date: string;
  source: string;
};
export type MarketRates = {
  selic?: MarketRate;
  cdi?: MarketRate;
  ipca?: MarketRate;
  updatedAt?: string;
};

const CACHE_KEY = 'rota-financeira-market-rates-v1';
const TTL = 12 * 60 * 60 * 1000;
const endpoints = {
  selic: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.1178/dados/ultimos/1?formato=json',
  cdi: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/1?formato=json',
  ipca: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json',
} as const;

export function annualizeDailyRate(dailyPercent: number, businessDays = 252): number {
  return (Math.pow(1 + dailyPercent / 100, businessDays) - 1) * 100;
}

export function parseMarketRate(raw: string, unit: MarketRate['unit'] = '% a.a.'): MarketRate | undefined {
  try {
    const row = JSON.parse(raw)?.[0];
    const value = Number(String(row?.valor ?? '').replace(',', '.'));
    if (!Number.isFinite(value) || !row?.data) return undefined;
    const [day, month, year] = String(row.data).split('/');
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
  const cached = readCache();
  let rates = cached || {};
  let changed = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await Promise.all(Object.entries(endpoints).map(async ([key, endpoint]) => {
      try {
        const response = await fetcher(endpoint, { signal: controller.signal });
        if (!response.ok) return;
        const rate = parseMarketRate(await response.text(), key === 'cdi' ? '% p.d.' : '% a.a.');
        if (rate && key === 'cdi') rate.value = annualizeDailyRate(rate.rawValue);
        if (rate) { rates = { ...rates, [key]: rate }; changed = true; }
      } catch { /* mantém o último valor conhecido */ }
    }));
  } finally { clearTimeout(timer); }
  if (changed) {
    rates = { ...rates, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rates })); } catch { /* modo privado/offline */ }
  }
  return rates;
}

export const marketRatesCacheTtlMs = TTL;
