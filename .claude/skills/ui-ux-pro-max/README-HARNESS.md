# ui-ux-pro-max — skill de TERCEIRO versionada no harness

> **Não edite nada nesta pasta.** É uma cópia fiel de uma skill externa. Qualquer ajuste local
> se perde na próxima atualização — e, pior, faz o projeto divergir em silêncio dos outros.

## Por que ela mora aqui (2.9.0)

Até a 2.8.0 esta skill vivia **só** em `~/.claude/skills/ui-ux-pro-max/` — ou seja, na máquina
de quem instalou. O Passo 7 da `/prd` mandava "conduza o design com a skill UI UX Pro Max", e em
qualquer máquina que não fosse a do Charles esse passo **degradava em silêncio**: a sessão seguia,
o design saía sem base, ninguém era avisado. Versionando aqui, ela viaja com o `/deus` para todos
os projetos portados, junto com o `dedalo` (que a consome).

Custo: ~1,8 MB, 37 arquivos, zero dependência além de Python 3.

## Como o harness a usa

Quem chama é o agente **`dedalo`** (`.claude/agents/dedalo.md`) — e, para o partido visual da
maquete, o **`ariadne`**. Nenhum dos dois depende do mecanismo de skills do host: eles rodam o
script direto, o que funciona igual no Claude Code e no Codex.

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<produto> <indústria> <keywords>" \
  --design-system --persist -p "<Projeto>" [--page "<tela>"]
```

**Resolução de caminho** (nesta ordem — o agente tenta e para no primeiro que existir):

1. `.claude/skills/ui-ux-pro-max/scripts/search.py` — esta cópia, a canônica;
2. `~/.claude/skills/ui-ux-pro-max/scripts/search.py` — instalação global antiga;
3. nenhuma → **degradar barulhento**: seguir com o design ancorado só no Perfil + telas
   existentes e **declarar no relatório** que rodou sem a base. Nunca fingir que consultou.

**Interpretador:** tente `python3` e caia para `python` (no Windows/Laragon costuma ser `python`).

## Como atualizar

Substitua a pasta inteira pela versão nova da origem, preservando este README:

```bash
cp -r <origem>/ui-ux-pro-max/. .claude/skills/ui-ux-pro-max/
find .claude/skills/ui-ux-pro-max -type d -name __pycache__ -exec rm -rf {} +
```

Depois rode `bash .claude/scripts/gen-adapters.sh` (ela está na lista de skills de terceiro —
não gera stub Codex) e propague com o `/deus`.

## O que ela oferece

85 estilos, 161 paletas, 74 pares tipográficos, 161 tipos de produto, 99 diretrizes de UX, 25
tipos de gráfico e 16 stacks (inclui Angular, Laravel e Three.js). O que importa para o harness são dois comandos: `--design-system` (recomendação completa
com raciocínio + anti-padrões) e `--domain <ux|color|typography|style|landing|chart|web>` para
aprofundar. O detalhe está no `SKILL.md` ao lado.
