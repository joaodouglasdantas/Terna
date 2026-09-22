---
name: dt
description: "Registra um debito tecnico de forma guiada (entrevista curta + documento padronizado em prds/debito_tecnico/ + INDEX). Use quando notarem um problema ou melhoria que nao sera resolvido agora mas nao pode se perder."
---

# Criar Debito Tecnico (DT)

Skill para criar documentos de debito tecnico de forma guiada, coletando informacoes
suficientes para evitar ambiguidades quando o DT for convertido em PRD no futuro.

## Uso

```
/dt <descricao do problema>
```

O argumento e uma descricao livre do problema ou melhoria observada. A skill conduzira
uma entrevista curta para completar as informacoes antes de gerar o documento.

## Passo 0 — Carregar o Perfil do Projeto

**Antes de qualquer coisa**, leia `.claude/PERFIL-PROJETO.md`. Ele define stack,
estrutura de diretorios, integracoes com efeitos colaterais, timezone e armadilhas do
projeto — todos os valores especificos citados adiante vem de la. Se o arquivo nao
existir, avise o usuario para copiar um perfil de `perfis/` e pare.

## Passo 0.1 — Atualizar o repositorio antes de investigar

> **Por que:** a Fase 2 investiga o codigo e o DT registra caminhos `arquivo:linha` reais.
> Sobre codigo atrasado, as referencias nascem defasadas — entao sincronize antes.

Na raiz do repo do projeto-alvo (mesma rotina segura de pull da `/prd`):

1. **E repo git com remote?** `git rev-parse --is-inside-work-tree` + `git remote`. Sem git
   ou sem remote → pule e siga ("discovery sobre o estado local").
2. **`git status --porcelain`:**
   - **Limpo** → `git pull --ff-only` no branch atual; reporte `N commit(s) novo(s)` ou
     `repo ja atualizado`. Divergiu ou erro de rede/auth → **nao force**, reporte e
     pergunte se segue assim.
   - **Sujo** (mudanca nao commitada) → **NAO** faca pull; rode `git fetch` e informe
     quantos commits atras esta; pergunte se segue no estado atual ou para para commitar/
     stashar antes. Aguarde.

> Nunca `reset --hard` / `checkout .` / `clean` / merge automatico — so `--ff-only`, sem
> descartar nada do local. (Isto NAO viola a regra "nao commit/push" abaixo: pull
> `--ff-only` apenas avanca o branch local para o remoto.)

> **Esforco da sessao — fase PENSAR (3.5.3).** O Perfil ("Nivel de esforco" → linha "Esforco — fase pensar",
> default `high`; `xhigh` no preset maximo) diz o esforco que a sessao deve ter nesta skill. No
> inicio, rode `bash .claude/hooks/esforco.sh pensar --atual <nivel>` — o `<nivel>` vem de
> `mcp__ccd_session_mgmt__get_session` com `session_id: "self"` (campo `effort`) quando a ferramenta
> existir; sem ela, omita `--atual`. Saida `AJUSTAR` = avise UMA vez, *"Esforco: fase pensar pede X; sessao
> em Y — ajuste com `/effort X` (ou responda 'seguir')"*, e espere a resposta antes de despachar subagente;
> `ok`/`n/d` = siga. Nenhum subagente tem esforco proprio — todos herdam o da sessao (medido 12/09,
> PRD-142-b: 83% dos tokens dos executores eram raciocinio herdado de uma sessao em `high`).

## Procedimento

### Fase 0.5 — Triagem de CLASSE e de duplicata (3.2.2) — antes de entrevistar

> **Por que existe.** A fila de DTs virou lista interminavel porque TUDO que "nao cabe agora"
> virava `DT-XXX` com arquivo de 40 linhas: ideia de produto, incidente do harness, task que
> estourou o envelope, sugestao 🔵 de revisor. Medido em 22/08/2026 no core do Taurus: 26 DTs
> novos em uma semana, 79 pendentes; 8 dos 26 eram "Melhorias Futuras" de uma unica PRD e 2
> eram incidentes do proprio harness. A `/dt-exec` passou a gastar triagem (e token) em coisa
> que nunca foi divida. **DT e bug ou divida tecnica — algo com custo real de NAO fazer.**

