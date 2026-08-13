// js/item-zip.js
// Packs several texts into a .zip, in the browser, with no network.
//
// fflate was already vendored (Slides' .pptx importer uses it to UNzip); here it zips. Zero
// new dependency, zero CDN.
//
// `store` mode (level 0) on purpose: markdown is already small and the gain from compressing
// doesn't pay for the cost on a weak device. If PDF/image ever enters the package, they
// already come compressed.
import { zipSync, strToU8 } from './vendor/fflate.js';
import { uniqueNames } from './item-download.js';

// entries: [{ title, text, dir? }]. `dir` is the folder path, already ending in '/' ('' at
// the root). Returns the zip bytes.
//
// Nesting becomes a FOLDER (Élder 2026-08-05: a grouper can contain another). The collision
// check is PER FOLDER, not global: two "modelo.md" in different folders are two legitimate
// files, and numbering the second one just because a namesake exists elsewhere would rename,
// with no reason, what the author named.
export function buildZip(entries, ext = 'md') {
  const byDir = new Map();
  entries.forEach((e, i) => {
    const d = (e && e.dir) || '';
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(i);
  });
  const names = new Array(entries.length);
  byDir.forEach((idxs, dir) => {
    uniqueNames(idxs.map((i) => entries[i].title), ext).forEach((n, k) => { names[idxs[k]] = dir + n; });
  });
  const files = {};
  entries.forEach((e, i) => { files[names[i]] = strToU8(e.text == null ? '' : String(e.text)); });
  return zipSync(files, { level: 0 });
}

// Browser-only: builds the zip and triggers the download.
export function downloadZip(entries, filename, ext = 'md') {
  const url = URL.createObjectURL(new Blob([buildZip(entries, ext)], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
