import { type Data, type Row, num } from '../model';
import { detectSubscriptions } from './import/subscription-detection';
import { debtState, investmentBalance } from '../calculations';
import { assetRows } from './assets';
export type SearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  date?: string;
  amountCents?: number;
  route: string;
  sourceId: string;
  searchableText: string;
};
type IndexedResult = SearchResult & {
  normalizedTitle: string;
  normalizedSubtitle: string;
};
export const searchFilters = [
  'Todos',
  'Gastos',
  'Dívidas',
  'Investimentos',
  'Planos',
  'Moto',
  'Patrimônio',
  'Relatórios',
  'Importações',
] as const;
export const normalizeSearch = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ');
/** Derived once per immutable data revision; never persisted or sent to a service. */
export function buildSearchIndex(d: Data, at: string): IndexedResult[] {
  const results: IndexedResult[] = [];
  const linked = (rows: Row[], field: string) => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = String(r[field]);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  };
  const payments = linked(d.payments, 'debtId'),
    movements = linked(d.movements, 'investmentId');
  const add = (r: Omit<SearchResult, 'searchableText'>, metadata = '') => {
    const date = r.date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    results.push({
      ...r,
      normalizedTitle: normalizeSearch(r.title),
      normalizedSubtitle: normalizeSearch(r.subtitle || ''),
      searchableText: normalizeSearch(
        `${metadata} ${r.date || ''} ${date ? `${date[3]}/${date[2]}/${date[1]}` : ''}`,
      ),
    });
  };
  const sources = [
    ['expenses', 'Gastos', 'Gastos', 'amount'],
    ['bankReceipts', 'Receitas', 'Importar', 'amountCents'],
    ['work', 'Trabalho', 'Trabalho', 'revenue'],
    ['debts', 'Dívidas', 'Dívidas', ''],
    ['investments', 'Investimentos', 'Investimentos', ''],
    ['plans', 'Planos', 'Planos', 'target'],
    ['recurrences', 'Recorrências', 'Planejamento', 'amount'],
    ['maintenance', 'Moto', 'Manutenção', ''],
    ['services', 'Moto', 'Manutenção', 'amount'],
    ['assets', 'Patrimônio', 'Patrimônio', ''],
  ] as const;
  for (const [key, type, route, amount] of sources)
    for (const r of key === 'assets' ? assetRows(d) : d[key]) {
      const cents =
        amount &&
        r[amount] !== null &&
        r[amount] !== '' &&
        r[amount] !== undefined
          ? Math.round(num(r[amount]) * (amount.endsWith('Cents') ? 1 : 100))
          : undefined;
      add(
        {
          id: `${key}:${r.id}`,
          type,
          title: String(r.name || r.activity || 'Registro'),
          subtitle: String(r.category || r.institution || r.notes || type),
          date:
            String(r.date || r.due || r.startDate || r.purchaseDate || '') ||
            undefined,
          amountCents:
            key === 'debts'
              ? Math.round(
                  debtState({ ...d, payments: payments.get(r.id) || [] }, r, at)
                    .balance * 100,
                )
              : key === 'investments'
                ? Math.round(
                    investmentBalance(
                      { ...d, movements: movements.get(r.id) || [] },
                      r,
                      at,
                    ) * 100,
                  )
                : cents,
          route,
          sourceId: r.id,
        },
        metadata(r),
      );
    }
  for (const c of d.reporting.closures)
    add({
      id: `report:${c.period}`,
      type: 'Relatórios',
      title: `Fechamento ${c.period}`,
      subtitle: c.status === 'closed' ? 'Fechado' : 'Reaberto',
      date: c.revisions.at(-1)?.through,
      route: 'Relatórios',
      sourceId: c.period,
    });
  for (const s of d.imports.sessions)
    add({
      id: `import:${s.id}`,
      type: 'Importações',
      title: s.fileName,
      subtitle: `${s.rowCount} linhas · ${s.source}`,
      date: s.createdAt.slice(0, 10),
      route: 'Importar',
      sourceId: s.id,
    });
  for (const l of d.imports.links)
    add(
      {
        id: `import-link:${l.id}`,
        type: 'Importações',
        title: l.transaction.description,
        subtitle: l.transaction.accountLabel,
        date: l.transaction.date,
        amountCents: l.transaction.amountCents,
        route: 'Importar',
        sourceId: l.id,
      },
      l.transaction.externalId,
    );
  for (const s of detectSubscriptions(
    d.imports.links
      .filter((l) => l.action === 'created' || l.action === 'matched')
      .map((l) => l.transaction),
    at,
  ))
    add({
      id: `subscription:${s.key}`,
      type: 'Assinaturas',
      title: s.name,
      subtitle: `${s.category} · estimado`,
      date: s.lastDate,
      amountCents: s.averageCents,
      route: 'Importar',
      sourceId: s.key,
    });
  return results;
}
function metadata(r: Row) {
  return Object.values(r)
    .filter((v) => v !== null)
    .join(' ');
}
export function searchIndex(
  index: IndexedResult[],
  query: string,
  filter = 'Todos',
  limit = 30,
) {
  const q = normalizeSearch(query);
  if (!q) return { results: [] as SearchResult[], total: 0 };
  const money = /^(?:r\$\s*)?(\d+)(?:[,.](\d{1,2}))?$/.exec(q);
  const cents = money
    ? Number(money[1]) * 100 + Number((money[2] || '').padEnd(2, '0'))
    : null;
  const buckets: IndexedResult[][] = [[], [], [], [], []];
  let total = 0;
  for (const r of index) {
    if (filter !== 'Todos' && r.type !== filter) continue;
    const rank =
      r.normalizedTitle === q
        ? 0
        : r.normalizedTitle.startsWith(q)
          ? 1
          : r.normalizedTitle.includes(q)
            ? 2
            : r.normalizedSubtitle.includes(q)
              ? 3
              : r.searchableText.includes(q) ||
                  (cents !== null && r.amountCents === cents)
                ? 4
                : -1;
    if (rank < 0) continue;
    total++;
    if (buckets[rank].length < limit) buckets[rank].push(r);
  }
  return { results: buckets.flat().slice(0, limit) as SearchResult[], total };
}
