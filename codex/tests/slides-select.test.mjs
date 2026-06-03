// slides-select.test.mjs: pure-logic tests for the unified selection model
// (js/select/) and the A1 per-slide logo geometry. DOM-free: descriptors are
// exercised with stub elements and a stub app, so the suite runs under plain
// node:test with no browser. Behavioural drag/bar correctness is verified on
// staging (visual confirmation), matching the existing test philosophy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLogo, DEFAULT_LOGO, textStyleProps } from '../content/slides/js/render/player.js';
import * as kinds from '../content/slides/js/select/kinds.js';
import { geometryCaps, strategies } from '../content/slides/js/select/geometry.js';

/* ---------- stubs ---------- */
// A minimal element whose closest(sel) returns a preset node per selector.
function stubEl(matches = {}) {
  return { closest: (sel) => (sel in matches ? matches[sel] : null) };
}
function stubApp(asset) {
  const deck = { logo: { x: 40, y: 30, h: 40, variant: 'teal' }, assets: asset ? [asset] : [] };
  const slide = { id: 's1' };
  return { deck: () => deck, cur: () => slide, _deck: deck, _slide: slide };
}

/* ---------- A1 logo geometry ---------- */
test('DEFAULT_LOGO is the shared 40/30/40 default', () => {
  assert.deepEqual(DEFAULT_LOGO, { x: 40, y: 30, h: 40 });
});

test('resolveLogo falls back to deck logo, then to the default', () => {
  assert.deepEqual(resolveLogo({ logo: { x: 40, y: 30, h: 40, variant: 'teal' } }, {}),
    { x: 40, y: 30, h: 40, variant: 'teal' });
  assert.deepEqual(resolveLogo({}, {}), { x: 40, y: 30, h: 40, variant: 'light' });
});

test('resolveLogo: per-slide geometry overrides the deck, variant still inherits', () => {
  const r = resolveLogo({ logo: { x: 40, y: 30, h: 40, variant: 'teal' } }, { logo: { x: 100, y: 200, h: 60 } });
  assert.equal(r.x, 100);
  assert.equal(r.y, 200);
  assert.equal(r.h, 60);
  assert.equal(r.variant, 'teal'); // slide.logo carries no variant -> deck wins
});

test('resolveLogo variant precedence: slide.logo > slide.logoVariant (legacy) > deck > light', () => {
  assert.equal(resolveLogo({ logo: { variant: 'dark' } }, { logo: { variant: 'mark' } }).variant, 'mark');
  assert.equal(resolveLogo({ logo: { variant: 'dark' } }, { logoVariant: 'teal' }).variant, 'teal');
  assert.equal(resolveLogo({ logo: { variant: 'dark' } }, {}).variant, 'dark');
  assert.equal(resolveLogo({}, {}).variant, 'light');
});

/* ---------- descriptor registry ---------- */
test('kinds registry exposes asset + logo with the descriptor contract', () => {
  for (const id of ['asset', 'logo']) {
    const d = kinds.get(id);
    assert.ok(d, `${id} is registered`);
    assert.equal(typeof d.match, 'function', `${id}.match`);
    assert.equal(typeof d.controls, 'function', `${id}.controls`);
    assert.equal(typeof d.target, 'function', `${id}.target`);
    assert.equal(typeof d.el, 'function', `${id}.el (resolve ref -> DOM)`);
    assert.equal(typeof d.geometry, 'string', `${id}.geometry strategy name`);
  }
  assert.equal(kinds.get('asset').geometry, 'absoluteAsset');
  assert.equal(kinds.get('logo').geometry, 'deckLogo');
});

test('asset.match resolves an .asset element to a logical ref', () => {
  const node = { dataset: { asset: 'a7' } };
  assert.deepEqual(kinds.get('asset').match(stubEl({ '.asset': node })), { kind: 'asset', ref: 'a7' });
  assert.equal(kinds.get('asset').match(stubEl({})), null);
});

test('logo.match resolves a .logo[data-logo] element to ref "logo"', () => {
  assert.deepEqual(kinds.get('logo').match(stubEl({ '.logo[data-logo]': {} })), { kind: 'logo', ref: 'logo' });
  assert.equal(kinds.get('logo').match(stubEl({})), null);
});

test('matchKind tries the registry and returns the first hit (most specific kinds win)', () => {
  const node = { dataset: { asset: 'a1' } };
  assert.deepEqual(kinds.matchKind(stubEl({ '.asset': node })), { kind: 'asset', ref: 'a1' });
  assert.equal(kinds.matchKind(stubEl({})), null);
});

