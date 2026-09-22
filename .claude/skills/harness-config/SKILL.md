---
name: harness-config
description: "Abre o PAINEL do harness deste projeto — tela visual com o ecossistema inteiro (Perfil, presets de esforco e custo, skills, agentes e seus modelos, hooks e flags, convencoes da casa) que GRAVA direto nos arquivos via bridge local. Use para configurar ou ajustar o harness sem editar markdown na mao, para ver o que esta instalado, ou para trocar preset/modelo por velocidade e economia."
---

# Skill: `/harness-config` — o painel do harness

Sobe o **bridge local** e abre a **tela** (`.claude/harness-config.html`): o ecossistema inteiro
do harness deste projeto, visível e editável, com **Salvar** que grava direto nos arquivos —
edição cirúrgica, preservando comentários e o que a tela não expõe.

## Uso

```
/harness-config
```

## Quando usar

- **Instalação nova:** logo após copiar o harness, antes de rodar `/prd`.
- **Após atualização (`/deus`):** versão nova pode trazer campos e decisões; a aba
  **Visão geral** mostra o que ficou pendente.
- **Sob demanda:** "trocar o preset para máximo", "pôr o sherlock em opus", "ligar o lint",
  "quais convenções da casa este projeto já adota".

## Procedimento

### Passo 1 — Perfil existe?

Se `.claude/PERFIL-PROJETO.md` **não** existir, a tela não tem o que editar (ela grava campo a
campo, não cria o arquivo). Pergunte qual perfil base — `php-laragon`, `node-api` ou `generico` —
copie de `perfis/<base>.md` para `.claude/PERFIL-PROJETO.md` e siga.

### Passo 2 — Subir o bridge

```bash
node .claude/harness-ui.mjs
```

Ele imprime a URL com o token da sessão (`http://127.0.0.1:7337/?t=…`). Entregue **essa** URL —
sem o token as rotas de dados respondem 403. Porta ocupada: ele tenta as 10 seguintes. Encerra
sozinho após 30 min sem uso.

No Claude Code com preview, abra a URL no painel para acompanhar junto.

**Sem `node` na máquina?** Abra o `.claude/harness-config.html` direto no navegador (o Apache do
Laragon serve `.claude/`). A tela detecta a ausência do bridge e cai no **modo leitura**: o dev
preenche e usa "Copiar p/ o Claude" — aí você aplica o JSON (ver Passo 4).

### Passo 3 — O que o dev faz na tela

Sete abas: **Visão geral** (estado + diagnóstico + doctor), **Perfil**, **Esforço & custo**
(presets, matriz e override por agente), **Skills**, **Agentes** (modelo efetivo + alerta de
agente invisível), **Hooks & flags** (wiring + `HARNESS_*`) e **Convenções** (biblioteca da casa
+ estado de adoção deste projeto).

Só o que ele **alterar** é gravado. Todo write faz backup em
`.claude/.harness-run/ui-backup/<timestamp>/`.

### Passo 4 — Aplicar o modo leitura (só sem bridge)

O dev cola um bloco `json` com `{versao, preset, campos, env}`. Edite
`.claude/PERFIL-PROJETO.md` e `.claude/harness.env` **campo a campo** — os ids batem 1:1 com o
`PERFIL_MAP` do `.claude/harness-ui.mjs`. **Nunca regenere os arquivos**: o Perfil tem seções que
a tela não expõe (allowlist de execução autônoma, integrações detalhadas, plataformas) e o
`harness.env` é majoritariamente documentação — regenerar destrói as duas coisas.
**Camadas (3.5.7):** uma chave do bloco `env` que seja DECISÃO do harness (não está na lista de
projeto de `hooks/_camadas.txt`) vai para `hooks/_defaults.env` quando o repo é o mestre
(`.claude/harness-role`); num projeto, grave-a no `harness.env` com a linha
`# override consciente (3.5.7) — default do harness em hooks/_defaults.env: CHAVE='<default>'` em cima.
Chave de MÁQUINA (`hooks/_camadas.txt`, camada `maquina`) vai para `harness.env.local`, nunca para o
`harness.env`. Com bridge, o `harness-ui.mjs` faz esse roteamento sozinho.

### Passo 5 — Fechar

Rode `bash .claude/harness-doctor.sh` e reporte `[FALTA]`/`[WARN]`. A própria tela roda o doctor
pelo botão da barra inferior (leva ~20s).

## Regras

- **A tela nunca cria o Perfil do zero** — ela edita o existente. Perfil ausente = Passo 1.
- **`harness-config.html` e `harness-ui.mjs` são template versionado**: só o `/deus` os atualiza.
  Não os edite num projeto-alvo — a alteração vira `EXTRA|alvo|` e some no próximo sync.
- **O bridge só escuta em `127.0.0.1`**, com token por execução e allowlist fixa de escrita
  (Perfil, PERFIL-RESUMO, harness.env, settings.json — e convenções apenas no mestre). Não o
  exponha na rede nem passe o token adiante.
- **Convenções são somente-leitura fora do mestre.** Criar/editar convenção é `/convencao nova`
  no vault; aqui a tela só marca o **estado de adoção** deste projeto.
- **Segredo de produção nunca entra** — o Perfil é versionado. Só credencial local.
- Mudou o `PERFIL-PROJETO.md`? O `PERFIL-RESUMO.md` precisa acompanhar na mesma passada.
