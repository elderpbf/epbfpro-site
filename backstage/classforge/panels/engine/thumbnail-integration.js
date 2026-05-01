// engine/thumbnail-integration.js
//
// Panels v2 adapter for the shared BackstageThumbnail module.
//
// Exports:
//
//   attachThumbnail(runtime, opts)
//     Returns a one-element sections[] for the settings drawer with an
//     "Atualizar Thumbnail" button that captures the current panel via
//     BackstageThumbnail.capture. Existing callers pass:
//       { slug, title, engine, targetSelector?, fallbackBg? }
//
// Dependencies (globals, loaded via classic <script> tags):
//   window.BackstageThumbnail  (from /backstage/js/backstage-thumbnail.js)
//   window.html2canvas         (transitive; required by BackstageThumbnail)
//
// BackstageThumbnail.capture API (from backstage-thumbnail.js):
//   capture({ slug, title, engine, targetSelector, backgroundSelector?, fallbackBg? })
//   Captures the element at targetSelector, resizes to 800x450 JPEG, uploads
//   to R2, and registers in D1 under the given slug. Auth via localStorage bs_pw_hash.

const TARGET_SELECTOR = '#pn-host';

const REQUIRED = ['slug', 'title', 'engine'];

function buildThumbnailSection(opts) {
  const btnId = 'pn-thumbnail-btn';
  const targetSelector = opts.targetSelector || TARGET_SELECTOR;
  const fallbackBg = opts.fallbackBg || '#ffffff';

  return {
    id: 'pn-thumbnail',
    title: 'Thumbnail',
    content:
      '<p class="bs-hint" style="margin-bottom:0.75rem">Captura o painel atual como imagem para o card na galeria.</p>' +
      '<button class="bs-save-btn" id="' + btnId + '">Atualizar Thumbnail</button>',
    onOpen: () => {},
    onInit: () => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        if (!window.BackstageThumbnail || typeof window.BackstageThumbnail.capture !== 'function') {
          console.warn('[panels-thumbnail-integration] BackstageThumbnail unavailable at click time');
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Capturando...';
        window.BackstageThumbnail.capture({
          slug: opts.slug,
          title: opts.title,
          engine: opts.engine,
          targetSelector,
          fallbackBg,
        });
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = 'Atualizar Thumbnail';
        }, 3000);
      });
    },
  };
}

export function attachThumbnail(runtime, options = {}) {
  for (const key of REQUIRED) {
    if (!options[key]) {
      console.warn('[panels-thumbnail-integration] missing required option: ' + key);
      return [];
    }
  }
  if (typeof window === 'undefined' || !window.BackstageThumbnail) {
    console.warn('[panels-thumbnail-integration] BackstageThumbnail unavailable; returning empty sections');
    return [];
  }
  return [buildThumbnailSection(options)];
}
