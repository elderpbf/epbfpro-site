// cohorts/cohorts.js
// Codex — Cohorts tab: Clients | Turmas | Aulas (three-column layout).
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.callWorker   (../js/worker-call.js, Codex-owned; was backstage/js/api-client.js)
import { cohorts as api, cp as cpApi, courses as coursesApi, certificates as certApi, releases as relApi, assetUrl } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc as _esc, slugify as _slugify } from '../js/dom.js';
import { aulaStatus } from '../js/aula-status.js';
import { glyphSvg } from '../js/glyphs.js';
import { installResizer } from '../js/resizable.js';
import { openModal, closeModal } from '../js/modal.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import { parseRosterLines } from './roster-parser.js';
import { initials } from '../js/initials.js';
import { isApprovalGated, groupParticipantsByStatus, sortByName, toolbarActions, actionEnabled, actionTargetStatus } from './participant-view.js';
import { settingsHtml as accessSettingsHtml, wireSettings as wireAccessSettings } from '../js/access-panel.js';
import { mountForumAdmin } from './forum-admin.js';
import * as cursos from './courses.js';
// Turma-scoped management surfaces, mounted turma-bound into the dossier sub-tabs
// (the same modules the Content tab used to host, now { turma }-driven so they skip
// the picker). Reused as-is, no composer logic is duplicated.
import * as releasesAdmin from '../content/releases.js';
import * as tarefasAdmin from '../content/tarefas.js';
import * as appRelease from './app-release.js';

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
let _expandedClient = null; // accordion: the one client group whose turmas are open
let _turmas = [];        // ALL turmas across clients (merged Concept-A list)
let _turmaSearch = '';   // live filter for the merged turma list
let _turmaAulas = [];
let _relClientSlug = null;
let _relTurmaSlug = null;
let _cpSessions = [];
let _turmaCourses = [];   // course list cached for the turma form's course picker
let _dossierTurma = null; // the turma currently shown in the dossier (#27 inline edit)
let _dossierDepsTried = false; // courses/cp loaded once for the inline selects
let _pickedCourse = null; // full course fetched when the picker changes (for ementa copy)
let _dossierParticipants = []; // cached list; reloaded per turma
let _cleanup = []; // teardown functions pushed by mount
// Aulas hub (Layout A): the released items (ct_get_turma_view) feed the per-aula
// content counts; the rest is selection state for the list | detail split.
let _turmaViewItems = []; // released items, for the aula count chips/badges
let _turmaViewApps = [];  // granted apps (with aula_number), for the aula app chip
let _selectedAulaId = null; // selected aula id (string) | 'outros' | null
let _aulaTab = 'dados';     // active per-aula sub-tab: 'dados' | 'liberacoes' | 'tarefas'
let _aulaEmbedMounted = { liberacoes: false, tarefas: false, apps: false }; // which detail embed is live

// CLIENTES rail (mirrors the Questions sessions sidebar). Starts OPEN + pinned
// with the dossiê showing the empty prompt; the first turma pick flips it to the
// hover-reveal overlay (left screen edge reveals, cursor-leave hides). Élder.
let _overNav = false;
let _navHideTimer = null;
let _navPinned = true;       // open + pinned until the first turma is picked
const NAV_REVEAL_ZONE = 6;   // px from the left edge that triggers the reveal
const NAV_HIDE_DELAY = 1500; // ms after the cursor leaves the rail before it hides
function _navLayoutEl() { return _viewEl && _viewEl.querySelector('.cdx-three-pane'); }
function _openNav() { const l = _navLayoutEl(); if (l) l.classList.add('cdx-sm--open'); }
function _closeNav() { const l = _navLayoutEl(); if (!l || _navPinned) return; l.classList.remove('cdx-sm--open'); }
function _maybeHideNav() { if (!_overNav) _closeNav(); }

// ── Helpers ─────────────────────────────────────────────────────────────────

// _esc and _slugify are imported from ../js/dom.js

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
        '<button class="cdx-btn cdx-btn-danger-solid" id="cdx-del-confirm" disabled>' + t('cohorts.delete_confirm_btn') + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html, { disableBackdropClose: true });
  const input = bd.querySelector('#cdx-del-confirm-input');
  const confirmBtn = bd.querySelector('#cdx-del-confirm');
  // Case-insensitive match: the name is shown uppercased (label styling), so
  // typing what you see must work even when the real name is PascalCase.
  const matches = () => input.value.trim().toLowerCase() === String(opts.confirmName).trim().toLowerCase();
  input.addEventListener('input', () => { confirmBtn.disabled = !matches(); });
  bd.querySelector('#cdx-del-cancel').addEventListener('click', () => _closeModal(bd));
  confirmBtn.addEventListener('click', () => {
    if (!matches()) return;
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
        '<button class="cdx-btn cdx-btn-danger-solid" id="cdx-arc-confirm">' + t('cohorts.archive') + '</button>' +
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
    '<div class="cdx-three-pane' + (_navPinned ? ' cdx-sm--open' : '') + '">' +

      // Concept A: ONE list, turmas grouped under their client. Kept inside
      // .cdx-cohorts-nav so the mobile hamburger drawer (codex-topbar.js targets
      // that selector) still works; display:contents makes the inner pane the
      // real grid column on desktop.
      '<div class="cdx-cohorts-nav">' +
        '<div class="cdx-pane cdx-cohorts-listpane">' +
          // Few clients, so the search input is kept but hidden (re-enable by
          // dropping the hidden attr); the header labels the left column as CLIENTES.
          '<div class="cdx-pane-header">' +
            '<div class="cdx-pane-title">' + t('cohorts.clients_title') + '</div>' +
            '<input type="search" id="' + IDS.search + '" class="cdx-cohorts-search" placeholder="' + t('cohorts.search_turma') + '" autocomplete="off" hidden>' +
          '</div>' +
          '<div class="cdx-pane-body" id="' + IDS.list + '">' +
            '<div class="cdx-empty">' + t('cohorts.loading') + '</div>' +
          '</div>' +
          '<div class="cdx-cohorts-listfoot">' +
            '<button class="cdx-btn cdx-btn-sm cdx-btn-vazado" id="' + IDS.btnNewClient + '">' + t('cohorts.new_client') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // The turma DOSSIER (Concept A right pane). Surfaces the rich turma data the
      // Cursos model captures — linked course, dates, place, format — plus the
      // trilha link/actions, participants, aulas, and the cert shortcut.
      '<div class="cdx-pane cdx-doss-pane">' +
        '<div class="cdx-pane-body cdx-doss-body" id="cdx-turma-dossier">' +
          '<div class="cdx-placeholder">' + t('cohorts.select_turma_prompt') + '</div>' +
        '</div>' +
      '</div>' +

    '</div>';

  _q(IDS.btnNewClient).addEventListener('click', () => _openClientForm(null));
  // One delegated listener on the list container; innerHTML re-renders replace
  // only inner content, so the listener survives every re-render.
  _q(IDS.list).addEventListener('click', _onListClick);
  const searchEl = _q(IDS.search);
  if (searchEl) searchEl.addEventListener('input', () => { _turmaSearch = searchEl.value; _renderList(); });
  // Auto-hide CLIENTES rail (mirrors the Questions sessions sidebar): the dossiê
  // is full-width; the listpane is a fixed rail revealed by mousing to the left
  // edge and hidden shortly after the cursor leaves. Document-level listeners are
  // pushed to _cleanup so they tear down on unmount (no leak across tab switches).
  const _sidebar = _viewEl.querySelector('.cdx-cohorts-listpane');
  const _onNavMove = (e) => { if (e.clientX <= NAV_REVEAL_ZONE) _openNav(); };
  const _onNavEnter = () => { _overNav = true; clearTimeout(_navHideTimer); };
  const _onNavLeave = () => { _overNav = false; clearTimeout(_navHideTimer); _navHideTimer = setTimeout(_maybeHideNav, NAV_HIDE_DELAY); };
  const _onNavKey = (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.key === 'Escape') _closeNav();
  };
  if (_sidebar) { _sidebar.addEventListener('mouseenter', _onNavEnter); _sidebar.addEventListener('mouseleave', _onNavLeave); }
  document.addEventListener('mousemove', _onNavMove);
  document.addEventListener('keydown', _onNavKey);
  _cleanup.push(() => {
    document.removeEventListener('mousemove', _onNavMove);
    document.removeEventListener('keydown', _onNavKey);
    if (_sidebar) { _sidebar.removeEventListener('mouseenter', _onNavEnter); _sidebar.removeEventListener('mouseleave', _onNavLeave); }
    clearTimeout(_navHideTimer);
  });
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
    // Set the selected client BEFORE rendering the list so its action buttons
    // (+ new-turma / edit) show open, not hover-gated (the row is already is-on).
    const cur = _turmas.find((tm) => tm.client_slug === _relClientSlug && tm.slug === _relTurmaSlug && tm.status !== 'archived');
    if (cur) { _selectedClientSlug = cur.client_slug; _expandedClient = cur.client_slug; }
    _renderList();
    if (cur) { _navPinned = false; _closeNav(); _renderDossier(cur); }
    else {
      // No deep-link: start with the rail pinned open and the dossiê showing the
      // empty prompt until Élder opens a turma (mirrors the Questions picker).
      _relClientSlug = null; _relTurmaSlug = null;
      _navPinned = true; _openNav();
      const dEl = _q('cdx-turma-dossier');
      if (dEl) dEl.innerHTML = '<div class="cdx-placeholder">' + t('cohorts.select_turma_prompt') + '</div>';
    }
  }).catch((e) => {
    if (window.bsLog) window.bsLog(t('cohorts.error_loading') + ': ' + (e && e.message || e), 'error');
    const el2 = _q(IDS.list);
    if (el2) el2.innerHTML = '<div class="cdx-empty">' + t('cohorts.error_loading') + '</div>';
  });
}

function _initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (((w[0] || '')[0] || '') + ((w[1] || '')[0] || '')).toUpperCase();
}

// Derive a lifecycle phase from the turma's dates. Prefer the aula-derived span
// (computed_date_start/end from ct_list_turmas) over the stored fields, so a turma
// with future classes reads as live even if its typed end date is stale.
function _turmaPhase(tm) {
  if (tm.status === 'archived') return { cls: 'cdx-ph-arch', label: t('cohorts.archived') };
  const today = new Date().toISOString().slice(0, 10);
  const s = String(tm.computed_date_start || tm.date_start || '').slice(0, 10);
  const e = String(tm.computed_date_end || tm.date_end || '').slice(0, 10);
  if (s && today < s) return { cls: 'cdx-ph-plan', label: t('cohorts.phase_planned') };
  if (e && today > e)  return { cls: 'cdx-ph-done', label: t('cohorts.phase_done') };
  if (s || e)          return { cls: 'cdx-ph-live', label: t('cohorts.phase_live') };
  return { cls: 'cdx-ph-none', label: '' };
}

