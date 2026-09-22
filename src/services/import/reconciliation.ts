import { num, type Data } from '../../model';
import { debtState } from '../../calculations';
import { toCents } from '../money-codec';
import { addDays, hasOccurrence } from '../recurrences';
import type { Transaction, RecordKind } from './types';
import { normalizeDescription } from './transaction-normalizer';
export type Candidate = {
  kind: RecordKind | 'debts' | 'recurrences';
  id: string;
  name: string;
  date: string;
  amountCents: number;
  direction: 'credit' | 'debit';
  level: 'high_confidence' | 'possible';
  reason: string;
  account?: string;
};
const key = (amount: number, date: string, direction: string) =>
  `${amount}:${date}:${direction}`;
export function reconciliationIndex(d: Data) {
  const days = new Map<string, Candidate[]>(),
    descriptions = new Map<string, Candidate[]>();
  const debtNames = new Map(d.debts.map((r) => [r.id, r.name])),
    investmentNames = new Map(d.investments.map((r) => [r.id, r.name])),
    linkedCosts = new Set(d.maintenance.map((r) => r.costId));
  const planned = new Map<string, Candidate[]>(),
    rules = new Map(d.recurrences.map((r) => [r.id, r]));
  const accounts = new Map(
    d.imports.links
      .filter((l) => l.recordId)
      .map((l) => [
        l.recordKind + ':' + l.recordId,
        l.transaction.accountLabel,
      ]),
  );
  const add = (r: Candidate) => {
    for (const [map, k] of [
      [days, key(r.amountCents, r.date, r.direction)],
      [
        descriptions,
        key(r.amountCents, r.date, r.direction) +
          ':' +
          normalizeDescription(r.name),
      ],
    ] as const) {
      const list = map.get(k) ?? [];
      if (list.length < 40) list.push(r);
      map.set(k, list);
    }
  };
  for (const kind of [
    'bankReceipts',
    'expenses',
    'work',
    'payments',
    'movements',
    'services',
    'maintenance',
    'costs',
    'fund',
    'planTransactions',
  ] as const)
    for (const r of d[kind]) {
      if (
        kind === 'movements' &&
        !['aporte', 'retirada'].includes(String(r.kind))
      )
        continue;
      if (kind === 'maintenance' && (r.costId || num(r.value) <= 0)) continue;
      if (kind === 'costs' && linkedCosts.has(r.id)) continue;
      const date = String(kind === 'maintenance' ? r.lastDate : r.date);
      const amount =
        kind === 'bankReceipts'
          ? num(r.amountCents)
          : toCents(
              num(
                kind === 'work'
                  ? r.revenue
                  : kind === 'maintenance'
                    ? r.value
                    : r.amount,
              ),
            );
      const direction =
        kind === 'bankReceipts' ||
        kind === 'work' ||
        (kind === 'movements' && r.kind === 'retirada') ||
        (kind === 'planTransactions' && r.kind === 'withdraw')
          ? 'credit'
          : 'debit';
      if (amount > 0)
        add({
          kind,
          account: String(r.account || accounts.get(kind + ':' + r.id) || ''),
          id: r.id,
          name: String(
            r.name ||
              r.notes ||
              r.activity ||
              debtNames.get(String(r.debtId)) ||
              investmentNames.get(String(r.investmentId)) ||
              'Lançamento',
          ),
          date,
          amountCents: amount,
          direction,
          level: 'possible',
          reason: 'Mesmo valor e direção; revise data e descrição.',
        });
    }
  for (const r of d.debts)
    if (debtState(d, r).balance > 0)
      add({
        kind: 'debts',
        id: r.id,
        name: String(r.name),
        date: String(r.due),
        amountCents: toCents(num(r.installmentAmount) || num(r.installment)),
        direction: 'debit',
        level: 'possible',
        reason: 'Parcela prevista; associar exige registrar um pagamento.',
      });
  for (const r of d.recurrences)
    if (r.status === 'ativa' && num(r.amount) > 0)
      add({
        kind: 'recurrences',
        account: String(r.account || ''),
        id: r.id,
        name: String(r.name),
        date: String(r.startDate),
        amountCents: toCents(num(r.amount)),
        direction: r.kind === 'receita' ? 'credit' : 'debit',
        level: 'possible',
        reason: 'Previsão, não pagamento realizado. Confira no Planejamento.',
      });
  for (const list of days.values())
    for (const candidate of list)
      if (candidate.kind === 'debts' || candidate.kind === 'recurrences') {
        const k = candidate.amountCents + ':' + candidate.direction;
        const group = planned.get(k) ?? [];
        if (group.length < 40) group.push(candidate);
        planned.set(k, group);
      }
  return { days, descriptions, planned, rules };
}
export function reconcileTransaction(
  t: Transaction,
  index: ReturnType<typeof reconciliationIndex>,
) {
  const result = new Map<string, Candidate>();
  for (const c of index.planned.get(t.amountCents + ':' + t.direction) ?? []) {
    if (c.account && t.accountLabel && c.account !== t.accountLabel) continue;
    const offset =
      c.kind === 'recurrences'
        ? [0, -1, 1, -2, 2].find((n) =>
            hasOccurrence(index.rules.get(c.id)!, addDays(t.date, n)),
          )
        : 0;
    if (offset !== undefined)
      result.set(c.kind + ':' + c.id, {
        ...c,
        date: c.kind === 'recurrences' ? addDays(t.date, offset) : c.date,
      });
  }
  for (let offset = -2; offset <= 2; offset++) {
    const k = key(t.amountCents, addDays(t.date, offset), t.direction);
    for (const c of [
      ...(index.descriptions.get(k + ':' + t.normalizedDescription) ?? []),
      ...(index.days.get(k) ?? []),
    ]) {
      if (c.account && t.accountLabel && c.account !== t.accountLabel) continue;
      const identical =
        c.date === t.date &&
        normalizeDescription(c.name) === t.normalizedDescription;
      result.set(c.kind + ':' + c.id, {
        ...c,
        level:
          identical && c.kind !== 'debts' && c.kind !== 'recurrences'
            ? 'high_confidence'
            : 'possible',
        reason: identical
          ? 'Mesma data, valor, direção e descrição; confirme o vínculo.'
          : c.reason,
      });
    }
  }
  return [...result.values()].slice(0, 40);
}
export function transferSuggestions(transactions: Transaction[]) {
  const index = new Map<string, Transaction[]>(),
    result = new Map<number, number[]>();
  for (const t of transactions) {
    const k = key(t.amountCents, t.date, t.direction);
    const list = index.get(k) ?? [];
    if (list.length < 20) list.push(t);
    index.set(k, list);
  }
  for (const t of transactions) {
    if (!t.accountLabel) continue;
    const matches: number[] = [];
    for (let i = -2; i <= 2; i++)
      for (const other of index.get(
        key(
          t.amountCents,
          addDays(t.date, i),
          t.direction === 'debit' ? 'credit' : 'debit',
        ),
      ) ?? [])
        if (other.accountLabel && other.accountLabel !== t.accountLabel)
          matches.push(other.line);
    if (matches.length) result.set(t.line, matches);
  }
  return result;
}
