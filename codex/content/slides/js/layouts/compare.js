// layouts/compare.js — Comparação (A × B): two titled panels with a central badge
// (× / VS / →). Each panel's title + badge are free text slots; each panel's bullets
// are an independent named list ("left" / "right") rendered through the shared
// topicList, so they add/remove/reorder/edit through the topic + container descriptors
// with no compare-specific wiring. The deck's most frequent uncovered shape.
import { bar } from "../theme/art.js";
import { ed, topicList } from "../render/helpers.js";
import { uid } from "../core/schema.js";

const list = (texts) => texts.map((text) => ({ id: uid(), text }));

export default {
  id: "compare",
  label: "Comparação (A × B)",
  group: "compare",
  defaults: () => ({
    leftTitle: "Google busca",
    left: list(["Localiza e agrega", "Fonte externa", "Tempo real"]),
    badge: "×",
    rightTitle: "IA cria",
    right: list(["Gera o texto", "É a própria fonte", "Pode alucinar"]),
  }),
  reveals: () => 0,
  render: (s) => `${bar}<div class="L-comp">
    <div class="cmp-panel cmp-a">${ed("h3", "leftTitle", s.leftTitle, "cmp-title")}${topicList(s.left, "left")}</div>
    <div class="cmp-badge">${ed("span", "badge", s.badge, "")}</div>
    <div class="cmp-panel cmp-b">${ed("h3", "rightTitle", s.rightTitle, "cmp-title")}${topicList(s.right, "right")}</div>
  </div>`,
};
