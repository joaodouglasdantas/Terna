#!/usr/bin/env node
// tests/t-3421-maquina.mjs — bateria da 3.4.21 (GUARDA 0, presenca in-process, daemon, frentes, sessoes).
// Roda em SANDBOX proprio (projeto falso + HOME falso em os.tmpdir()), nunca toca o projeto real nem o
// ~/.harness-run da maquina. Precisa de node >= 18 e curl no PATH.
//   node tests/t-3421-maquina.mjs            (a partir da raiz do harness mestre ou de qualquer projeto)
// Portas de teste: 47899 (daemon) e 47998 (receptor de presenca) — ambas em 127.0.0.1.

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3421-sandbox');
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };

// ---------------------------------------------------------------- sandbox
fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), "HARNESS_DAEMON_PORT='47899'\nHARNESS_PRESENCE_URL='http://127.0.0.1:47998/ping'\nHARNESS_PRESENCE_THROTTLE_MIN='1'\n");
fs.writeFileSync(path.join(PROJ, 'arquivo.txt'), 'x\n');
console.log('sandbox:', PROJ);

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, extra); } };
const run = (file, args, input, env = {}) => spawnSync(process.execPath, [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env }, windowsHide: true });
const limpaEspiral = () => fs.rmSync(path.join(PROJ, '.claude', '.harness-run', 'exec-attempts'), { recursive: true, force: true });
const payload = (cmd, sub = true, extra = {}) => JSON.stringify({ session_id: 'sess-1111-2222', cwd: PROJ, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd },
  transcript_path: sub ? 'C:/Users/x/.claude/projects/p/sess-1111-2222/subagents/agent-abcdef1234.jsonl' : 'C:/Users/x/.claude/projects/p/sess-1111-2222.jsonl', ...extra });
run('harness-daemon.mjs', ['--stop'], '');   // resto de rodada anterior

console.log('\n== T1 guard-bash GUARDA 0 (leitura via Bash) ==');
const casos = [
  ['cat arquivo.txt', true, 2, 'Read'], ['head -20 arquivo.txt', true, 2, 'limit=20'], ['cd .claude && grep -n "foo" hooks/x.sh', true, 2, 'Grep'],
  ['grep -rn "x" . | wc -l', true, 2, 'Grep'], ['grep -c "x" a.txt', true, 2, 'count'], ['grep -rn "x" . | awk "{print $1}"', true, 0, ''],
  ['php -l arquivo.php', true, 0, ''], ['git status --porcelain', true, 0, ''], ['sed -n "10,20p" arquivo.txt', true, 2, 'offset=10 limit=11'],
  ['sed -i "s/a/b/" arquivo.txt', true, 0, ''], ['find . -name "*.php"', true, 2, 'Glob'], ['find . -name "*.php" -exec rm {} \\;', true, 0, ''],
  ['ls -la .claude/hooks', true, 2, 'Glob'], ['echo oi', true, 0, ''], ['wc -l arquivo.txt', true, 2, 'count'], ['FOO=1 cat arquivo.txt', true, 0, ''],
  ['cat arquivo.txt', false, 0, ''], ['cat > /tmp/x.txt', true, 2, 'FORA do projeto'], ['cat arquivo.txt > .claude/.harness-run/tmp/x', true, 0, ''],
  ['npx playwright test x.spec.js', true, 0, ''], ['ls', true, 2, 'Glob pattern="*"'], ['mysql -u root -e "select 1"', true, 0, ''],
];
for (const [cmd, sub, exp, dica] of casos) {
  limpaEspiral();
  const r = run('guard-bash.mjs', [], payload(cmd, sub));
  const cond = r.status === exp && (!dica || (r.stderr + r.stdout).includes(dica));
  ok(`pre ${sub ? 'sub' : 'pai'} [${cmd}] => ${exp}`, cond, `got ${r.status} :: ${(r.stderr || r.stdout).slice(0, 160).replace(/\n/g, ' ')}`);
}
// knobs: o harness.env do mestre declara HARNESS_GUARD_READ_VIA_BASH/HARNESS_FRENTES, e arquivo
// vence ambiente (paridade com `source`) — os casos de knob vao pelo harness.env.local do sandbox
const LOCAL = path.join(PROJ, '.claude', 'harness.env.local');
const LOCAL0 = fs.readFileSync(LOCAL, 'utf8');
const comKnob = (linha, fn) => { fs.writeFileSync(LOCAL, LOCAL0 + linha + '\n'); try { return fn(); } finally { fs.writeFileSync(LOCAL, LOCAL0); } };
limpaEspiral();
comKnob("HARNESS_GUARD_READ_VIA_BASH='off'", () => { const r = run('guard-bash.mjs', [], payload('cat arquivo.txt', true)); ok('knob off => 0 (dica antiga no stdout)', r.status === 0 && r.stdout.includes('additionalContext'), r.stdout.slice(0, 80)); });
comKnob("HARNESS_GUARD_READ_VIA_BASH='todos'", () => { const r = run('guard-bash.mjs', [], payload('cat arquivo.txt', false)); ok('knob todos => nega tambem a sessao pai', r.status === 2, String(r.status)); });
ok('telemetria guard-bash-leitura.jsonl gravada', fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'guard-bash-leitura.jsonl')));

