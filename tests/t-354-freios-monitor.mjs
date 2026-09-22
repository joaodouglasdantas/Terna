#!/usr/bin/env node
// tests/t-354-freios-monitor.mjs — bateria da 3.5.4 (correcoes medidas no monitor de 14/09/2026).
// Roda em SANDBOX proprio (repo git falso em os.tmpdir()), nunca toca o projeto real.
//   node tests/t-354-freios-monitor.mjs
//
// O que prova (mecanico):
//   T1 guard-playwright.motivoFamilia: `2>&1 | tail`, `> out.txt`, `2>/dev/null` nao sao "familia"; diretorio e glob seguem negados.
//   T2 guard-playwright.ehComandoDeTeste: rm/grep/node --check/node -e citando .spec.js NAO contam; playwright test/npm test contam;
//      `npx playwright install`/`screenshot` nao contam.
//   T3 checkPlaywright em subagente: 4 rodadas passam, 5a nega; comando de leitura citando o spec nao consome.
//   T4 creditarRodada (--post): saida com [e2e-lock] devolve a rodada; sem a marca, nao.
//   T5 guard-folego.contarChamadas: Read/Grep/Glob pesam 0.5 (n, n_leitura, n_escrita); peso 1 = 3.4.22.
//   T6 guard-bash GUARDA 1: scratchpad da sessao passa; /tmp continua negado.
//   T7 harness-worktree reservar DT com prds/dt (INDEX DT-217/218) => SEQ|DT|219; sem pasta => morre sem reservar.
//   T8 harness-metrics-auto: cabecalho <command-name>/dt-exec vence "prd-exec" citado no corpo; marcador velho e substituido; log gravado.
//   T9 harness-metrics stop: marcador de 30 h => recusado (exit 4, sem linha); repeticao deriva o inicio do transcript (origem_start=transcript).
//   T10 guard-agent: 1o hefesto sem esforco.env => deny citando esforco.sh; com esforco.env fase=executar => passa.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-354-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const RUN = path.join(PROJ, '.claude', '.harness-run');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1', HARNESS_PRESENCE_URL: '', HARNESS_FRENTES: 'off', HARNESS_DAEMON: 'off', HARNESS_RAG_ENABLED: '0', HARNESS_SKIP_DUELO: '1', HARNESS_INCIDENTES: 'off' };

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\nHARNESS_SKIP_DUELO='1'\nHARNESS_INCIDENTES='off'\n`);
fs.mkdirSync(path.join(PROJ, 'prds', 'dt', 'lotes'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'prds', 'dt', 'INDEX.md'), '# DTs\n| DT-217 | x |\n| DT-218 | y |\n');
fs.mkdirSync(RUN, { recursive: true });
const git = (args, cwd = PROJ) => spawnSync('git', args, { cwd, encoding: 'utf8', env: ENVB });
git(['init', '-q']); git(['config', 'user.email', 't@t']); git(['config', 'user.name', 't']); git(['add', '.']); git(['commit', '-q', '-m', 'base']);

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 400)); } };
const sh = (file, args, input, env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const SUBT = path.join(S, 'sess', 'subagents');
fs.mkdirSync(SUBT, { recursive: true });
const subPayload = (id, cmd, extra = {}) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: id, agent_type: 'hefesto', transcript_path: path.join(SUBT, 'agent-' + id + '.jsonl'), tool_input: { command: cmd }, ...extra });

const pw = await import(pathToFileURL(path.join(HOOKS, 'guard-playwright.mjs')).href);
const fol = await import(pathToFileURL(path.join(HOOKS, 'guard-folego.mjs')).href);
const gb = await import(pathToFileURL(path.join(HOOKS, 'guard-bash.mjs')).href);

console.log('== T1 motivoFamilia x redirecionamento ==');
ok('spec explicito + 2>&1 | tail => nao e familia', pw.motivoFamilia('npx playwright test tests/e2e/PRD-139-b-migration.spec.js --project=chromium --reporter=list 2>&1 | tail -60') === '', pw.motivoFamilia('npx playwright test tests/e2e/x.spec.js 2>&1 | tail -60'));
ok('spec explicito + > out.txt => nao e familia', pw.motivoFamilia('npx playwright test tests/e2e/x.spec.js --workers=1 > out.txt') === '');
ok('spec explicito + 2>/dev/null => nao e familia', pw.motivoFamilia('cd "C:/x" && npx playwright test tests/e2e/x.spec.js 2>/dev/null') === '');
ok('spec explicito + `> log &` (background) => nao e familia (3.5.4c)', pw.motivoFamilia('npx playwright test tests/e2e/x.spec.js --grep "Fluxo 7" --workers=1 > .claude/.harness-run/tmp/f7.log 2>&1 &') === '', pw.motivoFamilia('npx playwright test tests/e2e/x.spec.js > f7.log 2>&1 &'));
ok('diretorio tests/e2e/ segue negado', /diretorio/.test(pw.motivoFamilia('npx playwright test tests/e2e/ 2>&1')), pw.motivoFamilia('npx playwright test tests/e2e/ 2>&1'));
ok('glob PRD-139-* segue negado', /glob/.test(pw.motivoFamilia('npx playwright test tests/e2e/PRD-139-*.spec.js')));
ok('suite inteira segue negada', /suite/.test(pw.motivoFamilia('npx playwright test 2>&1 | tail')));

console.log('== T2 ehComandoDeTeste ==');
ok('rm x.spec.js nao e rodada', !pw.ehComandoDeTeste('rm tests/e2e/PRD-139-b-monitoramento.spec.js'));
ok('grep -n ... x.spec.js nao e rodada', !pw.ehComandoDeTeste('grep -n "page.goto" -A1 tests/e2e/PRD-139-b.spec.js'));
ok('node --check x.spec.js nao e rodada', !pw.ehComandoDeTeste('node --check tests/e2e/PRD-139-b-acl-cache.spec.js && echo SYNTAX_OK'));
ok('node -e editando o spec nao e rodada', !pw.ehComandoDeTeste("node -e \"const p='tests/e2e/x.spec.js'; require('fs').readFileSync(p)\""));
ok('npx playwright install nao e rodada', !pw.ehComandoDeTeste('npx playwright install chromium'));
ok('playwright screenshot nao e rodada', !pw.ehComandoDeTeste('npx playwright screenshot --load-storage x.json http://localhost/ out.png'));
ok('npx playwright test e rodada', pw.ehComandoDeTeste('npx playwright test tests/e2e/x.spec.js --workers=1'));
ok('npm test e rodada', pw.ehComandoDeTeste('npm test'));
ok('phpunit e rodada', pw.ehComandoDeTeste('vendor/bin/phpunit tests/Unit'));

console.log('== T3 checkPlaywright: teto conta so rodadas reais ==');
const A = 'a354aaaa1111';
let r = pw.checkPlaywright(subPayload(A, 'rm tests/e2e/x.spec.js'), { root: PROJ });
ok('rm do spec: passa e nao cria contador', r.exit === 0 && !fs.existsSync(path.join(RUN, 'playwright', A + '.json')));
for (let i = 1; i <= 4; i++) { r = pw.checkPlaywright(subPayload(A, `npx playwright test tests/e2e/x.spec.js --workers=1 2>&1 | tail -80`), { root: PROJ }); ok(`rodada ${i} passa (2>&1 nao e familia)`, r.exit === 0, r.stderr); }
r = pw.checkPlaywright(subPayload(A, 'npx playwright test tests/e2e/x.spec.js --workers=1'), { root: PROJ });
ok('5a rodada negada (teto 4)', r.exit === 2 && /teto 4/.test(r.stderr), r.stderr);
const st = JSON.parse(fs.readFileSync(path.join(RUN, 'playwright', A + '.json'), 'utf8'));
ok('contador n=5', st.n === 5, JSON.stringify(st));

console.log('== T4 creditarRodada no e2e-lock ==');
const post = (id, cmd, saida) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', agent_id: id, agent_type: 'hefesto', transcript_path: path.join(SUBT, 'agent-' + id + '.jsonl'), tool_input: { command: cmd }, tool_response: { stdout: saida, stderr: '', interrupted: false } });
ok('saida sem [e2e-lock] nao credita', pw.creditarRodada(post(A, 'npx playwright test tests/e2e/x.spec.js', '6 passed'), { root: PROJ }) === false);
ok('saida com [e2e-lock] credita', pw.creditarRodada(post(A, 'npx playwright test tests/e2e/x.spec.js', 'Exit code 1 [e2e-lock] execução concorrente de Playwright detectada: lock ativo'), { root: PROJ }) === true);
const st2 = JSON.parse(fs.readFileSync(path.join(RUN, 'playwright', A + '.json'), 'utf8'));
ok('contador voltou a 4 (creditos=1)', st2.n === 4 && st2.creditos === 1, JSON.stringify(st2));
r = pw.checkPlaywright(subPayload(A, 'npx playwright test tests/e2e/x.spec.js --workers=1'), { root: PROJ });
ok('...e a rodada seguinte e negada de novo (n=5), sem crescer o teto', r.exit === 2);
r = gb.guardBash(post(A, 'npx playwright test tests/e2e/x.spec.js', '[e2e-lock] lock ativo'), 'post', { root: PROJ });
ok('guardBash --post chama o credito (n volta a 4)', JSON.parse(fs.readFileSync(path.join(RUN, 'playwright', A + '.json'), 'utf8')).n === 4);
ok('linha regra=credito no playwright.jsonl', /"regra":"credito"/.test(fs.readFileSync(path.join(RUN, 'playwright.jsonl'), 'utf8')));

console.log('== T5 folego: peso da leitura ==');
const tr = path.join(S, 'tr.jsonl');
const tu = (name) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_' + Math.random().toString(36).slice(2), name, input: {} }] } });
fs.writeFileSync(tr, [tu('Read'), tu('Grep'), tu('Glob'), tu('Read'), tu('Bash'), tu('Write'), tu('Edit')].join('\n') + '\n');
let c = fol.contarChamadas(tr, path.join(S, 'st-05.json'), 0.5);
ok('peso 0.5: n=5 (4 leituras x 0.5 + 3)', c.n === 5 && c.n_leitura === 4 && c.n_escrita === 3, JSON.stringify(c));
c = fol.contarChamadas(tr, path.join(S, 'st-1.json'), 1);
ok('peso 1: n=7 (3.4.22)', c.n === 7 && c.n_leitura === 4 && c.n_escrita === 3, JSON.stringify(c));
fs.appendFileSync(tr, tu('Grep') + '\n' + tu('Bash') + '\n');
c = fol.contarChamadas(tr, path.join(S, 'st-05.json'), 0.5);
ok('delta incremental: n=6.5', c.n === 6.5 && c.n_leitura === 5 && c.n_escrita === 4, JSON.stringify(c));

console.log('== T6 GUARDA 1: scratchpad passa, /tmp nao ==');
const paiPayload = (cmd) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd } });
r = gb.guardBash(paiPayload('cat > /c/Users/x/AppData/Local/Temp/claude/C--laragon-www-p/abc-123/scratchpad/smoke.php <<\'EOF\'\n<?php\nEOF'), 'pre', { root: PROJ });
ok('scratchpad (Windows) passa', r.exit === 0, r.stderr);
r = gb.guardBash(paiPayload('php x.php > /private/var/folders/ab/T/claude/proj/sess/scratchpad/out.txt'), 'pre', { root: PROJ });
ok('scratchpad (macOS) passa', r.exit === 0, r.stderr);
r = gb.guardBash(paiPayload('cat > /tmp/main_cron.tsv'), 'pre', { root: PROJ });
ok('/tmp continua negado', r.exit === 2 && /FORA do projeto/.test(r.stderr), r.stderr.slice(0, 120));
r = gb.guardBash(paiPayload('cat > /c/Users/x/AppData/Local/Temp/claude/toks.txt'), 'pre', { root: PROJ });
ok('Temp/claude fora do scratchpad continua negado', r.exit === 2);

console.log('== T7 reservar DT em prds/dt ==');
r = sh('harness-worktree.sh', ['reservar', 'DT'], '');
ok('reservar DT => SEQ|DT|219 (INDEX em prds/dt)', /^SEQ\|DT\|219$/m.test(r.stdout), r.stdout + r.stderr);
r = sh('harness-worktree.sh', ['reservar', 'LOTE'], '');
ok('reservar LOTE => SEQ|LOTE|1 (sem lote no INDEX, pasta achada)', /^SEQ\|LOTE\|1$/m.test(r.stdout), r.stdout + r.stderr);
fs.renameSync(path.join(PROJ, 'prds', 'dt'), path.join(PROJ, 'prds', 'dt-off'));
r = sh('harness-worktree.sh', ['reservar', 'DT'], '');
const gitCommon = git(['rev-parse', '--git-common-dir']).stdout.trim();
const seqd = path.isAbsolute(gitCommon) ? path.join(gitCommon, 'harness-locks', 'seq') : path.join(PROJ, gitCommon, 'harness-locks', 'seq');
ok('sem pasta de DTs => morre sem reservar (nada de DT-1)', r.status !== 0 && /pasta de DTs nao encontrada/.test(r.stderr) && !fs.existsSync(path.join(seqd, 'DT-1')), `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('harness-worktree.sh', ['reservar', 'DT'], '', { HARNESS_DTS_DIR: 'prds/dt-off' });
ok('HARNESS_DTS_DIR aponta a pasta => SEQ|DT|220', /^SEQ\|DT\|220$/m.test(r.stdout), r.stdout + r.stderr);
fs.renameSync(path.join(PROJ, 'prds', 'dt-off'), path.join(PROJ, 'prds', 'dt'));

