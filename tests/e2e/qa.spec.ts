import { test, expect } from '@playwright/test';

const pages = ['Dashboard', 'Trabalho', 'Gastos', 'Dívidas', 'Investimentos', 'Planos', 'Moto', 'Manutenção', 'Análises', 'Configurações'];

let runtimeErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  runtimeErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (url.startsWith('http://127.0.0.1:4173')) runtimeErrors.push(`requestfailed: ${url}`);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && url.startsWith('http://127.0.0.1:4173')) runtimeErrors.push(`HTTP ${response.status()}: ${url}`);
  });
});
test.afterEach(() => { expect(runtimeErrors, 'erros de console/rede internos').toEqual([]); });

test('todas as páginas carregam sem overflow horizontal no tema claro e escuro', async ({ page }, testInfo) => {
  await page.goto('/');
  for (const theme of ['claro', 'escuro']) {
    if (theme === 'escuro') await page.getByRole('button', { name: 'Alternar tema' }).click();
    for (const name of pages) {
      await page.getByRole('button', { name, exact: true }).first().click();
      await expect(page.locator('main')).toBeVisible();
      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
      expect(overflow.scroll, `${name} ${theme} overflow`).toBeLessThanOrEqual(overflow.width);
    }
  }
  if (['390', '1366'].includes(testInfo.project.name)) {
    await page.screenshot({ path: `.qa-artifacts/${testInfo.project.name}-light-dark.png`, fullPage: true });
  }
});

test('fluxo Trabalho alterna Uber, Cartões, Outro e volta a Uber', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trabalho', exact: true }).first().click();
  await page.getByRole('button', { name: /Registrar trabalho/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const uber = dialog.getByRole('radio', { name: /Uber/ });
  const cards = dialog.getByRole('radio', { name: /Entrega de cartões/ });
  const other = dialog.getByRole('radio', { name: 'Outro' });
  await uber.check();
  await expect(uber).toBeChecked();
  await expect(dialog.getByLabel('Quantidade de cartões')).toHaveCount(0);
  await cards.check();
  await expect(cards).toBeChecked();
  await expect(dialog.getByLabel('Quantidade de cartões')).toBeVisible();
  await other.check();
  await expect(other).toBeChecked();
  await dialog.getByLabel('Nome da atividade *').fill('Corrida particular');
  await uber.check();
  await expect(uber).toBeChecked();
  await expect(dialog.getByLabel('Quantidade de cartões')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('investimentos exibem formulários condicionais e autocomplete manual tolerante', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Investimentos', exact: true }).first().click();
  await page.getByRole('button', { name: /Adicionar registro/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tipo de investimento *').click();
  await page.getByRole('option', { name: 'Ação' }).click();
  await expect(dialog.getByLabel('Buscar ativo')).toBeVisible();
  await dialog.getByLabel('Buscar ativo').fill('PETR4');
  await expect(dialog.getByLabel('Buscar ativo')).toHaveValue('PETR4');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
});

test('manifest e service worker estão disponíveis no preview', async ({ page }) => {
  await page.goto('/');
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  const worker = await page.request.get('/sw.js');
  expect(worker.ok()).toBeTruthy();
});
