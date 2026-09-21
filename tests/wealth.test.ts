import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow, type Row, type Collection } from '../src/model';
import {
  assetRows,
  assetValues,
  updateBikeAsset,
  BIKE_ASSET_ID,
} from '../src/services/assets';
import {
  calculateNetWorth,
  createNetWorthSnapshot,
  calculateNetWorthChange,
} from '../src/services/net-worth';
import { calculateDepreciation } from '../src/services/depreciation';
import { calculateOwnershipCost } from '../src/services/ownership-cost';
import {
  backup,
  parseBackup,
  validateData,
  upsert,
  remove,
  resetData,
  save,
  STORAGE_KEY,
} from '../src/services/storage';
import { decode } from '../src/services/cloud-codec';
import { financial, costs } from '../src/calculations';
const at = '2026-09-20';
void test('gasto profissional fora da classificação da moto não recebe combustível duplicado', () => {
  const d = defaults();
  d.bike = { ...d.bike, km: 1000 };
  d.work = [
    row('work', {
      date: at,
      activity: 'Uber',
      revenue: 300,
      km: 100,
      hours: 5,
    }),
  ];
  d.expenses = [
    row('expenses', {
      name: 'Abastecimento registrado',
      date: at,
      amount: 50,
      scope: 'trabalho',
      allocation: 'geral',
    }),
  ];
  const result = calculateOwnershipCost(d, BIKE_ASSET_ID, at)!;
  assert.equal(result.work!.cashProfit, 250);
  assert.equal(result.operationalWorkCents, null);
  assert.equal(result.fuelGapCents, null);
});
void test('ponte patrimonial não duplica caixa negativo e detalha avaliação', () => {
  let d = defaults();
  d.settings.openingCash = -100;
  const before = createNetWorthSnapshot(d, '2026-08-31');
  d.settings.openingCash = -200;
  let change = calculateNetWorthChange(
    d,
    before,
    createNetWorthSnapshot(d, at),
  );
  assert.equal(change.deltaCents, -10000);
  assert.equal(change.unexplainedCents, 0);
  assert.equal(change.debtReductionCents, 0);
  d = upsert(d, 'assets', asset());
  d = upsert(
    d,
    'assetValuations',
    assessment({ date: '2026-08-01', valueCents: 2000000 }),
  );
  const old = createNetWorthSnapshot(d, '2026-08-31');
  d = upsert(
    d,
    'assetValuations',
    assessment({ id: 'second', valueCents: 1700000 }),
  );
  change = calculateNetWorthChange(d, old, createNetWorthSnapshot(d, at));
  assert.equal(change.valuationChangeCents, -300000);
  assert.equal(change.addedAssetsCents, 0);
});
void test('reset repetido de Moto preserva valores legados e identidades distintas', () => {
  let d = defaults();
  d.bike = { ...d.bike, currentValue: 17000, km: 1000 };
  d = resetData(d, 'bike');
  assert.equal(calculateNetWorth(d, at).assetsCents, 0); // Captured today, never backdated.
  assert.equal(d.assetValuations[0].valueCents, 1700000);
  d.bike = { ...d.bike, currentValue: 15000, km: 1000 };
  d = resetData(d, 'bike');
  assert.equal(new Set(d.assets.map((r) => r.id)).size, 2);
  assert.doesNotThrow(() => validateData(d));
});
void test('snapshot rejeita detalhamento inconsistente e suporta IDs especiais', () => {
  let d = defaults();
  d = upsert(d, 'assets', asset({ id: '__proto__' }));
  d = upsert(d, 'assetValuations', assessment({ assetId: '__proto__' }));
  const snapshot = createNetWorthSnapshot(d, at);
  assert.doesNotThrow(() => upsert(d, 'netWorthSnapshots', snapshot));
  assert.equal(
    JSON.parse(String(snapshot.positions)).assets.__proto__,
    1700000,
  );
  assert.throws(
    () =>
      upsert(d, 'netWorthSnapshots', {
        ...snapshot,
        positions: '{"assets":{},"debts":{},"investments":{}}',
      }),
    /Detalhamento/,
  );
});
const row = (key: Collection, values: Partial<Row> = {}): Row => ({
  ...emptyRow(key),
  id: 'r',
  ...values,
});
const asset = (values: Partial<Row> = {}) =>
  row('assets', {
    name: 'Bem',
    type: 'other',
    purchaseDate: '2026-01-01',
    purchasePriceCents: 2000000,
    ...values,
  });
