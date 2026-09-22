# DT-004 — Fatiar PRD deve criar o stub das partes -b/-c/-d na hora, não só anotar "pendente"

**Prioridade:** Média
**Status:** Resolvido (implementado direto no mestre, 2026-09-01 — Gate de split da `/prd` materializa stubs -b/-c/-d com os 5 itens da proposta, incluindo o parser robusto a sufixo do item 5)
**Balde:** lote
**Origem:** Decisão do Charles (01/09/2026), observando a rodada PRD-133/PRD-134 do
dra-mariana-duarte na 3.4.10
**Duplicata:** verificada — nenhum DT do mestre cobre o fatiamento de PRD (INDEX verificado em 2026-09-01)

## Problema (com prova)

Quando o teto de tasks força o fatiamento de uma PRD (3.2.0), a skill `/prd` hoje só **anota**
a fatia excedente. Caso real (01/09, PRD-134 do Mariana): a entrevista decidiu
"PRD-134 = DT-426 + DT-255; **PRD-134-b = DT-425 + DT-079, fica pendente no INDEX**;
DT-424 → lote". A fatia `-b` vira uma linha de intenção — o escopo negociado, os DTs
absorvidos e as decisões da entrevista que a motivaram ficam só no transcript da sessão.
Quando alguém for tocar a 134-b (dias depois, outra sessão, outro contexto), reconstrói tudo
de memória — ou pior, reabre a entrevista com o Charles para decidir o que já foi decidido.

## Proposta

Na `/prd`, no momento em que o fatiamento é decidido (fechamento da Fase 1), a skill passa a
**criar imediatamente** o esqueleto de cada fatia excedente, com numeração derivada da fatia
mãe (`PRD-NNN-b`, `-c`, `-d`… — não consome número novo da série, não colide com reserva):

1. **Stub `prds/PRD-NNN-b-<slug>/PRD-NNN-b.md`** contendo: escopo da fatia (o que entrou e o
   que ficou de fora), DTs absorvidos, decisões da entrevista que a afetam (congeladas, com
   data), dependências da fatia mãe ("nasce após PRD-NNN porque X") e o gatilho de início
   sugerido. Marcado `Status: Aguardando fatia mãe` — a `/prd --continuar NNN-b` (ou a
   `/prd PRD-NNN-b`) parte dele com o discovery pré-aquecido, sem re-entrevista.
2. **Linha no `prds/INDEX.md`** com o status distinto (`Aguardando fatia mãe`), para a fila
   ser visível no quadro e a `/dt-sweep`/`/prd` não re-absorverem os mesmos DTs em outra PRD.
3. **DTs absorvidos pela fatia** ganham no INDEX de DTs a marcação
   `Reservado (PRD-NNN-b)` — hoje ficam `Pendente` e nada impede outra sessão de puxá-los
   para um lote enquanto a fatia espera.
4. Vale para todo fatiamento: teto de tasks, decisão de entrevista ("fatia 2 vira PRD
   própria", caso PRD-133 Salas) e split por risco.
5. **Robustez do parser de numeração** (achado da sessão PRD-133 ao criar o primeiro stub,
   01/09/2026): com stubs em disco, o `Glob prds/PRD-*` do Passo 1 da `/prd` passa a listar
   diretórios `PRD-NNN-b-*`. A descoberta do próximo número deve extrair só o prefixo
   inteiro (`PRD-(\d+)`) e ignorar sufixos não-numéricos — um parser que faça `int` do que
   vem depois de `PRD-` quebra ou colide na presença de fatias.

## Arquivos e tabelas relacionados

- `.claude/skills/prd/SKILL.md` (fechamento da Fase 1 — ponto onde o fatiamento é decidido)
- `prds/INDEX.md` e `prds/debito_tecnico/INDEX.md` dos projetos (novos status
  `Aguardando fatia mãe` / `Reservado (PRD-NNN-x)`)
- Casos de referência: dra-mariana-duarte PRD-134/134-b e PRD-133 fatia 2 (01/09/2026)

## Esforço

Médio (1-4h) — passo novo no fechamento da Fase 1 da `/prd` + template do stub + status novos
documentados nos INDEX.
