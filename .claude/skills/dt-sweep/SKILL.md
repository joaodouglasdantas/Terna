---
name: dt-sweep
description: "Saneia a fila de debitos tecnicos (prds/debito_tecnico/INDEX.md): reclassifica cada DT Pendente em descartar-com-prova / ideia / lote pequeno / PRD, e entrega uma FILA de lotes por area pronta para rodar em sessoes paralelas (/dt-exec). Use quando a lista de DTs virou interminavel, antes de uma rodada de /dt-exec, ou para 'limpar os DTs' de um projeto."
---

# Saneamento da fila de DTs (`/dt-sweep`) — 3.2.2

> **O problema que esta skill resolve.** A fila de DTs so cresce: cada PRD, cada revisor, cada
> observacao em producao acrescenta, e nada sai sem codigo. Medido em 22/08/2026: core do Taurus
> com **448 DTs (79 pendentes, 26 novos na semana)**, palantir-app 161 (44 pendentes, 24 novos na
> semana), aec-erp-frontend 123 (22 pendentes). Boa parte **nao e divida**: ideia de produto,
> incidente do harness, coisa que outra PRD ja resolveu de passagem, duplicata. A `/dt-exec`
> gasta triagem (e token) nisso a cada lote — e o humano nunca encontra tempo de limpar 79 itens
> na mao.
>
> **O que ela e:** uma varredura **read-only por default** que classifica cada DT pendente em
> cinco baldes com **evidencia executavel**, propoe o que fechar sem codigo, e devolve uma
> **fila de lotes por area** com o comando pronto para cada sessao paralela. Escreve (status no
> INDEX/arquivo, linhas no IDEIAS.md) **so com `--aplicar` e sob confirmacao**.
>
> **O que ela NAO e:** nao executa DT (isso e `/dt-exec`), nao cria PRD (isso e `/prd`), nao
> apaga arquivo nenhum (DT descartado fica como historico, com o status e a prova na linha).

## Uso

```
/dt-sweep                         # varredura + proposta (read-only). Fim: fila de lotes + comandos
/dt-sweep --aplicar               # apos a proposta, aplica os fechamentos aprovados (status + IDEIAS.md)
/dt-sweep --so-modulo=<area>      # restringe a uma area (ex.: financeiro, chat-wpp, agenda)
/dt-sweep --paralelo=N            # dimensiona a fila para N sessoes simultaneas (default 2; teto 4)
/dt-sweep --idade=90              # dias sem toque a partir dos quais um DT de prioridade Baixa vira 🟡 (default 90)
/dt-sweep --executor=native       # forca a classificacao bruta na sessao (default = openrouter quando ha OPENROUTER_API_KEY)
/dt-sweep --loop                  # modo fila continua: ao fim, reemite a proxima fila (ver "Loop de saneamento")
```

> **Menos digitacao (3.3.0):** a tela do harness (`/harness-config` → aba **Trabalho** → card
> **"Saneamento da fila"**) ja faz a pre-classificacao heuristica na hora, monta a fila por sessao
> com o comando pronto e copia o prompt desta skill. Use a tela para VER; use a skill para PROVAR
> e FECHAR (a tela nunca escreve status).

## Passo 0 — Perfil, repo e limites

1. Leia `.claude/PERFIL-PROJETO.md` (stack, estrutura, integracoes com efeito colateral, preset).
   Sem Perfil → avise e pare.
2. Sync seguro do repo, igual a `/dt-exec` 0.1 (`git pull --ff-only` so com tree limpo; sujo →
   registre e siga com o estado local — a proposta e read-only).
3. Limites deste run: `--paralelo` (default **2** — `HARNESS_MAX_ACTIVE_SESSIONS` do harness.env e
   o teto; acima dele o classificador do auto mode estrangula e multiplica negacao, 1.9.0);
   itens por lote = preset da `/dt-exec` (economico 3 · equilibrado 5 · maximo 5).

