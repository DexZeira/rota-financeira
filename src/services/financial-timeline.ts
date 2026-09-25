import { type Data, type Row, num, validDate } from '../model';
import { toCents } from './money-codec';
import { assetRows } from './assets';
export type FinancialTimelineEvent = {
  id: string;
  date: string;
  type: string;
  title: string;
  amountCents?: number;
  direction: 'in' | 'out' | 'neutral';
  source: string;
  sourceId: string;
  imported: boolean;
  origin: string;
  reference: string;
};
/** Derived events only. Imported/recurrent links annotate the ledger event instead of duplicating it. */
export function generateFinancialTimeline(
  d: Data,
  period?: string,
): FinancialTimelineEvent[] {
  const events = new Map<string, FinancialTimelineEvent>();
  const names = (rows: Row[]) =>
    new Map(rows.map((r) => [r.id, String(r.name || r.id)]));
  const debts = names(d.debts),
    investments = names(d.investments),
    maintenance = names(d.maintenance),
    assets = names(assetRows(d));
  const push = (
    source: string,
    r: Row,
    type: string,
    title: string,
    amountCents: number | undefined,
    direction: FinancialTimelineEvent['direction'],
    date = String(r.date),
    suffix = '',
  ) => {
    if (!validDate(date) || (period && !date.startsWith(period))) return;
    const id = source + ':' + r.id + suffix;
    events.set(id, {
      id,
      date,
      type,
      title,
      amountCents,
      direction,
      source,
      sourceId: r.id,
      imported: false,
      origin: 'Registro local',
      reference: r.id,
    });
  };
  for (const r of d.work)
    push(
      'work',
      r,
      'income',
      String(r.name || r.activity || 'Trabalho'),
      toCents(num(r.revenue)),
      'in',
    );
  for (const r of d.bankReceipts)
    push(
      'bankReceipts',
      r,
      'income',
      String(r.name || 'Receita bancária'),
      num(r.amountCents),
      'in',
    );
  for (const r of d.expenses)
    push(
      'expenses',
      r,
      'expense',
      String(r.name || 'Gasto'),
      toCents(num(r.amount)),
      'out',
    );
  for (const r of d.payments)
    push(
      'payments',
      r,
      'debt',
      'Pagamento · ' + (debts.get(String(r.debtId)) || 'Dívida'),
      toCents(num(r.amount)),
      'out',
    );
  for (const r of d.movements)
    push(
      'movements',
      r,
      'investment',
      String(r.kind) +
        ' · ' +
        (investments.get(String(r.investmentId)) || 'Investimento'),
      toCents(num(r.amount)),
      r.kind === 'aporte' ? 'out' : r.kind === 'retirada' ? 'in' : 'neutral',
    );
  for (const r of d.services)
    push(
      'services',
      r,
      'maintenance',
      maintenance.get(String(r.maintenanceId)) || 'Manutenção',
      toCents(num(r.amount)),
      'out',
    );
  for (const r of d.planTransactions)
    push(
      'planTransactions',
      r,
      'transfer',
      'Alocação interna · plano',
      toCents(num(r.amount)),
      'neutral',
    );
  for (const r of d.fund)
    push(
      'fund',
      r,
      'transfer',
      'Alocação interna · reserva da moto',
      toCents(num(r.amount)),
      'neutral',
    );
  for (const r of d.assetValuations)
    push(
      'assetValuations',
      r,
      'asset',
      'Avaliação · ' + (assets.get(String(r.assetId)) || 'Bem'),
      num(r.valueCents),
      'neutral',
    );
  for (const r of assetRows(d)) {
    if (r.purchaseDate)
      push(
        'assets',
        r,
        'asset',
        'Compra · ' + String(r.name),
        r.cashPurchase === 'sim' ? num(r.cashPurchaseCents) : undefined,
        r.cashPurchase === 'sim' ? 'out' : 'neutral',
        String(r.purchaseDate),
        ':purchase',
      );
    if (r.soldAt)
      push(
        'assets',
        r,
        'asset',
        'Venda · ' + String(r.name),
        r.cashSale === 'sim' ? num(r.saleValueCents) : undefined,
        r.cashSale === 'sim' ? 'in' : 'neutral',
        String(r.soldAt),
        ':sale',
      );
  }
  for (const link of d.imports.links) {
    const event = events.get(link.recordKind + ':' + link.recordId);
    if (event && ['created', 'matched'].includes(link.action)) {
      event.imported = true;
      event.origin = 'Importação ' + link.transaction.source.toUpperCase();
      event.reference =
        link.recordKind +
        ':' +
        link.recordId +
        ' · extrato ' +
        link.transaction.externalId;
    } else if (
      link.action === 'transfer' &&
      (!period || link.transaction.date.startsWith(period))
    ) {
      events.set('import:' + link.id, {
        id: 'import:' + link.id,
        date: link.transaction.date,
        type: 'transfer',
        title: link.transaction.description,
        amountCents: link.transaction.amountCents,
        direction: 'neutral',
        source: 'imports',
        sourceId: link.id,
        imported: true,
        origin:
          'Transferência interna · ' + link.transaction.source.toUpperCase(),
        reference: link.transaction.accountLabel,
      });
    }
  }
  for (const resolution of d.forecastResolutions) {
    if (resolution.action !== 'vincular') continue;
    const event = events.get(resolution.recordKind + ':' + resolution.recordId);
    if (event)
      event.reference +=
        ' · recorrência ' +
        String(resolution.recurrenceId) +
        ' em ' +
        String(resolution.occurrenceDate);
  }
  for (const session of d.imports.sessions) {
    const date = session.createdAt.slice(0, 10);
    if (period && !date.startsWith(period)) continue;
    events.set('import-session:' + session.id, {
      id: 'import-session:' + session.id,
      date,
      type: 'import',
      title: 'Importação ' + session.source.toUpperCase(),
      direction: 'neutral',
      source: 'importSessions',
      sourceId: session.id,
      imported: true,
      origin: 'Sessão de importação',
      reference: `${session.importedCount} criados · ${session.matchedCount} conciliados`,
    });
  }
  return [...events.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
}
export const timelineFilters = [
  'Todos',
  'Entradas',
  'Saídas',
  'Investimentos',
  'Dívidas',
  'Patrimônio',
  'Moto',
  'Importados',
] as const;
export function filterTimelineEvents(
  events: FinancialTimelineEvent[],
  filter: string,
  query = '',
) {
  const term = query.trim().toLocaleLowerCase('pt-BR');
  return events.filter(
    (e) =>
      (!term ||
        (e.title + ' ' + e.reference + ' ' + e.origin)
          .toLocaleLowerCase('pt-BR')
          .includes(term)) &&
      (filter === 'Todos' ||
        (filter === 'Entradas' && e.direction === 'in') ||
        (filter === 'Saídas' && e.direction === 'out') ||
        (filter === 'Investimentos' && e.type === 'investment') ||
        (filter === 'Dívidas' && e.type === 'debt') ||
        (filter === 'Patrimônio' && e.type === 'asset') ||
        (filter === 'Moto' && e.type === 'maintenance') ||
        (filter === 'Importados' && e.imported)),
  );
}
export function groupTimelineEvents(
  events: FinancialTimelineEvent[],
  groupBy: 'day' | 'month',
) {
  const groups = new Map<string, FinancialTimelineEvent[]>();
  for (const event of events) {
    const key = groupBy === 'day' ? event.date : event.date.slice(0, 7);
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  return groups;
}
/** Bounded accessible window: same slice drives keyboard and pointer navigation. */
export function timelineWindow(
  events: FinancialTimelineEvent[],
  page: number,
  size = 30,
) {
  const pages = Math.max(1, Math.ceil(events.length / size)),
    current = Math.max(0, Math.min(page, pages - 1));
  return {
    rows: events.slice(current * size, (current + 1) * size),
    page: current,
    pages,
  };
}
