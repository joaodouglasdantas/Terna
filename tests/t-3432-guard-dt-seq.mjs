#!/usr/bin/env node
// tests/t-3432-guard-dt-seq.mjs — bateria da 3.4.32 (guard-dt: numero do DT novo tem que estar RESERVADO).
// Roda em SANDBOX proprio (repo git falso com worktree em os.tmpdir()), nunca toca o projeto real.
//   node tests/t-3432-guard-dt-seq.mjs
//
// O que prova (mecanico):
//   T1 projeto SEM reservas (sem .git/harness-locks/seq): DT novo com PROVA+Duplicata passa (retrocompat).
//   T2 apos `harness-worktree.sh reservar DT` no checkout principal: DT com o numero reservado passa;
//      numero nao reservado => deny citando a ultima reserva e o comando; numero reservado por OUTRO
//      checkout (worktree) => deny citando o dono.
//   T3 HARNESS_GUARD_DT_SEQ=0 desliga o gate (volta a exigir so PROVA+Duplicata).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3432-dtseq-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\nHARNESS_DT_WIP_MAX='999'\n`);
fs.mkdirSync(path.join(PROJ, 'prds', 'debito_tecnico'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'prds', 'debito_tecnico', 'INDEX.md'), '# DTs\n\n| DT-001 | x |\n');
fs.writeFileSync(path.join(PROJ, 'prds', 'debito_tecnico', 'DT-001-existente.md'), '# DT-001\n');
const git = (args, cwd = PROJ) => spawnSync('git', args, { cwd, encoding: 'utf8', env: ENVB });
git(['init', '-q']); git(['config', 'user.email', 't@t']); git(['config', 'user.name', 't']);
git(['add', '.']); git(['commit', '-q', '-m', 'base']);

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 300)); } };
const sh = (file, args, input, env = {}, cwd = PROJ) => spawnSync('bash', [path.join(cwd, '.claude', 'hooks', file), ...args], { input, encoding: 'utf8', cwd, env: { ...ENVB, ...env } });
const corpo = '# DT-X\n\n**Balde:** lote\n**Duplicata:** nenhuma (INDEX verificado em 2026-09-10)\n\n## Prova\n\n`administrativo/api/x.php:12` faz errado.\n\n| Arquivo | Acao |\n|---|---|\n| `administrativo/api/x.php` | Modificar |\n';
const payload = (n, cwd = PROJ) => JSON.stringify({ session_id: 's', cwd, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(cwd, 'prds', 'debito_tecnico', `DT-${String(n).padStart(3, '0')}-novo.md`), content: corpo } });

console.log('== T1 sem reservas (retrocompat) ==');
let r = sh('guard-dt.sh', [], payload(2));
ok('projeto sem seq/: DT-002 com prova+duplicata passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);

console.log('== T2 com reservas ==');
let res = sh('harness-worktree.sh', ['reservar', 'DT'], '');
const n1 = Number((res.stdout.match(/SEQ\|DT\|(\d+)/) || [])[1]);
ok('reservar DT devolve SEQ|DT|2 (max INDEX/disco = 1)', n1 === 2, res.stdout + res.stderr);
r = sh('guard-dt.sh', [], payload(n1));
ok(`DT-${n1} reservado por este checkout => passa`, r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-dt.sh', [], payload(n1 + 5));
ok('numero NAO reservado => deny citando reservar DT e a ultima reserva', r.status === 2 && r.stderr.includes('NAO esta reservado') && r.stderr.includes(`DT-${n1}`) && r.stderr.includes('reservar DT'), `${r.status} ${r.stderr.slice(0, 250)}`);
// outro checkout: reserva feita por uma worktree
const gitCommon = git(['rev-parse', '--git-common-dir']).stdout.trim();
const seqd = path.isAbsolute(gitCommon) ? path.join(gitCommon, 'harness-locks', 'seq') : path.join(PROJ, gitCommon, 'harness-locks', 'seq');
fs.mkdirSync(path.join(seqd, `DT-${n1 + 1}`), { recursive: true });
fs.writeFileSync(path.join(seqd, `DT-${n1 + 1}`, 'dono'), 'proj--wt-outra|2026-09-10T00:00:00|t@x\n');
r = sh('guard-dt.sh', [], payload(n1 + 1));
ok('numero reservado por OUTRO checkout => deny citando o dono', r.status === 2 && r.stderr.includes('RESERVADO por') && r.stderr.includes('proj--wt-outra'), `${r.status} ${r.stderr.slice(0, 250)}`);
r = sh('guard-dt.sh', [], JSON.stringify({ cwd: PROJ, tool_name: 'Write', tool_input: { file_path: path.join(PROJ, 'prds', 'debito_tecnico', 'DT-001-existente.md'), content: 'x' } }));
ok('editar DT existente segue livre', r.status === 0, `${r.status} ${r.stderr.slice(0, 120)}`);

console.log('== T3 knob ==');
r = sh('guard-dt.sh', [], payload(n1 + 9), { HARNESS_GUARD_DT_SEQ: '0' });
ok('HARNESS_GUARD_DT_SEQ=0 desliga o gate de numero', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
