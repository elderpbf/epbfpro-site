// app.js — composition root. Renders the shell, builds the app controller, and
// injects the Store + behaviours into the engine. Exposes the cohorts-style
// mount(viewEl, ctx) / unmount() contract so Phase 6 folds into Codex unchanged:
// Codex would import { mount } from this file and inject a codexStore instead.
import * as registry from "./layouts/registry.js";
import { createMemoryStore } from "./core/store.js";
import { createHistory } from "./core/history.js";
import { uid } from "./core/schema.js";
import { newDeck, newSlide, duplicateSlide } from "./core/deck.js";
import { applyDeckTheme, initChromeTheme } from "./theme/tokens.js";
import * as player from "./render/player.js";
import { initEditing } from "./edit/editor.js";
import { initMaskPanel, maskPanelHTML } from "./edit/maskpanel.js";
import { initFreeform } from "./edit/freeform.js";
import { initSelect } from "./select/wiring.js";
import { insertMenu, addSlideMenu, appearanceMenu, animMenu } from "./edit/menus.js";
import { createNavigator } from "./edit/navigator.js";
import { createSync, initPresenter } from "./present/presenter.js";
import { t } from "../../../js/i18n.js";

// Layout display label by id, translated. Layout modules keep a PT fallback in
// their own `label`; here we map the id to an i18n key so the add-slide menu
// follows the active language.
const LAYOUT_LABEL_KEY = {
  cover:  "slides.layout_cover",
  split:  "slides.layout_split",
  topics: "slides.layout_topics",
  bleed:  "slides.layout_bleed",
  cards:  "slides.layout_cards",
};
const layoutLabel = (L) => (LAYOUT_LABEL_KEY[L.id] ? t(LAYOUT_LABEL_KEY[L.id]) : L.label);

// SHELL is built per-mount so every user-facing string resolves through t() in
// the active language (the dictionary may switch between mounts).
const shellHTML = () => `
<div id="chrome">
  <button id="prev">‹</button><span id="counter">1 / 1</span><button id="next">›</button>
  <button id="addBtn">＋ ${t("slides.ed_slide")} ▾</button>
  <button id="dupBtn">⧉ ${t("slides.ed_duplicate")}</button>
  <button id="flip">⇄ ${t("slides.ed_flip")}</button>
  <button id="insertBtn">＋ ${t("slides.ed_insert")} ▾</button>
  <button id="appearBtn">${t("slides.ed_appearance")} ▾</button>
  <button id="animBtn">${t("slides.ed_anim")} ▾</button>
  <span class="spacer"></span>
  <button id="present" class="primary">▶ ${t("slides.ed_present")}</button>
</div>

${maskPanelHTML()}

<div id="nav"></div>
<div id="stagewrap"><div id="stagebox"><div id="stage"></div></div></div>

<div id="pv">
  <div class="bar"><span class="timer" id="pvTimer">00:00</span><span class="clock" id="pvClock">--:--</span><span class="pos" id="pvPos">1 / 1</span></div>
  <div class="now"><div class="label">${t("slides.ed_current_slide")}</div><div class="mini"><div class="scale" id="pvNow"></div></div></div>
  <div class="next"><div class="label">${t("slides.ed_next_slide")}</div><div class="mini"><div class="scale" id="pvNext"></div></div></div>
  <div class="notes" id="pvNotes"></div>
  <div class="hintbar">${t("slides.ed_presenter_hint")}</div>
</div>`;

