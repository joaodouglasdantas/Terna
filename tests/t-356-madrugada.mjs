#!/usr/bin/env node
// tests/t-356-madrugada.mjs — bateria da 3.5.6 (correcoes medidas no monitor da noite de 15/09 e da madrugada de 16/09/2026,
// D1-D18 + E1-E3, DT-010, DT-011). Roda em SANDBOX proprio (repo git falso em os.tmpdir()), nunca toca o projeto real.
//   node tests/t-356-madrugada.mjs
//
// O que prova (mecanico):
//   T1  guard-playwright: contador por TASK (rotulo da description) e por SPEC — 5a rodada do mesmo spec negada; outro spec da task tem contador proprio.
//   T2  guard-playwright: CONTINUACAO ("Continua TASK-001", outro agent_id) herda o saldo da task e e negada de cara.
//   T3  guard-playwright: `for i in 1..5; do playwright test` conta 5 rodadas (negado, "rode UMA vez"); --repeat-each=3 conta 3.
//   T4  guard-playwright --post: falha RAPIDA com cara de ambiente (ECONNREFUSED) credita a rodada; "6 passed" nao.
//   T5  guard-playwright: corpo de heredoc e strings nao sao rodada nem familia (D16).
//   T6  guard-playwright Regra C (flag): lock E2E vivo => negado SEM contar, com a receita `until [ ! -f`; flag off => passa.
//   T7  guard-write (subagente): Write fora do projeto/scratchpad negado; spec de depuracao (_debug*, _tmp-*, zz*) negado; pai passa.
//   T8  guard-bash: `cat .env` em subagente => deny com a dica worktree.env/db-test.sh; na pai => additionalContext com a mesma dica.
//   T9  guard-migration: reserva MIG em nome de worktree MORTA e adotada (dono regravado); em nome de worktree VIVA segue negada.
//   T10 harness-worktree fechar: reservas seq/* da worktree passam ao checkout principal (SEQ|transferida).
//   T11 harness-worktree doctor: reserva em nome de checkout inexistente => DOCTOR|reserva-orfa.
//   T12 harness-metrics start: rotulo com marcador fresco => `mantido` (epoch e origem preservados); --forcar sobrescreve.
//   T13 external-review --dry-run: em wt/* a base e o merge-base (commitado + nao commitado entram); na main com marcador, o commit anterior ao start; --base none => HEAD.
//   T14 external-review (claude-cli falso): relatorio com a base e linha `revisor-externo` no manifest de delegacoes (D17/C7).
//   T15 _incidente.sh: mesma assinatura em < 600 s => 1 linha (D8); detalhe diferente => 2.
//   T16 task-telemetry: `Status: ✅` sem negrito => ✅ (D13); avaliarVerificacoes devolve QUAIS itens ficaram sem prova (D9).
//   T17 task-packet: secoes "6. Ambiente desta worktree" (url/db/pw-storage/lock) e "7. Verificacoes" pre-preenchidas (invariantes + spec).
//   T18 guard-agent --post: aviso [relatorio] lista os itens sem prova; linha `Diff do duelo` vira evento aplicado (DT-011).
//   T19 guard-agent pre: despacho sem packet => o guard monta o packet e nega citando o caminho (D12).
//   T20 harness-duelo --pool: pool vem do hooks/_defaults.env (gemini-3.8) sem variavel local; origem muda quando harness.env.local sobrescreve; --validar acusa slug fora do catalogo.
//   T21 teste do mestre (DT-010): todo slug provedor/modelo citado em CODIGO dos hooks esta na pool/suplentes/juiz/openrouter do _defaults.env.
//   T22 harness-duelo --placar: usado/venceu/disputou/desconhecido por modelo, a partir de duelo+veredito+aplicado.
//   T23 harness-delegate --preflight codex-cli: ~/.harness-run/codex-limite.json vigente => limite-ate sem pingar (exit 10) e .status replicado (D17).
//   T24 harness-duelo serial (flags): HARNESS_DUELO_SERIAL_NOVATO_MIN/AMOSTRA existem no script e nascem em 0 (comportamento 3.4.24) — checagem estatica.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-356-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const RUN = path.join(PROJ, '.claude', '.harness-run');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1', HARNESS_PRESENCE_URL: '', HARNESS_FRENTES: 'off', HARNESS_DAEMON: 'off', HARNESS_RAG_ENABLED: '0', HARNESS_SKIP_DUELO: '1', HARNESS_INCIDENTES: 'off', HARNESS_ESFORCO_AUTODETECT: 'off' };
delete ENVB.HARNESS_DUELO_MODELS; delete ENVB.HARNESS_DUELO_SUPLENTES; delete ENVB.OPENROUTER_API_KEY;

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'contratos'), path.join(PROJ, '.claude', 'contratos'), { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
const LOCAL_BASE = `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\nHARNESS_SKIP_DUELO='1'\nHARNESS_INCIDENTES='off'\nHARNESS_MIG_NUMERACAO='seq'\nHARNESS_ESFORCO_AUTODETECT='off'\n`;
const LOCAL = path.join(PROJ, '.claude', 'harness.env.local');
fs.writeFileSync(LOCAL, LOCAL_BASE);
fs.mkdirSync(path.join(PROJ, 'prds', 'debito_tecnico'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'prds', 'debito_tecnico', 'INDEX.md'), '# DTs\n');
fs.mkdirSync(path.join(PROJ, 'administrativo', 'migrations'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'administrativo', 'migrations', '0199_base.php'), '<?php\n');
fs.mkdirSync(path.join(PROJ, 'tests', 'e2e'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'tests', 'e2e', 'x.spec.js'), '// spec\n');
fs.mkdirSync(RUN, { recursive: true }); fs.writeFileSync(path.join(RUN, '.gitignore'), '*\n');
fs.writeFileSync(path.join(PROJ, '.gitignore'), '.claude/.harness-run/\ncodex-reviews/\n.claude/harness.env.local\n');
const git = (args, cwd = PROJ) => spawnSync('git', args, { cwd, encoding: 'utf8', env: ENVB });
git(['init', '-q', '-b', 'main']); git(['config', 'user.email', 't@t']); git(['config', 'user.name', 't']); git(['add', '.']); git(['commit', '-q', '-m', 'base']);
const COMMON = path.join(PROJ, '.git'); const SEQD = path.join(COMMON, 'harness-locks', 'seq'); fs.mkdirSync(SEQD, { recursive: true });

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 600)); } };
const sh = (file, args, input, env = {}, cwd = PROJ) => spawnSync('bash', [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd, env: { ...ENVB, ...env } });
const lerJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const limparRun = () => { for (const f of fs.readdirSync(RUN)) if (f !== '.gitignore') fs.rmSync(path.join(RUN, f), { recursive: true, force: true }); };
const touchLocal = (extra = '') => { fs.writeFileSync(LOCAL, LOCAL_BASE + extra); const t = new Date(Date.now() + 1500); fs.utimesSync(LOCAL, t, t); };
const SUBT = path.join(S, 'sess', 'subagents'); fs.mkdirSync(SUBT, { recursive: true });
const meta = (id, desc, tipo = 'dedalo') => fs.writeFileSync(path.join(SUBT, 'agent-' + id + '.meta.json'), JSON.stringify({ agentType: tipo, description: desc }));
const subBash = (id, cmd, tipo = 'dedalo') => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: id, agent_type: tipo, transcript_path: path.join(SUBT, 'agent-' + id + '.jsonl'), tool_input: { command: cmd } });
const subPost = (id, cmd, saida, tipo = 'dedalo') => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', agent_id: id, agent_type: tipo, transcript_path: path.join(SUBT, 'agent-' + id + '.jsonl'), tool_input: { command: cmd }, tool_response: { stdout: saida, stderr: '', interrupted: false } });
const paiBash = (cmd) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd } });
const wPayload = (fp, content, agent) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Write', ...(agent ? { agent_id: agent, agent_type: 'dedalo' } : {}), tool_input: { file_path: fp, content } });

