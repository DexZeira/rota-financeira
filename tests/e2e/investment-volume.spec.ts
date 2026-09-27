import { test, expect } from '@playwright/test';
import { defaults, emptyRow, today } from '../../src/model';
import { navigate } from './navigation';

test('carteira grande carrega por lote e compartilha cotação por símbolo', async ({
  page,
}) => {
  const d = defaults();
  d.investments = Array.from({ length: 65 }, (_, i) => ({
    ...emptyRow('investments'),
    id: `asset-${i}`,
    name: `Ativo ${i}`,
    category: 'Ação',
    date: today(),
    balance: 10,
    quantity: 1,
    ticker: `TEST${i % 5}`,
  }));
  await page.addInitScript(
    (data) => localStorage.setItem('rota-financeira-v1', JSON.stringify(data)),
    d,
  );
  await page.route(/api\.bcb\.gov\.br|olinda\.bcb\.gov\.br/, (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  let requests = 0;
  await page.route('https://brapi.dev/api/quote/*', (route) => {
    requests++;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [{ regularMarketPrice: 12 }] }),
    });
  });
  await page.goto('/');
  await navigate(page, 'Investimentos');
  const list = page.locator('.portfolio-group');
  await expect(
    list.getByRole('button', { name: 'Editar Ativo 29', exact: true }),
  ).toHaveCount(1);
  await expect(
    list.getByRole('button', { name: 'Editar Ativo 30', exact: true }),
  ).toHaveCount(0);
  await expect.poll(() => requests).toBe(5);
  await page
    .getByRole('button', { name: 'Mostrar mais investimentos', exact: true })
    .click();
  await expect(
    list.getByRole('button', { name: 'Editar Ativo 59', exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Mostrar mais investimentos', exact: true })
    .click();
  await expect(
    list.getByRole('button', { name: 'Editar Ativo 64', exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', {
      name: 'Mostrar mais investimentos',
      exact: true,
    }),
  ).toHaveCount(0);
  expect(requests).toBe(5);
});
