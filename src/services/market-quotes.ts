export type Quote = { symbol: string; price: number; currency: string; updatedAt: string; source: string; delayed: boolean };
const CACHE_KEY = 'rota-financeira-market-quotes-v1';
const TTL = 10 * 60 * 1000;
function cacheRead(): Record<string, Quote> { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } }
export async function loadQuote(symbol: string, kind: 'b3' | 'crypto', fetcher: typeof fetch = fetch): Promise<Quote | undefined> {
  const normalized = symbol.trim().toUpperCase(); if (!normalized) return undefined;
  const cached = cacheRead()[`${kind}:${normalized}`];
  if (cached && Date.now() - Date.parse(cached.updatedAt) < TTL) return cached;
  const endpoint = kind === 'crypto'
    ? `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(normalized.toLowerCase())}&vs_currencies=brl`
    : `https://brapi.dev/api/quote/${encodeURIComponent(normalized)}`;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(endpoint, { signal: controller.signal });
    if (response.status === 429 || !response.ok) return cached;
    const body = await response.json() as { results?: Array<{ regularMarketPrice?: number }> } & Record<string, { brl?: number }>;
    const price = kind === 'crypto' ? body[normalized.toLowerCase()]?.brl : body.results?.[0]?.regularMarketPrice;
    if (!Number.isFinite(price)) return cached;
    const quote: Quote = { symbol: normalized, price: Number(price), currency: 'BRL', updatedAt: new Date().toISOString(), source: kind === 'crypto' ? 'CoinGecko' : 'brapi.dev', delayed: true };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cacheRead(), [`${kind}:${normalized}`]: quote })); } catch { /* offline/private mode */ }
    return quote;
  } catch { return cached; } finally { clearTimeout(timer); }
}
export const marketQuotesCacheTtlMs = TTL;
export type AssetSuggestion = { symbol: string; name: string; id?: string };
export async function searchB3(query: string, fetcher: typeof fetch = fetch): Promise<AssetSuggestion[]> {
  try {
    const response = await fetcher(`https://brapi.dev/api/quote/list?search=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const body = await response.json() as { stocks?: Array<{ stock?: string; name?: string }> };
    return (body.stocks || []).filter((x) => x.stock).slice(0, 8).map((x) => ({ symbol: String(x.stock), name: String(x.name || x.stock) }));
  } catch { return []; }
}
export async function searchCrypto(query: string, fetcher: typeof fetch = fetch): Promise<AssetSuggestion[]> {
  try {
    const response = await fetcher(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const body = await response.json() as { coins?: Array<{ id: string; symbol: string; name: string }> };
    return (body.coins || []).slice(0, 8).map((x) => ({ id: x.id, symbol: x.symbol.toUpperCase(), name: x.name }));
  } catch { return []; }
}
