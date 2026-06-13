// js/toast.js — the transient bottom toast (mock parity).
import { t } from './i18n.js';

let timer;

export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('on'), 1700);
}

export function toastK(key) { toast(t(key)); }

export function initToast() {
  // Mock parity: an element with data-toast fires a keyed toast on click.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-toast]');
    if (el) toastK(el.getAttribute('data-toast'));
  });
}
