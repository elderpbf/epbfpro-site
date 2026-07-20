// cohorts/courses.js
// Cursos sub-tab of the Cohorts tab: the reusable course registry + ementa
// editor (the B+C concept Elder chose). A course is a MOLD — its title/hours/
// ementa seed a turma's own editable copy at link time (the turma form copies
// them; see cohorts.js). Backend: codex-api courses facade (ct_*_course).
//
// This module owns the Cursos sub-view only; cohorts.js routes ctx.sub === 'cursos'
// here via mount()/unmount(). Layout mirrors the backstage repo's mocks/curso/b2.html:
// page header, course-switcher rail, course data on top, full-width ementa editor.
//
// AI assistant: the conversational panel (the "C" of the B+C hybrid) talks to the
// shared Codex AI endpoint via the `ai.chat` facade (codex-api `ai_chat`). It
// reads the current ementa, applies a natural-language request, and writes the
// updated program back into the editor at the left. The heuristic "colar e
// estruturar" (ementa.parseEmenta) stays as the offline, no-LLM path.
// The "De uma apostila" source is deferred (needs multi-apostila in Conteúdo).

import { courses as api, ai, content as contentApi, roteiro as roteiroApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import { mountRail } from '../js/list-rail.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import {
  emptyEmenta, normalizeEmenta, ementaStats, parseEmenta,
  buildEmentaAIPrompt, parseEmentaAIResponse,
} from '../js/ementa.js';
// track-46 fatia 2b: the curso's numbered base roteiros are edited by reusing
// roteiro-view.js VERBATIM (the same two-panel component the aula Roteiro
// sub-tab mounts), swapping in a store bound to this curso's bases instead of an
// aula. That reuse is the whole point of the view's injected-store seam: no fork,
// no duplicate component. normalizeRoteiro/nextBaseNumber are the pure model
// helpers the local _courseRoteiroStore()/"+ Nova base" flow below need.
import * as roteiroView from '../roteiro/roteiro-view.js';
import { normalizeRoteiro, nextBaseNumber } from '../js/roteiro-model.js';

let _viewEl = null;
let _courses = [];
let _archived = [];        // archived courses (shown as a muted section at the rail bottom)
let _selectedId = null;
let _course = null;        // full selected course (with ementa)
let _ementa = emptyEmenta(); // working copy of the selected course's ementa
let _aiMsgs = [];          // assistant chat history ({role, content}) for ai.chat
let _apostilas = [];       // Conteúdo apostila sets, lazy-loaded for "De uma apostila"
let _rail = null;          // the shared left-panel rail (js/list-rail.js); Cursos = 1st adopter
let _sections = [];        // ct_course_sections (rail groups); [] until the admin creates one
let _courseRoteiros = [];  // this course's numbered base roteiros: [{id, aula_number, roteiro_json}]
let _courseRoteirosLoaded = false; // has the listCourseBases fetch settled for the selected course?
let _selectedBaseNumber = null; // which base is open in the reused roteiro-view.js editor
let _roteiroMounted = false;    // is roteiro-view.js currently mounted into #cdx-cur-roteiro-view?

const IDS = {
  rail:   'cdx-cursos-rail',
  main:   'cdx-cursos-main',
};

function _q(id) { return _viewEl ? _viewEl.querySelector('#' + id) : null; }

// Debug gate: the shared Backstage bs_debug flag (mirrors cohorts.js _isDebug and
// content/releases.js). Gates the Roteiros-base editor (track-46 fatia 2) exactly
// like the aula's Roteiro sub-tab is gated, so this fatia ships to production
// DORMANT: without it the section would render for any admin opening any course.
function _isDebug() {
  return typeof localStorage !== 'undefined' && localStorage.getItem('bs_debug') === '1';
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-cursos">' +
      '<div class="cdx-cursos-head">' +
        '<h1 class="cdx-cursos-h1">' + esc(t('cohorts.cursos_title')) + '</h1>' +
      '</div>' +
      '<div class="cdx-cursos-work">' +
        '<div class="cdx-cursos-rail" id="' + IDS.rail + '"></div>' +
        '<div class="cdx-cursos-main" id="' + IDS.main + '"></div>' +
      '</div>' +
    '</div>';
}

// ── Course list (rail) ──────────────────────────────────────────────────────────

function _loadCourses() {
  // Pull archived too (Élder: archived courses must not vanish, they sit as a muted
  // section at the rail bottom with an Unarchive affordance) and split by status.
  api.list({ include_archived: true }).then((d) => {
    const all = (d && d.courses) || [];
    _courses = all.filter((c) => c.status !== 'archived');
    _archived = all.filter((c) => c.status === 'archived');
    if (_rail) _rail.render();
    if (_selectedId == null && _courses.length) _selectCourse(_courses[0].id);
    else if (_selectedId == null) _renderMain();
  }).catch(() => {
    const el = _q(IDS.rail);
    if (el) el.innerHTML = '<div class="cdx-empty">' + esc(t('cohorts.error_loading')) + '</div>';
  });
  _loadSections();
}

// Course sections (the rail's collapsible groups). Loaded alongside the courses; reloaded
// after any section CRUD. A load failure leaves the flat list (no-section) working.
function _loadSections() {
  api.listSections().then((d) => {
    _sections = (d && d.sections) || [];
    if (_rail) _rail.render();
  }).catch((err) => { if (window.bsLog) window.bsLog('cursos sections: ' + (err && err.message || err), 'error'); });
}

// Optimistic local model updates so a later _rail.render() matches what the drag already did
// in the DOM (list-rail moved the nodes; we mirror it in _courses). sort_order is per-bucket;
// the rail re-groups by section_id, so a stable sort by sort_order preserves within-bucket order.
function _applyCourseOrder(ids) {
  ids.forEach((id, i) => { const c = _courses.find((x) => String(x.id) === String(id)); if (c) c.sort_order = i; });
  _courses.sort((a, b) => (a.sort_order == null ? 1e9 : a.sort_order) - (b.sort_order == null ? 1e9 : b.sort_order));
}
function _applyCourseSection(courseId, sectionId, ids) {
  const moved = _courses.find((x) => x.id === courseId);
  if (moved) moved.section_id = sectionId;
  _applyCourseOrder(ids);
}

