// cohorts/cohorts.js
// Codex — Cohorts tab: Clients | Turmas | Aulas (three-column layout).
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.callWorker   (../backstage/js/api-client.js)
//   window.BSToast      (../backstage/js/bs-toast.js)  — optional, graceful fallback
import { cohorts as api, cp as cpApi, courses as coursesApi, certificates as certApi, assetUrl } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc as _esc, slugify as _slugify } from '../js/dom.js';
import { aulaStatus } from '../js/aula-status.js';
import { openModal, closeModal } from '../js/modal.js';
import { parseRosterLines } from './roster-parser.js';
import { participantTier, tierLabelKey, tierTitleKey, tierBadgeClass } from '../js/participant-tier.js';
import * as cursos from './courses.js';

// ── Sub-tab registry ──────────────────────────────────────────────────────────
// Cohorts gained sub-tabs with the Cursos data model: the operational
// Clientes→Turmas→Aulas view (default) + the reusable course/ementa registry.
export const SUBTABS = [
  { key: 'turmas', labelKey: 'cohorts.sub_turmas' },
  { key: 'cursos', labelKey: 'cohorts.sub_cursos' },
];

function _resolveSub(sub) {
  return SUBTABS.some((s) => s.key === sub) ? sub : SUBTABS[0].key;
}

export function subtabs(activeSub) {
  const active = _resolveSub(activeSub);
  return SUBTABS.map((s) => ({
    label: t(s.labelKey),
    href: '/codex/?tab=cohorts&sub=' + s.key,
    active: s.key === active,
  }));
}

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _clients = [];
let _selectedClientSlug = null;
let _turmas = [];        // ALL turmas across clients (merged Concept-A list)
let _turmaSearch = '';   // live filter for the merged turma list
let _turmaAulas = [];
let _relClientSlug = null;
let _relTurmaSlug = null;
let _cpSessions = [];
let _turmaCourses = [];   // course list cached for the turma form's course picker
let _pickedCourse = null; // full course fetched when the picker changes (for ementa copy)
let _cleanup = []; // teardown functions pushed by mount

// ── Helpers ─────────────────────────────────────────────────────────────────

// _esc and _slugify are imported from ../js/dom.js

function _toast(msg) {
  if (window.BSToast && window.BSToast.show) window.BSToast.show(msg);
}

function _toastError(msg) {
  // Codex toast (js/toast.js sets window.BSToast); the legacy utils.js
  // showToastError global is no longer loaded.
  _toast(msg);
}

function _baseUrl() {
  return location.protocol + '//' + location.host;
}

function _turmaUrl(clientSlug, turmaSlug, token) {
  return _baseUrl() + '/trilha/' + clientSlug + '/' + turmaSlug + '?k=' + token;
}

function _iconSrc(iconPath) {
  if (!iconPath) return null;
  if (iconPath.startsWith('http')) return iconPath;
  return assetUrl('/r2/' + iconPath);
}

function _fmtDate(iso) {
  if (!iso) return '';
  const p = iso.split('-');
  return p[2] + '/' + p[1];
}

// Maps the canonical aula status (js/aula-status.js) to this view's date badge
// { text, cls }. The RULE lives in the shared module; here we only pick the label
// + colour per status. `today` is injectable for tests; the shared rule defaults it.
export function _aulaDateStatus(a, today) {
  const status = aulaStatus(a, today);
  if (status === 'happened') {
    // happened_on shows its own date; a past-scheduled aula shows the scheduled one.
    const when = (a && a.happened_on) || (a && a.scheduled_for) || '';
    return { text: t('cohorts.date_happened') + ' ' + _fmtDate(when), cls: 'cdx-rel-date-ocorreu' };
  }
  if (status === 'rescheduled')
    return { text: t('cohorts.date_rescheduled') + ' ' + _fmtDate(a.scheduled_for), cls: 'cdx-rel-date-remarcada' };
  if (status === 'scheduled')
    return { text: t('cohorts.date_scheduled') + ' ' + _fmtDate(a.scheduled_for), cls: 'cdx-rel-date-agendada' };
  return { text: t('cohorts.date_tbd'), cls: 'cdx-rel-date-adefinir' };
}

function _readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target.result;
      resolve(result.split(',')[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── IDs for pane elements (so we can querySelector safely) ──────────────────
// Concept A merges Clientes+Turmas into ONE grouped list; only `list`, the
// `search` box, and the new-client footer button remain. `aulasList` still
// names the aula sub-list rendered inside the dossier.
const IDS = {
  list:           'cdx-cohorts-list',
  search:         'cdx-cohorts-search',
  aulasList:      'cdx-aulas-list',
  btnNewClient:   'cdx-btn-new-client',
};

// ── DOM refs (set in mount after render) ────────────────────────────────────
function _q(id) { return _viewEl ? _viewEl.querySelector('#' + id) : null; }

// ── Modal helpers ────────────────────────────────────────────────────────────
// Delegated to the shared js/modal.js primitives. The Escape-key cleanup is now
// self-contained inside openModal/closeModal (no push to _cleanup needed).

function _openModal(html, opts) {
  return openModal(html, opts);
}

function _closeModal(bd) {
  closeModal(bd);
}

// ── Typed-name delete confirmation modal ─────────────────────────────────────

function _openDeleteConfirm(opts) {
  // opts: { title, warningHtml, confirmName, onConfirm }
  const html =
    '<div class="cdx-modal" style="max-width:440px">' +
      '<div class="cdx-modal-title">' + _esc(opts.title) + '</div>' +
      '<div class="cdx-danger-zone">' + opts.warningHtml + '</div>' +
      '<div class="cdx-field" style="margin-top:1rem">' +
        '<label>' + _esc(t('cohorts.confirm_type_name')) + ' <strong>' + _esc(opts.confirmName) + '</strong></label>' +
        '<input type="text" id="cdx-del-confirm-input" autocomplete="off" placeholder="">' +
      '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-del-cancel">' + t('cohorts.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-del-confirm" disabled>' + t('cohorts.delete_confirm_btn') + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html, { disableBackdropClose: true });
  const input = bd.querySelector('#cdx-del-confirm-input');
  const confirmBtn = bd.querySelector('#cdx-del-confirm');
  input.addEventListener('input', () => {
    confirmBtn.disabled = input.value.trim() !== opts.confirmName;
  });
  bd.querySelector('#cdx-del-cancel').addEventListener('click', () => _closeModal(bd));
  confirmBtn.addEventListener('click', () => {
    if (input.value.trim() !== opts.confirmName) return;
    _closeModal(bd);
    opts.onConfirm();
  });
}

// ── Archive confirmation modal ────────────────────────────────────────────────

function _openArchiveConfirm(opts) {
  // opts: { title, message, onConfirm }
  const html =
    '<div class="cdx-modal" style="max-width:400px">' +
      '<div class="cdx-modal-title">' + _esc(opts.title) + '</div>' +
      '<p style="margin:0 0 1.2rem;font-size:0.88rem;color:var(--text-secondary)">' + _esc(opts.message) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-arc-cancel">' + t('cohorts.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-arc-confirm">' + t('cohorts.archive') + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html);
  bd.querySelector('#cdx-arc-cancel').addEventListener('click', () => _closeModal(bd));
  bd.querySelector('#cdx-arc-confirm').addEventListener('click', () => {
    _closeModal(bd);
    opts.onConfirm();
  });
}

// ── Shell layout ─────────────────────────────────────────────────────────────

function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-three-pane">' +

      // Concept A: ONE list, turmas grouped under their client. Kept inside
      // .cdx-cohorts-nav so the mobile hamburger drawer (codex-topbar.js targets
      // that selector) still works; display:contents makes the inner pane the
      // real grid column on desktop.
      '<div class="cdx-cohorts-nav">' +
        '<div class="cdx-pane cdx-cohorts-listpane">' +
          '<div class="cdx-pane-header">' +
            '<input type="search" id="' + IDS.search + '" class="cdx-cohorts-search" placeholder="' + t('cohorts.search_turma') + '" autocomplete="off">' +
          '</div>' +
          '<div class="cdx-pane-body" id="' + IDS.list + '">' +
            '<div class="cdx-empty">' + t('cohorts.loading') + '</div>' +
          '</div>' +
          '<div class="cdx-cohorts-listfoot">' +
            '<button class="cdx-btn cdx-btn-sm cdx-btn-ghost" id="' + IDS.btnNewClient + '">' + t('cohorts.new_client') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // The turma DOSSIER (Concept A right pane). Surfaces the rich turma data the
      // Cursos model captures — linked course, dates, place, format — plus the
      // trilha link/actions, participants, aulas, and the cert shortcut.
      '<div class="cdx-pane cdx-doss-pane">' +
        '<div class="cdx-pane-body cdx-doss-body" id="cdx-turma-dossier">' +
          '<div class="cdx-empty">' + t('cohorts.select_turma_prompt') + '</div>' +
        '</div>' +
      '</div>' +

    '</div>';

  _q(IDS.btnNewClient).addEventListener('click', () => _openClientForm(null));
  // One delegated listener on the list container; innerHTML re-renders replace
  // only inner content, so the listener survives every re-render.
  _q(IDS.list).addEventListener('click', _onListClick);
  const searchEl = _q(IDS.search);
  if (searchEl) searchEl.addEventListener('input', () => { _turmaSearch = searchEl.value; _renderList(); });
}

// ── Merged list: clients + their turmas (Concept A) ───────────────────────────

// Load clients, then every client's turmas (the rich ct_list_turmas rows the
// dossier needs — ct_list_all_turmas lacks the course-instance columns), and
// render them as one grouped list. Re-binds the open dossier to the fresh turma
// object so edits/archives reflect; falls back to selecting the first turma.
function _loadAll() {
  const el = _q(IDS.list);
  if (el) el.innerHTML = '<div class="cdx-empty">' + t('cohorts.loading') + '</div>';
  api.listClients().then((data) => {
    _clients = data.clients || [];
    return Promise.all(_clients.map((c) =>
      api.listTurmas({ client_slug: c.slug }).then((d) => d.turmas || []).catch(() => [])
    ));
  }).then((lists) => {
    _turmas = lists.reduce((all, l) => all.concat(l), []);
    _renderList();
    const cur = _turmas.find((tm) => tm.client_slug === _relClientSlug && tm.slug === _relTurmaSlug && tm.status !== 'archived');
    if (cur) { _selectedClientSlug = cur.client_slug; _renderDossier(cur); }
    else { _relClientSlug = null; _relTurmaSlug = null; _autoSelectFirst(); }
  }).catch((e) => {
    if (window.bsLog) window.bsLog(t('cohorts.error_loading') + ': ' + (e && e.message || e), 'error');
    const el2 = _q(IDS.list);
    if (el2) el2.innerHTML = '<div class="cdx-empty">' + t('cohorts.error_loading') + '</div>';
  });
}

function _autoSelectFirst() {
  const first = _turmas.find((tm) => tm.status !== 'archived') || _turmas[0];
  if (first) _selectTurma(first.client_slug, first.slug);
  else {
    const el = _q('cdx-turma-dossier');
    if (el) el.innerHTML = '<div class="cdx-empty">' + t('cohorts.select_turma_prompt') + '</div>';
  }
}

function _initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (((w[0] || '')[0] || '') + ((w[1] || '')[0] || '')).toUpperCase();
}

