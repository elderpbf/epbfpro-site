// cohorts/roster-actions.js
// Shared bulk-action toolbar + selection wiring for participant rosters (track-28a2). The turma
// Participantes panel and the cross-turma Alunos roster render the SAME adaptive toolbar (master
// "Todos" + live count + action buttons) and wire selection the same way. Each consumer supplies
// how an action is GATED and APPLIED, so the panel acts on one participant row while the roster
// fans the action out across a person's turmas. No duplicated toolbar/selection code.
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { toolbarActions } from './participant-view.js';

// The adaptive toolbar markup. `gated` decides which actions are offered (participant-view rules).
export function toolbarHtml(gated) {
  return '<div class="cdx-ptb">' +
    '<label class="cdx-ptb-all"><input type="checkbox" class="cdx-pall">' + esc(t('alunos.filter_all')) + '</label>' +
    '<span class="cdx-ptb-count">0 ' + esc(t('alunos.sel_suffix')) + '</span>' +
    toolbarActions(gated).map((act) =>
      '<button type="button" class="cdx-btn cdx-btn-sm cdx-ptb-act" data-act="' + esc(act) + '" disabled>' +
        esc(t('alunos.' + act)) + '</button>').join('') +
  '</div>';
}

// Attach selection + bulk-action behaviour; call after each (re)render. cfg:
//   rowSel, chkSel   selectors for the selectable rows and their checkbox
//   ignoreSel        (optional) clicks inside this selector don't toggle the row
//   rowClickToggles  (optional) clicking a row toggles its checkbox (the participants panel);
//                    leave false when a row-click means something else, e.g. expand (Alunos)
//   enabledFor(action, rowEls) -> bool   whether the action button is live for the selection
//   onApply(action, rowEls) -> Promise   perform the action, then the consumer reloads
// Returns { refresh, selected } so a consumer (e.g. section-select) can re-sync.
export function wireSelection(container, cfg) {
  const rows = () => Array.prototype.slice.call(container.querySelectorAll(cfg.rowSel));
  const chkOf = (r) => r.querySelector(cfg.chkSel);
  const allChk = container.querySelector('.cdx-pall');
  const countEl = container.querySelector('.cdx-ptb-count');
  const acts = Array.prototype.slice.call(container.querySelectorAll('.cdx-ptb-act'));
  const selected = () => rows().filter((r) => { const c = chkOf(r); return c && c.checked; });

  function refresh() {
    const sel = selected();
    rows().forEach((r) => { const c = chkOf(r); r.classList.toggle('is-on', !!(c && c.checked)); });
    if (countEl) countEl.textContent = sel.length + ' ' + t('alunos.sel_suffix');
    acts.forEach((b) => { b.disabled = !(sel.length && cfg.enabledFor(b.dataset.act, sel)); });
    if (allChk) allChk.checked = rows().length > 0 && sel.length === rows().length;
  }

  rows().forEach((r) => {
    const c = chkOf(r);
    if (c) c.addEventListener('change', refresh);   // direct checkbox use
    if (!cfg.rowClickToggles) return;
    r.addEventListener('click', (e) => {            // whole-row selection (participants panel)
      if (cfg.ignoreSel && e.target.closest(cfg.ignoreSel)) return;
      const cc = chkOf(r);
      if (cc && e.target !== cc) cc.checked = !cc.checked;
      refresh();
    });
  });
  if (allChk) allChk.addEventListener('change', () => {
    rows().forEach((r) => { const c = chkOf(r); if (c) c.checked = allChk.checked; });
    refresh();
  });
  acts.forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (b.disabled) return;
    const sel = selected();
    if (!sel.length) return;
    acts.forEach((x) => { x.disabled = true; });
    try { await cfg.onApply(b.dataset.act, sel); } finally { refresh(); }
  }));

  refresh();
  return { refresh, selected };
}
