// Pure Lessons model: vault classification, renderer dispatch, URL/embed helpers,
// text-resize rule, favorites. No DOM/CSS — all functions are pure (favorites
// takes an injected storage). These are the spine the Lessons renderers consume.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const m = await import('../lessons/lesson-model.js');

test('classifyVault partitions items into the sidebar buckets', () => {
  const b = m.classifyVault([
    { id: 1, type: 'drive_file' },
    { id: 2, type: 'tarefa' },
    { id: 3, type: 'prompt', set_id: 9 },
    { id: 4, type: 'llm' },
    { id: 5, type: 'popup_url' },
    { id: 6, type: 'prompt' },
  ]);
  assert.deepEqual(b.drive.map((i) => i.id), [1]);
  assert.deepEqual(b.tarefas.map((i) => i.id), [2]);
  assert.deepEqual(b.apostila.map((i) => i.id), [3]);
  assert.deepEqual(b.llm.map((i) => i.id), [4]);
  assert.deepEqual(b.external.map((i) => i.id), [5]);
  assert.deepEqual(b.items.map((i) => i.id), [6]);
});

test('sidebarSections keeps order and drops empty buckets except items', () => {
  const keys = m.sidebarSections(m.classifyVault([{ id: 1, type: 'llm' }, { id: 2, type: 'tarefa' }]))
    .map((s) => s.key);
  assert.deepEqual(keys, ['llm', 'items', 'tarefas']);
});

test('findItem resolves numeric vault, drive: synthetic, and lab: via findLab', () => {
  const vault = [{ id: 7, type: 'prompt' }, { id: 8, type: 'drive_file' }];
  const driveItems = [{ id: 'drive:abc', type: 'drive_file' }];
  assert.deepEqual(m.findItem(7, { vault }), { item: vault[0], source: 'vault' });
  assert.equal(m.findItem(8, { vault }).source, 'drive', 'drive_file row -> drive source');
  assert.equal(m.findItem('drive:abc', { vault, driveItems }).source, 'drive');
  assert.equal(m.findItem('lab:x', { vault, findLab: (k) => ({ id: k }) }).source, 'lab');
  assert.equal(m.findItem(999, { vault }), null, 'unknown -> null');
});

test('rendererStrategy maps types to the legacy registry strategies', () => {
  assert.equal(m.rendererStrategy('slide'), 'iframe');
  assert.equal(m.rendererStrategy('embed'), 'iframe');
  assert.equal(m.rendererStrategy('lab'), 'iframe');
  assert.equal(m.rendererStrategy('popup_url'), 'popup');
  assert.equal(m.rendererStrategy('drive_folder'), 'drive_folder');
  assert.equal(m.rendererStrategy('drive_file'), 'drive_file');
  assert.equal(m.rendererStrategy('video'), 'video');
  assert.equal(m.rendererStrategy('prompt'), 'fallback', 'unregistered -> markdown fallback');
});

test('supportsTextResize: iframe types off, body_md items on', () => {
  assert.equal(m.supportsTextResize({ type: 'slide', body_md: 'x' }), false);
  assert.equal(m.supportsTextResize({ type: 'video' }), false);
  assert.equal(m.supportsTextResize({ type: 'prompt', body_md: 'hello' }), true);
  assert.equal(m.supportsTextResize({ type: 'prompt', body_md: '  ' }), false, 'blank body not resizable');
  assert.equal(m.supportsTextResize(null), false);
});

test('drive id extraction + embed URLs', () => {
  assert.equal(m.extractDriveFolderId('https://drive.google.com/drive/folders/F123_-abc'), 'F123_-abc');
  assert.equal(m.extractDriveFileId('https://drive.google.com/file/d/FILE123/view'), 'FILE123');
  assert.equal(m.driveFolderEmbedUrl({ folder_id: 'F1' }), 'https://drive.google.com/embeddedfolderview?id=F1');
  assert.equal(m.driveFileEmbedUrl({ file_id: 'A1' }), 'https://drive.google.com/file/d/A1/preview');
  assert.equal(m.driveFileEmbedUrl({ url: 'https://drive.google.com/file/d/Z9/view' }), 'https://drive.google.com/file/d/Z9/preview');
  assert.equal(m.driveFolderEmbedUrl({}), '', 'no id -> empty');
});

