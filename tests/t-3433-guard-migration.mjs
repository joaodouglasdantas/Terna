#!/usr/bin/env node
// tests/t-3433-guard-migration.mjs — bateria da 3.4.33 (reserva atomica de migrations + guard-migration).
// Roda em SANDBOX proprio (repo git falso em os.tmpdir()), nunca toca o projeto real.
//   node tests/t-3433-guard-migration.mjs
//
// O que prova (mecanico):
//   T1 `harness-worktree.sh reservar MIG` devolve SEQ|MIG|0003 (piso = arquivos 0001_/0002_ na pasta migrations,
//      largura 4 preservada); segunda reserva devolve 0004; HARNESS_MIGRATIONS_DIR relativo tambem funciona.
//   T2 guard-migration: projeto sem seq/ passa; com seq/: numero reservado por este checkout passa; nao reservado
//      => deny citando reservar MIG; reservado por OUTRO checkout => deny citando o dono; editar migration existente
//      passa; arquivo fora de migrations/ passa (fast-path); HARNESS_GUARD_MIG_SEQ=0 desliga.
//   T3 settings.json do mestre registra guard-migration.sh no grupo Write.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3433-mig-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };
const MIG = path.join(PROJ, 'api', 'database', 'migrations');

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\n`);
fs.mkdirSync(MIG, { recursive: true });
fs.writeFileSync(path.join(MIG, '0001_base.php'), '<?php\n'); fs.writeFileSync(path.join(MIG, '0002_x.php'), '<?php\n'); fs.writeFileSync(path.join(MIG, '_TEMPLATE.php'), '<?php\n');
const git = (args, cwd = PROJ) => spawnSync('git', args, { cwd, encoding: 'utf8', env: ENVB });
git(['init', '-q']); git(['config', 'user.email', 't@t']); git(['config', 'user.name', 't']); git(['add', '.']); git(['commit', '-q', '-m', 'base']);

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 300)); } };
const sh = (file, args, input, env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const payload = (fp) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: fp, content: '<?php\n' } });
const mig = (n, slug = 'nova') => path.join(MIG, `${String(n).padStart(4, '0')}_${slug}.php`);

console.log('== T2a sem reservas ==');
let r = sh('guard-migration.sh', [], payload(mig(3)));
ok('projeto sem seq/: migration 0003 nova passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);

console.log('== T1 reservar MIG ==');
r = sh('harness-worktree.sh', ['reservar', 'MIG'], '');
ok('reservar MIG => SEQ|MIG|0003 (piso 0002, largura 4)', /^SEQ\|MIG\|0003$/m.test(r.stdout), r.stdout + r.stderr);
r = sh('harness-worktree.sh', ['reservar', 'MIG'], '');
ok('segunda reserva => 0004', /^SEQ\|MIG\|0004$/m.test(r.stdout), r.stdout + r.stderr);
r = sh('harness-worktree.sh', ['reservar', 'MIG'], '', { HARNESS_MIGRATIONS_DIR: 'api/database/migrations' });
ok('HARNESS_MIGRATIONS_DIR relativo => 0005', /^SEQ\|MIG\|0005$/m.test(r.stdout), r.stdout + r.stderr);

console.log('== T2b com reservas ==');
r = sh('guard-migration.sh', [], payload(mig(3)));
ok('0003 reservada por este checkout => passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-migration.sh', [], payload(mig(9)));
ok('0009 nao reservada => deny citando reservar MIG e a ultima reserva (5)', r.status === 2 && r.stderr.includes('NAO esta reservada') && r.stderr.includes('reservar MIG') && r.stderr.includes('ultima reserva: 5'), `${r.status} ${r.stderr.slice(0, 260)}`);
const gitCommon = git(['rev-parse', '--git-common-dir']).stdout.trim();
const seqd = path.isAbsolute(gitCommon) ? path.join(gitCommon, 'harness-locks', 'seq') : path.join(PROJ, gitCommon, 'harness-locks', 'seq');
fs.mkdirSync(path.join(seqd, 'MIG-6'), { recursive: true });
fs.writeFileSync(path.join(seqd, 'MIG-6', 'dono'), 'proj--wt-outra|2026-09-10T00:00:00|t@x\n');
r = sh('guard-migration.sh', [], payload(mig(6)));
ok('0006 reservada por OUTRO checkout => deny citando o dono', r.status === 2 && r.stderr.includes('RESERVADA por') && r.stderr.includes('proj--wt-outra'), `${r.status} ${r.stderr.slice(0, 260)}`);
r = sh('guard-migration.sh', [], payload(path.join(MIG, '0001_base.php')));
ok('editar migration existente passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 120)}`);
r = sh('guard-migration.sh', [], payload(path.join(PROJ, 'api', 'x', '0009_nao_e_migration.php')));
ok('arquivo fora de migrations/ passa (fast-path)', r.status === 0, `${r.status} ${r.stderr.slice(0, 120)}`);
r = sh('guard-migration.sh', [], payload(mig(9)), { HARNESS_GUARD_MIG_SEQ: '0' });
ok('HARNESS_GUARD_MIG_SEQ=0 desliga', r.status === 0, `${r.status} ${r.stderr.slice(0, 120)}`);

console.log('== T3 registro no settings ==');
const st = JSON.parse(fs.readFileSync(path.join(MASTER, '.claude', 'settings.json'), 'utf8'));
ok('settings.json: guard-migration.sh no grupo Write', st.hooks.PreToolUse.some(g => g.matcher === 'Write' && g.hooks.some(h => /guard-migration\.sh/.test(h.command))));

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
