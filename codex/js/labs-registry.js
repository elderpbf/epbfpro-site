// codex/js/labs-registry.js
// Codex-owned PensoLabs registry. ES-module port of the legacy window.CVLabs
// (backstage/classvault/js/cv-labs.js). PensoLabs demos are shipped artifacts
// (not user-authored), so the registry lives in code, not the DB: each lab is a
// synthetic item with a 'lab:<key>' id the renderers pick up without schema
// changes. Shared seam (codex/js/): consumed by Content > Labs + Presets and by
// Lessons. The legacy backstage global stays live for the un-ported ClassVault.
//
// Public API: LABS, findItem(idStr), getAllItems(), isLabEnabled(key),
// orderedLabs(), labOrderIndex(key), setLabOrder(keys), labIcon(key).
// The legacy renderSection()/LABS_GLYPH (the ClassVault "Aula" index DOM) is NOT
// ported: Codex renders Labs natively (content/labs.js, lessons.js), so that
// markup would be dead code emitting cv- classes the native modules forbid.

// Lab definitions are SHIPPED DATA — kept byte-identical with the legacy registry
// so the same lab pages resolve. The lab HTML still lives at /codex/labs/<key>/
// (moving it is the legacy quarantine step, not this port).
export const LABS = [
  {
    key: 'k1',
    title: 'Atenção!',
    summary: 'Contexto reescreve significado',
    emoji: '🎯'
  },
  {
    key: 'k2',
    title: 'Temperatura',
    summary: 'Distribuição, amostragem, sobreajuste',
    emoji: '🌡️'
  },
  {
    key: 'k3',
    title: 'Janela de contexto',
    summary: 'Orçamento de tokens e compactação',
    emoji: '🪟'
  },
  {
    key: 'k4',
    title: 'Perdido no meio',
    summary: 'Acurácia cai onde a atenção afrouxa',
    emoji: '🧩'
  },
  {
    key: 'k9',
    title: 'Petição envenenada',
    summary: 'Texto invisível vira instrução ao modelo',
    emoji: '☣️'
  },
  {
    key: 'k10',
    title: 'Cápsula do GPT',
    summary: 'Setup pinado uma vez, reutilizado em todo turno',
    emoji: '💊'
  },
  {
    key: 'k11',
    title: 'Confiança vs Fundamento',
    summary: 'Soa convicto mesmo quando inventa',
    emoji: '🎭'
  },
  {
    key: 'k12',
    title: 'Lavagem de informação',
    summary: 'Repetição em escala vira "conhecimento" no peso',
    emoji: '🌀'
  },
  {
    key: 'k13',
    title: 'Três velocidades',
    summary: 'Tradicional, raciocínio e agêntico são formatos diferentes',
    emoji: '⚡'
  },
  {
    key: 'k14',
    title: 'Reforça ou enfraquece',
    summary: 'Acerto reforça o caminho no peso; erro o enfraquece',
    emoji: '🔗'
  },
  {
    key: 'k15',
    title: 'Sinapse',
    summary: 'Acerto e erro mudam o peso; repetição pode virar decoreba',
    emoji: '🧠'
  },
  {
    key: 'k16',
    title: 'PDF: imagem ou texto?',
    summary: 'Duas camadas de um PDF, e o que o OCR faz entre elas',
    emoji: '📄'
  }
];

// Reads the on/off map written by the Content > Labs subtab (content/labs.js).
// Default-on: a missing key = enabled. Disabled labs are filtered from the Aula
// index and from getAllItems so the Presets picker can't reach them.
export function isLabEnabled(key) {
  try {
    var raw = localStorage.getItem('cv_labs_enabled');
    if (!raw) return true;
    var map = JSON.parse(raw);
    return !map || map[key] !== false;
  } catch (e) { return true; }
}

// Drag-to-reorder (Content > Labs) persists here as an ordered array of keys.
// Every consumer (the rail itself, getAllItems(), releases.js's Labs rows)
// derives its order from orderedLabs(), so reordering in one place propagates
// everywhere without each consumer keeping its own order state.
const LS_ORDER = 'cv_labs_order';

function _readOrder() {
  try {
    const raw = localStorage.getItem(LS_ORDER);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

// LABS in the admin's chosen order. Keys no longer in the registry are
// dropped; labs not yet in the stored order keep their registry position,
// appended after the ordered ones (covers new labs added after the last drag).
export function orderedLabs() {
  const order = _readOrder();
  const byKey = new Map(LABS.map((l) => [l.key, l]));
  const ordered = order.map((k) => byKey.get(k)).filter(Boolean);
  const seen = new Set(ordered.map((l) => l.key));
  return ordered.concat(LABS.filter((l) => !seen.has(l.key)));
}

export function labOrderIndex(key) {
  return orderedLabs().findIndex((l) => l.key === key);
}

export function setLabOrder(keys) {
  try { localStorage.setItem(LS_ORDER, JSON.stringify(keys)); } catch (e) { /* ignore */ }
}

function _enabledLabs() {
  return orderedLabs().filter(function (l) { return isLabEnabled(l.key); });
}

// The icon convention shared with js/glyphs.js's iconHtml(): an emoji char, or
// 'glyph:<key>' for the shared library. Falls back to the flask glyph for any
// lab that hasn't been given an emoji yet.
export function labIcon(key) {
  const lab = LABS.find((l) => l.key === key);
  return (lab && lab.emoji) || 'glyph:flask';
}

// Build the synthetic item shape the renderers expect.
function labToItem(lab) {
  return {
    id: 'lab:' + lab.key,
    type: 'lab',
    type_label: 'Lab',
    type_icon: labIcon(lab.key),
    title: lab.title,
    summary: lab.summary,
    meta_json: { url: '/codex/labs/' + lab.key + '/' }
  };
}

export function findItem(idStr) {
  if (!idStr || String(idStr).indexOf('lab:') !== 0) return null;
  const key = String(idStr).slice(4);
  const lab = LABS.find(l => l.key === key);
  return lab ? labToItem(lab) : null;
}

// Returns every ENABLED lab in picker-compatible item shape. Used by the Presets
// editor (so labs can be added to presets alongside ct_items rows) and by the
// Lessons sidebar Labs section. Cheap synchronous accessor (no I/O).
export function getAllItems() {
  return _enabledLabs().map(labToItem);
}
