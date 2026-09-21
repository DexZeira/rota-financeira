import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow, type Collection, type Row } from '../src/model';
import {
  calculateBudgetStatus,
  calculateBudgets,
  projectSpending,
  monthContext,
} from '../src/services/budget';
import {
  calculateDynamicTarget,
  workingDates,
} from '../src/services/dynamic-target';
import { calculateCostOfLiving } from '../src/services/cost-of-living';
import {
  calculateEmergencyFund,
  emergencyScenario,
} from '../src/services/emergency-fund';
import { planningPhaseTwo } from '../src/services/planning-phase-two';
import {
  backup,
  parseBackup,
  upsert,
  remove,
  resetData,
  save,
  STORAGE_KEY,
} from '../src/services/storage';
import { decode } from '../src/services/cloud-codec';
import type { InflationHistory } from '../src/services/inflation-indicators';
const row = (kind: Collection, values: Partial<Row>): Row => ({
  ...emptyRow(kind),
  id: 'r',
  ...values,
});
const at = '2026-09-15';
void test('gasto datado no futuro é conhecido; substitui estimativa legada e vira realizado uma única vez', () => {
  const d = fixture();
  d.expenses = [
    row('expenses', {
      name: 'Comida',
      category: 'alimentação',
      amount: 100,
      date: '2026-08-20',
      recurrence: 'mensal',
    }),
    row('expenses', {
      id: 'next',
      name: 'Comida',
      category: 'alimentação',
      amount: 120,
      date: '2026-09-20',
      recurrence: 'mensal',
    }),
  ];
  const before = calculateBudgets(d, projectSpending(d, at));
  assert.equal(before.actualCents, 0);
  assert.equal(before.knownCents, 12000);
  assert.equal(before.projectedCents, 12000);
  const after = calculateBudgets(d, projectSpending(d, '2026-09-20'));
  assert.equal(after.actualCents, 12000);
  assert.equal(after.knownCents, 0);
  assert.equal(after.projectedCents, 12000);
  for (const expense of d.expenses) expense.scope = 'trabalho';
  const target = calculateDynamicTarget(d, at);
  assert.equal(target.components.expenses, 0);
  assert.equal(target.components.operating, 12000);
});
for (const selected of ['minimum', 'ideal', 'accelerated'] as const)
  void test(`meta dinâmica respeita seleção existente: ${selected}`, () => {
    const d = fixture();
    d.settings.essential = 1000;
    d.settings.defaultTarget = selected;
    const result = calculateDynamicTarget(d, at);
    assert.equal(result.todayCents, result[`${selected}Cents`]);
  });
