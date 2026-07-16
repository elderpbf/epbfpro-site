// adapters/imageStore.js — the GALLERY image store: the ONE swap point for "where do the
// bytes go". In the deployed app it uploads to R2 via the slides facade (upload_image) and
// returns a light, persistent URL; with no slug yet (a never-saved deck) or on ANY failure
// it falls back to embedding a data URL, so adding an image never hard-fails. Injected into
// the editor as ctx.imageStore (same pattern as the store / library / aiService adapters),
// so the vendored core never imports the facade itself. The R2 object lands at
// classforge/<slug>/<filename>, served back through the facade's assetUrl.
// Globals: window.bsLog (debug pill, backstage/js/debug.js)
import { assetUrl, slides as slidesApi } from '../../../js/codex-api.js';
import { fileToBase64, makeDataUrlStore } from '../js/core/files.js';
import { uid } from '../js/core/schema.js';

// File extension from the name, else from the MIME type, else png.
function extOf(file) {
  const m = /\.([a-z0-9]+)$/i.exec((file && file.name) || '');
  if (m) return m[1].toLowerCase();
  const sub = ((file && file.type) || '').split('/')[1];
  return (sub || 'png').toLowerCase();
}

export function createImageStore({ facade, getSlug } = {}) {
  const api = facade || slidesApi;
  const fallback = makeDataUrlStore();
  return {
    async put(file) {
      const slug = typeof getSlug === 'function' ? getSlug() : null;
      // R2 path: only when we have both a backend AND a deck slug to scope the object.
      if (api && api.uploadImage && slug) {
        try {
          const filename = 'gallery-' + uid() + '.' + extOf(file);
          const data_base64 = await fileToBase64(file);
          const res = await api.uploadImage({ slug, filename, data_base64, content_type: file.type || 'image/png' });
          if (res && res.ok) {
            return { url: assetUrl('/r2/classforge/' + slug + '/' + filename), name: file.name || '' };
          }
        } catch (e) {
          // The data-URL fallback below keeps the upload working, so this is a warn,
          // not an error. It must still reach the pill: silently degrading to a fat
          // inline image is exactly the failure nobody notices until a deck is huge.
          if (window.bsLog) window.bsLog('imageStore R2: ' + ((e && e.message) || e), 'warn');
        }
      }
      return fallback.put(file);
    },
  };
}
