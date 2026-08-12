// The editor's navigation stack and its save plan (content/editor/nav.js), plus the guard that
// the member list actually USES the block-indent engine.
//
// That last one exists because of a real defect: js/item-list.js had shiftIndent, it was tested,
// and content/item-members.js still assigned `chosen[i].indent` by hand. A pure function with a
// green test and no caller looks exactly like a working feature until someone clicks the button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createNav, planSave, resolveMembers, isNewKey, MAX_DEPTH } from '../content/editor/nav.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── the stack ────────────────────────────────────────────────────────────────
test('nav: the ceiling is the bundle model, not a preference', () => {
  const nav = createNav({ maxDepth: 3 });
  assert.equal(MAX_DEPTH, 3);
  assert.ok(nav.push({ key: 1 }));
  assert.ok(nav.push({ key: 2 }));
  assert.ok(nav.push({ key: 3 }));
  assert.equal(nav.canPush(), false);
  assert.equal(nav.push({ key: 4 }), false, 'a fourth level is refused, not silently allowed');
  assert.equal(nav.depth(), 3);
});

test('nav: the root can never be popped away', () => {
  const nav = createNav({});
  nav.push({ key: 'root' });
  assert.equal(nav.pop(), null);
  assert.equal(nav.depth(), 1);
});

test('nav: a crumb click drops the deeper levels but NOT their drafts', () => {
  const nav = createNav({});
  nav.push({ key: 'a' }); nav.push({ key: 'b' }); nav.push({ key: 'c' });
  nav.stash('c', { params: { title: 'typed here' }, isNew: false });
  assert.ok(nav.popTo(0));
  assert.equal(nav.depth(), 1);
  assert.equal(nav.draft('c').params.title, 'typed here', 'leaving a member never discards');
});

test('nav: popTo refuses a position that is not an ancestor', () => {
  const nav = createNav({});
  nav.push({ key: 'a' }); nav.push({ key: 'b' });
  assert.equal(nav.popTo(1), false, 'where you already are is not somewhere to go');
  assert.equal(nav.popTo(9), false);
});

test('nav: new keys are unique and recognisable', () => {
  const nav = createNav({});
  const k1 = nav.nextNewKey();
  const k2 = nav.nextNewKey();
  assert.notEqual(k1, k2);
  assert.ok(isNewKey(k1));
  assert.equal(isNewKey(7), false, 'an id is not a synthetic key');
});

// ── the save plan ────────────────────────────────────────────────────────────
test('planSave: everything new is created BEFORE any member list names it', () => {
  const plan = planSave([
    [10, { isNew: false, params: { title: 'the package' }, members: [{ key: 'new:1', indent: 0 }] }],
    ['new:1', { isNew: true, params: { title: 'born inside' } }],
  ]);
  const iCreate = plan.findIndex((s) => s.op === 'create');
  const iMembers = plan.findIndex((s) => s.op === 'members');
  assert.ok(iCreate >= 0 && iMembers >= 0);
  assert.ok(iCreate < iMembers, 'a member with no id yet cannot be listed');
});

test('planSave: an emptied package still writes its list', () => {
  const plan = planSave([[10, { isNew: false, params: {}, members: [] }]]);
  assert.equal(plan.filter((s) => s.op === 'members').length, 1,
    'an empty list is a decision; skipping it would leave the old members in place');
});

test('planSave: a non-bundle draft writes no member list at all', () => {
  const plan = planSave([[10, { isNew: false, params: {} }]]);
  assert.equal(plan.filter((s) => s.op === 'members').length, 0);
});

test('planSave: a draft with no params is ignored, not sent half-built', () => {
  assert.deepEqual(planSave([['x', null], ['y', {}]]), []);
});

test('resolveMembers: synthetic keys become the ids the create step produced', () => {
  const map = new Map([['new:1', 55]]);
  assert.deepEqual(
    resolveMembers([{ key: 'new:1', indent: 2 }, { key: 7, indent: 0 }], map),
    [{ id: 55, indent: 2 }, { id: 7, indent: 0 }]
  );
});

test('resolveMembers: an unresolved key is DROPPED, never sent as null', () => {
  // A row pointing at nothing would make the Worker reject the whole list, losing the members
  // that were perfectly fine.
  assert.deepEqual(resolveMembers([{ key: 'new:9', indent: 0 }, { key: 3, indent: 1 }], new Map()),
    [{ id: 3, indent: 1 }]);
});

// ── the "só existe aqui" status (task #31) ──────────────────────────────────
test('the selected member says in how many packages it lives, and never guesses', () => {
  const src = read('../content/item-members.js');
  const pt = read('../i18n/pt.js');
  const en = read('../i18n/en.js');
  // The number comes FROM the server row. A member picked from the pool or created here has no
  // count, and the two states that must not exist are: a fresh pick reading "só existe aqui"
  // (stale zero dressed as a fact), and a draft reading anything at all.
  assert.ok(/parents:\s*c\.parents != null \? Number\(c\.parents\) : null/.test(src),
    '_norm keeps parents, with null (not 0) for "the server did not say"');
  assert.ok(/c\.isNew \|\| c\.parents == null\) return ''/.test(src),
    'no status for drafts or uncounted rows');
  // One package is the warning; several is said too, so the absence of the warning is visible.
  assert.ok(/editor\.members_only_here/.test(src));
  assert.ok(/editor\.members_in_packages/.test(src));
  assert.ok(/replace\('\{n\}'/.test(src), 'the count is interpolated, house {n} convention');
  for (const dict of [pt, en]) {
    assert.ok(dict.indexOf("'editor.members_only_here'") !== -1);
    assert.ok(dict.indexOf("'editor.members_in_packages'") !== -1);
  }
});

// ── the caller guard ─────────────────────────────────────────────────────────
test('the member list moves the indent through the ENGINE, never by assignment', () => {
  const src = read('../content/item-members.js');
  assert.ok(/shiftIndent\(chosen, i, \+1, MAX_INDENT\)/.test(src), 'indent-in goes through shiftIndent');
  assert.ok(/shiftIndent\(chosen, i, -1, MAX_INDENT\)/.test(src), 'indent-out goes through shiftIndent');
  assert.ok(!/chosen\[i\]\.indent\s*=/.test(src),
    'assigning the indent by hand skips the block rule Élder asked for');
});

test('the editor mounts the stack, and the level below it knows nothing about it', () => {
  const src = read('../content/item-form.js');
  assert.ok(/function _mountLevel\(/.test(src), 'one level is its own function');
  assert.ok(/export function mount\(/.test(src));
  // The level must not reach for the stack's helpers directly: that is what would let it start
  // deciding where it is, which is the coupling the split exists to prevent.
  // Comments are stripped first: a comment that NAMES the stack's helpers is documentation, and
  // failing on it would push the next person to explain less rather than to couple less.
  const level = src.slice(src.indexOf('function _mountLevel('), src.indexOf('// ── persistence'))
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  assert.ok(!/createNav\(/.test(level), 'a level never creates a stack');
  assert.ok(!/planSave\(/.test(level), 'a level never plans the save');
});
