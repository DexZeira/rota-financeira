import test from 'node:test';
import assert from 'node:assert/strict';
import { MockOpenFinanceProvider } from '../src/services/open-finance/mock-provider';
import { PluggyOpenFinanceProvider } from '../src/services/open-finance/pluggy-provider';
import { OpenFinanceError } from '../src/services/open-finance/errors';
import {
  buildPluggyWidgetOptions,
  isOpenFinanceCallbackPath,
  isPluggyOAuthTransitionEvent,
  invokeOpenFinanceConfirmation,
  invokeOpenFinanceAuthorization,
  resolvePluggyWidgetEvent,
} from '../src/services/open-finance/widget';
import {
  assessOpenFinanceConfirmation,
  buildConfirmedConnectionUpdate,
  buildPluggyAccountRow,
  buildPluggyTransactionRow,
  buildPendingAuthorizationUpdate,
  buildRevokedUpdate,
  canSyncOpenFinanceConnection,
  createOpenFinanceConnectedResponse,
  createOpenFinancePendingResponse,
  createOpenFinanceSyncResponse,
  createOpenFinanceState,
  createPluggyConnectToken,
  fetchPluggyAccounts,
  fetchPluggyTransactions,
  getOpenFinanceConfiguration,
  getPluggyItem,
  pluggyTransactionExternalId,
  pluggyTransactionFallbackKey,
  selectPluggyTransactionMatch,
  type OpenFinanceConfiguration,
  type OpenFinanceFetch,
  openFinanceErrorResponse,
  ownsOpenFinanceConnection,
  validatePluggyItemConfirmation,
} from '../supabase/functions/_shared/open-finance';
import {
  handlePluggyWebhookRequest,
  type PluggyWebhookDependencies,
  type PluggyWebhookLog,
} from '../supabase/functions/_shared/open-finance-webhook';

function pluggyConfiguration(clientId: string): OpenFinanceConfiguration {
  return {
    environment: 'sandbox',
    oauthRedirectUri: 'https://app.example.com/open-finance/callback',
    pluggyClientId: clientId,
    pluggyClientSecret: 'fixture-secret',
    pluggyApiUrl: 'https://api.pluggy.ai',
    supabaseAnonKey: 'fixture-anon',
    supabaseUrl: 'https://fixture.supabase.co',
  };
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

function requestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') throw new Error('Expected JSON request body');
  return JSON.parse(init.body) as unknown;
}

