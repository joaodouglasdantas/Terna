#!/usr/bin/env node
// tests/t-3425-contratos.mjs — bateria da 3.4.25 (Onda D, item 19: contrato mecanico unico por papel
// injetado pelo packet; auditoria dos agentes p/ modelos 5; melhoria 2 nos gates).
// Roda em SANDBOX proprio (projeto falso em os.tmpdir(), sufixo de pid), nunca toca o projeto real.
// Precisa de node >= 18, bash (Git Bash) e git no PATH. Sem daemon (HARNESS_DAEMON=off).
//   node tests/t-3425-contratos.mjs
//
// O que prova (mecanico):
//   packet    — task-packet abre com "## 0. Contrato do papel (executor)"; review-packet com (revisor) +
//               pasta/piso; prd-packet com (gate) + piso; HARNESS_PACKET_CONTRATO=off tira a secao dos 3;
//               --check nao mede o contrato; sem a pasta contratos o packet sai sem a secao (exit 0).
//   sync      — harness-sync.sh --check num projeto falso acusa FALTA|nucleo|.claude/contratos/CONTRATO-*.md
//               e o --apply os copia.
//   doctor    — harness-doctor.sh acusa contrato ausente e passa com os 5 presentes.
//   agentes   — frontmatter valido e sem CRLF nos 14; dedalo/ariadne sem mcp__Claude_Browser/Preview;
//               12 genericos sem os blocos de mecanica (que agora vivem nos contratos) e apontando o
//               contrato certo; beholder/michelangelo com a regra de cobertura; contagem de linhas.
//   adapters  — gen-adapters.sh --check verde (TOMLs referenciam .claude/contratos/CONTRATO-<papel>.md).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3425-contratos-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 400)); } };
const sh = (file, args, env = {}, cwd = PROJ) => spawnSync('bash', [file, ...args], { encoding: 'utf8', cwd, env: { ...ENVB, ...env } });
const lê = (p) => fs.readFileSync(p, 'utf8');

