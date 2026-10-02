import { expect, test } from '@playwright/test';
import { navigate, selectSettingsSection } from './navigation';
import { defaults, emptyRow, today } from '../../src/model';

test('atalhos abrem ações reais sem capturar digitação e busca navega para páginas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toBeVisible();
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Valor (R$) (obrigatório)', exact: true })).toBeFocused();
  const name = page.getByRole('textbox', { name: 'Nome (obrigatório)', exact: true });
  await name.focus();
  await name.press('n');
  await expect(name).toHaveValue('n');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Busca global' });
  await search.fill('Relatórios');
  await expect(page.getByRole('listbox', { name: 'Resultados da busca' }).getByRole('option').filter({ hasText: 'Relatórios' }).first()).toBeVisible();
  await search.press('Enter');
  await expect(page.locator('main h1')).toContainText('Relatórios');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('privacidade esconde valores e persiste a preferência sem alterar dados', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Dashboard');
  const toggle = page.getByRole('button', { name: 'Ocultar valores' });
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Mostrar valores' })).toBeVisible();
  await expect(page.locator('.workspace')).toHaveAttribute('data-private', 'true');
  await expect(page.locator('.dashboard-lead [data-money="true"]').first()).toContainText('••••');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mostrar valores' })).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar valores' }).click();
  await expect(page.locator('.workspace')).toHaveAttribute('data-private', 'false');
});

test('microinterações respeitam a preferência de movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('main h1')).toBeVisible();
  expect(await page.locator('.page-header').evaluate(node => getComputedStyle(node).animationName)).toBe('page-enter');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.page-header').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  expect(await page.locator('.topbar button').first().evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
});

test('pular navegação alcança conteúdo e shell não transborda', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await navigate(page, 'Dashboard');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.locator('.profile-trigger').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  for (const button of await page.locator('.topbar button:visible').all()) {
    await expect(button).toBeInViewport({ ratio: 1 });
    const box = await button.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
});

test('transações unificadas filtram, abrem CRUD existente e mantêm direção textual', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Transações');
  await page.getByRole('button', { name: 'Novo gasto', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Nome (obrigatório)', exact: true }).fill('Mercado da semana');
  await dialog.getByRole('spinbutton', { name: 'Valor (R$) (obrigatório)', exact: true }).fill('125.40');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Buscar transações' }).fill('Mercado da semana');
  await expect(page.getByRole('article').filter({ hasText: 'Mercado da semana' })).toContainText('Saída');
  await page.getByRole('searchbox', { name: 'Buscar transações' }).fill('Não existe aqui');
  await expect(page.getByText('Nenhuma transação neste filtro')).toBeVisible();
  await page.locator('.transaction-summary').getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Mercado da semana' })).toBeVisible();
});

test('Dashboard separa patrimônio de caixa e não inventa histórico sem posições', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Dashboard');
  await expect(page.getByText('Patrimônio líquido', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Ainda não há posições históricas suficientes')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Movimentos recentes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Distribuição dos gastos' })).toBeVisible();
});

test('resumos e lista suportam negativo, texto longo, gráfico real e temas', async ({ page }, testInfo) => {
  const data = defaults();
  const at = today();
  data.settings.openingCash = -1500;
  data.expenses = [{ ...emptyRow('expenses'), id: 'long-expense', date: at, amount: 125.4, name: 'Compra de materiais para manutenção e deslocamento — descrição extensa para conferência', category: 'alimentação' }];
  data.bankReceipts = [{ ...emptyRow('bankReceipts'), id: 'receipt', date: at, amountCents: 10000, name: 'Recebimento revisado', account: 'Conta de teste' }];
  data.netWorthSnapshots = [14, 1].map((days, index) => ({ ...emptyRow('netWorthSnapshots'), id: `position-${index}`, date: new Date(Date.parse(at + 'T12:00:00Z') - days * 86400000).toISOString().slice(0, 10), cashCents: 1000000 + index * 5000, netCents: 1000000 + index * 5000, positions: JSON.stringify({ assets: {}, investments: {}, debts: {} }), partial: 0 }));
  await page.addInitScript(d => { if (!localStorage.getItem('rota-financeira-v1')) localStorage.setItem('rota-financeira-v1', JSON.stringify(d)); }, data);
  await page.route(/api\.bcb\.gov\.br|olinda\.bcb\.gov\.br/, route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/');
  for (const theme of ['claro', 'escuro']) {
    await navigate(page, 'Configurações');
  await selectSettingsSection(page, 'Aparência');
    await page.getByRole('button', { name: theme === 'claro' ? 'Claro' : 'Escuro', exact: true }).click();
    await navigate(page, 'Dashboard');
    await expect(page.getByText('Saldo negativo', { exact: false }).first()).toBeVisible();
    await expect(page.locator('.wealth-line-chart')).toBeVisible();
    await page.getByLabel('Janela do histórico').selectOption('7d');
    await expect(page.getByText('Ainda não há posições históricas suficientes')).toBeVisible();
    await page.getByLabel('Janela do histórico').selectOption('all');
    await expect(page.locator('.wealth-line-chart')).toBeVisible();
    await expect(page.getByText(/Entre as posições exibidas/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    if (['320', '1366'].includes(testInfo.project.name)) await page.screenshot({ path: `.qa-artifacts/premium-dashboard-${testInfo.project.name}-${theme}.png`, fullPage: true });
    await navigate(page, 'Transações');
    await expect(page.getByRole('article').filter({ hasText: 'Compra de materiais' })).toContainText('Saída');
    await page.getByText('Período e ordem', { exact: true }).click();
    await page.getByLabel('Valor mínimo (R$)', { exact: true }).fill('110');
    await expect(page.getByRole('article').filter({ hasText: 'Recebimento revisado' })).toHaveCount(0);
    await expect(page.getByRole('article').filter({ hasText: 'Compra de materiais' })).toBeVisible();
    await page.getByLabel('Valor máximo (R$)', { exact: true }).fill('50');
    await expect(page.getByRole('alert')).toContainText('O mínimo não pode superar o máximo');
    await expect(page.getByLabel('Valor mínimo (R$)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await page.locator('.transaction-summary').getByRole('button', { name: 'Limpar filtros' }).click();
    await page.getByRole('combobox', { name: 'Conta', exact: true }).selectOption('Conta de teste');
    await expect(page.getByRole('article').filter({ hasText: 'Recebimento revisado' })).toBeVisible();
    await expect(page.getByRole('article').filter({ hasText: 'Compra de materiais' })).toHaveCount(0);
    await page.locator('.transaction-summary').getByRole('button', { name: 'Limpar filtros' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    if (['320', '1366'].includes(testInfo.project.name)) await page.screenshot({ path: `.qa-artifacts/premium-transactions-${testInfo.project.name}-${theme}.png`, fullPage: true });
  }
});