export function mount(root, ctx = {}) {
  const isPresenter = new URLSearchParams(location.search).get("presenter") === "1";
  root.innerHTML = shellHTML();
  const $ = (sel) => root.querySelector(sel);
  const store = ctx.store || createMemoryStore(newDeck());

  const app = {
    isPresenter,
    store,
    index: 0,
    step: 0,
    presenting: false,
    editing: false,
    activeEditable: null,
    selected: null,
    fontScope: "all", // "all" = deck.theme.fontScale · "slide" = per-slide override
    record() {}, // assigned once history exists (below)
    undo() {},
    redo() {},
    channel: new BroadcastChannel("slides-v8"),
    stage: $("#stage"),
    stagebox: $("#stagebox"),
    stagewrap: $("#stagewrap"),
    nav: $("#nav"),
    root,

    deck() { return store.getDeck(); },
    cur() { return this.deck().slides[this.index]; },
    layoutOf(s) { return registry.get(s.layout); },
    maxStep() { return this.layoutOf(this.cur()).reveals(this.cur().slots); },
    effMax() { return this.presenting ? this.maxStep() : 0; },
    scaleNow() { return player.scaleOf(this.stage, this.deck().canvas.w); },
    fit() { return player.fit(this.stagewrap, this.stagebox, this.stage, this.deck().canvas); },
    commit() { store.touch(); },
    // The top bar wraps to 2 rows on narrow windows; nav + stage track its real
    // height via --chrome-h so the first thumbnail isn't clipped under the bar.
    syncChrome() {
      const ch = root.querySelector("#chrome");
      document.documentElement.style.setProperty("--chrome-h", (ch ? ch.offsetHeight : 52) + "px");
    },
    renderSlide() {
      const d = this.deck(), s = this.cur();
      this.stage.style.setProperty("--fontScale", player.effFontScale(d, s));
      this.stage.innerHTML = player.slideHTML(d, s);
      player.applyOverrides(this.stage, s);
      player.applyTextStyles(this.stage, d, s);
      player.applySteps(this.stage, this.step, this.presenting);
      if (this.freeform) this.freeform.afterRender();
      if (this.select) this.select.afterRender();
      const c = root.querySelector("#counter");
      if (c) c.textContent = `${this.index + 1} / ${d.slides.length}`;
      // ⇄ Inverter only does something on layouts that carry a `flip` slot (split)
      const fb = root.querySelector("#flip");
      if (fb) fb.style.display = "flip" in s.slots ? "" : "none";
    },
    renderNav() {}, // assigned below (navigator)
    broadcast() {}, // assigned below (sync)

    refresh() { this.renderSlide(); this.renderNav(); this.commit(); this.broadcast(); },

    go(d) {
      const mx = this.effMax();
      if (d > 0 && this.step < mx) { this.step++; player.applySteps(this.stage, this.step, this.presenting); this.broadcast(); return; }
      if (d < 0 && this.step > 0) { this.step--; player.applySteps(this.stage, this.step, this.presenting); this.broadcast(); return; }
      const ni = this.index + d;
      if (ni < 0 || ni >= this.deck().slides.length) return;
      this.index = ni;
      this.step = d < 0 ? this.effMax() : 0;
      if (this.freeform) this.freeform.clear();
      if (this.select) this.select.clear();
      this.renderSlide(); this.renderNav(); this.broadcast();
    },
    // jump to slide i. NOT named `select`: wiring.js owns app.select (the selection
    // object), so this nav method must not collide with it.
    goTo(i) {
      this.index = i; this.step = 0;
      if (this.freeform) this.freeform.clear();
      if (this.select) this.select.clear();
      this.renderSlide(); this.renderNav(); this.broadcast();
    },

    // Deck-wide look, opened into the context bar (menus.js supplies the control
    // DATA; these apply it). Each owns its full effect (record + mutate + render).
    setTheme(key, v) {
      this.record("theme:" + key);
      this.deck().theme[key] = v;
      applyDeckTheme(this.deck(), this.stage);
      this.renderSlide(); this.renderNav(); this.commit(); this.broadcast();
    },
    setFontScale(v) {
      this.record("font:" + this.fontScope);
      if (this.fontScope === "slide") this.cur().fontScale = v;
      else this.deck().theme.fontScale = v;
      applyDeckTheme(this.deck(), this.stage);
      this.renderSlide(); this.renderNav(); this.commit(); this.broadcast();
    },
    toggleFontScope() { this.fontScope = this.fontScope === "all" ? "slide" : "all"; this.reopenAppearance(); },
    openAppearance(btn) {
      if (btn) this._appearBtn = btn;
      // seed the slider with the EFFECTIVE scale: the per-slide override in "slide"
      // scope, the deck default in "all" scope (5b).
      const fv = this.fontScope === "slide" ? player.effFontScale(this.deck(), this.cur()) : this.deck().theme.fontScale;
      this.select.openMenu(appearanceMenu(this.deck().theme, this.fontScope, fv), this._appearBtn);
    },
    reopenAppearance() { if (this._appearBtn) this.openAppearance(this._appearBtn); },

    // insert a free element (movable on any slide) of the given type
    insertElement(type) {
      const c = this.deck().canvas;
      const base = { id: uid(), type, x: c.w / 2 - 110, y: c.h / 2 - 70, w: type === "title" ? 420 : 240, rot: 0, scope: "slide", slideId: this.cur().id };
      if (type === "image" || type === "photo" || type === "video") {
        if (type === "video") base.h = 140; // a <video> has no intrinsic box before metadata (D2)
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = type === "video" ? "video/*" : "image/*"; // image/* includes gif (animates)
        inp.onchange = () => {
          const f = inp.files[0];
          if (!f) return;
          base.src = URL.createObjectURL(f);
          this.record();
          this.deck().assets.push(base);
          this.refresh();
        };
        inp.click();
      } else {
        base.text = type === "title" ? t("slides.ed_title") : t("slides.ed_text");
        this.record();
        this.deck().assets.push(base);
        this.refresh();
      }
    },
    addSlide(layoutId) { this.record(); this.deck().slides.splice(this.index + 1, 0, newSlide(layoutId)); this.goTo(this.index + 1); },
    duplicate() { this.record(); this.deck().slides.splice(this.index + 1, 0, duplicateSlide(this.cur())); this.goTo(this.index + 1); },
    removeSlide(i) {
      this.record();
      const sl = this.deck().slides;
      sl.splice(i, 1);
      if (!sl.length) sl.push(newSlide("cover"));
      this.index = Math.min(this.index, sl.length - 1);
      this.refresh();
    },
    move(i, d) { const j = i + d; if (j < 0 || j >= this.deck().slides.length) return; this.reorder(i, j); },
    reorder(from, to) {
      if (from == null || from === to) return;
      this.record();
      const sl = this.deck().slides;
      const [s] = sl.splice(from, 1);
      sl.splice(to, 0, s);
      this.index = sl.indexOf(s);
      this.refresh();
    },
    setPresenting(on) {
      this.presenting = on;
      document.body.classList.toggle("presenting", on);
      this.step = 0;
      if (this.freeform) this.freeform.clear();
      if (this.select) this.select.clear();
      this.syncChrome(); this.fit(); this.renderSlide(); this.renderNav();
      try {
        if (on) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
        else if (document.fullscreenElement) document.exitFullscreen();
      } catch (e) { /* ignore */ }
    },
  };

  const history = createHistory({
    getSnapshot: () => JSON.stringify(store.getDeck()),
    applySnapshot: (json) => {
      store.setDeck(JSON.parse(json));
      app.index = Math.min(app.index, app.deck().slides.length - 1);
      app.step = 0;
      app.editing = false;
      app.activeEditable = null;
      if (app.freeform) app.freeform.clear();
      if (app.select) app.select.clear();
      applyDeckTheme(app.deck(), app.stage);
      app.renderSlide();
      app.renderNav();
      app.broadcast();
    },
  });
  app.record = (label) => history.record(label);
  app.undo = () => history.undo();
  app.redo = () => history.redo();

  applyDeckTheme(app.deck(), app.stage);
  initChromeTheme();

  if (isPresenter) {
    initPresenter(app);
    return { app, unmount: () => unmount(app, root) };
  }

  initEditing(app);
  initFreeform(app);
  initSelect(app); // unified selection model (asset + logo); after freeform so it can clear it
  initMaskPanel(app, root); // the recolour-mask popover (#maskpop): owns app.openMask
  app.renderNav = createNavigator(app).render;
  app.broadcast = createSync(app).broadcast;

  wireChrome(app, root);
  app.syncChrome();
  app.fit();
  app.renderSlide();
  app.renderNav();
  // recompute once more after fonts settle (wrapping can change the bar height)
  requestAnimationFrame(() => { app.syncChrome(); app.fit(); app.renderNav(); });

  const onResize = () => { app.syncChrome(); app.fit(); app.renderNav(); if (app.freeform) app.freeform.afterRender(); };
  window.addEventListener("resize", onResize);
  app._onResize = onResize;

  return { app, unmount: () => unmount(app, root) };
}

