---
tipo: relatorio
data: 2026-09-16
harness: 3.5.6
status: publicada no mestre e sincronizada na Mariana (sem push) — validar na próxima rodada de execs
tags: [harness, 3.5.6, relatorio, prd-exec, playwright, duelo, dt-010, dt-011]
---

# Relatório da 3.5.6 — 16/09/2026 (fase autônoma da madrugada)

> Lista consolidada de origem: `HANDOFF-2026-09-16-madrugada.md` §2b (12 itens) com o corte de escopo do §2c (A = implementar
> com teste; B = flag desligada ou proposta). Provas: `MONITOR-EXECS-2026-09-15-noite.md` (D1–D18) e
> `MONITOR-EXECS-2026-09-16-madrugada.md` (E1–E4). Suítes: `tests/t-356-madrugada.mjs` (24 casos, 79 asserções),
> `t-354` (59) e `t-355` (38) verdes no mestre antes do bump.

## 0. Método e o que a rodada da madrugada acrescentou de prova

A 3.5.6 foi implementada numa **cópia de trabalho** (`.claude/` + `tests/`) enquanto as execs 144 e 140-b rodavam (regra: nunca
mexer no harness com exec viva) e só entrou no mestre e na Mariana depois de as duas fecharem e serem mergeadas. As execs da
madrugada confirmaram, sem variação, o diagnóstico da noite: **3 tetos de Playwright em 35 min na 144 (TASK-007/006/002), todos
em task que ESCREVE spec; 6 créditos de e2e-lock em 3 dedalos; 1 spec de depuração fabricado (`_debug144-temp.spec.js`); 1
Write com caminho `/d/…` fora do projeto** (E1–E2). Na 140-b: criação `--noturno` + exec emendada na mesma sessão funcionou (C2
provado na emenda — o hook `Skill` ligou `PRD-140-b-exec`), o `guard-migration` fez o executor reservar a 0203 em 7 s (E4), e a
pai perdeu 4 turnos corrigindo a PRD-TECNICA com `Edit`/scripts que não casavam (E3 — virou nota na skill `/prd`).

## 1. Escopo A — implementado, com teste

### 1. Teto de Playwright por TASK e por SPEC (D5 + D6 + D18 + E1 + E2)
- **O que mudou:** `.claude/hooks/guard-playwright.mjs` (reescrito: `chaveDe`/`prefixoDaRun`, `specsDoComando`,
  `rodadasDoComando`, `semHeredoc`, Regra A por task+spec, crédito por `AMBIENTE_RE`, Regra C); `.claude/harness.env`
  (knobs `HARNESS_PW_RUNS_MAX_TASK`, `HARNESS_PW_FALHA_AMBIENTE_S`, `HARNESS_PW_LOCK_ESPERA`, `HARNESS_PW_LOCK_GLOB`);
  `.claude/skills/prd-exec/SKILL.md` ("Redea por hook" + "Flake na família — receita fixa"); `.claude/contratos/CONTRATO-executor.md`
  ("Testes: só o seu spec, e nunca um spec de depuração").
- **Por quê (prova):** D5 (4 tetos em 15 min, 22:11–22:13, todos em task de spec), D6 (continuação da TASK-001 da 141-b zerou o
  contador e bateu de novo; `for i in 1 2 3 4` contou 1), D18 (pai rodou a família 3× para classificar 5 falhas), E1/E2 (144:
  TASK-007 n=5/4 num spec de depuração; TASK-006 e TASK-002 n=5/4; 6 créditos de lock em 40 s).
- **Melhoria esperada (medível):** PARCIAL fabricado por teto em task de 1 spec com ≤ 4 rodadas reais: **8 (noite) + 3 (144) → 0**;
  continuação batendo no teto com contador zerado: **2 → 0**; `playwright.jsonl` passa a ter `regra=credito motivo=ambiente`
  para toda falha < 20 s; min/task em task que escreve spec: **29,6 (141-b) → ≤ 15**.
- **Como validar:** próxima exec com task de spec — `.harness-run/playwright/<RUN>-TASK-NNN.json` com `specs{}` e `agentes[]`;
  `grep '"regra":"teto"' .harness-run/playwright.jsonl` deve cair a ≤ 1 por exec; `tasks-ultimas` sem `status=PARCIAL` por teto.
  Suíte: T1–T6.

