// Regression guard for the legacy served-Trail purge (audit P0 + dead-code).
// The served trilha/ tree used to carry a public dev backdoor (probe.html +
// probe-collect.php / probe-proxy.php, which hit backstage-api with a hardcoded
// token and accepted arbitrary POSTed JSON to disk) plus the whole pre-port
// legacy stack: the trilha/js/trilha-*.js IIFE modules, three Node *.test.js
// files served as public JS, and the old trilha/js/validar.js + trilha/css/*.
// All of it was loaded ONLY by probe.html; the live Trail pages load everything
// from /codex/trilha/. This test keeps that surface deleted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const abs = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const exists = (rel) => fs.existsSync(abs(rel));
const read = (rel) => fs.readFileSync(abs(rel), 'utf8');

test('the public probe backdoor (html + php collectors) is gone', () => {
  for (const f of ['probe.html', 'probe-collect.php', 'probe-proxy.php']) {
    assert.ok(!exists('../../trilha/' + f), `trilha/${f} must be deleted (public no-auth backdoor)`);
  }
});

test('the legacy trilha/js tree (IIFE modules + served Node tests) is gone', () => {
  const dir = abs('../../trilha/js');
  if (!fs.existsSync(dir)) return; // dir removed entirely is fine
  const left = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.deepEqual(left, [], `trilha/js still has .js files: ${left.join(', ')}`);
});

test('the legacy trilha/css tree is gone', () => {
  const dir = abs('../../trilha/css');
  if (!fs.existsSync(dir)) return;
  const left = fs.readdirSync(dir).filter((f) => f.endsWith('.css'));
  assert.deepEqual(left, [], `trilha/css still has .css files: ${left.join(', ')}`);
});

test('no live Trail page references the legacy /trilha/js or /trilha/css paths', () => {
  // The live entry pages (both synced trees) must load only /codex/trilha/ assets.
  const pages = ['../../trilha/index.html', '../../trilha/validar.html', '../trilha/index.html', '../trilha/validar.html'];
  for (const p of pages) {
    const html = read(p);
    assert.ok(!/=["']\/trilha\/js\//.test(html), `${p} still references /trilha/js/`);
    assert.ok(!/=["']\/trilha\/css\//.test(html), `${p} still references /trilha/css/`);
  }
});
