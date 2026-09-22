#!/usr/bin/env node
// .claude/hooks/harness-env.mjs (3.5.7) — CAMADAS DE CONFIGURACAO: classificacao, origem resolvida e drift.
// E o unico lugar que sabe LER hooks/_camadas.txt e comparar as camadas; o harness-doctor.sh, o harness-sync.sh
// e o harness-ui.mjs consomem este modulo (uma chamada de node por diagnostico — nada de grep por chave: no
// Windows cada processo custa 1-2 s sob carga).
//
// Camadas (ordem de carga; a ultima que define vence; ambiente da sessao vence todas):
//   defaults = hooks/_defaults.env (decisao do harness, versionado)   projeto = .claude/harness.env
//   local    = .claude/harness.env.local                              maquina = ~/.harness.env.local
// Classes (hooks/_camadas.txt): decisao (toda chave de _defaults.env sem linha propria) | projeto | maquina | ambiente.
//
// CLI:
//   node .claude/hooks/harness-env.mjs --doctor [--root <dir>]         linhas CAMADA|... p/ o doctor (ver abaixo)
//   node .claude/hooks/harness-env.mjs --drift <alvo> [--apply] [--backup <dir>]
//                                                                       linhas ENV|... p/ o harness-sync.sh (mestre = este .claude)
//   node .claude/hooks/harness-env.mjs --origem <CHAVE> [--root <dir>]  uma linha: <camada>|<valor>
//   node .claude/hooks/harness-env.mjs --json [--root <dir>]            estado completo (harness-ui.mjs)
// Saida do --doctor:
//   CAMADAS|resumo|decisoes=N|projeto=N|local=N|maquina=N|ambiente=N|obsoletas=N
//   OVERRIDE|<chave>|<camada>|<valor>|default=<v>|esperado|inesperado      (decisao definida fora do defaults)
//   OBSOLETA|<chave>|<camada>                                              (chave que o mestre nao conhece)
//   MAQUINA-VERSIONADA|<chave>|segredo|                                    (chave de maquina no harness.env)
//   PROJETO-AUSENTE|<chave>                                                (chave de projeto obrigatoria ausente)
//   AMBIENTE|<chave>|<valor>                                               (decisao vinda do ambiente da sessao)
// Saida do --drift (alvo):
//   ENV|decisao-no-projeto|<chave>|<arquivo>|igual|<valor>                  migravel (--apply comenta a linha)
//   ENV|decisao-no-projeto|<chave>|<arquivo>|difere|<valor>|default=<v>     override consciente (preservado)
//   ENV|decisao-no-projeto|<chave>|<arquivo>|esperado|<valor>               override em camada onde e esperado
//   ENV|obsoleta|<chave>|<arquivo>          ENV|maquina-versionada|<chave>
//   ENV|migrada|<chave>  ENV|override-preservado|<chave>|<valor>|default=<v>   (so no --apply)
//   ENV|resumo|migraveis=N overrides=N esperados=N obsoletas=N [migradas=N]
// Exit: 0 sempre que conseguiu ler; 2 = uso invalido.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_DIR_SELF = path.resolve(HOOKS_DIR, '..');
const MARCA_MIGRADA = '[3.5.7 migrado: decisao do harness em hooks/_defaults.env]';

// ---------------------------------------------------------------- leitura
function despir(v) {
  v = String(v ?? '').trim();
  const q = v[0];
  if (q === "'" || q === '"') { const j = v.indexOf(q, 1); return j > 0 ? v.slice(1, j) : v.slice(1); }
  return v.replace(/\s+#.*$/, '').trim();
}
export function lerArquivoEnv(file) { // -> { existe, ativos:{k:v}, comentados:{k:v}, linhas:[...] }
  let txt; try { txt = fs.readFileSync(file, 'utf8'); } catch { return { existe: false, ativos: {}, comentados: {}, linhas: [], crlf: false }; }
  const crlf = txt.includes('\r\n');
  const ativos = {}, comentados = {}; const linhas = txt.split(/\r?\n/);
  for (const l of linhas) {
    let m = l.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_a-z]*)=(.*)$/);
    if (m) { ativos[m[1]] = despir(m[2]); continue; }
    m = l.match(/^\s*#\s?(?:export\s+)?([A-Z][A-Z0-9_a-z]*)=(.*)$/);
    if (m && comentados[m[1]] === undefined) comentados[m[1]] = despir(m[2]);
  }
  return { existe: true, ativos, comentados, linhas, crlf };
}
export function lerCamadasTxt(claudeDir) { // -> { exatas: Map, padroes: [[RegExp, entry]] }
  const exatas = new Map(), padroes = [];
  let txt = ''; try { txt = fs.readFileSync(path.join(claudeDir, 'hooks', '_camadas.txt'), 'utf8'); } catch {}
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l.startsWith('#')) continue;
    const [k, camada, perm, obs] = l.split('|').map(s => (s || '').trim());
    if (!k || !camada) continue;
    const e = { camada, permitido: perm ? perm.split(',').map(s => s.trim()).filter(Boolean) : [], obs: obs || '' };
    if (k.includes('*')) padroes.push([new RegExp('^' + k.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), e]);
    else exatas.set(k, e);
  }
  return { exatas, padroes };
}
export function arquivosDasCamadas(claudeDir, home = os.homedir()) {
  return [
    { camada: 'defaults', file: path.join(claudeDir, 'hooks', '_defaults.env'), rel: '.claude/hooks/_defaults.env' },
    { camada: 'projeto', file: path.join(claudeDir, 'harness.env'), rel: '.claude/harness.env' },
    { camada: 'local', file: path.join(claudeDir, 'harness.env.local'), rel: '.claude/harness.env.local' },
    { camada: 'maquina', file: path.join(home, '.harness.env.local'), rel: '~/.harness.env.local' },
  ];
}

