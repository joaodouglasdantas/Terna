# Playbook — "a PRD demorou demais" (diagnóstico forense de telemetria)

> **Quando usar:** uma linha do `prds/_metrics/harness-runs.jsonl` mostra duração alta
> (ou o resumo de telemetria imprimiu o aviso ⚠️ de provável espera humana) e você quer
> saber **por quê** — antes de mexer em preset, modelo ou ciclos.
>
> **A regra de ouro:** wall-clock alto + throughput baixo = **espera humana**, não
> lentidão de modelo/config. Numa execução real, 73% de "348 min" era UM comando Bash
> de subagent pendurado num prompt de permissão por 4h15 (o operador estava longe).
> Execuções de 600–1000 min no histórico eram pausas overnight do operador.
>
> **A segunda pergunta (2.12.0):** descontada a ociosidade, o tempo restante foi gasto
> **em paralelo ou em fila**? É o `parallel_factor`. Wall-clock alto com operador
> presente e subagentes rodando **um de cada vez** não é espera — é serialização, e
> tem cura diferente (ver "Régua do `parallel_factor`").
>
> **Multi-AI (2.0.0):** cada linha do `harness-runs.jsonl` agora carrega o campo
> **`platform`** (`claude` | `codex`). As métricas de espera humana e do classificador
> (`wait_human_min`, `permission_prompts`, `classifier_denials`, `spiral_blocks`) são
> sinais do **host Claude**; no Codex, tokens/gaps são **best-effort** sobre
> `~/.codex/sessions` — quando o formato não é parseável, saem `n/d` (nunca inventados).
> **Não compare números entre plataformas** — compare cada run com o histórico da mesma.

## Regra de leitura do `out_tps`

`out_tps = tokens_output / elapsed_s` (gravado pela telemetria desde a 1.8.0):

| Faixa | Leitura |
|---|---|
| **100–270** | execução saudável (referência de execuções reais) |
| **30–100** | normal em execução com muitos gates/espera de review |
| **< 30 com elapsed alto** | **investigar espera humana** — prompt pendurado ou pausa do operador. NÃO ajustar preset/modelo com base nesse número. |

> ⚠️ **O `out_tps` só conta o transcript PRINCIPAL** — é uma série histórica, mantida como
> está. Token produzido dentro de subagente não entra nela: execução com muitos subagentes sai
> com `out_tps` artificialmente baixo (PRD-111: **5,18**, com 512 min de trabalho de subagente
> acontecendo). Use **`out_tps_all`** (2.14.0), que soma os subagentes — é o throughput real.
> A régua de 100–270 vale para ele.

## Custo real x custo registrado (2.14.0)

Até a 2.13.0 o `tokens_output` media **só a sessão principal**: os transcripts de subagente
vivem em `<session>/subagents/` e o medidor lia apenas o topo do diretório. Medido na PRD-111:
**489k de output na sessão contra 1,30M nos 23 subagentes** — o custo real era **3,65×** o
registrado. Consequências ao ler o histórico:

- Execução com muito subagente (`/prd`, `/prd-exec`) estava **subestimada**; lote pequeno
  (`/dt-exec`, 1–2 agentes) estava quase certo. **Comparar PRD com lote em linha antiga é
  comparar medidas diferentes** — a PRD parecia mais barata do que é.
- Os campos novos são **separados** (`tokens_output_subagents`, `tokens_total_subagents`)
  justamente para não reescrever o significado do `tokens_output` no meio da série. Custo real
  de uma linha nova = `tokens_output + tokens_output_subagents`.
- Linha sem `tokens_output_subagents`: o custo de subagente é **n/d**, não zero. Se a linha tem
  `subagents` alto, presuma que o número registrado é uma fração do real.

