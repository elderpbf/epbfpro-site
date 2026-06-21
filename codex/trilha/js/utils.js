// codex/trilha/js/utils.js
// Pure helpers + a few DOM conveniences for the Trail page. Date/status logic
// takes an explicit `today` so it is deterministic under test; the leaf DOM
// helpers (copy, showError) operate on a passed root, never a global lookup.
import { state, ICONS } from './state.js';
import { aulaStatus as canonicalAulaStatus } from '../../js/aula-status.js';

export function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// "yyyy-mm-dd" -> "d/m" (day/month, no year; matches the legacy Trail timeline).
export function fmtDate(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');
  if (p.length < 3) return String(iso);
  return p[2].replace(/^0/, '') + '/' + p[1].replace(/^0/, '');
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

// Trail date label, mapped from the canonical aula status (js/aula-status.js).
export function aulaDateText(aula, today = todayIso()) {
  const s = canonicalAulaStatus(aula, today);
  if (aula.happened_on) return 'ocorreu em ' + fmtDate(aula.happened_on);
  if (s === 'rescheduled') {
    return 'remarcada (era ' + fmtDate(aula.rescheduled_from) + ', agora ' + fmtDate(aula.scheduled_for) + ')';
  }
  if (s === 'scheduled') return 'agendada para ' + fmtDate(aula.scheduled_for);
  if (aula.scheduled_for) return fmtDate(aula.scheduled_for); // past, not yet marked happened
  return 'a definir';
}

// Trail dot/zone status, mapped from the canonical aula status: 'happened' -> done,
// anything still ahead -> upcoming, nothing -> und. The RULE lives in the shared
// module, so the Trail, the admin and Releases agree.
export function aulaStatus(aula, today = todayIso()) {
  const s = canonicalAulaStatus(aula, today);
  if (s === 'happened') return 'done';
  if (s === 'scheduled' || s === 'rescheduled') return 'upcoming';
  return 'und';
}

export function parseTopics(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
  } catch (_) {}
  return String(raw).split(',').map((t) => t.trim()).filter(Boolean);
}

export function tarefaSubmittedKey(itemId) {
  return 'ct_tarefa_submitted_' + itemId + '_' + state.turmaSlug;
}

export function hasSubmittedTarefa(itemId) {
  try { return localStorage.getItem(tarefaSubmittedKey(itemId)) != null; }
  catch (_) { return false; }
}

export function copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
}

export function copyToClipboard(text, btn, doneLabel = 'Copiado') {
  function flash() {
    const orig = btn.innerHTML;
    btn.classList.add('is-done');
    btn.innerHTML = ICONS.check + '<span>' + esc(doneLabel) + '</span>';
    setTimeout(() => { btn.classList.remove('is-done'); btn.innerHTML = orig; }, 1800);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(flash).catch(() => { copyFallback(text); flash(); });
  } else {
    copyFallback(text);
    flash();
  }
}

// Cooldown a button: disable it for `seconds`, ticking the remaining count into `tmpl`
// (which contains "{s}"), then restore `baseLabel`. Returns a cancel fn. Powers the
// resend buttons' 60s countdown ("Reenviar em 59s…"). DOM-only; verified on staging.
export function cooldownButton(btn, seconds, baseLabel, tmpl) {
  if (!btn) return () => {};
  let remaining = Math.max(0, Math.ceil(Number(seconds) || 0));
  let timer = null;
  const tick = () => {
    if (remaining <= 0) { btn.disabled = false; btn.textContent = baseLabel; timer = null; return; }
    btn.disabled = true;
    btn.textContent = tmpl.replace('{s}', String(remaining));
    remaining -= 1;
    timer = setTimeout(tick, 1000);
  };
  tick();
  return () => { if (timer) { clearTimeout(timer); timer = null; } btn.disabled = false; btn.textContent = baseLabel; };
}

// Toggle the page to its error state. `root` is the Trail page container; `t` is
// the Trail i18n function. code: 'link_invalid' | anything-else -> generic.
export function showError(root, code, t) {
  const loading = root.querySelector('.cdx-trilha-loading');
  if (loading) loading.hidden = true;
  const main = root.querySelector('.cdx-trilha-main');
  if (main) main.hidden = true;
  const errorEl = root.querySelector('.cdx-trilha-error');
  if (!errorEl) return;
  errorEl.hidden = false;
  const msgEl = errorEl.querySelector('.cdx-trilha-error-msg');
  if (msgEl) msgEl.textContent = code === 'link_invalid' ? t('page.err_link') : t('page.err_generic');
}
