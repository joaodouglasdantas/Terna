#!/usr/bin/env node
// tests/t-3429-cronometro-prd.mjs — bateria da 3.4.29 (cronometro da Fase 1 da /prd liga sozinho).
// Roda em SANDBOX proprio (projeto falso em os.tmpdir()), nunca toca o projeto real.
//   node tests/t-3429-cronometro-prd.mjs
//
// O que prova (mecanico):
//   T1 harness-metrics-auto.sh: prompt /prd (slash, com --ideia) liga _auto-prd-fase1; /prd-exec 5 segue
//      ligando PRD-005-exec; /prd-status e texto solto nao ligam nada; reinvocar nao sobrescreve.
//   T2 harness-metrics.sh start PRD-NNN-fase1 ADOTA o epoch do _auto-prd-fase1 e apaga o auto.
//   T3 stop herda por familia: fase1 sem start + so _auto-dt-exec => sem-start; com _auto-prd-fase1 =>
//      duracao herdada; LOTE sem start + _auto-prd-fase1 => sem-start (nao herda o de criacao).
//   T4 guard-agent.sh: 1o agente da criacao citando PRD-NNN sem marcador => PRD-NNN-fase1.json (exit 0);
//      fase1 ja gravada nos runs => PRD-NNN-fase2.json; marcador *-exec da PRD, _auto-dt-exec presente ou
//      prompt com .packet.md => nada; sherlock nao liga; HARNESS_METRICS_AUTO=0 desliga.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3429-cron-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const RUN = path.join(PROJ, '.claude', '.harness-run');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };
const SESS = 'sess-3429';

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude', 'agents'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'contratos'), path.join(PROJ, '.claude', 'contratos'), { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\nHARNESS_GUARD_PRD_PACKET='0'\n`);
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'runs'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'tasks'), { recursive: true });
fs.mkdirSync(RUN, { recursive: true });
spawnSync('git', ['init', '-q'], { cwd: PROJ });

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 400)); } };
const sh = (file, args, input, env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const auto = (prompt, env = {}) => sh('harness-metrics-auto.sh', [], JSON.stringify({ prompt, session_id: SESS, cwd: PROJ }), env);
const agentPayload = (tipo, prompt, desc = '') => JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: tipo, prompt, description: desc }, transcript_path: path.join(HOME, 'x.jsonl') });
const st = (f) => path.join(RUN, f);
const startOf = (f) => Number((fs.readFileSync(st(f), 'utf8').match(/"start":(\d+)/) || [])[1]);
const limpa = () => { for (const f of fs.readdirSync(RUN)) if (f.endsWith('.json')) fs.unlinkSync(st(f)); };

// ---------------------------------------------------------------- T1 metrics-auto
console.log('== T1 harness-metrics-auto: /prd liga _auto-prd-fase1 ==');
let r = auto('<command-message>prd</command-message> <command-name>/prd</command-name> <command-args>--ideia 41</command-args>');
ok('/prd --ideia 41 (slash) liga _auto-prd-fase1', /LIGADO \(_auto-prd-fase1\)/.test(r.stdout) && fs.existsSync(st('_auto-prd-fase1.json')), r.stdout + r.stderr);
const s0 = startOf('_auto-prd-fase1.json');
r = auto('/prd');
ok('reinvocar /prd NAO sobrescreve (JA LIGADO)', /JA LIGADO/.test(r.stdout) && startOf('_auto-prd-fase1.json') === s0, r.stdout);
r = auto('/prd-exec 5');
ok('/prd-exec 5 segue ligando PRD-005-exec (regressao)', fs.existsSync(st('PRD-005-exec.json')), r.stdout);
limpa();
r = auto('<command-name>/prd-status</command-name>');
ok('/prd-status nao liga nada', !fs.existsSync(st('_auto-prd-fase1.json')) && r.stdout.trim() === '', r.stdout);
r = auto('cria a prd da ideia 41, por favor');
ok('texto solto sem slash nao liga nada', !fs.existsSync(st('_auto-prd-fase1.json')), r.stdout);