// Sort turmas inside a client: archived last; otherwise most-recent/future first
// (by the aula-derived end date), so upcoming classes sit on top and past ones sink.
function _sortTurmas(turmas) {
  const k = (tm) => String(tm.computed_date_end || tm.computed_date_start || tm.date_end || tm.date_start || '').slice(0, 10);
  return turmas.slice().sort((a, b) => {
    const aa = a.status === 'archived' ? 1 : 0, ba = b.status === 'archived' ? 1 : 0;
    if (aa !== ba) return aa - ba;
    const ka = k(a), kb = k(b);
    if (ka !== kb) return kb.localeCompare(ka);
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

// Classify a client by its turmas (drives the ativos/futuros/inativos sections):
// ativo = has a turma in progress (or undated/ongoing), futuro = only upcoming,
// inativo = everything already finished (or archived).
function _clientStatus(turmas) {
  const phases = turmas.filter((tm) => tm.status !== 'archived').map((tm) => _turmaPhase(tm).cls);
  if (phases.some((p) => p === 'cdx-ph-live' || p === 'cdx-ph-none')) return 'ativo';
  if (phases.includes('cdx-ph-plan')) return 'futuro';
  return 'inativo';
}

const _SECTIONS = ['ativo', 'futuro', 'inativo'];

function _renderList() {
  const el = _q(IDS.list);
  if (!el) return;
  const q = (_turmaSearch || '').trim().toLowerCase();
  const byClient = {};
  _turmas.forEach((tm) => { (byClient[tm.client_slug] = byClient[tm.client_slug] || []).push(tm); });
  let groups = _clients
    .filter((c) => c.status !== 'archived')
    .map((c) => {
      const all = byClient[c.slug] || [];
      let turmas = all;
      if (q) turmas = all.filter((tm) =>
        String(tm.name || '').toLowerCase().includes(q) ||
        String(tm.display_name || '').toLowerCase().includes(q));
      // status from ALL the client's turmas; rows sorted (future on top).
      return { client: c, turmas: _sortTurmas(turmas), status: _clientStatus(all) };
    });
  if (q) groups = groups.filter((g) => g.turmas.length);
  if (!groups.length) {
    el.innerHTML = '<div class="cdx-empty">' + t(q ? 'cohorts.no_search_results' : 'cohorts.no_clients') + '</div>';
    return;
  }
  // Clients fall into ativos / futuros / inativos sections, divided by a thin line.
  let html = '';
  for (const sec of _SECTIONS) {
    const inSec = groups.filter((g) => g.status === sec);
    if (!inSec.length) continue;
    html += '<div class="cdx-cg-section">' + _esc(t('cohorts.section_' + sec)) + '</div>';
    html += inSec.map((g) => _renderGroup(g.client, g.turmas)).join('');
  }
  el.innerHTML = html;
  _wireAvatars(el);
}

// If a client icon fails to load (missing/blocked R2 object), swap it for the
// initials avatar so the head never shows a broken-image glyph.
function _wireAvatars(el) {
  el.querySelectorAll('.cdx-cg-ava-img').forEach((img) => {
    img.addEventListener('error', () => {
      const span = document.createElement('span');
      span.className = 'cdx-cg-ava';
      span.textContent = img.dataset.initials || '';
      img.replaceWith(span);
    }, { once: true });
  });
}

function _renderGroup(client, turmas) {
  const name = client.display_name || client.name;
  const rows = turmas.length
    ? turmas.map((tm) => _renderTurmaRow(tm)).join('')
    : '<div class="cdx-cg-empty">' + t('cohorts.no_turmas') + '</div>';
  // Use the client's own icon when it has one (icon_path is an R2 key, so it goes
  // through _iconSrc to a served URL); fall back to the initials if it fails to load.
  const ava = client.icon_path
    ? '<img class="cdx-cg-ava cdx-cg-ava-img" src="' + _esc(_iconSrc(client.icon_path)) + '" alt="" data-initials="' + _esc(_initials(name)) + '">'
    : '<span class="cdx-cg-ava">' + _esc(_initials(name)) + '</span>';
  // Accordion: a client group is collapsed unless it is the one open client
  // (_expandedClient). The head toggles it; only one group is open at a time.
  return (
    '<div class="cdx-cg' + (client.slug === _expandedClient ? ' is-open' : '') + '" data-client-slug="' + _esc(client.slug) + '">' +
      '<div class="cdx-cg-head">' +
        '<span class="cdx-cg-caret" aria-hidden="true">&#9656;</span>' +
        ava +
        '<span class="cdx-cg-name">' + _esc(name) + '</span>' +
        '<span class="cdx-cg-acts">' +
          '<button type="button" class="cdx-cg-act" data-action="new-turma" data-client-slug="' + _esc(client.slug) + '" title="' + t('cohorts.new_turma') + '">+</button>' +
          '<button type="button" class="cdx-cg-act" data-action="edit-client" data-client-slug="' + _esc(client.slug) + '" title="' + t('cohorts.edit') + '">&#9881;</button>' +
        '</span>' +
      '</div>' +
      '<div class="cdx-cg-rows">' + rows + '</div>' +
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
  const archBadge = archived ? ' <span class="cdx-badge cdx-badge-danger">' + t('cohorts.archived') + '</span>' : '';
  // The phase is now a left accent bar (the row's left border, colored via --ph
  // from the phase class) instead of a dot on the right.
  return (
    '<div class="cdx-ti ' + ph.cls + sel + (archived ? ' is-archived' : '') + '" data-client-slug="' + _esc(tm.client_slug) + '" data-turma-slug="' + _esc(tm.slug) + '" title="' + _esc(ph.label) + '">' +
      '<div class="cdx-ti-main">' +
        '<div class="cdx-ti-t">' + _esc(tm.name) + archBadge + '</div>' +
        '<div class="cdx-ti-s">' + course + ' &middot; ' + _esc(countLabel) + '</div>' +
      '</div>' +
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
  if (row) { _selectTurma(row.dataset.clientSlug, row.dataset.turmaSlug); return; }
  const head = e.target.closest('.cdx-cg-head');
  if (head) {
    const cg = head.closest('.cdx-cg');
    if (cg && cg.dataset.clientSlug) _toggleClient(cg.dataset.clientSlug);
  }
}

// Accordion toggle: open the clicked client (closing whichever was open), or
// collapse it if it was already open. Pure class flip, no list re-render.
function _toggleClient(slug) {
  _expandedClient = (_expandedClient === slug) ? null : slug;
  if (_expandedClient) _selectedClientSlug = _expandedClient;
  const el = _q(IDS.list);
  if (el) el.querySelectorAll('.cdx-cg').forEach((cg) => {
    cg.classList.toggle('is-open', cg.dataset.clientSlug === _expandedClient);
  });
}

function _archiveClient(slug) {
  _openArchiveConfirm({
    title: t('cohorts.archive_client_title'),
    message: t('cohorts.archive_client_msg'),
    onConfirm() {
      api.archiveClient({ slug }).then(() => {
        toast.ok(t('cohorts.client_archived'));
        _loadAll();
      }).catch(err => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
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
            toast.ok(t('cohorts.client_deleted'));
            if (_relClientSlug === client.slug) { _relClientSlug = null; _relTurmaSlug = null; }
            if (_selectedClientSlug === client.slug) _selectedClientSlug = null;
            _loadAll();
          }).catch(err => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
        }
      });
    });
  }

  // Save button
  bd.querySelector('#cdx-cf-save').addEventListener('click', () => {
    const name    = bd.querySelector('#cdx-cf-name').value.trim();
    const display = bd.querySelector('#cdx-cf-display').value.trim();
    if (!name) { toast.err(t('cohorts.name_required')); return; }
    const slug = isEdit ? client.slug : _slugify(name);
    if (!slug) { toast.err(t('cohorts.slug_invalid')); return; }

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
      toast.ok(isEdit ? t('cohorts.client_updated') : t('cohorts.client_created'));
      _loadAll();
    }).catch(err => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
  });
}

// ── Turma actions (invoked from the dossier) ──────────────────────────────────
// Per-turma actions mutate the turma in place and re-render ONLY the affected
// list row + dossier header (or the trail card), so the page never reloads.

function _findTurma(clientSlug, slug) {
  return _turmas.find((tm) => tm.client_slug === clientSlug && tm.slug === slug);
}

// Re-paint the dossier header (phase pill + Arquivar/Desarquivar/Deletar) after a
// status change, without re-rendering the whole dossier (no sub-data refetch).
function _refreshDossierHeader(turma) {
  if (_dossierTurma !== turma) return;
  const el = _q('cdx-turma-dossier');
  const hr = el && el.querySelector('.cdx-doss-headright');
  if (!hr) return;
  const ph = _turmaPhase(turma);
  const archived = turma.status === 'archived';
  hr.innerHTML =
    (ph.label ? '<span class="cdx-doss-pill ' + ph.cls + '">' + _esc(ph.label) + '</span>' : '') +
    '<div class="cdx-doss-actions">' +
      (archived
        ? '<button class="cdx-btn cdx-btn-sm" data-doss="unarchive">' + _esc(t('cohorts.unarchive')) + '</button>' +
          '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-doss="delete">' + _esc(t('cohorts.delete_turma_btn')) + '</button>'
        : '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-doss="archive">' + _esc(t('cohorts.archive')) + '</button>') +
    '</div>';
  hr.querySelectorAll('[data-doss]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.doss;
    if (a === 'archive') _archiveTurma(turma.client_slug, turma.slug);
    else if (a === 'unarchive') _unarchiveTurma(turma.client_slug, turma.slug);
    else if (a === 'delete') _deleteTurma(turma);
  }));
}

// Update the dossier Trilha card (copy URL + open link) after a token rotation.
function _refreshDossierTrail(turma) {
  if (_dossierTurma !== turma || !turma.token) return;
  const el = _q('cdx-turma-dossier');
  if (!el) return;
  const url = _turmaUrl(turma.client_slug, turma.slug, turma.token);
  const copyBtn = el.querySelector('[data-doss="copyurl"]');
  if (copyBtn) copyBtn.dataset.url = url;
  const openLink = el.querySelector('.cdx-doss-fact--trail a[href]');
  if (openLink) openLink.setAttribute('href', url);
}

