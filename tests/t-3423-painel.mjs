#!/usr/bin/env node
// tests/t-3423-painel.mjs — bateria da 3.4.23 (Onda B: itens 15, 17 e 11e — painel por dev/maquina,
// campos estruturados do stop, dedup/suspeitas, incidentes, cobertura).
// Roda em SANDBOX proprio (base de projetos falsos + projeto com hooks + HOME falso em os.tmpdir()),
// nunca toca o projeto real nem o ~/.harness-run da maquina. Precisa de node >= 18, bash (Git Bash)
// e git no PATH. Nao sobe daemon (porta reservada 47895 se um dia precisar).
//   node tests/t-3423-painel.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3423-sandbox');
const BASE = path.join(S, 'base'), HOME = path.join(S, 'home'), OUT = path.join(S, 'out');
const PROJ = path.join(S, 'proj'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const HOST = (os.hostname() || 'maquina').split('.')[0];
const TUSER = 'tdev';
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1', USER: TUSER, USERNAME: TUSER };

fs.rmSync(S, { recursive: true, force: true });
for (const d of [BASE, HOME, OUT]) fs.mkdirSync(d, { recursive: true });
console.log('sandbox:', S);

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 400)); } };
const NOW = Math.floor(Date.now() / 1000);
const H = 3600, D = 86400;

