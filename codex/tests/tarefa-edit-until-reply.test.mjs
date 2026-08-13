// Editing the delivery UNTIL THE INSTRUCTOR REPLIES (track-26 item 3).
//
// Élder 2026-07-15: "eu sempre posso editar E o aluno pode editar ate eu responder e pronto;
// nada de abrir pagina e bloquear tudo, nada disso" (I can always edit AND the student can
// edit until I reply, that's it; no opening a page and locking everything, none of that) +
// "nao ha motivo de travar nota com mensagem; sao coisas independentes" (there's no reason to
// lock the grade with the message; they're independent things) + "a nota nao e mensagem do
// professor, mensagem e so mensagem" (the grade is not the teacher's message, a message is
// just a message).
//
// The gate is THE REPLY, not the act of looking: no screen locks anyone out for having been
// opened, and the server (can_edit) decides, not these tabs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { identityConfig } from '../trilha/js/tarefa-submit-modal.js';
import { findDelivery } from '../trilha/js/tarefas.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── Nothing locks by being opened ───────────────────────────────────────────────

// "Nada de abrir pagina e bloquear tudo, nada disso" (Élder). Opening a screen must have no
// consequence at all. If someone ever brings back a "seen" stamp, these tests fail.
test('no screen stamps "I saw it": opening changes nothing', () => {
  for (const [name, rel] of [['student tab', '../trilha/js/tarefas.js'], ['teacher panel', '../content/tarefas.js']]) {
    assert.ok(!/markReplySeen|markAnswersSeen|_seen_at/.test(read(rel)), name + ' stamps nothing');
  }
  assert.ok(!/mark_(answers|reply)_seen/.test(read('../trilha/js/api.js')), 'the student facade does not either');
  assert.ok(!/mark_(answers|reply)_seen/.test(read('../js/codex-api.js')), 'nor the admin one');
});

// "Eu sempre posso editar" (Élder, "I can always edit"): the teacher owns what they wrote,
// and a grade "may need adjusting later". No field on their panel is greyed out by anyone's decision.
test('the teacher panel never locks the reply nor the grade', () => {
  const src = read('../content/tarefas.js');
  const bloco = src.slice(src.indexOf('function _replyBlockHtml'), src.indexOf('function _toggleFlag'));
  assert.ok(!/disabled/.test(bloco), 'no disabled field');
  assert.match(bloco, /cdx-resp-reply-send/, 'the reply button always exists');
  assert.match(bloco, /cdx-resp-grade-save/, 'so does the save-grade one');
});

// ── The modal in edit mode ───────────────────────────────────────────────────

// The checkbox is not proposing anything here: it is showing what the delivery IS. Coming in
// unchecked over an anonymous delivery would identify who chose not to appear, just from
// saving a comma, and a name does not go back into anonymity once it has appeared.
test('editing an ANONYMOUS delivery, the checkbox comes checked: it is its state, not a proposal', () => {
  const c = identityConfig('Ana', true, true);
  assert.equal(c.showAnonCheckbox, true);
  assert.equal(c.anonChecked, true);
});
test('editing an IDENTIFIED delivery, the checkbox comes unchecked', () => {
  assert.equal(identityConfig('Ana', true, false).anonChecked, false);
});
// The task rules: if it does not accept anonymous, there is no checkbox at all, and submission would refuse it.
test('in a task that requires identification there is no checkbox, even editing an old anonymous row', () => {
  const c = identityConfig('Ana', false, true);
  assert.equal(c.showAnonCheckbox, false);
  assert.equal(c.anonChecked, false);
});
// Submitting (no editing) stays as before: NEVER pre-checked.
test('submitting, the checkbox still never comes checked', () => {
  assert.equal(identityConfig('Ana', true).anonChecked, false);
  assert.equal(identityConfig('', true).anonChecked, false);
});