// Derive a lifecycle phase from the turma's dates (the model has no explicit
// status beyond active/archived). Powers the colored dot in the list.
function _turmaPhase(tm) {
  if (tm.status === 'archived') return { cls: 'cdx-ph-arch', label: t('cohorts.archived') };
  const today = new Date().toISOString().slice(0, 10);
  const s = tm.date_start, e = tm.date_end;
  if (s && today < s) return { cls: 'cdx-ph-plan', label: t('cohorts.phase_planned') };
  if (e && today > e)  return { cls: 'cdx-ph-done', label: t('cohorts.phase_done') };
  if (s || e)          return { cls: 'cdx-ph-live', label: t('cohorts.phase_live') };
  return { cls: 'cdx-ph-none', label: '' };
}

function _renderList() {
  const el = _q(IDS.list);
  if (!el) return;
  const q = (_turmaSearch || '').trim().toLowerCase();
  const byClient = {};
  _turmas.forEach((tm) => { (byClient[tm.client_slug] = byClient[tm.client_slug] || []).push(tm); });
  const groups = _clients
    .filter((c) => c.status !== 'archived')
    .map((c) => {
      let turmas = byClient[c.slug] || [];
      if (q) turmas = turmas.filter((tm) =>
        String(tm.name || '').toLowerCase().includes(q) ||
        String(tm.display_name || '').toLowerCase().includes(q));
      return { client: c, turmas };
    });
  const visible = q ? groups.filter((g) => g.turmas.length) : groups;
  if (!visible.length) {
    el.innerHTML = '<div class="cdx-empty">' + t(q ? 'cohorts.no_search_results' : 'cohorts.no_clients') + '</div>';
    return;
  }
  el.innerHTML = visible.map((g) => _renderGroup(g.client, g.turmas)).join('');
}

function _renderGroup(client, turmas) {
  const name = client.display_name || client.name;
  const rows = turmas.length
    ? turmas.map((tm) => _renderTurmaRow(tm)).join('')
    : '<div class="cdx-cg-empty">' + t('cohorts.no_turmas') + '</div>';
  return (
    '<div class="cdx-cg" data-client-slug="' + _esc(client.slug) + '">' +
      '<div class="cdx-cg-head">' +
        '<span class="cdx-cg-ava">' + _esc(_initials(name)) + '</span>' +
        '<span class="cdx-cg-name">' + _esc(name) + '</span>' +
        '<span class="cdx-cg-acts">' +
          '<button type="button" class="cdx-cg-act" data-action="new-turma" data-client-slug="' + _esc(client.slug) + '" title="' + t('cohorts.new_turma') + '">+</button>' +
          '<button type="button" class="cdx-cg-act" data-action="edit-client" data-client-slug="' + _esc(client.slug) + '" title="' + t('cohorts.edit') + '">&#9881;</button>' +
        '</span>' +
      '</div>' +
      rows +
    '</div>'
  );
}

function _renderTurmaRow(tm) {
  const sel = (tm.client_slug === _relClientSlug && tm.slug === _relTurmaSlug) ? ' is-on' : '';
  const archived = tm.status === 'archived';
  const ph = _turmaPhase(tm);
  const course = tm.course_title ? _esc(tm.course_title) : t('cohorts.tf_no_course');
  const n = tm.aula_count || 0;
  const countLabel = n === 1 ? '1 ' + t('cohorts.aula_singular') : n + ' ' + t('cohorts.aula_plural');
  const archBadge = archived ? ' <span class="cdx-badge cdx-badge-archived">' + t('cohorts.archived') + '</span>' : '';
  return (
    '<div class="cdx-ti' + sel + (archived ? ' is-archived' : '') + '" data-client-slug="' + _esc(tm.client_slug) + '" data-turma-slug="' + _esc(tm.slug) + '">' +
      '<div class="cdx-ti-main">' +
        '<div class="cdx-ti-t">' + _esc(tm.name) + archBadge + '</div>' +
        '<div class="cdx-ti-s">' + course + ' &middot; ' + _esc(countLabel) + '</div>' +
      '</div>' +
      '<span class="cdx-ti-dot ' + ph.cls + '" title="' + _esc(ph.label) + '"></span>' +
    '</div>'
  );
}

function _onListClick(e) {
  const actBtn = e.target.closest('[data-action]');
  if (actBtn) {
    e.stopPropagation();
    const action = actBtn.dataset.action;
    const cs = actBtn.dataset.clientSlug;
    if (action === 'new-turma') { _selectedClientSlug = cs; _openTurmaForm(null); return; }
    if (action === 'edit-client') { const c = _clients.find((x) => x.slug === cs); if (c) _openClientForm(c); return; }
    return;
  }
  const row = e.target.closest('.cdx-ti');
  if (row) _selectTurma(row.dataset.clientSlug, row.dataset.turmaSlug);
}

