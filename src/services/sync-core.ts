import { defaults, type Data } from '../model';
import { backup, parseBackup, STORAGE_KEY } from './storage';

export type CloudState = {
  data: Data;
  updated_at: string;
  device_id: string | null;
};
export function fingerprint(data: Data): string {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : value;
  return JSON.stringify(canonical(data));
}
export const serializeSnapshot = (data: Data): unknown =>
  JSON.parse(backup(data)) as unknown;
export function resolveInitialSync(
  local: Data,
  remote: CloudState | null,
  base?: string,
) {
  const here = fingerprint(local);
  if (remote && here === fingerprint(remote.data)) return 'equal';
  if (remote && (here === base || here === fingerprint(defaults())))
    return 'download';
  if (!remote && here === fingerprint(defaults())) return 'upload';
  if (remote && base && fingerprint(remote.data) === base) return 'upload';
  return remote ? 'conflict' : 'migration';
}
export type SyncMeta = {
  base?: string;
  revision?: string;
  lastSync?: string;
  localUpdated?: string;
};
export type SyncErrorDetails = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
};
export function syncStatus(error: SyncErrorDetails, online: boolean): string {
  if (!online) return 'Offline — alterações serão sincronizadas quando possível.';
  if (error.status === 401) return 'Sessão expirada. Entre novamente para sincronizar.';
  if (error.code === 'PGRST202') return 'RPC de sincronização ausente no Supabase.';
  if (error.code === 'PGRST205' || error.code === '42P01')
    return 'Tabela de sincronização ausente no Supabase.';
  if (error.code === '42501') return 'Acesso negado pelas policies do Supabase.';
  return 'Erro ao sincronizar. Seus dados continuam neste dispositivo.';
}
export const OWNER_KEY = 'rota-cloud-owner';
export const accountKey = (user: string) => `rota-cloud-account:${user}`;
export const metaKey = (user: string) => `rota-cloud-meta:${user}`;
export const recoveryKey = (owner: string | null) =>
  owner ? `rota-cloud-recovery:${owner}` : 'rota-recovery';
export function switchAccount(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  user: string,
  local: Data,
): Data {
  const owner = storage.getItem(OWNER_KEY);
  if (owner === user) return local;
  if (owner) storage.setItem(accountKey(owner), backup(local));
  else storage.setItem('rota-cloud-guest-recovery', backup(local));
  const cached = storage.getItem(accountKey(user));
  const next = cached ? parseBackup(cached) : owner ? defaults() : local;
  const previous = storage.getItem(STORAGE_KEY) || JSON.stringify(local);
  // Prepare the new account snapshot before publishing its ownership marker.
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    storage.setItem(OWNER_KEY, user);
  } catch (error) {
    storage.setItem(STORAGE_KEY, previous);
    throw error;
  }
  return next;
}
