import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow, type Data } from '../src/model';
import {
  buildMonthlySnapshot,
  closeMonth,
  reopenMonth,
  isMonthStale,
  shiftPeriod,
} from '../src/services/month-close';
import {
  compareMonths,
  movingAverage,
  explainFinancialChange,
} from '../src/services/financial-change-explainer';
import {
  generateFinancialTimeline,
  timelineWindow,
  filterTimelineEvents,
  groupTimelineEvents,
} from '../src/services/financial-timeline';
import {
  backup,
  parseBackup,
  validateData,
  resetData,
  save,
  STORAGE_KEY,
} from '../src/services/storage';
import { validateReporting } from '../src/services/reporting-state';
import { decode } from '../src/services/cloud-codec';
import { fingerprint, resolveInitialSync } from '../src/services/sync-core';
const options = {
  at: '2026-09-25',
  generatedAt: '2026-09-25T12:00:00.000Z',
  inflation: [{ month: '2026-08', percent: 0.5 }],
  allowPartial: true,
};
function fixture(): Data {
  const d = defaults();
  d.settings.openingCash = 1000;
  d.bankReceipts = [
    {
      ...emptyRow('bankReceipts'),
      id: 'receipt',
      name: 'Recebimento',
      date: '2026-08-04',
      amountCents: 80000,
      account: 'Conta teste',
    },
  ];
  d.expenses = [
    {
      ...emptyRow('expenses'),
      id: 'expense',
      name: 'Mercado',
      date: '2026-08-05',
      amount: 200,
      category: 'alimentação',
    },
  ];
  return d;
}
void test('fechamento consolida receitas, despesas e caixa sem alterar a origem', async () => {
  const d = fixture(),
    before = JSON.stringify(d),
    s = await buildMonthlySnapshot(d, '2026-08', options);
  assert.equal(s.incomeCents, 80000);
  assert.equal(s.expenseCents, 20000);
  assert.equal(s.openingCashCents, 100000);
  assert.equal(s.closingCashCents, 160000);
  assert.equal(s.netCashFlowCents, 60000);
  assert.equal(s.unexplainedCents, 0);
  assert.equal(JSON.stringify(d), before);
  assert.equal(s.dataCompleteness, 'complete');
});
void test('mês vazio não é base suficiente; mês em andamento não fecha automaticamente', async () => {
  const d = defaults();
  assert.equal(
    (await buildMonthlySnapshot(d, '2026-08', options)).dataCompleteness,
    'insufficient',
  );
  await assert.rejects(closeMonth(d, '2026-09', options), /andamento/);
  await assert.rejects(
    closeMonth(d, '2026-08', { ...options, allowPartial: false }),
    /parciais/,
  );
  assert.equal(d.reporting.closures.length, 0);
});
void test('reabertura e reprocessamento preservam revisões e não mudam lançamentos', async () => {
  const d = await closeMonth(fixture(), '2026-08', options),
    original = JSON.stringify(d.reporting.closures[0].revisions[0]);
  assert.equal(await isMonthStale(d, d.reporting.closures[0]), false);
  await assert.rejects(closeMonth(d, '2026-08', options), /já fechado/);
  const reopened = reopenMonth(d, '2026-08', options.generatedAt);
  assert.equal(reopened.reporting.closures[0].status, 'reopened');
  assert.equal(reopenMonth(reopened, '2026-08', options.generatedAt), reopened);
  const edited = {
    ...reopened,
    expenses: reopened.expenses.map((r) => ({ ...r, amount: 250 })),
  };
  assert.equal(await isMonthStale(edited, edited.reporting.closures[0]), true);
  const reclosed = await closeMonth(edited, '2026-08', options);
  assert.equal(reclosed.reporting.closures[0].revisions.length, 2);
  assert.equal(
    JSON.stringify(reclosed.reporting.closures[0].revisions[0]),
    original,
  );
  const processed = await closeMonth(reclosed, '2026-08', {
    ...options,
    reprocess: true,
  });
  assert.equal(processed.reporting.closures[0].revisions[2].revision, 3);
  assert.equal(
    processed.reporting.closures[0].regeneratedAt,
    options.generatedAt,
  );
});
void test('exclusão de lançamento marca fechamento desatualizado sem apagar snapshot', async () => {
  const d = await closeMonth(fixture(), '2026-08', options),
    deleted = { ...d, expenses: [] };
  assert.equal(await isMonthStale(deleted, d.reporting.closures[0]), true);
  assert.equal(d.reporting.closures[0].revisions[0].expenseCents, 20000);
  const future = {
    ...d,
    expenses: [
      ...d.expenses,
      { ...d.expenses[0], id: 'future', date: '2026-10-01' },
    ],
  };
  assert.equal(await isMonthStale(future, d.reporting.closures[0]), false);
});
void test('round trip de backup, cloud codec, idempotência e reset financeiro', async () => {
  const d = await closeMonth(fixture(), '2026-08', options),
    raw = backup(d),
    restored = parseBackup(raw);
  assert.deepEqual(restored.reporting, d.reporting);
  assert.deepEqual(validateData(restored), restored);
  assert.deepEqual(
    decode({
      data: JSON.parse(raw),
      updated_at: options.generatedAt,
      device_id: 'fixture',
      schema_version: 6,
    }).data.reporting,
    d.reporting,
  );
  assert.deepEqual(resetData(d, 'finance').reporting, { closures: [] });
  assert.deepEqual(resetData(d, 'settings').reporting, d.reporting);
});
void test('migração preserva bytes anteriores antes de gravar e aborta em quota', () => {
  const old: Record<string, unknown> = { ...fixture(), planningVersion: 5 };
  delete old.reporting;
  delete old.reportingVersion;
  const raw = JSON.stringify(old),
    map = new Map([[STORAGE_KEY, raw]]),
    storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
  const migrated = validateData(old);
  assert.deepEqual(migrated.reporting, { closures: [] });
  assert.equal(migrated.reportingVersion, 1);
  assert.equal(migrated.planningVersion, 6);
  assert.throws(() =>
    save(
      {
        ...storage,
        setItem: () => {
          throw Error('quota');
        },
      },
      migrated,
    ),
  );
  assert.equal(map.get(STORAGE_KEY), raw);
  save(storage, migrated);
  assert.equal(map.get('rota-money-before-migration:reporting-v1:guest'), raw);
  assert.throws(() => validateData({ ...migrated, reportingVersion: 2 }));
  assert.throws(() => validateData({ ...migrated, planningVersion: 7 }));
  assert.throws(() =>
    validateData({ ...migrated, reportingVersion: undefined }),
  );
});
void test('snapshot inválido e relações inválidas bloqueiam fechamento', async () => {
  const d = await closeMonth(fixture(), '2026-08', options);
  d.reporting.closures[0].revisions[0].incomeCents = 3;
  assert.throws(() => validateReporting(d.reporting));
  const bad = fixture();
  bad.payments = [
    {
      ...emptyRow('payments'),
      debtId: 'ausente',
      date: '2026-08-10',
      amount: 12,
    },
  ];
  await assert.rejects(closeMonth(bad, '2026-08', options));
});
void test('aporte, retirada e rendimento não viram receita de trabalho ou despesa', async () => {
  const d = fixture();
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'inv',
      name: 'Reserva',
      date: '2026-07-01',
      balance: 500,
    },
  ];
  d.movements = ['aporte', 'retirada', 'rendimento', 'perda'].map(
    (kind, i) => ({
      ...emptyRow('movements'),
      id: 'mov' + i,
      investmentId: 'inv',
      date: '2026-08-10',
      kind,
      amount: [100, 50, 20, 5][i],
    }),
  );
  const s = await buildMonthlySnapshot(d, '2026-08', options);
  assert.equal(s.incomeCents, 80000);
  assert.equal(s.expenseCents, 20000);
  assert.equal(s.investmentContributionsCents, 10000);
  assert.equal(s.investmentWithdrawalsCents, 5000);
  assert.equal(s.investmentReturnCents, 1500);
  assert.equal(s.netWorthCents - s.openingNetWorthCents, 61500);
  assert.equal(s.unexplainedCents, 0);
});
void test('compra de bem não cria patrimônio; retorno inexplicado é mostrado', async () => {
  const d = fixture();
  d.assets = [
    {
      ...emptyRow('assets'),
      id: 'asset',
      name: 'Computador',
      purchaseDate: '2026-08-02',
      cashPurchase: 'sim',
      cashPurchaseCents: 50000,
    },
  ];
  d.assetValuations = [
    {
      ...emptyRow('assetValuations'),
      id: 'valuation',
      assetId: 'asset',
      date: '2026-08-02',
      valueCents: 50000,
    },
  ];
  const s = await buildMonthlySnapshot(d, '2026-08', options);
  assert.equal(s.netWorthCents - s.openingNetWorthCents, 60000);
  assert.equal(s.unexplainedCents, 0);
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'inv',
      name: 'Saldo sem origem',
      date: '2026-08-02',
      balance: 100,
    },
  ];
  const partial = await buildMonthlySnapshot(d, '2026-08', options);
  assert.equal(partial.unexplainedCents, 10000);
  assert.equal(partial.dataCompleteness, 'partial');
});
void test('IPCA mensal composto preserva ausência e não usa taxa de outro mês', async () => {
  const s = await buildMonthlySnapshot(fixture(), '2026-08', options);
  assert.ok(Math.abs(s.inflationRate! - 0.005) < 1e-12);
  assert.equal(s.realNetWorthCents, 159204);
  const missing = await buildMonthlySnapshot(fixture(), '2026-08', {
    ...options,
    inflation: [{ month: '2026-07', percent: 5 }],
  });
  assert.equal(missing.inflationRate, null);
  assert.equal(missing.realNetWorthCents, null);
});
void test('comparações suportam alta, baixa, zero e categoria nova/ausente', async () => {
  const previous = await buildMonthlySnapshot(fixture(), '2026-08', options),
    now = {
      ...previous,
      period: '2026-09',
      incomeCents: 100000,
      expenseCents: 10000,
      categories: { saúde: 10000 },
    };
  const result = compareMonths(now, previous);
  assert.equal(result.metrics[0].absolute, 20000);
  assert.equal(result.metrics[0].percent, 25);
  assert.equal(result.metrics[1].percent, -50);
  assert.equal(
    result.categories.find((r) => r.category === 'saúde')?.status,
    'new',
  );
  assert.equal(
    result.categories.find((r) => r.category === 'alimentação')?.status,
    'absent',
  );
  assert.equal(
    compareMonths(now, { ...previous, incomeCents: 0 }).metrics[0].percent,
    null,
  );
});
void test('média móvel exige 3, 6 ou 12 períodos contínuos, sem preencher ausências', async () => {
  const s = await buildMonthlySnapshot(fixture(), '2026-08', options),
    rows = Array.from({ length: 12 }, (_, i) => ({
      ...s,
      period: shiftPeriod('2026-08', -i),
    }));
  for (const n of [3, 6, 12] as const)
    assert.equal(movingAverage(rows, '2026-08', n)?.incomeCents, 80000);
  assert.equal(
    movingAverage(
      rows.filter((r) => r.period !== '2026-07'),
      '2026-08',
      3,
    ),
    null,
  );
});
void test('ponte não desconta saldo inicial nem inventa juros e conserva centavos', () => {
  const r = explainFinancialChange({
    openingCents: 100000,
    closingCents: 100001,
    incomeCents: 1,
    expenseCents: 0,
    debtPaymentsCents: 0,
    investmentReturnCents: 0,
    assetCashCents: 0,
    assetChangeCents: 0,
    debtBalanceChangeCents: 0,
  });
  assert.equal(r.unexplainedCents, 0);
  assert.equal(
    r.factors.reduce((s, r) => s + r.amountCents, 0),
    1,
  );
});
void test('timeline converte reais, anota conciliação e não duplica pagamentos', () => {
  const d = fixture();
  d.payments = [
    {
      ...emptyRow('payments'),
      id: 'pay',
      debtId: 'debt',
      date: '2026-08-03',
      amount: 500,
    },
  ];
  const transaction = {
    line: 1,
    externalId: 'external',
    date: '2026-08-03',
    description: 'Pagamento',
    normalizedDescription: 'pagamento',
    amountCents: 50000,
    direction: 'debit' as const,
    accountLabel: 'A',
    document: '',
    source: 'ofx' as const,
  };
  d.imports.links = [
    {
      id: 'link',
      sessionId: 'session',
      transaction,
      action: 'matched',
      recordKind: 'payments',
      recordId: 'pay',
      fingerprint: '',
    },
  ];
  d.forecastResolutions = [
    {
      ...emptyRow('forecastResolutions'),
      action: 'vincular',
      recordKind: 'payments',
      recordId: 'pay',
      recurrenceId: 'rule',
      occurrenceDate: '2026-08-03',
    },
  ];
  const rows = generateFinancialTimeline(d, '2026-08');
  assert.equal(rows.filter((r) => r.type === 'debt').length, 1);
  assert.equal(rows.find((r) => r.source === 'payments')?.amountCents, 50000);
  assert.equal(rows.find((r) => r.source === 'payments')?.imported, true);
  assert.equal(rows.find((r) => r.source === 'expenses')?.amountCents, 20000);
  assert.equal(filterTimelineEvents(rows, 'Importados').length, 1);
  assert.equal(rows[0].date, '2026-08-05');
  assert.match(rows.find((r) => r.type === 'debt')!.reference, /recorrência/);
});
void test('timeline mantém transferências e avaliações neutras, busca e agrupamento', () => {
  const d = fixture();
  d.movements = [
    {
      ...emptyRow('movements'),
      id: 'm',
      investmentId: 'i',
      date: '2026-08-01',
      kind: 'rendimento',
      amount: 10,
    },
  ];
  d.assetValuations = [
    {
      ...emptyRow('assetValuations'),
      id: 'v',
      assetId: 'a',
      date: '2026-08-02',
      valueCents: 50000,
    },
  ];
  d.fund = [{ ...emptyRow('fund'), id: 'f', date: '2026-08-03', amount: 30 }];
  const rows = generateFinancialTimeline(d);
  assert.equal(rows.find((r) => r.source === 'fund')?.direction, 'neutral');
  assert.equal(
    rows.find((r) => r.source === 'assetValuations')?.direction,
    'neutral',
  );
  assert.equal(
    rows.find((r) => r.source === 'movements')?.direction,
    'neutral',
  );
  assert.equal(filterTimelineEvents(rows, 'Saídas', 'mercado').length, 1);
  assert.equal(groupTimelineEvents(rows, 'month').size, 1);
});
void test('100 mil eventos têm IDs estáveis e janela limitada a 30 registros', () => {
  const d = defaults();
  d.bankReceipts = Array.from({ length: 100000 }, (_, i) => ({
    id: String(i),
    name: 'Evento ' + i,
    date: '2026-08-01',
    amountCents: 1,
    account: 'Teste',
  }));
  const rows = generateFinancialTimeline(d);
  assert.equal(rows.length, 100000);
  assert.equal(new Set(rows.map((r) => r.id)).size, 100000);
  assert.equal(timelineWindow(rows, 0).rows.length, 30);
  assert.equal(timelineWindow(rows, 999999).rows.length, 10);
  assert.equal(
    filterTimelineEvents(rows, 'Entradas', 'Evento 99999').length,
    1,
  );
});
void test('dívida paga e manutenção aparecem uma vez; juros desconhecidos continuam null', async () => {
  const d = fixture();
  d.bike.km = 100;
  d.debts = [
    {
      ...emptyRow('debts'),
      id: 'debt',
      name: 'Dívida',
      totalInstallments: 10,
      installmentAmount: 100,
      balance: 1000,
      paidInstallments: 0,
      due: '2026-08-10',
    },
  ];
  d.payments = [
    {
      ...emptyRow('payments'),
      id: 'payment',
      debtId: 'debt',
      date: '2026-08-10',
      amount: 100,
      installments: 1,
    },
  ];
  d.services = [
    {
      ...emptyRow('services'),
      id: 'service',
      maintenanceId: d.maintenance[0].id,
      date: '2026-08-11',
      km: 100,
      amount: 25,
    },
  ];
  const s = await buildMonthlySnapshot(d, '2026-08', options);
  assert.equal(s.debtPaymentsCents, 10000);
  assert.equal(s.expenseCents, 22500);
  assert.equal(s.maintenanceCents, 2500);
  assert.equal(s.debtInterestCents, null);
  assert.equal(s.debtPrincipalReductionCents, null);
  assert.equal(s.unexplainedCents, 0);
});
void test('juros identificados usam somente evidência explícita vinculada ao pagamento', async () => {
  const d = fixture();
  d.debts = [
    {
      ...emptyRow('debts'),
      id: 'debt',
      name: 'Dívida',
      totalInstallments: 10,
      installmentAmount: 100,
      balance: 1000,
      paidInstallments: 0,
      due: '2026-08-10',
    },
  ];
  d.payments = [
    {
      ...emptyRow('payments'),
      id: 'payment',
      debtId: 'debt',
      date: '2026-08-10',
      amount: 100,
      installments: 1,
    },
  ];
  d.assets = [
    {
      ...emptyRow('assets'),
      id: 'asset',
      name: 'Bem',
      financingDebtId: 'debt',
    },
  ];
  d.assetCostLinks = [
    {
      ...emptyRow('assetCostLinks'),
      id: 'interest',
      assetId: 'asset',
      recordKind: 'payments',
      recordId: 'payment',
      category: 'juros',
      interestCents: 1200,
    },
  ];
  const s = await buildMonthlySnapshot(d, '2026-08', options);
  assert.equal(s.debtInterestCents, 1200);
  assert.equal(s.debtPrincipalReductionCents, 8800);
  assert.equal(s.dataCompleteness, 'partial');
});
void test('orçamento, reserva e trabalho conservam metas estimadas e nulos sem base', async () => {
  const d = fixture();
  d.budgets = [
    {
      ...emptyRow('budgets'),
      id: 'b',
      category: 'alimentação',
      limitCents: 10000,
      enabled: 'sim',
    },
  ];
  d.work = [
    {
      ...emptyRow('work'),
      id: 'w',
      activity: 'Uber',
      date: '2026-08-12',
      hours: 2,
      km: 10,
      revenue: 150,
      actualRevenue: 150,
    },
  ];
  const s = await buildMonthlySnapshot(d, '2026-08', options);
  assert.equal(s.workSummary.days, 1);
  assert.equal(s.workSummary.dailyCents, 15000);
  assert.equal(s.workSummary.realizedCents, 15000);
  assert.equal(s.budgetSummary[0].status, 'over_budget');
  assert.ok(s.warnings.some((w) => w.includes('reconstruídas')));
});
void test('revisões concorrentes usam conflito existente, sem merge silencioso', async () => {
  const base = fixture(),
    a = await closeMonth(base, '2026-08', options),
    b = await closeMonth({ ...base, expenses: [] }, '2026-08', options);
  assert.equal(
    resolveInitialSync(
      a,
      { data: b, updated_at: options.generatedAt, device_id: 'outro' },
      fingerprint(base),
    ),
    'conflict',
  );
});
void test('totais adulterados, revisão duplicada e assinatura inválida são rejeitados', async () => {
  const d = await closeMonth(fixture(), '2026-08', options);
  for (const mutate of [
    (x: Data) => {
      x.reporting.closures[0].revisions[0].bridge[0].amountCents++;
    },
    (x: Data) => {
      x.reporting.closures[0].revisions[0].categories.alimentação++;
    },
    (x: Data) => {
      x.reporting.closures[0].revisions[0].sourceSignature = 'invalid';
    },
    (x: Data) => {
      x.reporting.closures[0].revisions.push(
        x.reporting.closures[0].revisions[0],
      );
    },
  ]) {
    const copy = structuredClone(d);
    mutate(copy);
    assert.throws(() => validateData(copy));
  }
});
