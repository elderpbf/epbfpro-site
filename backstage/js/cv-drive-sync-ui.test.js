'use strict';

// Acceptance tests for cv-drive-sync-ui.js (CVDriveSyncUI window global).
// Bundle O. The orchestrator that paints the full Conteúdo · Drive sub-tab:
// status chip + sync button + folder CRUD section + cached-files list.
// Derived from SPEC only. Does NOT read module source.
// Run: node backstage/js/cv-drive-sync-ui.test.js

const assert = require('node:assert/strict');
const path = require('node:path');
const dom = require('./__test-dom.cjs');

const MODULE_PATH = path.join(__dirname, 'cv-drive-sync-ui.js');

// Stub callWorker (records calls, returns canned responses by action key).
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

// Stub BS_GOOGLE (isAuthed + drive.listFolder + requestToken + getEmail).
function makeBSGoogle(opts) {
  const o = opts || {};
  return {
    isAuthed: function () { return !!o.authed; },
    getEmail: function () { return o.email || ''; },
    requestToken: function () {
      if (o.authed) return Promise.resolve();
      return Promise.resolve(); // simulate successful consent
    },
    drive: {
      listFolder: function (folderId) {
        const map = o.folderContents || {};
        return Promise.resolve(map[folderId] || []);
      },
    },
  };
}

// Stub the dependent modules CVDriveFoldersAPI, CVDriveFoldersUI, CVDriveCache.
function makeDeps(state) {
  const s = state || {};
  return {
    CVDriveFoldersAPI: {
      list:   () => Promise.resolve(s.folders || []),
      create: (p) => { (s.folders = s.folders || []).push(Object.assign({ id: Date.now() }, p)); return Promise.resolve(s.folders[s.folders.length - 1]); },
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
      mountFoldersList: function (host, opts) {
        host._mounted = 'folders-list';
        host._lastOpts = opts;
        host.innerHTML = '<div class="mock-folders-list"></div>';
        return {
          setFolders: function (next) { host._lastOpts.folders = next; },
          destroy: function () { host.innerHTML = ''; },
        };
      },
      mountFolderEditor: function (host, opts) {
        host._mounted = 'folder-editor';
        host._lastOpts = opts;
        host.innerHTML = '<div class="mock-folder-editor"></div>';
        return { destroy: function () { host.innerHTML = ''; } };
      },
    },
    CVDriveCache: {
      filterDriveFiles: function (items) {
        return (items || []).filter(function (it) { return it && it.type === 'drive_file'; });
      },
      groupByFolder: function (items) {
        const dItems = (items || []).filter(function (it) { return it && it.type === 'drive_file'; });
        const map = new Map();
        for (const it of dItems) {
          const m = it.meta_json || {};
          const key = (m.folder_name && String(m.folder_name).trim()) || '(raiz)';
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(it);
        }
        const groups = [];
        for (const [name, arr] of map) groups.push({ name: name, items: arr });
        return { groups: groups, totalCount: dItems.length };
      },
    },
  };
}

function loadModule(extraGlobals) {
  return dom.loadInVM(MODULE_PATH, { extraGlobals: extraGlobals });
}

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

test('mount() paints status chip, sync button, folders section, files section', async () => {
  const deps = makeDeps({ folders: [] });
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_folders: { ok: true, folders: [] },
      cv_list_drive_items:   { ok: true, items: [], last_sync: null },
    }),
    BS_GOOGLE: makeBSGoogle({ authed: false }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await Promise.resolve(); await Promise.resolve();
  assert.ok(host.querySelector('.cv-drive-status'),       'status chip must be painted');
  assert.ok(host.querySelector('.cv-drive-sync-btn'),     'sync button must be painted');
  assert.ok(host.querySelector('.cv-drive-folders-section'), 'folders section must be painted');
  assert.ok(host.querySelector('.cv-drive-files-section'),   'files section must be painted');
});

test('status chip shows "Conectado" when BS_GOOGLE.isAuthed() === true', async () => {
  const deps = makeDeps();
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_folders: { ok: true, folders: [] },
      cv_list_drive_items:   { ok: true, items: [], last_sync: null },
    }),
    BS_GOOGLE: makeBSGoogle({ authed: true, email: 'elder@x.com' }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await Promise.resolve(); await Promise.resolve();
  const status = host.querySelector('.cv-drive-status');
  assert.ok(status, 'status chip exists');
  const txt = (status.textContent || '').toLowerCase();
  assert.ok(txt.indexOf('conectado') !== -1, 'must say "Conectado" when authed');
});

test('status chip shows "Não conectado" message when BS_GOOGLE.isAuthed() === false', async () => {
  const deps = makeDeps();
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_folders: { ok: true, folders: [] },
      cv_list_drive_items:   { ok: true, items: [], last_sync: null },
    }),
    BS_GOOGLE: makeBSGoogle({ authed: false }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  await Promise.resolve(); await Promise.resolve();
  const status = host.querySelector('.cv-drive-status');
  const txt = (status.textContent || '').toLowerCase();
  assert.ok(txt.indexOf('não conectado') !== -1 || txt.indexOf('nao conectado') !== -1 || txt.indexOf('conecte') !== -1,
    'must say something like "Não conectado" / "Conecte" when not authed; got: ' + txt);
});

// --- file list rendering ---

