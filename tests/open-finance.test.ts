import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow } from '../src/model';
import { MockOpenFinanceProvider } from '../src/services/open-finance/mock-provider';
import { OpenFinanceSyncService } from '../src/services/open-finance/sync';
import {
  emptyOpenFinance,
  type ConnectedAccount,
  type Connection,
  type RemoteTransaction,
} from '../src/services/open-finance/types';
import {
  transactionPage,
  validateOpenFinance,
} from '../src/services/open-finance/state';
import { OpenFinanceError } from '../src/services/open-finance/errors';
import {
  reconcileTransfer,
  reconcileRemote,
  reviewTransactions,
  deleteConnectionData,
} from '../src/services/open-finance/reconciliation';
import {
  backup,
  load,
  save,
  STORAGE_KEY,
  validateData,
} from '../src/services/storage';
import { inspectBackup } from '../src/services/emergency-backup';
import { strongKey } from '../src/services/import/duplicate-detection';
import {
  buildSearchIndex,
  searchIndex,
} from '../src/services/universal-search';
import { auditFinancialData } from '../src/services/financial-audit';

const now = () => new Date('2026-09-20T12:00:00Z');
async function fixture(provider = new MockOpenFinanceProvider(now)) {
  const c = await provider.authorize(
    await provider.createConnection(
      'guest',
      (await provider.listInstitutions())[0],
    ),
    'guest',
  );
  const state = await new OpenFinanceSyncService(provider, now).synchronize(
    { ...emptyOpenFinance(), connections: [c] },
    c.id,
    'guest',
    30,
  );
  return {
    provider,
    c,
    state,
    data: validateData({
      ...defaults(),
      openFinanceVersion: 1,
      planningVersion: 9,
      openFinance: state,
    }),
  };
}
const review = {
  action: 'create' as const,
  recordKind: '' as const,
  recordId: '',
  category: 'outras',
  override: false,
  remember: false,
};

void test('Open Finance: transferências entre contas de mesmo nome não geram caixa', async () => {
  const { data, state } = await fixture();
  const first = state.transactions[0],
    account = state.accounts[0];
  data.openFinance!.accounts.push({
    ...account,
    id: 'second',
    externalAccountId: 'second',
  });
  data.openFinance!.transactions.push({
    ...first,
    id: 'second-tx',
    accountId: 'second',
    transaction: {
      ...first.transaction,
      accountId: 'second',
      direction: 'credit',
    },
  });
  const preview = reviewTransactions(data, [first.id, 'second-tx']);
  assert.deepEqual(preview[0].transferLines, [2]);
  const next = await reconcileTransfer(data, first.id, 'second-tx');
  assert.equal(next.expenses.length + next.bankReceipts.length, 0);
  assert.equal(
    next.imports.links.filter((l) => l.action === 'transfer').length,
    2,
  );
  assert.equal(
    new Set(next.openFinance!.transactions.map((r) => r.importLinkId)).size,
    2,
  );
});

void test('Open Finance: transações sem ID externo mantêm vínculos distintos', async () => {
  const { data, state } = await fixture();
  const first = state.transactions[0];
  data.openFinance!.transactions = [
    { ...first, transaction: { ...first.transaction, externalId: '' } },
    {
      ...first,
      id: 'second',
      transaction: { ...first.transaction, externalId: '', amountCents: 8000 },
    },
  ];
  const next = await reconcileRemote(
    await reconcileRemote(data, first.id, review),
    'second',
    review,
  );
  assert.equal(next.expenses.length, 2);
  assert.equal(
    new Set(next.openFinance!.transactions.map((r) => r.importLinkId)).size,
    2,
  );
});

