// codex/js/access-panel.js
// Shared admin UI for a turma's ACCESS control (Phase 7), so the gating switches
// live in exactly one place. Rendered into the cohort dossier's "Acesso" section
// AND (transitionally) the Alunos tab. Tab-agnostic: the caller passes the turma,
// the identifiers, and the cohorts API facade (the one with updateTurmaMeta).
import { t } from './i18n.js';
import { esc } from './dom.js';

// ── Access settings (per-turma switches: gated / mode / certificates) ────────
// Returns the rows-only HTML (no card/section wrapper) so each host frames it.
export function settingsHtml(turma) {
  const g = !!turma.access_gated;
  const mode = turma.gate_mode || 'inline';
  const certs = !!turma.certificates_enabled;
  const prompt = !!turma.enrollment_prompt_enabled;
  const direct = !!turma.direct_access_enabled;
  const forum = !!turma.forum_enabled;
  const notif = !!turma.notifications_enabled;
  // Rows flow into responsive columns (.cdx-acc-grid) so the panel fills the width
  // instead of a tall single column with dead space on the right.
  return '<div class="cdx-acc-grid">' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-gated"' + (g ? ' checked' : '') + '> <span>' + esc(t('alunos.gated')) + '</span></label>' +
    '<label class="cdx-acc-row"><span>' + esc(t('alunos.mode')) + '</span> <select class="cdx-acc-mode"' + (g ? '' : ' disabled') + '>' +
      '<option value="inline"' + (mode === 'inline' ? ' selected' : '') + '>' + esc(t('alunos.mode_inline')) + '</option>' +
      '<option value="upfront"' + (mode === 'upfront' ? ' selected' : '') + '>' + esc(t('alunos.mode_upfront')) + '</option>' +
    '</select></label>' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-certs"' + (certs ? ' checked' : '') + '> <span>' + esc(t('alunos.certs')) + '</span></label>' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-prompt"' + (prompt ? ' checked' : '') + '> <span>' + esc(t('alunos.enroll_prompt')) + '</span></label>' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-direct"' + (direct ? ' checked' : '') + '> <span>' + esc(t('alunos.direct_access')) + '</span></label>' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-forum"' + (forum ? ' checked' : '') + '> <span>' + esc(t('alunos.forum')) + '</span></label>' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-notif"' + (notif ? ' checked' : '') + '> <span>' + esc(t('alunos.notifications')) + '</span></label>' +
    '<div class="cdx-acc-actions"><button type="button" class="cdx-btn cdx-acc-save">' + esc(t('alunos.save')) + '</button>' +
    '<span class="cdx-acc-msg" aria-live="polite"></span></div>' +
  '</div>';
}

// Wire the settings save. opts = { api, clientSlug, slug, onSaved? }. The save
// writes only the three access columns; ct_update_turma_meta is conditional, so
// the turma's other meta (whatsapp/classpulse) is untouched. Mutates `turma` in
// place on success so the host's cached row stays in sync.
export function wireSettings(scope, turma, opts) {
  const api = opts.api;
  const gated = scope.querySelector('.cdx-acc-gated');
  const mode = scope.querySelector('.cdx-acc-mode');
  const certs = scope.querySelector('.cdx-acc-certs');
  const prompt = scope.querySelector('.cdx-acc-prompt');
  const direct = scope.querySelector('.cdx-acc-direct');
  const forum = scope.querySelector('.cdx-acc-forum');
  const notif = scope.querySelector('.cdx-acc-notif');
  const save = scope.querySelector('.cdx-acc-save');
  const msg = scope.querySelector('.cdx-acc-msg');
  if (!gated || !save) return;
  gated.addEventListener('change', () => { mode.disabled = !gated.checked; });
  save.addEventListener('click', async () => {
    save.disabled = true; msg.textContent = '';
    try {
      const res = await api.updateTurmaMeta({
        client_slug: opts.clientSlug, slug: opts.slug,
        access_gated: gated.checked ? 1 : 0,
        gate_mode: mode.value,
        certificates_enabled: certs.checked ? 1 : 0,
        enrollment_prompt_enabled: prompt && prompt.checked ? 1 : 0,
        direct_access_enabled: direct && direct.checked ? 1 : 0,
        forum_enabled: forum && forum.checked ? 1 : 0,
        notifications_enabled: notif && notif.checked ? 1 : 0,
      });
      if (res && res.ok) {
        turma.access_gated = gated.checked ? 1 : 0;
        turma.gate_mode = mode.value;
        turma.certificates_enabled = certs.checked ? 1 : 0;
        turma.enrollment_prompt_enabled = prompt && prompt.checked ? 1 : 0;
        turma.direct_access_enabled = direct && direct.checked ? 1 : 0;
        turma.forum_enabled = forum && forum.checked ? 1 : 0;
        turma.notifications_enabled = notif && notif.checked ? 1 : 0;
        msg.textContent = t('alunos.saved');
        if (opts.onSaved) opts.onSaved(turma);
      } else {
        msg.textContent = t('alunos.save_error');
      }
    } catch (e) {
      msg.textContent = t('alunos.save_error');
      if (typeof window !== 'undefined' && window.bsLog) window.bsLog('access settings save: ' + (e && e.message || e), 'error');
    }
    save.disabled = false;
  });
}
