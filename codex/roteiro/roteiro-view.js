// roteiro/roteiro-view.js
// Codex Cohorts, aula sub-tab "Roteiro" (track-46): the two-panel conduction
// plan for a single aula. LEFT = the standard list-rail (js/list-rail.js) —
// blocos as collapsible sections, pontos as rows, grip-drag to reorder within
// a bloco or move between blocos, header "+" to add a ponto, "+ Nova seção"
// to add a bloco, section head ✎/× to rename/delete a bloco. RIGHT = the full
// editor for the selected ponto (rótulo, tipo, duração, fala de chamada,
// anotações, delete). A time meter reads compat(roteiro, aula.hours) for
// planejado/reserva/estouro, and updates live while a duration is being typed.
// The roteiro carries only order/time/short annotations, never the lesson
// content itself.
//
// track-46 fatia 2.5: replaces the hand-rolled left panel with mountRail
// (Élder: "veja tudo o que tem no módulo de lista que a gente pode aplicar
// aqui" — the left panel was built by hand next to the one standard rail
// module, exactly the duplication ARCHITECTURE.md forbids). buildRailConfig()
// below is a PURE function of (roteiro, state, handlers, gridEl) — the exact
// config handed to mountRail, so the tested contract and the mounted one can
// never diverge (tests/roteiro-rail.test.mjs). All structural edits (add/
// rename/remove/reorder/move bloco or ponto) go through the pure mutators in
// js/roteiro-model.js; this view never mutates a roteiro object in place.
//
// Persistence is fully INJECTED via ctx.store ({ load(aulaId), save(aulaId, r) }):
// this view never knows HOW or WHERE a roteiro is persisted (no browser
// storage, no facade import), so cohorts/courses.js reuses it verbatim for
// editing a curso's base roteiros, just swapping in a different store.
//
// Globals (optional, shared Backstage debug pill): window.bsLog
import {
  normalizeRoteiro, emptyRoteiro, compat, fmtDur, blocoMin, TIPOS,
  addBloco, renameBloco, removeBloco, addPonto, updatePonto, removePonto,
  movePonto, reorderPontos, findPonto, addPausa,
} from '../js/roteiro-model.js';
import { esc as _esc } from '../js/dom.js';
import { mountRail } from '../js/list-rail.js';
import { openModal, closeModal } from '../js/modal.js';
import * as toast from '../js/toast.js';

