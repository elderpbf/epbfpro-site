// slides-textchips.test.mjs — the per-item THEME colour chips in the text format bar
// (edit/textstyle.js). The deck palette is surfaced as ready-made swatches before the
// raw "Cor" picker, so one text element can borrow a coordinated theme colour in one
// click; a reset chip clears the pin so the item follows the swatch again. DOM-free:
// the active editable + model are plain-object stubs, the same shape the real code reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeColorChips, formatControls } from '../content/slides/js/edit/textstyle.js';

// A minimal app: one text asset selected, its editable a plain {style,dataset} stub.
function fakeApp(theme) {
  const asset = { id: 'a1', type: 'text', style: { fw: '700' } };
  const el = { style: { fontSize: '', fontWeight: '700', color: '' }, dataset: { aid: 'a1' } };
  const deck = { theme, assets: [asset] };
  const log = { record: [], commit: 0, broadcast: 0 };
  return {
    activeEditable: el,
    deck: () => deck,
    cur: () => ({ slots: {}, textStyle: {} }),
    record: (tag) => log.record.push(tag),
    commit: () => log.commit++,
    broadcast: () => log.broadcast++,
    _asset: asset, _el: el, _log: log,
  };
}

const TEAL = { accent: '#14b8a6', ink: '#134e4a', motif: '#14b8a6' };

test('themeColorChips surfaces one swatch per real palette colour + a reset', () => {
  const chips = themeColorChips(fakeApp(TEAL));
  assert.deepEqual(chips.map((c) => c.id), ['chip-accent', 'chip-ink', 'chip-art', 'chip-theme']);
  // the three colour chips paint themselves with the swatch hook + carry a tooltip
  for (const c of chips.slice(0, 3)) {
    assert.equal(c.type, 'button');
    assert.equal(c.cls, 'ctl-chip');
    assert.match(c.swatch, /^#[0-9a-f]{6}$/i);
    assert.ok(c.title, 'a colour chip needs a tooltip (it has no label)');
    assert.equal(c.keepFocus, true);
  }
});
test('each chip carries the LIVE theme colour (so the chips track the palette)', () => {
  const chips = themeColorChips(fakeApp({ accent: '#111111', ink: '#222222', motif: '#333333' }));
  assert.equal(chips.find((c) => c.id === 'chip-accent').swatch, '#111111');
  assert.equal(chips.find((c) => c.id === 'chip-ink').swatch, '#222222');
  assert.equal(chips.find((c) => c.id === 'chip-art').swatch, '#333333');
});
test('a palette colour missing from the theme falls back to a sane default', () => {
  const chips = themeColorChips(fakeApp({})); // empty theme
  for (const c of chips.slice(0, 3)) assert.match(c.swatch, /^#[0-9a-f]{6}$/i);
});
test('the reset chip is a labelled button bound to the "— do tema —" key', () => {
  const reset = themeColorChips(fakeApp(TEAL)).find((c) => c.id === 'chip-theme');
  assert.equal(reset.labelKey, 'slides.tb_inherit');
  assert.equal(reset.cls, 'ctl-chipreset');
  assert.equal(reset.swatch, undefined); // not a swatch, a text button
});

test('clicking a colour chip pins that theme colour on the selected element', () => {
  const app = fakeApp(TEAL);
  themeColorChips(app).find((c) => c.id === 'chip-art').run(app);
  assert.equal(app._asset.style.color, '#14b8a6'); // motif, written through to the model
  assert.equal(app._el.style.color, '#14b8a6'); // and onto the live element for feedback
  assert.equal(app._asset.style.fw, '700'); // existing bold preserved (sparse write)
  assert.equal(app._log.commit, 1);
  assert.equal(app._log.broadcast, 1);
  assert.ok(app._log.record.includes('style:color'));
});
test('clicking the reset chip clears the per-item colour so the item re-inherits', () => {
  const app = fakeApp(TEAL);
  app._el.style.color = '#ff0000'; // a prior manual pin
  themeColorChips(app).find((c) => c.id === 'chip-theme').run(app);
  assert.ok(!app._asset.style.color, 'the colour pin is gone (undefined/empty)');
  assert.equal(app._el.style.color, '');
});

test('formatControls places the chips between the format buttons and the raw Cor input', () => {
  const ids = formatControls(fakeApp(TEAL)).map((c) => c.id || c.type);
  const iBold = ids.indexOf('bold');
  const iAccent = ids.indexOf('chip-accent');
  const iColor = ids.indexOf('color');
  assert.ok(iBold < iAccent && iAccent < iColor, `expected B < chips < Cor, got ${ids.join(',')}`);
});
test('the raw Cor input still writes through (refactored onto the shared applyColor)', () => {
  const app = fakeApp(TEAL);
  const color = formatControls(app).find((c) => c.id === 'color');
  color.input(app, null, '#abcdef');
  assert.equal(app._asset.style.color, '#abcdef');
});
