import type { Data } from '../../model';
import type { Review } from '../import/types';
import { previewImport, prepareImport } from '../import/import-session';
import { fileHash } from '../import/transaction-normalizer';
import { validateData, remove } from '../storage';

export function reviewTransactions(d: Data, ids: string[]) {
  const selected = new Set(ids);
  return previewImport(
    d,
    (d.openFinance?.transactions || [])
      .filter((r) => selected.has(r.id) && !r.reviewed && r.status === 'posted')
      .map((r, i) => ({
        line: i + 1,
        transaction: { ...r.transaction, line: i + 1 },
        errors: [],
      })),
  );
}
export async function reconcileRemote(
  d: Data,
  id: string,
  review: Review,
): Promise<Data> {
  const remote = d.openFinance?.transactions.find((r) => r.id === id);
  if (!remote || remote.status !== 'posted' || remote.reviewed)
    throw Error('Transação indisponível para revisão.');
  const account = d.openFinance!.accounts.find(
    (a) => a.id === remote.accountId,
  );
  if (account?.currency !== 'BRL')
    throw Error('Conversão de moeda não é suportada.');
  if (remote.importLinkId && review.action !== 'ignore')
    throw Error(
      'A fonte corrigiu um registro já conciliado. Revise o lançamento existente; não será criada outra movimentação.',
    );
  const lines = [
    { line: 1, transaction: { ...remote.transaction, line: 1 }, errors: [] },
  ];
  const preview = previewImport(d, lines)[0];
  if (
    (preview.candidates.length || preview.duplicate) &&
    review.action === 'create'
  )
    throw Error(
      'Existe correspondência. Concilie ou ignore para evitar duplicação.',
    );
  const hash = await fileHash(new TextEncoder().encode(remote.id));
  const next = prepareImport(
    d,
    lines,
    { 1: review },
    { source: 'open_finance', fileName: 'Sincronização bancária', hash },
  );
  const link =
    next.imports.links.find(
      (l) =>
        l.sessionId === next.imports.sessions.at(-1)?.id &&
        l.transaction.line === 1,
    ) || preview.duplicate?.link;
  next.openFinance!.transactions = next.openFinance!.transactions.map((r) =>
    r.id === id ? { ...r, reviewed: true, importLinkId: link?.id || null } : r,
  );
  return validateData(next);
}

export function deleteConnectionData(
  d: Data,
  connectionId: string,
  owner: string,
): Data {
  const state = d.openFinance;
  const connection = state?.connections.find(
    (c) => c.id === connectionId && c.userId === owner,
  );
  if (!state || !connection || connection.status !== 'revoked')
    throw Error('Revogue primeiro o acesso antes de excluir os dados.');
  const links = new Set(
    state.transactions
      .filter((t) => t.connectionId === connectionId)
      .map((t) => t.importLinkId)
      .filter(Boolean),
  );
  let next = structuredClone(d);
  for (const link of d.imports.links)
    if (
      links.has(link.id) &&
      link.action === 'created' &&
      link.recordKind &&
      !d.imports.links.some(
        (other) =>
          other.id !== link.id &&
          other.recordKind === link.recordKind &&
          other.recordId === link.recordId,
      )
    )
      next = remove(next, link.recordKind, link.recordId);
  next.imports.links = next.imports.links.filter(
    (l) => !links.has(l.id) || l.transaction.source !== 'open_finance',
  );
  const accounts = new Set(
    state.accounts
      .filter((a) => a.connectionId === connectionId)
      .map((a) => a.id),
  );
  next.openFinance = {
    ...state,
    accounts: state.accounts.filter((a) => !accounts.has(a.id)),
    balances: state.balances.filter((b) => !accounts.has(b.accountId)),
    transactions: state.transactions.filter(
      (t) => t.connectionId !== connectionId,
    ),
    sync: state.sync.filter((s) => s.connectionId !== connectionId),
  };
  return validateData(next);
}

export async function reconcileTransfer(
  d: Data,
  firstId: string,
  secondId: string,
): Promise<Data> {
  const records = [firstId, secondId].map((id) =>
    d.openFinance?.transactions.find((r) => r.id === id),
  );
  if (
    firstId === secondId ||
    records.some(
      (r) => !r || r.reviewed || r.status !== 'posted' || r.importLinkId,
    )
  )
    throw Error('Transferência indisponível para revisão.');
  if (
    records.some(
      (r) =>
        d.openFinance?.accounts.find((a) => a.id === r!.accountId)?.currency !==
        'BRL',
    )
  )
    throw Error('Moeda incompatível.');
  const lines = records.map((r, i) => ({
    line: i + 1,
    transaction: { ...r!.transaction, line: i + 1 },
    errors: [],
  }));
  const base: Review = {
    action: 'transfer',
    category: 'outras',
    recordKind: '',
    recordId: '',
    override: false,
    remember: false,
  };
  const next = prepareImport(
    d,
    lines,
    { 1: { ...base, transferLine: 2 }, 2: { ...base, transferLine: 1 } },
    {
      source: 'open_finance',
      fileName: 'Transferência bancária',
      hash: await fileHash(new TextEncoder().encode(firstId + secondId)),
    },
  );
  const selected = new Set([firstId, secondId]);
  next.openFinance!.transactions = next.openFinance!.transactions.map((r) =>
    selected.has(r.id)
      ? {
          ...r,
          reviewed: true,
          importLinkId:
            next.imports.links.find(
              (l) =>
                l.sessionId === next.imports.sessions.at(-1)?.id &&
                l.transaction.line ===
                  records.findIndex((record) => record?.id === r.id) + 1,
            )?.id || null,
        }
      : r,
  );
  return validateData(next);
}
