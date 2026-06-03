// present/presenter.js — second-window presenter view + BroadcastChannel sync.
// Editor side broadcasts state; presenter side renders now/next minis, notes,
// timer and clock, and posts navigation back to the editor.
import { renderInto } from "../render/player.js";
import { applyDeckTheme } from "../theme/tokens.js";

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
    });
  }
  channel.onmessage = (e) => {
    const m = e.data;
    if (m.type === "nav") app.go(m.dir);
    if (m.type === "hello") broadcast();
  };
  return { broadcast };
}

/** Presenter-window side: receive state, render the presenter dashboard. */
export function initPresenter(app) {
  const channel = app.channel;
  document.body.classList.add("presenter");
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
  };

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === " ") channel.postMessage({ type: "nav", dir: 1 });
    if (e.key === "ArrowLeft") channel.postMessage({ type: "nav", dir: -1 });
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
