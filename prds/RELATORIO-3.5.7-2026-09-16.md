---
tipo: relatorio
data: 2026-09-16
harness: 3.5.7
status: publicada no mestre e sincronizada na Mariana (sem push) — /deus nos outros 28 projetos pendente (Charles decide a ordem)
tags: [harness, 3.5.7, relatorio, camadas, defaults, frentes, commit-por-task, grafo, review]
---

# Relatório da 3.5.7 — 16/09/2026 (camadas de configuração + cinco melhorias de performance)

> Origem: `prds/PROMPT-3.5.7-variaveis-e-performance.md` (Frente A e Frente B) sobre a 3.5.6 publicada de madrugada
> (`RELATORIO-3.5.6-2026-09-16.md`, `HANDOFF-2026-09-16-madrugada.md`). Provas: inventário de chaves de 16/09 (abaixo),
> `MONITOR-EXECS-2026-09-16-madrugada.md` (E5–E7), `MONITOR-EXECS-2026-09-15-noite.md` (D-série) e o comparativo das
> 10 últimas PRDs da Mariana (`tests/analise/monitor/compara-prds.js`). Suítes: `tests/t-357-camadas.mjs` (19 casos,
> 61 asserções) + t-354 (59), t-355 (38), t-356 (79) verdes no mestre antes do bump.

## 0. Régua "antes" (compara-prds, 10 últimas PRDs da Mariana, 16/09 10:50)

| PRD | harness | exec min | tasks | min/task | paralel. real | vivos/limitou | fator teórico do grafo (3.5.7) |
|---|---|---|---|---|---|---|---|
| PRD-142-b | 3.4.34 | 319 | 9 | 35,3 | 1,74 | / | **1,8 serial** |
| PRD-139-b | 3.5.3 | 109 | 9 | 11,8 | 1,43 | 4/dependencias | **1,8 serial** |
| PRD-143 | 3.5.3 | 131 | 9 | 14,5 | 1,45 | 4/dependencias | 3,75 ok (15 tasks no disco) |
| PRD-137-b | 3.5.4 | 221 | 7 | 31,2 | 0,87 | 4/teto | **1,75 serial** |
| PRD-143-b | 3.5.4 | 168 | 6 | 28,1 | 1,55 | 2/teto | **1,5 serial** |
| PRD-137-c | 3.5.5 | 76 | 9 | 8,4 | 1,24 | 3/dependencias | **1,8 serial** |
| PRD-145 | 3.5.5 | 98 | 7 | 13,9 | 1,29 | 4/dependencias | 2,33 ok |
| PRD-141-b | 3.5.5 | 178 | 6 | 29,6 | 0,63 | 3/dependencias | **1,5 serial** |
| PRD-144 | 3.5.5 | 142 | 9 | 15,8 | 1,27 | 5/dependencias | **1,8 serial** |
| PRD-140-b | 3.5.5 | 102 | 9 | 11,3 | 1,18 | 4/dependencias | 2,25 ok |

**Leitura:** 7 das 10 PRDs eram seriais **por construção** (fator teórico 1,5–1,8 = caminho crítico de 4–5 níveis para
6–9 tasks) — exatamente as que fecharam `limitou=dependencias` com paralelismo real 1,18–1,29 sob teto de vivos 6. O
teto de executores nunca foi o gargalo; o plano era. A régua "depois" é a mesma tabela após as próximas 3 execs.

## 1. Frente A — nenhuma decisão do harness vive em variável local

### 1.1 Inventário (a prova)

| Medida (16/09, antes) | Valor |
|---|---|
| chaves ativas no `harness.env` do mestre | 75 |
| chaves ativas no `harness.env` da Mariana | 19 |
| decisões do harness inexistentes nos projetos (caíam no default do código) | 58 |
| defaults em código que divergiam do mestre | 5 (`DUELO_TIMEOUT` 600≠300, `OLLAMA_MODEL` qwen3-coder≠auto, `RAG_CAPTURE_AGENTS` 1≠0, `TASK_MAX_LINHAS` 200≠230, `RAG_ENABLED` 1≠0 nos hooks de RAG) |
| variantes de loop de carga de env entre os hooks | 14 (só duelo/delegate/daemon liam o `_defaults.env`; presence/lint/notify não liam o `~/.harness.env.local`) |
| precedência real do bash (`source`) | arquivo vencia o AMBIENTE — o `harness.env.local.example` documentava o contrário desde a 3.4.2 |
| `~/.harness.env.local` do PC | sobrescrevia `HARNESS_DUELO_MODELS/SUPLENTES`, `HARNESS_OLLAMA_MODEL`, `HARNESS_FRENTES_MAX` para TODOS os projetos |
| projetos no PC por versão | 1 na 3.5.6 (Mariana), 20 na 3.4.34, 9 entre 2.8.0 e 3.4.28 |

