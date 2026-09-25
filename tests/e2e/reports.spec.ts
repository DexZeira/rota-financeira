import { test, expect, type Page } from '@playwright/test';
import { defaults, emptyRow, today } from '../../src/model';
import { shiftPeriod } from '../../src/services/month-close';
import { navigate } from './navigation';
const period = shiftPeriod(today().slice(0, 7), -1);
async function seed(page: Page, count = 1) {
  const d = defaults();
  d.settings.openingCash = 1000;
  d.bankReceipts = [
    {
      ...emptyRow('bankReceipts'),
      id: 'receipt',
      name: 'Receita fictícia',
      amountCents: 80000,
      date: period + '-02',
      account: 'Conta teste',
    },
  ];
  d.expenses = Array.from({ length: count }, (_, i) => ({
    ...emptyRow('expenses'),
    id: 'expense' + i,
    name: 'Mercado teste ' + i,
    amount: 200,
    date: period + '-03',
    category: 'alimentação',
  }));
  await page.addInitScript((data) => {
    if (!localStorage.getItem('rota-financeira-v1'))
      localStorage.setItem('rota-financeira-v1', JSON.stringify(data));
  }, d);
  await page.route(/api\.bcb\.gov\.br|olinda\.bcb\.gov\.br/, (r) =>
    r.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/');
  await navigate(page, 'Relatórios');
  await expect(
    page.getByRole('region', { name: 'Resumo mensal' }),
  ).toContainText('R$');
}
async function checklist(page: Page) {
  const checks = page
    .getByRole('group', { name: 'Checklist de conferência' })
    .getByRole('checkbox');
  await expect(checks).toHaveCount(7);
  for (const checkbox of await checks.all()) await checkbox.check();
  await page.getByLabel('Confirmo o fechamento com dados parciais').check();
}
test('fechamento, alteração histórica, revisão, reabertura e leitura offline', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  await checklist(page);
  await page.getByRole('button', { name: 'Fechar mês', exact: true }).click();
  await expect(
    page.getByText('Fechamento salvo. A revisão anterior foi preservada.', {
      exact: true,
    }),
  ).toBeVisible();
  const first = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('rota-financeira-v1')!).reporting
        .closures[0].revisions[0],
  );
  expect(first.expenseCents).toBe(20000);
  expect(first.closingCashCents).toBe(160000);
  // Simulate a source correction by another session, then reload through the real loader.
  await page.evaluate(() => {
    const key = 'rota-financeira-v1',
      d = JSON.parse(localStorage.getItem(key)!);
    d.expenses[0].amount = 25000;
    localStorage.setItem(key, JSON.stringify(d));
  });
  await page.reload();
  await navigate(page, 'Relatórios');
  await expect(page.getByText(/Desatualizado — houve alteração/)).toBeVisible();
  await checklist(page);
  await page
    .getByRole('button', { name: 'Reprocessar mês', exact: true })
    .click();
  await expect(
    page.getByText('Fechamento salvo. A revisão anterior foi preservada.', {
      exact: true,
    }),
  ).toBeVisible();
  const revisions = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('rota-financeira-v1')!).reporting
        .closures[0].revisions,
  );
  expect(revisions).toHaveLength(2);
  expect(revisions[0]).toEqual(first);
  expect(revisions[1].expenseCents).toBe(25000);
  await page.getByText('Reabrir mês', { exact: true }).click();
  await page.getByLabel('Entendi e quero reabrir').check();
  await page
    .getByRole('button', { name: 'Confirmar reabertura', exact: true })
    .click();
  await expect(
    page.getByText('Mês reaberto. O relatório anterior continua disponível.', {
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(true);
  await checklist(page);
  await page.getByRole('button', { name: 'Fechar mês', exact: true }).click();
  await expect(
    page.getByText('Fechamento salvo. A revisão anterior foi preservada.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Revisão', exact: true })
    .selectOption('1');
  await expect(
    page.getByRole('region', { name: 'Resumo mensal' }),
  ).toContainText('200,00');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test('timeline limitada, busca, filtro, detalhe por teclado e impressão sem navegação', async ({
  page,
}) => {
  await seed(page, 1200);
  expect(await page.locator('.timeline-event').count()).toBe(30);
  await page.getByLabel('Buscar na timeline').fill('Mercado teste 1199');
  await page.getByLabel('Filtrar eventos').selectOption('Saídas');
  await expect(page.locator('.timeline-event')).toHaveCount(1);
  const summary = page.locator('.timeline-event summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.timeline-event')).toContainText(
    'Origem: Registro local',
  );
  await page.getByLabel('Filtrar eventos').selectOption('Entradas');
  await expect(
    page.getByText(
      'Nenhum evento encontrado. Registre um lançamento para começar.',
    ),
  ).toBeVisible();
  await page.getByLabel('Buscar na timeline').fill('');
  await page.getByLabel('Filtrar eventos').selectOption('Todos');
  await page
    .getByRole('button', { name: 'Próximos eventos', exact: true })
    .click();
  expect(await page.locator('.timeline-event').count()).toBe(30);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('[data-slot=sidebar-inset]')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(page.locator('.reports-page')).toHaveCSS(
    'color',
    'rgb(0, 0, 0)',
  );
  await expect(
    page.getByText('Patrimônio inicial', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.report-controls').first()).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Timeline financeira' }),
  ).toBeHidden();
  const visibleNav = await page
    .locator('nav')
    .evaluateAll(
      (nodes) =>
        nodes.filter((n) => getComputedStyle(n).display !== 'none').length,
    );
  expect(visibleNav).toBe(0);
});

test('comparações com mês anterior e base zero', async ({ page }) => {
  const previousMonth = shiftPeriod(period, -1);
  const d = defaults();
  d.settings.openingCash = 1000;
  // Mês passado
  d.bankReceipts.push({
    ...emptyRow('bankReceipts'),
    id: 'receipt-old',
    name: 'Receita antiga',
    amountCents: 50000,
    date: previousMonth + '-15',
    account: 'Conta',
  });
  d.expenses.push({
    ...emptyRow('expenses'),
    id: 'expense-old',
    name: 'Mercado velho',
    amount: 150,
    date: previousMonth + '-10',
    category: 'alimentação',
  });
  // Mês atual
  d.bankReceipts.push({
    ...emptyRow('bankReceipts'),
    id: 'receipt-now',
    name: 'Receita nova',
    amountCents: 100000, // dobro da anterior
    date: period + '-15',
    account: 'Conta',
  });
  d.expenses.push({
    ...emptyRow('expenses'),
    id: 'expense-now',
    name: 'Mercado novo',
    amount: 0, // Vai zerar a despesa para testar base zero na volta
    date: period + '-10',
    category: 'saúde', // Categoria válida, ausente no mês anterior
  });
  d.work.push({
    ...emptyRow('work'),
    id: 'work-now',
    activity: 'Uber',
    date: period + '-16',
    hours: 2,
    km: 10,
    revenue: 100, // 10.000 centavos
    actualRevenue: 100,
  });

  await page.addInitScript((data) => {
    localStorage.setItem('rota-financeira-v1', JSON.stringify(data));
  }, d);
  await page.route(/api\.bcb\.gov\.br|olinda\.bcb\.gov\.br/, (r) =>
    r.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/');

  // Fecha mês passado
  await navigate(page, 'Relatórios');

  const monthInput = page.locator('input[type="month"]');
  await expect(monthInput).toBeVisible({ timeout: 15000 });
  await monthInput.fill(previousMonth);

  await checklist(page);
  await page.getByRole('button', { name: 'Fechar mês', exact: true }).click();
  await expect(
    page.getByText('Fechamento salvo. A revisão anterior foi preservada.', {
      exact: true,
    }),
  ).toBeVisible();

  // Fecha mês atual
  await monthInput.fill(period);
  await checklist(page);
  await page.getByRole('button', { name: 'Fechar mês', exact: true }).click();
  await expect(
    page.getByText('Fechamento salvo. A revisão anterior foi preservada.', {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByText('Comparações e médias').click();

  const comparison = page
    .getByRole('heading', {
      name: 'Mês anterior · ' + previousMonth,
      exact: true,
    })
    .locator('..');
  // R$ 1.000 bancários + R$ 100 de trabalho, contra R$ 500 anteriores: +120%.
  await expect(
    comparison.getByText('Receitas', { exact: true }).locator('..'),
  ).toContainText('120%');
  await expect(comparison).toContainText('Categoria nova');
  await expect(
    comparison.getByText('Trabalho', { exact: true }).locator('..'),
  ).toContainText('Sem base comparável');
});

test('timeline mostra eventos neutros e não duplica pagamentos conciliados', async ({
  page,
}) => {
  const d = defaults();
  d.settings.openingCash = 1000;
  // Dívida e pagamento
  d.debts.push({
    ...emptyRow('debts'),
    id: 'd1',
    name: 'Dívida',
    totalInstallments: 10,
    installmentAmount: 100,
    balance: 1000,
    paidInstallments: 0,
    due: period + '-10',
  });
  d.payments.push({
    ...emptyRow('payments'),
    id: 'p1',
    debtId: 'd1',
    date: period + '-10',
    amount: 100,
    installments: 1,
  });
  d.imports.sessions.push({
    id: 's1',
    source: 'ofx',
    fileName: 'ficticio.ofx',
    hash: 'a'.repeat(64),
    createdAt: period + '-10T12:00:00.000Z',
    rowCount: 1,
    importedCount: 0,
    matchedCount: 1,
    ignoredCount: 0,
    duplicateCount: 0,
    invalidCount: 0,
  });
  d.imports.links.push({
    id: 'l1',
    sessionId: 's1',
    transaction: {
      line: 1,
      externalId: 'ext1',
      date: period + '-10',
      description: 'Pagamento Dívida',
      normalizedDescription: 'pagamento divida',
      amountCents: 10000,
      direction: 'debit',
      accountLabel: 'Conta',
      document: '',
      source: 'ofx',
    },
    action: 'matched',
    recordKind: 'payments',
    recordId: 'p1',
    fingerprint: 'fp1',
  });
  // Evento neutro (transferência para fundo)
  d.fund.push({
    ...emptyRow('fund'),
    id: 'f1',
    date: period + '-15',
    amount: 50,
  });

  await page.addInitScript((data) => {
    localStorage.setItem('rota-financeira-v1', JSON.stringify(data));
  }, d);
  await page.goto('/');
  await navigate(page, 'Relatórios');

  // Wait for the month input to be visible to ensure the page is mounted
  await expect(page.locator('input[type="month"]')).toBeVisible({
    timeout: 15000,
  });

  // Verifica timeline
  const evts = page.locator('.timeline-event');
  await expect(evts).toHaveCount(3); // Pagamento, alocação neutra e sessão de importação neutra
  await expect(evts.filter({ hasText: 'Neutro' })).toHaveCount(2);
  await expect(evts.filter({ hasText: 'Dívida' })).toHaveCount(1); // O pagamento não foi duplicado pela importação
});
