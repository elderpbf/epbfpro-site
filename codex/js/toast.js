// Codex-owned transient toast.
//
// cdx- port of the backstage BSToast global. Mount-free: a .bs-toast div is
// appended to <body> and removed after the dwell. The .bs-toast / .bs-toast.show
// CSS lives in shared-components.css (shared infra), so the toast looks identical.
//
// Used by the admin tab modules (cohorts/content/lessons) which call it through
// the window.BSToast seam (guarded). This module provides that global from Codex,
// replacing the backstage/js/bs-toast.js dependency, and also exports toast() for
// any module that prefers a direct import.

export function toast(msg, duration) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.className = 'bs-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  const dwell = duration || 2500;
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
  }, dwell);
}

// Provide the window.BSToast seam the admin modules reach (same shape as the
// legacy global: { show(msg, duration) }).
if (typeof window !== 'undefined') {
  window.BSToast = window.BSToast || { show: (m, d) => toast(m, d) };
}
