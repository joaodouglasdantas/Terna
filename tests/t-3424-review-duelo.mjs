#!/usr/bin/env node
// tests/t-3424-review-duelo.mjs — bateria da 3.4.24 (Onda C, itens 10 e 11: preflight com validade
// do limite de uso, doctor "Codex fora ate", duelo SERIAL, remocao pelo placar, teto de turnos do
// --tools e tools off por modelo). Roda em SANDBOX proprio (projeto falso + HOME falso + CODEX_HOME
// falso em os.tmpdir()), SEM rede: o Codex e um script stub no PATH e o OpenRouter e um servidor
// HTTP local (HARNESS_OPENROUTER_URL). Precisa de node >= 18, bash (Git Bash), git e diff no PATH.
//   node tests/t-3424-review-duelo.mjs
// Porta do stub do OpenRouter: livre, escolhida por instancia (127.0.0.1); sandbox com sufixo do pid.

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3424-review-duelo-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const BIN = path.join(S, 'bin'), CODEX_HOME = path.join(S, 'codex');
// porta LIVRE por instancia (duas instancias da suite ao mesmo tempo — ex.: outro agente rodando tests/*.mjs —
// dividiam um stub so e trocavam o cenario uma da outra; medido 08/09)
const PORT = await new Promise((res) => { const s0 = http.createServer(); s0.listen(0, '127.0.0.1', () => { const p = s0.address().port; s0.close(() => res(p)); }); });
const toPosix = p => p.replace(/\\/g, '/');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1', CODEX_HOME, PATH: BIN + path.delimiter + process.env.PATH };

// ---------------------------------------------------------------- sandbox
fs.rmSync(S, { recursive: true, force: true });
for (const d of [path.join(PROJ, '.claude'), HOME, BIN, CODEX_HOME, path.join(PROJ, 'prds', '_metrics'), path.join(PROJ, 'prds', 'PRD-001-teste', 'tasks'), path.join(PROJ, 'api')]) fs.mkdirSync(d, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), [
  "HARNESS_RAG_ENABLED='0'", "HARNESS_DAEMON='off'", "HARNESS_FRENTES='off'", "HARNESS_PRESENCE_URL=''",
  "OPENROUTER_API_KEY='sk-or-teste'", `HARNESS_OPENROUTER_URL='http://127.0.0.1:${PORT}'`,
  "HARNESS_DUELO_TIMEOUT='60'", "HARNESS_DELEGATE_TIMEOUT='60'", "HARNESS_DELEGATE_PREFLIGHT_TIMEOUT='20'",
  // 3.4.25: a suite testa a MECANICA do pool com 3 titulares fixos — o pool real do mestre mudou (gemini-3.8, sem qwen-coder)
  "HARNESS_DUELO_MODELS='deepseek/deepseek-v4-flash-0731,google/gemini-3.7-flash,qwen/qwen3-coder-next'",
  "HARNESS_DUELO_SUPLENTES='qwen/qwen3.7-flash,anthropic/claude-haiku-4.5'", "",
].join('\n'));
fs.writeFileSync(path.join(PROJ, 'api', 'x.php'), '<?php\nfunction f() {\n    return 1;\n}\n');
fs.writeFileSync(path.join(PROJ, 'prds', 'PRD-001-teste', 'tasks', 'TASK-001-teste.md'), '# TASK-001 — teste\n\n| **Tipo** | backend |\n| **Duelo** | sim — mecanica |\n\n## Objetivo\n\nTrocar o retorno de `f()` em `api/x.php` para 2.\n\n## Arquivos afetados\n\n- `api/x.php`\n');
fs.writeFileSync(path.join(CODEX_HOME, 'auth.json'), '{"stub":true}\n');
const git = (...a) => spawnSync('git', a, { cwd: PROJ, encoding: 'utf8', env: ENVB });
git('init', '-q'); git('config', 'user.email', 'teste@beta'); git('config', 'user.name', 'teste');
fs.writeFileSync(path.join(PROJ, '.gitignore'), '.claude/.harness-run/\n');
git('add', '-A'); git('commit', '-qm', 'base');
console.log('sandbox:', PROJ);

