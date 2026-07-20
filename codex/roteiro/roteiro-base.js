// roteiro/roteiro-base.js
// Aula-side base selector + promote controls for the Roteiro sub-tab (track-46
// fatia 2b/2c). Sits ABOVE the mounted roteiro-view.js two-panel component in
// the same aula pane (cohorts.js wires both into the pane); it is a SEPARATE
// module on purpose, so roteiro-view.js stays the plain reusable two-panel
// component (also reused, store-only-swapped, by cohorts/courses.js for editing
// a curso's own base roteiros) with none of this aula-specific chrome.
//
// Base selector (2b): resolves the curso from turma.course_id, lists its
// numbered base roteiros, and lets the teacher pick one (copy-down into the
// aula's own roteiro_json + roteiro_base_number) or go blank. BINDING RULE: the
// position-matched base (aula N -> base N) is only a highlighted SUGGESTION in
// the dropdown, never applied automatically -- nothing is written until
// "Selecionar" is clicked.
//
// Promover (2c): pushes the aula's CURRENT (already auto-saved, per the view's
// save-per-edit contract) roteiro up to the curso, in one of 3 scopes: este
// ponto (patched into the target base via roteiro-model.js patchPonto), esta
// aula (replaces the target base wholesale) or todas as aulas (every turma aula
// that has a roteiro, pushed to ITS OWN roteiro_base_number if it has one, else
// its aula_number position -- no manual target picking for that scope, matching
// ct_save_course_roteiro's course_id+aula_number UPSERT contract).
//
// Globals (shared Backstage debug pill, routed to via notice.internal): none
// referenced directly here.
import { roteiro as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import { normalizeRoteiro, patchPonto, nextBaseNumber } from '../js/roteiro-model.js';

let _el = null;
let _ctx = null;        // { turma, aula, seed, turmaAulas, onApplied }
let _bases = [];        // curso base roteiros: [{ id, aula_number, roteiro_json }]
let _basesLoaded = false;
let _currentBaseNumber = null; // aula.roteiro_base_number, mirrors _ctx.seed at mount, updated on apply
let _promoteBd = null;  // the open promote modal's backdrop, tracked so unmount can close it

export function mount(el, ctx) {
  _el = el;
  _ctx = ctx || {};
  _bases = [];
  _basesLoaded = false;
  _currentBaseNumber = (_ctx.seed && _ctx.seed.roteiro_base_number != null) ? Number(_ctx.seed.roteiro_base_number) : null;
  _ensureCss();
  _render();
  if (_ctx.turma && _ctx.turma.course_id != null) _loadBases();
  _el.addEventListener('click', _onClick);
  _el.addEventListener('change', _onChange);
}

// Same file/id as roteiro-view.js's own loader (roteiro.css), duplicated on
// purpose: the view stays untouched this fatia (see the header note), and this
// module can mount independently of it, so it owns its own idempotent injection.
function _ensureCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cdx-roteiro-css')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.id = 'cdx-roteiro-css';
  link.href = new URL('./roteiro.css', import.meta.url).href;
  document.head.appendChild(link);
}

export function unmount() {
  if (_promoteBd) { closeModal(_promoteBd); _promoteBd = null; }
  if (_el) {
    _el.removeEventListener('click', _onClick);
    _el.removeEventListener('change', _onChange);
    _el.innerHTML = '';
  }
  _el = null;
  _ctx = null;
  _bases = [];
  _basesLoaded = false;
  _currentBaseNumber = null;
}

function _loadBases() {
  api.listCourseBases({ course_id: _ctx.turma.course_id }).then((d) => {
    _bases = (d && d.roteiros) || [];
    _basesLoaded = true;
    _render();
  }).catch((err) => {
    _basesLoaded = true;
    notice.internal(t('cohorts.error') + ': ' + ((err && err.message) || err));
  });
}

// ── Render ───────────────────────────────────────────────────────────────
function _suggestedNumber() {
  const aula = (_ctx && _ctx.aula) || {};
  return aula.aula_number != null ? Number(aula.aula_number) : null;
}

