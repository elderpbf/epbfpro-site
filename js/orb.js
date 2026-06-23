// js/orb.js — "A Luz": constellation in the hero, descending light that traces the
// highlights, finale that reveals the contacts. Ported value-for-value from the mock;
// the only change is that tunable numbers come from orb-settings (defaults = the mock).
import { getSettings } from './orb-settings.js?v=17';

export function initOrb() {
  const $ = s => document.querySelector(s);
  const cv = $('#sky'), spark = $('#spark'), contact = $('#contato'),
        hero = $('.plp-hero'), ring = $('#ring'), bc = $('#burst');
  if (!cv || !spark || !contact || !hero || !ring || !bc) return;
  const ctx = cv.getContext('2d'), bx = bc.getContext('2d');
  const cinner = contact.querySelector('.plp-inner');
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

  let W, H, nodes = [];
  let mx = innerWidth * 0.5, my = innerHeight * 0.42, mAt = -9999;   // pointer (viewport)
  let sx = innerWidth * 0.5, sy = innerHeight * 0.42;               // smoothed spark
  function size() {
    W = cv.width = cv.offsetWidth; H = cv.height = cv.offsetHeight;
    const n = Math.min(64, Math.round(W * H / 15000)); nodes = [];
    for (let i = 0; i < n; i++) nodes.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25 });
  }
  size(); addEventListener('resize', size); addEventListener('load', size);
  // Only let the pointer DRIVE the orb while it is over the hero (the animation box). Moving the
  // cursor out of the box must not drag the orb after it — it used to chase the pointer upward out
  // of the hero (Élder: "when the mouse leaves the animation box the orb jumps upwards").
  addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      mx = e.clientX; my = e.clientY; mAt = performance.now();
    }
  }, { passive: true });
  function rgb() { return getComputedStyle(document.documentElement).getPropertyValue('--line-rgb').trim() || '125,232,214'; }

  let phase = 'follow', detachScroll = 0, detachY = innerHeight * 0.4, locked = false, ease = 0.08;
  const urlFin = (location.search.match(/finale=(iris|part)/) || [])[1];
  let armed = false, bP = [], bRAF = 0, bW = 0, bH = 0, innerCY = 0;

  // Behaviour mode — switched live by the header test chips, remembered in localStorage:
  //   'descend' — the dot rides the scroll down the left lane (the original)
  //   'stay'    — the dot lives in the hero and never descends; contacts bloom on scroll alone
  //   'leap'    — the dot stays up top, then streaks down the centre and bursts at the contacts
  const MODE_KEY = 'plp_orb_mode', MODES = ['stay', 'descend', 'leap'];
  let mode = 'descend';
  try { const m = localStorage.getItem(MODE_KEY); if (MODES.includes(m)) mode = m; } catch (e) {}
  let leapDir = 0, leapT0 = 0; const LEAP_MS = 620;   // 0 idle, +1 streak down, -1 streak back up

  // Idle glide: when the pointer is NOT driving, the orb drifts at a CONSTANT speed (Élder: "it
  // should glide at a constant speed when not driven by the mouse", not the old erratic ease-to-a-
  // random-point darting). We carry a fixed-magnitude velocity and only steer its HEADING — gently,
  // and away from a soft band — so the dot roams calmly inside the hero and never reaches the top.
  const GLIDE_SPEED = 0.7;                       // px/frame ≈ a slow, steady glide (constant pace)
  let gx = sx, gy = sy, gvx = 0, gvy = 0, gSteerAt = 0, wasLive = false;
  function seedGlide(now) {                       // start the glide AT the dot, so there is no jump
    gx = sx; gy = sy;
    const a = Math.random() * 6.283;
    gvx = Math.cos(a) * GLIDE_SPEED; gvy = Math.sin(a) * GLIDE_SPEED;
    gSteerAt = now;
  }
  function tickGlide(now, hb) {
    const xMin = 28, xMax = innerWidth - 28;
    const yMin = innerHeight * 0.24, yMax = Math.min(innerHeight * 0.68, hb - 12);
    if (now - gSteerAt > 1800) {                  // curve the path now and then (a small heading nudge)
      const turn = (Math.random() - 0.5) * 0.9, c = Math.cos(turn), s = Math.sin(turn);
      const nx = gvx * c - gvy * s, ny = gvx * s + gvy * c; gvx = nx; gvy = ny; gSteerAt = now;
    }
    if (gx < xMin + 60) gvx += 0.05; else if (gx > xMax - 60) gvx -= 0.05;   // steer inward before the edges
    if (gy < yMin + 50) gvy += 0.05; else if (gy > yMax - 50) gvy -= 0.05;
    const sp = Math.hypot(gvx, gvy) || 1; gvx = gvx / sp * GLIDE_SPEED; gvy = gvy / sp * GLIDE_SPEED;   // hold the pace constant
    gx += gvx; gy += gvy;
    if (gx < xMin) { gx = xMin; gvx = Math.abs(gvx); } else if (gx > xMax) { gx = xMax; gvx = -Math.abs(gvx); }
    if (gy < yMin) { gy = yMin; gvy = Math.abs(gvy); } else if (gy > yMax) { gy = yMax; gvy = -Math.abs(gvy); }
  }
  function bSize() { bW = bc.width = bc.offsetWidth; bH = bc.height = bc.offsetHeight; }
  bSize(); addEventListener('resize', bSize); addEventListener('load', bSize);

  function burstFire() {
    bP = []; const cx = bW / 2, cy = bH / 2;
    for (let i = 0; i < 100; i++) { const a = Math.random() * 6.283, sp = 1.5 + Math.random() * 5.5; bP.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, r: 1 + Math.random() * 2.2 }); }
    if (!bRAF) bRAF = requestAnimationFrame(bLoop);
  }
  function bLoop() {
    bx.clearRect(0, 0, bW, bH); let al = false;
    for (const q of bP) { if (q.life <= 0) continue; al = true; q.x += q.vx; q.y += q.vy; q.vx *= .965; q.vy *= .965; q.life -= .012; bx.globalAlpha = Math.max(0, q.life); bx.fillStyle = '#9ff3e2'; bx.beginPath(); bx.arc(q.x, q.y, q.r, 0, 7); bx.fill(); }
    bx.globalAlpha = 1; bRAF = al ? requestAnimationFrame(bLoop) : 0;
  }
  function burstReset() { bP = []; bx.clearRect(0, 0, bW, bH); }
  function finaleMode() { return urlFin || getSettings().finale; }
  function fire(m) {
    if (m === 'iris') { contact.classList.add('plp-iris'); void contact.offsetWidth; contact.classList.add('plp-lit'); ring.classList.add('plp-open'); }
    else { contact.classList.add('plp-lit'); burstFire(); }
  }
  function unfire() { contact.classList.remove('plp-lit', 'plp-iris'); ring.classList.remove('plp-open'); burstReset(); }
  function clearGlow() { for (const e of document.querySelectorAll('.plp-hl-on')) e.classList.remove('plp-hl-on'); }

  function descendTarget() {                                  // draws each underline by scroll; returns the pen tip
    const s = getSettings(), focus = innerHeight * s.focus;
    let best = null, bd = 1e9, bp = 0, br = null;
    for (const el of document.querySelectorAll('.plp-hl')) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -30 || r.top > innerHeight + 30) { el.style.backgroundSize = '0% 3px'; el.classList.remove('plp-hl-on'); continue; }
      const p = Math.max(0, Math.min(1, (focus - r.top) / Math.max(1, r.height)));
      el.style.backgroundSize = (p * 100) + '% 3px';         // underline follows the scroll (reversible)
      const cy = r.top + r.height / 2, d = Math.abs(cy - focus);
      el.classList.toggle('plp-hl-on', d < innerHeight * s.glowBand);
      if (d < bd) { bd = d; best = el; bp = p; br = r; }
    }
    if (best && bd < innerHeight * s.lockBand) { locked = true; return { x: br.left + br.width * bp, y: br.bottom + 6 }; }
    locked = false; return null;
  }

  // The left-margin lane the light descends in (Élder: stay well off the content, further
  // left). The hero FOLLOW and the bottom BLOOM are unchanged — only the descent rides here.
  function leftLane() { return Math.min(Math.max(innerWidth * 0.02, 10), 24); }

  function computeTarget(now) {
    const s = getSettings();
    const hb = hero.getBoundingClientRect().bottom;
    const live = now - mAt < 2500;
    if (phase === 'follow') {                                 // hero: follow the pointer, else glide
      locked = false; clearGlow();
      let tx, ty;
      if (live) { ease = 0.035; tx = mx; ty = my; wasLive = true; }   // follow the mouse/finger at HALF speed (Élder)
      else {
        if (wasLive) { seedGlide(now); wasLive = false; }   // seed the glide at the dot the instant the pointer leaves (no jump)
        tickGlide(now, hb); ease = 1; tx = gx; ty = gy;     // CONSTANT-speed glide: gx already advances at a fixed pace
      }
      if (hb <= ty + 2) { phase = 'descend'; detachScroll = scrollY; detachY = Math.max(40, hb); }
      // DESCEND mode only, and only while the mouse is driving toward the floor: ease toward the
      // left lane (the detach point). The idle glide stays centred (no left-lane pull).
      if (mode === 'descend' && live) { const k = Math.max(0, Math.min(1, (ty - (hb - 130)) / 130)); tx = tx + (leftLane() - tx) * k; }
      ty = Math.min(ty, hb);
      return { x: tx, y: ty };
    }
    if (scrollY <= detachScroll - 4 && hb > my) phase = 'follow';
    if (mode === 'descend') {                                 // the original: ride the scroll down the left lane
      if (armed) { locked = false; ease = s.easeArmed; clearGlow(); return { x: innerWidth * 0.5, y: innerCY }; }
      if (innerCY < innerHeight * 1.05) { locked = false; ease = s.easeApproach; clearGlow(); return { x: innerWidth * 0.5, y: Math.max(70, Math.min(innerHeight - 70, innerCY)) }; }
      descendTarget();
      locked = false; ease = s.easeFree;
      const docMax = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const dfrac = Math.max(0, Math.min(1, (scrollY - detachScroll) / Math.max(1, docMax - detachScroll)));
      return { x: leftLane(), y: 70 + dfrac * (innerHeight - 140) };
    }
    // STAY / LEAP: keep painting the underlines as the scroll passes them (Élder: they stay).
    // The dot is hidden here; park it off-screen-top centre while waiting, but once the contacts
    // have bloomed pin it AT the contacts so the fade dissolves in place (never flies back up).
    descendTarget();
    locked = false; ease = 0.08;
    return { x: innerWidth * 0.5, y: armed ? innerCY : -60 };
  }

  // The contacts reveal IS the orb: it streaks to the contacts and the ring expands from it
  // (onArm), and on the way back the ring shrinks while the dot streaks home (onDisarm) — the
  // same motion in reverse (Élder's mental model).
  function onArm(now) {
    if (mode === 'leap') { leapDir = 1; leapT0 = now; }       // streak DOWN; ring blooms when it lands
    else { fire(finaleMode()); }                              // stay + descend: bloom immediately
  }
  function onDisarm(now) {
    if (mode === 'leap') { unfire(); leapDir = -1; leapT0 = now; }  // ring shrinks + dot streaks back UP
    else { unfire(); }
  }

  function frame(now) {
    const s = getSettings();
    const heroRect = hero.getBoundingClientRect();
    const rr = cinner.getBoundingClientRect(); innerCY = rr.top + rr.height / 2;
    if (!armed && innerCY < innerHeight * s.armAt) { armed = true; onArm(now); }
    else if (armed && innerCY > innerHeight * 0.96) { armed = false; onDisarm(now); }
    const t = computeTarget(now);
    sx += (t.x - sx) * ease; sy += (t.y - sy) * ease;

    // Per-mode visibility + the LEAP. DESCEND is the original; STAY/LEAP hide the dot mid-scroll
    // so it never distracts over the content; LEAP streaks it down the centre (and back up).
    let show, soft = false;
    if (mode === 'descend') {
      show = !armed;
      soft = phase === 'descend' && !armed && !locked;
    } else if (phase === 'follow' && heroRect.bottom > 0) {
      show = true;                                            // visible hero interaction
    } else if (mode === 'leap' && leapDir !== 0) {
      const k = Math.min(1, (now - leapT0) / LEAP_MS);
      sx = innerWidth * 0.5;
      if (leapDir === 1) { sy = -50 + (innerCY + 50) * (k * k); if (k >= 1) { leapDir = 0; fire(finaleMode()); } }  // down: ease-in, then bloom
      else { sy = -50 + (innerCY + 50) * ((1 - k) * (1 - k)); if (k >= 1) leapDir = 0; }                            // up: the exact reverse path
      show = true;
    } else {
      show = false;                                           // mid-scroll/bloomed: the dot is gone (it became the ring)
    }
    spark.style.transform = 'translate(' + sx + 'px,' + sy + 'px) translate(-50%,-50%)';
    spark.classList.toggle('plp-on', show);
    spark.classList.toggle('plp-soft', soft);
    // Pass BEHIND the page content (z-index 1 < content's 2/3), except during the leap streak,
    // which must stay visible in front (Élder: "o orbe deve passar por trás dos elementos").
    spark.classList.toggle('plp-behind', !(mode === 'leap' && leapDir !== 0));

    if (heroRect.bottom > 0) {                                // constellation only while the hero is visible
      ctx.clearRect(0, 0, W, H); const c = rgb();
      const r = cv.getBoundingClientRect(); const lx = sx - r.left, ly = sy - r.top;
      for (const q of nodes) { q.x += q.vx; q.y += q.vy; if (q.x < 0 || q.x > W) q.vx *= -1; if (q.y < 0 || q.y > H) q.vy *= -1; }
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const a = nodes[i], b = nodes[j]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 135) { ctx.strokeStyle = 'rgba(' + c + ',' + (.30 * (1 - d / 135)) + ')'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
      if (show) for (const q of nodes) { const d = Math.hypot(q.x - lx, q.y - ly); if (d < 220) { ctx.strokeStyle = 'rgba(' + c + ',' + (.5 * (1 - d / 220)) + ')'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
      for (const q of nodes) { ctx.fillStyle = 'rgba(' + c + ',.55)'; ctx.beginPath(); ctx.arc(q.x, q.y, 1.6, 0, 7); ctx.fill(); }
    }
    requestAnimationFrame(frame);
  }

  // TEST ONLY: header chips (Fica / Desce / Salta) switch the behaviour live + remember it.
  // Removed before promoting to production; absent chips simply no-op.
  function setMode(m) {
    if (MODES.includes(m)) { mode = m; try { localStorage.setItem(MODE_KEY, m); } catch (e) {} }
    leapDir = 0; armed = false; unfire();
    for (const b of document.querySelectorAll('.orb-mode-chip')) b.setAttribute('aria-pressed', String(b.dataset.orbMode === mode));
  }
  for (const b of document.querySelectorAll('.orb-mode-chip')) b.addEventListener('click', () => setMode(b.dataset.orbMode));
  setMode(mode);   // reflect the restored mode on the chips

  if (reduce) { spark.classList.add('plp-on'); spark.style.transform = 'translate(' + (innerWidth * 0.5) + 'px,' + (innerHeight * 0.4) + 'px) translate(-50%,-50%)'; contact.classList.add('plp-lit'); }
  else requestAnimationFrame(frame);
}
