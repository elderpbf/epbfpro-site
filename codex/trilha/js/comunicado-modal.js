// codex/trilha/js/comunicado-modal.js
// track-44 — the student READING a comunicado's full message. Clicking a comunicado in the
// sino opens THIS, not a navigation: the feed item carries the title AND the body (the
// message), so the read happens in place. Reuses the SAME tr-modal* shell (tarefa-modal.css)
// as "Meus dados" (my-data.js), so it looks like every other Trail modal; only the body is ours.
import { t } from '../i18n.js';
import { esc } from './utils.js';

// PURE. Absolute date/time from a unix-seconds stamp, in the viewer's locale; '' when absent.
export function fmtWhen(createdAt) {
  if (!createdAt) return '';
  try {
    return new Date(createdAt * 1000).toLocaleString(undefined, {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch (_) { return ''; }
}

// PURE. The card markup. Body is escaped and rendered with white-space:pre-wrap (CSS), so the
// author's line breaks survive without letting any markup through.
export function comunicadoHtml(item) {
  const it = item || {};
  const when = fmtWhen(it.created_at);
  return '<div class="tr-modal tr-cm-modal">' +
      '<button class="tr-modal-close" type="button" aria-label="' + esc(t('mydata.close')) + '">×</button>' +
      '<div class="tr-cm-title">' + esc(it.title || '') + '</div>' +
      (when ? '<div class="tr-cm-when">' + esc(when) + '</div>' : '') +
      '<div class="tr-cm-body">' + esc(String(it.body || '')) + '</div>' +
    '</div>';
}

// Open the card. `doc`/`root` injectable, matching the rest of the Trail (page owns its window).
export function openComunicado(item, opts) {
  const o = opts || {};
  const doc = o.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return null;
  const bd = doc.createElement('div');
  bd.className = 'tr-modal-backdrop tr-cm-backdrop';
  bd.innerHTML = comunicadoHtml(item);
  const close = () => {
    if (bd.parentNode) bd.parentNode.removeChild(bd);
    doc.removeEventListener('keydown', onEsc);
  };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  bd.addEventListener('click', (e) => {
    if (e.target === bd || (e.target.closest && e.target.closest('.tr-modal-close'))) close();
  });
  doc.addEventListener('keydown', onEsc);
  (o.root || doc.body).appendChild(bd);
  return { el: bd, close };
}
