// ai/aiService.js — AI-fill service for the Slides editor.
// All AI-fill goes through this interface only (never calling ai.chat directly
// from UI code). Tests inject a fake via makeWorkerAi(fakeChat); production
// passes the real ai.chat from codex-api.js.
//
// Exports:
//   buildFillPrompt(layout, intent, lang)   -> { system, messages }
//   parseFillResponse(replyText, layout)    -> { slots } | { error }
//   makeWorkerAi(aiChat)                    -> { fill(layout, intent, lang) }
//   makeStubAi()                            -> same shape, canned valid slots

import { uid } from '../core/schema.js';

// Derive the slot keys for a layout: prefer layout.slots (an explicit
// descriptor), fall back to Object.keys(layout.defaults()).
function slotKeys(layout) {
  if (layout.slots && typeof layout.slots === 'object') {
    return Object.keys(layout.slots);
  }
  const d = layout.defaults();
  return Object.keys(d);
}

// Fields the model never sets: identity, build-order, and the structural card
// `mode` (AI fills text cards; image/title cards are set by hand). These keep
// their template defaults so the renderer always gets a shape it can draw.
const FIXED_ITEM_KEYS = new Set(['id', 'step', 'mode']);

// The per-item content shape for a list slot, derived from its default first
// item (e.g. topics -> {text}, cards -> {text}). Drops the fixed keys above.
function itemTemplate(defItem) {
  const src = defItem && typeof defItem === 'object' ? defItem : { text: '' };
  const tpl = {};
  for (const k of Object.keys(src)) if (!FIXED_ITEM_KEYS.has(k)) tpl[k] = src[k];
  if (!Object.keys(tpl).length) tpl.text = '';
  return tpl;
}

// slotShapeGuide — turn layout.defaults() into a concrete JSON template + a
// per-slot guide string, GENERICALLY (driven by value types, never a layout id).
// The model fills ONLY string slots and list slots; boolean/number control flags
// (flip, ratio, reveal, stacked) and image/object slots are excluded — those are
// not content and the model can't synthesise them. This is what teaches the model
// to return cards/topics as the right STRUCTURE, not just the right key names.
function slotShapeGuide(layout) {
  const d = layout.defaults();
  const template = {};
  const lines = [];
  for (const [key, val] of Object.entries(d)) {
    if (Array.isArray(val)) {
      const tItem = itemTemplate(val[0]);
      template[key] = [tItem];
      lines.push(
        '"' + key + '" é uma LISTA: retorne quantos itens o conteúdo pedir, ' +
        'cada item no formato ' + JSON.stringify(tItem) + '.'
      );
    } else if (typeof val === 'string') {
      template[key] = val;
      lines.push('"' + key + '" é um texto.');
    }
    // boolean / number / object (image) slots are intentionally omitted.
  }
  return { template, guide: lines.join(' ') };
}

// buildFillPrompt — pure, no I/O.
// Returns { system, messages } ready to pass to ai.chat.
export function buildFillPrompt(layout, intent, lang) {
  lang = lang || 'pt-BR';
  const { template, guide } = slotShapeGuide(layout);
  const system =
    'Você é um assistente para preencher slides de apresentação.' +
    ' Layout id: "' + layout.id + '".' +
    ' Preencha o conteúdo seguindo EXATAMENTE este formato de slots' +
    ' (mesmas chaves, mesma estrutura): ' + JSON.stringify(template) + '.' +
    ' ' + guide +
    ' Não inclua o campo "id" — ele é gerado automaticamente.' +
    ' Responda SOMENTE com JSON estrito no formato {"slots": {...}}.' +
    ' Não inclua texto adicional, markdown, comentários ou explicações.' +
    ' Preencha todos os textos e listas com conteúdo real, sem placeholders.' +
    ' Idioma da resposta: ' + lang + '.';
  const messages = [{ role: 'user', content: intent }];
  return { system, messages };
}

// parseFillResponse — pure, no I/O.
// Tolerates ```json ... ``` fences and surrounding prose.
// Returns { slots } on success or { error } on parse failure / invalid keys.
export function parseFillResponse(replyText, layout) {
  if (typeof replyText !== 'string' || !replyText.trim()) {
    return { error: 'empty reply' };
  }
  const valid = new Set(slotKeys(layout));
  let raw = replyText.trim();

  // Strip optional ```json ... ``` fences.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    raw = fenced[1].trim();
  } else {
    // Extract the first {...} JSON object from prose.
    const objMatch = raw.match(/\{[\s\S]*\}/);
    if (objMatch) raw = objMatch[0];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return { error: 'json parse failed: ' + raw.slice(0, 120) };
  }

  if (!parsed || typeof parsed.slots !== 'object' || Array.isArray(parsed.slots)) {
    return { error: 'missing slots object' };
  }

  const returnedKeys = Object.keys(parsed.slots);
  const unknown = returnedKeys.filter((k) => !valid.has(k));
  if (unknown.length > 0) {
    return { error: 'unknown slot keys: ' + unknown.join(', ') };
  }

  return { slots: normalizeSlots(parsed.slots, layout) };
}