const pw = await import(pathToFileURL(path.join(HOOKS, 'guard-playwright.mjs')).href);
const gb = await import(pathToFileURL(path.join(HOOKS, 'guard-bash.mjs')).href);
const tt = await import(pathToFileURL(path.join(HOOKS, 'task-telemetry.mjs')).href);

console.log('== T1 guard-playwright: contador por TASK e por SPEC ==');
const A = 'a356aaaa1111'; meta(A, 'Executa TASK-001 (front, fila)');
let r;
for (let i = 1; i <= 4; i++) { r = pw.checkPlaywright(subBash(A, `npx playwright test tests/e2e/x.spec.js --workers=1 2>&1 | tail -80`), { root: PROJ }); ok(`x.spec rodada ${i} passa`, r.exit === 0, r.stderr); }
r = pw.checkPlaywright(subBash(A, 'npx playwright test tests/e2e/x.spec.js --workers=1'), { root: PROJ });
ok('5a rodada do x.spec negada citando a TASK-001 e o spec', r.exit === 2 && /TASK-001/.test(r.stderr) && /x\.spec\.js: 4\/4/.test(r.stderr), r.stderr);
ok('estado vive em playwright/TASK-001.json (chave = task, nao agente)', fs.existsSync(path.join(RUN, 'playwright', 'TASK-001.json')) && !fs.existsSync(path.join(RUN, 'playwright', A + '.json')), fs.readdirSync(path.join(RUN, 'playwright')).join(','));
r = pw.checkPlaywright(subBash(A, 'npx playwright test tests/e2e/y.spec.js --workers=1'), { root: PROJ });
ok('outro spec da MESMA task (y.spec) passa: contador proprio, teto da task = 4 x 2 specs', r.exit === 0, r.stderr);
let st = lerJson(path.join(RUN, 'playwright', 'TASK-001.json'));
ok('estado: n=6, specs x=5 y=1', st && st.n === 6 && st.specs['x.spec.js'] === 5 && st.specs['y.spec.js'] === 1, JSON.stringify(st));

fs.writeFileSync(path.join(RUN, 'PRD-7-exec.json'), JSON.stringify({ label: 'PRD-7-exec', start: Math.floor(Date.now() / 1000) }));
r = pw.checkPlaywright(subBash(A, 'npx playwright test tests/e2e/x.spec.js --workers=1'), { root: PROJ });
ok('com marcador PRD-7-exec vivo a chave ganha o prefixo da run (PRD-7-exec-TASK-001.json, contador novo => passa)', r.exit === 0 && fs.existsSync(path.join(RUN, 'playwright', 'PRD-7-exec-TASK-001.json')), `${r.exit} ${r.stderr.slice(0, 200)} ${fs.readdirSync(path.join(RUN, 'playwright')).join(',')}`);
fs.rmSync(path.join(RUN, 'PRD-7-exec.json')); fs.rmSync(path.join(RUN, 'playwright', 'PRD-7-exec-TASK-001.json'));

console.log('== T2 continuacao herda o saldo da task ==');
const B = 'b356bbbb2222'; meta(B, 'Continua TASK-001 — fecha o cenario 4');
r = pw.checkPlaywright(subBash(B, 'npx playwright test tests/e2e/x.spec.js --workers=1'), { root: PROJ });
ok('continuacao (outro agent_id) no x.spec e negada de cara, mensagem cita a continuacao', r.exit === 2 && /continua/i.test(r.stderr), r.stderr);
st = lerJson(path.join(RUN, 'playwright', 'TASK-001.json'));
ok('os dois agentes constam no estado da task', st && st.agentes.length === 2, JSON.stringify(st && st.agentes));

