import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnniversaryDay, monthlyAdditionalRate, estimateSavingsYield } from '../src/services/savings-yield';
void test('poupança: regime alto e aniversário 29-31', () => {
  assert.equal(monthlyAdditionalRate(10), 0.5);
  assert.equal(normalizeAnniversaryDay(29), 1); assert.equal(normalizeAnniversaryDay(30), 1); assert.equal(normalizeAnniversaryDay(31), 1);
});
void test('poupança: regime baixo mensaliza 70% da meta Selic', () => {
  const expected = (Math.pow(1 + 0.08 * 0.7, 1 / 12) - 1) * 100;
  assert.ok(Math.abs((monthlyAdditionalRate(8) || 0) - expected) < 1e-12);
});
void test('poupança: menor saldo real e estimativa são identificados', () => {
  const actual = estimateSavingsYield({ balance: 10000, actualMinimumBalance: 8000, anniversaryDay: 5, trPercent: 0.17, targetSelicAnnualPercent: 10, anniversaryDate: '2026-10-05' });
  assert.equal(actual.status, 'actual'); assert.equal(actual.minimumBalance, 8000); assert.ok((actual.estimatedYieldCents || 0) > 0);
  assert.equal(estimateSavingsYield({ balance: 10000, anniversaryDay: 5 }).status, 'unavailable');
});
