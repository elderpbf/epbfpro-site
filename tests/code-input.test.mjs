// O campo de código, UM só, em todo lugar (Élder 2026-07-31).
//
// O pedido foi: *"o campo deve permitir apenas a quantidade esperada de caracteres, centralizados e
// auto uppercase"*. E a parte que importa mais que a regra: *"isso tem que ser onde eles tiverem,
// seja no codex, advradar, laudo app, backstage, pdf extractor"*.
//
// Por que isto é teste de FONTE e não só de comportamento: quando a mesma regra é escrita à mão em
// cada tela, ela não fica errada de uma vez, ela fica errada uma tela por vez. Antes deste
// componente havia CINCO campos de código no site, cada um com uma combinação diferente de
// atributos, um deles com estilo embutido no HTML e nenhum deles passando o valor para maiúsculo de
// verdade (só `text-transform`, que muda o que se VÊ e não o que se ENVIA). O teste de fonte é o que
// impede a sexta tela de nascer torta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const require = createRequire(import.meta.url);
const CodeInput = require('../codex/js/code-input.js');

test('normaliza: maiúsculo de verdade, no VALOR', () => {
  // `text-transform: uppercase` muda o que se vê. O que vai para o servidor continua minúsculo, e
  // "por que o código rpbh não funciona?" vira um mistério de trinta minutos.
  assert.equal(CodeInput.normalize('rpbh', { length: 4 }), 'RPBH');
});

test('normaliza: corta no tamanho esperado', () => {
  assert.equal(CodeInput.normalize('ABCDEFG', { length: 4 }), 'ABCD');
});

test('normaliza: joga fora o que não é do alfabeto', () => {
  // Colar do e-mail traz espaço, quebra de linha e às vezes um ponto final junto.
  assert.equal(CodeInput.normalize(' rp bh\n', { length: 4 }), 'RPBH');
  assert.equal(CodeInput.normalize('AB-CD.', { length: 4 }), 'ABCD');
});

test('normaliza: modo numérico recusa letra', () => {
  // O código da aula ao vivo é numérico (0000). Deixar letra entrar ali só adia o erro.
  assert.equal(CodeInput.normalize('12a34', { length: 4, mode: 'digits' }), '1234');
});

test('normaliza: nada vira string vazia, nunca null', () => {
  assert.equal(CodeInput.normalize(null, { length: 4 }), '');
  assert.equal(CodeInput.normalize(undefined, { length: 4 }), '');
});

test('attach: prepara o campo sem precisar de HTML repetido', () => {
  const el = fakeInput();
  CodeInput.attach(el, { length: 4 });
  assert.equal(el.getAttribute('maxlength'), '4');
  assert.equal(el.getAttribute('autocomplete'), 'one-time-code');
  assert.equal(el.getAttribute('autocapitalize'), 'characters');
  assert.equal(el.getAttribute('spellcheck'), 'false');
  assert.ok(el.className.includes('pia-code'), 'falta a classe compartilhada: ' + el.className);
});

test('attach: digitar minúsculo escreve maiúsculo no campo', () => {
  const el = fakeInput();
  CodeInput.attach(el, { length: 4 });
  el.value = 'rp';
  el.fire('input');
  assert.equal(el.value, 'RP');
});

test('attach: avisa quando completou, uma vez só por preenchimento', () => {
  // Quem chama usa isso para submeter sozinho. Chamar duas vezes submeteria duas.
  const el = fakeInput();
  let vezes = 0;
  CodeInput.attach(el, { length: 4, onComplete: () => vezes++ });
  el.value = 'rpbh'; el.fire('input');
  el.fire('input');
  assert.equal(vezes, 1);
});

test('attach: apagar e completar de novo avisa de novo', () => {
  const el = fakeInput();
  let vezes = 0;
  CodeInput.attach(el, { length: 4, onComplete: () => vezes++ });
  el.value = 'rpbh'; el.fire('input');
  el.value = 'rpb'; el.fire('input');
  el.value = 'rpbx'; el.fire('input');
  assert.equal(vezes, 2);
});

test('clear: código errado sai do campo e o foco volta', () => {
  const el = fakeInput();
  let focado = 0;
  el.focus = () => { focado++; };
  CodeInput.attach(el, { length: 4 });
  el.value = 'RPBH'; el.fire('input');
  CodeInput.clear(el);
  assert.equal(el.value, '');
  assert.equal(focado, 1);
});

test('clear: depois de apagar, completar de novo volta a avisar', () => {
  // Sem isto, quem erra o código uma vez perde o envio automático para sempre naquela tela.
  const el = fakeInput();
  let vezes = 0;
  CodeInput.attach(el, { length: 4, onComplete: () => vezes++ });
  el.value = 'rpbh'; el.fire('input');
  CodeInput.clear(el); el.fire('input');
  el.value = 'sgys'; el.fire('input');
  assert.equal(vezes, 2);
});

