// engine/thumbnail-integration.js
//
// Panels v2 adapter for the shared BackstageThumbnail module. Returns a
// one-element sections[] for the settings drawer with an "Atualizar
// Thumbnail" button that captures the current panel (#pn-host by default)
// and registers it under the Panels v2 engine.
//
// Consumers concatenate the result with attachSettings before passing to
// attachTopbar's `sections` option:
//
//   const sections = [
//     ...attachSettings(runtime, { slug }),
//     ...attachThumbnail(runtime, { slug, title, engine, targetSelector }),
//   ];
//   attachTopbar(runtime, { title, backLink, sections });
//
// Dependencies (globals, loaded via classic <script> tags):
//   window.BackstageThumbnail  (from /backstage/js/backstage-thumbnail.js)
//   window.html2canvas         (transitive; required by BackstageThumbnail)

const REQUIRED = ['slug', 'title', 'engine'];

function buildThumbnailSection(opts) {
  const btnId = 'pn-thumbnail-btn';
  const targetSelector = opts.targetSelector || '#pn-host';
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
