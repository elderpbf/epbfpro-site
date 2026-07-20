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
//   fitResponsesToBudget({ statement, responses, ... }) -> { statement, responses, truncatedCount }
//   makeWorkerEval(aiChat)                     -> async ({statement,responses}) => groups | {error}
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

// fitResponsesToBudget, pure, no I/O. Verified worker contract (codex-api's
// src/ai.js:363-373, read-only from here): `messages` max 50 entries, and
// totalChars = the sum of every message.content.length must be <= 20000; `system`
// is SEPARATE and capped at 10000, so it never counts toward that 20000. Our
// single user message is 'ENUNCIADO:\n'+statement+'\n\nRESPOSTAS:\n'+list, and a
// tarefa with many/long real answers can blow well past 20000 (the live error,
// 2026-07-19: "ai_chat: messages exceed 20000 char total limit"). This trims
// statement + each response's text so the built prompt fits inside `limit`,
// BEFORE the model ever sees it; the view keeps the full text always (only
// makeWorkerEval calls this, right before buildEvalPrompt).
// Never mutates the caller's rows: every kept response is a fresh {index,text}
// literal, same anonymity-by-construction guarantee as buildEvalInput.
// minPerResponse is a readability floor, not a hard cap: the <= limit guarantee
// holds as long as remaining/count >= minPerResponse (true for realistic class
// sizes and the pathological case this ships with, ~40 long responses). Past
// roughly a hundred long responses in one tarefa the floor can push the total
// back over `limit`; that is a real class-size ceiling this fitting does not
// solve, not a bug in the formula (which follows the dictated shape exactly).
export function fitResponsesToBudget({ statement, responses, limit = 19000, statementMax = 3000, minPerResponse = 200 }) {
  const stmt = statement || '';
  const cappedStatement = stmt.length > statementMax ? stmt.slice(0, statementMax) : stmt;
  const list = responses || [];
  const count = list.length;
  if (!count) {
    return { statement: cappedStatement, responses: [], truncatedCount: 0 };
  }
  // Mirrors buildEvalPrompt's exact scaffolding so the budget math matches the
  // real built string: 'ENUNCIADO:\n' + statement + '\n\nRESPOSTAS:\n' + list,
  // where list is every 'Resposta '+index+': '+text joined by '\n'.
  const headerLen = 'ENUNCIADO:\n'.length + cappedStatement.length + '\n\nRESPOSTAS:\n'.length;
  let scaffoldOverhead = count - 1; // the (count-1) '\n' joins between response entries
  list.forEach((r) => { scaffoldOverhead += ('Resposta ' + r.index + ': ').length; });
  const remaining = Math.max(0, limit - headerLen - scaffoldOverhead);
  const perResponseCap = Math.max(minPerResponse, Math.floor(remaining / count));
  let truncatedCount = 0;
  const fitted = list.map((r) => {
    const text = (r && r.text) || '';
    if (text.length > perResponseCap) {
      truncatedCount++;
      return { index: r.index, text: text.slice(0, Math.max(0, perResponseCap - 1)) + '…' };
    }
    return { index: r.index, text };
  });
  return { statement: cappedStatement, responses: fitted, truncatedCount };
}

// Strip optional ```json ... ``` fences, or extract the first {...} span from
// surrounding prose. Mirrors aiService.js's parseFillResponse.
function _stripFence(raw) {
  raw = (raw || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return raw;
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
  const raw = _stripFence(text);
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
export function makeWorkerEval(aiChat) {
  return async function evalResponses({ statement, responses }) {
    const fitted = fitResponsesToBudget({ statement, responses });
    if (fitted.truncatedCount > 0) {
      _logInfo('tarefa-eval: ' + fitted.truncatedCount + ' resposta(s) encurtada(s) para caber no limite da IA (20000 chars)');
    }
    const prompt = buildEvalPrompt({ statement: fitted.statement, responses: fitted.responses });
    let res;
    try {
      res = await aiChat({
        system: prompt.system,
        messages: prompt.messages,
        temperature: 0.3,
        // Headroom, not a target: the worker's own default is 2000, and the chat path
        // runs gemini-2.5-flash, which spends "thinking" tokens out of this SAME budget
        // and (unlike the non-chat path) does not force responseMimeType json. At 900
        // the reply was cut off mid-JSON on staging 2026-07-19. A cap only ever prevents
        // truncation; it does not make the model produce more.
        max_tokens: 4000,
      });
    } catch (e) {
      const msg = 'tarefa-eval: ai call failed: ' + ((e && e.message) || String(e));
      _logError(msg);
      return { error: msg };
    }
    if (!res) {
      return { error: 'rate_limited' };
    }
    const replyText = res.text != null ? res.text : res.reply;
    if (!replyText) {
      return { error: 'no reply from AI (empty)' };
    }
    return parseEvalResponse(replyText);
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
