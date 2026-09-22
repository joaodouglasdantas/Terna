#!/usr/bin/env node
// tests/t-3431-daemon-multi.mjs — bateria da 3.4.31 (daemon de hooks com modulos POR PROJETO).
// Roda em SANDBOX proprio (dois projetos falsos em os.tmpdir()), nunca toca o projeto real.
//   node tests/t-3431-daemon-multi.mjs
// Porta de teste: 47896 (127.0.0.1). Para o daemon de teste ao fim.
//
// O que prova (mecanico):
//   T1 daemon subido pelo projeto A responde a requisicao com cwd=B usando os hooks DE B (guard-bash stub de B
//      devolve deny 'STUB-B'); a mesma requisicao com cwd=A segue normal; /status lista B em `projetos`.
//   T2 B com HARNESS_VERSION menor e hash diferente: `--ensure` de B NAO reinicia o daemon (pid igual).
//   T3 B com HARNESS_VERSION maior: `--ensure` de B reinicia (pid muda) e passa a ser o daemon.
//   T4 projeto sem modulos (harness antigo) cai nos modulos proprios do daemon (200, sem erro).

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3431-daemon-sandbox-' + process.pid);
const HOME = path.join(S, 'home');
const PORT = 47896;
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };
const mk = (nome) => {
  const P = path.join(S, nome);
  fs.mkdirSync(path.join(P, '.claude'), { recursive: true });
  fs.cpSync(path.join(MASTER, '.claude', 'hooks'), path.join(P, '.claude', 'hooks'), { recursive: true });
  for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(P, '.claude', f));
  fs.writeFileSync(path.join(P, '.claude', 'harness.env.local'), `HARNESS_DAEMON_PORT='${PORT}'\nHARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\n`);
  fs.writeFileSync(path.join(P, 'arquivo.txt'), 'x\n');
  return P;
};
fs.rmSync(S, { recursive: true, force: true }); fs.mkdirSync(HOME, { recursive: true });
const A = mk('projA'), B = mk('projB'), C = mk('projC');
const setVersao = (P, v) => { const f = path.join(P, '.claude', 'harness.env'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/HARNESS_VERSION='[^']*'/, `HARNESS_VERSION='${v}'`)); };
// B: guard-bash stub (modulo proprio de B) + versao menor
fs.writeFileSync(path.join(B, '.claude', 'hooks', 'msg-b.mjs'), "export const MSG = 'STUB-B nega tudo';\n");
fs.writeFileSync(path.join(B, '.claude', 'hooks', 'guard-bash.mjs'), "import { MSG } from './msg-b.mjs';\nexport function guardBash(body, mode, opts) { return mode === 'pre' ? { exit: 2, stderr: MSG, stdout: '' } : { exit: 0, stdout: '', stderr: '' }; }\n");
setVersao(B, '3.4.25');
// C: sem modulos (harness antigo)
for (const f of ['guard-bash.mjs', 'guard-folego.mjs', 'presence.mjs', 'task-telemetry.mjs']) fs.rmSync(path.join(C, '.claude', 'hooks', f), { force: true });

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 300)); } };
const run = (P, args) => spawnSync(process.execPath, [path.join(P, '.claude', 'hooks', 'harness-daemon.mjs'), ...args], { encoding: 'utf8', cwd: P, env: ENVB, windowsHide: true });
const payload = (P, cmd) => JSON.stringify({ session_id: 'sess-3431', cwd: P, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd }, transcript_path: 'C:/x/p/sess-3431.jsonl', agent_id: 'a3431abc', agent_type: 'hefesto' });
const post = (p, body) => new Promise((resolve) => { const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST' }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); }); req.on('error', () => resolve(null)); req.end(body); });
const get = (p) => new Promise((resolve) => { http.get({ host: '127.0.0.1', port: PORT, path: p }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } }); }).on('error', () => resolve(null)); });
const pidDe = (s) => (s.match(/pid[= ](\d+)/) || [])[1];

