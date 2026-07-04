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

export function markChanges(oldStr, newStr) {
  const a = _tokens(oldStr), b = _tokens(newStr);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0, j = 0, out = '', run = '';
  const flush = () => { if (run) { out += DIFF_OPEN + run + DIFF_CLOSE; run = ''; } };
  while (j < m) {
    if (i < n && a[i] === b[j]) { flush(); out += b[j]; i++; j++; }        // common token
    else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) { i++; }               // old token dropped
    else { run += b[j]; j++; }                                            // new token added
  }
  flush();
  return out;
}

export function stripMarks(s) {
  return String(s == null ? '' : s).split(DIFF_OPEN).join('').split(DIFF_CLOSE).join('');
}
