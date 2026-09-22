#!/usr/bin/env node
// tests/t-3426-perfil-poda.mjs — bateria do hooks/perfil-poda.sh (3.4.26: poda do Perfil com PROVA).
// Roda em SANDBOX proprio (projeto falso em os.tmpdir(), sufixo de pid), nunca toca o projeto real.
// Precisa de node >= 18 e bash (Git Bash) no PATH.
//   node tests/t-3426-perfil-poda.mjs
//
// O que prova (mecanico):
//   parse     — secoes fixas do harness (Identificacao, CLI, Banco...) NUNCA viram entrada, mesmo citando
//               caminho morto; paragrafo/lista/tabela/quote viram 1 entrada cada; fence e ignorado.
//   verde     — caminho inexistente (test -e), arquivo solto ausente, tabela.coluna sem a coluna no schema
//               nem no codigo, PRD de origem Revertida no prds/INDEX.md. Caminho absoluto (C:/...) e
//               placeholder (<x>, NNN) NAO contam.
//   amarelo   — parcialmente morta (1 de 2 caminhos), carimbo velho sem referencia viva (respeita --meses e
//               o knob), duplicata provavel (2 termos raros), regra que virou convencao, so-identificador
//               morto (funcao renomeada nunca prova sozinha), "verde" que fala da ausencia de proposito.
//   vermelho  — sem carimbo + caminho vivo; carimbo recente sem referencia; so caminho absoluto.
//   --md      — grava prds/_metrics/perfil-poda-<data>.md com as 3 tabelas e a evidencia.
//   --aplicar — move SO os verdes para .claude/PERFIL-ARQUIVO.md (cabecalho com data + evidencia + texto
//               verbatim), remove do Perfil preservando o resto BYTE A BYTE, avisa do carimbo, e e
//               idempotente (2a vez: verde=0, nada muda); append em PERFIL-ARQUIVO existente preserva o velho.
//   knob off  — HARNESS_PERFIL_PODA='off' (harness.env.local) -> PODA-OFF sem analise; env > arquivo; --force.
//   wiring    — harness.env documenta os knobs; /prd, /prd-exec e o doctor citam o script; sem GNU-ism.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), 'harness-3426-poda-' + process.pid);
const PROJ = path.join(S, 'proj'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const PODA = path.join(HOOKS, 'perfil-poda.sh');
const PERFIL = path.join(PROJ, '.claude', 'PERFIL-PROJETO.md');
const ARQ = path.join(PROJ, '.claude', 'PERFIL-ARQUIVO.md');
const ENVB = { ...process.env, CLAUDECODE: '1' };
delete ENVB.HARNESS_PERFIL_PODA; delete ENVB.HARNESS_PERFIL_PODA_MESES;

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 500)); } };
const sh = (args, env = {}, cwd = PROJ) => spawnSync('bash', [PODA, ...args], { encoding: 'utf8', cwd, env: { ...ENVB, ...env } });
const lê = (p) => fs.readFileSync(p, 'utf8');
const linhas = (out, balde) => out.split('\n').filter((l) => l.startsWith('PODA|' + balde + '|'));
const resumo = (out) => { const m = out.match(/^PODA-RESUMO\|entradas=(\d+)\|verde=(\d+)\|amarelo=(\d+)\|vermelho=(\d+)\|kb=(\d+)$/m); return m ? { entradas: +m[1], verde: +m[2], amarelo: +m[3], vermelho: +m[4], kb: +m[5] } : null; };
const linhaDe = (out, marca) => out.split('\n').find((l) => l.startsWith('PODA|') && l.includes(marca)) || '';

