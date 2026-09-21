import { test, expect } from '@playwright/test';
import { defaults, today } from '../../src/model';
import { navigate } from './navigation';

test('patrimônio: bem, avaliações, depreciação, snapshot e recarga offline', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/api\.bcb\.gov\.br|olinda\.bcb\.gov\.br/, (r) =>
    r.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/');
  await navigate(page, 'Patrimônio');
  await page
    .getByRole('button', { name: 'Cadastrar bem', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: false }).fill('Veículo de teste');
  await dialog
    .getByLabel('Data de aquisição', { exact: true })
    .fill('2026-01-01');
  await dialog.getByLabel('Preço de compra', { exact: false }).fill('20000');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  for (const amount of ['20000', '17000']) {
    await page
      .getByRole('button', { name: 'Ações de Veículo de teste', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Avaliar Veículo de teste', exact: true })
      .click();
    await dialog
      .getByLabel('Valor avaliado (R$)', { exact: false })
      .fill(amount);
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await page
    .getByRole('button', { name: 'Ações de Veículo de teste', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Detalhes de Veículo de teste', exact: true })
    .click();
  const details = page.getByRole('region', { name: 'Detalhes patrimoniais' });
  await expect(details).toContainText('3.000,00');
  await page
    .getByText('Evolução e posições patrimoniais', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Registrar posição de hoje', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Registrar posição de hoje',
      exact: true,
    }),
  ).toBeDisabled();
  await page.reload();
  await navigate(page, 'Patrimônio');
  await expect(page.getByRole('main')).toContainText('17.000,00');
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rota-financeira-v1')!),
  );
  expect(stored.assetVersion).toBe(1);
  expect(
    stored.assetValuations.map((r: { valueCents: number }) => r.valueCents),
  ).toEqual([2000000, 1700000]);
  expect(stored.netWorthSnapshots).toHaveLength(1);
  await context.setOffline(true);
  await page
    .getByRole('button', { name: 'Cadastrar bem', exact: true })
    .click();
  await dialog.getByLabel('Nome', { exact: false }).fill('Bem offline');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText('Bem offline');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('moto aparece uma vez e compartilha a avaliação patrimonial', async ({
  page,
}) => {
  const data = defaults();
  data.bike = {
    ...data.bike,
    purchaseDate: '2026-01-01',
    purchaseValue: 20000,
    currentValue: 18000,
    km: 1000,
  };
  await page.addInitScript((d) => {
    if (!localStorage.getItem('rota-financeira-v1'))
      localStorage.setItem('rota-financeira-v1', JSON.stringify(d));
  }, data);
  await page.goto('/');
  await navigate(page, 'Patrimônio');
  const name = `${data.bike.brand} ${data.bike.model}`;
  await expect(
    page.getByRole('button', { name: `Ações de ${name}`, exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole('button', { name: `Ações de ${name}`, exact: true })
    .click();
  await page
    .getByRole('button', { name: `Avaliar ${name}`, exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Data', { exact: false }).fill(today());
  await dialog
    .getByLabel('Valor avaliado (R$)', { exact: false })
    .fill('17200');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rota-financeira-v1')!),
  );
  // Existing monetary fields are serialized by the centavo codec.
  expect(stored.bike.currentValue).toBe(1720000);
  expect(stored.assets).toHaveLength(0);
  await navigate(page, 'Moto');
  await page
    .getByText('Valor patrimonial e custo total de propriedade', {
      exact: true,
    })
    .click();
  await expect(page.getByRole('main')).toContainText('2.800,00');
});