// The rail is now the shared js/list-rail.js (Cursos = 1st adopter, track-21). Active courses
// are the rows; archived courses sit in the rail FOOTER as a collapsed <details> (they carry
// an Unarchive affordance, so they are rendered + wired here, not through the row renderer).
// Reorder + sections are OFF here until the additive worker (sort_order + ct_course_sections)
// lands (Phase B); flipping them on is a config change, no re-layout.
function _courseRowMain(c) {
  const n = c.turma_count || 0;
  const turmas = n === 1 ? '1 ' + t('cohorts.turma_singular') : n + ' ' + t('cohorts.turma_plural');
  const hours = c.hours ? esc(c.hours) + ' · ' : '';
  return '<div class="cdx-cursos-ri-t">' + esc(c.title) + '</div>' +
    '<div class="cdx-cursos-ri-m">' + hours + esc(turmas) + '</div>';
}

function _archivedFooterHtml() {
  if (!_archived.length) return '';
  return '<details class="cdx-cursos-arch">' +
    '<summary class="cdx-cursos-arch-h">' + esc(t('cohorts.course_archived_section')) + ' (' + _archived.length + ')</summary>' +
    _archived.map((c) => {
      const n = c.turma_count || 0;
      const turmas = n === 1 ? '1 ' + t('cohorts.turma_singular') : n + ' ' + t('cohorts.turma_plural');
      const hours = c.hours ? esc(c.hours) + ' · ' : '';
      const on = c.id === _selectedId ? ' is-on' : '';
      return '<div class="cdx-cursos-ri is-archived' + on + '" data-arch-id="' + esc(String(c.id)) + '">' +
        '<div class="cdx-cursos-ri-b">' +
          '<div class="cdx-cursos-ri-t">' + esc(c.title) + '</div>' +
          '<div class="cdx-cursos-ri-m">' + hours + esc(turmas) + '</div>' +
        '</div>' +
        '<button type="button" class="cdx-cursos-unarch" data-unarch="' + esc(String(c.id)) + '" title="' + esc(t('cohorts.course_unarchive')) + '">' + esc(t('cohorts.course_unarchive')) + '</button>' +
      '</div>';
    }).join('') +
  '</details>';
}

function _buildRail() {
  const el = _q(IDS.rail);
  if (!el) return;
  _rail = mountRail(el, {
    title: t('cohorts.cursos_title'),
    items: () => _courses,
    getId: (c) => c.id,
    renderRow: (c) => ({ main: _courseRowMain(c) }),
    selectedId: () => _selectedId,
    onSelect: (id) => _selectCourse(Number(id)),
    add: { label: '+', title: t('cohorts.cursos_new'), onAdd: _onNewCourse },
    dragHint: t('cohorts.course_drag_hint'),
    newSectionLabel: t('cohorts.course_section_new_btn'),
    footer: _archivedFooterHtml,
    emptyText: t('cohorts.cursos_none'),
    // Reorder within a bucket (grip drag). Optimistic local + persist; reload reverts on error.
    reorder: {
      onReorder: (ids) => {
        _applyCourseOrder(ids);
        api.reorder({ ordered_ids: ids.map(Number) }).catch((err) => {
          notice.internal(t('cohorts.error') + ': ' + (err && err.message || err)); _loadCourses();
        });
      },
    },
    // Groups + drag between groups (like the Tarefas sub-tab).
    sections: {
      of: (c) => c.section_id,
      list: () => _sections,
      editable: true,
      onCreate: _onCreateSection,
      onRename: (id) => _onRenameSection(Number(id)),
      onDelete: (id) => _onDeleteSection(Number(id)),
      onMoveItem: (courseId, secId, ids) => {
        const sid = secId == null ? null : Number(secId);
        _applyCourseSection(Number(courseId), sid, ids);
        api.setSection({ course_id: Number(courseId), section_id: sid, ordered_ids: ids.map(Number) }).catch((err) => {
          notice.internal(t('cohorts.error') + ': ' + (err && err.message || err)); _loadCourses();
        });
      },
    },
  });
  // Archived-footer actions: delegated on the rail container (persists across re-renders).
  // The rail's own click handler ignores these (different classes: .cdx-cursos-* not .cdx-rail-*).
  el.addEventListener('click', (e) => {
    const un = e.target.closest('[data-unarch]');
    if (un) { e.stopPropagation(); _onUnarchiveCourse(Number(un.getAttribute('data-unarch'))); return; }
    const arch = e.target.closest('[data-arch-id]');
    if (arch) _selectCourse(Number(arch.getAttribute('data-arch-id')));
  });
  _rail.render();
}

// ── Section CRUD (rail groups) ──────────────────────────────────────────────────
// A shared name-input modal for create/rename; a confirm for delete (courses are
// orphaned to "sem seção", never removed — the worker guards that).
function _openSectionNameModal(titleText, initial, onOk) {
  const html =
    '<div class="cdx-modal cdx-modal--sm">' +
      '<div class="cdx-modal-title">' + esc(titleText) + '</div>' +
      '<input class="cdx-doss-edit" id="cdx-cursec-name" type="text" value="' + esc(initial || '') + '" placeholder="' + esc(t('cohorts.course_section_name_ph')) + '" style="width:100%;margin:.2rem 0 1.2rem">' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-cursec-cancel">' + esc(t('cohorts.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-cursec-ok">' + esc(t('cohorts.save')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  const input = bd.querySelector('#cdx-cursec-name');
  if (input) setTimeout(() => { input.focus(); input.select(); }, 0);
  const submit = () => {
    const v = (input.value || '').trim();
    if (!v) { toast.err(t('cohorts.course_section_name_required')); return; }
    closeModal(bd); onOk(v);
  };
  bd.querySelector('#cdx-cursec-cancel').addEventListener('click', () => closeModal(bd));
  bd.querySelector('#cdx-cursec-ok').addEventListener('click', submit);
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
}

function _onCreateSection() {
  _openSectionNameModal(t('cohorts.course_section_new'), '', (name) => {
    api.createSection({ name }).then(() => { toast.ok(t('cohorts.course_section_created')); _loadSections(); })
      .catch((err) => notice.internal(t('cohorts.error') + ': ' + (err && err.message || err)));
  });
}

