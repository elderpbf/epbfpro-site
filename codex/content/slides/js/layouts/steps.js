// layouts/steps.js — Fluxo / Etapas: a numbered sequence (absorbs the deck's
// pipelines and the disruption timeline). The title is a free text slot; the steps
// are a named list ("steps") via the shared topicList, so they edit through the topic
// + container descriptors. Numbering is a CSS counter (derived, never stored), and
// `orientation` ("row" | "col") flips horizontal/vertical via a body class.
import { bar } from "../theme/art.js";
import { ed, topicList } from "../render/helpers.js";
import { uid } from "../core/schema.js";

const list = (texts) => texts.map((text) => ({ id: uid(), text }));

export default {
  id: "steps",
  label: "Fluxo / Etapas",
  defaults: () => ({
    title: "Juntando tudo",
    orientation: "row",
    steps: list(["Entrada", "Tokens", "Embedding", "Transformer", "Resposta"]),
  }),
  reveals: () => 0,
  render: (s) => `${bar}<div class="L-steps ${s.orientation === "col" ? "col" : ""}">${ed("h2", "title", s.title)}
    ${topicList(s.steps, "steps")}</div>`,
};
