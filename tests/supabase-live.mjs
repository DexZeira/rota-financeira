import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Explicitly provision two empty, disposable accounts in a dedicated project.
// Never load production .env.local or use a service-role key for these assertions.
const required = ['ROTA_TEST_SUPABASE_URL', 'ROTA_TEST_SUPABASE_KEY', 'ROTA_TEST_EMAIL_A', 'ROTA_TEST_PASSWORD_A', 'ROTA_TEST_EMAIL_B', 'ROTA_TEST_PASSWORD_B'];
if (process.env.ROTA_LIVE_TEST !== 'dedicated' || required.some((key) => !process.env[key])) {
  console.error('Teste real não executado: configure o ambiente dedicado e duas contas descartáveis em .env.test.local.');
  process.exit(1);
}
const key = process.env.ROTA_TEST_SUPABASE_KEY;
if (key.startsWith('sb_secret_')) throw Error('Use somente chave pública de teste.');
if (key.split('.').length === 3 && JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role !== 'anon') throw Error('Chave privilegiada não permitida.');
const client = () => createClient(process.env.ROTA_TEST_SUPABASE_URL, key, { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }, global: { fetch: (url, options) => fetch(url, {...options, signal:AbortSignal.timeout(15000)}) } });
const a = client(), a2 = client(), b = client(), anonymous = client();
const marker = `rota-test-${randomUUID()}`;
const fixtures = [];
let stage = 'autenticação';
const ok = (result) => { assert.equal(result.error, null, `Falha na etapa: ${stage}`); return result.data; };
const table = (c) => c.from('user_app_state');
const rpc = (c, id, revision, device = marker) => c.rpc('save_app_state', {
  p_user_id:id, p_data:{ testFixture:marker }, p_schema_version:5, p_device_id:device, p_expected_updated_at:revision,
});
try {
  const login = async (c, suffix) => ok(await c.auth.signInWithPassword({email:process.env[`ROTA_TEST_EMAIL_${suffix}`],password:process.env[`ROTA_TEST_PASSWORD_${suffix}`]})).user.id;
  const idA = await login(a,'A'), idA2 = await login(a2,'A'), idB = await login(b,'B');
  assert.equal(idA,idA2); assert.notEqual(idA,idB);
  stage = 'proteção de dados preexistentes';
  for (const [c,id] of [[a,idA],[b,idB]]) assert.equal(ok(await table(c).select('user_id').eq('user_id',id)).length,0,'Conta possui dados: teste abortado sem substituição.');
  stage = 'criação dos snapshots de teste';
  for (const [c,id] of [[a,idA],[b,idB]]) {
    const rows = ok(await rpc(c,id,null)); assert.equal(rows.length,1); fixtures.push([c,id]);
  }
  stage = 'RLS SELECT, INSERT, UPDATE, DELETE e RPC cruzados';
  for (const [c,own,other] of [[a,idA,idB],[b,idB,idA]]) {
    assert.deepEqual(ok(await table(c).select('user_id')).map((row) => row.user_id),[own]);
    assert.equal(ok(await table(c).select('user_id').eq('user_id',other)).length,0);
    assert.equal(ok(await table(c).update({device_id:marker+'-forbidden'}).eq('user_id',other).select()).length,0);
    assert.equal(ok(await table(c).delete().eq('user_id',other).select()).length,0);
    assert.ok((await table(c).insert({user_id:other,data:{testFixture:marker},schema_version:5,device_id:marker})).error);
    assert.ok((await rpc(c,other,null)).error);
  }
  const anon = await table(anonymous).select('user_id');
  assert.ok(anon.error || anon.data.length === 0);
  stage = 'CAS concorrente em duas sessões da mesma conta';
  const before = ok(await table(a).select('updated_at').eq('user_id',idA).single());
  const races = await Promise.all([rpc(a,idA,before.updated_at,marker+'-A'),rpc(a2,idA,before.updated_at,marker+'-A2')]);
  assert.deepEqual(races.map((result) => ok(result).length).sort((x,y) => x-y),[0,1]);
  assert.equal(ok(await rpc(a,idA,before.updated_at)).length,0);
  const after = ok(await table(a).select('updated_at').eq('user_id',idA).single());
  assert.notEqual(after.updated_at,before.updated_at);
  console.log('RLS/CAS real aprovado: duas contas, três sessões, isolamento e gravação concorrente.');
} catch {
  console.error(`Teste real falhou na etapa: ${stage}. Nenhum detalhe de conta, token ou snapshot foi registrado.`);
  process.exitCode = 1;
} finally {
  for (const [c,id] of fixtures) {
    const result = await table(c).delete().eq('user_id',id).like('device_id',marker+'%');
    if (result.error) { console.error('Limpeza da fixture falhou; revise o projeto dedicado.'); process.exitCode = 1; }
  }
  await Promise.allSettled([a,a2,b].map((c) => c.auth.signOut({scope:'local'})));
}
