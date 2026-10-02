import { test, expect } from '@playwright/test';
import { defaults, emptyRow, today, money } from '../../src/model';
import { encodeMoney } from '../../src/services/money-codec';
import { validateData } from '../../src/services/storage';
import { navigate, selectSettingsSection } from './navigation';

const routes = [
  'Hoje',
  'Dashboard',
  'Transações',
  'Contas',
  'Orçamentos',
  'Planejamento',
  'Patrimônio',
  'Simulações',
  'Importar',
  'Dívidas',
  'Trabalho',
  'Moto',
  'Manutenção',
  'Gastos',
  'Investimentos',
  'Planos',
  'Assistente',
  'Minha Situação',
  'Alertas',
  'Auditoria',
  'Relatórios',
  'Análises',
  'Configurações',
];

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.fulfill({ status: 503, body: '{}' }),
  );
});

test('23 superfícies com registros reais da fixture cabem em ambos os temas', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const d = defaults(),
    at = today();
  d.settings = {
    ...d.settings,
    profileName: 'Ana Maria',
    openingCash: 5000,
    workDays: 22,
    hoursDay: 8,
    kmDay: 100,
  };
  d.bike.km = 18250;
  d.expenses = ['alimentação', 'combustível', 'moradia'].map(
    (category, index) => ({
      ...emptyRow('expenses'),
      id: `expense-${index}`,
      date: at,
      name: ['Mercado da semana', 'Combustível', 'Aluguel'][index],
      category,
      amount: [125.4, 85, 950][index],
    }),
  );
  d.work = [
    {
      ...emptyRow('work'),
      id: 'work',
      date: at,
      activity: 'Uber Moto',
      hours: 6,
      km: 120,
      revenue: 360,
    },
  ];
  d.bankReceipts = [
    {
      ...emptyRow('bankReceipts'),
      id: 'receipt',
      date: at,
      name: 'Recebimento mensal',
      account: 'Conta pessoal',
      amountCents: 350000,
    },
  ];
  d.budgets = [
    {
      ...emptyRow('budgets'),
      id: 'budget',
      category: 'alimentação',
      limitCents: 50000,
    },
  ];
  d.debts = [
    {
      ...emptyRow('debts'),
      id: 'debt',
      name: 'Compra parcelada',
      balance: 1200,
      installmentAmount: 100,
      totalInstallments: 12,
      paidInstallments: 0,
      due: at,
    },
  ];
  d.plans = [
    {
      ...emptyRow('plans'),
      id: 'goal',
      name: 'Viagem de férias',
      target: 5000,
      current: 1250,
      deadline: at,
    },
  ];
  d.recurrences = [
    {
      ...emptyRow('recurrences'),
      id: 'recurrence',
      name: 'Internet residencial',
      kind: 'despesa',
      frequency: 'mensal',
      amount: 100,
      startDate: at,
      status: 'ativa',
    },
  ];
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'investment',
      name: 'Reserva pessoal',
      category: 'CDB',
      date: at,
      costsKnown: 'sim',
    },
  ];
  d.movements = [
    {
      ...emptyRow('movements'),
      id: 'contribution',
      investmentId: 'investment',
      date: at,
      kind: 'aporte',
      amount: 2000,
    },
  ];
  d.netWorthSnapshots = [30, 14, 1].map((days, index) => ({
    ...emptyRow('netWorthSnapshots'),
    id: `snapshot-${index}`,
    date: new Date(Date.parse(at + 'T12:00:00Z') - days * 86400000)
      .toISOString()
      .slice(0, 10),
    cashCents: 500000 + index * 10000,
    investmentsCents: 200000,
    netCents: 700000 + index * 10000,
    positions: JSON.stringify({
      assets: {},
      investments: { investment: 200000 },
      debts: {},
    }),
    partial: 0,
  }));
  validateData(encodeMoney(d));
  await page.addInitScript(
    (raw) => {
      if (!localStorage.getItem('rota-financeira-v1'))
        localStorage.setItem('rota-financeira-v1', raw);
    },
    JSON.stringify(encodeMoney(d)),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  for (const theme of ['Claro', 'Escuro']) {
    await navigate(page, 'Configurações');
    await selectSettingsSection(page, 'Aparência');
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page
      .getByRole('button', { name: 'Fechar notificação', exact: true })
      .click();
    for (const route of routes) {
      await navigate(page, route);
      await expect(page.locator('main h1')).toBeVisible();
      await page.locator('.page-transition').evaluate(async (node) => {
        await Promise.all(
          node
            .getAnimations({ subtree: true })
            .filter(
              (animation) =>
                animation.effect?.getTiming().iterations !== Infinity,
            )
            .map((animation) => animation.finished.catch(() => undefined)),
        );
      });
      await expect(
        page.getByRole('region', { name: 'Página indisponível' }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${route}, ${theme}`,
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
      if (['390', '1366'].includes(info.project.name))
        await page.screenshot({
          path: `.qa-artifacts/2.0/${info.project.name}-${theme}-${route}.png`,
        });
      if (route === 'Dashboard') {
        const shortcuts = page.locator('.dashboard-actions .quick-action');
        await expect(shortcuts).toHaveCount(3);
        expect(await shortcuts.evaluateAll((buttons) => buttons.every((button) => getComputedStyle(button).whiteSpace === 'nowrap'))).toBe(true);
        const axis = page.locator('.wealth-line-chart .recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value');
        await expect(axis.first()).toBeVisible();
        const axisLabels = await axis.allTextContents();
        expect(axisLabels.length).toBeGreaterThan(1);
        expect(new Set(axisLabels).size).toBe(axisLabels.length);
        await expect(page.locator('.dashboard-wealth-trend')).toContainText(
          'Posições salvas',
        );
        await page.screenshot({
          path: `.impeccable/review/${info.project.name}-${theme}.png`,
        });
        if (theme === 'Claro') await page.screenshot({ path: `.impeccable/review/user-${info.project.name}.png` });
        if (['390', '1366'].includes(info.project.name)) {
          await page.locator('.dashboard-cashflow').screenshot({ path: `.impeccable/review/${info.project.name}-${theme}-cashflow.png` });
          await page.locator('.dashboard-intelligence-grid').screenshot({ path: `.impeccable/review/${info.project.name}-${theme}-analytics.png` });
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        if (theme === 'Claro' && ['390', '1366'].includes(info.project.name))
          await page.screenshot({
            path: `.impeccable/review/${info.project.name === '390' ? 'mobile' : 'desktop'}.png`,
          });
      }
      if (route === 'Investimentos') {
        expect(await page.locator('.investment-position .metrics').evaluate((node) => getComputedStyle(node).borderLeftWidth)).toBe('0px');
      }
    }
  }
  expect(errors).toEqual([]);
});

test('perfil, sidebar e início guiado mantêm preferências após recarga', async ({
  page,
}) => {
  await page.goto('/?view=Hoje');
  await expect(
    page.getByRole('heading', { name: 'Sua rota começa aqui' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Explorar por conta própria' })
    .click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Sua rota começa aqui' }),
  ).toHaveCount(0);
  await navigate(page, 'Configurações');
  await selectSettingsSection(page, 'Perfil');
  await page.getByLabel('Como você quer ser chamado?').fill('Talisson Silva');
  await page.getByRole('button', { name: 'Salvar nome', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Abrir menu de Talisson Silva' }),
  ).toBeVisible();
  await selectSettingsSection(page, 'Dados');
  await page
    .getByRole('button', { name: 'Abrir menu de Talisson Silva' })
    .click();
  await page.getByRole('menuitem', { name: 'Meu perfil', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: 'Perfil', exact: true, includeHidden: true }),
  ).toHaveAttribute('aria-selected', 'true');
  if (page.viewportSize()!.width >= 1024) {
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    await expect(
      page.locator('[data-slot=sidebar][data-state]'),
    ).toHaveAttribute('data-state', 'collapsed');
    await page.reload();
    await expect(
      page.locator('[data-slot=sidebar][data-state]'),
    ).toHaveAttribute('data-state', 'collapsed');
    await page
      .locator('[data-slot=sidebar-menu-button][aria-label="Dashboard"]')
      .click();
    await expect(page.locator('main h1')).toHaveText('Visão geral');
  }
});

test('fluxo de caixa muda período, exclui principal, inclui custos e preserva privacidade', async ({
  page,
}) => {
  const d = defaults(),
    at = today();
  d.expenses = [
    {
      ...emptyRow('expenses'),
      id: 'expense',
      date: at,
      name: 'Mercado',
      amount: 12.34,
    },
  ];
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'investment',
      date: at,
      name: 'Reserva',
      category: 'CDB',
    },
  ];
  d.movements = [
    {
      ...emptyRow('movements'),
      id: 'transfer',
      investmentId: 'investment',
      date: at,
      kind: 'aporte',
      amount: 999,
      feesCents: 75,
    },
  ];
  validateData(encodeMoney(d));
  await page.addInitScript(
    (raw) => localStorage.setItem('rota-financeira-v1', raw),
    JSON.stringify(encodeMoney(d)),
  );
  await page.goto('/?view=Dashboard');
  const chart = page.locator('.dashboard-cashflow');
  await chart
    .getByText('Consultar valores dos movimentos', { exact: true })
    .click();
  await expect(chart.locator('dl')).toContainText(money(13.09));
  await expect(chart.locator('dl')).toContainText('Entradas ' + money(0));
  await expect(chart.locator('dl')).not.toContainText(money(999));
  await chart.getByRole('button', { name: '1A', exact: true }).click();
  await expect(
    chart.getByRole('button', { name: '1A', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(chart.locator('dt')).toContainText(at.slice(0, 7));
  await page.getByRole('button', { name: 'Ocultar valores' }).click();
  await expect(chart.locator('dl')).not.toContainText(money(13.09));
  await expect(chart.locator('dl')).toContainText('••••');
  await navigate(page, 'Configurações');
  await selectSettingsSection(page, 'Finanças');
  const opening = page.locator('.detail').filter({ hasText: 'Saldo inicial' });
  await expect(opening).not.toContainText(money(0));
  await expect(opening).toContainText('••••');
  await page.getByRole('button', { name: 'Mostrar valores' }).click();
  await expect(opening).toContainText(money(0));
});

test('auth permite revisar senha, valida confirmação e recupera acesso sem expor conta', async ({
  page,
}, info) => {
  await page.route('**/auth/v1/recover**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: /Abrir menu de/ }).click();
  await page
    .getByRole('menuitem', { name: 'Entrar ou criar conta', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Bem-vindo de volta' }),
  ).toBeVisible();
  if (page.viewportSize()!.width >= 768)
    await expect(dialog.locator('.login-mobile-brand')).toBeHidden();
  else await expect(dialog.locator('.login-mobile-brand')).toBeVisible();
  expect(
    await dialog
      .locator('.login-password input')
      .evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).paddingRight),
      ),
  ).toBeGreaterThanOrEqual(44);
  await dialog
    .getByLabel('Email (obrigatório)', { exact: true })
    .fill('fixture@example.test');
  await dialog
    .getByLabel('Senha (obrigatória)', { exact: true })
    .fill('fixture-123');
  await dialog
    .getByRole('button', { name: 'Mostrar senha', exact: true })
    .click();
  await expect(
    dialog.getByLabel('Senha (obrigatória)', { exact: true }),
  ).toHaveAttribute('type', 'text');
  await dialog
    .getByRole('button', { name: 'Ocultar senha', exact: true })
    .click();
  await expect(
    dialog.getByLabel('Senha (obrigatória)', { exact: true }),
  ).toHaveAttribute('type', 'password');
  await dialog.evaluate(async (node) => {
    await Promise.all(
      node
        .getAnimations({ subtree: true })
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  await page.screenshot({
    path: `.qa-artifacts/2.0/${info.project.name}-auth-login.png`,
  });
  await dialog.locator('.login-switch').click();
  await dialog
    .getByLabel('Confirmar senha (obrigatória)', { exact: true })
    .fill('different-123');
  await dialog
    .getByRole('button', { name: 'Criar conta', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'As senhas precisam ser iguais.',
  );
  await expect(
    dialog.getByLabel('Confirmar senha (obrigatória)', { exact: true }),
  ).toHaveAttribute('aria-invalid', 'true');
  await dialog
    .getByRole('button', { name: 'Esqueci minha senha', exact: true })
    .click();
  await expect(
    dialog.getByRole('heading', { name: 'Recupere seu acesso' }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Enviar link', exact: true })
    .click();
  await expect(dialog.getByRole('status')).toContainText(
    'Se houver uma conta com este email',
  );
  await dialog
    .getByRole('button', { name: 'Continuar sem conta', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
});

test('buscas mantêm espaço entre ícone e texto em todas as larguras', async ({
  page,
}) => {
  await page.goto('/');
  for (const [view, selector] of [
    ['Transações', '.transaction-search'],
    ['Investimentos', '.portfolio-search'],
  ]) {
    await navigate(page, view);
    const input = page.locator(`${selector} input`);
    await expect(input).toBeVisible();
    expect(
      await input.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).paddingLeft),
      ),
    ).toBeGreaterThanOrEqual(36);
    await input.fill('Texto para conferir espaçamento');
    await expect(input).toHaveValue('Texto para conferir espaçamento');
  }
});
