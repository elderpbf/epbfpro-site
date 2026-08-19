// js/item-list.js
// The ENGINE behind every "escolha itens do acervo" list. Pure: no DOM, no CSS, no markup,
// no state. Same split as js/list-tree.js, and for the same reason.
//
// Why it exists (Élder 2026-08-05, about the project items block I had just finished
// writing): "na lista de itens do projeto, deve ser que nem a lista de liberações (não
// duplique)... a gente deve ter apenas uma lista de itens e cada local que utiliza só faz os
// filtros necessários". He was right, and it's the SAME fix he had already made on
// 2026-07-17, the one that gave birth to list-tree.js. I had written my own `<select>` in
// item-members.js while Liberações already built sections by type, with glyph and order from
// the `ct_types` registry. Two lists diverge: one gets a new type, the other doesn't.
//
// The obvious objection was "but Liberações has things the project editor doesn't: checkbox,
// released count, the 'already in class 3' warning". Élder answered: "o único problema é a
// tabela de releases que tem as necessidades próprias dela... então não é problema. o
// problema era construir do zero desde o começo". It's exactly the engine/painter split: the
// engine delivers WHICH items, in WHICH sections, in WHAT order, with WHAT glyph; each screen
// paints the columns only it has.
//
// Consumers: content/releases.js (the class and Others compositor) and content/item-members.js
// (a grouper's items).
import { normalize } from './text-search.js';

// The `ct_types` registry order rules; a type outside the registry falls to the end, but
// doesn't disappear, an item with an unknown type has to keep appearing, or else it becomes
// unreachable by the screen that should fix it.
export function typeOrder(types) {
  const order = (types || []).map((tp) => tp.slug);
  return (a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  };
}

// Groups by type, in registry order. Used to be releases.js's own private `_groupByType`.
export function groupByType(items, types) {
  const cmp = typeOrder(types);
  const byType = new Map();
  (items || []).forEach((i) => {
    if (!byType.has(i.type)) byType.set(i.type, []);
    byType.get(i.type).push(i);
  });
  return Array.from(byType.keys()).sort(cmp).map((k) => ({ type: k, items: byType.get(k) }));
}

// The sections of an item list, one per type.
//
//   opts.types        ct_types registry [{slug, label, icon}]
//   opts.labelOf      (slug) => label   (i18n wins over the DB label; see releases.js)
//   opts.iconOf       (slug) => icon
//   opts.sortWithin   (slug, items) => items   (labs come out in their registry order)
//
// Returns [{ key, type, label, icon, count, items }]. No HTML on purpose: the glyph goes as
// an icon NAME, and the painter decides the size and whether it goes before the label (it
// does, it was Élder's request: "vamos aproveitar para adicionar glifos antes do nome dos
// tipos").
export function sectionsByType(items, opts) {
  opts = opts || {};
  const labelOf = opts.labelOf || ((s) => s);
  const iconOf = opts.iconOf || (() => null);
  const sortWithin = opts.sortWithin || ((_s, list) => list);
  return groupByType(items, opts.types).map((g) => ({
    key: 'type-' + g.type,
    type: g.type,
    label: labelOf(g.type),
    icon: iconOf(g.type),
    count: g.items.length,
    items: sortWithin(g.type, g.items),
  }));
}

// A-Z BY TYPE, THEN A-Z BY NAME. The Trail's loose-material piles (a lesson's "Outros
// materiais" and the Outros tab) used to come out in release order, which is the order the
// instructor happened to tick boxes in: no order at all, as far as a student is concerned.
// Elder, 2026-08-18: *"they should be organised by type and by name, and the types by name, so
// the types are ordered A to Z and inside the types A to Z as well"*.
//
// The type key is the LABEL the student reads (`type_label`), not the slug, because the label is
// what the alphabet is about; an item whose label never arrived falls back to its slug rather
// than sorting as an empty string. Accent-folded through the same `normalize` the searches use,
// so "Video" and "Vídeo" cannot land on opposite ends, and numeric so "Prompt 2" precedes
// "Prompt 10".
//
// NOT a grouping: the rows stay one flat list. Both piles already carry a type-filter chip strip
// above them, so type is discoverable without a second set of headers, and Elder asked for the
// ordering alone ("we're not going to change anything, it's just the ordering").
//
// The final tiebreak on id keeps two identically-named items of one type from swapping places
// between renders.
const _COLLATE = { numeric: true, sensitivity: 'base' };

function _sortKey(item, field) {
  const raw = field === 'type'
    ? (item && (item.type_label || item.type))
    : (item && item.title);
  return normalize(String(raw == null ? '' : raw));
}