function _archiveClient(slug) {
  _openArchiveConfirm({
    title: t('cohorts.archive_client_title'),
    message: t('cohorts.archive_client_msg'),
    onConfirm() {
      api.archiveClient({ slug }).then(() => {
        _toast(t('cohorts.client_archived'));
        _loadAll();
      }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
    }
  });
}

// ── Client form ───────────────────────────────────────────────────────────────

function _openClientForm(client) {
  const isEdit = !!client;
  const currentIconPath = isEdit ? (client.icon_path || '') : '';
  let iconPreviewHtml = '';
  if (currentIconPath) {
    const src = _iconSrc(currentIconPath);
    iconPreviewHtml =
      '<div class="cdx-icon-preview-row">' +
        '<img class="cdx-icon-preview" src="' + _esc(src) + '" alt="' + t('cohorts.icon_current') + '">' +
        '<span class="cdx-helper-text">' + t('cohorts.icon_current') + '</span>' +
      '</div>' +
      '<div class="cdx-icon-preview-row" id="cdx-cf-new-preview-row" style="display:none">' +
        '<img id="cdx-cf-new-preview-img" class="cdx-icon-preview" src="" alt="' + t('cohorts.icon_preview') + '">' +
        '<span class="cdx-helper-text">' + t('cohorts.icon_new') + '</span>' +
      '</div>';
  } else {
    iconPreviewHtml =
      '<div class="cdx-icon-preview-row" id="cdx-cf-new-preview-row" style="display:none">' +
        '<img id="cdx-cf-new-preview-img" class="cdx-icon-preview" src="" alt="' + t('cohorts.icon_preview') + '">' +
        '<span class="cdx-helper-text">' + t('cohorts.icon_preview') + '</span>' +
      '</div>';
  }

  const archiveBtn = (isEdit && client.status !== 'archived')
    ? '<button class="cdx-btn" id="cdx-cf-archive" type="button" style="margin-right:.5rem">' + t('cohorts.archive') + '</button>'
    : '';
  const deleteBlock = isEdit
    ? '<div class="cdx-danger-zone" style="margin-top:1.25rem">' +
        '<div class="cdx-danger-zone-label">' + t('cohorts.danger_zone') + '</div>' +
        archiveBtn +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-cf-delete" type="button">' + t('cohorts.delete_client_btn') + '</button>' +
        '<p class="cdx-helper-text">' + t('cohorts.delete_client_warning') + '</p>' +
      '</div>'
    : '';

  const html =
    '<div class="cdx-modal" style="max-width:500px">' +
      '<div class="cdx-modal-title">' + (isEdit ? t('cohorts.edit_client') : t('cohorts.new_client_title')) + '</div>' +
      '<div class="cdx-field"><label>' + t('cohorts.field_name_internal') + '</label>' +
        '<input type="text" id="cdx-cf-name" value="' + _esc(isEdit ? client.name : '') + '" placeholder="' + t('cohorts.field_name_placeholder') + '">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('cohorts.field_display_name') + '</label>' +
        '<input type="text" id="cdx-cf-display" value="' + _esc(isEdit ? (client.display_name || '') : '') + '" placeholder="' + t('cohorts.field_display_placeholder') + '">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('cohorts.field_icon') + '</label>' +
        iconPreviewHtml +
        '<div class="cdx-icon-mode-row">' +
          '<label><input type="radio" name="cdx-cf-icon-mode" value="url" id="cdx-cf-icon-mode-url"> ' + t('cohorts.icon_mode_url') + '</label>' +
          '<label><input type="radio" name="cdx-cf-icon-mode" value="upload" id="cdx-cf-icon-mode-upload" checked> ' + t('cohorts.icon_mode_upload') + '</label>' +
        '</div>' +
        '<div id="cdx-cf-icon-url-wrap" style="display:none">' +
          '<input type="text" id="cdx-cf-icon-url" placeholder="https://..." value="">' +
        '</div>' +
        '<div id="cdx-cf-icon-file-wrap">' +
          '<input type="file" id="cdx-cf-icon-file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml">' +
          '<div class="cdx-file-error" id="cdx-cf-icon-file-error" style="display:none"></div>' +
        '</div>' +
      '</div>' +
      deleteBlock +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-cf-cancel">' + t('cohorts.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-cf-save">' + (isEdit ? t('cohorts.save') : t('cohorts.create')) + '</button>' +
      '</div>' +
    '</div>';

  const bd = _openModal(html);

  // Icon mode toggle
  const modeUrl    = bd.querySelector('#cdx-cf-icon-mode-url');
  const modeUpload = bd.querySelector('#cdx-cf-icon-mode-upload');
  const urlWrap    = bd.querySelector('#cdx-cf-icon-url-wrap');
  const fileWrap   = bd.querySelector('#cdx-cf-icon-file-wrap');
  modeUrl.addEventListener('change', () => { urlWrap.style.display = ''; fileWrap.style.display = 'none'; });
  modeUpload.addEventListener('change', () => { urlWrap.style.display = 'none'; fileWrap.style.display = ''; });

  // File validation + preview
  const fileErrEl  = bd.querySelector('#cdx-cf-icon-file-error');
  const previewImg = bd.querySelector('#cdx-cf-new-preview-img');
  const previewRow = bd.querySelector('#cdx-cf-new-preview-row');
  bd.querySelector('#cdx-cf-icon-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    fileErrEl.style.display = 'none';
    fileErrEl.textContent = '';
    if (!file) return;
    if (file.size > 1024 * 1024) {
      fileErrEl.textContent = t('cohorts.icon_too_large');
      fileErrEl.style.display = '';
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (previewImg) { previewImg.src = ev.target.result; }
      if (previewRow) previewRow.style.display = '';
    };
    reader.readAsDataURL(file);
  });

  bd.querySelector('#cdx-cf-cancel').addEventListener('click', () => _closeModal(bd));

  // Archive + delete buttons (edit only)
  if (isEdit) {
    const archBtn = bd.querySelector('#cdx-cf-archive');
    if (archBtn) archBtn.addEventListener('click', () => {
      _closeModal(bd);
      _archiveClient(client.slug);
    });
    bd.querySelector('#cdx-cf-delete').addEventListener('click', () => {
      _closeModal(bd);
      _openDeleteConfirm({
        title: t('cohorts.delete_client_btn'),
        warningHtml: '<p style="font-size:0.85rem;color:var(--text-secondary);margin:0">' + t('cohorts.delete_client_warning') + '</p>',
        confirmName: client.name,
        onConfirm() {
          api.deleteClient({ slug: client.slug }).then(() => {
            _toast(t('cohorts.client_deleted'));
            if (_relClientSlug === client.slug) { _relClientSlug = null; _relTurmaSlug = null; }
            if (_selectedClientSlug === client.slug) _selectedClientSlug = null;
            _loadAll();
          }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
        }
      });
    });
  }

  // Save button
  bd.querySelector('#cdx-cf-save').addEventListener('click', () => {
    const name    = bd.querySelector('#cdx-cf-name').value.trim();
    const display = bd.querySelector('#cdx-cf-display').value.trim();
    if (!name) { _toast(t('cohorts.name_required')); return; }
    const slug = isEdit ? client.slug : _slugify(name);
    if (!slug) { _toast(t('cohorts.slug_invalid')); return; }

    const iconMode = bd.querySelector('input[name="cdx-cf-icon-mode"]:checked').value;
    const iconUrl  = bd.querySelector('#cdx-cf-icon-url').value.trim();
    const iconFile = bd.querySelector('#cdx-cf-icon-file').files[0];

    const params = { name, display_name: display || null, slug };
    const call = isEdit ? api.updateClient(params) : api.createClient(params);

    call.then(() => {
      if (iconMode === 'url' && iconUrl) {
        return api.setClientIcon({ slug, mode: 'url', value: iconUrl });
      } else if (iconMode === 'upload' && iconFile) {
        return _readFileAsBase64(iconFile).then(b64 =>
          api.setClientIcon({ slug, mode: 'upload', value: b64, filename: iconFile.name })
        );
      }
      return Promise.resolve();
    }).then(() => {
      _closeModal(bd);
      _toast(isEdit ? t('cohorts.client_updated') : t('cohorts.client_created'));
      _loadAll();
    }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
  });
}

// ── Turma actions (invoked from the dossier) ──────────────────────────────────
// The turma list rows are minimal (Concept A); per-turma actions live in the
// dossier and reuse these helpers. They reload the whole merged list so the
// row's derived state + the dossier both refresh.

function _archiveTurma(clientSlug, turmaSlug) {
  _openArchiveConfirm({
    title: t('cohorts.archive_turma_title'),
    message: t('cohorts.archive_turma_msg'),
    onConfirm() {
      api.archiveTurma({ client_slug: clientSlug, slug: turmaSlug }).then(() => {
        _toast(t('cohorts.turma_archived'));
        if (_relClientSlug === clientSlug && _relTurmaSlug === turmaSlug) { _relClientSlug = null; _relTurmaSlug = null; }
        _loadAll();
      }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
    }
  });
}

function _regenToken(clientSlug, turmaSlug) {
  _openArchiveConfirm({
    title: t('cohorts.regen_token_title'),
    message: t('cohorts.regen_token_msg'),
    onConfirm() {
      api.regenTurmaToken({ client_slug: clientSlug, slug: turmaSlug }).then(() => {
        _toast(t('cohorts.token_regenerated'));
        _loadAll();
      }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
    }
  });
}

function _copyUrl(url) {
  navigator.clipboard.writeText(url)
    .then(() => _toast(t('cohorts.link_copied')))
    .catch(() => _toast(t('cohorts.copy_failed') + ': ' + url));
}

// ── Turma form ────────────────────────────────────────────────────────────────

const _TF_FORMATS = ['presencial', 'online', 'hibrido'];
const _TF_MODALITIES = ['fechada', 'aberta'];

function _openTurmaForm(turma) {
  const isEdit = !!turma;
  _pickedCourse = null;

  const load = Promise.all([
    _cpSessions.length
      ? Promise.resolve()
      : cpApi.listSessions().then(d => { _cpSessions = (d && d.sessions) || []; }).catch((e) => { if (window.bsLog) window.bsLog('cohorts: list sessions failed: ' + (e && e.message || e), 'error'); }),
    coursesApi.list().then(d => { _turmaCourses = (d && d.courses) || []; }).catch(() => {}),
  ]);

  load.then(() => {
    const cpOptions = '<option value="">' + t('cohorts.none') + '</option>' +
      _cpSessions.map(s => {
        const sel = (isEdit && turma.classpulse_session_id === s.id) ? ' selected' : '';
        return '<option value="' + _esc(s.id) + '"' + sel + '>' + _esc(s.name) + '</option>';
      }).join('');

    const courseOptions = '<option value="">' + t('cohorts.tf_no_course') + '</option>' +
      _turmaCourses.map(c => {
        const sel = (isEdit && String(turma.course_id || '') === String(c.id)) ? ' selected' : '';
        return '<option value="' + _esc(String(c.id)) + '"' + sel + '>' + _esc(c.title) + '</option>';
      }).join('');

    const selOptions = (keys, prefix, cur) => '<option value="">' + t('cohorts.none') + '</option>' +
      keys.map(k => '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + t(prefix + k) + '</option>').join('');
    const formatOptions = selOptions(_TF_FORMATS, 'cohorts.fmt_', isEdit ? turma.format : '');
    const modalityOptions = selOptions(_TF_MODALITIES, 'cohorts.mod_', isEdit ? turma.modality : '');
    const v = (key) => _esc(isEdit && turma[key] != null ? turma[key] : '');

    const html =
      '<div class="cdx-modal" style="max-width:600px;max-height:90vh;overflow-y:auto">' +
        '<div class="cdx-modal-title">' + (isEdit ? t('cohorts.edit_turma') : t('cohorts.new_turma_title')) + '</div>' +
        '<div class="cdx-field"><label>' + t('cohorts.field_name_internal') + '</label>' +
          '<input type="text" id="cdx-tf-name" value="' + _esc(isEdit ? turma.name : '') + '" placeholder="' + t('cohorts.turma_name_placeholder') + '">' +
        '</div>' +
        '<div class="cdx-field"><label>' + t('cohorts.field_display_name') + '</label>' +
          '<input type="text" id="cdx-tf-display" value="' + _esc(isEdit ? (turma.display_name || '') : '') + '" placeholder="' + t('cohorts.field_display_placeholder') + '">' +
        '</div>' +
        // ── Course + instance data (seeds the certificate) ──
        '<div class="cdx-tf-section">' + t('cohorts.tf_section_course') + '</div>' +
        '<div class="cdx-field"><label>' + t('cohorts.tf_course') + '</label>' +
          '<select id="cdx-tf-course">' + courseOptions + '</select>' +
          '<small class="cdx-field-hint">' + t('cohorts.tf_course_hint') + '</small>' +
        '</div>' +
        '<div class="cdx-tf-grid">' +
          '<div class="cdx-field"><label>' + t('cohorts.course_hours_label') + '</label>' +
            '<input type="text" id="cdx-tf-hours" value="' + v('hours') + '" placeholder="' + t('cohorts.course_hours_ph') + '"></div>' +
          '<div class="cdx-field"><label>' + t('cohorts.tf_meetings') + '</label>' +
            '<input type="text" id="cdx-tf-meetings" value="' + v('meetings') + '" placeholder="' + t('cohorts.tf_meetings_ph') + '"></div>' +
          '<div class="cdx-field"><label>' + t('cohorts.tf_date_start') + '</label>' +
            '<input type="date" id="cdx-tf-date-start" value="' + v('date_start') + '"></div>' +
          '<div class="cdx-field"><label>' + t('cohorts.tf_date_end') + '</label>' +
            '<input type="date" id="cdx-tf-date-end" value="' + v('date_end') + '"></div>' +
          '<div class="cdx-field"><label>' + t('cohorts.tf_format') + '</label>' +
            '<select id="cdx-tf-format">' + formatOptions + '</select></div>' +
          '<div class="cdx-field"><label>' + t('cohorts.tf_modality') + '</label>' +
            '<select id="cdx-tf-modality">' + modalityOptions + '</select></div>' +
        '</div>' +
        '<div class="cdx-field"><label>' + t('cohorts.tf_place') + '</label>' +
          '<input type="text" id="cdx-tf-place" value="' + v('place') + '" placeholder="' + t('cohorts.tf_place_ph') + '"></div>' +
        // ── Links ──
        '<div class="cdx-tf-section">' + t('cohorts.tf_section_links') + '</div>' +
        '<div class="cdx-field"><label>' + t('cohorts.field_whatsapp') + '</label>' +
          '<input type="text" id="cdx-tf-whatsapp" value="' + _esc(isEdit ? (turma.whatsapp_url || '') : '') + '" placeholder="https://chat.whatsapp.com/...">' +
        '</div>' +
        '<div class="cdx-field"><label>' + t('cohorts.field_classpulse') + '</label>' +
          '<select id="cdx-tf-classpulse">' + cpOptions + '</select>' +
        '</div>' +
        '<div class="cdx-modal-actions">' +
          '<button class="cdx-btn" id="cdx-tf-cancel">' + t('cohorts.cancel') + '</button>' +
          '<button class="cdx-btn cdx-btn-primary" id="cdx-tf-save">' + (isEdit ? t('cohorts.save') : t('cohorts.create')) + '</button>' +
        '</div>' +
      '</div>';

    const bd = _openModal(html);
    bd.querySelector('#cdx-tf-cancel').addEventListener('click', () => _closeModal(bd));

    // Course picker pre-fill (decision 1d): selecting a course seeds the turma's
    // hours from the course, without clobbering a value already typed. The full
    // course (with its ementa) is fetched so save can copy it into the turma.
    const courseEl = bd.querySelector('#cdx-tf-course');
    const hoursEl = bd.querySelector('#cdx-tf-hours');
    courseEl.addEventListener('change', () => {
      _pickedCourse = null;
      const cid = courseEl.value ? Number(courseEl.value) : null;
      if (!cid) return;
      const fromList = _turmaCourses.find(c => c.id === cid);
      if (fromList && fromList.hours && !hoursEl.value.trim()) hoursEl.value = fromList.hours;
      coursesApi.get({ id: cid }).then(d => {
        _pickedCourse = (d && d.course) || null;
        if (_pickedCourse && _pickedCourse.hours && !hoursEl.value.trim()) hoursEl.value = _pickedCourse.hours;
      }).catch(() => {});
    });

    bd.querySelector('#cdx-tf-save').addEventListener('click', () => {
      const name      = bd.querySelector('#cdx-tf-name').value.trim();
      const display   = bd.querySelector('#cdx-tf-display').value.trim();
      const whatsapp  = bd.querySelector('#cdx-tf-whatsapp').value.trim();
      const cpSession = bd.querySelector('#cdx-tf-classpulse').value;
      if (!name) { _toast(t('cohorts.name_required')); return; }

      const slug = isEdit ? turma.slug : _slugify(name);
      if (!slug) { _toast(t('cohorts.slug_invalid')); return; }

      const courseId = courseEl.value ? Number(courseEl.value) : null;
      const instance = {
        course_id: courseId,
        hours: hoursEl.value.trim() || null,
        meetings: bd.querySelector('#cdx-tf-meetings').value.trim() || null,
        date_start: bd.querySelector('#cdx-tf-date-start').value || null,
        date_end: bd.querySelector('#cdx-tf-date-end').value || null,
        format: bd.querySelector('#cdx-tf-format').value || null,
        modality: bd.querySelector('#cdx-tf-modality').value || null,
        place: bd.querySelector('#cdx-tf-place').value.trim() || null,
      };
      // Copy the course ementa into the turma's own copy only when the course is
      // newly linked or changed (so a turma's later edits are never clobbered).
      const prevCourseId = isEdit ? (turma.course_id || null) : null;
      if (courseId && courseId !== prevCourseId && _pickedCourse && _pickedCourse.id === courseId) {
        instance.ementa_json = _pickedCourse.ementa_json || null;
      }

      const baseParams = { client_slug: _selectedClientSlug, name, display_name: display || null, slug };
      const firstCall = isEdit
        ? api.updateTurma(Object.assign({}, baseParams, instance))
        : api.createTurma(baseParams);

      firstCall
        .then(() => isEdit
          ? null
          : api.updateTurma(Object.assign({ client_slug: _selectedClientSlug, slug }, instance)))
        .then(() => {
          const metaChanged = isEdit && (
            whatsapp !== (turma.whatsapp_url || '') ||
            cpSession !== (String(turma.classpulse_session_id || ''))
          );
          const needMeta = isEdit ? metaChanged : !!(whatsapp || cpSession);
          if (needMeta) {
            return api.updateTurmaMeta({
              client_slug: _selectedClientSlug,
              slug: isEdit ? turma.slug : slug,
              whatsapp_url: whatsapp || null,
              classpulse_session_id: cpSession || null,
            });
          }
          return Promise.resolve();
        }).then(() => {
          _closeModal(bd);
          _toast(isEdit ? t('cohorts.turma_updated') : t('cohorts.turma_created'));
          // Keep the dossier pointed at the just-saved turma after the reload.
          _relClientSlug = _selectedClientSlug;
          _relTurmaSlug = isEdit ? turma.slug : slug;
          _loadAll();
        }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
    });
  });
}

// ── Roster (Participantes) ────────────────────────────────────────────────────

function _renderRosterTable(participants) {
  if (!participants.length) {
    return '<p class="cdx-roster-empty">' + t('cohorts.participants_empty') + '</p>';
  }
  return (
    '<table class="cdx-roster-table">' +
      '<thead>' +
        '<tr>' +
          '<th>' + t('cohorts.participant_name') + '</th>' +
          '<th>' + t('cohorts.participant_email') + '</th>' +
          '<th>' + t('cohorts.participant_cpf') + '</th>' +
          '<th></th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        participants.map((p) => {
          const tier = participantTier(p);
          const badge = '<span class="' + _esc(tierBadgeClass(tier)) + '" title="' + _esc(t(tierTitleKey(tier))) + '">' + _esc(t(tierLabelKey(tier))) + '</span>';
          return (
          '<tr data-pid="' + _esc(String(p.id)) + '">' +
            '<td class="cdx-roster-cell-name">' + _esc(p.name) + ' ' + badge + '</td>' +
            '<td class="cdx-roster-cell-email">' + _esc(p.email || '') + '</td>' +
            '<td class="cdx-roster-cell-cpf">' + _esc(p.cpf || '') + '</td>' +
            '<td class="cdx-roster-cell-actions">' +
              '<button type="button" class="cdx-btn cdx-btn-sm cdx-roster-edit-btn" data-action="roster-edit" data-pid="' + _esc(String(p.id)) + '">' + t('cohorts.edit') + '</button>' +
              '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-danger cdx-roster-del-btn" data-action="roster-delete" data-pid="' + _esc(String(p.id)) + '">' + t('cohorts.delete') + '</button>' +
            '</td>' +
          '</tr>'
          );
        }).join('') +
      '</tbody>' +
    '</table>'
  );
}

function _openRosterModal(turma) {
  // Build the modal shell. The participant list will be filled after the API call.
  const modalHtml =
    '<div class="cdx-modal cdx-roster-modal" style="max-width:680px;max-height:88vh;overflow-y:auto">' +
      '<div class="cdx-modal-title">' +
        _esc(t('cohorts.participants_title') + ': ' + (turma.display_name || turma.name)) +
      '</div>' +

      // List area
      '<div id="cdx-roster-list">' +
        '<p class="cdx-roster-empty">' + t('cohorts.loading') + '</p>' +
      '</div>' +

      // Add participant form
      '<details class="cdx-roster-section" id="cdx-roster-add-section">' +
        '<summary class="cdx-roster-section-title">' + t('cohorts.participants_add') + '</summary>' +
        '<div class="cdx-roster-add-form">' +
          '<div class="cdx-field">' +
            '<label>' + t('cohorts.participant_name') + ' <span class="cdx-required">*</span></label>' +
            '<input type="text" id="cdx-roster-add-name" autocomplete="off" placeholder="' + t('cohorts.participant_name_ph') + '">' +
          '</div>' +
          '<div class="cdx-roster-two-col">' +
            '<div class="cdx-field">' +
              '<label>' + t('cohorts.participant_email') + '</label>' +
              '<input type="text" id="cdx-roster-add-email" autocomplete="off" placeholder="' + t('cohorts.participant_email_ph') + '">' +
            '</div>' +
            '<div class="cdx-field">' +
              '<label>' + t('cohorts.participant_cpf') + '</label>' +
              '<input type="text" id="cdx-roster-add-cpf" autocomplete="off" placeholder="' + t('cohorts.participant_cpf_ph') + '">' +
            '</div>' +
          '</div>' +
          '<div class="cdx-modal-actions cdx-roster-add-actions">' +
            '<button type="button" class="cdx-btn cdx-btn-primary" id="cdx-roster-add-btn">' + t('cohorts.participants_add_btn') + '</button>' +
          '</div>' +
        '</div>' +
      '</details>' +

      // Bulk import form
      '<details class="cdx-roster-section" id="cdx-roster-import-section">' +
        '<summary class="cdx-roster-section-title">' + t('cohorts.participants_import') + '</summary>' +
        '<div class="cdx-roster-import-form">' +
          '<p class="cdx-helper-text">' + t('cohorts.participants_import_hint') + '</p>' +
          '<textarea id="cdx-roster-import-text" class="cdx-roster-import-textarea" placeholder="' + t('cohorts.participants_import_ph') + '" rows="6"></textarea>' +
          '<div class="cdx-modal-actions cdx-roster-import-actions">' +
            '<button type="button" class="cdx-btn cdx-btn-primary" id="cdx-roster-import-btn">' + t('cohorts.participants_import_btn') + '</button>' +
          '</div>' +
        '</div>' +
      '</details>' +

      '<div class="cdx-modal-actions" style="margin-top:1rem">' +
        '<button type="button" class="cdx-btn" id="cdx-roster-close">' + t('cohorts.close') + '</button>' +
      '</div>' +
    '</div>';

  const bd = _openModal(modalHtml, { disableBackdropClose: false });

  // Wire close button
  bd.querySelector('#cdx-roster-close').addEventListener('click', () => _closeModal(bd));

  // State for the in-modal edit form
  let _participants = [];

  // Refresh participant list
  function _loadRoster() {
    const listEl = bd.querySelector('#cdx-roster-list');
    if (listEl) listEl.innerHTML = '<p class="cdx-roster-empty">' + t('cohorts.loading') + '</p>';
    api.listParticipants({ turma_id: turma.id }).then((data) => {
      _participants = (data && data.participants) || [];
      const listEl2 = bd.querySelector('#cdx-roster-list');
      if (listEl2) listEl2.innerHTML = _renderRosterTable(_participants);
      _wireRosterTableEvents();
    }).catch((err) => {
      const listEl2 = bd.querySelector('#cdx-roster-list');
      if (listEl2) listEl2.innerHTML = '<p class="cdx-roster-empty">' + _esc(t('cohorts.error_loading')) + '</p>';
      if (window.bsLog) window.bsLog(t('cohorts.error_loading') + ': ' + (err && err.message || err), 'error');
    });
  }

  function _wireRosterTableEvents() {
    const listEl = bd.querySelector('#cdx-roster-list');
    if (!listEl) return;

    listEl.querySelectorAll('[data-action="roster-delete"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        const participant = _participants.find((p) => String(p.id) === String(pid));
        if (!participant) return;
        _openArchiveConfirm({
          title: t('cohorts.participants_delete_title'),
          message: t('cohorts.participants_delete_msg') + ' "' + participant.name + '"?',
          onConfirm() {
            api.deleteParticipant({ id: pid }).then(() => {
              _toast(t('cohorts.participant_deleted'));
              _loadRoster();
            }).catch((err) => {
              _toastError(t('cohorts.error') + ': ' + (err && err.message || err));
              if (window.bsLog) window.bsLog(t('cohorts.error') + ': ' + (err && err.message || err), 'error');
            });
          }
        });
      });
    });

    listEl.querySelectorAll('[data-action="roster-edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        const participant = _participants.find((p) => String(p.id) === String(pid));
        if (!participant) return;
        _openParticipantEditModal(participant, () => _loadRoster());
      });
    });
  }

  // Wire add form
  bd.querySelector('#cdx-roster-add-btn').addEventListener('click', () => {
    const nameEl  = bd.querySelector('#cdx-roster-add-name');
    const emailEl = bd.querySelector('#cdx-roster-add-email');
    const cpfEl   = bd.querySelector('#cdx-roster-add-cpf');
    const name  = nameEl.value.trim();
    const email = emailEl.value.trim() || null;
    const cpf   = cpfEl.value.trim() || null;
    if (!name) { _toast(t('cohorts.name_required')); nameEl.focus(); return; }
    api.addParticipant({ turma_id: turma.id, name, email, cpf }).then(() => {
      _toast(t('cohorts.participant_added'));
      nameEl.value  = '';
      emailEl.value = '';
      cpfEl.value   = '';
      _loadRoster();
    }).catch((err) => {
      _toastError(t('cohorts.error') + ': ' + (err && err.message || err));
      if (window.bsLog) window.bsLog(t('cohorts.error') + ': ' + (err && err.message || err), 'error');
    });
  });

  // Wire bulk import
  bd.querySelector('#cdx-roster-import-btn').addEventListener('click', () => {
    const textEl = bd.querySelector('#cdx-roster-import-text');
    const text = textEl.value;
    const rows = parseRosterLines(text);
    if (!rows.length) { _toast(t('cohorts.participants_import_empty')); return; }
    api.importParticipants({ turma_id: turma.id, rows }).then(() => {
      _toast(t('cohorts.participants_imported').replace('{n}', String(rows.length)));
      textEl.value = '';
      const section = bd.querySelector('#cdx-roster-import-section');
      if (section) section.removeAttribute('open');
      _loadRoster();
    }).catch((err) => {
      _toastError(t('cohorts.error') + ': ' + (err && err.message || err));
      if (window.bsLog) window.bsLog(t('cohorts.error') + ': ' + (err && err.message || err), 'error');
    });
  });

  // Initial load
  _loadRoster();
}