function _archiveTurma(clientSlug, turmaSlug) {
  _openArchiveConfirm({
    title: t('cohorts.archive_turma_title'),
    message: t('cohorts.archive_turma_msg'),
    onConfirm() {
      api.archiveTurma({ client_slug: clientSlug, slug: turmaSlug }).then(() => {
        toast.ok(t('cohorts.turma_archived'));
        const tm = _findTurma(clientSlug, turmaSlug);
        if (tm) { tm.status = 'archived'; _renderList(); _refreshDossierHeader(tm); }
      }).catch(err => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
    }
  });
}

function _unarchiveTurma(clientSlug, turmaSlug) {
  api.unarchiveTurma({ client_slug: clientSlug, slug: turmaSlug }).then(() => {
    toast.ok(t('cohorts.turma_unarchived'));
    const tm = _findTurma(clientSlug, turmaSlug);
    if (tm) { tm.status = 'active'; _renderList(); _refreshDossierHeader(tm); }
  }).catch(err => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
}

// Permanent, irreversible delete, gated by the typed-name confirm modal. The
// cascade drops every per-turma row (content, releases, aulas, participants,
// sessions, forum); global library items and issued certificates are preserved.
function _deleteTurma(turma) {
  _openDeleteConfirm({
    title: t('cohorts.delete_turma_btn'),
    warningHtml: '<p style="font-size:0.85rem;color:var(--text-secondary);margin:0">' + t('cohorts.delete_turma_warning') + '</p>',
    confirmName: turma.name,
    onConfirm() {
      api.deleteTurma({ client_slug: turma.client_slug, slug: turma.slug }).then(() => {
        toast.ok(t('cohorts.turma_deleted'));
        const wasSelected = _relClientSlug === turma.client_slug && _relTurmaSlug === turma.slug;
        _turmas = _turmas.filter((tm) => !(tm.client_slug === turma.client_slug && tm.slug === turma.slug));
        _renderList();
        if (wasSelected) {
          // Back to the pinned picker with the empty prompt (mirrors Questions),
          // rather than auto-jumping to another turma.
          _relClientSlug = null; _relTurmaSlug = null; _dossierTurma = null;
          _navPinned = true; _openNav();
          const dEl = _q('cdx-turma-dossier');
          if (dEl) dEl.innerHTML = '<div class="cdx-placeholder">' + t('cohorts.select_turma_prompt') + '</div>';
        }
      }).catch(err => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
    }
  });
}

function _regenToken(clientSlug, turmaSlug) {
  _openArchiveConfirm({
    title: t('cohorts.regen_token_title'),
    message: t('cohorts.regen_token_msg'),
    onConfirm() {
      api.regenTurmaToken({ client_slug: clientSlug, slug: turmaSlug }).then((res) => {
        toast.ok(t('cohorts.token_regenerated'));
        const tm = _findTurma(clientSlug, turmaSlug);
        if (tm && res && res.token) { tm.token = res.token; _refreshDossierTrail(tm); }
      }).catch(err => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
    }
  });
}

function _copyUrl(url) {
  navigator.clipboard.writeText(url)
    .then(() => toast.info(t('cohorts.link_copied')))
    .catch(() => toast.err(t('cohorts.copy_failed') + ': ' + url));
}

// ── Turma form ────────────────────────────────────────────────────────────────

const _TF_FORMATS = ['presencial', 'online', 'hibrido'];
// Modalidade field removed (Elder): delivery mode lives in Formato (and is what the
// certificate shows); location lives in the Local/place field. The old fechada/aberta
// concept is gone. Legacy cohorts.mod_* i18n keys are kept so any turma with a stored
// modality value still renders on its certificate.

function _openTurmaForm(turma) {
  const isEdit = !!turma;
  _pickedCourse = null;

  const load = Promise.all([
    _cpSessions.length
      ? Promise.resolve()
      : cpApi.listSessions().then(d => { _cpSessions = (d && d.sessions) || []; }).catch((e) => { if (window.bsLog) window.bsLog('cohorts: list sessions failed: ' + (e && e.message || e), 'error'); }),
    coursesApi.list().then(d => { _turmaCourses = (d && d.courses) || []; }).catch((e) => { if (window.bsLog) window.bsLog('cohorts: list courses failed: ' + (e && e.message || e), 'error'); }),
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
          '<div class="cdx-field"><label>' + t('cohorts.tf_date_start') + '</label>' +
            '<input type="date" id="cdx-tf-date-start" value="' + v('date_start') + '"></div>' +
          '<div class="cdx-field"><label>' + t('cohorts.tf_format') + '</label>' +
            '<select id="cdx-tf-format">' + formatOptions + '</select></div>' +
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

    // Course picker: fetch the full course (with ementa) when selected so save
    // can copy it into the turma.
    const courseEl = bd.querySelector('#cdx-tf-course');
    courseEl.addEventListener('change', () => {
      _pickedCourse = null;
      const cid = courseEl.value ? Number(courseEl.value) : null;
      if (!cid) return;
      coursesApi.get({ id: cid }).then(d => { _pickedCourse = (d && d.course) || null; }).catch((e) => { if (window.bsLog) window.bsLog('cohorts: get course failed: ' + (e && e.message || e), 'error'); });
    });

    bd.querySelector('#cdx-tf-save').addEventListener('click', () => {
      const name      = bd.querySelector('#cdx-tf-name').value.trim();
      const display   = bd.querySelector('#cdx-tf-display').value.trim();
      const whatsapp  = bd.querySelector('#cdx-tf-whatsapp').value.trim();
      const cpSession = bd.querySelector('#cdx-tf-classpulse').value;
      if (!name) { toast.err(t('cohorts.name_required')); return; }

      const slug = isEdit ? turma.slug : _slugify(name);
      if (!slug) { toast.err(t('cohorts.slug_invalid')); return; }

      const courseId = courseEl.value ? Number(courseEl.value) : null;
      const instance = {
        course_id: courseId,
        date_start: bd.querySelector('#cdx-tf-date-start').value || null,
        format: bd.querySelector('#cdx-tf-format').value || null,
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
          toast.ok(isEdit ? t('cohorts.turma_updated') : t('cohorts.turma_created'));
          // Keep the dossier pointed at the just-saved turma after the reload.
          _relClientSlug = _selectedClientSlug;
          _relTurmaSlug = isEdit ? turma.slug : slug;
          _loadAll();
        }).catch(err => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
    });
  });
}

// ── CPF utilities ─────────────────────────────────────────────────────────────

function _formatCpf(raw) {
  const v = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (v.length > 9) return v.slice(0,3)+'.'+v.slice(3,6)+'.'+v.slice(6,9)+'-'+v.slice(9);
  if (v.length > 6) return v.slice(0,3)+'.'+v.slice(3,6)+'.'+v.slice(6);
  if (v.length > 3) return v.slice(0,3)+'.'+v.slice(3);
  return v;
}
function _emailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}
function _cpfValid(cpf) {
  const s = String(cpf || '').replace(/\D/g, '');
  if (s.length !== 11 || /^(.)\1+$/.test(s)) return false;
  let sum = 0; for (let i = 0; i < 9; i++) sum += Number(s[i]) * (10 - i);
  let r = (sum * 10) % 11; if (r >= 10) r = 0;
  if (r !== Number(s[9])) return false;
  sum = 0; for (let i = 0; i < 10; i++) sum += Number(s[i]) * (11 - i);
  r = (sum * 10) % 11; if (r >= 10) r = 0;
  return r === Number(s[10]);
}
function _wireCpfMask(el) {
  if (el && el.value) el.value = _formatCpf(el.value);
  if (el) el.addEventListener('input', () => { el.value = _formatCpf(el.value); });
}

// ── Participantes: add + import (the unified list itself lives in the dossier panel) ──

// A plain-language legend for the participant list: what each tag, status, and
// connection mark means. Opened from the "?" glyph next to "Participantes" so the
// scheme is self-explaining months later. Reuses the real tag classes so the
// swatches match the rows exactly.
function _openParticipantsHelp() {
  const tag = (cls, key) => '<span class="cdx-tag ' + cls + '">' + _esc(t(key)) + '</span>';
  const row = (swatch, text) =>
    '<div class="cdx-leg-row"><span class="cdx-leg-sw">' + swatch + '</span>' +
      '<span class="cdx-leg-tx">' + _esc(text) + '</span></div>';
  const html =
    '<div class="cdx-modal" style="max-width:540px;max-height:88vh;overflow-y:auto">' +
      '<div class="cdx-modal-title">' + _esc(t('cohorts.phelp_title')) + '</div>' +

      '<div class="cdx-leg-h">' + _esc(t('cohorts.phelp_origin_h')) + '</div>' +
      row(tag('cdx-badge cdx-badge-primary', 'cohorts.ptag_lista'),                           t('cohorts.phelp_lista')) +
      row(tag('cdx-badge cdx-badge-accent" style="--acc:var(--acc-teal)', 'cohorts.ptag_qr'), t('cohorts.phelp_qr')) +
      row(tag('cdx-badge cdx-badge-success', 'cohorts.ptag_manual'),                          t('cohorts.phelp_manual')) +

      '<div class="cdx-leg-h">' + _esc(t('cohorts.phelp_status_h')) + '</div>' +
      row(tag('cdx-badge cdx-badge-task', 'cohorts.ptag_pending'),   t('cohorts.phelp_pending')) +
      row(tag('cdx-badge cdx-badge-danger', 'cohorts.ptag_denied'),  t('cohorts.phelp_denied')) +
      '<p class="cdx-leg-note">' + _esc(t('cohorts.phelp_approved_note')) + '</p>' +

      '<div class="cdx-leg-h">' + _esc(t('cohorts.phelp_conn_h')) + '</div>' +
      row('<span class="cdx-prow-conn ok">✓</span>', t('cohorts.phelp_connected')) +
      row('<span class="cdx-prow-conn">•</span>',    t('cohorts.phelp_waiting')) +
      row('<span class="cdx-prow-warn">⚠</span>',    t('cohorts.phelp_unverified')) +

      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-phelp-close">' + _esc(t('cohorts.close')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html);
  bd.querySelector('#cdx-phelp-close').addEventListener('click', () => _closeModal(bd));
}

// Add a single participant (name + e-mail + optional CPF). A focused form, NOT a
// second copy of the list — the unified list lives in the dossier panel and is
// refreshed on save. (Mock B+C2: the "+ Adicionar" header button.)
function _openAddParticipant(turma) {
  const html =
    '<div class="cdx-modal" style="max-width:480px">' +
      '<div class="cdx-modal-title">' + _esc(t('cohorts.participants_add')) + '</div>' +
      '<div class="cdx-field">' +
        '<label>' + t('cohorts.participant_name') + ' <span class="cdx-required">*</span></label>' +
        '<input type="text" id="cdx-padd-name" autocomplete="off" placeholder="' + t('cohorts.participant_name_ph') + '">' +
      '</div>' +
      '<div class="cdx-roster-two-col">' +
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.participant_email') + '</label>' +
          '<input type="text" id="cdx-padd-email" autocomplete="off" placeholder="' + t('cohorts.participant_email_ph') + '">' +
        '</div>' +
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.participant_cpf') + '</label>' +
          '<input type="text" id="cdx-padd-cpf" autocomplete="off" maxlength="14" placeholder="' + t('cohorts.participant_cpf_ph') + '">' +
        '</div>' +
      '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button type="button" class="cdx-btn" id="cdx-padd-cancel">' + t('cohorts.cancel') + '</button>' +
        '<button type="button" class="cdx-btn cdx-btn-primary" id="cdx-padd-save">' + t('cohorts.participants_add_btn') + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html);
  _wireCpfMask(bd.querySelector('#cdx-padd-cpf'));
  bd.querySelector('#cdx-padd-cancel').addEventListener('click', () => _closeModal(bd));
  bd.querySelector('#cdx-padd-save').addEventListener('click', () => {
    const nameEl  = bd.querySelector('#cdx-padd-name');
    const emailEl = bd.querySelector('#cdx-padd-email');
    const cpfEl   = bd.querySelector('#cdx-padd-cpf');
    const name  = nameEl.value.trim();
    const email = emailEl.value.trim();
    const cpf   = cpfEl.value.replace(/\D/g, '') ? cpfEl.value.trim() : null;
    if (!name)  { toast.err(t('cohorts.name_required'));  nameEl.focus();  return; }
    if (!email) { toast.err(t('cohorts.email_required')); emailEl.focus(); return; }
    if (!_emailValid(email)) { toast.err(t('cohorts.email_invalid')); emailEl.focus(); return; }
    if (cpf && !_cpfValid(cpf)) { toast.err(t('cohorts.cpf_invalid')); cpfEl.focus(); return; }
    api.addParticipant({ turma_id: turma.id, name, email, cpf }).then(() => {
      toast.ok(t('cohorts.participant_added'));
      _closeModal(bd);
      _loadDossierParticipants(turma);
    }).catch((err) => {
      notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
    });
  });
}

// Bulk import (paste name / e-mail / CPF lines). Focused form; refreshes the panel
// list on success. (Mock B+C2: the "⇪ Importar" header button.)
function _openImportParticipants(turma) {
  const html =
    '<div class="cdx-modal" style="max-width:560px;max-height:88vh;overflow-y:auto">' +
      '<div class="cdx-modal-title">' + _esc(t('cohorts.participants_import')) + '</div>' +
      '<p class="cdx-helper-text">' + t('cohorts.participants_import_hint') + '</p>' +
      '<textarea id="cdx-pimport-text" class="cdx-roster-import-textarea" placeholder="' + t('cohorts.participants_import_ph') + '" rows="8"></textarea>' +
      '<div class="cdx-modal-actions">' +
        '<button type="button" class="cdx-btn" id="cdx-pimport-cancel">' + t('cohorts.cancel') + '</button>' +
        '<button type="button" class="cdx-btn cdx-btn-primary" id="cdx-pimport-save">' + t('cohorts.participants_import_btn') + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html);
  bd.querySelector('#cdx-pimport-cancel').addEventListener('click', () => _closeModal(bd));
  bd.querySelector('#cdx-pimport-save').addEventListener('click', () => {
    const textEl = bd.querySelector('#cdx-pimport-text');
    const rows = parseRosterLines(textEl.value);
    if (!rows.length) { toast.err(t('cohorts.participants_import_empty')); return; }
    const noEmail = rows.find((r) => !r.email);
    if (noEmail) { toast.err(t('cohorts.email_required') + ' (' + noEmail.name + ')'); return; }
    const badEmail = rows.find((r) => !_emailValid(r.email));
    if (badEmail) { toast.err(t('cohorts.email_invalid') + ' (' + badEmail.name + ')'); return; }
    const badCpf = rows.find((r) => r.cpf && !_cpfValid(r.cpf));
    if (badCpf) { toast.err(t('cohorts.cpf_invalid') + ' (' + badCpf.name + ')'); return; }
    api.importParticipants({ turma_id: turma.id, rows }).then(() => {
      toast.ok(t('cohorts.participants_imported').replace('{n}', String(rows.length)));
      _closeModal(bd);
      _loadDossierParticipants(turma);
    }).catch((err) => {
      notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
    });
  });
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
        '<input type="text" id="cdx-pe-cpf" value="' + _esc(participant.cpf || '') + '" maxlength="14" placeholder="' + t('cohorts.participant_cpf_ph') + '">' +
      '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-pe-cancel">' + t('cohorts.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-pe-save">' + t('cohorts.save') + '</button>' +
      '</div>' +
    '</div>';

  const bd = _openModal(html);
  _wireCpfMask(bd.querySelector('#cdx-pe-cpf'));
  bd.querySelector('#cdx-pe-cancel').addEventListener('click', () => _closeModal(bd));
  bd.querySelector('#cdx-pe-save').addEventListener('click', () => {
    const name   = bd.querySelector('#cdx-pe-name').value.trim();
    const email  = bd.querySelector('#cdx-pe-email').value.trim();
    const cpfEl2 = bd.querySelector('#cdx-pe-cpf');
    const cpf    = cpfEl2.value.replace(/\D/g, '') ? cpfEl2.value.trim() : null;
    if (!name)  { toast.err(t('cohorts.name_required'));  bd.querySelector('#cdx-pe-name').focus();  return; }
    if (!email) { toast.err(t('cohorts.email_required')); bd.querySelector('#cdx-pe-email').focus(); return; }
    if (!_emailValid(email)) { toast.err(t('cohorts.email_invalid')); bd.querySelector('#cdx-pe-email').focus(); return; }
    if (cpf && !_cpfValid(cpf)) { toast.err(t('cohorts.cpf_invalid')); cpfEl2.focus(); return; }
    api.updateParticipant({ id: participant.id, name, email, cpf }).then(() => {
      _closeModal(bd);
      toast.ok(t('cohorts.participant_updated'));
      if (onSaved) onSaved();
    }).catch((err) => {
      notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
    });
  });
}

// ── Turma selection (drives the dossier) ──────────────────────────────────────

function _selectTurma(clientSlug, turmaSlug) {
  if (!clientSlug || !turmaSlug) return;
  if (clientSlug === _relClientSlug && turmaSlug === _relTurmaSlug) return;
  // New turma: reset the aula hub selection so it opens on the first aula's Dados.
  _selectedAulaId = null;
  _aulaTab = 'dados';
  _relClientSlug = clientSlug;
  _relTurmaSlug = turmaSlug;
  try { localStorage.setItem('cdx_cohorts_last', clientSlug + '\n' + turmaSlug); } catch (_) {}  // reopen this turma after a refresh
  _selectedClientSlug = clientSlug; // new-turma / form context follows the selection
  _expandedClient = clientSlug;     // selecting a turma opens its client group
  const turma = _turmas.find((x) => x.client_slug === clientSlug && x.slug === turmaSlug);
  _renderDossier(turma);
  _renderList();
  _navPinned = false;   // first pick flips the rail to the hover-reveal overlay
  _closeNav();
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
  // Tear down any live aula embed before the dossier DOM is replaced (no leak across
  // turma switches / dossier re-renders).
  _unmountAulaEmbeds();
  if (!turma) { el.innerHTML = '<div class="cdx-placeholder">' + t('cohorts.select_turma_prompt') + '</div>'; return; }
  _dossierTurma = turma;
  _dossierParticipants = [];

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
  // #27: the dossier is the single editable surface (no more Editar modal). Each
  // editable fact is an input/select that auto-saves on blur/change. Modality is
  // intentionally omitted (being retired). carga/encontros/datas stay derived.
  const editText = (field, label, value, ph2) =>
    '<div class="cdx-doss-fact cdx-doss-fact--edit"><label>' + _esc(label) + '</label>' +
    '<input class="cdx-doss-edit" type="text" data-edit-field="' + field + '" value="' + _esc(value == null ? '' : value) + '"' + (ph2 ? ' placeholder="' + _esc(ph2) + '"' : '') + '></div>';
  const editSelect = (field, label, optsHtml, extraClass) =>
    '<div class="cdx-doss-fact cdx-doss-fact--edit' + (extraClass ? ' ' + extraClass : '') + '"><label>' + _esc(label) + '</label>' +
    '<select class="cdx-doss-edit" data-edit-field="' + field + '">' + optsHtml + '</select></div>';
  const courseOpts = '<option value="">' + _esc(t('cohorts.tf_no_course')) + '</option>' +
    (_turmaCourses || []).map((c) => '<option value="' + _esc(String(c.id)) + '"' + (String(turma.course_id || '') === String(c.id) ? ' selected' : '') + '>' + _esc(c.title) + '</option>').join('');
  const fmtOpts = '<option value="">' + _esc(t('cohorts.none')) + '</option>' +
    _TF_FORMATS.map((k) => '<option value="' + k + '"' + (turma.format === k ? ' selected' : '') + '>' + _esc(t('cohorts.fmt_' + k)) + '</option>').join('');
  const cpOpts = '<option value="">' + _esc(t('cohorts.none')) + '</option>' +
    (_cpSessions || []).map((s) => '<option value="' + _esc(s.id) + '"' + (String(turma.classpulse_session_id || '') === String(s.id) ? ' selected' : '') + '>' + _esc(s.name) + '</option>').join('');
  const ph = _turmaPhase(turma);
  const archived = turma.status === 'archived';
  const url = turma.token ? _turmaUrl(turma.client_slug, turma.slug, turma.token) : null;
  const trailCard =
    '<div class="cdx-doss-fact cdx-doss-fact--trail"><label>' + _esc(t('cohorts.field_trail')) + '</label>' +
    (url
      ? '<div class="cdx-doss-trail-acts">' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-doss="copyurl" data-url="' + _esc(url) + '">' + _esc(t('cohorts.copy_url')) + '</button>' +
          '<a class="cdx-btn cdx-btn-sm" href="' + _esc(url) + '" target="_blank" rel="noopener" title="' + _esc(t('cohorts.open_url')) + '">&#8599;</a>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-doss="regen" title="' + _esc(t('cohorts.regen_token_title')) + '">&#8635;</button>' +
        '</div>'
      : '<span class="cdx-doss-trail-na">' + _esc(t('cohorts.url_unavailable')) + '</span>') +
    '</div>';

  el.innerHTML =
    '<div class="cdx-doss">' +
      '<div class="cdx-doss-head">' +
        '<div class="cdx-doss-headmain">' +
          '<input class="cdx-doss-title cdx-doss-title-edit cdx-doss-edit" type="text" data-edit-field="name" value="' + _esc(turma.name) + '" aria-label="' + _esc(t('cohorts.field_name_internal')) + '">' +
          '<div class="cdx-doss-sub">' + _esc(sub) + '</div></div>' +
        '<div class="cdx-doss-headright">' +
          (ph.label ? '<span class="cdx-doss-pill ' + ph.cls + '">' + _esc(ph.label) + '</span>' : '') +
          '<div class="cdx-doss-actions">' +
            (archived
              ? '<button class="cdx-btn cdx-btn-sm" data-doss="unarchive">' + _esc(t('cohorts.unarchive')) + '</button>' +
                '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-doss="delete">' + _esc(t('cohorts.delete_turma_btn')) + '</button>'
              : '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-doss="archive">' + _esc(t('cohorts.archive')) + '</button>') +
          '</div>' +
        '</div>' +
      '</div>' +
      // ── Per-turma sub-tabs (Phase 8): the stacked sections become tab panels.
      // Container-only change: each panel keeps its exact inner content + ids, and
      // the loaders below still fire eagerly on mount (not lazy-on-tab-show). ──
      '<div class="cdx-subrow cdx-doss-tabs"><div class="cdx-substrip" role="tablist">' +
        '<button type="button" class="cdx-subtab active" data-dtab="dados" role="tab">' + _esc(t('cohorts.sec_turma_data')) + '</button>' +
        '<button type="button" class="cdx-subtab" data-dtab="participantes" role="tab">' + _esc(t('cohorts.participants_title')) + ' <span class="cdx-secount" id="cdx-doss-p-count"></span></button>' +
        '<button type="button" class="cdx-subtab" data-dtab="aulas" role="tab">' + _esc(t('cohorts.col_aulas')) + '</button>' +
        '<button type="button" class="cdx-subtab" data-dtab="certs" role="tab">' + _esc(t('cohorts.doss_certs')) + '</button>' +
        '<button type="button" class="cdx-subtab" data-dtab="forum" role="tab">' + _esc(t('cohorts.doss_forum')) + '</button>' +
      '</div></div>' +
      // Dados panel = turma facts + Acesso (the short config block folds in here).
      '<div class="cdx-doss-panel" data-dpanel="dados">' +
        '<div class="cdx-doss-facts">' +
          editSelect('course_id', t('cohorts.tf_course'), courseOpts, 'cdx-doss-fact--course') +
          factId('cdx-doss-carga', t('cohorts.course_hours_label'), cargaDerived) +
          factId('cdx-doss-encontros', t('cohorts.tf_meetings'), encontrosDerived) +
          fact(t('cohorts.tf_date_start'), dStart) +
          fact(t('cohorts.tf_date_end'), dEnd) +
          editSelect('format', t('cohorts.tf_format'), fmtOpts) +
          editText('place', t('cohorts.tf_place'), turma.place, t('cohorts.tf_place_ph')) +
          editText('display_name', t('cohorts.field_display_name'), turma.display_name, t('cohorts.field_display_placeholder')) +
          '<div class="cdx-doss-sep" role="separator"></div>' +
          editText('whatsapp_url', t('cohorts.field_whatsapp'), turma.whatsapp_url, 'https://chat.whatsapp.com/...') +
          editSelect('classpulse_session_id', t('cohorts.field_classpulse'), cpOpts) +
          trailCard +
        '</div>' +
        '<div class="cdx-doss-subhead">' + _esc(t('cohorts.sec_access')) + '</div>' +
        '<div id="cdx-doss-acesso"><span class="cdx-empty">' + _esc(t('cohorts.loading')) + '</span></div>' +
      '</div>' +
      // Participantes panel (the roster/help controls move into a panel toolbar).
      '<div class="cdx-doss-panel" data-dpanel="participantes" hidden>' +
        '<div class="cdx-doss-panel-bar">' +
          '<button type="button" class="cdx-phelp" data-doss="phelp" title="' + _esc(t('cohorts.phelp_btn_title')) + '" aria-label="' + _esc(t('cohorts.phelp_btn_title')) + '">?</button>' +
          '<span class="cdx-doss-sec-acts">' +
            '<button class="cdx-btn cdx-btn-sm" data-doss="padd">+ ' + _esc(t('cohorts.participants_add_btn')) + '</button>' +
            '<button class="cdx-btn cdx-btn-sm" data-doss="pimport">⇪ ' + _esc(t('cohorts.participants_import_btn')) + '</button>' +
          '</span>' +
        '</div>' +
        '<div id="cdx-doss-participants"><span class="cdx-empty">' + _esc(t('cohorts.loading')) + '</span></div>' +
      '</div>' +
      // Aulas panel = the aula HUB (Layout A): a resizable list | detail split. The
      // per-aula Liberações + Tarefas now live INSIDE each aula's detail (aula-locked
      // embeds), so the old turma-level Liberações/Tarefas sub-tabs were retired.
      '<div class="cdx-doss-panel" data-dpanel="aulas" hidden>' +
        '<div id="' + IDS.aulasList + '"><div class="cdx-empty">' + _esc(t('cohorts.loading_aulas')) + '</div></div>' +
      '</div>' +
      // Certificados panel.
      '<div class="cdx-doss-panel" data-dpanel="certs" hidden>' +
        '<div class="cdx-doss-sec-actions"><a class="cdx-btn cdx-btn-sm cdx-btn-primary" href="/codex/?tab=certificates&sub=emitidos">' + _esc(t('cohorts.doss_emit')) + '</a></div>' +
        '<div id="cdx-doss-certs"><span class="cdx-empty">' + _esc(t('cohorts.loading')) + '</span></div>' +
      '</div>' +
      // Fórum panel (Phase 4 fills the admin moderation view).
      '<div class="cdx-doss-panel" data-dpanel="forum" hidden>' +
        '<div id="cdx-doss-forum"><span class="cdx-empty">' + _esc(t('cohorts.doss_forum_empty')) + '</span></div>' +
      '</div>' +
    '</div>';

  el.querySelectorAll('[data-doss]').forEach((b) => b.addEventListener('click', (e) => {
    const a = b.dataset.doss;
    // padd/pimport/phelp live inside the panel bar; stop the click so it doesn't toggle.
    if (a === 'padd' || a === 'pimport' || a === 'phelp') e.stopPropagation();
    if (a === 'padd') _openAddParticipant(turma);
    else if (a === 'pimport') _openImportParticipants(turma);
    else if (a === 'phelp') _openParticipantsHelp();
    else if (a === 'archive') _archiveTurma(turma.client_slug, turma.slug);
    else if (a === 'unarchive') _unarchiveTurma(turma.client_slug, turma.slug);
    else if (a === 'delete') _deleteTurma(turma);
    else if (a === 'regen') _regenToken(turma.client_slug, turma.slug);
    else if (a === 'copyurl') _copyUrl(b.dataset.url);
  }));

  // Per-turma sub-tab switching: show the picked panel, hide the rest. Every loader
  // fires eagerly on mount, so switching is pure show/hide.
  const _dtabs = el.querySelectorAll('.cdx-subtab[data-dtab]');
  const _dpanels = el.querySelectorAll('.cdx-doss-panel[data-dpanel]');
  _dtabs.forEach((tab) => tab.addEventListener('click', () => {
    const key = tab.dataset.dtab;
    _dtabs.forEach((x) => x.classList.toggle('active', x === tab));
    _dpanels.forEach((p) => { p.hidden = p.dataset.dpanel !== key; });
  }));

  _wireDossierInlineEdit(el, turma);
  // Acesso section: the per-turma gating switches, mounted from the shared access
  // panel (same component the Alunos tab uses, so the logic lives in one place).
  const accEl = el.querySelector('#cdx-doss-acesso');
  if (accEl) {
    accEl.innerHTML = accessSettingsHtml(turma);
    wireAccessSettings(accEl, turma, { api, clientSlug: turma.client_slug, slug: turma.slug });
  }
  // The course + classpulse selects need their option lists; load once and re-render
  // this dossier when they arrive (so the saved option is selectable).
  if ((!_turmaCourses || !_turmaCourses.length) || (!_cpSessions || !_cpSessions.length)) {
    _ensureDossierDeps(() => { if (_dossierTurma === turma) _renderDossier(turma); });
  }

  _loadTurmaAulas(turma);
  _loadDossierParticipants(turma);
  _loadDossierCerts(turma);
  // Fórum moderation (2-pane): the instructor's full toolkit, mounted into the
  // Fórum sub-tab. Eager like the other dossier loaders.
  const forumEl = el.querySelector('#cdx-doss-forum');
  if (forumEl) mountForumAdmin(forumEl, turma);
}

// Load the course + classpulse option lists once, for the dossier's inline selects.
function _ensureDossierDeps(cb) {
  const needCourses = !_turmaCourses || !_turmaCourses.length;
  const needCp = !_cpSessions || !_cpSessions.length;
  if ((!needCourses && !needCp) || _dossierDepsTried) { if (cb) cb(); return; }
  _dossierDepsTried = true;
  Promise.all([
    needCourses ? coursesApi.list().then((d) => { _turmaCourses = (d && d.courses) || []; }).catch((e) => { if (window.bsLog) window.bsLog('cohorts: deps list courses failed: ' + (e && e.message || e), 'error'); }) : Promise.resolve(),
    needCp ? cpApi.listSessions().then((d) => { _cpSessions = (d && d.sessions) || []; }).catch((e) => { if (window.bsLog) window.bsLog('cohorts: deps list sessions failed: ' + (e && e.message || e), 'error'); }) : Promise.resolve(),
  ]).then(() => { if (cb) cb(); });
}

// #27: auto-save each inline-editable dossier field on blur (inputs) / change
// (selects). Meta fields (whatsapp/classpulse) route through ct_update_turma_meta;
// the rest through ct_update_turma (a conditional update of just that field).
function _wireDossierInlineEdit(el, turma) {
  el.querySelectorAll('[data-edit-field]').forEach((inp) => {
    const isSelect = inp.tagName === 'SELECT';
    inp.addEventListener(isSelect ? 'change' : 'blur', () => {
      const field = inp.dataset.editField;
      const raw = inp.value;
      const cur = field === 'course_id'
        ? String(turma.course_id || '')
        : (turma[field] == null ? '' : String(turma[field]));
      if (String(raw) === cur) return; // unchanged → no write
      let call;
      if (field === 'whatsapp_url' || field === 'classpulse_session_id') {
        // ct_update_turma_meta sets BOTH meta columns; send current + the change.
        const meta = {
          client_slug: turma.client_slug, slug: turma.slug,
          whatsapp_url: turma.whatsapp_url || null,
          classpulse_session_id: turma.classpulse_session_id || null,
        };
        meta[field] = raw.trim() === '' ? null : raw.trim();
        call = api.updateTurmaMeta(meta).then(() => { turma[field] = meta[field]; });
      } else {
        const payload = { client_slug: turma.client_slug, slug: turma.slug };
        if (field === 'course_id') payload.course_id = raw ? Number(raw) : null;
        else payload[field] = raw.trim() === '' ? null : raw.trim();
        call = api.updateTurma(payload).then(() => {
          if (field === 'course_id') {
            turma.course_id = payload.course_id;
            const c = (_turmaCourses || []).find((x) => String(x.id) === String(payload.course_id));
            turma.course_title = c ? c.title : null;
          } else turma[field] = payload[field];
        });
      }
      call.then(() => toast.ok(t('cohorts.turma_updated')))
        .catch((err) => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
    });
  });
}

// ── Dossier participant list (B+C2): status separators + adaptive bulk toolbar ──
// The pure rules (gating, grouping, action predicates) live in participant-view.js
// and are unit-tested there; this section is the render + DOM wiring only.

function _pTag(p) {
  const st = p.access_status || 'pending';
  // Two orthogonal axes, shown one at a time: while NOT approved the status is the
  // actionable fact; once approved the origin (how they got in) is. They never
  // overlap because origin (approved_via) is only stamped on approval, and the
  // "approved" state itself is the expected default, so it carries no tag.
  if (st === 'pending') return '<span class="cdx-badge cdx-badge-task">'    + _esc(t('cohorts.ptag_pending')) + '</span>';
  if (st === 'denied')  return '<span class="cdx-badge cdx-badge-danger">'  + _esc(t('cohorts.ptag_denied'))  + '</span>';
  const via = p.approved_via || '';
  if (via === 'manual')                                        return '<span class="cdx-badge cdx-badge-success">'                                                         + _esc(t('cohorts.ptag_manual')) + '</span>';
  // In-class enrollment window (the projected QR): window/presence/qr all read as QR.
  if (via === 'qr' || via === 'window' || via === 'presence') return '<span class="cdx-badge cdx-badge-accent" style="--acc:var(--acc-teal)">'                            + _esc(t('cohorts.ptag_qr'))     + '</span>';
  // roster pre-approval, or any older/blank value, reads as the pre-approved list.
  return '<span class="cdx-badge cdx-badge-primary">' + _esc(t('cohorts.ptag_lista')) + '</span>';
}

// 2-letter initials avatar (shared rule, matches the Trail). Tinted by status when
// approval is gated; a single neutral tint otherwise (status carries no meaning).
function _pAvatar(p, st, gated) {
  const tint = !gated ? 'cdx-pav--neutral'
    : st === 'denied' ? 'cdx-pav--denied'
    : st === 'pending' ? 'cdx-pav--pending'
    : 'cdx-pav--approved';
  return '<span class="cdx-pav ' + tint + '">' + _esc(initials(p.display_name || p.name || p.email || '')) + '</span>';
}

// One selectable row. No per-row action buttons (B+C2): the whole row toggles its
// checkbox; the only per-row control is the discreet edit ✎. The status badge shows
// only when gated; the online dot only for an approved + connected person.
function _pRow(p, gated) {
  const st = p.access_status || 'pending';
  const online = (p.active_sessions || 0) > 0;
  const unv = (p.email && !p.email_verified)
    ? ' <span class="cdx-prow-warn" title="' + _esc(t('alunos.unverified')) + '">⚠</span>' : '';
  const onlineDot = (gated && st === 'approved' && online)
    ? ' <span class="cdx-prow-online" title="' + _esc(t('cohorts.conn_online')) + '">●</span>' : '';
  const badge = gated ? '<span class="cdx-prow-badge">' + _pTag(p) + '</span>' : '';
  const name = p.display_name || p.name || ('#' + p.id);
  return '<div class="cdx-prow cdx-prow--sel" data-pid="' + p.id + '" data-status="' + _esc(st) + '">' +
    '<input type="checkbox" class="cdx-pchk" aria-label="' + _esc(name) + '">' +
    _pAvatar(p, st, gated) +
    '<div class="cdx-prow-id">' +
      '<div class="cdx-prow-name">' + _esc(name) + onlineDot + '</div>' +
      '<div class="cdx-prow-mail">' + _esc(p.email || '') + unv + '</div>' +
    '</div>' +
    badge +
    '<button type="button" class="cdx-prow-edit" data-edit title="' + _esc(t('cohorts.participant_edit_title')) + '">✎</button>' +
  '</div>';
}

// A status separator: dot + "Pendentes · N" + a "selecionar seção" link that checks
// every row in that section at once.
function _pSep(status, count) {
  return '<div class="cdx-psec" data-section="' + status + '">' +
    '<span class="cdx-psec-dot cdx-psec-dot--' + status + '"></span>' +
    '<span class="cdx-psec-t">' + _esc(t('alunos.filter_' + status)) + ' · ' + count + '</span>' +
    '<span class="cdx-psec-sp"></span>' +
    '<button type="button" class="cdx-psec-sel" data-secsel="' + status + '">' + _esc(t('alunos.select_section')) + '</button>' +
  '</div>';
}

function _paintDossierParticipants(el, turma) {
  const ps = _dossierParticipants;
  const gated = isApprovalGated(turma);
  const countEl = _q('cdx-doss-p-count');
  if (countEl) countEl.textContent = ps.length || '';

  if (!ps.length) {
    el.innerHTML = '<span class="cdx-empty">' + _esc(t('cohorts.participants_empty')) + '</span>';
    return;
  }

  // Adaptive toolbar: master "Todos" + live count + the wired bulk actions. Each
  // action button greys out unless EVERY selected row's status permits it (B+C2).
  // Only backend-wired actions are offered (see toolbarActions / participant-view).
  const toolbar =
    '<div class="cdx-ptb">' +
      '<label class="cdx-ptb-all"><input type="checkbox" class="cdx-pall">' + _esc(t('alunos.filter_all')) + '</label>' +
      '<span class="cdx-ptb-count">0 ' + _esc(t('alunos.sel_suffix')) + '</span>' +
      toolbarActions(gated).map((act) =>
        '<button type="button" class="cdx-btn cdx-btn-sm cdx-ptb-act" data-act="' + act + '" disabled>' +
          _esc(t('alunos.' + act)) + '</button>').join('') +
    '</div>';

  // Gated -> one list broken into status sections (pending first). Not gated ->
  // a flat name-sorted roster (no status, since approval makes no difference).
  const body = gated
    ? groupParticipantsByStatus(ps)
        .map((g) => _pSep(g.status, g.rows.length) + g.rows.map((p) => _pRow(p, true)).join(''))
        .join('')
    : sortByName(ps).map((p) => _pRow(p, false)).join('');

  el.innerHTML = toolbar + '<div class="cdx-plist">' + body + '</div>';
}

function _wireDossierParticipants(el, turma) {
  const rows = Array.prototype.slice.call(el.querySelectorAll('.cdx-prow'));
  const acts = Array.prototype.slice.call(el.querySelectorAll('.cdx-ptb-act'));
  const allChk = el.querySelector('.cdx-pall');
  const countEl = el.querySelector('.cdx-ptb-count');
  const chkOf = (r) => r.querySelector('.cdx-pchk');
  const selected = () => rows.filter((r) => { const c = chkOf(r); return c && c.checked; });

  // Recompute the selection highlight, the count, the master checkbox, and which
  // toolbar actions are live (greyed unless they fit every selected row).
  function refresh() {
    const sel = selected();
    rows.forEach((r) => { const c = chkOf(r); r.classList.toggle('is-on', !!(c && c.checked)); });
    if (countEl) countEl.textContent = sel.length + ' ' + t('alunos.sel_suffix');
    const sts = sel.map((r) => r.dataset.status);
    acts.forEach((b) => { b.disabled = !actionEnabled(b.dataset.act, sts); });
    if (allChk) allChk.checked = rows.length > 0 && sel.length === rows.length;
  }

  rows.forEach((r) => {
    const c = chkOf(r);
    // Clicking anywhere on the row toggles its checkbox (except the edit ✎).
    r.addEventListener('click', (e) => {
      if (e.target.closest('[data-edit]')) return;
      if (e.target !== c && c) c.checked = !c.checked;
      refresh();
    });
    const ed = r.querySelector('[data-edit]');
    if (ed) ed.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(r.dataset.pid);
      const p = _dossierParticipants.find((x) => Number(x.id) === id);
      if (p) _openParticipantEditModal(p, () => _loadDossierParticipants(turma));
    });
  });

  if (allChk) allChk.addEventListener('change', () => {
    rows.forEach((r) => { const c = chkOf(r); if (c) c.checked = allChk.checked; });
    refresh();
  });

  el.querySelectorAll('[data-secsel]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sec = btn.dataset.secsel;
      rows.forEach((r) => { if (r.dataset.status === sec) { const c = chkOf(r); if (c) c.checked = true; } });
      refresh();
    });
  });

  acts.forEach((b) => b.addEventListener('click', async () => {
    if (b.disabled) return;
    const ids = selected().map((r) => Number(r.dataset.pid));
    if (!ids.length) return;
    const act = b.dataset.act;
    if (act === 'remove' && typeof confirm === 'function' && !confirm(t('alunos.remove_confirm'))) return;
    acts.forEach((x) => { x.disabled = true; });
    try {
      if (act === 'remove') {
        for (const id of ids) { await api.deleteParticipant({ id }).catch((e) => { if (window.bsLog) window.bsLog('cohorts: bulk delete participant failed: ' + (e && e.message || e), 'error'); }); }
      } else {
        const status = actionTargetStatus(act);
        const payload = { participant_ids: ids, status };
        if (status === 'approved') payload.origin = location.origin;
        await api.setParticipantAccess(payload).catch((e) => { if (window.bsLog) window.bsLog('cohorts: bulk set access failed: ' + (e && e.message || e), 'error'); });
      }
    } finally {
      _loadDossierParticipants(turma);
    }
  }));

  refresh();
}

