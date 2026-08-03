// track-56 fase 4: every client-side search in Codex now goes through js/text-search.js.
//
// This file is the LEDGER. The diagnosis that opened the track found eight searches, seven of
// them local, and not one folded accents: they compared raw strings, so "peticao" answered
// nothing for "Petição" in an app whose content is Portuguese. Fixing them one screen at a time
// is how they diverged in the first place, so the ledger asserts the shared matcher is reached
// from every one of them AND that no hand-rolled matcher grew back.
//
// The eighth, questions/bank.js, is deliberately NOT here: it searches on the WORKER
// (api.search), so folding happens server-side and a client matcher would be wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Every module that filters a list by free text, and the import that proves it delegates.
const CONSUMERS = [
  ['content/items.js',           'Itens'],
  ['certificates/certificates.js', 'Certificados'],
  ['cohorts/person-filters.js',  'Alunos'],
  ['content/labs.js',            'Labs'],
  ['lessons/lessons.js',         'Aulas'],
  ['content/presets.js',         'picker de Presets'],
  ['content/releases.js',        'compositor de Liberações'],
  ['js/list-rail.js',            'o próprio rail'],
];

for (const [rel, label] of CONSUMERS) {
  test(`${label} (${rel}) reaches the shared matcher`, () => {
    const src = read('../' + rel);
    assert.match(src, /from\s+['"][^'"]*text-search\.js['"]/, 'imports js/text-search.js');
  });
}

