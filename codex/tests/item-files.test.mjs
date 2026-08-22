// §34: an item carries AT MOST ONE file; more files are ITEMS.
//
// The 2026-08-17 build let one item hold an anonymous list of files, and Élder killed it the
// next morning: *"each file added is an item... they are items that should show in the hierarchy
// and have names and descriptions and so on. otherwise i won't be able to view an image without
// downloading it"*. The settled model: the first file attaches to the item's single slot; every
// further file becomes a CHILD ITEM through the same members machinery packages use, with its
// own inferred, overridable type.
//
// The migration-free reading still matters and is pinned first: every item in the archive has
// the old scalar `attachment_url`, and staging briefly wrote an `attachments` array. Both read.
// Writing only ever emits one entry, mirrored into the scalar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { itemFiles, withItemFiles, fileNameFromUrl, isImageFile, inferChildType, filesPanelHtml } from '../js/item-files.js';
import { getItemActions, packageOf } from '../trilha/js/actions.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const formSrc = read('../content/item-form.js');
const aiBoxSrc = read('../content/editor/ai-box.js');

// ── reading, tolerant of every historical shape ─────────────────────────────

test('the legacy single attachment reads as a list of one', () => {
  assert.deepEqual(itemFiles({ attachment_url: '/r2/classtrail/items/9/guia.pdf' }),
    [{ url: '/r2/classtrail/items/9/guia.pdf', name: 'guia.pdf' }]);
});

test('meta_json as the JSON STRING the Worker returns is read too', () => {
  assert.equal(itemFiles('{"attachment_url":"/r2/a/b/x.zip"}')[0].name, 'x.zip');
});

test('the short-lived attachments array still reads, first entry first', () => {
  // Staging wrote a few of these on 17/08. They stay readable forever; they are just never
  // written again.
  const files = itemFiles({
    attachments: [{ url: '/r2/a.zip', name: 'a.zip' }, { url: '/r2/b.md', name: 'b.md' }],
    attachment_url: '/r2/a.zip',
  });
  assert.equal(files[0].name, 'a.zip');
});

test('a name is recovered from the key when none was stored, percent-decoded', () => {
  assert.equal(fileNameFromUrl('/r2/classtrail/items/9/Guia%20de%20uso.pdf'), 'Guia de uso.pdf');
  assert.equal(fileNameFromUrl('/r2/x/y.zip?v=2'), 'y.zip');
});

// ── writing: one slot, mirrored into the legacy field ───────────────────────

test('writing one file keeps the legacy field pointing at it', () => {
  const meta = withItemFiles({ verbatim: true }, [{ url: '/r2/a.zip', name: 'a.zip' }]);
  assert.equal(meta.attachment_url, '/r2/a.zip');
  assert.equal(meta.verbatim, true, 'it touches nothing else');
});

test('removing the file clears every shape, leaving no stale url behind', () => {
  const meta = withItemFiles({ attachment_url: '/r2/a.zip', attachments: [{ url: '/r2/a.zip', name: 'a.zip' }] }, []);
  assert.equal(meta.attachment_url, undefined);
  assert.equal(meta.attachments, undefined);
});

test('the editor only ever writes the single slot', () => {
  assert.match(formSrc, /withItemFiles\(mergeItemMeta\(initialMeta, typeData\.meta_json, type\), _ownFile \? \[_ownFile\] : \[\]\)/);
});

// ── files that are items ────────────────────────────────────────────────────

