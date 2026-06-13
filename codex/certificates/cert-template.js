// certificates/cert-template.js
// Certificate template sub-module: pure logic + editor mount glue.
//
// A certificate template is a SINGLE-slide deck tagged with CERT_ENGINE so it
// is never mixed with the presentation decks shown in the Slides sub-tab.
// The full Slides editor (content/slides/js/app.js) is reused unchanged via the
// same createCodexStore + editor.mount pattern that content/slides.js uses.
//
// SEALED BOUNDARY NOTE:
//   This module lives outside content/slides/ and therefore may NOT import from
//   content/slides/js/ (modules.test.mjs, Test 3: only content/slides.js holds
//   that privilege). The editor and newDeck references are INJECTED via options
//   so the face module (content/certificates.js, which IS allowed to import from
//   the sealed path) provides them at mount time. The pure functions below have
//   no dependency on the sealed editor at all.
//
// Imports that ARE allowed here:
//   - js/codex-api.js           (the shared facade)
//   - content/slides/adapters/codexStore.js  (under adapters/, not js/)
//   - js/i18n.js

import { slides as api }          from '../js/codex-api.js';
import { createCodexStore }        from '../content/slides/adapters/codexStore.js';

// ── Engine tag ───────────────────────────────────────────────────────────────
// Marks a presentation row as a certificate template so it is never mixed with
// authored decks (DECK_ENGINE = 'codex-deck') or the library container
// (LIBRARY_ENGINE = 'codex-library').
export const CERT_ENGINE = 'codex-certificate';

// ── Token list — SINGLE SOURCE OF TRUTH ─────────────────────────────────────
// Both the palette UI (rendered by the face) and substituteTokens() import this.
// A token whose value is a data URL is handled as QR (see substituteTokens).
export const CERT_TOKENS = [
  { key: 'nome',    label: 'Nome do participante' },
  { key: 'curso',   label: 'Nome do curso'        },
  { key: 'carga',   label: 'Carga horária'        },
  { key: 'data',    label: 'Data de emissão'      },
  { key: 'codigo',  label: 'Código do certificado'},
  { key: 'qr',      label: 'QR code de validação' },
];

// The set of known token keys (derived from CERT_TOKENS so it stays in sync).
export const CERT_TOKEN_KEYS = CERT_TOKENS.map((t) => t.key);

// ── Filter ───────────────────────────────────────────────────────────────────
// Mirrors ourDecks() in content/slides.js. Accepts the `presentations` array
// returned by api.list() and keeps only certificate-template rows.
export function ourTemplates(presentations) {
  return (presentations || []).filter((p) => p.engine === CERT_ENGINE);
}

// ── API wrappers ─────────────────────────────────────────────────────────────
// Thin wrappers over the slides facade. The face module uses these instead of
// calling the facade directly so the engine tag is applied consistently.

/** List all certificate templates (rows tagged CERT_ENGINE). */
export async function listTemplates() {
  const res = await api.list();
  return ourTemplates(res && res.presentations);
}

/** Register a new certificate template row (no deck JSON yet). */
export async function createTemplate(title) {
  const slug = _slugify(title) + '-cert-' + String(Date.now()).slice(-6);
  await api.register({ slug, title, engine: CERT_ENGINE });
  return slug;
}

/** Remove a certificate template row + its stored deck JSON. */
export async function removeTemplate(slug) {
  return api.remove({ slug });
}

// ── Editor mount ─────────────────────────────────────────────────────────────
// Mount the sealed Slides editor over a certificate template deck.
//
// Parameters:
//   el      — the DOM element to mount into (cleared on mount)
//   options — {
//     slug          : string            — the template's presentation slug
//     editor        : object            — the `import * as editor` from slides/js/app.js,
//                                         injected by content/certificates.js
//     newDeckFn     : function          — `newDeck` from slides/js/core/deck.js, injected
//     aiService     : object|null       — result of makeWorkerAi(aiApi.chat), optional
//     library       : object|null       — createLibrary({}) instance, optional
//     _storeFactory : function|null     — for tests only: replaces createCodexStore({slug})
//   }
//
// Returns { unmount } consistent with the tab-contract pattern.
//
// For a FRESH template (no stored deck JSON yet) a single-slide "cover" deck is
// seeded instead of the 3-slide newDeck() default. The seeded deck is saved so a
// reload reopens the same blank canvas, identical to how content/slides.js handles
// fresh presentations.
export function mountTemplateEditor(el, { slug, editor, newDeckFn, aiService, library, _storeFactory } = {}) {
  if (!editor || typeof editor.mount !== 'function') {
    throw new Error('mountTemplateEditor: editor must be the slides app module (import * as editor from …/app.js)');
  }
  if (typeof newDeckFn !== 'function') {
    throw new Error('mountTemplateEditor: newDeckFn must be the newDeck function from …/core/deck.js');
  }

  const storeFactory = _storeFactory || (() => createCodexStore({ slug }));
  const store = storeFactory();
  let saveTimer = null;

  // Kick off async init; errors surface through the store's change event so the
  // face module can show a loading/error state without blocking the mount return.
  (async () => {
    await store.load();
    if (!store.getDeck()) {
      // Fresh template: seed a minimal single-slide deck (cover layout only).
      store.setDeck(_singleSlideDeck(newDeckFn));
      try { await store.save(); } catch (_) { /* surfaced on next edit */ }
    }

    // Debounced autosave on any subsequent deck change.
    store.on('change', () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { store.save().catch(() => {}); }, 800);
    });

    const handles = editor.mount(el, { store, aiService: aiService || null, library: library || null });
    _handles = handles;
  })();

  let _handles = null;

  return {
    unmount() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      if (_handles) {
        try { _handles.unmount(); } catch (_) { /* ignore */ }
        _handles = null;
      }
    },
  };
}

