// slides-contract.test.mjs — guards the Slides sub-tab against the Codex module
// contract and the classforge-copy mistake that was reverted once already.
// Zero-dependency, asserts by reading source text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => {
  const p = fileURLToPath(new URL(rel, import.meta.url));
  assert.ok(fs.existsSync(p), `${rel} exists`);
  return fs.readFileSync(p, 'utf8');
};

test('slides.js exports mount + unmount', () => {
  const src = read('../content/slides.js');
  assert.match(src, /export\s+function\s+mount\s*\(/, 'slides.js exports mount');
  assert.match(src, /export\s+function\s+unmount\s*\(/, 'slides.js exports unmount');
});

test('slides.js + codexStore reach the backend ONLY via the facade', () => {
  for (const f of ['../content/slides.js', '../content/slides/adapters/codexStore.js']) {
    assert.ok(!/\bcallWorker\s*\(/.test(read(f)), `${f} makes no direct callWorker() call`);
  }
  assert.match(read('../content/slides.js'), /from\s+['"]\.\.\/js\/codex-api\.js['"]/, 'slides.js imports the facade');
});

test('codexStore names no raw Worker action strings (facade owns them)', () => {
  const src = read('../content/slides/adapters/codexStore.js');
  assert.ok(!/get_presentation_json|put_presentation_json/.test(src),
    'codexStore should call the facade, not name raw actions');
});

test('Slides sub-tab carries NO classforge dependency (the reverted mistake)', () => {
  for (const f of ['../content/slides.js', '../content/slides/adapters/codexStore.js', '../content/slides/js/app.js']) {
    assert.ok(!/classforge|html-slides/i.test(read(f)), `${f} references classforge`);
  }
});

test('the copied editor exposes the mount/unmount contract', () => {
  const src = read('../content/slides/js/app.js');
  assert.match(src, /export\s+function\s+mount\s*\(/, 'editor app.js exports mount');
  assert.match(src, /export\s+function\s+unmount\s*\(/, 'editor app.js exports unmount');
});

test('slides authored source is clean (cdx- prefix, no inline JS, no em dash)', () => {
  const src = read('../content/slides.js');
  assert.ok(/cdx-/.test(src), 'authors cdx- classes');
  assert.ok(!/onclick\s*=/.test(src), 'no inline onclick handlers');
  assert.ok(!/—/.test(src), 'no em dashes');
});

test('content.js registers the slides sub-tab in SUBTABS', () => {
  const src = read('../content/content.js');
  assert.match(src, /key:\s*'slides'/, 'SUBTABS has a slides entry');
  assert.match(src, /content\.sub_slides/, 'slides entry uses content.sub_slides labelKey');
  assert.match(src, /import \* as slides/, 'content.js imports the slides module');
});
