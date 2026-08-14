// codex/js/aula-reminder-prompt.js
// track-55: the question the admin is asked when a class is saved too late for the sweep.
//
// WHY IT EXISTS. The clock producer scans once a day, at 09:00 SP on the eve, so a class set or
// moved after that moment is one the scan can never reach. Before this, the Worker sent those
// itself the instant the aula was saved: 13 e-mails left with the screen saying nothing, which is
// how you find out you mailed a turma by accident. Élder, 2026-07-29: ask first, and say what
// refusing costs.
//
// WHY A SHARED MODULE. Every path that saves an aula gets `reminder` back and must ask the same
// question the same way: the Dados editor in Cohorts, and "marcar como ocorrida" in Releases. A
// copy per call site is how two screens end up disagreeing about whether a send happened.
import { cohorts as api } from './codex-api.js';
import { t } from './i18n.js';
import { esc } from './dom.js';
import { openModal, closeModal } from './modal.js';
import * as toast from './toast.js';
import * as notice from './notice.js';

// PURE. Is there a question to ask at all? Every refusal from the Worker (no date, not imminent,
// already sent, nobody approved) lands here as false, so a caller never has to know the reasons.
export function shouldAsk(reminder) {
  return !!(reminder && reminder.imminent && reminder.aula_id);
}

// PURE. "13 e-mails e 4 push", "13 e-mails", "4 push", or '' when neither channel can reach
// anyone. Exported for the test: the sentence the admin authorizes is worth pinning.
export function reachText(reminder) {
  const r = reminder || {};
  const parts = [];
  if (r.email) parts.push(r.email + ' ' + t(r.email === 1 ? 'reminder.unit_email' : 'reminder.unit_emails'));
  if (r.push) parts.push(r.push + ' ' + t('reminder.unit_push'));
  if (!parts.length) return '';
  return parts.join(' ' + t('reminder.and') + ' ');
}

function _dialogHtml(reminder) {
  const reach = reachText(reminder);
  const number = reminder.aula_number != null ? reminder.aula_number : '';
  const whenKey = reminder.today ? 'reminder.when_today' : 'reminder.when_tomorrow';
  const when = t(whenKey) + (reminder.start_hour ? (' ' + t('reminder.at') + ' ' + reminder.start_hour) : '');
  return '' +
    '<div class="cdx-modal cdx-modal--sm">' +
      '<div class="cdx-modal-title">' + esc(t('reminder.ask_title')) + '</div>' +
      '<p style="margin:0 0 .7rem;font-size:.88rem;color:var(--text-secondary)">' +
        esc(t('reminder.ask_what').replace('{aula}', number).replace('{when}', when)) +
      '</p>' +
      (reach
        ? '<p style="margin:0 0 .7rem;font-size:.88rem;color:var(--text-primary)"><strong>' +
            esc(t('reminder.ask_reach').replace('{reach}', reach)) + '</strong></p>'
        : '') +
      // The consequence of NO is the whole reason this dialog exists. A student who is never
      // told is the outcome of the quiet button, so the quiet button has to say so.
      '<p style="margin:0 0 1.2rem;font-size:.82rem;color:var(--text-secondary)">' +
        esc(t('reminder.ask_consequence')) +
      '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-rem-skip">' + esc(t('reminder.skip')) + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-rem-send">' + esc(t('reminder.send_now')) + '</button>' +
      '</div>' +
    '</div>';
}

// Ask, and send only on a yes. Resolves { asked, sent } once the dialog is done with, so a caller
// can await it before repainting. It never rejects: a failed send is reported on the screen, the
// same as everywhere else in Codex.
export function promptAulaReminder(reminder) {
  if (!shouldAsk(reminder)) return Promise.resolve({ asked: false, sent: false });

  return new Promise((resolve) => {
    // Backdrop close is disabled on purpose: clicking beside the box would be an implicit "no"
    // to a question whose "no" is permanent silence for a whole turma.
    const bd = openModal(_dialogHtml(reminder), { disableBackdropClose: true });
    const done = (out) => { closeModal(bd); resolve(out); };

    bd.querySelector('#cdx-rem-skip').addEventListener('click', () => {
      toast.info(t('reminder.skipped'));
      done({ asked: true, sent: false });
    });

    const sendBtn = bd.querySelector('#cdx-rem-send');
    sendBtn.addEventListener('click', () => {
      sendBtn.disabled = true;
      sendBtn.textContent = t('reminder.sending');
      api.sendAulaReminder({ id: reminder.aula_id }).then((res) => {
        if (res && res.error) throw new Error(res.error);
        if (!res || !res.sent) {
          // The Worker refused what the preview offered: the window closed between the two, or
          // another screen already sent it. Not an error, but the admin must not walk away
          // believing the turma was warned.
          notice.warn(t('reminder.not_sent') + ' (' + ((res && res.reason) || 'unknown') + ')');
          done({ asked: true, sent: false });
          return;
        }
        const reach = reachText({ email: (res.reach || {}).email, push: (res.reach || {}).push });
        toast.ok(reach ? t('reminder.sent').replace('{reach}', reach) : t('reminder.sent_bare'));
        done({ asked: true, sent: true });
      }).catch((err) => {
        notice.internal(t('reminder.send_failed') + ': ' + (err.message || err));
        done({ asked: true, sent: false });
      });
    });
  });
}