// ── Pure rail config (tested directly, no DOM) ──────────────────────────────
// roteiro:  a normalized roteiro (any input is coerced defensively).
// state:    { selectedPontoId, isOpen(blocoId)->bool, t(key)->str }.
// handlers: { onSelectPonto, onAddPonto, onCreateBloco, onRenameBloco,
//             onDeleteBloco, onToggleBloco, onReorder, onMoveItem } — every
//           field optional, called only if it is a function.
// gridEl:   the 2-column grid element installResizer resizes; passed through
//           EXPLICIT (never inferred from container.parentNode).
export function buildRailConfig(roteiro, state, handlers, gridEl) {
  const r = normalizeRoteiro(roteiro);
  const st = state || {};
  const selectedPontoId = (st.selectedPontoId != null) ? st.selectedPontoId : null;
  const isOpen = (typeof st.isOpen === 'function') ? st.isOpen : (() => true);
  const t = (typeof st.t === 'function') ? st.t : ((k) => k);
  const h = handlers || {};
  const call = (name, ...args) => { if (typeof h[name] === 'function') return h[name](...args); };

  const items = () => {
    const out = [];
    for (const b of r.blocos) {
      for (const p of b.pontos) out.push(Object.assign({}, p, { blocoId: b.id }));
    }
    return out;
  };
  const blocoById = (id) => r.blocos.find((b) => b.id === String(id));

  return {
    title: t('cohorts.aula_tab_roteiro'),
    items,
    getId: (it) => it.id,
    renderRow: (it) => ({
      main:
        '<span class="cdx-roteiro-dot cdx-roteiro-dot--' + _esc(it.tipo) + '"></span>' +
        '<span class="cdx-roteiro-row-rotulo">' + _esc(it.rotulo || t('roteiro.no_rotulo')) + '</span>' +
        '<span class="cdx-roteiro-row-dur">' + _esc(fmtDur(it.dur)) + '</span>',
    }),
    selectedId: () => selectedPontoId,
    onSelect: (id) => call('onSelectPonto', id),
    emptyText: t('roteiro.empty'),
    add: { label: '+', title: t('roteiro.ponto_new'), onAdd: () => call('onAddPonto') },
    reorder: { onReorder: (ids) => call('onReorder', ids) },
    sections: {
      of: (it) => it.blocoId,
      list: () => r.blocos.map((b) => ({
        id: b.id,
        title: b.pausa ? t('roteiro.tipo_pausa') : (b.nome || t('roteiro.no_rotulo')),
      })),
      editable: true,
      onCreate: () => call('onCreateBloco'),
      onRename: (id) => call('onRenameBloco', id),
      onDelete: (id) => call('onDeleteBloco', id),
      onMoveItem: (itemId, secId, orderedIds) => call('onMoveItem', itemId, secId, orderedIds),
      collapsed: (sec) => !isOpen(sec.id),
      onToggle: (id) => call('onToggleBloco', id),
      // renderHead OWNS the head (list-rail's default ✎/× only render when
      // renderHead is absent), so the summed bloco time (item 7, approved) and
      // the rename/delete buttons are both rendered here, on the SAME
      // data-sec-ren/data-sec-del attributes the module's own click handler
      // already listens for — the rail keeps wiring them, we just draw them.
      renderHead: (sec) => {
        const bloco = blocoById(sec.id) || { pontos: [] };
        return {
          main: '<span class="cdx-roteiro-sec-title">' + _esc(sec.title) + '</span>',
          act:
            '<span class="cdx-roteiro-sec-dur">' + _esc(fmtDur(blocoMin(bloco))) + '</span>' +
            '<button type="button" class="cdx-rail-sec-ren" data-sec-ren="' + _esc(String(sec.id)) + '" title="' + _esc(t('roteiro.bloco_rename')) + '">✎</button>' +
            '<button type="button" class="cdx-rail-sec-del" data-sec-del="' + _esc(String(sec.id)) + '" title="' + _esc(t('roteiro.bloco_delete')) + '">×</button>',
        };
      },
    },
    width: { mode: 'resize', gridEl, storeKey: 'cdx_roteiro_rail_w', defaultPx: 320, min: 240, max: 520 },
    // The rail draws this html as-is (footer has no click seam of its own);
    // the click is caught by this view's own delegated listener (_onClick),
    // same idiom as courses.js's archived-footer actions outside .cdx-rail-*.
    footer: () => '<button type="button" class="cdx-btn cdx-btn-sm cdx-roteiro-add-pausa" data-roteiro-add-pausa>' + _esc(t('roteiro.add_pausa')) + '</button>',
  };
}

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _ctx = null;           // { store, aula, t }
let _roteiro = null;       // in-memory normalized roteiro; every edit REPLACES it (mutators are pure)
let _selectedPontoId = null;
let _closedBlocos = null;  // Set of bloco ids currently collapsed; absence = open
let _gridEl = null;        // the .cdx-roteiro-body grid element (installResizer target)
let _rail = null;          // mountRail() instance for the left panel
let _persistTimer = null;  // debounce for typed fields (see _persistSoon)

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _ctx = ctx || {};
  _roteiro = _load();
  _selectedPontoId = _firstPontoId(_roteiro);
  _closedBlocos = new Set();
  _ensureCss();
  _renderShell();
  _gridEl = _viewEl.querySelector('.cdx-roteiro-body');
  _mountRailOnce();
  _renderRight();
  _renderMeter();
  viewEl.addEventListener('click', _onClick);
  viewEl.addEventListener('change', _onChange);
  viewEl.addEventListener('input', _onInput);
  viewEl.addEventListener('keydown', _onKeydown);
}

export function unmount() {
  _flushPersist();   // a keystroke still inside the debounce window must not be lost
  if (_rail) { try { _rail.destroy(); } catch (e) { _logErr(e); } _rail = null; }
  if (_viewEl) {
    _viewEl.removeEventListener('click', _onClick);
    _viewEl.removeEventListener('change', _onChange);
    _viewEl.removeEventListener('input', _onInput);
    _viewEl.removeEventListener('keydown', _onKeydown);
    _viewEl.innerHTML = '';
  }
  _viewEl = null;
  _ctx = null;
  _roteiro = null;
  _selectedPontoId = null;
  _closedBlocos = null;
  _gridEl = null;
}

