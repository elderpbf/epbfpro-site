// codex/js/form-enter.js — the Codex-owned "Enter submits the nearest form"
// handler (ported from the legacy utils.js). Tests the pure handleEnter logic
// over stub events. (Importing under node installs nothing: the document guard is
// false, so the module has no import-time side effect here.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleEnter } from '../js/form-enter.js';

function makeBtn(disabled = false) {
  return { disabled, clicks: 0, click() { this.clicks++; } };
}
// parent: querySelector returns the configured button (or null). When parent is
// null, target.closest returns null (no enclosing form).
function ev(key, tagName, { shift = false, btn = undefined, hasParent = true } = {}) {
  const parent = hasParent ? { querySelector: () => (btn === undefined ? null : btn) } : null;
  let prevented = false;
  return {
    key, shiftKey: shift,
    target: { tagName, closest: () => parent },
    preventDefault() { prevented = true; },
    prevented: () => prevented,
  };
}

test('Enter on an input clicks the nearest submit button', () => {
  const btn = makeBtn();
  const e = ev('Enter', 'INPUT', { btn });
  handleEnter(e);
  assert.equal(btn.clicks, 1);
  assert.equal(e.prevented(), true, 'default Enter suppressed');
});

test('plain Enter on a textarea submits too', () => {
  const btn = makeBtn();
  handleEnter(ev('Enter', 'TEXTAREA', { btn }));
  assert.equal(btn.clicks, 1);
});

test('Shift+Enter on a textarea is left alone (newline)', () => {
  const btn = makeBtn();
  const e = ev('Enter', 'TEXTAREA', { shift: true, btn });
  handleEnter(e);
  assert.equal(btn.clicks, 0, 'no submit');
  assert.equal(e.prevented(), false, 'newline preserved');
});

test('Enter on a non-field element is ignored', () => {
  const btn = makeBtn();
  const e = ev('Enter', 'DIV', { btn });
  handleEnter(e);
  assert.equal(btn.clicks, 0);
  assert.equal(e.prevented(), false);
});

test('non-Enter keys are ignored', () => {
  const btn = makeBtn();
  handleEnter(ev('a', 'INPUT', { btn }));
  assert.equal(btn.clicks, 0);
});

test('no enclosing form-parent: nothing is clicked', () => {
  const e = ev('Enter', 'INPUT', { hasParent: false });
  handleEnter(e);
  assert.equal(e.prevented(), true, 'still suppresses the default Enter');
});

test('a disabled submit button is not clicked', () => {
  const btn = makeBtn(true);
  handleEnter(ev('Enter', 'INPUT', { btn }));
  assert.equal(btn.clicks, 0);
});

test('a form with no submit button does nothing', () => {
  // btn undefined => querySelector returns null
  assert.doesNotThrow(() => handleEnter(ev('Enter', 'INPUT', {})));
});
