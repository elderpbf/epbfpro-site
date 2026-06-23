# Codex Design System — Spec (for approval)

This is the written half of the mock. Open `index.html` on staging for the visual
half (every component × every state × light/dark toggle). Nothing is applied to the
codex until you approve both.

## The one law

A component's own CSS file is **layout only**. Every color, fill, border, button
look, badge look, accent treatment comes from the shared primitives. If two things
that play the same role look different, that is a bug, not a variant. No component
re-implements a button, a pill, an accent, or a card. There is ONE of each.

This is the fix for the fragmentation: the previous pass patched flagged offenders,
which left the parallel systems (two button families, the cert-status accents, the
ad-hoc teals) alive. Consolidation deletes the duplicates instead of patching around
them.

## File organization (the reorg you green-lit)

Today: `theme.css` (base) + `tokens.css` (palette) + per-area sheets that each
hand-roll their own buttons/badges/accents + shared `css/*.css` doing the same.

Proposed:

1. `css/theme.css` — base theme tokens (backstage-shared). Unchanged.
2. `css/tokens.css` — THE token home: palette + assignment + semantic roles +
   component tokens. Already two-layer. Absorbs the few proposed-new tokens below.
3. `css/components.css` — **NEW.** The design-system primitives (this mock's
   `components.css`, verbatim). Loaded after `tokens.css`, before any area sheet.
   The single home for `.cdx-btn*`, `.cdx-badge*`, `.cdx-card*`, `.cdx-accent-card`,
   `.cdx-kpi`, `.cdx-input`, `.cdx-tab*`, `.cdx-table`, `.cdx-toast`, `.cdx-modal`.
4. Area sheets (`cohorts/`, `content/`, `lessons/`, `questions/`, `certificates/`,
   `trilha/`) — slim to LAYOUT + structure; every button/badge/accent becomes a
   shared class. The two button families collapse into `.cdx-btn`; `.cdx-hi-btn*`
   is deleted. `classvault.css`/`classtrail.css` legacy looks are dropped.

## Proposed new tokens (the only additions)

- `--cdx-danger-border` — resting border for danger-outline buttons (light/dark).
- `--cdx-ghost-hover` — tertiary/ghost hover wash (aliases `--surface-hover`).
- `--status-issued / --status-signed / --status-sent / --status-revoked` — the
  cert-status accents, folded into the deepen-in-dark contract (was theme-stable
  bright = your "accents that don't translate to dark" complaint).

## Button emphasis hierarchy (the core decision)

| Tier | Look | Use |
|---|---|---|
| `--primary` | solid teal | the single main commit action on a surface |
| `--neutral` (base) | filled outline | general / toolbar buttons (Gerenciar tags, Gerenciar tipos, Selecionar) |
| `--vazado` (+ `--sm`) | hollow outline | small inline row-actions (Editar, Duplicar) |
| `--danger` | **hollow red**, fills on hover | inline destructive (Excluir, Revogar, bulk-delete) |
| `--danger-solid` | solid red | the FINAL confirm step inside a destroy modal, nowhere else |

The axis is **context + emphasis**: general/toolbar buttons stay filled-neutral; the
small per-row actions go hollow (vazado), destructive ones hollow-red. Solid red stops
being an everyday button and becomes a deliberate, confirm-only signal. (Ghost dropped,
Élder's call.)

## Behaviors

- Buttons: `:hover` (primary/danger-solid deepen toward black; neutral + vazado →
  surface-hover wash; danger → solid red fill), `:focus-visible` (soft primary ring),
  `:disabled` (0.45 opacity, no-cursor). Sizes `--sm` / `--lg`.
- Accent-card / accent-badge: hue tint auto-deepens in dark via `--acc-mix-bg` (6%→14%);
  text always neutral; hue only in the dot/border/glyph.
- Tabs: active label neutral, hue on underline + glyph only.
- Inputs: focus = primary border + soft ring; placeholder = `--text-muted`.
- KPI: status-accent left rail, deepens in dark.

## Migration plan (after approval)

1. Promote `components.css` into `css/`, add the proposed tokens to `tokens.css`,
   wire `components.css` into `index.html` (+ trilha pages).
2. One agent per area, mandate = **migrate every button/badge/accent/card/input in
   my files onto the primitives and delete the local look**, not a checklist of
   offenders. Layout-only is the acceptance bar.
3. Delete `.cdx-hi-btn*` and the legacy button/accent blocks.
4. Tests green, bump versions, one staging deploy, you verify light + dark per tab.

## Resolved (Élder)

- Tiers: `primary / neutral / vazado / danger / danger-solid`. Ghost dropped.
- Axis = context: toolbar/general buttons = neutral filled; small row-actions = vazado
  (Editar, Duplicar), Excluir/Revogar = danger. Reabrir/Editar are non-destructive → vazado.

## Open question

- Any component missing from the mock that you want speced before we apply?
