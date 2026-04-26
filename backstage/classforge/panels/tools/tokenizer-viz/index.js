// tools/tokenizer-viz/index.js
//
// Phase 3A. tokenizer-viz: first real micro-tool. User types in a textarea
// and a wall of color-coded chips appears, each labeled with the token text
// and its numeric GPT-4 (cl100k_base) id. A counts footer shows tokens,
// characters, and chars-per-token.
//
// The default encoder loads js-tiktoken lite plus the cl100k_base ranks via
// dynamic import + fetch the first time a host page mounts the tool. The
// resulting encoder is cached at module scope, so re-mounts are instant.
// Tests inject `config.encoderFactory` to bypass the network entirely.

import { registerTool } from '../../engine/registry.js';

const DEBOUNCE_MS = 50;
const CHIP_COLORS = 12;
const REPL = '�';

// Pinned CDN URLs:
//   js-tiktoken: https://esm.sh/js-tiktoken@1.0.20/lite
//   cl100k ranks: https://tiktoken.pages.dev/js/cl100k_base.json

let encoderPromise = null;

async function defaultEncoderFactory() {
  const [tiktokenMod, ranks] = await Promise.all([
    import('https://esm.sh/js-tiktoken@1.0.20/lite'),
    fetch('https://tiktoken.pages.dev/js/cl100k_base.json').then((r) => {
      if (!r.ok) throw new Error('tokenizer-viz: failed to fetch cl100k_base ranks: HTTP ' + r.status);
      return r.json();
    }),
  ]);
  const Tiktoken = tiktokenMod.Tiktoken;
  const enc = new Tiktoken(ranks);
  return {
    encode: (s) => enc.encode(String(s)),
    decode: (ids) => enc.decode(ids),
  };
}

function loadEncoder(factory) {
  if (!encoderPromise) {
    encoderPromise = Promise.resolve()
      .then(() => factory())
      .catch((err) => { encoderPromise = null; throw err; });
  }
  return encoderPromise;
}

const EXAMPLES = [
  { label: 'Tribunal', text: 'Tribunal' },
  { label: 'Eu nao vi a manga', text: 'Eu nao vi a manga' },
  { label: 'EN vs PT', text: 'EN: The cat sat\nPT: O gato sentou' },
];

function tokenize(value, enc) {
  const ids = enc.encode(value);
  const groups = [];
  let i = 0;
  while (i < ids.length) {
    let j = i;
    let text = '';
    let clean = false;
    while (j < ids.length) {
      text = enc.decode(ids.slice(i, j + 1));
      if (!text.includes(REPL)) { clean = true; break; }
      j += 1;
    }
    if (!clean) {
      text = (text || '').split(REPL).join('?');
      j = ids.length - 1;
    }
    groups.push({ ids: ids.slice(i, j + 1), text });
    i = j + 1;
  }
  return groups;
}

function buildSkeleton(container) {
  const root = document.createElement('section');
  root.className = 'tok-root';

  const ta = document.createElement('textarea');
  ta.className = 'tok-input';
  ta.setAttribute('placeholder', 'Digite aqui...');
  ta.setAttribute('spellcheck', 'false');
  root.appendChild(ta);

  const examples = document.createElement('div');
  examples.className = 'tok-examples';
  root.appendChild(examples);

  const chips = document.createElement('div');
  chips.className = 'tok-chips';
  root.appendChild(chips);

  const counts = document.createElement('div');
  counts.className = 'tok-counts';
  root.appendChild(counts);

  container.appendChild(root);
  return { root, ta, examples, chips, counts };
}

function buildExampleButtons(host, onPick) {
  for (const ex of EXAMPLES) {
    const btn = document.createElement('button');
    btn.className = 'tok-example-btn';
    btn.setAttribute('type', 'button');
    btn.textContent = ex.label;
    btn.addEventListener('click', () => onPick(ex.text));
    host.appendChild(btn);
  }
}

function makeChip(group, index) {
  const chip = document.createElement('span');
  const groupCls = group.ids.length > 1 ? ' tok-chip--group' : '';
  chip.className = 'tok-chip' + groupCls;
  chip.style.background = 'var(--tok-chip-' + ((index % CHIP_COLORS) + 1) + ')';

  const text = document.createElement('span');
  text.className = 'tok-chip__text';
  text.textContent = group.text === '' ? ' ' : group.text;
  chip.appendChild(text);

  const meta = document.createElement('span');
  meta.className = 'tok-chip__meta';
  meta.textContent = group.ids.length === 1 ? String(group.ids[0]) : group.ids.length + ' ids';
  chip.appendChild(meta);

  if (group.ids.length > 1) chip.setAttribute('data-ids', String(group.ids.length));

  return chip;
}

function renderCounts(host, value, tokenCount) {
  const charCount = Array.from(value).length;
  const ratio = tokenCount > 0 ? (charCount / tokenCount).toFixed(2) : '0.00';
  host.innerHTML = '';
  const tokens = document.createElement('span');
  tokens.className = 'tok-counts__cell';
  tokens.textContent = 'tokens: ' + tokenCount;
  host.appendChild(tokens);
  const chars = document.createElement('span');
  chars.className = 'tok-counts__cell';
  chars.textContent = 'chars: ' + charCount;
  host.appendChild(chars);
  const ratioCell = document.createElement('span');
  ratioCell.className = 'tok-counts__cell';
  ratioCell.textContent = 'chars/token: ' + ratio;
  host.appendChild(ratioCell);
}

function renderPlaceholder(chips, message) {
  chips.innerHTML = '';
  const ph = document.createElement('span');
  ph.className = 'tok-placeholder';
  ph.textContent = message;
  chips.appendChild(ph);
}

let mounted = null;

registerTool({
  id: 'tokenizer-viz',
  kind: 'tool',
  mount(container, config) {
    const cfg = config || {};
    const factory = cfg.encoderFactory || defaultEncoderFactory;

    const dom = buildSkeleton(container);
    let encoder = null;
    let pending = 0;

    function render() {
      const value = dom.ta.value || '';
      if (!encoder) {
        renderPlaceholder(dom.chips, 'carregando tokenizer...');
        renderCounts(dom.counts, value, 0);
        return;
      }
      const groups = tokenize(value, encoder);
      dom.chips.innerHTML = '';
      groups.forEach((g, i) => dom.chips.appendChild(makeChip(g, i)));
      renderCounts(dom.counts, value, groups.length);
    }

    function scheduleRender() {
      clearTimeout(pending);
      pending = setTimeout(render, DEBOUNCE_MS);
    }

    function setText(value) {
      dom.ta.value = value;
      render();
    }

    const inputHandler = () => scheduleRender();
    dom.ta.addEventListener('input', inputHandler);
    buildExampleButtons(dom.examples, setText);

    render();

    loadEncoder(factory)
      .then((enc) => {
        encoder = enc;
        if (typeof cfg.seed === 'string' && cfg.seed) dom.ta.value = cfg.seed;
        render();
      })
      .catch((err) => {
        renderPlaceholder(dom.chips, 'falha ao carregar tokenizer: ' + (err && err.message ? err.message : String(err)));
      });

    mounted = { root: dom.root, ta: dom.ta, inputHandler, getPending: () => pending };
  },

  unmount() {
    if (!mounted) return;
    clearTimeout(mounted.getPending());
    if (mounted.ta && typeof mounted.ta.removeEventListener === 'function') {
      mounted.ta.removeEventListener('input', mounted.inputHandler);
    }
    if (mounted.root && typeof mounted.root.remove === 'function') {
      mounted.root.remove();
    }
    mounted = null;
  },
});