> **A régua é POR GRUPO, não universal (2.10.0).** Medido em 2026-08 (só runs sem gap > 30
> min): criação-f1 127 tok/s · criação-f2 139 · `/prd-exec` **62** · lote 76. A execução rodar
> a metade da criação **não é lentidão**: o regime é outro — hefestos rodando ferramenta
> (lint, migrations, testes E2E), revisor externo via CLI (minutos de parede sem token do
> host) e espera de review são tempo de parede sem output de token. Compare cada run com a
> mediana do MESMO grupo; comparar execução com criação é comparar regimes.

Desde a 1.8.0 a espera é também **medida direto** (hook `notify.sh` → `wait_human_min`
e `permission_prompts` na linha do jsonl; `elapsed_active_s` = duração descontada).
Quando esses campos existem, use-os como fonte primária; o `out_tps` vira confirmação.

## Régua do `parallel_factor` (2.12.0) — a execução foi paralela ou uma fila?

`parallel_factor = subagent_busy_min / duração ativa` — quanto trabalho de subagente
coube em cada minuto de janela útil (já sem ociosidade). `2,0` = em média dois
subagentes trabalhando ao mesmo tempo; `1,0` = um de cada vez; `0,5` = metade da janela
sem subagente nenhum (sessão pai trabalhando sozinha).

| Faixa | Leitura |
|---|---|
| **≥ 1,3** | paralelismo real acontecendo — o default da skill está sendo cumprido |
| **1,0 – 1,3 com `subagents >= 10`** | **execução SERIAL disfarçada de paralela** — merece post-mortem |
| **< 1,0** | boa parte da janela sem subagente: cauda serial da sessão pai, ou trabalho concentrado num agente monolítico |

> **Caso que originou a régua (PRD-111, `dra-mariana-duarte`, 05/08/2026):** 22 subagentes,
> 1.037 min de wall-clock. Decompondo: **506 min** de gap ocioso (sessão parada) e **512 min**
> somados de trabalho de subagente dentro de **531 min** de janela — fator **1,04**. Vinte e
> dois subagentes rodando praticamente em fila. O paralelismo da **Fase 1** funcionou; o tempo
> se perdeu na **fase de correção** (2.5/2.9.3), que até a 2.11.0 não dizia uma palavra sobre
> paralelizar: 4 rodadas de correção somaram **175 min em série**, cada uma agrupando itens
> de arquivos distintos. Estimativa recuperável: 60–90 min só nessa execução.

**O que fazer com fator baixo:** olhe as rodadas de correção da Fase 2. Bloqueantes que
tocam arquivos disjuntos (retrieval / CLI / frontend / guard trivial) deviam ter ido em
agentes simultâneos, na mesma mensagem. A regra está na `/prd-exec` 2.5 e 2.9.3 — e o
plano de grupos disjuntos tem de aparecer anunciado no chat e no Output Esperado.

> **Ociosidade x subagente vivo — por que os dois campos existem.** Quando a sessão
> despacha um subagente em background, **o turno encerra**: o transcript principal fica
> mudo até a notificação de conclusão. Isso é **indistinguível** de o operador ter saído
> para almoçar — e até a 2.11.0 os dois viravam `wait_human_min`. Resultado prático: o
> aviso ⚠️ de espera humana disparava em execução saudável (treinando o leitor a ignorá-lo)
> e o `out_tps` parecia catástrofe (5,18 na PRD-111) quando o output estava sendo produzido
> **fora** do transcript principal. Desde a 2.12.0:
> `wait_idle_min` = gap **sem** ninguém vivo (a espera de verdade — só ela desconta o
> `elapsed_active_s` e dispara o ⚠️); `wait_gap_min` = gap **com** subagente vivo
> (trabalho); `subagent_busy_min` = soma das durações dos subagentes medidos.

