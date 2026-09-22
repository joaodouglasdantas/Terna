# prds/_metrics — telemetria do harness (3.2.2: versionada por dev/maquina em runs/; 3.5.0: TODAS as series por dev/maquina)

> **Regra única (3.5.0):** tudo o que o harness mede e que importa comparar entre semanas vive em
> `prds/_metrics/<serie>/<usuario>@<maquina>[~worktree].jsonl` — `runs/`, `tasks/`, `incidentes/`,
> `delegations/`, `duelos/`. Um arquivo por dev/máquina = append-only, sem conflito de merge, e o
> `harness-metrics.sh stop` faz `git add` dos desta máquina. **Nunca** versionar: `harness-runs.jsonl`
> (legado local), `harness-dashboard-*` (saída regerável) e `transcripts*/` (cru, pode carregar segredo).
> O `harness-doctor.sh` cobra as três coisas: o que deve estar no git e não está, o que está e não deveria,
> e pasta de série ignorada pelo `.gitignore` do projeto.

| Arquivo | Versionado? | O que e |
|---|---|---|
| `runs/<usuario>@<maquina>.jsonl` | **sim (3.2.2)** | **Uma linha por execucao** (`/prd`, `/prd-exec`, `/dt-exec`, `/dt-sweep`), gravada pelo `harness-metrics.sh stop`. Um arquivo por dev/maquina: append-only e sem conflito de merge. Cada linha carrega `projeto`, `autor` (git email), `maquina`, `harness` (versao) e `extra`. **E aqui que a telemetria da equipe chega ao Charles — entra no commit da PRD/lote como qualquer outro arquivo.** |
| `incidentes/<usuario>@<maquina>.jsonl` | **sim (3.4.23)** | **Uma linha por INCIDENTE do harness**, schema único: `{ts, projeto, maquina, harness, tipo, papel, rotulo, agent, detalhe}`. `tipo` = `overrun` (guard-agent `--post`: task acima do teto do papel), `folego` (guard-folego negou acima do teto de chamadas), `frentes` (semáforo de frentes cheio); **3.5.0:** `denied` (classificador negou — `denied.sh`), `stall` (agente vivo mudo, 1 linha por agente — `agent-stall.sh`), `pergunta` (AskUserQuestion negada em modo autônomo — `guard-question.sh`), `leitura` (leitura via Bash negada — GUARDA 0 do `guard-bash`). Os logs locais antigos (`.harness-run/watchdog-overruns.jsonl`, `folego.jsonl`) continuam. Helper: `hooks/_incidente.sh` (`harness_incidente <tipo> <papel> <rotulo> <agent> <detalhe>`) e `gravarIncidente()` do `guard-folego.mjs`. O `stop` faz `git add` deste arquivo. Seção "Incidentes" do dashboard. `HARNESS_INCIDENTES=off` desliga. |
| `tasks/<usuario>@<maquina>.jsonl` | **sim (3.4.22)** | **Uma linha por SUBAGENTE terminado** (hook `SubagentStop` → `task-telemetry.mjs`): `papel`, `rotulo` (TASK/DT/PRD/LOTE + `-cN` do ciclo), `modelo` real, `dur_s`, `turnos`, `bash/read/grep/glob/edit/write/agent`, `tokens_in/out`, `status` (✅/⚠️/⛔/PARCIAL), `vermelhos` (🔴 do revisor), `packet_kb`/`alvos`, `worktree`, `thinking_pct` (3.5.3). E o p90 do watchdog, a `PREVISAO` do `task-packet --check` e a secao "Tasks medidas" do dashboard. O `stop` da telemetria faz `git add` deste arquivo (so o da maquina). **3.5.3:** `turnos`/`tokens_in`/`tokens_out` por mensagem única (dedup por `message.id`) — linhas anteriores a 13/09/2026 estão infladas (ver nota abaixo). |
| `delegations/<usuario>@<maquina>.jsonl` | **sim (3.5.0)** | Uma linha por delegacao a executor externo (codex-cli / claude-cli / openrouter), com tokens e `cost_usd` — mesmo schema do antigo `harness-delegations.jsonl`, agora por dev/maquina. O teto diario do openrouter (`HARNESS_OPENROUTER_BUDGET_USD_DAY`) soma o arquivo DESTA maquina + o legado. |
| `duelos/<usuario>@<maquina>.jsonl` | **sim (3.5.0)** | Eventos do duelo de modelos (`duelo` / `veredito` / `aplicado` / `pool`) — mesmo schema do antigo `harness-duelos.jsonl`, por dev/maquina. O **placar** (roteamento do pool) le TODOS os arquivos + o legado: o placar e da equipe, nao da maquina. |
| `harness-delegations.jsonl` · `harness-duelos.jsonl` | legado (ate 3.4.34) | Formato compartilhado: um arquivo por projeto, dois devs apendando o mesmo fim de arquivo conflitavam em todo merge. Nao apague (historico); o painel, o placar e o teto leem legado + por dev. Nenhuma linha nova entra aqui desde a 3.5.0. |
| `transcripts*/` | **NUNCA** | Transcript cru de agente copiado a mao para analise. Pode carregar segredo/codigo, pesa MB, o painel nao le. `.gitignore` do mestre ja cobre; o doctor acusa se estiver no git. |
| `harness-runs.jsonl` | **nao** (local) | Historico legado por maquina (2.10.0 o tirou do git: o do core viajava para os clones no merge). Continua sendo escrito para compatibilidade; o dashboard le os dois e descarta linha cujo `projeto` nao e este repo. |
| `harness-dashboard-*.html/json` | nao | Saida do `/harness-report` — regeravel. |

