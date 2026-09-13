import { OWNER_KEY, accountKey, recoveryKey } from './sync-core';

type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'removeItem'>;
export type StoredCopy = { key: string; text: string; bytes: number; protected: boolean };
const isCopy = (key: string) => /^rota-cloud-(?:account|recovery):.+$/.test(key) || key.startsWith('rota-money-before-migration:') || key.startsWith('rota-money-rounding:') ||
  ['rota-recovery', 'rota-cloud-guest-recovery', 'rota-corrupted-recovery'].includes(key);

export function inspectStorage(storage: Store) {
  const owner = storage.getItem(OWNER_KEY);
  let bytes = 0;
  const copies: StoredCopy[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;
    const text = storage.getItem(key);
    if (text === null) continue;
    const size = 2 * (key.length + text.length);
    bytes += size;
    if (isCopy(key)) copies.push({ key, text, bytes: size,
      protected: key === recoveryKey(owner) || key === 'rota-corrupted-recovery' || key.startsWith('rota-money-before-migration:') ||
        (owner !== null && key === accountKey(owner)) });
  }
  return { bytes, copies };
}

export function removeStoredCopy(storage: Store, copy: StoredCopy) {
  const fresh = inspectStorage(storage).copies.find((item) => item.key === copy.key);
  if (!fresh || fresh.protected) throw Error('Esta cópia está protegida ou não está mais disponível.');
  if (fresh.text !== copy.text) throw Error('A cópia mudou em outra aba. Atualize a lista antes de remover.');
  storage.removeItem(copy.key);
}

export function storageFailure(error: unknown): string {
  return error instanceof Error && ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(error.name)
    ? 'O armazenamento deste navegador está cheio. Exporte um backup e gerencie cópias antigas em Configurações antes de tentar novamente.'
    : error instanceof Error ? error.message : 'Não foi possível acessar o armazenamento deste navegador.';
}
