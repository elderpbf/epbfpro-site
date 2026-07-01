// content/drive.js
// Codex Content tab, Drive sub-tab. NATIVE cdx- module (full nativization of the
// legacy CVDriveSyncUI + cv-drive-folders-* globals; the tracked debt in
// manifest/FUTURE.md, now done).
//
// Master-detail layout, same shell as the Items sub-tab: a left list of the
// configured Drive root folders (+ add / sync controls) and a right pane that
// shows the selected folder's synced files (grouped by subfolder) or the folder
// editor. Reuses the Items split classes (cdx-items-split / cdx-items-list /
// cdx-item-row / cdx-item-preview), so there is one master-detail layout.
//
// Globals (shared, deliberately not debt):
//   window.BS_GOOGLE     auth + the client-side Google Drive read (auth-bound,
//                        Backstage-owned; the actual Drive listing happens here)
//   window.confirm       native browser dialog (_deleteFolder only)
// The file-preview modal is the Codex-owned js/drive-viewer.js module (also used
// by Lessons). Everything else (folder CRUD, the synced-item index, the editor,
// the sync orchestration) is native, and every Worker call goes through the
// codex-api `drive` facade, never callWorker directly.
import { drive as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import { openModal as openDriveModal } from '../js/drive-viewer.js';

let _viewEl = null;
let _folders = [];
let _files = [];
let _lastSync = null;
let _selectedId = null;   // selected root folder id
let _editing = null;      // null | {} (add) | folder (edit)
let _syncing = false;
let _onClick = null;
let _onSubmit = null;

import { esc as _esc } from '../js/dom.js';
function _q(sel) { return _viewEl && _viewEl.querySelector(sel); }
function _bs() { return (typeof window !== 'undefined') ? window.BS_GOOGLE : null; }

// Files belonging to a configured root: meta_json.root_folder_id matches; legacy
// pre-tag rows fall back to the FIRST configured folder until the next sync
// re-tags them. (Ported value-for-value from CVDriveSyncUI._filesForRoot.)
function _filesForRoot(root, isFirstRoot) {
  return _files.filter((it) => {
    const meta = it.meta_json || {};
    if (meta.root_folder_id) return meta.root_folder_id === root.folder_id;
    return isFirstRoot;
  });
}

// Sub-group a card's files by folder_name; root-level files land in a "(raiz)"
// group pinned first. (Ported from CVDriveSyncUI._subgroupForCard.)
function _subgroups(files, root) {
  const map = new Map();
  const raiz = [];
  files.forEach((it) => {
    const meta = it.meta_json || {};
    const fn = (meta.folder_name && String(meta.folder_name).trim()) || '';
    if (!fn || fn === root.name) raiz.push(it);
    else { if (!map.has(fn)) map.set(fn, []); map.get(fn).push(it); }
  });
  const groups = [];
  if (raiz.length) groups.push({ name: t('drive.root_group'), items: raiz });
  Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .forEach((n) => groups.push({ name: n, items: map.get(n) }));
  return groups;
}

function _countLabel(n) { return n + ' ' + (n === 1 ? t('drive.file_one') : t('drive.file_many')); }
function _rootIndex(root) { return _folders.findIndex((f) => f.id === root.id); }

// ── Status + last-sync line ──────────────────────────────────────────────────
function _renderStatus() {
  const el = _q('#cdx-drive-status');
  if (!el) return;
  const bs = _bs();
  if (bs && bs.isAuthed && bs.isAuthed()) {
    const email = (bs.getEmail && bs.getEmail()) || '';
    el.textContent = t('drive.connected') + (email ? ' · ' + email : '');
    el.classList.add('is-ok'); el.classList.remove('is-warn');
  } else {
    el.textContent = t('drive.not_connected');
    el.classList.add('is-warn'); el.classList.remove('is-ok');
  }
  const ls = _q('#cdx-drive-lastsync');
  if (ls) ls.textContent = _lastSync ? t('drive.last_sync') + new Date(_lastSync).toLocaleString('pt-BR') : t('drive.never_synced');
}

// ── Left list: configured folders ────────────────────────────────────────────
function _renderList() {
  const list = _q('#cdx-drive-list');
  if (!list) return;
  const add = '<button type="button" class="cdx-btn cdx-btn-sm cdx-drive-add" data-action="add">' + _esc(t('drive.add_folder')) + '</button>';
  if (!_folders.length) {
    list.innerHTML = add + '<div class="cdx-empty">' + _esc(t('drive.no_folders')) + '</div>';
    return;
  }
  const rows = _folders.map((root, idx) => {
    const count = _filesForRoot(root, idx === 0).length;
    const active = root.id === _selectedId && _editing === null;
    return '<div class="cdx-item-row' + (active ? ' is-active' : '') + '" data-folder-id="' + _esc(root.id) + '">' +
        '<span class="cdx-item-type-icon cdx-drive-icon">&#9698;</span>' +
        '<div class="cdx-item-info">' +
          '<div class="cdx-item-title">' + _esc(root.name || '') + '</div>' +
          '<div class="cdx-item-sub"><code class="cdx-drive-fid">' + _esc(root.folder_id || '') + '</code> &middot; ' + _countLabel(count) + '</div>' +
        '</div>' +
      '</div>';
  }).join('');
  list.innerHTML = add + rows;
}

// ── Right pane: empty | folder files | editor ────────────────────────────────
function _renderPreview() {
  const pane = _q('#cdx-drive-preview');
  if (!pane) return;
  if (_editing !== null) { pane.innerHTML = _editorHtml(_editing); _focusEditor(); return; }
  const root = _folders.find((f) => f.id === _selectedId);
  if (!root) { pane.innerHTML = '<div class="cdx-preview-empty">' + _esc(t('drive.select_folder')) + '</div>'; return; }
  const files = _filesForRoot(root, _rootIndex(root) === 0);
  let body;
  if (!files.length) {
    body = '<div class="cdx-drive-files-empty">' + _esc(t('drive.no_files')) + '</div>';
  } else {
    body = _subgroups(files, root).map((g) => {
      const rows = g.items.map((it) => {
        const meta = it.meta_json || {};
        const label = meta.label || '';
        return '<button type="button" class="cdx-drive-file" data-file-id="' + _esc(it.id) + '">' +
            '<span class="cdx-drive-file-icon">' + _esc(meta.icon || '◆') + '</span>' +
            '<span class="cdx-drive-file-name">' + _esc(it.title || '') + '</span>' +
            (label ? '<span class="cdx-drive-file-label">' + _esc(label) + '</span>' : '') +
          '</button>';
      }).join('');
      return '<div class="cdx-drive-subfolder">' +
          '<div class="cdx-drive-subfolder-head">' + _esc(g.name) + ' <span class="cdx-drive-count">' + g.items.length + '</span></div>' +
          '<div class="cdx-drive-subfolder-files">' + rows + '</div>' +
        '</div>';
    }).join('');
  }
  pane.innerHTML =
    '<div class="cdx-drive-preview-head">' +
      '<div class="cdx-drive-preview-meta">' +
        '<div class="cdx-lab-ptitle">' + _esc(root.name || '') + '</div>' +
        '<code class="cdx-drive-fid">' + _esc(root.folder_id || '') + '</code>' +
      '</div>' +
      '<div class="cdx-drive-preview-actions">' +
        '<button type="button" class="cdx-btn cdx-btn-vazado cdx-btn-sm" data-action="edit">' + _esc(t('drive.edit')) + '</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-danger" data-action="delete">' + _esc(t('drive.delete')) + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-drive-files">' + body + '</div>';
}

// ── Folder editor (ported from CVDriveFoldersUI.mountFolderEditor) ────────────
function _editorHtml(folder) {
  const isNew = !folder || !folder.id;
  return '<form class="cdx-drive-editor" novalidate>' +
      '<div class="cdx-drive-editor-title">' + _esc(isNew ? t('drive.add_folder') : t('drive.edit')) + '</div>' +
      '<label class="cdx-drive-field"><span>' + _esc(t('drive.editor_name')) + '</span>' +
        '<input class="cdx-input cdx-drive-editor-name" required value="' + _esc((folder && folder.name) || '') + '"></label>' +
      '<label class="cdx-drive-field"><span>' + _esc(t('drive.editor_folder_id')) + '</span>' +
        '<input class="cdx-input cdx-drive-editor-fid" required value="' + _esc((folder && folder.folder_id) || '') + '"></label>' +
      '<div class="cdx-drive-editor-error" data-drive-error role="alert" aria-live="polite"></div>' +
      '<div class="cdx-drive-editor-actions">' +
        '<button type="button" class="cdx-btn cdx-btn-vazado cdx-btn-sm" data-action="editor-cancel">' + _esc(t('drive.editor_cancel')) + '</button>' +
        '<button type="submit" class="cdx-btn cdx-btn-sm cdx-btn-primary">' + _esc(isNew ? t('drive.editor_add') : t('drive.editor_save')) + '</button>' +
      '</div>' +
    '</form>';
}
function _focusEditor() { const n = _q('.cdx-drive-editor-name'); if (n) setTimeout(() => n.focus(), 0); }

// Accept a full Drive URL in the folder_id field; auto-extract the id.
function _extractFolderId(raw) {
  const m = String(raw || '').match(/\/folders\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : String(raw || '').trim();
}

function _submitEditor(form) {
  const errEl = form.querySelector('[data-drive-error]');
  const nameEl = form.querySelector('.cdx-drive-editor-name');
  const fidEl = form.querySelector('.cdx-drive-editor-fid');
  if (errEl) errEl.textContent = '';
  const name = ((nameEl && nameEl.value) || '').trim();
  const folderId = _extractFolderId((fidEl && fidEl.value) || '');
  if (!name) { if (errEl) errEl.textContent = t('drive.err_name'); if (nameEl) nameEl.classList.add('is-invalid'); return; }
  if (!folderId) { if (errEl) errEl.textContent = t('drive.err_folder_id'); if (fidEl) fidEl.classList.add('is-invalid'); return; }
  const editingId = (_editing && _editing.id) || undefined;
  const p = editingId !== undefined
    ? api.updateFolder({ id: editingId, name, folder_id: folderId })
    : api.addFolder({ name, folder_id: folderId });
  p.then((res) => {
    const folder = (res && res.folder) || null;
    _editing = null;
    return _reloadFolders().then(() => {
      if (folder && folder.id) _selectedId = folder.id;
      _renderList(); _renderPreview();
      return _autoSync();
    });
  }).catch((e) => { if (errEl) errEl.textContent = t('drive.err_save'); notice.internal(e); });
}

// ── Folder CRUD + load ───────────────────────────────────────────────────────
function _reloadFolders() {
  return api.listFolders({ _silent: true }).then((res) => {
    _folders = (res && res.folders) || [];
  }).catch(() => { _folders = []; });
}
function _loadFiles() {
  return api.listItems({ _silent: true }).then((res) => {
    if (!res || !res.ok) return;
    _files = res.items || [];
    _lastSync = res.last_sync || null;
  }).catch(() => { /* keep prior */ });
}

function _deleteFolder(folder) {
  if (typeof confirm === 'function' && !confirm(t('drive.delete_confirm').replace('{name}', folder.name || ''))) return;
  api.deleteFolder({ id: folder.id }).then(() => {
    if (_selectedId === folder.id) _selectedId = null;
    return _reloadFolders().then(() => { _renderList(); _renderPreview(); return _autoSync(); });
  }).catch((e) => notice.internal(e));
}

// ── Sync: client reads Google Drive (BS_GOOGLE), Worker persists the index ────
function _gatherFolder(bs, folder) {
  return bs.drive.listFolder(folder.folder_id).then((rootFiles) => {
    const isFolder = (f) => f.mimeType === 'application/vnd.google-apps.folder';
    const toItem = (f, folderName) => ({ file_id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime || '', folder_name: folderName, root_folder_id: folder.folder_id });
    const items = rootFiles.filter((f) => !isFolder(f)).map((f) => toItem(f, folder.name));
    const subs = rootFiles.filter(isFolder);
    return Promise.all(subs.map((sf) => bs.drive.listFolder(sf.id)
      .then((sub) => sub.filter((f) => !isFolder(f)).map((f) => toItem(f, sf.name)))
      .catch(() => []))).then((subArrays) => {
        subArrays.forEach((arr) => arr.forEach((it) => items.push(it)));
        return items;
      });
  }).catch(() => []);
}

function _runSync(opts) {
  opts = opts || {};
  const bs = _bs();
  if (!bs) { toast.err(t('drive.err_unavailable')); return Promise.resolve(false); }
  _syncing = true; _setSyncBtn(true);
  const authP = (bs.isAuthed && bs.isAuthed()) ? Promise.resolve() : bs.requestToken({ prompt: opts.silent ? '' : 'consent' });
  return authP
    .then(() => api.listFolders({ _silent: true }))
    .then((res) => Promise.all(((res && res.folders) || []).map((f) => _gatherFolder(bs, f))))
    .then((all) => { const flat = []; all.forEach((arr) => arr.forEach((it) => flat.push(it))); return api.syncItems({ items: flat }); })
    .then(() => _loadFiles())
    .then(() => { _syncing = false; _setSyncBtn(false); _renderStatus(); _renderList(); _renderPreview(); return true; })
    .catch((e) => { _syncing = false; _setSyncBtn(false); toast.err(t('drive.err_sync')); notice.internal(e); return false; });
}
// Quiet post-CRUD refresh; skips if there is no Google session (no surprise popup).
function _autoSync() {
  const bs = _bs();
  if (!bs || !bs.isAuthed || !bs.isAuthed()) return Promise.resolve(false);
  return _runSync({ silent: true });
}
function _setSyncBtn(on) {
  const btn = _q('.cdx-drive-sync');
  if (!btn) return;
  btn.disabled = on;
  btn.textContent = on ? t('drive.syncing') : t('drive.sync_now');
}

// ── Render shell + lifecycle ─────────────────────────────────────────────────
function _render() {
  _viewEl.innerHTML =
    '<div class="cdx-drive">' +
      '<div class="cdx-drive-toolbar">' +
        '<h2 class="cdx-drive-title">' + _esc(t('drive.title')) + '</h2>' +
        '<div class="cdx-drive-statuswrap">' +
          '<div class="cdx-drive-status" id="cdx-drive-status"></div>' +
          '<div class="cdx-drive-lastsync" id="cdx-drive-lastsync"></div>' +
        '</div>' +
        '<button type="button" class="cdx-btn cdx-btn-primary cdx-drive-sync" data-action="sync">' + _esc(t('drive.sync_now')) + '</button>' +
      '</div>' +
      '<div class="cdx-items-split cdx-drive-split">' +
        '<div class="cdx-items-list" id="cdx-drive-list"></div>' +
        '<div class="cdx-item-preview" id="cdx-drive-preview"></div>' +
      '</div>' +
    '</div>';
  _renderStatus();
  _renderList();
  _renderPreview();
}

export function mount(viewEl) {
  _viewEl = viewEl;
  _folders = []; _files = []; _lastSync = null; _selectedId = null; _editing = null; _syncing = false;
  _render();

  _onClick = (e) => {
    const actBtn = e.target.closest('[data-action]');
    if (actBtn) {
      const act = actBtn.getAttribute('data-action');
      if (act === 'sync') { if (!_syncing) _runSync(); return; }
      if (act === 'add') { _editing = {}; _selectedId = null; _renderList(); _renderPreview(); return; }
      if (act === 'editor-cancel') { _editing = null; _renderPreview(); _renderList(); return; }
      if (act === 'edit') { const r = _folders.find((f) => f.id === _selectedId); if (r) { _editing = r; _renderPreview(); } return; }
      if (act === 'delete') { const r = _folders.find((f) => f.id === _selectedId); if (r) _deleteFolder(r); return; }
    }
    const fileBtn = e.target.closest('.cdx-drive-file');
    if (fileBtn) {
      const item = _files.find((f) => String(f.id) === String(fileBtn.getAttribute('data-file-id')));
      if (item) openDriveModal(item);
      return;
    }
    const row = e.target.closest('.cdx-item-row');
    if (row && row.dataset.folderId) {
      _editing = null;
      _selectedId = Number(row.dataset.folderId);
      _renderList(); _renderPreview();
    }
  };
  _onSubmit = (e) => {
    const form = e.target.closest('.cdx-drive-editor');
    if (!form) return;
    e.preventDefault();
    _submitEditor(form);
  };
  viewEl.addEventListener('click', _onClick);
  viewEl.addEventListener('submit', _onSubmit);

  Promise.all([_reloadFolders(), _loadFiles()]).then(() => {
    _renderStatus(); _renderList(); _renderPreview();
  });
}

export function unmount() {
  if (_viewEl) {
    if (_onClick) _viewEl.removeEventListener('click', _onClick);
    if (_onSubmit) _viewEl.removeEventListener('submit', _onSubmit);
    _viewEl.innerHTML = '';
  }
  _viewEl = null; _onClick = null; _onSubmit = null;
  _folders = []; _files = []; _lastSync = null; _selectedId = null; _editing = null; _syncing = false;
}