console.log('\n== T2 guard-bash --post roda a presenca no mesmo processo ==');
const recebidos = [];
const srv = http.createServer((req, res) => { let d = ''; req.on('data', c => d += c); req.on('end', () => { recebidos.push(d); res.writeHead(200); res.end('ok'); }); });
await new Promise(r => srv.listen(47998, '127.0.0.1', r));
run('presence.mjs', ['--start'], payload('x', false));                       // marcador pendente
const r2 = run('guard-bash.mjs', ['--post'], payload('echo oi', false));   // 1o prompt => start real
ok('post exit 0', r2.status === 0, String(r2.status) + r2.stderr);
await new Promise(r => setTimeout(r, 2500));
ok('presenca enviada pelo filho detached (payload v1 chegou no servidor)', recebidos.some(x => x.includes('"evento":"start"') && x.includes('"session":"sess-1111-2222"')), JSON.stringify(recebidos).slice(0, 200));
const lastPing = fs.readdirSync(path.join(PROJ, '.claude', '.harness-run')).filter(f => f.startsWith('presence-last-ping-'));
ok('carimbo de throttle gravado', lastPing.length >= 1, lastPing.join(','));
const n0 = recebidos.length;
run('guard-bash.mjs', ['--post'], payload('echo de novo', false));
await new Promise(r => setTimeout(r, 1200));
ok('2o post dentro do throttle NAO envia', recebidos.length === n0, `${n0} -> ${recebidos.length}`);

