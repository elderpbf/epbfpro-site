// Toast: the transient status surface (bottom-right, ephemeral). Distinct from
// the persistent top-right notice surface (notice.test.mjs). Status confirmations
// and quick validation use toast; actionable alerts use notice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as toast from '../js/toast.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('toast exports the status API (ok/err/info)', () => {
  for (const fn of ['ok', 'err', 'info']) {
    assert.equal(typeof toast[fn], 'function', `exports ${fn}`);
  }
});

test('toast is a no-op without a DOM (no throw)', () => {
  assert.doesNotThrow(() => { toast.ok('a'); toast.err('b'); toast.info('c'); });
});

test('each level maps to its color modifier class', () => {
  const src = read('../js/toast.js');
  assert.match(src, /ok\(msg\)\s*\{\s*_show\(msg,\s*'success'\)/, 'ok -> success');
  assert.match(src, /err\(msg\)\s*\{\s*_show\(msg,\s*'danger'\)/, 'err -> danger');
  assert.match(src, /info\(msg\)\s*\{\s*_show\(msg,\s*'info'\)/, 'info -> info');
  assert.match(src, /'cdx-toast cdx-toast-'\s*\+\s*type/, 'applies cdx-toast + color modifier');
});

test('toast layout is the bottom-right surface in components.css', () => {
  const css = read('../css/components.css');
  assert.match(css, /\.cdx-toast\s*\{[^}]*bottom:/, 'positioned from the bottom');
  for (const c of ['cdx-toast-success', 'cdx-toast-danger', 'cdx-toast-info']) {
    assert.match(css, new RegExp('\\.' + c.replace('-', '\\-')), `has .${c}`);
  }
});
