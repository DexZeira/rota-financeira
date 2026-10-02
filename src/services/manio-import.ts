import type { ImportLine } from './import/types';
import { normalizeDescription } from './import/statement-values';
import type { ManioMapping, ManioSourceRow } from './manio-sheet-parser';

export function manioImportLines(rows: readonly ManioSourceRow[], mapping: ManioMapping): ImportLine[] {
  return rows.map((row, index) => ({
    line: index + 1,
    errors: [],
    transaction: {
      line: index + 1, externalId: row.source_key, date: row.date,
      description: row.description, normalizedDescription: normalizeDescription(row.description),
      amountCents: row.amount_cents, direction: row.type === 'income' ? 'credit' : 'debit',
      accountId: mapping.id, accountLabel: mapping.account_reference,
      document: '', source: 'manio',
    },
  }));
}
