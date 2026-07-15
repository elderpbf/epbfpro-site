// Shared Codex glyph library + the types-manager facade binding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';
import * as glyphs from '../js/glyphs.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('glyphKeys returns a non-empty curated set', () => {
  const keys = glyphs.glyphKeys();
  assert.ok(Array.isArray(keys) && keys.length >= 12, 'at least a dozen glyphs');
  assert.ok(keys.includes('sparkle'), 'includes the AI sparkle used by the editor buttons');
});

test('glyphSvg renders an <svg> for a known key and "" for an unknown one', () => {
  const svg = glyphs.glyphSvg('book', { size: 20 });
  assert.match(svg, /^<svg/, 'returns an svg element');
  assert.match(svg, /width="20"/, 'honors size');
  assert.match(svg, /stroke="currentColor"/, 'inherits color');
  assert.equal(glyphs.glyphSvg('nope-not-real'), '', 'unknown key yields empty string');
});

// Registered from the drift audit. Each was being hand-drawn at a call site because the
// library had no key for it; external-link and menu had already forked into two rival
// drawings before landing here. Pinned so a tidy-up cannot quietly drop one and send the
// call sites back to hand-drawing.
test('the keys the call sites were hand-drawing are registered', () => {
  const keys = glyphs.glyphKeys();
  for (const k of ['external-link', 'menu', 'close', 'check', 'sort', 'maximize',
                   'lock-download', 'stopwatch', 'hourglass', 'message-circle', 'preset']) {
    assert.ok(keys.includes(k), `library registers ${k}`);
    assert.match(glyphs.glyphSvg(k), /^<svg/, `${k} renders`);
  }
});

// A filled glyph is the SAME shape reading as "on": a solid star is the favourited star.
// Without this the library can only return outlines, which is exactly why lessons.js
// hand-copied a star it already had a key for.
test('glyphSvg: filled swaps the fill, and outline stays the default', () => {
  assert.match(glyphs.glyphSvg('star', { filled: true }), /fill="currentColor"/, 'filled fills');
  assert.match(glyphs.glyphSvg('star'), /fill="none"/, 'default is still an outline');
  assert.match(glyphs.glyphSvg('star', { filled: false }), /fill="none"/, 'explicit false is an outline');
});

test('glyphSvg: strokeWidth is overridable and defaults to 2', () => {
  assert.match(glyphs.glyphSvg('star', { strokeWidth: 1.5 }), /stroke-width="1.5"/);
  assert.match(glyphs.glyphSvg('star'), /stroke-width="2"/, 'default unchanged');
});

// Some call sites size the icon from the stylesheet; emitting width/height would win
// over the sheet. size:null opts out. Only null does: omitting size keeps the 18 default.
test('glyphSvg: size:null omits width/height so CSS can size it', () => {
  const css = glyphs.glyphSvg('star', { size: null });
  assert.ok(!/ width="/.test(css), 'no width attribute');
  assert.ok(!/ height="/.test(css), 'no height attribute');
  assert.match(css, /viewBox="0 0 24 24"/, 'still a valid 24x24 svg');
  assert.match(glyphs.glyphSvg('star'), / width="18" height="18"/, 'omitting size keeps the default');
});

test('no glyph markup contains an emoji or an em dash', () => {
  const src = read('../js/glyphs.js');
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(src), 'glyph library is emoji-free');
  assert.ok(!/—/.test(src), 'no em dashes');
});

test('iconHtml resolves the glyph convention, falls back to emoji, then default', () => {
  const g = glyphs.iconHtml('glyph:video');
  assert.match(g, /^<svg/, 'glyph:<key> -> svg');
  const e = glyphs.iconHtml('🎦');
  assert.match(e, /cdx-type-emoji/, 'legacy emoji -> escaped span');
  assert.match(e, /🎦/, 'keeps the emoji char');
  const d = glyphs.iconHtml('');
  assert.match(d, /^<svg/, 'empty icon -> default glyph');
});

test('iconHtml escapes a legacy emoji/text icon (no raw injection)', () => {
  const out = glyphs.iconHtml('<b>x</b>');
  assert.ok(!/<b>/.test(out), 'angle brackets escaped');
});

test('isGlyphIcon only accepts a real glyph key', () => {
  assert.equal(glyphs.isGlyphIcon('glyph:star'), true);
  assert.equal(glyphs.isGlyphIcon('glyph:not-real'), false);
  assert.equal(glyphs.isGlyphIcon('⭐'), false);
});

test('facade binds the existing type-management actions (frozen contract)', () => {
  const apiSrc = read('../js/codex-api.js');
  assert.match(apiSrc, /updateType:\s*\(p\)\s*=>\s*call\('ct_update_type'/, 'updateType -> ct_update_type');
  assert.match(apiSrc, /deleteType:\s*\(p\)\s*=>\s*call\('ct_delete_type'/, 'deleteType -> ct_delete_type');
});

test('types-manager i18n keys exist in both dictionaries', () => {
  const sample = [
    'content.manage_types', 'content.types_title', 'content.pick_glyph',
    'content.change_glyph', 'content.type_updated', 'content.type_deleted', 'content.type_in_use'
  ];
  for (const k of sample) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});
