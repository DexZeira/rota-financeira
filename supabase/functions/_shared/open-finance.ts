const OPEN_FINANCE_ENVIRONMENTS = ['sandbox', 'production'] as const;
const OPEN_FINANCE_STATE_TTL_MS = 10 * 60 * 1000;
const PLUGGY_API_URL = 'https://api.pluggy.ai';
// Pluggy documents a two-hour API Key lifetime; renew five minutes early.
// Source: https://docs.pluggy.ai/en/docs/authentication
const PLUGGY_API_KEY_CACHE_TTL_MS = 115 * 60 * 1000;

type OpenFinanceEnvironment = (typeof OPEN_FINANCE_ENVIRONMENTS)[number];

export interface OpenFinanceConfiguration {
  environment: OpenFinanceEnvironment;
  oauthRedirectUri: string;
  pluggyClientId: string;
  pluggyClientSecret: string;
  pluggyApiUrl: string;
  supabaseAnonKey: string;
  supabaseUrl: string;
}

export type OpenFinanceFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface PluggyConnectTokenRequest {
  readonly avoidDuplicates: boolean;
  readonly clientUserId: string;
  readonly itemId?: string;
}

export type PluggySuccessfulExecution = 'SUCCESS' | 'PARTIAL_SUCCESS';

export interface PluggyItemConfirmation {
  readonly id: string;
  readonly clientUserId: string;
  readonly status: string;
  readonly executionStatus: string;
}

export interface PluggySyncAccount {
  readonly id: string;
  readonly itemId: string;
  readonly name: string;
  readonly type: string;
  readonly subtype: string;
  readonly number: string;
  readonly currencyCode: string;
  readonly balance: number;
}

export interface PluggySyncTransaction {
  readonly id: string | null;
  readonly providerId: string | null;
  readonly accountId: string;
  readonly description: string;
  readonly currencyCode: string;
  readonly amountCents: number;
  readonly date: string;
  readonly status: 'PENDING' | 'POSTED';
  readonly type: string;
}

export interface OpenFinanceTransactionCandidate {
  readonly id: string;
  readonly external_transaction_id: string | null;
  readonly dedup_key: string | null;
}

let pluggyApiKeyCache: {
  readonly apiKey: string;
  readonly clientId: string;
  readonly expiresAt: number;
} | null = null;

export type OpenFinanceConfigurationResult =
  | { readonly ok: true; readonly configuration: OpenFinanceConfiguration; readonly correlationId: string }
  | { readonly ok: false; readonly response: Response };

export type OpenFinanceWebhookConfigurationResult =
  | {
      readonly ok: true;
      readonly configuration: OpenFinanceConfiguration;
      readonly correlationId: string;
      readonly serviceRoleKey: string;
    }
  | { readonly ok: false; readonly response: Response };

function isValidSupabaseUrl(value: string | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isValidOAuthRedirectUri(value: string | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      hostname !== 'localhost' &&
      !hostname.endsWith('.localhost') &&
      !/^127(?:\.\d{1,3}){3}$/.test(hostname) &&
      hostname !== '[::1]';
  } catch {
    return false;
  }
}

function isOpenFinanceEnvironment(value: string | undefined): value is OpenFinanceEnvironment {
  return value === 'sandbox' || value === 'production';
}

export function logOpenFinanceEvent(event: string, status: number, correlationId: string): void {
  console.log(JSON.stringify({ event, status, correlationId }));
}

