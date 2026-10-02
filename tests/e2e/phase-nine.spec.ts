import { test, expect, type Page } from '@playwright/test';
import { defaults, emptyRow, today } from '../../src/model';
import { navigate, selectSettingsSection } from './navigation';
async function seed(page: Page) {
  const d = defaults(),
    at = today();
  d.expenses = [
    {
      ...emptyRow('expenses'),
      id: 'expense',
      name: 'Mercado',
      date: at,
      category: 'alimentação',
      amount: 100,
      essentiality: 'essencial',
    },
  ];
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'reserve',
      name: 'Reserva',
      category: 'reserva de emergência',
      balance: 600,
      date: at,
    },
  ];
  d.reserveAllocations = [
    {
      ...emptyRow('reserveAllocations'),
      id: 'allocation',
      investmentId: 'reserve',
      enabled: 'sim',
      liquidity: 'imediata',
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
}
test('assistente abre pela primeira vez offline após instalação do shell', async ({
  page,
  context,
}) => {
  await seed(page);
  await page.goto('/#notification=' + encodeURIComponent('Dívidas'));
  await expect(
    page.getByRole('heading', { name: 'Dívidas', exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await context.setOffline(true);
  await navigate(page, 'Assistente');
  await expect(page.getByRole('region', { name: 'Resposta' })).toContainText(
    'R$ 100,00',
  );
  await context.setOffline(false);
});
test('assistente consulta registros, fontes, reserva, investimentos, alertas e offline sem mutação', async ({
  page,
  context,
}) => {
  await seed(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await navigate(page, 'Assistente');
  const before = await page.evaluate(() =>
    localStorage.getItem('rota-financeira-v1'),
  );
  const answer = page.getByRole('region', { name: 'Resposta' });
  await expect(answer).toContainText('R$ 100,00');
  await page.getByText('Como foi calculado', { exact: true }).click();
  await expect(
    page.getByText('Gastos incluem despesas e serviços de manutenção;', {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByText('Fontes', { exact: true }).click();
  await expect(
    page.getByText(
      'Gastos e serviços registrados; Trabalho e recebimentos registrados',
      { exact: false },
    ),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Como está minha reserva?', exact: true })
    .click();
  await expect(answer).toContainText('R$ 600,00');
  await expect(answer).toContainText('6 meses');
  await page
    .getByRole('button', { name: 'Quanto tenho investido?', exact: true })
    .click();
  await expect(answer).toContainText('R$ 600,00');
  await page
    .getByRole('combobox', { name: 'Pergunta', exact: true })
    .selectOption('ACTIVE_ALERTS');
  await expect(answer).toContainText('Mês anterior ainda não fechado');
  await context.setOffline(true);
  await page
    .getByRole('button', { name: 'Quanto gastei este mês?', exact: true })
    .click();
  await expect(answer).toContainText('R$ 100,00');
  await page
    .getByRole('combobox', { name: 'Período', exact: true })
    .selectOption('previous');
  await expect(answer).toContainText('Indisponível');
  await page
    .getByRole('combobox', { name: 'Período', exact: true })
    .press('Tab');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem('rota-financeira-v1')),
  ).toBe(before);
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
test('notificações exigem ação explícita, persistem, respeitam privacidade e deduplicam', async ({
  page,
}) => {
  await seed(page);
  await page.addInitScript(() => {
    let permission: NotificationPermission =
      localStorage.getItem('test-permission') === 'granted'
        ? 'granted'
        : 'default';
    const state = { requests: 0, bodies: [] as string[] };
    Object.defineProperty(window, 'phaseNine', { value: state });
    Object.defineProperty(window, 'Notification', {
      value: class {
        static get permission() {
          return permission;
        }
        static async requestPermission() {
          state.requests++;
          permission = 'granted';
          localStorage.setItem('test-permission', 'granted');
          return permission;
        }
      },
    });
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', {
      value: async () => ({
        active: {},
        showNotification: async (
          _title: string,
          options: NotificationOptions,
        ) => {
          state.bodies.push(options.body || '');
        },
      }),
    });
  });
  const mock = () =>
    page.evaluate(
      () =>
        Reflect.get(window, 'phaseNine') as {
          requests: number;
          bodies: string[];
        },
    );
  await page.goto('/');
  await navigate(page, 'Configurações');
  await selectSettingsSection(page, 'Notificações');
  await expect(page.getByText('Desativadas', { exact: true })).toBeVisible();
  expect((await mock()).requests).toBe(0);
  await page
    .getByRole('button', { name: 'Ativar notificações', exact: true })
    .click();
  await expect.poll(async () => (await mock()).requests).toBe(1);
  await page.getByLabel('Não incomodar', { exact: true }).uncheck();
  await page.getByLabel('Orçamento', { exact: true }).check();
  await page
    .getByRole('combobox', { name: 'Antecedência', exact: true })
    .selectOption('15');
  await page
    .getByRole('button', {
      name: 'Salvar preferências de notificações',
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await mock()).bodies.length)
    .toBeGreaterThan(0);
  const bodies = (await mock()).bodies;
  expect(
    bodies.every(
      (b) => !b.includes('R$') && !b.includes('Mercado') && !b.includes('600'),
    ),
  ).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await mock()).bodies).toEqual(bodies);
  await page.reload();
  await navigate(page, 'Configurações');
  await selectSettingsSection(page, 'Notificações');
  await expect(
    page.getByRole('combobox', { name: 'Antecedência', exact: true }),
  ).toHaveValue('15');
  await expect(page.getByLabel('Orçamento', { exact: true })).toBeChecked();
  await expect(
    page.getByLabel('Mostrar valores e detalhes na tela bloqueada', {
      exact: true,
    }),
  ).not.toBeChecked();
  expect((await mock()).requests).toBe(0);
  expect((await mock()).bodies).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