test('mount() calls cv_list_drive_items and renders groups from items', async () => {
  const worker = makeCallWorker({
    cv_list_drive_folders: { ok: true, folders: [] },
    cv_list_drive_items: {
      ok: true,
      items: [
        { id: 1, type: 'drive_file', title: 'a.pdf', meta_json: { folder_name: 'Aulas' } },
        { id: 2, type: 'drive_file', title: 'b.pdf', meta_json: { folder_name: 'Aulas' } },
        { id: 3, type: 'drive_file', title: 'c.pdf', meta_json: { folder_name: 'Apostilas' } },
      ],
      last_sync: 1700000000000,
    },
  });
  const deps = makeDeps();
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: worker,
    BS_GOOGLE: makeBSGoogle({ authed: true }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  // Resolve a few microtasks so the async chain settles.
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const groupHeads = host.querySelectorAll('.cv-drive-group-head, .ct-drive-group-head');
  assert.ok(groupHeads.length >= 2, 'at least 2 groups (Aulas + Apostilas) must render; got ' + groupHeads.length);
  assert.ok(worker.calls.some(c => c.action === 'cv_list_drive_items'),
    'cv_list_drive_items must be called on mount');
});

test('mount() shows "Nunca sincronizado" when last_sync is null', async () => {
  const deps = makeDeps();
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_folders: { ok: true, folders: [] },
      cv_list_drive_items:   { ok: true, items: [], last_sync: null },
    }),
    BS_GOOGLE: makeBSGoogle({ authed: true }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const last = host.querySelector('.cv-drive-last-sync');
  assert.ok(last, 'last-sync element exists');
  const txt = (last.textContent || '').toLowerCase();
  assert.ok(txt.indexOf('nunca') !== -1, 'must say "Nunca sincronizado"; got: ' + txt);
});

// --- sync button ---

test('clicking sync button traverses configured folders + POSTs cv_sync_drive_items', async () => {
  const worker = makeCallWorker({
    cv_list_drive_folders: { ok: true, folders: [
      { id: 1, name: 'Pasta principal', folder_id: 'ROOT1' },
      { id: 2, name: 'Banco', folder_id: 'ROOT2' },
    ] },
    cv_list_drive_items:   { ok: true, items: [], last_sync: null },
    cv_sync_drive_items:   function (p) {
      worker._syncCallParams = p;
      return { ok: true, inserted: p.items.length, updated: 0, deleted: 0, last_sync: 1700000000001 };
    },
  });
  const bs = makeBSGoogle({
    authed: true,
    folderContents: {
      ROOT1: [
        { id: 'fA', name: 'A.pdf', mimeType: 'application/pdf' },
      ],
      ROOT2: [
        { id: 'fB', name: 'B.pdf', mimeType: 'application/pdf' },
      ],
    },
  });
  const deps = makeDeps({ folders: [
    { id: 1, name: 'Pasta principal', folder_id: 'ROOT1' },
    { id: 2, name: 'Banco', folder_id: 'ROOT2' },
  ] });
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: worker,
    BS_GOOGLE: bs,
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  for (let i = 0; i < 5; i++) await Promise.resolve();

  const btn = host.querySelector('.cv-drive-sync-btn');
  assert.ok(btn, 'sync button exists');
  dom.click(btn);
  for (let i = 0; i < 50; i++) await Promise.resolve();

  const syncCall = worker.calls.find(c => c.action === 'cv_sync_drive_items');
  assert.ok(syncCall, 'cv_sync_drive_items must be called after sync btn click');
  const items = syncCall.items || [];
  assert.equal(items.length, 2, 'must POST 2 items (one from each root folder)');
  const fileIds = items.map(function (it) { return it.file_id; }).sort();
  assert.equal(JSON.stringify(fileIds), JSON.stringify(['fA', 'fB']));
});

test('sync button disables during sync and re-enables after', async () => {
  let resolveSync;
  const worker = makeCallWorker({
    cv_list_drive_folders: { ok: true, folders: [
      { id: 1, name: 'Pasta', folder_id: 'R1' },
    ] },
    cv_list_drive_items:   { ok: true, items: [], last_sync: null },
    cv_sync_drive_items:   function () {
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
  for (let i = 0; i < 20; i++) await Promise.resolve();

  const btn = host.querySelector('.cv-drive-sync-btn');
  dom.click(btn);
  for (let i = 0; i < 50; i++) await Promise.resolve();
  assert.equal(btn.disabled, true, 'sync button must be disabled while sync in flight');
  assert.ok(typeof resolveSync === 'function', 'cv_sync_drive_items mock must have been reached (resolveSync captured)');

  resolveSync({ ok: true, inserted: 1, updated: 0, deleted: 0, last_sync: Date.now() });
  for (let i = 0; i < 50; i++) await Promise.resolve();
  assert.equal(btn.disabled, false, 'sync button must re-enable after sync completes');
});

// --- folder CRUD wiring ---

test('mount() loads folders via cv_list_drive_folders and passes them to CVDriveFoldersUI', async () => {
  const worker = makeCallWorker({
    cv_list_drive_items: { ok: true, items: [], last_sync: null },
  });
  const deps = makeDeps({ folders: [{ id: 7, name: 'X', folder_id: 'Y' }] });
  let receivedFolders = null;
  deps.CVDriveFoldersUI.mountFoldersList = function (h, opts) {
    receivedFolders = opts.folders;
    h.innerHTML = '<div class="mock-folders-list"></div>';
    return { setFolders: function (n) { receivedFolders = n; }, destroy: function () {} };
  };
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: worker,
    BS_GOOGLE: makeBSGoogle({ authed: true }),
  }, deps));
  const host = doc.createElement('div');
  ctx.CVDriveSyncUI.mount(host, {});
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.ok(receivedFolders && receivedFolders.length === 1, 'folder list must receive the fetched folders');
  assert.equal(receivedFolders[0].id, 7);
});

test('mount() returns instance with destroy() that clears host', () => {
  const deps = makeDeps();
  const { ctx, doc } = loadModule(Object.assign({
    callWorker: makeCallWorker({
      cv_list_drive_folders: { ok: true, folders: [] },
      cv_list_drive_items:   { ok: true, items: [], last_sync: null },
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
