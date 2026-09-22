---
name: dt-exec
description: "Agrupa DTs pequenos ja registrados em LOTES coesos e executa de ponta a ponta — mini-spec, safe-mode, executores em grupos disjuntos (hefesto no backend, dedalo no front), review dupla-cega, gate de UX quando toca tela, mensagens de commit e fechamento dos DTs no INDEX. Aceita migration ADITIVA e roda varios lotes em FILA numa decolagem so. Use quando houver debitos tecnicos pequenos acumulados que nao justificam uma PRD propria cada um, ou para dar vazao a um backlog de DTs."
---

# Executar lote de DTs (mini-PRD)

Resolve **varios DTs pequenos de uma vez**, com a cerimonia proporcional ao tamanho. E o degrau
que faltava entre a `/dt` (registra e para) e a `/prd` (discovery paralelo, duas fases, PRD
produto + tecnica + tasks + gates em ciclos). Stack-agnostica: todos os caminhos, comandos e
regras especificas vem do **Perfil do Projeto** (`.claude/PERFIL-PROJETO.md`).

> **O que ela NAO e.** Nao e uma PRD barata nem um atalho para pular cerimonia. O que a torna
> segura nao e o que ela corta — e o que ela **se recusa a engolir** (Passo 1.2). Item que
> toca integracao com efeito colateral, muda contrato de API, tem decisao de design em aberto
> ou exige **migration destrutiva/com backfill** sai do lote e vira PRD. O documento do lote
> registra o que ficou de fora e por que.

> **Vazao (2.13.0) — tres alavancas, nenhuma delas afrouxa a rede de seguranca.**
> (1) **Fila multi-lote** (`--fila`): a decolagem (entrevista, sync, safe-mode) e paga **uma
> vez** e vale para N lotes — o overhead fixo era o maior custo por DT (medido no LOTE-002:
> ~25 min de implementacao contra ~2h de gates). (2) **Grupos disjuntos** no Passo 3.2: o
> default deixou de ser sequencial. (3) **Migration ADITIVA e reversivel** deixou de ser
> criterio de ejecao absoluto (1.2). Continuam obrigatorios **por lote**: safe-mode, review
> dupla-cega, verificacao por item e o gate documental 7.7.

> **Multi-AI (2.0.0).** Roda em Claude Code e em Codex. No Codex, leia `.claude/PLATAFORMAS.md`
> antes: a ferramenta Agent vira subagente nativo (§3) e `AskUserQuestion` vira pergunta textual
> simples. O restante do fluxo e identico nos dois hosts.

> **Modelo da sessao.** Lote e execucao mecanica sobre spec curta — roda barato em **Sonnet**,
> como a `/prd-exec`. O preset do Perfil resolve os agentes automaticos (sherlock, reasoning do
> revisor externo).

