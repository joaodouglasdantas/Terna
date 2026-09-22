---
tipo: analise-harness
data: 2026-09-13
projeto: dra-mariana-duarte
run: PRD-142-b-exec (12/09 12:40 → 17:59, 5h19)
harness: 3.4.34 (projeto) / 3.5.1 (mestre)
status: diagnóstico + propostas (nada implementado)
---

# Por que a PRD-142-b levou 5h19 com 9 tasks e 2 ciclos de review

> [!abstract] Resposta curta
> O run gerou **2,73 milhões de tokens de saída** (pai 454k + 21 subagentes 2,28M) com paralelismo efetivo de **1,74**.
> **~83% desses tokens são raciocínio invisível** (esforço `high` herdado por todo subagente). O "tok/s bom" da telemetria
> está inflado 2,4× (usage somado por bloco de conteúdo). Em cima disso, quatro perdas de parede somam ~2h:
> teto de 4 vivos com 5 tasks liberadas, 3 tasks cortadas no fôlego 150 e terminadas pela pai em série,
> 126 rodadas de Playwright com contenção entre agentes, e um 4º sherlock de "lacuna" por fatiamento cego do packet.

## 1. Linha do tempo (parede 319 min)

| Faixa | Min | O que aconteceu | Subagentes vivos |
|---|---|---|---|
| 12:40–12:54 | 14 | Pre-flight, entrevista, packets, checker (2 min), Laragon | 0 |
| 12:54–13:54 | 60 | Onda 1: TASK-001/002/003/004 (37–59 min cada). TASK-006 liberada mas **esperando vaga** (teto 4) | 4 |
| 13:37–14:24 | 47 | TASK-006 quase sozinha. Pai **terminou TASK-002 e 004** (PARCIAL por fôlego) em série, 13:54–14:24 | 1 |
| 14:26–15:03 | 37 | TASK-005/007 (liberadas desde 13:35/13:54, despachadas só às 14:26) + sherlock c1 backend + Codex | 2–3 |
| 14:53–15:31 | 38 | 3 correções do c1 backend (hefesto×2, dedalo) | 2–3 |
| 15:31–15:51 | 20 | **Pai sozinha** depurando "modal preso" → falso alarme (armadilhas DT-318 / `_isTransitioning`) | 0 |
| 15:51–16:10 | 19 | Review c1 front: 4 sherlocks opus em partes | 4 |
| 16:10–16:58 | 48 | Triagem da pai (8 min) + 2 correções (dedalo 39 min, 16 rodadas de Playwright) | 1–2 |
| 16:58–17:05 | 7 | Pai roda família completa (4,1 min) + monta packet c2 | 0 |
| 17:05–17:38 | 33 | Review c2: 3 sherlocks sonnet (5–10 min) + **sherlock de lacuna 20 min** (fatiamento cego) | 1–3 |
| 17:38–17:59 | 21 | Pai corrige B1 sozinha (red-green), família de novo (4,1 min), TASK-009, telemetria | 0 |

Ocupação: **74 min com zero subagente (23%)**, 90 min com 1, 63 com 2, 29 com 3, 63 com 4+.

## 2. Onde foi o tempo dos executores (552 min-agente)

| Componente | Min | % | Observação |
|---|---|---|---|
| Espera do LLM (1.624 turnos, 13,5 s médio) | 365 | 66% | mediana 5 s, p90 20–36 s; contexto 300–600k tokens por turno |
| Bash (parede) | 94 | 17% | 126 rodadas de Playwright = 60 min; 7–19 rodadas por task, 2–5 falhas cada |
| Edit/Read/Grep/Write + hooks | ~18 | 3% | hooks NÃO são gargalo (Edit 1,5–8 s) |
| Demais | ~75 | 14% | spawn, relatório, SubagentStop |

Tokens de saída por executor: 108k–228k, dos quais só 20k–38k visíveis (texto + input de ferramenta).
**O restante (~83%) é thinking** — a sessão rodou em `high` (preset equilibrado) e todo subagente herda.

Comparação com a PRD-142-exec do mesmo dia (backend, 1h52): tasks de 4–26 min, 17k–125k tokens, fator 2,10.
A 142-b (front + Playwright) gerou 2,4× os tokens e levou 2,85× o tempo.

## 3. Sete causas, em ordem de impacto

