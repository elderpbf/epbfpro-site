// js/list-rail.js
// The ONE standard left-panel rail for Codex. Full contract: manifest/architecture/
// list-rail.md. Renders any left list with a FIXED layout; each consumer enables only the
// capabilities it needs via config (select/add/reorder/sections/filter/width). The module
// NEVER talks to the Worker — it calls back into the consumer (backend seam stays in
// codex-api.js, ARCHITECTURE §3).
//
// Reorder uses POINTER EVENTS (pointerdown/move/up) with the grip as the drag handle, so it
// works on touch AND mouse — the grip is a real handle on mobile too (unlike the HTML5-DnD
// js/reorder.js, which is desktop-only and still serves the not-yet-migrated rails; see
// architecture/list-rail.md §8).
//
//   const rail = mountRail(containerEl, {
//     title, items:()=>[...], getId:(it)=>it.id, renderRow:(it)=>({main, act}),
//     rowClass:(it)=>'extra classes',   // per-row state the consumer's CSS keys off
//     selectedId:()=>id, onSelect:(id)=>{},
//     emptyText: str|()=>str, emptyHtml:()=>html,   // whole list empty (Html wins; rich states)
//     add:{label,title,onAdd}, reorder:{onReorder:(ids)=>{}, gated:false, canDrag:(row)=>true},
//     sections:{of:(it)=>secId, list:()=>[{id,title}], editable, onCreate,onRename,onDelete,
//               onMoveItem:(itemId,secId,orderedIds)=>{},
//               exclusive, openId:()=>secId, onToggle:(secId)=>{}, collapsed:(sec)=>bool,
//               renderHead:(sec,count)=>({main,act}), emptyText},
//     bands:{of:(sec)=>bandId, list:()=>[{id,title}]},   // OUTER level: band > section > row
//     filter:{chips:[{key,label,count}], active:()=>key, onFilter:(key)=>{}},
//     width:{mode:'resize', gridEl, storeKey, defaultPx, min, max}
//         | {mode:'autohide', layoutEl, openClass, revealZone, hideDelay, pinned},
//     footer:()=>html,
//   });
//   rail.render();   // idempotent, after loads/mutations
//   rail.pin(bool);  // width:autohide only — pin(true)=pinned+open, pin(false)=unpinned+close
//   rail.destroy();  // on unmount
import { esc } from './dom.js';
import { installResizer } from './resizable.js';

const GRIP = '⠿'; // ⠿ drag-handle glyph
const DRAG_THRESHOLD = 4; // px before a press becomes a drag (lets a tap still select)

