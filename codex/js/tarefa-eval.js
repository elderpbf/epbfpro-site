// js/tarefa-eval.js
// AI synthesis of tarefa (assignment) responses for the instructor. track-45
// Fatia 1: a dev-only preview, no worker/backend change.
// Mirrors content/slides/js/ai/aiService.js: pure prompt builder + parser, plus
// injectable worker/stub factories so tests never touch a real AI call.
//
// Anonymity by construction: buildEvalPrompt reads ONLY `index` and `text` off
// each response. A submission's student_name (or any other field) never enters
// the prompt, even if the caller's response objects happen to carry one: the
// builder simply never looks at it. This is a hard property, not a convention,
// see the anonymity-backstop test in tests/tarefa-eval.test.mjs.
//
// Exports:
//   buildEvalInput(rows)                       -> { responses, idByIndex } (real submissions -> anonymous payload)
//   buildEvalPrompt({ statement, responses })  -> { system, messages }
//   parseEvalResponse(replyText)               -> { groups, notes? } | { error }
//   measureEvalPayload({ statement, responses }) -> { chars, limit, fits }
//   hashText(s) / buildFingerprint({statement, rows}) -> change detection
//   groupsToIds / groupsFromIds                -> index space <-> submission-id space
//   makeEvalCache(storage)                     -> { read, write, clear } storage seam
//   makeWorkerEval(aiChat, opts)               -> async ({statement,responses}) => groups | {error}
//   makeStubEval()                             -> async (...) => canned groups
//   SEED_RESPONSES                             -> TEST FIXTURE ONLY, see the comment on it below

function _logError(msg) {
  if (typeof window !== 'undefined' && typeof window.bsLog === 'function') {
    window.bsLog(msg, 'error');
  }
}

function _logInfo(msg) {
  if (typeof window !== 'undefined' && typeof window.bsLog === 'function') {
    window.bsLog(msg, 'info');
  }
}

// buildEvalInput, pure, no I/O. Maps real submission rows ({id, text}, in whatever
// order the caller has them, e.g. real answers on screen) to the anonymous
// {index,text} payload the model gets, plus the index -> submission-id map the UI
// needs to click back to the real answer. Index is 1-based, in array order.
// Each response is built as a fresh {index,text} literal (never a spread of the
// row), so `id` and any other field the row happens to carry (student_name,
// grade, instructor_reply...) never reach `responses`: anonymity by construction,
// same guarantee buildEvalPrompt already gives one step later. Tolerates
// null/undefined/empty input and rows with a missing/empty text.
export function buildEvalInput(rows) {
  const responses = [];
  const idByIndex = {};
  (rows || []).forEach((row, i) => {
    const index = i + 1;
    responses.push({ index, text: (row && row.text) || '' });
    idByIndex[index] = row && row.id;
  });
  return { responses, idByIndex };
}

// buildEvalPrompt, pure, no I/O. Only `index`/`text` are read off each response,
// by construction: no student_name (or any other field) can reach the model.
export function buildEvalPrompt({ statement, responses }) {
  const list = (responses || [])
    .map((r) => 'Resposta ' + r.index + ': ' + (r.text || ''))
    .join('\n');
  const system =
    'Você é um assistente que ajuda um instrutor a avaliar rapidamente as respostas' +
    ' de uma turma a uma tarefa. Leia o ENUNCIADO e as RESPOSTAS numeradas dos alunos' +
    ' (você não recebe nomes, refira-se às respostas SOMENTE pelo número do índice) e' +
    ' classifique CADA índice em exatamente um dos três grupos:' +
    ' "adherent" (respostas bem aderentes ao que foi pedido),' +
    ' "point" (respostas que, mesmo fugindo um pouco do enunciado, levantam um ponto' +
    ' relevante que vale destacar para a turma),' +
    ' "diverged" (respostas que se afastam do enunciado sem agregar).' +
    ' Responda SOMENTE com JSON estrito no formato' +
    ' {"adherent":[índices],"point":[índices],"diverged":[índices],' +
    '"notes":{"<índice>":"<frase curta explicando o motivo, só para os índices de' +
    ' \'point\' ou \'diverged\'>"}}.' +
    ' Não inclua texto adicional, markdown, comentários ou explicações fora do JSON.' +
    ' Todo índice deve aparecer em exatamente um dos três grupos.';
  const messages = [
    { role: 'user', content: 'ENUNCIADO:\n' + (statement || '') + '\n\nRESPOSTAS:\n' + list },
  ];
  return { system, messages };
}