function _openParticipantEditModal(participant, onSaved) {
  const html =
    '<div class="cdx-modal" style="max-width:480px">' +
      '<div class="cdx-modal-title">' + t('cohorts.participant_edit_title') + '</div>' +
      '<div class="cdx-field"><label>' + t('cohorts.participant_name') + ' <span class="cdx-required">*</span></label>' +
        '<input type="text" id="cdx-pe-name" value="' + _esc(participant.name) + '">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('cohorts.participant_email') + '</label>' +
        '<input type="text" id="cdx-pe-email" value="' + _esc(participant.email || '') + '" placeholder="' + t('cohorts.participant_email_ph') + '">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('cohorts.participant_cpf') + '</label>' +
        '<input type="text" id="cdx-pe-cpf" value="' + _esc(participant.cpf || '') + '" placeholder="' + t('cohorts.participant_cpf_ph') + '">' +
      '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-pe-cancel">' + t('cohorts.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-pe-save">' + t('cohorts.save') + '</button>' +
      '</div>' +
    '</div>';

  const bd = _openModal(html);
  bd.querySelector('#cdx-pe-cancel').addEventListener('click', () => _closeModal(bd));
  bd.querySelector('#cdx-pe-save').addEventListener('click', () => {
    const name  = bd.querySelector('#cdx-pe-name').value.trim();
    const email = bd.querySelector('#cdx-pe-email').value.trim() || null;
    const cpf   = bd.querySelector('#cdx-pe-cpf').value.trim() || null;
    if (!name) { _toast(t('cohorts.name_required')); bd.querySelector('#cdx-pe-name').focus(); return; }
    api.updateParticipant({ id: participant.id, name, email, cpf }).then(() => {
      _closeModal(bd);
      _toast(t('cohorts.participant_updated'));
      if (onSaved) onSaved();
    }).catch((err) => {
      _toastError(t('cohorts.error') + ': ' + (err && err.message || err));
      if (window.bsLog) window.bsLog(t('cohorts.error') + ': ' + (err && err.message || err), 'error');
    });
  });
}

// ── Turma selection (drives the dossier) ──────────────────────────────────────

function _selectTurma(clientSlug, turmaSlug) {
  if (!clientSlug || !turmaSlug) return;
  if (clientSlug === _relClientSlug && turmaSlug === _relTurmaSlug) return;
  _relClientSlug = clientSlug;
  _relTurmaSlug = turmaSlug;
  _selectedClientSlug = clientSlug; // new-turma / form context follows the selection
  const turma = _turmas.find((x) => x.client_slug === clientSlug && x.slug === turmaSlug);
  _renderDossier(turma);
  _renderList();
}

// ── Turma dossier (Concept A: the rich right-pane detail) ─────────────────────

function _fmtDateBr(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}

function _renderDossier(turma) {
  const el = _q('cdx-turma-dossier');
  if (!el) return;
  if (!turma) { el.innerHTML = '<div class="cdx-empty">' + t('cohorts.select_turma_prompt') + '</div>'; return; }

  const client = _clients.find((c) => c.slug === turma.client_slug) || {};
  const clientName = client.display_name || client.name || turma.client_slug;
  const modLabel = turma.modality ? t('cohorts.mod_' + turma.modality) : '';
  const fmtLabel = turma.format ? t('cohorts.fmt_' + turma.format) : '';
  const sub = clientName + (modLabel ? ' · ' + modLabel : '');
  const fact = (label, val) =>
    '<div class="cdx-doss-fact"><label>' + _esc(label) + '</label><div class="v">' + (val ? _esc(val) : '—') + '</div></div>';

  // #27: Carga horária = SUM(aula.hours), Encontros = COUNT(aulas), período =
  // span of the aula dates — all DERIVED from the aulas (worker ct_list_turmas).
  // Falls back to the legacy manual fields for turmas with no per-aula hours yet.
  const _num = (v) => (v != null && Number(v) > 0);
  // Bare number under the "Carga horária" label (no new i18n unit key needed; the
  // certificate itself renders the full "N horas"). Falls back to legacy manual hours.
  const cargaDerived = _num(turma.carga_horaria) ? String(turma.carga_horaria) : (turma.hours || '');
  const encontrosDerived = _num(turma.aula_count) ? String(turma.aula_count) : (turma.meetings || '');
  const dStart = _fmtDateBr(turma.computed_date_start || turma.date_start);
  const dEnd = _fmtDateBr(turma.computed_date_end || turma.date_end);
  // A bare-number fact with a stable id, so an aula-hours edit can refresh it live.
  const factId = (id, label, val) =>
    '<div class="cdx-doss-fact"><label>' + _esc(label) + '</label><div class="v" id="' + id + '">' + (val ? _esc(val) : '—') + '</div></div>';
  const courseVal = turma.course_title
    ? _esc(turma.course_title)
    : '<button class="cdx-doss-linkbtn" data-doss="edit">' + _esc(t('cohorts.tf_no_course')) + '</button>';
  const ph = _turmaPhase(turma);
  const archived = turma.status === 'archived';
  const url = turma.token ? _turmaUrl(turma.client_slug, turma.slug, turma.token) : null;
  const linksRow =
    '<div class="cdx-doss-links">' +
      (url
        ? '<button type="button" class="cdx-doss-url" data-doss="copyurl" data-url="' + _esc(url) + '" title="' + _esc(t('cohorts.copy_url')) + '">' + _esc(url) + '</button>' +
          '<a class="cdx-doss-urlbtn" href="' + _esc(url) + '" target="_blank" rel="noopener" title="' + _esc(t('cohorts.open_url')) + '">&#8599;</a>' +
          '<button type="button" class="cdx-doss-urlbtn" data-doss="regen" title="' + _esc(t('cohorts.regen_token_title')) + '">&#8635;</button>'
        : '<span class="cdx-empty">' + _esc(t('cohorts.url_unavailable')) + '</span>') +
      (turma.whatsapp_url ? '<a class="cdx-doss-walink" href="' + _esc(turma.whatsapp_url) + '" target="_blank" rel="noopener">' + _esc(t('cohorts.whatsapp_open')) + '</a>' : '') +
    '</div>';

  el.innerHTML =
    '<div class="cdx-doss">' +
      '<div class="cdx-doss-head">' +
        '<div><h2 class="cdx-doss-title">' + _esc(turma.name) + '</h2>' +
          '<div class="cdx-doss-sub">' + _esc(sub) + '</div></div>' +
        '<div class="cdx-doss-headright">' +
          (ph.label ? '<span class="cdx-doss-pill ' + ph.cls + '">' + _esc(ph.label) + '</span>' : '') +
          '<div class="cdx-doss-actions">' +
            '<button class="cdx-btn cdx-btn-sm" data-doss="edit">' + _esc(t('cohorts.edit')) + '</button>' +
            (archived ? '' : '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-doss="archive">' + _esc(t('cohorts.archive')) + '</button>') +
          '</div>' +
        '</div>' +
      '</div>' +
      linksRow +
      '<div class="cdx-doss-facts">' +
        '<div class="cdx-doss-fact cdx-doss-fact--course"><label>' + _esc(t('cohorts.tf_course')) + '</label><div class="v">' + courseVal + '</div></div>' +
        factId('cdx-doss-carga', t('cohorts.course_hours_label'), cargaDerived) +
        factId('cdx-doss-encontros', t('cohorts.tf_meetings'), encontrosDerived) +
        fact(t('cohorts.tf_date_start'), dStart) +
        fact(t('cohorts.tf_date_end'), dEnd) +
        fact(t('cohorts.tf_format'), fmtLabel) +
        fact(t('cohorts.tf_place'), turma.place) +
      '</div>' +
      // Participantes
      '<div class="cdx-doss-sec">' +
        '<div class="cdx-doss-sec-h"><b>' + _esc(t('cohorts.participants_title')) + '</b>' +
          '<button class="cdx-btn cdx-btn-sm" data-doss="roster">' + _esc(t('cohorts.participants_btn')) + '</button></div>' +
        '<div id="cdx-doss-participants"><span class="cdx-empty">' + _esc(t('cohorts.loading')) + '</span></div>' +
      '</div>' +
      // Aulas (reuses the aula editor via #cdx-aulas-list)
      '<div class="cdx-doss-sec">' +
        '<div class="cdx-doss-sec-h"><b>' + _esc(t('cohorts.col_aulas')) + '</b></div>' +
        '<div id="' + IDS.aulasList + '"><div class="cdx-empty">' + _esc(t('cohorts.loading_aulas')) + '</div></div>' +
      '</div>' +
      // Certificados
      '<div class="cdx-doss-sec">' +
        '<div class="cdx-doss-sec-h"><b>' + _esc(t('cohorts.doss_certs')) + '</b>' +
          '<a class="cdx-btn cdx-btn-sm cdx-btn-primary" href="/codex/?tab=certificates&sub=emitidos">' + _esc(t('cohorts.doss_emit')) + '</a></div>' +
        '<div id="cdx-doss-certs"><span class="cdx-empty">' + _esc(t('cohorts.loading')) + '</span></div>' +
      '</div>' +
    '</div>';

  el.querySelectorAll('[data-doss]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.doss;
    if (a === 'edit') _openTurmaForm(turma);
    else if (a === 'roster') _openRosterModal(turma);
    else if (a === 'archive') _archiveTurma(turma.client_slug, turma.slug);
    else if (a === 'regen') _regenToken(turma.client_slug, turma.slug);
    else if (a === 'copyurl') _copyUrl(b.dataset.url);
  }));

  _loadTurmaAulas(turma.client_slug, turma.slug);
  _loadDossierParticipants(turma);
  _loadDossierCerts(turma);
}