// Codex STUB: le o modo em codex-mode.txt (limite | limite-sem-data | falha | ok), conta as invocacoes.
const CODEX_CALLS = path.join(S, 'codex-calls.txt'), CODEX_MODE = path.join(S, 'codex-mode.txt');
fs.writeFileSync(CODEX_CALLS, '');
const ateIso = new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
fs.writeFileSync(path.join(BIN, 'codex'), `#!/usr/bin/env bash
if [ "\${1:-}" = "--version" ]; then echo "codex-cli 0.0-stub"; exit 0; fi
echo x >> "${toPosix(CODEX_CALLS)}"
MODE="$(cat "${toPosix(CODEX_MODE)}" 2>/dev/null)"
case "$MODE" in
  ok) for a in "$@"; do [ "$prev" = "-o" ] && echo ok > "$a"; prev="$a"; done; exit 0 ;;
  config) echo 'ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The gpt-6-astra model requires a newer client. Please try again with a supported model."}}' >&2; exit 1 ;;
  limite-sem-data) echo "Error: You have hit your usage limit. Please try again later." >&2; exit 1 ;;
  limite) echo "Error: usage limit reached for this account. Resets at ${ateIso}." >&2; exit 1 ;;
  *) echo "Error: connection refused (stub)" >&2; exit 1 ;;
esac
`);
fs.chmodSync(path.join(BIN, 'codex'), 0o755);

