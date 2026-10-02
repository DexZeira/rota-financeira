import { validDate } from '../../model';
import { normalizedTransaction } from '../import/transaction-normalizer';
import { emptyOpenFinance, type OpenFinanceState, type ConnectionType } from './types';

const text = (v: unknown, max = 200): string => {
  if (typeof v !== 'string' || v.length > max)
    throw Error('Metadado bancário inválido.');
  return v;
};
const id = (v: unknown) => {
  const s = text(v, 150);
  if (!s) throw Error('Identificador bancário ausente.');
  return s;
};
const date = (v: unknown) => {
  const s = text(v);
  if (!/^\d{4}-\d\d-\d\dT/.test(s) || !Number.isFinite(Date.parse(s)))
    throw Error('Data bancária inválida.');
  return s;
};
const nullableDate = (v: unknown) => (v === null ? null : date(v));
function choice<T extends string>(v: unknown, values: readonly T[]): T {
  if (!values.includes(v as T)) throw Error('Estado bancário inválido.');
  return v as T;
}
const cents = (v: unknown) => {
  if (v === null) return null;
  if (!Number.isSafeInteger(v) || Math.abs(Number(v)) > 100_000_000_000)
    throw Error('Saldo bancário inválido.');
  return Number(v);
};
const currency = (v: unknown) => {
  const s = text(v, 3);
  if (!/^[A-Z]{3}$/.test(s)) throw Error('Moeda inválida.');
  return s;
};
const error = (v: unknown) =>
  v === null
    ? null
    : choice(v, [
        'AUTH_REQUIRED',
        'CONSENT_EXPIRED',
        'RATE_LIMITED',
        'NETWORK_ERROR',
        'PROVIDER_ERROR',
        'PARTIAL_SYNC',
        'INVALID_RESPONSE',
      ] as const);
