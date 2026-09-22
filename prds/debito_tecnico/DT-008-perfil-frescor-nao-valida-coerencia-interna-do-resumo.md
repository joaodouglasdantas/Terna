# DT-008 — `perfil-frescor.sh` carimba FRESCO sem validar a coerência interna do RESUMO

**Prioridade:** Média
**Status:** Resolvido (implementado direto no mestre, 2026-09-01 — detector no `perfil-frescor.sh` com a heurística DE PARES da sessão PRD-134: dois itens de lista compartilhando 3+ termos entre crases = redações da mesma informação [a formulação "1 termo em 3+ itens" foi testada e descartada: 9 falsos positivos no RESUMO real — `NULL` em 4 itens é normal]. Avisos em STDERR preservando o contrato de stdout; expostos SÓ no `--carimbar` (o ato de consolidar) e no modo avulso `--coerencia` — na verificação rotineira seria alarme crônico banalizado (4 FP residuais medidos em itens vizinhos legítimos de ACL). Testado: fixture com 3 redações → 3 pares detectados, pares complementares [2 termos] preservados, rotineira limpa)
**Balde:** lote
**Origem:** Auditoria pós-merge da noite 3.4.10 (Mariana, 01/09/2026) — o auto-merge de 3
branches deixou o `PERFIL-RESUMO.md` da main com TRÊS redações da mesma informação
(storage state `pw-storage.json`, L82/85/87) e o carimbo seguiu `FRESCO`. Diagnóstico de
classe formulado pela sessão PRD-134 ao consolidar (commit `020b5c7f` no Mariana)
**Duplicata:** verificada — nenhum DT do mestre cobre o frescor do resumo (INDEX verificado em 2026-09-01)

## Problema (com prova)

O carimbo do `perfil-frescor.sh` prova UMA garantia: "o resumo foi regenerado depois da
última mudança do Perfil" (hash da FONTE). Ele **não** prova a segunda, diferente:
"o resumo está internamente coerente". O merge de N branches quebra a segunda sem tocar na
primeira — cada branch adiciona a mesma informação com redação própria, nenhuma linha é
literalmente igual, o git auto-mergeia sem conflito, e o carimbo continua válido porque a
fonte não mudou. Caso medido (01/09): 3 redações do storage state empilhadas no RESUMO da
main (e do wt/prd-salas), fonte limpa com 1 menção, carimbo `FRESCO` nas duas pontas.
Nem o carimbo, nem o git, nem o diff de merge acusam — só a auditoria manual pós-merge
achou.

Vai se repetir: toda vez que 2+ branches paralelas tocarem o RESUMO (o que a era de
worktrees 3.4.x torna rotina), a consolidação volta a ser manual.

## Proposta

Check de coerência do derivado no próprio `perfil-frescor.sh` (heurística validada em campo
pela sessão PRD-134 — achou o caso em uma passada, com 1 falso positivo descartável de
leitura):

1. **Detector de redação empilhada:** termo entre crases (`` `termo` ``) citado em **3+
   itens de lista** do RESUMO vira aviso `DERIVADO|redacao-empilhada|<termo>|<linhas>` na
   saída do frescor (não bloqueia — itens legitimamente complementares existem, ex.:
   storage state fora de spec × login dentro de spec).
2. **Gancho no fluxo de merge:** as instruções de merge das skills (e o doctor) mandam rodar
   o frescor após merge que tocou `.claude/PERFIL-RESUMO.md` e LER os avisos — consolidar
   redações antes de recarimbar.
3. Documentar no header do hook a distinção das duas garantias (frescor da fonte ×
   coerência interna) para ninguém voltar a ler o carimbo como prova do que ele não prova.

## Arquivos e tabelas relacionados

- `.claude/hooks/perfil-frescor.sh` (o check novo)
- Skills que orientam merge/fechamento de worktree (nota sobre rodar o frescor pós-merge)
- Evidência: dra-mariana-duarte `PERFIL-RESUMO.md` (consolidações `020b5c7f` na main e
  `8b3be92f` no wt/prd-salas, 01/09/2026)

## Esforço

Pequeno (< 1h) — heurística de grep/awk no hook + 1 linha de documentação nas skills.
