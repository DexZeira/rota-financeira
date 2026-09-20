import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, collections, emptyRow, today } from '../src/model';
import { parseBackup } from '../src/services/storage';
import { backupFilename, downloadBackup, DOWNLOAD_FALLBACK } from '../src/services/backup-download';

function fakeBrowser(t: TestContext, fail?: 'url' | 'attach' | 'click' | 'unsupported') {
  let blob: Blob | undefined;
  let clicks = 0, removed = 0, revoked = 0;
  let timer: (() => void) | undefined;
  const anchor = {
    href: '', download: '', hidden: false,
    click() { if (fail === 'click') throw Error('Bloqueado'); clicks++; },
    remove() { removed++; },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => fail === 'unsupported' ? {remove() {}} : anchor,
    body: { appendChild() { if (fail === 'attach') throw Error('DOM indisponível'); } },
  }});
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); });
  t.mock.method(URL, 'createObjectURL', (value: Blob) => { if (fail === 'url') throw Error('Indisponível'); blob = value; return 'blob:backup-test'; });
  t.mock.method(URL, 'revokeObjectURL', () => { revoked++; });
  t.mock.method(globalThis, 'setTimeout', (callback: () => void, delay: number) => { assert.equal(delay, 30000); timer = callback; return 1; });
  return {anchor, get blob() {return blob;}, get clicks() {return clicks;}, get removed() {return removed;}, get revoked() {return revoked;}, cleanup() {timer?.();}};
}

void test('nome do backup usa data e hora local com zero à esquerda', () => {
  assert.equal(backupFilename(new Date(2026,8,10,8,55)), 'rota-financeira-backup-2026-09-10-08-55.json');
  assert.equal(backupFilename(new Date(2026,0,2,3,4)), 'rota-financeira-backup-2026-01-02-03-04.json');
});

void test('download gera Blob JSON válido com payload completo e libera recursos', async t => {
  const browser=fakeBrowser(t), data=defaults();
  data.settings.openingCash=123.45;
  data.work=[{...emptyRow('work'),id:'test-work',date:today(),activity:'Teste',hours:1,km:5,revenue:30}];
  data.plans=[{...emptyRow('plans'),id:'test-plan',name:'Objetivo',deadline:'2027-12-01',target:1000}];
  data.planTransactions=[{...emptyRow('planTransactions'),id:'test-deposit',planId:'test-plan',date:today(),kind:'deposit',amount:100}];
  const before=JSON.stringify(data);
  const result=downloadBackup(data,new Date(2026,8,10,8,55));
  assert.equal(result.ok,true);
  assert.equal(browser.anchor.download,'rota-financeira-backup-2026-09-10-08-55.json');
  assert.equal(browser.anchor.href,'blob:backup-test');
  assert.equal(browser.blob?.type,'application/json;charset=utf-8');
  const text=await browser.blob!.text(), payload=JSON.parse(text);
  assert.deepEqual(Object.keys(payload),['version','exportDate','data']);
  assert.equal(payload.version,6);assert.ok(Number.isFinite(Date.parse(payload.exportDate)));
  assert.equal(payload.data.moneyUnit,'centavos');
  assert.equal(payload.data.settings.openingCash,12345);
  for(const key of collections) assert.deepEqual(parseBackup(text)[key],data[key]);
  assert.deepEqual(parseBackup(text),data);
  assert.equal(JSON.stringify(data),before);
  assert.equal(browser.clicks,1);assert.equal(browser.removed,1);assert.equal(browser.revoked,0);
  browser.cleanup();assert.equal(browser.revoked,1);
});

for (const stage of ['url','attach','click','unsupported'] as const) {
 void test(`falha de download em ${stage} retorna aviso sem lançar erro`, t => {
  const browser=fakeBrowser(t,stage), data=defaults(), before=JSON.stringify(data);
  assert.deepEqual(downloadBackup(data),{ok:false,message:DOWNLOAD_FALLBACK});
  assert.equal(JSON.stringify(data),before);
  assert.equal(browser.revoked,stage==='attach'||stage==='click'?1:0);
  assert.equal(browser.clicks,0);
 });
}

void test('falha ao serializar é contida e oferece Copiar backup', t => {
 const browser=fakeBrowser(t),data=defaults();
 Object.defineProperty(data,'toJSON',{value:()=>{throw Error('Serialização indisponível');}});
 assert.deepEqual(downloadBackup(data),{ok:false,message:DOWNLOAD_FALLBACK});
 assert.equal(browser.clicks,0);
});
