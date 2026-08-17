// content/item-members.js
// The items inside a PACKAGE, in the editor: which ones, in what order, and on what step.
//
// The model (Élder 2026-08-06, correcting mine): real parenthood is only bundle -> items. Between
// the items there is no parenthood at all, they are a FLAT list, and the indent is DISPLAY,
// "só a forma como vai aparecer na trilha". That is why there is no tree here: there is a list
// and one integer per row, moved by the →| and |← buttons.
//
// What that correction deleted from this file: re-parenting on delete, tree-consistency checks,
// and the question "sibling or child?" (the same thing seen from two places). Removing a member
// is `removeAt`, which promotes whoever was under it. Nothing more.
//
// It is a PAINTER over js/item-list.js, not a list of its own (Élder 2026-08-05: "a gente deve
// ter apenas uma lista de itens e cada local que utiliza só faz os filtros necessários"). The
// classes are the same `.cdx-picker*` as the Releases compositor. Folding the THREE painters into
// one is task #23, not this file.
//
// It holds state only. The item-form persists, after the save, via api.setItemMembers: a new item
// has no id yet to be a parent.
//
// A member's identity here is a KEY, not an id, because an item created inside the bundle has no
// id until the single Save runs (see editor/nav.js). For everything that already exists the key
// IS the id, so the common case reads the same as before.
import { esc as _esc } from '../js/dom.js';
import { content as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { iconHtml as typeIconHtml } from '../js/glyphs.js';
import {
  sectionsByType, matchesQuery, guidesFromIndent, maxIndentFor, removeAt, shiftIndent, MAX_INDENT,
} from '../js/item-list.js';
import { isDownloadable } from '../js/item-download.js';
import { pickerRowHtml, pickerGroupsHtml } from '../js/item-picker.js';

// The indent cap lives in the list engine (js/item-list.js) and is re-exported here only for
// whoever already imported it from here. One number for the editor, the trail and the CSS.
export { MAX_INDENT };

// The guide columns of ONE row. `guides[k]` = someone still comes at step k further down, so that
// column carries a vertical line; otherwise it is blank. Without this the line keeps going below
// the last one, the classic bug of drawing a tree in text.
export function guideHtml(guides, isLast, depth) {
  if (!depth) return '';
  const cols = (guides || []).slice(0, depth - 1)
    .map((on) => '<span class="cdx-mem-guide' + (on ? ' is-line' : '') + '"></span>').join('');
  return cols + '<span class="cdx-mem-elbow' + (isLast ? ' is-last' : '') + '"></span>';
}

export function mount(host, opts = {}) {
  const parentId = opts.parentId || null;
  let chosen = (opts.children || []).map(_norm);
  let pool = [];
  let types = [];
  let query = '';
  let pickerOpen = false;
  let sel = null;   // the ONE selected row the action bar acts on
  const onChange = opts.onChange || function () {};
  // Opening a member and creating one inside are the screen's business, not this painter's: it
  // only says WHICH row was asked for. Absent callbacks simply hide the controls, which is what
  // keeps the Apostila and Lessons mounts working unchanged.
  const onOpen = typeof opts.onOpen === 'function' ? opts.onOpen : null;
  const onCreateInside = typeof opts.onCreateInside === 'function' ? opts.onCreateInside : null;
  // Can this member be opened as its own level? The stack ceiling is nav.js's answer, asked here
  // so a refusal is a greyed button instead of a dead click.
  const canOpen = typeof opts.canOpen === 'function' ? opts.canOpen : () => true;

  function _norm(c) {
    const key = c.key != null ? c.key : Number(c.id);
    return {
      key,
      id: c.id != null ? Number(c.id) : null,
      title: c.title, type: c.type || '',
      type_label: c.type_label || c.type || '',
      isNew: !!c.isNew,
      indent: Math.max(0, Math.min(MAX_INDENT, Number(c.indent) || 0)),
      // In how many packages this item lives, counted by the Worker (task #31). null, not 0,
      // when the row did not come from the server (picked from the pool, created here, or an
      // older Worker): "I do not know" must not read as "it lives nowhere".
      parents: c.parents != null ? Number(c.parents) : null,
    };
  }

  function _typeLabel(slug) {
    const ty = types.find((x) => x.slug === slug);
    return (ty && ty.label) || slug;
  }
  function _typeIcon(slug) {
    const ty = types.find((x) => x.slug === slug);
    return ty && ty.icon;
  }

  // ── The list of what is inside ─────────────────────────────
  // ONE selected row, and the actions in a BAR above it, not six buttons repeated on every row.
  // Elder approved this shape ("d looks nice, but lacks the ->| controls") and the reason it is a
  // bar is the narrow column: per-row buttons push the title out of view, and six rows of six
  // buttons are thirty-six buttons competing with the content.
  //
  // The bar also gives the "only exists inside this package" checkbox a SUBJECT. Before the
  // selection existed, that sentence spoke about a row nobody had pointed at.
  function listHtml() {
    if (!chosen.length) return '<li class="cdx-mem-empty">' + t('editor.members_empty') + '</li>';
    return guidesFromIndent(chosen).map((row, i) => {
      const c = row.item;
      const glyph = typeIconHtml(_typeIcon(c.type), { size: 13 });
      // Lab and interativo may go into a package, they just do not fit in the .zip. The row SAYS
      // so instead of the package refusing them: forbidding would make the rule depend on ORDER
      // (put a lab first and the package locks against documents). Elder 2026-08-05.
      const noZip = isDownloadable(c) ? '' : ' <span class="cdx-comp-elsewhere">' + _esc(t('editor.members_no_zip')) + '</span>';
      const newTag = c.isNew ? ' <span class="cdx-mem-new">' + _esc(t('editor.members_unsaved')) + '</span>' : '';
      return '<li class="cdx-mem-row' + (i === sel ? ' is-sel' : '') + '" data-i="' + i + '" data-indent="' + c.indent + '">' +
          guideHtml(row.guides, row.isLast, row.depth) +
          (glyph ? '<span class="cdx-mem-glyph" aria-hidden="true">' + glyph + '</span>' : '') +
          '<span class="cdx-mem-title">' + _esc(c.title || ('#' + c.key)) + newTag + noZip + '</span>' +
          '<span class="cdx-mem-type">' + _esc(c.type_label) + '</span>' +
        '</li>';
    }).join('');
  }

  // The selected member's other homes, next to the Remove button that would take this one away.
  // "Só existe neste pacote" is the warning Élder asked for (task #31); "está em N pacotes" is
  // its calm sibling, said so the ABSENCE of the warning is visible too. Nothing is said for a
  // row the server did not count (parents == null): a new or just-picked member would show a
  // stale zero, and "I do not know" must never be dressed as a fact.
  function statusHtml() {
    const c = sel != null ? chosen[sel] : null;
    if (!c || c.isNew || c.parents == null) return '';
    const msg = c.parents <= 1
      ? t('editor.members_only_here')
      : t('editor.members_in_packages').replace('{n}', String(c.parents));
    return '<div class="cdx-mem-status' + (c.parents <= 1 ? ' is-only' : '') + '">' + _esc(msg) + '</div>';
  }

  // The action bar. Every button reads the SAME rule the move uses, so a live button never no-ops
  // and a refusal is visible before the click.
  function barHtml() {
    const has = sel != null && chosen[sel];
    const off = (on) => (on ? '' : ' disabled');
    const canIn = has && shiftIndent(chosen, sel, +1, MAX_INDENT) !== chosen;
    const canOut = has && shiftIndent(chosen, sel, -1, MAX_INDENT) !== chosen;
    const canOpenSel = has && !!onOpen && canOpen(chosen[sel]);
    return '<div class="cdx-ie-barwrap">' +
      '<div class="cdx-ie-bar">' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-act="out"' + off(canOut) + ' title="' + _esc(t('editor.members_outdent')) + '">|&#8592;</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-act="in"' + off(canIn) + ' title="' + _esc(t('editor.members_indent')) + '">&#8594;|</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-act="up"' + off(has && sel > 0) + '>&#8593;</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-act="down"' + off(has && sel < chosen.length - 1) + '>&#8595;</button>' +
        (onOpen ? '<button type="button" class="cdx-btn cdx-btn-sm" data-act="open"' + off(canOpenSel) +
          (canOpenSel ? '' : ' title="' + _esc(t('editor.members_open_blocked')) + '"') + '>' + t('editor.members_open') + '</button>' : '') +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-act="rm"' + off(has) + '>' + t('editor.members_remove') + '</button>' +
      '</div>' +
      statusHtml() +
    '</div>';
  }

  // ── The picker: the SAME sections as Releases, with a checkbox ───────────
  function pickerHtml() {
    const inside = new Set(chosen.map((c) => c.id).filter(Boolean));
    const eligible = (pool || [])
      .filter((i) => Number(i.id) !== Number(parentId))
      .filter((i) => matchesQuery(i, query));
    const sections = sectionsByType(eligible, { types, labelOf: _typeLabel, iconOf: _typeIcon });
    if (!sections.length) return '<div class="cdx-picker-empty">' + t('editor.members_none') + '</div>';
    // Same painter as Liberações (js/item-picker.js). What is this screen's own is the pool
    // (everything but the parent itself), and the note: a lab or interativo can live inside a
    // package but cannot travel in the .zip, and the row says so instead of the download
    // quietly dropping it.
    return pickerGroupsHtml(sections.map((s) => ({
      key: s.key,
      label: s.label,
      count: s.count,
      glyphHtml: typeIconHtml(s.icon, { size: 14 }),
      rowsHtml: s.items.map((i) => pickerRowHtml({
        id: i.id,
        title: i.title,
        checked: inside.has(Number(i.id)),
        note: isDownloadable(i) ? '' : t('editor.members_no_zip'),
        rowClass: 'cdx-comp-item cdx-mem-pick',
        checkClass: 'cdx-mem-cb',
      })).join(''),
    })), { allOpen: !!query, openIndex: 0 });
  }

  // The inside list repaints on its own, WITHOUT touching the picker. Élder 2026-08-05:
  // "clicking on one checkbox make the list refresh and i have to find stuff again". I used to
  // call render() from the checkbox handler, which rebuilt the whole picker and threw away the
  // open section, the scroll and the place he was in.
  function paintList() {
    const ul = host.querySelector('.cdx-mem-tree');
    if (!ul) return;
    ul.innerHTML = listHtml();
    const bar = host.querySelector('.cdx-ie-barwrap');
    if (bar) bar.outerHTML = barHtml();
    const head = host.querySelector('.cdx-ie-members-name');
    if (head) head.textContent = t('editor.members_label') + (chosen.length ? ' (' + chosen.length + ')' : '');
    wireList();
  }

  // The picker starts CLOSED behind its own button. Élder asked for "+ existente" and
  // "+ criar aqui" as two deliberate actions: with the whole archive permanently open under the
  // member list, the list you are actually building is the smaller half of the screen.
  function render() {
    host.innerHTML =
      '<div class="cdx-ie-members">' +
        '<div class="cdx-ie-members-head">' +
          '<span class="cdx-ie-members-name">' + t('editor.members_label') + (chosen.length ? ' (' + chosen.length + ')' : '') + '</span>' +
          '<span class="cdx-ie-members-acts">' +
            '<button type="button" class="cdx-btn cdx-btn-sm" id="ie-mem-add">' + t('editor.members_add_existing') + '</button>' +
            (onCreateInside ? '<button type="button" class="cdx-btn cdx-btn-sm" id="ie-mem-new">' + t('editor.members_create_here') + '</button>' : '') +
          '</span>' +
        '</div>' +
        barHtml() +
        '<ul class="cdx-mem-tree cdx-ie-tree">' + listHtml() + '</ul>' +
        '<div class="cdx-picker cdx-mem-picker"' + (pickerOpen ? '' : ' style="display:none"') + '>' +
          '<div class="cdx-picker-toolbar">' +
            '<input type="search" class="cdx-picker-search cdx-mem-search" placeholder="' + _esc(t('editor.members_search')) + '" autocomplete="off" spellcheck="false" value="' + _esc(query) + '">' +
          '</div>' +
          '<div class="cdx-picker-list">' + pickerHtml() + '</div>' +
        '</div>' +
      '</div>';
    wireList();
    wirePicker();
    const addBtn = host.querySelector('#ie-mem-add');
    if (addBtn) addBtn.addEventListener('click', () => {
      pickerOpen = !pickerOpen;
      const box = host.querySelector('.cdx-mem-picker');
      if (box) box.style.display = pickerOpen ? '' : 'none';
      if (pickerOpen) { const q = host.querySelector('.cdx-mem-search'); if (q) q.focus(); }
    });
    const newBtn = host.querySelector('#ie-mem-new');
    if (newBtn) newBtn.addEventListener('click', () => onCreateInside());
  }

  function wireList() {
    host.querySelectorAll('.cdx-ie-tree .cdx-mem-row').forEach((li) => {
      li.addEventListener('click', () => {
        const i = Number(li.dataset.i);
        sel = (sel === i) ? null : i;    // clicking the same row again clears the selection
        paintList();
      });
    });
    host.querySelectorAll('.cdx-ie-bar button').forEach((b) => {
      b.addEventListener('click', () => {
        const i = sel;
        if (i == null || !chosen[i]) return;
        const act = b.dataset.act;
        if (act === 'open') { if (onOpen) onOpen(chosen[i], i); return; }
        if (act === 'rm') { chosen = removeAt(chosen, i); sel = null; }
        // The step moves the WHOLE BLOCK (Elder 2026-08-07: "se eu tiro a indentacao do terceiro
        // item, todos que vem depois que estao indentados nele devem perder indentacao igual").
        // The engine refuses a move that would not fit, returning the SAME array.
        else if (act === 'in') chosen = shiftIndent(chosen, i, +1, MAX_INDENT);
        else if (act === 'out') chosen = shiftIndent(chosen, i, -1, MAX_INDENT);
        else if (act === 'up' && i > 0) { chosen.splice(i - 1, 0, chosen.splice(i, 1)[0]); sel = i - 1; }
        else if (act === 'down' && i < chosen.length - 1) { chosen.splice(i + 1, 0, chosen.splice(i, 1)[0]); sel = i + 1; }
        // Reordering can leave a row on a step that no longer exists (the one above changed). Not
        // after in/out: those already went through the engine, and re-clamping there would
        // silently undo a legal block move.
        if (act === 'up' || act === 'down' || act === 'rm') {
          chosen.forEach((c, k) => { c.indent = Math.min(c.indent, maxIndentFor(chosen, k, MAX_INDENT)); });
        }
        paintList();
        _syncChecks();
        onChange(members());
      });
    });
  }

  function _syncChecks() {
    const inside = new Set(chosen.map((c) => c.id).filter(Boolean));
    host.querySelectorAll('.cdx-mem-cb').forEach((cb) => { cb.checked = inside.has(Number(cb.value)); });
  }

  function wirePicker() {
    const list = host.querySelector('.cdx-picker-list');
    if (list) {
      list.addEventListener('change', (e) => {
        const cb = e.target.closest('.cdx-mem-cb');
        if (!cb) return;
        const id = Number(cb.value);
        if (cb.checked) {
          const src = pool.find((i) => Number(i.id) === id);
          if (src) chosen.push(_norm(src));
        } else {
          const i = chosen.findIndex((c) => c.id === id);
          if (i !== -1) chosen = removeAt(chosen, i);
        }
        paintList();          // only the list; the picker stays exactly where it was
        onChange(members());
      });
      // One section open at a time. During a search everything stays open: collapsing would hide
      // precisely what was searched for.
      list.addEventListener('click', (e) => {
        const tgl = e.target.closest('[data-acc-toggle]');
        if (!tgl || query) return;
        const groups = Array.from(list.querySelectorAll('.cdx-picker-group'));
        const key = tgl.getAttribute('data-acc-toggle');
        const wasOpen = tgl.getAttribute('aria-expanded') === 'true';
        groups.forEach((g) => {
          const open = !wasOpen && g.getAttribute('data-acc') === key;
          const b = g.querySelector('.cdx-picker-group-label');
          const rows = g.querySelector('.cdx-picker-group-rows');
          if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
          if (rows) rows.classList.toggle('is-collapsed', !open);
        });
      });
    }
    const search = host.querySelector('.cdx-mem-search');
    if (search) search.addEventListener('input', () => {
      query = search.value;
      const box = host.querySelector('.cdx-picker-list');
      if (box) box.innerHTML = pickerHtml();     // likewise: the search does not repaint the list
    });
  }

  // What the screen persists. The KEY travels, not the id: a member created inside the bundle
  // only gets an id when the single Save creates it (editor/nav.js resolveMembers swaps them).
  function members() { return chosen.map((c) => ({ key: c.key, indent: c.indent })); }
  function ids() { return chosen.map((c) => c.id).filter(Boolean); }
  // The FULL rows, titles included. The editor stashes these when you step into a member, so
  // coming back repaints the list you had built instead of re-fetching one that would have lost
  // every member that does not exist on the server yet.
  function rows() { return chosen.map((c) => Object.assign({}, c)); }

  // Add something the screen just produced (the "+ criar aqui" round trip), or update the row of
  // a member whose title changed while it was open one level down.
  function add(entry) {
    chosen.push(_norm(entry));
    paintList();
    _syncChecks();
    onChange(members());
  }
  function patch(key, fields) {
    const row = chosen.find((c) => String(c.key) === String(key));
    if (!row) return;
    Object.assign(row, fields || {});
    paintList();
  }

  render();
  Promise.all([
    api.listItems({}).catch(() => null),
    api.listTypes ? api.listTypes().catch(() => null) : Promise.resolve(null),
  ]).then(([r, ty]) => {
    pool = (r && r.items) || [];
    types = (ty && ty.types) || [];
    render();
  });

  return { members, ids, rows, add, patch, destroy: () => { host.innerHTML = ''; } };
}
