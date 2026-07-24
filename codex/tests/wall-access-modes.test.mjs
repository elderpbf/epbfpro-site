// UM muro, com o modo de acesso plugavel. Este arquivo existe pra impedir que a duplicacao volte.
//
// O que aconteceu: `wall-simple.js` era uma copia de `wall.js` pras turmas em Emergencia. Copia
// nao fica parada. Ela divergiu em silencio e num CLIENTE REAL (jfse/magistrados):
//   - seguia desenhando o roadmap de aulas que o Elder mandou tirar do muro em 2026-07-11;
//   - desenhava a tela de bloqueado com o emoji 🚫 no lugar do glyph da biblioteca;
//   - conhecia 3 codigos de erro contra os 6 do muro de verdade.
// Ou seja: decisoes do Elder so chegavam num dos dois. Elder 2026-07-15: "nao deveria ter sido
// feito a duplicacao de codigo, isso foi um erro. Elas deveriam todas acessar o mesmo codigo, so
// que existem algumas modificacoes de acesso. Isso deveria ser plugavel".
//
// A regra que estes testes travam: um jeito novo de entrar e uma entrada no ACCESS_MODES, NUNCA
// um segundo muro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { accessModeFor } from '../trilha/js/wall.js';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => fs.readFileSync(path(rel), 'utf8');
const exists = (rel) => fs.existsSync(path(rel));

const wall = () => read('../trilha/js/wall.js');
const otp = () => read('../trilha/js/wall-access-otp.js');
const emerg = () => read('../trilha/js/wall-access-emergency.js');
const page = () => read('../trilha/js/page.js');

// So o CODIGO, sem comentario. Sem isto o teste do emoji acusa a propria explicacao de por que o
// emoji saiu ("desenhava com o emoji 🚫") como se fosse o emoji voltando.
const code = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

// ── A duplicacao morreu e nao volta ──────────────────────────────────────────

test('o segundo muro nao existe mais', () => {
  assert.ok(!exists('../trilha/js/wall-simple.js'), 'wall-simple.js foi absorvido pelo wall.js');
  assert.ok(!/wall-simple|renderSimpleWall/.test(page()), 'page.js nao conhece mais um segundo muro');
});

// O coracao: page.js escolhia ENTRE DOIS RENDERIZADORES. Agora chama um so e quem decide a porta
// e o proprio muro. Se voltar a ramificar aqui, a duplicacao esta voltando.
test('page.js chama UM muro, sem escolher entre dois', () => {
  const p = page();
  assert.ok(/renderWall\(root\)/.test(p), 'renderWall e o unico muro');
  assert.equal((p.match(/import \{ renderWall \} from '\.\/wall\.js'/g) || []).length, 1);
  assert.ok(!/access \|\| \{\}\)\.simple_enroll\) render/.test(p),
    'page.js nao ramifica por simple_enroll: isso e decisao do muro');
});

// benefitsHtml era BYTE A BYTE identico nos dois arquivos. Uma copia so, pra sempre.
test('benefitsHtml existe em UM lugar so', () => {
  const donos = ['../trilha/js/wall.js', '../trilha/js/wall-access-otp.js', '../trilha/js/wall-access-emergency.js']
    .filter((f) => /function benefitsHtml/.test(read(f)));
  assert.deepEqual(donos, ['../trilha/js/wall.js'], 'so o muro desenha os beneficios');
});

