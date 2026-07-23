// codex/tools/brand-raster.mjs — os PNG da marca saem do MESMO SVG.
//
//   node tools/brand-raster.mjs           rasteriza e reescreve o lockfile
//   node tools/brand-raster.mjs --check   não escreve, sai 1 se algum PNG mudaria
//
// E-mail não roda SVG e os decks de slides querem raster, então esses cinco arquivos
// precisam existir como PNG. O que NÃO precisa é que sejam imagem solta mantida à mão:
// aqui eles são o mesmo artwork do manifesto, rasterizado por Chromium headless.
//
// Por que isto está separado do brand-build.mjs: rasterizar exige um browser, e o
// Codex não tem build step nem node_modules (CLAUDE.md -> Conventions). O build de SVG
// tem que continuar rodando com node puro em qualquer máquina. Este comando é opt-in,
// roda quando a marca muda, e falha ALTO se o Playwright não estiver disponível em vez
// de pular em silêncio.
//
// O portão de todo dia é o lockfile: este comando grava o sha256 de cada PNG que emitiu,
// e o tests/brand-sync.test.mjs confere o disco contra ele sem precisar de browser
// nenhum. Editar um PNG à mão fica vermelho na suíte normal.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RASTER_ARTIFACTS, repoRoot, emit } from './brand-manifest.js';

export const LOCK_PATH = fileURLToPath(new URL('./brand-raster.lock.json', import.meta.url));
export const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

// Chromium foi ESCOLHIDO por prova, não por gosto: o email-logo.png que já estava em
// disco bate com diff ZERO no tamanho nativo sob Chromium, e diverge sob WebKit. Trocar
// de motor aqui mudaria o antialiasing de todo PNG da marca.
const ENGINE = 'chromium';

// NODE_PATH não vale para ESM, então o caminho vem por env quando o Playwright não está
// resolvível a partir daqui (o caso normal: ele mora num cache npx, não no Codex).
async function abrirPlaywright() {
  const alt = process.env.BRAND_PLAYWRIGHT;
  for (const spec of [alt && pathToFileURL(path.join(alt, 'playwright', 'index.js')).href, 'playwright'].filter(Boolean)) {
    let mod;
    try { mod = await import(spec); } catch { continue; }
    // Playwright é CommonJS, então dependendo de como o import resolve os motores vêm
    // no topo ou sob .default. Aceitar os dois evita um "undefined.launch()" opaco.
    const engine = mod[ENGINE] || mod.default?.[ENGINE];
    if (engine) return engine;
  }
  throw new Error(
    'brand-raster precisa do Playwright, que NAO e dependencia do Codex.\n' +
    '  Aponte para uma instalacao existente:\n' +
    '    BRAND_PLAYWRIGHT=<dir com node_modules/playwright> node tools/brand-raster.mjs\n' +
    '  Este comando so e necessario quando a MARCA muda; o brand-build.mjs (SVG) nao depende dele.');
}

// Uma linha do manifesto -> os bytes do PNG. A receita é a que reproduziu o arquivo
// existente: viewport no tamanho exato do alvo, deviceScaleFactor 1, fundo omitido
// (estes PNG têm alpha), e o SVG entrando como <img> dimensionado por CSS.
async function rasterizar(page, entry) {
  const svg = emit(entry);
  const alturaVB = Number(svg.match(/viewBox="0 0 (\d+) (\d+)"/)[2]);
  const larguraVB = Number(svg.match(/viewBox="0 0 (\d+) (\d+)"/)[1]);
  const h = Math.round(entry.width * alturaVB / larguraVB);
  const b64 = Buffer.from(svg, 'utf8').toString('base64');
  await page.setViewportSize({ width: entry.width, height: h });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}` +
    `img{display:block;width:${entry.width}px;height:${h}px}</style>` +
    `<img id="i" src="data:image/svg+xml;base64,${b64}">`);
  await page.locator('#i').waitFor();
  return { buf: await page.locator('#i').screenshot({ omitBackground: true }), w: entry.width, h };
}

const check = process.argv.includes('--check');
const engine = await abrirPlaywright();
const browser = await engine.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

const lock = {};
const escritos = [], inalterados = [], mudariam = [], pulados = [];

for (const entry of RASTER_ARTIFACTS) {
  const { buf, w, h } = await rasterizar(page, entry);
  const digest = sha(buf);
  for (const t of entry.targets) {
    const root = repoRoot(t.repo);
    if (!root || !fs.existsSync(root)) { pulados.push(`${t.repo}:${t.path}`); continue; }
    lock[t.path] = { sha256: digest, variant: entry.variant, bg: entry.bg, w, h };
    const dest = path.join(root, t.path);
    const atual = fs.existsSync(dest) ? sha(fs.readFileSync(dest)) : null;
    if (atual === digest) { inalterados.push(t.path); continue; }
    if (check) { mudariam.push(t.path); continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    escritos.push(`${t.path}  ${w}x${h}  ${(buf.length / 1024).toFixed(1)} KB`);
  }
}
await browser.close();

if (!check) fs.writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n', 'utf8');

console.log(`\nbrand-raster ${check ? '--check' : ''}  (motor: ${ENGINE})`);
for (const [rot, lista] of [['escritos', escritos], ['já em sincronia', inalterados], ['MUDARIAM', mudariam], ['pulados', pulados]])
  if (lista.length) console.log(`  ${String(lista.length).padStart(3)}  ${rot}\n` + lista.map(s => '       ' + s).join('\n'));

if (check && mudariam.length) {
  console.error('brand-raster --check: PNG fora de sincronia. Rode sem --check.');
  process.exit(1);
}
