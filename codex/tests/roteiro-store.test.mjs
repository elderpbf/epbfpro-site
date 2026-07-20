// tests/roteiro-store.test.mjs
// track-46 fatia 2, behavioral tests for the REAL per-aula store
// (roteiro/roteiro-store.js), which replaces the fatia-1 localStorage stub.
// callWorker is stubbed (facade seam), matching facade-*.test.mjs. These pin
// the load-bearing rules the advisor flagged: load() stays synchronous (the
// view's mount() never awaits it), save() never seeds/loses roteiro_base_number,
// blank-by-default on a null/missing seed, and a failed save reaches bsLog
// instead of becoming a silent/unhandled rejection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRoteiroStore } from '../roteiro/roteiro-store.js';

const readSrc = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

function stubWorker(fn) { globalThis.callWorker = fn; }
function restoreWorker() { delete globalThis.callWorker; }

test('load() is SYNCHRONOUS: returns the roteiro straight from the seed, no promise', () => {
  const seed = { roteiro_json: JSON.stringify({ blocos: [{ nome: 'B', pontos: [] }] }), roteiro_base_number: 2 };
  const store = createRoteiroStore(11, seed);
  const out = store.load(11);
  assert.ok(out && Array.isArray(out.blocos), 'load() returns a plain roteiro object, not a Promise');
  assert.equal(out.blocos.length, 1);
});

test('blank by default: null/undefined seed (nothing saved yet) loads an empty roteiro, never seeds demo content', () => {
  const store1 = createRoteiroStore(12, null);
  assert.deepEqual(store1.load(), { blocos: [] });
  const store2 = createRoteiroStore(13, undefined);
  assert.deepEqual(store2.load(), { blocos: [] });
  const store3 = createRoteiroStore(14, { roteiro_json: null, roteiro_base_number: null });
  assert.deepEqual(store3.load(), { blocos: [] });
});

test('save() calls ct_set_aula_roteiro with the bound aulaId + JSON roteiro', async () => {
  let seen = null;
  stubWorker((p) => { seen = p; return Promise.resolve({ ok: true }); });
  const store = createRoteiroStore(99, { roteiro_json: '{"blocos":[]}', roteiro_base_number: null });
  await store.save(99, { blocos: [{ nome: 'X', pontos: [] }] });
  restoreWorker();
  assert.equal(seen.action, 'ct_set_aula_roteiro');
  assert.equal(seen.id, 99);
  assert.deepEqual(JSON.parse(seen.roteiro_json), { blocos: [{ id: 'b1', nome: 'X', pausa: false, pontos: [] }] });
});

test('save() carries the CURRENT roteiro_base_number on every save, seeded from the initial fetch', async () => {
  let seen = null;
  stubWorker((p) => { seen = p; return Promise.resolve({ ok: true }); });
  const store = createRoteiroStore(5, { roteiro_json: '{"blocos":[]}', roteiro_base_number: 3 });
  await store.save(5, { blocos: [] });
  restoreWorker();
  assert.equal(seen.roteiro_base_number, 3, 'a plain edit-save must not silently wipe the base pointer');
});

// Trocar de base NAO muta o store: cohorts.js reconstroi um novo via
// createRoteiroStore(aulaId, applied). Este e o unico caminho em producao (o par
// get/setBaseNumber foi removido por nao ter nenhum chamador), entao e ele que o
// teste trava: o store novo ja mostra o conteudo copiado E leva a base nova no save.
test('trocar de base = store NOVO com o payload aplicado, e o save seguinte carrega a base nova', async () => {
  const applied = { roteiro_json: '{"blocos":[{"nome":"Contexto","pontos":[]}]}', roteiro_base_number: 4 };
  const store = createRoteiroStore(5, applied);
  assert.deepEqual(
    store.load(),
    { blocos: [{ id: 'b1', nome: 'Contexto', pausa: false, pontos: [] }] },
    'a view ja enxerga o conteudo copiado, nunca o estado pre-copia',
  );
  let seen = null;
  stubWorker((p) => { seen = p; return Promise.resolve({ ok: true }); });
  await store.save(5, store.load());
  restoreWorker();
  assert.equal(seen.roteiro_base_number, 4, 'a base nova viaja no save seguinte');
});

test('a rejected save() reaches window.bsLog, never an unhandled/silent failure', async () => {
  const logged = [];
  globalThis.window = { bsLog: (m) => logged.push(m) };
  stubWorker(() => Promise.reject(new Error('network down')));
  const store = createRoteiroStore(7, { roteiro_json: '{"blocos":[]}', roteiro_base_number: null });
  await store.save(7, { blocos: [] }); // must NOT throw / must NOT reject
  restoreWorker();
  delete globalThis.window;
  assert.equal(logged.length, 1, 'logged exactly once');
  assert.match(logged[0], /network down/);
});

test('roteiro-store.js is facade-only (no direct callWorker, no localStorage)', () => {
  // Source-level: the store must never touch the transport or the browser
  // storage directly, only the js/codex-api.js facade.
  const src = readSrc('../roteiro/roteiro-store.js');
  assert.ok(!/\bcallWorker\s*\(/.test(src), 'no direct callWorker() call');
  assert.ok(!/localStorage/.test(src), 'no localStorage reference');
  assert.match(src, /from\s+['"]\.\.\/js\/codex-api\.js['"]/, 'imports the facade');
});
