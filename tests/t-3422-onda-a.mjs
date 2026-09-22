#!/usr/bin/env node
// tests/t-3422-onda-a.mjs — bateria da 3.4.22 (Onda A: itens 7, 8, 14, 16, 20).
// Roda em SANDBOX proprio (projeto falso + HOME falso em os.tmpdir()), nunca toca o projeto real
// nem o ~/.harness-run da maquina. Precisa de node >= 18, bash (Git Bash), git e curl no PATH.
//   node tests/t-3422-onda-a.mjs
// Porta de teste do daemon: 47897 (127.0.0.1).

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3422-sandbox-' + process.pid);   // 3.4.23: sandbox por pid (instancias paralelas nao se apagam)
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };
const PORT = 47897;

// ---------------------------------------------------------------- sandbox
fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
// 3.5.4: o folego pesa Read/Grep/Glob em 0.5 por default; esta bateria prova a MECANICA do teto (contagem 3.4.22), entao fixa peso 1
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_DAEMON_PORT='${PORT}'\nHARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_FOLEGO_PESO_LEITURA='1'\n`);
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'prds', 'PRD-001-teste', 'tasks'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'api'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'api', 'x.php'), '<?php\nfunction f() { return 1; }\n');
fs.writeFileSync(path.join(PROJ, 'prds', 'PRD-001-teste', 'tasks', 'TASK-001-teste.md'), '# TASK-001 — teste\n\n| **Tipo** | backend |\n| **Duelo** | nao — teste |\n\n## Objetivo\n\nMexer em `api/x.php`.\n\n## Arquivos afetados\n\n- `api/x.php`\n');
console.log('sandbox:', PROJ);

// slug como o Claude Code grava: caminho absoluto com / e : trocados por -
const projW = spawnSync('bash', ['-c', 'cd "$0" && pwd -W', PROJ], { encoding: 'utf8' }).stdout.trim() || PROJ.replace(/\\/g, '/');
const SLUG = projW.replace(/[\/:\\]/g, '-').replace(/^-+/, '');
const SESS = 'sess-aaaa-bbbb';
const SESSDIR = path.join(HOME, '.claude', 'projects', SLUG, SESS);
const SUBDIR = path.join(SESSDIR, 'subagents');
fs.mkdirSync(SUBDIR, { recursive: true });
fs.writeFileSync(SESSDIR + '.jsonl', JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), message: { role: 'user', content: 'oi' } }) + '\n');

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, extra); } };
const run = (file, args, input, env = {}) => spawnSync(process.execPath, [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const sh = (file, args, input, env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const LOCAL = path.join(PROJ, '.claude', 'harness.env.local');
const LOCAL0 = fs.readFileSync(LOCAL, 'utf8');
const comKnob = (linha, fn) => { fs.writeFileSync(LOCAL, LOCAL0 + linha + '\n'); try { return fn(); } finally { fs.writeFileSync(LOCAL, LOCAL0); } };

// transcript fake de subagente: n tool_use (em turnos de 3), com timestamps de `dur` segundos
function transcript(id, papel, nTools, opts = {}) {
  const f = path.join(SUBDIR, `agent-${id}.jsonl`);
  const t0 = Date.now() - (opts.dur || 120) * 1000;
  const linhas = [];
  linhas.push(JSON.stringify({ parentUuid: null, isSidechain: true, agentId: id, type: 'user', message: { role: 'user', content: opts.prompt || `Implemente a TASK-001 (packet em .claude/.harness-run/packets/TASK-001.packet.md)` }, timestamp: new Date(t0).toISOString(), sessionId: SESS }));
  let feitas = 0, i = 0;
  while (feitas < nTools) {
    const k = Math.min(3, nTools - feitas);
    const content = [];
    for (let j = 0; j < k; j++) content.push({ type: 'tool_use', id: `tu${i}_${j}`, name: (j % 2) ? 'Read' : 'Bash', input: { command: 'php -l api/x.php' } });
    linhas.push(JSON.stringify({ isSidechain: true, agentId: id, type: 'assistant', message: { role: 'assistant', model: 'claude-sonnet-5', content, usage: { input_tokens: 100, output_tokens: 50 } }, timestamp: new Date(t0 + 1000 * (i + 1)).toISOString(), sessionId: SESS }));
    feitas += k; i++;
  }
  linhas.push(JSON.stringify({ isSidechain: true, agentId: id, type: 'assistant', message: { role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: opts.final || '# 🔨 Hefesto — TASK-001\n\n**Status:** ✅ CONCLUÍDA\n' }], usage: { input_tokens: 10, output_tokens: 20 } }, timestamp: new Date(t0 + (opts.dur || 120) * 1000).toISOString(), sessionId: SESS }));
  fs.writeFileSync(f, linhas.join('\n') + '\n');
  fs.writeFileSync(f.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: papel, description: opts.desc || 'TASK-001 hefesto', toolUseId: 'toolu_' + id, spawnDepth: 1 }));
  return f;
}
const payloadTool = (tool, input, tp, extra = {}) => JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, transcript_path: tp, ...extra });

console.log('\n== T1 guard-folego (item 7) ==');
const tPai = SESSDIR + '.jsonl';
const t40 = transcript('a40', 'hefesto', 40);
const t95 = transcript('a95', 'hefesto', 95);
const t100h = transcript('h100', 'hermes', 100);
const t125h = transcript('h125', 'hermes', 125);
let r = run('guard-folego.mjs', [], payloadTool('Bash', { command: 'echo' }, tPai));
ok('sessao pai nunca e negada', r.status === 0, r.stderr);
r = run('guard-folego.mjs', [], payloadTool('Bash', { command: 'echo' }, t40));
ok('hefesto com 40 chamadas passa', r.status === 0, r.stderr);
r = run('guard-folego.mjs', [], payloadTool('Bash', { command: 'echo' }, t95));
ok('hefesto com 95 chamadas => deny com PARCIAL-TEMPO', r.status === 2 && r.stderr.includes('PARCIAL-TEMPO') && r.stderr.includes('teto 90'), `${r.status} ${r.stderr.slice(0, 160)}`);
r = run('guard-folego.mjs', [], payloadTool('Write', { file_path: path.join(PROJ, '.claude', '.harness-run', 'relatorios', 'TASK-001-hefesto.md'), content: 'x' }, t95));
ok('Write do relatorio passa acima do teto', r.status === 0, r.stderr);
r = run('guard-folego.mjs', [], payloadTool('Edit', { file_path: path.join(PROJ, 'api', 'x.php') }, t95));
ok('Edit em codigo acima do teto => deny', r.status === 2, r.stderr.slice(0, 100));
r = run('guard-folego.mjs', [], payloadTool('Bash', { command: 'echo' }, t100h));
ok('hermes com 100 passa (teto 120)', r.status === 0, r.stderr);
r = run('guard-folego.mjs', [], payloadTool('Bash', { command: 'echo' }, t125h));
ok('hermes com 125 => deny', r.status === 2 && r.stderr.includes('hermes'), r.stderr.slice(0, 100));
comKnob("HARNESS_GUARD_FOLEGO='off'", () => { const x = run('guard-folego.mjs', [], payloadTool('Bash', { command: 'echo' }, t95)); ok('knob off => passa', x.status === 0, x.stderr); });
comKnob("HARNESS_FOLEGO_hefesto='200'", () => { const x = run('guard-folego.mjs', [], payloadTool('Bash', { command: 'echo' }, t95)); ok('teto por papel via env (200) => passa', x.status === 0, x.stderr); });
// cursor: 2a chamada le so o delta (estado gravado)
const stf = path.join(PROJ, '.claude', '.harness-run', 'folego', 'a95.json');
ok('cursor por agente gravado', fs.existsSync(stf) && JSON.parse(fs.readFileSync(stf, 'utf8')).n === 95, fs.existsSync(stf) ? fs.readFileSync(stf, 'utf8') : 'sem arquivo');
ok('telemetria folego.jsonl gravada', fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'folego.jsonl')));
// via guard-bash (Bash em subagente acima do teto)
fs.rmSync(path.join(PROJ, '.claude', '.harness-run', 'exec-attempts'), { recursive: true, force: true });
r = run('guard-bash.mjs', [], payloadTool('Bash', { command: 'php -l api/x.php' }, t95));
ok('guard-bash pre em subagente acima do teto => deny do folego', r.status === 2 && r.stderr.includes('guard-folego'), `${r.status} ${r.stderr.slice(0, 120)}`);
r = run('guard-bash.mjs', [], payloadTool('Bash', { command: 'php -l api/x.php' }, t40));
ok('guard-bash pre abaixo do teto segue normal', r.status === 0, r.stderr);

console.log('\n== T1b daemon: rota guard-folego ==');
run('harness-daemon.mjs', ['--stop'], '');
const ens = run('harness-daemon.mjs', ['--ensure', PROJ], '');
ok('daemon --ensure', ens.stdout.includes('ativo'), ens.stdout + ens.stderr);
const post = (p, body) => new Promise((resolve) => { const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST' }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); }); req.on('error', () => resolve(null)); req.write(body); req.end(); });
let d = await post('/h/PreToolUse/guard-folego', payloadTool('Edit', { file_path: path.join(PROJ, 'api', 'x.php') }, t95));
ok('daemon: Edit acima do teto => JSON deny', d && d.status === 200 && d.body.includes('"permissionDecision":"deny"') && d.body.includes('PARCIAL-TEMPO'), JSON.stringify(d).slice(0, 200));
d = await post('/h/PreToolUse/guard-folego', payloadTool('Edit', { file_path: path.join(PROJ, 'api', 'x.php') }, t40));
ok('daemon: Edit abaixo do teto => 200 vazio', d && d.status === 200 && d.body === '', JSON.stringify(d));
const curl = spawnSync('curl', ['-sf', '-m', '8', '--data-binary', '@-', `http://127.0.0.1:${PORT}/h/PreToolUse/guard-folego`], { input: payloadTool('Write', { file_path: path.join(PROJ, 'api', 'y.php') }, t95), encoding: 'utf8' });
ok('curl -sf (como no settings) devolve o deny', curl.status === 0 && curl.stdout.includes('deny'), `${curl.status} ${curl.stdout.slice(0, 100)}`);
ok('settings.json wired: Edit|Write -> guard-folego', fs.readFileSync(path.join(PROJ, '.claude', 'settings.json'), 'utf8').includes('/h/PreToolUse/guard-folego'));

