---
tipo: monitoramento
data: 2026-09-15
harness: 3.5.4 (Mariana core + 4 worktrees)
status: concluído (4 criações completas entre 15:11 e 15:34, todas paradas aguardando aceite; C1–C10 para a 3.5.5)
tags: [harness, telemetria, monitor, 3.5.4, prd-criacao]
---

# Monitor das 4 sessões da tarde — 15/09/2026 (4 criações `/prd` em paralelo na 3.5.4)

> [!info] Contexto
> Terceira rodada vigiada (A1–A17 na tarde de 14/09, B1–B21 na noite). Desta vez são **4 criações** (`/prd`), não execs:
> o main "Tarefas pendentes pós-merge" abriu as 4 worktrees e registrou os locks às 14:11–14:12; Charles abriu as 4 abas
> às 14:37:35 → 14:39:05 (~30 s entre elas, sem esperar o minuto sugerido pelo B1). Mesma vigia (`monitor-execs.js`,
> scratchpad desta sessão), agora acordando também em pergunta ao humano, `Skill` emendada (criação→exec) e `ESFORCO|AJUSTAR`.
> **O que esta rodada tem de mostrar:** reserva atômica de número com duas `/prd` simultâneas (DT-002); auto-start da
> criação (`_auto-prd-fase1` adotado pelo `start`); esforço da fase pensar (`high`) lido de verdade; B1 (hooks cancelados
> por timeout) com a máquina recém-reiniciada; rito LEVE × COMPLETO decidido pela skill; e o que acontece se Charles
> aprovar e emendar a exec na mesma sessão (B3).

## Painel (14:48)

| # | Checkout | Skill · rótulo | Sessão · modelo · esforço | Início | Estado na decolagem |
|---|---|---|---|---|---|
| 1 | `dra-mariana-duarte--wt-prd-137c` | `/prd PRD-137-c` (IA aprende com edições) | `91d65cfc` · opus-5 · **xhigh** (alvo high) | 14:37:35 | `_auto-prd-fase1.json` 14:37:36; `esforco.env atual=n/d`; snapshot de prod falhou (DT-518); **4 perguntas ao Charles às 14:41** |
| 2 | `dra-mariana-duarte--wt-prd-141b` | `/prd PRD-141-b` (Jodit no prontuário) | `7de962c2` · opus-5 · **xhigh** | 14:38:07 | **`PRD-141-b-exec.json` 14:38:08 (auto-start errado)** + `PRD-141-b-fase1.json` 14:38:27; **sem `esforco.env`**; MODO LEVE por conta própria, 3 agentes nativos |
| 3 | `dra-mariana-duarte--wt-ideia-048` | `/prd --ideia 048` → **PRD-144** | `dbfb483f` · opus-5 · **xhigh** | 14:38:36 | `PRD-144-fase1.json` (auto adotado); `esforco.env atual=n/d`; ROTA ok, 4 delegações ao Codex |
| 4 | `dra-mariana-duarte--wt-ideia-046` | `/prd --ideia 046` → **PRD-145** | `c2f9d4c5` · opus-5 · **xhigh** | 14:39:05 | `PRD-145-fase1.json` (auto adotado); `esforco.env atual=n/d`; ROTA ok, 4 delegações ao Codex + tony-stark nativo |

Máquina às 14:41: 22 `claude.exe` (15 do app + 7 CLI: as 4 sessões, 2 do main/vault, o monitor) = 4,5 GB; `node` 9, `bash` 16,
`codex` 4 (432 MB); RAM livre 15,6 GB de 31,9; CPU 19 %; sonda de spawn do daemon **45–57 ms** (ontem à noite 1.330 ms).
Daemon `2bff605a2fc0` (3.5.4, pid 22984) carregou os módulos das 4 worktrees < 1 s depois de cada abertura. `FRENTES|status|0/4`
(criação não ocupa frente). `~/.harness.env.local` segue com `HARNESS_FRENTES_MAX=4`.

## Achados (rodada da tarde de 15/09)

### C1 · As 4 criações rodam em `xhigh` com alvo `high` — e o harness não enxerga: `atual=n/d` em 3, e a 141-b nem rodou o `esforco.sh`
- **Prova:** linha de comando dos 4 processos (pids 24492/22348/22464/19104): `--thinking adaptive --effort xhigh --model claude-opus-5`.
  `ESFORCO|pensar|alvo=high|atual=n/d|n/d|preset=equilibrado|origem=preset` na 046 (14:39:38) e na 137-c (14:39:09); `esforco.env`
  das três com `atual=n/d`. Na 141-b não existe `esforco.env` (a sessão decidiu MODO LEVE e pulou o Passo 0 — ver C5).
  Nenhuma das 4 chamou `mcp__ccd_session_mgmt__get_session` (contagem de ferramentas nos 4 transcripts: zero `mcp__`).
- **Causa:** a skill diz "leia o esforço REAL com `get_session self` **quando a ferramenta existir**" — a ferramenta existe no Desktop,
  mas o passo é opcional na prática e `n/d` = "siga". O default do Desktop do Charles é `xhigh` (as duas sessões do main de 12:46
  também são `xhigh`), então **toda criação nasce em drift** e o `AJUSTAR` nunca dispara. É o B3 de ontem, agora 4 de 4.
- **Efeito:** a orquestradora de criação (Opus) paga `xhigh` por turno em 4 sessões ao mesmo tempo; a telemetria da fase 1 vai gravar
  `high/n/d` (mede a intenção, não o fato).
