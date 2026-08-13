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
  assert.match(src, /cfg\.reorder\s*=\s*\{[\s\S]{0,900}?onReorder:/, 'enables the rail reorder config');
  // Still the registry, never local state. The argument gained a merge step once search and
  // chips made the visible list partial (see mergeVisibleOrder below).
  assert.match(src, /setLabOrder\(mergeVisibleOrder\(/, 'persists the drop order via the registry, not local state');
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
    'labs.archive', 'labs.restore', 'labs.archived', 'labs.back_active',
    'labs.search_ph', 'labs.filter_all', 'labs.filter_on', 'labs.filter_off', 'labs.empty_search', 'labs.empty_filter']) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});

// ── search + enabled/disabled chips (phase 3) ─────────────────────────────────
// The free-text query belongs to the RAIL (js/list-rail.js owns the input, which is what keeps
// it alive across a keystroke repaint); the enabled/disabled cut is CONSUMER state and narrows
// the list here, before the rail sees it. These tests pin the consumer half.

const LABS = [
  { key: 'k5',  title: 'Tokens',             summary: 'palavra nao e token' },
  { key: 'k6',  title: 'Embeddings',         summary: 'significado vira posicao' },
  { key: 'k20', title: 'Aposta na Citação',  summary: 'alucinação jurídica' },
  { key: 'k22', title: 'Próximo Token',      summary: 'o pipeline do transformer' },
];
const OFF = new Set(['k6']);
const enabled = (k) => !OFF.has(k);
const keys = (list) => list.map((l) => l.key);

test('the status chip cuts the list by enabled/disabled', () => {
  assert.deepEqual(keys(labs.applyLabStatusFilter(LABS, 'all', enabled)), ['k5', 'k6', 'k20', 'k22']);
  assert.deepEqual(keys(labs.applyLabStatusFilter(LABS, 'on', enabled)), ['k5', 'k20', 'k22']);
  assert.deepEqual(keys(labs.applyLabStatusFilter(LABS, 'off', enabled)), ['k6']);
});

test('an unknown status behaves as "all" rather than emptying the panel', () => {
  assert.deepEqual(keys(labs.applyLabStatusFilter(LABS, undefined, enabled)), ['k5', 'k6', 'k20', 'k22']);
});

test('applyLabStatusFilter is pure: it does not mutate the list it was given', () => {
  const input = LABS.slice();
  labs.applyLabStatusFilter(input, 'on', enabled);
  assert.equal(input.length, 4);
});

test('chip counts split the whole list when there is no query', () => {
  assert.deepEqual(labs.labChipCounts(LABS, enabled, ''), { all: 4, on: 3, off: 1 });
});

test('chip counts follow the search, so they cannot contradict the rows on screen', () => {
  assert.deepEqual(labs.labChipCounts(LABS, enabled, 'token'), { all: 2, on: 2, off: 0 });
  assert.deepEqual(labs.labChipCounts(LABS, enabled, 'embeddings'), { all: 1, on: 0, off: 1 });
});

test('chip counts ignore accents, like every other search in Codex', () => {
  assert.deepEqual(labs.labChipCounts(LABS, enabled, 'citacao'), { all: 1, on: 1, off: 0 });
  assert.deepEqual(labs.labChipCounts(LABS, enabled, 'proximo'), { all: 1, on: 1, off: 0 });
});

test('a lab is searchable by its KEY, because Élder refers to labs by number', () => {
  assert.deepEqual(labs.labChipCounts(LABS, enabled, 'k22'), { all: 1, on: 1, off: 0 });
});

test('a query that hits nothing zeroes every chip instead of throwing', () => {
  assert.deepEqual(labs.labChipCounts(LABS, enabled, 'zzz'), { all: 0, on: 0, off: 0 });
});

