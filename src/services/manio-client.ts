import { supabase } from './supabase';
import type { ManioSourceRow } from './manio-sheet-parser';

export type ManioConnection = {
  id: string; user_id: string; provider: 'manio_google_sheets'; institution_name: string;
  spreadsheet_id: string; sheet_name: string; account_reference: string; account_type: 'checking' | 'card'; enabled: boolean;
  status: 'connected' | 'error' | 'disconnected'; last_sync_at: string | null;
  last_sync_status: string | null; last_sync_error: string | null; created_at: string; updated_at: string;
};
export type ManioStoredTransaction = ManioSourceRow & { id: string; connection_id: string };
export type ManioTestResult = { success: true; sheetName: string; columnsDetected: Record<string, string>; sampleRowsCount: number };
export type ManioSummary = { newTransactions: number; updatedTransactions: number; existingTransactions: number; syncedAt: string };
const messages: Record<string, string> = {
  CONFIG: 'A integração precisa ser configurada no servidor.',
  AUTH: 'Não foi possível autenticar com o Google Sheets.',
  ACCESS: 'Confira o vínculo da planilha com seu usuário e compartilhe-a como leitor com o e-mail indicado.',
  SHEET: 'A aba configurada não foi encontrada.',
  SCHEMA: 'Revise as colunas Data, Valor e Descrição e as linhas inválidas ou ambíguas.',
  BUSY: 'Uma leitura já está em andamento. Aguarde e tente novamente.',
  INVALID: 'Confira os dados informados.',
};
function client() { if (!supabase) throw Error('Entre na sua conta para configurar o Manio.'); return supabase; }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
async function invoke(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await client().functions.invoke(name, { body });
  if (result.error) {
    let code = '';
    if (record(result.error) && result.error.context instanceof Response) {
      try { const data: unknown = await result.error.context.clone().json(); if (record(data) && typeof data.code === 'string') code = data.code; } catch {}
    }
    throw Error(messages[code] ?? 'Não foi possível concluir a operação. Seus dados anteriores foram preservados.');
  }
  if (!record(result.data)) throw Error('Não foi possível concluir a operação.');
  return result.data;
}
export async function manioReaderEmail() {
  const data = await invoke('manio-sheets-test', { operation: 'metadata' });
  if (typeof data.serviceAccountEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(data.serviceAccountEmail)) throw Error('A integração precisa ser configurada no servidor.');
  return data.serviceAccountEmail;
}
export async function testManioSheet(spreadsheetId: string, sheetName: string): Promise<ManioTestResult> {
  const data = await invoke('manio-sheets-test', { spreadsheetId, sheetName });
  if (data.success !== true || data.sheetName !== sheetName || !record(data.columnsDetected) || Object.values(data.columnsDetected).some(v => typeof v !== 'string') || !Number.isInteger(data.sampleRowsCount) || Number(data.sampleRowsCount) < 0 || Number(data.sampleRowsCount) > 5) throw Error('Não foi possível validar a estrutura da planilha.');
  return data as ManioTestResult;
}
export async function syncManioSheet(connectionId: string): Promise<ManioSummary> {
  const data = await invoke('manio-sheets-sync', { connection_id: connectionId });
  if (data.success !== true || data.connection_id !== connectionId || !record(data.summary) || typeof data.summary.syncedAt !== 'string' || !Number.isFinite(Date.parse(data.summary.syncedAt)) || [data.summary.newTransactions, data.summary.updatedTransactions, data.summary.existingTransactions].some(v => !Number.isSafeInteger(v) || Number(v) < 0)) throw Error('Não foi possível confirmar a leitura completa.');
  return data.summary as ManioSummary;
}
export async function listManioConnections(owner: string): Promise<ManioConnection[]> {
  const { data, error } = await client().from('manio_google_sheets_connections').select('id,user_id,provider,institution_name,spreadsheet_id,sheet_name,account_reference,account_type,enabled,status,last_sync_at,last_sync_status,last_sync_error,created_at,updated_at').eq('user_id', owner).order('created_at');
  if (error) throw Error('Não foi possível carregar as conexões Manio. Verifique o setup no servidor.');
  return (data ?? []) as ManioConnection[];
}
export async function saveManioConnections(owner: string, rows: Array<Pick<ManioConnection, 'id' | 'spreadsheet_id' | 'sheet_name' | 'institution_name' | 'account_reference' | 'account_type' | 'enabled'>>) {
  const { data: { user }, error: userError } = await client().auth.getUser();
  if (userError || !user || user.id !== owner) throw Error('Entre na sua conta para configurar o Manio.');
  const { error } = await client().from('manio_google_sheets_connections').upsert(rows.map(row => ({ ...row, user_id: user.id, provider: 'manio_google_sheets', status: row.enabled ? 'connected' : 'disconnected' })), { onConflict: 'user_id,spreadsheet_id,sheet_name' });
  if (error) throw Error('Não foi possível salvar. Confira o vínculo da planilha. Mapeamentos já usados devem ser preservados.');
}
export async function disconnectManioConnection(owner: string, id: string) {
  const { data, error } = await client().from('manio_google_sheets_connections').update({ status: 'disconnected', enabled: false }).eq('user_id', owner).eq('id', id).select('id');
  if (error || data?.length !== 1) throw Error('Não foi possível desconectar. Tente novamente.');
}
export async function listManioTransactions(owner: string, connectionId: string): Promise<ManioStoredTransaction[]> {
  const result: ManioStoredTransaction[] = [];
  for (let offset = 0; offset <= 50000; offset += 500) {
    const { data, error } = await client().from('manio_google_sheets_transactions').select('id,connection_id,source_key,external_id,date,description,amount_cents,type,source_category,source_account').eq('user_id', owner).eq('connection_id', connectionId).order('id').range(offset, offset + 499);
    if (error || !data) throw Error('Não foi possível carregar os movimentos. Tente novamente.');
    result.push(...data as ManioStoredTransaction[]);
    if (result.length > 50000) throw Error('Limite de revisão excedido.');
    if (data.length < 500) return result;
  }
  throw Error('Limite de revisão excedido.');
}