void test('custo real usa composição e somente IPCA posterior ao mês-base; lacuna não vira zero', () => {
  const d = defaults();
  d.expenses = [
    row('expenses', {
      name: 'Vida',
      date: '2026-07-10',
      amount: 100,
      essentiality: 'essencial',
    }),
    row('expenses', {
      id: 'b',
      name: 'Vida',
      date: '2026-08-10',
      amount: 108,
      essentiality: 'essencial',
    }),
  ];
  const inflation: InflationHistory = {
    months: [
      { month: '2026-07', percent: 99 },
      { month: '2026-08', percent: 4.5 },
    ],
    latest: {
      value: 4.5,
      unit: '%',
      source: 'fixture',
      referenceDate: '2026-08-01',
      fetchedAt: null,
      status: 'actual',
    },
  };
  const result = calculateCostOfLiving(d, at, inflation);
  assert.ok(Math.abs(result.inflation! - 0.045) < 1e-10);
  assert.ok(Math.abs(result.realChange! - (1.08 / 1.045 - 1)) < 1e-10);
  inflation.months = [];
  assert.equal(calculateCostOfLiving(d, at, inflation).realChange, null);
});
void test('recorrência essencial conhecida entra no custo sem duplicar histórico; classificação continua explícita', () => {
  const d = defaults();
  d.categoryPolicies = [
    row('categoryPolicies', { category: 'moradia', level: 'essencial' }),
  ];
  d.expenses = [
    row('expenses', {
      name: 'Aluguel',
      category: 'moradia',
      date: '2026-08-20',
      amount: 100,
      recurrence: 'mensal',
    }),
  ];
  assert.equal(calculateCostOfLiving(d, at).minimumCents, 10000);
  const spending = projectSpending(d, at).categories[0];
  assert.equal(spending.knownCents, 0);
  assert.equal(spending.recurringEstimateCents, 10000);
  d.recurrences = [
    row('recurrences', {
      name: 'Aluguel',
      category: 'moradia',
      sourceKind: 'expenses',
      sourceId: 'r',
      amount: 120,
      startDate: '2026-09-20',
      frequency: 'mensal',
    }),
  ];
  assert.equal(calculateCostOfLiving(d, at).minimumCents, 12000);
});
void test('reserva opcional não entra na mínima; aportes são um único envelope', () => {
  const d = fixture();
  d.settings.essential = 100;
  d.settings.reserveMonth = 300;
  d.planningSettings[0].emergencyContributionCents = 20000;
  const result = calculateDynamicTarget(d, at);
  assert.equal(result.minimumMonthlyCents, 10000);
  assert.equal(result.components.aportes, 30000);
  assert.equal(calculateCostOfLiving(d, at).comfortableCents, 40000);
});
void test('custos profissionais recorrentes ficam no operacional, sem nova soma como despesa pessoal', () => {
  const d = fixture();
  d.expenses = [
    row('expenses', {
      name: 'Transporte',
      category: 'moto',
      scope: 'trabalho',
      date: '2026-08-20',
      amount: 100,
      recurrence: 'mensal',
    }),
  ];
  const result = calculateDynamicTarget(d, at);
  assert.equal(result.components.expenses, 0);
  assert.equal(result.components.operating, 10000);
  assert.equal(result.minimumMonthlyCents, 10000);
});
void test('recorrência conferida não se repete no orçamento e no forecast derivado', () => {
  const d = fixture();
  d.recurrences = [
    row('recurrences', {
      name: 'Mercado',
      category: 'alimentação',
      amount: 100,
      startDate: at,
      frequency: 'única',
    }),
  ];
  d.expenses = [
    row('expenses', {
      name: 'Mercado',
      category: 'alimentação',
      amount: 100,
      date: at,
    }),
  ];
  d.forecastResolutions = [
    row('forecastResolutions', {
      recurrenceId: 'r',
      occurrenceDate: at,
      action: 'vincular',
      recordKind: 'expenses',
      recordId: 'r',
    }),
  ];
  const budget = calculateBudgets(d, projectSpending(d, at));
  assert.equal(budget.actualCents, 10000);
  assert.equal(budget.knownCents, 0);
  assert.equal(budget.projectedCents, 10000);
});
void test('sazonalidade exige dois anos do mesmo mês e três meses recentes', () => {
  const d = fixture();
  d.expenses = ['2024-09', '2025-09', '2026-06', '2026-07', '2026-08'].map(
    (month) =>
      row('expenses', {
        id: month,
        name: 'Comida',
        category: 'alimentação',
        date: month + '-01',
        amount: 300,
      }),
  );
  assert.equal(projectSpending(d, at).categories[0].seasonal, true);
  d.expenses.shift();
  assert.equal(projectSpending(d, at).categories[0].seasonal, false);
});
function fixture() {
  const d = defaults();
  d.planningSettings = [
    row('planningSettings', {
      scheduleEnabled: 'sim',
      workWeekdays: 'seg,ter,qua,qui,sex,sab,dom',
    }),
  ];
  d.budgets = [row('budgets', { category: 'alimentação', limitCents: 70000 })];
  return d;
}
for (const [spent, limit, expected] of [
  [0, 0, 'normal'],
  [1, 0, 'over_budget'],
  [700, 1000, 'normal'],
  [701, 1000, 'attention'],
  [900, 1000, 'near_limit'],
  [1000, 1000, 'near_limit'],
  [1001, 1000, 'over_budget'],
] as const)
  void test(`orçamento ${spent}/${limit}: ${expected}`, () =>
    assert.equal(calculateBudgetStatus(spent, limit), expected));
