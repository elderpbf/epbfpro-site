// codex/js/toast.js — Codex-owned toast (port of BSToast), now on the cdx-
// contract: it appends a .cdx-toast div styled by css/toast.css (Codex no longer
// loads shared-components.css). Behavioral test over a DOM stub + the seam + the
// cdx- contract by source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

function makeEl() {
  const cl = new Set();
  return {
    className: '', textContent: '', parentNode: null,
    classList: { add: (c) => cl.add(c), remove: (c) => cl.delete(c), contains: (c) => cl.has(c) },
  };
}
const appended = [];
globalThis.document = { createElement: () => makeEl(), body: { appendChild(el) { appended.push(el); el.parentNode = this; } } };
globalThis.window = {};
globalThis.setTimeout = () => 0; // no-op: don't run the dwell/show timers here

const { toast } = await import('../js/toast.js');

test('toast appends a .cdx-toast element carrying the message', () => {
  appended.length = 0;
  toast('Salvo');
  assert.equal(appended.length, 1);
  assert.equal(appended[0].className, 'cdx-toast');
  assert.equal(appended[0].textContent, 'Salvo');
});

test('toast.js installs the window.BSToast seam', () => {
  assert.ok(globalThis.window.BSToast, 'seam present');
  assert.equal(typeof globalThis.window.BSToast.show, 'function');
});

test('toast is a safe no-op without a DOM', () => {
  const saved = globalThis.document;
  globalThis.document = undefined;
  assert.doesNotThrow(() => toast('x'));
  assert.doesNotThrow(() => toast('x', 1000));
  globalThis.document = saved;
});

test('css/toast.css defines the cdx- toast, not the legacy bs- class', () => {
  const css = read('../css/toast.css');
  assert.match(css, /\.cdx-toast\s*\{/, 'defines .cdx-toast');
  assert.match(css, /\.cdx-toast\.show\s*\{/, 'defines the show state');
  assert.ok(!/\.bs-toast\b/.test(css), 'no legacy .bs-toast');
});

test('toast.js emits the cdx- class, never the legacy bs- class', () => {
  const src = read('../js/toast.js');
  assert.match(src, /className\s*=\s*['"]cdx-toast['"]/);
  assert.ok(!/className\s*=\s*['"]bs-toast['"]/.test(src), 'no bs-toast emission');
});
