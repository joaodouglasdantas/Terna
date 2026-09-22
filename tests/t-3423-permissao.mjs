#!/usr/bin/env node
// tests/t-3423-permissao.mjs — bateria da 3.4.23, item 18 (permissao por maquina).
// Roda em SANDBOX proprio (projeto falso + HOME falso em os.tmpdir()), nunca toca o projeto real
// nem o ~/.harness-run da maquina. Precisa de node >= 18 e bash (Git Bash) no PATH.
//   node tests/t-3423-permissao.mjs
// Cobre: sync da allowlist por UNIAO (+ escapes), guard-question (marcador/env/TTL/knob),
// denied.sh com contador recorrente -> doctor sugere regra -> --gen-allowlist/--apply-allowlist,
// e a coerencia entre o minimo canonico do doctor e o settings.json do mestre.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// nome PROPRIO (outra suite da Onda B usa harness-3423-sandbox — colidiu em 08/09)
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3423-permissao-sandbox');
const HOME = path.join(S, 'home');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1', HARNESS_MODO: '' };
delete ENVB.HARNESS_MODO;

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(HOME, { recursive: true });
console.log('sandbox:', S);

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 400)); } };
const sh = (script, args, opts = {}) => spawnSync('bash', [script, ...args], { encoding: 'utf8', input: opts.input || '', cwd: opts.cwd || S, env: { ...ENVB, ...(opts.env || {}) } });
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const masterSettings = readJson(path.join(MASTER, '.claude', 'settings.json'));
const masterAllow = masterSettings.permissions.allow;
const SYNC = path.join(MASTER, '.claude', 'harness-sync.sh');

