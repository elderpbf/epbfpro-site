// Codex-native item editor + creator (item-form.js / item-creator.js).
// Pure type-dropdown logic is unit-tested; the rest is asserted by contract
// (source + facade + i18n), zero-dependency, no jsdom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';
import * as itemForm from '../content/item-form.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const formSrc = read('../content/item-form.js');
const creatorSrc = read('../content/item-creator.js');
const itemsSrc = read('../content/items.js');
const apiSrc = read('../js/codex-api.js');
const editorModules = [['item-form', formSrc], ['item-creator', creatorSrc]];

// ── module contract ─────────────────────────────────────────────────────────
test('editor modules reach the backend only through the facade', () => {
  for (const [name, src] of editorModules) {
    assert.ok(!/\bcallWorker\s*\(/.test(src), `${name} makes no direct callWorker() call`);
    assert.match(src, /from\s+['"]\.\.\/js\/codex-api\.js['"]/, `${name} imports the facade`);
    assert.match(src, /from\s+['"]\.\.\/js\/i18n\.js['"]/, `${name} imports t()`);
    assert.match(src, /export\s+function\s+mount\s*\(/, `${name} exports mount`);
  }
});

test('editor modules author cdx- classes, no ct-/cv-, no inline onclick, no em dashes', () => {
  for (const [name, src] of editorModules) {
    assert.ok(/cdx-/.test(src), `${name} authors cdx- classes`);
    assert.ok(!/class="ct-/.test(src), `${name} authors no ct- classes`);
    assert.ok(!/class="cv-/.test(src), `${name} authors no cv- classes`);
    assert.ok(!/onclick\s*=/.test(src), `${name} no inline onclick`);
    assert.ok(!/—/.test(src), `${name} no em dashes`);
  }
});

test('items.js uses the native editor modules, not the window globals', () => {
  assert.match(itemsSrc, /from\s+['"]\.\/item-form\.js['"]/, 'imports item-form.js');
  assert.match(itemsSrc, /from\s+['"]\.\/item-creator\.js['"]/, 'imports item-creator.js');
  assert.ok(!/window\.CTItemForm/.test(itemsSrc), 'no window.CTItemForm reference');
  assert.ok(!/window\.CTItemCreator/.test(itemsSrc), 'no window.CTItemCreator reference');
});

test('facade exposes the editor backend methods (frozen action strings)', () => {
  assert.match(apiSrc, /uploadAsset:\s*\(p\)\s*=>\s*call\('ct_upload_asset'/, 'uploadAsset -> ct_upload_asset');
  assert.match(apiSrc, /ingestGdoc:\s*\(p\)\s*=>\s*call\('ct_ingest_gdoc'/, 'ingestGdoc -> ct_ingest_gdoc');
  assert.match(apiSrc, /chat:\s*\(p\)\s*=>\s*call\('ai_chat'/, 'ai.chat -> ai_chat');
});

// ── arquivo type: any downloadable file, local + Drive via the shared module ──
test('item-form registers the arquivo type wired to the shared file-source', () => {
  assert.match(formSrc, /from\s+['"]\.\.\/js\/file-source\.js['"]/, 'imports the shared file-source module');
  assert.match(formSrc, /createDriveSource|pickLocalFile/, 'uses the shared local + Drive sources');
  assert.match(formSrc, /typeSlug === 'arquivo'/, 'has the arquivo editor branch');
  assert.match(formSrc, /onFileSelected\(f, 'attachment_url'\)/, 'the picked file flows into attachment_url (the trail renders it as a download)');
  assert.match(formSrc, /view: 'any'/, 'the Drive picker browses any file, not just images');
});
test('arquivo i18n keys exist in both dictionaries', () => {
  for (const k of ['editor.arquivo_file_label', 'editor.file_from_computer', 'editor.file_from_drive', 'editor.file_selected']) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});
test('item-creator offers a local/Drive file import that opens an arquivo item', () => {
  assert.match(creatorSrc, /from\s+['"]\.\.\/js\/file-source\.js['"]/, 'creator imports the shared file-source module');
  assert.match(creatorSrc, /cf-file-local/, 'has a "from computer" import button');
  assert.match(creatorSrc, /cf-file-drive/, 'has a "from Drive" import button');
  assert.match(creatorSrc, /onFile\(\{ file/, 'hands the picked file to onFile');
  assert.match(itemsSrc, /onFile:.*type: 'arquivo'/, 'items wires the creator file import to an arquivo item + pending file');
  assert.match(formSrc, /opts\.pendingFile/, 'the form seeds the pending upload from the creator file');
  assert.ok('creator.file_prompt' in pt && 'creator.file_prompt' in en, 'the file prompt exists in both dictionaries');
});

// ── i18n parity for the new strings ─────────────────────────────────────────
test('editor/creator i18n keys exist in both dictionaries', () => {
  const sample = [
    'editor.title_label', 'editor.type_label', 'editor.refazer', 'editor.ai_no_content',
    'editor.uploading', 'creator.raw_label', 'creator.ai_format', 'creator.gdoc_hint',
    'creator.ai_truncated_confirm'
  ];
  for (const k of sample) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});
