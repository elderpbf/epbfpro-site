'use strict';

// Bundle J - Student page "your answer" highlight blink bug.
//
// Repro: on the /go/index.html student page, the classpulse-question element
// (mode="student") polls every 3 seconds. When other students submit answers
// the answer_counts changes, which triggers _renderQuestion -> _renderBarChart
// which today does `container.innerHTML = html;` -- a wholesale DOM rebuild.
//
// The .qr-bar-fill child element has `transition: width 0.8s ease;` so when
// the same element's width changes it animates smoothly. But because every
// poll tick destroys + recreates the element, the inline width on a fresh
// element starts at its declared value with no prior state to animate from.
// The user perceives this as the bars (especially the bar wearing the .mine
// `your answer` highlight) flashing/jumping on each tick rather than growing
// smoothly.
//
// The fix is to update bars IN PLACE when the container already holds a
// matching bar structure (same number of options): mutate inline width, %
// text, and count text on the existing elements; only rebuild from scratch
// when the structure differs (new question, different option count, etc.).
//
// Preserving DOM identity means CSS transitions on .qr-bar-fill width keep
// running smoothly, which is the existing design intent of the 0.8s ease
// transition. The "your answer" .mine bar in particular stops blinking
// because its element is no longer destroyed-and-recreated every 3 seconds.
//
// Run: node Site/backstage/js/question-renderer-stable.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ---------------------------------------------------------------------------
// Minimal DOM stubs so we can run question-renderer.js in Node.
// We only model the surface area _renderBarChart actually uses.
// ---------------------------------------------------------------------------