### 1.2 O que mudou

1. **`hooks/_defaults.env` — 201 decisões, único lugar.** Os blocos de comentário do `harness.env` viajaram junto (o
   histórico medido de cada knob continua ao lado do valor); 33 defaults que só existiam em código foram declarados;
   `HARNESS_DELEGATE_TOOLS_OFF_MODELS` esvaziado (listava um modelo fora da pool). **`hooks/_camadas.txt`** classifica
   as demais: 27 chaves de PROJETO (lista fechada), 16 de MÁQUINA (`segredo` marcado), ambiente (`HARNESS_SKIP_*`…),
   e as 41 decisões cujo override é esperado em alguma camada. O `harness.env` do mestre virou template de projeto
   (16 chaves ativas + bypass documentado).
2. **Carregador único.** `hooks/_env.sh` (bash, zero fork: `${!HARNESS_*}` fotografa o ambiente, sourceia
   `_defaults.env → harness.env → harness.env.local → ~/.harness.env.local`, devolve o ambiente por cima;
   `harness_env_origem KEY`) e `presence.mjs loadHarnessEnv()/harnessEnvStamp()` (Node, mesma ordem). 28 arquivos
   `.sh` + 6 `.mjs` migrados; `harness-duelo`/`harness-delegate` resolvem a origem pelo helper. Defaults em código
   alinhados ao arquivo; `t-357 T8` falha se divergirem de novo. Custo medido do `_env.sh`: 114 ms incluindo o
   bash (o source de 930 linhas em si é desprezível).
3. **`harness-sync.sh`:** `ENV|decisao-no-projeto|<chave>|<arquivo>|igual|difere|esperado`, `ENV|obsoleta`,
   `ENV|maquina-versionada`, `ENV|resumo`; `--apply` comenta a decisão igual ao default (marcador `[3.5.7 migrado…]`,
   backup junto dos demais) e preserva a diferente; migrável conta como defasagem. `hooks/harness-env.mjs` é o motor
   (classificar/resolver/drift, uma chamada de node por diagnóstico).
4. **`harness-doctor.sh`:** grupo **"Camadas de configuracao"** — origem resolvida, WARN por override inesperado e
   por chave desconhecida, `[info]` por override esperado/ambiente, **FALTA por segredo versionado** e por chave de
   projeto obrigatória ausente. Área `camadas` na matriz.
5. **`harness-ui.mjs` + `harness-config.html`:** valor resolvido e tag de origem por chave; gravação na camada certa
   (mestre → `_defaults.env`; projeto → override consciente anotado; máquina → `.local`).
6. **Docs:** ONBOARDING 3.5.7 (regra, migração, ação única no `~/.harness.env.local` DEPOIS do /deus), CHANGELOG,
   README, `harness.env.local.example`, PLATAFORMAS, skill `/harness-config`; no vault, skill `/deus` (coluna
   **Config** no painel + destaque de overrides e de segurança) e agente `deus` (linhas `ENV:`, `ENV_OVERRIDES:`,
   `ENV_SEGURANCA:` no veredito).

### 1.3 Achados reais dos alvos (drift medido antes do sync)

