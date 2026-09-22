---
titulo: Harness — análise da semana 15→22/08/2026 e proposta 3.2.2
janela: 2026-08-15 → 2026-08-22 (8 dias)
janela_anterior: 2026-08-07 → 2026-08-14
gerado_em: 2026-08-22
escopo: --all (6 projetos com execução real) + contagem de DTs em 8 projetos
---

# Harness — análise da semana 15→22/08 e proposta 3.2.2

**Fonte:** `harness-dashboard.mjs --all --de=2026-08-15 --ate=2026-08-22` (27 execuções · 6 projetos ·
199 subagentes · 26,7M tokens de saída) + `git log` e `prds/debito_tecnico/INDEX.md` de 8 projetos.
**Atenção:** a 3.2.1 foi publicada em 21/08 — **todas as execuções da janela rodaram na 3.1.0/3.2.0**.
Este relatório mede o *antes*; a 3.2.1 ainda não tem amostra.

## 1. O que os números dizem

| Métrica | Semana | Anterior | Leitura |
|---|---|---|---|
| Execuções (PRD/lote) | 27 | 38 | menos volume, **mais caro por unidade** |
| Tokens/execução (mediana) | **774k** | 683k | +13% |
| Tokens/`/prd-exec` (mediana) | **2,04M** | 1,02M | **+100%** — execução dobrou de custo |
| Tokens/`/prd` fase 1 (mediana) | **567k** | 310k | +83% |
| Duração ativa (mediana) | 1h20 | 1h12 | estável |
| Duração `/prd-exec` (mediana) | **4h57** | 5h47 | melhorou, mas ainda ~5h |
| Paralelismo (mediana) | 1,43 | 1,27 | a frota continua de 1–2 agentes |
| Ociosidade total | 1.635 min | 2.361 min | 27h de sessão esperando humano |
| Delegações ao Codex | 6 (peter-quill 5, atlas 1) | — | dial `off` em quase todo projeto |

**Os 7 alertas vermelhos:**

| Projeto · run | Alerta | Número |
|---|---|---|
| dra-mariana-duarte · PRD-120-exec | execução SERIAL | fator 0,99 com **20** subagentes |
| aec-backend · PRD-032-exec | execução SERIAL | fator 0,91 com 12 subagentes |
| aec-erp-frontend · PRD-022-exec | execução SERIAL | fator 1,19 com 13 subagentes |
| dra-mariana-duarte · PRD-120-fase1 | duração | 3h24 (mediana do grupo 46 min), 1,35M tokens |
| caronte · PRD-009-fase2 | ciclos | **5 ciclos** de gate (preset máximo) |
| caronte · PRD-009-fase2 | duração | 2h47 |
| palantir-app · PRD-097-exec | classificador | 1 negação |

**Ociosidade (sessão aberta esperando gente):** aec-backend PRD-032-fase2 **492 min**, palantir
PRD-096-fase1 **412 min** e PRD-096-exec **507 min**. São ~24h da semana em que a sessão estava
parada num prompt — e o `HARNESS_NOTIFY_CMD` está **vazio** no mestre (ninguém é avisado).

**Agentes lentos:** hefesto no palantir-app mediana **44 min** (3× a global, n=21) e no
aec-erp-frontend **51 min** (3,5×, n=5); peter-quill no aec-backend 32 min (5×). Onde o hefesto
demora 45 min, a task estourou o envelope — exatamente o que a 3.2.0 pediu para fatiar.

**Lote de DTs não é barato:** LOTE-011 do core (5 itens) levou **11h20** de parede, 1,29M tokens,
2 ciclos de review. Um lote de 5 DTs "pequenos" custou mais que uma `/prd-exec` mediana.

**Modelos:** Sonnet 163 chamadas (11,4M tokens), Opus 29 (1,5M), Opus[1m] 7. A política Sonnet-first
está valendo; o Opus aparece onde deve (ciclo 1 de beholder/michelangelo, sherlock c1).

## 2. A fila de DTs — o problema que o Charles apontou

| Projeto | DTs totais | Pendentes | Novos na semana |
|---|---|---|---|
| dra-mariana-duarte | **448** | **79** | **26** |
| palantir-app | 161 | 44 | **24** |
| aec-erp-frontend | 123 | 22 | 7 |
| aec-backend | 82 | 16 | 3 |
| newportaltefnet | 52 | 21 | 4 |
| caronte | 29 | 16 | 5 |
| doce-ana | 307 (herdados do core) | 18 | 8 |

**De onde vieram os 26 do core nesta semana** (lendo a Origem de cada arquivo):