// ── Store seam (load/save only; no persistence detail leaks past here) ──────
function _load() {
  const aula = (_ctx && _ctx.aula) || {};
  if (_ctx && _ctx.store && typeof _ctx.store.load === 'function') {
    try { return normalizeRoteiro(_ctx.store.load(aula.id)); } catch (e) { _logErr(e); }
  }
  return emptyRoteiro();
}

function _persist() {
  _cancelPersist();
  if (!_ctx || !_ctx.store || typeof _ctx.store.save !== 'function') return;
  const aula = _ctx.aula || {};
  try { _ctx.store.save(aula.id, _roteiro); } catch (e) { _logErr(e); }
}

// Typed fields apply to the model on every keystroke (see _applyField / the
// lost-click note there) but must NOT hit the backend per character. The timer
// is flushed on blur, on any structural edit, and on unmount — so switching
// aula or tab can never drop an edit that was still in the debounce window.
const _PERSIST_MS = 500;
function _persistSoon() {
  _cancelPersist();
  _persistTimer = setTimeout(() => { _persistTimer = null; _persist(); }, _PERSIST_MS);
}
function _cancelPersist() {
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
}
function _flushPersist() { if (_persistTimer) _persist(); }

function _logErr(e) {
  const msg = 'codex: roteiro view failed: ' + ((e && e.message) || e);
  if (typeof window !== 'undefined' && typeof window.bsLog === 'function') window.bsLog(msg, 'error');
}

function _tf() { return (_ctx && typeof _ctx.t === 'function') ? _ctx.t : ((k) => k); }

// Style is injected here (not <link>ed in index.html — the shell HTML stays
// out of scope). Idempotent by id, so remounting never duplicates it.
function _ensureCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cdx-roteiro-css')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.id = 'cdx-roteiro-css';
  link.href = new URL('./roteiro.css', import.meta.url).href;
  document.head.appendChild(link);
}

function _firstPontoId(r) {
  for (const b of r.blocos) { if (b.pontos.length) return b.pontos[0].id; }
  return null;
}

// ── Shell: built ONCE at mount; the rail + the two content slots are updated
// independently afterwards (a full innerHTML replace on every edit would tear
// down and remount the rail, losing its drag/resizer wiring and scroll). ────
function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-roteiro">' +
      '<div id="cdx-roteiro-meter-slot"></div>' +
      '<div class="cdx-roteiro-body">' +
        '<div class="cdx-roteiro-left" id="cdx-roteiro-rail"></div>' +
        '<div class="cdx-roteiro-right" id="cdx-roteiro-right"></div>' +
      '</div>' +
    '</div>';
}

// The live config, freshly derived from current module state on every call —
// the SAME buildRailConfig the tests pin, never a hand-rolled equivalent.
function _liveCfg() {
  return buildRailConfig(_roteiro, {
    selectedPontoId: _selectedPontoId,
    isOpen: (id) => !_closedBlocos.has(id),
    t: _tf(),
  }, _handlers, _gridEl);
}