function _loadDossierParticipants(turma) {
  api.listParticipants({ turma_id: turma.id }).then((d) => {
    _dossierParticipants = (d && d.participants) || [];
    const el = _q('cdx-doss-participants');
    if (!el) return;
    _paintDossierParticipants(el, turma);
    _wireDossierParticipants(el, turma);
  }).catch((e) => { if (window.bsLog) window.bsLog('cohorts: load participants failed: ' + (e && e.message || e), 'error'); });
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
  }).catch((e) => { if (window.bsLog) window.bsLog('cohorts: load certs failed: ' + (e && e.message || e), 'error'); });
}

// ── Aulas hub (Layout A): list | grip | detail ────────────────────────────────
// The Aulas dossier sub-tab is a resizable two-pane hub: a selectable aula list on
// the left, the selected aula's detail on the right with its own Dados / Liberações
// / Tarefas sub-tabs. Liberações + Tarefas are the SAME content modules, mounted in
// aula-locked mode, so there is one composer/editor codebase, not a per-aula copy.

// Load this turma's aulas AND its released-items view (ct_get_turma_view, the source
// for the per-aula content counts), then paint the hub. No token (turma without a
// trilha link yet) just yields empty counts.
function _loadTurmaAulas(turma) {
  const el = _q(IDS.aulasList);
  if (!el) return;
  el.innerHTML = '<div class="cdx-empty">' + t('cohorts.loading_aulas') + '</div>';
  const aulasCall = api.listAulas({ client_slug: turma.client_slug, turma_slug: turma.slug });
  const viewCall = turma.token
    ? relApi.turmaView({ client_slug: turma.client_slug, turma_slug: turma.slug, token: turma.token })
        .catch((e) => { if (window.bsLog) window.bsLog('cohorts: aula counts turmaView failed: ' + (e && e.message || e), 'error'); return { items: [] }; })
    : Promise.resolve({ items: [] });
  Promise.all([aulasCall, viewCall]).then(([ad, vd]) => {
    _turmaAulas = (ad.aulas || []).slice().sort((a, b) => (a.aula_number || 0) - (b.aula_number || 0));
    _turmaViewItems = (vd && vd.items) || [];
    _turmaViewApps = (vd && vd.apps) || [];
    _renderAulasHub(turma);
  }).catch((e) => {
    if (window.bsLog) window.bsLog(t('cohorts.error_loading') + ': ' + (e && e.message || e), 'error');
    const el2 = _q(IDS.aulasList);
    if (el2) el2.innerHTML = '<div class="cdx-empty">' + t('cohorts.error_loading') + '</div>';
  });
}

