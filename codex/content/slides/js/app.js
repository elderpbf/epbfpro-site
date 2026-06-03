// app.js — composition root. Renders the shell, builds the app controller, and
// injects the Store + behaviours into the engine. Exposes the cohorts-style
// mount(viewEl, ctx) / unmount() contract so Phase 6 folds into Codex unchanged:
// Codex would import { mount } from this file and inject a codexStore instead.
import * as registry from "./layouts/registry.js";
import { createMemoryStore } from "./core/store.js";
import { createHistory } from "./core/history.js";
import { getByPath, uid } from "./core/schema.js";
import { newDeck, newSlide, duplicateSlide } from "./core/deck.js";
import { applyDeckTheme, initChromeTheme } from "./theme/tokens.js";
import * as player from "./render/player.js";
import { initEditing } from "./edit/editor.js";
import { initFreeform } from "./edit/freeform.js";
import { initSelect } from "./select/wiring.js";
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
  <div class="menu" id="addMenu"><button id="addBtn">＋ ${t("slides.ed_slide")}</button><div class="pop" id="addPop"></div></div>
  <button id="dupBtn">⧉ ${t("slides.ed_duplicate")}</button>
  <button id="flip">⇄ ${t("slides.ed_flip")}</button>
  <div class="menu" id="insertMenu"><button id="insertBtn">＋ ${t("slides.ed_insert")}</button><div class="pop" id="insertPop">
    <button data-insert="text">${t("slides.ed_text")}</button>
    <button data-insert="title">${t("slides.ed_title")}</button>
    <button data-insert="image">${t("slides.ed_image")}</button>
    <button data-insert="photo">${t("slides.ed_photo")}</button>
    <button data-insert="video">${t("slides.ed_video")}</button>
  </div></div>
  <span class="spacer"></span>
  <div class="menu" id="appearMenu"><button id="appearBtn">${t("slides.ed_appearance")} ▾</button><div class="pop" id="appearPop">
    <label>${t("slides.ed_font")} <input type="range" id="fontScale" min="0.7" max="1.5" step="0.05" value="1"></label>
    <button id="fontScope" title="${t("slides.ed_font_scope_title")}">${t("slides.ed_scope_all")}</button>
    <label>${t("slides.ed_accent")} <input type="color" id="accent" value="#14b8a6"></label>
    <label>${t("slides.ed_text_color")} <input type="color" id="ink" value="#134e4a"></label>
    <label>${t("slides.ed_art")} <input type="color" id="motifColor" value="#14b8a6"></label>
  </div></div>
  <label class="anim-ctl"><select id="anim" title="${t("slides.ed_anim")}"><option value="fade-up">${t("slides.ed_anim_fadeup")}</option><option value="fade">${t("slides.ed_anim_fade")}</option><option value="none">${t("slides.ed_anim_none")}</option></select></label>
  <button id="present" class="primary">▶ ${t("slides.ed_present")}</button>
</div>

<div id="fmt">
  <button data-fs="-3">A−</button><button data-fs="3">A＋</button>
  <button id="bold"><b>B</b></button>
  <label>${t("slides.ed_color")} <input type="color" id="color" value="#134e4a"></label>
</div>

<div id="maskpop">
  <div class="mp-types"><button data-mtype="none">${t("slides.ed_mask_none")}</button><button data-mtype="color">${t("slides.ed_mask_color")}</button><button data-mtype="gradient">${t("slides.ed_mask_gradient")}</button></div>
  <div class="mp-field"><span>${t("slides.ed_color")}</span><input type="color" id="mc1" value="#14b8a6"></div>
  <div class="mp-field mp-g"><span>${t("slides.ed_color2")}</span><input type="color" id="mc2" value="#0d9488"></div>
  <div class="mp-field mp-g"><span>${t("slides.ed_angle")}</span><input type="range" id="mang" min="0" max="360" value="45"></div>