1. **Esforço `high` nos executores** — ~1,9M dos 2,73M tokens gerados são raciocínio. É a maior alavanca isolada.
2. **Fôlego 150 estourado em 3 tasks** (002 Edit, 004 Bash, 005 Edit — exatamente n=151). Voltaram PARCIAL e a
   **pai completou 002/004 sozinha** (30 min, 0 subagente) e só então despachou 005/007 — que estavam liberadas
   há 30–50 min. As 3 tasks marcadas GRANDE pelo checker (001/002/003) receberam override `grande-ok` e foram
   justamente as que levaram 49–59 min.
3. **Teto de 4 vivos com 5 tasks liberadas** — TASK-006 esperou 43 min por vaga com `CARGA|baixa`, spawn 320 ms
   e 1 frente. Cauda serial de 45 min.
4. **Playwright como imposto serial** — 126 rodadas dos executores (60 min) + ~25 min de rodadas da pai. Specs de
   agentes diferentes disputam o mesmo banco/lock (18 falhas falsas em `historico/modal.spec.js`, registradas no
   estado). Nenhum executor usou worktree (coluna vazia) apesar do 3.4.0.
5. **Review em partes por tamanho, não por arquivo** — c1 front em 4 partes opus (13–18 min cada) + c2 em 3 partes
   sonnet + **4ª rodada de "lacuna" (20 min)** porque cada sherlock leu 1/3 cego. Incidente já registrado às 17:59.
6. **Pai fazendo trabalho de executor** — 118 min de "gates" da pai: terminar PARCIAIs, depurar armadilha de teste
   (20 min), corrigir B1 com red-green (13 min), TASK-009. Contexto mediano da pai: **513k tokens (máx 966k)** —
   cada turno dela custa 5–16 s e ela está na beira da compactação.
7. **Telemetria mente no tok/s** — `tokens_output` e `turnos` da pai somam o usage repetido por bloco de conteúdo
   (1.078k registrado vs 454k real; TASK-004 `turnos` 292 vs 151 mensagens). `out_tps` 56 → real 24 (pai);
   agregado real 143 tok/s. `waves=4` mas houve 6+ gerações de despacho; `limitou` veio vazio.

## 4. Propostas (para o mestre 3.5.x — PATCH, sem bump sem perguntar)

| # | Mudança | Onde | Ganho estimado na 142-b |
|---|---|---|---|
| P1 | Preset **equilibrado → esforço `medium`** para a sessão da `/prd-exec` (executores + pai). `high` só por override do Perfil, `xhigh` nunca por preset. Medir `tokens_thinking_pct` (out − visível) na telemetria | SKILL Passo 0 + `harness-metrics.sh` | −25 a −35% na espera do LLM (~−60 min) |
| P2 | **PARCIAL-fôlego não é da pai**: continuação vai a um executor novo (prompt "continue a TASK-00X a partir do relatório; não refaça"); e PARCIAL com código pronto **libera os dependentes no mesmo turno** | SKILL 1.3 item 2 + Teto de duração | −30 min de pai em série, 005/007 sobem 40 min antes |
| P3 | **`grande-ok` limitado**: no máximo 1 override por PRD; a partir do 2º GRANDE o checker exige re-fatiar antes de decolar. Fôlego volta a **100** (150 foi ajuste da PRD-141) e a `/prd` mira ~90 chamadas/task | `task-packet.sh` check + `harness.env` | tasks de 45–59 min → 25–30 min |
| P4 | **`HARNESS_PIPELINE_MAX_VIVOS` dinâmico**: 6 quando `CARGA|baixa` e ≤ 2 frentes; 4 é o piso, 2 só com spawn LENTO | `carga-maquina.sh` (já imprime `vivos`) + SKILL 1.3 | −40 min (TASK-006 na onda 1) |
| P5 | **Disciplina de Playwright no executor**: só o spec próprio, `--grep` no cenário em correção, `--workers=1`, **máx 4 rodadas por task** (5ª = relatório PARCIAL com log); família só pela pai, 1× no fim da onda A e 1× após o último ciclo. Worktree + `HARNESS_WT_DB='clone'` ligado por default para tasks de front na mesma PRD (mata a contenção de lock) | agentes hefesto/dedalo + SKILL 1.4/2 | −30 a −40 min |
| P6 | **Packet de review fatiado por ARQUIVO/task** (dono claro), nunca por bytes; cada sherlock recebe a lista de arquivos e declara cobertura no relatório; lacuna vira erro do fatiador, não rodada extra | `review-packet.sh` | −20 min (rodada de lacuna) |
| P7 | **Pai não edita código de produção** salvo ≤ 3 edits sem rodar suíte; investigação de teste "preso" vai a um sherlock/hefesto com prompt de diagnóstico | SKILL Fase 2 triagem | −20 a −30 min; protege o contexto da pai |
| P8 | **Telemetria**: dedup de usage por `message.id` (pai e tasks), `turnos` = mensagens únicas, `tokens_thinking_pct`, `vivos_max`/`limitou` obrigatórios no stop, `waves` = gerações reais | `harness-metrics.sh`, `task-telemetry.mjs` | leitura correta do tok/s |

