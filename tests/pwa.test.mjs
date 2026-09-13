import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { workerSource } from '../scripts/pwa-worker.mjs';
function worker() {
  const events = new Map(), added = [], removed = [];
  runInNewContext(workerSource('rota-shell-current',['/index.html','/assets/page.js']), {
    URL, self:{ location:{origin:'https://example.test'}, addEventListener:(name, callback) => events.set(name,callback) },
    caches:{open:async () => ({ addAll:async (urls) => added.push(...urls), match:async (path) => ({cached:path}) }),
      keys:async () => ['rota-shell-old','rota-shell-current','another-app'], delete:async (key) => removed.push(key) },
    fetch:async () => {throw Error('Offline');},
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
void test('PWA nunca intercepta Auth, dados, POST, origens externas ou URLs com tokens',() => {
  const w = worker();
  for (const [url,method] of [['https://example.test/rest/v1/user_app_state','GET'],['https://example.test/auth/v1/token','POST'],['https://cloud.example/assets/page.js','GET'],['https://example.test/?code=private','GET']]) {
    w.events.get('fetch')({request:{url,method,mode:'cors'},respondWith:() => assert.fail('Requisição privada interceptada')});
  }
});
