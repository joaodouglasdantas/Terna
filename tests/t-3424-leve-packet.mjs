#!/usr/bin/env node
// tests/t-3424-leve-packet.mjs — bateria da 3.4.24 (Onda C: itens 12, 13, 9 e 11c).
// Roda em SANDBOX proprio (projeto falso em os.tmpdir()), nunca toca o projeto real.
// Precisa de node >= 18 e bash (Git Bash) no PATH.
//   node tests/t-3424-leve-packet.mjs
// Porta de teste da UI: 47913 (127.0.0.1; sobe na primeira livre a partir dela).
//
// O que prova (mecanico):
//   item 9   — task-packet.sh: .php de 60 KB citado como ALVO e .js de 50 KB citado como CONTEXTO entram
//              por "GRANDE: esqueleto" (+ corpo da funcao citada); arquivo pequeno entra inteiro;
//              HARNESS_PACKET_ESQUELETO=alvos volta ao 3.4.19 (contexto inteiro); PREVISAO > 45 min
//              (3 linhas semeadas em prds/_metrics/tasks/) => PREVISAO|...|GRANDE e PACKET-CHECK GRANDE|previsao.
//   item 11c — DUELO-CHECK: `Duelo | sim` com 3 alvos de producao => inelegivel; 2 existentes => ok;
//              arquivo novo citado => inelegivel; Duelo nao => n/a; HARNESS_DUELO_CHECK=off => off.
//   item 13  — harness-ui.mjs sobe, serve o HTML com a linha "beholder · michelangelo — ciclo 1" em
//              sonnet no equilibrado e o /api/state expoe beholder/michelangelo com modelo sonnet (c1).
//   item 12/13 (texto) — greps nas skills/agentes/Perfil: frases novas presentes, antigas ausentes.

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// sandbox com nome PROPRIO: a t-3424-review-duelo.mjs usa `harness-3424-sandbox` e apaga a pasta ao subir.
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3424-leve-sandbox');
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };
const PORT = 47913;

