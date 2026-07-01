// present/presenter.js — second-window presenter view + BroadcastChannel sync.
// Editor side broadcasts state; presenter side renders now/next minis, notes,
// timer and clock, and posts navigation back to the editor.
import { renderInto } from "../render/player.js";
import { applyDeckTheme } from "../theme/tokens.js";
import { t } from "../../../../js/i18n.js";

/** Editor-side: outbound state + inbound nav/hello from the presenter window. */
export function createSync(app) {
  const channel = app.channel;
  function broadcast() {
    channel.postMessage({
      type: "state",
      index: app.index,
      step: app.step,
      theme: app.deck().theme,
      assets: app.deck().assets,
      logo: app.deck().logo, // deck-level logo (per-slide slide.logo rides inside deck) (D4)
      deck: JSON.stringify(app.deck().slides),
      blank: app.blank, // 4A: audience blank state, so the presenter window reflects it
      atEnd: app.atEnd, // 4C: end-of-deck state
    });
  }
  channel.onmessage = (e) => {
    const m = e.data;
    if (m.type === "nav") app.go(m.dir);
    else if (m.type === "hello") broadcast();
    else if (m.type === "blankkey") app.toggleBlank(m.mode); // 4A from the presenter window
    else if (m.type === "restart") app.restart();            // 4C from the presenter window
    else if (m.type === "jumpkey") app.jumpKey(m.key);       // 4B from the presenter window
  };
  return { broadcast };
}

/** Presenter-window side: receive state, render the presenter dashboard. */
export function initPresenter(app) {
  const channel = app.channel;
  // Scope to the editor host (.cdx-deck-editor), not document.body: the presenter
  // dashboard CSS is all scoped under .cdx-deck-editor.presenter (body never matched).
  app.root.classList.add("presenter");
  const $ = (id) => document.getElementById(id);

  function renderMini(id, i) {
    const t = $(id);
    if (!t) return;
    const deck = app.deck();
    if (i < 0 || i >= deck.slides.length) {
      t.innerHTML = "";
      return;
    }
    renderInto(t, deck, deck.slides[i]);
    t.style.transform = `scale(${t.parentElement.clientWidth / deck.canvas.w})`;
  }

  channel.onmessage = (e) => {
    const m = e.data;
    if (m.type !== "state") return;
    const deck = app.deck();
    if (m.deck) deck.slides = JSON.parse(m.deck);
    if (m.assets) deck.assets = m.assets;
    if (m.logo) deck.logo = m.logo; // keep the deck logo in sync (D4)
    if (m.theme) {
      deck.theme = m.theme;
      applyDeckTheme(deck, app.stage);
    }
    app.index = m.index;
    app.step = m.step;
    $("pvPos").textContent = `${app.index + 1} / ${deck.slides.length}`;
    $("pvNotes").textContent = deck.slides[app.index].notes || "(sem notas)";
    renderMini("pvNow", app.index);
    renderMini("pvNext", app.index + 1);
    // Reflect the audience state (Phase 4) so the presenter knows what's on screen.
    const st = $("pvStatus");
    if (st) st.textContent = m.blank === "black" ? t("slides.pv_blank_black")
      : m.blank === "white" ? t("slides.pv_blank_white")
      : m.atEnd ? t("slides.pv_end") : "";
  };

  // The presenter window drives the audience: arrows/space navigate, and the Phase 4
  // hotkeys (B/W blank, digits+Enter jump, R restart) post commands back to the editor.
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === " ") { channel.postMessage({ type: "nav", dir: 1 }); return; }
    if (e.key === "ArrowLeft") { channel.postMessage({ type: "nav", dir: -1 }); return; }
    const k = e.key.toLowerCase();
    if (k === "b") channel.postMessage({ type: "blankkey", mode: "black" });
    else if (k === "w") channel.postMessage({ type: "blankkey", mode: "white" });
    else if (k === "r") channel.postMessage({ type: "restart" });
    else if (/^[0-9]$/.test(e.key) || e.key === "Enter" || e.key === "Backspace") channel.postMessage({ type: "jumpkey", key: e.key });
  });

  let secs = 0;
  setInterval(() => {
    secs++;
    const m = String(Math.floor(secs / 60)).padStart(2, "0");
    const s = String(secs % 60).padStart(2, "0");
    $("pvTimer").textContent = `${m}:${s}`;
  }, 1000);
  setInterval(() => {
    const d = new Date();
    $("pvClock").textContent =
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }, 1000);

  channel.postMessage({ type: "hello" });
}
