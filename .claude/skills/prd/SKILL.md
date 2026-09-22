---
name: prd
description: "Cria uma PRD completa do projeto — discovery paralelo, PRD de produto (aceite humano), maquete opcional (ariadne), PRD tecnica com o front projetado pelo dedalo + tasks + gates adversariais (beholder/michelangelo). Use quando pedirem para criar/especificar uma feature, correcao ou PRD nova."
---

# Skill: Criar PRD

Cria uma PRD completa do projeto com todos os documentos padronizados (PRD de produto,
PRD Tecnica, Tasks, Prompt de Execucao). Stack-agnostica: le os valores especificos do
projeto em `.claude/PERFIL-PROJETO.md`.

> **Multi-AI (2.0.0).** No Codex, o discovery paralelo do Passo 2 usa **subagentes
> nativos** (ver `.claude/PLATAFORMAS.md` §3 — equivalencias de ferramentas) e
> `AskUserQuestion` vira pergunta textual simples. O resto do fluxo e identico nos
> dois hosts.

> **ENTREVISTA UNICA no inicio + fluxo autonomo (2.4.0).** Todas as decisoes humanas sao
> colhidas numa unica pergunta em lote no Passo 0.1 (escopo, split, politica de DTs/inovacao,
> modo de conducao). No modo **TURBO (default)** a skill roda da entrevista ate o fim da Fase 2
> sem parar, com **UM aceite no final** (Passo 11). No modo **CLASSICO** (escolhido na
> entrevista) mantem-se a parada no aceite da PRD de produto (Passo 6.2) — util para conta
> apertada ou escopo incerto. A estrutura em duas fases persiste no disco em ambos os modos
> (`_discovery.md`): sessao caiu no meio → a `/prd` detecta e retoma sem refazer discovery.

> **Modelo da sessao (recomendacao).** Criar PRD e **julgamento** (discovery, sintese, red-team) —
> rode `/prd` numa janela **Opus** quando possivel. O **preset de esforco** do Perfil ajusta os
> agentes automaticos (tony-stark, beholder, atlas, Agent A do discovery). A **execucao**
> (`/prd-exec`) e que roda barato em Sonnet.

> **Telemetria (automatica) — por fase.** Como a `/prd` roda em duas fases (possivelmente em
> sessoes diferentes), cada fase tem seu cronometro proprio — medir uma so cruzando o aceite humano
> inflaria a duracao. **Fase 1:** abre em `PRD-NNN-fase1` (Passo 1) e fecha no Passo 6.2 (parada para
> aceite). **Fase 2:** abre em `PRD-NNN-fase2` ao retomar e fecha no Passo 11. Mede duracao + tokens
> e grava o comparativo em `prds/_metrics/`. Best-effort — nunca bloqueia.

> **Fallback de agente e BARULHENTO, nunca silencioso (2.3.0).** Chamada `Agent` falhou com
> `Agent type '<nome>' not found` (peter-quill, tony-stark, atlas, beholder, michelangelo, ariadne,
> dedalo)? O agente
> esta **invisivel ao host** (causa conhecida: CRLF + `: ` na description — `bash
> .claude/harness-doctor.sh` detecta). Nao re-tente o mesmo tipo no run; **avise o usuario na hora**
> (qual sumiu + conserto: `dos2unix .claude/agents/*.md`); no fallback (`Explore` para o
> peter-quill, `general-purpose` para os demais) **cole o contrato do agente** (corpo do
> `.claude/agents/<nome>.md`) no prompt; e registre `fallback: <nome> → <substituto>` no resumo da
> fase. Incidente real: 21-24/07/2026 — gate de UX rodou como general-purpose sem ninguem saber.

## Uso

```
/prd Adicionar <funcionalidade>     # Fase 1: entrevista + PRD de produto, para no aceite
/prd Corrigir <bug>
/prd                                 # sem argumento — pergunta; ou, se ha PRD pendente, oferece retomar
/prd continuar PRD-NNN               # pula direto para a Fase 2 de uma PRD que ja tem produto aprovado
/prd --completo <descricao>          # 3.4.24: forca o rito COMPLETO (votacao, pre-gate, hermes Modo E,
                                     # ciclos do preset). Sem a flag o rito e o MODO LEVE (Passo 1.5) —
                                     # o COMPLETO tambem entra sozinho por RISCO. `--leve` = no-op c/ aviso.
/prd --noturno <descricao|--ideia N> # 3.4.9: decolagem HEADLESS (noturno/sem humano): NAO faz a
                                     # entrevista — adota TODOS os defaults dela + modo TURBO
                                     # NOTURNO automatico (aceite pre-assinado condicionado a
                                     # gates limpos; qualquer 🔴 = Aguardando aceite). E o modo
                                     # que o noturno v2 usa para transformar ideia em PRD.
```

## Como funciona — entrevista unica, duas fases no disco

- **Entrevista unica (Passo 0.1).** UMA pergunta em lote colhe escopo, split, politicas de
  DT/inovacao e o **modo de conducao** (TURBO default / CLASSICO). Depois dela o fluxo e
  autonomo — as sinteses intermediarias sao informativas, nao paradas.
- **Fase 1 (Passos 0 a 6).** Perfil, entrevista, discovery em paralelo, PRD de produto — e a
  **maquete da ariadne** (Passo 5.5), quando a feature tem tela nova e o usuario quis.
  Persiste o discovery em `_discovery.md` (para a Fase 2 — ou uma retomada — nao refazer).
- **Fase 2 (Passos 7 a 11).** PRD tecnica (com o **dedalo** projetando o front no Passo 7), tasks,
  PROMPT-EXECUCAO e os gates (beholder + michelangelo).
- **Aceite humano:** no TURBO, um unico, no **Passo 11** (pacote completo — e ajustes pontuais
  na tecnica/tasks sao baratos porque os gates ja convergiram). No CLASSICO, o aceite
  intermediario do Passo 6.2 continua existindo (produto barato antes do grosso), e a Fase 2
  pode rodar depois, numa janela nova — o Passo 0.0 detecta a PRD pendente e **retoma de onde
  parou** lendo o `_discovery.md`.

## Passo 0.0 — Detectar a fase (retomada vs nova)

> **PRD nascida de IDEIA (25/08 — `--ideia NNN` ou "faz a PRD da ideia NNN").** Antes do
> discovery, leia `prds/ideias/IDEIA-NNN-*.md`. Se o estado e `refinada`/`pronta-para-prd`,
> a secao "Refino" e o **discovery de produto PRE-PRONTO**: problema/valor/metrica/escopo
> minimo vs sonho/riscos ja decididos com o humano — nao re-pergunte o que ja esta la; a
> entrevista do Passo 0.1 cobre so as "Decisoes em aberto" da ideia + o que for novo. Ideia
> ainda `semente`: avise em 1 linha que o refino economizaria a entrevista, e siga normal.
> **Ao aprovar a PRD de produto:** marque a ideia `virou PRD-NNN` nas DUAS pontas (arquivo
> `**Estado:**` + celula da linha em `prds/backlog/IDEIAS.md`).

**Antes de tudo**, ao invocar `/prd`, descobrir se e uma PRD **nova** (Fase 1) ou a **retomada** de
uma que ja tem a PRD de produto aprovada (Fase 2):

1. Se o usuario chamou `/prd continuar PRD-NNN` (ou "continua/detalha a PRD-NNN") → ir direto para a
   **Fase 2** com esse numero (carregar o Perfil no Passo 0, depois saltar ao cabecalho da Fase 2).
2. Senao, varrer o disco: `Glob prds/PRD-*/`. Uma PRD esta **aguardando Fase 2** quando a pasta tem a
   **PRD de produto** (`PRD-NNN-*.md`) e o marcador **`_discovery.md`**, mas **ainda nao** tem a **PRD
   tecnica** (`PRD-TECNICA-NNN-*.md`). (Confirmacao cruzada: status `Aguardando Fase 2` no
   `prds/INDEX.md`.)
3. Achou uma ou mais pendentes?
   - Liste (numero + titulo) e **pergunte**: "Encontrei PRD-NNN (<titulo>) com a PRD de produto pronta
     aguardando detalhamento. Quer **(a) continuar** ela [Fase 2] ou **(b) comecar uma PRD nova**?"
     Aguarde.
   - **(a)** → carregue o Perfil (Passo 0) e va para o **cabecalho da Fase 2** (lendo `_discovery.md` +
     a PRD de produto). **Nao** re-rode o discovery do Passo 2.
   - **(b)** → siga a Fase 1 normal (com o pedido novo).
   - Se o usuario ja veio com um pedido novo e claro, ainda assim **mencione** a pendencia (para nao
     ficar orfa), mas atenda o pedido novo.
4. Nenhuma pendencia → **Fase 1** (Passo 0).

---

# FASE 1 — Entrevista + PRD de Produto (para no aceite)

## Passo 0 — Carregar o Perfil do Projeto

**Antes de tudo**, leia `.claude/PERFIL-PROJETO.md`. Ele define: stack, caminhos CLI,
banco de teste, baseURL, estrutura de diretorios, integracoes com efeitos colaterais,
login E2E, timezone, compatibilidade de producao e armadilhas. **Todos** os valores
especificos citados adiante (caminhos, credenciais, integracoes, login) vem de la.

Se `.claude/PERFIL-PROJETO.md` nao existir: avise o usuario para copiar um perfil de
`perfis/` (ex: `perfis/php-laragon.md`) para `.claude/PERFIL-PROJETO.md`, ajustar, e
rodar `/prd` de novo. **Pare aqui** ate o perfil existir.

**Gate de FRESCOR do resumo (2.15.0, segundos).** O discovery paralelo e os gates despacham
muitos subagentes, e todos leem o **`.claude/PERFIL-RESUMO.md`**, nao o Perfil completo —
resumo defasado faz N agentes trabalharem sobre fato velho, em silencio. Rode antes de
despachar o primeiro:

```bash
bash .claude/hooks/perfil-frescor.sh
```

`FRESCO` → siga. `DEFASADO` → **regere o resumo** a partir do Perfil atual e rode
`bash .claude/hooks/perfil-frescor.sh --carimbar`. `SEM-CARIMBO` → confira e carimbe.
`SEM-RESUMO` com Perfil > 20 KB → gere o destilado agora. (Tabela completa: `/prd-exec`,
Passo 0.0.1.) **Isto e regenerar o destilado, nao podar o Perfil** — poda tem lugar proprio,
com prova e sob confirmacao, no `/deus`.

### Passo 0.1 — ENTREVISTA UNICA (2.4.0 — todas as decisoes num lote, no inicio)

> **Por que:** medicao real (29/07/2026, 35 sessoes): paradas de pergunta no MEIO do fluxo
> custaram em media 8 min cada (~5h somadas) — o usuario nao esta na tela quando o fluxo para.
> A cura: colher TODAS as decisoes numa unica pergunta em lote AGORA, com o usuario presente, e
> dai rodar autonomo. Nunca fatie em rodadas.

> **`--noturno` (3.4.9): NAO ha entrevista.** Sessao headless nao tem quem responder: adote
> os defaults de TODOS os itens abaixo (split so se gritante — registre; DTs/inovacao no
> default; conducao = **TURBO NOTURNO** automatico; sem maquete; orcamento = baseline anotado
> no bloco de decisoes) e siga direto ao Passo 0.2. Toda decisao adotada e registrada no
> bloco "Decisoes da entrevista" com a marca `(default --noturno)`.
> **Marcador de modo autonomo (3.4.23, item 18):** SO em `--noturno` e em TURBO NOTURNO (ninguem na
> tela), escreva ANTES de qualquer subagente `mkdir -p .claude/.harness-run && printf 'noturno\n' >
> .claude/.harness-run/modo` — o hook `guard-question.sh` passa a NEGAR `AskUserQuestion` nesse modo
> e voce decide pelos defaults declarados, registrando em "Decisoes pendentes" do Output. Expira
> sozinho em 12 h; para sair antes: `rm .claude/.harness-run/modo`.
> **No TURBO comum (default, humano na tela) NAO escreva marcador nenhum** — a parada da maquete e o
> aceite do Passo 11 sao perguntas de verdade. Medido 09/09 (PRD-140): a sessao escreveu `turbo`, o
> guard negou a propria pergunta da maquete e ela teve que apagar o marcador para perguntar (3.4.28).

> **Prompt com decisoes CONGELADAS (3.5.5):** se o prompt disser "nao re-entrevistar", "decisoes congeladas",
> "stub aprovado" ou vier de `--ideia` pronta-para-prd sem "Decisoes em aberto", NAO faca a entrevista de rito:
> adote os defaults de TODOS os itens (conducao TURBO, DTs diretos absorvidos, inovacao 🟢 incorporada, sem
> maquete, orcamento = baseline) e registre `(default: prompt congelado)` no bloco de decisoes. So pergunte o
> que o DISCOVERY contradisser (premissa falsa, numero diferente do stub) — UMA pergunta, no maximo 3 itens.
> Medido 15/09 (PRD-137-c): 4 perguntas e 10 min de frente parada; a 4a era o rito, que o prompt ja respondia.

Monte **UMA chamada `AskUserQuestion`** (no Codex: pergunta textual unica) cobrindo, no que
se aplicar:

1. **Escopo** — se o usuario nao informou descricao: "o que a PRD resolve, em 1-2 frases?".
   Se informou mas esta ambigua: NO MAXIMO 2 esclarecimentos, dentro da mesma pergunta.
2. **Gate de split por urgencia/risco** — pedido mistura **bug de producao** com **feature**?
   Proponha separar (recomendado): o incidente vira PRD propria, fecha com review focado e vai
   pra prod antes da feature. Custo medido de misturar: o bug so fechou depois da feature.
   > **Ha um SEGUNDO gate de split, por tamanho (3.2.0; 3.4.34 = 9, MECANICO):** o teto e **9 tasks de trabalho** —
   > acima disto a PRD FATIA obrigatoriamente, inclusive em TURBO NOTURNO (o `prd-validacao-check` reprova e o guard-agent
   > nao despacha executor; medido PRD-141: 13 tasks = 6 h de exec). Regra anterior: o teto era **8 tasks de trabalho**
   > (+ acceptance e doc-raiz). Se ja der para ver aqui que o escopo nao cabe, diga na mesma
   > pergunta — barato cortar agora, caro cortar depois do discovery. O gate formal roda no
   > Passo 8, ao fechar a lista de tasks.
3. **Politica de DTs** — *"DTs diretamente relacionados que o discovery achar: absorvo
   automaticamente [default recomendado], ou te apresento antes?"* (tangenciais de custo baixo
   idem; tangenciais de custo medio/alto SEMPRE viram so listagem, nunca absorcao automatica).
4. **Politica de inovacao (tony-stark)** — *"Inovacoes 🟢 de custo baixo: incorporo direto
   [default recomendado] ou te apresento antes? (🟡/🔵 sempre viram backlog/DT sem te
   interromper.)"*
5. **Modo de conducao** — *"(a) TURBO [default recomendado]: sigo do discovery ate o fim da
   Fase 2 (tecnica + tasks + gates) sem parar, com UM aceite seu no final; (b) CLASSICO: paro
   no aceite da PRD de produto antes de detalhar (bom p/ conta apertada ou escopo incerto);
   (c) TURBO NOTURNO (3.4.7 — para rodada em que voce NAO estara na tela): igual ao TURBO,
   mas o aceite final e PRE-ASSINADO **condicionado a gates limpos** — beholder sem 🔴 (e
   michelangelo sem 🔴, quando ha UI): registro `PRE-ACEITA (envelope noturno)` e encerro sem
   te aguardar; a `/prd-exec` pode ser disparada sem novo aceite e voce revisa de manha.
   Qualquer 🔴 sobrevivente = fica `Aguardando aceite` normal (bloqueante NUNCA e
   pre-aceito)."* Medido 25/08: 208 min de espera de madrugada exatamente neste gate.
6. **Maquete antes da spec (ariadne — 2.9.0)** — **so pergunte se o pedido tem tela NOVA** (nao
   pergunte em PRD de backend, nem quando a tela e irma evidente de uma existente): *"Quer que eu
   desenhe uma maquete navegavel antes de especificar? Custa ~1 subagente Sonnet e costuma corrigir
   escopo enquanto ele ainda e papel — no modo TURBO ela vira a **unica parada** do fluxo (voce olha
   e diz 'segue'). (a) sim [recomendado p/ tela nova de verdade]; (b) nao, ja sei como e a tela."*
   Default sem resposta: **nao**. Ignorada quando `HARNESS_SKIP_MOCKUP=1`.

7. **Plano de custo (3.0.0)** — **nao e uma pergunta a mais: e uma LINHA a mais na mesma
   pergunta.** Antes de montar a `AskUserQuestion`, levante o custo tipico deste projeto:

   ```bash
   bash .claude/hooks/harness-metrics.sh baseline PRD 5
   ```

   Retorna `BASELINE|<n>|<dur_med_min>|<out_med>|<subagentes_med>|<delegacoes_med>`. Apresente
   junto com o roteamento resolvido, em **uma linha**:

   *"Orcamento estimado: ~8 subagentes, ~50 min, ~12k tokens de output (media das ultimas 5 PRDs
   deste projeto). Modo `economia`: 5 papeis vao para o codex-cli. Aprova?"*

   `BASELINE|0|sem-baseline|...` → escreva **"sem baseline (primeira PRD medida deste projeto)"**.
   **Nunca invente numero** — estimativa sem dado e chute com cara de medicao.
   **Contingencia (3.4.20):** acrescente *"+50% se um gate reabrir o desenho"* (PRD-012-b, 03/09:
   ciclo 1 trocou o desenho, 2x o envelope). Ao passar de **1,5x** (subagentes ou tempo), anuncie em
   1 linha e siga; registre `--extra="orcamento: Nx (<motivo>)"` no stop.

**Registre as decisoes** num bloco "Decisoes da entrevista" no chat — os Passos 3, 6.2 e 10 as
consultam. Depois desta entrevista, o fluxo so para de novo: no aceite (unico do modo turbo, ou
o do 6.2 no classico) e nos gates estruturais (10.3 sem decisao previa aplicavel).

> **O orcamento e aprovado UMA VEZ, aqui, e o fluxo segue autonomo.** Nao pergunte "posso gastar?"
> antes de cada leva de subagentes: a 2.4.0 mediu ~8 min de espera humana por parada no meio do
> fluxo (~5h em 35 sessoes) e essa regressao nao volta. **A unica reabertura por custo** e o
> ESTOURO do envelope aprovado — e ela e objetiva, nao discricionaria:
>
> - um gate entrar no **ciclo 4+** (a base do preset e 1-3), ou
> - o numero de delegacoes externas passar de `HARNESS_DELEGATE_MAX_PER_RUN` (o broker recusa
>   sozinho e devolve `indisponivel`), ou
> - um fallback `perguntar` disparar (modo `economia`).
>
> Nesses casos, **uma** pergunta objetiva: o que estourou, quanto ja custou, e as opcoes
> (seguir / cortar escopo / abortar). Fora deles, nao pare.

### Passo 0.2 — Atualizar o repositorio antes do discovery

> **Por que:** o discovery (Passo 2) mapeia schema, codigo e PRDs do estado **local**. Se
> o repo esta atras do remoto, a PRD nasce sobre codigo velho — gaps ja resolvidos,
> `arquivo:linha` defasados, conflito na hora de executar. Sincronizar ANTES de ler
> qualquer codigo elimina essa classe de erro.

Na raiz do repo do projeto-alvo:

1. **E repo git com remote?** `git rev-parse --is-inside-work-tree` e `git remote`. Nao e
   repo git, ou sem remote → **pule** este passo; registre "projeto sem git/remote —
   discovery sobre o estado local" e siga.
