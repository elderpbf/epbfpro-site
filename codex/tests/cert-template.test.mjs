// tests/cert-template.test.mjs
// TDD tests for the certificate template module (certificates/cert-template.js).
// Tests cover:
//   - Module loads and exports the documented surface
//   - CERT_ENGINE tag and ourTemplates() filter
//   - CERT_TOKENS is the single source used by the palette (token list)
//   - substituteTokens: slots replaced, asset.text replaced, unknown tokens,
//     original deck unchanged (deep clone), {{qr}} data-URL injection
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Dynamic import so we get the real ES module exports.
const {
  CERT_ENGINE,
  CERT_TOKENS,
  CERT_TOKEN_KEYS,
  ourTemplates,
  listTemplates,
  createTemplate,
  removeTemplate,
  mountTemplateEditor,
  substituteTokens,
} = await import(new URL('../certificates/cert-template.js', import.meta.url));

// ── 1. Module surface ─────────────────────────────────────────────────────────
describe('module exports', () => {
  test('CERT_ENGINE is the expected string', () => {
    assert.equal(CERT_ENGINE, 'codex-certificate');
  });

  test('CERT_TOKENS is an array with all six tokens', () => {
    assert.ok(Array.isArray(CERT_TOKENS));
    const keys = CERT_TOKENS.map((t) => t.key);
    for (const k of ['nome', 'curso', 'carga', 'data', 'codigo', 'qr']) {
      assert.ok(keys.includes(k), `CERT_TOKENS missing token key: ${k}`);
    }
    assert.equal(CERT_TOKENS.length, 6);
  });

  test('CERT_TOKEN_KEYS matches CERT_TOKENS keys', () => {
    assert.deepEqual(CERT_TOKEN_KEYS, CERT_TOKENS.map((t) => t.key));
  });

  test('all expected functions are exported', () => {
    assert.equal(typeof ourTemplates,       'function');
    assert.equal(typeof listTemplates,      'function');
    assert.equal(typeof createTemplate,     'function');
    assert.equal(typeof removeTemplate,     'function');
    assert.equal(typeof mountTemplateEditor,'function');
    assert.equal(typeof substituteTokens,   'function');
  });
});

// ── 2. ourTemplates filter ────────────────────────────────────────────────────
describe('ourTemplates', () => {
  const rows = [
    { slug: 'a', engine: 'codex-deck'        },
    { slug: 'b', engine: 'codex-certificate' },
    { slug: 'c', engine: 'codex-library'     },
    { slug: 'd', engine: 'codex-certificate' },
    { slug: 'e', engine: null                },
  ];

  test('keeps only rows tagged with CERT_ENGINE', () => {
    const result = ourTemplates(rows);
    assert.equal(result.length, 2);
    assert.ok(result.every((r) => r.engine === 'codex-certificate'));
    assert.deepEqual(result.map((r) => r.slug), ['b', 'd']);
  });

  test('returns empty array for empty input', () => {
    assert.deepEqual(ourTemplates([]), []);
  });

  test('handles null/undefined gracefully', () => {
    assert.deepEqual(ourTemplates(null), []);
    assert.deepEqual(ourTemplates(undefined), []);
  });
});

// ── 3. substituteTokens — core behaviour ─────────────────────────────────────
// Fixture: a minimal deck with slots and assets containing tokens.
function makeDeck() {
  return {
    id: 'deck1',
    title: 'Modelo',
    canvas: { w: 1280, h: 720 },
    theme: {},
    slides: [
      {
        id: 'slide1',
        layout: 'cover',
        slots: {
          title: 'Certificado de {{nome}}',
          sub:   'Curso: {{curso}} — Carga: {{carga}}h',
          eyebrow: '',
          icon: null,
          // A list-style slot (topics / cards)
          bullets: [
            { id: 'b1', text: 'Emitido em {{data}} para {{nome}}' },
            { id: 'b2', text: 'Código: {{codigo}}' },
          ],
        },
        notes: '',
        overrides: {},
      },
    ],
    assets: [
      { id: 'logo', type: 'image', src: 'logo.png', x: 0, y: 0, w: 100, rot: 0 },
      { id: 'txt1', type: 'text',  text: 'Válido via {{codigo}} — {{nome}}', x: 100, y: 100, w: 300, rot: 0 },
    ],
  };
}

