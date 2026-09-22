#!/usr/bin/env node
// tests/t-355-criacoes.mjs — bateria da 3.5.5 (correcoes medidas no monitor das 4 criacoes de 15/09/2026, C1-C12).
// Roda em SANDBOX proprio (repo git falso em os.tmpdir()), nunca toca o projeto real.
//   node tests/t-355-criacoes.mjs
//
// O que prova (mecanico):
//   T1 metrics-auto (prompt livre): "criar com /prd PRD-141-b ... a exec com /prd-exec depois" => _auto-prd-fase1 (posicao vence), origem=auto-prompt.
//   T2 metrics-auto --skill: payload da ferramenta Skill manda; marcador -exec errado do prompt (< 15 min) e removido (corrigiu-prompt); prd-exec => PRD-141-b-exec.
//   T3 harness-metrics start PRD-141-b-fase1: apaga PRD-141-b-exec do auto-start e adota o _auto-prd-fase1.
//   T4 task-telemetry.statusDoRelatorio: legenda do template nao vira ⛔; Veredito manda; citacao do ciclo 1 nao conta; fallback preservado.
//   T5 esforco.sh: descobre --effort da linha de comando (atual_origem=processo); --atual (flag) e CLAUDE_CODE_EFFORT_LEVEL (env) vencem.
//   T6 harness-metrics stop: aviso "Paralelismo cego" so em run -exec/LOTE (fase2 de criacao nao avisa).
//   T7 harness-metrics stop: delegacoes do manifest (prds/_metrics/delegations) entram em subagent_measured/busy e codex=ok.
//   T8 guard-bash: comando multi-linha com aspas desbalanceadas => deny SINTAXE (bash -n); multi-linha valido passa.
//   T9 guard-write: Write com marcadores de conflito do git => deny.
//   T10 guard-agent: general-purpose despachado com marcador de skill vivo => additionalContext (aviso), exit 0.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-355-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const RUN = path.join(PROJ, '.claude', '.harness-run');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1', HARNESS_PRESENCE_URL: '', HARNESS_FRENTES: 'off', HARNESS_DAEMON: 'off', HARNESS_RAG_ENABLED: '0', HARNESS_SKIP_DUELO: '1', HARNESS_INCIDENTES: 'off', HARNESS_ESFORCO_AUTODETECT: 'off' };

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\nHARNESS_SKIP_DUELO='1'\nHARNESS_INCIDENTES='off'\n`);
fs.mkdirSync(path.join(PROJ, 'prds', 'debito_tecnico'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'prds', 'debito_tecnico', 'INDEX.md'), '# DTs\n');
fs.mkdirSync(RUN, { recursive: true });
const git = (args, cwd = PROJ) => spawnSync('git', args, { cwd, encoding: 'utf8', env: ENVB });
git(['init', '-q']); git(['config', 'user.email', 't@t']); git(['config', 'user.name', 't']); git(['add', '.']); git(['commit', '-q', '-m', 'base']);

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 500)); } };
const sh = (file, args, input, env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const lerJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const logAuto = () => { try { return fs.readFileSync(path.join(RUN, 'metrics-auto.log'), 'utf8'); } catch { return ''; } };
const limparRun = () => { for (const f of fs.readdirSync(RUN)) fs.rmSync(path.join(RUN, f), { recursive: true, force: true }); };
const prompt = (p) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'UserPromptSubmit', prompt: p });
const skill = (sk, args) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: sk, args } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoLocal = (d) => { const p = (n) => String(n).padStart(2, '0'); const off = -d.getTimezoneOffset(); const sg = off >= 0 ? '+' : '-'; const a = Math.abs(off); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sg}${p(Math.floor(a / 60))}:${p(a % 60)}`; };

const PROMPT_141B = 'Você está na worktree wt/prd-141b. O lock PRD-141-b já está registrado. TAREFA: criar a PRD com `/prd PRD-141-b`. Só criar; a execução com /prd-exec fica para quando eu aprovar. CONTEXTO - A mãe PRD-141 foi concluída em 10/09. O stub prds/PRD-141-b-editor-jodit-no-prontuario/PRD-141-b.md congela o escopo.';

