#!/usr/bin/env node
// tests/t-350-seq-faixas.mjs — bateria da 3.5.0 (faixas de numeracao por dev + migrations por timestamp).
// Roda em SANDBOX proprio (repo git falso em os.tmpdir()), nunca toca o projeto real.
//   node tests/t-350-seq-faixas.mjs
//
// O que prova (mecanico):
//   T1 reservar PRD/DT/LOTE com e-mail de dev do bloco 1 => 1001/10001/1001 (piso = faixa, nao a serie legada);
//      bloco 0 (charles) => 142/581 (continua a serie legada); dev fora da tabela => bloco 0 + AVISO em stderr;
//      HARNESS_SEQ_FAIXAS=off => serie unica (max de tudo + 1); tabela custom (env.local) => bloco declarado;
//      faixa esgotada => die com a mensagem certa; `faixa` imprime FAIXA|serie|chave|bloco=k|ini-fim|proximo=n.
//   T2 MIG: modo seq => SEQ|MIG|0003 (inalterado); modo timestamp => 14 digitos; guard-migration em timestamp:
//      reservado passa, NNNN_ novo nega, timestamp nao reservado nega, fora da janela nega; modo seq com nome
//      de 14 digitos nega ("cara de timestamp").
//   T3 rotulos de 4 digitos: harness-metrics.sh start PRD-1001-exec liga o cronometro; prd-validacao-check
//      preserva PRD-1001 (antes virava PRD-100).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-350-seq-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };
const MIG = path.join(PROJ, 'api', 'database', 'migrations');
const LOCAL = path.join(PROJ, '.claude', 'harness.env.local');
const BASE_LOCAL = `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\nHARNESS_METRICS_AUTO='0'\n`;
const setLocal = (extra = '') => fs.writeFileSync(LOCAL, BASE_LOCAL + extra);

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
setLocal();
fs.mkdirSync(path.join(PROJ, 'prds', 'PRD-141-x'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'prds', 'INDEX.md'), '| ID | T |\n|---|---|\n| PRD-141 | x |\n');
fs.mkdirSync(path.join(PROJ, 'prds', 'debito_tecnico', 'lotes'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'prds', 'debito_tecnico', 'INDEX.md'), '| ID |\n|---|\n| DT-580 |\n');
fs.writeFileSync(path.join(PROJ, 'prds', 'debito_tecnico', 'lotes', 'LOTE-039-x.md'), '# x\n');
fs.mkdirSync(MIG, { recursive: true });
fs.writeFileSync(path.join(MIG, '0001_base.php'), '<?php\n'); fs.writeFileSync(path.join(MIG, '0002_x.php'), '<?php\n');
const git = (args, cwd = PROJ) => spawnSync('git', args, { cwd, encoding: 'utf8', env: ENVB });
git(['init', '-q']); git(['config', 'user.email', 'derickjesiel96@gmail.com']); git(['config', 'user.name', 't']); git(['add', '.']); git(['commit', '-q', '-m', 'base']);

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 300)); } };
const sh = (file, args, input = '', env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const seq = (serie, env = {}) => { const r = sh('harness-worktree.sh', ['reservar', serie], '', env); return { n: (r.stdout.match(new RegExp('^SEQ\\|' + serie + '\\|(\\S+)$', 'm')) || [])[1], r }; };

console.log('== T1 faixas por dev ==');
let x = seq('PRD'); ok('derick (bloco 1): 1a PRD => 1001', x.n === '1001', x.r.stdout + x.r.stderr);
x = seq('PRD'); ok('derick: 2a PRD => 1002', x.n === '1002', x.r.stdout + x.r.stderr);
x = seq('DT'); ok('derick: DT => 10001 (T=10000 para DT)', x.n === '10001', x.r.stdout + x.r.stderr);
x = seq('LOTE'); ok('derick: LOTE => 1001', x.n === '1001', x.r.stdout + x.r.stderr);
git(['config', 'user.email', 'charlesegundo@gmail.com']);
x = seq('PRD'); ok('charles (bloco 0): PRD => 142 (serie legada segue; 1001/1002 nao entram no piso)', x.n === '142', x.r.stdout + x.r.stderr);
x = seq('DT'); ok('charles: DT => 581', x.n === '581', x.r.stdout + x.r.stderr);
git(['config', 'user.email', 'ninguem@fora.da.tabela']);
x = seq('PRD'); ok('dev fora da tabela: bloco 0 => 143 + AVISO em stderr', x.n === '143' && /\[seq\] AVISO/.test(x.r.stderr), x.r.stdout + x.r.stderr);
setLocal(`HARNESS_SEQ_FAIXAS='off'\n`);
x = seq('PRD'); ok('HARNESS_SEQ_FAIXAS=off: serie unica => 1003 (max de tudo + 1)', x.n === '1003', x.r.stdout + x.r.stderr);
setLocal(`HARNESS_SEQ_FAIXAS='ninguem@fora.da.tabela=3'\n`);
x = seq('PRD'); ok('tabela custom (env.local): bloco 3 => 3001', x.n === '3001', x.r.stdout + x.r.stderr);
setLocal(`HARNESS_SEQ_FAIXAS_EXTRA='ninguem@fora.da.tabela=7'\n`);
x = seq('PRD'); ok('HARNESS_SEQ_FAIXAS_EXTRA acrescenta => 7001', x.n === '7001', x.r.stdout + x.r.stderr);
git(['config', 'user.email', 'derickjesiel96@gmail.com']);
setLocal(`HARNESS_SEQ_FAIXA_TAMANHO='PRD=3'\n`);
x = seq('PRD'); ok('faixa minuscula (T=3, bloco 1 = 4..5): 1a => 4', x.n === '4', x.r.stdout + x.r.stderr);
x = seq('PRD'); ok('2a => 5', x.n === '5', x.r.stdout + x.r.stderr);
x = seq('PRD'); ok('3a => faixa ESGOTADA (exit != 0, mensagem cita HARNESS_SEQ_FAIXAS)', x.r.status !== 0 && /sem numero livre/.test(x.r.stderr) && /HARNESS_SEQ_FAIXAS/.test(x.r.stderr), x.r.stdout + x.r.stderr);
setLocal();
let r = sh('harness-worktree.sh', ['faixa']);
ok('faixa: PRD do derick = bloco 1, 1001-1999, proximo=1004 (o 1003 do modo off conta)', /^FAIXA\|PRD\|derickjesiel96@gmail\.com\|bloco=1\|1001-1999\|proximo=1004$/m.test(r.stdout), r.stdout + r.stderr);   // 1003 foi reservado no modo off (serie unica) e caiu dentro da faixa do bloco 1
ok('faixa: DT do derick = 10001-19999, proximo=10002', /^FAIXA\|DT\|derickjesiel96@gmail\.com\|bloco=1\|10001-19999\|proximo=10002$/m.test(r.stdout), r.stdout);
ok('faixa: MIG modo=seq + tabela + identidade', /^FAIXA\|MIG\|modo=seq$/m.test(r.stdout) && /^FAIXA\|tabela\|charlesegundo@gmail\.com=0$/m.test(r.stdout) && /^FAIXA\|identidade\|derickjesiel96@gmail\.com$/m.test(r.stdout), r.stdout);

console.log('== T2 migrations ==');
x = seq('MIG'); ok('MIG modo seq => SEQ|MIG|0003 (inalterado)', x.n === '0003', x.r.stdout + x.r.stderr);
setLocal(`HARNESS_MIG_NUMERACAO='timestamp'\n`);
x = seq('MIG'); ok('MIG modo timestamp => 14 digitos', /^\d{14}$/.test(x.n || ''), x.r.stdout + x.r.stderr);
const TS = x.n;
const payload = (fp) => JSON.stringify({ session_id: 's', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: fp, content: '<?php\n' } });
const mig = (pfx, slug = 'nova') => path.join(MIG, `${pfx}_${slug}.php`);
r = sh('guard-migration.sh', [], payload(mig(TS)));
ok('guard timestamp: instante reservado por este checkout passa', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-migration.sh', [], payload(mig('0004')));
ok('guard timestamp: NNNN_ novo e NEGADO citando o modo', r.status === 2 && /TIMESTAMP/.test(r.stderr) && /reservar MIG/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 200)}`);
const pad = n => String(n).padStart(2, '0'); const d = new Date(Date.now() - 3600e3);
const TS2 = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
r = sh('guard-migration.sh', [], payload(mig(TS2)));
ok('guard timestamp: instante valido mas NAO reservado e negado', r.status === 2 && /NAO esta reservada/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-migration.sh', [], payload(mig('20200101000000')));
ok('guard timestamp: fora da janela de 48h e negado', r.status === 2 && /fora da janela/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 200)}`);
setLocal();
r = sh('guard-migration.sh', [], payload(mig(TS2)));
ok('guard modo seq: nome de 14 digitos e negado ("cara de timestamp")', r.status === 2 && /cara de timestamp/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 200)}`);
r = sh('guard-migration.sh', [], payload(mig('0003')));
ok('guard modo seq: 0003 reservada por este checkout continua passando', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);

console.log('== T3 rotulos de 4 digitos ==');
r = sh('harness-metrics.sh', ['start', 'PRD-1001-exec']);
ok('harness-metrics start PRD-1001-exec liga o cronometro (marcador criado, nao RECUSADO)', !/RECUSADO/.test(r.stdout + r.stderr) && fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'PRD-1001-exec.json')), r.stdout + r.stderr);
r = sh('prd-validacao-check.sh', ['--label', 'PRD-1001']);
ok('prd-validacao-check preserva PRD-1001 no rotulo (antes truncava para PRD-100)', /^VALIDACAO\|PRD-1001\|/m.test(r.stdout), r.stdout + r.stderr);
const ga = fs.readFileSync(path.join(HOOKS, 'guard-agent.sh'), 'utf8');
ok('guard-agent.sh: nenhum regex PRD-[0-9]{3} de largura fixa sobrou', !/PRD-\[0-9\]\{3\}[^,]/.test(ga) && /PRD-\[0-9\]\{3,5\}/.test(ga));

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