console.log('\n== T2 task-telemetry (item 8) ==');
fs.mkdirSync(path.join(PROJ, '.claude', '.harness-run', 'packets'), { recursive: true });
fs.writeFileSync(path.join(PROJ, '.claude', '.harness-run', 'packets', 'TASK-001.packet.md'), '# TASK PACKET — TASK-001\n\n### `api/x.php`\n\n```\n' + 'x'.repeat(20000) + '\n```\n');
const stopPayload = (id, papel) => JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'SubagentStop', agent_id: id, agent_type: papel, transcript_path: tPai });
const tA = transcript('t001', 'hefesto', 9, { dur: 300 });
r = run('task-telemetry.mjs', [], stopPayload('t001', 'hefesto'));
ok('CLI grava linha TASK|hefesto|TASK-001', r.stdout.includes('TASK|hefesto|TASK-001|300s|4 turnos|✅'), r.stdout + r.stderr);
const tasksDir = path.join(PROJ, 'prds', '_metrics', 'tasks');
const tf = fs.existsSync(tasksDir) ? fs.readdirSync(tasksDir).filter(f => f.endsWith('.jsonl')) : [];
ok('arquivo tasks/<dev>@<host>.jsonl criado', tf.length === 1 && /@/.test(tf[0]), tf.join(','));
const l1 = tf.length ? JSON.parse(fs.readFileSync(path.join(tasksDir, tf[0]), 'utf8').trim().split('\n').pop()) : {};
ok('linha: papel/rotulo/modelo/dur/turnos/bash/read/packet', l1.papel === 'hefesto' && l1.rotulo === 'TASK-001' && l1.modelo === 'claude-sonnet-5' && l1.dur_s === 300 && l1.turnos === 4 && l1.bash === 6 && l1.read === 3 && l1.packet_kb === 20 && l1.alvos === 1 && l1.projeto === 'proj', JSON.stringify(l1));
ok('linha: status e tokens', l1.status === '✅' && l1.tokens_out === 170 && l1.tokens_in === 310, JSON.stringify(l1));
// via presence --agent-end (o caminho real do settings)
transcript('t002', 'sherlock', 6, { dur: 200, desc: 'sherlock ciclo 2 PRD-001', prompt: 'Review PRD-001 ciclo 2', final: '# Sherlock\n\n**Veredito:** ⚠️ Bloqueantes encontrados\n**Placar:** 🔴 2 bloqueantes · 🔵 1 sugestões\n' });
r = run('presence.mjs', ['--agent-end'], stopPayload('t002', 'sherlock'));
const linhas2 = fs.readFileSync(path.join(tasksDir, tf[0]), 'utf8').trim().split('\n');
const l2 = JSON.parse(linhas2.pop());
ok('presence --agent-end grava (presenca desligada nao apaga a medicao)', linhas2.length === 1 && l2.papel === 'sherlock' && l2.rotulo === 'PRD-001-c2' && l2.vermelhos === 2 && l2.status === '⚠️', JSON.stringify(l2));
// daemon: SubagentStop via rota presence tambem grava
transcript('t003', 'dedalo', 3, { dur: 100, desc: 'TASK-002 dedalo', final: 'Status: ⚠️ PARCIAL-TEMPO' });
d = await post('/h/SubagentStop/presence', stopPayload('t003', 'dedalo'));
const l3 = JSON.parse(fs.readFileSync(path.join(tasksDir, tf[0]), 'utf8').trim().split('\n').pop());
ok('daemon SubagentStop/presence grava a task (status PARCIAL)', d && d.status === 200 && l3.papel === 'dedalo' && l3.status === 'PARCIAL', JSON.stringify(l3));
// p90 / previsao / ultima
for (let i = 0; i < 10; i++) { transcript('p' + i, 'hefesto', 6, { dur: 600 + i * 6 }); run('task-telemetry.mjs', [], stopPayload('p' + i, 'hefesto')); }
r = run('task-telemetry.mjs', ['--p90', 'hefesto'], '');
ok('--p90 hefesto com >= 5 amostras', /^\d+$/.test(r.stdout.trim()) && Number(r.stdout) >= 600, r.stdout);
r = run('task-telemetry.mjs', ['--p90', 'beholder'], '');
ok('--p90 sem amostras => vazio', r.stdout.trim() === '', r.stdout);
r = run('task-telemetry.mjs', ['--previsao', 'hefesto', '20', '1'], '');
ok('--previsao com packet parecido => min|n=k', /^\d+\|n=\d+$/.test(r.stdout.trim()) && Number(r.stdout.split('|')[1].slice(2)) >= 3, r.stdout);
r = run('task-telemetry.mjs', ['--ultima', 'hefesto'], '');
ok('--ultima hefesto => dur|turnos|rotulo|id|status', /^\d+\|\d+\|TASK-001\|p9\|/.test(r.stdout), r.stdout);
r = sh('watchdog-baseline.sh', ['--teto', 'hefesto'], '');
ok('watchdog-baseline usa o p90 das tasks (teto = 2x p90 ~ 1300)', Number(r.stdout.trim()) >= 1200 && Number(r.stdout.trim()) <= 1400, r.stdout);
r = sh('task-packet.sh', ['prds/PRD-001-teste/tasks/TASK-001-teste.md', '--check'], '');
ok('task-packet --check imprime PACKET-CHECK + PREVISAO', r.stdout.includes('PACKET-CHECK|TASK-001') && /PREVISAO\|TASK-001\|(\d+ min|n\/d)/.test(r.stdout), r.stdout + r.stderr);

