// track-61 — "only inside a package", the screen side (Élder 2026-08-14).
//
// The editor used to CLAIM exclusivity that nothing enforced: "Só existe neste pacote. Remover
// daqui deixa o item solto no acervo", over a count that never looked at releases. What is pinned
// here is that the sentence stopped lying, that the flag is set deliberately, and that the two
// screens agree about who may be released: the archive still lists the item, Liberações does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';
import { buildBundleSystemPrompt, buildBundleUserMessage } from '../js/ai-spec.js';
import { filterLibraryItems } from '../js/item-list.js';

// CRLF is normalized on read: a checkout on Windows stores \r\n, and a source assertion written
// with \n silently fails there while passing in CI. The deploy gate caught exactly this in the
// slides tests (track-35), so every reader in this repo does it.
const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const members = read('../content/item-members.js');
const items = read('../content/items.js');
const releases = read('../content/releases.js');
const facade = read('../js/codex-api.js');
const form = read('../content/item-form.js');

// ── the sentence that was wrong ───────────────────────────────────────────────────────

test('the line no longer promises that removal changes where the item lives', () => {
  // It never did: the item is in the archive from birth, joining a package did not take it out.
  assert.ok(!/solto no acervo/.test(pt['editor.members_only_here']));
  assert.ok(!/loose in the archive/.test(en['editor.members_only_here']));
  assert.match(pt['editor.members_only_here'], /^Está só neste pacote\.$/);
});

test('the line now says whether the item can ALSO go out alone, which is the real question', () => {
  assert.ok(pt['editor.members_also_alone'].length > 0);
  assert.ok(pt['editor.members_bundle_only_on'].length > 0);
  assert.match(members, /members_also_alone/);
  assert.match(members, /members_bundle_only_on/);
});

test('a member the server did not count says nothing about packages, but still offers the switch', () => {
  // parents == null is "I do not know", and dressing it as zero is what the old code avoided.
  assert.match(members, /if \(c\.isNew \|\| c\.parents == null\) return box;/);
});

// ── the switch ────────────────────────────────────────────────────────────────────────