export function mountRail(container, cfg) {
  cfg = cfg || {};
  const getId = cfg.getId || ((it) => it.id);
  const readItems = () => (typeof cfg.items === 'function' ? cfg.items() : (cfg.items || []));
  const sections = cfg.sections || null;
  const bands = (cfg.bands && sections) ? cfg.bands : null;   // bands group SECTIONS; meaningless without them
  const reorder = cfg.reorder || null;
  const filter = cfg.filter || null;
  const add = cfg.add || null;

  let resizerDestroy = null;
  let drag = null;       // active pointer-drag state
  let wired = false;     // delegated listeners attached once (survive re-renders)
  let destroyed = false;

  // ── width:autohide state (the ONE hover-reveal rail; was hand-rolled twice) ──
  // Was copied by hand in cohorts.js (CLIENTES) and questions/sessions.js, byte-for-byte
  // apart from one line — same 6px zone, 1500ms delay, cdx-sm--open class, Escape, and
  // "starts pinned until the first pick". Both copies now come from here.
  const AH_REVEAL_ZONE = 6;    // px from the left edge that triggers the reveal
  const AH_HIDE_DELAY = 1500;  // ms after the cursor leaves the rail before it hides
  let ahWired = false;
  let ahPinned = false;
  let ahOver = false;
  let ahTimer = null;
  let ahOff = null;      // teardown for the autohide listeners

  // ── markup ────────────────────────────────────────────────────────────────
  function rowHtml(it) {
    const id = getId(it);
    const on = cfg.selectedId && String(cfg.selectedId()) === String(id);
    const rc = cfg.renderRow ? cfg.renderRow(it) : { main: esc(String(id)) };
    const grip = (reorder && !reorder.gated)
      ? '<span class="cdx-rail-grip" aria-hidden="true" title="' + esc(cfg.dragHint || 'Arrastar para reordenar') + '">' + GRIP + '</span>'
      : '';
    // rowClass(it): extra classes on the row ELEMENT, for state the consumer's own CSS keys
    // off and that renderRow's inner html cannot express — Clientes paints each turma's phase
    // as the row's left border (via a --ph custom property set by a cdx-ph-* class) and dims
    // archived ones, both of which have to sit on the row itself.
    const extra = cfg.rowClass ? String(cfg.rowClass(it) || '').trim() : '';
    return '<div class="cdx-rail-row' + (on ? ' is-on' : '') + (extra ? ' ' + extra : '') + '" data-id="' + esc(String(id)) + '">' +
      grip +
      '<div class="cdx-rail-main">' + (rc.main || '') + '</div>' +
      (rc.act ? '<div class="cdx-rail-act">' + rc.act + '</div>' : '') +
    '</div>';
  }

  // A section head. `sections.renderHead(sec, count) -> {main, act}` lets a consumer own the
  // head's guts (Clientes needs an avatar there) while the module keeps the caret, the row
  // shell and the toggle wiring. Default = the plain title + count.
  function sectionHeadInner(sec, count) {
    const rh = sections.renderHead ? sections.renderHead(sec, count) : null;
    if (rh) {
      return '<span class="cdx-rail-sec-title">' + (rh.main || '') + '</span>' +
        (rh.act ? '<span class="cdx-rail-sec-acts">' + rh.act + '</span>' : '');
    }
    return '<span class="cdx-rail-sec-title">' + esc(sec.title || '') + '</span>' +
      '<span class="cdx-rail-sec-count">' + count + '</span>' +
      (sections.editable ? '<span class="cdx-rail-sec-acts"><button type="button" class="cdx-rail-sec-ren" data-sec-ren="' + esc(String(sec.id)) + '" title="Renomear">✎</button><button type="button" class="cdx-rail-sec-del" data-sec-del="' + esc(String(sec.id)) + '" title="Excluir">×</button></span>' : '');
  }

  // `sections.exclusive` = accordion: at most ONE section open, and the open one is the
  // CONSUMER's state (`sections.openId()`), not a CSS class the module toggles behind its
  // back — Clientes already tracks `_expandedClient` and re-renders from it, so the module
  // must not hold a second copy of that truth.
  function sectionHtml(sec, rows) {
    const open = sections.exclusive
      ? (sections.openId && String(sections.openId()) === String(sec.id))
      : !(sections.collapsed && sections.collapsed(sec));
    return '<div class="cdx-rail-sec' + (open ? ' is-open' : ' is-collapsed') + '" data-sec="' + esc(String(sec.id)) + '">' +
      '<div class="cdx-rail-sec-h" data-sec-toggle="' + esc(String(sec.id)) + '">' +
        '<span class="cdx-rail-sec-caret" aria-hidden="true">▸</span>' +
        sectionHeadInner(sec, rows.length) +
      '</div>' +
      // `sections.emptyText` fills a section that has no rows (Clientes: a client with no
      // turmas yet). It goes INSIDE .cdx-rail-seclist so the section stays a drop container.
      '<div class="cdx-rail-seclist" data-seclist="' + esc(String(sec.id)) + '">' +
        (rows.length || !sections.emptyText
          ? rows.join('')
          : '<div class="cdx-rail-secempty">' + esc(sections.emptyText) + '</div>') +
      '</div>' +
    '</div>';
  }

  // An outer band groups SECTIONS (two levels: band > section > row). Clientes is the first
  // consumer: status band (ativos/futuros/inativos) > client group > turma rows. A band is a
  // plain divider, never collapsible and never a drop target — the drag contract stays on
  // .cdx-rail-seclist, so reorder is unaffected by nesting.
  function bandHtml(band, secsHtml) {
    return '<div class="cdx-rail-band" data-band="' + esc(String(band.id)) + '">' +
      '<div class="cdx-rail-band-h">' + esc(band.title || '') + '</div>' +
      secsHtml.join('') +
    '</div>';
  }

  function bodyHtml() {
    const its = readItems();
    // grouped: one .cdx-rail-seclist per section (each is a drop container for cross-section
    // drag), in the section list's order; items whose section is missing fall into a null bucket.
    const list = sections
      ? (typeof sections.list === 'function' ? sections.list() : (sections.list || [])).slice()
      : [];
    // "No items" is only "empty" when there are no sections either: with sections, the heads
    // ARE content (Clientes with clients but no turmas yet must still list the clients, each
    // showing its own empty text — not one "no clients" line over a screen that has clients).
    if (!its.length && !list.length) {
      // emptyHtml: a RICH empty state owned by the consumer (Sessões has an icon over a line),
      // same seam as renderRow/renderHead/footer. emptyText stays the escaped-text default.
      if (cfg.emptyHtml) return cfg.emptyHtml();
      const et = (typeof cfg.emptyText === 'function') ? cfg.emptyText() : (cfg.emptyText || '');
      return '<div class="cdx-rail-empty">' + esc(et) + '</div>';
    }
    if (!sections) {
      return '<div class="cdx-rail-list" data-seclist="__flat">' + its.map(rowHtml).join('') + '</div>';
    }
    const byId = new Map(list.map((s) => [String(s.id), s]));
    const groups = new Map(list.map((s) => [String(s.id), []]));
    const loose = [];
    its.forEach((it) => {
      const sid = sections.of ? sections.of(it) : null;
      if (sid != null && groups.has(String(sid))) groups.get(String(sid)).push(rowHtml(it));
      else loose.push(rowHtml(it));
    });
    let html = '';
    if (loose.length) html += '<div class="cdx-rail-seclist" data-seclist="__none">' + loose.join('') + '</div>';
    const secHtmlFor = (s) => sectionHtml(s, groups.get(String(s.id)) || []);
    if (bands) {
      // Two levels. A band with no sections is skipped (Clientes hides an empty status band),
      // and a section whose band is unknown falls through to the bandless tail below.
      const bandList = (typeof bands.list === 'function' ? bands.list() : (bands.list || [])).slice();
      const seen = new Set();
      bandList.forEach((b) => {
        const secs = list.filter((s) => String(bands.of(s)) === String(b.id));
        secs.forEach((s) => seen.add(String(s.id)));
        if (!secs.length) return;
        html += bandHtml(b, secs.map(secHtmlFor));
      });
      list.filter((s) => !seen.has(String(s.id))).forEach((s) => { html += secHtmlFor(s); });
    } else {
      list.forEach((s) => { html += secHtmlFor(s); });
    }
    if (sections.editable) {
      html += '<button type="button" class="cdx-rail-newsec" data-newsec>' + esc(cfg.newSectionLabel || '+ Nova seção') + '</button>';
    }
    return html;
  }

  function headHtml() {
    const addBtn = add
      ? '<button type="button" class="cdx-rail-add cdx-btn cdx-btn-sm" data-rail-add title="' + esc(add.title || add.label || '') + '" aria-label="' + esc(add.title || add.label || '') + '">' + esc(add.label || '+') + '</button>'
      : '';
    let filters = '';
    if (filter && filter.chips && filter.chips.length) {
      const active = filter.active ? filter.active() : null;
      filters = '<div class="cdx-rail-filters">' + filter.chips.map((c) =>
        '<button type="button" class="cdx-rail-chip' + (String(active) === String(c.key) ? ' is-on' : '') + '" data-rail-filter="' + esc(String(c.key)) + '">' +
          esc(c.label) + (c.count != null ? ' <span class="cdx-rail-chip-n">' + c.count + '</span>' : '') +
        '</button>'
      ).join('') + '</div>';
    }
    // Skip the head bar entirely when there is nothing to put in it (no title, no add) —
    // an empty bordered bar (e.g. labs, which has its own page head) would just be noise.
    const head = (cfg.title || add)
      ? '<div class="cdx-rail-head"><span class="cdx-rail-title">' + esc(cfg.title || '') + '</span>' + addBtn + '</div>'
      : '';
    return head + filters;
  }

  function render() {
    if (destroyed) return;
    // A full innerHTML replace tears down and recreates .cdx-rail-body, so the
    // browser forgets its scroll offset on every render() -- jarring for a long
    // list (e.g. labs) when render() runs on every selection. Carry it over.
    const prevBody = container.querySelector('.cdx-rail-body');
    const prevScroll = prevBody ? prevBody.scrollTop : 0;
    container.innerHTML =
      '<div class="cdx-rail">' +
        headHtml() +
        '<div class="cdx-rail-body">' + bodyHtml() + '</div>' +
        (cfg.footer ? '<div class="cdx-rail-foot">' + cfg.footer() + '</div>' : '') +
      '</div>';
    if (!wired) { wire(); wired = true; }
    ensureResizer();
    ensureAutohide();
    const newBody = container.querySelector('.cdx-rail-body');
    if (newBody) newBody.scrollTop = prevScroll;
  }

  // ── events (delegated on the container; survive innerHTML re-renders) ─────────
  function onClick(e) {
    if (e.target.closest('.cdx-rail-grip')) return; // grip is drag-only
    const addBtn = e.target.closest('[data-rail-add]');
    if (addBtn) { if (add && add.onAdd) add.onAdd(); return; }
    const chip = e.target.closest('[data-rail-filter]');
    if (chip) { if (filter && filter.onFilter) filter.onFilter(chip.getAttribute('data-rail-filter')); return; }
    if (sections) {
      const ren = e.target.closest('[data-sec-ren]');
      if (ren) { if (sections.onRename) sections.onRename(ren.getAttribute('data-sec-ren')); return; }
      const del = e.target.closest('[data-sec-del]');
      if (del) { if (sections.onDelete) sections.onDelete(del.getAttribute('data-sec-del')); return; }
      // The acts corner of a head is NOT the toggle. The module's own buttons (ren/del) are
      // already handled and returned above, so anything left in there belongs to the consumer
      // (Clientes puts + nova-turma / ⚙ editar-cliente there) and is wired by its own
      // delegated listener — toggling the accordion under it would be a second, unasked action.
      if (e.target.closest('.cdx-rail-sec-acts')) return;
      const tog = e.target.closest('[data-sec-toggle]');
      if (tog) {
        const sid = tog.getAttribute('data-sec-toggle');
        // Exclusive (accordion): the open section is the CONSUMER's state. Hand it the click
        // and let its re-render decide — toggling the class here would fight that state and
        // silently win until the next render(), which is the classic two-truths bug.
        if (sections.exclusive) { if (sections.onToggle) sections.onToggle(sid); return; }
        tog.closest('.cdx-rail-sec').classList.toggle('is-collapsed');
        if (sections.onToggle) sections.onToggle(sid);
        return;
      }
      if (e.target.closest('[data-newsec]')) { if (sections.onCreate) sections.onCreate(); return; }
    }
    const row = e.target.closest('.cdx-rail-row');
    if (row && cfg.onSelect) {
      // rowSelectIgnore: a selector for inline controls in a row (e.g. labs' on/off switch)
      // whose clicks must NOT count as a row selection.
      if (cfg.rowSelectIgnore && e.target.closest(cfg.rowSelectIgnore)) return;
      cfg.onSelect(row.getAttribute('data-id'));
    }
  }

  // Pointer-events drag: grip is the handle; works on touch + mouse.
  function onPointerDown(e) {
    if (!reorder || reorder.gated) return;
    const grip = e.target.closest('.cdx-rail-grip');
    if (!grip) return;
    const row = grip.closest('.cdx-rail-row');
    if (!row) return;
    // canDrag(row): a predicate gating whether a drag may START (mode-gated lists, e.g.
    // aula-hub blocks reorder while an unsaved row exists). Mirrors js/reorder.js's canDrag.
    if (reorder.canDrag && !reorder.canDrag(row)) return;
    e.preventDefault();
    drag = { row, id: row.getAttribute('data-id'), fromList: row.parentNode, startY: e.clientY, moved: false, pointerId: e.pointerId };
    try { grip.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ }
    drag.grip = grip;
  }
  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moved = true;
      drag.row.classList.add('is-dragging');
    }
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const overRow = under && under.closest ? under.closest('.cdx-rail-row') : null;
    const overList = under && under.closest ? under.closest('[data-seclist]') : null;
    if (overRow && overRow !== drag.row && container.contains(overRow)) {
      const rect = overRow.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      overRow.parentNode.insertBefore(drag.row, after ? overRow.nextSibling : overRow);
    } else if (overList && sections && overList !== drag.row.parentNode && container.contains(overList) && !overList.querySelector('.cdx-rail-row')) {
      // dropping into an empty section list
      overList.appendChild(drag.row);
    }
  }
  function onPointerUp() {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.grip) { try { d.grip.releasePointerCapture(d.pointerId); } catch (_) { /* ignore */ } }
    d.row.classList.remove('is-dragging');
    if (!d.moved) return; // it was a press without movement, not a reorder
    const nowList = d.row.parentNode;
    const idsIn = (listEl) => Array.from(listEl.querySelectorAll(':scope > .cdx-rail-row')).map((r) => r.getAttribute('data-id'));
    if (sections && nowList.getAttribute && nowList.getAttribute('data-seclist') && nowList !== d.fromList) {
      const secId = nowList.getAttribute('data-seclist');
      if (sections.onMoveItem) sections.onMoveItem(d.id, secId === '__none' ? null : secId, idsIn(nowList));
    } else if (reorder && reorder.onReorder) {
      reorder.onReorder(idsIn(nowList));
    } else if (sections && sections.onMoveItem) {
      const secId = nowList.getAttribute('data-seclist');
      sections.onMoveItem(d.id, secId === '__none' ? null : secId, idsIn(nowList));
    }
  }

  function wire() {
    container.addEventListener('click', onClick);
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
  }
  function unwire() {
    container.removeEventListener('click', onClick);
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('pointercancel', onPointerUp);
  }

  function ensureResizer() {
    const w = cfg.width;
    if (!w || w.mode !== 'resize' || resizerDestroy) return;
    const grid = w.gridEl || container.parentNode;
    if (!grid) return;
    const d = installResizer(grid, { storeKey: w.storeKey, defaultPx: w.defaultPx, min: w.min, max: w.max });
    resizerDestroy = (typeof d === 'function') ? d : null;
  }

  // ── width:autohide ──────────────────────────────────────────────────────────
  // The consumer owns WHEN the rail is pinned (both call sites pin it open until the
  // first pick, then unpin+close); it says so through rail.pin(bool). Everything else
  // — the edge reveal, the leave-timer, Escape, the open class — lives here.
  function ahLayout() {
    const w = cfg.width;
    if (!w) return null;
    return w.layoutEl || (container ? container.parentNode : null);
  }
  function ahOpenClass() { return (cfg.width && cfg.width.openClass) || 'cdx-sm--open'; }

  function ahOpen() {
    const l = ahLayout();
    if (!l) return;
    l.classList.add(ahOpenClass());
    if (ahPinned) return;               // pinned: stays open, no hide timer
    clearTimeout(ahTimer);
    ahTimer = setTimeout(ahMaybeHide, (cfg.width && cfg.width.hideDelay) || AH_HIDE_DELAY);
  }
  function ahClose() {
    const l = ahLayout();
    if (!l) return;
    clearTimeout(ahTimer);
    if (ahPinned) return;               // pinned: refuse to close until the consumer unpins
    l.classList.remove(ahOpenClass());
  }
  function ahMaybeHide() { if (!ahOver) ahClose(); }

  function ensureAutohide() {
    const w = cfg.width;
    if (!w || w.mode !== 'autohide' || ahWired) return;
    ahWired = true;
    ahPinned = (w.pinned !== false);    // both consumers start pinned open
    const zone = w.revealZone || AH_REVEAL_ZONE;
    const delay = w.hideDelay || AH_HIDE_DELAY;
    const onMove = (e) => { if (e.clientX <= zone) ahOpen(); };
    const onEnter = () => { ahOver = true; clearTimeout(ahTimer); };
    const onLeave = () => { ahOver = false; clearTimeout(ahTimer); ahTimer = setTimeout(ahMaybeHide, delay); };
    const onKey = (e) => { if (e.key === 'Escape') ahClose(); };
    container.addEventListener('mouseenter', onEnter);
    container.addEventListener('mouseleave', onLeave);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('keydown', onKey);
    if (ahPinned) ahOpen();
    ahOff = () => {
      container.removeEventListener('mouseenter', onEnter);
      container.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('keydown', onKey);
      clearTimeout(ahTimer);
      ahTimer = null;
    };
  }

  // pin(true)  = pinned + open   · pin(false) = unpinned + close.
  // Collapses both consumers' two-line dance (`_pinned = x; _openOrClose()`) into one call.
  function pin(on) {
    ahPinned = !!on;
    if (ahPinned) ahOpen(); else ahClose();
  }

  function destroy() {
    destroyed = true;
    unwire();
    if (resizerDestroy) { try { resizerDestroy(); } catch (_) { /* ignore */ } resizerDestroy = null; }
    if (ahOff) { try { ahOff(); } catch (_) { /* ignore */ } ahOff = null; }
    ahWired = false; ahOver = false;
    drag = null;
    if (container) container.innerHTML = '';
  }

  return { render, destroy, pin, el: container };
}