void test('orçamento separa realizado, conhecido e estimado; não inclui categoria não orçada nos totais', () => {
  const d = fixture();
  d.expenses = [
    row('expenses', {
      name: 'Comida',
      amount: 350,
      category: 'alimentação',
      date: at,
    }),
    row('expenses', {
      id: 'other',
      name: 'Lazer',
      category: 'lazer',
      amount: 50,
      date: at,
    }),
  ];
  d.recurrences = [
    row('recurrences', {
      name: 'Cesta',
      amount: 100,
      category: 'alimentação',
      startDate: '2026-09-20',
      frequency: 'única',
    }),
  ];
  const result = calculateBudgets(d, projectSpending(d, at));
  assert.equal(result.actualCents, 35000);
  assert.equal(result.knownCents, 10000);
  assert.equal(result.projectedCents, 70000);
  assert.equal(result.rows[0].reliable, false);
  d.recurrences[0].amount = null;
  assert.equal(
    calculateBudgets(d, projectSpending(d, at)).projectedCents,
    null,
  );
});
void test('mês curto, virada, histórico robusto e orçamento desligado', () => {
  assert.equal(monthContext('2024-02-29').days, 29);
  assert.equal(monthContext('2026-02-28').days, 28);
  const d = fixture();
  d.budgets[0].enabled = 'não';
  d.expenses = ['06', '07', '08'].map((month, i) =>
    row('expenses', {
      id: month,
      name: 'Comida',
      category: 'alimentação',
      amount: [300, 3000, 300][i],
      date: `2026-${month}-10`,
    }),
  );
  const spending = projectSpending(d, at);
  assert.equal(spending.categories[0].reliable, true);
  assert.ok(spending.categories[0].estimatedCents <= 16000);
  assert.equal(calculateBudgets(d, spending).limitCents, 0);
  assert.equal(projectSpending(d, '2026-10-01').categories[0].actualCents, 0);
});
void test('meta redistribui déficit/excedente sem modificar histórico e não limita necessidade', () => {
  const d = fixture();
  d.settings.essential = 3000;
  const initial = calculateDynamicTarget(d, '2026-09-01');
  const deficit = calculateDynamicTarget(d, at);
  assert.ok(deficit.idealCents! > initial.idealCents!);
  d.work = [row('work', { date: '2026-09-14', revenue: 3200 })];
  const surplus = calculateDynamicTarget(d, at);
  assert.ok(surplus.idealCents! < deficit.idealCents!);
  d.planningSettings[0].maxDailyCents = 100;
  assert.ok(calculateDynamicTarget(d, at).aboveLimitCents > 0);
  assert.equal(d.work[0].revenue, 3200);
});
void test('meta: folgas, último dia, nenhum dia e obrigações novas/removidas', () => {
  const d = fixture();
  d.settings.essential = 100;
  assert.equal(workingDates(d, at).length, 30);
  d.planningSettings[0].daysOff = '2026-09-30';
  assert.equal(calculateDynamicTarget(d, '2026-09-30').idealCents, null);
  d.planningSettings[0].daysOff = '';
  assert.equal(calculateDynamicTarget(d, '2026-09-30').remainingDays, 1);
  const before = calculateDynamicTarget(d, at).minimumCents!;
  d.expenses = [row('expenses', { name: 'Conta', amount: 200, date: at })];
  assert.ok(calculateDynamicTarget(d, at).minimumCents! > before);
  d.expenses = [];
  assert.equal(calculateDynamicTarget(d, at).minimumCents, before);
  d.recurrences = [
    row('recurrences', { name: 'Incerto', amount: null, startDate: at }),
  ];
  assert.equal(calculateDynamicTarget(d, at).partial, true);
});
void test('custo: categorias explícitas, mediana, janela e unidades', () => {
  const d = fixture();
  d.expenses = ['06', '07', '08'].flatMap((month, i) => [
    row('expenses', {
      id: month,
      name: 'Aluguel',
      category: 'moradia',
      date: `2026-${month}-10`,
      amount: [1000, 5000, 1000][i],
    }),
    row('expenses', {
      id: 'n' + month,
      name: 'Conta',
      category: 'internet',
      amount: 100,
      date: `2026-${month}-10`,
    }),
    row('expenses', {
      id: 'l' + month,
      name: 'Cinema',
      category: 'lazer',
      amount: 50,
      date: `2026-${month}-10`,
    }),
  ]);
  d.categoryPolicies = [
    row('categoryPolicies', { category: 'moradia', level: 'essencial' }),
    row('categoryPolicies', { id: 'n', category: 'internet', level: 'normal' }),
    row('categoryPolicies', {
      id: 'l',
      category: 'lazer',
      level: 'discricionária',
    }),
  ];
  const result = calculateCostOfLiving(d, at);
  assert.equal(result.minimumCents, 100000);
  assert.equal(result.normalCents, 110000);
  assert.equal(result.comfortableCents, 115000);
  assert.equal(result.samples, 3);
  assert.equal(result.partial, false);
  assert.equal(result.dailyMinimumCents, 3333);
  d.categoryPolicies[0].level = 'normal';
  assert.equal(calculateCostOfLiving(d, at).minimumCents, 0);
  d.categoryPolicies = [];
  assert.equal(calculateCostOfLiving(d, at).partial, true);
});
for (const months of [3, 6, 12])
  void test(`reserva ${months} meses, marcação explícita e liquidez`, () => {
    const d = fixture();
    d.planningSettings[0].emergencyMonths = months;
    d.expenses = [
      row('expenses', {
        name: 'Vida',
        amount: 1000,
        date: '2026-08-10',
        essentiality: 'essencial',
      }),
    ];
    d.investments = [
      row('investments', {
        name: 'Reserva',
        balance: 2000,
        date: '2026-08-01',
      }),
      row('investments', {
        id: 'other',
        name: 'Outro',
        balance: 8000,
        date: '2026-08-01',
      }),
    ];
    const living = calculateCostOfLiving(d, at);
    assert.equal(calculateEmergencyFund(d, at, living).totalCents, 0);
    d.reserveAllocations = [
      row('reserveAllocations', { investmentId: 'r', liquidity: 'imediata' }),
    ];
    const result = calculateEmergencyFund(d, at, living);
    assert.equal(result.totalCents, 200000);
    assert.equal(result.immediateCoverage, 2);
    assert.equal(result.targetCents, months * 100000);
    d.reserveAllocations[0].liquidity = 'não informada';
    assert.equal(calculateEmergencyFund(d, at, living).immediateCents, 0);
  });