// ---------------------------------------------------------------- classificacao
// classe de uma chave: linha exata > padrao > (esta no defaults => decisao) > desconhecida
export function classificar(chave, camadas, defaults) {
  const e = camadas.exatas.get(chave) || (camadas.padroes.find(([re]) => re.test(chave)) || [])[1];
  if (e) return { classe: e.camada, permitido: e.permitido, obs: e.obs };
  if (defaults && Object.prototype.hasOwnProperty.call(defaults, chave)) return { classe: 'decisao', permitido: [], obs: '' };
  return { classe: 'desconhecida', permitido: [], obs: '' };
}

// ---------------------------------------------------------------- resolucao (doctor / ui)
// mestreDir = onde estao _defaults.env e _camadas.txt (normalmente o proprio claudeDir; o sync passa o mestre)
export function resolver(claudeDir, { home = os.homedir(), env = process.env, mestreDir = claudeDir } = {}) {
  const camadas = lerCamadasTxt(mestreDir);
  const arqs = arquivosDasCamadas(claudeDir, home);
  const defaultsArq = lerArquivoEnv(path.join(mestreDir, 'hooks', '_defaults.env'));
  const defaults = defaultsArq.ativos;
  const lidos = arqs.map(a => ({ ...a, ...lerArquivoEnv(a.camada === 'defaults' ? path.join(mestreDir, 'hooks', '_defaults.env') : a.file) }));
  const chaves = {};   // chave -> { valor, origem, default, classe, permitido, obs, definidaEm:[camada], override, esperado }
  const contagem = { decisoes: 0, projeto: 0, local: 0, maquina: 0, ambiente: 0, obsoletas: 0 };
  for (const a of lidos) for (const [k, v] of Object.entries(a.ativos)) {
    const c = chaves[k] || (chaves[k] = { valor: undefined, origem: 'codigo', default: defaults[k], definidaEm: [], ...classificar(k, camadas, defaults) });
    c.valor = v; c.origem = a.camada; c.definidaEm.push(a.camada);
  }
  // ambiente vence
  const ambienteChaves = [];
  for (const k of Object.keys(env)) {
    if (!/^(HARNESS_|OPENROUTER_API_KEY$|ANTHROPIC_API_KEY$)/.test(k) || /^HARNESS_ENV_/.test(k)) continue;
    const c = chaves[k] || (chaves[k] = { valor: undefined, origem: 'codigo', default: defaults[k], definidaEm: [], ...classificar(k, camadas, defaults) });
    c.valor = env[k]; c.origem = 'ambiente'; c.definidaEm.push('ambiente'); ambienteChaves.push(k);
  }
  const overrides = [], obsoletas = [], maquinaVersionada = [], projetoAusente = [], ambiente = [];
  for (const [k, c] of Object.entries(chaves)) {
    if (c.classe === 'decisao') contagem.decisoes++;
    const foraDoDefaults = c.definidaEm.filter(x => x !== 'defaults');
    if (c.classe === 'decisao') {
      for (const cam of foraDoDefaults) {
        if (cam === 'ambiente') { ambiente.push({ chave: k, valor: c.valor }); continue; }
        const esperado = c.permitido.includes(cam);
        const valorNaCamada = lidos.find(a => a.camada === cam).ativos[k];
        overrides.push({ chave: k, camada: cam, valor: valorNaCamada, default: c.default, esperado, igual: valorNaCamada === c.default });
        contagem[cam]++;
      }
      c.override = foraDoDefaults.length > 0;
    } else if (c.classe === 'desconhecida') {
      for (const cam of foraDoDefaults) if (cam !== 'ambiente') { obsoletas.push({ chave: k, camada: cam }); contagem.obsoletas++; }
    } else if (c.classe === 'maquina') {
      if (c.definidaEm.includes('projeto')) maquinaVersionada.push({ chave: k, segredo: c.obs === 'segredo' });
      for (const cam of foraDoDefaults) if (cam !== 'ambiente' && cam !== 'projeto') contagem[cam]++;
    } else if (c.classe === 'projeto') {
      if (c.definidaEm.includes('projeto')) contagem.projeto++;
    }
  }
  // chaves de projeto obrigatorias
  for (const [k, e] of camadas.exatas) if (e.camada === 'projeto' && e.obs === 'obrig' && !(chaves[k] && chaves[k].definidaEm.includes('projeto'))) projetoAusente.push(k);
  contagem.ambiente = ambienteChaves.length;
  return { claudeDir, mestreDir, defaultsExiste: defaultsArq.existe, camadasExiste: camadas.exatas.size > 0, arquivos: lidos.map(a => ({ camada: a.camada, file: a.file, existe: a.existe })), chaves, defaults, overrides, obsoletas, maquinaVersionada, projetoAusente, ambiente, contagem };
}