test('toVideoEmbedUrl handles YouTube + TikTok, else empty', () => {
  assert.equal(m.toVideoEmbedUrl('https://www.youtube.com/watch?v=abcdefghijk'), 'https://www.youtube.com/embed/abcdefghijk');
  assert.equal(m.toVideoEmbedUrl('https://youtu.be/abcdefghijk'), 'https://www.youtube.com/embed/abcdefghijk');
  assert.equal(m.toVideoEmbedUrl('https://www.tiktok.com/@user/video/12345'), 'https://www.tiktok.com/embed/v2/12345');
  assert.equal(m.toVideoEmbedUrl('https://example.com/x'), '');
});

test('driveItemCanCopyText: Google Docs / text only', () => {
  assert.equal(m.driveItemCanCopyText('application/vnd.google-apps.document'), true);
  assert.equal(m.driveItemCanCopyText('text/plain'), true);
  assert.equal(m.driveItemCanCopyText('application/pdf', 'a.pdf'), false);
  assert.equal(m.driveItemCanCopyText('application/octet-stream', 'notes.md'), true, 'by extension');
});

test('popupUrlFor: slide/popup_url use meta.url, drive_file falls back to file_id', () => {
  assert.equal(m.popupUrlFor({ type: 'slide', meta_json: { url: 'https://x/s' } }), 'https://x/s');
  assert.equal(m.popupUrlFor({ type: 'popup_url', meta_json: { url: 'https://x/p' } }), 'https://x/p');
  assert.equal(m.popupUrlFor({ type: 'drive_file', meta_json: { url: 'https://x/d' } }), 'https://x/d');
  assert.equal(m.popupUrlFor({ type: 'drive_file', meta_json: { file_id: 'FID' } }),
    'https://drive.google.com/file/d/FID/view', 'drive_file builds /view from file_id');
  assert.equal(m.popupUrlFor({ type: 'slide', meta_json: {} }), '', 'no url -> empty');
  assert.equal(m.popupUrlFor({ type: 'prompt', meta_json: { url: 'x' } }), '', 'non-popup type -> empty');
  assert.equal(m.popupUrlFor(null), '');
});

test('crumbActions: popup for slide/drive_file/popup_url, copy for body_md, none for inert types', () => {
  assert.deepEqual(m.crumbActions({ type: 'slide', meta_json: { url: 'u' } }), [{ id: 'popup', url: 'u' }]);
  assert.deepEqual(m.crumbActions({ type: 'popup_url', meta_json: { url: 'u' } }), [{ id: 'popup', url: 'u' }]);
  assert.deepEqual(m.crumbActions({ type: 'slide', meta_json: {} }), [], 'popup type without url -> none');
  assert.deepEqual(m.crumbActions({ type: 'llm', body_md: 'x' }), [], 'llm registered with no actions');
  assert.deepEqual(m.crumbActions({ type: 'embed' }), []);
  assert.deepEqual(m.crumbActions({ type: 'video' }), []);
  assert.deepEqual(m.crumbActions({ type: 'drive_folder' }), []);
  assert.deepEqual(m.crumbActions({ type: 'prompt', body_md: 'hello' }), [{ id: 'copy' }], 'body_md -> copy');
  assert.deepEqual(m.crumbActions({ type: 'prompt', body_md: '   ' }), [], 'blank body -> none');
  assert.deepEqual(m.crumbActions(null), []);
});

test('makeTextScale clamps, defaults to 1, and persists via injected storage', () => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const ts = m.makeTextScale(storage);
  assert.equal(ts.get(), 1, 'default 1 when unset');
  assert.equal(ts.set(1.2), 1.2, 'set returns clamped value');
  assert.equal(ts.get(), 1.2, 'persisted');
  assert.equal(ts.set(9), ts.MAX, 'clamps above max');
  assert.equal(ts.set(0.1), ts.MIN, 'clamps below min');
  assert.equal(ts.bump(1, ts.STEP), 1.1, 'bump up by step');
  assert.equal(ts.bump(ts.MIN, -ts.STEP), ts.MIN, 'bump cannot go below min');
});

test('makeFavorites toggles + persists via injected storage', () => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const fav = m.makeFavorites(storage);
  assert.equal(fav.has(7), false);
  assert.equal(fav.toggle(7), true, 'toggle on returns true');
  assert.equal(fav.has(7), true);
  assert.equal(fav.has('7'), true, 'id coerced to string');
  assert.deepEqual(fav.all(), ['7']);
  assert.equal(fav.toggle(7), false, 'toggle off returns false');
  assert.equal(fav.has(7), false);
});
