---
name: ideia
description: "Funil de ideias de produto — captura em segundos (despejo/ditado vira IDEIA-NNN semente), refina com entrevista de PRODUTO puro (problema, valor, escopo minimo vs sonho, provocacoes de inovacao) e amadurece ate 'pronta-para-prd', quando a /prd --ideia NNN nasce com o discovery pre-aquecido. Use quando Charles disser '/ideia <texto>', 'anota essa ideia', 'refina a ideia X', 'lista as ideias', 'descarta a ideia Y'. NUNCA para bug ou divida tecnica (isso e /dt)."
---

# /ideia — funil de ideias de produto

> **Por que existe (25/08/2026).** A economia de DTs expulsou as ideias do debito tecnico
> (certo!), mas o destino era um `IDEIAS.md` de uma linha — onde ideia vai para morrer.
> Esta skill da o degrau que faltava: **capturar custa zero** (o impulso nao pode esperar
> entrevista) e **refinar e outro momento** (entrevista com calma). A tela do harness tem a
> aba **Ideias** com o mesmo funil (capturar/refinar/promover/descartar por botao).

**Estados:** `semente` → `refinada` → `pronta-para-prd` → `virou PRD-NNN` | `descartada — <motivo>`.
**Arquivos:** indice `prds/backlog/IDEIAS.md` (uma linha por ideia) + `prds/ideias/IDEIA-NNN-<slug>.md`
(o documento vivo, criado na captura pelo `prds/_templates/TEMPLATE-IDEIA.md`).

## Fronteira (decida ANTES de gravar)

- **Bug ou divida com custo de nao fazer** → `/dt` (gate de admissao vale la). Se o despejo
  mistura ("seria bom X, e alias Y esta quebrado"), SEPARE: a ideia fica aqui, o bug vai ao /dt.
- **Ideia ja madura com decisao tomada e urgencia** → pode ir direto a `/prd`; registre aqui
  mesmo assim (estado `pronta-para-prd`) para o funil manter o historico.

> **Esforco da sessao — fase PENSAR (3.5.3).** O Perfil ("Nivel de esforco" → linha "Esforco — fase pensar",
> default `high`; `xhigh` no preset maximo) diz o esforco que a sessao deve ter nesta skill. No
> inicio, rode `bash .claude/hooks/esforco.sh pensar --atual <nivel>` — o `<nivel>` vem de
> `mcp__ccd_session_mgmt__get_session` com `session_id: "self"` (campo `effort`) quando a ferramenta
> existir; sem ela, omita `--atual`. Saida `AJUSTAR` = avise UMA vez, *"Esforco: fase pensar pede X; sessao
> em Y — ajuste com `/effort X` (ou responda 'seguir')"*, e espere a resposta antes de despachar subagente;
> `ok`/`n/d` = siga. Nenhum subagente tem esforco proprio — todos herdam o da sessao (medido 12/09,
> PRD-142-b: 83% dos tokens dos executores eram raciocinio herdado de uma sessao em `high`).

## Modo 1 — CAPTURA (`/ideia <despejo>`) — ~10 segundos, ZERO perguntas

1. Numero: proximo `IDEIA-NNN` (maior numero entre `prds/ideias/IDEIA-*.md` e o indice, +1).
2. Titulo: destile UMA linha (max ~90 chars) do despejo — sem inventar escopo.
3. Crie `prds/ideias/IDEIA-NNN-<slug>.md` pelo template, estado `semente`, com o despejo
   INTEGRAL e cru na secao "Despejo original" (nao resuma, nao corrija, nao complete — o
   texto dele e o dado).
4. Linha no indice (apos o separador da tabela): `| IDEIA-NNN | <titulo> | <area se obvia> |
   <origem> | AAAA-MM-DD | Semente |`. Remova a linha placeholder se existir.
5. Responda em DUAS linhas: `IDEIA-NNN capturada 🌱 — <titulo>` + "refino: `/ideia refinar NNN`
   (ou aba Ideias da tela)". **Nao inicie entrevista. Nao adicione consideracoes.**

## Modo 2 — REFINO (`/ideia refinar NNN`) — entrevista de PRODUTO puro

Leia o arquivo da ideia e o Perfil do projeto (contexto de dominio). Depois conduza a
entrevista em ATE 2 rodadas de perguntas (use AskUserQuestion quando disponivel; agrupe):

1. **Problema e quem sofre** — que dor real isso resolve? Quem sente (paciente, secretaria,
   dono)? Com que frequencia?
2. **Valor e metrica** — como saberemos que deu certo? (numero, comportamento, R$)
3. **Escopo minimo vs sonho** — qual e a versao de UMA semana que ja entrega valor? E a
   versao completa dos sonhos? (as duas viram secoes do doc)
4. **Riscos de produto** — o que pode fazer isso fracassar mesmo bem construido? (adocao,
   LGPD/dominio, conflito com fluxo existente)
5. **PROVOCACOES (o passo de inovacao — obrigatorio):** ANTES de perguntar, traga 2-3
   provocacoes SUAS: variacoes da ideia, o que produtos de referencia fazem nesse espaco,
   o que o Perfil/stack permite de diferente (ex.: dado que ja existe no banco e ninguem
   usa). O usuario reage — aceita, adapta ou descarta cada uma. Registre as reacoes.
6. **Decisoes em aberto** — o que ficou sem resposta (vira pergunta da futura /prd).

Grave tudo na secao "Refino" do arquivo, atualize `**Estado:** refinada` + `**Atualizada:**`,
e espelhe o estado na celula da linha do indice. Se a entrevista deixou claro que esta madura,
pergunte em 1 linha se ja marca `pronta-para-prd`.

**NADA TECNICO no refino**: sem arquivo, sem endpoint, sem estimativa de esforco, sem
migration. Tecnica e trabalho da /prd — aqui e produto.

## Modo 3 — LISTAR (`/ideia listar` ou `/ideia`)

Tabela por estado (semente / refinada / pronta-para-prd), uma linha cada, + contagem de
descartadas/viradas. Aponte a aba **Ideias** da tela para gestao visual.

## Modo 4 — DESCARTAR (`/ideia descartar NNN <motivo>`)

Estado `descartada — <motivo>` nas duas pontas (arquivo + indice). Motivo e OBRIGATORIO —
descarte sem motivo vira ideia re-registrada em 3 meses. Reativar = voltar a `semente`.

## Ponte com a /prd

Quando a /prd rodar com `--ideia NNN` (ver skill prd), ela usa o doc refinado como discovery
de produto pre-pronto e, ao concluir a PRD, marca a ideia como `virou PRD-NNN` nas duas pontas.

## Higiene

- Ideia parada ha 90+ dias em `semente` e candidata do /dt-sweep a descarte (ideia tambem
  apodrece, so que mais devagar).
- `/ideia` NUNCA cria DT, task ou PRD — so o funil de ideias.