Somando P1–P7 na mesma PRD, a estimativa honesta é **~2h a 2h15 de parede** (vs 5h19). P1 e P4 são knobs de uma
linha e valem um teste na próxima PRD de front antes de mexer no resto.

## 6. Esforço — o conceito para dosar no harness

**O que o esforço controla.** Quanto o modelo raciocina antes de CADA ação e quanto ele "confere" por conta própria
(relê, reroda, revalida). Não é "mais inteligente"; é "pensa mais por turno". Numa pergunta única isso é barato e
quase sempre vale. Num loop agêntico de 150 turnos o custo é por turno: na 142-b foram ~1,3k tokens de raciocínio
por turno, 83% de tudo que os executores geraram — e o tok/s da telemetria contava esse raciocínio como produção.

**Maior é melhor onde há julgamento aberto; é só mais lento onde o trabalho já está fechado.** O harness já moveu o
julgamento para cima: discovery, técnica, packet, contrato de API, invariantes do gate. O hefesto/dedalo recebe um
envelope fechado. Ali o `high` compra pouco (a decisão já foi tomada) e cobra em toda chamada — e ainda induz o
comportamento que a run mostrou: "confirmar" rodando o spec 7 a 19 vezes.

| Trabalho | Esforço que paga | Por quê |
|---|---|---|
| `/prd` (discovery, técnica, gates beholder/michelangelo) | `high` | é onde o erro barato vira caro |
| sherlock ciclo 1 (investigação aberta) | `high`, ou `medium` em **opus** | modelo compensa esforço |
| triagem da pai (decidir o que é real) | `high` | decisão, não execução |
| hefesto/dedalo executando packet | `medium` | envelope fechado; custo por turno |
| sherlock ciclo 2+ (delta), hermes, doc | `medium` | confere lista, não investiga |

**A restrição e a solução (implementada na 3.5.3).** No Claude Code o esforço é da SESSÃO; o `Agent` não tem
parâmetro de esforço e todo subagente herda — **salvo `effort:` no frontmatter do agente**, que viaja com o mestre.
Daí duas camadas: (1) **por papel**: hefesto/dedalo `effort: medium` fixo, sherlock/beholder/michelangelo `high`
fixo — executor imune a sessão esquecida em `high`, juiz imune a exec em `medium`; (2) **por fase**: o Perfil ganha
"Esforço — fase pensar" (`/ideia` `/dt` `/prd` `/mockup` `/dt-sweep`: `high`) e "fase executar" (`/prd-exec`
`/dt-exec` `/codex-review` `/manual`: `medium`), e cada skill lê o esforço real da sessão por `get_session self`,
roda `hooks/esforco.sh <fase>` e pede `/effort <alvo>` uma vez se divergir (a sessão não pode mudar o próprio
esforço). Onde a exec precisa de julgamento (sherlock c1), sobe o MODELO (opus), não o esforço da sessão.

**Como validar antes de virar regra.** Próxima PRD de front em `medium`, comparando com a 142-b:
`tokens_thinking_pct` (esperado cair de 83% para ~50–60%), parede por task, `achados_por_ciclo` (se subir muito,
o `medium` está deixando bug passar e o preço voltou pelo review) e tasks PARCIAL. Uma run decide.

## 5. Fontes
- `prds/_metrics/harness-runs.jsonl` (linha `PRD-142-b-exec`), `prds/_metrics/tasks/Charles@CharlesPC.jsonl` (21 linhas da sessão `edc134ee`)
- Transcript `~/.claude/projects/C--laragon-www-dra-mariana-duarte/edc134ee-….jsonl` + 21 transcripts de subagente
- `.claude/.harness-run/estado-PRD-142-b.md`, `prds/_metrics/incidentes/` (3× fôlego, 1× fatiamento cego)