| Projeto | migráveis | overrides esperados | obsoletas | segurança |
|---|---|---|---|---|
| dra-mariana-duarte | 4 (`RAG_TOPK`, `RAG_CAPTURE_AGENTS`, `RAG_SUMMARIZER`, `RAG_LLM_PROVIDER`) + `DELEGATE_MODE` igual no `.local` | 4 (`RAG_CAPTURE_MIN_CHARS=2000`, `VERBOSITY=minimo`, `FOLEGO_hefesto/dedalo=100`) | 0 | — |
| sagittarius | 5 | 1 (`WT_LINKS=node_modules`) | 0 | **`OPENROUTER_API_KEY` versionada no `harness.env`** — mover para `.local` e trocar a chave |
| máquina (PC do Charles) | — | `OLLAMA_MODEL=auto` | — | `DUELO_MODELS` igual ao default (apagar) e `DUELO_SUPLENTES` diferente (haiku + ollama:auto) no `~/.harness.env.local` — só depois do /deus |

**Melhoria esperada (medível):** decisões do harness que chegam aos projetos: 17 → 201; defaults divergentes entre
código e mestre: 5 → 0 (T8 vigia); chaves de decisão em `harness.env` de projeto: Mariana 8 → 0 migráveis (4 overrides
esperados ficam); `~/.harness.env.local` do PC: 6 chaves → 3 (após o /deus). **Como validar:** `bash
.claude/harness-doctor.sh` em qualquer projeto sincronizado → `[ OK ] decisoes do harness: 201 chaves…` e nenhum
`[WARN] OVERRIDE CONSCIENTE` inesperado; `harness-sync.sh --check <alvo>` → `ENV|resumo|migraveis=0`.

## 2. Frente B — cinco melhorias de performance (cada uma com prova, esperado e validação)

### 2.1 E6 — a frente não expira com a exec viva (`frentes.mjs`, `guard-agent.sh`)
- **Prova:** madrugada de 16/09 — o heartbeat só renovava no despacho de hefesto/dedalo; a 144 entrou em Fase 2 (review:
  6 sherlocks + michelangelo, ~45 min sem executor), o slot expirou (`HARNESS_FRENTES_STALE_MIN=45`) e a 140-b decolou
  junto; as duas dividiram o spawn (E6 na nota do monitor).
- **Mudou:** slot sem heartbeat só cai se a sessão dona morreu (`sessoes.mjs --json`, consultado só quando há slot
  velho — ~1 s de PowerShell nesse caso raro) ou passou `HARNESS_FRENTES_TETO_H` (24 h); `status` marca
  `sessao-viva-sem-heartbeat`. O `guard-agent` renova o heartbeat em TODO Agent (sherlock, michelangelo, hermes,
  themis…) de uma run com marcador vivo, em background.
- **Esperado:** frentes simultâneas por expiração falsa: 1 em 5 execs → 0; `frentes=2/1` na telemetria de run só com
  decisão humana. **Validar:** próxima exec com Fase 2 longa — `node .claude/hooks/frentes.mjs status` durante o
  review mostra o slot vivo; `prds/_metrics/incidentes/*.jsonl` sem `frentes` fabricado. Suíte: T13–T14.

### 2.2 E5 — commit por task (`/prd-exec` 4a, `guard-agent --post`, `task-telemetry --fechadas`)
- **Prova:** 140-b (exec noturna) fechou 7 tasks e fez 1 commit no fim, 27 arquivos soltos no working tree; a 144, na
  mesma noite, commitou 8/9 tasks — o review externo desde a base (3.5.6) e o merge por PRD dependem do histórico
  por task.
- **Mudou:** passo mecânico 4a na skill; no retorno de cada executor o `--post` cruza as tasks ✅ da run (linhas de
  `tasks-ultimas.jsonl` desde o `start` do marcador) com o `git log` e injeta `[commit] task(s) ✅ desta run SEM
  commit` (só em branch `wt/*`; marcador de 15 min por task; incidente `commit`). `HARNESS_GUARD_COMMIT_TASK=off`.
- **Esperado:** commits por exec em worktree ≥ tasks ✅ (140-b: 1 → 7). **Validar:** `git log --oneline main..wt/exec-NNN`
  no fim da próxima exec; `grep '"tipo":"commit"' prds/_metrics/incidentes/*.jsonl` deve ser raro. Suíte: T15.

### 2.3 E7 — `node_modules` presente no principal e na worktree (`harness-worktree.sh`, doctor)
- **Prova:** E7/140-b — "playwright instalado no pré-flight" por executor; a main da Mariana não tinha
  `@playwright/test` e a Fase 3 da madrugada precisou de `npm i --no-save` à mão antes das famílias de spec.