### 2. Spec de depuração e Write fora do projeto negados no executor (D6 + D7 + E1)
- **O que mudou:** `.claude/hooks/guard-write.sh` (bloco "3.5.6 (D7 + D6/E1)": normalização de caminho com `pwd -W`, regra FORA,
  regra SPEC DE DEPURACAO; só com `agent_id`); `harness.env` (`HARNESS_GUARD_WRITE_FORA`, `HARNESS_GUARD_WRITE_SPEC_DEBUG`).
- **Por quê:** D7 (`check_console.js` no Temp → "Cannot find module 'playwright'"; michelangelo repetiu), D6 (`zzdebug_ck_modal`,
  `_tmp-check-salas-console`, `_ZZDEBUG-invariantes-task002` — 3 specs de sondagem numa noite), E1 (`_debug144-temp.spec.js`).
- **Melhoria esperada:** specs `_debug*/_tmp-*/zz*` escritos por executor: **4 → 0**; Write fora do projeto por executor: **3 → 0**;
  rodadas gastas em spec de sondagem: **≥ 8 → 0**.
- **Como validar:** `grep -c 'DEPURACAO\|FORA do projeto' ~/.claude/projects/*/…/subagents/*.jsonl` (negações aparecem no
  transcript do agente); `ls tests/e2e/_* tests/e2e/zz*` vazio ao fim da exec. Suíte: T7.

### 3. Reserva de migration não morre com a worktree (D2 / B10)
- **O que mudou:** `.claude/hooks/guard-migration.sh` (`reserva_viva`, `adotar_reserva`; nos dois modos, seq e timestamp);
  `.claude/hooks/harness-worktree.sh` (`fechar`: transferência `seq/*` → `SEQ|transferida`; `doctor`: `DOCTOR|reserva-orfa`);
  `harness.env` (`HARNESS_GUARD_MIG_ADOTA`).
- **Por quê:** D2 (0201 presa em `--wt-prd-137c`, fechada às 16:10; a exec virou 0202 com a PRD inteira citando 0201; 0200
  transferida à mão para a 144).
- **Melhoria esperada:** migrations renumeradas por reserva presa: **2 em 24 h → 0**; reservas órfãs listadas pelo doctor.
- **Como validar:** `bash .claude/hooks/harness-worktree.sh doctor | grep reserva-orfa` na Mariana (deve listar MIG-201/202 dos
  checkouts mortos até o Charles apagar as pastas presas); próxima exec criada em worktree A e executada em B escreve a migration
  sem renumerar. Suíte: T9–T11.

### 4. Review externo desde a BASE + manifest (D11 + complemento do C7/D17)
- **O que mudou:** `.claude/hooks/external-review.sh` (flags `--base`/`--dry-run`, `resolve_base`, `DIFF_DE`, `montar_diff`, ramo
  codex-cli com diff em arquivo via `codex exec`, `cabecalho`, linha `revisor-externo` no manifest); `harness.env`
  (`HARNESS_REVIEW_BASE`, `HARNESS_MAIN_BRANCH`); skill `/prd-exec` 2.2 ("A base é automática … NUNCA `git reset --soft`").
- **Por quê:** D11 (145: `codex-review.sh` devolveu diff vazio porque as 5 tasks estavam commitadas; a pai fez `git reset --soft
  a0e3c61a` com executores vivos e o histórico da branch virou um commit só); D17-complemento (run fechou `codex=""` em
  `review_modo=dupla`: o review externo não gravava delegação).
- **Melhoria esperada:** `git reset --soft` em exec: **1 → 0**; commits por task preservados até o merge (145 tinha 1 commit para 5
  tasks); `codex=ok` + `delegacoes=N` na run de toda exec com review externo.
- **Como validar:** próximo review externo — cabeçalho do relatório em `codex-reviews/` com "Commit base: … (base do review,
  3.5.6)"; `grep revisor-externo prds/_metrics/delegations/*.jsonl`; `bash .claude/hooks/external-review.sh PRD-NNN 1 --dry-run`
  imprime `REVIEW|dry-run|base=<merge-base>|arquivos=N`. Suíte: T13–T14.

