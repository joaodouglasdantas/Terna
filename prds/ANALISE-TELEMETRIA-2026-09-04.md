# Análise de telemetria do harness — 3.4.19/3.4.20 em campo (Charles + equipe) + 10 melhorias

> **Data:** 2026-09-04 (coleta 21:00–22:40; segunda passada após `git pull` dos repos da equipe).
> **Recorte A (Charles, 3.4.20):** `dra-mariana-duarte` (main + worktrees 135-b/138/tmr) e `caronte`, 02/09 21:00 → 04/09.
> **Recorte B (equipe, chegou via git em 04/09):** `newportaltefnet` (Derick, João Neto, Giovanny — 3.4.5→3.4.19),
> `meuanuncio-api` e `sistema-vs` (Derick, 3.4.18/3.4.20), `ric-tur-backend/frontend` (Débora, 3.4.20),
> `bonifica-pedidos` (Giovanny), `integracao-tefnet-fiserv` (Marcos), `universitarias-vip` (Charles no Mac, 3.4.8/3.4.10).
> Janela do recorte B: harness ≥ 3.4.10 ou início ≥ 29/08.
> **Pergunta central:** o que a 3.4.20 entregou, o que ainda limita, e que 10 melhorias (controle/volume +
> velocidade/eficiência) vêm a seguir.
> **Escrita:** só este arquivo. Nada em skills, hooks, env. Git: só `pull --ff-only`/clone (ver §1.1).

---

## 0. Resumo executivo

1. **Fase 1 da `/prd` está no alvo** (mediana 25 min ativos no Charles; 13–16 na equipe). **Fase 2 não, no
   Charles:** mediana ~90 min (51–123; alvo 50–60). Único caso no alvo = PRD-138 em **MODO LEVE** (51 min,
   153 linhas/task, sem hermes). Hermes E+C = 27–48 min (30–55% da fase 2); gates 25–91 min; PRD-139 bateu o
   teto de 3 ciclos com 436 turnos de hermes.
2. **Exec do Charles: 0 de 6 dentro do SLO de 2 h** (109–350 min de parede; ativa mediana 212). Causa dominante
   por exec: mutex de arquivo (137, 138), tasks longas (135-b: 141/97/76/66 min contra envelope de 45), teto de
   vivos por spawn lento (136-b: 1.382 ms → `vivos_max=2`), dependências (Caronte). Três execs autônomas
   rodaram **ao mesmo tempo no mesmo PC** (01:16–04:07 de 04/09): 858 min de parede para 27 tasks.
3. **A equipe executa a mesma quantidade de tasks em 1/3 do tempo.** Derick e João: fase 2 em 28–63 min e exec
   em 53–98 min ativos para 9–12 tasks (preset econômico, 1 frente, spawn 33–69 ms). Charles: fase 2 86–201 e
   exec 173–417 para 7–11 tasks (equilibrado/máximo, 2–3 frentes, spawn 166–1.382 ms, tasks 199–267 linhas).
   Giovanny (Mac, spawn 5 ms) fica no meio: exec 68–196, fase 2 25–195 (a PRD-114-b precisou de **8 ciclos**
   com o teto elevado pelo Owner). O harness não é o outlier; a configuração e a máquina do Charles são.
4. **Leitura via Bash é o maior desperdício mecânico:** 3.007 chamadas Bash de subagentes em 2 dias no Charles,
   **1.966 (65%) leitura pura** (`grep`, `sed -n`, `cat`, `ls`, `wc`); a regra "Ferramenta certa para LER"
   (3.4.12) está em 9 agentes e não pegou (hefesto 54%, beholder 93%, atlas 98%). Com spawn de 166–1.382 ms
   isso pesa 5–40× mais no PC do Charles do que nas máquinas da equipe.
5. **O teto de fôlego é prosa:** hefesto/dedalo "~60 chamadas" → p90 121–125 turnos, máx 253 (dedalo, 141 min).
   **O watchdog por p90 não registrou nenhum overrun** em nenhum projeto (`watchdog-overruns.jsonl` não
   existe), com 6 agentes acima de 60 min; 16 marcadores `.start` órfãos; p90 vindo de dashboards de agosto.
6. **Codex é por dev:** Derick teve dupla-cega real em 6 de 7 execs; Charles ficou em SHERLOCK-SOLO em 10 de
   12 (limite até 07/09; 5/5 preflights falhando e repetindo a cada run); João 6/6 solo (limite até 09/09);
   Giovanny 3 dupla / 4 solo (classificador bloqueou o Codex, timeout de 600 s em checkout compartilhado).
   Duelo: 24 eventos desde 01/09, 4 aplicados (3 com remendo manual); `qwen3-coder-next` 0/5 vitórias e 5/5
   diffs inaplicáveis — a régua do placar já o marca como "candidato a sair" e ele continua no pool.
7. **Controle/volume — furos:** (a) dashboard **descarta runs de worktree** (3 execs mais pesadas invisíveis);
   (b) runs duplicados (Caronte PRD-013-fase2 ×2; newportaltefnet PRD-114-b-fase2 ×3; `PRD-000-exec` do
   Derick); (c) **7 runs deixados abertos por 1,5–15 dias** (Caronte PRD-009-exec 20.634 min, Mariana
   PRD-134-exec 9.565, fiserv PRD-002-exec 21.901 com 103 subagentes…) entram nas medianas e no "top caros";
   (d) `permission-waits.jsonl` com 16/83 linhas inválidas; (e) `extra` livre não é agregável;
   (f) **Débora não tem uma linha de telemetria versionada** em 2 repos com PRDs 031–039 e gates rodados —
   o arquivo `runs/<dev>@<host>.jsonl` só chega ao git quando o dev o inclui no commit escopado (newportaltefnet:
   Giovanny 13×, João 4×, Derick 2×; Débora 0×); nenhuma skill ou hook o commita.
8. **Permissão e classificador variam por máquina:** João 76 prompts em 11 runs (8 por run); Giovanny 52
   negações do classificador em 33 runs (+ anti-espiral); Charles 27 prompts "permission to use
   AskUserQuestion" em 2 dias e 59 min de espera humana numa exec "noturno autônomo". `permissions.allow` do
   Mariana está vazio (a auto-edição foi barrada pelo classificador).

