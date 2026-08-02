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
//     add:{label,title,onAdd}, headPanel:()=>html,   // head expands to reveal it ('' = collapsed)
//     reorder:{onReorder:(ids)=>{}, gated:false, canDrag:(row)=>true},
//     sections:{of:(it)=>secId, list:()=>[{id,title}], editable, onCreate,onRename,onDelete,
//               onMoveItem:(itemId,secId,orderedIds)=>{},
//               exclusive, openId:()=>secId, onToggle:(secId)=>{}, collapsed:(sec)=>bool,
//               renderHead:(sec,count)=>({main,act}), emptyText},
//     bands:{of:(sec)=>bandId, list:()=>[{id,title}]},   // OUTER level: band > section > row
//     levels:[{of,list,collapsible,hideWhenEmpty,exclusive,openId,onToggle,collapsed,
//              renderHead,emptyText,editable,onMoveItem}, ...],  // N levels, outermost first.
//         sections/bands are SUGAR over this; reach for levels only when you need 3+ levels or
//         mixed depth (see the grouping block below).
//     search:{fields:(it)=>[...values], placeholder, ariaLabel, onChange:(q)=>{}},
//     filter:{chips:[{key,label,count}] | (q)=>[...], active:()=>key, onFilter:(key)=>{}},
//     width:{mode:'resize', gridEl, storeKey, defaultPx, min, max}
//         | {mode:'autohide', layoutEl, openClass, revealZone, hideDelay, pinned},
//     footer:()=>html,
//   });
//   rail.render();   // idempotent, after loads/mutations
//   rail.query();    // search only: the live query text (the rail owns it, not the consumer)
//   rail.pin(bool);  // width:autohide only — pin(true)=pinned+open, pin(false)=unpinned+close
//   rail.destroy();  // on unmount
//
// ── Decomposition: shared primitives out, one at a time (Élder 2026-07-18) ────
// End state: nothing duplicated, everything pluggable. Pieces leave this file for their own
// module the MOMENT a second consumer needs them (not preemptively — a one-consumer split is
// just indirection). Extraction is only safe behind a gate that proves the move inert: the
// snapshot (HTML byte-identical) for markup, a behavioural test for behaviour.
//   ALREADY OUT (this session): the grouping engine -> js/list-tree.js; pointer-drag -> js/
//     pointer-reorder.js (Lessons uses it; the rail's OWN drag below still duplicates it and
//     must collapse into it once the rail's drag has behavioural coverage — today it is guarded
//     by source-regex only, so the move is not yet gated).
//   NEXT OUT, when a 2nd consumer appears: the width:autohide edge-reveal (a generic "reveal a
//     panel from the screen edge" — any off-canvas drawer wants it); the filter chips; the
//     resizer wiring (already thin, wraps js/resizable.js). Scrollbars are ALREADY shared, as a
//     CSS primitive at the root (css/codex.css), not a JS module — the rail just inherits it.
import { esc } from './dom.js';
import { installResizer } from './resizable.js';
import { buildTree } from './list-tree.js';
import { makeMatcher } from './text-search.js';

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
  const search = cfg.search || null;
  let searchQuery = '';   // owned HERE, not by the consumer, see renderAfterQuery()

  // `sections`/`bands` are SUGAR over the general `levels` (see the grouping block below). They
  // stay the public API: 10 live consumers use them and rewriting those to `levels` would be
  // pure blast radius for zero gain. Only a consumer that actually needs 3+ levels or mixed
  // depth reaches for `levels` directly.
  const levels = normalizeLevels();
  function normalizeLevels() {
    if (Array.isArray(cfg.levels) && cfg.levels.length) return cfg.levels;
    if (!sections) return [];
    const secLevel = {
      of: sections.of,
      list: sections.list,
      collapsible: true,
      hideWhenEmpty: false,     // an empty client still shows (with its emptyText)
      exclusive: sections.exclusive,
      openId: sections.openId,
      onToggle: sections.onToggle,
      collapsed: sections.collapsed,
      renderHead: sections.renderHead,
      emptyText: sections.emptyText,
      editable: sections.editable,
      // The opt-in head/body capabilities, passed through so a plain `sections:` consumer can
      // reach them too and not have to drop down to `levels` just for an icon.
      glyph: sections.glyph,
      groupClass: sections.groupClass,
      prefix: sections.prefix,
    };
    if (!bands) return [secLevel];
    // `bands.of(sec)` answers "which band is this SECTION in", which in `levels` terms is the
    // section's `parent`. Computed once per render, not per item (that lookup was O(n²) bait).
    return [
      { of: () => null,          // an item never sits directly in a band
        list: bands.list,
        collapsible: false,      // a band is a divider, not a control
        hideWhenEmpty: true },   // a status band with no clients does not render
      Object.assign({}, secLevel, {
        list: () => (typeof sections.list === 'function' ? sections.list() : (sections.list || []))
          .map((s) => Object.assign({}, s, { parent: bands.of(s) })),
      }),
    ];
  }

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

  // A group head. `renderHead(g, count) -> {main, act}` lets a consumer own the head's guts
  // (Clientes needs an avatar there) while the module keeps the caret, the row shell and the
  // toggle wiring. Default = the plain title + count.
  //
  // `glyph(g) -> html` (Élder 2026-07-17: "talvez antes precise adicionar capacidades ao módulo
  // como a inclusão de glyphs e cores diferentes; aí outros poderão ter isso no futuro também;
  // de forma que o que já tem não mude, mas pode ativar outras coisas") — an icon before the
  // title. OFF by default: no callback, no span, so the 10 live rails emit what they always did.
  // It goes through headInner rather than into renderHead so a consumer can have an icon WITHOUT
  // taking over the head (renderHead drops the count, which Lessons needs).
  function headInner(lv, g, count) {
    const glyph = lv.glyph ? (lv.glyph(g) || '') : '';
    const glyphHtml = glyph ? '<span class="cdx-rail-sec-glyph">' + glyph + '</span>' : '';
    const rh = lv.renderHead ? lv.renderHead(g, count) : null;
    if (rh) {
      return glyphHtml +
        '<span class="cdx-rail-sec-title">' + (rh.main || '') + '</span>' +
        (rh.act ? '<span class="cdx-rail-sec-acts">' + rh.act + '</span>' : '');
    }
    return glyphHtml +
      '<span class="cdx-rail-sec-title">' + esc(g.title || '') + '</span>' +
      '<span class="cdx-rail-sec-count">' + count + '</span>' +
      (lv.editable ? '<span class="cdx-rail-sec-acts"><button type="button" class="cdx-rail-sec-ren" data-sec-ren="' + esc(String(g.id)) + '" title="Renomear">✎</button><button type="button" class="cdx-rail-sec-del" data-sec-del="' + esc(String(g.id)) + '" title="Excluir">×</button></span>' : '');
  }

  // ── grouping: N levels, outermost first ─────────────────────────────────────
  // The ENGINE lives in js/list-tree.js (pure, no markup); this file is its PAINTER. They were
  // one function until Élder called it (2026-07-17: "não entendi pq o levels e o módulo não podem
  // atuar por trás... a ideia toda do módulo é unificar") — fused, the module could only serve a
  // consumer willing to take .cdx-rail-* pixels, so Lessons (frozen look) had to fork the logic,
  // which is the duplication this track exists to undo. Split, Lessons walks the same tree and
  // paints its own cards.
  //
  // `sections`/`bands` are sugar over `levels` (normalizeLevels above), so the 10 live consumers
  // never changed. Each level: the engine reads `of`/`list`/`hideWhenEmpty` (see list-tree.js);
  // everything below is THIS painter's:
  //   collapsible: bool,   // true = .cdx-rail-sec (caret, toggle, DROP TARGET)
  //                        // false = .cdx-rail-band (plain divider, never a drop target)
  //   exclusive, openId, onToggle, collapsed, renderHead, emptyText, editable, onMoveItem
  function levelCfg(i) { return levels[i] || {}; }
  function levelList(i) {
    const l = levelCfg(i);
    return (typeof l.list === 'function' ? l.list() : (l.list || [])).slice();
  }
  // Which level owns this group id? A click lands on a `data-sec-toggle` and each level has its
  // own exclusive/onToggle/onRename, so "the sections config" is no longer a single answer.
  function levelOfGroup(gid) {
    for (let i = 0; i < levels.length; i++) {
      if (levelList(i).some((g) => String(g.id) === String(gid))) return levels[i];
    }
    return null;
  }

  function groupOpen(lv, g) {
    if (lv.exclusive) return !!(lv.openId && String(lv.openId()) === String(g.id));
    return !(lv.collapsed && lv.collapsed(g));
  }

  // A collapsible group: caret + head + its own .cdx-rail-seclist (the drop container). Any
  // child groups render ABOVE the row list, so a mixed-depth group shows sub-groups then rows.
  //
  // `groupClass(g) -> str` is `rowClass`'s missing twin: extra classes on the group ELEMENT, for
  // state the consumer's CSS keys off and that renderHead cannot express. Lessons paints each
  // section's accent that way (a --sec custom property set by a cdx-lesson-section--* class), the
  // same shape Clientes already uses per ROW for the turma phase. OFF by default.
  //
  // `count` is everything UNDER the group, sub-groups included: a mixed-depth group with all its
  // rows in sub-groups would otherwise badge a 0. Identical to rows.length for every one-level
  // consumer, so the 10 live rails do not move.
  function groupHtml(depth, g, childrenHtml, rows, count) {
    const lv = levelCfg(depth);
    if (!lv.collapsible) {
      // A band: plain divider, no caret, NOT a drop target — the drag contract stays on
      // .cdx-rail-seclist, so nesting never disturbs reorder.
      return '<div class="cdx-rail-band" data-band="' + esc(String(g.id)) + '">' +
        '<div class="cdx-rail-band-h">' + esc(g.title || '') + '</div>' +
        childrenHtml +
        (rows.length ? '<div class="cdx-rail-seclist" data-seclist="' + esc(String(g.id)) + '">' + rows.join('') + '</div>' : '') +
      '</div>';
    }
    const open = groupOpen(lv, g);
    const extra = lv.groupClass ? String(lv.groupClass(g) || '').trim() : '';
    // `prefix(g) -> html`: consumer html at the TOP of a group's collapsible body, above the
    // rows. Lessons' LLMs section leads with six hardcoded launcher links that are not vault rows
    // and must stay real <a> elements (middle-click, open-in-new-tab); as rows they would be divs
    // behind onSelect, a behaviour regression dressed as reuse. It goes INSIDE .cdx-rail-seclist
    // so collapsing the group hides it too (a prefix outside would stay visible when collapsed).
    // OFF by default; non-rows there are ignored by the drag (it filters to .cdx-rail-row).
    const prefix = lv.prefix ? (lv.prefix(g) || '') : '';
    // `count(g, deep) -> n`: override the head badge. Default = everything under the group. Lessons
    // adds its launcher count (they are prefix html, not rows, so `deep` cannot see them). OFF by
    // default: no callback, badge = deep, so the 10 live rails do not move.
    const deep = count == null ? rows.length : count;
    const shown = lv.count ? lv.count(g, deep) : deep;
    const listBody = prefix + rows.join('');
    return '<div class="cdx-rail-sec' + (open ? ' is-open' : ' is-collapsed') + (extra ? ' ' + extra : '') + '" data-sec="' + esc(String(g.id)) + '">' +
      '<div class="cdx-rail-sec-h" data-sec-toggle="' + esc(String(g.id)) + '">' +
        '<span class="cdx-rail-sec-caret" aria-hidden="true">▸</span>' +
        headInner(lv, g, shown) +
      '</div>' +
      childrenHtml +
      // `emptyText` fills a group with nothing under it — no rows, no prefix AND no sub-groups
      // (Clientes: a client with no turmas yet). A section that only holds sub-groups is NOT
      // empty, so it must not show it. Inside .cdx-rail-seclist so the group stays a drop target.
      '<div class="cdx-rail-seclist" data-seclist="' + esc(String(g.id)) + '">' +
        (listBody || childrenHtml || !lv.emptyText
          ? listBody
          : '<div class="cdx-rail-secempty">' + esc(lv.emptyText) + '</div>') +
      '</div>' +
    '</div>';
  }

  // Paint one node of the engine's tree, children first (so a mixed-depth group shows its
  // sub-groups above its own rows). The engine already dropped whatever hideWhenEmpty drops.
  function deepCount(n) {
    return n.items.length + n.children.reduce((a, c) => a + deepCount(c), 0);
  }
  function nodeHtml(n) {
    return groupHtml(n.depth, n.group, n.children.map(nodeHtml).join(''), n.items.map(rowHtml), deepCount(n));
  }

  function bodyHtml() {
    const its = searchFilter(readItems());
    // "No items" is only "empty" when there are no groups either: with groups, the heads ARE
    // content (Clientes with clients but no turmas yet must still list the clients, each showing
    // its own empty text — not one "no clients" line over a screen that HAS clients).
    // DURING A SEARCH that flips: a query with no hits must say so, not paint a column of empty
    // group heads whose own emptyText ("nenhuma turma") answers a question nobody asked.
    const anyGroups = levels.length && levels.some((_, i) => levelList(i).length);
    if (!its.length && (searching() || !anyGroups)) {
      // emptyHtml: a RICH empty state owned by the consumer (Sessões has an icon over a line),
      // same seam as renderRow/renderHead/footer. emptyText stays the escaped-text default.
      // Both receive the live query so a consumer can say "nada encontrado para X" instead of
      // its stock "nenhum item" (the pre-search callbacks take no argument and ignore it).
      if (cfg.emptyHtml) return cfg.emptyHtml(searchQuery);
      const et = (typeof cfg.emptyText === 'function') ? cfg.emptyText(searchQuery) : (cfg.emptyText || '');
      return '<div class="cdx-rail-empty">' + esc(et) + '</div>';
    }
    if (!levels.length) {
      return '<div class="cdx-rail-list" data-seclist="__flat">' + its.map(rowHtml).join('') + '</div>';
    }
    // The engine buckets every item into its DEEPEST named group and drops the empties; anything
    // unplaced comes back as `loose` and gets a bucket at the top of the body (a consumer's null
    // section, e.g. a course with no section).
    // A group that keeps no row under a live query is noise, whatever it declared: the question
    // on screen stopped being "what exists" and became "what matches". hideWhenEmpty is forced
    // on for the duration of the search only, so the normal view still shows an empty client.
    const lv = searching() ? levels.map((l) => Object.assign({}, l, { hideWhenEmpty: true })) : levels;
    const { nodes, loose } = buildTree(its, lv);
    let html = '';
    if (loose.length) html += '<div class="cdx-rail-seclist" data-seclist="__none">' + loose.map(rowHtml).join('') + '</div>';
    html += nodes.map(nodeHtml).join('');
    // "+ Nova seção" sits at the END of the body (never the header), for whichever level is
    // editable. Only one level ever is, so the first match wins.
    const editable = levels.find((l) => l.editable);
    if (editable) {
      html += '<button type="button" class="cdx-rail-newsec" data-newsec>' + esc(cfg.newSectionLabel || '+ Nova seção') + '</button>';
    }
    return html;
  }

  function headHtml() {
    const addBtn = add
      ? '<button type="button" class="cdx-rail-add cdx-btn cdx-btn-sm" data-rail-add title="' + esc(add.title || add.label || '') + '" aria-label="' + esc(add.title || add.label || '') + '">' + esc(add.label || '+') + '</button>'
      : '';
    const filters = filtersHtml();
    // Skip the head bar entirely when there is nothing to put in it (no title, no add) —
    // an empty bordered bar (e.g. labs, which has its own page head) would just be noise.
    const head = (cfg.title || add)
      ? '<div class="cdx-rail-head"><span class="cdx-rail-title">' + esc(cfg.title || '') + '</span>' + addBtn + '</div>'
      : '';
    // headPanel(): the head EXPANDS to reveal consumer html under it — same shape as the filter
    // row, and the consumer owns whether it is showing (return '' when collapsed). Sessões puts
    // its create-session form here: Élder wanted the title + `+` on top like Clientes, but a `+`
    // that opens a modal would add a click and a surface to a flow he runs live at the start of
    // every class. Expanding in place keeps type-and-submit and still frees the top.
    const panel = cfg.headPanel ? (cfg.headPanel() || '') : '';
    // Anatomy (architecture/list-rail.md §3, Élder 2026-08-02): the search box is its OWN row
    // between the title and the chips. Both narrow the same list, so they sit together, and
    // search comes first because it is the more frequent gesture. Crammed into the title row it
    // would fight the title + add button, which on Clientes is already tight on a phone.
    return head + searchHtml() + filters + (panel ? '<div class="cdx-rail-headpanel">' + panel + '</div>' : '');
  }

  // ── search ──────────────────────────────────────────────────────────────────
  // The rail owns the QUERY and the input element; the consumer only declares which values a
  // row is searchable BY (`fields`). That split is what lets the module guarantee the one
  // invariant a search box has: it survives a repaint (see renderAfterQuery).
  //
  // No debounce, deliberately. The bank's search debounces because it hits the WORKER; this one
  // filters an array already in memory, so a delay would only add lag between the keystroke and
  // the list. If a consumer ever mounts a list big enough to stutter, that is the moment to add
  // it, behind a config flag, measured, not on spec.
  function searchHtml() {
    if (!search) return '';
    const ph = search.placeholder || '';
    return '<div class="cdx-rail-search">' +
      '<input type="search" class="cdx-input cdx-rail-search-input" data-rail-search' +
        ' value="' + esc(searchQuery) + '"' +
        ' placeholder="' + esc(ph) + '"' +
        ' aria-label="' + esc(search.ariaLabel || ph) + '"' +
        ' autocomplete="off" spellcheck="false">' +
    '</div>';
  }

  // Rows that survive the query. The CHIPS are not applied here: a chip drives the CONSUMER's
  // own state and comes back through items(), which is the contract the 10 live rails already
  // have. Search cannot work that way: the consumer would have to own the input, which is
  // exactly the arrangement that loses focus on every keystroke today.
  function searchFilter(items) {
    if (!search || !searchQuery.trim()) return items;
    const hit = makeMatcher(searchQuery);
    return items.filter((it) => hit(search.fields ? search.fields(it) : []));
  }
  function searching() { return !!(search && searchQuery.trim()); }

  // `chips` may be a static array (the original contract) OR a function of the live query, so a
  // consumer can badge counts that reflect the search: with "Ativos (17)" frozen while the body
  // shows 3 rows, the number is simply wrong.
  function chipList() {
    if (!filter || !filter.chips) return [];
    return (typeof filter.chips === 'function' ? filter.chips(searchQuery) : filter.chips) || [];
  }
  function chipsInnerHtml() {
    const active = filter && filter.active ? filter.active() : null;
    return chipList().map((c) =>
      '<button type="button" class="cdx-rail-chip' + (String(active) === String(c.key) ? ' is-on' : '') + '" data-rail-filter="' + esc(String(c.key)) + '">' +
        esc(c.label) + (c.count != null ? ' <span class="cdx-rail-chip-n">' + c.count + '</span>' : '') +
      '</button>'
    ).join('');
  }
  function filtersHtml() {
    return chipList().length ? '<div class="cdx-rail-filters">' + chipsInnerHtml() + '</div>' : '';
  }

  function render() {
    if (destroyed) return;
    // A full innerHTML replace tears down and recreates .cdx-rail-body, so the
    // browser forgets its scroll offset on every render() -- jarring for a long
    // list (e.g. labs) when render() runs on every selection. Carry it over.
    const prevBody = container.querySelector('.cdx-rail-body');
    const prevScroll = prevBody ? prevBody.scrollTop : 0;
    // The mode is a CSS fact too, not just behaviour: an autohide rail is a full-height
    // sidebar and is styled as one (see css/list-rail.css). Stamped by the module so no
    // consumer has to remember, and so two sidebars cannot drift apart.
    const modeClass = (cfg.width && cfg.width.mode === 'autohide') ? ' cdx-rail--autohide' : '';
    container.innerHTML =
      '<div class="cdx-rail' + modeClass + '">' +
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

  // THE INVARIANT BEHIND THE SEARCH BOX: the input element survives a repaint; everything else
  // may repaint. render() above replaces the whole container, which is fine on a data mutation
  // but fatal on a keystroke: the element being typed into would be destroyed mid-word and the
  // caret would land back in the page. That is the exact bug content/items.js works around by
  // keeping its search box OUTSIDE the rail ("kept out of the re-rendered grid so typing never
  // loses focus"); this is the same problem solved in the module instead of around it.
  //
  // So a keystroke repaints the three regions the query actually changes, the chips (their
  // counts), the body (the rows) and the foot, and never touches .cdx-rail-search. Repainting
  // ONLY the body would be simpler and wrong: on Labs the chips read "Ativos (17)" while the
  // body shows 3 rows, and a number that contradicts the list under it is worse than no number.
  //
  // Scroll goes back to the top rather than being carried over like render() does: the result
  // set changed, so the old offset points at rows that are no longer there.
  function renderAfterQuery() {
    if (destroyed) return;
    const body = container.querySelector('.cdx-rail-body');
    if (!body) { render(); return; }        // nothing painted yet; nothing to preserve
    const filtersEl = container.querySelector('.cdx-rail-filters');
    if (filtersEl) filtersEl.innerHTML = chipsInnerHtml();
    body.innerHTML = bodyHtml();
    body.scrollTop = 0;
    const footEl = container.querySelector('.cdx-rail-foot');
    if (footEl && cfg.footer) footEl.innerHTML = cfg.footer();
  }

  // ── events (delegated on the container; survive innerHTML re-renders) ─────────
  function onClick(e) {
    if (e.target.closest('.cdx-rail-grip')) return; // grip is drag-only
    const addBtn = e.target.closest('[data-rail-add]');
    if (addBtn) { if (add && add.onAdd) add.onAdd(); return; }
    const chip = e.target.closest('[data-rail-filter]');
    if (chip) { if (filter && filter.onFilter) filter.onFilter(chip.getAttribute('data-rail-filter')); return; }
    if (levels.length) {
      const ren = e.target.closest('[data-sec-ren]');
      if (ren) { const lv = levelOfGroup(ren.getAttribute('data-sec-ren')); if (lv && lv.onRename) lv.onRename(ren.getAttribute('data-sec-ren')); return; }
      const del = e.target.closest('[data-sec-del]');
      if (del) { const lv = levelOfGroup(del.getAttribute('data-sec-del')); if (lv && lv.onDelete) lv.onDelete(del.getAttribute('data-sec-del')); return; }
      // The acts corner of a head is NOT the toggle. The module's own buttons (ren/del) are
      // already handled and returned above, so anything left in there belongs to the consumer
      // (Clientes puts + nova-turma / ⚙ editar-cliente there) and is wired by its own
      // delegated listener — toggling the accordion under it would be a second, unasked action.
      if (e.target.closest('.cdx-rail-sec-acts')) return;
      const tog = e.target.closest('[data-sec-toggle]');
      if (tog) {
        const sid = tog.getAttribute('data-sec-toggle');
        // Route to the level this group belongs to: with N levels each one has its own
        // exclusive/onToggle, so "the sections config" is no longer a single answer.
        const lv = levelOfGroup(sid) || {};
        // Exclusive (accordion): the open group is the CONSUMER's state. Hand it the click
        // and let its re-render decide — toggling the class here would fight that state and
        // silently win until the next render(), which is the classic two-truths bug.
        if (lv.exclusive) { if (lv.onToggle) lv.onToggle(sid); return; }
        tog.closest('.cdx-rail-sec').classList.toggle('is-collapsed');
        if (lv.onToggle) lv.onToggle(sid);
        return;
      }
      if (e.target.closest('[data-newsec]')) { const lv = levels.find((l) => l.editable); if (lv && lv.onCreate) lv.onCreate(); return; }
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
    } else if (overList && levels.length && overList !== drag.row.parentNode && container.contains(overList) && !overList.querySelector('.cdx-rail-row')) {
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
    // A cross-group move is handled by the level that OWNS the destination group. Only the
    // collapsible levels emit a .cdx-rail-seclist, so a band can never be a drop target.
    if (levels.length && nowList.getAttribute && nowList.getAttribute('data-seclist') && nowList !== d.fromList) {
      const secId = nowList.getAttribute('data-seclist');
      const lv = secId === '__none' ? levels.find((l) => l.onMoveItem) : levelOfGroup(secId);
      if (lv && lv.onMoveItem) lv.onMoveItem(d.id, secId === '__none' ? null : secId, idsIn(nowList));
    } else if (reorder && reorder.onReorder) {
      reorder.onReorder(idsIn(nowList));
    } else {
      // Reorder WITHIN a group, on a rail that only declared onMoveItem (no reorder config).
      const secId = nowList.getAttribute && nowList.getAttribute('data-seclist');
      const lv = secId === '__none' ? levels.find((l) => l.onMoveItem) : levelOfGroup(secId);
      if (lv && lv.onMoveItem) lv.onMoveItem(d.id, secId === '__none' ? null : secId, idsIn(nowList));
    }
  }

  // Delegated like every other handler here, so it survives the repaints above. `input` fires on
  // paste and on the native ✗ of type="search" too, not just on typing.
  function onInput(e) {
    if (!search) return;
    const el = (e.target && e.target.closest) ? e.target.closest('[data-rail-search]') : null;
    if (!el) return;
    searchQuery = el.value || '';
    renderAfterQuery();
    if (search.onChange) search.onChange(searchQuery);
  }

  function wire() {
    container.addEventListener('click', onClick);
    container.addEventListener('input', onInput);
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
  }
  function unwire() {
    container.removeEventListener('click', onClick);
    container.removeEventListener('input', onInput);
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

  // The mobile hamburger drawer (codex-topbar.js, same ≤700px breakpoint as css/codex.css)
  // is a SEPARATE reveal mechanism from this hover-based autohide. Forcing the rail open at
  // mount on a phone fights it: hover/leave never fire on touch, so a pinned-open rail can
  // never be closed there, and the drawer's own hamburger toggles a different class, so it
  // looks dead. Mobile always starts unpinned; the hamburger owns visibility there instead.
  function isMobileDrawerWidth() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 700px)').matches;
  }

  function ensureAutohide() {
    const w = cfg.width;
    if (!w || w.mode !== 'autohide' || ahWired) return;
    ahWired = true;
    ahPinned = (w.pinned !== false) && !isMobileDrawerWidth();    // both consumers start pinned open (desktop only)
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

  // query(): the live search text, for a consumer that has to answer the same question the rail
  // is answering: chip counts computed from its own data, or an emptyText that names the term.
  // (emptyText/emptyHtml/chips already receive it as an argument; this is for everything else.)
  return { render, destroy, pin, el: container, query: () => searchQuery };
}
