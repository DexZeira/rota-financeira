import { type Row, validDate, num, validateRow, schemas } from '../model';
import { addMonths, daysBetween } from '../calculations';
import { fromCents, toCents } from './money-codec';

// Monetary values inside the opaque history field are explicitly integer cents.
type Period = { until: string; row: Row; amountCents: number | null };
export function recurrenceHistory(rule: Row): Period[] {
  const parsed: unknown = rule.scheduleHistory
    ? JSON.parse(String(rule.scheduleHistory))
    : [];
  if (!Array.isArray(parsed) || parsed.length > 2000)
    throw Error('Histórico de recorrência inválido.');
  let previous = '';
  return parsed.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw Error('Vigência inválida.');
    const p = value as Period;
    if (
      !validDate(p.until) ||
      p.until <= previous ||
      !p.row ||
      p.row.id !== rule.id ||
      p.row.scheduleHistory ||
      (p.amountCents !== null &&
        (!Number.isSafeInteger(p.amountCents) || p.amountCents <= 0))
    )
      throw Error('Vigência inválida.');
    const row: Row = {
      archived: 0,
      ...p.row,
      amount: p.amountCents === null ? null : fromCents(p.amountCents),
    };
    validateRow('recurrences', row);
    if (row.effectiveFrom && String(row.effectiveFrom) > p.until)
      throw Error('Vigência invertida.');
    previous = p.until;
    return { until: p.until, row, amountCents: p.amountCents };
  });
}
export function recurrenceAt(rule: Row, date: string): Row {
  return recurrenceHistory(rule).find((p) => date <= p.until)?.row || rule;
}
export function recurrenceFirstDate(rule: Row): string {
  return [
    String(rule.startDate),
    ...recurrenceHistory(rule).map((p) => String(p.row.startDate)),
  ].sort()[0];
}
export function reviseRecurrence(
  previous: Row | undefined,
  next: Row,
  at: string,
): Row {
  if (!validDate(at)) throw Error('Data de edição inválida.');
  if (!previous) return { ...next, effectiveFrom: '', scheduleHistory: '' };
  if (previous.effectiveFrom && at < String(previous.effectiveFrom))
    throw Error(
      'Confira a data do dispositivo antes de editar esta recorrência.',
    );
  const keys = schemas.recurrences
    .map((f) => f.key)
    .filter((k) => !['effectiveFrom', 'scheduleHistory'].includes(k));
  if (keys.every((k) => previous[k] === next[k])) return previous;
  const history = recurrenceHistory(previous);
  if (!previous.effectiveFrom || String(previous.effectiveFrom) < at) {
    const row = { ...previous, scheduleHistory: '', amount: null };
    history.push({
      until: addDays(at, -1),
      row,
      amountCents:
        previous.amount === null ? null : toCents(num(previous.amount)),
    });
  }
  const serialized = history.map((p) => ({
    ...p,
    row: { ...p.row, amount: null },
  }));
  return {
    ...next,
    effectiveFrom: at,
    scheduleHistory: JSON.stringify(serialized),
  };
}

export const recurrenceSources = [
  'expenses',
  'debts',
  'maintenance',
  'plans',
  'investments',
] as const;
export const realizedCollections = [
  'expenses',
  'work',
  'payments',
  'movements',
  'planTransactions',
  'services',
] as const;
export type RealizedCollection = (typeof realizedCollections)[number];
export type Occurrence = {
  id: string;
  recurrenceId: string;
  date: string;
  name: string;
  kind: string;
  amount: number | null;
  account: string;
  category: string;
};
export const occurrenceId = (ruleId: string, date: string) =>
  `${ruleId}@${date}`;
export function addDays(date: string, count: number): string {
  if (!validDate(date) || !Number.isInteger(count))
    throw Error('Data ou intervalo inválido.');
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}

/** Occurrences are derived, never posted to the ledger by a render or timer.
 * The original day is retained after clamping short months (31 Jan → Feb → 31 Mar).
 */
