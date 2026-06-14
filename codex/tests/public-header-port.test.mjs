// codex/trilha/css/public-header.css — the Trail (public face) now owns its copy
// of the pensoia-header component CSS. Verbatim relocation: the 4 Trail/validar
// entry pages (the two hand-synced trees, codex/trilha/ and the served trilha/)
// link the Codex copy and drop the backstage css link, which leaves NO
// /backstage/*.css on the Trail. The same pass dropped the dead backstage utils.js
// load from the two index pages. Contract: byte-identical to the frozen backstage
// source, the pages link the Codex copy, and no backstage CSS / dead utils.js
// remains. (The header component behavior is covered by trilha-header.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// The two synced trees: codex/trilha/* (../trilha) and the served trilha/* (../../trilha).
const TRAIL_PAGES = [
  '../trilha/index.html',
  '../trilha/validar.html',
  '../../trilha/index.html',
  '../../trilha/validar.html',
];

test('codex/trilha/css/public-header.css is a verbatim copy of the frozen backstage source', () => {
  const codex = read('../trilha/css/public-header.css');
  const backstage = read('../../backstage/css/public-header.css');
  assert.equal(codex, backstage, 'the Codex copy must match the backstage source byte-for-byte');
});

test('the Codex copy carries the pensoia-header family (sanity on the copy)', () => {
  const css = read('../trilha/css/public-header.css');
  assert.match(css, /pensoia-header\b/, 'pensoia-header rules present');
  assert.match(css, /\.ph-bar\b/, '.ph-bar present');
  assert.match(css, /\.ph-modal\b/, '.ph-modal present');
});

test('every Trail/validar page links the Codex copy and no longer the backstage one', () => {
  for (const p of TRAIL_PAGES) {
    const html = read(p);
    assert.match(html, /href="\/codex\/trilha\/css\/public-header\.css/, `${p} links the Codex copy`);
    assert.ok(!/\/backstage\/css\/public-header\.css/.test(html), `${p} no longer links backstage public-header.css`);
  }
});

test('milestone: NO /backstage/*.css link remains on any Trail page', () => {
  for (const p of TRAIL_PAGES) {
    const html = read(p);
    assert.ok(!/<link[^>]+href="\/backstage\/[^"]*\.css/.test(html), `${p} still has a backstage stylesheet link`);
  }
});

test('the two Trail index pages dropped the dead backstage utils.js load', () => {
  for (const p of ['../trilha/index.html', '../../trilha/index.html']) {
    const html = read(p);
    assert.ok(!/<script[^>]+\/backstage\/js\/utils\.js/.test(html), `${p} still loads backstage utils.js`);
  }
});

test('the relocated copy has no relative url()/@import that the move would break', () => {
  const css = read('../trilha/css/public-header.css');
  assert.ok(!/url\(\s*['"]?\.\.?\//.test(css), 'no relative url() refs');
  assert.ok(!/@import/.test(css), 'no @import');
});