// Clientes is the one that does NOT import it: its search is the rail's capability, so the
// matcher is reached THROUGH js/list-rail.js. Declaring `search:` is what proves the delegation,
// and importing text-search.js there would be a sign it had gone back to filtering by hand.
test('Clientes (cohorts/cohorts.js) reaches the matcher through the rail, not directly', () => {
  const src = read('../cohorts/cohorts.js');
  assert.match(src, /search:\s*\{/, 'declares the rail search capability');
  assert.ok(!/from\s+['"][^'"]*text-search\.js['"]/.test(src), 'and does not filter by hand');
});

// The regression that matters most: a hand-rolled `toLowerCase().includes(q)` creeping back in.
// Narrow on purpose — it looks for the SHAPE of a text search, not for toLowerCase() at large
// (which is legitimately used for slugs, type keys and comparisons all over the repo).
const HANDROLLED = /toLowerCase\(\)\s*\.\s*(includes|indexOf)\s*\(\s*(q|query|search|term|needle)\b/;

for (const [rel, label] of CONSUMERS.concat([['cohorts/cohorts.js', 'Clientes']])) {
  test(`${label} has no hand-rolled text matcher left`, () => {
    assert.ok(!HANDROLLED.test(read('../' + rel)), 'found a raw toLowerCase().includes(query)');
  });
}

// ── the two DOM-walking searches ─────────────────────────────────────────────

test('Aulas filters DATA, not the painted DOM', () => {
  const src = read('../lessons/lessons.js');
  // The old _applySearch walked .cdx-rail-row and set style.display, which matched the type
  // badge as readily as the title, and was wiped by any _rail.render().
  assert.ok(!/style\.display\s*=\s*hit/.test(src), 'no row-hiding by style.display');
  assert.ok(!/\.textContent\s*\|\|\s*''\)\.toLowerCase\(\)\.indexOf/.test(src), 'does not read painted text');
  assert.match(src, /function _visibleEntries\(\)/, 'filters the entry list instead');
  assert.match(src, /items:\s*\(\)\s*=>\s*_visibleEntries\(\)/, 'the rail reads the filtered list');
});

test('Aulas drops the accordion while searching, so a hit is never behind a closed head', () => {
  const src = read('../lessons/lessons.js');
  assert.match(src, /exclusive:\s*\(\)\s*=>\s*!_search\.trim\(\)/, 'exclusive is a predicate on the query');
});

// Caught by the visual pass, not by any unit test: searching left "Itens (0)" and "Drive (0)"
// on screen with "SLIDES 0 / PROMPT 0" under them. js/list-tree.js drops a group only when it is
// empty ALL THE WAY DOWN, so a sub-level that never hides keeps its parent section alive.
test('Aulas hides empty groups at BOTH levels while searching, or the parent survives', async () => {
  const src = read('../lessons/lessons.js');
  const hides = src.match(/hideWhenEmpty:/g) || [];
  assert.equal(hides.length, 2, 'both the section level and the sub level declare it');
  assert.match(src, /hideWhenEmpty:\s*\(\)\s*=>\s*!!_search\.trim\(\)/, 'the sub level hides on a query');

  // And the engine rule that makes it necessary, pinned so it cannot drift silently.
  const { buildTree } = await import('../js/list-tree.js');
  const levels = [
    { of: () => null, list: () => [{ id: 'itens' }], hideWhenEmpty: true },
    { of: (i) => i.sub, list: () => [{ id: 'slides', parent: 'itens' }], hideWhenEmpty: false },
  ];
  assert.equal(buildTree([], levels).nodes.length, 1,
    'a never-hiding sub-group keeps its empty parent on screen');
  const bothHide = [levels[0], Object.assign({}, levels[1], { hideWhenEmpty: true })];
  assert.equal(buildTree([], bothHide).nodes.length, 0,
    'both hiding, and the whole empty branch goes');
});

test('Aulas no longer needs the filter re-applied after every render', () => {
  const src = read('../lessons/lessons.js');
  // _renderSidebar used to call _applySearch() after _rail.render() because the render wiped it.
  assert.ok(!/_rail\.render\(\);\s*\n\s*_applySearch\(\);/.test(src), 'the re-apply crutch is gone');
});

test('Liberações keeps its checkbox rows but folds accents in the matcher', () => {
  const src = read('../content/releases.js');
  // Re-rendering per keystroke would clear what the user had ticked (selection lives in the
  // checked state), so this one legitimately still toggles display. Only the matcher changed.
  assert.match(src, /data-title="'\s*\+\s*_esc\(normalize\(/, 'the stamped title is normalized');
  assert.match(src, /const q = normalize\(search\.value\)\.trim\(\)/, 'the query is normalized the same way');
  assert.ok(!/search\.value\.toLowerCase\(\)/.test(src), 'no raw lowercase left on the query');
});

// ── Clientes: the search that had been dead ──────────────────────────────────

test('Clientes has a real search again, owned by the rail', () => {
  const src = read('../cohorts/cohorts.js');
  assert.match(src, /search:\s*\{\s*\n?\s*fields:/, 'declares the rail search capability');
  assert.match(src, /_clientNameOf\(tm\.client_slug\)/, 'a turma is findable by its client');
});

test('Clientes drops the dead search code that outlived its input', () => {
  const src = read('../cohorts/cohorts.js');
  const css = read('../cohorts/cohorts.css');
  // _turmaSearch was read by _navModel and by emptyText, but no input ever wrote to it and no
  // element with IDS.search was rendered anywhere: the module read as if it had a search.
  assert.ok(!/_turmaSearch/.test(src), 'the phantom query variable is gone');
  assert.ok(!/search:\s*'cdx-cohorts-search'/.test(src), 'the phantom id is gone');
  assert.ok(!/^\.cdx-cohorts-search\s*\{/m.test(css), 'the orphaned CSS rules are gone');
});

test('Clientes lets the rail hide clients with no hit, instead of filtering sections itself', () => {
  const src = read('../cohorts/cohorts.js');
  // _navModel used to filter turmas AND drop clients; both are the rail's job now (it narrows
  // `items` and forces hideWhenEmpty while a query is live).
  assert.ok(!/a search hides clients with no hit/.test(src), 'the hand-rolled section filter is gone');
  assert.match(src, /emptyText:\s*\(q\)\s*=>/, 'the empty text reads the query the rail passes it');
});

test('the cohorts search placeholder exists in both dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  for (const k of ['cohorts.search_ph', 'cohorts.no_search_results']) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});

// ── presets picker ───────────────────────────────────────────────────────────

test('the presets picker searches title AND summary through the shared matcher', () => {
  const src = read('../content/presets.js');
  assert.match(src, /const hit = makeMatcher\(q\)/, 'builds one matcher per render, not per row');
  assert.ok(!/indexOf\(q\) !== -1/.test(src), 'the raw indexOf matcher is gone');
});