console.log('\n== T3 daemon ==');
const ens = run('harness-daemon.mjs', ['--ensure', PROJ], '');
ok('--ensure sobe e escreve marcador', ens.stdout.includes('ativo') && fs.existsSync(path.join(PROJ, '.claude', '.harness-run', 'daemon.on')), ens.stdout + ens.stderr);
const post = (p, body) => new Promise((resolve) => { const req = http.request({ host: '127.0.0.1', port: 47899, path: p, method: 'POST' }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); }); req.on('error', () => resolve(null)); req.end(body); });
const d1 = await post('/h/PreToolUse/guard-bash', payload('cat arquivo.txt', true));
ok('daemon: leitura em subagente => JSON deny', d1 && d1.status === 200 && d1.body.includes('"permissionDecision":"deny"') && d1.body.includes('Read'), JSON.stringify(d1).slice(0, 200));
const d2 = await post('/h/PreToolUse/guard-bash', payload('php -l a.php', true));
ok('daemon: comando de execucao passa (200, vazio)', d2 && d2.status === 200 && d2.body === '', JSON.stringify(d2));
const d3 = await post('/h/PreToolUse/guard-bash', payload('cat > /tmp/x', true));
ok('daemon: GUARDA 1 (temporario fora) => deny', d3 && d3.body.includes('deny') && d3.body.includes('FORA'), JSON.stringify(d3).slice(0, 160));
const d4 = await post('/h/PostToolUse/guard-bash-post', payload('echo x', false, { session_id: 'sess-daemon-4444' }));
ok('daemon: post => 200', d4 && d4.status === 200, JSON.stringify(d4));
const d5 = await post('/h/UserPromptSubmit/presence', payload('', false, { session_id: 'sess-daemon-5555' }));
ok('daemon: presence => 200', d5 && d5.status === 200, JSON.stringify(d5));
const d6 = await post('/h/PreToolUse/guard-bash', JSON.stringify({ cwd: 'C:/nao/existe', tool_input: { command: 'cat x' } }));
ok('daemon: cwd sem harness => 404 (curl -f cai no fallback)', d6 && d6.status === 404, JSON.stringify(d6));
await new Promise(r => setTimeout(r, 1500));
ok('daemon: presenca in-process chegou ao servidor', recebidos.length > n0, `${n0} -> ${recebidos.length}`);
const st = run('harness-daemon.mjs', ['--status'], '');
ok('--status ativo com contagem', st.stdout.includes('DAEMON|ativo') && /requests=\d+/.test(st.stdout), st.stdout);
const curl = spawnSync('curl', ['-sf', '-m', '8', '--data-binary', '@-', 'http://127.0.0.1:47899/h/PreToolUse/guard-bash'], { input: payload('grep -n x arquivo.txt', true), encoding: 'utf8' });
ok('curl -sf (como no settings) devolve o deny JSON', curl.status === 0 && curl.stdout.includes('deny') && curl.stdout.includes('Grep'), `${curl.status} ${curl.stdout.slice(0, 120)}`);
const curl404 = spawnSync('curl', ['-sf', '-m', '8', '--data-binary', '@-', 'http://127.0.0.1:47899/h/PreToolUse/naoexiste'], { input: payload('x', true), encoding: 'utf8' });
ok('curl -sf em rota inexistente falha (exit != 0) => fallback', curl404.status !== 0, String(curl404.status));
fs.appendFileSync(path.join(HOOKS, 'presence.mjs'), '\n// teste hash\n');
const ens2 = run('harness-daemon.mjs', ['--ensure', PROJ], '');
const st2 = run('harness-daemon.mjs', ['--status'], '');
ok('--ensure reinicia quando o hash dos hooks muda', ens2.stdout.includes('ativo') && !st2.stdout.includes((st.stdout.match(/hooks=([0-9a-f]+)/) || [])[1] || 'zzz'), ens2.stdout + ' | ' + st2.stdout);
const stp = run('harness-daemon.mjs', ['--stop'], '');
ok('--stop', stp.stdout.includes('DAEMON|parado'), stp.stdout);
await new Promise(r => setTimeout(r, 500));
ok('apos stop: --status inativo', run('harness-daemon.mjs', ['--status'], '').stdout.includes('inativo'));
srv.close();

