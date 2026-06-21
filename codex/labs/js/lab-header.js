/* PensoLabs shared header module.
   Mounts the brand (light/dark logo) + title/subtitle into any
   .lab-header[data-lab-title] placeholder on the page.
   Optional right-side widget = any child you put inside the
   placeholder BEFORE this script runs (e.g. K3's meter); the
   CSS auto-detects the third child and expands to 3 columns.

   Usage:
     <script src="../js/lab-header.js?v=1.0" defer></script>
     <div class="lab-header"
          data-lab-title="Janela de contexto"
          data-lab-subtitle="Orçamento total: 128.000 tokens">
       <!-- optional widget child -->
     </div>

   Assets:
     ../assets/logo-light.svg  (glyph-wordmark_bg.transp)
     ../assets/logo-dark.svg   (glyph-wordmark_bg.navy)
   Path is relative to the lab page, which sits at
   /backstage/labs/<key>/index.html — same depth for every lab.
*/
(function () {
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c];
    });
  }

  function mount() {
    var nodes = document.querySelectorAll('.lab-header[data-lab-title]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.dataset.labMounted === '1') continue;
      el.dataset.labMounted = '1';

      var title = el.dataset.labTitle || '';
      var sub = el.dataset.labSubtitle || '';

      // Build the title wrap.
      var titleWrap = document.createElement('div');
      titleWrap.className = 'lab-title-wrap';
      titleWrap.innerHTML =
        '<h1 class="lab-title">' + escapeHtml(title) +
        (sub ? '<span class="lab-title-sub">' + escapeHtml(sub) + '</span>' : '') +
        '</h1>';

      // Build the brand block (light + dark logo, CSS swaps).
      var brand = document.createElement('div');
      brand.className = 'lab-brand';
      brand.innerHTML =
        '<img class="lab-logo lab-logo--light" src="../assets/logo-light.svg" alt="PensoIA" />' +
        '<img class="lab-logo lab-logo--dark"  src="../assets/logo-dark.svg"  alt="PensoIA" />';

      // Prepend brand and title in that order, before any existing
      // children (which become the right-side widget slot).
      el.insertBefore(titleWrap, el.firstChild);
      el.insertBefore(brand, el.firstChild);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }

  // Expose for manual remount (e.g. if a host injects another lab-header
  // dynamically). Idempotent thanks to data-lab-mounted guard.
  window.LabHeader = { mount: mount };
})();