### 5. `start` não sobrescreve marcador fresco (D1 / B2)
- **O que mudou:** `.claude/hooks/harness-metrics.sh` (bloco "3.5.6 (D1 / B2)" no `start`: `TELEMETRIA|mantido`; `--forcar`);
  skill `/prd-exec` (nota de telemetria).
- **Por quê:** D1 (145: `start` manual às 21:59:34 sobre marcador de 21:57:40 → 114 s a menos e `origem` perdida).
- **Melhoria esperada:** runs com `origem_start=marcador` e `origem` preservada em **100 %** das execs; duração nunca encurtada
  por `start` repetido.
- **Como validar:** `metrics-auto.log` + `runs/*.jsonl` (`origem_start`); rodar `harness-metrics.sh start PRD-NNN-exec` duas vezes
  → segunda imprime `mantido`. Suíte: T12.

### 6. `.env` não é fonte de URL (D3)
- **O que mudou:** `.claude/hooks/guard-bash.mjs` (`DICA_ENV`, `ehLeituraDeEnv`, GUARDA 0b só em subagente, dica na DICA 0 da pai);
  `harness.env` (`HARNESS_GUARD_ENV`).
- **Por quê:** D3 (145: `test -f .env && cat .env` negado pelo classificador do auto mode, e o `.env` lido pela ferramenta Read no
  turno seguinte — credencial no contexto sem necessidade).
- **Melhoria esperada:** negação "Credential Materialization" por `.env` em subagente: **1 → 0**; leitura de `.env` via Read por
  executor: **1 → 0** (a dica chega antes).
- **Como validar:** `grep -c '"tipo":"leitura"' prds/_metrics/incidentes/*.jsonl` com `env:` no detalhe. Suíte: T8.

### 7. Packet com "Ambiente desta worktree" e "Verificações" pré-preenchidas (D3 + D4 + D7 + D9 + D16)
- **O que mudou:** `.claude/hooks/task-packet.sh` (seções 6 e 7, só fora de `--check`/`--worker`); `harness.env`
  (`HARNESS_PACKET_AMBIENTE`); `CONTRATO-executor.md` ("Verificação provada" cita a seção 7).
- **Por quê:** D16 (dedalo descobriu o login do Playwright na mão com um script — o `pw-storage.json` já existia), D3 (URL no
  `.env`), D7 (temporários no Temp), D4 (3 turnos tentando esperar o lock), D9 (2 hefestos com 3 verificações "feitas" sem saída).
- **Melhoria esperada:** `verif_sem_prova > 0` em hefesto/dedalo: **2 de 13 na 137-c → 0**; turnos gastos descobrindo ambiente
  (login, URL, lock): **≥ 6 na noite → 0**.
- **Como validar:** abrir um `.harness-run/packets/TASK-*.packet.md` da próxima exec e conferir as seções 6 e 7; `tasks-ultimas`
  com `verif_sem_prova` zerado. Suíte: T17.

### 8. Miúdos medidos (D8 + D9 + D12 + D13)
- **O que mudou:** `.claude/hooks/_incidente.sh` (dedup por assinatura, `HARNESS_INCIDENTES_DEDUP[_S]`); `.claude/hooks/task-telemetry.mjs`
  (`statusDoRelatorio` sem negrito; relatório antes do `ultimoTexto`; `verif_sem_prova_itens`; `--ultima` com 7º campo);
  `.claude/hooks/guard-agent.sh` (`--post`: `UT_ITENS` e "quais: …"; pre: monta o packet que faltou — `HARNESS_GUARD_AGENT_PACKET_AUTO`).
- **Por quê:** D8 (incidente `relatorio` duplicado em 19 s), D13 (`Status: ✅` sem negrito gravou status vazio; beholder da 140-b
  também com status vazio — E3), D9 (número sem os itens), D12 (acceptance despachada sem packet: 137-c e 143-b).
