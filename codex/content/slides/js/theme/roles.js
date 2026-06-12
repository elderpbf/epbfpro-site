// theme/roles.js — the text-ROLE registry ("Estilos de texto"). Each role names a
// kind of text (Título, Seção, Tópico…) and BINDS to the real layout selectors that
// play it. The deck's typography lives at deck.theme.texto.papeis: role id -> a SPARSE
// override { font?, size?, weight?, italic?, underline?, strike?, color? }. roleCss()
// turns the active overrides into a stylesheet that applyDeckTheme injects AFTER
// slide.css (same selectors, so it wins on equal specificity), so changing a role
// retypesets every binding at once. An absent role, or an absent property, leaves the
// layout's own CSS untouched, so a deck with no typography overrides renders
// identically. Add a role / rebind a selector = one entry here. Same registry shape as
// fonts/layouts/cardparts: one self-contained entry, add in one line.
import { fontStack } from "./fonts.js";

// `binds`: every selector the role styles, with its INTRINSIC font-size px (so a role
// size MULTIPLIER scales each binding while preserving the layout's typographic rhythm).
export const ROLES = [
  { id: "title", labelKey: "slides.role_title", binds: [{ sel: ".L-cover h1", px: 78 }] },
  { id: "section", labelKey: "slides.role_section", binds: [
    { sel: ".L-topics h2", px: 52 }, { sel: ".L-split h2", px: 48 }, { sel: ".L-imgbox .ib-content h2", px: 42 },
    { sel: ".L-cards h2", px: 40 }, { sel: ".L-check h2", px: 44 }, { sel: ".L-steps h2", px: 44 },
    { sel: ".L-def h2", px: 44 }, { sel: ".L-agenda h2", px: 44 },
  ] },
  { id: "subtitle", labelKey: "slides.role_subtitle", binds: [{ sel: ".L-cover .sub", px: 32 }] },
  { id: "body", labelKey: "slides.role_body", binds: [{ sel: ".card .c-text", px: 22 }, { sel: ".L-agenda .ag-label", px: 27 }] },
  { id: "topic", labelKey: "slides.role_topic", binds: [
    { sel: ".topiclist li", px: 30 }, { sel: ".L-comp .topiclist li", px: 26 },
    { sel: ".L-check .topiclist li", px: 26 }, { sel: ".L-steps .topiclist li", px: 24 },
  ] },
  { id: "label", labelKey: "slides.role_label", binds: [{ sel: ".eyebrow", px: 22 }, { sel: ".L-road .eyebrow", px: 26 }] },
  { id: "caption", labelKey: "slides.role_caption", binds: [{ sel: ".L-quote .q-role", px: 20 }, { sel: ".L-def .d-def", px: 23 }] },
  { id: "feature", labelKey: "slides.role_feature", binds: [
    { sel: ".card .c-title", px: 30 }, { sel: ".L-comp .cmp-title", px: 34 },
    { sel: ".L-quote .q-author", px: 28 }, { sel: ".L-def .d-term", px: 30 },
  ] },
  { id: "quote", labelKey: "slides.role_quote", binds: [
    { sel: ".L-quote .q-text", px: 46 }, { sel: ".L-statement .big", px: 66 }, { sel: ".L-bleed .scrim .line", px: 46 },
  ] },
  { id: "number", labelKey: "slides.role_number", binds: [{ sel: ".L-agenda .ag-time", px: 27 }] },
];

export function getRole(id) {
  return ROLES.find((r) => r.id === id) || null;
}

// A role colour may be a SEMANTIC token name (so it tracks the palette) or a literal
// hex (a manual pin). Token names resolve to the deck CSS var.
const COLOR_TOKENS = {
  ink: "var(--ink)", ink2: "var(--ink2)", accent: "var(--teal)", accentDark: "var(--teal-d)", paper: "var(--paper)",
};
function colorVal(c) {
  return c == null ? null : COLOR_TOKENS[c] || c;
}

function decoration(p) {
  const parts = [];
  if (p.underline) parts.push("underline");
  if (p.strike) parts.push("line-through");
  return parts.length ? parts.join(" ") : null;
}

/**
 * Build the per-role CSS for the active typography overrides. Pure -> a stylesheet
 * string. Only properties the user SET are emitted (sparse), so untouched text keeps
 * the layout default. `scope` prefixes every selector so specificity matches slide.css.
 * @param {Object} papeis  role id -> sparse override
 * @returns {string}
 */
export function roleCss(papeis, scope = ".cdx-deck-editor") {
  if (!papeis) return "";
  let css = "";
  for (const role of ROLES) {
    const p = papeis[role.id];
    if (!p) continue;
    // Grouped properties: one declaration shared by all of the role's selectors.
    const decl = [];
    if (p.font) decl.push(`font-family:${fontStack(p.font)}`);
    if (p.weight != null) decl.push(`font-weight:${p.weight}`);
    if (p.italic != null) decl.push(`font-style:${p.italic ? "italic" : "normal"}`);
    const td = decoration(p);
    if (td) decl.push(`text-decoration:${td}`);
    const co = colorVal(p.color);
    if (co) decl.push(`color:${co}`);
    if (decl.length) {
      const sel = role.binds.map((b) => `${scope} ${b.sel}`).join(", ");
      css += `${sel}{${decl.join(";")}}\n`;
    }
    // Size is a MULTIPLIER over each binding's intrinsic px (one rule per selector, so
    // every binding keeps its relative size). 1 = no-op, so skip it.
    if (p.size != null && p.size !== 1) {
      for (const b of role.binds) {
        css += `${scope} ${b.sel}{font-size:calc(${b.px}px * var(--fontScale) * ${p.size})}\n`;
      }
    }
  }
  return css;
}
