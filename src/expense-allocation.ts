import { type Row, type Data, num } from './model';

export const attributionKeys = [
  'scope',
  'allocation',
  'workSessionId',
  'workActivity',
  'periodFrom',
  'periodTo',
  'workAmount',
];
export function workExpenseAmount(r: Row) {
  return r.scope === 'trabalho'
    ? num(r.amount)
    : ['moto', 'compartilhada'].includes(String(r.scope))
      ? num(r.workAmount)
      : 0;
}
export function validateAttribution(r: Row, d?: Data) {
  if (
    ['moto', 'compartilhada'].includes(String(r.scope)) &&
    num(r.workAmount) > num(r.amount)
  )
    throw Error('A parcela do trabalho não pode superar o valor pago.');
  if (r.scope === 'pessoal') return;
  if (
    r.allocation === 'sessão' &&
    (!r.workSessionId || (d && !d.work.some((w) => w.id === r.workSessionId)))
  )
    throw Error('Selecione uma sessão de trabalho existente.');
  if (r.allocation === 'atividade' && !String(r.workActivity ?? '').trim())
    throw Error('Informe a atividade da despesa.');
  if (
    r.allocation === 'período' &&
    (!r.periodFrom || !r.periodTo || String(r.periodFrom) > String(r.periodTo))
  )
    throw Error('Informe um período válido para a despesa.');
}
export function detachWorkExpense(r: Row, work: Row[]) {
  const session = work.find((w) => w.id === r.workSessionId);
  return session
    ? {
        ...r,
        workSessionId: '',
        allocation: 'atividade',
        workActivity: session.activity,
      }
    : r;
}
export function attributedExpenses(
  d: Data,
  rows: Row[],
  activity = 'todos',
  from = '',
  to = '',
) {
  const ids = new Set(rows.map((w) => w.id));
  const all = [
    ...d.expenses.map((r) => ({ row: r, kind: 'expenses' as const })),
    ...d.services.map((r) => ({ row: r, kind: 'services' as const })),
  ];
  return all.filter(({ row: r }) => {
    if (!workExpenseAmount(r)) return false;
    if (r.allocation === 'sessão') return ids.has(String(r.workSessionId));
    return (
      (!from || String(r.date) >= from) &&
      (!to || String(r.date) <= to) &&
      (activity === 'todos' || r.workActivity === activity)
    );
  });
}
