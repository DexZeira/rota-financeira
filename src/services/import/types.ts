export type Source = 'csv' | 'ofx';
export type Direction = 'credit' | 'debit';
export type Transaction = {
  line: number;
  externalId: string;
  date: string;
  description: string;
  normalizedDescription: string;
  amountCents: number;
  direction: Direction;
  accountLabel: string;
  accountId?: string;
  document: string;
  source: Source;
};
export type ImportLine = {
  line: number;
  transaction: Transaction | null;
  errors: string[];
};
export type Mapping = {
  date: number;
  description: number;
  amount: number;
  credit: number;
  debit: number;
  type: number;
  externalId: number;
  account: number;
  document: number;
};
export type CsvOptions = {
  delimiter: ';' | ',';
  header: boolean;
  locale: 'auto' | 'br' | 'en';
  account: string;
  mapping: Mapping;
};
export type Profile = { id: string; name: string; options: CsvOptions };
export type Rule = {
  id: string;
  pattern: string;
  mode: 'equals' | 'contains' | 'startsWith' | 'regex';
  category: string;
  enabled: boolean;
};
export type RecordKind =
  | 'bankReceipts'
  | 'expenses'
  | 'work'
  | 'payments'
  | 'movements'
  | 'services'
  | 'maintenance'
  | 'costs'
  | 'fund'
  | 'planTransactions';
export type Link = {
  id: string;
  sessionId: string;
  transaction: Transaction;
  action: 'created' | 'matched' | 'ignored' | 'transfer';
  recordKind: RecordKind | '';
  recordId: string;
  fingerprint: string;
};
export type Session = {
  id: string;
  source: Source;
  fileName: string;
  createdAt: string;
  hash: string;
  rowCount: number;
  importedCount: number;
  matchedCount: number;
  ignoredCount: number;
  duplicateCount: number;
  invalidCount: number;
};
export type ImportState = {
  sessions: Session[];
  profiles: Profile[];
  links: Link[];
  rules: Rule[];
};
export const emptyImports = (): ImportState => ({
  sessions: [],
  profiles: [],
  links: [],
  rules: [],
});
export const emptyMapping = (): Mapping => ({
  date: -1,
  description: -1,
  amount: -1,
  credit: -1,
  debit: -1,
  type: -1,
  externalId: -1,
  account: -1,
  document: -1,
});
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 50000;
export type Review = {
  action:
    | 'pending'
    | 'create'
    | 'match'
    | 'ignore'
    | 'transfer'
    | 'payment'
    | 'investment';
  category: string;
  recordKind: RecordKind | '';
  recordId: string;
  override: boolean;
  remember: boolean;
  transferLine?: number;
  recurrenceId?: string;
};
