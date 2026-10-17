// tests/cloud-status.test.mjs
// The Cloudflare usage indicator (js/cloud-status.js): the pure level and panel rendering, plus
// the source contract (source-agnostic like the bell; the topbar mounts it with the facade; the
// page links its stylesheet). The live look is checked by screenshot on the preview.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { levelOf, topCap, panelHTML, WARN_PCT, ALERT_PCT, REFRESH_MS } from '../js/cloud-status.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const t = (k) => k;
const cap = (key, pct, limit = 100000) => ({ key, label: key, limit, used: Math.round(limit * pct / 100), pct });
const answer = (over = {}) => ({
  ok: true, as_of: 1000, stale: false, resets_at: 1791936000,
  caps: [cap('d1_rows_read', 10, 5000000), cap('requests', 20)],
  alerts: { caps: [], runaway: [] },
  resources: [], history: [], ...over
});

test('green under 50%, yellow from 50%, red from 80%', () => {
  assert.equal(WARN_PCT, 50);
  assert.equal(ALERT_PCT, 80);
  assert.equal(levelOf(answer()), 'ok');
  assert.equal(levelOf(answer({ caps: [cap('requests', 50)] })), 'warn');
  assert.equal(levelOf(answer({ caps: [cap('requests', 79.9)] })), 'warn');
  assert.equal(levelOf(answer({ caps: [cap('requests', 80)] })), 'alert');
});

test('a runaway service is at least yellow, before any cap moves', () => {
  assert.equal(levelOf(answer({ alerts: { caps: [], runaway: [{ name: 'x' }] } })), 'warn');
});

test('no answer, or a failed one, is unknown (grey), never green', () => {
  assert.equal(levelOf(null), 'unknown');
  assert.equal(levelOf({ ok: false, error: 'usage_unavailable' }), 'unknown');
});

test('topCap is the cap with the highest share', () => {
  assert.equal(topCap(answer()).key, 'requests');
});

test('the panel lists alerts first, then the caps, then every used service in the given order', () => {
  const html = panelHTML(answer({
    caps: [cap('d1_rows_read', 85, 5000000), cap('requests', 20)],
    alerts: { caps: [cap('d1_rows_read', 85, 5000000)], runaway: [{ name: 'platform-db', owner: 'platform', metric: 'rows_read', now: 900000, median: 100000 }] },
    resources: [
      { name: 'classpulse-db', owner: 'codex', metric: 'rows_read', value: 4000000, share_pct: 80 },
      { name: 'codex-api', owner: 'codex', metric: 'requests', value: 9000, share_pct: 9 },
      { name: 'idle-db', owner: 'x', metric: 'rows_read', value: 0, share_pct: 0 }
    ],
    history: [{ date: '2026-10-12', totals: { d1_rows_read: 250000, requests: 10000 } }]
  }), t, 1060);
  const at = (s) => html.indexOf(s);
  assert.ok(at('cloud.alerts') < at('cloud.limits') && at('cloud.limits') < at('cloud.services'));
  assert.match(html, /cdx-cloud-alert cdx-cloud--alert/);
  assert.match(html, /platform-db \(platform\)/);
  assert.ok(at('classpulse-db') < at('codex-api'), 'heaviest first, as the platform ranked them');
  assert.ok(!html.includes('idle-db'), 'a service that used nothing is not listed');
  assert.match(html, /12\/10/);
  assert.match(html, /5%/, 'history shows 250k of 5M as 5%');
});

test('on Workers Paid the panel speaks of the month: allowance, renewal date, overage, raw days', () => {
  const html = panelHTML(answer({
    plan: { name: 'paid', period: 'month', period_start: 1791504000, period_end: 1794182400 },
    resets_at: 1794182400,
    caps: [
      { key: 'd1_rows_read', label: 'x', limit: 25000000000, used: 8600000, pct: 0, overage_usd: 0 },
      { key: 'requests', label: 'x', limit: 10000000, used: 11000000, pct: 110, overage_usd: 0.3 }
    ],
    history: [{ date: '2026-10-12', totals: { d1_rows_read: 250000, requests: 10000 } }]
  }), t, 1060);
  assert.match(html, /cloud\.limits_month/);
  assert.ok(!html.includes('cloud.limits<'), 'not the daily header');
  assert.match(html, /cloud\.overage US\$ 0\.30/);
  // The billing period ends at 00:00 UTC, said in the browser's clock (21:00 on the 8th in Sergipe).
  const end = new Date(1794182400 * 1000);
  const p2 = (n) => String(n).padStart(2, '0');
  assert.ok(html.includes('cloud.renews ' + p2(end.getDate()) + '/' + p2(end.getMonth() + 1) + ' ' + p2(end.getHours()) + ':' + p2(end.getMinutes())));
  assert.match(html, /250\.000/, 'a day against a monthly allowance shows its number, not 0%');
});

test('a quiet day says so instead of an empty section', () => {
  const html = panelHTML(answer(), t);
  assert.match(html, /cloud\.no_alerts/);
  assert.match(html, /cloud\.no_usage/);
});

test('an unavailable answer renders one line, not a broken panel', () => {
  assert.match(panelHTML({ ok: false }, t), /cloud\.unavailable/);
});

test('names are escaped', () => {
  const html = panelHTML(answer({ resources: [{ name: '<img>', owner: 'x', metric: 'requests', value: 1, share_pct: 0 }] }), t);
  assert.ok(!html.includes('<img>'));
});

test('hovering a service row shows its full name, which the panel cuts with an ellipsis', () => {
  const name = 'pages-worker--15277640-production';
  const html = panelHTML(answer({ resources: [{ name, owner: 'pages', metric: 'requests', value: 9, share_pct: 1 }] }), t);
  assert.ok(html.includes('class="cdx-cloud-res" title="' + name + ' (pages)"'));
});

test('refreshes every 5 minutes', () => { assert.equal(REFRESH_MS, 300000); });

test('cloud-status is source-agnostic (no facade, no action named)', () => {
  const src = read('../js/cloud-status.js');
  assert.ok(!/codex-api\.js|callWorker|cloud_usage/.test(src));
  assert.match(src, /fetchUsage/);
  assert.match(src, /visibilityState/, 'pauses while the tab is hidden');
});

test('the topbar mounts it with the facade, and the page links its stylesheet', () => {
  const bar = read('../js/codex-topbar.js');
  assert.match(bar, /createCloudStatus\(\{ fetchUsage: \(\) => cloudApi\.usage\(/);
  assert.match(read('../js/codex-api.js'), /usage: \(p\) => call\('cloud_usage', p\)/);
  assert.match(read('../index.html'), /css\/cloud-status\.css/);
});