function _render() {
  if (!_el) return;
  const turma = (_ctx && _ctx.turma) || {};
  if (turma.course_id == null) {
    _el.innerHTML = '<div class="cdx-roteiro-base cdx-roteiro-base-nocourse">' + esc(t('roteiro.base_no_course')) + '</div>';
    return;
  }
  // Re-render rebuilds the whole <details>; keep it open across an apply/promote
  // triggered from inside it, so the panel does not snap shut the moment the
  // teacher who just interacted with it sees the result.
  const wasOpen = !!(_el.querySelector('details') && _el.querySelector('details').open);
  const currentLabel = _currentBaseNumber != null
    ? t('roteiro.base_option').replace('{n}', String(_currentBaseNumber))
    : t('roteiro.base_none');
  _el.innerHTML =
    '<details class="cdx-roteiro-base"' + (wasOpen ? ' open' : '') + '>' +
      '<summary class="cdx-roteiro-base-summary">' +
        '<span>' + esc(t('roteiro.base_label')) + '</span>' +
        '<b class="cdx-roteiro-base-current">' + esc(currentLabel) + '</b>' +
      '</summary>' +
      '<div class="cdx-roteiro-base-body">' +
        (_basesLoaded ? _selectHtml() : '<span class="cdx-roteiro-base-loading">' + esc(t('cohorts.loading')) + '</span>') +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-rb-promote' + (_basesLoaded ? '' : ' disabled') + '>' + esc(t('roteiro.promote_btn')) + '</button>' +
      '</div>' +
    '</details>';
}

function _selectHtml() {
  const suggested = _suggestedNumber();
  const hasSuggested = suggested != null && _bases.some((b) => Number(b.aula_number) === suggested);
  const preselect = _currentBaseNumber != null ? _currentBaseNumber : (hasSuggested ? suggested : null);
  let opts = '<option value=""' + (preselect == null ? ' selected' : '') + '>' + esc(t('roteiro.base_option_blank')) + '</option>';
  opts += _bases.slice().sort((a, b) => Number(a.aula_number) - Number(b.aula_number)).map((b) => {
    const n = Number(b.aula_number);
    const label = t('roteiro.base_option').replace('{n}', String(n)) + (n === suggested && _currentBaseNumber == null ? ' ' + t('roteiro.base_option_suggested') : '');
    return '<option value="' + n + '"' + (preselect === n ? ' selected' : '') + '>' + esc(label) + '</option>';
  }).join('');
  return '<select class="cdx-roteiro-base-select" data-rb-select>' + opts + '</select>' +
    '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-primary" data-rb-apply>' + esc(t('roteiro.base_apply_btn')) + '</button>';
}

// ── Apply (copy-down / blank) ───────────────────────────────────────────────
function _onClick(e) {
  if (e.target.closest('[data-rb-apply]')) { _applySelection(); return; }
  if (e.target.closest('[data-rb-promote]')) { _openPromoteModal(); return; }
}

function _onChange() { /* the select alone never applies anything (BINDING RULE) */ }

function _applySelection() {
  const sel = _el.querySelector('[data-rb-select]');
  if (!sel) return;
  const val = sel.value;
  const aula = _ctx.aula;
  const btn = _el.querySelector('[data-rb-apply]');
  if (btn) btn.disabled = true;
  const targetNumber = val === '' ? null : Number(val);
  const roteiroJson = targetNumber == null
    ? JSON.stringify({ blocos: [] })
    : ((_bases.find((b) => Number(b.aula_number) === targetNumber) || {}).roteiro_json || JSON.stringify({ blocos: [] }));
  api.setAula({ id: aula.id, roteiro_json: roteiroJson, roteiro_base_number: targetNumber }).then(() => {
    _currentBaseNumber = targetNumber;
    toast.ok(t(targetNumber == null ? 'roteiro.base_blank_ok' : 'roteiro.base_apply_ok'));
    _render();
    if (_ctx.onApplied) _ctx.onApplied({ roteiro_json: roteiroJson, roteiro_base_number: targetNumber });
  }).catch((err) => {
    if (btn) btn.disabled = false;
    notice.internal(t('cohorts.error') + ': ' + ((err && err.message) || err));
  });
}