> **Esforco da sessao — fase PENSAR (3.5.3).** O Perfil ("Nivel de esforco" → linha "Esforco — fase pensar",
> default `high`; `xhigh` no preset maximo) diz o esforco que a sessao deve ter nesta skill. No
> inicio, rode `bash .claude/hooks/esforco.sh pensar --atual <nivel>` — o `<nivel>` vem de
> `mcp__ccd_session_mgmt__get_session` com `session_id: "self"` (campo `effort`) quando a ferramenta
> existir; sem ela, omita `--atual`. Saida `AJUSTAR` = avise UMA vez, *"Esforco: fase pensar pede X; sessao
> em Y — ajuste com `/effort X` (ou responda 'seguir')"*, e espere a resposta antes de despachar subagente;
> `ok`/`n/d` = siga. Nenhum subagente tem esforco proprio — todos herdam o da sessao (medido 12/09,
> PRD-142-b: 83% dos tokens dos executores eram raciocinio herdado de uma sessao em `high`).

## Passo 1 — Levantar a fila (read-only, mecanico)

```bash
grep -E '^\| DT-' prds/debito_tecnico/INDEX.md | grep -iE '\| *(Pendente|Em andamento) *\|'
```

Para cada DT pendente, abra o arquivo `prds/debito_tecnico/DT-XXX-*.md` e colete: **Origem**,
**Data de registro**, **Prioridade**, **Estimativa de esforco** (se houver), **Arquivos e tabelas
relacionados**, nº de tarefas em "O que precisa ser feito", e as **Observacoes** (dependencias,
decisao em aberto). DT sem arquivo → anote `sem-arquivo` (e candidato a 🟡 por si so).

> **Executor da triagem bruta — AUTO (3.3.0):** se `OPENROUTER_API_KEY` existe na maquina — env, `~/.harness.env.local` ou `.claude/harness.env.local` — (e `HARNESS_DUELO` nao esta `off`), a pre-classificacao roda no modelo barato **sem voce pedir**; sem chave, roda nativo. `--executor=native` forca o nativo. Com openrouter, esta coleta + a pre-classificacao dos Passos 2.1–2.3 sao
> trabalho mecanico sobre texto — exatamente o que um modelo barato faz bem. Dispare o broker
> em **lotes de ate 15 DTs por envelope** (anexe os arquivos dos DTs + o INDEX com `--attach`):
> ```bash
> bash .claude/hooks/harness-delegate.sh --executor openrouter --role dt-sweep \
>   --task triagem-1 --label DT-SWEEP-$(date +%F) --prompt-file <envelope.md> \
>   --attach prds/debito_tecnico/INDEX.md,prds/debito_tecnico/DT-101-x.md,... --max-words 900
> ```
> O envelope pede **uma tabela**: `DT | balde sugerido | evidencia que voce PRECISA checar |
> area`. O modelo barato **sugere**; **quem decide e esta sessao**, depois de rodar as provas
> do Passo 2 (ele nao tem shell — nao consegue provar nada). `DELEGACAO|indisponivel` → siga
> nativo, registrando o fallback no Output. Nunca mais que `HARNESS_DELEGATE_MAX_PER_RUN`
> envelopes.

## Passo 2 — Classificar em CINCO baldes, com prova

> **Sweep INCREMENTAL (25/08):** DT novo ja nasce com `**Balde:**` no arquivo (gate de
> admissao do guard-dt). Para esses, o balde de nascenca e a hipotese default — so o
> reclassifique se a evidencia contradisser. Gaste a analise pesada nos DTs SEM campo
> (anteriores ao gate). E assim o sweep de 98 vira sweep de poucos.

A ordem importa: teste os baldes de cima para baixo; o primeiro que casar vence.

### 2.1 ⚪ Descartar — so com PROVA executavel (a regra de ouro da poda do Perfil vale aqui)

