# DT-009 — Presença: subagentes viram cartões duplicados no Caronte (e são o dado dos "bonequinhos")

**Prioridade:** Média
**Status:** Resolvido no lado HARNESS (2026-09-01 — `presence.sh` e `presence.mjs` em paridade detectam subagente pelo `transcript_path` (`/subagents/`), leem `agentType` do `.meta.json` ao lado e acrescentam `"agent":1,"agent_name","parent_session"` ao payload; sessão humana continua byte a byte no v1. Testado E2E com servidor local: subagente real hefesto da exec-134 marcado nos dois clientes, humano sem campos extras, fila offline drenando. Propagado a quente ao Mariana. O lado CARONTE — agrupar no cartão do pai + bonequinhos — segue no card/PRD gerado para o Charles levar ao projeto de lá em 01/09)
**Balde:** lote
**Origem:** Print do painel do Caronte (Charles, 01/09/2026): "10 sessões agora" com vários
cartões repetidos por repo — investigado ao vivo durante as execs da PRD-133/134
**Duplicata:** verificada — nenhum DT cobre presença (INDEX verificado em 2026-09-01)

## Problema (com prova)

O `presence.sh`/`presence.mjs` já bloqueia executores EXTERNOS (`HARNESS_IN_EXTERNAL_*`),
mas **subagente NATIVO do Claude Code** (Agent tool — hefesto, dedalo, sherlock…) dispara os
mesmos hooks com `session_id` PRÓPRIO — e o presence pinga cada um como se fosse uma sessão
de dev. Medido no print de 01/09: os cartões `c4865e72`, `4076098b`, `8939625c`, `36f7bb29`,
`b1b70e26` **não existem como transcript de sessão** (são session_ids efêmeros de subagente;
`b1b70e26` pingou às 10:24 = exatamente o despacho da Onda 2 da exec-134) — cada um vira um
cartão "Ativo" que morre como "Sem sinal" quando o subagente termina. O painel infla
("10 sessões agora" ≈ 4 humanas + 6 subagentes mortos) e o semáforo mente.

**Detecção barata e determinística:** o input JSON dos hooks traz `transcript_path`; o
transcript de subagente vive em `~/.claude/projects/<slug>/<UUID-DA-SESSAO-PAI>/subagents/agent-*.jsonl`.
Basta o path conter `/subagents/` → é subagente, e o `parent_session` é o nome do diretório pai.

## Proposta (o fix e a feature são o mesmo payload)

1. **presence.sh/mjs:** ao montar o ping, se `transcript_path` casa `/subagents/` →
   acrescentar `"agent":1,"parent_session":"<uuid-pai>"` ao payload (e derivar o nome do
   agente do basename, se disponível no meta.json ao lado). Payload de sessão humana fica
   idêntico — retrocompatível; servidor antigo só ignora os campos.
2. **Caronte (servidor/painel):** ping com `agent:1` NUNCA vira cartão — vira contador do
   cartão do `parent_session`. UI: bonequinhos animados no cartão ("🤖×3 agentes
   trabalhando"), decaindo quando o agente para de pingar (TTL curto, ex. 3 min — o
   heartbeat throttled já existe). Zero custo novo para a equipe: nenhum processo, nenhum
   polling, nenhum campo obrigatório — é o MESMO ping que já sai hoje, com 2 campos a mais,
   e o volume até CAI (o throttle por sessão passa a agrupar por pai, opcional).
3. **Doctor:** `--presence` ganha uma linha mostrando quantos pings de subagente saíram
   (prova de que a marcação funciona).

## Arquivos e tabelas relacionados

- `.claude/hooks/presence.sh` e `.claude/hooks/presence.mjs` (marcação — lado harness)
- Caronte: endpoint de presença + painel (agrupamento + bonequinhos — lado equipe/Derick)
- Evidência: print de 01/09 + `presence-last-ping-*` do Mariana (uuids sem transcript)

## Esforço

Pequeno (< 1h) no lado harness; o lado Caronte é um card próprio no projeto dele
(agrupar por `parent_session` + animação).