// Worker contract, verified in codex-api/src/ai.js (read-only from here): `messages`
// max 50 entries; the sum of every message.content.length must be <= `max_chars`,
// which now DEFAULTS to 20000 but is settable per call and clamped to a 200000
// ceiling; `system` is SEPARATE and capped at 10000, so it never counts here.
//
// We deliberately do NOT truncate. Élder's rule: "não podemos perder conteúdo".
// The old 20000 wall was our own validation constant, not a model limit, and the
// three buckets are a COMPARATIVE judgment, so cutting answers (or splitting the
// cohort into batches) degrades exactly the thing the feature exists to produce.
// The benchmark measured this: judging part of a cohort in isolation moved 100% of
// the earlier placements. So: send the whole cohort, in full, in ONE pass, with
// max_chars raised. If a cohort genuinely exceeds even the raised ceiling, say so
// and refuse rather than silently shipping a lossy synthesis.
export const AI_CHAT_MAX_CHARS = 200000;

// Model for this feature. Picked on measured evidence (bench 2026-07-20): matches
// the strongest reasoner tested (gpt-5-mini) bucket-for-bucket on the full pass, at
// 0% run-to-run noise, 6/6 availability, ~4x faster and ~1/15 the cost. The free
// gemini chain is NOT used here: it returned HTTP 503 unpredictably (6/6 fine in one
// sitting, 4/6 failures an hour later) and showed 75% run-to-run noise on an
// ambiguous cohort, which is disqualifying for a live, in-class click.
// Reversible: this is a per-call param, and OPENROUTER_MODEL overrides by env.
export const EVAL_PROVIDER = 'openrouter';
export const EVAL_MODEL = 'qwen/qwen3-30b-a3b-instruct-2507';

// measureEvalPayload, pure. Measures the REAL assembled payload instead of guessing
// a per-response cap up front (Élder: "pq não olhar qual o tamanho do texto que será
// enviado antes de setar o número de caracteres?"). Counts exactly what the worker
// counts: the summed length of message.content, system excluded.
export function measureEvalPayload({ statement, responses }) {
  const { messages } = buildEvalPrompt({ statement, responses });
  const chars = messages.reduce((sum, m) => sum + ((m && m.content) || '').length, 0);
  return { chars, limit: AI_CHAT_MAX_CHARS, fits: chars <= AI_CHAT_MAX_CHARS };
}

