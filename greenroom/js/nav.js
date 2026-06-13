// js/nav.js — page switching (topbar tabs + mobile bottom nav + in-page links).
// The mock keeps every page in the DOM and toggles .on; this preserves that.
export function go(pg) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('on'));
  const el = document.getElementById('pg-' + pg);
  if (el) el.classList.add('on');
  document.querySelectorAll('#nav button, #botnav button').forEach((b) => {
    b.classList.toggle('on', b.dataset.pg === pg);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function initNav() {
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-pg]');
    if (tab && !tab.disabled) { go(tab.dataset.pg); return; }
    const link = e.target.closest('[data-go]');
    if (link) go(link.getAttribute('data-go'));
  });
}