- **Proposta (3.5.5):** (a) o `esforco.sh` descobre `atual` sozinho: o `sessoes.mjs` do daemon JÁ lê a `CommandLine` de todo processo
  (`Get-CimInstance Win32_Process … CommandLine`, campo `cmd` no objeto, `sessoes.mjs:53-58`) — basta extrair `--effort`/`--model` do
  `claude.exe` da sessão e responder numa rota `/h/esforco` (ou gravar em `sessoes.json`); zero passo na skill, `n/d` some. No CLI puro
  o script já aceita `CLAUDE_CODE_EFFORT_LEVEL`;
  (b) `AJUSTAR` em sessão interativa pergunta uma vez (`/effort high`), como o B3 já pedia; (c) se Charles QUER `xhigh` nas criações,
  o lugar é o Perfil (`Esforço — fase pensar: xhigh`) para a telemetria ler `xhigh/xhigh` em vez de drift.

### C2 · Auto-start ligou `PRD-141-b-exec` numa sessão de CRIAÇÃO — o prompt em texto livre citava "/prd-exec" no contexto
- **Prova:** `wt-prd-141b/.claude/.harness-run/metrics-auto.log` = `2026-09-15T14:38:08-03:00|ligado|PRD-141-b-exec`; prompt do Charles:
  "TAREFA: criar a PRD com `/prd PRD-141-b`. Só criar; **a execução com /prd-exec fica para quando eu aprovar**. CONTEXTO - A mãe
  PRD-141 foi concluída…". A skill foi invocada pela ferramenta `Skill` (assistente), não por slash command do usuário → o prompt não
  tem `<command-name>` nem "Base directory for this skill" e o cabeçalho-primeiro da 3.5.4 (`harness-metrics-auto.sh:39`) não casa;
  cai no casamento solto (`:41-43`), que testa `prd-exec` ANTES de `prd`; o número vem da forma frouxa (`:57`, `prd-exec[^0-9]{0,60}[0-9]+`
  → "141" de "A mãe PRD-141") e o sufixo `-b` de `PRD-141-b`. Depois a skill rodou `start PRD-141-b-fase1` (14:38:27) → dois marcadores
  (padrão B2). Nas outras 3 o prompt não citava "/prd-exec" e o auto-start acertou (`_auto-prd-fase1`).
- **Efeito:** quando Charles aprovar e rodar a exec, a regra REUSA (3.4.23) mantém o `start` de 14:38:08 → a run da exec ganha a
  criação inteira + a espera. **Intervenção tentada às 14:47:** afastar o marcador (`mv` para `monitor-15set/`) — **barrada pelo
  classificador do auto mode** ("Interfere With Workloads"). Fica para o Charles: `rm .claude/.harness-run/PRD-141-b-exec.json`
  na `wt-prd-141b` ANTES da exec (ou o `start` da exec sobrescrever).
- **Efeito colateral já visto (15:41):** com a criação encerrada e o marcador `-exec` ainda vivo, o vigia disparou "sessão parada há
  30 min com cronômetro ligado (PRD-141-b-exec.json)" — alarme falso; qualquer painel que leia marcadores vai mostrar uma exec da 141-b
  "em andamento" até a regra de 24 h (`HARNESS_METRICS_STALE_H`) descartá-lo amanhã.
- **Proposta:** (a) no casamento solto, vence o PRIMEIRO slash command que aparece no prompt (posição), não uma prioridade fixa
  `prd-exec > dt-exec > prd`; (b) hook `PreToolUse` com matcher `Skill`: `tool_input.skill` + `args` é a forma inequívoca no Desktop
  e deve ter precedência sobre a regex do prompt; (c) `start X-fase1` apaga um `X-exec` do auto-start mais novo que a sessão.

### C3 · B1 NÃO reproduziu com a máquina folgada — zero hook cancelado em 4/4, mesmo com as 4 abrindo em 90 s
- **Prova:** grep de `hook_cancelled`/`timedOut` nos 4 transcripts = 0. Durações: `harness-metrics-auto.sh` 567–754 ms,
  `doctor-cached.sh` 771–1.115 ms, `guard-stop.sh` 588–745 ms; sonda de spawn 45–57 ms (`~/.harness-run/spawn-history.jsonl`).
  `metrics-auto.log` com `ligado` nas 4.
- **Leitura:** B1 é função da CARGA (ontem: 4 execs + 16 subagentes vivos, spawn 1,3 s), não da rajada de abertura em si.
  A regra "esperar 1 min entre abas" só vale com execs rodando; a proposta do auto-start no daemon continua valendo para a noite.

### C4 · 137-c: snapshot de produção falhou (DT-518) e a sessão improvisou; depois parou em 4 perguntas ao Charles (1 delas é rito)
- **Prova:** 14:38:17 `tools/prod-snapshot.sh` → `ERROR 3105 … generated column 'nome_ativo_chave' in table 'financeiras'` (defeito 1 do
  DT-518, que o próprio script diz tratar em `:143-144`); 14:39:47 a sessão montou um `parcial.sql` de 10,9 MB no scratchpad e bateu em
  `Unknown column 'criado_em'`; 14:41:07 `AskUserQuestion` com 4 perguntas: Premissa 2 (PRD-111 já põe toda edição no pool),
  quem cura, corpus 12 dias × 30 do stub, e **"Condução e políticas — TURBO/CLÁSSICO"**. `permission-waits.jsonl` 14:41:14
  (`Claude needs your permission to use AskUserQuestion`).
- **Leitura:** as 3 primeiras são legítimas (o discovery contradisse o stub — é para isso que a Entrevista Única existe); a 4ª é a
  pergunta padrão do Passo 0.1 que o prompt ("decisões congeladas: não re-entrevistar") já respondia. A 048, no mesmo tipo de
  prompt, não perguntou nada. Enquanto Charles não responde, a frente 1 está parada (desde 14:41).
- **Proposta:** com "não re-entrevistar"/stub congelado, a skill assume as políticas pelo default (TURBO, DTs diretos, inovação 🟢)
  e só pergunta o que o discovery CONTRADISSE; e o `prod-snapshot.sh` não pode deixar a sessão improvisar restore parcial — se o
  DT-518 já está tratado, falhou o tratamento (conferir `RESTORE_ERR`).

