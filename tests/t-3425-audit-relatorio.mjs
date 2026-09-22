#!/usr/bin/env node
// tests/t-3425-audit-relatorio.mjs — bateria da 3.4.25 (melhorias 1 e 4).
//   1. prompt-audit.mjs: 3 arquivos falsos (denso em caixa alta / contador em prosa + "medido 01/09" /
//      limpo) => achados esperados, resumo, --json, --md, --baseline + doctor que NAO alerta quando
//      igual e ALERTA quando alto+medio sobe.
//   4. task-telemetry.mjs: relatorio com 3 verificacoes (2 com fence, 1 sem) => verif_total=3,
//      verif_sem_prova=1, status ⚠️ + motivo; todas provadas => ✅; sem secao => campos vazios;
//      guard-agent --post => additionalContext [relatorio] + incidente tipo `relatorio`.
// Roda em SANDBOX proprio (projeto falso + HOME falso em os.tmpdir(), sufixo de pid) — sem daemon,
// nunca toca o projeto real. Precisa de node >= 18 e bash (Git Bash) no PATH.
//   node tests/t-3425-audit-relatorio.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3425-sandbox-' + process.pid);
const PROJ = path.join(S, 'proj'), HOME = path.join(S, 'home'), CL = path.join(PROJ, '.claude'), HOOKS = path.join(CL, 'hooks');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };

