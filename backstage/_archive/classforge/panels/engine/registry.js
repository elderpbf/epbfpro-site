// engine/registry.js
//
// Registration API for tools, elements, layouts, and themes. Modules
// self-register on import; the runtime asks the registry by id at mount time.
// Re-registering an id replaces the prior entry and emits a console.warn,
// so a double-import does not silently corrupt state.
//
// Public:
//   registerTool/Element/Layout/Theme(module)
//   getTool/Element/Layout/Theme(id)   -- returns module or null
//   listByKind(kind)
//   resetRegistry()                    -- test-only escape hatch
//   registry                           -- shaped object the runtime consumes

const KINDS = ['tool', 'element', 'layout', 'theme'];

const store = {
  tool: new Map(),
  element: new Map(),
  layout: new Map(),
  theme: new Map(),
};

function register(kind, module) {
  if (!module || typeof module !== 'object') {
    throw new Error(`register ${kind}: module must be an object`);
  }
  if (typeof module.id !== 'string' || !module.id) {
    throw new Error(`register ${kind}: module.id must be a non-empty string`);
  }
  if (module.kind && module.kind !== kind) {
    throw new Error(`register ${kind}: module.kind ("${module.kind}") does not match`);
  }
  const map = store[kind];
  if (map.has(module.id) && typeof console !== 'undefined') {
    console.warn(`[panels-registry] ${kind} "${module.id}" re-registered; replacing previous entry`);
  }
  map.set(module.id, { ...module, kind });
}

export function registerTool(m)    { register('tool', m); }
export function registerElement(m) { register('element', m); }
export function registerLayout(m)  { register('layout', m); }
export function registerTheme(m)   { register('theme', m); }

export function getTool(id)    { return store.tool.get(id) ?? null; }
export function getElement(id) { return store.element.get(id) ?? null; }
export function getLayout(id)  { return store.layout.get(id) ?? null; }
export function getTheme(id)   { return store.theme.get(id) ?? null; }

export function listByKind(kind) {
  if (!KINDS.includes(kind)) throw new Error(`listByKind: unknown kind "${kind}"`);
  return Array.from(store[kind].values());
}

export function resetRegistry() {
  for (const map of Object.values(store)) map.clear();
}

export const registry = { getTool, getElement, getLayout, getTheme, listByKind };