### C5 · 141-b: MODO LEVE por conta própria → pulou o `esforco.sh` (Passo 0) e a ROTA (`harness-delegate.sh`) e despachou `general-purpose` para discovery
- **Prova:** thinking 14:39:03: "como é modo leve sem banco, vou despachar em paralelo os DTs relacionados, o tony-stark … e um
  scout"; ferramentas: `Agent` ×3 (`general-purpose` model=sonnet "Discovery: DTs relacionados", `tony-stark`, `peter-quill` scout);
  zero `harness-delegate.sh`, zero `esforco.sh`, nenhuma linha `ROTA|` no transcript. Nas outras 3 a ROTA rodou
  (`discovery-dts|codex-cli`, `discovery-schema|codex-cli`, `discovery-codigo|codex-cli`, `impacto|codex-cli` — `modo=apoio` +
  `Perfil(papel)`) e a 046 mandou 4 delegações ao Codex.
- **Efeito:** o modo `apoio` (aliviar a conta Claude com o Codex no mecânico) não vale no MODO LEVE; `general-purpose` é papel fora
  do catálogo (sem `effort` no frontmatter, sem contrato de saída, telemetria de papel = `?`); e sem `esforco.env` a sessão só vai
  ouvir falar de esforço se emendar a exec (guard de esforço).
- **Proposta:** Passo 0 (esforço) incondicional, antes do Passo 1.5; no MODO LEVE a frota reduzida ainda passa pela ROTA
  (discovery-dts é exatamente o mecânico que o `apoio` cobre); `guard-agent` AVISA (não nega) `subagent_type` fora do catálogo
  durante uma skill do harness.

### C6 · Ruído: `DOCTOR|lock-preso|DT-592|dono dra-mariana-duarte, 25h` nas 4 aberturas
- **Prova:** `doctor.cache` das 4 worktrees. É o lock órfão do `/dt-exec` DT-592 de ontem (A17: stop sem telemetria), que o
  fechamento do LOTE-045 não liberou — já apontado como lixo na manhã.
- **Proposta:** `harness-metrics.sh stop` e `harness-worktree.sh fechar` liberam os locks do rótulo; o doctor sugerir `--limpar` está
  certo, mas 4 avisos iguais por rodada é custo de atenção.

### C7 · Telemetria da fase 1 é cega às delegações ao Codex — PRD-145 gravou `paralelismo 0.05` e `subagent_busy_min=0` com 4 delegações de 105–176 s rodando em paralelo
- **Prova:** run `PRD-145-fase1` (14:51): `subagents=5`, `subagent_measured=1`, `subagent_busy_min=0`, `tokens_output_subagents=3139`
  (só o tony-stark nativo), `parallel_factor=0.05`, `codex=""`. Os 4 relatórios em `delegations/PRD-145/*-c1.md` têm `Inicio`/`Duracao`
  (dts 105 s, schema 154 s, código 173 s, impacto 176 s — todos entre 14:41:12 e 14:44:14). Na 141-b, com 3 nativos, o fator saiu
  0,83 e `subagent_busy_min=10`.
- **Efeito:** toda criação em modo `apoio` aparece no dashboard como "serial e sem subagente"; comparar 145 (Codex) × 141-b (nativo)
  pela telemetria é impossível; o campo `codex` fica vazio apesar de 4 delegações — o custo que o `apoio` economiza não é medido.
- **Proposta:** `harness-delegate.sh` grava uma linha em `tasks-ultimas.jsonl` ao terminar (papel, `executor=codex-cli`, `dur_s`,
  tokens se o CLI reportar); o `stop` soma essas linhas em `subagent_busy_min`/`subagent_measured` e preenche `codex=N`.

### C8 · Telemetria gravou o beholder da 141-b como `⛔` — o veredito real foi `✅ 0 🔴`; a legenda do template no texto final engana o `statusDe()`
- **Prova:** `tasks-ultimas.jsonl` (141-b): `papel=beholder rotulo=PRD-141-b-c1 dur_s=576 status=⛔`; `REVIEW-beholder.md:3-4`:
  `**Veredito:** ✅ Pronta para executar` · `**Placar:** 🔴 0 bloqueadores · 🟠 0 · 🟡 4 · 🔵 2`. O texto final do subagente traz a legenda
  do template (`**Veredito:** ✅ Pronta para executar | ⚠️ Executável com ressalvas | ⛔ Não executar (corrigir antes) | ⚠️ PARCIAL-TEMPO`)
  e `task-telemetry.mjs:168` faz `if (/⛔|BLOQUEAD/i.test(t)) return '⛔'` sobre o texto inteiro; a sobreposição da 3.4.30 (`:213`) só lê
  uma linha `Status:`, e o relatório do gate usa `Veredito:`.
- **Recorrência (15:30):** beholder c2 da PRD-144 (confirmação, 2 min, 3 turnos) → `tasks-ultimas status=⛔`; `REVIEW-beholder.md:5`
  = `✅ Pronta para executar · 🔴 0`. O texto final do subagente citava o veredito do ciclo 1 ("⛔ Não executar") como referência e a
  legenda do template. Nos outros 7 gates da tarde o status ficou **vazio** (`""`) — o campo só acerta quando o texto termina com o emoji.
- **Efeito:** o dashboard vai contar um gate "⛔" numa PRD aprovada de primeira; o vigia e o `--ultima` do papel (que a `/prd` usa para
  decidir ciclo 2) leem o sinal errado — em MODO LEVE isso pode disparar a "confirmação" à toa.
- **Proposta:** para papéis de gate (beholder/michelangelo/sherlock), o status vem da linha `**Veredito:**`/`Status:` do relatório
  (primeiro emoji DEPOIS do rótulo, ignorando alternativas separadas por `|`), e só no fallback do texto inteiro; e o template do
  beholder não repete a legenda com os três emojis na saída (só o escolhido).

