// core/schema.js — pure data helpers, deck/slide geometry. No DOM, no imports.

export const uid = () => Math.random().toString(36).slice(2, 9);

/** Design canvas: all coordinates (assets + freeform overrides) live in this space. */
export const CANVAS = { w: 1280, h: 720 };

/** Read a dotted path from an object (safe). */
export function getByPath(obj, path) {
  return path.split(".").reduce((x, k) => (x == null ? x : x[k]), obj);
}

/** Write a dotted path into an object (parents must exist). */
export function setPath(obj, path, value) {
  const parts = path.split(".");
  let x = obj;
  for (let i = 0; i < parts.length - 1; i++) x = x[parts[i]];
  x[parts[parts.length - 1]] = value;
}

/** Structured deep clone of plain deck JSON. */
export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
