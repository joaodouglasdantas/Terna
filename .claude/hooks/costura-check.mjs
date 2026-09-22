#!/usr/bin/env node
// .claude/hooks/costura-check.mjs (3.5.7) — CHECAGEM ESTATICA DE COSTURA entre tasks/modulos.
//
// Incidente (PRD-144, 16/09/2026 — dra-mariana-duarte, hotfix ab61d802): 61 specs verdes, acceptance verde, SOLO-2
// com 6 sherlocks e michelangelo ✅ — e a feature principal inutilizavel em producao. Quatro defeitos, todos de
// INTEGRACAO, nenhum de logica local: `window.abrirPorTelefoneViaResolver` consumido por um modulo e nunca publicado
// (a task o chamou de "funcao global existente" sem arquivo:linha; os specs criaram a funcao no window como dublê e
// ficaram verdes; o guard `typeof window.X === 'function'` engoliu a ausencia); estado pintado antes do render que o
// recria; mapa de estado so da pagina; cabecalho de modulo com "NAO VERIFICADO — a integrar na TASK-008" mergeado.
// Os gates verificam cada task por dentro; ninguem verificava a costura. Este hook e barato e estatico:
//
//   node .claude/hooks/costura-check.mjs --codigo [--base auto|none|all|<ref>] [--prd PRD-NNN]
//     COSTURA|window-sem-publicacao|<X>|<arquivo:linha>       window.X LIDO em JS de producao tocado, sem `window.X =` em
//                                                              NENHUM JS de producao do repo (o defeito 3 da 144)
//     COSTURA|duble-em-spec|<X>|<spec:linha>                   spec tocado faz `window.X = function/=>` sendo X consumido
//                                                              pelo produto — prova o modulo, esconde a publicacao que falta
//     COSTURA|route-fulfill-endpoint-da-prd|<endpoint>|<spec:linha>  spec de acceptance/gate intercepta endpoint que a
//                                                              propria PRD tocou (o acceptance deixa de provar o backend)
//     COSTURA|marcador-pendencia|<arquivo:linha>|<texto>       "NAO VERIFICADO" / "a integrar na TASK-N" / "TODO TASK-" em
//                                                              arquivo de producao tocado — pendencia de merge, nao comentario
//     COSTURA|typeof-engole|<X>|<arquivo:linha>                guard `if (typeof window.X === 'function')` sem else/aviso em
//                                                              arquivo tocado — dependencia obrigatoria que falha em silencio (info)
//     COSTURA-VEREDITO|ok|<n info>  ·  COSTURA-VEREDITO|bloqueia|<n>|<tipos csv>
//   node .claude/hooks/costura-check.mjs --tasks <pasta das tasks>
//     COSTURA-TASK|nao-provado|<TASK>|<simbolo>|<arquivo:linha>   "Consome: X — existente arquivo:linha" e o arquivo/trecho nao tem X
//     COSTURA-TASK|produtor-nao-declara|<TASK>|<simbolo>|<TASK-N>  "Consome: X — TASK-N" e a TASK-N nao lista X em Produz
//     COSTURA-TASK|consumo-sem-origem|<TASK>|<simbolo>             Consome sem "existente arquivo:linha" nem "TASK-N"
//     COSTURA-TASK|produz-sem-consumidor|<TASK>|<simbolo>          Produz que nenhuma task consome (info)
//     COSTURA-TASK-VEREDITO|ok|<n>  ·  COSTURA-TASK-VEREDITO|bloqueia|<n>|<tipos csv>
// Bloqueia: window-sem-publicacao, duble-em-spec, marcador-pendencia, route-fulfill em spec de acceptance; nao-provado,
// produtor-nao-declara, consumo-sem-origem. Exit 0 sempre (quem decide e o gate: harness-metrics stop, --costura-ok).
// Knobs: HARNESS_GATE_COSTURA (on) · HARNESS_COSTURA_EXCLUIR (csv de pastas extras a ignorar) · HARNESS_MAIN_BRANCH (main).

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { loadHarnessEnv } from './presence.mjs';

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_DIR = path.resolve(HOOKS_DIR, '..');
const ROOT = path.resolve(CLAUDE_DIR, '..');