// ---------------------------------------------------------------- sandbox
fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(HOOKS, { recursive: true });
for (const h of ['perfil-poda.sh', 'perfil-frescor.sh']) fs.copyFileSync(path.join(MASTER, '.claude', 'hooks', h), path.join(HOOKS, h));
fs.copyFileSync(path.join(MASTER, '.claude', 'harness.env'), path.join(PROJ, '.claude', 'harness.env'));
fs.writeFileSync(path.join(PROJ, '.claude', 'PERFIL-RESUMO.md'), '# Resumo\n\nprojeto de teste.\n');
fs.mkdirSync(path.join(PROJ, 'administrativo', 'api', 'leads'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'administrativo', 'api', 'leads', 'listar.php'), '<?php\nfunction listarLeads() { return telefoneCanonico($x); }\n$cfg = "dev_safe_mode";\n');
fs.writeFileSync(path.join(PROJ, 'administrativo', 'api', 'x.php'), '<?php\nfunction f() { return 1; }\n');
fs.mkdirSync(path.join(PROJ, 'administrativo', 'api', 'database', 'migrations'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'administrativo', 'api', 'database', 'migrations', '0001_leads.sql'), 'CREATE TABLE `leads` (`id` INT, `nome` VARCHAR(80), `telefone_canonico` VARCHAR(20));\n');
fs.mkdirSync(path.join(PROJ, 'administrativo', 'api', 'manutencao'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'administrativo', 'api', 'manutencao', 'scheduler.php'), '<?php\n// cron_config: is_enabled, ultima_execucao\n');
fs.mkdirSync(path.join(PROJ, 'tests', 'e2e'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'tests', 'e2e', 'PRD-001-vivo.spec.js'), 'test("x", () => {});\n');
fs.mkdirSync(path.join(PROJ, '.claude', 'convencoes'), { recursive: true });
fs.writeFileSync(path.join(PROJ, '.claude', 'convencoes', 'INDEX.md'), '# indice\n');
fs.writeFileSync(path.join(PROJ, '.claude', 'convencoes', 'cron-smart.md'), '# cron\n\n`scheduler.php` + `cron_config` + `is_enabled` + `ultima_execucao`.\n');
fs.mkdirSync(path.join(PROJ, 'prds'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'prds', 'INDEX.md'), '| PRD | Titulo | Status | Obs |\n|---|---|---|---|\n| PRD-001 | viva | Concluída | x |\n| PRD-002 | morta | **Revertida** — desfeita em 2026-05 | revertido em seguida |\n| PRD-004 | prosa | Concluída — gate revertido em seguida | x |\n');
// carimbo "velho": 20 meses atras (independe da data de hoje)
const d = new Date(); d.setMonth(d.getMonth() - 20); const VELHO = d.toISOString().slice(0, 10);
const d2 = new Date(); d2.setMonth(d2.getMonth() - 1); const RECENTE = d2.toISOString().slice(0, 10);