const VALUES = {
  nome:   'Maria Oliveira',
  curso:  'IA Aplicada',
  carga:  '40',
  data:   '12/06/2026',
  codigo: 'CERT-001',
};

describe('substituteTokens', () => {
  test('replaces tokens in slide slots string values', () => {
    const deck = makeDeck();
    const out  = substituteTokens(deck, VALUES);
    assert.equal(out.slides[0].slots.title, 'Certificado de Maria Oliveira');
    assert.equal(out.slides[0].slots.sub,   'Curso: IA Aplicada — Carga: 40h');
  });

  test('replaces tokens in list-item .text fields', () => {
    const deck = makeDeck();
    const out  = substituteTokens(deck, VALUES);
    assert.equal(out.slides[0].slots.bullets[0].text, 'Emitido em 12/06/2026 para Maria Oliveira');
    assert.equal(out.slides[0].slots.bullets[1].text, 'Código: CERT-001');
  });

  test('replaces tokens in assets[].text string values', () => {
    const deck = makeDeck();
    const out  = substituteTokens(deck, VALUES);
    assert.equal(out.assets[1].text, 'Válido via CERT-001 — Maria Oliveira');
  });

  test('non-text assets (no .text) are untouched', () => {
    const deck = makeDeck();
    const out  = substituteTokens(deck, VALUES);
    assert.equal(out.assets[0].src, 'logo.png');
    assert.equal(out.assets[0].text, undefined);
  });

  test('original deck is deep-cloned and never mutated', () => {
    const deck    = makeDeck();
    const before  = JSON.stringify(deck);
    substituteTokens(deck, VALUES);
    assert.equal(JSON.stringify(deck), before, 'original deck must not be mutated');
  });

  test('unknown tokens are left as-is', () => {
    const deck = makeDeck();
    // Inject an unknown token in a slot.
    deck.slides[0].slots.title = '{{nome}} via {{unrecognized}}';
    const out = substituteTokens(deck, VALUES);
    assert.equal(out.slides[0].slots.title, 'Maria Oliveira via {{unrecognized}}');
  });

  test('missing value for a known token leaves the placeholder', () => {
    const deck = makeDeck();
    // Omit `nome` from values.
    const partial = { ...VALUES };
    delete partial.nome;
    const out = substituteTokens(deck, partial);
    assert.equal(out.slides[0].slots.title, 'Certificado de {{nome}}');
  });

  test('null/undefined deck returns the same falsy value', () => {
    assert.equal(substituteTokens(null, VALUES), null);
    assert.equal(substituteTokens(undefined, VALUES), undefined);
  });

  // ── qr token: data-URL injects an image asset ─────────────────────────────
  test('{{qr}} data-URL injects an image asset into the first slide', () => {
    const deck   = makeDeck();
    // Ensure no qr text in slots for this test.
    const qrDataUrl = 'data:image/png;base64,iVBORw0K';
    const vals   = { ...VALUES, qr: qrDataUrl };
    const out    = substituteTokens(deck, vals);
    const qrAsset = out.assets.find((a) => a.id === 'cert-qr');
    assert.ok(qrAsset, 'should inject an asset with id "cert-qr"');
    assert.equal(qrAsset.type, 'image');
    assert.equal(qrAsset.src, qrDataUrl);
    assert.equal(qrAsset.slideId, out.slides[0].id);
  });

  test('{{qr}} data-URL does NOT mutate the original deck', () => {
    const deck = makeDeck();
    const before = JSON.stringify(deck);
    substituteTokens(deck, { ...VALUES, qr: 'data:image/png;base64,abc' });
    assert.equal(JSON.stringify(deck), before);
  });

  test('{{qr}} non-data-URL is substituted as a plain string', () => {
    const deck = makeDeck();
    deck.assets[1].text = 'QR: {{qr}}';
    const out = substituteTokens(deck, { ...VALUES, qr: 'https://example.com/validate/CERT-001' });
    assert.equal(out.assets[1].text, 'QR: https://example.com/validate/CERT-001');
    // No cert-qr asset injected for non-data-URL.
    assert.ok(!out.assets.find((a) => a.id === 'cert-qr'));
  });

  // ── single source of truth: CERT_TOKENS is what the palette uses ──────────
  test('token list (CERT_TOKENS) is the same reference as CERT_TOKEN_KEYS source', () => {
    // Confirm the token keys derivation is consistent.
    const fromTokens = CERT_TOKENS.map((t) => t.key);
    assert.deepEqual(CERT_TOKEN_KEYS, fromTokens);
    // All tokens in CERT_TOKENS are usable as substitution keys.
    const deck = {
      slides: [{ id: 's1', layout: 'cover', slots: { title: CERT_TOKEN_KEYS.map((k) => `{{${k}}}`).join(' ') }, notes: '', overrides: {} }],
      assets: [],
    };
    const allVals = Object.fromEntries(CERT_TOKEN_KEYS.map((k) => [k, `[${k}]`]));
    const out = substituteTokens(deck, allVals);
    const expected = CERT_TOKEN_KEYS.map((k) => `[${k}]`).join(' ');
    assert.equal(out.slides[0].slots.title, expected);
  });
});

