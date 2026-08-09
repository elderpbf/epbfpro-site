// content/editor/nav.js
// The editor's navigation stack and its draft store. PURE: no DOM, no network, no globals.
// Same engine/painter split as js/item-list.js, and for the same reason: the rules about
// "where am I" and "what is still unsaved" are the part worth testing without a browser.
//
// Why it exists (Élder 2026-08-07, on the bundle screen): "eu quero produzir um item e um
// pacote... adicionar vários itens dentro dele, salvar, voltar". Three separate demands hide in
// that sentence and only the third needs an engine:
//   1. going INTO a member and coming back        -> a stack
//   2. never losing what you typed on the way out -> a draft per level
//   3. ONE Save writing everything you touched    -> an ordered plan over those drafts
//
// The stack has a ceiling because the bundle model has one (a bundle inside a bundle, one level,
// no third). The ceiling lives here rather than in the screen so the disabled state of the "open"
// button and the refusal to nest a third time cannot disagree: they read the same function.
//
// A draft's KEY is the item id for something that already exists, and a synthetic 'new:N' for
// something born inside the editor. That distinction is the whole reason planSave() exists: a new
// item has no id yet, so it must be created BEFORE any parent can list it as a member, and its
// temporary key has to be swapped for the real id in every list that mentions it.

// The deepest a package tree may go on screen: bundle > bundle > items. Mirrors the Worker's
// CT_MEMBERS_MAX_DEPTH, which refuses on write whatever slips past the screen.
export const MAX_DEPTH = 3;

// ── The draft store + the stack ──────────────────────────────────────────────
// `entry` = { key, id, title, isNew, isBundle }. `key` is what the draft store is keyed by; `id`
// is null until a new item is actually created.
export function createNav(opts) {
  const max = (opts && typeof opts.maxDepth === 'number') ? opts.maxDepth : MAX_DEPTH;
  const stack = [];
  const drafts = new Map();
  let newSeq = 0;

  return {
    // ── the stack ──
    path: () => stack.slice(),
    depth: () => stack.length,
    current: () => (stack.length ? stack[stack.length - 1] : null),
    // A level can only be entered while the tree still fits. Asked BEFORE painting the open
    // button, so a refusal is a greyed control and never a dead click.
    canPush: () => stack.length < max,
    push(entry) {
      if (stack.length >= max) return false;
      stack.push(entry);
      return true;
    },
    pop() { return stack.length > 1 ? stack.pop() : null; },
    // Back to an ancestor by position: the breadcrumb's click. Everything deeper is dropped from
    // the stack, but NOT from the drafts, which is exactly what "leaving never discards" means.
    popTo(index) {
      if (index < 0 || index >= stack.length - 1) return false;
      stack.length = index + 1;
      return true;
    },

    // ── the drafts ──
    nextNewKey() { newSeq += 1; return 'new:' + newSeq; },
    stash(key, draft) { if (key != null) drafts.set(key, draft); },
    draft(key) { return drafts.get(key) || null; },
    drafts: () => Array.from(drafts.entries()),
    hasDrafts: () => drafts.size > 0,
    forget(key) { drafts.delete(key); },
    clearDrafts() { drafts.clear(); },
  };
}

// ── The save plan ────────────────────────────────────────────────────────────
// Turns the draft store into an ORDERED list of operations. Pure, so the ordering rule can be
// tested without a Worker.
//
// The order is not a preference, it is a dependency: an item created inside a bundle has no id
// while it is a draft, so it must be created first, and only then can the bundle's member list
// name it. Everything that follows just reads the id map the create step filled in.
//
// Returns [{ op, key, params?, parentKey?, children? }] with op in:
//   'create'   an item that was born in this editing session
//   'update'   an item that already existed and was edited
//   'members'  a bundle's member list (written after every member exists)
//
// `drafts` is the [[key, draft]] shape createNav().drafts() returns. A draft:
//   { params, members?, isNew }   members = [{ key, indent }] (key = id OR 'new:N')
export function planSave(drafts) {
  const list = drafts || [];
  const creates = [];
  const updates = [];
  const members = [];
  for (const [key, d] of list) {
    if (!d || !d.params) continue;
    if (d.isNew) creates.push({ op: 'create', key, params: d.params });
    else updates.push({ op: 'update', key, params: d.params });
    // A member list of [] is meaningful (the user emptied the bundle), so the test is on
    // presence, not on length. Only a non-bundle draft omits the field entirely.
    if (Array.isArray(d.members)) members.push({ op: 'members', key, children: d.members });
  }
  return creates.concat(updates, members);
}

// Resolve a member list's keys into real ids, given what the create step produced.
// `idByKey` maps a draft key ('new:1', or a number) to the id it now has.
// A key with no id yet is DROPPED rather than sent as null: a member row pointing at nothing
// would make the Worker reject the whole list, losing the members that were fine.
export function resolveMembers(children, idByKey) {
  return (children || []).map((c) => {
    const raw = idByKey && idByKey.has(c.key) ? idByKey.get(c.key) : Number(c.key);
    const id = Number(raw);
    return id ? { id, indent: Math.max(0, Number(c.indent) || 0) } : null;
  }).filter(Boolean);
}

// Is this key one of the synthetic ones? The screen asks so it can label a row that does not
// exist on the server yet.
export function isNewKey(key) {
  return typeof key === 'string' && key.indexOf('new:') === 0;
}
