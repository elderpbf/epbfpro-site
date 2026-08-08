// codex/trilha/js/projeto.js
// The card for a WRAPPER item (type `projeto`, "project"): opening it lists the children, and
// each child opens, copies and downloads like any trail item.
//
// Élder 2026-08-04: "quando eu insiro o projeto na trilha não aparecem os 3 itens
// separadamente, aparece o projeto, e quando eu abro ele aparecem listados os 3 itens. cada um
// eu posso abrir independentemente mas eles são dentro do projeto".
//
// What keeps this small: `buildSub()` already builds an item's row with its actions and
// expansion, and `toggleSub()` already closes siblings by looking at `parentNode`. Building the
// children with that SAME buildSub inside their own container, closing one child when another
// opens comes out correct on its own, with no state line needed here.
import { esc } from './utils.js';
import { renderItem } from '../../js/item-render.js';
import { MAX_INDENT } from '../../js/item-list.js';

// Any item that carries others, not only the `projeto` type. Élder 2026-08-05: "uma tarefa
// precisa às vezes de documentos dentro para o aluno baixar, não é só a tarefa". The check was
// always by CONTENT (does it have children?) rather than by type, so it already worked; what
// changed is that this is now intentional instead of accidental.
export function isProjeto(item) {
  return !!item && Array.isArray(item.children) && item.children.length > 0;
}

// Renders the item's body into `host`, followed by the children. `buildSub` arrives as a
// parameter (not an import) because sub.js already imports this module: importing it back
// would close the cycle.
//
// The body goes through the NORMAL renderItem, no longer as raw text. While this only applied
// to `projeto` the raw text was enough (the body is an intro sentence); with a TASK now carrying
// documents inside, the body is its prompt and has to render the same way it would if it had no
// children at all.
//
// Nesting comes for free: each child is built by the same buildSub, and opening a child re-runs
// ct_get_item_public, which returns ITS OWN children, so this same renderer runs again one level
// down, with no recursion written here.
export function renderProjeto(item, host, buildSub, opts = {}) {
  host.innerHTML = '';
  if (item.body_md) {
    const body = document.createElement('div');
    body.className = 'cdx-tr-proj-intro';
    host.appendChild(body);
    // `children: null` on purpose: renderItem also knows how to list children (that's what the
    // admin preview uses), and the trail passes `preview: true` like any screen. Without
    // stripping it, the read-only list would stack on top of the real list, the one that opens,
    // copies and downloads. Here, this module is the one that paints the children.
    renderItem(Object.assign({}, item, { children: null }), body, { preview: true });
  }
  const count = document.createElement('p');
  count.className = 'cdx-tr-proj-count';
  const n = item.children.length;
  count.textContent = n + (n === 1 ? ' item dentro' : ' itens dentro');
  host.appendChild(count);

  const list = document.createElement('div');
  list.className = 'cdx-tr-proj-list';
  // The indent is DISPLAY ONLY (Élder 2026-08-06): the members are a FLAT list, and the step
  // only says how they appear here. That's why the row is the same buildSub as always, with an
  // indent class layered on top, there is no sub-list, no DOM nesting, and removing a member in
  // the editor needs no re-parenting.
  // The indent comes out as a VARIABLE on the row, not as a class per level: a class per level
  // would force the CSS to know the ceiling, and touching the ceiling would mean touching two
  // files (which is exactly what happened going from 3 to 5). This way the CSS has a single
  // rule and the narrow-screen shrink is ONE number.
  item.children.forEach((child) => {
    const row = buildSub(child, opts);
    const d = Math.max(0, Math.min(MAX_INDENT, Number(child.indent) || 0));
    if (d) { row.classList.add('cdx-tr-in'); row.style.setProperty('--cdx-in', String(d)); }
    list.appendChild(row);
  });
  host.appendChild(list);
}

// Package label, used in the .zip filename and in the menu.
export function projectLabel(item) {
  return esc(item && item.title ? String(item.title).replace(/^#+\s*/, '') : 'projeto');
}