function makeDOM() {
  let nextId = 0;

  function makeEl(tagName) {
    const el = {
      _uid: ++nextId,
      tagName: tagName.toUpperCase(),
      _children: [],
      _attrs: {},
      _innerHTML: '',
      classList: {
        _classes: new Set(),
        add(...c) { c.forEach((cc) => this._classes.add(cc)); },
        remove(...c) { c.forEach((cc) => this._classes.delete(cc)); },
        contains(c) { return this._classes.has(c); },
        toggle(c, force) {
          if (force === true) { this._classes.add(c); return true; }
          if (force === false) { this._classes.delete(c); return false; }
          if (this._classes.has(c)) { this._classes.delete(c); return false; }
          this._classes.add(c); return true;
        },
      },
      get className() { return Array.from(this.classList._classes).join(' '); },
      set className(v) {
        this.classList._classes.clear();
        String(v || '').split(/\s+/).filter(Boolean).forEach((c) => this.classList._classes.add(c));
      },
      style: {},
      _textContent: '',
      get textContent() { return this._textContent; },
      set textContent(v) { this._textContent = String(v == null ? '' : v); },
      setAttribute(k, v) { this._attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
      removeAttribute(k) { delete this._attrs[k]; },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
      appendChild(child) { this._children.push(child); child.parentNode = this; return child; },
      removeChild(child) {
        const idx = this._children.indexOf(child);
        if (idx >= 0) this._children.splice(idx, 1);
        return child;
      },
      addEventListener() {},
      removeEventListener() {},
      // Naive innerHTML parser: only handles <div class="..." style="..." ...>nested...</div>
      // and <span class="...">text</span>. Enough for _renderBarChart output.
      get innerHTML() { return this._innerHTML; },
      set innerHTML(html) {
        this._innerHTML = String(html);
        this._children = parseHtml(html);
        this._children.forEach((c) => { c.parentNode = this; });
      },
      querySelectorAll(sel) { return collectMatches(this, sel); },
      querySelector(sel) { return collectMatches(this, sel)[0] || null; },
      closest(sel) {
        let node = this;
        while (node) {
          if (matchesSelector(node, sel)) return node;
          node = node.parentNode;
        }
        return null;
      },
    };
    return el;
  }

  // Selector match: supports '.classname' and 'tag.classname' and tag alone.
  function matchesSelector(el, sel) {
    if (!el || el.tagName == null) return false;
    const parts = sel.trim().split('.');
    const tagPart = parts.shift();
    const classParts = parts;
    if (tagPart && tagPart !== '*' && el.tagName !== tagPart.toUpperCase()) return false;
    return classParts.every((c) => el.classList._classes.has(c));
  }

  function collectMatches(root, sel) {
    const out = [];
    function walk(node) {
      if (matchesSelector(node, sel)) out.push(node);
      (node._children || []).forEach(walk);
    }
    (root._children || []).forEach(walk);
    return out;
  }

  // Tiny tag-soup parser for the renderer's output. Recognizes <div>, <span>,
  // <button>, <ul>, <li>, <p>, <textarea>, <input>, and self-closing <input>.
  function parseHtml(html) {
    const out = [];
    let i = 0;
    const len = html.length;
    function readTag() {
      // Already past '<'
      const start = i;
      while (i < len && html[i] !== '>') i++;
      const inside = html.slice(start, i);
      i++; // skip '>'
      return inside;
    }
    function buildEl(tagInside) {
      const selfClosing = tagInside.endsWith('/');
      if (selfClosing) tagInside = tagInside.slice(0, -1).trim();
      const m = tagInside.match(/^(\w+)/);
      if (!m) return null;
      const tagName = m[1].toLowerCase();
      const el = makeEl(tagName);
      // Parse attrs: key="value" pairs
      const attrRe = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
      let am;
      while ((am = attrRe.exec(tagInside))) {
        const key = am[1];
        const val = am[2];
        if (key === 'class') el.className = val;
        else if (key === 'style') {
          val.split(';').forEach((decl) => {
            const [k, v] = decl.split(':').map((s) => s && s.trim());
            if (k && v) el.style[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
          });
        } else {
          el.setAttribute(key, val);
        }
      }
      return { el, tagName, selfClosing };
    }

    while (i < len) {
      if (html[i] !== '<') {
        // text content until next '<'
        const start = i;
        while (i < len && html[i] !== '<') i++;
        const text = html.slice(start, i);
        if (text.trim() && out.length) {
          // append text to last child as textContent
          const last = out[out.length - 1];
          last._textContent = (last._textContent || '') + text;
        }
        continue;
      }
      if (html[i + 1] === '/') {
        // closing tag, stop here for this scope
        const start = ++i;
        while (i < len && html[i] !== '>') i++;
        i++;
        return out;
      }
      i++; // skip '<'
      const inside = readTag();
      const built = buildEl(inside);
      if (!built) continue;
      if (built.selfClosing || ['input', 'br', 'hr', 'img'].includes(built.tagName)) {
        out.push(built.el);
        continue;
      }
      // Recurse to collect children
      const children = parseHtml(html.slice(i));
      // Skip ahead in source: we need to advance i past the recursive consume.
      // Our recursion returned after eating its closing tag. To track how much
      // it consumed we re-parse: simpler approach -> use a marker pattern.
      // We'll instead use a balanced-tag scanner.
      // Replace recursion above with this scanner pattern.
      // (See `parseHtml` rewrite below for an actually-balanced parser.)
      void children;
      // For safety, fall through to balanced parser:
      const childrenAndConsumed = parseBalanced(html, i, built.tagName);
      childrenAndConsumed.children.forEach((c) => built.el.appendChild(c));
      i = childrenAndConsumed.endIndex;
      out.push(built.el);
    }
    return out;
  }

  function parseBalanced(html, startIdx, tagName) {
    let i = startIdx;
    const len = html.length;
    const children = [];
    while (i < len) {
      if (html[i] === '<' && html[i + 1] === '/') {
        const close = html.slice(i, html.indexOf('>', i) + 1);
        if (close.toLowerCase().startsWith('</' + tagName.toLowerCase())) {
          return { children, endIndex: i + close.length };
        }
        // Mismatched close; bail to avoid infinite loop.
        return { children, endIndex: i + close.length };
      }
      if (html[i] === '<') {
        // open tag
        const closeIdx = html.indexOf('>', i);
        if (closeIdx < 0) return { children, endIndex: len };
        let inside = html.slice(i + 1, closeIdx);
        const selfClosing = inside.endsWith('/');
        if (selfClosing) inside = inside.slice(0, -1).trim();
        const m = inside.match(/^(\w+)/);
        if (!m) { i = closeIdx + 1; continue; }
        const childTag = m[1].toLowerCase();
        const el = makeEl(childTag);
        // attrs
        const attrRe = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
        let am;
        while ((am = attrRe.exec(inside))) {
          const key = am[1];
          const val = am[2];
          if (key === 'class') el.className = val;
          else if (key === 'style') {
            val.split(';').forEach((decl) => {
              const [k, v] = decl.split(':').map((s) => s && s.trim());
              if (k && v) el.style[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
            });
          } else {
            el.setAttribute(key, val);
          }
        }
        i = closeIdx + 1;
        if (selfClosing || ['input', 'br', 'hr', 'img'].includes(childTag)) {
          children.push(el);
          continue;
        }
        const r = parseBalanced(html, i, childTag);
        r.children.forEach((c) => el.appendChild(c));
        i = r.endIndex;
        children.push(el);
        continue;
      }
      // text node
      const nextLT = html.indexOf('<', i);
      const text = html.slice(i, nextLT < 0 ? len : nextLT);
      if (text.length && children.length) {
        const last = children[children.length - 1];
        last._textContent = (last._textContent || '') + text;
      } else if (text.length) {
        // free-floating text not attached to any element; skip
      }
      i = nextLT < 0 ? len : nextLT;
    }
    return { children, endIndex: len };
  }

  return { makeEl };
}

// ---------------------------------------------------------------------------
// Load question-renderer.js into a sandbox with our DOM stub.
// ---------------------------------------------------------------------------

const dom = makeDOM();
const sandbox = {
  document: { createElement: dom.makeEl },
  // Globals the renderer uses
  escHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  stripOptPrefix: (s) => String(s == null ? '' : s),
  LETTERS: ['A', 'B', 'C', 'D', 'E', 'F'],
  localStorage: { getItem: () => null, setItem: () => {} },
};
// window === sandbox (browser-like). The renderer does `window.QR = {}` and
// then `QR.TYPES = {...}` which references the bare `QR` global. In a vm
// context, top-level `window.QR = {}` only sets the property on `window` (a
// sandbox property) and does NOT create a bare `QR` global. We mimic the
// browser by making `window` an alias for the sandbox.
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'question-renderer.js'), 'utf8'), sandbox);
const QR = sandbox.QR;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Test 1: _renderBarChart exists and exposes the public renderResults entrypoint.
{
  assert.ok(QR, 'QR global exists');
  assert.equal(typeof QR.renderResults, 'function');
  assert.equal(typeof QR._renderBarChart, 'function');
  console.log('PASS  test 1: QR module exposes renderResults');
}

