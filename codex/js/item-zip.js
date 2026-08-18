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
import { fileNameFromTitle } from './item-download.js';

// entries: [{ title, text, dir? }] for generated text, or [{ name, bytes, dir? }] for a real
// file already fetched from R2. `dir` is the folder path, already ending in '/' ('' at the
// root). Returns the zip bytes.
//
// The second shape is what makes a package honest. Until now the zip carried ONLY text, so an
// item with an attached file went in without it and the zip passed as complete -- the exact
// failure Élder refuses to ship elsewhere in this track ("telling correctly that this does not
// go into the download zip is the better thing to do"). A real file keeps the name its author
// gave it; only generated text is named after the item's title.
//
// Nesting becomes a FOLDER (Élder 2026-08-05: a grouper can contain another). The collision
// check is PER FOLDER, not global: two "modelo.md" in different folders are two legitimate
// files, and numbering the second one just because a namesake exists elsewhere would rename,
// with no reason, what the author named.
export function buildZip(entries, ext = 'md') {
  const files = {};
  const takenByDir = new Map();
  entries.forEach((e) => {
    const dir = (e && e.dir) || '';
    if (!takenByDir.has(dir)) takenByDir.set(dir, new Map());
    const taken = takenByDir.get(dir);
    const wanted = (e && e.name) ? _safeName(e.name) : fileNameFromTitle(e && e.title, ext);
    const n = (taken.get(wanted) || 0) + 1;
    taken.set(wanted, n);
    const name = n === 1 ? wanted : _numbered(wanted, n);
    files[dir + name] = (e && e.bytes) ? e.bytes : strToU8(e && e.text != null ? String(e.text) : '');
  });
  return zipSync(files, { level: 0 });
}

// A name that came from R2 rather than from a title still has to be safe inside a zip: a path
// separator would invent a folder the model does not have.
function _safeName(name) {
  return String(name).replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]+/g, '_') || 'arquivo';
}

// "modelo.md" -> "modelo-2.md", keeping the extension where it belongs.
function _numbered(name, n) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) + '-' + n + name.slice(dot) : name + '-' + n;
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