Classifique o pedido em UMA das classes abaixo **antes** de qualquer pergunta, e diga ao
usuario em uma linha qual escolheu (ele corrige se discordar):

| Classe | Criterio | Destino |
|---|---|---|
| **bug** | comportamento errado hoje, reproduzivel, com impacto em usuario/dado/envio | `DT-XXX` (esta skill segue) |
| **divida** | atalho/gambiarra/risco/estrutura que COBRA juros (retrabalho, seguranca, performance, teste fragil) | `DT-XXX` (esta skill segue) |
| **ideia** | "seria bom ter", feature nova, desejo de produto, melhoria de UX sem bug — **nao ha custo de nao fazer** | **1 linha** em `prds/backlog/IDEIAS.md` (crie pelo `prds/_templates/TEMPLATE-IDEIAS.md` se nao existir). **Nao cria `DT-XXX`, nao entrevista.** Pare aqui e reporte. |
| **harness** | o problema e do harness/agentes/skills (agente travou, gate errado, telemetria), nao do produto | **Nao e DT do projeto.** Registre 1 linha em `.claude/.harness-run/harness-incidentes.jsonl` (`{ts, label, texto}`) e avise o usuario para levar ao mestre do harness (vault) — e melhoria de harness, nao divida do produto. |
| **dimensionamento** | "TASK-NNN levou X min" e parentes — e METRICA, nao divida | Telemetria (`harness-metrics.sh ... --extra`) — a `/prd-exec` 1.3 ja faz isso desde a 3.2.2. Nao cria DT. |

**Duplicata:** antes de seguir com `bug`/`divida`, rode
`grep -i -E '<2-3 palavras-chave do titulo>' prds/debito_tecnico/INDEX.md`. Achou DT **Pendente**
sobre o mesmo sintoma/arquivo? **Nao crie outro**: acrescente um paragrafo "Reincidencia
(AAAA-MM-DD): …" no DT existente e suba a prioridade dele se fizer sentido. Dois DTs para o
mesmo problema e a segunda causa da fila inchada (a primeira e ideia travestida de DT).

**Sem excecao por "e rapidinho":** ideia com decisao de produto em aberto e ideia, mesmo que
pareca pequena. O que decide a classe e o **custo de nao fazer**, nao o tamanho.

### Fase 1 — Entender o problema

Leia o argumento fornecido pelo usuario. Em seguida, faca UMA UNICA pergunta ao usuario
(via `AskUserQuestion` quando disponivel, ou em texto direto) reunindo TODOS os pontos
abaixo que ainda nao estejam claros a partir da descricao inicial. Agrupe tudo em uma
mensagem so — nao faca perguntas em rodadas separadas.

Pontos a coletar (pule os que ja estiverem claros na descricao do usuario):

1. **Origem:** Onde o problema foi percebido? (ex: teste manual, bug em producao,
   observacao operacional, feedback de usuario, analise pos-PRD, duplicacao de envio)
2. **Comportamento atual vs esperado:** O que acontece hoje e o que deveria acontecer?
   (critico para bug fixes; para melhorias, pergunte qual e o resultado desejado)
3. **Impacto:** O que acontece se nao corrigirmos? Afeta usuario final, dados, envios,
   custos, estabilidade? (ajuda a definir prioridade)
4. **Arquivos ou tabelas envolvidos:** O usuario ja sabe quais arquivos, endpoints,
   tabelas ou servicos sao afetados? (se nao souber, tudo bem — voce investigara depois)
5. **Dependencias:** Existe algum DT ou PRD relacionado? Tem restricao de ordem
   (precisa ser feito antes/depois de algo)?
6. **Prioridade sugerida:** O usuario tem preferencia? (Alta / Media / Baixa)
7. **Estimativa de esforco:** Pequeno (< 1h), Medio (1-4h), ou Grande (> 4h)?

