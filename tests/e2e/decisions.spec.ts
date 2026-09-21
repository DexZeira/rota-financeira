import { test, expect } from '@playwright/test';
import { defaults } from '../../src/model';
import { navigate } from './navigation';

test('compra, entrada, comparação, cópia e offline não alteram o estado real', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const data = defaults();
  data.settings.openingCash = 30000;
  await page.addInitScript((d) => {
    if (!localStorage.getItem('rota-financeira-v1'))
      localStorage.setItem('rota-financeira-v1', JSON.stringify(d));
  }, data);
  await page.route(/api\.bcb\.gov\.br|olinda\.bcb\.gov\.br/, (r) =>
    r.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/');
  await navigate(page, 'Simulações');
  const before = await page.evaluate(() =>
    localStorage.getItem('rota-financeira-v1'),
  );
  await page.getByLabel('Preço do bem (R$)', { exact: true }).fill('20000');
  await page
    .getByLabel('Custos imediatos de aquisição (R$)', { exact: true })
    .fill('0');
  await page
    .getByLabel('Forma de pagamento', { exact: true })
    .selectOption('finance');
  await page.getByLabel('Entrada (R$)', { exact: true }).fill('10000');
  await page.getByLabel('Juros mensais (%)', { exact: true }).fill('1');
  const cash = page
    .getByRole('table', { name: 'Antes e depois' })
    .getByRole('row')
    .filter({
      has: page.getByRole('rowheader', { name: 'Caixa', exact: true }),
    });
  await expect(cash).toContainText('20.000,00');
  await page.getByLabel('Entrada (R$)', { exact: true }).fill('15000');
  await expect(cash).toContainText('15.000,00');
  await page
    .getByText('3. Hipóteses de retorno e inflação', { exact: true })
    .click();
  await page
    .getByLabel('Retorno esperado bruto (% a.a.)', { exact: true })
    .fill('10');
  await page
    .getByLabel('Inflação / correção do preço (% a.a.; 0 = sem correção)', {
      exact: true,
    })
    .fill('5');
  await page.getByText('Comprar agora × esperar', { exact: true }).click();
  await page
    .getByLabel('Aporte mensal separado para compra (R$)', { exact: true })
    .fill('100');
  await expect(
    page.getByRole('region', { name: 'Esperar', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('main')).toContainText('21.000,00');
  await page
    .getByRole('button', { name: 'Duplicar cenário na sessão', exact: true })
    .click();
  await page.getByText('Cópias da sessão (1)', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Abrir cópia 1', exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel('Entrada (R$)', { exact: true }).fill('12000');
  await expect(cash).toContainText('18.000,00');
  expect(
    await page.evaluate(() => localStorage.getItem('rota-financeira-v1')),
  ).toBe(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(false);
  await page.reload();
  await navigate(page, 'Simulações');
  await expect(
    page.getByLabel('Preço do bem (R$)', { exact: true }),
  ).toHaveValue('');
  expect(
    await page.evaluate(() => localStorage.getItem('rota-financeira-v1')),
  ).toBe(before);
  expect(errors).toEqual([]);
});
