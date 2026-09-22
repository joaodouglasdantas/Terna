<!-- harness:managed v2.0.0 — gerenciado pelo harness-sync; para manter conteudo
     proprio do projeto FORA do sync, remova este marcador (o sync passa a
     preservar o arquivo e reportar CONFLITO em vez de atualizar). -->
# AGENTS.md — instruções deste repositório (Codex)

Este repositório usa o **harness Beta Sistemas** (multi-AI). Este arquivo é uma capa
fina: a informação específica do projeto vive nos documentos abaixo — leia sob demanda,
não tente memorizar tudo.

## Fontes de verdade (nesta ordem)

1. **`.claude/PERFIL-PROJETO.md`** — A fonte de verdade do projeto: stack, caminhos de
   CLI, banco de teste, URLs, integrações com efeito colateral, safe-mode, armadilhas,
   estrutura de diretórios. **Leia antes de qualquer trabalho de código.**
2. **`CLAUDE.md`** (raiz, se existir) — convenções de trabalho do repo (valem para
   qualquer agente, não só Claude).
3. **`.claude/PLATAFORMAS.md`** — como executar os workflows do harness no Codex
   (equivalências de ferramentas, subagentes, eventos, presets).
4. **`.claude/memory/MEMORY.md`** — índice da memória versionada do projeto
   (decisões e armadilhas curadas pelo time).

## Workflows (skills)

As skills do harness estão em `.agents/skills/` (invoque com `$nome` ou descrevendo a
tarefa): **prd** (criar PRD completa), **prd-exec** (executar PRD em fases),
**dt** (registrar débito técnico), **codex-review** (review dupla-cega do working tree),
**mockup** (maquete navegável antes do código), **harness-config** (tela de configuração). O corpo canônico de cada uma está em
`.claude/skills/<nome>/SKILL.md` — o stub manda ler; siga o canônico.

## Agentes especializados

Papéis em `.codex/agents/*.toml` (peter-quill: exploração; hefesto: executor de task de
backend; dedalo: autor do front — projeta e ergue a tela; ariadne: maquete antes da spec;
atlas: impacto/arquitetura; tony-stark: inovação; beholder: red-team de PRD; sherlock:
code review; michelangelo: crítica de UI/UX). Delegue a eles quando a skill mandar.

## Regras de segurança (inegociáveis)

- **Nunca** faça `git commit` ou `git push` — a única operação git de escrita permitida
  é `git pull --ff-only` quando uma skill mandar. Mensagem de commit se redige; commit
  não se executa.
- **Integrações com efeito colateral** (WhatsApp/WAHA, Google Calendar, e-mail,
  pagamentos, S3, APIs de IA): confira o **safe-mode** no Perfil ANTES de executar
  qualquer coisa que possa disparar mensagem/cobrança real (Fase 0 da prd-exec).
  Sandbox sem rede é proteção, não defeito.
- **Arquivos temporários**: sempre em `.claude/.harness-run/tmp/` — nunca `/tmp` nem
  caminho de raiz.
- Credenciais e segredos nunca entram em arquivos versionados.

## Validação e definição de "pronto"

- Diagnóstico do harness: `bash .claude/harness-doctor.sh` (zere os `[FALTA]`).
- Lint/testes/E2E: os comandos canônicos estão no Perfil (seções "Lint automático" e
  "Testes E2E") — use-os, não invente variantes.
- Uma task só está pronta com sintaxe validada, verificações da task executadas e
  relatório honesto de desvios (contrato do hefesto). Uma PRD só está pronta após o
  review (dupla-cega quando houver revisor externo) e o acceptance testing.

## Versão do harness

`HARNESS_VERSION` em `.claude/harness.env` (histórico no CHANGELOG da cópia-mestre;
decisões por versão em `.claude/ONBOARDING.md`).