// Chaves de PROJETO que o sync PREENCHE a partir do ~/.harness.env.local da maquina quando o projeto esta vazio
// (decisao do Charles, 16/09/2026: a chave do OpenRouter e do projeto e viaja pelo repositorio; a pessoal da
// maquina alimenta os projetos dele no /deus). Linha: ENV|preenchida|<chave>|origem=~/.harness.env.local
export const PREENCHER_DA_MAQUINA = ['OPENROUTER_API_KEY'];

// ---------------------------------------------------------------- drift (sync)
// Compara o harness.env (+ .local) do ALVO com o _defaults.env/_camadas.txt do MESTRE.
export function drift(mestreClaudeDir, alvoClaudeDir, { apply = false, backupDir = '', home = os.homedir() } = {}) {
  const camadas = lerCamadasTxt(mestreClaudeDir);
  const defaults = lerArquivoEnv(path.join(mestreClaudeDir, 'hooks', '_defaults.env')).ativos;
  const linhas = []; let migraveis = 0, overrides = 0, esperados = 0, obsoletas = 0, migradas = 0, maquinaVers = 0;
  // preenchimento a partir da maquina: projeto sem a chave (ou vazia) + ~/.harness.env.local com valor
  const maq = lerArquivoEnv(path.join(home, '.harness.env.local')).ativos;
  const projAtual = lerArquivoEnv(path.join(alvoClaudeDir, 'harness.env'));
  const preencher = PREENCHER_DA_MAQUINA.filter(k => maq[k] && !projAtual.ativos[k] && projAtual.existe);
  for (const k of preencher) { linhas.push(`ENV|chave-vazia|${k}|.claude/harness.env|maquina-tem`); migraveis++; }
  const alvos = [['.claude/harness.env', 'projeto', path.join(alvoClaudeDir, 'harness.env')], ['.claude/harness.env.local', 'local', path.join(alvoClaudeDir, 'harness.env.local')]];
  const migrar = new Set();
  for (const [rel, cam, file] of alvos) {
    const a = lerArquivoEnv(file); if (!a.existe) continue;
    for (const [k, v] of Object.entries(a.ativos)) {
      const cls = classificar(k, camadas, defaults);
      if (cls.classe === 'decisao') {
        if (cls.permitido.includes(cam) && v !== defaults[k]) { linhas.push(`ENV|decisao-no-projeto|${k}|${rel}|esperado|${v}`); esperados++; continue; }
        if (v === defaults[k]) { linhas.push(`ENV|decisao-no-projeto|${k}|${rel}|igual|${v}`); if (cam === 'projeto') { migraveis++; migrar.add(k); } }
        else { linhas.push(`ENV|decisao-no-projeto|${k}|${rel}|difere|${v}|default=${defaults[k] ?? ''}`); overrides++; }
      } else if (cls.classe === 'desconhecida') { linhas.push(`ENV|obsoleta|${k}|${rel}`); obsoletas++; }
      else if (cls.classe === 'maquina' && cam === 'projeto') { linhas.push(`ENV|maquina-versionada|${k}`); maquinaVers++; }
    }
  }
  if (apply && (migrar.size || preencher.length)) {
    const file = path.join(alvoClaudeDir, 'harness.env');
    const a = lerArquivoEnv(file);
    if (backupDir) { try { const bk = path.join(backupDir, '.claude', 'harness.env'); fs.mkdirSync(path.dirname(bk), { recursive: true }); fs.copyFileSync(file, bk); } catch {} }
    const citar = (v) => v.includes("'") ? `"${v.replace(/(["$`\\])/g, '\\$1')}"` : `'${v}'`;
    const pendentes = new Set(preencher);
    let out = a.linhas.map(l => {
      const m = l.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_a-z]*)=(.*)$/);
      if (m && migrar.has(m[1])) { migradas++; return `# ${MARCA_MIGRADA} ${l.trim()}`; }
      if (m && pendentes.has(m[1])) { pendentes.delete(m[1]); return `${m[1]}=${citar(maq[m[1]])}`; }          // linha ativa vazia
      const c = l.match(/^\s*#\s?(?:export\s+)?([A-Z][A-Z0-9_a-z]*)=(.*)$/);
      if (c && pendentes.has(c[1])) { pendentes.delete(c[1]); return `${c[1]}=${citar(maq[c[1]])}`; }          // linha comentada
      return l;
    });
    for (const k of pendentes) { while (out.length && out[out.length - 1].trim() === '') out.pop(); out.push('', `# ${k} — chave de PROJETO (3.5.7): preenchida pelo harness-sync a partir do ~/.harness.env.local desta maquina; viaja pelo repo.`, `${k}=${citar(maq[k])}`, ''); }
    const eol = a.crlf ? '\r\n' : '\n';
    const tmp = file + '.tmp-sync'; fs.writeFileSync(tmp, out.join(eol)); fs.renameSync(tmp, file);
    for (const k of migrar) linhas.push(`ENV|migrada|${k}`);
    for (const k of preencher) linhas.push(`ENV|preenchida|${k}|origem=~/.harness.env.local`);
    for (const l of [...linhas]) { const m = l.match(/^ENV\|decisao-no-projeto\|([^|]+)\|\.claude\/harness\.env\|difere\|([^|]*)\|default=(.*)$/); if (m) linhas.push(`ENV|override-preservado|${m[1]}|${m[2]}|default=${m[3]}`); }
  }
  linhas.push(`ENV|resumo|migraveis=${migraveis} overrides=${overrides} esperados=${esperados} obsoletas=${obsoletas}${maquinaVers ? ` maquina-versionada=${maquinaVers}` : ''}${apply ? ` migradas=${migradas}` : ''}`);
  return { linhas, migraveis, overrides, esperados, obsoletas, migradas };
}