const PERFIL_TXT = `# Perfil do projeto — teste

## Identificação

| Campo | Valor |
|---|---|
| **Nome** | teste |
| **Doc** | \`docs/fixa/nao-existe.md\` |

## CLI (ambiente local)

- PHP: \`C:/laragon/bin/php/php.exe\` e \`api/fixa/morto.php\` (secao fixa: nunca podavel)

## Banco de dados (teste local)

- \`api/fixa/morto2.php\`

## Estrutura de diretórios do projeto

| Tipo | Caminho |
|------|---------|
| **Endpoints** | \`administrativo/api/<recurso>/<acao>.php\` |
| **Migrations** | \`administrativo/api/database/migrations/\` (\`XXXX_descricao.sql\`) |

## Armadilhas do projeto (anti-patterns)

**[${RECENTE} · PRD-001]** 🔴 **VERDE-CAMINHO** — o endpoint \`api/morto/nunca_existiu_assim.php\` devolve
lista vazia quando o filtro vem sem token. *Como fazer:* validar antes.

**[${RECENTE} · PRD-001]** **VERDE-COLUNA** — \`leads.coluna_fantasma\` precisa ser NULL no seed, senao o
join quebra (tabela \`leads\` existe; a coluna nao).

**[${VELHO} · PRD-002]** **VERDE-REVERTIDA** — regra da PRD-002, que foi desfeita: nada mais cita.

**[${RECENTE} · PRD-001]** **AMARELO-PARCIAL** — \`api/leads/listar.php\` e \`api/leads/morto_parcial.php\`
compartilham o helper.

**[${VELHO} · PRD-001]** **AMARELO-VELHO** — regra antiga sem nenhuma referencia verificavel no texto.

**[${RECENTE} · PRD-001]** **AMARELO-SO-IDENTIFICADOR** — chame \`funcaoQueSumiuDoCodigo()\` antes do commit.

**[${RECENTE} · PRD-001]** **AMARELO-AUSENCIA** — o arquivo \`api/legado/velho_removido.php\` foi removido
de proposito; nunca recrie.

**[${RECENTE} · PRD-001]** **AMARELO-DUP-A** — \`telefoneCanonico()\` e \`gatilhoRaroUm\` andam juntos no \`listar.php\`.

**[${RECENTE} · PRD-001]** **AMARELO-DUP-B** — \`gatilhoRaroUm\` sempre com \`telefoneCanonico()\`, mesmo conceito.

**[${RECENTE} · PRD-001]** **AMARELO-CONVENCAO** — cron so via \`scheduler.php\` + \`cron_config\` com \`is_enabled\`
e \`ultima_execucao\`.

**VERMELHO-SEM-CARIMBO** — \`api/leads/listar.php\` filtra por \`dev_safe_mode\`; caminho vivo, sem carimbo.

**[${RECENTE} · PRD-001]** **VERMELHO-RECENTE** — regra recente sem referencia verificavel.

**[${RECENTE} · PRD-004]** **VERMELHO-PROSA-REVERTIDA** — a palavra "revertido" na prosa do INDEX nao e status.

**VERMELHO-ABSOLUTO** — use \`C:/laragon/bin/mysql/mysql.exe\` e \`/Applications/MAMP/bin/php\` (maquina, nao repo).

\`\`\`
api/dentro/de/fence_morto.php
\`\`\`

## Armadilhas de teste/seed (E2E)

- **[${RECENTE} · PRD-001]** VERDE-LISTA — molde em \`tests/e2e/PRD-001-sumiu.spec.js\` (molde antigo).
- **[${RECENTE} · PRD-001]** VERMELHO-LISTA — molde em \`tests/e2e/PRD-001-vivo.spec.js\`.
- Item sem nada verificavel (VERMELHO-LISTA-2)
  com continuacao na linha seguinte.

> 🔴 **VERMELHO-QUOTE** com \`PRD-001-vivo.spec.js\` vivo.
`;
fs.writeFileSync(PERFIL, PERFIL_TXT);
console.log('sandbox:', PROJ);

