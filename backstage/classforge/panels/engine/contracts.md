# Panels Engine v2 -- Contracts

**Purpose.** Normative reference for module, registry, runtime, event, panel, and manifest
contracts exposed by the Panels v2 engine. Use this document when authoring a tool, element,
layout, theme, or presentation. Every claim below reflects the current Phase 1 implementation
in `engine/runtime.js` and `engine/registry.js`.

**Audience.** Module authors and integrators working inside
`Site/backstage/classforge/panels/`. Not a tutorial. Not a design narrative (see
`ClassForge/manifest/ARCHITECTURE.md` for that).

**Status.** Phase 1 bedrock, frozen 2026-04-21. Additive evolution only. Breaking changes
require an engine version bump (see Versioning Note).

---

## Module Contract

Every tool, element, and layout is a plain object registered with the registry. The shape is:

```js
{
  id: 'hello-world-tool',   // required, non-empty string, unique within its kind
  kind: 'tool',             // optional but must match the registrar if present
  mount(container, config) { /* ... */ },
  unmount() { /* ... */ },
  onEvent(evt) { /* optional */ },
}
```

Signatures:

- `mount(container, config)` -- tools and elements only. `container` is the DOM element the
  layout exposed as a slot. `config` is the plain object declared on the panel-meta entry
  (`declaration.config ?? {}`). Return value is ignored for tools and elements.
- `mount(host, { meta, body })` -- layouts only. `host` is the runtime host element. `meta`
  is the panel meta object parsed from the panel HTML. `body` is the `[data-panel-body]`
  Element (or `null`, depending on the loader). The layout MUST return an object of the
  shape `{ slots }`, where `slots` is a map from slot name to DOM element. Missing slots is
  treated as `{}`.
- `unmount()` -- tools, elements, and layouts. No arguments, return value ignored. Remove
  DOM, detach listeners, cancel timers, free references.
- `onEvent(evt)` -- optional. `evt` is `{ type, detail }`. The runtime forwards every event
  it emits (see Event Bus) to the active layout first, then to every active tool and element
  in mount order.

Rules:

- `mount` runs exactly once per activation.
- `unmount` runs exactly once per deactivation. The runtime wraps both `mount` and `unmount`
  in `try/catch`; a throw is reported to `onError` but does not halt teardown of sibling
  modules. `unmount` MUST be safe to run after a partial `mount`.
- `onEvent` throws are caught and reported; they do not break fan-out to other modules.
- A module MUST NOT read from or write to another module's internal state. Cross-module
  communication goes through `config` at mount time or the engine event bus at runtime.
- A module MUST render only inside the `container` (or layout `host`) it receives. No
  global DOM mutation, no listeners attached to `document` or `window` beyond what the
  engine itself owns.

---

## Registry Contract

The registry is a module-level singleton in `engine/registry.js`. Four kinds are supported:
`tool`, `element`, `layout`, `theme`.

Registrars:

```js
registerTool(module)
registerElement(module)
registerLayout(module)
registerTheme(module)
```

Each registrar validates and inserts the module. Validation errors are thrown synchronously:

- `module` must be a non-null object: `register <kind>: module must be an object`.
- `module.id` must be a non-empty string: `register <kind>: module.id must be a non-empty string`.
- If `module.kind` is set, it must equal the registrar's kind: `register <kind>: module.kind ("X") does not match`.

On success the registry stores a shallow copy of the module with `kind` set to the
registrar's kind. Re-registering an id for the same kind REPLACES the previous entry and
emits `console.warn('[panels-registry] <kind> "<id>" re-registered; replacing previous entry')`.
Registration is idempotent in the sense that a double-import does not corrupt state; the
last registration wins.

Getters:

```js
getTool(id)     // returns the stored module, or null on miss
getElement(id)  // returns the stored module, or null on miss
getLayout(id)   // returns the stored module, or null on miss
getTheme(id)    // returns the stored module, or null on miss
```

