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

// Slot coercion (normalizeSlots) + the per-item shape helper (itemTemplate) are
// shared with the pptx importer, so they live in core/slots.js. This module owns
// only the AI-prompt-specific pieces: building the prompt and parsing the reply.
import { normalizeSlots, itemTemplate } from '../core/slots.js';

// Derive the slot keys for a layout: prefer layout.slots (an explicit
// descriptor), fall back to Object.keys(layout.defaults()).
function slotKeys(layout) {
  if (layout.slots && typeof layout.slots === 'object') {
    return Object.keys(layout.slots);
  }
  const d = layout.defaults();
  return Object.keys(d);
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
