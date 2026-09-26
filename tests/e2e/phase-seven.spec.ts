import { test, expect, type Page } from '@playwright/test';
import { defaults, emptyRow, today } from '../../src/model';
import { navigate } from './navigation';
async function seed(page: Page) {
  const d = defaults(),
    at = today();
  d.settings.openingCash = 1000;
  d.budgets = [
    {
      ...emptyRow('budgets'),
      id: 'b',
      category: 'alimentação',
      enabled: 'sim',
      limitCents: 10000,
      alertThresholdPercent: 70,
      nearThresholdPercent: 90,
    },
  ];
  d.expenses = [
    {
      ...emptyRow('expenses'),
      id: 'e',
      name: 'Mercado do mês',
      date: at,
      amount: 120,
      category: 'alimentação',
    },
  ];
  d.debts = [
    {
      ...emptyRow('debts'),
      id: 'debt',
      name: 'Cartão Azul',
      totalInstallments: 10,
      paidInstallments: 0,
      installmentAmount: 100,
      due: at,
      status: 'ativa',
    },
  ];
  d.imports.sessions = [
    {
      id: 's',
      source: 'csv',
      fileName: 'teste.csv',
      createdAt: at + 'T12:00:00Z',
      hash: 'a'.repeat(64),
      rowCount: 1,
      importedCount: 1,
      matchedCount: 0,
      ignoredCount: 0,
      duplicateCount: 0,
      invalidCount: 0,
    },
  ];
  d.imports.links = [
    {
      id: 'l',
      sessionId: 's',
      action: 'created',
      recordKind: 'expenses',
      recordId: 'deleted',
      fingerprint: '',
      transaction: {
        line: 1,
        externalId: 'x',
        date: at,
        description: 'Registro apagado de teste',
        normalizedDescription: 'registro apagado de teste',
        amountCents: 100,
        direction: 'debit',
        accountLabel: 'teste',
        document: '',
        source: 'csv',
      },
    },
  ];
  await page.addInitScript((data) => {
    if (!localStorage.getItem('rota-financeira-v1'))
      localStorage.setItem('rota-financeira-v1', JSON.stringify(data));
  }, d);
  await page.route(/api\.bcb\.gov\.br|olinda\.bcb\.gov\.br/, (r) =>
    r.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Hoje', exact: true }),
  ).toBeVisible();
}
test('alerta abre origem e desaparece após corrigir orçamento', async ({
  page,
}) => {
  await seed(page);
  await navigate(page, 'Alertas');
  const alert = page
    .locator('article')
    .filter({
      has: page.getByRole('heading', {
        name: 'Orçamento: alimentação',
        exact: true,
      }),
    });
  await expect(alert).toContainText('Limite ultrapassado');
  await alert.getByRole('button', { name: 'Abrir Gastos' }).click();
  await page
    .getByText('Quanto posso gastar? · Orçamento do mês', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Editar orçamento de alimentação' })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Orçamento mensal', { exact: false }).fill('10000');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await navigate(page, 'Alertas');
  await expect(
    page.getByRole('heading', { name: 'Orçamento: alimentação', exact: true }),
  ).toHaveCount(0);
});
test('auditoria explica referência histórica ausente sem alterar armazenamento', async ({
  page,
}) => {
  await seed(page);
  const before = await page.evaluate(() =>
    localStorage.getItem('rota-financeira-v1'),
  );
  await navigate(page, 'Auditoria');
  const issue = page
    .locator('article')
    .filter({
      has: page.getByRole('heading', {
        name: 'Registro importado não está mais disponível',
      }),
    });
  await expect(issue).toContainText('Registro: l');
  await expect(issue).toContainText('impedir reimportação');
  await expect(
    issue.getByRole('button', { name: 'Revisar em Importar' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('rota-financeira-v1')),
  ).toBe(before);
});
test('busca acessível no mobile e teclado abre dívida; limite e Escape', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('button', { name: 'Abrir busca universal' }).click();
  const dialog = page.getByRole('dialog'),
    input = dialog.getByRole('combobox', { name: 'Busca global' });
  await input.fill('cartao');
  await expect(dialog.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Dívidas', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(input).toBeVisible();
  await input.fill('120');
  await expect(dialog.getByRole('listbox').getByRole('option')).toContainText(
    'Mercado do mês',
  );
  await input.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('Minha Situação e ferramentas locais funcionam offline sem erros', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  await navigate(page, 'Minha Situação');
  const region = page.getByRole('region', { name: 'Situação atual' });
  await expect(region).toContainText('Caixa');
  await expect(region).toContainText('880,00');
  await expect(region).toContainText('Dívidas registradas');
  await expect(region).toContainText('Reserva');
  await context.setOffline(true);
  await navigate(page, 'Alertas');
  await expect(
    page.getByRole('heading', { name: 'Alertas', exact: true }),
  ).toBeVisible();
  await navigate(page, 'Auditoria');
  await expect(
    page.getByRole('heading', { name: 'Auditoria', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Abrir busca universal' }).click();
  await page.getByRole('combobox', { name: 'Busca global' }).fill('cartao');
  await expect(page.getByRole('listbox').getByRole('option')).toContainText(
    'Cartão Azul',
  );
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