// Test 2: REGRESSION FIX -- when called twice on the same container with
// matching structure (same options.length) but DIFFERENT counts, the bar
// DOM elements must be REUSED (same identity), not destroyed-and-recreated.
// This is what eliminates the perceived "blink" on the student's .mine bar.
{
  const container = dom.makeEl('div');
  container.className = 'qr-student';
  const options = ['Alpha', 'Beta', 'Gamma', 'Delta'];

  QR._renderBarChart(options, [3, 1, 0, 0], container, {
    showResults: true,
    myAnswerIndex: 1, // student answered B
  });
  const firstRender = container.querySelectorAll('.qr-bar-fill');
  assert.equal(firstRender.length, 4, 'first render produces 4 bar fills');
  const firstUids = firstRender.map((el) => el._uid);

  // Second render: counts changed, options unchanged. Student still answered B.
  QR._renderBarChart(options, [5, 2, 1, 0], container, {
    showResults: true,
    myAnswerIndex: 1,
  });
  const secondRender = container.querySelectorAll('.qr-bar-fill');
  assert.equal(secondRender.length, 4, 'second render still has 4 bar fills');
  const secondUids = secondRender.map((el) => el._uid);

  assert.deepEqual(secondUids, firstUids,
    'BUG REGRESSION: bar fill DOM elements must keep their identity across ' +
    'count updates. If they get a new _uid, they were destroyed and recreated, ' +
    'which is what causes the .mine bar to visibly blink every poll tick.');
  console.log('PASS  test 2: bar fill identity preserved across count updates');
}

// Test 3: width and percentage update correctly on the reused elements.
{
  const container = dom.makeEl('div');
  container.className = 'qr-student';
  const options = ['Alpha', 'Beta'];

  QR._renderBarChart(options, [1, 0], container, {
    showResults: true,
    myAnswerIndex: 0,
  });
  // Total=1, denom=1, pct=[100,0]
  let fills = container.querySelectorAll('.qr-bar-fill');
  assert.equal(fills[0].style.width, '100%', 'first render: A is 100%');
  assert.equal(fills[1].style.width, '0%',   'first render: B is 0%');

  QR._renderBarChart(options, [1, 3], container, {
    showResults: true,
    myAnswerIndex: 0,
  });
  // Total=4, pct=[25,75]
  fills = container.querySelectorAll('.qr-bar-fill');
  assert.equal(fills[0].style.width, '25%', 'updated: A drops to 25%');
  assert.equal(fills[1].style.width, '75%', 'updated: B rises to 75%');
  console.log('PASS  test 3: widths update in place after rerender');
}