2. **Working tree limpo?** `git status --porcelain`:
   - **Limpo** → `git pull --ff-only` no branch atual.
     - Fast-forward aplicado → reporte `repo atualizado: N commit(s) novo(s)`. **E confira se o
       harness veio junto (3.4.19):** `git diff --name-only ORIG_HEAD..HEAD -- .claude/harness.env
       .claude/skills/prd/SKILL.md`. Saiu algo → esta sessao carregou a `/prd` ANTERIOR ao pull:
       anuncie em 1 linha (*"harness X → Y chegou no pull; esta sessao esta com a skill velha —
       reabra `/prd` numa sessao nova"*) e **PARE aqui**. Medido 02/09 (Caronte, PRD-012-b): a skill
       3.4.18 em contexto, o pull trouxe a 3.4.19, e a unica saida foi handoff manual.
     - Ja na ponta → reporte `repo ja atualizado`.
     - ff-only recusou (branch divergiu) ou erro de rede/auth → **nao force**: reporte o
       motivo e **pergunte** se segue o discovery no estado atual ou prefere resolver antes.
   - **Sujo** (ha mudanca nao commitada) → **NAO** faca pull (nao arrisque o trabalho do
     dev). Rode `git fetch` (seguro, nao toca o working tree) e informe quantos commits
     atras o branch esta. Pergunte: **(a)** seguir o discovery no estado atual, ou **(b)**
     parar para commitar/stashar e entao sincronizar. Aguarde a resposta.

> Nunca use `git reset --hard`, `git checkout .`, `git clean`, nem pull com merge/rebase
> automatico — apenas `--ff-only`. O objetivo e trazer o repo pra ponta **sem descartar
> nada** do que esta local.

### Passo 1 — Determinar numero sequencial da PRD

**OBRIGATORIO:** o numero vem da **reserva atomica**, nunca de "maior existente + 1":

```bash
bash .claude/hooks/harness-worktree.sh reservar PRD      # imprime SEQ|PRD|<n>
```

O `<n>` devolvido e o numero da PRD (a estrutura em disco so e criada no Passo 5 — reserve
aqui para que os prompts do discovery ja citem o numero certo). **3.5.0 — faixa por dev:** cada
dev tem um bloco de numeros por serie (e-mail git → bloco, `HARNESS_SEQ_FAIXAS`); o Charles
continua em `PRD-142, 143…`, um colega recebe `PRD-1001, 1002…`. Numero de 4-5 digitos e normal
e **nunca se renumera para "fechar buraco"** — a serie deixou de ser cronologica de proposito
(o INDEX tem a data). Se o usuario ja declarou o numero no comando, use-o (sem reservar).
Fallback (repo sem o hook): `Glob prds/PRD-*`, maior numero + 1, e registre na PRD que a
reserva nao estava disponivel.

Ler tambem o doc raiz de convencoes do projeto (Perfil → "Doc raiz de convencoes",
ex: `CLAUDE.md`) agora — leitura rapida, necessaria para os prompts dos agents do
Passo 2. Capturar: stack, convencoes, caminhos CLI, regras de integracao.

**Resolver o nivel de esforco + telemetria.** Leia a secao **"Nivel de esforco (preset)"** do
Perfil. Resolva (override explicito vence o preset):

- **Agent A (discovery analitico)**, **tony-stark**, **atlas**, **beholder**, **michelangelo**,
  **dedalo**: economico/equilibrado `sonnet`, maximo `opus` — passe `model: "<resolvido>"` na chamada
  Agent quando resolver `opus` ou `fable` (`fable` = Fable 5.1, so por override explicito no Perfil —
  custo 2x Opus, nunca vem de preset; 3.4.25). A **ariadne** e `sonnet` em qualquer preset (volume de markup).
  **beholder/michelangelo no `equilibrado` (3.4.24, item 13):** ciclo 1 em `sonnet`; o ciclo 2
  sobe para `opus` **uma vez** so se o ciclo 1 reabriu o desenho (≥ 3 🔴 estruturais — ver 10.1).
  `maximo` mantem `opus` no ciclo 1. Override explicito no Perfil (`Modelo do beholder: opus`) vence.
- **Esforco da sessao — fase PENSAR (3.5.3; substitui a regra 3.4.25).** Esforco segue a FASE: a
  `/prd` e julgamento aberto (discovery, tecnica, gates) e roda em **`high`** (economico/equilibrado) ou
  `xhigh` (maximo); o Perfil ("Nivel de esforco" → "Esforco — fase pensar") sobrescreve. **Como aplicar
  (Passo 0 — OBRIGATORIO em qualquer rito, inclusive MODO LEVE):** rode `bash .claude/hooks/esforco.sh pensar`.
  **3.5.5:** o hook descobre o esforco REAL sozinho (linha de comando do processo da sessao —
  `atual_origem=processo`); NAO chame `get_session`. So se a saida vier `atual=n/d`, passe
  `--atual <effort>` lido de `mcp__ccd_session_mgmt__get_session` (`session_id: "self"`, campo `effort`).
  Medido 15/09: 4 de 4 criacoes em `xhigh` com alvo `high` e telemetria `high/n/d` porque o passo era
  opcional. `AJUSTAR` com humano na tela → pergunte UMA vez, *"Esforco: a fase pensar pede X; a sessao
  esta em Y — ajuste com `/effort X` e responda 'ok', ou 'seguir em Y'"*, e espere antes de despachar o
  discovery (o custo de pensar pouco aqui aparece na exec inteira); em modo noturno/autonomo anuncie e
  siga. `ok`/`n/d` = siga. Se o dono do projeto QUER criacoes em `xhigh`, o lugar e o Perfil
  (`Esforco — fase pensar: xhigh`), nunca o `/effort` a mao. NAO existe esforco por chamada Agent (so
  `model`) — todo subagente **herda o esforco da sessao**. Nao inclua palavra-gatilho de thinking no
  prompt (nao muda o esforco enviado a API).
- **Ciclos do beholder** (Passo 10): base — economico 1, equilibrado 2, maximo 3 (**2.5.0**),
  com escalada automatica de ate +1 (ver Passo 10).
- **Ciclos do michelangelo** (Passo 10, so quando a PRD tem UI): mesma base + escalada.
- **Agent D (PRDs anteriores)**: economico `off`, equilibrado `auto` (so se modulo grande/maduro),
  maximo `on`.

Anuncie o preset ao usuario e **dispare a telemetria da Fase 1** uma vez:
`bash .claude/hooks/harness-metrics.sh start PRD-NNN-fase1`
> (3.4.29: o cronometro ja esta ligado desde o prompt `/prd` — `_auto-prd-fase1`, via harness-metrics-auto.sh —
> e o 1o agente da criacao que citar PRD-NNN liga `PRD-NNN-fase1` sozinho se faltar. Este `start` ADOTA esse
> inicio; rode mesmo assim, e o stop do 6.2 e obrigatorio como sempre.)

#### Resolver o ROTEAMENTO dos papeis (3.0.0) — onde cada agente vai rodar

> **Dial ortogonal ao preset.** O preset decide *quao caro*; o roteamento decide *onde roda*:
> no subagente **nativo** do host, ou delegado a um **CLI externo** autenticado na maquina
> (Codex CLI / Claude CLI) via o broker `.claude/hooks/harness-delegate.sh`. Projeto sem a secao
> "Economia e controle de custo" no Perfil e sem `HARNESS_DELEGATE_MODE` = **tudo nativo**,
> exatamente como antes da 3.0.0 — nao ha nada a fazer nesses projetos.

Nao interprete a tabela do Perfil por conta propria: **pergunte ao broker**, que aplica a
precedencia inteira (env da sessao > `harness.env.local` > tabela do Perfil > `harness.env`):

```bash
for papel in discovery-dts discovery-schema discovery-codigo discovery-prds inovacao impacto beholder michelangelo; do
  bash .claude/hooks/harness-delegate.sh --rota "$papel"
done
```

Cada linha volta como `ROTA|<papel>|<executor>|<fallback>|read-only|modo=<m> (<origem>)`.
Guarde o mapa: os Passos 2 e 10 o consomem. Regras de leitura:

- `native` → use a chamada `Agent` normal (o que a skill sempre fez).
- `codex-cli` / `claude-cli` → **rota externa**: monte o envelope e chame o broker (Passo 2).
- `off` → o papel **nao roda**; declare o buraco no resumo final (nunca em silencio).

**Preflight (3.4.6) — obrigatorio quando o mapa tem rota externa.** Antes do Passo 2, rode
**uma vez por executor DISTINTO** que apareceu no mapa:

```bash
bash .claude/hooks/harness-delegate.sh --preflight <executor>
```

`PREFLIGHT|ok|...` → siga normal. `PREFLIGHT|indisponivel|...` → **aplique o fallback declarado
do papel JA AQUI** (native/perguntar/pular, conforme o mapa) e anuncie em 1 linha — nunca
descubra a indisponibilidade pagando timeout de 600s na primeira delegacao do Passo 2.
O resultado e cacheado (~30 min): chamadas repetidas custam <1s. **`PREFLIGHT|indisponivel|codex-cli|
limite-ate <data>` (3.4.24, item 10):** o Codex esta em limite de uso ate a data — nao tente de novo
nesta run (nem `--force`); tudo que iria ao Codex vai ao nativo e o review da exec roda em SOLO-2.

**Anuncie em UMA linha** quando houver rota externa (e so entao):
*"Roteamento: modo `economia` (harness.env.local) — schema, codigo, impacto e beholder no
codex-cli; sintese e gate de UX aqui."* Modo `off` nao merece anuncio nenhum.

#### Verbosidade (3.0.0) — quanto esta skill FALA enquanto trabalha

Leia `.claude/harness.env` → `HARNESS_VERBOSITY` (ausente = `conciso`; o modo `economia`
arrasta `minimo`). Ele governa **o que voce escreve na tela**, nunca o que voce faz:

| Nivel | Durante o processo | No fim |
|---|---|---|
| `normal` | comportamento pre-3.0.0 (sintese do Passo 3 completa, placar por ciclo) | completo |
| `conciso` | sem preambulo nem recapitulacao; sinteses intermediarias em 1-3 linhas | completo |
| `minimo` | **so marcos de 1 linha** (`discovery ▸ 6 agentes`, `beholder c1 ▸ 0🔴`) | completo |

> **Por que isso importa em token:** o texto que voce emite e output (o mais caro e o mais lento)
> **e vira input em todos os turnos seguintes** — narracao intermediaria e o unico gasto do
> harness que COMPOE ao longo da sessao. Uma sintese de 800 palavras no Passo 3 nao e paga uma
> vez; e relida ate o fim da PRD.
>
> **NUNCA silencie, em nenhum nivel:** a pergunta da entrevista (Passo 0.1), o aceite (Passo 11),
> qualquer degradacao (fallback usado, executor indisponivel, agente que sumiu, gate sem
> evidencia visual, ciclos esgotados), todo 🔴 e todo erro que exija decisao do usuario.
> **Concisao nao pode virar omissao** — e a regra que separa este modo de mentir por economia.
> Os documentos em disco (PRD, `REVIEW-*.md`, `_discovery.md`) saem **completos em qualquer
> nivel**: o que encolhe e o que volta ao contexto e o que vai a tela, nunca a auditoria.

### Passo 1.5 — Rito da PRD: MODO LEVE e o PADRAO; rito COMPLETO e excecao por RISCO (3.4.24 — item 12)

O MODO LEVE nasceu na 3.4.15 para fatia e PRD de ate 6 tasks. Medido ate 08/09: o unico caso no
alvo (fase 2 ≤ 60 min) do Charles foi o LEVE (51 min, 153 linhas/task, sem hermes; Derick 28 min);
hermes E+C custou 27-48 min (30-55% da fase 2). E como o teto duro do Passo 8 e **8 tasks de
trabalho**, "LEVE para ate 8" e o mesmo que "LEVE sempre" — entao a regra passa a dizer isso.

**O rito e decidido por RISCO, nao por tamanho.** O MODO LEVE e o rito de TODA `/prd`, salvo quando
UM destes vale (ai e rito COMPLETO — anuncie qual):
- integracao com efeito colateral **nova** (Perfil → "Integracoes com efeitos colaterais");
- auth ou dinheiro **novos** (login/permissao/cobranca/pagamento que nao existe hoje);
- modulo **inexistente** (terreno novo, sem precedente no repo);
- PRD tecnica acima de **800 linhas** (descoberto ao escrever o Passo 7 — troque de rito ali, sem refazer o que ja saiu);
- `--completo` explicito (ou `HARNESS_PRD_RITO='completo'` no `harness.env` — kill switch do item 12).

`--leve` continua aceito e vira no-op com aviso (*"`--leve` ja e o padrao desde a 3.4.24"*).
Tamanho NAO decide rito: PRD de 7 ou 8 tasks continua LEVE (o teto de 8 continua valendo — 9+ e
gate de split, Passo 8).

No MODO LEVE:
- **Passo 0 (esforco) e a ROTA do Passo 2 valem IGUAL (3.5.5):** o LEVE encurta gates e redacao, nao o esforco nem o
  roteamento — `esforco.sh pensar` e `harness-delegate.sh --rota <papel>` para cada papel da frota. Medido 15/09
  (PRD-141-b): a sessao pulou os dois e despachou `general-purpose` (sonnet) no discovery de DTs (o `guard-agent` agora avisa).
- **Passo 2.0** (votacao): pule — nivel `MEDIO` direto (A/B/C + tony-stark; cache do modulo vale).
- **Passo 6.1.1** (maquete): so se a entrevista pediu; senao pule.
- **Passo 7.2** (pre-gate): pule — o gate do Passo 10 cobre.
- **Passo 8**: **a pai redige as tasks, ate as 8 de trabalho** — sem hermes Modo E (medido: 5-9 min
  ate 6 tasks; estimativa 10-14 min para 7-8, ainda abaixo dos 17-22 min do hermes mais o degrau
  serial). Conferencia mecanica por grep + `task-packet.sh --check` + `task-matrix.sh` igual.
- **Passo 10**: base **1 ciclo** por gate + **1 confirmacao** (so diff, Sonnet, teto 30 chamadas)
  se o ciclo 1 teve 🔴; michelangelo so com tela NOVA (tela irma de existente nao conta). Ciclo 1
  com **≥ 3 🔴 estruturais** (mudam escopo, divisao de tasks, schema ou integracao) = o desenho
  reabriu: o ciclo 2 roda como ciclo cheio em **Opus, uma vez** (regra do item 13, 10.1), e a
  confirmacao em Sonnet vem depois se ainda restar 🔴.
- **Passo 10.2**: quem aplica os patches se decide pelo numero de documentos (ate 3 = a pai; 4+ =
  hermes Modo C por documento) — igual nos dois ritos.
- Telemetria: `--modo=leve` no `stop` das duas fases (`--extra="modo: leve"` pode ficar como
  redundancia enquanto o dashboard le os dois).

No rito COMPLETO: votacao (2.0), pre-gate (7.2), hermes Modo E em paralelo no Passo 8 a partir de
7 tasks, ciclos base do preset no Passo 10 e `--modo=completo` no `stop`.

Anuncie *"MODO LEVE (padrao)"* ou *"rito COMPLETO (motivo: <qual>)"* no inicio. Meta do LEVE:
fase 1 + 2 em 40-50 min. Medir nas 2 semanas seguintes pelo campo `modo` da telemetria.

### Passo 2.0 — Dimensionar o discovery por VOTACAO (3.4.10 — melhoria #3) [so no rito COMPLETO]

> **3.4.24:** no MODO LEVE (o padrao, Passo 1.5) este passo nao roda — nivel `MEDIO` direto.
> A votacao abaixo e do rito COMPLETO.

A frota completa subia igual para "modulo novo" e "corrigir label" (f1: ~22min/600k tokens
mesmo em PRD pequena). O tamanho do discovery passa a ser DECIDIDO, nao padrao — e por
**votacao**, nao por regua fixa (decisao do Charles: 1 juiz so viciaria a rota, sempre
trabalhando a mais ou a menos):

1. **A sessao-pai analisa e PROPOE** um nivel, em 1 linha com motivo:
   - **MINIMO** — Agent C (codigo) sempre; + B (schema) so se toca banco; tony-stark vira
     opcional (pule com registro); sem atlas/D/F. Para correcao/escopo ja fechado na entrevista.
   - **MEDIO** — A/B/C + tony-stark; atlas so se modulo existente grande; sem D/F.
   - **COMPLETO** — a frota atual inteira (default historico). Modulo novo, escopo aberto,
     integracao com efeito colateral.
2. **3 votantes conferem em PARALELO** (mesma mensagem; `general-purpose`, **Sonnet**, prompts
   enxutos ~1 tela): cada um le o pedido + o bloco de decisoes da entrevista + o
   PERFIL-RESUMO, por uma LENTE diferente — **escopo** ("o pedido esta fechado ou esconde
   produto?"), **risco** ("toca banco/integracao/auth/dinheiro?"), **historico** ("modulo
   maduro com precedente ou terreno novo?") — e devolve APENAS:
   `VOTO: MINIMO|MEDIO|COMPLETO — <motivo em 1 linha>`.
3. **Decisao: maioria dos 3 votos.** Empate triplo (um de cada) ou 2+ votos ACIMA da proposta
   da pai → adote o MAIOR nivel votado (fail-safe: na duvida, mais rede). Anuncie em 1 linha:
   *"discovery MEDIO (votos: escopo=MEDIO, risco=MEDIO, historico=MINIMO; proposta da pai
   MEDIO)"* — e registre no `_discovery.md` (secao "Dimensionamento").
4. Custo dos votantes: ~3 x 10k tokens — paga-se sozinho sempre que evita UM agente de frota
   (100k+). Em `--noturno`, a votacao roda igual (e automatica, nao pergunta nada).
5. **Votacao SO quando pode baixar o nivel (3.4.11).** Se a sua proposta ja e COMPLETO (ou o
   preset e `maximo`), NAO vote: anuncie *"discovery COMPLETO (proposta no maximo — sem
   votacao)"*, registre no `_discovery.md` e siga ao Passo 2. Medido 01/09 (3 PRDs): as 3
   votacoes confirmaram COMPLETO — 4 min e um turno a mais sem mudar nada. A votacao existe
   para conferir economia, nao para confirmar o maximo.

### Passo 2 — Discovery em PARALELO (frota conforme o Passo 2.0; no COMPLETO: A/B/C + tony-stark OBRIGATORIOS; atlas se toca modulo existente; D opcional)

> **REGRA CRITICA:** Esta fase **NAO** pode ser sequencial. Subir TODOS os agents da leva
> (A/B/C + E, mais D e F quando aplicaveis) em **uma unica mensagem com todas as chamadas
> `Agent` no mesmo turno** (paralelismo nativo do harness). Anti-pattern: rodar A →
> esperar → rodar B → esperar → rodar C. Isso dobra/triplica o tempo sem ganho. Discovery
> paralelo e regra; sequencial e regressao.

#### Cache de discovery por modulo (2.5.0) — checar ANTES de subir B/C/D

PRDs seguidas no mesmo modulo re-mapeavam o mesmo schema/codigo do zero. Antes de despachar,
cheque `prds/_discovery-cache/<modulo>.md` (modulo = slug da area, ex: `agenda`, `cobranca`):

1. **Existe?** Leia o cabecalho dele: `commit` (hash em que foi gerado), `paths` (diretorios/
   arquivos do modulo mapeado), `data`.
2. **Ainda vale?** Rode `git log --oneline <commit>..HEAD -- <paths> <dir-de-migrations>`
   (paths do proprio cache + migrations do Perfil). **Saida vazia E cache com menos de 30
   dias** → VALIDO. Qualquer commit tocando os paths, ou cache velho → invalido (ignore e
   siga normal).
3. **Cache valido → PULE os Agents B (schema) e C (codigo)** — e o D, se o cache ja cobre os
   precedentes. Use o conteudo do cache como a sintese de schema/codigo no Passo 3, citando:
   *"discovery de <modulo> reaproveitado do cache (<data>, valido em <commit-atual>)"*.
   **A (DTs) RODA SEMPRE** — DTs mudam a cada semana. **E (tony-stark) e F (atlas) — 3.4.15, item
   6:** reaproveitados quando o cache do modulo e valido E tem menos de **24 h** E a secao
   correspondente existe nele ("Impacto (atlas)" / "Inovacao (tony-stark)"); o escopo NOVO desta
   PRD entra como 1 paragrafo de "delta" escrito pela pai na sintese. Medido 02/09: PRD-135/136/137
   tocaram modulos que a 133/134 mapearam na vespera e o atlas rodou 10-24 min em cada uma, sempre
   no caminho critico. Cache com mais de 24 h ou sem a secao → E/F rodam normalmente.
4. Sem cache/invalido → discovery completo (e o Passo 6.1 grava o cache novo, INCLUINDO as secoes
   "Impacto (atlas)" e "Inovacao (tony-stark)" — mapa de blast radius e lista de inovacoes, sem a
   opiniao especifica desta PRD).

#### Como subir os agents

