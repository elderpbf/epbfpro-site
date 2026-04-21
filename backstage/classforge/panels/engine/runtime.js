// engine/runtime.js
//
// Panels Engine v2 runtime. Loads a presentation manifest, fetches each panel
// HTML, activates the declared layout, mounts declared tools and elements into
// named slots, and broadcasts lifecycle events on an event bus. Built for
// dependency injection so it can be exercised under node without a DOM.
//
// Public:
//   createRuntime({ manifest, host, registry, loadPanel, eventBus?, onError? })
//   defaultLoadPanel(panelUrl)   -- browser-only loader using fetch + DOMParser
//
// Lifecycle events broadcast on eventBus and forwarded to active modules' onEvent:
//   panel-entered, panel-exited, navigation
//   (theme-changed and session-updated are reserved for Phase 2.)

const MANIFEST_KNOWN_KEYS = new Set(['id', 'title', 'theme', 'course', 'author', 'language', 'description', 'panels']);
const PANEL_KNOWN_KEYS    = new Set(['src', 'url', 'path', 'id', 'title']);

export function validateManifest(data) {
  if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
    console.warn('[panels-runtime] manifest is not an object');
    return;
  }
  if (typeof data.id !== 'string' || !data.id) {
    console.warn('[panels-runtime] manifest missing required field: id');
  }
  if (!Array.isArray(data.panels) || data.panels.length === 0) {
    console.warn('[panels-runtime] manifest missing required field: panels (non-empty array)');
  }
  for (const key of Object.keys(data)) {
    if (!MANIFEST_KNOWN_KEYS.has(key)) {
      console.warn(`[panels-runtime] manifest has unknown key: ${key}`);
    }
  }
  if (Array.isArray(data.panels)) {
    for (let i = 0; i < data.panels.length; i++) {
      const entry = data.panels[i];
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        for (const key of Object.keys(entry)) {
          if (!PANEL_KNOWN_KEYS.has(key)) {
            console.warn(`[panels-runtime] panels[${i}] has unknown key: ${key}`);
          }
        }
      }
    }
  }
}