function _onRenameSection(id) {
  const sec = _sections.find((s) => s.id === id);
  _openSectionNameModal(t('cohorts.course_section_rename'), sec ? sec.name : '', (name) => {
    api.renameSection({ id, name }).then(() => { toast.ok(t('cohorts.course_section_renamed')); _loadSections(); })
      .catch((err) => notice.internal(t('cohorts.error') + ': ' + (err && err.message || err)));
  });
}

function _onDeleteSection(id) {
  const html =
    '<div class="cdx-modal cdx-modal--sm">' +
      '<div class="cdx-modal-title">' + esc(t('cohorts.course_section_delete_title')) + '</div>' +
      '<p style="margin:0 0 1.2rem;font-size:.88rem;color:var(--text-secondary)">' + esc(t('cohorts.course_section_delete_msg')) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-cursec-del-cancel">' + esc(t('cohorts.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-cursec-del-ok">' + esc(t('cohorts.course_section_delete')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('#cdx-cursec-del-cancel').addEventListener('click', () => closeModal(bd));
  bd.querySelector('#cdx-cursec-del-ok').addEventListener('click', () => {
    closeModal(bd);
    api.deleteSection({ id }).then(() => { toast.ok(t('cohorts.course_section_deleted')); _loadCourses(); })
      .catch((err) => notice.internal(t('cohorts.error') + ': ' + (err && err.message || err)));
  });
}

function _selectCourse(id) {
  _selectedId = id;
  _aiMsgs = []; // fresh chat per course
  _unmountRoteiroEditor();
  _courseRoteiros = [];
  _courseRoteirosLoaded = false;
  _selectedBaseNumber = null;
  if (_rail) _rail.render();
  const el = _q(IDS.main);
  if (el) el.innerHTML = '<div class="cdx-empty">' + esc(t('cohorts.loading')) + '</div>';
  api.get({ id }).then((d) => {
    _course = (d && d.course) || null;
    _ementa = normalizeEmenta(_course && _course.ementa_json);
    _renderMain();
    if (_isDebug()) _loadCourseRoteiros(id); // dev-only this fatia: no fetch when the section is hidden
  }).catch(() => {
    const el2 = _q(IDS.main);
    if (el2) el2.innerHTML = '<div class="cdx-empty">' + esc(t('cohorts.error_loading')) + '</div>';
  });
}

// Roteiro bases fetch independently of the course/ementa load (its own failure
// must not blank the whole Cursos main panel): the base editor section just
// stays on its own "carregando" state a little longer, then shows the error.
function _loadCourseRoteiros(courseId) {
  roteiroApi.listCourseBases({ course_id: courseId }).then((rd) => {
    if (_selectedId !== courseId) return; // switched course meanwhile
    _courseRoteiros = (rd && rd.roteiros) || [];
    _courseRoteirosLoaded = true;
    _selectedBaseNumber = _courseRoteiros.length
      ? Math.min(..._courseRoteiros.map((r) => Number(r.aula_number)))
      : null;
    _rerenderRoteiroTabs();
    _mountRoteiroEditor();
  }).catch((err) => {
    if (_selectedId !== courseId) return;
    _courseRoteirosLoaded = true;
    _rerenderRoteiroTabs();
    notice.internal(t('cohorts.error') + ': ' + ((err && err.message) || err));
  });
}

function _onNewCourse() {
  api.create({ title: t('cohorts.cursos_new_default') }).then((d) => {
    toast.ok(t('cohorts.course_created'));
    const c = d && d.course;
    if (c) { _courses.unshift(c); _selectCourse(c.id); }
  }).catch((err) => {
    notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
  });
}

// ── Main: course data + ementa editor ───────────────────────────────────────────

function _renderMain() {
  const el = _q(IDS.main);
  if (!el) return;
  if (!_course) {
    el.innerHTML = '<div class="cdx-empty">' + esc(t('cohorts.cursos_select_prompt')) + '</div>';
    return;
  }
  const s = ementaStats(_ementa);
  const statLine = t('cohorts.ementa_stats')
    .replace('{m}', String(s.modules)).replace('{t}', String(s.topics)).replace('{s}', String(s.subtopics));

  el.innerHTML =
    // course data on top
    '<div class="cdx-cursos-meta">' +
      '<div class="cdx-cursos-titlerow">' +
        '<input class="cdx-cursos-title cdx-cursos-edit" id="cdx-cur-title" value="' + esc(_course.title || '') + '" placeholder="' + esc(t('cohorts.course_title_ph')) + '">' +
      '</div>' +
      '<div class="cdx-cursos-fields">' +
        '<div class="cdx-cursos-f"><label>' + esc(t('cohorts.course_hours_label')) + '</label>' +
          '<input class="cdx-cursos-edit" id="cdx-cur-hours" value="' + esc(_course.hours || '') + '" placeholder="' + esc(t('cohorts.course_hours_ph')) + '"></div>' +
        '<div class="cdx-cursos-f"><label>' + esc(t('cohorts.cursos_apostila_label')) + '</label>' +
          '<select class="cdx-cursos-edit" id="cdx-cur-apostila-bind"><option value="">' + esc(t('cohorts.cursos_apostila_none')) + '</option></select></div>' +
        '<div class="cdx-cursos-f cdx-cursos-f-stat"><label>' + esc(t('cohorts.course_reuse_label')) + '</label>' +
          '<div class="cdx-cursos-f-v">' + esc((_courseTurmaCount()) + ' ' + (_courseTurmaCount() === 1 ? t('cohorts.turma_singular') : t('cohorts.turma_plural'))) + '</div></div>' +
      '</div>' +
      '<div class="cdx-cursos-edithint">' + esc(t('cohorts.cursos_edit_hint')) + '</div>' +
      '<div class="cdx-cursos-metafoot">' +
        '<button class="cdx-btn cdx-btn-sm" id="cdx-cur-duplicate">' + esc(t('cohorts.course_duplicate')) + '</button>' +
        '<button class="cdx-btn cdx-btn-sm cdx-cursos-archive" id="cdx-cur-archive">' + esc(t('cohorts.archive')) + '</button>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" id="cdx-cur-delete">' + esc(t('cohorts.course_delete')) + '</button>' +
      '</div>' +
    '</div>' +
    // two separate panels: ementa | IA assistant (b2 hybrid)
    '<div class="cdx-cursos-duo">' +
      '<div class="cdx-cursos-panel">' +
        '<div class="cdx-cursos-panel-h">' +
          '<b>' + esc(t('cohorts.ementa_title')) + '</b>' +
          '<span class="cdx-cursos-stats">' + esc(statLine) + '</span>' +
          '<span class="cdx-cursos-sp"></span>' +
          '<button class="cdx-btn cdx-btn-sm" id="cdx-cur-paste">' + esc(t('cohorts.ementa_paste_btn')) + '</button>' +
          '<button class="cdx-btn cdx-btn-sm cdx-btn-primary" id="cdx-cur-save">' + esc(t('cohorts.ementa_save')) + '</button>' +
        '</div>' +
        '<div class="cdx-cursos-ementa" id="cdx-cur-ementa">' + _renderEmenta() + '</div>' +
      '</div>' +
      _renderAssistant() +
    '</div>' +
    (_isDebug() ? _renderRoteirosSectionHtml() : '');

  _wireMain();
  if (_isDebug()) _wireRoteirosSection();
}

