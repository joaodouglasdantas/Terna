# DT-001 — Régua do placar do duelo contaminada pelo histórico de duelos de PRD

**Prioridade:** Média
**Status:** Resolvido (implementado direto no mestre, 2026-09-01 — bloco do placar no `harness-duelo.sh` agora filtra pela ERA do duelo atual (task `^TASK-` = PRD; resto = lote) e aplica janela `HARNESS_DUELO_PLACAR_JANELA` (default 30, knob documentado no harness.env). Validado contra o jsonl real do Mariana: ANTES = 3 titulares cortados (48 duelos misturados); DEPOIS = 0 cortes na era de lotes (deepseek 5/9 vitórias lá) e os 3 seguem reprovados na era PRD, como devem. Evidência nova incorporada: o pool de 01/09 00:04 repetiu o corte dos 3 antes do fix)
**Balde:** lote
**Origem:** 1ª rodada de campo da 3.4.6-3.4.8 (LOTE-034/035/036 no dra-mariana-duarte, 28/08/2026)
**Duplicata:** verificada — nenhum DT do mestre cobre o placar do duelo (INDEX vazio até aqui)

## Problema (com prova)

A régua do roteamento `placar` (`.claude/hooks/harness-duelo.sh`, bloco "ROTEAMENTO PELO
PLACAR" — regra `s.n>=5 && (s.v/s.n<0.2 || s.na/s.n>0.4)`) avalia o
`prds/_metrics/harness-duelos.jsonl` **inteiro**, sem janela e sem separar task de PRD de
item de lote. No Mariana, o histórico carrega os duelos de task de PRD de 26–27/08 — a era
que a 3.4.5 aboliu justamente porque o juiz reprovava tudo (nota máx 4,5). Resultado medido
28/08 (evento `{"ev":"pool"}` gravado às 22:48): a régua cortou **os 3 titulares de uma vez**
(`deepseek-v4-flash`, `gemini-3.7-flash`, `qwen3-coder-next` — ex.: gemini 21/23 inaplicáveis
no acumulado, mas a maioria da era PRD) e escalou os 2 suplentes, incluindo
`claude-haiku-4.5`, que na rodada foi **10/10 diffs inaplicáveis e custou US$ 1,70 dos
US$ 1,97 do dia** (workers com tools = input caro; teto diário de US$ 2 quase estourou).

## Proposta

Na seleção do placar (o bloco `node -e` do harness-duelo.sh):

1. **Janela:** considerar só os últimos `HARNESS_DUELO_PLACAR_JANELA` duelos (default 30 —
   a régua de revisão do themis já usa 30) em vez do arquivo inteiro; e/ou
2. **Filtro de era:** ignorar eventos cujo `task` casa `^TASK-` quando `HARNESS_DUELO_PRD`
   estiver no default `sim` (duelos de PRD não preveem desempenho em lote).

Mitigação já aplicada por máquina (28/08): suplentes reordenados no `~/.harness.env.local`
do PC do Charles — `qwen3.7-flash, ollama:qwen2.5-coder:7b, claude-haiku-4.5` (o worker
local grátis antes do haiku caro).

## Arquivos e tabelas relacionados

- `.claude/hooks/harness-duelo.sh` (bloco do placar/suplentes)
- `.claude/harness.env` (`HARNESS_DUELO_SUPLENTES`, futuro `HARNESS_DUELO_PLACAR_JANELA`)
- `prds/_metrics/harness-duelos.jsonl` (evidência no Mariana, evento `pool` de 28/08)

## Esforço

Pequeno (< 1h) — mudança localizada no bloco node do placar + knob documentado.
