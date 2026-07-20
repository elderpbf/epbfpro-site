// codex/tools/brand-build.mjs — o comando único do track-47.
//
//   node tools/brand-build.mjs                 escreve todo artefato de marca
//   node tools/brand-build.mjs --check         não escreve, sai 1 se algo mudaria
//   node tools/brand-build.mjs --only=site     restringe a um ou mais repos
//
// O --only não é conforto: os repos consumidores são clones COMPARTILHADOS entre
// sessões paralelas, e escrever num clone cuja árvore está suja mistura o seu artefato
// com trabalho não-commitado de outra pessoa (AGENTS.md -> Deployment, regra 4).
//
// Uma mudança de marca (cor, traçado, tagline) se faz UMA vez em js/brand-logos.js
// e chega em toda superfície rodando isto. Nenhum .svg é editado à mão: os arquivos
// são SAÍDA, e o tests/brand-sync.test.mjs é o portão que prova que continuam sendo.
//
// Não tem dependência: o Codex não tem build step nem node_modules (CLAUDE.md ->
// Conventions), então isto é node puro e roda de qualquer lugar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACTS, RASTER_ARTIFACTS, UNBUILT_VARIANTS, REPOS, emit } from './brand-manifest.js';

const CODEX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(CODEX, '..');

// Onde cada repo consumidor mora nesta máquina. O `site` é aqui; os outros são
// resolvidos por convenção e sobrescrevíveis por env, porque um clone fora da Drive
// não tem caminho fixo. Um repo que não existir é PULADO com aviso, nunca em silêncio.
const ROOTS = {
  site: SITE,
  backstage: process.env.BRAND_BACKSTAGE_ROOT || path.resolve(SITE, '../backstage'),
  brand: process.env.BRAND_PROJECT_ROOT || null
};

const check = process.argv.includes('--check');
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice(7).split(',')) : null;
for (const r of only || []) if (!(r in REPOS)) throw new Error(`--only: repo desconhecido "${r}" (conhecidos: ${Object.keys(REPOS).join(', ')})`);
const escritos = [];
const inalterados = [];
const mudariam = [];
const pulados = [];

function alvo(t) {
  if (only && !only.has(t.repo)) { pulados.push(`${t.repo}:${t.path}  (fora do --only)`); return null; }
  const root = ROOTS[t.repo];
  if (!root || !fs.existsSync(root)) {
    pulados.push(`${t.repo}:${t.path}  (raiz do repo não encontrada: ${root || 'não configurada'})`);
    return null;
  }
  return path.join(root, t.path);
}

for (const a of ARTIFACTS) {
  const bytes = emit(a);
  for (const t of a.targets) {
    const dest = alvo(t);
    if (!dest) continue;
    const atual = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8').replace(/\r\n/g, '\n') : null;
    if (atual === bytes) { inalterados.push(`${t.repo}:${t.path}`); continue; }
    if (check) { mudariam.push(`${t.repo}:${t.path}`); continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes, 'utf8');
    escritos.push(`${t.repo}:${t.path}`);
  }
}

const linha = (n, txt) => `  ${String(n).padStart(3)}  ${txt}`;
console.log(`\nbrand-build ${check ? '--check' : ''}`);
if (escritos.length) console.log(linha(escritos.length, 'escritos') + '\n' + escritos.map(s => '       ' + s).join('\n'));
if (inalterados.length) console.log(linha(inalterados.length, 'já em sincronia'));
if (mudariam.length) console.log(linha(mudariam.length, 'MUDARIAM') + '\n' + mudariam.map(s => '       ' + s).join('\n'));
if (pulados.length) console.log(linha(pulados.length, 'pulados') + '\n' + pulados.map(s => '       ' + s).join('\n'));

// Rule 7, fail loud: o que este comando ainda NÃO emite sai no relatório sempre, para
// "rodei o build" nunca ser confundido com "toda a marca está coberta".
console.log(
  `\n  ainda FORA deste comando:\n` +
  `    ${UNBUILT_VARIANTS.length}x variante sem builder no gerador: ${UNBUILT_VARIANTS.join(', ')}\n` +
  `    ${RASTER_ARTIFACTS.length}x PNG (precisa de Chrome headless)\n`);

if (check && mudariam.length) {
  console.error('brand-build --check: artefato fora de sincronia. Rode sem --check.');
  process.exit(1);
}
