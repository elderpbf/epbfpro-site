'use strict';

// codex/js/code-input.js
// O campo de CÓDIGO, um só, para todas as telas.
//
// Pedido do Élder em 2026-07-31: *"o campo deve permitir apenas a quantidade esperada de
// caracteres, centralizados e auto uppercase"*, e a parte que manda: *"isso tem que ser onde eles
// tiverem, seja no codex, advradar, laudo app, backstage, pdf extractor"*.
//
// O QUE ISTO SUBSTITUI: cinco campos de código escritos à mão neste repositório (login do Codex,
// entrar da Trilha, modal de login do aluno, muro, código da aula ao vivo), cada um com uma
// combinação diferente de atributos, um deles com estilo embutido no HTML, e NENHUM deles passando
// o valor para maiúsculo de verdade. Regra escrita cinco vezes não fica errada de uma vez, fica
// errada uma tela por vez.
//
// A DIFERENÇA QUE FAZ DIFERENÇA: `text-transform: uppercase` muda o que se VÊ, não o que se ENVIA.
// O campo mostrava RPBH e mandava `rpbh`. Aqui o valor é normalizado de fato, e a classe CSS existe
// só para o campo não piscar em minúsculo enquanto a pessoa digita.
//
// Script CLÁSSICO de propósito, expondo `window.CodeInput`, exatamente como o `theme-manager.js` ao
// lado: as telas deste repositório são metade módulo ES e metade script clássico, e um global
// atende as duas sem obrigar ninguém a virar módulo. O `module.exports` no fim é só para o teste
// (node --test), e é guardado para não existir no navegador.
var CodeInput = (function () {
  // O ALFABETO DO CAMPO TEM QUE SER O QUE O SERVIDOR EMITE, e o comentário que estava aqui
  // descrevia um alfabeto que este código não implementava (dizia seguir o `OTP_ALPHABET` do
  // `codex-api` "sem I, O e Q", mas o padrão aceitava DÍGITOS e o Q existe no alfabeto real).
  //
  // Conferido em `codex-api/src/lib/student-auth.js` em 2026-07-31: o OTP é
  // `ABCDEFGHJKLMNPQRSTUVWXYZ`, ou seja **26 letras menos I e O** (parecidas com 1 e 0), e o
  // `normalizeOtpCode` do servidor descarta tudo que não é `A-Z`. Um campo que aceitava dígito
  // deixava o aluno digitar `0` no lugar do `O` — exatamente a confusão que fez o alfabeto excluir
  // essas duas letras — e o servidor respondia "código inválido" sem dizer por quê.
  var ALFABETOS = {
    letters: /[^A-Z]/g,
    digits: /[^0-9]/g,
    alnum: /[^A-Z0-9]/g
  };
  // PADRÃO = `letters`, e é escolha: todo código que este sistema EMITE hoje é ou 4 letras (OTP) ou
  // 4 dígitos (código de turma, que pede `digits` explicitamente). `alnum` não casa com nada que
  // exista, então deixá-lo como padrão só servia para uma tela nova nascer aceitando caractere que
  // o servidor vai recusar. Continua disponível para um código misto que venha a existir.
  var ALFABETO_PADRAO = 'letters';

  // PURA. O valor que o campo deve ter, dado o que a pessoa digitou ou colou.
  //
  // Colar do e-mail é o caso comum e traz lixo: espaço na frente, quebra de linha atrás, às vezes o
  // ponto final da frase. Nada disso pode virar erro de "código inválido" na cara de quem colou o
  // código certo.
  function normalize(value, opts) {
    opts = opts || {};
    var length = opts.length || 4;
    var limpa = ALFABETOS[opts.mode] || ALFABETOS[ALFABETO_PADRAO];
    return String(value == null ? '' : value).toUpperCase().replace(limpa, '').slice(0, length);
  }

  // Liga o comportamento num <input> que já existe. Devolve o próprio elemento.
  //
  // `onComplete` dispara UMA vez por preenchimento (quem chama usa para submeter sozinho, e chamar
  // duas vezes submeteria duas). Apagar e completar de novo dispara de novo, que é o que a pessoa
  // que errou um dígito espera.
  function attach(el, opts) {
    if (!el) return el;
    opts = opts || {};
    var length = opts.length || 4;

    el.setAttribute('maxlength', String(length));
    el.setAttribute('inputmode', opts.mode === 'digits' ? 'numeric' : 'text');
    el.setAttribute('autocomplete', 'one-time-code');
    el.setAttribute('autocapitalize', 'characters');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('spellcheck', 'false');
    if (String(el.className || '').indexOf('pia-code') === -1) {
      el.className = (el.className ? el.className + ' ' : '') + 'pia-code';
    }

    var completou = false;
    el.addEventListener('input', function () {
      var antes = el.value;
      var depois = normalize(antes, { length: length, mode: opts.mode });
      if (depois !== antes) {
        el.value = depois;
        // O cursor volta para o fim quando o valor foi reescrito. Sem isto, digitar um caractere
        // recusado joga o cursor para o começo no meio da digitação.
        if (typeof el.setSelectionRange === 'function') {
          try { el.setSelectionRange(depois.length, depois.length); } catch (e) { /* campo sem seleção */ }
        }
      }
      if (depois.length === length) {
        if (!completou) {
          completou = true;
          if (typeof opts.onComplete === 'function') opts.onComplete(depois);
        }
      } else {
        completou = false;
      }
    });

    return el;
  }

  // Código errado sai do campo (Élder 2026-07-31). Quem errou vai digitar de novo, e apagar por
  // cima de quatro caracteres que já estão lá é trabalho que o campo devia fazer sozinho. O foco
  // volta junto, senão a pessoa toma o erro e o cursor fica em lugar nenhum.
  //
  // Isto mora AQUI e não em cada tela porque a regra é a mesma nas cinco, e regra repetida cinco
  // vezes fica errada uma tela por vez.
  function clear(el, opts) {
    if (!el) return el;
    el.value = '';
    if (!opts || opts.focus !== false) {
      try { el.focus(); } catch (e) { /* campo fora da tela */ }
    }
    return el;
  }

  return { normalize: normalize, attach: attach, clear: clear };
})();

if (typeof window !== 'undefined') window.CodeInput = CodeInput;
if (typeof module !== 'undefined' && module.exports) module.exports = CodeInput;