test('the flag is set through the facade, never by a direct worker call', () => {
  assert.match(facade, /setItemBundleOnly:\s*\(p\)\s*=>\s*call\('ct_set_item_bundle_only'/);
  assert.match(members, /api\.setItemBundleOnly\(/);
  assert.ok(!/\bcallWorker\s*\(/.test(members));
});

test('an unsaved member cannot be marked: the guard is a question only the server can answer', () => {
  assert.match(members, /const off = c\.isNew \|\| c\.id == null;/);
  assert.match(members, /disabled/);
});

test('turning it on over a live release asks first, and only the dialog may force', () => {
  assert.match(members, /error === 'item_released' && !force/);
  assert.match(members, /_confirmExclusive/);
  assert.match(members, /_setExclusive\(row, true, true\)/);
  // Clicking beside the box must not answer a question that deletes releases.
  assert.match(members, /disableBackdropClose:\s*true/);
});

test('the dialog names the turmas and states what is lost', () => {
  assert.match(members, /cdx-mem-excl-list/);
  assert.match(pt['editor.excl_consequence'], /REMOVE/);
  assert.match(pt['editor.excl_consequence'], /perde/);
  assert.match(en['editor.excl_consequence'], /REMOVES/);
});

test('cancelling repaints instead of leaving the checkbox showing a state that never landed', () => {
  assert.match(members, /closeModal\(bd\); paintList\(\);/);
});

// ── the two lists ─────────────────────────────────────────────────────────────────────

test('the archive still lists it, with a badge', () => {
  // Élder: "remain on the list as normal? maybe a tag, different colour".
  assert.match(items, /_onlyBadgeHtml/);
  assert.match(items, /content\.bundle_only_badge/);
  // One builder, called by the row AND the preview header (the third match is the definition).
  assert.equal((items.match(/= _onlyBadgeHtml\(item\)/g) || []).length, 2);
  assert.ok(!/filter\(.*bundle_only/.test(items), 'the archive hides nothing');
});

test('Liberações does not offer it', () => {
  assert.match(releases, /\.filter\(\(i\) => !i\.bundle_only\)/);
});

test('the badge is the shared chip skin, not a private colour', () => {
  const css = read('../content/content.css');
  assert.match(css, /\.cdx-set-badge,\n\.cdx-only-badge \{/);
  assert.ok(!/--danger/.test(css.split('.cdx-only-badge {')[1].split('}')[0]),
    'a state the admin chose is not an error');
});

// ── naming a package with AI ──────────────────────────────────────────────────────────

test('the package prompt asks for the three fields and refuses to restate the members', () => {
  const sys = buildBundleSystemPrompt('Pasta');
  assert.match(sys, /"title"/);
  assert.match(sys, /"summary"/);
  assert.match(sys, /"body_md"/);
  assert.ok(!/"type"/.test(sys), 'the box was already chosen on screen');
  assert.match(sys, /NAO liste os itens/);
  assert.match(sys, /Pasta/);
});

test('the user message carries the members in order, with their types', () => {
  const msg = buildBundleUserMessage(
    [{ title: 'Modelo de peça', type_label: 'Arquivo' }, { title: 'Checklist' }],
    {}
  );
  assert.match(msg, /1\. Modelo de peça \[Arquivo\]/);
  assert.match(msg, /2\. Checklist/);
});

test('what is already written travels as a hint, and only when it exists', () => {
  assert.ok(!/pista da intencao/.test(buildBundleUserMessage([{ title: 'x' }], { title: '', summary: '  ' })));
  assert.match(buildBundleUserMessage([{ title: 'x' }], { title: 'Kit' }), /title: Kit/);
});

test('an empty package refuses to be named instead of asking the model about nothing', () => {
  assert.match(form, /name_from_members_empty/);
  assert.match(form, /if \(!rows\.length\)/);
});

test('the naming button belongs to packages only', () => {
  assert.match(form, /nameAi\.hidden = !bundle/);
});

test('every new key is in BOTH dictionaries', () => {
  const keys = Object.keys(pt).filter((k) => /^(editor\.(excl_|members_bundle_only|members_also_alone|name_from_members)|content\.bundle_only)/.test(k));
  assert.ok(keys.length >= 15);
  for (const k of keys) assert.ok(k in en, `${k} missing from en`);
});

// ── the picker shows the archive, not the database ────────────────────────────────────
// Élder 2026-08-16: the package picker listed 146 rows while the Conteúdo tab shows 54, and the
// same handout section appeared three times. The Items grid had been filtering all along
// (set members, tarefa, conteudo, drive_file) and the picker had not.

test('the picker offers exactly what the archive screen shows', () => {
  const list = read('../js/item-list.js');
  assert.match(list, /export function filterLibraryItems/);
  assert.match(members, /filterLibraryItems\(pool\)/);
});

test('the rule is one function, not two copies that drift', () => {
  const itemsSrc = read('../content/items.js');
  assert.match(itemsSrc, /export \{ filterLibraryItems \};/);
  assert.ok(!/export function filterLibraryItems/.test(itemsSrc), 'items.js re-exports, never reimplements');
  assert.match(itemsSrc, /from '\.\.\/js\/item-list\.js'/);
});

test('the filter still hides exactly what it hid before the move', () => {
  const input = [
    { id: 1, type: 'prompt' },
    { id: 2, type: 'conteudo' },
    { id: 3, type: 'tarefa' },
    { id: 4, type: 'drive_file' },
    { id: 5, type: 'prompt', set_id: 7 },
    { id: 6, type: 'pasta' },
  ];
  assert.deepEqual(filterLibraryItems(input).map((i) => i.id), [1, 6]);
});