// ── Token substitution ───────────────────────────────────────────────────────
// PURE function: deep-clone the deck, substitute every {{token}} occurrence in
// all slide.slots.* string values and all deck.assets[].text string values.
//
// Rules:
//   - {{qr}} with a data-URL value: the substitution inserts an image asset
//     into the deck at the centre of the canvas (1:1 with the data URL), so
//     the renderer picks it up as a normal image asset. This keeps the mechanism
//     simple and avoids patching the sealed renderer.
//   - Unknown tokens (not in CERT_TOKEN_KEYS and not in `values`) are left as-is.
//   - Original deck is NEVER mutated (deep-clone via JSON round-trip).
//
// @param  {object} deck    — the deck object (plain JSON-serializable)
// @param  {object} values  — e.g. { nome, curso, carga, data, codigo, qr }
// @returns {object}        — substituted deep-clone of deck
export function substituteTokens(deck, values) {
  if (!deck) return deck;
  const vals = values || {};

  // Deep-clone via JSON round-trip (matches schema.clone from the sealed core).
  const out = JSON.parse(JSON.stringify(deck));

  // Replace every {{key}} in a string value. Unknown tokens are left as-is.
  function sub(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmed = key.trim();
      // For QR, if it is a data URL we handle it via assets (see below);
      // in a plain text slot we leave the placeholder as-is so the renderer
      // shows nothing unexpected.  Non-data-URL qr values fall through here.
      if (trimmed === 'qr' && typeof vals[trimmed] === 'string' && vals[trimmed].startsWith('data:')) {
        return match; // will be handled via asset injection after slot pass
      }
      return Object.prototype.hasOwnProperty.call(vals, trimmed) ? String(vals[trimmed]) : match;
    });
  }

  // Walk slides: substitute string values in slots, and asset.text fields.
  for (const slide of out.slides || []) {
    // slots
    const slots = slide.slots;
    if (slots && typeof slots === 'object') {
      for (const k of Object.keys(slots)) {
        if (typeof slots[k] === 'string') {
          slots[k] = sub(slots[k]);
        } else if (Array.isArray(slots[k])) {
          // Lists of items (cards, topics, etc.): substitute the `text` field.
          for (const item of slots[k]) {
            if (item && typeof item.text === 'string') {
              item.text = sub(item.text);
            }
          }
        }
      }
    }
  }

  // deck-level assets: text boxes
  for (const asset of out.assets || []) {
    if (asset && typeof asset.text === 'string') {
      asset.text = sub(asset.text);
    }
  }

  // QR injection: if values.qr is a data URL, inject an image asset centred on
  // the first slide (v1: single-slide certificate). The asset gets a stable id
  // derived from the token so callers can identify it if needed.
  if (typeof vals.qr === 'string' && vals.qr.startsWith('data:') && out.slides && out.slides.length > 0) {
    const canvas = out.canvas || { w: 1280, h: 720 };
    const side = 180; // QR size in canvas units
    const qrAsset = {
      id: 'cert-qr',
      type: 'image',
      src: vals.qr,
      x: Math.round((canvas.w - side) / 2),
      y: Math.round((canvas.h - side) / 2),
      w: side,
      rot: 0,
      scope: 'slide',
      slideId: out.slides[0].id,
    };
    if (!out.assets) out.assets = [];
    out.assets.push(qrAsset);
  }

  return out;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _slugify(s) {
  return (s || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// A minimal single-slide deck for a fresh certificate template.
// Uses a "cover" layout (the closest blank-canvas equivalent), keeping the
// default deck theme. Does NOT depend on `newDeck()` (which seeds 3 slides) so
// the face injects newDeckFn only for reference; we build the single-slide deck
// by combining newDeck()'s structure with a single cover slide.
function _singleSlideDeck(newDeckFn) {
  const base = newDeckFn();
  // Replace the 3-slide array with a single blank cover slide.
  base.slides = [
    {
      id: _uid(),
      layout: 'cover',
      slots: { eyebrow: '', title: '{{nome}}', sub: '{{curso}}', icon: null },
      notes: '',
      overrides: {},
    },
  ];
  base.title = 'Modelo de certificado';
  return base;
}

function _uid() {
  return Math.random().toString(36).slice(2, 9);
}
