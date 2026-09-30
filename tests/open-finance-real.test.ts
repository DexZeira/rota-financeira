import test from 'node:test';
import assert from 'node:assert/strict';
import { MockOpenFinanceProvider } from '../src/services/open-finance/mock-provider';
import { PluggyOpenFinanceProvider } from '../src/services/open-finance/pluggy-provider';
import { OpenFinanceError } from '../src/services/open-finance/errors';
import {
  buildPendingAuthorizationUpdate,
  buildRevokedUpdate,
  canSyncOpenFinanceConnection,
  createOpenFinanceState,
  openFinanceErrorResponse,
  ownsOpenFinanceConnection,
} from '../supabase/functions/_shared/open-finance';

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
