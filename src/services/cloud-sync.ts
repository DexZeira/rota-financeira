import { supabase } from './supabase';
import { serializeSnapshot, type CloudState } from './sync-core';
import { decode, syncError } from './cloud-codec';
import type { Data } from '../model';
export type { SyncErrorDetails } from './sync-core';
export async function loadCloudState(user: string): Promise<CloudState | null> {
  if (!supabase) throw Error('Configure o Supabase para sincronizar.');
  const { data, error, status } = await supabase
    .from('user_app_state')
    .select('data,updated_at,device_id,schema_version')
    .eq('user_id', user)
    .abortSignal(AbortSignal.timeout(15000))
    .maybeSingle();
  if (error) throw syncError(error, status);
  return data ? decode(data) : null;
}
export async function saveCloudState(
  user: string,
  data: Data,
  device: string,
  revision: string | null,
): Promise<CloudState | null> {
  if (!supabase) throw Error('Configure o Supabase para sincronizar.');
  const { data: rows, error, status } = await supabase
    .rpc('save_app_state', {
      p_user_id: user,
      p_data: serializeSnapshot(data),
      p_schema_version: data.dataVersion,
      p_device_id: device,
      p_expected_updated_at: revision,
    })
    .abortSignal(AbortSignal.timeout(15000));
  if (error) throw syncError(error, status);
  if (!Array.isArray(rows)) throw syncError({ message: 'Resposta inválida da função de sincronização.', code: 'INVALID_RESPONSE' });
  const result = rows as Parameters<typeof decode>[0][];
  return result.length ? decode(result[0]) : null;
}

