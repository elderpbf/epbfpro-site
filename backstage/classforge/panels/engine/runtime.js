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
//   panel-entered, panel-exited, navigation, theme-changed
//   (session-updated is reserved for Phase 2/3.)

const MANIFEST_KNOWN_KEYS = new Set(['id', 'title', 'theme', 'course', 'author', 'language', 'description', 'panels', 'sidebar']);
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
  let activeThemeId = null;

  // Transient panel stack (Task 4C). Each frame holds a snapshot of the
  // 4-tuple (activeSubHost, activeMeta, activeLayout, activeModules) plus
  // the transient sub-host element and the Esc key handler so they can be
  // removed cleanly on pop. Frames are never inserted into panelCache.
  const _transientStack = [];

  // Retention: 'none' (default) tears down each panel on exit. 'hidden' keeps
  // every visited panel alive in DOM, just hidden, so iframe state (e.g., a
  // Slides deck pinned at slide N) survives navigation. 'lru' is the same but
  // evicts the oldest panel once the cache exceeds retentionMaxSize.
  // Tools/layouts here use module-level singletons, so retention modes never
  // call .unmount() on cached panels -- eviction simply removes the sub-host
  // from the DOM and lets GC reclaim the detached subtree.
  const retentionMode = (options.retentionMode === 'hidden' || options.retentionMode === 'lru')
    ? options.retentionMode : 'none';
  const retentionMaxSize = (typeof options.retentionMaxSize === 'number' && options.retentionMaxSize > 0)
    ? Math.floor(options.retentionMaxSize) : 4;
  const panelCache = new Map();
  let activeSubHost = null;

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

  function setActiveTheme(themeId) {
    if (typeof themeId !== 'string' || !themeId) {
      reportError(new Error('setActiveTheme: themeId must be a non-empty string'));
      return;
    }
    activeThemeId = themeId;
    emit('theme-changed', { themeId });
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
    activeSubHost = null;
    activeMeta = null;
  }

  // Retention path: hide the active panel without unmounting. Used when we
  // need the iframe (or any other stateful DOM) to keep its state for a
  // future cache hit.
  function suspendActive() {
    if (!activeMeta) return;
    emit('panel-exited', { panelId: activeMeta.id });
    if (activeSubHost) activeSubHost.style.display = 'none';
    activeMeta = null;
    activeLayout = null;
    activeModules = [];
    activeSubHost = null;
  }

  function evictCacheEntry(entry) {
    if (entry && entry.subHost && entry.subHost.parentNode) {
      entry.subHost.parentNode.removeChild(entry.subHost);
    }
  }

  function rememberInCache(index, entry) {
    if (panelCache.has(index)) panelCache.delete(index);
    panelCache.set(index, entry);
    if (retentionMode === 'lru') {
      while (panelCache.size > retentionMaxSize) {
        const oldestKey = panelCache.keys().next().value;
        const oldestEntry = panelCache.get(oldestKey);
        panelCache.delete(oldestKey);
        evictCacheEntry(oldestEntry);
      }
    }
  }

  function mountModuleInto(declaration, kind, slots, targetArray) {
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
      (targetArray || activeModules).push({ module, container: slotEl, kind });
    } catch (e) {
      reportError(e);
    }
  }

  async function activatePanel(targetIndex) {
    if (!manifestData || targetIndex < 0 || targetIndex >= manifestData.panels.length) return false;
    const previousIndex = currentIndex;

    // Retention cache hit: panel was visited before, its sub-host is still in
    // the DOM (just hidden). Reveal it instead of remounting.
    if (retentionMode !== 'none' && panelCache.has(targetIndex)) {
      suspendActive();
      const cached = panelCache.get(targetIndex);
      if (cached.subHost) cached.subHost.style.display = '';
      activeSubHost = cached.subHost;
      activeMeta = cached.meta;
      activeLayout = cached.layout;
      activeModules = cached.modules;
      currentIndex = targetIndex;
      if (retentionMode === 'lru') {
        // Promote to most-recent so it doesn't get evicted next.
        panelCache.delete(targetIndex);
        panelCache.set(targetIndex, cached);
      }
      emit('panel-entered', { panelId: cached.meta.id, layout: cached.meta.layout, restored: true });
      return true;
    }

    // Cache miss: load + mount. retention=none tears down fully; retention
    // modes only suspend (so the previous panel stays alive in the cache).
    if (retentionMode === 'none') {
      tearDownActive();
      if (host) host.innerHTML = '';
    } else {
      suspendActive();
    }

    // Each panel gets its own sub-host inside the page-level host so retention
    // can hide siblings without disturbing them. Skipped when no DOM is
    // available (node test runs) so the runtime can still be exercised against
    // fake host objects.
    let subHost = null;
    if (host && typeof document !== 'undefined') {
      subHost = document.createElement('div');
      subHost.setAttribute('data-pn-panel-host', '');
      subHost.setAttribute('data-panel-index', String(targetIndex));
      subHost.style.minHeight = '100vh';
      host.appendChild(subHost);
    }
    const mountTarget = subHost || host;

    const entry = manifestData.panels[targetIndex];
    const panelUrl = resolvePanelUrl(entry);

    let panel;
    try {
      panel = await loadPanel(panelUrl);
    } catch (err) {
      if (subHost && subHost.parentNode) subHost.remove();
      renderDiagnostic(panelUrl, err, previousIndex);
      currentIndex = -1;
      return false;
    }

    if (!panel || !panel.meta) {
      if (subHost && subHost.parentNode) subHost.remove();
      renderDiagnostic(panelUrl, new Error('Panel missing meta'), previousIndex);
      currentIndex = -1;
      return false;
    }

    const layout = registry.getLayout(panel.meta.layout);
    if (!layout) {
      if (subHost && subHost.parentNode) subHost.remove();
      renderDiagnostic(panelUrl, new Error(`Unknown layout: ${panel.meta.layout}`), previousIndex);
      currentIndex = -1;
      return false;
    }

    let layoutHandle;
    try {
      layoutHandle = layout.mount(mountTarget, { meta: panel.meta, body: panel.body });
    } catch (e) {
      if (subHost && subHost.parentNode) subHost.remove();
      reportError(e);
      renderDiagnostic(panelUrl, e, previousIndex);
      currentIndex = -1;
      return false;
    }
    const slots = (layoutHandle && layoutHandle.slots) ? layoutHandle.slots : {};

    const builtModules = [];
    for (const decl of panel.meta.tools ?? []) {
      mountModuleInto(decl, 'tool', slots, builtModules);
    }
    for (const decl of panel.meta.elements ?? []) {
      mountModuleInto(decl, 'element', slots, builtModules);
    }

    activeMeta = panel.meta;
    activeLayout = layout;
    activeModules = builtModules;
    activeSubHost = subHost;
    currentIndex = targetIndex;

    if (retentionMode !== 'none') {
      rememberInCache(targetIndex, {
        subHost,
        layout,
        layoutHandle,
        modules: builtModules,
        meta: panel.meta,
      });
    }

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
    if (_transientStack.length > 0) popTransient();
    if (!manifestData || currentIndex >= manifestData.panels.length - 1) return false;
    const from = currentIndex;
    const to = currentIndex + 1;
    const ok = await activatePanel(to);
    if (ok) emit('navigation', { from, to, direction: 'next' });
    return ok;
  }

  async function prev() {
    if (_transientStack.length > 0) popTransient();
    if (!manifestData || currentIndex <= 0) return false;
    const from = currentIndex;
    const to = currentIndex - 1;
    const ok = await activatePanel(to);
    if (ok) emit('navigation', { from, to, direction: 'prev' });
    return ok;
  }

  async function goto(index) {
    if (_transientStack.length > 0) popTransient();
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

  function dispose() {
    detachKeyboard();
    // Pop any open transients before full teardown.
    while (_transientStack.length > 0) popTransient();
    if (retentionMode !== 'none') {
      for (const cachedEntry of panelCache.values()) evictCacheEntry(cachedEntry);
      panelCache.clear();
    }
    tearDownActive();
  }

  // ---------------------------------------------------------------------------
  // Transient panel stack (Task 4C)
  // ---------------------------------------------------------------------------

  // Push a transient overlay panel onto the active sub-host. The underlying
  // panel is hidden (not unmounted) and restored on pop.
  //
  // options:
  //   layout   -- layoutId string (required)
  //   tools    -- array of tool declarations { id, slot?, config? }
  //   elements -- array of element declarations { id, slot?, config? }
  //   meta     -- optional meta object forwarded to layout.mount
  function pushTransientPanel({ layout: layoutId, tools = [], elements = [], meta = {} } = {}) {
    if (!host || typeof document === 'undefined') return;

    const layout = registry.getLayout(layoutId);
    if (!layout) {
      reportError(new Error(`pushTransientPanel: unknown layout "${layoutId}"`));
      return;
    }

    // Snapshot the current active 4-tuple.
    const snapshot = {
      subHost:  activeSubHost,
      meta:     activeMeta,
      layout:   activeLayout,
      modules:  activeModules,
    };

    // Hide (not destroy) the current panel.
    if (activeSubHost) activeSubHost.style.display = 'none';

    // Create a fresh transient sub-host as a sibling of the existing hosts.
    const transientHost = document.createElement('div');
    transientHost.setAttribute('data-pn-panel-host', '');
    transientHost.setAttribute('data-transient', '');
    transientHost.style.minHeight = '100vh';
    transientHost.style.position = 'relative';
    host.appendChild(transientHost);

    // Mount layout + modules into the transient host.
    let layoutHandle;
    try {
      layoutHandle = layout.mount(transientHost, { meta, body: null });
    } catch (e) {
      reportError(e);
      transientHost.remove();
      if (snapshot.subHost) snapshot.subHost.style.display = '';
      return;
    }
    const slots = (layoutHandle && layoutHandle.slots) ? layoutHandle.slots : {};

    const transientModules = [];
    for (const decl of tools) {
      mountModuleInto(decl, 'tool', slots, transientModules);
    }
    for (const decl of elements) {
      mountModuleInto(decl, 'element', slots, transientModules);
    }

    // Render the Voltar chrome button inside the transient host.
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'pn-sidebar-transient-back';
    backBtn.textContent = 'Voltar';
    transientHost.appendChild(backBtn);

    // Esc key handler -- pop this transient on Escape.
    const escHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); popTransient(); }
    };
    document.addEventListener('keydown', escHandler);
    backBtn.addEventListener('click', () => popTransient());

    // Update active 4-tuple to point at the transient.
    activeSubHost = transientHost;
    activeMeta    = meta;
    activeLayout  = layout;
    activeModules = transientModules;

    _transientStack.push({
      snapshot,
      transientHost,
      transientModules,
      layout,
      layoutHandle,
      escHandler,
    });
  }

  // Pop the top-most transient frame and restore the underlying panel.
  function popTransient() {
    if (_transientStack.length === 0) return;
    const frame = _transientStack.pop();

    // Unmount transient modules in reverse order.
    for (let i = frame.transientModules.length - 1; i >= 0; i--) {
      try { frame.transientModules[i].module.unmount(); } catch (e) { reportError(e); }
    }

    // Unmount transient layout.
    if (frame.layoutHandle && typeof frame.layout.unmount === 'function') {
      try { frame.layout.unmount(frame.transientHost); } catch (e) { reportError(e); }
    }

    // Remove transient sub-host from DOM.
    if (frame.transientHost && frame.transientHost.parentNode) {
      frame.transientHost.parentNode.removeChild(frame.transientHost);
    }

    // Remove Esc listener.
    document.removeEventListener('keydown', frame.escHandler);

    // Restore active 4-tuple.
    const s = frame.snapshot;
    activeSubHost = s.subHost;
    activeMeta    = s.meta;
    activeLayout  = s.layout;
    activeModules = s.modules;

    if (activeSubHost) activeSubHost.style.display = '';
  }

  return {
    start, next, prev, goto, dispose,
    setActiveTheme,
    pushTransientPanel, popTransient,
    eventBus,
    get currentIndex() { return currentIndex; },
    get panelCount() { return manifestData ? manifestData.panels.length : 0; },
    get manifest() { return manifestData; },
    get currentMeta() { return activeMeta; },
    get currentTheme() { return activeThemeId; },
    get retentionMode() { return retentionMode; },
    get cachedPanelIndices() { return Array.from(panelCache.keys()); },
    get _isTransientActive() { return _transientStack.length > 0; },
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
