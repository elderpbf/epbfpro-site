// The glyph library is owned by Codex; the shared consumers (the ct-type-filter
// chip strip, Trilha sub-cards, ClassVault sub-cards) must render a type's icon
// THROUGH it via the window.CdxGlyphs global, backward-compatibly: a "glyph:<key>"
// resolves to an inline SVG, a legacy emoji renders verbatim, and when CdxGlyphs
// is absent the old escaped-text path still works (no literal "glyph:" leak path
// is exercised once the global is present). These files live outside codex/, so
// we load/source-read them by relative path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as glyphs from '../js/glyphs.js';

const readAbs = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Load the window-global IIFE in an isolated `window` so we can drive render().
function loadTypeFilter(win) {
  const src = readAbs('../../backstage/js/ct-type-filter.js');
  // The IIFE closes over `window`; provide it as a parameter sandbox.
  new Function('window', src)(win);
  return win.CT_TYPE_FILTER;
}

function fakeContainer() {
  return {
    innerHTML: '',
    // render() wires clicks via querySelectorAll(...).forEach; an empty array
    // satisfies the contract without a DOM.
    querySelectorAll() { return []; },
  };
}

test('ct-type-filter renders a glyph:key icon as SVG via CdxGlyphs (no literal "glyph:" text)', () => {
  const win = { CdxGlyphs: glyphs };
  const CT = loadTypeFilter(win);
  const container = fakeContainer();
  CT.render({
    container,
    types: [{ slug: 'video', label: 'Vídeo', icon: 'glyph:video' }],
    items: [{ type: 'video' }],
    selectedSlug: null,
  });
  assert.match(container.innerHTML, /<svg/, 'glyph:key chip renders an svg');
  assert.ok(!/glyph:video/.test(container.innerHTML), 'never leaks the literal storage key');
});

test('ct-type-filter renders a legacy emoji icon verbatim via CdxGlyphs', () => {
  const win = { CdxGlyphs: glyphs };
  const CT = loadTypeFilter(win);
  const container = fakeContainer();
  CT.render({
    container,
    types: [{ slug: 'video', label: 'Vídeo', icon: '🎬' }],
    items: [{ type: 'video' }],
    selectedSlug: null,
  });
  assert.match(container.innerHTML, /🎬/, 'emoji still renders');
  assert.ok(!/glyph:/.test(container.innerHTML), 'no glyph prefix for an emoji icon');
});

test('ct-type-filter falls back to escaped text when CdxGlyphs is absent (no crash)', () => {
  const win = {}; // CdxGlyphs not exposed yet
  const CT = loadTypeFilter(win);
  const container = fakeContainer();
  assert.doesNotThrow(() => CT.render({
    container,
    types: [{ slug: 'video', label: 'Vídeo', icon: '🎬' }],
    items: [{ type: 'video' }],
    selectedSlug: null,
  }));
  assert.match(container.innerHTML, /🎬/, 'emoji icon still renders via the escaped-text fallback');
});

test('ct-type-filter reaches the glyph library through window.CdxGlyphs', () => {
  const src = readAbs('../../backstage/js/ct-type-filter.js');
  assert.match(src, /window\.CdxGlyphs/, 'chip rendering consults CdxGlyphs');
  assert.match(src, /iconHtml/, 'renders via iconHtml');
});

test('Trilha sub-cards render the type icon through CdxGlyphs', () => {
  const src = readAbs('../../trilha/js/trilha-sub.js');
  assert.match(src, /window\.CdxGlyphs/, 'trilha-sub consults CdxGlyphs');
  assert.match(src, /iconHtml/, 'renders item.type_icon via iconHtml');
});

test('ClassVault sub-cards render the type icon through CdxGlyphs', () => {
  const src = readAbs('../../backstage/classvault/js/classvault.js');
  assert.match(src, /window\.CdxGlyphs|CdxGlyphs\.iconHtml/, 'classvault consults CdxGlyphs');
});

test('Trilha flat cards render the type icon through CdxGlyphs', () => {
  const src = readAbs('../../trilha/js/trilha-flat.js');
  assert.match(src, /window\.CdxGlyphs/, 'trilha-flat consults CdxGlyphs');
  assert.match(src, /iconHtml/, 'renders item.type_icon via iconHtml');
});

test('cv-item-picker renders the type icon through CdxGlyphs', () => {
  const src = readAbs('../../backstage/js/cv-item-picker.js');
  assert.match(src, /window\.CdxGlyphs/, 'cv-item-picker consults CdxGlyphs');
  assert.ok(!/BSTypeIcon/.test(src), 'no longer leans on the retired BSTypeIcon');
});

test('ClassTrail ct-admin renders type icons through CdxGlyphs, not BSTypeIcon', () => {
  const src = readAbs('../../backstage/classtrail/js/ct-admin.js');
  assert.match(src, /window\.CdxGlyphs/, 'ct-admin consults CdxGlyphs');
  assert.ok(!/BSTypeIcon/.test(src), 'ct-admin no longer calls the retired BSTypeIcon');
});

test('every page that shows type icons exposes window.CdxGlyphs from the Codex glyph module', () => {
  const pages = [
    ['../index.html', false],                              // codex (module boot)
    ['../../trilha/index.html', true],
    ['../../backstage/classvault/index.html', true],
    ['../../backstage/classtrail/index.html', true],
  ];
  for (const [rel, needsImportPath] of pages) {
    const html = readAbs(rel);
    assert.match(html, /window\.CdxGlyphs\s*=/, `${rel} exposes CdxGlyphs`);
    if (needsImportPath) {
      assert.match(html, /codex\/js\/glyphs\.js/, `${rel} imports the Codex glyph library`);
    }
  }
});

test('<option> / AI-prompt surfaces strip the glyph: prefix (cannot hold an SVG)', () => {
  // A <select> option and the AI system prompt are plain text; they must never
  // surface the literal "glyph:<key>" storage token. Legacy emojis still pass.
  const form = readAbs('../../backstage/js/ct-item-form.js');
  assert.match(form, /indexOf\('glyph:'\)\s*!==\s*0/, 'ct-item-form option strips glyph keys');
  const aiSpec = readAbs('../../backstage/js/ct-ai-spec.js');
  assert.match(aiSpec, /indexOf\('glyph:'\)\s*!==\s*0/, 'ct-ai-spec prompt strips glyph keys');
});

test('BSTypeIcon hardcoded slug->glyph map is retired (returns the fallback only)', () => {
  const src = readAbs('../../backstage/js/utils.js');
  // The wrong-way layer is gone: no slug entries like `prompt: '¶'` remain.
  assert.ok(!/prompt:\s*'¶'/.test(src), 'no hardcoded prompt glyph');
  assert.ok(!/leitura:\s*'☰'/.test(src), 'no hardcoded leitura glyph');
});