function _loadDossierParticipants(turma) {
  api.listParticipants({ turma_id: turma.id }).then((d) => {
    const el = _q('cdx-doss-participants');
    if (!el) return;
    const ps = (d && d.participants) || [];
    if (!ps.length) { el.innerHTML = '<span class="cdx-empty">' + _esc(t('cohorts.participants_empty')) + '</span>'; return; }
    const chips = ps.slice(0, 8).map((p) =>
      '<span class="cdx-doss-chip">' + _esc(p.name) + '</span>').join('');
    const more = ps.length > 8 ? '<span class="cdx-doss-chip cdx-doss-chip--more">+' + (ps.length - 8) + '</span>' : '';
    el.innerHTML = '<div class="cdx-doss-count">' + ps.length + '</div><div class="cdx-doss-chips">' + chips + more + '</div>';
  }).catch(() => {});
}

const _DOSS_CERT_STATUSES = [
  { s: 'issued',  k: 'cohorts.doss_st_issued',  c: 'issued' },
  { s: 'signed',  k: 'cohorts.doss_st_signed',  c: 'signed' },
  { s: 'sent',    k: 'cohorts.doss_st_sent',    c: 'sent' },
  { s: 'revoked', k: 'cohorts.doss_st_revoked', c: 'revoked' },
];