console.log('\n== T0 sintaxe e portabilidade ==');
let r = spawnSync('bash', ['-n', PODA], { encoding: 'utf8' });
ok('bash -n perfil-poda.sh', r.status === 0, r.stderr);
const src = lê(PODA);
ok('sem GNU-ism (find -printf, sed -i, ${x,,}, readarray, gensub, asort)', !/find [^\n]*-printf|sed -i /.test(src) && !/\$\{[a-zA-Z_]+,,\}/.test(src) && !/readarray|mapfile|gensub\(|asort\(|length\([A-Z]+\)/.test(src));
ok('read-only por padrao (so --aplicar-verde escreve no Perfil)', (src.match(/> "\$PERFIL"/g) || []).length === 1 && src.includes('MODO_APLICAR'));

console.log('\n== T1 baldes (read-only) ==');
r = sh([]);
ok('exit 0 e PODA-RESUMO presente', r.status === 0 && resumo(r.stdout) !== null, r.stdout.slice(-300) + r.stderr);
const R1 = resumo(r.stdout), out1 = r.stdout;
ok('secoes fixas nunca viram entrada (Identificacao/CLI/Banco citam caminho morto e nao aparecem)', !/^PODA\|[a-z]+\|(Identificação|CLI|Banco)/m.test(out1), out1.split('\n').filter((l) => /Identifica|CLI|Banco/.test(l)).join(' | '));
ok('fence ignorado (fence_morto.php nao gera entrada)', !out1.includes('fence_morto'));
ok('contagem: entradas=19', R1 && R1.entradas === 19, JSON.stringify(R1));
ok('contagem: verde=4 amarelo=7 vermelho=8', R1 && R1.verde === 4 && R1.amarelo === 7 && R1.vermelho === 8, JSON.stringify(R1));
ok('kb do Perfil no resumo', R1 && R1.kb >= 3 && R1.kb <= 6, JSON.stringify(R1));
// verdes
ok('VERDE-CAMINHO: verde com "test -e api/morto/nunca_existiu_assim.php → AUSENTE"', /^PODA\|verde\|Armadilhas do projeto \(anti-patterns\)\|\d+\|.*VERDE-CAMINHO.*\|.*test -e api\/morto\/nunca_existiu_assim\.php → AUSENTE/m.test(out1), linhaDe(out1, 'VERDE-CAMINHO'));
ok('VERDE-COLUNA: verde com "grep -rw coluna_fantasma ... AUSENTE (tabela leads existe)"', /^PODA\|verde\|.*VERDE-COLUNA.*coluna_fantasma.*AUSENTE \(tabela leads existe\)/m.test(out1), linhaDe(out1, 'VERDE-COLUNA'));
ok('VERDE-REVERTIDA: verde pela coluna Status do prds/INDEX.md', /^PODA\|verde\|.*VERDE-REVERTIDA.*PRD de origem PRD-002 marcada/m.test(out1), linhaDe(out1, 'VERDE-REVERTIDA'));
ok('VERDE-LISTA (E2E): verde, arquivo solto de spec ausente', /^PODA\|verde\|Armadilhas de teste\/seed \(E2E\)\|\d+\|.*VERDE-LISTA.*PRD-001-sumiu\.spec\.js → AUSENTE/m.test(out1), linhaDe(out1, 'VERDE-LISTA'));
// amarelos
ok('AMARELO-PARCIAL: 1 de 2 caminhos morto -> amarelo, nunca verde', /^PODA\|amarelo\|.*AMARELO-PARCIAL.*parcialmente morta \(vivos=1 mortos=1\)/m.test(out1), linhaDe(out1, 'AMARELO-PARCIAL'));
ok('AMARELO-VELHO: carimbo > 12 meses sem referencia viva', new RegExp(`^PODA\\|amarelo\\|.*AMARELO-VELHO.*carimbo ${VELHO} \\(20 meses > 12\\)`, 'm').test(out1), linhaDe(out1, 'AMARELO-VELHO'));
ok('AMARELO-SO-IDENTIFICADOR: funcao ausente do codigo NAO prova sozinha (amarelo)', /^PODA\|amarelo\|.*AMARELO-SO-IDENTIFICADOR.*so identificador\(es\) morto\(s\).*funcaoQueSumiuDoCodigo/m.test(out1), linhaDe(out1, 'AMARELO-SO-IDENTIFICADOR'));
ok('AMARELO-AUSENCIA: caminho morto MAS texto fala da ausencia de proposito -> amarelo', /^PODA\|amarelo\|.*AMARELO-AUSENCIA.*ausencia de proposito/m.test(out1), linhaDe(out1, 'AMARELO-AUSENCIA'));
ok('AMARELO-DUP-A/B: duplicata provavel apontando a linha da outra', /^PODA\|amarelo\|.*AMARELO-DUP-A.*duplicata provavel de L\d+/m.test(out1) && /^PODA\|amarelo\|.*AMARELO-DUP-B.*duplicata provavel de L\d+/m.test(out1), linhaDe(out1, 'AMARELO-DUP-A'));
ok('AMARELO-CONVENCAO: regra que virou convencao da casa (cron-smart.md)', /^PODA\|amarelo\|.*AMARELO-CONVENCAO.*convencao da casa: cron-smart\.md/m.test(out1), linhaDe(out1, 'AMARELO-CONVENCAO'));
// vermelhos
ok('VERMELHO-SEM-CARIMBO: caminho vivo + sem carimbo -> vermelho com refs vivas', /^PODA\|vermelho\|.*VERMELHO-SEM-CARIMBO.*refs vivas=\d+:.*api\/leads\/listar\.php.*sem carimbo/m.test(out1), linhaDe(out1, 'VERMELHO-SEM-CARIMBO'));
ok('VERMELHO-RECENTE: carimbo recente sem referencia -> vermelho', /^PODA\|vermelho\|.*VERMELHO-RECENTE.*sem referencia verificavel; carimbo/m.test(out1), linhaDe(out1, 'VERMELHO-RECENTE'));
ok('VERMELHO-PROSA-REVERTIDA: "revertido" na prosa do INDEX nao e status', /^PODA\|vermelho\|.*VERMELHO-PROSA-REVERTIDA/m.test(out1), linhaDe(out1, 'VERMELHO-PROSA-REVERTIDA'));
ok('VERMELHO-ABSOLUTO: caminho absoluto nao e evidencia (sem referencia verificavel)', /^PODA\|vermelho\|.*VERMELHO-ABSOLUTO.*sem referencia verificavel/m.test(out1), linhaDe(out1, 'VERMELHO-ABSOLUTO'));
ok('Estrutura de diretorios com placeholders (<recurso>, XXXX) -> vermelho', /^PODA\|vermelho\|Estrutura de diretórios do projeto\|/m.test(out1), linhaDe(out1, 'Estrutura'));
ok('lista com continuacao = 1 entrada; quote = 1 entrada (vermelho)', /^PODA\|vermelho\|.*VERMELHO-LISTA-2/m.test(out1) && /^PODA\|vermelho\|.*VERMELHO-QUOTE.*refs vivas=1/m.test(out1), linhaDe(out1, 'VERMELHO-QUOTE'));
ok('linha reportada e a do Perfil (VERDE-CAMINHO na linha 27)', /^PODA\|verde\|[^|]*\|27\|/m.test(out1), linhaDe(out1, 'VERDE-CAMINHO'));

console.log('\n== T2 --meses / knob MESES / --resumo / --root ==');
r = sh(['--meses', '30']);
ok('--meses 30: AMARELO-VELHO (20 m) deixa de ser amarelo -> vermelho', /^PODA\|vermelho\|.*AMARELO-VELHO/m.test(r.stdout), linhaDe(r.stdout, 'AMARELO-VELHO'));
r = sh([], { HARNESS_PERFIL_PODA_MESES: '30' });
ok('HARNESS_PERFIL_PODA_MESES=30 (env) tem o mesmo efeito', /^PODA\|vermelho\|.*AMARELO-VELHO/m.test(r.stdout));
r = sh(['--resumo']);
ok('--resumo imprime SO a linha PODA-RESUMO', r.stdout.trim().split('\n').length === 1 && resumo(r.stdout) !== null && resumo(r.stdout).verde === 4, r.stdout);
r = sh(['--root', PROJ], {}, MASTER);
ok('--root <dir> a partir de outro cwd analisa o projeto apontado', resumo(r.stdout) && resumo(r.stdout).entradas === 19, r.stdout.slice(-200));
r = spawnSync('bash', [path.join(MASTER, '.claude', 'hooks', 'perfil-poda.sh'), '--root', path.join(S, 'nao-existe')], { encoding: 'utf8', env: ENVB });
ok('--root invalido: exit 2', r.status === 2);

console.log('\n== T3 --md ==');
r = sh(['--md']);
const mdm = r.stdout.match(/^PODA-MD\|(.+)$/m);
ok('PODA-MD|prds/_metrics/perfil-poda-<data>.md', mdm && /^prds\/_metrics\/perfil-poda-\d{4}-\d{2}-\d{2}\.md$/.test(mdm[1]), r.stdout.slice(-200));
const md = mdm ? lê(path.join(PROJ, mdm[1])) : '';
ok('md: 3 tabelas por balde + peso por secao + estimativas de KB', md.includes('## 🟢 Morto-provado') && md.includes('## 🟡 Suspeito') && md.includes('## 🔴 Intocável') && md.includes('## Peso por seção') && /KB estimado após 🟢\+🟡/.test(md));
ok('md: evidencia colada na tabela verde', /\| \d+ \| Armadilhas do projeto \(anti-patterns\) \| .*VERDE-CAMINHO.* \| .*test -e api\/morto\/nunca_existiu_assim\.php → AUSENTE/.test(md));
ok('md: Perfil NAO foi tocado pelo --md', lê(PERFIL) === PERFIL_TXT);

console.log('\n== T4 --aplicar-verde ==');
const antes = lê(PERFIL);
fs.writeFileSync(ARQ, '# Perfil — ARQUIVO (entradas podadas)\n\nconteudo anterior que precisa sobreviver.\n');
r = sh(['--aplicar-verde']);
ok('PODA-APLICADA|verde=4|arquivo=.claude/PERFIL-ARQUIVO.md', /^PODA-APLICADA\|verde=4\|arquivo=\.claude\/PERFIL-ARQUIVO\.md$/m.test(r.stdout), r.stdout.slice(-300) + r.stderr);
ok('avisa que o RESUMO precisa ser regerado e carimbado (perfil-frescor.sh --carimbar)', /^PODA-AVISO\|.*perfil-frescor\.sh --carimbar/m.test(r.stdout));
const depois = lê(PERFIL), arq = lê(ARQ);
ok('PERFIL-ARQUIVO preservou o conteudo anterior e ganhou a secao datada', arq.startsWith('# Perfil — ARQUIVO (entradas podadas)\n\nconteudo anterior que precisa sobreviver.\n') && /^## Poda de \d{4}-\d{2}-\d{2} — 4 entrada\(s\) 🟢/m.test(arq));
ok('PERFIL-ARQUIVO traz secao de origem, linhas, evidencia e o texto VERBATIM de cada verde', /### Seção «Armadilhas do projeto \(anti-patterns\)» · linhas 27–28/.test(arq) && arq.includes('**Evidência:**  test -e api/morto/nunca_existiu_assim.php → AUSENTE;') && arq.includes('🔴 **VERDE-CAMINHO** — o endpoint `api/morto/nunca_existiu_assim.php` devolve\nlista vazia quando o filtro vem sem token. *Como fazer:* validar antes.') && arq.includes('VERDE-LISTA — molde em `tests/e2e/PRD-001-sumiu.spec.js`'), arq.slice(0, 900));
for (const m of ['VERDE-CAMINHO', 'VERDE-COLUNA', 'VERDE-REVERTIDA', 'VERDE-LISTA']) ok(`Perfil sem ${m}`, !depois.includes(m));
// byte a byte: o esperado e o original menos os blocos verdes (+ a linha em branco seguinte de cada um)
const esperado = antes
  .replace(/\*\*\[[^\]]+\]\*\* 🔴 \*\*VERDE-CAMINHO\*\*[^\n]*\n[^\n]*\n\n/, '')
  .replace(/\*\*\[[^\]]+\]\*\* \*\*VERDE-COLUNA\*\*[^\n]*\n[^\n]*\n\n/, '')
  .replace(/\*\*\[[^\]]+\]\*\* \*\*VERDE-REVERTIDA\*\*[^\n]*\n\n/, '')
  .replace(/- \*\*\[[^\]]+\]\*\* VERDE-LISTA[^\n]*\n/, '');