> **Esforco da sessao — fase EXECUTAR (3.5.3).** Lote e envelope fechado: alvo **`medium`**
> (economico/equilibrado) ou `high` (maximo); o Perfil ("Nivel de esforco" → "Esforco — fase executar")
> sobrescreve. Antes do 1o despacho, leia o esforco real com `mcp__ccd_session_mgmt__get_session`
> (`session_id: "self"`, campo `effort`) quando a ferramenta existir e rode
> `bash .claude/hooks/esforco.sh executar --atual <effort>` (sem a ferramenta, omita `--atual`).
> `AJUSTAR` → pergunte UMA vez na decolagem (*"fase executar pede X; sessao em Y — `/effort X` e 'ok', ou
> 'seguir'"*); em fila/noturno anuncie e siga (o stop grava `esforco=alvo/atual`). Todo subagente herda o
> esforco da sessao — nao ha por chamada. Medido 12/09 (PRD-142-b): 83% dos tokens dos executores em
> `high` eram raciocinio.
> **3.5.4:** (1) NUNCA chame `set_session_effort` em si mesma (o Desktop recusa `self`; quem troca e o usuario com
> `/effort`); (2) apos o `ok` do usuario, releia `get_session self` e rode o `esforco.sh` de novo com o valor novo;
> (3) o `guard-agent` nega o 1o hefesto/dedalo sem `esforco.env` com `fase=executar` desta decolagem
> (`HARNESS_GUARD_ESFORCO`), e o `stop` leva `--esforco-final=<get_session self>`.

> **Telemetria (automatica DE VERDADE — 24/08).** O hook `harness-metrics-auto.sh` liga o
> cronometro na invocacao como `_auto-dt-exec` (procure a linha `[metrics-auto]` no contexto);
> o `stop LOTE-NNN` do fechamento herda esse inicio automaticamente (fallback do
> harness-metrics.sh). So rode `bash .claude/hooks/harness-metrics.sh start LOTE-NNN`
> manualmente se a linha `[metrics-auto]` nao apareceu. O **stop continua obrigatorio** —
> o guard-stop cobra cronometro esquecido.

## Uso

```
/dt-exec                        # le o INDEX, propoe um lote coeso e pede seu aceite
/dt-exec DT-003 DT-007 DT-011   # lote explicito (a triagem do Passo 1.2 ainda roda)
/dt-exec --max-itens=3          # sobrepoe o limite de itens POR LOTE neste run
/dt-exec --fila                 # FILA: propoe ate 3 lotes coesos e roda os N na sequencia
/dt-exec --fila=5               # fila com teto explicito de lotes (teto absoluto: 5)
/dt-exec --so-modulo=<nome>     # restringe os candidatos a um modulo/area
/dt-exec --sem-migration        # forca a ejecao de QUALQUER item com DDL neste run
/dt-exec --dry-run              # so a triagem + a proposta do(s) lote(s); nao escreve nem executa
/dt-exec --aceito DT-... 	# 3.4.2: o ACEITE do 1.4 ja foi dado FORA desta sessao (fila do
                                #   /dt-sweep aprovada pelo humano, ou modo autonomo/noturno).
                                #   NAO pergunte: registre as decisoes default (tolerancia =
                                #   SEGUIR+DT; sync sujo = seguir registrando) e execute ate o
                                #   Output. So faz sentido com lote explicito de DTs; sem lista
                                #   de DTs, --aceito e IGNORADO (a entrevista continua).
```

## Quando usar

- Ha DTs **Pequenos** (`< 1h`) acumulados no `prds/debito_tecnico/INDEX.md`.
- Varios deles tocam o **mesmo modulo/area** — um review e um ciclo de teste cobrem todos.
- Nenhum deles tem decisao de produto em aberto (isso e trabalho de PRD).
- **Backlog grande em mais de um modulo** → `--fila`: cada modulo vira um lote coeso e todos
  rodam na mesma decolagem. E o caso "preciso dar vazao aos DTs".
- Item pequeno que so precisava de **coluna/indice/tabela nova** (aditivo) — antes ia para
  PRD por causa do criterio de migration; agora cabe (1.2, criterio 1).

## Quando NAO usar

- **Um DT grande sozinho** → `/prd` (a cerimonia se paga).
- **1-2 DTs pequenos soltos** → nao e decolagem completa: o Passo 1.3 funde com outro grupo ou
  roda como **execucao avulsa de rito minimo** (piso de lote, 3.4.6).
- **Mudanca de modelo de dados** (DDL destrutivo, backfill, mais de 2 migrations no lote) →
  `/prd`. O aditivo cabe; a remodelagem nao (1.2).
- **Incidente urgente em producao** → corrija direto e rode `/codex-review`; nao monte lote no
  meio de um incidente (lote pressupoe calma e agrupamento).
- **Qualquer item com criterio de ejecao do Passo 1.2** → `/prd`.
- **DT sem arquivo/registro** → rode `/dt` primeiro. Esta skill resolve o que ja esta registrado;
  ela nao substitui o registro (e o registro e o que da rastreabilidade).

## Passo 0 — Carregar o Perfil do Projeto

**Antes de qualquer coisa**, leia `.claude/PERFIL-PROJETO.md`. Ele define stack, caminhos de CLI,
banco de teste, estrutura de diretorios, **integracoes com efeitos colaterais**, safe-mode,
timezone, compatibilidade de producao, **armadilhas do projeto** e o **preset de esforco**. Se o
arquivo nao existir, avise para copiar um perfil de `perfis/` e **pare**.

**Gate de frescor do resumo (2.15.0)** — os executores leem o `PERFIL-RESUMO.md`, e resumo
defasado falha em silencio. Rode `bash .claude/hooks/perfil-frescor.sh` antes de despachar
qualquer executor; `DEFASADO` = regere o resumo e rode `--carimbar`. Regra completa e tabela de
vereditos: `/prd-exec`, Passo 0.0.1 (identica). **Na fila: uma vez por sessao**, junto da
decolagem — o Perfil nao muda entre lotes.

Do Perfil saem tambem os limites deste run:
- **Itens por lote:** do preset (economico 3 · equilibrado 5 · maximo 5). `--max-itens=N` sobrepoe.
- **Lotes por fila (2.13.0):** sem `--fila`, **1** (comportamento classico). Com `--fila`,
  **3**; `--fila=N` sobrepoe ate o **teto absoluto de 5**. A fila NAO multiplica o limite de
  itens — ela repete o ciclo completo de lote, N vezes, sem repetir a decolagem.
- **Ciclos de review:** a **base** do Perfil (secao "Codex review" → "Limite de ciclos"; preset
  2.5.0: economico 1 · equilibrado 2 · maximo 3) **menos 1**, minimo **1** — lote e menor que PRD,
  o loop precisa ser mais curto. **Sem escalada em lote** (a escalada +1 e coisa de PRD).
- **PISO DE LOTE (3.4.6): lote com < 3 itens NAO decola.** A cerimonia proporcional do antigo
  MINI-LOTE (2.3.0) nao bastou: medido 25/08, o LOTE-028 gastou **5h37 e 817k tokens para 1
  item**, e lotes de 1-2 itens rodaram com paralelismo 0,30-0,97 — mini-spec + beholder +
  dupla-cega + gate 7.7 nao se pagam abaixo de 3 itens. Com menos de 3 elegiveis, o Passo 1.3
  **funde com outro grupo ou converte em EXECUCAO AVULSA de rito minimo** (regras la); a
  decolagem completa com 1-2 itens so existe com pedido explicito do humano (registre o motivo
  na proposta) — e item com migration ou tela nunca roda no rito minimo.
- **LOTE LEVE (<= 3 itens, SEM migration e SEM tela): review SOLO, 1 ciclo (3.3.0 — S4).**
  Medido 19–22/08 no core: LOTE-011 (5 itens) 11h20; LOTE-013 (3 itens) 89 min e LOTE-015 (3
  itens) 120 min, **os dois com 3 ciclos** de dupla-cega para diffs de poucas dezenas de linhas;
  LOTE-014 (2 itens, mini-lote) 29 min. O que separava 29 de 120 min era a cerimonia, nao o
  codigo. Lote leve roda **so o sherlock** (sem revisor externo), **1 ciclo**, registrado como
  `review: modo solo (lote leve)`. Qualquer item com DDL, tela, integracao ou auth tira o lote
  da categoria — ai vale a regra normal. Os itens elegiveis ao **duelo** (3.3.0) tambem podem
  ser escritos por dois modelos baratos antes do hefesto — mesma mecanica da `/prd-exec` 1.3.
- **Piso de severidade:** `HARNESS_REVIEW_SEVERITY_FLOOR` (default `critico`) vale igual.

> **Fallback de agente e BARULHENTO (2.3.0)** — mesma regra da `/prd-exec`: `Agent type not found`
> (hefesto/sherlock/beholder/michelangelo/dedalo) = agente invisivel; nao re-tente o mesmo tipo, avise o
> usuario na hora (conserto: `dos2unix .claude/agents/*.md` + doctor), use `general-purpose` COM o
> contrato do agente colado no prompt e registre `fallback: <nome> → general-purpose` no Output.

### Passo 0.0.2 — Worktree e locks dos DTs (3.4.0)

Mesma regra da `/prd-exec` 0.1.1: `bash .claude/hooks/harness-worktree.sh info` diz se voce
esta num worktree (banco/URL proprios — use-os no smoke e no E2E, nunca os do Perfil). Antes
de montar o lote, **trave TODOS os DTs numa unica chamada** (24/08 — cada invocacao paga o
setup do script; um a um custou minutos nas sessoes paralelas):
`bash .claude/hooks/harness-worktree.sh lock DT-XXX DT-YYY DT-ZZZ ...` — leia a saida linha a
linha: `LOCK|ocupado|DT-NNN` = outra sessao (ou o loop noturno) ja esta com ele: **tire-o do
lote** e registre "fora do lote: DT-NNN (em voo em <sessao>)"; os `LOCK|ok` sao seus. Ao
fechar cada item (Passo 7), `unlock DT-XXX [DT-YYY ...]` (tambem aceita varios). E isso que permite 2–3
sessoes e o noturno trabalharem a mesma fila sem colidir.

### Passo 0.1 — Sincronizar o repositorio

Mesma regra da `/prd-exec`: working tree limpo → `git pull --ff-only`. Sujo, divergente ou offline
→ **nao pergunte aqui**: registre a pendencia e leve-a para a entrevista do Passo 1.4 (nunca
descarte trabalho local). Sem git/remote → siga, registrando isso.

### Passo 0.3 — Defaults declarados (modo autonomo, 3.4.23 — espelho da `/prd-exec` 0.3 item 7)

Com `--aceito` (aceite dado fora da sessao), `HARNESS_MODO` no ambiente ou disparo do
`noturno.sh`, este run e AUTONOMO: escreva o marcador `mkdir -p .claude/.harness-run && printf
'noturno\n' > .claude/.harness-run/modo` (o `noturno.sh` ja escreve) e registre os defaults que
valem em duvida — **escopo → o menor; nome → o do glossario/Perfil; teste → `n/d (coberto pelo
acceptance)`; tolerancia → SEGUIR + DT; sync sujo → seguir registrando**. O hook
`guard-question.sh` **NEGA `AskUserQuestion`** nesse modo (marcador vale 12 h); cada duvida
decidida por default entra em **"Decisoes pendentes"** do Output.

## Passo 1 — Selecionar o lote (o gate humano fica AQUI)

> **Por que o aceite vem tao cedo:** na `/prd` voce so valida depois do discovery + PRD de produto
> (caro). Aqui voce valida depois de apenas **ler o indice** — custo quase zero. E o momento certo
> de corrigir escopo: antes de qualquer trabalho.

### 1.1 Levantar os candidatos

Leia `prds/debito_tecnico/INDEX.md` e filtre por **Status = Pendente**. O INDEX **nao** traz
esforco nem arquivos — entao **abra cada DT candidato** (`prds/debito_tecnico/DT-*.md`) e colete:

| Campo do DT | Para que serve aqui |
|---|---|
| **Estimativa de esforco** | elegibilidade (so `Pequeno`; `Medio` so com justificativa sua) |
| **Arquivos e tabelas relacionados** | **coesao do lote** (blast radius) e deteccao de conflito |
| **O que precisa ser feito** | vira o item da mini-spec; se tiver >5 tarefas, provavelmente nao e pequeno |
| **Observacoes** | criterios de ejecao (dependencias, integracoes, decisoes em aberto) |
| **Prioridade** | ordem de entrada no lote |

**Esforco ausente e o caso comum** (o campo e opcional no template). Nao invente: infira por
nº de tarefas + nº de arquivos, **marque como estimado** na proposta e deixe o humano confirmar
no aceite. Nunca trate estimativa inferida como fato.

### 1.2 Triagem — criterios de EJECAO (a regra que protege a skill)

Classifique cada candidato em **elegivel**, **ejetado** ou **bloqueado**. Ejete (→ `/prd`) se o DT:

1. exige **migration destrutiva, irreversivel ou com backfill** — ver o criterio detalhado
   logo abaixo (**migration ADITIVA e reversivel passa**, desde a 2.13.0);
2. toca **integracao com efeito colateral** do Perfil (WhatsApp/WAHA, Calendar, e-mail, pagamento,
   S3, APIs de IA) — mesmo que "so um ajuste";
3. altera **contrato**: assinatura de endpoint, formato de payload, retorno consumido por terceiros;
4. tem **decisao de design em aberto** (o template do DT pede que isso conste em "Observacoes");
5. e **Grande** (`> 4h`), ou virou grande quando voce leu os arquivos;
6. depende de outro DT/PRD ainda nao resolvido → **bloqueado** (nao ejetado; volta num lote futuro).

Ejecao **nao e fracasso** — e a skill funcionando. Registre o motivo: ele vai para o documento do
lote e volta como nota no proprio DT (Passo 7).

#### Migration ADITIVA — o unico DDL que o lote aceita (2.13.0)

> **Por que mudou.** "Qualquer schema vira PRD" empurrava para a cerimonia cara o caso mais
> comum de DT pequeno: **falta uma coluna**. A PRD nao acrescentava seguranca nenhuma ali — o
> que protege migration aditiva e o rollback e a prova de estado, nao o discovery. O que
> continua fora e o DDL que **nao da para desfazer** ou que **mexe em dado existente**.

**Passa no lote (aditivo e reversivel) — TODAS as condicoes:**

- [ ] apenas `CREATE TABLE` nova, `ADD COLUMN` **nullable ou com DEFAULT**, `CREATE INDEX`;
- [ ] **zero** `DROP`, `RENAME`, `TRUNCATE`, mudanca de tipo/nullability/collation de coluna
      existente e **zero** `UPDATE` de backfill (dado que ja existe nao se toca);
- [ ] a tabela/coluna nova **ainda nao e consumida por contrato externo** (se e payload de API
      que terceiro le, cai no criterio 3 — contrato);
- [ ] **rollback declarado** no item da mini-spec, em uma linha executavel (`ALTER TABLE x DROP
      COLUMN y`), e ele e trivial **porque** nada foi destruido;
- [ ] **no maximo 1 migration por item** e **no maximo 2 no lote inteiro** — mais que isso e
      mudanca de modelo de dados, nao debito pequeno: ejete;
- [ ] o Perfil declara como rodar migration em ambiente local (secao de banco). Sem isso
      declarado, **eje**: nao improvise comando de DDL.

Qualquer caixa desmarcada, ou duvida genuina: **ejete** (`--sem-migration` forca a ejecao de
todo DDL no run, para quando voce quiser um lote deliberadamente sem risco de schema).

**O que vem junto, obrigatoriamente:** o item ganha o campo **`Migration`** na mini-spec
(Passo 2) e a verificacao dele no Passo 4 **nao e o relato do executor** — e a consulta ao
`information_schema` provando o estado final, com a saida bruta colada. Migration declarada e
migration nao aplicada tem a mesma aparencia num relatorio; so nao tem no banco.

### 1.3 Montar um lote COESO — ou a FILA de lotes (2.13.0)

Entre os elegiveis, prefira os que **compartilham modulo/area** (compare os "Arquivos e tabelas
relacionados"). Lote coeso = um review, um ciclo de teste, um contexto na cabeca. Lote espalhado
por 5 modulos = ruido no review e risco de regressao cruzada — melhor rodar dois lotes menores.

Respeite o limite de itens. Sobrando candidatos, deixe os de menor prioridade para o proximo lote
(diga isso na proposta).

**Com `--fila`:** em vez de descartar o excedente, **particione os elegiveis em ate N lotes
coesos** (N = limite de lotes do Passo 0) — um por modulo/area, cada um dentro do limite de
itens. A fila **nao dilui a coesao**: e o oposto de "um lote grande espalhado". Regras de
particao:

- **Um lote por modulo/area.** Modulo com mais candidatos que o limite de itens gera o lote com
  os de maior prioridade; o resto fica para a proxima fila (registre).
- **Ordene a fila por risco crescente:** lote sem DDL e sem tela primeiro; lote com migration
  aditiva por ultimo. Se a fila quebrar no meio, ela quebra tendo entregue o que era mais seguro.
- **Lotes da fila nao podem compartilhar arquivo-alvo.** Dois lotes que tocam o mesmo arquivo
  sao, na verdade, um lote so — funda ou deixe o segundo para a proxima fila. (Eles rodam em
  sequencia, mas o review de cada um olha o working tree; sobreposicao embaralha o diff.)
- **Modulo unico com poucos candidatos:** nao force fila. Um lote so e a resposta certa.

**PISO DE LOTE (3.4.6) — grupo com < 3 itens nao vira lote.** Nesta ordem:

1. **Funda** com o grupo coeso mais proximo (mesma area ou area vizinha), respeitando o limite
   de itens e a regra do arquivo-alvo. Dois grupos de 2 viram um lote de 4 — uma decolagem, um
   review. Fusao heterogenea ainda e melhor que duas cerimonias.
2. Sem fusao possivel → **EXECUCAO AVULSA (rito minimo)**, item a item:
   - **Sem mini-spec** — o proprio arquivo do DT e a spec (releia-o; o que faltar la, pergunte
     na entrevista 1.4, nunca invente).
   - **Safe-mode (3.1) mantem-se** — rede de seguranca nunca cai. Packet + duelo por item
     valem como sempre (3.4.2); sem duelo, executor unico direto.
   - Verificacao do item (comandos do DT) e **review sherlock SOLO, 1 ciclo** (sem revisor
     externo), registrado como `review: modo solo (rito minimo)`.
   - **Commit 1 por item e fechamento 7.7 INTEGRAIS** (status do DT + INDEX) — rastreabilidade
     nao encolhe nunca.
   - Telemetria: label `LOTE-NNN` normal com `--extra="rito-minimo"` (comparavel no dashboard).
   - **Vetado no rito minimo:** item com migration (mesmo aditiva), tela, integracao ou auth —
     esses aguardam companhia de lote ou rodam em decolagem completa sob pedido explicito.
3. Humano pediu decolagem completa mesmo com 1-2 itens → obedeca e registre o motivo na
   proposta (1.4). E excecao consciente, nao default.

### 1.4 Propor e PARAR para o aceite — a ENTREVISTA UNICA do lote (2.4.0)

Este e o **unico gate humano do fluxo**: alem de aprovar o lote, a mesma pergunta colhe as
decisoes que os passos seguintes precisariam pedir — depois dela a execucao roda autonoma ate o
Output. Apresente e **aguarde aprovacao explicita** (`AskUserQuestion` UNICA no Claude; pergunta
textual unica no Codex). Nunca prossiga sem o "ok".

> **`--aceito` (3.4.2):** com lote EXPLICITO de DTs + `--aceito`, o aceite ja foi dado fora desta
> sessao (fila do `/dt-sweep` aprovada, ou disparo headless do sweep/noturno). Apresente a MESMA
> tabela como REGISTRO (nao como pergunta), adote os defaults (tolerancia SEGUIR+DT; pendencia de
> sync = seguir registrando) e execute. Sem lista explicita de DTs, ignore o `--aceito`.

```
## Lote proposto — <N> itens (<modulo/area>)
   (com --fila: um bloco destes por lote, na ordem de execucao, numerados "Lote 1 de N")

| DT | Titulo | Esforco | Arquivos-alvo | Migration |
|----|--------|---------|---------------|-----------|
| DT-00X | ... | Pequeno | caminho/a.php, caminho/b.js | nao |
| DT-00Y | ... | Pequeno (estimado) | caminho/c.php | ADITIVA: + coluna `x` (nullable) |

**Ejetados (viram PRD):** DT-00Y — <motivo objetivo>
**Bloqueados (dependencia):** DT-00Z — depende de <o que>
**Ficam para a proxima fila:** DT-00W (limite de itens/lotes)
**Rito minimo (abaixo do piso de 3, sem fusao possivel):** DT-00V — execucao avulsa (sherlock solo, 1 ciclo)
**Pendencias de sync (Passo 0.1, se houver):** <working tree sujo / divergiu — seguir assim ou parar?>

**Orcamento (3.0.0):** <N> itens, ~<X> subagentes, ~<Y> min — media das ultimas execucoes deste
  projeto (`bash .claude/hooks/harness-metrics.sh baseline LOTE 5`); sem historico, escreva
  "sem baseline" — nunca um numero inventado.
**Envelope (3.4.7):** ate `HARNESS_ENVELOPE_FATOR`× o baseline de subagentes POR LOTE (fator
  default 2; sem baseline, teto absoluto 20/lote). Estourou no meio de um lote: termine o lote
  (nunca pare com working tree pela metade) e PARE A FILA antes do proximo, com uma pergunta
  objetiva (o que estourou / seguir / encerrar com o que fechou).

Aprova <este lote | esta fila de N lotes>? [a] sim  [b] ajustar (tirar/incluir item ou lote)  [c] cancelar
Tolerancia de review: se esgotar os ciclos com bloqueante restante —
  [a] SEGUIR e registrar como DT (default recomendado)  [b] parar e me aguardar
```

**Registre as decisoes** (bloco "Decisoes do lote") — o Passo 5 e os gates condicionais as
consultam em vez de parar. Continuam parando SEMPRE: safe-mode reprovado (3.1) e >10
bloqueantes no ciclo 1 (sinal estrutural).

> **Verbosidade (3.0.0).** Leia `.claude/harness.env` → `HARNESS_VERBOSITY` (ausente = `conciso`).
> `normal` = relato por item, como ate a 2.16.1; `conciso` = **1 linha por lote**
> (`lote 2/4 ▸ 3 itens ok · review 0🔴`); `minimo` = so o Output final. **Nunca silencie**
> item que falhou, bloqueante 🔴, revisor em modo solo, safe-mode reprovado nem o Output —
> concisao nao pode virar omissao. O que encolhe e o eco na tela; os relatorios em disco e as
> mensagens de commit saem completos em qualquer nivel.

> **A entrevista da fila e UMA SO, e cobre os N lotes** — e ela a economia principal do
> `--fila`. Apresente **todos** os lotes no mesmo bloco (numerados, com o total de itens e o
> resumo de migration/tela de cada um) e colha o aceite de uma vez. Depois dela, a fila roda
> autonoma ate o Output. **Nao volte a perguntar entre lotes** — se voltar, o `--fila` nao
> economizou nada; as decisoes ja foram colhidas aqui.
>
> **Migration muda o texto da pergunta, nao o numero de perguntas:** lote com DDL aditivo
> mostra a linha `Migration` na tabela e a de rollback. Aprovar a fila aprova essas migrations.

Em `--dry-run`, pare aqui — nao escreva nem execute nada.

## Ciclo da fila (2.13.0) — o que repete e o que NAO repete

Sem `--fila`, ignore esta secao: e um lote so, como sempre. Com `--fila`, os Passos **2 a 7
rodam inteiros, por lote, na ordem definida em 1.3** — e este e o contrato do que se repete:

| Etapa | Na fila |
|---|---|
| Entrevista/aceite (1.4) | **1x** — cobre a fila toda |
| Sync do repo (0.1) e pre-flight de autonomia | **1x** |
| Safe-mode (3.1) | **1x por sessao** — o ambiente nao muda entre lotes. Reprovou: a fila **nao decola** |
| Mini-spec, execucao, verificacao, review dupla-cega, gate de UX, commits, gate 7.7 | **por lote, integralmente** |
| Telemetria | **1 linha por lote** (comparavel com o historico) + `--extra="fila: lote k de N"` |

**Regras de parada da fila (nao-negociaveis):**

- Lote que termina **Bloqueado**, com safe-mode reprovado ou com **>10 bloqueantes no ciclo 1**
  → **para a fila ali**. Nao enfileire trabalho novo por cima de instabilidade: apresente o
  Output com o que fechou, o lote que quebrou e os que nao rodaram.
- Gate documental 7.7 sujo → mesma coisa: corrija; nao comece o proximo lote com o anterior
  aberto (os arquivos de fechamento viajam nos commits do lote anterior).
- **Um lote nunca comeca com o working tree do anterior por revisar.** O review olha o diff
  acumulado; lotes empilhados sem commit intermediario embaralham a autoria dos achados.
  Se o humano ainda nao commitou o lote anterior, **avise e siga mesmo assim**, mas registre
  no Output que o review do lote k viu tambem o diff do k-1 (e por isso os relatorios podem
  citar arquivo de outro lote).

Ao fim da fila, o Output Esperado sai **uma vez**, com um bloco por lote (ver "Output esperado").

## Passo 2 — Escrever a mini-spec (UM documento)

Numere o lote **reservando atomicamente** — `bash .claude/hooks/harness-worktree.sh reservar
LOTE` (saida `SEQ|LOTE|<n>`; com `--fila`, use `--qtd <n-lotes>` numa chamada so). Nunca
numere lendo apenas `prds/debito_tecnico/lotes/` local: em worktree isso e o snapshot do
fork, e duas sessoes paralelas ja produziram dois LOTE-037 distintos (DT-002 do mestre).
Desde a 3.5.0 o numero vem da **faixa do dev** (`LOTE-1001…` para quem nao e o bloco 0) —
4 digitos e normal, nunca renumere.
Fallback sem o hook: sequencial local + nota no documento do lote. Dispare a telemetria.
Escreva **um unico** arquivo `prds/debito_tecnico/lotes/LOTE-NNN-<slug>.md` — sem PRD tecnica
separada, sem arquivos de task individuais:

```markdown
# LOTE-NNN: <titulo curto do lote>

- **Data:** AAAA-MM-DD
- **Modulo/area:** <onde o lote se concentra>
- **DTs incluidos:** DT-00X, DT-00Y
- **Status:** Em execucao | Concluido | Bloqueado

## Contexto do lote
<2-4 linhas: por que estes itens andam juntos>

## Itens

### Item 1 — DT-00X: <titulo>
- **O que fazer:** <as tarefas do DT, ja concretas>
- **Arquivos-alvo:** <caminhos reais>
- **Grupo de execucao:** <G1 | G2 ...>  (Passo 3.2 — itens de arquivos disjuntos ficam em grupos diferentes)
- **Duelo:** sim | auto | nao — <motivo, obrigatorio quando nao>  (mesmo criterio da /prd: `auto` e o
  DEFAULT para item mecanico de <= 3 arquivos, backend OU front; `nao` so com justificativa real —
  migration, integracao de efeito colateral, auth/autorizacao, julgamento de dominio)
- **Migration:** nao | ADITIVA — `<DDL exato>` · rollback: `<DDL exato>` · prova: `<consulta ao information_schema>`
- **Criterio de aceite:** <UMA linha verificavel>
- **Como verificar:** <comando do Perfil, ou passo manual objetivo>

### Item 2 — DT-00Y: ...

> **Propagacao do `Duelo` (25/08 — e o que ARMA o enforcement):** o guard-agent le o campo no
> **arquivo do DT**, nao na mini-spec. Ao fechar a mini-spec, grave a decisao de cada item no
> proprio `DT-NNN-*.md` (linha `- **Duelo:** sim|auto|nao — <motivo>` no cabecalho, mesma
> passada da edicao de status). Com o campo explicito, o guard exige o duelo para hefesto E
> dedalo (`sim` forca; `auto` respeita <= 3 alvos; `nao` libera). Item sem campo cai na
> heuristica conservadora (so hefesto; DTs com `**Balde:** lote` so sao vetados se um
> arquivo-ALVO do packet carregar palavra de risco no caminho — mencao na prosa nao veta).

## Fora do lote (registro anti-escopo)
- DT-00Z — ejetado: <motivo> → vira PRD
- DT-00W — bloqueado por <dependencia>

## Riscos e armadilhas aplicaveis
<so as armadilhas do Perfil que tocam estes arquivos>
```

### Gates condicionais (so quando o conteudo pede)

- **beholder** — rode se **algum item** tocar autenticacao/autorizacao, integracao, ou dado
  sensivel. Ele revisa a mini-spec (criterio de aceite fraco, caso de borda, ambiguidade). Nao
  rode em lote puramente cosmetico/refactor local. **Em mini-lote (<= 2 itens), instrua o modo
  enxuto no prompt:** *"mini-spec de lote pequeno — reporte APENAS 🔴/🟠 com justificativa em 1
  linha cada; sem relatorio longo, sem 🟡/🔵, veredito em 1 linha"* — o gate de spec de 2 itens
  nao pode custar mais que a implementacao deles.
- **michelangelo** (Modo C) — rode se **algum item** mexe em interface. No Codex, evidencia
  visual segue `.claude/PLATAFORMAS.md` §7.
- Ambos respeitam o **piso de severidade** e param no limite de ciclos deste run; esgotou com 🔴
  aberto → **consulte a decisao de tolerancia da entrevista (1.4)**: SEGUIR = aceite o risco e
  registre como DT; sem decisao aplicavel = pergunte (seguir aceitando ou tirar o item do lote).

## Passo 3 — Pre-flight e execucao

### 3.1 Safe-mode — SEMPRE (nao e opcional)

Rode a **Fase 0 da `/prd-exec`** integralmente: se o Perfil declara integracao com efeito colateral
e o ambiente e local, **valide a flag de safe-mode antes de executar qualquer item**. Mudanca
pequena dispara mensagem real igual a grande. Perfil com "Nenhuma" integracao → pulada
automaticamente. Bypass consciente: `HARNESS_SKIP_SAFE_MODE_PREFLIGHT=1`.

**Na fila (2.13.0): roda UMA vez, antes do lote 1** — o ambiente nao muda entre lotes da mesma
sessao. Reprovou: **a fila inteira nao decola** (nenhum lote roda). Se algum lote da fila tem
migration aditiva, confirme aqui tambem que o **banco alvo e o local** do Perfil — DDL rodando
no banco errado e o dano irreversivel que o safe-mode existe para pegar.

### 3.1.1 — Packet e DUELO por item, ANTES do executor (3.4.2 — mesma regra da /prd-exec 1.3 passo 0)

Para CADA item do lote, antes de qualquer `Agent`: `bash .claude/hooks/task-packet.sh
prds/debito_tecnico/DT-XXX-*.md`. Item **elegivel a duelo** (backend, ≤ 3 arquivos no packet,
sem migration/integracao/auth) → `bash .claude/hooks/harness-duelo.sh --task <DT-XXX.md> --label
LOTE-NNN` na mesma mensagem; o hefesto **aplica** o diff vencedor (`git apply --recount
--ignore-whitespace` + lint + spec local). `julgar` → themis + `--veredito`; `reprovado|
desligado` → hefesto escreve do zero. **O guard-agent nega executor sem packet — e hefesto de
item elegivel sem duelo.** Todo executor recebe o caminho do packet no prompt.

### 3.2 Um executor por item — GRUPOS DISJUNTOS por default (2.13.0)

> **O que mudou e por que.** Ate a 2.12.0 o default aqui era sequencial, com a justificativa
> "lote coeso ⇒ os itens tocam os MESMOS arquivos". Na pratica, coeso por **modulo** quase nunca
> significa mesmo **arquivo** — e a informacao que decide isso ja esta coletada desde o Passo
> 1.1 (os "Arquivos e tabelas relacionados" de cada DT). Serializar por precaucao, tendo a lista
> na mao, era pagar tempo por uma duvida que nao existe. A regra e a mesma da `/prd-exec` 2.5:
> **agrupar por alvo, disparar os grupos disjuntos juntos**.

1. **Monte os grupos a partir dos arquivos-alvo** (campo "Grupo de execucao" da mini-spec):
   itens que compartilham **qualquer** arquivo caem no MESMO grupo; grupos que nao compartilham
   nada sao disjuntos. Item com migration fica **sozinho no seu grupo** (o schema e recurso
   compartilhado — dois executores mexendo em DDL ao mesmo tempo e conflito garantido).
2. **Anuncie os grupos antes de disparar** — *"LOTE-007: 2 grupos disjuntos (relatorios /
   exportacao); item 3 em serie apos G1 (mesmo arquivo)"*. Vai para o Output.
3. **Dispare um executor por grupo, todos na MESMA mensagem.** Dentro de um grupo, os itens
   rodam **em serie no mesmo executor** (ele recebe os itens do grupo, na ordem da mini-spec).
4. **Serie so por colisao real de arquivo** — nunca por precaucao. Na duvida sobre a lista de
   arquivos de um item (DT antigo, campo vago), **abra o arquivo e confira**; se ainda restar
   duvida, ai sim serie, e registre o motivo.
5. Cada executor recebe: o(s) item(ns) do grupo (o que fazer + arquivos + criterio de aceite +
   migration, se houver), o Perfil e o contrato dele. Vale o de sempre: **escopo estrito** (nao
   "aproveitar para melhorar" o que esta ao lado — isso vira DT novo, Passo 7) e **nunca commitar**.
6. **Lote de 1-2 itens:** nao monte grupo — a sessao executa ou despacha um executor so. Overhead
   de orquestracao nao se paga em mini-lote.

> **Auditoria automatica:** a telemetria fecha com `parallel_factor` (2.12.0). Lote com varios
> grupos disjuntos e fator ~1,0 significa que os grupos foram anunciados mas despachados em
> turnos separados — o erro que a regra existe para evitar.
- **Item de INTERFACE vai para o `dedalo` (Modo O), nao para o hefesto (2.9.0)** — mesma regra da
  Fase 1 da `/prd-exec`. Classifique pelos arquivos-alvo do item (view/template/componente/`.css`/
  `.js` de tela ⇒ front). Se o DT tem **maquete do estado desejado**
  (`prds/debito_tecnico/mockups/DT-XXX-*.html`, criada na Fase 4.1 da `/dt`), **passe o caminho no
  prompt** — e o alvo visual que o autor do DT aprovou.

Item que voltar **BLOQUEADO**: nao insista. Tire-o do lote, registre em "Fora do lote" com o
motivo, e siga com os demais. Um item travado nao derruba o lote inteiro.

## Passo 4 — Verificacao por item

Para cada item, rode o **"Como verificar"** dele e cole a **saida bruta** — o mesmo gate
anti-alucinacao da `/prd-exec`: quem verifica e a sessao pai, nao o relato do hefesto.

Proporcional ao tamanho: aqui a regra e **verificar o que o item mudou**, nao escrever suite E2E
nova. Se o projeto tem suite rapida e o lote tocou area coberta por ela, rode-a uma vez ao fim.

### 4.1 Item com migration — prova de estado, nao relato (2.13.0)

Migration declarada e migration nao aplicada sao **identicas num relatorio**; so diferem no
banco. Para cada item com `Migration: ADITIVA`, a **sessao pai** (nao o executor) roda e cola:

1. a migration no ambiente local, pelo comando do Perfil (secao de banco);
2. a **prova** — a consulta ao `information_schema` declarada no item, mostrando a coluna/indice/
   tabela com o tipo e a nullability finais. Comparar so **nome de tabela** nao vale: e assim que
   drift de nullability/collation/indice passa despercebido.

Nao aplicou, aplicou parcial ou a prova nao bate: o item **nao esta pronto** — corrija antes de
seguir. Migration que falha em ambiente local e exatamente o caso que a ejecao existia para
evitar; ela reprovar aqui e a rede funcionando, nao motivo para "seguir e ver no deploy".

> **O rollback tambem e do item.** Ele esta declarado na mini-spec porque **nada foi destruido**
> — e a razao de o aditivo ser aceitavel no lote. Nao precisa executa-lo; precisa existir e ser
> trivial. Se voce nao consegue escrever o rollback em uma linha, a migration nao era aditiva.

## Passo 5 — Review dupla-cega — SEMPRE

> **REVIEW PACKET do sherlock (3.4.5, obrigatorio):** antes de despachar, rode
> `bash .claude/hooks/review-packet.sh --label LOTE-NNN --tasks "prds/debito_tecnico/lotes/LOTE-NNN-*.md"`
> (em worktree, `--desde main`) e passe o arquivo ao sherlock como contexto COMPLETO —
> proibido reler Perfil/DTs inteiros; lacuna vira achado 'nao-verificavel'. O externo ja
> recebe so o diff. Efeito medido no dashboard "por agente".

> **Carga da maquina (3.4.5 — instrutivo):** na DECOLAGEM do primeiro lote, rode
> `bash .claude/hooks/carga-maquina.sh` e obedeca a recomendacao — 3+ frentes harness
> ativas disputam o rate limit por minuto (regra da casa: max 2 frentes pesadas).
> **Semaforo de frentes (3.4.21 — hook):** 1 frente pesada por PC Windows (2 no macOS). O
> `guard-agent` adquire o slot (rotulo `LOTE-NNN`) no 1o despacho de executor; negou com
> `FRENTES CHEIAS`? A resposta padrao (3.5.4) e **esperar na fila**: `node .claude/hooks/frentes.mjs wait
> --label LOTE-NNN --session <session_id> --max-min 240` com `run_in_background: true`, encerre o turno e
> despache quando a notificacao voltar. Interativo: pergunte com **"esperar a vaga" como opcao
> recomendada** (alternativas: encerrar a outra frente, subir `HARNESS_FRENTES_MAX`). **"Implementar
> direto na sessao pai" nao e opcao sua** — so se o usuario pedir com essas palavras (medido 14/09,
> sagittarius: pai em Opus codou 77 min e 307k tokens de saida). O `stop` da telemetria libera o slot.
> Nunca `sleep` para esperar: subagente/comando em background acordam voce por notificacao.