// ---------------------------------------------------------------- base falsa (3 projetos + 1 worktree)
function projeto(nome, versao, branch) {
  const d = path.join(BASE, nome);
  fs.mkdirSync(path.join(d, '.claude', '.harness-run'), { recursive: true });
  fs.mkdirSync(path.join(d, 'prds', '_metrics', 'runs'), { recursive: true });
  fs.mkdirSync(path.join(d, '.git'), { recursive: true });
  fs.writeFileSync(path.join(d, '.claude', 'harness.env'), `HARNESS_VERSION='${versao}'\n`);
  fs.writeFileSync(path.join(d, '.git', 'HEAD'), `ref: refs/heads/${branch}\n`);
  return d;
}
function linhaRun(projeto, maquina, label, tsEnd, elapsed, extra = {}) {
  return JSON.stringify({ projeto, autor: maquina.split('@')[0] + '@beta', maquina, harness: extra.harness || '3.4.23', extra: extra.extra || '', label, schema: '2.15.0', platform: 'claude',
    ts_start: tsEnd - elapsed, ts_end: tsEnd, elapsed_s: elapsed, elapsed_active_s: String(extra.ativo ?? elapsed), tasks: String(extra.tasks ?? ''), ciclos: '1', subagents: String(extra.subagents ?? 5), waves: '', preset: extra.preset || 'economico', models: '',
    tokens_output: String(extra.tok ?? 100000), tokens_input: '10', tokens_cache_read: '0', tokens_total: '100010', tokens_output_subagents: '50000', tokens_total_subagents: '0', out_tps: '10', out_tps_all: '15',
    max_gap_min: '1', wait_human_min: '0', wait_idle_min: '0', wait_gap_min: '', wait_gap_threshold_min: '10', subagent_busy_min: '30', subagent_measured: '5', parallel_factor: String(extra.par ?? '1.5'),
    permission_prompts: String(extra.perm ?? 1), classifier_denials: String(extra.den ?? 0), spiral_blocks: '0', achados_por_ciclo: '', linhas_por_task: '150', min_hermes_e: '', min_hermes_c: '', turnos_hermes: '', min_gates: '',
    modo: extra.modo || 'normal', limitou: '', review_modo: extra.review || 'solo-2', codex: extra.codex || 'ok', stalls: '', tasks_estouradas: '', spawn_ms: String(extra.spawn ?? ''), frentes: '1/1', perguntas: String(extra.perguntas ?? 0), waits_invalidas: '0' });
}
const alfa = projeto('alfa', '3.4.23', 'main');
const alfaWt = projeto('alfa--wt-x', '3.4.23', 'wt/x');
const beta = projeto('beta', '3.4.20', 'developer');
const gama = projeto('gama', '3.4.10', 'main');
const DER = 'derick@DESK', JOAO = 'joao@NB';
fs.writeFileSync(path.join(alfa, 'prds', '_metrics', 'runs', 'derick@DESK.jsonl'), [
  linhaRun('alfa', DER, 'PRD-001-fase1', NOW - 5 * D, 900, { spawn: 33 }),
  linhaRun('alfa', DER, 'PRD-001-fase2', NOW - 5 * D + 2 * H, 2400, { spawn: 33 }),
  linhaRun('alfa', DER, 'PRD-001-exec', NOW - 4 * D, 4000, { tasks: 8, spawn: 33, perm: 2, perguntas: 1 }),
].join('\n') + '\n');
// worktree: linha gravada NA PASTA DO WORKTREE com projeto "alfa--wt-x" e arquivo ~x (como o stop grava)
fs.writeFileSync(path.join(alfaWt, 'prds', '_metrics', 'runs', 'derick@DESK~x.jsonl'), linhaRun('alfa--wt-x', DER, 'PRD-002-exec', NOW - 3 * D, 5000, { tasks: 6, spawn: 33 }) + '\n');
// beta: uma run > 12 h (suspeita) + uma normal
fs.writeFileSync(path.join(beta, 'prds', '_metrics', 'runs', 'joao@NB.jsonl'), [
  linhaRun('beta', JOAO, 'PRD-005-exec', NOW - 6 * D, 50000, { tasks: 7, spawn: 69, perm: 8, harness: '3.4.20' }),
  linhaRun('beta', JOAO, 'PRD-006-exec', NOW - 2 * D, 3600, { tasks: 5, spawn: 69, perm: 8, den: 3, harness: '3.4.20', codex: 'indisponivel', extra: 'spawn ~70ms; review: SOLO' }),
].join('\n') + '\n');
// gama: a MESMA run gravada 2x (ts_start diverge, ts_end a 30 s) + uma normal + marcador de run aberta ha 13 h
fs.writeFileSync(path.join(gama, 'prds', '_metrics', 'runs', 'joao@NB.jsonl'), [
  linhaRun('gama', JOAO, 'PRD-007-exec', NOW - 1 * D, 3000, { tasks: 4, harness: '3.4.10', extra: 'spawn=70ms' }),
  linhaRun('gama', JOAO, 'PRD-007-exec', NOW - 1 * D + 30, 2970, { tasks: 4, harness: '3.4.10', extra: 'spawn=70ms' }),
  linhaRun('gama', JOAO, 'PRD-008-exec', NOW - 12 * H, 2000, { tasks: 3, harness: '3.4.10' }),
].join('\n') + '\n');
fs.writeFileSync(path.join(gama, '.claude', '.harness-run', 'PRD-009-exec.json'), JSON.stringify({ label: 'PRD-009-exec', start: NOW - 13 * H }) + '\n');
// incidentes (alfa) + duelos (alfa) + delegacao read-only com tree_tocado (alfa)
fs.mkdirSync(path.join(alfa, 'prds', '_metrics', 'incidentes'), { recursive: true });
fs.writeFileSync(path.join(alfa, 'prds', '_metrics', 'incidentes', 'derick@DESK.jsonl'), [
  JSON.stringify({ ts: NOW - 4 * D, projeto: 'alfa', maquina: DER, harness: '3.4.23', tipo: 'overrun', papel: 'hefesto', rotulo: 'TASK-003', agent: 'a1', detalhe: 'dur_s=5000 teto_s=3000' }),
  JSON.stringify({ ts: NOW - 4 * D + 100, projeto: 'alfa', maquina: DER, harness: '3.4.23', tipo: 'folego', papel: 'dedalo', rotulo: 'TASK-004', agent: 'a2', detalhe: 'n=91 teto=90' }),
].join('\n') + '\n');
const iso = s => new Date(s * 1000).toISOString();
const duelos = [];
for (let i = 1; i <= 6; i++) {
  const id = 'd' + i; const ts = iso(NOW - 3 * D + i * 60);
  duelos.push({ ev: 'duelo', id, ts, task: 'TASK-00' + i, modelo_a: 'm1', modelo_b: 'm2', custo_a: 0.05, custo_b: 0.02, status_a: 'ok', status_b: 'ok', aplica_a: i === 6 ? 'nao' : 'sim', aplica_b: 'sim', dur_a: 100, dur_b: 90 });
  const vencedor = i === 1 ? 'A' : (i === 6 ? 'nenhum' : 'B');
  duelos.push({ ev: 'veredito', id, ts, vencedor, nota_a: 5, nota_b: 8, juiz: 'themis' });
  if (vencedor !== 'nenhum') duelos.push({ ev: 'aplicado', id, ts, resultado: i === 3 ? 'falhou' : 'ok' });
}
fs.writeFileSync(path.join(alfa, 'prds', '_metrics', 'harness-duelos.jsonl'), duelos.map(d => JSON.stringify(d)).join('\n') + '\n');
fs.writeFileSync(path.join(alfa, 'prds', '_metrics', 'harness-delegations.jsonl'), JSON.stringify({ ts: iso(NOW - 2 * D), label: 'PRD-001', task: '', role: 'discovery-codigo', host: 'claude', executor: 'openrouter', model: 'x', status: 'ok', duration_s: 30, tokens_fonte: 'medido', tokens_out: 100, tree_tocado: 'SIM' }) + '\n');