function webhookRequest(body: unknown, init?: RequestInit): Request {
  return new Request('https://fixture.supabase.co/functions/v1/open-finance-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
}

function webhookDependencies(overrides: Partial<PluggyWebhookDependencies> = {}) {
  const events = new Set<string>();
  const statuses: Array<{
    eventId: string;
    status: string;
    errorCode?: string;
    connectionId?: string;
  }> = [];
  const tasks: Promise<void>[] = [];
  const logs: PluggyWebhookLog[] = [];
  let syncCalls = 0;
  const dependencies: PluggyWebhookDependencies = {
    insertEvent: async (event) => {
      if (events.has(event.eventId)) return 'duplicate';
      events.add(event.eventId);
      return 'inserted';
    },
    updateEvent: async (eventId, status, errorCode, connectionId) => {
      statuses.push({
        eventId,
        status,
        ...(errorCode ? { errorCode } : {}),
        ...(connectionId ? { connectionId } : {}),
      });
    },
    getItem: async (itemId) => ({
      id: itemId,
      clientUserId: 'server-user',
      status: 'UPDATED',
      executionStatus: 'SUCCESS',
    }),
    findConnection: async (itemId) => ({
      id: '11111111-1111-4111-8111-111111111111',
      user_id: 'server-user',
      provider: 'pluggy',
      status: 'connected',
      external_item_id: itemId,
      external_execution_status: 'SUCCESS',
    }),
    syncConnection: async () => {
      syncCalls++;
      return { accounts: 2, transactions: 5, partial: false };
    },
    waitUntil: (task) => { tasks.push(task); },
    log: (entry) => { logs.push(entry); },
    ...overrides,
  };
  return { dependencies, events, statuses, tasks, logs, syncCalls: () => syncCalls };
}

void test('Pluggy: operações não implementadas falham explicitamente sem retornar dados fictícios', async () => {
  const mock = new MockOpenFinanceProvider();
  const institution = (await mock.listInstitutions())[0];
  const connection = await mock.authorize(await mock.createConnection('guest', institution), 'guest');
  const account = (await mock.listAccounts(connection, 'guest'))[0];
  const provider = new PluggyOpenFinanceProvider('https://invalid.example', 'fixture-client', 'fixture-secret');
  for (const operation of [
    () => provider.createConnection('guest', institution),
    () => provider.authorize(connection, 'guest'),
    () => provider.getConsent(connection, 'guest'),
    () => provider.revokeConsent(connection, 'guest'),
    () => provider.listAccounts(connection, 'guest'),
    () => provider.getBalance(account, connection, 'guest'),
    () => provider.getTransactions(account, connection, 'guest', { since: '2026-01-01', cursor: null }),
  ]) {
    await assert.rejects(operation, error => error instanceof OpenFinanceError && error.code === 'PROVIDER_ERROR');
  }
});

void test('connect cria estado opaco, expirável e pendente sem segredo', async () => {
  const state = await createOpenFinanceState();
  const update = buildPendingAuthorizationUpdate(state);

  assert.notEqual(state.value, state.hash);
  assert.match(state.hash, /^[0-9a-f]{64}$/);
  assert.ok(Date.parse(state.expiresAt) > Date.now());
  assert.equal(update.status, 'pending_authorization');
  assert.equal(update.connect_state_hash, state.hash);
  assert.equal(update.connect_state_consumed_at, null);
  assert.equal('token' in update, false);
  assert.equal('secret' in update, false);
});

void test('reconnect substitui estado anterior e permanece pendente', async () => {
  const previous = await createOpenFinanceState();
  const next = await createOpenFinanceState();
  const update = buildPendingAuthorizationUpdate(next);

  assert.notEqual(previous.hash, next.hash);
  assert.equal(update.status, 'pending_authorization');
  assert.equal(update.connect_state_hash, next.hash);
  assert.equal(update.connect_state_consumed_at, null);
});

void test('disconnect revoga e invalida estado sem apagar histórico', () => {
  const update = buildRevokedUpdate('2026-09-30T12:00:00.000Z');

  assert.equal(update.status, 'revoked');
  assert.equal(update.connect_state_hash, null);
  assert.equal(update.connect_state_expires_at, null);
  assert.equal(update.connect_state_consumed_at, '2026-09-30T12:00:00.000Z');
  assert.equal('accounts' in update, false);
  assert.equal('transactions' in update, false);
});

void test('sync aceita somente conexão conectada, externa e do usuário', () => {
  const base = { user_id: 'user-1', status: 'connected', external_item_id: 'item-1' };

  assert.equal(canSyncOpenFinanceConnection(base, 'user-1'), true);
  assert.equal(canSyncOpenFinanceConnection({ ...base, status: 'pending_authorization' }, 'user-1'), false);
  assert.equal(canSyncOpenFinanceConnection({ ...base, external_item_id: null }, 'user-1'), false);
  assert.equal(canSyncOpenFinanceConnection({ ...base, user_id: 'user-2' }, 'user-1'), false);
  assert.equal(ownsOpenFinanceConnection(base, 'user-1'), true);
  assert.equal(ownsOpenFinanceConnection({ ...base, user_id: 'user-2' }, 'user-1'), false);
});

void test('respostas de erro genéricas não dependem do ID consultado', () => {
  const unknownId = openFinanceErrorResponse(404, 'request-1');
  const foreignId = openFinanceErrorResponse(404, 'request-2');

  assert.equal(unknownId.status, foreignId.status);
  return Promise.all([unknownId.json(), foreignId.json()]).then(([unknown, foreign]) => {
    assert.equal(unknown.error, foreign.error);
  });
});

void test('Pluggy autentica no servidor, reutiliza e renova a API Key sem expô-la', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let now = 0;
  const fetcher: OpenFinanceFetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({ url, init });
    return url.endsWith('/auth')
      ? new Response(JSON.stringify({ apiKey: `server-key-${requests.length}` }), { status: 200 })
      : new Response(JSON.stringify({ accessToken: `connect-token-${requests.length}` }), { status: 200 });
  };
  const configuration = pluggyConfiguration('cache-client');

  const first = await createPluggyConnectToken(
    configuration,
    { clientUserId: 'user-1', avoidDuplicates: true },
    fetcher,
    () => now,
  );
  const second = await createPluggyConnectToken(
    configuration,
    { clientUserId: 'user-1', avoidDuplicates: true },
    fetcher,
    () => now,
  );

  assert.equal(first, 'connect-token-2');
  assert.equal(second, 'connect-token-3');
  assert.equal(requests.filter(({ url }) => url.endsWith('/auth')).length, 1);
  assert.deepEqual(requestBody(requests[0].init), {
    clientId: 'cache-client',
    clientSecret: 'fixture-secret',
  });
  assert.deepEqual(requestBody(requests[1].init), {
    options: {
      clientUserId: 'user-1',
      avoidDuplicates: true,
      oauthRedirectUri: 'https://app.example.com/open-finance/callback',
    },
  });
  assert.equal(new Headers(requests[1].init?.headers).get('X-API-KEY'), 'server-key-1');

  now = 2 * 60 * 60 * 1000;
  await createPluggyConnectToken(
    configuration,
    { clientUserId: 'user-1', avoidDuplicates: true },
    fetcher,
    () => now,
  );
  assert.equal(requests.filter(({ url }) => url.endsWith('/auth')).length, 2);

  const response = createOpenFinancePendingResponse('connection-1', first, 'opaque-state');
  const body = await response.json();
  assert.deepEqual(body, {
    connection_id: 'connection-1',
    connect_token: 'connect-token-2',
    state: 'opaque-state',
    status: 'pending_authorization',
  });
  assert.equal(JSON.stringify(body).includes('server-key'), false);
  assert.equal(JSON.stringify(body).includes('fixture-secret'), false);
});

void test('Pluggy reconnect envia itemId somente na raiz do Connect Token', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: OpenFinanceFetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({ url, init });
    return new Response(
      JSON.stringify(url.endsWith('/auth') ? { apiKey: 'server-key' } : { accessToken: 'connect-token' }),
      { status: 200 },
    );
  };

  await createPluggyConnectToken(
    pluggyConfiguration('reconnect-client'),
    { clientUserId: 'user-1', avoidDuplicates: true, itemId: 'item-1' },
    fetcher,
  );

  assert.deepEqual(requestBody(requests[1].init), {
    itemId: 'item-1',
    options: {
      clientUserId: 'user-1',
      avoidDuplicates: true,
      oauthRedirectUri: 'https://app.example.com/open-finance/callback',
    },
  });
});

