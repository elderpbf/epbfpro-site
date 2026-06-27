// js/ementa.js  (shared seam — Cohorts Cursos editor + Certificates issue flow)
// The course-program (ementa) model: a pure, DOM-free structure for the nested
// módulo → tópico → subtópico program. Shape:
//   { modules: [ { title, topics: [ { title, subtopics: [ "..." ] } ] } ] }
//
// Lifted into js/ because a second tab (Certificates) consumes it: the issue flow
// flattens a turma's ementa into the certificate's {n,t,d} module list.
//
// parseEmenta is the heuristic "estruturar texto colado" v1 (no LLM): it turns a
// semi-structured paste (indentation and/or "Módulo"/"Unidade" headings) into the
// nested shape. A run-on blob is the job of the AI assistant (deferred).

export function emptyEmenta() {
  return { modules: [] };
}

// Coerce arbitrary stored/parsed input (object OR json string) into the valid
// shape. Never throws; bad input becomes an empty ementa.
export function normalizeEmenta(input) {
  let obj = input;
  if (typeof input === 'string') {
    try { obj = JSON.parse(input); } catch (_) { return { modules: [] }; }
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.modules)) return { modules: [] };
  const modules = [];
  for (const m of obj.modules) {
    if (!m || typeof m !== 'object') continue;
    const topics = [];
    if (Array.isArray(m.topics)) {
      for (const tp of m.topics) {
        if (!tp || typeof tp !== 'object') continue;
        const subtopics = Array.isArray(tp.subtopics)
          ? tp.subtopics.filter((s) => s != null).map((s) =>
              typeof s === 'object' ? String(s.title || s.text || s.name || s.label || '') : String(s))
          : [];
        topics.push({ title: String(tp.title || ''), subtopics });
      }
    }
    modules.push({ title: String(m.title || ''), topics });
  }
  return { modules };
}

export function ementaStats(ementa) {
  const e = normalizeEmenta(ementa);
  let topics = 0;
  let subtopics = 0;
  for (const m of e.modules) {
    topics += m.topics.length;
    for (const tp of m.topics) subtopics += tp.subtopics.length;
  }
  return { modules: e.modules.length, topics, subtopics };
}

const _ROMAN = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
export function roman(n) {
  let out = '';
  let x = n;
  for (const [v, sym] of _ROMAN) { while (x >= v) { out += sym; x -= v; } }
  return out;
}

// Flatten a nested ementa into the certificate's flat module list ({n,t,d}): one
// cert module per ementa module, its description = the topic titles joined. This
// is what the certificate verso renders (cert-render reads meta.modules[{n,t,d}]).
export function ementaToCertModules(ementa) {
  const e = normalizeEmenta(ementa);
  return e.modules.map((m, i) => ({
    n: roman(i + 1),
    t: m.title,
    d: m.topics.map((tp) => tp.title).filter(Boolean).join(' · '),
  }));
}

const MODULE_RE = /^(m[óo]dulo|unidade)\b/i;
const MARKER_RE = /^(?:[-*•·]\s+|\d+[.)]\s+|[ivxlcdm]+[.)]\s+|[a-z][.)]\s+)/i;

function _indentWidth(line) {
  const lead = (line.match(/^[ \t]*/) || [''])[0];
  return lead.replace(/\t/g, '  ').length; // tab = 2 spaces
}

