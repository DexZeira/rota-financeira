import { supabase } from './supabase';
import { parseBackup } from './storage';
import { serializeSnapshot, type CloudState, type SyncErrorDetails } from './sync-core';
import type { Data } from '../model';
export type { SyncErrorDetails } from './sync-core';

type RemoteRow = {
  data: unknown;
  updated_at: string;
  device_id: string | null;
  schema_version: number;
};
export class CloudSyncError extends Error {
  code?: string;
  details?: string;
  hint?: string;
  status?: number;

  constructor(error: unknown) {
    const source = error && typeof error === 'object'
      ? error as Record<string, unknown>
      : {};
    const message = typeof source.message === 'string'
      ? source.message
      : error instanceof Error
        ? error.message
        : 'Erro desconhecido de sincronização.';
    super(message);
    this.name = 'CloudSyncError';
    this.code = typeof source.code === 'string' ? source.code : undefined;
    this.details = typeof source.details === 'string' ? source.details : undefined;
    this.hint = typeof source.hint === 'string' ? source.hint : undefined;
    this.status = typeof source.status === 'number' ? source.status : undefined;
  }
  diagnostic(): SyncErrorDetails {
    return {
      message: this.message,
      code: this.code,
      details: this.details,
      hint: this.hint,
      status: this.status,
    };
  }
}
function syncError(error: unknown): CloudSyncError {
  if (error instanceof CloudSyncError) return error;
  const wrapped = new CloudSyncError(error);
  const redact = (value?: string) => value?.replace(
    /(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+/g,
    '[oculto]',
  );
  wrapped.message = redact(wrapped.message) || 'Erro de sincronização.';
  if (wrapped.details) wrapped.details = redact(wrapped.details);
  if (wrapped.hint) wrapped.hint = redact(wrapped.hint);
  return wrapped;
}
function decode(row: RemoteRow): CloudState {
  const data = parseBackup(JSON.stringify(row.data));
  if (row.schema_version !== data.dataVersion)
    throw Error('Versão da nuvem incompatível.');
  return { data, updated_at: row.updated_at, device_id: row.device_id };
}
export async function loadCloudState(user: string): Promise<CloudState | null> {
  if (!supabase) throw Error('Configure o Supabase para sincronizar.');
  const { data, error } = await supabase
    .from('user_app_state')
    .select('data,updated_at,device_id,schema_version')
    .eq('user_id', user)
    .abortSignal(AbortSignal.timeout(15000))
    .maybeSingle();
  if (error) throw syncError(error);
  return data ? decode(data as RemoteRow) : null;
}
export async function saveCloudState(
  user: string,
  data: Data,
  device: string,
  revision: string | null,
): Promise<CloudState | null> {
  if (!supabase) throw Error('Configure o Supabase para sincronizar.');
  const { data: rows, error } = await supabase
    .rpc('save_app_state', {
      p_user_id: user,
      p_data: serializeSnapshot(data),
      p_schema_version: data.dataVersion,
      p_device_id: device,
      p_expected_updated_at: revision,
    })
    .abortSignal(AbortSignal.timeout(15000));
  if (error) throw syncError(error);
  const result = rows as RemoteRow[];
  return result.length ? decode(result[0]) : null;
}
