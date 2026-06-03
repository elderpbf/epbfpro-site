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

// Regression guard for the blank-editor loop. The editor is mounted three
// wrappers deep (.bs-main > .cdx-view > #cdx-subview, all height:auto) and its
// internals are position:absolute, so it has NO intrinsic height. Two failed
// approaches both collapsed it to 0 (only the Back bar showed): (a) routing a
// height through a JS-set CSS variable, which desynced because slides.js is an
// unversioned ES module cached independently of the versioned slides.css; and
// (b) a :has() flex chain that skipped the #cdx-subview wrapper. The fix is
// Codex-native: the editor claims its own viewport region with position:fixed
// below the chrome, depending on NO ancestor height, NO shell override, and NO
// JavaScript. This guard locks all three properties in.
test('editor fills the window via position:fixed, no JS sizing, no shell hacks', () => {
  const js = read('../content/slides.js');
  assert.ok(!/_sizeEditor/.test(js), 'slides.js has no JS sizing function');
  assert.ok(!/innerHeight/.test(js), 'slides.js does not compute height in JS');
  assert.ok(!/--cdx-breakout/.test(js), 'slides.js sets no breakout CSS variable');
  const css = read('../content/slides.css');
  // Strip /* comments */ so prose mentioning the shell does not trip the guard;
  // only real rules are inspected.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(rules, /\.cdx-slides-shell[^}]*position:\s*fixed/s, 'editor shell is position:fixed');
  assert.ok(!/\.bs-main|\.cdx-view\b/.test(rules), 'slides.css does not reach up and restyle the shell');
  assert.ok(!/--cdx-breakout/.test(rules), 'slides.css does not depend on a JS-set variable');
});

// Slice 1 of the unified selection model: asset + logo controls are no longer
// emitted by the renderer; they live in the stage-docked selection bar. Guards
// the plugin-contract leak (H7/H8) the contract dissolves stays dissolved.
test('player.js no longer emits .assetctl or .logoctl (controls moved to the selection bar)', () => {
  const src = read('../content/slides/js/render/player.js');
  assert.ok(!/assetctl/.test(src), 'player.js emits no .assetctl');
  assert.ok(!/logoctl/.test(src), 'player.js emits no .logoctl');
  assert.match(src, /export\s+function\s+resolveLogo\s*\(/, 'player.js exports resolveLogo (A1)');
  assert.match(src, /DEFAULT_LOGO/, 'player.js surfaces the shared DEFAULT_LOGO');
});

// Image box (item a): empty image slots are SELECTABLE boxes, not click-to-pick
// auto-openers. The editor no longer opens the OS file picker on an empty-slot
// click (the context bar's "add image" button does it instead), and the cover
// hero is a selectable box (its empty icon slot carries data-fkey) rather than a
// BRAIN that auto-picks on click.
test('editor.js does not auto-open the file picker on an empty-slot click', () => {
  const src = read('../content/slides/js/edit/editor.js');
  assert.ok(!/\.dropzone:not\(\.filled\)/.test(src),
    'no click-to-pick on empty dropzones (the image box selects instead)');
});

test('cover hero is a selectable image box: its empty icon slot carries data-fkey', () => {
  const src = read('../content/slides/js/layouts/cover.js');
  assert.ok(!/heroicon dropzone"\s+data-img="icon">/.test(src),
    'the empty hero box carries data-fkey (selectable), not a bare auto-pick box');
});

// 5d: the recolour-mask popover (#maskpop) is extracted into a self-contained
// edit/maskpanel.js (markup + wiring + outside-click close), draining app.js so it
// stays a thin composition root. app.openMask stays the public entry the bar's
// compound control and the slot data-mask button call.
test('the mask popover is a self-contained edit/maskpanel.js, drained from app.js (5d)', () => {
  const panel = read('../content/slides/js/edit/maskpanel.js');
  assert.match(panel, /export\s+function\s+maskPanelHTML\s*\(/, 'maskpanel exports maskPanelHTML');
  assert.match(panel, /export\s+function\s+initMaskPanel\s*\(/, 'maskpanel exports initMaskPanel');
  assert.match(panel, /id="maskpop"/, 'maskpanel owns the #maskpop markup');
  assert.match(panel, /data-mtype="gradient"/, 'maskpanel owns the mask type buttons');

  const appjs = read('../content/slides/js/app.js');
  assert.match(appjs, /initMaskPanel\s*\(/, 'app.js wires the panel via initMaskPanel');
  assert.match(appjs, /maskPanelHTML\s*\(/, 'app.js injects the panel HTML via maskPanelHTML()');
  assert.ok(!/id="maskpop"/.test(appjs), 'app.js no longer inlines the #maskpop markup');
  assert.ok(!/maskObj/.test(appjs), 'app.js no longer owns maskObj (moved into the panel)');
  assert.ok(!/\[data-mtype\]/.test(appjs), 'app.js no longer wires the mask type buttons');
});

// The unified selection model lives in its own js/select/ folder and carries a
// loud scope banner: it is SLIDES-EDITOR-INTERNAL ONLY and must not be adopted
// by other Codex tabs.
test('the js/select selection model exists and is scoped to the slides editor', () => {
  for (const f of ['selection', 'kinds', 'geometry', 'bar', 'wiring']) {
    read('../content/slides/js/select/' + f + '.js'); // throws if missing
  }
  const spine = read('../content/slides/js/select/selection.js');
  assert.match(spine, /SLIDES-EDITOR/i, 'selection.js carries the scope-lock banner');
});
