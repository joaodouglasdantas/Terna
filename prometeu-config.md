---
tipo: referencia
sistema: prometeu
atualizado_em: "2026-08-17"
# ============================================================================
# Config do PROMETEU — a skill que leva o harness DAQUI para os SEUS projetos.
# ----------------------------------------------------------------------------
# Este arquivo é VERSIONADO (vem no repo do harness base). Para ajustar caminhos
# da SUA máquina, crie um `prometeu-config.local.md` ao lado, com o mesmo
# frontmatter — ele sobrescreve este e é gitignored.
# ============================================================================

# Onde está a FONTE (este clone do harness base). Vazio = o PROMETEU detecta:
# a pasta que tem `perfis/` + `.claude/harness-sync.sh`.
fonte: ""

# Pasta onde vivem os seus projetos (usada no modo hub, que varre as subpastas
# diretas). Vazio = o PROMETEU pergunta antes de varrer qualquer coisa.
#   Windows/Laragon: "C:/laragon/www"
#   macOS/MAMP:      "/Applications/MAMP/htdocs"
base_dir: ""

# Quantos projetos diagnosticar por vez (subagentes em paralelo).
lote_paralelo: 5

# Pastas a IGNORAR completamente na varredura (não é projeto, não quer harness,
# repo de terceiro...). A própria fonte já é excluída automaticamente.
blacklist: []

# Projetos que recebem o harness por MERGE DO UPSTREAM (forks de um core, ex.: os
# clones white-label). São diagnosticados e reportados, mas NUNCA sincronizados
# pelo harness-sync.sh — para eles o caminho é o merge do upstream.
via_upstream: []

# Política de push depois de um sync commitado:
#   perguntar (default) | nunca | sempre
# O commit também é sempre perguntado — regra da casa: "commit é SEU".
push: perguntar
---

# PROMETEU — config

Configuração da skill `/prometeu`, que mantém o harness dos **seus** projetos alinhado a este
harness base e porta o harness para projetos novos.

## Como usar

```
/prometeu --pull        atualiza este clone (git pull) antes de qualquer coisa
/prometeu               diagnostica e oferece o sync (modo pelo diretório atual)
/prometeu --check       só o painel
/prometeu --all         varre todos os projetos do base_dir
/prometeu --portar      instala o harness do zero num repo
```

| Onde você abre o Claude Code | Modo | O que acontece |
|------------------------------|------|----------------|
| dentro de **um projeto** com harness | projeto | diagnostica e sincroniza **aquele** repo |
| dentro **deste** repo (o harness base) | hub | varre o `base_dir` e diagnostica todos em paralelo |

## Regras que não se configuram

- **Este repo é READ-ONLY para você.** Ele é um espelho publicado pelo mantenedor do harness; toda
  edição local se perde no próximo `git pull`. Melhoria que deveria virar padrão da casa vai por
  mensagem ao mantenedor — nunca por commit aqui.
- **Commit e push são seus.** O `/prometeu` monta o comando escopado (só os arquivos que o sync
  tocou) e **pergunta**. Nunca `git add -A`.
- **O que é local nunca é sobrescrito:** `PERFIL-PROJETO.md`, `settings.json` /
  `settings.local.json`, `harness.env` (só a linha `HARNESS_VERSION` é atualizada), `memory/`,
  `knowledge/`, `rag/` e as PRDs reais.
- **Projeto sem `.git`** entra no painel, mas o sync exige confirmação individual — sem git não há
  como reverter.

## Depois de sincronizar

O sync imprime `ONBOARDING|<de> -> <para>|…`. Leia a seção **"Decisões por versão"** do
`.claude/ONBOARDING.md` na faixa que o projeto pulou — versão nova pode criar campo no Perfil ou
mudar default — e rode `bash .claude/harness-doctor.sh`.
