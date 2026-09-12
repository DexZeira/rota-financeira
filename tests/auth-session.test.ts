import test from 'node:test';
import assert from 'node:assert/strict';
import { observeSession } from '../src/services/auth-session';

function fixture() {
  let resolve!: (value: { data: { session: string | null } }) => void;
  let reject!: (error: Error) => void;
  let event!: (event: string, session: string | null) => void;
  let unsubscribed = false;
  const updates: (string | null)[] = [];
  const pending = new Promise<{ data: { session: string | null } }>((yes, no) => {
    resolve = yes; reject = no;
  });
  const stop = observeSession({
    getSession: () => pending,
    onAuthStateChange: (callback) => {
      event = callback;
      return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
    },
  }, (session) => updates.push(session));
  return { resolve, reject, event, stop, updates, unsubscribed: () => unsubscribed };
}
void test('restauração atrasada não desfaz logout ou troca de conta', async () => {
  for (const next of [null, 'B']) {
    const f = fixture();
    f.event(next ? 'SIGNED_IN' : 'SIGNED_OUT', next);
    f.resolve({ data: { session: 'A' } });
    await new Promise((done) => setImmediate(done));
    assert.deepEqual(f.updates, [next]);
    f.stop();
  }
});
void test('restaura sessão e cleanup ignora resposta pendente', async () => {
  const f = fixture();
  f.resolve({ data: { session: 'A' } });
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(f.updates, ['A']);
  f.stop();
  f.event('SIGNED_IN', 'B');
  assert.deepEqual(f.updates, ['A']);
  assert.equal(f.unsubscribed(), true);
});
void test('falha de restauração libera modo local sem promise rejeitada', async () => {
  const f = fixture();
  f.reject(Error('storage unavailable'));
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(f.updates, [null]);
  f.stop();
});
void test('desmontagem antes da restauração impede publicação da sessão', async () => {
  const f = fixture();
  f.stop();
  f.resolve({ data: { session: 'A' } });
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(f.updates, []);
});
