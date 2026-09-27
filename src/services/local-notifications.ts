import { type Data } from '../model';
import { daysBetween, maintenanceState } from '../calculations';
import { deriveAlerts, type FinancialAlert } from './alerts';
import { getCashFlowForecast } from './cash-flow';
import {
  isQuietTime,
  type NotificationCategory,
  type NotificationPreferences,
} from './notification-preferences';
export type NotificationPort = {
  permission: () => NotificationPermission | 'unsupported';
  requestPermission: () => Promise<NotificationPermission>;
  show: (
    title: string,
    options: NotificationOptions,
    stillActive?: () => boolean,
  ) => Promise<void>;
};
export const browserNotifications: NotificationPort = {
  permission: () =>
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'ServiceWorkerRegistration' in window &&
    'showNotification' in ServiceWorkerRegistration.prototype
      ? Notification.permission
      : 'unsupported',
  requestPermission: () => Notification.requestPermission(),
  show: async (title, options, stillActive = () => true) => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.active)
      throw Error('PWA ainda não está pronta. Reabra o aplicativo.');
    if (!stillActive()) throw Error('Entrega cancelada.');
    await registration.showNotification(title, options);
  },
};
/** Called ONLY by the explicit activation button, never from the delivery lifecycle. */
export async function activateNotifications(
  port: NotificationPort = browserNotifications,
) {
  const permission = port.permission();
  return permission === 'default' ? port.requestPermission() : permission;
}
export const notificationRoutes = [
  'Dívidas',
  'Investimentos',
  'Manutenção',
  'Planejamento',
  'Gastos',
  'Relatórios',
  'Alertas',
  'Auditoria',
  'Configurações',
] as const;
export function validNotificationRoute(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (notificationRoutes as readonly string[]).includes(value)
  );
}
export type NotificationCandidate = { id: string; route: string; body: string };
function category(alert: FinancialAlert): NotificationCategory | null {
  if (alert.source === 'investment')
    return alert.type === 'calendar'
      ? 'investment'
      : alert.date
        ? 'maturities'
        : alert.severity === 'important'
          ? 'investment'
          : null;
  if (alert.source === 'debt') return 'debt';
  if (alert.source === 'maintenance')
    return alert.type === 'atrasada' || alert.type === 'próxima'
      ? 'maintenance'
      : null;
  if (alert.source === 'budget')
    return alert.type === 'over_budget' ? 'budget' : null;
  if (alert.source === 'reserve')
    return alert.type === 'below' || alert.type === 'fell' ? 'reserve' : null;
  if (alert.source === 'reporting')
    return alert.type === 'not-closed' ? 'reporting' : null;
  if (alert.source === 'planning' && alert.type === 'overdue') return 'bills';
  return alert.severity === 'important' ||
    (alert.source === 'forecast' && alert.type === 'negative')
    ? 'important'
    : null;
}
const privateText: Record<NotificationCategory, string> = {
  debt: 'Uma dívida tem vencimento próximo ou pendente. Confira no aplicativo.',
  bills: 'Há um compromisso previsto ou pendente. Confira no aplicativo.',
  investment: 'Há uma pendência importante nos investimentos.',
  maturities: 'Um investimento tem um evento próximo. Confira no aplicativo.',
  maintenance: 'Uma manutenção merece atenção. Confira o prazo no aplicativo.',
  budget: 'Um orçamento ultrapassou o limite configurado.',
  reserve: 'Sua reserva merece revisão. Confira no aplicativo.',
  reporting: 'O mês anterior ainda não foi fechado.',
  important:
    'Há uma pendência financeira importante. Abra o aplicativo para conferir.',
};
export function notificationCandidates(
  d: Data,
  at: string,
): NotificationCandidate[] {
  const p = d.notificationPreferences;
  // A widened alert context changes only notification lead time, never the saved setting.
  const alerts = deriveAlerts(
    { ...d, settings: { ...d.settings, nearDays: p.leadDays } },
    at,
  );
  const events = getCashFlowForecast(d, at, p.leadDays).events.filter(
    (e) => e.source === 'recurrences' && !e.overdue && e.direction === 'saída',
  );
  const candidates: NotificationCandidate[] = [];
  const maintenanceRows = new Map(d.maintenance.map((row) => [row.id, row]));
  for (const alert of alerts) {
    const c = category(alert);
    const row =
      c === 'maintenance'
        ? maintenanceRows.get(alert.sourceId || '')
        : undefined;
    const maintenance = row ? maintenanceState(d, row, at) : undefined;
    const mileageDue =
      maintenance?.kmLeft !== null &&
      maintenance?.kmLeft !== undefined &&
      maintenance.kmLeft <= 0;
    if (
      !c ||
      !p.categories[c] ||
      (alert.date && daysBetween(at, alert.date) > p.leadDays && !mileageDue) ||
      !validNotificationRoute(alert.action.route)
    )
      continue;
    // Mileage-only maintenance must have reached its due mileage; not every upcoming item.
    if (c === 'maintenance' && !alert.date && !mileageDue) continue;
    candidates.push({
      id: maintenance
        ? `maintenance:${alert.sourceId}:${maintenance.nextKm}:${maintenance.nextDate}`
        : `${alert.id}:${alert.date || at.slice(0, 7)}`,
      route: alert.action.route,
      body: p.showValues
        ? `${alert.title}. ${alert.description}`
        : privateText[c],
    });
  }
  if (p.categories.bills)
    for (const e of events)
      candidates.push({
        id: `bill:${e.id}:${e.originalDate}`,
        route: 'Planejamento',
        body: p.showValues
          ? `${e.name}: ${e.originalDate}. Valor previsto ${e.amount === null ? 'não informado' : e.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`
          : privateText.bills,
      });
  return candidates;
}
type Delivery = { tag: string; date: string };
const pending = new Set<string>();
/** Minimal device-only hashes. Reserve before display: no repeat if storage cannot be written. */
export async function deliverNotifications(options: {
  preferences: NotificationPreferences;
  candidates: () => NotificationCandidate[];
  owner: string;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  port?: NotificationPort;
  now?: Date;
  stillActive?: () => boolean;
}): Promise<string | null> {
  const {
      preferences: p,
      owner,
      storage,
      candidates,
      stillActive = () => true,
    } = options,
    port = options.port || browserNotifications,
    now = options.now || new Date();
  if (
    !p.enabled ||
    port.permission() !== 'granted' ||
    isQuietTime(p, now) ||
    pending.has(owner) ||
    !stillActive()
  )
    return null;
  pending.add(owner);
  try {
    const key = `rota-notification-delivery-v1:${owner}`;
    const raw: unknown = JSON.parse(storage.getItem(key) || '[]');
    if (
      !Array.isArray(raw) ||
      raw.some(
        (r) => !r || typeof r.tag !== 'string' || typeof r.date !== 'string',
      )
    )
      throw Error('delivery');
    let records: Delivery[] = raw.slice(-200);
    const at = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (records.filter((r) => r.date === at).length >= 3) return null;
    for (const candidate of candidates()) {
      if (records.filter((r) => r.date === at).length >= 3 || !stillActive())
        break;
      const bytes = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(owner + ':' + candidate.id),
      );
      const tag =
        'rota-' +
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
      if (records.some((r) => r.tag === tag) || !stillActive()) continue;
      const next = [...records, { tag, date: at }].slice(-200);
      storage.setItem(key, JSON.stringify(next));
      try {
        await port.show(
          'Rota Financeira',
          { body: candidate.body, tag, data: { route: candidate.route } },
          stillActive,
        );
      } catch {
        storage.setItem(key, JSON.stringify(records));
        throw Error('display');
      }
      records = next;
    }
    return null;
  } catch {
    return stillActive()
      ? 'Não foi possível entregar notificações neste dispositivo. Os alertas continuam disponíveis no aplicativo.'
      : null;
  } finally {
    pending.delete(owner);
  }
}
