// js/text-diff.js
// Word-level diff. markChanges(old, new) returns `new` with the runs that DIFFER from
// `old` wrapped in the sentinel pair .. (Unicode private-use chars: they carry
// through markdown rendering as inert text, so the caller can swap them for <mark> AFTER
// render without breaking the parse). Used by the apostila working copy to highlight ONLY
// the edited words, not the whole field. Small fields, so the O(n*m) LCS table is fine.
export const DIFF_OPEN = '';
export const DIFF_CLOSE = '';

function _tokens(s) {
  // Alternating word / whitespace tokens, so runs rebuild the string exactly and only the
  // changed WORDS (not the spaces around them) end up wrapped.
  return String(s == null ? '' : s).split(/(\s+)/);
}

// diffWords(old, new) -> ordered segments covering ALL of `new`: [{ text, added }].
// `added:true` = a run present in `new` but not aligned to `old`. Word/whitespace tokens,
// so a fully-new paragraph comes back as ONE added segment (its spaces included) and a
// single changed word inside otherwise-equal text comes back as its own added segment.
// Used two ways: markChanges (below) for plain-text fields, and the apostila body
// highlighter which expands these into a per-character mask over the RENDERED text.
export function diffWords(oldStr, newStr) {
  const a = _tokens(oldStr), b = _tokens(newStr);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const segs = [];
  const push = (text, added) => {
    if (!text) return;
    const last = segs[segs.length - 1];
    if (last && last.added === added) last.text += text;                   // merge same-flag runs
    else segs.push({ text, added });
  };
  let i = 0, j = 0;
  while (j < m) {
    if (i < n && a[i] === b[j]) { push(b[j], false); i++; j++; }           // common token
    else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) { i++; }               // old token dropped
    else { push(b[j], true); j++; }                                        // new token added
  }
  return segs;
}

// Sentinel-wrapped form for PLAIN-TEXT fields (title/summary), where the caller escapes then
// swaps the sentinels for <mark>. NOT for markdown bodies: a sentinel before `###`/`- ` breaks
// block parsing and a run spanning blocks yields an inline <mark> the browser closes at the
// first block boundary. The apostila body highlights on the rendered DOM via diffWords instead.
export function markChanges(oldStr, newStr) {
  return diffWords(oldStr, newStr)
    .map((s) => (s.added ? DIFF_OPEN + s.text + DIFF_CLOSE : s.text))
    .join('');
}

export function stripMarks(s) {
  return String(s == null ? '' : s).split(DIFF_OPEN).join('').split(DIFF_CLOSE).join('');
}
