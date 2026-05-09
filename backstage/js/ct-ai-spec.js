'use strict';

// Shared spec for ClassTrail AI item generation.
// Defines the markdown subset students will see and the JSON contract
// used to populate item fields (title, summary, type, tags, body_md).

window.CT_AI_SPEC = (function() {

  // Markdown elements the renderer styles. The system prompt instructs
  // the model to use ONLY these so every item looks consistent on the
  // student page.
  var MARKDOWN_RULES =
    'Use APENAS estes elementos de Markdown:\n' +
    '- ## Titulo de secao  (secoes principais; max 4 por item)\n' +
    '- ### Sub-secao       (detalhes dentro de uma secao)\n' +
    '- **negrito**         (termos-chave)\n' +
    '- *italico*           (enfase suave)\n' +
    '- - item              (lista nao-ordenada)\n' +
    '- 1. item             (lista ordenada / passos)\n' +
    '- ```bloco```         (prompts, codigo, exemplos verbatim — sempre em bloco proprio)\n' +
    '- `inline`            (termo tecnico curto)\n' +
    '- > citacao           (avisos/observacoes)\n' +
    '- [texto](url)        (links externos)\n' +
    '\n' +
    'PROIBIDO: # H1 (reservado para o titulo do item), HTML cru, tabelas, imagens, emojis dentro do texto.\n';

  function buildSystemPrompt(types, tags) {
    var typeList = types.map(function(t) {
      return '- ' + t.slug + ': ' + t.label;
    }).join('\n');
    var tagList = tags.length
      ? tags.map(function(t) { return '"' + t.label + '"'; }).join(', ')
      : '(nenhuma cadastrada — voce pode sugerir novas)';

    return (
      'Voce prepara material didatico para alunos. Receba o texto bruto do professor e devolva um JSON ESTRITO.\n\n' +

      'FORMATO DE SAIDA (JSON puro, sem ``` nem comentarios):\n' +
      '{\n' +
      '  "title":      "...",       // max 80 caracteres, claro e objetivo\n' +
      '  "summary":    "...",       // 1 linha, max 140 caracteres, descreve o item\n' +
      '  "type":       "...",       // EXATAMENTE um destes slugs:\n' +
      typeList.split('\n').map(function(l) { return '                              //   ' + l.replace('- ', ''); }).join('\n') + '\n' +
      '  "tag_labels": ["..."],     // 0-4 itens. Prefira reutilizar tags existentes:\n' +
      '                              //   ' + tagList + '\n' +
      '                              // Pode incluir 1 nova se for claramente util.\n' +
      '  "body_md":    "..."        // texto formatado em Markdown (regras abaixo)\n' +
      '}\n\n' +

      'REGRAS PARA body_md:\n' + MARKDOWN_RULES + '\n' +

      'REGRA CRITICA DE PRESERVACAO:\n' +
      'NAO RESUMA. NAO ENCURTE. NAO OMITA paragrafos ou trechos.\n' +
      'Mantenha 100% do conteudo informacional do input. Voce APENAS adiciona\n' +
      'marcacao Markdown para clareza visual. Se o input tem N paragrafos,\n' +
      'a saida deve ter pelo menos N paragrafos cobrindo o mesmo material.\n\n' +

      'RETORNE APENAS o JSON. Nada antes, nada depois, sem cercas de codigo.'
    );
  }

  // Stricter prompt for "format only" (manual flow keeps existing fields and
  // just polishes the body). Used by the "Formatar com IA" button on the
  // body textarea after manual editing has begun.
  function buildFormatOnlyPrompt() {
    return (
      'Voce reformata texto bruto em Markdown limpo, mantendo TODO o conteudo.\n\n' +
      'REGRA CRITICA: NAO RESUMA. NAO ENCURTE. NAO OMITA paragrafos.\n' +
      'Mantenha 100% do conteudo informacional. Apenas adicione marcacao.\n\n' +
      MARKDOWN_RULES + '\n' +
      'Retorne APENAS o Markdown final, sem explicacoes nem cercas.'
    );
  }

  // Try to parse JSON returned by the model. Some providers wrap output
  // in ```json fences despite instructions; strip those defensively.
  function parseModelJson(text) {
    if (!text) return null;
    var s = text.trim();
    // Strip markdown code fences if present.
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    // Find the first { and last } as a fallback.
    var first = s.indexOf('{');
    var last  = s.lastIndexOf('}');
    if (first === -1 || last === -1 || last < first) return null;
    var json = s.slice(first, last + 1);
    try { return JSON.parse(json); } catch (e) { return null; }
  }

  // Heuristic: did the model truncate? Compares informational density.
  function looksTruncated(input, output) {
    if (!input || !output) return false;
    var a = input.replace(/\s+/g, ' ').trim().length;
    var b = output.replace(/\s+/g, ' ').trim().length;
    if (a < 200) return false;          // short inputs vary too much
    return b < a * 0.55;                // output under 55% of input by length
  }

  return {
    buildSystemPrompt:     buildSystemPrompt,
    buildFormatOnlyPrompt: buildFormatOnlyPrompt,
    parseModelJson:        parseModelJson,
    looksTruncated:        looksTruncated,
    MAX_TOKENS:            8000
  };

})();
