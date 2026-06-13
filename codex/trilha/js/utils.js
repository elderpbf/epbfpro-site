// codex/trilha/js/utils.js
// Pure helpers + a few DOM conveniences for the Trail page. Date/status logic
// takes an explicit `today` so it is deterministic under test; the leaf DOM
// helpers (copy, showError) operate on a passed root, never a global lookup.
import { state, ICONS } from './state.js';

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

export function aulaDateText(aula, today = todayIso()) {
  if (aula.happened_on) return 'ocorreu em ' + fmtDate(aula.happened_on);
  if (aula.rescheduled_from && aula.scheduled_for && aula.scheduled_for > today) {
    return 'remarcada (era ' + fmtDate(aula.rescheduled_from) + ', agora ' + fmtDate(aula.scheduled_for) + ')';
  }
  if (aula.scheduled_for) {
    if (aula.scheduled_for > today) return 'agendada para ' + fmtDate(aula.scheduled_for);
    return fmtDate(aula.scheduled_for);
  }
  return 'a definir';
}

export function aulaStatus(aula, today = todayIso()) {
  if (aula.happened_on) return 'done';
  if (aula.scheduled_for && aula.scheduled_for > today) return 'upcoming';
  if (aula.scheduled_for && aula.scheduled_for <= today) return 'done';
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
