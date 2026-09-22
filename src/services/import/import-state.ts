import { validDate } from '../../model';
import { safeRule } from './categorization-rules';
import { normalizedTransaction } from './transaction-normalizer';
import {
  emptyImports,
  emptyMapping,
  type ImportState,
  type Transaction,
  type Profile,
} from './types';

export function validateProfile(p: Profile) {
  const o = p.options;
  if (
    !p.name.trim() ||
    p.name.length > 100 ||
    ![';', ','].includes(o.delimiter) ||
    !['auto', 'br', 'en'].includes(o.locale) ||
    typeof o.header !== 'boolean' ||
    typeof o.account !== 'string' ||
    o.account.length > 200
  )
    throw Error('Perfil de importação inválido.');
  if (
    !o.mapping ||
    Object.values(o.mapping).length !== 9 ||
    Object.keys(emptyMapping()).some((key) => !Object.hasOwn(o.mapping, key)) ||
    Object.values(o.mapping).some(
      (v) => !Number.isInteger(v) || v < -1 || v > 200,
    )
  )
    throw Error('Mapeamento inválido.');
}
export function validateImports(value: unknown): ImportState {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Metadados de importação inválidos.');
  const state = value as ImportState;
  const limits = { sessions: 10000, profiles: 100, rules: 500, links: 100000 };
  for (const key of Object.keys(limits) as (keyof ImportState)[]) {
    if (!Array.isArray(state[key]) || state[key].length > limits[key])
      throw Error('Limite de metadados de importação excedido.');
    const ids = new Set<string>();
    for (const item of state[key]) {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.id !== 'string' ||
        !item.id ||
        item.id.length > 150 ||
        ids.has(item.id)
      )
        throw Error('ID de importação inválido.');
      ids.add(item.id);
    }
  }
  for (const s of state.sessions) {
    if (
      !['csv', 'ofx'].includes(s.source) ||
      typeof s.fileName !== 'string' ||
      s.fileName.length > 200 ||
      !/^\d{4}-\d\d-\d\dT/.test(s.createdAt) ||
      !Number.isFinite(Date.parse(s.createdAt)) ||
      !/^[a-f0-9]{64}$/.test(s.hash)
    )
      throw Error('Sessão de importação inválida.');
    for (const key of [
      'rowCount',
      'importedCount',
      'matchedCount',
      'ignoredCount',
      'duplicateCount',
      'invalidCount',
    ] as const)
      if (!Number.isInteger(s[key]) || s[key] < 0 || s[key] > 50000)
        throw Error('Contagem de importação inválida.');
  }
  const sessions = new Set(state.sessions.map((s) => s.id));
  for (const link of state.links) {
    const t = link.transaction as Transaction;
    if (
      !sessions.has(link.sessionId) ||
      !['created', 'matched', 'ignored', 'transfer'].includes(link.action) ||
      ![
        '',
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
      ].includes(link.recordKind) ||
      typeof link.recordId !== 'string' ||
      link.recordId.length > 150
    )
      throw Error('Vínculo de importação inválido.');
    if (
      !t ||
      !['csv', 'ofx'].includes(t.source) ||
      !['credit', 'debit'].includes(t.direction) ||
      !Number.isInteger(t.line) ||
      t.line < 1 ||
      !validDate(t.date) ||
      !Number.isSafeInteger(t.amountCents) ||
      t.amountCents <= 0 ||
      t.amountCents > 100_000_000_000
    )
      throw Error('Movimentação importada inválida.');
    if (
      [
        t.description,
        t.externalId,
        t.accountLabel,
        t.document,
        t.normalizedDescription,
      ].some((v) => typeof v !== 'string') ||
      normalizedTransaction(t).normalizedDescription !== t.normalizedDescription
    )
      throw Error('Normalização inválida.');
  }
  for (const p of state.profiles) validateProfile(p);
  for (const r of state.rules) {
    if (
      typeof r.enabled !== 'boolean' ||
      !['equals', 'contains', 'startsWith', 'regex'].includes(r.mode)
    )
      throw Error('Regra inválida.');
    safeRule(r);
  }
  // Whitelist metadata: never retain source text or arbitrary attachment fields from a backup.
  const result = emptyImports();
  result.sessions = state.sessions.map(
    ({
      id,
      source,
      fileName,
      createdAt,
      hash,
      rowCount,
      importedCount,
      matchedCount,
      ignoredCount,
      duplicateCount,
      invalidCount,
    }) => ({
      id,
      source,
      fileName,
      createdAt,
      hash,
      rowCount,
      importedCount,
      matchedCount,
      ignoredCount,
      duplicateCount,
      invalidCount,
    }),
  );
  result.profiles = state.profiles.map((p) => ({
    id: p.id,
    name: p.name,
    options: {
      delimiter: p.options.delimiter,
      header: p.options.header,
      locale: p.options.locale,
      account: p.options.account,
      mapping: { ...p.options.mapping },
    },
  }));
  result.rules = state.rules.map(
    ({ id, pattern, mode, category, enabled }) => ({
      id,
      pattern,
      mode,
      category,
      enabled,
    }),
  );
  result.links = state.links.map((l) => {
    const {
      line,
      externalId,
      date,
      description,
      normalizedDescription,
      amountCents,
      direction,
      accountLabel,
      accountId,
      document,
      source,
    } = l.transaction;
    return {
      id: l.id,
      sessionId: l.sessionId,
      action: l.action,
      recordKind: l.recordKind,
      recordId: l.recordId,
      fingerprint: '',
      transaction: {
        line,
        externalId,
        date,
        description,
        normalizedDescription,
        amountCents,
        direction,
        accountLabel,
        ...(typeof accountId === 'string' && accountId.length <= 150
          ? { accountId }
          : {}),
        document,
        source,
      },
    };
  });
  return result;
}
