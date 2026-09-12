import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSupabaseConfig,
  CONFIG_ERROR,
} from '../src/services/supabase-config';
import {
  authErrorDetails,
  authMessage,
  SIGNUP_CONFIRMATION,
} from '../src/services/auth-errors';

// Synthetic values are confined to tests, never used by the application client.
const url = 'https://abcdefghijklmnopqrst.supabase.co';
const key = 'sb_publishable_abcdefghijklmnopqrstuvwxyz';
void test('configuração ausente bloqueia autenticação com nomes das variáveis', () => {
  assert.equal(validateSupabaseConfig().valid, false);
  assert.equal(validateSupabaseConfig().message, CONFIG_ERROR);
  assert.equal(validateSupabaseConfig(url, '').valid, false);
});
void test('placeholders publicados e URL arbitrária são rejeitados', () => {
  for (const bad of [
    'https://SEU_ID_REAL.supabase.co',
    'https://seu-projeto.supabase.co',
    'https://example.com',
    'http://abcdefghijklmnopqrst.supabase.co',
    'https://abcdefghijklmnopqrst.supabase.co.attacker.com',
  ]) {
    assert.match(
      validateSupabaseConfig(bad, key).message,
      /URL do Supabase inválida/,
    );
  }
});
void test('prefixo sem chave, placeholder e chave administrativa não inicializam cliente', () => {
  for (const bad of [
    'sb_publishable_',
    'SUA_CHAVE',
    'sb_secret_abcdefghijklmnopqrst',
  ])
    assert.equal(validateSupabaseConfig(url, bad).valid, false);
  const jwt = `eyJheader.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`;
  assert.equal(validateSupabaseConfig(url, jwt).valid, false);
  assert.equal(validateSupabaseConfig(url, key).valid, true);
  assert.equal(
    validateSupabaseConfig(url, key).diagnostics.keyType,
    'publishable',
  );
});
void test('status, code e mensagem real são preservados; segredos explícitos são ocultados', () => {
  assert.deepEqual(
    authErrorDetails({
      status: 400,
      code: 'signup_disabled',
      message: 'Signups not allowed for this instance',
    }),
    {
      status: 400,
      code: 'signup_disabled',
      message: 'Signups not allowed for this instance',
    },
  );
  assert.equal(
    authMessage({ message: 'Unexpected provider error' }),
    'Unexpected provider error',
  );
  assert.equal(
    authErrorDetails({ message: 'Rejected abc-password' }, ['abc-password'])
      .message,
    'Rejected [oculto]',
  );
});
void test('chave inválida, email inválido, senha fraca e login incorreto têm mensagens específicas', () => {
  assert.match(
    authMessage({ message: 'Invalid API key', status: 401 }),
    /chave pública/,
  );
  assert.equal(
    authMessage({ code: 'email_address_invalid' }),
    'Digite um email válido.',
  );
  assert.match(authMessage({ code: 'weak_password' }), /Senha/);
  assert.equal(
    authMessage({ code: 'invalid_credentials' }),
    'Email ou senha incorretos.',
  );
  assert.match(authMessage({ code: 'signup_disabled' }), /desativado/);
});
void test('cadastro aceito sem sessão possui mensagem de confirmação separada de erro', () => {
  assert.equal(
    SIGNUP_CONFIRMATION,
    'Conta criada. Enviamos um link de confirmação para seu email.',
  );
});
