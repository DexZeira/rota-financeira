import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow, type Collection, type Row } from '../src/model';
import { targets, plan, financial, debtState } from '../src/calculations';
import { targetBreakdownRows } from '../src/target-sources';
import {
  save,
  load,
  parseBackup,
  backup,
  upsert,
} from '../src/services/storage';
const row = (kind: Collection, props: Partial<Row>): Row => ({
  ...emptyRow(kind),
  id: kind,
  ...props,
});
const at = '2026-09-11';
function example() {
  const d = defaults();
  Object.assign(d.settings, {
    essential: 1000,
    workDays: 20,
    hoursDay: 5,
    kmDay: 125,
    reserveMonth: 100,
    extra: 200,
    extraPlans: 100,
    extraInvestments: 100,
  });
  d.debts = [
    row('debts', {
      name: 'Sogra',
      original: 5500,
      balance: 5500,
      remaining: 11,
      installment: 500,
      due: '2026-09-15',
    }),
  ];
  d.maintenance = [
    row('maintenance', { name: 'Pneu', estimated: 800, lifeKm: 10000 }),
  ];
  d.plans = [
    row('plans', {
      name: 'Próxima moto',
      target: 200,
      current: 0,
      deadline: '2026-10-11',
    }),
  ];
  return d;
}
void test('integração das fontes gera mínima75, ideal90 e acelerada105 com margens20/40 por dia', () => {
  const d = example(),
    before = JSON.stringify(d),
    t = targets(d, at);
  assert.equal(t.minimum, 75);
  assert.equal(t.ideal, 90);
  assert.equal(t.accelerated, 105);
  assert.equal(t.minimumMonthly, 1500);
  assert.equal(t.idealMonthly, 1800);
  assert.equal(t.acceleratedMonthly, 2100);
  assert.equal(t.breakdown.fixedExpenses, 1000);
  assert.equal(t.breakdown.mandatoryDebtPayments, 500);
  assert.equal(t.breakdown.maintenanceProvision, 200);
  assert.equal(t.breakdown.plannedInvestments, 100);
  assert.equal(t.breakdown.activePlanContributions, 200);
  assert.equal(JSON.stringify(d), before);
  assert.equal(financial(d).spent, 0);
});
void test('fixas e recorrentes são somadas quando distintas, sem duplicar base total nem histórico', () => {
  const d = defaults();
  Object.assign(d.settings, {
    essential: 1000,
    workDays: 20,
    expenseBaseMode: 'adicional às recorrentes',
  });
  d.expenses = [
    row('expenses', {
      name: 'Internet',
      amount: 100,
      date: '2026-08-01',
      recurrence: 'mensal',
    }),
    row('expenses', {
      id: 'older',
      name: 'Internet',
      amount: 90,
      date: '2026-07-01',
      recurrence: 'mensal',
    }),
  ];
  assert.equal(targets(d, at).minimum, 55);
  assert.equal(targets(d, at).recurringGross, 100);
  d.settings.expenseBaseMode = 'total incluindo recorrentes';
  assert.equal(targets(d, at).minimum, 50);
  d.expenses.push(
    row('expenses', {
      id: 'paid',
      name: 'Internet',
      amount: 100,
      date: '2026-09-05',
      recurrence: 'mensal',
    }),
  );
  assert.equal(targets(d, at).breakdown.recurringEssentialExpenses, 0);
  assert.equal(targets(d, at).recurringPaid, 100);
  assert.equal(targets(d, at).minimum, 45);
});
void test('dívidas somam500+200+300, excluem futuras/quitadas e nunca usam saldo total', () => {
  const d = defaults();
  d.settings.workDays = 20;
  d.debts = [500, 200, 300].map((amount, i) =>
    row('debts', {
      id: String(i),
      name: String(i),
      original: amount * 11,
      balance: amount * 11,
      remaining: 11,
      installment: amount,
      due: '2026-09-20',
    }),
  );
  assert.equal(targets(d, at).installments, 1000);
  d.debts.push(
    row('debts', {
      id: 'future',
      name: 'Futura',
      original: 5000,
      balance: 5000,
      remaining: 10,
      installment: 500,
      due: '2026-10-01',
    }),
  );
  d.debts.push(
    row('debts', {
      id: 'paid',
      name: 'Quitada',
      status: 'quitada',
      original: 5000,
      balance: 5000,
      installment: 500,
      due: '2026-09-01',
    }),
  );
  assert.equal(targets(d, at).installments, 1000);
});
void test('pagamentos e parciais abatem obrigação uma vez; extras sem antecipar parcela não a apagam', () => {
  const d = example();
  d.payments = [
    row('payments', {
      debtId: 'debts',
      date: '2026-09-10',
      amount: 200,
      installments: 0,
      kind: 'normal',
    }),
  ];
  assert.equal(targets(d, at).installments, 300);
  d.payments[0].amount = 500;
  d.payments[0].installments = 1;
  assert.equal(targets(d, at).installments, 0);
  d.payments[0].kind = 'extra';
  d.payments[0].installments = 0;
  assert.equal(targets(d, at).installments, 500);
  d.debts[0].due = '2026-08-15';
  d.payments = [];
  assert.equal(targets(d, at).installments, 1000);
  d.debts[0].installment = 0;
  assert.equal(targets(d, at).installments, 0);
  assert.ok(
    targets(d, at).warnings.some((w) => w.includes('Sem valor de parcela')),
  );
});
void test('sem data de vencimento usa parcela mensal explicitada, abatendo normal pago no mês', () => {
  const d = example();
  d.debts[0].due = '';
  assert.equal(targets(d, at).installments, 500);
  d.payments = [
    row('payments', {
      debtId: 'debts',
      date: '2026-09-05',
      amount: 500,
      kind: 'normal',
    }),
  ];
  assert.equal(targets(d, at).installments, 0);
  assert.ok(targets(d, at).warnings.some((w) => w.includes('Sem vencimento')));
});
void test('manutenção permanece referência .08/km ×150km; margens não duplicam provisões', () => {
  const d = defaults();
  Object.assign(d.settings, { workDays: 20, kmDay: 150 });
  d.maintenance = [
    row('maintenance', { name: 'Pneu', estimated: 800, lifeKm: 10000 }),
  ];
  Object.assign(d.bike, {
    fuelPrice: 6,
    efficiency: 30,
    km: 10000,
    purchaseValue: 50000,
    currentValue: 10000,
  });
  const t = targets(d, at);
  assert.equal(t.minimum, 30);
  assert.equal(t.ideal, 36);
  assert.equal(t.breakdown.maintenanceProvision / 20, 12);
  assert.equal(financial(d).spent, 0);
  d.bike.purchaseValue = 100000;
  assert.equal(targets(d, at).ideal, 36);
  d.costs = [
    row('costs', {
      name: 'Seguro',
      category: 'seguro',
      amount: 100,
      lifeKm: 10000,
    }),
  ];
  assert.equal(targets(d, at).minimum, 30);
  assert.equal(targets(d, at).ideal, 36);
});
void test('aporte planejado é configuração futura, não saldo nem rendimento; realizado abate o plano mensal', () => {
  const d = defaults();
  d.settings.workDays = 20;
  d.investments = [
    row('investments', { name: 'Reserva', balance: 10000, date: '2026-01-01' }),
  ];
  assert.equal(targets(d, at).breakdown.plannedInvestments, 0);
  d.settings.reserveMonth = 100;
  assert.equal(targets(d, at).ideal, 0);
  d.movements = [
    row('movements', {
      investmentId: 'investments',
      kind: 'aporte',
      amount: 40,
      date: '2026-09-05',
    }),
  ];
  assert.equal(targets(d, at).breakdown.plannedInvestments, 60);
  d.movements.push(
    row('movements', {
      id: 'yield',
      investmentId: 'investments',
      kind: 'rendimento',
      amount: 300,
      date: '2026-09-05',
    }),
  );
  assert.equal(targets(d, at).breakdown.plannedInvestments, 60);
});
void test('planos usam a mesma fórmula mensal com histórico e ignoram concluídos', () => {
  const d = example();
  d.planTransactions = [
    row('planTransactions', {
      planId: 'plans',
      kind: 'deposit',
      amount: 50,
      date: '2026-09-10',
    }),
  ];
  assert.equal(targets(d, at).plans, plan(d.plans[0], at, d).monthly);
  assert.equal(targets(d, at).plans, 150);
  d.plans[0].status = 'concluído';
  assert.equal(targets(d, at).plans, 0);
});
void test('margem acelerada não duplica os extras antigos; fontes zeradas explícitas', () => {
  const d = defaults();
  d.settings.workDays = 20;
  const zero = targets(d, at);
  assert.equal(zero.minimum, zero.ideal);
  assert.equal(zero.ideal, zero.accelerated);
  assert.equal(targetBreakdownRows(zero).flatMap((s) => s.rows).length, 8);
  Object.assign(d.settings, {
    extra: 200,
    extraPlans: 100,
    extraInvestments: 100,
  });
  assert.equal(targets(d, at).accelerated, 0);
  assert.equal(targets(d, at).ideal, 0);
  d.settings.workDays = 0;
  assert.equal(targets(d, at).configured, false);
  assert.equal(targets(d, at).acceleratedMonthly, 0);
  assert.equal(Number.isFinite(targets(d, at).accelerated), true);
});
void test('storage → estado carregado → cálculo → linhas consumidas pelo Dashboard; compatibilidade sem alterar storage', () => {
  const d = example();
  const memory = new Map<string, string>();
  let writes = 0;
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes++;
      memory.set(k, v);
    },
  };
  save(storage, d);
  const before = [...memory];
  const loaded = load(storage);
  assert.equal(writes, 1);
  assert.deepEqual([...memory], before);
  const t = targets(loaded, at),
    sections = targetBreakdownRows(t);
  assert.deepEqual(
    sections.map((s) => s.daily),
    [75, 90, 105],
  );
  for (const section of sections)
    assert.equal(
      section.rows.reduce((a, r) => a + r[1], 0),
      section.monthly,
    );
  assert.equal(targets(parseBackup(backup(loaded)), at).ideal, 90);
  delete loaded.settings.extraPlans;
  delete loaded.settings.extraInvestments;
  delete loaded.settings.expenseBaseMode;
  const old = load({ getItem: () => JSON.stringify(loaded) });
  assert.equal(old.settings.extraPlans, 0);
  assert.equal(old.settings.extraInvestments, 0);
  assert.equal(old.settings.expenseBaseMode, 'total incluindo recorrentes');
  assert.equal(old.settings.extra, 200);
});