---

## 1. Fontes e método

| Fonte | O que foi lido |
|---|---|
| `prds/_metrics/harness-runs.jsonl` + `runs/*.jsonl` de 10 repos | recorte A: 26 linhas; recorte B: ~140 linhas (dedup por projeto+label+ts_end) |
| `harness-dashboard.mjs --all` (03–04/09 e 29/08–04/09) | 17 execuções/2 projetos/86 agentes; 138 execuções/7 projetos/266 agentes/119 alertas |
| `harness-delegations.jsonl`, `harness-duelos.jsonl` | 9 delegações (5 preflight codex erro) no Charles; 24 eventos de duelo desde 01/09; 40 delegações codex na equipe (26 ok/14 falha) |
| `~/.claude/projects/*/subagents/agent-*.jsonl` (só o PC do Charles) | **149 subagentes**: duração, turnos, Bash × Read, tokens; classificação dos comandos Bash |
| `.claude/.harness-run/` (estado-PRD, incidentes, permission-waits, watchdog, review, packets) | estado das execs, 3 incidentes, 83 esperas, 16 `.start` órfãos, tamanhos de packet |
| 12 agentes técnicos da mestre (1.786 linhas), hooks de enforcement, CHANGELOG 3.4.19/3.4.20 | contrato × enforcement |

Medianas, nunca médias. Duração de agente = primeiro→último timestamp do transcript. Linhas com `elapsed_s` > 12 h
ficam fora das medianas (7 casos, listados em §8.4).

### 1.1 O que foi puxado do git (04/09, 22:00)

| Repo | Antes → depois | Observação |
|---|---|---|
| `dra-mariana-duarte`, `caronte`, `universitarias-vip`, `equipe-tefnet-harness-base`, `vault`, `base-conhecimento` | já iguais ao servidor (hash conferido com `ls-remote`) | nada a puxar |
| `newportaltefnet` | 108 commits atrás → `5a4b344d` (03/09, Derick); harness 3.4.10 → **3.4.19** | 19 arquivos só com CRLF + 1 linha em `manual/SKILL.md` foram para stash e voltaram |
| `meuanuncio-api` | 175 commits atrás → `88764ee` (04/09, Derick); **3.4.20** | telemetria de 11 runs do Derick |
| `sistema-vs` | clonado; trabalho está em `origin/developer` (**3.4.20**, 15 runs) | checkout em `developer` |
| `ric-tur-backend` / `ric-tur-frontend` | 135 / 59 commits atrás (`developer`) → 04/09 e 03/09 (Débora); **3.4.20** | sem `prds/_metrics/runs` |
| `3s-regulacao`, `aec-erp-frontend`, `sagittarius`, `integracao-tefnet-fiserv`, `bonifica-pedidos` | ff-only ok; todos já em **3.4.20** pela própria equipe (via `/prometeu`) | bonifica sem `harness.env` versionado (`.gitignore: *.env`) |
| `modulo_agente` | **pull falhou**: `tests/e2e/com9/…` — `com9` é nome reservado no Windows | repo não clonável/atualizável em Windows até renomear a pasta |
| `clinica-revallie`, `opengate`, `newportalanb` | NÃO puxados: arquivo editado localmente também muda no remoto | decisão do Charles (INDEX de DTs, templates, `login.php`) |
| cym-*, dealer-*, kl-*, pac-*, etc. | atrás, mas sem atividade desde jul/jun — fora do escopo | — |

---

## 2. Criação (`/prd`) — Charles na 3.4.19/3.4.20

| PRD | f1 (ativa) | f2 (ativa) | ciclos | hermes E/C min | turnos hermes | linhas/task | gates min | 🔴 por ciclo | tokens_total f2 |
|---|---|---|---|---|---|---|---|---|---|
| Mar 136-b (fatia) | 41 (35) | 101 | 2 | 12/15 | 219 | 199 | 81 | 4,1 | 113 M |
| Mar 139 | 18 | 85 | 3 (teto) | 19/29 | 436 | 230 | 61 | 9,1,2 | 124 M |
| Mar 135-b (wt, fatia) | 41 | 123 | 3 | 28/22 | 270 | 215 | 91 | 7,1,1 | 105 M |
| **Mar 138 (wt, MODO LEVE)** | 29 | **51** | 2 | 0/0 | 0 | 153 | 32 | 5,1 | 51 M |
| Car 010 | 33 (22) | 91 | 2 | 19/28 | 322 | 219 | 30 | 5,0 | 95 M |
| Car 013 | 17 | 99 (55) | 2 | 27/13 | 312 | 223 | 25 | 5,2,0 | 69 M |
| Car 012-b (3.4.19) | 17 | 81 (76) | 2 | 18/19 | 239 | 224 | 30 | 3,0 | 79 M |

- Hermes por chamada está sob o teto (p90 105 turnos, máx 118; 9–20 min) — o total explode porque são
  2 E + 2 C por PRD. O guard só **avisa** acima de 120 (pendência conhecida da 3.4.20).
- Paralelismo da fase 2: 1,06–1,90 (alertas SERIAL do dashboard em Caronte 012-b e 010).
- `linhas_por_task` 199–230 respeita o teto duro, mas não previu as tasks de 66–141 min da 135-b.

## 3. Execução (`/prd-exec`) — Charles

| PRD | parede (ativa) | tasks | sub | paralelismo | gates min | tokens_total pai / sub | limitou (extra) | review |
|---|---|---|---|---|---|---|---|---|
| Mar 137 (3.4.19) | 210 (195) | 10 | 19 | 1,33 | 51 | 74 M / 404 M | mutex `sugerir_resposta.php` ×5; 3 stalls de 600 s | SOLO |
| Mar 136-b | 230 | 10 | 12 | 1,64 | 90 | 175 M / 227 M | teto: spawn LENTO 1.382 ms → vivos 2 | SOLO |
| Mar 135-b (wt) | 278 | 10 | 15 | 2,68 | 122 | 184 M / 640 M | tasks longas 141/97/76/66 min | SOLO ×4 partes |
| Mar 138 (wt, noturno) | 350 (291) | 7 | 8 | 1,12 | 94 | 213 M / 206 M | mutex `_ia_helpers.php` + grafo; **59 min humano** | SOLO |
| Car 012-b (3.4.19, Mac) | 135 | 10 | 16 | 1,77 | 38 | 67 M / 453 M | dependências + mutex PresencaService | SOLO |
| Car 010 | 109 (79) | 11 | 14 | 1,80 | 40 | 152 M / 161 M | dependências; 29 min humano | SOLO |

