import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/model';
import { previewImport, prepareImport } from '../src/services/import/import-session';
import { normalizeManioRows, detectManioColumns } from '../src/services/manio-sheet-parser';
import { manioImportLines } from '../src/services/manio-import';
import { createGoogleSheetsReader, readGoogleSheetsConfiguration, ManioError } from '../supabase/functions/_shared/manio-sheets';
import { handleManioRequest, syncManioConnection, type ManioStore, type ManioDependencies, type ManioConnection } from '../supabase/functions/_shared/manio-handlers';
import type { ManioSourceRow } from '../src/services/manio-sheet-parser';
import { financial } from '../src/calculations';
import { validateData, backup, parseBackup } from '../src/services/storage';

const config = { institution_name: 'C6 Bank', account_reference: 'C6 Conta', id: 'connection-1' };
const table = [['Data', 'Descrição', 'Valor', 'transaction_id', 'Categoria', 'Tipo'], ['10/09/2026', 'Mercado', '-100,50', 'tx-1', 'alimentação', '']];
void test('Manio detecta aliases PT/EN e rejeita cabeçalhos incompletos/ambíguos', () => {
  assert.equal(detectManioColumns(table[0]).amount, 2);
  assert.equal(detectManioColumns(['transaction_date', 'merchant', 'value']).description, 1);
  assert.throws(() => detectManioColumns(['data', 'valor']), /colunas/);
  assert.throws(() => detectManioColumns(['data', 'date', 'description', 'amount']), /colunas/);
});
for (const [raw, cents] of [['1000.50', 100050], ['1000,50', 100050], ['R$ 1.000,50', 100050], ['-100.50', -10050], ['-100,50', -10050]] as const) {
  void test(`Manio valor seguro ${raw}`, async () => {
    const rows = await normalizeManioRows([['date', 'description', 'amount'], ['2026-09-10', 'Teste', raw]], config);
    assert.equal(rows[0].amount_cents, Math.abs(cents));
    assert.equal(rows[0].type, cents < 0 ? 'expense' : 'income');
  });
}
void test('Manio fingerprint SHA256 estável por instituição/conta e ID forte preservado', async () => {
  const rows = await normalizeManioRows(table, config);
  assert.equal(rows[0].source_key, 'id:tx-1');
  const noId = [['Data', 'Descrição', 'Valor'], ['10/09/2026', ' MÉRCADO  ', '-100,50']];
  const a = await normalizeManioRows(noId, config);
  const b = await normalizeManioRows([noId[0], ['2026-09-10', 'mercado', '-100.50']], config);
  assert.equal(a[0].source_key, b[0].source_key);
  assert.match(a[0].source_key, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(a[0].source_key, (await normalizeManioRows(noId, { ...config, account_reference: 'Cartão' }))[0].source_key);
});
void test('Manio não perde ambiguidades, data inválida, zero ou valores imprecisos', async () => {
  await assert.rejects(normalizeManioRows([table[0], table[1], table[1]], config));
  for (const values of [['31/02/2026', '-1'], ['2026-09-10', '0'], ['2026-09-10', '1.000'], ['2026-09-10', '1.2345']]) {
    await assert.rejects(normalizeManioRows([['date', 'description', 'amount'], [values[0], 'Teste', values[1]]], config));
  }
});
void test('Manio tipo explícito e transferências não são receitas/despesas por inferência', async () => {
  const rows = await normalizeManioRows([table[0], ['10/09/2026', 'Transferência', '-100', 'transfer', '', 'transferência'], ['10/09/2026', 'Despesa', '100', 'expense', '', 'expense']], config);
  assert.equal(rows[0].type, 'transfer');
  assert.equal(rows[1].type, 'expense');
});
void test('Manio integra o pipeline existente, idempotente, preservando categoria manual', async () => {
  const normalized = await normalizeManioRows(table, config);
  const lines = manioImportLines(normalized, config);
  const base = defaults();
  const review = { action: 'create' as const, category: 'saúde', recordKind: '' as const, recordId: '', override: false, remember: false };
  const next = prepareImport(base, lines, { 1: review }, { source: 'manio', fileName: 'Manio', hash: 'a'.repeat(64) });
  assert.equal(next.expenses.length, 1);
  assert.equal(next.expenses[0].category, 'saúde');
  assert.equal(previewImport(next, lines)[0].status, 'duplicate');
  const updated = manioImportLines([{ ...normalized[0], amount_cents: 20050, source_category: 'lazer' }], config);
  assert.equal(previewImport(next, updated)[0].duplicate?.level, 'exact');
  assert.equal(next.expenses[0].category, 'saúde');
  assert.equal(next.expenses[0].amount, 100.5);
  assert.equal(base.expenses.length, 0);
});
void test('Manio revisão concilia CSV/OFX sem dupla contabilização e mantém backup/cloud compatível', async () => {
  const row = (await normalizeManioRows(table, config))[0];
  const lines = manioImportLines([row], config);
  const base = defaults();
  const review = { action: 'create' as const, category: 'saúde', recordKind: '' as const, recordId: '', override: false, remember: false };
  const csv = prepareImport(base, [{ ...lines[0], transaction: { ...lines[0].transaction!, source: 'csv', accountLabel: 'Conta CSV', externalId: '' } }], { 1: review }, { source: 'csv', fileName: 'CSV', hash: 'b'.repeat(64) });
  const p = previewImport(csv, lines)[0];
  assert.equal(p.status, 'possible_match');
  const match = p.candidates.find(c => c.kind === 'expenses')!;
  const next = prepareImport(csv, lines, { 1: { ...review, action: 'match', recordKind: 'expenses', recordId: match.id } }, { source: 'manio', fileName: 'Manio', hash: 'c'.repeat(64) });
  assert.equal(next.expenses.length, 1);
  assert.equal(next.expenses[0].category, 'saúde');
  assert.deepEqual(financial(next), financial(csv));
  assert.equal(parseBackup(backup(validateData(next))).imports.links.at(-1)?.transaction.source, 'manio');
});
void test('Manio rejeita mistura de contas numa aba e linha inválida intermediária sem coleção parcial', async () => {
  await assert.rejects(normalizeManioRows([['data', 'descricao', 'valor', 'conta'], ['10/09/2026', 'Teste', '10', 'Corrente'], ['10/09/2026', 'Teste2', '20', 'Cartão']], config));
  const f = fakeStore();
  const invalid = [table[0], table[1], ['31/02/2026', 'Linha inválida', '-10', 'invalid', '', '']];
  await assert.rejects(syncManioConnection(f.store, connectionId, async () => invalid), ManioError);
  assert.equal(f.rows.size, 0); assert.equal(f.lastSync(), null);
});
void test('Manio exige configuração server-side; não aceita credencial incompleta', () => {
  assert.throws(() => readGoogleSheetsConfiguration(() => undefined), ManioError);
  const env = { GOOGLE_SHEETS_CLIENT_EMAIL: 'reader@project.iam.gserviceaccount.com', GOOGLE_SHEETS_PRIVATE_KEY: 'invalid' };
  assert.throws(() => readGoogleSheetsConfiguration((key) => env[key as keyof typeof env]), ManioError);
});
void test('Google Sheets autenticação inválida é segura e não consulta a planilha', async () => {
  let calls = 0;
  const reader = createGoogleSheetsReader({ clientEmail: 'reader@project.iam.gserviceaccount.com', privateKey: 'invalid' }, async () => { calls++; return Response.json({}); });
  await assert.rejects(reader.read('sheet_identifier_12345', 'Conta', true), ManioError);
  assert.equal(calls, 0);
});

async function googleFixture() {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
  return { keys, config: { clientEmail: 'reader@project.iam.gserviceaccount.com', privateKey: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----` } };
}
const requestUrl = (input: Parameters<typeof fetch>[0]) => input instanceof Request ? input.url : input instanceof URL ? input.href : input;
void test('Google JWT RS256 oficial, scope leitura, cache, renovação e sample sem segredos', async () => {
  const fixture = await googleFixture();
  let time = Date.now(), authCalls = 0;
  const ranges: string[] = [];
  const reader = createGoogleSheetsReader(fixture.config, async (input, init) => {
    const url = new URL(requestUrl(input));
    if (url.hostname === 'oauth2.googleapis.com') {
      authCalls++;
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body instanceof URLSearchParams, true);
      const body = init!.body as URLSearchParams;
      assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const assertion = body.get('assertion')!.split('.');
      const claims = JSON.parse(atob(assertion[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
      assert.equal(claims.iss, fixture.config.clientEmail);
      assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
      assert.equal(claims.scope, 'https://www.googleapis.com/auth/spreadsheets.readonly');
      assert.equal(Number(claims.exp) - Number(claims.iat), 3600);
      assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', fixture.keys.publicKey, Uint8Array.from(atob(assertion[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)), new TextEncoder().encode(assertion[0] + '.' + assertion[1])), true);
      return Response.json({ access_token: 'synthetic-test-token', token_type: 'Bearer', expires_in: 3600 });
    }
    assert.equal(url.hostname, 'sheets.googleapis.com');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic-test-token');
    assert.equal(url.searchParams.get('valueRenderOption'), 'FORMATTED_VALUE');
    ranges.push(decodeURIComponent(url.pathname.split('/values/')[1]));
    return Response.json({ values: table });
  }, () => time);
  assert.deepEqual(await reader.read('sheet_identifier_12345', "C6 d'água", true), table);
  await reader.read('sheet_identifier_12345', 'C6 Conta');
  assert.equal(authCalls, 1);
  assert.deepEqual(ranges, ["'C6 d''água'!A1:BL6", "'C6 Conta'"]);
  time += 3600 * 1000;
  await reader.read('sheet_identifier_12345', 'C6 Conta');
  assert.equal(authCalls, 2);
});
void test('Google erros de permissão, aba, HTTP/JSON e vazio fail-closed', async () => {
  const fixture = await googleFixture();
  for (const [response, code] of [[new Response('credential failure', { status: 403 }), 'ACCESS'], [new Response('sheet failure', { status: 400 }), 'SHEET'], [new Response('bank data', { status: 500 }), 'UNAVAILABLE'], [new Response('invalid json'), 'UNAVAILABLE']] as const) {
    const reader = createGoogleSheetsReader(fixture.config, async input => requestUrl(input).includes('oauth2') ? Response.json({ access_token: 'fixture', token_type: 'Bearer', expires_in: 3600 }) : response);
    await assert.rejects(reader.read('sheet_identifier_12345', 'Conta'), (error: unknown) => error instanceof ManioError && error.code === code && !error.message.includes('bank data'));
  }
  const reader = createGoogleSheetsReader(fixture.config, async input => requestUrl(input).includes('oauth2') ? Response.json({ access_token: 'fixture', token_type: 'Bearer', expires_in: 3600 }) : Response.json({}));
  assert.deepEqual(await reader.read('sheet_identifier_12345', 'Conta'), []);
  await assert.rejects(normalizeManioRows([], config));
  assert.deepEqual(await normalizeManioRows([table[0]], config), []);
});
const connectionId = '11111111-1111-4111-8111-111111111111';
function fakeStore() {
  const connection: ManioConnection = { ...config, id: connectionId, spreadsheet_id: 'sheet_identifier_12345', sheet_name: 'Conta', status: 'connected', user_id: 'owner', enabled: true };
  let lease: string | null = null, syncedAt: string | null = null;
  const rows = new Map<string, ManioSourceRow>();
  const store: ManioStore = {
    userId: 'owner', authorizedSheet: async () => true,
    connection: async id => id === connection.id ? connection : null,
    begin: async (_id, token) => { if (lease) return false; lease = token; return true; },
    complete: async (_id, token, collected) => {
      assert.equal(token, lease);
      let newTransactions = 0, updatedTransactions = 0, existingTransactions = 0;
      for (const row of collected) {
        const old = rows.get(row.source_key);
        if (!old) newTransactions++; else if (JSON.stringify(old) === JSON.stringify(row)) existingTransactions++; else updatedTransactions++;
        rows.set(row.source_key, row);
      }
      lease = null; syncedAt = new Date().toISOString();
      return { newTransactions, updatedTransactions, existingTransactions, syncedAt };
    },
    fail: async (_id, token) => { if (lease === token) lease = null; },
  };
  return { store, connection, rows, lastSync: () => syncedAt };
}
void test('sync duas vezes: 0 novas; origem atualiza staging, nunca apaga ausentes', async () => {
  const f = fakeStore();
  assert.equal((await syncManioConnection(f.store, connectionId, async () => table)).newTransactions, 1);
  const repeat = await syncManioConnection(f.store, connectionId, async () => table);
  assert.equal(repeat.newTransactions, 0); assert.equal(repeat.existingTransactions, 1);
  const changed = [table[0], [...table[1]]]; changed[1][2] = '-200,50';
  assert.equal((await syncManioConnection(f.store, connectionId, async () => changed)).updatedTransactions, 1);
  await syncManioConnection(f.store, connectionId, async () => [table[0]]);
  assert.equal(f.rows.size, 1);
});
void test('ownership, desconectada/desabilitada e folha não autorizada bloqueiam antes do Google', async () => {
  for (const scenario of ['missing', 'other', 'disconnected', 'disabled', 'unauthorized']) {
    const f = fakeStore(); let read = false;
    if (scenario === 'other') f.connection.user_id = 'other';
    if (scenario === 'disconnected') f.connection.status = 'disconnected';
    if (scenario === 'disabled') f.connection.enabled = false;
    if (scenario === 'unauthorized') f.store.authorizedSheet = async () => false;
    await assert.rejects(syncManioConnection(f.store, scenario === 'missing' ? 'missing' : connectionId, async () => { read = true; return table; }), ManioError);
    assert.equal(read, false); assert.equal(f.lastSync(), null);
  }
});
void test('lease impede sync concorrente; erro não publica nem atualiza last_sync_at', async () => {
  const f = fakeStore(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = syncManioConnection(f.store, connectionId, async () => { await gate; throw new ManioError('SHEET'); });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(syncManioConnection(f.store, connectionId, async () => table), (e: unknown) => e instanceof ManioError && e.code === 'BUSY');
  release(); await assert.rejects(first, ManioError);
  assert.equal(f.lastSync(), null); assert.equal(f.rows.size, 0);
  assert.equal((await syncManioConnection(f.store, connectionId, async () => table)).newTransactions, 1);
});
void test('abas/contas isoladas podem compartilhar ID de origem sem misturar movimentos', async () => {
  const a = fakeStore(), b = fakeStore(); b.connection.account_reference = 'C6 Cartão'; b.connection.sheet_name = 'Cartão';
  await syncManioConnection(a.store, connectionId, async () => table);
  await syncManioConnection(b.store, connectionId, async () => table);
  assert.equal(a.rows.size, 1); assert.equal(b.rows.size, 1);
  const first = manioImportLines([...a.rows.values()], a.connection)[0].transaction!;
  const second = manioImportLines([...b.rows.values()], { ...b.connection, id: 'other-account' })[0].transaction!;
  const d = defaults();
  const next = prepareImport(d, [{ line: 1, errors: [], transaction: first }], { 1: { action: 'create', category: 'outras', recordKind: '', recordId: '', override: false, remember: false } }, { source: 'manio', fileName: 'Manio', hash: 'a'.repeat(64) });
  assert.equal(previewImport(next, [{ line: 1, errors: [], transaction: second }])[0].duplicate, null);
});
void test('handlers autenticam, validam método/body e retornam somente diagnóstico sem linhas', async () => {
  const f = fakeStore(), logs: unknown[] = [];
  const deps: ManioDependencies = { authenticate: async req => { if (req.headers.get('Authorization') !== 'Bearer fixture') throw new ManioError('UNAVAILABLE', 401); return f.store; }, configuration: () => ({ clientEmail: 'reader@project.iam.gserviceaccount.com', privateKey: 'PRIVATE_KEY_NOT_RETURNED' }), read: async () => table, allowedOrigins: ['https://app.example'], log: entry => logs.push(entry) };
  const request = (body: unknown, headers: Record<string, string> = {}) => new Request('https://edge.example', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture', ...headers }, body: JSON.stringify(body) });
  const good = await handleManioRequest(request({ spreadsheetId: 'sheet_identifier_12345', sheetName: 'Conta' }), 'test', deps);
  const result = await good.json() as Record<string, unknown>;
  assert.equal(result.success, true); assert.equal(result.sampleRowsCount, 1);
  assert.equal('sampleRows' in result, false); assert.equal(JSON.stringify(result).includes('Mercado'), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE_KEY'), false);
  assert.equal((await handleManioRequest(request({ spreadsheetId: 'sheet_identifier_12345', sheetName: 'Conta' }, { Authorization: '' }), 'test', deps)).status, 401);
  assert.equal((await handleManioRequest(new Request('https://edge.example'), 'test', deps)).status, 405);
  assert.equal((await handleManioRequest(request({}, { 'Content-Type': 'text/plain' }), 'test', deps)).status, 415);
  assert.equal((await handleManioRequest(request({ userId: 'other', connection_id: connectionId }), 'sync', deps)).status, 400);
  assert.equal((await handleManioRequest(request({ connection_id: connectionId }, { Origin: 'https://attacker.example' }), 'sync', deps)).status, 403);
  assert.equal((await handleManioRequest(request({ x: 'x'.repeat(5000) }), 'test', deps)).status, 400);
  for (const log of logs) assert.deepEqual(Object.keys(log as object).sort(), ['correlationId', 'count', 'operation', 'status']);
  assert.equal(JSON.stringify(logs).includes('Mercado'), false);
});