// ── AI assistant panel (conversational ementa builder) ──────────────────────────

function _aiChip(labelKey, qKey) {
  return '<button type="button" class="cdx-cur-chip" data-q="' + esc(t(qKey)) + '">' + esc(t(labelKey)) + '</button>';
}

function _renderAssistant() {
  return (
    '<div class="cdx-cursos-panel cdx-cur-ia">' +
      '<div class="cdx-cursos-panel-h">' +
        '<span class="cdx-cur-ia-glyph">&#10022;</span>' +
        '<b>' + esc(t('cohorts.cursos_ia_title')) + '</b>' +
        '<span class="cdx-cursos-sp"></span>' +
        '<span class="cdx-cursos-hint">' + esc(t('cohorts.cursos_ia_hint')) + '</span>' +
      '</div>' +
      '<div class="cdx-cur-ia-src">' +
        '<button type="button" class="cdx-cur-srcopt is-on" data-src="chat">' + esc(t('cohorts.cursos_ia_src_paste')) + '</button>' +
        '<button type="button" class="cdx-cur-srcopt" data-src="apostila">' + esc(t('cohorts.cursos_ia_src_apostila')) + '</button>' +
      '</div>' +
      // Apostila picker (revealed by the "De uma apostila" source): pick a Conteúdo
      // apostila and the assistant builds the ementa from its sections.
      '<div class="cdx-cur-ia-srcpick" id="cdx-cur-srcpick" style="display:none">' +
        '<select id="cdx-cur-apostila"><option value="">' + esc(t('cohorts.cursos_ia_apostila_loading')) + '</option></select>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-primary" id="cdx-cur-apostila-gen">' + esc(t('cohorts.cursos_ia_apostila_gen')) + '</button>' +
      '</div>' +
      '<div class="cdx-cur-ia-chat" id="cdx-cur-chat">' +
        '<div class="cdx-cur-msg ai">' + esc(t('cohorts.cursos_ia_welcome')) + '</div>' +
      '</div>' +
      '<div class="cdx-cur-ia-compose">' +
        '<div class="cdx-cur-chips">' +
          _aiChip('cohorts.cursos_ia_chip_detail', 'cohorts.cursos_ia_q_detail') +
          _aiChip('cohorts.cursos_ia_chip_shorten', 'cohorts.cursos_ia_q_shorten') +
          _aiChip('cohorts.cursos_ia_chip_renumber', 'cohorts.cursos_ia_q_renumber') +
        '</div>' +
        '<div class="cdx-cur-inrow">' +
          '<input id="cdx-cur-ai-input" autocomplete="off" placeholder="' + esc(t('cohorts.cursos_ia_placeholder')) + '">' +
          '<button class="cdx-btn cdx-btn-primary cdx-btn-sm" id="cdx-cur-ai-send" title="' + esc(t('cohorts.cursos_ia_send')) + '">&#8593;</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function _appendMsg(kind, text) {
  const chat = _q('cdx-cur-chat');
  if (!chat) return null;
  const div = document.createElement('div');
  div.className = 'cdx-cur-msg ' + (kind === 'me' ? 'me' : 'ai');
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

// Send a natural-language request to the shared AI endpoint; apply any returned
// ementa to the editor and surface the reply in the chat. `displayText` lets the
// chat bubble show a short label while a longer payload (e.g. apostila material)
// goes to the model.
function _askAI(text, displayText) {
  if (!_course || !text) return;
  _appendMsg('me', displayText || text);
  _aiMsgs.push({ role: 'user', content: text });
  const loading = _appendMsg('ai', t('cohorts.cursos_ia_thinking'));
  if (loading) loading.classList.add('is-loading');
  const sendBtn = _q('cdx-cur-ai-send');
  if (sendBtn) sendBtn.disabled = true;
  const system = buildEmentaAIPrompt({ courseTitle: _course.title, ementa: _ementa });
  // Generous response budget: a full ementa (many modules) as JSON can be large,
  // and a truncated response yields unparseable JSON (looks like a failure).
  ai.chat({ system, messages: _aiMsgs.slice(-12), temperature: 0.3, max_tokens: 4000 }).then((res) => {
    if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
    if (!res) { _appendMsg('ai', t('cohorts.cursos_ia_rate')); return; }   // facade returns null on rate-limit
    if (!res.text) {
      _appendMsg('ai', t('cohorts.cursos_ia_error'));
      if (window.bsLog) window.bsLog('cursos ai_chat: empty response', 'error');
      return;
    }
    const parsed = parseEmentaAIResponse(res.text);
    const reply = parsed.reply || (parsed.ementa ? t('cohorts.cursos_ia_applied') : t('cohorts.cursos_ia_error'));
    _aiMsgs.push({ role: 'assistant', content: reply });
    _appendMsg('ai', reply);
    if (parsed.ementa) { _ementa = parsed.ementa; _rerenderEmenta(); toast.ok(t('cohorts.cursos_ia_applied')); }
  }).catch((err) => {
    if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
    _appendMsg('ai', t('cohorts.cursos_ia_error'));
    if (window.bsLog) window.bsLog('cursos ai_chat: ' + (err && err.message || err), 'error');
  }).finally(() => {
    const b = _q('cdx-cur-ai-send');
    if (b) b.disabled = false;
  });
}

// Lazy-load the Conteúdo apostila sets (only those with sections) into the picker.
function _loadApostilas() {
  const sel = _q('cdx-cur-apostila');
  if (!sel) return;
  if (_apostilas.length) { _fillApostilaSelect(sel); return; }
  contentApi.listSets().then((d) => {
    _apostilas = ((d && d.sets) || []).filter((s) => (s.item_count || 0) > 0);
    _fillApostilaSelect(sel);
  }).catch((err) => {
    if (window.bsLog) window.bsLog('cursos apostila list: ' + (err && err.message || err), 'error');
    sel.innerHTML = '<option value="">' + esc(t('cohorts.cursos_ia_apostila_none')) + '</option>';
  });
}

function _fillApostilaSelect(sel) {
  if (!_apostilas.length) {
    sel.innerHTML = '<option value="">' + esc(t('cohorts.cursos_ia_apostila_none')) + '</option>';
    return;
  }
  sel.innerHTML = '<option value="">' + esc(t('cohorts.cursos_ia_apostila_choose')) + '</option>' +
    _apostilas.map((s) => {
      const name = s.title || s.name || t('cohorts.cursos_ia_apostila_unnamed');
      return '<option value="' + esc(String(s.id)) + '">' + esc(name) + ' (' + (s.item_count || 0) + ')</option>';
    }).join('');
}

// Build the ementa from a chosen apostila: pull its sections (title + summary)
// and feed them to the same AI pipeline as a generation request.
function _genFromApostila() {
  const sel = _q('cdx-cur-apostila');
  const id = sel && sel.value;
  if (!id) { toast.err(t('cohorts.cursos_ia_apostila_pick')); return; }
  const set = _apostilas.find((s) => String(s.id) === String(id));
  const name = (set && (set.title || set.name)) || t('cohorts.cursos_ia_apostila_unnamed');
  const gen = _q('cdx-cur-apostila-gen');
  if (gen) gen.disabled = true;
  contentApi.getSet({ id }).then((d) => {
    const items = (d && d.items) || [];
    if (!items.length) { toast.err(t('cohorts.cursos_ia_apostila_empty')); return; }
    const material = items.slice()
      .sort((a, b) => (a.set_position || 0) - (b.set_position || 0))
      .map((i) => '- ' + (i.title || '') + (i.summary ? ': ' + i.summary : ''))
      .join('\n');
    const apiText = t('cohorts.cursos_ia_apostila_prompt').replace('{name}', name) + '\n\n' + material;
    _askAI(apiText, t('cohorts.cursos_ia_apostila_sent').replace('{name}', name));
  }).catch((err) => {
    notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
  }).finally(() => {
    const g = _q('cdx-cur-apostila-gen');
    if (g) g.disabled = false;
  });
}

function _courseTurmaCount() {
  const c = _courses.find((x) => x.id === _selectedId);
  return (c && c.turma_count) || 0;
}

function _renderEmenta() {
  if (!_ementa.modules.length) {
    return '<div class="cdx-cursos-ementa-empty">' + esc(t('cohorts.ementa_empty')) + '</div>' + _addModuleBtn();
  }
  return _ementa.modules.map((m, mi) =>
    '<div class="cdx-cur-mod" data-mi="' + mi + '">' +
      '<div class="cdx-cur-mod-h">' +
        '<span class="cdx-cur-num">' + _roman(mi + 1) + '</span>' +
        '<input class="cdx-cur-mt" data-mi="' + mi + '" value="' + esc(m.title) + '" placeholder="' + esc(t('cohorts.ementa_module_ph')) + '">' +
        '<button class="cdx-cur-x" data-action="del-mod" data-mi="' + mi + '" title="' + esc(t('cohorts.delete')) + '">×</button>' +
      '</div>' +
      m.topics.map((tp, ti) =>
        '<div class="cdx-cur-top" data-mi="' + mi + '" data-ti="' + ti + '">' +
          '<input class="cdx-cur-tt" data-mi="' + mi + '" data-ti="' + ti + '" value="' + esc(tp.title) + '" placeholder="' + esc(t('cohorts.ementa_topic_ph')) + '">' +
          '<button class="cdx-cur-x" data-action="del-top" data-mi="' + mi + '" data-ti="' + ti + '">×</button>' +
          tp.subtopics.map((s, si) =>
            '<div class="cdx-cur-sub">' +
              '<input class="cdx-cur-st" data-mi="' + mi + '" data-ti="' + ti + '" data-si="' + si + '" value="' + esc(s) + '" placeholder="' + esc(t('cohorts.ementa_sub_ph')) + '">' +
              '<button class="cdx-cur-x" data-action="del-sub" data-mi="' + mi + '" data-ti="' + ti + '" data-si="' + si + '">×</button>' +
            '</div>'
          ).join('') +
          '<button class="cdx-btn cdx-btn-vazado cdx-btn-sm cdx-btn-xs" data-action="add-sub" data-mi="' + mi + '" data-ti="' + ti + '">' + esc(t('cohorts.ementa_add_sub')) + '</button>' +
        '</div>'
      ).join('') +
      '<button class="cdx-btn cdx-btn-vazado cdx-btn-sm cdx-btn-xs" data-action="add-top" data-mi="' + mi + '">' + esc(t('cohorts.ementa_add_topic')) + '</button>' +
    '</div>'
  ).join('') + _addModuleBtn();
}

function _addModuleBtn() {
  return '<button class="cdx-btn cdx-cursos-addmod" data-action="add-mod">' + esc(t('cohorts.ementa_add_module')) + '</button>';
}

function _roman(n) {
  const map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let out = ''; let x = n;
  for (const [v, sym] of map) { while (x >= v) { out += sym; x -= v; } }
  return out;
}

// Course -> apostila binding (mandatory model: a turma resolves its apostila via
// course_id -> apostila_set_id). Populates the picker from the apostila library and
// persists the choice immediately. Uses id cdx-cur-apostila-bind (distinct from the
// AI-ementa apostila picker's cdx-cur-apostila).
function _wireApostilaBind() {
  const sel = _q('cdx-cur-apostila-bind');
  if (!sel || !_course) return;
  contentApi.listSets().then((d) => {
    const sets = (d && d.sets) || [];
    const cur = _course.apostila_set_id != null ? String(_course.apostila_set_id) : '';
    sel.innerHTML = '<option value="">' + esc(t('cohorts.cursos_apostila_none')) + '</option>' +
      sets.map((s) => {
        const name = (s.name && s.name.trim()) ? s.name : t('apostila.unnamed');
        const sub = ' (' + t('apostila.meta_sections').replace('{n}', s.item_count || 0) + ')';
        return '<option value="' + esc(s.id) + '"' + (String(s.id) === cur ? ' selected' : '') + '>' + esc(name + sub) + '</option>';
      }).join('');
  }).catch((err) => { if (window.bsLog) window.bsLog('cursos apostila bind list: ' + (err && err.message || err), 'error'); });
  sel.addEventListener('change', () => {
    const val = sel.value ? Number(sel.value) : null;
    api.setApostila({ id: _course.id, apostila_set_id: val }).then((d) => {
      if (d && d.error) throw new Error(d.error);
      _course.apostila_set_id = val;
      toast.ok(t('cohorts.cursos_apostila_saved'));
    }).catch((err) => notice.internal(t('cohorts.error') + ': ' + (err && err.message || err)));
  });
}

function _wireMain() {
  const titleEl = _q('cdx-cur-title');
  const hoursEl = _q('cdx-cur-hours');
  if (titleEl) titleEl.addEventListener('change', () => _saveCourseMeta());
  if (hoursEl) hoursEl.addEventListener('change', () => _saveCourseMeta());
  const arch = _q('cdx-cur-archive');
  if (arch) arch.addEventListener('click', _onArchiveCourse);
  const dup = _q('cdx-cur-duplicate');
  if (dup) dup.addEventListener('click', _onDuplicateCourse);
  const del = _q('cdx-cur-delete');
  if (del) del.addEventListener('click', _onDeleteCourse);
  _wireApostilaBind();
  const save = _q('cdx-cur-save');
  if (save) save.addEventListener('click', _saveEmenta);
  const paste = _q('cdx-cur-paste');
  if (paste) paste.addEventListener('click', _openPasteModal);

  // AI assistant: send box, Enter, and the quick-action chips.
  const aiInput = _q('cdx-cur-ai-input');
  const aiSend = _q('cdx-cur-ai-send');
  const submitAI = () => { if (!aiInput) return; const v = aiInput.value.trim(); if (!v) return; aiInput.value = ''; _askAI(v); };
  if (aiSend) aiSend.addEventListener('click', submitAI);
  if (aiInput) aiInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitAI(); } });
  if (_viewEl) _viewEl.querySelectorAll('.cdx-cur-chip').forEach((c) => c.addEventListener('click', () => _askAI(c.dataset.q)));

  // Source toggle: "Colar programa" (free chat) vs "De uma apostila" (picker).
  const srcpick = _q('cdx-cur-srcpick');
  if (_viewEl) _viewEl.querySelectorAll('.cdx-cur-srcopt').forEach((b) => b.addEventListener('click', () => {
    _viewEl.querySelectorAll('.cdx-cur-srcopt').forEach((x) => x.classList.toggle('is-on', x === b));
    const isApostila = b.dataset.src === 'apostila';
    if (srcpick) srcpick.style.display = isApostila ? '' : 'none';
    if (isApostila) _loadApostilas();
  }));
  const genBtn = _q('cdx-cur-apostila-gen');
  if (genBtn) genBtn.addEventListener('click', _genFromApostila);

  const ementaEl = _q('cdx-cur-ementa');
  if (!ementaEl) return;
  // Live model sync on title edits (no re-render → focus preserved).
  ementaEl.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.matches('input')) return;
    const mi = Number(el.dataset.mi);
    if (el.classList.contains('cdx-cur-mt')) _ementa.modules[mi].title = el.value;
    else if (el.classList.contains('cdx-cur-tt')) _ementa.modules[mi].topics[Number(el.dataset.ti)].title = el.value;
    else if (el.classList.contains('cdx-cur-st')) _ementa.modules[mi].topics[Number(el.dataset.ti)].subtopics[Number(el.dataset.si)] = el.value;
  });
  // Structural buttons → mutate model + re-render the editor.
  ementaEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const mi = btn.dataset.mi != null ? Number(btn.dataset.mi) : null;
    const ti = btn.dataset.ti != null ? Number(btn.dataset.ti) : null;
    const si = btn.dataset.si != null ? Number(btn.dataset.si) : null;
    const a = btn.dataset.action;
    if (a === 'add-mod') _ementa.modules.push({ title: '', topics: [] });
    else if (a === 'del-mod') _ementa.modules.splice(mi, 1);
    else if (a === 'add-top') _ementa.modules[mi].topics.push({ title: '', subtopics: [] });
    else if (a === 'del-top') _ementa.modules[mi].topics.splice(ti, 1);
    else if (a === 'add-sub') _ementa.modules[mi].topics[ti].subtopics.push('');
    else if (a === 'del-sub') _ementa.modules[mi].topics[ti].subtopics.splice(si, 1);
    else return;
    _rerenderEmenta();
  });
}

