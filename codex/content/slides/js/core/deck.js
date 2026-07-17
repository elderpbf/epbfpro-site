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
/**
 * An INDEPENDENT copy of a slide. Drops `ref`, so duplicating a SHARED slide gives a
 * detached copy that can drift, not a second window onto the same library entry.
 *
 * That is what "duplicar" means everywhere else, and the two are not interchangeable here
 * (track-35 C): a silent linked twin would edit other decks from a button that promises a
 * copy. A second LINKED instance is a different, named act: compartilhar -> este deck ->
 * vinculado, or Ctrl+C / Ctrl+V -> vinculado. `_broken` goes too: duplicating a
 * "nao encontrado" placeholder must not spread the warning as if it were content.
 */
export function duplicateSlide(slide) {
  const copy = clone(slide);
  copy.id = uid();
  delete copy.ref;
  delete copy._broken;
  return copy;
}

/** The starter deck shown on first load (in-memory only). */
export function newDeck() {
  return {
    id: uid(),
    title: "Nova apresentação",
    aspect: "16:9",
    canvas: { ...CANVAS },
    theme: { fontScale: 1, font: "roboto", accent: "#14b8a6", ink: "#134e4a", motif: "#14b8a6", anim: "fade-up", art: "circuito", texto: { papeis: {} } },
    logo: { ...DEFAULT_LOGO }, // deck-level: same position on every slide (single source: schema.js)
    savedThemes: [], // the user's "Meus temas" (per-deck snapshots; see theme/presets.snapshotTheme)
    gallery: [], // the central image registry ({id,name,url}); see core/gallery.js + edit/gallerybox.js
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
