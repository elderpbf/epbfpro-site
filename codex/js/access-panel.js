// codex/js/access-panel.js
// Shared admin UI for a turma's ACCESS control (Phase 7), so the gating switches
// live in exactly one place. Rendered into the cohort dossier's "Acesso" section
// AND (transitionally) the Alunos tab. Tab-agnostic: the caller passes the turma,
// the identifiers, and the cohorts API facade (the one with updateTurmaMeta). The
// QR enrollment window lives here too; the participants list is the host's own.
import { t } from './i18n.js';
import { esc } from './dom.js';
import { clockOffset, remainingSec, fmtRemain, enrollUrl } from './enroll-clock.js';
import * as qr from './qr-share-modal.js';

// ── Access settings (per-turma switches: gated / mode / certificates) ────────
// Returns the rows-only HTML (no card/section wrapper) so each host frames it.
export function settingsHtml(turma) {
  const g = !!turma.access_gated;
  const mode = turma.gate_mode || 'inline';
  const certs = !!turma.certificates_enabled;
  return '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-gated"' + (g ? ' checked' : '') + '> <span>' + esc(t('alunos.gated')) + '</span></label>' +
    '<label class="cdx-acc-row"><span>' + esc(t('alunos.mode')) + '</span> <select class="cdx-acc-mode"' + (g ? '' : ' disabled') + '>' +
      '<option value="inline"' + (mode === 'inline' ? ' selected' : '') + '>' + esc(t('alunos.mode_inline')) + '</option>' +
      '<option value="upfront"' + (mode === 'upfront' ? ' selected' : '') + '>' + esc(t('alunos.mode_upfront')) + '</option>' +
    '</select></label>' +
    '<label class="cdx-acc-row"><input type="checkbox" class="cdx-acc-certs"' + (certs ? ' checked' : '') + '> <span>' + esc(t('alunos.certs')) + '</span></label>' +
    '<div class="cdx-acc-actions"><button type="button" class="cdx-btn cdx-acc-save">' + esc(t('alunos.save')) + '</button>' +
    '<span class="cdx-acc-msg" aria-live="polite"></span></div>';
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
      });
      if (res && res.ok) {
        turma.access_gated = gated.checked ? 1 : 0;
        turma.gate_mode = mode.value;
        turma.certificates_enabled = certs.checked ? 1 : 0;
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

// ── QR enrollment window (signal a/b, instructor-controlled) ─────────────────
// Open a time-boxed window and project a QR; scanning it auto-approves the scanner.
// The countdown is anchored to the server expiry (enroll-clock.js) and the card
// re-validates against the server, so it is never a silent client-only timer. The
// host frames the card; this fills `.cdx-al-enroll-body`. opts = { api, clientSlug, slug }.
let _enrollTimer = null;
export function clearEnrollTimer() { if (_enrollTimer) { clearInterval(_enrollTimer); _enrollTimer = null; } }

async function _safe(fn) { try { return await fn(); } catch (_) { return null; } }
function _origin() { return (typeof location !== 'undefined' && location.origin) ? location.origin : ''; }

// The body placeholder (host wraps it in its own section/card).
export function enrollmentHtml() {
  return '<div class="cdx-al-enroll-body"><span class="cdx-empty">' + esc(t('alunos.loading')) + '</span></div>';
}

// Fetch the current window state and render into `scope`'s enroll body. Re-entrant:
// every call clears the prior countdown first, so re-renders never leak timers.
export async function loadEnrollment(scope, opts) {
  clearEnrollTimer();
  if (!scope || !scope.querySelector('.cdx-al-enroll-body')) return;
  const res = await _safe(() => opts.api.getEnrollment({ client_slug: opts.clientSlug, slug: opts.slug }));
  const box = scope.querySelector('.cdx-al-enroll-body');
  if (!box) return;
  if (!res || !res.ok) { box.innerHTML = '<span class="cdx-acc-msg">' + esc(t('alunos.load_error')) + '</span>'; return; }
  _renderEnrollBox(box, res, scope, opts);
}

function _renderEnrollBox(box, res, scope, opts) {
  clearEnrollTimer();
  if (!res.open) {
    // Closed: ONE QR button. It mints a window and opens the QR straight away
    // (mint-if-none), so there is no separate "open" then "show QR" step.
    box.innerHTML =
      '<div class="cdx-al-enroll-actions">' +
        '<button type="button" class="cdx-btn cdx-btn-primary cdx-al-enroll-qr">' +
          '<span class="cdx-al-qrglyph" aria-hidden="true">▦</span> ' + esc(t('alunos.enroll_open_btn')) +
        '</button>' +
      '</div>' +
      '<p class="cdx-acc-msg">' + esc(t('alunos.enroll_hint_closed')) + '</p>';
    const qb = box.querySelector('.cdx-al-enroll-qr');
    qb.addEventListener('click', async () => {
      qb.disabled = true;
      const opened = await _safe(() => opts.api.openEnrollment({ client_slug: opts.clientSlug, slug: opts.slug }));
      if (opened && opened.ok) {
        qr.open({
          joinUrl: enrollUrl(_origin(), opts.clientSlug, opts.slug, opened.turma_token, opened.enrollment_token),
          title: t('alunos.enroll_qr_title'),
        });
      }
      loadEnrollment(scope, opts);
    });
    return;
  }
  const offset = clockOffset(res.now, Math.floor(Date.now() / 1000));
  const joinUrl = enrollUrl(_origin(), opts.clientSlug, opts.slug, res.turma_token, res.enrollment_token);
  // Open: the SAME QR button re-opens the QR and carries the remaining time on it.
  box.innerHTML =
    '<p class="cdx-al-enroll-on"><span class="cdx-al-enroll-dot" aria-hidden="true">●</span> ' + esc(t('alunos.enroll_open')) + '</p>' +
    '<div class="cdx-al-enroll-actions">' +
      '<button type="button" class="cdx-btn cdx-btn-primary cdx-al-enroll-qr"><span class="cdx-al-qrglyph" aria-hidden="true">▦</span> <span class="cdx-al-enroll-rem"></span></button>' +
      '<button type="button" class="cdx-btn cdx-btn-ghost cdx-al-enroll-close">' + esc(t('alunos.enroll_close')) + '</button>' +
    '</div>' +
    '<p class="cdx-acc-msg">' + esc(t('alunos.enroll_hint_open')) + '</p>';
  box.querySelector('.cdx-al-enroll-qr').addEventListener('click', () => qr.open({ joinUrl, title: t('alunos.enroll_qr_title') }));
  box.querySelector('.cdx-al-enroll-close').addEventListener('click', async () => {
    clearEnrollTimer();
    await _safe(() => opts.api.closeEnrollment({ client_slug: opts.clientSlug, slug: opts.slug }));
    loadEnrollment(scope, opts);
  });
  const remEl = box.querySelector('.cdx-al-enroll-rem');
  let revalIn = 30; // re-fetch the server state every ~30s so the timer can't drift silently
  const tick = () => {
    const remain = remainingSec(res.enrollment_expires_at, offset, Math.floor(Date.now() / 1000));
    if (remain <= 0) { clearEnrollTimer(); loadEnrollment(scope, opts); return; }
    if (remEl) remEl.textContent = fmtRemain(remain);
    if (--revalIn <= 0) { revalIn = 30; loadEnrollment(scope, opts); }
  };
  tick();
  _enrollTimer = setInterval(tick, 1000);
}