// ---------------------------------------------------------------- T2 start adota o auto
console.log('== T2 start PRD-NNN-fase1 adota o epoch do _auto-prd-fase1 ==');
fs.writeFileSync(st('_auto-prd-fase1.json'), JSON.stringify({ label: '_auto-prd-fase1', start: 1000 }) + '\n');
r = sh('harness-metrics.sh', ['start', 'PRD-140-fase1']);
ok('start PRD-140-fase1 herda start=1000 e diz que herdou', /herdado do cronometro automatico/.test(r.stdout) && startOf('PRD-140-fase1.json') === 1000, r.stdout);
ok('_auto-prd-fase1.json foi apagado', !fs.existsSync(st('_auto-prd-fase1.json')));
r = sh('harness-metrics.sh', ['start', 'PRD-140-fase2']);
ok('start PRD-140-fase2 sem auto = epoch de agora', startOf('PRD-140-fase2.json') > 1700000000, r.stdout);
limpa();

// ---------------------------------------------------------------- T3 stop herda por familia
console.log('== T3 stop herda marcador automatico por familia ==');
fs.writeFileSync(st('_auto-dt-exec.json'), JSON.stringify({ label: '_auto-dt-exec', start: Math.floor(Date.now() / 1000) - 900 }) + '\n');
r = sh('harness-metrics.sh', ['stop', 'PRD-141-fase1', '--modo=leve']);
ok('fase1 sem start + so _auto-dt-exec => SEM START (nao herda o de exec)', /TELEMETRIA\|sem-start\|PRD-141-fase1/.test(r.stdout), r.stdout.slice(0, 300));
ok('_auto-dt-exec.json continua la para o LOTE', fs.existsSync(st('_auto-dt-exec.json')));
fs.writeFileSync(st('_auto-prd-fase1.json'), JSON.stringify({ label: '_auto-prd-fase1', start: Math.floor(Date.now() / 1000) - 600 }) + '\n');
r = sh('harness-metrics.sh', ['stop', 'PRD-141-fase1', '--modo=leve']);
ok('fase1 sem start + _auto-prd-fase1 => duracao herdada (~10 min)', /Duracao:\*\* (9|10|11|12)min/.test(r.stdout) && !/sem-start/.test(r.stdout), r.stdout.slice(0, 300));
ok('marcador auto de criacao consumido pelo stop', !fs.existsSync(st('_auto-prd-fase1.json')));
fs.writeFileSync(st('_auto-prd-fase1.json'), JSON.stringify({ label: '_auto-prd-fase1', start: Math.floor(Date.now() / 1000) - 600 }) + '\n');
r = sh('harness-metrics.sh', ['stop', 'LOTE-050', '--modo=leve']);
ok('LOTE sem start herda o _auto-dt-exec (~15 min), nao o de criacao', /Duracao:\*\* (1[4-9]|2[0-9])min/.test(r.stdout), r.stdout.slice(0, 300));
ok('_auto-prd-fase1.json preservado para a criacao', fs.existsSync(st('_auto-prd-fase1.json')));
limpa();