console.log('== T8 metrics-auto: cabecalho vence o corpo; marcador velho e substituido ==');
const prompt = (p) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'UserPromptSubmit', prompt: p });
r = sh('harness-metrics-auto.sh', [], prompt('<command-message>dt-exec</command-message>\n<command-name>/dt-exec</command-name>\n<command-args>DT-592\n\nContexto: o item veio da /prd-exec PRD-136 e nao e a PRD-143</command-args>'));
ok('/dt-exec com "prd-exec 136" no corpo => _auto-dt-exec (nao PRD-136-exec)', fs.existsSync(path.join(RUN, '_auto-dt-exec.json')) && !fs.existsSync(path.join(RUN, 'PRD-136-exec.json')), r.stdout + fs.readdirSync(RUN).join(','));
ok('log metrics-auto.log tem "ligado|_auto-dt-exec"', /\|ligado\|_auto-dt-exec/.test(fs.readFileSync(path.join(RUN, 'metrics-auto.log'), 'utf8')));
const velho = Math.floor(Date.now() / 1000) - 30 * 3600;
fs.writeFileSync(path.join(RUN, '_auto-dt-exec.json'), JSON.stringify({ label: '_auto-dt-exec', start: velho }));
r = sh('harness-metrics-auto.sh', [], prompt('<command-name>/dt-exec</command-name><command-args>DT-1</command-args>'));
const novo = JSON.parse(fs.readFileSync(path.join(RUN, '_auto-dt-exec.json'), 'utf8')).start;
ok('marcador de 30 h substituido pelo de agora', novo > velho + 3600 && /substituiu-velho/.test(fs.readFileSync(path.join(RUN, 'metrics-auto.log'), 'utf8')), r.stdout);
r = sh('harness-metrics-auto.sh', [], prompt('<command-name>/dt-exec</command-name><command-args>DT-2</command-args>'));
ok('marcador fresco e mantido', /JA LIGADO/.test(r.stdout) && JSON.parse(fs.readFileSync(path.join(RUN, '_auto-dt-exec.json'), 'utf8')).start === novo, r.stdout);
r = sh('harness-metrics-auto.sh', [], prompt('Base directory for this skill: C:\\x\\.claude\\skills\\prd-exec\n\n# PRD Execution Skill (fala de /dt-exec tambem)\n<command-args>PRD-139-b</command-args>'));
ok('cabecalho "Base directory ... skills\\prd-exec" + args => PRD-139-b-exec', fs.existsSync(path.join(RUN, 'PRD-139-b-exec.json')), r.stdout + fs.readdirSync(RUN).join(','));
fs.rmSync(path.join(RUN, '_auto-dt-exec.json'), { force: true }); fs.rmSync(path.join(RUN, 'PRD-139-b-exec.json'), { force: true });