| Prova | Comando que voce roda e COLA a saida |
|---|---|
| **Arquivo/caminho citado nao existe mais** (e o DT e sobre ele) | `test -e <caminho>` para cada arquivo da secao "Arquivos" — todos ausentes = morto |
| **Ja resolvido por outra PRD/commit** | `git log --oneline -S'<trecho chave>' -- <arquivo>` ou `grep -n '<sintoma>' <arquivo>` que **nao acha mais** o codigo errado; cite o commit/PRD |
| **Duplicata** | dois DTs Pendentes com mesmo arquivo-alvo **e** mesmo sintoma — fecha o mais novo apontando o mais velho (`Descartado (data · duplicata de DT-YYY)`) |
| **Tabela/coluna citada nao esta no schema** | consulta ao `information_schema` (ou `DESCRIBE`) colada |

**"Parece obsoleto" NAO e prova.** Sem saida colada, o DT nao entra neste balde — vai para 🟡.
Item com integracao de efeito colateral (Perfil) nunca se descarta por "nao reproduzi": so por
codigo que comprovadamente ja mudou.

### 2.2 🔵 Ideia — reclassificar (sai da fila, vira 1 linha)

E ideia quando **nao ha custo de nao fazer**: feature nova, "seria bom ter", melhoria de UX
sem bug, item copiado de "Observacoes / Melhorias Futuras" de PRD, sugestao 🔵 de revisor,
"pedido de produto". Sinais no texto: *"seria interessante"*, *"futuro modulo"*, *"permitir
que"*, *"adicionar opcao de"*, origem `PRD-NNN (Observacoes/Melhorias Futuras)`.

Destino: **1 linha** em `prds/backlog/IDEIAS.md` (crie pelo `prds/_templates/TEMPLATE-IDEIAS.md`)
com `Virou de DT-XXX` na origem; o DT recebe status `Ideia` nas duas pontas (arquivo e INDEX).
O arquivo **fica** (historico), mas sai da fila da `/dt-exec` e da `/prd`.

> Na duvida entre divida e ideia, pergunte: *"se ninguem fizer isso nunca, o que quebra?"*
> Nada quebra → ideia. Algo ja esta errado ou vai cobrar juros → divida.

### 2.3 🟢 Lote pequeno — elegivel para `/dt-exec`

Criterios **identicos** aos da `/dt-exec` 1.1–1.2 (esforco Pequeno ou inferido pequeno: ≤ 5
tarefas, ≤ 3 arquivos; sem migration destrutiva; sem integracao de efeito colateral; sem
contrato de API; sem decisao em aberto; sem dependencia pendente). Registre a **area** (pelo
modulo dos arquivos-alvo) — e ela que define o lote.

### 2.4 🔴 Candidato a PRD — agrupar por TEMA, nao um por um

Tudo que a `/dt-exec` ejetaria: migration destrutiva/backfill, integracao com efeito colateral,
contrato, decisao de design, esforco Grande. **Agrupe por tema** (3 DTs de "perfis de acesso"
sao UMA PRD, nao tres): a saida e uma lista `PRD sugerida: <tema> — DT-a, DT-b, DT-c`. Isso e
o que vira argumento da proxima `/prd` (campo "Expande").

### 2.5 🟡 Para o humano decidir (um a um, com a duvida explicita)

Cai aqui o que sobrou: sem arquivo; prioridade **Baixa** sem toque ha mais de `--idade` dias
(`git log -1 --format=%cs -- prds/debito_tecnico/DT-XXX*.md`); "parece obsoleto" sem prova;
depende de decisao de negocio. Para cada um, **uma linha**: `DT-XXX — <duvida objetiva> —
sugestao: descartar|manter|ideia`. Nao decida por ele.

## Passo 3 — Proposta (read-only) e PARAR

