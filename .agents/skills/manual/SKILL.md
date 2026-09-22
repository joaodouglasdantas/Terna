---
name: manual
description: "Mantém o MANUAL VIVO do software (docs/manual/ — por módulo, dupla face: usuário final + dev) absorvendo em lote as PRDs da fila (_fila.md, alimentada pela cauda da /prd-exec). Na primeira rodada de um projeto (fila cheia, zero módulos escritos) conduz o BOOTSTRAP por módulo, em ondas. Use quando pedirem para atualizar/gerar o manual, processar a fila do manual, documentar features para usuários ou devs, ou no gatilho quinzenal do daily. Projetos com KB própria (Perfil → Manual vivo: kb-portal/seed) delegam a face de usuário ao mecanismo do projeto."
---

<!-- GERADO por .claude/scripts/gen-adapters.sh — NAO EDITE (harness:managed).
     Fonte canonica: .claude/skills/manual/SKILL.md -->

# manual — adapter Codex

Este stub existe para o Codex descobrir a skill. O workflow canonico e um so:

1. Leia `.claude/PLATAFORMAS.md` (equivalencias de ferramentas, subagentes e
   eventos para executar o workflow neste runtime).
2. Leia e siga INTEGRALMENTE `.claude/skills/manual/SKILL.md` — ele e a skill.
   Onde o texto citar ferramenta/evento do Claude Code, aplique a tabela de
   equivalencia do passo 1. O Perfil do Projeto continua a fonte de verdade.