function wireChrome(app, root) {
  const $ = (sel) => root.querySelector(sel);

  $("#prev").onclick = () => app.go(-1);
  $("#next").onclick = () => app.go(1);
  $("#dupBtn").onclick = () => app.duplicate();
  $("#flip").onclick = () => {
    const s = app.cur().slots;
    if ("flip" in s) { app.record(); s.flip = !s.flip; app.refresh(); }
  };

  // Menu buttons open their options INTO the context bar (centered under the
  // button), not into a bespoke dropdown. Clicking the same open menu closes it.
  const menuBtn = (sel, build) => {
    const btn = $(sel);
    if (!btn) return;
    btn.onclick = (e) => {
      e.stopPropagation();
      const cur = app.select.current();
      if (cur && cur.menu && app._openMenuBtn === btn) { app.select.clear(); app._openMenuBtn = null; return; }
      app._openMenuBtn = btn;
      build(btn);
    };
  };
  menuBtn("#addBtn", (btn) => app.select.openMenu(addSlideMenu(registry.list().map((L) => ({ id: L.id, label: layoutLabel(L) }))), btn));
  menuBtn("#insertBtn", (btn) => app.select.openMenu(insertMenu(), btn));
  menuBtn("#appearBtn", (btn) => app.openAppearance(btn));
  menuBtn("#animBtn", (btn) => app.select.openMenu(animMenu(app.deck().theme.anim), btn));

  // Outside-click closes the mask popover and any open context-bar menu. Stored on
  // app and removed in unmount() (a DOCUMENT-level listener). Each $() is null-guarded.
  const onDocClick = (e) => {
    const cur = app.select.current();
    if (cur && cur.menu && !e.target.closest(".ctxbar") && !e.target.closest("#chrome")) { app.select.clear(); app._openMenuBtn = null; }
    if (!e.target.closest(".logo")) { const lm = $(".logo.menu-open"); if (lm) lm.classList.remove("menu-open"); }
  };
  document.addEventListener("click", onDocClick);
  app._onDocClick = onDocClick;

  $("#present").onclick = () => {
    app.setPresenting(true);
    window.open(location.href.split("?")[0] + "?presenter=1", "slides-presenter", "width=1100,height=720");
  };

  const onKey = (e) => {
    if (e.key === "Escape" && app.presenting) { app.setPresenting(false); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); app.undo(); return; }
      if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); app.redo(); return; }
    }
    if (e.target.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); app.go(1); }
    if (e.key === "ArrowLeft") app.go(-1);
  };
  document.addEventListener("keydown", onKey);
  const onFs = () => { if (!document.fullscreenElement && app.presenting) app.setPresenting(false); };
  document.addEventListener("fullscreenchange", onFs);
  app._onKey = onKey;
  app._onFs = onFs;
}

export function unmount(app, root) {
  try { app.channel.close(); } catch (e) { /* noop */ }
  if (app._onResize) window.removeEventListener("resize", app._onResize);
  if (app._onKey) document.removeEventListener("keydown", app._onKey);
  if (app._onDocClick) document.removeEventListener("click", app._onDocClick);
  if (app._onMaskDocClick) document.removeEventListener("click", app._onMaskDocClick);
  if (app._onFs) document.removeEventListener("fullscreenchange", app._onFs);
  if (root) root.innerHTML = "";
}