Formato da pergunta: apresente os pontos como lista numerada. O usuario pode responder
de forma livre — extraia as informacoes da resposta.

### Fase 2 — Investigar o codigo (se necessario)

Se o usuario NAO informou arquivos/tabelas afetados, ou se a descricao indica um bug
cuja causa raiz nao e obvia:

1. Use Grep/Glob/Read para localizar os arquivos e tabelas relevantes. Comece pelos
   diretorios definidos no Perfil (secao "Estrutura de diretorios do projeto").
2. Identifique o trecho de codigo problematico (se aplicavel).
3. Anote caminhos de arquivo com linhas relevantes para a secao "Arquivos e tabelas
   relacionados".

**IMPORTANTE:** Nao implemente nenhuma correcao. A skill /dt APENAS cria o documento.

### Fase 3 — Determinar proximo numero

1. Se nao existir a pasta `prds/debito_tecnico/`, cria-la (junto com `INDEX.md` inicial).
2. **Reserve o numero atomicamente** (DT-002 do mestre — duas sessoes paralelas ja alocaram
   o mesmo DT-541 lendo cada uma o proprio INDEX):
   ```bash
   bash .claude/hooks/harness-worktree.sh reservar DT
   ```
   A saida `SEQ|DT|<n>` e o seu numero. A reserva vive no `.git` comum, entao vale para o
   checkout principal E todos os worktrees ao mesmo tempo; o piso ja considera INDEX +
   arquivos em disco do principal. Numero reservado nunca e devolvido (buraco na serie e ok).
   **3.5.0 — faixa por dev:** o numero sai do bloco do dev (e-mail git → bloco; o Charles segue
   em `DT-581…`, um colega recebe `DT-10001…`). Numero de 5 digitos e normal; **nunca renumere**
   um DT para "fechar buraco" nem para "ficar em ordem" — a serie nao e cronologica (o INDEX
   tem a data). Sua faixa: `bash .claude/hooks/harness-worktree.sh faixa`.
3. Fallback (repo sem o hook, ex.: harness antigo): leia `prds/debito_tecnico/INDEX.md`, o
   proximo e ultimo + 1 — e registre no documento que a reserva atomica nao estava disponivel.

Se o INDEX ainda nao existir, crie-o **copiando `prds/_templates/TEMPLATE-INDEX-DT.md`** — ele ja
traz a tabela de DTs, a **legenda de status** (incluindo `Resolvido (LOTE-NNN)`, produzido pela
`/dt-exec`) e a secao **"Lotes de DT"**. Nao improvise uma estrutura mais curta: indice sem a
legenda e sem a secao de lotes gera status que ninguem consegue decifrar depois.

> **INDEX antigo, sem legenda nem secao de lotes** (criado antes desta versao do harness)? Nao e
> trabalho desta skill migrar — a `/dt-exec` cria as duas secoes quando fecha um lote. Se quiser
> adiantar, copie-as do template.

### Fase 4 — Gerar o documento DT

1. Leia o template em `prds/_templates/TEMPLATE-DT.md`.
2. Crie o arquivo `prds/debito_tecnico/DT-XXX-<slug-kebab-case>.md` seguindo o template.

Diretrizes de conteudo:

> **Gate de admissao (25/08 — o hook `guard-dt.sh` NEGA o Write sem isto):** todo DT novo
> precisa de (a) **prova concreta** — ao menos um `arquivo.ext:linha` no corpo; (b) linha
> `**Duplicata:** nenhuma (INDEX verificado em AAAA-MM-DD)` ou `similar a DT-NNN — <distincao>`
> (verifique DE FATO no INDEX antes); (c) `**Balde:** lote | prd | decidir` (taxonomia do
> /dt-sweep, decidida no nascimento). Com a fila acima de `HARNESS_DT_WIP_MAX` (default 60)
> pendentes, so entra DT **Alta/bloqueante** — o resto e ideia (IDEIAS.md) ou informativo.

- **Titulo:** Curto e descritivo (max ~80 caracteres). Deixe claro o QUE esta errado
  ou o QUE precisa mudar.