test('asset.target / asset.controls return the model object and primitive data', () => {
  const asset = { id: 'a1', type: 'image', scope: 'slide', mask: null };
  const app = stubApp(asset);
  const sel = { kind: 'asset', ref: 'a1', slideId: 's1' };
  assert.equal(kinds.get('asset').target(app, sel), asset);
  const ctrls = kinds.get('asset').controls(app, sel, asset);
  assert.ok(Array.isArray(ctrls) && ctrls.length, 'controls is a non-empty array');
  const types = ctrls.map((c) => c.type);
  assert.ok(types.includes('select'), 'has a scope select');
  assert.ok(types.includes('button'), 'has a delete (and/or mask) button');
  for (const c of ctrls) assert.equal(typeof c.type, 'string', 'every primitive is typed data');
});

test('logo.controls exposes variant select, per-slide toggle, hide', () => {
  const app = stubApp();
  const sel = { kind: 'logo', ref: 'logo', slideId: 's1' };
  const ctrls = kinds.get('logo').controls(app, sel, kinds.get('logo').target(app, sel));
  const types = ctrls.map((c) => c.type);
  assert.ok(types.includes('select'), 'variant select');
  assert.ok(types.includes('toggle'), 'per-slide toggle');
  assert.ok(types.includes('button'), 'hide button');
});

/* ---------- geometry strategies ---------- */
test('geometryCaps: asset = move+resizeW+rotate, logo = move+resizeH only', () => {
  const a = geometryCaps('absoluteAsset');
  assert.equal(a.move, true);
  assert.equal(a.resizeW, true);
  assert.equal(a.rotate, true);
  const l = geometryCaps('deckLogo');
  assert.equal(l.move, true);
  assert.equal(l.resizeH, true);
  assert.equal(l.resizeW, false);
  assert.equal(l.rotate, false);
});

test('absoluteAsset.write mutates x/y/w/rot on the asset (not height)', () => {
  const asset = { id: 'a1', x: 0, y: 0, w: 180, rot: 0 };
  const app = stubApp(asset);
  const sel = { kind: 'asset', ref: 'a1' };
  strategies.absoluteAsset.write(app, sel, { x: 10, y: 20, w: 240, h: 999, rot: 30 });
  assert.equal(asset.x, 10);
  assert.equal(asset.y, 20);
  assert.equal(asset.w, 240);
  assert.equal(asset.rot, 30);
  assert.ok(!('h' in asset) || asset.h !== 999, 'asset height stays auto (not persisted from geometry)');
});

test('deckLogo.write targets deck.logo, or slide.logo when per-slide is active', () => {
  const app = stubApp();
  const sel = { kind: 'logo', ref: 'logo' };
  strategies.deckLogo.write(app, sel, { x: 5, y: 6, h: 50 });
  assert.deepEqual([app._deck.logo.x, app._deck.logo.y, app._deck.logo.h], [5, 6, 50]);

  app._slide.logo = { x: 0, y: 0, h: 40, variant: 'teal' }; // per-slide override on
  strategies.deckLogo.write(app, sel, { x: 7, y: 8, h: 70 });
  assert.deepEqual([app._slide.logo.x, app._slide.logo.y, app._slide.logo.h], [7, 8, 70]);
  assert.equal(app._deck.logo.x, 5, 'deck logo untouched while per-slide is active');
});

/* ============================ SLICE 2 ============================ */
/* ---------- freeformSlot geometry (text + image slot boxes) ---------- */
test('geometryCaps: freeformSlot allows move + resize(W/H) + rotate', () => {
  const c = geometryCaps('freeformSlot');
  assert.deepEqual([c.move, c.resizeW, c.resizeH, c.rotate], [true, true, true, true]);
});

test('freeformSlot.write stores absolute geometry in slide.overrides[ref] (no flow)', () => {
  const slide = { id: 's1', overrides: {} };
  const app = { cur: () => slide };
  strategies.freeformSlot.write(app, { ref: 'title' }, { x: 10, y: 20, w: 200, h: 80, rot: 15 });
  assert.deepEqual(slide.overrides.title, { x: 10, y: 20, w: 200, h: 80, rot: 15 });
});

test('freeformSlot.read returns the stored override (absolute) when present', () => {
  const slide = { overrides: { title: { x: 1, y: 2, w: 3, h: 4, rot: 5 } } };
  const app = { cur: () => slide };
  assert.deepEqual(strategies.freeformSlot.read(app, { ref: 'title' }, null), { x: 1, y: 2, w: 3, h: 4, rot: 5 });
});

test('freeformSlot.read does NOT treat a flow override as absolute (slot stays in layout flow)', () => {
  const slide = { overrides: { title: { x: 1, y: 2, w: 3, h: 4, flow: true } } };
  const app = { cur: () => slide };
  assert.notDeepEqual(strategies.freeformSlot.read(app, { ref: 'title' }, null), { x: 1, y: 2, w: 3, h: 4, rot: 0 });
});