console.log('\n== T1 dashboard --all: worktree, dedup ±60 s, suspeitas, por dev, cobertura (itens 15a/c/d/e, 17) ==');
const dash = (cwd, args) => spawnSync(process.execPath, [path.join(MASTER, '.claude', 'hooks', 'harness-dashboard.mjs'), ...args], { cwd, encoding: 'utf8', env: ENVB });
let r = dash(alfa, ['--all', `--base=${BASE}`, `--out=${OUT}`, '--sem-transcripts', '--periodo=30d']);
ok('dashboard --all roda', r.status === 0 && /^OK /m.test(r.stdout), r.stdout + r.stderr);
const jsonPath = fs.readdirSync(OUT).filter(f => f.endsWith('.json')).map(f => path.join(OUT, f))[0];
const J = jsonPath ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : {};
const projs = Object.keys(J.porProjeto || {});
ok('projetos = alfa, beta, gama (worktree alfa--wt-x NAO vira projeto)', projs.length === 3 && projs.includes('alfa') && !projs.some(p => p.includes('--wt-')), projs.join(','));
const wt = (J.runs || []).find(x => x.label === 'PRD-002-exec');
ok('exec do worktree entra em alfa com worktree=x', wt && wt.projeto === 'alfa' && wt.worktree === 'x', JSON.stringify(wt || {}).slice(0, 200));
ok('alfa tem 4 runs (3 proprias + 1 do worktree)', J.porProjeto.alfa && J.porProjeto.alfa.n === 4, JSON.stringify(J.porProjeto.alfa));
const p7 = (J.runs || []).filter(x => x.label === 'PRD-007-exec');
ok('run duplicada por ±30 s aparece 1x (fica a mais longa)', p7.length === 1 && p7[0].elapsed === 3000 && J.metodo.removidas >= 1, `${p7.length} removidas=${J.metodo && J.metodo.removidas}`);
ok('run > 12 h em suspeitas, fora de runs/mediana', J.suspeitas.length === 1 && J.suspeitas[0].label === 'PRD-005-exec' && !(J.runs || []).some(x => x.label === 'PRD-005-exec') && J.porProjeto.beta.n === 1, JSON.stringify(J.suspeitas.map(s => s.label)));
ok('alerta "Run suspeita" emitido', (J.alertas || []).some(a => a.tipo === 'Run suspeita' && /PRD-005-exec/.test(a.quem)));
ok('tabela por dev lista 2 devs', J.porDev.length === 2 && J.porDev.some(d => d.dev === DER) && J.porDev.some(d => d.dev === JOAO), J.porDev.map(d => d.dev).join(','));
const der = J.porDev.find(d => d.dev === DER), joao = J.porDev.find(d => d.dev === JOAO);
ok('derick: n=4, f1/f2/exec medianos, spawn 33, review solo-2, 1 worktree', der && der.n === 4 && der.f1Med === 900 && der.f2Med === 2400 && der.execMed === 4500 && der.execN === 2 && der.spawnMed === 33 && der.reviewModo && der.reviewModo.valor === 'solo-2' && der.worktrees === 1, JSON.stringify(der).slice(0, 300));
ok('joao: 1 suspeita, negacoes 3, codex 0 ok / 1 indisponivel, spawn do extra quando falta o campo', joao && joao.suspeitas === 1 && joao.denials === 3 && joao.codexIndisp === 1 && joao.spawnMed === 69.5, JSON.stringify(joao).slice(0, 300));
ok('por versao: 3.4.23 / 3.4.20 / 3.4.10', J.porVersao.map(v => v.versao).sort().join(',') === '3.4.10,3.4.20,3.4.23', J.porVersao.map(v => v.versao).join(','));
ok('cobertura lista os 3 repos com versao/branch', J.cobertura && J.cobertura.repos.length === 3 && J.cobertura.repos.every(x => x.versao) && J.cobertura.repos.find(x => x.repo === 'beta').branch === 'developer' && J.cobertura.repos.find(x => x.repo === 'alfa').worktrees.includes('x'), JSON.stringify((J.cobertura || {}).repos || []).slice(0, 400));
ok('cobertura: gama com run ABERTA (marcador ha 13 h)', J.cobertura.repos.find(x => x.repo === 'gama').abertas.some(a => /PRD-009-exec \(13 h\)/.test(a)) && (J.alertas || []).some(a => a.tipo === 'Run aberta' && a.quem === 'gama'), JSON.stringify(J.cobertura.repos.find(x => x.repo === 'gama')));
ok('cobertura por dev: 2 devs com repos/silencio', J.cobertura.devs.length === 2 && J.cobertura.devs.find(d => d.dev === JOAO).repos.length === 2 && J.cobertura.devs.find(d => d.dev === DER).silencioDias === 3, JSON.stringify(J.cobertura.devs));
const cob = r.stdout.split('\n').filter(l => l.startsWith('COBERTURA|'));
ok('stdout: 3 linhas COBERTURA|repo|versao|branch|ultimo|devs|runs14d|aberta', cob.length === 3 && cob.some(l => /^COBERTURA\|gama\|3\.4\.10\|main\|\S+\|joao@NB\|2\|ABERTA:PRD-009-exec/.test(l)) && cob.some(l => /^COBERTURA\|alfa\|3\.4\.23\|main\|/.test(l)), cob.join(' || '));
ok('incidentes: 2 na janela, por tipo overrun+folego, por dev derick', J.incidentes.n === 2 && J.incidentes.porTipo.map(x => x[0]).sort().join(',') === 'folego,overrun' && J.incidentes.porDev[0][0] === DER, JSON.stringify(J.incidentes).slice(0, 200));
const m1 = J.duelosPorModelo.find(m => m.modelo === 'm1'), m2 = J.duelosPorModelo.find(m => m.modelo === 'm2');
ok('duelo: custo por diff aplicado (m1 = 0,30/1; m2 = 0,12/3) e candidato a sair (m1 < 20%)', m1 && m2 && Math.abs(m1.custoPorAplicado - 0.30) < 1e-9 && Math.abs(m2.custoPorAplicado - 0.04) < 1e-9 && m1.candidatoSair === true && m2.candidatoSair === false, JSON.stringify({ m1, m2 }).slice(0, 400));
ok('delegacao read-only com tree_tocado=SIM vira "investigar" (laranja), nao vermelho', (J.alertas || []).some(a => a.tipo === 'Delegação' && a.nivel === 'laranja' && /investigar/.test(a.txt)) && !(J.alertas || []).some(a => a.tipo === 'Delegação' && a.nivel === 'vermelho'), JSON.stringify((J.alertas || []).filter(a => a.tipo === 'Delegação')));
const html = fs.readFileSync(jsonPath.replace(/\.json$/, '.html'), 'utf8');
ok('HTML tem as secoes novas', /Por dev \/ máquina/.test(html) && /Runs suspeitas/.test(html) && /Cobertura e frescor/.test(html) && /Incidentes \(3\.4\.23\)/.test(html) && /diff aplicado/.test(html) && /wt=x/.test(html), 'secoes ausentes');
// modo projeto rodado DE DENTRO do worktree: normaliza para alfa
r = dash(alfaWt, [`--base=${BASE}`, `--out=${OUT}`, '--sem-transcripts', '--periodo=30d']);
ok('sem --all, cwd no worktree => projeto alfa (4 runs)', r.status === 0 && /OK 4 execucoes/.test(r.stdout) && !/COBERTURA\|/.test(r.stdout), r.stdout.slice(0, 200));

