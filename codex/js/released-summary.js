// js/released-summary.js
// WHAT IS RELEASED, said in one place before the sections.
//
// Élder, 2026-08-17: *"uma coisa que falta na lista de releases é uma lista do que está liberado
// antes da lista de seções"*. The composer is a single-open accordion: one group starts open and
// every other one is collapsed behind "liberados/total". So the question a teacher actually asks
// the screen, "what does this class have?", could only be answered by opening every section in
// turn and hunting for ticks.
//
// It reads the LIVE ticks, not the saved state, for two reasons that are really one: the ticks
// are what Save is about to write, and a list that disagreed with the boxes under it would be a
// second source of truth on the screen that decides what students can see. Showing the pending
// difference is what makes it double as the review before saving.
import { esc } from './dom.js';

// PURE. Fold the rows into what the block shows.
//   rows: [{ id, title, section, iconHtml?, saved, checked }]
//     saved   = the tick as it is stored (a checkbox's defaultChecked)
//     checked = the tick right now
// Order is preserved, so the block reads in section order, exactly like the accordion below it.
// A row that is neither saved nor checked is not mentioned at all: it is simply not part of this
// lesson and never was.
export function summarize(rows) {
  const list = [];
  let added = 0, removed = 0;
  for (const r of (rows || [])) {
    const saved = !!r.saved, checked = !!r.checked;
    if (!saved && !checked) continue;
    let state = 'kept';
    if (checked && !saved) { state = 'added'; added++; }
    else if (!checked && saved) { state = 'removed'; removed++; }
    list.push({ id: r.id, title: r.title, section: r.section, iconHtml: r.iconHtml || '', state });
  }
  // The count is what WILL be released, so a row on its way out is not in it.
  const total = list.filter((i) => i.state !== 'removed').length;
  return { total, added, removed, items: list };
}

// PURE. The block. `labels` carries the translated strings so this module never imports i18n:
//   { title(n), empty, added, removed }
export function summaryHtml(summary, labels) {
  const L = labels || {};
  const s = summary || { total: 0, added: 0, removed: 0, items: [] };
  const head = '<div class="cdx-rel-sum-head">' +
    esc(typeof L.title === 'function' ? L.title(s.total) : String(L.title || '')) +
  '</div>';
  if (!s.items.length) {
    return '<div class="cdx-rel-sum">' + head +
      '<div class="cdx-rel-sum-empty">' + esc(L.empty || '') + '</div>' +
    '</div>';
  }
  const rows = s.items.map((i) => {
    const mark = i.state === 'added' ? '<span class="cdx-rel-sum-mark is-added">' + esc(L.added || '') + '</span>'
      : i.state === 'removed' ? '<span class="cdx-rel-sum-mark is-removed">' + esc(L.removed || '') + '</span>'
      : '';
    // A button, not a link: clicking it opens the row's section and scrolls to it, which is the
    // only thing this block does besides telling you what is there.
    return '<button type="button" class="cdx-rel-sum-row' + (i.state === 'removed' ? ' is-removed' : '') + '"' +
        ' data-sum-id="' + esc(i.id) + '" data-sum-section="' + esc(i.section || '') + '">' +
      '<span class="cdx-rel-sum-icon">' + (i.iconHtml || '') + '</span>' +
      '<span class="cdx-rel-sum-title">' + esc(i.title == null ? '' : i.title) + '</span>' +
      mark +
    '</button>';
  }).join('');
  return '<div class="cdx-rel-sum">' + head + '<div class="cdx-rel-sum-rows">' + rows + '</div></div>';
}

// Read the composer's own checkboxes. The saved baseline is `defaultChecked`, which IS the
// `checked` attribute the row was rendered with, so no separate snapshot has to be kept in step
// with the DOM. Works for both composers (aula and Outros) because both paint the same rows.
export function rowsFromPicker(listEl) {
  if (!listEl) return [];
  const out = [];
  for (const g of listEl.querySelectorAll('.cdx-picker-group')) {
    const section = g.getAttribute('data-acc') || '';
    const nameEl = g.querySelector('.cdx-picker-group-name');
    const sectionLabel = nameEl ? (nameEl.textContent || '').trim() : '';
    for (const cb of g.querySelectorAll('input[type="checkbox"]')) {
      const label = cb.closest('label');
      if (!label) continue;
      // The composer's rows put the glyph and the title inside the SAME span (item-picker.js
      // only wraps the glyph when a screen asks for `iconSpan`, and this one does not), so the
      // glyph is that span's first element and the note is a span nested at its end.
      const titleEl = label.querySelector('span');
      const noteEl = label.querySelector('.cdx-comp-elsewhere');
      let title = titleEl ? (titleEl.textContent || '') : '';
      // "já nas aulas 1, 3" sits inside the title span, so it has to come back out or a borrowed
      // item would read as though the note were part of its name.
      if (noteEl && noteEl.textContent) title = title.replace(noteEl.textContent, '');
      const first = titleEl ? titleEl.firstElementChild : null;
      const iconHtml = (first && first !== noteEl) ? first.outerHTML : '';
      out.push({
        id: cb.value,
        title: title.trim(),
        section,
        sectionLabel,
        iconHtml,
        saved: !!cb.defaultChecked,
        checked: !!cb.checked,
      });
    }
  }
  return out;
}