export function openFinanceErrorResponse(status: number, correlationId: string): Response {
  return new Response(
    JSON.stringify({ error: 'Open Finance request failed', correlation_id: correlationId }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

function pluggyRequestFailed(): Error {
  return new Error('Pluggy request failed');
}

async function readPluggyResponse(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw pluggyRequestFailed();

  try {
    const value: unknown = await response.json();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw pluggyRequestFailed();
    }
    return value as Record<string, unknown>;
  } catch {
    throw pluggyRequestFailed();
  }
}

export async function getPluggyApiKey(
  configuration: OpenFinanceConfiguration,
  fetcher: OpenFinanceFetch = fetch,
  now: () => number = Date.now,
): Promise<string> {
  const cached = pluggyApiKeyCache;
  if (
    cached &&
    cached.clientId === configuration.pluggyClientId &&
    cached.expiresAt > now()
  ) return cached.apiKey;

  const response = await fetcher(`${PLUGGY_API_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: configuration.pluggyClientId,
      clientSecret: configuration.pluggyClientSecret,
    }),
  });
  const payload = await readPluggyResponse(response);
  if (typeof payload.apiKey !== 'string' || payload.apiKey.length === 0) {
    throw pluggyRequestFailed();
  }

  pluggyApiKeyCache = {
    apiKey: payload.apiKey,
    clientId: configuration.pluggyClientId,
    expiresAt: now() + PLUGGY_API_KEY_CACHE_TTL_MS,
  };
  return payload.apiKey;
}

export async function createPluggyConnectToken(
  configuration: OpenFinanceConfiguration,
  request: PluggyConnectTokenRequest,
  fetcher: OpenFinanceFetch = fetch,
  now: () => number = Date.now,
): Promise<string> {
  if (
    !isValidOAuthRedirectUri(configuration.oauthRedirectUri) ||
    request.clientUserId.trim().length === 0 ||
    (request.itemId !== undefined && request.itemId.trim().length === 0)
  ) throw pluggyRequestFailed();

  const apiKey = await getPluggyApiKey(configuration, fetcher, now);
  const body = {
    ...(request.itemId === undefined ? {} : { itemId: request.itemId }),
    options: {
      clientUserId: request.clientUserId,
      avoidDuplicates: request.avoidDuplicates,
      oauthRedirectUri: configuration.oauthRedirectUri,
    },
  };
  const response = await fetcher(`${PLUGGY_API_URL}/connect_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify(body),
  });
  const payload = await readPluggyResponse(response);
  if (typeof payload.accessToken !== 'string' || payload.accessToken.length === 0) {
    throw pluggyRequestFailed();
  }
  return payload.accessToken;
}

export function isOpenFinanceUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function getPluggyItem(
  configuration: OpenFinanceConfiguration,
  itemId: string,
  fetcher: OpenFinanceFetch = fetch,
  now: () => number = Date.now,
): Promise<PluggyItemConfirmation> {
  if (!isOpenFinanceUuid(itemId)) throw pluggyRequestFailed();

  const apiKey = await getPluggyApiKey(configuration, fetcher, now);
  const response = await fetcher(`${PLUGGY_API_URL}/items/${itemId}`, {
    method: 'GET',
    headers: { 'X-API-KEY': apiKey },
  });
  const payload = await readPluggyResponse(response);
  if (
    typeof payload.id !== 'string' ||
    typeof payload.clientUserId !== 'string' ||
    typeof payload.status !== 'string' ||
    typeof payload.executionStatus !== 'string'
  ) throw pluggyRequestFailed();

  return {
    id: payload.id,
    clientUserId: payload.clientUserId,
    status: payload.status,
    executionStatus: payload.executionStatus,
  };
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw pluggyRequestFailed();
  return value;
}

function finiteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw pluggyRequestFailed();
  return value;
}

function amountInCents(value: unknown): number {
  const amount = finiteNumber(value);
  const cents = Math.round((amount + Math.sign(amount) * Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) throw pluggyRequestFailed();
  return cents;
}

function parsePluggyAccount(value: unknown, itemId: string): PluggySyncAccount {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw pluggyRequestFailed();
  }
  const account = value as Record<string, unknown>;
  const id = requiredString(account.id);
  if (!isOpenFinanceUuid(id) || account.itemId !== itemId) throw pluggyRequestFailed();
  return {
    id,
    itemId,
    name: requiredString(account.name),
    type: requiredString(account.type),
    subtype: requiredString(account.subtype),
    number: requiredString(account.number),
    currencyCode: requiredString(account.currencyCode),
    balance: finiteNumber(account.balance),
  };
}

