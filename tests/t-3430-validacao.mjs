#!/usr/bin/env node
// tests/t-3430-validacao.mjs — bateria da 3.4.30 (leitura de validacao da PRD: VALIDACAO.md + check).
// Roda em SANDBOX proprio (projeto falso em os.tmpdir()), nunca toca o projeto real.
//   node tests/t-3430-validacao.mjs
//
// O que prova (mecanico):
//   T1 prd-validacao-check.sh: VALIDACAO.md completo => ok com contagens rf/tasks/dts/fatias;
//      ausente => |ausente| exit 1; RF sem linha, origem invalida/vazia, task nao citada, DT ausente,
//      fatia fora da secao 5, secao faltando => |falta|<motivos> exit 1; --dir explicito funciona.
//   T2 harness-metrics.sh stop PRD-NNN-fase2 imprime o alerta quando o VALIDACAO.md falta e a linha
//      VALIDACAO|...|ok quando existe; stop de *-exec nao confere.
//   T3 skill /prd: Passo 10.9 presente, Passo 11 aponta o VALIDACAO; template existe.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3430-val-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\n`);
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'runs'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'tasks'), { recursive: true });
fs.mkdirSync(path.join(PROJ, '.claude', '.harness-run'), { recursive: true });
spawnSync('git', ['init', '-q'], { cwd: PROJ });