// Per-aula content counts, reusing the Liberações composer's own tally (exported
// from releases.js) so the hub and the composer can never disagree on what an aula
// holds. Returns { apostila, tarefa, outros, drive, total }.
function _aulaCounts(aulaNumber) {
  return releasesAdmin.aulaReleaseCounts(_turmaViewItems, aulaNumber);
}

// Items released with NO aula binding -> the "Outros (sem aula)" bucket count.
function _outrosCount() {
  let n = 0;
  (_turmaViewItems || []).forEach((it) => {
    const nums = Array.isArray(it.aula_numbers) ? it.aula_numbers : (it.aula_number != null ? [it.aula_number] : []);
    if (nums.length === 0 && releasesAdmin.releaseItemBucket(it)) n++;
  });
  return n;
}

function _countChip(glyph, n) {
  return '<span class="cdx-aula-cc">' + glyphSvg(glyph, { size: 13 }) + ' ' + n + '</span>';
}

function _aulaAppCount(aulaNumber) {
  return (_turmaViewApps || []).filter((a) => Number(a.aula_number) === Number(aulaNumber)).length;
}

function _aulaCountChipsHtml(aulaNumber) {
  const c = _aulaCounts(aulaNumber);
  const apps = _aulaAppCount(aulaNumber);
  let html = '';
  if (apps) html += _countChip('grid', apps);
  if (c.apostila) html += _countChip('book', c.apostila);
  if (c.tarefa) html += _countChip('clipboard', c.tarefa);
  if (c.outros) html += _countChip('layers', c.outros);
  if (c.drive) html += _countChip('folder', c.drive);
  return html || '<span class="cdx-aula-cc is-empty">' + _esc(t('cohorts.aula_no_content')) + '</span>';
}

