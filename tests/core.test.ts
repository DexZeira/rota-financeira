import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow, type Row, today, validateRow } from '../src/model';
import {
  costs,
  workResult,
  financial,
  targets,
  debtState,
  prioritized,
  maintenanceState,
  forecast,
  investmentBalance,
  plan,
  addMonths,
  simulate,
} from '../src/calculations';
import {
  upsert,
  remove,
  resetData,
  backup,
  parseBackup,
  validateData,
  load,
  save,
  STORAGE_KEY,
} from '../src/services/storage';
const row = (key: Parameters<typeof emptyRow>[0], values: Partial<Row>) =>
  ({ ...emptyRow(key), id: 'test-' + key, ...values }) as Row;
void test('custo 300 / 150 km / 0,40 = custo 60 e lucro 240', () => {
  const r = workResult(300, 150, 5, 0.4);
  assert.equal(r.cost, 60);
  assert.equal(r.profit, 240);
  assert.equal(r.profitHour, 48);
  assert.equal(r.profitKm, 1.6);
});
void test('custos, reserva e depreciação não reduzem saldo', () => {
  const d = defaults();
  Object.assign(d.bike, {
    fuelPrice: 6,
    efficiency: 30,
    km: 20000,
    purchaseKm: 10000,
    purchaseValue: 20000,
    currentValue: 18000,
  });
  d.costs = [
    row('costs', {
      name: 'Pneu',
      category: 'pneus',
      amount: 700,
      lifeKm: 20000,
    }),
  ];
  d.settings.openingCash = 1000;
  const c = costs(d);
  assert.equal(c.fuel, 0.2);
  assert.equal(c.reserve, 0.035);
  assert.equal(c.depKm, 0.2);
  assert.equal(c.depreciation, 2000);
  assert.equal(financial(d).cash, 1000);
});
void test('CRUD, dashboard, persistência e round trip backup', () => {
  let d = defaults();
  const r = row('work', {
    date: today(),
    activity: 'Teste',
    hours: 5,
    km: 150,
    revenue: 300,
  });
  d = upsert(d, 'work', r);
  assert.equal(financial(d).revenue, 300);
  d = upsert(d, 'work', { ...r, revenue: 400 });
  assert.equal(financial(d).revenue, 400);
  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };
  save(storage, d);
  assert.deepEqual(load(storage), d);
  const text = backup(d);
  assert.equal(resetData(d, 'total').work.length, 0);
  assert.deepEqual(parseBackup(text), d);
  d = remove(d, 'work', r.id);
  assert.equal(financial(d).revenue, 0);
  assert.equal(d.work.length, 0);
  assert.ok(mem.has(STORAGE_KEY));
});
void test('pagamentos editados ou excluídos recalculam saldo e parcelas', () => {
  let d = defaults();
  d.debts = [
    row('debts', {
      name: 'Cartão',
      original: 1000,
      balance: 1000,
      remaining: 10,
      installment: 100,
      interest: 5,
    }),
  ];
  const p = row('payments', {
    debtId: d.debts[0].id,
    date: today(),
    amount: 100,
    installments: 1,
  });
  d = upsert(d, 'payments', p);
  assert.equal(debtState(d, d.debts[0]).balance, 900);
  assert.equal(debtState(d, d.debts[0]).remaining, 9);
  d = upsert(d, 'payments', { ...p, amount: 200 });
  assert.equal(debtState(d, d.debts[0]).balance, 800);
  assert.throws(() => upsert(d, 'payments', { ...p, amount: 2000 }), /superam/);
  d = remove(d, 'payments', p.id);
  assert.equal(debtState(d, d.debts[0]).balance, 1000);
  d = upsert(d, 'payments', p);
  d = remove(d, 'debts', d.debts[0].id);
  assert.equal(d.payments.length, 0);
});
void test('avalanche e bola de neve', () => {
  const d = defaults();
  d.debts = [
    row('debts', {
      id: 'a',
      name: 'A',
      original: 1000,
      balance: 1000,
      interest: 10,
    }),
    row('debts', {
      id: 'b',
      name: 'B',
      original: 100,
      balance: 100,
      interest: 1,
    }),
  ];
  assert.equal(prioritized(d, 'avalanche')[0].id, 'a');
  assert.equal(prioritized(d, 'bola de neve')[0].id, 'b');
});
void test('meta percentual usa mínima de caixa, sem duplicar reserva ou lucro desejado', () => {
  const d = defaults();
  Object.assign(d.settings, {
    workDays: 20,
    kmDay: 150,
    hoursDay: 5,
    netDay: 200,
  });
  Object.assign(d.bike, { fuelPrice: 6, efficiency: 30 });
  d.costs = [row('costs', { name: 'Custo', amount: 200, lifeKm: 1000 })];
  const t = targets(d);
  assert.equal(t.ideal, 36);
  assert.equal(t.hour, 7.2);
});
void test('manutenção usa primeiro prazo e serviços reais uma vez', () => {
  const d = defaults();
  d.bike.km = 1000;
  d.settings.nearKm = 100;
  const m = row('maintenance', {
    name: 'Óleo',
    lastKm: 0,
    lastDate: '2026-01-31',
    intervalKm: 2000,
    intervalMonths: 1,
    estimated: 100,
  });
  d.maintenance = [m];
  assert.equal(maintenanceState(d, m, '2026-03-01').status, 'atrasada');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  d.services = [
    row('services', {
      maintenanceId: m.id,
      date: '2026-03-01',
      km: 900,
      amount: 90,
    }),
  ];
  assert.equal(maintenanceState(d, m, '2026-03-01').nextKm, 2900);
  assert.equal(financial(d, '2026-03-01').spent, 90);
  assert.equal(financial(d, '2026-03-01').cash, -90);
  assert.equal(forecast(d, 365), 100);
});
void test('investimentos, aportes, retiradas e rendimentos', () => {
  let d = defaults();
  d.settings.openingCash = 1000;
  const i = row('investments', {
    name: 'Reserva',
    balance: 500,
    date: today(),
  });
  d.investments = [i];
  d = upsert(
    d,
    'movements',
    row('movements', {
      investmentId: i.id,
      date: today(),
      kind: 'aporte',
      amount: 200,
    }),
  );
  assert.equal(investmentBalance(d, i), 700);
  assert.equal(financial(d).cash, 800);
  assert.equal(financial(d).netWorth, 1500);
  d = upsert(
    d,
    'movements',
    row('movements', {
      id: 'yield',
      investmentId: i.id,
      date: today(),
      kind: 'rendimento',
      amount: 50,
    }),
  );
  assert.equal(investmentBalance(d, i), 750);
  assert.throws(
    () =>
      upsert(
        d,
        'movements',
        row('movements', {
          id: 'out',
          investmentId: i.id,
          date: today(),
          kind: 'retirada',
          amount: 1000,
        }),
      ),
    /supera/,
  );
});
void test('plano próxima moto desconta moto e entrada', () => {
  const p = row('plans', {
    name: 'Troca',
    kind: 'próxima moto',
    target: 30000,
    bikeValue: 18000,
    current: 2000,
    deadline: '2026-10-01',
  });
  const x = plan(p, '2026-09-01');
  assert.equal(x.remaining, 10000);
  assert.equal(x.monthly, 10000);
  assert.equal(x.daily, 10000 / 30);
});
void test('reset seletivo preserva outros domínios e permite novos registros', () => {
  const d = defaults();
  d.work = [row('work', { activity: 'Teste', hours: 1, revenue: 5 })];
  d.plans = [
    row('plans', { name: 'Plano', target: 10, deadline: '2026-12-01' }),
  ];
  d.settings.openingCash = 500;
  assert.equal(resetData(d, 'settings').settings.openingCash, 500);
  assert.equal(resetData(d, 'finance').maintenance.length, 15);
  assert.equal(resetData(d, 'finance').work.length, 0);
  assert.equal(resetData(d, 'plans').plans.length, 0);
  assert.equal(resetData(d, 'plans').work.length, 1);
  assert.equal(resetData(d, 'bike').maintenance.length, 0);
  assert.equal(upsert(resetData(d, 'total'), 'work', d.work[0]).work.length, 1);
});
void test('validação rejeita datas inválidas, negativos, referências e backup malformado', () => {
  assert.throws(
    () => validateRow('work', row('work', { activity: '', hours: 1 })),
    /Preencha/,
  );
  assert.throws(
    () => validateRow('work', row('work', { activity: 'Teste', hours: -1 })),
    /inválido/,
  );
  assert.throws(
    () =>
      validateRow(
        'work',
        row('work', { activity: 'Teste', hours: 1, date: '2026-02-30' }),
      ),
    /inválida/,
  );
  assert.throws(
    () =>
      validateRow(
        'bike',
        row('bike', {
          brand: 'Honda',
          model: 'XRE',
          year: 2025,
          km: 1,
          purchaseKm: 2,
        }),
      ),
    /menor/,
  );
  assert.throws(() => parseBackup('{"version":99}'), /incompatível/);
  assert.throws(
    () =>
      parseBackup(
        backup({
          ...defaults(),
          work: [
            row('work', { activity: 'Teste', hours: 1 }),
            row('work', { activity: 'Teste', hours: 1 }),
          ],
        }),
      ),
    /duplicado/,
  );
  assert.throws(
    () =>
      upsert(
        defaults(),
        'payments',
        row('payments', { debtId: 'missing', amount: 10 }),
      ),
    /correspondente/,
  );
  assert.throws(() => validateData({ dataVersion: 1 }), /incompleto/);
});
void test('migração conhecida v0 preserva registros', () => {
  const d = defaults();
  d.work = [row('work', { activity: 'Teste', hours: 1 })];
  const old = { dataVersion: 0, work: d.work };
  const migrated = validateData(old);
  assert.equal(migrated.dataVersion, 4);
  assert.deepEqual(migrated.work, d.work);
  assert.equal(migrated.bike.model, 'XRE 190');
});
void test('reserva da moto é alocação e não despesa duplicada', () => {
  let d = defaults();
  d.settings.openingCash = 1000;
  d = upsert(d, 'fund', row('fund', { kind: 'reserva', amount: 100 }));
  assert.equal(financial(d).cash, 1000);
  assert.equal(financial(d).available, 900);
  assert.equal(financial(d).netWorth, 1000);
  assert.throws(
    () =>
      upsert(d, 'fund', row('fund', { id: 'use', kind: 'uso', amount: 101 })),
    /supera/,
  );
});
void test('simulação não modifica patrimônio por transferências', () => {
  const d = defaults();
  d.settings.workDays = 20;
  d.settings.openingCash = 1000;
  const s = simulate(d, {
    id: 'sim',
    revenue: 300,
    hours: 5,
    km: 0,
    gas: 0,
    expenses: 100,
    extra: 200,
    contribution: 300,
  });
  assert.equal(s.netWorth, 6900);
  assert.equal(s.free, 5400);
  assert.equal(financial(d).cash, 1000);
});