ok('resto do Perfil preservado BYTE A BYTE (so os 4 blocos verdes sairam)', depois === esperado, `len ${depois.length} vs ${esperado.length}`);
ok('secoes fixas intactas (inclusive os caminhos mortos delas)', depois.includes('`api/fixa/morto.php` (secao fixa: nunca podavel)') && depois.includes('- `api/fixa/morto2.php`'));
r = sh(['--aplicar-verde']);
ok('2a passada: verde=0, nada a mover, arquivos inalterados', /^PODA-APLICADA\|verde=0\|.*nada a mover/m.test(r.stdout) && lê(PERFIL) === depois && lê(ARQ) === arq, r.stdout.slice(-200));
const R4 = resumo(r.stdout);
ok('apos a poda: entradas=15, amarelo=7 (🟡 NUNCA e movido)', R4 && R4.entradas === 15 && R4.verde === 0 && R4.amarelo === 7, JSON.stringify(R4));
// PERFIL-ARQUIVO criado do zero quando nao existe
fs.rmSync(ARQ); fs.writeFileSync(PERFIL, antes);
r = sh(['--aplicar-verde']);
ok('sem PERFIL-ARQUIVO: cria com o cabecalho "Nada é deletado"', fs.existsSync(ARQ) && lê(ARQ).startsWith('# Perfil — ARQUIVO (entradas podadas)\n\n> **Nada é deletado: poda é mudança de lugar.**'), (fs.existsSync(ARQ) ? lê(ARQ) : '').slice(0, 200));
ok('Perfil podado igual ao da 1a passada', lê(PERFIL) === depois);
fs.writeFileSync(PERFIL, antes); fs.rmSync(ARQ);