// propriedades de Window que NAO sao simbolos do app (lidas como window.X sem "publicacao")
const BROWSER_GLOBALS = new Set(('location document navigator console history screen localStorage sessionStorage indexedDB ' +
  'fetch XMLHttpRequest WebSocket Worker Blob File FileReader FormData URL URLSearchParams Headers Request Response ' +
  'setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame requestIdleCallback ' +
  'alert confirm prompt open close print focus blur scroll scrollTo scrollBy scrollX scrollY pageXOffset pageYOffset ' +
  'innerWidth innerHeight outerWidth outerHeight devicePixelRatio matchMedia getComputedStyle getSelection ' +
  'addEventListener removeEventListener dispatchEvent event Event CustomEvent MutationObserver IntersectionObserver ' +
  'ResizeObserver performance crypto Notification speechSynthesis SpeechRecognition webkitSpeechRecognition ' +
  'AudioContext webkitAudioContext Image Audio Option Date Math JSON Promise Map Set Symbol Proxy Reflect Intl ' +
  'Object Array String Number Boolean Error RegExp Function encodeURIComponent decodeURIComponent encodeURI ' +
  'decodeURI parseInt parseFloat isNaN isFinite atob btoa structuredClone queueMicrotask name top parent self frames ' +
  'opener frameElement origin isSecureContext onload onerror onbeforeunload onunload onresize onscroll onpopstate ' +
  'onhashchange onmessage onfocus onblur onkeydown onkeyup onclick visualViewport TextEncoder TextDecoder ' +
  'AbortController DOMParser Node NodeList HTMLElement Element Range getSelection $ jQuery ' +
  // 3.5.7 (varredura /deus 16/09, 16 projetos): APIs/prefixos de navegador que libs detectam por feature-detection
  'ActiveXObject ArrayBuffer CSS CSSMatrix DOMMatrix WebKitCSSMatrix MSCSSMatrix DocumentTouch FileList HTMLCanvasElement ' +
  'MSInputMethodContext MSPointerEvent PointerEvent TouchEvent SVGAngle MozMutationObserver WebKitMutationObserver ' +
  'MozWebSocket XDomainRequest XMLSerializer MediaMetadata clipboardData customElements eval postMessage attachEvent ' +
  'detachEvent opera setImmediate cancelIdleCallback createImageBitmap msCrypto msMatchMedia webkitURL onwheel ' +
  'onmousewheel webkitRequestAnimationFrame mozRequestAnimationFrame msRequestAnimationFrame oRequestAnimationFrame ' +
  'webkitCancelAnimationFrame mozCancelAnimationFrame SVGElement HTMLIFrameElement MediaRecorder ' +
  'CKEDITOR_BASEPATH CKEDITOR_GETURL SCAYT ' +
  // globais de bibliotecas de terceiros carregadas por <script src> (CDN/tema) — a publicacao nao mora no repo
  'Zone Polymer Zepto SockJS Jodit Swal CodeMirror bootstrap JSZip pdfMake Inputmask hljs katex google Globalize').split(/\s+/));
const EXCLUIR_DIRS = new Set(['node_modules', 'vendor', '.git', '.claude', 'dist', 'build', 'coverage', 'docs', 'prds', 'storage', 'cache', 'tmp', 'temp', 'codex-reviews', '.agents', '.codex']);
const SPEC_RE = /\.(spec|test)\.(js|mjs|ts|tsx)$|(^|[\\/])tests?([\\/]|$)|(^|[\\/])e2e([\\/]|$)|(^|[\\/])__tests__([\\/]|$)/i;
const PROD_JS_RE = /\.(js|mjs)$/i;
// lib vendorizada/compilada: suas PUBLICACOES contam (o app le window.X publicado por plugins/), seus CONSUMOS nao
// (feature-detection de terceiro nao e costura do app) — medido 16/09: a maioria dos window-sem-publicacao era isso
const VENDOR_RE = /(^|\/)(plugins|vendor-manual|dompdf|ckeditor|bootstrap)\/|\.(min|bundle)\.m?js$/i;
const MARCADOR_RE = /N[ÃA]O VERIFICADO|a integrar na TASK|TODO TASK-|PENDENTE DE INTEGRA/i;

