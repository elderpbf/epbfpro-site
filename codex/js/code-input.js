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
  var ALFABETOS = {
    // Sem letra ambígua: é o mesmo alfabeto que o `codex-api` usa para MINTAR o código
    // (OTP_ALPHABET, sem I, O e Q), então o campo não aceita um caractere que jamais será gerado.
    alnum: /[^A-Z0-9]/g,
    digits: /[^0-9]/g
  };

  // PURA. O valor que o campo deve ter, dado o que a pessoa digitou ou colou.
  //
  // Colar do e-mail é o caso comum e traz lixo: espaço na frente, quebra de linha atrás, às vezes o
  // ponto final da frase. Nada disso pode virar erro de "código inválido" na cara de quem colou o
  // código certo.
  function normalize(value, opts) {
    opts = opts || {};
    var length = opts.length || 4;
    var limpa = ALFABETOS[opts.mode === 'digits' ? 'digits' : 'alnum'];
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

  return { normalize: normalize, attach: attach };
})();

if (typeof window !== 'undefined') window.CodeInput = CodeInput;
if (typeof module !== 'undefined' && module.exports) module.exports = CodeInput;