// Test 4: the .mine class stays on the SAME element across renders.
// The "your answer" highlight should never disappear+reappear on poll ticks.
{
  const container = dom.makeEl('div');
  container.className = 'qr-student';
  const options = ['Alpha', 'Beta', 'Gamma'];

  QR._renderBarChart(options, [1, 0, 0], container, {
    showResults: true,
    myAnswerIndex: 2, // C is mine
  });
  const fillsBefore = container.querySelectorAll('.qr-bar-fill');
  const mineBefore = fillsBefore[2];
  assert.ok(mineBefore.classList.contains('mine'), 'C bar carries .mine class');

  // 6 sequential polls, counts keep updating
  const sequences = [[1,2,0],[1,2,1],[2,2,1],[3,2,1],[3,3,1],[3,3,2]];
  for (const counts of sequences) {
    QR._renderBarChart(options, counts, container, {
      showResults: true,
      myAnswerIndex: 2,
    });
  }
  const fillsAfter = container.querySelectorAll('.qr-bar-fill');
  const mineAfter = fillsAfter[2];
  assert.equal(mineAfter._uid, mineBefore._uid,
    'after 6 poll ticks, the .mine bar is still the SAME DOM element');
  assert.ok(mineAfter.classList.contains('mine'),
    '.mine class is still applied');
  console.log('PASS  test 4: .mine bar identity + class stable across 6 polls');
}

// Test 5: when options STRUCTURE changes (different length), a full rebuild
// is required and DOM identity is allowed to break. This keeps the in-place
// optimization scoped to the specific same-shape case.
{
  const container = dom.makeEl('div');
  container.className = 'qr-student';
  QR._renderBarChart(['A', 'B'], [1, 0], container, { showResults: true });
  const before = container.querySelectorAll('.qr-bar-fill').map((el) => el._uid);

  // Now render with 3 options (new question entirely)
  QR._renderBarChart(['X', 'Y', 'Z'], [0, 0, 0], container, { showResults: true });
  const after = container.querySelectorAll('.qr-bar-fill');
  assert.equal(after.length, 3, 'structural change rebuilds with 3 bars');
  // Identity may or may not be preserved here; we only require the count match.
  void before;
  console.log('PASS  test 5: structural change still works (different option count)');
}

// Test 6: when myAnswerIndex changes between renders (rare but possible if
// the student's localStorage entry was rewritten), the .mine class must move
// to the new bar AND off the old one.
{
  const container = dom.makeEl('div');
  container.className = 'qr-student';
  const options = ['A', 'B', 'C'];
  QR._renderBarChart(options, [1, 1, 1], container, {
    showResults: true,
    myAnswerIndex: 0,
  });
  let fills = container.querySelectorAll('.qr-bar-fill');
  assert.ok(fills[0].classList.contains('mine'), 'A starts as mine');
  assert.ok(!fills[1].classList.contains('mine'), 'B not mine yet');

  QR._renderBarChart(options, [1, 1, 1], container, {
    showResults: true,
    myAnswerIndex: 1,
  });
  fills = container.querySelectorAll('.qr-bar-fill');
  assert.ok(!fills[0].classList.contains('mine'),
    'A no longer carries .mine after answer changed');
  assert.ok(fills[1].classList.contains('mine'),
    'B now carries .mine');
  console.log('PASS  test 6: .mine class follows myAnswerIndex correctly');
}

// Test 7: when revealAnswer flips from false to true, the .is-correct class
// is added to the parent .qr-bar of the correct option.
{
  const container = dom.makeEl('div');
  container.className = 'qr-student';
  const options = ['A', 'B'];
  QR._renderBarChart(options, [3, 1], container, {
    showResults: true,
    revealAnswer: false,
    correctAnswers: [0],
  });
  let bars = container.querySelectorAll('.qr-bar');
  assert.ok(!bars[0].classList.contains('is-correct'),
    'no reveal -> no is-correct');

  QR._renderBarChart(options, [3, 1], container, {
    showResults: true,
    revealAnswer: true,
    correctAnswers: [0],
  });
  bars = container.querySelectorAll('.qr-bar');
  assert.ok(bars[0].classList.contains('is-correct'),
    'reveal -> A bar becomes is-correct');
  console.log('PASS  test 7: is-correct class toggles when reveal flips');
}

console.log('\nALL STABLE-RENDER TESTS PASS');