test('the modal edits via ct_edit_submission, does not resubmit', () => {
  const src = read('../trilha/js/tarefa-submit-modal.js');
  // Resubmitting would be a SECOND delivery, and on a single-submission task it would hit already_submitted.
  assert.match(src, /if \(editing\) \{\s*await trail\.editTarefa\(/, 'editing -> editTarefa');
  assert.match(src, /id: editing\.id/, 'on the SAME row');
});
test('the modal explains the lock instead of saying "error"', () => {
  const src = read('../trilha/js/tarefa-submit-modal.js');
  assert.match(src, /code === 'already_replied'/);
  assert.ok(!/already_seen/.test(src), 'the old code died along with the old rule');
});
// Editing starts from what was submitted: an empty field would force retyping everything to change a sentence.
test('the field comes back pre-filled, and the registry is what unpacks the payload', () => {
  const src = read('../trilha/js/tarefa-submit-modal.js');
  assert.match(src, /initial: parseAnswer\(editing\.answer_json\)/);
  assert.match(src, /import \{ getField, parseAnswer \} from '\.\.\/\.\.\/js\/tarefa-fields\.js'/,
    'the payload shape lives in the registry, not duplicated here');
});

// OLD bug, found by this feature's playtest: the modal's <div> and the submit <button> had the
// SAME class, and querySelector matched the div first (document order). The "button" was the
// entire modal: touching anywhere on it submitted, textContent = 'Enviando...' erased the modal
// and left only the word on screen, and .disabled = true did nothing (a div has no disabled).
// It was live on submit, in production. js/frame-trail.js already had the 'button.' prefix as a
// workaround, which was the fossil of the bug.
test('the submit button\'s class belongs ONLY to the button', () => {
  const src = read('../trilha/js/tarefa-submit-modal.js');
  // (?![-\w]) instead of \b: \b after "submit" would match the hyphen in tr-tarefa-submit-modal
  // and tr-tarefa-submit-backdrop, which are DIFFERENT, legitimate classes.
  const classes = [...src.matchAll(/class="([^"]*\btr-tarefa-submit(?![-\w])[^"]*)"/g)].map((m) => m[1]);
  assert.equal(classes.length, 1, 'only one element carries the class: ' + JSON.stringify(classes));
  assert.match(src, /<button[^>]*class="[^"]*\btr-tarefa-submit(?![-\w])/, 'and it is the <button>');
  assert.match(src, /bd\.querySelector\('button\.tr-tarefa-submit'\)/, 'and the lookup requires the button');
});

// ── The student tab ───────────────────────────────────────────────────────────

test('findDelivery finds the delivery by ITS OWN id, not the task\'s', () => {
  const tarefas = [
    { item_id: 1, submissions: [{ id: 10 }, { id: 11 }] },
    { item_id: 2, submissions: [{ id: 20 }] },
  ];
  assert.equal(findDelivery(tarefas, 11).sub.id, 11);
  assert.equal(findDelivery(tarefas, 11).tarefa.item_id, 1);
  assert.equal(findDelivery(tarefas, 20).tarefa.item_id, 2);
  assert.equal(findDelivery(tarefas, 999), null);
  assert.equal(findDelivery(null, 1), null);
});

// The server decides. If the tab re-derived the rule, the button would appear on a delivery
// submission would reject, and the student would retype everything only to hit an error at the end.
test('the edit button follows the server\'s can_edit', () => {
  assert.match(read('../trilha/js/tarefas.js'), /if \(sub\.can_edit\)/);
});

// "A nota nao e mensagem do professor, mensagem e so mensagem" (Élder). Inside the message
// block, a delivery with only a grade used to draw a "Mensagem do Instrutor em ..." that had
// no message at all in it, just a number.
test('the grade sits OUTSIDE the message block, with its own label', () => {
  const src = read('../trilha/js/tarefas.js');
  const del = src.slice(src.indexOf('function deliveryHtml'), src.indexOf('function bodyHtml'));
  assert.match(del, /if \(sub\.instructor_reply\) \{/, 'the message block only exists if there IS a message');
  const reply = del.slice(del.indexOf('if (sub.instructor_reply) {'), del.indexOf('if (sub.grade) {'));
  assert.ok(!/grade/.test(reply), 'and the grade does not live inside it');
  assert.match(del, /tarefas\.grade_label/, 'standing alone, the grade carries its own label');
});
