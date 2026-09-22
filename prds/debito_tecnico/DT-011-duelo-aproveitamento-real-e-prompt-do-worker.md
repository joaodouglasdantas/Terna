# DT-011 — Duelo: só 32 % dos últimos 50 viraram código de verdade; 76 % dos "vencedores" são W.O. sem juiz; o prompt do worker pede cópia literal de arquivos de 80 KB

**Prioridade:** Alta
**Status:** Parcialmente resolvido na 3.5.6 (16/09/2026) — itens 2, 4 (parte) e 5 implementados; itens 1 e 3 PROPOSTOS com diff (escopo B)
**Balde:** lote
**Origem:** Pedido do Charles (15/09, noite): "os diffs estão errando muito — validar como mandamos o prompt e a estatística dos
últimos 50 duelos: quantas wins foram realmente usadas". Medido nos `prds/_metrics/harness-duelos.jsonl` + `duelos/*.jsonl` de
dra-mariana-duarte, caronte e sagittarius (dedupe por `id`), envelopes em `.claude/.harness-run/duelos/` e no código do
`harness-duelo.sh`/`duelo-aplicar.mjs` do mestre 3.5.5.
**Duplicata:** verificada — DT-001 (régua do placar) e DT-010 (pool) não cobrem aproveitamento nem prompt (INDEX 2026-09-15).

## Problema (com prova)

**Últimos 50 duelos únicos** (63 no total, 25/08 → 14/09; 22 rótulos, PRD e LOTE):

| Medida | Valor |
|---|---|
| Vencedor A / B / nenhum | 24 / 8 / **18 (36 %)** |
| Veredito por juiz (themis) / por W.O. ou serial (`juiz=auto`) | **12 (24 %) / 38 (76 %)** |
| Serial pulou o B | 9 |
| Diff aplicável (`git apply --check`): A / B (sem os pulados) / ambos inaplicáveis | 32/50 · 19/41 · **11** |
| Com vencedor (32): `aplicado ok` / `falhou` / **sem registro** | **16 / 10 / 6** |
| **Usadas de verdade (`aplicado ok`)** | **16 de 50 = 32 %** (no máximo 22/50 = 44 %, se os 6 sem registro tiverem sido usados) |
| Tamanho do packet do worker (mín / mediana / máx) | 22 KB / **83 KB** / 150 KB |

Por modelo (n = duelos disputados nos 50; ok = venceu E o diff foi usado):

| Modelo | n | vitórias | inaplicável | venceu & ok | venceu & descartado | custo nos 50 |
|---|---|---|---|---|---|---|
| deepseek/deepseek-v4-flash-0731 | 20 | 12 | 6 | 6 | 2 | US$ 1,29 |
| qwen/qwen3.7-flash (suplente) | 19 | 10 | 6 | **7** | 3 | **US$ 0,15** |
| google/gemini-3.7-flash | 18 | 6 | 4 | 1 | 3 | US$ 1,31 |
| anthropic/claude-haiku-4.5 (suplente) | 13 | 1 | **9** | 0 | 1 | **US$ 2,19** |
| qwen/qwen3-coder-next | 12 | 0 | 9 | 0 | 0 | US$ 0,79 |
| ollama (qwen2.5-coder 7b/14b, qwen3-coder 30b) | 6 | 0 | 6 | 0 | 0 | 0 |
| google/gemini-3.8-flash | 3 | 3 | 0 | 2 | 1 | US$ 0,16 |

Por que os 10 vencedores foram descartados (motivo gravado no `aplicado`): SQL com coluna inexistente (`rl.status`), include
apontando `home.php` na raiz quando a home real é `templates/home.php`, 3 de 4 endpoints usando `$pdo->prepare()`/`lastInsertId()`
que não existem no `funcoesPDO` do projeto, migration de backfill que a mini-spec do lote tinha EJETADO, `style` inline contra a
convenção CSS do projeto, diff só com o wrap do `<span>` (lógica JS toda reescrita), juiz reprovou, endpoint removido por decisão
posterior. Ou seja: o diff **aplica** (passa no `git apply --check`) e está **errado** — e no caminho W.O. ninguém olha antes do
executor. Por que os 18 "nenhum": 11 × "nenhum diff aplicável" (BUSCAR não encontrado = cópia não literal do trecho; 1 × bloco fora
de `### ARQUIVO:`) e 7 × themis reprovou os dois (escopo incompleto, caminho inexistente, diff truncado, os dois com o MESMO bug).

O prompt do worker (`harness-duelo.sh:298-324`): sem ferramentas, packet com contrato + resumo do Perfil + arquivos-alvo NA ÍNTEGRA
como anexo, formato BUSCAR/SUBSTITUIR "caractere a caractere, copie do packet". Com 83 KB de mediana num modelo barato, a cópia
literal falha (22 % dos duelos morrem aí) e o packet não traz o que mais derrubou os vencedores: a API do wrapper de banco, a regra
de include/caminho e as decisões da mini-spec do lote. O `duelo-aplicar.mjs` já normaliza CRLF, mas exige igualdade exata de
espaços/indentação. `aplicado` só é gravado se a sessão rodar `--aplicado` — 6 vencedores nunca souberam se foram usados.

## Proposta