// hashText, pure. FNV-1a 32-bit, hex. Not cryptographic and does not need to be:
// it only has to change when the text changes, to invalidate a cached synthesis.
export function hashText(s) {
  const str = String(s == null ? '' : s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// buildFingerprint, pure. The "did anything change since last time?" key.
// Includes the ENUNCIADO hash, not just the answers: editing the statement
// invalidates the synthesis even when every answer is byte-identical, and missing
// that would show a stale result as if it were fresh.
// Sorted by (id, texthash) so merely reordering the answers on screen does not
// invalidate a still-valid cache, while an edit to any answer does.
export function buildFingerprint({ statement, rows }) {
  const parts = (rows || [])
    .map((r) => String((r && r.id) != null ? r.id : '?') + ':' + hashText((r && r.text) || ''))
    .sort();
  return 'v1|' + hashText(statement || '') + '|' + parts.length + '|' + hashText(parts.join(','));
}

const _GROUP_KEYS = ['adherent', 'point', 'diverged'];

// groupsToIds / groupsFromIds, pure. The model answers in INDEX space (1..N), but a
// cache keyed by index is silently wrong: one new answer shifts every index, and the
// stored result would then point at the wrong submissions. So anything persisted is
// keyed by SUBMISSION ID, and translated back to whatever index space is current at
// render time. An id that no longer has an index (answer deleted) is dropped; an
// index with no id behind it is dropped too.
export function groupsToIds({ groups, notes, idByIndex }) {
  const groupsById = { adherent: [], point: [], diverged: [] };
  const notesById = {};
  _GROUP_KEYS.forEach((k) => {
    ((groups && groups[k]) || []).forEach((idx) => {
      const id = idByIndex ? idByIndex[idx] : undefined;
      if (id == null) return;
      groupsById[k].push(id);
      const n = notes ? (notes[idx] != null ? notes[idx] : notes[String(idx)]) : null;
      if (n) notesById[id] = n;
    });
  });
  return { groupsById, notesById };
}

export function groupsFromIds({ groupsById, notesById, idByIndex }) {
  const indexById = {};
  Object.keys(idByIndex || {}).forEach((idx) => {
    const id = idByIndex[idx];
    if (id != null) indexById[String(id)] = Number(idx);
  });
  const groups = { adherent: [], point: [], diverged: [] };
  const notes = {};
  _GROUP_KEYS.forEach((k) => {
    ((groupsById && groupsById[k]) || []).forEach((id) => {
      const idx = indexById[String(id)];
      if (idx == null) return;
      groups[k].push(idx);
      const n = notesById ? notesById[id] : null;
      if (n) notes[idx] = n;
    });
  });
  return { groups, notes };
}

// makeEvalCache: the storage SEAM. Backed by localStorage today, which is per-device
// and per-browser on purpose: the stored shape is still settling, and freezing a D1
// table + a codex-api action around it before the design lands would buy debt early.
// Swapping to a server-side adapter later means replacing this factory only, because
// nothing above it knows where the bytes live. Never throws (private mode, quota).
export function makeEvalCache(storage, ns) {
  const prefix = (ns || 'cdx_teval') + ':';
  return {
    read(key) {
      try {
        const raw = storage.getItem(prefix + key);
        return raw ? JSON.parse(raw) : null;
      } catch (_) { return null; }
    },
    write(key, value) {
      try { storage.setItem(prefix + key, JSON.stringify(value)); return true; } catch (_) { return false; }
    },
    clear(key) {
      try { storage.removeItem(prefix + key); return true; } catch (_) { return false; }
    },
  };
}

// Strip optional ```json ... ``` fences, or extract the first {...} span from
// surrounding prose. Mirrors aiService.js's parseFillResponse.
// Brace-matched extraction, string-aware (so a '}' inside a note's text does not
// end the object early). Replaces a greedy /\{[\s\S]*\}/, which silently returned a
// span ending at the LAST '}' anywhere in the reply, i.e. at the closing brace of
// the nested "notes" object whenever the root brace was missing.
//
// Measured on staging 2026-07-20: qwen3-30b-a3b intermittently omits the FINAL root
// '}' (1 failure in 6 live calls, reply length ~492, nowhere near the token budget,
// so this is not truncation). Every field is present and well-formed; only the
// closing punctuation is absent. Closing it is a faithful repair of a complete
// payload, not a guess at missing content, so `repaired` is reported for
// diagnosability rather than hidden.
function _extractJsonObject(raw) {
  const start = raw.indexOf('{');
  if (start < 0) return { text: raw, repaired: false };
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { if (inStr) esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { text: raw.slice(start, i + 1), repaired: false };
    }
  }
  // Ran out mid-object. Two shapes seen live: the root '}' simply absent, and a
  // reply cut inside a note's string (which leaves inStr true, so the braces alone
  // would not save it). Close the open string first, then the open braces. The
  // groups are emitted BEFORE notes, so this recovers the whole classification and
  // at worst loses the tail of one explanatory note. If the cut landed somewhere
  // this cannot rescue (mid-array, mid-key), JSON.parse still fails and the caller
  // gets the error: the repair never invents a classification.
  if (inStr || depth > 0) {
    return { text: raw.slice(start) + (inStr ? '"' : '') + '}'.repeat(Math.max(0, depth)), repaired: true };
  }
  return { text: raw.slice(start), repaired: false };
}

function _stripFence(raw) {
  raw = (raw || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return _extractJsonObject(fenced[1].trim());
  return _extractJsonObject(raw);
}

function _toIndexArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map(Number).filter((n) => Number.isFinite(n));
}

// parseEvalResponse, pure, no I/O. Tolerates ```json ... ``` fences and
// surrounding prose. Returns { groups: {adherent,point,diverged}, notes? } on
// success, or { error } on parse failure / invalid shape, never throws.
export function parseEvalResponse(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { error: 'empty reply' };
  }
  const extracted = _stripFence(text);
  const raw = extracted.text;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    // Report the length, and say so when the body does not even close, because the
    // real-world failure here is a TRUNCATED reply (the model ran out of output
    // budget mid-JSON), which is invisible if the pill only shows the first 120 chars.
    const hint = raw.trim().endsWith('}') ? '' : ', reply appears cut off';
    return { error: 'json parse failed (' + raw.length + ' chars' + hint + '): ' + raw.slice(0, 120) };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'invalid shape (expected a JSON object)' };
  }
  const groups = {
    adherent: _toIndexArray(parsed.adherent),
    point: _toIndexArray(parsed.point),
    diverged: _toIndexArray(parsed.diverged),
  };
  const out = { groups };
  if (extracted.repaired) out.repaired = true;
  if (parsed.notes && typeof parsed.notes === 'object' && !Array.isArray(parsed.notes)) {
    out.notes = parsed.notes;
  }
  return out;
}

