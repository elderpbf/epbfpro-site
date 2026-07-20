// codex/tools/brand-twin.js — o gêmeo do backstage deixa de ser gêmeo.
//
// O problema que isto resolve: `backstage/js/brand-logos.js` era uma SEGUNDA cópia do
// artwork, mantida à mão, e as duas metades andaram sozinhas até divergirem. Não dá para
// simplesmente importar uma da outra: o backstage carrega o arquivo como script CLÁSSICO
// (`<script src>`, sem `type="module"`), e as páginas dele chamam `mark()` e
// `glyphWordmark()` como globais. Um ES module não expõe global nenhum.
//
// A saída: o backstage recebe uma SAÍDA GERADA, não uma cópia. A transformação é
// mecânica e reversível de ler, e o tests/brand-sync.test.mjs regera e compara byte a
// byte, então o arquivo lá não pode mais divergir sem o teste acusar no mesmo dia.
//
// Por que a transformação é segura: num script clássico toda declaração de topo JÁ é
// global. Então tirar a palavra `export` é literalmente tudo que separa os dois formatos.
// Nada é reescrito, nada é reordenado, nenhuma função é adaptada.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JS = fileURLToPath(new URL('../js/', import.meta.url));

const CABECALHO =
`// GERADO — NÃO EDITE ESTE ARQUIVO.
//
// Saída de codex/tools/brand-twin.js no repo epbfpro-site. Ele é a versão script-clássico
// de codex/js/brand-font.js + codex/js/brand-logos.js, concatenados e sem a palavra
// "export" (num script clássico, declaração de topo já é global, que é como as páginas do
// backstage consomem: mark(), glyphWordmark(), stdColors()...).
//
// Para mudar a marca, edite os módulos NO epbfpro-site e rode:
//     node codex/tools/brand-build.mjs
// Editar aqui é a divergência que abriu o track-47, e o teste brand-sync.test.mjs
// regenera este arquivo e compara byte a byte, então a edição à mão fica vermelha.
`;

// Tira só o que separa ES module de script clássico. Deliberadamente burro: qualquer
// coisa mais esperta que isto seria uma tradução, e tradução é onde o desenho se perde.
//
// A normalização de CRLF não é detalhe: num checkout Windows os fontes vêm com \r\n, e
// sem isto a saída deste gerador dependeria de COMO o repo foi clonado. O teste de
// sincronia compara byte a byte, então isso seria vermelho em uma máquina e verde em
// outra. Já mordeu antes (o gate de deploy do track-35 pegou um CRLF nos testes).
function ler(nome) {
  return fs.readFileSync(path.join(JS, nome), 'utf8').replace(/\r\n/g, '\n');
}

function paraClassico(src) {
  return src
    .replace(/^import .*?;\n/gm, '')   // o módulo importa a fonte; aqui ela vem concatenada acima
    .replace(/^export /gm, '');
}

export function emitTwin() {
  const fonte = paraClassico(ler('brand-font.js'));
  const logos = paraClassico(ler('brand-logos.js'));
  return CABECALHO + '\n' + fonte.trim() + '\n\n' + logos.trim() + '\n';
}
