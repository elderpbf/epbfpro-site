// slides-addslide.test.mjs — the grouped, preview-based +slide picker (Step 1).
// The flat layout menu outgrew a text list, so +slide now opens a modal of LIVE
// mini-render previews grouped by category, built-in layouts and saved layouts
// (the 4c.1 library) unified as one concept. Pure grouping logic + source-text
// wiring contracts; the DOM rendering itself stays staging-verified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { groupLayouts, GROUP_ORDER, addSlidePanelHTML } from '../content/slides/js/edit/addslide.js';
import * as registry from '../content/slides/js/layouts/registry.js';

const read = (rel) => {
  const p = fileURLToPath(new URL(rel, import.meta.url));
  assert.ok(fs.existsSync(p), `${rel} exists`);
  return fs.readFileSync(p, 'utf8');
};

/* ---------- grouping (pure) ---------- */
test('groupLayouts buckets by `group`, orders by GROUP_ORDER, drops empties, keeps input order within a group', () => {
  const layouts = [
    { id: 'cards', label: 'Cards', group: 'cards' },
    { id: 'cover', label: 'Capa', group: 'title' },
    { id: 'topics', label: 'Lista', group: 'lists' },
    { id: 'quote', label: 'Citacao', group: 'title' },
  ];
  const groups = groupLayouts(layouts);
  assert.deepEqual(groups.map((g) => g.key), ['title', 'lists', 'cards'], 'ordered by GROUP_ORDER, empties skipped');
  assert.deepEqual(groups[0].items.map((l) => l.id), ['cover', 'quote'], 'group keeps input order');
});

test('groupLayouts sends a missing/unknown group to "other", appended last', () => {
  const groups = groupLayouts([
    { id: 'x', label: 'X', group: 'title' },
    { id: 'y', label: 'Y' },             // no group
    { id: 'z', label: 'Z', group: 'weird' },
  ]);
  const keys = groups.map((g) => g.key);
  assert.equal(keys[0], 'title', 'known category first');
  assert.ok(keys.includes('weird'), 'unknown group preserved');
  assert.equal(keys[keys.length - 1], 'other', 'the catch-all bucket is always last');
});

/* ---------- every layout is categorised ---------- */
test('every registered layout declares a group that is a known GROUP_ORDER category', () => {
  for (const L of registry.list()) {
    assert.equal(typeof L.group, 'string', `${L.id} has a group`);
    assert.ok(GROUP_ORDER.includes(L.group), `${L.id} group "${L.group}" is a known category (no straggler -> other)`);
  }
});

/* ---------- panel scaffold ---------- */
test('addSlidePanelHTML returns a hidden overlay with a group/grid host', () => {
  const html = addSlidePanelHTML();
  assert.match(html, /id="add-slide-overlay"/, 'the overlay');
  assert.match(html, /id="add-slide-groups"/, 'the host the grids are built into');
  assert.match(html, /display:\s*none/, 'starts hidden');
});

/* ---------- source contracts ---------- */
test('addslide.js renders LIVE previews via the real renderInto (not hand-drawn icons)', () => {
  const src = read('../content/slides/js/edit/addslide.js');
  assert.match(src, /renderInto/, 'reuses the player renderInto for accurate previews');
  assert.match(src, /defaults\(\)/, 'previews a synthetic slide from each layout defaults()');
  assert.match(src, /app\.openAddSlide\s*=/, 'owns the +slide entry point');
  assert.ok(!/—/.test(src), 'no em dashes');
});

test('addslide click handlers add the built-in layout / insert the saved layout', () => {
  const src = read('../content/slides/js/edit/addslide.js');
  assert.match(src, /app\.addSlide\(/, 'a built-in card adds that layout');
  assert.match(src, /app\.insertTemplate\(/, 'a saved card inserts that template');
});

test('app.js mounts the add-slide modal and drops the context-bar picker entirely', () => {
  const src = read('../content/slides/js/app.js');
  assert.match(src, /addSlidePanelHTML\s*\(/, 'injects the panel HTML into the shell');
  assert.match(src, /initAddSlide\s*\(/, 'wires the panel');
  assert.ok(!/addSlideMenu/.test(src), 'no longer uses the context-bar addSlideMenu');
  assert.ok(!/templateMenu/.test(src), 'no longer uses templateMenu');
  assert.ok(!/openTemplatePicker/.test(src), 'no longer has the context-bar template picker');
});

test('menus.js retired the add-slide + template context-bar menus', () => {
  const src = read('../content/slides/js/edit/menus.js');
  assert.ok(!/export function addSlideMenu/.test(src), 'addSlideMenu retired');
  assert.ok(!/export function templateMenu/.test(src), 'templateMenu retired');
});

test('the add-slide overlay is styled, scoped under .cdx-deck-editor', () => {
  const css = read('../content/slides/css/ui.css');
  assert.match(css, /\.cdx-deck-editor #add-slide-overlay/, 'scoped overlay style exists');
});

// Regression: the preview box must paint the WHITE slide background (like the nav
// thumbnail .mini), not a theme var. On the dark Codex theme a var(--btn-bg) box
// made the slide content invisible (only the logo showed).
test('preview boxes use the white slide background + the mini treatment (not a theme var)', () => {
  const css = read('../content/slides/css/ui.css');
  assert.match(css, /\.as-prev[^}]*background:\s*#fff/i, '.as-prev paints the white slide background');
  const src = read('../content/slides/js/edit/addslide.js');
  assert.match(src, /as-prev mini/, 'preview reuses the thumbnail mini treatment (hides editor-only chrome)');
});

// Regression: previews must scale even when the box has no width at build time
// (the modal stays display:none while a saved-layout list loads). A bare rAF
// skipped scaling and left the render cropped to the corner; a ResizeObserver
// re-applies once the box gets a real width.
test('preview scaling survives a hidden-at-build modal (ResizeObserver, not a bare rAF)', () => {
  const src = read('../content/slides/js/edit/addslide.js');
  assert.match(src, /ResizeObserver/, 'scales the preview when the box first gets a width');
});
