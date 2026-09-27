import { test, expect } from '@playwright/test';
import { defaults, emptyRow, today } from '../../src/model';
import { navigate } from './navigation';

test('posição, provento, calendário e persistência permanecem coerentes', async ({
  page,
}) => {
  const d = defaults(),
    at = today();
  d.settings.openingCash = 1000;
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'asset',
      name: 'Carteira de teste',
      category: 'Ação',
      date: at,
      costsKnown: 'sim',
      couponDate: at,
    },
  ];
  await page.addInitScript((data) => {
    if (!localStorage.getItem('rota-financeira-v1'))
      localStorage.setItem('rota-financeira-v1', JSON.stringify(data));
  }, d);
  await page.route(
    /api\.bcb\.gov\.br|olinda\.bcb\.gov\.br|brapi\.dev|coingecko\.com/,
    (r) => r.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/');
  await navigate(page, 'Investimentos');
  async function trade(operation: string, amount: string, units: string) {
    await page
      .getByRole('button', { name: 'Registrar movimentação', exact: true })
      .click();
    const editor = page.getByRole('dialog');
    await editor
      .getByRole('combobox', { name: 'Investimento', exact: true })
      .click();
    await page
      .getByRole('listbox')
      .getByRole('option', { name: 'Carteira de teste', exact: true })
      .click();
    await editor
      .getByRole('combobox', {
        name: 'Detalhamento da movimentação',
        exact: true,
      })
      .click();
    await page
      .getByRole('listbox')
      .getByRole('option', { name: operation, exact: true })
      .click();
    await editor.locator('input[name="units"]').fill(units);
    await editor.locator('input[name="amount"]').fill(amount);
    await editor.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(editor).toHaveCount(0);
  }
  await trade('compra', '100', '10');
  await trade('compra', '200', '10');
  await page
    .getByText('Posição, preço médio e resultado', { exact: true })
    .click();
  const detail = page
    .locator('details')
    .filter({
      has: page.locator('summary').filter({ hasText: 'Carteira de teste ·' }),
    })
    .last();
  await detail.locator('summary').click();
  await expect(detail).toContainText('R$ 15,00');
  await expect(detail).toContainText('20');
  await trade('venda', '100', '5');
  await expect(detail).toContainText('R$ 15,00');
  await expect(detail).toContainText('R$ 225,00');
  await page
    .getByRole('button', { name: 'Registrar movimentação', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox', { name: 'Investimento', exact: true })
    .click();
  await page
    .getByRole('listbox')
    .getByRole('option', { name: 'Carteira de teste', exact: true })
    .click();
  await dialog
    .getByRole('combobox', {
      name: 'Detalhamento da movimentação',
      exact: true,
    })
    .click();
  await page
    .getByRole('listbox')
    .getByRole('option', { name: 'dividendo', exact: true })
    .click();
  await dialog.locator('input[name="amount"]').fill('10');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByText('Renda passiva recebida', { exact: true }).click();
  await expect(
    page.locator('details').filter({
      has: page
        .locator('summary')
        .getByText('Renda passiva recebida', { exact: true }),
    }),
  ).toContainText('R$ 10,00');
  await page.reload();
  await navigate(page, 'Investimentos');
  await page.getByText('Renda passiva recebida', { exact: true }).click();
  await expect(page.getByText('Este mês', { exact: true })).toBeVisible();
  await page.getByText('Calendário de investimentos', { exact: true }).click();
  await expect(
    page.getByText('Carteira de teste · Cupom', { exact: true }),
  ).toBeVisible();
  await page.getByText('Rentabilidade e benchmark', { exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Configurar benchmark da carteira',
      exact: true,
    })
    .click();
  const settings = page.getByRole('dialog');
  await settings
    .getByRole('combobox', {
      name: 'Benchmark principal da carteira',
      exact: true,
    })
    .click();
  await page
    .getByRole('listbox')
    .getByRole('option', { name: 'Personalizado', exact: true })
    .click();
  await settings.locator('input[name="portfolioBenchmarkRate"]').fill('12');
  await settings.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(
    page
      .locator('details')
      .filter({
        has: page
          .locator('summary')
          .getByText('Rentabilidade e benchmark', { exact: true }),
      }),
  ).toContainText('Projetado');
  const geometry = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
});