void test('configuração real falha fechado sem redirect OAuth HTTPS público', () => {
  const originalDeno = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
  const values: Record<string, string> = {
    OPEN_FINANCE_ENV: 'sandbox',
    OPEN_FINANCE_REAL_ENABLED: 'true',
    SUPABASE_URL: 'https://fixture.supabase.co',
    SUPABASE_ANON_KEY: 'fixture-anon',
    PLUGGY_CLIENT_ID: 'fixture-client',
    PLUGGY_CLIENT_SECRET: 'fixture-secret',
  };
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: { env: { get: (name: string) => values[name] } },
  });

  try {
    for (const redirect of [
      undefined,
      'http://app.example.com/open-finance/callback',
      'https://localhost/open-finance/callback',
      'https://127.0.0.1/open-finance/callback',
    ]) {
      if (redirect) values.OPEN_FINANCE_OAUTH_REDIRECT_URI = redirect;
      else delete values.OPEN_FINANCE_OAUTH_REDIRECT_URI;
      assert.equal(getOpenFinanceConfiguration(true).ok, false);
    }
    values.OPEN_FINANCE_OAUTH_REDIRECT_URI = 'https://app.example.com/open-finance/callback';
    const valid = getOpenFinanceConfiguration(true);
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(
        valid.configuration.oauthRedirectUri,
        'https://app.example.com/open-finance/callback',
      );
    }
  } finally {
    if (originalDeno) Object.defineProperty(globalThis, 'Deno', originalDeno);
    else Reflect.deleteProperty(globalThis, 'Deno');
  }
});

void test('Pluggy falha fechado para HTTP inválido, JSON inválido e payload incompleto', async () => {
  const rejected: OpenFinanceFetch = async (input) =>
    requestUrl(input).endsWith('/auth')
      ? new Response(JSON.stringify({ apiKey: 'server-key' }), { status: 200 })
      : new Response('{}', { status: 500 });
  const invalidJson: OpenFinanceFetch = async (input) =>
    requestUrl(input).endsWith('/auth')
      ? new Response(JSON.stringify({ apiKey: 'server-key' }), { status: 200 })
      : new Response('{', { status: 200 });
  const missingToken: OpenFinanceFetch = async (input) =>
    new Response(
      JSON.stringify(requestUrl(input).endsWith('/auth') ? { apiKey: 'server-key' } : {}),
      { status: 200 },
    );

  for (const [clientId, fetcher] of [
    ['rejected-client', rejected],
    ['invalid-json-client', invalidJson],
    ['missing-token-client', missingToken],
  ] as const) {
    await assert.rejects(
      () => createPluggyConnectToken(
        pluggyConfiguration(clientId),
        { clientUserId: 'user-1', avoidDuplicates: true },
        fetcher,
      ),
      (error: unknown) => error instanceof Error && error.message === 'Pluggy request failed',
    );
  }
});

void test('Widget sandbox ativa includeSandbox e produção não', () => {
  assert.deepEqual(buildPluggyWidgetOptions('sandbox', 'token'), {
    connectToken: 'token',
    includeSandbox: true,
    allowConnectInBackground: true,
    forceOauthInBrowser: true,
  });
  assert.deepEqual(buildPluggyWidgetOptions('production', 'token'), {
    connectToken: 'token',
    allowConnectInBackground: true,
    forceOauthInBrowser: true,
  });
});

void test('Widget mantém a sessão ao abrir e só a encerra em eventos terminais', () => {
  assert.deepEqual(resolvePluggyWidgetEvent('open', false), {
    clearSession: false,
    nextStatus: 'open',
  });
  assert.deepEqual(resolvePluggyWidgetEvent('close', false), {
    clearSession: true,
    nextStatus: 'closed',
  });
  assert.deepEqual(resolvePluggyWidgetEvent('error', false), {
    clearSession: true,
    nextStatus: 'error',
  });
  assert.deepEqual(resolvePluggyWidgetEvent('close', false, true), {
    clearSession: false,
    nextStatus: 'pending',
  });
  assert.deepEqual(resolvePluggyWidgetEvent('hide', false, true), {
    clearSession: false,
    nextStatus: 'pending',
  });
});

void test('Widget reconhece somente eventos que indicam transição OAuth', () => {
  assert.equal(isPluggyOAuthTransitionEvent('SELECTED_INSTITUTION'), false);
  assert.equal(isPluggyOAuthTransitionEvent('SUBMITTED_LOGIN'), true);
  assert.equal(isPluggyOAuthTransitionEvent('LOGIN_STEP_COMPLETED'), true);
  assert.equal(isPluggyOAuthTransitionEvent('ITEM_RESPONSE'), true);
});

void test('retorno OAuth reconhece somente a rota pública dedicada', () => {
  assert.equal(isOpenFinanceCallbackPath('/open-finance/callback'), true);
  assert.equal(isOpenFinanceCallbackPath('/open-finance/callback/other'), false);
  assert.equal(isOpenFinanceCallbackPath('/'), false);
});

void test('Widget ignora onClose posterior ao sucesso para preservar a confirmação', () => {
  assert.deepEqual(resolvePluggyWidgetEvent('close', true), {
    clearSession: false,
    nextStatus: null,
  });
  assert.deepEqual(resolvePluggyWidgetEvent('error', true), {
    clearSession: false,
    nextStatus: null,
  });
});

