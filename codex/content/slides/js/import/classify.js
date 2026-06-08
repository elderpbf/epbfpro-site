// import/classify.js, map a parsed source slide (from pptx.js) to ONE of our
// layouts. Hybrid: cheap deterministic heuristics first; an AI fallback (the live
// ai.chat, injected) only for the slides the heuristics are unsure about. The AI
// path mirrors the question-creator idiom (ct-ai-spec): a strict-JSON system
// prompt + a defensive parse, with the answer validated against the real layout
// ids so a bad reply can never produce an unknown layout.
//
// Exports:
//   classifyHeuristic(src)                 -> { layoutId, confidence, reason }
//   buildClassifyPrompt(src, layoutIds)    -> { system, messages }
//   parseClassifyResponse(text, layoutIds) -> { layoutId } | { error }
//   classifySlide(src, { ai, layoutIds, threshold }) -> Promise<{layoutId, source, confidence}>
//   classifyAll(slides, opts)              -> Promise<Array<{src, layoutId, source}>>

export const DEFAULT_LAYOUT_IDS = ['cover', 'split', 'topics', 'bleed', 'cards'];

// Short PT descriptions shown to the model. Unknown ids fall back to the bare id,
// so a newly-registered layout is still offered (never silently dropped).
const LAYOUT_DESC = {
  cover: 'capa/seção: só título (e talvez subtítulo)',
  split: 'imagem de um lado + tópicos do outro',
  topics: 'lista de tópicos/bullets',
  bleed: 'imagem cheia ocupando o slide, com uma legenda',
  cards: 'vários blocos paralelos de texto',
};

const DEFAULT_THRESHOLD = 0.6; // confidence below this routes to the AI fallback

function verdict(layoutId, confidence, reason) {
  return { layoutId, confidence, reason };
}

// classifyHeuristic, pure, deterministic. Reads only the rough structure the
// parser exposes (title, body paragraphs, distinct text shapes, picture count).
export function classifyHeuristic(src) {
  const title = (src.title || '').trim();
  const nPara = (src.paragraphs || []).length;
  const nShapes = (src.shapes || []).length;
  const img = (src.imageCount || 0) > 0;

  if (img && nPara === 0) return verdict('bleed', 0.7, 'image, no body text');
  if (img && nPara > 0) return verdict('split', 0.8, 'image + body text');
  if (title && nPara === 0) return verdict('cover', 0.85, 'title only');
  if (nShapes >= 2) return verdict('cards', 0.65, nShapes + ' parallel blocks');
  if (nPara >= 2) return verdict('topics', 0.8, nPara + ' bullets');
  if (nPara === 1) return verdict(title ? 'cover' : 'topics', 0.5, 'single line, ambiguous');
  return verdict('cover', 0.3, 'empty / unrecognized');
}

// A compact textual summary of the slide for the model to classify.
function describeSlide(src) {
  const paras = (src.paragraphs || []).slice(0, 12);
  return (
    'Título: ' + (src.title ? '"' + src.title + '"' : '(nenhum)') + '. ' +
    'Imagens: ' + (src.imageCount || 0) + '. ' +
    'Blocos de texto distintos: ' + (src.shapes || []).length + '. ' +
    'Parágrafos: ' + JSON.stringify(paras) + '.'
  );
}

export function buildClassifyPrompt(src, layoutIds) {
  const ids = layoutIds && layoutIds.length ? layoutIds : DEFAULT_LAYOUT_IDS;
  const options = ids.map((id) => '- ' + id + ': ' + (LAYOUT_DESC[id] || id)).join('\n');
  const system =
    'Você classifica UM slide de apresentação no layout mais adequado.\n' +
    'Layouts disponíveis (id: descrição):\n' + options + '\n\n' +
    'Responda SOMENTE com JSON estrito {"layout":"<id>"}, onde <id> é exatamente ' +
    'um destes: ' + ids.join(', ') + '. Sem texto adicional, sem markdown, sem comentários.';
  return { system, messages: [{ role: 'user', content: describeSlide(src) }] };
}

// Defensive JSON extraction (same shape as ct-ai-spec.parseModelJson): strip code
// fences, take the first {...}, parse.
function looseJson(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  try { return JSON.parse(s.slice(first, last + 1)); } catch (_) { return null; }
}

export function parseClassifyResponse(text, layoutIds) {
  const ids = new Set(layoutIds && layoutIds.length ? layoutIds : DEFAULT_LAYOUT_IDS);
  const parsed = looseJson(text);
  if (!parsed) return { error: 'unparseable classify reply' };
  const id = parsed.layout || parsed.layoutId || parsed.id;
  if (!id || !ids.has(id)) return { error: 'invalid layout id: ' + id };
  return { layoutId: id };
}

// classifySlide, heuristic first; AI fallback ONLY when unsure and an ai fn is
// available. The AI answer is validated; any failure falls back to the heuristic,
// so this always returns a valid layout id.
export async function classifySlide(src, opts = {}) {
  const { ai, layoutIds, threshold = DEFAULT_THRESHOLD } = opts;
  const h = classifyHeuristic(src);
  if (h.confidence >= threshold || typeof ai !== 'function') {
    return { layoutId: h.layoutId, source: 'heuristic', confidence: h.confidence };
  }
  try {
    const prompt = buildClassifyPrompt(src, layoutIds);
    const res = await ai({ system: prompt.system, messages: prompt.messages });
    const text = res && (res.text != null ? res.text : res.reply);
    const parsed = parseClassifyResponse(text, layoutIds);
    if (parsed.layoutId) {
      return { layoutId: parsed.layoutId, source: 'ai', confidence: h.confidence };
    }
  } catch (_) { /* fall through to heuristic */ }
  return { layoutId: h.layoutId, source: 'heuristic', confidence: h.confidence };
}

// classifyAll, classify every slide, pairing each verdict with its source slide.
export async function classifyAll(slides, opts = {}) {
  const out = [];
  for (const src of slides || []) {
    const v = await classifySlide(src, opts);
    out.push({ src, layoutId: v.layoutId, source: v.source, confidence: v.confidence });
  }
  return out;
}