// ---------------------------------------------------------------- sandbox
fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude', 'agents'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'contratos'), path.join(PROJ, '.claude', 'contratos'), { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'agents'), path.join(PROJ, '.claude', 'agents'), { recursive: true });
for (const f of ['harness.env', 'settings.json', 'PERFIL-PROJETO.md']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\nHARNESS_CODEX_REPORTS='reviews-teste'\n`);
fs.writeFileSync(path.join(PROJ, '.claude', 'PERFIL-RESUMO.md'), '# Resumo\n\nprojeto de teste.\n');
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'tasks'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'prds', 'PRD-001-teste', 'tasks'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'api'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'api', 'x.php'), '<?php\nfunction f() { return 1; }\n');
fs.writeFileSync(path.join(PROJ, 'prds', 'PRD-001-teste', 'PRD-001-teste.md'), '# PRD-001 — teste\n\nproduto.\n');
fs.writeFileSync(path.join(PROJ, 'prds', 'PRD-001-teste', 'PRD-TECNICA-001-teste.md'), '# Tecnica\n\n### Componente 1\n\ncontrato.\n');
const TASK = 'prds/PRD-001-teste/tasks/TASK-001-teste.md';
fs.writeFileSync(path.join(PROJ, TASK), '# TASK-001 — teste\n\n## Metadados\n\n| **Tipo** | backend |\n| **Duelo** | nao |\n\n## Objetivo\n\nMexer em f() (Componente 1).\n\n## Arquivo(s) Afetado(s)\n\n- `api/x.php`\n\n## Alteracoes Detalhadas\n\n- contrato.\n');
// git com um diff (review-packet)
spawnSync('git', ['init', '-q'], { cwd: PROJ });
spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'], { cwd: PROJ });
spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'base'], { cwd: PROJ });
fs.appendFileSync(path.join(PROJ, 'api', 'x.php'), 'function g() { return 2; }\n');
console.log('sandbox:', PROJ);

const packetDe = (id) => lê(path.join(PROJ, '.claude', '.harness-run', 'packets', `TASK-${id}.packet.md`));

console.log('\n== T1 task-packet: contrato do executor no topo ==');
let r = sh(path.join(HOOKS, 'task-packet.sh'), [TASK]);
ok('PACKET| montado', r.stdout.startsWith('PACKET|'), r.stdout + r.stderr);
let pk = packetDe('001');
const iSec0 = pk.indexOf('## 0. Contrato do papel (executor)'), iSec1 = pk.indexOf('## 1. Contrato da task');
ok('secao 0 (executor) vem ANTES da secao 1', iSec0 > 0 && iSec1 > iSec0, `${iSec0} ${iSec1}`);
ok('secao 0 cita a fonte e traz os blocos do CONTRATO-executor', pk.includes('CONTRATO-executor.md') && pk.includes('### Fôlego') && pk.includes('### Verificação provada') && pk.includes('### Retorno em dois níveis'));
ok('secao 0 nao repete o H1 do contrato nem o blockquote de abertura', !pk.includes('# Contrato mecânico — EXECUTOR') && !pk.includes('> Chega no topo do task packet'));
ok('contrato NAO escreve teto/contador (numero de chamadas)', !/teto de \d+/.test(pk.slice(iSec0, iSec1)) && !/HARNESS_FOLEGO/.test(pk.slice(iSec0, iSec1)));
const bytesOn = Number(r.stdout.trim().split('|')[4]);
r = sh(path.join(HOOKS, 'task-packet.sh'), [TASK], { HARNESS_PACKET_CONTRATO: 'off' });
pk = packetDe('001');
ok('HARNESS_PACKET_CONTRATO=off (env) tira a secao 0', !pk.includes('## 0. Contrato do papel') && pk.includes('## 1. Contrato da task'));
const bytesOff = Number(r.stdout.trim().split('|')[4]);
ok('contrato pesa entre 2 e 12 KB', bytesOn - bytesOff > 2048 && bytesOn - bytesOff < 12 * 1024, `${bytesOn}-${bytesOff}`);
fs.appendFileSync(path.join(PROJ, '.claude', 'harness.env.local'), "HARNESS_PACKET_CONTRATO='off'\n");
sh(path.join(HOOKS, 'task-packet.sh'), [TASK]);
ok('knob off pelo harness.env.local tambem tira', !packetDe('001').includes('## 0. Contrato do papel'));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), lê(path.join(PROJ, '.claude', 'harness.env.local')).replace("HARNESS_PACKET_CONTRATO='off'\n", ''));
r = sh(path.join(HOOKS, 'task-packet.sh'), [TASK, '--check']);
ok('--check: PACKET-CHECK sai e nao mede o contrato (KB=0 para task minima)', /^PACKET-CHECK\|TASK-001\|0\|1\/1\|\d+\|ok/m.test(r.stdout), r.stdout);
ok('--check nao deixa packet gravado', !fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'packets', 'TASK-001.check.tmp')));
// sem a pasta contratos: degrada em silencio
fs.renameSync(path.join(PROJ, '.claude', 'contratos'), path.join(PROJ, '.claude', 'contratos.bak'));
r = sh(path.join(HOOKS, 'task-packet.sh'), [TASK]);
ok('sem .claude/contratos: packet sai sem secao 0, exit 0', r.status === 0 && !packetDe('001').includes('## 0. Contrato do papel'), r.stderr);
fs.renameSync(path.join(PROJ, '.claude', 'contratos.bak'), path.join(PROJ, '.claude', 'contratos'));

console.log('\n== T2 review-packet: contrato do revisor + pasta/piso ==');
r = sh(path.join(HOOKS, 'review-packet.sh'), ['--label', 'PRD-001', '--tasks', TASK]);
ok('PACKET-REVIEW| montado', r.stdout.startsWith('PACKET-REVIEW|'), r.stdout + r.stderr);
let rp = lê(path.join(PROJ, '.claude', '.harness-run', 'review', 'PRD-001.review-packet.md'));
ok('secao 0 (revisor) antes de "Arquivos tocados"', rp.indexOf('## 0. Contrato do papel (revisor)') > 0 && rp.indexOf('## 0. Contrato do papel (revisor)') < rp.indexOf('## Arquivos tocados'));
ok('traz CONTRATO-revisor (cegueira, cobertura)', rp.includes('CONTRATO-revisor.md') && rp.includes('### Cegueira') && rp.includes('### Cobertura e evidência'));
ok('cabecalho informa pasta de relatorios (do harness.env.local) e piso', rp.includes('**Pasta de relatorios:** `reviews-teste`') && rp.includes('**Piso de severidade:** `critico`'));
r = sh(path.join(HOOKS, 'review-packet.sh'), ['--label', 'PRD-001', '--tasks', TASK], { HARNESS_PACKET_CONTRATO: 'off' });
rp = lê(path.join(PROJ, '.claude', '.harness-run', 'review', 'PRD-001.review-packet.md'));
ok('off tira a secao 0 do review-packet (pasta/piso continuam)', !rp.includes('## 0. Contrato do papel') && rp.includes('**Piso de severidade:**'));

console.log('\n== T3 prd-packet: contrato do gate + piso ==');
r = sh(path.join(HOOKS, 'prd-packet.sh'), ['--label', 'PRD-001']);
ok('PACKET| montado', r.stdout.startsWith('PACKET|'), r.stdout + r.stderr);
let pp = lê(path.join(PROJ, '.claude', '.harness-run', 'review', 'PRD-001.prd-packet.md'));
ok('secao 0 (gate) antes do [PRODUTO]', pp.indexOf('## 0. Contrato do papel (gate)') > 0 && pp.indexOf('## 0. Contrato do papel (gate)') < pp.indexOf('# [PRODUTO]'));
ok('traz CONTRATO-gate (ciclos, cobertura) + piso no cabecalho', pp.includes('CONTRATO-gate.md') && pp.includes('### Ciclos') && pp.includes('### Cobertura e evidência') && pp.includes('**Piso de severidade:** `critico`'));
r = sh(path.join(HOOKS, 'prd-packet.sh'), ['--label', 'PRD-001'], { HARNESS_PACKET_CONTRATO: 'off' });
ok('off tira a secao 0 do prd-packet', !lê(path.join(PROJ, '.claude', '.harness-run', 'review', 'PRD-001.prd-packet.md')).includes('## 0. Contrato do papel'));
const LOCALF = path.join(PROJ, '.claude', 'harness.env.local'), LOCAL0 = lê(LOCALF);
fs.writeFileSync(LOCALF, LOCAL0 + "HARNESS_REVIEW_SEVERITY_FLOOR='alto'" + '\n');
r = sh(path.join(HOOKS, 'prd-packet.sh'), ['--label', 'PRD-001']);
ok('piso resolvido do harness.env.local (alto) — o gate nao precisa ler o harness.env', lê(path.join(PROJ, '.claude', '.harness-run', 'review', 'PRD-001.prd-packet.md')).includes('**Piso de severidade:** `alto`'));
fs.writeFileSync(LOCALF, LOCAL0);

console.log('\n== T4 harness-sync: .claude/contratos viaja no nucleo ==');
const P2 = path.join(S, 'proj2');
fs.mkdirSync(path.join(P2, '.claude'), { recursive: true });
fs.writeFileSync(path.join(P2, '.claude', 'harness.env'), "HARNESS_VERSION='3.4.24'\n");
const SYNC = path.join(MASTER, '.claude', 'harness-sync.sh');
r = sh(SYNC, ['--check', P2], {}, MASTER);
ok('--check: exit 10 (defasado)', r.status === 10, `${r.status} ${r.stderr.slice(0, 200)}`);
for (const c of ['executor', 'revisor', 'gate', 'escrivao', 'scout']) ok(`--check acusa FALTA|nucleo|.claude/contratos/CONTRATO-${c}.md`, r.stdout.includes(`FALTA|nucleo|.claude/contratos/CONTRATO-${c}.md`));
ok('--check acusa FALTA do hooks/_contrato.sh', r.stdout.includes('FALTA|nucleo|.claude/hooks/_contrato.sh'));
r = sh(SYNC, ['--apply', P2], {}, MASTER);
ok('--apply copia os contratos', ['executor', 'revisor', 'gate', 'escrivao', 'scout'].every((c) => fs.existsSync(path.join(P2, '.claude', 'contratos', `CONTRATO-${c}.md`))), r.stdout.slice(-300));
r = sh(SYNC, ['--check', P2], {}, MASTER);
ok('apos --apply: alinhado (exit 0)', r.status === 0, r.stdout.split('\n').filter((l) => /FALTA|DIFERE/.test(l)).slice(0, 5).join(' | '));

console.log('\n== T5 harness-doctor: contrato ausente ==');
const DOC = path.join(P2, '.claude', 'harness-doctor.sh');
ok('doctor chegou pelo sync', fs.existsSync(DOC));
fs.mkdirSync(path.join(P2, 'prds', '_metrics'), { recursive: true });
fs.writeFileSync(path.join(P2, '.claude', 'harness.env.local'), "HARNESS_PRESENCE_URL=''\nHARNESS_DAEMON='off'\nHARNESS_FRENTES='off'\n");
let d = spawnSync('bash', [DOC], { cwd: P2, encoding: 'utf8', env: ENVB });
ok('doctor com os 5 contratos: ok', /contratos de papel presentes/.test(d.stdout), d.stdout.split('\n').filter((l) => /contrat/i.test(l)).join(' | '));
fs.rmSync(path.join(P2, '.claude', 'contratos', 'CONTRATO-gate.md'));
d = spawnSync('bash', [DOC], { cwd: P2, encoding: 'utf8', env: ENVB });
ok('doctor acusa CONTRATO-gate.md ausente', /contrato\(s\) de papel ausente\(s\)[^\n]*CONTRATO-gate\.md/.test(d.stdout), d.stdout.split('\n').filter((l) => /contrat/i.test(l)).join(' | '));
fs.rmSync(path.join(P2, '.claude', 'contratos'), { recursive: true, force: true });
d = spawnSync('bash', [DOC], { cwd: P2, encoding: 'utf8', env: ENVB });
ok('doctor acusa pasta .claude/contratos/ ausente', /pasta \.claude\/contratos\/ ausente/.test(d.stdout), d.stdout.split('\n').filter((l) => /contrat/i.test(l)).join(' | '));

console.log('\n== T6 agentes: frontmatter, CRLF, tools, mecanica fora, contrato certo ==');
const AG = path.join(MASTER, '.claude', 'agents');
const GENERICOS = ['beholder', 'michelangelo', 'tony-stark', 'sherlock', 'atlas', 'hefesto', 'peter-quill', 'ariadne', 'dedalo', 'prometeu', 'themis', 'hermes'];
const TODOS = [...GENERICOS, 'datilografo', 'zelador'];
const fm = (t) => { const m = t.match(/^---\n([\s\S]*?)\n---\n/); return m ? m[1] : ''; };
for (const a of TODOS) {
  const t = lê(path.join(AG, `${a}.md`)); const f = fm(t);
  ok(`${a}.md: frontmatter valido (name/description/tools) e sem CRLF`, f.includes(`name: ${a}`) && /^description: .+/m.test(f) && /^tools: .+/m.test(f) && !t.includes('\r'), f.slice(0, 80));
}
for (const a of ['dedalo', 'ariadne']) {
  const t = lê(path.join(AG, `${a}.md`));
  ok(`${a}.md: sem mcp__Claude_Browser/Preview no tools; Playwright citado`, !/mcp__Claude_(Browser|Preview)__/.test(t) && t.includes('npx playwright screenshot'));
}
const CONTRATO_DE = { hefesto: 'executor', dedalo: 'executor', sherlock: 'revisor', beholder: 'gate', michelangelo: 'gate', hermes: 'escrivao', 'peter-quill': 'scout', atlas: 'scout', 'tony-stark': 'scout', themis: 'scout', prometeu: 'scout', ariadne: 'scout' };
for (const [a, c] of Object.entries(CONTRATO_DE)) {
  const t = lê(path.join(AG, `${a}.md`));
  ok(`${a}.md aponta CONTRATO-${c}.md`, t.includes(`.claude/contratos/CONTRATO-${c}.md`));
}
const MECANICA = [/Ferramenta certa para LER/, /temporarily unavailable/, /cannot determine the safety/, /Retorno em DOIS N[IÍ]VEIS \(3\.4\.9/, /Edit-first \(3\.4\.6\)/, /TETO DE F[OÔ]LEGO/, /guard-folego/, /Medido \d\d[–-]\d\d\/\d\d/, /incidente real/];
for (const a of GENERICOS) {
  const t = lê(path.join(AG, `${a}.md`));
  const sobra = MECANICA.filter((re) => re.test(t)).map(String);
  ok(`${a}.md sem blocos de mecanica/fosseis (vivem no contrato)`, sobra.length === 0, sobra.join(' '));
}
for (const a of ['beholder', 'michelangelo']) {
  const t = lê(path.join(AG, `${a}.md`));
  ok(`${a}.md: regra de COBERTURA (confianca alta/media/baixa; triagem da sessao-pai; piso so detalha)`, /Regra de COBERTURA/.test(t) && /\*\*Confiança:\*\* alta \| média \| baixa/.test(t) && /nunca o que reportar/.test(t) && !/teto absoluto = HARNESS_REVIEW_MAX_CICLOS/.test(t));
}
const sherlock = lê(path.join(AG, 'sherlock.md'));
ok('sherlock.md mantem Lente A|B|completa + cobertura (3.4.24) e nao le o harness.env', /Lente: A\|B\|completa/.test(sherlock) && /Regra de COBERTURA/.test(sherlock) && !/Ler `\.claude\/harness\.env`/.test(sherlock));
const hermes = lê(path.join(AG, 'hermes.md'));
ok('hermes.md mantem as frases que a t-3424 confere', hermes.includes('prevendo mais de\n   45 min') && hermes.includes('só no rito COMPLETO'));
const CONTR = path.join(MASTER, '.claude', 'contratos');
for (const c of ['executor', 'revisor', 'gate', 'escrivao', 'scout']) {
  const t = lê(path.join(CONTR, `CONTRATO-${c}.md`));
  ok(`CONTRATO-${c}.md: sem contador/teto numerico, sem numero de incidente, LF`, !/teto de \d+/.test(t) && !/\b(PRD|DT)-\d{3}/.test(t) && !/\d\d\/\d\d\/20\d\d/.test(t) && !t.includes('\r'));
}
ok('CONTRATO-executor: verificacao provada (saida colada; sem saida = nao-provada, Status ⚠️)', /saída colada/.test(lê(path.join(CONTR, 'CONTRATO-executor.md'))) && /não-provada/.test(lê(path.join(CONTR, 'CONTRATO-executor.md'))));

// contagem de linhas (informativa): baseline 3.4.24 dos 12 genericos = 1580
const BASE_3424 = { ariadne: 152, atlas: 94, beholder: 153, dedalo: 201, hefesto: 124, hermes: 128, michelangelo: 188, 'peter-quill': 78, prometeu: 146, sherlock: 152, themis: 54, 'tony-stark': 110 };
let antes = 0, depois = 0;
console.log('\n  linhas dos 12 genericos (3.4.24 -> agora):');
for (const a of GENERICOS) {
  const n = lê(path.join(AG, `${a}.md`)).split('\n').length - 1; antes += BASE_3424[a]; depois += n;
  console.log(`    ${a.padEnd(13)} ${String(BASE_3424[a]).padStart(4)} -> ${String(n).padStart(4)}`);
}
console.log(`    ${'TOTAL'.padEnd(13)} ${String(antes).padStart(4)} -> ${String(depois).padStart(4)}  (${Math.round((depois - antes) / antes * 100)}%)`);
ok('12 genericos menores que a baseline 3.4.24', depois < antes, `${depois} >= ${antes}`);

console.log('\n== T7 adapters Codex (paridade + contrato) ==');
r = sh(path.join(MASTER, '.claude', 'scripts', 'gen-adapters.sh'), ['--check'], {}, MASTER);
ok('gen-adapters --check verde', r.status === 0, r.stderr + r.stdout);
for (const [a, c] of Object.entries(CONTRATO_DE)) {
  const toml = path.join(MASTER, '.codex', 'agents', `${a}.toml`);
  if (!fs.existsSync(toml)) continue;   // themis/hermes nao tem adapter Codex
  ok(`${a}.toml referencia CONTRATO-${c}.md`, lê(toml).includes(`.claude/contratos/CONTRATO-${c}.md`));
}
ok('sherlock.toml sem "em dúvida, é Sugestão"', !lê(path.join(MASTER, '.codex', 'agents', 'sherlock.toml')).includes('em dúvida, é Sugestão'));
ok('harness.env documenta HARNESS_PACKET_CONTRATO', lê(path.join(MASTER, '.claude', 'harness.env')).includes("# HARNESS_PACKET_CONTRATO='on'"));
for (const f of ['hooks/_contrato.sh', 'hooks/task-packet.sh', 'hooks/prd-packet.sh', 'hooks/review-packet.sh', 'harness-sync.sh', 'harness-doctor.sh', 'scripts/gen-adapters.sh']) {
  const t = lê(path.join(MASTER, '.claude', f));
  ok(`sem GNU-ism em ${f}`, !/find [^\n]*-printf|sed -i /.test(t) && !/\$\{[a-zA-Z_]+,,\}/.test(t) && !/readarray|mapfile/.test(t));
}

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
if (!fail) { try { fs.rmSync(S, { recursive: true, force: true }); } catch {} }
process.exit(fail ? 1 : 0);
