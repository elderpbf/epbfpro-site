// codex/index.html boot — the admin's Worker transport is now the Codex ES module
// js/worker-call.js (window.callWorker, codex-api default), not the backstage classic
// script api-client.js. worker-call.js's request/response behavior is covered by
// worker-call.test.mjs; here we pin the wiring: the boot imports worker-call.js FIRST
// (so window.callWorker is set before any consumer evaluates), and api-client.js is
// no longer loaded. This also completes the admin's Stage 2 backend cutover, since
// api-client.js hardcoded backstage-api and ignored window.WORKER_URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

test('the admin boot imports the Codex worker-call transport', () => {
  assert.match(html, /import\s+['"]\.\/js\/worker-call\.js['"]/, 'boot imports worker-call.js');
});

test('worker-call.js is imported before the first tab module (callWorker seam set first)', () => {
  const wcImport = html.indexOf("import './js/worker-call.js'");
  const topbarImport = html.indexOf("import { init as topbar }");
  assert.ok(wcImport !== -1, 'worker-call import present');
  assert.ok(topbarImport !== -1, 'topbar import present');
  assert.ok(wcImport < topbarImport, 'worker-call import precedes codex-topbar import');
});

test('the admin no longer loads backstage api-client.js', () => {
  assert.ok(!/<script[^>]+backstage\/js\/api-client\.js/.test(html), 'no backstage api-client.js script');
});

test('the admin still pins window.WORKER_URL to codex-api (explicit, reversible)', () => {
  assert.match(html, /window\.WORKER_URL\s*=\s*['"]https:\/\/codex-api\.pensoia\.workers\.dev['"]/,
    'WORKER_URL pinned to codex-api');
});