> **Watchdog por p90 (3.4.7; enforcado na 3.4.22):** dentro do agente o hook `guard-folego` nega
> qualquer ferramenta acima do teto de chamadas do papel e o executor devolve **PARCIAL-TEMPO**
> (nao escreva teto nem contagem no prompt); no retorno o `SubagentStop` grava a linha do item em
> `prds/_metrics/tasks/` e o `guard-agent --post` avisa quando a duracao passou do teto do papel
> (2× o p90 local — caso LOTE-028: 5h37/1 item). Recebeu aviso ou PARCIAL: antes do proximo
> item/lote, divida o item ou replaneje — e registre a decisao em 1 linha no Output.

Rode o loop de review sobre o working tree do lote inteiro (nao por item — o review olha o
conjunto, que e o que vai para o commit):

```bash
bash .claude/hooks/external-review.sh LOTE-NNN 1   # revisor externo conforme o host
```

**Mini-lote (<= 2 itens): teto de 300s no revisor externo** — diff pequeno nao merece 10 min de
caminho critico; se o revisor nao fechou em 5 min num diff desse tamanho, o relatorio parcial +
sherlock cobrem:

```bash
HARNESS_EXTERNAL_REVIEW_TIMEOUT=300 bash .claude/hooks/external-review.sh LOTE-NNN 1
```