// ── 4. mountTemplateEditor guard ─────────────────────────────────────────────
// mountTemplateEditor needs a real DOM + sealed editor. In the test environment
// we just verify the guard behaviour (bad arguments throw) and that it is a
// function. Heavy DOM behaviour is covered by integration; keep it light here.
describe('mountTemplateEditor guards', () => {
  test('throws when editor is not provided', () => {
    assert.throws(
      () => mountTemplateEditor(null, { slug: 'test', newDeckFn: () => ({}) }),
      /editor must be/,
    );
  });

  test('throws when editor.mount is not a function', () => {
    assert.throws(
      () => mountTemplateEditor(null, { slug: 'test', editor: {}, newDeckFn: () => ({}) }),
      /editor must be/,
    );
  });

  test('throws when newDeckFn is not a function', () => {
    assert.throws(
      () => mountTemplateEditor(null, { slug: 'test', editor: { mount: () => {} } }),
      /newDeckFn must be/,
    );
  });

  test('returns object with unmount when valid args provided (stub editor)', () => {
    // Minimal DOM stub.
    const el = { innerHTML: '' };
    const editorStub = {
      mount: () => ({ unmount: () => {} }),
    };
    const newDeckStub = () => ({
      id: 'x', title: 't', canvas: { w: 1280, h: 720 }, theme: {}, slides: [], assets: [],
    });
    // Inject a stub store factory so createCodexStore is never called (avoids
    // triggering the real backend's callWorker which is undefined in Node.js).
    const stubStore = {
      getDeck: () => null,
      setDeck: () => {},
      load: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      on: () => (() => {}),
    };
    const storeFactory = () => stubStore;
    let result;
    // mountTemplateEditor is synchronous in its return; async init fires separately.
    assert.doesNotThrow(() => {
      result = mountTemplateEditor(el, {
        slug: 'test-slug',
        editor: editorStub,
        newDeckFn: newDeckStub,
        _storeFactory: storeFactory,
      });
    });
    assert.equal(typeof result.unmount, 'function');
    // Calling unmount on a not-yet-initialised handle must not throw.
    assert.doesNotThrow(() => result.unmount());
  });
});
