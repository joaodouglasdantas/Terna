#!/usr/bin/env node
// tests/t-3428-packet-enxuto.mjs — bateria da 3.4.28 (packet enxuto).
// Roda em SANDBOX proprio (projeto falso em os.tmpdir()), nunca toca o projeto real.
//   node tests/t-3428-packet-enxuto.mjs
//
// O que prova (mecanico):
//   1. Perfil FILTRADO pela task: bullet longo de historico que cita o alvo/identificador fica; o que
//      nao cita sai; os 3 mais recentes ficam sempre; bullet curto e secoes fixas ficam; a continuacao
//      (linha indentada) segue o destino do bullet; rodape com a contagem; header do packet com KB.
//   2. HARNESS_PACKET_PERFIL=integral: nada filtrado, sem rodape.
//   3. --check imprime PERFIL|<task>|filtrado|<KB> -> <KB>|<mantidas>/<total>.
//   4. --worker: secao 4 vira indice (sem o conteudo do arquivo pequeno), esqueleto do arquivo grande
//      sem corpo, PACKET|...|<attach> continua listando os alvos, packet menor que o normal; contexto
//      (secao 5) continua inteiro.
//   5. harness-duelo.sh chama task-packet com --worker.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3428-packet-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };

fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, '.claude', 'agents'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'contratos'), path.join(PROJ, '.claude', 'contratos'), { recursive: true });
for (const f of ['harness.env', 'settings.json']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\n`);

// PERFIL-RESUMO falso: secoes fixas + historico com 6 bullets longos (2 citam o alvo, 1 cita identificador,
// 3 nao citam nada — o ultimo e "recente" por posicao) + bullet curto + continuacao.
const longo = (txt) => `- **${txt}** ` + 'lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt. '.repeat(4);
const perfil = [
  '# Perfil — RESUMO (sandbox)', '',
  '## Identificação e stack', '', '- PHP 8 + MySQL. Projeto de teste.', '',
  '## Réguas críticas', '', '- Regra curta que fica sempre.', '',
  '## Armadilhas específicas (enunciados no Perfil)', '',
  longo('[PRD-101] Faturamento por contato usa `receita_helpers.php`'),
  '  continuação da PRD-101 que deve SAIR junto com o bullet.',
  longo('[PRD-102] O `webhook_waha.php` responde OK cedo demais'),
  '  continuação da PRD-102 que deve FICAR junto com o bullet.',
  longo('[PRD-103] Reversão de pagamento em `pagamento_reversao_helpers.php`'),
  longo('[PRD-104] A tabela `inbox_contatos` nasce vazia e a migration é inerte'),
  '- Bullet curto de armadilha (fica).',
  longo('[PRD-105] Peso de motivo em `motivo_peso_helpers.php`'),
  longo('[PRD-106] Corpus de IA e filtro de autoria (assunto sem relação)'),
  '',
  '## Integrações com efeito colateral irreversível', '',
  longo('[INT-1] WAHA envia mensagem real se `WAHA_DRY_RUN` estiver off — cuidado com o `webhook_waha.php`'),
  longo('[INT-2] Meta Ads cobra de verdade (sem relação com a task)'),
  '',
  '## Regras de conduta do subagente (fixas)', '', '- Português do Brasil.', '',
].join('\n') + '\n';
fs.writeFileSync(path.join(PROJ, '.claude', 'PERFIL-RESUMO.md'), perfil);

fs.mkdirSync(path.join(PROJ, 'prds', '_metrics', 'tasks'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'prds', 'PRD-001-teste', 'tasks'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'administrativo', 'api', 'inbox'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'lib'), { recursive: true });
const linhasPhp = ['<?php'];
for (let i = 1; i <= 700; i++) linhasPhp.push(`function tratar_${i}($a) {`, `    return $a + ${i}; // ${'x'.repeat(40)}`, `}`);
fs.writeFileSync(path.join(PROJ, 'administrativo', 'api', 'inbox', 'webhook_waha.php'), linhasPhp.join('\n') + '\n');
fs.writeFileSync(path.join(PROJ, 'administrativo', 'api', 'inbox', 'pequeno.php'), '<?php\nfunction pequeno_fn() { return "CONTEUDO_PEQUENO_UNICO"; }\n');
fs.writeFileSync(path.join(PROJ, 'lib', 'helper.php'), '<?php\nfunction helper_fn() { return "CONTEUDO_CONTEXTO_UNICO"; }\n');

const TASKS = path.join(PROJ, 'prds', 'PRD-001-teste', 'tasks');
const task = (id, afetados, contexto = '') => {
  const f = path.join(TASKS, `TASK-${id}-teste.md`);
  fs.writeFileSync(f, `# TASK-${id} — teste\n\n## Metadados\n\n| **Tipo** | backend |\n| **Duelo** | sim |\n\n## Objetivo\n\nMexer em tratar_7() e na tabela \`inbox_contatos\`. ${contexto}\n\n## Arquivo(s) Afetado(s)\n\n${afetados.map((a) => `- \`${a}\``).join('\n')}\n\n## Critérios de Aceite\n\n- [ ] ok\n`);
  return `prds/PRD-001-teste/tasks/TASK-${id}-teste.md`;
};

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 400)); } };
const sh = (file, args, env = {}) => spawnSync('bash', [path.join(HOOKS, file), ...args], { encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const packetDe = (id) => fs.readFileSync(path.join(PROJ, '.claude', '.harness-run', 'packets', `TASK-${id}.packet.md`), 'utf8');

// ---------------------------------------------------------------- 1. Perfil filtrado
const t1 = task('001', ['administrativo/api/inbox/webhook_waha.php', 'administrativo/api/inbox/pequeno.php'], 'Ver também `lib/helper.php`.');
let r = sh('task-packet.sh', [t1]);
ok('packet montado (PACKET|...)', r.stdout.startsWith('PACKET|') && r.stdout.includes('webhook_waha.php'), r.stdout + r.stderr);
let pk = packetDe('001');
ok('bullet longo que cita o alvo (webhook_waha) FICA', pk.includes('[PRD-102]'));
ok('continuacao do bullet mantido FICA', pk.includes('continuação da PRD-102 que deve FICAR'));
ok('bullet longo que cita identificador em crase da task (inbox_contatos) FICA', pk.includes('[PRD-104]'));
ok('bullet longo sem relacao SAI (PRD-101 faturamento)', !pk.includes('[PRD-101]'));
ok('continuacao do bullet removido SAI', !pk.includes('continuação da PRD-101'));
ok('bullet longo sem relacao SAI (PRD-103)', !pk.includes('[PRD-103]'));
ok('os 3 mais recentes do arquivo FICAM mesmo sem citar (PRD-106, INT-1, INT-2)', pk.includes('[PRD-106]') && pk.includes('[INT-1]') && pk.includes('[INT-2]'));
ok('PRD-105 (4o mais recente, sem relacao) SAI', !pk.includes('[PRD-105]'));
ok('bullet curto de armadilha FICA', pk.includes('Bullet curto de armadilha (fica).'));
ok('secoes fixas FICAM (reguas + conduta)', pk.includes('Regra curta que fica sempre.') && pk.includes('Português do Brasil.'));
ok('rodape com a contagem (5 de 8 mantidas)', /> Perfil filtrado \(3\.4\.28\): 5 de 8 armadilhas longas mantidas/.test(pk), pk.match(/> Perfil filtrado[^\n]*/)?.[0]);
ok('header do packet diz que o Perfil foi filtrado (KB -> KB; 5/8)', /> Perfil: filtrado pela task \(\d+ KB -> \d+ KB; 5\/8 armadilhas longas\)/.test(pk));
ok('secao 4 normal continua com o conteudo do arquivo pequeno', pk.includes('CONTEUDO_PEQUENO_UNICO'));
ok('nenhum .perfil-*.tmp sobrou na pasta de packets', !fs.readdirSync(path.join(PROJ, '.claude', '.harness-run', 'packets')).some((f) => f.startsWith('.perfil-')));

// ---------------------------------------------------------------- 2. integral
r = sh('task-packet.sh', [t1], { HARNESS_PACKET_PERFIL: 'integral' });
pk = packetDe('001');
ok('integral: PRD-101 e PRD-103 presentes', pk.includes('[PRD-101]') && pk.includes('[PRD-103]') && pk.includes('[PRD-105]'));
ok('integral: sem rodape de filtro nem linha no header', !pk.includes('Perfil filtrado (3.4.28)') && !pk.includes('> Perfil: filtrado'));

// ---------------------------------------------------------------- 3. --check
r = sh('task-packet.sh', [t1, '--check']);
ok('--check imprime PERFIL|TASK-001|filtrado|N KB -> M KB|5/8', /^PERFIL\|TASK-001\|filtrado\|\d+ KB -> \d+ KB\|5\/8$/m.test(r.stdout), r.stdout);
ok('--check continua com PACKET-CHECK e DUELO-CHECK', /^PACKET-CHECK\|TASK-001\|/m.test(r.stdout) && /^DUELO-CHECK\|TASK-001\|ok/m.test(r.stdout), r.stdout);
r = sh('task-packet.sh', [t1, '--check'], { HARNESS_PACKET_PERFIL: 'integral' });
ok('--check integral: PERFIL|...|integral|N KB -> N KB|0/0', /^PERFIL\|TASK-001\|integral\|(\d+) KB -> \1 KB\|0\/0$/m.test(r.stdout), r.stdout);

// ---------------------------------------------------------------- 4. --worker
const normal = sh('task-packet.sh', [t1]).stdout; const nBytes = Number(normal.trim().split('|')[4]);
r = sh('task-packet.sh', [t1, '--worker']);
ok('--worker: PACKET| com a lista de anexos (alvos) intacta', r.stdout.startsWith('PACKET|') && r.stdout.includes('administrativo/api/inbox/pequeno.php,administrativo/api/inbox/webhook_waha.php'), r.stdout);
pk = packetDe('001');
ok('--worker: secao 4 vira indice', pk.includes('## 4. Arquivos-alvo (indice — o conteudo INTEGRAL de cada um esta nos Anexos'));
ok('--worker: arquivo pequeno so no indice (sem conteudo)', /- `administrativo\/api\/inbox\/pequeno\.php` \(\d+ bytes\) — integral no Anexo\./.test(pk) && !pk.includes('CONTEUDO_PEQUENO_UNICO'));
ok('--worker: arquivo grande = esqueleto (linha:assinatura) sem corpo', /- `administrativo\/api\/inbox\/webhook_waha\.php` \(\d+ bytes — GRANDE; integral no Anexo\)/.test(pk) && /\n\d+:function tratar_700\(/.test(pk) && !pk.includes('return $a + 700;'));
ok('--worker: contexto (secao 5) continua inteiro', pk.includes('## 5. Arquivos de contexto') && pk.includes('CONTEUDO_CONTEXTO_UNICO'));
const wBytes = Number(r.stdout.trim().split('|')[4]);
ok(`--worker: packet menor que o normal (${wBytes} < ${nBytes})`, wBytes < nBytes);

// ---------------------------------------------------------------- 5. duelo usa --worker
const duelo = fs.readFileSync(path.join(MASTER, '.claude', 'hooks', 'harness-duelo.sh'), 'utf8');
ok('harness-duelo.sh chama task-packet.sh com --worker', /task-packet\.sh" "\$TASK" --out "\$D\/packet\.md" --max-kb "\$\{HARNESS_DUELO_PACKET_KB:-100\}" --worker\)/.test(duelo));
ok('prompt do worker explica que o alvo integral esta nos ANEXOS', duelo.includes('indice dos arquivos-alvo) e os ANEXOS no fim'));
const envTxt = fs.readFileSync(path.join(MASTER, '.claude', 'harness.env'), 'utf8');
ok('harness.env documenta HARNESS_PACKET_PERFIL/_MIN/_RECENTES', /# HARNESS_PACKET_PERFIL='filtrado'/.test(envTxt) && /# HARNESS_PACKET_PERFIL_MIN='300'/.test(envTxt) && /# HARNESS_PACKET_PERFIL_RECENTES='3'/.test(envTxt));

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
