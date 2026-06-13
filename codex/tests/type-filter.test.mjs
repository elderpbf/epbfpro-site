// codex/js/type-filter.js — Codex-owned type-filter chip strip (cdx- port of the
// legacy CT_TYPE_FILTER global). Emits the SAME .ct-tf-* markup the Trail/admin
// CSS already styles. The pure helpers (applyTypeFilter / chipHtml /
// buildFilterHtml) are unit-tested here; the DOM render + click wiring is
// verified on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTypeFilter,
  chipHtml,
  buildFilterHtml,
} from '../js/type-filter.js';

// ── applyTypeFilter (pure) ───────────────────────────────────────────────────
test('applyTypeFilter: null slug -> all items, slug -> matching only', () => {
  const items = [{ type: 'prompt' }, { type: 'guide' }, { type: 'prompt' }];
  assert.equal(applyTypeFilter(items, null).length, 3);
  assert.deepEqual(applyTypeFilter(items, 'prompt'), [{ type: 'prompt' }, { type: 'prompt' }]);
  assert.deepEqual(applyTypeFilter(items, 'missing'), []);
});

// ── chipHtml (pure) ──────────────────────────────────────────────────────────
test('chipHtml: active class, escaped label, count, empty data-slug for "all"', () => {
  const all = chipHtml(null, 'Todos', '', 7, true);
  assert.match(all, /class="ct-tf-chip active"/);
  assert.match(all, /data-slug=""/);
  assert.match(all, /ct-tf-label">Todos/);
  assert.match(all, /ct-tf-count">7/);

  const one = chipHtml('a&b', 'Guia <x>', '', 2, false);
  assert.match(one, /class="ct-tf-chip"/);          // not active
  assert.match(one, /data-slug="a&amp;b"/);          // slug escaped
  assert.match(one, /ct-tf-label">Guia &lt;x&gt;/);  // label escaped
});

test('chipHtml: no icon span when icon is empty', () => {
  assert.ok(!/ct-tf-icon/.test(chipHtml('a', 'A', '', 1, false)));
});

// ── buildFilterHtml (pure) ───────────────────────────────────────────────────
test('buildFilterHtml: all chip carries the total, only present types show', () => {
  const html = buildFilterHtml({
    types: [
      { slug: 'prompt', label: 'Prompt', icon: '' },
      { slug: 'guide', label: 'Guia', icon: '' },
      { slug: 'paper', label: 'Paper', icon: '' }, // absent from items -> hidden
    ],
    items: [{ type: 'prompt' }, { type: 'prompt' }, { type: 'guide' }],
    selectedSlug: null,
  });
  // "all" chip total = 3
  assert.match(html, /data-slug=""[^]*ct-tf-count">3/);
  // prompt count 2, guide count 1, paper not rendered
  assert.match(html, /data-slug="prompt"[^]*ct-tf-count">2/);
  assert.match(html, /data-slug="guide"[^]*ct-tf-count">1/);
  assert.ok(!/data-slug="paper"/.test(html), 'types with zero items are hidden');
});

test('buildFilterHtml: selectedSlug marks the active chip', () => {
  const html = buildFilterHtml({
    types: [{ slug: 'prompt', label: 'Prompt', icon: '' }],
    items: [{ type: 'prompt' }],
    selectedSlug: 'prompt',
  });
  assert.match(html, /class="ct-tf-chip active" data-slug="prompt"/);
});
