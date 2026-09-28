import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Explicitly provision two empty, disposable accounts in a dedicated project.
// Never load production .env.local or use a service-role key for these assertions.
let env = {};
try {
  env = parseEnv(
    readFileSync(new URL('../.env.test.local', import.meta.url), 'utf8'),
  );
} catch {
  /* Explicit skip below. Never fall back to process.env or .env.local. */
}
const required = [
  'VITE_TEST_SUPABASE_URL',
  'VITE_TEST_SUPABASE_ANON_KEY',
  'TEST_USER_A_EMAIL',
  'TEST_USER_A_PASSWORD',
  'TEST_USER_B_EMAIL',
  'TEST_USER_B_PASSWORD',
];
await test(
  'Supabase/RLS/CAS remoto: duas contas descartáveis',
  {
    skip: required.some((key) => !env[key])
      ? 'PENDENTE: .env.test.local sem as seis variáveis dedicadas; produção nunca é utilizada.'
      : false,
  },
  async () => {
    const key = env.VITE_TEST_SUPABASE_ANON_KEY;
    if (key.startsWith('sb_secret_'))
      throw Error('Use somente chave pública de teste.');
    try {
      if (
        key.split('.').length === 3 &&
        JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role !== 'anon'
      )
        throw Error();
      if (!key.startsWith('sb_publishable_') && key.split('.').length !== 3)
        throw Error();
      const url = new URL(env.VITE_TEST_SUPABASE_URL);
      if (
        url.protocol !== 'https:' ||
        !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
      )
        throw Error();
    } catch {
      throw Error('Configuração dedicada inválida. Valores omitidos.');
    }
    const { defaults } = await import('../.test-output/src/model.js');
    const {
      serializeSnapshot,
      switchAccount,
      resolveInitialSync,
      fingerprint,
      OWNER_KEY,
    } = await import('../.test-output/src/services/sync-core.js');
    const { save } = await import('../.test-output/src/services/storage.js');
    const { decode } =
      await import('../.test-output/src/services/cloud-codec.js');
    const client = () =>
      createClient(env.VITE_TEST_SUPABASE_URL, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: (url, options) =>
            fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
        },
      });
    const a = client(),
      a2 = client(),
      b = client(),
      anonymous = client();
    const marker = `rota-test-${randomUUID()}`;
    const fixtures = [];
    let stage = 'autenticação';
    const ok = (result) => {
      assert.equal(result.error, null, `Falha na etapa: ${stage}`);
      return result.data;
    };
    const table = (c) => c.from('user_app_state');
    const rpc = (c, id, revision, device = marker, snapshot = defaults()) =>
      c.rpc('save_app_state', {
        p_user_id: id,
        p_data: serializeSnapshot(snapshot),
        p_schema_version: 6,
        p_device_id: device,
        p_expected_updated_at: revision,
      });
    try {
      const login = async (c, suffix) =>
        ok(
          await c.auth.signInWithPassword({
            email: env[`TEST_USER_${suffix}_EMAIL`],
            password: env[`TEST_USER_${suffix}_PASSWORD`],
          }),
        ).user.id;
      const idA = await login(a, 'A'),
        idA2 = await login(a2, 'A'),
        idB = await login(b, 'B');
      assert.equal(idA, idA2);
      assert.notEqual(idA, idB);
      stage = 'proteção de dados preexistentes';
      for (const [c, id] of [
        [a, idA],
        [b, idB],
      ])
        assert.equal(
          ok(await table(c).select('user_id').eq('user_id', id)).length,
          0,
          'Conta possui dados: teste abortado sem substituição.',
        );
      stage = 'criação dos snapshots de teste';
      for (const [c, id] of [
        [a, idA],
        [b, idB],
      ]) {
        const rows = ok(await rpc(c, id, null));
        assert.equal(rows.length, 1);
        fixtures.push([c === a ? a2 : c, id]);
      }
      stage = 'RLS SELECT, INSERT, UPDATE, DELETE e RPC cruzados';
      for (const [c, own, other] of [
        [a, idA, idB],
        [b, idB, idA],
      ]) {
        assert.deepEqual(
          ok(await table(c).select('user_id')).map((row) => row.user_id),
          [own],
        );
        assert.equal(
          ok(await table(c).select('user_id').eq('user_id', other)).length,
          0,
        );
        assert.equal(
          ok(
            await table(c)
              .update({ device_id: marker + '-forbidden' })
              .eq('user_id', other)
              .select(),
          ).length,
          0,
        );
        assert.equal(
          ok(await table(c).delete().eq('user_id', other).select()).length,
          0,
        );
        assert.ok(
          (
            await table(c).insert({
              user_id: other,
              data: { testFixture: marker },
              schema_version: 5,
              device_id: marker,
            })
          ).error,
        );
        assert.ok((await rpc(c, other, null)).error);
      }
      const anon = await table(anonymous).select('user_id');
      assert.ok(anon.error || anon.data.length === 0);
      stage = 'CAS concorrente em duas sessões da mesma conta';
      const before = ok(
        await table(a).select('updated_at').eq('user_id', idA).single(),
      );
      const races = await Promise.all([
        rpc(a, idA, before.updated_at, marker + '-A'),
        rpc(a2, idA, before.updated_at, marker + '-A2'),
      ]);
      assert.deepEqual(
        races.map((result) => ok(result).length).sort((x, y) => x - y),
        [0, 1],
      );
      assert.equal(ok(await rpc(a, idA, before.updated_at)).length, 0);
      const after = ok(
        await table(a).select('updated_at').eq('user_id', idA).single(),
      );
      assert.notEqual(after.updated_at, before.updated_at);
      stage = 'edição offline e alteração remota independente';
      const baseline = decode(
        ok(
          await table(a)
            .select('data,updated_at,device_id,schema_version')
            .eq('user_id', idA)
            .single(),
        ),
      );
      const local = structuredClone(baseline.data);
      local.settings.openingCash = 12;
      const concurrent = structuredClone(baseline.data);
      concurrent.settings.openingCash = 34;
      assert.equal(
        ok(
          await rpc(
            a2,
            idA,
            baseline.updated_at,
            marker + '-offline',
            concurrent,
          ),
        ).length,
        1,
      );
      const remote = decode(
        ok(
          await table(a)
            .select('data,updated_at,device_id,schema_version')
            .eq('user_id', idA)
            .single(),
        ),
      );
      assert.equal(
        resolveInitialSync(local, remote, fingerprint(baseline.data)),
        'conflict',
      );
      assert.equal(
        ok(await rpc(a, idA, baseline.updated_at, marker, local)).length,
        0,
      );
      stage = 'logout A, login B e isolamento do snapshot local';
      const values = new Map();
      const storage = {
        getItem: (k) => values.get(k) ?? null,
        setItem: (k, v) => values.set(k, v),
      };
      save(storage, local);
      storage.setItem(OWNER_KEY, idA);
      ok(await a.auth.signOut({ scope: 'local' }));
      assert.equal(await login(a, 'B'), idB);
      const isolated = switchAccount(storage, idB, local);
      assert.equal(isolated.settings.openingCash, 0);
      assert.equal(storage.getItem(OWNER_KEY), idB);
      console.log(
        'RLS/CAS real aprovado: duas contas, três sessões, isolamento e gravação concorrente.',
      );
    } catch {
      console.error(
        `Teste real falhou na etapa: ${stage}. Nenhum detalhe de conta, token ou snapshot foi registrado.`,
      );
      throw Error(
        `Teste dedicado falhou na etapa: ${stage}. Credenciais omitidas.`,
      );
    } finally {
      for (const [c, id] of fixtures) {
        const result = await table(c)
          .delete()
          .eq('user_id', id)
          .like('device_id', marker + '%');
        if (result.error) {
          console.error(
            'Limpeza da fixture falhou; revise o projeto dedicado.',
          );
          process.exitCode = 1;
        }
      }
      await Promise.allSettled(
        [a, a2, b].map((c) => c.auth.signOut({ scope: 'local' })),
      );
    }
  },
);
