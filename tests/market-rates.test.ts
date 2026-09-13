import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarketRate, loadMarketRates, annualizeDailyRate } from '../src/services/market-rates';

void test('taxas: interpreta resposta SGS sem alterar precisão', () => {
  assert.deepEqual(parseMarketRate('[{"valor":"13,25","data":"12/09/2026"}]'), {
    value: 13.25, rawValue: 13.25, unit: '% a.a.', date: '2026-09-12', source: 'Banco Central do Brasil · SGS',
  });
});
void test('CDI diário SGS 12 é anualizado por composição em 252 dias úteis', () => {
  const daily = 0.05;
  const parsed = parseMarketRate('[{"valor":"0,05","data":"12/09/2026"}]', '% p.d.');
  assert.equal(parsed?.unit, '% p.d.');
  assert.equal(parsed?.rawValue, daily);
  assert.ok(Math.abs(annualizeDailyRate(daily) - 13.424645086257158) < 1e-12);
  assert.notEqual(daily, annualizeDailyRate(daily));
});
void test('taxas: usa resposta mockada e não quebra quando API falha', async () => {
  const rates = await loadMarketRates(async (url) => {
    const address = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    return address.includes('.12/')
      ? new Response('[{"valor":"0,05","data":"12/09/2026"}]')
      : new Response('[{"valor":"10,00","data":"12/09/2026"}]');
  });
  assert.equal(rates.selic?.value, 10);
  assert.equal(rates.ipca?.value, 10);
  assert.equal(rates.cdi?.unit, '% p.d.');
  assert.equal(rates.cdi?.rawValue, 0.05);
  assert.ok(Math.abs((rates.cdi?.value || 0) - annualizeDailyRate(0.05)) < 1e-12);
});
