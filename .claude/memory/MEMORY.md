# Memória do Projeto

> **O que é este arquivo.** Este é o índice da **memória versionada do projeto**. Os
> arquivos `.md` desta pasta (`.claude/memory/`) são copiados, a cada início de sessão,
> para a memória pessoal do Claude Code (`~/.claude/projects/<slug>/memory/`) pelo hook
> `.claude/hooks/sync-memory.sh`. Assim, conhecimento curado do projeto **viaja junto com
> o repositório** — qualquer dev que clonar o repo recebe estas memórias.
>
> **Diferença para a memória pessoal:** a memória pessoal (auto-memory) é por-usuário e
> NÃO versionada. Esta pasta é versionada e compartilhada pelo time. Use-a para o que todo
> mundo do projeto deveria saber (convenções não óbvias, decisões de arquitetura, armadilhas
> recorrentes), não para preferências individuais.
>
> ⚠️ **Atenção:** o `sync-memory.sh` **sobrescreve** arquivos de mesmo nome na memória
> pessoal. Não coloque aqui nada que conflite com memórias pessoais que você quer preservar.

## Como adicionar uma memória

1. Crie um arquivo nesta pasta seguindo `_TEMPLATE-memoria.md` (frontmatter `name`,
   `description`, `metadata.type` + corpo).
2. Adicione **uma linha** no índice abaixo: `- [Título](arquivo.md) — gancho de uma linha`.
3. Mantenha o índice enxuto (uma linha por memória).

## Índice

<!-- Ainda não há memórias versionadas. Adicione a primeira seguindo o passo acima. Exemplos:
- [Convenções de envio assíncrono](feedback_envio_idempotente.md) — sempre marcar enviado na criação.
- [Decisão: soft delete em todo o schema](project_soft_delete.md) — por quê e onde aplica.
-->