void test('Widget chama as Edge Functions corretas sem persistir o token', async () => {
  const calls: Array<{ name: string; body: unknown }> = [];
  const storageWrites: string[] = [];
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const storage = { setItem: (key: string, value: string) => storageWrites.push(`${key}:${value}`) };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
  const client = {
    functions: {
      invoke: async (name: string, options: { body: unknown }) => {
        calls.push({ name, body: options.body });
        return {
          data: {
            connection_id: 'connection-1',
            connect_token: 'token-1',
            state: 'state-1',
            status: 'pending_authorization',
          },
          error: null,
        };
      },
    },
  };

  try {
    const first = await invokeOpenFinanceAuthorization(client, 'connect');
    const second = await invokeOpenFinanceAuthorization(client, 'reconnect', 'connection-1');

    assert.equal(first.connectToken, 'token-1');
    assert.equal(second.connectionId, 'connection-1');
    assert.deepEqual(calls, [
      { name: 'open-finance-connect', body: {} },
      { name: 'open-finance-reconnect', body: { connectionId: 'connection-1' } },
    ]);
    assert.deepEqual(storageWrites, []);
  } finally {
    if (localStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', localStorageDescriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    if (sessionStorageDescriptor) Object.defineProperty(globalThis, 'sessionStorage', sessionStorageDescriptor);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});

void test('Widget rejeita erro da Edge e resposta que não está pendente', async () => {
  const failedClient = {
    functions: {
      invoke: async () => ({ data: null, error: new Error('internal') }),
    },
  };
  await assert.rejects(
    () => invokeOpenFinanceAuthorization(failedClient, 'connect'),
    /Não foi possível iniciar a autorização\./,
  );
});

void test('confirmação exige ownership e state one-shot válido', async () => {
  const state = await createOpenFinanceState();
  const connection = {
    user_id: 'user-1',
    status: 'pending_authorization',
    external_item_id: null,
    connect_state_hash: state.hash,
    connect_state_expires_at: '2026-10-01T12:10:00.000Z',
    connect_state_consumed_at: null,
  };
  const itemId = '22222222-2222-4222-8222-222222222222';
  const now = Date.parse('2026-10-01T12:00:00.000Z');

  assert.equal(await assessOpenFinanceConfirmation(connection, 'user-1', itemId, state.value, now), 'confirm');
  assert.equal(await assessOpenFinanceConfirmation(connection, 'user-2', itemId, state.value, now), 'reject');
  assert.equal(
    await assessOpenFinanceConfirmation(
      { ...connection, connect_state_expires_at: '2026-10-01T11:59:59.000Z' },
      'user-1', itemId, state.value, now,
    ),
    'reject',
  );
  assert.equal(
    await assessOpenFinanceConfirmation(
      { ...connection, connect_state_consumed_at: '2026-10-01T11:00:00.000Z' },
      'user-1', itemId, state.value, now,
    ),
    'reject',
  );
  assert.equal(await assessOpenFinanceConfirmation(connection, 'user-1', itemId, 'wrong-state', now), 'reject');
});

void test('confirmação é idempotente somente para a mesma conexão e Item', async () => {
  const itemId = '22222222-2222-4222-8222-222222222222';
  const connected = {
    user_id: 'user-1',
    status: 'connected',
    external_item_id: itemId,
    connect_state_hash: null,
    connect_state_expires_at: null,
    connect_state_consumed_at: '2026-10-01T12:00:00.000Z',
  };

  assert.equal(await assessOpenFinanceConfirmation(connected, 'user-1', itemId, '', 0), 'idempotent');
  assert.equal(
    await assessOpenFinanceConfirmation(
      connected,
      'user-1',
      '44444444-4444-4444-8444-444444444444',
      '',
      0,
    ),
    'reject',
  );
  assert.equal(await assessOpenFinanceConfirmation(connected, 'user-2', itemId, '', 0), 'reject');
});

void test('Item Pluggy só conclui UPDATED com SUCCESS ou PARTIAL_SUCCESS', () => {
  const itemId = '22222222-2222-4222-8222-222222222222';
  const base = { id: itemId, clientUserId: 'user-1', status: 'UPDATED' };

  assert.equal(validatePluggyItemConfirmation({ ...base, executionStatus: 'SUCCESS' }, itemId, 'user-1'), 'SUCCESS');
  assert.equal(
    validatePluggyItemConfirmation({ ...base, executionStatus: 'PARTIAL_SUCCESS' }, itemId, 'user-1'),
    'PARTIAL_SUCCESS',
  );
  for (const item of [
    { ...base, status: 'UPDATING', executionStatus: 'SUCCESS' },
    { ...base, status: 'WAITING_USER_INPUT', executionStatus: 'SUCCESS' },
    { ...base, status: 'LOGIN_ERROR', executionStatus: 'SUCCESS' },
    { ...base, status: 'OUTDATED', executionStatus: 'SUCCESS' },
    { ...base, executionStatus: 'ERROR' },
    { ...base, id: '55555555-5555-4555-8555-555555555555', executionStatus: 'SUCCESS' },
    { ...base, clientUserId: 'user-2', executionStatus: 'SUCCESS' },
  ]) assert.equal(validatePluggyItemConfirmation(item, itemId, 'user-1'), null);
});

void test('backend recupera somente o Item solicitado com API Key server-side', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const itemId = '22222222-2222-4222-8222-222222222222';
  const fetcher: OpenFinanceFetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({ url, init });
    return url.endsWith('/auth')
      ? new Response(JSON.stringify({ apiKey: 'server-item-key' }), { status: 200 })
      : new Response(JSON.stringify({
          id: itemId,
          clientUserId: 'user-1',
          status: 'UPDATED',
          executionStatus: 'PARTIAL_SUCCESS',
        }), { status: 200 });
  };

  const item = await getPluggyItem(pluggyConfiguration('item-client'), itemId, fetcher);

  assert.deepEqual(item, {
    id: itemId,
    clientUserId: 'user-1',
    status: 'UPDATED',
    executionStatus: 'PARTIAL_SUCCESS',
  });
  assert.equal(requests[1].url, `https://api.pluggy.ai/items/${itemId}`);
  assert.equal(new Headers(requests[1].init?.headers).get('X-API-KEY'), 'server-item-key');
  assert.equal(requests[1].init?.method, 'GET');
});

void test('backend falha fechado para Item inexistente ou resposta inválida', async () => {
  const itemId = '22222222-2222-4222-8222-222222222222';
  const missing: OpenFinanceFetch = async (input) =>
    requestUrl(input).endsWith('/auth')
      ? new Response(JSON.stringify({ apiKey: 'server-key' }), { status: 200 })
      : new Response('{}', { status: 404 });
  const invalid: OpenFinanceFetch = async (input) =>
    requestUrl(input).endsWith('/auth')
      ? new Response(JSON.stringify({ apiKey: 'server-key' }), { status: 200 })
      : new Response('{', { status: 200 });

  await assert.rejects(
    () => getPluggyItem(pluggyConfiguration('missing-item-client'), itemId, missing),
    /Pluggy request failed/,
  );
  await assert.rejects(
    () => getPluggyItem(pluggyConfiguration('invalid-item-client'), itemId, invalid),
    /Pluggy request failed/,
  );
});

void test('sync busca contas pelo Item e rejeita account.itemId divergente', async () => {
  const itemId = '22222222-2222-4222-8222-222222222222';
  const accountId = '33333333-3333-4333-8333-333333333333';
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: OpenFinanceFetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({ url, init });
    return url.endsWith('/auth')
      ? new Response(JSON.stringify({ apiKey: 'server-sync-key' }))
      : new Response(JSON.stringify({
          results: [{
            id: accountId,
            itemId,
            name: 'Conta corrente',
            type: 'BANK',
            subtype: 'CHECKING_ACCOUNT',
            number: '1234',
            currencyCode: 'BRL',
            balance: 125.5,
          }],
        }));
  };

  const accounts = await fetchPluggyAccounts(
    pluggyConfiguration('accounts-client'), itemId, fetcher,
  );

  assert.equal(requests[1].url, `https://api.pluggy.ai/accounts?itemId=${itemId}`);
  assert.equal(new Headers(requests[1].init?.headers).get('X-API-KEY'), 'server-sync-key');
  assert.deepEqual(accounts[0], {
    id: accountId,
    itemId,
    name: 'Conta corrente',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    number: '1234',
    currencyCode: 'BRL',
    balance: 125.5,
  });

  const divergent: OpenFinanceFetch = async (input) =>
    requestUrl(input).endsWith('/auth')
      ? new Response(JSON.stringify({ apiKey: 'server-key' }))
      : new Response(JSON.stringify({
          results: [{
            id: accountId,
            itemId: '44444444-4444-4444-8444-444444444444',
            name: 'Conta corrente',
            type: 'BANK',
            subtype: 'CHECKING_ACCOUNT',
            number: '1234',
            currencyCode: 'BRL',
            balance: 0,
          }],
        }));
  await assert.rejects(
    () => fetchPluggyAccounts(pluggyConfiguration('accounts-divergent'), itemId, divergent),
    /Pluggy request failed/,
  );
});

void test('sync usa somente /v2/transactions e reutiliza next opaco até null', async () => {
  const accountId = '33333333-3333-4333-8333-333333333333';
  const next = `?accountId=${accountId}&after=opaque%2Bcursor%3D`;
  const requests: string[] = [];
  const fetcher: OpenFinanceFetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (url.endsWith('/auth')) return new Response(JSON.stringify({ apiKey: 'server-key' }));
    const id = url.endsWith(next)
      ? '55555555-5555-4555-8555-555555555555'
      : '44444444-4444-4444-8444-444444444444';
    return new Response(JSON.stringify({
      results: [{
        id,
        providerId: `provider-${id}`,
        accountId,
        description: 'Compra',
        currencyCode: 'BRL',
        amount: -12.34,
        date: '2026-09-29T12:00:00.000Z',
        status: 'POSTED',
        type: 'DEBIT',
      }],
      next: url.endsWith(next) ? null : next,
    }));
  };

  const transactions = await fetchPluggyTransactions(
    pluggyConfiguration('transactions-client'), accountId, fetcher,
  );

  assert.deepEqual(requests.slice(1), [
    `https://api.pluggy.ai/v2/transactions?accountId=${accountId}`,
    `https://api.pluggy.ai/v2/transactions${next}`,
  ]);
  assert.equal(transactions.length, 2);
  assert.equal(transactions[0].amountCents, -1234);
});

