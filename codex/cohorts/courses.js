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
// AI assistant: the conversational panel (the "C" of the B+C hybrid) talks to the
// shared Codex AI endpoint via the `ai.chat` facade (codex-api `ai_chat`). It
// reads the current ementa, applies a natural-language request, and writes the
// updated program back into the editor at the left. The heuristic "colar e
// estruturar" (ementa.parseEmenta) stays as the offline, no-LLM path.
// The "De uma apostila" source is deferred (needs multi-apostila in Conteúdo).

import { courses as api, ai, content as contentApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import {
  emptyEmenta, normalizeEmenta, ementaStats, parseEmenta,
  buildEmentaAIPrompt, parseEmentaAIResponse,
} from '../js/ementa.js';

let _viewEl = null;
let _courses = [];
let _selectedId = null;
let _course = null;        // full selected course (with ementa)
let _ementa = emptyEmenta(); // working copy of the selected course's ementa
let _aiMsgs = [];          // assistant chat history ({role, content}) for ai.chat
let _apostilas = [];       // Conteúdo apostila sets, lazy-loaded for "De uma apostila"

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
  _aiMsgs = []; // fresh chat per course
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
      '<input class="cdx-cursos-title" id="cdx-cur-title" value="' + esc(_course.title || '') + '" placeholder="' + esc(t('cohorts.course_title_ph')) + '">' +
      '<div class="cdx-cursos-fields">' +
        '<div class="cdx-cursos-f"><label>' + esc(t('cohorts.course_hours_label')) + '</label>' +
          '<input id="cdx-cur-hours" value="' + esc(_course.hours || '') + '" placeholder="' + esc(t('cohorts.course_hours_ph')) + '"></div>' +
        '<div class="cdx-cursos-f"><label>' + esc(t('cohorts.cursos_apostila_label')) + '</label>' +
          '<select id="cdx-cur-apostila-bind"><option value="">' + esc(t('cohorts.cursos_apostila_none')) + '</option></select></div>' +
        '<div class="cdx-cursos-f cdx-cursos-f-stat"><label>' + esc(t('cohorts.course_reuse_label')) + '</label>' +
          '<div class="cdx-cursos-f-v">' + esc((_courseTurmaCount()) + ' ' + (_courseTurmaCount() === 1 ? t('cohorts.turma_singular') : t('cohorts.turma_plural'))) + '</div></div>' +
      '</div>' +
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
    '</div>';

  _wireMain();
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
      toast.ok(t('cohorts.course_archived'));
      _courses = _courses.filter((x) => x.id !== _course.id);
      _selectedId = null; _course = null; _ementa = emptyEmenta();
      _renderRail();
      if (_courses.length) _selectCourse(_courses[0].id); else _renderMain();
    }).catch((err) => {
      notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
    });
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
    '<div class="cdx-modal" style="max-width:420px">' +
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
      _courses = _courses.filter((x) => x.id !== _course.id);
      _selectedId = null; _course = null; _ementa = emptyEmenta();
      _renderRail();
      if (_courses.length) _selectCourse(_courses[0].id); else _renderMain();
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
    if (!parsed.modules.length) { toast.err(t('cohorts.ementa_paste_empty')); return; }
    const append = bd.querySelector('#cdx-cur-paste-append').checked;
    _ementa = append ? { modules: _ementa.modules.concat(parsed.modules) } : parsed;
    closeModal(bd);
    _rerenderEmenta();
    toast.ok(t('cohorts.ementa_structured'));
  });
}

// ── Public (called by cohorts.js when sub === 'cursos') ─────────────────────────

export function mount(viewEl) {
  _viewEl = viewEl;
  _courses = [];
  _selectedId = null;
  _course = null;
  _ementa = emptyEmenta();
  _aiMsgs = [];
  _apostilas = [];
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
  _aiMsgs = [];
  _apostilas = [];
}