// ---------------------------------------------------------------- projeto com hooks (stop, auto, incidentes)
console.log('\n== T2 harness-metrics.sh stop: campos estruturados (item 15b) ==');
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), "HARNESS_DAEMON='off'\nHARNESS_PRESENCE_URL=''\nHARNESS_RAG_ENABLED='0'\nHARNESS_FRENTES_MAX='1'\n");
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'tasks'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'prds', 'PRD-001-teste', 'tasks'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'api'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'api', 'x.php'), '<?php\n');
fs.writeFileSync(path.join(PROJ, 'prds', 'PRD-001-teste', 'tasks', 'TASK-001-teste.md'), '# TASK-001 — teste\n\n| **Tipo** | backend |\n| **Duelo** | nao — teste |\n\n## Objetivo\n\nx\n');
const sh = (file, args, input = '', env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const run = (file, args, input = '', env = {}) => spawnSync(process.execPath, [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const git = (...a) => spawnSync('git', a, { cwd: PROJ, encoding: 'utf8', env: ENVB });
git('init', '-q'); git('config', 'user.email', 'teste@beta'); git('config', 'user.name', 'teste');
fs.writeFileSync(path.join(PROJ, '.gitignore'), '.claude/.harness-run/\nprds/_metrics/harness-runs.jsonl\n');
git('add', '-A'); git('commit', '-qm', 'base');
// transcript principal falso com 1 AskUserQuestion (perguntas) — slug como o Claude Code grava
const projW = spawnSync('bash', ['-c', 'cd "$0" && pwd -W', PROJ], { encoding: 'utf8' }).stdout.trim() || PROJ.replace(/\\/g, '/');
const SLUG = projW.replace(/[\/:\\]/g, '-').replace(/^-+/, '');
const SESS = 'sess-3423-aaaa';
const SESSDIR = path.join(HOME, '.claude', 'projects', SLUG, SESS);
fs.mkdirSync(path.join(SESSDIR, 'subagents'), { recursive: true });
const tPai = SESSDIR + '.jsonl';
const tsNow = () => new Date().toISOString();
fs.writeFileSync(tPai, [
  JSON.stringify({ type: 'user', timestamp: tsNow(), message: { role: 'user', content: 'oi' } }),
  JSON.stringify({ type: 'assistant', timestamp: tsNow(), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [] } }], usage: { input_tokens: 5, output_tokens: 7 } } }),
  JSON.stringify({ type: 'assistant', timestamp: tsNow(), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'ls' } }], usage: { input_tokens: 5, output_tokens: 7 } } }),
].join('\n') + '\n');
// permission-waits com 1 linha valida + 1 invalida (parser tolerante, item 15f)
fs.mkdirSync(path.join(PROJ, '.claude', '.harness-run'), { recursive: true });
fs.writeFileSync(path.join(PROJ, '.claude', '.harness-run', 'permission-waits.jsonl'), `{"ts":${NOW - 5},"type":"denied","tool":"Bash","detail":"x"}\n{"ts":${NOW - 4},"type":"denied","tool":"Bash","detail":"quebrada\n`);
// spawn-history da maquina (HOME falso) + tasks desta maquina com 1 task > 45 min dentro da janela
fs.mkdirSync(path.join(HOME, '.harness-run'), { recursive: true });
fs.writeFileSync(path.join(HOME, '.harness-run', 'spawn-history.jsonl'), `{"ts":${NOW - 100},"ms":31,"host":"x"}\n{"ts":${NOW - 50},"ms":42,"host":"x"}\n`);
const TASKS_FILE = path.join(PROJ, 'prds', '_metrics', 'tasks', `${TUSER}@${HOST}.jsonl`);
fs.writeFileSync(TASKS_FILE, [
  JSON.stringify({ ts: NOW - 20, projeto: 'proj', maquina: `${TUSER}@${HOST}`, papel: 'hefesto', rotulo: 'TASK-001', dur_s: 3000, turnos: 40, status: '✅' }),
  JSON.stringify({ ts: NOW - 10, projeto: 'proj', maquina: `${TUSER}@${HOST}`, papel: 'dedalo', rotulo: 'TASK-002', dur_s: 600, turnos: 10, status: '✅' }),
  JSON.stringify({ ts: NOW - 9 * D, projeto: 'proj', maquina: `${TUSER}@${HOST}`, papel: 'hefesto', rotulo: 'TASK-000', dur_s: 9000, turnos: 40, status: '✅' }),
].join('\n') + '\n');
fs.writeFileSync(path.join(PROJ, '.claude', '.harness-run', 'PRD-001-exec.json'), JSON.stringify({ label: 'PRD-001-exec', start: NOW - 120 }) + '\n');
r = sh('harness-metrics.sh', ['stop', 'PRD-001-exec', '--tasks=2', '--modo=leve', '--review-modo=solo-2', '--codex=indisponivel', '--stalls=1', '--limitou=frentes']);
const RUNS_FILE = path.join(PROJ, 'prds', '_metrics', 'runs', `${TUSER}@${HOST}.jsonl`);
const ultima = f => { const ls = fs.readFileSync(f, 'utf8').trim().split('\n'); return JSON.parse(ls[ls.length - 1]); };
let L = fs.existsSync(RUNS_FILE) ? ultima(RUNS_FILE) : {};
ok('stop grava modo/review_modo/codex/stalls/limitou', L.modo === 'leve' && L.review_modo === 'solo-2' && L.codex === 'indisponivel' && L.stalls === '1' && L.limitou === 'frentes', JSON.stringify(L).slice(0, 300) + r.stderr.slice(0, 200));
ok('schema continua 2.15.0 e campos antigos intactos', L.schema === '2.15.0' && L.label === 'PRD-001-exec' && L.tasks === '2' && typeof L.elapsed_s === 'number', JSON.stringify(L).slice(0, 200));
ok('tasks_estouradas DERIVADO de tasks/ (1 task > 45 min na janela; a de 9 dias fica fora)', L.tasks_estouradas === '1', `tasks_estouradas=${L.tasks_estouradas}`);
ok('spawn_ms = ultimo do spawn-history (42)', L.spawn_ms === '42', `spawn_ms=${L.spawn_ms}`);
ok('frentes = ocupacao N/M do semaforo', /^\d+\/\d+$/.test(L.frentes || ''), `frentes=${L.frentes}`);
ok('perguntas = 1 (AskUserQuestion no transcript principal) e permission_prompts separado', L.perguntas === '1' && L.permission_prompts !== undefined, `perguntas=${L.perguntas} perm=${L.permission_prompts}`);
ok('waits_invalidas = 1 (parser tolerante) e classifier_denials = 1 (linha valida contada)', L.waits_invalidas === '1' && L.classifier_denials === '1', `waits_invalidas=${L.waits_invalidas} den=${L.classifier_denials}`);
ok('resumo imprime a linha Controle (3.4.23)', /Controle \(3\.4\.23\):\*\* modo=leve; review=solo-2; codex=indisponivel; limitou=frentes; stalls=1; tasks>envelope=1; spawn=42ms/.test(r.stdout), r.stdout.split('\n').filter(l => /Controle/.test(l)).join(' | '));
const Lh = ultima(path.join(PROJ, 'prds', '_metrics', 'harness-runs.jsonl'));
ok('harness-runs.jsonl local tem os mesmos campos novos', Lh.modo === 'leve' && Lh.review_modo === 'solo-2' && Lh.perguntas === '1', JSON.stringify(Lh).slice(-300));
sh('harness-metrics.sh', ['start', 'PRD-002-exec']);
r = sh('harness-metrics.sh', ['stop', 'PRD-002-exec']);
L = ultima(RUNS_FILE);
ok('sem flags: modo=normal, demais vazios (n/d, nunca zero)', L.modo === 'normal' && L.review_modo === '' && L.codex === '' && L.stalls === '' && L.limitou === '', JSON.stringify(L).slice(-250));
sh('harness-metrics.sh', ['start', 'PRD-003-exec']);
r = sh('harness-metrics.sh', ['stop', 'PRD-003-exec', '--modo=turbo'], '', { HARNESS_METRICS_DERIVAR: '0' });
L = ultima(RUNS_FILE);
ok('HARNESS_METRICS_DERIVAR=0: flags gravadas, derivados vazios', L.modo === 'turbo' && L.spawn_ms === '' && L.frentes === '' && L.tasks_estouradas === '', JSON.stringify(L).slice(-250));