// Search and chips made a PARTIAL list possible for the first time, and setLabOrder replaces
// the whole stored order with what it is given. Dragging while filtered would therefore have
// dropped every hidden lab to the end of the order.
test('reordering a filtered list leaves the hidden labs in their own slots', () => {
  const all = ['k5', 'k6', 'k20', 'k22'];
  // Only k5 and k20 are on screen; the drag swaps them. k6 and k22 must not move.
  assert.deepEqual(labs.mergeVisibleOrder(all, ['k20', 'k5']), ['k20', 'k6', 'k5', 'k22']);
});

test('reordering the full list behaves exactly as it did before (no filter on)', () => {
  const all = ['k5', 'k6', 'k20'];
  assert.deepEqual(labs.mergeVisibleOrder(all, ['k20', 'k5', 'k6']), ['k20', 'k5', 'k6']);
});

test('mergeVisibleOrder only ever rewrites the slots the visible rows already held', () => {
  // b and e are the two rows on screen (slots 1 and 4); the drag put e above b. a, c and d are
  // filtered out and must not move, so only slots 1 and 4 change hands.
  const all = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(labs.mergeVisibleOrder(all, ['e', 'b']), ['a', 'e', 'c', 'd', 'b']);
});

test('mergeVisibleOrder ignores a key that is not in the full order', () => {
  assert.deepEqual(labs.mergeVisibleOrder(['k5', 'k6'], ['k6', 'ghost', 'k5']), ['k6', 'k5']);
});

test('mergeVisibleOrder survives empty input instead of wiping the order', () => {
  assert.deepEqual(labs.mergeVisibleOrder(['k5', 'k6'], []), ['k5', 'k6']);
  assert.deepEqual(labs.mergeVisibleOrder([], ['k5']), []);
  assert.deepEqual(labs.mergeVisibleOrder(null, null), []);
});

test('labs does not hand the visible-only ids straight to setLabOrder', () => {
  const src = read('../content/labs.js');
  assert.ok(!/setLabOrder\(keys\)/.test(src), 'a filtered drag must not overwrite the whole order');
  assert.match(src, /setLabOrder\(mergeVisibleOrder\(/, 'the partial order is merged back in');
});

test('the drag grip is withdrawn while the list is narrowed by a chip or a query', () => {
  const src = read('../content/labs.js');
  assert.match(src, /gated:\s*\(\)\s*=>\s*_isNarrowed\(\)/, 'reorder is gated on the narrowed state');
  assert.match(src, /function _isNarrowed\(\)[\s\S]*?_statusFilter !== 'all'/, 'a chip narrows it');
  assert.match(src, /function _isNarrowed\(\)[\s\S]*?_rail\.query\(\)/, 'a search query narrows it too');
});

test('labs wires the rail search + chips instead of hand-rolling its own', () => {
  const src = read('../content/labs.js');
  assert.match(src, /search:\s*\{\s*fields:/, 'declares the rail search capability');
  assert.match(src, /from\s+['"]\.\.\/js\/text-search\.js['"]/, 'uses the shared matcher, not its own toLowerCase');
  assert.match(src, /cfg\.filter\s*=\s*\{\s*chips:/, 'declares the rail filter chips');
  assert.ok(!/addEventListener\(\s*['"]input['"]/.test(src), 'does NOT wire its own search input (that is the rail\'s job)');
  assert.ok(!/toLowerCase\(\)\.includes|indexOf\(q\)/.test(src), 'no hand-rolled matcher left behind');
});

test('the chips are the active list only: the Arquivados drawer gets search but no status cut', () => {
  const src = read('../content/labs.js');
  // Position, not shape: `search:` sits in the cfg literal both modes share, while `cfg.filter`
  // is assigned afterwards inside the `if (!archived)` block. Comparing offsets survives
  // reformatting and line endings, which a multiline regex over the two does not.
  const searchAt = src.indexOf('search: {');
  const gateAt = src.indexOf('if (!archived) {');
  const filterAt = src.indexOf('cfg.filter =');
  assert.ok(searchAt > 0 && gateAt > 0 && filterAt > 0, 'all three anchors present');
  assert.ok(searchAt < gateAt, 'search is in the shared cfg, so it applies in the drawer too');
  assert.ok(filterAt > gateAt, 'the status chips are gated on the active list');
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
