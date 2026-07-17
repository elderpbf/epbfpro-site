// edit/shareflow.js: the share / unlink flow, as ONE pluggable module.
//
// Before this it lived INLINE in wireChrome (a ~65-line onclick) and its "vinculado ou solto"
// question was DUPLICATED inline in app.onPaste. Élder 2026-07-17: "tudo isso tem que ser
// módulos separados, independentes e plugáveis, nada a gente escreve inline". So the whole
// orchestration moves here; the deck ops it drives (app.shareSetTo / app.detachSet) stay app
// methods, next to the other deck ops, which is where they belong (a module is the UI wrapper,
// not a second home for the model mutations). Two triggers, ONE flow: the "compartilhar"
// button in the chrome, and the link glyph on a rail thumb.
//
// Operates on a SET of slides (the rail multi-pick, or just the current one). The options the
// modal offers are decided by the set (Élder 2026-07-17):
//   - "este deck" (publicar/duplicar aqui) shows only when SOME slide is not yet linked.
//   - "desvincular" shows only when EVERY slide is already linked; a MIXED selection offers
//     compartilhar and nothing else.
// There is no twin any more: "este deck + vinculado" publishes the slide IN PLACE (it becomes
// the shared one), it does not drop a second linked copy after it. That surprise second copy
// was flagged twice; the plain reading of "compartilhar este slide" is "make it shareable".
import { t } from "../../../../js/i18n.js";
import { askChoice } from "../ui/choice.js";

// The "como?" question (vinculado | solto), shared by SHARE and PASTE so the two speak the
// same words (um ato, um vocabulário). `title` lets the paste keep its own "Colar N slides"
// heading; share uses the default. Returns "linked" | "loose" | null.
export function askHowMode(root, { title, message } = {}) {
  return askChoice(root, {
    title: title || t("slides.shr_how_title"),
    message: message || "",
    options: [
      { value: "linked", label: t("slides.clip_paste_linked"), hint: t("slides.clip_paste_linked_hint"), primary: true },
      { value: "loose", label: t("slides.clip_paste_loose"), hint: t("slides.clip_paste_loose_hint") },
    ],
  });
}

// A broken link (the library entry it pointed at is gone) is not a share/unlink question: the
// content lived only in that entry, so the honest choices are remove or start-over. Handled per
// slide; the flow routes a single broken slide here.
async function brokenFlow(app, slide) {
  const i = app.deck().slides.indexOf(slide);
  const what = await askChoice(app.root, {
    title: t("slides.shr_broken_title"),
    message: t("slides.shr_broken_msg"),
    options: [
      { value: "remove", label: t("slides.shr_broken_remove"), hint: t("slides.shr_broken_remove_hint"), primary: true },
      { value: "blank", label: t("slides.shr_broken_blank"), hint: t("slides.shr_broken_blank_hint") },
    ],
  });
  if (what === "remove") { app.removeSlide(i); return; }
  if (what === "blank") { app.goTo(i); app.resetBroken(); }
}

/**
 * openShareFlow(app, slides): the whole flow. `slides` is the set to act on; empty/omitted
 * means "the current slide". Drives app, returns nothing.
 */
export async function openShareFlow(app, slides) {
  if (!app._library) return;
  const set = (slides && slides.length ? slides : [app.cur()]).filter(Boolean);
  if (!set.length) return;

  // A lone broken slide is its own question.
  if (set.length === 1 && set[0]._broken) return brokenFlow(app, set[0]);

  const nonBroken = set.filter((s) => !s._broken);
  if (!nonBroken.length) return; // only broken slides in a multi-pick: nothing to share
  const someUnlinked = nonBroken.some((s) => !app.isShared(s));
  const allLinked = nonBroken.every((s) => app.isShared(s));
  const many = nonBroken.length > 1;

  // 1) WHERE. This deck (only if something is still unlinked), another one, a new one, or
  // "desvincular" (only if EVERY slide is already linked).
  const decks = (app._deckList ? app._deckList() : []).filter((d) => d.slug !== app._slug);
  const options = [];
  if (someUnlinked) options.push({ value: "__here__", label: t("slides.shr_where_here"), hint: app._deckTitle, primary: true });
  for (const d of decks) options.push({ value: d.slug, label: d.title || d.slug });
  options.push({ value: "__new__", label: t("slides.shr_where_new") });
  if (allLinked) options.push({ value: "__unlink__", label: t("slides.shr_detach"), hint: t("slides.shr_detach_tip") });

  const target = await askChoice(app.root, {
    title: many ? t("slides.shr_where_title_n").replace("{n}", nonBroken.length) : t("slides.shr_where_title"),
    message: t("slides.shr_where_msg"),
    options,
  });
  if (!target) return;

  // Desvincular is destructive (the slides stop following the library), so it keeps its
  // confirm; what changed is it only fires when the user picks it on purpose.
  if (target === "__unlink__") {
    const msg = many
      ? t("slides.shr_detach_confirm_n").replace("{n}", nonBroken.length)
      : t("slides.shr_detach_confirm");
    // eslint-disable-next-line no-alert
    if (!window.confirm(msg)) return;
    app.detachSet(nonBroken);
    return;
  }

  let dest = null;
  if (target === "__new__") {
    const made = app._createDeck ? await app._createDeck(null, { open: false }) : null;
    if (!made || !made.slug) { if (window.bsLog) window.bsLog("Share: new deck failed", "error"); return; }
    dest = made;
  } else if (target !== "__here__") {
    dest = decks.find((d) => d.slug === target) || null;
  }

  // 2) HOW. Same question the paste asks, same words.
  const mode = await askHowMode(app.root, {
    message: dest ? t("slides.clip_paste_from").replace("{deck}", dest.title || dest.slug) : app._deckTitle,
  });
  if (!mode) return;

  const res = await app.shareSetTo(nonBroken, dest, mode);
  if (res && res.error) { if (window.bsLog) window.bsLog("Share slides: " + res.error, "error"); return; }
  if (app._notify) {
    app._notify(res.here ? t("slides.shr_done_here")
      : t("slides.shr_done_there").replace("{deck}", (res.target && res.target.title) || ""));
  }
}

// Plug it onto app so the rail glyph and the chrome button call one door.
export function initShareFlow(app) {
  app.openShareFlow = (slidesSet) => openShareFlow(app, slidesSet);
}
