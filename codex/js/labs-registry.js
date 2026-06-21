// codex/js/labs-registry.js
// Codex-owned PensoLabs registry. ES-module port of the legacy window.CVLabs
// (backstage/classvault/js/cv-labs.js). PensoLabs demos are shipped artifacts
// (not user-authored), so the registry lives in code, not the DB: each lab is a
// synthetic item with a 'lab:<key>' id the renderers pick up without schema
// changes. Shared seam (codex/js/): consumed by Content > Labs + Presets and by
// Lessons. The legacy backstage global stays live for the un-ported ClassVault.
//
// Public API: LABS, findItem(idStr), getAllItems(), isLabEnabled(key).
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
    summary: 'Contexto reescreve significado'
  },
  {
    key: 'k2',
    title: 'Temperatura',
    summary: 'Distribuição, amostragem, sobreajuste'
  },
  {
    key: 'k3',
    title: 'Janela de contexto',
    summary: 'Orçamento de tokens e compactação'
  },
  {
    key: 'k4',
    title: 'Perdido no meio',
    summary: 'Acurácia cai onde a atenção afrouxa'
  },
  {
    key: 'k9',
    title: 'Petição envenenada',
    summary: 'Texto invisível vira instrução ao modelo'
  },
  {
    key: 'k10',
    title: 'Cápsula do GPT',
    summary: 'Setup pinado uma vez, reutilizado em todo turno'
  },
  {
    key: 'k11',
    title: 'Confiança vs Fundamento',
    summary: 'Soa convicto mesmo quando inventa'
  },
  {
    key: 'k12',
    title: 'Lavagem de informação',
    summary: 'Repetição em escala vira "conhecimento" no peso'
  },
  {
    key: 'k13',
    title: 'Três velocidades',
    summary: 'Tradicional, raciocínio e agêntico são formatos diferentes'
  },
  {
    key: 'k14',
    title: 'Reforça ou enfraquece',
    summary: 'Acerto reforça o caminho no peso; erro o enfraquece'
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

function _enabledLabs() {
  return LABS.filter(function (l) { return isLabEnabled(l.key); });
}

// Build the synthetic item shape the renderers expect.
function labToItem(lab) {
  return {
    id: 'lab:' + lab.key,
    type: 'lab',
    type_label: 'Lab',
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
