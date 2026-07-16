// cohorts/erase-modal.js
// "Remover usuário" — the completa/anonimizar decision. It is opened from BOTH scopes: the Usuários
// roster (where removing always means the person is gone) and the turma dossiê whenever the removal
// is total — their only turma, or "de todas as turmas" (turma-remove.js). The one removal that does
// NOT open it is the dossiê's per-turma detach, where the person stays in their other turmas.
//
// Élder 2026-07-15: "na opção de remover o usuário o sistema tem que me dar 2 opções. Uma remoção
// completa que é para todos os dados, não sobra nada. E outra remoção que é de anonimizar, mantém os
// dados porém anonimiza nos locais corretos. Esse é o ideal porque já que eu vou fazer manualmente
// vai depender de mim fazer isso."
//
// The whole point is that the decision is HIS, per person, with the facts on screen: what dies, what
// survives, and what this tool cannot reach at all. A remove button that just says "tem certeza?" is
// what let today's removal leave the person's name written into the content while deleting the
// person — the worst of both, and unfindable afterwards.
import { cohorts as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import * as notice from '../js/notice.js';
import { segmentedHtml } from './cleanup-modal.js';

// PURE. The consequence lines for one person's preview. Only facts that are TRUE for this person
// appear: a generic "certificates may remain" teaches him to ignore the box.
//
// The two modes tell different stories. PURGE deletes the content and reports what it cannot reach
// (the cert, the name-matched Perguntas rows). ANONYMIZE keeps everything and reports what it
// RENAMES to the anon label — nobody is left without a name (Élder 2026-07-16).
export function consequenceLines(pv, mode) {
  const p = pv || {};
  const lb = p.left_behind || {};
  const anon = p.anon_label || 'anon';
  const out = [];
  const n = (k, v) => t(k).replace('{n}', String(v));
  const na = (k, v) => t(k).replace('{n}', String(v)).replace('{anon}', anon);
  if (mode === 'purge') {
    if (p.submissions) out.push({ kind: 'del', text: n('alunos.erase_x_subs', p.submissions) });
    if (p.posts) out.push({ kind: 'del', text: n('alunos.erase_x_posts', p.posts) });
    // Beyond reach of a purge, so named rather than implied: the cert survives by construction, and
    // the Perguntas rows are name-matched (a homonym is not this person, so purge never deletes them).
    if (lb.certificates) out.push({ kind: 'warn', text: n('alunos.erase_left_cert', lb.certificates) });
    if (lb.questions_by_name) out.push({ kind: 'warn', text: n('alunos.erase_left_questions', lb.questions_by_name) });
  } else {
    // Everything STAYS, renamed to the anon label. The person turns into a numbered stranger.
    out.push({ kind: 'keep', text: t('alunos.erase_becomes').replace('{anon}', anon) });
    if (p.submissions) out.push({ kind: 'keep', text: na('alunos.erase_anon_subs', p.submissions) });
    if (p.posts) out.push({ kind: 'keep', text: na('alunos.erase_anon_posts', p.posts) });
    if (lb.questions_by_name) out.push({ kind: 'keep', text: na('alunos.erase_anon_questions', lb.questions_by_name) });
    // The one thing that keeps the REAL name (a legal document), now pointing at the anon record.
    if (lb.certificates) out.push({ kind: 'warn', text: n('alunos.erase_anon_cert', lb.certificates) });
  }
  return out;
}

function _linesHtml(lines) {
  if (!lines.length) return '<div class="cdx-er-line is-keep">' + esc(t('alunos.erase_nothing_else')) + '</div>';
  return lines.map((l) => '<div class="cdx-er-line is-' + esc(l.kind) + '">' + esc(l.text) + '</div>').join('');
}

// people: [{ id, name, email }] — the selection. onDone() reloads the roster.
export function openEraseModal(people, onDone) {
  const list = (people || []).filter((p) => p && p.id);
  if (!list.length) return null;
  const opts = [
    { value: 'anonymize', label: t('alunos.erase_v_anon') },
    { value: 'purge', label: t('alunos.erase_v_purge') },
  ];
  const html =
    '<div class="cdx-modal cdx-modal--lg">' +
      '<div class="cdx-modal-title">' + esc(t('alunos.erase_title')) + '</div>' +
      '<div class="cdx-er-who">' + list.map((p) => '<span class="cdx-er-chip">' + esc(p.name || p.email || '?') + '</span>').join('') + '</div>' +
      // Anonimizar is the DEFAULT: of the two it is the one that cannot destroy something he wanted
      // to keep. The destructive one is a deliberate reach, never the thing that happens by inertia.
      segmentedHtml('erase-mode', opts, 'anonymize') +
      '<div class="cdx-er-what" id="cdx-er-what">' + esc(t('alunos.erase_loading')) + '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-er-cancel">' + esc(t('cohorts.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-er-go" disabled>' + esc(t('alunos.erase_go')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html, { disableBackdropClose: true });
  const _q = (s) => bd.querySelector(s);
  const mode = () => { const r = _q('input[name=erase-mode]:checked'); return r ? r.value : 'anonymize'; };
  let previews = null;

  function _paint() {
    bd.querySelectorAll('.cdx-seg-opt').forEach((c) => {
      const r = c.querySelector('input[type=radio]');
      c.classList.toggle('is-on', !!(r && r.checked));
    });
    if (!previews) return;
    const m = mode();
    _q('#cdx-er-what').innerHTML = previews.map((pv, i) =>
      '<div class="cdx-er-block">' +
        (previews.length > 1 ? '<div class="cdx-er-blockh">' + esc(list[i].name || list[i].email || '?') + '</div>' : '') +
        _linesHtml(consequenceLines(pv, m)) +
      '</div>').join('');
  }

  bd.addEventListener('change', (e) => { if (e.target.type === 'radio') _paint(); });
  _q('#cdx-er-cancel').addEventListener('click', () => closeModal(bd));

  // The counts are fetched BEFORE anything is decided: a warning that only arrives in the result is
  // a warning about something already gone.
  (async () => {
    try {
      previews = [];
      for (const p of list) {
        const r = await api.erasePreview({ student_id: p.id });
        previews.push(r && r.ok ? r : {});
      }
      _q('#cdx-er-go').disabled = false;
      _paint();
    } catch (err) {
      notice.internal('alunos: erase preview: ' + (err && err.message || err));
      _q('#cdx-er-what').textContent = t('alunos.erase_preview_failed');
      // Deliberately left disabled: erasing without knowing what it costs is the thing this modal
      // exists to prevent.
    }
  })();

  _q('#cdx-er-go').addEventListener('click', async () => {
    const m = mode();
    const msg = (m === 'purge' ? t('alunos.erase_confirm_purge') : t('alunos.erase_confirm_anon')).replace('{n}', String(list.length));
    if (typeof confirm === 'function' && !confirm(msg)) return;
    bd.querySelectorAll('.cdx-modal-actions button').forEach((b) => { b.disabled = true; });
    let done = 0;
    for (const p of list) {
      try {
        const r = await api.erasePerson({ student_id: p.id, mode: m });
        if (r && r.error) { notice.warn(t('alunos.erase_failed').replace('{name}', p.name || p.email || '?')); continue; }
        done++;
      } catch (err) {
        notice.internal('alunos: erase: ' + (err && err.message || err));
      }
    }
    closeModal(bd);
    if (onDone) onDone(done);
  });
  return bd;
}