console.log('== T1 metrics-auto (prompt livre): a skill citada PRIMEIRO vence ==');
let r = sh('harness-metrics-auto.sh', [], prompt(PROMPT_141B));
ok('prompt "criar com /prd ... /prd-exec depois" => _auto-prd-fase1 (nao PRD-141-b-exec)', fs.existsSync(path.join(RUN, '_auto-prd-fase1.json')) && !fs.existsSync(path.join(RUN, 'PRD-141-b-exec.json')), `${r.stdout} ${r.stderr} ${fs.readdirSync(RUN).join(',')}`);
ok('marcador diz origem=auto-prompt', (lerJson(path.join(RUN, '_auto-prd-fase1.json')) || {}).origem === 'auto-prompt', fs.readFileSync(path.join(RUN, '_auto-prd-fase1.json'), 'utf8'));
ok('log: ligado|_auto-prd-fase1', /\|ligado\|_auto-prd-fase1/.test(logAuto()), logAuto());
limparRun();
r = sh('harness-metrics-auto.sh', [], prompt('Rode a exec: /prd-exec PRD-139-b — o stub veio da /prd de ontem'));
ok('prompt com /prd-exec primeiro => PRD-139-b-exec', fs.existsSync(path.join(RUN, 'PRD-139-b-exec.json')) && !fs.existsSync(path.join(RUN, '_auto-prd-fase1.json')), `${r.stdout} ${fs.readdirSync(RUN).join(',')}`);
limparRun();

console.log('== T2 metrics-auto --skill: a ferramenta Skill e a verdade; corrige o marcador errado do prompt ==');
fs.writeFileSync(path.join(RUN, 'PRD-141-b-exec.json'), JSON.stringify({ label: 'PRD-141-b-exec', start: Math.floor(Date.now() / 1000) - 20, origem: 'auto-prompt' }));
r = sh('harness-metrics-auto.sh', ['--skill'], skill('prd', 'PRD-141-b'));
ok('--skill prd => _auto-prd-fase1 criado (origem=auto-skill)', (lerJson(path.join(RUN, '_auto-prd-fase1.json')) || {}).origem === 'auto-skill', `${r.stdout} ${r.stderr}`);
ok('--skill prd => PRD-141-b-exec do prompt (20 s) REMOVIDO + log corrigiu-prompt', !fs.existsSync(path.join(RUN, 'PRD-141-b-exec.json')) && /corrigiu-prompt\|PRD-141-b-exec/.test(logAuto()), `${r.stdout} ${logAuto()}`);
limparRun();
fs.writeFileSync(path.join(RUN, 'PRD-141-b-exec.json'), JSON.stringify({ label: 'PRD-141-b-exec', start: Math.floor(Date.now() / 1000) - 3600, origem: 'auto-prompt' }));
r = sh('harness-metrics-auto.sh', ['--skill'], skill('prd', 'PRD-141-b'));
ok('marcador -exec do prompt com 1 h NAO e removido pelo --skill (fora da janela de 15 min)', fs.existsSync(path.join(RUN, 'PRD-141-b-exec.json')), fs.readdirSync(RUN).join(','));
limparRun();
r = sh('harness-metrics-auto.sh', ['--skill'], skill('prd-exec', 'PRD-141-b'));
ok('--skill prd-exec PRD-141-b => PRD-141-b-exec (origem=auto-skill)', (lerJson(path.join(RUN, 'PRD-141-b-exec.json')) || {}).origem === 'auto-skill', `${r.stdout} ${fs.readdirSync(RUN).join(',')}`);
limparRun();
r = sh('harness-metrics-auto.sh', ['--skill'], skill('plugin:dt-exec', ''));
ok('--skill plugin:dt-exec => _auto-dt-exec', fs.existsSync(path.join(RUN, '_auto-dt-exec.json')), `${r.stdout} ${fs.readdirSync(RUN).join(',')}`);
limparRun();