| Origem | Qtd | É dívida? |
|---|---|---|
| "Observações / Melhorias Futuras" da PRD-120 (DT-433…438) | 6 | **não — ideia de produto** |
| Feedback do cliente (DT-443…448: perfis, CEP, responsáveis legais, prontuário, salas) | 6 | **não — é PRD**, não DT (6 arquivos = 1 PRD "clínica multi-profissional") |
| Observação operacional do Charles em produção (DT-424…430, 442) | 8 | sim (bug/ajuste) |
| Incidente do **harness** (DT-439 "agentes atlas/dedalo travaram") | 1 | **não — problema do harness**, não do produto |
| Achado sistêmico de spec legada (DT-440) | 1 | sim |
| Achado de gate de UX não-bloqueante (DT-441) | 1 | sim (pequeno) |
| Changelog WAHA, comissão, LOTE-012 (DT-423, 431, 432) | 3 | misto |

**Metade dos DTs da semana não era dívida técnica.** O fluxo manda tudo para o mesmo funil
(`/dt` → arquivo de 40+ linhas → INDEX), e a `/dt-exec` gasta triagem (e token) em ideia e em PRD
disfarçada a cada lote. É o "overkill" que o Charles descreveu.

## 3. O que foi implementado agora (candidato a **3.2.2** — número a confirmar pelo Charles)

### 3.1 Fechar a torneira na origem — triagem de CLASSE
- **`/dt` Fase 0.5:** classifica em `bug | dívida | ideia | harness | dimensionamento` **antes** de
  entrevistar. Só bug/dívida viram `DT-XXX`. Ideia → **1 linha** em `prds/backlog/IDEIAS.md`
  (template novo `TEMPLATE-IDEIAS.md`). Incidente do harness → `.harness-run/harness-incidentes.jsonl`
  + aviso para levar ao mestre. Estouro de envelope → telemetria. **Checagem de duplicata** por grep
  no INDEX antes de criar.
- **`/prd-exec` 1.3:** "DT de dimensionamento" deixa de existir — vira `--extra` da telemetria.
- **`/prd-exec` Fase 5:** mesma triagem de classe + **teto de 3 candidatos a DT por PRD**; "Melhorias
  Futuras" nunca mais vira um arquivo DT por item.
- **`/prd`:** 🔵 de inovação/revisor → `IDEIAS.md`, não `/dt`; 🟡/🔵 do piso crítico idem.
- **`TEMPLATE-INDEX-DT.md`:** status novos `Descartado (data · prova)` e `Ideia`.

### 3.2 Sanear o que já existe — skill nova `/dt-sweep`
Varredura **read-only** que classifica cada DT pendente em 5 baldes com **prova executável**
(⚪ descartar · 🔵 ideia · 🟢 lote · 🔴 PRD agrupado por tema · 🟡 decidir), e devolve a **fila de
lotes por área com o comando pronto para cada sessão paralela** (`/dt-exec --fila=N DT-a DT-b…`),
respeitando arquivo/tabela/banco (migration sempre na sessão A, por último, sem worktree).
`--aplicar` escreve status sob confirmação; `--loop` reemite a próxima fila até a parte 🟢 esvaziar.
`--executor=openrouter` manda a classificação bruta a um modelo barato — **quem prova e decide é a
sessão**. Registrada no doctor, nos testes de aceitação (t07) e nos adapters Codex.

### 3.3 Executor `openrouter` no broker de delegação
`harness-delegate.sh --executor openrouter` faz UMA completion HTTP (Node `fetch`, sem dependência)
com `--attach` para anexar os arquivos que a tarefa precisa ler (teto 400 KB). Chave
`OPENROUTER_API_KEY` **só** no ambiente ou no `harness.env.local`; modelo default
`HARNESS_OPENROUTER_MODEL='deepseek/deepseek-v4-flash'`. Usage e **custo em USD** vão para o manifest
(`cost_usd`). Validado: sintaxe, `--rota`, e o caminho `indisponivel` sem chave (exit 10).
**Não validado com chamada real** — falta a chave.

### 3.4 Dashboard
Grupo novo `sweep` (label `DT-SWEEP-*`) para a fila de DTs aparecer encolhendo no `/harness-report`.

## 4. Cinco (sete) sugestões de melhoria — o que fica para decidir

