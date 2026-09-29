import test from 'node:test';
import assert from 'node:assert/strict';
import { MockOpenFinanceProvider } from '../src/services/open-finance/mock-provider';
import { PluggyOpenFinanceProvider } from '../src/services/open-finance/pluggy-provider';
import { OpenFinanceError } from '../src/services/open-finance/errors';

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
