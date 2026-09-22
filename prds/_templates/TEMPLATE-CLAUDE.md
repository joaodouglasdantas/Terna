<!--
  TEMPLATE-CLAUDE.md — doc raiz de convenções do projeto.

  COMO USAR: copie este arquivo para a RAIZ do repositório-alvo como `CLAUDE.md`
  (o Claude Code carrega esse nome automaticamente). Ajuste o que estiver entre <...>.
  Apague este comentário no arquivo final.

  PRINCÍPIO: este arquivo é CURTO e fala de COMO TRABALHAR no repo. Os FATOS do projeto
  (stack, caminhos, banco, integrações, armadilhas, timezone) ficam em
  `.claude/PERFIL-PROJETO.md` — a fonte de verdade. NÃO duplique aqui o que já está lá;
  aponte para lá.
-->

# <Nome do Projeto> — Convenções (CLAUDE.md)

> **Projeto multi-AI (Claude Code + Codex CLI):** mantenha também um `AGENTS.md` na raiz —
> capa fina equivalente para o Codex (o `harness-sync.sh` instala um gerenciado, com marcador
> `harness:managed`). Os dois apontam o Perfil como fonte de verdade — **nunca duplique
> conteúdo entre eles**.

## Fonte de verdade: leia o Perfil primeiro

Antes de qualquer tarefa, leia **`.claude/PERFIL-PROJETO.md`**. Ele define a stack, os
caminhos do CLI, o banco de teste local, a baseURL, as integrações com efeito colateral,
o login de teste E2E, o timezone, a compatibilidade de produção, a estrutura de
diretórios e as **armadilhas do projeto**. Tudo que for específico deste projeto está lá —
este `CLAUDE.md` só descreve como nos comportamos no repo.

## Como trabalhar aqui

- **Idioma:** responda e escreva em **Português (Brasil)**, com acentuação correta.
- **Fluxo de trabalho via skills:**
  - `/prd <demanda>` → cria a PRD completa (produto, técnica, tasks, prompt de execução).
  - `/prd-exec` → executa a PRD (implementa, roda review do Codex, gera roteiro de teste).
  - `/codex-review` → review de código avulso do *working tree*.
  - `/dt <problema>` → registra um débito técnico.
- **Não commitar nem dar push.** Quem versiona é a pessoa, manualmente. Você prepara a
  mensagem de commit (Fase 3 da `/prd-exec`), mas **não executa** `git commit`/`git push`.
- **UI/telas:** para qualquer trabalho de interface (páginas, componentes, layout,
  *design system*), use a skill **UI UX Pro Max** (instalada no repo — ver README do
  harness). Ela ativa sozinha em pedidos de UI.
- **Datas de negócio vêm da origem**, nunca do relógio do servidor/banco. Detalhes e
  timezone em `PERFIL-PROJETO.md` → *Timezone e datas de negócio*.
- **Respeite a runtime de produção** (pode ser mais antiga que a local). Restrições em
  `PERFIL-PROJETO.md` → *Compatibilidade de produção*.
- **Antes de "consertar" um achado do Codex**, confira contra `PERFIL-PROJETO.md` →
  *Armadilhas do projeto*: é a régua que separa bug real de falso positivo.

## Mapa rápido

Onde as coisas ficam (caminhos reais em `PERFIL-PROJETO.md` → *Estrutura de diretórios*):

- Endpoints/API, páginas/views, JS de página, migrations e mapa do schema → ver o Perfil.
- PRDs em `prds/` (índice em `prds/INDEX.md`); débitos técnicos em
  `prds/debito_tecnico/` (índice em `prds/debito_tecnico/INDEX.md`).
- Memória versionada do projeto em `.claude/memory/` (índice `MEMORY.md`).

## Notas específicas deste projeto

<!-- Espaço livre para regras que NÃO cabem no Perfil e valem para todo o repo.
     Ex.: "o módulo financeiro está congelado até a auditoria de jun/2026";
     "não tocar em legado/ sem combinar". Mantenha curto. -->

- `<adicione aqui ou apague esta seção>`