</div>

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
    maskTarget: null,
    record() {}, // assigned once history exists (below)
    undo() {},
    redo() {},
    channel: new BroadcastChannel("slides-v8"),
    stage: $("#stage"),
    stagebox: $("#stagebox"),
    stagewrap: $("#stagewrap"),
    nav: $("#nav"),
    fmt: $("#fmt"),
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
    // reflect the font slider / its scope label for the current slide
    syncFontSlider() {
      const el = root.querySelector("#fontScale");
      if (!el) return;
      const d = this.deck();
      el.value = this.fontScope === "slide" ? player.effFontScale(d, this.cur()) : d.theme.fontScale;
      const btn = root.querySelector("#fontScope");
      if (btn) btn.textContent = this.fontScope === "slide" ? "este" : "tudo";
    },
    // push deck theme values back into the chrome inputs (after undo/redo)
    syncThemeControls() {
      const d = this.deck();
      const set = (id, v) => { const el = root.querySelector(id); if (el) el.value = v; };
      set("#accent", d.theme.accent);
      set("#ink", d.theme.ink);
      set("#motifColor", d.theme.motif);
      set("#anim", d.theme.anim);
      this.syncFontSlider();
    },
    // the image object a mask popover is currently targeting (slot or asset)
    maskObj() {
      const t = this.maskTarget;
      if (!t) return null;
      return t.kind === "asset" ? this.deck().assets.find((a) => a.id === t.id) : getByPath(this.cur().slots, t.path);
    },
    openMask(target, anchorEl) {
      this.maskTarget = target;
      const pop = root.querySelector("#maskpop");
      const obj = this.maskObj();
      const mask = obj && obj.mask;
      if (mask) {
        root.querySelector("#mc1").value = mask.c1 || "#14b8a6";
        if (mask.type === "gradient") {
          root.querySelector("#mc2").value = mask.c2 || "#0d9488";
          root.querySelector("#mang").value = mask.angle || 45;
        }
      }
      pop.classList.toggle("grad", !!mask && mask.type === "gradient");
      const r = anchorEl.getBoundingClientRect();
      pop.style.display = "flex";
      const pw = pop.offsetWidth || 220;
      pop.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left)) + "px";
      pop.style.top = r.bottom + 8 + "px";
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
      this.renderSlide(); this.renderNav(); this.syncFontSlider(); this.broadcast();
    },
    select(i) {
      this.index = i; this.step = 0;
      if (this.freeform) this.freeform.clear();
      if (this.select) this.select.clear();
      this.renderSlide(); this.renderNav(); this.syncFontSlider(); this.broadcast();
    },

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
    addSlide(layoutId) { this.record(); this.deck().slides.splice(this.index + 1, 0, newSlide(layoutId)); this.select(this.index + 1); },
    duplicate() { this.record(); this.deck().slides.splice(this.index + 1, 0, duplicateSlide(this.cur())); this.select(this.index + 1); },
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
      app.syncThemeControls();
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
  const fmt = app.fmt;

  // format toolbar: act on the active editable; mousedown+preventDefault keeps focus.
  // Each change records (undo-coalesced per element) and persists the resulting
  // inline style onto the model so a re-render keeps it (see persistTextStyle).
  const styleLabel = (el) => "style:" + (el.dataset.aid || el.dataset.path || "?");
  fmt.querySelectorAll("[data-fs]").forEach((b) =>
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const el = app.activeEditable;
      if (!el) return;
      app.record(styleLabel(el));
      el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) + +b.dataset.fs + "px";
      persistTextStyle(app, el);
    })
  );
  $("#bold").addEventListener("mousedown", (e) => {
    e.preventDefault();
    const el = app.activeEditable;
    if (!el) return;
    app.record(styleLabel(el));
    el.style.fontWeight = getComputedStyle(el).fontWeight >= 700 ? "400" : "900";
    persistTextStyle(app, el);
  });
  $("#color").addEventListener("input", (e) => {
    const el = app.activeEditable;
    if (!el) return;
    app.record(styleLabel(el) + ":color");
    el.style.color = e.target.value;
    persistTextStyle(app, el);
  });

  $("#prev").onclick = () => app.go(-1);
  $("#next").onclick = () => app.go(1);
  $("#dupBtn").onclick = () => app.duplicate();
  $("#flip").onclick = () => {
    const s = app.cur().slots;
    if ("flip" in s) { app.record(); s.flip = !s.flip; app.refresh(); }
  };

  const addPop = $("#addPop");
  addPop.innerHTML = registry.list().map((L) => `<button data-layout="${L.id}">${layoutLabel(L)}</button>`).join("");
  $("#addBtn").onclick = (e) => { e.stopPropagation(); $("#addMenu").classList.toggle("open"); };
  addPop.querySelectorAll("[data-layout]").forEach((b) => (b.onclick = () => { app.addSlide(b.dataset.layout); $("#addMenu").classList.remove("open"); }));
  // Close the menus/popover on any outside click. Stored on app and removed in
  // unmount(): this is a DOCUMENT-level listener, so leaving it attached after
  // teardown means it fires against a detached DOM and throws on null elements
  // (the repeated "classList of null" seen when reopening the editor). Each $()
  // is null-guarded as a second line of defence.
  const onDocClick = (e) => {
    const addMenu = $("#addMenu"), insertMenu = $("#insertMenu"), appearMenu = $("#appearMenu"), mp = $("#maskpop");
    if (addMenu && !e.target.closest("#addMenu")) addMenu.classList.remove("open");
    if (insertMenu && !e.target.closest("#insertMenu")) insertMenu.classList.remove("open");
    if (appearMenu && !e.target.closest("#appearMenu")) appearMenu.classList.remove("open");
    if (mp && !e.target.closest("#maskpop") && !e.target.closest("[data-mask]") && !e.target.closest("[data-asmask]")) mp.style.display = "none";
    if (!e.target.closest(".logo")) { const lm = $(".logo.menu-open"); if (lm) lm.classList.remove("menu-open"); }
  };
  document.addEventListener("click", onDocClick);
  app._onDocClick = onDocClick;

  const insertPop = $("#insertPop");
  $("#insertBtn").onclick = (e) => { e.stopPropagation(); $("#insertMenu").classList.toggle("open"); };
  insertPop.querySelectorAll("[data-insert]").forEach((b) => (b.onclick = () => { app.insertElement(b.dataset.insert); $("#insertMenu").classList.remove("open"); }));

  // Aparência / Appearance: the deck-wide look controls (font, scope, accent, ink,
  // motif) collapse behind one dropdown so the bar stays a single row.
  $("#appearBtn").onclick = (e) => { e.stopPropagation(); $("#appearMenu").classList.toggle("open"); };

  $("#fontScale").addEventListener("input", (e) => {
    app.record("font:" + app.fontScope);
    const v = +e.target.value;
    if (app.fontScope === "slide") app.cur().fontScale = v;
    else app.deck().theme.fontScale = v;
    applyDeckTheme(app.deck(), app.stage);
    app.renderSlide();
    app.renderNav();
    app.commit();
    app.broadcast();
  });
  $("#fontScope").onclick = () => {
    app.fontScope = app.fontScope === "all" ? "slide" : "all";
    app.syncFontSlider();
  };
  $("#accent").addEventListener("input", (e) => { app.record("theme:accent"); app.deck().theme.accent = e.target.value; applyDeckTheme(app.deck(), app.stage); app.commit(); app.broadcast(); });
  $("#ink").addEventListener("input", (e) => { app.record("theme:ink"); app.deck().theme.ink = e.target.value; applyDeckTheme(app.deck(), app.stage); app.commit(); app.broadcast(); });
  $("#motifColor").addEventListener("input", (e) => { app.record("theme:motif"); app.deck().theme.motif = e.target.value; applyDeckTheme(app.deck(), app.stage); app.commit(); app.broadcast(); });
  $("#anim").value = app.deck().theme.anim;
  $("#anim").addEventListener("change", (e) => { app.record("theme:anim"); app.deck().theme.anim = e.target.value; applyDeckTheme(app.deck(), app.stage); app.commit(); app.broadcast(); });

  // mask popover: type buttons + live colour/angle, operating on app.maskObj()
  const maskpop = $("#maskpop");
  maskpop.querySelectorAll("[data-mtype]").forEach((b) => (b.onclick = () => {
    const obj = app.maskObj();
    if (!obj) return;
    app.record("mask");
    const type = b.dataset.mtype;
    if (type === "none") obj.mask = null;
    else if (type === "color") obj.mask = { type: "color", c1: $("#mc1").value };
    else obj.mask = { type: "gradient", c1: $("#mc1").value, c2: $("#mc2").value, angle: +$("#mang").value };
    maskpop.classList.toggle("grad", type === "gradient");
    app.refresh();
  }));
  const liveMask = () => {
    const obj = app.maskObj();
    if (!obj || !obj.mask) return;
    app.record("mask:live");
    obj.mask.c1 = $("#mc1").value;
    if (obj.mask.type === "gradient") { obj.mask.c2 = $("#mc2").value; obj.mask.angle = +$("#mang").value; }
    app.refresh();
  };
  ["#mc1", "#mc2", "#mang"].forEach((id) => $(id).addEventListener("input", liveMask));

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