function parsePluggyTransaction(value: unknown, accountId: string): PluggySyncTransaction {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw pluggyRequestFailed();
  }
  const transaction = value as Record<string, unknown>;
  const id = transaction.id === null || transaction.id === undefined
    ? null
    : requiredString(transaction.id);
  const providerId = transaction.providerId === null || transaction.providerId === undefined
    ? null
    : requiredString(transaction.providerId);
  const status = transaction.status;
  if (
    (id !== null && !isOpenFinanceUuid(id)) ||
    (id === null && providerId === null) ||
    transaction.accountId !== accountId ||
    (status !== 'PENDING' && status !== 'POSTED')
  ) throw pluggyRequestFailed();
  const date = requiredString(transaction.date);
  if (!Number.isFinite(Date.parse(date))) throw pluggyRequestFailed();
  return {
    id,
    providerId,
    accountId,
    description: requiredString(transaction.description),
    currencyCode: requiredString(transaction.currencyCode),
    amountCents: amountInCents(transaction.amount),
    date,
    status,
    type: requiredString(transaction.type),
  };
}

export async function fetchPluggyAccounts(
  configuration: OpenFinanceConfiguration,
  itemId: string,
  fetcher: OpenFinanceFetch = fetch,
  now: () => number = Date.now,
): Promise<PluggySyncAccount[]> {
  if (!isOpenFinanceUuid(itemId)) throw pluggyRequestFailed();
  const apiKey = await getPluggyApiKey(configuration, fetcher, now);
  const response = await fetcher(
    `${PLUGGY_API_URL}/accounts?itemId=${encodeURIComponent(itemId)}`,
    { method: 'GET', headers: { 'X-API-KEY': apiKey } },
  );
  const payload = await readPluggyResponse(response);
  if (!Array.isArray(payload.results)) throw pluggyRequestFailed();
  return payload.results.map((account) => parsePluggyAccount(account, itemId));
}

export async function fetchPluggyTransactions(
  configuration: OpenFinanceConfiguration,
  accountId: string,
  fetcher: OpenFinanceFetch = fetch,
  now: () => number = Date.now,
): Promise<PluggySyncTransaction[]> {
  if (!isOpenFinanceUuid(accountId)) throw pluggyRequestFailed();
  const apiKey = await getPluggyApiKey(configuration, fetcher, now);
  const transactions: PluggySyncTransaction[] = [];
  const visited = new Set<string>();
  let url = `${PLUGGY_API_URL}/v2/transactions?accountId=${encodeURIComponent(accountId)}`;

  for (let page = 0; page < 1000; page++) {
    const response = await fetcher(url, {
      method: 'GET',
      headers: { 'X-API-KEY': apiKey },
    });
    const payload = await readPluggyResponse(response);
    if (!Array.isArray(payload.results) || transactions.length + payload.results.length > 100000) {
      throw pluggyRequestFailed();
    }
    transactions.push(...payload.results.map((item) => parsePluggyTransaction(item, accountId)));
    if (payload.next === null) return transactions;
    if (
      typeof payload.next !== 'string' ||
      !payload.next.startsWith('?') ||
      visited.has(payload.next)
    ) throw pluggyRequestFailed();
    visited.add(payload.next);
    url = `${PLUGGY_API_URL}/v2/transactions${payload.next}`;
  }
  throw pluggyRequestFailed();
}

export function pluggyTransactionExternalId(
  transaction: Pick<PluggySyncTransaction, 'providerId' | 'id'>,
): string | null {
  return transaction.providerId ?? transaction.id;
}

export function pluggyTransactionFallbackKey(
  transaction: Pick<
    PluggySyncTransaction,
    'date' | 'amountCents' | 'currencyCode' | 'status' | 'type' | 'description'
  >,
): string {
  return JSON.stringify([
    transaction.date,
    transaction.amountCents,
    transaction.currencyCode,
    transaction.status,
    transaction.type,
    transaction.description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(),
  ]);
}

export function selectPluggyTransactionMatch(
  transaction: PluggySyncTransaction,
  candidates: readonly OpenFinanceTransactionCandidate[],
): string | null {
  const providerMatch = transaction.providerId === null
    ? undefined
    : candidates.find((candidate) => candidate.external_transaction_id === transaction.providerId);
  if (providerMatch) return providerMatch.id;
  const pluggyMatch = transaction.id === null
    ? undefined
    : candidates.find((candidate) => candidate.external_transaction_id === transaction.id);
  if (pluggyMatch) return pluggyMatch.id;
  const fallback = pluggyTransactionFallbackKey(transaction);
  const matches = candidates.filter((candidate) => candidate.dedup_key === fallback);
  return matches.length === 1 ? matches[0].id : null;
}