// ---------------------------------------------------------------- sandbox
fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(CL, { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
for (const f of ['harness.env', 'settings.json', 'harness-doctor.sh', 'PERFIL-PROJETO.md', 'ONBOARDING.md', 'PLATAFORMAS.md']) {
  if (fs.existsSync(path.join(MASTER, '.claude', f))) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(CL, f));
}
fs.cpSync(path.join(MASTER, '.claude', 'skills'), path.join(CL, 'skills'), { recursive: true });   // o doctor exige as skills; a auditoria le SKILL.md
fs.writeFileSync(path.join(CL, 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\nHARNESS_WATCHDOG='0'\n`);
fs.mkdirSync(path.join(PROJ, 'prds', '_metrics'), { recursive: true });
fs.mkdirSync(path.join(CL, 'agents'), { recursive: true });
console.log('sandbox:', PROJ);

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 400)); } };
const run = (file, args, input = '', env = {}) => spawnSync(process.execPath, [path.join(HOOKS, file), ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env } });
const sh = (file, args, input = '', env = {}, timeout = 60000) => spawnSync('bash', [file, ...args], { input, encoding: 'utf8', cwd: PROJ, env: { ...ENVB, ...env }, timeout });
const linhasAudit = out => out.split('\n').filter(l => l.startsWith('AUDIT|')).map(l => { const p = l.split('|'); return { arquivo: p[1], id: p[2], nivel: p[3], linha: Number(p[4]), trecho: p.slice(5).join('|') }; });
const resumoDe = out => { const m = out.match(/^AUDIT-RESUMO\|arquivos=(\d+)\|achados=(\d+)\|alto=(\d+)\|medio=(\d+)\|baixo=(\d+)/m); return m ? { arquivos: +m[1], achados: +m[2], alto: +m[3], medio: +m[4], baixo: +m[5] } : null; };

// ---------------------------------------------------------------- MELHORIA 1 — 3 arquivos falsos
const AG = path.join(CL, 'agents');
// filler UNICO por arquivo (senao a repeticao entre arquivos — corretamente — acusa o proprio filler)
const corpo = (n, tag = Math.random().toString(36).slice(2, 8)) => Array.from({ length: n }, (_, i) => `Contexto ${tag}-${i + 1}: o agente ${tag} le o packet e trabalha no arquivo indicado pela task ${i + 1}.`).join('\n');
// (a) denso em caixa alta: 6 linhas com NUNCA/SEMPRE/MUST em ~40 linhas de prosa (15/100 > 3), "!!" e sem porque
fs.writeFileSync(path.join(AG, 'denso.md'), `---
name: denso
description: agente falso denso
---
# Denso

Voce NUNCA deve commitar.
SEMPRE leia o packet.
Isso e CRITICAL!!
You MUST run the lint.
NUNCA use /tmp.
Este arquivo IMPORTANT deve ser lido.
${corpo(34)}
`);
// (b) contador em prosa + "medido 01/09" + filtro de severidade + scaffold; sem caixa alta
fs.writeFileSync(path.join(AG, 'contador.md'), `---
name: contador
description: agente falso com contador
---
# Contador

Voce tem um orcamento de 40 chamadas; em 35, grave o relatorio parcial.
Faca no maximo ~30 turnos por despacho e devolva.
Isso foi medido 01/09 na PRD-135 (23 min de lint).
Em duvida, Sugestao — so reporte bloqueantes.
Pense passo a passo antes de responder.
${corpo(30)}
`);
// (c) limpo: prosa normal, sem sinal nenhum
fs.writeFileSync(path.join(AG, 'limpo.md'), `---
name: limpo
description: agente falso limpo
---
# Limpo

Voce e o executor de backend. Leia o packet indicado no prompt e implemente a task.
Quando uma verificacao falhar, diga que falhou e cole a saida.
${corpo(30)}
`);

console.log('\n== T1 prompt-audit: achados por arquivo ==');
let r = run('prompt-audit.mjs', []);
let A = linhasAudit(r.stdout), R = resumoDe(r.stdout);
ok('roda e imprime AUDIT-RESUMO', r.status === 0 && R && R.arquivos >= 3, r.stdout.slice(-300) + r.stderr);
const de = (arq, id, nivel) => A.filter(a => a.arquivo === 'X'.replace('X', '.claude/agents/' + arq) && a.id === id && (!nivel || a.nivel === nivel));
ok('denso.md: pressao ALTO (densidade > 3/100) com as linhas mais densas', de('denso.md', 'pressao', 'alto').length === 1 && /densidade \d+\.\d\/100/.test(de('denso.md', 'pressao', 'alto')[0].trecho) && /linhas \d+(,\d+)+/.test(de('denso.md', 'pressao', 'alto')[0].trecho), JSON.stringify(de('denso.md', 'pressao')));
ok('denso.md: "!!" e MEDIO na linha 9', de('denso.md', 'pressao', 'medio').some(a => a.linha === 9 && a.trecho.includes('!!')), JSON.stringify(de('denso.md', 'pressao', 'medio')));
ok('denso.md: enfase sem porque (BAIXO) em >= 5 linhas', de('denso.md', 'pressao', 'baixo').length >= 5, JSON.stringify(de('denso.md', 'pressao', 'baixo').length));
ok('denso.md: sem contador/fossil', de('denso.md', 'contador').length === 0 && de('denso.md', 'fossil').length === 0);
ok('contador.md: contador ALTO (orcamento de 40 / em 35, grave / ~30 turnos)', de('contador.md', 'contador', 'alto').length === 2 && de('contador.md', 'contador').some(a => a.linha === 7) && de('contador.md', 'contador').some(a => a.linha === 8), JSON.stringify(de('contador.md', 'contador')));
ok('contador.md: fossil MEDIO em "medido 01/09" (linha 9) e NAO contador (medicao != teto)', de('contador.md', 'fossil', 'medio').some(a => a.linha === 9) && !de('contador.md', 'contador').some(a => a.linha === 9), JSON.stringify(de('contador.md', 'fossil')));
ok('contador.md: severidade ALTO (em duvida, Sugestao / so reporte bloqueantes)', de('contador.md', 'severidade', 'alto').some(a => a.linha === 10), JSON.stringify(de('contador.md', 'severidade')));
ok('contador.md: scaffold MEDIO (pense passo a passo)', de('contador.md', 'scaffold', 'medio').some(a => a.linha === 11), JSON.stringify(de('contador.md', 'scaffold')));
ok('contador.md: sem pressao (nada em caixa alta)', de('contador.md', 'pressao').length === 0, JSON.stringify(de('contador.md', 'pressao')));
ok('limpo.md: zero achados', A.filter(a => a.arquivo === '.claude/agents/limpo.md').length === 0, JSON.stringify(A.filter(a => a.arquivo === '.claude/agents/limpo.md')));
ok('trecho <= 80 chars em todos os achados', A.every(a => a.trecho.length <= 80), A.filter(a => a.trecho.length > 80).map(a => a.trecho.length).join(','));
ok('resumo bate com as linhas (achados/alto/medio/baixo)', R.achados === A.length && R.alto === A.filter(a => a.nivel === 'alto').length && R.medio === A.filter(a => a.nivel === 'medio').length && R.baixo === A.filter(a => a.nivel === 'baixo').length, JSON.stringify(R) + ' vs ' + A.length);
ok('sem baseline => AUDIT-BASELINE|ausente', r.stdout.includes('AUDIT-BASELINE|ausente'));
// contratos/ ausente e ok; presente entra no inventario
ok('contratos/ ausente nao quebra', !fs.existsSync(path.join(CL, 'contratos')) && R.arquivos >= 3);
fs.mkdirSync(path.join(CL, 'contratos'), { recursive: true });
fs.writeFileSync(path.join(CL, 'contratos', 'executor.md'), '# Contrato do executor\n\nCole a saida de cada verificacao.\nNao narre o andamento; hold all findings ate o fim.\n' + corpo(14) + '\n');
r = run('prompt-audit.mjs', []); A = linhasAudit(r.stdout); const R2 = resumoDe(r.stdout);
ok('contratos/*.md entra no inventario e "nao narre"/"hold all findings" = narracao MEDIO', R2.arquivos === R.arquivos + 1 && A.some(a => a.arquivo === '.claude/contratos/executor.md' && a.id === 'narracao' && a.nivel === 'medio'), JSON.stringify(A.filter(a => a.arquivo.includes('contratos'))));
// repeticao: mesmo bloco de 3 linhas em dois arquivos
const bloco = 'Ferramenta certa para ler: use Read, Glob e Grep — nao criam processo e respondem rapido.\nBash so para executar (lint, teste, git, migrate, CLI do projeto) e nunca para listar pasta.\nAgrupe execucoes que precisam de Bash num comando so, nunca um comando por linha.\n';
fs.writeFileSync(path.join(AG, 'rep-a.md'), '# A\n\n' + corpo(15) + '\n\n' + bloco);
fs.writeFileSync(path.join(AG, 'rep-b.md'), '# B\n\n' + corpo(15) + '\n\n' + bloco);
r = run('prompt-audit.mjs', []); A = linhasAudit(r.stdout);
const rep = A.filter(a => a.id === 'repeticao');
ok('repeticao: bloco de 3 linhas em 2 arquivos => 1 achado MEDIO citando o outro arquivo e a 1a linha', rep.length === 1 && rep[0].nivel === 'medio' && /rep-b\.md/.test(rep[0].trecho) && /3 linhas/.test(rep[0].trecho), JSON.stringify(rep));
// identidade: corpo < 15 linhas
fs.writeFileSync(path.join(AG, 'curto.md'), '---\nname: curto\ndescription: x\n---\nVoce e um agente util.\n');
r = run('prompt-audit.mjs', []); A = linhasAudit(r.stdout);
ok('identidade: corpo < 15 linhas => MEDIO', A.some(a => a.arquivo === '.claude/agents/curto.md' && a.id === 'identidade' && a.nivel === 'medio'));
fs.rmSync(path.join(AG, 'curto.md')); fs.rmSync(path.join(AG, 'rep-a.md')); fs.rmSync(path.join(AG, 'rep-b.md'));
// knob de densidade
r = run('prompt-audit.mjs', [], '', { HARNESS_PROMPT_AUDIT_PRESSAO_POR_100: '50' });
ok('HARNESS_PROMPT_AUDIT_PRESSAO_POR_100=50 => denso.md sem pressao ALTO', !linhasAudit(r.stdout).some(a => a.arquivo.endsWith('denso.md') && a.id === 'pressao' && a.nivel === 'alto'));
r = run('prompt-audit.mjs', [], '', { HARNESS_PROMPT_AUDIT: 'off' });
ok('HARNESS_PROMPT_AUDIT=off => AUDIT-RESUMO|off', r.stdout.trim() === 'AUDIT-RESUMO|off', r.stdout);

console.log('\n== T2 prompt-audit: --json, --md, --baseline, --resumo ==');
r = run('prompt-audit.mjs', ['--json']);
let J = null; try { J = JSON.parse(r.stdout); } catch {}
ok('--json parseia e traz achados/resumo/arquivos', J && Array.isArray(J.achados) && J.resumo && J.resumo.alto >= 1 && Array.isArray(J.arquivos), r.stdout.slice(0, 200));
r = run('prompt-audit.mjs', ['--md']);
const mdPath = (r.stdout.match(/^AUDIT-MD\|(.+)$/m) || [])[1];
ok('--md grava prds/_metrics/prompt-audit-<data>.md', mdPath && /^prds\/_metrics\/prompt-audit-\d{4}-\d{2}-\d{2}\.md$/.test(mdPath) && fs.existsSync(path.join(PROJ, mdPath)), r.stdout);
const md = mdPath ? fs.readFileSync(path.join(PROJ, mdPath), 'utf8') : '';
ok('relatorio md: tabela por arquivo (denso/contador) e "limpo." no limpo', md.includes('## `.claude/agents/denso.md`') && md.includes('| linha | id | nivel | trecho |') && /## `\.claude\/agents\/limpo\.md` — 0 achado\(s\)\n\nlimpo\./.test(md), md.slice(0, 600));
r = run('prompt-audit.mjs', ['--baseline']);
const BL = path.join(CL, '.harness-run', 'prompt-audit.baseline.json');
ok('--baseline grava .harness-run/prompt-audit.baseline.json', r.stdout.includes('AUDIT-BASELINE|gravada') && fs.existsSync(BL), r.stdout);
let bl = {}; try { bl = JSON.parse(fs.readFileSync(BL, 'utf8')); } catch {}
const R3 = resumoDe(run('prompt-audit.mjs', []).stdout);
ok('baseline = contagens de hoje', bl.alto === R3.alto && bl.medio === R3.medio && bl.baixo === R3.baixo && bl.data, JSON.stringify(bl));
r = run('prompt-audit.mjs', ['--resumo']);
ok('--resumo: so BASELINE (igual, delta +0) + RESUMO', !r.stdout.includes('AUDIT|') && /AUDIT-BASELINE\|\d{4}-\d{2}-\d{2}\|base=\d+\|atual=\d+\|delta=\+0\|igual/.test(r.stdout) && r.stdout.includes('AUDIT-RESUMO|'), r.stdout);
// 1 achado alto a mais => subiu
fs.appendFileSync(path.join(AG, 'limpo.md'), '\nVoce tem um teto de 12 turnos para terminar.\n');
r = run('prompt-audit.mjs', ['--resumo']);
ok('1 achado alto a mais => AUDIT-BASELINE ... delta=+1|subiu', /delta=\+1\|subiu/.test(r.stdout), r.stdout);
fs.writeFileSync(path.join(AG, 'limpo.md'), fs.readFileSync(path.join(AG, 'limpo.md'), 'utf8').replace('\nVoce tem um teto de 12 turnos para terminar.\n', ''));
r = run('prompt-audit.mjs', ['--resumo']);
ok('voltou => igual', /\|igual/.test(r.stdout), r.stdout);

console.log('\n== T3 doctor: --prompt-audit, --prompt-audit-baseline, check na varredura ==');
const DOCTOR = path.join(CL, 'harness-doctor.sh');
r = sh(DOCTOR, ['--prompt-audit']);
ok('doctor --prompt-audit imprime os achados e o resumo', r.status === 0 && r.stdout.includes('Auditoria de prompts') && r.stdout.includes('AUDIT|.claude/agents/denso.md|pressao|alto') && r.stdout.includes('AUDIT-RESUMO|'), r.stdout.slice(0, 300) + r.stderr.slice(0, 200));
fs.rmSync(BL);
r = sh(DOCTOR, ['--prompt-audit-baseline']);
ok('doctor --prompt-audit-baseline grava a baseline', r.status === 0 && r.stdout.includes('AUDIT-BASELINE|gravada') && fs.existsSync(BL), r.stdout.slice(-300));
const linhaDoctor = out => (out.split('\n').find(l => /auditoria de prompts/.test(l) && /\[(WARN| OK | N\/A )\]/.test(l)) || '');
r = sh(DOCTOR, [], '', {}, 180000);
let ld = linhaDoctor(r.stdout);
ok('doctor completo: baseline igual => [ OK ] auditoria de prompts (nao alerta)', /\[ OK \] auditoria de prompts/.test(ld) && /igual/.test(ld), ld || r.stdout.slice(-500));
fs.appendFileSync(path.join(AG, 'limpo.md'), '\nVoce tem um teto de 12 turnos para terminar.\n');
r = sh(DOCTOR, [], '', {}, 180000);
ld = linhaDoctor(r.stdout);
ok('doctor completo: +1 alto => [WARN] auditoria de prompts SUBIU', /\[WARN\] auditoria de prompts SUBIU/.test(ld) && /delta=\+1/.test(ld), ld || r.stdout.slice(-500));
ok('doctor lista prompt-audit.mjs nas duas listas de hooks', (r.stdout.match(/prompt-audit\.mjs/g) || []).length >= 2);
r = sh(DOCTOR, [], '', { HARNESS_PROMPT_AUDIT: 'off' }, 180000);
ok('HARNESS_PROMPT_AUDIT=off => [ N/A ] no doctor', /\[ N\/A \] auditoria de prompts desligada/.test(r.stdout), linhaDoctor(r.stdout));
ok('doctor-cached.sh NAO roda a auditoria', !fs.readFileSync(path.join(HOOKS, 'doctor-cached.sh'), 'utf8').includes('prompt-audit'));

// ---------------------------------------------------------------- MELHORIA 4 — relatorio auditado
console.log('\n== T4 task-telemetry: verificacoes com/sem prova ==');
const projW = spawnSync('bash', ['-c', 'cd "$0" && pwd -W', PROJ], { encoding: 'utf8' }).stdout.trim() || PROJ.replace(/\\/g, '/');
const SLUG = projW.replace(/[\/:\\]/g, '-').replace(/^-+/, '');
const SESS = 'sess-3425-aaaa';
const SESSDIR = path.join(HOME, '.claude', 'projects', SLUG, SESS);
const SUBDIR = path.join(SESSDIR, 'subagents');
fs.mkdirSync(SUBDIR, { recursive: true });
const tPai = SESSDIR + '.jsonl';
fs.writeFileSync(tPai, JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), message: { role: 'user', content: 'oi' } }) + '\n');
function transcript(id, papel, final, opts = {}) {
  const f = path.join(SUBDIR, `agent-${id}.jsonl`);
  const t0 = Date.now() - (opts.dur || 120) * 1000;
  const L = [];
  L.push(JSON.stringify({ isSidechain: true, agentId: id, type: 'user', message: { role: 'user', content: opts.prompt || 'Implemente a TASK-001 (packet em .claude/.harness-run/packets/TASK-001.packet.md)' }, timestamp: new Date(t0).toISOString(), sessionId: SESS }));
  L.push(JSON.stringify({ isSidechain: true, agentId: id, type: 'assistant', message: { role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'php -l api/x.php' } }], usage: { input_tokens: 100, output_tokens: 50 } }, timestamp: new Date(t0 + 1000).toISOString(), sessionId: SESS }));
  L.push(JSON.stringify({ isSidechain: true, agentId: id, type: 'assistant', message: { role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: final }], usage: { input_tokens: 10, output_tokens: 20 } }, timestamp: new Date(t0 + (opts.dur || 120) * 1000).toISOString(), sessionId: SESS }));
  fs.writeFileSync(f, L.join('\n') + '\n');
  fs.writeFileSync(f.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: papel, description: opts.desc || 'TASK-001 hefesto', toolUseId: 'toolu_' + id, spawnDepth: 1 }));
  return f;
}
const stopPayload = (id, papel) => JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'SubagentStop', agent_id: id, agent_type: papel, transcript_path: tPai });
const tasksDir = path.join(PROJ, 'prds', '_metrics', 'tasks');
const ultimaLinha = () => { const f = fs.readdirSync(tasksDir).filter(x => x.endsWith('.jsonl'))[0]; return JSON.parse(fs.readFileSync(path.join(tasksDir, f), 'utf8').trim().split('\n').pop()); };
const REL_2DE3 = `# 🔨 Hefesto — TASK-001 (PRD-001): teste

**Status:** ✅ CONCLUÍDA

## Arquivos tocados
- \`api/x.php\` — editado — validacao nova

## Verificações
- Sintaxe: OK (hook lint) / 1 arquivo
  \`\`\`
  $ php -l api/x.php
  No syntax errors detected in api/x.php
  \`\`\`
- Teste unitario: passou (3/3)
  \`\`\`
  $ vendor/bin/phpunit tests/XTest.php
  OK (3 tests, 5 assertions)
  \`\`\`
- Checklist da task: 4/4 itens

## Desvios e observações
- nenhum
`;
transcript('v1', 'hefesto', REL_2DE3);
r = run('task-telemetry.mjs', [], stopPayload('v1', 'hefesto'));
let L1 = ultimaLinha();
ok('3 verificacoes, 2 com fence, 1 sem => verif_total=3, verif_sem_prova=1', L1.verif_total === 3 && L1.verif_sem_prova === 1, JSON.stringify(L1));
ok('status rebaixado ✅ -> ⚠️ com status_motivo', L1.status === '⚠️' && L1.status_motivo === 'verificacao sem prova (1)' && r.stdout.includes('|⚠️'), JSON.stringify(L1) + r.stdout);
const REL_TODAS = REL_2DE3.replace('- Checklist da task: 4/4 itens\n', '- Checklist da task: 4/4 itens\n  saída: itens 1-4 conferidos no diff (ver .claude/.harness-run/relatorios/TASK-001-hefesto.md)\n');
transcript('v2', 'hefesto', REL_TODAS);
run('task-telemetry.mjs', [], stopPayload('v2', 'hefesto'));
L1 = ultimaLinha();
ok('todas provadas (fence + saida:) => verif_sem_prova=0, status ✅, sem motivo', L1.verif_total === 3 && L1.verif_sem_prova === 0 && L1.status === '✅' && L1.status_motivo === '', JSON.stringify(L1));
const REL_CAMINHO = REL_2DE3.replace('- Checklist da task: 4/4 itens\n', '- Checklist da task: 4/4 itens — log em .claude/.harness-run/tmp/checklist-TASK-001.log\n');
transcript('v3', 'hefesto', REL_CAMINHO);
run('task-telemetry.mjs', [], stopPayload('v3', 'hefesto'));
L1 = ultimaLinha();
ok('item que cita caminho de log/relatorio conta como provado', L1.verif_sem_prova === 0 && L1.status === '✅', JSON.stringify(L1));
transcript('v4', 'hefesto', '# 🔨 Hefesto — TASK-001\n\n**Status:** ✅ CONCLUÍDA\n\n## Arquivos tocados\n- `api/x.php` — editado\n\n## Desvios e observações\n- nenhum — o relatorio completo tem mais de duzentos caracteres para contar como relatorio do agente, mas nao tem a secao de verificacoes.\n');
run('task-telemetry.mjs', [], stopPayload('v4', 'hefesto'));
L1 = ultimaLinha();
ok('sem secao "## Verificacoes" => campos vazios e status intacto', L1.verif_total === '' && L1.verif_sem_prova === '' && L1.status_motivo === '' && L1.status === '✅', JSON.stringify(L1));
// item que declara FALHA nao conta como verificacao "de sucesso"
transcript('v5', 'hefesto', '# Hefesto\n\n**Status:** ⚠️ CONCLUÍDA COM RESSALVAS\n\n## Verificações\n- Sintaxe: OK\n  ```\n  php -l ok\n  ```\n- Teste E2E: falhou — timeout no seed (ver Desvios)\n\n## Desvios e observações\n- seed lento, candidato a DT. Este relatorio tem mais de duzentos caracteres.\n');
run('task-telemetry.mjs', [], stopPayload('v5', 'hefesto'));
L1 = ultimaLinha();
ok('item "falhou" nao entra no total; ⚠️ original preservado sem motivo', L1.verif_total === 1 && L1.verif_sem_prova === 0 && L1.status === '⚠️' && L1.status_motivo === '', JSON.stringify(L1));
// 3.4.33: a linha **Status:** manda — texto que cita 'bloqueado' (safe mode) nao vira ⛔ se o relatorio declara ✅
transcript('v6b', 'hefesto', '# Hefesto — TASK-004\n\n**Status:** ✅ CONCLUÍDA\n\n## Desvios e observações\n- ramo de e-mail nao verificado: o envio e bloqueado pelo interceptor de safe mode (fail-closed) — comportamento esperado nesta maquina, sem impacto na entrega; o relatorio completo passa de duzentos caracteres para contar como bloco final.');
run('task-telemetry.mjs', [], stopPayload('v6b', 'hefesto'));
L1 = ultimaLinha();
ok('**Status:** ✅ no relatorio vence o "bloqueado" do texto (nao grava ⛔)', L1.status === '✅' && /linha Status/.test(L1.status_motivo), JSON.stringify(L1));

// knob off: mede mas nao rebaixa
transcript('v6', 'hefesto', REL_2DE3);
run('task-telemetry.mjs', [], stopPayload('v6', 'hefesto'), { HARNESS_VERIF_PROVA: 'off' });
L1 = ultimaLinha();
ok('HARNESS_VERIF_PROVA=off => mede (1 sem prova) mas mantem ✅', L1.verif_sem_prova === 1 && L1.status === '✅' && L1.status_motivo === '', JSON.stringify(L1));
// --ultima ganha o 6o campo, ordem dos 5 primeiros inalterada
transcript('v7', 'hefesto', REL_2DE3, { dur: 300 });
run('task-telemetry.mjs', [], stopPayload('v7', 'hefesto'));
r = run('task-telemetry.mjs', ['--ultima', 'hefesto']);
ok('--ultima => dur|turnos|rotulo|id|status|verif_sem_prova', /^300\|2\|TASK-001\|v7\|⚠️\|1$/.test(r.stdout.trim()), r.stdout);
transcript('v8', 'hefesto', 'Status: ✅ CONCLUÍDA — ' + 'x'.repeat(200), { dur: 200 });
run('task-telemetry.mjs', [], stopPayload('v8', 'hefesto'));
r = run('task-telemetry.mjs', ['--ultima', 'hefesto']);
ok('--ultima sem secao => 6o campo vazio', /^200\|2\|TASK-001\|v8\|✅\|$/.test(r.stdout.trim()), r.stdout);
const TT = await import(pathToFileURL(path.join(HOOKS, 'task-telemetry.mjs')).href);
ok('avaliarVerificacoes nunca lanca (entrada nula / objeto)', TT.avaliarVerificacoes(null).verif_total === '' && TT.avaliarVerificacoes({}).verif_sem_prova === '');

console.log('\n== T5 guard-agent --post: [relatorio] + incidente ==');
const agentPayload = (tipo, prompt, desc = '') => JSON.stringify({ session_id: SESS, cwd: PROJ, hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: tipo, prompt, description: desc }, transcript_path: tPai });
const GA = path.join(HOOKS, 'guard-agent.sh');
transcript('g1', 'hefesto', REL_2DE3);
run('task-telemetry.mjs', [], stopPayload('g1', 'hefesto'));
r = sh(GA, ['--post'], agentPayload('hefesto', 'TASK-001', 'TASK-001 hefesto'));
ok('--post com verif_sem_prova=1 => additionalContext [relatorio] (exit 0)', r.status === 0 && r.stdout.includes('[relatorio] hefesto (TASK-001) declarou 1 verifica') && r.stdout.includes('rebaixado para'), r.stdout.slice(0, 300) + r.stderr.slice(0, 200));
let jsonOk = false; try { const o = JSON.parse(r.stdout); jsonOk = !!(o.hookSpecificOutput && o.hookSpecificOutput.additionalContext); } catch {}
ok('saida e UM JSON valido de hook', jsonOk, r.stdout.slice(0, 200));
const incDir = path.join(PROJ, 'prds', '_metrics', 'incidentes');
const incs = fs.existsSync(incDir) ? fs.readdirSync(incDir).filter(f => f.endsWith('.jsonl')).flatMap(f => fs.readFileSync(path.join(incDir, f), 'utf8').trim().split('\n').map(l => JSON.parse(l))) : [];
const incRel = incs.filter(i => i.tipo === 'relatorio');
ok('incidente tipo relatorio gravado em prds/_metrics/incidentes (schema unico)', incRel.length === 1 && incRel[0].papel === 'hefesto' && incRel[0].rotulo === 'TASK-001' && incRel[0].agent === 'g1' && /verif_sem_prova=1/.test(incRel[0].detalhe) && incRel[0].projeto === 'proj', JSON.stringify(incRel));
// relatorio provado => nada
transcript('g2', 'hefesto', REL_TODAS);
run('task-telemetry.mjs', [], stopPayload('g2', 'hefesto'));
r = sh(GA, ['--post'], agentPayload('hefesto', 'TASK-001', 'TASK-001 hefesto'));
ok('--post com tudo provado => sem [relatorio], sem incidente novo', r.status === 0 && !r.stdout.includes('[relatorio]') && fs.readdirSync(incDir).flatMap(f => fs.readFileSync(path.join(incDir, f), 'utf8').trim().split('\n')).filter(l => l.includes('"tipo":"relatorio"')).length === 1, r.stdout.slice(0, 200));
// watchdog ligado + overrun + sem prova => os dois avisos num JSON so
transcript('g3', 'hefesto', REL_2DE3, { dur: 5000 });
run('task-telemetry.mjs', [], stopPayload('g3', 'hefesto'));
// harness.env.local pinna HARNESS_WATCHDOG='0' (precedencia sobre o env); liga so para este caso
const LOCAL = path.join(CL, 'harness.env.local'), LOCAL0 = fs.readFileSync(LOCAL, 'utf8');
fs.writeFileSync(LOCAL, LOCAL0.replace("HARNESS_WATCHDOG='0'\n", ''));
r = sh(GA, ['--post'], agentPayload('hefesto', 'TASK-001', 'TASK-001 hefesto'));
fs.writeFileSync(LOCAL, LOCAL0);
let both = false; try { const o = JSON.parse(r.stdout); both = /\[relatorio\]/.test(o.hookSpecificOutput.additionalContext) && /\[watchdog\]/.test(o.hookSpecificOutput.additionalContext); } catch {}
ok('overrun + sem prova => [relatorio] e [watchdog] no MESMO additionalContext', both, r.stdout.slice(0, 400));
// knob off => guard silencia
transcript('g4', 'hefesto', REL_2DE3);
run('task-telemetry.mjs', [], stopPayload('g4', 'hefesto'));
r = sh(GA, ['--post'], agentPayload('hefesto', 'TASK-001', 'TASK-001 hefesto'), { HARNESS_VERIF_PROVA: 'off' });
ok('HARNESS_VERIF_PROVA=off => --post sem [relatorio]', !r.stdout.includes('[relatorio]'), r.stdout.slice(0, 200));
// hermes com PARCIAL continua avisando (fluxo antigo preservado)
transcript('h1', 'hermes', 'PARCIAL-TEMPO: faltou tasks/TASK-003. ' + 'x'.repeat(200), { desc: 'hermes Modo C PRD-001', prompt: 'Modo C PRD-001' });
run('task-telemetry.mjs', [], stopPayload('h1', 'hermes'));
r = sh(GA, ['--post'], agentPayload('hermes', 'Modo C PRD-001', 'hermes C'));
ok('--post hermes PARCIAL => aviso por documento continua', r.stdout.includes('[hermes]') && r.stdout.includes('OUTRO hermes por documento'), r.stdout.slice(0, 200));

console.log(`\n== ${pass} PASS · ${fail} FAIL ==`);
if (!fail && !process.env.T_KEEP) fs.rmSync(S, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
