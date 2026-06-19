// codex/trilha/js/entrar.js
// Typed-entry landing for pensoia.com/trilha/<code>. Resolves the 4-digit enrollment
// code to the live turma + et (trail.resolveEnrollCode) and forwards into the trilha
// exactly as a QR scan would. No code / closed window -> the manual field + a hint.
import { trail } from './api.js';
import { t } from '../i18n.js';

function applyI18n(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.getAttribute('data-i18n-attr').split(',').forEach((pair) => {
      const kv = pair.split(':');
      if (kv.length === 2) el.setAttribute(kv[0].trim(), t(kv[1].trim()));
    });
  });
}

// The code arrives as ?code=NNNN or as the path segment /trilha/NNNN (the rewrite keeps
// the visible path). Pull the 4-digit token from either.
export function readCode(search, pathname) {
  try {
    const q = new URLSearchParams(search || '').get('code');
    if (q && /^[0-9]{4}$/.test(q.trim())) return q.trim();
  } catch (_) { /* fall through to the path */ }
  const m = String(pathname || '').match(/(\d{4})\/?$/);
  return m ? m[1] : '';
}

async function resolveAndGo(code, els) {
  els.error.textContent = '';
  els.btn.disabled = true;
  els.state.textContent = t('entrar.entering');
  let res;
  try { res = await trail.resolveEnrollCode({ code }); } catch (_) { res = null; }
  if (res && res.found) {
    const url = location.origin + '/trilha/' + encodeURIComponent(res.client_slug) + '/' +
      encodeURIComponent(res.turma_slug) + '?k=' + encodeURIComponent(res.turma_token || '') +
      '&et=' + encodeURIComponent(res.enrollment_token || '');
    location.replace(url); // forward into the trilha as if the QR were scanned
    return;
  }
  els.state.textContent = '';
  els.btn.disabled = false;
  els.error.textContent = t('entrar.not_found');
}

export function start() {
  applyI18n(document);
  const els = {
    form: document.getElementById('cdx-entrar-form'),
    input: document.getElementById('cdx-entrar-input'),
    btn: document.getElementById('cdx-entrar-btn'),
    error: document.getElementById('cdx-entrar-error'),
    state: document.getElementById('cdx-entrar-state'),
  };
  if (!els.form) return;
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = String(els.input.value || '').trim();
    if (!/^[0-9]{4}$/.test(code)) { els.error.textContent = t('entrar.invalid'); return; }
    resolveAndGo(code, els);
  });
  const code = readCode(location.search, location.pathname);
  if (code) { els.input.value = code; resolveAndGo(code, els); } // auto-submit when the URL carried it
}
