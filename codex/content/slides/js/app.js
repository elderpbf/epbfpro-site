// app.js — composition root. Renders the shell, builds the app controller, and
// injects the Store + behaviours into the engine. Exposes the cohorts-style
// mount(viewEl, ctx) / unmount() contract so Phase 6 folds into Codex unchanged:
// Codex would import { mount } from this file and inject a codexStore instead.
import * as registry from "./layouts/registry.js";
import { createMemoryStore } from "./core/store.js";
import { createHistory } from "./core/history.js";
import { uid, migrateDeck, clone } from "./core/schema.js";
import { newDeck, newSlide, duplicateSlide } from "./core/deck.js";
import { applyDeckTheme, initChromeTheme } from "./theme/tokens.js";
import * as player from "./render/player.js";
import { initEditing } from "./edit/editor.js";
import { initMaskPanel, maskPanelHTML } from "./edit/maskpanel.js";
import { initSelect } from "./select/wiring.js";
import { initReorder } from "./select/reorder.js";
import { insertMenu, appearanceMenu, animMenu } from "./edit/menus.js";
import { addSlidePanelHTML, initAddSlide } from "./edit/addslide.js";
import { createNavigator } from "./edit/navigator.js";
import { createSync, initPresenter } from "./present/presenter.js";
import { t } from "../../../js/i18n.js";
import { makeStubAi } from "./ai/aiService.js";

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
  <button id="dupBtn">⧉ ${t("slides.ed_duplicate")}</button>
  <button id="tplSaveBtn">⊕ ${t("slides.tpl_save")}</button>
  <button id="flip">⇄ ${t("slides.ed_flip")}</button>
  <span class="spacer"></span>
  <button id="insertBtn">＋ ${t("slides.ed_insert")} ▾</button>
  <button id="appearBtn">${t("slides.ed_appearance")} ▾</button>
  <button id="animBtn">${t("slides.ed_anim")} ▾</button>
  <button id="aiFillBtn">${t("slides.ai_fill")}</button>
  <span class="spacer"></span>
  <button id="present" class="primary">▶ ${t("slides.ed_present")}</button>
</div>

<div id="ai-fill-overlay" style="display:none">
  <div id="ai-fill-box">
    <textarea id="ai-fill-intent" rows="3" placeholder="${t("slides.ai_intent_ph")}"></textarea>
    <div class="ai-fill-actions">
      <button id="ai-fill-go" class="cdx-btn cdx-btn-primary" type="button">${t("slides.ai_fill_go")}</button>
      <button id="ai-fill-cancel" class="cdx-btn" type="button">${t("slides.ai_cancel")}</button>
    </div>
    <div class="ai-fill-error" aria-live="polite"></div>
  </div>
</div>

