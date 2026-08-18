// §28: the item is an ENTITY and it carries files, plural.
//
// Élder, 2026-08-17: *"ele só permite colocar 1 arquivo por vez... o item não é um arquivo, ele é
// uma ENTIDADE... eu tenho que poder adicionar arquivos, substituir arquivo, apagar arquivo,
// adicionar um novo"*. Same law as §25.3, applied to the count: allowing exactly one file also
// confuses the entity with its stamp.
//
// The property that matters most here is that NOTHING WAS MIGRATED. Every item in the archive
// still has the old scalar `attachment_url`, and a page cached in a student's browser still
// reads it. Reading folds the scalar into a list of one; writing mirrors the first file back
// into it. Both directions are pinned below, because a migration-free change that stops being
// readable both ways is a migration nobody ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { itemFiles, withItemFiles, fileNameFromUrl, isImageFile, fileListHtml } from '../js/item-files.js';
import { getItemActions } from '../trilha/js/actions.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const formSrc = read('../content/item-form.js');
const aiBoxSrc = read('../content/editor/ai-box.js');

// ── reading ─────────────────────────────────────────────────────────────────

test('the legacy single attachment reads as a list of one', () => {
  assert.deepEqual(itemFiles({ attachment_url: '/r2/classtrail/items/9/guia.pdf' }),
    [{ url: '/r2/classtrail/items/9/guia.pdf', name: 'guia.pdf' }]);
});

test('meta_json as the JSON STRING the Worker returns is read too', () => {
  assert.equal(itemFiles('{"attachment_url":"/r2/a/b/x.zip"}')[0].name, 'x.zip');
});

test('a list reads in order, and the scalar does not duplicate its own first entry', () => {
  const files = itemFiles({
    attachments: [{ url: '/r2/a.zip', name: 'a.zip' }, { url: '/r2/b.md', name: 'b.md' }],
    attachment_url: '/r2/a.zip',
  });
  assert.deepEqual(files.map((f) => f.name), ['a.zip', 'b.md']);
});

test('an item with no files at all has none', () => {
  assert.deepEqual(itemFiles(null), []);
  assert.deepEqual(itemFiles({}), []);
  assert.deepEqual(itemFiles({ attachment_url: '' }), []);
});

test('a name is recovered from the key when none was stored, percent-decoded', () => {
  assert.equal(fileNameFromUrl('/r2/classtrail/items/9/Guia%20de%20uso.pdf'), 'Guia de uso.pdf');
  assert.equal(fileNameFromUrl('/r2/x/y.zip?v=2'), 'y.zip');
});

// ── writing ─────────────────────────────────────────────────────────────────

test('writing keeps the old field pointing at the first file', () => {
  const meta = withItemFiles({ verbatim: true }, [{ url: '/r2/a.zip', name: 'a.zip' }, { url: '/r2/b.md', name: 'b.md' }]);
  assert.equal(meta.attachment_url, '/r2/a.zip', 'anything still reading the scalar keeps working');
  assert.equal(meta.attachments.length, 2);
  assert.equal(meta.verbatim, true, 'it touches nothing else');
});

test('removing the last file clears BOTH shapes, leaving no stale url behind', () => {
  const meta = withItemFiles({ attachment_url: '/r2/a.zip', attachments: [{ url: '/r2/a.zip', name: 'a.zip' }] }, []);
  assert.equal(meta.attachment_url, undefined);
  assert.equal(meta.attachments, undefined);
});

test('a round trip through write and read is the identity', () => {
  const files = [{ url: '/r2/a.zip', name: 'a.zip' }, { url: '/r2/b.md', name: 'b.md' }];
  assert.deepEqual(itemFiles(withItemFiles({}, files)), files);
});

// ── what the student sees ───────────────────────────────────────────────────

test('one file, one button, worded exactly as before', () => {
  const acts = getItemActions({ id: 1, type: 'skill', meta_json: { attachment_url: '/r2/x/skill.zip' } });
  assert.equal(acts.length, 1);
  assert.equal(acts[0].label, 'Baixar');
  assert.equal(acts[0].url, '/r2/x/skill.zip');
});

test('several files, several buttons, each saying WHICH file', () => {
  // "Baixar" three times tells the student nothing about what they are picking.
  const acts = getItemActions({ id: 1, type: 'skill', meta_json: {
    attachments: [{ url: '/r2/a.zip', name: 'skill.zip' }, { url: '/r2/b.md', name: 'leia-me.md' }],
  } });
  assert.deepEqual(acts.map((a) => a.label), ['Baixar skill.zip', 'Baixar leia-me.md']);
});

test('an image is looked at, not downloaded', () => {
  assert.equal(isImageFile('/r2/x/foto.png'), true);
  assert.equal(isImageFile('skill.zip'), false);
  const acts = getItemActions({ id: 1, type: 'material', meta_json: { attachment_url: '/r2/x/foto.png' } });
  assert.equal(acts[0].label, 'Ver imagem');
});

test('the type says nothing about the files: a Skill with a file behaves like any other', () => {
  const skill = getItemActions({ id: 1, type: 'skill', meta_json: { attachment_url: '/r2/s.zip' } });
  const doc = getItemActions({ id: 2, type: 'documento', meta_json: { attachment_url: '/r2/s.zip' } });
  assert.deepEqual(skill.map((a) => a.kind), doc.map((a) => a.kind));
});

// ── the editor's list ───────────────────────────────────────────────────────

test('the list paints stored files and the ones waiting for a save', () => {
  const html = fileListHtml(
    [{ url: '/r2/a.zip', name: 'a.zip' }],
    [{ name: 'novo.md' }],
    { remove: 'Remover', pending: 'ao salvar' }
  );
  assert.match(html, /data-file-del="0"/, 'a stored file can be removed');
  assert.match(html, /data-pending-del="0"/, 'so can one not uploaded yet');
  assert.match(html, /ao salvar/);
  assert.match(html, /href="\/r2\/a\.zip"/);
});

test('an empty item paints no list at all', () => {
  assert.equal(fileListHtml([], [], {}), '');
});

test('a file name is escaped, because it comes from the file system', () => {
  const html = fileListHtml([], [{ name: '<img src=x onerror=1>.zip' }], {});
  assert.ok(!/<img/.test(html));
});

test('the editor uploads a LIST and appends it to what survived the edit', () => {
  assert.match(formSrc, /for \(const file of \(draft\.pendingFiles \|\| \[\]\)\)/);
  assert.match(formSrc, /withItemFiles\(meta, itemFiles\(meta\)\.concat\(uploaded\)\)/);
  assert.match(formSrc, /withItemFiles\(mergeItemMeta\(initialMeta, typeData\.meta_json, type\), _files\)/);
});

test('picking a second file adds it instead of replacing the first', () => {
  // The box hands each file to the list and forgets it; holding on is what made it a single slot.
  assert.match(aiBoxSrc, /function handOff\(f\) \{/);
  assert.match(aiBoxSrc, /pickedFile = null;/);
  assert.match(formSrc, /onFileAttached: _addPendingFile/);
});
