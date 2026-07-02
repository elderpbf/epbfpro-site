// codex/js/settings-drawer.js — the app-owned Settings drawer SHELL (pure
// mechanics, no auth). Behavioral tests over a DOM stub: sections render in the
// given order, onInit runs once + onOpen runs on open, the settings button opens
// the drawer, the accordion toggles, and the .sd- styles inject once.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeClassList() {
  const s = new Set();
  return {
    add: (c) => s.add(c),
    remove: (c) => s.delete(c),
    contains: (c) => s.has(c),
    toggle: (c, on) => { const want = on === undefined ? !s.has(c) : on; if (want) s.add(c); else s.delete(c); return want; },
  };
}

const byId = new Map();

function makeEl(tag) {
  const L = {};
  const el = {
    tag, id: '', className: '', hidden: false, textContent: '', disabled: false,
    style: {}, attrs: {}, children: [], _html: '', _sections: [],
    classList: makeClassList(),
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(t2, fn) { (L[t2] = L[t2] || []).push(fn); },
    removeEventListener(t2, fn) { L[t2] = (L[t2] || []).filter((f) => f !== fn); },
    dispatch(t2, ev) { (L[t2] || []).slice().forEach((fn) => fn.call(el, ev || {})); },
    count(t2) { return (L[t2] || []).length; },
    appendChild(c) { this.children.push(c); if (c.id) byId.set(c.id, c); return c; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this._sections = parseSections(v); },
    querySelectorAll(sel) { return sel === '.sd-section-header' ? this._sections.map((s) => s.header) : []; },
    querySelector() { return null; },
  };
  return el;
}

// Parse the _buildSection output: one entry per data-sd-section, with header/body
// stubs wired like the real DOM so the accordion toggle can be exercised.
function parseSections(html) {
  const re = /data-sd-section="([^"]*)"[\s\S]*?<div class="sd-section-body"( hidden)?>/g;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = makeEl('div');
    body.hidden = !!m[2];
    const section = makeEl('div');
    section.querySelector = (sel) => (sel === '.sd-section-body' ? body : null);
    const header = makeEl('button');
    header.closest = (sel) => (sel === '.sd-section' ? section : null);
    out.push({ id: m[1], header, body, section });
  }
  return out;
}

globalThis.requestAnimationFrame = (fn) => fn();
const _docL = {};
globalThis.document = {
  head: makeEl('head'),
  body: makeEl('body'),
  createElement: makeEl,
  getElementById: (id) => byId.get(id) || null,
  addEventListener(t2, fn) { (_docL[t2] = _docL[t2] || []).push(fn); },
  removeEventListener(t2, fn) { _docL[t2] = (_docL[t2] || []).filter((f) => f !== fn); },
  dispatch(t2, ev) { (_docL[t2] || []).slice().forEach((fn) => fn(ev || {})); },
};

const drawer = await import('../js/settings-drawer.js');

function freshButton(id) { const b = makeEl('button'); b.id = id; byId.set(id, b); return b; }
function sectionSpy(id, title, opts = {}) {
  const calls = { init: 0, open: 0 };
  return {
    desc: {
      id, title, content: '<button class="bs-toggle-btn">x</button>', expanded: opts.expanded === true,
      onInit() { calls.init++; }, onOpen() { calls.open++; },
    },
    calls,
  };
}

test('renders sections in the exact order given', () => {
  freshButton('sd-close'); freshButton('settings-btn');
  const a = sectionSpy('sec-a', 'Alpha');
  const b = sectionSpy('sec-b', 'Bravo');
  const c = sectionSpy('sec-c', 'Charlie');
  drawer.init({ sections: [a.desc, b.desc, c.desc] });
  const html = byId.get('settings-drawer').innerHTML;
  const ia = html.indexOf('data-sd-section="sec-a"');
  const ib = html.indexOf('data-sd-section="sec-b"');
  const ic = html.indexOf('data-sd-section="sec-c"');
  assert.ok(ia >= 0 && ia < ib && ib < ic, 'sections appear in array order');
  assert.match(html, /Alpha/); assert.match(html, /Bravo/); assert.match(html, /Charlie/);
});

test('calls each section onInit exactly once', () => {
  freshButton('sd-close'); freshButton('settings-btn');
  const a = sectionSpy('one', 'One');
  const b = sectionSpy('two', 'Two');
  drawer.init({ sections: [a.desc, b.desc] });
  assert.equal(a.calls.init, 1);
  assert.equal(b.calls.init, 1);
});

test('open() fires the section onOpen callbacks; closed by default', () => {
  freshButton('sd-close'); freshButton('settings-btn');
  const a = sectionSpy('live', 'Live');
  drawer.init({ sections: [a.desc] });
  const before = a.calls.open;
  drawer.open();
  assert.equal(a.calls.open, before + 1, 'onOpen fired exactly once for this open()');
});

test('the settings button opens the drawer', () => {
  freshButton('sd-close');
  const btn = freshButton('settings-btn');
  drawer.init({ sections: [sectionSpy('x', 'X').desc] });
  const aside = byId.get('settings-drawer');
  aside.hidden = true;
  btn.dispatch('click', {});
  assert.equal(aside.hidden, false, 'drawer revealed on gear click');
});

test('expanded:true renders the body open', () => {
  freshButton('sd-close'); freshButton('settings-btn');
  drawer.init({ sections: [sectionSpy('exp', 'Exp', { expanded: true }).desc] });
  const html = byId.get('settings-drawer').innerHTML;
  assert.match(html, /class="sd-section sd-section-open"/, 'open class on expanded section');
});

test('clicking a section header toggles its body', () => {
  freshButton('sd-close'); freshButton('settings-btn');
  drawer.init({ sections: [sectionSpy('tog', 'Tog').desc] });
  const aside = byId.get('settings-drawer');
  const header = aside.querySelectorAll('.sd-section-header')[0];
  const body = header.closest('.sd-section').querySelector('.sd-section-body');
  assert.equal(body.hidden, true, 'starts collapsed');
  header.dispatch('click', {});
  assert.equal(body.hidden, false, 'expands on click');
  assert.ok(header.closest('.sd-section').classList.contains('sd-section-open'));
  header.dispatch('click', {});
  assert.equal(body.hidden, true, 'collapses again');
});

test('Escape closes the open drawer', () => {
  freshButton('sd-close'); freshButton('settings-btn');
  drawer.init({ sections: [sectionSpy('esc', 'Esc').desc] });
  const aside = byId.get('settings-drawer');
  drawer.open();
  assert.ok(aside.classList.contains('open'), 'open class set after open()');
  document.dispatch('keydown', { key: 'Escape' });
  assert.ok(!aside.classList.contains('open'), 'Escape removes the open class');
});

test('the .sd- styles are injected exactly once', () => {
  freshButton('sd-close'); freshButton('settings-btn');
  drawer.init({ sections: [sectionSpy('s1', 'S1').desc] });
  freshButton('sd-close'); freshButton('settings-btn');
  drawer.init({ sections: [sectionSpy('s2', 'S2').desc] });
  const styles = document.head.children.filter((c) => c.id === 'sd-styles');
  assert.equal(styles.length, 1, 'single <style id=sd-styles>');
});
