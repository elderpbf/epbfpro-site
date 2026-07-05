// app.js — composition root. Renders the shell, builds the app controller, and
// injects the Store + behaviours into the engine. Exposes the cohorts-style
// mount(viewEl, ctx) / unmount() contract so Phase 6 folds into Codex unchanged:
// Codex would import { mount } from this file and inject a codexStore instead.
import * as registry from "./layouts/registry.js";
import { createMemoryStore } from "./core/store.js";
import { createHistory } from "./core/history.js";
import { uid, migrateDeck, clone, clearTextOverrides, setPath, canvasForAspect, ASPECTS, reanchorDeck, clampToCanvas } from "./core/schema.js";
import { newDeck, newSlide, duplicateSlide } from "./core/deck.js";
import { addImage, removeImage, getImage } from "./core/gallery.js";
import { makeDataUrlStore } from "./core/files.js";
import { openGalleryBox, refreshGalleryBox, closeGalleryBox } from "./edit/gallerybox.js";
import { applyDeckTheme, initChromeTheme } from "./theme/tokens.js";
import * as player from "./render/player.js";
import { moveKey } from "./render/animsteps.js";
import { initEditing } from "./edit/editor.js";
import { initMaskPanel, maskPanelHTML } from "./edit/maskpanel.js";
import { initSelect } from "./select/wiring.js";
import { initReorder } from "./select/reorder.js";
import { insertMenu, appearanceMenu } from "./edit/menus.js";
import { addSlidePanelHTML, initAddSlide } from "./edit/addslide.js";
import { openThemeBox, refreshThemeBox, closeThemeBox } from "./edit/themebox.js";
import { openAnimPanel, closeAnimPanel } from "./edit/animpanel.js";
import { snapshotTheme, applyThemeFields } from "./theme/presets.js";
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

// Inline SVG glyphs for the three presenter clocks (currentColor, so theme-driven).
const G_CLOCK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3.5 2"/></svg>';
const G_STOPWATCH = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 2.5h6M12 2.5v2.5M18.5 6l1.2-1.2"/><circle cx="12" cy="13" r="7.5"/><path d="M12 13V9"/></svg>';
const G_HOURGLASS = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 21h12M7.5 3c0 4.5 4.5 6 4.5 9s-4.5 4.5-4.5 9M16.5 3c0 4.5-4.5 6-4.5 9s4.5 4.5 4.5 9"/></svg>';