run(A, ['--stop']);
console.log('== T1 modulos por projeto ==');
const e1 = run(A, ['--ensure', A]);
ok('daemon de A sobe', e1.stdout.includes('ativo'), e1.stdout + e1.stderr);
const pidA = pidDe(e1.stdout);
const rB = await post('/h/PreToolUse/guard-bash', payload(B, 'echo oi'));
ok('cwd=B => resposta vem do guard-bash DE B (deny STUB-B)', rB && rB.status === 200 && rB.body.includes('STUB-B'), JSON.stringify(rB).slice(0, 200));
const rA = await post('/h/PreToolUse/guard-bash', payload(A, 'echo oi'));
ok('cwd=A => guard-bash de A (echo passa, vazio)', rA && rA.status === 200 && rA.body === '', JSON.stringify(rA).slice(0, 200));
const rA2 = await post('/h/PreToolUse/guard-bash', payload(A, 'cat arquivo.txt'));
ok('cwd=A => GUARDA 0 de A ainda nega leitura em subagente', rA2 && rA2.body.includes('deny'), JSON.stringify(rA2).slice(0, 200));
const st = await get('/status');
ok('/status lista B em projetos', st && Array.isArray(st.projetos) && st.projetos.some(x => x.toLowerCase().includes('projb')), JSON.stringify(st && st.projetos));
// atualizacao de B em quente: troca o stub -> reimport pelo hash
fs.writeFileSync(path.join(B, '.claude', 'hooks', 'msg-b.mjs'), "export const MSG = 'STUB-B v2';\n");   // so a DEPENDENCIA INTERNA muda
const rB2 = await post('/h/PreToolUse/guard-bash', payload(B, 'echo oi'));
ok('B atualizado em quente numa dependencia INTERNA => reimport (STUB-B v2)', rB2 && rB2.body.includes('STUB-B v2'), JSON.stringify(rB2).slice(0, 200));
ok('copia por hash existe em ~/.harness-run/mods', fs.existsSync(path.join(HOME, '.harness-run', 'mods')) && fs.readdirSync(path.join(HOME, '.harness-run', 'mods')).length >= 1);

console.log('== T1b env com comentario a direita ==');
fs.appendFileSync(path.join(A, '.claude', 'harness.env.local'), "HARNESS_FOLEGO_hefesto='77'   # comentario na mesma linha\n");
const envT = spawnSync(process.execPath, ['-e', "import('./guard-folego.mjs').then(m=>import('./presence.mjs').then(p=>console.log(m.tetoDoPapel('hefesto', p.makeCtx(process.argv[1]).ENV))))", A], { cwd: path.join(A, '.claude', 'hooks'), encoding: 'utf8', env: ENVB });
ok("KEY='77'   # comentario => teto 77 (comentario ignorado)", envT.stdout.trim() === '77', envT.stdout + envT.stderr);
console.log('== T2 projeto atrasado nao derruba o daemon ==');
const e2 = run(B, ['--ensure', B]);
ok('--ensure de B (3.4.25, hash diferente) mantem o daemon de A (pid igual)', e2.stdout.includes('ativo') && pidDe(e2.stdout) === pidA, e2.stdout + ' | pidA=' + pidA);
ok('marcador daemon.on escrito em B mesmo assim', fs.existsSync(path.join(B, '.claude', '.harness-run', 'daemon.on')));

console.log('== T4 projeto sem modulos cai nos proprios ==');
const rC = await post('/h/PreToolUse/guard-bash', payload(C, 'echo oi'));
ok('cwd=C (sem hooks .mjs) => 200 com os modulos do daemon', rC && rC.status === 200, JSON.stringify(rC).slice(0, 200));

console.log('== T3 projeto mais novo assume ==');
setVersao(B, '9.9.9');
const e3 = run(B, ['--ensure', B]);
ok('--ensure de B (9.9.9) reinicia: pid muda', e3.stdout.includes('ativo') && pidDe(e3.stdout) && pidDe(e3.stdout) !== pidA, e3.stdout + ' | pidA=' + pidA);
let st3 = null; for (let i = 0; i < 6 && !st3; i++) { st3 = await get('/status'); if (!st3) await new Promise(r => setTimeout(r, 400)); }
ok('daemon ativo agora e o de B (hooks_dir de B, versao 9.9.9)', st3 && String(st3.hooks_dir).toLowerCase().includes('projb') && st3.versao === '9.9.9', JSON.stringify(st3).slice(0, 200));
const e4 = run(A, ['--ensure', A]);
ok('--ensure de A (3.4.x) agora NAO derruba o daemon 9.9.9 de B', pidDe(e4.stdout) === pidDe(e3.stdout), e4.stdout);

run(B, ['--stop']); await new Promise(r => setTimeout(r, 400));
ok('--stop encerra', run(A, ['--status']).stdout.includes('inativo'));
console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