console.log('\n== T3 guard-agent (7b general-purpose, 20.2 fatia, --post sem .start) ==');
const agentPayload = (tipo, prompt, desc = '') => JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: tipo, prompt, description: desc }, transcript_path: tPai });
r = sh('guard-agent.sh', [], agentPayload('general-purpose', 'Implemente a TASK-001; seu contexto esta em .claude/.harness-run/packets/TASK-001.packet.md'));
ok('general-purpose com task+packet => deny apontando hefesto', r.status === 2 && r.stderr.includes('hefesto'), `${r.status} ${r.stderr.slice(0, 120)}`);
r = sh('guard-agent.sh', [], agentPayload('general-purpose', 'fallback: hefesto -> general-purpose. Implemente a TASK-001 (packet .claude/.harness-run/packets/TASK-001.packet.md)'));
ok('general-purpose com fallback declarado passa', r.status === 0, r.stderr);
r = sh('guard-agent.sh', [], agentPayload('general-purpose', 'Discovery da PRD-001: liste DTs relacionados em prds/debito_tecnico'));
ok('general-purpose no discovery (sem task/packet) passa', r.status === 0, r.stderr);
r = sh('guard-agent.sh', [], agentPayload('general-purpose', 'Faca o review do working tree, ciclo 2, e liste os bloqueantes'));
ok('general-purpose em review de ciclo => deny apontando sherlock', r.status === 2 && r.stderr.includes('sherlock'), `${r.status} ${r.stderr.slice(0, 120)}`);
comKnob("HARNESS_GUARD_GP='off'", () => { const x = sh('guard-agent.sh', [], agentPayload('general-purpose', 'Implemente a TASK-001 packet .claude/.harness-run/packets/TASK-001.packet.md')); ok('HARNESS_GUARD_GP=off => passa', x.status === 0, x.stderr); });
fs.mkdirSync(path.join(PROJ, '.claude', '.harness-run', 'review'), { recursive: true });
fs.writeFileSync(path.join(PROJ, '.claude', '.harness-run', 'review', 'PRD-136.review-packet.md'), '# REVIEW PACKET — PRD-136\n');
r = sh('guard-agent.sh', [], agentPayload('sherlock', 'Review ciclo 1 da PRD-136-b; seu contexto esta em .claude/.harness-run/review/PRD-136.review-packet.md'));
ok('sherlock PRD-136-b com packet da mae passa', r.status === 0, r.stderr.slice(0, 120));
r = sh('guard-agent.sh', [], agentPayload('sherlock', 'Review ciclo 1 da PRD-137-b'));
ok('sherlock PRD-137-b sem packet => deny', r.status === 2 && r.stderr.includes('PRD-137-b'), `${r.status} ${r.stderr.slice(0, 120)}`);
// --post: overrun lido da telemetria por task (sem .start)
transcript('ov1', 'hefesto', 6, { dur: 5000 });
run('task-telemetry.mjs', [], stopPayload('ov1', 'hefesto'));
r = sh('guard-agent.sh', ['--post'], agentPayload('hefesto', 'TASK-001', 'TASK-001 hefesto'));
ok('--post: overrun (5000 s > teto) => additionalContext watchdog', r.status === 0 && r.stdout.includes('[watchdog]') && r.stdout.includes('acima do teto'), r.stdout.slice(0, 200) + r.stderr.slice(0, 100));
ok('overrun logado em watchdog-overruns.jsonl (com agent/turnos)', fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'watchdog-overruns.jsonl')) && fs.readFileSync(path.join(PROJ, '.claude', '.harness-run', 'watchdog-overruns.jsonl'), 'utf8').includes('"agent":"ov1"'));
transcript('pt1', 'hefesto', 6, { dur: 100, final: 'Status: ⚠️ PARCIAL-TEMPO — faltou X' });
run('task-telemetry.mjs', [], stopPayload('pt1', 'hefesto'));
r = sh('guard-agent.sh', ['--post'], agentPayload('hefesto', 'TASK-001', 'TASK-001 hefesto'));
ok('--post: retorno PARCIAL => aviso de redespacho', r.stdout.includes('PARCIAL-TEMPO'), r.stdout.slice(0, 200));
transcript('hp1', 'hermes', 6, { dur: 100, desc: 'hermes Modo C PRD-001', final: 'PARCIAL-TEMPO: faltou tasks/TASK-003' });
run('task-telemetry.mjs', [], stopPayload('hp1', 'hermes'));
r = sh('guard-agent.sh', ['--post'], agentPayload('hermes', 'Modo C PRD-001', 'hermes C'));
ok('--post hermes PARCIAL => aviso por documento (item 14)', r.stdout.includes('[hermes]') && r.stdout.includes('OUTRO hermes por documento'), r.stdout.slice(0, 200));
ok('nenhum marcador .start criado', !fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'watchdog')));

