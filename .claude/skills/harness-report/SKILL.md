---
name: harness-report
description: "Relatorio comparativo da telemetria do harness — roda o agregador harness-dashboard.mjs (HTML com graficos + JSON) e escreve a leitura: duracao, tokens, ciclos, espera humana, paralelismo e custo POR AGENTE/MODELO por execucao (e por projeto, com --all), apontando regressoes. Use quinzenalmente ou quando quiserem saber 'quanto custam as PRDs', 'o harness esta lento?', 'qual agente/projeto esta lento?', 'compara as execucoes', 'abre o dashboard da telemetria'."
---

# Harness Report — telemetria comparativa

Le o historico `prds/_metrics/harness-runs.jsonl` (gravado automaticamente pelo
`harness-metrics.sh` em toda `/prd`, `/prd-exec`, `/dt-exec` e `/mockup`) e produz um relatorio
comparativo que responde: **quanto custa uma PRD aqui, estamos regredindo — e ONDE (projeto,
agente, fluxo)?**

> As execucoes de maquete entram com o rotulo `MOCKUP-<slug>` (2.9.0) — separe-as das PRDs ao
> comparar custo: sao subagentes Sonnet curtos, e misturar as duas curvas distorce a media.

> **Por que existe (2.5.0):** a telemetria por-execucao ja era gravada, mas ninguem olhava o
> agregado — a degradacao de 2026-07 (PRDs a 2-3h) so foi vista quando doeu. Este relatorio,
> rodado mensalmente, teria mostrado a curva subindo semanas antes.

> **3.1.0 — o agregador e um script, nao o modelo.** Ate a 3.0.x cada rodada agregava o jsonl
> "na mao" (scripts ad-hoc, caro e nao reprodutivel) e a pergunta "qual agente esta lento?" nao
> tinha resposta. Agora `.claude/hooks/harness-dashboard.mjs` faz TODA a conta (Node puro, ~4 s
> para 100 execucoes) e devolve HTML + JSON; o seu trabalho e **ler o JSON e escrever a leitura**
> (o que os numeros significam, o que investigar). Numero fora do JSON = numero inventado.

## Uso

```
/harness-report                 # projeto atual, ultimos 30 dias (dashboard + markdown)
/harness-report --periodo=90d   # janela maior  (ou --de=AAAA-MM-DD --ate=AAAA-MM-DD)
/harness-report --all           # TODOS os projetos irmaos (rodar de qualquer repo/vault)
/harness-report --all --html    # aceito por compatibilidade: o HTML SEMPRE e gerado desde a 3.1.0
/harness-report --sem-transcripts   # so o jsonl (pula ~/.claude/projects; secao por agente n/d)
```

## Passo 0 — Rodar o agregador (3.1.0)

```
node .claude/hooks/harness-dashboard.mjs [--all] [--periodo=Nd | --de=... --ate=...] [--sem-transcripts]
```

- Sem `--all`: so o projeto atual; saida em `prds/_metrics/harness-dashboard-<de>_<ate>.html`
  + `.json`. Com `--all`: varre os irmaos sob a pasta-pai (`HARNESS_DASHBOARD_BASE` no
  `harness.env`, default = pai do repo). Rodado do vault (sem `prds/`), passe
  `--out=projetos/referencias/harness/docs/relatorios`.
- O script ja aplica **tudo** o que os Passos 1-3 abaixo descrevem (dedup, fronteira de schema,
  duracao confiavel, custo real, executor separado, reguas de alerta) — os passos ficam aqui
  como a **especificacao** do que ele calcula e como fallback (Node ausente ⇒ faca na mao,
  declarando isso no topo do relatorio).
- **Abra o HTML** para o humano (caminho no chat; se houver preview, mostre) e **leia o
  `.json`** para escrever o Passo 4. O JSON traz: `geral`/`geralAnt`, `porGrupo`/`porGrupoAnt`,
  `porProjeto`, `dias`, `porAgente`, `porModelo`, `agProj` (agente × projeto com a razao contra a
  mediana global do agente), `executores`, `alertas` (ja com nivel/tipo/regua), `topCaras`, `runs`.