// normalizeSlots — coerce the model's slots into the exact shape the renderer
// needs, driven by layout.defaults() (never by a layout id). This is the half of
// the fix that makes cards/topics actually FILL: the model supplies the content,
// we fix the structure.
//   - LIST slots  -> array of well-formed items, each with a fresh id (mirrors
//                    the schema.js migrate idiom); a stray string becomes {text}.
//   - STRING slots -> passed through (coerced to string defensively).
//   - everything else (boolean/number control flags, image/object slots) is
//     dropped, so the AI can never clobber geometry or a hand-placed image.
function normalizeSlots(slots, layout) {
  const d = layout.defaults();
  const out = {};
  for (const [key, val] of Object.entries(slots)) {
    const def = d[key];
    if (Array.isArray(def)) {
      out[key] = normalizeList(val, def[0]);
    } else if (typeof def === 'string') {
      out[key] = typeof val === 'string' ? val : String(val == null ? '' : val);
    }
    // boolean/number/object defaults: not AI-filled — skip.
  }
  return out;
}

function normalizeList(val, defItem) {
  const arr = Array.isArray(val) ? val : val == null ? [] : [val];
  return arr.map((raw) => normalizeItem(raw, defItem)).filter(Boolean);
}

// Build one list item from the model's raw value. Start from the DEFAULT item
// (minus identity/sequence) so structural fields like the card `mode` keep a
// renderable value, then let the model set only the text-like content fields
// (everything except id/step/mode). A fresh id is always assigned on our side.
function normalizeItem(raw, defItem) {
  const src = defItem && typeof defItem === 'object' ? defItem : { text: '' };
  const item = {};
  for (const k of Object.keys(src)) {
    if (k === 'id' || k === 'step') continue;
    item[k] = src[k]; // keeps mode + content defaults
  }
  let contentKeys = Object.keys(src).filter((k) => !FIXED_ITEM_KEYS.has(k));
  if (!contentKeys.length) { item.text = ''; contentKeys = ['text']; }
  const textKey = contentKeys.find((k) => typeof src[k] === 'string') || contentKeys[0];

  if (typeof raw === 'string') {
    if (!raw.trim()) return null;
    item[textKey] = raw;
  } else if (raw && typeof raw === 'object') {
    for (const k of contentKeys) {
      if (k in raw && typeof raw[k] === typeof src[k]) item[k] = raw[k];
    }
    // Robustness: if the text field is still the default but raw carries some
    // other string, use it (covers the model naming the field differently).
    if (item[textKey] === src[textKey]) {
      const anyStr = Object.values(raw).find((v) => typeof v === 'string' && v.trim());
      if (anyStr) item[textKey] = anyStr;
    }
  } else {
    return null;
  }
  item.id = uid();
  return item;
}

// makeWorkerAi — production factory.
// aiChat is injected (e.g. ai.chat from codex-api.js) so tests pass a fake.
// fill() -> Promise<{ slots } | { error }>
export function makeWorkerAi(aiChat) {
  return {
    async fill(layout, intent, lang) {
      lang = lang || 'pt-BR';
      const prompt = buildFillPrompt(layout, intent, lang);
      let res;
      try {
        res = await aiChat({ system: prompt.system, messages: prompt.messages });
      } catch (e) {
        return { error: 'ai call failed: ' + ((e && e.message) || String(e)) };
      }
      if (!res) {
        return { error: 'no reply from AI (rate-limited or empty)' };
      }
      // The live ai_chat response carries the model text in `text` (see
      // content/item-creator.js); `reply` kept only as a defensive fallback.
      const replyText = res.text != null ? res.text : res.reply;
      if (!replyText) {
        return { error: 'no reply from AI (rate-limited or empty)' };
      }
      return parseFillResponse(replyText, layout);
    }
  };
}

// makeStubAi — offline/test factory.
// Returns canned valid slots derived from layout.defaults() so the UI can be
// exercised without a real AI call.
export function makeStubAi() {
  return {
    async fill(layout) {
      const defaults = layout.defaults();
      return { slots: defaults };
    }
  };
}