// maxBuffer: o default (1 MB) estoura em repo grande (newportaltefnet, 27 mil arquivos) e o git "devolvia" vazio
function git(args, cwd = ROOT) { const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); return r.status === 0 ? r.stdout : ''; }
function ehProd(rel) { const partes = rel.replace(/\\/g, '/').split('/'); return !partes.some(p => EXCLUIR_DIRS.has(p)) && !SPEC_RE.test(rel); }
function ehSpec(rel) { const partes = rel.replace(/\\/g, '/').split('/'); return !partes.some(p => EXCLUIR_DIRS.has(p)) && SPEC_RE.test(rel) && /\.(js|mjs|ts|tsx)$/i.test(rel); }
function listarProdJs(raiz, extra = new Set()) { // todos os JS de producao do repo (para as ATRIBUICOES window.X =)
  const out = []; const walk = (d, rel) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) { if (EXCLUIR_DIRS.has(e.name) || extra.has(e.name) || e.name.startsWith('.')) continue; walk(path.join(d, e.name), r); } else if (PROD_JS_RE.test(e.name) && ehProd(r)) out.push(r); } };
  walk(raiz, ''); return out;
}
function listarProdInline(raiz, extra = new Set()) { // php/html/twig/blade de producao (podem ter <script> inline que publica globais)
  const out = []; const walk = (d, rel, prof) => { if (prof > 8) return; let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) { if (EXCLUIR_DIRS.has(e.name) || extra.has(e.name) || e.name.startsWith('.')) continue; walk(path.join(d, e.name), r, prof + 1); } else if (/\.(php|html|htm|twig|blade\.php)$/i.test(e.name) && ehProd(r)) out.push(r); } };
  walk(raiz, '', 0); return out;
}
function ler(rel, raiz = ROOT) { try { return fs.readFileSync(path.join(raiz, rel), 'utf8'); } catch { return ''; } }
// comentarios de BLOCO (/* ... */, inclusive os cabecalhos multi-linha que citam `window.X`) viram espacos preservando as
// quebras de linha (os numeros de linha continuam certos); comentario de linha (//) sai por linha. Medido 16/09 na
// Mariana: 7 dos 8 "window-sem-publicacao" da 1a rodada eram citacoes em comentario.
function semBlocos(t) { return t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')); }
function semComentario(l) { return l.replace(/\/\/.*$/, ''); }

export function resolverBase(base, { raiz = ROOT, main = 'main' } = {}) {
  // none = so o NAO commitado (HEAD); all = o repo INTEIRO (arvore vazia do git) — a varredura unica de adocao usa all
  if (base && base !== 'auto') return base === 'none' ? 'HEAD' : base === 'all' ? '4b825dc642cb6eb9a060e54bf8d69288fbee4904' : base;
  const br = git(['rev-parse', '--abbrev-ref', 'HEAD'], raiz).trim();
  if (/^wt\//.test(br)) { const mb = git(['merge-base', 'HEAD', main], raiz).trim(); if (mb) return mb; }
  // checkout principal: marcador de run com start => commit anterior ao start; senao HEAD (so o nao commitado)
  try { for (const f of fs.readdirSync(path.join(raiz, '.claude', '.harness-run')).filter(f => /-exec\.json$/.test(f))) { const j = JSON.parse(fs.readFileSync(path.join(raiz, '.claude', '.harness-run', f), 'utf8')); if (j.start) { const c = git(['rev-list', '-1', '--before=' + j.start, 'HEAD'], raiz).trim(); if (c) return c; } } } catch {}
  return 'HEAD';
}
export function arquivosTocados(baseRef, raiz = ROOT) {
  const a = git(['diff', '--name-only', baseRef, '--'], raiz).split('\n').map(s => s.trim()).filter(Boolean);
  const b = git(['ls-files', '--others', '--exclude-standard'], raiz).split('\n').map(s => s.trim()).filter(Boolean);
  const c = baseRef === 'HEAD' ? [] : git(['diff', '--name-only', 'HEAD', '--'], raiz).split('\n').map(s => s.trim()).filter(Boolean);
  return [...new Set([...a, ...b, ...c])].filter(rel => fs.existsSync(path.join(raiz, rel)));
}

export function checarCodigo({ raiz = ROOT, base = 'auto', main = 'main', excluir = [], ignorarCsv = [] } = {}) {
  const baseRef = resolverBase(base, { raiz, main });
  const tocados = arquivosTocados(baseRef, raiz);
  const prodTocados = tocados.filter(r => PROD_JS_RE.test(r) && ehProd(r));
  const specsTocados = tocados.filter(ehSpec);
  const prodTocadosTodos = tocados.filter(r => ehProd(r) && !/\.(md|txt|json|lock|png|jpg|svg|css|map)$/i.test(r));
  const achados = [];
  // 1) publicacoes em TODO o codigo de producao do repo: `window.X =`, `window['X'] =`, `Object.assign(window, {X})` e
  //    declaracao de TOPO em script classico (`function X(`, `var/let/const X` na coluna 0 — vira global do window) — em
  //    JS e em <script> inline de php/html/twig/blade.
  const todosProd = listarProdJs(raiz, new Set(excluir));
  const todosInline = listarProdInline(raiz, new Set(excluir));
  const publicados = new Set();
  const lerPublicacoes = (t) => {
    // aliases do window no arquivo: `var raiz = window`, `const g = typeof window !== 'undefined' ? window : globalThis`,
    // IIFE `(function (raiz) { ... })(window)` — medido 16/09 na Mariana: LiderAba e RascunhoClinico sao publicados por alias
    const aliases = new Set(['window', 'globalThis', 'self']);
    for (const m of t.matchAll(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*\b(?:window|globalThis)\b/g)) aliases.add(m[1]);
    // IIFE `(function (raiz) { ... })(window)` / `}(typeof window !== 'undefined' ? window : this))`: o 1o parametro de uma
    // IIFE de topo e alias quando o arquivo invoca com window/globalThis/this em qualquer forma (ternario inclusive)
    if (/\b(?:window|globalThis)\b[^\n]*\)\s*;?\s*$/m.test(t) || /\}\s*\)?\s*\(\s*(?:window|globalThis|this)\b/.test(t)) { for (const m of t.matchAll(/^[!(]\s*function\s*\(\s*([A-Za-z_$][\w$]*)/gm)) aliases.add(m[1]); }
    const al = [...aliases].map(a => a.replace(/\$/g, '\\$')).join('|');
    for (const m of t.matchAll(new RegExp('(?<![\\w$.])(?:' + al + ')(?:\\.([A-Za-z_$][\\w$]*)|\\[\\s*[\'"]([A-Za-z_$][\\w$]*)[\'"]\\s*\\])\\s*=(?!=)', 'g'))) publicados.add(m[1] || m[2]);
    for (const m of t.matchAll(/Object\.assign\(\s*window\s*,\s*\{([^}]*)\}/g)) for (const k of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*[:,}]/g)) publicados.add(k[1]);
    for (const m of t.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) publicados.add(m[1]);
    for (const m of t.matchAll(/^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\b/gm)) publicados.add(m[1]);
  };
  for (const rel of todosProd) lerPublicacoes(ler(rel, raiz));
  for (const rel of todosInline) { const t = ler(rel, raiz); for (const m of t.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) lerPublicacoes(m[1]); }
  // 2) consumos em JS de producao TOCADO — o nome vai ate a fronteira ((?![\w$]) antes do lookahead: sem isso o regex
  //    recuava um caractere em `window.InboxBusca =` e devolvia "InboxBusc" como consumo)
  const consumidosTocados = new Map(); const consumidosTodos = new Set();
  const RE_CONSUMO = /(?<![\w$.])window\.([A-Za-z_$][\w$]*)(?![\w$])(?!\s*=(?!=))/g;
  const ignorar = new Set(ignorarCsv);
  // escape inline: `// costura-ok: <motivo>` na linha do consumo ou na de cima (publicacao dinamica, ex. window[nome + 'Editor'])
  const lerConsumos = (rel, so) => { const t = semBlocos(ler(rel, raiz)); const ls = t.split(/\r?\n/); ls.forEach((l, i) => { const s = semComentario(l); const ok = /costura-ok/i.test(l) || (i > 0 && /costura-ok/i.test(ls[i - 1])); for (const m of s.matchAll(RE_CONSUMO)) { const x = m[1]; if (BROWSER_GLOBALS.has(x) || x.length < 3) continue; consumidosTodos.add(x); if (so && !ok && !ignorar.has(x)) { if (!consumidosTocados.has(x)) consumidosTocados.set(x, `${rel}:${i + 1}`); if (new RegExp('typeof\\s+window\\.' + x.replace(/\$/g, '\\$') + '\\s*===?\\s*[\'"]function[\'"]').test(s) && !/else|console\.(error|warn)/.test(s)) achados.push({ tipo: 'typeof-engole', bloqueia: false, a: x, b: `${rel}:${i + 1}` }); } } }); };
  for (const rel of todosProd) if (!VENDOR_RE.test(rel)) lerConsumos(rel, false);
  for (const rel of prodTocados) if (!VENDOR_RE.test(rel)) lerConsumos(rel, true);
  for (const [x, onde] of consumidosTocados) if (!publicados.has(x)) achados.push({ tipo: 'window-sem-publicacao', bloqueia: true, a: x, b: onde });
  // 3) specs tocados: duble de simbolo consumido pelo produto; route.fulfill de endpoint da PRD
  const endpointsPrd = tocados.filter(r => /\.php$/i.test(r) && ehProd(r)).map(r => path.basename(r));
  for (const rel of specsTocados) {
    const t = semBlocos(ler(rel, raiz)); const acceptance = /acceptance|gate/i.test(rel);
    const lsSpec = t.split(/\r?\n/);
    lsSpec.forEach((l, i) => {
      const s = semComentario(l);
      for (const m of s.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>|\w+\s*=>)/g)) if (consumidosTodos.has(m[1])) achados.push({ tipo: 'duble-em-spec', bloqueia: true, a: m[1], b: `${rel}:${i + 1}` });
      if (/route\.fulfill|page\.route\(|context\.route\(/.test(s)) for (const ep of endpointsPrd) if (s.includes(ep) || (i > 0 && lsSpec.slice(Math.max(0, i - 3), i).join('\n').includes(ep))) achados.push({ tipo: 'route-fulfill-endpoint-da-prd', bloqueia: acceptance, a: ep, b: `${rel}:${i + 1}` });
    });
  }
  // 4) marcadores de pendencia em arquivo de producao tocado
  for (const rel of prodTocadosTodos) { const t = ler(rel, raiz); t.split(/\r?\n/).forEach((l, i) => { if (MARCADOR_RE.test(l)) achados.push({ tipo: 'marcador-pendencia', bloqueia: true, a: `${rel}:${i + 1}`, b: l.trim().slice(0, 100) }); }); }   // marcador vale TAMBEM em comentario (e onde ele mora)
  const dedup = []; const vis = new Set(); for (const a of achados) { const k = a.tipo + '|' + a.a + '|' + a.b; if (!vis.has(k)) { vis.add(k); dedup.push(a); } }
  const bloq = dedup.filter(a => a.bloqueia);
  return { baseRef, tocados: tocados.length, prodTocados: prodTocados.length, specsTocados: specsTocados.length, achados: dedup, bloqueia: bloq.length, tipos: [...new Set(bloq.map(a => a.tipo))] };
}

