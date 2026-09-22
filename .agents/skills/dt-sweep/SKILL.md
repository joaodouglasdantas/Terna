---
name: dt-sweep
description: "Saneia a fila de debitos tecnicos (prds/debito_tecnico/INDEX.md): reclassifica cada DT Pendente em descartar-com-prova / ideia / lote pequeno / PRD, e entrega uma FILA de lotes por area pronta para rodar em sessoes paralelas (/dt-exec). Use quando a lista de DTs virou interminavel, antes de uma rodada de /dt-exec, ou para 'limpar os DTs' de um projeto."
---

<!-- GERADO por .claude/scripts/gen-adapters.sh — NAO EDITE (harness:managed).
     Fonte canonica: .claude/skills/dt-sweep/SKILL.md -->

# dt-sweep — adapter Codex

Este stub existe para o Codex descobrir a skill. O workflow canonico e um so:

1. Leia `.claude/PLATAFORMAS.md` (equivalencias de ferramentas, subagentes e
   eventos para executar o workflow neste runtime).
2. Leia e siga INTEGRALMENTE `.claude/skills/dt-sweep/SKILL.md` — ele e a skill.
   Onde o texto citar ferramenta/evento do Claude Code, aplique a tabela de
   equivalencia do passo 1. O Perfil do Projeto continua a fonte de verdade.