- **3.4.23 — novas chaves do JSON e regras que o agregador ja aplica:**
  - `porDev` (uma entrada por `maquina` user@host; fallback `autor`; `n/d` = historico local
    pre-3.2.2, nao e um dev) e `porVersao` (mesmo corte por `harness`): f1/f2/exec medianos,
    prompts (total · por run), `perguntas` (AskUserQuestion, separado dos prompts), negacoes,
    preset/review/modo mais usados, codex ok/indisponivel, spawn mediano, stalls, tasks acima
    do envelope, suspeitas, execs em worktree. E a tabela por dev do relatorio — **compare devs
    na MESMA versao e no mesmo grupo**; diferenca de maquina (spawn) e de preset explicam antes
    do modelo.
  - `suspeitas`: runs com `elapsed_s` > 12 h, FORA de toda mediana/p90/top (secao propria no
    HTML). Cite-as como "marcador esquecido / sessao aberta", nunca como custo.
  - `metodo.removidas` inclui a dedup por **mesmo label + `ts_end` a ≤ 60 s** (auto-start +
    start manual). Worktrees `<nome>--wt-<x>` ja entram no projeto `<nome>` (`runs[].worktree`).
  - `incidentes` (`n`, `porTipo`, `porPapel`, `porDev`, `ultimos`) de
    `prds/_metrics/incidentes/*.jsonl`: `overrun` / `folego` / `frentes` e, desde a 3.5.0, `denied`
    (classificador negou), `stall` (agente mudo), `pergunta` (AskUserQuestion negada em modo autonomo)
    e `leitura` (leitura via Bash negada). Secao propria no
    relatorio quando `n > 0`: "papel X estourou o folego N vezes — teto baixo ou task grande?".
  - `cobertura` (so `--all`): `repos[]` (versao, branch, ultimo run, devs, runs14d, `abertas[]`)
    e `devs[]` (repos, silencio em dias, prompts/negacoes por run). Relate **repo com harness e
    zero runs** e **run aberta** como achados de controle. O stdout tambem imprime uma linha
    `COBERTURA|<repo>|<versao>|<branch>|<ultimo run>|<devs>|<runs14d>|<aberta?>` por repo (o
    `/prometeu --check` reaproveita).
  - `duelosPorModelo[].custoPorAplicado` (custo ÷ diffs aplicados com ok — `null` = pagou por
    nada) e `candidatoSair`/`motivoSair` (regua: ≥ 5 duelos e < 20% vitorias, ou > 40%
    inaplicavel). Use no "vale a pena?" do duelo.
  - `tree_tocado=SIM` em delegacao read-only vira alerta 🟠 "investigar" (fingerprint = git
    status + diff --stat; pode ser index refresh), nao 🔴.
- **Secao por agente/modelo** (a novidade): vem dos transcripts do Claude Code — a duracao de um
  agente e primeiro→ultimo timestamp do transcript dele (inclui espera de ferramenta/permissao
  dentro do subagente) e os tokens sao a soma do `usage.output_tokens`. Chamada sincrona sem
  transcript usa `totalDurationMs`. Sem `~/.claude/projects` acessivel a secao sai **n/d**
  (nunca zero) — declare.

## Passo 1 — Coletar os dados (o que o agregador faz)

- **Modo local:** ler `prds/_metrics/harness-runs.jsonl` do repo atual. Ausente/vazio →
  informe "sem historico de telemetria neste projeto" e encerre.
- **Modo `--all`:** descobrir os irmaos a partir do diretorio pai do repo atual:
  `ls ../*/prds/_metrics/harness-runs.jsonl` (Glob). Cada arquivo = um projeto (o nome da
  pasta e o rotulo). Ignore silenciosamente os que nao tem.

Cada linha e um JSON com: `label` (PRD-NNN-fase1/fase2/-exec, LOTE-NNN), `schema`,
`platform`, `ts_start`/`ts_end` (epoch s), `elapsed_s`, `elapsed_active_s`, `tasks`,
`ciclos`, `subagents`, `waves`, `preset`, `models`, `tokens_output/input/cache_read/total`,
`tokens_output_subagents`, `tokens_total_subagents`, `out_tps`, `out_tps_all`, `max_gap_min`,
`wait_human_min`, `wait_idle_min`, `wait_gap_min`, `wait_gap_threshold_min`,
`subagent_busy_min`, `subagent_measured`, `parallel_factor`, `permission_prompts`,
`classifier_denials`, `spiral_blocks`. Campos novos podem vir `""` em linhas antigas —
trate ausencia como n/d, nunca como zero.

