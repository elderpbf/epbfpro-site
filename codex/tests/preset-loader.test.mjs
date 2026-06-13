// codex/js/preset-loader.js — the Codex-owned Lessons preset loader (the only
// part of the legacy window.CVPresetsUI Codex still uses). Behavioral tests over
// a minimal host stub that understands the .cv-preset-loader-* markup so the
// select/reset wiring (onSelect / onReset / setPresets / destroy) is exercised.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeListenerEl(className) {
  const listeners = {};
  return {
    className,
    addEventListener(t2, fn) { (listeners[t2] = listeners[t2] || []).push(fn); },
    removeEventListener(t2, fn) { listeners[t2] = (listeners[t2] || []).filter((f) => f !== fn); },
    dispatch(t2, ev) { (listeners[t2] || []).slice().forEach((fn) => fn(ev || {})); },
    count(t2) { return (listeners[t2] || []).length; },
  };
}
function makeHost() {
  return {
    _html: '',
    children: [],
    set innerHTML(str) {
      this._html = str;
      this.children = [];
      if (/class="cv-preset-loader-select"/.test(str)) this.children.push(makeListenerEl('cv-preset-loader-select'));
      if (/class="cv-preset-loader-reset"/.test(str)) this.children.push(makeListenerEl('cv-preset-loader-reset'));
    },
    get innerHTML() { return this._html; },
    querySelector(sel) {
      const cls = sel.replace(/^\./, '');
      return this.children.find((c) => c.className === cls) || null;
    },
  };
}
// Minimal document for the string-container resolveHost path.
globalThis.document = { querySelector: () => null };

const { mountPresetLoader } = await import('../js/preset-loader.js');

const PRESETS = [
  { id: 1, name: 'Aula 1', item_ids: ['a', 'b'] },
  { id: 2, name: 'Aula 2', item_ids: [] },
  { id: 3, name: 'Aula 3', item_ids: ['x', 'y', 'z'] },
];

test('renders a select with a placeholder + one option per preset (name + count)', () => {
  const host = makeHost();
  mountPresetLoader(host, { presets: PRESETS });
  assert.match(host.innerHTML, /<option value="">- Carregar preset -<\/option>/);
  assert.match(host.innerHTML, /<option value="1">Aula 1 \(2\)<\/option>/);
  assert.match(host.innerHTML, /<option value="2">Aula 2 \(0\)<\/option>/);
  assert.match(host.innerHTML, /<option value="3">Aula 3 \(3\)<\/option>/);
  assert.ok(host.querySelector('.cv-preset-loader-select'), 'select present');
  assert.ok(!host.querySelector('.cv-preset-loader-reset'), 'no reset when nothing is loaded');
});

test('renders nothing when there are no presets', () => {
  const host = makeHost();
  mountPresetLoader(host, { presets: [] });
  assert.equal(host.innerHTML, '');
  assert.ok(!host.querySelector('.cv-preset-loader-select'));
});

test('marks the current preset selected and shows the reset button', () => {
  const host = makeHost();
  mountPresetLoader(host, { presets: PRESETS, currentPresetId: 3 });
  assert.match(host.innerHTML, /<option value="3" selected>Aula 3 \(3\)<\/option>/);
  assert.ok(host.querySelector('.cv-preset-loader-reset'), 'reset shown when a preset is active');
});

test('escapes preset names', () => {
  const host = makeHost();
  mountPresetLoader(host, { presets: [{ id: 5, name: 'A <b> & "c"', item_ids: [] }] });
  assert.match(host.innerHTML, /A &lt;b&gt; &amp; &quot;c&quot; \(0\)/);
});

test('selecting an option fires onSelect with the preset and shows reset', () => {
  const host = makeHost();
  let picked = null;
  mountPresetLoader(host, { presets: PRESETS, onSelect: (p) => { picked = p; } });
  host.querySelector('.cv-preset-loader-select').dispatch('change', { target: { value: '2' } });
  assert.deepEqual(picked, PRESETS[1], 'onSelect got preset 2');
  assert.ok(host.querySelector('.cv-preset-loader-reset'), 'reset appears after a selection');
});

test('choosing the blank option resets', () => {
  const host = makeHost();
  let reset = 0;
  mountPresetLoader(host, { presets: PRESETS, currentPresetId: 1, onReset: () => { reset++; } });
  host.querySelector('.cv-preset-loader-select').dispatch('change', { target: { value: '' } });
  assert.equal(reset, 1, 'onReset fired');
  assert.ok(!host.querySelector('.cv-preset-loader-reset'), 'reset hidden again');
});

test('the reset button fires onReset and clears the current id', () => {
  const host = makeHost();
  let reset = 0;
  const inst = mountPresetLoader(host, { presets: PRESETS, currentPresetId: 2, onReset: () => { reset++; } });
  assert.equal(inst.getCurrentId(), 2);
  host.querySelector('.cv-preset-loader-reset').dispatch('click', {});
  assert.equal(reset, 1);
  assert.equal(inst.getCurrentId(), null);
});

test('an unknown option id is ignored (no onSelect)', () => {
  const host = makeHost();
  let calls = 0;
  mountPresetLoader(host, { presets: PRESETS, onSelect: () => { calls++; } });
  host.querySelector('.cv-preset-loader-select').dispatch('change', { target: { value: '999' } });
  assert.equal(calls, 0);
});

test('setPresets re-renders with the new list', () => {
  const host = makeHost();
  const inst = mountPresetLoader(host, { presets: [] });
  assert.equal(host.innerHTML, '');
  inst.setPresets(PRESETS);
  assert.match(host.innerHTML, /Aula 1 \(2\)/);
  assert.ok(host.querySelector('.cv-preset-loader-select'));
});

test('destroy clears the host and detaches listeners', () => {
  const host = makeHost();
  const inst = mountPresetLoader(host, { presets: PRESETS, currentPresetId: 1 });
  const sel = host.querySelector('.cv-preset-loader-select');
  inst.destroy();
  assert.equal(host.innerHTML, '');
  assert.equal(sel.count('change'), 0, 'change listener removed from the select');
});

test('resolveHost throws when a string selector matches nothing', () => {
  assert.throws(() => mountPresetLoader('#nope', { presets: [] }), /container not found/);
});