Getters never throw on miss; they return `null`. The runtime treats `null` as an
unrecoverable module resolution error and renders a diagnostic (see Runtime Contract).

Enumeration:

```js
listByKind(kind)  // returns Array of registered modules of that kind
```

`listByKind` throws `listByKind: unknown kind "<kind>"` if `kind` is not one of
`tool | element | layout | theme`.

Test escape hatch:

```js
resetRegistry()  // clears all four stores; intended for tests only
```

The runtime consumes the registry through the shaped export
`registry = { getTool, getElement, getLayout, getTheme, listByKind }`.

---

## Runtime Contract

`createRuntime(options)` builds a runtime instance. Options:

- `manifest` -- required. Either a plain object `{ id, title, theme?, panels: [...] }` or a
  URL string that will be fetched and JSON-parsed on `start()`. Arrays and other non-object
  non-string values are rejected at `start()` time.
- `host` -- the DOM element the runtime writes into. Optional in node/test contexts; when
  absent, diagnostics are suppressed.
- `registry` -- required. The shaped object from `engine/registry.js` or an equivalent.
  Throws `createRuntime: registry is required` if missing.
- `loadPanel` -- required. An async function `(panelUrl) => { meta, body, bodyHtml? }`.
  Throws `createRuntime: loadPanel is required` if missing. Use `defaultLoadPanel` in
  browser contexts.
- `eventBus` -- optional. Defaults to a new `EventTarget`. Injected for tests.
- `onError` -- optional. `(err) => void`. Defaults to `console.error('[panels-runtime]', err)`.
- `keyboard` -- optional boolean. When `false`, the runtime does not attach a document-level
  keydown handler. Default behavior binds handlers when `document` is defined.

Returned object:

```js
{
  start(),                         // async, loads manifest and activates panel 0
  next(),                          // async boolean; advances one panel or returns false
  prev(),                          // async boolean; retreats one panel or returns false
  goto(index),                     // async boolean; jumps to index or returns false
  dispose(),                       // detaches keyboard listeners
  eventBus,                        // the EventTarget events are dispatched on
  get currentIndex,                // integer; -1 before start or after a failed activation
  get panelCount,                  // integer; 0 before the manifest has loaded
  get manifest,                    // the loaded manifest object, or null before load
  get currentMeta,                 // the active panel meta object, or null when none active
}
```

Navigation rules:

- `start()` awaits `loadManifest()` (fetching if `manifest` was a URL string), validates
  that `panels.length > 0`, and activates index 0. Throws `Manifest has no panels` if empty.
- `next()` returns `false` when already at the last panel. On success emits `navigation`
  with `{ from, to, direction: 'next' }` AFTER `panel-entered` has fired for the new panel.
- `prev()` returns `false` when already at index 0. On success emits `navigation` with
  direction `'prev'`.
- `goto(index)` returns `false` for out-of-range indices or when `index === currentIndex`.
  Direction is `'next'` if `index > from`, else `'prev'`.
- Keyboard bindings (when enabled): ArrowRight, PageDown, Space -> `next()`;
  ArrowLeft, PageUp -> `prev()`; Home -> `goto(0)`; End -> last panel;
  digits 1-9 -> panel at that 1-based position; digit 0 -> position 10;
  Escape -> reserved (no-op). Suppressed when focus is in `INPUT`, `TEXTAREA`, or a
  `contenteditable` element.
- `dispose()` detaches the keyboard handler. It does NOT unmount the active panel.

Panel resolution. Each `panels[i]` entry may be a string URL or an object with `src`, `url`,
or `path` (checked in that order). Any other shape throws `Invalid panel entry: ...`.

Activation sequence (internal but observable):

1. `panel-exited` fires for the outgoing panel (if any).
2. Active tools and elements are unmounted in REVERSE mount order, each in its own
   `try/catch`.
3. Active layout is unmounted in its own `try/catch`.
4. `host.innerHTML = ''`.
5. The new panel is fetched via `loadPanel`. A throw here renders a diagnostic and sets
   `currentIndex = -1`.
