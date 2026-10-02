import { dateOnly, normalizeDescription, parseAmount } from './import/statement-values.ts';

export type ManioSourceRow = {
  source_key: string;
  external_id: string | null;
  date: string;
  description: string;
  amount_cents: number;
  type: 'income' | 'expense' | 'transfer';
  source_category: string;
  source_account: string;
};
export type ManioMapping = { id: string; institution_name: string; account_reference: string };
export type ManioColumns = Partial<Record<'date' | 'description' | 'amount' | 'category' | 'account' | 'id' | 'type', number>> & { date: number; description: number; amount: number };
const aliases = {
  date: ['date', 'data', 'transaction date'],
  description: ['description', 'descricao', 'merchant', 'estabelecimento', 'name'],
  amount: ['amount', 'valor', 'value'],
  category: ['category', 'categoria'],
  account: ['account', 'conta', 'account name', 'nome da conta'],
  id: ['id', 'transaction id'],
  type: ['type', 'tipo'],
} as const;
export function detectManioColumns(headers: readonly string[]): ManioColumns {
  const found: Partial<ManioColumns> = {};
  for (const key of Object.keys(aliases) as (keyof typeof aliases)[]) {
    const matches = headers.flatMap((h, i) => (aliases[key] as readonly string[]).includes(normalizeDescription(h)) ? [i] : []);
    if (matches.length > 1) throw Error('As colunas necessárias são ambíguas.');
    if (matches.length) found[key] = matches[0];
  }
  if (found.date === undefined || found.description === undefined || found.amount === undefined)
    throw Error('Não foi possível identificar as colunas Data, Valor e Descrição.');
  return found as ManioColumns;
}
async function fingerprint(value: readonly (string | number)[]) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function normalizeManioRows(rows: readonly (readonly string[])[], mapping: ManioMapping): Promise<ManioSourceRow[]> {
  if (!rows.length || rows.length > 50001) throw Error('Planilha vazia ou acima do limite.');
  const columns = detectManioColumns(rows[0]);
  const result: ManioSourceRow[] = [], seen = new Set<string>(), accounts = new Set<string>();
  for (const row of rows.slice(1)) {
    if (row.every(v => !v.trim())) continue;
    const cell = (key: keyof ManioColumns) => columns[key] === undefined ? '' : (row[columns[key]!] ?? '').trim();
    const rawDate = cell('date').replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (_, d: string, m: string, y: string) => `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`);
    const date = dateOnly(rawDate), description = cell('description'), signed = parseAmount(cell('amount'));
    const external_id = cell('id') || null, source_category = cell('category'), source_account = cell('account');
    if (!description || description.length > 1000 || (external_id?.length ?? 0) > 197 || source_category.length > 100 || source_account.length > 200)
      throw Error('Linha incompleta ou acima do limite.');
    if (source_account) accounts.add(normalizeDescription(source_account));
    if (accounts.size > 1) throw Error('Mapeie cada conta em uma aba separada.');
    const explicit = normalizeDescription(cell('type'));
    let type: ManioSourceRow['type'] = signed > 0 ? 'income' : 'expense';
    if (['income', 'credit', 'credito', 'receita', 'entrada', 'c'].includes(explicit)) type = 'income';
    else if (['expense', 'debit', 'debito', 'despesa', 'saida', 'd'].includes(explicit)) type = 'expense';
    else if (['transfer', 'transferencia', 'xfer'].includes(explicit)) type = 'transfer';
    else if (explicit) throw Error('Tipo de movimento não reconhecido.');
    const amount_cents = Math.abs(signed);
    const economicAmount = type === 'expense' ? -amount_cents : type === 'income' ? amount_cents : signed;
    const source_key = external_id ? `id:${external_id}` : `sha256:${await fingerprint([normalizeDescription(mapping.institution_name), normalizeDescription(mapping.account_reference), date, normalizeDescription(description), economicAmount, type])}`;
    // Without a distinct external ID identical rows can be different economic events. Never silently drop them.
    if (seen.has(source_key)) throw Error('Identificadores repetidos ou movimentos ambíguos; revise a planilha.');
    seen.add(source_key);
    result.push({ source_key, external_id, date, description, amount_cents, type, source_category, source_account });
  }
  return result;
}
