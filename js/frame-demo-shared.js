// js/frame-demo-shared.js
// Shared helpers for the in-place phone-demo frame modules (frame-pulso.js,
// frame-trail.js), both of which run inside their srcdoc iframe. Kept in one place
// (build-reusable, never duplicate): the visible tap indicator, the step beacon
// (posted to the landing, which draws the caption tab on top of the phone), the
// waiters, the parent-theme sync, and the demo base styles (fade-in + box-sizing
// clamp so nothing overflows the phone width).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const $ = (s, root) => (root || document).querySelector(s);

export async function waitFor(sel, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const el = $(sel); if (el) return el; await sleep(80); }
  return null;
}

export function followParentTheme() {
  const apply = (t) => document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  apply(new URLSearchParams(location.search).get('theme'));
  addEventListener('message', (e) => { if (e.data && e.data.plpTheme) apply(e.data.plpTheme); });
}

// Base demo styles, shared: a gentle fade-in (so the loop's reload is not a hard
// flash) and the tap ripple. Box-sizing is clamped so width:100% + padding can't
// push content past the phone edge (no right-side cut). The action caption now lives
// on the landing (the tab on top of the phone), not inside the iframe, so there is no
// pill style here.
let _styled = false;
function ensureStyle() {
  if (_styled) return; _styled = true;
  const s = document.createElement('style');
  s.textContent =
    '*{box-sizing:border-box}' +
    'body{animation:plp-fade .45s ease both}' +
    '@keyframes plp-fade{from{opacity:0}to{opacity:1}}' +
    '@keyframes plp-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}' +
    // tap ripple
    '.plp-tap{position:fixed;z-index:99998;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;' +
    'background:rgba(255,255,255,.45);box-shadow:0 0 0 2px rgba(255,255,255,.55),0 0 14px 3px rgba(255,255,255,.35);' +
    'pointer-events:none;opacity:0;transform:scale(.25);animation:plp-tap .55s ease-out forwards}' +
    '@keyframes plp-tap{0%{opacity:0;transform:scale(.25)}30%{opacity:1}100%{opacity:0;transform:scale(1.55)}}';
  document.head.appendChild(s);
}

// Inject the shared base styles (call once near boot, before mounting).
export function baseStyle() { ensureStyle(); }

// Show the tap, hold briefly so it reads, then fire the click.
export async function tap(el, hold = 280) {
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

// Step beacon: tell the landing which beat we're on so it can draw the caption tab
// (label + segmented progress) on top of the phone, outside the demo box. `i` is the
// 1-based beat index, `total` the beat count, `label` the action text. The landing
// matches event.source to the right phone, so both demos share this one channel.
export function step(i, total, label) {
  try { parent.postMessage({ plpStep: { i: i, total: total, label: label } }, '*'); } catch (_) { /* cross-doc not ready */ }
}
