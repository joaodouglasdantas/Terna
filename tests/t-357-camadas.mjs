#!/usr/bin/env node
// tests/t-357-camadas.mjs — bateria da 3.5.7: CAMADAS DE CONFIGURACAO (nenhuma decisao do harness em variavel local) +
// as cinco melhorias de performance (E6 frentes por sessao viva, E5 commit por task, E7 node_modules na worktree,
// grafo de dependencias, review SOLO-2 por parte). Roda em SANDBOX proprio (os.tmpdir()), nunca toca o projeto real.
//   node tests/t-357-camadas.mjs
//
// O que prova (mecanico):
//   T1  _env.sh: ordem defaults -> projeto -> local -> maquina, AMBIENTE vence; harness_env_origem por chave.
//   T2  paridade bash x mjs: o mapa HARNESS_* carregado por hooks/_env.sh e por presence.mjs loadHarnessEnv e IDENTICO.
//   T3  decisao so no _defaults.env chega ao projeto: harness-duelo --pool origem=defaults; HARNESS_DUELO_TIMEOUT=300 sem linha local.
//   T4  override local acusa: ~/.harness.env.local com decisao => OVERRIDE|...|inesperado; VERBOSITY no projeto => esperado.
//   T5  chave obsoleta acusa (harness-env.mjs --doctor OBSOLETA e sync ENV|obsoleta).
//   T6  harness-sync: ENV|decisao-no-projeto igual/difere; --apply COMENTA a igual (marcador) e PRESERVA a diferente; exit 10 -> resumo migraveis=0.
//   T7  segredo versionado: OPENROUTER_API_KEY no harness.env => MAQUINA-VERSIONADA|segredo + sync ENV|maquina-versionada.
//   T8  teste do mestre: todo default em CODIGO (${K:-v} bash / ENV.K || 'v' mjs) de chave presente no _defaults.env e IGUAL ao declarado.
//   T9  harness-doctor.sh: grupo "Camadas de configuracao" — OK da origem, WARN do override inesperado, FALTA do segredo versionado.
//   T10 harness-ui: /api/state expoe envResolvido/envOrigem (decisao vem de defaults) — via montarEstado por HTTP.
//   T11 estatico: nenhum hook .sh carrega harness.env por conta propria (todos sourceiam _env.sh); mjs usam loadHarnessEnv.
//   T12 estatico: harness.env do mestre so tem chaves de PROJETO; _defaults.env so tem DECISOES (classificacao de _camadas.txt).
//   T13 frentes (E6): slot velho de sessao MORTA cai; de sessao VIVA fica (sessao-viva-sem-heartbeat); teto absoluto derruba.
//   T14 guard-agent (E6): Agent NAO-executor (sherlock) com run viva renova o heartbeat do slot.
//   T15 guard-agent --post (E5): task ✅ da run sem commit que a cite => aviso [commit] (so em branch wt/*; na main silencio).
//   T16 worktree doctor + harness-doctor (E7): @playwright/test declarado e ausente => DOCTOR|node_modules-ausente / [WARN].
//   T17 task-grafo: profundidade/largura/fator/caminho critico; faixa TASK-001..003 expande; prosa apos " — " nao vira aresta; ciclo nao trava.
//   T18 task-packet --check imprime GRAFO|... e GRAFO-VEREDITO.
//   T19 skills: /prd-exec traz "4a. COMMIT POR TASK" e "SOLO-2 com packet em N partes (3.5.7)"; /prd traz "Grafo de dependencias (3.5.7)".

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawnSync, spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-357-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), CL = path.join(PROJ, '.claude'), HOOKS = path.join(CL, 'hooks');
const RUN = path.join(CL, '.harness-run');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };
for (const k of Object.keys(ENVB)) if (/^HARNESS_|^OPENROUTER_API_KEY$/.test(k)) delete ENVB[k];   // ambiente limpo: as camadas mandam

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(PROJ, { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude'), CL, { recursive: true, filter: (src) => !/[\\/]\.harness-run([\\/]|$)|[\\/]rag([\\/]|$)/.test(src) });
fs.rmSync(path.join(CL, 'harness-role'), { force: true });
fs.rmSync(path.join(CL, 'harness.env.local'), { force: true });
fs.mkdirSync(RUN, { recursive: true }); fs.writeFileSync(path.join(RUN, '.gitignore'), '*\n');
fs.mkdirSync(path.join(PROJ, 'prds', 'debito_tecnico'), { recursive: true }); fs.writeFileSync(path.join(PROJ, 'prds', 'debito_tecnico', 'INDEX.md'), '# DTs\n');
fs.writeFileSync(path.join(PROJ, '.gitignore'), '.claude/.harness-run/\n.claude/harness.env.local\nnode_modules/\n');
const git = (args, cwd = PROJ) => spawnSync('git', args, { cwd, encoding: 'utf8', env: ENVB });
git(['init', '-q', '-b', 'main']); git(['config', 'user.email', 't@t']); git(['config', 'user.name', 't']); git(['add', '.']); git(['commit', '-q', '-m', 'base']);

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 700)); } };
const sh = (file, args, input, env = {}, cwd = PROJ) => spawnSync('bash', [path.isAbsolute(file) ? file : path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd, env: { ...ENVB, ...env } });
const nodeRun = (file, args, env = {}, cwd = PROJ) => spawnSync(process.execPath, [path.isAbsolute(file) ? file : path.join(HOOKS, file), ...args], { encoding: 'utf8', cwd, env: { ...ENVB, ...env } });
const bashC = (cmd, env = {}, cwd = PROJ) => spawnSync('bash', ['-c', cmd], { encoding: 'utf8', cwd, env: { ...ENVB, ...env } });
const escreverEnv = (txt) => fs.writeFileSync(path.join(CL, 'harness.env'), txt);
const escreverLocal = (txt) => { if (txt == null) fs.rmSync(path.join(CL, 'harness.env.local'), { force: true }); else fs.writeFileSync(path.join(CL, 'harness.env.local'), txt); };
const escreverHome = (txt) => { if (txt == null) fs.rmSync(path.join(HOME, '.harness.env.local'), { force: true }); else fs.writeFileSync(path.join(HOME, '.harness.env.local'), txt); };
const ENV_MIN = "HARNESS_VERSION='3.5.7'\nHARNESS_TARGETS='claude'\nHARNESS_RAG_ENABLED='0'\nHARNESS_WT_DB='off'\n";
const defaults = Object.fromEntries([...fs.readFileSync(path.join(HOOKS, '_defaults.env'), 'utf8').matchAll(/^([A-Z][A-Z0-9_a-z]*)='([^']*)'$/gm)].map(m => [m[1], m[2]]));

// ---------------------------------------------------------------- T1
console.log('== T1 _env.sh: ordem das camadas e ambiente vence ==');
escreverEnv(ENV_MIN + "HARNESS_RAG_TOPK='7'\n");
escreverLocal("HARNESS_DUELO_TIMEOUT='111'\n");
escreverHome("HARNESS_PW_RUNS_MAX='9'\nHARNESS_DUELO_JUIZ='openrouter'\n");
let r = bashC(`. "${HOOKS.replace(/\\/g, '/')}/_env.sh"; printf '%s|%s|%s|%s|%s|%s\\n' "$HARNESS_RAG_TOPK" "$HARNESS_DUELO_TIMEOUT" "$HARNESS_PW_RUNS_MAX" "$HARNESS_GUARD_PW" "$HARNESS_DUELO_REASONING" "$HARNESS_DUELO_JUIZ"; printf '%s|%s|%s|%s|%s|%s\\n' "$(harness_env_origem HARNESS_RAG_TOPK)" "$(harness_env_origem HARNESS_DUELO_TIMEOUT)" "$(harness_env_origem HARNESS_PW_RUNS_MAX)" "$(harness_env_origem HARNESS_GUARD_PW)" "$(harness_env_origem HARNESS_DUELO_REASONING)" "$(harness_env_origem HARNESS_XYZ_NAO_EXISTE)"`, { HARNESS_GUARD_PW: 'off' });
let [vals, oris] = r.stdout.trim().split('\n');
ok('valores: projeto 7 · local 111 · maquina 9 · ambiente off · defaults low · maquina openrouter', vals === `7|111|9|off|${defaults.HARNESS_DUELO_REASONING}|openrouter`, r.stdout + r.stderr);
ok('origens: projeto|local|maquina|ambiente|defaults|codigo', oris === 'projeto|local|maquina|ambiente|defaults|codigo', r.stdout + r.stderr);
r = bashC(`. "${HOOKS.replace(/\\/g, '/')}/_env.sh"; printf '%s' "$HARNESS_DUELO_TIMEOUT"`, { HARNESS_DUELO_TIMEOUT: '5' });
ok('ambiente vence ate o ~/.harness.env.local (HARNESS_DUELO_TIMEOUT=5 no env)', r.stdout === '5', r.stdout);

// ---------------------------------------------------------------- T2
console.log('== T2 paridade bash x mjs ==');
r = bashC(`. "${HOOKS.replace(/\\/g, '/')}/_env.sh"; for v in \${!HARNESS_*}; do case "$v" in HARNESS_ENV_*) continue;; esac; printf '%s=%s\\n' "$v" "\${!v}"; done | sort`, { HARNESS_GUARD_PW: 'off' });
const mapaBash = r.stdout.trim().split('\n').filter(Boolean);
const js = `import { loadHarnessEnv } from ${JSON.stringify(pathToFileURL(path.join(HOOKS, 'presence.mjs')).href)}; const e = loadHarnessEnv(${JSON.stringify(CL)}); console.log(Object.keys(e).filter(k => /^HARNESS_/.test(k) && !/^HARNESS_ENV_/.test(k)).sort().map(k => k + '=' + e[k]).join('\\n'));`;
r = spawnSync(process.execPath, ['--input-type=module', '-e', js], { encoding: 'utf8', env: { ...ENVB, HARNESS_GUARD_PW: 'off' } });
const mapaNode = r.stdout.trim().split('\n').filter(Boolean);
const dif = mapaBash.filter(l => !mapaNode.includes(l)).concat(mapaNode.filter(l => !mapaBash.includes(l)));
ok(`mapa HARNESS_* identico em bash e mjs (${mapaBash.length} chaves; env vence nos dois)`, mapaBash.length > 150 && dif.length === 0, 'diferencas: ' + dif.slice(0, 8).join(' ; ') + ' | bash=' + mapaBash.length + ' node=' + mapaNode.length + ' ' + r.stderr.slice(0, 200));

// ---------------------------------------------------------------- T3
console.log('== T3 decisao so no defaults chega ao projeto ==');
escreverEnv(ENV_MIN); escreverLocal(null); escreverHome(null);
r = sh('harness-duelo.sh', ['--pool'], '');
ok('harness-duelo --pool: pool do _defaults.env, origem=defaults', /^POOL\|deepseek\/deepseek-v4-flash-0731,google\/gemini-3\.8-flash\|[^|]*\|origem=defaults/m.test(r.stdout), r.stdout + r.stderr.slice(0, 200));
r = nodeRun('harness-env.mjs', ['--origem', 'HARNESS_DUELO_TIMEOUT', '--root', PROJ]);
ok('harness-env --origem HARNESS_DUELO_TIMEOUT => defaults|300 (sem linha no projeto)', r.stdout.trim() === 'defaults|300', r.stdout);
r = bashC(`. "${HOOKS.replace(/\\/g, '/')}/_env.sh"; printf '%s|%s|%s' "$HARNESS_DUELO_TIMEOUT" "$HARNESS_TASK_MAX_LINHAS" "$HARNESS_OLLAMA_MODEL"`);
ok('bash: DUELO_TIMEOUT=300 · TASK_MAX_LINHAS=230 · OLLAMA_MODEL=auto (os defaults que o codigo tinha diferente)', r.stdout === '300|230|auto', r.stdout);

// ---------------------------------------------------------------- T4
console.log('== T4 override local acusa; override esperado nao ==');
escreverEnv(ENV_MIN + "HARNESS_VERBOSITY='minimo'\n");
escreverHome("HARNESS_DUELO_SUPLENTES='x/y'\nHARNESS_OLLAMA_MODEL='qwen3-coder:30b'\n");
r = nodeRun('harness-env.mjs', ['--doctor', '--root', PROJ]);
ok('OVERRIDE|HARNESS_DUELO_SUPLENTES|maquina|x/y|default=...|inesperado', /^OVERRIDE\|HARNESS_DUELO_SUPLENTES\|maquina\|x\/y\|default=[^|]*\|inesperado/m.test(r.stdout), r.stdout);
ok('OVERRIDE|HARNESS_OLLAMA_MODEL|maquina|...|esperado (permitido em _camadas.txt)', /^OVERRIDE\|HARNESS_OLLAMA_MODEL\|maquina\|qwen3-coder:30b\|[^|]*\|esperado/m.test(r.stdout), r.stdout);
ok('OVERRIDE|HARNESS_VERBOSITY|projeto|minimo|...|esperado', /^OVERRIDE\|HARNESS_VERBOSITY\|projeto\|minimo\|[^|]*\|esperado/m.test(r.stdout), r.stdout);
ok('CAMADAS|resumo conta decisoes>150, projeto e maquina', /^CAMADAS\|resumo\|decisoes=(1[5-9]\d|[2-9]\d\d)\|projeto=\d+\|local=0\|maquina=2\|/m.test(r.stdout), r.stdout.split('\n')[0]);

// ---------------------------------------------------------------- T5
console.log('== T5 obsoleta acusa ==');
escreverEnv(ENV_MIN + "HARNESS_FOO_ANTIGA='1'\n"); escreverHome(null);
r = nodeRun('harness-env.mjs', ['--doctor', '--root', PROJ]);
ok('OBSOLETA|HARNESS_FOO_ANTIGA|projeto', /^OBSOLETA\|HARNESS_FOO_ANTIGA\|projeto$/m.test(r.stdout), r.stdout);
ok('chave de ambiente (HARNESS_SKIP_LINT) e de projeto (HARNESS_RAG_ENABLED) nao sao obsoletas', !/OBSOLETA\|HARNESS_(SKIP_LINT|RAG_ENABLED|VERSION)/.test(r.stdout), r.stdout);

// ---------------------------------------------------------------- T6
console.log('== T6 harness-sync: drift e migracao ==');
escreverEnv(ENV_MIN + "HARNESS_GUARD_BASH='1'\nHARNESS_PIPELINE_MAX_VIVOS='2'\nHARNESS_FOO_ANTIGA='1'\n");
const SYNC = path.join(MASTER, '.claude', 'harness-sync.sh');
r = sh(SYNC, ['--check', PROJ], '');
ok('--check: ENV|decisao-no-projeto|HARNESS_GUARD_BASH|.claude/harness.env|igual|1', /^ENV\|decisao-no-projeto\|HARNESS_GUARD_BASH\|\.claude\/harness\.env\|igual\|1$/m.test(r.stdout), r.stdout.split('\n').filter(l => l.startsWith('ENV|')).join('\n'));
ok('--check: ENV|decisao-no-projeto|HARNESS_PIPELINE_MAX_VIVOS|...|difere|2|default=4', /^ENV\|decisao-no-projeto\|HARNESS_PIPELINE_MAX_VIVOS\|\.claude\/harness\.env\|difere\|2\|default=4$/m.test(r.stdout), r.stdout);
ok('--check: ENV|obsoleta|HARNESS_FOO_ANTIGA e ENV|resumo|migraveis=1 overrides=1 ... obsoletas=1; exit 10', /^ENV\|obsoleta\|HARNESS_FOO_ANTIGA\|/m.test(r.stdout) && /^ENV\|resumo\|migraveis=1 overrides=1 esperados=0 obsoletas=1/m.test(r.stdout) && r.status === 10, `${r.status} ` + r.stdout);
r = sh(SYNC, ['--dry-run', PROJ], '');
ok('--dry-run anuncia COPIARIA|.claude/harness.env (1 chave(s)...)', /^COPIARIA\|\.claude\/harness\.env \(1 chave/m.test(r.stdout), r.stdout);
r = sh(SYNC, ['--apply', PROJ], '');
const envDepois = fs.readFileSync(path.join(CL, 'harness.env'), 'utf8');
ok('--apply: ENV|migrada|HARNESS_GUARD_BASH e linha comentada com marcador [3.5.7 migrado...]', /^ENV\|migrada\|HARNESS_GUARD_BASH$/m.test(r.stdout) && /^# \[3\.5\.7 migrado: decisao do harness em hooks\/_defaults\.env\] HARNESS_GUARD_BASH='1'$/m.test(envDepois), r.stdout + '\n' + envDepois);
ok('--apply: HARNESS_PIPELINE_MAX_VIVOS=2 PRESERVADO ativo + ENV|override-preservado', /^HARNESS_PIPELINE_MAX_VIVOS='2'$/m.test(envDepois) && /^ENV\|override-preservado\|HARNESS_PIPELINE_MAX_VIVOS\|2\|default=4$/m.test(r.stdout), r.stdout);
ok('--apply: obsoleta preservada (nao apagada) e HARNESS_VERSION carimbada', /^HARNESS_FOO_ANTIGA='1'$/m.test(envDepois) && /VERSAO_ATUALIZADA\|/.test(r.stdout), r.stdout);
r = sh(SYNC, ['--check', PROJ], '');
ok('--check depois do apply: migraveis=0 (a diferente segue reportada)', /^ENV\|resumo\|migraveis=0 overrides=1/m.test(r.stdout), r.stdout.split('\n').filter(l => l.startsWith('ENV|')).join('\n'));

// ---------------------------------------------------------------- T7
console.log('== T7 segredo versionado ==');
escreverEnv(ENV_MIN + "HARNESS_BEHOLDER_TOKEN='tok-teste'\nHARNESS_RAG_NODE='C:/node.exe'\nOPENROUTER_API_KEY='sk-or-v1-projeto'\n");
r = nodeRun('harness-env.mjs', ['--doctor', '--root', PROJ]);
ok('MAQUINA-VERSIONADA|HARNESS_BEHOLDER_TOKEN|segredo| e HARNESS_RAG_NODE sem segredo', /^MAQUINA-VERSIONADA\|HARNESS_BEHOLDER_TOKEN\|segredo\|$/m.test(r.stdout) && /^MAQUINA-VERSIONADA\|HARNESS_RAG_NODE\|\|$/m.test(r.stdout), r.stdout);
ok('OPENROUTER_API_KEY no harness.env e chave de PROJETO (16/09): nem segredo, nem obsoleta', !/OPENROUTER_API_KEY/.test(r.stdout), r.stdout);
r = sh(SYNC, ['--check', PROJ], '');
ok('sync --check: ENV|maquina-versionada|HARNESS_BEHOLDER_TOKEN e nada sobre OPENROUTER_API_KEY', /^ENV\|maquina-versionada\|HARNESS_BEHOLDER_TOKEN$/m.test(r.stdout) && !/ENV\|[^|]*\|OPENROUTER_API_KEY/.test(r.stdout), r.stdout.split('\n').filter(l => l.startsWith('ENV|')).join('\n'));
// preenchimento a partir da maquina: projeto sem chave + ~/.harness.env.local com chave
escreverEnv(ENV_MIN + "# OPENROUTER_API_KEY=''\n"); escreverHome("OPENROUTER_API_KEY='sk-or-v1-da-maquina'\n");
r = sh(SYNC, ['--check', PROJ], '');
ok('--check: ENV|chave-vazia|OPENROUTER_API_KEY|.claude/harness.env|maquina-tem (conta como migravel)', /^ENV\|chave-vazia\|OPENROUTER_API_KEY\|\.claude\/harness\.env\|maquina-tem$/m.test(r.stdout) && /^ENV\|resumo\|migraveis=1/m.test(r.stdout), r.stdout.split('\n').filter(l => l.startsWith('ENV|')).join('\n'));
r = sh(SYNC, ['--apply', PROJ], '');
const envPre = fs.readFileSync(path.join(CL, 'harness.env'), 'utf8');
ok('--apply: ENV|preenchida|OPENROUTER_API_KEY|origem=~/.harness.env.local e a linha ativa com a chave da maquina', /^ENV\|preenchida\|OPENROUTER_API_KEY\|origem=~\/\.harness\.env\.local$/m.test(r.stdout) && /^OPENROUTER_API_KEY='sk-or-v1-da-maquina'$/m.test(envPre) && !/^# OPENROUTER_API_KEY=''$/m.test(envPre), r.stdout + '\n' + envPre);
r = sh(SYNC, ['--check', PROJ], '');
ok('--check depois: migraveis=0 (chave ja no projeto)', /^ENV\|resumo\|migraveis=0/m.test(r.stdout), r.stdout.split('\n').filter(l => l.startsWith('ENV|')).join('\n'));
escreverEnv(ENV_MIN + "OPENROUTER_API_KEY='sk-or-v1-outra'\n");
r = sh(SYNC, ['--check', PROJ], '');
ok('projeto com chave propria diferente da maquina: nada a preencher (a do projeto fica; a da maquina vence so nesta maquina)', !/chave-vazia|preenchida/.test(r.stdout), r.stdout.split('\n').filter(l => l.startsWith('ENV|')).join('\n'));
escreverHome(null);

// ---------------------------------------------------------------- T8
console.log('== T8 teste do mestre: default em codigo == _defaults.env ==');
const camTxt = fs.readFileSync(path.join(HOOKS, '_camadas.txt'), 'utf8');
const exatas = new Map(), padroes = [];
for (const l of camTxt.split(/\r?\n/)) { if (!l || l.startsWith('#')) continue; const [k, c] = l.split('|'); if (k.includes('*')) padroes.push([new RegExp('^' + k.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), c]); else exatas.set(k, c); }
const classe = (k) => exatas.get(k) || (padroes.find(([re]) => re.test(k)) || [])[1] || (defaults[k] !== undefined ? 'decisao' : 'desconhecida');
const codigo = [];
const arqs = fs.readdirSync(HOOKS).filter(f => /\.(sh|mjs)$/.test(f)).map(f => path.join(HOOKS, f)).concat(['harness-doctor.sh', 'harness-sync.sh', 'harness-ui.mjs'].map(f => path.join(CL, f)), fs.readdirSync(path.join(CL, 'scripts')).filter(f => f.endsWith('.sh')).map(f => path.join(CL, 'scripts', f)));
for (const f of arqs) {
  const t = fs.readFileSync(f, 'utf8');
  if (f.endsWith('.sh')) for (const m of t.matchAll(/\$\{(HARNESS_[A-Za-z0-9_]+):-([^}]*)\}/g)) { if (!/\$/.test(m[2])) codigo.push([m[1], m[2].replace(/^['"]|['"]$/g, ''), path.basename(f)]); }
  else { for (const m of t.matchAll(/ENV\.(HARNESS_[A-Z0-9_]+)\s*\|\|\s*'([^']*)'/g)) codigo.push([m[1], m[2], path.basename(f)]); for (const m of t.matchAll(/num\(\s*ENV\.(HARNESS_[A-Z0-9_]+)\s*,\s*(\d+)\s*\)/g)) codigo.push([m[1], m[2], path.basename(f)]); }
}
const divergem = [], semDeclaracao = new Set();
for (const [k, v, f] of codigo) {
  if (v === '') continue;                                   // '' = "sem opiniao" no codigo (a camada manda)
  if (defaults[k] !== undefined) { if (defaults[k] !== v) divergem.push(`${k}: codigo='${v}' (${f}) x defaults='${defaults[k]}'`); }
  else if (classe(k) === 'decisao' || classe(k) === 'desconhecida') semDeclaracao.add(`${k}='${v}' (${f})`);
}
ok(`nenhum default em codigo diverge do _defaults.env (${codigo.length} ocorrencias lidas)`, divergem.length === 0, divergem.join(' | '));
ok('toda decisao com default em codigo esta declarada no _defaults.env', semDeclaracao.size === 0, [...semDeclaracao].join(' | '));

// ---------------------------------------------------------------- T9
console.log('== T9 harness-doctor: grupo Camadas de configuracao ==');
escreverEnv(ENV_MIN + "HARNESS_BEHOLDER_TOKEN='tok-teste'\n"); escreverHome("HARNESS_DUELO_SUPLENTES='x/y'\n");
r = sh(path.join(CL, 'harness-doctor.sh'), [], '', {}, PROJ);
const secCam = (r.stdout.split('== Camadas de configuracao')[1] || '').split('\n== ')[0];
ok('doctor: [ OK ] decisoes do harness: N chaves com origem resolvida', /\[ OK \] decisoes do harness: \d+ chaves com origem resolvida/.test(secCam), secCam.slice(0, 500));
ok('doctor: [WARN] OVERRIDE CONSCIENTE ... HARNESS_DUELO_SUPLENTES=x/y em ~/.harness.env.local', /\[WARN\] OVERRIDE CONSCIENTE de decisao do harness: HARNESS_DUELO_SUPLENTES=x\/y em ~\/\.harness\.env\.local/.test(secCam), secCam.slice(0, 800));
ok('doctor: [FALTA] SEGREDO VERSIONADO: HARNESS_BEHOLDER_TOKEN', /\[FALTA\] SEGREDO VERSIONADO: HARNESS_BEHOLDER_TOKEN/.test(secCam), secCam.slice(0, 800));
ok('doctor: matriz tem a area camadas', /camadas\s+(FALTA|WARN|OK)/.test(r.stdout), r.stdout.slice(-600));
escreverEnv(ENV_MIN); escreverHome(null);

// ---------------------------------------------------------------- T10
console.log('== T10 harness-ui: estado expoe envResolvido/envOrigem ==');
{
  const porta = 7900 + (process.pid % 100);
  const ui = spawn(process.execPath, [path.join(CL, 'harness-ui.mjs'), '--port', String(porta), '--idle', '1'], { cwd: PROJ, env: ENVB, stdio: ['ignore', 'pipe', 'pipe'] });
  let saida = ''; ui.stdout.on('data', d => saida += d); ui.stderr.on('data', d => saida += d);
  let tok = '', url = '';
  for (let i = 0; i < 40 && !tok; i++) { await new Promise(res => setTimeout(res, 250)); const m = saida.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=([0-9a-f-]{36})/); if (m) { url = `http://127.0.0.1:${m[1]}`; tok = m[2]; } }
  let estado = null;
  if (tok) {
    estado = await new Promise((res) => { http.get(`${url}/api/state?t=${tok}`, { headers: { 'x-token': tok, 'authorization': 'Bearer ' + tok } }, (resp) => { let b = ''; resp.on('data', d => b += d); resp.on('end', () => { try { res(JSON.parse(b)); } catch { res({ raw: b.slice(0, 200), status: resp.statusCode }); } }); }).on('error', (e) => res({ erro: String(e) })); });
  }
  try { ui.kill(); } catch {}
  ok('ui: /api/state.envResolvido.HARNESS_DUELO_TIMEOUT=300 com envOrigem=defaults', !!(estado && estado.envResolvido && estado.envResolvido.HARNESS_DUELO_TIMEOUT === '300' && estado.envOrigem && estado.envOrigem.HARNESS_DUELO_TIMEOUT === 'defaults'), JSON.stringify(estado && (estado.envOrigem ? { t: estado.envResolvido.HARNESS_DUELO_TIMEOUT, o: estado.envOrigem.HARNESS_DUELO_TIMEOUT } : estado)).slice(0, 300) + ' | ' + saida.slice(0, 200));
}

// ---------------------------------------------------------------- T11
console.log('== T11 estatico: carga unica ==');
{
  const viol = [];
  for (const f of fs.readdirSync(HOOKS).filter(f => f.endsWith('.sh')).concat(['../harness-doctor.sh', '../scripts/noturno.sh'])) {
    const t = fs.readFileSync(path.join(HOOKS, f), 'utf8');
    if (f === '_env.sh') continue;
    const lines = t.split('\n').filter(l => !/^\s*#/.test(l));
    for (const l of lines) if (/(^|[\s;&|])\.\s+"[^"]*harness\.env(\.local)?"/.test(l) || /\[ -f "\$f" \] && \. "\$f"/.test(l)) viol.push(f + ': ' + l.trim().slice(0, 80));
  }
  ok('nenhum hook .sh faz source do harness.env por conta propria', viol.length === 0, viol.join(' | '));
  const usam = ['sessoes.mjs', 'frentes.mjs', 'harness-daemon.mjs', 'guard-bash.mjs', 'harness-dashboard.mjs', 'task-grafo.mjs'].filter(f => !/loadHarnessEnv/.test(fs.readFileSync(path.join(HOOKS, f), 'utf8')));
  ok('mjs (sessoes, frentes, daemon, guard-bash, dashboard, task-grafo) usam loadHarnessEnv', usam.length === 0, usam.join(','));
  ok('harness-ui.mjs importa o harness-env.mjs (origem por chave + gravacao na camada certa)', /from '\.\/hooks\/harness-env\.mjs'/.test(fs.readFileSync(path.join(CL, 'harness-ui.mjs'), 'utf8')));
}

// ---------------------------------------------------------------- T12
console.log('== T12 estatico: mestre — harness.env so projeto, _defaults.env so decisao ==');
{
  const envM = [...fs.readFileSync(path.join(MASTER, '.claude', 'harness.env'), 'utf8').matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(m => m[1]);
  const ruim = envM.filter(k => !['projeto', 'ambiente'].includes(classe(k)));
  ok(`harness.env do mestre: ${envM.length} chaves ativas, todas de projeto`, envM.length > 0 && ruim.length === 0, ruim.join(','));
  const defM = Object.keys(defaults);
  const ruim2 = defM.filter(k => classe(k) !== 'decisao');
  ok(`_defaults.env: ${defM.length} chaves, todas decisao do harness`, defM.length > 150 && ruim2.length === 0, ruim2.join(','));
  ok('_defaults.env: nenhum comentario na linha do valor', !/^[A-Z][A-Z0-9_a-z]*='[^'\n]*'[ \t]+#/m.test(fs.readFileSync(path.join(HOOKS, '_defaults.env'), 'utf8')));
}

// ---------------------------------------------------------------- T13 (E6 frentes)
console.log('== T13 frentes (E6): expira so por sessao morta ==');
{
  const FDIR = path.join(HOME, '.harness-run', 'frentes'); fs.mkdirSync(FDIR, { recursive: true });
  const SESS = path.join(HOME, 'sessoes.json');
  fs.writeFileSync(SESS, JSON.stringify({ sessoes: [{ pid: 1, sessao: 'viva-0000-0000-0000-000000000001' }] }));
  const agora = Date.now(); const velho = agora - 120 * 60000;
  fs.writeFileSync(path.join(FDIR, 'PRD-1.json'), JSON.stringify({ label: 'PRD-1', session: 'morta-0000', projeto: 'p', criado: velho, heartbeat: velho }));
  fs.writeFileSync(path.join(FDIR, 'PRD-2.json'), JSON.stringify({ label: 'PRD-2', session: 'viva-0000-0000-0000-000000000001', projeto: 'p', criado: velho, heartbeat: velho }));
  fs.writeFileSync(path.join(FDIR, 'PRD-3.json'), JSON.stringify({ label: 'PRD-3', session: 'viva-0000-0000-0000-000000000001', projeto: 'p', criado: agora - 30 * 3600000, heartbeat: velho }));
  fs.writeFileSync(path.join(FDIR, 'PRD-4.json'), JSON.stringify({ label: 'PRD-4', session: 'viva-0000-0000-0000-000000000001', projeto: 'p', criado: agora, heartbeat: agora }));
  r = nodeRun('frentes.mjs', ['status'], { HARNESS_FRENTES: 'on', HARNESS_FRENTES_MAX: '4', HARNESS_FRENTES_SESSOES_JSON: SESS });
  ok('PRD-1 (sessao morta, 120 min) caiu', !fs.existsSync(path.join(FDIR, 'PRD-1.json')) && !/FRENTE\|PRD-1\|/.test(r.stdout), r.stdout);
  ok('PRD-2 (sessao viva, 120 min sem heartbeat) FICA com marca sessao-viva-sem-heartbeat', fs.existsSync(path.join(FDIR, 'PRD-2.json')) && /^FRENTE\|PRD-2\|p\|viva-000\|12\d\|sessao-viva-sem-heartbeat$/m.test(r.stdout), r.stdout);
  ok('PRD-3 (sessao viva, criado ha 30 h > teto 24 h) caiu', !fs.existsSync(path.join(FDIR, 'PRD-3.json')), r.stdout);
  ok('PRD-4 (fresco) fica sem marca; status traz teto=24h', /^FRENTE\|PRD-4\|p\|viva-000\|0$/m.test(r.stdout) && /\|teto=24h$/m.test(r.stdout.split('\n')[0]), r.stdout);
  fs.rmSync(FDIR, { recursive: true, force: true });
}

// ---------------------------------------------------------------- T14 (E6 guard-agent heartbeat)
console.log('== T14 guard-agent (E6): Agent nao-executor renova o heartbeat da run viva ==');
{
  const FDIR = path.join(HOME, '.harness-run', 'frentes'); fs.mkdirSync(FDIR, { recursive: true });
  const velho = Date.now() - 20 * 60000;
  fs.writeFileSync(path.join(FDIR, 'PRD-9.json'), JSON.stringify({ label: 'PRD-9', session: 's', projeto: 'proj', criado: velho, heartbeat: velho }));
  fs.writeFileSync(path.join(RUN, 'PRD-9-exec.json'), JSON.stringify({ label: 'PRD-9-exec', start: Math.floor(Date.now() / 1000) - 600 }));
  fs.mkdirSync(path.join(RUN, 'review'), { recursive: true }); fs.writeFileSync(path.join(RUN, 'review', 'PRD-9.review-packet.md'), '# packet\n');
  const payload = JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'sherlock', description: 'Review sherlock PRD-9 ciclo 1', prompt: 'revise a PRD-9; packet em .claude/.harness-run/review/PRD-9.review-packet.md' } });
  r = sh('guard-agent.sh', [], payload, { HARNESS_FRENTES: 'on', HARNESS_FRENTES_MAX: '4' });
  await new Promise(res => setTimeout(res, 2500));
  const slot = JSON.parse(fs.readFileSync(path.join(FDIR, 'PRD-9.json'), 'utf8'));
  ok('sherlock despachado (exit 0) e heartbeat do slot PRD-9 renovado', r.status === 0 && Date.now() - slot.heartbeat < 60000, `${r.status} hb-age=${Math.round((Date.now() - slot.heartbeat) / 1000)}s ${r.stderr.slice(0, 200)}`);
  fs.rmSync(FDIR, { recursive: true, force: true }); fs.rmSync(path.join(RUN, 'PRD-9-exec.json'), { force: true });
}

// ---------------------------------------------------------------- T15 (E5)
console.log('== T15 guard-agent --post (E5): task ✅ sem commit ==');
{
  git(['checkout', '-q', '-b', 'wt/x']);
  fs.writeFileSync(path.join(PROJ, 'a.txt'), 'a\n'); git(['add', 'a.txt']); git(['commit', '-q', '-m', 'feat(PRD-9): TASK-002 — coisa']);
  fs.writeFileSync(path.join(PROJ, 'b.txt'), 'b\n');   // sujo
  const t = Math.floor(Date.now() / 1000);
  fs.writeFileSync(path.join(RUN, 'PRD-9-exec.json'), JSON.stringify({ label: 'PRD-9-exec', start: t - 600 }));
  const linha = (rot, ts, id) => JSON.stringify({ ts, projeto: 'proj', papel: 'hefesto', rotulo: rot, agent_id: id, dur_s: 100, turnos: 10, status: '✅', verif_sem_prova: 0 });
  fs.writeFileSync(path.join(RUN, 'tasks-ultimas.jsonl'), [linha('TASK-001', t - 300, 'a1'), linha('TASK-002', t - 240, 'a2'), linha('TASK-003', t - 5, 'a3')].join('\n') + '\n');
  const post = JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'hefesto', description: 'Executa TASK-003', prompt: 'TASK-003 da PRD-9' }, tool_response: {} });
  r = sh('guard-agent.sh', ['--post'], post, { HARNESS_FRENTES: 'off', HARNESS_WATCHDOG: '0' });
  let ctx = ''; try { ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext; } catch { ctx = r.stdout + r.stderr; }
  ok('em wt/x: aviso [commit] cita TASK-001 (sem commit) e NAO cita TASK-002 (commitada) nem TASK-003 (acabou de voltar)', /\[commit\] task\(s\) ✅ desta run SEM commit que as cite: TASK-001 \(/.test(ctx) && !/TASK-002/.test(ctx.split('[commit]')[1] || '') , ctx.slice(0, 500) + ' ' + r.stderr.slice(0, 200));
  r = sh('guard-agent.sh', ['--post'], post, { HARNESS_FRENTES: 'off', HARNESS_WATCHDOG: '0' });
  try { ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext; } catch { ctx = r.stdout; }
  ok('segundo retorno em < 15 min NAO repete o aviso de TASK-001 (marcador)', !/\[commit\]/.test(ctx), ctx.slice(0, 300));
  fs.rmSync(path.join(RUN, 'commit-aviso-TASK-001'), { force: true });
  r = sh('guard-agent.sh', ['--post'], post, { HARNESS_FRENTES: 'off', HARNESS_WATCHDOG: '0', HARNESS_GUARD_COMMIT_TASK: 'off' });
  try { ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext; } catch { ctx = r.stdout; }
  ok('HARNESS_GUARD_COMMIT_TASK=off silencia', !/\[commit\]/.test(ctx), ctx.slice(0, 300));
  git(['checkout', '-q', 'main']);
  r = sh('guard-agent.sh', ['--post'], post, { HARNESS_FRENTES: 'off', HARNESS_WATCHDOG: '0' });
  try { ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext; } catch { ctx = r.stdout; }
  ok('na main (checkout principal) nao avisa — o usuario commita na Fase 3', !/\[commit\]/.test(ctx), ctx.slice(0, 300));
  fs.rmSync(path.join(RUN, 'PRD-9-exec.json'), { force: true }); fs.rmSync(path.join(RUN, 'tasks-ultimas.jsonl'), { force: true });
  git(['checkout', '-q', '--', '.']); fs.rmSync(path.join(PROJ, 'b.txt'), { force: true });
}

// ---------------------------------------------------------------- T16 (E7)
console.log('== T16 node_modules ausente (E7) ==');
{
  fs.writeFileSync(path.join(PROJ, 'package.json'), JSON.stringify({ name: 'proj', devDependencies: { '@playwright/test': '^1.62.1' } }));
  r = sh('harness-worktree.sh', ['doctor'], '', { HARNESS_WT_DB: 'off' });
  ok('worktree doctor: DOCTOR|node_modules-ausente|<principal>|@playwright/test declarado', /^DOCTOR\|node_modules-ausente\|[^|]*\|@playwright\/test declarado/m.test(r.stdout), r.stdout + r.stderr.slice(0, 200));
  r = sh(path.join(CL, 'harness-doctor.sh'), [], '', {}, PROJ);
  ok('harness-doctor: [WARN] @playwright/test declarado ... AUSENTE', /\[WARN\] @playwright\/test declarado no package\.json e AUSENTE/.test(r.stdout), (r.stdout.match(/.*playwright.*/g) || []).join('\n').slice(0, 400));
  fs.mkdirSync(path.join(PROJ, 'node_modules', '@playwright', 'test'), { recursive: true });
  r = sh('harness-worktree.sh', ['doctor'], '', { HARNESS_WT_DB: 'off' });
  ok('com node_modules/@playwright/test presente: sem DOCTOR|node_modules-ausente', !/node_modules-ausente/.test(r.stdout), r.stdout);
  ok('harness-worktree.sh novo tem o passo npm i --no-save guardado por HARNESS_WT_NPM_INSTALL', /HARNESS_WT_NPM_INSTALL:-on/.test(fs.readFileSync(path.join(HOOKS, 'harness-worktree.sh'), 'utf8')) && /npm i --no-save/.test(fs.readFileSync(path.join(HOOKS, 'harness-worktree.sh'), 'utf8')));
  fs.rmSync(path.join(PROJ, 'node_modules'), { recursive: true, force: true }); fs.rmSync(path.join(PROJ, 'package.json'), { force: true });
}

// ---------------------------------------------------------------- T17 grafo
console.log('== T17 task-grafo ==');
{
  const TD = path.join(PROJ, 'prds', 'PRD-9-x', 'tasks'); fs.mkdirSync(TD, { recursive: true });
  const task = (n, dep, tipo = 'backend') => fs.writeFileSync(path.join(TD, `TASK-00${n}-x.md`), `# TASK-00${n}\n## Metadados\n| **Tipo** | ${tipo} |\n| **Depende de** | ${dep} |\n## Objetivo\nx\n## Arquivo(s) Afetado(s)\n- \`administrativo/a${n}.php\`\n`);
  task(1, '—'); task(2, 'TASK-001 [requires] — consome a tabela; a TASK-005 tambem usa'); task(3, 'TASK-001 [barrier: integracao] — construido contra TASK-002 e TASK-004');
  task(4, 'TASK-002, TASK-003 [requires] — junta os dois', 'front'); task(5, 'TASK-001..TASK-003 [requires] — acceptance');
  r = nodeRun('task-grafo.mjs', [TD]);
  ok('GRAFO|PRD-9-x|tasks=5|profundidade=3|largura_max=2|fator_teorico=1.67|caminho_critico=TASK-001>TASK-002>TASK-004', /^GRAFO\|PRD-9-x\|tasks=5\|profundidade=3\|largura_max=2\|fator_teorico=1\.67\|caminho_critico=TASK-001>TASK-00[23]>TASK-00[45]$/m.test(r.stdout), r.stdout);
  ok('prosa apos " — " nao vira aresta (TASK-002 depende so de TASK-001) e faixa TASK-001..003 expande (TASK-005 no nivel 3)', /^GRAFO-NIVEL\|2\|TASK-002,TASK-003$/m.test(r.stdout) && /^GRAFO-NIVEL\|3\|TASK-004,TASK-005$/m.test(r.stdout) && !/GRAFO-ERRO/.test(r.stdout), r.stdout);
  ok('GRAFO-GARGALO|TASK-001|dependentes=3|alcance=4 e GRAFO-VEREDITO|serial com sugestao', /^GRAFO-GARGALO\|TASK-001\|dependentes=3\|alcance=4\|/m.test(r.stdout) && /^GRAFO-VEREDITO\|serial\|fator 1\.67 < 2\|TASK-001 segura 4 task/m.test(r.stdout), r.stdout);
  task(1, 'TASK-005 [requires]');   // ciclo
  r = nodeRun('task-grafo.mjs', [TD]);
  ok('ciclo: GRAFO-ERRO|ciclo|... sem travar', /^GRAFO-ERRO\|ciclo\|/m.test(r.stdout) && r.status === 0, r.stdout);
  task(1, '—');
  r = nodeRun('task-grafo.mjs', [TD], { HARNESS_GRAFO_FATOR_MIN: '1.5' });
  ok('HARNESS_GRAFO_FATOR_MIN=1.5 => GRAFO-VEREDITO|ok', /^GRAFO-VEREDITO\|ok\|fator 1\.67 >= 1\.5$/m.test(r.stdout), r.stdout);
  r = nodeRun('task-grafo.mjs', ['prds/PRD-9-*/tasks']);
  ok('glob relativo prds/PRD-9-*/tasks funciona', /^GRAFO\|PRD-9-x\|tasks=5\|/m.test(r.stdout), r.stdout);
  fs.mkdirSync(path.join(PROJ, 'prds', 'PRD-140-b-desconto', 'tasks'), { recursive: true }); fs.copyFileSync(path.join(TD, 'TASK-001-x.md'), path.join(PROJ, 'prds', 'PRD-140-b-desconto', 'tasks', 'TASK-001-x.md'));
  fs.mkdirSync(path.join(PROJ, 'prds', 'PRD-144-chat-wpp', 'tasks'), { recursive: true }); fs.copyFileSync(path.join(TD, 'TASK-001-x.md'), path.join(PROJ, 'prds', 'PRD-144-chat-wpp', 'tasks', 'TASK-001-x.md'));
  ok('rotulo: PRD-140-b de PRD-140-b-desconto e PRD-144 de PRD-144-chat-wpp (o "-c" de chat nao e fatia)', /^GRAFO\|PRD-140-b\|/m.test(nodeRun('task-grafo.mjs', ['prds/PRD-140-b-desconto/tasks']).stdout) && /^GRAFO\|PRD-144\|/m.test(nodeRun('task-grafo.mjs', ['prds/PRD-144-chat-wpp/tasks']).stdout));
  // T18
  console.log('== T18 task-packet --check imprime GRAFO ==');
  r = sh('task-packet.sh', [path.join(TD, 'TASK-001-x.md'), '--check'], '');
  ok('PACKET-CHECK + GRAFO|PRD-9-x|... + GRAFO-VEREDITO na mesma saida', /^PACKET-CHECK\|TASK-001\|/m.test(r.stdout) && /^GRAFO\|PRD-9-x\|tasks=5\|/m.test(r.stdout) && /^GRAFO-VEREDITO\|/m.test(r.stdout), r.stdout + r.stderr.slice(0, 300));
}

// ---------------------------------------------------------------- T20–T23 costura (incidente PRD-144)
console.log('== T20 costura-check --codigo: window sem publicacao, duble em spec, marcador, route.fulfill ==');
{
  const J = path.join(PROJ, 'app', 'js'); fs.mkdirSync(J, { recursive: true }); fs.mkdirSync(path.join(PROJ, 'tests', 'e2e'), { recursive: true }); fs.mkdirSync(path.join(PROJ, 'app', 'api'), { recursive: true });
  fs.writeFileSync(path.join(J, 'core.js'), "(function (raiz) {\n  function abrirConversa(t) { return t; }\n  raiz.abrirConversa = abrirConversa;\n  window.InboxBusca = { limpar: function () {} };\n})(window);\n");
  fs.writeFileSync(path.join(J, 'painel.js'), "(function () {\n  /* cabecalho: usa window.inboxNaoExisteNoComentario */\n  // window.tambemComentario\n  if (typeof window.abrirPorTelefone === 'function') { window.abrirPorTelefone('1'); }\n  window.InboxBusca.limpar();\n  window.abrirConversa('x');\n  // NÃO VERIFICADO — a integrar na TASK-008\n  var a = window.location.href;\n})();\n");
  fs.writeFileSync(path.join(PROJ, 'app', 'api', 'listar_x.php'), "<?php echo json_encode(['fila' => []]);\n");
  fs.writeFileSync(path.join(PROJ, 'tests', 'e2e', 'PRD-9-painel.spec.js'), "const { test } = require('@playwright/test');\ntest('x', async ({ page }) => {\n  await page.addInitScript(() => { window.abrirPorTelefone = function (t) { window.__t = t; }; });\n  await page.route('**/listar_x.php', route => route.fulfill({ json: { fila: [] } }));\n});\n");
  fs.writeFileSync(path.join(PROJ, 'tests', 'e2e', 'PRD-9-acceptance.spec.js'), "const { test } = require('@playwright/test');\ntest('a', async ({ page }) => {\n  await page.route('**/listar_x.php', route => route.fulfill({ json: { fila: [] } }));\n  const orig = window.abrirConversa;\n});\n");
  r = nodeRun('costura-check.mjs', ['--codigo', '--base', 'none', '--root', PROJ]);
  ok('window-sem-publicacao|abrirPorTelefone (consumido em painel.js, nunca publicado)', /^COSTURA\|window-sem-publicacao\|abrirPorTelefone\|app\/js\/painel\.js:4$/m.test(r.stdout), r.stdout);
  ok('abrirConversa (publicado por alias raiz.X) e InboxBusca (window.X =) NAO sao acusados; comentarios nao contam', !/window-sem-publicacao\|(abrirConversa|InboxBusca|inboxNaoExisteNoComentario|tambemComentario|location)\|/.test(r.stdout), r.stdout);
  ok('duble-em-spec|abrirPorTelefone no PRD-9-painel.spec.js; espiao `const orig = window.abrirConversa` no acceptance NAO e duble', /^COSTURA\|duble-em-spec\|abrirPorTelefone\|tests\/e2e\/PRD-9-painel\.spec\.js:3$/m.test(r.stdout) && !/duble-em-spec\|abrirConversa/.test(r.stdout), r.stdout);
  ok('marcador-pendencia em painel.js:7 e typeof-engole (info) em painel.js:4', /^COSTURA\|marcador-pendencia\|app\/js\/painel\.js:7\|/m.test(r.stdout) && /^COSTURA\|typeof-engole\|abrirPorTelefone\|app\/js\/painel\.js:4$/m.test(r.stdout), r.stdout);
  ok('route-fulfill do endpoint da PRD: acusado nos dois specs; COSTURA-VEREDITO|bloqueia lista os tipos', /route-fulfill-endpoint-da-prd\|listar_x\.php\|tests\/e2e\/PRD-9-acceptance\.spec\.js:3/.test(r.stdout) && /^COSTURA-VEREDITO\|bloqueia\|\d+\|[^|]*window-sem-publicacao[^|]*\|/m.test(r.stdout), r.stdout);
  // escape: costura-ok e HARNESS_COSTURA_IGNORAR
  fs.writeFileSync(path.join(J, 'painel.js'), "(function () {\n  // costura-ok: publicado dinamicamente por window[nome + 'Editor']\n  window.anotacoesEditor.focus();\n  window.evolucaoEditor.focus();\n})();\n");
  fs.rmSync(path.join(PROJ, 'tests', 'e2e', 'PRD-9-painel.spec.js')); fs.rmSync(path.join(PROJ, 'tests', 'e2e', 'PRD-9-acceptance.spec.js'));
  r = nodeRun('costura-check.mjs', ['--codigo', '--base', 'none', '--root', PROJ], { HARNESS_COSTURA_IGNORAR: 'evolucaoEditor' });
  ok('escapes: `// costura-ok` na linha de cima e HARNESS_COSTURA_IGNORAR silenciam => COSTURA-VEREDITO|ok', /^COSTURA-VEREDITO\|ok\|/m.test(r.stdout) && !/window-sem-publicacao/.test(r.stdout), r.stdout);
  // varredura /deus 16/09: lib vendorizada nao consome, mas PUBLICA; APIs de navegador/libs de CDN conhecidas; --base all
  const P = path.join(PROJ, 'app', 'plugins', 'editor'); fs.mkdirSync(P, { recursive: true });
  fs.writeFileSync(path.join(P, 'editor.js'), "if (window.MozMutationObserver || window.fantasmaDoPlugin) {}\nwindow.EditorLib = {};\n");
  fs.writeFileSync(path.join(J, 'tema.bundle.js'), "var z = window.fantasmaDoBundle;\n");
  fs.writeFileSync(path.join(J, 'painel.js'), "(function () {\n  window.EditorLib.criar();\n  if (window.webkitURL || window.Swal) {}\n  window.fantasmaDoApp();\n})();\n");
  r = nodeRun('costura-check.mjs', ['--codigo', '--base', 'all', '--root', PROJ]);
  ok('--base all: consumo em plugins/ e *.bundle.js nao conta; publicacao do plugin conta; webkitURL/Swal conhecidos; o do app segue acusado', /^COSTURA\|window-sem-publicacao\|fantasmaDoApp\|app\/js\/painel\.js:4$/m.test(r.stdout) && !/window-sem-publicacao\|(fantasmaDoPlugin|fantasmaDoBundle|EditorLib|MozMutationObserver|webkitURL|Swal)\|/.test(r.stdout) && /base=4b825dc642cb/.test(r.stdout), r.stdout);
  fs.rmSync(path.join(PROJ, 'app'), { recursive: true, force: true });
}

console.log('== T21 costura-check --tasks: Produz/Consome ==');
{
  const TD = path.join(PROJ, 'prds', 'PRD-8-c', 'tasks'); fs.mkdirSync(TD, { recursive: true });
  fs.mkdirSync(path.join(PROJ, 'src'), { recursive: true }); fs.writeFileSync(path.join(PROJ, 'src', 'core.js'), "// x\nwindow.abrirConversa = abrirConversa;\n");
  const tk = (n, produz, consome) => fs.writeFileSync(path.join(TD, `TASK-00${n}-x.md`), `# TASK-00${n}\n## Metadados\n| **Tipo** | front |\n| **Depende de** | Nenhuma |\n| **Produz** | ${produz} |\n| **Consome** | ${consome} |\n## Objetivo\nx\n`);
  tk(1, 'window.publicarNomes · POST api/x.php', 'Nenhum');
  tk(2, 'Nenhum', 'window.abrirConversa — existente src/core.js:2 · window.publicarNomes — TASK-001 · window.fantasma — existente src/core.js:1 · window.semOrigem — funcao global existente · api/y.php — TASK-001');
  r = nodeRun('costura-check.mjs', ['--tasks', TD, '--root', PROJ]);
  ok('existente provado (abrirConversa src/core.js:2) e TASK-001 que declara publicarNomes: sem achado', !/\|(window\.abrirConversa|window\.publicarNomes)\|/.test(r.stdout), r.stdout);
  ok('nao-provado (fantasma em src/core.js:1), consumo-sem-origem (semOrigem) e produtor-nao-declara (api/y.php — TASK-001)', /^COSTURA-TASK\|nao-provado\|TASK-002\|window\.fantasma\|src\/core\.js:1$/m.test(r.stdout) && /^COSTURA-TASK\|consumo-sem-origem\|TASK-002\|window\.semOrigem\|/m.test(r.stdout) && /^COSTURA-TASK\|produtor-nao-declara\|TASK-002\|api\/y\.php\|TASK-001$/m.test(r.stdout), r.stdout);
  ok('produz-sem-consumidor (POST api/x.php) e info; VEREDITO bloqueia', /^COSTURA-TASK\|produz-sem-consumidor\|TASK-001\|POST api\/x\.php\|$/m.test(r.stdout) && /^COSTURA-TASK-VEREDITO\|bloqueia\|3\|/m.test(r.stdout), r.stdout);
  r = sh('task-packet.sh', [path.join(TD, 'TASK-002-x.md'), '--check'], '');
  ok('task-packet --check imprime as linhas COSTURA-TASK da task e o veredito', /^COSTURA-TASK\|nao-provado\|TASK-002\|/m.test(r.stdout) && /^COSTURA-TASK-VEREDITO\|/m.test(r.stdout), r.stdout + r.stderr.slice(0, 200));
}

console.log('== T22 gate de costura no stop + secao no review-packet ==');
{
  fs.mkdirSync(path.join(PROJ, 'app'), { recursive: true }); fs.mkdirSync(path.join(PROJ, 'tests', 'e2e'), { recursive: true });
  git(['add', '.']); git(['commit', '-q', '-m', 'base costura']);
  fs.writeFileSync(path.join(PROJ, 'app', 'novo.js'), "if (typeof window.naoPublicado === 'function') { window.naoPublicado(); }\n");
  fs.writeFileSync(path.join(RUN, 'PRD-8-exec.json'), JSON.stringify({ label: 'PRD-8-exec', start: Math.floor(Date.now() / 1000) - 60 }));
  r = sh('harness-metrics.sh', ['stop', 'PRD-8-exec', '--tasks=1'], '', { HARNESS_GATE_ACCEPTANCE: 'off' });
  ok('stop com COSTURA bloqueia => exit 3, TELEMETRIA|costura|bloqueia, marcador de start mantido', r.status === 3 && /^TELEMETRIA\|costura\|bloqueia\|PRD-8-exec\|/m.test(r.stdout) && /COSTURA COM PENDENCIA/.test(r.stderr) && fs.existsSync(path.join(RUN, 'PRD-8-exec.json')), `${r.status} ${r.stdout} ${r.stderr.slice(0, 300)}`);
  r = sh('harness-metrics.sh', ['stop', 'PRD-8-exec', '--tasks=1'], '', { HARNESS_GATE_ACCEPTANCE: 'off', HARNESS_GATE_COSTURA: 'aviso' });
  ok('HARNESS_GATE_COSTURA=aviso: reporta no stderr e fecha (exit != 3)', r.status !== 3 && /COSTURA COM PENDENCIA/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 200)}`);
  fs.writeFileSync(path.join(RUN, 'PRD-8-exec.json'), JSON.stringify({ label: 'PRD-8-exec', start: Math.floor(Date.now() / 1000) - 60 }));
  r = sh('harness-metrics.sh', ['stop', 'PRD-8-exec', '--tasks=1', '--costura-ok=dependencia carregada por CDN'], '', { HARNESS_GATE_ACCEPTANCE: 'off' });
  ok('--costura-ok="<motivo>" fecha mesmo com pendencia', r.status !== 3, `${r.status} ${r.stderr.slice(0, 200)}`);
  fs.mkdirSync(path.join(RUN, 'review'), { recursive: true });
  r = sh('review-packet.sh', ['--label', 'PRD-8', '--tasks', path.join(PROJ, 'prds', 'PRD-8-c', 'tasks', 'TASK-00*.md')], '');
  const pk = fs.existsSync(path.join(RUN, 'review', 'PRD-8.review-packet.md')) ? fs.readFileSync(path.join(RUN, 'review', 'PRD-8.review-packet.md'), 'utf8') : '';
  ok('review-packet traz a secao "## Costura" com window-sem-publicacao|naoPublicado e o veredito', /## Costura \(3\.5\.7/.test(pk) && /COSTURA\|window-sem-publicacao\|naoPublicado\|app\/novo\.js:1/.test(pk) && /COSTURA-VEREDITO\|bloqueia/.test(pk), pk.slice(0, 600) + ' ' + r.stdout + r.stderr.slice(0, 200));
  fs.rmSync(path.join(PROJ, 'app'), { recursive: true, force: true }); git(['checkout', '-q', '--', '.']);
}

console.log('== T23 guard-write: duble em spec avisa (subagente), pai passa ==');
{
  const wp = JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Write', agent_id: 'd357', agent_type: 'dedalo', tool_input: { file_path: path.join(PROJ, 'tests', 'e2e', 'PRD-8-x.spec.js'), content: "test('x', async ({ page }) => {\n  await page.addInitScript(() => { window.abrirPorTelefone = function (t) { return t; }; });\n});\n" } });
  r = sh('guard-write.sh', [], wp, {});
  ok('subagente: exit 0 + additionalContext citando window.abrirPorTelefone e a receita do espiao real', r.status === 0 && /window\.abrirPorTelefone/.test(r.stdout) && /const orig = window\.X/.test(r.stdout), `${r.status} ${r.stdout.slice(0, 300)} ${r.stderr.slice(0, 200)}`);
  r = sh('guard-write.sh', [], wp, { HARNESS_GUARD_WRITE_DUBLE: 'off' });
  ok('HARNESS_GUARD_WRITE_DUBLE=off: silencio', r.status === 0 && !/abrirPorTelefone/.test(r.stdout), r.stdout.slice(0, 200));
}

// ---------------------------------------------------------------- T19 skills
console.log('== T19 skills ==');
{
  const pe = fs.readFileSync(path.join(CL, 'skills', 'prd-exec', 'SKILL.md'), 'utf8'), pr = fs.readFileSync(path.join(CL, 'skills', 'prd', 'SKILL.md'), 'utf8');
  ok('/prd-exec: 4a. COMMIT POR TASK (3.5.7/E5)', /4a\. COMMIT POR TASK \(3\.5\.7\/E5/.test(pe));
  ok('/prd-exec: SOLO-2 com packet em N partes (3.5.7) — um sherlock por parte + costura', /SOLO-2 com packet em N partes \(3\.5\.7\)/.test(pe) && /um sherlock por parte, lente `completa`/.test(pe));
  ok('/prd-exec: Grafo (3.5.7) no plano do pipeline', /\*\*Grafo \(3\.5\.7\):\*\*/.test(pe));
  ok('/prd: Grafo de dependencias (3.5.7) no Passo 8', /Grafo de dependencias \(3\.5\.7\)/.test(pr));
}

console.log(`\n${pass} PASS · ${fail} FAIL · sandbox ${S}`);
if (!process.env.T_KEEP) { try { fs.rmSync(S, { recursive: true, force: true }); } catch {} }
process.exit(fail ? 1 : 0);
