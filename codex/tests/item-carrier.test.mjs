// §25.5 + §25.4: what an item CARRIES survives a save, and the file box asks one question.
//
// The defect this file exists to prevent is silent and destructive. `collectTypeData` rebuilds
// meta_json from the form on every save. That is right for what the form draws and catastrophic
// for what it does not: an item's attachment lives in the same meta_json and no block draws it,
// so opening one of the three items in the archive that carry a file and pressing Save, without
// touching the file, deleted its download. Switching to a type the editor does not know (a fresh
// `skill`) wiped meta_json outright.
//
// The other half is the box itself. There used to be two file pickers that looked alike and did
// opposite things, and the one Élder used on 17/08 read his .zip into the TEXT instead of
// attaching it, then rewrote the item's type to `arquivo`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mergeItemMeta, typeMetaKeys, setBundleSlugs } from '../content/editor/type-block.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const typeBlockSrc = read('../content/editor/type-block.js');
const aiBoxSrc = read('../content/editor/ai-box.js');
const formSrc = read('../content/item-form.js');

// ── mergeItemMeta: the carrier survives ─────────────────────────────────────

test('the attachment survives a save that never mentioned it', () => {
  const stored = { attachment_url: '/r2/classtrail/items/9/skill.zip' };
  // A `skill` is a type the editor draws no block for, so the form collects nothing at all.
  assert.deepEqual(mergeItemMeta(stored, null, 'skill'), stored);
});

test('the exact 17/08 shape: an arquivo item re-saved without re-picking the file', () => {
  const stored = { attachment_url: '/r2/x.pdf' };
  const merged = mergeItemMeta(stored, {}, 'arquivo');
  assert.equal(merged.attachment_url, '/r2/x.pdf');
});

test('a type block still OWNS its own fields, so they can be cleared', () => {
  const stored = { authors: 'Ada', year: '1843', attachment_url: '/r2/x.pdf' };
  const merged = mergeItemMeta(stored, { authors: null, year: null, abstract: null }, 'paper');
  assert.equal(merged.authors, null, 'the form cleared it, so it clears');
  assert.equal(merged.year, null);
  assert.equal(merged.attachment_url, '/r2/x.pdf', 'not a paper field: untouched');
});

test('a bundle owns its zip flag and nothing else', () => {
  setBundleSlugs([{ slug: 'pasta', family: 'bundle' }, { slug: 'prompt', family: 'item' }]);
  assert.deepEqual(typeMetaKeys('pasta'), ['zip_intro']);
  assert.deepEqual(typeMetaKeys('prompt'), []);
  const merged = mergeItemMeta({ zip_intro: false, attachment_url: '/r2/a.zip' }, {}, 'pasta');
  assert.equal(merged.zip_intro, undefined, 'the switch is back on: the form said so');
  assert.equal(merged.attachment_url, '/r2/a.zip');
});

test('changing type keeps the old fields dormant instead of deleting them', () => {
  // Élder re-typed items to `arquivo` for his class and means to type them back. Losing the
  // paper fields on the way through would make that round trip destructive.
  const merged = mergeItemMeta({ authors: 'Ada', attachment_url: '/r2/x.pdf' }, null, 'arquivo');
  assert.equal(merged.authors, 'Ada');
  assert.equal(merged.attachment_url, '/r2/x.pdf');
});

test('empty stays null, because absence is meaningful here', () => {
  // An absent `verbatim` means "follow the type" and an absent `zip_intro` means "yes". Writing
  // {} where nothing was written before would give every item an opinion it never expressed.
  assert.equal(mergeItemMeta(null, null, 'prompt'), null);
  assert.equal(mergeItemMeta({}, {}, 'prompt'), null);
  assert.equal(mergeItemMeta(null, {}, 'skill'), null);
});

test('a stored string is not trusted as an object', () => {
  assert.equal(mergeItemMeta('{"attachment_url":"/r2/x"}', null, 'skill'), null);
});

// ── the editor wiring ───────────────────────────────────────────────────────

test('item-form saves through the merge, never through the raw collect', () => {
  assert.match(formSrc, /mergeItemMeta\(initialMeta, typeData\.meta_json, type\)/);
});

test('a file picked without running the AI still reaches the save', () => {
  // pendingFile() was exposed on the content box and never called: the file only travelled
  // through onResult, which fires only after an AI pass. Pick, Save, nothing uploaded.
  assert.match(formSrc, /pendingFile: _pendingAssetFile \|\| \(_aiBox \? _aiBox\.pendingFile\(\) : null\)/);
  assert.match(formSrc, /pendingField: _pendingAssetField \|\| 'attachment_url'/);
});

test('there is ONE file selector: the arquivo block no longer draws its own', () => {
  assert.ok(!/ie-doc-local/.test(typeBlockSrc), 'the second picker is gone');
  assert.ok(!/ie-doc-drive/.test(typeBlockSrc));
  assert.ok(/aib-file/.test(aiBoxSrc), 'the content box keeps the one that stays');
});

test('attaching a file never rewrites the type', () => {
  assert.ok(!/parsed\.type\s*=\s*'arquivo'/.test(aiBoxSrc),
    "a .zip on a Skill must leave it a Skill: the type is what the item IS");
});

test('the extract question is asked only when there is text to extract', () => {
  assert.match(aiBoxSrc, /pickedExtractable = hasExtractableText\(f\)/);
  assert.match(aiBoxSrc, /modeRow\.style\.display = pickedExtractable \? '' : 'none'/);
  // and with the row hidden the answer is settled, not left at the checked default
  assert.match(aiBoxSrc, /if \(pickedFile && !pickedExtractable\) return 'download'/);
});
