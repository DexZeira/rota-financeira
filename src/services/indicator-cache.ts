export type IndicatorStatus = 'actual' | 'estimated' | 'cached' | 'unavailable';
export type FinancialIndicator = {
  value: number | null;
  unit: string;
  source: string;
  referenceDate: string | null;
  fetchedAt: string | null;
  status: IndicatorStatus;
};
type Cached<T> = { value: T; fetchedAt: string; cached: boolean };
const pending = new WeakMap<typeof fetch, Map<string, Promise<unknown>>>();

// Only public source data is cached here. Each reference keeps its own fetch date.
export async function cachedSource<T>(key: string, url: string, ttl: number, parse: (body: unknown) => T | undefined, fetcher: typeof fetch = fetch): Promise<Cached<T> | undefined> {
  let requests = pending.get(fetcher);
  if (!requests) { requests = new Map(); pending.set(fetcher, requests); }
  const running = requests.get(key) as Promise<Cached<T> | undefined> | undefined;
  if (running) return running;
  const task = (async () => {
    let previous: { body: unknown; fetchedAt: string } | undefined;
    let fallback: Cached<T> | undefined;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || 'null');
      if (stored && typeof stored.fetchedAt === 'string' && Number.isFinite(Date.parse(stored.fetchedAt)) && Date.parse(stored.fetchedAt) <= Date.now()) {
        const value = parse(stored.body);
        if (value !== undefined) { previous = stored; fallback = { value, fetchedAt: stored.fetchedAt, cached: true }; }
      }
    } catch { /* storage may be unavailable */ }
    if (previous && fallback && Date.now() - Date.parse(previous.fetchedAt) < ttl) return fallback;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetcher(url, { signal: controller.signal });
      if (!response.ok) return fallback;
      const body: unknown = await response.json();
      const value = parse(body);
      if (value === undefined) return fallback;
      const fetchedAt = new Date().toISOString();
      try { localStorage.setItem(key, JSON.stringify({ body, fetchedAt })); } catch { /* quota does not block use */ }
      return { value, fetchedAt, cached: false };
    } catch { return fallback; }
    finally { clearTimeout(timer); }
  })();
  requests.set(key, task);
  try { return await task; } finally { requests.delete(key); }
}
