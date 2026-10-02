import { test, expect, type Page } from '@playwright/test';
import { navigate, selectSettingsSection } from './navigation';
import { defaults, emptyRow, today } from '../../src/model';
import { encodeMoney } from '../../src/services/money-codec';
import { MockOpenFinanceProvider } from '../../src/services/open-finance/mock-provider';
import { emptyOpenFinance } from '../../src/services/open-finance/types';

async function open(page: Page) {
  await navigate(page, 'Configurações');
  await selectSettingsSection(page, 'Integrações');
}
async function connect(page: Page) {
  await page
    .getByRole('button', { name: 'Conectar instituição', exact: true })
    .click();
  await page.getByLabel('Buscar instituição').fill('Instituição');
  await page
    .getByRole('button', { name: 'Instituição demonstração', exact: true })
    .click();
  const authorize = page.getByRole('button', { name: 'Conectar', exact: true });
  await expect(authorize).toBeVisible();
  await authorize.click();
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(
    page.getByText('Compra demonstração', { exact: true }),
  ).toBeVisible();
}
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (r) =>
    new URL(r.request().url()).hostname === '127.0.0.1'
      ? r.continue()
      : r.fulfill({ status: 503, body: '{}' }),
  );
});

test('retorno OAuth abre a aplicação diretamente em Open Finance', async ({ page }) => {
  await page.goto('/open-finance/callback');
  await expect(page.getByRole('heading', { name: 'Configurações', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Integrações', exact: true, includeHidden: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Contas conectadas', exact: true })).toBeVisible();
});

test('Open Finance mock: recuperação por arquivo e cópia exige nova autorização', async ({ page }) => {
  await page.goto('/'); await open(page); await connect(page);
  const original = await page.evaluate(() => localStorage.getItem('rota-financeira-v1')!);
  for (const source of ['file', 'copy']) {
    if (source === 'copy') await page.evaluate(raw => localStorage.setItem('rota-last-valid:guest', raw), original);
    await page.goto('/#recovery'); await page.reload();
    await expect(page.getByRole('heading', { name: 'Recuperação dos dados' })).toBeVisible();
    if (source === 'file') {
      await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(original) });
    } else {
      await page.getByRole('button', { name: 'Restaurar cópia anterior', exact: true }).click();
    }
    await page.getByLabel('Confirmação de recuperação').fill('RESTAURAR');
    await page.getByRole('button', { name: 'Confirmar recuperação', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Hoje', level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rota-financeira-v1')!).openFinance.connections[0].status)).toBe('reauthorization_required');
    await open(page);
    await expect(page.getByRole('button', { name: 'Conectar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sincronizar', exact: true })).toHaveCount(0);
    await expect(page.getByText('Compra demonstração', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rota-financeira-v1')!).openFinance.sync[0].cursor)).toBeNull();
  }
});

test('Open Finance mock: OFX com outro rótulo de conta exige conciliação e mantém um lançamento', async ({
  page,
}) => {
  const d = defaults();
  d.expenses.push({
    ...emptyRow('expenses'),
    id: 'ofx-record',
    name: 'Compra demonstração',
    date: today(),
    amount: 45.9,
    recurrence: 'única',
  });
  d.imports.sessions.push({
    id: 'ofx-session',
    source: 'ofx',
    fileName: 'fixture',
    createdAt: new Date().toISOString(),
    hash: 'a'.repeat(64),
    rowCount: 1,
    importedCount: 1,
    matchedCount: 0,
    ignoredCount: 0,
    duplicateCount: 0,
    invalidCount: 0,
  });
  d.imports.links.push({
    id: 'ofx-link',
    sessionId: 'ofx-session',
    transaction: {
      source: 'ofx',
      line: 1,
      externalId: 'ofx-id',
      date: today(),
      description: 'Compra demonstração',
      normalizedDescription: 'compra demonstracao',
      amountCents: 4590,
      direction: 'debit',
      accountLabel: 'Meu banco no OFX',
      document: '',
    },
    action: 'created',
    recordKind: 'expenses',
    recordId: 'ofx-record',
    fingerprint: '',
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem('rota-financeira-v1'))
      localStorage.setItem('rota-financeira-v1', JSON.stringify(value));
  }, encodeMoney(d));
  await page.goto('/');
  await open(page);
  await connect(page);
  await expect(
    page.getByRole('button', { name: 'Importar lançamento', exact: true }),
  ).toHaveCount(0);
  // Open reconciliation details for the transaction
  const txRow = page.locator('.connected-transaction-row').filter({ hasText: 'Compra demonstração' });
  await txRow.getByText('Revisar e conciliar', { exact: true }).click();
  await txRow.getByRole('button', { name: 'Conciliar com Compra demonstração', exact: true }).click();
  await expect(txRow.locator('.transaction-state')).toContainText('Efetivada');
  await expect(txRow.locator('.transaction-state')).toContainText('Revisada');
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('rota-financeira-v1')!).expenses.length,
    ),
  ).toBe(1);
});