function _rerenderEmenta() {
  const el = _q('cdx-cur-ementa');
  if (el) el.innerHTML = _renderEmenta();
  // refresh the stats line
  const s = ementaStats(_ementa);
  const statsEl = _viewEl && _viewEl.querySelector('.cdx-cursos-stats');
  if (statsEl) statsEl.textContent = t('cohorts.ementa_stats')
    .replace('{m}', String(s.modules)).replace('{t}', String(s.topics)).replace('{s}', String(s.subtopics));
}

function _saveCourseMeta() {
  if (!_course) return;
  const title = (_q('cdx-cur-title').value || '').trim();
  const hours = (_q('cdx-cur-hours').value || '').trim();
  api.update({ id: _course.id, title: title || _course.title, hours: hours || null }).then((d) => {
    if (d && d.course) _course = d.course;
    const c = _courses.find((x) => x.id === _selectedId);
    if (c) { c.title = title || c.title; c.hours = hours || null; }
    _renderRail();
    toast.ok(t('cohorts.course_saved'));
  }).catch((err) => {
    notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
  });
}

function _saveEmenta() {
  if (!_course) return;
  api.update({ id: _course.id, ementa_json: JSON.stringify(normalizeEmenta(_ementa)) }).then((d) => {
    if (d && d.course) { _course = d.course; _ementa = normalizeEmenta(_course.ementa_json); }
    toast.ok(t('cohorts.ementa_saved'));
  }).catch((err) => {
    notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
  });
}

