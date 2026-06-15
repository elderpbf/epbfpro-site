// js/orb.js — "A Luz": constellation in the hero, descending light that traces the
// highlights, finale that reveals the contacts. Ported value-for-value from the mock;
// the only change is that tunable numbers come from orb-settings (defaults = the mock).
import { getSettings } from './orb-settings.js?v=6';

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
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; mAt = performance.now(); }, { passive: true });
  function rgb() { return getComputedStyle(document.documentElement).getPropertyValue('--line-rgb').trim() || '125,232,214'; }

  let phase = 'follow', detachScroll = 0, detachY = innerHeight * 0.4, locked = false, ease = 0.08;
  const urlFin = (location.search.match(/finale=(iris|part)/) || [])[1];
  let armed = false, bP = [], bRAF = 0, bW = 0, bH = 0, innerCY = 0;
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

  function computeTarget(now) {
    const s = getSettings();
    const hb = hero.getBoundingClientRect().bottom;
    const live = now - mAt < 2500;
    if (phase === 'follow') {                                 // follows mouse/finger, even scrolling, until the hero floor
      locked = false; ease = s.easeFollow; clearGlow();
      let tx = live ? mx : innerWidth * 0.5, ty = live ? my : innerHeight * 0.40;
      if (hb <= ty + 2) { phase = 'descend'; detachScroll = scrollY; detachY = Math.max(40, hb); }
      const k = Math.max(0, Math.min(1, (ty - (hb - 130)) / 130));
      tx = tx + (innerWidth * 0.5 - tx) * k; ty = Math.min(ty, hb);
      return { x: tx, y: ty };
    }
    if (scrollY <= detachScroll - 4 && hb > my) phase = 'follow';
    if (armed) { locked = false; ease = s.easeArmed; clearGlow(); return { x: innerWidth * 0.5, y: innerCY }; }
    if (innerCY < innerHeight * 1.05) { locked = false; ease = s.easeApproach; clearGlow(); return { x: innerWidth * 0.5, y: Math.max(70, Math.min(innerHeight - 70, innerCY)) }; }
    const f = descendTarget();
    if (f) { ease = s.easeLock; return f; }
    ease = s.easeFree;                                        // free: wanders slowly (vaga-lume figure-eight)
    return { x: innerWidth * 0.5 + Math.sin(now * s.wanderFreq) * Math.min(s.wanderXCap, innerWidth * s.wanderX),
             y: innerHeight * 0.5 + Math.sin(now * s.wanderYFreq + 1.57) * s.wanderY };
  }

  function frame(now) {
    const s = getSettings();
    const rr = cinner.getBoundingClientRect(); innerCY = rr.top + rr.height / 2;
    if (!armed && innerCY < innerHeight * s.armAt) { armed = true; fire(finaleMode()); }
    else if (armed && innerCY > innerHeight * 0.96) { armed = false; unfire(); }
    const t = computeTarget(now);
    sx += (t.x - sx) * ease; sy += (t.y - sy) * ease;
    const wob = (phase === 'descend' && !locked && !armed) ? 1 : 0;
    const wx = sx + Math.cos(now * 0.0016) * s.wobble * wob, wy = sy + Math.sin(now * 0.0022) * s.wobble * wob;
    spark.style.transform = 'translate(' + wx + 'px,' + wy + 'px) translate(-50%,-50%)';
    spark.classList.toggle('plp-on', !armed);
    spark.classList.toggle('plp-soft', phase === 'descend' && !armed && !locked);
    if (hero.getBoundingClientRect().bottom > 0) {            // constellation only while the hero is visible
      ctx.clearRect(0, 0, W, H); const c = rgb();
      const r = cv.getBoundingClientRect(); const lx = sx - r.left, ly = sy - r.top;
      for (const q of nodes) { q.x += q.vx; q.y += q.vy; if (q.x < 0 || q.x > W) q.vx *= -1; if (q.y < 0 || q.y > H) q.vy *= -1; }
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const a = nodes[i], b = nodes[j]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 135) { ctx.strokeStyle = 'rgba(' + c + ',' + (.30 * (1 - d / 135)) + ')'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
      for (const q of nodes) { const d = Math.hypot(q.x - lx, q.y - ly); if (d < 220) { ctx.strokeStyle = 'rgba(' + c + ',' + (.5 * (1 - d / 220)) + ')'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
      for (const q of nodes) { ctx.fillStyle = 'rgba(' + c + ',.55)'; ctx.beginPath(); ctx.arc(q.x, q.y, 1.6, 0, 7); ctx.fill(); }
    }
    requestAnimationFrame(frame);
  }

  if (reduce) { spark.classList.add('plp-on'); spark.style.transform = 'translate(' + (innerWidth * 0.5) + 'px,' + (innerHeight * 0.4) + 'px) translate(-50%,-50%)'; contact.classList.add('plp-lit'); }
  else requestAnimationFrame(frame);
}