- **Melhoria esperada:** incidentes duplicados: **1 par/exec → 0**; status vazio em `tasks-ultimas` com relatório declarando
  Status/Veredito: **3 (141-b TASK-002, 140-b beholder c1, …) → 0**; deny "sem TASK PACKET" custa 1 turno em vez de 2.
- **Como validar:** `grep -c '"status":""' .harness-run/tasks-ultimas.jsonl` após uma exec; aviso `[relatorio] … quais: …`.
  Suíte: T15, T16, T18, T19.

### 9. Pool do duelo viaja com o base (DT-010)
- **O que mudou:** `.claude/hooks/_defaults.env` (novo, versionado: `HARNESS_DUELO_MODELS`, `_SUPLENTES`, `_JUIZ_MODEL`,
  `HARNESS_OPENROUTER_MODEL`, `HARNESS_OLLAMA_MODEL`); sourceado por `harness-duelo.sh`, `harness-delegate.sh`, `presence.mjs`
  (`makeCtx`) e `harness-daemon.mjs`; `harness-duelo.sh` (`--pool [--validar]`, `_POOL_ORIGEM`, pool sem literal 3.7,
  `HARNESS_DUELO_SERIAL_NOVATO_MIN`/`_AMOSTRA` em 0); `.claude/harness-doctor.sh` (checa o arquivo e a origem da pool);
  `.claude/harness.env` (chaves viram comentário apontando o `_defaults.env`); teste do mestre em `t-356` T21.
- **Por quê:** D14/DT-010 (8 projetos no macOS com gemini-3.7; placar 3×0 por W.O.; a exploração de novato nunca teve o 3.8).
- **Melhoria esperada:** projetos sincronizados com a pool do base: **0 de 8 → 8 de 8** (conferir com o levantamento do DT no
  macOS); `harness-duelo.sh --pool` → `origem=defaults` em todo projeto sem override.
- **Como validar:** `/deus` nos projetos → doctor `[ OK ] duelo: pool=… (origem: hooks/_defaults.env)`; `--pool --validar` sem
  `modelo-inexistente`. Depois: apagar `HARNESS_DUELO_*` do `~/.harness.env.local` do PC (ONBOARDING). Suíte: T20–T21, T24.

### 10. Aproveitamento real do duelo — parte mecânica (DT-011)
- **O que mudou:** `CONTRATO-executor.md` ("Diff do duelo"); `guard-agent.sh --post` (lê a linha, grava `--aplicado`, ou cobra —
  `HARNESS_DUELO_APLICADO_AUTO`); `harness-duelo.sh --placar` (`usado/venceu/disputou/descartado/desconhecido`, custo por usado).
- **Por quê:** D15/DT-011 (6 de 32 vencedores sem evento `aplicado`; placar por vitória escondia haiku 0 usados por US$ 2,19).
- **Melhoria esperada:** vencedores sem `aplicado` nos próximos 20 duelos: **19 % → 0 %**; placar por uso disponível em 1 comando.
- **Como validar:** após uma exec com duelo, `bash .claude/hooks/harness-duelo.sh --placar` → `desconhecido=0`. Suíte: T18, T22.

### 11. Codex em limite é da máquina — parte mecânica (D17)
- **O que mudou:** `harness-delegate.sh` (preflight lê/grava `~/.harness-run/codex-limite.json`, replica no `.status`, apaga no
  sucesso; `HARNESS_CODEX_LIMITE_COMPARTILHADO`); `doctor-cached.sh` (aviso compartilhado).
- **Por quê:** D17 (3 execs + 4 criações pagaram 1 ping cada para descobrir o mesmo limite).
- **Melhoria esperada:** pings de preflight ao Codex durante um limite: **7/dia → 1/dia**.
- **Como validar:** `cat ~/.harness-run/codex-limite.json` após o próximo limite; `PREFLIGHT|indisponivel|codex-cli|limite-ate`
  sem linha `PREFLIGHT` nova no manifest de outros projetos. Suíte: T23.

## 2. Escopo B — atrás de flag DESLIGADA ou só proposto

