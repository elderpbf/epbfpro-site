// codex/js/brand-marks.js, the third-party BRAND mark registry (WhatsApp, ...).
// Pure functions, so tested directly. The point of these tests is the boundary:
// a brand mark is filled artwork owned by someone else, NOT a glyphs.js stroke
// icon, and the two registries must not quietly converge. The WhatsApp path is
// pinned because it moved here verbatim from trilha/js/state.js and the Trail's
// "Grupo no WhatsApp" pill renders it live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { brandMark, brandMarkKeys, hasBrandMark } from '../js/brand-marks.js';
import * as glyphs from '../js/glyphs.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('brandMarkKeys exposes the registry and whatsapp is in it', () => {
  const keys = brandMarkKeys();
  assert.ok(Array.isArray(keys) && keys.length >= 1);
  assert.ok(keys.includes('whatsapp'));
  assert.equal(hasBrandMark('whatsapp'), true);
  assert.equal(hasBrandMark('nope-not-real'), false);
});

test('brandMark renders a filled svg and "" for an unknown key', () => {
  const svg = brandMark('whatsapp');
  assert.match(svg, /^<svg/);
  assert.match(svg, /fill="currentColor"/, 'a mark is filled, not stroked');
  assert.ok(!/stroke=/.test(svg), 'no stroke: this is artwork, not a line icon');
  assert.match(svg, /viewBox="0 0 24 24"/);
  assert.equal(brandMark('nope-not-real'), '', 'unknown key yields empty string, same contract as glyphSvg');
});

// The Trail pill sizes the mark from the stylesheet. Emitting width/height by default
// would override the sheet, which is why size is opt-in here and opt-out in glyphs.js.
test('brandMark omits width/height unless asked, so CSS keeps the sizing', () => {
  assert.ok(!/ width="/.test(brandMark('whatsapp')), 'no width by default');
  assert.match(brandMark('whatsapp', { size: 20 }), / width="20" height="20"/, 'explicit size honored');
  assert.match(brandMark('whatsapp', { cls: 'wa' }), /^<svg class="wa"/, 'cls honored');
});

test('the whatsapp path is the official mark, carried verbatim from state.js', () => {
  // Pinned start/end of the official WhatsApp glyph path. If this ever needs to change,
  // it is a brand decision, not a refactor: fail loudly rather than drift.
  const svg = brandMark('whatsapp');
  assert.ok(svg.includes('d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967'), 'path head intact');
  assert.ok(svg.includes('a11.821 11.821 0 00-3.48-8.413z"'), 'path tail intact');
});

test('state.js re-exports WA_ICON from the registry (the page.js seam holds)', () => {
  const src = read('../trilha/js/state.js');
  assert.match(src, /import \{ brandMark \} from '\.\.\/\.\.\/js\/brand-marks\.js'/, 'state.js sources the mark');
  assert.match(src, /export const WA_ICON = brandMark\('whatsapp'\)/, 'and re-exports it');
  assert.ok(!/M17\.472/.test(src), 'the hand-copied path is gone from state.js');
});

// The two registries answer different questions. If a mark ever shows up in GLYPHS,
// or an interface icon in MARKS, the split has failed and this catches it.
test('the registries stay disjoint: no brand mark leaks into the glyph library', () => {
  for (const k of brandMarkKeys()) {
    assert.equal(glyphs.hasGlyph(k), false, `${k} is a brand mark, it must not also be a glyph`);
  }
});

test('each file points at the other, so neither is a dead end', () => {
  assert.match(read('../js/brand-marks.js'), /js\/glyphs\.js/, 'brand-marks points to glyphs');
  assert.match(read('../js/glyphs.js'), /js\/brand-marks\.js/, 'glyphs points to brand-marks');
});
