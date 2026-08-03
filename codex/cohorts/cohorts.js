// cohorts/cohorts.js
// Codex — Cohorts tab: Clients | Turmas | Aulas (three-column layout).
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.callWorker   (../js/worker-call.js, Codex-owned; was backstage/js/api-client.js)
import { cohorts as api, cp as cpApi, courses as coursesApi, certificates as certApi, releases as relApi, roteiro as roteiroApi, assetUrl } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc as _esc, slugify as _slugify } from '../js/dom.js';
import { aulaStatus } from '../js/aula-status.js';
import { glyphSvg } from '../js/glyphs.js';
import { mountRail } from '../js/list-rail.js';
import { openModal, closeModal } from '../js/modal.js';
import * as qrShare from '../js/qr-share-modal.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import { parseRosterLines } from './roster-parser.js';
import { initials } from '../js/initials.js';
import { isApprovalGated } from './participant-view.js';
import { legendButtonHtml, openPersonLegend } from './person-legend.js';
// THE people table — the same assembly the Alunos roster mounts, in the other scope (person-table.js).
// The dossiê Participantes panel is this component in `turma` scope; students.js is it in `global`.
import { createPersonTable } from './person-table.js';
// Remove here is scope-aware (out of THIS turma vs the person entirely) — turma-remove.js.
import { removeFromTurma } from './turma-remove.js';
import { emailValid as _emailValid, cpfValid as _cpfValid, formatCpf as _formatCpf, wireCpfMask as _wireCpfMask } from '../js/person-fields.js';
import { settingsHtml as accessSettingsHtml, wireSettings as wireAccessSettings } from '../js/access-panel.js';
import { mountForumAdmin } from './forum-admin.js';
import * as cursos from './courses.js';
import * as students from './students.js';
// track-44 — Comunicações (broadcast autorado), superfície de nível Cohorts.
import * as comunicados from './comunicados.js';
// Turma-scoped management surfaces, mounted turma-bound into the dossier sub-tabs
// (the same modules the Content tab used to host, now { turma }-driven so they skip
// the picker). Reused as-is, no composer logic is duplicated.
import * as releasesAdmin from '../content/releases.js';
import * as tarefasAdmin from '../content/tarefas.js';
import * as appRelease from './app-release.js';
// track-46: the aula's 4th sub-tab, visible to every admin (the dev-only gate
// was fatia 2's dormant-shipping device; fatia 2.5 removed it — see the CRUD
// carried by roteiro-view.js itself). roteiroView is the two-panel component
// (store-injected, also reused unchanged by cohorts/courses.js for the curso
// base editor, now adopting js/list-rail.js on its left panel); roteiro-store.js
// is the real per-aula store; roteiro-base.js is the base selector + promote
// controls mounted alongside the two-panel view.
import * as roteiroView from '../roteiro/roteiro-view.js';
import { createRoteiroStore } from '../roteiro/roteiro-store.js';
import * as roteiroBase from '../roteiro/roteiro-base.js';

