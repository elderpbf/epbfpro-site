// js/dom.js — shared DOM helpers for Greenroom modules.
//   esc(s)  — HTML-escape & < > " ' (returns '' for null/undefined)
//   qs/qsa  — scoped querySelector / querySelectorAll (qsa returns an array)

export function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const qs = (sel, root) => (root || document).querySelector(sel);
export const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