function _onArchiveCourse() {
  if (!_course) return;
  const html =
    '<div class="cdx-modal cdx-modal--sm">' +
      '<div class="cdx-modal-title">' + esc(t('cohorts.course_archive_title')) + '</div>' +
      '<p style="margin:0 0 1.2rem;font-size:.88rem;color:var(--text-secondary)">' + esc(t('cohorts.course_archive_msg')) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-cur-arc-cancel">' + esc(t('cohorts.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-cur-arc-ok">' + esc(t('cohorts.archive')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('#cdx-cur-arc-cancel').addEventListener('click', () => closeModal(bd));
  bd.querySelector('#cdx-cur-arc-ok').addEventListener('click', () => {
    closeModal(bd);
    api.archive({ id: _course.id }).then(() => {
      toast.ok(t('cohorts.course_archived'));
      _selectedId = null; _course = null; _ementa = emptyEmenta();
      _loadCourses(); // reload so it drops into the archived section, active list re-selects
    }).catch((err) => {
      notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
    });
  });
}

// Restore an archived course to the active list (Élder: archived courses stay visible +
// reversible, no dead end).
function _onUnarchiveCourse(id) {
  api.unarchive({ id }).then(() => {
    toast.ok(t('cohorts.course_unarchived'));
    _loadCourses();
  }).catch((err) => {
    notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
  });
}

