// Shared scanner for the dead-key guards (the reverse of the parity checks: a key
// that EXISTS in a dictionary but nothing references). Used by i18n-parity.test.mjs
// (Codex admin dictionary) and trilha-i18n.test.mjs (the public Trail dictionary),
// so the scan rule lives in one place instead of drifting between the two.
//
// Why substring matching and not a t('...') regex: keys are reached three ways in
// this codebase, a literal t('a.b'), a const assigned then passed (page.js:622), and
// a concatenated prefix t('alunos.' + act). Only a raw "does this string appear
// anywhere" test survives all three without hand-parsing JS. It errs toward calling
// a key ALIVE, which is the safe direction for a guard: a false "dead" verdict would
// delete a live string.
import fs from 'node:fs';
import path from 'node:path';

// Prefixes assembled at runtime from a bounded set, so the full key never appears as
// a literal. Each one was read off the call site; extend this list when a new
// concatenated t() lands, and say where it lives.
//   alunos.                 roster-actions.js:40, toolbarActions() -> approve|validate|block|unblock|remove
//   apostila.status_        apostila.js, per-section new|edited|unchanged
//   certificates.status_    certificates.js, issued|signed|sent|revoked
//   certificates.theme_     certificates.js:519,1327, CERT_THEMES
//   certificates.tpl_desc_  certificates.js, one per template slug
//   cohorts.date_ fmt_ mod_ section_   cohorts.js, bounded enums
//   lessons.section_        lessons.js, SECTION_ORDER
//   presets.group_          presets.js, item-type groups
//   questions.comp_class_   question-composer.js, generica|variavel|unica
//   questions.type_         questions, per question type
//   roteiro.tipo_           roteiro, per point type
export const CODEX_DYNAMIC_PREFIXES = [
  'alunos.',
  'apostila.status_',
  'certificates.status_',
  'certificates.theme_',
  'certificates.tpl_desc_',
  'cohorts.date_',
  'cohorts.fmt_',
  'cohorts.mod_',
  'cohorts.section_',
  'lessons.section_',
  'presets.group_',
  'questions.comp_class_',
  'questions.type_',
  'roteiro.tipo_',
];

// The Trail builds exactly one key by concatenation: trilha/js/page.js:622,
// 'page.tabshort_' + btn.dataset.tab (the short tab labels on mobile).
export const TRILHA_DYNAMIC_PREFIXES = ['page.tabshort_'];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walk(p, acc);
    } else if (/\.(js|mjs|html)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

// Every file that could reference a key, as one blob. `roots` are absolute dirs;
// `excludes` are '/'-joined path fragments (the dictionaries themselves).
export function collectSources(roots, excludes = []) {
  const files = roots.flatMap((r) => walk(r))
    .map((p) => p.split(path.sep).join('/'))
    .filter((f) => !excludes.some((x) => f.includes(x)));
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

// Keys present in the dictionary that appear nowhere in `blob` and are not covered
// by a dynamic prefix.
export function deadKeys(keys, blob, dynamicPrefixes) {
  return keys.filter((k) =>
    !blob.includes(k) && !dynamicPrefixes.some((p) => k.startsWith(p)));
}

// Keys of the Trail dictionary, read from source: the module only exports t().
export function trilhaKeys(src, objName = 'pt') {
  const start = src.indexOf('const ' + objName + ' = {');
  if (start === -1) throw new Error('trilha i18n: ' + objName + ' object not found');
  const body = src.slice(start, src.indexOf('\n};', start));
  return [...body.matchAll(/'([^']+)':/g)].map((m) => m[1]);
}
