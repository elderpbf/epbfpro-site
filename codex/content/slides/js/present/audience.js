// present/audience.js — the audience view, rendered in a window that is NOT the editor.
// Sibling of present/presenter.js: the presenter window draws the DASHBOARD (now/next minis,
// notes, timers); this one draws the STAGE full-bleed, which is what goes to the TV.
//
// It consumes the SAME {type:"state"} message createSync already broadcasts, so nothing new
// goes on the wire. Rendering reuses app.renderSlide() (the player chain); the editor-only
// bits inside it are already guarded (`if (this.select)`, `if (this.gripReorder)`).
//
// Element of track-27: this is what lets the deck be a PLUG in the sister display page
// instead of taking over the editor's own window.
import { applyDeckTheme } from "../theme/tokens.js";

export function initAudience(app) {
  const channel = app.channel;
  // .presenting is the existing full-bleed contract (ui.css: hides #chrome/#nav, pins
  // #stagewrap to the viewport). presenting=true also makes reveal steps count (_stepMode).
  app.root.classList.add("presenting");
  app.presenting = true;

  channel.onmessage = (e) => {
    const m = e.data;
    if (!m || m.type !== "state") return;
    _stopHello(app);
    const deck = app.deck();
    if (m.deck) deck.slides = JSON.parse(m.deck);
    if (m.assets) deck.assets = m.assets;
    if (m.logo) deck.logo = m.logo;
    // canvas BEFORE the theme: applyDeckTheme writes --canvas-w/h from it, and app.fit() sizes the
    // stage by it. Without this a 4:3 deck renders at the default 16:9 on the audience screen.
    if (m.canvas) deck.canvas = m.canvas;
    if (m.transition) deck.transition = m.transition;
    if (m.theme) { deck.theme = m.theme; applyDeckTheme(deck, app.stage); }
    if (!deck.slides.length) return;
    app.index = Math.min(Math.max(m.index | 0, 0), deck.slides.length - 1);
    app.step = m.step | 0;
    app.root.classList.toggle("blank-black", m.blank === "black");
    app.root.classList.toggle("blank-white", m.blank === "white");
    app.root.classList.toggle("end-open", !!m.atEnd);
    app.fit();
    app.renderSlide();
  };

  const onResize = () => { app.fit(); app.renderSlide(); };
  window.addEventListener("resize", onResize);
  app._onResize = onResize;

  // Same handshake the presenter uses, but RETRIED. The presenter window is opened BY the editor,
  // so its one-shot hello always lands on a live listener. This window is the opposite: it is opened
  // first and left on the TV, and the editor only mounts when Conteúdo ▸ Slides is opened, so the
  // first hello usually falls into an empty channel. Retrying until state arrives is what makes
  // "abro a sala, depois abro o deck" work; without it the screen sat blank until the first arrow.
  channel.postMessage({ type: "hello" });
  app._helloTimer = setInterval(() => channel.postMessage({ type: "hello" }), HELLO_RETRY_MS);
}

const HELLO_RETRY_MS = 2000;

function _stopHello(app) {
  if (!app._helloTimer) return;
  clearInterval(app._helloTimer);
  app._helloTimer = null;
}
