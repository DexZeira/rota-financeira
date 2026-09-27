import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { workerSource } from '../scripts/pwa-worker.mjs';
function worker(fetchImpl = async () => {throw Error('Offline');}, clients = {}) {
  const events = new Map(), added = [], removed = [];
  runInNewContext(workerSource('rota-shell-current',['/index.html','/assets/page.js']), {
    URL, self:{ clients, location:{origin:'https://example.test'}, addEventListener:(name, callback) => events.set(name,callback) },
    caches:{open:async () => ({ addAll:async (urls) => added.push(...urls), match:async (path) => ({cached:path}), put:async () => {} }), match:async (path) => ({cached:path}),
      keys:async () => ['rota-shell-old','rota-shell-current','another-app'], delete:async (key) => removed.push(key) },
    fetch:fetchImpl,
  });
  return {events,added,removed};
}
void test('PWA: instalação pública, limpeza restrita e navegação offline',async () => {
  const w = worker(); let pending;
  w.events.get('install')({waitUntil:(p) => {pending=p;}}); await Promise.resolve(pending);
  assert.deepEqual(w.added,['/index.html','/assets/page.js']);
  w.events.get('activate')({waitUntil:(p) => {pending=p;}}); await Promise.resolve(pending);
  assert.deepEqual(w.removed,['rota-shell-old']);
  w.events.get('fetch')({request:{url:'https://example.test/',method:'GET',mode:'navigate'},respondWith:(p) => {pending=p;}});
  assert.equal((await Promise.resolve(pending)).cached,'/index.html');
});
void test('PWA: navegação online sempre atualiza o shell em cache',async () => {
  const response = { clone: () => ({ updated: true }), updated: true };
  const w = worker(async () => response); let pending;
  w.events.get('fetch')({request:{url:'https://example.test/',method:'GET',mode:'navigate'},respondWith:(p) => {pending=p;}});
  assert.equal((await Promise.resolve(pending)).updated, true);
});
void test('PWA nunca intercepta Auth, dados, POST, origens externas ou URLs com tokens',() => {
  const w = worker();
  for (const [url,method] of [['https://example.test/rest/v1/user_app_state','GET'],['https://example.test/auth/v1/token','POST'],['https://cloud.example/assets/page.js','GET'],['https://example.test/?code=private','GET']]) {
    w.events.get('fetch')({request:{url,method,mode:'cors'},respondWith:() => assert.fail('Requisição privada interceptada')});
  }
});

void test('PWA: clique em notificação foca o app e abre somente destino permitido', async () => {
  const calls=[];
  const clients={matchAll:async()=>[{url:'https://example.test/',focus:async()=>calls.push('focus'),postMessage:m=>calls.push(m.route)}],openWindow:async()=>assert.fail('Janela duplicada')};
  const w=worker(undefined,clients);let pending;
  w.events.get('notificationclick')({notification:{data:{route:'Dívidas'},close:()=>calls.push('close')},waitUntil:p=>{pending=p;}});
  await Promise.resolve(pending);assert.deepEqual(calls,['close','focus','Dívidas']);
  w.events.get('notificationclick')({notification:{data:{route:'https://evil.test'},close:()=>{}},waitUntil:()=>assert.fail('Destino externo')});
});
void test('PWA: clique sem janela abre hash local, sem tokens ou consulta de rede financeira', async () => {
  const opened=[];
  const w=worker(undefined,{matchAll:async()=>[],openWindow:async url=>opened.push(url)});let pending;
  w.events.get('notificationclick')({notification:{data:{route:'Investimentos'},close:()=>{}},waitUntil:p=>{pending=p;}});
  await Promise.resolve(pending);assert.deepEqual(opened,['/#notification=Investimentos']);
});
