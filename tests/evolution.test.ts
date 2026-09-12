import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults,
  emptyRow,
  validateRow,
  type Collection,
  type Row,
} from '../src/model';
import { targets, financial, debtState } from '../src/calculations';
import { validateData, backup, parseBackup } from '../src/services/storage';
import {
  periodSummary,
  monthComparison,
  dateRange,
  upcoming,
  financialHealth,
  payoffEstimate,
} from '../src/insights';
import { workProjection } from '../src/work-projection';
const row = (key: Collection, props: Partial<Row>): Row => ({
  ...emptyRow(key),
  id: key,
  ...props,
});
void test('margens100/200 e20/50, zero explícito e novos padrões20/40', () => {
  const d = defaults();
  Object.assign(d.settings, {
    essential: 2914.2,
    workDays: 10,
    idealTargetPercent: 100,
    acceleratedTargetPercent: 200,
  });
  let t = targets(d);
  assert.equal(t.minimum.toFixed(2), '291.42');
  assert.equal(t.ideal.toFixed(2), '582.84');
  assert.equal(t.accelerated.toFixed(2), '874.26');
  Object.assign(d.settings, {
    idealTargetPercent: 20,
    acceleratedTargetPercent: 50,
  });
  t = targets(d);
  assert.equal(t.ideal.toFixed(2), '349.70');
  assert.equal(t.accelerated.toFixed(2), '437.13');
  d.settings.idealTargetPercent = 0;
  assert.equal(targets(d).ideal, t.minimum);
  const restored = parseBackup(backup(d));
  assert.equal(restored.settings.idealTargetPercent, 0);
  assert.equal(restored.settings.acceleratedTargetPercent, 50);
  delete d.settings.idealTargetPercent;
  delete d.settings.acceleratedTargetPercent;
  const migrated = validateData(d);
  assert.equal(migrated.settings.idealTargetPercent, 20);
  assert.equal(migrated.settings.acceleratedTargetPercent, 40);
  assert.throws(() =>
    validateRow('settings', { ...migrated.settings, idealTargetPercent: -1 }),
  );
  assert.throws(() =>
    validateRow('settings', {
      ...migrated.settings,
      acceleratedTargetPercent: 501,
    }),
  );
});
void test('histórico soma sessões por dia para projetar km sem modificar registros', () => {
  const d = defaults();
  Object.assign(d.settings, { kmDay: 300, workDaysWeek: 5 });
  d.work = [
    row('work', { id: 'a', date: '2026-09-10', km: 60, hours: 2 }),
    row('work', { id: 'b', date: '2026-09-10', km: 40, hours: 2 }),
    row('work', { id: 'c', date: '2026-09-09', km: 200, hours: 5 }),
  ];
  const before = JSON.stringify(d),
    p = workProjection(d, '2026-09-11');
  assert.equal(p.kmDay, 150);
  assert.equal(p.days, 22);
  assert.equal(JSON.stringify(d), before);
});
void test('resumo mensal não duplica provisões, planos ou serviços', () => {
  const d = defaults();
  d.work = [
    row('work', { revenue: 1000, date: '2026-09-10', hours: 5, km: 100 }),
  ];
  d.expenses = [row('expenses', { amount: 100, date: '2026-09-10' })];
  d.services = [row('services', { amount: 50, date: '2026-09-10' })];
  d.payments = [row('payments', { amount: 200, date: '2026-09-10' })];
  d.movements = [
    row('movements', { amount: 100, kind: 'aporte', date: '2026-09-10' }),
  ];
  d.planTransactions = [
    row('planTransactions', {
      amount: 300,
      kind: 'deposit',
      date: '2026-09-10',
    }),
  ];
  const r = periodSummary(d, '2026-09-01', '2026-09-11');
  assert.equal(r.result, 550);
  assert.equal(r.plans, 300);
  assert.equal(r.expenses, 150);
  assert.equal(r.result, financial(d, '2026-09-11').cash);
});
void test('comparações usam períodos equivalentes e intervalos incluem hoje', () => {
  const d = defaults();
  d.work = [
    row('work', { date: '2026-08-10', revenue: 100, hours: 1 }),
    row('work', { date: '2026-08-25', revenue: 999, hours: 1 }),
    row('work', { date: '2026-09-10', revenue: 120, hours: 1 }),
  ];
  assert.ok(
    Math.abs((monthComparison(d, '2026-09-11').revenueChange ?? 0) - 20) < 1e-8,
  );
  assert.deepEqual(dateRange('7 dias', '2026-09-11'), {
    from: '2026-09-05',
    to: '2026-09-11',
  });
});
void test('alertas ordenam atrasos, ignoram dívidas quitadas e saúde explica causas', () => {
  const d = defaults();
  d.debts = [
    row('debts', {
      id: 'late',
      name: 'Atrasada',
      totalInstallments: 2,
      installmentAmount: 100,
      due: '2026-09-01',
      status: 'ativa',
    }),
    row('debts', {
      id: 'paid',
      name: 'Quitada',
      totalInstallments: 3,
      installmentAmount: 200,
      due: '2026-08-01',
      status: 'quitada',
    }),
  ];
  assert.equal(upcoming(d, '2026-09-11')[0].name, 'Atrasada');
  assert.equal(upcoming(d, '2026-09-11').length, 1);
  assert.equal(financialHealth(d, '2026-09-11').level, 'Crítica');
  const before = JSON.stringify(d),
    estimate = payoffEstimate(d, 100);
  assert.equal(estimate.withExtra, 1);
  assert.equal(JSON.stringify(d), before);
});
void test('parceladas derivam saldo do total e parcelas pagas sem campo manual', () => {
  const d = defaults(),
    r = row('debts', {
      totalInstallments: 12,
      paidInstallments: 1,
      installmentAmount: 500,
      balance: 123,
    });
  d.debts = [r];
  assert.equal(debtState(d, r).balance, 5500);
  assert.equal(debtState(d, r).remaining, 11);
  assert.throws(() => validateRow('debts', { ...r, paidInstallments: 13 }));
});