void test('Open Finance: heurística sem ID externo nunca descarta registro ambíguo', async () => {
  const { c, state } = await fixture();
  state.transactions[0].transaction.externalId = '';
  class NoIds extends MockOpenFinanceProvider {
    override async getTransactions(
      a: ConnectedAccount,
      c: Connection,
      owner: string,
      o: { since: string; cursor: string | null },
    ) {
      const batch = await super.getTransactions(a, c, owner, {
        ...o,
        cursor: null,
      });
      batch.items = batch.items.map((r) => ({
        ...r,
        id: 'another-stable-local-id',
        transaction: { ...r.transaction, externalId: '' },
      }));
      return batch;
    }
  }
  const service = new OpenFinanceSyncService(new NoIds(now), now);
  const next = await service.synchronize(state, c.id, 'guest', 30);
  assert.equal(next.transactions.length, 2);
  assert.equal(
    (await service.synchronize(next, c.id, 'guest', 30)).transactions.length,
    2,
  );
});

void test('Open Finance: resposta de consentimento de outro usuário é recusada', async () => {
  const { c, state } = await fixture();
  class WrongOwner extends MockOpenFinanceProvider {
    override async getConsent(c: Connection, owner: string) {
      return { ...(await super.getConsent(c, owner)), userId: 'B' };
    }
  }
  const next = await new OpenFinanceSyncService(
    new WrongOwner(now),
    now,
  ).synchronize(state, c.id, 'guest', 30);
  assert.equal(next.connections[0].errorCode, 'INVALID_RESPONSE');
  assert.equal(next.connections[0].userId, 'guest');
  assert.deepEqual(next.transactions, state.transactions);
});

void test('Open Finance: Retry-After da conexão é respeitado e permite retomada limitada', async () => {
  const { c, state } = await fixture();
  let clock = now();
  class Limited extends MockOpenFinanceProvider {
    blocked = true;
    override async getConsent(c: Connection, owner: string) {
      if (this.blocked) throw new OpenFinanceError('RATE_LIMITED', 600);
      return super.getConsent(c, owner);
    }
  }
  const provider = new Limited(() => clock),
    service = new OpenFinanceSyncService(provider, () => clock);
  const next = await service.synchronize(state, c.id, 'guest', 30);
  clock = new Date(+now() + 120000);
  provider.blocked = false;
  await assert.rejects(
    () => service.synchronize(next, c.id, 'guest', 30),
    /RATE_LIMITED/,
  );
  clock = new Date(+now() + 601000);
  assert.equal(
    (await service.synchronize(next, c.id, 'guest', 30)).connections[0]
      .errorCode,
    null,
  );
});

void test('Open Finance: paginação completa aplica uma vez e erro parcial preserva a outra conta', async () => {
  const { c, state } = await fixture();
  const second = {
    ...state.accounts[0],
    id: 'second',
    externalAccountId: 'second',
  };
  state.accounts.push(second);
  state.balances.push({
    ...state.balances[0],
    accountId: 'second',
    current: 111,
  });
  class Pages extends MockOpenFinanceProvider {
    override async listAccounts(c: Connection, owner: string) {
      return [...(await super.listAccounts(c, owner)), second];
    }
    override async getBalance(
      a: ConnectedAccount,
      c: Connection,
      owner: string,
    ) {
      if (a.id === 'second') throw new OpenFinanceError('PROVIDER_ERROR');
      return super.getBalance(a, c, owner);
    }
    override async getTransactions(
      a: ConnectedAccount,
      c: Connection,
      owner: string,
      o: { since: string; cursor: string | null },
    ) {
      const batch = await super.getTransactions(a, c, owner, {
        ...o,
        cursor: null,
      });
      if (o.cursor === 'page-2')
        return {
          ...batch,
          items: batch.items.map((r) => ({
            ...r,
            id: 'new-page-row',
            transaction: { ...r.transaction, externalId: 'page-2-tx' },
          })),
          cursor: 'done',
        };
      return { ...batch, nextPage: 'page-2' };
    }
  }
  const next = await new OpenFinanceSyncService(
    new Pages(now),
    now,
  ).synchronize(state, c.id, 'guest', 30);
  assert.equal(next.transactions.length, 2);
  assert.equal(
    next.sync.find((s) => s.accountId === state.accounts[0].id)?.cursor,
    'done',
  );
  assert.equal(
    next.balances.find((b) => b.accountId === 'second')?.current,
    111,
  );
  assert.equal(next.connections[0].errorCode, 'PARTIAL_SYNC');
});