Analise geral (todos os projetos irmaos): `node .claude/hooks/harness-dashboard.mjs --all --periodo=30d`.
Regras de leitura: `.claude/PLAYBOOK-TELEMETRIA.md`.

**Worktrees (3.4.23):** a linha gravada dentro de um worktree do harness (`<nome>--wt-<x>`) carrega
`projeto:"<nome>--wt-<x>"` e o arquivo ganha o sufixo `~<x>`. O dashboard NORMALIZA: entra no projeto
`<nome>` com o rótulo `worktree=<x>` (runs/, tasks/ e incidentes/). Até a 3.4.22 essas linhas eram
descartadas como "linhagem de clone" — as três execs mais pesadas de 03–04/09 não existiam no painel.

## Campos 3.4.23 da linha de run (schema continua `2.15.0` — só acrescenta)

Gravados pelo `harness-metrics.sh stop` em `runs/` e no `harness-runs.jsonl`. **Vazio = n/d, nunca zero.**

| Campo | Origem | Valores |
|---|---|---|
| `modo` | `--modo=` | `leve` \| `turbo` \| `noturno` \| `normal` (default quando a flag falta) |
| `limitou` | `--limitou=` | texto curto: o que limitou a run (`mutex`, `frentes`, `codex`, `humano`, …) |
| `review_modo` | `--review-modo=` | `dupla` \| `solo` \| `solo-2` \| `partes` |
| `codex` | `--codex=` | `ok` \| `indisponivel` |
| `stalls` | `--stalls=` | nº de agentes parados detectados pelo `agent-stall.sh` |
| `tasks_estouradas` | `--tasks-estouradas=`; **derivado** se ausente | nº de linhas de `tasks/<self>.jsonl` desta máquina com `ts` na janela da run e `dur_s` > `HARNESS_TASK_PREVISAO_MAX_MIN` (45 min) |
| `spawn_ms` | derivado | último `ms` de `~/.harness-run/spawn-history.jsonl` (o doctor mede a cada sessão) |
| `frentes` | derivado | ocupação do semáforo no fechamento, `N/M` (`node frentes.mjs status`, antes do release) |
| `perguntas` | medidor (`harness-metrics.mjs`) | nº de `tool_use` **AskUserQuestion** no transcript PRINCIPAL — separado de `permission_prompts` |
| `waits_invalidas` | medidor | linhas inválidas do `permission-waits.jsonl` ignoradas pelo parser tolerante (antes sumiam em silêncio) |
| `tokens_thinking_pct` | medidor (**3.5.3**) | % **estimado** de raciocínio invisível da sessão principal: `100 × (tokens_output − visíveis) / tokens_output`, onde visíveis = (chars dos blocos `text` + chars do JSON do `input` de cada `tool_use`) / 3,6. Os blocos `thinking` chegam vazios no transcript (só assinatura) — o raciocínio só aparece como diferença. Inteiro ≥ 0; vazio = não medido |
| `tokens_thinking_pct_subagents` | medidor (**3.5.3**) | o mesmo, sobre o conjunto dos subagentes da run (`<session>/subagents/*.jsonl`) |
| `vivos_max` | `--vivos-max=` (**3.5.3**) | maior número de executores vivos **ao mesmo tempo** na run, anotado pela skill. Obrigatório em run com tasks junto com `--limitou` (regra 1.3 item 6 da `/prd-exec`); sem os dois, o `stop` imprime ⚠️ "Paralelismo cego". Vazio = não anotado, nunca zero |

A linha de `tasks/` ganhou o campo `thinking_pct` (3.5.3) — mesmo cálculo, por transcript de subagente.

### 13/09/2026 — dedup por `message.id` (quebra de série em `tokens_*` e `turnos`)

