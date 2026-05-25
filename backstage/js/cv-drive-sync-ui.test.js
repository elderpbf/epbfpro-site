'use strict';

// Acceptance tests for cv-drive-sync-ui.js (CVDriveSyncUI window global).
// Bundle O. The orchestrator paints the Conteúdo · Drive sub-tab with one
// Liberações-style card per configured Drive root folder. Each card expands
// to reveal its files (sub-grouped by subfolder). Clicking a file invokes
// CVDriveViewer.openModal.
// Derived from SPEC only. Does NOT read module source.
// Run: node backstage/js/cv-drive-sync-ui.test.js

const assert = require('node:assert/strict');
const path = require('node:path');
const dom = require('./__test-dom.cjs');

const MODULE_PATH = path.join(__dirname, 'cv-drive-sync-ui.js');

function makeCallWorker(responses) {
  const calls = [];
  const fn = async function (params) {
    calls.push(params);
    const r = responses[params.action];
    if (typeof r === 'function') return r(params);
    return r || { ok: true };
  };
  fn.calls = calls;
  return fn;
}

function makeBSGoogle(opts) {
  const o = opts || {};
  return {
    isAuthed: function () { return !!o.authed; },
    getEmail: function () { return o.email || ''; },
    requestToken: function () { return Promise.resolve(); },
    drive: {
      listFolder: function (folderId) {
        const map = o.folderContents || {};
        return Promise.resolve(map[folderId] || []);
      },
    },
  };
}

function makeDeps(state) {
  const s = state || {};
  return {
    CVDriveFoldersAPI: {
      list:   () => Promise.resolve(s.folders || []),
      create: (p) => {
        const next = Object.assign({ id: (s.folders ? s.folders.length + 1 : 1) }, p);
        (s.folders = s.folders || []).push(next);
        return Promise.resolve(next);
      },
      update: (id, patch) => {
        const f = (s.folders || []).find(x => x.id === id);
        if (f) Object.assign(f, patch);
        return Promise.resolve(f || null);
      },
      remove: (id) => {
        s.folders = (s.folders || []).filter(x => x.id !== id);
        return Promise.resolve({ ok: true });
      },
    },
    CVDriveFoldersUI: {
      mountFoldersList: function () { return { setFolders: function () {}, destroy: function () {} }; },
      mountFolderEditor: function (host, opts) {
        host._mounted = 'editor';
        host._opts = opts;
        host.innerHTML = '<div class="mock-folder-editor"></div>';
        return { destroy: function () { host.innerHTML = ''; } };
      },
    },
    CVDriveCache: {
      filterDriveFiles: function (items) {
        return (items || []).filter(it => it && it.type === 'drive_file');
      },
      groupByFolder: function (items) {
        const d = (items || []).filter(it => it && it.type === 'drive_file');
        return { groups: [], totalCount: d.length };
      },
    },
    CVDriveViewer: {
      openModal: function (item) {
        if (!global.__openedItems) global.__openedItems = [];
        global.__openedItems.push(item);
        return { close: function () {} };
      },
    },
  };
}

function loadModule(extraGlobals) {
  return dom.loadInVM(MODULE_PATH, { extraGlobals: extraGlobals });
}

async function flush(n) { for (let i = 0; i < (n || 50); i++) await Promise.resolve(); }

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// --- module presence ---

test('CVDriveSyncUI is exposed with mount()', () => {
  const deps = makeDeps();
  const { ctx } = loadModule(Object.assign({
    callWorker: makeCallWorker({}),
    BS_GOOGLE: makeBSGoogle(),
  }, deps));
  assert.ok(ctx.CVDriveSyncUI, 'window.CVDriveSyncUI must be defined');
  assert.equal(typeof ctx.CVDriveSyncUI.mount, 'function');
});

// --- panel shell ---