// ── Promote modal ────────────────────────────────────────────────────────────
function _openPromoteModal() {
  const aula = _ctx.aula;
  const html =
    '<div class="cdx-modal cdx-modal--md">' +
      '<div class="cdx-modal-title">' + esc(t('roteiro.promote_title')) + '</div>' +
      '<div class="cdx-roteiro-promote-scopes">' +
        '<label><input type="radio" name="rb-scope" value="ponto" checked> ' + esc(t('roteiro.promote_scope_ponto')) + '</label>' +
        '<label><input type="radio" name="rb-scope" value="aula"> ' + esc(t('roteiro.promote_scope_aula')) + '</label>' +
        '<label><input type="radio" name="rb-scope" value="todas"> ' + esc(t('roteiro.promote_scope_todas')) + '</label>' +
      '</div>' +
      '<div class="cdx-roteiro-promote-field" data-rb-ponto-wrap>' +
        '<label class="cdx-roteiro-field-label">' + esc(t('roteiro.promote_ponto_label')) + '</label>' +
        '<select class="cdx-roteiro-base-select" data-rb-ponto-select><option value="">' + esc(t('cohorts.loading')) + '</option></select>' +
      '</div>' +
      '<div class="cdx-roteiro-promote-field" data-rb-target-wrap>' +
        '<label class="cdx-roteiro-promote-target-opt"><input type="radio" name="rb-target" value="existing" checked> ' + esc(t('roteiro.promote_target_existing')) +
          ' <select class="cdx-roteiro-base-select" data-rb-target-select><option value="">' + esc(t('cohorts.loading')) + '</option></select></label>' +
        '<label class="cdx-roteiro-promote-target-opt"><input type="radio" name="rb-target" value="new"> ' + esc(t('roteiro.promote_target_new')) +
          ' <input type="number" min="1" class="cdx-roteiro-base-numinput" data-rb-target-new value="1"></label>' +
      '</div>' +
      '<div class="cdx-roteiro-promote-hint" data-rb-todas-hint>' + esc(t('roteiro.promote_todas_hint')) + '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-rb-cancel>' + esc(t('cohorts.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" data-rb-confirm>' + esc(t('roteiro.promote_confirm')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  _promoteBd = bd;
  bd.querySelector('[data-rb-cancel]').addEventListener('click', () => { closeModal(bd); _promoteBd = null; });
  bd.querySelectorAll('input[name="rb-scope"]').forEach((r) => r.addEventListener('change', () => _applyPromoteScopeUi(bd)));
  bd.querySelector('[data-rb-confirm]').addEventListener('click', () => _confirmPromote(bd));
  _applyPromoteScopeUi(bd);
  _fillPromotePickers(bd, aula);
}

function _applyPromoteScopeUi(bd) {
  const scope = bd.querySelector('input[name="rb-scope"]:checked').value;
  const pontoWrap = bd.querySelector('[data-rb-ponto-wrap]');
  const targetWrap = bd.querySelector('[data-rb-target-wrap]');
  const todasHint = bd.querySelector('[data-rb-todas-hint]');
  if (pontoWrap) pontoWrap.style.display = scope === 'ponto' ? '' : 'none';
  if (targetWrap) targetWrap.style.display = scope === 'todas' ? 'none' : '';
  if (todasHint) todasHint.style.display = scope === 'todas' ? '' : 'none';
}

// Fresh reads on every open (the aula's roteiro may have just changed, and
// another tab/session may have added a base since this panel last loaded).
function _fillPromotePickers(bd, aula) {
  Promise.all([
    api.getAula({ id: aula.id }),
    api.listCourseBases({ course_id: _ctx.turma.course_id }),
  ]).then(([aulaRes, basesRes]) => {
    if (!_promoteBd || _promoteBd !== bd) return; // closed meanwhile
    const roteiro = normalizeRoteiro(aulaRes && aulaRes.roteiro_json);
    _bases = (basesRes && basesRes.roteiros) || [];
    _basesLoaded = true;
    const pontoSel = bd.querySelector('[data-rb-ponto-select]');
    const options = [];
    roteiro.blocos.forEach((b, bi) => b.pontos.forEach((p, pi) => {
      const label = (b.nome ? b.nome + ' › ' : '') + (p.rotulo || t('roteiro.no_rotulo'));
      options.push('<option value="' + bi + ':' + pi + '">' + esc(label) + '</option>');
    }));
    if (pontoSel) {
      pontoSel.innerHTML = options.length ? options.join('') : '<option value="">' + esc(t('roteiro.promote_ponto_empty')) + '</option>';
      pontoSel.disabled = !options.length;
      const pontoScopeRadio = bd.querySelector('input[name="rb-scope"][value="ponto"]');
      if (pontoScopeRadio) pontoScopeRadio.disabled = !options.length;
    }
    const targetSel = bd.querySelector('[data-rb-target-select]');
    const newInput = bd.querySelector('[data-rb-target-new]');
    if (targetSel) {
      const sorted = _bases.slice().sort((a, c) => Number(a.aula_number) - Number(c.aula_number));
      targetSel.innerHTML = sorted.length
        ? sorted.map((b) => '<option value="' + Number(b.aula_number) + '">' + esc(t('roteiro.base_option').replace('{n}', String(b.aula_number))) + '</option>').join('')
        : '<option value="">' + esc(t('roteiro.promote_ponto_empty')) + '</option>';
      targetSel.disabled = !sorted.length;
      const existingRadio = bd.querySelector('input[name="rb-target"][value="existing"]');
      const newRadio = bd.querySelector('input[name="rb-target"][value="new"]');
      if (!sorted.length && existingRadio && newRadio) { existingRadio.disabled = true; newRadio.checked = true; }
    }
    if (newInput) newInput.value = String(nextBaseNumber(_bases.map((b) => b.aula_number)));
  }).catch((err) => {
    notice.internal(t('cohorts.error') + ': ' + ((err && err.message) || err));
  });
}

function _confirmPromote(bd) {
  const scope = bd.querySelector('input[name="rb-scope"]:checked').value;
  const confirmBtn = bd.querySelector('[data-rb-confirm]');
  if (confirmBtn) confirmBtn.disabled = true;
  const done = (fn) => fn().then(() => {
    toast.ok(t(scope === 'todas' ? 'roteiro.promote_todas_ok' : 'roteiro.promote_ok'));
    closeModal(bd);
    _promoteBd = null;
    _loadBases();
  }).catch((err) => {
    if (confirmBtn) confirmBtn.disabled = false;
    notice.internal(t('cohorts.error') + ': ' + ((err && err.message) || err));
  });

  if (scope === 'todas') { done(() => _promoteTodas()); return; }

  const targetMode = bd.querySelector('input[name="rb-target"]:checked').value;
  const targetNumber = targetMode === 'new'
    ? Number(bd.querySelector('[data-rb-target-new]').value)
    : Number(bd.querySelector('[data-rb-target-select]').value);
  if (!targetNumber || targetNumber < 1) {
    if (confirmBtn) confirmBtn.disabled = false;
    toast.err(t('roteiro.promote_target_invalid'));
    return;
  }
  if (scope === 'ponto') {
    const raw = bd.querySelector('[data-rb-ponto-select]').value;
    if (!raw) { if (confirmBtn) confirmBtn.disabled = false; toast.err(t('roteiro.promote_ponto_empty')); return; }
    const [bi, pi] = raw.split(':').map(Number);
    done(() => _promotePonto(targetNumber, { bi, pi }));
  } else {
    done(() => _promoteAula(targetNumber));
  }
}

function _promoteAula(targetNumber) {
  return api.getAula({ id: _ctx.aula.id }).then((res) => {
    const roteiroJson = (res && res.roteiro_json) || JSON.stringify({ blocos: [] });
    return api.saveCourseBase({ course_id: _ctx.turma.course_id, aula_number: targetNumber, roteiro_json: roteiroJson });
  });
}

function _promotePonto(targetNumber, ref) {
  return api.getAula({ id: _ctx.aula.id }).then((aulaRes) => {
    const source = normalizeRoteiro(aulaRes && aulaRes.roteiro_json);
    const targetRow = _bases.find((b) => Number(b.aula_number) === targetNumber);
    const targetRoteiro = normalizeRoteiro(targetRow && targetRow.roteiro_json);
    const patched = patchPonto(targetRoteiro, source, ref);
    return api.saveCourseBase({ course_id: _ctx.turma.course_id, aula_number: targetNumber, roteiro_json: JSON.stringify(patched) });
  });
}

// "todas": every turma aula that HAS a roteiro pushes to its OWN
// roteiro_base_number (the base it was copied from / already points at) when
// set, else its aula_number position -- no manual target picking for this
// scope (ct_save_course_roteiro upserts on course_id+aula_number either way).
function _promoteTodas() {
  const aulas = (_ctx.turmaAulas || []).filter((a) => a.id != null);
  let chain = Promise.resolve();
  aulas.forEach((a) => {
    chain = chain.then(() => api.getAula({ id: a.id }).then((res) => {
      const r = normalizeRoteiro(res && res.roteiro_json);
      if (!r.blocos.some((b) => b.pontos.length)) return; // blank aula, nothing to push
      const target = (res && res.roteiro_base_number != null) ? Number(res.roteiro_base_number) : Number(a.aula_number);
      return api.saveCourseBase({ course_id: _ctx.turma.course_id, aula_number: target, roteiro_json: res.roteiro_json });
    }));
  });
  return chain;
}
