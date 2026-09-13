import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow } from '../src/model';
import { toCents, encodeMoney, decodeMoney } from '../src/services/money-codec';
import { save, load, backup, parseBackup, STORAGE_KEY } from '../src/services/storage';
import { inspectStorage, removeStoredCopy, storageFailure } from '../src/services/storage-quota';

function memory() {
  const values = new Map<string, string>();
  return { values, get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
void test('centavos: empates, 3+ casas, negativos, representação científica e limite seguro', () => {
  for (const [value, expected] of [[1.005,101],[2.675,268],[-1.005,-101],[0.0049,0],[0.005,1],[123.45678,12346],[1e-7,0]])
    assert.equal(toCents(value), expected);
  assert.throws(() => toCents(Infinity));
  assert.throws(() => toCents(Number.MAX_SAFE_INTEGER));
});
void test('migração preserva bytes anteriores, taxas e razões; grava centavos e é idempotente', () => {
  const d = defaults(), store = memory();
  d.settings.openingCash = 123.4567;
  d.settings.idealTargetPercent = 20.12345;
  d.bike.fuelPrice = 6.789;
  d.bike.efficiency = 32.4567;
  const original = JSON.stringify(d);
  store.setItem(STORAGE_KEY, original);
  const migrated = save(store, d);
  assert.equal(store.getItem('rota-money-before-migration:guest'), original);
  assert.deepEqual(parseBackup(original), d);
  assert.equal(JSON.parse(store.getItem(STORAGE_KEY)!).settings.openingCash, 12346);
  assert.equal(migrated.settings.openingCash, 123.46);
  assert.equal(migrated.settings.idealTargetPercent, 20.12345);
  assert.equal(migrated.bike.fuelPrice, 6.789);
  assert.equal(migrated.bike.efficiency, 32.4567);
  assert.deepEqual(load(store), migrated);
  const first = store.getItem(STORAGE_KEY);
  save(store, migrated);
  assert.equal(store.getItem(STORAGE_KEY), first);
  assert.equal(store.getItem('rota-money-before-migration:guest'), original);
  assert.deepEqual(parseBackup(backup(migrated)), migrated);
  assert.equal(d.settings.openingCash, 123.4567);
});
void test('backup em centavos cobre registros e rejeita unidade ou centavos fracionários', () => {
  const d = defaults();
  d.expenses = [{...emptyRow('expenses'), id:'one',name:'Teste',amount:1.005}];
  const wire = encodeMoney(d);
  assert.equal((wire.expenses as {amount:number}[])[0].amount, 101);
  assert.throws(() => decodeMoney({...wire,moneyUnit:'reais'}));
  assert.throws(() => decodeMoney({...wire,expenses:[{amount:1.1}]}));
});
void test('falha de quota na cópia anterior impede sobrescrita; arredondamento inválido também', () => {
  const d = defaults(), store = memory();
  const original = JSON.stringify(d);
  store.setItem(STORAGE_KEY, original);
  assert.throws(() => save({...store, setItem: () => { throw new DOMException('Full','QuotaExceededError'); }}, d));
  assert.equal(store.getItem(STORAGE_KEY), original);
  d.fund = [{...emptyRow('fund'),id:'tiny',amount:0.001}];
  assert.throws(() => save(store,d));
  assert.equal(store.getItem(STORAGE_KEY), original);
});
void test('campos derivados de cartões permanecem coerentes e a segunda gravação não migra novamente', () => {
  const d = defaults(), store = memory();
  d.work = [{...emptyRow('work'),id:'cards',activity:'Entrega de cartões',hours:1,cardQuantity:2,cardUnitValue:0.335,revenue:0.67,expectedRevenue:0.67}];
  const normalized = save(store,d), first = store.getItem(STORAGE_KEY);
  assert.equal(normalized.work[0].expectedRevenue,0.68);
  assert.equal(JSON.parse(first!).work[0].expectedRevenue,68);
  save(store,normalized);
  assert.equal(store.getItem(STORAGE_KEY),first);
});
void test('quota protege conta ativa, migração e dados; detecta alterações entre abas', () => {
  const store = memory();
  store.setItem('rota-cloud-owner','a');
  store.setItem(STORAGE_KEY,'current');
  store.setItem('rota-cloud-account:a','active');
  store.setItem('rota-cloud-account:b','old');
  store.setItem('rota-money-before-migration:a','original');
  const inventory = inspectStorage(store);
  assert.ok(inventory.bytes > 0);
  for (const copy of inventory.copies.filter((c) => c.protected)) assert.throws(() => removeStoredCopy(store,copy));
  const old = inventory.copies.find((c) => c.key.endsWith(':b'))!;
  store.setItem(old.key,'changed');
  assert.throws(() => removeStoredCopy(store,old));
  removeStoredCopy(store, inspectStorage(store).copies.find((c) => c.key === old.key)!);
  assert.equal(store.getItem(old.key),null);
  assert.equal(store.getItem(STORAGE_KEY),'current');
  assert.match(storageFailure(new DOMException('full','QuotaExceededError')),/cheio/);
});