**Ciclos 2+ — escopo DELTA (2.14.0):** o re-review confere a correcao, nao reabre investigacao.
Passe o 4o argumento e o helper manda ao revisor **so os arquivos tocados desde o ciclo anterior**
(sem snapshot ou delta vazio, ele avisa e revisa completo — degradacao segura):

```bash
bash .claude/hooks/external-review.sh LOTE-NNN <N> "" delta
```

Em paralelo, na mesma mensagem, o agente **sherlock** (metade interna; **ciclo 1** no modelo do
preset, **ciclos 2+ sempre Sonnet** — regra de refino 2.4.0; **no ciclo 2+ passe a ele a lista de
arquivos do delta e os bloqueantes do ciclo anterior**, com as duas perguntas: fechou de fato? e
introduziu bug novo?). Sem revisor externo disponivel (o `external-review.sh` avisa; Codex em
**limite de uso** — `--preflight codex-cli` devolvendo `limite-ate <data>` — nao se tenta de novo
nesta run) → **SOLO-2** (3.4.24): DOIS sherlocks na MESMA mensagem sobre o mesmo packet, com
`Lente: A` (correcao + seguranca + armadilhas) e `Lente: B` (contratos + regressao + invariantes +
banco + testes) no fim do prompt, cruzados na triagem — registrado como
"review: SOLO-2 (2 sherlocks, lentes A/B — externo: <motivo>)", nunca descrito como dupla-cega.
Um sherlock so ("modo solo (1 revisor)") fica para o lote leve e o rito minimo, que sao SOLO de
proposito. Triagem, cruzamento e correcao seguem a mesma regua da `/codex-review`,
com o limite de ciclos deste run (Passo 0). **Esgotou os ciclos com bloqueante restante:**
consulte a decisao de tolerancia da entrevista (1.4) — SEGUIR = registre-os como DTs (Passo 7,
origem `bloqueante aceito`) e siga sem parar; decisao de parar (ou ausente) = devolva ao usuario.