// Persist the editable's block-level inline style ({fontSize, fontWeight, color})
// onto the model so it survives a re-render: per-asset in asset.style, per-slot in
// slide.textStyle[path]. player.applyTextStyles re-applies it after each render.
// (Replaces the old commitText no-op, which only touched the store and dropped the
// style the moment the slide re-rendered.)
function persistTextStyle(app, el) {
  const st = {
    fs: parseFloat(el.style.fontSize) || undefined,
    fw: el.style.fontWeight || undefined,
    color: el.style.color || undefined,
  };
  if (el.dataset.aid) {
    const a = app.deck().assets.find((x) => x.id === el.dataset.aid);
    if (a) a.style = st;
  } else if (el.dataset.path) {
    (app.cur().textStyle = app.cur().textStyle || {})[el.dataset.path] = st;
  } else return;
  app.commit();
  app.broadcast();
}

export function unmount(app, root) {
  try { app.channel.close(); } catch (e) { /* noop */ }
  if (app._onResize) window.removeEventListener("resize", app._onResize);
  if (app._onKey) document.removeEventListener("keydown", app._onKey);
  if (app._onDocClick) document.removeEventListener("click", app._onDocClick);
  if (app._onFs) document.removeEventListener("fullscreenchange", app._onFs);
  if (root) root.innerHTML = "";
}