void test('Open Finance: correção remota não reescreve lançamento nem fechamento', async () => {
  const { data, state, c } = await fixture();
  const imported = await reconcileRemote(
    data,
    state.transactions[0].id,
    review,
  );
  class Corrected extends MockOpenFinanceProvider {
    override async getTransactions(
      a: ConnectedAccount,
      c: Connection,
      owner: string,
      o: { since: string; cursor: string | null },
    ) {
      const batch = await super.getTransactions(a, c, owner, {
        ...o,
        cursor: null,
      });
      return {
        ...batch,
        items: batch.items.map((r) => ({
          ...r,
          transaction: { ...r.transaction, amountCents: 9000 },
        })),
      };
    }
  }
  const next = {
    ...imported,
    openFinance: await new OpenFinanceSyncService(
      new Corrected(now),
      now,
    ).synchronize(imported.openFinance!, c.id, 'guest', 30),
  };
  assert.equal(next.openFinance.transactions[0].reviewed, false);
  assert.equal(next.expenses[0].amount, 45.9);
  assert.deepEqual(next.reporting, imported.reporting);
  await assert.rejects(() =>
    reconcileRemote(next, state.transactions[0].id, review),
  );
});

void test('Open Finance: timeout preserva dados; cursor repetido não entra em loop', async () => {
  const { c, state } = await fixture();
  class Hanging extends MockOpenFinanceProvider {
    override getConsent(): Promise<Connection> {
      return new Promise(() => {});
    }
  }
  const result = await new OpenFinanceSyncService(
    new Hanging(now),
    now,
    5,
  ).synchronize(state, c.id, 'guest', 30);
  assert.equal(result.connections[0].errorCode, 'NETWORK_ERROR');
  assert.deepEqual(result.transactions, state.transactions);
  class Loop extends MockOpenFinanceProvider {
    override async getTransactions(
      a: ConnectedAccount,
      c: Connection,
      owner: string,
      o: { since: string; cursor: string | null },
    ) {
      return {
        ...(await super.getTransactions(a, c, owner, o)),
        nextPage: 'same-page',
      };
    }
  }
  const loop = await new OpenFinanceSyncService(new Loop(now), now).synchronize(
    state,
    c.id,
    'guest',
    30,
  );
  assert.equal(loop.sync[0].errorCode, 'INVALID_RESPONSE');
  assert.deepEqual(loop.transactions, state.transactions);
});

