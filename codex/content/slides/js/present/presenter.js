// present/presenter.js — second-window presenter view + BroadcastChannel sync.
// Editor side broadcasts state; presenter side renders now/next minis, notes,
// timer and clock, and posts navigation back to the editor.
import { renderInto } from "../render/player.js";
import { applyDeckTheme } from "../theme/tokens.js";
import { t } from "../../../../js/i18n.js";
import {
  loadTimers, saveTimers, fmt,
  swStart, swPause, swReset, swNormalize, swElapsed,
  cdStart, cdPause, cdReset, cdSet, cdNormalize, cdRemaining,
} from "./timers.js";

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

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
    else if (m.type === "goto") { if (app.atEnd) app.setEnd(false); app.goTo(m.index); } // slide-list click
    else if (m.type === "setnotes") { // notes edited in the presenter window: persist here
      const s = app.deck().slides[m.index];
      // commit(s), not commit(): this slide is usually NOT the one on screen, and the
      // same-ref sync spreads FROM the slide that was edited (app.syncSameRef).
      if (s) { app.record("notes:" + m.index); s.notes = m.notes; app.commit(s); app.syncNotes(); }
      // no re-broadcast: the presenter already shows what it typed, and broadcasting would
      // re-render its minis on every keystroke.
    }
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
  const now = () => Date.now();

  function renderMini(id, i) {
    const el = $(id);
    if (!el) return;
    const deck = app.deck();
    if (i < 0 || i >= deck.slides.length) { el.innerHTML = ""; return; }
    renderInto(el, deck, deck.slides[i]);
    el.style.transform = `scale(${el.parentElement.clientWidth / deck.canvas.w})`;
  }

  // ── Slide list (built once; rebuilt only when the slide count changes) ──────
  let listN = -1;
  function slideLabel(s) {
    const raw = (s.slots && (s.slots.title || s.slots.subtitle)) || "";
    return String(raw).replace(/<[^>]*>/g, "").trim() || null;
  }
  function buildList() {
    const list = $("pvList");
    if (!list) return;
    const deck = app.deck();
    list.innerHTML = deck.slides.map((s, i) =>
      `<div class="pvli" data-i="${i}"><span class="pvli-n">${i + 1}</span>` +
      `<div class="pvli-mini"><div class="pvli-scale"></div><span class="pvli-lbl"></span></div>` +
      `<span class="pvli-t">${escapeHtml(slideLabel(s) || `${t("slides.pv_slide_n")} ${i + 1}`)}</span></div>`
    ).join("");
    deck.slides.forEach((s, i) => {
      const scale = list.querySelector(`.pvli[data-i="${i}"] .pvli-scale`);
      if (!scale) return;
      renderInto(scale, deck, s);
      scale.style.transform = `scale(${scale.parentElement.clientWidth / deck.canvas.w})`;
    });
    list.querySelectorAll(".pvli").forEach((el) =>
      el.addEventListener("click", () => channel.postMessage({ type: "goto", index: Number(el.dataset.i) }))
    );
    listN = deck.slides.length;
    requestAnimationFrame(scaleListMinis); // scale once the new rows are laid out
  }
  function updateListHighlight() {
    const list = $("pvList");
    if (!list) return;
    list.querySelectorAll(".pvli").forEach((el) => {
      const i = Number(el.dataset.i);
      const isCur = i === app.index, isNext = i === app.index + 1;
      el.classList.toggle("current", isCur);
      el.classList.toggle("next", isNext);
      const lbl = el.querySelector(".pvli-lbl");
      if (lbl) lbl.textContent = isCur ? t("slides.ed_current_slide") : isNext ? t("slides.ed_next_slide") : "";
    });
    const cur = list.querySelector(".pvli.current");
    if (cur) cur.scrollIntoView({ block: "nearest" });
  }
  // Re-apply each list mini's scale from its CURRENT laid-out width. Built-once minis get
  // the wrong scale if the list wasn't laid out yet at build time; recomputing on every
  // state update self-corrects (the mini box is fixed-width, so this is cheap + stable).
  function scaleListMinis() {
    const list = $("pvList");
    if (!list) return;
    const cw = app.deck().canvas.w;
    list.querySelectorAll(".pvli-scale").forEach((scale) => {
      const w = scale.parentElement.clientWidth;
      if (w) scale.style.transform = `scale(${w / cw})`;
    });
  }

  channel.onmessage = (e) => {
    const m = e.data;
    if (m.type === "saved") { if (app._notify) app._notify(t("slides.pv_notes_saved")); return; } // editor confirmed the persist
    if (m.type !== "state") return;
    const deck = app.deck();
    if (m.deck) deck.slides = JSON.parse(m.deck);
    if (m.assets) deck.assets = m.assets;
    if (m.logo) deck.logo = m.logo; // keep the deck logo in sync (D4)
    if (m.theme) { deck.theme = m.theme; applyDeckTheme(deck, app.stage); }
    app.index = m.index;
    app.step = m.step;
    if (deck.slides.length !== listN) buildList(); // rebuild only on count change
    $("pvPos").textContent = `${app.index + 1} / ${deck.slides.length}`;
    const nt = $("pvNotes"); // editable; don't clobber it while it's being typed in
    if (nt && document.activeElement !== nt) nt.value = deck.slides[app.index].notes || "";
    renderMini("pvNow", app.index);
    renderMini("pvNext", app.index + 1);
    updateListHighlight();
    scaleListMinis();
    // Reflect the audience state by HIGHLIGHTING the active control (not a text badge):
    // the button you clicked stays lit while its mode is on.
    const setActive = (id, on) => { const b = $(id); if (b) b.classList.toggle("active", on); };
    setActive("pvBlack", m.blank === "black");
    setActive("pvWhite", m.blank === "white");
    setActive("pvRestart", !!m.atEnd);
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

  // Control buttons mirror the hotkeys, posted back to the editor.
  const bindBtn = (id, msg) => { const b = $(id); if (b) b.onclick = () => channel.postMessage(msg); };
  bindBtn("pvBlack", { type: "blankkey", mode: "black" });
  bindBtn("pvWhite", { type: "blankkey", mode: "white" });
  bindBtn("pvRestart", { type: "restart" });

  // Editable presenter notes: edits round-trip to the editor window (which owns the
  // store) to persist; typing here must not trigger the deck nav / blank hotkeys.
  const notesEl = $("pvNotes");
  if (notesEl) {
    notesEl.addEventListener("input", () => channel.postMessage({ type: "setnotes", index: app.index, notes: notesEl.value }));
    notesEl.addEventListener("keydown", (e) => e.stopPropagation());
  }

  // ── Timers (wall-clock anchored + persisted, so they survive closing this window
  // or stopping the presentation, and the stopwatch caps at 4h). ──────────────
  let timers = loadTimers();
  // Auto-start the stopwatch the first time it's pristine, so it runs with the talk.
  if (!timers.sw.running && timers.sw.accumMs === 0) timers.sw = swStart(timers.sw, now());
  saveTimers(timers);

  document.querySelectorAll(".pvctl").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t0 = now();
      if (btn.dataset.t === "sw") {
        timers.sw = btn.dataset.a === "reset" ? swReset(timers.sw, t0)
          : timers.sw.running ? swPause(timers.sw, t0) : swStart(timers.sw, t0);
      } else {
        timers.cd = btn.dataset.a === "reset" ? cdReset(timers.cd)
          : timers.cd.running ? cdPause(timers.cd, t0) : cdStart(timers.cd, t0);
      }
      saveTimers(timers);
      paintTimers();
    });
  });
  // Click the countdown time to set its minutes (default 15).
  const cdEl = $("pvCd");
  if (cdEl) cdEl.addEventListener("click", () => {
    const cur = Math.round(timers.cd.durationMs / 60000) || 15;
    // eslint-disable-next-line no-alert
    const v = window.prompt(t("slides.pv_cd_prompt"), String(cur));
    if (v == null) return;
    const min = parseInt(v, 10);
    if (!isNaN(min) && min >= 0) { timers.cd = cdSet(timers.cd, min); saveTimers(timers); paintTimers(); }
  });

  function paintTimers() {
    const t0 = now();
    timers.sw = swNormalize(timers.sw, t0); // auto-pause at the 4h cap
    timers.cd = cdNormalize(timers.cd, t0); // stop at 0
    const swEl = $("pvSw"), cd = $("pvCd"), clk = $("pvClock");
    if (swEl) swEl.textContent = fmt(swElapsed(timers.sw, t0));
    if (cd) {
      const rem = cdRemaining(timers.cd, t0);
      cd.textContent = fmt(rem);
      cd.parentElement.classList.toggle("done", rem <= 0 && timers.cd.durationMs > 0);
    }
    if (clk) { const d = new Date(); clk.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
    const swBtn = document.querySelector('.pvctl[data-t="sw"][data-a="toggle"]');
    if (swBtn) swBtn.textContent = timers.sw.running ? "⏸" : "▶";
    const cdBtn = document.querySelector('.pvctl[data-t="cd"][data-a="toggle"]');
    if (cdBtn) cdBtn.textContent = timers.cd.running ? "⏸" : "▶";
  }
  setInterval(() => { paintTimers(); saveTimers(timers); }, 500);
  paintTimers();

  channel.postMessage({ type: "hello" });
}
