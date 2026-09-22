---
name: prd-exec
description: "Executa uma PRD existente em fases — pre-flight de safe-mode, implementacao em ondas (hefesto no backend, dedalo nas tasks de front), review dupla-cega, gate de UX, roadmap de teste manual e DTs. Use quando pedirem para executar/implementar uma PRD ja criada."
---

# PRD Execution Skill

Executa uma PRD completa do projeto, lendo os documentos e tasks na ordem correta e
implementando todas as alteracoes. Esta skill e **stack-agnostica**: todos os caminhos,
comandos e regras de negocio especificos vem do **Perfil do Projeto**
(`.claude/PERFIL-PROJETO.md`).

> **Multi-AI (2.0.0).** Esta skill roda em **Claude Code** e em **Codex**. No Codex, leia
> `.claude/PLATAFORMAS.md` ANTES de comecar — tabela de equivalencias: chamadas `Agent`
> (`subagent_type`) → subagentes nativos; as ondas da Fase 1.3 = delegacao paralela nativa;
> hooks e permissoes diferem por host. O pre-flight do Passo 0.2 (`--autonomia`) e
> especifico do host Claude — no Codex, substitua por conferir sandbox/approvals/rules
> (o doctor cobre isso na secao codex).

> **Modelo da sessao (recomendacao de custo).** A **execucao** e mecanica e roda em **Sonnet** sem
> perda — os `hefesto` ja sao Sonnet fixos. Rode esta skill numa janela **Sonnet** (especialmente os
> devs) e reserve **Opus** para a **criacao** da PRD (`/prd`, que faz julgamento). O **preset de
> esforco** do Perfil decide os modelos dos agentes automaticos (sherlock, reasoning do Codex); a
> sessao principal voce escolhe via `/model`/conta.

> **Telemetria (automatica DE VERDADE — 24/08).** O hook `harness-metrics-auto.sh` liga o
> cronometro sozinho no momento da invocacao (procure a linha `[metrics-auto] cronometro ...
> LIGADO` no contexto). So rode o start manual (`bash .claude/hooks/harness-metrics.sh start
> PRD-NNN-exec`) se essa linha NAO apareceu. (3.5.6/D1: o `start` de rotulo ja ligado MANTEM o
> marcador — `TELEMETRIA|mantido` — entao rodar por habito nao zera mais o cronometro; mesmo assim
> nao rode: a linha `[metrics-auto]` e a prova.) O **stop do fechamento continua obrigatorio**
> (com contadores REAIS) — o guard-stop cobra cronometro esquecido.

> **Fallback de agente e BARULHENTO, nunca silencioso (2.3.0).** Se QUALQUER chamada `Agent` desta
> skill falhar com `Agent type '<nome>' not found` (hefesto, sherlock, michelangelo, dedalo), o agente esta
> **invisivel ao host** (causa conhecida: arquivo com CRLF + `: ` na description — o doctor detecta):
> 1. **NAO re-tente o mesmo subagent_type** nas demais chamadas do run — falhou uma, falharam todas.
> 2. **AVISE o usuario IMEDIATAMENTE**, em bloco destacado: qual agente sumiu, que o fallback sera
>    `general-purpose` (modelo da sessao — mais caro/lento, sem o contrato do agente) e o conserto:
>    `bash .claude/harness-doctor.sh` + `dos2unix .claude/agents/*.md`.
> 3. **No fallback, cole o contrato**: abra o `.claude/agents/<nome>.md` e injete o corpo no prompt
>    do `general-purpose` — o que NAO pode se perder e o contrato, nao o nome do agente.
> 4. **Registre no Output** (`fallback: <nome> → general-purpose`) — a degradacao precisa aparecer
>    na telemetria, nao so no meio do log. Incidente real: 21-24/07/2026, execucoes 2-3h com
>    hefesto invisivel e ninguem avisado.

## Passo 0 — Carregar o Perfil do Projeto

**Antes de qualquer coisa**, leia `.claude/PERFIL-PROJETO.md`. Ele define:

- **CLI (ambiente local)** — interpretador e cliente de banco (validacao de ambiente, lint).
- **Banco de dados (teste local)** — comando de smoke test.
- **Testes E2E** — framework, diretorio de specs, comandos (spec unico / suite completa).
- **Integracoes com efeitos colaterais irreversiveis** — usado pela Fase 0 (Safe Mode).
- **Safe Mode** — flag, query de validacao, whitelist, como desbloquear.
- **Codex review** — pasta de relatorios, limite de ciclos.
- **Compatibilidade de producao** — restricoes de runtime a respeitar.
- **Timezone e datas de negocio** — regra critica de datas.
- **Estrutura de diretorios** — onde procurar/criar codigo; doc raiz de convencoes.
- **Armadilhas do projeto** — anti-patterns usados na triagem do Codex (Fase 2).

Se o Perfil nao existir, **pare** e peca ao usuario para copiar um de `perfis/` (ex:
`perfis/php-laragon.md`) para `.claude/PERFIL-PROJETO.md` e ajustar. Sem ele, esta skill
nao tem como saber os caminhos do projeto.

Tambem leia a **doc raiz de convencoes** indicada no Perfil (ex: `CLAUDE.md`), se existir.

### Passo 0.0.1 — Gate de FRESCOR do resumo (2.15.0, segundos)

Todo subagente desta execucao vai ler o **`.claude/PERFIL-RESUMO.md`**, nao o Perfil completo.
Resumo defasado e a pior falha do harness: **silenciosa e confiante** — 20 subagentes trabalham
sobre um fato que mudou e ninguem percebe. Rode antes de despachar qualquer um:

```bash
bash .claude/hooks/perfil-frescor.sh
```

| Veredito | O que fazer |
|---|---|
| `FRESCO` | siga (custo: milissegundos) |
| `DEFASADO` | **REGERE o resumo** a partir do Perfil atual (so as secoes que mudaram; o template esta na copia-mestre) e rode `bash .claude/hooks/perfil-frescor.sh --carimbar`. So entao despache subagente |
| `SEM-CARIMBO` | resumo anterior a 2.15.0: confira por alto se ainda bate com o Perfil, ajuste o que estiver velho e carimbe |
| `SEM-RESUMO` | Perfil pequeno: siga (os subagentes leem o Perfil inteiro). Perfil **> 20 KB**: gere o resumo agora — sem ele, cada subagente relê o Perfil inteiro a cada ciclo |
| `SEM-PERFIL` | ja tratado acima (pare) |

> **Isto NAO e poda.** Aqui voce so **regenera o destilado**; o `PERFIL-PROJETO.md` nao e
> editado nem encolhido no comeco de uma execucao — remover fato do Perfil e decisao com
> consequencia (a armadilha que "parece obsoleta" e justamente a que ninguem lembra, porque
> foi escrita depois que alguem se queimou). A **poda do Perfil** tem lugar proprio: e feita
> com PROVA, em lote e sob confirmacao, pelo `/deus`.

**Resolver o nivel de esforco.** Leia a secao **"Nivel de esforco (preset)"** do Perfil + a tabela
"Agentes do harness (modelos)". Resolva, para esta execucao (override explicito sempre vence o preset):

- **Modelo do sherlock** (Fase 2): preset → economico/equilibrado `sonnet`, maximo `opus`.
  > **Regra de refino (2.4.0): o modelo resolvido vale SO para o ciclo 1.** Nos **ciclos 2+**
  > o sherlock roda **sempre em `sonnet`** (default), mesmo que o preset/Perfil tenha resolvido
  > `opus` — ciclo 2+ confere correcoes pontuais do ciclo anterior, e refino, nao investigacao
  > aberta. Opt-out consciente: Perfil → "Modelo do sherlock nos ciclos de refino: opus".
- **Modelo do dedalo** (Fase 1, tasks de front; Fase 2.9, correcao de UX): preset →
  economico/equilibrado `sonnet`, maximo `opus`; override do Perfil vence.
- **Esforco da sessao — fase EXECUTAR (3.5.3; substitui a regra 3.4.25).** Esforco segue a FASE, nao o
  preset sozinho: a exec e envelope fechado (packet, contrato, invariantes) e roda em **`medium`**
  (economico/equilibrado) ou `high` (maximo); o Perfil ("Nivel de esforco" → "Esforco — fase executar")
  sobrescreve. Medido 12/09 (PRD-142-b): em `high`, 83% dos 2,28M tokens dos executores eram raciocinio
  herdado — 5h19 para 9 tasks. **Como aplicar (Passo 0):** rode `bash .claude/hooks/esforco.sh executar` —
  **3.5.5:** o hook descobre o esforco REAL sozinho (linha de comando do processo da sessao; `atual_origem=processo`),
  sem `get_session`; so se vier `atual=n/d` passe `--atual <effort>` lido de `mcp__ccd_session_mgmt__get_session`
  (`session_id: "self"`, campo `effort`).
  `ESFORCO|executar|alvo=X|atual=Y|AJUSTAR` → a pergunta entra na ENTREVISTA UNICA (0.3): *"Esforco: a
  fase executar pede X; a sessao esta em Y — ajuste com `/effort X` e responda 'ok', ou 'seguir em Y'"*;
  em modo autonomo/noturno nao pergunte: anuncie uma linha e siga (o drift vai para a telemetria —
  o stop grava `esforco=alvo/atual`). `ok`/`n/d` = siga.
  > **3.5.4 — tres regras duras (medido 14/09: a 139-b pulou este passo e a 143 chamou a ferramenta errada; as duas
  > rodaram em `medium` por troca manual e a telemetria gravou `high`):** (1) **NUNCA chame
  > `mcp__ccd_session_mgmt__set_session_effort` em si mesma** — o Desktop recusa (`session_id: "self"`) e custa um
  > prompt de permissao; quem troca e o usuario, com `/effort`. (2) Depois que o usuario responder `ok`, **releia**
  > `get_session self` e rode `esforco.sh executar --atual <valor novo>` de novo — o `esforco.env` tem de refletir o
  > esforco efetivo. (3) O `guard-agent` **nega o 1o hefesto/dedalo** sem `esforco.env` com `fase=executar` gravado
  > nesta decolagem (`HARNESS_GUARD_ESFORCO`); e o `stop` do fechamento leva `--esforco-final=<get_session self>`.
  Nao ha esforco por chamada Agent — o sherlock
  (e todo subagente) **herda o esforco da sessao**; onde a exec precisa de julgamento (sherlock ciclo 1)
  sobe o MODELO (`opus` no equilibrado, tabela do Perfil), nao o esforco. Nada de palavra-gatilho de
  thinking no prompt.
- **`fable` nos overrides** (3.4.25): `Modelo do <agente>: fable` = Fable 5.1 (custo 2x Opus) — passe
  `model: "fable"` na chamada como faria com `opus`; nunca vem de preset.
- **Limite de ciclos do Codex review** (Fase 2): preset → base economico 1, equilibrado 2,
  maximo 3 (**2.5.0**) + **escalada automatica de ate +1 ciclo** (so se o ultimo ciclo da base
  corrigiu bloqueante E ainda resta 🔴). Numero explicito no Perfil = limite duro, sem escalada.
- **Reasoning do Codex** (Fase 2): `HARNESS_CODEX_REASONING` (harness.env) vence; senao preset →
  economico `low`, equilibrado `medium`, maximo `high`.

Anuncie o preset resolvido ao usuario ao abrir a execucao (ex.: *"preset equilibrado · sherlock
sonnet · review ate 3 ciclos · reasoning medium"*).

## Passo 0.1 — Atualizar o repositorio antes de executar

> **Por que:** a Fase 1 **escreve codigo** no working tree. Implementar sobre uma base
> atras do remoto gera conflito no commit, retrabalho (reimplementar o que ja foi feito) e
> review (Fase 2) sobre um diff sujo de mudancas alheias. Trazer o repo pra ponta ANTES da
> Fase 0 garante que o safe-mode, a leitura da PRD e a implementacao operem sobre o codigo
> atual.

Na raiz do repo, antes da Fase 0 (mesma rotina segura de pull da `/prd` e `/dt`):

1. **Em execucao via CI/deploy** (working tree ja no commit-alvo, possivel detached HEAD):
   **pule** — o checkout do pipeline ja sincronizou. Mesma logica da Fase 0, que tambem nao
   dispara em producao.
2. **E repo git com remote?** `git rev-parse --is-inside-work-tree` + `git remote`. Sem git
   ou sem remote → pule e siga.
3. **`git status --porcelain`:**
   - **Limpo** → `git pull --ff-only` no branch atual; reporte `N commit(s) novo(s)` ou
     `repo ja atualizado`. Divergiu ou erro de rede/auth → **nao force**; registre a pendencia
     "sync: branch divergiu/offline" para a **Entrevista unica (Passo 0.3)**. **Pull que trouxe o
     harness (3.4.19):** `git diff --name-only ORIG_HEAD..HEAD -- .claude/harness.env
     .claude/skills/prd-exec/SKILL.md` com saida = esta sessao carregou a skill ANTERIOR ao pull —
     anuncie em 1 linha (*"harness X → Y chegou no pull; reabra `/prd-exec` numa sessao nova"*) e
     **PARE** antes de qualquer despacho.
   - **Sujo** (mudanca nao commitada — trabalho do dev em andamento) → **NAO** faca pull;
     rode `git fetch`, anote quantos commits atras esta e registre a pendencia "working tree
     sujo, N commits atras" para a **Entrevista unica (Passo 0.3)**. Nao pergunte aqui.

> Nunca `reset --hard` / `checkout .` / `clean` / merge automatico — so `--ff-only`, sem
> descartar nada do local. Isto roda **uma vez**, no inicio; nao confundir com o
> `git status --porcelain` da Fase 2.1, que inspeciona o diff DEPOIS da implementacao.

## Passo 0.1.1 — Worktree isolado e lock da PRD (3.4.0)

> **Por que.** Duas ou tres sessoes no mesmo checkout sujam o git uma da outra: o review ve
> diff alheio, o E2E quebra porque outra sessao mexeu no banco. Desde a 3.4.0 cada sessao
> paralela roda num **worktree proprio** (pasta irma `<repo>--wt-<rotulo>`, branch
> `wt/<rotulo>`, **banco clonado** e URL propria) — `bash .claude/hooks/harness-worktree.sh novo <rotulo>`.

1. **Descubra onde voce esta:** `bash .claude/hooks/harness-worktree.sh info` → `WT|rotulo|…`,
   `WT|db|…`, `WT|url|…`. Se `rotulo=principal` e `harness-worktree.sh lista` mostra **outro
   worktree ativo** deste repo, avise em uma linha: *"ha N worktrees ativos; para nao cruzar
   diffs, rode esta exec num worktree: `harness-worktree.sh novo prd-NNN`"* — e siga (nao pare).
2. **Num worktree, o banco e a URL sao os do `worktree.env`, nao os do Perfil.** Em 1.2
   (validacao de ambiente), no smoke e em todo comando E2E: troque o nome do banco do Perfil por
   `WT|db` e a base URL por `WT|url` (o hook ja gravou `.env` e o override de banco que o app
   le; os specs que leem `.env`/`E2E_*` pegam sozinhos). Nunca rode migration no banco do
   Perfil a partir de um worktree.
3. **Lock da PRD:** `bash .claude/hooks/harness-worktree.sh lock PRD-NNN` — `LOCK|ocupado|…`
   significa que outra sessao esta executando esta PRD: **pare e avise** (a unica parada nova
   desta versao, e ela evita duas execucoes do mesmo trabalho). No Output final, `unlock`.
4. **Ao terminar num worktree**, o Output inclui o fechamento sugerido:
   `bash .claude/hooks/harness-worktree.sh fechar <rotulo> --merge` (merge local na branch
   principal + DROP do banco clonado; push continua humano).

## Passo 0.2 — Pre-flight de autonomia (gate de decolagem)

> **Por que:** a execucao roda longos trechos sem supervisao (hefestos em paralelo, review em
> ciclos). O que pendura uma execucao nao-assistida NAO e modelo lento — e **prompt de
> permissao aguardando um humano que nao esta na tela**. Numa execucao real, UM comando Bash
> de subagent pendurado num prompt segurou a PRD inteira por 4h15 (73% do wall-clock). Este
> passo confere ANTES de decolar que os avisos e as permissoes estao no lugar.

Rode (rapido, read-only):

```bash
bash .claude/harness-doctor.sh --autonomia
```

- **Exit 0:** pronto — nada a levar para a entrevista.
- **Exit != 0 (avisos/faltas):** registre a pendencia "autonomia: <avisos do doctor>" para a
  **Entrevista unica (Passo 0.3)** — la o usuario decide se ajusta antes (allowlist de
  prefixo p/ os CLIs do Perfil no `settings.local.json`, wiring dos hooks `notify.sh`/
  `guard-bash.sh`/`denied.sh` no `settings.json`, `HARNESS_NOTIFY_CMD` no `harness.env`) ou se
  decola mesmo assim. A decisao e do usuario; **nao bloqueie sozinho**.
- **Se o doctor apontar allowlist estreita AUSENTE no `settings.json` (1.9.0):** inclua na
  mesma pendencia a oferta de gerar agora (`bash .claude/harness-doctor.sh --gen-allowlist` →
  revisar/colar o bloco `permissions.allow` no `.claude/settings.json`, SOB confirmacao, item a
  item). E o que mantem a execucao viva se o classificador de permissao do auto mode cair no
  meio da noite: regra estreita resolve ANTES do classificador; regra larga (`Bash(php:*)`) e
  SUSPENSA em auto mode e nao protege. A entrevista e o ultimo momento com humano presente.
- **Se a PRD tem trabalho de FRONT e o doctor apontar Playwright ausente/nao declarado
  (3.0.3):** e **gap de pre-flight**, nao descoberta da fase de verificacao. Leve para a
  entrevista como pendencia propria: "verificacao visual: <aviso do doctor>" + a oferta de
  instalar agora (`npm i -D @playwright/test && npx playwright install`) ou de preencher o
  campo **"Verificacao visual (agentes)"** do Perfil (secao Testes E2E). Sem Playwright, a
  Fase 2.9 nao produz evidencia — o gate de UX roda cego e o custo aparece **depois** de tudo
  implementado. Regra completa: **PLATAFORMAS.md §7**. A decisao continua sendo do usuario.

## Passo 0.3 — ENTREVISTA UNICA de decolagem (2.4.0 — o unico gate humano antes do fim)

> **Por que:** medicao real (29/07/2026, 35 sessoes): **37 paradas de AskUserQuestion no meio de
> execucoes, media de 8 min cada — ~5h de fluxo pendurado** esperando um humano que nao estava na
> tela. A cura: TODAS as decisoes que os gates do meio do fluxo precisariam pedir sao colhidas
> AGORA, numa unica pergunta em lote, enquanto o usuario esta presente. Depois disso a execucao
> roda AUTONOMA ate o Output final — os gates do meio consultam as decisoes desta entrevista em
> vez de parar.

Monte **UMA chamada `AskUserQuestion`** (no Codex: uma pergunta textual unica) com:

1. **Pendencias colhidas nos Passos 0.1/0.2** (so as que existirem): working tree sujo /
   branch divergido → seguir assim ou parar p/ commit?; avisos de autonomia do doctor →
   ajustar allowlist/hooks agora ou decolar assim?
2. **Tolerancia de review (gate 2.7):** *"Se o review dupla-cega esgotar os ciclos com
   bloqueantes restantes: (a) SEGUIR — aceita-los como DTs registrados na Fase 5 [default
   recomendado] ou (b) PARAR e me aguardar?"*
3. **Tolerancia de UX (gate 2.9.3):** *"Se o michelangelo achar 🔴 de UX nao-trivial: (a)
   aceitar e abrir DT [default recomendado] ou (b) PARAR e me aguardar?"* (pergunte so se a
   PRD tem UI).
4. **Manual vivo — SEM pergunta (3.4.8, decisao do Charles 31/08):** o manual vai SEMPRE
   para a fila (a cauda appenda 1 linha em `docs/manual/_fila.md`, custo ~zero) — este item
   NAO entra mais na entrevista. Quem decide "sem impacto de manual" e a propria `/manual`
   na absorcao (ela ja tem a regra); rodar "AGORA" so se o usuario pedir espontaneamente.
   Motivo: 3 opcoes em que a resposta era FILA em 100% dos casos = pergunta que so atrasava
   a decolagem.
