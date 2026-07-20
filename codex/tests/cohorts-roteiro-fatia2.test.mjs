// tests/cohorts-roteiro-fatia2.test.mjs
// track-46 fatia 2a/2b/2c, source-level contract for cohorts.js's Roteiro
// sub-tab wiring: the fatia-1 localStorage stub is gone, the real store +
// base-selector are wired in, the aula's roteiro is fetched through the facade
// BEFORE mount (roteiro-view.js's store.load() contract stays synchronous), and
// the dev-only gate from fatia 1 is still intact (production-dormant this fatia
// too, per the brief).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const readSrc = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const cohorts = readSrc('../cohorts/cohorts.js');

test('the fatia-1 stub file is gone, and cohorts.js no longer references it', () => {
  const stubPath = fileURLToPath(new URL('../roteiro/roteiro-store-stub.js', import.meta.url));
  assert.ok(!fs.existsSync(stubPath), 'roteiro-store-stub.js was deleted this fatia');
  assert.ok(!/roteiro-store-stub/.test(cohorts), 'cohorts.js no longer imports the stub');
});

test('cohorts.js wires the REAL store + the base-selector module', () => {
  assert.match(cohorts, /import\s*\{\s*createRoteiroStore\s*\}\s*from\s*['"]\.\.\/roteiro\/roteiro-store\.js['"]/, 'imports the real store factory');
  assert.match(cohorts, /import\s+\*\s+as\s+roteiroBase\s+from\s+['"]\.\.\/roteiro\/roteiro-base\.js['"]/, 'imports the base-selector module');
  assert.match(cohorts, /import\s+\*\s+as\s+roteiroView\s+from\s+['"]\.\.\/roteiro\/roteiro-view\.js['"]/, 'still imports the unchanged two-panel view');
});

test('the aula roteiro is fetched through the facade BEFORE roteiroView.mount is called', () => {
  // roteiro-view.js's store.load() is synchronous by contract (fatia 1, kept
  // unchanged): the async ct_get_aula_roteiro read must happen in cohorts.js,
  // ahead of mount, and its response seeds createRoteiroStore.
  assert.match(cohorts, /roteiroApi\.getAula\(\s*\{\s*id:\s*aula\.id\s*\}\s*\)/, 'fetches the aula roteiro via the facade');
  const mountFnMatch = cohorts.match(/function _mountRoteiroEmbeds[\s\S]*?\n\}/);
  assert.ok(mountFnMatch, '_mountRoteiroEmbeds exists');
  assert.match(mountFnMatch[0], /createRoteiroStore\(aula\.id,\s*seed\)/, 'seeds the store from the pre-fetched response');
  assert.match(mountFnMatch[0], /roteiroView\.mount\(/, 'mounts the (unchanged) two-panel view');
  assert.match(mountFnMatch[0], /roteiroBase\.mount\(/, 'mounts the base selector alongside it');
});

test('onApplied (copy-down/blank) remounts the view on a FRESH store, not a reused stale one', () => {
  // Regression guard: createRoteiroStore(aulaId, seed).load() replays a seed
  // frozen at creation time (the view's store.load() stays synchronous by
  // contract). Reusing the store built at the pane's initial mount here would
  // show the PRE-copy content until the teacher navigates away and back --
  // defeating "Selecionar" (the base spec's whole point). onApplied must build a
  // NEW store off the payload it just received.
  const start = cohorts.indexOf('onApplied: (applied)');
  assert.ok(start !== -1, 'onApplied handler found');
  const body = cohorts.slice(start, start + 900);
  assert.match(body, /createRoteiroStore\(aula\.id,\s*applied\)/, 'builds a fresh store from the just-applied payload');
});

test('a stale in-flight fetch is guarded against a mid-flight aula/sub-tab switch', () => {
  assert.match(cohorts, /_roteiroLoadToken/, 'uses a token to invalidate stale async loads');
  // the guard must appear inside the getAula().then() chain
  const fnMatch = cohorts.match(/function _mountRoteiroPane[\s\S]*?\n\}/);
  assert.ok(fnMatch, '_mountRoteiroPane exists');
  assert.match(fnMatch[0], /token !== _roteiroLoadToken/, 'checks the token before applying a resolved fetch');
});

test('_unmountAulaEmbeds tears down both the base selector and the view, and invalidates pending loads', () => {
  const fnMatch = cohorts.match(/function _unmountAulaEmbeds[\s\S]*?\n\}/);
  assert.ok(fnMatch, '_unmountAulaEmbeds exists');
  assert.match(fnMatch[0], /roteiroBase\.unmount\(\)/, 'unmounts the base selector');
  assert.match(fnMatch[0], /roteiroView\.unmount\(\)/, 'unmounts the two-panel view');
  assert.match(fnMatch[0], /_roteiroLoadToken\+\+/, 'bumps the load token so a stale fetch cannot mount into a torn-down pane');
});

test('_aulaEmbedMounted tracks the base-selector embed alongside the others', () => {
  assert.match(cohorts, /_aulaEmbedMounted\s*=\s*\{\s*liberacoes:\s*false,\s*tarefas:\s*false,\s*apps:\s*false,\s*roteiro:\s*false,\s*roteiroBase:\s*false\s*\}/);
});

// Superseded by fatia 2.5 (Élder: the gate only existed to ship dormant while
// the feature was half-built; now that it has full CRUD it ships visible —
// see tests/roteiro-view.test.mjs's "NÃO é mais gated" test, which pins this
// same reversal). Kept here (not deleted) because the rest of this file's
// wiring assertions (store/base-selector/facade/teardown) are still live.
test('the Roteiro sub-tab is plugged in and NO LONGER dev-only-gated (track-46 fatia 2.5)', () => {
  assert.match(cohorts, /data-aulatab=["']roteiro["']/, 'roteiro sub-tab button');
  assert.ok(!/cdx-aula-stab cdx-dev-only/.test(cohorts), 'the dev-only gate was removed');
});

test('the roteiro pane reaches the backend ONLY through the facade (no direct callWorker)', () => {
  // Scoped to the new pane functions, not the whole 2000+-line file.
  const scope = [
    cohorts.match(/function _mountRoteiroPane[\s\S]*?\n\}/),
    cohorts.match(/function _mountRoteiroEmbeds[\s\S]*?\n\}/),
  ].filter(Boolean).map((m) => m[0]).join('\n');
  assert.ok(scope.length > 0, 'found the roteiro pane functions');
  assert.ok(!/\bcallWorker\s*\(/.test(scope), 'no direct callWorker() call');
  assert.match(cohorts, /import\s*\{[^}]*\broteiro\s+as\s+roteiroApi\b[^}]*\}\s*from\s*['"]\.\.\/js\/codex-api\.js['"]/, 'imports the roteiro facade group');
});