// ---------------------------------------------------------------- sandbox
fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude', 'agents'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'agents'), path.join(PROJ, '.claude', 'agents'), { recursive: true });
for (const f of ['harness.env', 'settings.json', 'PERFIL-PROJETO.md', 'harness-ui.mjs', 'harness-config.html']) {
  fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
}
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\n`);
fs.writeFileSync(path.join(PROJ, '.claude', 'PERFIL-RESUMO.md'), '# Resumo\n\nprojeto de teste.\n');
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'tasks'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'prds', 'PRD-001-teste', 'tasks'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'api'), { recursive: true }); fs.mkdirSync(path.join(PROJ, 'assets'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'lib'), { recursive: true });

// arquivos: php 60 KB (alvo), js 50 KB (contexto), php pequeno, css 45 KB (sem funcoes), 2 helpers php pequenos
const linhasPhp = ['<?php'];
for (let i = 1; i <= 700; i++) linhasPhp.push(`function calcular_${i}($a) {`, `    return $a + ${i}; // ${'x'.repeat(40)}`, `}`);
fs.writeFileSync(path.join(PROJ, 'api', 'grande.php'), linhasPhp.join('\n') + '\n');
const linhasJs = [];
for (let i = 1; i <= 600; i++) linhasJs.push(`function montarLinha${i}(a) {`, `  return a + ${i}; // ${'y'.repeat(40)}`, `}`);
fs.writeFileSync(path.join(PROJ, 'assets', 'grande.js'), linhasJs.join('\n') + '\n');
fs.writeFileSync(path.join(PROJ, 'api', 'pequeno.php'), '<?php\nfunction pequeno_fn() { return 1; }\n');
fs.writeFileSync(path.join(PROJ, 'api', 'outro.php'), '<?php\nfunction outro_fn() { return 2; }\n');
fs.writeFileSync(path.join(PROJ, 'lib', 'helper.php'), '<?php\nfunction helper_fn() { return 3; }\n');
fs.writeFileSync(path.join(PROJ, 'assets', 'grande.css'), Array.from({ length: 1500 }, (_, i) => `.c${i} { color: #${(i % 999).toString().padStart(3, '0')}; margin: 0 auto; padding: 4px 8px; }`).join('\n') + '\n');
const kb = (p) => Math.round(fs.statSync(path.join(PROJ, p)).size / 1024);
console.log('sandbox:', PROJ, `| grande.php ${kb('api/grande.php')} KB · grande.js ${kb('assets/grande.js')} KB · grande.css ${kb('assets/grande.css')} KB`);

const TASKS = path.join(PROJ, 'prds', 'PRD-001-teste', 'tasks');
const task = (id, duelo, afetados, extra = '') => {
  const f = path.join(TASKS, `TASK-${id}-teste.md`);
  fs.writeFileSync(f, `# TASK-${id} — teste\n\n## Metadados\n\n| **Tipo** | backend |\n| **Duelo** | ${duelo} |\n\n## Objetivo\n\nMexer em calcular_7() e conferir o padrao de montarLinha3() em \`assets/grande.js\`.${extra}\n\n## Arquivo(s) Afetado(s)\n\n${afetados.map((a) => `- \`${a}\``).join('\n')}\n\n## Alteracoes Detalhadas\n\n- contrato.\n`);
  return `prds/PRD-001-teste/tasks/TASK-${id}-teste.md`;
};

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 300)); } };
const sh = (file, args, env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const packetDe = (id) => fs.readFileSync(path.join(PROJ, '.claude', '.harness-run', 'packets', `TASK-${id}.packet.md`), 'utf8');

// ---------------------------------------------------------------- item 9: esqueleto p/ alvo E contexto
const t1 = task('001', 'sim', ['api/grande.php', 'api/pequeno.php']);
let r = sh('task-packet.sh', [t1]);
ok('packet montado (PACKET|...)', r.stdout.startsWith('PACKET|') && r.stdout.includes('api/grande.php,api/pequeno.php'), r.stdout + r.stderr);
let pk = packetDe('001');
ok('alvo .php 60 KB entra por "GRANDE: esqueleto" [alvo]', /### `api\/grande\.php` \(\d+ bytes — GRANDE: esqueleto \+ funcoes e trechos citados \[alvo\]/.test(pk), pk.slice(0, 200));
ok('esqueleto do .php lista assinaturas com numero de linha', /\n\d+:function calcular_700\(/.test(pk));
ok('corpo SO da funcao citada (calcular_7) no .php', pk.includes('#### `calcular_7()`') && !pk.includes('#### `calcular_8()`'));
ok('contexto .js 50 KB (fora de "Arquivo(s) Afetado(s)") entra na secao 5 por esqueleto [contexto]', pk.includes('## 5. Arquivos de contexto') && /### `assets\/grande\.js` \(\d+ bytes — GRANDE: esqueleto \+ funcoes e trechos citados \[contexto\]/.test(pk));
ok('corpo da funcao citada no contexto (montarLinha3)', pk.includes('#### `montarLinha3()`'));
ok('arquivo pequeno entra INTEIRO', /### `api\/pequeno\.php` \(\d+ bytes\)\n\n```\n<\?php\nfunction pequeno_fn\(\)/.test(pk));
ok('.js grande NAO entrou inteiro', !pk.includes('function montarLinha600(a) {\n  return a + 600'));
ok('packet ficou menor que a soma dos arquivos (< 60 KB com 65 + 54 KB citados)', Number(r.stdout.trim().split('|')[4]) < 60 * 1024, r.stdout);

r = sh('task-packet.sh', [t1], { HARNESS_PACKET_ESQUELETO: 'alvos' });
pk = packetDe('001');
ok('HARNESS_PACKET_ESQUELETO=alvos: alvo por esqueleto, contexto INTEIRO (3.4.19)', /grande\.php` \(\d+ bytes — GRANDE: esqueleto/.test(pk) && /### `assets\/grande\.js` \(\d+ bytes\)\n\n```\n/.test(pk) && pk.includes('function montarLinha600(a)'));
r = sh('task-packet.sh', [t1], { HARNESS_PACKET_ESQUELETO: 'off' });
pk = packetDe('001');
ok('HARNESS_PACKET_ESQUELETO=off: tudo inteiro', !pk.includes('GRANDE: esqueleto') && pk.includes('function calcular_700('));
r = sh('task-packet.sh', [t1], { HARNESS_PACKET_ARQ_KB: '100' });
pk = packetDe('001');
ok('HARNESS_PACKET_ARQ_KB=100: 60 KB nao e grande => inteiro', !pk.includes('GRANDE: esqueleto'));

const t2 = task('002', 'nao — css', ['assets/grande.css']);
sh('task-packet.sh', [t2]);
pk = packetDe('002');
ok('arquivo grande SEM funcoes (.css 45 KB) entra pelo cabecalho', /### `assets\/grande\.css` \(\d+ bytes — GRANDE: cabecalho, primeiras 120 linhas \+ trechos citados \[alvo\]/.test(pk) && pk.includes('.c0 {') && !pk.includes('.c1400 {'));

// task SEM a secao "Arquivo(s) Afetado(s)": tudo e alvo (compat 3.3.0)
const t3 = 'prds/PRD-001-teste/tasks/TASK-003-teste.md';
fs.writeFileSync(path.join(PROJ, t3), '# TASK-003 — sem secao\n\n| **Tipo** | backend |\n| **Duelo** | sim |\n\n## Objetivo\n\nMexer em `api/pequeno.php` e `lib/helper.php`.\n');
r = sh('task-packet.sh', [t3]);
pk = packetDe('003');
ok('sem a secao de afetados: citados viram alvos (compat) e nao ha secao 5', r.stdout.includes('api/pequeno.php,lib/helper.php|2|') && !pk.includes('## 5. Arquivos de contexto'), r.stdout);

// ---------------------------------------------------------------- item 11c: DUELO-CHECK
r = sh('task-packet.sh', [t1, '--check']);
ok('--check: 3 linhas (PACKET-CHECK, PREVISAO, DUELO-CHECK)', /^PACKET-CHECK\|TASK-001\|\d+\|2\/2\|\d+\|ok\n/.test(r.stdout) && /\nPREVISAO\|TASK-001\|/.test(r.stdout) && /\nDUELO-CHECK\|TASK-001\|/.test(r.stdout), r.stdout + r.stderr);
ok('Duelo sim + 2 alvos existentes de producao => DUELO-CHECK ok', r.stdout.includes('DUELO-CHECK|TASK-001|ok'), r.stdout);
ok('contexto NAO conta como alvo (2/2, e nao 3/3)', r.stdout.includes('|2/2|'), r.stdout);
ok('--check nao deixa packet gravado', !fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'packets', 'TASK-001.check.tmp')));

const t4 = task('004', 'sim', ['api/pequeno.php', 'api/outro.php', 'lib/helper.php']);
r = sh('task-packet.sh', [t4, '--check']);
ok('Duelo sim + 3 alvos de producao => inelegivel (max 2)', /DUELO-CHECK\|TASK-004\|inelegivel\|3 alvos de producao \(max 2\)/.test(r.stdout), r.stdout);
ok('3 alvos nao e GRANDE por alvos (teto 4)', /PACKET-CHECK\|TASK-004\|\d+\|3\/3\|\d+\|ok/.test(r.stdout), r.stdout);

const t5 = task('005', 'sim', ['api/pequeno.php', 'api/novo_endpoint.php']);
r = sh('task-packet.sh', [t5, '--check']);
ok('Duelo sim + arquivo NOVO citado => inelegivel|arquivo novo: <path>', /DUELO-CHECK\|TASK-005\|inelegivel\|arquivo novo: api\/novo_endpoint\.php/.test(r.stdout), r.stdout);
sh('task-packet.sh', [t5]);
ok('packet marca o ARQUIVO NOVO na secao 4', packetDe('005').includes('`api/novo_endpoint.php` — ARQUIVO NOVO'));

const t6 = task('006', 'sim', ['api/pequeno.php', 'tests/e2e/novo.spec.js', 'docs/manual/x.md']);
r = sh('task-packet.sh', [t6, '--check']);
ok('spec/doc novos NAO contam como arquivo novo de producao => ok', r.stdout.includes('DUELO-CHECK|TASK-006|ok'), r.stdout);

const t7 = task('007', 'nao — migration', ['api/pequeno.php']);
r = sh('task-packet.sh', [t7, '--check']);
ok('Duelo nao => DUELO-CHECK n/a|Duelo=nao', /DUELO-CHECK\|TASK-007\|n\/a\|Duelo=nao/.test(r.stdout), r.stdout);
const t8 = task('008', 'auto', ['api/pequeno.php']);
r = sh('task-packet.sh', [t8, '--check']);
ok('Duelo auto => n/a|Duelo=auto', /DUELO-CHECK\|TASK-008\|n\/a\|Duelo=auto/.test(r.stdout), r.stdout);
r = sh('task-packet.sh', [t4, '--check'], { HARNESS_DUELO_CHECK: 'off' });
ok('HARNESS_DUELO_CHECK=off => DUELO-CHECK|...|off', r.stdout.includes('DUELO-CHECK|TASK-004|off'), r.stdout);

// ---------------------------------------------------------------- item 9: PREVISAO > 45 entra no veredito
r = sh('task-packet.sh', [t1, '--check']);
ok('sem historico: PREVISAO n/d e PACKET-CHECK ok', r.stdout.includes('PREVISAO|TASK-001|n/d') && /PACKET-CHECK\|TASK-001\|\d+\|2\/2\|\d+\|ok\n/.test(r.stdout), r.stdout);
const kbCheck = Number(r.stdout.match(/PACKET-CHECK\|TASK-001\|(\d+)\|/)[1]);
const agora = Math.floor(Date.now() / 1000);
const linhas = [1, 2, 3].map((i) => JSON.stringify({ ts: agora - i * 3600, projeto: 'proj', papel: 'hefesto', rotulo: `TASK-00${i}`, modelo: 'claude-sonnet-5', dur_s: 3600, turnos: 40, packet_kb: Math.max(1, kbCheck + i - 2), alvos: 2, status: '✅' }));
fs.writeFileSync(path.join(PROJ, 'prds', '_metrics', 'tasks', 'dev@maquina.jsonl'), linhas.join('\n') + '\n');
r = sh('task-packet.sh', [t1, '--check']);
ok('3 tasks medidas (60 min, packet parecido) => PREVISAO|...|60 min|n=3|hefesto|GRANDE', /PREVISAO\|TASK-001\|60 min\|n=3\|hefesto\|GRANDE/.test(r.stdout), r.stdout);
ok('previsao > 45 vira GRANDE no PACKET-CHECK com o motivo "previsao 60>45 min"', /PACKET-CHECK\|TASK-001\|\d+\|2\/2\|\d+\|GRANDE\|previsao 60>45 min/.test(r.stdout), r.stdout);
r = sh('task-packet.sh', [t1, '--check'], { HARNESS_TASK_PREVISAO_MAX_MIN: '90' });
ok('HARNESS_TASK_PREVISAO_MAX_MIN=90 => previsao 60 e ok', /PREVISAO\|TASK-001\|60 min\|n=3\|hefesto\|ok/.test(r.stdout) && /PACKET-CHECK\|TASK-001\|\d+\|2\/2\|\d+\|ok\n/.test(r.stdout), r.stdout);
ok('formato PACKET-CHECK ok continua com 6 campos (compat t-3422)', r.stdout.split('\n')[0].split('|').length === 6, r.stdout.split('\n')[0]);

// ---------------------------------------------------------------- item 13: UI sobe e expoe a matriz
const httpGet = (url) => new Promise((res) => { const rq = http.get(url, (rs) => { let b = ''; rs.on('data', (d) => b += d); rs.on('end', () => res({ status: rs.statusCode, body: b })); }); rq.on('error', () => res(null)); rq.setTimeout(5000, () => { rq.destroy(); res(null); }); });
const ui = spawn(process.execPath, [path.join(PROJ, '.claude', 'harness-ui.mjs'), '--port', String(PORT), '--idle', '2'], { cwd: PROJ, env: ENVB, stdio: ['ignore', 'pipe', 'pipe'] });
let uiOut = ''; ui.stdout.on('data', (d) => uiOut += d); ui.stderr.on('data', (d) => uiOut += d);
const urlUi = await new Promise((res) => { const t0 = Date.now(); const iv = setInterval(() => { const m = uiOut.match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f-]+/); if (m || Date.now() - t0 > 15000) { clearInterval(iv); res(m ? m[0] : ''); } }, 100); });
ok('harness-ui.mjs sobe e imprime a URL com token', !!urlUi, uiOut.slice(0, 300));
if (urlUi) {
  const u = new URL(urlUi);
  const html = await httpGet(urlUi);
  ok('GET / serve o harness-config.html', html && html.status === 200 && html.body.includes('const MATRIZ'), html && html.status);
  ok('HTML: linha "beholder · michelangelo — ciclo 1" com sonnet (c1) no equilibrado', !!html && /\['beholder · michelangelo — ciclo 1','sonnet','sonnet \(c1\)','opus'\]/.test(html.body));
  ok('HTML: linha do ciclo 2 = opus 1x so no equilibrado', !!html && /\['beholder · michelangelo — ciclo 2[^']*','sonnet','opus 1×','sonnet'\]/.test(html.body));
  const st = await httpGet(`${u.origin}/api/state?t=${u.searchParams.get('t')}`);
  let js = null; try { js = JSON.parse(st.body); } catch {}
  ok('GET /api/state responde JSON com preset equilibrado', js && js.ok && js.preset === 'equilibrado', st && st.body.slice(0, 200));
  const beh = js && js.agentes.find((a) => a.slug === 'beholder'), mic = js && js.agentes.find((a) => a.slug === 'michelangelo');
  ok('/api/state: beholder no equilibrado = sonnet (preset; c1 — opus 1x no c2 ...)', beh && /^sonnet \(preset; c1 — opus 1x no c2/.test(beh.modelo), beh && beh.modelo);
  ok('/api/state: michelangelo idem', mic && /^sonnet \(preset; c1/.test(mic.modelo), mic && mic.modelo);
  ok('/api/state: sherlock segue "sonnet (preset)" (nao e gate da /prd)', (js.agentes.find((a) => a.slug === 'sherlock') || {}).modelo === 'sonnet (preset)');
}
ui.kill();
// override no Perfil vence: Modelo do beholder: opus
{
  const perfil = path.join(PROJ, '.claude', 'PERFIL-PROJETO.md');
  fs.writeFileSync(perfil, fs.readFileSync(perfil, 'utf8').replace('| **Modelo do beholder** | `preset` `<sonnet / opus / fable>` |', '| **Modelo do beholder** | `opus` |'));
  const ui2 = spawn(process.execPath, [path.join(PROJ, '.claude', 'harness-ui.mjs'), '--port', String(PORT + 1), '--idle', '2'], { cwd: PROJ, env: ENVB, stdio: ['ignore', 'pipe', 'pipe'] });
  let o2 = ''; ui2.stdout.on('data', (d) => o2 += d);
  const url2 = await new Promise((res) => { const t0 = Date.now(); const iv = setInterval(() => { const m = o2.match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f-]+/); if (m || Date.now() - t0 > 15000) { clearInterval(iv); res(m ? m[0] : ''); } }, 100); });
  const u2 = url2 ? new URL(url2) : null;
  const st2 = u2 ? await httpGet(`${u2.origin}/api/state?t=${u2.searchParams.get('t')}`) : null;
  let js2 = null; try { js2 = JSON.parse(st2.body); } catch {}
  const beh2 = js2 && js2.agentes.find((a) => a.slug === 'beholder');
  ok('override "Modelo do beholder: opus" no Perfil vence o preset (item 13)', beh2 && beh2.modelo === 'opus', beh2 && beh2.modelo);
  ui2.kill();
}

// ---------------------------------------------------------------- itens 12/13 (texto): greps de prova
const skill = fs.readFileSync(path.join(MASTER, '.claude', 'skills', 'prd', 'SKILL.md'), 'utf8');
const hermes = fs.readFileSync(path.join(MASTER, '.claude', 'agents', 'hermes.md'), 'utf8');
const perfilM = fs.readFileSync(path.join(MASTER, '.claude', 'PERFIL-PROJETO.md'), 'utf8');
ok('/prd 1.5: LEVE e o PADRAO; COMPLETO por RISCO', skill.includes('MODO LEVE e o PADRAO') && skill.includes('O rito e decidido por RISCO, nao por tamanho'));
ok('/prd 1.5: criterio antigo (fatia OU <= 6 tasks OU --leve) sumiu', !skill.includes('OU a entrevista estimou **≤ 6 tasks**') && !skill.includes('Criterio (qualquer um): rotulo com sufixo de fatia'));
ok('/prd 1.5: --leve = no-op com aviso; --completo aceito', skill.includes('`--leve` continua aceito e vira no-op com aviso') && skill.includes('/prd --completo'));
ok('/prd 8: hermes Modo E so no rito COMPLETO a partir de 7', skill.includes('**So no rito COMPLETO** e a partir de\n   **7 tasks de trabalho**, despache **DOIS agentes `hermes` (Modo E)') && !skill.includes('A partir de **7**, despache **DOIS agentes `hermes` (Modo E) na MESMA mensagem** — e,'));
ok('/prd 8: PREVISAO GRANDE = task GRANDE (fatiar antes do gate)', skill.includes('`PREVISAO|...|GRANDE` e task GRANDE como as outras'));
ok('/prd 8: DUELO-CHECK inelegivel => rebaixa para nao — <motivo>', skill.includes('DUELO-CHECK|TASK-NNN|inelegivel|<motivo>') && skill.includes('rebaixe o campo AGORA para `nao — <motivo>`'));
ok('/prd 10.1: escalada para Opus so quando o c1 reabre o desenho (>= 3 estruturais)', skill.includes('ESCALADA PARA OPUS SO QUANDO O CICLO 1 REABRE O DESENHO') && skill.includes('≥ 3 🔴 estruturais'));
ok('/prd 10.1: frase antiga "equilibrado e economico = sonnet em todos os ciclos" sumiu', !skill.includes('`equilibrado`\ne `economico` = **sonnet em todos os ciclos**'));
ok('/prd: --modo=leve|completo no stop das duas fases', (skill.match(/--modo=/g) || []).length >= 2);
ok('hermes.md: fatie quando o --check prever > 45 min; Modo E so no rito COMPLETO', hermes.includes('prevendo mais de\n   45 min') && hermes.includes('só no rito COMPLETO'));
ok('Perfil: tabela com beholder c1 sonnet / c2 opus so se reabriu; nota do item 13', perfilM.includes('| **beholder** — ciclo 1 *(3.4.24, item 13)* | sonnet | sonnet | **opus** |') && perfilM.includes('Gates da `/prd` no `equilibrado` (3.4.24, item 13)'));
for (const p of ['php-laragon', 'node-api', 'generico']) {
  const t = fs.readFileSync(path.join(MASTER, 'perfis', `${p}.md`), 'utf8');
  ok(`perfis/${p}.md: nota do item 13 + ciclos base 1/2/3`, t.includes('Gates da `/prd` no `equilibrado` (3.4.24, item 13)') && t.includes('2 ciclos base, medium'));
}
const env = fs.readFileSync(path.join(MASTER, '.claude', 'harness.env'), 'utf8');
ok('harness.env: knobs da Onda C documentados', ['HARNESS_PRD_RITO', 'HARNESS_GATE_ESTRUTURAIS_OPUS', 'HARNESS_PACKET_ARQ_KB', 'HARNESS_PACKET_ESQUELETO', 'HARNESS_DUELO_CHECK'].every((k) => env.includes(`# ${k}=`)));

// ---------------------------------------------------------------- 3.4.26: trechos citados por linha (arquivo GRANDE por esqueleto)
{
  const t9 = task('009', 'nao — teste', ['api/grande.php'], ' Ajuste `api/grande.php:30` e o bloco em api/grande.php (l. 60); tambem api/grande.php:999999.');
  const r9 = sh('task-packet.sh', [t9]);
  const p9 = packetDe('009');
  ok('trecho citado (api/grande.php:30) entra no packet com margem', r9.stdout.startsWith('PACKET|') && /trecho citado no contrato: linhas 30-30 \(margem 25\)/.test(p9) && /\n30: /.test(p9), p9.slice(0, 300));
  ok('forma "(l. 60)" tambem entra', /trecho citado no contrato: linhas 60-60/.test(p9));
  ok('linha alem do fim => marcada DEFASADA no packet', /linha 999999 citada no contrato — o arquivo tem \d+ linhas \(referencia DEFASADA/.test(p9));
  const c9 = sh('task-packet.sh', [t9, '--check']);
  ok('--check imprime TRECHOS ok e DEFASADA', /TRECHOS\|TASK-009\|api\/grande\.php:30-30\|ok/.test(c9.stdout) && /TRECHOS\|TASK-009\|api\/grande\.php:999999\|DEFASADA/.test(c9.stdout), c9.stdout);
}

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
if (!fail) { try { fs.rmSync(S, { recursive: true, force: true }); } catch {} }
process.exit(fail ? 1 : 0);