${maskPanelHTML()}
${addSlidePanelHTML()}

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
  migrateDeck(store.getDeck()); // D1: bring legacy decks (string topics, id-less cards) to current schema before first render
  // ctx.aiService: injected by content/slides.js (the integration wrapper) so the
  // vendored core never imports the codex-api facade directly. Falls back to a stub.
  const aiService = ctx.aiService || null;
  // ctx.library: the template library service (same injection rule as aiService).
  // Absent in the standalone dev build, so the template UI stays hidden there.
  const library = ctx.library || null;

  const app = {
    isPresenter,
    store,
    _aiService: aiService,
    _library: library,
    // When a saved layout is being edited in place, this holds { id, slideId, name }:
    // saving the slide whose id is slideId OVERWRITES template id (not a new save).
    _editingTpl: null,
    _layoutLabel: layoutLabel, // i18n layout label resolver (the add-slide picker reuses it)
    index: 0,
    step: 0,
    presenting: false,
    editing: false,
    activeEditable: null,
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
      if (this.select) this.select.afterRender();
      if (this.reorder) this.reorder.afterRender(); // inject drag grips on cards/topics
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
      if (this.select) this.select.clear();
      this.renderSlide(); this.renderNav(); this.broadcast();
    },
    // jump to slide i. NOT named `select`: wiring.js owns app.select (the selection
    // object), so this nav method must not collide with it.
    goTo(i) {
      this.index = i; this.step = 0;
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
    // add-slide layout picker, opened into the context bar from the thumbnail-rail
    // "＋ slide" button (anchor null -> centered, since the rail sits left of the stage).
    // openAddSlide is assigned by initAddSlide (the modal preview picker), which
    // owns the +slide entry the nav rail calls.

    // ── Template library (4c.1 + the add-slide modal) ─────────────────────────
    // Both no-op when no library is injected (standalone build). saveCurrentAsTemplate
    // saves the current slide as a reusable layout; insertTemplate drops a detached
    // deep-clone (the modal's "Salvos" cards call it). Both own the full
    // record-then-mutate-then-refresh pattern.
    async saveCurrentAsTemplate(name) {
      if (!this._library) return { error: "no-library" };
      // Edit-in-place: if the current slide is the one we inserted to edit a saved
      // layout, OVERWRITE that template (keep its id) instead of appending a copy.
      const editing = this._editingTpl && this.cur() && this.cur().id === this._editingTpl.slideId;
      try {
        if (editing) {
          const tpl = await this._library.update(this._editingTpl.id, this.cur(), name);
          this._editingTpl = null;
          return { ok: true, updated: true, tpl };
        }
        const tpl = await this._library.save(this.cur(), name);
        return { ok: true, tpl };
      } catch (e) {
        return { error: (e && e.message) || "save-failed" };
      }
    },
    // Rename a saved layout (metadata only). Wrapper over the library service so the
    // modal never touches it directly; record-then-mutate is moot (no deck change).
    async renameTemplate(id, name) {
      if (!this._library) return { error: "no-library" };
      try { await this._library.rename(id, name); return { ok: true }; }
      catch (e) { return { error: (e && e.message) || "rename-failed" }; }
    },
    // Delete a saved layout. Detached: any deck that already inserted a copy is safe.
    async deleteTemplate(id) {
      if (!this._library) return { error: "no-library" };
      try { await this._library.remove(id); return { ok: true }; }
      catch (e) { return { error: (e && e.message) || "delete-failed" }; }
    },
    // Insert a DETACHED deep-clone of a template after the current slide: a fresh
    // slide id so it shares no identity with the library copy, and the library-only
    // `name` stripped (it is not a slide field). Branding stays deck-level, so the
    // inserted slide picks up THIS deck's logo + theme automatically.
    insertTemplate(tpl) {
      if (!tpl || !tpl.slide) return;
      this.record();
      const s = clone(tpl.slide);
      s.id = uid();
      delete s.name;
      this.deck().slides.splice(this.index + 1, 0, s);
      this.goTo(this.index + 1);
    },
    // Edit a saved layout MANUALLY: insert a detached copy as a new slide to edit,
    // and remember which template it came from so the next save-as-layout overwrites
    // it (see saveCurrentAsTemplate). insertTemplate already navigated to the copy,
    // so cur() is it.
    editTemplate(tpl) {
      if (!tpl || !tpl.slide) return;
      this.insertTemplate(tpl);
      this._editingTpl = { id: tpl.id, slideId: this.cur().id, name: tpl.name || "" };
    },

    // insert a free element (movable on any slide) of the given type
    insertElement(type) {
      const c = this.deck().canvas;
      // "list" (and later "cards") is a STACK, not a single box: a free-placed asset
      // whose items live in slots[listKey], so the whole topic machinery (select /
      // edit / add / remove / reorder) drives them with no new selection code. Starts
      // as a stack of one and grows via the container's ＋ like any list.
      if (type === "list") {
        const listKey = "ins" + uid();
        this.cur().slots[listKey] = [{ id: uid(), text: t("slides.ed_new_topic") }];
        this.record();
        this.deck().assets.push({ id: uid(), type: "stack", variant: "list", listKey, x: c.w / 2 - 200, y: c.h / 2 - 60, w: 400, rot: 0, scope: "slide", slideId: this.cur().id });
        this.refresh();
        return;
      }
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
      if (this.select) this.select.clear();
      this.syncChrome(); this.fit(); this.renderSlide(); this.renderNav();
      try {
        if (on) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
        else if (document.fullscreenElement) document.exitFullscreen();
      } catch (e) { /* ignore */ }
    },

    // fillSlideWithAI — calls the AI service for the current slide's layout +
    // the user's intent, then merges the returned slots and refreshes.
    // Mirrors the record-then-mutate-then-refresh pattern used by all app.* methods.
    // ctx.aiService (injected by the integration layer) drives the real AI call;
    // falls back to makeStubAi() so the standalone dev build still works.
    // Returns { ok: true } or { error } so the overlay caller can report errors
    // without this module needing to import notice.js.
    async fillSlideWithAI(intent) {
      const svc = this._aiService || makeStubAi();
      const layout = this.layoutOf(this.cur());
      const result = await svc.fill(layout, intent);
      if (result.error) {
        return { error: result.error };
      }
      this.record("ai-fill");
      Object.assign(this.cur().slots, result.slots);
      this.refresh();
      return { ok: true };
    },
  };

  const history = createHistory({
    getSnapshot: () => JSON.stringify(store.getDeck()),
    applySnapshot: (json) => {
      store.setDeck(JSON.parse(json));
      migrateDeck(store.getDeck()); // idempotent: a pre-migration snapshot is upgraded on restore
      app.index = Math.min(app.index, app.deck().slides.length - 1);
      app.step = 0;
      app.editing = false;
      app.activeEditable = null;
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
  initSelect(app); // unified selection model: every selectable kind + the one context bar
  initReorder(app); // drag-and-drop reorder for cards + topics (grips injected post-render)
  initMaskPanel(app, root); // the recolour-mask popover (#maskpop): owns app.openMask
  initAddSlide(app, root); // the +slide modal preview picker: owns app.openAddSlide
  app.renderNav = createNavigator(app).render;
  app.broadcast = createSync(app).broadcast;

  wireChrome(app, root);
  app.syncChrome();
  app.fit();
  app.renderSlide();
  app.renderNav();
  // recompute once more after fonts settle (wrapping can change the bar height)
  requestAnimationFrame(() => { app.syncChrome(); app.fit(); app.renderNav(); });

  const onResize = () => { app.syncChrome(); app.fit(); app.renderNav(); };
  window.addEventListener("resize", onResize);
  app._onResize = onResize;

  return { app, unmount: () => unmount(app, root) };
}

function wireChrome(app, root) {
  const $ = (sel) => root.querySelector(sel);

  $("#dupBtn").onclick = () => app.duplicate();

  // Save-as-template: only meaningful when a library service is injected; hidden
  // otherwise (standalone build). A lightweight name prompt (modal parity is a
  // follow-up, mirrors the deck-list delete confirm in content/slides.js).
  const tplBtn = $("#tplSaveBtn");
  if (tplBtn) {
    if (!app._library) {
      tplBtn.style.display = "none";
    } else {
      tplBtn.onclick = () => {
        // Editing a saved layout (inserted via "editar")? Pre-fill its name and ask
        // with the update wording, so saving overwrites that template, not a copy.
        const editing = app._editingTpl && app.cur() && app.cur().id === app._editingTpl.slideId;
        // eslint-disable-next-line no-alert
        const name = window.prompt(
          editing ? t("slides.tpl_update_prompt") : t("slides.tpl_save_prompt"),
          editing ? app._editingTpl.name : "",
        );
        if (name == null) return; // cancelled
        app.saveCurrentAsTemplate(name).then((res) => {
          if (res && res.error && window.bsLog) window.bsLog("Save template: " + res.error, "error");
        });
      };
    }
  }

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
  menuBtn("#insertBtn", (btn) => app.select.openMenu(insertMenu(), btn));
  menuBtn("#appearBtn", (btn) => app.openAppearance(btn));
  menuBtn("#animBtn", (btn) => app.select.openMenu(animMenu(app.deck().theme.anim, app.cur().slots.reveal, "reveal" in app.cur().slots), btn));

  // Outside-click closes the mask popover and any open context-bar menu. Stored on
  // app and removed in unmount() (a DOCUMENT-level listener). Each $() is null-guarded.
  // Click-away dismissal. Never fires while editing text (guarded) or for clicks on
  // the bar / selection frame / chrome. An open MENU closes on any other click
  // (incl. the stage); a SELECTION closes only on a click fully outside the editor
  // surfaces — the stage's own pointerdown already clears a selection on empty space.
  const onDocClick = (e) => {
    const cur = app.select.current();
    if (!cur || app.editing) return;
    const onChrome = e.target.closest(".ctxbar") || e.target.closest("#chrome") || e.target.closest(".selbox") || e.target.closest(".cdx-dropdown");
    if (cur.menu) {
      if (!onChrome) { app.select.clear(); app._openMenuBtn = null; }
    } else if (!onChrome && !e.target.closest("#stage")) {
      app.select.clear();
    }
  };
  document.addEventListener("click", onDocClick);
  app._onDocClick = onDocClick;

  $("#present").onclick = () => {
    app.setPresenting(true);
    window.open(location.href.split("?")[0] + "?presenter=1", "slides-presenter", "width=1100,height=720");
  };

  // AI-fill overlay: the "IA" button in the chrome bar shows a small overlay
  // with a textarea for the user's intent. "Preencher" calls app.fillSlideWithAI.
  const aiOverlay = $("#ai-fill-overlay");
  const aiIntent = $("#ai-fill-intent");
  const aiGoBtn = $("#ai-fill-go");
  const aiCancelBtn = $("#ai-fill-cancel");
  const openAiOverlay = () => {
    aiIntent.value = "";
    aiOverlay.style.display = "";
    aiIntent.focus();
  };
  const closeAiOverlay = () => { aiOverlay.style.display = "none"; };
  const aiFillBtn = $("#aiFillBtn");
  if (aiFillBtn) aiFillBtn.onclick = (e) => { e.stopPropagation(); openAiOverlay(); };
  if (aiCancelBtn) aiCancelBtn.onclick = closeAiOverlay;
  // Click the dim backdrop (outside the box) to dismiss the overlay.
  if (aiOverlay) aiOverlay.addEventListener("mousedown", (e) => { if (e.target === aiOverlay) closeAiOverlay(); });
  if (aiGoBtn) aiGoBtn.onclick = async () => {
    const intent = aiIntent.value.trim();
    if (!intent) return;
    const errEl = aiOverlay.querySelector(".ai-fill-error");
    if (errEl) errEl.textContent = "";
    aiGoBtn.disabled = true;
    aiGoBtn.textContent = "...";
    try {
      const res = await app.fillSlideWithAI(intent);
      if (res && res.error) {
        if (errEl) errEl.textContent = t("slides.ai_error");
        // Surface the real cause to the debug/error pill (every error must reach it).
        if (window.bsLog) window.bsLog("AI-fill: " + res.error, "error");
      } else {
        closeAiOverlay();
      }
    } finally {
      aiGoBtn.disabled = false;
      aiGoBtn.textContent = t("slides.ai_fill_go");
    }
  };
  if (aiIntent) aiIntent.addEventListener("keydown", (e) => { if (e.key === "Enter") e.stopPropagation(); });

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
  if (app._onAddSlideKey) document.removeEventListener("keydown", app._onAddSlideKey, true);
  if (app._onFs) document.removeEventListener("fullscreenchange", app._onFs);
  if (root) root.innerHTML = "";
}