> **Tetos de palavras e verbosidade (3.0.0).** Os blocos abaixo trazem tetos fixos (400/500/600
> palavras) — eles valem em `normal` e `conciso`. Em **`minimo`, corte todos em ~30%** (400→280,
> 500→350, 600→420) tanto no `Agent` nativo quanto no `--max-words` do broker. Motivo: o relatorio
> do subagente volta para o SEU contexto e e relido a cada turno seguinte — em papel de mapeamento,
> teto menor forca sintese, nao perda de conteudo (o detalhe fica no arquivo que ele cita).
> **Nao corte** o teto do beholder/michelangelo: gate espremido perde achado, e achado perdido
> custa muito mais que o token economizado.

Em UM unico turno, emitir as tool calls `Agent` simultaneas. Os agents de **mapeamento** (B, C, D)
usam o scout **`peter-quill`** (`subagent_type: "peter-quill"`, read-only, contrato Beta); o **A**
(julgamento de DTs) usa `general-purpose` com o **modelo do discovery analitico** resolvido no Passo
1 (passe `model: "opus"`/`"fable"` se o preset/override deu opus/fable). E e F usam `tony-stark` e `atlas`. Cada
prompt e **self-contained** — o agent nao tem acesso ao contexto desta conversa, entao
**cole no prompt** os caminhos reais do Perfil (estrutura de diretorios, helpers,
integracoes) e a descricao do escopo.

#### Rota EXTERNA (3.0.0) — quando o mapa do Passo 1 mandou o papel para um CLI

> **So se aplica aos papeis cuja rota NAO e `native`.** Com modo `off` (default) pule esta
> subsecao inteira: nada muda em relacao ao comportamento historico.

Para cada papel externo, faca **duas coisas** — e as duas continuam dentro da regra de
paralelismo: **as chamadas `Bash` do broker vao no MESMO turno** das chamadas `Agent` dos papeis
nativos. Uma leva mista (3 `Agent` + 3 `Bash`) e um turno so, nao dois.

**1. Escreva o envelope** em `.claude/.harness-run/delegations/PRD-NNN/<papel>-input.md`.
O envelope contem **so a tarefa** — o broker injeta sozinho o preambulo obrigatorio (modo
read-only, o que ler, proibicoes, teto de palavras, independencia). Nao repita nada disso, e
**nao cole o repositorio no prompt**: mande o executor LER os arquivos, que ele tem acesso local.

```markdown
## Objetivo
<a mesma tarefa que o Agent nativo receberia — copie do bloco do agente correspondente abaixo>

## Escopo
<escopo da PRD em 2-3 frases>

## Caminhos reais deste projeto (do Perfil)
- Endpoints/API: <...> · Paginas/views: <...> · Migrations: <...> · Mapa do schema: <...>

## Formato obrigatorio da resposta
<o mesmo "Devolva no formato:" do agente nativo correspondente>

## Criterios de aceite
- Todo `arquivo:linha` citado tem de existir de verdade (voce tem o repo local — confira).
- O que nao deu para verificar vai numa secao "Nao verificado", nunca preenchido por suposicao.
```

**2. Chame o broker** (uma chamada `Bash` por papel, todas no mesmo turno):

```bash
bash .claude/hooks/harness-delegate.sh \
  --executor codex-cli --role atlas --task impacto --label PRD-NNN \
  --prompt-file .claude/.harness-run/delegations/PRD-NNN/impacto-input.md \
  --mode read-only --max-words 500
```

`--role` = o agente canonico cujo contrato o executor deve seguir (`atlas`, `beholder`,
`tony-stark`, `peter-quill`); o broker aponta `.claude/agents/<role>.md` no envelope, entao a
persona viaja junto. `--max-words`: 500 no normal, **350 quando a verbosidade e `minimo`**
(relatorio gordo que volta e relido pela sessao — delegar so economiza se o retorno for enxuto).

**Leia o resultado** no Passo 3, do arquivo que o broker imprimiu (`DELEGACAO|ok|<exec>|<path>`).

**Se o broker nao retornar `ok`** — use o exit code, nao o texto:

| Exit | Situacao | O que fazer |
|---|---|---|
| 0 | ok | siga |
| 10 / 11 / 12 / 13 | indisponivel · timeout · erro · vazio | aplique o **fallback do mapa do Passo 1** |
| 20 | reentrada | bug de orquestracao: voce ja esta dentro de um agente externo. Nao delegue |
| 2 | uso | erro seu (path/flag). Corrija e refaca — **nao** e caso de fallback |

Fallback por valor: `native` → rode o `Agent` correspondente e **registre a troca**;
`perguntar` → **PARE e pergunte** (e o default do modo `economia`: cair no nativo devolveria o
trabalho justamente a conta que se esta poupando); `pular` → siga sem o papel e **declare o
buraco** no Passo 3 e no resumo final. Em qualquer caso: **fallback e barulhento, nunca
silencioso** — mesma regra do agente que some (bug CRLF) e do revisor em modo solo.

**Agent A — DTs relacionados (`general-purpose` · modelo: discovery analitico do preset)**

```
description: "Discovery: DTs relacionados a PRD <NNN>"
prompt: """
Estou criando a PRD-<NNN> para o projeto <NOME DO PROJETO> (<stack do Perfil>).
Escopo desta PRD: <colar a descricao em 2-3 frases que o usuario forneceu>.

Sua tarefa (so leitura, nao alterar nada):

1. Ler `prds/debito_tecnico/INDEX.md` (se existir).
2. Listar TODOS os DTs com status "Pendente" ou "Em andamento".
3. Para cada DT pendente, classificar em:
   - Diretamente relacionado ao escopo (absorver na PRD).
   - Tangencialmente relacionado (custo baixo de absorver?).
   - Nao relacionado (so contar).
4. Para os 2 primeiros grupos, ler o arquivo `prds/debito_tecnico/DT-XXX-*.md` e
   resumir o problema em 2-3 frases.
5. Sugerir, para cada DT diretamente relacionado, COMO sera tratado (RF novo, parte de
   task existente, etc).

Devolva no formato:
## DTs relacionados a PRD-<NNN>
### Diretamente relacionados (absorver)
- DT-XXX: <titulo> — <resumo> — Como tratar: <sugestao>
### Tangencialmente relacionados (avaliar custo)
- DT-YYY: <titulo> — <relacao> — Custo: baixo/medio/alto
### Nao relacionados
- N DTs pendentes ignorados.

Se `prds/debito_tecnico/` nao existe ou esta vazio, devolva "Sem DTs pendentes".
Reporte em portugues, max 400 palavras.
"""
```

**Agent B — Schema e migrations relacionados (`peter-quill`)**

```
description: "Discovery: schema/migrations para PRD <NNN>"
prompt: """
Estou criando a PRD-<NNN> para o projeto <NOME> (<stack + SGBD do Perfil>).
Escopo: <colar descricao>.
Tabelas/entidades suspeitas (do escopo): <listar substantivos relevantes>.

Sua tarefa (so leitura):

1. Ler o mapa do schema do projeto (Perfil → "Mapa do schema", ex: `database.md` ou
   `schema.prisma`).
2. Listar (Glob) as migrations (Perfil → "Migrations") e identificar quais tocam nas
   tabelas/modulo do escopo. Ler as mais recentes relevantes (max 5).
3. Para cada tabela afetada/relacionada, devolver: nome, colunas (nome+tipo+nullable+
   default), indices (PK/UNIQUE/FK), soft delete?, relacionamentos.
4. Apontar GAPS evidentes que a nova PRD provavelmente precisara cobrir (colunas/
   indices/FKs faltando).

Devolva no formato:
## Schema relacionado a PRD-<NNN>
### Tabelas existentes
#### `<tabela>` — Colunas / Indices / Relacionamentos
### Migrations recentes do modulo
- <arquivo> — <o que faz em 1 linha>
### Gaps potenciais (atencao na PRD)
- ...

Reporte em portugues, max 500 palavras. NAO sugerir solucao — apenas mapear o estado atual.
"""
```

**Agent C — Codigo existente do modulo (`peter-quill`)**

```
description: "Discovery: codigo existente para PRD <NNN>"
prompt: """
Estou criando a PRD-<NNN> para o projeto <NOME> (<stack do Perfil>).
Escopo: <colar descricao>.
Modulo afetado (palavras-chave): <listar>.

Sua tarefa (so leitura):

1. Localizar arquivos relevantes do modulo usando a estrutura de diretorios do projeto:
   - Endpoints/API: <caminho do Perfil>
   - Paginas/views: <caminho do Perfil>
   - JS/cliente: <caminho do Perfil>
   - Componentes reusaveis (modais, partials, helpers compartilhados)
2. Para cada arquivo relevante: caminho, responsabilidade em 1 frase, endpoints
   expostos, funcoes/classes principais.
3. Identificar dependencias-chave que a nova PRD provavelmente vai usar (helpers de
   acesso a dados, autenticacao, clientes HTTP, helpers das integracoes do Perfil).
4. Apontar PADROES locais do modulo (como faz soft delete, como dispara as integracoes,
   como exibe componentes, etc).

Devolva no formato:
## Codigo existente — modulo `<modulo>`
### Arquivos relevantes
- `<caminho>` — <funcao>
### Endpoints existentes
- `<recurso>/<acao>` — <metodo + responsabilidade>
### Helpers / dependencias provaveis para a nova PRD
- ...
### Padroes locais a seguir
- ...
### Riscos / quirks (atencao na PRD)
- ...

Reporte em portugues, max 600 palavras. NAO sugerir solucao — apenas mapear.
"""
```

**Agent D — PRDs anteriores relacionadas (OPCIONAL, `peter-quill`)**

> Subir o D **junto** com A, B, C (mesma mensagem) **se** o modulo for grande/maduro.
> Ignorar se o escopo for um modulo novo/pequeno (sem PRDs anteriores).

```
description: "Discovery: PRDs anteriores tocando no modulo"
prompt: """
Estou criando a PRD-<NNN> para o projeto <NOME>. Escopo: <colar>. Modulo: <modulo>.
Sua tarefa (so leitura):
1. Glob `prds/PRD-*` e identificar PRDs cujo nome/Resumo Executivo mencione <modulo> ou
   palavras-chave do escopo.
2. Ler o "Resumo Executivo" de cada PRD encontrada.
3. Devolver: numero + titulo + 1-2 frases do que entregou + data.
4. Apontar conflitos potenciais: convencoes a respeitar, decisoes que nao podem ser revertidas.
Reporte em portugues, max 400 palavras.
"""
```

**Agent E — Inovacao (`tony-stark`) [OBRIGATORIO]**

> Sobe **junto** com A, B, C (mesma mensagem). Diferente dos outros, ele NAO mapeia o
> estado atual — ele **propoe melhorias** (tecnologia/tecnica + fluxo/feature). Use
> `subagent_type: "tony-stark"` (agent-arquivo do harness). As sugestoes entram no Passo 3
> para o usuario decidir o que incorporar. "Sempre entra" = nunca pule este agent.
> **Modelo:** ler o Perfil → "Agentes do harness (modelos)" → "Modelo do tony-stark"; se
> `opus`/`fable`, passar `model: "<valor>"` na chamada Agent (ausente/sonnet = default).

```
subagent_type: "tony-stark"
description: "Inovacao: melhorias para a PRD <NNN>"
prompt: """
Estou criando a PRD-<NNN> para o projeto <NOME> (<stack do Perfil>).
Escopo desta PRD: <colar a descricao em 2-3 frases>.
Compatibilidade de producao a respeitar (TETO): <Perfil -> Compatibilidade de producao>.
Integracoes com efeito colateral do Perfil: <listar ou "Nenhuma">.

Sua tarefa: sugerir inovacao ANCORADA nesta realidade, em dois eixos —
(1) tecnologia/tecnica melhor para resolver o problema; (2) melhorias de fluxo/feature
que agregam valor. Respeite a compatibilidade de producao (nao sugira o que nao roda em
prod), o peso de um time pequeno, e o gate de escopo (classifique "agora" vs "backlog/DT").
Valide com WebSearch o que for recente. Devolva o cardapio classificado
(🟢 incorporar agora / 🟡 avaliar / 🔵 backlog-DT / ⚪ descartado) no seu formato padrao.
"""
```

**Agent F — Analise de impacto (`atlas`) [OBRIGATORIO quando a PRD toca modulo EXISTENTE]**

> Sobe **junto** com A, B, C, E (mesma mensagem) **sempre que** o escopo altera codigo/
> schema que ja existe (endpoint, helper, tabela, tela em uso). Pular APENAS em escopo
> 100% greenfield (modulo novo, sem consumidor existente). Use `subagent_type: "atlas"`.
> **Modelo:** ler o Perfil → "Agentes do harness (modelos)" → "Modelo do atlas"; se
> `opus`/`fable`, passar `model: "<valor>"` na chamada Agent (ausente/sonnet = default).

```
subagent_type: "atlas"
description: "Impacto: blast radius da PRD <NNN>"
prompt: """
Estou criando a PRD-<NNN> para o projeto <NOME> (<stack do Perfil>).
Escopo desta PRD: <colar a descricao em 2-3 frases>.
Superficies provaveis da mudanca: <tabelas/endpoints/helpers/telas suspeitos do escopo>.

Sua tarefa (modo IMPACTO, so leitura): mapear o blast radius desta mudanca no codigo
REAL — consumidores diretos e indiretos de cada superficie (com arquivo:linha), contratos
afetados (endpoints, formatos, workers, integracoes do Perfil) e pontos de regressao
provavel. Classifique cada ponto (🔴 quebra provavel / 🟠 regressao possivel / 🟡 atencao /
⚪ informativo) e termine com "o que o plano precisa cobrir". Liste o que NAO foi
verificavel (consumidores externos presumidos). Devolva no seu formato padrao.
"""
```

#### Apos os agents retornarem

Voce (agente principal) sintetiza: (1) DTs candidatos a absorcao; (2) schema atual +
gaps; (3) codigo + helpers reusaveis + padroes locais; (4) precedentes a respeitar;
(5) oportunidades de inovacao do tony-stark (classificadas por destino); (6) mapa de
impacto do atlas (pontos 🔴/🟠 viram requisitos de cobertura da PRD — consumidor a
ajustar, teste de regressao, rollback).

#### Validacao do paralelismo (auto-checagem)

- [ ] Os agents (A, B, C + o **E do tony-stark**, o D se aplicavel e o **F do atlas** se a PRD toca modulo existente) foram chamados em **uma unica mensagem**?
- [ ] Cada prompt e self-contained (com os caminhos reais do Perfil colados)?
- [ ] Cada agent retornou relatorio estruturado em portugues?
- [ ] O **tony-stark** (inovacao) foi incluido na leva? (Ele "sempre entra" — nunca pule.)
- [ ] O **atlas** (impacto) foi incluido quando o escopo toca codigo existente? (So greenfield puro dispensa.)
- [ ] **(3.0.0)** Havendo rota externa: as chamadas `Bash` do broker sairam no **mesmo turno** das
      `Agent` nativas? (Leva mista e UM turno — despachar os nativos e so depois os externos
      sequencializa a fase exatamente como o anti-pattern que esta secao proibe.)
- [ ] **(3.0.0)** Todo papel que nao retornou `ok` teve o fallback do mapa aplicado **e registrado**?

Se "nao" para qualquer um — **abortar e refazer**. Discovery sequencial e regressao.

### Passo 3 — Apresentar achados e aplicar as politicas da Entrevista (sem parar, no default)

Consolidar as 6 secoes (DTs pendentes / schema atual / codigo existente / PRDs precedentes /
**oportunidades de inovacao do tony-stark** / **mapa de impacto do atlas**, quando rodou) — os
papeis externos entram aqui exatamente como os nativos: **voce e o juiz**, le todos os relatorios
(do contexto e dos arquivos do broker), confronta e sintetiza.

**Quanto disso vai para a TELA depende da verbosidade** (resolvida no Passo 1) — a sintese
sempre acontece e sempre e gravada no `_discovery.md` (Passo 6.1); o que muda e o eco:

| Verbosidade | O que voce escreve na tela |
|---|---|
| `normal` | as 6 secoes completas, como ate a 2.16.1 |
| `conciso` | **ate 3 linhas**: o que o discovery mudou no plano + o que exige decisao |
| `minimo` | **1 linha**: `discovery ▸ N agentes · X DTs absorvidos · Y pontos 🔴 do atlas` |

Em `conciso`/`minimo` o conteudo **nao se perde** — ele vai integral para o `_discovery.md`, que
e o que a Fase 2 le. Repetir na tela um texto que ja esta em disco e o gasto que compoe.

> **Sempre visivel, em qualquer nivel:** papel que caiu em fallback (com o executor que falhou e
> o que assumiu), papel `off`/pulado (o buraco declarado), e qualquer achado que exija decisao sua.

**Entao aplique as politicas colhidas na Entrevista unica (Passo 0.1) — sem perguntar de
novo:**

- Politica de DTs em automatico → absorva os diretamente relacionados (e tangenciais baratos),
  registre quais e por que, e siga.
- Politica de inovacao em automatico → incorpore as 🟢 baratas, mande 🟡/🔵 para backlog/DT,
  registre, e siga.
- **So pare aqui** se: a entrevista escolheu "me apresente antes", OU o discovery achou algo
  FORA do envelope decidido (DT tangencial caro que vale a pena, inovacao 🟢 que muda escopo,
  efeito colateral novo nao discutido). Nesses casos, uma unica pergunta objetiva:

```
**Fora do envelope da entrevista:** <o achado + recomendacao>
**Sigo com a recomendacao ou ajusta?**
```

> **3.4.15 (item 7) — modo TURBO nao para aqui.** Em TURBO/TURBO NOTURNO adote a recomendacao
> conservadora (a que NAO amplia escopo nem toca integracao com efeito colateral), registre em
> "Decisoes" da PRD como **"pendente de ratificacao — adotada a recomendacao X em <hora>"** e siga;
> a pergunta acima fica so para o modo CLASSICO ou quando o achado INVALIDA uma decisao explicita
> da entrevista. Medido: essa pergunta custou 29,5 min na PRD-011 e o 10.3 custou 50 min na PRD-135,
> com o operador longe — o aceite do Passo 11 e onde ele ratifica ou desfaz.

#### Para as inovacoes aprovadas (apos confirmacao)

- As 🟢/🟡 que o usuario aprovar viram **RF novo** ou entram em tasks existentes (registre
  na PRD como qualquer outro requisito).
- As 🔵 backlog que ele quiser preservar: **1 linha em `prds/backlog/IDEIAS.md`** (template
  `prds/_templates/TEMPLATE-IDEIAS.md`) ou na secao "Observacoes / Melhorias Futuras" da PRD.
  **Nao abra `/dt` para ideia** (3.2.2): DT e bug/divida com custo de nao fazer; inovacao
  nao aprovada e ideia, e ideia nao entra na fila da `/dt-exec`.
- Se a inovacao adiciona integracao com efeito colateral, ela cai no gate do Passo 3.1.

#### Para DTs absorvidos (apos confirmacao)

- Adicionar no campo "Expande" do Resumo Executivo: `DT-XXX, DT-YYY`.
- Incluir os requisitos do DT como RF ou dentro de tasks.
- Na ultima task, incluir atualizacao do DT INDEX: `Pendente` → `Resolvido (PRD-NNN)`.
- Se o DT tem arquivo dedicado, atualizar o status nele tambem.

Se `prds/debito_tecnico/` ainda nao existe, ignorar esta secao silenciosamente.

### Passo 3.1 — Discovery de efeitos colaterais (gate de seguranca)

> **Quando aplicar:** sempre que a PRD tocar alguma **integracao com efeito colateral
> irreversivel** listada no Perfil (envio de mensagem, e-mail, SMS, push, pagamento,
> evento em calendario real, webhook externo). Detectar fazendo grep no escopo da PRD
> pelas **palavras-chave de deteccao** que cada integracao declara no Perfil.
>
> **Por que existe:** executar uma PRD que dispara integracao real em ambiente local
> (apontando para dados de producao) pode mandar mensagem para cliente real, criar
> evento lixo em calendario real, ou cobrar de verdade. Este gate garante rastreabilidade
> e que a Fase 0 da `/prd-exec` vai proteger a execucao.

Se a PRD toca uma integracao do Perfil, na secao "Riscos" da PRD-TECNICA registrar:

