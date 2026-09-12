import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults,
  emptyRow,
  type Row,
  type Collection,
  today,
  validateRow,
} from '../src/model';
import {
  calculateWorkRevenues,
  cardSummary,
  costs,
  filterWork,
  financial,
  maintenanceCosts,
  maintenanceState,
  maintenanceSummary,
  updateCardWork,
  workResult,
} from '../src/calculations';
import {
  backup,
  parseBackup,
  upsert,
  remove,
  load,
  save,
  validateData,
} from '../src/services/storage';
const row = (kind: Collection, extra: Partial<Row>): Row => ({
  ...emptyRow(kind),
  id: kind,
  ...extra,
});
const cards = () =>
  row('work', {
    activity: 'Entrega de cartões',
    cardQuantity: 120,
    cardUnitValue: 1.5,
    revenue: 175,
    hours: 4,
    km: 150,
    date: today(),
  });
void test('cartões: esperado 180, recebido 175 determina caixa e lucro', () => {
  const d = upsert(defaults(), 'work', cards());
  assert.deepEqual(calculateWorkRevenues(d.work[0]), {
    expected: 180,
    actual: 175,
  });
  assert.equal(d.work[0].expectedRevenue, 180);
  assert.equal(financial(d).revenue, 175);
  assert.equal(financial(d).cash, 175);
  assert.equal(workResult(175, 150, 4, 0.08).profit, 163);
  const s = cardSummary(d.work, 0.08);
  assert.equal(s.difference, -5);
  assert.equal(s.cardsHour, 30);
  assert.equal(s.cardsKm, 0.8);
  assert.equal(cardSummary([{ ...cards(), revenue: 180 }], 0).revenueHour, 45);
});
void test('recebido automático, edição manual e recálculo não alteram quantidade/unitário', () => {
  const start = row('work', { activity: 'Entrega de cartões', hours: 4 });
  const auto = updateCardWork(
    start,
    { ...start, cardQuantity: 120, cardUnitValue: 1.5 },
    true,
  );
  assert.equal(auto.revenue, 180);
  const manual = updateCardWork(auto, { ...auto, revenue: 175 }, false);
  const edit = updateCardWork(manual, { ...manual, cardQuantity: 100 }, false);
  assert.equal(edit.expectedRevenue, 150);
  assert.equal(edit.revenue, 175);
  assert.equal(edit.cardUnitValue, 1.5);
  assert.equal(
    calculateWorkRevenues({ ...edit, activity: 'Uber Moto' }).expected,
    null,
  );
  assert.throws(
    () => validateRow('work', { ...cards(), cardQuantity: 1.2 }),
    /inválido/,
  );
});
void test('filtros de atividade, datas e busca alimentam os mesmos indicadores', () => {
  const list = [
    { ...cards(), date: '2026-01-01' },
    { ...cards(), id: 'later', date: '2026-01-03' },
    { ...cards(), id: 'uber', activity: 'Uber Moto', date: '2026-01-03' },
    {
      ...cards(),
      id: 'custom',
      activity: 'Serviço próprio',
      date: '2026-01-03',
    },
  ];
  const selected = filterWork(
    list,
    'Entrega de cartões',
    '2026-01-02',
    '2026-01-03',
  );
  assert.equal(selected.length, 1);
  assert.equal(cardSummary(selected, 0).quantity, 120);
  assert.equal(filterWork(list, 'Serviço próprio').length, 1);
  assert.equal(filterWork(list, 'todos', '', '', 'Uber').length, 1);
  assert.equal(filterWork(list, 'todos', '2026-01-04', '2026-01-01').length, 0);
});
void test('estimado 600/20000 e provisão .08*150 sem criar saída de caixa', () => {
  let d = defaults();
  d.maintenance = [
    row('maintenance', {
      name: 'Pneu traseiro',
      estimated: 600,
      lifeKm: 20000,
    }),
  ];
  assert.equal(maintenanceCosts(d, d.maintenance[0]).estimatedCostPerKm, 0.03);
  assert.equal(maintenanceState(d, d.maintenance[0]).nextKm, 20000);
  d.maintenance.push(
    row('maintenance', {
      id: 'oil',
      name: 'Óleo',
      estimated: 50,
      intervalKm: 1000,
    }),
  );
  d = upsert(d, 'work', cards());
  const before = JSON.stringify(d);
  assert.equal(costs(d).maintenance, 0.08);
  assert.equal(costs(d).operating, 0.08);
  assert.equal(costs(d).economic * 150, 12);
  assert.equal(financial(d).cash, 175);
  assert.equal(d.expenses.length, 0);
  assert.equal(d.services.length, 0);
  assert.equal(JSON.stringify(d), before);
});
void test('real só existe com ciclo encerrado; 630/18000=.035, inclusive custo zero conhecido', () => {
  const d = defaults();
  const item = row('maintenance', {
    name: 'Pneu',
    estimated: 600,
    lifeKm: 20000,
  });
  d.maintenance = [item];
  assert.equal(maintenanceCosts(d, item).actualCostPerKm, null);
  d.services = [
    row('services', {
      maintenanceId: item.id,
      date: '2026-01-01',
      km: 10000,
      amount: 630,
    }),
  ];
  assert.equal(maintenanceCosts(d, item).actualCostPerKm, null);
  d.services.push(
    row('services', {
      id: 'next',
      maintenanceId: item.id,
      date: '2026-02-01',
      km: 28000,
      amount: 700,
    }),
  );
  assert.equal(maintenanceCosts(d, item).actualCostPerKm, 0.035);
  assert.equal(maintenanceCosts(d, item).actualLifeKm, 18000);
  d.services[0].amount = 0;
  assert.equal(maintenanceCosts(d, item).actualCostPerKm, 0);
  d.services[1].km = 10000;
  assert.equal(maintenanceCosts(d, item).actualCostPerKm, null);
});
void test('instalação inicial histórica e resumo real parcial', () => {
  const d = defaults();
  const item = row('maintenance', {
    name: 'Pneu',
    lastDate: '2026-01-01',
    lastKm: 10000,
    value: 630,
    estimated: 600,
    lifeKm: 20000,
  });
  d.maintenance = [item];
  d.services = [
    row('services', {
      maintenanceId: item.id,
      date: '2026-02-01',
      km: 28000,
      amount: 700,
    }),
  ];
  assert.equal(maintenanceCosts(d, item).actualCostPerKm, 0.035);
  d.maintenance.push(
    row('maintenance', {
      id: 'unknown',
      name: 'Óleo',
      estimated: 50,
      lifeKm: 1000,
    }),
  );
  const s = maintenanceSummary(d);
  assert.equal(s.actualCount, 1);
  assert.equal(s.totalActualCostPerKm, 0.035);
  assert.equal(financial(d).spent, 700);
});
void test('previsões iguais/vinculadas substituídas; seguro e documentação preservados', () => {
  let d = defaults();
  d.maintenance = [
    row('maintenance', {
      name: 'Pneu traseiro',
      estimated: 600,
      lifeKm: 20000,
    }),
  ];
  d.costs = [
    row('costs', {
      name: 'PNEU TRASEIRO',
      amount: 650,
      lifeKm: 20000,
      category: 'pneus',
    }),
    row('costs', {
      id: 'insurance',
      name: 'Seguro',
      category: 'seguro',
      amount: 100,
      lifeKm: 10000,
    }),
  ];
  assert.equal(costs(d).maintenance, 0.03);
  assert.equal(costs(d).operating, 0.04);
  assert.equal(costs(d).components.length, 2);
  d.costs[0].name = 'Pneu posterior';
  d.maintenance[0].costId = 'costs';
  assert.equal(costs(d).operating, 0.04);
  assert.throws(
    () =>
      upsert(
        d,
        'maintenance',
        row('maintenance', { id: 'duplicate', name: 'Outro', costId: 'costs' }),
      ),
    /só pode/,
  );
  d = remove(d, 'costs', 'costs');
  assert.equal(d.maintenance[0].costId, '');
});
void test('CRUD, backup e persistência conservam cartões e ciclo de manutenção', () => {
  let d = upsert(defaults(), 'work', cards());
  d.bike.km = 30000;
  const item = row('maintenance', {
    name: 'Pneu',
    estimated: 600,
    lifeKm: 20000,
    lastKm: 10000,
    lastDate: '2026-01-01',
    value: 630,
  });
  d = upsert(d, 'maintenance', item);
  d = upsert(
    d,
    'services',
    row('services', {
      maintenanceId: item.id,
      date: '2026-02-01',
      km: 28000,
      amount: 700,
    }),
  );
  d = upsert(d, 'work', { ...d.work[0], cardQuantity: 100, revenue: 145 });
  assert.equal(d.work[0].expectedRevenue, 150);
  const memory = new Map<string, string>();
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, v);
    },
  };
  save(storage, d);
  assert.deepEqual(load(storage), d);
  assert.deepEqual(parseBackup(backup(d)), d);
  assert.equal(
    maintenanceCosts(parseBackup(backup(d)), item).actualCostPerKm,
    0.035,
  );
  d = remove(d, 'work', 'work');
  assert.equal(financial(d).revenue, 0);
  d = remove(d, 'maintenance', item.id);
  assert.equal(d.services.length, 0);
});
void test('migração v0/v1/v2 idempotente preserva faturamento antigo sem inventar cartões', () => {
  for (const version of [0, 1, 2]) {
    const old = defaults();
    old.dataVersion = version;
    old.work = [
      {
        id: 'old',
        activity: 'Entrega de cartões',
        revenue: 145,
        hours: 4,
        km: 150,
        date: today(),
        notes: '',
      },
    ];
    old.maintenance = [
      { id: 'old-m', name: 'Pneu', estimated: 600, intervalKm: 20000 } as Row,
    ];
    const migrated = validateData(old);
    assert.equal(migrated.dataVersion, 4);
    assert.equal(migrated.work[0].revenue, 145);
    assert.equal(migrated.work[0].cardQuantity, null);
    assert.equal(calculateWorkRevenues(migrated.work[0]).expected, null);
    assert.equal(cardSummary(migrated.work, 0).unknown, 1);
    assert.equal(
      maintenanceCosts(migrated, migrated.maintenance[0]).estimatedCostPerKm,
      0.03,
    );
    assert.deepEqual(validateData(migrated), migrated);
    assert.deepEqual(
      parseBackup(JSON.stringify({ version, data: old })),
      migrated,
    );
  }
});