Medido 12/09 na run `PRD-142-b-exec` do `dra-mariana-duarte`: no transcript do Claude Code **uma**
mensagem do assistente vira **várias** linhas `{"type":"assistant"}` — uma por bloco de conteúdo
(`thinking`, `text`, `tool_use`), todas com o **mesmo** `message.id` e com `usage.output_tokens`
**cumulativo** dentro da mensagem (a última linha traz o total). Os medidores somavam o usage de toda
linha e contavam cada linha como um turno:

| Medida | registrado (antes) | real (máximo por `message.id`) |
|---|---|---|
| `tokens_output` da sessão pai | 1.078.168 | 453.914 (**2,4×**) |
| `out_tps` | 56 | 24 |
| `turnos` da TASK-004 (`tasks/`) | 292 | 151 |
| `tokens_output_subagents` | 2.288.588 | 2.276.331 (~1×; a 1ª linha de cada id já traz quase o total) |

A partir de 13/09/2026 (`harness-metrics.mjs` e `task-telemetry.mjs`, 3.5.3) `tokens_output`,
`tokens_input`, `tokens_cache_read`, `tokens_total`, os `*_subagents`, `out_tps`/`out_tps_all` e o
`turnos`/`tokens_in`/`tokens_out` de `tasks/` são **por mensagem única** (por `message.id` fica a linha
de maior `output_tokens`; linha sem id soma como antes; turno = id único). **A série anterior está
inflada — ~2,4× na sessão pai e ~1× a 2× nos subagentes/tasks — e não é comparável cru** com a nova:
compare por `ts_end` ≥ 13/09/2026 ou divida a antiga pelo fator medido no seu projeto. O `schema`
continua `2.15.0` (nenhum campo renomeado; os três novos só acrescentam ao fim). As contagens de
ferramenta (`bash/read/grep/...`) e o `perguntas` **não** mudaram — cada `tool_use` é um bloco e já
aparecia uma vez só.

`HARNESS_METRICS_DERIVAR=0` pula as derivações (os campos passados por flag continuam). Os campos
livres (`modo`, `limitou`, `review_modo`, `codex`) são sanitizados (sem aspas/controle, ≤ 40 chars).
O `extra` livre continua existindo — o painel ainda lê `spawn=<ms>` de lá em linha anterior a este campo.

**Regras do painel que nasceram junto:** run com `elapsed_s` > 12 h é "suspeita" (fora de mediana/p90/top,
seção própria — `HARNESS_DASHBOARD_SUSPEITA_H`); duas linhas do mesmo projeto e label com `ts_end` a
≤ 60 s são a mesma run (`HARNESS_DASHBOARD_DEDUP_S`); rótulo sem número (`PRD-000-exec`, `PRD--exec`)
é recusado no `start` e no `metrics-auto`, que também deixou de sobrescrever marcador já existente.

---


`harness-runs.jsonl` acumula **uma linha por execução** de `/prd` e `/prd-exec` (geradas pelo
`.claude/hooks/harness-metrics.sh` no fim de cada comando). Serve para **comparar o processo ao
longo do tempo**: duração, volume (tasks / ciclos de review / subagentes), preset de esforço e
tokens.

Cada linha (schema 2.15.0 — a fonte de verdade é o `printf` do `harness-metrics.sh`):

```json
{"label","schema","platform","ts_start","ts_end","elapsed_s","elapsed_active_s","tasks",
 "ciclos","subagents","waves","preset","models","tokens_output","tokens_input",
 "tokens_cache_read","tokens_total","tokens_output_subagents","tokens_total_subagents",
 "out_tps","out_tps_all","max_gap_min","wait_human_min","wait_idle_min","wait_gap_min",
 "wait_gap_threshold_min","subagent_busy_min","subagent_measured","parallel_factor",
 "permission_prompts","classifier_denials","spiral_blocks",
 "achados_por_ciclo","linhas_por_task","min_hermes_e","min_hermes_c","turnos_hermes","min_gates",
 "modo","limitou","review_modo","codex","stalls","tasks_estouradas","spawn_ms","frentes",
 "perguntas","waits_invalidas","tokens_thinking_pct","tokens_thinking_pct_subagents","vivos_max"}
```

(os seis campos da 3.4.11, os dez da 3.4.23 e os três da 3.5.3 — tabela acima — só acrescentam;
nenhum campo foi renomeado ou removido desde a 2.12.0. **Atenção:** desde 13/09/2026 os `tokens_*`
e `out_tps*` são por mensagem única — ver a nota "dedup por `message.id`" acima.)