void test('sync aborta next repetido e página intermediária inválida', async () => {
  const accountId = '33333333-3333-4333-8333-333333333333';
  const next = `?accountId=${accountId}&after=repeated`;
  const page = {
    results: [{
      id: '44444444-4444-4444-8444-444444444444',
      accountId,
      description: 'Compra',
      currencyCode: 'BRL',
      amount: -10,
      date: '2026-09-29T12:00:00.000Z',
      status: 'PENDING',
      type: 'DEBIT',
    }],
    next,
  };
  const repeated: OpenFinanceFetch = async (input) =>
    requestUrl(input).endsWith('/auth')
      ? new Response(JSON.stringify({ apiKey: 'server-key' }))
      : new Response(JSON.stringify(page));
  await assert.rejects(
    () => fetchPluggyTransactions(pluggyConfiguration('repeated-next'), accountId, repeated),
    /Pluggy request failed/,
  );

  let pageNumber = 0;
  const failed: OpenFinanceFetch = async (input) => {
    if (requestUrl(input).endsWith('/auth')) {
      return new Response(JSON.stringify({ apiKey: 'server-key' }));
    }
    pageNumber++;
    return pageNumber === 1
      ? new Response(JSON.stringify(page))
      : new Response('{', { status: 200 });
  };
  await assert.rejects(
    () => fetchPluggyTransactions(pluggyConfiguration('failed-page'), accountId, failed),
    /Pluggy request failed/,
  );
});

