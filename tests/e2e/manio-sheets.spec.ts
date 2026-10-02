import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { defaults } from '../../src/model';
import { backup } from '../../src/services/storage';
import { navigate, selectSettingsSection } from './navigation';

async function fixture(context: BrowserContext) {
  const id = '11111111-1111-4111-8111-111111111111';
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'fixture@test.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`;
  let state = { data: JSON.parse(backup(defaults())), schema_version: 6, updated_at: '2026-10-01T12:00:01.000001+00:00', device_id: 'fixture' };
  let revision = 1;
  const connections: Record<string, unknown>[] = [];
  const control = { failTest: false, syncs: 0, amount: 2050, requests: [] as string[] };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.hostname !== 'rota-test.supabase.co') return json({}, 503);
    const path = url.pathname;
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/auth/v1/token') return json({ access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user });
    if (path === '/auth/v1/user') return json(user);
    if (path === '/rest/v1/user_app_state') return json(state);
    if (path === '/rest/v1/rpc/save_app_state') {
      const body = route.request().postDataJSON();
      if (body.p_expected_updated_at !== state.updated_at) return json([]);
      revision++; state = { ...state, data: body.p_data, updated_at: `2026-10-01T12:00:${String(revision).padStart(2, '0')}.000001+00:00`, device_id: body.p_device_id };
      return json([state]);
    }
    if (path === '/functions/v1/manio-sheets-test') {
      control.requests.push('test');
      const body = route.request().postDataJSON();
      if (body.operation === 'metadata') return json({ serviceAccountEmail: 'reader@fixture.iam.gserviceaccount.com' });
      if (control.failTest) return json({ code: 'ACCESS', error: 'generic fixture error' }, 403);
      return json({ success: true, sheetName: body.sheetName, columnsDetected: { date: 'Data', description: 'Descrição', amount: 'Valor' }, sampleRowsCount: 1 });
    }
    if (path === '/rest/v1/manio_google_sheets_connections') {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        for (const row of body as Record<string, unknown>[]) {
          const position = connections.findIndex(c => c.id === row.id);
          const value = { ...row, last_sync_at: null, last_sync_status: null, last_sync_error: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' };
          if (position < 0) connections.push(value); else connections[position] = value;
        }
        return json([]);
      }
      if (route.request().method() === 'PATCH') {
        const target = connections.find(c => 'eq.' + c.id === url.searchParams.get('id'))!;
        Object.assign(target, route.request().postDataJSON()); return json([{ id: target.id }]);
      }
      return json(connections);
    }
    if (path === '/functions/v1/manio-sheets-sync') {
      control.requests.push('sync'); control.syncs++;
      const body = route.request().postDataJSON();
      const c = connections.find(c => c.id === body.connection_id)!;
      c.last_sync_at = '2026-10-01T12:00:00Z';
      return json({ success: true, connection_id: c.id, summary: { newTransactions: control.syncs === 1 ? 1 : 0, updatedTransactions: control.syncs === 3 ? 1 : 0, existingTransactions: control.syncs === 2 ? 1 : 0, syncedAt: c.last_sync_at } });
    }
    if (path === '/rest/v1/manio_google_sheets_transactions') {
      return json(control.syncs ? [{ id: 'tx-fixture', connection_id: connections[0].id, source_key: 'id:fixture-1', external_id: 'fixture-1', date: '2026-09-10', description: 'Mercado Manio fictício', amount_cents: control.amount, type: 'expense', source_category: 'alimentação', source_account: 'C6' }] : []);
    }
    return json({}, 404);
  });
  return control;
}
async function loginAndConfigure(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Abrir menu de/ }).click();
  await page.getByRole('menuitem', { name: 'Entrar ou criar conta', exact: true }).click();
  const login = page.getByRole('dialog');
  await login.getByLabel('Email (obrigatório)', { exact: true }).fill('fixture@test.invalid');
  await login.getByLabel('Senha (obrigatória)', { exact: true }).fill('fixture-password');
  await login.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('.account-status')).toHaveAttribute('title', 'Sincronizado');
  await navigate(page, 'Configurações');
  await selectSettingsSection(page, 'Integrações');
  await page.getByRole('button', { name: 'Configurar Manio', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('reader@fixture.iam.gserviceaccount.com');
  await dialog.getByLabel('ID da planilha (obrigatório)').fill('sheet_identifier_12345');
  await dialog.getByLabel('Nome da aba (obrigatório)').fill('C6 Conta');
  await dialog.getByLabel('Conta destino (obrigatório)').fill('C6 Conta Corrente');
  return dialog;
}
test('Manio: configurar, testar, conectar, sincronizar, revisar, repetir e desconectar preserva histórico', async ({ page, context }) => {
  const control = await fixture(context);
  const dialog = await loginAndConfigure(page);
  await expect(dialog.getByRole('button', { name: 'Conectar', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Testar conexão', exact: true }).click();
  await expect(dialog).toContainText('1 linhas de amostra');
  await dialog.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Sincronizar agora · C6 Conta Corrente', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Movimentos Manio' })).toContainText('Mercado Manio fictício');
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-financeira-v1')!));
  expect(state.expenses).toHaveLength(0);
  await page.locator('summary').filter({ hasText: 'Revisar movimento' }).click();
  await page.getByLabel('Categoria para Mercado Manio fictício').selectOption('saúde');
  await page.getByRole('button', { name: 'Importar lançamento', exact: true }).click();
  await expect(page.getByText('Já revisada/importada. Não será contabilizada novamente.')).toBeVisible();
  await page.getByRole('button', { name: 'Sincronizar agora · C6 Conta Corrente', exact: true }).click();
  await expect(page.getByText(/Leitura concluída: 0 novas, 0 atualizadas, 1 já existentes/)).toBeVisible();
  control.amount = 3050;
  await page.getByRole('button', { name: 'Sincronizar agora · C6 Conta Corrente', exact: true }).click();
  await expect(page.getByText(/Origem alterada/)).toBeVisible();
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-financeira-v1')!));
  expect(state.expenses).toHaveLength(1); expect(state.expenses[0].amount).toBe(2050); expect(state.expenses[0].category).toBe('saúde');
  expect(state.imports.links[0].transaction.source).toBe('manio');
  await page.getByRole('button', { name: 'Desconectar · C6 Conta Corrente', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar desconexão', exact: true }).click();
  await expect(page.getByText('Leitura desativada. Histórico preservado.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sincronizar agora · C6 Conta Corrente', exact: true })).toHaveCount(0);
  expect(control.requests.filter(r => r === 'sync')).toHaveLength(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => JSON.stringify(localStorage).includes('PRIVATE KEY'))).toBe(false);
});
test('Manio: falha de acesso impede conexão e alteração de mapeamento exige novo teste', async ({ page, context }) => {
  const control = await fixture(context); control.failTest = true;
  const dialog = await loginAndConfigure(page);
  await dialog.getByRole('button', { name: 'Testar conexão', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Confira o vínculo');
  await expect(dialog.getByRole('button', { name: 'Conectar', exact: true })).toBeDisabled();
  control.failTest = false;
  await dialog.getByRole('button', { name: 'Testar conexão', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Conectar', exact: true })).toBeEnabled();
  await dialog.getByLabel('Conta destino (obrigatório)').fill('Outra conta');
  await expect(dialog.getByRole('button', { name: 'Conectar', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Configurar Manio', exact: true })).toBeFocused();
});
test('Manio: múltiplas abas e conta corrente/cartão permanecem separadas', async ({ page, context }) => {
  await fixture(context);
  const dialog = await loginAndConfigure(page);
  await dialog.getByRole('button', { name: 'Adicionar aba', exact: true }).click();
  const second = dialog.getByRole('group', { name: 'Aba 2', exact: true });
  await second.getByLabel('Nome da aba (obrigatório)').fill('C6 Cartão');
  await second.getByLabel('Conta destino (obrigatório)').fill('C6 Crédito');
  await second.getByLabel('Tipo de conta').selectOption('card');
  await dialog.getByRole('button', { name: 'Testar conexão', exact: true }).click();
  await expect(dialog).toContainText('C6 Cartão: 1 linhas de amostra');
  await dialog.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.manio-connection')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Sincronizar agora · C6 Conta Corrente', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sincronizar agora · C6 Crédito', exact: true })).toBeVisible();
  await expect(page.locator('.manio-connection').filter({ hasText: 'C6 Crédito' })).toContainText('Cartão');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
