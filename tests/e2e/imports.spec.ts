import { test, expect } from '@playwright/test';
import { navigate } from './navigation';
test('50 mil linhas usam worker e lista virtual, sem alterar dados no preview', async ({
  page,
}) => {
  await page.goto('/');
  await navigate(page, 'Importar');
  const before = await page.evaluate(() =>
    localStorage.getItem('rota-financeira-v1'),
  );
  const text =
    'Data;Descrição;Valor;Conta\n' +
    Array.from(
      { length: 50000 },
      (_, i) => `10/09/2026;Loja fictícia ${i};-1,20;Teste`,
    ).join('\n');
  await page
    .getByLabel('Arquivo CSV ou OFX')
    .setInputFiles({
      name: 'volume-ficticio.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(text),
    });
  await page
    .getByRole('button', { name: 'Gerar preview', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '2. Revisar 50000 linhas' }),
  ).toBeVisible({ timeout: 15000 });
  expect(await page.locator('.import-preview-row').count()).toBeLessThanOrEqual(
    12,
  );
  await page.locator('.import-window').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    page.getByRole('button', { name: 'Revisar linha 50001', exact: true }),
  ).toBeVisible();
  expect(await page.locator('.import-preview-row').count()).toBeLessThanOrEqual(
    12,
  );
  expect(
    await page.evaluate(() => localStorage.getItem('rota-financeira-v1')),
  ).toBe(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
const csv =
  'Data;Descrição;Valor;Conta\n10/09/2026;Loja fictícia;-20,00;Conta teste\n10/09/2026;Loja fictícia;-20,00;Conta teste\n11/09/2026;Receita fictícia;100,00;Conta teste';
const ofx =
  '<OFX><STMTRS><BANKID>999<ACCTID>CONTA-FICTICIA<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260910120000[-3:BRT]<TRNAMT>-12.34<FITID>FICTICIO-1<MEMO>Loja &amp; teste</STMTTRN></BANKTRANLIST></STMTRS></OFX>';
test('CSV: preview, categoria, confirmação, offline, cancelamento e reimportação', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await navigate(page, 'Importar');
  const before = await page.evaluate(() =>
    localStorage.getItem('rota-financeira-v1'),
  );
  await page.getByLabel('Arquivo CSV ou OFX').setInputFiles({
    name: 'ficticio.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page
    .getByRole('button', { name: 'Gerar preview', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '2. Revisar 3 linhas' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Preview da importação' }),
  ).toContainText('Duplicatas: 1');
  expect(
    await page.evaluate(() => localStorage.getItem('rota-financeira-v1')),
  ).toBe(before);
  await page.getByRole('button', { name: 'Selecionar novos seguros' }).click();
  await page
    .getByRole('button', { name: 'Revisar linha 2', exact: true })
    .click();
  await page
    .getByLabel('Categoria', { exact: true })
    .selectOption('alimentação');
  await page
    .getByLabel('Aplicar esta categoria à descrição exata no futuro')
    .check();
  await page.getByRole('button', { name: 'Ignorar duplicatas' }).click();
  await context.setOffline(true);
  await page.getByLabel('Revisei as decisões e confirmo a gravação').check();
  await page
    .getByRole('button', { name: 'Confirmar importação', exact: true })
    .click();
  await expect(
    page.getByText(
      'Importação concluída. Somente as linhas revisadas foram processadas.',
      { exact: true },
    ),
  ).toBeVisible();
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rota-financeira-v1')!),
  );
  expect(state.expenses).toHaveLength(1);
  expect(state.expenses[0].amount).toBe(2000);
  expect(state.expenses[0].category).toBe('alimentação');
  expect(state.bankReceipts[0].amountCents).toBe(10000);
  expect(state.work).toHaveLength(0);
  expect(state.imports.rules).toHaveLength(1);
  await page.getByLabel('Arquivo CSV ou OFX').setInputFiles({
    name: 'outro-nome.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await expect(
    page.getByText(/Este arquivo parece já ter sido processado/),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Gerar preview', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Preview da importação' }),
  ).toContainText('Duplicatas: 3');
  await page.getByRole('button', { name: 'Ignorar duplicatas' }).click();
  await page.getByLabel('Revisei as decisões e confirmo a gravação').check();
  await page
    .getByRole('button', { name: 'Confirmar importação', exact: true })
    .click();
  await expect(page.getByLabel('Arquivo CSV ou OFX')).toHaveValue('');
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('rota-financeira-v1')!).expenses.length,
    ),
  ).toBe(1);
  const saved = await page.evaluate(() =>
    localStorage.getItem('rota-financeira-v1'),
  );
  await page.getByLabel('Arquivo CSV ou OFX').setInputFiles({
    name: 'cancelar.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.getByRole('button', { name: 'Cancelar importação' }).click();
  expect(
    await page.evaluate(() => localStorage.getItem('rota-financeira-v1')),
  ).toBe(saved);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
test('OFX: FITID, data local, descrição como texto e repetição', async ({
  page,
}) => {
  await page.goto('/');
  await navigate(page, 'Importar');
  const load = async () => {
    await page.getByLabel('Arquivo CSV ou OFX').setInputFiles({
      name: 'ficticio.ofx',
      mimeType: 'application/x-ofx',
      buffer: Buffer.from(ofx),
    });
    await page
      .getByRole('button', { name: 'Gerar preview', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: '2. Revisar 1 linhas' }),
    ).toBeVisible();
  };
  await load();
  await expect(page.getByText('Loja & teste', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Selecionar novos seguros' }).click();
  await page.getByLabel('Revisei as decisões e confirmo a gravação').check();
  await page
    .getByRole('button', { name: 'Confirmar importação', exact: true })
    .click();
  await expect(page.getByLabel('Arquivo CSV ou OFX')).toHaveValue('');
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rota-financeira-v1')!),
  );
  expect(stored.expenses[0].date).toBe('2026-09-10');
  expect(stored.expenses[0].amount).toBe(1234);
  expect(stored.imports.links[0].transaction.externalId).toBe('FICTICIO-1');
  await load();
  await expect(
    page.getByRole('region', { name: 'Preview da importação' }),
  ).toContainText('Duplicatas: 1');
  await page.getByRole('button', { name: 'Selecionar novos seguros' }).click();
  await expect(
    page.getByRole('button', { name: 'Confirmar importação', exact: true }),
  ).toBeDisabled();
});