// ---------------------------------------------------------------- T4 guard-agent: resgate na criacao
console.log('== T4 guard-agent liga o cronometro no 1o agente da criacao ==');
r = sh('guard-agent.sh', [], agentPayload('peter-quill', 'Discovery: schema de pacotes da PRD-142 ("pacote sob medida"). Leia o Perfil resumido.', 'Discovery PRD-142'));
ok('peter-quill citando PRD-142 sem marcador => PRD-142-fase1.json (exit 0)', r.status === 0 && fs.existsSync(st('PRD-142-fase1.json')), `${r.status} ${r.stderr.slice(0, 200)}`);
const s1 = startOf('PRD-142-fase1.json');
r = sh('guard-agent.sh', [], agentPayload('tony-stark', 'Inovacao PRD-142', 'Inovacao'));
ok('2o agente da mesma PRD nao mexe no marcador', startOf('PRD-142-fase1.json') === s1 && !fs.existsSync(st('PRD-142-fase2.json')));
limpa();
fs.writeFileSync(path.join(PROJ, 'prds', '_metrics', 'runs', 'x.jsonl'), JSON.stringify({ label: 'PRD-143-fase1', ts_start: 1, ts_end: 2 }) + '\n');
r = sh('guard-agent.sh', [], agentPayload('dedalo', 'MODO P (projeto). Projete o front da PRD-143.', 'Projeto de front PRD-143'));
ok('fase1 da PRD-143 ja gravada nos runs => liga PRD-143-fase2', r.status === 0 && fs.existsSync(st('PRD-143-fase2.json')) && !fs.existsSync(st('PRD-143-fase1.json')), `${r.status} ${r.stderr.slice(0, 200)}`);
limpa();
fs.writeFileSync(st('PRD-144-exec.json'), JSON.stringify({ label: 'PRD-144-exec', start: 5 }) + '\n');
r = sh('guard-agent.sh', [], agentPayload('michelangelo', 'Modo A: gate de UX da PRD-144 ciclo 1', 'UX'));
ok('marcador *-exec da PRD presente => nao liga fase', !fs.existsSync(st('PRD-144-fase1.json')) && !fs.existsSync(st('PRD-144-fase2.json')));
limpa();
fs.writeFileSync(st('_auto-dt-exec.json'), JSON.stringify({ label: '_auto-dt-exec', start: 5 }) + '\n');
r = sh('guard-agent.sh', [], agentPayload('atlas', 'Impacto da PRD-145 no lote', 'Impacto'));
ok('_auto-dt-exec presente (contexto de exec) => nao liga fase', !fs.existsSync(st('PRD-145-fase1.json')));
limpa();
r = sh('guard-agent.sh', [], agentPayload('themis', 'Contrato de testes da PRD-146; packet em .claude/.harness-run/packets/TASK-001.packet.md', 'Contrato'));
ok('prompt com .packet.md (exec) => nao liga fase', !fs.existsSync(st('PRD-146-fase1.json')));
r = sh('guard-agent.sh', [], agentPayload('sherlock', 'Revise a PRD-147', 'Review'));
ok('sherlock nao liga fase', !fs.existsSync(st('PRD-147-fase1.json')));
fs.writeFileSync(path.join(PROJ, 'prds', '_metrics', 'runs', 'y.jsonl'), JSON.stringify({ label: 'PRD-149-exec', ts_start: 1, ts_end: 2 }) + '\n');
r = sh('guard-agent.sh', [], agentPayload('dedalo', 'Modo R: corrigir achado do review da PRD-149', 'fix'));
ok('PRD ja executada (runs com PRD-149-exec) => resgate NAO abre fase1', !fs.existsSync(st('PRD-149-fase1.json')) && !fs.existsSync(st('PRD-149-fase2.json')));
fs.writeFileSync(st('PRD-150-exec-fix.json'), JSON.stringify({ label: 'PRD-150-exec-fix', start: 5 }) + '\n');
r = sh('guard-agent.sh', [], agentPayload('hermes', 'Review PRD-150 ciclo 2', 'review'));
ok('marcador PRD-150-exec-fix presente => nao liga fase', !fs.existsSync(st('PRD-150-fase1.json')));
limpa();
r = sh('guard-agent.sh', [], agentPayload('peter-quill', 'Discovery PRD-148', 'Discovery'), { HARNESS_METRICS_AUTO: '0' });
ok('HARNESS_METRICS_AUTO=0 desliga o resgate', !fs.existsSync(st('PRD-148-fase1.json')));
limpa();

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