test('mount() paints toolbar, status chip, folders section', async () => {
  const deps = makeDeps({ folders: [] });
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_items: { ok: true, items: [], last_sync: null },
    }),
    BS_GOOGLE: makeBSGoogle({ authed: false }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await flush();
  assert.ok(host.querySelector('.cv-drive-toolbar'),         'toolbar must be painted');
  assert.ok(host.querySelector('.cv-drive-status'),          'status chip must be painted');
  assert.ok(host.querySelector('.cv-drive-sync-btn'),        'sync button must be painted');
  assert.ok(host.querySelector('.cv-drive-folders-section'), 'folders section must be painted');
  assert.ok(host.querySelector('.cv-drive-add-folder-btn'),  'add-folder button must be painted');
  assert.ok(!host.querySelector('.cv-drive-files-section'),  'no separate files section, files live inside cards');
});

test('status chip shows "Conectado" when BS_GOOGLE.isAuthed() === true', async () => {
  const deps = makeDeps();
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_items: { ok: true, items: [], last_sync: null },
    }),
    BS_GOOGLE: makeBSGoogle({ authed: true, email: 'elder@x.com' }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await flush();
  const status = host.querySelector('.cv-drive-status');
  assert.ok(status);
  const txt = (status.textContent || '').toLowerCase();
  assert.ok(txt.indexOf('conectado') !== -1, 'must say "Conectado" when authed');
});

test('status chip shows not-connected message when isAuthed === false', async () => {
  const deps = makeDeps();
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_items: { ok: true, items: [], last_sync: null },
    }),
    BS_GOOGLE: makeBSGoogle({ authed: false }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await flush();
  const status = host.querySelector('.cv-drive-status');
  const txt = (status.textContent || '').toLowerCase();
  assert.ok(txt.indexOf('conecte') !== -1 || txt.indexOf('não') !== -1 || txt.indexOf('nao') !== -1,
    'must convey not-connected; got: ' + txt);
});

// --- card layout ---

test('mount() renders one card per configured folder with name + folder_id', async () => {
  const deps = makeDeps({ folders: [
    { id: 1, name: 'Pasta principal', folder_id: 'ROOT1' },
    { id: 2, name: 'Banco', folder_id: 'ROOT2' },
  ] });
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_items: { ok: true, items: [], last_sync: null },
    }),
    BS_GOOGLE: makeBSGoogle({ authed: true }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await flush();
  const cards = host.querySelectorAll('.cv-drive-folder-card');
  assert.equal(cards.length, 2, 'must render 2 folder cards');
  const names = host.querySelectorAll('.cv-drive-folder-name');
  const ids   = host.querySelectorAll('.cv-drive-folder-id');
  const nameTexts = Array.from(names).map(n => (n.textContent || '').trim());
  const idTexts   = Array.from(ids).map(n => (n.textContent || '').trim());
  assert.ok(nameTexts.indexOf('Pasta principal') !== -1, 'name "Pasta principal" rendered; got ' + nameTexts.join(','));
  assert.ok(nameTexts.indexOf('Banco') !== -1, 'name "Banco" rendered');
  assert.ok(idTexts.indexOf('ROOT1') !== -1, 'folder_id "ROOT1" rendered; got ' + idTexts.join(','));
});

test('card header click expands the card to show its files', async () => {
  const deps = makeDeps({ folders: [
    { id: 10, name: 'Aulas', folder_id: 'F10' },
  ] });
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_items: {
        ok: true,
        items: [
          { id: 1, type: 'drive_file', title: 'lesson1.pdf', meta_json: { folder_name: 'Aulas', root_folder_id: 'F10' } },
          { id: 2, type: 'drive_file', title: 'lesson2.pdf', meta_json: { folder_name: 'Aulas', root_folder_id: 'F10' } },
        ],
        last_sync: 1700000000000,
      },
    }),
    BS_GOOGLE: makeBSGoogle({ authed: true }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await flush();
  // No card body before click.
  assert.equal(host.querySelectorAll('.cv-drive-file').length, 0, 'no files visible before expand');
  const header = host.querySelector('.cv-drive-folder-card-header');
  assert.ok(header);
  dom.click(header);
  await flush();
  const files = host.querySelectorAll('.cv-drive-file');
  assert.equal(files.length, 2, 'two files visible inside expanded card');
});