// ---------------------------------------------------------------- CLI
function isMain() { try { return path.resolve(process.argv[1] || '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); } catch { return false; } }
if (isMain()) {
  const args = process.argv.slice(2);
  const opt = (k, d = '') => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] || '') : d; };
  const root = opt('root', ''); const claudeDir = root ? path.join(path.resolve(root), '.claude') : CLAUDE_DIR_SELF;
  if (args.includes('--doctor')) {
    const r = resolver(claudeDir);
    const c = r.contagem;
    console.log(`CAMADAS|resumo|decisoes=${c.decisoes}|projeto=${c.projeto}|local=${c.local}|maquina=${c.maquina}|ambiente=${c.ambiente}|obsoletas=${c.obsoletas}|defaults=${r.defaultsExiste ? 'ok' : 'ausente'}|camadas=${r.camadasExiste ? 'ok' : 'ausente'}`);
    for (const o of r.overrides) console.log(`OVERRIDE|${o.chave}|${o.camada}|${o.valor}|default=${o.default ?? ''}|${o.esperado ? 'esperado' : 'inesperado'}${o.igual ? '|igual' : ''}`);
    for (const o of r.obsoletas) console.log(`OBSOLETA|${o.chave}|${o.camada}`);
    for (const o of r.maquinaVersionada) console.log(`MAQUINA-VERSIONADA|${o.chave}|${o.segredo ? 'segredo' : ''}|`);
    for (const k of r.projetoAusente) console.log(`PROJETO-AUSENTE|${k}`);
    for (const o of r.ambiente) console.log(`AMBIENTE|${o.chave}|${o.valor}`);
    process.exit(0);
  }
  if (args.includes('--drift')) {
    const alvo = opt('drift'); if (!alvo || !fs.existsSync(alvo)) { console.error('uso: --drift <dir-alvo> [--apply] [--backup <dir>]'); process.exit(2); }
    const r = drift(CLAUDE_DIR_SELF, path.join(path.resolve(alvo), '.claude'), { apply: args.includes('--apply'), backupDir: opt('backup', '') });
    for (const l of r.linhas) console.log(l);
    process.exit(0);
  }
  if (args.includes('--origem')) {
    const k = opt('origem'); const r = resolver(claudeDir); const c = r.chaves[k];
    console.log(c ? `${c.origem}|${c.valor ?? ''}` : `codigo|`); process.exit(0);
  }
  if (args.includes('--json')) { console.log(JSON.stringify(resolver(claudeDir), null, 1)); process.exit(0); }
  console.error('uso: harness-env.mjs --doctor | --drift <alvo> [--apply] | --origem <CHAVE> | --json  [--root <dir>]'); process.exit(2);
}