O que a 3.4.20 entregou e aparece nos dados: front na onda 1 (137 ✓), packet em partes (135-b ✓), review
antecipado do backend (Derick, sistema-vs PRD-011 ✓), `MATRIZ-HUB` (a 138 ainda nasceu com hub `_ia_helpers.php`
porque a criação foi em MODO LEVE e a matriz roda no Passo 8), `agent-stall.sh` (existe; a armação depende da skill).

## 4. Subagentes (149 na janela, transcripts do PC do Charles)

| Papel | n | min med / p90 / máx | turnos med / p90 / máx | Bash | dos quais leitura pura |
|---|---|---|---|---|---|
| hefesto | 35 | 19 / 67 / 97 | 65 / 121 / 137 | 1.226 | 658 (54%) — grep 400, sed 111, cat 50 |
| dedalo | 18 | 18 / 63 / 141 | 61 / 125 / 253 | 501 | 293 (58%) |
| michelangelo | 18 | 13 / 40 / 44 | 23 / 96 / 108 | 423 | 315 (74%) |
| beholder | 16 | 10 / 26 / 27 | 18 / 42 / 45 | 227 | 211 (93%) |
| hermes | 16 | 9 / 16 / 20 | 43 / 105 / 118 | 4 | 4 |
| sherlock | 15 | 10 / 31 / 36 | 34 / 73 / 104 | 297 | 212 (71%) |
| peter-quill | 14 | 3 / 11 / 12 | 25 / 38 / 41 | 91 | 70 (77%) |
| atlas | 5 | 10 / 26 / 26 | 58 / 69 / 69 | 123 | 121 (98%) |
| general-purpose | 5 | 5 / 8 / 8 | 11 / 18 / 18 | 39 | 30 |
| tony-stark | 5 | 6 / 7 / 7 | 24 / 34 / 34 | 0 | 0 |
| ariadne | 2 | 21 | 104 | 76 | 52 |

Cauda: dedalo TASK-006 (135-b) 141 min / 253 turnos / 105 Bash; hefesto TASK-001 97 min / 137 turnos;
hefesto TASK-005 68 min com **113 Bash e 2 Read**. Total: 3.007 Bash, 1.966 leitura pura (65%). Com spawn
medido de 1,4 s (3 frentes) a 4–40 s sob carga, são 1,5–2,5 h de espera serial dentro dos agentes no período.

## 5. Controle e telemetria — furos encontrados

| # | Furo | Prova |
|---|---|---|
| C1 | Dashboard descarta run de worktree | `harness-dashboard.mjs:96` filtra `o.projeto === d`; runs trazem `projeto: dra-mariana-duarte--wt-…` → 9 linhas (135, 135-b, 138) fora |
| C2 | Run duplicado | Caronte `PRD-013-fase2` ×2 (160 e 99 min: auto-start + start da skill, dois stops); newportaltefnet `PRD-114-b-fase2` ×3 (125 min + duas linhas de 0 min nos ciclos 4 e 8); meuanuncio `PRD-000-exec` (rótulo sem número) duplicando `PRD-088-exec` |
| C3 | Runs deixados abertos entram nas medianas | 7 linhas > 12 h (§8.4); o dashboard confia em `elapsed_active_s` (Caronte PRD-009-exec "ativa 22h12"); `topCaras` lista três delas |
| C4 | `permission-waits.jsonl` inválido | 16 de 83 linhas com quebra de linha crua em `detail` |
| C5 | Incidentes sem schema único | `harness-incidentes.jsonl`: 2 formatos; não entra no dashboard |
| C6 | Watchdog p90 mudo | 0 `watchdog-overruns.jsonl` em qualquer projeto; 16 `.start` órfãos; p90 lido de `harness-dashboard-*.json` de 22–31/08 |
| C7 | `harness`/`extra`/`projeto` só no `runs/` | o `harness-runs.jsonl` consolidado não tem os campos → sem corte por versão/dev no painel |
| C8 | `agent-stall.sh` não é portátil | `find -printf` (GNU) → no macOS devolve `vivos=0` em silêncio (Giovanny e o Charles usam Mac) |
| C9 | Sem telemetria por task | duração/turnos/status por task só em prosa no `estado-PRD-*.md` e no transcript |
| C10 | Telemetria só chega ao git por acaso | `runs/<dev>@<host>.jsonl` não é commitado por skill nem hook; Débora 0 linhas em 2 repos; bonifica sem `harness.env` versionado (`*.env` no `.gitignore`) → linhas sem `harness` |
| C11 | Delegação read-only tocando o tree | dashboard 29/08–04/09: codex-cli 8, openrouter 7, ollama 5 delegações read-only com `tree_tocado=SIM` (pendência desde 18/08) |

---

## 6. As 10 melhorias

Formato dos DTs da mestre: prova · proposta · arquivos · esforço. Ordem = impacto medido.

### M1 — Telemetria por task gravada no `SubagentStop` (substitui o watchdog por marcador) · controle
- **Prova:** C6 + C9 + §4 (6 agentes > 60 min, nenhum overrun; p90 de agosto).
- **Proposta:** hook `SubagentStop` (já existe para presença, 3.4.17) grava `prds/_metrics/harness-tasks.jsonl`
  com `papel, rotulo (TASK/PRD/ciclo), agent_id, dur_s (1º→último ts do transcript), turnos, bash, read,
  tokens_out, status (✅/⚠️/⛔/PARCIAL do sumário), packet_kb, worktree, projeto, maquina`. `watchdog-baseline.sh`
  passa a ler o p90 daqui (vivo, por projeto e por máquina), `guard-agent --post` deixa de usar `.start`. Dashboard
  ganha "tasks acima do envelope de 45 min" e "por que limitou". Mesma linha alimenta a previsão de minutos por
  task (`--check` emite `PREVISAO|min` por KB × alvos × specs) para fatiar ANTES da exec.
