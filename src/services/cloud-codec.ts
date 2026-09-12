import { parseBackup } from './storage';
import type { CloudState, SyncErrorDetails } from './sync-core';
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
export function syncError(error: unknown, status?: number): CloudSyncError {
  const wrapped = new CloudSyncError(error);
  if (status !== undefined) wrapped.status = status;
  const redact = (value?: string) => value?.replace(
    /(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+/g,
    '[oculto]',
  );
  wrapped.message = redact(wrapped.message) || 'Erro de sincronização.';
  if (wrapped.details) wrapped.details = redact(wrapped.details);
  if (wrapped.hint) wrapped.hint = redact(wrapped.hint);
  return wrapped;
}
export function decode(row: RemoteRow): CloudState {
  const envelope = row.data && typeof row.data === 'object'
    ? row.data as { version?: unknown; data?: { dataVersion?: unknown } }
    : undefined;
  // Compare stored versions before parseBackup migrates compatible old data.
  if (row.schema_version !== (envelope?.data?.dataVersion ?? envelope?.version))
    throw Error('Versão da nuvem incompatível.');
  const data = parseBackup(JSON.stringify(row.data));
  return { data, updated_at: row.updated_at, device_id: row.device_id };
}