6. `panel.meta` is required; a missing meta renders a diagnostic.
7. The declared layout is resolved via `registry.getLayout(panel.meta.layout)`. A `null`
   result renders a diagnostic for `Unknown layout: <id>`.
8. `layout.mount(host, { meta, body })` is called in `try/catch`. A throw renders a
   diagnostic and sets `currentIndex = -1`.
9. `panel.meta.tools` and then `panel.meta.elements` are iterated. Each declaration
   resolves via `registry.getTool` or `registry.getElement`. A missing module reports
   `Unknown tool: <id>` or `Unknown element: <id>` and skips that declaration. A missing
   slot reports `Slot "<name>" not provided by layout for <kind> "<id>"`. Each module's
   `mount` is wrapped in `try/catch`.
10. `currentIndex` is set and `panel-entered` fires.

Diagnostic semantics. `renderDiagnostic(panelPath, err, fallbackIndex)` writes an inline
`<div class="pn-diagnostic" role="alert">` into `host` with the panel path, the error
message (HTML-escaped), and a `Back` button. Clicking Back calls `activatePanel(fallbackIndex)`
only when `fallbackIndex >= 0`; after the very first activation failure, `fallbackIndex`
is `-1` and the button is inert. Diagnostics never emit `panel-entered`; `currentMeta`
stays `null` and `currentIndex` is `-1`.

---

## Event Bus

Events dispatch on `runtime.eventBus` (an `EventTarget` by default) as `CustomEvent`
instances with `detail`. Each event is also forwarded synchronously to the active layout's
`onEvent`, then to every active tool and element's `onEvent`, in mount order. Listener
throws are caught and routed to `onError`.

Active events (Phase 1):

| Event           | When                                  | Detail                         |
| --------------- | ------------------------------------- | ------------------------------ |
| `panel-exited`  | Before teardown of the outgoing panel | `{ panelId }`                  |
| `panel-entered` | After mount of tools and elements     | `{ panelId, layout }`          |
| `navigation`    | After a successful `next/prev/goto`   | `{ from, to, direction }`      |

Ordering guarantees:

- `panel-exited` for the old panel ALWAYS fires before `panel-entered` for the new panel.
- `navigation` ALWAYS fires AFTER `panel-entered` for the target panel.
- The initial `start()` activation emits `panel-entered` but NOT `navigation`.
- A failed activation emits neither `panel-entered` nor `navigation`.

Payload shapes are stable. Adding fields is additive; removing or renaming fields is a
breaking change.

---

## Panel HTML Format

Each panel is a standalone HTML file. The runtime reads it via `defaultLoadPanel` (or an
injected equivalent) and requires two elements in the document:

1. A script tag `<script type="application/json" id="panel-meta">...</script>` containing
   valid JSON. Missing tag throws `panel-meta block missing in <url>`. Invalid JSON throws
   `panel-meta JSON invalid in <url>: <message>`.
2. An element `[data-panel-body]` whose content is passed to the layout. May be empty or
   absent; layouts that ignore body are tolerant of either.

Meta JSON schema:

```json
{
  "id": "panel-01",
  "layout": "cover",
  "title": "Smoke Test",
  "tools":    [ { "id": "<tool-id>",    "slot": "<name>", "config": { } } ],
  "elements": [ { "id": "<element-id>", "slot": "<name>", "config": { } } ],
  "minutes": 2
}
```

Fields:

- `id` -- required string. Used in `panel-entered` and `panel-exited` payloads.
- `layout` -- required string. Must match a registered layout id.
- `title` -- optional string. Layouts may use it as a fallback heading.
- `tools` -- optional array. Default `[]`.
- `elements` -- optional array. Default `[]`.
- `minutes` -- optional number. Advisory pacing metadata; not consumed by the engine.

Each tool or element declaration has:

- `id` -- required string. Must match a registered module id of that kind.
- `slot` -- optional string. Defaults to `'default'`. Must match a slot name returned by
  the active layout's `mount`.
