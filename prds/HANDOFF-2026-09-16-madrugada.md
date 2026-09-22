---
tipo: handoff
data: 2026-09-16
harness: 3.5.6 (publicada 03:50)
status: CONCLUÍDO pela sessão autônoma (Fable, 01:07→04:10) — checkpoints e pendências do Charles no §1
---

# HANDOFF — madrugada de 16/09/2026 (continuação do monitor da noite de 15/09)

> Para a próxima sessão do vault (Charles vai dormir; tudo abaixo é autônomo, sem push, sem perguntar o que já está decidido).
> Leia ANTES: `prds/MONITOR-EXECS-2026-09-15-noite.md` (D1–D18, Fechamento de 137-c e 145), `prds/debito_tecnico/DT-010` e `DT-011`,
> `dra-mariana-duarte/prds/PLANO-EXEC-PARALELA-2026-09-15.md`. Memória: `project_harness_monitor_15set_criacoes`, `project_harness_dt010_pool_duelo`.

## 1. Estado no momento do handoff (00:50)

| Frente | Estado | Onde |
|---|---|---|
| Harness 3.5.5 | publicada (vault `ffc88de`), sincronizada na Mariana (`1ae1abfd`, `a0e3c61a`), daemon `f724e4be8c86`; provada em campo: C1 (esforço pelo processo), C2 (hook Skill), C6 (lock no stop) | mestre `projetos/referencias/harness` |
| PRD-137-c | exec fechada 23:14 (76 min, 9 tasks) e **mergeada** na main (`17b8232e`) + docs renumerados 0201→0202 e ACL regenerado (`fe4802fa`); migration 0202 aplicada no banco local | main da Mariana |
| PRD-145 | exec fechada 23:36 (98 min, 7 tasks) e **mergeada** (fast-forward, `345cd49c`) | main |
| PRD-141-b | exec fechada 00:55 (178 min, 6 tasks, review solo-2) e **mergeada** na main (`3530fcf7`; conflitos só em CLAUDE.md/_fila.md, união); Perfil recarimbado + ACL regenerado (`0baded01`) | main |
| PRD-144 | **em execução** desde 00:54 (sessão `88df372a`, Sonnet `medium`, worktree `dra-mariana-duarte--wt-exec-144`, branch `wt/exec-144` da main `fe4802fa`, banco `cjzawcndgj_local_wt_exec_144`, porta 3103); reserva `seq/MIG-200` já em nome dela; `PRD-144.lock` tomado | worktree |
| PRD-140-b | **criação em andamento** desde 00:53 (sessão `a5ade6c1`, Opus `high`, worktree `dra-mariana-duarte--wt-prd-140b`, branch `wt/prd-140b`, banco `cjzawcndgj_local_wt_prd_140b`, porta 3104); `--noturno` emendado com `/prd-exec` na mesma sessão (decisão do Charles); `_auto-prd-fase1.json` 00:53:25 | worktree |
| Main da Mariana | `0baded01`, **13 commits à frente da origin, sem push** (push = deploy). Limpa (Charles commitou o DT-418 às 00:5x). Aviso do carimbo do Perfil: `DERIVADO|redacao-empilhada|linhas 92 e 94` do RESUMO parecem a mesma informação — consolidar na próxima passada de Perfil | main |
| Codex CLI | em LIMITE DE USO até 16/09 23:30 (D17) — reviews caem em SOLO-2, discovery em nativo; esperado, não é erro | máquina |
| Pastas mortas | `--wt-ideia-046/048`, `--wt-prd-137c/141b`, `--wt-exec-145/137c` seguem no disco presas pelas abas; apagar quando ele fechar as abas | disco |

### Checkpoints da sessão autônoma (Fable, iniciada 01:07)

