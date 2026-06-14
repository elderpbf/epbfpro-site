// cohorts/courses.js
// Cursos sub-tab of the Cohorts tab: the reusable course registry + ementa
// editor (the B+C concept Elder chose). A course is a MOLD — its title/hours/
// ementa seed a turma's own editable copy at link time (the turma form copies
// them; see cohorts.js). Backend: codex-api courses facade (ct_*_course).
//
// This module owns the Cursos sub-view only; cohorts.js routes ctx.sub === 'cursos'
// here via mount()/unmount(). Layout mirrors backstage/mocks/curso/b2.html:
// page header, course-switcher rail, course data on top, full-width ementa editor.
//
// AI assistant (conversational refine + "from an apostila" source) is a deferred
// follow-up — it needs the Worker LLM endpoint wired with a prompt + a chat UI.
// The functional v1 ships the heuristic "colar e estruturar" (ementa.parseEmenta),
// manual editing, and persistence.

import { courses as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import {
  emptyEmenta, normalizeEmenta, ementaStats, parseEmenta,
} from '../js/ementa.js';

let _viewEl = null;
let _courses = [];
let _selectedId = null;
let _course = null;        // full selected course (with ementa)
let _ementa = emptyEmenta(); // working copy of the selected course's ementa

function _toast(msg) {
  if (window.BSToast && window.BSToast.show) window.BSToast.show(msg);
}

const IDS = {
  rail:   'cdx-cursos-rail',
  main:   'cdx-cursos-main',
};

function _q(id) { return _viewEl ? _viewEl.querySelector('#' + id) : null; }

// ── Shell ─────────────────────────────────────────────────────────────────────

function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-cursos">' +
      '<div class="cdx-cursos-head">' +
        '<div>' +
          '<h1 class="cdx-cursos-h1">' + esc(t('cohorts.cursos_title')) + '</h1>' +
          '<p class="cdx-cursos-sub">' + esc(t('cohorts.cursos_desc')) + '</p>' +
        '</div>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-cursos-new">' + esc(t('cohorts.cursos_new')) + '</button>' +
      '</div>' +
      '<div class="cdx-cursos-work">' +
        '<div class="cdx-cursos-rail" id="' + IDS.rail + '"></div>' +
        '<div class="cdx-cursos-main" id="' + IDS.main + '"></div>' +
      '</div>' +
    '</div>';
  _q('cdx-cursos-new').addEventListener('click', _onNewCourse);
}

// ── Course list (rail) ──────────────────────────────────────────────────────────

function _loadCourses() {
  api.list().then((d) => {
    _courses = (d && d.courses) || [];
    _renderRail();
    if (_selectedId == null && _courses.length) _selectCourse(_courses[0].id);
    else if (_selectedId == null) _renderMain();
  }).catch(() => {
    const el = _q(IDS.rail);
    if (el) el.innerHTML = '<div class="cdx-empty">' + esc(t('cohorts.error_loading')) + '</div>';
  });
}

function _renderRail() {
  const el = _q(IDS.rail);
  if (!el) return;
  const head = '<div class="cdx-cursos-rail-h">' + esc(t('cohorts.cursos_title')) + '</div>';
  if (!_courses.length) {
    el.innerHTML = head + '<div class="cdx-empty">' + esc(t('cohorts.cursos_none')) + '</div>';
    return;
  }
  el.innerHTML = head + _courses.map((c) => {
    const on = c.id === _selectedId ? ' is-on' : '';
    const n = c.turma_count || 0;
    const turmas = n === 1 ? '1 ' + t('cohorts.turma_singular') : n + ' ' + t('cohorts.turma_plural');
    const hours = c.hours ? esc(c.hours) + ' · ' : '';
    return (
      '<div class="cdx-cursos-ri' + on + '" data-id="' + esc(String(c.id)) + '">' +
        '<div class="cdx-cursos-ri-t">' + esc(c.title) + '</div>' +
        '<div class="cdx-cursos-ri-m">' + hours + esc(turmas) + '</div>' +
      '</div>'
    );
  }).join('');
  el.querySelectorAll('.cdx-cursos-ri').forEach((r) => {
    r.addEventListener('click', () => _selectCourse(Number(r.dataset.id)));
  });
}

function _selectCourse(id) {
  _selectedId = id;
  _renderRail();
  const el = _q(IDS.main);
  if (el) el.innerHTML = '<div class="cdx-empty">' + esc(t('cohorts.loading')) + '</div>';
  api.get({ id }).then((d) => {
    _course = (d && d.course) || null;
    _ementa = normalizeEmenta(_course && _course.ementa_json);
    _renderMain();
  }).catch(() => {
    const el2 = _q(IDS.main);
    if (el2) el2.innerHTML = '<div class="cdx-empty">' + esc(t('cohorts.error_loading')) + '</div>';
  });
}