### Sinais positivos da 3.5.4 (até 14:48)
- **Reserva atômica de número com duas `/prd` simultâneas funcionou:** `SEQ|PRD|144` na 048 (14:39:20) e `SEQ|PRD|145` na 046
  (14:39:38), pastas `.git/harness-locks/seq/PRD-144` e `PRD-145` — o DT-002 (colisão em worktrees) está provado em campo.
- **`start PRD-14x-fase1` adotou o `_auto-prd-fase1`** (3.4.29) nas duas ideias: só o marcador com número ficou, sem órfão.
- **Auto-start ligou nas 4** (`metrics-auto.log`), daemon carregou módulos das 4 worktrees na hora, ROTA/`apoio` roteou 4 papéis ao
  Codex em 3 sessões, hooks todos < 1,2 s (C3).

## Fechamento (preenchido conforme cada uma termina)

- **PRD-141-b · fase 1 fechada 14:50:27** — 12 min 0 s (14:38:27 → 14:50:27), MODO LEVE, 3 subagentes nativos (general-purpose
  sonnet, tony-stark, peter-quill), fator 0,83, `esforco=""` (vazio: Passo 0 pulado, C5), `origem_start=marcador`, thinking pai 71 % /
  subagentes 81 %. PRD de produto + `_discovery.md` escritos; cabeçalho do stub atualizado. Fase 2 ligada 14:50:30.
- **PRD-145 (IDEIA-046) · fase 1 fechada 14:51:19** — 12 min 10 s, MODO LEVE, 4 delegações Codex + tony-stark, fator 0,05 (C7),
  `esforco=high/n/d` (C1), `origem_start=marcador`. Fase 2 ligada 14:51:19.
- **PRD-144 (IDEIA-048) · fase 1 fechada 14:55:42** — 17 min 6 s, MODO LEVE, 4 delegações Codex + tony-stark (subagentes=4), fator 0,15
  (C7 de novo: só o tony-stark medido), thinking do subagente 87 %, `esforco=high/n/d` (C1). A mais longa das três fases 1 até aqui —
  a sessão também reservou migration (`SEQ|MIG|200`) e leu muito código à mão (endpoints do inbox, ACL). Fase 2 ligada 14:55:42.
- **PRD-137-c · fase 1 fechada 15:02:48** — 25 min de parede, **15 min ativos** (`elapsed_active_s=890`), `wait_human_min=10`,
  `permission_prompts=1`, `perguntas=1` — a telemetria mediu a espera pelo Charles certinho ✅. MODO LEVE, 4 delegações Codex +
  tony-stark (subagentes=5, medido 1, fator 0,14 — C7), `esforco=high/n/d` (C1), `start` adotou o epoch do `_auto-prd-fase1` (14:37:36) ✅.
  Charles respondeu por volta de 14:51; o discovery só subiu às 14:53 (C4). Fase 2 ligada 15:02:48.
- **PRD-141-b · fase 2 fechada 15:11:03 — CRIAÇÃO COMPLETA em 33 min** (14:38:07 → 15:11:31): fase 2 de 20 min 28 s, 6 tasks
  (142 linhas/task), beholder ciclo 1 em sonnet (10 min, 45 turnos, thinking 85 %) → **✅ 0 🔴 · 4 🟡 · 2 🔵**; a pai aplicou 3 ajustes
  baratos dos 🟡 e fechou com `--ciclos=1 --achados=0`, `min_gates=9`, `esforco=""` (C5). `VALIDACAO|ok|rf=7/7|tasks=6/6|dts=2/2`.
  **Parou no fim e pediu o aceite** ("está criada e aguarda seu aceite; ela não foi executada") — o B3 foi respeitado porque o prompt
  mandou; a regra na skill continua pendente. Abaixo da meta do LEVE (40–50 min). Nada commitado (7 arquivos novos + INDEX/stub).
- **PRD-145 (IDEIA-046) · fase 2 fechada 15:12:32 — CRIAÇÃO COMPLETA em 34 min** (14:39:05 → 15:13:06): fase 2 de 21 min 13 s, 7 tasks
  (106 linhas/task), dedalo Modo P (3 min) + beholder ciclo 1 sonnet (7 min) → **0 🔴 · 1 🟠 · 2 🟡 · 1 🔵**; a pai aplicou 3 correções
  baratas, `VALIDACAO|falta|DT-590` → corrigiu → `ok|rf=5/5|tasks=7/7|dts=1/1`; `min_gates=7`, `esforco=high/n/d` (C1), sem migration.
  **Parou e pediu aprovação** ("pronta para `/prd-exec`, aguardando sua aprovação"). `tasks-ultimas` gravou `status=""` para dedalo e
  beholder (vazio — o C8 não é só ⛔: o status do gate não é lido de forma confiável em nenhum dos dois casos).
- **C9 (miúdo) · o `stop` de uma run de CRIAÇÃO avisou "⚠️ Paralelismo cego (3.5.3): run com 7 tasks fechou sem `--vivos-max` e
  `--limitou`"** (PRD-145-fase2, 15:12:37) — `--vivos-max`/`--limitou` são conceitos de EXEC (executores vivos); na fase 2 da `/prd` as
  "tasks" são documentos redigidos pela pai. Proposta: o aviso só para rótulos `-exec`/`LOTE-`.
- **PRD-144 (IDEIA-048) · fase 2 fechada 15:34:06 — CRIAÇÃO COMPLETA em 56 min** (14:38:36 → 15:34:37): fase 2 de 38 min 19 s, a mais
  longa: dedalo Modo P + beholder c1 sonnet (11 min) **1 🔴** + michelangelo c1 sonnet (13 min) **4 🔴 de UX** → correções → confirmações
  c2 (michelangelo 1 min ✅ "Excelente", beholder 2 min ✅ 0 🔴); `achados_por_ciclo=4,0`, `min_gates=26`, 5 subagentes, fator 0,78.
  `VALIDACAO|falta|DT-438 ausente; 10 tasks > teto 9 (HARNESS_PRD_MAX_TASKS): fatiar` → a pai **juntou** duas tasks (busca de mensagens
  na TASK-002, remoção do endpoint de etiqueta na costura) em vez de fatiar → 9 tasks (113 linhas/task), `ok`. Reservou `MIG-200`.
  **Parou e pediu aceite**, e deixou uma decisão de produto (D-03) para o Charles antes da exec. Um subagente tentou `Read` de
  `tests/e2e/_test-helpers.js` (não existe) e um `ls` via Bash (GUARDA 0 negou). 2ª sessão com `bash: unexpected EOF` (15:26, C10).