function rawDates(rule: Row, from: string, to: string): string[] {
  validateRow('recurrences', rule);
  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    daysBetween(from, to) > 3660
  )
    throw Error('Janela de recorrência deve ter até 3660 dias.');
  if (rule.status !== 'ativa') return [];
  const start = String(rule.startDate),
    end = rule.endDate
      ? String(rule.endDate) < to
        ? String(rule.endDate)
        : to
      : to;
  if (end < from || start > end) return [];
  if (rule.frequency === 'única')
    return start >= from && start <= end ? [start] : [];
  const stepDays: Record<string, number> = {
    diário: 1,
    semanal: 7,
    quinzenal: 14,
    personalizado: num(rule.intervalDays),
  };
  const stepMonths: Record<string, number> = {
    mensal: 1,
    bimestral: 2,
    trimestral: 3,
    semestral: 6,
    anual: 12,
  };
  const dates: string[] = [];
  if (stepDays[String(rule.frequency)]) {
    const step = stepDays[String(rule.frequency)];
    let i = Math.max(0, Math.ceil(daysBetween(start, from) / step));
    for (
      let date = addDays(start, i * step);
      date <= end;
      date = addDays(start, ++i * step)
    )
      dates.push(date);
  } else {
    const step = stepMonths[String(rule.frequency)];
    if (!step) throw Error('Frequência desconhecida.');
    const difference =
      (Number(from.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
      Number(from.slice(5, 7)) -
      Number(start.slice(5, 7));
    const day =
      rule.dueDay === null ? Number(start.slice(-2)) : num(rule.dueDay);
    for (let i = Math.max(0, Math.floor(difference / step)); ; i++) {
      const first = addMonths(start.slice(0, 7) + '-01', i * step);
      if (first > end) break;
      const lastDay = Number(addDays(addMonths(first, 1), -1).slice(-2));
      const date =
        first.slice(0, 8) + String(Math.min(day, lastDay)).padStart(2, '0');
      if (date >= start && date >= from && date <= end) dates.push(date);
    }
  }
  return dates;
}
export function generateOccurrences(
  rule: Row,
  from: string,
  to: string,
): Occurrence[] {
  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    daysBetween(from, to) > 3660
  )
    throw Error('Janela de recorrência deve ter até 3660 dias.');
  const periods = [
    ...recurrenceHistory(rule),
    { until: to, row: rule, amountCents: null },
  ];
  let after = '';
  const occurrences: Occurrence[] = [];
  for (const period of periods) {
    const start = [from, after, String(period.row.effectiveFrom || '')]
      .sort()
      .at(-1)!;
    const end = period.until < to ? period.until : to;
    if (start <= end)
      occurrences.push(
        ...rawDates(period.row, start, end).map((date) => ({
          id: occurrenceId(rule.id, date),
          recurrenceId: rule.id,
          date,
          name: String(period.row.name),
          kind: String(period.row.kind),
          amount:
            typeof period.row.amount === 'number' ? period.row.amount : null,
          account: String(period.row.account || ''),
          category: String(period.row.category || ''),
        })),
      );
    after = addDays(period.until, 1);
  }
  return occurrences;
}
export function recurrenceDates(rule: Row, from: string, to: string): string[] {
  return generateOccurrences(rule, from, to).map((o) => o.date);
}
export function hasOccurrence(rule: Row, date: string): boolean {
  return (
    rawDates({ ...recurrenceAt(rule, date), status: 'ativa' }, date, date)
      .length > 0
  );
}
export function recurrenceSignature(rule: Row): string {
  return [
    'name',
    'kind',
    'amount',
    'category',
    'account',
    'frequency',
    'startDate',
    'endDate',
    'dueDay',
    'intervalDays',
    'sourceKind',
    'sourceId',
  ]
    .map((k) =>
      String(rule[k] ?? '')
        .trim()
        .toLocaleLowerCase('pt-BR'),
    )
    .join('|');
}
