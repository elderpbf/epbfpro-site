// js/frame-demo-shared.js
// Shared helpers for the in-place phone-demo frame modules (frame-pulso.js,
// frame-trail.js), both of which run inside their srcdoc iframe. Kept in one place
// (build-reusable, never duplicate) so the two demos stay in lockstep: the visible
// tap indicator, the waiters, and the parent-theme sync.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const $ = (s, root) => (root || document).querySelector(s);

export async function waitFor(sel, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const el = $(sel); if (el) return el; await sleep(80); }
  return null;
}

// The demo follows the parent landing's theme (?theme= on first load, postMessage
// on toggle).
export function followParentTheme() {
  const apply = (t) => document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  apply(new URLSearchParams(location.search).get('theme'));
  addEventListener('message', (e) => { if (e.data && e.data.plpTheme) apply(e.data.plpTheme); });
}

// Visible touch: a ripple at the element's centre, THEN the real click. So the
// viewer sees where the finger lands and that the tap is what causes the next
// state, the demo reads as one continuous flow instead of things changing by magic.
let _styled = false;
function ensureStyle() {
  if (_styled) return; _styled = true;
  const s = document.createElement('style');
  s.textContent =
    '.plp-tap{position:fixed;z-index:99999;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;' +
    'background:rgba(255,255,255,.45);box-shadow:0 0 0 2px rgba(255,255,255,.55),0 0 14px 3px rgba(255,255,255,.35);' +
    'pointer-events:none;opacity:0;transform:scale(.25);animation:plp-tap .55s ease-out forwards}' +
    '@keyframes plp-tap{0%{opacity:0;transform:scale(.25)}30%{opacity:1}100%{opacity:0;transform:scale(1.55)}}';
  document.head.appendChild(s);
}

// Show the tap, hold briefly so it reads, then fire the click. Returns after the
// click so callers chain naturally (tap -> reaction -> next tap).
export async function tap(el, hold = 260) {
  if (!el) return;
  ensureStyle();
  const r = el.getBoundingClientRect();
  const dot = document.createElement('div');
  dot.className = 'plp-tap';
  dot.style.left = (r.left + r.width / 2) + 'px';
  dot.style.top = (r.top + r.height / 2) + 'px';
  document.body.appendChild(dot);
  await sleep(hold);
  try { el.click(); } catch (_) { /* noop */ }
  setTimeout(() => dot.remove(), 320);
}
