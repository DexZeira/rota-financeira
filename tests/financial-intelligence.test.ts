import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow } from '../src/model';
import { backup, parseBackup, validateData, save, STORAGE_KEY } from '../src/services/storage';
import { investmentAnnualRate, investmentProjection, correctedPlan, concentration, debtOpportunity, currencyReturn } from '../src/services/financial-intelligence';
import { personalExpenseVariation } from '../src/services/personal-expenses';

void test('variação pessoal usa meses completos e não confunde gasto com preço', () => {
  const d = defaults();
  d.expenses = [{ ...emptyRow('expenses'), id: 'a', date: '2026-07-01', amount: 100 }, { ...emptyRow('expenses'), id: 'b', date: '2026-08-01', amount: 150 }, { ...emptyRow('expenses'), id: 'c', date: '2026-09-01', amount: 900 }];
  const result = personalExpenseVariation(d, '2026-09-15');
  assert.equal(result.categories[0].change, .5);
  assert.equal(result.priceIndex, null);
  assert.equal(result.categories[0].after, 150);
  d.expenses = [d.expenses[1]];
  assert.equal(personalExpenseVariation(d, '2026-09-15').categories[0].change, null);
});

void test('inteligência: metadados migram sem corrigir valores antigos e round trip idempotente', () => {
  const old = defaults(); delete old.intelligenceVersion;
  old.plans = [{ ...emptyRow('plans'), id: 'plan', name: 'Moto', target: 40000, deadline: '2030-01-01' }];
  delete old.plans[0].inflationMode;
  const migrated = validateData(old);
  assert.equal(migrated.intelligenceVersion, 1);
  assert.equal(migrated.plans[0].inflationMode, 'Sem correção');
  assert.equal(migrated.plans[0].target, 40000);
  migrated.plans[0] = { ...migrated.plans[0], inflationMode: 'Taxa personalizada', inflationBaseDate: '2025-01-01', inflationRate: 5, adjustContributions: 'sim' };
  migrated.investments = [{ ...emptyRow('investments'), id: 'inv', name: 'Título', balance: 1000.23, issuer: 'Emissor', liquidity: 'D+1', fgcStatus: 'sim', annualFeePercent: .135 }];
  const restored = parseBackup(backup(migrated));
  assert.deepEqual(restored, migrated);
  assert.deepEqual(validateData(restored), restored);
  assert.throws(() => validateData({ ...restored, intelligenceVersion: 99 }));
});
void test('metadados preservam snapshot anterior; quota interrompe a migração com segurança', () => {
  const d = defaults();
  const wire = JSON.parse(backup(d)).data; delete wire.intelligenceVersion;
  const original = JSON.stringify(wire);
  const store = new Map([[STORAGE_KEY, original]]);
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  assert.throws(() => save({ ...storage, setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); } }, d));
  assert.equal(store.get(STORAGE_KEY), original);
  save(storage, d);
  assert.equal(store.get('rota-money-before-migration:intelligence-v1:guest'), original);
  const count = store.size;
  save(storage, d); assert.equal(store.size, count);
});
void test('projeção de investimento não inventa custos nem rentabilidade de ativo variável', () => {
  const row = { ...emptyRow('investments'), balance: 1000, category: 'CDB', rateType: 'Prefixado', yield: 10 };
  assert.equal(investmentAnnualRate({ ...row, category: 'Ação' }, {}, .05), null);
  assert.equal(investmentAnnualRate({ ...row, rateType: 'Pós-fixado', indexer: 'CDI', indexerPercent: 110 }, {}, .05), null);
  assert.equal(investmentProjection(row, {}, .05, 1000)?.netFinal, null);
  const net = investmentProjection({ ...row, annualFeePercent: 0 }, {}, .05, 1000)!;
  assert.equal(net.netFinal, 1082.5);
  assert.ok(net.netRealRate! > 0);
});
void test('meta corrigida deriva de base fixa; Focus ausente não vira zero', () => {
  const row = { ...emptyRow('plans'), target: 40000, inflationMode: 'Taxa personalizada', inflationRate: 5, inflationBaseDate: '2025-01-01', deadline: '2030-01-01' };
  const focus = { source: 'Focus' };
  const result = correctedPlan(row, {}, focus);
  assert.ok(Math.abs(result.adjusted! - 51051.26) < 2);
  assert.equal(row.target, 40000);
  assert.equal(correctedPlan({ ...row, inflationMode: 'IPCA esperado' }, {}, focus).adjusted, null);
  assert.equal(correctedPlan({ ...row, inflationMode: 'Sem correção' }, {}, focus).adjusted, 40000);
});
void test('concentração preserva desconhecidos e comparação de dívida/câmbio usa composição', () => {
  const d = defaults();
  d.investments = [{ ...emptyRow('investments'), id: 'a', issuer: 'A', balance: 700 }, { ...emptyRow('investments'), id: 'b', balance: 300 }];
  assert.equal(concentration(d, 'issuer')[0].percent, 70);
  assert.equal(concentration(d, 'issuer')[1].name, 'Não informado');
  assert.equal(debtOpportunity(.18, .107)?.debtCostsMore, true);
  assert.ok(Math.abs(debtOpportunity(.18, .107)!.differencePoints + 7.3) < 1e-12);
  assert.equal(debtOpportunity(null, .1), null);
  assert.ok(Math.abs(currencyReturn(.1, .2)!.totalBrl - .32) < 1e-12);
});