// mountRail() itself only reads its config ONCE at construction, so every
// field below is a thin, STABLE indirection into _liveCfg() — the identity
// mountRail captures never changes, but each call re-derives fresh data from
// the current _roteiro/_selectedPontoId/_closedBlocos. This is what lets the
// rail be mounted once (keeping its resizer + drag wiring across edits) while
// still never building the config by hand.
function _mountRailOnce() {
  const el = _viewEl.querySelector('#cdx-roteiro-rail');
  if (!el) return;
  _rail = mountRail(el, {
    title: _liveCfg().title,
    items: () => _liveCfg().items(),
    getId: (it) => _liveCfg().getId(it),
    renderRow: (it) => _liveCfg().renderRow(it),
    selectedId: () => _liveCfg().selectedId(),
    onSelect: (id) => _liveCfg().onSelect(id),
    emptyText: () => _liveCfg().emptyText,
    add: {
      label: '+',
      title: _liveCfg().add.title,
      onAdd: () => _liveCfg().add.onAdd(),
    },
    reorder: { onReorder: (ids) => _liveCfg().reorder.onReorder(ids) },
    sections: {
      of: (it) => _liveCfg().sections.of(it),
      list: () => _liveCfg().sections.list(),
      editable: true,
      onCreate: () => _liveCfg().sections.onCreate(),
      onRename: (id) => _liveCfg().sections.onRename(id),
      onDelete: (id) => _liveCfg().sections.onDelete(id),
      onMoveItem: (a, b, c) => _liveCfg().sections.onMoveItem(a, b, c),
      collapsed: (sec) => _liveCfg().sections.collapsed(sec),
      onToggle: (id) => _liveCfg().sections.onToggle(id),
      renderHead: (sec, count) => _liveCfg().sections.renderHead(sec, count),
    },
    width: _liveCfg().width,
    footer: () => _liveCfg().footer(),
  });
  _rail.render();
}

// ── Handlers (the view's actual behaviour; buildRailConfig only forwards to these) ──
const _handlers = {
  onSelectPonto: (id) => { _selectedPontoId = id; if (_rail) _rail.render(); _renderRight(); },
  onAddPonto: () => _onAddPonto(),
  onCreateBloco: () => _onCreateBloco(),
  onRenameBloco: (id) => _onRenameBloco(id),
  onDeleteBloco: (id) => _onDeleteBloco(id),
  onToggleBloco: (id) => {
    if (_closedBlocos.has(id)) _closedBlocos.delete(id); else _closedBlocos.add(id);
    if (_rail) _rail.render();
  },
  onReorder: (orderedIds) => {
    if (!orderedIds || !orderedIds.length) return;
    const hit = findPonto(_roteiro, orderedIds[0]);
    if (!hit) return;
    _commit(reorderPontos(_roteiro, hit.bloco.id, orderedIds));
  },
  onMoveItem: (itemId, secId, orderedIds) => { _commit(movePonto(_roteiro, itemId, secId, orderedIds)); },
  onAddPausa: () => { _commit(addPausa(_roteiro, { dur: 10 })); },
};

// Applies a mutator's result: reassigns _roteiro (mutators are pure, never
// mutate in place), keeps the selection valid, persists, and repaints the
// rail + right panel + meter. The one place every structural edit funnels
// through, so those three stay in sync by construction.
function _commit(newRoteiro) {
  _roteiro = newRoteiro;
  if (_selectedPontoId != null && !findPonto(_roteiro, _selectedPontoId)) {
    _selectedPontoId = _firstPontoId(_roteiro);
  }
  _persist();
  if (_rail) _rail.render();
  _renderRight();
  _renderMeter();
}

function _onAddPonto() {
  let r = _roteiro;
  if (!r.blocos.length) r = addBloco(r, {});
  const blocoId = r.blocos[r.blocos.length - 1].id;
  const out = addPonto(r, blocoId, {});
  const bloco = out.blocos.find((b) => b.id === blocoId);
  const newPonto = bloco && bloco.pontos[bloco.pontos.length - 1];
  if (newPonto) _selectedPontoId = newPonto.id;
  _commit(out);
}

function _onCreateBloco() {
  _openBlocoModal(_tf()('roteiro.bloco_new'), '', (name) => {
    _commit(addBloco(_roteiro, { nome: name }));
  });
}

function _onRenameBloco(id) {
  const bloco = _roteiro.blocos.find((b) => b.id === id);
  _openBlocoModal(_tf()('roteiro.bloco_rename'), (bloco && bloco.nome) || '', (name) => {
    _commit(renameBloco(_roteiro, id, name));
  });
}

function _onDeleteBloco(id) {
  const t = _tf();
  const html =
    '<div class="cdx-modal cdx-modal--sm">' +
      '<div class="cdx-modal-title">' + _esc(t('roteiro.bloco_delete')) + '</div>' +
      '<p style="margin:0 0 1.2rem;font-size:.88rem;color:var(--text-secondary)">' + _esc(t('roteiro.bloco_delete_msg')) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-roteiro-blocodel-cancel>' + _esc(t('cohorts.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" data-roteiro-blocodel-ok>' + _esc(t('roteiro.bloco_delete')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('[data-roteiro-blocodel-cancel]').addEventListener('click', () => closeModal(bd));
  bd.querySelector('[data-roteiro-blocodel-ok]').addEventListener('click', () => {
    closeModal(bd);
    _commit(removeBloco(_roteiro, id));
  });
}

