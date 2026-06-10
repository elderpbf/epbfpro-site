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
import { imgslot, topicItem, topicList } from '../content/slides/js/render/helpers.js';
import { cardItem } from '../content/slides/js/render/cardparts.js';
import { resolveStyleObj } from '../content/slides/js/core/schema.js';
import cardsLayout from '../content/slides/js/layouts/cards.js';
import topicsLayout from '../content/slides/js/layouts/topics.js';
import splitLayout from '../content/slides/js/layouts/split.js';

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
  assert.ok(types.includes('choice'), 'has a scope choice (no dropdown)');
  assert.ok(types.includes('button'), 'has a delete (and/or mask) button');
  for (const c of ctrls) assert.equal(typeof c.type, 'string', 'every primitive is typed data');
});

test('logo.controls exposes variant choice, per-slide toggle, hide', () => {
  const app = stubApp();
  const sel = { kind: 'logo', ref: 'logo', slideId: 's1' };
  const ctrls = kinds.get('logo').controls(app, sel, kinds.get('logo').target(app, sel));
  const types = ctrls.map((c) => c.type);
  assert.ok(types.includes('choice'), 'variant choice (no dropdown)');
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

test('textSlot.controls always carries the format controls, plus back-to-layout when freed', () => {
  const freed = kinds.get('textSlot').controls(
    { cur: () => ({ overrides: { title: { x: 1, y: 1, w: 1, h: 1 } } }) }, { kind: 'textSlot', ref: 'title' });
  assert.ok(freed.some((c) => c.id === 'bold'), 'has the format controls (A-/A+/B/Cor)');
  assert.ok(freed.some((c) => c.id === 'reset'), 'reset appears when the slot is freed');
  const inFlow = kinds.get('textSlot').controls(
    { cur: () => ({ overrides: {} }) }, { kind: 'textSlot', ref: 'title' });
  assert.ok(inFlow.some((c) => c.id === 'bold'), 'still has format controls while in flow');
  assert.ok(!inFlow.some((c) => c.id === 'reset'), 'no reset while in flow');
});

/* ---------- imageSlot descriptor (+ folded mask) ---------- */
test('imageSlot is registered with freeformSlot geometry and matches image slots, excluding cards', () => {
  const d = kinds.get('imageSlot');
  assert.ok(d, 'imageSlot is registered');
  assert.equal(d.geometry, 'freeformSlot');
  const free = { dataset: { fkey: 'image' }, closest: () => null };
  assert.deepEqual(d.match(stubEl({ '.dropzone[data-fkey]': free })), { kind: 'imageSlot', ref: 'image' });
  const inCard = { dataset: { fkey: 'cards.0.image' }, closest: (s) => (s === '.card' ? {} : null) };
  assert.equal(d.match(stubEl({ '.dropzone[data-fkey]': inCard })), null, 'card images stay on freeform (Slice 3)');
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

/* ---------- image box (item a): empty slots are selectable, not auto-pickers ---------- */
test('imgslot tags BOTH empty and filled with data-fkey; empty shows the unified cue (option 3)', () => {
  const empty = imgslot('icon', null);
  assert.match(empty, /data-fkey="icon"/, 'empty slot is selectable');
  assert.ok(!/\bfilled\b/.test(empty), 'empty slot is not marked filled');
  assert.match(empty, /imgcue/, 'empty box shows the unified add-image cue');
  assert.match(empty, /adicionar imagem/, 'cue carries the "adicionar imagem" label');
  assert.ok(!/arraste ou clique/.test(empty), 'the old drag/click pill is gone');
  const full = imgslot('image', { src: 'x' });
  assert.match(full, /data-fkey="image"/, 'filled slot still selectable');
  assert.ok(!/imgcue/.test(full), 'filled slot shows the image, not the cue');
});

test('imageSlot.match also matches an EMPTY image box (data-fkey on an unfilled dropzone), excluding cards', () => {
  const d = kinds.get('imageSlot');
  const empty = { dataset: { fkey: 'icon' }, closest: () => null };
  assert.deepEqual(d.match(stubEl({ '.dropzone[data-fkey]': empty })), { kind: 'imageSlot', ref: 'icon' });
  const inCard = { dataset: { fkey: 'cards.0.image' }, closest: (s) => (s === '.card' ? {} : null) };
  assert.equal(d.match(stubEl({ '.dropzone[data-fkey]': inCard })), null, 'empty card image boxes stay on freeform');
});

test('imageSlot.controls on an EMPTY box offers exactly one add-image button that picks into the slot', () => {
  let picked = null;
  const app = { cur: () => ({ slots: {} }), pickImage: (ref) => { picked = ref; } };
  const sel = { kind: 'imageSlot', ref: 'icon' };
  const ctrls = kinds.get('imageSlot').controls(app, sel, null); // empty -> target is null
  assert.equal(ctrls.length, 1, 'just the add-image button while empty');
  assert.equal(ctrls[0].type, 'button');
  assert.ok(!ctrls.some((c) => c.id === 'replace' || c.id === 'mask'), 'no replace/mask while empty');
  ctrls[0].run(app, sel);
  assert.equal(picked, 'icon', 'add-image picks straight into the slot path');
});

/* ---------- text-style persistence ---------- */
test('textStyleProps maps a stored text style to inline CSS, dropping empties', () => {
  assert.deepEqual(textStyleProps({ fs: 32, fw: '900', color: '#abc' }),
    { fontSize: '32px', fontWeight: '900', color: '#abc' });
  assert.deepEqual(textStyleProps(null), {});
  assert.deepEqual(textStyleProps({ fw: '700' }), { fontWeight: '700' });
});

/* ============================ SLICE 3 ============================ */
/* ---------- flowCard geometry (cards resize in the flex stack) ---------- */
test('geometryCaps: flowCard resizes WIDTH only in the stack (height is content-driven)', () => {
  const c = geometryCaps('flowCard');
  assert.deepEqual([c.move, c.resizeW, c.resizeH, c.rotate], [false, true, false, false]);
});

test('flowCard.write stores only the basis (width) as a flow override (no height/x/y/rot)', () => {
  const slide = { overrides: {} };
  const app = { cur: () => slide };
  strategies.flowCard.write(app, { ref: 'cards.abc' }, { x: 5, y: 6, w: 240, h: 160, rot: 0 });
  assert.deepEqual(slide.overrides['cards.abc'], { w: 240, flow: true });
});

test('flowCard.read returns zeros when the element is unresolved (nothing live to measure)', () => {
  const app = { cur: () => ({ overrides: {} }) };
  assert.deepEqual(strategies.flowCard.read(app, { ref: 'cards.abc' }, null), { x: 0, y: 0, w: 0, h: 0, rot: 0 });
});

/* ---------- id-based render helpers (cards/topics carry a stable identity) ---------- */
test('resolveStyleObj resolves a "list.<id>" ref to the matching item object', () => {
  const slots = { cards: [{ id: 'c1' }, { id: 'c2' }], topics: [{ id: 't1' }] };
  assert.equal(resolveStyleObj(slots, 'cards.c2'), slots.cards[1]);
  assert.equal(resolveStyleObj(slots, 'topics.t1'), slots.topics[0]);
  assert.equal(resolveStyleObj(slots, 'cards.nope'), null, 'unknown id -> null');
  assert.equal(resolveStyleObj(slots, null), null);
  assert.equal(resolveStyleObj({}, 'cards.c1'), null, 'missing list -> null');
});

test('topicItem keys the <li> by stable id, addresses content by index, declares its style home', () => {
  const html = topicItem({ id: 'k1', text: 'Olá' }, 2);
  assert.match(html, /data-fkey="topics\.k1"/, 'geometry override key is the stable id');
  assert.match(html, /data-path="topics\.2\.text"/, 'content writes to the index path .text');
  assert.match(html, /data-style-ref="topics\.k1"/, 'style home is the topic object');
  assert.match(html, /data-step="3"/, 'reveal step stays index-derived');
  assert.match(html, />Olá</);
  assert.ok(!/li-x|remover/.test(html), 'no layout-emitted delete button (it moves to the descriptor)');
});

test('topicList wraps items in the .topiclist ul and emits no add button', () => {
  const html = topicList([{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }]);
  assert.match(html, /<ul class="topiclist">/);
  assert.equal((html.match(/<li/g) || []).length, 2);
  assert.ok(!/addtopic|\+ tópico/.test(html), 'add is a container control, not layout HTML');
});

test('cardItem keys the .card by stable id; an on text part declares a style-ref; no .cardctl emitted', () => {
  const html = cardItem({ id: 'c1', parts: { body: true }, text: 'A' }, 0, 2);
  assert.match(html, /class="card[ "]/);
  assert.match(html, /data-fkey="cards\.c1"/);
  assert.match(html, /data-step="1"/);
  assert.match(html, /data-style-ref="cards\.c1"/);
  assert.ok(!/cardctl|data-cardmode|data-cardmove|data-carddel/.test(html), 'card controls are not emitted by the layout');
});

/* ---------- ratio geometry + divider descriptor (the split column handle) ---------- */
test('geometryCaps: ratio is a horizontal drag (move only — the divider sets the split)', () => {
  const c = geometryCaps('ratio');
  assert.deepEqual([c.move, c.resizeW, c.resizeH, c.rotate], [true, false, false, false]);
});

test('ratio.read maps slots.ratio to a full-height divider line at canvas-x', () => {
  const app = { deck: () => ({ canvas: { w: 1280, h: 720 } }), cur: () => ({ slots: { ratio: 0.5 } }) };
  assert.deepEqual(strategies.ratio.read(app, { ref: 'ratio' }, null), { x: 640, y: 0, w: 0, h: 720, rot: 0 });
});

test('ratio.write maps a dragged x back to slots.ratio, clamped to 0.2..0.8', () => {
  const slide = { slots: { ratio: 0.5 } };
  const app = { deck: () => ({ canvas: { w: 1000, h: 720 } }), cur: () => slide };
  strategies.ratio.write(app, { ref: 'ratio' }, { x: 300 });
  assert.equal(slide.slots.ratio, 0.3);
  strategies.ratio.write(app, { ref: 'ratio' }, { x: 50 });
  assert.equal(slide.slots.ratio, 0.2, 'clamped low (min 0.2)');
  strategies.ratio.write(app, { ref: 'ratio' }, { x: 950 });
  assert.equal(slide.slots.ratio, 0.8, 'clamped high (max 0.8)');
});

test('divider descriptor: ratio geometry, matches .divider, drag-only (no bar controls)', () => {
  const d = kinds.get('divider');
  assert.ok(d, 'divider is registered');
  assert.equal(d.geometry, 'ratio');
  assert.deepEqual(d.match(stubEl({ '.divider': {} })), { kind: 'divider', ref: 'ratio' });
  assert.equal(d.match(stubEl({})), null);
  assert.deepEqual(d.controls(), [], 'no bar: the divider element is the handle');
});

/* ---------- card / topic / container descriptors (the conversion) ---------- */
const noStage = { querySelector: () => null };

test('card descriptor: flowCard geometry, matches .card to its id ref, target resolves the card', () => {
  const d = kinds.get('card');
  assert.ok(d, 'card is registered');
  assert.equal(d.geometry, 'flowCard');
  assert.deepEqual(d.match(stubEl({ '.card': { dataset: { fkey: 'cards.c1' } } })), { kind: 'card', ref: 'cards.c1' });
  assert.equal(d.match(stubEl({})), null);
  const slide = { slots: { cards: [{ id: 'c1', parts: { body: true }, text: 'A' }, { id: 'c2', parts: { image: true } }] } };
  const app = { cur: () => slide, stage: noStage };
  assert.equal(d.target(app, { ref: 'cards.c2' }), slide.slots.cards[1]);
});

test('card.controls carry a part toggle per registered part + move left/right + a danger delete', () => {
  const d = kinds.get('card');
  const slide = { slots: { cards: [{ id: 'c1', parts: { body: true }, text: 'A' }] } };
  const app = { cur: () => slide, stage: noStage };
  const sel = { kind: 'card', ref: 'cards.c1' };
  const ctrls = d.controls(app, sel, d.target(app, sel));
  const toggles = ctrls.filter((c) => c.type === 'toggle' && /^part-/.test(c.id));
  assert.ok(toggles.length >= 3, 'one on/off toggle per registered card part (no dropdown)');
  assert.ok(toggles.some((c) => c.id === 'part-image'), 'any card can toggle an image part');
  assert.equal(toggles.find((c) => c.id === 'part-body').on, true, 'toggle state reflects card.parts');
  assert.ok(ctrls.some((c) => c.id === 'move-l') && ctrls.some((c) => c.id === 'move-r'), 'move left/right');
  assert.ok(ctrls.some((c) => c.id === 'delete' && c.danger), 'danger delete');
});

test('topic descriptor: freeformSlot geometry, matches the li, controls carry format + a danger delete', () => {
  const d = kinds.get('topic');
  assert.ok(d, 'topic is registered');
  assert.equal(d.geometry, 'freeformSlot');
  assert.deepEqual(d.match(stubEl({ 'li[data-fkey]': { dataset: { fkey: 'topics.t1' } } })), { kind: 'topic', ref: 'topics.t1' });
  const slide = { slots: { topics: [{ id: 't1', text: 'x' }] }, overrides: {} };
  const app = { cur: () => slide, stage: noStage };
  const sel = { kind: 'topic', ref: 'topics.t1' };
  const ctrls = d.controls(app, sel, d.target(app, sel));
  assert.ok(ctrls.some((c) => c.id === 'bold'), 'has the format controls');
  assert.ok(ctrls.some((c) => c.id === 'delete' && c.danger), 'has a danger delete (remover)');
});

test('container descriptor: matches the stack/list, no geometry handles, controls carry add', () => {
  const d = kinds.get('container');
  assert.ok(d, 'container is registered');
  assert.deepEqual(geometryCaps(d.geometry), { move: false, resizeW: false, resizeH: false, rotate: false });
  assert.deepEqual(d.match(stubEl({ '.cardrow': {} })), { kind: 'container', ref: 'cards' });
  assert.deepEqual(d.match(stubEl({ '.topiclist': {} })), { kind: 'container', ref: 'topics' });
  assert.equal(d.match(stubEl({})), null);
  const app = { cur: () => ({ slots: { cards: [] } }) };
  const ctrls = d.controls(app, { kind: 'container', ref: 'cards' }, null);
  assert.ok(ctrls.some((c) => c.id === 'add'), 'container offers add');
});

/* ---------- the plugin-contract leak is closed: layouts emit content only ---------- */
test('cards/topics/split layouts emit NO control HTML (the LOG-009 leak is closed)', () => {
  const html = [
    cardsLayout.render({ title: 'T', reveal: false, cards: [{ id: 'c1', parts: { body: true }, text: 'A' }] }),
    topicsLayout.render({ title: 'T', topics: [{ id: 't1', text: 'x' }] }),
    splitLayout.render({ ratio: 0.5, title: 'T', image: null, topics: [{ id: 't1', text: 'x' }] }),
  ];
  for (const h of html) {
    assert.ok(
      !/cardctl|li-x|addtopic|cardadd|data-cardmode|data-cardmove|data-carddel|data-del=|data-add=/.test(h),
      'layout emits content only, no control markup'
    );
  }
  assert.match(html[0], /data-fkey="cards\.c1"/, 'cards keyed by id');
  assert.match(html[1], /data-fkey="topics\.t1"/, 'topics keyed by id');
});

test('layout defaults() seed the id-bearing shape (cards have ids + a parts map; topics are {id,text})', () => {
  assert.ok(cardsLayout.defaults().cards.every((c) => typeof c.id === 'string'), 'seeded cards carry ids');
  assert.ok(cardsLayout.defaults().cards.every((c) => c.parts && typeof c.parts === 'object'), 'seeded cards carry a parts map');
  for (const L of [topicsLayout, splitLayout]) {
    assert.ok(L.defaults().topics.every((t) => t && typeof t === 'object' && typeof t.id === 'string'),
      `${L.id} seeds topics as {id,text} objects`);
  }
});

/* ============================ SLICE 4 ============================ */
/* ---------- reorder: drag-and-drop + topic move buttons (id-keyed) ---------- */
test('reorderItem moves an item to the drop target index by id, records once, refreshes', () => {
  const slide = { slots: { cards: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] } };
  let recorded = 0, refreshed = 0;
  const app = { cur: () => slide, record: () => recorded++, refresh: () => refreshed++ };
  kinds.reorderItem(app, 'cards.a', 'cards.c'); // drag A down onto C
  assert.deepEqual(slide.slots.cards.map((c) => c.id), ['b', 'c', 'a', 'd'], 'A lands at C');
  kinds.reorderItem(app, 'cards.d', 'cards.b'); // drag D up onto B (arr is b,c,a,d)
  assert.deepEqual(slide.slots.cards.map((c) => c.id), ['d', 'b', 'c', 'a'], 'D lands at B');
  assert.equal(recorded, 2);
  assert.equal(refreshed, 2);
});

test('reorderItem is a no-op (no record) for same-ref, unknown id, or missing list', () => {
  const slide = { slots: { topics: [{ id: 't1' }, { id: 't2' }] } };
  let recorded = 0;
  const app = { cur: () => slide, record: () => recorded++, refresh: () => {} };
  kinds.reorderItem(app, 'topics.t1', 'topics.t1'); // same ref
  kinds.reorderItem(app, 'topics.t1', 'topics.nope'); // unknown target
  kinds.reorderItem(app, 'cards.x', 'cards.y'); // missing list
  assert.deepEqual(slide.slots.topics.map((t) => t.id), ['t1', 't2'], 'order unchanged');
  assert.equal(recorded, 0, 'never records a no-op (no spurious undo step)');
});

test('topic.controls add up/down move buttons (mirror the cards ◀ ▶, drive the shared moveItem)', () => {
  const d = kinds.get('topic');
  const slide = { slots: { topics: [{ id: 't1', text: 'x' }] }, overrides: {} };
  const app = { cur: () => slide, stage: noStage };
  const sel = { kind: 'topic', ref: 'topics.t1' };
  const ctrls = d.controls(app, sel, d.target(app, sel));
  assert.ok(ctrls.some((c) => c.id === 'move-up'), 'has move-up');
  assert.ok(ctrls.some((c) => c.id === 'move-down'), 'has move-down');
  // up/down precede add/delete so the bar reads format · move · add · remove
  const ids = ctrls.map((c) => c.id);
  assert.ok(ids.indexOf('move-up') < ids.indexOf('add'), 'move sits before add/remove');
});

/* ---------- card Toggles: symmetric resize, stack axis, reset widths ---------- */
test('flowCard.write mirrors the basis to the opposite-end card when symResize is on (either side)', () => {
  const four = () => ({ overrides: {}, slots: { symResize: true, cards: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] } });
  let slide = four(); let app = { cur: () => slide };
  strategies.flowCard.write(app, { ref: 'cards.a' }, { w: 300 });
  assert.deepEqual(slide.overrides['cards.a'], { w: 300, flow: true });
  assert.deepEqual(slide.overrides['cards.d'], { w: 300, flow: true }, 'left edge mirrors to the right edge');
  slide = four(); app = { cur: () => slide };
  strategies.flowCard.write(app, { ref: 'cards.c' }, { w: 260 });
  assert.deepEqual(slide.overrides['cards.b'], { w: 260, flow: true }, 'inner-right mirrors to inner-left');
});

test('flowCard.write: the centre card on odd counts mirrors only itself', () => {
  const slide = { overrides: {}, slots: { symResize: true, cards: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } };
  const app = { cur: () => slide };
  strategies.flowCard.write(app, { ref: 'cards.b' }, { w: 250 });
  assert.deepEqual(slide.overrides, { 'cards.b': { w: 250, flow: true } }, 'no sibling written for the centre');
});

test('flowCard.write does NOT mirror when symResize is off', () => {
  const slide = { overrides: {}, slots: { cards: [{ id: 'a' }, { id: 'b' }] } };
  const app = { cur: () => slide };
  strategies.flowCard.write(app, { ref: 'cards.a' }, { w: 300 });
  assert.deepEqual(slide.overrides, { 'cards.a': { w: 300, flow: true } }, 'only the resized card');
});

test('card.controls expose a Toggles opener (Ajustes ▾) after the move/add/delete cluster', () => {
  const d = kinds.get('card');
  const slide = { slots: { cards: [{ id: 'c1', parts: { body: true }, text: 'A' }] } };
  const app = { cur: () => slide, stage: noStage };
  const sel = { kind: 'card', ref: 'cards.c1' };
  const ctrls = d.controls(app, sel, d.target(app, sel));
  const toggles = ctrls.find((c) => c.id === 'toggles');
  assert.ok(toggles && toggles.type === 'button', 'card bar carries a Toggles opener');
  const ids = ctrls.map((c) => c.id);
  assert.ok(ids.indexOf('toggles') > ids.indexOf('delete'), 'Toggles sits after the delete');
});

test('cardTogglesMenu seeds sym/stack toggles from slots + a reset-widths button', () => {
  const m = kinds.cardTogglesMenu({ symResize: true, stacked: false });
  const sym = m.find((c) => c.id === 'sym');
  const stack = m.find((c) => c.id === 'stack');
  assert.ok(sym && sym.type === 'toggle' && sym.on === true, 'symmetric toggle seeded on');
  assert.ok(stack && stack.type === 'toggle' && stack.on === false, 'stack toggle seeded off');
  assert.ok(m.some((c) => c.id === 'reset-widths' && c.type === 'button'), 'has reset-widths button');
});

test('cardTogglesMenu reset-widths clears every card width override, leaving others intact', () => {
  const slide = { slots: { cards: [{ id: 'a' }, { id: 'b' }] }, overrides: { 'cards.a': { w: 300, flow: true }, 'cards.b': { w: 200, flow: true }, title: { x: 1 } } };
  let recorded = 0;
  const app = { cur: () => slide, record: () => recorded++, refresh: () => {} };
  kinds.cardTogglesMenu(slide.slots).find((c) => c.id === 'reset-widths').run(app);
  assert.ok(!('cards.a' in slide.overrides) && !('cards.b' in slide.overrides), 'card widths cleared');
  assert.deepEqual(slide.overrides.title, { x: 1 }, 'non-card overrides untouched');
  assert.equal(recorded, 1);
});

test('cards layout adds the .cardrow col class only when stacked', () => {
  const flat = cardsLayout.render({ title: '', cards: [{ id: 'c1', parts: { body: true }, text: 'A' }] });
  assert.match(flat, /class="cardrow"/, 'row by default');
  assert.ok(!/cardrow col/.test(flat), 'no col class when not stacked');
  const stacked = cardsLayout.render({ title: '', stacked: true, cards: [{ id: 'c1', parts: { body: true }, text: 'A' }] });
  assert.match(stacked, /class="cardrow col"/, 'col class when stacked');
});

/* ---------- stacked cards: vertical resize axis + axis-aware labels ---------- */
test('geometryCaps: flowCard flips to HEIGHT resize when the row is stacked', () => {
  assert.deepEqual(geometryCaps('flowCard', true), { move: false, resizeW: false, resizeH: true, rotate: false }, 'stacked -> up/down handles');
  assert.deepEqual(geometryCaps('flowCard', false), { move: false, resizeW: true, resizeH: false, rotate: false }, 'row -> left/right handles');
});

test('flowCard.write stores the HEIGHT as the basis when the row is stacked', () => {
  const slide = { overrides: {}, slots: { stacked: true, cards: [{ id: 'a' }] } };
  const app = { cur: () => slide };
  strategies.flowCard.write(app, { ref: 'cards.a' }, { x: 0, y: 0, w: 300, h: 180, rot: 0 });
  assert.deepEqual(slide.overrides['cards.a'], { w: 180, flow: true }, 'basis = height when stacked (kept under w)');
});

test('cardTogglesMenu labels follow the active axis (widths in a row, heights when stacked)', () => {
  const row = kinds.cardTogglesMenu({ stacked: false });
  const col = kinds.cardTogglesMenu({ stacked: true });
  assert.notEqual(row.find((c) => c.id === 'reset-widths').label, col.find((c) => c.id === 'reset-widths').label, 'equalize label differs by axis');
  assert.notEqual(row.find((c) => c.id === 'sym').label, col.find((c) => c.id === 'sym').label, 'symmetric label differs by axis');
});