// Is `a` the currently-selected aula? A pending (unsaved) new aula carries no id, so
// it is matched by the 'new' sentinel; saved aulas match by id.
function _isAulaSelected(a) {
  if (!a) return false;
  if (_selectedAulaId === 'new') return !!a._isNew;
  return a.id != null && String(a.id) === String(_selectedAulaId);
}

function _findSelectedAula() {
  if (_selectedAulaId === 'new') return _turmaAulas.find((a) => a._isNew) || null;
  return _turmaAulas.find((a) => a.id != null && String(a.id) === String(_selectedAulaId)) || null;
}

function _renderAulasHub(turma) {
  const el = _q(IDS.aulasList);
  if (!el) return;
  _unmountAulaEmbeds();
  // Keep a valid selection across reloads (reorder/save re-renders); fall back to the
  // first aula when the current selection no longer exists (e.g. after a turma switch).
  const valid = _selectedAulaId === 'outros'
    || (_selectedAulaId === 'new' && _turmaAulas.some((a) => a._isNew))
    || _turmaAulas.some((a) => a.id != null && String(a.id) === String(_selectedAulaId));
  if (!valid) { _selectedAulaId = _turmaAulas.length ? String(_turmaAulas[0].id) : null; _aulaTab = 'dados'; }

  el.innerHTML =
    '<div class="cdx-aulas-hub" id="cdx-aulas-hub">' +
      '<div class="cdx-aulas-hub-list cdx-pane">' +
        '<div class="cdx-aulas-hub-lh">' +
          '<span class="cdx-aulas-hub-lh-t">' + _esc(t('cohorts.col_aulas')) + ' · ' + _esc(turma.name) + '</span>' +
          '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-primary" id="cdx-btn-add-aula" title="' + _esc(t('cohorts.new_aula')) + '">+</button>' +
        '</div>' +
        '<div class="cdx-aulas-hub-rows" id="cdx-aulas-hub-rows"></div>' +
        '<div class="cdx-aulas-hub-outros' + (_selectedAulaId === 'outros' ? ' is-on' : '') + '" data-aula-id="outros">' +
          glyphSvg('layers', { size: 15 }) +
          '<span class="cdx-aulas-hub-outros-t">' + _esc(t('cohorts.aula_outros')) + '</span>' +
          '<span class="cdx-aula-cc">' + _outrosCount() + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="cdx-aulas-hub-detail cdx-pane" id="cdx-aulas-hub-detail"></div>' +
    '</div>';
  installResizer(_q('cdx-aulas-hub'), { storeKey: 'cdx_rz_aulas_hub', defaultPx: 300, min: 210, max: 520 });
  _renderAulaHubRows();
  _renderAulaDetail(turma);
  _wireAulasHubList(turma);
}