export function parseEmenta(text) {
  const lines = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const isModule = MODULE_RE.test(raw.trim());
    const clean = isModule ? raw.trim() : raw.trim().replace(MARKER_RE, '').trim();
    if (!clean) continue;
    lines.push({ indent: _indentWidth(raw), isModule, clean });
  }
  if (!lines.length) return { modules: [] };

  const hasKeywordModules = lines.some((l) => l.isModule);
  let levelOf;
  if (hasKeywordModules) {
    const indents = [...new Set(lines.filter((l) => !l.isModule).map((l) => l.indent))].sort((a, b) => a - b);
    levelOf = (l) => (l.isModule ? 0 : (indents.indexOf(l.indent) <= 0 ? 1 : 2));
  } else {
    const indents = [...new Set(lines.map((l) => l.indent))].sort((a, b) => a - b);
    levelOf = (l) => Math.min(indents.indexOf(l.indent), 2);
  }

  const modules = [];
  let curMod = null;
  let curTop = null;
  for (const l of lines) {
    const level = levelOf(l);
    if (level === 0) {
      curMod = { title: l.clean, topics: [] };
      modules.push(curMod);
      curTop = null;
    } else if (level === 1) {
      if (!curMod) { curMod = { title: '', topics: [] }; modules.push(curMod); }
      curTop = { title: l.clean, subtopics: [] };
      curMod.topics.push(curTop);
    } else {
      if (!curMod) { curMod = { title: '', topics: [] }; modules.push(curMod); }
      if (!curTop) { curTop = { title: '', subtopics: [] }; curMod.topics.push(curTop); }
      curTop.subtopics.push(l.clean);
    }
  }
  return { modules };
}

// ── AI assistant seam (Cursos) ────────────────────────────────────────────────
// The conversational assistant in the Cursos sub-tab talks to the shared Codex
// AI endpoint (codex-api `ai_chat`, via the `ai.chat` facade). These two helpers
// are pure: courses.js owns the network call + the chat UI, this owns the prompt
// and the response shape so both are unit-testable without a browser.

// Build the system prompt. The model is told the nested ementa shape, the current
// course + its program, and to answer with a single JSON object carrying a short
// PT-BR chat reply plus (only when it changed the program) the full new ementa.
export function buildEmentaAIPrompt({ courseTitle, ementa } = {}) {
  const current = normalizeEmenta(ementa);
  const outline = current.modules.length ? ementaToText(current) : '(vazia)';
  return [
    'You help build and refine the syllabus ("ementa") of a course taught on PensoIA.',
    'The ementa is a nested structure: modules → topics → subtopics. Its JSON shape is:',
    '{ "modules": [ { "title": "...", "topics": [ { "title": "...", "subtopics": [ "..." ] } ] } ] }',
    '',
    'Course title: ' + String(courseTitle || '(sem título)'),
    'Current ementa (indented outline, 2 spaces per level):',
    outline,
    '',
    'When the user asks you to create or change the program, return the FULL updated ementa',
    '(not a diff). When they only ask a question or you make no change, omit it (use null).',
    'Always answer with a SINGLE JSON object and nothing else:',
    '{ "reply": "<short reply, Brazilian Portuguese>", "ementa": <the full ementa object, or null> }',
    'Keep titles concise. Write all human-facing text (reply + ementa titles) in Brazilian Portuguese.',
  ].join('\n');
}

// Parse the model output into { reply, ementa }. Tolerates ```json fences, a bare
// ementa object, or prose around the JSON. Never throws; ementa is normalized or
// null. reply is '' when the model returned only an ementa.
export function parseEmentaAIResponse(text) {
  const raw = String(text == null ? '' : text);
  let obj = null;
  // Prefer the outermost {...} slice (handles fences/prose around it).
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { obj = JSON.parse(raw.slice(start, end + 1)); } catch (_) { obj = null; }
  }
  if (obj == null) {
    try { obj = JSON.parse(raw.trim()); } catch (_) { return { reply: '', ementa: null }; }
  }
  if (!obj || typeof obj !== 'object') return { reply: '', ementa: null };
  // A bare ementa object (has modules, no reply) is treated as the program itself.
  if (Array.isArray(obj.modules) && obj.reply === undefined) {
    return { reply: '', ementa: normalizeEmenta(obj) };
  }
  const reply = obj.reply != null ? String(obj.reply) : '';
  const ementa = (obj.ementa && typeof obj.ementa === 'object') ? normalizeEmenta(obj.ementa) : null;
  return { reply, ementa };
}

// Serialize back to an indented outline (2 spaces per level). Round-trips through
// parseEmenta.
export function ementaToText(ementa) {
  const e = normalizeEmenta(ementa);
  const out = [];
  for (const m of e.modules) {
    out.push(m.title);
    for (const tp of m.topics) {
      out.push('  ' + tp.title);
      for (const s of tp.subtopics) out.push('    ' + s);
    }
  }
  return out.join('\n');
}
