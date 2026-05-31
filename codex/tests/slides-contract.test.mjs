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

// Regression guard for the "editor rendered with no CSS loaded" bug: the three
// editor stylesheets must actually be linked in index.html, and each must exist.
test('the editor stylesheets are linked in index.html and exist on disk', () => {
  const html = read('../index.html');
  for (const f of ['tokens', 'slide', 'ui']) {
    assert.match(html, new RegExp('content/slides/css/' + f + '\\.css'),
      `index.html links content/slides/css/${f}.css`);
    read('../content/slides/css/' + f + '.css'); // throws if missing
  }
});

// The editor stylesheets MUST be scoped under .cdx-deck-editor so they cannot
// leak into the Codex page (the exact failure mode of the standalone mock CSS).
test('editor stylesheets are scoped to .cdx-deck-editor (no global leak)', () => {
  for (const f of ['ui', 'slide']) {
    const css = read('../content/slides/css/' + f + '.css');
    // No bare top-level structural selectors that would hit the whole document.
    assert.ok(!/^\s*\*\s*\{/m.test(css), `${f}.css has no bare universal (*) rule`);
    assert.ok(!/^\s*body\s*[,{]/m.test(css), `${f}.css has no bare body rule`);
    assert.ok(!/^\s*#(stage|chrome|nav)\b/m.test(css), `${f}.css has no unscoped #stage/#chrome/#nav`);
    assert.ok(/\.cdx-deck-editor/.test(css), `${f}.css scopes under .cdx-deck-editor`);
  }
});

// The sub-tab must mount the editor inside a .cdx-deck-editor container so the
// scoped styles apply.
test('slides.js mounts the editor in a .cdx-deck-editor container', () => {
  assert.match(read('../content/slides.js'), /cdx-deck-editor/, 'editor host carries cdx-deck-editor');
});