console.log('\n== T5 knob HARNESS_PERFIL_PODA ==');
const LOCALF = path.join(PROJ, '.claude', 'harness.env.local');
fs.writeFileSync(LOCALF, "HARNESS_PERFIL_PODA='off'\n");
r = sh([]);
ok("harness.env.local off: PODA-OFF, nenhuma linha PODA| e exit 0", r.status === 0 && /^PODA-OFF\|/m.test(r.stdout) && !/^PODA\|/m.test(r.stdout) && !/^PODA-RESUMO/m.test(r.stdout), r.stdout);
r = sh(['--aplicar-verde']);
ok('off: --aplicar-verde NAO escreve nada', /^PODA-OFF\|/m.test(r.stdout) && lê(PERFIL) === antes && !fs.existsSync(ARQ));
r = sh(['--force']);
ok('--force ignora o off', resumo(r.stdout) && resumo(r.stdout).verde === 4);
r = sh([], { HARNESS_PERFIL_PODA: 'sugerir' });
ok('env HARNESS_PERFIL_PODA=sugerir vence o harness.env.local', resumo(r.stdout) !== null);
fs.writeFileSync(LOCALF, "HARNESS_PERFIL_PODA='auto-verde'\n");
r = sh([]);
ok('auto-verde SEM --aplicar-verde continua read-only (a skill e quem aplica)', resumo(r.stdout) && resumo(r.stdout).verde === 4 && lê(PERFIL) === antes && !fs.existsSync(ARQ));
fs.rmSync(LOCALF);
fs.rmSync(PERFIL);
r = sh([]);
ok('sem Perfil: PODA-SEM-PERFIL, exit 3', r.status === 3 && /^PODA-SEM-PERFIL\|/m.test(r.stdout));
fs.writeFileSync(PERFIL, antes);
r = sh(['--xyz']);
ok('argumento desconhecido: exit 2', r.status === 2);