function _loadDossierCerts(turma) {
  certApi.list({ turma_id: turma.id }).then((d) => {
    const el = _q('cdx-doss-certs');
    if (!el) return;
    const certs = (d && d.certificates) || [];
    if (!certs.length) { el.innerHTML = '<span class="cdx-empty">' + _esc(t('cohorts.doss_no_certs')) + '</span>'; return; }
    const counts = {};
    certs.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });
    el.innerHTML = '<div class="cdx-doss-certrow">' + _DOSS_CERT_STATUSES
      .filter((st) => counts[st.s])
      .map((st) => '<span class="cdx-doss-cstat cdx-doss-cstat--' + st.c + '"><i></i>' + counts[st.s] + ' ' + _esc(t(st.k)) + '</span>')
      .join('') + '</div>';
  }).catch(() => {});
}

function _loadTurmaAulas(clientSlug, turmaSlug) {
  const el = _q(IDS.aulasList);
  if (!el) return;
  el.innerHTML = '<div class="cdx-empty">' + t('cohorts.loading_aulas') + '</div>';
  api.listAulas({ client_slug: clientSlug, turma_slug: turmaSlug }).then((d) => {
    _turmaAulas = (d.aulas || []).slice().sort((a, b) => (a.aula_number || 0) - (b.aula_number || 0));
    _renderTurmaAulas();
  }).catch((e) => {
    if (window.bsLog) window.bsLog(t('cohorts.error_loading') + ': ' + (e && e.message || e), 'error');
    const el2 = _q(IDS.aulasList);
    if (el2) el2.innerHTML = '<div class="cdx-empty">' + t('cohorts.error_loading') + '</div>';
  });
}

