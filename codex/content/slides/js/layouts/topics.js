// layouts/topics.js — Só tópicos. Bullets render via the shared topicList helper
// (id-keyed, each selectable as the `topic` kind); delete is a descriptor control
// and add is the container kind, not layout-emitted HTML.
import { bar, contentMotifs } from "../theme/art.js";
import { ed, topicList } from "../render/helpers.js";
import { uid } from "../core/schema.js";

export default {
  id: "topics",
  label: "Só tópicos",
  group: "lists",
  defaults: () => ({ title: "Título", topics: ["Tópico um", "Tópico dois", "Tópico três"].map((text) => ({ id: uid(), text })) }),
  reveals: (s) => Math.max(0, ...s.topics.map((t, i) => t.step != null ? t.step : (i + 1))),
  render: (s) => `${bar}<div class="L-topics">${contentMotifs}${ed("h2", "title", s.title)}
    ${topicList(s.topics)}</div>`,
};