function _renderAulaHubRows() {
  const rowsEl = _q('cdx-aulas-hub-rows');
  if (!rowsEl) return;
  if (!_turmaAulas.length) {
    rowsEl.innerHTML = '<div class="cdx-empty">' + t('cohorts.no_aulas') + '</div>';
    return;
  }
  rowsEl.innerHTML = _turmaAulas.map((a, idx) => _renderAulaHubRow(a, idx)).join('');
}

function _renderAulaHubRow(a, idx) {
  const ds = _aulaDateStatus(a);
  const on = _isAulaSelected(a);
  const titleHtml = a.title ? _esc(a.title) : '<span class="is-empty">' + t('cohorts.aula_no_title') + '</span>';
  // Drag-to-reorder is meaningful with 2+ saved aulas; the row itself is draggable
  // (the detail editor lives in the right pane now, so there is no inline editor to
  // fight text selection). aula_number follows the order, so a drop renumbers and
  // remaps released content + lesson plan in lockstep (api.reorderAulas).
  const canDrag = _turmaAulas.length > 1 && !a._isNew;
  return (
    '<div class="cdx-aula-hub-row' + (on ? ' is-on' : '') + '" data-aula-idx="' + idx + '" data-aula-id="' + _esc(a._isNew ? 'new' : (a.id == null ? '' : a.id)) + '"' + (canDrag ? ' draggable="true"' : '') + '>' +
      '<span class="cdx-aula-hub-num">' + _esc(a.aula_number) + '</span>' +
      '<div class="cdx-aula-hub-info">' +
        '<div class="cdx-aula-hub-title">' + titleHtml + '</div>' +
        '<div class="cdx-aula-hub-sub">' +
          '<span class="cdx-rel-aula-date ' + ds.cls + '">' + _esc(ds.text) + '</span>' +
          '<span class="cdx-aula-hub-counts">' + _aulaCountChipsHtml(a.aula_number) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

// Right pane: the empty prompt, the Outros release composer, or the selected aula's
// detail (header + Dados/Liberações/Tarefas sub-tabs).
function _renderAulaDetail(turma) {
  const detailEl = _q('cdx-aulas-hub-detail');
  if (!detailEl) return;
  _unmountAulaEmbeds();
  if (_selectedAulaId === 'outros') {
    // Outros has no Dados/Tarefas; the whole detail is the no-aula release composer.
    detailEl.innerHTML =
      '<div class="cdx-aula-dh"><div class="cdx-aula-dh-main">' +
        '<h3 class="cdx-aula-dh-title">' + _esc(t('cohorts.aula_outros')) + '</h3>' +
        '<div class="cdx-aula-dh-sub">' + _esc(t('cohorts.aula_outros_sub')) + '</div>' +
      '</div></div>' +
      '<div class="cdx-aula-pane" id="cdx-aula-pane"></div>';
    const paneEl = detailEl.querySelector('#cdx-aula-pane');
    releasesAdmin.mount(paneEl, { clientSlug: turma.client_slug, turmaSlug: turma.slug, aula: 'outros', onChange: () => _refreshAulaCountsAfterEmbed(turma) });
    _aulaEmbedMounted.liberacoes = true;
    return;
  }
  const aula = _findSelectedAula();
  if (!aula) { detailEl.innerHTML = '<div class="cdx-placeholder">' + t('cohorts.aula_select_prompt') + '</div>'; return; }

  const counts = _aulaCounts(aula.aula_number);
  const ds = _aulaDateStatus(aula);
  const carga = (aula.hours != null && aula.hours !== '') ? (aula.hours + t('cohorts.aula_hours_unit')) : '';
  const subBits = [ds.text, carga].filter(Boolean).join(' · ');
  const markBtn = (aula.scheduled_for && !aula.happened_on)
    ? '<button type="button" class="cdx-btn cdx-btn-sm" data-aula-mark="' + _esc(aula.id) + '">' + _esc(t('cohorts.aula_mark_happened')) + '</button>'
    : '';
  // An unsaved new aula has no id yet, so Liberações/Tarefas (which release content TO
  // an aula) can't bind to it; show only Dados until it is saved.
  const subtabs = aula._isNew
    ? '<button type="button" class="cdx-aula-stab is-on" data-aulatab="dados" role="tab">' + _esc(t('cohorts.aula_tab_dados')) + '</button>'
    : '<button type="button" class="cdx-aula-stab' + (_aulaTab === 'dados' ? ' is-on' : '') + '" data-aulatab="dados" role="tab">' + _esc(t('cohorts.aula_tab_dados')) + '</button>' +
      '<button type="button" class="cdx-aula-stab' + (_aulaTab === 'liberacoes' ? ' is-on' : '') + '" data-aulatab="liberacoes" role="tab">' + _esc(t('cohorts.doss_liberacoes')) + ' <span class="cdx-aula-stab-b">' + counts.total + '</span></button>' +
      '<button type="button" class="cdx-aula-stab' + (_aulaTab === 'tarefas' ? ' is-on' : '') + '" data-aulatab="tarefas" role="tab">' + _esc(t('cohorts.doss_tarefas')) + ' <span class="cdx-aula-stab-b">' + counts.tarefa + '</span></button>';
  if (aula._isNew) _aulaTab = 'dados';

  detailEl.innerHTML =
    '<div class="cdx-aula-dh">' +
      '<div class="cdx-aula-dh-main">' +
        '<h3 class="cdx-aula-dh-title">' + _esc(t('cohorts.aula_label')) + ' ' + _esc(aula.aula_number) + (aula.title ? ' · ' + _esc(aula.title) : '') + '</h3>' +
        (subBits ? '<div class="cdx-aula-dh-sub">' + _esc(subBits) + '</div>' : '') +
      '</div>' +
      markBtn +
    '</div>' +
    '<div class="cdx-aula-subtabs" role="tablist">' + subtabs + '</div>' +
    '<div class="cdx-aula-pane" id="cdx-aula-pane"></div>';

  const mb = detailEl.querySelector('[data-aula-mark]');
  if (mb) mb.addEventListener('click', () => _markAulaHappened(aula));
  detailEl.querySelectorAll('.cdx-aula-stab').forEach((tab) => tab.addEventListener('click', () => {
    if (_aulaTab === tab.dataset.aulatab) return;
    _unmountAulaEmbeds();
    _aulaTab = tab.dataset.aulatab;
    detailEl.querySelectorAll('.cdx-aula-stab').forEach((x) => x.classList.toggle('is-on', x === tab));
    _renderAulaPane(turma, aula);
  }));
  _renderAulaPane(turma, aula);
}

// The active sub-tab's body: Dados is the reused aula editor; Liberações + Tarefas
// mount the shared content modules in aula-locked mode (one codebase, no per-aula copy).
function _renderAulaPane(turma, aula) {
  const paneEl = _q('cdx-aula-pane');
  if (!paneEl) return;
  _unmountAulaEmbeds();
  const onChange = () => _refreshAulaCountsAfterEmbed(turma);
  if (_aulaTab === 'liberacoes') {
    // Content composer + the "Aplicativos" release section stack in the same pane: the
    // app is content released to this aula, so it lives alongside the item composer.
    paneEl.innerHTML = '<div id="cdx-aula-rel-content"></div><div id="cdx-aula-rel-apps" class="cdx-aula-rel-apps-slot"></div>';
    releasesAdmin.mount(paneEl.querySelector('#cdx-aula-rel-content'), { clientSlug: turma.client_slug, turmaSlug: turma.slug, aula: aula.id, onChange });
    _aulaEmbedMounted.liberacoes = true;
    appRelease.mount(paneEl.querySelector('#cdx-aula-rel-apps'), { turmaId: turma.id, aulaNumber: aula.aula_number, onChange });
    _aulaEmbedMounted.apps = true;
    return;
  }
  if (_aulaTab === 'tarefas') {
    tarefasAdmin.mount(paneEl, { clientSlug: turma.client_slug, turmaSlug: turma.slug, aulaNumber: aula.aula_number,
      revealOn: !!turma.reveal_on_completion, aulaHappened: !!aula.happened_on, onChange });
    _aulaEmbedMounted.tarefas = true;
    return;
  }
  paneEl.innerHTML = '<div class="cdx-aula-dados">' + _renderAulaColEditor(aula) + '</div>';
  _wireAulaDadosEditor(paneEl, aula, turma);
}

// A Liberações/Tarefas embed changed the released set: refetch the view so the row
// chips + sub-tab badges refresh. The active pane stays mounted (no re-mount thrash).
function _refreshAulaCountsAfterEmbed(turma) {
  if (!turma.token) return;
  relApi.turmaView({ client_slug: turma.client_slug, turma_slug: turma.slug, token: turma.token })
    .then((vd) => {
      _turmaViewItems = (vd && vd.items) || [];
      _turmaViewApps = (vd && vd.apps) || [];
      _renderAulaHubRows();
      _repaintAulaBadges();
      _repaintOutrosCount();
    })
    .catch((e) => { if (window.bsLog) window.bsLog('cohorts: refresh aula counts failed: ' + (e && e.message || e), 'error'); });
}

// Repaint just the detail sub-tab count badges (Liberações total + Tarefas) without
// re-rendering the detail (which would unmount the live embed the user is editing).
function _repaintAulaBadges() {
  const aula = _findSelectedAula();
  if (!aula || _selectedAulaId === 'outros') return;
  const counts = _aulaCounts(aula.aula_number);
  const detailEl = _q('cdx-aulas-hub-detail');
  if (!detailEl) return;
  const badges = detailEl.querySelectorAll('.cdx-aula-stab .cdx-aula-stab-b');
  if (badges[0]) badges[0].textContent = counts.total;
  if (badges[1]) badges[1].textContent = counts.tarefa;
}

function _repaintOutrosCount() {
  const el = _q(IDS.aulasList);
  const c = el && el.querySelector('.cdx-aulas-hub-outros .cdx-aula-cc');
  if (c) c.textContent = _outrosCount();
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

// Wire the hub list: the add button, row + Outros selection, and drag-to-reorder.
// Listeners go on the freshly-rendered elements (recreated on every _renderAulasHub),
// so they never stack across renders.
function _wireAulasHubList(turma) {
  const addBtn = _q('cdx-btn-add-aula');
  if (addBtn) addBtn.addEventListener('click', () => _addNewAulaCol(turma));

  const hub = _q('cdx-aulas-hub');
  const listPane = hub && hub.querySelector('.cdx-aulas-hub-list');
  if (!listPane) return;
  listPane.addEventListener('click', (e) => {
    if (e.target.closest('.cdx-aulas-hub-outros')) { _selectAula(turma, 'outros'); return; }
    const row = e.target.closest('.cdx-aula-hub-row');
    if (row) _selectAula(turma, row.dataset.aulaId);
  });

  // Drag-to-reorder. Blocked while an unsaved new aula exists (it can't take part in
  // ordered_ids); the right-pane editor is no longer inline, so a list re-render does
  // not drop any editor.
  const rowsEl = _q('cdx-aulas-hub-rows');
  if (!rowsEl) return;
  let dragId = null;
  rowsEl.addEventListener('dragstart', (e) => {
    if (_turmaAulas.some((a) => a._isNew)) { e.preventDefault(); return; }
    const row = e.target.closest('.cdx-aula-hub-row');
    if (!row || !row.dataset.aulaId || row.dataset.aulaId === 'new') { e.preventDefault(); return; }
    dragId = row.dataset.aulaId;
    row.classList.add('is-dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  rowsEl.addEventListener('dragover', (e) => {
    if (dragId == null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  rowsEl.addEventListener('dragend', () => {
    rowsEl.querySelectorAll('.is-dragging').forEach((r) => r.classList.remove('is-dragging'));
    dragId = null;
  });
  rowsEl.addEventListener('drop', (e) => {
    if (dragId == null) return;
    e.preventDefault();
    const row = e.target.closest('.cdx-aula-hub-row');
    const tgtId = row ? row.dataset.aulaId : null;
    const fromId = dragId;
    dragId = null;
    if (!tgtId || tgtId === fromId || tgtId === 'new') return;
    _reorderAulas(turma, fromId, tgtId);
  });
}

// Select an aula (or the Outros bucket): leaving an unsaved new aula discards it,
// then repaint the rows + detail. Tears the live embed down first (it is re-mounted
// for the newly-selected aula by _renderAulaDetail).
function _selectAula(turma, aulaId) {
  if (String(_selectedAulaId) === String(aulaId)) return;
  if (_selectedAulaId === 'new') _turmaAulas = _turmaAulas.filter((a) => !a._isNew);
  _unmountAulaEmbeds();
  _selectedAulaId = aulaId;
  _aulaTab = 'dados';
  _renderAulaHubRows();
  _renderAulaDetail(turma);
}

// Move the dragged aula to the dropped-on aula's slot, renumber 1..N top-to-bottom
// (optimistic), then persist. aula_number is the binding key for released content +
// the lesson plan, so the worker remaps those in lockstep; on success we reload so the
// per-aula counts reflect the remap, on failure we reload to discard the optimistic order.
function _reorderAulas(turma, fromId, tgtId) {
  const ids = _turmaAulas.map((a) => String(a.id));
  const from = ids.indexOf(String(fromId));
  const to = ids.indexOf(String(tgtId));
  if (from === -1 || to === -1) return;
  const moved = _turmaAulas.splice(from, 1)[0];
  _turmaAulas.splice(to, 0, moved);
  _turmaAulas.forEach((a, i) => { a.aula_number = i + 1; });
  _renderAulaHubRows();
  _renderAulaDetail(turma);
  api.reorderAulas({
    client_slug: turma.client_slug,
    turma_slug: turma.slug,
    ordered_ids: _turmaAulas.map((a) => a.id),
  }).then(() => {
    toast.ok(t('cohorts.aulas_reordered'));
    _loadTurmaAulas(turma);  // refresh counts against the remapped aula numbers
  }).catch((err) => {
    if (window.bsLog) window.bsLog('cohorts: reorder aulas failed: ' + (err && err.message || err), 'error');
    notice.internal(t('cohorts.error') + ': ' + (err.message || err));
    _loadTurmaAulas(turma);
  });
}

// "+ Nova aula": push one unsaved aula (at most one at a time) and open it on Dados.
function _addNewAulaCol(turma) {
  if (!_turmaAulas.some((a) => a._isNew)) {
    const nums = _turmaAulas.map((a) => a.aula_number || 0);
    const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
    _turmaAulas.push({ id: null, aula_number: nextNum, title: '', scheduled_for: null, happened_on: null, rescheduled_from: null, rescheduled_note: null, _isNew: true });
  }
  _selectedAulaId = 'new';
  _aulaTab = 'dados';
  _renderAulasHub(turma);
  const titleInput = _q('cdx-aula-pane') && _q('cdx-aula-pane').querySelector('.cdx-aula-title');
  if (titleInput) setTimeout(() => titleInput.focus(), 0);
}

// "Marcar como ocorrida": stamp happened_on = scheduled_for (occurred on its planned
// day). ct_update_aula replaces every field, so rebuild the full payload.
function _markAulaHappened(aula) {
  const turma = _dossierTurma;
  if (!turma || !aula || !aula.scheduled_for) return;
  api.updateAula({
    client_slug: turma.client_slug, turma_slug: turma.slug,
    id: aula.id, aula_number: aula.aula_number,
    title: aula.title || '',
    scheduled_for: aula.scheduled_for || null,
    happened_on: aula.scheduled_for,
    rescheduled_from: aula.rescheduled_from || null,
    rescheduled_note: aula.rescheduled_note || null,
  }).then((r) => {
    if (r && r.error) throw new Error(r.error);
    aula.happened_on = aula.scheduled_for;
    toast.ok(t('releases.mark_happened_done'));
    _renderAulaHubRows();
    _renderAulaDetail(turma);
  }).catch((err) => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
}

// The Dados sub-tab editor wiring (the editor render is reused from _renderAulaColEditor).
// Save persists, then repaints the row + detail header keeping the selection; cancel
// reverts edits (or discards the unsaved new aula); delete removes it.
function _wireAulaDadosEditor(container, aula, turma) {
  const saveBtn   = container.querySelector('.cdx-aula-save');
  const cancelBtn = container.querySelector('.cdx-aula-cancel');
  const deleteBtn = container.querySelector('.cdx-aula-delete');
  const titleInput = container.querySelector('.cdx-aula-title');
  const schedInput = container.querySelector('.cdx-aula-scheduled');
  const hoursInput = container.querySelector('.cdx-aula-hours');
  const happInput  = container.querySelector('.cdx-aula-happened');
  const rfromInput = container.querySelector('.cdx-aula-rescheduled-from');
  const rnoteInput = container.querySelector('.cdx-aula-rescheduled-note');

  if (saveBtn) saveBtn.addEventListener('click', () => {
    const hoursVal = hoursInput && hoursInput.value.trim() !== '' ? Number(hoursInput.value) : null;
    const payload = {
      client_slug: turma.client_slug,
      turma_slug: turma.slug,
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
        if (created && created.id) { aula.id = created.id; aula._isNew = false; _selectedAulaId = String(aula.id); }
      }
      aula.title            = payload.title;
      aula.hours            = payload.hours;
      aula.scheduled_for    = payload.scheduled_for;
      aula.happened_on      = payload.happened_on;
      aula.rescheduled_from = payload.rescheduled_from;
      aula.rescheduled_note = payload.rescheduled_note;
      toast.ok(t('cohorts.aula_saved'));
      _renderAulaHubRows();
      _renderAulaDetail(turma);
      _refreshDerivedFacts();
    }).catch(err => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
  });

  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    if (aula._isNew) {
      _turmaAulas = _turmaAulas.filter((a) => !a._isNew);
      _selectedAulaId = _turmaAulas.length ? String(_turmaAulas[0].id) : null;
      _renderAulasHub(turma);
    } else {
      _renderAulaDetail(turma);  // reload the editor from current state (discard edits)
    }
  });

  if (deleteBtn) deleteBtn.addEventListener('click', () => {
    if (aula._isNew) {
      _turmaAulas = _turmaAulas.filter((a) => !a._isNew);
      _selectedAulaId = _turmaAulas.length ? String(_turmaAulas[0].id) : null;
      _renderAulasHub(turma);
      return;
    }
    _openArchiveConfirm({
      title: t('cohorts.delete_aula_title') + ' ' + aula.aula_number,
      message: t('cohorts.delete_aula_msg'),
      onConfirm() {
        api.deleteAula({ id: aula.id }).then(() => {
          _turmaAulas = _turmaAulas.filter((a) => !(a.id != null && String(a.id) === String(aula.id)));
          if (String(_selectedAulaId) === String(aula.id)) { _selectedAulaId = _turmaAulas.length ? String(_turmaAulas[0].id) : null; _aulaTab = 'dados'; }
          toast.ok(t('cohorts.aula_deleted'));
          _renderAulasHub(turma);
          _refreshDerivedFacts();
        }).catch(err => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
      }
    });
  });
}

// Tear down whichever Liberações/Tarefas embed is currently mounted in the detail
// pane (they are module singletons, so this stops esc-handler leaks across switches).
function _unmountAulaEmbeds() {
  if (_aulaEmbedMounted.liberacoes) { try { releasesAdmin.unmount(); } catch (_) { /* already gone */ } _aulaEmbedMounted.liberacoes = false; }
  if (_aulaEmbedMounted.apps) { try { appRelease.unmount(); } catch (_) { /* already gone */ } _aulaEmbedMounted.apps = false; }
  if (_aulaEmbedMounted.tarefas) { try { tarefasAdmin.unmount(); } catch (_) { /* already gone */ } _aulaEmbedMounted.tarefas = false; }
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
  _dossierTurma = null;
  _dossierDepsTried = false;
  _navPinned = true;
  _cleanup = [];
  _turmaViewItems = [];
  _selectedAulaId = null;
  _aulaTab = 'dados';
  _aulaEmbedMounted = { liberacoes: false, tarefas: false, apps: false };

  // Route by sub-tab. The Cursos sub-view is its own module; the default
  // (Concept A) merged Turmas+Clientes list → dossier view is the shell below.
  const sub = _resolveSub(ctx && ctx.sub);
  if (sub === 'cursos') { cursos.mount(viewEl); return; }

  _renderShell();
  _loadAll();
}

export function unmount() {
  cursos.unmount();
  _unmountAulaEmbeds();
  _cleanup.forEach(fn => fn());
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  // Remove any stray modal left by this module
  document.querySelectorAll('.cdx-modal-backdrop').forEach(bd => bd.parentNode && bd.parentNode.removeChild(bd));
}