5. **Escopo do run** (se ambiguidade real): range de tasks, algo a pular.
6. **Plano de custo (3.0.0)** — **uma LINHA a mais nesta mesma pergunta, nunca uma parada nova.**
   Levante o custo tipico deste projeto antes de montar a pergunta:

   ```bash
   bash .claude/hooks/harness-metrics.sh baseline PRD 5
   ```

   `BASELINE|<n>|<dur_med_min>|<out_med>|<subagentes_med>|<delegacoes_med>` vira:
   *"Orcamento: N tasks em M ondas, ~X subagentes, ~Y min (media das ultimas 5 execucoes deste
   projeto). Aprova?"* — e `BASELINE|0|sem-baseline|...` vira **"sem baseline (primeira execucao
   medida)"**. **Nunca invente numero.**
   **Contingencia (3.4.20):** acrescente *"+50% se um ciclo de review reabrir desenho"* — medido
   03/09 (PRD-012-b): o ciclo 1 trocou o desenho e a run fechou em 2x o envelope. Ao passar de
   **1,5x** do orcamento aprovado (subagentes OU tempo), anuncie em 1 linha (*"orcamento: 1,6x —
   motivo"*), registre `--extra="orcamento: 1,6x (<motivo>)"` no stop e SIGA — TURBO nao para.
   **Cronometro conferido (3.4.19):** na mesma chamada, `ls .claude/.harness-run/PRD-NNN-exec.json`
   (com o sufixo de fatia, se houver). Ausente → `bash .claude/hooks/harness-metrics.sh start
   PRD-NNN-exec` AGORA. O `harness-metrics-auto.sh` liga o cronometro no prompt, mas num prompt
   combinado ja leu outro numero (Caronte PRD-012, 02/09: `PRD-4610-exec.json`, exec inteira com
   duracao zero e o baseline seguinte "sem parede").
7. **Defaults declarados — modo autonomo (3.4.23, item 18).** Em `--noturno` (ou `HARNESS_MODO`
   no ambiente / TURBO NOTURNO da `/prd`) esta entrevista **NAO pergunta**: adote os defaults de
   cada item acima, registre-os no bloco "Decisoes de decolagem" e escreva o marcador de modo —
   `mkdir -p .claude/.harness-run && printf 'noturno\n' > .claude/.harness-run/modo` (TURBO:
   `turbo`). A partir dai o hook `guard-question.sh` **NEGA toda `AskUserQuestion`** (marcador
   vale por 12 h; ninguem apaga). Liste no mesmo bloco os defaults que valem quando surgir
   duvida no meio do run: **escopo → o menor; nome → o do glossario/Perfil; teste → `n/d
   (coberto pelo acceptance)`; tolerancia → SEGUIR + DT; ambiente → o do Perfil**. Toda duvida
   decidida assim vai para **"Decisoes pendentes"** do Output — o humano revisa de manha.

Regras:

- **Uma pergunta so.** Nunca fatie em rodadas. Sem pendencias e com defaults aceitos, a
  entrevista e uma confirmacao unica de 30 segundos.
- **Registre as decisoes** no inicio do run (bloco "Decisoes de decolagem" no chat) — os gates
  2.7 e 2.9.3 as consultam e **nao param** quando a decisao ja cobre o caso.
- Os gates que param SEMPRE, independente da entrevista: ABORT por safe-mode (Fase 0), falha
  nao-recuperavel de task (Fase 1) e >10 bloqueantes no ciclo 1 (2.4) — esses sao sinais de
  problema estrutural, nao de tolerancia.
- **Custo aprovado aqui vale para o run inteiro (3.0.0).** A unica reabertura por custo e o
  ESTOURO objetivo do envelope: review entrando no **ciclo 4+**, re-execucao completa de uma
  onda, **ou (3.4.7) o total de subagentes despachados passar de `HARNESS_ENVELOPE_FATOR` ×
  o baseline de subagentes** (fator default 2; sem baseline, teto absoluto de 40). O contador
  e objetivo — voce sabe quantos despachou. Estourou: UMA pergunta (o que estourou, quanto ja
  rodou, seguir/cortar/abortar). Fora disso, nao pergunte de novo — foi exatamente esse tipo
  de parada que a 2.4.0 matou. Anuncie o envelope na propria linha de orcamento: *"envelope:
  ate ~2× o baseline (N subagentes) sem reabrir"*.
- **ZERO PARADAS depois da decolagem (3.3.0 — S2).** Medido 15–22/08: 1.635 min de sessao
  parada esperando humano (PRD-096 palantir 412 + 507 min; PRD-032 aec-backend 492 min; PRD-122
  core 147 min) — e nenhuma dessas paradas era das tres excecoes acima. Regra: **toda pergunta
  que surgir no meio do run e respondida pelo default desta tabela, registrada no Output como
  "decisao automatica", e o run segue.** So pare no que a lista de excecoes acima nomeia.

  | Situacao no meio do run | Default automatico (registre, nao pergunte) |
  |---|---|
  | ambiguidade de spec numa task | implementar a leitura mais conservadora; anotar em "Desvios" |
  | executor pede confirmacao de ambiente/caminho | usar o Perfil; se o Perfil nao tem, `Nao verificado` + seguir |
  | lint/spec local falha apos correcao | 1 tentativa de correcao focada; persistiu → DT candidato (classe bug), seguir |
  | review esgotou ciclos com 🔴 | decisao de tolerancia da decolagem (default SEGUIR + DT) |
  | michelangelo 🔴 nao-trivial | decisao de tolerancia de UX da decolagem (default aceitar + DT) |
  | duelo `reprovado`/`indisponivel` | hefesto nativo, sem perguntar |
  | conflito de escrita entre executores | serializar por `[mutex]`; nunca perguntar qual vai primeiro |
  | classificador negou comando | protocolo do `denied.sh` (reformular 1×, senao caminho alternativo), nunca esperar humano |
  | checkpoint de 90/120 min | diagnostico + acao (encurtar caminho critico); a opcao (b)/(c) so se **> 3h** |

### Verbosidade (3.0.0) — quanto esta skill FALA durante a execucao

Leia `.claude/harness.env` → `HARNESS_VERBOSITY` (ausente = `conciso`). Vale para **todo** o
relato de progresso das Fases 1 a 5:

| Nivel | Durante a execucao | No fim |
|---|---|---|
| `normal` | relato por task e por ciclo, como ate a 2.16.1 | Output completo |
| `conciso` | **1 linha por onda** (`onda 2/3 ▸ 4 tasks ok`) e 1 por ciclo de review | Output completo |
| `minimo` | **1 linha por FASE** (`Fase 1 ▸ 11/11 tasks · Fase 2 ▸ review 0🔴`) | Output completo |

> **NUNCA silenciado, em nenhum nivel:** ABORT de safe-mode, task que falhou, bloqueante 🔴,
> revisor em modo solo, agente que nao existe (fallback), gate esgotado, e o Output final.
> **Concisao nao pode virar omissao** — o valor de um relato curto e o usuario confiar que, se
> algo aparecer, e porque importa. Os relatorios em disco (`codex-reviews/`, `REVIEW-*.md`,
> mensagens de commit) saem completos em qualquer nivel: encolhe o eco, nunca a auditoria.

## Uso

```
/prd-exec PRD-003
/prd-exec PRD-003 TASK-002
/prd-exec PRD-003 TASK-002..TASK-005
/prd-exec PRD-003 --noturno       # 3.4.23: MODO AUTONOMO — sem humano na tela; entrevista NAO
                                  #   pergunta (adota os defaults e registra), marcador de modo
                                  #   escrito, AskUserQuestion NEGADA pelo hook ate o Output
```

- Sem argumento de task: executa TODAS as tasks da PRD
- Com task unica: executa apenas aquela task
- Com range: executa do TASK-XXX ate TASK-YYY (inclusive)
- `--noturno`: modo autonomo (ver Passo 0.3, item 7). Vale tambem quando a `/prd` chamou em
  TURBO NOTURNO ou o `scripts/noturno.sh` disparou (`HARNESS_MODO` ja vem no ambiente).

## Procedimento de Execucao — 6 Fases (0 a 5)

| #   | Fase                                                | Pode pular?                                           |
|-----|-----------------------------------------------------|-------------------------------------------------------|
| 0   | Pre-flight Dev Safe Mode (gate de integracoes com efeito colateral) | Sim, se a PRD nao toca nenhuma integracao do Perfil, se o Perfil declara "Nenhuma", OU `HARNESS_SKIP_SAFE_MODE_PREFLIGHT=1` |
| 1   | **[A]** Implementacao em ondas (hefesto por task de backend, **dedalo** por task de front) + estabilizacao do tree | Nao   |
| 2   | **[B]** VALIDACAO EM PARALELO — acceptance central da PRD **+** dupla-cega (Codex + sherlock) **+** michelangelo, tudo na mesma mensagem | **Nao**\*                            |
| 2.9 | Triagem do relatorio de UX (o michelangelo ja rodou na onda B) | Sim, se a PRD nao tem trabalho de UI, OU `HARNESS_SKIP_MICHELANGELO=1` |
| 2.5/2.6 | **[C]** Triagem e correcoes em grupos disjuntos · **[D]** verificacao FOCADA (lint + specs afetados + review delta) | Nao |
| 3   | **[E]** Mensagem de commit sugerida                 | Nao                                                   |
| 4   | Roadmap de teste manual                             | Nao                                                   |
| 5   | Documentacao de DTs (issues deferidas)              | Nao\*\*                                               |

**O pipeline oficial (3.2.1)** — a mudanca em relacao a 3.2.0 e que o **acceptance da PRD deixou
de ser o fim da Fase 1 e passou a ser uma das trilhas da onda de validacao**:

```
[A] implementacao  ->  [B] acceptance + dupla-cega + UX  ->  [C] triagem e correcoes
                           (em PARALELO, todos read-only)          |
[E] fechamento  <-  [D] verificacao FOCADA (lint + specs afetados + review delta)
```

Por que: ate a 3.2.0 o acceptance rodava sozinho no fim da Fase 1 e so entao os revisores subiam
— duas esperas em serie por trabalho que nao depende um do outro. As tres trilhas da onda B sao
**read-only sobre a implementacao**, entao podem compartilhar a mesma janela. O preco e conhecido
e aceito: acceptance que reprova invalida o review daquele ciclo. Vale, porque acceptance reprovado
e a excecao, e a espera em serie era a regra.

> \* **Fase 2 nunca e pulada por conveniencia.** A revisao tem DOIS revisores independentes:
> o Codex CLI (externo) e o agente **sherlock** (Claude, do harness). Se o Codex estiver
> indisponivel (CLI ausente, sem OAuth), o review **NAO e pulado** — roda so o sherlock.
> A unica saida valida sem nenhum review: working tree limpo, ou ambos os bypasses
> explicitos (`HARNESS_SKIP_CODEX_REVIEW=1` + `HARNESS_SKIP_SHERLOCK=1`). Mesmo quando a
> implementacao "parece limpa" — rodar. Os revisores costumam pegar bugs P1 que passariam
> despercebidos, e modelos diferentes erram diferente.
>
> \*\* **Fase 5 sempre roda, mesmo que vazia.** Se nao houver DT a registrar, devolver
> explicitamente "Sem issues deferidas" no resumo — para deixar claro que a fase foi
> considerada e nao apenas omitida.

ABORT em qualquer fase devolve controle ao usuario com Status "Bloqueada — <motivo>".

### ESTADO CANONICO entre fases (3.4.9 — melhoria #3, compactacao de estado)

O transcript da sessao-pai COMPOE: tudo o que voce escreveu/recebeu e relido a cada turno
(PRD-132: 112M de tokens_total para 883k de output). A defesa estrutural: o estado vivo mora
num ARQUIVO, nao no historico.

- **Ao fechar cada fase**, reescreva `.claude/.harness-run/estado-PRD-NNN.md` (formato fixo,
  1 tela): fase atual e proxima; tabela de tasks (`TASK-NNN | status | executor | 1-linha`);
  decisoes de decolagem; duelo (ids e desfechos); ciclos de review usados e 🔴 abertos;
  pendencias; contadores para a telemetria (subagentes, vivos_max, geracoes).
- **Ao abrir cada fase**, leia o estado — ele e a fonte da situacao. **NUNCA re-derive do
  transcript** o que o estado ja tem (nao "relembre" relatorios antigos, nao recapitule ondas
  no chat: aponte o arquivo).
- **Bonus de resiliencia:** sessao caiu/compactou no meio → a retomada le o estado + os
  sumarios em `.harness-run/relatorios/` e continua sem re-executar nada.
- O arquivo e efemero (`.harness-run` e gitignored) e morre com o fechamento normal — o
  Output Esperado e quem registra o resultado final.
Fases 3 a 5 nao executam apos ABORT.

---

### Fase 0 — Pre-flight Dev Safe Mode (integracoes com efeito colateral)

> **Quando aplicar:** sempre, antes de qualquer leitura aprofundada de PRD/task — desde
> que o Perfil declare ao menos 1 integracao com efeito colateral irreversivel. Esta fase
> e **defensiva** e NAO depende da PRD escolhida.
>
> **Por que existe:** integracoes com efeito colateral (mandar WhatsApp/SMS/e-mail para
> cliente real, criar evento em calendario real, cobrar cartao) NAO podem ser desfeitas
> quando o ambiente local aponta para dados reais (ex: banco copia de producao). Um unico
> disparo acidental pode atingir milhares de pessoas reais.

#### 0.0 — Checar se ha integracoes no Perfil

Ler a secao **Integracoes com efeitos colaterais irreversiveis** do Perfil.

- Se diz **"Nenhuma"**: pular a Fase 0 inteira, silenciosamente, e ir para a Fase 1.
- Caso contrario: para cada integracao listada, capturar suas **Palavras-chave de
  deteccao** e seu **Helper/interceptor central**.

#### 0.1 — Detectar se a PRD toca alguma integracao

Apos resolver o caminho da PRD (Glob `prds/PRD-{numero}*`), grepar nos documentos da PRD
pelas palavras-chave de TODAS as integracoes do Perfil. Monte o regex a partir das
palavras-chave declaradas — exemplo (substitua pelas do seu Perfil):

```bash
grep -liE '<palavras-chave-da-integracao-1>|<palavras-chave-da-integracao-2>' prds/PRD-NNN-*/*.md
```

Categorizar os matches por integracao. Se nenhum match: pular Fase 0 silenciosamente e ir
para a Fase 1.

#### 0.2 — Detectar ambiente local

Usar o criterio definido no Perfil → **Safe Mode → "Como detectar ambiente local"**
(ex: baseURL contem `localhost`/`127.0.0.1`; existe `.env.local`; hostname nao e o servidor
de producao).

Em producao (deploy via CI), a Fase 0 nao dispara — a baseURL e remota e a PRD ja foi
validada antes do merge.

#### 0.3 — Validar safe mode

Em ambiente local + PRD toca alguma integracao, rodar a **Query de validacao** do Perfil →
**Safe Mode** via `Bash` tool (use o **Cliente de banco** do Perfil → CLI). Exemplo
generico (o comando real vem do Perfil):

```bash
<cliente-de-banco> <args> -e "<query-de-validacao-do-Perfil>"
```

Validar conforme o Perfil:

- **Flag de ativacao** (ex: `dev_safe_mode = '1'`) — se ausente, com valor "desligado", ou
  a query falha: **ABORT** com Status `Bloqueada — Safe mode inativo em local`. Devolver ao
  usuario o motivo + o **SQL pronto p/ desbloquear** do Perfil:
  > Esta PRD toca uma integracao com efeito colateral irreversivel, mas o safe mode esta
  > inativo no ambiente local. Risco: atingir dados/contatos reais.
  > Para desbloquear, rode o SQL indicado no Perfil → Safe Mode e re-rode `/prd-exec PRD-NNN`.
- **Whitelist** (se a integracao tocada exige — Perfil → Safe Mode → "Whitelist"): pelo
  menos 1 entrada valida (ex: 1 numero de teste com >=10 digitos). Se vazia e a integracao
  exige: ABORT com instrucao de popular a whitelist.
- Se a integracao tocada **nao** tem whitelist (basta a flag para bloquear tudo): basta a
  flag estar ativa.

Se todas as condicoes passam: print de confirmacao e seguir para a Fase 1.

Se a PRD toca uma integracao sem whitelist e a flag esta ativa, mas a whitelist de OUTRA
integracao (nao tocada) esta vazia: nao abortar — apenas avisar e prosseguir.

#### 0.4 — Bypass

`HARNESS_SKIP_SAFE_MODE_PREFLIGHT=1` pula a Fase 0. Uso restrito:

- Ambiente prod (deploy via CI — local nao detectado, fase ja nao dispara).
- Fluxos onde o usuario confirmou explicitamente que nao ha side effect real (ex: PRD que
  mexe so em mock/stub, com o helper de envio real substituido por stub).

Comando: `HARNESS_SKIP_SAFE_MODE_PREFLIGHT=1 /prd-exec PRD-NNN` (variavel exportada no shell
antes do comando).

#### 0.5 — Output esperado

```
## Fase 0 — Pre-flight Dev Safe Mode

- PRD-NNN toca: <integracao(oes)> (matches: <palavras-chave>)
- Ambiente local detectado: SIM
- <flag de ativacao> = ativa: OK
- Whitelist <integracao>: <N entradas / N/A>
- OK Pre-flight aprovado. Prosseguindo para Fase 1.
```

Se ABORT, NAO prosseguir para as Fases 1-5. Devolver controle ao usuario com Status
`Bloqueada — Safe mode inativo em local` + SQL pronto para colar (do Perfil).

---

### Fase 1 — Implementacao

Subdividida em 4 etapas: leitura, ambiente, execucao das tasks, verificacao final.

#### 1.1 — Leitura e Planejamento

1. **Resolver o caminho da PRD:**
   - Glob: `prds/PRD-{numero}*` para encontrar o diretorio
   - Se nao encontrar, abortar com mensagem clara
   - **Telemetria:** o cronometro ja foi ligado pelo hook `harness-metrics-auto.sh` na
     invocacao (linha `[metrics-auto]` no contexto). Se — e somente se — ela nao apareceu,
     ligue manualmente: `bash .claude/hooks/harness-metrics.sh start PRD-{numero}-exec`
   - **Identificar a sessao (rename sugerido):** ainda com o numero em maos, calcule o nome do
     repo — `basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"` — e monte o titulo
     `{repo}-Exec-PRD-{numero}`. **Exiba ao usuario, em um bloco de codigo destacado, o comando
     pronto para colar:** `/rename {repo}-Exec-PRD-{numero}` (ex: `/rename dr-thiago-couto-Exec-PRD-043`),
     com 1 linha dizendo que isso rotula a sessao na lista do `/resume`. E **apenas uma sugestao**: o
     Claude Code nao permite renomear a sessao via skill/hook no meio dela (so o proprio usuario, com
     `/rename`) — portanto **nao bloqueie** e siga para a leitura dos documentos tenha o usuario
     renomeado ou nao.

2. **Ler os documentos na ordem obrigatoria:**
   - **Doc raiz de convencoes** (Perfil → Estrutura → "Doc raiz de convencoes", ex:
     `CLAUDE.md`) — convencoes, stack, caminhos CLI, regras de integracoes
   - `PRD-XXX-*.md` (PRD de produto) — visao funcional, RFs
   - `PRD-TECNICA-XXX-*.md` (PRD tecnica) — implementacao detalhada
   - `PROMPT-EXECUCAO.md` — fases, dependencias, pontos criticos (se existir)

3. **Listar tasks e identificar dependencias:**
   - Glob: `tasks/TASK-*.md` dentro do diretorio da PRD
   - Ler metadados de cada task (campos "Depende de" e "Bloqueia")
   - Montar grafo de dependencias
   - Filtrar pelo range solicitado (se informado)

4. **Criar lista de tracking** (TaskCreate/TodoWrite) para cada TASK da PRD.

#### 1.2 — Validacao de Ambiente

Identificar ambiente ativo e confirmar antes de qualquer implementacao. Usar o
**Interpretador** e o **Cliente de banco** do Perfil → CLI, e o **Comando de smoke test**
do Perfil → Banco de dados. Exemplo generico (os comandos reais vem do Perfil):

```bash
<interpretador> -v                 # ex: php -v / node -v
<comando-de-smoke-test-do-Perfil>  # ex: <cliente> -u root -p<senha> <db> -e "SELECT 1;"
```

Se o projeto roda em mais de um SO, o Perfil lista os dois caminhos — use o ativo.

Se algum falhar, abortar imediatamente e pedir confirmacao do ambiente ao usuario.

#### 1.3 — Execucao das Tasks (PIPELINE por dependencia — 3.4.8; paralelo por default)

**Monte o GRAFO antes de executar** (1.1.3, campos "Depende de"/"Bloqueia" das tasks) — mas o
despacho **NAO e mais em ondas com barreira**: e uma **fila continua**. Medido (dashboard
20-24/08): execucoes com 16-27 subagentes disponiveis rodaram com paralelismo **1,3-1,8**, e a
PRD-123-exec fez 9 tasks em **7 "ondas"** — a barreira fazia toda task pronta esperar a irma
mais lenta da geracao (waitGap de 45-76 min por run so de orquestrador olhando agente).

**A mecanica do pipeline:**

1. **Despacho inicial:** dispare, numa unica mensagem, TODAS as tasks liberadas (sem
   `[requires]`/`[barrier]` pendente, respeitando `[mutex]`) — ate o teto de executores vivos
   que o `carga-maquina.sh` imprimiu em **`CARGA|vivos|N`** (3.5.3 — a linha sai SEMPRE):
   **6** com a maquina folgada (0-1 outra frente e spawn ok — `HARNESS_PIPELINE_MAX_VIVOS_FOLGADO`),
   **4** com 2+ frentes (piso `HARNESS_PIPELINE_MAX_VIVOS`; protege das rajadas 429/529 medidas
   25/08), **2** com spawn LENTO. Medido 12/09 (PRD-142-b): 5 tasks liberadas na onda 1, teto 4,
   `CARGA|baixa`, spawn 320 ms — a TASK-006 esperou 43 min por vaga e virou cauda serial de 45 min.
2. **A cada RETORNO de executor, no MESMO turno:** (a) processe o relatorio (verificacao da
   task, watchdog/PARCIAL-TEMPO); (b) recalcule o que aquele fechamento LIBEROU no grafo;
   (c) **despache imediatamente** as tasks recem-liberadas (com packet/duelo como sempre),
   ate voltar ao teto de vivos. Task pronta NUNCA espera "a onda fechar" — ela espera no
   maximo uma vaga no teto.
   **PARCIAL tambem libera e tambem NAO e seu (3.5.3).** Relatorio ⚠️ PARCIAL / PARCIAL-TEMPO com
   o codigo de producao pronto e o que falta declarado: (a) o que a task produz para o grafo ja
   esta produzido — os `[requires]` dela sobem AGORA, no mesmo turno; (b) a complementacao vai a
   um executor NOVO do mesmo papel, na MESMA mensagem dos dependentes, com prompt *"continue a
   TASK-00X a partir do relatorio em `<rel>`; nao refaca o que esta feito; falta: <lista do
   relatorio>"* — nunca a sessao pai. Medido 12/09 (PRD-142-b): 3 tasks voltaram PARCIAL no folego,
   a pai completou 002 e 004 sozinha por 30 min com 0 subagente vivo e segurou 005/007 (liberadas
   havia 30-50 min) ate terminar.
3. **[mutex] e escalonamento, nao ordem:** a segunda task do par sobe assim que a primeira
   devolve o recurso — dentro do fluxo continuo, sem geracao nova.
4. **Barreiras REAIS que permanecem:** `[barrier]` declarada (condicao de seguranca), a
   **estabilizacao 1.4** (fim da onda A: TODAS as work tasks fechadas antes da validacao) e a
   propria onda B (Fase 2) — a validacao exige o tree parado; isso nao muda.
5. **Anuncie o plano** antes do 1o despacho (ex.: *"pipeline: 4 tasks liberadas ja, 5 na fila
   por dependencia, teto 4 vivos"*) e registre na telemetria `--waves=` o numero de **geracoes
   de despacho** que de fato houve (compatibilidade com o historico).
6. **Telemetria do pipeline (3.4.9 — melhoria #9): sem medir, nao ha como tunar.** Anote
   durante a fase o MAIOR numero de executores vivos ao mesmo tempo e o que limitou o
   paralelismo, e grave no stop como CAMPOS proprios (3.5.3 — antes iam soltos no `extra` e a
   PRD-142-b fechou com os dois vazios): `--vivos-max=N --limitou=<dependencias|duelo|teto|tasks-curtas|parcial-folego>`.
   Run com tasks e sem esses dois campos: o stop imprime ⚠️ "leitura de paralelismo cega".
   Regra de leitura: `vivos_max` nunca chegou ao teto = o gargalo NAO e o knob
   `HARNESS_PIPELINE_MAX_VIVOS`; e o grafo (dependencias) ou o funil do duelo.

> **Spawn lento = paralelismo menor (3.4.12; recalibrado 3.4.18).** O `carga-maquina.sh` imprime
> `CARGA|spawn|<ms>|ok|LENTO` (custo de criar um processo nesta máquina, agora) e **sempre**
> (3.5.3) `CARGA|vivos|N` — 2 quando LENTO (> `HARNESS_SPAWN_LENTO_MS`, default 1000), 6 com a
> máquina folgada, 4 com 2+ frentes. Obedeça: nesta execução o teto de vivos é o N impresso; com
> LENTO os revisores da onda B sobem em par mas as correções em no máximo 2 agentes, e registre
> `spawn=<ms>` no `--extra` do `stop`. **O número de frentes
> NÃO reduz executores** (3.4.18): medido 02/09, duas execs + uma sessão de análise rodaram a
> tarde inteira com spawn de 0,15–0,8 s e Bash mediano de 4–9 s — a PRD-135 cortou para 2 vivos
> por "3 frentes" com a máquina folgada. A partir de **4 frentes** o script só ALERTA (rate limit
> por minuto da conta); a decisão de segurar é sua e anunciada, nunca automática.

**Sequencial e a EXCECAO, nunca o default**: so espera quem tem dependencia REAL declarada.
Execucao sequencial de tasks independentes ja custou **~2h extras** numa PRD real de 13 tasks.

> **A task de ACCEPTANCE nao vai para hefesto (2.4.0) e nao roda na onda A (3.2.1).** Ela e
> executada **diretamente pela sessao pai**, na onda B (Fase 2), junto com os revisores. Motivo
> medido: os 4 maiores spawns de hefesto da telemetria (51-85 min cada) eram acceptance gates, e
> o resultado deles era **descartado** — a familia so vale rodada pela pai, com o tree
> estabilizado, uma vez (Contrato de Testes). A task de acceptance **sai do grafo de ondas**;
> escrever os specs novos (se a task manda criar) pode ir a hefesto na onda anterior, mas a
> EXECUCAO da familia e da sessao pai, uma vez so.
>
> **A ULTIMA task (doc raiz + DT INDEX + Perfil) tambem e da SESSAO PAI (3.4.20).** Ela e
> contexto puro: quem viveu a execucao escreve o digest em 3 min; um hefesto novo precisa
> reconstruir tudo e, medido 03/09 (PRD-137), travou 10 min no watchdog e a pai fez sozinha.
> Nao despache; execute-a no fim da onda A (1.4), antes de abrir a onda B.

> **Task de FRONT vai para o dedalo, nao para o hefesto (2.9.0).** Antes de montar a onda,
> classifique cada task: metadado **`Tipo: front`** → `subagent_type: "dedalo"` (Modo O); `backend`
> ou ausente → `hefesto`. Bypass consciente: `HARNESS_SKIP_DEDALO=1` manda tudo para o hefesto
> (comportamento 2.8.0) — registre no Output quando usar. **Sem o campo** (PRD anterior a 2.9.0), decida pelos arquivos que a task
> cita: view/template/componente/`.css`/`.js` de tela ⇒ front. Por que separar — o hefesto e fiel ao
> desenho **por contrato** ("sua virtude nao e criatividade"); quando o desenho tem lacuna de UX
> (estado que ninguem especificou, contraste que ninguem calculou), ele forja a lacuna com
> fidelidade. O dedalo carrega o mesmo contrato de execucao **mais** o julgamento de front.
> Anuncie a divisao no plano de ondas (ex.: *"onda 1: TASK-001 (hefesto), TASK-002 (dedalo — front)"*).

> **Task com `Duelo: sim` vai para DUELO antes do executor (3.3.0 — S8; recalibrado 3.4.5).**
> Em task de PRD **so `sim` explicito duela** — `auto` vai DIRETO ao executor (medido
> 26-27/08: em task de PRD o themis reprovou ate pares de diffs aplicaveis, nota maxima
> 4,5 — o duelo virava pedagio; em DT de LOTE mecanico ele aprova e ganha 3-10x em tempo,
> e la segue valendo `auto`). `sim` vale para **hefesto E dedalo**, mesmo com 4+ arquivos;
> exclusoes duras apenas migration e `[barrier]`. O guard-agent NEGA o despacho de task
> `sim` sem o duelo ter rodado (knob: HARNESS_DUELO_PRD). Rode, na mesma mensagem que
> despacha os outros executores da onda:
>
> ```bash
> bash .claude/hooks/harness-duelo.sh --task prds/PRD-NNN-*/tasks/TASK-00X-*.md --label PRD-NNN
> ```
>
> Dois workers baratos (OpenRouter, rodizio do pool `HARNESS_DUELO_MODELS`) escrevem a task a
> partir do **task packet** (contrato + PERFIL-RESUMO + componente referenciado + arquivos-alvo)
> e devolvem um diff cada. Leia a linha `DUELO|<status>|<id>|<vencedor>|<diff>|<pasta>`:
>
> | status | o que fazer |
> |---|---|
> | `julgar` | juiz = **themis** (default, Sonnet na assinatura): dispare o agente `themis` com o `prompt-juiz.md` da pasta; ele devolve JSON; registre `bash .claude/hooks/harness-duelo.sh --veredito <id> --vencedor A\|B\|nenhum --nota-a N --nota-b N --motivo "..."` |
> | `ok` | ha vencedor: despache o **hefesto** com a instrucao *"aplique `git apply --recount --ignore-whitespace <diff>`; rode lint + o menor spec local; corrija so o que quebrar; verifique os itens de `testar` do juiz"* — e registre `--aplicado <id> --resultado ok\|falhou` ao receber o relatorio |
> | `reprovado` / `desligado` / `indisponivel` / `erro` | **fluxo nativo normal** (hefesto escreve do zero) — registre no Output `duelo: <status>` |
>
> **Task que CRIA arquivo nao duela (3.4.19):** o script devolve `DUELO|desligado|<id>||arquivo-novo`
> quando um arquivo-alvo citado nao existe no repo — o worker barato nao converte criacao em diff
> (PRD-135, TASK-003: vencedor "aplicou" com 3 de 4 endpoints chamando metodos inexistentes). Vai
> direto ao executor; registre `duelo: desligado (arquivo novo)`.
>
> **DUELOS EM PARALELO ENTRE SI (3.4.9 — melhoria #1 do pacote de otimizacao).** Medido na
> PRD-132: cada duelo rodava inteiro na sessao-pai antes do proximo (vereditos as 12:24,
> 13:01, 13:04, 13:33...) e o parallel_factor desabou a 1,06. Regra: quando a geracao tem
> **2+ tasks elegiveis a duelo**, dispare TODOS os `harness-duelo.sh` na MESMA mensagem
> (chamadas Bash independentes rodam em paralelo; cada duelo ja isola pasta/ID proprio) e,
> na volta, julgue os `julgar` com **N agentes themis na mesma mensagem** (um por duelo).
> So depois despache os aplicadores/executores da geracao. Nunca duele em fila indiana.
>
> **Aplicador ENXUTO (3.4.9 — melhoria #6).** Vencedor definido: o hefesto/dedalo de
> aplicacao recebe SO — o caminho do diff vencedor, os itens `testar` do juiz e o comando de
> lint/spec local. **NAO mande ler o task-packet nem a PRD** (o contrato ja foi julgado; na
> PRD-132 cada aplicacao pagou um packet de 300KB a toa). Prompt-modelo: *"Aplique
> `git apply <diff>` (fallback `--recount --ignore-whitespace`), rode `<lint>` e o menor spec
> local, verifique: <itens do juiz>. Corrija apenas o que quebrar. Relatorio padrao."*
>
> O duelo **nao substitui gate nenhum**: acceptance, dupla-cega e UX seguem iguais na onda B.
> Ele substitui o tempo de **escrita** do hefesto em task mecanica (medido 22/08: workers em
> 5–14 s, US$ 0,001–0,005 cada; juiz externo US$ 0,015 — por isso o themis e o default).
> Kill switch: `HARNESS_SKIP_DUELO=1` ou `HARNESS_DUELO='off'`. Sem `OPENROUTER_API_KEY` na
> maquina o hook devolve `desligado` em silencio — o dev sem chave nao sente nada.
> **NUNCA cheque a disponibilidade voce mesmo** (grep/cat por `OPENROUTER_API_KEY` em
> `harness.env` ou em qualquer arquivo): a chave mora no AMBIENTE ou em `~/.harness.env.local`
> da maquina e e invisivel para voce. Quem decide se o duelo esta vivo e a propria cadeia
> `harness-duelo.sh`/guard-agent, que sourceia os arquivos certos — despache e obedeca a
> resposta (`desligado` = siga nativo). Medido 24/08 (PRD-127): a sessao grepou o arquivo
> errado, concluiu "sem chave" e pulou um duelo que estava disponivel.
> **Telemetria:** cada duelo/veredito/aplicacao entra em `prds/_metrics/duelos/<dev>@<host>.jsonl`
> (3.5.0 — por dev/maquina, o `stop` faz `git add`; o antigo `harness-duelos.jsonl` e historico) — e dai que
> o `/harness-report` mostra **vitorias, reprovacoes e custo por modelo**.

> **TASK PACKET para TODO executor (3.3.0 — S3).** Medido 15–22/08: tokens por `/prd-exec`
> dobraram (1,02M → 2,04M; PRD-123: 3,55M), hefesto 84k e dedalo 121k por chamada — quase tudo
> releitura de Perfil inteiro e PRD inteira por subagente. Antes de despachar hefesto/dedalo,
> monte o packet: `bash .claude/hooks/task-packet.sh <TASK-00X.md>` →
> `PACKET|<arquivo>|<alvos>|<n>|<bytes>`. O prompt do executor passa a ser: *"Seu contexto
> inteiro esta em `<packet>` (contrato da task, resumo do Perfil, componente da tecnica e os
> arquivos-alvo). **Nao leia o Perfil completo nem a PRD inteira**; abra outro arquivo so se o
> contrato citar e o packet nao trouxer. O que faltar, declare em 'Nao verificado'."* Packet
> acima de 300 KB = task grande demais — fatie (S7) em vez de mandar.
>
> **INVARIANTES DO GATE (3.4.18).** Se a task traz a secao **"Invariantes do gate"** (🔴 da criacao
> convertidos em prova executavel), acrescente ao prompt: *"Rode CADA prova da secao 'Invariantes
> do gate' antes de devolver e cole a saida em 'Verificacoes'; invariante que nao fechou = Status
> ⚠️ PARCIAL, nunca ✅."* Medido 02/09 (PRD-135): os 🔴 de overpayment e de taxa da financeira foram
> corrigidos na spec em 4 ciclos de gate e voltaram como bugs de CODIGO no ciclo 1 da exec — a regra
> existia em prosa, ninguem a provou antes de devolver.
>
> **RETORNO EM DOIS NIVEIS (3.4.9 — melhoria #2).** O packet cuidou do que ENTRA no
> subagente; isto cuida do que VOLTA: o relatorio completo devolvido ao chat vira input
> relido em TODOS os turnos seguintes da sessao-pai — e o multiplicador que restou (PRD-132:
> 112M de tokens_total com 883k de output). Acrescente ao prompt de TODO hefesto/dedalo:
> *"Grave o relatorio COMPLETO em `.claude/.harness-run/relatorios/<TASK-NNN>-<papel>.md` e
> DEVOLVA no chat apenas o SUMARIO padrao de ate 12 linhas (Status; Arquivos tocados — so a
> lista; Verificacoes — 1 linha cada; Desvios/Nao verificado — 1 linha cada; caminho do
> relatorio completo)."* A sessao-pai ABRE o arquivo completo apenas quando: status nao e
> CONCLUIDA, um revisor citar a task, ou o sumario levantar duvida concreta. Os "Desvios"
> do sumario alimentam a Fase 5 normalmente — sem reler relatorio nenhum.

#### Gate de LARGURA — antes de disparar a onda 1 (3.2.0, tipado na 3.2.1)

**Obrigatorio, e roda ANTES do primeiro despacho.** O grafo que a `/prd` entregou e uma hipotese;
este gate e a auditoria dela. A `/prd-exec` ja obedeceu grafo errado (PRD-117: `TASK-004` retida
atras de uma task de que nao consumia nada, 155 min sozinha, 2h30 de execucao com 2 agentes
vivos) — obedecer o grafo nao pode significar nao conferi-lo.

**As arestas sao TIPADAS (3.2.1)** — e cada tipo tem um destino diferente neste gate:

| Tipo | Significado | O que o gate faz |
|---|---|---|
| `[requires]` | consome artefato, contrato ou decisao produzida pela outra | **audita**: sem artefato nomeado, derruba |
| `[barrier]` | precisa esperar uma condicao de seguranca/estabilizacao, sem consumir arquivo | **preserva** quando a condicao esta escrita |
| `[mutex]` (campo `Conflita com`) | nao ha dependencia logica, mas as duas disputam o mesmo recurso de escrita/teste | **preserva**, e vira regra de escalonamento, nao de ordem |

1. **Meca o paralelismo REAL.** `T` = tasks de trabalho. `L1` = tasks liberadas na onda 1 —
   isto e, sem `[requires]` e sem `[barrier]` pendente — **descontando** as que nao podem correr
   juntas por `[mutex]` (duas em mutex contam como **uma** vaga simultanea). Paralelismo real e
   o que sobra, nao o numero de tasks sem dependencia.
2. **Regra de disparo:** `T >= 6` e `L1 < 3` ⇒ **nao dispare ainda**. Reabra o grafo.
3. **Reabertura, aresta a aresta:**
   - `[requires]` — vale o **teste da saida**: a task le, importa ou consome um artefato
     **nomeado** que a outra cria? Sem o artefato escrito, o elo e **nao justificado**:
     derrube-o e suba a task para a onda 1. Ordem narrativa, "parece mais seguro", "mesmo
     modulo" e "continuacao natural" nao sao dependencia.
   - **`[requires]` de task `front` sobre task de backend cujo artefato e um ENDPOINT/payload
     descrito na tecnica (3.4.18) — derrube-o.** O front consome o **contrato** (Componente N da
     tecnica, escrito na criacao), nao a implementacao: o dedalo constroi contra o contrato (com
     fixture/mock local quando o endpoint ainda nao responde) e a integracao real e cobrada pela
     acceptance da onda B. Reescreva como `[barrier: integracao]` e suba a task para a onda 1.
     Medido 02/09: na PRD-135 a TASK-007 (front) esperou 2h por uma TASK-004 de 57 min para
     consumir um endpoint cujo contrato estava na tecnica desde as 14h; na PRD-136 o mesmo
     padrao. `[requires]` de front sobre front (componente/helper JS que ela IMPORTA) continua
     valendo.
   - **`[mutex]` entre duas tasks `front` (mesmo arquivo de tela/JS)** — nao ha o que derrubar
     na exec (colisao real), mas e **defeito de fatiamento**: registre como desvio de grafo e
     como DT para a `/prd` ("front com arquivo compartilhado — codigo novo nasce em modulo
     proprio"). Medido 02/09 (PRD-136): TASK-007 e TASK-008 em mutex = 110 min em serie no
     caminho critico.
   - `[barrier]` — **nao se derruba barrier legitima.** Ela existe para condicao de seguranca
     (auth estabilizada antes do teste, migration base aplicada, safe-mode armado) e nao tem
     artefato para nomear. O que se cobra e a **condicao escrita**; sem condicao, trate como
     aresta antiga (abaixo).
   - `[mutex]` — **nunca vira ordem.** Duas tasks em mutex nao sao "uma depois da outra no
     grafo": sao **duas vagas que nao podem coincidir**. Escalone (a segunda sobe quando a
     primeira devolve o recurso) e mantenha o resto da onda correndo.
   - **Aresta ANTIGA, sem tipo** (PRD anterior a 3.2.1) — **a sessao pai audita, e nao remove
     automaticamente so porque nao ha consumo literal de arquivo.** Muita aresta antiga e
     barrier escrita como dependencia. Classifique-a primeiro (requires / barrier / mutex) lendo
     as duas tasks; so entao aplique a regra do tipo. Na duvida entre derrubar e manter: **mantem**.
4. **Anuncie o que mudou**, em uma linha: *"grafo reaberto: 3 elos derrubados (TASK-004,
   TASK-007, TASK-009 — requires sem artefato); 1 barrier preservada (TASK-002, auth); 1 mutex
   (TASK-005/006, mesmo banco de teste) — onda 1 vai de 2 para 5 tasks"*. Registre no Output
   final como **desvio de grafo**: e a materia-prima que faz a `/prd` seguinte escrever melhor.
5. **Elo duvidoso permanece.** Entre perder 20 min de parede e corromper um artefato
   compartilhado, o elo fica. Registre a duvida.

> Task-raiz legitima (um desarme, uma migration base que todas consomem) mantem `L1 = 1` e
> **passa** no gate — desde que seja de fato minima. Se a raiz sozinha leva mais de ~15 min,
> registre: a PRD inteira esperou por ela.

#### Teto de duracao por task — a cauda e o que mata o paralelismo (3.2.0)

Uma task longa nao atrasa so a si mesma: as irmas fecham, ela nao, e a ocupacao desaba para 1
agente ate ela voltar. Medido em 41 execucoes (22/07-20/08), a parede da `/prd-exec` se distribui
assim: **1,1%** com 6 ou mais agentes vivos · **6,3%** com 3 a 5 · **57,9% com 1 a 2** · **34,6%
com nenhum**. Ou seja: **so 7,4% do tempo tem 3 ou mais agentes trabalhando**, e quase tudo isso
no comeco da execucao.

> **WATCHDOG por p90 (3.4.7; enforcado na 3.4.22).** Tres camadas automaticas por cima deste envelope:
> dentro do agente, o hook `guard-folego` NEGA qualquer ferramenta acima do teto de chamadas do papel
> (hefesto/dedalo 90 — `HARNESS_FOLEGO_<papel>`) e o executor devolve **PARCIAL-TEMPO** (so o Write
> do relatorio passa) — nao escreva teto nem contagem no prompt do agente; no retorno, o
> `SubagentStop` grava a linha da task (`prds/_metrics/tasks/`, `task-telemetry.mjs`) e o
> `guard-agent --post` compara a duracao real com o teto do papel (`watchdog-baseline.sh` = 2× o p90
> local, agora medido dessas linhas) e **avisa no proprio turno**; o log fica em
> `.harness-run/watchdog-overruns.jsonl`. **Sua obrigacao ao receber o aviso ou um PARCIAL-TEMPO:**
> antes da proxima onda, decidir dividir/replanejar (o RE-FATIAR abaixo ja da o mecanismo) e
> registrar a decisao em 1 linha no Output — nunca ignorar em silencio. `general-purpose` nao executa
> task nem faz review de ciclo: o guard nega e aponta o papel (fallback so com `fallback:` no prompt).
>
> **AGENTE MUDO = ABORTAR CEDO (3.4.20).** As tres camadas acima so agem quando o agente VOLTA.
> Agente que parou de escrever no transcript nao volta: ele espera o teto (medido 03/09, PRD-137:
> 3 agentes x 10 min mudos). Ao despachar cada onda, arme na MESMA mensagem:
> `Monitor` com `bash .claude/hooks/agent-stall.sh 4` (condicao: linha `STALL|`). Disparou →
> `TaskStop` no agente parado e redespacho **uma vez**, com o motivo no prompt ("o anterior travou
> em <ultima acao>; nao use <ferramenta>"). Segunda vez = a task vai para voce ou vira PARCIAL.
> Knob: `HARNESS_STALL_MIN` (default 4).

- **Envelope por task: ~45 min.** Ao receber o relatorio de cada hefesto/dedalo, compare com o
  envelope (voce tem o timestamp do despacho e o do retorno).
- **Estourou:** registre o **estouro de dimensionamento** — `TASK-NNN levou Xmin (envelope 45)
  — <o que a task varria: N arquivos / N camadas / N cenarios>`. **Isso e METRICA, nao divida
  (3.2.2):** vai para a linha de telemetria do run (`--extra="dimensionamento: TASK-NNN Xmin
  (<motivo>)"`) e para o Output — **nunca** para o `prds/debito_tecnico/INDEX.md`. Um "DT de
  dimensionamento" nao tem codigo a corrigir; ele so engordava a fila que a `/dt-exec` tria.
  **Nao interrompa a execucao por isso** — a task ja esta rodando, e matar trabalho feito e
  pior que a cauda.
- **Duas tasks da mesma PRD estourando** e sinal de PRD mal fatiada, nao de azar: diga isso no
  Output, com os numeros, para a proxima `/prd` do mesmo modulo fatiar menor.
- **RE-FATIAR AUTOMATICO (3.3.0 — S7).** Registrar nao basta: na 2ª task da mesma PRD que
  estourar o envelope, **antes de despachar a proxima onda**, a sessao pai reabre cada task
  **ainda nao despachada** com mais de **3 arquivos-alvo** (o `task-packet.sh` devolve o numero)
  ou packet > 300 KB e a **fatia em duas** na hora: `TASK-00Xa` (a metade que nao depende de
  nada) e `TASK-00Xb` (`[requires]` a). Grave os dois arquivos em `tasks/`, marque a original
  como `Status: Fatiada (3.3.0)` e anuncie em uma linha: *"re-fatiado: TASK-007 → 007a/007b (5
  arquivos, envelope estourado 2× nesta PRD)"*. Task ja em voo **nao** se mexe. Medido
  (palantir-app, aec-erp-frontend, 15–22/08): hefesto com mediana de 44–51 min e 3–3,5× a
  global — a cauda serial vinha de tasks grandes que ninguem fatiava no meio do run.
- **`grande-ok` e UM por PRD (3.5.3 — hook).** O `guard-agent` aceita o marcador
  `packets/TASK-NNN.grande-ok` em **uma** task da PRD (`HARNESS_GRANDE_OK_MAX`, default 1); na
  segunda ele nega mesmo com o marcador, e a resposta e o RE-FATIAR acima, antes de despachar.
  "A justificativa ja esta documentada na task" NAO e motivo: medido 12/09 (PRD-142-b), a pai
  carimbou 3 grande-ok de uma vez e foram exatamente as 3 tasks de 49-59 min que estouraram o
  folego. Decisao humana consciente: `HARNESS_GRANDE_OK_MAX=2`, com o motivo no Output.

#### Checkpoints de PAREDE — SLO de 2h (3.2.1)

O alvo da execucao e **fechar em menos de 2 horas de parede ativa**. Esperar 3h para admitir que
o envelope se perdeu era tarde demais: quando o aviso saia, o caminho critico ja estava formado.
Dois checkpoints, e nenhum e pedido de permissao para gastar (o orcamento foi aprovado na
decolagem, 0.3) — sao pontos de diagnostico e de correcao de rota.

**~90 min — checkpoint preventivo.** Cinco linhas:

1. **fase atual** ([A] implementacao · [B] validacao · [C] correcoes · [D] focada · [E] fechamento);
2. **work tasks restantes** (quantas, quais em voo);
3. **validacoes restantes** (acceptance / dupla-cega / UX — o que ainda nao voltou);
4. **onde o tempo esta concentrado** — o processo ou teste que domina o caminho critico agora;
5. **previsao de termino** + **a acao tomada para encurtar o caminho critico** (o que voce mudou:
   despachou correcoes em paralelo, cortou um rerun desnecessario, serializou por recurso).

Previsao acima de 2h neste ponto ⇒ aja **agora**, nao no proximo checkpoint.

**~120 min — violacao do SLO.** Diagnostico obrigatorio: registre **a causa dominante**, escolhida
entre (e so entre) — `task superdimensionada` · `dependencia artificial` · `conflito de escrita` ·
`contencao de testes` · `repeticao de suite` · `ciclos de review` · `falha de ambiente` ·
`estimativa incorreta`. Uma causa, a dominante, com o numero que a sustenta. Depois, as opcoes ao
usuario: (a) seguir; (b) fechar o que esta pronto e mover o resto para uma PRD de continuacao (a
Fase 3 gera o commit do que passou); (c) abortar. Repetir a cada 60 min enquanto durar.

A causa registrada aos 120 min vai para o Output e para a telemetria — e o que permite a `/prd`
seguinte fatiar melhor.

**Nao pare o trabalho em voo para emitir checkpoint:** os subagentes ja despachados terminam. O
checkpoint sai **entre** despachos, nunca no meio de uma onda. E **nunca e silenciado** por
`HARNESS_VERBOSITY` — como a pergunta da decolagem e o aceite, e decisao, nao narracao.

**Despacho CONTINUO (2.10.0) — a onda e plano, nao barreira.** Ate a 2.9.0 cada onda esperava
a onda inteira anterior fechar — ou seja, esperava a task MAIS LENTA dela. Custo medido na
telemetria (medianas, runs sem gap): 3 ondas = 32 min · 5 ondas = 1h42m · 6 ondas = 2h18m —
de 3 para 5 ondas, +2 tasks custaram +70 min. O tempo estava na serializacao, nao no volume.
O avanco agora e por TASK:

0. **ANTES de qualquer `Agent` (3.4.1 — passo mecânico, não opcional):** para CADA task da onda,
   rode `bash .claude/hooks/task-packet.sh <task.md>` e anuncie a linha do plano com o executor
   decidido: `TASK-00X → duelo` (**apenas `Duelo: sim`** em task de PRD — 3.4.5; vale para
   backend E front, sem migration e sem `[barrier]`) · `→ hefesto` (backend com `Duelo:
   auto`/`nao`/sem campo) · `→ dedalo` (front com `Duelo: auto`/`nao`).
   Para as `→ duelo`, rode `bash .claude/hooks/harness-duelo.sh --task <task.md>
   --label PRD-NNN` **na mesma mensagem** e só então despache o executor (hefesto ou dedalo,
   pelo `Tipo`) para **aplicar** o diff vencedor (ou escrever do zero se `desligado|reprovado`). Todo executor recebe o caminho do
   packet no prompt. **Medido (PRD-125, 23/08): a sessão pulou este passo e mandou TASK-002
   (backend, 2 arquivos) direto ao hefesto — 22 min de escrita serial que o duelo faria em
   segundos.** Se você vai escrever `Agent hefesto` sem ter rodado o packet e o duelo daquela
   task, pare e volte a este item.
   **Grafo (3.5.7):** a primeira linha `GRAFO|PRD-NNN|tasks=N|profundidade=D|...|fator_teorico=F` que o
   `task-packet.sh --check` imprime e o teto de paralelismo DESTA PRD — anuncie-a no plano do pipeline ao lado
   do `CARGA|vivos|N`. Fator abaixo de 2 = a exec vai fechar `limitou=dependencias` por construcao (medido
   15-16/09: 5 execs, paralelismo real 1,18-1,29 sob teto 6); nao suba o teto de vivos por isso — anote no
   Output e, se a PRD ainda nao decolou, devolva a /prd (Passo 8) para replanejar.
0.5. **Carga da maquina (3.4.5 — instrutivo, 1 comando; recalibrado 3.4.18):** antes de
   despachar a PRIMEIRA onda, rode `bash .claude/hooks/carga-maquina.sh` e OBEDECA so a linha
   `CARGA|vivos|N` (3.5.3: sai sempre — 6 folgado / 4 com 2+ frentes / 2 com spawn LENTO; anuncie
   o N no plano do pipeline). Ate **3 frentes** harness ativas na maquina = paralelismo pleno. Com **4+ frentes** o
   script imprime `CARGA|alta` — e ALERTA de rate limit por minuto (medido 25/08: 429/529), nao
   corte: anuncie ao usuario e siga; reduza so se vir 429/529 de fato nesta execucao. Nas ondas
   seguintes, so re-rode se a exec durar 2h+ (a carga muda).
   **Semaforo de frentes (3.4.21 — hook, nao instrucao):** a regra "ate 3 frentes" era com a
   maquina folgada; medido 04/09, 3 execs juntas no mesmo PC deram spawn de 1.382 ms e 858 min
   de parede (a criacao de processo e serializada, ~20/s). Agora **1 frente pesada por PC Windows
   (2 no macOS, `HARNESS_FRENTES_MAX`)**: o `guard-agent` adquire o slot no 1o despacho de
   executor; se negar com `FRENTES CHEIAS`, a resposta padrao (3.5.4) e **esperar na fila**: rode
   `node .claude/hooks/frentes.mjs wait --label PRD-NNN --session <session_id> --max-min 240`
   com `run_in_background: true`, encerre o turno e despache SO quando a notificacao voltar com o
   slot. Em modo interativo pergunte ao usuario com **"esperar a vaga" como opcao recomendada**;
   alternativas: encerrar a outra frente ou subir `HARNESS_FRENTES_MAX` em `~/.harness.env.local`
   (ciente de que as frentes ficam mais lentas). **"Implementar direto na sessao pai" nao e opcao
   sua** — so se o usuario pedir com essas palavras (medido 14/09: pai em Opus codou 77 min, 307k
   tokens de saida). O slot e liberado no `stop` da telemetria. Status: `node .claude/hooks/frentes.mjs status`.
   **Como esperar (qualquer coisa):** nunca `sleep`/`Start-Sleep`/`ScheduleWakeup` — subagente e
   comando em background acordam voce por notificacao ao terminar; condicao em arquivo e `Monitor`.
1. **Disparar TODOS os executores da onda 1 na MESMA mensagem** (uma chamada Agent por task —
   paralelismo nativo; ver "Paralelismo" abaixo), cada um com o agente certo pelo `Tipo`.
2. **Marcar as tasks como in_progress** na lista de tracking.
3. Cada hefesto/dedalo implementa a sua task (Write/Edit, migrations via o cliente de banco do
   Perfil, validacoes da task). O hook `lint.sh` (PostToolUse) valida sintaxe a cada
   Write/Edit conforme `harness.env`.
4. **Ao receber o relatorio de CADA task** (nao da onda): conferir o Status, coletar os
   "Desvios e observacoes" (Fase 5), **marcar completed** — e **despachar NA HORA toda task
   pendente cujas dependencias fecharam TODAS**, sem esperar as irmas da onda. Uma task lenta
   nao pode segurar caminho que nao depende dela.
   **4a. COMMIT POR TASK (3.5.7/E5 — passo mecanico, em worktree `wt/*`).** Antes de despachar o
   proximo executor, cada task que voltou `✅` vira UM commit escopado aos arquivos dela:
   `git add -- <arquivos da task> && git commit -m "<tipo>(PRD-NNN): TASK-NNN — <titulo>"` (nunca
   `git add -A`; telemetria e packets ficam de fora). Medido 16/09 (140-b, exec noturna): 7 tasks
   fechadas, 1 commit so no fim, 27 arquivos soltos — sem commit por task o review externo nao ve
   a base certa, o merge vira um bloco unico e um PARCIAL no meio nao tem onde voltar. O
   `guard-agent --post` avisa `[commit] task(s) ✅ desta run SEM commit` quando uma task ✅ ha mais
   de 60 s nao aparece no `git log` — trate o aviso na hora, nao no fechamento.
   **4b. REVIEW ANTECIPADO DO BACKEND (3.4.19).** No momento em que TODAS as tasks `backend` de
   trabalho fecharam e so restam tasks `front` em voo (arquivos disjuntos por construcao —
   3.4.18), NAO espere a onda A: monte o packet so dos alvos do backend e dispare o sherlock
   **"ciclo 1 (backend)"** na mesma mensagem em que despacha/aguarda o front:
   `bash .claude/hooks/review-packet.sh --label PRD-NNN --tasks "<tasks backend>" --so-alvos`
   (+ Codex com a mesma lista de arquivos, se disponivel). Quando o front fechar (1.4), o ciclo 1
   completa com **"ciclo 1 (front)"** so sobre os alvos do front, e o **ciclo 2** ja e delta de
   tudo. A triagem/correcao dos achados do backend pode comecar enquanto o dedalo constroi —
   correcao de backend nao toca arquivo de front. Medido 02/09 (PRD-135): backend pronto as 18:26,
   sherlock so as 19:21 — 55 min de review que cabiam dentro da janela do front. O guard aceita
   "ciclo 1 (backend)" e "ciclo 1 (front)" como o MESMO ciclo 1 para o teto.
5. **Excecoes que CONGELAM despacho novo** (o freio continua existindo): relatorio
   **BLOQUEADA** → nada novo sobe ate a sessao resolver (as tasks ja em voo terminam);
   task com **Depende de** uma BLOQUEADA/falhada fica retida; e o teto de executores
   simultaneos do preset/Perfil vale sempre (se cheio, a proxima sobe quando abrir vaga).
6. Repita ate o grafo esgotar. Para a telemetria, `--waves` continua sendo o **numero de
   ondas do PLANO** (profundidade do grafo de dependencias) — comparavel com o historico;
   o ganho do despacho continuo aparece na duracao, nao no campo.

> **3.4.34 — COSTURA POR ONDA (mecanico via guard-agent).** Em PRD com tasks de front E de back, a onda N>=2 so e
> despachada depois de um `sherlock` com **`Lente: costura`** sobre o diff da onda N-1: ele confere contrato front<->back
> (nomes de chave JSON do `## Contrato de API`, campos removidos que alguem ainda le, payload que o JS manda x o que o
> endpoint le). Rode `bash .claude/hooks/review-packet.sh --label PRD-NNN --tasks "<tasks da onda>"`, despache o sherlock
> pedindo que ESCREVA o veredito em `.claude/.harness-run/review/PRD-NNN.costura-onda-<N-1>.md` (0 bloqueante libera a
> onda; bloqueante = corrigir antes). Medido 10/09 (PRD-141): `pendentes` x `pendencias` e `window.BRANDING` removido
> so apareceram no review final — 2h23 de rodada de fix. Custo da costura: ~10 min por onda.
>
> **3.4.34 — GATE DE ACCEPTANCE (mecanico via harness-metrics).** O `stop PRD-NNN-exec*` NAO fecha enquanto a task GATE
> (acceptance) nao tiver spec em disco E execucao registrada na telemetria. Rodar "as specs das tasks" NAO e o gate
> (PRD-141: a TASK-012 nunca rodou e a exec seguiu). Fechar sem o gate e decisao humana: `--gate-ok="<motivo>"`.
>
> **3.4.34 — TASK GRANDE nao e despachada.** O guard-agent roda o `task-packet --check` no despacho: GRANDE (previsao
> > 45 min pelo historico, > 4 alvos, > 230 linhas, > 300 KB) = fatie antes (2-3 tasks de arquivos disjuntos, cada uma
> cabendo em ~90 chamadas). Override humano: `touch .claude/.harness-run/packets/TASK-NNN.grande-ok`. Teto de tasks da
> PRD (9): override `touch .claude/.harness-run/PRD-NNN.tasks-ok`.

#### 1.4 — Estabilizacao do working tree (fim da onda A)

Apos TODAS as tasks de trabalho e a task de doc-raiz/DT INDEX. **O acceptance NAO roda aqui
(3.2.1)** — ele e a trilha central da onda B (Fase 2), disparado junto com os revisores.
O que fecha a onda A:

1. **Validar sintaxe** de todos os arquivos criados/modificados (cobre o que o hook
   `lint.sh` ja faz incrementalmente). **3.4.19:** o lint do PROJETO (comando do Perfil) sobre os
   arquivos tocados e obrigacao do EXECUTOR antes de devolver (hefesto/dedalo rodam e colam a
   saida). Aqui voce so CONFIRMA (uma passada, todos os arquivos da onda). Achou erro? E desvio
   do executor: corrija inline se trivial, registre em Desvios — **nunca** abra "rodada de lint"
   com agente (PRD-135, 02/09: duas rodadas, 23 min, so para lint).
2. **Confirmar que nenhum executor esta em voo.** A onda B so abre com o tree ESTABILIZADO:
   nenhum hefesto/dedalo pendente, nenhuma correcao inline em andamento. Executor ainda
   escrevendo enquanto o acceptance roda produz resultado que nao vale — e o principal
   invalidador de gate que a 3.2.1 fecha.
3. **Verificar atualizacao de documentacao** (ultima task): **doc raiz de convencoes**
   (Perfil) — novos arquivos, tabelas, convencoes adicionados?
4. **Verificar resolucao de DTs** (se a PRD absorveu debitos tecnicos):
   - Ler campo "Expande" do Resumo Executivo da PRD para identificar DTs absorvidos
   - `Pendente` → `Resolvido (PRD-NNN, AAAA-MM-DD)` — **com a data** (25/08: e ela que
     alimenta o fluxo criados×resolvidos do dashboard) — nas **duas pontas**: o
     `prds/debito_tecnico/INDEX.md` **e** o arquivo dedicado do DT (`DT-XXX-*.md`), quando existir
   - **Gate executavel (obrigatorio):** "confirmar" de cabeca e o que deixa uma ponta para tras
     em silencio (INDEX certo, arquivo do DT ainda `Pendente`, os dois no mesmo commit, ninguem
     percebe). Rode e **cole a saida bruta**:
     ```bash
     PRD=PRD-NNN; DTS="DT-00X DT-00Y"        # os DTs do campo "Expande"
     for dt in $DTS; do
       grep -Hn '\*\*Status:\*\*' prds/debito_tecnico/${dt}*.md
       grep -Hn "$dt" prds/debito_tecnico/INDEX.md
     done
     ```
     Todo DT absorvido tem de aparecer com `Resolvido (PRD-NNN)` **nas duas** saidas. Faltou
     alguma: **a documentacao nao esta fechada** — corrija e rode de novo antes de abrir a onda B.
     PRD que nao absorveu DT nenhum: registre "n/a" e siga (nao invente o gate).
5. **NAO fazer commit nesta fase** — a Fase 3 produz a mensagem; o usuario faz o commit.

---

## CONTRATO DE TESTES (3.2.1) — quem roda o que, e quantas vezes

**Esta e a unica declaracao normativa sobre execucao de teste nesta skill.** Qualquer instrucao
em outra secao que contrarie a tabela abaixo esta revogada.

| Verificacao | Executor | Sessao pai | Momento |
|---|:---:|:---:|---|
| Lint dos arquivos tocados | **sim** | opcional | apos a implementacao local |
| Typecheck focado (stack permitindo) | **sim** | opcional | apos a implementacao local |
| Teste estritamente local da task | **sim** | opcional | apos a implementacao local |
| Specs afetados por uma correcao | nao, salvo delegacao explicita | **sim** | verificacao focada [D] |
| Familia completa de specs da PRD | **nao** | **sim** | uma vez, na onda B, com o tree estabilizado |
| Suite completa do projeto | **nao** | **sim** | fechamento, pela politica global |
| Rerun da familia ou da suite | **nao** | **sim** | somente apos correcao TRANSVERSAL |

### Executor de work task (hefesto/dedalo)

Pode: lint **so dos arquivos que tocou**; typecheck focado quando a stack permitir; **o menor
teste estritamente local** que comprove a sua task.

Nao pode: rodar a familia `PRD-NNN-*` inteira; rodar a suite completa do projeto; **"aproveitar"
um comando existente cujo glob inclua specs de outras tasks** — comando comodo que varre demais e
o mesmo erro de sempre com outra roupa.

**Redea por hook (3.5.3 — `guard-playwright`, dentro do `guard-bash`; 3.5.6 — teto por TASK e por SPEC).**
No executor: (a) comando de teste sem spec explicito, com glob ou com a familia `PRD-NNN-*` e NEGADO;
(b) teto de **`HARNESS_PW_RUNS_MAX` rodadas por SPEC (default 4)** e `min(4 x specs distintos, 12)` por
TASK — o contador e da task (`.harness-run/playwright/TASK-NNN.json`): a **continuacao herda o saldo**,
`for … do playwright test … done` e `--repeat-each N` contam as iteracoes, e rodada que morre em < 20 s por
ambiente/lock (ECONNREFUSED, `[e2e-lock]`, "No tests found") e creditada de volta; acima do teto o executor
devolve ⚠️ PARCIAL com o log da ultima rodada, a correcao que ja aplicou e o que falta reverificar; (c) o
executor roda `--workers=1` e `--grep` no cenario que esta corrigindo; (d) spec de depuracao (`_debug*`,
`_tmp-*`, `zz*`) e negado pelo `guard-write` — depurar e `--grep` no spec real. Medido 12/09 (PRD-142-b): 126
rodadas de Playwright em 7 tasks, 60 min de parede; 15-16/09 (141-b/145/137-c/144): 11 tetos em uma noite,
todos em task que ESCREVE spec, 2 continuacoes batendo no teto de novo com contador zerado, 3 specs de
depuracao fabricados. Rodada negada nao e bug: e a pai que decide. **Receita da pai para PARCIAL por teto
(3.5.6/D5-D6):** se o relatorio diz "correcao aplicada e nao reverificada", rode VOCE a ultima rodada
(1 comando, o spec da task com `--workers=1`) e feche a task — nao despache um executor novo para
reverificar (medido 15/09: a continuacao da TASK-004 da 145 fechou ✅ em 3 min so reverificando; a da
TASK-001 da 141-b gastou 4 rodadas num spec de sondagem e a pai fechou a mao em 4 min). Espere executor
no Desktop com `ScheduleWakeup`, nunca `sleep` no Bash. Sem spec local isolavel: implemente, declare no
relatorio `teste local: n/d (coberto pelo acceptance central)` e siga — **nao promova para a familia**.

**Flake na familia — receita fixa (3.5.6/D18).** A familia roda UMA vez por ciclo de review. Falhou: rode
SO os specs que falharam, 3 vezes, com `--repeat-each=3` (ou `--retries=1` no gate) — falha estavel = regressao
(corrigir, ou DT com a prova), falha instavel = flake (registrar no Output e seguir; nao rerode a familia).
"Pre-existente?" se decide em 1 rodada do spec no checkout principal (a `main`), nunca com `git stash` e nunca
rodando a familia inteira 3 vezes sob carga variavel (medido 16/09: 3 rodadas de 46 testes, ~7 min cada, para
concluir o que uma rodada dos 5 falhos dizia). Teto da pai: **2 rodadas da familia por ciclo**.

### Validador central (sessao pai)

Roda a **familia completa de specs da PRD** (`Comando (spec unico)` do Perfil sobre os specs
`PRD-NNN-*`) **uma vez**, e so com o working tree estabilizado (1.4.2). Cola o **stdout BRUTO**
do runner — contagem e nomes reais. Exige **100% de aprovacao** (X passed, 0 failed) e as
evidencias (screenshots na pasta do Perfil). Reprovou: `Status: Bloqueada — bugs em acceptance`
com a lista de specs falhando; os pareceres da onda B que ja voltaram viram insumo da correcao,
nao lixo.

- Perfil declara **"Nenhum" framework E2E**: a task de acceptance vira roteiro manual —
  confirmar com o usuario que os criterios passaram.
- PRD antiga sem task de acceptance: usar o **Comando (suite completa)** no lugar, se houver
  framework.

**Nunca** repete a familia depois de cada ajuste pequeno.

**Rerun transversal em PARALELO com o ciclo 2 (3.4.19).** Quando uma das sete condicoes disparar o
rerun da familia, ele NAO entra na frente do ciclo 2: a familia e read-only sobre o tree
estabilizado, igual aos revisores. Dispare-a com `run_in_background` **na mesma mensagem** do
ciclo 2 (sherlock delta + Codex) e colete o resultado antes da triagem. Familia com 6+ specs e
runner Playwright: dois comandos em background com `--shard=1/2` e `--shard=2/2` (mesmo runner,
metade da parede). Medido 02/09 (PRD-135, 20:33): a familia inteira rodou em serie ANTES do ciclo 2.

### Suite completa

So a sessao pai inicia. Roda **uma vez**, mantida a politica vigente: **apenas em PRD cujo numero
seja multiplo de 5** — caso contrario e pulada, para nao bloquear PRD pequena com flake alheio.
Executores e revisores nunca a iniciam. Segunda execucao **so** apos correcao transversal.

### Depois de correcoes de review [D]

Lint dos arquivos corrigidos · specs **diretamente afetados** · review **delta** (so os achados
corrigidos) · nova checagem de UX **so nas telas/estados alterados**. **Nao** re-rodar
automaticamente a familia da PRD nem a suite completa.

Reabre a familia apenas se: a correcao for **transversal**, ou os specs focados indicarem
regressao **alem do escopo corrigido**. Reabre a suite completa apenas se a correcao for
transversal **e** materialmente capaz de invalidar o gate anterior.

### Correcao TRANSVERSAL — definicao fechada

E transversal a correcao que satisfaz **ao menos uma**:

1. altera middleware, bootstrap ou configuracao global;
2. altera autenticacao, autorizacao ou sessao compartilhada;
3. altera schema, migration ou contrato persistido compartilhado;
4. altera helper, fixture ou infraestrutura de teste usada por varias familias;
5. altera componente ou servico compartilhado por **dois ou mais** modulos;
6. muda contrato global de data, identificador, idempotencia ou serializacao;
7. invalida **materialmente** o resultado da validacao anterior.

Mudanca em **um** componente, endpoint ou spec isolado **nao** e transversal. "Por precaucao"
nao e criterio: sem uma das sete condicoes acima, a verificacao e focada. Ao classificar como
transversal, **escreva qual condicao** (`transversal (3): migration compartilhada`) — no Output
e no rerun.

### Contencao de recursos — paralelismo de agente nao e paralelismo de comando

Agentes analisando em paralelo e barato; **comandos pesados disputando o mesmo recurso e o
oposto**. A sessao pai **serializa apenas os comandos em disputa**, nunca o trabalho de analise
e review. Nunca simultaneos:

- duas suites Playwright grandes contra o mesmo servidor;
- acceptance central enquanto qualquer executor ainda escreve;
- suite completa e familia da PRD ao mesmo tempo;
- duas operacoes que reiniciem o mesmo servidor ou banco;
- limpeza global disparada por executor.

**Executor nunca roda comando global de encerramento de processo** (`taskkill` indiscriminado,
`pkill -f node`, derrubar o servidor de teste) para resolver contencao — mata o trabalho dos
irmaos e do proprio pai. Contencao detectada: **reporte no relatorio** e devolva a decisao a
sessao pai.

### Regras de Execucao (validas em toda Fase 1)

#### Paralelismo (delegacao via hefesto/dedalo) — o DEFAULT, nao a otimizacao
- **Paralelo e o comportamento padrao.** Tasks na mesma onda (sem dependencia entre si):
  delegar a agents paralelos (uma chamada Agent por task, **na MESMA mensagem** — nunca uma
  Agent call por turno), escolhendo o executor pelo `Tipo` da task: **`hefesto`** para backend,
  **`dedalo`** (Modo O) para front. Os dois carregam o contrato de implementacao (Perfil primeiro,
  escopo estrito, regras criticas, nunca commitar) — o prompt so precisa ser self-contained:
  caminho da task, numero da PRD e o trecho relevante do escopo. **Inclua no prompt de cada um a
  regra de arquivos temporarios** (abaixo) — subagent nao herda o contexto da sessao pai.
- **No prompt do dedalo**, some a estes: `MODO O (obra)`, o caminho do `MOCKUP.md` se a PRD teve
  maquete e o do `REVIEW-michelangelo.md` se o gate da `/prd` ja rodou — sao o partido e os pontos
  de UX que a construcao precisa respeitar.
- **Sequencial e excecao que exige justificativa:** so tasks com dependencia REAL declarada
  ("Depende de" na task — migration em ordem, task que consome saida de outra). "Parece mais
  seguro rodar uma por vez" NAO e dependencia.
- **A regra nao acaba na Fase 1 (2.12.0).** O mesmo criterio — agrupar por alvo disjunto e
  disparar tudo na mesma mensagem — vale na **correcao de bloqueantes (2.5)** e na **correcao
  de UX (2.9.3)**. Foi ali que o tempo se perdeu na medicao real (PRD-111: 175 min de correcao
  em serie, `parallel_factor` 1,04 com 22 subagentes), justamente porque a regra so estava
  escrita para a Fase 1. O `parallel_factor` da telemetria agora audita isso no fim da run.
- Ao receber o relatorio de um hefesto: conferir o Status (BLOQUEADA = parar e resolver a
  duvida antes de seguir) e coletar os "Desvios e observacoes" (alimentam a Fase 5).

#### Arquivos temporarios (regra de ouro — vale p/ a sessao E p/ todo subagent)
- Scripts de verificacao, dumps, CSVs intermediarios: **SEMPRE no scratchpad da sessao**
  (caminho no system prompt) ou em `.claude/.harness-run/tmp/` (dentro do projeto,
  gitignored). **NUNCA `/tmp`, NUNCA caminho de raiz (`/arquivo`), NUNCA fora do projeto.**
  No Git Bash/Windows, `/foo` resolve para dentro de `C:\Program Files\Git\` — fora do
  sandbox → prompt de permissao que, em execucao nao-assistida, **pendura a PRD por horas**
  (incidente real: `cat > /tmp_check.php` = 4h15 pendurado). O hook `guard-bash.sh` bloqueia
  o padrao, mas nao dependa dele: escreva certo de primeira e repita a regra no prompt de
  qualquer subagent que rode Bash.

#### Protocolo de indisponibilidade do classificador de permissao (1.9.0)
> **Assinatura:** negacao com *"<modelo> is temporarily unavailable, so auto mode cannot
> determine the safety of ..."* / *"cannot determine the safety"*. Isso e **INFRA** (o
> classificador remoto do auto mode esta fora do ar e nega em fail-closed), nao juizo
> sobre o seu comando. O texto *"wait briefly and try again"* dessa mensagem e um convite
> a espiral — **nao obedeca em loop** (incidente real: exec da PRD-007 do aec-backend,
> 09/07/2026, 16+ negacoes e re-tentativas ate `php -v`).

- **Negacao por INFRA (assinatura acima):** maximo **1-2 retentativas**, sempre
  **intercaladas com trabalho read-only util** (Read/Grep/Glob e git read-only NAO passam
  pelo classificador — adiante o que der por ai). Melhor que re-tentar: **reformule para um
  comando da allowlist** do projeto (`permissions.allow` no `.claude/settings.json`; use o
  comando EXATO documentado no Perfil → "Execucao autonoma", sem flags novas).
- **Agent negado tambem e infra:** se a chamada **Agent** (despacho de hefesto/sherlock) for
  negada com a mesma assinatura, NAO insista despachando de novo — o protocolo cobre Bash E
  Agent.
- **Persistiu apos 1-2 tentativas:** PARE a fase autonoma e devolva o controle com
  **Status "Bloqueada — classificador de permissao indisponivel (comando X negado Nx)"** +
  instrucoes de destrave ao usuario: trocar modo de permissao (Shift+Tab), aprovar pela aba
  "Recently denied" do `/permissions` (tecla `r` re-tenta), ampliar a allowlist
  (`bash .claude/harness-doctor.sh --gen-allowlist`), reduzir sessoes autonomas paralelas
  (max 2), ou aguardar a normalizacao.
- **NUNCA** use `ScheduleWakeup`/espera ativa/`sleep` para "esperar o classificador voltar" —
  o reagendamento e o sleep TAMBEM passam pelo classificador e alimentam a espiral.
- **Negacao por JUIZO** (mensagem explica o risco do comando, sem a assinatura de
  indisponibilidade): nao re-tente o mesmo comando; ajuste a abordagem ou pergunte.
- Os hooks ajudam, mas nao substituem o protocolo: `denied.sh` loga/alerta a cada negacao e o
  anti-espiral do `guard-bash.sh` corta o mesmo comando na 3a tentativa — se ele bloquear,
  siga a instrucao do bloqueio (que e este protocolo).
- **Em execucao autonoma, use a ferramenta Bash (nao PowerShell):** as guardas
  deterministicas e os matchers dos hooks do harness cobrem Bash.

#### Modelo por Task
- Delegacao via hefesto ja roda em Sonnet (frontmatter do agent).
- Tasks complexas ou de integracao externa com efeito colateral: executar diretamente
  (na sessao principal), nao delegar.

#### Regras de negocio (CRITICAS)
> As regras especificas estao no Perfil → **Armadilhas do projeto** e na doc raiz de
> convencoes. Os principios abaixo sao genericos; confronte sempre com o Perfil.

- **Idempotencia de envios assincronos:** ao inserir um registro que um worker externo vai
  processar e enviar, marque-o como "enviado/processado" na criacao — mesmo que o envio real
  falhe depois — para evitar reprocessamento e duplicata. (Ver Perfil → Integracoes →
  "Armadilha de idempotencia".)
- **Data/hora de negocio:** NUNCA usar o relogio do servidor/banco (`NOW()`/
  `CURRENT_TIMESTAMP` ou equivalente) para campos de **negocio**. A data DEVE vir da origem
  (payload do cliente/script). (Ver Perfil → Timezone e datas de negocio.) Excecao: campos
  puros de auditoria tipo `created_at` podem usar o relogio do servidor.
- **Autenticacao primeiro:** todo endpoint novo deve validar credencial/token na **primeira
  linha**, antes de tocar o banco ou disparar efeito. (Ver Perfil → Armadilhas.)
- **Soft delete:** preferir inativacao por coluna de status a DELETE fisico, se o Perfil →
  Banco de dados → "Soft delete" assim definir.

#### Frontend
- Siga as convencoes de frontend do projeto descritas na doc raiz (Perfil → Estrutura →
  "Doc raiz de convencoes") e nas Armadilhas do Perfil (ex: nao reutilizar instancia de
  cliente HTTP entre chamadas; onde incluir JS de pagina; biblioteca de templating,
  notificacoes, mascaras e formatacao de datas adotadas pelo projeto).

#### Timeouts
- Chamadas a servicos externos: limitar timeout (5-10s).
- Endpoints que encadeiam chamadas: ajustar o limite de tempo de execucao proporcionalmente.

### Tratamento de Erros (Fase 1)

- Se uma task falhar: parar, reportar o erro, aguardar instrucao
- Se alteracao de schema falhar: executar rollback, reportar
- Se teste E2E falhar: analisar falha, tentar corrigir, re-executar (max 2 tentativas)
- Se sintaxe invalida: corrigir imediatamente antes de prosseguir (o hook `lint.sh` bloqueia)
- Se duplicacao de envio suspeita: conferir a marcacao de idempotencia (Perfil → Integracoes)
- Se comando/Agent negado com assinatura *"temporarily unavailable"/"cannot determine the
  safety"*: seguir o **Protocolo de indisponibilidade do classificador** (Regras de Execucao) —
  max 1-2 retentativas intercaladas com read-only, reformular p/ allowlist, senao Status
  "Bloqueada — classificador de permissao indisponivel"; nunca re-tentar em loop nem agendar espera

---

### Fase 2 — [B] VALIDACAO EM PARALELO (acceptance central + dupla-cega + UX)

> **Quando aplicar:** assim que a onda A estabilizar o working tree (1.4 — sintaxe, nenhum
> executor em voo, doc raiz e DTs fechados), e ANTES da Fase 3. Esta fase e **obrigatoria**,
> nunca pulada por conveniencia.
>
> **REVIEW PACKET (3.4.5 — dieta de contexto do sherlock, obrigatoria).** Antes de despachar
> a dupla-cega, monte o packet do review NA MESMA mensagem:
> `bash .claude/hooks/review-packet.sh --label PRD-NNN --tasks "prds/PRD-NNN-*/tasks/TASK-*.md"`
> (em worktree `wt/*`, acrescente `--desde main` — o diff vem dos commits da branch). O prompt
> do **sherlock** passa a ser: *"seu contexto de review COMPLETO esta em <arquivo do packet>;
> NAO leia a PRD inteira, o Perfil completo nem arquivos fora do diff; lacuna essencial vira
> achado 'nao-verificavel', nunca cacada de contexto"*. Motivo (medido 24-27/08): os revisores
> relendo Perfil+PRD inteiros por ciclo respondiam por boa parte dos 166-488M de tokens_total
> por exec — os executores ja tem task-packet; o review agora tem o seu. O efeito e MEDIDO no
> dashboard "por agente" (tokens do sherlock antes/depois da 3.4.5). O Codex externo ja recebe
> so o diff (external-review) — nada muda la.
>
> **PARTES, NUNCA TRUNCAMENTO (3.4.19).** Acima de `HARNESS_REVIEW_PACKET_KB` (200) o script deixa
> de cortar o diff: ele o **fatia por arquivo** em `<LABEL>.review-packet.md`,
> `<LABEL>.review-packet-2.md`, ... (cada parte com os contratos das tasks + o stat completo), e
> devolve `PACKET-REVIEW|<parte1>|<n arquivos>|<bytes>|<N partes>`. Com N > 1, dispare **um
> sherlock por parte, na MESMA mensagem** ("ciclo 1 parte 1/N"), cada um apontado para a sua
> parte; a triagem funde os relatorios.
> **A parte e NOMINAL, nunca suposta (3.5.3).** Com N > 1 o script tambem imprime uma linha por
> parte, `PACKET-REVIEW-PARTE|n/N|<arquivo>|<lista de arquivos csv>`, e cada parte abre com o
> bloco "ARQUIVOS DESTA PARTE". Monte o prompt de cada sherlock COPIANDO essa lista ("sua parte
> cobre: a.php, b.js — declare `Cobertura: N/N arquivos` no relatorio") e, na triagem, confira a
> cobertura declarada contra a lista. Nunca atribua arquivos a partes pela intencao do
> fatiamento: medido 12/09 (PRD-142-b, ciclo 2), a pai supos onde cada hunk tinha caido, 2 grupos
> de correcao ficaram sem revisor e custou um 4o sherlock de "lacuna" (20 min). No ciclo 2
> (delta), gere o packet com `--tasks` apontando so para as tasks/arquivos corrigidos (ou
> `--so-alvos`) para que as partes coincidam com os grupos de correcao. Arquivos NOVOS (untracked) agora entram no packet como
> diff de criacao — o sherlock nao le mais "do disco". Medido 02/09 (PRD-135): diff de 3.004
> linhas truncado em 200 KB, sherlock leu 16 arquivos novos do disco e a exec ainda despachou um
> review extra "dos arquivos nunca revisados" (21:10).
>
> **As tres trilhas sobem na MESMA mensagem (3.2.1):** (1) **acceptance central** — a familia
> `PRD-NNN-*` rodada pela sessao pai, uma vez; (2) **dupla-cega** — Codex + sherlock; (3)
> **michelangelo**, quando a PRD tem UI. Todas sao **read-only sobre a implementacao**, e por
> isso podem dividir a janela. Nenhuma trilha ve o resultado da outra antes de entregar o
> proprio parecer — a independencia dos revisores continua inviolavel.
>
> **A unica serializacao permitida aqui e por RECURSO**, nunca por conveniencia: se o
> acceptance e o michelangelo disputam o mesmo servidor/browser de teste, rode o michelangelo
> logo apos o acceptance e mantenha a dupla-cega (que so le codigo) em paralelo com ambos.
> Ver "Contencao de recursos" no Contrato de Testes.
>
> **Mecanica:** DOIS revisores independentes revisam o mesmo working tree **em paralelo,
> sem ver um ao outro** (dupla-cega): o **Codex CLI** (via helper) e o agente **sherlock**
> (Claude). Achado apontado pelos dois = alta confianca de bug real. Achado de um so =
> triagem mais cetica. Sem Codex no ambiente, o sherlock revisa sozinho — o review nunca
> e pulado em silencio.
>
> **Multi-AI (2.0.0):** o revisor externo e resolvido pelo host via
> `.claude/hooks/external-review.sh` (host Claude → Codex CLI; host Codex → Claude CLI;
> `codex-review.sh` e shim compativel — PLATAFORMAS.md §8). Sem revisor externo, o modo e
> **SOLO** e o relatorio da fase DEVE registrar isso — nunca descrever como dupla-cega.

#### 2.1 — Pre-condicoes e modo de operacao

> **Costura (3.5.7 — incidente PRD-144: 61 specs verdes, acceptance verde, SOLO-2 com 6 sherlocks, e a feature
> inutilizavel em producao por 4 defeitos de integracao).** O `review-packet.sh` abre cada parte com a secao
> "Costura" do `costura-check.mjs` (window.X lido sem publicacao, dublê de simbolo em spec, `route.fulfill` de
> endpoint da PRD, marcador "NAO VERIFICADO"/"a integrar na TASK-N" em codigo) — cada linha bloqueante entra na
> triagem como 🔴 ate prova em contrario. O `stop PRD-NNN-exec` NAO fecha com `COSTURA-VEREDITO|bloqueia`
> (`--costura-ok="<motivo>"` registra a decisao humana). Com packet em N partes, o (N+1)-esimo sherlock e
> `Lente: costura` (checklist fixo no agente).

Determinar quais revisores rodam neste ciclo:

- **Codex disponivel?** `command -v codex` OK **e** `test -f "$HOME/.codex/auth.json"` OK
  **e** `$HARNESS_SKIP_CODEX_REVIEW` nao e `1` **e** o preflight responde ok:
  `bash .claude/hooks/harness-delegate.sh --preflight codex-cli` (3.4.24 — cacheado; custa <1s).
  Se ele devolver `PREFLIGHT|indisponivel|codex-cli|limite-ate <data>`, o Codex esta em **limite
  de uso ate aquela data**: **nao tente de novo nesta run** (nem `--force`, nem o helper) — review
  em **SOLO-2**, e o motivo no output e `codex: limite de uso ate <data>`. O SessionStart ja
  anuncia "[doctor] Codex fora ate <data>" quando isso vale.
- **Sherlock disponivel?** `.claude/agents/sherlock.md` existe **e** `$HARNESS_SKIP_SHERLOCK`
  nao e `1`.
- **Ha o que revisar?** `git status --porcelain` nao vazio (senao, registrar "working tree
  limpo" e seguir para a Fase 3).

Modos resultantes:

| Codex | Sherlock | Modo |
|-------|----------|------|
| OK    | OK       | **DUPLA-CEGA** (padrao) — `--review-modo=dupla` no stop |
| indisponivel | OK | **SOLO-2** (3.4.24): DOIS sherlocks na MESMA mensagem sobre o MESMO packet, lentes disjuntas `A` e `B` (2.2); registrar motivo do Codex no output — `--review-modo=solo-2` |
| OK    | indisponivel | **CODEX-SOLO** (registrar motivo) — `--review-modo=solo` |
| indisponivel | indisponivel | pulado por ambiente — registrar warning DESTACADO no output |

> **SOLO-2 e o SOLO oficial (3.4.24).** Um sherlock sozinho era a regra de fato no PC do Charles
> (100% das execs de 29/08-04/09; Joao 6/6) e a compensacao "4 sherlocks" so existia ad hoc. Agora
> a ausencia do revisor externo custa **um segundo sherlock com lente disjunta** (A = correcao +
> seguranca + armadilhas do Perfil; B = contratos + regressao + invariantes do gate + banco +
> testes), e a triagem cruza os dois como cruzaria Codex + sherlock. Um sherlock so (`solo`) fica
> reservado ao lote leve da `/dt-exec` e ao `--apenas-sherlock` explicito. Packet em N partes
> (3.4.19) continua um sherlock por parte — ai o modo e `partes`.
>
> **SOLO-2 com packet em N partes (3.5.7):** NAO sao dois sherlocks por parte. Medido 16/09 (144, Codex em
> limite): 3 partes x 2 lentes = 6 sherlocks (+ michelangelo) em ~7 min cada para **4 bloqueantes** — 44 min de
> Fase 2 com o spawn desta maquina serializado. Regra: **um sherlock por parte, lente `completa`** (a parte ja
> e o recorte) **+ um sherlock de `Lente: costura`** sobre o diff inteiro (contratos front<->back, invariantes
> do gate, banco/migrations, testes — o que atravessa as partes) = N+1 agentes em vez de 2N. Nos ciclos 2+
> so o delta: um sherlock `completa` sobre o packet remontado (uma parte) + costura se o delta tocou 2+
> partes. `--review-modo=partes` no stop. Validar: bloqueantes achados por sherlock >= 0,7 (regua da 144)
> com Fase 2 <= 25 min para 3 partes.

**Modelo do sherlock:** use o **resolvido no Passo 0** (preset + override do Perfil) **no ciclo
1**. Se `opus` ou `fable`, passe `model: "<valor>"` na chamada Agent; senao default Sonnet (frontmatter).
**Ciclos 2+ rodam SEMPRE em Sonnet** (regra de refino, 2.4.0) — nao passe `model` nos ciclos
seguintes, salvo opt-out explicito do Perfil ("Modelo do sherlock nos ciclos de refino: opus").
Esforco: nao ha por chamada — o sherlock herda o esforco da sessao resolvido no Passo 0 (3.4.25).
**"Implementacao parece limpa" NAO e motivo valido para pular a fase.**

**Limite de ciclos (2.5.0 — base + escalada):** ler o Perfil → **Codex review** → "Limite de
ciclos". `preset`/ausente/invalido = **base 2** (equilibrado; economico 1 · maximo 3) com
**escalada automatica de ate +1 ciclo**: ao esgotar a base, se o ultimo ciclo **corrigiu
bloqueante E ainda resta 🔴** (esta convergindo), rode UM ciclo extra; se nao corrigiu nada
(estagnado), NAO escale — va direto ao gate 2.7. Numero explicito no Perfil = limite duro sem
escalada; `0` = sem limite. Um **ciclo** = review (dupla-cega) + correcao dos bloqueantes.
Anuncie ao abrir a fase (ex: *"review em 2 ciclos + escalada se convergindo"*).

#### 2.2 — Ciclo 1: subir as TRES trilhas da onda B na MESMA mensagem

Um unico turno dispara tudo: **acceptance central** (Bash, sessao pai) + **Codex** (Bash, helper)
+ **sherlock** (Agent) + **michelangelo** (Agent, se ha UI). Nunca sequencial.

1. **Acceptance central** — `Comando (spec unico)` do Perfil sobre os specs `PRD-NNN-*`. Roda
   **uma vez**, exige 100% (X passed, 0 failed) e o **stdout BRUTO** colado. Regras completas no
   **Contrato de Testes**. Reprovou: `Status: Bloqueada — bugs em acceptance` — os pareceres que
   ja voltaram viram insumo da correcao, e a familia so re-roda depois que os bugs fecharem.
2. **Dupla-cega** — passe o **reasoning resolvido** (Passo 0) como 3o arg do helper; omita quando
   for `medium` (default do Codex). Dica de custo/tempo: mesmo em preset equilibrado, vale testar
   `high` **so no ciclo 1** — acha mais cedo e pode poupar um ciclo inteiro.
   **A base e automatica (3.5.6/D11):** em worktree `wt/*` o helper revisa `git diff <merge-base com a main>`
   e no checkout principal `git diff <commit anterior ao start da run>` — **commitado ou nao, tudo entra**.
   Commite por task normalmente e **NUNCA `git reset --soft`** para "expor" o diff (medido 15/09, 145: 5
   commits desfeitos com executores vivos porque o Codex so via `--uncommitted`). `--base <ref>` forca outra
   base; o relatorio diz qual usou. O review externo agora grava no manifest de delegacoes (`codex=ok` na run).
3. **michelangelo** — nota abaixo.

> **Disputa de recurso e a UNICA razao para nao subir junto.** Acceptance e michelangelo que usam
> o mesmo servidor/browser de teste: rode o michelangelo logo apos o acceptance, mantendo a
> dupla-cega (que so le codigo) em paralelo com os dois. Registre a serializacao no Output —
> serializar por recurso e legitimo, serializar por habito nao.

> **Fase 2.9 pega carona AQUI (2.5.0):** se a PRD tem UI (criterios da 2.9.1), inclua **na MESMA
> mensagem do ciclo 1** a chamada Agent do **michelangelo** (Modo A — prompt da 2.9.2). UX da tela
> construida nao depende do review de codigo: os tres investigam em paralelo (a tela ja existe — o
> tree ja estabilizou). A **triagem** do relatorio dele (2.9.3) so acontece DEPOIS que a
> Fase 2 fechar — nao aplique correcao de UX no meio dos ciclos de review (conflito de Edit).
> Medicao: rodar o michelangelo depois do review custava +6-20min de caminho critico por PRD.

```bash
bash .claude/hooks/codex-review.sh PRD-NNN 1 high   # 3o arg: low | high (medium = omitir)
```

```
subagent_type: "sherlock"
description: "Review sherlock PRD-NNN ciclo 1"
prompt: """
Revise o working tree atual deste repositorio. Rotulo: PRD-NNN, ciclo 1.
Seu contexto de review COMPLETO esta em .claude/.harness-run/review/PRD-NNN.review-packet.md
(diff, arquivos tocados e contratos das tasks — montado pela sessao). NAO leia a PRD inteira,
o Perfil completo, o harness.env nem arquivos fora do diff — o custo disso ja foi pago por quem
montou o packet; lacuna essencial vira achado 'nao-verificavel', nunca cacada de contexto.
Investigue pelas suas lentes, salve o relatorio na pasta de relatorios e devolva o relatorio
completo. NAO leia relatorios de review existentes (dupla-cega). Em ciclo 2+: o packet foi
REMONTADO apos as correcoes — confira PRIMEIRO se os bloqueantes do seu ciclo anterior foram
corrigidos (no proprio diff do packet), depois procure problemas NOVOS introduzidos por elas —
nao re-investigue o que ja aprovou.
PRIMEIRA LENTE (3.4.18): a secao 'Invariantes do gate' de cada task no packet. Para CADA
invariante, prove no codigo (leia; execute se precisar) e marque FECHADO/ABERTO com a evidencia
(arquivo:linha ou saida). Invariante ABERTO e 🔴. So depois aplique as suas lentes gerais.
"""
```

> **Remonte o packet a cada ciclo** (o diff muda com as correcoes): a mesma linha do
> `review-packet.sh` roda de novo antes do ciclo 2+ — ele sobrescreve o arquivo. O guard-agent
> NEGA sherlock com rotulo PRD/LOTE sem packet montado (3.4.7 — mesmo principio do task-packet).

> **SOLO-2 (3.4.24) — Codex indisponivel:** no lugar do helper, dispare **dois** `sherlock` na
> MESMA mensagem, com o MESMO prompt acima e **uma linha a mais no fim de cada um**:
> `Lente: A` no primeiro (`description: "Review sherlock PRD-NNN ciclo 1 lente A"`) e `Lente: B` no
> segundo. A = correcao/logica + seguranca + armadilhas do Perfil; B = contratos/regressao +
> invariantes do gate + banco/migrations + testes (o sherlock sabe o que cada lente cobre). Nao
> escreva teto nem contagem no prompt. Nos ciclos 2+ repita os dois (mesmas lentes). Sem `Lente:`
> o sherlock roda `completa` — que e o modo de um sherlock so.

Capturar: stdout do helper (path do relatorio Codex) → `Read`; retorno do sherlock
(relatorio direto). Em CODEX-SOLO, disparar apenas o Codex; em SOLO-2, os dois sherlocks.

#### 2.3 — Triagem (com cruzamento dupla-cega)

**Cruzar os achados primeiro** (quando ha dois relatorios — Codex + sherlock, ou os dois
sherlocks do SOLO-2): casar por `arquivo:linha`/tema.

- **Apontado pelos DOIS revisores** → quase certeza de problema real. Triagem direta.
- **Apontado por UM so** → validar com mais ceticismo no passo 2.5 (ler o codigo antes de
  aceitar); na duvida, rebaixar para Sugestao. Em SOLO-2 as lentes sao disjuntas de proposito:
  achado de um so e o caso NORMAL, nao suspeita — use a **confianca** que o sherlock declara
  (3.4.24: `alta`/`media`/`baixa` por achado) como o peso da validacao (`baixa` = leia o codigo
  antes de qualquer decisao; nunca descarte sem ler).

Para cada achado (da uniao dos dois relatorios), classificar como:

- **Bloqueante** — bug confirmado, regressao, violacao das **Armadilhas do projeto**
  (Perfil), security (injection, XSS, token, prepared statements), schema (FK, charset, soft
  delete). Criterio pratico: pode quebrar producao ou virar DT? E bloqueante.
- **Sugestao** — estilo, refatoracao, dead code, naming. Cosmetico.

Em duvida: tratar como Sugestao (conservador). Sugestoes nao tratadas viram input da Fase 5
(DT documentation).

#### 2.4 — Guardas

- **Ciclo 1 com >10 bloqueantes:** ABORT. Atualizar Status da PRD para "Bloqueada —
  intervencao humana". Devolver no chat:
  - Lista resumida dos bloqueantes (arquivo:linha + descricao).
  - Path absoluto do relatorio.
  - Recomendacao: revisar manualmente, decidir se ha falsos positivos em massa.
  - **NAO** seguir para Fases 3/4/5.
- **Sugestoes nunca disparam correcao** — vao direto para a Fase 5 como input.

#### 2.5 — Loop de auto-correcao (apenas Bloqueantes) — em GRUPOS DISJUNTOS, nao em fila

**Passo A — validar cada Bloqueante (a sessao pai, sequencial e barato):**

1. `Read` no `arquivo:linha` citado pelo Codex (com algum contexto, ~10 linhas em volta).
2. **Validar criticamente:**
   - Confrontar com o Perfil → **Armadilhas do projeto** (e/ou a doc raiz de convencoes).
   - Confrontar com memorias do projeto em `.claude/memory/` (se houver).
   - Verificar se a "violacao" apontada e intencional (ex: relogio do servidor num campo de
     auditoria `created_at` — permitido; ja em data de negocio — proibido, ver Perfil).
3. **Decisao:**
   - **Falso positivo** → documentar justificativa explicita citando convencao/memoria.
     Registrar na lista de "Falsos positivos justificados": `arquivo:linha — justificativa:
     [...]`. **NAO** aplicar correcao. Passa para a Fase 5 como candidato a DT. Sai do lote.
   - **Valido** → entra no lote de correcao do passo B.

**Passo B — AGRUPAR e despachar (2.12.0 — paralelo e o default aqui tambem):**

A Fase 1.3 ja trata paralelo como comportamento padrao; **esta fase nao e excecao**. Depois
da triagem, monte os grupos e dispare:

1. **Agrupe os bloqueantes validos por ARQUIVO/MODULO alvo.** Dois bloqueantes que tocam o
   mesmo arquivo (ou a mesma camada acoplada — migration + o guard que a consome) vao no
   MESMO grupo. Grupos que nao compartilham arquivo sao **disjuntos**.
2. **Anuncie o plano no chat, antes de disparar** — uma linha, no molde do plano de ondas
   da 1.3: *"ciclo 2: 3 grupos disjuntos (retrieval / CLI / frontend)"*. O que e anunciado
   e conferivel; e essa linha vai para o Output Esperado.
3. **Dispare um agente por grupo disjunto, todos na MESMA mensagem** — `hefesto` para
   backend, `dedalo` (Modo R) para front, pela mesma regra de `Tipo` da 1.3. Prompt
   self-contained: os achados do grupo (arquivo:linha + o que esta errado), o caminho da
   PRD, o `PERFIL-RESUMO.md` e a regra de arquivos temporarios. **Um bloqueante trivial e
   isolado (um guard, um comentario, uma string) NUNCA espera por um bloqueante
   estrutural** — ele e um grupo de um.
4. **Serie so por colisao real de arquivo**, nunca por precaucao: grupos que disputam o
   mesmo arquivo rodam um depois do outro (mesmo criterio de dependencia da 1.3). "E mais
   seguro corrigir um de cada vez" NAO e dependencia.
4b. **Nits em paralelo, nunca em serie (3.4.20).** Sugestoes 🟡/🔵 acionaveis e baratas podem
   virar UM grupo proprio **so** se ele sobe na MESMA mensagem dos grupos de bloqueantes, nao cria
   dependencia e nao adia o ciclo seguinte (PRD-137, 03/09: 4 nits num hefesto em paralelo, custo
   zero de parede). Nit que exigiria esperar = DT/Fase 4, como sempre.
5. **Correcao de 1 ou 2 bloqueantes triviais:** a sessao pai corrige direto via `Edit` —
   despachar agente custa mais do que resolve. O agrupamento vale a partir de ~3 achados
   ou quando qualquer um deles for estrutural.
   **Trivial tem definicao fechada (3.5.3): ate 3 `Edit`, sem rodar spec e sem investigar.** Se
   para corrigir voce precisa rodar um teste, ler mais de 2 arquivos ou responder "por que isso
   trava?", NAO e trivial — despache (hefesto / dedalo Modo R) com prompt de diagnostico e siga
   orquestrando. A sessao pai nao depura teste "preso", nao faz red-green e nao roda a familia
   para conferir um ajuste: medido 12/09 (PRD-142-b), 20 min sozinha num "modal preso" que era
   armadilha de teste ja catalogada (DT-318) + 13 min num B1 com red-green + 2 familias de 4 min
   = 41 min com 0 subagente vivo, e o contexto da pai chegou a 966k tokens.
6. Ao receber cada relatorio: conferir o Status, registrar na lista de "Bloqueantes
   corrigidos" (`arquivo:linha — descricao curta da correcao`) e rodar so os specs tocados
   (2.8). O hook `lint.sh` valida sintaxe a cada edit, inclusive dentro dos subagentes.

> **Por que a regra existe (medido).** Na PRD-111 do `dra-mariana-duarte` (05/08/2026), 4
> rodadas de correcao somaram **50 + 39 + 59 + 27 = 175 min, todas em serie** — e cada rodada
> agrupava itens independentes (ciclo 1: retrieval / diagnostico CLI / envio de midia / um
> comentario; ciclo 3: guard+migration / mascara de nomes / race / guard `PHP_SAPI` trivial).
> A execucao inteira fechou com `parallel_factor` **1,04** e 22 subagentes: o paralelismo da
> Fase 1 funcionou, o da correcao nunca foi escrito. Estimativa recuperavel: 60-90 min so ali.
> O numero agora aparece na telemetria — `parallel_factor < 1,3` com 10+ subagentes vira
> alerta de execucao serial no fim da run.

#### 2.6 — Ciclos seguintes: re-review iterativo (ate o limite do Perfil)

Para cada ciclo seguinte `N` (respeitando o limite lido no 2.1; sem teto se limite = 0),
re-disparar **os mesmos revisores do ciclo 1, em paralelo** (mesma mecanica do 2.2,
trocando o numero do ciclo). **Modelos nos ciclos 2+ (regra de refino, 2.4.0):** sherlock em
**Sonnet** (sem `model` na chamada) e reasoning do Codex rebaixado a `medium` se o ciclo 1 usou
`high` — o ciclo N confere as correcoes do ciclo N-1, nao reabre investigacao:

```bash
bash .claude/hooks/codex-review.sh PRD-NNN <N> <reasoning> delta   # 4o arg: escopo DELTA
```

(+ a chamada Agent do sherlock com "ciclo <N>", na mesma mensagem, no modo dupla-cega.)

> **Escopo DELTA nos ciclos 2+ (2.14.0).** O ciclo N confere as correcoes do ciclo N-1 — reler o
> working tree inteiro a cada ciclo era custo puro. O 4o argumento faz o helper comparar com o
> snapshot do ciclo anterior (`.claude/.harness-run/review-scope-<LABEL>.tsv`) e mandar ao revisor
> **so os arquivos tocados desde entao**. Degradacao segura embutida: sem snapshot, ou delta
> vazio (a "correcao" nao tocou codigo — sinal por si so), ele **avisa e revisa completo**. No
> provider `codex-cli` o recorte nao se aplica (`review --uncommitted` nao aceita filtro): o
> relatorio sai completo **com a lista de arquivos do delta no cabecalho** — use essa lista na
> triagem para separar regressao do ciclo de achado pre-existente.
>
> **No prompt do sherlock do ciclo N**, passe a mesma lista de arquivos e a tabela de
> verificacao dos 🔴 anteriores (FECHADO / PARCIAL / REABERTO): o trabalho dele e (1) os achados
> anteriores fecharam de fato, sem meia-solucao? e (2) a correcao introduziu bug novo? Ele
> **pode** apontar regressao fora da lista — o que ele nao deve e reabrir investigacao do zero.

Re-triagem (com cruzamento) com as mesmas regras do ciclo 1.

- **Ciclo N limpo (zero bloqueantes):** Sucesso imediato. Parar o loop e seguir para a Fase 3
  (incluindo bloco "Code Review Codex" no Output, com o numero do ciclo final).
- **Ciclo N com bloqueantes restantes E ainda ha ciclo dentro do limite (`N < limite`, ou
  limite = 0):** rodar o Loop de auto-correcao (passo 2.5) novamente sobre os bloqueantes
  do ciclo N e avancar para o ciclo N+1.
- **Limite atingido com bloqueantes restantes:** ir ao gate 2.7 (intervencao humana).

#### 2.7 — Esgotou os ciclos com bloqueantes — consultar a decisao da Entrevista (0.3)

Limite do Perfil atingido e ainda ha bloqueantes? **Nao corrija mais e nao re-rode os
revisores.** Consulte a **decisao de tolerancia colhida na Entrevista unica (Passo 0.3)**:

- **Decisao (a) SEGUIR (default):** os bloqueantes restantes ficam ACEITOS pela decisao de
  decolagem — registre cada um como candidato a DT na Fase 5 (origem: `bloqueante aceito ao
  esgotar os ciclos da Fase 2`), marque o bloco "Code Review" do Output como `⚠️ concluida com
  bloqueantes aceitos (ciclos esgotados — decisao da entrevista)` e siga para a Fase 3 **sem
  parar**.
- **Decisao (b) PARAR** (ou entrevista nao colheu essa decisao): apresente ao usuario:

1. Os bloqueantes restantes (1 linha cada: `arquivo:linha` + por que nao foi resolvido nos
   ciclos anteriores);
2. O historico dos ciclos (ciclo N: X bloqueantes → Y corrigidos / Z falsos positivos);
3. As duas opcoes — e **aguarde a decisao do usuario**:
   - **SEGUIR mesmo assim** — os bloqueantes restantes ficam explicitamente ACEITOS pelo
     usuario: registre cada um como candidato a DT na Fase 5 (origem: `bloqueante aceito ao
     esgotar os ciclos da Fase 2`) e siga para a Fase 3, marcando o bloco "Code Review" do
     Output como `⚠️ concluida com bloqueantes aceitos (ciclos esgotados)`.
   - **ABORTAR** — atualizar Status da PRD para "Bloqueada — intervencao humana" e devolver:
     relatorios de todos os ciclos, diff acumulado das correcoes aplicadas entre os ciclos e
     recomendacao de revisao manual. **NAO** seguir para Fases 3/4/5.

> **Por que a base caiu para 2 (2.5.0):** mineracao de 35 sessoes reais (29/07) mostrou que
> os ciclos 3-4 quase so cacavam 🟡 — a mediana de 16min/ciclo de sherlock comprava pouco
> alem do 2º. A escalada (+1 so se convergindo) preserva o caso raro em que o 3º ciclo fecha
> de verdade; estagnou = gate humano/decisao da entrevista, que e mais informativo que ciclo
> extra. `0` (sem limite) e escolha consciente de quem prefere convergencia a custo.

#### 2.8 — [D] Verificacao FOCADA apos cada lote de correcao

Regra normativa unica: **CONTRATO DE TESTES** (acima). Aqui so o que e especifico do loop:

Depois de cada lote de correcoes da 2.5 — nao depois de cada achado — rode **lint dos arquivos
corrigidos** + **os specs diretamente afetados** (Comando spec unico do Perfil), e peca aos
revisores apenas a **revisao delta** (2.6). UX: so as telas/estados alterados.

**Familia da PRD e suite completa nao voltam automaticamente.** Voltam quando, e so quando, a
correcao for **transversal** pelas sete condicoes do Contrato — e ai o Output registra qual
condicao disparou o rerun. Correcao local que reabre a familia "por seguranca" e exatamente o
custo escondido (tempo + flake alheio) que esta politica existe para eliminar.

---

### Fase 2.9 — Validacao de UI/UX construida (michelangelo, modo AUDITORIA) [quando ha UI]

> **Quando aplicar (2.5.0 — em PARALELO com a Fase 2):** o michelangelo e **disparado junto com o
> ciclo 1 do review** (mesma mensagem — ver nota na 2.2): a tela ja esta construida (onda A
> fechou) e UX nao depende do review de codigo nem do acceptance, que corre ao lado na mesma
> onda B. A **triagem** do relatorio dele (2.9.3) acontece
> **apos a Fase 2 fechar** (working tree estavel — correcao de UX nunca roda no meio dos ciclos).
> Se alguma correcao da Fase 2 alterou arquivo de UI que ele auditou, a sessao pai revalida SO o
> ponto tocado (screenshot rapido) antes da triagem. Roda **so se a PRD tem trabalho de
> interface**; PRD puramente backend/migration/config: **pule silenciosamente**.
>
> **Por que existe:** fecha o ciclo de UX do harness. A `/prd` (Passo 10) criticou o design
> **proposto** no papel (michelangelo Modo C → `REVIEW-michelangelo.md`); aqui o michelangelo audita
> a tela **construida** (Modo A, evidencia via Playwright headless — PLATAFORMAS.md §7),
> confrontando com o que a PRD propos: os 🔴/🟠 de UX
> apontados na revisao da proposta foram de fato resolvidos na implementacao? A tela renderizada
> sustenta a hierarquia, os estados, o contraste e a responsividade prometidos?
>
> **Uso de verdade (3.5.7 — incidente PRD-144):** o prompt do michelangelo lista as telas/paineis/listas
> NOVOS e pede o roteiro minimo do Modo A 4b: abrir um item real, executar a acao principal, esperar um
> ciclo de refresh/polling, reabrir, abrir um item fora da primeira pagina — com evidencia. Estado que some
> depois do refresh ou clique que nao faz nada e 🔴, nao "nit de UX".

#### 2.9.1 — Detectar UI e pre-condicoes

Detectar trabalho de interface por QUALQUER um (mesma regra do Passo 10 da `/prd`):
(a) secao **"Frontend / Interface"** da PRD Tecnica preenchida (nao vazia/"N/A"); (b) **componentes
de UI nas tasks**. Nenhum dos dois → pular a Fase 2.9 e ir para a Fase 3. (Nao use `Skip HTML
Roadmap` como gatilho — o default `Nao` dispararia em PRD backend; veja a nota no Passo 10.0 da
`/prd`.)

Bypass: `HARNESS_SKIP_MICHELANGELO=1` pula a fase (mesma logica dos outros bypasses — uso restrito,
ex.: PRD de UI trivial ja auditada manualmente).

#### 2.9.2 — Rodar o michelangelo (Modo A — tela construida)

Suba **um** agent `michelangelo` (subagente, contexto limpo) — **na mesma mensagem do ciclo 1 da
Fase 2** (2.5.0; se a Fase 2 for pulada por working tree limpo, dispare sozinho aqui). A evidencia
e **Playwright headless gravando PNG** na pasta de screenshots do Perfil; o browser pane e sonda
opcional de UMA tentativa (PLATAFORMAS.md §7). **Modelo:**
Perfil → "Agentes do harness (modelos)" → "Modelo do michelangelo"; se `opus`/`fable`, passar
`model: "<valor>"` (ausente/sonnet = default). Esforco: herda o da sessao (Passo 0) — nada a passar.

```
subagent_type: "michelangelo"
description: "Validacao de UX construida — PRD-NNN"
prompt: """
Audite a UX das telas que a PRD-NNN CONSTRUIU/ALTEROU (MODO A — a tela existe, veja-a rodando).
Telas/rotas alteradas pela PRD: <listar as URLs/paginas, da Base URL local do Perfil>.
Leia o .claude/PERFIL-RESUMO.md (fallback: PERFIL-PROJETO.md) e, se existir, prds/PRD-NNN-<slug>/REVIEW-michelangelo.md
(a revisao do design PROPOSTO): confirme se cada 🔴/🟠 de UX de la foi resolvido na tela construida.
EVIDENCIA (canonico, PLATAFORMAS.md §7): capture cada tela com `npx playwright screenshot "<url>"
<pasta-de-screenshots do Perfil>/PRD-NNN-<tela>.png`, tambem em 375px (--viewport-size=375,812), e
teste os estados (loading, vazio, erro). O browser pane e sonda OPCIONAL de UMA tentativa — se
falhar, escreva "pane indisponivel" no relatorio e siga 100% Playwright; NAO retente. Se o campo
"Verificacao visual (agentes)" do Perfil ja disser que o pane nao funciona nesta maquina, nem tente.
Critique pelas 10 lentes de UX. Devolva o relatorio com veredito (Excelente / Bom com ajustes
/ Precisa repensar), placar por severidade, Top 3 e os CAMINHOS dos PNGs como evidencia. Nao altere
codigo — apenas reporte. Salve o relatorio em prds/PRD-NNN-<slug>/REVIEW-michelangelo.md (sobrescreva;
marque no topo "AUDITORIA pos-execucao").
"""
```

#### 2.9.3 — Triagem e gate

Apresente ao usuario o **veredito + placar + Top 3** e os screenshots. Entao:

- **🔴 de UX** (fluxo quebrado, acessibilidade que exclui, estado essencial ausente, alerta critico
  escondido, regressao visual grave): se a correcao for **trivial** e dentro do escopo da PRD,
  corrija via `Edit` (o hook `lint.sh` revalida; re-rode so o spec tocado se houver) e registre em
  "UX corrigido na Fase 2.9".
  > **Correcao de UX nao-trivial que o usuario mandou fazer vai para o `dedalo` (Modo R — 2.9.0)**,
  > nao para esta sessao nem para um hefesto: quem construiu a tela tem o partido, os tokens e o
  > precedente na cabeca e corrige sem desmanchar o sistema. Passe o `REVIEW-michelangelo.md`, a
  > lista de achados a atacar e o caminho das telas; exija o relatorio achado a achado. Depois que
  > ele voltar, **revalide o ponto tocado** (novo `npx playwright screenshot` do PNG) antes de seguir — a auto-checagem
  > abaixo continua sendo sua.
  >
  > **Em GRUPOS DISJUNTOS, como na 2.5 (2.12.0).** Varios 🔴 de UX em **telas/componentes
  > diferentes** sao trabalho independente: agrupe por tela/componente alvo e dispare **um
  > `dedalo` por grupo, na MESMA mensagem**. Serie so quando dois achados disputam o mesmo
  > arquivo (ou o mesmo token de design). Anuncie o plano antes de disparar — *"3 grupos:
  > listagem / modal de envio / estados vazios"* — e leve a linha para o Output Esperado.
  > Achado trivial e isolado nao espera achado estrutural.
  Se **nao for trivial**: NAO corrija por conta propria — consulte a
  **decisao de tolerancia de UX da Entrevista unica (Passo 0.3)**: decisao (a) = aceite o achado,
  abra DT na Fase 5 e siga **sem parar** (registre `aceito pela decisao de decolagem`); decisao
  (b), ou entrevista sem essa decisao = pare e peca decisao ao usuario (corrigir agora / aceitar e
  abrir DT). 🔴 nao resolvido, nao aceito na entrevista e nao aceito aqui = nao prosseguir para o
  commit.
- **🟠 Alto:** depende do **piso de severidade** (`.claude/harness.env` → `HARNESS_REVIEW_SEVERITY_FLOOR`,
  ausente = `critico`; Perfil sobrescreve):
  - **piso `critico`** (default): **não bloqueia e não pede aceite** — vira candidato a DT na Fase 5,
    como os 🟡/🔵. (Promova a 🔴 só se for risco real disfarçado.) Não interrompe o fluxo.
  - **piso `alto`/`tudo`:** corrigir se trivial, ou aceitar explicitamente (decisao do usuario) e
    mandar para a Fase 5 como candidato a DT.
- **🟡 Medio / 🔵 Nit:** nao bloqueiam — viram input da **Fase 4** (roadmap manual, ponto de olho
  humano) e/ou da **Fase 5** (DT). Nunca disparam correcao automatica.

> **Auto-checagem:** o michelangelo foi chamado quando ha UI? Os 🔴 de UX foram resolvidos — ou o
> aceite foi **do usuario** (nunca seu)? Se "nao" — nao siga para a Fase 3.

#### 2.9.4 — Output esperado

```
## Fase 2.9 — Validacao de UI/UX construida (michelangelo)
- Telas auditadas: <lista> | "n/a — PRD sem interface (fase pulada)"
- Veredito: <Excelente | Bom com ajustes | Precisa repensar>
- Placar: 🔴 N · 🟠 N · 🟡 N · 🔵 N
- Plano de correcao de UX: <N grupos disjuntos (<tela1> / <tela2>) | inline trivial | n/a>
- 🔴 resolvidos na fase: <lista arquivo:linha> | nenhum
- Aceitos pelo usuario (→ DT na Fase 5): <lista> | nenhum
- Evidencias: <pasta de screenshots>
```

---

### Cauda de fechamento (Fases 3-5) — PARALELIZE, nao enfileire (2.3.0)

> **Por que:** medicao real (23/07/2026) mostrou ~40 min de cauda serial apos o review fechar —
> roadmap, DTs, docs, um apos o outro. Nada na cauda depende de nada: sao escritas independentes
> sobre um working tree ja estavel.

Assim que a Fase 2 fechar (e a triagem 2.9.3 resolver os 🔴 de UX — o relatorio do michelangelo
ja chegou, ele correu em paralelo desde o ciclo 1), dispare **na MESMA mensagem**:

- **SO se a 4.0 decidiu gerar o HTML** (opt-in `Skip HTML Roadmap = Nao`): **1 subagente
  `hefesto`** (fallback `general-purpose` + contrato) para a **Fase 4.2** (JSON do roadmap +
  HTML a partir do template) — 100% mecanica. Passe no prompt: numero/slug da PRD,
  branch/commit (voce ja tem), a lista de fluxos/integracoes/schema que voce ja levantou, e o
  caminho do template. No caso default (sem HTML), nao ha subagente de cauda nenhum.
- **A sessao pai, em paralelo,** redige a Fase 3 (mensagem de commit), a Fase 4.1 (bloco Markdown)
  e compila a Fase 5 (DTs — os insumos sao os relatorios que SO a sessao pai tem: triagem da Fase
  2, desvios dos hefestos, achados aceitos).
- **Fila do manual vivo (2.6.0; SEMPRE, sem pergunta — 3.4.8):** appende UMA linha em
  `docs/manual/_fila.md` (crie com o cabecalho do formato da `/manual` se faltar):
  `| PRD-NNN | <modulos tocados> | <o que mudou em 1 frase> | <data> | pendente |` — dados que
  voce ja tem na mao; NAO gere manual aqui (a `/manual` absorve em lote depois e e ela quem
  marca "sem impacto" quando for o caso). So rode `/manual PRD-NNN` inline se o usuario pedir
  espontaneamente — e DEPOIS do Output Esperado, fora do caminho critico.

Se a 4.2 rodou: ao receber o HTML do subagente, confira que ele reusou o template integralmente
(spot-check: abre com o mesmo `<script id="roadmap-data">`) e feche o Output. Se o subagente
falhar, gere o HTML voce mesmo.

---

### Fase 3 — Mensagem de Commit Sugerida

> **Em WORKTREE, o commit e AUTOMATICO (3.4.2).** `bash .claude/hooks/harness-worktree.sh info`
> com `rotulo` ≠ `principal` → **execute** o commit desta fase (add escopado aos arquivos da PRD
> + docs/DTs tocados) na branch `wt/<rotulo>`. Merge e push continuam humanos
> (`fechar <rotulo> --merge`). No checkout principal: so redigir, como sempre.

> **Pre-requisito:** Fase 2 fechou (limpa ou pulada por ambiente). Se foi ABORT, esta fase
> NAO executa.

Gerar texto cru pronto para o usuario colar manualmente. Sem co-author, sem assinatura.
**NAO fazer commit automaticamente.**

**Formato:**

```
PRD-NNN: <resumo curto da entrega em uma frase>

- <bullet curto: nova tabela/migration>
- <bullet curto: novos endpoints / arquivos relevantes>
- <bullet curto: mudancas de UI>
- <bullet curto: DTs absorvidos (se aplicavel)>
- <bullet curto: testes E2E + acceptance adicionados>
- <bullet curto: code review Codex — ciclo N limpo / M bloqueantes corrigidos>
```

**Regras:**
- Linha 1 e o titulo (max 72 caracteres). Tom imperativo e direto.
- Bullets descrevem mudancas-chave. Maximo 6-8 bullets.
- Citar Codex review explicitamente — torna o passo de revisao visivel no historico.
- Se DTs foram absorvidos, citar IDs (ex: "DT-027, DT-028 absorvidos").

---

### Fase 4 — Roadmap de Teste Manual

> **Pre-requisito:** Fase 3 concluida.

Suplemento ao acceptance test automatizado: lista de pontos que **precisam de olho humano**
porque o E2E nao cobre bem (alinhamento visual, integracao externa real, percepcao de UX,
smoke tests cross-browser).

A fase entrega **dois outputs** complementares:

- **4.1 — Bloco Markdown (resumo na resposta).** Sempre gerar.
- **4.2 — HTML standalone interativo.** **OPT-IN desde a 2.4.0** — so gera quando a PRD pede
  explicitamente. Era a peca mais demorada da cauda (~metade dos 40 min medidos) e o default
  ligado cobrava esse custo de TODA PRD, inclusive as que ninguem abriria no navegador.

---

#### 4.0 — Decidir se gera HTML

Antes de tudo, ler a PRD de produto (`prds/PRD-NNN-*/PRD-NNN-*.md`) e localizar a linha
`Skip HTML Roadmap` no Resumo Executivo. Trate como case-insensitive e tolerante a
acentuacao:

- `Nao` / `nao` / `Não` (explicito — a PRD PEDE o HTML) → executar 4.1 **e** 4.2.
- `Sim` / `sim` / **ausente** → pular 4.2; entregar apenas 4.1. **(Default invertido na
  2.4.0: campo ausente agora significa "sem HTML".)**

---

#### 4.1 — Bloco Markdown (resumo na resposta)

**Conteudo obrigatorio (gerar mesmo que curto):**

```
### Roadmap de teste manual — PRD-NNN

#### Fluxos a validar visualmente
1. <fluxo + URL/pagina + o que conferir (ex: alinhamento, animacao, responsividade)>
2. ...

#### Integracoes externas (smoke test)
- <integracao do Perfil>: <enviar/disparar de verdade para entrada de teste? confirmar
  marcacao de idempotencia no banco?>
- <cron/worker, se houver>: <forcar execucao? conferir logs?>

#### Banco de dados
- Schema: <tabelas alteradas — abrir o cliente de banco e conferir colunas/indices/FKs>
- Dados: <fixtures necessarias para reproduzir o cenario?>

#### Edge cases visualizados
- <cenarios que merecem atencao manual: timezones, tokens expirados, multiplos perfis
  simultaneos, etc.>

#### Tempo estimado
~N minutos
```

**Quando o roadmap pode ser curto:** PRDs puramente de backend/CRUD sem UI nova. Ainda
assim, deixar pelo menos uma linha confirmando ("Sem fluxo visual novo — a familia da PRD ja
cobre"). Nunca omitir a fase.

---

#### 4.2 — HTML standalone interativo (OPT-IN — gerar so quando Skip = Nao explicito)

Ferramenta complementar para o usuario marcar Aprovado/Rejeitado/Ajuste por item, escrever
notas livres e gerar relatorio Markdown via IA ao final.

**Procedimento:**

1. **Capturar metadados via git:**
   ```bash
   git rev-parse --abbrev-ref HEAD       # branch
   git log -1 --format=%h                # commit base (hash curto)
   ```

2. **Montar JSON do roadmap** (mesmo conteudo do bloco 4.1, estruturado):

   ```json
   {
     "prd": {
       "numero": "PRD-NNN",
       "titulo": "<titulo curto>",
       "resumo": "<1-2 frases>",
       "data_geracao": "YYYY-MM-DD",
       "tempo_estimado": "~N minutos",
       "branch": "<git rev-parse>",
       "commit_base": "<git log -1 --format=%h>"
     },
     "secoes": [
       {
         "nome": "Fluxos a validar visualmente",
         "icone": "F",
         "itens": [
           {
             "id": "f-001",
             "titulo": "<o que testar — frase curta imperativa>",
             "objetivo": "<por que isso precisa de olho humano>",
             "passos": ["<passo 1>", "<passo 2>"],
             "criterio_aceitacao": "<estado APROVADO observavel>",
             "arquivos": ["<path/arquivo>"],
             "urls": ["<base-url-local-do-Perfil>/..."]
           }
         ]
       },
       { "nome": "Integracoes externas (smoke test)", "icone": "I", "itens": [...] },
       { "nome": "Banco de dados", "icone": "B", "itens": [...] },
       { "nome": "Edge cases visualizados", "icone": "E", "itens": [...] }
     ]
   }
   ```

   Convencao de `id`: `f-NNN` (Fluxos), `i-NNN` (Integracoes), `b-NNN` (Banco), `e-NNN`
   (Edge cases). Secoes sem itens ficam com `itens: []` (HTML omite secao vazia). Use a
   **Base URL local** do Perfil → Aplicacao nas `urls`.

3. **Read** `prds/_templates/TEMPLATE-ROADMAP-TESTE-MANUAL.html`.

4. **Write** em `prds/PRD-NNN-<slug>/roadmap-teste-PRD-NNN.html` reaproveitando o template
   **integralmente**, substituindo APENAS o conteudo entre `<script id="roadmap-data"
   type="application/json">` e `</script>` pelo JSON real do passo 2. Nao alterar
   CSS/JS/HTML do template.

5. **Citar a URL local no output da fase** (montada a partir da Base URL local do Perfil):
   ```
   <base-url-local-do-Perfil>/prds/PRD-NNN-<slug>/roadmap-teste-PRD-NNN.html
   ```

**Modo de geracao de relatorio (opcional):** o template chama um endpoint de backend para
sumarizar as notas via IA. Esse endpoint e **opcional e especifico do projeto** — se o
projeto nao tiver, o template cai no **modo fallback** automaticamente: quando aberto via
`file://` (ou sem o endpoint), o modal pede a API key, salva em `localStorage` do navegador
e o botao "Baixar .md" dispara um download local. O fluxo de marcacao Aprovado/Rejeitado
funciona em qualquer modo, sem backend.

---

### Fase 5 — Documentacao de DTs (Issues Deferidas)

> **Pre-requisito:** Fase 4 concluida.

> **ECONOMIA DE DTs (25/08) — criar custa 30s, resolver custa 30+min; a fila chegou a 98.**
> Antes de promover QUALQUER item a DT, aplique nesta ordem:
> 1. **Conserta na origem:** achado com **<= ~30 min** de conserto em arquivo **ja tocado**
>    pela PRD NAO vira DT — ou entrou num ciclo de correcao (Fase 2), ou e rebaixado a
>    informativo no relatorio. DT e divida CONSCIENTE e adiada, nao caixa de saida do review.
> 2. **Ideia nao e DT:** "seria bom ter", melhoria de UX sem bug, feature — **1 linha** em
>    `prds/backlog/IDEIAS.md`. Sem custo de nao fazer = sem DT.
> 3. **Quem sobrar** nasce com o gate de admissao (o guard-dt NEGA o Write sem isto):
>    prova `arquivo:linha`, linha `**Duplicata:** nenhuma (INDEX verificado em AAAA-MM-DD)`
>    ou `similar a DT-NNN — <distincao>`, e `**Balde:** lote | prd | decidir`.
>    **Numero:** NUNCA max(INDEX)+1 — reserve com `bash .claude/hooks/harness-worktree.sh reservar DT` (3.4.32: o
>    guard-dt NEGA numero nao reservado; medido 10/09: a exec da PRD-140 colidiu DT-578/579 com a worktree ideias;
>    3.5.0: o numero sai da FAIXA do dev — `DT-10001…` para quem nao e o bloco 0 e normal, nunca renumere).
>    Com a fila acima de `HARNESS_DT_WIP_MAX` (default 60) so entra Alta/bloqueante.

Coletar tudo que foi visto durante a PRD mas **nao foi tratado** e poderia virar debito
tecnico futuro. Fontes:

1. **Sugestoes dos revisores (Fase 2.3 — Codex e/ou sherlock):** estilo, refactor, dead
   code, naming nao corrigidos.
2. **Falsos positivos justificados (Fase 2.5):** podem indicar codigo confuso que merece
   refactor ou documentacao.
3. **Desvios e observacoes dos relatorios do hefesto (Fase 1.3):** problemas vistos fora
   do escopo das tasks, decisoes tomadas em ambiguidade.
4. **Bugs vistos em codigo nao-escopo:** durante leitura/exploracao apareceu algo errado em
   arquivo nao alterado pela PRD.
5. **Workarounds aplicados:** correcoes que resolvem o sintoma mas deixam a causa-raiz para
   outra PRD.
6. **Findings da Fase 4 (roadmap manual)** que o usuario nao quer abordar agora.

**Formato de saida:**

```
### Issues Deferidas — PRD-NNN

#### Candidatos a DT (recomendados)
1. <titulo curto> — <severidade: baixa/media/alta>
   - Origem: <Codex sugestao ciclo N | falso positivo | bug colateral | workaround>
   - Arquivo:linha (se aplicavel)
   - Descricao: <2-3 frases>
   - Acao recomendada: <criar DT-XXX | absorver na proxima PRD | ignorar>

2. ...

#### Sem issues deferidas
> Se nao houver nada relevante: registrar literalmente "Sem issues deferidas — PRD entrega
> tudo dentro do escopo, Codex sem sugestoes pendentes."
```

**Triagem de CLASSE antes de listar (3.2.2) — a regra que segura a fila de DTs.** Cada item
coletado acima recebe UMA classe, e so duas delas podem virar `DT-XXX`:

| Classe | Criterio | Destino |
|---|---|---|
| **bug** / **divida** | comportamento errado hoje, ou atalho que cobra juros (retrabalho, risco, teste fragil) | candidato a DT (lista abaixo) |
| **ideia** | feature/desejo de produto/"seria bom", inclusive TODO item de "Observacoes / Melhorias Futuras" da PRD e toda 🔵 de revisor | **1 linha** em `prds/backlog/IDEIAS.md` (crie pelo `prds/_templates/TEMPLATE-IDEIAS.md`), origem `PRD-NNN`. **Nunca um arquivo DT por ideia.** |
| **harness** | agente travou, gate errado, skill se perdeu — problema do harness, nao do produto | 1 linha em `.claude/.harness-run/harness-incidentes.jsonl` + cite no Output. **Nao e DT do projeto.** |
| **dimensionamento** | estouro de envelope da 1.3 | ja esta na telemetria; nao repita aqui |

**Teto: no maximo 3 candidatos a DT "recomendados" por PRD.** Mais que isso e sinal de que voce
esta listando ideia como divida, ou de que a PRD deixou bug demais para tras (e ai o problema e
outro — diga isso). O restante (bug/divida de severidade baixa) entra na secao "Observacoes /
Melhorias Futuras" da PRD como linha, sem arquivo, e o `/dt-sweep` reavalia quando a fila
estiver sendo saneada. Medido em 22/08/2026: PRD-120 do core do Taurus gerou 8 DTs a partir da
propria secao de Melhorias Futuras — nenhum deles era divida.

**Acao opcional ao final:** se algum candidato `bug`/`divida` for severidade alta, oferecer ao usuario:
> Quer que eu rode `/dt <titulo>` para criar o documento de DT formal agora?

Nao criar DT automaticamente — sempre confirmar com o usuario. Ideias vao para o `IDEIAS.md`
**sem** confirmar (e uma linha, reversivel, e nao entra em fila nenhuma).

#### 5.6 — Fechar o loop captura→prevencao (armadilhas de teste)

Os **"Desvios e observacoes" dos hefestos** (Fase 1.3) e os tropecos de teste/seed que custaram
re-trabalho NESTA execucao nao podem se perder no relatorio — essa e a falha que a captura RAG
por-agente (desligada por custo, `HARNESS_RAG_CAPTURE_AGENTS=0`) deixava acontecer. Cure-os aqui:

1. **Tropeco de teste/seed reutilizavel?** (FK no cleanup, id entre conexoes, coluna inexistente,
   lock de scheduler, `LIMIT`+data, assert fragil, ou similar do projeto) → **adicione uma linha
   curada na secao "Armadilhas de teste/seed (E2E)" do Perfil** (`.claude/PERFIL-PROJETO.md`):
   **o que** quebra + **como** contornar. E o que faz o proximo `hefesto` ja nascer sabendo.
2. **Decisao de arquitetura** (nao de teste) → registre em `.claude/memory/` (copie o
   `_TEMPLATE-memoria.md`, type project) para o RAG indexar.
3. **Cite no Output** o que entrou na carta (ex.: *"carta de teste +2: FK RESTRICT em leads_*,
   MAX(id) no seed de Y"*).

Nao infle: so entra o que pouparia tempo de outra pessoa. Tropeco de uma vez so nao vira regra.

> **Carimbo de procedencia (2.15.0) — obrigatorio na entrada nova.** Toda linha que voce
> acrescentar ao Perfil sai como
> `**[AAAA-MM-DD · PRD-NNN]** <o que quebra + como contornar>`. Sem procedencia o Perfil so
> cresce e nunca encolhe: ninguem sabe se a armadilha ainda vale, e podar vira chute. Com
> data e origem, a poda do `/deus` consegue provar que uma entrada morreu (arquivo que ela
> cita nao existe mais, PRD revertida) em vez de opinar que "parece obsoleta".
>
> **Tocou o Perfil? O resumo acompanha NA MESMA PASSADA** — atualize o `PERFIL-RESUMO.md`
> e feche com `bash .claude/hooks/perfil-frescor.sh --carimbar`. Sem isso, a proxima
> execucao abre no Passo 0.0.1 com `DEFASADO` e paga a regeracao no caminho critico.
>
> **Poda com prova (3.4.26) — depois de carimbar as entradas novas**, rode
> `bash .claude/hooks/perfil-poda.sh` (read-only, ~30 s). Em `HARNESS_PERFIL_PODA='sugerir'`
> (default) cole o `PODA-RESUMO` e as linhas 🟢 no Output, secao "Perfil — candidatos a poda".
> Em `auto-verde` rode `bash .claude/hooks/perfil-poda.sh --aplicar-verde` (o 🟢 provado vai
> para `.claude/PERFIL-ARQUIVO.md` com a evidencia — reversivel) + `perfil-frescor.sh --carimbar`,
> e inclua `PERFIL-PROJETO.md`, `PERFIL-RESUMO.md` e `PERFIL-ARQUIVO.md` no commit sugerido.
> 🟡 nunca sozinho — e decisao humana no `/deus` (P2). Knob `off`: pule este bloco.

---

## Output Esperado

**Antes de montar o resumo, feche a telemetria** (uma vez), com os contadores reais desta execucao
— ela imprime o bloco "## Telemetria" para voce colar no fim do output:

```bash
bash .claude/hooks/harness-metrics.sh stop PRD-NNN-exec \
  --tasks=<N> --ciclos=<N de review> --subagents=<hefestos+dedalos+sherlocks+michelangelo> \
  --waves=<N de GERACOES de despacho da Fase 1.3 (cada vez que voce disparou executores)> \
  --vivos-max=<maior N de executores vivos ao mesmo tempo> --limitou=<dependencias|duelo|teto|tasks-curtas|parcial-folego> \
  --preset=<preset> --models="hefesto sonnet, dedalo <modelo>, sherlock <modelo>" \
  --review-modo=<dupla|solo-2|solo|partes> \   # 3.4.24: o modo REAL da Fase 2 (painel por dev: taxa de dupla)
  --esforco-final=<effort de get_session self AGORA>   # 3.5.4: o esforco efetivo (quem trocou no Desktop depois do Passo 0 gravava o velho)
```

> **Tokens e turnos sao por mensagem UNICA (3.5.3).** O stop passou a deduplicar o usage por
> `message.id` (o transcript grava uma linha por bloco de conteudo com o mesmo usage cumulativo):
> `tokens_output`/`turnos`/`out_tps` anteriores a 13/09/2026 estao inflados (~2,4x na pai). O
> stop tambem grava `tokens_thinking_pct` (raciocinio invisivel = output menos texto+tool_use
> visiveis): medido na PRD-142-b, **83% dos 2,28M tokens dos executores eram raciocinio** — e o
> primeiro numero a olhar quando uma exec demora com poucos turnos.

> **Telemetria no git (3.4.22, item 16):** o `stop` ja deixa STAGED os arquivos desta maquina
> (`prds/_metrics/runs/<dev>@<host>.jsonl` e `prds/_metrics/tasks/<dev>@<host>.jsonl`) — eles
> entram no commit escopado do fechamento como qualquer outro arquivo; nao os tire do stage e
> nunca faca `git add prds/_metrics/` inteiro.

> **Telemetria honesta (regra de leitura):** o bloco traz `out_tps` (tokens de output por
> segundo), a **espera OCIOSA medida** e o **fator de paralelismo**. `out_tps < 30` com
> duracao alta **e sem subagente ocupando a parede** = espera humana (prompt pendurado, pausa
> do operador) — **NAO conclua nada sobre preset/modelo** nem proponha ajuste de config com
> base nessa duracao. Se o bloco imprimir o aviso ⚠️ de provavel espera, repasse-o ao usuario
> e aponte o roteiro forense: `.claude/PLAYBOOK-TELEMETRIA.md`.
>
> **Aviso de execucao SERIAL (2.12.0):** se o bloco imprimir `parallel_factor` < 1,3 com 10+
> subagentes, **repasse ao usuario e diga onde serializou** — quais grupos eram disjuntos e
> foram enfileirados (tipicamente a correcao da Fase 2). Nao maquie o numero: ele existe
> exatamente para a regra de paralelismo deixar de depender de disciplina.

Apresentar ao final, refletindo as fases executadas:

```
## PRD-XXX Executada

### Fase 1 — Implementacao

| Task | Status | Arquivos |
|------|--------|----------|
| TASK-001 | OK | arquivo1, arquivo2 |
| TASK-002 | OK | arquivo3 |
| ... | OK | ... |
| TASK-NNN-acceptance-testing | OK (X passed, 0 failed) | <specs PRD-NNN> |
| TASK-NNN-doc-raiz | OK | <doc raiz>, prds/debito_tecnico/INDEX.md |

#### Paralelismo e tempo (3.2.1)
- Grafo: <T> tasks de trabalho, onda 1 com <L1> vagas reais — <passou no gate de largura |
  reaberto: <N> requires derrubados (<TASK-XXX> — sem artefato); <N> barriers preservadas;
  <N> mutex (<par> — <recurso>)>
- Envelope de 45 min por task: <todas dentro | estourou em <N>: TASK-XXX <Nmin>, ...>
  (→ DT de dimensionamento na Fase 5)
- Pipeline (3.5.3): teto de vivos <N do CARGA|vivos> · vivos_max <N> · limitou <motivo> ·
  PARCIAIs continuados por executor novo <N> · grande-ok usados <0|1>
- Testes por hook: rodadas negadas pelo guard-playwright <N> (por despacho: TASK-XXX <N/4>, ...)
- Duracao por etapa: [A] implementacao <Nmin> · [B] validacao paralela <Nmin> ·
  [C] correcoes <Nmin> · [D] verificacao focada <Nmin>
- Checkpoints: <nenhum | 90min: <acao tomada> | 120min: causa dominante = <uma das 8>>
- **Total de parede ativa: <Nmin>** — <dentro do SLO de 2h | ESTOUROU: <causa dominante>>

#### Execucoes de teste (3.2.1 — Contrato de Testes)
- Testes locais de executor: <N> (um por task que tinha spec isolavel; <N> declararam n/d)
- Familia completa da PRD: <N>x — <1x, fluxo normal | 2x: rerun por correcao transversal (<condicao>)>
- Suite completa: <1x (PRD multiplo de 5) | pulada (PRD nao multiplo de 5) | n/a (sem framework)>
- Specs focados apos correcao: <N> execucoes, <M> specs
- Reruns por correcao transversal: <nenhum | N — condicao <1..7> disparada em <arquivo>>
- Ciclos de review: <N>

#### Verificacoes
- Sintaxe: OK (N arquivos)
- Acceptance Testing: APROVADO (X passed) — evidencias na pasta de screenshots do Perfil
- Suite E2E completa (so multiplos de 5): OK / N passed, M failed / pulada
- Alteracoes de schema: OK / Executada(s): XXXX
- Documentacao: doc raiz atualizada

### Fase 2 — Code Review Dupla-Cega (Codex + sherlock)
- Modo: <DUPLA-CEGA | SOLO-2 (2 sherlocks, lentes A/B — codex: <motivo, ex. limite de uso ate <data>>) | CODEX-SOLO (sherlock: <motivo>) | PARTES (N sherlocks)> — `--review-modo=<dupla|solo-2|solo|partes>` no stop
- Modelo do sherlock: ciclo 1 <sonnet (default) | opus (Perfil)> · ciclos 2+ sonnet (refino)
- Limite de ciclos: <N (Perfil) | 4 (default) | sem limite (Perfil = 0)>
- Ciclo 1: <N bloqueantes / M sugestoes> — confirmados pelos 2 revisores: <K de N>
  - Plano de correcao: <N grupos disjuntos (<alvo1> / <alvo2> / ...) despachados juntos |
    correcao inline pela sessao (1-2 triviais) | 1 grupo — todos os achados no mesmo arquivo>
  - Bloqueantes corrigidos: <K>
    - <arquivo:linha — descricao curta da correcao — [apontado por: ambos | codex | sherlock]>
  - Falsos positivos justificados: <J>
    - <arquivo:linha — justificativa>
- Ciclo 2..N: <limpo / N bloqueantes / nao executado> (um bullet por ciclo executado —
  com o plano de correcao do ciclo, no mesmo formato do ciclo 1)
- Ultimo ciclo com bloqueantes restantes: <nao houve | decisao do usuario: SEGUIR
  (bloqueantes aceitos → DTs na Fase 5) | ABORT>
- Sugestoes pendentes (informativo): <N> — passadas para a Fase 5
- Ciclo final: <numero | numero ⚠️ com bloqueantes aceitos | ABORT>
- Relatorios: <pasta-de-relatorios>/PRD-NNN-ciclo*.md (Codex) + PRD-NNN-sherlock-ciclo*.md

> So registrar "pulado por ambiente" quando NENHUM revisor rodou (Codex indisponivel E
> sherlock indisponivel/bypass, ou working tree limpo) — e ai o aviso e DESTACADO, nao
> uma nota de rodape.
> Se ABORT: bloco em destaque + Fases 3/4/5 nao executam. Se SEGUIR com bloqueantes
> aceitos: a decisao foi do USUARIO no gate 2.7 — registrar isso textualmente no bloco.

### Fase 2.9 — Validacao de UI/UX construida (michelangelo)

- Telas auditadas: <lista> | "n/a — PRD sem interface (fase pulada)"
- Veredito: <Excelente | Bom com ajustes | Precisa repensar>
- Placar: 🔴 N · 🟠 N · 🟡 N · 🔵 N
- Modelo do michelangelo: <sonnet (default) | opus (Perfil)>
- Plano de correcao de UX: <N grupos disjuntos (<tela1> / <tela2> / ...) | inline trivial | n/a>
- 🔴 resolvidos na fase: <lista arquivo:linha> | nenhum   (por quem — inline trivial | dedalo Modo R)
- Aceitos pelo usuario (→ DT na Fase 5): <lista> | nenhum
- Evidencias (screenshots): <pasta> | n/a

### Fase 3 — Mensagem de Commit Sugerida

```
PRD-NNN: <resumo curto da entrega em uma frase>

- <bullet curto: nova tabela/migration>
- <bullet curto: novos endpoints / arquivos relevantes>
- <bullet curto: mudancas de UI>
- <bullet curto: DTs absorvidos (se aplicavel)>
- <bullet curto: testes E2E + acceptance adicionados>
- <bullet curto: code review Codex — ciclo N limpo / M bloqueantes corrigidos>
```

> Texto cru pronto para colar manualmente. Sem co-author, sem assinatura.

### Fase 4 — Roadmap de Teste Manual

- 4.1 Markdown (sempre presente, mesmo que curto): conteudo gerado conforme template da
  Fase 4 acima.
- 4.2 HTML interativo: <gerado em `prds/PRD-NNN-<slug>/roadmap-teste-PRD-NNN.html` (opt-in
  Skip=Nao) | pulado (default 2.4.0 — sem opt-in)>
  - URL local (se gerado): <base-url-local-do-Perfil>/prds/PRD-NNN-<slug>/roadmap-teste-PRD-NNN.html

### Fase 5 — Issues Deferidas

(conteudo gerado conforme template da Fase 5 acima — "Sem issues deferidas" e resposta
valida)

### DTs Resolvidos (se aplicavel)
- DT-XXX: [titulo] — Resolvido (PRD-NNN)
- Gate das duas pontas (Fase 1.4.6): <saida bruta do grep colada — arquivo do DT + INDEX>

> "INDEX.md atualizado: OK" sem a saida colada nao vale como fechamento: e exatamente a
> afirmacao que ja saiu errada (arquivo do DT `Pendente` com o INDEX certo, pushados juntos).

### Decisoes pendentes (modo autonomo — 3.4.23)
- <duvida que surgiu no meio do run> → decidido por default: <qual> (Passo 0.3, item 7) | "nenhuma"

### Telemetria
(colar o bloco "## Telemetria" gerado pelo harness-metrics.sh stop — duracao, volume e tokens
desta execucao; o comparativo entre execucoes fica em prds/_metrics/harness-runs.jsonl)

### Proximo passo
Revisar alteracoes, executar o roadmap manual da Fase 4, e fazer commit quando satisfeito
usando a mensagem da Fase 3.
```

> Em ABORT (Fase 1 com erro nao recuperavel ou Fase 2 ABORT): substituir o output pelo bloco:
>
> **PRD-NNN bloqueada — intervencao humana necessaria.** Ver detalhes em
> <relatorios/erros>. Revisar e decidir entre falsos positivos em massa, retrabalho ou
> continuar manualmente. Fases 3/4/5 nao executadas.

## Regras gerais

- **Todo conteudo em portugues brasileiro** (exceto termos tecnicos, nomes de
  funcoes/tabelas/arquivos).
- **NAO fazer git commit/push** — a skill so sugere a mensagem (Fase 3); o usuario commita.
  Unica excecao git: o `git pull --ff-only` de sincronizacao do Passo 0.1 (avanco/leitura,
  nao altera historico nem remoto).
- **Datas relativas → absolutas** ao escrever em documentos (ex: "ontem" → data real).
- **O Perfil e a fonte da verdade** para caminhos, comandos e regras de negocio. Em conflito
  entre esta skill e o Perfil, o Perfil vence.