console.log('== T3 for/--repeat-each contam iteracoes ==');
ok('rodadasDoComando(for 1..5) = 5', pw.rodadasDoComando('for i in 1 2 3 4 5; do npx playwright test tests/e2e/z.spec.js; done') === 5, pw.rodadasDoComando('for i in 1 2 3 4 5; do npx playwright test tests/e2e/z.spec.js; done'));
ok('rodadasDoComando({1..3}) = 3', pw.rodadasDoComando('for i in {1..3}; do npx playwright test tests/e2e/z.spec.js --workers=1; done') === 3);
ok('rodadasDoComando(--repeat-each=3) = 3', pw.rodadasDoComando('npx playwright test tests/e2e/z.spec.js --repeat-each=3') === 3);
ok('rodadasDoComando(comando simples) = 1', pw.rodadasDoComando('npx playwright test tests/e2e/z.spec.js 2>&1 | tail -50') === 1);
const C = 'c356cccc3333'; meta(C, 'Executa TASK-002 (spec de caracterizacao)');
r = pw.checkPlaywright(subBash(C, 'for i in 1 2 3 4 5; do npx playwright test tests/e2e/z.spec.js --workers=1; done'), { root: PROJ });
ok('for de 5 iteracoes com contador zerado => negado ("rode UMA vez")', r.exit === 2 && /UMA vez/.test(r.stderr), r.stderr);

console.log('== T4 credito por falha rapida de ambiente ==');
const D = 'd356dddd4444'; meta(D, 'Executa TASK-003');
r = pw.checkPlaywright(subBash(D, 'npx playwright test tests/e2e/w.spec.js --workers=1'), { root: PROJ });
ok('1a rodada passa (n=1)', r.exit === 0 && lerJson(path.join(RUN, 'playwright', 'TASK-003.json')).n === 1);
ok('post com "6 passed" nao credita', pw.creditarRodada(subPost(D, 'npx playwright test tests/e2e/w.spec.js --workers=1', '6 passed (12s)'), { root: PROJ }) === false);
ok('post com ECONNREFUSED em < 20 s credita', pw.creditarRodada(subPost(D, 'npx playwright test tests/e2e/w.spec.js --workers=1', 'Error: connect ECONNREFUSED 127.0.0.1:80'), { root: PROJ }) === true);
st = lerJson(path.join(RUN, 'playwright', 'TASK-003.json'));
ok('estado voltou a n=0, specs w=0, creditos=1', st && st.n === 0 && st.specs['w.spec.js'] === 0 && st.creditos === 1, JSON.stringify(st));
ok('linha regra=credito motivo=ambiente no playwright.jsonl', /"regra":"credito"[^\n]*"motivo":"ambiente"/.test(fs.readFileSync(path.join(RUN, 'playwright.jsonl'), 'utf8')));

console.log('== T5 heredoc e strings nao sao rodada nem familia (D16) ==');
const HD = "cat > .claude/.harness-run/tmp/inspect.js <<'EOF'\nconst { chromium } = require('playwright');\n// npx playwright test\nEOF\nnode .claude/.harness-run/tmp/inspect.js";
ok('heredoc citando playwright nao e comando de teste', !pw.ehComandoDeTeste(HD));
ok('heredoc nao e familia', pw.motivoFamilia(HD) === '', pw.motivoFamilia(HD));
ok('echo "npx playwright test" (string) nao e rodada', !pw.ehComandoDeTeste('echo "npx playwright test tests/e2e/x.spec.js"'));
ok('comando real continua sendo rodada', pw.ehComandoDeTeste('npx playwright test tests/e2e/x.spec.js -g "modal de historico"'));
ok('specsDoComando pega o basename', pw.specsDoComando('cd "C:/x" && npx playwright test tests/e2e/PRD-144-fila-ui.spec.js --project=chromium 2>&1 | tail -200')[0] === 'PRD-144-fila-ui.spec.js');