export function compareTypeThenTitle(a, b) {
  const byType = _sortKey(a, 'type').localeCompare(_sortKey(b, 'type'), undefined, _COLLATE);
  if (byType) return byType;
  const byTitle = _sortKey(a, 'title').localeCompare(_sortKey(b, 'title'), undefined, _COLLATE);
  if (byTitle) return byTitle;
  return Number((a && a.id) || 0) - Number((b && b.id) || 0);
}

export function sortByTypeThenTitle(items) {
  return (items || []).slice().sort(compareTypeThenTitle);
}

// Search with the SAME accent folding as the rest of Codex (it's what makes "peticao" find
// "Petição").
export function matchesQuery(item, query) {
  const q = normalize(String(query == null ? '' : query)).trim();
  if (!q) return true;
  return normalize(String((item && item.title) || '')).indexOf(q) !== -1;
}

// ── The indent inside a package ───────────────────────────────────────────────
// Élder 2026-08-06, and it's the fix that simplified the whole model: "o relacionamento
// pai-filho real só pertence ao bundle e seus itens. os itens dentro estão apenas indentados
// ou não, para fins organizacionais... ser irmão ou filho não faz diferença no mundo real, é
// só a forma como vai aparecer na trilha".
//
// So members are a FLAT LIST with an indent integer. There's no tree between them, and that's
// why removing a non-indented member is just "promote whoever was underneath": nothing needs
// to be re-parented, because nothing was a child of anything.
//
// What still needs computing is the connector line, which doesn't fall out of the indent by
// itself: to know whether column k carries a vertical line on a given row, you have to look
// AHEAD and see whether someone still comes at that same step before the list rises above it.
// Without this the line would keep going down below the last one, the classic bug of drawing
// a tree in text.
//
//   guidesFromIndent([{indent:0},{indent:1},{indent:1},{indent:0}])
//     -> [{indent:0,isLast:false,guides:[]},
//         {indent:1,isLast:false,guides:[true]},
//         {indent:1,isLast:true, guides:[true]},
//         {indent:0,isLast:true, guides:[]}]
export function guidesFromIndent(rows) {
  const list = (rows || []).map((r) => ({
    item: r,
    indent: Math.max(0, Number((r && r.indent) || 0)),
  }));
  return list.map((row, i) => {
    // Last of its step = from here on nobody else appears at this step before the list
    // goes back to a shallower step.
    let isLast = true;
    for (let j = i + 1; j < list.length; j++) {
      if (list[j].indent < row.indent) break;
      if (list[j].indent === row.indent) { isLast = false; break; }
    }
    // Column k carries a line if someone still comes at step k further down.
    const guides = [];
    for (let k = 0; k < row.indent; k++) {
      let on = false;
      for (let j = i + 1; j < list.length; j++) {
        if (list[j].indent < k) break;
        if (list[j].indent === k) { on = true; break; }
      }
      guides.push(on);
    }
    return { item: row.item, depth: row.indent, isLast, guides };
  });
}

// The indent a row CAN have. A member can't skip steps: at most one more than the one above
// (otherwise the connector line would point at a step that doesn't exist), and never above the
// cap. Pure, because it's the rule the →| button checks to know whether it can be active.
// One indent cap, ONE number for the whole Codex: the editor (item-members.js) and the trail
// (trilha/js/projeto.js) import it from here, and the CSS derives the margin in a single step.
// Before there were three places with `3` written by hand, and the trail's number was the one
// nobody remembered to change. Mirrors the Worker's CT_MEMBER_MAX_INDENT, which rejects
// whatever goes over.
//
// Élder 2026-08-06 raised it from 3 to 5: "why 3? go to 5 so we can test. if it gets too
// cramped, we shrink; i need to see on the page". The narrow-screen math still holds (each
// step eats title width), but the answer is to SHRINK the step in CSS, not to forbid the step,
// and it's him looking at it who decides whether it got too tight, not this constant.
export const MAX_INDENT = 5;

export function maxIndentFor(rows, index, cap) {
  const top = typeof cap === 'number' ? cap : MAX_INDENT;
  if (!rows || index <= 0) return 0;
  const prev = Math.max(0, Number(rows[index - 1].indent || 0));
  return Math.min(top, prev + 1);
}

// Removing a member PROMOTES whoever was indented under it (Élder: "deleting the unindented
// from the bundle just promotes the indentation, removing their indentation"). Pure, returns a
// new list; the caller decides when to save.
export function removeAt(rows, index) {
  const list = (rows || []).slice();
  const gone = list[index];
  if (!gone) return list;
  const d = Math.max(0, Number(gone.indent || 0));
  list.splice(index, 1);
  for (let i = index; i < list.length; i++) {
    const cur = Math.max(0, Number(list[i].indent || 0));
    if (cur <= d) break;               // back to the removed one's step: its block is over
    list[i] = Object.assign({}, list[i], { indent: cur - 1 });
  }
  return list;
}

