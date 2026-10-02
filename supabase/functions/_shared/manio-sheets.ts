export type ManioErrorCode = 'CONFIG' | 'AUTH' | 'ACCESS' | 'SHEET' | 'SCHEMA' | 'INVALID' | 'UNAVAILABLE' | 'BUSY';
export const manioMessages: Record<ManioErrorCode, string> = {
  CONFIG: 'A integração Manio não está disponível. Verifique a configuração no servidor.',
  AUTH: 'Não foi possível autenticar com o Google Sheets.',
  ACCESS: 'Não foi possível acessar a planilha. Confira o vínculo com seu usuário e compartilhe-a com o e-mail indicado.',
  SHEET: 'A aba configurada não foi encontrada.',
  SCHEMA: 'Não foi possível identificar as colunas Data, Valor e Descrição ou existem linhas inválidas/ambíguas. Revise a planilha.',
  INVALID: 'Confira os dados informados e tente novamente.',
  UNAVAILABLE: 'Não foi possível concluir a leitura. Seus dados anteriores foram preservados.',
  BUSY: 'Uma leitura já está em andamento. Aguarde e tente novamente.',
};
export class ManioError extends Error {
  constructor(readonly code: ManioErrorCode, readonly status = 400) { super(manioMessages[code]); }
}
export type GoogleSheetsConfiguration = { clientEmail: string; privateKey: string };
export function readGoogleSheetsConfiguration(get: (name: string) => string | undefined): GoogleSheetsConfiguration {
  const clientEmail = get('GOOGLE_SHEETS_CLIENT_EMAIL')?.trim() ?? '';
  const privateKey = get('GOOGLE_SHEETS_PRIVATE_KEY')?.replace(/\\n/g, '\n').trim() ?? '';
  if (get('MANIO_SHEETS_ENABLED') === 'false' || !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(clientEmail) || !/^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----$/.test(privateKey))
    throw new ManioError('CONFIG', 503);
  return { clientEmail, privateKey };
}
export function validateManioSheet(spreadsheetId: unknown, sheetName: unknown): { spreadsheetId: string; sheetName: string } {
  if (typeof spreadsheetId !== 'string' || !/^[A-Za-z0-9_-]{20,150}$/.test(spreadsheetId) || typeof sheetName !== 'string' || !sheetName.trim() || sheetName.length > 100 || /[\x00-\x1f]/.test(sheetName))
    throw new ManioError('INVALID');
  return { spreadsheetId, sheetName: sheetName.trim() };
}
export function isManioUuid(v: unknown): v is string { return typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v); }
export function isManioRecord(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new ManioError('UNAVAILABLE', 502);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 10 * 1024 * 1024) { await reader.cancel(); throw new ManioError('UNAVAILABLE', 502); }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch { throw new ManioError('UNAVAILABLE', 502); }
  finally { reader.releaseLock(); }
}
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encode = (value: unknown) => base64(new TextEncoder().encode(JSON.stringify(value)));

// Only memory in this isolate. No credentials, JWT assertions or access tokens are returned to callers.
export function createGoogleSheetsReader(configuration: GoogleSheetsConfiguration, request: typeof fetch = fetch, now = Date.now) {
  let cached: { token: string; expires: number } | null = null;
  let inflight: Promise<string> | null = null;
  async function authenticate(): Promise<string> {
    if (cached && cached.expires > now()) return cached.token;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const pem = configuration.privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
        const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
        const iat = Math.floor(now() / 1000);
        const message = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: configuration.clientEmail, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })}`;
        const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(message));
        const response = await request('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${message}.${base64(new Uint8Array(signature))}` }) });
        if (!response.ok) throw new ManioError('AUTH', 502);
        const value = await boundedJson(response);
        if (!isManioRecord(value) || typeof value.access_token !== 'string' || !value.access_token || value.token_type !== 'Bearer' || typeof value.expires_in !== 'number' || !Number.isFinite(value.expires_in) || value.expires_in <= 60)
          throw new ManioError('AUTH', 502);
        cached = { token: value.access_token, expires: now() + (Math.min(value.expires_in, 3600) - 60) * 1000 };
        return cached.token;
      } catch { throw new ManioError('AUTH', 502); }
    })();
    try { return await inflight; } finally { inflight = null; }
  }
  async function readBlock(spreadsheetId: string, sheetName: string, sample: boolean): Promise<string[][]> {
    const token = await authenticate();
    // A1 quoted sheet names escape apostrophes; never accept an arbitrary URL or a user-provided range.
    const quoted = `'${sheetName.replace(/'/g, "''")}'`;
    const range = sample ? `${quoted}!A1:BL6` : quoted;
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);
    url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');
    url.searchParams.set('majorDimension', 'ROWS');
    let response: Response;
    try { response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}` } }); }
    catch { throw new ManioError('UNAVAILABLE', 502); }
    if (response.status === 401) { cached = null; throw new ManioError('AUTH', 502); }
    if (response.status === 403 || response.status === 404) throw new ManioError('ACCESS', 403);
    if (response.status === 400) throw new ManioError('SHEET');
    if (!response.ok) throw new ManioError('UNAVAILABLE', 502);
    const result = await boundedJson(response);
    if (!isManioRecord(result) || (result.values !== undefined && !Array.isArray(result.values))) throw new ManioError('UNAVAILABLE', 502);
    const values: unknown[] = result.values === undefined ? [] : result.values as unknown[];
    if (values.length > (sample ? 6 : 50001)) throw new ManioError('SCHEMA');
    return values.map(row => {
      if (!Array.isArray(row) || row.length > 64 || row.some(cell => !['string', 'number', 'boolean'].includes(typeof cell) || String(cell).length > 2000)) throw new ManioError('SCHEMA');
      return row.map(String);
    });
  }
  return { async read(spreadsheetId: string, sheetName: string, sample = false): Promise<string[][]> {
    validateManioSheet(spreadsheetId, sheetName);
    // Sheets does not paginate values.get. A full quoted-tab range preserves rows after gaps.
    // The response stream, columns and row count are bounded; an oversized collection fails as a whole.
    return readBlock(spreadsheetId, sheetName, sample);
  } };
}
