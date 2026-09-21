import { navigate } from './navigation';
import { test, expect } from '@playwright/test';

const pages = ['Hoje', 'Planejamento', 'Patrimônio', 'Simulações', 'Dashboard', 'Trabalho', 'Gastos', 'Dívidas', 'Investimentos', 'Planos', 'Moto', 'Manutenção', 'Análises', 'Configurações'];

let runtimeErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  runtimeErrors = [];
  // Keep browser QA deterministic: external market providers are covered by
  // dedicated integration tests and must not influence layout/form checks.
  await page.route('https://api.bcb.gov.br/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ data: '13/09/2026', valor: '10,00' }]) });
  });
  await page.route('https://olinda.bcb.gov.br/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: [{ Selic: 10, IPCA: 4, DataReferencia: 2026 }] }) });
  });
  await page.route('https://brapi.dev/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/quote/list')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stocks: [{ stock: 'PETR4', name: 'Petrobras PN' }] }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ regularMarketPrice: 42.5 }] }) });
    }
  });
  await page.route('https://api.coingecko.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/search')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }] }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bitcoin: { brl: 300000 } }) });
    }
  });
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
    await navigate(page, 'Configurações');
    await page.getByRole('combobox', { name: 'Tema', exact: true }).click();
    await page.getByRole('option', { name: theme, exact: true }).click();
    for (const name of pages) {
      await navigate(page, name);
      await expect(page.locator('main')).toBeVisible();
      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
      expect(overflow.scroll, `${name} ${theme} overflow`).toBeLessThanOrEqual(overflow.width);
      const active = page.locator('[data-slot=sidebar-menu-button][data-active]').filter({ hasText: name }).first();
      if (await active.isVisible()) {
        await active.hover();
        await expect.poll(() => active.evaluate((element) => {
          const style = getComputedStyle(element);
          const luminance = (color: string) => {
            const channels = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => {
              const s = v / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
          };
          const a = luminance(style.color), b = luminance(style.backgroundColor);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        }), { message: `${name} ${theme}: contraste do item ativo sob hover` }).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
  if (['390', '1366'].includes(testInfo.project.name)) {
    await page.screenshot({ path: `.qa-artifacts/${testInfo.project.name}-light-dark.png`, fullPage: true });
  }
});

test('fluxo Trabalho alterna Uber, Cartões, Outro e volta a Uber', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Trabalho');
  await page.getByRole('button', { name: /Registrar trabalho/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const uber = dialog.getByRole('radio', { name: /Uber/ });
  const cards = dialog.getByRole('radio', { name: /Cartões/ });
  const other = dialog.getByRole('radio', { name: /Outro/ });
  await uber.locator("..").click();
  await expect(uber).toBeChecked();
  await expect(dialog.getByLabel('Quantidade de cartões')).toHaveCount(0);
  await cards.locator("..").click();
  await expect(cards).toBeChecked();
  await expect(dialog.getByLabel('Quantidade de cartões')).toBeVisible();
  await other.locator("..").click();
  await expect(other).toBeChecked();
  await dialog.getByLabel('Nome da atividade *').fill('Corrida particular');
  await uber.locator("..").click();
  await expect(uber).toBeChecked();
  await expect(dialog.getByLabel('Quantidade de cartões')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('investimentos exibem formulários condicionais e autocomplete manual tolerante', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Investimentos');
  await page.getByRole('button', { name: '+ Novo investimento', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Tipo de investimento' }).click();
  await page.getByRole('option', { name: 'Ação' }).click();
  await expect(dialog.locator('input[role="combobox"]')).toBeVisible();
  await dialog.locator('input[role="combobox"]').fill('PETR4');
  await expect(dialog.locator('input[role="combobox"]')).toHaveValue('PETR4');
  await expect(dialog.locator('#asset-search-results .asset-option').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog.locator('#asset-search-results')).toHaveCount(0);
  await expect(dialog).toBeVisible();
});

test('manifest e service worker estão disponíveis no preview', async ({ page }) => {
  await page.goto('/');
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  const worker = await page.request.get('/sw.js');
  expect(worker.ok()).toBeTruthy();
});