// SHELL is built per-mount so every user-facing string resolves through t() in
// the active language (the dictionary may switch between mounts).
const shellHTML = () => `
<div id="chrome">
  <button id="dupBtn">⧉ ${t("slides.ed_duplicate")}</button>
  <button id="tplSaveBtn">⊕ ${t("slides.tpl_save")}</button>
  <button id="flip">⇄ ${t("slides.ed_flip")}</button>
  <span class="spacer"></span>
  <button id="insertBtn">＋ ${t("slides.ed_insert")} ▾</button>
  <button id="appearBtn">${t("slides.ed_theme")} ▾</button>
  <button id="animBtn">${t("slides.ed_anim")} ▾</button>
  <button id="aiFillBtn">${t("slides.ai_fill")}</button>
  <button id="notesBtn">📝 ${t("slides.ed_notes")}</button>
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
<div id="notesbar"><div class="nb-label">${t("slides.ed_notes")}</div><textarea id="notesarea" placeholder="${t("slides.ed_notes_ph")}"></textarea></div>

<!-- Presenter overlays (Phase 4), audience-window only: B/W blank, jump-to-slide readout, end-of-deck. -->
<div id="blankout"></div>
<div id="jumpind"></div>
<div id="endout"><div class="eo-box"><div class="eo-title">${t("slides.ed_end_title")}</div><div class="eo-hint">${t("slides.ed_end_hint")}</div></div></div>

<div id="pv">
  <div class="pvtop">
    <div class="pvtimes">
      <span class="pvt pvt-clock" title="${t("slides.pv_now_time")}"><i class="pvg">${G_CLOCK}</i><b id="pvClock">--:--</b></span>
      <span class="pvt pvt-sw" title="${t("slides.pv_stopwatch")}"><i class="pvg">${G_STOPWATCH}</i><b id="pvSw">00:00</b>
        <button class="pvctl" data-t="sw" data-a="toggle" title="${t("slides.pv_pause_resume")}">⏸</button>
        <button class="pvctl" data-t="sw" data-a="reset" title="${t("slides.pv_reset")}">↺</button></span>
      <span class="pvt pvt-cd" title="${t("slides.pv_countdown")}"><i class="pvg">${G_HOURGLASS}</i><b id="pvCd" title="${t("slides.pv_cd_set")}">15:00</b>
        <button class="pvctl" data-t="cd" data-a="toggle" title="${t("slides.pv_start_pause")}">▶</button>
        <button class="pvctl" data-t="cd" data-a="reset" title="${t("slides.pv_reset")}">↺</button></span>
    </div>
    <div class="pvright">
      <span class="pos" id="pvPos">1 / 1</span>
      <div class="pvbtns">
        <button class="pvbtn" id="pvBlack"><span class="pvchip pvchip-black"></span> ${t("slides.pv_btn_black")} <kbd>B</kbd></button>
        <button class="pvbtn" id="pvWhite"><span class="pvchip pvchip-white"></span> ${t("slides.pv_btn_white")} <kbd>W</kbd></button>
        <button class="pvbtn" id="pvRestart">↺ ${t("slides.pv_btn_restart")} <kbd>R</kbd></button>
      </div>
    </div>
  </div>
  <div class="now"><div class="label">${t("slides.ed_current_slide")}</div><div class="mini"><div class="scale" id="pvNow"></div></div></div>
  <div class="next"><div class="label">${t("slides.ed_next_slide")}</div><div class="mini"><div class="scale" id="pvNext"></div></div></div>
  <textarea class="notes" id="pvNotes" placeholder="${t("slides.ed_notes_ph")}"></textarea>
  <div class="pvslides"><div class="label">${t("slides.pv_slides")}</div><div class="pvlist" id="pvList"></div></div>
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
  // ctx.imageStore: the gallery's storage seam (R2 upload in the deployed app, data-URL
  // otherwise). Absent in the standalone/harness build -> embed images as data URLs, so
  // the gallery still works. See adapters/imageStore.js.
  const imageStore = ctx.imageStore || makeDataUrlStore();
  // ctx.drivePicker: the Google Drive image importer (Picker API). Absent in the harness
  // and disabled until a Picker API key is configured; the gallery's Drive button feature-
  // detects it. See adapters/drivePicker.js.
  const drivePicker = ctx.drivePicker || null;
  // ctx.notify: injected toast function (Codex passes toast.ok). Kept out of the vendored
  // core as an adapter so the core stays portable; the presenter uses it for "notes saved".
  const notify = typeof ctx.notify === "function" ? ctx.notify : null;

  const app = {
    isPresenter,
    store,
    _aiService: aiService,
    _library: library,
    _imageStore: imageStore,
    _drivePicker: drivePicker,
    _notify: notify, // injected toast (Codex boot passes toast.ok); presenter "notes saved"
    // When a saved layout is being edited in place, this holds { id, slideId, name }:
    // saving the slide whose id is slideId OVERWRITES template id (not a new save).
    _editingTpl: null,
    _layoutLabel: layoutLabel, // i18n layout label resolver (the add-slide picker reuses it)
    index: 0,
    step: 0,
    _maxStep: 0, // reveal-step count of the current slide, assigned by player.autoSteps in renderSlide
    presenting: false,
    blank: null,   // presenting only: null | "black" | "white" (B/W blank the audience) — 4A
    atEnd: false,  // presenting only: showing the end-of-deck screen — 4C
    jumpBuf: "",   // presenting only: digits typed for jump-to-slide, committed on Enter — 4B
    previewing: false, // Phase 7: in-editor step-through of THIS slide (no fullscreen/2nd window)
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
    // maxStep = the count assigned by player.autoSteps at the LAST renderSlide (the
    // centralized one-by-one ordering), not the layout's reveals(): all content blocks
    // animate, in DOM order, with one source of truth.
    maxStep() { return this._maxStep || 0; },
    _stepMode() { return this.presenting || this.previewing; }, // reveal steps honoured while presenting OR previewing
    effMax() { return this._stepMode() ? this.maxStep() : 0; },
    scaleNow() { return player.scaleOf(this.stage, this.deck().canvas.w); },
    fit() { return player.fit(this.stagewrap, this.stagebox, this.stage, this.deck().canvas, this.presenting ? 0 : 40); },
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
      player.fitToCanvas(this.stage, d.canvas); // Phase 8 reflow: shrink font if flow content overflows the canvas
      this._maxStep = player.autoSteps(this.stage, s.build, s.buildFx); // ordered reveal plan (Phase 7) + per-unit effect (Phase 9)
      player.applySteps(this.stage, this.step, this._stepMode());
      if (this.select) this.select.afterRender();
      if (this.reorder) this.reorder.afterRender(); // inject drag grips on cards/topics
      // ⇄ Inverter only does something on layouts that carry a `flip` slot (split)
      const fb = root.querySelector("#flip");
      if (fb) fb.style.display = "flip" in s.slots ? "" : "none";
      this.syncNotes();
    },
    // Notes authoring: mirror the current slide's notes into the notes textarea (unless
    // it's being typed in). Written back on input by the wiring in wireChrome; the same
    // slide.notes the presenter panel reads, so authoring + presenting share one field.
    syncNotes() {
      const ta = this.root.querySelector("#notesarea");
      if (ta && document.activeElement !== ta) ta.value = this.cur().notes || "";
    },

    // ── Animation build (Phase 7) ─────────────────────────────────────────────
    // slide.build is the explicit ordered reveal plan (see render/animsteps.js). It stays
    // ABSENT while the slide follows the auto one-by-one default; the first edit
    // MATERIALIZES it from the current auto order (player.animSeed) so nothing on screen
    // jumps. From then on it is explicit (an empty array = "animate nothing").
    _ensureBuild() {
      const s = this.cur();
      if (!s.build) s.build = player.animSeed(this.stage);
      return s.build;
    },
    // include / exclude a singleton (free asset, image slot, text box) from the animation.
    animToggle(key, on) {
      this.record("anim:toggle");
      const b = this._ensureBuild();
      if (on) { if (!b.includes(key)) this.cur().build = [...b, key]; }
      else this.cur().build = b.filter((k) => k !== key);
      this._afterAnim();
    },
    // set a whole DECK's animation: "each" (item a item), "unit" (all at once) or "none"
    // (fixed). Keeps the deck's place in the reveal order if it already had one.
    animListMode(list, mode) {
      this.record("anim:deck");
      const b = this._ensureBuild();
      const at = b.findIndex((k) => k === "each:" + list || k === "unit:" + list);
      const out = b.filter((k) => k !== "each:" + list && k !== "unit:" + list);
      if (mode !== "none") {
        const key = mode === "unit" ? "unit:" + list : "each:" + list;
        if (at >= 0) out.splice(Math.min(at, out.length), 0, key);
        else out.push(key);
      }
      this.cur().build = out;
      this._afterAnim();
    },
    // reorder a singleton unit one slot earlier (-1) / later (+1) in the reveal order.
    animMove(key, dir) {
      this.record("anim:move");
      this.cur().build = moveKey(this._ensureBuild(), key, dir);
      this._afterAnim();
    },
    // reorder a whole DECK one slot earlier / later (finds its current each:/unit: key).
    animListMove(list, dir) {
      this.record("anim:move");
      const b = this._ensureBuild();
      const key = b.find((k) => k === "each:" + list || k === "unit:" + list);
      if (key) this.cur().build = moveKey(b, key, dir);
      this._afterAnim();
    },
    // ── Animation panel data + preview (Phase 7) ──────────────────────────────
    // Refresh the slide AND, if the panel is open, itself (registered via _animPanelRefresh).
    _afterAnim() { this.refresh(); if (this._animPanelRefresh) this._animPanelRefresh(); },
    animUnits() { return player.animUnits(this.stage, this.cur().build); }, // ordered animated units, labelled
    animAllOn() { this.record("anim:all"); this.cur().build = player.animAll(this.stage); this._afterAnim(); },
    animAllOff() { this.record("anim:none"); this.cur().build = []; this._afterAnim(); },
    animReorder(orderedKeys) { this.record("anim:order"); this.cur().build = orderedKeys.slice(); this._afterAnim(); }, // drag drop result
    animRemoveUnit(key) { this.record("anim:remove"); this.cur().build = this._ensureBuild().filter((k) => k !== key); this._afterAnim(); },
    // Phase 9: set/clear a unit's entrance effect (fade/slide/zoom). Stored in the additive
    // slide.buildFx map (keyed by build unit key); an effect implies an explicit build. Null
    // clears it (back to the deck-wide entrance).
    animFx(key, fx) {
      this.record("anim:fx");
      const s = this.cur();
      this._ensureBuild();
      const map = s.buildFx || (s.buildFx = {});
      if (fx) map[key] = { ...(map[key] || {}), fx };
      else if (map[key]) { delete map[key].fx; if (!Object.keys(map[key]).length) delete map[key]; }
      this._afterAnim();
    },
    // Phase 9: enter WITH the previous unit (same reveal step) vs AFTER it (own step).
    // Stored as buildFx[key].timing ("with"); clearing returns to "after" (the default).
    animTiming(key, timing) {
      this.record("anim:timing");
      const s = this.cur();
      this._ensureBuild();
      const map = s.buildFx || (s.buildFx = {});
      if (timing === "with") map[key] = { ...(map[key] || {}), timing: "with" };
      else if (map[key]) { delete map[key].timing; if (!Object.keys(map[key]).length) delete map[key]; }
      this._afterAnim();
    },
    // Phase 9: deck-level slide-to-slide transition (none/fade/push), played on navigation.
    setTransition(kind) {
      this.record("transition");
      this.deck().transition = kind;
      this.commit(); this.broadcast();
      if (this._animPanelRefresh) this._animPanelRefresh();
    },
    // Play the deck's transition on the stagebox (it has no transform of its own, so it can
    // animate freely while #stage keeps its fit scale). One-shot: class removed on end.
    _playTransition() {
      const kind = this.deck().transition || "none";
      if (kind === "none" || !this.stagebox) return;
      const box = this.stagebox;
      box.classList.remove("sx-fade", "sx-push");
      void box.offsetWidth; // reflow so re-adding the class restarts the animation
      box.classList.add("sx-" + kind);
      const done = () => { box.classList.remove("sx-fade", "sx-push"); box.removeEventListener("animationend", done); };
      box.addEventListener("animationend", done);
    },
    openAnim(btn) { openAnimPanel(this, btn); },
    // Preview: step THIS slide's reveals in the editor (no fullscreen, no 2nd window). The
    // ▶ Apresentar button becomes ■ Parar; leaving the slide or closing the panel stops it.
    startPreview() {
      if (this.presenting) return;
      this.previewing = true;
      this.step = 0;
      this.root.classList.add("previewing");
      this._syncPresentBtn();
      this.renderSlide();
      if (this._animPanelRefresh) this._animPanelRefresh(); // collapse the panel to the Stop control
    },
    stopPreview() {
      this._clearPreview();
      this.step = 0;
      this.renderSlide();
      if (this._animPanelRefresh) this._animPanelRefresh(); // expand the panel back
    },
    _clearPreview() {
      if (!this.previewing) return;
      this.previewing = false;
      this.root.classList.remove("previewing");
      this._syncPresentBtn();
    },
    _syncPresentBtn() {
      const b = this.root.querySelector("#present");
      if (b) b.textContent = this.previewing ? "■ " + t("slides.ed_stop") : "▶ " + t("slides.ed_present");
    },
    renderNav() {}, // assigned below (navigator)
    broadcast() {}, // assigned below (sync)

    refresh() { this.renderSlide(); this.renderNav(); this.commit(); this.broadcast(); },

    go(d) {
      // On the end-of-deck screen (4C): forward restarts, backward returns to the deck.
      if (this.atEnd) { if (d > 0) this.restart(); else this.setEnd(false); return; }
      const mx = this.effMax();
      if (d > 0 && this.step < mx) { this.step++; player.applySteps(this.stage, this.step, this._stepMode()); this.broadcast(); return; }
      if (d < 0 && this.step > 0) { this.step--; player.applySteps(this.stage, this.step, this._stepMode()); this.broadcast(); return; }
      if (this.previewing) return; // preview is confined to the current slide; step controls only
      const ni = this.index + d;
      // Forward past the last slide, while presenting, shows the end screen (4C).
      if (d > 0 && ni >= this.deck().slides.length) { if (this.presenting) this.setEnd(true); return; }
      if (ni < 0 || ni >= this.deck().slides.length) return;
      this.index = ni;
      this.step = 0;
      if (this.select) this.select.clear();
      this.renderSlide(); // assigns _maxStep for the new slide
      this._playTransition();
      // entering a slide BACKWARDS lands on its last reveal step (read after render)
      if (d < 0 && this.presenting) { this.step = this.maxStep(); player.applySteps(this.stage, this.step, this.presenting); }
      this.renderNav(); this.broadcast();
    },
    // jump to slide i. NOT named `select`: wiring.js owns app.select (the selection
    // object), so this nav method must not collide with it.
    goTo(i) {
      if (this.previewing) this._clearPreview(); // leaving the slide stops preview
      this.index = i; this.step = 0;
      if (this.select) this.select.clear();
      this.renderSlide(); this._playTransition(); this.renderNav(); this.broadcast();
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
    // Apply a colour PRESET (a seed swatch): set the three real colours in one undo
    // step; the shades + panels then derive from them (applyDeckTheme -> derive.js).
    applyPreset(p) {
      this.record("preset");
      const th = this.deck().theme;
      th.accent = p.accent; th.ink = p.ink; th.motif = p.motif;
      if (this._applyAll) clearTextOverrides(this.deck()); // optional: snap manual edits to the new theme
      applyDeckTheme(this.deck(), this.stage);
      this.renderSlide(); this.renderNav(); this.commit(); this.broadcast();
      refreshThemeBox(this); // reseed the box's swatch + colour controls
    },
    // Set a typography ROLE property (font/size/weight/italic/underline/strike/color).
    // Null/empty clears it (back to the role default); an empty role is dropped so the
    // model stays sparse. The slide re-renders; the open box keeps its own control state.
    setRole(roleId, field, value) {
      this.record("role:" + roleId);
      const th = this.deck().theme;
      const texto = th.texto || (th.texto = { papeis: {} });
      const papeis = texto.papeis || (texto.papeis = {});
      const p = papeis[roleId] || (papeis[roleId] = {});
      if (value == null || value === "") delete p[field];
      else p[field] = value;
      if (!Object.keys(p).length) delete papeis[roleId];
      applyDeckTheme(this.deck(), this.stage);
      this.renderSlide(); this.renderNav(); this.commit(); this.broadcast();
    },
    // "Aplicar a tudo agora": clear every manual per-item text override so the whole
    // deck conforms to the theme, in one undoable step.
    applyThemeToAll() {
      this.record("apply-all");
      clearTextOverrides(this.deck());
      applyDeckTheme(this.deck(), this.stage);
      this.renderSlide(); this.renderNav(); this.commit(); this.broadcast();
      refreshThemeBox(this);
    },
    // ── Saved themes ("Meus temas", per-deck) ─────────────────────────────────
    // Snapshot the current look as a named saved theme. If `name` matches an existing
    // one, overwrite it; otherwise add it (save-as).
    saveTheme(name) {
      this.record("save-theme");
      const d = this.deck();
      const list = d.savedThemes || (d.savedThemes = []);
      const snap = snapshotTheme(d.theme);
      const existing = list.find((s) => s.name === name);
      if (existing) existing.theme = snap;
      else list.push({ id: uid(), name: String(name || "").trim() || "Tema", theme: snap });
      this.commit();
      refreshThemeBox(this);
    },
    applySavedTheme(id) {
      const s = (this.deck().savedThemes || []).find((x) => x.id === id);
      if (!s) return;
      this.record("apply-saved");
      applyThemeFields(this.deck().theme, s.theme);
      if (this._applyAll) clearTextOverrides(this.deck());
      applyDeckTheme(this.deck(), this.stage);
      this.renderSlide(); this.renderNav(); this.commit(); this.broadcast();
      refreshThemeBox(this);
    },
    deleteSavedTheme(id) {
      const d = this.deck();
      if (!d.savedThemes) return;
      this.record("del-saved");
      d.savedThemes = d.savedThemes.filter((x) => x.id !== id);
      this.commit();
      refreshThemeBox(this);
    },
    // The Tema box: the chrome "Tema" button opens it (toggles on re-click).
    openTheme(btn) { openThemeBox(this, btn); },

    // ── Image gallery ──────────────────────────────────────────────────────────
    // The gallery box is the single "add an image" surface (empty slot, trocar, and
    // ＋inserir→imagem all open it). `target` is where a picked image lands:
    // { kind:"slot", path } or { kind:"asset", assetType }.
    openGallery(target, anchorEl) { openGalleryBox(this, target || { kind: "manage" }, anchorEl); },
    // Upload a new file: the store puts the bytes (R2 or data URL), it is registered in
    // the gallery, and (when opened to add to a target) placed immediately.
    async uploadToGallery(file, target) {
      if (!file) return;
      let res;
      try { res = await this._imageStore.put(file); } catch (_) { return; }
      if (!res || !res.url) return;
      this.record("gallery:add");
      const entry = addImage(this.deck(), res);
      this.commit();
      refreshGalleryBox(this);
      if (entry && target && (target.kind === "slot" || target.kind === "asset")) this.placeFromGallery(entry.id, target);
    },
    // Put a registered image into the open target, then close the box.
    placeFromGallery(id, target) {
      const g = getImage(this.deck(), id);
      if (!g || !target) return;
      this.record("gallery:place");
      if (target.kind === "slot") {
        setPath(this.cur().slots, target.path, { src: g.url, tx: 0, ty: 0, zoom: 1 });
      } else if (target.kind === "asset") {
        const c = this.deck().canvas;
        this.deck().assets.push({ id: uid(), type: target.assetType || "image", src: g.url, x: c.w / 2 - 120, y: c.h / 2 - 80, w: 240, rot: 0, scope: "slide", slideId: this.cur().id });
      } else return; // manage-only open: nothing to place
      closeGalleryBox(this);
      this.refresh();
    },
    deleteGalleryImage(id) {
      this.record("gallery:del");
      removeImage(this.deck(), id);
      this.commit();
      refreshGalleryBox(this);
    },
    // Import an image from Google Drive: the Picker chooses a file, the adapter downloads
    // its bytes into a File, and from there it's identical to an upload (stored + placed).
    async importFromDrive(target) {
      if (!this._drivePicker) return;
      let file;
      try { file = await this._drivePicker.pick(); } catch (_) { return; }
      if (file) await this.uploadToGallery(file, target);
    },
    openAppearance(btn) {
      if (btn) this._appearBtn = btn;
      // seed the slider with the EFFECTIVE scale: the per-slide override in "slide"
      // scope, the deck default in "all" scope (5b).
      const fv = this.fontScope === "slide" ? player.effFontScale(this.deck(), this.cur()) : this.deck().theme.fontScale;
      this.select.openMenu(appearanceMenu(this.deck().theme, this.fontScope, fv), this._appearBtn);
    },
    reopenAppearance() { if (this._appearBtn) this.openAppearance(this._appearBtn); },
    // Phase 8: switch the deck aspect ratio (16:9 / 4:3). Sets deck.aspect + canvas and
    // re-anchors absolute geometry (freeform / assets / logo) by the size ratio so nothing
    // falls off the resized canvas; flow content reflows on its own. Same record/apply/
    // render pattern as the theme setters, plus a refit since the canvas dims changed.
    setAspect(aspect) {
      const d = this.deck();
      if (!ASPECTS[aspect] || aspect === d.aspect) return;
      const from = d.canvas || canvasForAspect(d.aspect);
      const to = canvasForAspect(aspect);
      this.record("aspect");
      d.aspect = aspect;
      d.canvas = to;
      reanchorDeck(d, to.w / from.w, to.h / from.h);
      clampToCanvas(d); // keep every absolute element inside the resized canvas; flag overlaps "revisar"
      applyDeckTheme(this.deck(), this.stage);
      this.fit();
      this.renderSlide(); this.renderNav(); this.commit(); this.broadcast();
      refreshThemeBox(this); // relight the active ratio in the open Tema box
    },
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
      // "list" and "card" are STACKS, not single boxes: a free-placed asset whose
      // items live in slots[listKey], so the whole list machinery (select / edit /
      // add / remove / reorder) drives them with no new selection code. Starts as a
      // stack of one and grows via the selected stack's ＋. The variant picks the item
      // shape: "cards" seeds a composable card, "list" a bullet.
      if (type === "list" || type === "card") {
        const isCard = type === "card";
        const listKey = "ins" + uid();
        this.cur().slots[listKey] = [
          isCard ? { id: uid(), parts: { body: true }, text: t("slides.ed_new_card") } : { id: uid(), text: t("slides.ed_new_topic") },
        ];
        this.record();
        const w = isCard ? 320 : 400;
        this.deck().assets.push({ id: uid(), type: "stack", variant: isCard ? "cards" : "list", listKey, x: c.w / 2 - w / 2, y: c.h / 2 - 60, w, rot: 0, scope: "slide", slideId: this.cur().id });
        this.refresh();
        return;
      }
      const base = { id: uid(), type, x: c.w / 2 - 110, y: c.h / 2 - 70, w: type === "title" ? 420 : 240, rot: 0, scope: "slide", slideId: this.cur().id };
      // Images go through the gallery box (central registry + Upload + Drive); a free
      // asset is the place target. Video has no gallery, so it keeps the raw OS picker.
      if (type === "image" || type === "photo") {
        this.openGallery({ kind: "asset", assetType: type }, this.root.querySelector("#insertBtn"));
      } else if (type === "video") {
        base.h = 140; // a <video> has no intrinsic box before metadata (D2)
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "video/*";
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
      if (on) this._clearPreview(); // a real presentation supersedes an in-editor preview
      this.presenting = on;
      // Scope the class to the editor host (.cdx-deck-editor), NOT document.body:
      // in Codex the app is mounted into an inner host, and every presenting/presenter
      // rule is scoped under .cdx-deck-editor — toggling body never matched.
      this.root.classList.toggle("presenting", on);
      if (on) this.root.classList.remove("notes-open"); // the notes bar is edit-only
      if (!on) { // leaving: clear every presenter-control state + its overlays
        this.blank = null; this.atEnd = false; this.jumpBuf = "";
        this.root.classList.remove("blank-black", "blank-white", "end-open");
        this._showJump();
      }
      this.step = 0;
      if (this.select) this.select.clear();
      this.syncChrome(); this.fit(); this.renderSlide(); this.renderNav();
      // requestFullscreen/exitFullscreen return a PROMISE; a blocked request (e.g. a
      // Permissions-Policy "fullscreen" restriction) rejects asynchronously, which the
      // try/catch can't see — it surfaced as an "Unhandled: Permissions check failed"
      // in the debug log. Swallow the rejection explicitly. The CSS already fills the
      // viewport (position:fixed), so a blocked OS-fullscreen degrades gracefully.
      try {
        const p = on
          ? (document.documentElement.requestFullscreen && document.documentElement.requestFullscreen())
          : (document.fullscreenElement && document.exitFullscreen());
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* ignore */ }
    },

    // ── Presenter controls (Phase 4) ──────────────────────────────────────────
    // 4A — blank the audience screen black/white; the same key toggles it back. Nav
    // still works underneath (this only paints an overlay). Broadcast so the presenter
    // window shows the blanked state.
    toggleBlank(mode) {
      this.blank = this.blank === mode ? null : mode;
      this.root.classList.toggle("blank-black", this.blank === "black");
      this.root.classList.toggle("blank-white", this.blank === "white");
      this.broadcast();
    },
    // 4C — end-of-deck screen. Forward past the last slide shows it; forward again (or R,
    // or a click) restarts; backward returns to the last slide.
    setEnd(on) {
      this.atEnd = on;
      this.root.classList.toggle("end-open", on);
      this.broadcast();
    },
    restart() {
      this.atEnd = false;
      this.root.classList.remove("end-open");
      this.goTo(0); // broadcasts
    },
    // 4B — jump to a slide by typing its number then Enter. Feeds one key at a time;
    // returns true when it consumed the key (so the caller stops handling it).
    jumpKey(key) {
      if (/^[0-9]$/.test(key)) { this.jumpBuf += key; this._showJump(); return true; }
      if (key === "Backspace" && this.jumpBuf) { this.jumpBuf = this.jumpBuf.slice(0, -1); this._showJump(); return true; }
      if (key === "Escape" && this.jumpBuf) { this.jumpBuf = ""; this._showJump(); return true; }
      if (key === "Enter" && this.jumpBuf) {
        const n = parseInt(this.jumpBuf, 10);
        this.jumpBuf = ""; this._showJump();
        if (n >= 1 && n <= this.deck().slides.length) { if (this.atEnd) this.setEnd(false); this.goTo(n - 1); }
        return true;
      }
      return false;
    },
    _showJump() {
      const el = this.root.querySelector("#jumpind");
      if (!el) return;
      el.textContent = this.jumpBuf;
      el.style.display = this.jumpBuf ? "block" : "none";
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
  // Animação: opens the animation PANEL (edit/animpanel.js) — entrance type + the ordered
  // reveal list (include/exclude, per-deck item-a-item/unit, reorder) + Preview. Wired
  // directly (toggles on re-click via the panel's own open guard), like the Tema button.
  const animBtn = $("#animBtn");
  if (animBtn) animBtn.onclick = (e) => { e.stopPropagation(); app.select.clear(); app.openAnim(animBtn); };
  // The "Tema" button opens its own settings panel (themebox), not a context-bar menu,
  // so it is wired directly (toggles on re-click; the panel owns its outside-click).
  const themeBtn = $("#appearBtn");
  if (themeBtn) themeBtn.onclick = (e) => { e.stopPropagation(); app.select.clear(); app.openTheme(themeBtn); };

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

  // Notes authoring: the chrome "Notas" button toggles a bottom bar with a textarea
  // bound to the current slide's notes (the same field the presenter panel shows). Write
  // mirrors the inline-text pattern: coalesced record + commit + broadcast per input, so
  // an open presenter window updates live and the debounced store save persists it.
  const notesBtn = $("#notesBtn");
  const notesarea = $("#notesarea");
  if (notesBtn && notesarea) {
    notesBtn.onclick = () => {
      const open = app.root.classList.toggle("notes-open");
      if (open) { app.syncNotes(); notesarea.focus(); }
      app.fit(); // the stage shrinks above the bar; refit to the new height
    };
    notesarea.addEventListener("input", () => {
      app.record("notes:" + app.cur().id); // coalesces a typing burst into one undo
      app.cur().notes = notesarea.value;
      app.commit();
      app.broadcast();
    });
    // typing in the notes bar must not trigger the deck's nav / undo hotkeys
    notesarea.addEventListener("keydown", (e) => e.stopPropagation());
  }

  // 4C: clicking the end-of-deck screen restarts the presentation.
  const endout = $("#endout");
  if (endout) endout.onclick = () => app.restart();

  $("#present").onclick = () => {
    if (app.previewing) { app.stopPreview(); return; } // during preview this button is ■ Parar
    // Open the presenter window FIRST. Spawning a popup steals focus, and a focus
    // change while the opener is *entering* fullscreen makes the browser bounce right
    // back out, which fired onFs -> setPresenting(false). That's why the first click
    // only ever opened the popup and a second click was needed for fullscreen. With the
    // popup already up, we return focus to the opener and only then take fullscreen, so
    // nothing interrupts it.
    window.open(location.href.split("?")[0] + "?presenter=1", "slides-presenter", "width=1100,height=720");
    try { window.focus(); } catch (e) { /* noop */ }
    app.setPresenting(true);
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
    const typing = e.target.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
    // Presenter hotkeys (Phase 4), only while presenting and not typing / not a shortcut.
    if (app.presenting && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (app.jumpKey(e.key)) { e.preventDefault(); return; } // 4B: digits / Enter / Backspace / Esc (while buffering)
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); app.toggleBlank("black"); return; } // 4A
      if (k === "w") { e.preventDefault(); app.toggleBlank("white"); return; } // 4A
      if (k === "r") { e.preventDefault(); app.restart(); return; }            // 4C
    }
    if (e.key === "Escape" && app.previewing) { app.stopPreview(); return; }
    if (e.key === "Escape" && app.presenting) { app.setPresenting(false); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); app.undo(); return; }
      if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); app.redo(); return; }
    }
    if (typing) return;
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
  closeThemeBox(); // tear down the Tema panel + its document listener if open
  closeAnimPanel(); // and the animation panel + its listeners
  closeGalleryBox(app); // and the gallery box + its outside-click listener
  if (app._onResize) window.removeEventListener("resize", app._onResize);
  if (app._onKey) document.removeEventListener("keydown", app._onKey);
  if (app._onDocClick) document.removeEventListener("click", app._onDocClick);
  if (app._onMaskDocClick) document.removeEventListener("click", app._onMaskDocClick);
  if (app._onAddSlideKey) document.removeEventListener("keydown", app._onAddSlideKey, true);
  if (app._onFs) document.removeEventListener("fullscreenchange", app._onFs);
  if (root) root.innerHTML = "";
}