void test('sync rejeita transaction.accountId divergente', async () => {
  const accountId = '33333333-3333-4333-8333-333333333333';
  const fetcher: OpenFinanceFetch = async (input) =>
    requestUrl(input).endsWith('/auth')
      ? new Response(JSON.stringify({ apiKey: 'server-key' }))
      : new Response(JSON.stringify({
          results: [{
            id: '44444444-4444-4444-8444-444444444444',
            accountId: '55555555-5555-4555-8555-555555555555',
            description: 'Compra',
            currencyCode: 'BRL',
            amount: -10,
            date: '2026-09-29T12:00:00.000Z',
            status: 'POSTED',
            type: 'DEBIT',
          }],
          next: null,
        }));

  await assert.rejects(
    () => fetchPluggyTransactions(pluggyConfiguration('wrong-account'), accountId, fetcher),
    /Pluggy request failed/,
  );
});

void test('deduplicação prioriza providerId, depois ID Pluggy e fallback inequívoco', () => {
  const transaction = {
    id: '44444444-4444-4444-8444-444444444444',
    providerId: 'provider-stable',
    accountId: '33333333-3333-4333-8333-333333333333',
    description: 'Compra',
    currencyCode: 'BRL',
    amountCents: -1234,
    date: '2026-09-29T12:00:00.000Z',
    status: 'POSTED' as const,
    type: 'DEBIT',
  };
  assert.equal(pluggyTransactionExternalId(transaction), 'provider-stable');
  assert.equal(
    pluggyTransactionExternalId({ ...transaction, providerId: null }),
    transaction.id,
  );
  assert.equal(
    pluggyTransactionFallbackKey(transaction),
    '["2026-09-29T12:00:00.000Z",-1234,"BRL","POSTED","DEBIT","compra"]',
  );

  const candidates = [
    { id: 'local-provider', external_transaction_id: 'provider-stable', dedup_key: 'different' },
    { id: 'local-pluggy', external_transaction_id: transaction.id, dedup_key: 'different' },
  ];
  assert.equal(selectPluggyTransactionMatch(transaction, candidates), 'local-provider');
  assert.equal(
    selectPluggyTransactionMatch({ ...transaction, providerId: null }, candidates),
    'local-pluggy',
  );
  const fallback = pluggyTransactionFallbackKey(transaction);
  assert.equal(
    selectPluggyTransactionMatch(
      { ...transaction, providerId: null, id: null },
      [{ id: 'only', external_transaction_id: null, dedup_key: fallback }],
    ),
    'only',
  );
  assert.equal(
    selectPluggyTransactionMatch(
      { ...transaction, providerId: null, id: null },
      [
        { id: 'first', external_transaction_id: null, dedup_key: fallback },
        { id: 'second', external_transaction_id: null, dedup_key: fallback },
      ],
    ),
    null,
  );
});

void test('providerId permanece idempotente entre Items sem misturar escopos', () => {
  const base = {
    id: '44444444-4444-4444-8444-444444444444',
    providerId: 'provider-stable',
    accountId: '33333333-3333-4333-8333-333333333333',
    description: 'Compra',
    currencyCode: 'BRL',
    amountCents: -1234,
    date: '2026-09-29T12:00:00.000Z',
    status: 'PENDING' as const,
    type: 'DEBIT',
  };
  const candidates = [
    { id: 'same-owner', external_transaction_id: 'provider-stable', dedup_key: null },
  ];
  assert.equal(selectPluggyTransactionMatch(base, candidates), 'same-owner');
  assert.equal(
    selectPluggyTransactionMatch({ ...base, status: 'POSTED' }, candidates),
    'same-owner',
  );
  assert.equal(selectPluggyTransactionMatch(base, []), null);
});

void test('persistência mantém saldo informativo e valor transacional em centavos', () => {
  const account = buildPluggyAccountRow('connection-1', {
    id: '33333333-3333-4333-8333-333333333333',
    itemId: '22222222-2222-4222-8222-222222222222',
    name: 'Conta corrente',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    number: '1234',
    currencyCode: 'BRL',
    balance: 125.5,
  });
  assert.deepEqual(account, {
    connection_id: 'connection-1',
    external_account_id: '33333333-3333-4333-8333-333333333333',
    name: 'Conta corrente',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    number: '1234',
    currency: 'BRL',
    balance_current: 125.5,
  });
  assert.equal('cash' in account, false);

  const transaction = buildPluggyTransactionRow('account-1', {
    id: '44444444-4444-4444-8444-444444444444',
    providerId: 'provider-stable',
    accountId: '33333333-3333-4333-8333-333333333333',
    description: 'Compra',
    currencyCode: 'BRL',
    amountCents: -1234,
    date: '2026-09-29T12:00:00.000Z',
    status: 'POSTED',
    type: 'DEBIT',
  });
  assert.equal(transaction.external_transaction_id, 'provider-stable');
  assert.equal(transaction.amount_cents, -1234);
  assert.equal(transaction.amount, -12.34);
});

void test('resposta de sync é mínima e preserva PARTIAL_SUCCESS', async () => {
  const response = createOpenFinanceSyncResponse(
    'connection-1', 2, 15, true, '2026-09-30T12:00:00.000Z',
  );
  assert.deepEqual(await response.json(), {
    connection_id: 'connection-1',
    status: 'connected',
    accounts_synced: 2,
    transactions_synced: 15,
    partial: true,
    synced_at: '2026-09-30T12:00:00.000Z',
  });
});

void test('transição conectada consome state e preserva sucesso parcial sem vazar Item', async () => {
  const itemId = '22222222-2222-4222-8222-222222222222';
  const update = buildConfirmedConnectionUpdate(itemId, 'PARTIAL_SUCCESS', '2026-10-01T12:00:00.000Z');

  assert.deepEqual(update, {
    status: 'connected',
    external_item_id: itemId,
    external_execution_status: 'PARTIAL_SUCCESS',
    connect_state_hash: null,
    connect_state_expires_at: null,
    connect_state_consumed_at: '2026-10-01T12:00:00.000Z',
  });
  const response = createOpenFinanceConnectedResponse('11111111-1111-4111-8111-111111111111');
  assert.deepEqual(await response.json(), {
    connection_id: '11111111-1111-4111-8111-111111111111',
    status: 'connected',
  });
});

