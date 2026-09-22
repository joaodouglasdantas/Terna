# DT-007 — JSONL de telemetria corrompido por escrita concorrente sem lock

**Prioridade:** Média
**Status:** Resolvido (implementado direto no mestre, 2026-09-01 — (1) helper novo `_jsonl-append.sh` com `harness_jsonl_append` [lock por mkdir + roubo de lock órfão >30s + timeout ~5s com append garantido]; (2) causa-raiz eliminada: o registro de preflight do delegate era um GRUPO de printfs direto no `>>` — agora monta a linha inteira antes; (3) adotado nos 10 pontos de append [7 do duelo, 2 do delegate, 1 do metrics]; (4) subcomando `harness-metrics.sh sanear` valida linha a linha e move inválidas para `.quarentena` com rewrite atômico sob o mesmo lock. Testado: rajada de 20 appends concorrentes = 20/20 válidas; saneador moveu as 2 linhas corrompidas reais do Mariana em fixture. Limpeza do Mariana real: rodar `sanear` quando as execuções da PRD-133/134 terminarem — NÃO rodar com gravadores ativos)
**Balde:** lote
**Origem:** Auditoria dos merges pós-noite 3.4.10 (Mariana, 01/09/2026) — a sessão PRD-133
achou, ao unir o `harness-delegations.jsonl`, duas linhas de cabeçalho **inválidas** e
idênticas nos dois lados (portanto corrupção antiga da main, não do merge)
**Duplicata:** verificada — a telemetria duplicada da 2.10.0 era outro problema (dedup de
eventos válidos); este é sobre linha INVÁLIDA (INDEX verificado em 2026-09-01)

## Problema (com prova)

Linhas 1-2 do `prds/_metrics/harness-delegations.jsonl` do dra-mariana-duarte:

```
"tag":"""ts":"2026-08-18T22:09:25-03:00",}
"label":"PRD-120","task":"discovery-prds","role":"peter-quill",... (sem "{" de abertura)
```

Assinatura clássica de **dois appends intercalados sem lock**: o começo de um registro foi
sobrescrito/entrelaçado com o fim de outro (18/08, época de sessões paralelas). Vários hooks
gravam nesses arquivos (`harness-metrics.sh`, `_delegate-common.sh`, duelo, presence) a
partir de sessões e subagentes simultâneos — append `>>` em shell não garante atomicidade
entre processos no Windows/Git Bash, especialmente com linhas longas (>4 KB, como as de
delegação com prompt embutido).

Consequência: qualquer parser estrito quebra no arquivo; os leitores atuais
(`harness-dashboard.mjs`, o bloco do placar no `harness-duelo.sh`) sobrevivem porque fazem
`try/catch` por linha — ou seja, **eventos são descartados em silêncio**, distorcendo
métricas sem ninguém saber.

## O que precisa ser feito

- [ ] **Lock no append:** wrapper único de escrita de telemetria (ex.: função em
      `_rag-common.sh`/novo `_metrics-common.sh`) usando lock por `mkdir` (atômico, mesmo
      padrão do `harness-locks/seq` do DT-002) ao redor do append; todos os hooks que gravam
      `*.jsonl` de `_metrics` passam a usá-lo.
- [ ] **Saneamento:** subcomando `harness-metrics.sh doctor` (ou flag no doctor geral) que
      valida o JSONL linha a linha, move inválidas para `*.jsonl.quarentena` com carimbo e
      reporta a contagem — em vez do descarte silencioso dos leitores.
- [ ] **Limpar o caso concreto:** as 2 linhas inválidas do Mariana (main e worktrees) via o
      saneamento acima, no próximo ciclo de manutenção.
- [ ] Conferir os demais gravadores (`harness-duelos.jsonl`, `harness-runs.jsonl`,
      `presence.jsonl`) — mesma classe de risco.

## Arquivos e tabelas relacionados

- `.claude/hooks/harness-metrics.sh`, `.claude/hooks/_delegate-common.sh`,
  `.claude/hooks/harness-duelo.sh`, `.claude/hooks/presence.sh` (gravadores)
- `.claude/scripts/harness-dashboard.mjs` (leitor que ignora em silêncio)
- Evidência: `dra-mariana-duarte/prds/_metrics/harness-delegations.jsonl` linhas 1-2
  (idênticas na main e nos worktrees; datadas de 18/08)

## Esforço

Médio (1-4h) — wrapper de lock + adoção nos gravadores + saneador.