// makeWorkerEval, production factory. aiChat is injected (e.g. ai.chat from
// codex-api.js) so tests pass a fake. Resolves to `groups | {error}`, never
// throws: a rate-limited call (aiChat resolves to null, per the codex-api.js
// facade contract) becomes {error:'rate_limited'}, and a genuine exception is
// caught, logged to the debug pill, and turned into {error}.
// fitResponsesToBudget runs HERE, right before buildEvalPrompt, so only what the
// MODEL sees is shortened; the view (content/tarefa-eval-view.js) is handed the
// caller's original, full-length statement/responses and never sees the fitted
// copy, so the instructor still reads every answer in full on screen.
// reconcileGroups, pure. The model is told every index must appear exactly once, but
// nothing enforces it. Without this, an index the model simply forgot vanishes from
// the screen with no trace, and the instructor reads "8 answers" as the whole class
// when it was 10. Reports what is missing (and any index invented out of thin air)
// so the UI can say so out loud instead of quietly under-reporting.
export function reconcileGroups({ groups, responses }) {
  const expected = (responses || []).map((r) => Number(r.index));
  const expectedSet = new Set(expected);
  const seen = new Set();
  const clean = { adherent: [], point: [], diverged: [] };
  _GROUP_KEYS.forEach((k) => {
    ((groups && groups[k]) || []).forEach((idx) => {
      const n = Number(idx);
      if (!expectedSet.has(n) || seen.has(n)) return; // invented or duplicated
      seen.add(n);
      clean[k].push(n);
    });
  });
  const missing = expected.filter((i) => !seen.has(i));
  return { groups: clean, missing, total: expected.length, classified: seen.size };
}

