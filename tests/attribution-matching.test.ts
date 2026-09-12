import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults,
  emptyRow,
  type Row,
  type Collection,
  today,
} from '../src/model';
import { financial, costs, filterWork } from '../src/calculations';
import { workCashResult } from '../src/work-results';
import { workExpenseAmount } from '../src/expense-allocation';
import {
  normalizeComponentName,
  componentMatches,
} from '../src/component-matching';
import {
  upsert,
  remove,
  save,
  load,
  backup,
  parseBackup,
  validateData,
  resetData,
} from '../src/services/storage';
const row = (key: Collection, props: Partial<Row>): Row => ({
  ...emptyRow(key),
  id: key,
  ...props,
});
function fixture() {
  let d = defaults();
  d.bike = {
    ...d.bike,
    km: 15000,
    purchaseValue: 800,
    currentValue: 0,
    fuelPrice: 6,
    efficiency: 30,
  };
  d.maintenance = [
    row('maintenance', {
      name: 'Pneu traseiro',
      estimated: 800,
      lifeKm: 10000,
    }),
  ];
  d = upsert(
    d,
    'work',
    row('work', {
      activity: 'Entrega de cartões',
      date: today(),
      hours: 4,
      km: 150,
      revenue: 180,
      cardQuantity: 120,
      cardUnitValue: 1.5,
    }),
  );
  return upsert(
    d,
    'expenses',
    row('expenses', {
      name: 'Estacionamento',
      amount: 10,
      date: today(),
      scope: 'trabalho',
      allocation: 'sessão',
      workSessionId: 'work',
    }),
  );
}
void test('180 recebidos - 10 pagos = 170 caixa; -12 provisão =158; -8 depreciação =150', () => {
  const d = fixture(),
    before = JSON.stringify(d),
    r = workCashResult(d, d.work);
  assert.equal(r.realExpenses, 10);
  assert.equal(r.cashProfit, 170);
  assert.equal(r.provisions, 12);
  assert.equal(r.afterProvisions, 158);
  assert.equal(r.depreciation, 8);
  assert.equal(r.economic, 150);
  assert.equal(r.cashHour, 42.5);
  assert.equal(r.cashKm, 170 / 150);
  assert.equal(financial(d).cash, 170);
  assert.equal(financial(d).spent, 10);
  assert.equal(JSON.stringify(d), before);
});
void test('combustível e serviço pagos entram uma vez no caixa, nunca pelo custo/km', () => {
  let d = fixture();
  d = upsert(
    d,
    'expenses',
    row('expenses', {
      id: 'fuel',
      name: 'Combustível',
      amount: 30,
      scope: 'trabalho',
      allocation: 'sessão',
      workSessionId: 'work',
    }),
  );
  d = upsert(
    d,
    'services',
    row('services', {
      maintenanceId: 'maintenance',
      date: today(),
      km: 15000,
      amount: 40,
      scope: 'moto',
      workAmount: 20,
      allocation: 'sessão',
      workSessionId: 'work',
    }),
  );
  assert.equal(workCashResult(d, d.work).realExpenses, 60);
  assert.equal(workCashResult(d, d.work).cashProfit, 120);
  assert.equal(financial(d).spent, 80);
  d.bike.fuelPrice = 60;
  assert.equal(workCashResult(d, d.work).cashProfit, 120);
  assert.equal(workCashResult(d, d.work).afterProvisions, 108);
});
void test('pessoal não é atribuído; compartilhada e moto usam parcela explícita limitada', () => {
  let d = fixture();
  d = upsert(
    d,
    'expenses',
    row('expenses', { id: 'personal', name: 'Pessoal', amount: 100 }),
  );
  d = upsert(
    d,
    'expenses',
    row('expenses', {
      id: 'shared',
      name: 'Internet',
      amount: 100,
      scope: 'compartilhada',
      workAmount: 25,
      allocation: 'atividade',
      workActivity: 'Entrega de cartões',
    }),
  );
  assert.equal(workCashResult(d, d.work).realExpenses, 35);
  assert.equal(
    workExpenseAmount(row('expenses', { scope: 'moto', amount: 100 })),
    0,
  );
  assert.throws(
    () => upsert(d, 'expenses', { ...d.expenses[2], workAmount: 101 }),
    /superar/,
  );
  assert.equal(financial(d).spent, 210);
});
void test('gerais por atividade ou período são separadas; sem rateio entre sessões', () => {
  let d = fixture();
  d = upsert(
    d,
    'expenses',
    row('expenses', {
      id: 'general',
      name: 'Dados',
      amount: 20,
      scope: 'trabalho',
      allocation: 'geral',
    }),
  );
  d = upsert(
    d,
    'expenses',
    row('expenses', {
      id: 'period',
      name: 'Equipamento',
      amount: 30,
      scope: 'trabalho',
      allocation: 'período',
      workActivity: 'Entrega de cartões',
      periodFrom: '2026-01-01',
      periodTo: '2026-12-31',
    }),
  );
  assert.equal(workCashResult(d, d.work).generalExpenses, 50);
  assert.equal(
    workCashResult(d, d.work, 'Entrega de cartões').realExpenses,
    40,
  );
  assert.equal(
    workCashResult(d, d.work, 'todos', '', '', true).realExpenses,
    10,
  );
  assert.equal(workCashResult(d, [], 'Uber Moto').realExpenses, 0);
  assert.equal(workCashResult(d, [], 'todos').realExpenses, 50);
});
void test('filtros seguem sessão para vinculadas e pagamento para gerais; atividade editada acompanha vínculo', () => {
  let d = fixture();
  d.work[0].date = '2026-01-10';
  d.expenses[0].date = '2026-02-01';
  d = upsert(
    d,
    'expenses',
    row('expenses', {
      id: 'general',
      name: 'Dados',
      amount: 20,
      date: '2026-02-01',
      scope: 'trabalho',
      allocation: 'atividade',
      workActivity: 'Entrega de cartões',
    }),
  );
  const january = filterWork(
    d.work,
    'Entrega de cartões',
    '2026-01-01',
    '2026-01-31',
  );
  assert.equal(
    workCashResult(d, january, 'Entrega de cartões', '2026-01-01', '2026-01-31')
      .realExpenses,
    10,
  );
  assert.equal(
    workCashResult(d, [], 'Entrega de cartões', '2026-02-01', '2026-02-28')
      .realExpenses,
    20,
  );
  d = upsert(d, 'work', { ...d.work[0], activity: 'Atividade própria' });
  assert.equal(workCashResult(d, d.work, 'Atividade própria').realExpenses, 10);
});
void test('editar/excluir sessão ou pagamento preserva caixa e integridade de relações', () => {
  let d = fixture();
  d = upsert(d, 'expenses', { ...d.expenses[0], amount: 15 });
  assert.equal(workCashResult(d, d.work).cashProfit, 165);
  assert.throws(
    () => upsert(d, 'expenses', { ...d.expenses[0], workSessionId: 'missing' }),
    /sessão/,
  );
  assert.throws(
    () =>
      upsert(d, 'expenses', {
        ...d.expenses[0],
        allocation: 'período',
        periodFrom: '2026-02-01',
        periodTo: '2026-01-01',
      }),
    /período/,
  );
  d = remove(d, 'work', 'work');
  assert.equal(d.expenses.length, 1);
  assert.equal(d.expenses[0].allocation, 'atividade');
  assert.equal(d.expenses[0].workActivity, 'Entrega de cartões');
  assert.equal(financial(d).spent, 15);
  assert.deepEqual(validateData(d), d);
  d = remove(d, 'expenses', 'expenses');
  assert.equal(workCashResult(d, []).realExpenses, 0);
});
void test('normalização remove acentos, pontuação, espaços e palavras comuns, preservando posição', () => {
  assert.equal(
    normalizeComponentName('  Substituição  do PNEU   TRASEIRO! '),
    'pneu traseiro',
  );
  assert.equal(normalizeComponentName('Troca pneu traseiro'), 'pneu traseiro');
  assert.notEqual(
    normalizeComponentName('pneu dianteiro'),
    normalizeComponentName('pneu traseiro'),
  );
});
void test('aliases conhecidos e personalizados ligam equivalentes sem renomear histórico', () => {
  for (const name of [
    'Pneu traseiro',
    'Pneu Tras.',
    'Pneu traseiro XRE',
    'Troca pneu traseiro',
  ]) {
    const d = fixture();
    d.costs = [
      row('costs', { name, category: 'pneus', amount: 1000, lifeKm: 10000 }),
    ];
    const before = d.costs[0].name;
    assert.equal(componentMatches(d)[0].source, 'automático');
    assert.equal(costs(d).maintenance, 0.08);
    assert.equal(d.costs[0].name, before);
  }
  const d = fixture();
  d.maintenance[0].aliases = 'Borracha posterior';
  d.costs = [
    row('costs', {
      name: 'Borracha posterior',
      category: 'pneus',
      amount: 1000,
      lifeKm: 10000,
    }),
  ];
  assert.equal(componentMatches(d)[0].component?.id, 'maintenance');
});
void test('ambiguidade, posição diferente ou similaridade parcial nunca vinculam automaticamente', () => {
  const d = fixture();
  d.maintenance.push(
    row('maintenance', {
      id: 'front',
      name: 'Pneu dianteiro',
      estimated: 500,
      lifeKm: 10000,
    }),
  );
  d.costs = [
    row('costs', {
      name: 'Pneu',
      category: 'pneus',
      amount: 1000,
      lifeKm: 10000,
    }),
  ];
  assert.equal(componentMatches(d)[0].source, 'incerto');
  assert.equal(componentMatches(d)[0].candidates.length, 2);
  assert.equal(componentMatches(d)[0].component, null);
  assert.equal(costs(d).maintenance, 0.23);
  d.maintenance = [d.maintenance[0]];
  d.costs[0].name = 'Pneu dianteiro';
  assert.equal(componentMatches(d)[0].component, null);
  d.costs[0].name = 'Pneu traseiro';
  d.maintenance.push(
    row('maintenance', { id: 'duplicate', name: 'Pneu traseiro' }),
  );
  assert.equal(componentMatches(d)[0].source, 'incerto');
});
void test('confirmar/recusar vínculo é persistente; importação e exclusão preservam integridade', () => {
  let d = fixture();
  d.costs = [
    row('costs', {
      name: 'Pneu posterior especial',
      category: 'pneus',
      amount: 1000,
      lifeKm: 10000,
    }),
  ];
  d = upsert(d, 'costs', { ...d.costs[0], matchMode: 'ignorar' });
  assert.equal(componentMatches(d)[0].source, 'ignorado');
  assert.equal(componentMatches(parseBackup(backup(d)))[0].source, 'ignorado');
  d = upsert(d, 'costs', {
    ...d.costs[0],
    matchMode: 'manual',
    componentId: 'maintenance',
  });
  assert.equal(costs(d).maintenance, 0.08);
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
  assert.equal(componentMatches(load(storage))[0].source, 'manual');
  d = remove(d, 'maintenance', 'maintenance');
  assert.equal(d.costs[0].componentId, '');
  assert.deepEqual(validateData(d), d);
});
void test('migração v3 preserva caixa, classifica sem presumir uso profissional, adiciona aliases', () => {
  const old = fixture();
  old.dataVersion = 3;
  for (const r of [...old.expenses, ...old.services])
    for (const k of [
      'scope',
      'allocation',
      'workSessionId',
      'workActivity',
      'periodFrom',
      'periodTo',
      'workAmount',
    ])
      delete r[k];
  delete old.maintenance[0].aliases;
  const migrated = validateData(old);
  assert.equal(migrated.dataVersion, 4);
  assert.equal(financial(migrated).cash, 170);
  assert.equal(workCashResult(migrated, migrated.work).realExpenses, 0);
  assert.ok(String(migrated.maintenance[0].aliases).includes('pneu tras'));
  assert.deepEqual(validateData(migrated), migrated);
});
void test('reset financeiro mantém serviço real, removendo apenas referência a sessão excluída', () => {
  let d = fixture();
  d = upsert(
    d,
    'services',
    row('services', {
      maintenanceId: 'maintenance',
      date: today(),
      km: 15000,
      amount: 30,
      scope: 'trabalho',
      allocation: 'sessão',
      workSessionId: 'work',
    }),
  );
  d = resetData(d, 'finance');
  assert.equal(d.services[0].workSessionId, '');
  assert.equal(d.services[0].amount, 30);
  assert.deepEqual(validateData(d), d);
});
