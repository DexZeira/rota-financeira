import { test, expect } from '@playwright/test';
import { defaults, today } from '../../src/model';
import { addDays } from '../../src/services/recurrences';
import { navigate } from './navigation';

test('Hoje e recorrência: cadastro, calendário, pausa e conferência persistem sem lançar gasto', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const d = defaults();
  d.settings.openingCash = 1000;
  const date = addDays(today(), 1);
  await page.addInitScript((data) => {
    if (!localStorage.getItem('rota-financeira-v1'))
      localStorage.setItem('rota-financeira-v1', JSON.stringify(data));
  }, d);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Hoje', exact: true }),
  ).toBeVisible();
  await navigate(page, 'Planejamento');
  await page
    .getByRole('button', { name: 'Nova recorrência', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: false }).fill('Internet planejada');
  await dialog.getByLabel('Valor previsto', { exact: false }).fill('100');
  await dialog.getByLabel('Data inicial', { exact: false }).fill(date);
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText('Internet planejada', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Calendário', exact: true }).click();
  if (date.slice(0, 7) !== today().slice(0, 7))
    await page
      .getByRole('button', { name: 'Próximo mês', exact: true })
      .click();
  await page
    .getByRole('button', {
      name: new RegExp(date.split('-').reverse().join('/') + ','),
    })
    .click();
  await expect(
    page.getByRole('region', { name: 'Detalhes do dia' }),
  ).toContainText('900,00');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Recorrências', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.reload();
  await navigate(page, 'Planejamento');
  await expect(
    page.getByText('Internet planejada', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Recorrências', exact: true }).click();
  await page.getByRole('button', { name: 'Ativar', exact: true }).click();
  await page.getByRole('button', { name: 'Fluxo', exact: true }).click();
  await page.getByText('Conferir ocorrência', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Ignorar esta ocorrência', exact: true })
    .click();
  await expect(
    page.getByText('Internet planejada', { exact: true }),
  ).toHaveCount(0);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rota-financeira-v1')!),
  );
  expect(stored.recurrences).toHaveLength(1);
  expect(stored.recurrences[0].amount).toBe(10000);
  expect(stored.forecastResolutions).toHaveLength(1);
  expect(stored.expenses).toEqual([]);
  expect(stored.settings.openingCash).toBe(100000);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('Hoje e Planejamento abrem offline após carregar o shell local', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const d = defaults();
  d.settings.openingCash = 1000;
  await page.addInitScript((data) => {
    if (!localStorage.getItem('rota-financeira-v1'))
      localStorage.setItem('rota-financeira-v1', JSON.stringify(data));
  }, d);
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Hoje', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Próximos 7 dias' }),
  ).toBeVisible();
  await navigate(page, 'Planejamento');
  await page.getByRole('button', { name: 'Calendário', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Detalhes do dia' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('aba com editor antigo não sobrescreve snapshot futuro recebido de outra aba', async ({
  page,
  context,
}) => {
  const d = defaults();
  await page.addInitScript((data) => {
    if (!localStorage.getItem('rota-financeira-v1'))
      localStorage.setItem('rota-financeira-v1', JSON.stringify(data));
  }, d);
  await page.goto('/');
  await navigate(page, 'Planejamento');
  await page
    .getByRole('button', { name: 'Nova recorrência', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: false }).fill('Edição antiga');
  const other = await context.newPage();
  await other.goto('/');
  const future = await other.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rota-financeira-v1')!);
    raw.dataVersion = 99;
    const bytes = JSON.stringify(raw);
    localStorage.setItem('rota-financeira-v1', bytes);
    return bytes;
  });
  await expect(
    page.getByText(/Estes dados foram criados por uma versão mais recente/),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText(/Os dados mudaram em outra aba/)).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('rota-financeira-v1')),
  ).toBe(future);
  await other.close();
});