### Delegacoes a CLI externo (3.0.0) — a SEGUNDA conta

Se existir `prds/_metrics/delegations/*.jsonl` (3.5.0, por dev/maquina) ou o legado
`prds/_metrics/harness-delegations.jsonl`, leia-os tambem — o agregador ja soma os dois (mesmo modo local/`--all`;
ausente = o projeto nunca delegou, e nao ha nada a relatar). Uma linha por delegacao, com:
`ts`, `label`, `task`, `role`, `ciclo`, `host`, `executor`, `cli_version`, `model`, `status`,
`exit_code`, `duration_s`, `timeout_s`, `input_bytes`, `output_bytes`, `tokens_in`,
`tokens_out`, `tokens_reasoning`, `tokens_fonte`, `tree_tocado`.

> **NUNCA some tokens de executores diferentes num numero so.** Codex e Claude sao contas,
> quotas e precos distintos — um total combinado nao significa nada e induz a decisao errada
> (exatamente o erro que a regra "nao comparar numeros entre plataformas" do §10 do
> PLATAFORMAS.md ja evita para `platform`). Relate **por executor**, sempre.
>
> `tokens_fonte` diz se o numero foi **`medido`** (o executor reportou — caso do Codex, via
> evento `turn.completed.usage`) ou **`nao-reportado`** (sai `n/d`). Nao preencha `n/d` com
> estimativa: um numero inventado no relatorio de custo e pior que um buraco declarado.

No relatorio, uma secao propria quando houver delegacao:

```
## Delegacao externa
| Executor | Delegacoes | Sucesso | Falha/fallback | Tokens out | Tempo medio |
|---|---|---|---|---|---|
| codex-cli | 18 | 17 | 1 (timeout) | 42.310 (medido) | 34s |

- Papeis mais delegados: discovery-codigo (6), impacto (5), beholder (4)
- Trabalho que NAO consumiu a conta Claude: ~68% dos papeis read-only da /prd
- ⚠️ 1 delegacao com `tree_tocado=SIM` — investigar (read-only nao deveria escrever)
```

**Alertas proprios desta secao:** taxa de falha > 20% de um executor (config/ambiente quebrado,
nao azar); qualquer `tree_tocado=SIM` (violacao de read-only — investigar antes de confiar no
resultado); `output_bytes` medio subindo execucao a execucao (delegacao so economiza se o
retorno volta enxuto — relatorio gordo e relido pela sessao principal e come o ganho).

### Custo REAL = principal + subagentes (2.14.0) — a correcao que mais muda numero

Ate a 2.13.0 o `tokens_output` media **so a sessao principal** (os subagentes vivem em subpasta
do transcript e nunca foram somados). Medido na PRD-111: 489k na sessao contra **1,30M nos 23
subagentes** — custo real **3,65x** o registrado. Regras:

- **Custo de uma linha nova = `tokens_output` + `tokens_output_subagents`.** Use essa soma em
  toda comparacao de custo, mediana e "top 5 mais caras".
- **Linha antiga subestima na proporcao do numero de subagentes:** `/prd` e `/prd-exec` (10-25
  agentes) estavam MUITO subestimadas; `/dt-exec` de 1-2 agentes, quase certa. **Nao compare
  grupo com grupo em linha antiga** — a PRD parecia mais barata que o lote por artefato de
  medicao, nao por eficiencia.
- `out_tps_all` (principal + subagentes) e o throughput real; `out_tps` sozinho so serve para
  continuar a serie historica.

### Fronteira de versao do schema (2.12.0) — OBRIGATORIO declarar

O campo **`schema`** e o discriminador explicito. Linha **sem** ele e pre-2.12.0 e **NAO e
comparavel** com as novas em espera e duracao ativa: la, gap com subagente em background
contava como espera humana igual a operador ausente — uma execucao bem paralelizada com o
operador fora e uma execucao 100% serial produziam a MESMA linha. Regras:

