// layouts/agenda.js — Trilha / Agenda: a course schedule of time + label rows
// ("Trilha do aluno", 14h30 / 15h30 …). The title is a free text slot; each row is a
// two-field list entry {time, text} via the shared topicList's `fields`, so rows
// add/remove/reorder/edit through the topic + container descriptors (a new row derives
// its {time,text} shape from this layout's seed).
import { bar } from "../theme/art.js";
import { ed, topicList } from "../render/helpers.js";
import { uid } from "../core/schema.js";

const ROWS = [
  ["13h30", "Conceitos básicos: LLM e Tokens"],
  ["14h30", "Janela de contexto"],
  ["15h30", "Embeddings e atenção"],
  ["16h30", "Engenharia de prompt (CORE)"],
];
const FIELDS = [{ key: "time", cls: "ag-time" }, { key: "text", cls: "ag-label" }];

export default {
  id: "agenda",
  label: "Trilha / Agenda",
  group: "lists",
  defaults: () => ({
    title: "Trilha do aluno",
    // `active` marks the "now" row (an index, or null = none). Toggled per row from
    // the row's bar; the renderer highlights it. Starts unset so nothing is forced.
    active: null,
    rows: ROWS.map(([time, text]) => ({ id: uid(), time, text })),
  }),
  reveals: () => 0,
  render: (s) => `${bar}<div class="L-agenda">${ed("h2", "title", s.title)}
    ${topicList(s.rows, "rows", FIELDS, s.active)}</div>`,
};