- **PRD-137-c · fase 2 fechada 15:34:12 — CRIAÇÃO COMPLETA em 57 min de parede, 47 ativos** (14:37:35 → 15:34:40): fase 2 de
  31 min 19 s: dedalo Modo P + michelangelo c1 (6 min, ⚠️ "Bom com ajustes", 0 🔴 · 4 🟠) + beholder c1 (11 min, **1 🔴 + 2 🟠**) →
  correções → beholder c2 (2 min ✅ 0 🔴); `achados_por_ciclo=1,0`, `min_gates=18`, 4 subagentes, fator 0,71, 9 tasks (107 linhas/task).
  `VALIDACAO|falta|fatia PRD-137-b existe e não está na seção 5` → corrigiu → `ok|rf=8/8|tasks=9/9|dts=2/2|fatias=1/1`. **Parou e pediu
  aceite** ("nada foi commitado nem executado").
- **141-b · fase 2 (15:00):** `prd-validacao-check.sh` pegou `VALIDACAO|PRD-141-b|falta|DT-373 e DT-587 citados na PRD e ausentes das
  seções 3/4` e 13 s depois `VALIDACAO|PRD-141-b|ok|rf=7/7|tasks=6/6|dts=2/2` — freio de criação funcionando (mesmo padrão da 143-b ontem).
  GUARDA 0 negou 1 `ls -la` via Bash de um subagente (15:01) — esperado, contado.

## Painel final (15:40)

| PRD | Sessão | Fase 1 | Fase 2 | Total (parede) | Tasks | Gates | Resultado |
|---|---|---|---|---|---|---|---|
| **PRD-141-b** Jodit | `7de962c2` | 12 min (3 nativos, fator 0,83) | 20 min | **33 min** | 6 | beholder c1: 0 🔴 · 4 🟡 | ✅ criada, aguarda aceite |
| **PRD-145** chat pelo calendário | `c2f9d4c5` | 12 min (4 Codex + tony, fator 0,05) | 21 min | **34 min** | 7 | beholder c1: 0 🔴 · 1 🟠 | ✅ criada, aguarda aprovação |
| **PRD-144** Chat WPP base inteira | `dbfb483f` | 17 min (4 Codex + tony, fator 0,15) | 38 min | **56 min** | 9 (10 juntadas) | beholder 1 🔴 + michelangelo 4 🔴 → c2 ✅ | ✅ criada, aguarda aceite + D-03 |
| **PRD-137-c** IA aprende com edições | `91d65cfc` | 25 min (10 de espera humana) | 31 min | **57 min** (47 ativos) | 9 | beholder 1 🔴 + 2 🟠, michelangelo ⚠️ → c2 ✅ | ✅ criada, aguarda aceite |

Meta do MODO LEVE (fase 1 + 2 em 40–50 min): 2 dentro (as sem michelangelo e sem ciclo 2), 2 acima (as com tela nova → michelangelo,
e ciclo 2 de confirmação). Todas em Opus `xhigh` (C1). Máquina às 15:36: `claude.exe` 22 (4,5 GB), `node` 2, `bash` 3, CPU 11 %, RAM
livre 15,7 GB — nenhum stall, nenhum 429, nenhum hook cancelado, spawn 21–57 ms a tarde inteira. Nada commitado nas 4 worktrees
(git status: 5 / 6 / 13 / 13 entradas) — instrução do Charles. Intervenções efetivas do monitor: **0** (1 tentada e barrada, C2).

## Conclusão da tarde (15:40) — o que a 3.5.4 provou nas criações e o que a 3.5.5 tem de atacar

**Provou:** reserva atômica de número com duas `/prd` simultâneas (PRD-144/145, DT-002); auto-start da criação em 4/4 e `start` adotando
o `_auto` (3.4.29) em 3/3; `wait_human_min` medindo a espera real (137-c: 10 min); `prd-validacao-check.sh` pegando DT/fatia ausentes em
4/4 PRDs antes do aceite (todas corrigiram em < 1 min); teto de 9 tasks (`HARNESS_PRD_MAX_TASKS`) segurou a 144; gates LEVE (1 ciclo +
confirmação só com 🔴) funcionaram nas 4 — 6 🔴 achados e fechados; as 4 pararam no fim e pediram aceite (B3 respeitado — por prompt);
zero hook cancelado com a máquina folgada (C3).

**Custou (para a 3.5.5, por retorno):**
1. **C1** esforço invisível: 4/4 em `xhigh` com alvo `high`, `atual=n/d` — o daemon já tem a `CommandLine`; `esforco.sh` passa a saber
   sozinho; `AJUSTAR` interativo pergunta; ou o Perfil declara `xhigh` de propósito.
2. **C2** auto-start errado por "/prd-exec" citado no contexto de uma criação (`PRD-141-b-exec.json` com start 14:38 esperando inflar a
   exec) — ordem por posição no prompt; hook no `Skill`; `start fase1` apaga `-exec` órfão. **Pendente para o Charles: apagar o marcador
   antes da exec da 141-b.**
3. **C7** telemetria cega às delegações Codex: 3 criações com fator 0,05–0,15 e `codex=""` apesar de 4 delegações cada — `harness-delegate.sh`
   grava em `tasks-ultimas.jsonl`; `stop` soma.
