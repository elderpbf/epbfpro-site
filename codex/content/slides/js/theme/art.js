// theme/art.js — recolorable SVG motifs + shared slide frame (logo, edge bar).
// All art is currentColor / var(--motif) driven so a single CSS variable recolors it.

export const CIRCUITSVG = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 22 H38 V52 H68 M68 52 V82 M38 52 V92 M68 52 H94 M52 8 V34 H82"/><g fill="currentColor" stroke="none"><circle cx="8" cy="22" r="3"/><circle cx="38" cy="52" r="3"/><circle cx="68" cy="52" r="3"/><circle cx="68" cy="82" r="3"/><circle cx="38" cy="92" r="3"/><circle cx="94" cy="52" r="3"/><circle cx="52" cy="8" r="3"/><circle cx="82" cy="34" r="3"/></g></svg>`;

export const NEURALSVG = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 24 L52 16 L52 50 L20 24 M52 16 L84 30 M52 50 L84 30 M52 50 L48 84 M84 30 L48 84 M20 24 L48 84"/><g fill="currentColor" stroke="none"><circle cx="20" cy="24" r="4"/><circle cx="52" cy="16" r="4"/><circle cx="84" cy="30" r="4"/><circle cx="52" cy="50" r="4"/><circle cx="48" cy="84" r="4"/></g></svg>`;

export const BRAIN = `<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M56 26 C40 22 26 32 28 48 C18 53 18 70 30 73 C28 88 42 98 56 92 Z"/><path d="M40 42 C47 46 47 56 40 60 M44 66 C51 69 52 78 47 84 M40 50 H30"/><path d="M62 38 H78 M78 38 V28 H92 M62 54 H86 M86 54 V66 H100 M62 72 H80 V86 H96 M62 60 H72"/><g fill="currentColor" stroke="none"><circle cx="92" cy="28" r="3.5"/><circle cx="100" cy="66" r="3.5"/><circle cx="96" cy="86" r="3.5"/><circle cx="86" cy="54" r="3.5"/></g></svg>`;

export const circuit = (pos) => `<div class="motif circuit ${pos}">${CIRCUITSVG}</div>`;
export const NEURAL = `<div class="motif neural">${NEURALSVG}</div>`;
export const contentMotifs = NEURAL + circuit("br");
export const coverMotifs = circuit("tr") + circuit("bl") + circuit("br");

export const logo = `<div class="logo"><img src="codex-logo.png" alt="PensoIA"></div>`;
export const bar = `<div class="edgebar"></div>`;