void test('Widget confirma somente com connection, item e state em memória', async () => {
  const calls: Array<{ name: string; body: unknown }> = [];
  const client = {
    functions: {
      invoke: async (name: string, options: { body: unknown }) => {
        calls.push({ name, body: options.body });
        return {
          data: { connection_id: 'connection-1', status: 'connected' },
          error: null,
        };
      },
    },
  };

  const result = await invokeOpenFinanceConfirmation(client, {
    connectionId: 'connection-1',
    connectToken: '',
    state: 'opaque-state',
    status: 'pending_authorization',
  }, '22222222-2222-4222-8222-222222222222');

  assert.deepEqual(result, { connectionId: 'connection-1', status: 'connected' });
  assert.deepEqual(calls, [{
    name: 'open-finance-confirm',
    body: {
      connection_id: 'connection-1',
      item_id: '22222222-2222-4222-8222-222222222222',
      state: 'opaque-state',
    },
  }]);
});

void test('webhook aceita somente POST application/json com payload estrutural válido', async () => {
  const fixture = webhookDependencies();
  const getResponse = await handlePluggyWebhookRequest(
    new Request('https://fixture.test', { method: 'GET' }), fixture.dependencies, 'request-1',
  );
  const textResponse = await handlePluggyWebhookRequest(
    new Request('https://fixture.test', {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}',
    }), fixture.dependencies, 'request-2',
  );
  const invalidJson = await handlePluggyWebhookRequest(
    new Request('https://fixture.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    }), fixture.dependencies, 'request-3',
  );
  assert.equal(getResponse.status, 405);
  assert.equal(textResponse.status, 415);
  assert.equal(invalidJson.status, 400);

  for (const [body, correlationId] of [
    [{ eventId: 'event-1' }, 'request-4'],
    [{ event: 'item/updated' }, 'request-5'],
    [{ event: 'item/updated', eventId: 'event-2' }, 'request-6'],
    [{ event: 'item/updated', eventId: 'event-3', itemId: 42 }, 'request-7'],
    [{ event: 'item/updated', eventId: 'event-4', itemId: 'not-a-uuid' }, 'request-8'],
    [{ event: 'item/error', eventId: 'event-5', triggeredBy: 'UNKNOWN' }, 'request-9'],
  ] as const) {
    const response = await handlePluggyWebhookRequest(
      webhookRequest(body), fixture.dependencies, correlationId,
    );
    assert.equal(response.status, 400);
  }
  assert.equal(fixture.events.size, 0);
});

void test('webhook registra eventId antes do 202 e duplicata não agenda outro processamento', async () => {
  const fixture = webhookDependencies();
  const event = { event: 'item/error', eventId: 'event-once', itemId: '22222222-2222-4222-8222-222222222222' };

  const first = await handlePluggyWebhookRequest(
    webhookRequest(event), fixture.dependencies, 'request-1',
  );
  const duplicate = await handlePluggyWebhookRequest(
    webhookRequest(event), fixture.dependencies, 'request-2',
  );

  assert.equal(first.status, 202);
  assert.equal(duplicate.status, 202);
  assert.equal(fixture.events.size, 1);
  assert.equal(fixture.tasks.length, 1);
  await fixture.tasks[0];
  assert.deepEqual(fixture.statuses, [{ eventId: 'event-once', status: 'ignored' }]);
  assert.equal(fixture.syncCalls(), 0);
});

void test('somente item/updated final validado server-side pode sincronizar', async () => {
  const itemId = '22222222-2222-4222-8222-222222222222';
  for (const eventName of [
    'unknown/event',
    'item/created',
    'item/error',
    'item/deleted',
    'item/waiting_user_input',
    'item/waiting_user_action',
    'item/login_succeeded',
    'transactions/created',
    'connector/status_updated',
  ]) {
    const fixture = webhookDependencies();
    const response = await handlePluggyWebhookRequest(
      webhookRequest({ event: eventName, eventId: `event-${eventName}`, itemId }),
      fixture.dependencies,
      'request-noop',
    );
    assert.equal(response.status, 202);
    await fixture.tasks[0];
    assert.equal(fixture.syncCalls(), 0);
    assert.equal(fixture.statuses.at(-1)?.status, 'ignored');
  }

  for (const executionStatus of ['SUCCESS', 'PARTIAL_SUCCESS'] as const) {
    let requestedItem = '';
    const fixture = webhookDependencies({
      getItem: async (requested) => {
        requestedItem = requested;
        return {
          id: requested,
          clientUserId: 'server-user',
          status: 'UPDATED',
          executionStatus,
        };
      },
    });
    const response = await handlePluggyWebhookRequest(
      webhookRequest({
        event: 'item/updated', eventId: `event-${executionStatus}`, itemId,
        clientUserId: 'attacker-controlled', triggeredBy: 'SYNC',
      }),
      fixture.dependencies,
      'request-sync',
    );
    assert.equal(response.status, 202);
    assert.equal(fixture.syncCalls(), 0);
    await fixture.tasks[0];
    assert.equal(requestedItem, itemId);
    assert.equal(fixture.syncCalls(), 1);
    assert.deepEqual(fixture.statuses, [
      {
        eventId: `event-${executionStatus}`,
        status: 'processing',
        connectionId: '11111111-1111-4111-8111-111111111111',
      },
      { eventId: `event-${executionStatus}`, status: 'processed' },
    ]);
  }
});