console.log('\n== T4 agent-stall sem find -printf (item 20.1) ==');
fs.rmSync(path.join(SUBDIR, 'agent-a95.jsonl')); fs.rmSync(path.join(SUBDIR, 'agent-a95.meta.json'));
r = sh('agent-stall.sh', ['0'], '');
ok('agent-stall lista vivos (toolUseId sem resultado no pai) com min=0', /STALL-RESUMO\|vivos=\d+\|parados=\d+/.test(r.stdout) && /vivos=[1-9]/.test(r.stdout) && r.stdout.includes('STALL|'), r.stdout.slice(0, 300) + r.stderr);

console.log('\n== T5 denied/notify: JSON valido com quebra de linha e tab (item 20.8) ==');
sh('denied.sh', [], JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo a\n\tgrep "x" b\r\n' } }), { HARNESS_NOTIFY_CMD: '' });
sh('notify.sh', [], JSON.stringify({ message: 'Claude needs your permission\n\tto run\tcat' }), { HARNESS_NOTIFY_CMD: '' });
const waits = fs.readFileSync(path.join(PROJ, '.claude', '.harness-run', 'permission-waits.jsonl'), 'utf8').trim().split('\n');
ok('permission-waits.jsonl: todas as linhas parseiam', waits.length >= 2 && waits.every(l => { try { JSON.parse(l); return true; } catch { return false; } }), waits.join(' || '));

console.log('\n== T6 harness-metrics stop faz git add (item 16) ==');
const git = (...a) => spawnSync('git', a, { cwd: PROJ, encoding: 'utf8', env: ENVB });
git('init', '-q'); git('config', 'user.email', 'teste@beta'); git('config', 'user.name', 'teste');
fs.writeFileSync(path.join(PROJ, '.gitignore'), '.claude/.harness-run/\nprds/_metrics/harness-runs.jsonl\n');
git('add', '-A'); git('commit', '-qm', 'base');
transcript('g1', 'hefesto', 3, { dur: 50 }); run('task-telemetry.mjs', [], stopPayload('g1', 'hefesto'));   // tasks/ modificado apos o commit
sh('harness-metrics.sh', ['start', 'PRD-001-exec'], '');
r = sh('harness-metrics.sh', ['stop', 'PRD-001-exec', '--tasks=1'], '');
const staged = git('diff', '--cached', '--name-only').stdout;
ok('stop imprime "Telemetria no git" e deixa runs/ e tasks/ staged', r.stdout.includes('Telemetria no git') && /prds\/_metrics\/runs\/.*\.jsonl/.test(staged) && /prds\/_metrics\/tasks\/.*\.jsonl/.test(staged), r.stdout.split('\n').filter(l => l.includes('git')).join(' | ') + ' :: ' + staged);
ok('nada commitado pelo stop', git('log', '--oneline').stdout.trim().split('\n').length === 1);
git('reset', '-q');
comKnob("HARNESS_METRICS_GIT_ADD='0'", () => { sh('harness-metrics.sh', ['start', 'PRD-002-exec'], ''); const x = sh('harness-metrics.sh', ['stop', 'PRD-002-exec'], ''); ok('knob 0 => nao faz git add', !x.stdout.includes('Telemetria no git') && git('diff', '--cached', '--name-only').stdout.trim() === '', x.stdout.slice(0, 100)); });

console.log('\n== T7 guard-stop: telemetria fora do stage ha > 1 h (item 16) ==');
const tfile = path.join(tasksDir, tf[0]);
transcript('g2', 'hefesto', 3, { dur: 50 }); run('task-telemetry.mjs', [], stopPayload('g2', 'hefesto'));   // modificado vs HEAD
const velho = new Date(Date.now() - 2 * 3600 * 1000);
fs.utimesSync(tfile, velho, velho);
r = sh('guard-stop.sh', [], JSON.stringify({ session_id: SESS, cwd: PROJ }));
ok('guard-stop bloqueia 1x com git add do arquivo', r.stdout.includes('"decision":"block"') && r.stdout.includes('git add') && r.stdout.includes('tasks/'), r.stdout.slice(0, 200));
r = sh('guard-stop.sh', [], JSON.stringify({ session_id: SESS, cwd: PROJ }));
ok('guard-stop nao repete no mesmo dia', !r.stdout.includes('telemetria desta maquina'), r.stdout.slice(0, 120));

console.log('\n== T8 doctor: guard-folego wired + limpeza de .start ==');
fs.mkdirSync(path.join(PROJ, '.claude', '.harness-run', 'watchdog'), { recursive: true });
fs.writeFileSync(path.join(PROJ, '.claude', '.harness-run', 'watchdog', 'hefesto-TASK-9.start'), '1\n');
fs.copyFileSync(path.join(MASTER, '.claude', 'harness-doctor.sh'), path.join(PROJ, '.claude', 'harness-doctor.sh'));
r = spawnSync('bash', [path.join(PROJ, '.claude', 'harness-doctor.sh')], { cwd: PROJ, encoding: 'utf8', env: ENVB });
ok('doctor reporta folego ENFORCADO e remove .start orfaos', /teto de folego ENFORCADO/.test(r.stdout) && !fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'watchdog')), (r.stdout.match(/.*folego.*|.*\.start.*/g) || []).join(' | '));

