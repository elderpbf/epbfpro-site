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
  const certs = !!turma.certificates_enabled;
  const forum = !!turma.forum_enabled;
  const reveal = !!turma.reveal_on_completion;
  const appInstall = turma.app_install_prompt == null ? true : !!turma.app_install_prompt; // default ON
  const authCode = turma.email_auth_method === 'code'; // e-mail login by code instead of the magic link (default 'magic')
  const emergency = !!turma.simple_enroll_enabled; // "Emergência" toggle: re-exposes simple_enroll (name+e-mail, 8h) as the break-glass path
  // Collapsed access model (#4, 2026-06-20): ONE gate. "Exigir cadastro" is the only
  // access switch; the legacy mode / enroll_prompt / direct_access controls are retired
  // (a gated turma is always the register wall). Their DB columns stay dormant.
  return '<div class="cdx-acc-grid">' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-gated"' + (g ? ' checked' : '') + '> <span>' + esc(t('alunos.gated')) + '</span></label>' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-certs"' + (certs ? ' checked' : '') + '> <span>' + esc(t('alunos.certs')) + '</span></label>' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-forum"' + (forum ? ' checked' : '') + '> <span>' + esc(t('alunos.forum')) + '</span></label>' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-reveal"' + (reveal ? ' checked' : '') + '> <span>' + esc(t('alunos.reveal')) + '</span></label>' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-appinstall"' + (appInstall ? ' checked' : '') + '> <span>' + esc(t('alunos.app_install')) + '</span></label>' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-authcode"' + (authCode ? ' checked' : '') + '> <span>' + esc(t('alunos.auth_code')) + '</span></label>' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-emergency"' + (emergency ? ' checked' : '') + '> <span>' + esc(t('alunos.emergency')) + '</span></label>' +
    '<div class="cdx-acc-row cdx-acc-reentry"><button type="button" class="cdx-btn cdx-acc-reentry-btn">' + esc(t('alunos.reentry_open')) + '</button> <span class="cdx-acc-reentry-status" aria-live="polite"></span></div>' +
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
  const certs = scope.querySelector('.cdx-acc-certs');
  const forum = scope.querySelector('.cdx-acc-forum');
  const reveal = scope.querySelector('.cdx-acc-reveal');
  const appinstall = scope.querySelector('.cdx-acc-appinstall');
  const authcode = scope.querySelector('.cdx-acc-authcode');
  const emergency = scope.querySelector('.cdx-acc-emergency');
  const save = scope.querySelector('.cdx-acc-save');
  const msg = scope.querySelector('.cdx-acc-msg');
  if (!gated || !save) return;
  save.addEventListener('click', async () => {
    save.disabled = true; msg.textContent = '';
    try {
      const res = await api.updateTurmaMeta({
        client_slug: opts.clientSlug, slug: opts.slug,
        access_gated: gated.checked ? 1 : 0,
        certificates_enabled: certs.checked ? 1 : 0,
        forum_enabled: forum && forum.checked ? 1 : 0,
        reveal_on_completion: reveal && reveal.checked ? 1 : 0,
        app_install_prompt: appinstall && appinstall.checked ? 1 : 0,
        email_auth_method: authcode && authcode.checked ? 'code' : 'magic',
        simple_enroll_enabled: emergency && emergency.checked ? 1 : 0,
      });
      if (res && res.ok) {
        turma.access_gated = gated.checked ? 1 : 0;
        turma.certificates_enabled = certs.checked ? 1 : 0;
        turma.forum_enabled = forum && forum.checked ? 1 : 0;
        turma.reveal_on_completion = reveal && reveal.checked ? 1 : 0;
        turma.app_install_prompt = appinstall && appinstall.checked ? 1 : 0;
        turma.email_auth_method = authcode && authcode.checked ? 'code' : 'magic';
        turma.simple_enroll_enabled = emergency && emergency.checked ? 1 : 0;
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

  // Reentry window (feat/trilha-reentry): a time-boxed, self-closing window (server-capped 12h) that
  // lets an approved+validated member re-enter by e-mail alone. Separate from Save (immediate open/close).
  const reBtn = scope.querySelector('.cdx-acc-reentry-btn');
  const reStatus = scope.querySelector('.cdx-acc-reentry-status');
  if (reBtn) {
    let reOpen = false;
    const paint = (st) => {
      reOpen = !!(st && st.open);
      reBtn.textContent = reOpen ? t('alunos.reentry_close') : t('alunos.reentry_open');
      reBtn.classList.toggle('cdx-acc-reentry-on', reOpen);
      if (reStatus) {
        if (reOpen && st.reentry_window_until && st.now) {
          const mins = Math.max(0, Math.round((st.reentry_window_until - st.now) / 60));
          reStatus.textContent = t('alunos.reentry_open_for').replace('{m}', String(mins));
        } else { reStatus.textContent = ''; }
      }
    };
    const refresh = async () => {
      try { paint(await api.getReentry({ client_slug: opts.clientSlug, slug: opts.slug })); }
      catch (e) { if (typeof window !== 'undefined' && window.bsLog) window.bsLog('reentry state: ' + (e && e.message || e), 'error'); }
    };
    reBtn.addEventListener('click', async () => {
      reBtn.disabled = true;
      try {
        if (reOpen) await api.closeReentry({ client_slug: opts.clientSlug, slug: opts.slug });
        else await api.openReentry({ client_slug: opts.clientSlug, slug: opts.slug });
        await refresh();
      } catch (e) { if (typeof window !== 'undefined' && window.bsLog) window.bsLog('reentry toggle: ' + (e && e.message || e), 'error'); }
      reBtn.disabled = false;
    });
    refresh();
  }
}