function _onDuplicateCourse() {
  if (!_course) return;
  api.duplicate({ id: _course.id }).then((d) => {
    const c = d && d.course;
    if (!c) return;
    toast.ok(t('cohorts.course_duplicated'));
    _courses.unshift(c);
    _selectCourse(c.id);
  }).catch((err) => {
    notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
  });
}

// Hard-delete (vs archive): only for a course NO turma uses. The worker refuses an in-use
// course (course_in_use, since a turma resolves its apostila via course_id); the front
// pre-checks the turma count for a friendlier message and still handles the worker guard
// as the source of truth (which reads err.data.error, since the facade throws on {error}).
function _onDeleteCourse() {
  if (!_course) return;
  const n = _courseTurmaCount();
  if (n > 0) { notice.warn(t('cohorts.course_delete_in_use').replace('{n}', String(n))); return; }
  const html =
    '<div class="cdx-modal cdx-modal--sm">' +
      '<div class="cdx-modal-title">' + esc(t('cohorts.course_delete_title')) + '</div>' +
      '<p style="margin:0 0 1.2rem;font-size:.88rem;color:var(--text-secondary)">' + esc(t('cohorts.course_delete_msg')) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-cur-del-cancel">' + esc(t('cohorts.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-danger-solid" id="cdx-cur-del-ok">' + esc(t('cohorts.course_delete')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('#cdx-cur-del-cancel').addEventListener('click', () => closeModal(bd));
  bd.querySelector('#cdx-cur-del-ok').addEventListener('click', () => {
    closeModal(bd);
    api.remove({ id: _course.id }).then(() => {
      toast.ok(t('cohorts.course_deleted'));
      // Reload (not just filter _courses) so a deleted ARCHIVED course also leaves the
      // archived section without a manual refresh. [Élder]
      _selectedId = null; _course = null; _ementa = emptyEmenta();
      _loadCourses();
    }).catch((err) => {
      const code = err && err.data && err.data.error;
      if (code === 'course_in_use') {
        notice.warn(t('cohorts.course_delete_in_use').replace('{n}', String((err.data && err.data.turma_count) || '')));
        _loadCourses();
        return;
      }
      notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
    });
  });
}

// Paste-and-structure (heuristic v1). Replaces or appends to the current ementa.
function _openPasteModal() {
  const html =
    '<div class="cdx-modal cdx-modal--xl">' +
      '<div class="cdx-modal-title">' + esc(t('cohorts.ementa_paste_title')) + '</div>' +
      '<p class="cdx-helper-text">' + esc(t('cohorts.ementa_paste_hint')) + '</p>' +
      '<textarea id="cdx-cur-paste-text" rows="10" class="cdx-cursos-paste-ta" placeholder="' + esc(t('cohorts.ementa_paste_ph')) + '"></textarea>' +
      '<label class="cdx-cursos-paste-mode"><input type="checkbox" id="cdx-cur-paste-append"> ' + esc(t('cohorts.ementa_paste_append')) + '</label>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-cur-paste-cancel">' + esc(t('cohorts.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-cur-paste-ok">' + esc(t('cohorts.ementa_structure_btn')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('#cdx-cur-paste-cancel').addEventListener('click', () => closeModal(bd));
  bd.querySelector('#cdx-cur-paste-ok').addEventListener('click', () => {
    const text = bd.querySelector('#cdx-cur-paste-text').value;
    const parsed = parseEmenta(text);
    if (!parsed.modules.length) { toast.err(t('cohorts.ementa_paste_empty')); return; }
    const append = bd.querySelector('#cdx-cur-paste-append').checked;
    _ementa = append ? { modules: _ementa.modules.concat(parsed.modules) } : parsed;
    closeModal(bd);
    _rerenderEmenta();
    toast.ok(t('cohorts.ementa_structured'));
  });
}

// ── Roteiros-base editor (track-46 fatia 2b) ─────────────────────────────────
// The curso's numbered base roteiros, one per aula position. Edited by reusing
// roteiro-view.js verbatim (the same two-panel component the aula Roteiro
// sub-tab mounts, cohorts.js), swapping in _courseRoteiroStore() below instead
// of the aula-backed store: `id`/aula.id here IS the base number
// (_selectedBaseNumber), not an aula id, since a course has no aulas of its own.
// The view's time meter is meaningless for a base with no specific aula.hours,
// so it is hidden by a scoped rule in roteiro/roteiro.css (#cdx-cur-roteiro-view).

function _renderRoteirosSectionHtml() {
  return '<div class="cdx-cursos-roteiros">' +
    '<div class="cdx-cursos-panel-h">' +
      '<b>' + esc(t('cohorts.cursos_roteiros_title')) + '</b>' +
      '<span class="cdx-cursos-sp"></span>' +
      '<button class="cdx-btn cdx-btn-sm" id="cdx-cur-roteiro-new">' + esc(t('cohorts.cursos_roteiro_new')) + '</button>' +
    '</div>' +
    '<div class="cdx-cursos-roteiro-tabs" id="cdx-cur-roteiro-tabs">' + _roteiroTabsHtml() + '</div>' +
    '<div class="cdx-cursos-roteiro-view" id="cdx-cur-roteiro-view"></div>' +
  '</div>';
}

function _roteiroTabsHtml() {
  if (!_courseRoteirosLoaded) return '<span class="cdx-cursos-roteiro-msg">' + esc(t('cohorts.loading')) + '</span>';
  if (!_courseRoteiros.length) return '<span class="cdx-cursos-roteiro-msg">' + esc(t('cohorts.cursos_roteiro_empty')) + '</span>';
  return _courseRoteiros.slice().sort((a, b) => Number(a.aula_number) - Number(b.aula_number)).map((r) => {
    const n = Number(r.aula_number);
    const on = n === _selectedBaseNumber ? ' is-on' : '';
    return '<button type="button" class="cdx-cursos-roteiro-tab' + on + '" data-roteiro-base="' + n + '">' +
      esc(t('roteiro.base_option').replace('{n}', String(n))) + '</button>';
  }).join('');
}

function _wireRoteirosSection() {
  const tabsEl = _q('cdx-cur-roteiro-tabs');
  if (tabsEl) tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-roteiro-base]');
    if (btn) _selectBase(Number(btn.dataset.roteiroBase));
  });
  const newBtn = _q('cdx-cur-roteiro-new');
  if (newBtn) newBtn.addEventListener('click', _onNewBase);
  _mountRoteiroEditor();
}

