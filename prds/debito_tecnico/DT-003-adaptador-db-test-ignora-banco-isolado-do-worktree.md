# DT-003 — Adaptador `db-test.sh` dos projetos ignora o banco isolado do worktree

**Prioridade:** Média
**Status:** Resolvido (implementado direto no mestre, 2026-09-01 — `db-test.sh` canônico worktree-aware criado em `.claude/scripts/` [viaja no sync e substitui os adaptadores hardcoded] + README; testado nos 4 caminhos. Propagação aos projetos acontece no próximo /deus; dar baixa no DT-541 do Mariana quando o merge da wt-sweep-b chegar à main)
**Balde:** lote
**Origem:** DT-541 do dra-mariana-duarte (achado incidental do hefesto do LOTE-037/DT-507 na
`wt-sweep-b`, 01/09/2026) — promovido ao mestre por decisão do Charles (01/09)
**Duplicata:** verificada — nenhum DT do mestre cobre os adaptadores de banco (INDEX verificado em 2026-09-01)

## Problema (com prova)

O `db-test.sh` (adaptador por projeto, `.claude/scripts/db-test.sh`, é o que a allowlist de
execução autônoma libera para consultar o banco de teste) tem o banco **hardcoded**
(`DB='cjzawcndgj_local'` no Mariana). Isso ignora o mecanismo de worktrees isolados
(3.4.0, `harness-worktree.sh`), que clona um banco **próprio** por worktree
(`cjzawcndgj_local_wt_sweep_b`, …) justamente para paralelizar sem colisão de dado.

Consequência: qualquer verificação via `db-test.sh` dentro de um worktree (safe-mode
pré-flight do Passo 3.1 de `/dt-exec`/`/prd-exec`, "migration aplicou?", "dado de teste foi
limpo?") consulta na verdade o banco do **checkout principal**. No LOTE-037 só não quebrou
por coincidência: os bancos tinham acabado de ser clonados e os valores ainda batiam — mas
divergem com o tempo, dando falso positivo ou falso negativo silencioso.

## Proposta

1. **Snippet worktree-aware padrão** no adaptador: após o `DB=…` do projeto, ler
   `.claude/.harness-run/worktree.env` (gravado pelo `harness-worktree.sh` na criação do
   worktree; não existe no checkout principal) e usar o campo `db=` quando presente; override
   explícito via `DBTEST_DB` (mesmo padrão de `DBTEST_BIN`/`DBTEST_USER`/`DBTEST_PASS`).
   **Referência de implementação: aplicado no `dra-mariana-duarte` em 01/09/2026**
   (`.claude/scripts/db-test.sh` do checkout principal — commit `fix(harness): db-test.sh
   respeita banco isolado de worktree (DT-541)`).
2. **Propagar** o snippet aos demais projetos com `db-test.sh` (18 na varredura de 01/09:
   3s-regulacao, caronte, clinica-revallie, doce-ana, clones do Taurus, newportaltefnet,
   palantir-app, plataforma-pulso-brasil, sagittarius, site-allyson-bezerra-2026, …) — via
   `/deus` sync se o adaptador virar arquivo do harness com placeholder, ou via edição
   guiada por projeto (o `DB=` de cada um é local).
3. **Documentar o padrão** no README do mestre (seção do wrapper, ~linha 899) e no fluxo de
   porte do `/prometeu`, para projeto novo já nascer com o adaptador worktree-aware.
4. **Varredura de irmãos:** conferir se outros scripts/hooks com banco/URL fixos têm o mesmo
   problema dentro de worktree (o `harness-worktree.sh` cobre os overrides declarados em
   `HARNESS_WT_OVERRIDES`, mas scripts avulsos fora dessa lista ficam de fora).

## Arquivos e tabelas relacionados

- `<projeto>/.claude/scripts/db-test.sh` (adaptador por projeto; Mariana já corrigido — referência)
- `.claude/hooks/harness-worktree.sh` (grava o `worktree.env` consumido pelo snippet)
- `README.md` do mestre (~linha 899 — documentação do wrapper e da allowlist)
- DT de origem: `dra-mariana-duarte` `prds/debito_tecnico/DT-541-db-test-sh-nao-respeita-banco-do-worktree.md`
  (na branch `wt/sweep-b` até o merge; dar baixa lá quando a propagação chegar ao Mariana)

## Esforço

Pequeno (< 1h) para o snippet + documentação; a propagação aos 18 projetos acompanha o
próximo `/deus` ou rodada de manutenção.