console.log('== T3 start PRD-NNN-fase1 apaga o -exec do auto-start e adota o _auto ==');
const s0 = Math.floor(Date.now() / 1000) - 120;
fs.writeFileSync(path.join(RUN, '_auto-prd-fase1.json'), JSON.stringify({ label: '_auto-prd-fase1', start: s0, origem: 'auto-prompt' }));
fs.writeFileSync(path.join(RUN, 'PRD-141-b-exec.json'), JSON.stringify({ label: 'PRD-141-b-exec', start: s0 + 1, origem: 'auto-prompt' }));
r = sh('harness-metrics.sh', ['start', 'PRD-141-b-fase1'], '');
ok('start fase1: PRD-141-b-exec removido, aviso impresso', !fs.existsSync(path.join(RUN, 'PRD-141-b-exec.json')) && /marcador PRD-141-b-exec .*removido/.test(r.stdout), `${r.stdout} ${r.stderr}`);
ok('start fase1: adotou o inicio do _auto (start=' + s0 + ')', (lerJson(path.join(RUN, 'PRD-141-b-fase1.json')) || {}).start === s0 && !fs.existsSync(path.join(RUN, '_auto-prd-fase1.json')), fs.readdirSync(RUN).join(','));
limparRun();
fs.writeFileSync(path.join(RUN, 'PRD-141-b-exec.json'), JSON.stringify({ label: 'PRD-141-b-exec', start: s0 }));
r = sh('harness-metrics.sh', ['start', 'PRD-141-b-fase1'], '');
ok('start fase1 NAO apaga -exec ligado pela skill (sem origem auto)', fs.existsSync(path.join(RUN, 'PRD-141-b-exec.json')), fs.readdirSync(RUN).join(','));
r = sh('harness-metrics.sh', ['start', 'PRD-7-exec', '--origem=auto-skill'], '');
ok('start --origem=auto-skill grava origem no marcador', (lerJson(path.join(RUN, 'PRD-7-exec.json')) || {}).origem === 'auto-skill', fs.readFileSync(path.join(RUN, 'PRD-7-exec.json'), 'utf8'));
limparRun();

console.log('== T4 task-telemetry.statusDoRelatorio: veredito manda, legenda nao conta ==');
const tt = await import(pathToFileURL(path.join(HOOKS, 'task-telemetry.mjs')).href);
const LEGENDA = '# 🦠 Beholder — Revisão da PRD-141-b\n\n**Veredito:** ✅ Pronta para executar  |  ⚠️ Executável com ressalvas  |  ⛔ Não executar (corrigir antes)  |  ⚠️ PARCIAL-TEMPO\n**Placar:** 🔴 0 bloqueadores · 🟡 4 médios\n';
ok('legenda inteira na linha de veredito => ✅ (1o emoji)', tt.statusDoRelatorio(LEGENDA) === '✅', tt.statusDoRelatorio(LEGENDA));
ok('Veredito ⛔ => ⛔', tt.statusDoRelatorio('**Veredito:** ⛔ Não executar (corrigir antes)\n**Placar:** 🔴 1') === '⛔');
ok('ciclo 2 aprovado citando o ciclo 1 (⛔) => ✅', tt.statusDoRelatorio('**Ciclo:** 2 de 2 — +1 confirmação prevista por haver 🔴.\n**Veredito:** ✅ Pronta para executar\n**Placar:** 🔴 0 (1 fechado)\n\nNo ciclo 1 o veredito era ⛔ Não executar; B1 corrigido.') === '✅');
ok('Veredito ⚠️ Bom com ajustes => ⚠️', tt.statusDoRelatorio('**Veredito:** ⚠️ Bom com ajustes · ✅ · ⛔\n') === '⚠️');
ok('PARCIAL-TEMPO no veredito => PARCIAL', tt.statusDoRelatorio('**Veredito:** ⚠️ PARCIAL-TEMPO\n') === 'PARCIAL');
ok('sem veredito: texto "BLOQUEADO pelo interceptor" => ⛔ (fallback preservado)', tt.statusDoRelatorio('Parei: BLOQUEADO pelo interceptor de safe mode') === '⛔');
ok('sem veredito: so a legenda solta no texto => vazio (nao ⛔)', tt.statusDoRelatorio('Opções: ✅ ok | ⚠️ ressalvas | ⛔ nao\nfim') === '', JSON.stringify(tt.statusDoRelatorio('Opções: ✅ ok | ⚠️ ressalvas | ⛔ nao\nfim')));
ok('placeholder do template (<escreva SO o escolhido...>) nao vira status', tt.statusDoRelatorio('**Veredito:** <escreva SÓ o escolhido — ✅ Pronta · ⛔ Não>\n') === '', JSON.stringify(tt.statusDoRelatorio('**Veredito:** <escreva SÓ o escolhido — ✅ Pronta · ⛔ Não>\n')));

