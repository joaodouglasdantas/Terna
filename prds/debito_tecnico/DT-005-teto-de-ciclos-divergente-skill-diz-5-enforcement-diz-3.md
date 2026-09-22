# DT-005 — Teto de ciclos divergente: skill/agentes dizem "teto absoluto 5", enforcement diz 3

**Prioridade:** Média
**Status:** Resolvido (implementado direto no mestre, 2026-09-01 — textos da `/prd` e dos agentes beholder/michelangelo alinhados ao knob `HARNESS_REVIEW_MAX_CICLOS`, default 3)
**Balde:** lote
**Origem:** Sessão PRD-134 do dra-mariana-duarte (01/09/2026, madrugada) — no momento exato de uma
parada 10.3 com achado sobrevivente (N2), o `guard-agent.sh` recusou o ciclo 4 citando "teto
absoluto 3 (HARNESS_REVIEW_MAX_CICLOS)" enquanto a skill `/prd` citava "teto absoluto 5" em
vários pontos. A divergência confunde o operador na hora exata em que ele precisa decidir.
**Duplicata:** verificada — nenhum DT do mestre cobre o teto de ciclos (INDEX verificado em 2026-09-01)

## Problema (com prova)

A 3.3.0 (S5) baixou o teto absoluto de ciclos de gate para **3** e a 3.4.3 o transformou em
enforcement mecânico (`guard-agent.sh:85` e `external-review.sh:73`, ambos
`${HARNESS_REVIEW_MAX_CICLOS:-3}`). A própria `/prd` diz "TETO ABSOLUTO 3 desde a 3.3.0"
na linha do limite de ciclos — mas o texto legado da era 2.3.0 sobreviveu em ~10 pontos:
"ao fim do 5º ciclo", "`Ciclo: N de L (teto absoluto 5)`" (no molde do cabeçalho de
REVIEW-*.md e nos templates de prompt do red-team e do gate de UX), "o teto de 5 vale COM
limite 0", "o teto absoluto de 5 ciclos for atingido" — e nos agentes `beholder.md` e
`michelangelo.md` ("teto absoluto 5" no formato do cabeçalho). Resultado observado em campo:
o hook nega no ciclo 4 e o operador (humano ou sessão) tem na frente uma skill que o
autorizava até o 5º.

## Correção aplicada

Todos os textos passam a referenciar o knob, não um número fixo: "teto absoluto =
`HARNESS_REVIEW_MAX_CICLOS` (default 3)". O molde do cabeçalho de REVIEW vira
`Ciclo: N de L (teto absoluto <valor efetivo do knob>)`. Nenhuma mudança de comportamento —
o enforcement já era 3; só a documentação mentia.

## Arquivos e tabelas relacionados

- `.claude/skills/prd/SKILL.md` (~linhas 1422-1437, 1487, 1505, 1519, 1553, 1589)
- `.claude/agents/beholder.md`, `.claude/agents/michelangelo.md` (molde do cabeçalho de ciclo)
- Enforcement (inalterado): `.claude/hooks/guard-agent.sh`, `.claude/hooks/external-review.sh`

## Esforço

Pequeno (< 1h) — só texto; enforcement já estava certo.