- **Arquivos:** `hooks/presence.mjs` (ou novo `hooks/task-telemetry.mjs`), `hooks/watchdog-baseline.sh`,
  `hooks/guard-agent.sh`, `hooks/harness-dashboard.mjs`, `settings.json` (SubagentStop).
- **Esforço:** M.

### M2 — Dashboard por dev/máquina, sem pontos cegos e sem lixo · controle
- **Prova:** C1, C2, C3, C4, C5, C7, C10 — e o fato de a comparação Charles × equipe (§8) ter exigido script à mão.
- **Proposta:** (a) normalizar `projeto` (strip `--wt-<x>`) e rotular a linha com `worktree`; (b) o `stop` grava
  `harness`, `maquina`, `modo` (leve/turbo/noturno), `limitou`, `review_modo` (dupla/solo/partes), `codex`,
  `stalls`, `tasks_estouradas` como campos; painel corta por versão e por dev/máquina (spawn, perm, negações,
  preset); (c) linha com `elapsed_s` > 12 h vira "suspeita" (fora de mediana/p90/top), e o `guard-stop` cobra o
  stop esquecido com o rótulo certo; (d) dedup por `label + ts_end ± 60 s`, `harness-metrics-auto.sh` não liga se
  já há marcador do mesmo rótulo, rótulo sem número (`PRD-000`) é recusado; (e) parser tolerante do
  `permission-waits.jsonl` + `denied.sh` escapa `detail`; (f) incidentes com schema único e seção no painel;
  (g) **cobertura por dev**: quem tem runs, último run, versão — Débora aparece como "silêncio há N dias";
  (h) o fechamento das skills faz `git add prds/_metrics/runs/<self>.jsonl` no commit escopado (caminho na
  allowlist) — telemetria "ativa por padrão" só vale se chega ao git.
- **Arquivos:** `hooks/harness-dashboard.mjs`, `hooks/harness-metrics.mjs/.sh`, `hooks/harness-metrics-auto.sh`,
  `hooks/guard-stop.sh`, `hooks/denied.sh`, skills (stop com flags novas + commit do runs).
- **Esforço:** M.

### M3 — Semáforo de frentes por máquina + fila, e o spawn como métrica de 1ª classe · controle + velocidade
- **Prova:** §3 — 136-b (main), 135-b e 138 (worktrees) simultâneas no PC: spawn 1.382 ms, `vivos_max=2`,
  858 min de parede para 27 tasks; `carga-maquina.sh` só reduz vivos DENTRO da sessão. §8.2: a mesma versão
  do harness faz spawn de 5 ms (Mac Giovanny), 20 ms (Mac Charles), 33 ms (PC Derick), 69 ms (PC João) e
  166–1.382 ms (PC Charles) — 5–40× — e é no PC do Charles que rodam as execs de 173–417 min.
- **Proposta:** lock por máquina (`~/.harness-run/frentes/<pid>.lock` com heartbeat); `/prd-exec --noturno` e
  `/dt-exec` entram numa fila FIFO (2ª exec autônoma espera a 1ª fechar a Fase 2); sessão interativa só recebe
  aviso. `carga-maquina.sh` grava `spawn_ms` e `frentes_concorrentes` no stop; o doctor compara o spawn da
  máquina com a mediana da equipe e acusa "máquina lenta" com a receita (sessões-zumbi, MSYS, exclusões de AV).
  É a fila noturna aprovada e adiada em 30/07 — agora com o custo medido.
- **Arquivos:** `hooks/carga-maquina.sh`, `hooks/harness-worktree.sh` (lock), `hooks/doctor-cached.sh`,
  `skills/prd-exec`, `scripts/noturno.sh`.
- **Esforço:** M.

### M4 — `guard-bash.mjs` NEGA leitura via Bash em subagente · velocidade
- **Prova:** §4 — 1.966 de 3.007 Bash (65%) eram `grep/sed -n/cat/ls/head/tail/wc/find` puros; a dica
  `additionalContext` da 3.4.12 está em 9 agentes e não mudou o comportamento. Custo real depende do spawn da
  máquina (§8.2): 1,5–2,5 h/2 dias no PC do Charles.
- **Proposta:** quando `transcript_path` contém `/subagents/` e o comando (após `cd …&&`) é leitura pura sem
  execução encadeada, `permissionDecision: deny` com contexto "use Read/Grep/Glob (offset/limit, output_mode
  count)". Exceções: `git`, `php -l`, `mysql`, `npx`, `node`, pipes com execução. Kill switch
  `HARNESS_GUARD_READ_VIA_BASH=off`. Métrica `bash_leitura_negada` no `harness-tasks.jsonl` (M1).
- **Arquivos:** `hooks/guard-bash.mjs` (+ `.sh` paridade), agentes (remover o bloco repetido — ver M10).
- **Esforço:** P.

### M5 — Teto de fôlego enforçado por hook (PreToolUse por transcript do agente) + barrar `general-purpose` · velocidade
- **Prova:** §4 — "~60 chamadas" (hefesto/dedalo) × p90 121–125, máx 253; 5 `general-purpose` na janela
  (sem contrato, sem packet, sem guard).
- **Proposta:** hook conta `tool_use` no transcript do agente e, a partir do teto por papel (hefesto/dedalo 90,
  sherlock 80, gates 60, hermes 120), nega tudo exceto `Write` do relatório com contexto "devolva
  PARCIAL-TEMPO agora"; complementa o `agent-stall` (silêncio) cobrindo a maratona ativa. `guard-agent` nega
  `general-purpose` em contexto de exec/criação quando existe papel do panteão para o prompt.
- **Arquivos:** novo `hooks/guard-folego.mjs` (PreToolUse `*`, só subagente), `hooks/guard-agent.sh`,
  `harness.env` (`HARNESS_FOLEGO_<papel>`).