- **02:08 · Fase 1 em curso (vigiar) — checkpoint parcial.** Vigia armado (`monitor-execs.js` no scratchpad da sessão `67eac184`, rearmado a cada retorno; nota `MONITOR-EXECS-2026-09-16-madrugada.md` com E1–E4 + linha do tempo). **144**: exec desde 00:54, 8/9 tasks commitadas na `wt/exec-144` (TASK-008 parte 1 às ~01:47; falta 008 parte 2/009 + review), 3 tetos de Playwright (TASK-007/006/002) e 6 créditos de e2e-lock — D4/D5 confirmados. **140-b**: criação fechou 01:46 (fase 1 = 14 min, fase 2 = 38 min, gate c1 beholder/michelangelo), exec emendada decolou 01:46:31 na mesma sessão (C2 provado), onda 1 fechada (5 tasks em 4–7 min cada), MIG-203 reservada pelo guard. Codex segue em limite (SOLO-2).
- **3.5.6 JÁ IMPLEMENTADA fora do mestre** (regra "nunca mexer no harness com exec viva" respeitada): cópia de trabalho em `<scratchpad da sessão>/h356/` (`.claude/` + `tests/` + `CHANGELOG.md`), suítes **t-354 59/0, t-355 38/0, t-356 78/0** (24 casos). Patch completo durável em `prds/WIP-3.5.6-madrugada.patch` (24 arquivos, +822/−182) e a suíte em `prds/WIP-t-356-madrugada.mjs` — se esta sessão morrer, a próxima aplica com `git apply` (ou copia os arquivos do h356) na Fase 4, roda as 3 suítes, e apaga os dois WIP-*. Escopo A completo; escopo B: flags desligadas (lock-espera, serial/novato) + codex-limite compartilhado + aplicado/placar; themis-solo e prompt do worker só no relatório.
- **03:22 · Fase 2 parcial — 144 MERGEADA.** Exec fechada 03:16 (142 min, 9 tasks, 3 ciclos, 18 subagentes, SOLO-2 em 3 partes + michelangelo ⛔ → 4 bloqueantes corrigidos); merge `ec4a0f91` (conflitos: CLAUDE.md união; PERFIL-PROJETO armadilhas da 144 renumeradas 116–119 — a 141-b já tinha a 115); ganchos da 137-c ok (8 refs); migration 0200 aplicada no banco local (7 marcações migradas, backfill 1.288 contatos); ACL + Perfil no `185eaeef`; lint verde (13 PHP, 27 JS). Main limpa em `185eaeef`, 27 commits à frente da origin, sem push. 140-b ainda em exec (Fase 2/3 às 03:20). Achados E5 (140-b sem commit por task) e E6 (frente liberada com exec viva) na nota.
- **03:38 · FASE 2 CONCLUÍDA — 144 e 140-b mergeadas.** 140-b: exec fechada 03:29 (102 min, 9 tasks, 2 ciclos, 13 subagentes, 1 commit só — E5), merge `6239250c` (conflito só em `_fila.md`, união), migration 0203 no banco local, ACL/Perfil sem diff. Main da Mariana LIMPA em `6239250c`, **32 commits à frente da origin, sem push**; nenhuma worktree/lock/frente viva (pastas `--wt-exec-144`/`--wt-prd-140b` presas pelas abas). Comparativo das 10 PRDs rodado e gravado na nota da madrugada. Lint verde: 28 PHP + 40 JS do delta. Próximo: Fase 3 (guia) com as famílias de specs rodadas UMA vez contra a main, e Fase 4 (3.5.6) em paralelo.
- **03:52 · FASE 4 CONCLUÍDA (3.5.6 no mestre e na Mariana).** Mestre: 24 arquivos + `hooks/_defaults.env` + `tests/t-356-madrugada.mjs`; suítes t-354 59/0, t-355 38/0, t-356 79/0; `HARNESS_VERSION=3.5.6`; CHANGELOG + ONBOARDING. Mariana: `harness-sync.sh --apply` (22 + 1 copiados, 0 erros; único CONFLITO = `db-test.sh` guardado, esperado), `daemon --ensure` (porta 47831, hooks e51f3193d782), doctor `[ OK ] duelo: pool=… origem=.harness.env.local` (o `~/.harness.env.local` do PC AINDA define HARNESS_DUELO_* — NÃO removi de propósito: os outros projetos do PC seguem na 3.5.5 e dependem dessas chaves até o `/deus`; remover depois — ONBOARDING 3.5.6). Commit escopado na main da Mariana (sem push). Escopo B: lock-espera e serial/novato atrás de flag OFF; DT do e2e-lock no projeto e themis-solo/prompt do worker propostos no relatório. Fase 3 em curso: famílias de specs rodando contra a main (a main não tinha `@playwright/test` — instalado com `npm i --no-save`, sem tocar package.json); guia rascunhado, falta o placar.
- **04:10 · FASES 3 E 5 CONCLUÍDAS — sessão autônoma encerrada.** Guia pré-deploy em `dra-mariana-duarte/prds/GUIA-PRE-DEPLOY-2026-09-16.md` (commit `eec74b92`): 141-b/144/140-b por PRD (usuário, sistema, risco, reversão, checklist), 137-c/145 como "já em produção", placar (famílias contra a main: 281 verdes, 3 vermelhas, 17 puladas — **a 144 reabre o DT-598: Enviar a 730 px em 1280×720, determinístico**; 2 falhas de contrato `sem token` pré-existentes; spec da migração da 144 apontava o banco da worktree — corrigido, `a11fff55`). Relatório `prds/RELATORIO-3.5.6-2026-09-16.md` no mestre; DT-600 (e2e-lock espera) no projeto (`1f1f702c`); notas da noite e da madrugada fechadas (E1–E7); memória atualizada. Main da Mariana LIMPA em `eec74b92`, **36 commits à frente da origin, sem push**. **Para o Charles:** ler o guia e decidir o push (backup antes: 0200 mexe em dado); DT-598 reaberto → **corrigido 08:30 (`a5b9ba5e`)**; `/deus` nos outros projetos e só depois apagar `HARNESS_DUELO_*` do `~/.harness.env.local`; ligar `HARNESS_PW_LOCK_ESPERA` junto com o DT-600; apagar as pastas `--wt-*` presas.
- **Pendências desta sessão, na ordem:** (1) vigiar até 144 e 140-b fecharem; (2) merges (receita §2 item 2; 144 com ganchos da 137-c + migration 0200 no banco local; 140-b por último, migration 0203); (3) comparativo 10 PRDs; (4) mini-guia pré-deploy — NOTA: `origin/main` = `56a91534` (137-c e 145 JÁ estão em produção: pipeline #571 verde às 00:55, migrate.php roda no deploy) — o guia cobre `origin/main..HEAD` (141-b, 144, 140-b) e registra 137-c/145 como "já em produção"; (5) aplicar 3.5.6 no mestre + sync na Mariana + daemon; (6) relatório + fechar notas + memória.

## 2. O que a próxima sessão faz, na ordem

1. **Rearmar o vigia** (scripts agora versionados em `tests/analise/monitor/`): copie `monitor-execs.js`, `sumario.js`, `compara-prds.js`
   e `resolve-index.js` para o scratchpad da sessão nova; em `monitor-execs.js` troque `NOTA_MD` para a nota da madrugada (crie
   `prds/MONITOR-EXECS-2026-09-16-madrugada.md` com o mesmo cabeçalho/`<!-- monitor:auto -->`) e `PROJETOS` para
   `dra-mariana-duarte--wt-exec-141b`, `--wt-exec-144`, `--wt-prd-140b` e `dra-mariana-duarte`; `node monitor-execs.js --baseline`;
   depois `node monitor-execs.js --max-min 25 --intervalo-s 90` em `Bash run_in_background` e rearme a cada retorno (NUNCA Monitor/TaskStop:
   órfão no Windows). Atenção: horários "00:xx" comparados como string ficam antes de "23:xx" — filtre por timestamp ISO.
2. **141-b: FEITO às 00:56** (merge `3530fcf7`, carimbo+ACL `0baded01`, run registrada no Fechamento da nota). A receita que vale
   para os merges seguintes (144 e 140-b): com a main LIMPA, `bash .claude/hooks/harness-worktree.sh fechar <rot> --merge` no checkout
   principal; conflitos só de docs → `node resolve-index.js <arquivo>` (união; trata CRLF) e `git commit --no-edit`; conferir
   `grep -rn '^<<<<<<< ' CLAUDE.md prds/INDEX.md docs/manual/_fila.md`; `php tools/acl-matriz.php --gerar` (php 7.4 em
   `C:/laragon/bin/php/php-7.4.1-nts-Win32-vc15-x64/php.exe`), `bash .claude/hooks/perfil-frescor.sh --carimbar` → commit `chore(acl+perfil)`.
   As pastas `--wt-*` ficam presas pelas abas (`Permission denied`, exit 0): esperado.
3. **144:** vigiar do mesmo jeito. Riscos conhecidos: tetos de Playwright em tasks de spec (D5/D6), e2e-lock entre dedalos (D4),
   `cat .env` (D3) — anotar recorrências, não intervir. No fim: merge (ordem: depois da 141-b), `grep` dos ganchos da 137-c em
   `mensagens_inbox.js` (`CuradoriaEnvio.esconder`, `CuradoriaEnvio.mostrar`, `INBOX_PROVENIENCIA_ORDEM`), migration 0200 no banco
   local (`php administrativo/api/database/migrate.php` — mexe em dado: inativa ABORDAR, backfill), ACL regen, perfil carimbo.
4. **140-b:** criação `--noturno` emendada com exec na mesma sessão (decisão do Charles, dorme). Esperar `PRD-140-b-fase1/fase2`
   e depois `PRD-140-b-exec.json`; o `esforco.sh pensar` vai acusar `AJUSTAR` (aba em `medium`) e em noturno segue — anotar.
   No fim: merge por último (área pacotes/venda/financeiro, disjunta).
5. **Comparativo das últimas 10 PRDs** (pedido do Charles): `node compara-prds.js "C:\laragon\www\dra-mariana-duarte" 10` DEPOIS dos
   merges (as runs `~exec-*.jsonl` só entram na main pelo merge). Ler: min/task, paralelismo, thinking %, esforço, tokens, por
   versão do harness (3.4.34 → 3.5.3 → 3.5.4 → 3.5.5). Prévia já medida: 137-c 8,4 min/task e 145 14 min/task na 3.5.5 contra
   31 (137-b) e 28 (143-b) na 3.5.4 e 12–14 na 3.5.3.
6. **Fechar a nota da noite:** Fechamento da 141-b, 144, 140-b; "Conclusão da noite" com a lista da **3.5.6 por retorno**:
   D5+D6+D18 (teto por spec, continuação herda saldo, receita de flake), D2 (reserva de migration adota worktree morta),
   D11 (review externo com `--base`), D4 (e2e-lock espera), D1 (`start` não sobrescreve), D7+D3 (Write fora do projeto, `.env`),
   D8/D9/D12/D13/D16/D17 miúdos, DT-010 (pool do duelo), DT-011 (aproveitamento do duelo). Atualizar memória e commitar o vault.
7. **Não fazer:** push (Mariana ou vault) sem o Charles; `git stash`; commitar as edições dele na main; recriar worktrees que
   já existem; mexer no harness durante execs vivas.

## 2a. Comparativo das últimas 10 PRDs — FEITO às 00:56 (rodar de novo após os merges de 144 e 140-b)

`node tests/analise/monitor/compara-prds.js "C:\laragon\www\dra-mariana-duarte" 10`

| PRD | harness | criação min | exec min | tasks | min/task | paralel. | think% sub | esforço | tok k pai+sub |
|---|---|---|---|---|---|---|---|---|---|
| PRD-142 | 3.4.34 | 114 | 112 | 9 | 12,4 | 2,10 | — | — | 456+974 |
| PRD-142-b | 3.4.34 | 328 | 319 | 9 | 35,3 | 1,74 | — | — | 1078+2289 |
| PRD-139-b | 3.5.3 | 76 | 109 | 9 | 11,8 | 1,43 | 68 | high/n/d | 82+440 |
| PRD-143 | 3.5.3 | 106 | 131 | 9 | 14,5 | 1,45 | 67 | medium/high | 148+738 |
| PRD-137-b | 3.5.4 | 70 | 221 | 7 | 31,2 | 0,87 | 66 | medium/n/d | 112+473 |
| PRD-143-b | 3.5.4 | 71 | 168 | 6 | 28,1 | 1,55 | 71 | medium/xhigh | 74+636 |
| **PRD-137-c** | **3.5.5** | 56 | **76** | 9 | **8,4** | 1,24 | 72 | medium/medium | 88+489 |
| **PRD-145** | **3.5.5** | 33 | **98** | 7 | **13,9** | 1,29 | 68 | medium/medium | 93+466 |
| **PRD-141-b** | **3.5.5** | 32 | 178 | 6 | 29,6 | 0,63 | 70 | medium/medium | 138+336 |
| PRD-144 | 3.5.5 | 55 | (em exec) | 9 | | | | | |

**Leitura:** criação caiu de 70–114 min (3.5.3/3.5.4) para 32–56 (LEVE + 3.5.4/3.5.5). Exec: a 3.5.5 tem o melhor min/task já medido
(137-c, 8,4) e o 2º melhor recente (145, 13,9), contra 28–31 na 3.5.4; a exceção 141-b (29,6) é explicada por tasks que ESCREVEM spec
(caracterização + 5 suítes migradas), tetos do Playwright e a investigação de flake da pai (D5/D6/D18) — não por raciocínio (thinking
dos subagentes estável em 66–72 % com `medium`) nem por espera humana (0 nas três). Tokens por task: 64 k (137-c), 80 k (145), 79 k
(141-b) contra 118 k (143-b) e 84 k (137-b). `esforco=medium/medium` gravado nas 3 pela primeira vez. **Gargalo seguinte =
Playwright (teto por despacho, flake, e2e-lock), não o modelo.**

## 2b. Lista consolidada da 3.5.6 (implementar amanhã de manhã, por retorno)

1. **Playwright — D5 + D6 + D18** (custo nº 1 da noite: 8 tetos, 2 continuações, 3 rodadas de família): contador por TASK/spec
   (continuação herda o saldo; teto = 4 × specs distintos, máx 12); rodada que falha em < 20 s por ambiente/lock não conta; `for` com
   `playwright test` conta as iterações; spec `zzdebug*`/`_tmp-*` negado pelo `guard-write`; skill: "PARCIAL por teto com correção
   aplicada → a pai roda a última rodada"; receita de flake para a pai (1 rodada da família → só os falhos ×3 → decidir) e teto de 2
   famílias por ciclo de review com aviso do guard.
2. **D2 (= B10)** — `guard-migration` adota reserva de worktree morta (regrava `dono`); `fechar` transfere `seq/*`; `doctor` lista
   reserva órfã. Provado 2× hoje (0201 perdida; 0200 transferida à mão).
3. **D11** — `external-review.sh`/`codex-review.sh --base <ref>` (merge-base com a main); skill deixa de expor diff; **nunca
   `reset --soft`**; e o review externo grava no manifest de delegações (buraco do C7: `codex=""` mesmo em `dupla`).
4. **D4** — e2e-lock ESPERA (DT no projeto Mariana, `adquirirLockExecucao()` com poll) + `guard-playwright` devolve a receita de
   espera (`until [ ! -f <lock> ]; do sleep 5; done`) antes de gastar rodada.
5. **D1 (= B2)** — `harness-metrics.sh start` de rótulo fresco mantém epoch e `origem` (`mantido`); skill não sugere `start` manual
   quando o marcador existe.
6. **D7 + D3 + D16** — `guard-write` nega Write fora do projeto/scratchpad (dica `.harness-run/tmp`); `guard-bash` responde `cat .env`
   com `worktree.env`/`db-test.sh`; packet do executor ganha bloco "Ambiente desta worktree" (`url`, `db`, `pw-login.mjs`,
   `pw-storage.json`, lock E2E); `guard-playwright` ignora corpo de heredoc e strings (falso positivo de família).
7. **D17** — cota do Codex compartilhada: preflight grava `~/.harness-run/codex-limite.json` e os outros pulam direto para o fallback;
   orçamento diário com prioridade review > discovery; doctor/daily mostram "Codex em limite até …".
8. **Miúdos D8/D9/D12/D13** — dedup em `_incidente.sh`; "## Verificações" pré-preenchida no packet do hefesto (e `--post` lista os itens
   sem prova); packets de TODAS as tasks na decolagem; `Status:` sem negrito e `relatorio` antes de `ultimoTexto` no `statusDoRelatorio()`.
9. **DT-010** — pool do duelo em `_defaults.env` versionado (sync), `gemini-3.8-flash` SUBSTITUI o 3.7, preflight vs OpenRouter, teste
   do mestre (slug citado ∈ pool), serial/novato; depois apagar `HARNESS_DUELO_*` do `~/.harness.env.local` do PC.
10. **DT-011** — duelo: themis-solo no W.O.; `aplicado` obrigatório (linha "Diff do duelo" no relatório → `guard-agent --post`);
    âncora curta + casamento normalizado + `@@ ~linha`; anexos por trecho numerado; seção "APIs internas obrigatórias" + mini-spec no
    packet do worker; escalação pelo placar REAL (qwen3.7-flash sobe; haiku e qwen3-coder-next saem; ollama só ≥ 30B).
11. **Restos da lista B de 14/09** ainda abertos: B1 auto-start no daemon (hooks a 2–3 s com 3 abas abrindo juntas; cancelam sob
    carga), B5 `grande-ok` por PRD, B14 packet lido por partes, B15 Perfil × `HARNESS_REVIEW_MAX_CICLOS` (documentado na 3.5.5, ainda
    diverge do texto do Perfil).
12. **Perfil da Mariana** — consolidar as linhas 92/94 do RESUMO (aviso `redacao-empilhada` do carimbo de hoje).

## 2c. Fase autônoma da madrugada: implementar a 3.5.6 e publicar na Mariana (decisão do Charles, 01:05)

Só DEPOIS de 144 e 140-b fecharem e estarem mergeadas (nenhuma exec viva na máquina). Regras:
- **Escopo A — implementar de verdade (mecânico, testável):** itens 1, 2, 3 (a parte `--base`), 5, 6, 8 e o `_defaults.env` do 9
  (pool versionada + 3.8 substitui 3.7 + teste do mestre; o preflight vs OpenRouter também). Cada item com caso na suíte nova
  `tests/t-356-madrugada.mjs` (mesmo padrão da t-355); `t-354` e `t-355` continuam verdes; `bash -n`/`node --check` em tudo.
- **Escopo B — implementar atrás de flag DESLIGADA ou só propor no relatório (envolve decisão/produto):** item 4 (e2e-lock esperar é
  mudança no projeto Mariana — criar o DT no projeto e implementar só se for 1 função isolada com teste), item 7 (orçamento do Codex:
  só o `codex-limite.json` compartilhado; orçamento diário fica proposto), serial/novato do 9 (flag `HARNESS_DUELO_NOVATO_MIN` default
  0 = comportamento atual), item 10 (DT-011: implementar `aplicado` obrigatório e o placar por "usado"; themis-solo e o novo prompt do
  worker ficam PROPOSTOS com o diff pronto, sem ligar), 11 e 12.
- **Versão:** `HARNESS_VERSION='3.5.6'` no mestre; CHANGELOG (mesmo formato da 3.5.5: contexto medido + lista numerada + suíte);
  ONBOARDING "3.5.6" (decisões/ações por projeto); `harness-sync.sh --apply C:/laragon/www/dra-mariana-duarte` (dry-run antes);
  `node .claude/hooks/harness-daemon.mjs --ensure` na Mariana; commit escopado na main da Mariana (`git add .claude/ prds/…` só o que o
  sync tocou) — **SEM push** (deploy). Commit do vault com o mestre.
- **Relatório:** `prds/RELATORIO-3.5.6-2026-09-16.md` no mestre com, por item: o que mudou (arquivo:linha), por que (prova do D#/DT),
  melhoria esperada (medível: ex. "tetos por spec: PARCIAL fabricado 8 → 0", "min/task 29,6 → ≤ 15 em task de spec"), como validar na
  próxima rodada, e o que ficou no escopo B com o motivo. Fechar a nota da madrugada e a da noite, atualizar memória.
- **Mini-guia pré-deploy (pedido do Charles, 01:05):** depois dos merges de 144 e 140-b, escrever `dra-mariana-duarte/prds/GUIA-PRE-DEPLOY-2026-09-16.md`
  (commit na main da Mariana, sem push) com TUDO que está na main e ainda NÃO em produção (`git log --oneline origin/main..HEAD` + os
  `VALIDACAO.md`/Outputs das PRDs + `git diff origin/main..HEAD --stat` + migrations novas + `docs/manual/_fila.md`), para ele não
  ter de ler commit a commit. Formato, por PRD (137-c, 145, 141-b, 144, 140-b, e o que mais estiver na fila): **o que muda para o
  usuário** (feature/melhoria, 2–4 linhas), **o que muda no sistema** (endpoints novos/alterados, tabelas/colunas, migrations com número,
  ACL/golden, arquivos hub tocados), **risco de quebrar em produção** (alto/médio/baixo, com o porquê — ex.: migration 0200 mexe em
  DADO e é irreversível: inativa ABORDAR, zera 43 marcações, backfill de ~1.351 contatos; 141-b troca o editor do prontuário e remove o
  CDN do CKEditor; 137-c tem kill-switch `ia_exemplos_curados_ativo`; 145 é opt-in `incluir_conversa=1`), **como reverter** (kill-switch,
  `migrate.php --down N`, revert do commit), **checklist de deploy** (ordem das migrations, ACL, cache, safe mode, o que testar em prod
  em 5 min), e uma seção final **"Harness (não vai para o usuário)"** com as versões 3.5.5/3.5.6 e o que elas mudam para quem opera.
  Fechar com um placar: N PRDs, N migrations, N endpoints, N specs verdes na main (rodar `php -l`/`node --check` nos arquivos tocados
  e a família de specs das PRDs mergeadas UMA vez, contra a main, antes de escrever "verde").
- **Checkpoint de contexto:** ao fim de cada fase (merges; escopo A; sync; relatório; guia) commit + 5 linhas no `HANDOFF` (§1 estado) —
  se a sessão estourar, a seguinte continua do último checkpoint sem refazer.
- **Parar e deixar escrito** (em vez de forçar) se: suíte vermelha depois de 2 tentativas, sync com `CONFLITO` fora do `db-test.sh`,
  main da Mariana suja por sessão alheia, ou qualquer item que precise de decisão do Charles.

## 3. Comandos de bolso

```bash
# estado das execs
for w in exec-141b exec-144 prd-140b; do echo "== $w"; ls /c/laragon/www/dra-mariana-duarte--wt-$w/.claude/.harness-run/*.json 2>/dev/null | xargs -n1 basename; done
# esforço/sessões vivas (3.5.5 mostra o esforço por pid)
node /c/laragon/www/dra-mariana-duarte/.claude/hooks/sessoes.mjs | grep ^SESSAO
# placar de tasks de uma exec
tail -20 /c/laragon/www/dra-mariana-duarte--wt-exec-144/.claude/.harness-run/tasks-ultimas.jsonl
# run gravada
grep -h '"label":"PRD-144-exec"' /c/laragon/www/dra-mariana-duarte--wt-exec-144/prds/_metrics/runs/*.jsonl | tail -1
```

## 4. Prompts (Charles cola; `/effort medium` antes em cada aba)

**PRD-144** — já entregue no chat (00:45): worktree `wt/exec-144`, base `fe4802fa`, hubs só na TASK-004, scripts depois do
`curadoria_envio.js`, ganchos da 137-c, migration 0200 só no clone, ACL só regenerar, poda única do CLAUDE-HISTORICO, sem push,
sem `reset --soft`.

**PRD-140-b (criação noturna + exec emendada):**
```
Você está na worktree `wt/prd-140b` (pasta C:\laragon\www\dra-mariana-duarte--wt-prd-140b, banco cjzawcndgj_local_wt_prd_140b, URL http://localhost/dra-mariana-duarte--wt-prd-140b/), criada da main fe4802fa. Vou dormir: rode tudo AUTÔNOMO, sem perguntas.
TAREFA 1: /prd PRD-140-b --noturno — o stub prds/PRD-140-b-desconto-e-promocao/PRD-140-b.md tem o escopo da fatia 2 de 2 da PRD-140 (concluída); adote os defaults de TODOS os itens da entrevista (TURBO NOTURNO, DTs diretos absorvidos, inovação 🟢, sem maquete) e registre as decisões no bloco "Decisões da entrevista (default --noturno)".
TAREFA 2: com a PRD criada e os gates fechados, EMENDE /prd-exec PRD-140-b nesta mesma sessão (decisão minha: modo noturno dispensa o aceite). O esforco.sh vai acusar AJUSTAR na criação (aba em medium): anuncie e siga.
Regras: não rode git merge/pull/rebase da main, não faça push, não use git reset --soft; commite por task na branch wt/prd-140b; se o Codex estiver em limite de uso, review em SOLO-2. Área: pacotes/venda/financeiro — não tocar mensagens_inbox.*, atendimentos.*, inicio.* (outras execs rodam em paralelo). tools/acl-matriz.tsv: só regenerar. Task de doc: só a sua linha no digest do CLAUDE.md e no INDEX.md; NÃO pode o CLAUDE-HISTORICO.md; NÃO recarimbe o PERFIL-RESUMO.
```
