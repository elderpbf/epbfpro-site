// Labs sub-tab: NATIVE cdx- module (was a CTLabsPanel global wrapper). Tab
// contract + module source rules + the shared-state/registry contract. The lab
// registry (js/labs-registry.js) and the fullscreen preview modal (js/lab-viewer.js)
// are now Codex ES modules; this module owns only the panel UI and the on/off
// state, which it writes to the SAME localStorage key labs-registry.isLabEnabled
// reads ('cv_labs_enabled').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const labs = await import('../content/labs.js');

test('labs module satisfies the tab contract', () => {
  assert.equal(typeof labs.mount, 'function', 'exports mount');
  assert.equal(typeof labs.unmount, 'function', 'exports unmount');
});

test('labs is a native cdx- module, not a CTLabsPanel wrapper', () => {
  const src = read('../content/labs.js');
  assert.ok(!/window\.CTLabsPanel/.test(src), 'no longer accesses the legacy CTLabsPanel global');
  assert.match(src, /cdx-items-split/, 'reuses the Items master-detail split shell');
  assert.match(src, /cdx-item-preview|cdx-labs-preview/, 'has a preview pane');
  assert.match(src, /cdx-item-row/, 'renders the list as cdx- rows (not a per-tab card grid)');
  assert.match(src, /cdx-lab-switch/, 'native on/off switch');
  // The right-pane preview is the lab rendered at viewport size then scaled down
  // (looks like fullscreen, small), boxed and non-interactive.
  assert.match(src, /cdx-lab-frame-wrap/, 'preview is a boxed frame');
  assert.match(src, /scale\(/, 'preview is transform-scaled to look like fullscreen');
  assert.match(read('../content/content.css'), /\.cdx-lab-frame[^-][^{]*\{[^}]*pointer-events:\s*none/, 'small preview is non-interactive');
  assert.match(src, /from\s+['"]\.\.\/js\/i18n\.js['"]/, 'imports t()');
  assert.ok(!/—/.test(src), 'no em dashes');
  assert.ok(!/class="ct-/.test(src) && !/class="cv-/.test(src), 'authors no ct-/cv- markup');
});

test('labs preserves the shared state + registry contract', () => {
  const src = read('../content/labs.js');
  assert.match(src, /cv_labs_enabled/, 'writes the same on/off key labs-registry.isLabEnabled reads');
  assert.match(src, /from\s+['"]\.\.\/js\/labs-registry\.js['"]/, 'reads the Codex lab registry module');
  assert.match(src, /from\s+['"]\.\.\/js\/lab-viewer\.js['"]/, 'delegates fullscreen preview to the Codex viewer module');
  assert.ok(!/window\.CVLabs\b/.test(src), 'no longer reads the backstage CVLabs global');
  assert.ok(!/window\.CVLabViewer\b/.test(src), 'no longer reads the backstage CVLabViewer global');
});

test('labs list rail supports drag-to-reorder, propagated via labs-registry', () => {
  const src = read('../content/labs.js');
  assert.match(src, /import \{[^}]*\borderedLabs\b[^}]*\bsetLabOrder\b[^}]*\} from '\.\.\/js\/labs-registry\.js'/, 'reads the ordered/emoji registry API');
  assert.match(src, /reorder\s*=\s*\{\s*onReorder:/, 'enables the rail reorder config');
  assert.match(src, /setLabOrder\(keys\)/, 'persists the drop order via the registry, not local state');
  assert.ok(!/window\.CTLabsPanel/.test(src), 'still no legacy global (regression guard)');
});

test('labs list rows show the per-lab emoji instead of a fixed diamond glyph', () => {
  const src = read('../content/labs.js');
  assert.ok(!/&#9672;/.test(src), 'no more hardcoded diamond glyph');
  assert.match(src, /typeIconHtml\(labIcon\(lab\.key\), \{ size: 16 \}\)/, 'row icon resolves per-lab via labIcon');
});

test('labs strings route through t() in both dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  for (const k of ['labs.title', 'labs.hint', 'labs.preview', 'labs.toggle', 'labs.lab_prefix', 'labs.select', 'labs.unavailable',
    'labs.archive', 'labs.restore', 'labs.archived', 'labs.back_active']) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});

test('labs supports archive: put-away drawer with restore, wired to the registry', () => {
  const src = read('../content/labs.js');
  assert.match(src, /import \{[^}]*\barchivedLabs\b[^}]*\bsetLabArchived\b[^}]*\} from '\.\.\/js\/labs-registry\.js'/, 'reads the archive registry API');
  assert.match(src, /data-action="archive"/, 'active preview has an Arquivar action');
  assert.match(src, /data-action="restore"/, 'archived rows/preview have a Restaurar action');
  assert.match(src, /data-action="show-archived"/, 'the labs list has a footer button that opens the Arquivados drawer');
  assert.match(src, /setLabArchived\(key,\s*(true|on)\)|setLabArchived\(key, on\)/, 'toggles archived state via the registry, not local UI state');
  assert.match(src, /_setEnabled\(key,\s*!on\)/, 'archiving also disables the lab (restore re-enables it)');
});