void test('histórico de planos recalcula aportes, retiradas, edição e exclusão sem duplicar caixa', () => {
  let d = defaults();
  const p = row('plans', {
    name: 'Objetivo',
    target: 1000,
    current: 100,
    deadline: '2027-12-01',
  });
  d = upsert(d, 'plans', p);
  const t = row('planTransactions', {
    planId: p.id,
    kind: 'deposit',
    amount: 200,
    date: today(),
  });
  d = upsert(d, 'planTransactions', t);
  assert.equal(plan(p, today(), d).current, 300);
  assert.equal(financial(d).cash, 0);
  d = upsert(d, 'planTransactions', { ...t, amount: 250 });
  assert.equal(plan(p, today(), d).remaining, 650);
  const withdrawal = row('planTransactions', {
    id: 'withdraw',
    planId: p.id,
    kind: 'withdrawal',
    amount: 150,
    date: today(),
  });
  d = upsert(d, 'planTransactions', withdrawal);
  assert.equal(plan(p, today(), d).current, 200);
  assert.throws(
    () => upsert(d, 'planTransactions', { ...withdrawal, amount: 351 }),
    /supera/,
  );
  assert.throws(() => remove(d, 'planTransactions', t.id), /supera/);
  d = remove(d, 'planTransactions', withdrawal.id);
  d = remove(d, 'planTransactions', t.id);
  assert.equal(plan(p, today(), d).current, 100);
  d = upsert(d, 'planTransactions', t);
  assert.deepEqual(parseBackup(backup(d)), d);
  assert.equal(remove(d, 'plans', p.id).planTransactions.length, 0);
  assert.equal(resetData(d, 'plans').planTransactions.length, 0);
});
void test('backup v1 sem histórico de planos migra sem perder o saldo inicial', () => {
  const d = defaults();
  d.plans = [
    row('plans', {
      name: 'Plano antigo',
      current: 500,
      target: 1000,
      deadline: '2027-12-01',
    }),
  ];
  const legacy: Record<string, unknown> = { ...d, dataVersion: 1 };
  delete legacy.planTransactions;
  const result = parseBackup(
    JSON.stringify({
      version: 1,
      exportDate: new Date().toISOString(),
      data: legacy,
    }),
  );
  assert.equal(result.dataVersion, 4);
  assert.equal(result.planTransactions.length, 0);
  assert.equal(result.plans[0].current, 500);
});
void test('plano concluído não aumenta meta diária e movimentação órfã é rejeitada', () => {
  let d = defaults();
  d.settings.workDays = 20;
  d = upsert(
    d,
    'plans',
    row('plans', {
      name: 'Concluído',
      target: 1000,
      current: 0,
      deadline: '2027-12-01',
      status: 'concluído',
    }),
  );
  assert.equal(targets(d).plans, 0);
  assert.throws(
    () =>
      upsert(
        d,
        'planTransactions',
        row('planTransactions', { planId: 'missing', amount: 10 }),
      ),
    /correspondente/,
  );
});