### 5.1 Gate de UX do lote (michelangelo) — quando o lote tocou TELA (2.9.0)

> **Por que passou a existir.** Ate a 2.8.0 um lote inteiro de DTs de interface ia para o commit
> **sem nenhum gate de UX** — a `/prd-exec` tem a Fase 2.9, a `/dt-exec` nao tinha equivalente. O
> caminho barato para consertar tela (que e justamente o que os DTs pequenos de UI sao) era tambem
> o unico sem revisor de front.

**Roda quando** ao menos um item do lote foi classificado como **front** (3.2). Nenhum item de
interface, ou `HARNESS_SKIP_MICHELANGELO=1` → **pule em silencio**.

Dispare **um** agent `michelangelo` (Modo A — auditoria da tela construida) **na mesma mensagem do
ciclo 1 do review** acima, para nao somar caminho critico. Modelo: Perfil → "Modelo do
michelangelo" (`opus`/`fable` → `model: "<valor>"` na chamada; esforco = o da sessao, nao ha por
chamada — 3.4.25). No prompt, liste **so as telas que o lote tocou** (nao a aplicacao inteira) e, se
houver, o caminho das maquetes dos DTs (`prds/debito_tecnico/mockups/DT-XXX-*.html`) — o alvo
aprovado por quem registrou o debito.