const assessment = (values: Partial<Row> = {}) =>
  row('assetValuations', {
    assetId: 'r',
    date: at,
    valueCents: 1700000,
    sequence: 1,
    ...values,
  });
void test('patrimônio zero não inventa propriedade da moto padrão', () => {
  const result = calculateNetWorth(defaults(), at);
  assert.equal(result.netCents, 0);
  assert.equal(result.assets.length, 0);
  assert.equal(result.liabilitiesCents, 0);
});
void test('caixa negativo é passivo sem ser contado duas vezes', () => {
  const d = defaults();
  d.settings.openingCash = -100;
  const result = calculateNetWorth(d, at);
  assert.equal(result.grossCents, 0);
  assert.equal(result.liabilitiesCents, 10000);
  assert.equal(result.netCents, -10000);
  assert.doesNotThrow(() =>
    upsert(d, 'netWorthSnapshots', createNetWorthSnapshot(d, at)),
  );
});
void test('reserva, plano e fundo não criam ativos; liquidez permanece explícita', () => {
  const d = defaults();
  d.settings.openingCash = 1000;
  d.investments = [
    row('investments', {
      name: 'CDB',
      date: '2026-01-01',
      balance: 2000,
      liquidity: 'D+1',
    }),
  ];
  d.reserveAllocations = [
    row('reserveAllocations', { investmentId: 'r', liquidity: 'não imediata' }),
  ];
  d.plans = [row('plans', { name: 'Objetivo', current: 700 })];
  d.fund = [row('fund', { amount: 200, date: at })];
  const result = calculateNetWorth(d, at);
  assert.equal(result.netCents, 300000);
  assert.equal(result.reserveCents, 200000);
  assert.equal(result.liquidity.short_term, 200000);
  d.investments[0].liquidity = 'não informado';
  assert.equal(calculateNetWorth(d, at).liquidity.unknown, 200000);
});
void test('bem sem valor não vira zero; zero informado é válido e avaliação futura não é realizada', () => {
  let d = defaults();
  d = upsert(d, 'assets', asset());
  assert.equal(calculateNetWorth(d, at).missingValues, 1);
  d = upsert(d, 'assetValuations', assessment({ valueCents: 0 }));
  assert.equal(calculateNetWorth(d, at).partial, false);
  assert.equal(assetValues(d, at)[0].valueCents, 0);
  assert.throws(
    () => upsert(d, 'assetValuations', assessment({ date: '2099-01-01' })),
    /futura/,
  );
  assert.throws(
    () => upsert(d, 'assetValuations', assessment({ date: '2025-01-01' })),
    /período/,
  );
});
void test('edição de avaliação antiga preserva ponto posterior; excluir reverte ao último ponto conhecido', () => {
  let d = defaults();
  d.assets = [asset()];
  d = upsert(
    d,
    'assetValuations',
    assessment({ id: 'a', date: '2026-02-01', valueCents: 1900000 }),
  );
  d = upsert(
    d,
    'assetValuations',
    assessment({ id: 'b', valueCents: 1700000 }),
  );
  d = upsert(d, 'assetValuations', {
    ...d.assetValuations[0],
    valueCents: 1800000,
  });
  assert.equal(assetValues(d, at)[0].valueCents, 1700000);
  d = remove(d, 'assetValuations', 'b');
  assert.equal(assetValues(d, at)[0].valueCents, 1800000);
  assert.equal(assetValues(d, '2026-01-02')[0].valueCents, null);
});
void test('estimativa não substitui avaliação real silenciosamente', () => {
  const d = defaults();
  d.assets = [asset()];
  d.assetValuations = [
    assessment({ date: '2026-02-01', valueCents: 1800000 }),
    assessment({
      id: 'estimate',
      source: 'estimated',
      valueCents: 1500000,
      sequence: 2,
    }),
  ];
  assert.equal(assetValues(d, at)[0].valueCents, 1800000);
});
void test('moto é um vínculo estável; edições dos dois domínios preservam histórico', () => {
  let d = defaults();
  d.bike = {
    ...d.bike,
    purchaseDate: '2026-01-01',
    purchaseValue: 20000,
    currentValue: 18000,
    km: 1000,
  };
  assert.equal(assetRows(d).filter((r) => r.linkedBike).length, 1);
  d = updateBikeAsset(d, { ...d.bike, currentValue: 17200 }, at);
  assert.equal(d.assetValuations.length, 2);
  assert.equal(assetValues(d, at)[0].valueCents, 1720000);
  d = upsert(
    d,
    'assetValuations',
    assessment({ id: 'third', assetId: BIKE_ASSET_ID, valueCents: 1700000 }),
  );
  assert.equal(d.bike.currentValue, 17000);
  assert.equal(assetRows(d).length, 1);
  d = remove(d, 'assetValuations', 'third');
  assert.equal(d.bike.currentValue, 17200);
  assert.equal(assetValues(d, '2026-09-19')[0].valueCents, null);
  assert.deepEqual(validateData(validateData(d)), validateData(d));
});
for (const [purchase, current, loss, percent] of [
  [2000000, 1700000, 300000, 15],
  [2000000, 2200000, -200000, -10],
  [0, 0, 0, null],
] as const)
  void test(`depreciação ${purchase} → ${current}`, () => {
    const result = calculateDepreciation(
      purchase,
      current,
      '2026-01-01',
      '2026-07-01',
      0.05,
    );
    assert.equal(result.nominalCents, loss);
    assert.equal(result.percent, percent);
    assert.equal(result.realCents, Math.round(purchase * 1.05) - current);
    if (purchase > 0) {
      assert.ok(Number.isFinite(result.annualPercent));
      assert.ok(Number.isFinite(result.monthlyCents));
    }
  });