function _renderTurmaAulas() {
  const el = _q(IDS.aulasList);
  if (!el) return;

  const addBtnHtml =
    '<div class="cdx-aulas-toolbar">' +
      '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-primary" id="cdx-btn-add-aula">' + t('cohorts.new_aula') + '</button>' +
    '</div>';

  if (!_turmaAulas.length) {
    el.innerHTML = addBtnHtml + '<div class="cdx-empty">' + t('cohorts.no_aulas') + '</div>';
  } else {
    el.innerHTML = addBtnHtml +
      '<div class="cdx-aulas-col-list">' +
        _turmaAulas.map((a, idx) => _renderAulaColRow(a, idx)).join('') +
      '</div>';
  }

  _wireAulasColEvents();
}

function _renderAulaColRow(a, idx) {
  const ds = _aulaDateStatus(a);
  const titleHtml = a.title
    ? _esc(a.title)
    : '<span class="is-empty">' + t('cohorts.aula_no_title') + '</span>';
  return (
    '<div class="cdx-aula-col-row" data-aula-idx="' + idx + '">' +
      '<div class="cdx-aula-col-row-display">' +
        '<div class="cdx-aula-col-row-main">' +
          '<span class="cdx-rel-aula-label">' + t('cohorts.aula_label') + ' ' + _esc(a.aula_number) + '</span>' +
          '<span class="cdx-aula-col-row-title">' + titleHtml + '</span>' +
        '</div>' +
        '<span class="cdx-rel-aula-date ' + ds.cls + '">' + _esc(ds.text) + '</span>' +
      '</div>' +
    '</div>'
  );
}

