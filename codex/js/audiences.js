// js/audiences.js
// Pure PT-BR grammar resolver for audience-aware (variable) questions. A variable
// question stores {{placeholder}} tokens; each audience supplies, per variable, a
// value object { text, g, n } where g is gender ('m'|'f') and n is number
// ('sg'|'pl'). At launch time the host resolves the tokens to one audience's
// surface forms, so the student only ever sees concrete text.
//
// Token grammar:
//   {{key}}        -> value.text
//   {{key:form}}   -> determiner + ' ' + value.text   (form != obj)
//   {{key:obj}}    -> object pronoun only, no noun     (e.g. assina-{{x:obj}})
// Missing key, empty text, or an unknown form leaves the original token in place
// so the gap is visible. This module is PURE (no window, no IO) for testability;
// the config loader lives in the consumers.

// form -> by gender -> by number. Baked in, the PT-BR article/contraction set.
const DETERMINERS = {
  def:   { f: { sg: 'a',     pl: 'as'    }, m: { sg: 'o',     pl: 'os'    } },
  indef: { f: { sg: 'uma',   pl: 'umas'  }, m: { sg: 'um',    pl: 'uns'   } },
  de:    { f: { sg: 'da',    pl: 'das'   }, m: { sg: 'do',    pl: 'dos'   } },
  em:    { f: { sg: 'na',    pl: 'nas'   }, m: { sg: 'no',    pl: 'nos'   } },
  a:     { f: { sg: 'à',     pl: 'às'    }, m: { sg: 'ao',    pl: 'aos'   } },
  por:   { f: { sg: 'pela',  pl: 'pelas' }, m: { sg: 'pelo',  pl: 'pelos' } },
  com:   { f: { sg: 'com a', pl: 'com as'}, m: { sg: 'com o', pl: 'com os'} },
  // obj is the enclitic object pronoun, rendered alone (no noun, no space).
  obj:   { f: { sg: 'la',    pl: 'las'   }, m: { sg: 'lo',    pl: 'los'   } },
};

// Single source for the token shape. key = letters + underscore (e.g. actor_role),
// optional :form. A FRESH regex per scan call avoids stateful lastIndex bugs.
const TOKEN_SRC = '\\{\\{\\s*([a-z_]+)(?::([a-z]+))?\\s*\\}\\}';
function tokenRe() { return new RegExp(TOKEN_SRC, 'gi'); }

function isGender(g) { return g === 'm' || g === 'f'; }
function isNumber(n) { return n === 'sg' || n === 'pl'; }

// Slug a human label to an ascii audience/variable key: strip accents, lowercase,
// collapse non-alnum runs to underscores, trim edge underscores. Shared by the
// matrix manager (manual add) and parseAudienceDraft (AI add) so the two paths
// produce identical keys.
export function slug(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// Resolve one token. Returns the substitution, or null to signal "leave as is".
function resolveToken(key, form, values) {
  const val = values && values[key];
  if (!val || typeof val.text !== 'string' || val.text === '') return null;
  if (!form) return val.text;
  const table = DETERMINERS[form];
  if (!table) return null;                       // unknown form, leave untouched
  if (!isGender(val.g) || !isNumber(val.n)) return null;
  const det = table[val.g][val.n];
  if (form === 'obj') return det;                // pronoun only
  return det + ' ' + val.text;
}

// Replace every {{...}} token in `text` using one audience's `values` map.
export function resolve(text, values) {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(tokenRe(), (whole, key, form) => {
    const out = resolveToken(key, form, values);
    return out === null ? whole : out;
  });
}

// Resolve a whole question object (question text + options) for one audience.
// options may be an array, a JSON string of an array, or a non-array object
// (e.g. { min, max }), which is passed through unchanged.
export function resolveQuestion(q, values) {
  const text = (q && (q.question != null ? q.question : q.text)) || '';
  let opts = q && q.options;
  if (typeof opts === 'string') {
    try { opts = JSON.parse(opts); } catch (_) { opts = []; }
  }
  let options;
  if (Array.isArray(opts)) options = opts.map((o) => resolve(o, values));
  else if (opts && typeof opts === 'object') options = opts;
  else options = [];
  return { question: resolve(text, values), options };
}

// True iff the text carries at least one {{...}} token.
export function isVariable(text) {
  if (typeof text !== 'string') return false;
  return new RegExp(TOKEN_SRC, 'i').test(text);
}

// Unique variable keys referenced, in first-appearance order.
export function usedVars(text) {
  const out = [];
  if (typeof text !== 'string') return out;
  const re = tokenRe();
  let m;
  while ((m = re.exec(text))) {
    if (out.indexOf(m[1]) === -1) out.push(m[1]);
  }
  return out;
}

// Classify a bank question by its stored facets. A unique question carries an
// audience tag; a variable question has {{}} tokens; everything else is generic.
// These three are mutually exclusive by authoring rule (a unique question is not
// templated), so audience wins if both are somehow present.
export function questionType(q) {
  if (!q) return 'generic';
  if (q.audience) return 'unique';
  const text = (q.question != null ? q.question : q.text) || '';
  return isVariable(text) ? 'variable' : 'generic';
}

// Whether a question should appear in a session taught to `audienceKey`. Generic
// and variable questions show for everyone (variable morphs at launch); a unique
// question shows only for its own audience.
export function visibleForAudience(q, audienceKey) {
  if (questionType(q) !== 'unique') return true;
  return !!audienceKey && q.audience === audienceKey;
}

// Whether a question belongs in the live-host BANK PICKER list for the chosen
// audience. Stricter than visibleForAudience: with NO audience picked a variable
// question is hidden too, because there is nothing to morph its {{...}} tokens
// into yet (launching it raw would leak the template to students). So:
//   no audience -> generic only;
//   an audience -> generic + variable (it will morph at launch) + that audience's
//                  unique (other audiences' specifics stay hidden).
export function bankVisible(q, audienceKey) {
  const cls = questionType(q);
  if (!audienceKey) return cls === 'generic';
  if (cls === 'unique') return q.audience === audienceKey;
  return true;
}

// The type-filter chips that are usable for the chosen audience. Variáveis and
// Específicas only make sense once an audience is picked (see bankVisible), so
// without one only Todas + Genéricas are offered; the rest render greyed/disabled.
export function availableTypeFilters(audienceKey) {
  return audienceKey ? ['all', 'generic', 'variable', 'unique'] : ['all', 'generic'];
}

// The 2b hybrid: render the audience picker as segmented pills while the room is
// small, switch to a dropdown once it grows. `count` is the number of real
// audiences; the picker always carries one extra "Sem audiência" entry, so up to
// 3 real audiences (4 pills total) stay as pills and 4+ fall back to a dropdown.
export function audienceControlMode(count) {
  const n = Number.isFinite(count) && count > 0 ? count : 0;
  return n <= 3 ? 'pills' : 'dropdown';
}

// Parse a JSON object out of model text. Tries the whole string first, then
// falls back to the outermost {...} span so prose around the object (a common
// cheap-model quirk, e.g. "Claro, aqui está: {...}") does not defeat it. Returns
// the parsed value, or undefined when nothing parses.
function _parseObjectLoose(s) {
  try { return JSON.parse(s); } catch (_) { /* fall through to span extraction */ }
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a !== -1 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { /* ignore */ } }
  return undefined;
}