void test('Open Finance: autorização explícita, contas e valores em centavos; saldo não altera caixa', async () => {
  const p = new MockOpenFinanceProvider(now),
    c = await p.createConnection('guest', (await p.listInstitutions())[0]);
  assert.equal(c.status, 'pending_authorization');
  await assert.rejects(() =>
    new OpenFinanceSyncService(p, now).synchronize(
      { ...emptyOpenFinance(), connections: [c] },
      c.id,
      'guest',
      30,
    ),
  );
  const { state, data } = await fixture();
  assert.equal(state.balances[0].current, 250000);
  assert.equal(data.settings.openingCash, 0);
  assert.equal(data.expenses.length, 0);
  assert.equal(state.accounts[0].maskedNumber, '•••• 1234');
});
void test('Open Finance: sync incremental idempotente e revisão reutiliza importação', async () => {
  const { provider, c, state, data } = await fixture();
  const again = await new OpenFinanceSyncService(provider, now).synchronize(
    state,
    c.id,
    'guest',
    30,
  );
  assert.equal(again.transactions.length, 1);
  const imported = await reconcileRemote(
    data,
    state.transactions[0].id,
    review,
  );
  assert.equal(imported.expenses.length, 1);
  assert.equal(imported.expenses[0].amount, 45.9);
  await assert.rejects(() =>
    reconcileRemote(imported, state.transactions[0].id, review),
  );
});
void test('Open Finance: lançamentos manuais correspondentes exigem conciliação sem duplicação', async () => {
  const { data, state } = await fixture();
  data.expenses.push({
    ...emptyRow('expenses'),
    id: 'manual',
    date: '2026-09-20',
    name: 'Compra demonstração',
    amount: 45.9,
    recurrence: 'única',
  });
  const preview = reviewTransactions(data, [state.transactions[0].id])[0];
  assert.ok(preview.candidates.length);
  await assert.rejects(() =>
    reconcileRemote(data, state.transactions[0].id, review),
  );
  const next = await reconcileRemote(data, state.transactions[0].id, {
    ...review,
    action: 'match',
    recordKind: 'expenses',
    recordId: 'manual',
  });
  assert.equal(next.expenses.length, 1);
});
for (const source of ['csv', 'ofx'] as const)
  void test(`Open Finance x ${source}: uma única transação econômica`, async () => {
    const { data, state } = await fixture();
    data.expenses.push({
      ...emptyRow('expenses'),
      id: 'existing',
      date: '2026-09-20',
      name: 'Compra demonstração',
      amount: 45.9,
      recurrence: 'única',
    });
    data.imports.sessions.push({
      id: 'session',
      source,
      fileName: 'fixture',
      createdAt: now().toISOString(),
      hash: 'a'.repeat(64),
      rowCount: 1,
      importedCount: 1,
      matchedCount: 0,
      ignoredCount: 0,
      duplicateCount: 0,
      invalidCount: 0,
    });
    data.imports.links.push({
      id: 'old-link',
      sessionId: 'session',
      transaction: { ...state.transactions[0].transaction, source },
      action: 'created',
      recordKind: 'expenses',
      recordId: 'existing',
      fingerprint: '',
    });
    const next = await reconcileRemote(data, state.transactions[0].id, {
      ...review,
      action: 'match',
      recordKind: 'expenses',
      recordId: 'existing',
    });
    assert.equal(next.expenses.length, 1);
    assert.equal(next.imports.links.length, 2);
  });
