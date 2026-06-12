// theme/art.js — the decorative background ("Arte de fundo") as a KIT registry, plus
// the structural edge bar. All art is currentColor / var(--motif) driven, so the swatch
// recolours it with no per-kit work. A kit is one self-contained entry
//   { id, labelKey, cover(), content(), cards() }
// returning the motif HTML for a slide GROUP (title slides get `cover`, content slides
// `content`, the cards layout `cards`). The active kit is chosen by deck.theme.art and
// set via setArtKit (called from applyDeckTheme); the per-group exports below delegate
// to it, so a layout just calls coverMotifs()/contentMotifs()/cardMotifs() and never
// knows which kit is active. Add an art style = one kit entry here; the edge bar stays
// a plain constant (it is frame, not decoration). "Allow more than one" falls out: a
// kit's cover()/content() can return as many pieces as it likes.

export const CIRCUITSVG = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 22 H38 V52 H68 M68 52 V82 M38 52 V92 M68 52 H94 M52 8 V34 H82"/><g fill="currentColor" stroke="none"><circle cx="8" cy="22" r="3"/><circle cx="38" cy="52" r="3"/><circle cx="68" cy="52" r="3"/><circle cx="68" cy="82" r="3"/><circle cx="38" cy="92" r="3"/><circle cx="94" cy="52" r="3"/><circle cx="52" cy="8" r="3"/><circle cx="82" cy="34" r="3"/></g></svg>`;

export const NEURALSVG = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 24 L52 16 L52 50 L20 24 M52 16 L84 30 M52 50 L84 30 M52 50 L48 84 M84 30 L48 84 M20 24 L48 84"/><g fill="currentColor" stroke="none"><circle cx="20" cy="24" r="4"/><circle cx="52" cy="16" r="4"/><circle cx="84" cy="30" r="4"/><circle cx="52" cy="50" r="4"/><circle cx="48" cy="84" r="4"/></g></svg>`;

export const circuit = (pos) => `<div class="motif circuit ${pos}">${CIRCUITSVG}</div>`;
export const NEURAL = `<div class="motif neural">${NEURALSVG}</div>`;

// One self-contained entry per art style. "circuito" reproduces today's exact motifs.
export const ARTKITS = [
  {
    id: "circuito",
    labelKey: "slides.art_circuito",
    cover: () => circuit("tr") + circuit("bl") + circuit("br"),
    content: () => NEURAL + circuit("br"),
    cards: () => circuit("br"),
  },
  {
    id: "neural",
    labelKey: "slides.art_neural",
    cover: () => `<div class="motif neural tr">${NEURALSVG}</div>` + circuit("bl"),
    content: () => NEURAL,
    cards: () => "",
  },
  {
    id: "nenhum",
    labelKey: "slides.art_nenhum",
    cover: () => "",
    content: () => "",
    cards: () => "",
  },
];

export function getArtKit(id) {
  return ARTKITS.find((k) => k.id === id) || ARTKITS[0];
}

let _active = "circuito";
/** Choose the active art kit (called by applyDeckTheme from deck.theme.art). */
export function setArtKit(id) {
  _active = getArtKit(id).id;
}
function activeKit() {
  return getArtKit(_active);
}

// Per-group motif accessors the layouts call. They delegate to the ACTIVE kit, so
// swapping deck.theme.art reflows every layout with no layout edit.
export function coverMotifs() { return activeKit().cover(); }
export function contentMotifs() { return activeKit().content(); }
export function cardMotifs() { return activeKit().cards(); }

export const bar = `<div class="edgebar"></div>`;