1. **W.O. não é veredito.** Quando só um diff aplica, o themis roda em modo SOLO com a mesma rubrica (nota ≥ 60 para entregar ao
   executor; abaixo = `nenhum`); `juiz=themis-solo` no evento. Custo: 1 chamada barata por duelo; ganho: os 10/26 descartes
   deixam de chegar ao executor como "vencedor".
2. **`aplicado` sempre registrado.** O executor que recebe `DUELO|ok` é obrigado a declarar no relatório `**Diff do duelo:** aplicado
   | parcial | reescrito (motivo)`; o `guard-agent --post` lê a linha e grava o evento; no `stop`, vencedor sem `aplicado` vira
   `desconhecido` (hoje some da conta).
3. **Prompt do worker — cópia literal deixa de ser o gargalo:** (a) BUSCAR curto: 2–5 linhas únicas (âncora) em vez de blocos
   grandes, e o `duelo-aplicar.mjs` casa com **normalização de espaços/indentação** (log `casou por normalização`) e aceita
   `@@ ~linha` como dica (busca ±15 linhas); (b) anexos com **número de linha** e só os TRECHOS indexados pelo contrato (não o
   arquivo inteiro) — teto de entrada cai de 100 para 60 KB; (c) o packet ganha a seção **"APIs internas obrigatórias"** vinda do
   Perfil (wrapper de banco e seus métodos, regra de include/caminho relativo, formato de migration) e a **mini-spec do lote** (o
   que foi ejetado) — as 3 causas dos descartes pós-aplicação; (d) checklist de saída no prompt: "toda função/método que você chamou
   existe no anexo ou na seção de APIs? todo caminho de include existe na árvore listada?".
4. **Escalação pelo placar REAL (junto com o DT-010):** `qwen/qwen3.7-flash` sobe a titular (7 usados em 19, US$ 0,15 nos 50 — o
   melhor custo-benefício medido); `anthropic/claude-haiku-4.5` (1/13, o mais caro) e `qwen/qwen3-coder-next` (0/12) saem;
   `ollama:*` só com modelo ≥ 30B e só como último suplente. Pool titular proposta: `deepseek/deepseek-v4-flash-0731,
   qwen/qwen3.7-flash,google/gemini-3.8-flash` (3 titulares, serial com amostragem do B — DT-010 item 4).
5. **Placar mostra aproveitamento, não vitórias:** `harness-duelo.sh --placar` e o dashboard passam a exibir por modelo
   `usado/venceu/disputou` e custo por diff USADO (hoje o custo por vitória esconde que o haiku gastou US$ 2,19 para 0 usados).

## Critério de aceite

- Em 20 duelos após a mudança: `aplicado` registrado em 100 % dos vencedores; "nenhum diff aplicável" ≤ 10 %; `aplicado ok` ≥ 50 %.
- Nenhum diff W.O. chega ao executor sem nota do themis-solo.
- `--placar` imprime `usado/venceu/disputou` e custo por usado; o teste `tests/t-357-duelo-aproveitamento.mjs` cobre o parser
  do `aplicado`, o casamento normalizado e o themis-solo.

## Arquivos

- `.claude/hooks/harness-duelo.sh` (prompt do worker 298–324; W.O. 470–479; placar 205–260; `--aplicado` 78–96)
- `.claude/hooks/duelo-aplicar.mjs` (casamento normalizado + `@@ ~linha`)
- `.claude/hooks/task-packet.sh --worker` (anexos com número de linha e por trecho; seção "APIs internas obrigatórias")
- `.claude/hooks/guard-agent.sh --post` (lê "Diff do duelo" do relatório e grava `aplicado`)
- `.claude/agents/themis.md` (modo solo), contratos do executor (`CONTRATO-executor.md`: linha obrigatória "Diff do duelo")
- `.claude/hooks/harness-dashboard.mjs` (placar por usado)

## Esforço

Médio-alto (4–6 h): themis-solo (1 h), `aplicado` obrigatório (1 h), casamento normalizado + âncora + linha (1,5 h), packet do
worker por trecho + APIs internas (1,5 h), placar/dashboard (1 h). Validar em 20 duelos reais antes de mexer na pool de novo.

## Resolução parcial (3.5.6, 16/09/2026)

- **Item 2 — `aplicado` sempre registrado:** `CONTRATO-executor.md` exige a linha `**Diff do duelo:** aplicado | parcial | reescrito (motivo) — <id>`;
  `guard-agent.sh --post` lê a linha do relatório e grava `harness-duelo.sh --aplicado` (idempotente), ou cobra a linha quando a task teve
  vencedor. Teste T18.
- **Item 5 — placar por uso:** `harness-duelo.sh --placar` → `PLACAR|<modelo>|disputou|venceu|usado|descartado|desconhecido|custo_usd|custo_por_usado`
  + linha `total` com aproveitamento. Teste T22. (Dashboard ainda mostra vitórias — pendente.)
- **Item 4 — escalação:** haiku-4.5 e qwen3-coder-next saíram dos suplentes; qwen3.7-flash é o 1º suplente (não titular: decisão do
  DT-010 de manter 2 titulares com serial ligado).
- **Item 1 (themis-solo no W.O.) e item 3 (prompt do worker por trecho, âncora curta, casamento normalizado, APIs internas):** diff
  proposto em `prds/RELATORIO-3.5.6-2026-09-16.md` §2 — ligar exige 20 duelos de validação (critério de aceite deste DT).