// Fail clean, Élder's rule (2026-07-20): "aqui é melhor falhar limpo, inclusive
// avisando se acabaram os créditos". There is no silent degrade to the unpinned
// default chain any more: the benchmark measured that chain's free-tier leg as
// unreliable (75% run-to-run noise, unpredictable HTTP 503), so quietly falling
// back to it would trade a measured, chosen model for an unmeasured one without
// telling the instructor. If the pinned qwen call fails, this errors out, and an
// insufficient-credits failure (OpenRouter HTTP 402) is reported as its own code
// so the instructor sees "sem créditos" instead of a generic failure message.
export function makeWorkerEval(aiChat, opts) {
  const provider = (opts && opts.provider !== undefined) ? opts.provider : EVAL_PROVIDER;
  const model = (opts && opts.model) || EVAL_MODEL;

  function _params(prompt) {
    const params = {
      system: prompt.system,
      messages: prompt.messages,
      temperature: 0.3,
      // Headroom, not a target. A cap only ever prevents truncation; it does not make
      // the model produce more. At 900 the reply was cut off mid-JSON (staging
      // 2026-07-19), and a reasoning model spends "thinking" out of this same budget.
      max_tokens: 4000,
      max_chars: AI_CHAT_MAX_CHARS,
    };
    if (provider) {
      params.provider = provider;
      if (provider === 'openrouter' && model) params.openrouter_model = model;
    }
    return params;
  }

  return async function evalResponses({ statement, responses }) {
    // Measure the real payload FIRST, instead of pre-emptively capping each answer.
    // Nothing is trimmed: either the whole cohort goes, or we refuse and say why.
    const measured = measureEvalPayload({ statement, responses });
    if (!measured.fits) {
      _logError('tarefa-eval: payload ' + measured.chars + ' chars excede o teto ' + measured.limit);
      return { error: 'payload_too_large', chars: measured.chars, limit: measured.limit };
    }

    const prompt = buildEvalPrompt({ statement, responses });
    let res = null;
    try {
      res = await aiChat(_params(prompt));
    } catch (e) {
      // A structured worker error (e.data) carries codex-api's aiChat categorization.
      // insufficient_credits gets its own code so it never reads as "try again later"
      // when the real fix is topping up the account. rate_limited is normally never
      // seen here: the codex-api.js facade already converts it to a resolved `null`
      // (handled by `if (!res)` below); this branch only guards a caller that injects
      // aiChat directly (tests do) instead of going through the real facade.
      const data = e && e.data;
      if (data && data.insufficient_credits) return { error: 'credits_exhausted' };
      if (data && data.rate_limited) return { error: 'rate_limited' };
      const msg = (data && data.error) || (e && e.message) || String(e);
      _logError('tarefa-eval: ai call failed: ' + msg);
      return { error: msg };
    }
    if (!res) return { error: 'rate_limited' };

    const replyText = res.text != null ? res.text : res.reply;
    if (!replyText) return { error: 'no reply from AI (empty)' };

    let parsed = parseEvalResponse(replyText);
    if (parsed.error) {
      // Measured on staging 2026-07-20: even after the brace/string repair, roughly 1
      // call in 25 comes back as JSON the parser cannot rescue. This is a click made
      // live, in front of a class, so one clean retry is worth ~US$0.0002. Exactly
      // one: a loop would turn a systematic prompt problem into a stall.
      _logInfo('tarefa-eval: resposta ilegível, tentando de novo uma vez');
      let retry = null;
      try { retry = await aiChat(_params(prompt)); } catch (_) { retry = null; }
      const retryText = retry && (retry.text != null ? retry.text : retry.reply);
      if (retryText) {
        const reparsed = parseEvalResponse(retryText);
        if (!reparsed.error) { parsed = reparsed; res = retry; }
      }
      if (parsed.error) return parsed;
    }

    const rec = reconcileGroups({ groups: parsed.groups, responses });
    if (rec.missing.length) {
      _logInfo('tarefa-eval: ' + rec.missing.length + ' resposta(s) não classificada(s) pelo modelo: ' + rec.missing.join(', '));
    }
    return {
      groups: rec.groups,
      notes: parsed.notes,
      missing: rec.missing,
      total: rec.total,
      provider: res.provider || null,
    };
  };
}

