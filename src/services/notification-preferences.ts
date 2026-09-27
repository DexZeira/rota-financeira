export const notificationCategories = {
  debt: 'Dívidas',
  bills: 'Contas e recorrências',
  investment: 'Investimentos',
  maturities: 'Vencimentos',
  maintenance: 'Manutenção',
  budget: 'Orçamento',
  reserve: 'Reserva',
  reporting: 'Fechamento mensal',
  important: 'Alertas importantes',
} as const;
export type NotificationCategory = keyof typeof notificationCategories;
export type NotificationPreferences = {
  enabled: boolean;
  showValues: boolean;
  leadDays: 1 | 3 | 7 | 15;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  categories: Record<NotificationCategory, boolean>;
};
export const defaultNotificationPreferences = (): NotificationPreferences => ({
  enabled: false,
  showValues: false,
  leadDays: 7,
  quietEnabled: true,
  quietStart: '22:00',
  quietEnd: '08:00',
  categories: {
    debt: true,
    bills: true,
    investment: false,
    maturities: true,
    maintenance: true,
    budget: false,
    reserve: false,
    reporting: true,
    important: true,
  },
});
export function validateNotificationPreferences(
  value: unknown,
): NotificationPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Preferências de notificação inválidas.');
  const p = value as Record<string, unknown>;
  if (
    ['enabled', 'showValues', 'quietEnabled'].some(
      (k) => typeof p[k] !== 'boolean',
    ) ||
    ![1, 3, 7, 15].includes(Number(p.leadDays)) ||
    typeof p.leadDays !== 'number' ||
    [p.quietStart, p.quietEnd].some(
      (t) => typeof t !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t),
    )
  )
    throw Error('Preferências de notificação inválidas.');
  if (
    !p.categories ||
    typeof p.categories !== 'object' ||
    Array.isArray(p.categories)
  )
    throw Error('Categorias de notificação inválidas.');
  const categories = p.categories as Record<string, unknown>;
  if (
    Object.keys(notificationCategories).some(
      (k) => typeof categories[k] !== 'boolean',
    )
  )
    throw Error('Categorias de notificação inválidas.');
  return {
    enabled: p.enabled as boolean,
    showValues: p.showValues as boolean,
    leadDays: p.leadDays as NotificationPreferences['leadDays'],
    quietEnabled: p.quietEnabled as boolean,
    quietStart: p.quietStart as string,
    quietEnd: p.quietEnd as string,
    categories: Object.fromEntries(
      Object.keys(notificationCategories).map((k) => [k, categories[k]]),
    ) as NotificationPreferences['categories'],
  };
}
export function isQuietTime(p: NotificationPreferences, now: Date) {
  if (!p.quietEnabled) return false;
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return p.quietStart >= p.quietEnd
    ? time >= p.quietStart || time < p.quietEnd
    : time >= p.quietStart && time < p.quietEnd;
}
