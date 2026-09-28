export const DIAGNOSTIC_KEY = 'rota-technical-events-v1';
export const DIAGNOSTIC_LIMIT = 100;
export type DiagnosticModule =
  | 'ui'
  | 'storage'
  | 'sync'
  | 'pwa'
  | 'runtime'
  | 'backup';
type Event = {
  module: DiagnosticModule;
  type: string;
  timestamp: string;
  version: 1;
};
const modules: DiagnosticModule[] = [
  'ui',
  'storage',
  'sync',
  'pwa',
  'runtime',
  'backup',
];
const types = [
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'QuotaExceededError',
  'SecurityError',
  'AbortError',
  'UnknownError',
];
// Deliberately exclude message, stack, URL, owner and arbitrary context: each can contain private data.
export function readDiagnostics(storage: Pick<Storage, 'getItem'>): Event[] {
  try {
    const raw: unknown = JSON.parse(storage.getItem(DIAGNOSTIC_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (e): e is Event =>
          e &&
          modules.includes(e.module) &&
          types.includes(e.type) &&
          typeof e.timestamp === 'string' &&
          /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(e.timestamp),
      )
      .slice(-DIAGNOSTIC_LIMIT)
      .map((e) => ({
        module: e.module,
        type: e.type,
        timestamp: e.timestamp,
        version: 1,
      }));
  } catch {
    return [];
  }
}
export function recordDiagnostic(
  module: DiagnosticModule,
  error: unknown,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
) {
  try {
    const target = storage ?? localStorage;
    const name = error instanceof Error ? error.name : 'UnknownError';
    const event: Event = {
      module,
      type: types.includes(name) ? name : 'UnknownError',
      timestamp: new Date().toISOString(),
      version: 1,
    };
    target.setItem(
      DIAGNOSTIC_KEY,
      JSON.stringify(
        [...readDiagnostics(target), event].slice(-DIAGNOSTIC_LIMIT),
      ),
    );
  } catch {
    /* Diagnostics must remain safe when storage itself is unavailable. */
  }
}
export function installDiagnostics() {
  const error = (event: ErrorEvent) => recordDiagnostic('runtime', event.error);
  const rejection = (event: PromiseRejectionEvent) =>
    recordDiagnostic('runtime', event.reason);
  window.addEventListener('error', error);
  window.addEventListener('unhandledrejection', rejection);
  return () => {
    window.removeEventListener('error', error);
    window.removeEventListener('unhandledrejection', rejection);
  };
}
