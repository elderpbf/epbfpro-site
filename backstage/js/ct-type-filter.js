'use strict';

// Shared type-filter chip strip used by both the admin Items panel
// and the public student page. Same DOM contract on both sides;
// each consumer styles the chips through its own CSS theme.

window.CT_TYPE_FILTER = (function() {

  function _esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // opts:
  //   container     DOM element to render into
  //   types         [{slug, label, icon}]  (full type registry)
  //   items         [{type}]               (what's currently in the list)
  //   selectedSlug  string | null          (null = "Todos")
  //   onChange      function(slug | null)  (called on chip click)
  //   allLabel      optional: text for the "all" chip (default "Todos")
  function render(opts) {
    var counts = {};
    var total = 0;
    var i;
    for (i = 0; i < opts.items.length; i++) {
      var t = opts.items[i].type;
      counts[t] = (counts[t] || 0) + 1;
      total++;
    }

    var visible = (opts.types || []).filter(function(ty) { return counts[ty.slug]; });
    var allLabel = opts.allLabel || 'Todos';

    var html = '';
    html += _chip(null, allLabel, '', total, opts.selectedSlug == null);
    for (i = 0; i < visible.length; i++) {
      var ty = visible[i];
      html += _chip(ty.slug, ty.label, ty.icon, counts[ty.slug], opts.selectedSlug === ty.slug);
    }
    opts.container.innerHTML = html;

    opts.container.querySelectorAll('.ct-tf-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var slug = btn.dataset.slug || null;
        if (slug === '') slug = null;
        if (typeof opts.onChange === 'function') opts.onChange(slug);
      });
    });
  }

  // A type's icon is owned by the type itself, stored as "glyph:<key>" (resolved
  // to an inline SVG by the Codex glyph library) or a legacy emoji. We reach that
  // library through the window.CdxGlyphs global so this shared chip strip renders
  // identically wherever it is mounted (Codex, Trilha, ClassVault). When the global
  // is absent we fall back to escaped text, so an emoji still renders.
  function _iconHtml(icon) {
    if (!icon) return '';
    var inner = (window.CdxGlyphs && typeof window.CdxGlyphs.iconHtml === 'function')
      ? window.CdxGlyphs.iconHtml(icon, { size: 15 })
      : _esc(icon);
    return '<span class="ct-tf-icon">' + inner + '</span>';
  }

  function _chip(slug, label, icon, count, active) {
    return '<button type="button" class="ct-tf-chip' + (active ? ' active' : '') +
      '" data-slug="' + (slug == null ? '' : _esc(slug)) + '">' +
        _iconHtml(icon) +
        '<span class="ct-tf-label">' + _esc(label) + '</span>' +
        '<span class="ct-tf-count">' + count + '</span>' +
      '</button>';
  }

  // Apply a slug filter to an item array. Pure helper so both pages
  // can do the filtering identically.
  function apply(items, slug) {
    if (slug == null) return items;
    return items.filter(function(it) { return it.type === slug; });
  }

  return { render: render, apply: apply };

})();