- **Nunca some ou compare `wait_human_min` entre linha com e sem `schema`.** Reporte as
  duas populacoes separadas ou declare a ressalva no proprio numero.
- `parallel_factor` / `subagent_busy_min` so existem em linha nova — a mediana deles diz
  respeito so a essa populacao; declare o **n** ("fator sobre 6 de 41 execucoes").
- Tokens, ciclos, tasks, subagentes e contadores seguem comparaveis em todo o historico.
- No topo do relatorio, informe quantas linhas da janela sao pre e pos-`schema`.

Filtre pela janela (`--periodo`, default 30d): `ts_end >= agora - janela`.

### Passo 1.1 — Deduplicar (OBRIGATORIO no `--all`)

`harness-runs.jsonl` viajou versionado por merge de upstream (clones do Taurus) e por
copia de pasta (bootstrap de projeto novo) — ha arquivos inteiros que sao o historico de
OUTRO projeto (medido em 2026-08: 799 de 1.256 linhas, 63,6%, eram duplicatas; sem dedup
cada PRD do core conta 7x e as medianas globais viram as medianas do Taurus).

- **Chave de dedup:** `(label, ts_start, ts_end, tokens_output, elapsed_s)`. Duas linhas
  com a mesma chave sao a MESMA execucao fisica. **3.4.23:** tambem sao a mesma execucao duas
  linhas do mesmo projeto e label com `ts_end` a ≤ 60 s (auto-start + start manual; fica a de
  maior `elapsed_s`), e linha com `projeto:"<nome>--wt-<x>"` (worktree) pertence a `<nome>`.
- **Runs suspeitas (3.4.23):** `elapsed_s` > 12 h fica fora de mediana/p90/top — liste a parte.
- **Rotulo sem numero** (`PRD-000-exec`, `PRD--exec`) nao deveria mais existir em linha nova (o
  `start` recusa); em linha antiga, trate como `outros`.
- **Dono da execucao:** o projeto cujo arquivo tem o historico mais longo (mais linhas
  proprias) entre os que carregam a duplicata — na pratica, o core da linhagem. As copias
  nos outros projetos sao descartadas do agregado.
- **Reporte a dedup no relatorio** (linhas brutas → unicas → % removida), como nota
  metodologica no topo. Projeto cujas execucoes sejam TODAS copias de outro (zero proprias)
  deve aparecer como "sem execucoes proprias", nunca com os numeros herdados.
- No modo local (sem `--all`) a dedup por chave tambem vale (protege contra linha dobrada
  por retry), mas o caso grave e o `--all`.

## Passo 2 — Agregar (por tipo de execucao; por projeto no --all)

Classifique o `label` em: **criacao-f1** (`-fase1`), **criacao-f2** (`-fase2`),
**execucao** (`-exec`), **lote** (`LOTE-`), **outros**. Execucoes `MOCKUP-*` formam grupo
proprio, SEMPRE fora das medianas de PRD. Para cada grupo (e cada projeto):

- **n** execucoes · duracao **mediana e p90** (regra de confiabilidade abaixo);
- tokens de output (total e mediana) · `out_tps` mediano;
- ciclos de review medianos · subagentes medianos;
- espera OCIOSA somada (`wait_idle_min`; em linha antiga, `wait_human_min` com a ressalva
  da fronteira de schema) · negacoes do classificador somadas;
- **`parallel_factor` mediano** (so linhas com `schema`) — quanto trabalho de subagente
  coube em cada minuto de janela ativa.

### Regra de confiabilidade da DURACAO (2.10.0)

Ate a 2.9.0 o `elapsed_active_s` so descontava espera vista pelo notify.sh — sessao
deixada aberta (overnight) saia como "ativa" (82% dos runs medidos em 2026-08 tinham
`elapsed_active_s` identico ao bruto, com gaps de ate 14h). A mediana de duracao so pode
ser calculada sobre runs com duracao CONFIAVEL:

1. **Linha com `wait_gap_threshold_min` preenchido** (gravada pela telemetria >= 2.10.0):
   `elapsed_active_s` ja desconta gaps + notify mesclados → **use direto**.