// OpenRouter STUB: cenario em scenario.json; cada request vira uma linha em calls.jsonl.
const SCEN = path.join(S, 'scenario.json'), CALLS = path.join(S, 'calls.jsonl');
const cenario = (o) => { fs.writeFileSync(SCEN, JSON.stringify(o)); fs.writeFileSync(CALLS, ''); };
const chamadas = () => fs.readFileSync(CALLS, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const blocoOk = '### ARQUIVO: api/x.php\n<<<<<<< BUSCAR\nfunction f() {\n    return 1;\n}\n=======\nfunction f() {\n    return 2;\n}\n>>>>>>> FIM\n\n## Notas\n\nfeito.\n';
const blocoRuim = '### ARQUIVO: api/x.php\n<<<<<<< BUSCAR\nfunction nao_existe() {\n    return 9;\n}\n=======\nfunction nao_existe() {\n    return 10;\n}\n>>>>>>> FIM\n';
// O stub roda em OUTRO processo: spawnSync bloqueia o event loop deste, e um servidor aqui dentro
// nunca responderia ao broker (medido na 1a versao desta suite — todo fetch estourava o teto).
const STUB = path.join(S, 'stub-openrouter.mjs');
fs.writeFileSync(STUB, `
import fs from 'fs'; import http from 'http';
const [PORT, SCEN, CALLS] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
const blocoOk = ${JSON.stringify(blocoOk)};
const blocoRuim = ${JSON.stringify(blocoRuim)};
http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c);
  req.on('end', () => {
    if (req.url.endsWith('/auth/key')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"data":{"label":"stub"}}'); }
    let b = {}; try { b = JSON.parse(body); } catch {}
    let sc = {}; try { sc = JSON.parse(fs.readFileSync(SCEN, 'utf8')); } catch {}
    const txt = (b.messages || []).map(m => typeof m.content === 'string' ? m.content : '').join(String.fromCharCode(10));
    const lado = (txt.match(new RegExp('TASK-001-(A|B) / ciclo')) || [])[1] || null;
    const comTools = !!b.tools;
    fs.appendFileSync(CALLS, JSON.stringify({ lado, comTools, model: b.model, n: (b.messages || []).length }) + String.fromCharCode(10));
    let msg, finish = 'stop';
    if (sc.modo === 'tools' && comTools) {
      msg = { role: 'assistant', content: '', tool_calls: [{ id: 'call_' + Date.now(), type: 'function', function: { name: 'read_file', arguments: '{"path":"api/x.php"}' } }] }; finish = 'tool_calls';
    } else if (sc.modo === 'tools') {
      msg = { role: 'assistant', content: 'RESULTADO FINAL apos o teto: ' + blocoOk };
    } else {
      const q = sc[lado || 'A'] || 'ok';
      msg = { role: 'assistant', content: q === 'ok' ? blocoOk : blocoRuim };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'stub', model: b.model, provider: 'stub', choices: [{ message: msg, finish_reason: finish }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001, prompt_tokens_details: { cached_tokens: 40 } } }));
  });
}).on('error', e => { process.stderr.write('stub: ' + e.message + String.fromCharCode(10)); process.exit(1); }).listen(PORT, '127.0.0.1');
`);
const stub = spawn(process.execPath, [STUB, String(PORT), SCEN, CALLS], { stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true });
const esperaPorta = () => new Promise((resolve, reject) => { let n = 0; const tenta = () => { const rq = http.get({ host: '127.0.0.1', port: PORT, path: '/auth/key' }, res => { res.resume(); resolve(); }); rq.on('error', () => { if (++n > 50) reject(new Error('stub nao subiu')); else setTimeout(tenta, 100); }); }; tenta(); });
await esperaPorta();

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, extra); } };
const sh = (file, args, env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const LOCAL = path.join(PROJ, '.claude', 'harness.env.local');
const LOCAL0 = fs.readFileSync(LOCAL, 'utf8');
const comKnob = (linha, fn) => { fs.writeFileSync(LOCAL, LOCAL0 + linha + '\n'); try { return fn(); } finally { fs.writeFileSync(LOCAL, LOCAL0); } };
const RUN = path.join(PROJ, '.claude', '.harness-run');
const PF = path.join(RUN, 'preflight-codex-cli.status');
const nCodex = () => fs.readFileSync(CODEX_CALLS, 'utf8').split('\n').filter(Boolean).length;
const METRICS = path.join(PROJ, 'prds', '_metrics', 'harness-duelos.jsonl');
const eventos = () => fs.existsSync(METRICS) ? fs.readFileSync(METRICS, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

console.log('\n== T1 preflight codex-cli com LIMITE DE USO (item 10a) ==');
fs.writeFileSync(CODEX_MODE, 'falha');
let r = sh('harness-delegate.sh', ['--preflight', 'codex-cli']);
ok('falha comum => indisponivel sem ate=', r.status === 10 && /^PREFLIGHT\|indisponivel\|codex-cli\|ping falhou/.test(r.stdout) && !fs.readFileSync(PF, 'utf8').includes('ate='), r.stdout + r.stderr.slice(-200));
// 3.4.33b: erro de CONFIG (400 invalid_request, modelo invalido) NAO e limite — sem ate=, motivo CONFIG
fs.writeFileSync(CODEX_MODE, 'config');
r = sh('harness-delegate.sh', ['--preflight', 'codex-cli', '--force']);
ok('config invalida (400 invalid_request) => indisponivel com motivo CONFIG e SEM ate=', r.status === 10 && /CONFIG invalida/.test(r.stdout + r.stderr) && !fs.readFileSync(PF, 'utf8').includes('ate='), r.stdout + r.stderr.slice(-300));

fs.writeFileSync(CODEX_MODE, 'limite');
r = sh('harness-delegate.sh', ['--preflight', 'codex-cli', '--force']);
const st = fs.readFileSync(PF, 'utf8');
const ate = Number((st.match(/^ate=(\d+)/m) || [])[1] || 0);
ok('limite com data => PREFLIGHT|indisponivel|codex-cli|limite-ate <data>', r.status === 10 && /^PREFLIGHT\|indisponivel\|codex-cli\|limite-ate \d\d\/\d\d \d\d:\d\d/.test(r.stdout), r.stdout + r.stderr.slice(-300));
ok('status grava ate= (parse da data da mensagem, ~ +3 h)', ate > 0 && Math.abs(ate - (Date.now() / 1000 + 3 * 3600)) < 180, st);
ok('linha 1 do status continua no formato <ts>|falha|<motivo>', /^\d+\|falha\|limite de uso ate /.test(st), st);
const antes = nCodex();
r = sh('harness-delegate.sh', ['--preflight', 'codex-cli']);
ok('chamada seguinte NAO pinga e devolve limite-ate', r.status === 10 && r.stdout.includes('limite-ate') && nCodex() === antes, `${r.stdout} calls=${nCodex()}/${antes}`);
// TTL de 30 min nao se aplica: envelhece a linha 1 em 2 h e o veredito continua valendo
fs.writeFileSync(PF, st.replace(/^\d+\|/, (Math.floor(Date.now() / 1000) - 7200) + '|'));
r = sh('harness-delegate.sh', ['--preflight', 'codex-cli']);
ok('com o TTL de 30 min vencido o ate= ainda vale (sem ping)', r.status === 10 && r.stdout.includes('limite-ate') && nCodex() === antes, r.stdout);
r = sh('harness-delegate.sh', ['--preflight', 'codex-cli', '--force']);
ok('--force pinga de novo', nCodex() === antes + 1 && r.stdout.includes('limite-ate'), `calls=${nCodex()}`);
// breaker: delegacao real ao codex-cli e recusada na hora, sem invocar o binario
fs.writeFileSync(path.join(RUN, 'env.md'), 'Diga ok.\n');
const antes2 = nCodex();
r = sh('harness-delegate.sh', ['--executor', 'codex-cli', '--role', 'atlas', '--label', 'PRD-001', '--prompt-file', '.claude/.harness-run/env.md']);
ok('breaker: delegacao recusada pelo ate= sem invocar o codex', r.status === 10 && r.stdout.startsWith('DELEGACAO|indisponivel|codex-cli') && r.stderr.includes('LIMITE DE USO') && nCodex() === antes2, r.stdout + r.stderr.slice(-200));
// sem data na mensagem => +24 h
fs.writeFileSync(CODEX_MODE, 'limite-sem-data');
r = sh('harness-delegate.sh', ['--preflight', 'codex-cli', '--force']);
const ate24 = Number((fs.readFileSync(PF, 'utf8').match(/^ate=(\d+)/m) || [])[1] || 0);
ok('limite SEM data => ate = agora + 24 h', Math.abs(ate24 - (Date.now() / 1000 + 24 * 3600)) < 180, String(ate24));
// ate no passado => pinga normalmente (limite expirou)
fs.writeFileSync(PF, `${Math.floor(Date.now() / 1000) - 7200}|falha|limite de uso\nate=${Math.floor(Date.now() / 1000) - 60}\n`);
fs.writeFileSync(CODEX_MODE, 'ok');
r = sh('harness-delegate.sh', ['--preflight', 'codex-cli']);
ok('ate= no passado => pinga e volta a ok', r.status === 0 && r.stdout === 'PREFLIGHT|ok|codex-cli|\n' && !fs.readFileSync(PF, 'utf8').includes('ate='), r.stdout + r.stderr.slice(-200));

console.log('\n== T2 doctor-cached anuncia "Codex fora ate" ==');
fs.writeFileSync(PF, `${Math.floor(Date.now() / 1000)}|falha|limite de uso\nate=${Math.floor(Date.now() / 1000) + 5 * 3600}\n`);
fs.writeFileSync(path.join(RUN, 'doctor.cache'), '(doctor sem achados — cache do teste)\n');
r = sh('doctor-cached.sh', []);
ok('doctor imprime [doctor] Codex fora até <data> — review em SOLO-2', /\[doctor\] Codex fora até \d\d\/\d\d \d\d:\d\d .*SOLO-2/.test(r.stdout), r.stdout);
fs.writeFileSync(PF, `${Math.floor(Date.now() / 1000)}|ok|\n`);
r = sh('doctor-cached.sh', []);
ok('sem ate= o doctor nao anuncia', !r.stdout.includes('Codex fora'), r.stdout);

console.log('\n== T3 --tools: teto de turnos e tools off por modelo (item 11b) ==');
const envelope = path.join(RUN, 'tools.md'); fs.writeFileSync(envelope, 'Leia api/x.php e devolva o diff.\n');
cenario({ modo: 'tools' });
r = sh('harness-delegate.sh', ['--executor', 'openrouter', '--model', 'stub/loop', '--role', 'duelo-worker', '--task', 'T1', '--label', 'PRD-001', '--prompt-file', '.claude/.harness-run/tools.md', '--tools', '--output', '.claude/.harness-run/tools-out.md']);
let ev = {}; try { ev = JSON.parse(fs.readFileSync(path.join(RUN, 'delegations', 'PRD-001', 'T1-openrouter-c1.events.jsonl'), 'utf8').trim()); } catch {}
let c = chamadas();
ok('loop encerra no 4o turno e pede o final sem tools (5 chamadas: 4 com tools + 1 sem)', r.status === 0 && c.length === 5 && c.slice(0, 4).every(x => x.comTools) && !c[4].comTools, `${r.status} ${JSON.stringify(c)} ${r.stderr.slice(-200)}`);
// turns=5 (4 com tools + 1 final); tool_calls=3 (a 4a resposta com tool_calls e a que bate o teto — nao e atendida)
ok('evento: turns=5, tool_calls=3, teto_turnos=1, tools=1, cached_tokens medido', ev.turns === 5 && ev.tool_calls === 3 && ev.teto_turnos === 1 && ev.tools === 1 && ev.usage && ev.usage.cached_tokens === 200, JSON.stringify(ev));
ok('relatorio traz o resultado final', fs.readFileSync(path.join(RUN, 'tools-out.md'), 'utf8').includes('RESULTADO FINAL'));
ok('broker fecha em DELEGACAO|ok (sem crash de exit no Windows apos 5 turnos)', r.stdout.startsWith('DELEGACAO|ok|openrouter|'), r.stdout + r.stderr.slice(-300));
cenario({ modo: 'tools' });
r = sh('harness-delegate.sh', ['--executor', 'openrouter', '--model', 'qwen/qwen3-coder-next', '--role', 'duelo-worker', '--task', 'T2', '--label', 'PRD-001', '--prompt-file', '.claude/.harness-run/tools.md', '--tools', '--output', '.claude/.harness-run/tools-out2.md']);
c = chamadas();
ok('modelo em HARNESS_DELEGATE_TOOLS_OFF_MODELS roda SEM tools (1 chamada, sem campo tools)', r.status === 0 && c.length === 1 && !c[0].comTools && r.stderr.includes('tools desligadas'), `${r.status} ${JSON.stringify(c)} ${r.stderr.slice(-200)}`);
comKnob("HARNESS_DELEGATE_TOOLS='off'", () => {
  cenario({ modo: 'tools' });
  const x = sh('harness-delegate.sh', ['--executor', 'openrouter', '--model', 'stub/loop', '--role', 'duelo-worker', '--task', 'T3', '--label', 'PRD-001', '--prompt-file', '.claude/.harness-run/tools.md', '--tools', '--output', '.claude/.harness-run/tools-out3.md']);
  const cc = chamadas();
  ok('HARNESS_DELEGATE_TOOLS=off => completion cega para todos', x.status === 0 && cc.length === 1 && !cc[0].comTools, JSON.stringify(cc));
});
comKnob("HARNESS_DELEGATE_TOOLS_MAX_TURNOS='2'", () => {
  cenario({ modo: 'tools' });
  sh('harness-delegate.sh', ['--executor', 'openrouter', '--model', 'stub/loop', '--role', 'duelo-worker', '--task', 'T4', '--label', 'PRD-001', '--prompt-file', '.claude/.harness-run/tools.md', '--tools', '--output', '.claude/.harness-run/tools-out4.md']);
  const cc = chamadas();
  ok('knob do teto = 2 => 3 chamadas', cc.length === 3 && !cc[2].comTools, JSON.stringify(cc));
});

console.log('\n== T4 duelo SERIAL (item 11a) ==');
const TASK = 'prds/PRD-001-teste/tasks/TASK-001-teste.md';
const duelo = (env = {}) => sh('harness-duelo.sh', ['--task', TASK, '--label', 'PRD-001'], env);
const ultimoDuelo = () => eventos().filter(e => e.ev === 'duelo').pop() || {};
const ultimoVer = () => eventos().filter(e => e.ev === 'veredito').pop() || {};
fs.rmSync(METRICS, { force: true });
cenario({ modo: 'duelo', A: 'ok', B: 'ok' });
r = duelo();
c = chamadas(); let d = ultimoDuelo(), v = ultimoVer();
ok('A aplicavel => B NAO e chamado; vencedor A por W.O. serial', /^DUELO\|ok\|[^|]+\|A\|/.test(r.stdout) && c.length === 1 && c[0].lado === 'A', `${r.stdout} ${JSON.stringify(c)} ${r.stderr.slice(-400)}`);
ok('evento duelo: serial=on, pulou_b=1, status_b=pulado, aplica_a=sim', d.serial === 'on' && d.pulou_b === '1' && d.status_b === 'pulado' && d.aplica_a === 'sim' && d.aplica_b === 'nao', JSON.stringify(d));
ok('veredito auto com motivo serial', v.juiz === 'auto' && v.vencedor === 'A' && /serial/.test(v.motivo), JSON.stringify(v));
// o caminho volta no formato do Git Bash (/tmp/... no Windows) — conferir pelo proprio bash
ok('diff do vencedor passa no git apply --check', spawnSync('bash', ['-c', 'cd "$0" && git apply --check "$1"', PROJ, r.stdout.trim().split('|')[4]], { encoding: 'utf8', env: ENVB }).status === 0, r.stdout);
cenario({ modo: 'duelo', A: 'bad', B: 'ok' });
r = duelo();
c = chamadas(); d = ultimoDuelo();
ok('A inaplicavel => B e chamado e vence', /^DUELO\|ok\|[^|]+\|B\|/.test(r.stdout) && c.length === 2 && c[0].lado === 'A' && c[1].lado === 'B', `${r.stdout} ${JSON.stringify(c)}`);
ok('evento: pulou_b=0, aplica_a=nao, aplica_b=sim', d.pulou_b === '0' && d.aplica_a === 'nao' && d.aplica_b === 'sim', JSON.stringify(d));
cenario({ modo: 'duelo', A: 'bad', B: 'bad' });
r = duelo();
c = chamadas(); v = ultimoVer();
ok('os dois inaplicaveis => reprovado/nenhum SEM juiz', /^DUELO\|reprovado\|[^|]+\|nenhum\|/.test(r.stdout) && c.length === 2 && v.vencedor === 'nenhum' && v.juiz === 'auto', `${r.stdout} ${JSON.stringify(c)}`);
comKnob("HARNESS_DUELO_SERIAL='off'", () => {
  cenario({ modo: 'duelo', A: 'ok', B: 'ok' });
  const x = duelo(); const cc = chamadas(); const dd = ultimoDuelo();
  ok('serial=off => os dois chamados e o juiz (themis) e acionado', /^DUELO\|julgar\|[^|]+\|themis\|/.test(x.stdout) && cc.length === 2 && dd.serial === 'off' && dd.pulou_b === '0' && dd.aplica_a === 'sim' && dd.aplica_b === 'sim', `${x.stdout} ${JSON.stringify(cc)} ${x.stderr.slice(-300)}`);
});

console.log('\n== T5 placar REMOVE o modelo que cruza a regua (item 11d) ==');
const POOL = ['deepseek/deepseek-v4-flash-0731', 'google/gemini-3.7-flash', 'qwen/qwen3-coder-next'];
const RUIM = 'qwen/qwen3-coder-next';
const historico = (n) => {   // n duelos era TASK-: qwen sempre em B, 0 vitorias, 5 inaplicaveis (regua: n>=5, na>40%)
  const L = [];
  for (let i = 0; i < n; i++) {
    const id = `PRD-000-TASK-00${i}-00000${i}`;
    L.push({ ev: 'duelo', id, ts: '2026-09-0' + (1 + (i % 7)) + 'T10:00:00', label: 'PRD-000', task: 'TASK-00' + i, modelo_a: POOL[i % 2], modelo_b: RUIM, status_a: 'ok', status_b: 'ok', aplica_a: 'sim', aplica_b: i < 5 ? 'nao' : 'sim', custo_a: 0.01, custo_b: 0.05, dur_a: 10, dur_b: 30, juiz: 'themis', packet_bytes: 1000 });
    L.push({ ev: 'veredito', id, ts: '2026-09-01T10:01:00', juiz: 'auto', vencedor: 'A', nota_a: null, nota_b: null, motivo: 'W.O.' });
  }
  fs.writeFileSync(METRICS, L.map(x => JSON.stringify(x)).join('\n') + '\n');
};
historico(6);
cenario({ modo: 'duelo', A: 'ok', B: 'ok' });
r = duelo();
let pool = eventos().filter(e => e.ev === 'pool').pop() || {}; d = ultimoDuelo();
ok('evento pool com removido=<modelo> (6 duelos, 0 vitorias, 5 inaplicaveis)', pool.removido === RUIM && pool.fora === RUIM && /removido do pool/.test(pool.motivo), JSON.stringify(pool));
ok('o duelo roda sem o removido', d.modelo_a !== RUIM && d.modelo_b !== RUIM && d.modelo_a && d.modelo_b, JSON.stringify(d));
ok('stderr registra REMOVIDO pelo placar', r.stderr.includes('REMOVIDO pelo placar'), r.stderr.slice(-400));
// 4o duelo = rodizio de exploracao (K=7 => 7%4=3): o removido NAO volta
historico(7);
cenario({ modo: 'duelo', A: 'ok', B: 'ok' });
r = duelo(); d = ultimoDuelo();
ok('rodizio de exploracao (K%4==3) nao traz o removido de volta', d.modelo_a !== RUIM && d.modelo_b !== RUIM, JSON.stringify(d) + r.stderr.slice(-300));
comKnob("HARNESS_DUELO_PLACAR_REMOVE='off'", () => {
  historico(7);
  cenario({ modo: 'duelo', A: 'ok', B: 'ok' });
  const x = duelo(); const dd = ultimoDuelo(); const pp = eventos().filter(e => e.ev === 'pool').pop() || {};
  ok('knob off => rodizio de exploracao reabilita o rebaixado (comportamento 3.4.0) e pool sem removido', (dd.modelo_a === RUIM || dd.modelo_b === RUIM) && pp.removido === '' && pp.fora === RUIM, JSON.stringify(dd) + JSON.stringify(pp) + x.stderr.slice(-200));
});
// pool esvaziado: 2 dos 3 cruzam a regua e nao ha suplente utilizavel => indisponivel (nunca reabilitar)
comKnob("HARNESS_DUELO_SUPLENTES=''", () => {
  const L = [];
  for (let i = 0; i < 6; i++) { const id = `PRD-000-TASK-01${i}-00001${i}`; L.push({ ev: 'duelo', id, ts: '2026-09-01T10:00:00', label: 'PRD-000', task: 'TASK-01' + i, modelo_a: POOL[1], modelo_b: RUIM, status_a: 'ok', status_b: 'ok', aplica_a: 'nao', aplica_b: 'nao', juiz: 'themis' }); L.push({ ev: 'veredito', id, ts: '2026-09-01T10:01:00', juiz: 'auto', vencedor: 'nenhum', motivo: 'x' }); }
  fs.writeFileSync(METRICS, L.map(x => JSON.stringify(x)).join('\n') + '\n');
  cenario({ modo: 'duelo', A: 'ok', B: 'ok' });
  const x = duelo();
  ok('sobrou < 2 sem suplente => DUELO|indisponivel (nunca reabilita o reprovado)', /^DUELO\|indisponivel\|/.test(x.stdout) && chamadas().length === 0, x.stdout + x.stderr.slice(-300));
});
// lado "pulado" nao conta no placar do modelo B
{
  const L = [];
  for (let i = 0; i < 6; i++) { const id = `PRD-000-TASK-02${i}-00002${i}`; L.push({ ev: 'duelo', id, ts: '2026-09-01T10:00:00', label: 'PRD-000', task: 'TASK-02' + i, modelo_a: POOL[0], modelo_b: RUIM, status_a: 'ok', status_b: 'pulado', aplica_a: 'sim', aplica_b: 'nao', juiz: 'themis', serial: 'on', pulou_b: '1' }); L.push({ ev: 'veredito', id, ts: '2026-09-01T10:01:00', juiz: 'auto', vencedor: 'A', motivo: 'serial' }); }
  fs.writeFileSync(METRICS, L.map(x => JSON.stringify(x)).join('\n') + '\n');
  cenario({ modo: 'duelo', A: 'ok', B: 'ok' });
  r = duelo(); pool = eventos().filter(e => e.ev === 'pool').pop() || {};
  ok('B "pulado" (serial) nao conta como inaplicavel: nenhum evento pool', !pool.ev && /^DUELO\|ok\|/.test(r.stdout), JSON.stringify(pool) + r.stdout);
}

console.log('\n== T6 sintaxe e prosa das skills/agente (SOLO-2) ==');
for (const f of ['harness-delegate.sh', 'harness-duelo.sh', 'doctor-cached.sh']) { const x = spawnSync('bash', ['-n', path.join(MASTER, '.claude', 'hooks', f)], { encoding: 'utf8' }); ok(`bash -n ${f}`, x.status === 0, x.stderr); }
const sherlock = fs.readFileSync(path.join(MASTER, '.claude', 'agents', 'sherlock.md'), 'utf8');
ok('sherlock.md: Lente A|B|completa + regra de cobertura + confianca', /Lente: A\|B\|completa/.test(sherlock) && /Regra de COBERTURA/.test(sherlock) && /\*\*Confiança:\*\* alta \| média \| baixa/.test(sherlock) && !/\*\*Em dúvida, Sugestão\*\*/.test(sherlock));
ok('sherlock.md: sem teto de folego nem contagem no prompt', !/teto de d+/.test(sherlock) && !/HARNESS_FOLEGO/.test(sherlock) && !/contagem regressiva/.test(sherlock));
const prdExec = fs.readFileSync(path.join(MASTER, '.claude', 'skills', 'prd-exec', 'SKILL.md'), 'utf8');
ok('prd-exec Fase 2: SOLO-2 na tabela, limite-ate, --review-modo, Modo: no Output', /\*\*SOLO-2\*\* \(3\.4\.24\)/.test(prdExec) && /limite-ate/.test(prdExec) && /--review-modo=<dupla\|solo-2\|solo\|partes>/.test(prdExec) && /- Modo: <DUPLA-CEGA \| SOLO-2/.test(prdExec));
const cr = fs.readFileSync(path.join(MASTER, '.claude', 'skills', 'codex-review', 'SKILL.md'), 'utf8');
ok('codex-review: SOLO-2 + limite-ate + Lente: A/B', /SOLO-2/.test(cr) && /limite-ate/.test(cr) && /Lente: A/.test(cr) && /Lente: B/.test(cr));
const dt = fs.readFileSync(path.join(MASTER, '.claude', 'skills', 'dt-exec', 'SKILL.md'), 'utf8');
ok('dt-exec: SOLO-2 + --review-modo', /SOLO-2/.test(dt) && /--review-modo=/.test(dt));
const envTxt = fs.readFileSync(path.join(MASTER, '.claude', 'harness.env'), 'utf8');
ok('harness.env: knobs novos ligados por padrao', /^HARNESS_DUELO_SERIAL='on'/m.test(envTxt) && /^HARNESS_DUELO_PLACAR_REMOVE='on'/m.test(envTxt) && /^HARNESS_DELEGATE_TOOLS_MAX_TURNOS='4'/m.test(envTxt) && /^HARNESS_DELEGATE_TOOLS_OFF_MODELS='qwen\/qwen3-coder-next'/m.test(envTxt) && /HARNESS_DELEGATE_LIMITE_H/.test(envTxt));

stub.kill();
console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
if (!fail) { try { fs.rmSync(S, { recursive: true, force: true }); } catch {} }   // verde = sandbox some; vermelho = fica para inspecao
process.exit(fail ? 1 : 0);
