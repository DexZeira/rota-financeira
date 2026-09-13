export type MarketExpectations = { selic?: number; ipca?: number; year?: number; updatedAt?: string; source: string };
const KEY = 'rota-financeira-focus-v1';
export async function loadMarketExpectations(fetcher: typeof fetch = fetch): Promise<MarketExpectations> {
  try { const cached = JSON.parse(localStorage.getItem(KEY) || 'null'); if (cached && Date.now() - cached.savedAt < 24 * 60 * 60 * 1000) return cached.value; } catch { /* segue para rede */ }
  try {
    const response = await fetcher('https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=20&$format=json', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return readFallback();
    const body = await response.json() as { value?: Array<Record<string, unknown>> };
    const row = body.value?.[0];
    const value: MarketExpectations = { selic: Number(row?.Selic ?? row?.selic) || undefined, ipca: Number(row?.IPCA ?? row?.ipca) || undefined, year: Number(row?.DataReferencia ?? new Date().getFullYear()), updatedAt: new Date().toISOString(), source: 'Relatório Focus · Banco Central' };
    try { localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), value })); } catch { /* privado/offline */ }
    return value;
  } catch { return readFallback(); }
}
function readFallback(): MarketExpectations { try { return JSON.parse(localStorage.getItem(KEY) || 'null')?.value || { source: 'Relatório Focus · Banco Central' }; } catch { return { source: 'Relatório Focus · Banco Central' }; } }