> ⚠️ **Limitação corrigida na 2.10.0:** até a 2.9.0 o desconto vinha SÓ do notify.sh
> (prompt de permissão/idle) — sessão deixada aberta overnight não gerava evento nenhum
> e saía com `wait_human_min = 0` e `elapsed_active_s` **idêntico** ao bruto (82% dos
> runs medidos em 2026-08, com gaps de até 14h "ativos"). Desde a 2.10.0, todo **gap do
> transcript** maior que `HARNESS_WAIT_GAP_MIN` (default 10 min) também vira janela de
> espera; as duas fontes são **mescladas** (sem dupla contagem) antes do desconto. A linha
> ganha `wait_gap_min` (espera vinda de gaps) e `wait_gap_threshold_min` (limiar usado) —
> a **presença** de `wait_gap_threshold_min` é o discriminador de que o
> `elapsed_active_s` daquela linha é confiável. Linha antiga sem ele: só confie na
> duração se `max_gap_min <= 30`.

## Roteiro forense (5 passos)

1. **Ler a linha da execução** em `prds/_metrics/harness-runs.jsonl` → conferir
   `out_tps`, `wait_human_min`, `max_gap_min`. Se `out_tps` não existe (linha antiga),
   calcule à mão: `tokens_output / elapsed_s`.
2. **Se baixo:** abrir o transcript da sessão
   (`~/.claude/projects/<slug-do-projeto>/<session>.jsonl`), computar os gaps entre
   timestamps consecutivos e pegar o **top-5**.
3. **Gap grande terminando em `task-notification`** ⇒ subagent lento/travado: abrir o
   transcript dele em `<session-dir>/subagents/agent-<id>.jsonl` e repetir a análise
   de gaps lá dentro.
4. **Gap interno grande entre um `tool_use` Bash e seu `tool_result`** ⇒ quase sempre
   **prompt de permissão pendurado**. Confirmação forense: as últimas entradas
   adicionadas à allowlist local (`.claude/settings.local.json`) são gravadas no
   momento do "always allow" — se a entrada mais recente é exatamente o comando do
   gap, era ele. Cruze também com `.claude/.harness-run/permission-waits.jsonl`
   (o log do hook `notify.sh`, com timestamp de cada espera).
5. **Gaps que atravessam madrugada / horário de almoço** ⇒ pausa do operador —
   **desconte do wall-clock** antes de qualquer conclusão sobre performance.

## Prevenção (o que a 1.8.0 instalou — confira se está ativo)

- `bash .claude/harness-doctor.sh --autonomia` — roda só os checks de execução
  autônoma (hooks wired, alerta configurado, allowlist de prefixo dos CLIs do Perfil).
  A `/prd-exec` roda isso no Passo 0.2, antes de decolar.