console.log('\n== T3 rotulo sem numero + metrics-auto nao sobrescreve (item 15d) ==');
r = sh('harness-metrics.sh', ['start', 'PRD-000-exec']);
ok('start PRD-000-exec e RECUSADO (sem marcador)', /TELEMETRIA\|rotulo-invalido\|PRD-000-exec/.test(r.stdout) && !fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'PRD-000-exec.json')), r.stdout + r.stderr);
r = sh('harness-metrics.sh', ['start', 'PRD--exec']);
ok('start PRD--exec e RECUSADO', /rotulo-invalido/.test(r.stdout), r.stdout);
r = sh('harness-metrics.sh', ['start', 'PRD-012-exec']);
ok('start PRD-012-exec (zero a esquerda) passa', /inicio registrado/.test(r.stdout) && fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'PRD-012-exec.json')), r.stdout);
fs.unlinkSync(path.join(PROJ, '.claude', '.harness-run', 'PRD-012-exec.json'));
const auto = (prompt, env = {}) => sh('harness-metrics-auto.sh', [], JSON.stringify({ prompt, session_id: SESS, cwd: PROJ }), env);
const M5 = path.join(PROJ, '.claude', '.harness-run', 'PRD-005-exec.json');
// 3.5.4: marcador com mais de HARNESS_METRICS_STALE_H (24 h) e substituido de proposito — o caso "mantido" usa um start recente
const S5 = Math.floor(Date.now() / 1000) - 600;
fs.writeFileSync(M5, JSON.stringify({ label: 'PRD-005-exec', start: S5 }) + '\n');
r = auto('/prd-exec 5');
ok('metrics-auto com marcador existente (recente) NAO sobrescreve (start mantido)', /JA LIGADO/.test(r.stdout) && new RegExp('"start":' + S5 + '\\b').test(fs.readFileSync(M5, 'utf8')), r.stdout + fs.readFileSync(M5, 'utf8'));
r = auto('/prd-exec 5', { HARNESS_METRICS_AUTO_REUSA: '0' });
ok('knob HARNESS_METRICS_AUTO_REUSA=0 volta a sobrescrever', /LIGADO \(PRD-005-exec\)/.test(r.stdout) && !/"start":111\b/.test(fs.readFileSync(M5, 'utf8')), r.stdout);
const antes = fs.readdirSync(path.join(PROJ, '.claude', '.harness-run')).filter(f => f.endsWith('.json')).sort().join(',');
r = auto('/prd-exec');
const depois = fs.readdirSync(path.join(PROJ, '.claude', '.harness-run')).filter(f => f.endsWith('.json')).sort().join(',');
ok('/prd-exec SEM numero: recusado com aviso, nenhum marcador novo', /SEM NUMERO/.test(r.stdout) && antes === depois, r.stdout + ' | ' + depois);
r = auto('/prd-exec 6');
ok('/prd-exec 6 continua ligando o cronometro normal', /LIGADO \(PRD-006-exec\)/.test(r.stdout) && fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'PRD-006-exec.json')), r.stdout);