| Item | Estado na 3.5.6 | Por que não ligou | O que falta para ligar |
|---|---|---|---|
| 4 · e2e-lock ESPERA | `guard-playwright` Regra C implementada e testada (T6), **`HARNESS_PW_LOCK_ESPERA='off'`** | a receita `until … sleep` no executor é comportamento novo em campo; o lock do projeto ainda LANÇA (a espera dentro de `adquirirLockExecucao()` é mudança no Mariana) | DT no projeto Mariana (criado nesta madrugada, ver §4) + ligar a flag no `harness.env` da Mariana depois de 1 exec observada |
| 7 · orçamento diário do Codex | só o `codex-limite.json` compartilhado | orçamento com prioridade review > discovery é decisão de produto (quanto reservar) | `HARNESS_CODEX_ORCAMENTO_DIA` + contagem em `~/.harness-run` — proposta: reservar 2 reviews/dia; criações caem para nativo abaixo disso |
| 9 · serial/novato | flags `HARNESS_DUELO_SERIAL_NOVATO_MIN` / `_AMOSTRA` existem, **0** (= 3.4.24) | ligar dobra o custo do duelo enquanto o novato não tem 5 duelos; decisão do Charles | `HARNESS_DUELO_SERIAL_NOVATO_MIN='5'` e `_AMOSTRA='5'` no `_defaults.env` |
| 10 · themis-solo no W.O. | proposto (diff abaixo) | muda o desfecho de 76 % dos duelos (W.O.) — 1 chamada Sonnet a mais por duelo | aplicar o diff em `harness-duelo.sh` (bloco "so um aplicavel => W.O.") e ajustar `themis.md` (modo SOLO, nota ≥ 60) |
| 10 · prompt do worker por trecho | proposto | mexe no `task-packet.sh --worker` e no `duelo-aplicar.mjs` (casamento normalizado) — precisa de 20 duelos de validação | âncora curta + `@@ ~linha` + anexos por trecho numerado + seção "APIs internas obrigatórias" |
| 11 · B1/B5/B14/B15 | não tocados | B1 depende do daemon (hooks de prompt cancelam sob carga) — investigação própria | 3.5.7 |
| 12 · Perfil da Mariana (RESUMO linhas 92/94) | não tocado | edição de documento do projeto; o carimbo avisa toda vez | consolidar na próxima passada de Perfil |

### Diff proposto — themis-solo no W.O. (item 10, NÃO aplicado)

```bash
# harness-duelo.sh, bloco "so um aplicavel => vence por W.O." (~linha 560):
# antes: registra veredito juiz=auto e devolve DUELO|ok
# depois (atrás de HARNESS_DUELO_WO_JUIZ='themis-solo'):
if [ "${HARNESS_DUELO_WO_JUIZ:-auto}" = "themis-solo" ]; then
  printf '%s\n' "# Julgamento SOLO: so o diff $W aplica. Rubrica normal; nota >= 60 entrega ao executor, abaixo = nenhum." > "$D/prompt-juiz.md"
  cat "$PACKET" "$D/$W.diff" >> "$D/prompt-juiz.md"
  harness_jsonl_append "$METRICS" "$(printf '{"ev":"veredito-pendente","id":"%s","ts":"%s","juiz":"themis-solo","lado":"%s"}' "$ID" "$TS" "$W")"
  printf 'DUELO|julgar|%s|themis-solo|%s/prompt-juiz.md|%s\n' "$ID" "$D" "$D"; exit 0
fi
```
Na skill `/prd-exec`: `DUELO|julgar|…|themis-solo` despacha o themis com "modo SOLO — nota ≥ 60 = `--veredito … --vencedor <lado>`,
senão `--vencedor nenhum`". Custo: 1 Sonnet por W.O. (≈ 38 dos últimos 50 duelos); ganho: os 10/26 descartes pós-aplicação passam
a ser reprovados antes do executor.

## 3. Validação desta madrugada

- Suítes no mestre após o bump: `t-354` 59/0, `t-355` 38/0, `t-356` 79/0 (24 casos); `bash -n`/`node --check` em todos os
  arquivos tocados (24 (`bash -n` nos .sh, `node --check` nos .mjs; suítes t-354/t-355/t-356) arquivos).