test('a second file becomes a CHILD ITEM, never a second attachment', () => {
  assert.match(formSrc, /function _addChildFile\(file\)/);
  assert.match(formSrc, /inferChildType\(types, file\.name\)/);
  assert.match(formSrc, /api\.createItem\(\{ type: fc\.type, title/);
  assert.match(formSrc, /api\.setItemMembers\(\{\s*parent_item_id: savedId/);
});

test('several files at once skip the question: each is a child', () => {
  assert.match(formSrc, /if \(list\.length > 1\) \{ list\.forEach\(_addChildFile\); return; \}/);
  assert.match(aiBoxSrc, /multiple: true/);
});

test('one file into an occupied slot ASKS: replace, or add as an item', () => {
  // Replace is destructive and child creation is surprising; both intents are real, so this is
  // one of the few prompts that earns its place.
  assert.match(formSrc, /editor\.file_slot_taken/);
  assert.match(formSrc, /data-act="replace"/);
  assert.match(formSrc, /data-act="child"/);
});

test('removing a child row leaves the LIST, never the library', () => {
  assert.match(formSrc, /_childRows = _childRows\.filter\(\(c\) => c\.id !== id\)/);
  assert.ok(!/deleteItem[\s\S]{0,80}_childRows/.test(formSrc), 'no delete call anywhere near the row removal');
});

// ── type inference: a prefill against the real registry ─────────────────────

test('an image prefers a foto-like type that actually exists', () => {
  const types = [{ slug: 'prompt' }, { slug: 'foto' }, { slug: 'material' }];
  assert.equal(inferChildType(types, 'captura.png'), 'foto');
});

test('with no foto type it falls to material, never to an invented slug', () => {
  const types = [{ slug: 'prompt' }, { slug: 'material' }];
  assert.equal(inferChildType(types, 'captura.png'), 'material');
});

test('a document prefers documento, a zip prefers skill', () => {
  const types = [{ slug: 'documento' }, { slug: 'skill' }, { slug: 'prompt' }];
  assert.equal(inferChildType(types, 'guia.pdf'), 'documento');
  assert.equal(inferChildType(types, 'ferramenta.zip'), 'skill');
});

test('a bundle type is never inferred, and the last resort is the first item type', () => {
  const types = [{ slug: 'pasta', family: 'bundle' }, { slug: 'prompt' }];
  assert.equal(inferChildType(types, 'x.bin'), 'prompt');
});

// ── the panel ───────────────────────────────────────────────────────────────

test('a pending child row edits its future item in place', () => {
  const html = filesPanelHtml(null, null, [], [{ name: 'a.png', title: 'Captura', type: 'foto' }],
    [{ slug: 'foto', label: 'Foto' }, { slug: 'prompt', label: 'Prompt' }], { childPending: 'vira item' });
  assert.match(html, /data-pchild-title="0"/, 'editable title');
  assert.match(html, /data-pchild-type="0"/, 'type select');
  assert.match(html, /<option value="foto" selected>/, 'inferred type preselected');
  assert.ok(!/pasta/.test(html), 'bundle types never offered');
});

test('titles and names are escaped, because they come from the file system', () => {
  const html = filesPanelHtml({ url: '/r2/x', name: '<img src=x onerror=1>' }, null, [], [], [], {});
  assert.ok(!/<img/.test(html));
});

// ── what the student sees ───────────────────────────────────────────────────

test('one file, one button, worded exactly as before', () => {
  const acts = getItemActions({ id: 1, type: 'skill', meta_json: { attachment_url: '/r2/x/skill.zip' } });
  assert.equal(acts.length, 1);
  assert.equal(acts[0].label, 'Baixar');
});

test('a parent keeps its OWN file beside "Baixar tudo"', () => {
  // A Skill's zip IS the skill; hiding it behind the bundle zip would make the essential
  // download the awkward one.
  const acts = getItemActions({
    id: 1, type: 'skill',
    meta_json: { attachment_url: '/r2/x/skill.zip' },
    children: [{ id: 2, type: 'documento', title: 'Tutorial' }],
  });
  assert.deepEqual(acts.map((a) => a.kind), ['open', 'download-project']);
  assert.equal(acts[0].shortLabel, 'skill.zip');
});

test('the parent file rides at the zip root', () => {
  const pack = packageOf({
    id: 1, type: 'skill', title: 'Minha skill',
    meta_json: { attachment_url: '/r2/x/skill.zip' },
    children: [{ id: 2, type: 'documento', title: 'Tutorial' }],
  });
  assert.deepEqual(pack.ownFiles, ['/r2/x/skill.zip']);
});

test('an image is looked at, not downloaded', () => {
  assert.equal(isImageFile('/r2/x/foto.png'), true);
  assert.equal(isImageFile('skill.zip'), false);
  const acts = getItemActions({ id: 1, type: 'material', meta_json: { attachment_url: '/r2/x/foto.png' } });
  assert.equal(acts[0].label, 'Ver imagem');
});

test('the type says nothing about the file: a Skill with a file acts like any other', () => {
  const skill = getItemActions({ id: 1, type: 'skill', meta_json: { attachment_url: '/r2/s.zip' } });
  const doc = getItemActions({ id: 2, type: 'documento', meta_json: { attachment_url: '/r2/s.zip' } });
  assert.deepEqual(skill.map((a) => a.kind), doc.map((a) => a.kind));
});
