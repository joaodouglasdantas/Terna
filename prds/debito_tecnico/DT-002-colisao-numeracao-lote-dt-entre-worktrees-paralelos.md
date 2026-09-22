# DT-002 — Colisão de numeração de LOTE e DT entre worktrees/sessões paralelas

**Prioridade:** Alta
**Status:** Resolvido (implementado direto no mestre, 2026-09-01 — subcomando `reservar` no `harness-worktree.sh` + `/dt` Fase 3, `/dt-exec` Passos 2 e 7.4, `/prd` Passo 5; testado com rajada concorrente 2×5 em worktrees, zero duplicata)
**Balde:** lote
**Origem:** 2ª rodada de campo da 3.4.10 (dra-mariana-duarte, 01/09/2026) — 4 sessões paralelas (2× `/dt-exec` em worktrees + 2× `/prd`), monitoradas em tempo real
**Duplicata:** verificada — nenhum DT do mestre cobre numeração concorrente (INDEX verificado em 2026-09-01)

## Problema (com prova)

Cada sessão numera LOTE/DT novo com `max(INDEX local)+1` — e em worktree o INDEX é o
**snapshot do momento do fork**, invisível às irmãs. Resultado medido em produção real
(01/09, `wt-sweep-a` × `wt-sweep-b` rodando `/dt-exec` simultaneamente no Mariana):

- **Dois LOTE-037 diferentes**, um por worktree (`LOTE-037-saneamento-front-manual-e-relatorios`
  no A × LOTE-037 de Anexos/S3+webhook no B), cada um com sua linha "Lotes de DT" no INDEX;
- **Dois DT-541 e dois DT-542 com conteúdos distintos** — A registrou
  `DT-541-influencers-crud-nunca-le-token-do-header` e `DT-542-manual-sumario-drift-pos-lazy-load-imagem`;
  B registrou `DT-541-db-test-sh-nao-respeita-banco-do-worktree` e
  `DT-542-anexos-cadastrar-ignora-retorno-insertsql` (+ 543/544).

O merge de volta exige renumerar um dos lados inteiro: arquivo do lote, arquivos de DT,
linhas do INDEX, recibos de lote nas Observações dos DTs ejetados e telemetria — trabalho
manual e propenso a referência quebrada.

**As PRDs só não colidiram porque a reserva foi manual:** a rodada usou um
`.claude/.harness-run/prd-reserva-numeros.md` escrito à mão antes da decolagem ("cada sessão
declara o número no comando, NUNCA deixar a skill autodescobrir"). Não existe mecanismo
equivalente para LOTE e DT — e a reserva manual não escala.

## Proposta

Aprimorar o que já existe: o `harness-worktree.sh` já mantém um registro **compartilhado**
entre todos os worktrees no git-common-dir (`$COMMON/harness-locks`, usado pelos locks de
DT/PRD). Estender esse mecanismo para numeração:

1. **Contador atômico por série** em `$COMMON/harness-locks/seq/` — subcomando novo
   `harness-worktree.sh reservar <serie>` (`serie` ∈ `DT|LOTE|PRD`) que faz reserva via
   `mkdir` (atômico em POSIX/NTFS): tenta `mkdir seq/DT-541`, se já existe tenta 542, e
   devolve o primeiro número livre ≥ `max(INDEX do checkout principal)+1`. Grava
   `rotulo`/`sessao`/`timestamp` dentro da pasta reservada para auditoria.
2. **Skills consomem a reserva:** `/dt` (registro avulso), `/dt-exec` (Passo 7 — DTs colhidos
   e número do LOTE na largada, junto com o lock dos itens) e `/prd` (número da PRD e das
   fatias) passam a chamar `reservar` em vez de ler só o INDEX local. Fora de worktree o
   comportamento é idêntico ao atual (o principal também enxerga `$COMMON`).
3. **Aposentar a reserva manual:** `prd-reserva-numeros.md` vira registro legado; a skill
   avisa se encontrar um (compatibilidade) mas a fonte é a reserva atômica.

## Arquivos e tabelas relacionados

- `.claude/hooks/harness-worktree.sh` (registro `$COMMON/harness-locks` — base do contador)
- `.claude/skills/dt/SKILL.md`, `.claude/skills/dt-exec/SKILL.md`, `.claude/skills/prd/SKILL.md`
  (pontos que numeram DT/LOTE/PRD hoje lendo só o INDEX local)
- Evidência: `dra-mariana-duarte--wt-sweep-a` e `--wt-sweep-b`, commits de fechamento dos dois
  LOTE-037 (01/09/2026)

## Esforço

Médio (1-4h) — subcomando novo + 3 skills passam a consumi-lo + teste com 2 worktrees
paralelos reservando em rajada.