- **Esforço:** P/M.

### M6 — MODO LEVE por padrão em fatia e PRD ≤ 8 tasks; gate c1 em Sonnet; hermes só quando compensa · velocidade (criação)
- **Prova:** §2 — único caso no alvo do Charles é o MODO LEVE (51 min); hermes E+C = 27–48 min nos demais;
  PRD-139 436 turnos de hermes e teto de 3 ciclos. §8.1 — a equipe, em preset econômico (gate c1 Sonnet, 1–2
  ciclos, tasks 131–195 linhas), fecha a fase 2 em 28–63 min para 6–12 tasks. Contraponto: no econômico as
  correções pós-teto saem "sem re-verificação" (Giovanny G112a, João 116) — o preço de 1 ciclo.
- **Proposta:** Passo 1.5 vira default (não pergunta) para `-b/-c` e planos ≤ 8 tasks — a pai escreve as tasks
  (como na 3.4.8) e o Modo C é patch da pai; hermes só ≥ 9 tasks ou técnica > 800 linhas. Ciclo 1 dos gates
  em Sonnet também no equilibrado (Opus só quando o c1 reabre desenho). Teto de 120 turnos do hermes vira deny
  (M5). Registrar `modo` no stop (M2) para comparar as duas trilhas em 2 semanas.
- **Arquivos:** `skills/prd/SKILL.md` (Passo 1.5/8/10.2), `agents/hermes.md`, presets no Perfil.
- **Esforço:** P.

### M7 — Codex por dev, declarado por dia; SOLO oficial em dois sherlocks · velocidade + qualidade
- **Prova:** §0.6 — 5/5 preflights `erro` no Charles (limite até 07/09), breaker TTL 30 min → cada run repete ping
  e fallback; Derick com dupla real em 6/7; João 6/6 solo (até 09/09); Giovanny bloqueado pelo classificador e
  por timeout de 600 s; compensação ad hoc "4 sherlocks" só na 135-b; codex-cli 14/40 falhas na equipe.
- **Proposta:** `preflight-codex-cli.status` ganha `ate=<data>` quando a mensagem é usage limit; doctor no
  SessionStart lê e as skills nascem em SOLO sem tentar. SOLO oficial = **2 sherlocks em paralelo com lentes
  disjuntas** (correção+segurança × contrato+regressão+invariantes) sobre o mesmo packet — dupla-cega interna
  barata; `review_modo=solo-2` na telemetria. Painel por dev mostra a taxa de dupla-cega real.
- **Arquivos:** `hooks/harness-delegate.sh` (breaker persistente), `hooks/doctor-cached.sh`, `skills/prd-exec`
  (Fase 2), `agents/sherlock.md` (lente A/B por prompt).
- **Esforço:** P/M.

### M8 — Duelo só quando há chance real de aplicar; pool obedece ao placar; custo do loop `--tools` · eficiência/custo
- **Prova:** 24 eventos desde 01/09: 4 aplicados (3 com remendo manual), 5 W.O., 3 nenhum; PRD-138 TASK-001:
  US$ 0,17 e 3 min por 0 diffs aplicáveis; qwen 1.743.213 tokens de entrada para packet de 103.560 bytes
  (deepseek: 149.939) — o loop de ferramentas reenvia o contexto a cada turno e o provedor cobra tudo. Painel
  29/08–04/09: `qwen3-coder-next` 0/5 vitórias, 5/5 inaplicáveis; `qwen3.7-flash` 4/9 inaplicáveis — a régua
  "candidato a sair do pool" disparou e o pool não mudou.
- **Proposta:** (a) `git apply --check` do diff A em worktree temporário ANTES de pagar o worker B e o juiz;
  (b) `--tools` com teto de 4 turnos e prompt caching quando o provedor tiver, senão tools off; (c) `Duelo: sim`
  só passa no `--check` com ≤ 2 alvos de produção e sem arquivo novo; (d) roteamento pelo placar **remove** o
  modelo que cruza a régua (hoje só rebaixa) e o painel mostra custo por diff aplicado, por modelo.
- **Arquivos:** `hooks/harness-duelo.sh`, `hooks/harness-delegate.sh`, `hooks/task-packet.sh --check`.
- **Esforço:** M.

### M9 — Permissão por máquina: allowlist versionada aplicada, `AskUserQuestion` pré-autorizada, zero em noturno · velocidade
- **Prova:** §8.1 — João 76 prompts em 11 runs (8 por run; 16 numa exec), Giovanny 52 negações do classificador
  em 33 runs, Charles 27 prompts "permission to use AskUserQuestion" em 2 dias e 59 min de espera na exec
  "noturno autônomo" da 138; `permissions.allow` do Mariana vazio (auto-edição barrada pelo classificador).
- **Proposta:** (a) allowlist do Perfil ("Execução autônoma") aplicada pelo `harness-sync`/doctor no
  `settings.json` versionado (o dev não edita nada) e `AskUserQuestion` dentro dela — a pergunta já é a parada;
  (b) hook `PreToolUse AskUserQuestion` nega em `--noturno`/TURBO e devolve "decida pelo default do Passo 0.3 e
  registre em Decisões pendentes"; (c) `perguntas`, `permission_prompts` e `classifier_denials` por dev no painel
  (M2) — negação recorrente do mesmo comando vira item de allowlist automaticamente.
- **Arquivos:** `settings.json` (allow), `harness-sync.sh`/`doctor`, novo `hooks/guard-question.sh`,
  `skills/prd`/`prd-exec` (0.3 declara defaults).
- **Esforço:** P.