- `config` -- optional object. Passed verbatim as the second argument to `module.mount`.
  Defaults to `{}`.

Module imports (the `<script type="module" src="...">` tags that trigger self-registration)
live inside the panel HTML or its parent presentation `index.html`. The engine does not
parse or enforce their presence; authors are responsible for importing every module their
panel references.

---

## Presentation manifest.json Schema

A presentation directory contains a `manifest.json` that the runtime loads first.

```json
{
  "id": "smoke-test",
  "title": "Smoke Test",
  "theme": "default",
  "course": "capacitacao-ia-geral",
  "author": "ClassForge",
  "language": "pt-BR",
  "description": "Phase 1 bedrock smoke test",
  "panels": [
    "panel-01.html",
    { "src": "panel-02.html", "id": "intro", "title": "Second Panel" }
  ]
}
```

Fields:

- `id` -- required string. Stable presentation identifier.
- `title` -- optional string. Display name.
- `theme` -- optional string. Must match a registered theme id once theme activation lands
  in Phase 2/3. Currently consumed as provenance only.
- `course` -- optional string. Course identifier (e.g. `capacitacao-ia-geral`). Advisory;
  consumed by external tooling (TOC, catalog).
- `author` -- optional string. Instructor or author name.
- `language` -- optional string. BCP-47 tag (e.g. `pt-BR`).
- `description` -- optional string. Short subtitle.
- `panels` -- required array with `length >= 1`. Each entry is either a string URL or an
  object. The runtime resolves the URL in order `entry.src`, then `entry.url`, then
  `entry.path`. Unrecognized shapes throw `Invalid panel entry: ...` at activation time.
- Per-panel optional fields on object entries: `id` (stable manifest-level id, distinct
  from the panel HTML's own `meta.id`, used for deep-linking); `title` (overrides panel's
  own title for TOC display; advisory in Phase 2).

### Reserved manifest fields

- Per-panel `skip` -- Reserved -- Phase 3. Will let authoring skip draft panels.
- Per-panel `theme` -- Reserved -- Phase 2C/3. Will override presentation theme for a
  single panel once theme switching lands.
- Per-panel `minutes` -- Reserved -- Phase 3. Pacing metadata at manifest level; currently
  lives in panel `meta.minutes`.
- Presentation-level `tags` -- Reserved -- Phase 3.
- Presentation-level `sections` -- Reserved -- Phase 3.

The runtime runs a soft `validateManifest` check at load time and emits `console.warn` on
unknown keys, missing `id`, or empty `panels`. Warnings never prevent activation.
Additional unknown keys are tolerated but surfaced so authoring typos are easy to spot.

---

## Reserved Future Events

The following event types and mechanisms are NOT implemented in Phase 1. Modules MUST NOT
rely on them. They are listed here so that future authors recognize the names when they land.

- `theme-changed` -- Reserved -- Phase 2/3. Will fire when the active theme changes and
  carry `{ themeId }`. Theme activation token-override application on the root element is
  also Reserved -- Phase 2/3.
- `session-updated` -- Reserved -- Phase 2/3. Will fire when a ClassPulse session bound via
  the `classpulse-slot` element changes state and carry `{ slug, code, status }`.

Modules that implement `onEvent` today SHOULD switch on `evt.type` defensively so that the
arrival of new event types in a future engine version does not break them.

---

## Versioning Note

The engine evolves additively within a major version. Safe additive changes include: new
event types, new optional meta/manifest fields, new token categories, new registry kinds,
new runtime options. Modules compiled against an older additive revision keep working.

Breaking changes require an engine major version bump. These include: renaming or removing
an event type, renaming or removing a meta/manifest field, removing a token, changing an
existing payload shape, changing the mount/unmount/onEvent signatures, or changing the
registry validation rules. A major version bump is accompanied by a migration note in
`ClassForge/manifest/ARCHITECTURE.md` and a corresponding revision of this document.

Document revision: Phase 1 bedrock (2026-04-21); Phase 2G schema lock (2026-04-21).
