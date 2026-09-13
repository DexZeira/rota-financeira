import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstructSavingsMinimumBalance, savingsPeriod, estimateSavingsYield } from '../src/services/savings-yield';
import { compareInvestment } from '../src/services/investment-comparison';
void test('menor saldo reconstrói movimentações em ordem determinística e ignora fora do período', () => {
  const min = reconstructSavingsMinimumBalance(1000, [
    { id: 'b', date: '2026-09-10', amount: 500, kind: 'aporte' },
    { id: 'a', date: '2026-09-05', amount: 800, kind: 'retirada' },
    { id: 'x', date: '2026-10-01', amount: 999, kind: 'aporte' },
  ], '2026-09-01', '2026-09-30');
  assert.equal(min, 200);
});
void test('comparador aceita poupança sem aplicar IR', () => {
  const result = compareInvestment({ type: 'Poupança', rate: 10, referenceRate: 0.17, initial: 1000, months: 12 });
  assert.equal(result.tax, 0); assert.ok(result.net > 1000);
  assert.equal(result.status, 'estimated');
});
void test('período da poupança respeita o aniversário e só fica atual após o fechamento', () => {
  const open = savingsPeriod(15, new Date('2026-09-13T12:00:00Z'));
  assert.deepEqual(open, { start: '2026-08-15', end: '2026-09-14', complete: false });
  const closed = savingsPeriod(15, new Date('2026-09-15T12:00:00Z'));
  assert.equal(closed.complete, true);
  const actual = estimateSavingsYield({ balance: 1000, anniversaryDay: 15, trPercent: 0.1, targetSelicAnnualPercent: 10, actualMinimumBalance: 900, periodComplete: true });
  assert.equal(actual.status, 'actual');
});