// Build a reviewable audience draft from one ai.chat reply. `raw` is the model's
// text (a JSON object, possibly fenced) or an already-parsed object; `variables`
// is the closed variable vocabulary. Returns { label, key, values } with exactly
// one { text, g, n } cell per existing variable — empty text where the model
// omitted a variable, so the grid's lint flags it before Salvar — gender coerced
// to m/f and number to sg/pl, key = slug(label). Variables the model invented
// outside the vocabulary are dropped. Returns null when there is no usable label
// or the text will not parse. PURE: never persists; the caller stages it for
// review (never auto-saved).
export function parseAudienceDraft(raw, variables) {
  let data = raw;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    data = _parseObjectLoose(cleaned);
    if (data === undefined) return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const label = typeof data.label === 'string' ? data.label.trim() : '';
  if (!label) return null;
  const key = slug(label);
  if (!key) return null;
  const src = (data.values && typeof data.values === 'object' && !Array.isArray(data.values)) ? data.values : {};
  const vars = Array.isArray(variables) ? variables : [];
  const values = {};
  for (const v of vars) {
    const cell = (src[v] && typeof src[v] === 'object') ? src[v] : {};
    const text = (typeof cell.text === 'string') ? cell.text.trim() : '';
    const g = isGender(cell.g) ? cell.g : 'f';
    const n = isNumber(cell.n) ? cell.n : 'sg';
    values[v] = { text, g, n };
  }
  return { label, key, values };
}

// Validate a full audience config. Returns one issue per (audience x variable)
// cell that is missing, empty, or has a bad gender/number. config shape:
//   { variables: string[], audiences: { [key]: { label, values: {[v]:{text,g,n}} } } }
export function lintConfig(config) {
  const issues = [];
  if (!config || !Array.isArray(config.variables) || !config.audiences) return issues;
  for (const audKey of Object.keys(config.audiences)) {
    const aud = config.audiences[audKey] || {};
    const values = aud.values || {};
    for (const v of config.variables) {
      const cell = values[v];
      if (!cell || typeof cell !== 'object') { issues.push({ audience: audKey, variable: v, problem: 'missing' }); continue; }
      if (typeof cell.text !== 'string' || cell.text === '') { issues.push({ audience: audKey, variable: v, problem: 'empty' }); continue; }
      if (!isGender(cell.g)) { issues.push({ audience: audKey, variable: v, problem: 'bad_gender' }); continue; }
      if (!isNumber(cell.n)) { issues.push({ audience: audKey, variable: v, problem: 'bad_number' }); }
    }
  }
  return issues;
}
