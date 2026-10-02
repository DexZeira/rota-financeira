import { detectManioColumns, normalizeManioRows, type ManioSourceRow } from '../../../src/services/manio-sheet-parser.ts';
import { ManioError, isManioRecord, isManioUuid, validateManioSheet, type GoogleSheetsConfiguration } from './manio-sheets.ts';

export type ManioConnection = { id: string; user_id: string; institution_name: string; account_reference: string; spreadsheet_id: string; sheet_name: string; enabled: boolean; status: string };
export type ManioSummary = { newTransactions: number; updatedTransactions: number; existingTransactions: number; syncedAt: string };
export type ManioStore = {
  userId: string;
  authorizedSheet: (spreadsheetId: string) => Promise<boolean>;
  connection: (id: string) => Promise<ManioConnection | null>;
  begin: (id: string, token: string) => Promise<boolean>;
  complete: (id: string, token: string, rows: ManioSourceRow[]) => Promise<ManioSummary>;
  fail: (id: string, token: string, error: string) => Promise<void>;
};
export type ManioDependencies = {
  authenticate: (request: Request) => Promise<ManioStore>;
  configuration: () => GoogleSheetsConfiguration;
  read: (configuration: GoogleSheetsConfiguration, spreadsheetId: string, sheetName: string, sample: boolean) => Promise<string[][]>;
  allowedOrigins: readonly string[];
  log: (entry: { correlationId: string; operation: string; status: number; count: number }) => void;
};
// Future scheduling must supply a verified owner-scoped store. No cron or automatic financial posting.
export async function syncManioConnection(store: ManioStore, id: string, read: (connection: ManioConnection) => Promise<string[][]>): Promise<ManioSummary> {
  const connection = await store.connection(id);
  if (!connection || connection.user_id !== store.userId || !connection.enabled || !['connected', 'error'].includes(connection.status)) throw new ManioError('UNAVAILABLE', 404);
  validateManioSheet(connection.spreadsheet_id, connection.sheet_name);
  if (!await store.authorizedSheet(connection.spreadsheet_id)) throw new ManioError('ACCESS', 403);
  const token = crypto.randomUUID();
  if (!await store.begin(id, token)) throw new ManioError('BUSY', 409);
  try {
    const values = await read(connection);
    let rows: ManioSourceRow[];
    try { rows = await normalizeManioRows(values, connection); } catch { throw new ManioError('SCHEMA'); }
    return await store.complete(id, token, rows);
  } catch (error) {
    const safe = error instanceof ManioError ? error : new ManioError('UNAVAILABLE', 502);
    await store.fail(id, token, safe.code).catch(() => undefined);
    throw safe;
  }
}
export async function handleManioRequest(request: Request, action: 'test' | 'sync', dependencies: ManioDependencies): Promise<Response> {
  const correlationId = crypto.randomUUID(), operation = `manio.${action}`;
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Request-ID': correlationId, Vary: 'Origin' };
  if (origin && dependencies.allowedOrigins.includes(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
  const response = (body: unknown, status = 200, count = 0) => {
    dependencies.log({ correlationId, operation, status, count });
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
  };
  if (origin && !dependencies.allowedOrigins.includes(origin)) return response({ error: 'Não foi possível concluir a solicitação.' }, 403);
  if (request.method === 'OPTIONS') return response(null, 204);
  if (request.method !== 'POST') return response({ error: 'Não foi possível concluir a solicitação.' }, 405);
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return response({ error: 'Confira os dados informados.' }, 415);
  try {
    const store = await dependencies.authenticate(request);
    const configuration = dependencies.configuration();
    if (!request.body) throw new ManioError('INVALID');
    const input = request.body.getReader(), decoder = new TextDecoder();
    let raw = '', bytes = 0;
    try {
      for (;;) {
        const part = await input.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 4096) { await input.cancel(); throw new ManioError('INVALID'); }
        raw += decoder.decode(part.value, { stream: true });
      }
      raw += decoder.decode();
    } finally { input.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new ManioError('INVALID'); }
    if (!isManioRecord(body)) throw new ManioError('INVALID');
    if (action === 'test') {
      if (body.operation === 'metadata' && Object.keys(body).length === 1) return response({ serviceAccountEmail: configuration.clientEmail });
      if (Object.keys(body).some(key => !['spreadsheetId', 'sheetName'].includes(key))) throw new ManioError('INVALID');
      const { spreadsheetId, sheetName } = validateManioSheet(body.spreadsheetId, body.sheetName);
      if (!await store.authorizedSheet(spreadsheetId)) throw new ManioError('ACCESS', 403);
      const rows = await dependencies.read(configuration, spreadsheetId, sheetName, true);
      let columns;
      try { columns = detectManioColumns(rows[0] ?? []); await normalizeManioRows(rows, { id: 'sample', institution_name: '', account_reference: '' }); } catch { throw new ManioError('SCHEMA'); }
      const columnsDetected = Object.fromEntries(Object.entries(columns).map(([key, index]) => [key, rows[0][index]]));
      return response({ success: true, sheetName, columnsDetected, sampleRowsCount: Math.min(5, rows.slice(1).filter(row => row.some(cell => cell.trim())).length) });
    }
    if (Object.keys(body).length !== 1 || !isManioUuid(body.connection_id)) throw new ManioError('INVALID');
    const summary = await syncManioConnection(store, body.connection_id, c => dependencies.read(configuration, c.spreadsheet_id, c.sheet_name, false));
    return response({ success: true, connection_id: body.connection_id, summary }, 200, summary.newTransactions + summary.updatedTransactions + summary.existingTransactions);
  } catch (error) {
    const safe = error instanceof ManioError ? error : new ManioError('UNAVAILABLE', 502);
    return response({ error: safe.message, code: safe.code, request_id: correlationId }, safe.status);
  }
}
