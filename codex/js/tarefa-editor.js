// js/tarefa-editor.js
// Reusable tarefa editor box (t1b authoring). ONE editor used by BOTH the inline
// ＋Adicionar block (add-from-bank or brand-new) AND the edit-existing instance card.
// Presentational only: renders Título + Enunciado + a contextual save row, reads the
// values back, and wires the save buttons to host callbacks. The HOST owns the bank
// semantics (Sobrescrever no banco / Salvar como nova / Usar nesta aula) — there is NO
// local/instance copy, every save lands in the bank. Strings come in already t()-resolved
// from the caller, so this module is i18n-agnostic and unit-testable without a DOM.

import { esc as _esc } from './dom.js';

// opts: { head, titleLabel, bodyLabel, title, body, hint, readonly?, extra?,
//         buttons: [{ key, label, primary?, danger? }] }
// `extra` is raw, caller-escaped HTML injected below the fields (e.g. the tarefa's
// field-type chips + anonymous toggle), so the box stays generic but hosts can append
// their own controls. The host reads those controls itself; readEditor only reads
// title + body.
export function renderEditor(opts) {
  opts = opts || {};
  const ro = opts.readonly ? ' readonly' : '';
  const btns = (opts.buttons || []).map((b) => {
    const variant = b.primary ? ' cdx-btn-primary' : (b.danger ? ' cdx-btn-danger' : '');
    return '<button type="button" class="cdx-btn cdx-btn-sm' + variant + ' cdx-ted-act" ' +
      'data-ted-act="' + _esc(b.key) + '">' + _esc(b.label) + '</button>';
  }).join('');
  return '<div class="cdx-ted-box">' +
    '<div class="cdx-ted-head"><span class="cdx-ted-head-label">' + _esc(opts.head || '') + '</span>' + (opts.headExtra || '') + '</div>' +
    '<div class="cdx-ted-fields">' +
      '<div class="cdx-field"><label>' + _esc(opts.titleLabel || 'Título') + '</label>' +
        '<input type="text" class="cdx-ted-title" value="' + _esc(opts.title || '') + '"' + ro + '></div>' +
      '<div class="cdx-field"><label>' + _esc(opts.bodyLabel || 'Enunciado') + '</label>' +
        '<textarea class="cdx-ted-body" rows="5"' + ro + '>' + _esc(opts.body || '') + '</textarea></div>' +
      (opts.extra || '') +
    '</div>' +
    '<div class="cdx-ted-saverow">' +
      (opts.hint ? '<span class="cdx-ted-hint">' + _esc(opts.hint) + '</span>' : '') +
      btns +
    '</div>' +
  '</div>';
}

// Read the current title/body out of a rendered editor container.
export function readEditor(container) {
  if (!container) return { title: '', body: '' };
  const t = container.querySelector('.cdx-ted-title');
  const b = container.querySelector('.cdx-ted-body');
  return { title: t ? String(t.value || '').trim() : '', body: b ? String(b.value || '') : '' };
}

// Wire each save button (data-ted-act) to handlers[key], called with the read values.
export function wireEditor(container, handlers) {
  if (!container) return;
  handlers = handlers || {};
  container.querySelectorAll('.cdx-ted-act').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fn = handlers[btn.dataset.tedAct];
      if (typeof fn === 'function') fn(readEditor(container));
    });
  });
}
