// js/item-download.js
// Baixar o conteúdo de um item como arquivo, gerado na hora no browser.
//
// Nada é pré-gerado nem guardado no R2: o `body_md` já veio no payload do item, então o
// download é um Blob e um clique sintético. Pré-gerar custaria storage e ficaria velho a
// cada edição do item, silenciosamente.
//
// Regra de formato (Élder, track-61): quem vê os símbolos do markdown baixa `.md`; quem vê
// o markdown processado baixa PDF. Aqui mora só o `.md`; o PDF é fatia própria.

// Nome de arquivo a partir do título do item. Os títulos reais trazem marcação de markdown
// ("# Prompt: ...") e acentos, e nenhum dos dois sobrevive bem a um sistema de arquivos.
export function fileNameFromTitle(title, ext = 'md') {
  const base = String(title == null ? '' : title)
    .replace(/^#+\s*/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return (base || 'item') + '.' + ext;
}

// Nomes únicos dentro de um mesmo pacote. Dois itens de título parecido colapsam no mesmo
// nome depois de tirar acento e pontuação, e no ZIP um sobrescreveria o outro em silêncio.
export function uniqueNames(titles, ext = 'md') {
  const seen = new Map();
  return titles.map((t) => {
    const name = fileNameFromTitle(t, ext);
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : name.replace(new RegExp('\\.' + ext + '$'), '-' + n + '.' + ext);
  });
}

// Dispara o download de um texto. Browser-only (URL.createObjectURL + clique sintético);
// o nome do arquivo é a parte pura e testável.
export function downloadText(text, filename, mime = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text == null ? '' : String(text)], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revogar na hora corta o download em alguns browsers; um tick basta.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Um item que NAO cabe num .zip. Élder 2026-08-05, sobre pastas com lab dentro: "either we
// forbid it... or we just allow them and they just get sidestepped". Ele escolheu permitir e
// AVISAR: "telling correctly that this does not go into the download zip is the better thing
// to do. And we're not going to add anything to the zip because it makes no sense" -- ou seja,
// nada de arquivo-substituto no lugar do lab.
//
// Proibir seria pior e ele tinha razao em nao querer: a regra ficaria dependente da ORDEM
// (poe um lab primeiro e a pasta trava contra documentos), e resolveria um problema de rotulo
// com uma proibicao estrutural.
//
// Lab e interativo sao aplicacoes que vivem na trilha, nao arquivos. Uma fonte so, porque a
// tela que AVISA e o download que PULA nao podem discordar.
export function isDownloadable(item) {
  const type = item && (item.type || item);
  return type !== 'lab' && type !== 'interativo';
}