test('Open Finance mock: dez contas, paginação limitada e transferência sem efeito no caixa', async ({
  page,
}) => {
  const provider = new MockOpenFinanceProvider();
  const c = await provider.authorize(
    await provider.createConnection(
      'guest',
      (await provider.listInstitutions())[0],
    ),
    'guest',
  );
  const a = (await provider.listAccounts(c, 'guest'))[0];
  const t = (
    await provider.getTransactions(a, c, 'guest', {
      since: '2020-01-01',
      cursor: null,
    })
  ).items[0];
  const d = defaults();
  d.openFinanceVersion = 1;
  d.planningVersion = 9;
  d.openFinance = {
    ...emptyOpenFinance(),
    connections: [c],
    accounts: Array.from({ length: 10 }, (_, i) => ({
      ...a,
      id: `account-${i}`,
      externalAccountId: `a-${i}`,
    })),
    transactions: Array.from({ length: 60 }, (_, i) => ({
      ...t,
      id: `tx-${i}`,
      accountId: `account-${i % 10}`,
      transaction: {
        ...t.transaction,
        accountId: `account-${i % 10}`,
        externalId: `external-${i}`,
        description: `Registro ${i}`,
        normalizedDescription: `registro ${i}`,
        amountCents: i < 2 ? 4590 : 4590 + i,
        direction: i === 1 ? 'credit' : 'debit',
      },
    })),
  };
  await page.addInitScript((value) => {
    if (!localStorage.getItem('rota-financeira-v1'))
      localStorage.setItem('rota-financeira-v1', JSON.stringify(value));
  }, encodeMoney(d));
  await page.goto('/');
  await open(page);
  const section = page.getByRole('region', {
    name: 'Contas conectadas',
    exact: true,
  });
  await expect(section.locator('.connected-transaction-row')).toHaveCount(25);
  const transferRow = section
    .locator('.connected-transaction-row')
    .filter({ hasText: 'Registro 0' });
  await transferRow.getByText('Revisar e conciliar', { exact: true }).click();
  await transferRow
    .getByRole('button', {
      name: 'Conciliar transferência com Conta demonstração',
      exact: true,
    })
    .first()
    .click();
  await expect(section.getByText('Revisada', { exact: true })).toHaveCount(2);
  expect(
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('rota-financeira-v1')!);
      return state.expenses.length + state.bankReceipts.length;
    }),
  ).toBe(0);
  await section.getByRole('button', { name: 'Próxima página' }).click();
  await expect(section.locator('.connected-transaction-row')).toHaveCount(25);
  await section.getByRole('button', { name: 'Próxima página' }).click();
  await expect(section.locator('.connected-transaction-row')).toHaveCount(10);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('Open Finance mock: conectar, revisar, persistir, revogar e consultar offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await open(page);
  await connect(page);
  // Open reconciliation details for the transaction
  const txRow = page.locator('.connected-transaction-row').filter({ hasText: 'Compra demonstração' });
  await txRow.getByText('Revisar e conciliar', { exact: true }).click();
  await txRow.getByRole('button', { name: 'Importar lançamento', exact: true }).click();
  await expect(txRow.locator('.transaction-state')).toContainText('Efetivada');
  await expect(txRow.locator('.transaction-state')).toContainText('Revisada');
  await page.reload();
  await open(page);
  // After reload, find the transaction row again
  const txRowAfterReload = page.locator('.connected-transaction-row').filter({ hasText: 'Compra demonstração' });
  await expect(txRowAfterReload.locator('.transaction-state')).toContainText('Efetivada');
  await expect(txRowAfterReload.locator('.transaction-state')).toContainText('Revisada');
  await page
    .getByRole('button', { name: 'Desconectar Instituição demonstração', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Desconectar', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Sincronizar', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Sem novas atualizações', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('rota-financeira-v1')!).expenses.length,
    ),
  ).toBe(1);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await open(page);
  await context.setOffline(true);
  await page.reload();
  await open(page);
  await expect(
    page.getByText('Compra demonstração', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Sem conexão — exibindo dados da última sincronização.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('Open Finance mock: concilia lançamento manual sem duplicação', async ({
  page,
}) => {
  const d = defaults();
  d.expenses.push({
    ...emptyRow('expenses'),
    id: 'manual',
    name: 'Compra demonstração',
    date: today(),
    amount: 45.9,
    recurrence: 'única',
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem('rota-financeira-v1'))
      localStorage.setItem('rota-financeira-v1', JSON.stringify(value));
  }, encodeMoney(d));
  await page.goto('/');
  await open(page);
  await connect(page);
  await expect(
    page.getByRole('button', { name: 'Importar lançamento', exact: true }),
  ).toHaveCount(0);
  // Open reconciliation details for the transaction
  const txRow = page.locator('.connected-transaction-row').filter({ hasText: 'Compra demonstração' });
  await txRow.getByText('Revisar e conciliar', { exact: true }).click();
  await txRow.getByRole('button', { name: 'Conciliar com Compra demonstração', exact: true }).click();
  await expect(txRow.locator('.transaction-state')).toContainText('Efetivada');
  await expect(txRow.locator('.transaction-state')).toContainText('Revisada');
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('rota-financeira-v1')!).expenses.length,
    ),
  ).toBe(1);
});
test('Open Finance mock: expiração requer renovação e teclado acessa autorização', async ({
  page,
}) => {
  await page.goto('/');
  await open(page);
  await connect(page);
  await page.evaluate(() => {
    const key = 'rota-financeira-v1',
      d = JSON.parse(localStorage.getItem(key)!);
    d.openFinance.connections[0].expiresAt = '2020-01-01T00:00:00Z';
    localStorage.setItem(key, JSON.stringify(d));
  });
  await page.reload();
  await open(page);
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  const renew = page.getByRole('button', {
    name: 'Conectar',
    exact: true,
  });
  await expect(renew).toBeVisible();
  await renew.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Sincronizar', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