**Evidencia visual (3.0.3):** canonico e **Playwright headless gravando PNG** na pasta de
screenshots do Perfil (`npx playwright screenshot "<url>" <pasta>/DT-<lote>-<tela>.png`); o browser
pane e sonda **opcional de UMA tentativa** — falhou, registra "pane indisponivel" e segue sem
retentar. Regra completa: **PLATAFORMAS.md §7**; fato de maquina, no campo "Verificacao visual
(agentes)" do Perfil.

**Triagem** (apos a Fase de review fechar, com working tree estavel): mesma regua da 2.9.3 da
`/prd-exec` — 🔴 de UX corrige (trivial inline; nao-trivial vai ao **dedalo** em Modo R ou vira
decisao do usuario conforme a tolerancia da entrevista); 🟠 segue o piso de severidade; 🟡/🔵 viram
DT no Passo 7. Registre o veredito e o placar no relatorio do lote.

## Passo 6 — Mensagens de commit: UMA POR ITEM

> **Em WORKTREE, o commit e AUTOMATICO (3.4.2).** Se `bash .claude/hooks/harness-worktree.sh info`
> devolver `rotulo` ≠ `principal`, voce **executa** os commits que redigiu (1 por item, `git add`
> escopado aos arquivos do item + fechamento do DT), na branch `wt/<rotulo>` — e branch isolada e
> reversivel; o que continua humano e o **merge** (`fechar <rotulo> --merge`) e o **push**. Motivo
> (Charles, 23/08): a sessao B do sweep terminou com 33 arquivos soltos e 0 commits — o humano nao
> deve precisar mandar commitar o que ja aprovou na decolagem. **No checkout principal a regra
> antiga vale integralmente: redigir, nunca commitar.**

