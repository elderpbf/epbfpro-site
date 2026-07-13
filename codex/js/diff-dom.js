// js/diff-dom.js
// Highlight, on an already-RENDERED element, the words that are new versus a previous text.
// Used by the apostila working-copy preview to mark ONLY the edited/added runs of a section
// body, without touching the markdown source.
//
// Works on the DOM, not the markdown: word-diff the rendered text (diffWords), expand it to a
// per-character mask over the new text, then walk the text nodes in document order and wrap
// each added run in a <mark class="cdx-diff">. Each <mark> is created inside ONE text node, so
// it never crosses a block boundary (where wrapping the markdown source used to break) and
// never touches markdown syntax. Inline formatting splits a word across text nodes and
// adjacent blocks join with no separator, so the mask is indexed off .textContent (the exact
// concatenation the TreeWalker rebuilds), never innerText.
import { diffWords } from './text-diff.js';

export function markAddedInDom(rootEl, oldText) {
  if (!rootEl) return;
  const newText = rootEl.textContent || '';
  if (!newText) return;
  const mask = new Uint8Array(newText.length);
  let pos = 0;
  for (const seg of diffWords(oldText || '', newText)) {
    if (seg.added) mask.fill(1, pos, pos + seg.text.length);
    pos += seg.text.length;
  }
  if (pos !== newText.length) return; // segments didn't rebuild the text; leave it unmarked
  const nodes = [];
  const walk = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) nodes.push(node);
  let idx = 0;
  for (const node of nodes) {
    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    let k = 0;
    while (k < text.length) {
      const on = mask[idx + k] === 1;
      let end = k + 1;
      while (end < text.length && (mask[idx + end] === 1) === on) end++;
      const chunk = text.slice(k, end);
      // Wrap added runs that carry visible text. A run that is ONLY whitespace (the newline
      // text nodes marked.js leaves between blocks) is left plain, so a new section doesn't
      // sprout stray highlight slivers in the left margin between its blocks.
      if (on && /\S/.test(chunk)) {
        const mk = document.createElement('mark');
        mk.className = 'cdx-diff';
        mk.textContent = chunk;
        frag.appendChild(mk);
      } else {
        frag.appendChild(document.createTextNode(chunk));
      }
      k = end;
    }
    idx += text.length;
    node.parentNode.replaceChild(frag, node);
  }
}