// ---------------------------------------------------------------- tasks: Produz / Consome
function celula(txt, campo) { return ((txt.match(new RegExp('^\\|\\s*\\*\\*' + campo + '\\*\\*\\s*\\|([^\\n]*)', 'mi')) || [])[1] || '').replace(/\|\s*$/, '').trim(); }
function itens(cel) { return cel.split(/\s*[;·]\s*|\s*\n\s*/).map(s => s.trim()).filter(s => s && !/^(nenhum[ao]?|—|-|n\/a)$/i.test(s)); }
export function checarTasks(dir, raiz = ROOT) {
  const abs = path.resolve(raiz, dir);
  let files = []; try { files = fs.readdirSync(abs).filter(f => /^TASK-\d+[a-z]?.*\.md$/i.test(f)).sort(); } catch {}
  const tasks = files.map(f => { const t = fs.readFileSync(path.join(abs, f), 'utf8'); const id = (f.match(/^(TASK-\d+[a-z]?)/i) || [])[1].toUpperCase(); return { id, f, t, produz: itens(celula(t, 'Produz')), consome: itens(celula(t, 'Consome')), acceptance: /acceptance|gate bloqueante/i.test(t.slice(0, 2500)) }; });
  const achados = []; const produzPor = new Map();
  for (const tk of tasks) for (const p of tk.produz) { const s = p.replace(/\s*[—–-]\s.*$/, '').trim(); produzPor.set(s, tk.id); produzPor.set(s.replace(/^window\./, ''), tk.id); }
  const consumidos = new Set();
  for (const tk of tasks) for (const c of tk.consome) {
    const m = c.match(/^(.*?)\s*[—–-]\s*(.*)$/); const sim = (m ? m[1] : c).trim(); const orig = m ? m[2].trim() : '';
    consumidos.add(sim); consumidos.add(sim.replace(/^window\./, ''));
    const simNu = sim.replace(/^window\./, '').replace(/\(.*$/, '');
    if (/^existente/i.test(orig)) {
      const ref = (orig.match(/([A-Za-z0-9_./-]+\.[a-z]{2,4}):(\d+)/) || []);
      if (!ref[1]) { achados.push({ tipo: 'consumo-sem-origem', bloqueia: true, a: tk.id, b: sim, c: 'existente sem arquivo:linha' }); continue; }
      const txt = ler(ref[1], raiz); if (!txt) { achados.push({ tipo: 'nao-provado', bloqueia: true, a: tk.id, b: sim, c: ref[1] + ':' + ref[2] + ' (arquivo inexistente)' }); continue; }
      const ls = txt.split('\n'); const n = parseInt(ref[2], 10); const janela = ls.slice(Math.max(0, n - 6), n + 5).join('\n');
      if (!janela.includes(simNu)) achados.push({ tipo: 'nao-provado', bloqueia: true, a: tk.id, b: sim, c: ref[1] + ':' + ref[2] });
    } else if (/TASK-\d+/i.test(orig)) {
      const prod = (orig.match(/TASK-\d+[a-z]?/i) || [])[0].toUpperCase();
      if (produzPor.get(sim) !== prod && produzPor.get(simNu) !== prod) achados.push({ tipo: 'produtor-nao-declara', bloqueia: true, a: tk.id, b: sim, c: prod });
    } else achados.push({ tipo: 'consumo-sem-origem', bloqueia: true, a: tk.id, b: sim, c: orig || '(vazio)' });
  }
  for (const tk of tasks) for (const p of tk.produz) { const s = p.replace(/\s*[—–-]\s.*$/, '').trim(); if (!consumidos.has(s) && !consumidos.has(s.replace(/^window\./, ''))) achados.push({ tipo: 'produz-sem-consumidor', bloqueia: false, a: tk.id, b: s, c: '' }); }
  const bloq = achados.filter(a => a.bloqueia);
  return { tasks: tasks.length, comSecao: tasks.filter(t => t.produz.length || t.consome.length).length, achados, bloqueia: bloq.length, tipos: [...new Set(bloq.map(a => a.tipo))] };
}

function isMain() { try { return path.resolve(process.argv[1] || '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); } catch { return false; } }
if (isMain()) {
  const args = process.argv.slice(2);
  const opt = (k, d = '') => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] || '') : d; };
  const raiz = opt('root') ? path.resolve(opt('root')) : ROOT;
  const ENV = loadHarnessEnv(path.join(raiz, '.claude'));   // as camadas do PROJETO inspecionado (HARNESS_COSTURA_IGNORAR e do projeto)
  if (args.includes('--tasks')) {
    const r = checarTasks(opt('tasks'), raiz);
    for (const a of r.achados) console.log(`COSTURA-TASK|${a.tipo}|${a.a}|${a.b}|${a.c}`);
    console.log(r.bloqueia ? `COSTURA-TASK-VEREDITO|bloqueia|${r.bloqueia}|${r.tipos.join(',')}` : `COSTURA-TASK-VEREDITO|ok|${r.achados.length}|tasks=${r.tasks} com-produz-consome=${r.comSecao}`);
    process.exit(0);
  }
  const r = checarCodigo({ raiz, base: opt('base', 'auto'), main: ENV.HARNESS_MAIN_BRANCH || 'main', excluir: (ENV.HARNESS_COSTURA_EXCLUIR || '').split(',').map(s => s.trim()).filter(Boolean), ignorarCsv: (ENV.HARNESS_COSTURA_IGNORAR || '').split(',').map(s => s.trim()).filter(Boolean) });
  if (args.includes('--json')) { console.log(JSON.stringify(r)); process.exit(0); }
  for (const a of r.achados) console.log(`COSTURA|${a.tipo}|${a.a}|${a.b}`);
  console.log(r.bloqueia ? `COSTURA-VEREDITO|bloqueia|${r.bloqueia}|${r.tipos.join(',')}|base=${r.baseRef.slice(0, 12)} tocados=${r.tocados}` : `COSTURA-VEREDITO|ok|${r.achados.length}|base=${r.baseRef.slice(0, 12)} tocados=${r.tocados} js=${r.prodTocados} specs=${r.specsTocados}`);
  process.exit(0);
}
