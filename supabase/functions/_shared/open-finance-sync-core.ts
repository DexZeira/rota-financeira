import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  buildPluggyAccountRow,
  buildPluggyTransactionRow,
  fetchPluggyAccounts,
  fetchPluggyTransactions,
  isOpenFinanceUuid,
  selectPluggyTransactionMatch,
  type OpenFinanceConfiguration,
  type OpenFinanceTransactionCandidate,
  type PluggySyncTransaction,
} from './open-finance.ts';

export interface OpenFinanceSyncConnection {
  readonly id: string;
  readonly user_id: string;
  readonly provider: string;
  readonly status: string;
  readonly external_item_id: string;
  readonly external_execution_status: string | null;
}

export interface OpenFinanceSyncResult {
  readonly accounts: number;
  readonly transactions: number;
  readonly partial: boolean;
  readonly syncedAt: string;
}

interface SyncedAccount {
  readonly id: string;
  readonly external_account_id: string;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function syncOpenFinanceConnection(
  supabase: SupabaseClient,
  configuration: OpenFinanceConfiguration,
  connection: OpenFinanceSyncConnection,
): Promise<OpenFinanceSyncResult> {
  if (
    connection.provider !== 'pluggy' ||
    connection.status !== 'connected' ||
    !isOpenFinanceUuid(connection.id) ||
    !isOpenFinanceUuid(connection.user_id) ||
    !isOpenFinanceUuid(connection.external_item_id)
  ) throw new Error('Sync unavailable');

  const accounts = await fetchPluggyAccounts(configuration, connection.external_item_id);
  const staged: Array<{
    readonly externalAccountId: string;
    readonly transactions: PluggySyncTransaction[];
  }> = [];
  for (const account of accounts) {
    staged.push({
      externalAccountId: account.id,
      transactions: await fetchPluggyTransactions(configuration, account.id),
    });
  }
  const transactionsCount = staged.reduce(
    (total, account) => total + account.transactions.length,
    0,
  );

  let persistedAccounts: SyncedAccount[] = [];
  if (accounts.length > 0) {
    const { data, error } = await supabase
      .from('open_finance_accounts')
      .upsert(accounts.map((account) => buildPluggyAccountRow(connection.id, account)), {
        onConflict: 'external_account_id',
      })
      .select('id,external_account_id');
    if (error || !data || data.length !== accounts.length) {
      throw new Error('Account persistence failed');
    }
    persistedAccounts = data;
  }
  const accountByExternalId = new Map(
    persistedAccounts.map((account) => [account.external_account_id, account.id]),
  );
  const internalAccountIds = [...accountByExternalId.values()];

  const allTransactions = staged.flatMap(({ externalAccountId, transactions }) => {
    const accountId = accountByExternalId.get(externalAccountId);
    if (!accountId) throw new Error('Account persistence failed');
    return transactions.map((transaction) => ({ accountId, transaction }));
  });
  const identifiers = [...new Set(allTransactions.flatMap(({ transaction }) =>
    [transaction.providerId, transaction.id].filter((id): id is string => id !== null)
  ))];
  const candidates: OpenFinanceTransactionCandidate[] = [];
  for (const batch of chunks(identifiers, 200)) {
    const { data, error } = await supabase
      .from('open_finance_transactions')
      .select('id,external_transaction_id,dedup_key')
      .in('account_id', internalAccountIds)
      .in('external_transaction_id', batch);
    if (error || !data) throw new Error('Transaction lookup failed');
    candidates.push(...data);
  }

  const matchedRows: Array<ReturnType<typeof buildPluggyTransactionRow> & { readonly id: string }> = [];
  const newRows: Array<ReturnType<typeof buildPluggyTransactionRow>> = [];
  for (const { accountId, transaction } of allTransactions) {
    const row = buildPluggyTransactionRow(accountId, transaction);
    const matchId = selectPluggyTransactionMatch(transaction, candidates);
    if (matchId) matchedRows.push({ ...row, id: matchId });
    else newRows.push(row);
  }
  for (const batch of chunks(matchedRows, 500)) {
    const { error } = await supabase
      .from('open_finance_transactions')
      .upsert(batch, { onConflict: 'id' });
    if (error) throw new Error('Transaction persistence failed');
  }
  for (const batch of chunks(newRows, 500)) {
    const { error } = await supabase
      .from('open_finance_transactions')
      .insert(batch);
    if (error) throw new Error('Transaction persistence failed');
  }

  const syncedAt = new Date().toISOString();
  const { data: completed, error: completionError } = await supabase
    .from('open_finance_connections')
    .update({
      last_sync_at: syncedAt,
      external_execution_status: connection.external_execution_status,
    })
    .eq('id', connection.id)
    .eq('user_id', connection.user_id)
    .eq('provider', 'pluggy')
    .eq('status', 'connected')
    .eq('external_item_id', connection.external_item_id)
    .select('id')
    .single();
  if (completionError || !completed) throw new Error('Sync completion failed');

  return {
    accounts: accounts.length,
    transactions: transactionsCount,
    partial: connection.external_execution_status === 'PARTIAL_SUCCESS',
    syncedAt,
  };
}
