import { test, expect } from '@playwright/test';
import { defaults, emptyRow, today } from '../../src/model';
import { navigate } from './navigation';

test('fase 2: orçamento, gasto, meta, custo, reserva e recarga', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const d = defaults();
  d.planningSettings = [
    {
      ...emptyRow('planningSettings'),
      id: 'p',
      scheduleEnabled: 'sim',
      workWeekdays: 'seg,ter,qua,qui,sex,sab,dom',
      emergencyMonths: 6,
    },
  ];
  d.categoryPolicies = [
    {
      ...emptyRow('categoryPolicies'),
      id: 'policy',
      category: 'alimentação',
      level: 'essencial',
    },
  ];
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'reserve',
      name: 'Reserva explícita',
      date: today(),
      balance: 1000,
    },
  ];
  await page.addInitScript((data) => {
    if (!localStorage.getItem('rota-financeira-v1'))
      localStorage.setItem('rota-financeira-v1', JSON.stringify(data));
  }, d);
  await page.route(/api\.bcb\.gov\.br|olinda\.bcb\.gov\.br/, (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/');
  const targetBefore = await page
    .getByRole('region', { name: 'Meta dinâmica' })
    .innerText();
  await navigate(page, 'Gastos');
  await page
    .getByText('Quanto posso gastar? · Orçamento do mês', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Criar orçamento', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Categoria', { exact: false }).fill('alimentação');
  await dialog
    .getByLabel('Orçamento mensal (R$)', { exact: true })
    .fill('700.25');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole('button', { name: '+ Registrar gasto', exact: true })
    .click();
  await dialog.getByLabel('Nome', { exact: false }).fill('Compra fase dois');
  await dialog
    .getByRole('combobox', { name: 'Categoria', exact: true })
    .click();
  await page.getByRole('option', { name: 'alimentação', exact: true }).click();
  await dialog.getByLabel('Valor (R$)', { exact: false }).fill('100');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const budget = page.locator('details').filter({
    has: page.getByText('Quanto posso gastar? · Orçamento do mês', {
      exact: true,
    }),
  });
  await expect(budget).toContainText('600,25');
  await navigate(page, 'Hoje');
  await expect(
    page.getByRole('region', { name: 'Meta dinâmica' }),
  ).not.toHaveText(targetBefore);
  await navigate(page, 'Planejamento');
  await page.getByText('Custo de vida e reserva', { exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Minha vida custa', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Marcar investimento como reserva',
      exact: true,
    })
    .click();
  await dialog
    .getByRole('combobox', { name: 'Investimento da reserva', exact: true })
    .click();
  await page
    .getByRole('option', { name: 'Reserva explícita', exact: true })
    .click();
  await dialog
    .getByRole('combobox', { name: 'Disponibilidade', exact: true })
    .click();
  await page.getByRole('option', { name: 'imediata', exact: true }).click();
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText('Reserva explícita', { exact: true }),
  ).toBeVisible();
  await page.getByText('Simular emergência', { exact: true }).click();
  await page.getByLabel('Despesa inesperada (R$)', { exact: true }).fill('300');
  await expect(page.getByText(/Cobertura antes:/)).toContainText(
    'Depois: 7 meses',
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.reload();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rota-financeira-v1')!),
  );
  expect(stored.planningVersion).toBe(3);
  expect(stored.dataVersion).toBe(6);
  expect(stored.budgets[0].limitCents).toBe(70025);
  expect(stored.reserveAllocations[0].liquidity).toBe('imediata');
  expect(stored.expenses[0].amount).toBe(10000);
  expect(stored.planningSettings[0]).not.toHaveProperty('unexpectedCents');
  await navigate(page, 'Gastos');
  await page
    .getByText('Quanto posso gastar? · Orçamento do mês', { exact: true })
    .click();
  await expect(
    page.getByText('600,25', { exact: false }).first(),
  ).toBeVisible();
  await navigate(page, 'Configurações');
  await page.getByRole('combobox', { name: 'Tema', exact: true }).click();
  await page.getByRole('option', { name: 'escuro', exact: true }).click();
  await navigate(page, 'Planejamento');
  await page.getByText('Custo de vida e reserva', { exact: true }).click();
  await page.getByText('Simular emergência', { exact: true }).click();
  await expect(
    page.getByLabel('Despesa inesperada (R$)', { exact: true }),
  ).toHaveValue('');
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