export function buildPluggyAccountRow(connectionId: string, account: PluggySyncAccount) {
  return {
    connection_id: connectionId,
    external_account_id: account.id,
    name: account.name,
    type: account.type,
    subtype: account.subtype,
    number: account.number,
    currency: account.currencyCode,
    balance_current: account.balance,
  };
}

export function buildPluggyTransactionRow(
  accountId: string,
  transaction: PluggySyncTransaction,
) {
  return {
    account_id: accountId,
    external_transaction_id: pluggyTransactionExternalId(transaction),
    date: transaction.date,
    description: transaction.description,
    amount: transaction.amountCents / 100,
    amount_cents: transaction.amountCents,
    currency: transaction.currencyCode,
    status: transaction.status,
    type: transaction.type,
    dedup_key: pluggyTransactionFallbackKey(transaction),
  };
}

export function logOpenFinanceSyncEvent(
  operation: string,
  status: number,
  correlationId: string,
  accounts: number,
  transactions: number,
): void {
  console.log(JSON.stringify({ operation, status, correlationId, accounts, transactions }));
}

export function createOpenFinanceSyncResponse(
  connectionId: string,
  accountsSynced: number,
  transactionsSynced: number,
  partial: boolean,
  syncedAt: string,
): Response {
  return new Response(
    JSON.stringify({
      connection_id: connectionId,
      status: 'connected',
      accounts_synced: accountsSynced,
      transactions_synced: transactionsSynced,
      partial,
      synced_at: syncedAt,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

export function validatePluggyItemConfirmation(
  item: {
    readonly id?: unknown;
    readonly clientUserId?: unknown;
    readonly status?: unknown;
    readonly executionStatus?: unknown;
  },
  requestedItemId: string,
  userId: string,
): PluggySuccessfulExecution | null {
  if (
    item.id !== requestedItemId ||
    item.clientUserId !== userId ||
    item.status !== 'UPDATED'
  ) return null;

  return item.executionStatus === 'SUCCESS' || item.executionStatus === 'PARTIAL_SUCCESS'
    ? item.executionStatus
    : null;
}

export function createOpenFinancePendingResponse(
  connectionId: string,
  connectToken: string,
  state: string,
): Response {
  return new Response(
    JSON.stringify({
      connection_id: connectionId,
      connect_token: connectToken,
      state,
      status: 'pending_authorization',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

export async function createOpenFinanceState(): Promise<{
  readonly value: string;
  readonly hash: string;
  readonly expiresAt: string;
}> {
  const value = crypto.randomUUID();
  const hash = await hashOpenFinanceState(value);

  return {
    value,
    hash,
    expiresAt: new Date(Date.now() + OPEN_FINANCE_STATE_TTL_MS).toISOString(),
  };
}

export async function hashOpenFinanceState(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function assessOpenFinanceConfirmation(
  connection: {
    readonly user_id?: unknown;
    readonly status?: unknown;
    readonly external_item_id?: unknown;
    readonly connect_state_hash?: unknown;
    readonly connect_state_expires_at?: unknown;
    readonly connect_state_consumed_at?: unknown;
  },
  userId: string,
  itemId: string,
  state: string,
  now: number = Date.now(),
): Promise<'confirm' | 'idempotent' | 'reject'> {
  if (connection.user_id !== userId || !isOpenFinanceUuid(itemId)) return 'reject';
  if (connection.status === 'connected') {
    return connection.external_item_id === itemId ? 'idempotent' : 'reject';
  }
  if (
    connection.status !== 'pending_authorization' ||
    typeof connection.connect_state_hash !== 'string' ||
    typeof connection.connect_state_expires_at !== 'string' ||
    connection.connect_state_consumed_at !== null ||
    state.length === 0 ||
    Date.parse(connection.connect_state_expires_at) <= now
  ) return 'reject';

  return await hashOpenFinanceState(state) === connection.connect_state_hash
    ? 'confirm'
    : 'reject';
}

export function buildPendingAuthorizationUpdate(state: {
  readonly hash: string;
  readonly expiresAt: string;
}): {
  readonly status: 'pending_authorization';
  readonly connect_state_hash: string;
  readonly connect_state_expires_at: string;
  readonly connect_state_consumed_at: null;
} {
  return {
    status: 'pending_authorization',
    connect_state_hash: state.hash,
    connect_state_expires_at: state.expiresAt,
    connect_state_consumed_at: null,
  };
}

export function buildRevokedUpdate(consumedAt: string): {
  readonly status: 'revoked';
  readonly connect_state_hash: null;
  readonly connect_state_expires_at: null;
  readonly connect_state_consumed_at: string;
} {
  return {
    status: 'revoked',
    connect_state_hash: null,
    connect_state_expires_at: null,
    connect_state_consumed_at: consumedAt,
  };
}

export function buildConfirmedConnectionUpdate(
  itemId: string,
  executionStatus: PluggySuccessfulExecution,
  consumedAt: string,
): {
  readonly status: 'connected';
  readonly external_item_id: string;
  readonly external_execution_status: PluggySuccessfulExecution;
  readonly connect_state_hash: null;
  readonly connect_state_expires_at: null;
  readonly connect_state_consumed_at: string;
} {
  return {
    status: 'connected',
    external_item_id: itemId,
    external_execution_status: executionStatus,
    connect_state_hash: null,
    connect_state_expires_at: null,
    connect_state_consumed_at: consumedAt,
  };
}

export function createOpenFinanceConnectedResponse(connectionId: string): Response {
  return new Response(
    JSON.stringify({ connection_id: connectionId, status: 'connected' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

export function canSyncOpenFinanceConnection(
  connection: {
    readonly user_id?: unknown;
    readonly status?: unknown;
    readonly external_item_id?: unknown;
  },
  userId: string,
): boolean {
  return connection.user_id === userId &&
    connection.status === 'connected' &&
    typeof connection.external_item_id === 'string' &&
    connection.external_item_id.trim().length > 0;
}

export function ownsOpenFinanceConnection(
  connection: { readonly user_id?: unknown },
  userId: string,
): boolean {
  return connection.user_id === userId;
}

export function getOpenFinanceConfiguration(requireSupabase: boolean): OpenFinanceConfigurationResult {
  const correlationId = crypto.randomUUID();
  const environment = Deno.env.get('OPEN_FINANCE_ENV');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const pluggyClientId = Deno.env.get('PLUGGY_CLIENT_ID');
  const pluggyClientSecret = Deno.env.get('PLUGGY_CLIENT_SECRET');
  const oauthRedirectUri = Deno.env.get('OPEN_FINANCE_OAUTH_REDIRECT_URI');
  const pluggyApiUrl = Deno.env.get('PLUGGY_API_URL') ?? 'https://api.pluggy.ai';

  if (
    Deno.env.get('OPEN_FINANCE_REAL_ENABLED') !== 'true' ||
    !isOpenFinanceEnvironment(environment) ||
    !pluggyClientId ||
    !pluggyClientSecret ||
    !isValidOAuthRedirectUri(oauthRedirectUri) ||
    (requireSupabase && (!isValidSupabaseUrl(supabaseUrl) || !supabaseAnonKey))
  ) {
    logOpenFinanceEvent('open_finance.configuration_rejected', 503, correlationId);
    return { ok: false, response: openFinanceErrorResponse(503, correlationId) };
  }

  return {
    ok: true,
    correlationId,
    configuration: {
      environment,
      oauthRedirectUri,
      pluggyClientId,
      pluggyClientSecret,
      pluggyApiUrl,
      supabaseUrl: supabaseUrl ?? '',
      supabaseAnonKey: supabaseAnonKey ?? '',
    },
  };
}

export function getOpenFinanceWebhookConfiguration(): OpenFinanceWebhookConfigurationResult {
  const result = getOpenFinanceConfiguration(false);
  if (!result.ok) return result;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!isValidSupabaseUrl(supabaseUrl) || !serviceRoleKey) {
    logOpenFinanceEvent('open_finance.configuration_rejected', 503, result.correlationId);
    return { ok: false, response: openFinanceErrorResponse(503, result.correlationId) };
  }

  return {
    ok: true,
    correlationId: result.correlationId,
    serviceRoleKey,
    configuration: { ...result.configuration, supabaseUrl },
  };
}
