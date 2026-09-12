import test from 'node:test';
import assert from 'node:assert/strict';
import { decode, syncError } from '../src/services/cloud-codec';
import { defaults } from '../src/model';

void test('snapshot v3 compatível migra para v4 preservando revisão CAS literal', () => {
  const data = { ...defaults(), dataVersion: 3 };
  const revision = '2026-09-12T10:00:00.123456+00:00';
  const result = decode({ data: { version: 3, data }, schema_version: 3,
    updated_at: revision, device_id: 'A' });
  assert.equal(result.data.dataVersion, 4);
  assert.equal(result.updated_at, revision);
});
void test('schema divergente é rejeitado antes de aplicar dados', () => {
  assert.throws(() => decode({ data: { version: 4, data: defaults() },
    schema_version: 3, updated_at: 'revision', device_id: 'A' }), /incompatível/);
});
void test('diagnóstico mantém erro real e oculta chaves em detalhes', () => {
  const error = syncError({ code: '42501', message: 'permission denied',
    details: 'sb_secret_test', hint: 'check grants', status: 403 });
  assert.deepEqual(error.diagnostic(), { code: '42501', message: 'permission denied',
    details: '[oculto]', hint: 'check grants', status: 403 });
});
void test('status HTTP separado do PostgREST é preservado', () => {
  const error = syncError({ code: 'PGRST301', message: 'JWT expired', details: '', hint: '' }, 401);
  assert.equal(error.status, 401);
  assert.equal(error.code, 'PGRST301');
});