export function validateOpenFinance(value: unknown): OpenFinanceState {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Estado bancário inválido.');
  const raw = value as OpenFinanceState;
  for (const [key, limit] of Object.entries({
    connections: 50,
    accounts: 500,
    balances: 500,
    transactions: 100000,
    sync: 500,
  })) {
    const list = raw[key as keyof OpenFinanceState];
    if (
      !Array.isArray(list) ||
      list.length > limit ||
      list.some((v) => !v || typeof v !== 'object')
    )
      throw Error('Limite bancário excedido.');
  }
  // Explicit projection: never persist arbitrary provider payloads or secret fields.
  const result = emptyOpenFinance();
  result.connections = raw.connections.map((c) => ({
    id: id(c.id),
    userId: id(c.userId),
    provider: id(c.provider),
    institutionId: id(c.institutionId),
    institutionName: id(c.institutionName),
    status: choice(c.status, [
      'disconnected',
      'pending_authorization',
      'connected',
      'syncing',
      'expired',
      'revoked',
      'error',
      'reauthorization_required',
    ]),
    consentId: id(c.consentId),
    consentStatus: choice(c.consentStatus, [
      'pending',
      'authorized',
      'expired',
      'revoked',
    ]),
    createdAt: date(c.createdAt),
    updatedAt: date(c.updatedAt),
    expiresAt: nullableDate(c.expiresAt),
    lastSyncAt: nullableDate(c.lastSyncAt),
    lastSuccessfulSyncAt: nullableDate(c.lastSuccessfulSyncAt),
    errorCode: error(c.errorCode),
    nextRetryAt: nullableDate(c.nextRetryAt ?? null),
    externalItemId: (c as Record<string, unknown>).external_item_id
      ? String((c as Record<string, unknown>).external_item_id)
      : null,
    connectionType: ((c as Record<string, unknown>).connection_type
      ? String((c as Record<string, unknown>).connection_type)
      : 'open_finance') as ConnectionType,
  }));
  result.accounts = raw.accounts.map((a) => {
    if (typeof a.active !== 'boolean') throw Error('Conta inválida.');
    return {
      id: id(a.id),
      connectionId: id(a.connectionId),
      externalAccountId: id(a.externalAccountId),
      institutionId: id(a.institutionId),
      name: id(a.name),
      type: choice(a.type, [
        'checking',
        'savings',
        'payment',
        'investment',
        'other',
      ]),
      currency: currency(a.currency),
      maskedNumber: a.maskedNumber
        ? '•••• ' + text(a.maskedNumber).replace(/\D/g, '').slice(-4)
        : '',
      active: a.active,
    };
  });
  result.balances = raw.balances.map((b) => ({
    accountId: id(b.accountId),
    available: cents(b.available),
    current: cents(b.current),
    currency: currency(b.currency),
    asOf: date(b.asOf),
  }));
  result.transactions = raw.transactions.map((r) => {
    const t = r.transaction;
    if (
      !t ||
      t.source !== 'open_finance' ||
      !validDate(t.date) ||
      !Number.isSafeInteger(t.amountCents) ||
      t.amountCents <= 0 ||
      t.amountCents > 100_000_000_000 ||
      !Number.isInteger(t.line) ||
      t.line < 1 ||
      typeof r.reviewed !== 'boolean'
    )
      throw Error('Transação bancária inválida.');
    return {
      id: id(r.id),
      connectionId: id(r.connectionId),
      accountId: id(r.accountId),
      status: choice(r.status, ['pending', 'posted']),
      kind: choice(r.kind, ['normal', 'refund', 'reversal']),
      replacesId: r.replacesId === null ? null : id(r.replacesId),
      reviewed: r.reviewed,
      importLinkId: r.importLinkId === null ? null : id(r.importLinkId),
      transaction: normalizedTransaction({
        line: t.line,
        source: 'open_finance',
        externalId: text(t.externalId),
        date: t.date,
        description: text(t.description, 1000),
        normalizedDescription: '',
        amountCents: t.amountCents,
        direction: choice(t.direction, ['credit', 'debit']),
        accountLabel: text(t.accountLabel),
        accountId: id(r.accountId),
        document: text(t.document),
      }),
    };
  });
  result.sync = raw.sync.map((s) => ({
    connectionId: id(s.connectionId),
    accountId: id(s.accountId),
    cursor: s.cursor === null ? null : text(s.cursor, 200),
    errorCode: error(s.errorCode),
    nextRetryAt: nullableDate(s.nextRetryAt),
  }));
  for (const group of [
    result.connections,
    result.accounts,
    result.transactions,
  ])
    if (new Set(group.map((v) => v.id)).size !== group.length)
      throw Error('ID bancário duplicado.');
  for (const group of [result.balances, result.sync])
    if (new Set(group.map((v) => v.accountId)).size !== group.length)
      throw Error('Conta duplicada.');
  const connections = new Map(result.connections.map((c) => [c.id, c]));
  const accounts = new Map(result.accounts.map((a) => [a.id, a]));
  for (const a of result.accounts)
    if (connections.get(a.connectionId)?.institutionId !== a.institutionId)
      throw Error('Conta bancária órfã.');
  for (const r of [...result.transactions, ...result.sync])
    if (accounts.get(r.accountId)?.connectionId !== r.connectionId)
      throw Error('Vínculo bancário órfão.');
  for (const b of result.balances)
    if (accounts.get(b.accountId)?.currency !== b.currency)
      throw Error('Saldo sem conta ou moeda incompatível.');
  const external = result.transactions
    .filter((r) => r.transaction.externalId)
    .map((r) =>
      JSON.stringify([r.connectionId, r.accountId, r.transaction.externalId]),
    );
  if (new Set(external).size !== external.length)
    throw Error('Identificador externo duplicado.');
  return result;
}

export function restoredOpenFinance(state: OpenFinanceState): OpenFinanceState {
  return {
    ...state,
    sync: state.sync.map((s) => ({ ...s, cursor: null, nextRetryAt: null })),
    connections: state.connections.map((c) =>
      c.status === 'revoked'
        ? c
        : {
            ...c,
            status: 'reauthorization_required',
            consentStatus: 'pending',
            nextRetryAt: null,
            errorCode: null,
          },
    ),
  };
}

export function transactionPage(
  state: OpenFinanceState | undefined,
  owner: string,
  requestedPage: number,
) {
  const connections = new Set(
    state?.connections.filter((c) => c.userId === owner).map((c) => c.id),
  );
  const transactions = (state?.transactions || []).filter((t) =>
    connections.has(t.connectionId),
  );
  const page = Math.max(
    0,
    Math.min(
      Math.floor(requestedPage),
      Math.max(0, Math.ceil(transactions.length / 25) - 1),
    ),
  );
  return {
    total: transactions.length,
    page,
    rows: transactions.slice(page * 25, (page + 1) * 25),
  };
}