- **Origem:** Referencie PRDs, testes ou contexto real. Converta datas relativas para
  absolutas (ex: "ontem" → "2026-04-16").
- **Contexto:** Escreva como se o leitor nunca tivesse visto o codigo. Inclua:
  - O que o sistema faz hoje (comportamento atual)
  - Por que isso e um problema (impacto operacional)
  - Como foi descoberto (origem detalhada)
  - Se for bug: passos para reproduzir (quando aplicavel)
- **O que precisa ser feito:** Lista de tarefas concretas com checkbox `[ ]`. Cada item
  acionavel (comece com verbo). Se o escopo for grande, agrupe em sub-secoes logicas.
- **Arquivos e tabelas relacionados:** Caminhos reais verificados no codigo. Inclua
  linhas relevantes quando possivel.
- **Observacoes:** Riscos, edge cases, dependencias com outros DTs/PRDs, consideracoes
  de performance, seguranca, timezone (ver Perfil) ou integracoes com efeito colateral
  (ver Perfil → Integracoes). Se o DT puder virar PRD, indique aqui quais decisoes de
  design ainda estao em aberto.

### Fase 4.1 — DT de INTERFACE ganha o "como deveria ser" (ariadne — opcional, 2.9.0)

> **So oferece quando o DT e de interface** (tela confusa, fluxo ruim, estado faltando, layout
> quebrado) **e** o "esperado" e visual — ou seja, quando descrever em texto vai custar caro a quem
> for executar. DT de backend, performance ou dado: **nao pergunte**.

Pergunte em UMA linha, no fim da Fase 4: *"Quer que eu desenhe o 'como deveria ser' junto com o DT?
E uma maquete HTML de uma tela so — custa ~1 subagente Sonnet e faz este DT continuar executavel
daqui a seis meses, quando ninguem lembrar do que a gente conversou."* Default sem resposta: **nao**.
Ignorada quando `HARNESS_SKIP_MOCKUP=1`.

Se sim, dispare **um** agente `ariadne` (`model: "sonnet"`) com destino
`prds/debito_tecnico/mockups/DT-XXX-<slug>.html`, passando o contexto do DT (comportamento atual,
esperado, arquivos envolvidos) e **uma variante so** — DT nao e espaco de exploracao, e registro do
alvo. Depois, referencie o arquivo na secao "Observacoes" do DT:
`Maquete do estado desejado: prds/debito_tecnico/mockups/DT-XXX-<slug>.html`.

> A `/dt-exec` le essa referencia quando o item entra num lote e a repassa ao `dedalo` — o alvo
> visual chega em quem vai construir, sem telefone-sem-fio.

### Fase 5 — Atualizar o INDEX.md

Adicione uma nova linha na tabela de `prds/debito_tecnico/INDEX.md`:

```
| DT-XXX | <Titulo curto> | <Prioridade> | Pendente | <Origem resumida> |
```

### Fase 6 — Resumo final

Apresente ao usuario:
- Numero e titulo do DT criado
- Caminho do arquivo
- Prioridade e esforco definidos
- Resumo em 2-3 linhas do que foi documentado

## Regras

- **NAO implementar codigo.** A skill /dt cria apenas documentacao.
- **NAO fazer git commit nem push** (o usuario faz manualmente). A UNICA operacao git da
  skill e o `git pull --ff-only` de sincronizacao do Passo 0.1 — avanco/leitura, nunca
  descarta nada local.
- **NAO pular a fase de perguntas.** Mesmo que a descricao pareca completa, confirme —
  informacoes omitidas geram DTs ambiguos que causam retrabalho nas PRDs.
- **NAO assumir o proximo numero.** Sempre reservar via `harness-worktree.sh reservar DT`
  (Fase 3) — ler so o INDEX.md colide entre sessoes/worktrees paralelos.
- **Data de registro:** Usar a data de hoje (verificar via contexto do sistema).
- **Status inicial:** Sempre "Pendente".
- Todo conteudo em portugues brasileiro (exceto termos tecnicos, nomes de
  funcoes/tabelas/arquivos).
