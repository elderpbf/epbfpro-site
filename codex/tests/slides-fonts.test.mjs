// slides-fonts.test.mjs — the FONT registry (theme/fonts.js): a self-contained,
// extensible list of fonts that the picker, the lazy loader, and applyDeckTheme all
// read from. DOM-free, node:test. The loader is exercised only for its no-DOM guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FONTS, getFont, fontStack, fontLabel, fontOptions, fontMenu, ensureFont, ensureAll,
} from '../content/slides/js/theme/fonts.js';

/* ---------- the registry shape (add/remove a font = one entry here) ---------- */
test('FONTS is a non-empty registry; every entry has id/label/stack strings', () => {
  assert.ok(Array.isArray(FONTS) && FONTS.length >= 3);
  for (const f of FONTS) {
    assert.equal(typeof f.id, 'string');
    assert.ok(f.id.length);
    assert.equal(typeof f.label, 'string');
    assert.ok(f.label.length);
    assert.equal(typeof f.stack, 'string');
    assert.ok(f.stack.length);
  }
});
test('font ids are unique (the id is the stable key stored on deck.theme.font)', () => {
  const ids = FONTS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});
test('the default font (roboto) is present and carries NO webfont, so the default deck stays light + unchanged', () => {
  const r = getFont('roboto');
  assert.equal(r.id, 'roboto');
  assert.ok(!r.webfont, 'roboto must not lazy-load a webfont');
});
test('the seeded fonts Élder asked for are present (roboto, raleway, arial)', () => {
  for (const id of ['roboto', 'raleway', 'arial']) {
    assert.ok(FONTS.some((f) => f.id === id), `expected seed font ${id}`);
  }
});
test('system fonts (arial/georgia) carry no webfont; Google fonts (raleway) do', () => {
  assert.ok(!getFont('arial').webfont);
  assert.ok(!getFont('georgia').webfont);
  assert.ok(getFont('raleway').webfont, 'raleway needs a webfont to load');
});

/* ---------- lookups fall back so a legacy/unknown deck never breaks ---------- */
test('getFont/fontStack/fontLabel fall back to the default for an unknown or missing id', () => {
  assert.equal(getFont('does-not-exist').id, 'roboto');
  assert.equal(getFont(undefined).id, 'roboto'); // legacy deck with no theme.font
  assert.equal(fontStack('nope'), getFont('roboto').stack);
  assert.equal(fontLabel(undefined), 'Roboto');
});
test('fontStack/fontLabel resolve a known id', () => {
  assert.equal(fontStack('raleway'), getFont('raleway').stack);
  assert.equal(fontLabel('raleway'), 'Raleway');
});
test('fontOptions returns one lightweight {id,label,stack} row per registered font', () => {
  const opts = fontOptions();
  assert.equal(opts.length, FONTS.length);
  assert.deepEqual(opts.map((o) => o.id), FONTS.map((f) => f.id));
  assert.ok(opts.every((o) => o.label && o.stack));
});

/* ---------- picker DATA (the registry owns its own control list) ---------- */
test('fontMenu returns one button per font, each with a run + a typeface preview', () => {
  const m = fontMenu('raleway');
  assert.equal(m.length, FONTS.length);
  assert.ok(m.every((c) => c.type === 'button' && typeof c.run === 'function'));
  assert.deepEqual(m.map((c) => c.id), FONTS.map((f) => 'font-' + f.id));
  // each option previews in its own typeface (the `font` widget hook)
  const raleway = m.find((c) => c.id === 'font-raleway');
  assert.equal(raleway.font, getFont('raleway').stack);
  assert.equal(raleway.label, 'Raleway');
});
test('fontMenu marks exactly the current font as on', () => {
  const m = fontMenu('inter');
  assert.equal(m.filter((c) => c.on).length, 1);
  assert.equal(m.find((c) => c.on).id, 'font-inter');
});
test('a font option applies the font deck-wide, closes the dropdown, and reopens Appearance', () => {
  const calls = [];
  const app = {
    setTheme: (k, v) => calls.push(['setTheme', k, v]),
    select: { hideDropdown: () => calls.push(['hideDropdown']) },
    reopenAppearance: () => calls.push(['reopen']),
  };
  fontMenu('roboto').find((c) => c.id === 'font-poppins').run(app);
  assert.deepEqual(calls, [['setTheme', 'font', 'poppins'], ['hideDropdown'], ['reopen']]);
});

/* ---------- the lazy loader is safe with no DOM (node has no document) ---------- */
test('ensureFont / ensureAll do not throw without a document (no-DOM guard)', () => {
  assert.doesNotThrow(() => ensureFont('raleway'));
  assert.doesNotThrow(() => ensureFont('arial')); // system: nothing to load
  assert.doesNotThrow(() => ensureAll());
});