function _selectBase(n) {
  if (n === _selectedBaseNumber) return;
  _selectedBaseNumber = n;
  _rerenderRoteiroTabs();
  _mountRoteiroEditor();
}

function _rerenderRoteiroTabs() {
  const tabsEl = _q('cdx-cur-roteiro-tabs');
  if (tabsEl) tabsEl.innerHTML = _roteiroTabsHtml();
}

function _mountRoteiroEditor() {
  _unmountRoteiroEditor();
  const el = _q('cdx-cur-roteiro-view');
  if (!el || _selectedBaseNumber == null) return;
  roteiroView.mount(el, { store: _courseRoteiroStore(), aula: { id: _selectedBaseNumber }, t });
  _roteiroMounted = true;
}

function _unmountRoteiroEditor() {
  if (_roteiroMounted) { try { roteiroView.unmount(); } catch (_) { /* already gone */ } _roteiroMounted = false; }
}

function _onNewBase() {
  if (!_course) return;
  const n = nextBaseNumber(_courseRoteiros.map((r) => r.aula_number));
  const blank = JSON.stringify({ blocos: [] });
  const btn = _q('cdx-cur-roteiro-new');
  if (btn) btn.disabled = true;
  roteiroApi.saveCourseBase({ course_id: _course.id, aula_number: n, roteiro_json: blank }).then((res) => {
    if (btn) btn.disabled = false;
    _courseRoteiros.push({ id: res && res.id, aula_number: n, roteiro_json: blank });
    _selectedBaseNumber = n;
    _rerenderRoteiroTabs();
    _mountRoteiroEditor();
    toast.ok(t('cohorts.cursos_roteiro_created'));
  }).catch((err) => {
    if (btn) btn.disabled = false;
    notice.internal(t('cohorts.error') + ': ' + ((err && err.message) || err));
  });
}

// Store adapter for roteiro-view.js: `id` (aula.id in the view's vocabulary) is
// the base number. Single consumer (this section), so it stays a local factory
// rather than a third roteiro/*-store.js file -- the injected-store SEAM is what
// makes reusing the view possible, not a shared store file.
function _courseRoteiroStore() {
  return {
    load() {
      const row = _courseRoteiros.find((r) => Number(r.aula_number) === Number(_selectedBaseNumber));
      return normalizeRoteiro(row && row.roteiro_json);
    },
    save(id, roteiro) {
      const n = _selectedBaseNumber;
      const r = normalizeRoteiro(roteiro);
      const json = JSON.stringify(r);
      return roteiroApi.saveCourseBase({ course_id: _course.id, aula_number: n, roteiro_json: json }).then((res) => {
        const row = _courseRoteiros.find((x) => Number(x.aula_number) === Number(n));
        if (row) row.roteiro_json = json;
        else _courseRoteiros.push({ id: res && res.id, aula_number: n, roteiro_json: json });
      }).catch((e) => {
        // Hard rule (Codex/CLAUDE.md): a caught error must still reach the debug
        // pill. save() is fire-and-forget from the view's side, so this catch is
        // the only place a failed persist surfaces.
        if (window.bsLog) window.bsLog('codex: cursos roteiro-base save failed: ' + ((e && e.message) || e), 'error');
      });
    },
  };
}

// ── Public (called by cohorts.js when sub === 'cursos') ─────────────────────────

export function mount(viewEl) {
  _viewEl = viewEl;
  _courses = [];
  _archived = [];
  _selectedId = null;
  _course = null;
  _ementa = emptyEmenta();
  _aiMsgs = [];
  _apostilas = [];
  _courseRoteiros = [];
  _courseRoteirosLoaded = false;
  _selectedBaseNumber = null;
  _roteiroMounted = false;
  _renderShell();
  _buildRail();
  _loadCourses();
}

export function unmount() {
  _unmountRoteiroEditor();
  if (_rail) { _rail.destroy(); _rail = null; }
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _courses = [];
  _archived = [];
  _selectedId = null;
  _course = null;
  _ementa = emptyEmenta();
  _aiMsgs = [];
  _apostilas = [];
  _courseRoteiros = [];
  _courseRoteirosLoaded = false;
  _selectedBaseNumber = null;
}