/* ---------- imageFraming (pan/zoom inside the box, separate from geometry) ---------- */
test('imageFraming.write/read round-trips tx/ty/zoom on the slot image object', () => {
  const slide = { slots: { image: { src: 'x', tx: 0, ty: 0, zoom: 1 } } };
  const app = { cur: () => slide };
  strategies.imageFraming.write(app, 'image', { tx: 5, ty: -3, zoom: 1.5 });
  assert.deepEqual(strategies.imageFraming.read(app, 'image'), { tx: 5, ty: -3, zoom: 1.5 });
  assert.equal(slide.slots.image.zoom, 1.5);
});

test('imageFraming.read defaults to tx0/ty0/zoom1 for a bare image', () => {
  const app = { cur: () => ({ slots: { image: { src: 'x' } } }) };
  assert.deepEqual(strategies.imageFraming.read(app, 'image'), { tx: 0, ty: 0, zoom: 1 });
});

/* ---------- textSlot descriptor ---------- */
test('textSlot is registered with freeformSlot geometry and the descriptor contract', () => {
  const d = kinds.get('textSlot');
  assert.ok(d, 'textSlot is registered');
  assert.equal(d.geometry, 'freeformSlot');
  for (const m of ['match', 'el', 'target', 'controls']) assert.equal(typeof d[m], 'function', `textSlot.${m}`);
});

test('textSlot.match resolves an ed() text slot to its fkey, excluding card-internal text', () => {
  const free = { dataset: { fkey: 'title' }, closest: () => null };               // not inside a card
  assert.deepEqual(kinds.get('textSlot').match(stubEl({ '.editable[data-fkey][data-path][data-edit="1"]': free })),
    { kind: 'textSlot', ref: 'title' });
  const inCard = { dataset: { fkey: 'cards.0.text' }, closest: (s) => (s === '.card' ? {} : null) };
  assert.equal(kinds.get('textSlot').match(stubEl({ '.editable[data-fkey][data-path][data-edit="1"]': inCard })), null,
    'card-internal text stays on freeform (Slice 3)');
  assert.equal(kinds.get('textSlot').match(stubEl({})), null);
});

test('textSlot.controls offers back-to-layout only when an override exists', () => {
  const withOv = { cur: () => ({ overrides: { title: { x: 1, y: 1, w: 1, h: 1 } } }) };
  assert.ok(kinds.get('textSlot').controls(withOv, { kind: 'textSlot', ref: 'title' }).some((c) => c.type === 'button'),
    'reset button when freed');
  const noOv = { cur: () => ({ overrides: {} }) };
  assert.equal(kinds.get('textSlot').controls(noOv, { kind: 'textSlot', ref: 'title' }).length, 0,
    'no bar when in flow (text formatting is the caret-anchored #fmt)');
});

/* ---------- imageSlot descriptor (+ folded mask) ---------- */
test('imageSlot is registered with freeformSlot geometry and matches filled slots, excluding cards', () => {
  const d = kinds.get('imageSlot');
  assert.ok(d, 'imageSlot is registered');
  assert.equal(d.geometry, 'freeformSlot');
  const free = { dataset: { fkey: 'image' }, closest: () => null };
  assert.deepEqual(d.match(stubEl({ '.dropzone.filled[data-fkey]': free })), { kind: 'imageSlot', ref: 'image' });
  const inCard = { dataset: { fkey: 'cards.0.image' }, closest: (s) => (s === '.card' ? {} : null) };
  assert.equal(d.match(stubEl({ '.dropzone.filled[data-fkey]': inCard })), null, 'card images stay on freeform (Slice 3)');
});

test('imageSlot.target returns the slot image object; controls expose replace + a compound mask', () => {
  const slide = { slots: { image: { src: 'x', mask: null } } };
  const app = { cur: () => slide, openMask() {}, pickImage() {} };
  const sel = { kind: 'imageSlot', ref: 'image' };
  assert.equal(kinds.get('imageSlot').target(app, sel), slide.slots.image);
  const ctrls = kinds.get('imageSlot').controls(app, sel, kinds.get('imageSlot').target(app, sel));
  const ids = ctrls.map((c) => c.id);
  assert.ok(ids.includes('replace'), 'has replace');
  assert.ok(ids.includes('mask'), 'has mask (folded #maskpop)');
  assert.ok(ctrls.find((c) => c.id === 'mask').compound, 'mask is a compound opener');
});

/* ---------- text-style persistence ---------- */
test('textStyleProps maps a stored text style to inline CSS, dropping empties', () => {
  assert.deepEqual(textStyleProps({ fs: 32, fw: '900', color: '#abc' }),
    { fontSize: '32px', fontWeight: '900', color: '#abc' });
  assert.deepEqual(textStyleProps(null), {});
  assert.deepEqual(textStyleProps({ fw: '700' }), { fontWeight: '700' });
});