1. **Pontos de disparo afetados** — listar `arquivo:linha` onde o codigo novo chama o
   helper/interceptor central da integracao (Perfil → Integracoes → "Helper/interceptor
   central"). Manter a contagem atualizada se a PRD adiciona pontos novos.
2. **Confirmar passagem pelo interceptor central** — todo codigo novo deve usar o helper
   central declarado no Perfil (que aplica o safe-mode), sem bypass. Se a PRD propoe uma
   nova forma de envio/integracao, explicitar como ela se conecta ao interceptor ou
   justificar criar um novo.
3. **Acceptance task valida o disparo** — em ambiente de teste, asserir que o safe-mode
   atuou (ex: log/redirecionamento para whitelist) quando a flag esta ativa, e que o
   comportamento legado e preservado quando nao esta.
4. **Lembrete da Fase 0 da `/prd-exec`** — a execucao em local com safe-mode desligado e
   bloqueada automaticamente pelo gate. Manter confianca nessa protecao.

Se o Perfil declara "Nenhuma" integracao com efeito colateral, pular este passo.

> **Quebra de fase:** na Fase 1 a PRD-TECNICA ainda nao existe — capture estes pontos no
> `_discovery.md` (secao "Efeitos colaterais") no Passo 6.1; a **Fase 2** os materializa na secao
> Riscos da PRD-TECNICA (Passo 7).

### Passo 4 — Ler o template da PRD de produto e uma PRD de referencia

Na Fase 1 escrevemos **so a PRD de produto** — leia apenas o template dela agora (os templates de
tecnica e task sao lidos na Fase 2, para nao carregar contexto a toa):

```
Read: prds/_templates/TEMPLATE-PRD.md
```

**Referencia viva so na 1ª PRD do projeto (3.4.10 — melhoria #5):** sem nenhuma PRD anterior,
leia a mais recente de OUTRO projeto irmao como referencia de tom (ou siga so o template).
Da 2ª PRD em diante, **NAO leia PRD inteira de referencia** — o template + o historico do
modulo (que o discovery ja trouxe) bastam; reler centenas de linhas por criacao so para
"lembrar o estilo" era custo fixo sem retorno.

### Passo 5 — Criar a estrutura de diretorio

**Numero da PRD:** o reservado no Passo 1 (`SEQ|PRD|<n>`) ou o que o usuario declarou. Se
por qualquer motivo ainda nao reservou, reserve agora — **nunca** deduza "o proximo livre"
varrendo so o disco local: em worktree o disco e o snapshot do fork e duas sessoes paralelas
colidem (DT-002 do mestre; a rodada PRD-133/134 so escapou por uma reserva manual), e entre
devs a reserva local nem alcanca (por isso a faixa por dev da 3.5.0). Ao varrer
`Glob prds/PRD-*` por qualquer motivo, extraia o numero com `PRD-(\d+)` (3 a 5 digitos) e
**ignore sufixo de fatia** (`PRD-133-b-*` e fatia da 133, nao "a 133-b da serie") — parser
que faz `int` do que vem depois de `PRD-` quebra na presenca de stubs.

```
prds/PRD-[NNN]-[nome-curto]/
  PRD-[NNN]-[nome-curto].md
  PRD-TECNICA-[NNN]-[nome-curto].md
  PROMPT-EXECUCAO.md
  tasks/
    TASK-001-[descricao-curta].md
    ...
```

Convencoes de nome: `[nome-curto]` kebab-case 3-5 palavras; `[descricao-curta]` nas
tasks kebab-case (acao + objeto).

**Na Fase 1, criar so a pasta + a PRD de produto** (a tecnica, o PROMPT-EXECUCAO e as tasks nascem
na Fase 2). Pode criar a subpasta `tasks/` vazia.

**Registrar no INDEX:** adicionar uma linha em `prds/INDEX.md` para a nova PRD com o status
**`Aguardando Fase 2`** (`| PRD-NNN | <titulo curto> | Aguardando Fase 2 | <origem> |`) — esse status
e o que o Passo 0.0 usa para reconhecer a PRD na retomada. Se `prds/INDEX.md` ainda nao existir,
criar a partir do cabecalho-padrao (ver outras PRDs / o do harness). O Status evolui:
`Aguardando Fase 2` → (Fase 2) `Rascunho` → `Em execucao` → `Concluida`.

### Passo 6 — Escrever PRD de Produto

Usar `TEMPLATE-PRD.md`. Pontos criticos:

- **Resumo Executivo:** preencher TODOS os campos (ID, Titulo, Tipo, Prioridade,
  Solicitante, Data de hoje, Autor, Versao 1.0).
- **Campo "Expande":** so se expande um DT existente.
- **Ambiente:** copiar do Perfil (CLI, banco de teste, baseURL).
- **Requisitos Funcionais:** numerados RF-01, RF-02... cada um com Descricao, Regras,
  Entrada, Saida.
- **Criterios de Aceite:** agrupados por feature, com checkboxes `[ ]`.
- **Faseamento:** fases logicas com estimativa de esforco.
- **Riscos e Mitigacoes:** riscos reais do projeto (timezone, duplicacao de envio, perda
  de dado), nao genericos.
- **REMOVER** o bloco de instrucoes do template antes de salvar.

### Passo 6.1 — Persistir o discovery (`_discovery.md`)

Para a Fase 2 poder rodar numa sessao nova **sem refazer o discovery** (os agents do Passo 2), grave
a sintese em `prds/PRD-NNN-<nome-curto>/_discovery.md`. Esse arquivo e o **estado** que a Fase 2
consome e tambem o **marcador** que o Passo 0.0 usa para detectar a PRD pendente. Conteudo:

```markdown
# Discovery — PRD-NNN-<nome-curto>
> Estado da Fase 1 para a Fase 2 consumir. Nao re-rodar o discovery (Passo 2) ao retomar.

## Escopo final aprovado
<1-3 frases — o que o usuario confirmou no Passo 3>

## DTs a absorver (aprovados)
- DT-XXX: <como tratar>   (ou "Nenhum")

## Schema relacionado + gaps (Agent B)
<tabelas/colunas/indices relevantes + gaps a cobrir>

## Codigo existente + helpers + padroes locais (Agent C)
<arquivos, endpoints, helpers reusaveis, padroes a seguir, quirks>

## PRDs precedentes a respeitar (Agent D, se rodou)
<numero + o que respeitar>

## Inovacoes aprovadas (tony-stark) e backlog
- 🟢/🟡 incorporar: <lista>   | 🔵 backlog/DT: <lista>

## Mapa de impacto (atlas, se rodou)
<pontos 🔴/🟠 + o que o plano precisa cobrir: consumidor a ajustar, teste de regressao, rollback>

## Efeitos colaterais (Passo 3.1, se aplicavel)
<pontos de disparo afetados, interceptor central, o que a acceptance task valida>

## Preset / modelos resolvidos
<preset + modelos do discovery/beholder/michelangelo/dedalo>

## Maquete (ariadne, Passo 6.1.1 — se rodou)
<caminho do MOCKUP.md + variante aprovada + o que o humano derrubou; ou "nao rodou">
```

Mantenha enxuto (e sintese, nao despejo dos relatorios). Se o usuario aprovou ajustes de escopo no
Passo 3, reflita o **escopo final** aqui — a Fase 2 trata este arquivo como verdade.

**Gravar/atualizar o cache do modulo (2.5.0).** Se o discovery B/C rodou completo (sem cache
valido), grave tambem `prds/_discovery-cache/<modulo>.md` com o mapa REUTILIZAVEL (o que nao
depende desta PRD especifica):

```markdown
# Discovery-cache — <modulo>
- **data:** AAAA-MM-DD
- **commit:** <git rev-parse --short HEAD>
- **paths:** <diretorios/arquivos do modulo que o B/C mapearam — a chave de invalidacao>

## Schema do modulo (Agent B)
<tabelas, colunas, indices, relacionamentos — SEM os gaps especificos da PRD>

## Codigo do modulo (Agent C)
<arquivos, endpoints, helpers, padroes locais, quirks>

## Precedentes (Agent D, se rodou)
<PRDs anteriores + o que respeitar>
```

A proxima `/prd` neste modulo pula o B/C se nada tocou os `paths` desde o `commit`. Gaps e
analises especificas da PRD atual ficam SO no `_discovery.md` — o cache guarda o mapa, nao a
opiniao.

### Passo 6.1.1 — Maquete da tela (ariadne — so quando pedida na entrevista)

> **Roda quando** o item 6 da Entrevista unica foi **sim**, a PRD tem **tela nova** e
> `HARNESS_SKIP_MOCKUP` nao esta em `1`. Nos demais casos, **pule em silencio** — sem ruido em PRD
> de backend nem em tela irma de uma que ja existe.
>
> **3.4.15 (item 5) — a ariadne NAO espera a PRD de produto.** Ela precisa das decisoes da entrevista
> (publico, tarefa, telas) e do partido visual REAL do projeto, que ela mesma extrai do codigo — nao
> dos RFs escritos. Despache-a **na mesma leva do discovery (Passo 2), com `run_in_background:
> true`**, passando o bloco de decisoes da entrevista no lugar do caminho da PRD. Aqui no 6.1.1 voce
> so COLHE o resultado (ja pronto ou a minutos de ficar) e faz a parada da variante. Medido (PRD-135,
> 02/09): 30 min de ariadne bloqueante entre a PRD e a tecnica; em background ela cabe inteira
> dentro do discovery + escrita da PRD.
>
> **Por que aqui e nao depois:** desenhar antes da PRD tecnica faz a correcao de escopo acontecer
> enquanto ele e papel. Depois da tecnica escrita, a mesma correcao custa reescrever componentes,
> tasks e (pior) codigo ja revisado.

**Dispare UM agente `ariadne`** (nunca varios para o mesmo pedido — as variantes precisam nascer do
mesmo partido visual). Modelo: `sonnet` sempre, em qualquer preset.

```
Agent tool:
subagent_type: "ariadne"
model: "sonnet"
prompt: |
  Desenhe a maquete de <tela/fluxo> da PRD-NNN (<titulo>), projeto <nome>.
  Leia .claude/PERFIL-RESUMO.md (fallback PERFIL-PROJETO.md), a PRD de produto em
  prds/PRD-NNN-<slug>/PRD-NNN-<slug>.md (RFs e criterios de aceite) e o _discovery.md
  da mesma pasta (codigo e padroes que o discovery ja mapeou).

  Contexto: publico <interno | cliente final>; tarefa principal <frase>; variantes <N | decida>.
  Destino dos arquivos: prds/PRD-NNN-<slug>/mockup/

  Siga integralmente o seu contrato (.claude/agents/ariadne.md): extraia o partido visual REAL do
  projeto ANTES de desenhar, todos os estados no andaime, dados fake plausiveis em PT-BR, zero CDN,
  e capture a maquete com `npx playwright screenshot` (desktop + 375px) antes de entregar —
  evidencia e arquivo, nao janela; o pane e sonda opcional de UMA tentativa (PLATAFORMAS.md §7).
  Escreva o MOCKUP.md e devolva o relatorio no
  formato do contrato. NAO altere codigo de producao nem os documentos da PRD.
```

**Depois que ela voltar — a parada:**

1. Apresente o partido visual (e de onde veio), a tabela de variantes e as decisoes derrubaveis;
   mostre o caminho de cada arquivo e como abrir (`start <caminho>.html`).
2. **Pergunte o que muda** e itere com a ariadne quantas vezes o usuario quiser (cada rodada e
   barata). Registre no `MOCKUP.md` o que mudou a cada rodada.
3. Fechado o desenho, registre a variante aprovada no `_discovery.md` (secao "Maquete") e siga.

> **Esta e a unica parada do modo TURBO** — e o usuario ja sabia disso ao responder a entrevista.
> No modo CLASSICO ela se funde ao aceite do Passo 6.2 (apresente maquete e PRD de produto juntas).
> A maquete aprovada **nao e descartada**: ela e entrada obrigatoria do `dedalo` no Passo 7.

### Passo 6.2 — Fim da Fase 1: TURBO segue direto; CLASSICO para no aceite

Consulte o **modo de conducao da Entrevista unica (Passo 0.1)**:

**Modo TURBO (default desde 2.4.0):**

1. **Feche a telemetria da Fase 1** e cole o bloco "## Telemetria" gerado:
   `bash .claude/hooks/harness-metrics.sh stop PRD-NNN-fase1 --modo=<leve|completo> --subagents=<n discovery (+ ariadne, se rodou)> --preset=<preset> --models="discovery <modelo>"`
   (`--modo=` e o rito do Passo 1.5 — 3.4.24; e o campo que compara as duas trilhas)
2. Apresente um resumo CURTO da PRD de produto (titulo, RFs principais, o que ficou de fora) +
   o caminho do arquivo — informativo, **sem aguardar resposta**.
3. **Siga direto para a Fase 2** (tecnica + tasks + gates). O aceite humano acontece **uma
   unica vez, no Passo 11** — sobre o pacote completo.
   > **Unica excecao (2.9.0):** se o usuario pediu maquete na entrevista, o Passo 6.1.1 ja parou
   > para o refino do desenho — e ele sabia disso ao responder. Aqui nao ha parada nova. O `_discovery.md` continua sendo
   persistido (Passo 6.1): se a sessao cair no meio da Fase 2, a retomada nao refaz nada.

**Modo CLASSICO (escolhido na entrevista — conta apertada / escopo incerto):**

1. Feche a telemetria da Fase 1 (comando acima).
2. Apresente um resumo curto da **PRD de produto** (titulo, problema, RFs principais, criterios de
   aceite, faseamento) + o caminho do arquivo, e os pontos que o usuario deveria conferir.
3. **Peca o aceite explicito** com estas opcoes:
   ```
   PRD de produto pronta para sua validacao: prds/PRD-NNN-<nome>/PRD-NNN-<nome>.md
   Revise o escopo. Para seguir ao detalhamento (PRD tecnica + tasks + PROMPT-EXECUCAO + gates):
   - "segue" / "pode detalhar"  → eu continuo a Fase 2 agora, nesta sessao.
   - depois                     → rode `/prd` de novo (mesma janela ou nova, em horario melhor): eu
                                  detecto a PRD-NNN aguardando e retomo. Atalho: `/prd continuar PRD-NNN`.
   Quer ajustar algo na PRD de produto antes? Diga o que mudar — corrijo so ela (barato) antes do
   detalhamento.
   ```
4. **Aguarde.** Sem aceite, a `/prd` encerra aqui — a Fase 1 esta completa e persistida. Ajuste
   pedido pelo usuario: reescreva a PRD de produto, atualize o `_discovery.md` se o escopo mudou, e
   volte a pedir o aceite.

---

# FASE 2 — Detalhamento + Gates (so com aceite explicito)

> **Entrada na Fase 2** por um destes caminhos:
> - **Inline:** o usuario aceitou ("segue") logo apos o Passo 6.2, na mesma sessao — o discovery
>   ainda esta vivo no contexto; siga direto ao Passo 7 (o `_discovery.md` ja esta no disco como
>   backup).
> - **Retomada:** o Passo 0.0 detectou a PRD pendente e o usuario escolheu continuar (sessao nova).
>   Antes do Passo 7: (a) confirme que o Perfil foi carregado (Passo 0); (b) **leia a PRD de produto
>   e o `_discovery.md`** da pasta da PRD — eles substituem o discovery vivo; **nao** re-rode os
>   agents do Passo 2; (b.1) a secao "Maquete" do `_discovery.md` aponta uma maquete aprovada? Ela e
>   entrada do `dedalo` no Passo 7.1 — nao a ignore nem mande desenhar de novo; (c) se passou tempo consideravel desde a Fase 1 e o repo pode ter mudado, vale
>   revalidar via Glob/Grep os `arquivo:linha` chave antes de escrever a tecnica.
>
> **Telemetria da Fase 2:** dispare uma vez ao entrar —
> `bash .claude/hooks/harness-metrics.sh start PRD-NNN-fase2`.
>
> **Templates da Fase 2:** leia agora os dois que faltam —
> `Read: prds/_templates/TEMPLATE-PRD-TECNICA.md` e `Read: prds/_templates/TEMPLATE-TASK.md`.
>
> **INDEX:** mude o status da PRD-NNN de `Aguardando Fase 2` para `Rascunho` (em detalhamento).

### Passo 7 — Escrever PRD Tecnica

Usar `TEMPLATE-PRD-TECNICA.md`. Pontos criticos:

- **Instrucao de execucao no topo:** MANTER.
- **Analise do sistema atual:** basear no codigo REAL mapeado no discovery (Passo 2 vivo, ou o
  `_discovery.md` na retomada).
- **Componentes numerados:** cada um = um arquivo ou bloco logico de mudanca.
- **UI/telas — o dedalo projeta (2.9.0):** havendo trabalho de interface, **nao desenhe voce**.
  Dispare o agente **`dedalo`** (Modo P) e cole o retorno dele na secao "Frontend / Interface" da
  PRD Tecnica. Ver **Passo 7.1** logo abaixo — e o passo que existe para o front ter um autor com
  contexto limpo, em vez de nascer de passagem no meio da escrita da tecnica.
- **Codigo de referencia SO onde ha risco (2.4.0):** escreva codigo completo APENAS para os
  componentes em que o codigo decide o acerto — migration/DDL, SQL delicado, regex, integracao
  com efeito colateral, algoritmo nao-obvio, padrao novo no projeto. Componentes rotineiros
  (CRUD, tela padrao, wiring) sao especificados por **contrato**: assinatura, entrada/saida,
  arquivos, regras e criterios verificaveis — o hefesto implementa seguindo os padroes locais
  do modulo (que o discovery mapeou). Motivo medido: 14,4M tokens de output em 35 sessoes,
  boa parte codigo escrito DUAS vezes (no documento e depois no repo). Onde houver codigo,
  ele e completo e funcional — nunca pseudocodigo — e **compativel com a runtime de PRODUCAO
  do Perfil** (ex: nao usar features mais novas que a de producao).
- **Endpoints:** parametros, request/response com exemplos, autenticacao conforme o
  padrao do projeto.
- **Riscos:** incluir o gate de efeitos colaterais do Passo 3.1 (se aplicavel).
- **Analise de impacto (quando o atlas rodou):** subsecao propria em Riscos com os pontos
  🔴/🟠 do mapa do atlas e COMO cada um e coberto (consumidor ajustado em qual task, teste
  de regressao em qual spec, rollback). Ponto 🔴 sem cobertura declarada = a PRD nao esta
  pronta. Incluir tambem os "consumidores externos presumidos" como risco a confirmar.
- **Tasks derivadas:** tabela com dependencias + diagrama de sequencia ASCII.
- **REMOVER** o bloco de instrucoes de uso, mas **MANTER** "INSTRUCAO CRITICA PARA EXECUCAO".

### Passo 7.1 — O front tem um autor (dedalo, Modo P) [so quando a PRD tem UI]

> **Por que existe (2.9.0).** Ate a 2.8.0 esta skill dizia "conduza o design com a UI UX Pro Max" —
> e quem conduzia era **esta sessao**, com o contexto lotado de discovery, no meio de escrever a
> tecnica. Sem autor dedicado, o design saia do preset generico da skill (a tal "cara de IA") e o
> michelangelo virava o unico responsavel pelo front — mas ele **critica**, nao constroi. O
> `dedalo` e o autor; o michelangelo continua sendo o gate independente (Passo 10).

**Detectar UI** — mesma regra do Passo 10.0 (ver la). Sem interface, **pule este passo**. Bypass
consciente: `HARNESS_SKIP_DEDALO=1` (o front volta a ser escrito por esta sessao, como ate a 2.8.0
— o michelangelo continua cobrando o resultado no Passo 10; registre o bypass no resumo).

**Dispare UM agente `dedalo`** (subagente, contexto limpo), em Modo P. Modelo: Perfil → "Modelo do
dedalo"; se resolver `opus` ou `fable`, passe `model: "<valor>"`.

```
Agent tool:
subagent_type: "dedalo"
model: <"opus" so se o Perfil/preset resolver opus>
prompt: |
  MODO P (projeto — a tela ainda e papel). Projete o front da PRD-NNN (<titulo>), projeto <nome>.

  Leia: .claude/PERFIL-RESUMO.md (fallback PERFIL-PROJETO.md), a doc raiz de convencoes do
  projeto, prds/PRD-NNN-<slug>/PRD-NNN-<slug>.md (RFs, criterios de aceite, quem usa a tela) e
  prds/PRD-NNN-<slug>/_discovery.md (codigo, padroes locais e helpers ja mapeados).
  <se houve maquete:> A maquete APROVADA esta em prds/PRD-NNN-<slug>/mockup/MOCKUP.md — partido,
  fluxo e copy de la sao ENTRADA, nao sugestao; divergir exige justificativa no relatorio.

  Telas envolvidas: <lista>. Publico: <interno | cliente final>.

  Siga integralmente o seu contrato (.claude/agents/dedalo.md): Fase 0 de ancoragem antes de
  qualquer decisao visual, reusar vence inventar, todos os estados (com dados/vazio/carregando/
  erro), contraste CALCULADO por par de cores, microcopy final em PT-BR, responsividade.
  Respeite a regra 2.4.0 do harness — markup completo SO para componente novo ou nao-obvio;
  componente com precedente e especificado por contrato APONTANDO o arquivo-precedente.

  Devolva o TEXTO PRONTO da secao "Frontend / Interface" + a lista de componentes de UI por task.
  NAO edite os documentos da PRD — quem escreve sou eu.
```

**Com o retorno em maos:**

1. Cole a secao "Frontend / Interface" na PRD Tecnica (ajustes de forma sao seus; **decisoes de
   design sao dele** — nao reescreva o partido).
2. Distribua os componentes de UI pelas tasks do Passo 8 e **carimbe `Tipo: front`** nelas.
3. Se o dedalo criou `design-system/MASTER.md`, cite-o na tecnica: a proxima PRD deste projeto
   herda o sistema em vez de gerar outro.
4. Se ele voltou com `base de design indisponivel` (ui-ux-pro-max ausente), **diga isso ao
   usuario** — nao deixe passar em silencio.

### Passo 7.2 — PRE-GATE estrutural do beholder (3.4.10 — melhoria #4, shift-left) [so no rito COMPLETO]

> **3.4.24:** no MODO LEVE (padrao) pule — o gate do Passo 10 cobre. O pre-gate e do rito COMPLETO.

Com a tecnica escrita (7) — **na MESMA mensagem em que o dedalo do 7.1 e despachado (3.4.15, item
4): o pre-gate julga a tecnica SEM a secao de front, que o dedalo esta escrevendo; os dois voltam
juntos e a pai cola o front + aplica os 🔴 estruturais de uma vez** (medido: eram seriais, 8-10 min
de pre-gate depois de 10-25 min de dedalo). Um **beholder em MODO
ENXUTO** faz UMA passada so na PRD-TECNICA (+ produto), apenas pelas lentes ESTRUTURAIS —
escopo/divisao proposta de tasks, integracao com efeito colateral esquecida, seguranca de
desenho, dado/schema inconsistente. Prompt curto: *"Pre-gate estrutural da PRD-NNN: leia
APENAS a tecnica e o produto; reporte SO achados estruturais 🔴 (ambiguidade de texto e
criterio fino ficam para o gate completo do Passo 10); teto de 10 min; devolva ate 5 achados
ou 'estrutura solida'."* Achou 🔴 estrutural → corrija AGORA (hermes Modo C — barato: as
tasks ainda nao existem, nada corrige em cascata). **Nao conta como ciclo do Passo 10** e o
gate completo continua obrigatorio. Racional: ambiguidade estrutural descoberta no ciclo 1
custa correcao em ate 5 camadas x 8 tasks; aqui custa 1 edit na tecnica (PRD-132: beholder
precisou de 3 ciclos, 2 bloqueantes eram estruturais).

### Passo 8 — Escrever Tasks (PLANO pela sessao-pai; REDACAO pela pai no MODO LEVE, pelo hermes no rito COMPLETO — 3.4.10, melhoria #1; 3.4.24, item 12)

> **A pai DECIDE; quem ESCREVE depende do rito (Passo 1.5).** Redigir 8+ tasks na sessao principal
> era o maior output da criacao — e cada task escrita virava transcript relido em todos os turnos
> seguintes (o mecanismo dos 832M de tokens_total da PRD-125-fase2). Com o teto de 8 tasks e o
> contrato denso (~200 linhas), a pai redige ate 8 em 5-14 min — abaixo do hermes (17-22 min) mais
> o degrau serial; por isso no MODO LEVE (padrao) a redacao voltou para a pai.

1. **Monte o PLANO DE TASKS** (voce, sessao-pai — e DECISAO, nao redacao): tabela enxuta com
   `id | titulo | Tipo (front/backend) | Depende de (aresta TIPADA + artefato) | Conflita com
   | Duelo (sim/auto/nao — justificado) | Componentes da tecnica referenciados`. Todas as
   regras de qualidade abaixo valem PARA O PLANO (grafo real, contrato-nao-copia, fatiamento).
2. **Quem redige (3.4.11; rito por risco na 3.4.24):** no **MODO LEVE (padrao, Passo 1.5) voce
   redige todas as tasks, ate as 8 de trabalho**, direto do plano (medido: 5-9 min ate 6 tasks na
   3.4.8 contra 17-22 min do hermes; 7-8 tasks estimadas em 10-14 min) — e o ciclo 1 dos gates
   sobe logo depois, com o packet ja com o indice das tasks. **So no rito COMPLETO** e a partir de
   **7 tasks de trabalho**, despache **DOIS agentes `hermes` (Modo E) na MESMA mensagem** — e,
   **nessa mesma mensagem, o CICLO 1 dos gates do Passo 10 sobre o packet de produto + tecnica**
   (3.4.15, item 2: `bash .claude/hooks/prd-packet.sh --label PRD-NNN` antes; o packet sai com
   "tasks em redacao" e o ciclo 2 recebe o indice das tasks) — cada hermes com
   metade do plano (corte por Tipo front/backend, ou metades), os dois com o mesmo **GLOSSARIO**
   (~10 linhas que voce escreve: termos canonicos, nomes de campos/tabelas/endpoints,
   componentes) — a coerencia vem do glossario, nao do agente unico. Cada prompt leva: o caminho
   da tecnica + **por task, os componentes da tecnica que ela referencia** (o hermes le SO esses,
   nunca a tecnica inteira), o plano, a fatia (ids), o glossario e
   `prds/_templates/TEMPLATE-TASK.md`. Eles gravam direto nos arquivos e devolvem o **sumario
   padrao** (2 niveis — 1 linha por task: id, titulo, camadas, linhas). **Tamanho: alvo ~200
   linhas por task, teto duro 230, so as camadas que a task exige** (o `guard-agent --post` avisa
   quando a media passa de 200; o `--check` marca GRANDE acima de 230 — medido 01/09: 371-403
   linhas por task dobraram o custo de cada gate; 03/09: contrato denso converge em ~218).
3. **Confira MECANICAMENTE, depois por amostragem** (nao releia tudo): um `grep` sobre
   `tasks/*.md` confere ids, `Tipo`, `Depende de` tipado com artefato e componentes referenciados
   contra o plano (10 linhas de bash); so depois abra 1 task (a mais critica) e confira o contrato.
   **Meca o tamanho (3.4.18 — enforcado, nao aviso):** `for t in prds/PRD-NNN-*/tasks/TASK-*.md; do
   bash .claude/hooks/task-packet.sh "$t" --check; done` → tres linhas por task:
   `PACKET-CHECK|TASK-NNN|<KB>|<alvos>|<linhas>|ok|GRANDE[|<motivos>]`,
   `PREVISAO|TASK-NNN|<min> min|n=<k>|<papel>|ok|GRANDE` e `DUELO-CHECK|TASK-NNN|ok|inelegivel|<motivo>`.
   **GRANDE** = packet acima de `HARNESS_PACKET_MAX_KB` (300) OU mais de 4 arquivos-alvo OU mais de
   `HARNESS_TASK_MAX_LINHAS` (230) linhas OU **previsao acima de `HARNESS_TASK_PREVISAO_MAX_MIN`
   (45 min) — 3.4.24, item 9:** a mediana das tasks ja medidas deste projeto (mesmo papel, packet
   parecido) diz quanto essa vai levar; `PREVISAO|...|GRANDE` e task GRANDE como as outras (o 7º
   campo do `PACKET-CHECK` diz o motivo; `n/d` = sem historico, nao conta). Task GRANDE **e
   fatiada AGORA**, por arquivos disjuntos, com patch pronto ao hermes (rito COMPLETO) ou pela
   sua propria mao (MODO LEVE) (`TASK-00N → TASK-00N + TASK-0NN`, cada uma com seus arquivos e
   seu `[requires]`), **antes do ciclo 2 dos gates** — nunca "a exec refatia". Medido 02/09
   (PRD-135-b): 4 de 8 tasks com 66-141 min tendo 215 linhas cada — o teto de linhas nao previu;
   a previsao por historico preve.
   **Duelo elegivel de verdade (3.4.24, item 11c):** `DUELO-CHECK|TASK-NNN|inelegivel|<motivo>` em
   task com `Duelo | sim` (mais de 2 arquivos-alvo de producao, ou arquivo NOVO citado em
   "Arquivo(s) Afetado(s)") = rebaixe o campo AGORA para `nao — <motivo>` (ex.: `nao — 3 alvos de
   producao`, `nao — arquivo novo`), na propria task — o `guard-agent` le esse campo na exec.
   Medido 01-07/09: 24 duelos, 4 aplicados; diff de arquivo novo ou de 3+ alvos nunca aplicou.
   **Grafo de dependencias (3.5.7):** o `--check` de qualquer task imprime tambem `GRAFO|PRD-NNN|tasks=N|
   profundidade=D|largura_max=W|fator_teorico=F|caminho_critico=A>B>C` e `GRAFO-VEREDITO|ok|serial|<sugestao>`
   (detalhe por nivel e gargalo: `node .claude/hooks/task-grafo.mjs prds/PRD-NNN-*/tasks`). O fator teorico
   (tasks / profundidade) e o TETO de paralelismo que o plano permite — medido 15-16/09 em 5 execs: todas
   fecharam `limitou=dependencias` com paralelismo real 1,18-1,29 sob teto 6; o gargalo era o plano, nao a
   maquina. `serial` (fator < `HARNESS_GRAFO_FATOR_MIN`, 2) = replaneje AGORA, antes do gate: extraia a
   interface do gargalo (`GRAFO-GARGALO`: helper/contrato/migration) numa task curta e libere as consumidoras
   no mesmo nivel; front e back da mesma feature viram tasks irmas (arquivos disjuntos), nao encadeadas;
   `[requires]` so quando a task de fato le o artefato — dependencia "por seguranca" e cadeia inutil.
   **Dono de arquivo (3.4.20):** na mesma conferencia, `bash .claude/hooks/task-matrix.sh
   "prds/PRD-NNN-*/tasks/TASK-*.md"` → `MATRIZ-HUB|<arquivo>|<n>|<tasks>` para arquivo de producao
   citado por **3+ tasks**. Hub = replanejar AGORA: ou vira task propria (o hub primeiro, as
   consumidoras com `[requires]` sobre ele), ou o codigo novo nasce em modulo proprio e o arquivo
   compartilhado recebe 1 linha numa unica task. Medido 03/09 (PRD-137): `sugerir_resposta.php` em
   5 tasks → `limitou=mutex`, 5 tasks em serie. Medido 02/09: a PRD-135 chegou a exec com 3
   packets de 324–364 KB e refatiou duas tasks em voo (TASK-011/012, 30 min de replanejamento +
   incidente no `task-packet.sh` por sufixo de letra); a TASK-004 de 57 min foi o caminho critico.
   Divergencia → devolva ao hermes com o **PATCH PRONTO** (`arquivo:secao → texto`), nunca com a
   descricao do problema (PRD-133, 01/09: 18 min de "propagar correcoes" por divergencia
   descrita em prosa). Duas divergencias → releia todas (o lote saiu ruim).

Regras de qualidade do plano e da redacao (o hermes as recebe no contrato dele; use-as aqui
para montar o plano). Para CADA task:

- **Instrucao de execucao:** MANTER.
- **Metadados:** PRD (link), Status Pendente, Depende de/Bloqueia corretos.
  > **`Tipo` (2.9.0):** `front` quando a task constroi/altera **interface** (view, template,
  > componente, CSS, JS de tela); `backend` no resto. E o campo que a Fase 1 do `/prd-exec` le para
  > decidir **quem forja**: task `front` vai para o **dedalo**, o resto para o **hefesto**. Task
  > mista (endpoint + tela na mesma) deve ser **fatiada** — se nao der, marque `front` e liste no
  > objetivo a parte de backend. Sem o campo, o `/prd-exec` cai na deteccao por extensao de arquivo.
  > **"Depende de" e o GRAFO DE EXECUCAO, nao sugestao de ordem.** A Fase 1 do `/prd-exec`
  > consome esses campos **mecanicamente** para montar as ondas de paralelismo: tudo que nao
  > depende de nada roda JUNTO, na primeira onda. Declare somente dependencia REAL (schema/
  > dado/arquivo produzido por outra task); "Nenhuma" = paralelizavel desde o inicio.
  > Dependencia inventada "por seguranca" sequencializa a execucao a toa — ja custou ~2h
  > extras numa PRD real de 13 tasks.
  > **A aresta e TIPADA e o artefato e obrigatorio no `[requires]` (3.2.1):** escreva
  > `TASK-003 [requires] — consome a coluna clientes.pix_tipo criada la`, nunca `TASK-003` seco.
  > `[barrier]` (condicao de seguranca, sem consumo de arquivo) carrega a **condicao** no lugar
  > do artefato. Conflito de recurso nao e dependencia: vai no campo **`Conflita com`** como
  > `[mutex]`. `requires` sem artefato nomeado e **derrubado** pelo gate de largura do
  > `/prd-exec` e a task sobe para a onda 1. Ver "Dependencias TIPADAS" nas Regras para divisao
  > de tasks.
  > **`Duelo` (3.3.0; recalibrado 3.4.5 com dados):** em task de PRD, **so `sim` dispara
  > duelo** na exec — e `sim` e RESERVADO para task **genuinamente mecanica**: troca
  > localizada, sem decisao de dominio, que um modelo barato acerta de primeira (regra
  > pratica: se o titulo cabe em "trocar/adicionar/remover X em Y", e candidata a `sim`).
  > Medido 26-27/08: em task de PRD comum o juiz reprovou ate pares de diffs aplicaveis
  > (nota maxima 4,5) — duelo ali e pedagio; em DT de lote mecanico ele aprova (8,3-8,5)
  > e ganha 3-10x em tempo. `auto` continua sendo o default de nascenca (alimenta a
  > heuristica dos LOTES quando o DT herdar a task), e `nao` continua exigindo
  > justificativa inline (`nao — migration`, `nao — auth`...; `nao` seco e derrubado
  > **Task que CRIA arquivo e `nao — arquivo novo` (3.4.19)** — o duelo so sabe editar.
  > pelo gate). Fatie a PRD pensando nisso: quanto mais tasks pequenas e mecanicas
  > (candidatas a `sim`), mais rapida a execucao.
- **Objetivo:** 1-2 frases.
- **Alteracoes detalhadas — CONTRATO, nao copia de codigo (2.4.0):** a task descreve O QUE
  muda em cada arquivo (contrato: assinatura, entrada/saida, regras, estados) e **referencia**
  o "Componente N da PRD Tecnica" — **nunca duplica** o codigo que ja esta la. Codigo inline na
  task SO para o trecho de risco que nao esta na tecnica (e curto: ate ~30 linhas). O hefesto
  le task + componente referenciado; escrever o mesmo codigo nos dois documentos dobra o custo
  de escrita E de correcao nos ciclos dos gates (cada achado corrigido em 2 lugares).
- **Checklist:** pre/durante/pos com validacao de ambiente (do Perfil).
- **Testes manuais:** comandos/URLs com os caminhos do Perfil.
- **Testes E2E:** cenarios do framework do Perfil, login do Perfil.
- **Rollback:** instrucoes especificas.
- **REMOVER** instrucoes de uso, **MANTER** "INSTRUCAO DE EXECUCAO".

#### Regras para divisao de tasks

- Cada task **atomica**: uma responsabilidade, poucos arquivos.
- **Orcamento de tamanho (fatiar se estourar):** task com mais de **~4 arquivos de producao** OU
  **~3 cenarios de spec nao-triviais** vira gargalo e concentra risco — fatie em duas. (Numa PRD
  real, a task de 7 arquivos + 5 specs foi o maior gargalo de tempo e onde o review achou o bug
  mais serio.)
- **Front constroi contra o CONTRATO, nao contra a implementacao (3.4.18):** task `front` declara
  `[requires]` so sobre artefato que ela IMPORTA (componente, helper JS, token de design). Endpoint,
  payload ou tabela cujo contrato esta na tecnica (Componente N) **nao e requires** — e
  `[barrier: integracao]` (a acceptance da onda B cobra a integracao real). O dedalo constroi contra
  o contrato com fixture local. Assim o front sobe para a **onda 1**, junto com o backend. Medido
  02/09: front esperando endpoint = 2h de caminho critico por PRD (135 e 136).
- **Dono de arquivo — vale para backend tambem (3.4.20):** arquivo de producao pertence a no
  maximo 2 tasks. Tres ou mais = hub (`task-matrix.sh` acusa): task propria do hub ou modulo novo
  + 1 linha. `[mutex]` e para colisao inevitavel, nao para plano que empilhou 5 tasks num arquivo.
- **Duas tasks de front NUNCA escrevem o mesmo arquivo (3.4.18):** codigo novo de tela nasce em
  **modulo proprio** (`assets/js/<modulo>/<feature>.js`, partial/template proprio); o arquivo
  compartilhado (inbox.js, layout, router) recebe **1 linha** (include/registro) numa unica task.
  `[mutex]` entre duas tasks `front` e defeito de fatiamento — replaneje os arquivos, nao aceite a
  serie (PRD-136: 110 min em serie por mutex de front).
- **Task 1** geralmente e schema/migration (se houver mudanca de banco).
- **Tasks intermediarias:** backend (endpoints) e frontend (paginas + js).
- **Penultima task** SEMPRE: **Acceptance Testing** (gate — ver abaixo).
- **Ultima task** SEMPRE: atualizacao do doc raiz de convencoes (Perfil, ex: CLAUDE.md) +
  DT INDEX (`Pendente` → `Resolvido (PRD-NNN)`, se aplicavel) + arquivo DT dedicado. **Inclua a poda
  do doc raiz** (ver "Politica de retencao" abaixo) — ele e relido por cada hefesto/sherlock. **Se a
  PRD alterou o `PERFIL-PROJETO.md`** (armadilha nova, integracao nova, caminho novo), a mesma task
  atualiza o **`.claude/PERFIL-RESUMO.md`** (2.4.0) — resumo dessincronizado engana todo subagente —
  e fecha rodando `bash .claude/hooks/perfil-frescor.sh --carimbar` (2.15.0), que re-carimba a
  impressao digital no resumo. **Toda entrada NOVA no Perfil sai carimbada com procedencia:**
  `**[AAAA-MM-DD · PRD-NNN]** <armadilha/regra> — *Por que:* <...>`. Sem procedencia o Perfil so
  cresce (ninguem sabe o que ainda vale) e a poda futura vira chute — e por isso que o `/deus`
  consegue podar com prova. **Poda com prova (3.4.26):** depois de carimbar, rode
  `bash .claude/hooks/perfil-poda.sh` (read-only). Em `HARNESS_PERFIL_PODA='sugerir'` (default) cole
  o `PODA-RESUMO` e as linhas 🟢 no Output, secao "Perfil — candidatos a poda"; em `auto-verde` rode
  `--aplicar-verde` + `perfil-frescor.sh --carimbar` e inclua `PERFIL-PROJETO.md`, `PERFIL-RESUMO.md`
  e `PERFIL-ARQUIVO.md` no commit sugerido. 🟡 nunca sozinho — e decisao humana no `/deus` (P2).
- Tasks independentes marcadas como paralelizaveis ("Depende de: Nenhuma") — e o grafo
  resultante deve ter o MINIMO de ondas possivel: se duas tasks podem rodar juntas, nada de
  encadear uma na outra.

#### TETO DURO — 8 tasks de trabalho (3.2.0)

**Teto: 8 tasks de trabalho + as 2 obrigatorias (acceptance + doc raiz/DTs) = 10 no total.**
Nao e recomendacao, e limite: a PRD que passa disso **para no gate de split** (abaixo).

> **Por que 8, medido (telemetria 22/07-20/08, 34 execucoes de `/prd-exec`):** os ciclos de
> review NAO escalam com a qualidade da spec — escalam com a quantidade de codigo construido.
> PRD com **<=7 tasks: 1 ciclo** mediano · **8-11 tasks: 2 ciclos** · **>=12 tasks: 4 ciclos**.
> Cada ciclo do sherlock e serial por construcao (review → correcao → review), e foi ai que
> a PRD-117 gastou 169 dos seus 513 minutos. Spec melhor produz MAIS tasks; mais tasks
> produzem mais superficie; mais superficie produz mais ciclos. O teto quebra essa espiral na
> unica ponta que o autor da PRD controla.

**Gate de split (obrigatorio, ao fechar a lista de tasks).** Contou 9+ tasks de trabalho:
**PARE e proponha o corte** — nao fatie sozinho, o corte e decisao de produto, nao de
engenharia. Uma `AskUserQuestion` (no Codex, pergunta textual) com:

1. **A linha sugerida** — corte pelo grafo de dependencias, na fronteira que deixa a fatia 1
   entregavel sozinha (fatia que compila, passa acceptance e pode ir a producao sem a fatia 2).
2. **Fatia 1** — as tasks que ficam nesta PRD (<= 8) + o que ela entrega ao usuario final.
3. **Fatia 2** — o escopo restante, ja com titulo e 1 frase de objetivo, para virar a **PRD
   seguinte**.
4. **Alternativas honestas** — (a) aceitar o corte [recomendado]; (b) mover a linha (o usuario
   diz onde); (c) seguir com a PRD grande assumindo 4 ciclos de review e o dobro de parede
   — legitimo quando as tasks sao **indivisiveis** (uma migration destrutiva unica que todas
   consomem), e ai **registre o motivo** no Resumo Executivo.

Nao ha fatiamento automatico e nao ha "deixa passar em silencio": ou o usuario aceita um corte,
ou ele assume o custo por escrito.

**Materialize a fatia aceita — agora, nao "depois" (DT-004 do mestre, regra do Charles
01/09/2026).** Fatia registrada so como linha de intencao no INDEX perde o escopo negociado e
as decisoes da entrevista (ficam no transcript da sessao; quem for toca-la dias depois
reconstroi de memoria ou re-entrevista o que ja foi decidido). Toda fatia excedente — venha
do teto de tasks, de decisao de entrevista ("fatia 2 vira PRD propria") ou de split por
risco — nasce em disco no mesmo momento em que o corte e aceito:

1. **Numeracao derivada da mae:** `PRD-NNN-b` (depois `-c`, `-d`...). Sufixo NAO consome
   numero da serie (nao chame `reservar` para fatia) e nao colide com a reserva atomica.
2. **Stub** `prds/PRD-NNN-b-<slug>/PRD-NNN-b.md` com: escopo congelado da fatia (o que entrou
   e o que ficou de fora, com fronteira explicita mae × fatia); DTs absorvidos por ela;
   decisoes da entrevista que a afetam (congeladas, com data); dependencia da mae em forma
   verificavel ("nasce apos PRD-NNN porque consome X/Y" — item a item, nao prosa); riscos
   herdados a reavaliar; e a nota de que ao destravar ela exige **discovery proprio** (o da
   mae nao cobre o territorio da fatia e o cache de modulo pode ter sido invalidado).
   Status do stub: `Aguardando fatia mae (PRD-NNN)`.
3. **Linha no `prds/INDEX.md`** com o status `Aguardando fatia mae` — visivel no quadro, e
   impede a `/dt-sweep`/outra `/prd` de re-absorver o mesmo escopo.
4. **DTs absorvidos pela fatia:** no `prds/debito_tecnico/INDEX.md` **e** no campo
   `**Status:**` de cada arquivo DT, marque `Pendente — reservado pela PRD-NNN-b` (as duas
   pontas, como sempre). Sem isso um lote paralelo puxa o DT enquanto a fatia espera.
5. A retomada usa `/prd PRD-NNN-b` (ou `continuar`): parte do stub com as decisoes ja
   congeladas — sem re-entrevista do que ja foi decidido, mas com discovery proprio.

#### Dependencias TIPADAS — o grafo e o que serializa a execucao (3.2.0, tipado na 3.2.1)

Cada aresta que voce escreve vira minutos de parede na `/prd-exec`. A 3.2.0 tratava **toda**
dependencia como consumo de artefato — o que empurrava condicoes de seguranca legitimas
("auth precisa estar estabilizada") para fora do grafo ou as disfarcava de consumo. A 3.2.1
separa **tres** relacoes que antes eram uma so:

| Tipo | Quando usar | Como o `/prd-exec` trata |
|---|---|---|
| `[requires]` | a task **le, importa ou consome** um artefato, contrato ou decisao produzido pela outra | audita; **sem artefato nomeado, derruba** e sobe a task para a onda 1 |
| `[barrier]` | a task precisa esperar uma **condicao de seguranca ou estabilizacao**, sem consumir arquivo nenhum | **preserva**, desde que a condicao esteja escrita |
| `[mutex]` | nao ha dependencia logica: as duas **disputam o mesmo recurso** de escrita ou de teste | **preserva como escalonamento** — as duas nao coincidem, mas nenhuma "vem depois" |

**Sintaxe nas tasks** — `requires` e `barrier` vao em `Depende de`; `mutex` vai no campo
proprio `Conflita com`:

```markdown
| **Depende de** | TASK-003 [requires] — consome o contrato `PagamentoDTO` criado la
                 | TASK-002 [barrier] — autenticacao estabilizada antes de qualquer teste |
| **Conflita com** | TASK-005 [mutex] — escrevem os mesmos arquivos de view
                   | TASK-006 [mutex] — usam o mesmo banco/servidor de teste |
```

**O teste da saida vale so para `[requires]`:** B requer A **somente se** B le, importa ou
consome um artefato que A cria. Ordem narrativa, "parece mais seguro", "mesmo modulo", "a
continuacao natural de A" **nao sao requires** — e tambem nao viram barrier por conveniencia:
barrier tem **condicao de seguranca escrita**, nao vibe. Caso medido (PRD-117): `TASK-004`
(lint de segredo no front) declarou dependencia de `TASK-002` (widget da topbar) sem consumir
nada dela; ficou retida ate o minuto 85, levou 155 min e segurou 2h30 de execucao sozinha.

**Compatibilidade (3.2.1):** PRD antiga sem tipo continua valida. Aresta sem tipo e **auditada
pela sessao pai**, que a classifica lendo as duas tasks — e **nao pode ser removida
automaticamente so porque nao ha consumo literal de arquivo**. Muita aresta antiga e barrier
escrita como dependencia.

**Teto de ondas: 3** para as tasks de trabalho (as 2 obrigatorias sao as ondas seguintes).
Grafo mais profundo que isso com 8 tasks significa cadeia artificial — releia cada elo pelo
tipo dele. Task-raiz que **todas** consomem e legitima, mas mantenha-a **minima**: enquanto
ela roda, a PRD inteira espera.

**Mutex nao consome profundidade.** Duas tasks em mutex ficam na **mesma** onda: o
`/prd-exec` as escalona (a segunda sobe quando a primeira devolve o recurso). Encadeia-las com
`requires` para "resolver" o conflito e o erro que este tipo existe para evitar — vira
profundidade de grafo permanente por um conflito que dura minutos.

#### Orcamento de parede por task — fatie o que passa de 45 min (3.2.0)

O orcamento de tamanho acima (~4 arquivos / ~3 cenarios) e sobre **conteudo**; este e sobre
**tempo**. Uma task que um hefesto leva mais de ~45 min para fechar vira a cauda que segura a
onda: as irmas terminam, ela nao, e o paralelismo desaba para 1. Ao escrever cada task,
pergunte se ela cabe nesse envelope; se claramente nao cabe (varre modulo inteiro, mexe em
2 camadas, tem 5+ cenarios de spec), **fatie mesmo que caiba nos ~4 arquivos**. A `/prd-exec`
mede isso na pratica e devolve o estouro como DT de dimensionamento (Fase 1.3) — leia esses
DTs antes de escrever as tasks da PRD seguinte do mesmo modulo.

#### Politica de retencao do doc raiz (poda do CLAUDE.md)

O doc raiz de convencoes (ex: `CLAUDE.md`) entra no system de **toda** sessao e subagente — cada
hefesto e sherlock o rele. Sem poda, ele incha e vira a maior fonte de tokens repetidos. Regra a
embutir na **ultima task** (a que atualiza o doc raiz):

- **Retencao:** manter no doc raiz so as **~10 PRDs mais recentes** + as convencoes vivas. PRDs
  antigas migram para `CLAUDE-HISTORICO.md` (crie se nao existir) — historico consultavel, fora do
  contexto carregado sempre.
- **Ao registrar a PRD atual:** se passou de ~10, mova a mais antiga para o historico no mesmo passo.
- Vale para qualquer secao que so cresce (changelog interno, lista de endpoints legados).

#### Task obrigatoria — Acceptance Testing (penultima)

**OBRIGATORIO em toda PRD**, como **penultima** task. Objetivo: capturar bugs em fluxos
reais ANTES de marcar a PRD como completa, evitando o ciclo PRD-NNN → bugs → PRD-(NNN+1).

> Se o Perfil declara "Nenhum" framework E2E: esta task vira um **roteiro de acceptance
> manual** (checklist de fluxos reais a validar a mao) em vez de specs automatizados. O
> gate continua existindo — a PRD so fecha quando o checklist passa.

**Nome do arquivo:** `tasks/TASK-NNN-acceptance-testing.md` (NNN = penultimo numero).

**Conteudo obrigatorio (quando ha framework E2E):**

1. **Metadados:** Status Pendente; Depende de: todas as tasks de implementacao;
   Bloqueia: a ultima task.
2. **Objetivo:** Validar end-to-end os fluxos principais do PRD de produto via
   <framework do Perfil>, capturando evidencias. A PRD so e **Concluida** quando todos
   os fluxos passam.
3. **Fluxos a validar:** derivados **diretamente dos Criterios de Aceite + RFs**. Para
   cada: nome curto; spec file (`<dir-e2e>/PRD-NNN-<slug>.spec.*`); pontos de evidencia
   (estado inicial, apos input, apos submit, estado final/erro); caminho das evidencias
   (`<pasta-de-screenshots do Perfil>`).
4. **Codigo de referencia:** template completo de cada spec, login com as credenciais do
   Perfil, asserts especificos. Sem pseudocodigo — executavel direto.
5. **Comandos de execucao:** os comandos do Perfil (spec unico + suite).
5b. **Cenarios OBRIGATORIOS de integracao (3.5.7 — incidente PRD-144: acceptance verde, feature
   inutilizavel em producao).** Alem dos fluxos derivados dos criterios, a task de acceptance
   inclui, quando a PRD tem:
   - **estado salvo no servidor e mostrado numa lista/tela com polling ou refresh:** o estado
     continua certo DEPOIS do proximo ciclo de refresh (esperar o intervalo real do codigo) e ao
     reabrir/navegar de volta — nunca so "logo apos o clique";
   - **lista paginada ou colecao:** um item FORA da primeira pagina (aberto por busca, painel ou
     link) nasce com o estado certo;
   - **item clicavel que navega:** o clique chega ao destino REAL (a conversa/tela abre), sem
     espiao no `window` e sem `route.fulfill` do endpoint da propria PRD;
   - **campo de resposta novo:** assercao de CONTEUDO com um caso positivo presente na pagina
     (`expect(resp.campo).toContain(<item que existe>)`), nunca so presenca/tipo do campo.
   Proibido em qualquer spec da PRD: `window.X = function` substituindo simbolo que o produto
   consome (espiao so envolvendo a funcao real: `const orig = window.X; expect(typeof orig).toBe('function')`).
   O `costura-check.mjs` (packet do review e gate do `stop`) reprova dublê, `route.fulfill` de
   endpoint da PRD no acceptance e marcadores "NAO VERIFICADO"/"a integrar na TASK-N" em codigo.
6. **Criterio de Sucesso (gate):** 100% dos specs PRD-NNN passam (`X passed, 0 failed`);
   evidencias geradas. Se qualquer spec falhar: NAO avancar para a ultima task; reportar
   bug, abrir DT (ou corrigir inline se trivial), re-rodar. PRD fica `Em andamento` ate o
   gate fechar.
7. **Output Esperado** (para o resumo do `/prd-exec`):
   ```
   ### Acceptance Testing (TASK-NNN)
   - Specs executadas: N
   - Resultado: X passed, Y failed
   - Evidencias: <pasta> (M arquivos)
   - Status: APROVADO / REPROVADO (lista de specs falhando)
   ```

**Regra de gate (refletir no PROMPT-EXECUCAO.md):** o `/prd-exec` so segue para a ultima
task e para a Fase 2 (Codex review) quando esta task fecha com 100% de aprovacao. Se
reprovar e nao for trivial, marcar PRD como `Bloqueada — bugs em acceptance` e devolver
controle ao usuario.

### Passo 9 — Escrever PROMPT-EXECUCAO.md (STUB desde a 3.4.9 — melhoria #10)

> **Podado com validacao (31/08):** o documento longo era redundante — fases e grafo ja moram
> na PRD tecnica, contrato e verificacao por task ja moram nas tasks, armadilhas no Perfil; a
> `/prd-exec` o le 1x "se existir" e o beholder gastava 3 ciclos revisando a redundancia.
> O arquivo CONTINUA existindo (INDEX/template linkam), mas como **stub de ~12 linhas**:

```markdown
# Prompt de Execucao — PRD-[NNN]: [Titulo]

> Para executar: `/prd-exec PRD-NNN` (o fluxo completo mora na skill; este arquivo e um mapa).

- **O que e:** [1 frase]
- **Fontes canonicas:** PRD tecnica (fases + grafo tipado) · `tasks/` (contrato e verificacao
  por task) · `.claude/PERFIL-PROJETO.md` (ambiente, armadilhas, safe-mode)
- **Ondas previstas (do grafo "Depende de"):** `Onda 1: TASK-001..003 | Onda 2: ...` (1 linha)
- **Gate bloqueante:** acceptance `PRD-NNN-*` 100% antes da task final e da Fase 2
- **Pontos criticos (top 3 do Perfil para ESTA PRD):** [3 bullets de 1 linha]
- Nao commitar; evidencias e doc raiz conforme a /prd-exec.
```

Nada alem disso — detalhe que voce sentir falta aqui pertence a tecnica ou as tasks (conserte
LA, que e onde a exec e os gates leem).

### Passo 10 — Gates de qualidade da PRD (beholder + michelangelo, em CICLOS paralelos)

> **OBRIGATORIO — nunca pule.** A PRD escrita passa por dois gates adversariais, simetricos ao
> tony-stark (que entra ANTES, no Passo 2, propondo melhorias):
> - **beholder** — ataca a **correcao da spec** (ambiguidade, criterio fraco, caso de borda,
>   seguranca, datas, divisao de tasks, impacto). Roda em **toda** PRD. E o gate barato que evita o
>   caro — um criterio ambiguo custa 1 min aqui e 3h depois que virou codigo, teste e bug.
> - **michelangelo** — ataca o **design de front-end** proposto (hierarquia, carga cognitiva,
>   estados, WCAG, prevencao de erro, consistencia, responsividade, microcopy). Roda **so quando a
>   PRD tem trabalho de interface**. E o gate de UX simetrico ao beholder: o beholder pergunta *"o
>   que quebra?"*, o michelangelo *"esse front esta bom para o usuario?"*. Lema: **garantir sempre o
>   melhor front possivel**.
>
> O `/codex-review` revisa codigo escrito; estes dois revisam a **spec** antes de uma linha ser
> implementada.

#### 10.0 — Quais gates rodam

- **beholder:** sempre.
- **michelangelo (gate de UX):** so se a PRD **tem trabalho de interface**. Detectar por QUALQUER um:
  (a) a secao **"Frontend / Interface"** da PRD Tecnica esta preenchida (nao vazia/"N/A");
  (b) ha **componentes de UI nas tasks** (markup/JS/tela);
  (c) ha task com **`Tipo: front`** nos metadados (2.9.0).
  > Esta mesma deteccao decide se o **dedalo** roda no Passo 7.1 — quem projetou o front e quem e
  > criticado por ele. Se um rodou e o outro nao, ha erro de deteccao em algum dos dois.
  PRD puramente backend/migration/config (nenhum dos dois): **pule o michelangelo** (sem ruido) —
  exatamente como o atlas pula em greenfield. Anuncie ao usuario quando o gate de UX entrar.
  > **3.4.15 (item 10) — maquete aprovada muda o regime do michelangelo:** quando o usuario escolheu
  > a variante no 6.1.1, o partido, o fluxo e a copy ja passaram por um humano; o ciclo 1 vira
  > CHECKLIST (estados, WCAG, responsividade, microcopy) sobre a secao de front e o indice das tasks
  > de UI, com teto de 30 chamadas, e **nao ha ciclos seguintes sem 🔴**. Medido 02/09 (PRD-135): 3
  > ciclos de michelangelo (10-17 min cada) reavaliando um partido ja aprovado.
  > **Nao** use `Skip HTML Roadmap` como gatilho: a semantica dele e "gerar o HTML interativo da
  > Fase 4?" (desde a 2.4.0 o HTML e **opt-in** — ausente = pula), nao "a PRD tem UI?". Sao eixos
  > independentes; detecte UI so pelos criterios (a)/(b) acima.

> **Lentes ortogonais — sem duplicar.** O beholder cobre ortografia/acentuacao das strings e quirks
> de markup da lib; o michelangelo cobre a experiencia (as 10 lentes de UX). Eles nao colidem.

**Limite de ciclos (2.5.0 — base + escalada; TETO ABSOLUTO 3 desde a 3.3.0 — S5):** cada gate
tem o seu, independente. Ler o Perfil → "Agentes do harness (modelos)" → **"Ciclos do beholder"**
e **"Ciclos do michelangelo"**. `preset`/ausente/invalido = **base 2** (equilibrado; economico 1 ·
maximo 3) com **escalada automatica de ate +1 ciclo** — **mas nunca acima de 3 ciclos no total,
em nenhum preset** (no `maximo` a base ja e 3: sem escalada). Medido (caronte PRD-009-fase2,
21/08, preset maximo): 5 ciclos, 2h47, e o 4º/5º ciclo so reabriam 🟠. **Ciclo 2+ sempre em
Sonnet** (regra 2.4.0 — o Opus do ciclo 1 ja viu o desenho inteiro). Escalada: ao esgotar a base,
so escale (+1) se o ultimo ciclo trouxe **🔴 NOVO** (nao PARCIAL/REABERTO de ciclo anterior) — e
esse ciclo extra e de CONFIRMACAO (so o diff, Sonnet, teto 30 chamadas). Achado que so convergiu
(fechou parte, ficou 1-3 restantes conhecidos) NAO escala: vai ao 10.3, que desde a 3.4.15 segue
sozinho quando convergiu (item 7). Medido 02/09: os terceiros ciclos devolveram 🔴 1, 1, 0 e 3 —
nenhum mudou o veredito, cada um custou 8-12 min por gate. Estagnou (nada corrigido) → 10.3
direto, sem escalar. Numero explicito no Perfil = limite duro sem escalada; `0` = sem
limite (repete ate zerar os 🔴). Um **ciclo** = rodar o(s) gate(s) + corrigir os achados. Anuncie
ao iniciar (ex.: *"beholder e michelangelo em 2 ciclos + escalada se convergindo, em paralelo"*).

**Modelo nos ciclos 2+ (regra de refino, 2.4.0):** o modelo resolvido no Passo 1 (preset/Perfil)
vale **so para o ciclo 1** de cada gate. Nos **ciclos 2+**, beholder e michelangelo rodam **sempre
em `sonnet`** (nao passe `model` na chamada) — o ciclo N confere se os achados do ciclo N-1 foram
resolvidos, e refino sobre pontos ja mapeados, nao investigacao aberta. Opt-out consciente no
Perfil: "Modelo dos gates nos ciclos de refino: opus".

**Teto absoluto anti-degeneracao (2.3.0; valor rebaixado para 3 na 3.3.0/S5 e virado
enforcement mecanico na 3.4.3) — vale ATE com limite `0`:** ao atingir o teto absoluto
(`HARNESS_REVIEW_MAX_CICLOS` no harness.env, **default 3**) em qualquer gate, PARE e trate
como 10.3 (intervencao humana), mesmo que "falte pouco". O `guard-agent.sh` e o
`external-review.sh` NEGAM o ciclo seguinte — nao ha como "so mais um". E **anti-churn**:
se a MESMA task/secao for reescrita em **2 ciclos seguidos** e o gate seguinte apontar problema nela
de novo, o loop nao esta convergindo — e disputa de criterio entre corretor e gate, nao falta de
ciclo. Pare no ato (10.3) e leve a divergencia ao usuario. Caso real (PRD-106, 23/07/2026): 6 ciclos,
TASK-003 reescrita 4x, ~7h de criacao — o gate humano no 3º ciclo teria custado 10 min.

> **Enforcement do teto (2.10.0; knob desde a 3.4.3):** o cabecalho de todo `REVIEW-*.md`
> registra **`Ciclo: N de L (teto absoluto T)`** — L = limite efetivo do gate e T = valor de
> `HARNESS_REVIEW_MAX_CICLOS` (default 3); com Perfil `0` escreve-se
> `Ciclo: N de T (Perfil sem limite; teto absoluto)`. Se voce esta prestes a subir um gate com
> N > T, o processo ja falhou: pare e va ao 10.3 — o hook nega de qualquer forma. Caso real
> (PRD-104 do Taurus, 07/2026, era do teto 5): Perfil com `Ciclos do beholder = 0` foi lido como
> "sem teto nenhum" — beholder rodou **10 ciclos** e michelangelo 7, sendo que os ciclos 6-10
> rodaram **sem nenhum 🔴 aberto** (perseguindo 🟠/🟡 que o piso `critico` manda arquivar). Duas
> violacoes que este paragrafo torna inequivocas: o teto absoluto vale COM limite `0`, e **um
> ciclo que termina com zero 🔴 FECHA o gate naquele instante** — no piso `critico`, rodar ciclo
> novo por 🟠/🟡/🔵 e bug de processo, nao rigor.

**Piso de severidade (modo crítico).** Leia `.claude/harness.env` → `HARNESS_REVIEW_SEVERITY_FLOOR`
(ausente = `critico`; Perfil → "Codex review" → "Piso de severidade do review" sobrescreve). Ele
define **o que gera ciclo e o que bloqueia** a finalização da PRD:
- **`critico`** (default): **só 🔴 itera e bloqueia.** 🟠/🟡/🔵 (de qualquer gate) **nunca** geram ciclo
  novo nem exigem aceite — vão direto para "Observações / Melhorias Futuras" da PRD. **🟠 que é
  bug/dívida real pode virar `/dt`; 🟡/🔵 são ideia → `prds/backlog/IDEIAS.md`, nunca DT (3.2.2).**
- **`alto`**: 🔴 bloqueia/itera; 🟠 pede aceite explícito (não itera sozinho); 🟡/🔵 ao backlog.
- **`tudo`**: comportamento clássico — 🔴 e 🟠 iteram/pedem aceite (use a régua original do 10.2/10.3).

Anuncie o piso junto aos limites (ex.: *"piso crítico — só 🔴 trava; 🟠/🟡/🔵 viram observação"*).

#### 10.1 — Rodar os gates EM PARALELO (mesma mensagem)

Com os documentos prontos (Passos 6-9), inicie o **ciclo 1**. Suba os gates aplicaveis **na mesma
mensagem, com as chamadas `Agent` simultaneas** (paralelismo nativo — lentes ortogonais, ambos so
leem a PRD do disco e reportam, nao se conflitam). Anti-pattern: rodar o beholder, esperar, rodar o
michelangelo — dobra o tempo sem ganho.

**PACKET DE REVISAO (3.4.15 — item 1).** Os gates NAO leem mais a pasta inteira. Antes de cada
ciclo, monte o packet (produto + tecnica na integra, tasks por INDICE) e aponte o prompt para ele:

```bash
bash .claude/hooks/prd-packet.sh --label PRD-NNN     # => PACKET|<caminho>|<kb>|<kb da pasta>
```

O `guard-agent.sh` NEGA beholder/michelangelo de "ciclo N" sem packet. Medido: a pasta tem 300-425 KB
e cada passada custava 18-28 min; o packet fica em ~40% disso. O gate abre uma task inteira SO se um
achado exigir ver o contrato dela; o grep por tema na pasta continua valendo.

**CICLO 1 JUNTO COM OS HERMES (3.4.15 — item 2) — so no rito COMPLETO.** Quando o Passo 8 despachou
hermes Modo E, nao espere as tasks: o ciclo 1 sobe **na MESMA mensagem dos dois hermes** (packet so
com produto + tecnica; o hook escreve "tasks em redacao"). Quando os hermes voltam, a conferencia
mecanica do Passo 8 (grep) cobre id/grafo/contrato das tasks, e o **ciclo 2** recebe o packet com
o indice das tasks. Ganho medido: os 15 min do hermes deixam de ser um degrau serial antes do gate.
No **MODO LEVE** (padrao, 3.4.24) nao ha hermes: voce redigiu as tasks no Passo 8 e o ciclo 1 sobe
em seguida, ja com o indice das tasks no packet.

**ESCALADA PARA OPUS SO QUANDO O CICLO 1 REABRE O DESENHO (3.4.24 — item 13).** No preset
`equilibrado` o ciclo 1 do beholder e do michelangelo roda em `sonnet`. Achado 🔴 **estrutural** e
o que muda escopo, divisao de tasks, schema ou integracao (texto ambiguo, criterio fraco e nit
nao contam). Ciclo 1 com **≥ 3 🔴 estruturais** (`HARNESS_GATE_ESTRUTURAIS_OPUS`, 3) em um gate = o
desenho reabriu: o **ciclo 2 DESSE gate roda em `opus`, uma vez** (`model: "opus"` na chamada;
ciclos 3+ voltam a `sonnet`). Abaixo disso, `sonnet` em todos os ciclos. `maximo` mantem `opus` no
ciclo 1; override explicito no Perfil (`Modelo do beholder: opus`) vence o preset. Medido ate 04/09:
equipe em Sonnet fecha a fase 2 em 28-63 min; Charles com Opus no c1 em 86-201; achados por ciclo
9,1,2 / 7,1,1 — o c1 acha, os demais confirmam. Registre `--models="beholder sonnet→opus c2"` no
stop quando escalar; `min_gates` e `achados_por_ciclo` medem o efeito.

**SNAPSHOT + DIFF por ciclo (3.4.9 — melhoria #5, dieta dos gates no refino).** Antes de subir
o **ciclo 1**, fotografe os documentos; antes de cada ciclo N ≥ 2, gere o diff do que as
correcoes REALMENTE mudaram:

```bash
# fotografe SO os documentos julgaveis (REVIEW-*.md mudam por ciclo e poluiriam o delta) —
# uma vez antes do ciclo 1 e de novo APOS cada rodada de correcao:
SNAP=.claude/.harness-run/gate-snapshots/PRD-NNN
mkdir -p "$SNAP/c<N>/tasks"
cp prds/PRD-NNN-*/PRD-*.md prds/PRD-NNN-*/PROMPT-EXECUCAO.md "$SNAP/c<N>/" 2>/dev/null
cp prds/PRD-NNN-*/tasks/*.md "$SNAP/c<N>/tasks/"
# delta que o gate do ciclo N+1 recebe (exit 1 = ha diferenca, e o esperado):
git diff --no-index "$SNAP/c<N-1>" "$SNAP/c<N>" > "$SNAP/delta-c<N>.diff"
```

No prompt do beholder/michelangelo do ciclo 2+, acrescente: *"O QUE MUDOU desde o seu ultimo
ciclo esta em `<delta-cN.diff>` — a tabela de verificacao parte DELE; o grep por tema continua
valendo em todos os documentos (barato), mas leitura INTEGRAL so dos arquivos que o diff toca.
Diff vazio para um achado PARCIAL/REABERTO = a correcao nao aconteceu: reabra sem cacar."*
(O `git diff --no-index` sai com exit 1 quando ha diferenca — e o esperado, nao e erro.)

**CICLO DE CONFIRMACAO (3.4.11).** Quando o ciclo anterior fechou com **<= 2 🔴** e todos foram
corrigidos com declaracao achado-a-achado, o ciclo seguinte e de CONFIRMACAO, nao de caca —
prompt curto, sempre `sonnet`: *"Confirme SO a tabela de verificacao dos 🔴 anteriores a partir
de `<delta-cN.diff>` e da declaracao achado-a-achado; achado NOVO so se o proprio diff o criou
(iatrogenico); teto de 30 chamadas de ferramenta; leitura integral de NENHUM documento; sem Bash
exploratorio."* Medido 01/09: o 3º ciclo devolveu zero 🔴 em 3 de 3 PRDs e custou 5-10 min e
16-36k tokens por gate relendo a pasta inteira (335-425 KB).

**beholder** (subagente, contexto limpo). **Modelo (3.4.15; escalada 3.4.24):** o resolvido no Passo 1 —
`economico` = **sonnet em todos os ciclos**; `equilibrado` = **sonnet no ciclo 1**, `opus` **so no
ciclo 2 e so se o ciclo 1 reabriu o desenho** (≥ 3 🔴 estruturais — regra acima; medido 01-02/09: o
c1 em Opus levou 18-28 min e o Sonnet 10-17 fazendo a mesma tabela; a telemetria `achados_por_ciclo`
valida o experimento); `maximo` ou override explicito no Perfil = `opus` **so no ciclo 1** (ciclos
2+ sempre sonnet):

```
subagent_type: "beholder"
description: "Red-team da PRD-<NNN> (ciclo <N>)"
prompt: """
Revise adversarialmente a PRD-<NNN> recem-criada em prds/PRD-<NNN>-<nome-curto>/.
SEU CONTEXTO COMPLETO esta em <caminho do prd-packet> (produto + tecnica na integra + indice das
tasks) — leia-o em vez da pasta; abra uma task inteira em tasks/ SO se um achado exigir o contrato dela.
Este e o CICLO <N> de <limite efetivo> (teto absoluto = HARNESS_REVIEW_MAX_CICLOS, default 3) do red-team desta PRD.
<se N > 1:> O relatorio do ciclo anterior esta em
prds/PRD-<NNN>-<nome-curto>/REVIEW-beholder.md — comece por uma TABELA DE VERIFICACAO
achado a achado dos 🔴 anteriores, conferindo cada correcao POR TEMA: grep pelo conceito
(termo da regra, campo, valor) em TODOS os documentos da PRD, nao so nos que a sessao
declarou ter tocado. Classifique cada um: FECHADO (entrou em todas as camadas — prosa
produto, tecnica, criterio de aceite, cenario E2E, task) / PARCIAL (liste ONDE falta,
com ancora) / REABERTO. PARCIAL e REABERTO mantem o NUMERO original do achado — nao sao
achados novos. So DEPOIS da tabela procure problemas NOVOS, com prioridade para efeito
colateral das proprias correcoes (achado iatrogenico); leitura profunda apenas nos
documentos alterados. Nao reabra achado ja resolvido; nao infle o relatorio com nits.
Leia o .claude/PERFIL-RESUMO.md (fallback: PERFIL-PROJETO.md) e o packet.
No CICLO 1 o packet pode nao ter tasks ainda ("tasks em redacao"): julgue produto + tecnica; as
tasks entram no ciclo 2 pelo indice. Nao releia os templates (o hermes ja os seguiu).
Ataque pelas 13 lentes e devolva o
relatorio com veredito (Pronta / Executavel com ressalvas / Nao executar), placar por
severidade e Top 3 acoes. Zero 🔴 = gate FECHADO (diga isso no veredito; 🟠/🟡/🔵 nao
seguram o gate no piso critico). Nao corrija a PRD — apenas exponha. Salve o relatorio
tambem em prds/PRD-<NNN>-<nome-curto>/REVIEW-beholder.md (sobrescreva; registre no topo
"Ciclo: <N> de <limite efetivo> (teto absoluto = HARNESS_REVIEW_MAX_CICLOS, default 3)" e mantenha a tabela de verificacao).
"""
```

**michelangelo** (so se 10.0 acusou UI; subagente, contexto limpo, MODO C — revisao de proposta).
**Modelo (3.4.15; escalada 3.4.24):** mesma regra do beholder — `economico` sonnet em todos os ciclos;
`equilibrado` sonnet no ciclo 1 e `opus` uma vez no ciclo 2 so se o ciclo 1 reabriu o desenho
(≥ 3 🔴 estruturais); `opus` no ciclo 1 so no `maximo` ou por override do Perfil. **Com maquete APROVADA pelo usuario no 6.1.1 (item 10):** o
ciclo 1 vira CHECKLIST (estados com dados/vazio/carregando/erro, WCAG/contraste, responsividade,
microcopy) sobre a secao de front — o partido ja foi escolhido por um humano, nao se reabre —
com teto de 30 chamadas; zero 🔴 = gate fechado sem ciclos seguintes:

```
subagent_type: "michelangelo"
description: "Gate de UX da PRD-<NNN> (ciclo <N>)"
prompt: """
Revise a UX do design PROPOSTO na PRD-<NNN> em prds/PRD-<NNN>-<nome-curto>/ (MODO C — revisao de
proposta; a tela ainda nao existe, critique o papel). Este e o CICLO <N> de <limite efetivo>
(teto absoluto = HARNESS_REVIEW_MAX_CICLOS, default 3) do gate de UX desta PRD.
<se N > 1:> O relatorio do ciclo anterior esta em
prds/PRD-<NNN>-<nome-curto>/REVIEW-michelangelo.md — comece por uma TABELA DE VERIFICACAO achado
a achado dos 🔴 anteriores, conferindo cada correcao POR TEMA em todos os documentos de front da
PRD (secao "Frontend / Interface", tasks de UI, criterios de aceite, cenarios): FECHADO / PARCIAL
(onde falta, com ancora) / REABERTO — PARCIAL e REABERTO mantem o numero original, nao sao achados
novos. So depois procure problemas NOVOS, com prioridade para efeito colateral das correcoes
(ex. real: correcao que "resolveu" declarando config que produz exatamente o defeito vizinho).
Nao reabra o resolvido. Zero 🔴 = gate FECHADO (🟠/🟡/🔵 nao seguram o gate no piso critico).
Leia o .claude/PERFIL-RESUMO.md (fallback: PERFIL-PROJETO.md), a doc raiz de convencoes e, no
packet <caminho do prd-packet>, a secao "Frontend / Interface" da tecnica e o indice das tasks de UI
— abra a task inteira SO se um achado exigir; em ciclo 2+, SO o que o diff toca + o relatorio
anterior. <se ha MOCKUP aprovado:> O partido foi aprovado pelo usuario: rode como CHECKLIST (estados,
WCAG, responsividade, microcopy), teto de 30 chamadas, sem reabrir o partido. Critique pelas
10 lentes de UX (hierarquia, carga cognitiva, estados, WCAG, prevencao de erro, consistencia,
responsividade, affordancia, arquitetura de informacao, microcopy) — SEM duplicar o beholder
(ortografia/markup sao dele). Devolva o relatorio com veredito (Excelente / Bom com ajustes /
Precisa repensar), placar por severidade e Top 3 melhorias. Nao corrija a PRD — apenas exponha.
Salve o relatorio em prds/PRD-<NNN>-<nome-curto>/REVIEW-michelangelo.md (sobrescreva; registre o
ciclo no topo).
"""
```

#### 10.1b — Gate por rota EXTERNA (3.0.0)

> Aplica-se **so ao beholder** quando o mapa do Passo 1 o roteou para um CLI externo (modo
> `economia`). O **michelangelo NUNCA e delegado**: a base de design que ele usa (`ui-ux-pro-max`)
> e deliberadamente excluida dos adapters Codex pelo `gen-adapters.sh` — delegar o gate de UX o
> degradaria em silencio, e gate degradado em silencio e o defeito que o harness mais persegue.

Tres diferencas em relacao ao gate nativo, e **so** tres:

1. **Quem grava o relatorio e VOCE.** O prompt nativo manda o beholder salvar o
   `REVIEW-beholder.md`; um executor read-only **nao pode escrever**. Entao: monte o envelope
   pedindo o mesmo relatorio *como resposta*, e ao receber o `--output` do broker, **copie o
   conteudo** para `prds/PRD-NNN-<slug>/REVIEW-beholder.md` (com o cabecalho de ciclo de sempre:
   `Ciclo: N de L (teto absoluto = HARNESS_REVIEW_MAX_CICLOS, default 3)`). Sem isso o ciclo seguinte nao tem tabela de verificacao.
2. **A cegueira e a mesma, e agora e mecanica.** O preambulo do broker ja proibe ler relatorios
   de outros agentes da rodada; some a isso nao citar no envelope nada do que o michelangelo
   achou. Os dois gates continuam correndo **em paralelo, sem se ver** — e como sao processos
   distintos, a cegueira deixa de depender de disciplina de prompt.
3. **Ciclo 2+ precisa do relatorio anterior.** Aponte no envelope o caminho do
   `REVIEW-beholder.md` que voce mesmo gravou no ciclo anterior — ler o **proprio** relatorio e
   obrigatorio (e a tabela de verificacao); ler o do **outro gate** e que e proibido.

```bash
bash .claude/hooks/harness-delegate.sh \
  --executor codex-cli --role beholder --task beholder --label PRD-NNN --ciclo <N> \
  --prompt-file .claude/.harness-run/delegations/PRD-NNN/beholder-c<N>-input.md \
  --mode read-only --reasoning high --max-words 800
```

`--reasoning high` no gate e deliberado: red-team e o papel onde esforco extra se paga em bug
achado. Os ciclos 2+ seguem a regra de refino (menos esforco: `medium`), simetrica ao "ciclos 2+
sempre em sonnet" dos gates nativos.

Falhou (exit != 0)? **O gate NAO pode simplesmente sumir.** Aplique o fallback do mapa; se for
`perguntar`, pare e pergunte. Um beholder que nao rodou e uma PRD sem red-team — isso vai
declarado no Passo 11, nunca omitido.

#### 10.2 — Apos CADA ciclo

Apresente ao usuario, por gate que rodou: **ciclo atual (N/limite) + veredito + placar** (🔴/🟠/🟡/🔵)
e o Top 3 de acoes — **modulado pela verbosidade** (Passo 1):

| Verbosidade | Por ciclo |
|---|---|
| `normal` | ciclo + veredito + placar + Top 3, a cada ciclo |
| `conciso` | **1 linha por gate**: `beholder c2/3 ▸ 0🔴 1🟠 · fechado` |
| `minimo` | **nada por ciclo** — so o consolidado no Passo 11 |

> Em `minimo` o silencio vale **enquanto os gates convergem**. Rompa-o na hora se: aparecer 🔴 que
> exija decisao sua, o gate estagnar (10.3), o teto absoluto de ciclos
> (`HARNESS_REVIEW_MAX_CICLOS`, default 3) for atingido, ou um gate
> externo falhar. Convergindo = silencio; travando = fala. O placar completo de todos os ciclos
> vai para o `REVIEW-*.md` em qualquer nivel — nada se perde, so nao ecoa na tela.

> **Correcao de documento apos o gate (3.5.6/E3).** O lugar em que a sessao mais erra o `Edit` e a
> PRD-TECNICA/tasks depois de um ciclo: texto com acento, crase, tabela markdown e trecho longo — medido
> 16/09 (140-b): 4 turnos perdidos entre `NAO ENCONTRADO` de script proprio, Python via stdin com caminho
> Windows e `Edit` "String to replace not found". Regra: `Read` do trecho exato (offset/limit) ANTES de
> cada `Edit`, `old_string` curto (2-4 linhas unicas), nunca script de replace proprio; correcao que toca
> 3+ documentos vai ao hermes por documento (Modo C, 3.4.11), nao a mao.

Entao:

> A régua abaixo depende do **piso de severidade** lido no início do Passo 10. O que muda entre os
> modos é **só o tratamento dos 🟠**: em `critico` eles **não** geram ciclo nem aceite; em `alto`/`tudo`
> seguem como descrito. Os 🔴 e os 🟡/🔵 se comportam igual em qualquer piso.

- **Todos os gates com zero 🔴** (em `critico`/`alto`) **ou** zero 🔴 e 🟠 resolvidos/aceitos (em
  `tudo`): gates concluidos — siga ao Passo 11.
- **Restam 🔴 (de qualquer gate) — corrija POR GATE, com PATCH PRONTO (3.4.11):**
  1. **Nao espere o gate mais lento.** O michelangelo devolve 6-8 min antes do beholder (6 de 6
     ciclos medidos em 01/09): assim que UM gate volta, a triagem e a correcao DELE partem na
     hora — UX → `dedalo` Modo R (texto) + gravacao na secao "Frontend / Interface" e nas tasks
     `front`; beholder → PRD de produto, tecnica (fora do front) e tasks `backend`. Os dois lotes
     tocam arquivos DISJUNTOS e rodam ao mesmo tempo; achado do beholder que cai na secao de
     front vai para o lote de UX.
  2. **Na triagem, escreva o PATCH PRONTO** de cada 🔴: `documento:secao → texto novo` (voce ja
     sabe a correcao ao triar — nao mande o texto cru do gate para alguem reinterpretar).
  3. **Quem aplica se decide pelo numero de DOCUMENTOS tocados, nao pelo modo (3.4.22, itens 12/14).**
     Agrupe os patches prontos por documento. **Ate 3 documentos: aplique VOCE**, com script em lote
     (python/sed, uma passada por documento — 3-5 min medidos na 3.4.8 e no ciclo 2 do Caronte), e
     faca o snapshot. **4 ou mais documentos: um `hermes` (Modo C) POR DOCUMENTO, todos na MESMA
     mensagem** — cada um recebe o glossario, o `delta-cN.diff` do snapshot (10.1) e SO os patches
     do seu documento; grava com um Read e um Write e devolve a declaracao achado-a-achado de ONDE
     tocou; voce reconcilia e CONFERE (grep tematico de 1 achado por amostragem). Medido 03/09
     (PRD-012-b): um hermes C sozinho = 19 min e 239 turnos com tudo parado — o maior bloco serial
     da fase 2; N em paralelo custam o tempo do maior documento. **Nao escreva teto nem contagem no
     prompt**: o hook `guard-folego` nega o hermes acima de `HARNESS_FOLEGO_hermes` (120) e ele
     devolve PARCIAL-TEMPO — ai voce despacha o restante daquele documento em outro hermes. Correcao
     que exigir DECISAO de produto volta para voce — o hermes nao decide, so materializa.
     Bloqueador NAO vai para o `/prd-exec`.
  4. **Cada 🔴 de REGRA corrigido vira INVARIANTE VERIFICAVEL na task que o implementa (3.4.18).**
     No mesmo patch pronto, acrescente a secao **"Invariantes do gate"** da task implementadora
     (TEMPLATE-TASK): a regra em 1 linha + a **prova executavel** (spec, comando ou consulta com os
     numeros esperados — ex.: *"bruto 1.000,00 · taxa 5% → despesa 50,00 e o ledger fecha em
     1.000,00"*) + origem (`beholder c1/B7`). O hefesto/dedalo **roda a prova antes de devolver**
     (Status PARCIAL sem ela) e o sherlock **comeca por ela** no ciclo 1 da exec. Achado de texto,
     nomenclatura ou UX nao vira invariante — so regra de negocio/seguranca/dinheiro. Medido 02/09
     (PRD-135): overpayment e taxa da financeira, 🔴 na criacao (4 ciclos), voltaram como bugs de
     codigo no ciclo 1 da exec — 8 bloqueantes e 50 min de correcao que a prova teria evitado.
  > Medido 01/09: hermes Modo C com o texto cru do gate = 27-47 min e 226-398 turnos por ciclo;
  > a pai com script = 3-5 min. A propagacao em 5 camadas (abaixo) continua obrigatoria nos dois
  > caminhos.
  > **Propagacao em TODAS as camadas (2.10.0) — a causa nº 1 de loop de gate.** Cada regra da PRD
  > vive em ate 5 camadas: prosa da PRD de produto, fence/secao da Tecnica, criterio de aceite,
  > cenario E2E e texto da(s) task(s). Correcao aplicada em 3 das 4 camadas **volta como o MESMO 🔴
  > no proximo ciclo, para sempre** (medido no Taurus, PRD-104→110: 6 PRDs seguidas em 8-11 ciclos,
  > maioria dos 🔴 tardios era correcao nao-espelhada; na PRD-109, 4 dos 5 ciclos tiveram como
  > defeito dominante "a regra nova convive com a antiga em outro arquivo"). Ao corrigir cada 🔴:
  > **(1)** grep TEMATICO pelo conceito (termo da regra, nome do campo, valor) em TODOS os
  > documentos da pasta da PRD — nao so nos que o gate citou; **(2)** aplique em toda ocorrencia,
  > removendo a versao antiga da regra (conviver = reabrir); **(3)** confira se o fix nao criou
  > efeito colateral no vizinho (achado iatrogenico: o fix do ciclo N e o 🔴 do N+1 — cadeia real de
  > 4 ciclos na PRD-106); **(4)** declare no fim do ciclo, achado a achado, ONDE tocou
  > (documento:secao). Essa declaracao e o que o gate seguinte verifica primeiro.
  > **Achado de UX volta para o AUTOR do design (2.9.0).** Os 🔴 do michelangelo sao corrigidos pelo
  > **dedalo em Modo R**, nao por esta sessao — quem desenhou tem o contexto do partido, dos tokens
  > e do precedente, e por isso corrige sem desmanchar o sistema. Dispare-o com o `REVIEW-michelangelo.md`
  > e a lista de achados a atacar; ciclos 2+ sempre em `sonnet` (mesma regra de refino dos gates).
  > Ele devolve o texto corrigido; quem grava a secao de front e o hermes (Modo C), no mesmo
  > lote das demais correcoes. Achados do beholder que caem sobre a secao de front tambem podem
  > ir para o dedalo — os de texto/spec vao ao hermes. Correcao que exigir decisao de produto:
  > apresente e aguarde o usuario. Corrigiu?
  **Reconfira o tamanho DEPOIS de corrigir (3.4.20):** todo lote de correcao infla (PRD-012-b:
  216 → 224 linhas/task apos o Modo C). Antes de re-rodar o gate: `task-packet.sh --check` em todas
  as tasks + `task-matrix.sh` — GRANDE ou HUB novo = fatiar/replanejar neste ciclo, nao no proximo.
  **Re-rode no proximo ciclo apenas o(s) gate(s) que ainda tinha 🔴 e ainda tem ciclo dentro do seu
  limite** (em paralelo, se forem os dois) — um gate que ja zerou os 🔴 sai dos ciclos seguintes (nao
  desperdice tokens re-rodando o que convergiu). Esgotou o limite de um gate com 🔴 restantes? va ao 10.3.
- **🟠 Altos:**
  - **piso `critico`** (default): **não geram ciclo nem aceite** — registre-os direto em "Observacoes
    / Melhorias Futuras" da PRD (ou `/dt`) e siga. (Promova a 🔴 só se for risco real disfarçado.)
  - **piso `alto`/`tudo`:** corrija na PRD **ou** apresente para aceite explícito do usuario; se
    corrigir, re-rode no proximo ciclo como os 🔴. 🟠 nao aceito ao esgotar o limite → 10.3.
- **🟡 Medios / 🔵 Nits:** corrija os triviais; registre os demais em "Observacoes / Melhorias
  Futuras" da PRD (ou via `/dt`). Nits sozinhos NAO justificam gastar um ciclo novo.

#### 10.3 — Esgotou os ciclos de algum gate sem zerar os 🔴 — intervencao humana OBRIGATORIA

> **3.4.15 (item 7) — segue sozinho quando CONVERGIU.** Se os 🔴 do gate CAIRAM a cada ciclo (ex.:
> 7 → 5 → 3), restam **ate 3**, e todos os restantes estao classificados (o que e, por que ficou),
> **NAO pergunte**: registre-os na PRD em "Riscos aceitos — pendentes de ratificacao" (1 linha
> cada), anuncie em 1 linha e siga ao Passo 11 — o aceite e onde o usuario ratifica ou manda
> reabrir. Pergunte (o fluxo abaixo) so se NAO convergiu (mesmo numero ou mais 🔴 que o ciclo
> anterior) ou se restam mais de 3. Medido 02/09 (PRD-135): 50 min parados esperando a resposta
> "seguir", que era a unica razoavel.

Limite (do beholder e/ou do michelangelo) atingido e ainda restam 🔴 (ou, **só nos pisos `alto`/
`tudo`**, 🟠 nao aceitos)? **PARE: nao corrija mais, nao re-rode os gates e NAO finalize a PRD por
conta propria.** (No piso `critico` os 🟠 nunca chegam aqui — já viraram observação no 10.2; este
gate dispara só por 🔴 restante.) Apresente ao usuario:

1. O placar do ultimo ciclo de cada gate + os achados restantes (1 linha cada: o que e + por que nao
   foi resolvido — diga se e de correcao (beholder) ou de UX (michelangelo));
2. O historico dos ciclos (ciclo N: placar → o que foi corrigido);
3. As duas opcoes — e **aguarde a decisao do usuario**:
   - **SEGUIR mesmo assim** — os achados restantes ficam explicitamente ACEITOS pelo usuario:
     registre-os na PRD de produto em **"Riscos aceitos no red-team"** (achado + severidade + gate +
     "aceito pelo usuario ao esgotar os ciclos"), marque o veredito final como `⚠️ Executavel com
     ressalvas (ciclos esgotados)` e siga ao Passo 11.
   - **ABORTAR a PRD** — nao finalize: marque a linha dela no `prds/INDEX.md` como `⛔ Nao executavel
     — gates nao convergiram`, preserve os `REVIEW-beholder.md`/`REVIEW-michelangelo.md` do ultimo
     ciclo e devolva ao usuario o resumo do que precisaria mudar (em geral, o escopo) para a PRD
     voltar.

> **Auto-checagem (gate):** o beholder foi chamado? O michelangelo foi chamado **quando ha UI**
> (10.0)? E o **dedalo** projetou o front (Passo 7.1) nessa mesma condicao — ou a secao "Frontend /
> Interface" nasceu desta sessao, que e exatamente o que a 2.9.0 veio corrigir? Os limites de ciclos
> do Perfil foram respeitados? Os 🔴/🟠 (de correcao E de UX) foram
> resolvidos — ou a decisao de seguir/abortar foi **do usuario** (nunca sua)? Se "nao" para qualquer
> um — **nao finalize a PRD**.

---

#### 10.9 — Leitura de validação (VALIDACAO.md) — OBRIGATÓRIA (3.4.30)

Antes do aceite, escreva `prds/PRD-NNN-<slug>/VALIDACAO.md` a partir de
`prds/_templates/TEMPLATE-VALIDACAO.md`. É a leitura de **5 minutos** que o Charles e a equipe usam
para validar a PRD ANTES de executar — sem abrir produto/técnica/tasks (300 KB+). Motivo (09/09,
PRD-140): o que faltou ou o que o modelo inventou só aparecia DEPOIS, na exec. Seis seções, nesta ordem:

1. **O pedido, como entrou** — origem (IDEIA/pedido/DT), o escopo pedido em itens **copiado** (não
   reescrito) e as decisões da entrevista (0.1).
2. **O fluxo, como ficou** — 5 a 12 passos na voz do usuário do sistema, tela/endpoint entre crases,
   variante da maquete se houve.
3. **Requisitos funcionais — de onde veio cada um** — tabela `RF | em uma linha | Origem | Tasks`.
   Origem ∈ `pedido` · `entrevista` · `inovacao` · `DT-NNN` · `gate` · `projeto` · `impacto`. **Toda RF da
   PRD de produto entra; toda linha tem origem** — RF sem origem é invenção: apague da PRD ou justifique.
4. **Agregado no caminho** — o que NÃO estava no pedido: inovações aceitas, DTs absorvidos, achados de
   gate que viraram requisito, decisões travadas que ampliaram. Com o custo (tasks).
5. **Fora / adiado** — fatias (`PRD-NNN-b`), backlog de inovação, DTs de continuidade, fora de escopo.
6. **Confira antes de aprovar** — 3 a 7 perguntas objetivas sobre decisões tomadas por default.

Depois rode a conferência mecânica e cole a linha no resumo do Passo 11:

```bash
bash .claude/hooks/prd-validacao-check.sh --label PRD-NNN
# VALIDACAO|PRD-NNN|ok|rf=8/8|tasks=9/9|dts=2/2|fatias=1/1   (exit 0)
# VALIDACAO|PRD-NNN|falta|RF-07 sem linha na secao 3; TASK-009 nao aparece ...   -> corrija e rode de novo
```

Ela prova cobertura (toda RF, toda task, todo DT citado, toda fatia); o julgamento (o pedido entrou
inteiro? o agregado faz sentido?) é do humano — por isso o aceite do Passo 11 é feito **sobre este
arquivo**. O `harness-metrics.sh stop PRD-NNN-fase2` também confere e grita se faltar.

### Passo 11 — Resumo final + ACEITE (fim da Fase 2)

**No modo TURBO, este e o UNICO aceite humano do fluxo:** apresente o pacote completo (resumo
da PRD de produto + tecnica + tasks + veredito dos gates) e peca o aceite — *"leia o
`VALIDACAO.md` (5 min: pedido como entrou, fluxo como ficou, RF -> origem -> tasks, agregado, fora) e
diz: aprovada p/ `/prd-exec`, ou o que ajustar"*. O aceite e SOBRE o VALIDACAO.md (3.4.30) — nao
peca para ler a PRD inteira; cole a linha `VALIDACAO|PRD-NNN|ok|...` do check no resumo. Ajuste pedido: corrija os documentos afetados (os
gates ja convergiram — correcao pontual nao re-roda ciclo, salvo mudanca de escopo). No modo
CLASSICO o produto ja foi aceito no 6.2 — aqui e so o resumo informativo de sempre.

**No modo TURBO NOTURNO (3.4.7 — decisao da entrevista 0.1):** consulte o veredito dos gates.
- Beholder sem 🔴 (e michelangelo sem 🔴, quando rodou): apresente o MESMO resumo completo,
  registre o status **`PRE-ACEITA (envelope noturno)`** no `prds/INDEX.md` (em vez de
  `Rascunho`), anote na propria PRD tecnica ("Aceite: pre-assinado na entrevista de <data>,
  condicionado a gates limpos — revisao humana retroativa pendente") e **encerre sem
  aguardar**. A `/prd-exec` aceita PRD `PRE-ACEITA` sem novo aceite; a revisao do usuario e
  retroativa (qualquer ajuste vira correcao pontual ou DT).
- **Qualquer 🔴 sobrevivente:** o envelope NAO cobre — status `Aguardando aceite`, apresente
  o resumo com os 🔴 no topo e encerre a sessao normalmente (o usuario decide de manha).
  Bloqueante nunca e pre-aceito; o envelope compra velocidade, nunca rede de seguranca.

Atualize o status da PRD-NNN no `prds/INDEX.md` para `Rascunho` (pronta para `/prd-exec`). O
`_discovery.md` ja cumpriu o papel — pode deixa-lo na pasta (rastreabilidade) ou remove-lo; o que
tira a PRD do estado "pendente" do Passo 0.0 e a existencia da PRD tecnica.

**Feche a telemetria da Fase 2** (uma vez) com os contadores reais e cole o bloco "## Telemetria":

```bash
bash .claude/hooks/harness-metrics.sh stop PRD-NNN-fase2 \
  --modo=<leve|completo — rito do Passo 1.5 (3.4.24)> \
  --tasks=<N> --ciclos=<MAIOR ciclo entre os gates (o gargalo), NAO a soma> \
  --achados=<🔴 por ciclo do gate gargalo, ex. 4,1,0 — 3.4.11> \
  --subagents=<beholder + michelangelo se rodou + dedalo (1 do Passo 7.1 + 1 por ciclo de correcao)> \
  --preset=<preset> --models="beholder/michelangelo/dedalo <modelo>" \
  --extra="gates: beholder c<N>, michelangelo c<M>; delegacao: <modo>, <N> externas (<executor>), <M> nativas, <F> fallback(s)"
```

> **Telemetria no git (3.4.22, item 16):** o `stop` deixa STAGED `prds/_metrics/runs/<dev>@<host>.jsonl`
> e `prds/_metrics/tasks/<dev>@<host>.jsonl` — entram no commit da PRD; nunca `git add prds/_metrics/` inteiro.

> **Contagem de subagentes com delegacao (3.0.0):** `--subagents=` conta **todos** os papeis que
> rodaram, nativos **e** externos — e a medida de trabalho despachado, nao de custo na sua conta.
> O split por executor vai no `--extra=`, e o detalhe granular (duracao, tokens reais, exit code,
> fallback) ja esta em `.claude/.harness-run/delegations/PRD-NNN/manifest.jsonl`, que o
> `/harness-report` consolida. **Nao some tokens de Codex com tokens de Claude num numero so:**
> sao contas, quotas e precos diferentes — a telemetria os mantem separados de proposito.

> **Unidade do campo `ciclos` (2.10.0):** grave o **maior** ciclo entre os gates — e o numero
> comparavel com a regua "base do preset +1", que e POR GATE. Linhas antigas somavam os dois
> gates (beholder 3 + michelangelo 5 saia como "8") e disparavam alerta falso no
> `/harness-report`. O detalhe por gate vai no `--extra=`.

> **Telemetria honesta:** se o bloco imprimir o aviso ⚠️ de **provavel espera humana** (out_tps
> baixo e/ou espera medida — ex.: a Fase 2 atravessou o aceite/pausa do usuario), repasse o aviso
> no output e NAO tire conclusao de performance/preset dessa duracao. Roteiro:
> `.claude/PLAYBOOK-TELEMETRIA.md`.

```
## PRD-[NNN] criada (Fase 2 concluida)
**Titulo:** [titulo]
**Diretorio:** prds/PRD-[NNN]-[nome-curto]/
**Arquivos:** PRD de produto, PRD tecnica, PROMPT-EXECUCAO, tasks/ (N tasks)
**Fases:** [resumo]
**Tasks:** [lista numerada com titulo e dependencias]
**Red-team (beholder):** [veredito + placar + ciclos — ex: ⚠️ Executavel com ressalvas · 0🔴 2🟠 3🟡 · ciclo 2/4]
**Gate de UX (michelangelo):** [so quando ha UI — veredito + placar + ciclos — ex: ✅ Excelente · 0🔴 1🟠 2🟡 · ciclo 2/4 | "n/a — PRD sem interface"]
**Front (dedalo):** [so quando ha UI — ancoragem + sistema — ex: herdado de views/clientes/index.php · 4 componentes reusados, 1 novo · design-system/MASTER.md criado | "n/a — PRD sem interface"]
**Maquete (ariadne):** [so se rodou — variante aprovada + caminho | "nao rodou"]
**Validacao (3.4.30):** prds/PRD-[NNN]-[nome]/VALIDACAO.md · [linha do check — ex: VALIDACAO|PRD-140|ok|rf=8/8|tasks=9/9|dts=2/2|fatias=1/1] — LEIA ESTE antes de aprovar
**Onde rodou (3.0.0):** [modo + split + fallbacks — ex: `economia` · 5 papeis no codex-cli, 3 nativos · 1 fallback (impacto: timeout → native) | "tudo nativo (modo off)"]

**Telemetria (Fase 2):** [duracao + tokens — bloco do harness-metrics; comparativo em prds/_metrics/]

Para executar: `/prd-exec PRD-[NNN]`
```

> **Fim da `/prd` = PARE (3.5.5, B3).** A criacao termina no aceite; NUNCA emende `/prd-exec` na mesma sessao por conta
> propria. Se o usuario mandar executar aqui mesmo, avise UMA vez: *"a fase executar pede `medium` (esta sessao esta em
> <atual>) — responda `/effort medium` + 'ok', ou abra outra sessao"* — o `esforco.sh executar` vai acusar `AJUSTAR` e o
> `guard-agent` exige `esforco.env` desta decolagem. Medido 14/09 (PRD-143-b): a exec emendada rodou a orquestradora em
> `xhigh` a exec inteira.

## Restricoes CRITICAS

### Ambiente
- Tudo vem do Perfil (`.claude/PERFIL-PROJETO.md`): CLI, banco de teste, baseURL,
  timezone, compatibilidade de producao. **Nunca assumir** `php`/`node`/`mysql` no PATH —
  usar os caminhos absolutos do Perfil.

### Regras de negocio criticas (principios — incarnacao especifica no Perfil → Armadilhas)
- **Datas de negocio:** geradas na origem (frontend/serviço), NUNCA pelo relogio do
  servidor/banco (timezone diverge).
- **Envios assincronos reprocessados por worker externo:** marcar como "enviado" na
  criacao, mesmo em erro, para evitar duplicatas.
- **Autenticacao:** validar token/sessao na PRIMEIRA linha do endpoint.
- **Soft delete** quando o projeto usa (ver Perfil): nunca `DELETE` fisico.
- **Cliente HTTP/conexao:** instancia nova por chamada quando o padrao do projeto exigir.

### Qualidade
- Codigo nos documentos: SO nos componentes de risco (ver Passo 7); onde existir, COMPLETO e
  FUNCIONAL, nunca pseudocodigo. O rotineiro e especificado por contrato (Passo 8) — codigo
  duplicado entre tecnica e task e defeito, nao capricho.
- Referenciar arquivos existentes com caminhos reais verificados via Glob/Grep.
- Nao inventar funcoes/classes — verificar antes.
- Toda PRD com impacto visual/funcional gera testes E2E (ou roteiro manual) cobrindo
  happy path + erros.