2. **Linha antiga com `max_gap_min` preenchido:** confiavel so se `max_gap_min <= 30`;
   use `elapsed_active_s` (se presente) ou `elapsed_s`. Com `max_gap_min > 30`,
   **DESCARTE o run das medianas/p90 de duracao e de out_tps** (a duracao dele mede a
   ausencia do operador, nao o harness) — ele segue contando em tokens/ciclos/contadores.
3. **Linha antiga sem `max_gap_min`:** duracao nao verificavel → fora das medianas de
   duracao (n/d). Segue contando nas metricas limpas.

**Declare no relatorio** quantos runs entraram na mediana de duracao vs o total do grupo
(ex.: "duracao mediana sobre 38 de 85 execucoes — as demais tem gap > 30 min ou duracao
nao verificavel"). Tokens e ciclos NUNCA sao descartados por gap — sao as metricas limpas.

## Passo 3 — Detectar regressoes (o motivo do relatorio)

Sinalize com 🔴/🟠 toda execucao ou tendencia que estoure a regua:

| Sinal | Regua | Leitura |
|---|---|---|
| 🔴 Duracao ativa | execucao > 2x a mediana do grupo | gargalo novo ou task gigante |
| 🔴 Ciclos | > base do preset +1 | gates nao convergem (spec fraca?) — ver nota de unidade abaixo |
| 🟠 out_tps | < 30 com duracao > 10min **e** `subagent_busy_min` baixo/ausente | espera humana nao medida / prompt pendurado. Com subagente ocupando a parede, `out_tps` baixo e regime de execucao (o token sai fora do transcript principal) — nao alerte |
| 🟠 Espera humana | `wait_idle_min` > 30min num run | decolagem sem entrevista/allowlist |
| 🔴 Paralelismo | `parallel_factor` < 1,3 com `subagents >= 10` | execucao SERIAL — subagentes rodaram em fila. Aponte a fase suspeita (correcao da Fase 2 e a reincidente) e peca post-mortem |
| 🟠 Tokens output | run > 2x a mediana do grupo | documentacao/codigo duplicado voltando |
| 🟠 Tendencia | mediana da janela > 1.5x a mediana da janela anterior | degradacao progressiva |
| 🔴 Denials | `classifier_denials` > 0 recorrente | allowlist estreita faltando |

> **Unidade do campo `ciclos` (2.10.0):** a regua e POR GATE, mas linhas de fase2 gravadas antes
> da 2.10.0 registravam a SOMA dos gates (beholder 3 + michelangelo 5 = "8") — desconte antes de
> alertar: em linha antiga com dois gates, um `ciclos` de ate ~2x(base+1) pode ser normal. Desde a
> 2.10.0 o campo e o MAIOR ciclo entre os gates e o detalhe vai no `--extra`.

Compare tambem a janela atual com a **janela anterior de mesmo tamanho** (tendencia).

Reguas adicionais que o agregador ja aplica (3.1.0):

| Sinal | Regua | Leitura |
|---|---|---|
| 🟠 Agente lento | mediana do agente NUM projeto ≥ 2x a mediana global do mesmo agente (n ≥ 3) | o agente nao e lento — aquele projeto o deixa lento (Perfil, spec, lint, banco). Investigue o projeto, nao o modelo |
| 🟠 Harness velho | ≥ metade das execucoes do projeto na janela sem `schema` | o projeto rodou `harness-metrics.sh` pre-2.12.0 na maior parte do periodo — espera/duracao ativa nao confiaveis, custo de subagente n/d. Rode `/deus` (ou `/prometeu`) |

## Passo 4 — Relatorio (a LEITURA — o que o script nao faz)

Com o JSON aberto, monte o markdown (e apresente no chat). Cada numero citado deve existir no
JSON; o valor do relatorio esta na interpretacao e nas recomendacoes:

```
# Harness Report — <escopo> — <janela>

> Dashboard: <caminho do .html> · dados: <caminho do .json>

## Resumo
| Grupo | n | Duracao med (ativa) | p90 | Ciclos med | Tokens out med | Ociosidade total | Fator paralelo med (n) |
|---|---|---|---|---|---|---|---|

> Nota metodologica obrigatoria: <X> das <Y> linhas da janela tem `schema` (pos-2.12.0);
> as demais nao sao comparaveis em espera/duracao ativa. Duracao mediana sobre <n> confiaveis.

## Esta fluindo? (3 respostas curtas)
- **Geral:** <tokens/exec e duracao ativa vs janela anterior — melhorou/piorou e por que>
- **Projeto:** <quem concentra custo/tempo e se e volume (n) ou lentidao (mediana)>
- **Agente/fluxo:** <agente mais lento/caro; agente x projeto que destoa; modelo>

## Regressoes e alertas
- 🔴/🟠 <projeto> <label>: <sinal + numero + regua estourada>  (agrupe por tipo; nenhum = "✅")

## Tendencia vs janela anterior
- <grupo>: mediana <antes> → <agora> (<±%>)

## Por dev / maquina (3.4.23 — so quando ha `maquina` nas linhas)
| Dev · maquina | runs | versoes | f1 | f2 | exec (n) | prompts (tot · run) | perguntas | negacoes | preset | review | codex | spawn | suspeitas |
(compare na mesma versao; `n/d` = historico local sem dev — nao e uma pessoa)

## Cobertura (so --all)
- repos com harness e zero runs: <lista> · runs abertas: <repo · marcador · horas> · devs em silencio > 14 d: <lista>

## Incidentes (quando `incidentes.n > 0`)
- por tipo: overrun N · folego N · frentes N — papel/dev que concentra; leitura (teto baixo? task grande? maquina?)

## Placar interno por modelo (3.4.25 — `placarInterno` e `abGateC1` do JSON; so com tasks/*.jsonl)
| Papel | Modelo | n | Dur. med | Turnos med | Tok out med | PARCIAL % | c1: n · 🔴 med · 🔴 tot | c2+: n · 🔴 med | verif. sem prova % |
(modelo = familia REAL do transcript — `n/d` quando a linha veio sem `message.model`; revisores por ciclo,
executores com PARCIAL e, se a linha tiver `verif_sem_prova`, o % de relatorios sem prova)
- **A/B do gate c1 (item 13):** copie a `leitura` pronta de cada gate ("c1 em Sonnet acha X 🔴 vs Y em
  Opus em N/M criacoes ...") e diga se a regua fechou: n ≥ 5 de cada E 🔴 medianos do Sonnet < 60% do
  Opus = "reconsiderar o item 13" (recomende; NUNCA decida — e o Charles quem troca o preset)
- Regua do executor: modelo com n ≥ 5 e PARCIAL ≥ 30% no papel = investigar teto/packet ANTES de trocar
  de modelo (olhe `packet_kb`/`alvos` nas tasks acima do envelope)

## Top 5 execucoes mais caras
| Projeto | Label | Duracao ativa | Tokens out | Ciclos | Por que custou |

## Recomendacoes
- <2-4 bullets acionaveis: preset a ajustar, projeto a investigar, spec pattern a corrigir,
  projeto com harness velho a atualizar>
```

**Persistencia:** se `prds/` existe no repo atual, salve em
`prds/_metrics/harness-report-<AAAA-MM>.md` (sobrescreva o do mes) — o HTML/JSON do agregador
ja estao ao lado. No `--all` rodado do vault (sem `prds/`), salve junto da copia-mestre:
`projetos/referencias/harness/docs/relatorios/harness-report-<AAAA-MM>.md` (e passe
`--out` para la no Passo 0). O HTML e auto-contido (SVG inline, claro/escuro, sem libs) —
pode ser enviado como arquivo.

## Regras

- **Numeros medianos, nao medias** — um run pendurado de 4h distorce media, mediana nao.
- **Nunca conclua performance de modelo/preset a partir de duracao com espera humana** —
  e a regra do PLAYBOOK-TELEMETRIA; use `elapsed_active_s`/`out_tps` para separar.
- Historico misto (campos vazios em linhas antigas) e esperado — reporte "n/d", nao invente.
- Read-only sobre os projetos: este relatorio NUNCA edita nada fora do arquivo de saida.
