'use strict';

// Shared spec for ClassTrail AI item generation.
// Defines the markdown subset students will see and the JSON contract
// used to populate item fields (title, summary, type, tags, body_md).

window.CT_AI_SPEC = (function() {

  // Markdown elements the renderer styles. The system prompt instructs
  // the model to use ONLY these so every item looks consistent on the
  // student page. Emojis are PRESERVED, not stripped.
  var MARKDOWN_RULES =
    'Use APENAS estes elementos de Markdown:\n' +
    '- ## Titulo de secao  (secoes principais; max 4 por item)\n' +
    '- ### Sub-secao       (detalhes dentro de uma secao)\n' +
    '- **negrito**         (termos-chave)\n' +
    '- *italico*           (enfase suave)\n' +
    '- - item              (lista nao-ordenada)\n' +
    '- 1. item             (lista ordenada / passos)\n' +
    '- ```bloco```         (codigo, exemplos verbatim)\n' +
    '- `inline`            (termo tecnico curto)\n' +
    '- > citacao           (avisos/observacoes)\n' +
    '- [texto](url)        (links externos)\n' +
    '\n' +
    'PROIBIDO: HTML cru, tabelas, imagens.\n' +
    '\n' +
    'EMOJIS — REGRA CRITICA:\n' +
    'PRESERVE todos os emojis do input. Eles ajudam a leitura e dao\n' +
    'identidade visual ao item. Se o input usa emojis para marcar\n' +
    'secoes (ex: 🔁 ✅ 🖥️ 🍎 ⚠️ 💡), MOVA o emoji para dentro do\n' +
    'cabecalho que ele introduz. Exemplo:\n' +
    '  Input:  "🖥️ NO WINDOWS\\n1. Abra o VLC..."\n' +
    '  Output: "## 🖥️ No Windows\\n1. Abra o VLC..."\n' +
    'NAO invente emojis novos onde nao havia. NAO remova emojis existentes.\n';

  function buildSystemPrompt(types, tags) {
    var typeList = types.map(function(t) {
      var icon = t.icon ? t.icon + ' ' : '';
      return '- ' + t.slug + ': ' + icon + t.label;
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

      'REGRA ESPECIAL — TIPO PROMPT:\n' +
      'Se o conteudo do input for um prompt para uma IA (instrucoes dirigidas\n' +
      'a um modelo de linguagem como ChatGPT, Claude, Gemini etc), ENTAO:\n' +
      '  - type: "prompt"\n' +
      '  - body_md: copie o input EXATAMENTE como veio, caractere por caractere.\n' +
      '    Sem reformatar, sem mexer em asteriscos, sem trocar quebras de linha,\n' +
      '    sem adicionar ## headers. O texto do prompt e instrucao para a IA;\n' +
      '    qualquer caractere que parece markdown e parte do prompt, nao formatacao.\n' +
      '  - title, summary e tag_labels: voce ainda gera normalmente.\n' +
      'Sinais de que e um prompt: o texto fala "voce e...", "atue como...",\n' +
      '"sua tarefa e...", "responda em formato...", instrui um modelo a fazer algo.\n\n' +

      'REGRAS PARA body_md (todos os outros tipos):\n' + MARKDOWN_RULES + '\n' +

      'REGRA CRITICA DE PRESERVACAO:\n' +
      'NAO RESUMA. NAO ENCURTE. NAO OMITA paragrafos ou trechos.\n' +
      'Mantenha 100% do conteudo informacional do input. Voce APENAS adiciona\n' +
      'marcacao Markdown para clareza visual (exceto para type=prompt, onde\n' +
      'o body fica intocado). Se o input tem N paragrafos, a saida deve ter\n' +
      'pelo menos N paragrafos cobrindo o mesmo material.\n\n' +

      'RETORNE APENAS o JSON. Nada antes, nada depois, sem cercas de codigo.'
    );
  }

  // Try to parse JSON returned by the model. Some providers wrap output
  // in ```json fences despite instructions; strip those defensively.
  function parseModelJson(text) {
    if (!text) return null;
    var s = text.trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
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

  // Client-side belt-and-suspenders: if AI labelled the item as a prompt,
  // ALWAYS use the original raw input as body_md. The AI may forget the
  // verbatim rule even when the system prompt says so.
  function enforcePromptVerbatim(parsed, rawInput) {
    if (!parsed) return parsed;
    if (parsed.type === 'prompt') {
      parsed.body_md = rawInput;
    }
    return parsed;
  }

  return {
    buildSystemPrompt:     buildSystemPrompt,
    parseModelJson:        parseModelJson,
    looksTruncated:        looksTruncated,
    enforcePromptVerbatim: enforcePromptVerbatim,
    MAX_TOKENS:            8000
  };

})();
