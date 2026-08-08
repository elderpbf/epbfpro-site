// Shared Codex notice system + the pill-vs-toast rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as notice from '../js/notice.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('notice exports the documented API', () => {
  for (const fn of ['ok', 'info', 'warn', 'error', 'internal']) {
    assert.equal(typeof notice[fn], 'function', `exports ${fn}`);
  }
});

test('notice.internal logs to the debug pill (and shows no user UI)', () => {
  const logged = [];
  globalThis.window = { bsLog: (m) => logged.push(m) };
  notice.internal(new Error('boom'));
  delete globalThis.window;
  assert.equal(logged.length, 1, 'pilled exactly once');
  assert.match(logged[0], /boom/, 'includes the error message');
});

test('notice.internal accepts a plain string detail', () => {
  const logged = [];
  globalThis.window = { dbg: (lvl, m) => logged.push(m) };
  notice.internal('plain detail');
  delete globalThis.window;
  assert.match(logged[0], /plain detail/);
});

test('notice.internal is a no-op when no pill is present (no throw)', () => {
  assert.doesNotThrow(() => notice.internal('nothing to log to'));
});

// The rule, asserted by source: internal errors route to the pill, actionable
// cases use a user notice. Modules call the shared notice module directly — no
// per-page _toast/_toastError wrapper (the consolidation that keeps behavior
// uniform across all pages).
test('items.js routes internal errors to the pill and type_in_use to a warn notice', () => {
  const items = read('../content/items.js');
  assert.doesNotMatch(items, /function _toast(Error)?\b/, 'no per-page toast wrapper (uses the shared notice module)');
  assert.match(items, /notice\.internal\(/, 'caught errors -> notice.internal (pill only)');
  assert.match(items, /notice\.warn\(t\('content\.type_in_use'\)/, 'type_in_use -> notice.warn (actionable)');
});

test('GDoc fetch failure surfaces an actionable notice in both dictionaries', () => {
  const creator = read('../content/editor/ai-box.js');
  assert.match(creator, /notice\.warn\(t\('creator\.gdoc_not_shared'\)\)/, 'GDoc failure -> actionable warn');
  const pt = read('../i18n/pt.js');
  const en = read('../i18n/en.js');
  assert.match(pt, /creator\.gdoc_not_shared/);
  assert.match(en, /creator\.gdoc_not_shared/);
});
