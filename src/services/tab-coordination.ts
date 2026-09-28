export const WRITE_LOCK = 'rota-snapshot-write-v1';
export type TabEvent =
  | 'statechanged'
  | 'syncdone'
  | 'migrationdone'
  | 'logout'
  | 'conflict';
const events: TabEvent[] = [
  'statechanged',
  'syncdone',
  'migrationdone',
  'logout',
  'conflict',
];
export async function withWriteLock<T>(
  write: () => T | Promise<T>,
  locks: Pick<LockManager, 'request'> | undefined = typeof navigator ===
  'undefined'
    ? undefined
    : navigator.locks,
): Promise<T> {
  // Fallback is best effort: callers must still compare the exact snapshot inside write().
  return locks
    ? locks.request(WRITE_LOCK, { mode: 'exclusive' }, write)
    : write();
}
export function publishChange(type: TabEvent) {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel('rota-state-v1');
    channel.postMessage({ type });
    channel.close();
  } catch {
    /* storage events remain available */
  }
}
export function observeChanges(notify: (type: TabEvent) => void) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  try {
    const channel = new BroadcastChannel('rota-state-v1');
    channel.onmessage = (e) => {
      if (events.includes(e.data?.type)) notify(e.data.type);
    };
    return () => channel.close();
  } catch {
    return () => {};
  }
}
