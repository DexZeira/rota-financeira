import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedSource } from '../src/services/indicator-cache';
import { parseFocus, focusEndpoint } from '../src/services/market-expectations';
import { parseMarketRate } from '../src/services/market-rates';
import { inflationBetweenMonths, parseInflationHistory } from '../src/services/inflation-indicators';

void test('SGS rejeita ausência, vazio, data inválida; zero observado é válido', () => {
  for (const row of [{ data: '01/09/2026' }, { valor: '', data: '01/09/2026' }, { valor: '1', data: '31/02/2026' }]) assert.equal(parseMarketRate(JSON.stringify([row])), undefined);
  assert.equal(parseMarketRate('[{"valor":"0","data":"01/09/2026"}]')?.value, 0);
});
void test('Focus separa indicador, mediana, base, ano e data mais recente', () => {
  const row = { Indicador: 'IPCA', Mediana: 4, Data: '2026-09-10', DataReferencia: '2026', baseCalculo: 0 };
  const result = parseFocus({ value: [row, { ...row, Mediana: 0, Data: '2026-09-11' }, { ...row, Mediana: 99, baseCalculo: 1 }, { ...row, Indicador: 'Selic', Mediana: 12, DataReferencia: '2027' }] }, 2026)!;
  assert.equal(result[0].ipca.value, 0);
  assert.equal(result[0].selic.value, null);
  assert.equal(result[1].selic.value, 12);
  assert.equal(result[1].selic.status, 'estimated');
  assert.match(decodeURIComponent(focusEndpoint(2026)), /baseCalculo eq 0/);
  assert.equal(parseFocus({ value: [{ Selic: 12, IPCA: 4 }] }, 2026), undefined);
});
void test('IPCA compõe meses completos, não preenche lacunas ou extrapola', () => {
  const history = parseInflationHistory([{ valor: '1', data: '01/01/2026' }, { valor: '-0.5', data: '01/02/2026' }])!;
  assert.ok(Math.abs(inflationBetweenMonths(history, '2026-01', '2026-02')! - .00495) < 1e-12);
  assert.equal(inflationBetweenMonths(history, '2026-01', '2026-03'), null);
  assert.equal(parseInflationHistory([{ valor: '1', data: '01/01/2026' }, { valor: '2', data: '01/01/2026' }]), undefined);
});
void test('cache respeita TTL, deduplica e conserva data original em 429/offline/resposta inválida', async () => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) } });
  try {
    let calls = 0;
    const parse = (x: unknown) => typeof x === 'number' && Number.isFinite(x) ? x : undefined;
    const fetcher: typeof fetch = async () => { calls++; return new Response('4.5'); };
    const [a, b] = await Promise.all([cachedSource('key', 'https://example.test', 100000, parse, fetcher), cachedSource('key', 'https://example.test', 100000, parse, fetcher)]);
    assert.deepEqual(a, b); assert.equal(calls, 1);
    assert.equal((await cachedSource('key', 'https://example.test', 100000, parse, fetcher))?.cached, true);
    assert.equal(calls, 1);
    for (const fail of [async () => new Response('', { status: 429 }), async () => new Response('null'), async () => { throw Error('offline'); }]) {
      const fallback = await cachedSource('key', 'https://example.test', 0, parse, fail);
      assert.equal(fallback?.value, 4.5); assert.equal(fallback?.fetchedAt, a?.fetchedAt); assert.equal(fallback?.cached, true);
    }
    assert.equal(await cachedSource('empty', 'https://example.test', 0, parse, async () => new Response('null')), undefined);
  } finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});