console.log('\n== T9 (3.4.27) payload REAL do hook dentro do subagente: agent_id + transcript_path do PAI ==');
{
  const t95r = transcript('r95', 'hefesto', 95);                      // arquivo em <sess>/subagents/agent-r95.jsonl
  const real = (tool, input, extra = {}) => JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, transcript_path: tPai, agent_id: 'r95', agent_type: 'hefesto', ...extra });
  let x = run('guard-folego.mjs', [], real('Bash', { command: 'echo' }));
  ok('folego: agent_id + transcript do pai => acha o transcript do agente e NEGA acima do teto', x.status === 2 && x.stderr.includes('hefesto') && x.stderr.includes('teto 90'), `${x.status} ${x.stderr.slice(0, 120)}`);
  fs.rmSync(path.join(PROJ, '.claude', '.harness-run', 'exec-attempts'), { recursive: true, force: true });
  x = run('guard-bash.mjs', [], JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cat api/x.php' }, transcript_path: tPai, agent_id: 'novo1', agent_type: 'sherlock' }));
  ok('GUARDA 0: agent_id no payload (sem /subagents/ no caminho) => subagente => nega leitura via Bash', x.status === 2 && x.stderr.includes('Read'), `${x.status} ${x.stderr.slice(0, 120)}`);
  x = run('guard-bash.mjs', [], JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cat api/x.php' }, transcript_path: tPai }));
  ok('GUARDA 0: sem agent_id e sem /subagents/ => sessao pai => passa', x.status === 0, x.stderr.slice(0, 120));
  // SubagentStop com agent_transcript_path (formato da doc) + dedup por agent_id
  transcript('s1', 'hefesto', 6, { dur: 90, desc: 'TASK-001 hefesto' });
  const stopReal = JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'SubagentStop', agent_id: 's1', agent_type: 'hefesto', transcript_path: tPai, agent_transcript_path: path.join(SUBDIR, 'agent-s1.jsonl') });
  x = run('task-telemetry.mjs', [], stopReal);
  ok('task-telemetry: agent_transcript_path do SubagentStop e usado', x.stdout.includes('TASK|hefesto|TASK-001|90s'), x.stdout + x.stderr);
  const antes = fs.readFileSync(path.join(tasksDir, tf[0]), 'utf8').split('\n').filter(Boolean).length;
  run('task-telemetry.mjs', [], stopReal);
  const depois = fs.readFileSync(path.join(tasksDir, tf[0]), 'utf8').split('\n').filter(Boolean).length;
  ok('task-telemetry: 2o SubagentStop do mesmo agent_id NAO grava (dedup)', depois === antes, `${antes} -> ${depois}`);
  x = run('task-telemetry.mjs', [], JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'SubagentStop', agent_id: 'fantasma999', agent_type: 'hefesto', transcript_path: tPai }));
  ok('task-telemetry: agent_id sem transcript => NAO cai no arquivo mais recente (sem linha fantasma)', x.stdout.trim() === '', x.stdout);
}

run('harness-daemon.mjs', ['--stop'], '');
process.on('exit', () => { try { run('harness-daemon.mjs', ['--stop'], ''); } catch {} });   // 3.4.23: daemon orfao segurava o sandbox da rodada seguinte
console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail ? 1 : 0);
