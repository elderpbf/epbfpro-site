// cohorts/ementa.js
// The course-program (ementa) model: a pure, DOM-free structure shared by the
// Cursos editor (cohorts/courses.js), the turma's copy, and the certificate
// snapshot. Shape:
//   { modules: [ { title, topics: [ { title, subtopics: [ "..." ] } ] } ] }
//
// parseEmenta is the heuristic "estruturar texto colado" v1 (no LLM): it turns a
// semi-structured paste (indentation and/or "Módulo"/"Unidade" headings) into the
// nested shape. A truly run-on blob is the job of the AI assistant (deferred); a
// careful outline paste structures cleanly here.

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
          ? tp.subtopics.filter((s) => s != null).map((s) => String(s))
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

const MODULE_RE = /^(m[óo]dulo|unidade)\b/i;
// Leading list markers stripped from a non-module line's title (the marker does
// not set depth — indentation does).
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
    // Modules are keyword-defined; non-module lines are leveled by their own
    // indentation buckets (smallest = topic, deeper = subtopic).
    const indents = [...new Set(lines.filter((l) => !l.isModule).map((l) => l.indent))].sort((a, b) => a - b);
    levelOf = (l) => (l.isModule ? 0 : (indents.indexOf(l.indent) <= 0 ? 1 : 2));
  } else {
    // Pure indentation: distinct indents map to 0/1/2 (deeper merges into subtopic).
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

// Serialize back to an indented outline (2 spaces per level). Round-trips through
// parseEmenta, so the editor can offer a plain-text view of the structure.
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