test('clicking a file invokes CVDriveViewer.openModal with the item', async () => {
  const deps = makeDeps({ folders: [{ id: 10, name: 'Aulas', folder_id: 'F10' }] });
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_items: {
        ok: true,
        items: [
          { id: 7, type: 'drive_file', title: 'click-me.pdf', meta_json: { folder_name: 'Aulas', root_folder_id: 'F10', file_id: 'X' } },
        ],
        last_sync: null,
      },
    }),
    BS_GOOGLE: makeBSGoogle({ authed: true }),
  }, deps));
  // Reset the per-suite collector.
  delete global.__openedItems;
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await flush();
  const header = host.querySelector('.cv-drive-folder-card-header');
  dom.click(header);
  await flush();
  const file = host.querySelector('.cv-drive-file');
  assert.ok(file);
  dom.click(file);
  await flush();
  assert.ok(Array.isArray(global.__openedItems), 'CVDriveViewer.openModal must have been called');
  assert.equal(global.__openedItems.length, 1);
  assert.equal(global.__openedItems[0].id, 7);
});

test('files without root_folder_id fall back to the first card', async () => {
  const deps = makeDeps({ folders: [
    { id: 1, name: 'Pasta principal', folder_id: 'F1' },
    { id: 2, name: 'Banco', folder_id: 'F2' },
  ] });
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_items: {
        ok: true,
        items: [
          { id: 100, type: 'drive_file', title: 'legacy.pdf', meta_json: { folder_name: 'Pasta principal' } },
        ],
        last_sync: null,
      },
    }),
    BS_GOOGLE: makeBSGoogle({ authed: true }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await flush();
  const firstHeader  = host.querySelectorAll('.cv-drive-folder-card-header')[0];
  const secondHeader = host.querySelectorAll('.cv-drive-folder-card-header')[1];
  dom.click(firstHeader);
  await flush();
  assert.equal(host.querySelectorAll('.cv-drive-file').length, 1, 'legacy file appears in first card');
  // Now close first, open second; it should be empty.
  dom.click(firstHeader);
  await flush();
  dom.click(secondHeader);
  await flush();
  assert.equal(host.querySelectorAll('.cv-drive-file').length, 0, 'second card has no legacy files');
});

// --- sync button ---