console.log('== T6 Regra C: lock E2E vivo (flag) ==');
fs.mkdirSync(path.join(RUN, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(RUN, 'tmp', 'e2e-inbox.lock'), JSON.stringify({ pid: process.ppid, adquiridoEm: new Date().toISOString() }));   // pid VIVO de outro processo (o pai deste teste)
const E = 'e356eeee5555'; meta(E, 'Executa TASK-004');
r = pw.checkPlaywright(subBash(E, 'npx playwright test tests/e2e/v.spec.js --workers=1'), { root: PROJ });
ok('flag OFF (default): lock vivo nao interfere (passa e conta)', r.exit === 0 && lerJson(path.join(RUN, 'playwright', 'TASK-004.json')).n === 1, r.stderr);
touchLocal("HARNESS_PW_LOCK_ESPERA='on'\n");
r = pw.checkPlaywright(subBash(E, 'npx playwright test tests/e2e/v.spec.js --workers=1'), { root: PROJ });
ok('flag ON: lock vivo => negado com a receita until [ ! -f', r.exit === 2 && /until \[ ! -f/.test(r.stderr) && /e2e-inbox\.lock/.test(r.stderr), r.stderr);
ok('...sem consumir rodada (n segue 1)', lerJson(path.join(RUN, 'playwright', 'TASK-004.json')).n === 1);
fs.rmSync(path.join(RUN, 'tmp', 'e2e-inbox.lock'));
touchLocal();

console.log('== T7 guard-write em subagente: fora do projeto e spec de depuracao ==');
r = sh('guard-write.sh', [], wPayload(path.join(HOME, 'AppData', 'Local', 'Temp', 'check_console.js'), 'x', 'ag1'));
ok('subagente: Write no Temp do usuario => exit 2 (FORA do projeto)', r.status === 2 && /FORA do projeto/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-write.sh', [], wPayload(path.join(PROJ, '.claude', '.harness-run', 'tmp', 'check.js'), 'x', 'ag1'));
ok('subagente: Write em .harness-run/tmp do projeto => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-write.sh', [], wPayload('C:\\Users\\x\\AppData\\Local\\Temp\\claude\\C--laragon-www-p\\abc\\scratchpad\\s.js', 'x', 'ag1'));
ok('subagente: Write no scratchpad da sessao => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-write.sh', [], wPayload(path.join(HOME, 'fora.js'), 'x'));
ok('sessao pai: Write fora do projeto => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-write.sh', [], wPayload(path.join(PROJ, 'tests', 'e2e', '_debug144-temp.spec.js'), '// x', 'ag1'));
ok('subagente: _debug144-temp.spec.js => exit 2 (spec de depuracao)', r.status === 2 && /DEPURACAO/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-write.sh', [], wPayload(path.join(PROJ, 'tests', 'e2e', 'zzdebug_ck_modal.spec.js'), '// x', 'ag1'));
ok('subagente: zzdebug_ck_modal.spec.js => exit 2', r.status === 2, `${r.status}`);
r = sh('guard-write.sh', [], wPayload(path.join(PROJ, 'tests', 'e2e', 'PRD-144-busca-ui.spec.js'), '// x', 'ag1'));
ok('subagente: PRD-144-busca-ui.spec.js (novo) => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-write.sh', [], wPayload(path.join(PROJ, 'tests', 'e2e', 'PRD-055-debug-webhook.spec.js'), '// x', 'ag1'));
ok('subagente: PRD-055-debug-webhook.spec.js (nome legitimo com "debug" no meio) => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-write.sh', [], wPayload(path.join(PROJ, 'tests', 'e2e', '_tmp-check.spec.js'), '// x'));
ok('sessao pai: _tmp-check.spec.js => passa (a pai investiga)', r.status === 0, `${r.status}`);

console.log('== T8 guard-bash: .env aponta para worktree.env/db-test.sh (D3) ==');
let g = gb.guardBash(subBash('ag2', 'test -f .env && cat .env || true', 'dedalo'), 'pre', { root: PROJ });
ok('subagente cat .env => deny (GUARDA 0) com a dica worktree.env', g.exit === 2 && /worktree\.env/.test(g.stderr) && /db-test\.sh/.test(g.stderr), `${g.exit} ${g.stderr.slice(0, 300)}`);
g = gb.guardBash(paiBash('cat .env'), 'pre', { root: PROJ });
ok('sessao pai cat .env => passa com additionalContext citando worktree.env', g.exit === 0 && /worktree\.env/.test(g.stdout), `${g.exit} ${g.stdout.slice(0, 300)}`);

console.log('== T9 guard-migration adota reserva de checkout MORTO (D2) ==');
git(['worktree', 'add', '-q', path.join(S, 'proj--wt-viva'), '-b', 'wt/viva']);
fs.mkdirSync(path.join(SEQD, 'MIG-200'), { recursive: true }); fs.writeFileSync(path.join(SEQD, 'MIG-200', 'dono'), 'proj--wt-morta|2026-09-15T10:00:00|t@t\n');
fs.mkdirSync(path.join(SEQD, 'MIG-201'), { recursive: true }); fs.writeFileSync(path.join(SEQD, 'MIG-201', 'dono'), 'proj--wt-viva|2026-09-15T10:00:00|t@t\n');
const migPayload = (n) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(PROJ, 'administrativo', 'migrations', n + '_x.php'), content: '<?php' } });
r = sh('guard-migration.sh', [], migPayload('0200'));
ok('MIG-200 (dono morto) => Write passa, additionalContext "ADOTADA"', r.status === 0 && /ADOTADA/.test(r.stdout + r.stderr), `${r.status} ${r.stdout.slice(0, 200)} ${r.stderr.slice(0, 200)}`);
ok('dono da MIG-200 regravado para proj', /^proj\|/.test(fs.readFileSync(path.join(SEQD, 'MIG-200', 'dono'), 'utf8')), fs.readFileSync(path.join(SEQD, 'MIG-200', 'dono'), 'utf8'));
r = sh('guard-migration.sh', [], migPayload('0201'));
ok('MIG-201 (dono = worktree VIVA) => segue negada', r.status === 2 && /VIVO/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 200)}`);

console.log('== T10 fechar transfere reservas; T11 doctor lista reserva orfa ==');
fs.mkdirSync(path.join(SEQD, 'DT-300'), { recursive: true }); fs.writeFileSync(path.join(SEQD, 'DT-300', 'dono'), 'proj--wt-viva|2026-09-15T10:00:00|t@t\n');
r = sh('harness-worktree.sh', ['fechar', 'viva'], '');
ok('fechar viva => SEQ|transferida|DT-300 e MIG-201', /SEQ\|transferida\|DT-300\|proj--wt-viva -> proj/.test(r.stdout) && /SEQ\|transferida\|MIG-201/.test(r.stdout), `${r.status} ${r.stdout} ${r.stderr.slice(0, 300)}`);
ok('dono da DT-300 agora e proj', /^proj\|/.test(fs.readFileSync(path.join(SEQD, 'DT-300', 'dono'), 'utf8')));
fs.mkdirSync(path.join(SEQD, 'MIG-999'), { recursive: true }); fs.writeFileSync(path.join(SEQD, 'MIG-999', 'dono'), 'proj--wt-fantasma|2026-09-15T10:00:00|t@t\n');
r = sh('harness-worktree.sh', ['doctor'], '');
ok('doctor => DOCTOR|reserva-orfa|MIG-999', /DOCTOR\|reserva-orfa\|MIG-999\|dono proj--wt-fantasma/.test(r.stdout), `${r.status} ${r.stdout.slice(0, 400)} ${r.stderr.slice(0, 200)}`);
ok('doctor NAO acusa reserva do checkout principal (DT-300)', !/reserva-orfa\|DT-300/.test(r.stdout));

console.log('== T12 harness-metrics start mantem marcador fresco (D1) ==');
limparRun();
const s0 = Math.floor(Date.now() / 1000) - 100;
fs.writeFileSync(path.join(RUN, 'PRD-145-exec.json'), JSON.stringify({ label: 'PRD-145-exec', start: s0, origem: 'auto-prompt' }));
r = sh('harness-metrics.sh', ['start', 'PRD-145-exec'], '');
let mk = lerJson(path.join(RUN, 'PRD-145-exec.json'));
ok('start sobre marcador fresco => TELEMETRIA|mantido, epoch e origem preservados', /TELEMETRIA\|mantido\|PRD-145-exec/.test(r.stdout) && mk.start === s0 && mk.origem === 'auto-prompt', `${r.stdout} ${JSON.stringify(mk)}`);
r = sh('harness-metrics.sh', ['start', 'PRD-145-exec', '--forcar'], '');
mk = lerJson(path.join(RUN, 'PRD-145-exec.json'));
ok('--forcar reinicia (start > antigo)', mk.start > s0 && !/mantido/.test(r.stdout), `${r.stdout} ${JSON.stringify(mk)}`);
fs.writeFileSync(path.join(RUN, 'PRD-146-exec.json'), JSON.stringify({ label: 'PRD-146-exec', start: s0 - 30 * 3600 }));
r = sh('harness-metrics.sh', ['start', 'PRD-146-exec'], '');
ok('marcador de 30 h (stale) e sobrescrito sem --forcar', lerJson(path.join(RUN, 'PRD-146-exec.json')).start > s0, r.stdout);
limparRun();

console.log('== T13 external-review --dry-run: base automatica ==');
const FAKE = path.join(S, 'fakeclaude.sh'); fs.writeFileSync(FAKE, '#!/usr/bin/env bash\ncat >/dev/null\necho "Nenhum achado relevante. (fake)"\n'); fs.chmodSync(FAKE, 0o755);
const ER_ENV = {};
touchLocal(`HARNESS_EXTERNAL_REVIEWER='claude-cli'\nHARNESS_RAG_CLAUDE_BIN='${FAKE.split(path.sep).join('/')}'\nHARNESS_CODEX_REPORTS='codex-reviews'\n`);   // harness.env do mestre define o revisor: sobrescrever pelo .local
const baseSha = git(['rev-parse', 'HEAD']).stdout.trim();
git(['checkout', '-q', '-b', 'wt/t1']);
fs.writeFileSync(path.join(PROJ, 'a.php'), '<?php echo 1;\n'); git(['add', 'a.php']); git(['commit', '-q', '-m', 'TASK-001']);
fs.writeFileSync(path.join(PROJ, 'b.php'), '<?php echo 2;\n');   // untracked (nao commitado)
r = sh('external-review.sh', ['PRD-1', '1', '--dry-run'], '', ER_ENV);
ok('em wt/*: base = merge-base com a main; commitado (a.php) + untracked (b.php) = 2 arquivos', new RegExp('REVIEW\\|dry-run\\|base=' + baseSha + '\\|arquivos=2\\|').test(r.stdout), `${r.status} ${r.stdout} ${r.stderr.slice(0, 300)}`);
r = sh('external-review.sh', ['PRD-1', '1', '--dry-run', '--base', 'none'], '', ER_ENV);
ok('--base none: base=HEAD (so o nao-commitado: 1 arquivo)', /REVIEW\|dry-run\|base=HEAD\|arquivos=1\|/.test(r.stdout), `${r.status} ${r.stdout} ${r.stderr.slice(0, 300)}`);
git(['add', 'b.php']); git(['commit', '-q', '-m', 'TASK-002']);
r = sh('external-review.sh', ['PRD-1', '1', '--dry-run', '--base', 'none'], '', ER_ENV);
ok('--base none com tree limpo: "working tree limpo" (comportamento 3.5.5)', r.status === 0 && /working tree limpo/.test(r.stderr) && !/dry-run/.test(r.stdout), `${r.status} ${r.stdout} ${r.stderr.slice(0, 200)}`);
r = sh('external-review.sh', ['PRD-1', '1', '--dry-run'], '', ER_ENV);
ok('auto com tree limpo em wt/*: os 2 commits desde a base entram (arquivos=2)', /arquivos=2\|/.test(r.stdout), `${r.status} ${r.stdout} ${r.stderr.slice(0, 200)}`);
git(['checkout', '-q', 'main']);
fs.writeFileSync(path.join(PROJ, 'c.php'), '<?php echo 3;\n'); git(['add', 'c.php']); git(['commit', '-q', '-m', 'antes do start']);
const antesSha = git(['rev-parse', 'HEAD']).stdout.trim();
await new Promise((res) => setTimeout(res, 1200));
fs.writeFileSync(path.join(RUN, 'PRD-2-exec.json'), JSON.stringify({ label: 'PRD-2-exec', start: Math.floor(Date.now() / 1000) }));
await new Promise((res) => setTimeout(res, 1200));
fs.writeFileSync(path.join(PROJ, 'd.php'), '<?php echo 4;\n'); git(['add', 'd.php']); git(['commit', '-q', '-m', 'TASK-001 da PRD-2']);
r = sh('external-review.sh', ['PRD-2', '1', '--dry-run'], '', ER_ENV);
ok('na main com marcador PRD-2-exec: base = commit anterior ao start (d.php entra: arquivos=1)', new RegExp('base=' + antesSha + '\\|arquivos=1\\|').test(r.stdout), `${r.status} ${r.stdout} ${r.stderr.slice(0, 300)}`);

console.log('== T14 external-review (claude-cli falso): relatorio com base + manifest revisor-externo ==');
r = sh('external-review.sh', ['PRD-2', '1'], '', ER_ENV);
const REP = r.stdout.trim();
let repArq = ''; try { repArq = fs.readdirSync(path.join(PROJ, 'codex-reviews')).filter((f) => /^PRD-2-ciclo1-/.test(f)).map((f) => path.join(PROJ, 'codex-reviews', f))[0] || ''; } catch {}
ok('devolve o caminho do relatorio (contrato historico) e o arquivo existe em codex-reviews/', /codex-reviews\/PRD-2-ciclo1-\d{8}-\d{6}\.md$/.test(REP) && !!repArq, `${r.status} ${r.stdout} ${r.stderr.slice(0, 300)}`);
const repTxt = repArq ? fs.readFileSync(repArq, 'utf8') : '';
ok('relatorio declara a base e o fake respondeu', /Commit base:\*\* [0-9a-f]{12} \(base do review, 3\.5\.6\)/.test(repTxt) && /Nenhum achado relevante\. \(fake\)/.test(repTxt), repTxt.slice(0, 400));
let manif = ''; try { manif = fs.readdirSync(path.join(PROJ, 'prds', '_metrics', 'delegations')).map((f) => fs.readFileSync(path.join(PROJ, 'prds', '_metrics', 'delegations', f), 'utf8')).join('\n'); } catch {}
ok('manifest de delegacoes tem a linha role=revisor-externo, label=PRD-2, task=review-c1', /"label":"PRD-2","task":"review-c1","role":"revisor-externo"/.test(manif) && /"executor":"claude-cli"/.test(manif), manif.slice(0, 400));
limparRun(); touchLocal();

console.log('== T15 _incidente.sh dedup (D8) ==');
const INC = `. "${HOOKS.replace(/\\/g, '/')}/_incidente.sh"; harness_incidente relatorio hefesto TASK-002 a3202f28 "verif_sem_prova=3 status=ok"; harness_incidente relatorio hefesto TASK-002 a3202f28 "verif_sem_prova=3 status=ok"; harness_incidente relatorio hefesto TASK-002 a3202f28 "verif_sem_prova=2 status=ok"`;
r = spawnSync('bash', ['-c', INC], { cwd: PROJ, encoding: 'utf8', env: { ...ENVB, HARNESS_INCIDENTES: 'on', HARNESS_INCIDENTE_ROOT: PROJ, HARNESS_VERSION: '3.5.6' } });
const incF = fs.readdirSync(path.join(PROJ, 'prds', '_metrics', 'incidentes')).map((f) => fs.readFileSync(path.join(PROJ, 'prds', '_metrics', 'incidentes', f), 'utf8')).join('');
ok('3 chamadas, 2 iguais em sequencia => 2 linhas (a repetida some)', incF.split('\n').filter(Boolean).length === 2, `${r.stderr} ${incF}`);

console.log('== T16 task-telemetry: Status sem negrito; itens sem prova ==');
ok('"Status: ✅ CONCLUÍDO" sem negrito => ✅ (D13)', tt.statusDoRelatorio('## Relatorio\nStatus: ✅ CONCLUÍDO (com uma correção de locator)\n') === '✅', JSON.stringify(tt.statusDoRelatorio('Status: ✅ CONCLUÍDO\n')));
ok('"**Veredito:** ⛔" segue ⛔', tt.statusDoRelatorio('**Veredito:** ⛔ Nao executar\n') === '⛔');
const V = tt.avaliarVerificacoes('# R\n## Verificacoes\n- lint php: OK\n- spec x.spec.js: 6/6 itens passou\n  ```\n  6 passed\n  ```\n- migration aplicada ✅\n## Fim\n');
ok('avaliarVerificacoes: 3 itens, 2 sem prova, lista os dois', V.verif_total === 3 && V.verif_sem_prova === 2 && V.verif_sem_prova_itens.length === 2 && /lint php/.test(V.verif_sem_prova_itens[0]), JSON.stringify(V));

console.log('== T17 task-packet: Ambiente desta worktree + Verificacoes pre-preenchidas ==');
fs.mkdirSync(path.join(PROJ, 'prds', 'PRD-9-x', 'tasks'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'prds', 'PRD-9-x', 'tasks', 'TASK-001-x.md'), '# TASK-001\n## Metadados\n| **Tipo** | backend |\n## Objetivo\nx\n## Arquivo(s) Afetado(s)\n- `administrativo/migrations/0199_base.php`\n## Invariantes do gate\n```bash\nphp -l administrativo/migrations/0199_base.php\n```\n## Testes E2E\n### Arquivo de Teste\n`tests/e2e/PRD-9-x.spec.js`\n');
fs.writeFileSync(path.join(RUN, 'worktree.env'), 'rotulo=exec-9\ndir=x\ndb=proj_wt_exec_9\ndb_host=localhost\ndb_user=u\nurl=http://localhost/proj--wt-exec-9/\napi=\nporta=3105\n');
fs.writeFileSync(path.join(RUN, 'pw-storage.json'), '{}');
r = sh('task-packet.sh', [path.join(PROJ, 'prds', 'PRD-9-x', 'tasks', 'TASK-001-x.md'), '--out', path.join(RUN, 'p.md')], '');
const pk = fs.existsSync(path.join(RUN, 'p.md')) ? fs.readFileSync(path.join(RUN, 'p.md'), 'utf8') : '';
ok('packet tem "6. Ambiente desta worktree" com url, banco e pw-storage', /## 6\. Ambiente desta worktree/.test(pk) && /http:\/\/localhost\/proj--wt-exec-9\//.test(pk) && /proj_wt_exec_9/.test(pk) && /pw-storage\.json/.test(pk), `${r.status} ${r.stdout} ${pk.slice(-900)}`);
ok('packet tem "7. Verificacoes" com o comando da invariante e o spec da task', /## 7\. Verificacoes/.test(pk) && /- \[ \] php -l administrativo\/migrations\/0199_base\.php/.test(pk) && /npx playwright test tests\/e2e\/PRD-9-x\.spec\.js --workers=1/.test(pk), pk.slice(-700));

console.log('== T18 guard-agent --post: itens sem prova e Diff do duelo ==');
const agPost = (tipo, desc) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: tipo, description: desc, prompt: 'x' }, tool_response: 'ok' });
const linhaTask = (extra) => JSON.stringify({ ts: Math.floor(Date.now() / 1000), projeto: 'proj', papel: 'hefesto', rotulo: 'TASK-001', agent_id: 'h1', dur_s: 100, turnos: 10, status: '⚠️', verif_sem_prova: 2, verif_sem_prova_itens: 'lint php: OK; migration aplicada', ...extra });
fs.writeFileSync(path.join(RUN, 'tasks-ultimas.jsonl'), linhaTask({}) + '\n');
r = sh('guard-agent.sh', ['--post'], agPost('hefesto', 'Executa TASK-001'), { HARNESS_WATCHDOG: '0' });
ok('--post avisa [relatorio] com "quais: lint php: OK; migration aplicada"', /quais: lint php: OK; migration aplicada/.test(r.stdout + r.stderr), `${r.status} ${r.stdout.slice(0, 400)} ${r.stderr.slice(0, 200)}`);
fs.mkdirSync(path.join(RUN, 'duelos', 'PRD-9-TASK-001-120000'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'duelos'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'prds', '_metrics', 'duelos', 't@t.jsonl'), JSON.stringify({ ev: 'duelo', id: 'PRD-9-TASK-001-120000', label: 'PRD-9', task: 'TASK-001', modelo_a: 'deepseek/deepseek-v4-flash-0731', modelo_b: 'google/gemini-3.8-flash', status_a: 'ok', status_b: 'pulado', aplica_a: 'sim', aplica_b: 'nao', custo_a: 0.01, custo_b: null, juiz: 'auto', serial: 'on', pulou_b: '1' }) + '\n' + JSON.stringify({ ev: 'veredito', id: 'PRD-9-TASK-001-120000', juiz: 'auto', vencedor: 'A', motivo: 'serial' }) + '\n');
fs.mkdirSync(path.join(RUN, 'relatorios'), { recursive: true });
fs.writeFileSync(path.join(RUN, 'relatorios', 'TASK-001-hefesto.md'), '# Relatorio\n**Status:** ✅\n**Diff do duelo:** aplicado — PRD-9-TASK-001-120000\n## Verificacoes\n- x\n');
fs.writeFileSync(path.join(RUN, 'tasks-ultimas.jsonl'), linhaTask({ status: '✅', verif_sem_prova: 0, verif_sem_prova_itens: '' }) + '\n');
r = sh('guard-agent.sh', ['--post'], agPost('hefesto', 'Executa TASK-001'), { HARNESS_WATCHDOG: '0', HARNESS_SKIP_DUELO: '0' });
const duelos = fs.readdirSync(path.join(PROJ, 'prds', '_metrics', 'duelos')).map((f) => fs.readFileSync(path.join(PROJ, 'prds', '_metrics', 'duelos', f), 'utf8')).join('\n');
ok('linha "Diff do duelo: aplicado" => evento aplicado ok gravado para o id', /"ev":"aplicado","id":"PRD-9-TASK-001-120000"[^\n]*"resultado":"ok"/.test(duelos), `${r.status} ${r.stdout.slice(0, 300)} ${r.stderr.slice(0, 300)} ${duelos.slice(0, 500)}`);
r = sh('guard-agent.sh', ['--post'], agPost('hefesto', 'Executa TASK-001'), { HARNESS_WATCHDOG: '0', HARNESS_SKIP_DUELO: '0' });
ok('segundo --post NAO grava de novo (idempotente)', (duelos.match(/"ev":"aplicado"/g) || []).length === 1 && (fs.readdirSync(path.join(PROJ, 'prds', '_metrics', 'duelos')).map((f) => fs.readFileSync(path.join(PROJ, 'prds', '_metrics', 'duelos', f), 'utf8')).join('\n').match(/"ev":"aplicado"/g) || []).length === 1);

console.log('== T19 guard-agent pre: sem packet => monta e nega com o caminho ==');
fs.writeFileSync(path.join(RUN, 'PRD-9-exec.json'), JSON.stringify({ label: 'PRD-9-exec', start: Math.floor(Date.now() / 1000) }));
fs.writeFileSync(path.join(RUN, 'esforco.env'), 'fase=executar\nalvo=medium\natual=medium\n');
const agPre = JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'hefesto', description: 'Executa TASK-001', prompt: 'implemente a TASK-001 conforme prds/PRD-9-x/tasks/TASK-001-x.md', model: 'sonnet' } });
r = sh('guard-agent.sh', [], agPre);
ok('deny cita "montou agora" e o packet existe', r.status === 2 && /montou agora/.test(r.stderr) && fs.existsSync(path.join(RUN, 'packets', 'TASK-001.packet.md')), `${r.status} ${r.stderr.slice(0, 400)}`);
limparRun();

console.log('== T20 harness-duelo --pool / --validar (DT-010) ==');
r = sh('harness-duelo.sh', ['--pool'], '', { HARNESS_SKIP_DUELO: '0' });
ok('sem variavel local: pool do _defaults.env com gemini-3.8 e origem=defaults', /^POOL\|deepseek\/deepseek-v4-flash-0731,google\/gemini-3\.8-flash\|qwen\/qwen3\.7-flash[^|]*\|origem=defaults\|/m.test(r.stdout), `${r.status} ${r.stdout} ${r.stderr.slice(0, 200)}`);
touchLocal("HARNESS_DUELO_MODELS='x/y-1'\n");
r = sh('harness-duelo.sh', ['--pool'], '', { HARNESS_SKIP_DUELO: '0' });
ok('harness.env.local sobrescrevendo => origem=harness.env.local', /^POOL\|x\/y-1\|[^|]*\|origem=harness\.env\.local\|/m.test(r.stdout), `${r.status} ${r.stdout}`);
touchLocal();
const CACHE = path.join(S, 'or-models.json'); fs.writeFileSync(CACHE, JSON.stringify({ data: [{ id: 'deepseek/deepseek-v4-flash-0731' }, { id: 'qwen/qwen3.7-flash' }, { id: 'x-ai/grok-build-0.1' }, { id: 'deepseek/deepseek-v4-pro' }] }));
r = sh('harness-duelo.sh', ['--pool', '--validar'], '', { HARNESS_SKIP_DUELO: '0', HARNESS_OPENROUTER_MODELS_CACHE: CACHE });
ok('--validar com catalogo sem o gemini => DUELO|pool|modelo-inexistente|google/gemini-3.8-flash', /DUELO\|pool\|modelo-inexistente\|google\/gemini-3\.8-flash/.test(r.stdout) && /DUELO\|pool\|com-problemas\|/.test(r.stdout), `${r.status} ${r.stdout} ${r.stderr.slice(0, 200)}`);

console.log('== T21 teste do mestre: slugs citados no codigo dos hooks pertencem a pool ==');
const defs = fs.readFileSync(path.join(MASTER, '.claude', 'hooks', '_defaults.env'), 'utf8');
const val = (k) => ((defs.match(new RegExp('^' + k + "='([^']*)'", 'm')) || [])[1] || '');
const permitidos = new Set([val('HARNESS_DUELO_MODELS'), val('HARNESS_DUELO_SUPLENTES'), val('HARNESS_DUELO_JUIZ_MODEL'), val('HARNESS_OPENROUTER_MODEL')].join(',').split(',').map((s) => s.trim()).filter(Boolean));
const RX_SLUG = /\b(deepseek|google|qwen|x-ai|anthropic|openai|meta-llama|mistralai|moonshotai|z-ai|minimax)\/[A-Za-z0-9._-]+/g;
const viol = [];
for (const f of fs.readdirSync(path.join(MASTER, '.claude', 'hooks'))) {
  if (!/\.(sh|mjs)$/.test(f)) continue;
  const ls = fs.readFileSync(path.join(MASTER, '.claude', 'hooks', f), 'utf8').split('\n');
  ls.forEach((l, i) => { if (/^\s*(#|\/\/)/.test(l)) return; if (/harness_log|^\s*log /.test(l) && /npm i -g|Instalar/.test(l)) return; for (const m of l.match(RX_SLUG) || []) if (m !== 'openai/codex' && !permitidos.has(m)) viol.push(f + ':' + (i + 1) + ' ' + m); });
}
ok('pool/suplentes/juiz/openrouter do _defaults.env cobrem todo slug citado em codigo (' + permitidos.size + ' permitidos)', viol.length === 0, viol.join(' | '));
ok('_defaults.env: gemini-3.8 e titular, 3.7 nao aparece; haiku e qwen3-coder-next fora', /google\/gemini-3\.8-flash/.test(val('HARNESS_DUELO_MODELS')) && !/3\.7-flash/.test(val('HARNESS_DUELO_MODELS')) && !/haiku|coder-next/.test([val('HARNESS_DUELO_MODELS'), val('HARNESS_DUELO_SUPLENTES'), val('HARNESS_DUELO_JUIZ_MODEL'), val('HARNESS_OPENROUTER_MODEL'), val('HARNESS_DELEGATE_TOOLS_OFF_MODELS')].join(',')));   // 3.5.7: o _defaults.env passou a ter TODAS as decisoes (HARNESS_RAG_CLAUDE_MODEL e haiku de proposito) — a regua vale so para as chaves de modelo do duelo/openrouter

console.log('== T22 harness-duelo --placar (DT-011) ==');
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'duelos'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'prds', '_metrics', 'duelos', 't@t.jsonl'), [
  JSON.stringify({ ev: 'duelo', id: 'D1', label: 'PRD-9', task: 'TASK-001', modelo_a: 'deepseek/deepseek-v4-flash-0731', modelo_b: 'google/gemini-3.8-flash', status_a: 'ok', status_b: 'pulado', aplica_a: 'sim', aplica_b: 'nao', custo_a: 0.02, custo_b: null, juiz: 'auto', serial: 'on', pulou_b: '1' }),
  JSON.stringify({ ev: 'veredito', id: 'D1', juiz: 'auto', vencedor: 'A' }), JSON.stringify({ ev: 'aplicado', id: 'D1', resultado: 'ok' }),
  JSON.stringify({ ev: 'duelo', id: 'D2', label: 'PRD-9', task: 'TASK-002', modelo_a: 'google/gemini-3.8-flash', modelo_b: 'deepseek/deepseek-v4-flash-0731', status_a: 'ok', status_b: 'ok', aplica_a: 'sim', aplica_b: 'sim', custo_a: 0.05, custo_b: 0.01, juiz: 'themis', serial: 'off', pulou_b: '0' }),
  JSON.stringify({ ev: 'veredito', id: 'D2', juiz: 'themis', vencedor: 'A' }),
].join('\n') + '\n');
r = sh('harness-duelo.sh', ['--placar'], '', { HARNESS_SKIP_DUELO: '0' });
ok('PLACAR|total: 2 duelos, 2 com vencedor, 1 usado', /PLACAR\|total\|duelos=2\|com_vencedor=2\|wo_ou_serial=1\|usados=1\|/.test(r.stdout), `${r.status} ${r.stdout} ${r.stderr.slice(0, 200)}`);
ok('deepseek: disputou=2 venceu=1 usado=1; gemini: disputou=1 venceu=1 desconhecido=1', /PLACAR\|deepseek\/deepseek-v4-flash-0731\|disputou=2\|venceu=1\|usado=1\|descartado=0\|desconhecido=0\|custo_usd=0\.03\|custo_por_usado=0\.03/.test(r.stdout) && /PLACAR\|google\/gemini-3\.8-flash\|disputou=1\|venceu=1\|usado=0\|descartado=0\|desconhecido=1\|/.test(r.stdout), r.stdout);

console.log('== T23 preflight codex-cli: limite compartilhado da maquina (D17) ==');
fs.mkdirSync(path.join(HOME, '.harness-run'), { recursive: true });
fs.writeFileSync(path.join(HOME, '.harness-run', 'codex-limite.json'), JSON.stringify({ ate: Math.floor(Date.now() / 1000) + 3600, ate_h: 'x', projeto: 'outro-projeto', ts: Math.floor(Date.now() / 1000) }));
r = sh('harness-delegate.sh', ['--preflight', 'codex-cli'], '', { PATH: path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '') });
ok('preflight codex-cli => PREFLIGHT|indisponivel|codex-cli|limite-ate (exit 10), sem pingar', r.status === 10 && /PREFLIGHT\|indisponivel\|codex-cli\|limite-ate/.test(r.stdout) && /outro-projeto/.test(r.stderr), `${r.status} ${r.stdout} ${r.stderr.slice(0, 300)}`);
ok('.status do projeto replicado com ate=', /^ate=\d+/m.test(fs.readFileSync(path.join(RUN, 'preflight-codex-cli.status'), 'utf8')), fs.readFileSync(path.join(RUN, 'preflight-codex-cli.status'), 'utf8'));
fs.rmSync(path.join(HOME, '.harness-run', 'codex-limite.json'));

console.log('== T24 serial/novato: flags existem e nascem em 0 (escopo B, desligado) ==');
const duelo = fs.readFileSync(path.join(HOOKS, 'harness-duelo.sh'), 'utf8');
ok('HARNESS_DUELO_SERIAL_NOVATO_MIN e HARNESS_DUELO_SERIAL_AMOSTRA com default 0', /HARNESS_DUELO_SERIAL_NOVATO_MIN:-0/.test(duelo) && /HARNESS_DUELO_SERIAL_AMOSTRA:-0/.test(duelo));
ok('pool literal antiga (gemini-3.7) nao existe mais no script', !/gemini-3\.7-flash/.test(duelo.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')));

console.log(`\n${pass} PASS · ${fail} FAIL · sandbox ${S}${process.env.T_KEEP ? ' (mantido)' : ''}`);
if (!process.env.T_KEEP) { try { git(['worktree', 'prune']); } catch {} fs.rmSync(S, { recursive: true, force: true }); }
process.exit(fail ? 1 : 0);