// ── Sub-tab registry ──────────────────────────────────────────────────────────
// Cohorts gained sub-tabs with the Cursos data model: the operational
// Clientes→Turmas→Aulas view (default) + the reusable course/ementa registry.
export const SUBTABS = [
  { key: 'turmas', labelKey: 'cohorts.sub_turmas' },
  { key: 'cursos', labelKey: 'cohorts.sub_cursos' },
  { key: 'alunos', labelKey: 'cohorts.sub_alunos' },
  { key: 'comunicados', labelKey: 'cohorts.sub_comunicados' },
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
let _turmaAulas = [];
let _aulaRail = null;           // the aula-hub list is the shared list-rail (js/list-rail.js)
let _relClientSlug = null;
let _relTurmaSlug = null;
let _cpSessions = [];
let _turmaCourses = [];   // course list cached for the turma form's course picker
let _dossierTurma = null; // the turma currently shown in the dossier (#27 inline edit)
let _dossierDepsTried = false; // courses/cp loaded once for the inline selects
let _pickedCourse = null; // full course fetched when the picker changes (for ementa copy)
let _dossierParticipants = []; // cached PEOPLE (ct_list_people, filtered to this turma)
let _cleanup = []; // teardown functions pushed by mount
// Aulas hub (Layout A): the released items (ct_get_turma_view) feed the per-aula
// content counts; the rest is selection state for the list | detail split.
let _turmaViewItems = []; // released items, for the aula count chips/badges
let _turmaViewApps = [];  // granted apps (with aula_number), for the aula app chip
// Notification deep-link (bell -> dossier), seeded from ctx in mount and consumed
// ONCE on load: a tarefa-submission opens the turma on its aula's Tarefas sub-tab
// focused on the item; a forum item opens the Fórum sub-tab. Each is cleared as it
// is applied so a later manual navigation is never hijacked.
let _dossierDtab = 'dados';   // the ACTIVE dossier sub-tab, remembered across re-renders
                              // (async deps re-render used to reset it) — 'dados' |
                              // 'participantes' | 'aulas' | 'certs' | 'forum'. A deep-link
                              // (ctx.fdtab) seeds it; a manual turma open resets it to 'dados'.
let _deepAula = null;   // aula_number to auto-select
let _deepItem = null;   // tarefa item_id to focus in the Tarefas pane
let _selectedAulaId = null; // selected aula id (string) | 'outros' | null
let _aulaTab = 'dados';     // active per-aula sub-tab: 'dados' | 'liberacoes' | 'tarefas' | 'roteiro'
let _aulaEmbedMounted = { liberacoes: false, tarefas: false, apps: false, roteiro: false, roteiroBase: false }; // which detail embed is live
// The Roteiro pane's ct_get_aula_roteiro fetch is async (mount can no longer be
// synchronous once the store hits the real backend); this token guards against
// a stale response landing after the teacher already switched aula/sub-tab away
// (bumped by _unmountAulaEmbeds and re-set fresh on every roteiro pane mount).
let _roteiroLoadToken = 0;

// CLIENTES rail: the shared list-rail (js/list-rail.js) in width:autohide mode. It starts
// OPEN + pinned with the dossiê on the empty prompt; the first turma pick unpins it into the
// hover-reveal overlay (left screen edge reveals, cursor-leave hides). The reveal zone, the
// hide timer, Escape and the open class all live in the module now — this file only says
// WHEN it is pinned, through _navRail.pin(bool).
let _navRail = null;
let _navNotice = null;   // loading/error line shown in place of the list (via the rail's emptyText)
// "Continuar de onde eu estava": a última turma aberta, pra sobreviver a um refresh.
// O SET sempre existiu (em _selectTurma, com o comentário "reopen this turma after a
// refresh"); o READ nunca foi escrito, então todo F5 caía no prompt vazio com o rail
// pinado — a queixa do Élder. Um deep-link (?fclient/?fturma) tem precedência: é uma
// intenção explícita, o último aberto é só o default.
const LS_LAST = 'cdx_cohorts_last';
function _lsLastSet(clientSlug, turmaSlug) {
  try { localStorage.setItem(LS_LAST, clientSlug + '\n' + turmaSlug); } catch (_) { /* private mode */ }
}
function _lsLastGet() {
  let raw = null;
  try { raw = localStorage.getItem(LS_LAST); } catch (_) { return null; }
  if (!raw) return null;
  const [client, turma] = String(raw).split('\n');
  return (client && turma) ? { client, turma } : null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// _esc and _slugify are imported from ../js/dom.js

function _baseUrl() {
  return location.protocol + '//' + location.host;
}

function _turmaUrl(clientSlug, turmaSlug, token) {
  return _baseUrl() + '/trilha/' + clientSlug + '/' + turmaSlug + '?k=' + token;
}
// The canonical SHORT trail URL (Élder 2026-07-04): the 4-digit code IS the URL at
// rest (/trilha/<código>). Preferred over the legacy ?k= token form whenever the
// turma has its access_code (every turma gets one, migration 0021/0022); the long
// token form stays the fallback for any code-less legacy row.
function _codeUrl(code) {
  return _baseUrl() + '/trilha/' + code;
}
function _trailUrl(turma) {
  if (turma.access_code) return _codeUrl(turma.access_code);
  return turma.token ? _turmaUrl(turma.client_slug, turma.slug, turma.token) : null;
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
// Concept A merges Clientes+Turmas into ONE grouped list; only `list` and the
// new-client footer button remain. `aulasList` still names the aula sub-list
// rendered inside the dossier. (The search box is the RAIL's now, so it has no
// id here: js/list-rail.js renders and owns it.)
const IDS = {
  list:           'cdx-cohorts-list',
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
  // opts: { title, warningHtml, extraHtml?, confirmName, onConfirm(flags) }
  const html =
    '<div class="cdx-modal cdx-modal--md">' +
      '<div class="cdx-modal-title">' + _esc(opts.title) + '</div>' +
      '<div class="cdx-danger-zone">' + opts.warningHtml + '</div>' +
      (opts.extraHtml || '') +
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
    // Capture optional extra choices (e.g. "delete the linked session too") before the
    // modal is torn down, then hand them to the caller.
    const sessOpt = bd.querySelector('#cdx-del-session-opt');
    const flags = { deleteSession: !!(sessOpt && sessOpt.checked) };
    _closeModal(bd);
    opts.onConfirm(flags);
  });
}

// ── Archive confirmation modal ────────────────────────────────────────────────

function _openArchiveConfirm(opts) {
  // opts: { title, message, onConfirm }
  const html =
    '<div class="cdx-modal cdx-modal--sm">' +
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
    // No cdx-sm--open here any more: the rail mounts pinned (width.pinned defaults true)
    // and stamps the class itself on its first render, so the open state has ONE owner.
    '<div class="cdx-three-pane">' +

      // Concept A: ONE list, turmas grouped under their client — now the shared rail
      // (js/list-rail.js), which brings its own head/body/foot, the auto-hide, and the
      // band > section > row nesting. Still inside .cdx-cohorts-nav so the mobile
      // hamburger drawer (codex-topbar.js targets that selector) keeps working;
      // display:contents makes the listpane the real grid column on desktop.
      '<div class="cdx-cohorts-nav">' +
        '<div class="cdx-cohorts-listpane" id="' + IDS.list + '"></div>' +
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

  _buildNavRail();
  // The client head's own buttons (+ nova turma / ⚙ editar cliente) are consumer html
  // inside sections.renderHead, so the consumer wires them — the same split the aula rail
  // in this file already uses for its Outros footer. The rail ignores clicks inside
  // .cdx-rail-sec-acts, so this never races its accordion toggle.
  const navEl = _q(IDS.list);
  if (navEl) navEl.addEventListener('click', _onNavActionClick);
}

// The CLIENTES rail. Everything that used to be hand-rolled here — the hover-reveal
// auto-hide, the status bands, the exclusive accordion — is now the shared module's
// (js/list-rail.js), which is the whole point of track-41: ONE rail, not a bespoke copy
// per screen. This file keeps only what is genuinely Clientes: which turmas exist, how a
// client is classified, and what a head/row looks like inside.
function _buildNavRail() {
  const el = _q(IDS.list);
  if (!el) return;
  _navRail = mountRail(el, {
    title: t('cohorts.clients_title'),
    add: { label: '+', title: t('cohorts.new_client'), onAdd: () => _openClientForm(null) },
    items: () => _navModel().reduce((all, g) => all.concat(g.turmas), []),
    getId: (tm) => tm.client_slug + '/' + tm.slug,
    // Turma slugs are unique only WITHIN a client, so the rail's single id must be the pair.
    onSelect: (id) => { const i = id.indexOf('/'); _selectTurma(id.slice(0, i), id.slice(i + 1)); },
    selectedId: () => (_relClientSlug && _relTurmaSlug ? _relClientSlug + '/' + _relTurmaSlug : null),
    renderRow: (tm) => ({ main: _turmaRowMain(tm) }),
    // Phase accent + archived dimming live on the row element itself (border-left: var(--ph)).
    rowClass: (tm) => _turmaPhase(tm).cls + (tm.status === 'archived' ? ' is-archived' : ''),
    // The search box is BACK (track-56 fase 4). It had been lost in the migration to this rail:
    // the id and the .cdx-cohorts-search rules survived, and _navModel still filtered by a query
    // variable that no input ever wrote to, so the code read as if Clientes had a search while
    // the screen had none. The rail owns the query now, so there is nothing left to drift.
    // A turma is findable by its own name, by the course booked into it, and by the CLIENT it
    // belongs to, which is how Élder actually looks for one ("a turma do TJSE").
    search: {
      fields: (tm) => [tm.name, tm.display_name, tm.course_title, _clientNameOf(tm.client_slug)],
      placeholder: t('cohorts.search_ph'),
    },
    emptyText: (q) => _navNotice || t(String(q || '').trim() ? 'cohorts.no_search_results' : 'cohorts.no_clients'),
    sections: {
      of: (tm) => tm.client_slug,
      list: () => _navModel().map((g) => ({ id: g.client.slug, client: g.client, band: g.band })),
      exclusive: true,                        // accordion: one client open at a time
      openId: () => _expandedClient,          // ...and THIS file owns which one
      onToggle: (slug) => _toggleClient(slug),
      renderHead: (sec, count) => _clientHead(sec.client, count),
      emptyText: t('cohorts.no_turmas'),
    },
    bands: {
      of: (sec) => sec.band,
      list: () => _SECTIONS.map((s) => ({ id: s, title: t('cohorts.section_' + s) })),
    },
    width: {
      mode: 'autohide',
      layoutEl: _viewEl.querySelector('.cdx-three-pane'),   // the class toggles on the layout, not the rail
      openClass: 'cdx-sm--open',
    },
  });
  _renderList();
}

// ── Merged list: clients + their turmas (Concept A) ───────────────────────────

// Load clients, then every client's turmas (the rich ct_list_turmas rows the
// dossier needs — ct_list_all_turmas lacks the course-instance columns), and
// render them as one grouped list. Re-binds the open dossier to the fresh turma
// object so edits/archives reflect; falls back to selecting the first turma.
function _loadAll() {
  _navNotice = t('cohorts.loading');   // the rail owns its body now: say it through emptyText
  _renderList();                       // rather than overwriting the container out from under it
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
    // BEFORE the render: _expandedClient is what the rail reads back through sections.openId,
    // so the restored/deep-linked turma's client must already be open on the first paint.
    if (cur) { _selectedClientSlug = cur.client_slug; _expandedClient = cur.client_slug; }
    _navNotice = null;
    _renderList();
    if (cur) { _navRail.pin(false); _renderDossier(cur); }
    else {
      // No deep-link: start with the rail pinned open and the dossiê showing the
      // empty prompt until Élder opens a turma (mirrors the Questions picker).
      _relClientSlug = null; _relTurmaSlug = null;
      _navRail.pin(true);
      const dEl = _q('cdx-turma-dossier');
      if (dEl) dEl.innerHTML = '<div class="cdx-placeholder">' + t('cohorts.select_turma_prompt') + '</div>';
    }
  }).catch((e) => {
    if (window.bsLog) window.bsLog(t('cohorts.error_loading') + ': ' + (e && e.message || e), 'error');
    _navNotice = t('cohorts.error_loading');
    _renderList();
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

// The ONE shape both rail callbacks read (items + sections.list): the visible clients, each
// with its sorted turmas and its status band. Derived, never stored — a single source means
// the row list and the section list cannot disagree about what is on screen.
// The client's display name, for the rail's search fields (a turma carries only the slug).
function _clientNameOf(slug) {
  const c = _clients.find((x) => x.slug === slug);
  return c ? (c.display_name || c.name || '') : '';
}

function _navModel() {
  const byClient = {};
  _turmas.forEach((tm) => { (byClient[tm.client_slug] = byClient[tm.client_slug] || []).push(tm); });
  // NO search filtering here any more: the rail owns the query, narrows `items` itself, and
  // forces hideWhenEmpty on every level while a search is live, so a client whose turmas all miss
  // disappears on its own. This function is back to answering one question, "what exists".
  return _clients
    .filter((c) => c.status !== 'archived')
    .map((c) => {
      const all = byClient[c.slug] || [];
      // band from ALL the client's turmas; rows sorted (future on top).
      return { client: c, turmas: _sortTurmas(all), band: _clientStatus(all) };
    });
}

function _renderList() {
  if (!_navRail) return;
  _navRail.render();
  // Re-run after EVERY render: the rail replaces its body wholesale, so each render emits
  // fresh <img> elements and the previous error handlers go with the old ones.
  _wireAvatars(_q(IDS.list));
}

// If a client icon fails to load (missing/blocked R2 object), swap it for the
// initials avatar so the head never shows a broken-image glyph.
function _wireAvatars(el) {
  if (!el) return;
  el.querySelectorAll('.cdx-cg-ava-img').forEach((img) => {
    img.addEventListener('error', () => {
      const span = document.createElement('span');
      span.className = 'cdx-cg-ava';
      span.textContent = img.dataset.initials || '';
      img.replaceWith(span);
    }, { once: true });
  });
}

// The guts of a client's section head. The rail owns the head shell, the caret and the
// toggle wiring; this owns what Clientes puts inside it — the avatar and the two actions.
function _clientHead(client, count) {
  const name = client.display_name || client.name;
  // Use the client's own icon when it has one (icon_path is an R2 key, so it goes
  // through _iconSrc to a served URL); fall back to the initials if it fails to load.
  const ava = client.icon_path
    ? '<img class="cdx-cg-ava cdx-cg-ava-img" src="' + _esc(_iconSrc(client.icon_path)) + '" alt="" data-initials="' + _esc(_initials(name)) + '">'
    : '<span class="cdx-cg-ava">' + _esc(_initials(name)) + '</span>';
  return {
    main: ava + '<span class="cdx-cg-name" title="' + _esc(name) + '">' + _esc(name) + '</span>',
    act:
      '<button type="button" class="cdx-cg-act" data-action="new-turma" data-client-slug="' + _esc(client.slug) + '" title="' + t('cohorts.new_turma') + '">+</button>' +
      '<button type="button" class="cdx-cg-act" data-action="edit-client" data-client-slug="' + _esc(client.slug) + '" title="' + t('cohorts.edit') + '">&#9881;</button>',
  };
}

// The inside of a turma row. The rail owns the row element (and stamps the phase/archived
// classes from rowClass); this owns the two lines of text. The phase reads as the row's
// left accent bar, colored via --ph from the phase class — hence rowClass, not markup here.
function _turmaRowMain(tm) {
  const archived = tm.status === 'archived';
  const ph = _turmaPhase(tm);
  const course = tm.course_title ? _esc(tm.course_title) : t('cohorts.tf_no_course');
  const n = tm.aula_count || 0;
  const countLabel = n === 1 ? '1 ' + t('cohorts.aula_singular') : n + ' ' + t('cohorts.aula_plural');
  const archBadge = archived ? ' <span class="cdx-badge cdx-badge-danger">' + t('cohorts.archived') + '</span>' : '';
  return (
    '<div class="cdx-ti-main" title="' + _esc(ph.label) + '">' +
      '<div class="cdx-ti-t">' + _esc(tm.name) + archBadge + '</div>' +
      '<div class="cdx-ti-s">' + course + ' &middot; ' + _esc(countLabel) + '</div>' +
    '</div>'
  );
}

// The head actions are consumer html, so the consumer handles their clicks; the rail
// deliberately ignores anything inside .cdx-rail-sec-acts (see list-rail.js onClick).
function _onNavActionClick(e) {
  const actBtn = e.target.closest('[data-action]');
  if (!actBtn) return;
  const action = actBtn.dataset.action;
  const cs = actBtn.dataset.clientSlug;
  if (action === 'new-turma') { _selectedClientSlug = cs; _openTurmaForm(null); return; }
  if (action === 'edit-client') { const c = _clients.find((x) => x.slug === cs); if (c) _openClientForm(c); }
}

// Accordion toggle: open the clicked client (closing whichever was open), or collapse it
// if it was already open. This file holds the truth (_expandedClient) and re-renders from
// it; the rail reads it back through sections.openId and never keeps its own copy.
function _toggleClient(slug) {
  _expandedClient = (_expandedClient === slug) ? null : slug;
  if (_expandedClient) _selectedClientSlug = _expandedClient;
  _renderList();
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
    '<div class="cdx-modal cdx-modal--lg">' +
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

  const bd = _openModal(html, { disableBackdropClose: true });

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
// Prefers the SHORT /trilha/<código> URL (stable across token rotations) when the
// turma has an access_code, matching the trail card built in _renderDossier.
function _refreshDossierTrail(turma) {
  if (_dossierTurma !== turma) return;
  const el = _q('cdx-turma-dossier');
  if (!el) return;
  const url = _trailUrl(turma);
  if (!url) return;
  const copyBtn = el.querySelector('[data-doss="copyurl"]');
  if (copyBtn) copyBtn.dataset.url = url;
  const qrBtn = el.querySelector('[data-doss="qrshare"]');
  if (qrBtn) qrBtn.dataset.url = url;
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
  const sessCode = turma.classpulse_session_id || turma.access_code || null;
  // A. One-way turma/session coupling: the turma owns an auto-created session; offer to
  // delete it together (checked by default, since a kept session would be orphaned), but
  // let the admin keep it if it doubles as a standalone Q&A.
  const sessOpt = sessCode
    ? '<label class="cdx-del-session-opt" style="display:flex;align-items:center;gap:.5rem;margin-top:.9rem;font-size:0.85rem;color:var(--text-secondary);cursor:pointer">' +
        '<input type="checkbox" id="cdx-del-session-opt" checked> ' +
        '<span>' + _esc(t('cohorts.delete_turma_session_opt')) + ' · <code>' + _esc(sessCode) + '</code></span></label>'
    : '';
  _openDeleteConfirm({
    title: t('cohorts.delete_turma_btn'),
    warningHtml: '<p style="font-size:0.85rem;color:var(--text-secondary);margin:0">' + t('cohorts.delete_turma_warning') + '</p>',
    extraHtml: sessOpt,
    confirmName: turma.name,
    onConfirm(flags) {
      api.deleteTurma({ client_slug: turma.client_slug, slug: turma.slug, delete_session: !!(flags && flags.deleteSession) }).then(() => {
        toast.ok(t('cohorts.turma_deleted'));
        const wasSelected = _relClientSlug === turma.client_slug && _relTurmaSlug === turma.slug;
        _turmas = _turmas.filter((tm) => !(tm.client_slug === turma.client_slug && tm.slug === turma.slug));
        _renderList();
        if (wasSelected) {
          // Back to the pinned picker with the empty prompt (mirrors Questions),
          // rather than auto-jumping to another turma.
          _relClientSlug = null; _relTurmaSlug = null; _dossierTurma = null;
          _navRail.pin(true);
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

// Copy just the bare 4-digit access code (the number a student types at /trilha).
function _copyCode(code) {
  navigator.clipboard.writeText(code)
    .then(() => toast.info(t('cohorts.code_copied')))
    .catch(() => toast.err(t('cohorts.copy_failed') + ': ' + code));
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
          '<small class="cdx-field-hint">' + t('cohorts.field_whatsapp_hint') + '</small>' +
        '</div>' +
        '<div class="cdx-field"><label>' + t('cohorts.field_classpulse') + '</label>' +
          '<select id="cdx-tf-classpulse">' + cpOptions + '</select>' +
        '</div>' +
        '<div class="cdx-modal-actions">' +
          '<button class="cdx-btn" id="cdx-tf-cancel">' + t('cohorts.cancel') + '</button>' +
          '<button class="cdx-btn cdx-btn-primary" id="cdx-tf-save">' + (isEdit ? t('cohorts.save') : t('cohorts.create')) + '</button>' +
        '</div>' +
      '</div>';

    const bd = _openModal(html, { disableBackdropClose: true });
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
          // A new turma auto-creates its own session (codes redesign); drop the cached
          // session list so the dossier's session select shows it right away, no F5. [item C]
          if (!isEdit) { _cpSessions = []; _dossierDepsTried = false; }
          _loadAll();
        }).catch(err => notice.internal(t('cohorts.error') + ': ' + (err.message || err)));
    });
  });
}

// ── CPF utilities ─────────────────────────────────────────────────────────────

// _emailValid / _cpfValid / _formatCpf / _wireCpfMask now live in js/person-fields.js so the Alunos
// roster validates and masks exactly the same way (imported as the old names above).

// ── Participantes: add + import (the unified list itself lives in the dossier panel) ──

// The participant-list legend now lives in cohorts/person-legend.js — the SAME card the Usuários
// roster opens (Élder 2026-07-15: "let's put the legend back on both people and participant
// lists"). It was private here, which is why the roster never had one.

// Add a single participant (name + e-mail + optional CPF). A focused form, NOT a
// second copy of the list — the unified list lives in the dossier panel and is
// refreshed on save. (Mock B+C2: the "+ Adicionar" header button.)
function _openAddParticipant(turma) {
  const html =
    '<div class="cdx-modal cdx-modal--lg">' +
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
  const bd = _openModal(html, { disableBackdropClose: true });
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
  const bd = _openModal(html, { disableBackdropClose: true });
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

// ── Turma selection (drives the dossier) ──────────────────────────────────────

function _selectTurma(clientSlug, turmaSlug) {
  if (!clientSlug || !turmaSlug) return;
  if (clientSlug === _relClientSlug && turmaSlug === _relTurmaSlug) return;
  // New turma: reset the aula hub selection so it opens on the first aula's Dados, and
  // the dossier sub-tab back to Dados (a manual open is not a deep-link).
  _selectedAulaId = null;
  _aulaTab = 'dados';
  _dossierDtab = 'dados';
  _relClientSlug = clientSlug;
  _relTurmaSlug = turmaSlug;
  _lsLastSet(clientSlug, turmaSlug);   // reopen this turma after a refresh (read back in mount)
  _selectedClientSlug = clientSlug; // new-turma / form context follows the selection
  _expandedClient = clientSlug;     // selecting a turma opens its client group
  const turma = _turmas.find((x) => x.client_slug === clientSlug && x.slug === turmaSlug);
  _renderDossier(turma);
  _renderList();
  _navRail.pin(false);   // first pick flips the rail to the hover-reveal overlay
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
  // The active sub-tab is state, not hardcoded, so an async re-render (deps load) keeps
  // it — and a deep-link (e.g. the e-sino → Participantes) survives that re-render.
  const _KNOWN_DTABS = ['dados', 'participantes', 'aulas', 'certs', 'forum'];
  const _dt = _KNOWN_DTABS.indexOf(_dossierDtab) >= 0 ? _dossierDtab : 'dados';
  const _tabCls = (k) => 'cdx-subtab' + (k === _dt ? ' active' : '');
  const _panHide = (k) => (k === _dt ? '' : ' hidden');
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
  // track-39: expected size (numeric) + default class hours (HH:MM). Auto-save via the same
  // [data-edit-field] wiring. Blank size -> the throttle floors at 20; blank hours -> the schedule
  // stays inactive and the Janela button governs the window manually.
  const editNum = (field, label, value, ph2) =>
    '<div class="cdx-doss-fact cdx-doss-fact--edit"><label>' + _esc(label) + '</label>' +
    '<input class="cdx-doss-edit" type="number" min="1" step="1" inputmode="numeric" data-edit-field="' + field + '" value="' + _esc(value == null ? '' : value) + '"' + (ph2 ? ' placeholder="' + _esc(ph2) + '"' : '') + '></div>';
  const editTime = (field, label, value) =>
    '<div class="cdx-doss-fact cdx-doss-fact--edit"><label>' + _esc(label) + '</label>' +
    '<input class="cdx-doss-edit" type="time" data-edit-field="' + field + '" value="' + _esc(value == null ? '' : value) + '"></div>';
  const courseOpts = '<option value="">' + _esc(t('cohorts.tf_no_course')) + '</option>' +
    (_turmaCourses || []).map((c) => '<option value="' + _esc(String(c.id)) + '"' + (String(turma.course_id || '') === String(c.id) ? ' selected' : '') + '>' + _esc(c.title) + '</option>').join('');
  const fmtOpts = '<option value="">' + _esc(t('cohorts.none')) + '</option>' +
    _TF_FORMATS.map((k) => '<option value="' + k + '"' + (turma.format === k ? ' selected' : '') + '>' + _esc(t('cohorts.fmt_' + k)) + '</option>').join('');
  const cpOpts = '<option value="">' + _esc(t('cohorts.none')) + '</option>' +
    (_cpSessions || []).map((s) => '<option value="' + _esc(s.id) + '"' + (String(turma.classpulse_session_id || '') === String(s.id) ? ' selected' : '') + '>' + _esc(s.name) + '</option>').join('');
  // The ClassPulse session fact shares its cell with a shortcut that jumps straight to the
  // connected session (Perguntas tab, deep-linked ?session=<code>). The session id IS the
  // session code (list_sessions/cp_get_live_session alias them), so it deep-links directly.
  const sessGoHref = (id) => '/codex/?tab=questions&session=' + encodeURIComponent(id);
  const classpulseFact =
    '<div class="cdx-doss-fact cdx-doss-fact--edit cdx-doss-fact--session">' +
      '<label>' + _esc(t('cohorts.field_classpulse')) + '</label>' +
      '<div class="cdx-doss-session-row">' +
        '<select class="cdx-doss-edit" data-edit-field="classpulse_session_id">' + cpOpts + '</select>' +
        '<a class="cdx-btn cdx-btn-sm cdx-doss-session-go' + (turma.classpulse_session_id ? '' : ' is-disabled') + '"' +
          (turma.classpulse_session_id ? ' href="' + _esc(sessGoHref(turma.classpulse_session_id)) + '"' : ' aria-disabled="true"') +
          ' title="' + _esc(t(turma.classpulse_session_id ? 'cohorts.session_open_title' : 'cohorts.session_none_title')) + '"' +
          ' aria-label="' + _esc(t(turma.classpulse_session_id ? 'cohorts.session_open_title' : 'cohorts.session_none_title')) + '">&#8599;</a>' +
      '</div>' +
    '</div>';
  const ph = _turmaPhase(turma);
  const archived = turma.status === 'archived';
  // 3d: the trail card now carries the SHORT /trilha/<código> URL (falls back to the
  // legacy token URL only for a code-less legacy turma).
  const url = _trailUrl(turma);
  // The bare 4-digit access code the student types at /trilha; rendered as a button
  // INSIDE the trail card's action row (next to the QR button, with the others), click
  // copies the digits — not a separate fact box.
  const code = turma.access_code || null;
  const codeBtn = code
    ? '<button type="button" class="cdx-btn cdx-btn-sm cdx-doss-code-btn" data-doss="copycode" data-code="' + _esc(code) + '" title="' + _esc(t('cohorts.copy_code_title')) + '" aria-label="' + _esc(t('cohorts.copy_code_title')) + '">' + _esc(code) + '</button>'
    : '';
  const trailCard =
    '<div class="cdx-doss-fact cdx-doss-fact--trail"><label>' + _esc(t('cohorts.field_trail')) + '</label>' +
    (url
      ? '<div class="cdx-doss-trail-acts">' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-doss="copyurl" data-url="' + _esc(url) + '">' + _esc(t('cohorts.copy_url')) + '</button>' +
          '<a class="cdx-btn cdx-btn-sm" href="' + _esc(url) + '" target="_blank" rel="noopener" title="' + _esc(t('cohorts.open_url')) + '">&#8599;</a>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-doss="regen" title="' + _esc(t('cohorts.regen_token_title')) + '">&#8635;</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-doss="qrshare" data-url="' + _esc(url) + '" data-code="' + _esc(code || '') + '" title="' + _esc(t('cohorts.qr_title')) + '" aria-label="' + _esc(t('cohorts.qr_title')) + '">' + glyphSvg('qr', { size: 14 }) + '</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm cdx-doss-janela" data-doss="janela" data-cs="' + _esc(turma.client_slug) + '" data-slug="' + _esc(turma.slug) + '" title="' + _esc(t('cohorts.window_title')) + '">' + _esc(t('cohorts.window')) + '</button>' +
          codeBtn +
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
      // cdx-subrow--local: stays visible + scrolls horizontally on phones, in place
      // (not the module-level strip, which floats above the bottom nav instead).
      '<div class="cdx-subrow cdx-doss-tabs cdx-subrow--local"><div class="cdx-substrip" role="tablist">' +
        '<button type="button" class="' + _tabCls('dados') + '" data-dtab="dados" role="tab">' + _esc(t('cohorts.sec_turma_data')) + '</button>' +
        '<button type="button" class="' + _tabCls('participantes') + '" data-dtab="participantes" role="tab">' + _esc(t('cohorts.participants_title')) + ' <span class="cdx-secount" id="cdx-doss-p-count"></span></button>' +
        '<button type="button" class="' + _tabCls('aulas') + '" data-dtab="aulas" role="tab">' + _esc(t('cohorts.col_aulas')) + '</button>' +
        '<button type="button" class="' + _tabCls('certs') + '" data-dtab="certs" role="tab">' + _esc(t('cohorts.doss_certs')) + '</button>' +
        '<button type="button" class="' + _tabCls('forum') + '" data-dtab="forum" role="tab">' + _esc(t('cohorts.doss_forum')) + '</button>' +
      '</div></div>' +
      // Dados panel = turma facts + Acesso (the short config block folds in here).
      '<div class="cdx-doss-panel" data-dpanel="dados"' + _panHide('dados') + '>' +
        '<div class="cdx-doss-facts">' +
          editSelect('course_id', t('cohorts.tf_course'), courseOpts, 'cdx-doss-fact--course') +
          factId('cdx-doss-carga', t('cohorts.course_hours_label'), cargaDerived) +
          factId('cdx-doss-encontros', t('cohorts.tf_meetings'), encontrosDerived) +
          fact(t('cohorts.tf_date_start'), dStart) +
          fact(t('cohorts.tf_date_end'), dEnd) +
          editNum('size', t('cohorts.tf_size'), turma.size, t('cohorts.tf_size_ph')) +
          editTime('start_hour', t('cohorts.tf_start_hour'), turma.start_hour) +
          editTime('end_hour', t('cohorts.tf_end_hour'), turma.end_hour) +
          editSelect('format', t('cohorts.tf_format'), fmtOpts) +
          editText('place', t('cohorts.tf_place'), turma.place, t('cohorts.tf_place_ph')) +
          editText('display_name', t('cohorts.field_display_name'), turma.display_name, t('cohorts.field_display_placeholder')) +
          '<div class="cdx-doss-sep" role="separator"></div>' +
          editText('whatsapp_url', t('cohorts.field_whatsapp'), turma.whatsapp_url, 'https://chat.whatsapp.com/...') +
          classpulseFact +
          trailCard +
        '</div>' +
        '<div class="cdx-doss-subhead">' + _esc(t('cohorts.sec_access')) + '</div>' +
        '<div id="cdx-doss-acesso"><span class="cdx-empty">' + _esc(t('cohorts.loading')) + '</span></div>' +
      '</div>' +
      // Participantes panel (the roster/help controls move into a panel toolbar).
      '<div class="cdx-doss-panel" data-dpanel="participantes"' + _panHide('participantes') + '>' +
        '<div class="cdx-doss-panel-bar">' +
          legendButtonHtml('doss') +
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
      '<div class="cdx-doss-panel" data-dpanel="aulas"' + _panHide('aulas') + '>' +
        '<div id="' + IDS.aulasList + '"><div class="cdx-empty">' + _esc(t('cohorts.loading_aulas')) + '</div></div>' +
      '</div>' +
      // Certificados panel.
      '<div class="cdx-doss-panel" data-dpanel="certs"' + _panHide('certs') + '>' +
        '<div class="cdx-doss-sec-actions"><a class="cdx-btn cdx-btn-sm cdx-btn-primary" href="/codex/?tab=certificates&sub=emitidos">' + _esc(t('cohorts.doss_emit')) + '</a></div>' +
        '<div id="cdx-doss-certs"><span class="cdx-empty">' + _esc(t('cohorts.loading')) + '</span></div>' +
      '</div>' +
      // Fórum panel (Phase 4 fills the admin moderation view).
      '<div class="cdx-doss-panel" data-dpanel="forum"' + _panHide('forum') + '>' +
        '<div id="cdx-doss-forum"><span class="cdx-empty">' + _esc(t('cohorts.doss_forum_empty')) + '</span></div>' +
      '</div>' +
    '</div>';

  el.querySelectorAll('[data-doss]').forEach((b) => b.addEventListener('click', (e) => {
    const a = b.dataset.doss;
    // padd/pimport/phelp live inside the panel bar; stop the click so it doesn't toggle.
    if (a === 'padd' || a === 'pimport' || a === 'phelp') e.stopPropagation();
    if (a === 'padd') _openAddParticipant(turma);
    else if (a === 'pimport') _openImportParticipants(turma);
    else if (a === 'phelp') openPersonLegend({ scope: 'turma' });
    else if (a === 'archive') _archiveTurma(turma.client_slug, turma.slug);
    else if (a === 'unarchive') _unarchiveTurma(turma.client_slug, turma.slug);
    else if (a === 'delete') _deleteTurma(turma);
    else if (a === 'regen') _regenToken(turma.client_slug, turma.slug);
    else if (a === 'copyurl') _copyUrl(b.dataset.url);
    else if (a === 'copycode') _copyCode(b.dataset.code);
    else if (a === 'qrshare') qrShare.open({ joinUrl: b.dataset.url, code: b.dataset.code || null });
    else if (a === 'janela') _toggleDossierWindow(b);
  }));

  // Paint the Janela (validation window) button from the live server state on mount. Separate
  // from the QR modal (Élder): the QR button shows the code, this one opens/closes the window.
  const _janelaBtn = el.querySelector('[data-doss="janela"]');
  if (_janelaBtn) {
    api.getEnrollment({ client_slug: _janelaBtn.dataset.cs, slug: _janelaBtn.dataset.slug })
      .then((r) => { _janelaBtn.classList.toggle('is-open', !!(r && r.ok && r.open)); })
      .catch(() => { /* best-effort; the button still toggles on click */ });
  }

  // Per-turma sub-tab switching: show the picked panel, hide the rest. Loaders fire eagerly on
  // mount, so switching is pure show/hide — EXCEPT Participantes, which we re-fetch on open so the
  // list reflects live approvals/validations without a full-page refresh (cheap: one call, no poll).
  const _dtabs = el.querySelectorAll('.cdx-subtab[data-dtab]');
  const _dpanels = el.querySelectorAll('.cdx-doss-panel[data-dpanel]');
  _dtabs.forEach((tab) => tab.addEventListener('click', () => {
    const key = tab.dataset.dtab;
    _dossierDtab = key;   // remember it, so an async re-render (deps load) keeps this tab
    _dtabs.forEach((x) => x.classList.toggle('active', x === tab));
    _dpanels.forEach((p) => { p.hidden = p.dataset.dpanel !== key; });
    if (key === 'participantes') _loadDossierParticipants(turma);
  }));

  _wireDossierInlineEdit(el, turma);
  // Keep the "go to connected session" shortcut in sync when the session select changes,
  // before any re-render (the inline-edit auto-save updates turma but doesn't repaint here).
  const _sessSel = el.querySelector('.cdx-doss-fact--session select');
  const _sessGo = el.querySelector('.cdx-doss-session-go');
  if (_sessSel && _sessGo) _sessSel.addEventListener('change', () => {
    const v = _sessSel.value;
    if (v) {
      _sessGo.setAttribute('href', sessGoHref(v));
      _sessGo.classList.remove('is-disabled');
      _sessGo.removeAttribute('aria-disabled');
      _sessGo.setAttribute('title', t('cohorts.session_open_title'));
      _sessGo.setAttribute('aria-label', t('cohorts.session_open_title'));
    } else {
      _sessGo.removeAttribute('href');
      _sessGo.classList.add('is-disabled');
      _sessGo.setAttribute('aria-disabled', 'true');
      _sessGo.setAttribute('title', t('cohorts.session_none_title'));
      _sessGo.setAttribute('aria-label', t('cohorts.session_none_title'));
    }
  });
  // Acesso section: the per-turma gating switches, mounted from the shared access
  // panel (same component the Alunos tab uses, so the logic lives in one place).
  const accEl = el.querySelector('#cdx-doss-acesso');
  if (accEl) {
    accEl.innerHTML = accessSettingsHtml(turma);
    wireAccessSettings(accEl, turma, { api, clientSlug: turma.client_slug, slug: turma.slug });
  }
  // The course + classpulse selects need their option lists; load once and re-render this
  // dossier when they arrive (so the saved option is selectable).
  // _dossierDepsTried is part of the CONDITION, not just of _ensureDossierDeps' internals: once
  // tried, that helper invokes the callback SYNCHRONOUSLY, and the callback re-enters
  // _renderDossier. So asking again after a try that came back EMPTY recursed until the stack
  // blew (RangeError), while every level re-fired the aulas/participants/certs/forum loaders —
  // the crash and the minute-long Aulas sub-tab were the same bug. Empty is a legitimate answer
  // (a client with no courses yet, exactly what staging is), not a reason to ask forever.
  if (!_dossierDepsTried && ((!_turmaCourses || !_turmaCourses.length) || (!_cpSessions || !_cpSessions.length))) {
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
        .catch((err) => {
          // The facade THROWS on a worker {error} (the Error carries .data). The course-change
          // guard reverts the select + warns; anything else is an internal error.
          const data = (err && err.data) || {};
          if (data.error === 'course_change_has_apostila_releases') {
            inp.value = cur;
            notice.warn(t('cohorts.course_change_blocked').replace('{n}', data.released_count));
            return;
          }
          notice.internal(t('cohorts.error') + ': ' + (err.message || err));
        });
    });
  });
}

// Toggle the turma's validation window from the dossier (open/close). Acts, then re-reads the
// authoritative state and repaints. Mirrors the session's Janela button; both drive ONE server
// state (ct_open/close_enrollment), so they never diverge. Separate from the QR modal (Élder).
function _toggleDossierWindow(btn) {
  const cs = btn.dataset.cs, slug = btn.dataset.slug;
  if (!cs || !slug) return;
  const open = btn.classList.contains('is-open');
  btn.disabled = true;
  Promise.resolve(open ? api.closeEnrollment({ client_slug: cs, slug }) : api.openEnrollment({ client_slug: cs, slug }))
    .then(() => api.getEnrollment({ client_slug: cs, slug }))
    .then((r) => {
      const nowOpen = !!(r && r.ok && r.open);
      btn.classList.toggle('is-open', nowOpen);
      toast.ok(nowOpen ? t('cohorts.window_opened') : t('cohorts.window_closed'));
    })
    .catch((e) => { if (window.bsLog) window.bsLog('cohorts: toggle window failed: ' + (e && e.message || e), 'error'); notice.internal(e); })
    .finally(() => { btn.disabled = false; });
}

// ── Dossier participant list ─────────────────────────────────────────────────────
// This panel IS the shared people table (cohorts/person-table.js), in `turma` scope — the exact
// assembly the Alunos roster mounts in `global` scope. The panel used to re-implement the paint,
// selection, filter and apply here; that copy is gone, so a change to the table now lands on both
// surfaces at once (Élder 2026-07-16: "acabamos de fazer todo esse trabalho só para ter mais
// trabalho para consertar"). What stays here is only what is genuinely this scope's: the turma-id
// filter, the count chip, and the per-turma REMOVE semantics.

// The table is mounted once per #cdx-doss-participants element (that element is rebuilt when the
// dossiê switches turma) and fed data by _loadDossierParticipants. Its callbacks read _dossierTurma,
// the live current turma, so they stay correct across a switch.
function _dossierTable(el) {
  if (el._pt) return el._pt;
  el._pt = createPersonTable(el, {
    scope: 'turma',
    gated: () => isApprovalGated(_dossierTurma),
    emptyKey: 'cohorts.participants_empty',
    // track-26 2.b: the table never scrolls itself, the dossier's .cdx-doss-body does.
    scrollHost: () => el.closest('.cdx-doss-body'),
    onReload: () => { if (_dossierTurma) _loadDossierParticipants(_dossierTurma); },
    // Remove here is scope-aware (Élder 2026-07-16, option B): out of THIS turma if the person is in
    // others, but their OWN turma's decision is total — the completa/anonimizar modal — so nobody is
    // ever silently purged with their name still in the content. turma-remove.js owns the rule.
    onRemove: (people) => removeFromTurma(people, _dossierTurma, {
      onDone: () => { if (_dossierTurma) _loadDossierParticipants(_dossierTurma); },
    }),
  });
  return el._pt;
}

function _loadDossierParticipants(turma) {
  // Same action as the Alunos roster; turma_id is the FILTER. So this panel holds PEOPLE (each with
  // their single row for this turma), not raw participant rows — which is what lets the one table
  // render both surfaces.
  _dossierTurma = turma;
  api.listPeople({ turma_id: turma.id }).then((d) => {
    _dossierParticipants = (d && d.people) || [];
    const el = _q('cdx-doss-participants');
    if (!el) return;
    const countEl = _q('cdx-doss-p-count');
    if (countEl) countEl.textContent = _dossierParticipants.length || '';
    _dossierTable(el).setPeople(_dossierParticipants);
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
    _applyDeepAula();
    _renderAulasHub(turma);
  }).catch((e) => {
    if (window.bsLog) window.bsLog(t('cohorts.error_loading') + ': ' + (e && e.message || e), 'error');
    const el2 = _q(IDS.aulasList);
    if (el2) el2.innerHTML = '<div class="cdx-empty">' + t('cohorts.error_loading') + '</div>';
  });
}

// Deep-link step 2: select the aula the notification points at and open its Tarefas
// sub-tab, so _renderAulasHub keeps this selection instead of defaulting to the first
// aula. _deepItem is left for _renderAulaPane to focus the exact tarefa. Consumed once.
function _applyDeepAula() {
  if (_deepAula == null) return;
  const target = _deepAula;
  _deepAula = null;
  const aula = _turmaAulas.find((a) => Number(a.aula_number) === Number(target));
  if (aula && aula.id != null) { _selectedAulaId = String(aula.id); _aulaTab = 'tarefas'; }
}

// Per-aula content counts, reusing the Liberações composer's own tally (exported
// from releases.js) so the hub and the composer can never disagree on what an aula
// holds. Returns { apostila, tarefa, outros, drive, total }.
function _aulaCounts(aulaNumber) {
  return releasesAdmin.aulaReleaseCounts(_turmaViewItems, aulaNumber);
}

// Items placed in Outros -> the rail footer bucket count. Reuses the composer's own
// isOutrosBinding (0 sentinel, or legacy no-aula rows) so this badge can never disagree
// with the Outros composer or the trilha's own count.
function _outrosCount() {
  let n = 0;
  (_turmaViewItems || []).forEach((it) => {
    const nums = Array.isArray(it.aula_numbers) ? it.aula_numbers : (it.aula_number != null ? [it.aula_number] : []);
    if (releasesAdmin.isOutrosBinding(nums) && releasesAdmin.releaseItemBucket(it)) n++;
  });
  return n;
}

function _countChip(glyph, n) {
  return '<span class="cdx-aula-cc">' + glyphSvg(glyph, { size: 13 }) + ' ' + n + '</span>';
}

// The apps bound to this aula. Each carries its own icon (R2 path), so the aula
// chip can show the real app logo instead of a generic glyph.
function _aulaApps(aulaNumber) {
  return (_turmaViewApps || []).filter((a) => Number(a.aula_number) === Number(aulaNumber));
}

// App chip: the real app icon in place of the generic 'grid' glyph (falls back to
// the glyph when the app has no icon). Count kept for parity with the other chips.
function _appChip(apps) {
  const src = apps.length ? _iconSrc(apps[0].icon) : null;
  const lead = src
    ? '<img class="cdx-aula-cc-app" src="' + _esc(src) + '" alt="" loading="lazy">'
    : glyphSvg('grid', { size: 13 });
  return '<span class="cdx-aula-cc">' + lead + ' ' + apps.length + '</span>';
}

function _aulaCountChipsHtml(aulaNumber) {
  const c = _aulaCounts(aulaNumber);
  const apps = _aulaApps(aulaNumber);
  let html = '';
  if (apps.length) html += _appChip(apps);
  if (c.apostila) html += _countChip('book', c.apostila);
  if (c.tarefa) html += _countChip('clipboard', c.tarefa);
  if (c.lab) html += _countChip('flask', c.lab);
  if (c.interativo) html += _countChip('compass', c.interativo);
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
  if (_aulaRail) { _aulaRail.destroy(); _aulaRail = null; }  // rebuild below (drops old resizer/listeners)
  // Keep a valid selection across reloads (reorder/save re-renders); fall back to the
  // first aula when the current selection no longer exists (e.g. after a turma switch).
  const valid = _selectedAulaId === 'outros'
    || (_selectedAulaId === 'new' && _turmaAulas.some((a) => a._isNew))
    || _turmaAulas.some((a) => a.id != null && String(a.id) === String(_selectedAulaId));
  if (!valid) { _selectedAulaId = _turmaAulas.length ? String(_turmaAulas[0].id) : null; _aulaTab = 'dados'; }

  el.innerHTML =
    '<div class="cdx-aulas-hub" id="cdx-aulas-hub">' +
      '<div class="cdx-aulas-hub-list" id="cdx-aulas-hub-list"></div>' +
      '<div class="cdx-aulas-hub-detail cdx-pane" id="cdx-aulas-hub-detail"></div>' +
    '</div>';
  _buildAulaRail(turma);
  _renderAulaHubRows();
  _renderAulaDetail(turma);
}

// The aula list adopts the shared list-rail (track-21). It lives INSIDE the list pane
// (which keeps .cdx-aulas-hub-list.cdx-pane, so the resizer's grid column + the mobile
// collapse are untouched); the rail brings its own box, so the pane goes bare (CSS). The
// "Outros (sem aula)" bucket is not an aula row, so it rides the rail FOOTER and its
// selection is wired here. Reorder is gated: no drag while an unsaved 'new' aula exists
// or with a single aula (aula_number is the binding key; a drop renumbers + remaps).
function _buildAulaRail(turma) {
  const paneEl = _q('cdx-aulas-hub-list');
  if (!paneEl) return;
  _aulaRail = mountRail(paneEl, {
    title: t('cohorts.col_aulas') + ' · ' + turma.name,
    items: () => _turmaAulas,
    getId: (a) => (a._isNew ? 'new' : (a.id == null ? '' : a.id)),
    renderRow: (a) => ({ main: _aulaRowMain(a) }),
    selectedId: () => _selectedAulaId,
    onSelect: (id) => _selectAula(turma, id),
    add: { label: '+', title: t('cohorts.new_aula'), onAdd: () => _addNewAulaCol(turma) },
    emptyText: t('cohorts.no_aulas'),
    footer: _outrosFooterHtml,
    reorder: {
      canDrag: () => _turmaAulas.length > 1 && !_turmaAulas.some((a) => a._isNew),
      onReorder: (ids) => _reorderAulasByIds(turma, ids),
    },
    width: { mode: 'resize', storeKey: 'cdx_rz_aulas_hub', defaultPx: 300, min: 210, max: 520 },
  });
  // The Outros bucket sits in the footer (not a rail row), so wire its click here; the
  // rail's own click handler ignores it (it is not a .cdx-rail-row).
  paneEl.addEventListener('click', (e) => {
    if (e.target.closest('.cdx-aulas-hub-outros')) _selectAula(turma, 'outros');
  });
}

// The rail owns the row shell + grip; renderRow returns only the inner content (aula
// number chip + title/date/counts), laid out horizontally inside .cdx-rail-main (CSS).
function _aulaRowMain(a) {
  const ds = _aulaDateStatus(a);
  const titleHtml = a.title ? _esc(a.title) : '<span class="is-empty">' + t('cohorts.aula_no_title') + '</span>';
  return '<span class="cdx-aula-hub-num">' + _esc(a.aula_number) + '</span>' +
    '<div class="cdx-aula-hub-info">' +
      '<div class="cdx-aula-hub-title">' + titleHtml + '</div>' +
      '<div class="cdx-aula-hub-sub">' +
        '<span class="cdx-rel-aula-date ' + ds.cls + '">' + _esc(ds.text) + '</span>' +
        '<span class="cdx-aula-hub-counts">' + _aulaCountChipsHtml(a.aula_number) + '</span>' +
      '</div>' +
    '</div>';
}

function _outrosFooterHtml() {
  return '<div class="cdx-aulas-hub-outros' + (_selectedAulaId === 'outros' ? ' is-on' : '') + '" data-aula-id="outros">' +
    glyphSvg('layers', { size: 15 }) +
    '<span class="cdx-aulas-hub-outros-t">' + _esc(t('cohorts.aula_outros')) + '</span>' +
    '<span class="cdx-aula-cc">' + _outrosCount() + '</span>' +
  '</div>';
}

// Re-render the aula list (rows + Outros footer) through the rail; a no-op before the hub
// is built. Callers (select, reorder, count refresh) keep their name.
function _renderAulaHubRows() {
  if (_aulaRail) _aulaRail.render();
}

// Right pane: the empty prompt, the Outros release composer, or the selected aula's
// detail (header + Dados/Liberações/Tarefas sub-tabs).
function _renderAulaDetail(turma) {
  const detailEl = _q('cdx-aulas-hub-detail');
  if (!detailEl) return;
  _unmountAulaEmbeds();
  if (_selectedAulaId === 'outros') {
    // Outros has no Dados/Tarefas; the whole detail is the no-aula release composer.
    // On a reveal-on-completion turma, Outros is hidden from students until "Revelar"
    // (ct_turmas.outros_revealed). The toggle only appears where pacing is on (Élder).
    const revealBtn = turma.reveal_on_completion
      ? '<button class="cdx-btn cdx-btn-sm' + (turma.outros_revealed ? '' : ' cdx-btn-primary') + '" data-act="toggle-outros" type="button">' +
          _esc(t(turma.outros_revealed ? 'cohorts.outros_hide' : 'cohorts.outros_reveal')) + '</button>'
      : '';
    const revealHint = turma.reveal_on_completion
      ? '<div class="cdx-aula-dh-sub cdx-outros-state">' + _esc(t(turma.outros_revealed ? 'cohorts.outros_state_on' : 'cohorts.outros_state_off')) + '</div>'
      : '';
    detailEl.innerHTML =
      '<div class="cdx-aula-dh"><div class="cdx-aula-dh-main">' +
        '<h3 class="cdx-aula-dh-title">' + _esc(t('cohorts.aula_outros')) + '</h3>' +
        '<div class="cdx-aula-dh-sub">' + _esc(t('cohorts.aula_outros_sub')) + '</div>' +
        revealHint +
      '</div>' + (revealBtn ? '<div class="cdx-aula-dh-actions">' + revealBtn + '</div>' : '') + '</div>' +
      '<div class="cdx-aula-pane" id="cdx-aula-pane"></div>';
    const rb = detailEl.querySelector('[data-act="toggle-outros"]');
    if (rb) rb.addEventListener('click', async () => {
      const next = turma.outros_revealed ? 0 : 1;
      rb.disabled = true;
      let res; try { res = await api.updateTurmaMeta({ client_slug: turma.client_slug, slug: turma.slug, outros_revealed: next }); } catch (e) { notice.internal(e); res = null; }
      if (res && !res.error) { turma.outros_revealed = next; _renderAulaDetail(turma); }
      else { rb.disabled = false; notice.warn(t('cohorts.error')); }
    });
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
  // An unsaved new aula has no id yet, so Liberações/Tarefas/Roteiro (which bind TO
  // an aula) can't attach to it; show only Dados until it is saved.
  const roteiroTab = '<button type="button" class="cdx-aula-stab' + (_aulaTab === 'roteiro' ? ' is-on' : '') + '" data-aulatab="roteiro" role="tab">' + _esc(t('cohorts.aula_tab_roteiro')) + '</button>';
  const subtabs = aula._isNew
    ? '<button type="button" class="cdx-aula-stab is-on" data-aulatab="dados" role="tab">' + _esc(t('cohorts.aula_tab_dados')) + '</button>'
    : '<button type="button" class="cdx-aula-stab' + (_aulaTab === 'dados' ? ' is-on' : '') + '" data-aulatab="dados" role="tab">' + _esc(t('cohorts.aula_tab_dados')) + '</button>' +
      '<button type="button" class="cdx-aula-stab' + (_aulaTab === 'liberacoes' ? ' is-on' : '') + '" data-aulatab="liberacoes" role="tab">' + _esc(t('cohorts.doss_liberacoes')) + ' <span class="cdx-aula-stab-b">' + counts.total + '</span></button>' +
      '<button type="button" class="cdx-aula-stab' + (_aulaTab === 'tarefas' ? ' is-on' : '') + '" data-aulatab="tarefas" role="tab">' + _esc(t('cohorts.doss_tarefas')) + ' <span class="cdx-aula-stab-b">' + counts.tarefa + '</span></button>' +
      roteiroTab;
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
    _deepItem = null;   // a manual sub-tab switch ends the deep-link focus (no stale re-focus)
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
    // Deep-link step 3: a pending _deepItem focuses that tarefa's answers on mount. It is
    // NOT consumed here: the dossier can re-render mid-boot (the _ensureDossierDeps deps-load
    // re-renders the whole dossier, re-mounting this pane), and consuming the focus on the
    // first mount let the second mount wipe it — fresh _selectedId, answers stuck on
    // "Carregando…". Persisting it makes every boot render re-apply the same focus; it is
    // cleared only on manual navigation (_selectAula / a sub-tab click) or dossier unmount.
    const focusItemId = (_deepItem != null ? _deepItem : undefined);
    tarefasAdmin.mount(paneEl, { clientSlug: turma.client_slug, turmaSlug: turma.slug, aulaNumber: aula.aula_number,
      revealOn: !!turma.reveal_on_completion, aulaHappened: !!aula.happened_on, onChange, focusItemId });
    _aulaEmbedMounted.tarefas = true;
    return;
  }
  if (_aulaTab === 'roteiro') {
    _mountRoteiroPane(paneEl, turma, aula);
    return;
  }
  paneEl.innerHTML = '<div class="cdx-aula-dados">' + _renderAulaColEditor(aula, turma) + '</div>';
  _wireAulaDadosEditor(paneEl, aula, turma);
}

// Roteiro pane (track-46 fatia 2): fetch the aula's saved roteiro ONCE up front
// (ct_get_aula_roteiro), then mount the base selector + the two-panel view, both
// seeded from that single response. roteiroView.mount() itself stays fully
// synchronous (its store.load() contract from fatia 1 is unchanged); the network
// round-trip happens here, before mount, not inside the view.
function _mountRoteiroPane(paneEl, turma, aula) {
  paneEl.innerHTML =
    '<div id="cdx-aula-roteiro-base"></div>' +
    '<div class="cdx-aula-pane" id="cdx-aula-roteiro-view"></div>';
  const token = ++_roteiroLoadToken;
  if (aula.id == null) {
    // Unsaved 'new' aula: nothing to fetch yet, mount both on a blank seed so the
    // pane is still usable the instant the aula is saved and re-selected.
    _mountRoteiroEmbeds(paneEl, turma, aula, null);
    return;
  }
  roteiroApi.getAula({ id: aula.id }).then((seed) => {
    if (token !== _roteiroLoadToken) return; // switched aula/sub-tab meanwhile
    _mountRoteiroEmbeds(paneEl, turma, aula, seed);
  }).catch((e) => {
    if (token !== _roteiroLoadToken) return;
    notice.internal(t('cohorts.error') + ': ' + ((e && e.message) || e));
  });
}

function _mountRoteiroEmbeds(paneEl, turma, aula, seed) {
  const baseEl = paneEl.querySelector('#cdx-aula-roteiro-base');
  const viewEl = paneEl.querySelector('#cdx-aula-roteiro-view');
  if (!baseEl || !viewEl) return; // pane was replaced meanwhile
  roteiroBase.mount(baseEl, {
    turma, aula, seed, turmaAulas: _turmaAulas,
    onApplied: (applied) => {
      // The base selector already persisted the copy-down/blank via setAula.
      // createRoteiroStore's load() replays a FROZEN seed captured at creation
      // time (the view's store.load() contract stays synchronous, see
      // roteiro-store.js), so re-using the OLD store here would still hand the
      // remounted view the pre-copy content. Build a FRESH store off the applied
      // payload instead, so the copied-down/blank roteiro shows immediately, not
      // only after navigating away and back.
      roteiroView.unmount();
      roteiroView.mount(viewEl, { store: createRoteiroStore(aula.id, applied), aula, t });
    },
  });
  _aulaEmbedMounted.roteiroBase = true;
  roteiroView.mount(viewEl, { store: createRoteiroStore(aula.id, seed), aula, t });
  _aulaEmbedMounted.roteiro = true;
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

function _renderAulaColEditor(a, turma) {
  // track-39: per-lesson size + hours PREFILL from the turma default (a.<field> || turma.<field>) but are
  // freely overridable; clearing a field falls back to the turma default server-side (aula.x || turma.x).
  const _pf = (own, def) => (own != null && own !== '') ? own : (def != null ? def : '');
  const sizePf = _pf(a.size, turma && turma.size);
  const startPf = _pf(a.start_hour, turma && turma.start_hour);
  const endPf = _pf(a.end_hour, turma && turma.end_hour);
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
        // track-39: per-lesson window hours + size (prefilled from the turma, overridable for this lesson).
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.tf_start_hour') + '</label>' +
          '<input type="time" class="cdx-aula-start" value="' + _esc(startPf) + '">' +
        '</div>' +
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.tf_end_hour') + '</label>' +
          '<input type="time" class="cdx-aula-end" value="' + _esc(endPf) + '">' +
        '</div>' +
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.tf_size') + '</label>' +
          '<input type="number" min="1" step="1" inputmode="numeric" class="cdx-aula-size" value="' + _esc(sizePf) + '" placeholder="' + t('cohorts.tf_size_ph') + '">' +
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

// Select an aula (or the Outros bucket): leaving an unsaved new aula discards it,
// then repaint the rows + detail. Tears the live embed down first (it is re-mounted
// for the newly-selected aula by _renderAulaDetail).
function _selectAula(turma, aulaId) {
  if (String(_selectedAulaId) === String(aulaId)) return;
  _deepAula = null; _deepItem = null;   // manual aula switch ends any pending deep-link focus
  if (_selectedAulaId === 'new') _turmaAulas = _turmaAulas.filter((a) => !a._isNew);
  _unmountAulaEmbeds();
  _selectedAulaId = aulaId;
  _aulaTab = 'dados';
  _renderAulaHubRows();
  _renderAulaDetail(turma);
}

// Apply the new aula order (from the shared reorder drag: the ids are the final DOM
// order), renumber 1..N top-to-bottom (optimistic), then persist. aula_number is the
// binding key for released content + the lesson plan, so the worker remaps those in
// lockstep; on success we reload so the per-aula counts reflect the remap, on failure we
// reload to discard the optimistic order.
function _reorderAulasByIds(turma, ids) {
  const byId = new Map(_turmaAulas.map((a) => [String(a.id), a]));
  const next = ids.map((id) => byId.get(String(id))).filter(Boolean);
  if (next.length !== _turmaAulas.length) return; // safety: a 'new'/unknown row slipped in
  _turmaAulas = next;
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
  const startInput = container.querySelector('.cdx-aula-start');
  const endInput   = container.querySelector('.cdx-aula-end');
  const sizeInput  = container.querySelector('.cdx-aula-size');

  if (saveBtn) saveBtn.addEventListener('click', () => {
    const hoursVal = hoursInput && hoursInput.value.trim() !== '' ? Number(hoursInput.value) : null;
    const happVal = happInput.value || null;
    // track-22.4: an aula can't be "occurred" without a planned date. When only
    // happened_on is filled, mirror it into scheduled_for so the two never diverge.
    const schedVal = (schedInput.value || null) || happVal;
    const payload = {
      client_slug: turma.client_slug,
      turma_slug: turma.slug,
      aula_number: aula.aula_number,
      title: titleInput.value.trim(),
      hours:            hoursVal,
      scheduled_for:    schedVal,
      happened_on:      happVal,
      rescheduled_from: rfromInput.value || null,
      rescheduled_note: rnoteInput.value.trim() || null,
      start_hour:       startInput && startInput.value ? startInput.value : null,
      end_hour:         endInput && endInput.value ? endInput.value : null,
      size:             sizeInput && sizeInput.value.trim() !== '' ? Number(sizeInput.value) : null,
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
      aula.start_hour       = payload.start_hour;
      aula.end_hour         = payload.end_hour;
      aula.size             = payload.size;
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
  _roteiroLoadToken++; // invalidate any in-flight ct_get_aula_roteiro fetch
  if (_aulaEmbedMounted.liberacoes) { try { releasesAdmin.unmount(); } catch (_) { /* already gone */ } _aulaEmbedMounted.liberacoes = false; }
  if (_aulaEmbedMounted.apps) { try { appRelease.unmount(); } catch (_) { /* already gone */ } _aulaEmbedMounted.apps = false; }
  if (_aulaEmbedMounted.tarefas) { try { tarefasAdmin.unmount(); } catch (_) { /* already gone */ } _aulaEmbedMounted.tarefas = false; }
  if (_aulaEmbedMounted.roteiro) { try { roteiroView.unmount(); } catch (_) { /* already gone */ } _aulaEmbedMounted.roteiro = false; }
  if (_aulaEmbedMounted.roteiroBase) { try { roteiroBase.unmount(); } catch (_) { /* already gone */ } _aulaEmbedMounted.roteiroBase = false; }
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
  _turmaAulas = [];
  _relClientSlug = (ctx && ctx.fclient) || null;
  _relTurmaSlug = (ctx && ctx.fturma) || null;
  // Sem deep-link, retoma a última turma aberta (ver LS_LAST). Se ela sumiu ou foi
  // arquivada, o _loadAll não a acha e cai no prompt vazio de sempre: sem guarda extra.
  if (!_relClientSlug && !_relTurmaSlug) {
    const last = _lsLastGet();
    if (last) { _relClientSlug = last.client; _relTurmaSlug = last.turma; }
  }
  _dossierDtab = (ctx && ctx.fdtab) || 'dados';   // deep-link (e-sino → participantes) seeds the sub-tab
  _deepAula = (ctx && ctx.faula != null && ctx.faula !== '') ? ctx.faula : null;
  _deepItem = (ctx && ctx.fitem != null && ctx.fitem !== '') ? ctx.fitem : null;
  _cpSessions = [];
  _dossierTurma = null;
  _dossierDepsTried = false;
  _expandedClient = null;
  _navNotice = null;
  _cleanup = [];
  _turmaViewItems = [];
  _selectedAulaId = null;
  _aulaTab = 'dados';
  _aulaEmbedMounted = { liberacoes: false, tarefas: false, apps: false, roteiro: false, roteiroBase: false };

  // Route by sub-tab. The Cursos sub-view is its own module; the default
  // (Concept A) merged Turmas+Clientes list → dossier view is the shell below.
  const sub = _resolveSub(ctx && ctx.sub);
  if (sub === 'cursos') { cursos.mount(viewEl); return; }
  if (sub === 'alunos') { students.mount(viewEl); return; }
  if (sub === 'comunicados') { comunicados.mount(viewEl); return; }

  _renderShell();
  _loadAll();
}

export function unmount() {
  cursos.unmount();
  students.unmount();
  _unmountAulaEmbeds();
  _dossierDtab = 'dados'; _deepAula = null; _deepItem = null;
  if (_aulaRail) { _aulaRail.destroy(); _aulaRail = null; }
  // The nav rail's autohide holds document-level listeners (mousemove/keydown); destroy()
  // is what tears them down, so skipping it would leak one set per tab switch.
  if (_navRail) { _navRail.destroy(); _navRail = null; }
  _cleanup.forEach(fn => fn());
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  // Remove any stray modal left by this module
  document.querySelectorAll('.cdx-modal-backdrop').forEach(bd => bd.parentNode && bd.parentNode.removeChild(bd));
}