// makeStubEval, offline/test factory. Returns canned valid groups so the view
// can be exercised without a real AI call.
export function makeStubEval() {
  return async function stubEvalResponses() {
    return {
      groups: { adherent: [1, 2, 3], point: [4], diverged: [5] },
      notes: { 4: 'Levanta um ponto tangencial, mas relevante.' },
    };
  };
}

// SEED_RESPONSES: a TEST FIXTURE, for codex/tests/tarefa-eval.test.mjs ONLY.
// It must NEVER be wired into a UI path (content/tarefas.js does not import it;
// content/tarefa-eval-view.js renders no run button at all when there are zero
// real answers). Élder's rule (verbatim intent, track-45 fix): "Essa opção de
// teste só pode existir enquanto a gente estiver aqui. Em produção não pode
// existir. Ele só vai dizer que não houve respostas e não vai fazer." If you are
// tempted to re-add a seed/demo fallback to the real flow, don't: with zero
// answers the product must say so and never call the AI. A realistic classroom
// tarefa follows, kept only so the pure builder/parser tests have varied,
// deterministic PT-BR input: an allegedly-abusive
// contract clause to analyze under the CDC. Deliberately varied: several
// strongly adherent answers, one that drifts from the prompt but raises a
// point worth discussing in class, and two that diverge without adding much.
export const SEED_RESPONSES = {
  statement:
    'Leia a cláusula abaixo, extraída de um contrato de adesão de prestação de' +
    ' serviços, e responda: essa cláusula é abusiva à luz do Código de Defesa do' +
    ' Consumidor? Justifique citando o dispositivo legal aplicável.\n\n' +
    '"O CONTRATANTE renuncia, de forma irrevogável, a qualquer direito de reclamar' +
    ' por vícios do serviço prestado, ficando a critério exclusivo da CONTRATADA' +
    ' decidir se e quando eventual reparo será realizado."',
  responses: [
    {
      index: 1,
      text:
        'A cláusula é abusiva porque renuncia previamente a um direito básico do' +
        ' consumidor (art. 51, I, do CDC), que veda cláusulas que exonerem ou' +
        ' atenuem a responsabilidade do fornecedor. Também fere o art. 6º, VI' +
        ' (reparação de danos). Deveria ser declarada nula de pleno direito.',
    },
    {
      index: 2,
      text:
        'Sim, é abusiva. O art. 51 do CDC considera nulas as cláusulas que' +
        ' impossibilitem, exonerem ou atenuem a responsabilidade do fornecedor por' +
        ' vícios do produto ou serviço. Aqui há renúncia antecipada do consumidor,' +
        ' o que é expressamente vedado.',
    },
    {
      index: 3,
      text:
        'Abusiva. Fere o art. 51, I, e o princípio da vulnerabilidade do' +
        ' consumidor (art. 4º, I, do CDC). A decisão sobre se e quando reparar o' +
        ' vício não pode ficar a critério exclusivo do fornecedor.',
    },
    {
      index: 4,
      text:
        'Além de abusiva pelo art. 51, vale notar que essa cláusula também poderia' +
        ' configurar prática abusiva do art. 39. E se o serviço for prestado por' +
        ' meio de uma plataforma digital, entra em jogo também o Marco Civil da' +
        ' Internet quanto à responsabilidade do intermediário, acho que vale o' +
        ' professor comentar essa interseção em aula.',
    },
    {
      index: 5,
      text:
        'A cláusula viola o art. 51, IV e I, do CDC (nulidade de cláusulas' +
        ' abusivas) e deveria ser substituída por uma que garanta ao consumidor' +
        ' prazo razoável de reparo.',
    },
    {
      index: 6,
      text: 'Abusiva, art. 51 do CDC.',
    },
    {
      index: 7,
      text:
        'Acho que depende do contrato, tem que ver o valor pago. Se o serviço foi' +
        ' mais barato, faz sentido ter menos garantia sobre ele.',
    },
    {
      index: 8,
      text:
        'Não sei, acho que isso é mais uma questão de ética do que de direito.' +
        ' Vou pesquisar melhor sobre isso outro dia.',
    },
  ],
};