function _onNewCourse() {
  api.create({ title: t('cohorts.cursos_new_default') }).then((d) => {
    _toast(t('cohorts.course_created'));
    const c = d && d.course;
    if (c) { _courses.unshift(c); _selectCourse(c.id); }
  }).catch((err) => {
    _toast(t('cohorts.error') + ': ' + (err && err.message || err));
    if (window.bsLog) window.bsLog('ct_create_course: ' + (err && err.message || err), 'error');
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
      '<input class="cdx-cursos-title" id="cdx-cur-title" value="' + esc(_course.title || '') + '" placeholder="' + esc(t('cohorts.course_title_ph')) + '">' +
      '<div class="cdx-cursos-fields">' +
        '<div class="cdx-cursos-f"><label>' + esc(t('cohorts.course_hours_label')) + '</label>' +
          '<input id="cdx-cur-hours" value="' + esc(_course.hours || '') + '" placeholder="' + esc(t('cohorts.course_hours_ph')) + '"></div>' +
        '<div class="cdx-cursos-f cdx-cursos-f-stat"><label>' + esc(t('cohorts.course_reuse_label')) + '</label>' +
          '<div class="cdx-cursos-f-v">' + esc((_courseTurmaCount()) + ' ' + (_courseTurmaCount() === 1 ? t('cohorts.turma_singular') : t('cohorts.turma_plural'))) + '</div></div>' +
        '<button class="cdx-btn cdx-btn-sm cdx-cursos-archive" id="cdx-cur-archive">' + esc(t('cohorts.archive')) + '</button>' +
      '</div>' +
    '</div>' +
    // ementa editor (full width)
    '<div class="cdx-cursos-panel">' +
      '<div class="cdx-cursos-panel-h">' +
        '<b>' + esc(t('cohorts.ementa_title')) + '</b>' +
        '<span class="cdx-cursos-stats">' + esc(statLine) + '</span>' +
        '<span class="cdx-cursos-sp"></span>' +
        '<button class="cdx-btn cdx-btn-sm" id="cdx-cur-paste">' + esc(t('cohorts.ementa_paste_btn')) + '</button>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-primary" id="cdx-cur-save">' + esc(t('cohorts.ementa_save')) + '</button>' +
      '</div>' +
      '<div class="cdx-cursos-ementa" id="cdx-cur-ementa">' + _renderEmenta() + '</div>' +
    '</div>';

  _wireMain();
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
          '<button class="cdx-btn cdx-btn-ghost cdx-btn-xs" data-action="add-sub" data-mi="' + mi + '" data-ti="' + ti + '">' + esc(t('cohorts.ementa_add_sub')) + '</button>' +
        '</div>'
      ).join('') +
      '<button class="cdx-btn cdx-btn-ghost cdx-btn-xs" data-action="add-top" data-mi="' + mi + '">' + esc(t('cohorts.ementa_add_topic')) + '</button>' +
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

function _wireMain() {
  const titleEl = _q('cdx-cur-title');
  const hoursEl = _q('cdx-cur-hours');
  if (titleEl) titleEl.addEventListener('change', () => _saveCourseMeta());
  if (hoursEl) hoursEl.addEventListener('change', () => _saveCourseMeta());
  const arch = _q('cdx-cur-archive');
  if (arch) arch.addEventListener('click', _onArchiveCourse);
  const save = _q('cdx-cur-save');
  if (save) save.addEventListener('click', _saveEmenta);
  const paste = _q('cdx-cur-paste');
  if (paste) paste.addEventListener('click', _openPasteModal);

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
    _toast(t('cohorts.course_saved'));
  }).catch((err) => {
    _toast(t('cohorts.error') + ': ' + (err && err.message || err));
    if (window.bsLog) window.bsLog('ct_update_course: ' + (err && err.message || err), 'error');
  });
}

function _saveEmenta() {
  if (!_course) return;
  api.update({ id: _course.id, ementa_json: JSON.stringify(normalizeEmenta(_ementa)) }).then((d) => {
    if (d && d.course) { _course = d.course; _ementa = normalizeEmenta(_course.ementa_json); }
    _toast(t('cohorts.ementa_saved'));
  }).catch((err) => {
    _toast(t('cohorts.error') + ': ' + (err && err.message || err));
    if (window.bsLog) window.bsLog('ct_update_course (ementa): ' + (err && err.message || err), 'error');
  });
}

function _onArchiveCourse() {
  if (!_course) return;
  const html =
    '<div class="cdx-modal" style="max-width:420px">' +
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
      _toast(t('cohorts.course_archived'));
      _courses = _courses.filter((x) => x.id !== _course.id);
      _selectedId = null; _course = null; _ementa = emptyEmenta();
      _renderRail();
      if (_courses.length) _selectCourse(_courses[0].id); else _renderMain();
    }).catch((err) => {
      _toast(t('cohorts.error') + ': ' + (err && err.message || err));
      if (window.bsLog) window.bsLog('ct_archive_course: ' + (err && err.message || err), 'error');
    });
  });
}

// Paste-and-structure (heuristic v1). Replaces or appends to the current ementa.
function _openPasteModal() {
  const html =
    '<div class="cdx-modal" style="max-width:560px">' +
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
    if (!parsed.modules.length) { _toast(t('cohorts.ementa_paste_empty')); return; }
    const append = bd.querySelector('#cdx-cur-paste-append').checked;
    _ementa = append ? { modules: _ementa.modules.concat(parsed.modules) } : parsed;
    closeModal(bd);
    _rerenderEmenta();
    _toast(t('cohorts.ementa_structured'));
  });
}

// ── Public (called by cohorts.js when sub === 'cursos') ─────────────────────────

export function mount(viewEl) {
  _viewEl = viewEl;
  _courses = [];
  _selectedId = null;
  _course = null;
  _ementa = emptyEmenta();
  _renderShell();
  _loadCourses();
}

export function unmount() {
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _courses = [];
  _selectedId = null;
  _course = null;
  _ementa = emptyEmenta();
}