void test('reserva sem custo e cenário não alteram dados', () => {
  const d = fixture(),
    snapshot = JSON.stringify(d);
  assert.equal(
    calculateEmergencyFund(d, at, calculateCostOfLiving(d, at)).coverage,
    null,
  );
  assert.deepEqual(emergencyScenario(600000, 100000, 100000, 50, 100000), {
    before: 6,
    after: 10,
    noDepletion: false,
    afterCents: 500000,
  });
  assert.equal(emergencyScenario(600000, 100000, 100000, 100, 300000).after, 3);
  assert.throws(() => emergencyScenario(0, 0, 0, Infinity, 0));
  assert.equal(JSON.stringify(d), snapshot);
});
void test('v6/p3 roundtrip local/nuvem, migração idempotente com bytes protegidos e versão futura', () => {
  const d = fixture(),
    original = JSON.parse(backup(defaults())).data;
  original.planningVersion = 2;
  for (const key of [
    'budgets',
    'categoryPolicies',
    'planningSettings',
    'reserveAllocations',
  ])
    delete original[key];
  const raw = JSON.stringify(original),
    entries = new Map([[STORAGE_KEY, raw]]);
  const store = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
  const migrated = parseBackup(raw);
  assert.equal(migrated.planningVersion, 3);
  assert.deepEqual(migrated.budgets, []);
  save(store, migrated);
  save(store, migrated);
  assert.equal(
    entries.get('rota-money-before-migration:planning-v3:guest'),
    raw,
  );
  assert.deepEqual(parseBackup(backup(d)), d);
  const encoded = JSON.parse(backup(d));
  assert.equal(encoded.data.budgets[0].limitCents, 70000);
  assert.deepEqual(
    decode({
      data: encoded,
      schema_version: 6,
      updated_at: 'r',
      device_id: 'd',
    }).data,
    d,
  );
  encoded.data.planningVersion = 4;
  entries.set(STORAGE_KEY, JSON.stringify(encoded.data));
  assert.throws(() => save(store, d), /versão mais recente/);
  assert.throws(
    () => parseBackup(JSON.stringify(encoded)),
    /versão mais recente/,
  );
});
void test('validação, duplicados, reset e exclusão de investimento vinculado', () => {
  let d = fixture();
  assert.throws(
    () =>
      upsert(
        d,
        'budgets',
        row('budgets', {
          id: 'other',
          category: ' Alimentação ',
          limitCents: 10,
        }),
      ),
    /Já existe/,
  );
  assert.throws(() =>
    upsert(d, 'budgets', { ...d.budgets[0], limitCents: 1.2 }),
  );
  assert.throws(() =>
    upsert(d, 'budgets', { ...d.budgets[0], nearThresholdPercent: Infinity }),
  );
  d.investments = [row('investments', { name: 'Reserva', date: at })];
  d.reserveAllocations = [row('reserveAllocations', { investmentId: 'r' })];
  d = remove(d, 'investments', 'r');
  assert.deepEqual(d.reserveAllocations, []);
  assert.deepEqual(resetData(d, 'finance').budgets, []);
});
void test('10.000 gastos, 500 recorrências, 100 orçamentos: seleção sem produto cartesiano', (t) => {
  const d = fixture();
  d.expenses = Array.from({ length: 10000 }, (_, i) =>
    row('expenses', {
      id: String(i),
      name: 'Gasto',
      date: '2026-09-01',
      category: 'c' + (i % 100),
      amount: 1,
    }),
  );
  d.budgets = Array.from({ length: 100 }, (_, i) =>
    row('budgets', { id: String(i), category: 'c' + i, limitCents: 10000 }),
  );
  d.recurrences = Array.from({ length: 500 }, (_, i) =>
    row('recurrences', {
      id: String(i),
      name: 'Previsto',
      startDate: '2026-09-20',
      category: 'c' + (i % 100),
      amount: 1,
      frequency: 'única',
    }),
  );
  const start = performance.now(),
    result = planningPhaseTwo(d, at),
    elapsed = performance.now() - start;
  assert.equal(result.budget.rows.length, 100);
  assert.equal(result.budget.actualCents, 1000000);
  assert.ok(elapsed < 5000);
  t.diagnostic(`Phase 2: ${elapsed.toFixed(1)} ms`);
});