```
## 🧹 DT-sweep — <projeto> · <data> · <N> pendentes avaliados

| Balde | Qtd | DTs |
|---|---|---|
| ⚪ Descartar (com prova) | n | DT-…, DT-… |
| 🔵 Ideia → IDEIAS.md | n | … |
| 🟢 Lote pequeno | n | … (por area: financeiro 4 · agenda 3 · chat 2) |
| 🔴 PRD (agrupado por tema) | n | <tema A>: DT-a, DT-b · <tema B>: DT-c |
| 🟡 Decidir | n | … |

### ⚪ Provas (uma por DT — saida colada)
DT-0XX — `test -e administrativo/api/x.php` → ausente; `git log -S'funcao_y'` → removido em a1b2c3 (PRD-101)
…

### 🟡 Perguntas (uma linha por DT)
…

### 🟢 Fila de lotes proposta — <P> sessoes paralelas
| Sessao | Lote | Area | DTs | Toca tela? | Migration? |
|---|---|---|---|---|---|
| A | 1 | financeiro | DT-…, DT-… | nao | nao |
| A | 2 | agenda | … | sim | nao |
| B | 1 | chat-wpp | … | nao | ADITIVA (1) |

Aplico os ⚪ e 🔵 (status nas duas pontas + linhas no IDEIAS.md)? [a] sim, todos  [b] escolher  [c] so o relatorio
```

**Regras da fila de lotes (o que permite rodar em paralelo sem se atropelar):**

1. **Lotes de sessoes diferentes NAO compartilham arquivo-alvo nem tabela.** Compare as secoes
   "Arquivos e tabelas" — intersecao nao vazia = mesma sessao (ou proxima fila).
2. **No maximo UM lote com migration por fila inteira, e ele fica na sessao A, por ultimo.**
   Duas sessoes migrando o mesmo banco local ao mesmo tempo e a forma mais rapida de perder
   uma tarde. Tudo que toca schema e serial, por definicao.
3. **Lotes que tocam tela** podem rodar em paralelo entre si, mas o gate de UX de cada um
   (michelangelo) olha so as telas do proprio lote — registre no comando (`--so-modulo`).
4. **Sessoes = `--paralelo`, nunca acima de `HARNESS_MAX_ACTIVE_SESSIONS`.** Se a fila tem mais
   lotes que sessoes, sobra fica para a proxima rodada (o `--loop` cuida disso).
5. **Cada lote cabe em ~1h30 de parede** (medido: LOTE-011 do core, 5 itens, levou 11h20 com 2
   ciclos de review — lote grande demais e PRD disfarcada). Passou de 5 itens ou de 3 areas de
   codigo, quebre.

## Passo 4 — `--aplicar` (sob confirmacao, escopado, reversivel)

So depois do "sim" do Passo 3, e so nos baldes ⚪ e 🔵 (🟢/🔴/🟡 nao mudam de status aqui —
🟢 muda quando a `/dt-exec` resolver; 🔴 quando a `/prd` absorver; 🟡 quando o humano decidir):

1. **⚪** → nas DUAS pontas (`**Status:**` do arquivo e linha do INDEX):
   `Descartado (AAAA-MM-DD · <prova em 6 palavras>)`. A prova completa (saida colada) entra
   numa secao `## Descarte (AAAA-MM-DD · /dt-sweep)` no fim do arquivo do DT.
2. **🔵** → status `Ideia` nas duas pontas + 1 linha em `prds/backlog/IDEIAS.md`
   (`| # | <titulo em 1 frase> | <area> | Virou de DT-XXX | <data> | Aberta |`).
3. **Gate de fechamento (igual ao 7.7 da `/dt-exec`) — cole a saida:**
   ```bash
   for dt in <lista>; do grep -Hn '\*\*Status:\*\*' prds/debito_tecnico/${dt}*.md; grep -Hn "$dt" prds/debito_tecnico/INDEX.md; done
   ```
   Status divergente em qualquer par = **nao esta aplicado**; corrija antes de seguir.
4. **Commit sugerido (voce NAO commita — o humano executa), um so, escopado:**
   `docs(debito-tecnico): sweep AAAA-MM-DD — N descartados com prova, M reclassificados como ideia`
   com `git add prds/debito_tecnico/INDEX.md prds/debito_tecnico/DT-*.md prds/backlog/IDEIAS.md`.

## Passo 5 — Sessoes paralelas SEM trabalho manual (3.4.2)