void test('Open Finance: identidade forte inclui conta e conexão', async () => {
  const { state } = await fixture();
  const t = state.transactions[0].transaction;
  assert.notEqual(
    strongKey(t),
    strongKey({ ...t, accountId: 'outra-conexao:conta' }),
  );
});
void test('Open Finance: pending → posted conserva ID e nunca duplica lançamento', async () => {
  const { provider, c, state } = await fixture();
  state.transactions[0].status = 'pending';
  state.sync[0].cursor = null;
  const next = await new OpenFinanceSyncService(provider, now).synchronize(
    state,
    c.id,
    'guest',
    30,
  );
  assert.equal(next.transactions.length, 1);
  assert.equal(next.transactions[0].status, 'posted');
  const d = validateData({
    ...defaults(),
    openFinanceVersion: 1,
    planningVersion: 9,
    openFinance: state,
  });
  await assert.rejects(() =>
    reconcileRemote(d, state.transactions[0].id, review),
  );
});
void test('Open Finance: crédito, refund, moeda e ausência de saldo preservados', async () => {
  const { state } = await fixture();
  state.transactions[0].transaction.direction = 'credit';
  state.transactions[0].kind = 'refund';
  state.balances[0].current = null;
  const d = validateData({
    ...defaults(),
    openFinanceVersion: 1,
    planningVersion: 9,
    openFinance: state,
  });
  const next = await reconcileRemote(d, state.transactions[0].id, review);
  assert.equal(next.bankReceipts[0].amountCents, 4590);
  assert.equal(next.openFinance!.balances[0].current, null);
  state.accounts[0].currency = 'USD';
  state.balances[0].currency = 'USD';
  const other = validateData({ ...d, openFinance: state });
  await assert.rejects(
    () => reconcileRemote(other, state.transactions[0].id, review),
    /moeda/,
  );
});
void test('Open Finance: expiração, renovação e revogação preservam histórico', async () => {
  const { provider, c, state } = await fixture();
  const expired = { ...c, expiresAt: '2026-09-19T00:00:00Z' };
  const result = await new OpenFinanceSyncService(provider, now).synchronize(
    { ...state, connections: [expired] },
    c.id,
    'guest',
    30,
  );
  assert.equal(result.connections[0].status, 'expired');
  assert.equal(result.transactions.length, 1);
  const renewed = await provider.authorize(expired, 'guest');
  assert.equal(renewed.status, 'connected');
  const revoked = await provider.revokeConsent(renewed, 'guest');
  assert.equal(revoked.status, 'revoked');
  await assert.rejects(() =>
    new OpenFinanceSyncService(provider, now).synchronize(
      { ...state, connections: [revoked] },
      c.id,
      'guest',
      30,
    ),
  );
});
void test('Open Finance: outra conta não acessa conexão, consentimento nem contas', async () => {
  const { provider, c, state } = await fixture();
  await assert.rejects(() => provider.getConsent(c, 'B'));
  await assert.rejects(() => provider.getBalance(state.accounts[0], c, 'B'));
  await assert.rejects(() =>
    new OpenFinanceSyncService(provider, now).synchronize(state, c.id, 'B', 30),
  );
});
void test('Open Finance: offline não chama provider e conserva bytes', async () => {
  const { provider, c, state } = await fixture();
  provider.failure = 'PROVIDER_ERROR';
  const before = JSON.stringify(state);
  await assert.rejects(
    () =>
      new OpenFinanceSyncService(provider, now).synchronize(
        state,
        c.id,
        'guest',
        30,
        false,
      ),
    /NETWORK_ERROR/,
  );
  assert.equal(JSON.stringify(state), before);
});
void test('Open Finance: 429 pausa tentativas sem loop, 401 pede reautorização', async () => {
  const { provider, c, state } = await fixture();
  provider.failure = 'RATE_LIMITED';
  const service = new OpenFinanceSyncService(provider, now);
  const next = await service.synchronize(state, c.id, 'guest', 30);
  assert.equal(next.connections[0].errorCode, 'RATE_LIMITED');
  await assert.rejects(() => service.synchronize(next, c.id, 'guest', 30));
  provider.failure = 'AUTH_REQUIRED';
  const auth = await service.synchronize(state, c.id, 'guest', 30);
  assert.equal(auth.connections[0].status, 'reauthorization_required');
});
void test('Open Finance: paginação interrompida não publica saldo, cursor ou metade de transações', async () => {
  class Broken extends MockOpenFinanceProvider {
    override async getTransactions(
      a: ConnectedAccount,
      c: Connection,
      owner: string,
      o: { since: string; cursor: string | null },
    ) {
      if (o.cursor === 'page-2') throw new OpenFinanceError('PROVIDER_ERROR');
      const first = await super.getTransactions(a, c, owner, {
        ...o,
        cursor: null,
      });
      return { ...first, nextPage: 'page-2' };
    }
  }
  const { c, state } = await fixture();
  const next = await new OpenFinanceSyncService(
    new Broken(now),
    now,
  ).synchronize(state, c.id, 'guest', 30);
  assert.equal(next.connections[0].errorCode, 'PARTIAL_SYNC');
  assert.deepEqual(next.transactions, state.transactions);
  assert.deepEqual(next.balances, state.balances);
  assert.equal(next.sync[0].cursor, state.sync[0].cursor);
});
void test('Open Finance: resposta inválida bloqueada, campos secretos descartados do backup', async () => {
  const { state, data } = await fixture();
  assert.throws(() =>
    validateOpenFinance({
      ...state,
      balances: [{ ...state.balances[0], current: NaN }],
    }),
  );
  assert.throws(() =>
    validateOpenFinance({
      ...state,
      transactions: [{ ...state.transactions[0], accountId: 'missing' }],
    }),
  );
  const polluted = {
    ...state,
    access_token: 'SECRET-SENTINEL',
    connections: [
      { ...state.connections[0], refresh_token: 'SECRET-SENTINEL' },
    ],
  };
  const text = backup({ ...data, openFinance: polluted });
  assert.ok(!text.includes('SECRET-SENTINEL'));
  assert.equal(
    (await inspectBackup(text)).data.openFinance!.connections[0].status,
    'reauthorization_required',
  );
});
void test('Open Finance: migração opt-in protege bytes e é idempotente sem conversão dupla', async () => {
  const { data } = await fixture();
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
  save(storage, defaults());
  const old = map.get(STORAGE_KEY);
  save(storage, data);
  assert.equal(
    map.get('rota-money-before-migration:open-finance-v1:guest'),
    old,
  );
  const first = map.get(STORAGE_KEY);
  save(storage, load(storage));
  assert.equal(map.get(STORAGE_KEY), first);
  assert.equal(load(storage).openFinance!.balances[0].current, 250000);
  assert.throws(() => validateData({ ...data, openFinanceVersion: 2 }));
  assert.throws(() => validateData({ ...data, planningVersion: 10 }));
});
void test('Open Finance: exclusão separada exige revogação; histórico fechado é preservado', async () => {
  const { data, state, provider, c } = await fixture();
  const imported = await reconcileRemote(
    data,
    state.transactions[0].id,
    review,
  );
  assert.throws(() => deleteConnectionData(imported, c.id, 'guest'));
  imported.openFinance!.connections = [
    await provider.revokeConsent(c, 'guest'),
  ];
  const result = deleteConnectionData(imported, c.id, 'guest');
  assert.equal(result.expenses.length, 0);
  assert.deepEqual(result.reporting, imported.reporting);
  assert.equal(result.openFinance!.connections[0].status, 'revoked');
});
void test('Open Finance: busca não duplica item conciliado; auditoria detecta conta órfã', async () => {
  const { data, state } = await fixture();
  const imported = await reconcileRemote(
    data,
    state.transactions[0].id,
    review,
  );
  assert.equal(
    searchIndex(
      buildSearchIndex(imported, '2026-09-20'),
      'Compra demonstração',
    ).results.filter((r) => r.id.startsWith('bank-transaction')).length,
    0,
  );
  const broken = structuredClone(data);
  broken.openFinance!.accounts[0].connectionId = 'missing';
  assert.ok(
    auditFinancialData(broken, '2026-09-20').some(
      (i) => i.domain === 'open-finance',
    ),
  );
});
void test('Open Finance: 100 mil transações normalizadas e dez contas sem duplicar schema monetário', async () => {
  const { state } = await fixture();
  const a = state.accounts[0],
    t = state.transactions[0];
  state.accounts = Array.from({ length: 10 }, (_, i) => ({
    ...a,
    id: `account-${i}`,
    externalAccountId: `a-${i}`,
  }));
  state.balances = [];
  state.sync = [];
  state.transactions = Array.from(
    { length: 100000 },
    (_, i): RemoteTransaction => ({
      ...t,
      id: `row-${i}`,
      accountId: `account-${i % 10}`,
      transaction: {
        ...t.transaction,
        externalId: `tx-${i}`,
        accountId: `account-${i % 10}`,
      },
    }),
  );
  assert.equal(validateOpenFinance(state).transactions.length, 100000);
  for (const page of [0, 2000, 3999, 99999]) {
    const result = transactionPage(state, 'guest', page);
    assert.equal(result.total, 100000);
    assert.equal(result.rows.length, 25);
    assert.equal(result.rows[0].id, `row-${result.page * 25}`);
  }
  assert.equal(transactionPage(state, 'another-owner', 0).total, 0);
});