- **Mudou:** `novo` roda `npm i --no-save --prefer-offline` no principal quando `node_modules` falta e o
  `package.json` declara `@playwright/test`, depois o junction/symlink de sempre; `harness-worktree.sh doctor` e o
  doctor (grupo visual) acusam `@playwright/test` ausente no principal e em cada worktree.
- **Esperado:** rodadas de Playwright perdidas por "Cannot find module": 3 na noite → 0; "instalei o playwright" nos
  relatórios de executor → 0. **Validar:** `bash .claude/hooks/harness-worktree.sh doctor | grep node_modules-ausente`
  vazio na Mariana e nas worktrees novas. Suíte: T16.

### 2.4 Grafo de dependências (`task-grafo.mjs`, `task-packet --check`, `/prd` Passo 8, `/prd-exec` plano)
- **Prova:** tabela do §0 — 7/10 PRDs seriais por construção; `limitou=dependencias` em todas as execs da 3.5.5;
  paralelismo real 1,18–1,29 com vivos 4–5 e teto 6.
- **Mudou:** níveis por caminho mais longo, largura, caminho crítico, gargalos (dependentes diretos e alcance), fator
  teórico = tasks/profundidade; `GRAFO-VEREDITO|serial` abaixo de `HARNESS_GRAFO_FATOR_MIN` (2) com a sugestão
  (extrair a interface do gargalo numa task curta; front e back da mesma feature como irmãs). Faixas
  `TASK-001..007` expandem; prosa depois do " — " não vira aresta (a 144 tinha um ciclo falso por isso); ciclo real
  é `GRAFO-ERRO`, não loop.
- **Esperado:** fator teórico das PRDs novas ≥ 2 (7/10 → ≤ 3/10 abaixo); paralelismo real ≥ 1,8 nas execs seguintes
  (era 1,18–1,29); `limitou=dependencias` deixa de ser unanimidade. **Validar:** `compara-prds.js … 10` após 3 execs
  + `for t in prds/PRD-NNN-*/tasks/TASK-*.md; do bash .claude/hooks/task-packet.sh "$t" --check; done | grep GRAFO`.
  Suíte: T17–T18.

### 2.5 Review SOLO-2 por parte (`/prd-exec` 2.2)
- **Prova:** 144, Codex em limite: packet em 3 partes × 2 lentes = 6 sherlocks + michelangelo (~7 min cada, 03:27–03:30)
  para 4 bloqueantes corrigidos; Fase 2 de 44 min com 3 ciclos. Ciclo 2 (2 lentes no mesmo packet): A 🔴2, B 🔴1.
- **Mudou:** um sherlock por parte (lente `completa`) + um de `costura` sobre o diff inteiro = N+1 em vez de 2N; nos
  ciclos 2+ só o delta.
- **Esperado:** sherlocks no ciclo 1 de SOLO-2 com 3 partes: 6 → 4 (−33 %); Fase 2 ≤ 25 min para 3 partes; bloqueantes
  por sherlock ≥ 0,7 (régua da 144). **Validar:** `prds/_metrics/tasks/*.jsonl` (papel sherlock, rótulo `PRD-NNN-c1`)
  na próxima exec com Codex fora + `review_modo=partes` na run. Suíte: T19 (texto).

### 2.6 Adendo — COSTURA (incidente PRD-144, 16/09 12:30, pedido do Charles com a leitura do Opus)
- **Prova:** PRD-144 mergeada e deployada com 61 specs verdes, acceptance verde, SOLO-2 (6 sherlocks, 3 ciclos) e
  michelangelo ✅; em produção a fila "A abordar" inutilizável por 4 defeitos de INTEGRAÇÃO (helper em lote com
  `array_keys` de chave numérica; pintura antes do render que recria; `window.abrirPorTelefoneViaResolver` nunca
  publicado, chamado de "função global existente" sem `arquivo:linha`, com os specs criando a função como dublê e o
  guard `typeof` engolindo; mapa de estado só da página). Hotfix `ab61d802`; armadilhas 120–123 do Perfil.