void test('depreciação incompleta ou sem intervalo não fabrica taxas', () => {
  assert.equal(calculateDepreciation(null, 1700000, '', '').nominalCents, null);
  assert.equal(calculateDepreciation(2000000, null, '', '').nominalCents, null);
  assert.equal(
    calculateDepreciation(2000000, 1700000, at, at).annualPercent,
    null,
  );
});
void test('compra com caixa transforma patrimônio; venda reconhece somente ganho/perda', () => {
  let d = defaults();
  d.settings.openingCash = 20000;
  const before = calculateNetWorth(d, at).netCents;
  d = upsert(
    d,
    'assets',
    asset({ cashPurchase: 'sim', cashPurchaseCents: 2000000 }),
  );
  d = upsert(d, 'assetValuations', assessment({ valueCents: 2000000 }));
  assert.equal(financial(d, at).cash, 0);
  assert.equal(calculateNetWorth(d, at).netCents, before);
  d = upsert(d, 'assets', {
    ...d.assets[0],
    active: 'não',
    soldAt: at,
    saleValueCents: 1700000,
    cashSale: 'sim',
  });
  assert.equal(calculateNetWorth(d, at).netCents, 1700000);
  assert.equal(d.assetValuations.length, 1);
});
void test('financiamento: 50 mil menos 30 mil = 20 mil; quitação preserva ativo', () => {
  let d = defaults();
  d.debts = [
    row('debts', {
      name: 'Financiamento',
      totalInstallments: 10,
      installmentAmount: 3000,
      paidInstallments: 0,
      due: '2026-09-01',
    }),
  ];
  d = upsert(
    d,
    'assets',
    asset({ purchasePriceCents: 5000000, financingDebtId: 'r' }),
  );
  d = upsert(d, 'assetValuations', assessment({ valueCents: 5000000 }));
  assert.equal(calculateNetWorth(d, at).netCents, 2000000);
  d.debts[0].status = 'quitada';
  assert.equal(calculateNetWorth(d, at).netCents, 5000000);
  d = remove(d, 'debts', 'r');
  assert.equal(d.assets[0].financingDebtId, '');
});
void test('custo da moto: caixa, aquisição, previsões, manutenção e depreciação não se duplicam', () => {
  const d = defaults();
  d.bike = {
    ...d.bike,
    purchaseDate: '2026-01-01',
    purchaseValue: 20000,
    currentValue: 17000,
    km: 1000,
    purchaseKm: 0,
  };
  d.expenses = [
    'combustível',
    'seguro',
    'IPVA',
    'licenciamento',
    'documentação',
  ].map((category, i) =>
    row('expenses', {
      id: String(i),
      name: category,
      date: at,
      category: 'moto',
      amount: 100,
    }),
  );
  d.assetCostLinks = d.expenses.map((r, i) =>
    row('assetCostLinks', {
      id: String(i),
      assetId: BIKE_ASSET_ID,
      recordKind: 'expenses',
      recordId: r.id,
      category: [
        'combustível',
        'seguro',
        'IPVA',
        'licenciamento',
        'documentação',
      ][i],
    }),
  );
  d.services = [
    row('services', {
      maintenanceId: d.maintenance[0].id,
      date: at,
      km: 1000,
      amount: 500,
    }),
  ];
  d.costs = [row('costs', { name: 'Previsão', amount: 999, lifeKm: 10000 })];
  const result = calculateOwnershipCost(d, BIKE_ASSET_ID, at)!;
  assert.equal(result.cashCents, 100000);
  assert.equal(result.economicCents, 400000);
  assert.equal(result.cashPerKm, 1);
  assert.equal(result.economicPerKm, 4);
  assert.equal(result.monthCents, 100000);
  assert.equal(result.last12Cents, 100000);
  assert.ok(result.monthlyCents! > 0);
  assert.ok(result.annualizedCents! > result.monthlyCents!);
  d.assetCostLinks[0].category = 'aquisição';
  assert.equal(calculateOwnershipCost(d, BIKE_ASSET_ID, at)!.cashCents, 90000);
  const original = costs(d);
  calculateOwnershipCost(d, BIKE_ASSET_ID, at);
  assert.deepEqual(costs(d), original);
});
void test('juros de financiamento exigem parcela explícita; vínculo não duplica serviço', () => {
  let d = defaults();
  d.bike = { ...d.bike, km: 1000 };
  d.debts = [
    row('debts', { name: 'Dívida', balance: 1000, installmentAmount: 100 }),
  ];
  d.payments = [row('payments', { debtId: 'r', date: at, amount: 100 })];
  assert.throws(
    () =>
      upsert(
        d,
        'assetCostLinks',
        row('assetCostLinks', {
          assetId: BIKE_ASSET_ID,
          recordKind: 'payments',
          recordId: 'r',
          category: 'juros',
        }),
      ),
    /juros/,
  );
  d = upsert(
    d,
    'assetCostLinks',
    row('assetCostLinks', {
      assetId: BIKE_ASSET_ID,
      recordKind: 'payments',
      recordId: 'r',
      category: 'juros',
      interestCents: 1000,
    }),
  );
  assert.equal(calculateOwnershipCost(d, BIKE_ASSET_ID, at)!.cashCents, 1000);
  assert.throws(
    () => upsert(d, 'assetCostLinks', { ...d.assetCostLinks[0], id: 'dup' }),
    /vinculado/,
  );
});
void test('snapshots são imutáveis; aporte interno não vira rendimento', () => {
  let d = defaults();
  d.settings.openingCash = 1000;
  d.investments = [
    row('investments', {
      name: 'Investimento',
      date: '2026-01-01',
      balance: 0,
    }),
  ];
  const before = createNetWorthSnapshot(d, '2026-08-31');
  d = upsert(d, 'netWorthSnapshots', before);
  d.movements = [
    row('movements', {
      investmentId: 'r',
      date: '2026-09-01',
      amount: 500,
      kind: 'aporte',
    }),
  ];
  const after = createNetWorthSnapshot(d, at),
    change = calculateNetWorthChange(d, before, after, 0.01);
  assert.equal(change.deltaCents, 0);
  assert.equal(change.internalFlowsCents, 50000);
  assert.equal(change.cashChangeCents, -50000);
  assert.equal(change.returnsCents, 0);
  assert.equal(change.unexplainedCents, 0);
  assert.ok(change.realPercent! < 0);
  assert.throws(() => upsert(d, 'netWorthSnapshots', before), /imutável/);
  assert.equal(d.netWorthSnapshots[0].cashCents, 100000);
});
void test('reset patrimônio preserva Moto; reset Moto preserva bem e histórico sem órfãos', () => {
  let d = defaults();
  d.bike = {
    ...d.bike,
    purchaseValue: 20000,
    currentValue: 17000,
    purchaseDate: '2026-01-01',
    km: 1000,
  };
  d = upsert(d, 'assetValuations', assessment({ assetId: BIKE_ASSET_ID }));
  const wealthReset = resetData(d, 'wealth');
  assert.equal(wealthReset.bike.currentValue, 17000);
  assert.equal(assetRows(wealthReset).length, 1);
  const bikeReset = resetData(d, 'bike');
  assert.doesNotThrow(() => validateData(bikeReset));
  assert.equal(assetRows(bikeReset).length, 1);
  assert.equal(bikeReset.assets[0].linkedBike, '');
  assert.equal(bikeReset.assetValuations[0].assetId, bikeReset.assets[0].id);
});
void test('migração aditiva e backup/nuvem preservam centavos, snapshot e cópia exata', () => {
  let d = defaults();
  d = upsert(d, 'assets', asset());
  d = upsert(d, 'assetValuations', assessment());
  d = upsert(d, 'netWorthSnapshots', createNetWorthSnapshot(d, at));
  assert.deepEqual(parseBackup(backup(d)), d);
  assert.deepEqual(
    decode({
      data: JSON.parse(backup(d)),
      schema_version: 6,
      updated_at: 'revision',
      device_id: 'device',
    }).data,
    d,
  );
  const old = JSON.parse(backup(defaults())).data;
  old.planningVersion = 3;
  delete old.assetVersion;
  for (const key of [
    'assets',
    'assetValuations',
    'assetCostLinks',
    'netWorthSnapshots',
  ])
    delete old[key];
  const raw = JSON.stringify(old),
    entries = new Map([[STORAGE_KEY, raw]]),
    store = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    };
  const migrated = parseBackup(raw);
  save(store, migrated);
  save(store, migrated);
  assert.equal(entries.get('rota-money-before-migration:assets-v1:guest'), raw);
  assert.equal(migrated.assetVersion, 1);
  entries.set(STORAGE_KEY, JSON.stringify({ ...old, assetVersion: 2 }));
  assert.throws(() => save(store, d), /versão mais recente/);
});
void test('500 bens, 1.000 avaliações e 10.000 movimentações usam índices', (t) => {
  const d = defaults();
  d.assets = Array.from({ length: 500 }, (_, i) => asset({ id: String(i) }));
  d.assetValuations = Array.from({ length: 1000 }, (_, i) =>
    assessment({
      id: String(i),
      assetId: String(i % 500),
      sequence: i,
      valueCents: 10000,
    }),
  );
  d.investments = Array.from({ length: 100 }, (_, i) =>
    row('investments', { id: String(i), date: '2026-01-01', balance: 1000 }),
  );
  d.movements = Array.from({ length: 10000 }, (_, i) =>
    row('movements', {
      id: String(i),
      investmentId: String(i % 100),
      date: at,
      amount: 1,
      kind: 'aporte',
    }),
  );
  const start = performance.now(),
    result = calculateNetWorth(d, at),
    elapsed = performance.now() - start;
  assert.equal(result.assetsCents, 5000000);
  assert.equal(result.investmentsCents, 11000000);
  assert.ok(elapsed < 2000);
  t.diagnostic(`Patrimônio: ${elapsed.toFixed(1)} ms`);
});
