// theme/tokens.js — two independent theming concerns:
//   1. Deck theme: per-deck slide colours (accent/ink/motif), font scale, anim.
//   2. Chrome theme: dark/light of the editor shell, mirroring Codex/Backstage
//      (data-theme on <html>, persisted in localStorage `bs_theme`, default dark).
// The slide canvas itself always stays paper-white; only the chrome flips.

import { fontStack, ensureFont } from "./fonts.js";
import { derive } from "./derive.js";
import { roleCss } from "./roles.js";
import { setArtKit } from "./art.js";

const THEME_KEY = "bs_theme"; // same key Backstage/Codex use, so Phase 6 is seamless

/** Push the deck's own colour/scale tokens onto the document + stage. */
export function applyDeckTheme(deck, stage) {
  const t = deck.theme;
  const r = document.documentElement.style;
  r.setProperty("--fontScale", t.fontScale);
  r.setProperty("--teal", t.accent);
  r.setProperty("--ink", t.ink);
  r.setProperty("--motif", t.motif);
  // Deck-wide font family: resolve through the registry (fontStack handles a legacy
  // deck with no `font` field) and lazy-load its webfont. Only slide CONTENT reads
  // --fontFamily (see slide.css); the editor chrome stays Roboto.
  r.setProperty("--fontFamily", fontStack(t.font));
  ensureFont(t.font);
  // Slide-content panel tokens derived from the palette, so cards / steps / road
  // panels follow the accent (today they are hardcoded). Paper stays white for now.
  const d = derive({ accent: t.accent, ink: t.ink, paper: "#ffffff" });
  for (const k in d) r.setProperty(k, d[k]);
  // Typography roles: inject the active per-role overrides as a stylesheet that wins
  // over slide.css (same selectors, appended last in <head>). Empty when no role is
  // set, so a deck with no typography overrides renders identically. Lazy-load any
  // per-role webfont so a role's chosen family actually renders (not a fallback).
  const papeis = t.texto && t.texto.papeis;
  if (papeis) for (const id in papeis) if (papeis[id] && papeis[id].font) ensureFont(papeis[id].font);
  applyRoleStyles(papeis);
  // Decorative background: choose the active art kit (the layouts' motif accessors
  // read it). Absent -> "circuito" (today's art), so a legacy deck is unchanged.
  setArtKit(t.art || "circuito");
  if (stage) stage.dataset.anim = t.anim || "fade-up";
}

// One <style> per document carries the active typography-role overrides. It is
// appended last in <head>, so its rules win over slide.css on equal specificity.
// Rebuilt each applyDeckTheme; empty text clears it.
function applyRoleStyles(papeis) {
  if (typeof document === "undefined") return; // non-DOM guard (tests never reach here)
  let el = document.getElementById("cdx-deck-type");
  if (!el) {
    el = document.createElement("style");
    el.id = "cdx-deck-type";
    document.head.appendChild(el);
  }
  el.textContent = roleCss(papeis);
}

export function initChromeTheme() {
  // Respect a theme the host already set on <html> (Codex manages data-theme via
  // the same bs_theme key). Only fall back to localStorage / dark when the host
  // has set nothing, so the editor never hijacks the page theme on mount. This
  // was turning the Codex page near-black on open inside the Slides sub-tab.
  const existing = document.documentElement.getAttribute("data-theme");
  if (existing) return existing;
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  setChromeTheme(saved);
  return saved;
}

export function setChromeTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch (e) {
    /* private mode: keep in-DOM only */
  }
}

export function currentChromeTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}

export function toggleChromeTheme() {
  const next = currentChromeTheme() === "dark" ? "light" : "dark";
  setChromeTheme(next);
  return next;
}
