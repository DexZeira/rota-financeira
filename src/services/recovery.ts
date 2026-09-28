import { collections, type Data } from '../model';
import { parseBackup, load } from './storage';
import { OWNER_KEY, recoveryKey } from './sync-core';
export function recoveryCopy(storage: Pick<Storage, 'getItem'>): Data | null {
  const owner = storage.getItem(OWNER_KEY);
  for (const key of [
    `rota-last-valid:${owner || 'guest'}`,
    recoveryKey(owner),
  ]) {
    try {
      const text = storage.getItem(key);
      if (text) return parseBackup(text);
    } catch {
      /* try the next known copy for this owner only */
    }
  }
  return null;
}
export function startupHealth(storage: Pick<Storage, 'getItem'>) {
  const data = load(storage);
  for (const kind of collections) {
    const seen = new Set<string>();
    for (const row of data[kind]) {
      if (!row.id || seen.has(row.id))
        throw Error(
          'Snapshot com identificadores duplicados ou ausentes. Recupere uma cópia válida.',
        );
      seen.add(row.id);
    }
  }
  return data;
}
