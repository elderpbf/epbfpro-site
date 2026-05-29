# Codex tests

Zero-dependency Node test scripts (no Vitest, no `node_modules`), matching the
house style of `backstage/classtrail/tests/`. They are harmless static files in
the deploy tree (noindex, unlinked) and never imported by the app.

Run all:

```
node --test "Site/codex/tests/"
```

or a single file:

```
node --test "Site/codex/tests/facade-content.test.mjs"
```

Two kinds of test:

- **Behavioral / unit** — import the real ES modules (`js/codex-api.js`,
  `i18n/*.js`, `content/items.js`) and assert behavior. Window globals
  (`callWorker`, `CT_TYPE_FILTER`, …) are stubbed on `globalThis`.
- **Contract source-assertions** — read module source as text and assert the
  module contract (facade-only backend, no inline `onclick`, `cdx-` prefix,
  every `t()` key in both dictionaries, no em dashes).

DOM-visual / iframe / OAuth behaviors are NOT unit-tested here; they stay on the
staging checklist.