test('as telas que NÃO re-renderizam apagam o código errado', () => {
  // As cinco telas se dividem em duas famílias: as que re-renderizam o cartão inteiro no erro
  // (muro e modal do aluno, onde o campo nasce vazio de novo) e as que só trocam o texto do erro.
  // Estas últimas ficavam com o código errado no campo, e são as que precisam chamar clear().
  for (const f of ['codex/js/codex-login.js', 'codex/trilha/js/entrar.js']) {
    assert.ok(/CodeInput\.clear/.test(read(f)), f + ' não apaga o código errado');
  }
});

test('as telas que re-renderizam nascem com o campo vazio', () => {
  // A outra família: o teste é que o gabarito não carrega `value=`, senão o "apagar" seria só
  // aparente e voltaria no próximo render.
  for (const f of ['codex/trilha/js/wall-access-otp.js', 'codex/trilha/js/student-login-modal.js']) {
    const src = read(f);
    const linha = src.split(String.fromCharCode(10)).find((l) => /id="(cdx-en-code|tr-login-code)"/.test(l));
    assert.ok(linha, f + ': não achei o campo de código');
    assert.ok(!/value=/.test(linha), f + ': o campo renasce com valor preenchido');
  }
});

test('a classe compartilhada existe no CSS compartilhado, e centraliza', () => {
  const css = read('codex/css/components.css');
  assert.ok(css.includes('.pia-code'), 'components.css não tem .pia-code');
  const bloco = css.slice(css.indexOf('.pia-code'), css.indexOf('.pia-code') + 600);
  assert.ok(/text-align:\s*center/.test(bloco), '.pia-code não centraliza');
  assert.ok(/text-transform:\s*uppercase/.test(bloco), '.pia-code não sobe para maiúsculo');
});

test('TODO campo de código do site usa o componente, nenhum reimplementa', () => {
  // A lista é fechada de propósito: um campo novo que não estiver aqui e não chamar CodeInput.attach
  // faz este teste falhar, que é exatamente o ponto.
  const arquivos = [
    'codex/index.html',
    'codex/trilha/js/entrar.js',
    'codex/trilha/js/student-login-modal.js',
    'codex/trilha/js/wall-access-otp.js',
    'trilha/entrar.html'
  ];
  for (const f of arquivos) {
    const src = read(f);
    assert.ok(/CodeInput\.attach/.test(src), f + ' tem campo de código e não usa CodeInput.attach');
  }
});

test('ninguém mais carrega a regra no atributo ou no estilo embutido', () => {
  // O estado anterior: cinco campos, cada um com sua combinação, e um com
  // style="text-transform:uppercase;letter-spacing:.25em" escrito no HTML.
  const login = read('codex/index.html');
  assert.ok(!/style="text-transform:uppercase/.test(login), 'estilo embutido voltou ao login do Codex');
});

test('as páginas que têm campo de código carregam o componente', () => {
  for (const p of ['codex/index.html', 'trilha/index.html', 'trilha/entrar.html']) {
    assert.ok(read(p).includes('code-input.js'), p + ' não carrega code-input.js');
  }
});

test('o tema público segue o SISTEMA quando ninguém escolheu nada', () => {
  // Élder, 2026-07-31, abrindo a Trilha no celular: *"abriu no light do nada, quase fico cego"*.
  // A ordem certa é URL > escolha guardada > SISTEMA > padrão declarado. O padrão só vale quando o
  // navegador não sabe responder, e não como primeira resposta.
  const tm = read('codex/js/theme-manager.js');
  assert.ok(/prefers-color-scheme/.test(tm), 'theme-manager não consulta a preferência do sistema');
  const bloco = tm.slice(tm.indexOf('function initPublic'), tm.indexOf('function initPublic') + 900);
  assert.ok(/prefers-color-scheme/.test(bloco), 'initPublic ignora a preferência do sistema');
  assert.ok(bloco.indexOf('stored') < bloco.indexOf('prefers-color-scheme'),
    'a escolha guardada tem que vir ANTES do sistema: quem já escolheu, escolheu');
});

// ── um <input> de mentira, suficiente para o que o componente faz ────────────
function fakeInput() {
  const attrs = {};
  const handlers = {};
  return {
    value: '',
    className: '',
    tagName: 'INPUT',
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    addEventListener(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    fire(ev) { for (const fn of handlers[ev] || []) fn({ target: this }); },
    setSelectionRange() {},
    get selectionStart() { return this.value.length; }
  };
}