### M10 — Agentes: contrato mecânico único injetado pelo packet; persona no `.md`; sem browser pane em dedalo/ariadne · eficiência
- **Prova:** 12 agentes técnicos / 1.786 linhas com o mesmo bloco repetido 9× ("Ferramenta certa para LER"),
  3× "classificador indisponível", 2× "teto de fôlego" com números diferentes (60 × 80/120 × p90 real
  121–125), 2× "lint do projeto", 3× "dois níveis", 3× "invariantes"; beholder ainda manda "ler TODOS os
  documentos + 3 templates" e hefesto "Perfil primeiro" enquanto o guard exige packet ("não leia Perfil/PRD
  inteiros") — o agente lê em dobro. `dedalo` e `ariadne` ainda carregam `mcp__Claude_Browser__*`/
  `mcp__Claude_Preview__*` (a armadilha que travou 2 michelangelos por 10 min; 3.4.20 tirou só dele).
- **Proposta:** `.claude/contratos/CONTRATO-<papel>.md` (regras mecânicas versionadas em 1 lugar: leitura,
  fôlego, temporários, classificador, dois níveis, Edit-first, lint, invariantes) anexado pelo
  `task-packet.sh`/`prd-packet.sh`/`review-packet.sh`; o `.md` do agente fica com persona + lentes + formato
  (−40% de linhas, sem deriva). Remover as ferramentas de pane de dedalo/ariadne (Playwright CLI já é o
  canônico). Alinhar beholder/hefesto/michelangelo ao regime de packet.
- **Arquivos:** `agents/*.md`, `hooks/task-packet.sh`, `hooks/prd-packet.sh`, `hooks/review-packet.sh`,
  `harness-sync.sh` (CORE_AGENTS + pasta `contratos/`).
- **Esforço:** M.

### Manutenção (fora dos 10, baratos)
- `agent-stall.sh`: trocar `find -printf` por `stat` em loop (macOS).
- `guard-agent.sh`: sufixo de fatia (`-b`) no rótulo do packet (incidente registrado na 136-b).
- Limpar os 16 `.start` órfãos ao ligar M1.
- `hermes` > 120 turnos: deixa de avisar e passa a negar (coberto por M5).
- `modulo_agente`: renomear `tests/e2e/com9/` (nome reservado no Windows — o repo não atualiza em nenhum PC).
- `bonifica-pedidos`: tirar `harness.env` do `*.env` do `.gitignore` (linhas de telemetria sem versão).
- C11: delegação read-only com `tree_tocado=SIM` (peter-quill/atlas via codex-cli) — investigar antes de confiar no "read-only".
- `integracao-tefnet-fiserv`: `PRD-002-exec` aberta há 15 dias (103 subagentes, 32 prompts) — fechar/descartar a linha.

---

## 7. Régua de validação (próximas 2 semanas)

| Métrica | Hoje | Alvo |
|---|---|---|
| Fase 2 da `/prd` (ativa, mediana) — Charles / equipe | ~90 / 40–48 min | ≤ 60 (LEVE ≤ 45) / manter |
| Exec dentro do SLO 2 h — Charles / equipe | 0/6 / 7 de 9 (Derick+João) | ≥ 50% no Mariana; 100% no Caronte e na equipe |
| Bash de leitura em subagente | 65% | < 15% |
| Turnos p90 hefesto/dedalo | 121–125 | ≤ 90 (com PARCIAL honesto) |
| Overruns registrados × agentes > 60 min | 0 × 6 | 1:1 |
| Runs de worktree no painel · runs "suspeitos" fora das medianas | 0 · 0 | todos · todos |
| Devs com telemetria versionada | 4 de 5 (Débora 0) | 5 de 5, sem ação do dev |
| Prompts de permissão por run — João / Charles | 8 / 1 | ≤ 1 / 0 em noturno |
| Esperas humanas em noturno | 59 min | 0 |
| Spawn no PC do Charles vs mediana da equipe | 166–1.382 ms vs 33 ms | ≤ 2× a equipe |
| Custo de duelo por diff aplicado | US$ 0,17 / 0 | < US$ 0,05 / 1 |

---

## 8. Equipe — o que chegou pelo git em 04/09 (harness ≥ 3.4.10 ou desde 29/08)

### 8.1 Por desenvolvedor/máquina (medianas ativas; linhas > 12 h fora)

| Dev · máquina | runs | versões | f1 | f2 | exec (n) | tasks/exec | par. exec | linhas/task | prompts perm. (tot · por run) | negações classif. | preset | spawn | Codex (dupla / solo) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Charles · CharlesPC | 64 | 3.4.2→3.4.20 | 41 | **108** | **240** (19) | 10 | 1,42 | 215 | 36 · 1 | 27 | equilibrado 100% | 166–1.382 ms | 2 / 10 |
| Charles · MacBook Air (univip) | 8 | 3.4.8/3.4.10 | — | — | 106; 696/707 (suspeitas) | 10 | 1,04 | — | 10 · 2 | 14 | equilibrado | 20 ms (Caronte) | 0 / 3 |
| Giovanny · MacBook Pro | 33 | 3.4.5→3.4.19 | 16 | 70 | 121 (11): 68–196 | 9 | 1,60 | 183 | 51 · 3 | **52** | econômico 27 | **5 ms** | 3 / 4 |
| Derick · DESKTOP-IVFLCV0 | 27 | 3.3.0→3.4.20 | 13 | **48** | **72** (9): 53–109 | 10 | 1,23 | 187 | 18 · 1 | 2 | econômico 20 | 33 ms | **6 / 1** |
| João Neto · DESKTOP-7HQ8L9B | 11 | 3.4.10/3.4.19 | 14 | **40** | **69** (3): 58–98 | 9 | 1,36 | 165 | **76 · 8** | 4 | econômico | 69 ms | 0 / 6 |
| Débora · (ric-tur back/front) | **0** | 3.4.20 | — | — | — | — | — | — | — | — | — | — | PRDs 031–039 com REVIEW-beholder/michelangelo/sherlock, zero telemetria versionada |
| Marcos · ANB-MKT-NB-01 (fiserv) | 1 | 3.4.20 | — | — | PRD-002-exec aberta 15 dias | 7 | — | 224 | 32 | 5 | — | — | — |

