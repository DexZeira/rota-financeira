import test from 'node:test';
import assert from 'node:assert/strict';
import { incomeTaxRate, estimateIncomeTax } from '../src/services/investment-tax';
import { compareInvestment } from '../src/services/investment-comparison';
import { loadQuote } from '../src/services/market-quotes';
import { loadMarketExpectations } from '../src/services/market-expectations';
void test('tributação regressiva e isenção', () => {
  assert.equal(incomeTaxRate(180, 'CDB'), .225); assert.equal(incomeTaxRate(361, 'CDB'), .175); assert.equal(incomeTaxRate(30, 'LCI'), 0);
  assert.equal(estimateIncomeTax(1000, 800, 'CDB'), 150);
});
void test('comparador calcula bruto, IR e líquido', () => {
  const result = compareInvestment({ type: 'CDB', rate: 0, indexer: 'CDI', percentIndexer: 110, referenceRate: 10, initial: 5000, months: 12 });
  assert.ok(result.gross > 5000); assert.ok(result.net < result.gross); assert.ok(result.tax > 0);
});
void test('cotação usa fonte separada, atraso e fallback em 429', async () => {
  const quote = await loadQuote('PETR4', 'b3', async () => new Response('{"results":[{"regularMarketPrice":42.5}]}'));
  assert.equal(quote?.price, 42.5); assert.equal(quote?.delayed, true);
  const unavailable = await loadQuote('UNKNOWN', 'b3', async () => new Response('', { status: 429 }));
  assert.equal(unavailable, undefined);
});
void test('Focus usa endpoint separado e fallback sem zero artificial', async () => {
  const value = await loadMarketExpectations(async () => new Response(JSON.stringify({ value: [
    { Indicador: 'Selic', Mediana: 12.5, Data: '2026-09-11', DataReferencia: String(new Date().getFullYear()), baseCalculo: 0 },
    { Indicador: 'IPCA', Mediana: 4.2, Data: '2026-09-11', DataReferencia: String(new Date().getFullYear()), baseCalculo: 0 },
  ] })));
  assert.equal(value.selic, 12.5); assert.equal(value.ipca, 4.2); assert.match(value.source, /Focus/);
});