void test('cadastro atual de dívidas e campos legados chegam ao cálculo após carregar e exportar', () => {
  const d = example();
  d.debts = [
    row('debts', {
      name: 'Parcelada',
      type: 'parcelada',
      totalInstallments: 12,
      paidInstallments: 1,
      installmentAmount: 500,
      balance: 5500,
      due: '2026-09-15',
    }),
  ];
  const loaded = parseBackup(backup(d));
  assert.equal(targets(loaded, at).minimum, 75);
  assert.equal(debtState(loaded, loaded.debts[0], at).remaining, 11);
  const paid = upsert(
    loaded,
    'payments',
    row('payments', {
      debtId: loaded.debts[0].id,
      date: at,
      amount: 500,
      installments: 1,
      kind: 'normal',
    }),
  );
  assert.equal(
    targets(parseBackup(backup(paid)), at).breakdown.mandatoryDebtPayments,
    0,
  );
  assert.equal(debtState(paid, paid.debts[0], at).remaining, 10);
  const old = example(),
    oldLoaded = parseBackup(backup(old));
  assert.equal(oldLoaded.debts[0].installment, 500);
  assert.equal(oldLoaded.debts[0].remaining, 11);
  assert.equal(targets(oldLoaded, at).minimum, 75);
});

void test('parceladas ativas com saldo inicial zero entram nas metas e abatem pagamentos', () => {
  const d = defaults();
  Object.assign(d.settings, { essential: 610, workDays: 17 });
  d.debts = [
    [2006.2, 11, '2026-09-27'],
    [1532, 11, '2026-09-15'],
    [300, 6, '2026-09-15'],
    [173.51, 4, '2026-10-05'],
    [416, 1, '2026-09-20'],
  ].map(([amount, count, due], i) =>
    row('debts', {
      id: 'debt-' + i,
      name: 'Teste ' + i,
      installmentAmount: Number(amount),
      totalInstallments: Number(count),
      paidInstallments: null,
      balance: 0,
      due: String(due),
      status: 'ativa',
    }),
  );
  const before = JSON.stringify(d),
    loaded = parseBackup(backup(d)),
    t = targets(loaded, at);
  assert.equal(t.installments, 4254.2);
  assert.equal(t.minimumMonthly, 4864.2);
  assert.equal(t.minimum, 4864.2 / 17);
  assert.equal(t.ideal, t.minimum * 1.2);
  assert.equal(debtState(loaded, loaded.debts[0], at).balance, 22068.2);
  const paid = upsert(
    loaded,
    'payments',
    row('payments', {
      debtId: 'debt-0',
      date: at,
      amount: 2006.2,
      installments: 1,
      kind: 'normal',
    }),
  );
  assert.equal(targets(paid, at).installments, 2248);
  assert.equal(debtState(paid, paid.debts[0], at).balance, 20062);
  assert.equal(JSON.stringify(d), before);
  loaded.debts[0].status = 'quitada';
  assert.equal(debtState(loaded, loaded.debts[0], at).balance, 0);
  loaded.debts[1].paidInstallments = 11;
  assert.equal(debtState(loaded, loaded.debts[1], at).balance, 0);
  loaded.debts = [
    row('debts', {
      original: 500,
      balance: 0,
      installment: 100,
      remaining: 5,
      status: 'ativa',
    }),
  ];
  assert.equal(targets(loaded, at).installments, 0);
});