// Shared name-input modal for bloco create/rename (mirrors cohorts/courses.js
// _openSectionNameModal, the existing idiom for this exact shape).
function _openBlocoModal(titleText, initial, onOk) {
  const t = _tf();
  const html =
    '<div class="cdx-modal cdx-modal--sm">' +
      '<div class="cdx-modal-title">' + _esc(titleText) + '</div>' +
      '<input class="cdx-doss-edit" data-roteiro-bloco-name type="text" value="' + _esc(initial || '') + '" placeholder="' + _esc(t('roteiro.bloco_name_ph')) + '" style="width:100%;margin:.2rem 0 1.2rem">' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" data-roteiro-blocomodal-cancel>' + _esc(t('cohorts.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" data-roteiro-blocomodal-ok>' + _esc(t('cohorts.save')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  const input = bd.querySelector('[data-roteiro-bloco-name]');
  if (input) setTimeout(() => { input.focus(); input.select(); }, 0);
  const submit = () => {
    const v = (input && input.value || '').trim();
    if (!v) { toast.err(t('roteiro.bloco_name_required')); return; }
    closeModal(bd);
    onOk(v);
  };
  bd.querySelector('[data-roteiro-blocomodal-cancel]').addEventListener('click', () => closeModal(bd));
  bd.querySelector('[data-roteiro-blocomodal-ok]').addEventListener('click', submit);
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
}

// ── Meter (compat(roteiro, aula.hours)) ─────────────────────────────────────
// Always reads the live _roteiro: typed durations are already applied to the
// model by _applyField on every keystroke, so the bar reacts without needing a
// separate what-if copy.
function _renderMeter() {
  const slot = _viewEl && _viewEl.querySelector('#cdx-roteiro-meter-slot');
  if (!slot) return;
  const t = _tf();
  const aula = (_ctx && _ctx.aula) || {};
  slot.innerHTML = _meterHtml(t, aula, _roteiro);
}

function _meterHtml(t, aula, roteiro) {
  const c = compat(roteiro, aula.hours);
  const capMin = (Number(aula.hours) || 0) * 60;
  const pct = capMin > 0 ? Math.min(100, Math.round((c.planejadoMin / capMin) * 100)) : (c.planejadoMin > 0 ? 100 : 0);
  return '<div class="cdx-roteiro-meter' + (c.estouro ? ' is-over' : '') + '">' +
    '<div class="cdx-roteiro-meter-track"><div class="cdx-roteiro-meter-fill" style="width:' + pct + '%"></div></div>' +
    '<div class="cdx-roteiro-meter-text">' +
      '<span class="cdx-roteiro-meter-item"><b>' + _esc(t('roteiro.meter_planned')) + ':</b> ' + _esc(fmtDur(c.planejadoMin)) + '</span>' +
      '<span class="cdx-roteiro-meter-item"><b>' + _esc(t('roteiro.meter_reserve')) + ':</b> ' + _esc(fmtDur(c.reservaMin)) + '</span>' +
      (c.estouro ? '<span class="cdx-roteiro-meter-warn">' + _esc(t('roteiro.meter_overflow')) + '</span>' : '') +
    '</div>' +
  '</div>';
}

// ── Right panel: the full ponto editor ──────────────────────────────────────
function _renderRight() {
  const slot = _viewEl && _viewEl.querySelector('#cdx-roteiro-right');
  if (!slot) return;
  slot.innerHTML = _rightHtml();
}

