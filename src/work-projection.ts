import { type Data, num, today } from './model';
export function workProjection(d: Data, at = today()) {
  const start = new Date(Date.parse(at + 'T12:00:00Z') - 29 * 86400000)
    .toISOString()
    .slice(0, 10);
  const rows = d.work.filter(
    (r) => String(r.date) >= start && String(r.date) <= at,
  );
  const recordedDays = new Set(rows.map((r) => r.date)).size;
  const distance = rows.reduce((s, r) => s + num(r.km), 0);
  const kmDay =
    recordedDays && distance > 0
      ? distance / recordedDays
      : num(d.settings.kmDay);
  const days =
    num(d.settings.workDays) ||
    Math.min(31, Math.round((num(d.settings.workDaysWeek) * 52) / 12));
  return {
    kmDay,
    days,
    recordedDays,
    source:
      recordedDays && distance > 0
        ? 'média dos dias registrados nos últimos 30 dias'
        : 'km/dia configurados',
  };
}
