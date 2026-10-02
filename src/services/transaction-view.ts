import { num, type Collection, type Data, type Row } from '../model';
import { toCents } from './money-codec';
import { cashCharge, movementCashCents, paidIncome } from './investment-ledger';

export type TransactionView = {
  id: string; kind: Collection; row: Row; date: string; description: string;
  category: string; account: string; amountCents: number; direction: 'Entrada' | 'Saída' | 'Transferência' | 'Ajuste patrimonial';
  origin: string; status: string;
};
/** Presentation only. No posting, balance calculation, matching or storage writes. */
export function transactionView(data: Data): TransactionView[] {
  const links = new Map<string, typeof data.imports.links>();
  for (const link of data.imports.links) {
    if (!link.recordKind || !link.recordId || !['created', 'matched'].includes(link.action)) continue;
    const key = `${link.recordKind}:${link.recordId}`;
    links.set(key, [...(links.get(key) || []), link]);
  }
  const types = [
    ['work', 'revenue', 'Entrada', 'Trabalho'],
    ['bankReceipts', 'amountCents', 'Entrada', 'Receita bancária'],
    ['expenses', 'amount', 'Saída', 'Gasto'],
    ['services', 'amount', 'Saída', 'Manutenção'],
    ['payments', 'amount', 'Saída', 'Pagamento de dívida'],
    ['movements', 'amount', 'Transferência', 'Investimento'],
  ] as const;
  return types.flatMap(([kind, field, direction, label]) => data[kind].map((row): TransactionView => {
    const linked = links.get(`${kind}:${row.id}`) || [];
    const accounts = [...new Set(linked.map(link => link.transaction.accountLabel).filter(Boolean))];
    const origins = [...new Set(linked.map(link => link.transaction.source))];
    const receivedIncome = kind === 'movements' && paidIncome(row);
    return {
      id: `${kind}:${row.id}`, kind, row, date: String(row.date || ''),
      description: String(row.name || row.description || row.activity || row.notes || label),
      category: String(row.category || label),
      account: accounts.length > 1 ? 'Múltiplas referências' : accounts[0] || String(row.account || 'Não informada'),
      amountCents: field === 'amountCents' ? num(row[field]) : toCents(num(row[field])),
      direction: receivedIncome ? 'Entrada' : kind === 'movements' && cashCharge(row) ? 'Saída' : kind === 'movements' && !['aporte', 'retirada'].includes(String(row.kind)) ? 'Ajuste patrimonial' : direction,
      origin: origins.length > 1 ? 'Importado' : ({ csv: 'CSV', ofx: 'OFX', open_finance: 'Open Finance', manio: 'Manio' } as const)[origins[0]] || 'Manual',
      status: linked.length ? 'Revisado' : 'Registrado',
    };
  })).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** Recorded cash movements only: never converts an internal transfer into income. */
export function cashFlowPoints(data: Data, from: string, through: string, daily: boolean) {
  const buckets = new Map<string, { date: string; income: number; expense: number }>();
  for (const row of transactionView(data)) {
    if (row.date < from || row.date > through) continue;
    let cashCents: number;
    if (row.kind === 'movements') {
      cashCents = movementCashCents(row.row);
      if (row.row.kind === 'aporte') cashCents += row.amountCents;
      else if (row.row.kind === 'retirada') cashCents -= row.amountCents;
    } else {
      if (!['Entrada', 'Saída'].includes(row.direction)) continue;
      cashCents = row.direction === 'Entrada' ? row.amountCents : -row.amountCents;
    }
    if (!cashCents) continue;
    const date = daily ? row.date : row.date.slice(0, 7);
    const point = buckets.get(date) || { date, income: 0, expense: 0 };
    if (cashCents > 0) point.income += cashCents;
    else point.expense -= cashCents;
    buckets.set(date, point);
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}
