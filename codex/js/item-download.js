// js/item-download.js
// Download an item's content as a file, generated on the spot in the browser.
//
// Nothing is pre-generated or stored in R2: `body_md` already came in the item's payload, so
// the download is a Blob and a synthetic click. Pre-generating would cost storage and would
// silently go stale on every item edit.
//
// Format rule (Élder, track-61): whoever sees the markdown symbols downloads `.md`; whoever
// sees the processed markdown downloads PDF. Only `.md` lives here; PDF is its own slice.

// File name derived from the item's title. Real titles carry markdown markup
// ("# Prompt: ...") and accents, and neither survives a filesystem well.
export function fileNameFromTitle(title, ext = 'md') {
  const base = String(title == null ? '' : title)
    .replace(/^#+\s*/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return (base || 'item') + '.' + ext;
}

// Unique names within the same package. Two items with similar titles collapse into the
// same name once accents and punctuation are stripped, and in the ZIP one would silently
// overwrite the other.
export function uniqueNames(titles, ext = 'md') {
  const seen = new Map();
  return titles.map((t) => {
    const name = fileNameFromTitle(t, ext);
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : name.replace(new RegExp('\\.' + ext + '$'), '-' + n + '.' + ext);
  });
}

// Triggers the download of a text. Browser-only (URL.createObjectURL + synthetic click);
// the file name is the pure, testable part.
export function downloadText(text, filename, mime = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text == null ? '' : String(text)], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking right away cuts the download short in some browsers; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// An item that does NOT fit in a .zip. Élder 2026-08-05, about folders with a lab inside:
// "either we forbid it... or we just allow them and they just get sidestepped". He chose to
// allow and WARN: "telling correctly that this does not go into the download zip is the better
// thing to do. And we're not going to add anything to the zip because it makes no sense", in
// other words no stand-in file in place of the lab.
//
// Forbidding would be worse and he was right not to want it: the rule would end up depending
// on ORDER (put a lab first and the folder locks against documents), and would solve a label
// problem with a structural ban.
//
// Lab and interativo are applications that live on the trail, not files. A single source,
// because the screen that WARNS and the download that SKIPS can't disagree.
export function isDownloadable(item) {
  const type = item && (item.type || item);
  return type !== 'lab' && type !== 'interativo';
}

// Is the item RAW? Raw means three things at once: the AI doesn't rewrite its body, the trail
// shows the literal text instead of processed markdown, and the `.md` comes out exactly as is.
//
// It used to be INFERRED from the type (`type === 'prompt'`), and Élder caught the bug in that
// on 2026-08-07: "às vezes a IA toma como prompt algo que não é e aí não faz a formatação. Ele
// deveria formatar de qualquer jeito, mas se o tipo ou a opção não permitir, aí ele mostra o
// texto original". In other words: an AI guess about the TYPE was deciding, with no one asking
// for it, that that text would never be formatted. Now an item flag decides, shown by the
// editor and controlled by the user; the AI always formats, and the flag decides whether the
// result is accepted.
//
// The legacy stays correct with no migration: an old item has no flag, so `prompt` means raw
// like it always did. Writing the flag on top is what changes the answer.
export function isVerbatim(item) {
  if (!item) return false;
  const m = item.meta_json;
  let meta = m;
  if (typeof m === 'string') { try { meta = JSON.parse(m) || {}; } catch (_) { meta = {}; } }
  if (meta && typeof meta.verbatim === 'boolean') return meta.verbatim;
  return item.type === 'prompt';
}
