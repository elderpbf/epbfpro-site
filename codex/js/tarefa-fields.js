// Codex-owned tarefa field-type registry.
//
// cdx- port of the legacy backstage CTTarefaFields global. One descriptor per
// kind of answer field; emits the SAME .ct-tarefa-* / .ct-resp-* markup the
// Trail/admin CSS already style. Phase 5 ships 'text' only; the others are
// declared disabled:true so a chip strip can preview future support without
// enabling submission.
//
// Public API: getField(slug) -> descriptor (falls back to 'text'); listFields().
// Each descriptor: { slug, label, disabled, renderForm, readValue, validate,
// renderStored, toCsvValue }. The pure bits (validate / toCsvValue / renderStored
// / get / list) are unit-tested; renderForm's DOM is verified on staging.

import { esc } from './dom.js';
export { esc };

// answer_json -> the field's PAYLOAD, the format renderForm({ initial }) and renderStored
// speak. Exported because editing a submission needs to feed an already-saved one BACK INTO
// the form, and the registry is what knows the payload's shape: reimplementing this in the
// modal would put the same rule in two places, forever needing to be fixed together.
export function parseAnswer(answer_json) {
  if (!answer_json) return null;
  if (typeof answer_json !== 'string') return answer_json;
  try { return JSON.parse(answer_json); } catch (_) { return null; }
}

function disabledForm(container) {
  container.innerHTML =
    '<div class="ct-tarefa-field-disabled">' +
    'Este tipo de campo ainda não está disponível na Phase 5. Use \'Texto livre\'.' +
    '</div>';
}

// --- text (payload: { text: string }) ---------------------------------------
const TEXT = {
  slug: 'text',
  label: 'Texto livre',
  disabled: false,
  renderForm(container, opts = {}) {
    const placeholder = opts.placeholder || 'Escreva sua resposta aqui...';
    const initial = (opts.initial && opts.initial.text) || '';
    container.innerHTML =
      '<textarea class="ct-tarefa-answer ct-tarefa-answer-text" rows="8" ' +
      'placeholder="' + esc(placeholder) + '">' + esc(initial) + '</textarea>';
  },
  readValue(container) {
    const ta = container.querySelector('.ct-tarefa-answer-text');
    const text = (ta && ta.value || '').trim();
    if (!text) return null;
    return { text };
  },
  validate(value) {
    if (!value || !value.text) return 'Escreva uma resposta antes de enviar.';
    return null;
  },
  renderStored(answer_json) {
    const v = parseAnswer(answer_json);
    return '<div class="ct-resp-text">' + esc((v && v.text) || '') + '</div>';
  },
  toCsvValue(answer_json) {
    const v = parseAnswer(answer_json);
    return (v && v.text) || '';
  },
};

// --- future types (declared, disabled until implemented) --------------------
function disabledType(slug, label) {
  return {
    slug, label, disabled: true,
    renderForm: disabledForm,
    readValue() { return null; },
    validate() { return 'Tipo ainda não disponível.'; },
    renderStored() { return '<div class="ct-resp-empty">tipo não suportado</div>'; },
    toCsvValue() { return ''; },
  };
}
const UPLOAD = disabledType('upload', 'Upload de arquivo');
const MC = disabledType('mc', 'Múltipla escolha');
const RATING = disabledType('rating', 'Nota / Rating');

const REGISTRY = { text: TEXT, upload: UPLOAD, mc: MC, rating: RATING };

export function getField(slug) {
  return REGISTRY[slug] || TEXT;
}

export function listFields() {
  return [TEXT, UPLOAD, MC, RATING];
}