Leitura: com a **mesma** versão do harness e o mesmo número de tasks, Derick e João fecham a criação em 28–63 min
e a exec em 53–98; o Charles leva 86–201 e 173–417. Três diferenças medidas explicam a maior parte: preset
(econômico = gate c1 Sonnet e 1–2 ciclos; o Charles roda equilibrado/máximo com Opus no c1 e 2–3 ciclos), spawn da
máquina (33–69 ms × 166–1.382 ms, com 2–3 frentes simultâneas só no PC do Charles) e tamanho de task (165–195 ×
199–267 linhas, packets de 62–134 KB no Mariana). O quarto fator é o produto: o Mariana é o maior legado da casa.

### 8.2 Spawn por máquina (campo `spawn=` do `extra`, 3.4.12+)

| Máquina | spawn | contexto |
|---|---|---|
| MacBook Pro (Giovanny) | 5 ms | newportaltefnet PRD-114-exec |
| MacBook Air (Charles) | 20 ms | Caronte PRD-012-b-exec |
| DESKTOP-IVFLCV0 (Derick) | 33 ms | meuanuncio PRD-089-exec |
| DESKTOP-7HQ8L9B (João) | 69 ms | newportaltefnet PRD-116-exec |
| CharlesPC, 1 frente | 166 ms | Mariana PRD-137-exec |
| CharlesPC, 3 frentes | 1.382 ms | Mariana PRD-136-b-exec (`limitou=teto`) |

### 8.3 Fase 2 e exec da equipe na 3.4.18–3.4.20 (ativa, min)

| Dev | PRD | f2 | exec | tasks | review |
|---|---|---|---|---|---|
| Derick | meuanuncio PRD-088 (3.4.18) | 31 | 64 | 12 | dupla-cega real (codex low + sherlock), 2 ciclos |
| Derick | meuanuncio PRD-089 | 51 | 76 (parede 131, 54 min humano) | 9 | dupla-cega real |
| Derick | meuanuncio PRD-090 | 31 (par 3,20) | 74 | 6 | — |
| Derick | sistema-vs PRD-011 | 63 (hermes 20/11, 355 turnos) | 60 (par 2,51) | 10 | codex-cli + review antecipado do backend |
| Derick | sistema-vs PRD-012 (LEVE) | 28 | 72 | 7 | 2 ciclos |
| João | newportaltefnet PRD-116 (3.4.19, LEVE) | 30 | 58 (parede 87; 10 prompts) | 9 | SOLO (limite até 09/09) |
| Giovanny | newportaltefnet PRD-114-b (3.4.19) | 125 + **8 ciclos** | 121 | 10 | SOLO (Codex barrado pelo classificador) |
| Giovanny | newportaltefnet PRD-114-c (3.4.19) | 195 (hermes E 36 min/203 turnos; gates 143) | 143 (parede 196; 52 min humano) | 9 | SOLO (timeout 600 s) |

### 8.4 Linhas "suspeitas" (> 12 h) que hoje entram no painel

| Dev | Run | elapsed | o que é |
|---|---|---|---|
| Charles | caronte PRD-009-exec | 20.634 min (14 dias) | stop esquecido; "ativa 22h12" |
| Charles | dra-mariana-duarte PRD-134-exec | 9.565 min | idem (parede real 323 min, análise de 01/09) |
| Marcos | integracao-tefnet-fiserv PRD-002-exec | 21.901 min | 103 subagentes, 32 prompts, 20.040 min "humano" |
| Giovanny | newportaltefnet MOCKUP-cancelamento-faturamento | 18.342 min | mockup de 17/08 fechado em 30/08 |
| Giovanny | newportaltefnet PRD-112-exec | 2.555 min | exec de 31/08 fechada em 02/09; há outra linha de 196 min |
| Derick | sistema-vs PRD-008-exec | 2.225 min | 3.3.0 |
| Charles | dra-mariana-duarte PRD-132-fase1 | 3.526 min | 3.491 min de espera humana |

---

## 9. Por que a máquina do Charles é a mais lenta (medido 04/09, 22:50, PC reiniciado às 09:50)

**Não é CPU, RAM nem modelo.** Ryzen 5 9600X (6c/12t) a 52% de carga, 7,4 GB livres de 31, plano "Alto
desempenho"; latência por turno dos modelos estável desde julho (análise de 01/09). **É criação de processo.**

| Medição (nesta máquina, agora) | ms por processo |
|---|---|
| Windows puro (`cmd /c exit` via PowerShell) | 21 |
| fork do MSYS (subshell do Git Bash) | 29 |
| `bash -c true` (o que cada hook e cada Bash de agente paga) | 74–87 |
| `node -e 0` (cada hook `.mjs`) | 82–124 |
| `bash -c true` com 3 filas paralelas | 159 |
| `bash -c true` com 6 filas paralelas | 259 |
| `bash -c true` com 10 filas paralelas | 466 |
| **teto de vazão da máquina, qualquer paralelismo** | **~20 processos/s** |

Leitura:
1. **A criação de processo é serializada nesta máquina.** Dez filas em paralelo não criam mais processos por
   segundo do que três (18–23 proc/s) — cada fila só fica mais lenta. Causas que se somam: o `fork()` emulado do
   MSYS (Git Bash), a **Integridade de Memória (HVCI) ligada** (VBS rodando, `SecurityServicesRunning=2`) e o
   Defender em tempo real sem exclusões visíveis para `bash.exe`/`node.exe`/`C:\laragon\www` (exclusões só
   aparecem como admin). Nos Macs da equipe o fork é nativo (5–20 ms) e escala com os núcleos.
2. **O harness paga esse preço em dobro.** Cada chamada Bash de um agente cria o `bash` da ferramenta + o comando
   + **3 hooks** (`guard-bash.mjs` pre, `guard-bash.mjs --post`, `presence.mjs --prompt`), cada hook com seu
   shell + Node: ~8 processos por chamada, ≥ 550 ms em máquina ociosa, 4–5 s sob 3 frentes. E 65% das chamadas
   dos agentes são Bash de leitura (§4). O `presence.mjs` nasce a cada Bash/Edit/Write só para descobrir que
   ainda está dentro do throttle de 5 min.
