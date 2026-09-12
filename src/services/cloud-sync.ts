import { supabase } from './supabase';
import { parseBackup } from './storage';
import { serializeSnapshot, type CloudState } from './sync-core';
import type { Data } from '../model';

type RemoteRow = {
  data: unknown;
  updated_at: string;
  device_id: string | null;
  schema_version: number;
};
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
  if (error) throw error;
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
  if (error) throw error;
  const result = rows as RemoteRow[];
  return result.length ? decode(result[0]) : null;
}
