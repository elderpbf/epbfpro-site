// codex/js/release-notice.js
// "Avisar a turma?": the e-mail about new material is Élder's decision, asked at the moment the
// material becomes visible to the students (2026-10-16). It replaced an hourly sweep that sent on
// its own, which he rejected because it "acontece sem eu saber que vai acontecer".
//
// THE WORKER DECIDES WHAT IS VISIBLE, never this file: ct_turma_visible_ids applies the same reveal
// predicate the student's trail does (reveal on completion, Outros revealed, any placement). The
// caller snapshots it BEFORE a change that can reveal something (a release saved, a lesson marked
// as happened, Outros revealed), makes the change, and calls done(): only a difference opens the
// prompt. Copying the rule here would be a second source of truth for it.
//
// Best-effort around the change, never in its way: a failed snapshot means no prompt, logged to
// the debug pill, and the change itself goes on exactly as before.
import { t } from './i18n.js';
import { esc } from './dom.js';
import { openModal, closeModal } from './modal.js';
import * as toast from './toast.js';
import * as notice from './notice.js';
import { cohorts as cohortsApi, comunicados as comunicadosApi } from './codex-api.js';

// PURE. The ids in `after` that were not in `before`.
export function newlyVisible(before, after) {
  const was = new Set((before || []).map(Number));
  return (after || []).map(Number).filter((id) => !was.has(id));
}

// PURE. The prefilled notice. `label` names the lesson when the change is one ("Aula 2").
export function noticeDraft({ turmaName, label }) {
  return {
    title: label ? t('notice.title_aula').replace('{aula}', label) : t('notice.title_generic'),
    body: t('notice.body').replace('{turma}', turmaName || ''),
  };
}

const log = (msg) => { if (typeof window !== 'undefined' && window.bsLog) window.bsLog('release-notice: ' + msg, 'error'); };

async function _visible(ref) {
  const r = await cohortsApi.turmaVisibleIds({ client_slug: ref.client_slug, turma_slug: ref.turma_slug });
  if (!r || !r.ok) throw new Error((r && r.error) || 'no answer');
  return r;
}

// Snapshot what the class can see now. Resolves to { done(opts) }; call done() after the change
// succeeded. opts.label names the lesson for the default title.
export async function watchVisibility(ref) {
  let before = null;
  try { before = await _visible(ref); } catch (e) { log('snapshot failed: ' + (e && e.message)); }
  return {
    async done(opts = {}) {
      if (!before) return;
      let after;
      try { after = await _visible(ref); } catch (e) { log('second snapshot failed: ' + (e && e.message)); return; }
      const fresh = newlyVisible(before.ids, after.ids);
      if (fresh.length) openPrompt({ ...ref, turmaId: after.turma_id, turmaName: after.turma_name, count: fresh.length, label: opts.label || null });
    }
  };
}

// The modal. Sends through the authored-notice path (ct_comunicado_send) under the student's own
// `material_novo` choice: e-mail and push, no bell (the trail already marks it NOVO).
export function openPrompt({ client_slug, turma_slug, turmaId, turmaName, count, label }) {
  const draft = noticeDraft({ turmaName, label });
  const html =
    '<div class="cdx-modal cdx-modal--md cdx-relnotice">' +
      '<div class="cdx-modal-title">' + esc(t('notice.ask_title')) + '</div>' +
      '<p class="cdx-relnotice-lead">' + esc(t(count === 1 ? 'notice.ask_lead_one' : 'notice.ask_lead_many').replace('{n}', String(count)).replace('{turma}', turmaName || '')) + '</p>' +
      '<div class="cdx-field"><label>' + esc(t('notice.field_title')) + '</label>' +
        '<input type="text" class="cdx-relnotice-title" maxlength="140" value="' + esc(draft.title) + '"></div>' +
      '<div class="cdx-field"><label>' + esc(t('notice.field_body')) + '</label>' +
        '<textarea class="cdx-relnotice-body" rows="4">' + esc(draft.body) + '</textarea></div>' +
      '<div class="cdx-modal-actions">' +
        '<button type="button" class="cdx-btn cdx-relnotice-skip">' + esc(t('notice.skip')) + '</button>' +
        '<button type="button" class="cdx-btn cdx-btn-primary cdx-relnotice-send">' + esc(t('notice.send')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html, { disableBackdropClose: true });
  const send = bd.querySelector('.cdx-relnotice-send');
  bd.querySelector('.cdx-relnotice-skip').addEventListener('click', () => closeModal(bd));
  send.addEventListener('click', async () => {
    const title = bd.querySelector('.cdx-relnotice-title').value.trim();
    const body = bd.querySelector('.cdx-relnotice-body').value.trim();
    if (!title || !body) { toast.err(t('notice.need_text')); return; }
    send.disabled = true;
    try {
      const r = await comunicadosApi.send({
        scope: 'turmas', turma_ids: [Number(turmaId)], category: 'material_novo', title, body,
        link: '/trilha/' + client_slug + '/' + turma_slug,
        channels: { bell: false, email: true, push: true },
      });
      if (!r || !r.ok) throw new Error((r && r.error) || 'send failed');
      closeModal(bd);
      toast.ok(t('notice.sent').replace('{n}', String((r.reach && r.reach.email) || 0)));
    } catch (e) {
      send.disabled = false;
      notice.internal('release-notice send: ' + (e && e.message));
      toast.err(t('notice.send_failed'));
    }
  });
  return bd;
}
