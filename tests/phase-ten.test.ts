import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow } from '../src/model';
import {
  emergencyBackup,
  parseEmergencyBackup,
} from '../src/services/emergency-backup';
import {
  recordDiagnostic,
  readDiagnostics,
  DIAGNOSTIC_KEY,
} from '../src/services/app-diagnostics';
import { quotaHealth } from '../src/services/storage-health';
import { ownerCopies } from '../src/services/storage-quota';
import { save, load, STORAGE_KEY } from '../src/services/storage';
import { recoveryCopy, startupHealth } from '../src/services/recovery';
import {
  withWriteLock,
  observeChanges,
  publishChange,
} from '../src/services/tab-coordination';
import {
  OWNER_KEY,
  switchAccount,
  fingerprint,
  resolveInitialSync,
  parseSyncMeta,
} from '../src/services/sync-core';
const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
};
void test('gerenciador de cópias não expõe backup de outra conta ou cópia sem proprietário conhecido', () => {
  const copies = ['rota-cloud-account:A','rota-cloud-account:B','rota-last-valid:B','rota-money-rounding:unknown-id','rota-money-rounding:B:uuid','rota-corrupted-recovery:A'].map(key=>({key,text:'private',bytes:20,protected:false}));
  assert.deepEqual(ownerCopies(copies,'B').map(c=>c.key),['rota-cloud-account:B','rota-last-valid:B','rota-money-rounding:B:uuid']);
  assert.deepEqual(ownerCopies(copies,null),[]);
});
void test('backup de emergência: checksum e round trip offline preservam preferências e valores', async () => {
  const d = defaults();
  d.settings.openingCash = 123.45;
  d.notificationPreferences.enabled = true;
  const text = await emergencyBackup(d),
    raw = JSON.parse(text);
  assert.match(raw.checksum, /^[a-f0-9]{64}$/);
  assert.equal(raw.payload.data.settings.openingCash, 12345);
  assert.equal(
    fingerprint(await parseEmergencyBackup(text)),
    fingerprint(load({ getItem: () => JSON.stringify(raw.payload.data) })),
  );
  raw.payload.data.settings.openingCash++;
  await assert.rejects(parseEmergencyBackup(JSON.stringify(raw)), /corrompido/);
});
void test('diagnóstico é ring buffer e nunca armazena mensagem, stack, conta ou contexto', () => {
  const s = memory();
  for (let i = 0; i < 150; i++)
    recordDiagnostic('sync', new Error('email secreto R$ 900 token backup'), s);
  assert.equal(readDiagnostics(s).length, 100);
  assert.doesNotMatch(s.getItem(DIAGNOSTIC_KEY)!, /secreto|900|token|backup/);
  const events = JSON.parse(s.getItem(DIAGNOSTIC_KEY)!);
  events[0].token = 'secret';
  s.setItem(DIAGNOSTIC_KEY, JSON.stringify(events));
  assert.doesNotMatch(JSON.stringify(readDiagnostics(s)), /secret/);
  assert.doesNotThrow(() =>
    recordDiagnostic('storage', new Error(), {
      getItem: () => {
        throw Error();
      },
      setItem: () => {
        throw Error();
      },
    }),
  );
});
void test('quota: desconhecida não vira zero e limiares 80/90/95 são distintos', () => {
  assert.equal(quotaHealth().percent, null);
  assert.equal(quotaHealth(1, 0).level, 'unknown');
  assert.deepEqual(
    [79, 80, 90, 95].map((n) => quotaHealth(n, 100).level),
    ['normal', 'attention', 'warning', 'critical'],
  );
});
void test('última cópia válida é recuperável e corrupção não a substitui', () => {
  const s = memory(),
    d = defaults();
  save(s, d);
  d.settings.openingCash = 40;
  save(s, d);
  s.setItem(STORAGE_KEY, 'broken');
  assert.throws(() => startupHealth(s));
  assert.equal(recoveryCopy(s)?.settings.openingCash, 0);
  save(s, d);
  assert.equal(recoveryCopy(s)?.settings.openingCash, 0);
});
void test('quota durante preparação mantém exatamente o snapshot anterior', () => {
  const s = memory(),
    d = defaults();
  save(s, d);
  const before = s.getItem(STORAGE_KEY);
  const full = {
    ...s,
    setItem: (k: string, v: string) => {
      if (k.startsWith('rota-last-valid:'))
        throw new DOMException('', 'QuotaExceededError');
      s.setItem(k, v);
    },
  };
  d.settings.openingCash = 10;
  assert.throws(() => save(full, d));
  assert.equal(s.getItem(STORAGE_KEY), before);
});
void test('gravações idênticas não repetem escrita do snapshot', () => {
  const s = memory(),
    d = defaults();
  save(s, d);
  let writes = 0;
  save(
    {
      ...s,
      setItem: (k, v) => {
        writes++;
        s.setItem(k, v);
      },
    },
    d,
  );
  assert.equal(writes, 0);
});
void test('saúde inicial detecta IDs duplicados sem corrigir ou salvar', () => {
  const s = memory(),
    d = defaults(),
    r = { ...emptyRow('expenses'), id: 'duplicate' };
  d.expenses = [r, r];
  s.setItem(STORAGE_KEY, JSON.stringify(d));
  const before = s.getItem(STORAGE_KEY);
  assert.throws(() => startupHealth(s));
  assert.equal(s.getItem(STORAGE_KEY), before);
});
void test('schema futuro não é substituído nem pela recuperação', () => {
  const s = memory();
  s.setItem(STORAGE_KEY, JSON.stringify({ dataVersion: 999 }));
  assert.throws(() => save(s, defaults()));
  assert.equal(s.getItem(STORAGE_KEY), '{"dataVersion":999}');
});
void test('falha na confirmação da escrita restaura bytes anteriores', () => {
  const s = memory(),
    d = defaults();
  save(s, d);
  const before = s.getItem(STORAGE_KEY);
  let verifyFailure = false;
  const broken = {
    getItem: (k: string) => {
      if (k === STORAGE_KEY && verifyFailure) {
        verifyFailure = false;
        throw Error('readback');
      }
      return s.getItem(k);
    },
    setItem: (k: string, v: string) => {
      s.setItem(k, v);
      if (k === STORAGE_KEY) verifyFailure = true;
    },
  };
  d.settings.openingCash = 100;
  assert.throws(() => save(broken, d), /readback/);
  assert.equal(s.getItem(STORAGE_KEY), before);
});
void test('revisões inválidas são recusadas e precisão de microssegundos é preservada', () => {
  assert.throws(() => parseSyncMeta('{"revision":12}'));
  assert.throws(() => parseSyncMeta('{"revision":"invalid"}'));
  const revision = '2026-09-27T12:00:01.123456+00:00';
  assert.equal(parseSyncMeta(JSON.stringify({ revision })).revision, revision);
});
void test('duas gravações com a mesma revisão: Web Lock aceita somente a primeira', async () => {
  let queue = Promise.resolve(),
    revision = 0;
  const locks = {
    request: (_name: string, _options: unknown, write: () => unknown) => {
      const next = queue.then(write);
      queue = next.then(
        () => {},
        () => {},
      );
      return next;
    },
  } as Pick<LockManager, 'request'>;
  const write = () => {
    if (revision !== 0) throw Error('stale');
    revision++;
  };
  const results = await Promise.allSettled([
    withWriteLock(write, locks),
    withWriteLock(write, locks),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    ['fulfilled', 'rejected'],
  );
  assert.equal(revision, 1);
  assert.equal(await withWriteLock(() => 4, undefined), 4);
});
void test('BroadcastChannel transporta apenas evento técnico e remove listener ao sair', () => {
  const previous = globalThis.BroadcastChannel;
  const channels: {
    onmessage: null | ((e: { data: unknown }) => void);
    closed: boolean;
  }[] = [];
  class Channel {
    onmessage: null | ((e: { data: unknown }) => void) = null;
    closed = false;
    constructor() {
      channels.push(this);
    }
    postMessage(data: unknown) {
      for (const c of channels)
        if (c !== this && !c.closed) c.onmessage?.({ data });
    }
    close() {
      this.closed = true;
    }
  }
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    value: Channel,
    configurable: true,
    writable: true,
  });
  try {
    const received: string[] = [];
    const stop = observeChanges((type) => received.push(type));
    publishChange('statechanged');
    stop();
    publishChange('syncdone');
    assert.deepEqual(received, ['statechanged']);
    assert.ok(channels.every((c) => c.closed));
  } finally {
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: previous,
      configurable: true,
      writable: true,
    });
  }
});
void test('conta B não herda snapshot A; recuperação também é isolada por proprietário', () => {
  const s = memory(),
    a = defaults();
  a.settings.openingCash = 777;
  save(s, a);
  s.setItem(OWNER_KEY, 'A');
  const b = switchAccount(s, 'B', a);
  assert.equal(b.settings.openingCash, 0);
  assert.equal(recoveryCopy(s), null);
  const remote = { data: b, updated_at: 'rev11', device_id: 'B' };
  assert.equal(
    resolveInitialSync(a, remote, fingerprint(defaults())),
    'upload',
  );
  remote.data = { ...b, settings: { ...b.settings, openingCash: 22 } };
  assert.equal(
    resolveInitialSync(a, remote, fingerprint(defaults())),
    'conflict',
  );
});