console.log('\n== T6 wiring (mestre) ==');
const envm = lê(path.join(MASTER, '.claude', 'harness.env'));
ok('harness.env documenta HARNESS_PERFIL_PODA (sugerir|auto-verde|off) e _MESES', envm.includes("# HARNESS_PERFIL_PODA='sugerir'") && envm.includes("# HARNESS_PERFIL_PODA_MESES='12'") && /PODA DO PERFIL \(3\.4\.26/.test(envm));
ok('/prd (ultima task) cita perfil-poda.sh + candidatos a poda', /perfil-poda\.sh/.test(lê(path.join(MASTER, '.claude', 'skills', 'prd', 'SKILL.md'))) && lê(path.join(MASTER, '.claude', 'skills', 'prd', 'SKILL.md')).includes('Perfil — candidatos a poda'));
const pe = lê(path.join(MASTER, '.claude', 'skills', 'prd-exec', 'SKILL.md'));
ok('/prd-exec 5.6 cita --aplicar-verde + PERFIL-ARQUIVO.md no commit + 🟡 nunca sozinho', pe.includes('perfil-poda.sh --aplicar-verde') && pe.includes('PERFIL-ARQUIVO.md') && /🟡 nunca sozinho/.test(pe));
const doc = lê(path.join(MASTER, '.claude', 'harness-doctor.sh'));
ok('doctor: check informativo (Perfil > 40 KB roda --resumo) e lista o hook', doc.includes('perfil-poda.sh" --resumo') && /for h in [^\n]*perfil-poda\.sh/.test(doc));
const deus = path.join(MASTER, '..', '..', '..', '.claude', 'skills', 'deus', 'SKILL.md');
if (fs.existsSync(deus)) ok('/deus P1 aponta para o script', lê(deus).includes('perfil-poda.sh --md'));

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
if (!fail) { try { fs.rmSync(S, { recursive: true, force: true }); } catch {} }
process.exit(fail ? 1 : 0);