console.log('\n== T4 frentes ==');
// HARNESS_FRENTES_MAX nao esta declarado no harness.env (so comentado) => o ambiente vale
const fr = (a, env = {}) => run('frentes.mjs', a, '', { HARNESS_FRENTES_MAX: '1', ...env });
const a1 = fr(['acquire', '--label', 'PRD-901', '--session', 'sessA', '--projeto', 'p1']);
ok('acquire 1/1', a1.status === 0 && a1.stdout.includes('FRENTES|ok|1/1|PRD-901'), a1.stdout);
const a2 = fr(['acquire', '--label', 'PRD-902', '--session', 'sessB', '--projeto', 'p2']);
ok('2o acquire => cheio (exit 3) com dono', a2.status === 3 && a2.stdout.includes('cheio') && a2.stdout.includes('PRD-901@p1'), a2.stdout);
const a3 = fr(['acquire', '--label', 'PRD-901-exec', '--session', 'sessA']);
ok('re-acquire do dono (rotulo -exec normalizado) renova', a3.status === 0 && a3.stdout.includes('renovado'), a3.stdout);
const h1 = fr(['heartbeat', '--session', 'sessA']); ok('heartbeat por sessao', h1.stdout.includes('heartbeat'), h1.stdout);
const s1 = fr(['status']); ok('status lista o slot', s1.stdout.includes('FRENTE|PRD-901|p1|sessA'), s1.stdout);
const rl = fr(['release', '--label', 'PRD-901-exec']); ok('release (rotulo -exec normalizado)', rl.stdout.includes('liberado'), rl.stdout);
const w1 = fr(['wait', '--label', 'PRD-902', '--session', 'sessB', '--max-min', '1', '--intervalo-s', '1']);
ok('wait com slot livre adquire na hora', w1.status === 0 && w1.stdout.includes('FRENTES|ok'), w1.stdout);
const sf = path.join(HOME, '.harness-run', 'frentes', 'PRD-902.json'); const o = JSON.parse(fs.readFileSync(sf, 'utf8')); o.heartbeat = Date.now() - 60 * 60000; fs.writeFileSync(sf, JSON.stringify(o));
const a4 = fr(['acquire', '--label', 'PRD-903', '--session', 'sessC']);
ok('slot stale (60 min) e removido e o novo entra', a4.status === 0 && a4.stdout.includes('1/1'), a4.stdout);
comKnob("HARNESS_FRENTES='off'", () => { const off = fr(['acquire', '--label', 'PRD-904']); ok('HARNESS_FRENTES=off => FRENTES|off', off.stdout.includes('FRENTES|off'), off.stdout); });
fr(['release', '--label', 'PRD-903']);
const m2 = run('frentes.mjs', ['acquire', '--label', 'PRD-905'], '', { HARNESS_FRENTES_MAX: '2' }); const m3 = run('frentes.mjs', ['acquire', '--label', 'PRD-906'], '', { HARNESS_FRENTES_MAX: '2' });
ok('max=2 aceita dois', m2.status === 0 && m3.status === 0 && m3.stdout.includes('2/2'), m2.stdout + m3.stdout);

console.log('\n== T5 sessoes (maquina real, sem fechar nada) ==');
const l1 = run('sessoes.mjs', [], '');
ok('lista sessoes vivas (SESSOES|vivas=N)', /SESSOES\|vivas=\d+/.test(l1.stdout), (l1.stdout + l1.stderr).slice(0, 300));
const dc = run('sessoes.mjs', ['--doctor', '--min', '1'], '');
ok('--doctor imprime DOCTOR|sessoes', dc.stdout.includes('DOCTOR|sessoes|vivas='), dc.stdout.slice(0, 300));
const dr = run('sessoes.mjs', ['--fechar', '--dry', '--min', '1'], '');
ok('--fechar --dry nao mata (fecharia|nada-a-fechar)', dr.stdout.includes('fecharia') || dr.stdout.includes('nada-a-fechar'), dr.stdout.slice(0, 300));

console.log('\n== T6 guard-bash.sh (paridade) ==');
const runSh = (input, env = {}) => spawnSync('bash', [path.join(HOOKS, 'guard-bash.sh')], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env }, windowsHide: true });
const casosSh = [['cat arquivo.txt', true, 2, 'Read'], ['php -l a.php', true, 0, ''], ['grep -rn x . | wc -l', true, 2, 'Grep'], ['grep -rn x . | awk "{print}"', true, 0, ''],
  ['sed -i "s/a/b/" f', true, 0, ''], ['sed -n "1,5p" f', true, 2, 'Read'], ['find . -name "*.php" -exec rm {} \\;', true, 0, ''], ['find . -name "*.php"', true, 2, 'Glob'],
  ['cd .claude && ls hooks', true, 2, 'Glob'], ['cat arquivo.txt', false, 0, ''], ['cat > /tmp/x', true, 2, 'FORA'], ['echo oi && npx playwright test', true, 0, '']];
for (const [cmd, sub, exp, dica] of casosSh) {
  limpaEspiral();
  const r = runSh(payload(cmd, sub));
  const cond = r.status === exp && (!dica || (r.stderr + r.stdout).includes(dica));
  ok(`sh ${sub ? 'sub' : 'pai'} [${cmd}] => ${exp}`, cond, `got ${r.status} :: ${(r.stderr || r.stdout).slice(0, 140).replace(/\n/g, ' ')}`);
}

console.log(`\n== RESULTADO: ${pass} PASS / ${fail} FAIL ==`);
fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