**A skill nunca commita.** Ela redige as mensagens; voce executa.

Uma mensagem **por item resolvido** — o revert continua cirurgico: se um item der problema em
producao, voce reverte so ele, nao o lote. Para cada item, liste tambem os arquivos daquele item
(o `git add` fica obvio):

```
fix: <titulo curto do item> (DT-00X)

<1-2 linhas do que mudou e por que>
Resolve DT-00X. Lote: LOTE-NNN.
```

Se o lote alterou o INDEX/DTs (Passo 7), esses arquivos entram **junto com o commit do item
correspondente** — a regra do template do DT e que codigo e INDEX viajam no mesmo commit.

## Passo 7 — Fechamento e rastreabilidade

> **Por que este passo termina com gate.** Ele e o unico que escreve **estado persistente em
> mais de um arquivo** (arquivo do DT + INDEX + documento do lote) — a classe de tarefa em que
> instrucao sozinha falha **em silencio**: o INDEX sai certo, o arquivo do DT fica `Pendente`,
> os dois viajam no mesmo commit e ninguem percebe. Incidente real (LOTE-001): 2 de 3 DTs
> foram commitados e pushados com o status errado; o terceiro estava certo e mascarou o drift
> numa conferencia superficial. A regua aqui e a mesma do Passo 4 — **rode e cole a saida
> bruta**, nao confie na sua propria memoria de ter editado.

1. **Cada DT resolvido:** status → `Resolvido (LOTE-NNN, AAAA-MM-DD)` — **com a data** (25/08:
   alimenta o fluxo criados×resolvidos do dashboard) — no **arquivo do DT** e na linha do
   **`prds/debito_tecnico/INDEX.md`** (as duas pontas, sempre — regra do `TEMPLATE-DT.md`).
   Feche **DT a DT, as duas pontas na mesma passada**: editar todos os arquivos e "depois o
   INDEX" (ou vice-versa) e exatamente o padrao em que uma ponta fica para tras.
2. **Cada DT ejetado:** acrescente uma linha em "Observacoes" do DT — `avaliado no LOTE-NNN,
   ejetado: <motivo> → candidato a PRD`. E o recibo que evita reavaliar a mesma coisa toda vez.
3. **Cada DT bloqueado:** registre a dependencia nas Observacoes.
4. **DTs novos descobertos durante a execucao** (desvios dos hefestos, achados do review aceitos
   como risco): registre com `/dt` — nunca deixe achado morrer no relatorio. Os numeros vem da
   reserva atomica (`harness-worktree.sh reservar DT --qtd <n>`, uma chamada para todos os
   achados do lote) — foi exatamente aqui que duas sessoes paralelas cunharam dois DT-541
   diferentes (DT-002 do mestre).
4b. **Fila do manual vivo (2.6.0):** se ALGUM item do lote mudou comportamento visivel ao
   usuario (tela, fluxo, mensagem), appende 1 linha em `docs/manual/_fila.md`
   (`| LOTE-NNN | <modulos> | <1 frase> | <data> | pendente |`). Lote 100% interno
   (refactor/infra) → pule em silencio.
5. **Indexar o LOTE no INDEX (obrigatorio).** Sem isso o lote nasce **orfao**: o INDEX mostra
   DTs `Resolvido (LOTE-001)` e nada ali diz o que e "LOTE-001", o que ele agrupou nem onde
   esta o documento. A rastreabilidade fica de mao unica (lote → DTs) e o **registro
   anti-escopo** — o que foi ejetado e por que, justamente o que evita reavaliar o mesmo DT em
   todo lote futuro — mora num arquivo que so acha quem ja sabe que a pasta existe. Garanta as
   duas coisas no `prds/debito_tecnico/INDEX.md`:

   a. **Uma linha na tabela "Lotes de DT"** — data, modulo/area, DTs resolvidos, o que ficou
      fora (ejetado/bloqueado, com o motivo curto) e **link relativo** para o documento;
   b. **A legenda do status `Resolvido (LOTE-NNN)`** — o que significa e onde ficam os lotes.

   INDEX antigo, sem a secao nem a legenda? **Crie as duas** copiando de
   `prds/_templates/TEMPLATE-INDEX-DT.md` — indices criados antes desta versao do harness nao as
   tem, e o lote deste run e a primeira coisa que precisa delas.
6. **`LOTE-NNN`:** status → `Concluido` (ou `Bloqueado`, com o motivo).

### 7.7 — Gate de fechamento documental (nao-negociavel)

So depois dos itens 1-6, **prove o estado final** e cole a **saida bruta** no output. Ajuste as
variaveis; shell e caminhos conforme o Perfil:

```bash
LOTE=LOTE-NNN                 # o lote deste run
DTS_OK="DT-00X DT-00Y"        # resolvidos
DTS_FORA="DT-00Z"             # ejetados/bloqueados (vazio e valido)

# 1) as duas pontas de cada DT tocado: status no arquivo + linha no INDEX
for dt in $DTS_OK $DTS_FORA; do
  grep -Hn '\*\*Status:\*\*' prds/debito_tecnico/${dt}*.md
  grep -Hn "$dt" prds/debito_tecnico/INDEX.md
done
# 2) recibo do lote nas Observacoes dos que ficaram de fora
for dt in $DTS_FORA; do grep -Hn "$LOTE" prds/debito_tecnico/${dt}*.md; done
# 3) o proprio lote: status do documento + entrada no INDEX
grep -Hn '\*\*Status:\*\*' prds/debito_tecnico/lotes/${LOTE}-*.md
grep -Hn "$LOTE" prds/debito_tecnico/INDEX.md
```

**Criterio — o lote so esta concluido se TODAS forem verdadeiras:**

- todo DT de `DTS_OK` aparece com `Resolvido (LOTE-NNN)` **nas duas pontas** (arquivo *e* INDEX);
- todo DT de `DTS_FORA` cita `LOTE-NNN` nas Observacoes (e **continua** `Pendente` — ejetado nao
  e resolvido);
