// codex/js/cloud-status.js
// The Cloudflare usage indicator: a cloud on the top bar that is green, yellow or red by how much
// of the account's caps is spent (the free plan's daily ones, or Workers Paid's monthly allowances,
// whichever the platform says the account is on: `data.plan`, since 2026-10-16), and a panel with everything the platform's warning
// e-mail says. Élder, 2026-10-12: during a class he is on this screen, not in his inbox, and the
// account is shared by every project, so the cue has to be where he already is, on every tab.
//
// SOURCE-AGNOSTIC, like the bell (notif-bell.js): the caller injects `fetchUsage`, so this file
// names no facade and no action, and another project can mount it with its own fetch. The numbers
// come from the platform's `limits` module, which keeps them at most 5 minutes old.
//
// Refresh: on mount, every REFRESH_MS while the tab is visible (paused when it is hidden), when
// the tab comes back after REFRESH_MS, and on every open of the panel.
import { esc } from './dom.js';
import { relTime } from './rel-time.js';
import { glyphSvg } from './glyphs.js';

const CLOUD_SVG = glyphSvg('cloud', { size: null });
export const REFRESH_MS = 5 * 60 * 1000;
export const WARN_PCT = 50;
export const ALERT_PCT = 80;

// PURE. 'ok' | 'warn' | 'alert' | 'unknown' for a limits/get answer. The highest cap decides; a
// runaway resource is at least a warning, because it is the early sign before any cap.
export function levelOf(data) {
  if (!data || !data.ok || !Array.isArray(data.caps)) return 'unknown';
  const top = Math.max(0, ...data.caps.map((c) => c.pct || 0));
  if (top >= ALERT_PCT) return 'alert';
  if (top >= WARN_PCT || (data.alerts && data.alerts.runaway && data.alerts.runaway.length)) return 'warn';
  return 'ok';
}

// PURE. The cap with the highest share, for the button's tooltip.
export function topCap(data) {
  const caps = (data && data.caps) || [];
  return caps.reduce((a, c) => (!a || (c.pct || 0) > (a.pct || 0) ? c : a), null);
}

const LEVEL_OF_PCT = (pct) => (pct >= ALERT_PCT ? 'alert' : pct >= WARN_PCT ? 'warn' : 'ok');
const num = (n) => Math.round(n || 0).toLocaleString('pt-BR');

// The platform labels caps in Portuguese; the dictionary wins when it has the key.
function capLabel(c, t) {
  const k = 'cloud.cap.' + c.key;
  const v = t(k);
  return v && v !== k ? v : c.label;
}
function metricLabel(m, t) {
  const k = 'cloud.metric.' + m;
  const v = t(k);
  return v && v !== k ? v : m;
}

// PURE (given t). The panel's inner HTML for a limits/get answer.
export function panelHTML(data, t, now = Math.floor(Date.now() / 1000)) {
  if (!data || !data.ok) {
    return '<div class="cdx-cloud-empty">' + esc(t('cloud.unavailable')) + '</div>';
  }
  const capOf = Object.fromEntries((data.caps || []).map((c) => [c.key, c]));
  // Workers Paid: the caps are the billing period so far, and passing one is billed, not blocked.
  const paid = !!(data.plan && data.plan.name === 'paid');
  let html = '';

  // 1. Today's alerts: what crossed 50% / 80%, and what is far above its usual day.
  const alertCaps = (data.alerts && data.alerts.caps) || [];
  const runaway = (data.alerts && data.alerts.runaway) || [];
  html += '<div class="cdx-cloud-sec">' + esc(t('cloud.alerts')) + '</div>';
  if (!alertCaps.length && !runaway.length) {
    html += '<div class="cdx-cloud-none">' + esc(t('cloud.no_alerts')) + '</div>';
  } else {
    for (const c of alertCaps) {
      html += '<div class="cdx-cloud-alert cdx-cloud--' + LEVEL_OF_PCT(c.pct) + '">' +
        esc(capLabel(c, t)) + ': <strong>' + esc(String(c.pct)) + '%</strong> ' +
        esc(t(paid ? 'cloud.of_allowance' : 'cloud.of_limit')) + '</div>';
    }
    for (const r of runaway) {
      html += '<div class="cdx-cloud-alert cdx-cloud--warn">' + esc(r.name) + ' (' + esc(r.owner) + '): ' +
        esc(num(r.now)) + ' ' + esc(metricLabel(r.metric, t)) + ', ' + esc(t('cloud.usual')) + ' ' + esc(num(r.median)) + '</div>';
    }
  }

  // 2. Each daily cap, as a bar.
  html += '<div class="cdx-cloud-sec">' + esc(t(paid ? 'cloud.limits_month' : 'cloud.limits')) + '</div>';
  for (const c of data.caps || []) {
    const lvl = LEVEL_OF_PCT(c.pct || 0);
    const extra = c.overage_usd > 0 ? ' · ' + t('cloud.overage') + ' US$ ' + c.overage_usd.toFixed(2) : '';
    html += '<div class="cdx-cloud-cap">' +
      '<div class="cdx-cloud-caprow"><span>' + esc(capLabel(c, t)) + '</span>' +
      '<span class="cdx-cloud-capnum">' + esc(num(c.used)) + ' / ' + esc(num(c.limit)) + ' · ' + esc(String(c.pct || 0)) + '%' + esc(extra) + '</span></div>' +
      '<div class="cdx-cloud-bar"><span class="cdx-cloud-fill cdx-cloud--' + lvl + '" style="width:' + Math.min(100, c.pct || 0) + '%"></span></div>' +
    '</div>';
  }

  // 3. Every service, heaviest first (by its share of the cap it counts against).
  const used = (data.resources || []).filter((r) => r.value > 0);
  html += '<div class="cdx-cloud-sec">' + esc(t('cloud.services')) + '</div>';
  if (!used.length) {
    html += '<div class="cdx-cloud-none">' + esc(t('cloud.no_usage')) + '</div>';
  } else {
    for (const r of used) {
      // The name is cut with an ellipsis to fit the panel; hovering the row shows it whole.
      html += '<div class="cdx-cloud-res" title="' + esc(r.name + ' (' + r.owner + ')') + '">' +
        '<span class="cdx-cloud-resname">' + esc(r.name) + ' <span class="cdx-cloud-owner">' + esc(r.owner) + '</span></span>' +
        '<span class="cdx-cloud-resnum">' + esc(num(r.value)) + ' ' + esc(metricLabel(r.metric, t)) +
        ' · ' + esc(String(r.share_pct)) + '%</span>' +
      '</div>';
    }
  }

  // 4. The last days, to compare today with a normal one: the two caps that have ever mattered.
  // On the paid plan a day against a monthly allowance rounds to 0%, so the days show raw numbers.
  const hist = data.history || [];
  if (hist.length) {
    const pctOf = (totals, key) => {
      if (paid) return num(totals[key] || 0);
      const c = capOf[key];
      return (c ? Math.round(((totals[key] || 0) / c.limit) * 1000) / 10 : 0) + '%';
    };
    html += '<div class="cdx-cloud-sec">' + esc(t('cloud.history')) + '</div>';
    html += '<div class="cdx-cloud-hist"><span></span><span>' + esc(t('cloud.cap.d1_rows_read')) + '</span><span>' + esc(t('cloud.cap.requests')) + '</span></div>';
    for (const h of hist) {
      html += '<div class="cdx-cloud-hist"><span>' + esc(h.date.slice(8, 10) + '/' + h.date.slice(5, 7)) + '</span>' +
        '<span>' + esc(String(pctOf(h.totals, 'd1_rows_read'))) + '</span><span>' + esc(String(pctOf(h.totals, 'requests'))) + '</span></div>';
    }
  }

  // 5. When it was measured, and when it resets.
  const foot = [];
  if (data.as_of) foot.push(t('cloud.updated') + ' ' + relTime(data.as_of, now));
  if (data.stale) foot.push(t('cloud.stale'));
  if (data.resets_at) {
    const d = new Date(data.resets_at * 1000);
    foot.push(paid
      ? t('cloud.renews') + ' ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') +
        ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      : t('cloud.resets') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
  }
  html += '<div class="cdx-cloud-foot">' + esc(foot.join(' · ')) + '</div>';
  return html;
}

