import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow } from '../src/model';
import {
  backup,
  load,
  parseBackup,
  STORAGE_KEY,
} from '../src/services/storage';
import {
  accountKey,
  fingerprint,
  OWNER_KEY,
  resolveInitialSync,
  serializeSnapshot,
  switchAccount,
} from '../src/services/sync-core';
import { authMessage } from '../src/services/auth-errors';

const data = () => {
  const d = defaults();
  d.debts.push({
    ...emptyRow('debts'),
    id: 'a',
    name: 'Teste A',
    totalInstallments: 12,
    installmentAmount: 500,
    paidInstallments: 1,
  });
  return d;
};
const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};
void test('snapshot cloud usa backup validado com todos os domínios e schema atual', () => {
  const d = data();
  assert.deepEqual(
    parseBackup(JSON.stringify(serializeSnapshot(d))),
    parseBackup(backup(d)),
  );
  assert.equal(
    fingerprint(d),
    fingerprint({ ...d, settings: { ...d.settings } }),
  );
});
void test('primeiro login com dados locais exige migração explícita', () => {
  assert.equal(resolveInitialSync(data(), null), 'migration');
  assert.equal(resolveInitialSync(defaults(), null), 'upload');
});
void test('dispositivo vazio baixa nuvem e snapshots iguais não são reenviados', () => {
  const remote = {
    data: data(),
    updated_at: '2026-09-12T10:00:00Z',
    device_id: 'A',
  };
  assert.equal(resolveInitialSync(defaults(), remote), 'download');
  assert.equal(resolveInitialSync(remote.data, remote), 'equal');
});
void test('dois dispositivos: download quando apenas remoto mudou; conflito quando ambos mudaram', () => {
  const original = data();
  const a = structuredClone(original);
  a.settings.essential = 250;
  const b = structuredClone(original);
  b.settings.essential = 500;
  const remote = {
    data: a,
    updated_at: '2026-09-12T11:00:00Z',
    device_id: 'A',
  };
  assert.equal(
    resolveInitialSync(original, remote, fingerprint(original)),
    'download',
  );
  assert.equal(
    resolveInitialSync(b, remote, fingerprint(original)),
    'conflict',
  );
  assert.equal(
    resolveInitialSync(b, { ...remote, data: original }, fingerprint(original)),
    'upload',
  );
});
void test('A → logout → B não disponibiliza Teste A a B e preserva A ao retornar', () => {
  const storage = memory();
  storage.setItem(STORAGE_KEY, JSON.stringify(data()));
  const a = switchAccount(storage, 'A', load(storage));
  assert.equal(a.debts[0].name, 'Teste A');
  const b = switchAccount(storage, 'B', a);
  assert.equal(b.debts.length, 0);
  assert.equal(load(storage).debts.length, 0);
  assert.equal(storage.getItem(OWNER_KEY), 'B');
  assert.equal(
    parseBackup(storage.getItem(accountKey('A'))!).debts[0].name,
    'Teste A',
  );
  assert.equal(switchAccount(storage, 'A', b).debts[0].name, 'Teste A');
});
void test('migração arquiva cópia convidado; falha de storage não publica novo proprietário', () => {
  const storage = memory();
  switchAccount(storage, 'A', data());
  assert.deepEqual(
    parseBackup(storage.getItem('rota-cloud-guest-recovery')!),
    parseBackup(backup(data())),
  );
  const failed = {
    getItem: storage.getItem,
    setItem: () => {
      throw Error('Quota exceeded');
    },
  };
  assert.throws(() => switchAccount(failed, 'B', data()));
  assert.equal(storage.getItem(OWNER_KEY), 'A');
});
void test('alterações offline persistem após recarga e ficam elegíveis ao upload ou conflito', () => {
  const storage = memory();
  const before = data();
  const after = structuredClone(before);
  after.settings.essential = 999;
  storage.setItem(STORAGE_KEY, JSON.stringify(after));
  const remote = { data: before, updated_at: 'v1', device_id: 'A' };
  assert.equal(load(storage).settings.essential, 999);
  assert.equal(
    resolveInitialSync(load(storage), remote, fingerprint(before)),
    'upload',
  );
});
void test('erros comuns de autenticação são traduzidos sem expor conteúdo sensível', () => {
  assert.equal(
    authMessage({ message: 'Invalid login credentials' }),
    'Email ou senha incorretos.',
  );
  assert.match(authMessage({ message: 'Email not confirmed' }), /Confirme/);
  assert.equal(
    authMessage({ message: 'secret internal response' }),
    'secret internal response',
  );
});