void test('webhook ignora Item não final, conexão ausente, revogada ou divergente', async () => {
  const itemId = '22222222-2222-4222-8222-222222222222';
  const cases: Array<Partial<PluggyWebhookDependencies>> = [
    { getItem: async () => ({ id: itemId, clientUserId: 'user', status: 'UPDATING', executionStatus: 'MERGING' }) },
    { getItem: async () => ({ id: itemId, clientUserId: 'user', status: 'WAITING_USER_INPUT', executionStatus: 'SUCCESS' }) },
    { getItem: async () => ({ id: itemId, clientUserId: 'user', status: 'LOGIN_ERROR', executionStatus: 'ERROR' }) },
    { getItem: async () => ({ id: itemId, clientUserId: 'user', status: 'OUTDATED', executionStatus: 'ERROR' }) },
    { getItem: async () => ({ id: '33333333-3333-4333-8333-333333333333', clientUserId: 'user', status: 'UPDATED', executionStatus: 'SUCCESS' }) },
    { findConnection: async () => null },
    { findConnection: async () => ({ id: 'connection', user_id: 'user', provider: 'pluggy', status: 'revoked', external_item_id: itemId, external_execution_status: 'SUCCESS' }) },
    { findConnection: async () => ({ id: 'connection', user_id: 'user', provider: 'other', status: 'connected', external_item_id: itemId, external_execution_status: 'SUCCESS' }) },
    { findConnection: async () => ({ id: 'connection', user_id: 'user', provider: 'pluggy', status: 'connected', external_item_id: '33333333-3333-4333-8333-333333333333', external_execution_status: 'SUCCESS' }) },
    { findConnection: async () => ({ id: 'connection', user_id: 'other-user', provider: 'pluggy', status: 'connected', external_item_id: itemId, external_execution_status: 'SUCCESS' }) },
  ];
  for (const [index, overrides] of cases.entries()) {
    const fixture = webhookDependencies(overrides);
    const response = await handlePluggyWebhookRequest(
      webhookRequest({ event: 'item/updated', eventId: `event-ignore-${index}`, itemId }),
      fixture.dependencies,
      'request-ignore',
    );
    assert.equal(response.status, 202);
    await fixture.tasks[0];
    assert.equal(fixture.syncCalls(), 0);
    assert.equal(fixture.statuses.at(-1)?.status, 'ignored');
  }
});

void test('webhook falha fechado se Pluggy, ledger ou banco estiverem indisponíveis', async () => {
  const itemId = '22222222-2222-4222-8222-222222222222';
  const event = { event: 'item/updated', eventId: 'event-infrastructure', itemId };

  const ledger = webhookDependencies({
    insertEvent: async () => { throw new Error('database payload'); },
  });
  const rejected = await handlePluggyWebhookRequest(
    webhookRequest(event), ledger.dependencies, 'request-ledger',
  );
  assert.equal(rejected.status, 500);
  assert.equal(JSON.stringify(await rejected.json()).includes('database payload'), false);
  assert.equal(ledger.tasks.length, 0);

  for (const [failure, expectedCode] of [
    [{ getItem: async () => { throw new Error('Pluggy API key'); } }, 'ITEM_VALIDATION_FAILED'],
    [{ findConnection: async () => { throw new Error('service role'); } }, 'CONNECTION_LOOKUP_FAILED'],
  ] as const) {
    const fixture = webhookDependencies(failure);
    const response = await handlePluggyWebhookRequest(
      webhookRequest({ ...event, eventId: `event-${expectedCode}` }),
      fixture.dependencies,
      'request-background',
    );
    assert.equal(response.status, 202);
    await assert.doesNotReject(() => fixture.tasks[0]);
    assert.deepEqual(fixture.statuses.at(-1), {
      eventId: `event-${expectedCode}`,
      status: 'failed',
      errorCode: expectedCode,
    });
    assert.equal(JSON.stringify(fixture.logs).includes('Pluggy API key'), false);
    assert.equal(JSON.stringify(fixture.logs).includes('service role'), false);
  }
});

void test('falha assíncrona fica contida, marca ledger failed e não vaza segredo', async () => {
  const secret = 'service-role-secret';
  const apiKey = 'pluggy-api-key';
  const itemId = '22222222-2222-4222-8222-222222222222';
  const fixture = webhookDependencies({
    syncConnection: async () => { throw new Error(`${secret} ${apiKey} transaction description`); },
  });
  const response = await handlePluggyWebhookRequest(
    webhookRequest({ event: 'item/updated', eventId: 'event-failed', itemId }),
    fixture.dependencies,
    'request-failed',
  );

  assert.equal(response.status, 202);
  assert.equal(await response.text(), '');
  await assert.doesNotReject(() => fixture.tasks[0]);
  assert.deepEqual(fixture.statuses, [
    {
      eventId: 'event-failed',
      status: 'processing',
      connectionId: '11111111-1111-4111-8111-111111111111',
    },
    { eventId: 'event-failed', status: 'failed', errorCode: 'SYNC_FAILED' },
  ]);
  const serialized = JSON.stringify(fixture.logs);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(apiKey), false);
  assert.equal(serialized.includes('transaction description'), false);
});

// Estas verificações precisam de implementação e sandbox. Não são aprovações de integração real.
for (const scenario of [
  'funções Edge integradas ao provider',
  'schema e políticas no banco dedicado',
  'campos de conexões persistidas pelo backend',
  'unicidade de IDs externos no banco',
  'deduplicação remota',
  'isolamento entre usuários no backend',
  'falhas HTTP reais do provider',
  'reconexão completa via consentimento',
]) void test.todo(`Open Finance real: ${scenario}`);