test('clicking sync button POSTs cv_sync_drive_items with multi-folder items', async () => {
  const worker = makeCallWorker({
    cv_list_drive_items: { ok: true, items: [], last_sync: null },
    cv_sync_drive_items: function (p) {
      worker._syncItems = p.items;
      return { ok: true, inserted: p.items.length, updated: 0, deleted: 0, last_sync: 1700000000001 };
    },
  });
  const deps = makeDeps({ folders: [
    { id: 1, name: 'Pasta principal', folder_id: 'ROOT1' },
    { id: 2, name: 'Banco', folder_id: 'ROOT2' },
  ] });
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: worker,
    BS_GOOGLE: makeBSGoogle({
      authed: true,
      folderContents: {
        ROOT1: [{ id: 'fA', name: 'A.pdf', mimeType: 'application/pdf' }],
        ROOT2: [{ id: 'fB', name: 'B.pdf', mimeType: 'application/pdf' }],
      },
    }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await flush();
  const btn = host.querySelector('.cv-drive-sync-btn');
  dom.click(btn);
  await flush(60);
  const syncCall = worker.calls.find(c => c.action === 'cv_sync_drive_items');
  assert.ok(syncCall, 'cv_sync_drive_items must be called');
  assert.equal(syncCall.items.length, 2);
  const fileIds = syncCall.items.map(it => it.file_id).sort();
  assert.equal(JSON.stringify(fileIds), JSON.stringify(['fA', 'fB']));
  // root_folder_id must be set on each item so cards can group later.
  syncCall.items.forEach(function (it) {
    assert.ok(it.root_folder_id && (it.root_folder_id === 'ROOT1' || it.root_folder_id === 'ROOT2'),
      'each synced item must carry its root_folder_id; got ' + it.root_folder_id);
  });
});

test('sync button disables during sync and re-enables after', async () => {
  let resolveSync;
  const worker = makeCallWorker({
    cv_list_drive_items: { ok: true, items: [], last_sync: null },
    cv_sync_drive_items: function () {
      return new Promise(function (resolve) { resolveSync = resolve; });
    },
  });
  const deps = makeDeps({ folders: [{ id: 1, name: 'Pasta', folder_id: 'R1' }] });
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: worker,
    BS_GOOGLE: makeBSGoogle({
      authed: true,
      folderContents: { R1: [{ id: 'f1', name: 'a.pdf', mimeType: 'application/pdf' }] },
    }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await flush();
  const btn = host.querySelector('.cv-drive-sync-btn');
  dom.click(btn);
  await flush();
  assert.equal(btn.disabled, true, 'sync button must be disabled while sync in flight');
  assert.ok(typeof resolveSync === 'function', 'cv_sync_drive_items mock must have been reached');
  resolveSync({ ok: true, inserted: 1, updated: 0, deleted: 0, last_sync: Date.now() });
  await flush(60);
  assert.equal(btn.disabled, false, 'sync button must re-enable after sync completes');
});

// --- auto-sync on CRUD ---

test('adding a folder triggers an automatic sync', async () => {
  const worker = makeCallWorker({
    cv_list_drive_items: { ok: true, items: [], last_sync: null },
    cv_sync_drive_items: function (p) {
      return { ok: true, inserted: p.items.length, updated: 0, deleted: 0, last_sync: Date.now() };
    },
  });
  const deps = makeDeps({ folders: [] });
  // Override editor mock so submit triggers onSave directly via a microtask
  // (setTimeout would not be drained by the test's await Promise.resolve loop).
  deps.CVDriveFoldersUI.mountFolderEditor = function (host, opts) {
    Promise.resolve().then(function () { opts.onSave({ name: 'New', folder_id: 'NEW1' }); });
    return { destroy: function () { host.innerHTML = ''; } };
  };
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: worker,
    BS_GOOGLE: makeBSGoogle({
      authed: true,
      folderContents: { NEW1: [{ id: 'fnew', name: 'n.pdf', mimeType: 'application/pdf' }] },
    }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await flush();
  const addBtn = host.querySelector('.cv-drive-add-folder-btn');
  dom.click(addBtn);
  await flush(80);
  const syncCall = worker.calls.find(c => c.action === 'cv_sync_drive_items');
  assert.ok(syncCall, 'cv_sync_drive_items must be triggered automatically after add');
});

test('deleting a folder triggers an automatic sync', async () => {
  const worker = makeCallWorker({
    cv_list_drive_items: { ok: true, items: [], last_sync: null },
    cv_sync_drive_items: function () {
      return { ok: true, inserted: 0, updated: 0, deleted: 0, last_sync: Date.now() };
    },
  });
  const deps = makeDeps({ folders: [{ id: 1, name: 'X', folder_id: 'F1' }] });
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: worker,
    BS_GOOGLE: makeBSGoogle({ authed: true, folderContents: { F1: [] } }),
    confirm: function () { return true; },
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await flush();
  const delBtn = host.querySelector('[data-action="delete"]');
  assert.ok(delBtn);
  dom.click(delBtn);
  await flush(80);
  const syncCall = worker.calls.find(c => c.action === 'cv_sync_drive_items');
  assert.ok(syncCall, 'cv_sync_drive_items must be triggered automatically after delete');
});

// --- destroy ---

test('mount() returns instance with destroy() that clears host', () => {
  const deps = makeDeps();
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_items: { ok: true, items: [], last_sync: null },
    }),
    BS_GOOGLE: makeBSGoogle({ authed: false }),
  }, deps));
  const host = doc.createElement('div');
  const inst = ctx.CVDriveSyncUI.mount(host, {});
  assert.equal(typeof inst.destroy, 'function');
  inst.destroy();
  assert.equal(host.innerHTML, '');
});

// runner
let passed = 0, failed = 0;
(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      console.log('PASS ' + t.name);
      passed++;
    } catch (e) {
      console.error('FAIL ' + t.name + '\n  ' + (e && e.message ? e.message : String(e)));
      failed++;
    }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
