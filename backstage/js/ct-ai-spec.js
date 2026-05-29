'use strict';

// Shared spec for ClassTrail AI item generation.
// Defines the markdown subset students will see, the JSON contract
// used to populate item fields, and the emoji-handling rules.

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
    '- ```bloco```         (codigo, exemplos verbatim)\n' +
    '- `inline`            (termo tecnico curto)\n' +
    '- > citacao           (avisos/observacoes)\n' +
    '- [texto](url)        (links externos)\n' +
    '\n' +
    'PROIBIDO: HTML cru, tabelas, imagens.\n';

  function _emojiSection(addEmojis) {
    if (addEmojis) {
      return (
        'EMOJIS:\n' +
        'PRESERVE todos os emojis do input. Eles ajudam a leitura.\n' +
        'Se o input usa emojis para marcar secoes (ex: 🔁 ✅ 🖥️ 🍎 ⚠️ 💡),\n' +
        'MOVA cada emoji para dentro do cabecalho ## ou ### que ele introduz.\n' +
        '\n' +
        'Quando o input NAO tem emojis E o conteudo e educacional/lista de\n' +
        'passos/dicas/exemplos, ADICIONE emojis discretos APENAS nos cabecalhos\n' +
        '(maximo 1 por secao). Escolha um emoji que ajude a identificar o tema\n' +
        '(ex: 💡 para dicas, ⚠️ para avisos, 🖥️ para Windows, 🍎 para Mac,\n' +
        '✅ para checklist, 📝 para exercicios). Use com moderacao.\n' +
        '\n' +
        'NAO use emojis em paragrafos, listas ou citacoes.\n' +
        'NAO use emojis em conteudo juridico, formal, ou tecnico denso.\n' +
        'Em duvida, prefira nao usar.\n'
      );
    }
    return (
      'EMOJIS:\n' +
      'PRESERVE todos os emojis ja presentes no input. Voce pode mover um\n' +
      'emoji do input para dentro do cabecalho que ele introduz, mas NUNCA\n' +
      'adicione emojis novos onde nao havia. Se o input nao tem emojis,\n' +
      'a saida tambem nao deve ter.\n'
    );
  }

  // opts:
  //   addEmojis  boolean (default true) — controls whether the AI may
  //              introduce new emojis. Always preserves existing ones.
  function buildSystemPrompt(types, tags, opts) {
    opts = opts || {};
    var addEmojis = opts.addEmojis !== false;

    var typeList = types.map(function(t) {
      // A glyph:<key> is a UI render token, not an emoji — never feed it to the
      // model (it would echo "glyph:video" as an icon). Legacy emojis still pass.
      var icon = (t.icon && t.icon.indexOf('glyph:') !== 0) ? t.icon + ' ' : '';
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
      '    sem adicionar ## headers, SEM mexer em emojis. O texto do prompt e\n' +
      '    instrucao para a IA; qualquer caractere e parte do prompt.\n' +
      '  - title, summary e tag_labels: voce ainda gera normalmente.\n' +
      'Sinais de que e um prompt: "voce e...", "atue como...", "sua tarefa e...",\n' +
      '"responda em formato...", instrucoes a um modelo de IA.\n\n' +

      'REGRAS PARA body_md (todos os outros tipos):\n' + MARKDOWN_RULES + '\n' +

      _emojiSection(addEmojis) + '\n' +

      'REGRA CRITICA DE PRESERVACAO:\n' +
      'NAO RESUMA. NAO ENCURTE. NAO OMITA paragrafos ou trechos.\n' +
      'Mantenha 100% do conteudo informacional do input. Voce APENAS adiciona\n' +
      'marcacao Markdown e (se permitido) emojis para clareza visual.\n' +
      'Se o input tem N paragrafos, a saida deve cobrir o mesmo material.\n\n' +

      'RETORNE APENAS o JSON. Nada antes, nada depois, sem cercas de codigo.'
    );
  }

  // Refine prompt: takes the original raw input + the user's edits to the
  // first AI output, asks the model to align the rest. Saves tokens by
  // sending only the diff (fields the user actually changed).
  function buildRefineSystemPrompt(opts) {
    opts = opts || {};
    var addEmojis = opts.addEmojis !== false;
    return (
      'Voce ja gerou um item didatico a partir de um INPUT ORIGINAL.\n' +
      'O usuario revisou e fez edicoes em alguns campos. Sua tarefa agora:\n' +
      'gerar uma nova versao do JSON onde:\n' +
      '  1. As edicoes do usuario sao MANTIDAS exatamente como ele as deixou.\n' +
      '  2. Os campos NAO editados sao RECALCULADOS para ficarem coerentes\n' +
      '     com o tom, vocabulario e foco que o usuario imprimiu nas edicoes.\n' +
      '  3. As mesmas regras de Markdown e emojis valem.\n' +
      '\n' +
      _emojiSection(addEmojis) + '\n' +
      'RETORNE APENAS o JSON com a estrutura {title, summary, type, tag_labels, body_md}.\n' +
      'Sem cercas, sem comentarios.'
    );
  }

  // Compute fields the user has changed vs the previous AI output.
  // Returns a small object — only what differs.
  function computeEditDiff(previous, current) {
    var diff = {};
    if (!previous) return current;
    ['title', 'summary', 'type', 'body_md'].forEach(function(k) {
      if ((previous[k] || '') !== (current[k] || '')) diff[k] = current[k];
    });
    var prev = (previous.tag_labels || []).slice().sort().join('|');
    var curr = (current.tag_labels  || []).slice().sort().join('|');
    if (prev !== curr) diff.tag_labels = current.tag_labels;
    return diff;
  }

  function buildRefineUserMessage(originalInput, previousOutput, editDiff) {
    return (
      'INPUT ORIGINAL DO USUARIO:\n```\n' + originalInput + '\n```\n\n' +
      'JSON QUE VOCE GEROU ANTES:\n```json\n' + JSON.stringify(previousOutput, null, 2) + '\n```\n\n' +
      'CAMPOS QUE O USUARIO MUDOU (use estes valores e ajuste o resto):\n```json\n' +
      JSON.stringify(editDiff, null, 2) + '\n```'
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
    if (a < 200) return false;
    return b < a * 0.55;
  }

  // Client-side belt-and-suspenders: prompts always keep their raw body.
  function enforcePromptVerbatim(parsed, rawInput) {
    if (!parsed) return parsed;
    if (parsed.type === 'prompt') parsed.body_md = rawInput;
    return parsed;
  }

  return {
    buildSystemPrompt:        buildSystemPrompt,
    buildRefineSystemPrompt:  buildRefineSystemPrompt,
    buildRefineUserMessage:   buildRefineUserMessage,
    computeEditDiff:          computeEditDiff,
    parseModelJson:           parseModelJson,
    looksTruncated:           looksTruncated,
    enforcePromptVerbatim:    enforcePromptVerbatim,
    MAX_TOKENS:               8000
  };

})();