const D = path.join(PROJ, 'prds', 'PRD-050-teste');
fs.mkdirSync(path.join(D, 'tasks'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'prds', 'PRD-050-b-fatia'), { recursive: true });
fs.writeFileSync(path.join(D, 'PRD-050-teste.md'), `# PRD-050: teste\n\n## Requisitos Funcionais\n\n### RF-01: Um\n\nx\n\n### RF-02: Dois\n\nabsorve DT-010 e DT-011.\n\n### RF-03: Tres\n\n## Critérios de Aceite\n`);
fs.writeFileSync(path.join(D, 'PRD-TECNICA-050-teste.md'), '# tecnica\n');
fs.writeFileSync(path.join(D, 'tasks', 'TASK-001-a.md'), '# TASK-001\n');
fs.writeFileSync(path.join(D, 'tasks', 'TASK-002-b.md'), '# TASK-002\n');
const VAL = path.join(D, 'VALIDACAO.md');
const completo = () => [
  '# PRD-050 — Leitura de validação', '',
  '## 1. O pedido, como entrou', '', '- Origem: IDEIA-001', '',
  '## 2. O fluxo, como ficou', '', '1. passo', '',
  '## 3. Requisitos funcionais — de onde veio cada um', '',
  '| RF | Em uma linha | Origem | Tasks |', '|---|---|---|---|',
  '| RF-01 | um | pedido | TASK-001 |',
  '| RF-02 | dois | DT-010, DT-011 | TASK-002 |',
  '| RF-03 | tres | inovacao, gate | TASK-001 |', '',
  '## 4. Agregado no caminho (não estava no pedido)', '', '| Item | Tipo | Por quê | Custo |', '|---|---|---|---|', '| DT-010 | dt-absorvido | caminho direto | TASK-002 |', '',
  '## 5. Fora / adiado', '', '- Fatia: PRD-050-b — o resto', '',
  '## 6. Confira antes de aprovar', '', '- [ ] ok?', '',
].join('\n');

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 400)); } };
const sh = (file, args, env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const chk = () => sh('prd-validacao-check.sh', ['--label', 'PRD-050']);

console.log('== T1 prd-validacao-check ==');
let r = chk();
ok('VALIDACAO.md ausente => |ausente| exit 1', r.status === 1 && /^VALIDACAO\|PRD-050\|ausente\|/.test(r.stdout), r.stdout + r.stderr);
fs.writeFileSync(VAL, completo());
r = chk();
ok('completo => ok rf=3/3 tasks=2/2 dts=2/2 fatias=1/1', r.status === 0 && r.stdout.trim() === 'VALIDACAO|PRD-050|ok|rf=3/3|tasks=2/2|dts=2/2|fatias=1/1', r.stdout + r.stderr);
r = sh('prd-validacao-check.sh', ['PRD-050', '--dir', 'prds/PRD-050-teste']);
ok('--dir explicito (relativo) funciona', r.status === 0 && /\|ok\|/.test(r.stdout), r.stdout);
fs.writeFileSync(VAL, completo().replace('| RF-03 | tres | inovacao, gate | TASK-001 |\n', ''));
r = chk();
ok('RF-03 sem linha => falta', r.status === 1 && /\|falta\|.*RF-03 sem linha na secao 3/.test(r.stdout), r.stdout);
fs.writeFileSync(VAL, completo().replace('| RF-01 | um | pedido |', '| RF-01 | um | achei bonito |'));
r = chk();
ok('origem invalida => falta', r.status === 1 && /RF-01 origem 'acheibonito' fora de/.test(r.stdout), r.stdout);
fs.writeFileSync(VAL, completo().replace('| RF-01 | um | pedido |', '| RF-01 | um | |'));
r = chk();
ok('origem vazia => falta', r.status === 1 && /RF-01 sem origem/.test(r.stdout), r.stdout);
fs.writeFileSync(VAL, completo().replace('| RF-02 | dois | DT-010, DT-011 | TASK-002 |', '| RF-02 | dois | DT-010, DT-011 | TASK-001 |'));
r = chk();
ok('TASK-002 nao citada => falta', r.status === 1 && /TASK-002 nao aparece na secao 3/.test(r.stdout), r.stdout);
fs.writeFileSync(VAL, completo().replace('DT-010, DT-011', 'DT-010').replace('| DT-010 | dt-absorvido', '| DT-010 | dt-absorvido'));
r = chk();
ok('DT-011 citado na PRD e ausente => falta', r.status === 1 && /DT-011 citado na PRD e ausente/.test(r.stdout), r.stdout);
fs.writeFileSync(VAL, completo().replace('- Fatia: PRD-050-b — o resto', '- nenhuma'));
r = chk();
ok('fatia PRD-050-b existente e fora da secao 5 => falta', r.status === 1 && /fatia PRD-050-b existe/.test(r.stdout), r.stdout);
fs.writeFileSync(VAL, completo().replace('## 6. Confira antes de aprovar', '## Confira'));
r = chk();
ok('secao 6 ausente => falta', r.status === 1 && /secao 6 ausente/.test(r.stdout), r.stdout);

console.log('== T2 harness-metrics stop fase2 confere o VALIDACAO ==');
fs.unlinkSync(VAL);
sh('harness-metrics.sh', ['start', 'PRD-050-fase2']);
r = sh('harness-metrics.sh', ['stop', 'PRD-050-fase2', '--modo=leve']);
ok('stop fase2 sem VALIDACAO => alerta + TELEMETRIA|validacao|ausente', /VALIDACAO\|PRD-050\|ausente/.test(r.stdout) && /TELEMETRIA\|validacao\|ausente\|PRD-050/.test(r.stdout), r.stdout.slice(-500));
fs.writeFileSync(VAL, completo());
sh('harness-metrics.sh', ['start', 'PRD-050-fase2']);
r = sh('harness-metrics.sh', ['stop', 'PRD-050-fase2', '--modo=leve']);
ok('stop fase2 com VALIDACAO ok => linha VALIDACAO|...|ok no bloco', /VALIDACAO\|PRD-050\|ok\|rf=3\/3/.test(r.stdout) && !/TELEMETRIA\|validacao/.test(r.stdout), r.stdout.slice(-500));
sh('harness-metrics.sh', ['start', 'PRD-050-exec']);
r = sh('harness-metrics.sh', ['stop', 'PRD-050-exec', '--modo=leve']);
ok('stop *-exec nao confere VALIDACAO', !/VALIDACAO\|/.test(r.stdout), r.stdout.slice(-300));

console.log('== T3 skill e template ==');
const skill = fs.readFileSync(path.join(MASTER, '.claude', 'skills', 'prd', 'SKILL.md'), 'utf8');
ok('skill /prd tem o Passo 10.9 (VALIDACAO.md)', /#### 10\.9 — Leitura de valida/.test(skill) && skill.includes('prd-validacao-check.sh --label PRD-NNN'));
ok('Passo 11 pede o aceite pelo VALIDACAO.md', /Passo 11[\s\S]{0,1500}VALIDACAO\.md/.test(skill));
ok('template TEMPLATE-VALIDACAO.md existe com as 6 secoes', ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.'].every((h) => fs.readFileSync(path.join(MASTER, 'prds', '_templates', 'TEMPLATE-VALIDACAO.md'), 'utf8').includes(h)));

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