function _renderAulaColEditor(a) {
  return (
    '<div class="cdx-aula-col-editor">' +
      '<div class="cdx-field">' +
        '<label>' + t('cohorts.aula_field_title') + '</label>' +
        '<input type="text" class="cdx-aula-title" value="' + _esc(a.title || '') + '" placeholder="' + t('cohorts.aula_title_placeholder') + '">' +
      '</div>' +
      '<div class="cdx-aula-col-editor-grid">' +
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.aula_field_scheduled') + '</label>' +
          '<input type="date" class="cdx-aula-scheduled" value="' + _esc(a.scheduled_for || '') + '">' +
        '</div>' +
        // #27: per-aula carga horária (numeric). The turma total = SUM of these.
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.course_hours_label') + '</label>' +
          '<input type="number" min="0" step="1" inputmode="numeric" class="cdx-aula-hours" value="' + _esc(a.hours != null ? a.hours : '') + '" placeholder="0">' +
        '</div>' +
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.aula_field_happened') + '</label>' +
          '<input type="date" class="cdx-aula-happened" value="' + _esc(a.happened_on || '') + '">' +
        '</div>' +
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.aula_field_rescheduled_from') + '</label>' +
          '<input type="date" class="cdx-aula-rescheduled-from" value="' + _esc(a.rescheduled_from || '') + '">' +
        '</div>' +
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.aula_field_rescheduled_note') + '</label>' +
          '<input type="text" class="cdx-aula-rescheduled-note" value="' + _esc(a.rescheduled_note || '') + '" placeholder="' + t('cohorts.aula_note_placeholder') + '">' +
        '</div>' +
      '</div>' +
      '<div class="cdx-aula-col-editor-actions">' +
        '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-danger cdx-aula-delete">' + t('cohorts.delete') + '</button>' +
        '<div class="cdx-aula-col-editor-actions-right">' +
          '<button type="button" class="cdx-btn cdx-btn-sm cdx-aula-cancel">' + t('cohorts.close') + '</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-primary cdx-aula-save">' + t('cohorts.save') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function _wireAulasColEvents() {
  const addBtn = _q('cdx-btn-add-aula');
  if (addBtn) addBtn.addEventListener('click', _addNewAulaCol);

  const el = _q(IDS.aulasList);
  if (!el) return;
  el.querySelectorAll('.cdx-aula-col-row').forEach((row) => {
    const display = row.querySelector('.cdx-aula-col-row-display');
    if (display) display.addEventListener('click', () => _expandAulaCol(row));
  });
}

function _addNewAulaCol() {
  const nums = _turmaAulas.map(a => a.aula_number || 0);
  const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
  const newAula = {
    id: null,
    aula_number: nextNum,
    title: '',
    scheduled_for: null,
    happened_on: null,
    rescheduled_from: null,
    rescheduled_note: null,
    _isNew: true,
  };
  _turmaAulas.push(newAula);
  _renderTurmaAulas();
  const rows = (_q(IDS.aulasList) || document).querySelectorAll('.cdx-aula-col-row');
  const newRow = rows[rows.length - 1];
  if (newRow) _expandAulaCol(newRow);
}

function _expandAulaCol(row) {
  const idx = parseInt(row.dataset.aulaIdx, 10);
  const aula = _turmaAulas[idx];
  if (!aula) return;

  // Collapse any other open editor
  const el = _q(IDS.aulasList);
  if (el) {
    el.querySelectorAll('.cdx-aula-col-row.is-editing').forEach((r) => {
      if (r !== row) _collapseAulaCol(r);
    });
  }

  row.classList.add('is-editing');
  const display = row.querySelector('.cdx-aula-col-row-display');
  if (display) display.style.display = 'none';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = _renderAulaColEditor(aula);
  row.appendChild(wrapper.firstChild);
  _wireAulaEditorEvents(row, aula, idx);
  const titleInput = row.querySelector('.cdx-aula-title');
  if (titleInput) setTimeout(() => titleInput.focus(), 0);
}

function _collapseAulaCol(row) {
  row.classList.remove('is-editing');
  const display = row.querySelector('.cdx-aula-col-row-display');
  if (display) display.style.display = '';
  const editor = row.querySelector('.cdx-aula-col-editor');
  if (editor) editor.parentNode.removeChild(editor);
}

function _wireAulaEditorEvents(row, aula, idx) {
  const saveBtn   = row.querySelector('.cdx-aula-save');
  const cancelBtn = row.querySelector('.cdx-aula-cancel');
  const deleteBtn = row.querySelector('.cdx-aula-delete');
  const titleInput = row.querySelector('.cdx-aula-title');
  const schedInput = row.querySelector('.cdx-aula-scheduled');
  const hoursInput = row.querySelector('.cdx-aula-hours');
  const happInput  = row.querySelector('.cdx-aula-happened');
  const rfromInput = row.querySelector('.cdx-aula-rescheduled-from');
  const rnoteInput = row.querySelector('.cdx-aula-rescheduled-note');

  saveBtn.addEventListener('click', () => {
    const hoursVal = hoursInput && hoursInput.value.trim() !== '' ? Number(hoursInput.value) : null;
    const payload = {
      client_slug: _relClientSlug,
      turma_slug: _relTurmaSlug,
      aula_number: aula.aula_number,
      title: titleInput.value.trim(),
      hours:            hoursVal,
      scheduled_for:    schedInput.value || null,
      happened_on:      happInput.value  || null,
      rescheduled_from: rfromInput.value || null,
      rescheduled_note: rnoteInput.value.trim() || null,
    };
    const isNew = !!aula._isNew;
    const params = Object.assign({}, payload);
    if (!isNew) params.id = aula.id;

    const call = isNew ? api.createAula(params) : api.updateAula(params);
    call.then((res) => {
      if (isNew) {
        const created = (res && res.aula) || res;
        if (created && created.id) {
          aula.id = created.id;
          aula._isNew = false;
        }
      }
      aula.title            = payload.title;
      aula.hours            = payload.hours;
      aula.scheduled_for    = payload.scheduled_for;
      aula.happened_on      = payload.happened_on;
      aula.rescheduled_from = payload.rescheduled_from;
      aula.rescheduled_note = payload.rescheduled_note;
      _toast(t('cohorts.aula_saved'));
      _renderTurmaAulas();
      _refreshDerivedFacts();
    }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
  });

  cancelBtn.addEventListener('click', () => {
    if (aula._isNew) {
      _turmaAulas.splice(idx, 1);
      _renderTurmaAulas();
    } else {
      _collapseAulaCol(row);
    }
  });

  deleteBtn.addEventListener('click', () => {
    if (aula._isNew) {
      _turmaAulas.splice(idx, 1);
      _renderTurmaAulas();
      return;
    }
    // Use inline confirm modal instead of confirm()
    _openArchiveConfirm({
      title: t('cohorts.delete_aula_title') + ' ' + aula.aula_number,
      message: t('cohorts.delete_aula_msg'),
      onConfirm() {
        api.deleteAula({ id: aula.id }).then(() => {
          _turmaAulas.splice(idx, 1);
          _toast(t('cohorts.aula_deleted'));
          _renderTurmaAulas();
          _refreshDerivedFacts();
        }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
      }
    });
  });
}

// #27: recompute the dossier's DERIVED facts (Carga horária = SUM of saved aula
// hours, Encontros = COUNT of saved aulas) from the in-memory aula list, so an
// aula-hours edit/delete updates the panel without a full turma reload.
function _refreshDerivedFacts() {
  const saved = _turmaAulas.filter((a) => !a._isNew);
  const carga = saved.reduce((s, a) => s + (Number(a.hours) || 0), 0);
  const cEl = (typeof document !== 'undefined') && document.getElementById('cdx-doss-carga');
  if (cEl) cEl.textContent = carga > 0 ? String(carga) : '—';
  const eEl = (typeof document !== 'undefined') && document.getElementById('cdx-doss-encontros');
  if (eEl) eEl.textContent = saved.length > 0 ? String(saved.length) : '—';
}

// ── Public API ────────────────────────────────────────────────────────────────

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _clients = [];
  _selectedClientSlug = null;
  _turmas = [];
  _turmaSearch = '';
  _turmaAulas = [];
  _relClientSlug = null;
  _relTurmaSlug = null;
  _cpSessions = [];
  _cleanup = [];

  // Route by sub-tab. The Cursos sub-view is its own module; the default
  // (Concept A) merged Turmas+Clientes list → dossier view is the shell below.
  const sub = _resolveSub(ctx && ctx.sub);
  if (sub === 'cursos') { cursos.mount(viewEl); return; }

  _renderShell();
  _loadAll();
}

export function unmount() {
  cursos.unmount();
  _cleanup.forEach(fn => fn());
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  // Remove any stray modal left by this module
  document.querySelectorAll('.cdx-modal-backdrop').forEach(bd => bd.parentNode && bd.parentNode.removeChild(bd));
}