3. **Frentes multiplicam.** 1 frente com 4 executores + gates ≈ 6–8 filas; 3 frentes ≈ 20 filas — o teto de
   20 proc/s vira 1–2 s por processo (`spawn=1382ms` na 136-b; "Bash de agente 40–88 s" medido em 02/09).
   Derick e João rodam 1 frente por vez; o Charles rodou 3 execs simultâneas na madrugada de 04/09.
4. **Acúmulo entre reinícios.** Antes do reboot de hoje o spawn estava em 166 ms (1 frente) e 1.382 ms (3 frentes);
   depois, em repouso, 29–37 ms — o mesmo dos 33 ms do Derick. Hoje há 6 sessões `claude-code` vivas (3 desde a
   manhã, com 289–437 s de CPU) e 371 processos; em 25/08 eram 35 `claude.exe`, 2 com 27 h de CPU.
5. **Preset e tamanho de task são a segunda camada** — explicam a fase 2, não a exec: Opus no ciclo 1 + 2–3 ciclos
   (equilibrado/máximo) contra 1 ciclo Sonnet (econômico); tasks de 199–267 linhas contra 165–195; o Mariana tem
   os maiores arquivos e packets (62–134 KB).

Ordem de alavanca: (a) menos processos por chamada (hooks fundidos/daemon + negar leitura via Bash), (b) exclusões
do Defender e teste com HVCI desligado (decisão de segurança do Charles), (c) 1 frente pesada por máquina Windows
e noturno no Mac/homolog, (d) preset com gate c1 em Sonnet, (e) sessões ociosas fechadas.

## 10. Lista consolidada — 20 melhorias (substitui a §6 como pauta)

| # | Melhoria | Eixo | Prova-chave | Esf. |
|---|---|---|---|---|
| 1 | `guard-bash.mjs` NEGA leitura via Bash em subagente (Read/Grep/Glob no lugar) | máquina/velocidade | 1.966 de 3.007 Bash eram leitura; 74–466 ms por processo | P |
| 2 | Hooks fundidos: `guard-bash --post` + `presence` num só Node; throttle da presença dentro dele | máquina | 3 → 1 hook por chamada; presence nasce a cada Bash/Edit/Write | P |
| 3 | Daemon de hooks por sessão (Node persistente; `.sh` restantes migram) | máquina | node 82–124 ms + bash 74–87 ms por hook | M |
| 4 | Exclusões do Defender (Git, node, laragon/www, ~/.claude) + teste de 1 dia com HVCI off; doctor mede spawn antes/depois | máquina | HVCI ligado; Windows puro 21 ms; teto 20 proc/s | P (admin, decisão do Charles) |
| 5 | Semáforo de frentes por máquina + fila; 1 frente pesada em Windows; noturno no Mac/homolog | máquina/controle | 3 execs simultâneas = 858 min; spawn 1.382 ms | M |
| 6 | Doctor lista sessões `claude-code` ociosas (> 2 h sem prompt) e oferece fechar; Desktop = arquivar abas | máquina | 6 sessões vivas, 3 desde a manhã; 35 claude.exe em 25/08 | P |
| 7 | Teto de fôlego por hook (PreToolUse no transcript do agente) + barrar `general-purpose` | velocidade exec | p90 121–125 turnos, máx 253; 5 general-purpose | P/M |
| 8 | Telemetria por task no `SubagentStop` (substitui `.start`); previsão de minutos por task no `--check` | controle/velocidade | 0 overruns × 6 agentes > 60 min; 16 `.start` órfãos | M |
| 9 | Packet por função para TODO alvo > 40 KB e fatiar por previsão > 45 min (não só por linhas) | velocidade exec | 135-b: 4 de 8 tasks 66–141 min com 215 linhas/task | P |
| 10 | SOLO oficial = 2 sherlocks com lentes disjuntas; Codex por dev com validade declarada (sem ping a cada run) | qualidade/velocidade | 5/5 preflights erro; Derick 6/7 dupla, Charles 2/12 | P/M |
| 11 | Duelo só com chance de aplicar (`git apply --check` antes de pagar B/juiz); pool remove quem cruza a régua; `--tools` teto 4 turnos | custo | US$ 0,17 por 0 diffs; qwen3-coder-next 0/5; 1,74 M tokens de entrada | M |
| 12 | MODO LEVE default para fatia e ≤ 8 tasks; hermes só ≥ 9 tasks | velocidade criação | LEVE 51 min × 85–123; hermes 27–48 min | P |
| 13 | Preset do Charles: gate c1 em Sonnet, Opus só quando o c1 reabre desenho | velocidade criação | equipe 28–63 min no econômico × 86–201 | P |
| 14 | Hermes: teto 120 vira deny; Modo C sempre por documento em paralelo | velocidade criação | PRD-139: 436 turnos, 3 ciclos | P |
| 15 | Dashboard por dev/máquina: worktrees, versão, campos estruturados (`modo`, `limitou`, `review_modo`, `spawn_ms`, `frentes`), dedup, runs > 12 h fora | controle | 3 execs invisíveis; 7 runs de dias; 3 duplicatas | M |
| 16 | Telemetria chega ao git sozinha: fechamento commita `runs/<self>.jsonl` | controle | Débora 0 linhas em 2 repos com PRDs 031–039 | P |
| 17 | Cobertura e frescor por dev/repo no painel (versão, último run, silêncio há N dias) | controle | bonifica sem `harness.env` versionado; sistema-vs só na `developer` | P |
| 18 | Permissão por máquina: allowlist do Perfil aplicada pelo sync; `AskUserQuestion` pré-autorizada; zero perguntas em noturno; negação recorrente vira allowlist | velocidade | João 8 prompts/run; Giovanny 52 negações; 59 min humano em noturno | P |
| 19 | Contrato mecânico único via packet; persona no `.md`; sem browser pane em dedalo/ariadne; beholder/hefesto alinhados ao packet | eficiência | bloco repetido 9×; tetos divergentes; leitura em dobro | M |
| 20 | Manutenção em lote: `agent-stall` no macOS, sufixo `-b` no guard, `.start` órfãos, `com9` no modulo_agente, `harness.env` do bonifica, delegação read-only tocando tree, run da fiserv aberta há 15 dias, `permission-waits` JSON | controle | §5 e §1.1 | P |
