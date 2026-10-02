import { createClient } from 'npm:@supabase/supabase-js@2';
import { createGoogleSheetsReader, readGoogleSheetsConfiguration, isManioRecord, ManioError } from './manio-sheets.ts';
import type { ManioDependencies, ManioConnection, ManioSummary } from './manio-handlers.ts';

let reader: ReturnType<typeof createGoogleSheetsReader> | null = null;
export const manioDependencies: ManioDependencies = {
  allowedOrigins: (Deno.env.get('MANIO_SHEETS_ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(Boolean),
  configuration: () => readGoogleSheetsConfiguration(name => Deno.env.get(name)),
  log: entry => console.info(JSON.stringify(entry)),
  read: (configuration, id, name, sample) => { reader ??= createGoogleSheetsReader(configuration); return reader.read(id, name, sample); },
  authenticate: async request => {
    const authorization = request.headers.get('Authorization');
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !key) throw new ManioError('CONFIG', 503);
    if (!authorization?.startsWith('Bearer ') || authorization.length > 8192) throw new ManioError('UNAVAILABLE', 401);
    const client = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !user) throw new ManioError('UNAVAILABLE', 401);
    return {
      userId: user.id,
      authorizedSheet: async id => {
        const { data, error } = await client.from('manio_google_sheets_access').select('spreadsheet_id').eq('user_id', user.id).eq('spreadsheet_id', id).maybeSingle();
        if (error) throw new ManioError('UNAVAILABLE', 502);
        return !!data;
      },
      connection: async id => {
        const { data, error } = await client.from('manio_google_sheets_connections').select('id,user_id,spreadsheet_id,sheet_name,institution_name,account_reference,status,enabled').eq('user_id', user.id).eq('id', id).maybeSingle();
        if (error) throw new ManioError('UNAVAILABLE', 502);
        return data as ManioConnection | null;
      },
      begin: async (id, token) => {
        const { data, error } = await client.rpc('manio_begin_sync', { p_connection_id: id, p_token: token });
        if (error) throw new ManioError('UNAVAILABLE', 502);
        return data === true;
      },
      complete: async (id, token, rows) => {
        const { data, error } = await client.rpc('manio_complete_sync', { p_connection_id: id, p_token: token, p_rows: rows });
        if (error || !isManioRecord(data) || typeof data.syncedAt !== 'string' || !Number.isFinite(Date.parse(data.syncedAt)) || [data.newTransactions, data.updatedTransactions, data.existingTransactions].some(v => !Number.isSafeInteger(v) || Number(v) < 0)) throw new ManioError('UNAVAILABLE', 502);
        return data as ManioSummary;
      },
      fail: async (id, token, code) => {
        const { error } = await client.rpc('manio_fail_sync', { p_connection_id: id, p_token: token, p_error: code });
        if (error) throw new ManioError('UNAVAILABLE', 502);
      },
    };
  },
};