| # | Sugestão | Evidência | Custo | Ganho esperado |
|---|---|---|---|---|
| **S1** | **Aviso de espera humana via WhatsApp (WAHA)** — preencher `HARNESS_NOTIFY_CMD` com um `curl` ao WAHA (chave no `env.local`) | 1.635 min ociosos na semana; runs de 412/492/507 min parados num prompt | 1 linha de config + chave | recupera horas de parede por semana; zero token |
| **S2** | **Entrevista única de decolagem na `/prd` fase 2 e `/prd-exec`** (como a `/dt-exec` 1.4 já faz): colher *todas* as decisões antes de rodar e nunca mais perguntar no meio | as ociosidades acima são perguntas no meio do run | texto de skill | sessão roda autônoma ponta a ponta |
| **S3** | **Task packet para hefesto/dedalo** — executor recebe só PERFIL-RESUMO + arquivos-alvo + contrato da task, nunca o Perfil inteiro; cap de contexto por subagente | `/prd-exec` 1,02M → 2,04M tokens; hefesto 56k/chamada, dedalo 88k, ariadne 130k | 3.3.0 (candidato já listado no CHANGELOG) | −30–40% de token na execução |
| **S4** | **Mini-lote = review leve**: lote ≤ 3 itens sem migration/tela roda sherlock **solo** (sem Codex) com 1 ciclo | LOTE-011: 5 itens, 11h20, 1,29M tokens | ajuste em `/dt-exec` Passo 5 | lote volta a caber em 1h30 |
| **S5** | **Teto de ciclos na fase 2 = 3 mesmo no preset máximo**, e ciclo ≥ 2 sempre em Sonnet | caronte PRD-009-fase2: 5 ciclos, 2h47 | ajuste de preset | −40% na fase 2 do preset máximo |
| **S6** | **Delegação `apoio` como default em projeto com Codex logado** — hoje `off` em todo projeto; o Codex foi usado 6× na semana | dial existe desde 3.0.0 e ninguém liga | `HARNESS_DELEGATE_MODE='apoio'` por Perfil | discovery mecânico sai da conta Claude |
| **S7** | **Fatiamento automático quando o hefesto estoura 2× na mesma PRD** — a `/prd-exec` já detecta; falta *agir*: parar a onda e re-fatiar a task restante em vez de só registrar | palantir hefesto 44 min, aec-erp-frontend 51 min (3–3,5× a mediana) | lógica na 1.3 | ataca a cauda serial (fator 0,9–1,2) |

**Ordem sugerida:** S1 (hoje, 5 min) → S2 + S4 + S5 (patch de texto, 3.2.3) → S6 (config) → S3 + S7 (3.3.0).

## 5. Modelos via OpenRouter — 5 (7) viáveis para descarregar a sessão principal

Preços lidos da API pública do OpenRouter em 22/08/2026 (USD por 1M tokens, in/out); throughput = P50
do melhor provider na página do modelo (oscila).

| Modelo (id exato) | In / Out | Contexto | tok/s | Tools / JSON | Papel no harness |
|---|---|---|---|---|---|
| `deepseek/deepseek-v4-flash` | **0,056 / 0,11** | 1M | 94 | sim / structured | **default do executor** — triagem do `/dt-sweep`, resumo RAG, sumarizar PRD/DT |
| `qwen/qwen3.7-flash` | **0,03 / 0,13** | 1M | 62 | sim / só `response_format` | classificação em massa (mais barato); é VL, sem structured outputs |
| `google/gemini-3.7-flash` | 0,375 / 1,875 | 1M | **196** | sim / sim | fan-out rápido, varredura de repositório, latência baixa |
| `qwen/qwen3-coder-next` | 0,12 / 0,80 | 262k | 54 | sim / sim | patch mecânico, leitura de diff grande, refactor guiado |
| `anthropic/claude-haiku-4.5` | 1,00 / 5,00 (cache read 0,10) | 200k | 65–91 | sim / sim | worker "mesma família": herda os prompts do harness sem reescrever |
| `z-ai/glm-4.7-flash` | 0,06 / 0,40 | 202k | 55 | sim / sim | revisão curta / tarefa mecânica (saída máx. 16k — não gera arquivo grande) |
| `nvidia/nemotron-3.5-lightning:free` | **0 / 0** | 1M | 48 | sim / não | camada grátis para tarefas idempotentes (rate-limited; sem JSON mode) |

Alternativas de código mais forte quando precisar acertar de primeira: `z-ai/glm-4.7` (0,40/1,75),
`moonshotai/kimi-k2.7-code` (0,67/3,40, 242 tok/s), `deepseek/deepseek-v4-pro` (0,41/0,83, 1M).
Para extração estruturada confiável: `openai/gpt-5.6-luna` (0,20/1,20; não aceita `temperature`).

**Onde encaixar (sem mexer no que funciona):** (1) `/dt-sweep --executor=openrouter`; (2) provider
`openrouter` no summarizer do RAG (`HARNESS_RAG_LLM_PROVIDER`) — hoje `claude-cli` gasta crédito Agent
SDK a preço de API; (3) papéis `discovery-*` e `peter-quill` na tabela de roteamento do Perfil;
(4) geração do `PERFIL-RESUMO.md`. **Nunca** hefesto/dedalo/sherlock/michelangelo — esses exigem
ferramentas e julgamento; o executor `openrouter` é uma completion sem shell.

