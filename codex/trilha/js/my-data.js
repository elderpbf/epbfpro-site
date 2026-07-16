// codex/trilha/js/my-data.js
// "Meus dados" — the student seeing what we hold about them, from the Trilha panel (track-42).
//
// READ-ONLY, and that is the design, not a first cut. Élder 2026-07-15: "a gente pode só mostrar
// pro aluno o que a gente tem dele. Ele tem 2 opções: uma de solicitar apagar e outro de solicitar
// a alteração. Acho que fica mais fácil, impede alguns tipos de burles que poderiam ser
// problemáticos. [...] Vamos simplificar as coisas. Eu acho que isso nunca será utilizado mas eu
// tenho que prever."
//
// It also removes a whole attack surface for free: resolveStudentId consults the alias table BEFORE
// the identity, so a student who could add an address would be choosing whose person they are — an
// address nobody owns yet becomes theirs, and its real owner is then folded INTO them on their next
// enrolment. Nothing here can write, so none of that is reachable.
//
// The request path is the ONE support entry the Trail already has (/suporte, carrying origin +
// client/turma/nome), per Élder's 2026-07-08 decision: "uma entrada consistente em toda página, não
// um jeito diferente por tela". No second form, no new backend.
import { t } from '../i18n.js';
import { esc } from './utils.js';
import { supportUrl } from './support-contact.js';

// PURE. The rows to show, in order, skipping what this person does not have. A field we do not hold
// must not render as an empty line: "Meus dados" answers "what do you have about me", and a blank
// row answers it wrong.
export function dataRows(participant) {
  const p = participant || {};
  const rows = [];
  if (p.name) rows.push({ key: 'name', label: t('mydata.name'), values: [p.name] });
  const emails = (p.emails || []).filter(Boolean);
  if (emails.length) rows.push({ key: 'emails', label: t(emails.length > 1 ? 'mydata.emails' : 'mydata.email'), values: emails });
  if (p.cpf) rows.push({ key: 'cpf', label: t('mydata.cpf'), values: [p.cpf] });
  return rows;
}

// PURE. The card's markup. Emits the SAME tr-modal* shell the Trail's tarefa-modal.css already
// styles, so this looks like every other Trail modal; only the body is ours.
export function myDataHtml(participant, ctx) {
  const rows = dataRows(participant);
  const body = rows.length
    ? rows.map((r) =>
        '<div class="tr-md-row">' +
          '<div class="tr-md-k">' + esc(r.label) + '</div>' +
          '<div class="tr-md-v">' + r.values.map((v) => '<div>' + esc(v) + '</div>').join('') + '</div>' +
        '</div>').join('')
    : '<div class="tr-md-empty">' + esc(t('mydata.empty')) + '</div>';
  return '<div class="tr-modal tr-md-modal">' +
      '<button class="tr-modal-close" type="button" aria-label="' + esc(t('mydata.close')) + '">×</button>' +
      '<div class="tr-md-title">' + esc(t('mydata.title')) + '</div>' +
      '<div class="tr-md-rows">' + body + '</div>' +
      // Why there is no edit button here, said to the person rather than implied by its absence.
      '<p class="tr-md-note">' + esc(t('mydata.note')) + '</p>' +
      '<a class="tr-md-cta" href="' + esc(supportUrl(ctx || {}, 'meus-dados')) + '">' + esc(t('mydata.cta')) + '</a>' +
    '</div>';
}

// Open the card. `win`/`doc` are injectable for the same reason the rest of the Trail does it: the
// page owns its window, tests own theirs.
export function openMyData(participant, ctx, opts) {
  const o = opts || {};
  const doc = o.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return null;
  const bd = doc.createElement('div');
  bd.className = 'tr-modal-backdrop tr-md-backdrop';
  bd.innerHTML = myDataHtml(participant, ctx);
  const close = () => { if (bd.parentNode) bd.parentNode.removeChild(bd); };
  bd.addEventListener('click', (e) => {
    // Backdrop click closes; a click on the card itself must not (selecting your own e-mail to copy
    // it is the single most likely thing to happen in here).
    if (e.target === bd || (e.target.closest && e.target.closest('.tr-modal-close'))) close();
  });
  (o.root || doc.body).appendChild(bd);
  return { el: bd, close };
}