- **Leitura de harness (concordo com o Opus, com um acréscimo):** os gates verificam cada task por dentro e ninguém
  verificava a costura; o dublê era aceito em spec, então "verde" deixou de significar "integrado". O acréscimo: o
  hotfix corrigiu os 4 sintomas e **deixou as causas nos testes** — o `costura-check` rodado hoje sobre a Mariana
  (base `56a91534`) ainda acusa 6 dublês em 3 specs da 144, o marcador "NÃO VERIFICADO" em `busca_unificada.js:17` e
  `window.inboxAguardandoLeadContatos` consumido sem publicação (o próprio nome "assumido" do cabeçalho). Isso é DT.
- **Mudou (por impacto/custo, todas implementadas):** (2) lint de costura estático → `hooks/costura-check.mjs
  --codigo` (window sem publicação, com alias/IIFE/inline/declaração de topo; comentários de bloco e linha ignorados;
  CRLF tratado); (3) regra de spec → `duble-em-spec` + `route-fulfill-endpoint-da-prd` (bloqueia só no acceptance)
  + aviso do `guard-write` no Write do spec; (4) acceptance → cenários obrigatórios no bloco da `/prd` + marcadores
  "NÃO VERIFICADO"/"a integrar na TASK-N" bloqueiam o `stop` (gate `HARNESS_GATE_COSTURA`); (1) Produz/Consome →
  `TEMPLATE-TASK`, hermes, beholder lente 14, `costura-check --tasks` no `task-packet --check`; (5) lente 10 "Costura"
  no sherlock com checklist fixo + lente `costura` como (N+1)-ésimo; (6) michelangelo Modo A 4b "uso de verdade" +
  prompt da Fase 2.9; CONTRATO-executor "Costura".
- **Esperado:** dublê/marcador/`window` sem publicação que chega ao merge: 3 tipos na 144 → 0 (o stop não fecha);
  falso positivo do check: 0 na Mariana após calibração (comentários, aliases `raiz.X =`, publicação dinâmica via
  `costura-ok`/`HARNESS_COSTURA_IGNORAR`). Custo: ~10 s por review-packet/stop. **Validar:** próxima exec com front —
  seção "Costura" no packet do sherlock, `TELEMETRIA|costura|…` só com pendência real; `node
  .claude/hooks/costura-check.mjs --codigo --base none` na Mariana depois de limpar os dublês da 144 → `ok`. Suíte:
  T20–T23.

**Candidatas que ficaram fora (e por quê):** B1 (daemon para guard-agent/guard-write/task-telemetry) — port de dois
hooks bash grandes para Node, sem medição de spawn nova nesta rodada; E3 já estava na 3.5.6 (nota na `/prd` 10.2);
acceptance como task — validar primeiro se o teto por spec da 3.5.6 resolve (próxima exec com TASK de acceptance).

## 3. Publicação e pendências

- **Mestre:** 3.5.7 em `harness.env`; 4 suítes verdes (59/38/79/61). Commit escopado no vault (sem push).
- **Mariana:** `harness-sync.sh --apply` 16/09 11:54 — 55 arquivos copiados, 4 decisões migradas (comentadas), 0
  erros, `db-test.sh` guardado (esperado); daemon `--ensure` reiniciado; doctor `[ OK ] decisoes do harness: 201
  chaves…`; commit escopado na main (sem push — push = deploy; a main já tinha 39+ commits do guia pré-deploy).
- **Pendências do Charles (na ordem):** (1) `/deus` nos outros 28 projetos — caronte/sagittarius/palantir primeiro; no
  sagittarius mover `OPENROUTER_API_KEY` do `harness.env` para o `.local` e **trocar a chave** (ela está no git);
  (2) só depois apagar `HARNESS_DUELO_MODELS`, `HARNESS_DUELO_SUPLENTES`, `HARNESS_OLLAMA_MODEL`, `HARNESS_FRENTES_MAX`
  do `~/.harness.env.local` do PC; (3) herdadas da 3.5.6: push da Mariana pelo `GUIA-PRE-DEPLOY-2026-09-16.md`
  (backup antes: 0200 mexe em dado), DT-600 + `HARNESS_PW_LOCK_ESPERA=on` na Mariana, pastas `--wt-*` presas pelas
  abas; (4) régua "depois": `compara-prds.js` após 3 execs na 3.5.7.
