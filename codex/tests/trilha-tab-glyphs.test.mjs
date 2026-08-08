// trilha-tab-glyphs.test.mjs — the Trilha tab bar icons come from the library.
//
// Exists because of a rule of Élder's (2026-07-16): the icon comes from js/glyphs.js, always.
// He asked about the chat bubble and the finding was that `trilha/index.html` drew SIX <svg>
// by hand in the mobile tab bar, FOUR of them byte-for-byte copies of drawings the library
// already had (message-square, folder, grid, book), one re-encode of `checklist` (path x
// polyline, same vertices), and a single mark missing from the library (`lines`, now registered).
//
// This pins the CLASS: a new tab cannot be born with a hand-drawn svg, and no map key can
// vanish from the library without someone noticing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasGlyph } from '../js/glyphs.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));        // .../codex/
const SITE = path.join(ROOT, '..');                                 // repo root
const PAGE = path.join(ROOT, 'trilha', 'js', 'page.js');

// PURE: the data-tab -> glyph-key map, read from page.js (single source).
function tabGlyphMap() {
  const src = fs.readFileSync(PAGE, 'utf8');
  const m = /const TAB_GLYPH = \{([\s\S]*?)\};/.exec(src);
  assert.ok(m, 'TAB_GLYPH exists in page.js');
  return Object.fromEntries([...m[1].matchAll(/(\w+):\s*'([\w-]+)'/g)].map((x) => [x[1], x[2]]));
}

test('the Trilha HTML does not draw a tab icon by hand', () => {
  const html = fs.readFileSync(path.join(SITE, 'trilha', 'index.html'), 'utf8');
  assert.equal((html.match(/<svg/g) || []).length, 0,
    'trilha/index.html has inline <svg> again; the icon should come from glyphSvg (see TAB_GLYPH in page.js)');
});

test('every TAB_GLYPH key exists in the library', () => {
  const map = tabGlyphMap();
  assert.ok(Object.keys(map).length >= 6, 'the 6 tabs are mapped (found ' + Object.keys(map).length + ')');
  const missing = Object.entries(map).filter(([, key]) => !hasGlyph(key)).map(([tab, key]) => tab + ' -> ' + key);
  assert.deepEqual(missing, [], 'tab(s) pointing to a key that does not exist in glyphs.js');
});

// Every tab in the HTML must be in the map, otherwise it renders with NO icon on mobile (a
// silent failure: desktop hides the icon, so it would go unnoticed by any desktop test).
test('every tab in the HTML has an entry in TAB_GLYPH', () => {
  const html = fs.readFileSync(path.join(SITE, 'trilha', 'index.html'), 'utf8');
  // `[^"]*` in the class: the active tab is born with `class="cdx-tr-tab-btn active"` and a
  // regex that requires the quote right after would miss exactly that one (this is what this
  // test caught on its 1st run).
  const tabs = [...html.matchAll(/class="cdx-tr-tab-btn[^"]*"[^>]*data-tab="(\w+)"/g)].map((m) => m[1]);
  assert.ok(tabs.length >= 6, 'found the tabs in the HTML (' + tabs.length + ')');
  const map = tabGlyphMap();
  assert.deepEqual(tabs.filter((tab) => !map[tab]), [], 'HTML tab(s) with no glyph in the map');
});

test('page.js injects via the library, with CSS owning the size', () => {
  const src = fs.readFileSync(PAGE, 'utf8');
  assert.match(src, /import \{ glyphSvg \} from '\.\.\/\.\.\/js\/glyphs\.js'/, 'imports the library');
  assert.match(src, /glyphSvg\(key, \{ size: null, cls: 'cdx-tr-tab-ico' \}\)/,
    'size:null (mobile.css owns width/height/stroke, down to stroke-width 1.9)');
});