## 6. Estado dos repositórios (pedido "atualize os repos")

Todos os projetos principais já estavam na **3.2.1** (sync do DEUS em 21/08): caronte, dra-mariana-duarte,
aec-backend, aec-erp-frontend, palantir-app, sagittarius, site-allyson-bezerra-2026, newportaltefnet,
3s-regulacao, doce-ana, site-3s, api-sagittarius, gsa_sagittarius, dra-mariana-duarte-app,
starfilms-originalidade. **Não há o que sincronizar até a 3.2.2 ser numerada.**

Os clones Taurus estão **atrás do core** e só atualizam via `/propagar` (push = deploy em produção —
fora deste relatório): `clinica-revallie` e `dr-tarcisio-lucena-pdf` **25 commits** (harness 3.1.0);
`dr-tarcisio-lucena`, `dr-renato-fernandes`, `dr-thiago-couto`, `dra-cleice-bezerra` **99 commits**
(working tree sujo em todos os 4).

## 7. Texto proposto para o CHANGELOG (3.2.2)

> **3.2.2 — 2026-08-22 — A fila de DTs ganha porta de entrada com triagem e porta de saída com prova.**
> PATCH: nenhum contrato muda; `/dt`, `/prd` e `/prd-exec` passam a classificar antes de criar
> (só bug/dívida vira `DT-XXX`; ideia → `IDEIAS.md`; harness → mestre; dimensionamento → telemetria;
> teto de 3 candidatos por PRD). Skill nova `/dt-sweep` (saneamento com prova + fila de lotes para
> sessões paralelas + `--loop`). Executor `openrouter` no broker (`--attach`, custo em USD no manifest).
> Grupo `sweep` no dashboard. Medições de origem: 26 DTs/semana no core, metade não era dívida;
> LOTE-011 11h20; 1.635 min de ociosidade na semana.

## 8. Adendo (22/08, noite) — correções e acréscimos

- **Modelos (pesquisa aprofundada):** o id `deepseek/deepseek-v4-flash` no OpenRouter aponta para o build de abril; o GA para agentes/código é **`deepseek/deepseek-v4-flash-0731`** (SWE-bench Verified 79,0 · LiveCodeBench 91,6 · Terminal-Bench 82,7 vendor / 79 independente) — virou o default do executor. **`qwen/qwen3.7-flash` é modelo de visão-linguagem, sem benchmark de código publicado** — fora; substituto Qwen para código: `qwen/qwen3-coder-next` (0,12/0,80; SWE-bench 70,6). `google/gemini-3.7-flash`: melhor índice independente (AA 56), ~340 tok/s, 64k de saída, preço promocional até 31/12/2026. Workers escolhidos: **DeepSeek V4 Flash 0731 + Gemini 3.7 Flash**. Juiz barato: **`deepseek/deepseek-v4-pro`** (0,41/0,83) ou `anthropic/claude-haiku-4.5` (família diferente dos workers — sem viés de auto-preferência).
- **Teste real do executor:** `deepseek-v4-flash`, INDEX anexado (28k tokens), resposta em 4 s, **US$ 0,0019** — custo gravado no manifest e no `harness-delegations.jsonl`.
- **Teto de gasto diário** no broker: `HARNESS_OPENROUTER_BUDGET_USD_DAY='2'` (soma do `cost_usd` de hoje; acima → `indisponivel` → fallback nativo).
- **Métricas no repo (pedido do Charles):** `harness-metrics.sh stop` passa a gravar também em **`prds/_metrics/runs/<dev>@<maquina>.jsonl`** (versionado, um arquivo por dev/máquina, com `projeto`, `autor`, `maquina`, `harness`, `extra`). O dashboard lê `runs/*.jsonl` + o legado local, e descarta linha cujo `projeto` ≠ repo (linhagem de clone). `prds/_metrics/README.md` documenta e passa a viajar no sync.
- **PRDs do Mariana na 3.2.1:** PRD-121 foi **fatiada em 121 (ver) + 122 (agir)** pelo teto de 8 tasks; a 121 já usa dependências tipadas (13 `[requires]`, 2 `[barrier]`, 1 `[mutex]`) e task de acceptance; a 122 tem 7 tasks. **Nenhuma execução (`/prd-exec`) rodou ainda na 3.2.1** — as linhas de telemetria PRD-121-fase1/fase2 são de 20/08 (3.1.0). A primeira medição real da 3.2.1 será a exec da 121.