> **Regra de UX (Charles, 23/08): o humano nao roda nada no terminal.** A skill prepara TUDO;
> o que sobra para ele e, no maximo, abrir uma pasta no app e colar UMA linha.

1. **Crie voce os worktrees das sessoes B+** (a A fica no checkout principal, com qualquer
   migration): `bash .claude/hooks/harness-worktree.sh novo sweep-b` (c, d…). Cole no relatorio
   a pasta pronta de cada um.
2. **Modo MAOS-LIVRES — so quando o humano NAO esta na maquina** (noturno/cloud) **ou pedir
   explicitamente.** Regra do Charles (23/08): com ele no PC, as sessoes B+ rodam como sessao
   NORMAL do app (assinatura) — headless `claude -p` consome credito Agent SDK a preco de API
   e fica reservado a madrugada/servidor. Nao oferte por default; se o run e autonomo
   (`--autonomo`) ou o humano pedir, dispare:

   ```bash
   cd <pasta-do-worktree> && claude -p "/dt-exec --fila=<N> --aceito DT-… DT-…" \
     --permission-mode acceptEdits --output-format text > .claude/.harness-run/sweep-b.log 2>&1 &
   ```

   — mesma mecanica do noturno: o `--aceito` (novo na `/dt-exec`) declara que o aceite humano
   ja foi dado AQUI, na aprovacao da fila; commits ficam na branch `wt/<rotulo>`; ao final voce
   reporta o log e sugere `harness-worktree.sh fechar <rotulo> --merge`. Acompanhe pelo log e
   pelos locks — e reporte no Output o que cada sessao headless fechou.
3. **Sem maos-livres**, emita um bloco pronto para colar por sessao — a A no checkout principal,
   as demais cada uma na pasta do worktree ja criado (o humano so abre a pasta no app e cola):

```bash
# Sessao A — financeiro (2 lotes, sem migration)
cd /c/laragon/www/<projeto> && claude "/dt-exec --fila=2 DT-101 DT-105 DT-118 DT-122 DT-130 DT-131"
```
```bash
# Sessao B — chat-wpp (1 lote, 1 migration ADITIVA)
cd /c/laragon/www/<projeto> && claude "/dt-exec DT-140 DT-141 DT-144"
```

**Worktree quando o lote NAO toca banco:** se duas sessoes vao commitar no mesmo checkout, os
commits se embaralham e o review de uma ve o diff da outra (a `/dt-exec` avisa, mas nao
resolve). Sessao sem migration pode rodar num worktree proprio:
`git worktree add ../<projeto>-sweep-B -b sweep/B && cd ../<projeto>-sweep-B && claude "/dt-exec …"`,
e depois `git merge sweep/B` no checkout principal. **Sessao com migration fica SEMPRE no
checkout principal** (o banco local e um so; o worktree nao isola o banco — isso e armadilha,
nao conveniencia).

**Trava simples contra dupla execucao:** antes de emitir os comandos, grave
`.claude/.harness-run/dt-sweep-fila.md` com a tabela de sessoes × DTs e a data. A `/dt-exec`
nao le esse arquivo (e gitignored, e ela e autonoma por design) — ele existe para o **humano**
saber o que ja foi distribuido quando voltar amanha, e para o `--loop` nao reemitir DT que ja
esta numa sessao viva.

## Loop de saneamento (`--loop`)

O sweep e para rodar **toda semana**, nao uma vez. Com `--loop`, ao fim do Passo 5 a skill:

1. Releia o INDEX (os lotes da rodada anterior, se ja rodaram, mudaram status para
   `Resolvido (LOTE-NNN)`); remova da fila o que fechou; detecte DT que estava distribuido e
   **continua Pendente** (lote quebrou ou nao rodou) — reemita-o com a marca `(reemitido)`.
2. Reemita a proxima fila de lotes (Passo 3 → 5) **sem nova classificacao completa**: so os DTs
   **novos desde o ultimo sweep** (data de registro > data do `dt-sweep-fila.md`) passam pelo
   Passo 2; os demais reaproveitam o balde anterior.
