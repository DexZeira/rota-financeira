import { test, expect } from '@playwright/test';
import { defaults, emptyRow } from '../../src/model';
import { navigate } from './navigation';

test.beforeEach(async ({ page }) => {
  await page.route('https://api.bcb.gov.br/**', (route) => route.fulfill({ json: [{ data: '01/08/2026', valor: route.request().url().includes('.12/') ? '0.05' : '5' }] }));
  await page.route('https://olinda.bcb.gov.br/**', (route) => route.fulfill({ json: { value: [
    { Indicador: 'IPCA', Mediana: 5, Data: '2026-09-11', DataReferencia: String(new Date().getFullYear()), baseCalculo: 0 },
    { Indicador: 'Selic', Mediana: 12, Data: '2026-09-11', DataReferencia: String(new Date().getFullYear()), baseCalculo: 0 },
  ] } }));
  const d = defaults();
  d.investments = [{ ...emptyRow('investments'), id: 'fixed', name: 'CDB inteligência', category: 'CDB', rateType: 'Prefixado', yield: 10, balance: 10000, annualFeePercent: 0, date: '2025-01-01' }];
  d.plans = [{ ...emptyRow('plans'), id: 'plan', name: 'Objetivo inteligência', target: 40000, deadline: '2030-01-01' }];
  await page.addInitScript((d) => { if (!localStorage.getItem('rota-financeira-v1')) localStorage.setItem('rota-financeira-v1', JSON.stringify(d)); }, d);
});

test('poder de compra exige custos explícitos e preserva viewport', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/'); await navigate(page, 'Investimentos');
  await page.getByText('Simuladores · poder de compra, cenários e dívida', { exact: true }).click();
  await page.getByLabel('Inflação anual da hipótese (%)', { exact: true }).fill('5');
  await page.getByLabel('Retorno nominal esperado (% a.a.)', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Calcular hipóteses', exact: true }).click();
  const results = page.getByRole('region', { name: 'Resultados da simulação' });
  await expect(results.getByText('9,2%', { exact: true })).toBeVisible();
  await expect(results.getByText('Indisponível', { exact: true }).first()).toBeVisible();
  await page.getByText('Impostos e custos totais do cenário', { exact: true }).click();
  await page.getByLabel('Custos e taxas totais (R$)', { exact: true }).fill('0');
  await page.getByLabel('IR total da hipótese Base (R$)', { exact: true }).fill('0');
  await page.getByLabel('IOF total (R$)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Calcular hipóteses', exact: true }).click();
  await expect(results.getByText('Indisponível', { exact: true })).toHaveCount(0);
  const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
  expect(errors).toEqual([]);
});

test('correção do plano persiste sem sobrescrever o valor-base', async ({ page }) => {
  await page.goto('/'); await navigate(page, 'Planos');
  await page.getByText('Inflação e poder de compra do objetivo', { exact: true }).click();
  await page.getByRole('button', { name: 'Configurar correção da meta', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Corrigir meta pela inflação' }).click();
  await page.getByRole('option', { name: 'Taxa personalizada', exact: true }).click();
  await dialog.getByLabel('Data-base do valor objetivo', { exact: true }).fill('2025-01-01');
  await dialog.getByLabel('Inflação personalizada (% a.a.)', { exact: true }).fill('5');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rota-financeira-v1')!));
  expect(stored.plans[0].target).toBe(4000000);
  expect(stored.plans[0].inflationRate).toBe(5);
  expect(stored.intelligenceVersion).toBe(1);
  await page.reload(); await navigate(page, 'Planos');
  await page.getByText('Inflação e poder de compra do objetivo', { exact: true }).click();
  await expect(page.getByText('Taxa personalizada', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
