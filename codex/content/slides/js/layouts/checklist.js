// layouts/checklist.js — Faça / Não faça: two ticked columns (✓ green / ✕ red). The
// title is a free text slot; the two columns are independent named lists ("dos" /
// "donts") via the shared topicList, so they edit through the topic + container
// descriptors. The ✓/✕ marks are CSS on each column, not content.
import { bar } from "../theme/art.js";
import { ed, topicList } from "../render/helpers.js";
import { uid } from "../core/schema.js";
import { t } from "../../../../js/i18n.js";

const list = (texts) => texts.map((text) => ({ id: uid(), text }));

export default {
  id: "checklist",
  label: "Faça / Não faça",
  group: "lists",
  defaults: () => ({
    title: "Contexto negativo",
    dos: list(["Caracterização do vínculo", "Elementos fáticos da relação"]),
    donts: list(["Cálculos trabalhistas", "Aspectos processuais", "Jurisprudência"]),
  }),
  reveals: () => 0,
  render: (s) => `${bar}<div class="L-check">${ed("h2", "title", s.title)}
    <div class="chk-cols">
      <div class="chk-col chk-do"><div class="chk-h">${t("slides.chk_do")}</div>${topicList(s.dos, "dos")}</div>
      <div class="chk-col chk-dont"><div class="chk-h">${t("slides.chk_dont")}</div>${topicList(s.donts, "donts")}</div>
    </div></div>`,
};