console.log('\n== T4 incidentes com schema unico (item 15g): overrun, folego, frentes, git add ==');
const INC_FILE = path.join(PROJ, 'prds', '_metrics', 'incidentes', `${TUSER}@${HOST}.jsonl`);
const SUBDIR = path.join(SESSDIR, 'subagents');
function transcript(id, papel, nTools, opts = {}) {
  const f = path.join(SUBDIR, `agent-${id}.jsonl`);
  const t0 = Date.now() - (opts.dur || 120) * 1000;
  const linhas = [JSON.stringify({ isSidechain: true, agentId: id, type: 'user', message: { role: 'user', content: 'Implemente a TASK-001 (packet em .claude/.harness-run/packets/TASK-001.packet.md)' }, timestamp: new Date(t0).toISOString(), sessionId: SESS })];
  let feitas = 0, i = 0;
  while (feitas < nTools) {
    const k = Math.min(3, nTools - feitas); const content = [];
    for (let j = 0; j < k; j++) content.push({ type: 'tool_use', id: `tu${i}_${j}`, name: 'Bash', input: { command: 'php -l api/x.php' } });
    linhas.push(JSON.stringify({ isSidechain: true, agentId: id, type: 'assistant', message: { role: 'assistant', model: 'claude-sonnet-5', content, usage: { input_tokens: 100, output_tokens: 50 } }, timestamp: new Date(t0 + 1000 * (i + 1)).toISOString(), sessionId: SESS }));
    feitas += k; i++;
  }
  linhas.push(JSON.stringify({ isSidechain: true, agentId: id, type: 'assistant', message: { role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: '# Hefesto\n\n**Status:** ✅ CONCLUÍDA\n' }], usage: { input_tokens: 10, output_tokens: 20 } }, timestamp: new Date(t0 + (opts.dur || 120) * 1000).toISOString(), sessionId: SESS }));
  fs.writeFileSync(f, linhas.join('\n') + '\n');
  fs.writeFileSync(f.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: papel, description: opts.desc || 'TASK-001 hefesto', toolUseId: 'toolu_' + id, spawnDepth: 1 }));
  return f;
}
const stopPayload = (id, papel) => JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'SubagentStop', agent_id: id, agent_type: papel, transcript_path: tPai });
const agentPayload = (tipo, prompt, desc = '') => JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: tipo, prompt, description: desc }, transcript_path: tPai });
const payloadTool = (tool, input, tp) => JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, transcript_path: tp });
// overrun via guard-agent --post (mesmo caminho da t-3422)
transcript('ov1', 'hefesto', 6, { dur: 5000 });
run('task-telemetry.mjs', [], stopPayload('ov1', 'hefesto'));
r = sh('guard-agent.sh', ['--post'], agentPayload('hefesto', 'TASK-001', 'TASK-001 hefesto'));
const INC_DIR = path.dirname(INC_FILE);
// o sh grava <USER>@host (tdev no sandbox); o Node grava os.userInfo().username@host (na maquina real
// sao o mesmo usuario) — ler a pasta inteira, ordenada por ts
const incLinhas = () => fs.existsSync(INC_DIR) ? fs.readdirSync(INC_DIR).filter(x => x.endsWith('.jsonl')).flatMap(x => fs.readFileSync(path.join(INC_DIR, x), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))).sort((a, b) => a.ts - b.ts) : [];
let inc = incLinhas();
ok('overrun do --post vira incidente {tipo:overrun,papel,rotulo,agent,detalhe} (log local antigo mantido)', r.stdout.includes('[watchdog]') && inc.length === 1 && inc[0].tipo === 'overrun' && inc[0].papel === 'hefesto' && inc[0].rotulo === 'TASK-001' && inc[0].agent === 'ov1' && /dur_s=5000/.test(inc[0].detalhe) && inc[0].projeto === 'proj' && inc[0].maquina === `${TUSER}@${HOST}` && fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'watchdog-overruns.jsonl')), JSON.stringify(inc) + r.stdout.slice(0, 100));
// folego deny
const t95 = transcript('f95', 'dedalo', 95);
r = run('guard-folego.mjs', [], payloadTool('Bash', { command: 'echo' }, t95));
inc = incLinhas();
const fo = inc.find(i => i.tipo === 'folego');
ok('deny do guard-folego vira incidente tipo folego (folego.jsonl local mantido)', r.status === 2 && inc.length === 2 && fo && fo.papel === 'dedalo' && fo.agent === 'f95' && /n=95 teto=90/.test(fo.detalhe) && fo.projeto === 'proj' && fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'folego.jsonl')), JSON.stringify(inc));
ok('todas as linhas de incidentes parseiam e tem o schema unico', inc.every(i => ['ts', 'projeto', 'maquina', 'harness', 'tipo', 'papel', 'rotulo', 'agent', 'detalhe'].every(k => k in i)), JSON.stringify(inc[0]));
// frentes cheias (semaforo em HOME falso, MAX=1 ocupado por outra frente)
fs.mkdirSync(path.join(PROJ, '.claude', '.harness-run', 'packets'), { recursive: true });
fs.writeFileSync(path.join(PROJ, '.claude', '.harness-run', 'packets', 'TASK-001.packet.md'), '# TASK PACKET — TASK-001\n\n### `api/x.php`\n');
run('frentes.mjs', ['acquire', '--label', 'PRD-999', '--session', 'outra', '--projeto', 'outro']);
r = sh('guard-agent.sh', [], agentPayload('hefesto', 'Implemente a TASK-001 da PRD-001; packet em .claude/.harness-run/packets/TASK-001.packet.md'));
inc = incLinhas();
const fr = inc.find(i => i.tipo === 'frentes');
ok('frentes cheias => deny + incidente tipo frentes', r.status === 2 && /FRENTES CHEIAS/.test(r.stderr) && inc.length === 3 && fr && fr.rotulo === 'PRD-001' && fr.papel === 'hefesto', `${r.status} ${r.stderr.slice(0, 80)} ${JSON.stringify(inc.slice(-1))}`);
run('frentes.mjs', ['release', '--label', 'PRD-999']);
// knob off
const LOCAL = path.join(PROJ, '.claude', 'harness.env.local'); const LOCAL0 = fs.readFileSync(LOCAL, 'utf8');
fs.writeFileSync(LOCAL, LOCAL0 + "HARNESS_INCIDENTES='off'\n");
const t96 = transcript('f96', 'dedalo', 96);
run('guard-folego.mjs', [], payloadTool('Bash', { command: 'echo' }, t96));
fs.writeFileSync(LOCAL, LOCAL0);
ok('HARNESS_INCIDENTES=off: deny continua, incidente nao e gravado', incLinhas().length === 3, String(incLinhas().length));
// stop faz git add do incidentes/
git('reset', '-q');
sh('harness-metrics.sh', ['start', 'PRD-004-exec']);
r = sh('harness-metrics.sh', ['stop', 'PRD-004-exec']);
const staged = git('diff', '--cached', '--name-only').stdout;
ok('stop deixa runs/, tasks/ e incidentes/ desta maquina staged', /prds\/_metrics\/runs\//.test(staged) && /prds\/_metrics\/tasks\//.test(staged) && /prds\/_metrics\/incidentes\//.test(staged) && /incidentes/.test(r.stdout), staged + ' :: ' + r.stdout.split('\n').filter(l => /git/.test(l)).join('|'));
// dashboard do proprio projeto le os incidentes gravados pelos hooks
r = dash(PROJ, [`--base=${S}`, `--out=${OUT}`, '--sem-transcripts', '--periodo=30d']);
const J2 = JSON.parse(fs.readFileSync(fs.readdirSync(OUT).filter(f => f.endsWith('.json')).map(f => path.join(OUT, f))[0], 'utf8'));
ok('dashboard local conta os 3 incidentes reais (overrun/folego/frentes)', J2.incidentes && J2.incidentes.n === 3 && J2.incidentes.porTipo.map(x => x[0]).sort().join(',') === 'folego,frentes,overrun', JSON.stringify(J2.incidentes && J2.incidentes.porTipo) + r.stdout.slice(0, 120));

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail ? 1 : 0);
