// js/item-picker.js
// The ONE painter for "pick items from the library".
//
// Élder, 2026-08-05: *"na lista de itens do projeto, deve ser que nem a lista de liberações (não
// dupliquem)... a gente deve ter apenas uma lista de itens e cada local que utiliza só faz os
// filtros necessários"*. The audit in track-61 §22.3 found the widget painted THREE times
// (`content/presets.js` `_mountPicker`, `content/releases.js` `_rowHtml`/`_accordionGroupsHtml`,
// `content/item-members.js` `pickerHtml`) and grouped FOUR ways. The grouping engine already
// came home to `js/item-list.js`; this is the painter coming home too.
//
// What each screen keeps, because it is genuinely its own: WHICH items are in the pool, how they
// are grouped, and where the selection lives. Releases holds its ticks in the DOM and its save
// reads the checkboxes; that is not touched here, and deliberately so — rewriting the selection
// model of the screen that decides what students can see is its own job, with a browser.
//
// The NOTE is the hook §22.3 asked for: one string per row, so "já nas aulas 1, 3" in Releases
// and "não entra no .zip" in the member editor are the SAME slot rather than two markups.
//
// Class names are parameters, not constants. The three screens carry different CSS today
// (`cdx-comp-item` vs `cdx-picker-row`), and unifying them would be a visual change to three
// screens on top of a refactor. One painter, the classes stay where they are.
import { esc } from './dom.js';

// PURE. One selectable row.
//   id, title            what it is
//   iconHtml             already-rendered glyph, or ''
//   checked              is it selected
//   note                 the ONE per-row remark slot (see above); plain text
//   muted                grey it out (Releases: bound to another aula and not to this one)
//   rowClass/checkClass  the screen's own CSS contract
//   selectedClass        class added when checked (presets marks the row, Releases does not)
//   mutedClass           class added when muted
//   checkAttrs           extra attributes on the input (Releases needs data-pool)
//   dataAttrs            extra attributes on the label (Releases filters by data-title)
//   trailingHtml         anything after the label text (Releases' preview button)
//   indent               depth steps, for a tree drawn inside a flat list
export function pickerRowHtml(o) {
  const opts = o || {};
  const cls = [opts.rowClass || 'cdx-picker-row'];
  if (opts.checked && opts.selectedClass) cls.push(opts.selectedClass);
  if (opts.muted && !opts.checked) cls.push(opts.mutedClass || 'is-already-released');
  const style = opts.indent ? ' style="--cdx-pick-in:' + Number(opts.indent) + '"' : '';
  return '<label class="' + cls.join(' ') + '" data-id="' + esc(opts.id) + '"' +
      (opts.dataAttrs || '') + style + '>' +
    '<input type="checkbox" class="' + (opts.checkClass || 'cdx-picker-check') + '"' +
      ' value="' + esc(opts.id) + '"' + (opts.checkAttrs || '') + (opts.checked ? ' checked' : '') + '>' +
    (opts.iconSpan ? '<span class="cdx-picker-icon">' + (opts.iconHtml || '') + '</span>' : '') +
    '<span' + (opts.titleClass ? ' class="' + opts.titleClass + '"' : '') + '>' +
      (!opts.iconSpan && opts.iconHtml ? opts.iconHtml + ' ' : '') +
      esc(opts.title == null ? '' : opts.title) +
      (opts.note ? ' <span class="cdx-comp-elsewhere">' + esc(opts.note) + '</span>' : '') +
    '</span>' +
    (opts.trailingHtml || '') +
  '</label>';
}

// PURE. The accordion around the rows.
//   sections: [{ key, label, count, subCount?, glyphHtml?, rowsHtml }]
//             subCount renders as "subCount/count" (Releases' "liberados/total").
//   opts.openKey    the one open group (single-open accordion)
//   opts.openIndex  fallback when no key is given: open this index (default 0)
//   opts.forceOpen  every group open and the toggles disabled (a read-only preview)
//   opts.allOpen    every group open, toggles still live (a live search)
//   opts.toggleAttr the data attribute the screen wires (default 'data-acc-toggle')
export function pickerGroupsHtml(sections, opts) {
  const o = opts || {};
  const toggleAttr = o.toggleAttr || 'data-acc-toggle';
  const list = sections || [];
  return list.map((s, idx) => {
    const open = o.forceOpen || o.allOpen
      || (o.openKey != null ? s.key === o.openKey : idx === (o.openIndex == null ? 0 : o.openIndex));
    const cnt = (s.subCount != null) ? (s.subCount + '/' + s.count) : s.count;
    return '<div class="cdx-picker-group' + (open ? ' is-open' : '') + '" data-acc="' + esc(s.key) + '">' +
        '<button type="button" class="cdx-picker-group-label" ' + toggleAttr + '="' + esc(s.key) + '"' +
          ' aria-expanded="' + (open ? 'true' : 'false') + '"' + (o.forceOpen ? ' disabled' : '') + '>' +
          '<span class="cdx-picker-group-caret" aria-hidden="true">&#8250;</span>' +
          (s.glyphHtml ? '<span class="cdx-picker-group-glyph" aria-hidden="true">' + s.glyphHtml + '</span>' : '') +
          '<span class="cdx-picker-group-name">' + esc(s.label) + ' (' + cnt + ')</span>' +
        '</button>' +
        '<div class="cdx-picker-group-rows' + (open ? '' : ' is-collapsed') + '">' + (s.rowsHtml || '') + '</div>' +
      '</div>';
  }).join('');
}

// The toolbar (search + a right-hand slot). Separate from the groups because Releases puts a
// "copy from another lesson" button in that slot and the others put a count.
export function pickerToolbarHtml(o) {
  const opts = o || {};
  return '<div class="cdx-picker-toolbar">' +
      '<input type="search" class="cdx-picker-search' + (opts.searchClass ? ' ' + opts.searchClass : '') +
        '" placeholder="' + esc(opts.placeholder || '') + '" autocomplete="off" spellcheck="false">' +
      (opts.rightHtml || '') +
    '</div>';
}
