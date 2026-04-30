// engine/thumbnail-integration.js
//
// Panels v2 adapter for the shared BackstageThumbnail module.
//
// Exports:
//
//   attachThumbnail(runtime, opts)
//     Returns a one-element sections[] for the settings drawer with an
//     "Atualizar Thumbnail" button that captures the current panel via
//     BackstageThumbnail.capture. Also contains the "Capturar miniaturas"
//     button that triggers captureAll(). Existing callers pass:
//       { slug, title, engine, targetSelector?, fallbackBg? }
//
//   attachThumbnailAuto(runtime, { slug })
//     Subscribes to panel-entered on runtime.eventBus. After a 1500ms settle
//     delay, auto-captures DOM panels (skips Slides panels, noCapture:true,
//     and slugs already captured this session).
//
//   getThumbnailUrl(slug, panelId)  -- async
//     Fetches the thumbnail URL from D1 via the backstage-api worker (or
//     returns from an in-memory cache keyed by "slug:panelId"). Returns null
//     when no thumbnail is stored.
//
//   captureAll(runtime, { slug })
//     Walks all non-Slides panels in the manifest and captures each one by
//     navigating to it and calling BackstageThumbnail.capture. Skips panels
//     with noCapture:true.
//
// Dependencies (globals, loaded via classic <script> tags):
//   window.BackstageThumbnail  (from /backstage/js/backstage-thumbnail.js)
//   window.html2canvas         (transitive; required by BackstageThumbnail)
//
// BackstageThumbnail.capture API (from backstage-thumbnail.js):
//   capture({ slug, title, engine, targetSelector, backgroundSelector?, fallbackBg? })
//   Captures the element at targetSelector, resizes to 800x450 JPEG, uploads
//   to R2, and registers in D1 under the given slug. Auth via localStorage bs_pw_hash.

// ---- constants ----------------------------------------------------------------

const WORKER_URL = 'https://backstage-api.pensoia.workers.dev';
const TARGET_SELECTOR = '#pn-host';
const CAPTURE_DELAY_MS = 1500;

const REQUIRED = ['slug', 'title', 'engine'];

// ---- session-level dedup cache ------------------------------------------------

// Keyed by "slug:panelId". Populated on successful auto-capture so we never
// re-capture the same panel twice in one session.
const _capturedThisSession = new Set();

// ---- thumbnail URL in-memory cache -------------------------------------------

// Keyed by "slug:panelId" -> URL string (or null if confirmed absent).
const _urlCache = new Map();

// ---- helpers ------------------------------------------------------------------

function _isSlidesPanel(meta) {
  return Array.isArray(meta && meta.tools) && meta.tools.some(t => t.id === 'slides-embed');
}

function _shouldSkipCapture(meta) {
  if (!meta) return true;
  if (meta.noCapture === true) return true;
  if (_isSlidesPanel(meta)) return true;
  return false;
}

// Resolve the panel id from a manifest entry (which may be a string path or an
// object with an id field). Falls back to a zero-padded index string.
function _panelId(entry, index) {
  if (entry && typeof entry === 'object' && entry.id) return entry.id;
  return 'panel-' + String(index + 1).padStart(2, '0');
}

// ---- getThumbnailUrl ----------------------------------------------------------

export async function getThumbnailUrl(slug, panelId) {
  const key = slug + ':' + panelId;
  if (_urlCache.has(key)) return _urlCache.get(key);

  const auth = (typeof localStorage !== 'undefined' ? localStorage.getItem('bs_pw_hash') : '') || '';
  try {
    const resp = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'get_thumbnail',
        auth_token: auth,
        slug,
        panel_id: panelId,
      }),
    });
    const data = await resp.json();
    // Worker returns { ok: true, url: '...' } or { ok: false } / { url: null }
    const url = (data && data.ok && data.url) ? data.url : null;
    _urlCache.set(key, url);
    return url;
  } catch (err) {
    console.warn('[panels-thumbnail-integration] getThumbnailUrl failed for ' + key, err);
    return null;
  }
}

// ---- captureAll ---------------------------------------------------------------

export async function captureAll(runtime, { slug } = {}) {
  if (!slug) { console.warn('[panels-thumbnail-integration] captureAll: slug required'); return; }
  if (!window.BackstageThumbnail || typeof window.BackstageThumbnail.capture !== 'function') {
    console.warn('[panels-thumbnail-integration] captureAll: BackstageThumbnail unavailable');
    return;
  }
  const manifest = runtime.manifest;
  if (!manifest || !Array.isArray(manifest.panels)) return;

  const panels = manifest.panels;
  for (let i = 0; i < panels.length; i++) {
    const entry = panels[i];
    const panelMeta = runtime.currentIndex === i ? runtime.currentMeta : null;

    // Navigate to the panel.
    await runtime.goto(i);
    // Give the panel 1500ms to settle.
    await new Promise(r => setTimeout(r, CAPTURE_DELAY_MS));

    const meta = runtime.currentMeta;
    if (_shouldSkipCapture(meta)) continue;

    const panelId = (meta && meta.id) ? meta.id : _panelId(entry, i);
    const key = slug + ':' + panelId;
    if (_capturedThisSession.has(key)) continue;

    const title = (meta && meta.title) || (manifest.title) || slug;

    await window.BackstageThumbnail.capture({
      slug: slug + '--' + panelId,   // per-panel slug so each gets its own R2 object
      title,
      engine: 'panels',
      targetSelector: TARGET_SELECTOR,
      fallbackBg: '#ffffff',
    });

    _capturedThisSession.add(key);
    // Bust the URL cache so menu cards pick up the new image.
    _urlCache.delete(key);
  }
}