console.log('== T5 esforco.sh: descobre o esforco da linha de comando; flag e env vencem ==');
r = sh('esforco.sh', ['pensar'], '', { HARNESS_ESFORCO_AUTODETECT: 'on', HARNESS_ESFORCO_CMDLINE: 'C:\\x\\claude.exe --thinking adaptive --effort xhigh --model claude-opus-5' });
ok('cmdline --effort xhigh => atual=xhigh|AJUSTAR|atual_origem=processo (alvo pensar=high)', /ESFORCO\|pensar\|alvo=high\|atual=xhigh\|AJUSTAR\|.*atual_origem=processo/.test(r.stdout), r.stdout);
ok('esforco.env tem atual=xhigh e atual_origem=processo', /atual=xhigh/.test(fs.readFileSync(path.join(RUN, 'esforco.env'), 'utf8')) && /atual_origem=processo/.test(fs.readFileSync(path.join(RUN, 'esforco.env'), 'utf8')));
r = sh('esforco.sh', ['pensar', '--atual', 'high'], '', { HARNESS_ESFORCO_AUTODETECT: 'on', HARNESS_ESFORCO_CMDLINE: 'claude --effort xhigh' });
ok('--atual high vence a cmdline => ok|atual_origem=flag', /atual=high\|ok\|.*atual_origem=flag/.test(r.stdout), r.stdout);
r = sh('esforco.sh', ['executar'], '', { HARNESS_ESFORCO_AUTODETECT: 'on', HARNESS_ESFORCO_CMDLINE: 'claude --effort xhigh', CLAUDE_CODE_EFFORT_LEVEL: 'medium' });
ok('CLAUDE_CODE_EFFORT_LEVEL=medium vence a cmdline => executar ok|atual_origem=env', /ESFORCO\|executar\|alvo=medium\|atual=medium\|ok\|.*atual_origem=env/.test(r.stdout), r.stdout);
r = sh('esforco.sh', ['pensar'], '', { HARNESS_ESFORCO_AUTODETECT: 'off' });
ok('autodetect off e nada informado => atual=n/d', /atual=n\/d\|n\/d\|.*atual_origem=n\/d/.test(r.stdout), r.stdout);
limparRun();