console.log('== T9 stop: marcador velho recusado; inicio derivado do transcript ==');
const slug = PROJ.replace(/[^a-zA-Z0-9]/g, '-');
const pdir = path.join(HOME, '.claude', 'projects', slug); fs.mkdirSync(pdir, { recursive: true });
const t0 = new Date(Date.now() - 42 * 60 * 1000).toISOString();
fs.writeFileSync(path.join(pdir, 'sess.jsonl'), JSON.stringify({ type: 'user', timestamp: t0, message: { role: 'user', content: 'x' } }) + '\n' + JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } } }) + '\n');
fs.writeFileSync(path.join(RUN, 'LOTE-9.json'), JSON.stringify({ label: 'LOTE-9', start: velho }));
r = sh('harness-metrics.sh', ['stop', 'LOTE-9', '--tasks=1', '--ciclos=1', '--subagents=0'], '');
ok('marcador de 30 h => exit 4, TELEMETRIA|stale, marcador removido', r.status === 4 && /TELEMETRIA\|stale\|LOTE-9/.test(r.stdout) && !fs.existsSync(path.join(RUN, 'LOTE-9.json')), `${r.status} ${r.stdout.slice(0, 200)} ${r.stderr.slice(0, 200)}`);
const runsDir = path.join(PROJ, 'prds', '_metrics', 'runs');
const linhas = () => { try { return fs.readdirSync(runsDir).map(f => fs.readFileSync(path.join(runsDir, f), 'utf8')).join('\n'); } catch { return ''; } };
ok('nenhuma linha gravada para LOTE-9', !/"label":"LOTE-9"/.test(linhas()) && !/"label":"LOTE-9"/.test((() => { try { return fs.readFileSync(path.join(PROJ, 'prds', '_metrics', 'harness-runs.jsonl'), 'utf8'); } catch { return ''; } })()));
r = sh('harness-metrics.sh', ['stop', 'LOTE-9', '--tasks=1', '--ciclos=1', '--subagents=0', '--esforco-final=medium'], '');
const L9 = (linhas().split('\n').filter(l => /"label":"LOTE-9"/.test(l)).pop() || '');
let o9 = {}; try { o9 = JSON.parse(L9); } catch {}
ok('repeticao: inicio derivado do transcript (origem_start=transcript, elapsed ~42 min)', o9.origem_start === 'transcript' && o9.elapsed_s >= 41 * 60 && o9.elapsed_s <= 45 * 60, `${r.status} ${L9.slice(0, 300)} ${r.stderr.slice(0, 300)}`);
ok('--esforco-final=medium => esforco n/d/medium (sem esforco.env)', o9.esforco === 'n/d/medium', o9.esforco);
fs.writeFileSync(path.join(RUN, 'esforco.env'), `fase=executar\nalvo=medium\natual=high\nts=${Math.floor(Date.now() / 1000) - 3 * 3600}\n`);
fs.writeFileSync(path.join(RUN, 'LOTE-10.json'), JSON.stringify({ label: 'LOTE-10', start: Math.floor(Date.now() / 1000) - 600 }));
r = sh('harness-metrics.sh', ['stop', 'LOTE-10', '--tasks=1', '--ciclos=1', '--subagents=0'], '');
const L10 = (linhas().split('\n').filter(l => /"label":"LOTE-10"/.test(l)).pop() || ''); let o10 = {}; try { o10 = JSON.parse(L10); } catch {}
ok('esforco.env 3 h antes do start => ignorado (esforco vazio) + aviso', o10.esforco === '' && /ANTES do start/.test(r.stderr), `${o10.esforco} ${r.stderr.slice(0, 200)}`);
fs.writeFileSync(path.join(RUN, 'esforco.env'), `fase=executar\nalvo=medium\natual=high\nts=${Math.floor(Date.now() / 1000) - 300}\n`);
fs.writeFileSync(path.join(RUN, 'LOTE-11.json'), JSON.stringify({ label: 'LOTE-11', start: Math.floor(Date.now() / 1000) - 600 }));
r = sh('harness-metrics.sh', ['stop', 'LOTE-11', '--tasks=1', '--ciclos=1', '--subagents=0', '--esforco-final=medium'], '');
const L11 = (linhas().split('\n').filter(l => /"label":"LOTE-11"/.test(l)).pop() || ''); let o11 = {}; try { o11 = JSON.parse(L11); } catch {}
ok('esforco.env desta run + --esforco-final=medium => esforco medium/medium, origem_start=marcador', o11.esforco === 'medium/medium' && o11.origem_start === 'marcador', L11.slice(0, 200));

