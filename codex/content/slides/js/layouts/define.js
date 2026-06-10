// layouts/define.js — Definições / Glossário: a term + definition grid (the deck's
// "RESUMINDO" / "6 conceitos em uma linha"). The title is a free text slot; each item
// is a two-field list entry {term, text} via the shared topicList's `fields`, so the
// items add/remove/reorder/edit through the topic + container descriptors (a new item
// derives its {term,text} shape from this layout's seed).
import { bar } from "../theme/art.js";
import { ed, topicList } from "../render/helpers.js";
import { uid } from "../core/schema.js";

const TERMS = [
  ["LLM", "Modelo treinado para prever e gerar texto."],
  ["Tokens", "Unidades mínimas de dados da IA."],
  ["Embeddings", "Representações numéricas de significado."],
  ["Janela", "Limite de tokens considerados de uma vez."],
];
const FIELDS = [{ key: "term", cls: "d-term" }, { key: "text", cls: "d-def" }];

export default {
  id: "define",
  label: "Definições / Glossário",
  defaults: () => ({
    title: "Resumindo",
    terms: TERMS.map(([term, text]) => ({ id: uid(), term, text })),
  }),
  reveals: () => 0,
  render: (s) => `${bar}<div class="L-def">${ed("h2", "title", s.title)}
    ${topicList(s.terms, "terms", FIELDS)}</div>`,
};