- **Hook `guard-bash.sh`** (PreToolUse) bloqueia a causa nº 1: escrita em `/tmp` ou
  caminho de raiz (`/arquivo`) — no Git Bash/Windows isso resolve para
  `C:\Program Files\Git\` e dispara o prompt que pendura.
- **Hook `notify.sh`** (Notification) alerta (som/toast/webhook via
  `HARNESS_NOTIFY_CMD`) e loga cada espera para a telemetria medir.
- **Allowlist de PREFIXO** no `settings.local.json` para os CLIs do Perfil
  (interpretador, cliente de banco, test runner) — em vez de dezenas de "always
  allow" exatos que nunca casam de novo.

## Classificador de permissão indisponível — diagnóstico e destrave rápido (1.9.0)

> **Sintoma:** em auto mode, comandos triviais (`php -v`, até chamadas **Agent**) negados
> em sequência com a assinatura *"<modelo> is temporarily unavailable, so auto mode cannot
> determine the safety of ... Wait briefly and then try this action again"* / *"cannot
> determine the safety"*. Isso é o **classificador remoto do auto mode fora do ar** negando
> em **fail-closed** — não é juízo sobre os comandos. O "try again" da própria mensagem é o
> convite à espiral (incidente real: exec da PRD-007 do aec-backend, 09/07/2026 — 16+
> negações, re-execuções e re-agendamentos em loop).

**O que segue funcionando durante o outage:**
- Operações **read-only** (Read/Grep/Glob/WebFetch, git read-only) — não passam pelo
  classificador.
- Comandos cobertos por **regra determinística ESTREITA** em `permissions.allow` do
  `.claude/settings.json` do projeto — resolvem ANTES do classificador. ⚠️ Regra **larga**
  de interpretador (`Bash(php:*)`, `Bash(composer:*)`) é **suspensa** em auto mode e cai no
  classificador mesmo assim — não conta.

**Destrave (em ordem de rapidez):**
1. **Shift+Tab** — troca o modo de permissão da sessão (sai do auto mode; você aprova na mão).
2. **`/permissions` → aba "Recently denied"** — tecla `r` re-tenta a ação negada sob sua
   aprovação.
3. **Ampliar a allowlist estreita:** `bash .claude/harness-doctor.sh --gen-allowlist` gera o
   bloco a partir do Perfil; revise e cole no `.claude/settings.json`.
4. **Reduzir sessões autônomas paralelas** (recomendado: máx 2, `HARNESS_MAX_ACTIVE_SESSIONS`) —
   3+ sessões overnight estrangulam o classificador compartilhado.
5. **Aguardar a normalização** — fora do seu controle (modelo/retry/fail-open do classificador
   não são configuráveis).

**Telemetria do episódio:** a linha da execução em `harness-runs.jsonl` ganha
`classifier_denials` (negações do classificador, via hook `denied.sh`) e `spiral_blocks`
(cortes do anti-espiral do `guard-bash.sh`). No `permission-waits.jsonl`, os eventos têm
`type:"denied"` e `type:"spiral"` — e **não contam** como espera humana (`wait_human_min`).
`classifier_denials` alto num run = execução atravessou um outage; leia os números de
duração com esse desconto.

## Por task, não só por execução (3.4.22)

`prds/_metrics/tasks/<dev>@<máquina>.jsonl` tem **uma linha por subagente terminado** (gravada no
`SubagentStop`). Perguntas que ela responde sem abrir transcript: qual task passou do envelope
(`dur_s > 45 min`), quantos turnos e quantos Bash/Read cada papel gasta, qual **modelo** rodou em
cada papel (o Perfil declara o preset; a linha diz o que aconteceu), quantos retornos foram
`PARCIAL` (o guard-folego negou) e quantos 🔴 cada ciclo de revisor achou. Leitura rápida:
`node .claude/hooks/task-telemetry.mjs --tail 20` · p90 de um papel: `--p90 hefesto` ·
previsão para um packet: `--previsao hefesto <KB> <alvos>`. O dashboard (`--all`) agrega por papel
e lista as tasks acima do envelope. Régua: papel com `PARCIAL` recorrente = teto baixo demais OU
task grande demais — olhe `packet_kb`/`alvos` antes de mexer no teto.

## Placar interno por modelo — decidir o preset com dados (3.4.25)

A seção "Placar interno por modelo" do dashboard (e `placarInterno`/`abGateC1` no JSON) cruza as
linhas por task com o **modelo real** do transcript (`modelo` → família sonnet/opus/haiku/fable;
vazio = `n/d`, não invente). Por papel × modelo: n, duração/turnos/tokens_out medianos, `PARCIAL` %.
Revisores (sherlock, beholder, michelangelo) ganham 🔴 medianos e totais **por ciclo** — rótulo
`-c1` (ou sem sufixo, quando o prompt não dizia "ciclo N") é c1; `-c2`+ são os demais. Executores
(hefesto, dedalo): PARCIAL % e, quando a linha traz `verif_sem_prova`, o % de relatórios com
verificação sem prova (campo novo, lido com tolerância; linha sem o campo = "sem campo").

O **A/B do gate c1** é o que o item 13 (3.4.24) pediu: beholder e michelangelo no ciclo 1, Sonnet ×
Opus — n, 🔴 medianos, % das criações (PRD) em que o c1 achou ≥ 1 🔴, duração e tokens — com a
leitura pronta em texto ("c1 em Sonnet acha X 🔴 vs Y em Opus em N/M criações").

**Réguas (só texto — ninguém troca preset sozinho):**
- modelo com **n ≥ 5 e PARCIAL ≥ 30 %** no papel = investigar teto/packet (olhe `packet_kb`/`alvos`)
  antes de culpar o modelo;
- **c1 Sonnet com 🔴 medianos < 60 % do c1 Opus, em n ≥ 5 cada** = reconsiderar o item 13 (o Charles
  decide; o alerta "Gate c1 (item 13)" aparece no painel e no `/harness-report`);
- amostra curta (n < 5 de um lado) = "amostra curta", não conclusão.

## Por dev/máquina e por versão, sem pontos cegos (3.4.23)

O `--all` do dashboard agora responde "quem está lento, em que máquina, em que versão" sem script
à mão (era a tabela §8.1 da análise de 04/09, feita com `tests/analise/por-dev.js`):

- **Seção "Por dev / máquina"** — chave = `maquina` (user@host) da linha versionada; f1/f2/exec
  medianos, prompts de permissão (total · por run), **`perguntas`** (AskUserQuestion — a pergunta é
  a parada; contada separada dos prompts), negações do classificador, preset/review/modo mais
  usados, Codex ok/indisponível, spawn mediano, stalls, tasks acima do envelope, runs suspeitas e
  execs em worktree. **"Por versão"** corta o mesmo por `harness`. Linha sem `maquina` (histórico
  local pré-3.2.2) cai em `n/d` — não é um dev, é a série antiga.
- **Runs suspeitas** — `elapsed_s` > 12 h (`HARNESS_DASHBOARD_SUSPEITA_H`) fica FORA de mediana,
  p90 e top e ganha seção própria. Quase sempre é marcador de start esquecido ou sessão aberta
  por dias (7 runs de até 21.901 min entravam nas medianas em 04/09). Se foi exec real, o dado por
  task (SubagentStop) continua válido; a run não.
- **Dedup ± 60 s** — mesmo projeto + mesmo label com `ts_end` a ≤ 60 s é a mesma run (auto-start +
  start manual gravavam 2–3×). Fica a mais completa (maior `elapsed_s`).
- **Worktrees** — `projeto:"<nome>--wt-<x>"` entra em `<nome>` com `worktree=<x>` (antes sumia).
- **Incidentes** — `prds/_metrics/incidentes/<dev>@<host>.jsonl`, schema único
  `{ts, projeto, tipo, papel, rotulo, agent, detalhe}`; tipos `overrun` (task acima do teto do
  papel), `folego` (guard-folego negou), `frentes` (semáforo cheio) e, desde a 3.5.0, `denied`
  (classificador negou — antes só virava o contador `classifier_denials` da run), `stall` (agente
  vivo mudo por N min, 1 linha por agente), `pergunta` (AskUserQuestion negada em modo autônomo) e
  `leitura` (leitura via Bash negada — GUARDA 0). Seção por tipo/papel/dev.
  Régua: `denied` recorrente com o mesmo comando = regra de allowlist faltando (o doctor sugere);
  `pergunta` em exec noturna = defaults do Passo 0.3 mal declarados; `leitura` concentrada num papel =
  prompt do agente manda ler via shell.
  Régua: `folego` recorrente no mesmo papel = teto baixo OU task grande (olhe `packet_kb`);
  `overrun` sem `folego` = agente lento sem espiralar (poucas chamadas, muito tempo por chamada —
  ferramenta pendurada?).
- **Cobertura e frescor** (`--all`) — por repo: versão do `harness.env`, branch, último run, devs,
  runs em 14 d, **run aberta** (marcador `.harness-run/*-exec.json` com start há > 12 h — fechar
  com o `stop` ou apagar, senão a linha nasce suspeita); por dev: repos, silêncio em dias,
  prompts/negações por run. Repo com harness e zero runs é o ponto cego (Débora: 0 runs em 2 repos
  com 9 PRDs). O stdout ganha `COBERTURA|<repo>|<versão>|<branch>|<último run>|<devs>|<runs14d>|<aberta?>`
  para o `/prometeu --check`.
- **Duelos: custo por diff aplicado** — custo total do modelo ÷ duelos em que ele venceu E o diff
  foi aplicado com `ok`. É o único número que diz se o duelo pagou (PRD-138: US$ 0,17 por 0 diffs
  = n/d). Coluna "candidato a sair" quando cruza a régua (≥ 5 duelos e < 20% vitórias, ou > 40%
  inaplicável/falho).
- **`tree_tocado=SIM` em delegação read-only** — deixou de ser alerta 🔴; é "investigar": o
  fingerprint é `git status --porcelain` + `git diff HEAD --stat` e pode mudar por index refresh
  do próprio git sem o worker escrever nada.

Flags novas do `stop` que alimentam isso: `--modo=leve|turbo|noturno|normal --review-modo=dupla|solo|solo-2|partes
--codex=ok|indisponivel --limitou=<x> --stalls=N --tasks-estouradas=N` (campos em `prds/_metrics/README.md`).

## Notas de schema (`harness-runs.jsonl`)

- Campos desde a **1.8.0**: `ts_start`, `out_tps`, `max_gap_min`, `wait_human_min`,
  `permission_prompts`, `elapsed_active_s`, `waves` (ondas de paralelismo da Fase 1).
- Campos desde a **1.9.0**: `classifier_denials`, `spiral_blocks` (ver seção acima).
- Campos desde a **2.10.0**: `wait_gap_min` (parcela da espera derivada de gaps do
  transcript acima do limiar) e `wait_gap_threshold_min` (o limiar usado,
  `HARNESS_WAIT_GAP_MIN`, default 10). Nessa versão `wait_human_min` era o TOTAL mesclado
  (notify + gaps) e `elapsed_active_s` descontava esse total.
- Campos desde a **2.12.0**: `schema` (carimbo `"2.12.0"` — a **fronteira de versão
  explícita**), `wait_idle_min` (ociosidade real), `subagent_busy_min` (soma das durações
  dos subagentes medidos), `subagent_measured` (quantos foram medidos no transcript —
  cruze com `subagents`, que é o contador declarado pela skill) e `parallel_factor`.
  **Mudança de significado, não só campo novo:** `wait_human_min` agora vale a
  ociosidade (= `wait_idle_min`) e `wait_gap_min` passou a ser gap **com** subagente vivo
  (trabalho). `elapsed_active_s` desconta só a ociosidade.
- Campos desde a **2.14.0** (`schema: "2.14.0"`): `tokens_output_subagents`,
  `tokens_total_subagents` e `out_tps_all` — ver "Custo real x custo registrado".
- Campos desde a **3.4.23** (carimbo continua `"2.15.0"` — só acrescenta): `modo`, `limitou`,
  `review_modo`, `codex`, `stalls`, `tasks_estouradas`, `spawn_ms`, `frentes`, `perguntas`,
  `waits_invalidas` — tabela em `prds/_metrics/README.md`. Vazio = n/d; `modo` sem flag = `normal`.
- ⚠️ **Linhas sem `schema` NÃO são comparáveis com as novas em espera/duração ativa.**
  Numa linha pré-2.12.0, `wait_human_min` soma ociosidade + espera de subagente, e o
  `elapsed_active_s` desconta as duas — execução bem paralelizada com o operador ausente
  e execução 100% serial produziam a **mesma** linha. Comparação de custo entre uma linha
  antiga e uma nova exige declarar isso; tokens, ciclos e contadores seguem comparáveis.
- **Linhas anteriores à 1.8.0/1.9.0/2.10.0/2.12.0 não têm esses campos** — histórico misto é
  normal; não trate ausência como zero.
- `max_gap_min` = maior intervalo entre entradas consecutivas do transcript da sessão
  (omitido quando o transcript não está acessível no `stop`).
- O log `permission-waits.jsonl` é acumulativo (uma linha por espera, entre execuções);
  a telemetria filtra pelo intervalo da execução. Pode apagá-lo sem risco — só perde o
  histórico de esperas/negações.