console.log('== T10 guard-agent: esforco da fase antes do 1o executor ==');
fs.mkdirSync(path.join(RUN, 'packets'), { recursive: true });
fs.writeFileSync(path.join(RUN, 'packets', 'TASK-001.packet.md'), '# packet\n');
fs.rmSync(path.join(RUN, 'esforco.env'), { force: true });
for (const f of fs.readdirSync(RUN)) if (/-exec\.json$|^LOTE-|^_auto-/.test(f)) fs.rmSync(path.join(RUN, f), { force: true });
const ag = (extra = '') => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'hefesto', description: 'TASK-001 x', prompt: 'Implemente a TASK-001; seu contexto inteiro esta em .claude/.harness-run/packets/TASK-001.packet.md ' + extra } });
r = sh('guard-agent.sh', [], ag());
ok('sem esforco.env => deny citando esforco.sh e set_session_effort', r.status === 2 && /ESFORCO DA FASE/.test(r.stderr) && /esforco\.sh executar/.test(r.stderr) && /set_session_effort/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 200)}`);
fs.writeFileSync(path.join(RUN, 'esforco.env'), `fase=pensar\nalvo=high\natual=high\nts=${Math.floor(Date.now() / 1000)}\n`);
r = sh('guard-agent.sh', [], ag());
ok('esforco.env fase=pensar => deny (fase errada)', r.status === 2 && /ESFORCO DA FASE/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 120)}`);
fs.writeFileSync(path.join(RUN, 'esforco.env'), `fase=executar\nalvo=medium\natual=medium\nts=${Math.floor(Date.now() / 1000)}\n`);
r = sh('guard-agent.sh', [], ag());
ok('esforco.env fase=executar desta decolagem => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
fs.writeFileSync(path.join(RUN, 'esforco.env'), `fase=executar\nalvo=medium\natual=medium\nts=${Math.floor(Date.now() / 1000) - 4 * 3600}\n`);
r = sh('guard-agent.sh', [], ag());
ok('esforco.env de 4 h atras (outra decolagem) => deny', r.status === 2 && /ESFORCO DA FASE/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 120)}`);
// o harness.env do mestre declara HARNESS_GUARD_ESFORCO='on' (arquivo vence ambiente) — o opt-out e por harness.env.local
const envLocal = path.join(PROJ, '.claude', 'harness.env.local'); const envLocal0 = fs.readFileSync(envLocal, 'utf8');
fs.appendFileSync(envLocal, "HARNESS_GUARD_ESFORCO='off'\n");
r = sh('guard-agent.sh', [], ag());
ok('HARNESS_GUARD_ESFORCO=off (harness.env.local) desliga', r.status === 0, `${r.status} ${r.stderr.slice(0, 120)}`);
fs.writeFileSync(envLocal, envLocal0);

console.log('== T11 guard-agent: rotulo do despacho = packet citado > description > 1o rotulo do prompt ==');
fs.writeFileSync(path.join(RUN, 'esforco.env'), `fase=executar\nalvo=medium\natual=medium\nts=${Math.floor(Date.now() / 1000)}\n`);
fs.writeFileSync(path.join(RUN, 'packets', 'DT-593.packet.md'), '# packet 593\n');
const agDt = (desc, prompt) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'dedalo', description: desc, prompt } });
r = sh('guard-agent.sh', [], agDt('G1: DT-593 (modal cancelar)', 'Contexto: rescaldo do DT-592. Implemente o DT-593; seu contexto inteiro esta em .claude/.harness-run/packets/DT-593.packet.md'));
ok('prompt cita DT-592 antes, packet e da DT-593 => passa (packet citado vence)', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-agent.sh', [], agDt('G1: DT-593 (modal cancelar)', 'Contexto: rescaldo do DT-592. Implemente o DT-593 conforme o packet ja gerado.'));
ok('sem caminho do packet no prompt: description (DT-593) vence o DT-592 do prompt => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-agent.sh', [], agDt('modal cancelar', 'Contexto: rescaldo do DT-592. Implemente o DT-593.'));
ok('sem packet nem description com rotulo: 1o rotulo do prompt (DT-592) => deny citando DT-592 sem packet', r.status === 2 && /DT-592 sem TASK PACKET/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 200)}`);

console.log(`\n${pass} PASS · ${fail} FAIL · sandbox ${S}`);
if (!process.env.T_KEEP) fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
