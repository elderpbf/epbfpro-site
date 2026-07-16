// codex/trilha/js/my-data.js — "Meus dados" on the Trail (track-42).
//
// Élder 2026-07-15: "a gente pode só mostrar pro aluno o que a gente tem dele. Ele tem 2 opções:
// uma de solicitar apagar e outro de solicitar a alteração. Acho que fica mais fácil, impede alguns
// tipos de burles que poderiam ser problemáticos."
//
// What these pin is that it is READ-ONLY and that it tells the truth: only fields we actually hold,
// and no control that could write. Read-only is not a first cut here, it is the security property —
// resolveStudentId consults the alias table BEFORE the identity, so a student who could add an
// address would be choosing whose person they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dataRows, myDataHtml } from '../trilha/js/my-data.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const mdJs = read('../trilha/js/my-data.js');
const pageJs = read('../trilha/js/page.js');
const prefsJs = read('../trilha/js/notif-prefs.js');
const keys = (r) => r.map((x) => x.key);

test('shows the registration name, the address and the CPF', () => {
  const r = dataRows({ name: 'Ana Souza', emails: ['ana@x.com'], cpf: '123.456.789-00' });
  assert.deepEqual(keys(r), ['name', 'emails', 'cpf']);
  assert.deepEqual(r[1].values, ['ana@x.com']);
});

test('a field we do not hold does not render as an empty line', () => {
  // "Meus dados" answers "what do you have about me". A blank row answers it wrong.
  assert.deepEqual(keys(dataRows({ name: 'Ana Souza', emails: ['ana@x.com'] })), ['name', 'emails']);
  assert.deepEqual(keys(dataRows({ emails: ['ana@x.com'] })), ['emails']);
  assert.deepEqual(dataRows({}), []);
  assert.deepEqual(dataRows(null), []);
});

test('every address that reaches them is listed, primary first', () => {
  const r = dataRows({ name: 'Ana', emails: ['primary@x.com', 'old@y.com'] });
  assert.deepEqual(r[1].values, ['primary@x.com', 'old@y.com']);
});

test('the label follows the count — one address is not "E-mails"', () => {
  assert.equal(dataRows({ emails: ['a@x.com'] })[0].label, 'E-mail');
  assert.equal(dataRows({ emails: ['a@x.com', 'b@y.com'] })[0].label, 'E-mails');
});

test('READ-ONLY: the card has no input, no textarea, no save', () => {
  const h = myDataHtml({ name: 'Ana Souza', emails: ['ana@x.com'], cpf: '1' }, {});
  assert.doesNotMatch(h, /<input/);
  assert.doesNotMatch(h, /<textarea/);
  assert.doesNotMatch(h, /<select/);
  // and nothing in the module can write
  assert.doesNotMatch(mdJs, /\bcall\(|api\.|fetch\(/);
});

test('the only way out is the support hub, carrying its origin', () => {
  const h = myDataHtml({ name: 'Ana' }, { client: 'acme', turma: 'turma-a', studentName: 'Ana' });
  assert.match(h, /href="\/suporte\.html\?[^"]*source=meus-dados/);
  assert.match(h, /client=acme/);
  assert.match(h, /turma=turma-a/);
  // Élder 2026-07-08: one consistent entry on every page, not a different affordance per screen.
  assert.match(mdJs, /import \{ supportUrl \} from '\.\/support-contact\.js'/);
});

test('it says WHY there is no edit button, instead of leaving the absence to be guessed', () => {
  assert.match(myDataHtml({ name: 'Ana' }, {}), /suporte/i);
});

test('the values are escaped — a name is user input', () => {
  const h = myDataHtml({ name: '<img src=x onerror=alert(1)>', emails: ['a@x.com'] }, {});
  assert.doesNotMatch(h, /<img src=x/);
  assert.match(h, /&lt;img/);
});

test('it reuses the Trail modal shell instead of inventing an overlay', () => {
  const h = myDataHtml({ name: 'Ana' }, {});
  assert.match(h, /class="tr-modal tr-md-modal"/);
  assert.match(h, /tr-modal-close/);
});

test('the entry sits in the settings box, and only when there IS someone to show', () => {
  assert.match(prefsJs, /onMyData \? '<button type="button" class="cdx-ns-mydata">/);
  // an anonymous view has nothing to answer with
  assert.match(pageJs, /onMyData: \(data\.participant\)/);
});

test('the panel serves the ONE name and the addresses', () => {
  // The worker's turma view had to grow email/cpf/aliases for this; the panel used to carry only a
  // name, and that name was `display_name || name` (track-42 killed the second one).
  assert.doesNotMatch(pageJs, /display_name \|\| \(data\.participant/);
});