console.log('== T6/T7 stop: aviso de paralelismo so em exec; delegacoes contam ==');
const slug = PROJ.replace(/[\\/:]/g, '-');
const pdir = path.join(HOME, '.claude', 'projects', slug); fs.mkdirSync(pdir, { recursive: true });
const tA = new Date(Date.now() - 5 * 60 * 1000).toISOString();
fs.writeFileSync(path.join(pdir, 'sess.jsonl'), JSON.stringify({ type: 'user', timestamp: tA, message: { role: 'user', content: 'x' } }) + '\n' + JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'y' }], usage: { input_tokens: 10, output_tokens: 20 } } }) + '\n');
fs.writeFileSync(path.join(RUN, 'PRD-9-fase2.json'), JSON.stringify({ label: 'PRD-9-fase2', start: Math.floor(Date.now() / 1000) - 240 }));
r = sh('harness-metrics.sh', ['stop', 'PRD-9-fase2', '--tasks=7', '--ciclos=1', '--subagents=2', '--modo=leve'], '');
ok('stop PRD-9-fase2 com 7 tasks NAO avisa "Paralelismo cego"', r.status === 0 && !/Paralelismo cego/.test(r.stdout), `${r.status} ${r.stdout.slice(0, 300)} ${r.stderr.slice(0, 300)}`);
fs.writeFileSync(path.join(RUN, 'PRD-9-exec.json'), JSON.stringify({ label: 'PRD-9-exec', start: Math.floor(Date.now() / 1000) - 240 }));
r = sh('harness-metrics.sh', ['stop', 'PRD-9-exec', '--tasks=7', '--ciclos=1', '--subagents=2'], '');
ok('stop PRD-9-exec com 7 tasks sem --vivos-max AVISA "Paralelismo cego"', /Paralelismo cego/.test(r.stdout), `${r.status} ${r.stdout.slice(0, 300)} ${r.stderr.slice(0, 300)}`);
// T7: delegacoes no manifest versionado
const startT7 = Math.floor(Date.now() / 1000) - 240;
fs.writeFileSync(path.join(RUN, 'PRD-9-fase1.json'), JSON.stringify({ label: 'PRD-9-fase1', start: startT7 }));
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'delegations'), { recursive: true });
const tsD = isoLocal(new Date((startT7 + 30) * 1000));
fs.writeFileSync(path.join(PROJ, 'prds', '_metrics', 'delegations', 't@t.jsonl'),
  JSON.stringify({ ts: tsD, label: 'PRD-9', task: 'discovery-dts', role: 'peter-quill', ciclo: 1, executor: 'codex-cli', status: 'ok', duration_s: 120 }) + '\n' +
  JSON.stringify({ ts: tsD, label: 'PRD-9', task: 'impacto', role: 'atlas', ciclo: 1, executor: 'codex-cli', status: 'ok', duration_s: 150 }) + '\n' +
  JSON.stringify({ ts: tsD, label: 'PRD-8', task: 'impacto', role: 'atlas', ciclo: 1, executor: 'codex-cli', status: 'ok', duration_s: 999 }) + '\n');