4. **C8** status do gate mal lido: `⛔` em 2 gates aprovados (legenda/citação no texto final), vazio nos outros 7 — ler a linha `Veredito:`.
5. **C5** MODO LEVE por conta própria pula `esforco.sh` e a ROTA (`general-purpose` no discovery) — Passo 0 incondicional; ROTA no LEVE.
6. **C4** com "não re-entrevistar" a skill ainda perguntou o rito; `prod-snapshot.sh` deixou a sessão improvisar (DT-518) — políticas pelo
   default; snapshot fecha o caso da coluna gerada de vez.
7. Miúdos: **C6** lock órfão `DT-592` avisado 4×; **C9** aviso "paralelismo cego" numa run de criação; **C10** 3 `bash: unexpected EOF
   while looking for matching ''` em 2 sessões (137-c 14:52 e 15:10, 048 15:26) — scripts longos com aspas desbalanceadas custam um turno
   cada; proposta: skill orienta `Write` + `bash arquivo.sh` acima de ~20 linhas, e o `guard-bash.mjs` (daemon) checa balanceamento de aspas
   antes de executar.

**Para o Charles decidir agora:** aceite das 4 PRDs (VALIDACAO.md de cada uma); D-03 da PRD-144; se aprovar a exec da 141-b na mesma
sessão, apagar `wt-prd-141b/.claude/.harness-run/PRD-141-b-exec.json` antes (C2) e trocar para `/effort medium` (B3/C1); as 4 worktrees
estão sem commit.

## Merge das 4 worktrees na main (16:05–16:15, pedido do Charles)

- As 4 já estavam commitadas (1 commit cada, feitos após o aceite). `fechar --merge` em cadeia: 046 fast-forward; 048 conflitou em
  `prds/INDEX.md` (as duas ideias inseriram a linha no mesmo ponto) — `fechar` morre no conflito e deixa o merge aberto no main
  (esperado); 137-c e 141-b auto-mergearam. `prds/backlog/IDEIAS.md` auto-mergeou. Resultado: `83721c23`, `9bdba130`, `d7ba2401` +
  `cd4b0269`; `VALIDACAO|ok` nas 4 na main; **8 commits à frente da origin, push NÃO feito** (deploy — decisão do Charles).
- **C11 · `fechar` NÃO libera os locks quando o lock foi feito com `--por <rotulo>`:** o main registrou `lock IDEIA-046 --por ideia-046`
  (dono gravado = `ideia-046`, `harness-worktree.sh:225,231`) e o `fechar` procura `^<repo>--wt-<rot>|` (`:~478`) → os 4 locks ficaram
  órfãos depois do fechamento (+ o `DT-592.lock` de ontem, C6). Liberados à mão com `unlock` (5). Proposta: `fechar` aceita dono
  `<repo>--wt-<rot>` OU `<rot>`; `lock --por` normaliza para o nome da pasta do worktree; `doctor` lista lock cujo worktree não existe mais.
- **B21 de novo:** as 4 pastas `--wt-*` ficaram no disco (`Permission denied` — abas do Desktop abertas), `fechar` seguiu com exit 0.
  Charles precisa fechar/arquivar as 4 abas e apagar as pastas (o `git worktree` já foi removido; os bancos clone já caíram).
- **Lição do monitor (não é do harness):** o INDEX.md do Mariana é CRLF; meu resolvedor de conflito por regex `\n` não casou e o
  `git add` engoliu os marcadores num commit de merge (`83721c23`) — corrigido em `cd4b0269`. Um `guard-write`/pre-commit que recuse
  arquivo com `^<<<<<<<|^=======|^>>>>>>>` custa nada e evita isso para qualquer sessão que resolva conflito na mão (candidato C12).

## 3.5.5 implementada (16:20–17:40, pedido do Charles)

Publicada no mestre pela lista da Conclusão (C1, C2, C7, C8, C5, C4, C6/C11, C9, C10, C12 + B3): `CHANGELOG.md` 3.5.5 (12 itens),
`ONBOARDING.md` (ação: hook `Skill` no `settings.json` de cada projeto — não viaja pelo sync; decisão: Perfil `Esforço — fase pensar:
xhigh` se quiser xhigh), suíte `tests/t-355-criacoes.mjs` (38/38) e regressão `t-354` (59/59). Achado de implementação: **no MSYS o
`fork+exec` deixa o processo com um pai Windows já morto** — a subida pela cadeia do Windows quebra no 1º degrau; o `esforco.sh` sobe
pela cadeia do `ps` do MSYS até o topo e só então pergunta ao Windows quem é o pai (medido nesta sessão: `atual=xhigh|AJUSTAR|
atual_origem=processo` em 0,9 s). Sincronizada na Mariana (`harness-sync.sh --apply`, 15 arquivos + hook `Skill` + versão) — commit
sem push. Ficam para a 3.5.6: B1 (auto-start no daemon), B5/B10/B4, B18, B12/B13.

## Linha do tempo (auto)