// ---- attachThumbnailAuto ------------------------------------------------------

export function attachThumbnailAuto(runtime, { slug } = {}) {
  if (!slug) { console.warn('[panels-thumbnail-integration] attachThumbnailAuto: slug required'); return; }

  let pendingTimer = null;
  let pendingPanelId = null;

  runtime.eventBus.addEventListener('panel-exited', () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
      pendingPanelId = null;
    }
  });

  runtime.eventBus.addEventListener('panel-entered', () => {
    // Cancel any previous pending capture.
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }

    const meta = runtime.currentMeta;
    if (_shouldSkipCapture(meta)) return;

    const panelId = (meta && meta.id) ? meta.id : ('panel-' + (runtime.currentIndex + 1));
    const key = slug + ':' + panelId;

    // Skip if already captured this session.
    if (_capturedThisSession.has(key)) return;

    // Skip 'hidden' retention panels that have already been captured.
    if (runtime.retentionMode === 'hidden' && _capturedThisSession.has(key)) return;

    pendingPanelId = panelId;
    pendingTimer = setTimeout(async () => {
      pendingTimer = null;
      // Guard: meta may have changed (navigation happened during the delay).
      const currentMeta = runtime.currentMeta;
      if (!currentMeta || currentMeta.id !== meta.id) return;
      if (_capturedThisSession.has(key)) return;
      if (!window.BackstageThumbnail || typeof window.BackstageThumbnail.capture !== 'function') return;

      const manifest = runtime.manifest;
      const title = (currentMeta && currentMeta.title) || (manifest && manifest.title) || slug;

      await window.BackstageThumbnail.capture({
        slug: slug + '--' + panelId,
        title,
        engine: 'panels',
        targetSelector: TARGET_SELECTOR,
        fallbackBg: '#ffffff',
      });

      _capturedThisSession.add(key);
      _urlCache.delete(key);
    }, CAPTURE_DELAY_MS);
  });
}

// ---- attachThumbnail (settings drawer section, backward-compat) ---------------

function buildThumbnailSection(opts, runtime) {
  const btnId = 'pn-thumbnail-btn';
  const captureAllBtnId = 'pn-thumbnail-capture-all-btn';
  const captureAllStatusId = 'pn-thumbnail-capture-all-status';
  const targetSelector = opts.targetSelector || TARGET_SELECTOR;
  const fallbackBg = opts.fallbackBg || '#ffffff';
  const slug = opts.slug;

  return {
    id: 'pn-thumbnail',
    title: 'Thumbnail',
    content:
      '<p class="bs-hint" style="margin-bottom:0.75rem">Captura o painel atual como imagem para o card na galeria.</p>' +
      '<button class="bs-save-btn" id="' + btnId + '">Atualizar Thumbnail</button>' +
      '<hr style="margin:1rem 0;border:none;border-top:1px solid var(--bs-border,#333)">' +
      '<p class="bs-hint" style="margin-bottom:0.75rem">Captura automaticamente todos os painéis DOM (ignora slides e painéis com noCapture).</p>' +
      '<button class="bs-save-btn" id="' + captureAllBtnId + '">Capturar miniaturas</button>' +
      '<p id="' + captureAllStatusId + '" class="bs-hint" style="margin-top:0.5rem;display:none"></p>',
    onOpen: () => {},
    onInit: () => {
      // "Atualizar Thumbnail" -- captures current panel manually.
      const btn = document.getElementById(btnId);
      if (btn) {
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
      }

      // "Capturar miniaturas" -- walks all DOM panels.
      const captureAllBtn = document.getElementById(captureAllBtnId);
      const captureAllStatus = document.getElementById(captureAllStatusId);
      if (captureAllBtn) {
        captureAllBtn.addEventListener('click', async () => {
          if (!window.BackstageThumbnail || typeof window.BackstageThumbnail.capture !== 'function') {
            console.warn('[panels-thumbnail-integration] BackstageThumbnail unavailable at click time');
            return;
          }
          captureAllBtn.disabled = true;
          captureAllBtn.textContent = 'Capturando...';
          if (captureAllStatus) {
            captureAllStatus.style.display = '';
            captureAllStatus.textContent = 'Iniciando...';
          }

          const manifest = runtime && runtime.manifest;
          const panels = manifest && Array.isArray(manifest.panels) ? manifest.panels : [];
          let done = 0;
          const total = panels.filter((entry, i) => {
            // We don't have meta at this point so we count all non-Slides-by-title entries.
            // The actual skip happens in captureAll; this is just a progress denominator.
            return true;
          }).length;

          const originalIndex = runtime ? runtime.currentIndex : -1;

          try {
            await captureAll(runtime, { slug });
          } finally {
            // Restore the panel the user was on before the walk.
            if (runtime && originalIndex >= 0 && runtime.currentIndex !== originalIndex) {
              await runtime.goto(originalIndex);
            }
            captureAllBtn.disabled = false;
            captureAllBtn.textContent = 'Capturar miniaturas';
            if (captureAllStatus) {
              captureAllStatus.textContent = 'Concluido.';
              setTimeout(() => { captureAllStatus.style.display = 'none'; }, 3000);
            }
          }
        });
      }
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
  return [buildThumbnailSection(options, runtime)];
}
