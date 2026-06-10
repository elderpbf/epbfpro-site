// layouts/roadmap.js — Roteiro / Conceitos: a fixed row of named nodes with ONE
// highlighted as active (the deck's recurring "OS 4 CONCEITOS" bússola slide). The
// eyebrow is a free text slot; the nodes are a named list ("nodes") rendered in the
// .roadnodes container, so each node edits/adds/removes/reorders through the roadnode
// descriptor (which also carries the "active" toggle that sets slots.active).
import { bar } from "../theme/art.js";
import { ed, edPlain } from "../render/helpers.js";
import { uid } from "../core/schema.js";

const list = (texts) => texts.map((text) => ({ id: uid(), text }));

export default {
  id: "roadmap",
  label: "Roteiro / Conceitos",
  group: "cards",
  defaults: () => ({
    eyebrow: "Próximo conceito básico",
    nodes: list(["LLM", "Janela de Contexto", "Embeddings", "Tokens"]),
    active: 3,
  }),
  reveals: () => 0,
  render: (s) => {
    const nodes = s.nodes || [];
    const active = Math.min(Math.max(s.active || 0, 0), Math.max(nodes.length - 1, 0));
    const items = nodes
      .map((n, i) =>
        `<li class="${i === active ? "on" : ""}" data-fkey="nodes.${n.id}">` +
        edPlain("span", `nodes.${i}.text`, n.text, "", `nodes.${n.id}`) +
        `</li>`)
      .join("");
    return `${bar}<div class="L-road">${ed("div", "eyebrow", s.eyebrow, "eyebrow")}
      <ul class="topiclist roadnodes" data-list="nodes">${items}</ul></div>`;
  },
};
