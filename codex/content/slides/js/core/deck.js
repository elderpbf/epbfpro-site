// core/deck.js — deck/slide factories. Depends on the layout registry for
// per-layout slot defaults, so a new slide always starts from the layout's seed.
import { uid, clone, CANVAS, DEFAULT_LOGO } from "./schema.js";
import * as registry from "../layouts/registry.js";

/** A fresh slide of the given layout, seeded from that layout's defaults. */
export function newSlide(layoutId, slots) {
  return {
    id: uid(),
    layout: layoutId,
    slots: slots || registry.get(layoutId).defaults(),
    notes: "",
    overrides: {}, // freeform geometry per element fkey; absent = element stays in flow
  };
}

/** Deep copy of a slide with a new id. */
export function duplicateSlide(slide) {
  const copy = clone(slide);
  copy.id = uid();
  return copy;
}

/** The starter deck shown on first load (in-memory only). */
export function newDeck() {
  return {
    id: uid(),
    title: "Nova apresentação",
    canvas: { ...CANVAS },
    theme: { fontScale: 1, font: "roboto", accent: "#14b8a6", ink: "#134e4a", motif: "#14b8a6", anim: "fade-up" },
    logo: { ...DEFAULT_LOGO }, // deck-level: same position on every slide (single source: schema.js)
    assets: [],
    slides: [
      newSlide("cover", { eyebrow: "Seção", title: "Título da seção", sub: "Subtítulo", icon: null }),
      newSlide("split", Object.assign(registry.get("split").defaults(), { title: "Por que isso importa" })),
      newSlide("cards", {
        title: "Os 3 conceitos",
        reveal: true,
        cards: [
          { parts: { body: true }, text: "LLM" },
          { parts: { body: true }, text: "Tokens" },
          { parts: { body: true }, text: "Contexto" },
        ],
      }),
    ],
  };
}