- o documento do lote esta `Concluido` (ou `Bloqueado`, coerente com o item 6);
- `LOTE-NNN` aparece no INDEX — a entrada da tabela "Lotes de DT".

> **Como ler:** as duas pontas de cada DT saem **lado a lado** — arquivo primeiro, INDEX logo
> abaixo. Drift aparece como contradicao vizinha (`DT-007-*.md: Pendente` seguido de
> `INDEX.md: | DT-007 | ... | Resolvido (LOTE-001) |`). A linha da tabela de lotes se repete a
> cada DT que ela cita: e ruido esperado, e de quebra confirma que o DT consta na entrada do lote.

**Qualquer linha fora disso: o lote NAO esta concluido.** Corrija e rode o gate de novo. Enquanto
ele nao estiver limpo, nao apresente o Output Esperado, nao feche a telemetria e nao diga ao
humano que pode commitar — os arquivos de fechamento viajam nos commits do Passo 6, entao commitar
antes do gate e o que congela o drift no historico.

### 7.8 — Telemetria

Com o gate limpo, feche o cronometro **deste lote** (na fila: uma linha por lote — nunca uma
linha somada da fila, senao a comparacao com o historico de lotes se perde):

```bash
bash .claude/hooks/harness-metrics.sh stop LOTE-NNN --tasks=<itens> --ciclos=<N> --subagents=<N> \
  --preset=<preset> --extra="fila: lote <k> de <N>; grupos: <G disjuntos>" \
  --review-modo=<dupla|solo-2|solo|partes> \   # 3.4.24: modo REAL do review (solo = lote leve/rito minimo)
  --esforco-final=<effort de get_session self AGORA>   # 3.5.4: esforco efetivo no fechamento
```

> **Telemetria no git (3.4.22, item 16):** o `stop` deixa STAGED `prds/_metrics/runs/<dev>@<host>.jsonl`
> e `prds/_metrics/tasks/<dev>@<host>.jsonl` — inclua-os no commit do lote; nunca `git add prds/_metrics/` inteiro.

Na fila, dispare o `start` do lote seguinte logo apos este `stop` — o tempo entre lotes
(fechamento documental, commits sugeridos) pertence ao lote que acabou, nao ao proximo.

> **Leia o `parallel_factor` antes de fechar** (2.12.0): lote com 2+ grupos disjuntos e fator
> ~1,0 = os grupos foram anunciados e despachados em serie. Registre isso no Output em vez de
> deixar passar — o numero existe para a regra do 3.2 nao depender de disciplina.

## Output esperado

```
## LOTE-NNN — <titulo> (<N> itens)          [na fila: "Lote <k> de <N>" no titulo]

**Resolvidos:** DT-00X, DT-00Y — <1 linha cada>
**Fora do lote:** DT-00Z (ejetado: <motivo> → PRD) · DT-00W (bloqueado por <dep>)
**Execucao:** <G grupos disjuntos (<alvo1> / <alvo2>) despachados juntos | sequencial: <motivo>>
**Migrations:** <DT-00Y: + coluna `x` (nullable) — aplicada e provada (saida acima); rollback: `<DDL>`> | "nenhuma"
**Verificacao:** <o que rodou, com a saida colada acima>
**Review:** dupla-cega (<N> ciclos) | SOLO-2 (2 sherlocks, lentes A/B — externo: <motivo>) | modo solo (1 revisor — lote leve/rito minimo) — <bloqueantes corrigidos / aceitos>
**Gate de UX:** <veredito + placar — so quando o lote tocou tela> | "n/a — lote sem interface"
**Fechamento:** gate 7.7 limpo — <N> DTs nas duas pontas + lote indexado (saida colada acima)
**DTs novos:** DT-0NN — <titulo>
**Decisoes pendentes:** <duvida → default adotado (Passo 0.3)> | "nenhuma"   [modo autonomo, 3.4.23]
**Commits sugeridos:** <N mensagens, uma por item — voce executa>

[bloco de telemetria do lote]
```

**Com `--fila`, um bloco desses por lote, e no fim UM resumo da fila:**

```
## Fila — <N> lotes propostos, <K> executados

| # | Lote | Itens | DTs resolvidos | Migration | Review | Status |
|---|------|-------|----------------|-----------|--------|--------|
| 1 | LOTE-007 | 4 | DT-012, DT-015, DT-018, DT-021 | nao | 1 ciclo limpo | Concluido |
| 2 | LOTE-008 | 3 | DT-009, DT-014 | + coluna `x` | 2 ciclos | Concluido |
| 3 | LOTE-009 | — | — | — | — | NAO RODOU (fila parada no lote 2) |

**Nao rodaram e por que:** <lote parado / DTs que ficaram para a proxima fila>
**Total:** <K> lotes · <M> DTs resolvidos · <P> DTs novos registrados
**Commits sugeridos:** <total>, agrupados por lote (um por item)
```

> A linha **Fechamento** so existe com a saida do gate 7.7 colada. "Atualizei o INDEX e os DTs"
> sem a saida nao e relato de fechamento — e a afirmacao que ja saiu errada em producao.
> **Na fila, cada lote tem o seu** — um gate no fim da fila nao prova os lotes anteriores.

## Regras de execucao (inviolaveis)

1. **Nunca commitar nem dar push.** A skill redige; o humano executa.
2. **Safe-mode e review dupla-cega nao sao opcionais.** Sao as duas redes que pegam dano
   irreversivel; o resto da cerimonia e que e proporcional.
3. **Criterio de ejecao nao se negocia por conveniencia.** Item que deveria ser PRD vira PRD,
   mesmo que "so falte um ajustinho". Se voce se pegar racionalizando por que um item grande cabe
   no lote, ele nao cabe. **A migration aditiva (1.2) e a UNICA excecao, e ela e uma lista de
   caixas, nao um julgamento** — caixa desmarcada = ejecao, sem discussao. "E quase aditivo"
   nao existe.
10. **A fila nao dilui gate nenhum.** Ela economiza a DECOLAGEM (entrevista, sync, safe-mode),
   nunca a rede de seguranca: cada lote tem seu review dupla-cega, sua verificacao por item e
   seu gate 7.7. Fila que "acelera" pulando gate de lote e regressao, nao melhoria.
4. **Escopo estrito por item.** Nada de "ja que estou aqui". O que sobrar segue a ECONOMIA
   DE DTs (25/08): conserto <= ~30 min em arquivo ja tocado = corrige no ciclo ou vira
   informativo; ideia = 1 linha no `prds/backlog/IDEIAS.md`; so o resto vira DT novo — com
   prova `arquivo:linha`, `**Duplicata:**` verificada no INDEX e `**Balde:**` (o guard-dt
   NEGA o Write sem esses campos; fila > HARNESS_DT_WIP_MAX so aceita Alta/bloqueante).
5. **Arquivos temporarios** no scratchpad da sessao ou em `.claude/.harness-run/tmp/` — nunca
   `/tmp` nem caminho de raiz (o hook `guard-bash.sh` bloqueia).
6. **INDEX e codigo andam juntos.** Toda mudanca de status de DT entra no mesmo commit da correcao.
7. **Estado persistente em mais de um arquivo exige gate executavel.** Escrever em N lugares e
   declarar "atualizado" e a forma mais barata de mentir sem querer. Onde a skill espalha estado
   (fechamento dos DTs, indexacao do lote), ela **roda um comando e cola a saida** — igual ao
   Passo 4 faz com a verificacao tecnica. Instrucao de boa conduta nao substitui prova.
8. **Estimativa inferida e declarada como inferida.** Nunca apresente palpite como dado do DT.
9. **Um item travado nao derruba o lote** — tire-o, registre, siga.
