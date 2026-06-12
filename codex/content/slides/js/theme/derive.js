// theme/derive.js — pure colour DERIVATION for the deck theme. Given the few REAL
// palette colours, it computes the extra tokens the slide CSS needs (panel fills,
// gradients, borders) so they FOLLOW the swatch instead of being hardcoded. Returns a
// { cssVar: value } map; applyDeckTheme writes each onto the document root. Pure and
// DOM-free (the math is CSS color-mix strings), so it unit-tests by source text.
//
// Why color-mix and not JS hex math: color-mix(in srgb, …) is already used in
// slide.css, so this adds zero new colour code and the browser keeps the value live
// and inspectable. The vivid TEXT shades (--teal-d / --teal-l / --ink2) are
// deliberately NOT derived here yet: a flat white-mix desaturates them visibly, so
// they keep a hue-stable (OKLCH) derivation for when the palette model lands. This
// first pass only makes PANELS follow the swatch.

/** color-mix expression: pct% of `base`, the rest `other`. */
function mix(base, pct, other) {
  return `color-mix(in srgb, ${base} ${pct}%, ${other})`;
}

/**
 * Derive the slide-content panel tokens from the palette.
 * @param {{accent?:string, ink?:string, paper?:string}} p
 * @returns {Object<string,string>} cssVar -> value
 */
export function derive(p) {
  const accent = (p && p.accent) || "#14b8a6";
  const paper = (p && p.paper) || "#ffffff";
  // A faint wash of the accent over paper, so a card / step / road panel reads as a
  // subtle tint of the brand colour; two stops make the gradient.
  const fill = mix(accent, 6, paper);
  const fill2 = mix(accent, 11, paper);
  const line = mix(accent, 16, paper);
  // NB: these names are distinct from the editor-CHROME --panel / --panel-2 (defined
  // on .cdx-deck-editor in tokens.css). These slide tokens live on <html>.
  return {
    "--panel-fill": fill,
    "--panel-fill-2": fill2,
    "--panel-line": line,
    "--panel-grad": `linear-gradient(160deg, ${fill}, ${fill2})`,
  };
}
