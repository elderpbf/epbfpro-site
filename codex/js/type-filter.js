// Codex-owned type-filter chip strip.
//
// cdx- port of the legacy backstage CT_TYPE_FILTER global. Emits the SAME
// .ct-tf-* markup the Trail and admin CSS already style, so the chips render
// identically; only the code shape changed (IIFE global -> ES module + pure
// builders). Used by the Trail (Aulas "Outros" sections + the Outros tab); the
// admin Items panel still uses the backstage global for now.
//
// Public API:
//   renderTypeFilter({ container, types, items, selectedSlug, onChange, allLabel })
//   applyTypeFilter(items, slug)
// The pure builders (chipHtml / buildFilterHtml) + applyTypeFilter are unit-
// tested; the DOM render + click wiring is verified on staging.

// Globals (shared Backstage scripts, loaded before the module boot):
//   window.CdxGlyphs (icon library, set by the HTML boot)

export function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// A type's icon is "glyph:<key>" (resolved to an inline SVG by the Codex glyph
// library) or a legacy emoji. We reach the library through window.CdxGlyphs so
// the strip renders identically wherever mounted; absent it, escaped text keeps
// an emoji rendering.
function iconHtml(icon) {
  if (!icon) return '';
  const inner = (typeof window !== 'undefined' && window.CdxGlyphs && typeof window.CdxGlyphs.iconHtml === 'function')
    ? window.CdxGlyphs.iconHtml(icon, { size: 15 })
    : esc(icon);
  return '<span class="ct-tf-icon">' + inner + '</span>';
}

// PURE. A single chip button.
export function chipHtml(slug, label, icon, count, active) {
  return '<button type="button" class="ct-tf-chip' + (active ? ' active' : '') +
    '" data-slug="' + (slug == null ? '' : esc(slug)) + '">' +
      iconHtml(icon) +
      '<span class="ct-tf-label">' + esc(label) + '</span>' +
      '<span class="ct-tf-count">' + count + '</span>' +
    '</button>';
}

// PURE. The full chip strip: an "all" chip carrying the total, then one chip per
// type that is actually present in `items`.
export function buildFilterHtml(opts) {
  const counts = {};
  let total = 0;
  for (let i = 0; i < opts.items.length; i++) {
    const t = opts.items[i].type;
    counts[t] = (counts[t] || 0) + 1;
    total++;
  }
  const visible = (opts.types || []).filter((ty) => counts[ty.slug]);
  const allLabel = opts.allLabel || 'Todos';

  let html = chipHtml(null, allLabel, '', total, opts.selectedSlug == null);
  for (let i = 0; i < visible.length; i++) {
    const ty = visible[i];
    html += chipHtml(ty.slug, ty.label, ty.icon, counts[ty.slug], opts.selectedSlug === ty.slug);
  }
  return html;
}

// Render into opts.container and wire chip clicks to opts.onChange(slug | null).
export function renderTypeFilter(opts) {
  opts.container.innerHTML = buildFilterHtml(opts);
  opts.container.querySelectorAll('.ct-tf-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      let slug = btn.dataset.slug || null;
      if (slug === '') slug = null;
      if (typeof opts.onChange === 'function') opts.onChange(slug);
    });
  });
}

// PURE. Filter an item array by slug (null = all). Both pages filter identically.
export function applyTypeFilter(items, slug) {
  if (slug == null) return items;
  return items.filter((it) => it.type === slug);
}
