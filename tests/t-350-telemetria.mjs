#!/usr/bin/env node
// tests/t-350-telemetria.mjs — bateria da 3.5.0 (telemetria inteira por dev/maquina + incidentes novos + doctor).
// Roda em SANDBOX proprio (repo git falso em os.tmpdir()), nunca toca o projeto real.
//   node tests/t-350-telemetria.mjs
//
// O que prova (mecanico):
//   T1 harness_metrics_arquivo devolve prds/_metrics/<sub>/<user>@<host>.jsonl; harness_metrics_todos une legado + por dev.
//   T2 incidentes novos: denied.sh => tipo denied; guard-question.sh (modo noturno) => tipo pergunta;
//      guard-bash.mjs (GUARDA 0, todos) => tipo leitura; agent-stall.sh => tipo stall, UMA linha por agente.
//   T3 harness-metrics.sh sanear cobre duelos/<dev>.jsonl (linha invalida vai para .quarentena).
//   T4 harness-dashboard.mjs le duelos/ e delegations/ por dev (modelos e executor aparecem no JSON).
//   T5 harness-doctor.sh acusa dashboard gerado versionado, transcript cru versionado, tasks/ nunca commitado,
//      legado compartilhado (N/A) e dev fora da tabela de faixas.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-350-tel-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };
const MD = path.join(PROJ, 'prds', '_metrics');
const RUN = path.join(PROJ, '.claude', '.harness-run');

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
for (const f of ['harness.env', 'settings.json', 'harness-doctor.sh']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\nHARNESS_GUARD_READ_VIA_BASH='todos'\nHARNESS_NOTIFY_CMD=''\n`);
fs.mkdirSync(MD, { recursive: true }); fs.mkdirSync(RUN, { recursive: true });
const git = (args, cwd = PROJ) => spawnSync('git', args, { cwd, encoding: 'utf8', env: ENVB });
git(['init', '-q']); git(['config', 'user.email', 'ninguem@fora.da.tabela']); git(['config', 'user.name', 't']); git(['add', '.']); git(['commit', '-q', '-m', 'base']);

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 400)); } };
const sh = (file, args, input = '', env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const bashc = (script, env = {}) => spawnSync('bash', ['-c', script], { encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const incidentes = () => { try { return fs.readdirSync(path.join(MD, 'incidentes')).flatMap(f => fs.readFileSync(path.join(MD, 'incidentes', f), 'utf8').split('\n').filter(Boolean)); } catch { return []; } };
const norm = p => p.replace(/\\/g, '/');

console.log('== T1 arquivo por dev ==');
let r = bashc(`. .claude/hooks/_jsonl-append.sh; harness_metrics_arquivo "$PWD" duelos`);
ok('harness_metrics_arquivo => prds/_metrics/duelos/<user>@<host>.jsonl', /\/prds\/_metrics\/duelos\/[A-Za-z0-9._-]+@[A-Za-z0-9._-]+\.jsonl$/.test(norm(r.stdout)), r.stdout + r.stderr);
const ARQ = norm(r.stdout.trim());
fs.mkdirSync(path.join(MD, 'duelos'), { recursive: true });
fs.writeFileSync(path.join(MD, 'harness-duelos.jsonl'), '{"ev":"duelo","id":"L1"}\n');
fs.writeFileSync(path.join(MD, 'duelos', 'a@x.jsonl'), '{"ev":"duelo","id":"A1"}\n');
fs.writeFileSync(path.join(MD, 'duelos', 'b@y.jsonl'), '{"ev":"duelo","id":"B1"}\n');
r = bashc(`. .claude/hooks/_jsonl-append.sh; f="$(harness_metrics_todos "$PWD" duelos harness-duelos.jsonl)"; wc -l < "$f"; echo "$f"`);
ok('harness_metrics_todos une legado + por dev (3 linhas) em .harness-run/duelos-todos.jsonl', /^\s*3\s*$/m.test(r.stdout) && /duelos-todos\.jsonl/.test(r.stdout), r.stdout + r.stderr);
r = bashc(`. .claude/hooks/_jsonl-append.sh; . .claude/hooks/_incidente.sh; harness_incidente_arquivo "$PWD"`);
ok('_incidente.sh usa o mesmo nome por dev (incidentes/<user>@<host>.jsonl)', norm(r.stdout.trim()) === ARQ.replace('/duelos/', '/incidentes/'), r.stdout + ' vs ' + ARQ);

console.log('== T2 incidentes novos ==');
r = sh('denied.sh', [], JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PermissionDenied', tool_name: 'Bash', tool_input: { command: 'rm -rf /x' } }));
ok('denied.sh grava incidente tipo denied com ferramenta + comando', incidentes().some(l => /"tipo":"denied"/.test(l) && /Bash: rm -rf \/x/.test(l)), r.stdout + r.stderr + JSON.stringify(incidentes()));
fs.writeFileSync(path.join(RUN, 'modo'), 'noturno\n');
r = sh('guard-question.sh', [], JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Qual escopo?' }] } }));
ok('guard-question (noturno) nega e grava incidente tipo pergunta', r.status === 2 && incidentes().some(l => /"tipo":"pergunta"/.test(l) && /Qual escopo/.test(l)), r.status + ' ' + r.stderr.slice(0, 120) + JSON.stringify(incidentes()));
fs.rmSync(path.join(RUN, 'modo'));
const gbPayload = JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cat foo.php' } });
const gbUrl = 'file:///' + norm(path.join(HOOKS, 'guard-bash.mjs'));
r = spawnSync(process.execPath, ['--input-type=module', '-e', `import { guardBash } from ${JSON.stringify(gbUrl)}; const o = guardBash(${JSON.stringify(gbPayload)}, 'pre', { root: ${JSON.stringify(PROJ)} }); console.log(o.exit);`], { encoding: 'utf8', cwd: PROJ, env: ENVB });
ok('guard-bash.mjs (GUARDA 0, todos) nega leitura via Bash e grava incidente tipo leitura', /^2$/m.test(r.stdout) && incidentes().some(l => /"tipo":"leitura"/.test(l) && /cat foo\.php/.test(l)), r.stdout + r.stderr.slice(0, 300) + JSON.stringify(incidentes()));
// o fallback .sh so le harness.env (nao o .local): prova pelo caminho 'agentes' (transcript_path de subagente)
r = sh('guard-bash.sh', [], JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Bash', transcript_path: path.join(HOME, 'sess', 'subagents', 'agent-zz.jsonl'), tool_input: { command: 'cat foo.php' } }));
ok('guard-bash.sh (fallback, subagente) nega e tambem grava incidente leitura', r.status === 2 && incidentes().filter(l => /"tipo":"leitura"/.test(l)).length >= 2, r.status + ' ' + r.stderr.slice(0, 200) + JSON.stringify(incidentes()));
// agent-stall: sessao falsa em ~/.claude/projects/<slug>/ com 1 subagente mudo ha 10 min
const winPath = spawnSync('bash', ['-c', 'pwd -W 2>/dev/null || pwd'], { encoding: 'utf8', cwd: PROJ }).stdout.trim();
const SLUG = winPath.replace(/[\/:\\]/g, '-').replace(/^-+/, '');
const PDIR = path.join(HOME, '.claude', 'projects', SLUG, 'sess1', 'subagents');
fs.mkdirSync(PDIR, { recursive: true });
fs.writeFileSync(path.join(HOME, '.claude', 'projects', SLUG, 'sess1.jsonl'), '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"tu1","name":"Agent"}]}}\n{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tu1","content":"Async agent launched"}]}}\n');
fs.writeFileSync(path.join(PDIR, 'agent-a1.jsonl'), '{"type":"assistant"}\n');
fs.writeFileSync(path.join(PDIR, 'agent-a1.meta.json'), JSON.stringify({ toolUseId: 'tu1', agentType: 'hefesto', description: 'TASK-001 x' }));
const old = new Date(Date.now() - 10 * 60e3); fs.utimesSync(path.join(PDIR, 'agent-a1.jsonl'), old, old);
r = sh('agent-stall.sh', ['4']);
ok('agent-stall detecta o agente mudo (STALL|a1|hefesto|...)', /^STALL\|a1\|hefesto\|\d+\|/m.test(r.stdout), r.stdout + r.stderr);
ok('agent-stall grava incidente tipo stall (papel hefesto, agent a1)', incidentes().some(l => /"tipo":"stall"/.test(l) && /"papel":"hefesto"/.test(l) && /"agent":"a1"/.test(l)), JSON.stringify(incidentes()));
r = sh('agent-stall.sh', ['4']);
ok('segunda rodada do Monitor NAO duplica o incidente (marcador .harness-run/stall/a1)', incidentes().filter(l => /"tipo":"stall"/.test(l)).length === 1 && fs.existsSync(path.join(RUN, 'stall', 'a1')), JSON.stringify(incidentes()));

console.log('== T3 sanear ==');
fs.writeFileSync(path.join(MD, 'duelos', 'c@z.jsonl'), '{"ev":"duelo","id":"C1"}\n{isto nao e json\n');
r = sh('harness-metrics.sh', ['sanear']);
ok('sanear cobre duelos/<dev>.jsonl: 1 valida, 1 em quarentena', fs.existsSync(path.join(MD, 'duelos', 'c@z.jsonl.quarentena')) && fs.readFileSync(path.join(MD, 'duelos', 'c@z.jsonl'), 'utf8').trim().split('\n').length === 1, r.stdout + r.stderr);

console.log('== T4 dashboard le as pastas novas ==');
const iso = new Date(Date.now() - 5000).toISOString();   // 5 s atras: nunca no mesmo segundo do painel
fs.writeFileSync(path.join(MD, 'duelos', 'a@x.jsonl'), [
  JSON.stringify({ ev: 'duelo', id: 'd1', ts: iso, label: 'PRD-1', task: 'TASK-001', modelo_a: 'vendor/modelo-alfa', modelo_b: 'vendor/modelo-beta', status_a: 'ok', status_b: 'ok', aplica_a: 'sim', aplica_b: 'sim' }),
  JSON.stringify({ ev: 'veredito', id: 'd1', ts: iso, juiz: 'themis', vencedor: 'A', nota_a: 8, nota_b: 6, motivo: 'x' }),
  JSON.stringify({ ev: 'aplicado', id: 'd1', ts: iso, resultado: 'ok', motivo: '' })].join('\n') + '\n');
fs.mkdirSync(path.join(MD, 'delegations'), { recursive: true });
fs.writeFileSync(path.join(MD, 'delegations', 'a@x.jsonl'), JSON.stringify({ ts: iso, label: 'PRD-1', task: 'TASK-001', role: 'hefesto', ciclo: 1, host: 'claude', executor: 'openrouter-teste', cli_version: 'x', model: 'vendor/modelo-alfa', reasoning: 'low', mode: 'read-only', status: 'ok', exit_code: 0, duration_s: 10, timeout_s: 60, input_bytes: 1, output_bytes: 1, max_words: 0, tokens_in: '1', tokens_out: '1', tokens_cached: '0', tokens_fresh: '1', tokens_reasoning: '0', tokens_fonte: 'x', tree_tocado: 'nao', cost_usd: '0.0100', tag: '' }) + '\n');
const OUTD = path.join(S, 'out'); fs.mkdirSync(OUTD, { recursive: true });
r = spawnSync(process.execPath, [path.join(HOOKS, 'harness-dashboard.mjs'), '--projeto=proj', '--base=' + S, '--out=' + OUTD, '--periodo=7d', '--sem-transcripts'], { encoding: 'utf8', cwd: PROJ, env: ENVB });
const jsonOut = (() => { try { return fs.readdirSync(OUTD).filter(f => f.endsWith('.json')).map(f => fs.readFileSync(path.join(OUTD, f), 'utf8')).join('\n'); } catch { return ''; } })();
ok('dashboard: modelo do duelo em duelos/<dev>.jsonl aparece no JSON', /modelo-alfa/.test(jsonOut), (r.stdout + r.stderr).slice(0, 300) + ' json=' + jsonOut.length);
ok('dashboard: executor de delegations/<dev>.jsonl aparece no JSON', /openrouter-teste/.test(jsonOut), jsonOut.slice(0, 200));

console.log('== T5 doctor ==');
fs.writeFileSync(path.join(MD, 'harness-dashboard-2026-01-01_2026-01-02.html'), '<html></html>\n');
fs.mkdirSync(path.join(MD, 'transcripts-mac', 's1'), { recursive: true }); fs.writeFileSync(path.join(MD, 'transcripts-mac', 's1', 'agent-x.jsonl'), '{}\n');
fs.mkdirSync(path.join(MD, 'tasks'), { recursive: true }); fs.writeFileSync(path.join(MD, 'tasks', 'a@x.jsonl'), '{"papel":"hefesto"}\n');
git(['add', 'prds/_metrics/harness-dashboard-2026-01-01_2026-01-02.html', 'prds/_metrics/transcripts-mac', 'prds/_metrics/harness-duelos.jsonl']); git(['commit', '-q', '-m', 'lixo versionado']);
r = spawnSync('bash', [path.join(PROJ, '.claude', 'harness-doctor.sh')], { encoding: 'utf8', cwd: PROJ, env: ENVB, timeout: 300000 });
const D = r.stdout + r.stderr;
ok('doctor acusa dashboard gerado versionado', /1 dashboard\(s\) gerado\(s\) VERSIONADO/.test(D), D.slice(-1500));
ok('doctor acusa transcript cru versionado', /transcript\(s\) CRU\(S\) de agente versionado/.test(D), D.slice(-1500));
ok('doctor acusa tasks/ nunca commitado', /prds\/_metrics\/tasks\/: 1 arquivo\(s\) nunca commitado/.test(D), D.slice(-1500));
ok('doctor marca o legado compartilhado como N/A (historico)', /harness-duelos\.jsonl: formato compartilhado/.test(D), D.slice(-1500));
ok('doctor avisa dev fora da tabela de faixas', /NAO esta na tabela de faixas/.test(D) && /ninguem@fora\.da\.tabela/.test(D), D.slice(-1500));
ok('doctor: migrations em serie unica aparece como N/A informativo', /migrations em serie unica/.test(D), D.slice(-800));

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