<!-- monitor:auto -->
- 15:41:39 · `dra-mariana-duarte--wt-prd-141b` · **sessao-parada** ⚠️ — transcript sem escrita ha 30 min com cronometro ligado (PRD-141-b-exec.json)
- 18:34:06Z · `dra-mariana-duarte--wt-ideia-048` · **gate** — 1 - **Duracao:** 38min 19s - **Paralelismo:** 29min de trabalho em 5 subagente(s) sobre 38min de janela ativa — **fator 0.78** (saudavel: >= 1.3; ~1.0 = serial) - **tokens (aprox.): 128988 output / 100 input / 23153520 total c/ cache + 1389
- 15:35:27 · `dra-mariana-duarte--wt-ideia-048` · exec · **exec-terminou** ⚠️ — PRD-144-fase2.json removido (stop rodou) · runs: 38min ativo=38min tasks=9 ciclos=2 subagentes=5 paralelismo=0.78 out=128988 thinking_sub=83% esforco=high/n/d
- 18:34:12Z · `dra-mariana-duarte--wt-prd-137c` · **gate** — ok - **Preset:** equilibrado (beholder sonnet c1+c2, michelangelo sonnet c1, dedalo sonnet) - **Duracao:** 31min 19s - **Paralelismo:** 22min de trabalho em 4 subagente(s) sobre 31min de janela ativa — **fator 0.71** (saudavel: >= 1.3; ~1.0
- 15:35:27 · `dra-mariana-duarte--wt-prd-137c` · exec · **exec-terminou** ⚠️ — PRD-137-c-fase2.json removido (stop rodou) · runs: 31min ativo=31min tasks=9 ciclos=2 subagentes=4 paralelismo=0.71 out=95139 thinking_sub=84% esforco=high/n/d
- 18:33:44Z · `dra-mariana-duarte--wt-ideia-048` · **gate** — PACKET-CHECK¦TASK-001¦54¦0/0¦103¦ok PACKET-CHECK¦TASK-002¦69¦2/2¦117¦ok PACKET-CHECK¦TASK-003¦53¦1/1¦83¦ok PACKET-CHECK¦TASK-004¦46¦4/4¦97¦ok PACKET-CHECK¦TASK-005¦35¦0/0¦75¦ok PACKET-CHECK¦TASK-006¦33¦0/0¦70¦ok PACKET-CHECK¦TASK-007¦45¦0/0
- 18:32:33Z · `dra-mariana-duarte--wt-prd-137c` · **gate** — VALIDACAO¦PRD-137-c¦ok¦rf=8/8¦tasks=9/9¦dts=2/2¦fatias=1/1 exit=0
- 15:33:26 · `dra-mariana-duarte--wt-prd-137c` · tasks · **agente-terminou** — beholder PRD-137-c-c2 claude-sonnet-5 2min turnos=9 status=✅ thinking=67% out=9568
- 18:31:20Z · `dra-mariana-duarte--wt-prd-137c` · **despacho** — beholder: Confirmação beholder PRD-137-c (c2)
- 18:32:20Z · `dra-mariana-duarte--wt-prd-137c` · **gate** — VALIDACAO¦PRD-137-c¦falta¦fatia PRD-137-b existe e nao esta na secao 5 exit=1
- 18:30:08Z · `dra-mariana-duarte--wt-ideia-048` · **gate** — Exit code 1 VALIDACAO¦PRD-144¦falta¦DT-438 citado na PRD e ausente das secoes 3/4; 10 tasks > teto 9 (HARNESS_PRD_MAX_TASKS): fatiar em PRD-NNN-b antes do aceite (medido PRD-141: 13 tasks = 6 h de exec)
- 15:30:15 · `dra-mariana-duarte--wt-ideia-048` · tasks · **agente-terminou** — michelangelo PRD-144-c2 claude-sonnet-5 1min turnos=4 status=✅ thinking=57% out=5948
- 15:30:49 · `dra-mariana-duarte--wt-ideia-048` · tasks · **agente-terminou** — beholder PRD-144-c2 claude-sonnet-5 2min turnos=3 status=⛔ thinking=81% out=10451
- 18:28:48Z · `dra-mariana-duarte--wt-ideia-048` · **despacho** — beholder: Confirmação beholder PRD-144 (ciclo 2)
- 18:29:01Z · `dra-mariana-duarte--wt-ideia-048` · **despacho** — michelangelo: Confirmação michelangelo PRD-144 (ciclo 2)
- 15:29:03 · `dra-mariana-duarte--wt-prd-137c` · tasks · **agente-terminou** — beholder PRD-137-c-c1 claude-sonnet-5 11min turnos=28 status=- thinking=90% out=50737
- 15:26:40 · `dra-mariana-duarte--wt-ideia-048` · tasks · **agente-terminou** — michelangelo PRD-144-c1 claude-sonnet-5 13min turnos=35 status=- thinking=84% out=54282
- 15:24:50 · `dra-mariana-duarte--wt-ideia-048` · tasks · **agente-terminou** — beholder PRD-144-c1 claude-sonnet-5 11min turnos=18 status=- thinking=92% out=54034
- 15:24:05 · `dra-mariana-duarte--wt-prd-137c` · tasks · **agente-terminou** — michelangelo PRD-137-c-c1 claude-sonnet-5 6min turnos=6 status=- thinking=89% out=28446
- 18:18:14Z · `dra-mariana-duarte--wt-prd-137c` · **despacho** — beholder: Red-team da PRD-137-c (ciclo 1)
- 18:18:29Z · `dra-mariana-duarte--wt-prd-137c` · **despacho** — michelangelo: Gate de UX da PRD-137-c (ciclo 1)
- 18:13:46Z · `dra-mariana-duarte--wt-ideia-048` · **despacho** — beholder: Red-team da PRD-144 (ciclo 1)
- 18:14:01Z · `dra-mariana-duarte--wt-ideia-048` · **despacho** — michelangelo: Gate de UX da PRD-144 (ciclo 1)
- 18:12:26Z · `dra-mariana-duarte--wt-ideia-046` · **gate** — VALIDACAO¦PRD-145¦ok¦rf=5/5¦tasks=7/7¦dts=1/1¦fatias=0/0 exit=0
- 18:12:37Z · `dra-mariana-duarte--wt-ideia-046` · **gate** — - **Duracao:** 21min 13s - **Volume:** 7 tasks; 1 ciclos de review; 2 subagentes - ⚠️ **Paralelismo cego (3.5.3):** run com 7 tasks fechou sem --vivos-max e --limitou — nao da para saber o que limitou os executores. Regra 1.3 item 6 da /prd
- 15:13:55 · `dra-mariana-duarte--wt-ideia-046` · exec · **exec-terminou** ⚠️ — PRD-145-fase2.json removido (stop rodou) · runs: 21min ativo=21min tasks=7 ciclos=1 subagentes=2 paralelismo=0.48 out=71401 thinking_sub=81% esforco=high/n/d
- 18:12:11Z · `dra-mariana-duarte--wt-ideia-046` · **gate** — VALIDACAO¦PRD-145¦falta¦DT-590 citado na PRD e ausente das secoes 3/4 exit=1 # 🦠 Beholder — Revisão da PRD-145: A conversa da paciente a um clique do calendário **Ciclo:** 1 de 1 (teto absoluto = HARNESS_REVIEW_MAX_CICLOS, default 3) · MOD
- 15:11:32 · `dra-mariana-duarte--wt-ideia-046` · tasks · **agente-terminou** — beholder PRD-145-c1 claude-sonnet-5 7min turnos=42 status=- thinking=88% out=38349
- 18:11:03Z · `dra-mariana-duarte--wt-prd-141b` · **gate** — VALIDACAO¦PRD-141-b¦ok¦rf=7/7¦tasks=6/6¦dts=2/2¦fatias=0/0 - **Duracao:** 20min 28s - **tokens (aprox.): 56602 output / 54 input / 9648060 total c/ cache + 48532 output em 1 subagente(s) = 105134 output REAL — raciocinio ~55% (pai) / ~85% (
- 15:12:15 · `dra-mariana-duarte--wt-prd-141b` · exec · **exec-terminou** ⚠️ — PRD-141-b-fase2.json removido (stop rodou) · runs: 20min ativo=20min tasks=6 ciclos=1 subagentes=1 paralelismo=0.47 out=56602 thinking_sub=85% esforco=
- 15:09:22 · `dra-mariana-duarte--wt-prd-141b` · tasks · **agente-terminou** — beholder PRD-141-b-c1 claude-sonnet-5 10min turnos=45 status=⛔ thinking=85% out=48532
- 15:07:25 · `dra-mariana-duarte--wt-prd-137c` · tasks · **agente-terminou** — dedalo PRD-137-c claude-sonnet-5 4min turnos=15 status=- thinking=68% out=18772
- 18:04:18Z · `dra-mariana-duarte--wt-ideia-046` · **despacho** — beholder: Red-team da PRD-145 (ciclo 1)
- 18:03:28Z · `dra-mariana-duarte--wt-prd-137c` · **despacho** — dedalo: Dedalo Modo P: front da PRD-137-c
- 15:03:06 · `dra-mariana-duarte--wt-prd-137c` · exec · **cronometro-ligado** — PRD-137-c-fase2.json start=15:02:48
- 15:03:06 · `dra-mariana-duarte--wt-prd-137c` · exec · **exec-terminou** ⚠️ — PRD-137-c-fase1.json removido (stop rodou) · runs: 25min ativo=15min tasks= ciclos=0 subagentes=5 paralelismo=0.14 out=52292 thinking_sub=79% esforco=high/n/d
- 15:03:06 · `dra-mariana-duarte--wt-prd-141b` · incidentes · **leitura-via-bash** — 1 negacao(oes) GUARDA 0 (subagente lendo via Bash)
- 18:00:35Z · `dra-mariana-duarte--wt-prd-141b` · **gate** — Exit code 1 VALIDACAO¦PRD-141-b¦falta¦DT-373 citado na PRD e ausente das secoes 3/4; DT-587 citado na PRD e ausente das secoes 3/4
- 18:00:48Z · `dra-mariana-duarte--wt-prd-141b` · **gate** — VALIDACAO¦PRD-141-b¦ok¦rf=7/7¦tasks=6/6¦dts=2/2¦fatias=0/0
- 14:59:33 · `dra-mariana-duarte--wt-ideia-048` · tasks · **agente-terminou** — dedalo PRD-144 claude-sonnet-5 3min turnos=16 status=- thinking=55% out=14194
- 17:59:44Z · `dra-mariana-duarte--wt-prd-141b` · **despacho** — beholder: Red-team da PRD-141-b (ciclo 1)
- 14:55:34 · `dra-mariana-duarte--wt-ideia-046` · tasks · **agente-terminou** — dedalo PRD-145 claude-sonnet-5 3min turnos=12 status=- thinking=64% out=16424
- 17:56:21Z · `dra-mariana-duarte--wt-ideia-048` · **despacho** — dedalo: Front da PRD-144 (Modo P)
- 14:56:56 · `dra-mariana-duarte--wt-ideia-048` · exec · **cronometro-ligado** — PRD-144-fase2.json start=14:55:42
- 14:56:56 · `dra-mariana-duarte--wt-ideia-048` · exec · **exec-terminou** ⚠️ — PRD-144-fase1.json removido (stop rodou) · runs: 17min ativo=17min tasks= ciclos=0 subagentes=4 paralelismo=0.15 out=69086 thinking_sub=87% esforco=high/n/d
- 17:54:05Z · `dra-mariana-duarte--wt-prd-137c` · **despacho** — tony-stark: Inovação: delta para a PRD-137-c
- 17:52:38Z · `dra-mariana-duarte--wt-ideia-046` · **despacho** — dedalo: Front da PRD-145 (Modo P)
- 14:51:59 · `dra-mariana-duarte--wt-ideia-046` · exec · **cronometro-ligado** — PRD-145-fase2.json start=14:51:19
- 14:51:59 · `dra-mariana-duarte--wt-ideia-046` · exec · **exec-terminou** ⚠️ — PRD-145-fase1.json removido (stop rodou) · runs: 12min ativo=12min tasks= ciclos=0 subagentes=5 paralelismo=0.05 out=41932 thinking_sub=69% esforco=high/n/d
- 14:51:59 · `dra-mariana-duarte--wt-prd-137c` · exec · **cronometro-ligado** — PRD-137-c-fase1.json start=14:37:36
- 14:51:59 · `dra-mariana-duarte--wt-prd-137c` · exec · **exec-terminou** ⚠️ — _auto-prd-fase1.json removido (stop rodou)