export function createRuntime(options = {}) {
  const {
    manifest,
    host,
    registry,
    loadPanel,
    eventBus = new EventTarget(),
    onError,
  } = options;

  if (!registry) throw new Error('createRuntime: registry is required');
  if (!loadPanel) throw new Error('createRuntime: loadPanel is required');

  let manifestData = manifest && typeof manifest === 'object' && !Array.isArray(manifest) ? manifest : null;
  if (manifestData) validateManifest(manifestData);
  let currentIndex = -1;
  let activeModules = [];
  let activeLayout = null;
  let activeMeta = null;

  function reportError(err) {
    if (typeof onError === 'function') onError(err);
    else if (typeof console !== 'undefined') console.error('[panels-runtime]', err);
  }

  function emit(type, detail) {
    eventBus.dispatchEvent(new CustomEvent(type, { detail }));
    const evt = { type, detail };
    if (activeLayout && typeof activeLayout.onEvent === 'function') {
      try { activeLayout.onEvent(evt); } catch (e) { reportError(e); }
    }
    for (const entry of activeModules) {
      if (typeof entry.module.onEvent === 'function') {
        try { entry.module.onEvent(evt); } catch (e) { reportError(e); }
      }
    }
  }

  async function loadManifest() {
    if (manifestData) return manifestData;
    if (typeof manifest !== 'string') {
      throw new Error('createRuntime: manifest must be an object or a URL string');
    }
    const res = await fetch(manifest);
    if (!res.ok) throw new Error(`Failed to load manifest from ${manifest}: HTTP ${res.status}`);
    manifestData = await res.json();
    validateManifest(manifestData);
    return manifestData;
  }

  function resolvePanelUrl(entry) {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') return entry.src ?? entry.url ?? entry.path;
    throw new Error(`Invalid panel entry: ${JSON.stringify(entry)}`);
  }

  function tearDownActive() {
    if (!activeMeta) return;
    emit('panel-exited', { panelId: activeMeta.id });
    for (let i = activeModules.length - 1; i >= 0; i--) {
      try { activeModules[i].module.unmount(); } catch (e) { reportError(e); }
    }
    activeModules = [];
    if (activeLayout) {
      try { activeLayout.unmount(); } catch (e) { reportError(e); }
      activeLayout = null;
    }
    activeMeta = null;
  }

  function mountModuleInto(declaration, kind, slots) {
    const lookup = kind === 'tool' ? registry.getTool : registry.getElement;
    const module = lookup.call(registry, declaration.id);
    if (!module) {
      reportError(new Error(`Unknown ${kind}: ${declaration.id}`));
      return;
    }
    const slotName = declaration.slot ?? 'default';
    const slotEl = slots[slotName];
    if (!slotEl) {
      reportError(new Error(`Slot "${slotName}" not provided by layout for ${kind} "${declaration.id}"`));
      return;
    }
    try {
      module.mount(slotEl, declaration.config ?? {});
      activeModules.push({ module, container: slotEl, kind });
    } catch (e) {
      reportError(e);
    }
  }

  async function activatePanel(targetIndex) {
    if (!manifestData || targetIndex < 0 || targetIndex >= manifestData.panels.length) return false;
    const previousIndex = currentIndex;

    tearDownActive();
    if (host) host.innerHTML = '';

    const entry = manifestData.panels[targetIndex];
    const panelUrl = resolvePanelUrl(entry);

    let panel;
    try {
      panel = await loadPanel(panelUrl);
    } catch (err) {
      renderDiagnostic(panelUrl, err, previousIndex);
      currentIndex = -1;
      return false;
    }

    if (!panel || !panel.meta) {
      renderDiagnostic(panelUrl, new Error('Panel missing meta'), previousIndex);
      currentIndex = -1;
      return false;
    }

    const layout = registry.getLayout(panel.meta.layout);
    if (!layout) {
      renderDiagnostic(panelUrl, new Error(`Unknown layout: ${panel.meta.layout}`), previousIndex);
      currentIndex = -1;
      return false;
    }

    activeMeta = panel.meta;
    activeLayout = layout;

    let layoutHandle;
    try {
      layoutHandle = layout.mount(host, { meta: panel.meta, body: panel.body });
    } catch (e) {
      reportError(e);
      activeMeta = null;
      activeLayout = null;
      renderDiagnostic(panelUrl, e, previousIndex);
      currentIndex = -1;
      return false;
    }
    const slots = (layoutHandle && layoutHandle.slots) ? layoutHandle.slots : {};

    for (const decl of panel.meta.tools ?? []) {
      mountModuleInto(decl, 'tool', slots);
    }
    for (const decl of panel.meta.elements ?? []) {
      mountModuleInto(decl, 'element', slots);
    }

    currentIndex = targetIndex;
    emit('panel-entered', { panelId: panel.meta.id, layout: panel.meta.layout });
    return true;
  }

  function renderDiagnostic(panelPath, err, fallbackIndex) {
    if (!host) return;
    const safePath = escapeHtml(String(panelPath));
    const safeMsg = escapeHtml(String(err && err.message ? err.message : err));
    host.innerHTML =
      '<div class="pn-diagnostic" role="alert">' +
        '<h2>Panel failed to load</h2>' +
        `<p>Path: <code>${safePath}</code></p>` +
        `<pre>${safeMsg}</pre>` +
        '<button type="button" data-pn-action="back">Back</button>' +
      '</div>';
    if (typeof host.querySelector === 'function') {
      const back = host.querySelector('[data-pn-action="back"]');
      if (back && typeof back.addEventListener === 'function') {
        back.addEventListener('click', () => {
          if (fallbackIndex >= 0) activatePanel(fallbackIndex);
        });
      }
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  }

  async function start() {
    await loadManifest();
    if (!manifestData.panels || manifestData.panels.length === 0) {
      throw new Error('Manifest has no panels');
    }
    return activatePanel(0);
  }

  async function next() {
    if (!manifestData || currentIndex >= manifestData.panels.length - 1) return false;
    const from = currentIndex;
    const to = currentIndex + 1;
    const ok = await activatePanel(to);
    if (ok) emit('navigation', { from, to, direction: 'next' });
    return ok;
  }

  async function prev() {
    if (!manifestData || currentIndex <= 0) return false;
    const from = currentIndex;
    const to = currentIndex - 1;
    const ok = await activatePanel(to);
    if (ok) emit('navigation', { from, to, direction: 'prev' });
    return ok;
  }

  async function goto(index) {
    if (!manifestData || index < 0 || index >= manifestData.panels.length) return false;
    if (index === currentIndex) return false;
    const from = currentIndex;
    const ok = await activatePanel(index);
    if (ok) emit('navigation', { from, to: index, direction: index > from ? 'next' : 'prev' });
    return ok;
  }

  // Keyboard navigation (Task 1E). Document-level keydown handler:
  //   ArrowRight / Space / PageDown -> next()
  //   ArrowLeft / PageUp            -> prev()
  //   Home / End                    -> first / last panel
  //   Digits 1-9                    -> panel at that 1-based position
  //   Digit 0                       -> panel position 10
  //   Escape                        -> reserved for Phase 2 settings drawer (no-op)
  // Suppressed when focus is in an input/textarea/contenteditable.
  let detachKeyboard = () => {};
  if (options.keyboard !== false && typeof document !== 'undefined') {
    const handler = (e) => {
      const t = e.target;
      if (t && t.tagName && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const key = e.key;
      if (key === 'ArrowRight' || key === 'PageDown' || key === ' ' || e.code === 'Space') {
        e.preventDefault(); next();
      } else if (key === 'ArrowLeft' || key === 'PageUp') {
        e.preventDefault(); prev();
      } else if (key === 'Home') {
        e.preventDefault(); goto(0);
      } else if (key === 'End') {
        if (manifestData) { e.preventDefault(); goto(manifestData.panels.length - 1); }
      } else if (/^[0-9]$/.test(key)) {
        const pos = key === '0' ? 10 : parseInt(key, 10);
        const idx = pos - 1;
        if (manifestData && idx >= 0 && idx < manifestData.panels.length) {
          e.preventDefault(); goto(idx);
        }
      }
    };
    document.addEventListener('keydown', handler);
    detachKeyboard = () => document.removeEventListener('keydown', handler);
  }

  function dispose() { detachKeyboard(); }

  return {
    start, next, prev, goto, dispose,
    eventBus,
    get currentIndex() { return currentIndex; },
    get panelCount() { return manifestData ? manifestData.panels.length : 0; },
    get manifest() { return manifestData; },
    get currentMeta() { return activeMeta; },
  };
}

// Browser default panel loader. Fetches a panel HTML file, parses it via
// DOMParser, extracts the panel-meta JSON block and the [data-panel-body] subtree.
export async function defaultLoadPanel(panelUrl) {
  const res = await fetch(panelUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${panelUrl}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const metaScript = doc.getElementById('panel-meta');
  if (!metaScript) throw new Error(`panel-meta block missing in ${panelUrl}`);
  let meta;
  try { meta = JSON.parse(metaScript.textContent); }
  catch (e) { throw new Error(`panel-meta JSON invalid in ${panelUrl}: ${e.message}`); }
  const bodyEl = doc.querySelector('[data-panel-body]');
  return { meta, body: bodyEl, bodyHtml: bodyEl ? bodyEl.innerHTML : '' };
}
