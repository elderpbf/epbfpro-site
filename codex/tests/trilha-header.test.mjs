// codex/trilha/js/pensoia-header.js — pure bits. The custom element upgrade +
// ThemeManager wiring are verified on staging; here we pin the bar markup (the
// .ph-* class contract the shared public-header.css styles) and the zoom clamp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeaderHtml, clampZoom } from '../trilha/js/pensoia-header.js';

test('buildHeaderHtml: emits the .ph-* bar structure', () => {
  const html = buildHeaderHtml();
  for (const cls of ['ph-bar', 'ph-left', 'ph-logo', 'ph-exit-btn', 'ph-title',
    'ph-right', 'ph-code-btn', 'ph-theme-btn', 'ph-theme-icon']) {
    assert.match(html, new RegExp('class="[^"]*' + cls), `has .${cls}`);
  }
  // The A−/A+ text-zoom buttons were removed (they only served the retired GO page).
  assert.ok(!/ph-zoom/.test(html), 'no zoom buttons in the bar');
  // The logo is now the PensoIA brand wordmark (inline SVG, a theme-aware
  // light/dark pair) wrapped in a link to pensoia.com, not the old text node.
  assert.match(html, /<a class="ph-logo"[^>]*href="https:\/\/pensoia\.com"/, 'logo links to pensoia.com');
  assert.match(html, /ph-logo-light/, 'has the light-theme mark');
  assert.match(html, /ph-logo-dark/, 'has the dark-theme mark');
  assert.match(html, /<svg/, 'renders the inline brand wordmark SVG');
});

test('clampZoom: clamps into [-4, 12], NaN -> 0', () => {
  assert.equal(clampZoom(0), 0);
  assert.equal(clampZoom(-99), -4);
  assert.equal(clampZoom(99), 12);
  assert.equal(clampZoom(5), 5);
  assert.equal(clampZoom(NaN), 0);
});