test('os ICONS dos beneficios tambem vivem num lugar so', () => {
  assert.ok(/const ICONS = \{/.test(wall()), 'o muro tem os icones');
  assert.ok(!/const ICONS = \{/.test(emerg()), 'o modo emergencia nao carrega copia dos icones');
});

// O beneficio de certificado so aparece se a turma REALMENTE emite certificado
// (toggle certificates_enabled do dossie, entregue no turma view). Antes ele saia
// sempre com a tag "se habilitado", prometendo algo que a turma podia nunca dar.
test('o beneficio de certificado e travado no certificates_enabled da turma', () => {
  const src = wall();
  assert.ok(/certificates_enabled/.test(src), 'o muro le o flag certificates_enabled');
  assert.ok(/certOn \? bene\('cert'/.test(src), 'o cartao cert so entra quando certOn');
  assert.ok(!/bene_cert_tag/.test(src), 'a tag "se habilitado" saiu (agora e condicional real, nao um hedge)');
});

// O botao do grupo do WhatsApp e beneficio de quem TEM acesso. Segunda camada sobre o
// backend (que ja omite whatsapp_url no muro gated). A trava e `!gated || approved`, que
// mantem o botao nas turmas ABERTAS (status 'anonymous', sem muro) e o esconde so no muro
// gated anonimo/pendente. Um gate ingenuo por 'approved' puro quebraria as turmas abertas.
test('o botao do grupo de WhatsApp so aparece com acesso (nao vaza no muro gated)', () => {
  const src = page();
  assert.ok(/!access\.gated \|\| access\.status === 'approved'/.test(src), 'trava por acesso, preservando turmas abertas');
  assert.ok(/turma\.whatsapp_url && hasAccess/.test(src), 'o botao exige url E acesso');
});

// ── O modo e um plugin, e so dono do cartao ──────────────────────────────────

test('ACCESS_MODES e a tabela: adicionar porta e uma entrada, nao um muro', () => {
  const w = wall();
  assert.match(w, /const ACCESS_MODES = \{/);
  assert.match(w, /otp:\s*mountOtpCard/);
  assert.match(w, /emergency:\s*mountEmergencyCard/);
});

test('cada modo monta o CARTAO, e so o cartao', () => {
  assert.match(otp(), /export function mountOtpCard\(cardEl\)/);
  assert.match(emerg(), /export function mountEmergencyCard\(cardEl\)/);
  // A casca, os avisos e os beneficios sao do muro. Um modo que monta secao propria e um muro
  // disfarcado, que e exatamente como o wall-simple comecou.
  for (const [nome, src] of [['otp', otp()], ['emergency', emerg()]]) {
    assert.ok(!/mountNoticeSection|cdx-en-grid|cdx-trilha-tabs/.test(src),
      nome + ' nao monta casca propria');
  }
});

test('o muro cai no OTP quando o modo e desconhecido', () => {
  assert.match(wall(), /ACCESS_MODES\[accessModeFor\(.*\)\] \|\| ACCESS_MODES\.otp/);
});

// ── accessModeFor: puro, e o front nao re-deriva o prazo ─────────────────────

test('accessModeFor: simple_enroll manda pra emergencia, o resto pro OTP', () => {
  assert.equal(accessModeFor({ simple_enroll: true }), 'emergency');
  assert.equal(accessModeFor({ simple_enroll: false }), 'otp');
  assert.equal(accessModeFor({}), 'otp');
  assert.equal(accessModeFor(null), 'otp');
  assert.equal(accessModeFor(undefined), 'otp');
});

// Quem decide se a emergencia expirou e o WORKER (isSimpleEnrollOpen). Se o front recalculasse o
// prazo, as duas contas divergiriam e o muro pintaria um formulario que o worker recusa.
test('o front NAO recalcula o prazo das 12h: le o que a view mandou', () => {
  const w = wall();
  assert.ok(!/simple_enroll_until|Date\.now\(\).*12|43200/.test(w),
    'o prazo e conta do worker, o front so le access.simple_enroll');
});

// ── As divergencias que a copia tinha acumulado ──────────────────────────────

// A copia desenhava 🚫 na mao; o muro usa a biblioteca de glyphs. Emoji no lugar de glyph e o
// sintoma classico de codigo que nasceu copiado.
test('nenhum emoji: a tela de bloqueado usa a biblioteca de glyphs', () => {
  for (const [nome, src] of [['wall', wall()], ['otp', otp()], ['emergency', emerg()]]) {
    assert.ok(!/🚫|⏰|✅|❌/u.test(code(src)), nome + ' nao desenha status com emoji');
  }
  assert.match(wall(), /glyph: 'ban'/, 'bloqueado usa o glyph ban');
  assert.match(wall(), /glyph: 'clock'/, 'pendente usa o glyph clock');
});

// O roadmap saiu do muro por decisao do Elder (2026-07-11) e a copia continuou desenhando. Agora
// que ha um muro so, a decisao vale pra todo mundo por construcao.
test('o roadmap nao volta pelo lado da emergencia', () => {
  for (const [nome, src] of [['wall', wall()], ['emergency', emerg()]]) {
    assert.ok(!/function roadmapHtml|cdx-en-road/.test(src), nome + ' nao desenha roadmap');
  }
});

// O suporte ("Precisa de ajuda?") vem do RODAPE (#cdx-tr-support-footer), montado pelo renderHero
// em TODA pagina da trilha, muro incluso. Entao ja aparece na tela de registro sem o muro fazer
// nada. Adicionar um segundo no muro DUPLICA na tela (Elder 2026-07-16: "Precisa de ajuda? esta
// duplicado"). A copia wall-simple montava o proprio E ganhava o rodape: mostrava dois calada.
test('o suporte vem do rodape, nao duplicado no muro', () => {
  assert.match(page(), /mountEntry\(root\.querySelector\('#cdx-tr-support-footer'\)/,
    'o rodape (renderHero) monta o suporte em toda pagina');
  const reg = wall().slice(wall().indexOf('function renderRegister'));
  assert.ok(!/entryHtml/.test(reg), 'renderRegister NAO monta um segundo suporte');
  // E o modo tambem nao: se fosse no modo, cada porta nova teria que lembrar de repetir, que e
  // exatamente como a duplicacao comecou.
  for (const [nome, src] of [['otp', otp()], ['emergency', emerg()]]) {
    assert.ok(!/entryHtml/.test(src), nome + ' nao carrega copia da caixa de suporte');
  }
});

// ── O comportamento da emergencia que precisa sobreviver ao refactor ─────────

test('a emergencia continua e-mail-first (nome so pra endereco novo)', () => {
  const e = emerg();
  assert.match(e, /cdx-en-namefield hidden/, 'o campo nome nasce escondido');
  assert.match(e, /simpleEnroll\(\{[^}]*ask_name:\s*true/, 'manda ask_name');
  assert.match(e, /res\.needs_name/, 'revela o nome quando o worker pede');
  assert.match(e, /classList\.remove\('hidden'\)/);
});

test('a emergencia so carimba consentimento quando um nome foi digitado', () => {
  assert.match(emerg(), /res\.needs_profile && name/);
});

// A fachada, nunca callWorker cru (regra do projeto).
test('os dois modos falam com o backend pela fachada', () => {
  assert.match(emerg(), /from '\.\/api\.js'/);
  assert.match(otp(), /from '\.\/student-login\.js'/);
  for (const [nome, src] of [['otp', otp()], ['emergency', emerg()]]) {
    assert.ok(!/callWorker\(/.test(src), nome + ' nao chama callWorker direto');
  }
});

// O modo que liga o timer e o modo que limpa. Deixar o poll no muro era vazamento entre camadas.
test('o poll do OTP vive dentro do modo OTP', () => {
  assert.match(otp(), /const clearPoll = \(\) =>/);
  assert.ok(!/POLL_CADENCE|clearPoll/.test(wall()), 'o muro nao carrega timer de modo nenhum');
});