- **`tokens_output_subagents` / `tokens_total_subagents` / `out_tps_all`** (2.14.0): o
  `tokens_output` sempre mediu **só a sessão principal** — os transcripts de subagente ficam
  em `<session>/subagents/` e nunca entraram na conta. Medido na PRD-111: 489k na sessão
  contra **1,30M nos 23 subagentes** (custo real 3,65× o registrado). Os campos são separados
  de propósito, para não reescrever o significado do `tokens_output` no meio da série:
  **custo real = `tokens_output` + `tokens_output_subagents`**. Linha sem o campo = subagente
  **n/d**, nunca zero — e quanto maior o `subagents` da linha, mais o número registrado
  subestima.

- **`schema`** (2.12.0): carimbo de versão do formato — a **fronteira explícita**. Linha
  **sem** esse campo é pré-2.12.0 e **não é comparável** em espera/duração ativa (ver abaixo).
- **`wait_idle_min` / `wait_gap_min` / `subagent_busy_min` / `parallel_factor`** (2.12.0):
  quando a sessão despacha um subagente em background o turno encerra e o transcript
  principal silencia — indistinguível de operador ausente. Agora as janelas de trabalho dos
  subagentes são medidas (`<session>/subagents/agent-*.jsonl`) e o gap é classificado:
  `wait_idle_min` = gap **sem** ninguém vivo (a espera de verdade — a única descontada do
  `elapsed_active_s` e a única que dispara o aviso ⚠️); `wait_gap_min` = gap **com**
  subagente vivo (trabalho); `subagent_busy_min` = soma das durações;
  `parallel_factor` = `subagent_busy_min` / duração ativa (`< 1,3` com 10+ subagentes =
  execução serial — régua no `.claude/PLAYBOOK-TELEMETRIA.md`). `subagent_measured` é
  quantos subagentes o medidor achou (cruze com `subagents`, declarado pela skill).
  No host **Codex** não há transcript por subagente: `subagent_busy_min` sai vazio (n/d,
  nunca zero) e a espera de lá segue com a ambiguidade da 2.10.0.
- **`wait_human_min` mudou de significado na 2.12.0** — passou a valer a ociosidade real
  (igual a `wait_idle_min`). Em linha pré-2.12.0 ele soma ociosidade + espera de subagente.
- **`wait_gap_threshold_min`** (2.10.0): o limiar usado (`HARNESS_WAIT_GAP_MIN`, default
  10 min) para um gap do transcript virar janela de espera. Em linha antiga sem ele,
  `elapsed_active_s` NÃO descontava sessão deixada aberta (só prompt de permissão);
  desconfie da duração se `max_gap_min > 30`.

- **`platform`** (2.0.0): `claude` | `codex` — em qual runtime a execução rodou. **Não compare
  números entre plataformas** (modelos e medidores diferentes). No host Codex, tokens são
  best-effort sobre `~/.codex/sessions` (formato não documentado) — sem parse, vêm vazios (`n/d`);
  `wait_human_min`/`permission_prompts`/`classifier_denials`/`spiral_blocks` são sinais do host
  Claude e no Codex vêm vazios.
- Linhas antigas (pré-1.8.0/2.0.0) não têm os campos novos — histórico misto é esperado
  (ver `.claude/PLAYBOOK-TELEMETRIA.md`).

- **`tokens_output`** é a melhor métrica única de custo/trabalho — o `cache_read` infla o
  `tokens_total` (leitura de cache custa ~10% do preço). Compare execuções pelo output.
- **`tokens_*` é best-effort:** medido lendo o transcript da sessão (Node puro, sem deps). Se o
  Node não estiver disponível ou o transcript não for localizado, vem vazio — duração e contadores
  continuam confiáveis.
- **NÃO versionar em projeto (política 2.10.0):** o histórico é **local por projeto**.
  Versionado, ele viaja no merge de upstream (`/propagar`) e em bootstrap por cópia de
  pasta — medido em 2026-08: 63,6% das linhas do `/harness-report --all` eram o histórico
  do core Taurus replicado em 6 projetos (5 clones byte-idênticos + doce-ana, que nasceu
  de `cp -r` e carregava 124 registros alheios com zero próprios). Adicione
  `prds/_metrics/harness-runs.jsonl` ao `.gitignore` do projeto (o `harness-doctor.sh`
  cobra isso; o `/harness-report` ainda deduplica por segurança). Exceção consciente: a
  cópia-mestre no vault, que não é base de fork/cópia. Não há PII — só números de processo.

Análise rápida (com `jq`):

```bash
# duração e output por execução
cat prds/_metrics/harness-runs.jsonl | jq -r '[.label, .elapsed_s, .tokens_output, .preset] | @tsv'

# média de output por preset
cat prds/_metrics/harness-runs.jsonl | jq -s 'group_by(.preset)[] | {preset: .[0].preset, n: length}'
```
