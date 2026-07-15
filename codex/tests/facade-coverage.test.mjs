// Every `api.<method>()` a cohorts module calls must actually EXIST on the facade.
//
// WHY THIS FILE EXISTS: on 2026-07-15 a merge resolved codex-api.js with `git checkout --theirs`,
// which takes the other side's WHOLE FILE — silently dropping seven methods (listPeople,
// setPersonEmail, findTestAccounts, findDuplicates, mergeStudents, dismissDuplicate,
// setCanonicalName) that only one side had. The full suite passed 1609/1609 and the Usuários list
// was stone dead: "api.listPeople is not a function", caught only by opening a browser.
//
// The suite could not see it because every test that touches the backend stubs callWorker and
// asserts the ACTION STRING — none of them assert the seam itself is intact. This does, statically,
// for the price of a regex. It is the same bug class as the `_students` -> `_people` rename that
// left `filterOptions(_students)` behind: an identifier that exists in one file and not the other,
// invisible to a suite that never wires the two together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as facade from '../js/codex-api.js';

const dir = (p) => fileURLToPath(new URL(p, import.meta.url));
const read = (p) => readFileSync(dir(p), 'utf8');

const DIRS = ['../cohorts/', '../content/', '../lessons/', '../questions/', '../certificates/'];

// Which facade export a file binds to `api`. A module picks its own group — cohorts/courses.js does
// `import { courses as api }`, not `{ cohorts as api }` — so the group has to be READ, never assumed
// from the directory (assuming it flagged 39 healthy calls on the first run).
function groupBoundToApi(src) {
  const imp = src.match(/import\s*\{([^}]*)\}\s*from\s*'[^']*codex-api\.js'/);
  if (!imp) return null;
  const alias = imp[1].split(',').map((x) => x.trim()).find((x) => /\bas\s+api$/.test(x));
  return alias ? alias.split(/\s+as\s+/)[0].trim() : null;
}
// The lookbehind matters: assinador.js talks to the desktop signer via `window.pywebview.api.sign()`,
// which is a different `api` entirely. Only a bare `api.` is the facade.
const callsIn = (src) => [...src.matchAll(/(?<![.\w$])api\.([a-zA-Z_$][\w$]*)\s*\(/g)].map((m) => m[1]);

for (const d of DIRS) {
  const files = readdirSync(dir(d)).filter((f) => f.endsWith('.js'));
  test(`${d.replace(/\.\.\/|\//g, '')}: every api.* call resolves to a real facade method`, () => {
    const missing = [];
    for (const f of files) {
      const src = read(d + f);
      const group = groupBoundToApi(src);
      if (!group) continue;                          // does not use the facade as `api`
      const obj = facade[group];
      assert.ok(obj, f + ' imports { ' + group + ' as api } but the facade has no such export');
      for (const m of new Set(callsIn(src))) {
        if (typeof obj[m] !== 'function') missing.push(f + ' -> ' + group + '.' + m + '()');
      }
    }
    assert.deepEqual(missing, [], 'these calls would throw "is not a function" at runtime');
  });
}

test('the facade still carries the whole track-28a2 seam', () => {
  // Named explicitly, because these are exactly the ones a whole-file merge resolution dropped.
  // Losing any of them kills the Usuários list outright, with a green suite.
  for (const m of ['listPeople', 'setPersonEmail', 'setCanonicalName', 'findDuplicates',
                   'mergeStudents', 'dismissDuplicate', 'findTestAccounts', 'setEmailVerified']) {
    assert.equal(typeof facade.cohorts[m], 'function', m + ' missing from the facade');
  }
});

test('each of those maps to the action string the worker actually registers', () => {
  // A method that exists but calls the wrong action is the same outage with a slower diagnosis.
  const seen = [];
  global.callWorker = (p) => { seen.push(p.action); return Promise.resolve({}); };
  const expect = {
    listPeople: 'ct_list_people',
    setPersonEmail: 'ct_set_person_email',
    setCanonicalName: 'ct_set_canonical_name',
    findDuplicates: 'ct_find_duplicates',
    mergeStudents: 'ct_merge_students',
    dismissDuplicate: 'ct_dismiss_duplicate',
    findTestAccounts: 'ct_find_test_accounts',
    setEmailVerified: 'ct_set_email_verified',
  };
  for (const [m, action] of Object.entries(expect)) {
    seen.length = 0;
    facade.cohorts[m]({});
    assert.deepEqual(seen, [action], m + ' must call ' + action);
  }
  delete global.callWorker;
});
