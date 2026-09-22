#!/usr/bin/env node
// tests/t-3434-tetos-prd141.mjs — bateria da 3.4.34 (seis tetos aprendidos na PRD-141).
// Roda em SANDBOX proprio (repo git falso em os.tmpdir()), nunca toca o projeto real.
//   node tests/t-3434-tetos-prd141.mjs
//
// O que prova (mecanico):
//   T6 guard-folego: teto do michelangelo = 90.
//   T1 prd-validacao-check: PRD com 10 tasks => falta "tasks > teto 9"; com 9 => ok. guard-agent: despacho de hefesto
//      para PRD com 10 tasks => deny; marcador PRD-NNN.tasks-ok => passa.
//   T2 guard-agent: task GRANDE pelo --check (5 alvos de producao) => deny; marcador packets/TASK.grande-ok => passa;
//      HARNESS_TASK_GRANDE=permitir => passa.
//   T4 guard-agent: PRD com front E back, prompt "onda 2" sem review/PRD.costura-onda-1.md => deny; com o arquivo => passa;
//      PRD so back => passa sem costura.
//   T3 harness-metrics stop PRD-NNN-exec: task GATE cujo spec nao existe => exit 3 + TELEMETRIA|gate|ausente e o marcador
//      de start FICA; spec em disco + telemetria da task => fecha; --gate-ok="motivo" fecha e grava no extra.
//   T5 prd-validacao-check: tasks tocam api/ e a tecnica nao tem Contrato de API => falta; com contrato + Consumidores (ARQUIVOS) => ok.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3434-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const RUN = path.join(PROJ, '.claude', '.harness-run');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };
const SESS = 'sess-3434';

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude', 'agents'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'contratos'), path.join(PROJ, '.claude', 'contratos'), { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\nHARNESS_METRICS_AUTO='0'\nHARNESS_GUARD_PRD_PACKET='0'\n`);
fs.writeFileSync(path.join(PROJ, '.claude', 'PERFIL-RESUMO.md'), '# Resumo\n\nprojeto de teste.\n');
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'tasks'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'runs'), { recursive: true });
fs.mkdirSync(RUN, { recursive: true });
// 3.5.4: o guard-agent exige esforco.env (fase=executar) desta decolagem antes do 1o executor — precondicao da exec
fs.writeFileSync(path.join(RUN, 'esforco.env'), `fase=executar\nalvo=medium\natual=medium\nts=${Math.floor(Date.now() / 1000)}\n`);
fs.mkdirSync(path.join(PROJ, 'api'), { recursive: true }); fs.mkdirSync(path.join(PROJ, 'assets'), { recursive: true }); fs.mkdirSync(path.join(PROJ, 'tests', 'e2e'), { recursive: true });
for (let i = 1; i <= 6; i++) fs.writeFileSync(path.join(PROJ, 'api', `a${i}.php`), '<?php\nfunction f' + i + '() { return 1; }\n');
fs.writeFileSync(path.join(PROJ, 'assets', 'x.js'), 'function x() {}\n');
spawnSync('git', ['init', '-q'], { cwd: PROJ });

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 400)); } };
const sh = (file, args, input, env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const agentPayload = (tipo, prompt, desc = '') => JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: tipo, prompt, description: desc }, transcript_path: path.join(HOME, 'x.jsonl') });
const mkPrd = (n, ntasks, opts = {}) => {
  const D = path.join(PROJ, 'prds', `PRD-${n}-teste`); fs.rmSync(D, { recursive: true, force: true });
  fs.mkdirSync(path.join(D, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(D, `PRD-${n}-teste.md`), `# PRD-${n}: teste\n\n## Requisitos Funcionais\n\n### RF-01: Um\n\nx\n`);
  fs.writeFileSync(path.join(D, `PRD-TECNICA-${n}-teste.md`), opts.tecnica || TEC_OK);
  for (let i = 1; i <= ntasks; i++) {
    const tipo = (opts.front && i === 1) ? 'front' : 'backend';
    const alvos = (opts.grande && i === 2) ? ['api/a1.php', 'api/a2.php', 'api/a3.php', 'api/a4.php', 'api/a5.php'] : ['api/a1.php'];
    const gate = (opts.gate && i === ntasks) ? ' — Acceptance Testing (Playwright) — GATE BLOQUEANTE' : '';
    fs.writeFileSync(path.join(D, 'tasks', `TASK-${String(i).padStart(3, '0')}-t${i}.md`),
      `# TASK-${String(i).padStart(3, '0')}: task ${i}${gate}\n\n## Metadados\n\n| **Tipo** | ${tipo} |\n| **Duelo** | nao |\n\n## Objetivo\n\nFazer ${i}.${gate ? ' Spec: `tests/e2e/PRD-' + n + '-acceptance.spec.js`' : ''}\n\n## Arquivo(s) Afetado(s)\n\n${alvos.map(a => '- `' + a + '`').join('\n')}\n\n## Critérios de Aceite\n\n- [ ] ok\n`);
  }
  return D;
};
const TEC_OK = '# tecnica\n\n## Contrato de API\n\n### Endpoint: POST api/a1.php\n\n| **Consumidores (ARQUIVOS)** | `assets/x.js` |\n';
const packet = (n, t) => sh('task-packet.sh', [`prds/PRD-${n}-teste/tasks/TASK-${t}-t${Number(t)}.md`]);
const VAL_OK = (n, ntasks, extraS5 = '- nenhuma') => ['# PRD — Leitura de validação', '', '## 1. O pedido, como entrou', '', '- Origem: x', '', '## 2. O fluxo, como ficou', '', '1. passo', '',
  '## 3. Requisitos funcionais — de onde veio cada um', '', '| RF | Em uma linha | Origem | Tasks |', '|---|---|---|---|',
  `| RF-01 | um | pedido | ${Array.from({ length: ntasks }, (_, i) => 'TASK-' + String(i + 1).padStart(3, '0')).join(', ')} |`, '',
  '## 4. Agregado no caminho (não estava no pedido)', '', 'nada', '', '## 5. Fora / adiado', '', extraS5, '', '## 6. Confira antes de aprovar', '', '- [ ] ok', ''].join('\n');

console.log('== T6 michelangelo 90 ==');
const teto = spawnSync(process.execPath, ['-e', "import('./guard-folego.mjs').then(m=>import('./presence.mjs').then(p=>console.log(m.tetoDoPapel('michelangelo', p.makeCtx(process.argv[1]).ENV), m.tetoDoPapel('beholder', p.makeCtx(process.argv[1]).ENV))))", PROJ], { cwd: HOOKS, encoding: 'utf8', env: ENVB });
ok('teto michelangelo=90, beholder segue 60', teto.stdout.trim() === '90 60', teto.stdout + teto.stderr);

console.log('== T1 teto de tasks (9) ==');
let D = mkPrd('050', 10); fs.writeFileSync(path.join(D, 'VALIDACAO.md'), VAL_OK('050', 10));
let r = sh('prd-validacao-check.sh', ['--label', 'PRD-050']);
ok('validacao: 10 tasks => falta "tasks > teto 9"', r.status === 1 && /10 tasks > teto 9/.test(r.stdout), r.stdout);
D = mkPrd('051', 9); fs.writeFileSync(path.join(D, 'VALIDACAO.md'), VAL_OK('051', 9));
r = sh('prd-validacao-check.sh', ['--label', 'PRD-051']);
ok('validacao: 9 tasks => ok', r.status === 0 && /\|ok\|/.test(r.stdout), r.stdout);
mkPrd('050', 10); packet('050', '001');
fs.writeFileSync(path.join(RUN, 'PRD-050-exec.json'), '{"label":"PRD-050-exec","start":1}\n');
r = sh('guard-agent.sh', [], agentPayload('hefesto', 'Execute a TASK-001 da PRD-050; packet em .claude/.harness-run/packets/TASK-001.packet.md'));
ok('guard-agent: PRD com 10 tasks => deny citando fatiar', r.status === 2 && /acima do teto de 9/.test(r.stderr) && /FATIAR/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 200)}`);
fs.writeFileSync(path.join(RUN, 'PRD-050.tasks-ok'), '');
r = sh('guard-agent.sh', [], agentPayload('hefesto', 'Execute a TASK-001 da PRD-050; packet em .claude/.harness-run/packets/TASK-001.packet.md'));
ok('marcador PRD-050.tasks-ok => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);

console.log('== T2 task GRANDE ==');
mkPrd('052', 3, { grande: true }); packet('052', '002'); fs.writeFileSync(path.join(RUN, 'PRD-052-exec.json'), '{"label":"PRD-052-exec","start":1}\n');
r = sh('guard-agent.sh', [], agentPayload('hefesto', 'Execute a TASK-002 da PRD-052; packet em .claude/.harness-run/packets/TASK-002.packet.md'));
ok('task com 5 alvos (GRANDE) => deny citando fatiar', r.status === 2 && /GRANDE/.test(r.stderr) && /fatie/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 250)}`);
fs.writeFileSync(path.join(RUN, 'packets', 'TASK-002.grande-ok'), '');
r = sh('guard-agent.sh', [], agentPayload('hefesto', 'Execute a TASK-002 da PRD-052; packet em .claude/.harness-run/packets/TASK-002.packet.md'));
ok('marcador grande-ok => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
fs.unlinkSync(path.join(RUN, 'packets', 'TASK-002.grande-ok'));
r = sh('guard-agent.sh', [], agentPayload('hefesto', 'Execute a TASK-002 da PRD-052; packet em .claude/.harness-run/packets/TASK-002.packet.md'), { HARNESS_TASK_GRANDE: 'permitir' });
ok('HARNESS_TASK_GRANDE=permitir => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
packet('052', '001');
r = sh('guard-agent.sh', [], agentPayload('hefesto', 'Execute a TASK-001 da PRD-052; packet em .claude/.harness-run/packets/TASK-001.packet.md'));
ok('task pequena da mesma PRD => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);

console.log('== T4 costura por onda ==');
mkPrd('053', 3, { front: true }); packet('053', '002'); fs.writeFileSync(path.join(RUN, 'PRD-053-exec.json'), '{"label":"PRD-053-exec","start":1}\n');
r = sh('guard-agent.sh', [], agentPayload('hefesto', 'Onda 2: execute a TASK-002 da PRD-053; packet em .claude/.harness-run/packets/TASK-002.packet.md'));
ok('front+back, onda 2 sem costura da onda 1 => deny', r.status === 2 && /COSTURA da onda 1/.test(r.stderr) && /Lente: costura/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 250)}`);
fs.mkdirSync(path.join(RUN, 'review'), { recursive: true }); fs.writeFileSync(path.join(RUN, 'review', 'PRD-053.costura-onda-1.md'), '# costura onda 1\n\n0 bloqueantes\n');
r = sh('guard-agent.sh', [], agentPayload('hefesto', 'Onda 2: execute a TASK-002 da PRD-053; packet em .claude/.harness-run/packets/TASK-002.packet.md'));
ok('com review/PRD-053.costura-onda-1.md => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-agent.sh', [], agentPayload('hefesto', 'Onda 1: execute a TASK-002 da PRD-053; packet em .claude/.harness-run/packets/TASK-002.packet.md'));
ok('onda 1 nunca exige costura', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
mkPrd('054', 3); packet('054', '002'); fs.writeFileSync(path.join(RUN, 'PRD-054-exec.json'), '{"label":"PRD-054-exec","start":1}\n');
r = sh('guard-agent.sh', [], agentPayload('hefesto', 'Onda 2: execute a TASK-002 da PRD-054; packet em .claude/.harness-run/packets/TASK-002.packet.md'));
ok('PRD so back => onda 2 passa sem costura', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);

console.log('== T3 gate de acceptance no stop ==');
mkPrd('055', 3, { gate: true });
sh('harness-metrics.sh', ['start', 'PRD-055-exec']);
r = sh('harness-metrics.sh', ['stop', 'PRD-055-exec', '--modo=leve']);
ok('spec do GATE ausente => exit 3 + TELEMETRIA|gate|ausente', r.status === 3 && /TELEMETRIA\|gate\|ausente\|PRD-055-exec/.test(r.stdout) && /spec-ausente/.test(r.stdout), `${r.status} ${r.stdout.slice(0, 300)} ${r.stderr.slice(0, 200)}`);
ok('marcador de start FICA (exec nao fechou)', fs.existsSync(path.join(RUN, 'PRD-055-exec.json')));
fs.writeFileSync(path.join(PROJ, 'tests', 'e2e', 'PRD-055-acceptance.spec.js'), '// spec\n');
r = sh('harness-metrics.sh', ['stop', 'PRD-055-exec', '--modo=leve']);
ok('spec existe mas sem execucao na telemetria => ainda nao fecha', r.status === 3 && /sem-execucao-na-telemetria/.test(r.stdout), `${r.status} ${r.stdout.slice(0, 300)}`);
fs.writeFileSync(path.join(PROJ, 'prds', '_metrics', 'tasks', 'x.jsonl'), JSON.stringify({ ts: 1, papel: 'hefesto', rotulo: 'TASK-003', status: '✅', turnos: 10 }) + '\n');
r = sh('harness-metrics.sh', ['stop', 'PRD-055-exec', '--modo=leve']);
ok('spec + telemetria da task GATE => fecha (Telemetria impressa)', r.status === 0 && /## Telemetria/.test(r.stdout) && !fs.existsSync(path.join(RUN, 'PRD-055-exec.json')), `${r.status} ${r.stdout.slice(0, 200)}`);
mkPrd('056', 2, { gate: true }); sh('harness-metrics.sh', ['start', 'PRD-056-exec']);
r = sh('harness-metrics.sh', ['stop', 'PRD-056-exec', '--modo=leve', '--gate-ok=decisao do Charles: gate roda amanha']);
const runsTxt = fs.readdirSync(path.join(PROJ, 'prds', '_metrics', 'runs')).map(f => fs.readFileSync(path.join(PROJ, 'prds', '_metrics', 'runs', f), 'utf8')).join('\n');
ok('--gate-ok fecha e grava a decisao no extra', r.status === 0 && /gate: fechado sem prova por decisao humana — decisao do Charles/.test(runsTxt), `${r.status} ${r.stdout.slice(0, 200)} ${runsTxt.slice(-200)}`);
sh('harness-metrics.sh', ['start', 'PRD-056-exec']);
r = sh('harness-metrics.sh', ['stop', 'PRD-056-exec', '--modo=leve'], '', { HARNESS_GATE_ACCEPTANCE: 'off' });
ok('HARNESS_GATE_ACCEPTANCE=off desliga', r.status === 0, `${r.status} ${r.stdout.slice(0, 200)}`);

console.log('== T5 contrato de API na tecnica ==');
D = mkPrd('057', 2, { tecnica: '# tecnica\n' }); fs.writeFileSync(path.join(D, 'VALIDACAO.md'), VAL_OK('057', 2));
r = sh('prd-validacao-check.sh', ['--label', 'PRD-057']);
ok('tasks tocam api/ e tecnica sem Contrato de API => falta', r.status === 1 && /Contrato de API/.test(r.stdout), r.stdout);
D = mkPrd('057', 2, { tecnica: '# tecnica\n\n## Contrato de API\n\n### Endpoint: POST api/a1.php\n\n| **Consumidores (ARQUIVOS)** | `assets/x.js` |\n' }); fs.writeFileSync(path.join(D, 'VALIDACAO.md'), VAL_OK('057', 2));
r = sh('prd-validacao-check.sh', ['--label', 'PRD-057']);
ok('tecnica com Contrato de API + Consumidores (ARQUIVOS) => ok', r.status === 0 && /\|ok\|/.test(r.stdout), r.stdout);

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