- `harness-sync.sh --apply C:/laragon/www/dra-mariana-duarte`: `--dry-run` limpo (21 DIFERE + 1 FALTA, único CONFLITO = `.claude/scripts/db-test.sh` guardado — esperado, adaptador do projeto); `--apply` copiou 22 arquivos + 1 re-sync (`harness-duelo.sh` com a origem da pool olhando suplentes), 0 erros; `VERSAO_ATUALIZADA|HARNESS_VERSION=3.5.6`; backup em `.claude/.harness-run/sync-backup/20260916-033802`.
- `node .claude/hooks/harness-daemon.mjs --ensure` na Mariana: `[daemon] harness-daemon ativo (porta 47831, pid 31096, hooks e51f3193d782)`.
- `harness-duelo.sh --pool` na Mariana: `POOL|deepseek/deepseek-v4-flash-0731,google/gemini-3.8-flash|qwen/qwen3.7-flash,x-ai/grok-build-0.1,anthropic/claude-haiku-4.5,ollama:auto|origem=.harness.env.local|juiz=deepseek/deepseek-v4-pro` — titulares iguais aos defaults; os SUPLENTES ainda vêm do `~/.harness.env.local` do PC (haiku + ollama:auto). O doctor da Mariana acusa a origem. **Não removi as chaves do `~/.harness.env.local`** de propósito: os outros projetos do PC seguem na 3.5.5 e dependem delas até o `/deus` — remover depois (ONBOARDING 3.5.6, ação do Charles).
- Commit na Mariana (escopado, sem push): `0eaed123` (23 arquivos, +791/−179; sem push). Commit do vault: `323982e` (mestre 3.5.6 + CHANGELOG + ONBOARDING + t-356; WIP-* removidos).

- Famílias de specs das PRDs mergeadas rodadas UMA vez contra a main (49 arquivos, 16 min): **281 verdes, 3 vermelhas, 17 puladas** —
  a 144 reabria o DT-598 (compositor a 730 px em 1280×720; determinístico) — corrigido de manhã em `a5b9ba5e` (corpo cede em viewport baixa; 641,9 px; 42 specs verdes), 2 falhas de contrato `sem token` pré-existentes; o spec
  `PRD-144-migracao` apontava o banco da worktree (hardcoded) e foi corrigido para `ENV.DB` (E7 — vira item da 3.5.7: lint contra nome
  de banco/worktree literal em spec, e gate de regressão incluindo a família da PRD anterior da mesma tela).

## 4. DT criado no projeto Mariana (item 4, escopo B)

`prds/debito_tecnico/DT-600-e2e-lock-espera-em-vez-de-lancar.md` (INDEX atualizado; commit `dt(DT-600)` na main da Mariana, sem push). Proposta: `adquirirLockExecucao()` faz poll de 5 s até `E2E_LOCK_WAIT_MS` (600 s; `0` = comportamento atual) em vez de lançar; stale continua destravando na hora; critério de aceite com dois `playwright test` a 2 s de distância. Ligar `HARNESS_PW_LOCK_ESPERA=on` na Mariana junto com o DT.

## 5. Placar esperado × como medir na próxima rodada

| Métrica | Medido (15–16/09, 3.5.5) | Alvo 3.5.6 | Onde ler |
|---|---|---|---|
| Tetos de Playwright por exec (task de 1 spec) | 2–4 | ≤ 1 | `.harness-run/playwright.jsonl` `regra=teto` |
| PARCIAL por teto seguido de continuação | 2/noite | 0 | `tasks-ultimas.jsonl` status + despachos "Continua" |
| Specs de depuração escritos por executor | 4/noite | 0 | `ls tests/e2e/_* zz*` |
| Migration renumerada por reserva presa | 2/dia | 0 | `harness-worktree.sh doctor` |
| `git reset --soft` em exec | 1 | 0 | transcript da pai |
| `codex=""` em run com review externo | 2 de 2 | 0 | `runs/*.jsonl` |
| Status vazio em `tasks-ultimas` com relatório declarado | 3 | 0 | `tasks-ultimas.jsonl` |
| Projetos com pool do duelo desatualizada | 8/8 (macOS) | 0 | doctor `duelo: pool=` |
| min/task em task que escreve spec | 29,6 (141-b) | ≤ 15 | `compara-prds.js` |