// createCloudStatus(opts) -> { el, refresh, destroy }
//   fetchUsage: () => Promise<limits/get answer>
//   t:          (key) => string
//   btnClass:   extra class for the button (defaults to the topbar icon button)
export function createCloudStatus({ fetchUsage, t, btnClass = 'bs-icon-btn' }) {
  const wrap = document.createElement('div');
  wrap.className = 'cdx-cloud-wrap';
  wrap.innerHTML =
    '<button type="button" class="' + btnClass + ' cdx-cloud-btn cdx-cloud--unknown" aria-label="' + esc(t('cloud.title')) + '" title="' + esc(t('cloud.title')) + '">' + CLOUD_SVG + '</button>' +
    '<div class="cdx-cloud-panel" hidden role="dialog" aria-label="' + esc(t('cloud.title')) + '">' +
      '<div class="cdx-cloud-head"><span class="cdx-cloud-title">' + esc(t('cloud.title')) + '</span></div>' +
      '<div class="cdx-cloud-body"></div>' +
    '</div>';
  const btn = wrap.querySelector('.cdx-cloud-btn');
  const panel = wrap.querySelector('.cdx-cloud-panel');
  const body = wrap.querySelector('.cdx-cloud-body');
  let _data = null;
  let _at = 0;

  function paintButton() {
    const lvl = levelOf(_data);
    btn.className = btnClass + ' cdx-cloud-btn cdx-cloud--' + lvl;
    const top = topCap(_data);
    btn.title = lvl === 'unknown' || !top
      ? t('cloud.title') + ': ' + t('cloud.unavailable')
      : t('cloud.title') + ': ' + capLabel(top, t) + ' ' + top.pct + '%';
  }

  async function refresh() {
    let res;
    try { res = await fetchUsage(); } catch (_) { res = null; }
    // A failed refresh keeps the last good answer: a network blip must not turn the cue grey.
    if (res && res.ok) _data = res; else if (!_data) _data = res;
    _at = Date.now();
    paintButton();
    if (!panel.hidden) body.innerHTML = panelHTML(_data, t);
  }

  function openPanel() {
    panel.hidden = false;
    body.innerHTML = panelHTML(_data, t);
    document.addEventListener('click', onOutside, true);
    document.addEventListener('keydown', onEsc);
    refresh();
  }
  function closePanel() { panel.hidden = true; document.removeEventListener('click', onOutside, true); document.removeEventListener('keydown', onEsc); }
  function onOutside(e) { if (!wrap.contains(e.target)) closePanel(); }
  function onEsc(e) { if (e.key === 'Escape') closePanel(); }
  btn.addEventListener('click', (e) => { if (e.stopPropagation) e.stopPropagation(); if (panel.hidden) openPanel(); else closePanel(); });

  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const timer = setInterval(() => { if (visible()) refresh(); }, REFRESH_MS);
  const onVisible = () => { if (visible() && Date.now() - _at >= REFRESH_MS) refresh(); };
  document.addEventListener('visibilitychange', onVisible);
  refresh();

  return {
    el: wrap,
    refresh,
    destroy() { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); closePanel(); },
  };
}