r = sh('harness-metrics.sh', ['stop', 'PRD-9-fase1', '--ciclos=0', '--subagents=1', '--modo=leve'], '');
const runsDir = path.join(PROJ, 'prds', '_metrics', 'runs');
const linhas = () => { try { return fs.readdirSync(runsDir).map((f) => fs.readFileSync(path.join(runsDir, f), 'utf8')).join('\n'); } catch { return ''; } };
const L9 = linhas().split('\n').filter((l) => /"label":"PRD-9-fase1"/.test(l)).pop() || ''; let o9 = {}; try { o9 = JSON.parse(L9); } catch {}
ok('stop PRD-9-fase1: 2 delegacoes do PRD-9 entram (subagent_measured=2, PRD-8 ignorada)', String(o9.subagent_measured) === '2', `${r.status} ${L9.slice(0, 400)} ${r.stderr.slice(0, 200)}`);
// parallel_factor so existe com elapsed_active_s (waitS do mjs) — no sandbox sem permission-waits o mjs omite; o que se prova aqui e a soma
ok('stop PRD-9-fase1: subagent_busy_min=4 (270 s); parallel_factor > 0 quando ha janela ativa', String(o9.subagent_busy_min) === '4' && (o9.elapsed_active_s === '' || Number(o9.parallel_factor) > 0), `${o9.subagent_busy_min} ${o9.parallel_factor} ativo=${o9.elapsed_active_s}`);
ok('stop PRD-9-fase1: codex=ok e extra "delegacoes=2 (270s"', o9.codex === 'ok' && /delegacoes=2 \(270s/.test(r.stdout), `${o9.codex} ${r.stdout.slice(0, 400)}`);
limparRun();

console.log('== T8 guard-bash: bash -n em comando multi-linha ==');
const gb = await import(pathToFileURL(path.join(HOOKS, 'guard-bash.mjs')).href);
const SESS_T = path.join(S, 'sess', 'main.jsonl'); fs.mkdirSync(path.dirname(SESS_T), { recursive: true }); fs.writeFileSync(SESS_T, '');
const bashPayload = (cmd) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Bash', transcript_path: SESS_T, tool_input: { command: cmd } });
const RUIM = ['set -e', 'for i in 1 2 3; do', '  echo "linha $i"', 'done', "MSG='faltou fechar", 'echo "$MSG"', 'echo a', 'echo b', 'echo c', 'echo fim'].join('\n');
const BOM = ['set -e', 'for i in 1 2 3; do', '  echo "linha $i"', 'done', "MSG='fechou'", 'echo "$MSG"', 'echo a', 'echo b', 'echo c', 'echo fim'].join('\n');
let g = gb.guardBash(bashPayload(RUIM), 'pre', { root: PROJ });
ok('10 linhas com aspa aberta => exit 2 e [guard-bash] SINTAXE com a linha do bash', g.exit === 2 && /SINTAXE/.test(g.stderr) && /unexpected EOF|EOF/i.test(g.stderr), `${g.exit} ${g.stderr.slice(0, 300)}`);
g = gb.guardBash(bashPayload(BOM), 'pre', { root: PROJ });
ok('10 linhas validas => passa (exit 0)', g.exit === 0, `${g.exit} ${g.stderr.slice(0, 300)}`);
g = gb.guardBash(bashPayload("echo 'aberta"), 'pre', { root: PROJ });
ok('1 linha com aspa aberta => NAO e o guard de sintaxe (so >= 8 linhas)', !/SINTAXE/.test(g.stderr), g.stderr.slice(0, 200));

console.log('== T9 guard-write: marcadores de conflito ==');
const wPayload = (fp, content) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: fp, content } });
r = sh('guard-write.sh', [], wPayload(path.join(PROJ, 'novo.md'), '# x\n<<<<<<< HEAD\na\n=======\nb\n>>>>>>> wt/x\n'));
ok('Write com <<<<<<< / ======= / >>>>>>> => exit 2', r.status === 2 && /marcadores de conflito/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-write.sh', [], wPayload(path.join(PROJ, 'novo.md'), '# x\nlinha normal com ======= no meio\n'));
ok('Write sem marcador em inicio de linha => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);

console.log('== T10 guard-agent: papel fora do catalogo durante skill => aviso, nao nega ==');
fs.writeFileSync(path.join(RUN, 'PRD-9-fase1.json'), JSON.stringify({ label: 'PRD-9-fase1', start: Math.floor(Date.now() / 1000) }));
const agPayload = (tipo, desc) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: tipo, description: desc, prompt: 'Liste os DTs relacionados a agenda em prds/debito_tecnico/INDEX.md', model: 'sonnet' } });
r = sh('guard-agent.sh', [], agPayload('general-purpose', 'Discovery: DTs relacionados PRD-9'));
ok('general-purpose com PRD-9-fase1 vivo => exit 0 + additionalContext "fora do catalogo"', r.status === 0 && /additionalContext/.test(r.stdout) && /fora do catalogo/.test(r.stdout), `${r.status} ${r.stdout.slice(0, 300)} ${r.stderr.slice(0, 300)}`);
limparRun();
r = sh('guard-agent.sh', [], agPayload('general-purpose', 'Discovery: DTs relacionados PRD-9'));
ok('general-purpose SEM skill viva => silencio', r.status === 0 && !/fora do catalogo/.test(r.stdout), `${r.status} ${r.stdout.slice(0, 300)}`);

console.log(`\n${pass} PASS · ${fail} FAIL · sandbox ${S}${process.env.T_KEEP ? ' (mantido)' : ''}`);
if (!process.env.T_KEEP) fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