// projeto falso: .claude minimo (o sync copia o nucleo inteiro no --apply — e sandbox)
function novoProjeto(nome, settings) {
  const p = path.join(S, nome);
  fs.mkdirSync(path.join(p, '.claude', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(p, '.claude', 'harness.env'), "HARNESS_VERSION='3.4.22'\nHARNESS_TARGETS='claude'\n");
  if (settings !== undefined) fs.writeFileSync(path.join(p, '.claude', 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
  return p;
}
const hooksVelhos = { SessionStart: [{ hooks: [{ type: 'command', command: 'bash .claude/hooks/velho.sh' }] }] };
const linhas = (r) => (r.stdout || '').split(/\r?\n/);
// ULTIMA linha com o prefixo: no --apply o sync imprime primeiro o check (difere) e depois o resultado
const linha = (r, prefixo) => linhas(r).filter(l => l.startsWith(prefixo)).pop() || '';

console.log('\n== T1 sync: allowlist por UNIAO + hooks (item 18a) ==');
{
  const p = novoProjeto('proj-uniao', { permissions: { allow: ['Bash(php artisan test:*)', 'Bash(minha regra local)'] }, hooks: hooksVelhos, env: { X: '1' } });
  let r = sh(SYNC, ['--check', p]);
  ok('check: hooks difere', linha(r, 'SETTINGS|hooks|') === 'SETTINGS|hooks|difere', r.stdout);
  ok('check: permissions difere com contagem', linha(r, 'SETTINGS|permissions|') === `SETTINGS|permissions|difere|faltam=${masterAllow.length}`, linha(r, 'SETTINGS|permissions|'));
  r = sh(SYNC, ['--dry-run', p]);
  ok('dry-run anuncia as duas secoes', linha(r, 'COPIARIA|.claude/settings.json').includes('hooks+permissions (uniao)'), linha(r, 'COPIARIA|.claude/settings.json'));
  const antes = readJson(path.join(p, '.claude', 'settings.json'));
  r = sh(SYNC, ['--apply', p]);
  ok('apply: hooks atualizado', linha(r, 'SETTINGS|hooks|') === 'SETTINGS|hooks|atualizado', r.stdout.slice(-400));
  ok('apply: permissions atualizado (entraram=N)', linha(r, 'SETTINGS|permissions|') === `SETTINGS|permissions|atualizado|entraram=${masterAllow.length}`, linha(r, 'SETTINGS|permissions|'));
  const depois = readJson(path.join(p, '.claude', 'settings.json'));
  ok('hooks do projeto == hooks do mestre', JSON.stringify(depois.hooks) === JSON.stringify(masterSettings.hooks));
  ok('allowlist = UNIAO: locais preservadas + todas do mestre', antes.permissions.allow.every(x => depois.permissions.allow.includes(x)) && masterAllow.every(x => depois.permissions.allow.includes(x)) && depois.permissions.allow.length === antes.permissions.allow.length + masterAllow.length, JSON.stringify(depois.permissions.allow));
  ok('AskUserQuestion presente', depois.permissions.allow.includes('AskUserQuestion'));
  ok('resto do settings preservado (env)', depois.env && depois.env.X === '1');
  r = sh(SYNC, ['--check', p]);
  ok('2o check: hooks ok + permissions ok', linha(r, 'SETTINGS|hooks|') === 'SETTINGS|hooks|ok' && linha(r, 'SETTINGS|permissions|') === 'SETTINGS|permissions|ok', r.stdout.slice(-300));
}
{
  const p = novoProjeto('proj-local', { harness: { hooks: 'local' }, permissions: { allow: ['Bash(so minha)'] }, hooks: hooksVelhos });
  const raw0 = fs.readFileSync(path.join(p, '.claude', 'settings.json'), 'utf8');
  let r = sh(SYNC, ['--check', p]);
  ok('escape hooks=local: as duas secoes local-preservado', linha(r, 'SETTINGS|hooks|') === 'SETTINGS|hooks|local-preservado' && linha(r, 'SETTINGS|permissions|') === 'SETTINGS|permissions|local-preservado', r.stdout.slice(-300));
  r = sh(SYNC, ['--apply', p]);
  ok('escape: settings.json intocado no --apply', fs.readFileSync(path.join(p, '.claude', 'settings.json'), 'utf8') === raw0);
}
{
  const p = novoProjeto('proj-perm-local', { harness: { permissions: 'local' }, permissions: { allow: ['Bash(so minha)'] }, hooks: hooksVelhos });
  const r = sh(SYNC, ['--apply', p]);
  const d = readJson(path.join(p, '.claude', 'settings.json'));
  ok('escape permissions=local: hooks atualizado, allowlist preservada', linha(r, 'SETTINGS|hooks|') === 'SETTINGS|hooks|atualizado' && linha(r, 'SETTINGS|permissions|') === 'SETTINGS|permissions|local-preservado' && d.permissions.allow.length === 1 && d.harness.permissions === 'local', r.stdout.slice(-300));
}
{
  const p = novoProjeto('proj-knob', { permissions: { allow: [] }, hooks: masterSettings.hooks });
  const r = sh(SYNC, ['--check', p], { env: { HARNESS_SYNC_PERMISSIONS: '0' } });
  ok('HARNESS_SYNC_PERMISSIONS=0 => permissions desligado (nao conta como diferenca)', linha(r, 'SETTINGS|permissions|') === 'SETTINGS|permissions|desligado' && linha(r, 'SETTINGS|hooks|') === 'SETTINGS|hooks|ok', r.stdout.slice(-300) + ' rc=' + r.status);
}
{
  const p = novoProjeto('proj-sem-settings');
  const r = sh(SYNC, ['--apply', p]);
  const d = readJson(path.join(p, '.claude', 'settings.json'));
  ok('sem settings.json => criado (2 linhas) igual ao mestre', linha(r, 'SETTINGS|hooks|') === 'SETTINGS|hooks|criado' && linha(r, 'SETTINGS|permissions|') === 'SETTINGS|permissions|criado' && JSON.stringify(d) === JSON.stringify(masterSettings), r.stdout.slice(-300));
}

console.log('\n== T2 guard-question (item 18b) ==');
const P = path.join(S, 'proj-uniao');            // ja tem o nucleo do mestre copiado pelo --apply
const HOOKS = path.join(P, '.claude', 'hooks');
const RUN = path.join(P, '.claude', '.harness-run');
const MODO = path.join(RUN, 'modo');
fs.mkdirSync(RUN, { recursive: true });
const LOCAL = path.join(P, '.claude', 'harness.env.local');
const payloadQ = JSON.stringify({ session_id: 's1', cwd: P, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Qual nome usar?', header: 'Nome', options: [{ label: 'a' }, { label: 'b' }] }] } });
const gq = (env = {}) => sh(path.join(HOOKS, 'guard-question.sh'), [], { input: payloadQ, cwd: P, env });
const marcador = (txt, horasAtras = 0) => { fs.writeFileSync(MODO, txt + '\n'); if (horasAtras) { const t = new Date(Date.now() - horasAtras * 3600 * 1000); fs.utimesSync(MODO, t, t); } };
let r = gq();
ok('sem marcador e sem env => exit 0', r.status === 0, r.stderr);
marcador('noturno');
r = gq();
ok('marcador noturno => exit 2 e a mensagem cita o Passo 0.3 e Decisoes pendentes', r.status === 2 && r.stderr.includes('Passo 0.3') && r.stderr.includes('Decisoes pendentes'), `${r.status} ${r.stderr.slice(0, 200)}`);
const gqLog = path.join(RUN, 'guard-question.jsonl');
ok('telemetria guard-question.jsonl com a pergunta', fs.existsSync(gqLog) && (() => { const l = JSON.parse(fs.readFileSync(gqLog, 'utf8').trim().split('\n').pop()); return l.type === 'question-denied' && l.modo === 'noturno' && l.origem === 'marcador' && l.pergunta === 'Qual nome usar?'; })(), fs.existsSync(gqLog) ? fs.readFileSync(gqLog, 'utf8') : 'sem log');
marcador('TURBO');
r = gq();
ok('marcador turbo (maiusculo) => exit 2', r.status === 2 && r.stderr.includes('turbo'), `${r.status} ${r.stderr.slice(0, 120)}`);
marcador('normal');
r = gq();
ok('marcador com outro conteudo => exit 0', r.status === 0, r.stderr);
marcador('noturno', 13);
r = gq();
ok('marcador noturno com mtime > 12 h => exit 0 (ignorado)', r.status === 0, r.stderr);
marcador('noturno', 2);
r = gq();
ok('marcador com 2 h => ainda nega', r.status === 2, r.stderr.slice(0, 100));
fs.writeFileSync(LOCAL, "HARNESS_MODO_TTL_H='1'\n");
r = gq();
ok('HARNESS_MODO_TTL_H=1 => marcador de 2 h ignorado', r.status === 0, r.stderr);
fs.writeFileSync(LOCAL, "HARNESS_GUARD_QUESTION='off'\n");
marcador('noturno');
r = gq();
ok('knob off => exit 0 mesmo com marcador', r.status === 0, r.stderr);
fs.rmSync(LOCAL);
fs.rmSync(MODO);
r = gq({ HARNESS_MODO: 'noturno' });
ok('HARNESS_MODO=noturno no ambiente, sem marcador => exit 2 (origem env)', r.status === 2 && r.stderr.includes('via env'), `${r.status} ${r.stderr.slice(0, 120)}`);
r = gq({ HARNESS_MODO: 'turbo', HARNESS_SKIP_GUARD_QUESTION: '1' });
ok('HARNESS_SKIP_GUARD_QUESTION=1 => bypass pontual', r.status === 0, r.stderr);

console.log('\n== T3 denied.sh: contador recorrente -> doctor -> gen/apply-allowlist (item 18d) ==');
const denied = (cmd) => sh(path.join(HOOKS, 'denied.sh'), [], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } }), cwd: P, env: { HARNESS_NOTIFY_CMD: '' } });
for (let i = 0; i < 3; i++) denied('cd /tmp/x && npx playwright test tests/e2e --reporter=line');
for (let i = 0; i < 3; i++) denied('php -l api/x.php');
denied('php artisan test --filter=Foo');
denied('mysql -u root -e "select 1"');
denied('FOO=1 composer install');
sh(path.join(HOOKS, 'denied.sh'), [], { input: JSON.stringify({ tool_name: 'Agent', tool_input: { description: 'x' } }), cwd: P, env: { HARNESS_NOTIFY_CMD: '' } });
const rec = fs.readFileSync(path.join(RUN, 'denied-recorrentes.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const keys = rec.map(l => l.key);
ok('chaves normalizadas (pula cd, corta opcao, corta caminho no 3o token)', keys.filter(k => k === 'npx playwright test').length === 3 && keys.filter(k => k === 'php').length === 3 && keys.includes('php artisan test') && keys.includes('mysql'), JSON.stringify(keys));
ok('atribuicao de env e Agent nao geram chave', !keys.some(k => k.includes('composer')) && rec.length === 8, JSON.stringify(keys));
const waits = fs.readFileSync(path.join(RUN, 'permission-waits.jsonl'), 'utf8').trim().split('\n');
ok('permission-waits.jsonl continua recebendo type=denied (linhas validas)', waits.length === 10 && waits.every(l => { try { return JSON.parse(l).type === 'denied'; } catch { return false; } }), waits.length + ' linhas');

// doctor no sandbox (o --apply do sync ja copiou o harness-doctor.sh do mestre)
const DOC = path.join(P, '.claude', 'harness-doctor.sh');
ok('harness-doctor.sh chegou pelo sync', fs.existsSync(DOC));
r = sh(DOC, ['--autonomia'], { cwd: P });
ok('doctor lista o negado 3x com a regra estreita pronta', /3x\s+npx playwright test\s+->\s+Bash\(npx playwright test:\*\)/.test(r.stdout), (r.stdout.match(/.*negad.*|.*->.*/g) || []).join(' | '));
ok('doctor: 1 token (php) NAO vira regra larga', /3x\s+php\s+->\s+\(regra LARGA/.test(r.stdout), (r.stdout.match(/.*php .*->.*/g) || []).join(' | '));
ok('doctor: guard-question ARMADO + AskUserQuestion allowlistada', r.stdout.includes('guard-question ARMADO') && r.stdout.includes('AskUserQuestion em permissions.allow'), r.stdout.slice(0, 600));
// Perfil com tabela de allowlist
fs.writeFileSync(path.join(P, '.claude', 'PERFIL-PROJETO.md'), '# Perfil\n\n## Execução autônoma — comandos conhecidos-seguros (allowlist)\n\n| Comando | Por que |\n|---|---|\n| `php artisan test *` | suite |\n| `composer dump-autoload` | idempotente |\n| 🔧 `<ex: x>` | 🔧 |\n\n## Outra\n');
r = sh(DOC, ['--gen-allowlist'], { cwd: P });
ok('--gen-allowlist inclui AskUserQuestion', r.stdout.includes('"AskUserQuestion",'), r.stdout.slice(0, 300));
ok('--gen-allowlist: tabela do Perfil em formato :* e exata', r.stdout.includes('"Bash(php artisan test:*)"') && r.stdout.includes('"Bash(composer dump-autoload)"'), r.stdout);
ok('--gen-allowlist: secao "sugeridas pelas negacoes" com a regra pronta', /Sugeridas pelas NEGACOES/.test(r.stdout) && r.stdout.includes('"Bash(npx playwright test:*)"') && /larga, nao sugerida: 3x "php"/.test(r.stdout), r.stdout);
// coerencia: canonico do doctor == settings.json do mestre (sem Perfil e sem db-test.sh no sandbox)
{
  const p2 = novoProjeto('proj-canon', { permissions: { allow: [] }, hooks: {} });
  fs.copyFileSync(path.join(MASTER, '.claude', 'harness-doctor.sh'), path.join(p2, '.claude', 'harness-doctor.sh'));
  const g = sh(path.join(p2, '.claude', 'harness-doctor.sh'), ['--gen-allowlist'], { cwd: p2 });
  const emitidas = (g.stdout.match(/^\s+"(.+)",?$/gm) || []).map(l => l.trim().replace(/^"/, '').replace(/",?$/, ''));
  ok('minimo canonico do doctor == permissions.allow do mestre', emitidas.length === masterAllow.length && masterAllow.every(x => emitidas.includes(x)), JSON.stringify(emitidas));
  ok('todas as regras do mestre sao ESTREITAS (espaco dentro do parentese ou sem Bash)', masterAllow.every(x => !x.startsWith('Bash(') || /\([^)]* [^)]*\)/.test(x)), JSON.stringify(masterAllow.filter(x => x.startsWith('Bash(') && !/\([^)]* [^)]*\)/.test(x))));
}
// --apply-allowlist por uniao, com backup; --sugeridas soma as negacoes
fs.writeFileSync(path.join(P, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(local)'] }, hooks: masterSettings.hooks }, null, 2) + '\n');
r = sh(DOC, ['--apply-allowlist'], { cwd: P });
let d = readJson(path.join(P, '.claude', 'settings.json'));
ok('--apply-allowlist: ALLOWLIST|atualizado + uniao (local fica, canon + Perfil entram)', /ALLOWLIST\|atualizado\|entraram=\d+/.test(r.stdout) && d.permissions.allow.includes('Bash(local)') && d.permissions.allow.includes('AskUserQuestion') && d.permissions.allow.includes('Bash(php artisan test:*)') && !d.permissions.allow.includes('Bash(npx playwright test:*)'), r.stdout.slice(0, 300));
ok('--apply-allowlist: backup gravado', fs.existsSync(path.join(RUN, 'allowlist-backup')) && fs.readdirSync(path.join(RUN, 'allowlist-backup')).some(f => f.startsWith('settings.json.')), r.stdout);
r = sh(DOC, ['--apply-allowlist'], { cwd: P });
ok('--apply-allowlist 2x: nada-a-fazer', r.stdout.includes('ALLOWLIST|ok|nada-a-fazer'), r.stdout);
r = sh(DOC, ['--apply-allowlist', '--sugeridas'], { cwd: P });
d = readJson(path.join(P, '.claude', 'settings.json'));
ok('--apply-allowlist --sugeridas: entra a regra da negacao recorrente (e so ela)', r.stdout.includes('entraram=1') && d.permissions.allow.includes('Bash(npx playwright test:*)') && !d.permissions.allow.some(x => x === 'Bash(php:*)' || x === 'Bash(mysql:*)'), r.stdout);
ok('hooks preservados pelo --apply-allowlist', JSON.stringify(d.hooks) === JSON.stringify(masterSettings.hooks));

console.log('\n== T4 convencao do marcador nas skills/scripts (item 18b) ==');
const lê = (rel) => fs.readFileSync(path.join(MASTER, rel), 'utf8');
ok('noturno.sh escreve o marcador e exporta HARNESS_MODO', /printf 'noturno\\n' > \.claude\/\.harness-run\/modo/.test(lê('.claude/scripts/noturno.sh')) && lê('.claude/scripts/noturno.sh').includes('export HARNESS_MODO=noturno'));
ok('prd-exec: --noturno no Uso + Passo 0.3 item 7 (defaults declarados) + Decisoes pendentes no Output', lê('.claude/skills/prd-exec/SKILL.md').includes('/prd-exec PRD-003 --noturno') && lê('.claude/skills/prd-exec/SKILL.md').includes('7. **Defaults declarados') && lê('.claude/skills/prd-exec/SKILL.md').includes('### Decisoes pendentes'));
ok('dt-exec: Passo 0.3 defaults declarados + Decisoes pendentes', lê('.claude/skills/dt-exec/SKILL.md').includes('### Passo 0.3 — Defaults declarados') && lê('.claude/skills/dt-exec/SKILL.md').includes('**Decisoes pendentes:**'));
ok('settings.json do mestre: PreToolUse AskUserQuestion -> guard-question.sh', masterSettings.hooks.PreToolUse.some(h => h.matcher === 'AskUserQuestion' && h.hooks[0].command === 'bash .claude/hooks/guard-question.sh'));
ok('harness.env: bloco PERMISSAO POR MAQUINA antes da RESILIENCIA, knob ligado', (() => { const e = lê('.claude/harness.env'); return e.indexOf('PERMISSAO POR MAQUINA (3.4.23') < e.indexOf('RESILIENCIA AO CLASSIFICADOR') && /^HARNESS_GUARD_QUESTION='on'/m.test(e); })());
ok('nenhum GNU-ism novo nos .sh tocados', ['.claude/hooks/guard-question.sh', '.claude/hooks/denied.sh', '.claude/harness-doctor.sh', '.claude/harness-sync.sh'].every(f => { const t = lê(f); return !/find [^\n]*-printf|sed -i /.test(t) && !/\$\{[a-zA-Z_]+,,\}/.test(t) && !/readarray|mapfile/.test(t); }));

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail ? 1 : 0);
