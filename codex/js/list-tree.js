// js/list-tree.js
// The grouping ENGINE for Codex's left lists. Pure: no DOM, no CSS, no markup, no state.
//
// Why it is its own file (Élder 2026-07-17: "não entendi pq o levels e o módulo não podem atuar
// por trás... vamos duplicar a funcionalidade? a ideia toda do módulo é unificar"). He was right
// and the limitation was the module's, not Lessons'. In list-rail.js the engine and the painter
// were ONE function: levelHtml() called groupHtml(), which already emitted .cdx-rail-sec. So
// there was no way to ask "how does this nest?" without also being handed the rail's pixels, and
// a consumer whose look is frozen (Lessons) could only answer by forking the logic. That fork is
// what this whole track exists to undo.
//
// Split apart, both get what they need: js/list-rail.js walks this tree and paints .cdx-rail-*;
// lessons/lessons.js walks the SAME tree and paints .cdx-lesson-*. The module acts behind, and
// "Lessons' appearance cannot change" stays true by construction, because an engine has no
// appearance. The thing I had called a blocker (the same item living in Favoritos AND in its
// type bucket) was a question about pixel identity, which an engine with no markup never asks:
// a consumer that wants an item in two places hands in two entries and paints both.
//
//   const { nodes, loose } = buildTree(items, levels);
//
// levels[] — outermost first. Only three fields matter here; collapse, carets, heads and drag
// are the PAINTER's business and stay in each consumer's config:
//   of:(item) => groupId|null      // the item's group AT THIS LEVEL; null = not at this level
//   list:() => [{id, title, parent}]   // groups in render order; `parent` = the id one level OUT
//   hideWhenEmpty: bool | (group)=>bool  // drop a group with nothing in it or under it
//
// node = { depth, group, items, children:[node] }
// loose = items that named no known group at any level (the caller decides what that means:
//         the rail paints them in a bucket above everything).

// An item names only its DEEPEST group; ancestors come from the group's `parent`. That is what
// lets a level be SKIPPED per item (mixed depth): Lessons' `items`/`drive` sections have a
// type/folder sub-group while their siblings hold rows directly, and both live in one tree
// without inventing a phantom sub-group (which would paint one caret too many on a screen whose
// look is frozen).
export function buildTree(items, levels) {
  levels = levels || [];
  // Each level's list is read ONCE per build, not once per recursion step: it is a consumer
  // callback, and calling it per parent made the walk O(n²) over its own config.
  const lists = levels.map((l) => {
    const raw = (typeof l.list === 'function' ? l.list() : (l.list || [])) || [];
    return raw.slice();
  });
  const known = lists.map((gs) => new Set(gs.map((g) => String(g.id))));

  const byGroup = new Map();
  const loose = [];
  for (const it of (items || [])) {
    let placed = null;
    for (let i = levels.length - 1; i >= 0; i--) {
      const gid = levels[i].of ? levels[i].of(it) : null;
      if (gid != null && known[i].has(String(gid))) { placed = String(gid); break; }
    }
    if (placed == null) { loose.push(it); continue; }
    if (!byGroup.has(placed)) byGroup.set(placed, []);
    byGroup.get(placed).push(it);
  }

  // hideWhenEmpty is per level OR per group: Lessons needs both in one level (`items` and `llm`
  // always show, their seven siblings only when they have something). A predicate matches the
  // shape the rest of the config already uses (collapsed:(sec)=>bool, rowClass:(it)=>str).
  const hides = (lv, g) => (typeof lv.hideWhenEmpty === 'function' ? !!lv.hideWhenEmpty(g) : !!lv.hideWhenEmpty);

  function nodesAt(depth, parentId) {
    if (depth >= levels.length) return [];
    const lv = levels[depth];
    const want = parentId == null ? null : String(parentId);
    const out = [];
    for (const g of lists[depth]) {
      const p = g.parent == null ? null : String(g.parent);
      if (p !== want) continue;
      const children = nodesAt(depth + 1, g.id);
      const its = byGroup.get(String(g.id)) || [];
      // Empty means empty ALL THE WAY DOWN: a group whose children all vanished is empty too.
      if (hides(lv, g) && !children.length && !its.length) continue;
      out.push({ depth, group: g, items: its, children });
    }
    return out;
  }

  return { nodes: nodesAt(0, null), loose };
}