// A row's BLOCK: the row itself plus everything after it with a GREATER indent. It's what the
// screen calls "what's inside it", and it exists only because of the indent, not parentage:
// members are still a flat list.
export function blockAt(rows, index) {
  const list = rows || [];
  if (!list[index]) return [index, index];
  const d = Math.max(0, Number(list[index].indent || 0));
  let end = index + 1;
  while (end < list.length && Math.max(0, Number(list[end].indent || 0)) > d) end++;
  return [index, end];
}

// Changing a row's step moves the WHOLE BLOCK along with it, by the same amount.
//
// Élder 2026-08-07: "um item só pode estar uma indentação do item imediatamente acima; se eu
// tiro a indentação do terceiro item, todos que vêm depois que estão indentados nele devem
// perder indentação igual". Without this, removing a step from someone with people inside would
// leave the ones inside hanging at a step that skipped a level, exactly what the rule forbids.
//
// Returns a NEW list, or the SAME list when the move is refused. Refusing entirely instead of
// applying it halfway is deliberate: a block that "almost fits" and lands crooked is worse than
// a button that doesn't light up. That's why the cap is checked on the block's DEEPEST member,
// not on the row that moved, looking only at the moved row would let a child punch through the
// cap in a deep list.
export function shiftIndent(rows, index, delta, cap) {
  const top = typeof cap === 'number' ? cap : MAX_INDENT;
  const list = rows || [];
  const row = list[index];
  if (!row || !delta) return list;
  const cur = Math.max(0, Number(row.indent || 0));
  const next = cur + delta;
  if (next < 0) return list;
  if (next > maxIndentFor(list, index, top)) return list;   // can't skip a step
  const [start, end] = blockAt(list, index);
  let deepest = 0;
  for (let i = start; i < end; i++) deepest = Math.max(deepest, Math.max(0, Number(list[i].indent || 0)));
  if (deepest + delta > top) return list;                   // the whole block has to fit
  const out = list.slice();
  for (let i = start; i < end; i++) {
    out[i] = Object.assign({}, out[i], { indent: Math.max(0, Number(out[i].indent || 0)) + delta });
  }
  return out;
}

// ── The tree ────────────────────────────────────────────────────────────────
// Élder 2026-08-05: "alguns arquivos se juntam como irmãos em mesma hierarquia. outros pode
// se juntar aninhados que dá para mostrar com indentação e linhas laterais mostrando a
// ligação". The side lines are why this function exists instead of a recursive `map` inside
// the painter: to know WHETHER to draw the vertical segment in a column, the row needs to
// know whether each of its ancestors was or wasn't the last sibling of its level. A line that
// keeps going below the last child is the classic bug of drawing a tree in text.
//
// Flattens { children } into rows:
//   { item, depth, isLast, guides:[bool] }   guides[k] = the ancestor at level k still has a
//                                            sibling after it, so column k carries a vertical line
export function flattenTree(nodes, depth, guides) {
  depth = depth || 0;
  guides = guides || [];
  const out = [];
  const list = nodes || [];
  list.forEach((n, idx) => {
    const isLast = idx === list.length - 1;
    out.push({ item: n, depth, isLast, guides: guides.slice() });
    const kids = n && n.children;
    if (kids && kids.length) out.push(...flattenTree(kids, depth + 1, guides.concat(!isLast)));
  });
  return out;
}

// The ids already present in the tree, at any depth. Item pickers use this so they don't
// offer again what's already inside.
export function idsInTree(nodes) {
  const out = new Set();
  flattenTree(nodes).forEach((r) => out.add(Number(r.item.id)));
  return out;
}

// Can an item contain another? It just can't contain ITSELF or one of its ANCESTORS, that's a
// cycle, and the trail would recurse forever building the card. Nothing beyond that is
// forbidden: the old guard used to bar grouper-inside-grouper, which was defensive and Élder
// tore down ("o erro é criar superfícies não flexíveis de cara, depois dá muito mais
// trabalho"). The Worker rejects a cycle again on save; this is the screen's version, so it
// doesn't offer what will come back as an error.
export function selectableItems(all, parentId, ancestorIds) {
  const barred = new Set([Number(parentId)]);
  (ancestorIds || []).forEach((id) => barred.add(Number(id)));
  return (all || []).filter((i) => !barred.has(Number(i.id)));
}