function _rightHtml() {
  const t = _tf();
  const hit = _selectedPontoId ? findPonto(_roteiro, _selectedPontoId) : null;
  const p = hit ? hit.ponto : null;
  if (!p) return '<div class="cdx-roteiro-empty">' + _esc(t('roteiro.select_ponto_prompt')) + '</div>';
  return '<div class="cdx-roteiro-detail">' +
    '<div class="cdx-roteiro-detail-head">' +
      '<span class="cdx-roteiro-detail-badge cdx-roteiro-dot--' + _esc(p.tipo) + '">' + _esc(t('roteiro.tipo_' + p.tipo)) + '</span>' +
      '<span class="cdx-roteiro-sp"></span>' +
      '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-danger" data-roteiro-del-ponto>' + _esc(t('roteiro.ponto_delete')) + '</button>' +
    '</div>' +
    '<div class="cdx-roteiro-field">' +
      '<label class="cdx-roteiro-field-label">' + _esc(t('roteiro.field_rotulo')) + '</label>' +
      '<input type="text" class="cdx-roteiro-field-input" data-roteiro-rotulo value="' + _esc(p.rotulo || '') + '">' +
    '</div>' +
    '<div class="cdx-roteiro-field-row">' +
      '<div class="cdx-roteiro-field">' +
        '<label class="cdx-roteiro-field-label">' + _esc(t('roteiro.field_tipo')) + '</label>' +
        '<select class="cdx-roteiro-field-input" data-roteiro-tipo>' +
          TIPOS.map((tp) => '<option value="' + _esc(tp) + '"' + (tp === p.tipo ? ' selected' : '') + '>' + _esc(t('roteiro.tipo_' + tp)) + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<div class="cdx-roteiro-field">' +
        '<label class="cdx-roteiro-field-label">' + _esc(t('roteiro.field_dur')) + '</label>' +
        '<input type="number" min="0" step="1" class="cdx-roteiro-field-input" data-roteiro-dur value="' + _esc(String(p.dur)) + '">' +
      '</div>' +
    '</div>' +
    '<div class="cdx-roteiro-field">' +
      '<label class="cdx-roteiro-field-label">' + _esc(t('roteiro.field_chamada')) + '</label>' +
      '<textarea class="cdx-roteiro-field-input cdx-roteiro-field-textarea" data-roteiro-chamada rows="3" placeholder="' + _esc(t('roteiro.field_chamada_placeholder')) + '">' + _esc(p.chamada || '') + '</textarea>' +
    '</div>' +
    '<div class="cdx-roteiro-field">' +
      '<label class="cdx-roteiro-field-label">' + _esc(t('roteiro.field_notas')) + '</label>' +
      '<div class="cdx-roteiro-notas-list">' +
        (p.notas.length ? p.notas.map((n, ni) => _notaRowHtml(t, n, ni)).join('') : '<div class="cdx-roteiro-notas-empty">' + _esc(t('roteiro.notas_empty')) + '</div>') +
      '</div>' +
      '<div class="cdx-roteiro-notas-add">' +
        '<input type="text" class="cdx-roteiro-notas-add-input" data-roteiro-nota-input placeholder="' + _esc(t('roteiro.notas_add_placeholder')) + '">' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-roteiro-nota-add>' + _esc(t('roteiro.notas_add_btn')) + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function _notaRowHtml(t, n, ni) {
  return '<div class="cdx-roteiro-nota">' +
    '<span class="cdx-roteiro-nota-text">' + _esc(n) + '</span>' +
    '<button type="button" class="cdx-roteiro-nota-rm" data-roteiro-nota-rm data-ni="' + ni + '" title="' + _esc(t('roteiro.nota_remove_title')) + '" aria-label="' + _esc(t('roteiro.nota_remove_title')) + '">×</button>' +
  '</div>';
}

// ── Wiring (single delegated listener per event type on the outer viewEl —
// catches both the rail's un-handled clicks bubbling up, e.g. the footer's
// pausa button, and the right panel's own controls). ────────────────────────
function _onClick(e) {
  const addPausaBtn = e.target.closest && e.target.closest('[data-roteiro-add-pausa]');
  if (addPausaBtn) { _handlers.onAddPausa(); return; }
  const delPonto = e.target.closest && e.target.closest('[data-roteiro-del-ponto]');
  if (delPonto) { if (_selectedPontoId) _commit(removePonto(_roteiro, _selectedPontoId)); return; }
  const notaRm = e.target.closest && e.target.closest('[data-roteiro-nota-rm]');
  if (notaRm) { _onNotaRemove(Number(notaRm.dataset.ni)); return; }
  const notaAdd = e.target.closest && e.target.closest('[data-roteiro-nota-add]');
  if (notaAdd) { _onNotaAdd(); return; }
}

// Applies an edit made by TYPING. Deliberately never calls _renderRight(): the
// field being typed in lives there, and rebuilding it would destroy the focused
// element mid-edit. `rail` is false for fields the left rail does not display
// (chamada), so a call-out line costs no repaint at all.
//
// Why typed fields commit on 'input' and not on blur: committing on blur meant
// clicking a ponto row while an input was focused fired change -> _commit ->
// _rail.render(), which replaced the row's DOM BETWEEN mousedown and mouseup.
// The click then had no live target and the selection was silently swallowed —
// so "edit the rótulo, then click the next ponto" needed two clicks. Applying
// on input means blur has nothing left to change, and the click lands.
function _applyField(newRoteiro, opts) {
  _roteiro = newRoteiro;
  if (!opts || opts.rail !== false) { if (_rail) _rail.render(); _renderMeter(); }
  _persistSoon();
}

function _onChange(e) {
  if (!_selectedPontoId) return;
  // tipo is the one field that must repaint the right panel (the badge above it
  // reads the tipo), and a <select> commits on pick, never mid-keystroke.
  const tipo = e.target.closest && e.target.closest('[data-roteiro-tipo]');
  if (tipo) { _commit(updatePonto(_roteiro, _selectedPontoId, { tipo: String(tipo.value || '') })); return; }
  // Everything else was already applied on 'input'; blur just settles the debounce.
  const typed = e.target.closest && e.target.closest('[data-roteiro-rotulo], [data-roteiro-dur], [data-roteiro-chamada]');
  if (typed) _flushPersist();
}

function _onInput(e) {
  if (!_selectedPontoId) return;
  const rotulo = e.target.closest && e.target.closest('[data-roteiro-rotulo]');
  if (rotulo) { _applyField(updatePonto(_roteiro, _selectedPontoId, { rotulo: String(rotulo.value || '') })); return; }
  // Live meter (item 7, approved): the compat bar reacts as the duration is typed.
  const dur = e.target.closest && e.target.closest('[data-roteiro-dur]');
  if (dur) { _applyField(updatePonto(_roteiro, _selectedPontoId, { dur: Number(dur.value) || 0 })); return; }
  const chamada = e.target.closest && e.target.closest('[data-roteiro-chamada]');
  if (chamada) _applyField(updatePonto(_roteiro, _selectedPontoId, { chamada: String(chamada.value || '') }), { rail: false });
}

function _onKeydown(e) {
  if (e.key !== 'Enter') return;
  const notaInput = e.target.closest && e.target.closest('[data-roteiro-nota-input]');
  if (notaInput) { e.preventDefault(); _onNotaAdd(); return; }
  const rotulo = e.target.closest && e.target.closest('[data-roteiro-rotulo]');
  if (rotulo) { rotulo.blur(); return; } // Enter blurs -> the 'change' handler above persists it
  const dur = e.target.closest && e.target.closest('[data-roteiro-dur]');
  if (dur) { dur.blur(); }
  // The chamada TEXTAREA deliberately gets no Enter handling: Enter must
  // insert a newline there, never submit (roteiro-rail.test.mjs pins the
  // textarea specifically because an <input> could never wrap a call-out line).
}

function _onNotaAdd() {
  if (!_selectedPontoId || !_viewEl) return;
  const input = _viewEl.querySelector('[data-roteiro-nota-input]');
  const val = input ? String(input.value || '').trim() : '';
  if (!val) return;
  const hit = findPonto(_roteiro, _selectedPontoId);
  if (!hit) return;
  _commit(updatePonto(_roteiro, _selectedPontoId, { notas: hit.ponto.notas.concat([val]) }));
}

function _onNotaRemove(ni) {
  if (!_selectedPontoId) return;
  const hit = findPonto(_roteiro, _selectedPontoId);
  if (!hit || hit.ponto.notas[ni] === undefined) return;
  const notas = hit.ponto.notas.slice();
  notas.splice(ni, 1);
  _commit(updatePonto(_roteiro, _selectedPontoId, { notas }));
}