3. Pare quando a fila 🟢 estiver vazia **ou** quando restarem so 🟡/🔴 — e diga isso: *"fila
   pequena esgotada; sobraram N 🔴 (temas: …) e M 🟡 aguardando voce"*. Fila que so tem 🔴 e
   sinal de que o proximo passo e `/prd`, nao outro sweep.

Cadencia sugerida: `/dt-sweep --loop --paralelo=2` toda segunda, antes da weekly. Agendavel com
`mcp__scheduled-tasks__create_scheduled_task` (so a proposta; `--aplicar` continua sob confirmacao).

## Modo AUTONOMO (`--autonomo`, 3.4.0) — o loop noturno

E o que o `.claude/scripts/noturno.sh` chama — localmente num worktree, ou **em cloud** (`--cloud`: checkout do runner + banco externo, ver `.claude/scripts/noturno-ci.yml`) — (`claude -p "/dt-sweep --loop --autonomo
--paralelo=1 --max-lotes=3"`), **dentro de um worktree isolado** com banco clonado. Regras que
mudam em relacao ao modo normal:

1. **Nenhuma pergunta.** `--aplicar` e implicito **so para 🔵 ideia** (reversivel) — ⚪ descarte
   **nao** e aplicado sozinho (fica na proposta para o humano). 🟡 e 🔴 so sao listados.
2. **Executa os lotes 🟢** na ordem da fila (Passo 3), ate `--max-lotes`, com a mecanica
   integral da `/dt-exec` (lock por DT, lote leve = sherlock solo, duelo nos itens mecanicos,
   gate 7.7), **commitando 1 item por commit** na branch do worktree — e o unico modo em que a
   skill commita, e so porque a branch e `wt/noturno-*` (nunca a principal, nunca push).
3. **Para** no primeiro lote Bloqueado, safe-mode reprovado ou teto diario do OpenRouter; o que
   fechou fica commitado, o resto volta para a fila com `unlock`.
4. **Relatorio** em `.claude/.harness-run/noturno-<rotulo>.log` + telemetria normal. O
   `noturno.sh` publica a branch e abre o MR — voce revisa de manha.

Sem `--autonomo`, nada disto se aplica (a skill continua read-only e sob confirmacao).

## Telemetria

Ao fim (com ou sem `--aplicar`), registre uma linha:
```bash
L="DT-SWEEP-$(date +%F)"
bash .claude/hooks/harness-metrics.sh start "$L"      # no inicio do Passo 1
bash .claude/hooks/harness-metrics.sh stop  "$L" --tasks=<N pendentes> \n  --extra="descartados=<n> ideias=<n> lote=<n> prd=<n> decidir=<n> sessoes=<P> executor=<native|openrouter>"
```
E o que permite o `/harness-report` mostrar **a fila encolhendo** semana a semana — a unica prova
de que o saneamento esta funcionando.

## Regras (inviolaveis)

1. **Read-only sem `--aplicar`; `--aplicar` so apos "sim" explicito; nunca commita nem da push.**
2. **Descarte exige prova colada.** "Parece obsoleto" e 🟡, nunca ⚪. Sem saida de comando, nao fecha.
3. **Nada e apagado.** DT descartado/ideia fica no disco com status e prova; a reversao e trocar
   o status de volta.
4. **Ideia nao e divida.** O teste e "se ninguem fizer, o que quebra?". Nada → ideia.
5. **🔴 sai agrupado por tema.** Um DT-por-PRD e a mesma lista interminavel com outro nome.
6. **Paralelismo respeita arquivo, tabela e banco.** Intersecao de alvo = mesma sessao; migration
   = sessao A, por ultimo, sem worktree. Nunca mais sessoes que `HARNESS_MAX_ACTIVE_SESSIONS`.
7. **O modelo barato sugere, a sessao prova e decide.** `--executor=openrouter` nunca grava
   status sozinho — ele nao tem shell para produzir a prova do 2.1.
8. **Telemetria sempre**, mesmo em run so de proposta — fila que nao e medida nao encolhe.
