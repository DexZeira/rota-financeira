import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { workerSource } from '../scripts/pwa-worker.mjs';
function worker(fetchImpl = async () => {throw Error('Offline');}, clients = {}, urls = ['/index.html','/assets/page.js']) {
  const events = new Map(), added = [], removed = [];
  runInNewContext(workerSource('rota-shell-current',urls), {
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
void test('PWA: navegação online retorna a rede sem prender o usuário ao shell antigo',async () => {
  const response = { clone: () => ({ updated: true }), updated: true };
  const w = worker(async () => response); let pending;
  w.events.get('fetch')({request:{url:'https://example.test/',method:'GET',mode:'navigate'},respondWith:(p) => {pending=p;}});
  assert.equal((await Promise.resolve(pending)).updated, true);
});
void test('PWA: fonte da marca instalada funciona offline sem interceptar fontes externas', async () => {
  const font = '/fonts/manrope-variable.ttf';
  const w = worker(undefined, {}, ['/index.html', font]); let pending;
  w.events.get('install')({ waitUntil: p => { pending = p; } });
  await Promise.resolve(pending);
  assert.ok(w.added.includes(font));
  w.events.get('fetch')({ request: { url: 'https://example.test' + font, method: 'GET', mode: 'cors' }, respondWith: p => { pending = p; } });
  assert.equal((await Promise.resolve(pending)).cached, font);
  w.events.get('fetch')({ request: { url: 'https://fonts.example' + font, method: 'GET', mode: 'cors' }, respondWith: () => assert.fail('Fonte externa interceptada') });
});
void test('PWA: erro HTTP usa shell instalado e atualização não apaga chunks de outras abas', async () => {
  const w=worker(async()=>({ok:false,status:503}),{matchAll:async()=>[{},{}]});let pending;
  w.events.get('activate')({waitUntil:p=>{pending=p;}});await Promise.resolve(pending);assert.deepEqual(w.removed,[]);
  w.events.get('fetch')({request:{url:'https://example.test/',method:'GET',mode:'navigate'},respondWith:p=>{pending=p;}});
  assert.equal((await Promise.resolve(pending)).cached,'/index.html');
});
void test('PWA nunca intercepta Auth, dados, POST, origens externas ou URLs com tokens',() => {
  const w = worker();
  for (const [url,method] of [['https://example.test/rest/v1/user_app_state','GET'],['https://example.test/auth/v1/token','POST'],['https://cloud.example/assets/page.js','GET'],['https://example.test/?code=private','GET']]) {
    w.events.get('fetch')({request:{url,method,mode:'cors'},respondWith:() => assert.fail('Requisição privada interceptada')});
  }
});

void test('PWA mantém navegação local por view offline sem interceptar parâmetros privados', async () => {
  const w = worker(); let pending;
  w.events.get('fetch')({request:{url:'https://example.test/?view=Configura%C3%A7%C3%B5es',method:'GET',mode:'navigate'},respondWith:p=>{pending=p;}});
  assert.equal((await Promise.resolve(pending)).cached, '/index.html');
  for (const url of ['https://example.test/?view=Configura%C3%A7%C3%B5es&code=private', 'https://example.test/?view=private', 'https://example.test/?view=Hoje&view=private', 'https://example.test/auth/v1/token?view=Hoje']) {
    w.events.get('fetch')({request:{url,method:'GET',mode:'navigate'},respondWith:()=>assert.fail('URL privada interceptada')});
  }
});
void test('PWA: seções conhecidas de Configurações abrem offline, consultas privadas não', async () => {
  const w = worker(); let pending;
  for (const section of ['perfil', 'aparencia', 'financas', 'integracoes', 'notificacoes', 'dados', 'seguranca']) {
    w.events.get('fetch')({ request: { url: `https://example.test/?view=Configura%C3%A7%C3%B5es&settings=${section}`, method: 'GET', mode: 'navigate' }, respondWith: p => { pending = p; } });
    assert.equal((await Promise.resolve(pending))?.cached, '/index.html');
  }
  for (const query of ['view=Hoje&settings=perfil', 'view=Configurações&settings=private', 'view=Configurações&settings=perfil&code=private', 'view=Configurações&settings=perfil&settings=dados']) {
    w.events.get('fetch')({ request: { url: 'https://example.test/?' + query, method: 'GET', mode: 'navigate' }, respondWith: () => assert.fail('Consulta não pública interceptada') });
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
