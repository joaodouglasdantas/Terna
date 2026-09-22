# Harness padrão — Beta Sistemas

> **Versão 3.5.7** (carimbada em `.claude/harness.env` — histórico em
> [CHANGELOG.md](CHANGELOG.md)). Desde a 2.0.0 o harness é **multi-AI**: roda em
> **Claude Code**, em **Codex CLI**, ou nos dois — ver a seção
> [Multi-AI](#multi-ai-claude-code--codex). Para saber a versão de um repo já portado,
> rode `bash .claude/harness-doctor.sh` lá e compare com esta.
>
> **É dev e só vai usar o harness num projeto já portado?** Comece pelo
> [QUICKSTART-DEV.md](QUICKSTART-DEV.md) (1 página).
>
> **Vai instalar ou acabou de receber uma atualização do harness?** O checklist de
> decisões (modelos dos agentes/custo de tokens, lint, RAG, Codex) vive em
> [`.claude/ONBOARDING.md`](.claude/ONBOARDING.md) — ele viaja com o port e tem a
> seção "Decisões por versão" para você saber **o que mudou e o que ajustar**.

Cópia-mestre do *harness* do Claude Code (skills, hooks, templates de PRD/DT, memória
versionada e sistema de perfis). A ideia é **copiar esta pasta para qualquer repositório
novo** e ter, de imediato, o mesmo fluxo de trabalho de PRD → execução → review → débito
técnico que já usamos nos projetos — sem reescrever nada, só ajustando **um** arquivo de
perfil.

> **Por que existe.** Antes ficávamos copiando o `.claude/` de um projeto para outro na
> mão, e cada cópia trazia caminhos/credenciais/regras do projeto de origem grudados no
> meio das skills. Aqui o núcleo é 100% **stack-agnóstico**: skills, hooks e templates
> leem tudo de `.claude/PERFIL-PROJETO.md`. Portar = copiar + preencher o perfil.

---

## Índice rápido

1. [Multi-AI: Claude Code × Codex](#multi-ai-claude-code--codex) ← o que mudou na 2.0.0
2. [Estrutura da pasta](#estrutura-da-pasta)
3. [Como portar para um repositório novo](#como-portar-para-um-repositório-novo) ← comece aqui
4. [`/prometeu` — atualizar e portar sozinho](#prometeu--atualizar-e-portar-sozinho) ← novo na 3.0.4
5. [Onboarding: decisões de instalação e atualização](#onboarding-decisões-de-instalação-e-atualização)
6. [Doctor: validar a portabilidade](#doctor-validar-a-portabilidade)
7. [O Perfil é a única fonte de verdade](#o-perfil-é-a-única-fonte-de-verdade)
8. [Perfis prontos](#perfis-prontos)
9. [As 9 skills](#as-9-skills)
10. [Convenções da casa](#convenções-da-casa) ← novo na 2.7.0
11. [Skill externa obrigatória — UI UX Pro Max](#skill-externa-obrigatória--ui-ux-pro-max)
12. [Hooks e `harness.env`](#hooks-e-harnessenv)
13. [Permissões e `.gitignore`](#permissões-e-gitignore)
14. [Onde vivem os "agents"](#onde-vivem-os-agents)
15. [Sistema de memória (dupla)](#sistema-de-memória-dupla)
16. [RAG e captura de conhecimento (opt-in)](#rag-e-captura-de-conhecimento)
17. [Templates de PRD / Task / DT / Roadmap](#templates-de-prd--task--dt--roadmap)
18. [Pré-requisitos](#pré-requisitos)
19. [Bypasses de emergência](#bypasses-de-emergência)
20. [Como manter esta cópia-mestre](#como-manter-esta-cópia-mestre)

---

## Multi-AI: Claude Code × Codex

Desde a **2.0.0** o harness roda em **Claude Code**, em **Codex CLI**, ou nos dois. O
princípio que segura isso sem divergência: o **corpo canônico** de cada peça vive num
lugar só — `.claude/skills/*/SKILL.md` e `.claude/agents/*.md` — e o que existe para o
Codex são **adapters finos** que apontam para ele: stubs `.agents/skills/` gerados pelo
`gen-adapters.sh`, TOMLs em `.codex/agents/` e o `AGENTS.md` como capa da raiz. **Nunca
edite um adapter gerado** — edite o canônico e regenere. O documento canônico de
equivalências (superfícies, vocabulário de ferramentas, eventos, modelos) é o
[`.claude/PLATAFORMAS.md`](.claude/PLATAFORMAS.md) — esta seção é o resumo.

**Modos de operação** — dois dials independentes no `harness.env`:

- **`HARNESS_TARGETS`** (`claude` | `codex` | `claude,codex`) — quais **superfícies** o
  repo mantém instaladas; o `harness-sync.sh` e o doctor leem daqui. Default `claude`
  (nada muda para quem não quer Codex).
- **`HARNESS_HOST`** (`auto` | `claude` | `codex`) — em qual runtime a **sessão atual**
  está rodando. `auto` detecta pelos sinais do ambiente
  (`.claude/hooks/_host-detect.sh`), com fallback `claude`. É ele que decide, por
  exemplo, quem é o revisor externo da dupla-cega.

Na prática: **modo claude** (targets=claude — o comportamento histórico), **modo codex**
(targets=codex — só a superfície Codex instalada), **modo multi** (targets=claude,codex —
as duas superfícies, cada sessão detectada via `HARNESS_HOST=auto`).

| Capacidade | Claude | Codex | Núcleo compartilhado | Observações |
|---|---|---|---|---|
| Instruções do repo | `CLAUDE.md` (raiz) | `AGENTS.md` (raiz; teto 32 KiB combinados) | Perfil + convenções | os dois são capas finas que apontam o Perfil |
| Skills | `.claude/skills/` (`/prd`…) | stubs `.agents/skills/` (`$prd` ou invocação implícita pela description) | corpo canônico em `.claude/skills/` | stubs GERADOS (`gen-adapters.sh`) — nunca editar à mão |
| Agentes | `.claude/agents/*.md` (Agent tool) | `.codex/agents/*.toml` (subagentes nativos; `max_depth=1`) | corpo canônico em `.claude/agents/` | TOML **sem** campo `model` (herda da sessão); dial = `model_reasoning_effort` |
| Hooks | wiring em `.claude/settings.json` | wiring em `.codex/hooks.json` (só eventos que existem lá; sem `async`; trust por hash) | scripts em `.claude/hooks/` | eventos sem equivalente (`SessionEnd`, `Notification`, `PermissionDenied`, `PostToolUseFailure`) = **N/A explícito** — tabela §4 do PLATAFORMAS.md |
| Permissões / classificador | allowlist estreita no settings.json + classificador em auto mode | sandbox + `approval_policy` + `.codex/rules/` (determinístico; **sem** classificador) | tabela "Execução autônoma" do Perfil | `--gen-allowlist` (Claude) e `--gen-rules` (Codex) derivam da MESMA tabela — nunca copie uma allowlist na outra |
| Review dupla-cega | sherlock + Codex CLI externo | sherlock (agente Codex) + `claude -p` externo | `external-review.sh` + limite de ciclos do Perfil | sem CLI externo = **modo solo** registrado (nunca descrito como dupla-cega) |
| RAG — embeddings/busca | ✅ local (MiniLM/sqlite-vec) | ✅ local (idem) | scripts TS + `.claude/knowledge/` | 100% local nos dois hosts |
| RAG — resumo | provider `claude-cli`/`anthropic` | provider `codex-cli` (ou os demais) | `summarize.ts` (+ `mock`/`disabled`) | o resumo **envia o transcript ao provider** (Anthropic OU OpenAI) |
| RAG — captura | `SessionEnd` + `PostToolUse[Agent\|Task]` (async) | `Stop` com **throttle** + `SubagentStop` (síncronos) | `_rag-common.sh` + extrator genérico de transcript | `HARNESS_RAG_STOP_THROTTLE_MIN` (default 30 min) |
| Memória | `.claude/memory/` + espelho `~/.claude` (`sync-memory.sh`) | `.claude/memory/` lida direto (ponteiro no AGENTS.md) | `.claude/memory/` versionada | o espelho é adapter do host Claude (no-op nos outros) |
| Telemetria | tokens/gaps do transcript `~/.claude/projects` | best-effort sobre `~/.codex/sessions` (`n/d` sem parse) | `harness-runs.jsonl` + campo `platform` | **não comparar números entre plataformas** |
| Evidência visual (UX) | **Playwright headless** (canônico) + pane como sonda de 1 tentativa | **Playwright headless** (canônico) + browser integrado como sonda | `npx playwright screenshot`/`test` → PNG na pasta do Perfil (**PLATAFORMAS.md §7**) | evidência é **arquivo**, nunca janela; sem Playwright e sem sonda: degrada p/ análise estática **e declara** no relatório |
| Propagação | `harness-sync.sh --target claude` | `--target codex` | `--target all` + `HARNESS_TARGETS` do alvo | `AGENTS.md`/`.codex/hooks.json` só com marcador `harness:managed` (senão `CONFLITO\|`) |
| Doctor | checks clássicos | matriz Codex (adapters, trust, rules) | `harness-doctor.sh` por `HARNESS_TARGETS` | confere paridade name/description dos adapters |
| Anti-espiral / denied / notify | ✅ (defesas 1.8.0/1.9.0) | 🚫 **N/A por design** | — | não há classificador nem os eventos no Codex; a aprovação lá é determinística — as guardas ficam dormentes |

### Multi-CLI: delegar mini-tasks a um CLI externo (3.0.0)

A 2.0.0 tornou o harness capaz de **rodar** em dois runtimes. A 3.0.0 vai um passo além: a sessão
principal pode **despachar parte do próprio trabalho** para um CLI externo já autenticado na
máquina — hoje o Codex CLI (`codex exec`) e o Claude CLI (`claude -p`). Sem API direta, sem chave
de API, sem segundo login: os mesmos CLIs que você já usa.

O caso de uso que motivou isso: **quando a conta Claude está apertada, mandar o trabalho mecânico
para o Codex e deixar o Claude orquestrando.** Um dial resolve o pacote:

| `HARNESS_DELEGATE_MODE` | O que sai da sessão | Arrasta |
|---|---|---|
| `off` *(default)* | nada — comportamento idêntico ao pré-3.0.0 | — |
| `apoio` | mapeamento mecânico (schema, código, PRDs anteriores) | verbosidade `conciso` |
| `economia` | todo o read-only da `/prd` (+ inovação, impacto, red-team) | verbosidade `minimo`, fallback `perguntar` |

```bash
HARNESS_DELEGATE_MODE=economia claude     # virada pontual, sem editar nada
```

Três coisas que valem saber antes de ligar:

- **`codex -p` não é print mode** (lá `-p` é `--profile`); o modo não-interativo é `codex exec`.
  No Claude, `-p` **é** o print mode. O broker cuida disso — mas a confusão custa caro se você
  escrever um comando à mão.
- **`claude-cli` no host Claude é quase sempre desperdício:** mesmo modelo da sessão (zero
  diversidade) e o `claude -p` headless consome **crédito Agent SDK separado**, a preço de API. Ele
  só faz sentido quando o host é Codex. O valor real do multi-CLI aqui é o **Codex**.
- **Delegar só economiza se o retorno for enxuto.** A sessão lê os relatórios — o ganho está em
  não varrer o repositório, não em não ler nada. Por isso todo envelope tem teto de palavras.

Tudo é read-only nesta versão: o executor externo **nunca implementa, nunca escreve, nunca
commita**, e dois CLIs jamais editam o mesmo working tree. Executor indisponível degrada para
`native` (ou para uma pergunta, em `economia`) — **sempre declarado**, nunca em silêncio.
Detalhes: [`.claude/PLATAFORMAS.md`](.claude/PLATAFORMAS.md) §11.

### Verbosidade: o harness pode falar menos (3.0.0)

`HARNESS_VERBOSITY` (`normal` · `conciso` *(default)* · `minimo`) controla **quanto as skills
escrevem na tela enquanto trabalham**. Não é cosmético: texto emitido é token de *output* — o mais
caro e o mais lento — **e vira input em todos os turnos seguintes**. Narração intermediária é o
único gasto do harness que *compõe* ao longo de uma sessão longa.

O guard-rail é inegociável e vale em qualquer nível: **concisão não pode virar omissão.** Seguem
sempre visíveis a pergunta da decolagem, toda degradação (modo solo, fallback, gate sem evidência),
todo 🔴, todo erro que exige decisão, e o relatório final. E os arquivos em disco saem **completos**
sempre — encolhe o eco, nunca a auditoria.

---

## Estrutura da pasta

```
harness/
├── README.md                       ← este guia
├── QUICKSTART-DEV.md               ← guia de 1 página p/ devs (projeto já portado)
├── CHANGELOG.md                    ← o que mudou em cada versão do harness
├── AGENTS.md                       ← capa fina p/ o Codex CLI (marcador harness:managed; aponta o Perfil)
├── package.json                    ← scripts npm do RAG (rag:embed/search/reindex) + devDeps
├── .gitignore                      ← ignora .claude/rag/, harness.env.local, node_modules/, codex-reviews/
├── .agents/
│   └── skills/<nome>/SKILL.md      ← stubs GERADOS p/ o Codex (gen-adapters.sh) — nunca editar à mão
├── .codex/
│   ├── agents/<nome>.toml          ← adapters dos agentes p/ o Codex (mandam ler o .md canônico)
│   ├── hooks.json                  ← wiring dos hooks no Codex (só eventos que existem lá; harness:managed)
│   ├── config.toml.example         ← molde de config do projeto no Codex (trust/sandbox) — sem segredo
│   └── rules/README.md             ← rules Starlark (gere com harness-doctor.sh --gen-rules; experimental)
├── .claude/
│   ├── PERFIL-PROJETO.md           ← ★ O ÚNICO arquivo que você edita por projeto
│   ├── ONBOARDING.md               ← checklist de decisões (instalação + atualização) — viaja no sync
│   ├── PLATAFORMAS.md              ← equivalências Claude Code × Codex (doc canônico do multi-AI)
│   ├── PLAYBOOK-TELEMETRIA.md      ← runbook forense "a PRD demorou demais" (espera humana vs lentidão)
│   ├── harness.env                 ← config dos hooks + versão do harness (+ bloco RAG, opcional)
│   ├── harness-role                ← SÓ na cópia-mestre: 1 linha 'mestre' (ausente = projeto)
│   ├── harness-config.html         ← o PAINEL (7 abas) — template versionado
│   ├── harness-ui.mjs              ← bridge local do painel (node .claude/harness-ui.mjs) — grava direto
│   ├── harness-doctor.sh           ← checagem de portabilidade (bash .claude/harness-doctor.sh; --autonomia = só execução autônoma)
│   ├── harness-sync.sh             ← compara/atualiza o nucleo vs a mestre (--check/--dry-run/--apply + --target claude|codex|all; usado pelo DEUS)
│   ├── settings.json               ← wiring dos hooks no Claude Code (SessionStart, UserPromptSubmit, SessionEnd, PreToolUse, PermissionDenied, Notification, PostToolUse, PostToolUseFailure)
│   ├── settings.local.json.example ← molde de permissões — copie p/ settings.local.json (pessoal)
│   ├── harness.env.local.example   ← molde de overrides por máquina (node/php) p/ RAG
│   ├── RAG.md                      ← guia do módulo RAG (opcional): operação diária
│   ├── RAG-PORTING.md              ← decisões + portabilidade do RAG
│   ├── agents/
│   │   ├── beholder.md             ← red-team de PRD (antes do /prd-exec)
│   │   ├── michelangelo.md         ← gate de UI/UX (Passo 10 do /prd + Fase 2.9 do /prd-exec)
│   │   ├── tony-stark.md           ← inovacao: entra em toda PRD (Passo 2 do /prd)
│   │   ├── atlas.md                ← arquitetura + analise de impacto (Agent F do /prd)
│   │   ├── sherlock.md             ← review de codigo Claude (dupla-cega c/ Codex)
│   │   ├── hefesto.md              ← executor de task de backend (Fase 1 do /prd-exec)
│   │   ├── dedalo.md               ← AUTOR do front (Passo 7.1 do /prd + tasks Tipo: front)
│   │   ├── ariadne.md              ← maquete/mockup antes da spec (/mockup, Fase 1 do /prd, /dt)
│   │   ├── peter-quill.md          ← scout read-only do discovery (schema/código/PRDs anteriores)
│   │   ├── datilografo.md          ← [Beta] triagem de demanda → task Asana
│   │   └── zelador.md              ← [Beta] faxina/auditoria do board Asana
│   ├── skills/
│   │   ├── prd/SKILL.md            ← /prd        — cria a PRD completa
│   │   ├── prd-exec/SKILL.md       ← /prd-exec   — executa a PRD (6 fases)
│   │   ├── dt/SKILL.md             ← /dt         — documenta débito técnico
│   │   ├── dt-exec/SKILL.md        ← /dt-exec    — resolve um LOTE de DTs pequenos (mini-PRD)
│   │   ├── codex-review/SKILL.md   ← /codex-review — loop de review standalone
│   │   ├── manual/SKILL.md         ← /manual     — manual vivo do software (docs/manual/)
│   │   ├── harness-report/SKILL.md ← /harness-report — telemetria comparativa
│   │   ├── convencao/SKILL.md      ← /convencao  — convenções da casa (listar/portar/registrar)
│   │   ├── harness-config/SKILL.md ← /harness-config — painel do ecossistema (tela que grava)
│   │   ├── mockup/SKILL.md        ← /mockup     — maquete navegavel antes do codigo (ariadne)
│   │   └── ui-ux-pro-max/         ← skill de TERCEIRO versionada (base de design do dedalo)
│   ├── convencoes/                 ← COMO A CASA FAZ cada feature (nasce no mestre)
│   │   ├── _TEMPLATE-convencao.md  ← molde (frontmatter + seções canônicas)
│   │   ├── INDEX.md                ← catálogo + regras
│   │   └── mfa.md                  ← autenticação em dois fatores (TOTP)
│   ├── hooks/
│   │   ├── _host-detect.sh         ← resolve o host da sessão (HARNESS_HOST > sinais do runtime > claude)
│   │   ├── sync-memory.sh          ← SessionStart: memória versionada → pessoal
│   │   ├── lint.sh                 ← PostToolUse Write|Edit: lint de sintaxe bloqueante
│   │   ├── guard-bash.sh           ← PreToolUse Bash: bloqueia temporário fora do projeto (/tmp, /arquivo) + anti-espiral
│   │   ├── denied.sh               ← PermissionDenied: loga negação do classificador + alerta throttled + protocolo ao modelo
│   │   ├── notify.sh               ← Notification: alerta local + log de espera humana (permission-waits)
│   │   ├── harness-metrics.sh      ← helper: telemetria start/stop (duração, tokens, espera humana)
│   │   ├── harness-metrics.mjs     ← medidor de tokens/gaps do transcript (Node puro, sem deps)
│   │   ├── external-review.sh      ← helper: revisor EXTERNO da dupla-cega conforme o host (codex ou claude -p)
│   │   ├── codex-review.sh         ← shim compatível → external-review.sh (2.0.0)
│   │   ├── harness-delegate.sh     ← BROKER: delega mini-task read-only a CLI externo (--rota resolve o roteamento)
│   │   ├── _delegate-common.sh     ← lib comum do broker + external-review (timeout portátil, probe de executor)
│   │   ├── _seq.sh                 ← faixas de numeração por dev (3.5.0): e-mail git → bloco por série; reservar/faixa leem daqui
│   │   ├── _jsonl-append.sh        ← append com lock + arquivo por dev/máquina de cada série de prds/_metrics (3.5.0)
│   │   ├── _rag-common.sh          ← RAG: resolve node/php; captura→resume→embed
│   │   ├── rag-ensure-index.sh     ← RAG: SessionStart reconstrói o rag.db se faltar
│   │   ├── rag-inject.sh           ← RAG: UserPromptSubmit injeta top-3 trechos
│   │   ├── rag-capture-session.sh  ← RAG: SessionEnd síntese da sessão
│   │   └── rag-capture-agent.sh    ← RAG: PostToolUse Agent|Task resume o agent
│   ├── scripts/                    ← módulo RAG (TypeScript via tsx) + geradores
│   │   ├── gen-adapters.sh         ← gera os stubs .agents/skills/ a partir das skills canônicas
│   │   └── *.ts                    ← paths/db/embedder/chunk/indexer/embed/search/reindex/summarize
│   ├── knowledge/                  ← conhecimento auto-capturado pelo RAG (.md versionados)
│   └── memory/
│       ├── MEMORY.md               ← índice da memória versionada do projeto
│       └── _TEMPLATE-memoria.md    ← molde para criar uma memória nova
├── perfis/                         ← perfis prontos — copie UM por cima do PERFIL-PROJETO.md
│   ├── php-laragon.md
│   ├── node-api.md
│   └── generico.md
├── prds/
│   ├── INDEX.md                     ← registro central de TODAS as PRDs (tabela)
│   ├── _templates/
│   │   ├── TEMPLATE-PRD.md
│   │   ├── TEMPLATE-PRD-TECNICA.md
│   │   ├── TEMPLATE-TASK.md
│   │   ├── TEMPLATE-DT.md
│   │   ├── TEMPLATE-CLAUDE.md       ← copie p/ a raiz do repo como CLAUDE.md
│   │   └── TEMPLATE-ROADMAP-TESTE-MANUAL.html
│   └── debito_tecnico/
│       └── INDEX.md                ← registro central dos DTs (tabela)
└── tests/
    └── acceptance/                 ← testes de aceitação do multi-AI (gen-adapters, sync, host-detect…)
```

---

## Como portar para um repositório novo

São **7 passos**: copiar → escolher perfil → preencher → **decidir os modelos dos
agentes** → criar o `CLAUDE.md` → instalar a skill UI UX Pro Max → rodar o doctor. Tudo
em PowerShell (Windows/Laragon). O checklist de decisões completo (este passo a passo é
o "como"; o "o que decidir" é ele) está em [`.claude/ONBOARDING.md`](.claude/ONBOARDING.md).

> **Atalho (3.0.4): `/prometeu --portar`.** A skill conduz estes mesmos 7 passos dentro do
> Claude Code — inclusive perguntando a stack, escolhendo o perfil e rodando o doctor. Se a
> máquina ainda não tiver um clone do harness base, ela pede o link do repositório e clona.
> Ver [`/prometeu`](#prometeu--atualizar-e-portar-sozinho). O passo a passo manual abaixo
> continua válido (e é o que a skill executa).

### Passo 1 — Copiar o harness para o repo-alvo

> **De onde sai a cópia.** A **fonte de verdade** é a cópia-mestre no vault do Charles
> (`…\vault\projetos\referencias\harness`) — quem não tem o vault pega numa das **réplicas**
> publicadas no GitLab (espelhos automáticos, sempre da versão mais recente; nunca edite uma
> réplica: a alteração se perde no próximo sync):
>
> | Origem | `$harness` = |
> |--------|--------------|
> | Repo dedicado — `git clone https://gitlab.com/charlessegundo/equipe-tefnet-harness-base.git` | a **raiz do clone** (o repo *é* o harness) |
> | Vault `base-conhecimento` (Obsidian) | `…\base-conhecimento\referencias\harness` |
> | Vault do Charles (cópia-mestre) | `…\vault\projetos\referencias\harness` |
>
> Antes de copiar, dê `git pull` na origem escolhida e confira o `HARNESS_VERSION` em
> `.claude\harness.env`.

```powershell
$harness = "C:\laragon\www\equipe-tefnet-harness-base"   # ou a origem que você usou (ver acima)
$alvo    = "C:\laragon\www\MEU-PROJETO"   # raiz do repositório novo

# .claude inteiro: skills, hooks, memory, settings.json, harness.env, PERFIL-PROJETO.md
Copy-Item -Recurse -Force "$harness\.claude" "$alvo\.claude"

# estrutura de PRDs: templates + pasta de débito técnico (com INDEX.md)
Copy-Item -Recurse -Force "$harness\prds" "$alvo\prds"
```

> Não precisa copiar a pasta `perfis/` para dentro do repo-alvo — ela serve só de
> catálogo aqui na cópia-mestre. No próximo passo você puxa **um** perfil dela.

### Passo 2 — Escolher um perfil pronto (ou usar o genérico)

Copie o perfil que mais se aproxima da stack do projeto **por cima** do `PERFIL-PROJETO.md`:

```powershell
# Ex.: projeto PHP + Laragon + MySQL
Copy-Item -Force "$harness\perfis\php-laragon.md" "$alvo\.claude\PERFIL-PROJETO.md"

# Ex.: API Node
# Copy-Item -Force "$harness\perfis\node-api.md" "$alvo\.claude\PERFIL-PROJETO.md"

# Em dúvida / stack diferente: o esqueleto genérico
# Copy-Item -Force "$harness\perfis\generico.md" "$alvo\.claude\PERFIL-PROJETO.md"
```

### Passo 3 — Preencher o Perfil e o `harness.env`

Edite os **dois** arquivos no repo-alvo:

1. **`.claude\PERFIL-PROJETO.md`** — troque todo `<placeholder>` pelo valor real do
   projeto (caminhos CLI, banco de teste local, baseURL, login E2E, integrações,
   estrutura de diretórios, armadilhas). É aqui que mora 99% do ajuste.
2. **`.claude\harness.env`** — ligue o lint para a stack (ex. `HARNESS_LINT_CMD` +
   `HARNESS_LINT_EXT`) e ajuste o slug da pasta de relatórios do Codex
   (`HARNESS_CODEX_REPORTS`).

### Passo 4 — Decidir os modelos dos agentes (custo de tokens) ⚠️

O harness é **Sonnet-first**: todos os agentes rodam em Sonnet por padrão, porque parte
deles entra **automaticamente** no fluxo (`tony-stark` e `beholder` em **toda** PRD,
`atlas` quando toca módulo existente, `michelangelo` **e** `dedalo` quando a PRD tem UI,
`sherlock` em todo review) — em Opus, esse fluxo estoura o limite das contas rapidamente.

A decisão fica na seção **"Agentes do harness (modelos)"** do `PERFIL-PROJETO.md`:
mantenha tudo `sonnet` (recomendado) ou promova agentes **individualmente** a `opus` se
a conta tem limite folgado. Na mesma seção moram os botões de ciclos: **"Ciclos do
beholder"** (red-team→correção) e **"Ciclos do michelangelo"** (gate de UX, quando há UI),
ambos default 4; `0` = sem limite; conta apertada: 2–3. Tabela de frequência de cada agente e regra de bolso em
[`.claude/ONBOARDING.md`](.claude/ONBOARDING.md) (item A2). **Não pule esta decisão** —
herdá-la sem saber é como o consumo estoura sem ninguém perceber.

### Passo 5 — Criar o `CLAUDE.md` na raiz do repo

Copie o template de convenções para a raiz do repo-alvo (vira o `CLAUDE.md` que o Claude
Code lê sozinho ao abrir a sessão):

```powershell
Copy-Item -Force "$alvo\prds\_templates\TEMPLATE-CLAUDE.md" "$alvo\CLAUDE.md"
```

É um arquivo **curto**: fixa as convenções da raiz (como trabalhar aqui, não commitar/dar
push, usar a UI UX Pro Max em telas, datas vindas da origem) e **aponta o Perfil como
fonte de verdade**. Ajuste a seção "Notas específicas deste projeto" se precisar.

### Passo 6 — Instalar a skill **UI UX Pro Max** (obrigatório)

Skill externa de design de UI/UX que adotamos como padrão (ver
[seção dedicada](#skill-externa-obrigatória--ui-ux-pro-max)). Instale em **todo** projeto.
Pelo terminal, na raiz do repo-alvo:

```powershell
npm install -g uipro-cli
uipro init --ai claude
```

### Passo 7 — Rodar o doctor

Valide a portabilidade antes de começar:

```powershell
bash .claude/harness-doctor.sh
```

Resolva os itens marcados `[FALTA]` (bloqueiam o uso pleno) e revise os `[WARN]`. Ele
também lista os agentes promovidos a Opus — confira contra o que você decidiu no Passo 4.
Detalhes na seção [Doctor: validar a portabilidade](#doctor-validar-a-portabilidade).

Pronto. Abra o Claude Code na raiz do repo-alvo — o hook `SessionStart` roda sozinho e as
skills `/prd`, `/prd-exec`, `/dt`, `/codex-review` já aparecem (mais a **UI UX Pro Max**,
que ativa sozinha quando você pede trabalho de UI). Antes do primeiro uso, vale percorrer
o checklist A do [`.claude/ONBOARDING.md`](.claude/ONBOARDING.md) — 5 minutos que evitam
herdar decisões (custo, lint, RAG) sem saber.

> **Versionamento:** comite o `.claude/` no repo-alvo (exceto o `settings.local.json`
> pessoal — ver [Permissões e `.gitignore`](#permissões-e-gitignore)). Ele é feito para ser
> compartilhado pelo time (skills, hooks e memória versionada viajam junto com o repo). O
> `PERFIL-PROJETO.md` é seguro de versionar **desde que** contenha só credenciais de
> desenvolvimento local — nunca de produção (há um aviso no topo da seção de banco).

---

## `/prometeu` — atualizar e portar sozinho

> **Novo na 3.0.4.** Quem tem o vault usa o `/deus` (varre a frota inteira contra a cópia-mestre).
> Quem **não** tem — a equipe — usa o **`/prometeu`**: a mesma mecânica, apontada para o clone
> local do **harness base**. Skill e agente rodam em **Sonnet**.

```
/prometeu               diagnostica este projeto e oferece o sync
/prometeu --check       só o painel, não mexe em nada
/prometeu --pull        atualiza o clone do harness base (git pull) antes
/prometeu --all         varre TODOS os seus projetos (modo hub)
/prometeu --portar      instala o harness do zero num repo
```

**Dois modos, escolhidos pelo diretório em que a sessão foi aberta:**

| Onde você abre o Claude Code | Modo | O que faz |
|------------------------------|------|-----------|
| dentro de um **projeto** com harness | projeto | check + painel curto + sync daquele repo (sem subagente) |
| dentro do **clone do harness base** (ou `--all`) | hub | varre o `base_dir`, dispara o agente `prometeu` em lotes paralelos, painel completo |

**Como ele acha a fonte:** procura, nesta ordem, o `PROMETEU_FONTE` do `.claude/prometeu.env`, o
`prometeu-config.md` da fonte, o próprio cwd e as pastas irmãs — reconhecendo a fonte pelo par
`perfis/` + `.claude/harness-sync.sh` (a `perfis/` nunca é copiada para um projeto, então é
marcador seguro). Não achou, **pergunta o caminho ou o link do repositório** e clona; a resposta
fica gravada no `.claude/prometeu.env` (gitignored).

**Três salvaguardas:**

1. **A fonte é read-only** — a skill nunca escreve, commita ou dá push no clone do harness base
   (é espelho publicado: edição local se perde no `git pull` seguinte) e nunca o usa como alvo.
2. **Commit e push são seus** — vale a regra da casa *"commit é SEU"*: ela monta o comando
   **escopado** (só as linhas `COPIADO|…` + `harness.env`), **pergunta** antes de commitar e
   **pergunta de novo** antes do push. Nunca `git add -A`.
3. **Fonte fresca antes de diagnosticar** — `git fetch` no clone e aviso se estiver atrás do
   remoto; fonte velha produz painel mentiroso ("alinhado" contra uma versão que já passou).

Config em `prometeu-config.md` na raiz da fonte (`fonte`, `base_dir`, `lote_paralelo`,
`blacklist`, `via_upstream`, `push`), com `prometeu-config.local.md` (gitignored) para os
caminhos de cada máquina.

---

## Onboarding: decisões de instalação e atualização

O port (acima) é o **como**; o [`.claude/ONBOARDING.md`](.claude/ONBOARDING.md) é o **o
que decidir** — e ele viaja com o `.claude/` para todo repo portado. Cobre dois momentos:

- **Primeira instalação (seção A):** as 7 decisões que o passo a passo não toma por você —
  Perfil completo, **modelos dos agentes (a decisão de custo)**, lint, RAG ligado ou
  dormente, Codex, permissões pessoais, doctor.
- **Atualização (seções B e C):** quando o `/deus` (ou o `harness-sync.sh --apply`)
  atualiza o núcleo do repo, versão nova pode **mudar defaults e criar campos novos** que
  o Perfil local ainda não tem. A rotina: ver o de→para da versão (o `--apply` imprime a
  linha `ONBOARDING|de -> para|...`), ler a seção **"Decisões por versão"** da faixa
  pulada, ajustar Perfil/`harness.env`/`.gitignore` e rodar o doctor.

> **Regra de manutenção:** toda versão nova da cópia-mestre DEVE ganhar uma entrada na
> seção "Decisões por versão" do ONBOARDING (mesmo que seja "Ação: nenhuma") — é ela que
> permite ao dev atualizar sem reler changelog técnico inteiro.

---

## Doctor: validar a portabilidade

Depois de portar (e sempre que quiser conferir o estado de um repo), rode na raiz:

```powershell
bash .claude/harness-doctor.sh
```

Ele **só diagnostica** — não altera nada. No topo mostra a versão do harness
(`HARNESS_VERSION` do `harness.env`) e o caminho do repo. Cada checagem sai com um prefixo:

- **`[ OK ]`** — pré-requisito presente e funcional.
- **`[WARN]`** — não bloqueia o núcleo, mas convém resolver (ex.: `<placeholders>` ainda no
  Perfil, `python3` ausente para a UI UX Pro Max, `codex`/`jq` não instalados).
- **`[FALTA]`** — algo essencial não está no lugar (ex.: `PERFIL-PROJETO.md` inexistente).
  Sai com **código ≠ 0** — dá para usar em CI como porteiro.

O que ele verifica: Perfil existe e está preenchido (sem `<placeholders>`); a seção
"Agentes do harness (modelos)" presente (e **lista os agentes promovidos a Opus** — para a
decisão de custo ficar visível); `.claude/ONBOARDING.md` presente; `harness.env` presente;
lint configurado e com binário acessível; `bash` e git; `codex` + login (opcional — sem ele
o review roda só com o sherlock); `python3` real (no Windows, alerta se for só o alias da
Microsoft Store); `jq`; a skill UI UX Pro Max instalada; e a presença das 6 skills, 9
hooks/helpers e 7 agentes genéricos, agrupados numa **matriz multi-AI** (núcleo, Claude,
Codex, RAG, segurança, propagação, portabilidade). Fecha com um resumo contado.

---

## O Perfil é a única fonte de verdade

`.claude/PERFIL-PROJETO.md` é o **único** arquivo específico do projeto. As skills citam
campos por caminho (ex.: *"interpretador do Perfil → CLI → Interpretador"*), então
**mantenha os títulos das seções**. Resumo do que cada seção alimenta:

| Seção do Perfil | Quem usa | Para quê |
|---|---|---|
| **Identificação** | todas | nome/slug do projeto em pastas e relatórios |
| **CLI (ambiente local)** | `/prd-exec`, `lint.sh` | caminho do interpretador e cliente de banco |
| **Banco de dados (teste local)** | `/prd-exec` | smoke test, soft delete |
| **Aplicação (URL local)** | `/prd`, `/prd-exec` | baseURL para testes |
| **Lint automático** | `lint.sh` (via `harness.env`) | sintaxe bloqueante por extensão |
| **Testes E2E** | `/prd`, `/prd-exec` | framework, specs, login, comandos |
| **Integrações com efeitos colaterais** | `/prd` (riscos), `/prd-exec` (Fase 0) | gate de segurança |
| **Safe Mode** | `/prd-exec` Fase 0 | bloquear execução local insegura |
| **Codex review** | `/codex-review`, `/prd-exec` Fase 2 | pasta de relatórios, limite de ciclos do review (`preset`/ausente = preset ativo: economico 2 · equilibrado 3 · maximo 4; `0` = sem limite) |
| **Agentes do harness (modelos)** | `/prd`, `/prd-exec`, `/codex-review` | modelos dos 6 agentes configuráveis — `sonnet` (default Sonnet-first) ou `opus` (opt-in por agente) — e os limites de **ciclos do beholder** e **ciclos do michelangelo** (`preset`/ausente = preset ativo: economico 2 · equilibrado 3 · maximo 4; `0` = sem limite) |
| **Compatibilidade de produção** | triagem do Codex | barrar features da runtime nova |
| **Timezone e datas de negócio** | regra de datas | datas vêm da origem, nunca `NOW()` |
| **Estrutura de diretórios** | todas | onde achar/criar código; doc raiz de convenções |
| **Armadilhas do projeto** | triagem do Codex | régua p/ separar bug real de falso positivo |

Se o `PERFIL-PROJETO.md` não existir (ou estiver vazio), as skills **param** no Passo 0 e
pedem para você copiar um perfil de `perfis/`.

---

## Perfis prontos

Catálogo em `perfis/`. Cada um é um `PERFIL-PROJETO.md` pré-preenchido para uma stack:

- **`php-laragon.md`** — PHP + Laragon + MySQL no Windows (caminhos do `php.exe`/`mysql.exe`
  de Laragon, lint via `php -l`, Playwright opcional, compat PHP 7.4).
- **`node-api.md`** — API Node (lint via `node --check`, smoke test de banco, comandos `npm`).
- **`generico.md`** — esqueleto neutro com todos os campos como `<placeholder>`, para
  qualquer outra stack.

Escolher um perfil é só copiá-lo por cima do `PERFIL-PROJETO.md` (ver Passo 2 acima) e
ajustar os detalhes.

---

## As 9 skills

Todas começam lendo o Perfil (Passo 0) e são stack-agnósticas.

### `/prd` — Criar PRD
Gera a PRD completa (PRD de produto, **PRD Técnica**, **Tasks** e **Prompt de Execução**).

> **Em duas fases, com aceite no meio (1.5.0).** A **Fase 1** faz a entrevista + discovery e escreve
> **só a PRD de produto**, então **para** para você validar o escopo (persiste o discovery em
> `_discovery.md`). A **Fase 2** (técnica + tasks + Prompt de Execução + gates) só roda com **aceite
> explícito** — na hora ou depois, numa janela nova: rode `/prd` de novo (ou `/prd continuar
> PRD-NNN`) e ela detecta a PRD pendente e retoma de onde parou, sem refazer o discovery. Valida o
> produto antes de gastar o grosso e não estoura a sessão de contas menores.

Faz **discovery em paralelo** (DTs relacionados, schema/migrations, código existente, PRDs
anteriores, inovação via **tony-stark** e — quando o escopo toca módulo existente —
**análise de impacto via atlas**) antes de escrever qualquer documento, registra os pontos
de disparo de integrações com efeito colateral nos riscos e fecha com dois gates adversariais
**em paralelo** (Passo 10): o red-team do **beholder** (correção da spec) e — quando a PRD tem
trabalho de interface — o **gate de UX do michelangelo** (critica o design proposto). Ambos rodam
em **ciclos** (revisão → correção → re-revisão) até zerar os 🔴 — limitados pelos campos "Ciclos do
beholder" / "Ciclos do michelangelo" do Perfil (`preset`/ausente = preset ativo: economico 2 · equilibrado 3 · maximo 4; `0` = sem limite). Esgotou o limite
sem zerar: a skill **para e pede a decisão humana** — seguir (riscos aceitos registrados
na PRD) ou abortar.

```
/prd Adicionar <funcionalidade>
/prd Corrigir <bug>
/prd                          # sem argumento — pergunta o que você quer
```

### `/prd-exec` — Executar PRD (6 fases)
Lê os documentos/tasks na ordem e implementa tudo. Fases:

| Fase | O que faz |
|---|---|
| **0 — Pré-flight Safe Mode** | bloqueia execução local se houver integração com efeito colateral e o safe-mode não estiver ativo. *Pulada automaticamente* se o Perfil declarar "Nenhuma" integração. |
| **1 — Implementação** | aplica as tasks em ondas paralelas — **hefesto** nas de backend, **dedalo** nas de `Tipo: front`. |
| **2 — Loop de review DUPLA-CEGA** | Codex CLI + agente **sherlock** revisam em paralelo (sem ver um ao outro); cruzamento de achados, triagem, correção; **limite de ciclos do Perfil** (`preset`/ausente = preset ativo: economico 2 · equilibrado 3 · maximo 4; `0` = sem limite) — esgotou com bloqueantes, a decisão de seguir/abortar é **humana**; **>10 bloqueadores no ciclo 1 = ABORTA**. Sem Codex no ambiente, roda só o sherlock — o review nunca é pulado em silêncio. |
| **3 — Mensagem de commit** | redige a mensagem. **Não comita** — você faz manualmente. |
| **4 — Roadmap de teste manual** | gera o roteiro (+ HTML interativo). Pulável via "Skip HTML Roadmap=Sim". |
| **5 — Documentação de DT** | registra débitos técnicos achados durante a execução. |

### Sessões paralelas e loop noturno (3.4.0) — worktrees isolados
Cada sessão paralela do mesmo projeto roda num **worktree** próprio (pasta irmã, branch
`wt/<rótulo>`, **banco clonado**, URL própria) e os DTs/PRDs em voo ficam **travados** para as
outras — o review de uma nunca vê o diff da outra, e o E2E de uma nunca derruba o banco da outra.
Genérico por declaração (`harness.env` → seção WORKTREES). O **loop noturno**
(`scripts/noturno.sh`) usa o mesmo mecanismo: worktree + `/dt-sweep --loop --autonomo` + duelo
de modelos baratos + MR de manhã.

```
bash .claude/hooks/harness-worktree.sh novo prd-125        # pasta irmã + branch + banco clonado + .env/override
bash .claude/hooks/harness-worktree.sh lista               # worktrees e locks
bash .claude/hooks/harness-worktree.sh fechar prd-125 --merge
bash .claude/scripts/noturno.sh --dry-run                   # testa o noturno local sem executar
bash .claude/scripts/noturno.sh --cloud --dry-run           # modo servidor/runner (banco externo) — passo a passo em .claude/scripts/NOTURNO-SETUP.md e na aba Noturno da tela
```

### Duelo de modelos (3.3.0) — dois workers baratos + juíza, antes do hefesto
Task mecânica (backend, ≤ 3 arquivos, sem migration/integração/auth) é escrita por **dois modelos
baratos do OpenRouter** em paralelo a partir do mesmo *task packet*; a **themis** (juíza, Sonnet na
assinatura) escolhe ou reprova os dois; o hefesto aplica o vencedor e roda lint + spec local. Os
gates não mudam. Tudo medido em `prds/_metrics/duelos/<dev>@<máquina>.jsonl` (3.5.0; o antigo `harness-duelos.jsonl` fica como histórico) — vitórias, reprovações e
custo **por modelo** no `/harness-report`. Ativo por padrão quando há `OPENROUTER_API_KEY` na
máquina; sem chave, nada muda. Pool: DeepSeek V4 Flash 0731 · Gemini 3.7 Flash · Qwen3 Coder Next.

```
bash .claude/hooks/harness-duelo.sh --task prds/PRD-NNN-*/tasks/TASK-00X-*.md --label PRD-NNN
bash .claude/hooks/harness-duelo.sh --veredito <id> --vencedor A --nota-a 8 --nota-b 6 --motivo "..."
bash .claude/hooks/harness-duelo.sh --aplicado <id> --resultado ok
```

### `/dt` — Criar Débito Técnico
Entrevista curta e gera o documento de DT padronizado em `prds/debito_tecnico/`, já
atualizando o `INDEX.md`. Captura contexto suficiente para o DT virar PRD no futuro sem
ambiguidade.

```
/dt <descrição do problema ou melhoria>
```

### `/dt-exec` — Executar um LOTE de DTs (mini-PRD)
O degrau que faltava entre a `/dt` (registra e para) e a `/prd` (artilharia completa): agrupa
**DTs pequenos já registrados** num lote coeso, escreve **uma** mini-spec e executa de ponta a
ponta. Cerimônia proporcional ao tamanho — sem discovery paralelo, sem duas fases, sem PRD
técnica separada, sem arquivos de task, sem roadmap HTML.

**O que ela mantém, sempre:** o pre-flight de **safe-mode** (mudança pequena dispara WhatsApp
igual) e o **review dupla-cega** (com menos ciclos). Os gates adversariais são **condicionais**:
beholder só se algum item tocar auth/integração/schema; michelangelo só se tocar UI (Passo 5.1).

**O que a torna segura não é o que ela corta — é o que ela se recusa a engolir.** Item que exige
migration, toca integração com efeito colateral, muda contrato de API ou tem decisão de design em
aberto é **ejetado do lote e vira PRD** — e o motivo fica registrado no lote e no próprio DT.

```
/dt-exec                        # lê o INDEX, propõe um lote coeso e pede seu aceite
/dt-exec DT-003 DT-007          # lote explícito (a triagem ainda roda)
/dt-exec --max-itens=3          # sobrepõe o limite do preset
/dt-exec --dry-run              # só a triagem e a proposta; não escreve nem executa
```

### `/dt-sweep` — Sanear a fila de DTs (3.2.2 · na tela desde a 3.3.0)
A fila de DTs só cresce (medido em 22/08/2026: 448 no core do Taurus, 79 pendentes, 26 novos
numa semana — e boa parte **não era dívida**). O sweep classifica cada DT pendente em cinco
baldes **com prova executável** — ⚪ descartar (arquivo sumiu, já resolvido, duplicata) ·
🔵 ideia (vai de 1 linha para `prds/backlog/IDEIAS.md`) · 🟢 lote pequeno · 🔴 PRD (agrupado por
tema) · 🟡 decidir — e devolve uma **fila de lotes por área com o comando pronto para cada
sessão paralela** (`/dt-exec`). Read-only por default; `--aplicar` escreve status sob confirmação.
A classificação bruta pode rodar num modelo barato (`--executor=openrouter`, broker 3.2.2) —
quem prova e decide continua sendo a sessão.

```
/dt-sweep                       # varredura + proposta + fila de lotes (read-only)
/dt-sweep --aplicar             # aplica descartes/ideias aprovados (status nas duas pontas)
/dt-sweep --paralelo=2 --loop   # fila contínua para 2 sessões; reemite até a fila 🟢 esvaziar
/dt-sweep --executor=openrouter # triagem bruta num modelo barato (OPENROUTER_API_KEY no harness.env do projeto — 3.5.7)
```

> Junto do sweep, a 3.2.2 fecha a torneira na origem: `/dt`, `/prd` e `/prd-exec` passam a
> **triar a classe** antes de criar arquivo — só **bug** e **dívida** viram `DT-XXX`; ideia vai
> para `IDEIAS.md` (1 linha), incidente do harness vai para o mestre, estouro de envelope vira
> telemetria. Teto de **3 candidatos a DT por PRD**.

> Duas assimetrias de design valem a leitura: o **único gate humano** é a aprovação do lote, e ela
> acontece depois de apenas ler o índice (na `/prd`, o aceite vem depois do discovery — caro). E os
> hefestos rodam **sequencialmente por default** — o inverso da `/prd-exec`: lá as tasks são
> desenhadas para serem independentes, aqui o lote é agrupado por coesão e os itens tendem a tocar
> os mesmos arquivos. Cada item resolvido rende **uma mensagem de commit própria**, para o revert
> continuar cirúrgico.

Documentos em `prds/debito_tecnico/lotes/LOTE-NNN-<slug>.md`; ao fim, cada DT vira
`Resolvido (LOTE-NNN)` no arquivo **e** no `INDEX.md`.

### `/codex-review` — Review standalone (dupla-cega)
Mesmo loop de review da Fase 2 (Codex + sherlock em paralelo, mesmo helper, mesmo **limite
de ciclos do Perfil** — default 4, `0` = sem limite), só que fora do `/prd-exec` — para
revisar o *working tree* atual a qualquer momento.

```
/codex-review                 # dupla-cega no working tree atual (label WT)
/codex-review PRD-NNN         # rotulado como uma PRD
/codex-review --no-fix        # só reporta, não corrige
/codex-review --max-ciclos=2  # sobrepõe o limite do Perfil neste run (0 = sem limite)
/codex-review --apenas-codex  # modo solo (idem --apenas-sherlock)
```

> Review rápido sem o loop? Chame o agente direto: *"sherlock, revisa isso antes de eu
> commitar"* — é o review de bolso.

### `/manual` — Manual vivo do software
Mantém `docs/manual/` (por módulo, dupla face: usuário final + dev) absorvendo em lote as PRDs
da fila que a `/prd-exec` alimenta. Gatilho natural: revisão quinzenal (dias 1/15).

### `/harness-report` — Telemetria comparativa (dashboard na 3.1.0)
Roda o agregador `.claude/hooks/harness-dashboard.mjs` (Node puro, ~4 s) que cruza duração,
tokens, ciclos, espera humana e paralelismo por execução — e, cruzando com os transcripts do
Claude Code, **por agente e por modelo** (hefesto/beholder/dedalo… lento em qual projeto?) — e
gera um **HTML auto-contido com gráficos** + JSON em `prds/_metrics/`. A skill lê o JSON e
escreve a leitura (o que investigar). `--all` varre os projetos irmãos. Rodar quinzenalmente.

### `/convencao` — Convenções da casa
Lista, mostra e **porta** as convenções de `.claude/convencoes/` — o passo a passo genérico de
cada feature que a Beta já fez (modelo de dados, contratos, armadilhas reais, checklist de
aceite). `/convencao portar <slug>` cruza a convenção com o Perfil deste projeto e alimenta a
`/prd` com o discovery da feature pronto. Ver [Convenções da casa](#convenções-da-casa).

```
/convencao                 # catálogo + estado de adoção
/convencao portar mfa      # gera a PRD do port
/convencao nova            # registrar (só no harness mestre)
```

### `/harness-config` — O painel do ecossistema
Abre a tela com **tudo** que o harness tem neste projeto — Perfil, presets de esforço e custo,
skills, agentes (com o modelo **efetivo** de cada um), hooks e flags, e as convenções — e
**grava direto nos arquivos**: a skill sobe um bridge local (`node .claude/harness-ui.mjs`,
`127.0.0.1` + token por execução) e o botão Salvar faz **edição cirúrgica**, alterando só a
célula do campo tocado e preservando comentários, hints e as seções que a tela não expõe. Todo
write faz backup em `.claude/.harness-run/ui-backup/<ts>/`.

Sem `node` na máquina, a tela abre em **modo somente-leitura** e volta ao fluxo clássico
(preencher → copiar a config → o Claude aplica) — nada se perde.

```
/harness-config
```

**A aba "Trabalho" (2.8.0)** responde, sem digitar nada, o que hoje se pergunta no chat: quantos
DTs estão abertos, qual PRD está pendente e **qual é o próximo passo**. Ela lê `prds/` direto do
disco (a pasta de DT vem do Perfil — varia entre `prds/debito_tecnico/` e `prds/dt/`), ordena a
fila e transforma cada sugestão num comando pronto para colar. Trocar o status de um DT ali grava
**no arquivo e no `INDEX.md` de uma vez** — o passo que se esquece na mão e faz o índice mentir
sobre a fila (o doctor passou a cobrar essa coerência, e a tela reconcilia com preview).

---

## Convenções da casa

> Novo na **2.7.0**. Vivem em `.claude/convencoes/`, viajam no núcleo do sync.

Uma **convenção** é *como a Beta faz uma feature* — destilada de código que **já roda em
produção** num projeto nosso, escrita para quem vai **portar** a feature onde ela ainda não
existe. Não é tutorial genérico: se não dá para apontar o repo e os arquivos reais, não é
convenção (é ideia — vira DT ou PRD).

O que cada arquivo carrega, e que um projeto novo não teria como adivinhar:

| Seção | Serve para |
|-------|------------|
| Por que existe · Quando NÃO aplicar | evitar port desnecessário |
| Pré-requisitos | o que a PRD do port precisa resolver antes |
| Modelo de dados · Contratos | DDL e endpoints reais → viram a PRD técnica |
| Passo a passo | cada item vira uma task |
| **Armadilhas** | sintoma → causa → correção, com data. **É o ativo principal** — vira o briefing do beholder |
| Checklist de aceite | critério de aceite da PRD, verificável por quem não implementou |

### O ciclo

```
convenção nasce no MESTRE  →  /deus propaga  →  /convencao portar <slug> no projeto
        ↑                                                      ↓
        └────── armadilha nova achada no port volta ao mestre ──┘
```

- **Nasce sempre no mestre** (`/convencao nova` no vault). Criada dentro de um projeto-alvo,
  vira `EXTRA|alvo|` no sync e some na primeira atualização. O `.claude/harness-role` é o que
  distingue o mestre — e é **excluído do espelhamento para as réplicas**, senão cada réplica se
  declararia fonte de verdade.
- **O estado de adoção é local**: seção *Convenções adotadas* do `PERFIL-PROJETO.md`
  (`adotada` / `parcial` / `nao-adotada` / `nao-se-aplica`). Ausente = tudo `nao-adotada`.
  Marque pela aba **Convenções** do painel ou por `/convencao status`.
- **`portar` não pula o discovery.** A convenção resolve o discovery da **feature** (o quê,
  com que contratos, evitando o quê); a `/prd` segue fazendo o discovery do **projeto** (schema
  real, código existente, precedentes, impacto).

### Diferença para o `/manual`

`/manual` documenta o que **este** projeto tem (`docs/manual/`, por módulo, para usuário e dev).
`/convencao` descreve como a **casa** faz, para levar a **outro** projeto. Um olha para dentro,
o outro para os lados.

---

## Skill externa obrigatória — UI UX Pro Max

Além das 6 skills do harness, **sempre instale** a skill externa
[**UI UX Pro Max**](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) em todo
projeto. Já usamos num projeto e o resultado de UI/UX ficou muito acima do padrão.

**O que faz:** inteligência de design para UI/UX. O destaque é um gerador de *design
system* que analisa o projeto e produz um sistema completo e sob medida — com catálogo de
67 estilos de UI, 161 paletas de cores, 57 pares de fontes e 161 regras de raciocínio por
indústria.

**Como instalar** (dois caminhos — use um):

- **CLI (recomendado)** — na raiz do repo-alvo, pelo terminal:
  ```powershell
  npm install -g uipro-cli
  uipro init --ai claude
  ```
- **Marketplace** — dentro do Claude Code:
  ```
  /plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
  /plugin install ui-ux-pro-max@ui-ux-pro-max-skill
  ```

Os arquivos vão para `.claude/skills/` (ou `~/.claude/skills/` em instalação global), em
pasta própria (`ui-ux-pro-max`) — **não conflita** com as skills do harness.

**Pré-requisito:** Python 3.x (usado pelo script de busca da skill). Confira com
`python3 --version`.

**Como usar:** ativa **sozinha** quando você pede trabalho de UI no Claude Code (ex.:
"crie uma landing page para…", "monte um dashboard de…"). Não tem slash command no Claude Code.

> **Por que não vem embutida no harness:** é uma skill de terceiros, distribuída por
> CLI/marketplace e com dados próprios atualizados *upstream*. Mantê-la como passo de
> instalação (em vez de copiada para cá) garante que cada projeto pegue a versão mais nova.

---

## Hooks e `harness.env`

> **3.5.7 — três camadas, uma ordem.** `hooks/_defaults.env` guarda TODA decisão do harness (versionado no mestre,
> chega pelo `/deus`); `.claude/harness.env` guarda só o que é do PROJETO (lista fechada em `hooks/_camadas.txt`);
> `harness.env.local` / `~/.harness.env.local` guardam o que é da MÁQUINA (segredos, runtimes, ollama). Todo hook
> carrega nessa ordem pelo `hooks/_env.sh` (bash) ou `presence.mjs loadHarnessEnv()` (Node), e a variável de
> ambiente da sessão vence. Decisão redeclarada em camada errada = o doctor avisa ("Camadas de configuracao") e o
> sync migra (`ENV|decisao-no-projeto`). Para mudar uma decisão: edite o `_defaults.env` no mestre e publique.

Os hooks de evento são **registrados em `settings.json`**; os helpers são chamados pelas
skills.

> **Multi-AI (2.0.0):** os **scripts** de hook são compartilhados entre plataformas; o
> **wiring** é por host — o `.claude/settings.json` continua sendo o wiring do Claude
> Code, e o do Codex vive em **`.codex/hooks.json`** (somente os eventos que existem lá
> — sem `async`, sem `SessionEnd`/`Notification`/`PermissionDenied`/`PostToolUseFailure`;
> hooks sem equivalente ficam dormentes **por design**, nunca fingem suporte). A tabela
> evento a evento está no [`.claude/PLATAFORMAS.md`](.claude/PLATAFORMAS.md) (§4).

| Arquivo | Tipo | Quando roda | O que faz |
|---|---|---|---|
| `sync-memory.sh` | hook `SessionStart` | ao abrir a sessão | copia `.claude/memory/*.md` (versionado) → `~/.claude/projects/<slug>/memory/` (pessoal). **Sobrescreve** arquivos de mesmo nome. |
| `lint.sh` | hook `PostToolUse` (Write\|Edit) | a cada arquivo escrito/editado | lint **de sintaxe** bloqueante (exit 2 em erro). *No-op* se `HARNESS_LINT_CMD`/`EXT` vazios. Se o binário do lint não existir, só avisa (não trava). Opcional: `HARNESS_LINT_CMD_EXTRA` roda análise estática adicional **não-bloqueante** após a sintaxe passar. |
| `guard-bash.sh` | hook `PreToolUse` (Bash) + `PostToolUse`/`PostToolUseFailure` (Bash, `--post`) | antes de cada comando Bash (e depois, p/ limpar contadores) | duas guardas determinísticas: **(1) temporários** — bloqueia (exit 2) escrita em caminho de raiz fora do projeto (`/tmp`, `/arquivo` — no Git Bash/Windows isso resolve p/ `C:\Program Files\Git\` e pendura execução autônoma num prompt de permissão); **(2) anti-espiral (1.9.0)** — corta o MESMO comando tentado 3× sem nunca executar (assinatura de classificador de permissão indisponível) com instrução definitiva de parar, alerta via `notify.sh` e log `{"type":"spiral"}`. Só arma com o wiring `--post` nos dois eventos (fusível). `HARNESS_GUARD_BASH='0'` / `HARNESS_GUARD_SPIRAL='0'` desligam. |
| `denied.sh` | hook `PermissionDenied` (sem matcher — todas as ferramentas, pega **Agent**) | a cada negação do **classificador** do auto mode | **loga** `{"type":"denied"}` em `permission-waits.jsonl` (vira `classifier_denials` na telemetria, sem inflar espera humana), **alerta** via `HARNESS_NOTIFY_CMD` com throttle (1º imediato, depois máx 1/5min) e **injeta contexto** curto ao modelo com o protocolo (não re-tentar em loop; parar com Status Bloqueada). Nunca devolve `retry:true`. `HARNESS_SKIP_DENIED=1` desliga. |
| `notify.sh` | hook `Notification` | quando um pedido de permissão fica aguardando o humano (ou idle) | **loga a espera** em `.claude/.harness-run/permission-waits.jsonl` (a telemetria mede a espera humana real) e dispara alerta local via `HARNESS_NOTIFY_CMD` (som/toast/webhook). Também é o canal de alerta do anti-espiral (`[spiral]` → `type:"spiral"`). Sem config = só loga (no-op seguro). |
| `harness-metrics.sh` + `.mjs` | **helper** (não é hook de evento) | `start`/`stop` chamados por `/prd` e `/prd-exec` | telemetria: duração, tokens, `out_tps`, maior gap do transcript, espera humana medida e ondas de paralelismo → `prds/_metrics/harness-runs.jsonl` + bloco de resumo. Avisa quando detecta provável espera humana (ver `.claude/PLAYBOOK-TELEMETRIA.md`). |
| `harness-dashboard.mjs` | **helper** (não é hook de evento) | chamado por `/harness-report` (ou na mão: `node .claude/hooks/harness-dashboard.mjs --all --periodo=15d`) | **agregador da telemetria (3.1.0):** lê os `harness-runs.jsonl` (+ delegações), deduplica, aplica as réguas do PLAYBOOK, cruza com `~/.claude/projects` para medir **por agente/modelo** e gera `prds/_metrics/harness-dashboard-<de>_<ate>.html` (auto-contido, gráficos SVG, claro/escuro) + `.json`. Read-only sobre os projetos. |
| `codex-review.sh` | **helper** (não é hook de evento) | chamado por `/prd-exec` Fase 2 e `/codex-review` | dispara `codex exec review --uncommitted`, salva o relatório e devolve o caminho. Defensivo: `exit 0` em qualquer pré-condição faltando (sem codex no PATH, sem login, fora de git, working tree limpo) — nesses casos as skills caem no modo **sherlock-solo** (o review não some). |

> **Diagnóstico de execução lenta:** duração alta com `out_tps` baixo é **espera humana**
> (prompt de permissão pendurado, pausa do operador), não lentidão de modelo. O roteiro
> forense completo está em **`.claude/PLAYBOOK-TELEMETRIA.md`** — leia antes de mexer em
> preset/modelo por causa de duração.

**Toda a configuração dos hooks fica em `.claude/harness.env`** (versionável — só caminhos
e flags, **nunca segredos**). Variáveis:

- `HARNESS_LINT_CMD` — comando de checagem de sintaxe (use `{file}` como placeholder).
  Ex.: `'node --check {file}'`, `'<php> -l {file}'`, `'python -m py_compile {file}'`.
  **Vazio = lint desligado.**
- `HARNESS_LINT_EXT` — extensões a verificar (csv, sem ponto). Ex.: `'php'`, `'js,mjs,cjs'`.
  **Vazio = lint desligado.**
- `HARNESS_LINT_CMD_EXTRA` — (opcional) análise estática adicional **não-bloqueante**
  (phpstan, eslint…). Roda após a sintaxe passar; falha vira aviso ao Claude
  (`additionalContext`), nunca bloqueia. Binário ausente = silêncio.
- `HARNESS_CODEX_REPORTS` — pasta dos relatórios de review (Codex **e** sherlock).
  Default: **`codex-reviews/` na raiz do repo** (persistente e auditável; mantenha no
  `.gitignore`). Path relativo é ancorado na raiz do repo.
- `HARNESS_NOTIFY_CMD` — comando de alerta local do hook `notify.sh` (use `{message}` como
  placeholder). Exemplos por SO no próprio `harness.env`. **Vazio = sem alerta** (a espera
  segue sendo logada para a telemetria).
- `HARNESS_GUARD_BASH` — guarda de temporários do `guard-bash.sh`. `'1'` = ligada (default,
  mesmo sem o env); `'0'` = desligada.
- `HARNESS_GUARD_SPIRAL` / `HARNESS_GUARD_SPIRAL_N` / `HARNESS_GUARD_SPIRAL_WINDOW_MIN` —
  anti-espiral do `guard-bash.sh` (1.9.0): liga/desliga, nº de tentativas do mesmo comando
  antes do corte (default 3) e janela em minutos (default 15). Só arma com o wiring
  `--post` ×2 no `settings.json` (fusível anti-falso-positivo).
- `HARNESS_DASHBOARD_BASE` / `HARNESS_DASHBOARD_TRANSCRIPTS` — (3.1.0) pasta-pai varrida pelo
  `/harness-report --all` (vazio = pai do repo) e se o dashboard cruza com os transcripts do
  Claude Code para a seção por agente (`'1'` default; `'0'` = só o jsonl, seção n/d).
- `HARNESS_MAX_ACTIVE_SESSIONS` — limite recomendado de sessões autônomas paralelas na
  máquina (default 2); o doctor `--autonomia` avisa acima disso (nunca bloqueia).

Os hooks funcionam mesmo se o `harness.env` não existir (usam defaults seguros), mas o
lint só liga quando você configura `HARNESS_LINT_CMD` + `HARNESS_LINT_EXT`.

---

## Permissões e `.gitignore`

### O modelo de permissões do harness (revisto na 1.9.0)

Como o Claude Code decide se um comando roda: **deny → ask → allow** determinísticos
(primeiro match vence) e, **só depois**, em auto mode, o que não casou com regra nenhuma vai
para o **classificador** (um modelo remoto que julga a segurança). Dois fatos mudam o desenho
da allowlist:

1. **Em auto mode, regras LARGAS que dão execução arbitrária são SUSPENSAS** —
   `Bash(php:*)`, `Bash(composer:*)`, qualquer interpretador wildcarded. Elas caem no
   classificador mesmo assim: dão sensação de cobertura e não cobrem nada lá.
2. **O classificador pode ficar indisponível** — e aí ele nega TUDO em fail-closed
   (incidente real: exec da PRD-007 do aec-backend, 09/07/2026, com a sessão espiralando em
   re-tentativas). O que sobrevive ao outage: operações read-only (não passam pelo
   classificador) e **regras ESTREITAS e orientadas a tarefa**, que resolvem ANTES dele.

Por isso a baseline do harness (1.9.0) é uma **allowlist estreita, versionada, no
`.claude/settings.json` DO PROJETO**: `Bash(php artisan test *)`,
`Bash(composer dump-autoload)`, `Bash(vendor/bin/phpunit *)` — comando + subcomando fixos,
`*` só nos argumentos. Gere a partir do Perfil (seção "Execução autônoma — comandos
conhecidos-seguros") e revise antes de colar:

```bash
bash .claude/harness-doctor.sh --gen-allowlist
```

A `/prd-exec` oferece isso no Passo 0.2 (decolagem — o último momento com humano presente).
Regras de leitura: comando composto (`a && b`) exige que **cada** subcomando case com uma
regra; banco de dados nunca entra direto (wrapper versionado do banco de TESTE,
`.claude/scripts/db-test.sh`, e allowlist do wrapper); o `permissions.allow` do projeto só
vale depois de aceitar o **diálogo de confiança do workspace** (uma vez, interativo).

> **`db-test.sh` é canônico do harness e worktree-aware (DT-003, 01/09/2026):** lê o banco
> do Perfil (`| **Database** |`), mas dentro de um worktree isolado usa o **clone** do
> worktree (campo `db=` do `.claude/.harness-run/worktree.env`) — antes, um adaptador por
> projeto com banco hardcoded consultava o banco do checkout principal em silêncio, minando
> o pré-flight de safe-mode das `/dt-exec`/`/prd-exec` em worktree. Overrides:
> `DBTEST_DB`/`DBTEST_HOST`/`DBTEST_USER`/`DBTEST_PASS`/`DBTEST_BIN`. Projetos que ainda
> carregam o adaptador antigo convergem no próximo sync (o script viaja em `.claude/scripts`).

**Paralelismo (regra operacional):** no máximo **2 execuções autônomas simultâneas** por
máquina (`HARNESS_MAX_ACTIVE_SESSIONS`) — 3+ sessões overnight estrangulam o classificador
compartilhado e multiplicam negação por indisponibilidade. O doctor `--autonomia` avisa.

**Se o classificador cair no meio de uma execução:** o protocolo de destrave (Shift+Tab,
`/permissions` → "Recently denied", `--gen-allowlist`, reduzir sessões) está no
**`.claude/PLAYBOOK-TELEMETRIA.md`, seção "Classificador de permissão indisponível"**. Os
hooks `denied.sh` e o anti-espiral do `guard-bash.sh` alertam e cortam a espiral
automaticamente.

### Cortar prompts de permissão repetidos (modo assistido)

O harness traz um molde de permissões pré-aprovadas (git status/diff/log, doctor, lint,
codex, testes). Copie-o para o `settings.local.json` (pessoal, fora do versionamento):

```powershell
Copy-Item -Force ".claude\settings.local.json.example" ".claude\settings.local.json"
```

Depois **enxugue** a lista para só os comandos em que você confia naquele repo. Como é
pessoal e não versionado, cada dev mantém o seu — por isso o molde vive em
`settings.local.json.example` (versionado) e o arquivo efetivo, não.

**Allowlist de PREFIXO para os CLIs do Perfil (1.8.0).** Continua valendo para o modo
**assistido** (fora do auto mode): em vez de dezenas de "always allow" exatos que nunca
casam de novo, declare entradas de **prefixo** para o interpretador, o cliente de banco e o
test runner do Perfil, revisadas uma vez pelo humano:

```json
"Bash(\"C:/laragon/bin/php/php-8.1.10-Win32-vs16-x64/php.exe\" :*)",
"Bash(\"C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysql.exe\" :*)"
```

> ⚠️ Em **auto mode** essas entradas largas são suspensas (fato 1 acima) — elas cortam
> prompt no dia-a-dia assistido, mas quem protege a execução autônoma é a allowlist
> **estreita** do `settings.json` do projeto.

O doctor confere as duas coberturas e avisa: `bash .claude/harness-doctor.sh --autonomia`
(o mesmo check que a `/prd-exec` roda no Passo 0.2, antes de decolar).

### `.gitignore` recomendado no repo-alvo

```gitignore
# harness — pessoal/efêmero, não versionar
.claude/settings.local.json
.claude/.harness-run/
/codex-reviews/
prds/_metrics/harness-runs.jsonl        # telemetria local — contamina forks/cópias se versionada
prds/_metrics/harness-dashboard-*        # saída do /harness-report (3.1.0)
prds/_metrics/transcripts*/              # transcript cru copiado a mão — pode carregar segredo (3.5.0)
# NUNCA ignore prds/_metrics/ inteiro: runs/ tasks/ incidentes/ delegations/ duelos/ (por dev/máquina) DEVEM viajar
tests/e2e/screenshots/
test-results/
playwright-report/

# stack
node_modules/
.env
.env.*
```

Todo o resto dentro de `.claude/` **deve** ser versionado (skills, hooks, memória,
`settings.json`, `harness.env`, `harness-doctor.sh`) — é isso que faz o fluxo viajar junto
com o repo. A única exceção é o `settings.local.json` pessoal acima.

---

## Onde vivem os "agents"

Há **dois tipos** de "agent" no harness: **agents-arquivo** (em `.claude/agents/*.md`, que
viajam com o `.claude/` ao portar) e **subagents inline** que as skills disparam na hora.

### Agents-arquivo (`.claude/agents/`)

Agentes especializados, versionados, invocados pela ferramenta Agent (ou quando o gatilho da
`description` casa com o pedido). Vêm na cópia-mestre e **viajam junto com o `.claude/`** no
port. Dividem-se em dois grupos:

**Técnicos (stack-agnósticos — úteis em qualquer projeto):**

- **`beholder`** — red-team de uma PRD **antes** do `/prd-exec`. Lê PRD de produto + técnica
  + tasks e devolve achados por severidade (ambiguidade, critério de aceite fraco, caso de
  borda, integração com efeito colateral, segurança, datas de negócio, divisão de tasks) com
  veredito pronto/não-pronto. Read-only. Complementa o `/codex-review` (que revisa **código
  depois**) — o beholder revisa a **spec antes**. No `/prd` roda em **ciclos** (revisão →
  correção → re-revisão; em re-run verifica primeiro se os achados anteriores foram
  resolvidos), limitados pelo campo "Ciclos do beholder" do Perfil — default 4, `0` = sem
  limite; esgotou sem zerar os 🔴, a decisão de seguir/abortar é **humana**. Gatilho:
  *"passa o beholder na PRD-NNN"*.
- **`michelangelo`** — **gate de UI/UX** do harness, simétrico ao beholder mas para o front.
  Tem três modos: **(C) revisão de proposta** — entra **automático** no fim de **toda** `/prd` que
  tem trabalho de interface (Passo 10, em paralelo ao beholder): lê a seção "Frontend / Interface"
  da PRD Técnica + os componentes de UI nas tasks e critica o **design proposto** (hierarquia, carga
  cognitiva, estados, WCAG, prevenção de erro, consistência, responsividade, microcopy) por
  severidade, com veredito e gate, em ciclos — salva `REVIEW-michelangelo.md`. **(A) auditoria** —
  audita telas que existem via preview (usado na **Fase 2.9 do `/prd-exec`** para validar a tela
  *construída* contra o que a PRD propôs). **(B) consultoria** — aconselha fluxo/arquitetura antes
  de construir. **Não constrói** — quem projeta e ergue o front é o `dedalo`; nem duplica o beholder,
  que cobre ortografia/markup — o michelangelo cobre a **experiência**. Simetria: o dedalo faz o
  design ↔ o michelangelo critica o design. Gatilho: automático na `/prd`/`/prd-exec`/`/dt-exec`
  quando há UI, ou *"michelangelo, audita a tela X"*.
- **`dedalo`** — **o autor do front** (2.9.0). Até a 2.8.0 o design nascia dentro da sessão que
  escrevia a PRD técnica, com o contexto lotado — e saía genérico; o michelangelo era o único
  responsável pelo front, mas ele **critica**, não constrói. O dedalo tem três modos: **(P)
  projeto** — no **Passo 7.1 da `/prd`**, ancora no que o projeto já é (`design-system/MASTER.md`,
  tokens CSS reais, componentes existentes, a maquete aprovada da ariadne) e entrega a seção
  "Frontend / Interface" pronta, com estados, contraste **calculado** e microcopy PT-BR final;
  **(O) obra** — na `/prd-exec` e no `/dt-exec` ele constrói as tasks `Tipo: front` no lugar do
  hefesto, carregando o mesmo contrato de execução **mais** o julgamento de front; **(R) correção**
  — corrige os 🔴 do michelangelo sem desmanchar o sistema. Regra de ouro: **reusar vence inventar**,
  e ancoragem não citada a um arquivo real é invenção declarada. Só consulta a `ui-ux-pro-max`
  (versionada em `.claude/skills/`) quando não há precedente. Gatilho: automático quando a PRD tem
  UI, ou *"dedalo, monta essa tela"*.
- **`ariadne`** — **a maquetista**. Transforma uma ideia em **mockup HTML navegável e
  auto-contido** (abre com duplo clique, sem build, sem CDN) *antes* de existir PRD técnica, task ou
  código — com variantes que discordam numa decisão de fundo, todos os estados no andaime
  (com dados/vazio/carregando/erro) e dados fake plausíveis em PT-BR. Extrai o partido visual **real**
  do projeto antes de desenhar; só inventa quando não há precedente — e declara. Sonnet fixa, roda
  **sob demanda**: skill `/mockup`, item 6 da entrevista da `/prd` (tela nova) ou Fase 4.1 da `/dt`
  (o "como deveria ser" de um débito de interface). A maquete aprovada **não é descartada**: vira
  entrada do dedalo. Gatilho: *"faz um mockup"*, *"como ficaria essa tela"*, `/mockup`.
- **`tony-stark`** — agente de **inovação**. A skill `/prd` o dispara no Passo 2 (discovery
  paralelo) de **toda** PRD: propõe melhorias em dois eixos — tecnologia/técnica melhor e
  fluxo/feature de mais valor — ancoradas na compatibilidade de produção do Perfil e
  classificadas por impacto/esforço/risco (🟢 agora / 🟡 avaliar / 🔵 backlog-DT). É o
  oposto complementar do beholder: o beholder pergunta *"o que quebra?"*; o tony-stark, *"como
  fazer melhor?"*. Gatilho: automático na `/prd`, ou *"tony stark, o que dá pra melhorar?"*.
- **`atlas`** — **arquitetura + análise de impacto** (blast radius). Modo impacto: dada uma
  mudança, mapeia no código real os consumidores diretos/indiretos, contratos afetados e
  pontos de regressão (🔴/🟠/🟡/⚪, tudo com `arquivo:linha`). Modo arquitetura: avalia
  módulo/decisão (acoplamento, fronteiras, dívida estrutural, sempre com caminho
  incremental). Fecha o ciclo do panteão: tony-stark (*"como fazer melhor?"*) → atlas
  (*"o que isso afeta?"*) → beholder (*"o que quebra?"* — que cobra a cobertura dos pontos
  do atlas na 13ª lente). Gatilho: automático na `/prd` quando o escopo toca módulo
  existente (Agent F), ou *"atlas, qual o impacto de mudar X?"*.
- **`sherlock`** — **revisor de código Claude**. Par do Codex na revisão **dupla-cega**
  (Fase 2 do `/prd-exec` e `/codex-review`): os dois revisam o working tree em paralelo
  sem ver um ao outro; achado confirmado pelos dois = alta confiança. Sem Codex no
  ambiente, revisa **sozinho** — o review nunca é pulado em silêncio. Triagem pela régua
  do Perfil (Armadilhas, datas, auth, idempotência, compat de produção). Reporta, não
  corrige. Gatilho: automático nas skills de review, ou *"sherlock, revisa isso"* (review
  de bolso).
- **`hefesto`** — **executor de task** com contrato fixo: lê o Perfil e a task inteira,
  implementa só o escopo dela, valida sintaxe, **nunca commita** e devolve relatório
  padronizado (arquivos tocados, verificações, desvios/BLOQUEADA). A Fase 1 do `/prd-exec`
  o usa para paralelizar tasks independentes com as regras críticas embutidas no agente
  (não dependem do prompt). Gatilho: automático no `/prd-exec`, ou *"hefesto, executa a
  TASK-003 da PRD-012"*.

- **`prometeu`** (3.0.4) — **manutenção do próprio harness**: analisa UM projeto contra a fonte
  (o clone local do harness base), rodando o `harness-sync.sh --check` e coletando o contexto que
  o script não vê (git/branch/working tree, Perfil e seu frescor, `HARNESS_RAG_ENABLED`,
  `HARNESS_TARGETS`). Devolve veredito estruturado com estado (`alinhado` / `desatualizado` /
  `parcial` / `nao-harness` / `sem-harness`), defasagem, extras preservados, ação sugerida e
  risco. **Read-only**: nunca `--apply`, nunca commit, nunca push — quem aplica é a skill
  `/prometeu`, sob confirmação. É o worker por-projeto do modo hub (N em paralelo). Gatilho:
  *"prometeu, checa o harness deste projeto"*.

> **Modelos (política Sonnet-first, desde a 1.2.0):** TODOS os agentes genéricos rodam em
> **Sonnet por padrão** — o fluxo automático (`tony-stark` e `beholder` em toda PRD,
> `atlas` quando toca módulo existente, `michelangelo` quando a PRD tem UI, `sherlock` em
> todo review) precisa ser barato o bastante para qualquer conta; era o Opus fixo desses
> agentes que estourava o consumo.
> O Perfil pode promover **agente a agente** para Opus na seção "Agentes do harness
> (modelos)" — as skills leem o campo e passam o override na invocação. `hefesto` é
> sempre Sonnet (sem opt-in). Os corporativos Beta (`datilografo`/`zelador`) seguem em
> Opus — rodam fora do fluxo de PRD, sob demanda, e não são propagados pelo sync.

**Corporativos Beta (dependem do `asana-team.md` do vault — específicos da operação interna):**

- **`datilografo`** — triagem: demanda crua (msg/áudio/e-mail) → task estruturada no Asana
  (cliente/projeto/tipo/urgência/responsável/prazo), padrão dual curl PAT + `ASANA_TASK_SPEC`.
  Gatilho: *"joga isso no Asana: …"*.
- **`zelador`** — auditoria/faxina do board Asana (fantasmas, duplicatas, órfãs, sem
  prazo/responsável, atrasadas), read-only por padrão, corrige sob confirmação, ciente da
  exceção SAMA. Gatilho: *"zelador, audita o Asana"*.

> Estes dois são **específicos da Beta**: leem o `asana-team.md` (que vive no vault) e operam
> sobre o Asana interno. Viajam no harness por conveniência (acessá-los de qualquer repo na
> máquina), mas num repo de **cliente** versionado dá para removê-los do `.claude/agents/` se
> não quiser a operação interna junto — o `harness-doctor.sh` os trata como opcionais.

> **Para criar outro agent-arquivo**, copie o estilo destes: frontmatter
> `name`/`description`/`tools`/`model`, corpo com fluxo e regras, e **tudo** específico de
> projeto lido do `PERFIL-PROJETO.md` em runtime — nunca hardcoded na descrição do agent
> (mesma regra de portabilidade das skills). Melhorou um deles num projeto? Traga de volta
> para cá (ver "Como manter esta cópia-mestre").

### Subagents inline (sem arquivo)

1. **Discovery do `/prd`.** A skill dispara, *numa única mensagem em paralelo*, subagents de
   pesquisa (DTs, schema/migrations, código existente, PRDs anteriores) via ferramenta Agent.
   Existem só durante a skill — não são arquivos.
2. **Revisor Codex (CLI externo).** Metade da dupla-cega: o `codex` CLI, via helper
   `codex-review.sh` (`codex exec review --uncommitted`) — a outra metade é o agente
   `sherlock` (acima). Para diffs **já commitados**, o `/codex:review` do **plugin Codex**
   (opcional) é alternativa.

> **Plugin `frontend-design` (opcional).** O `settings.json` **não** habilita plugins de
> propósito (`enabledPlugins` ausente). Se um projeto for de frontend e você quiser o
> plugin de design, habilite-o no `settings.json` daquele repo — não é dependência do
> harness.

---

## Sistema de memória (dupla)

Há duas memórias, com papéis diferentes:

- **Memória pessoal (auto-memory)** — em `~/.claude/projects/<slug>/memory/`. É
  **por-usuário** e **não versionada**. Guarda preferências individuais de quem está
  trabalhando.
- **Memória do projeto (versionada)** — em `.claude/memory/` dentro do repo. É
  **versionada** e **compartilhada pelo time**. Use para o que *todo mundo* do projeto
  deveria saber: convenções não óbvias, decisões de arquitetura, armadilhas recorrentes.

O hook `sync-memory.sh` copia, a cada início de sessão, os `.md` da memória do projeto para
a memória pessoal — assim o conhecimento curado **viaja junto com o repo**. Qualquer dev
que clonar recebe estas memórias.

> ⚠️ **Cuidado:** o sync **sobrescreve** arquivos de mesmo nome na memória pessoal. Não
> coloque na pasta versionada nada que conflite com uma memória pessoal que você quer
> preservar.

Para criar uma memória de projeto: copie `_TEMPLATE-memoria.md`, preencha o frontmatter
(`name`, `description`, `metadata.type` — um de `user`/`feedback`/`project`/`reference`) e
registre **uma linha** no índice `MEMORY.md`.

---

## RAG e captura de conhecimento

> **Módulo OPT-IN — vem DESLIGADO por default** (`HARNESS_RAG_ENABLED='0'` no `harness.env`).
> Mesmo copiando o harness inteiro, ele fica **dormente**: os hooks `rag-*.sh` checam a flag e
> saem como no-op (não tocam Node nem API, custo ~zero). Operação no dia a dia em
> [`.claude/RAG.md`](.claude/RAG.md); decisões e guia de portabilidade em
> [`.claude/RAG-PORTING.md`](.claude/RAG-PORTING.md).

Camada opcional que **captura aprendizados técnicos** (ao fim de cada subagent e de cada sessão,
via `summarize.ts` → `.claude/knowledge/*.md`) e **injeta os trechos relevantes** de volta no
contexto a cada prompt (busca semântica local sobre o conhecimento capturado + `.claude/memory/` +
DTs). Os embeddings são **100% locais** (MiniLM/ONNX); o único egress é o passo de resumo via LLM,
com guards anti-PII. A **fonte** (`.md`) é versionada; o **índice** (`rag.db`) é derivado por
máquina (reconstruído no `SessionStart` após um `git pull`).

**Quando ligar:** só em projeto **longo e contínuo**, onde o aprendizado se acumula (bugs com
causa-raiz, convenções, decisões). Em projeto curto/one-off, deixe desligado — o núcleo (PRD,
lint, memória, review) funciona sem ele.

**Ativar num projeto (3 passos):**

1. **Instalar as deps** (não vêm instaladas no mestre), na raiz do repo:
   ```bash
   npm install
   ```
2. **Ligar a flag** em `.claude/harness.env`:
   ```bash
   HARNESS_RAG_ENABLED='1'
   ```
3. **Exportar a chave** do summarizer `ts` (Node-only) no ambiente — **nunca** no `harness.env`
   versionado:
   ```bash
   export ANTHROPIC_API_KEY='sk-ant-...'
   ```

Depois, construa o índice e teste a busca:

```bash
npm run rag:reindex
npm run rag:search -- "uma pergunta do domínio"
```

Os 4 hooks (`SessionStart`, `UserPromptSubmit`, `SessionEnd`, `PostToolUse Agent|Task`) já estão
registrados no `settings.json` — só passam a agir com a flag ligada. Para **desligar** de novo:
volte `HARNESS_RAG_ENABLED='0'` (kill-switch global) ou use os bypasses pontuais
`HARNESS_SKIP_RAG_CAPTURE=1` / `HARNESS_SKIP_RAG_INJECT=1`. O `harness-doctor.sh` tem uma seção
**RAG** que confere scripts, hooks, deps (WARN se faltar — é template) e o estado da flag.

---

## Templates de PRD / Task / DT / Roadmap

Em `prds/_templates/` (todos stack-agnósticos, lendo o Perfil):

- **`TEMPLATE-PRD.md`** — PRD de produto (resumo executivo, requisitos, critérios de aceite).
- **`TEMPLATE-PRD-TECNICA.md`** — desenho técnico. Inclui a lição **"Specs UX devem usar o
  fluxo real (NÃO invocações diretas via JS)"** e a seção "Contrato de API".
- **`TEMPLATE-TASK.md`** — task executável por modelo (validações apontando para o Perfil).
- **`TEMPLATE-DT.md`** — documento de débito técnico (sincroniza o `INDEX.md` no mesmo commit).
- **`TEMPLATE-CLAUDE.md`** — doc raiz de convenções; copie para a raiz do repo como
  `CLAUDE.md` (ver Passo 5 da portabilidade). Curto, aponta o Perfil como fonte de verdade.
- **`TEMPLATE-ROADMAP-TESTE-MANUAL.html`** — roteiro de teste manual interativo. Marca
  Aprovado/Rejeitado em qualquer modo; o sumário por IA é opcional (configurável via
  `prd.endpoint_relatorio` ou colando a API key no `localStorage`).

Há **dois índices** que andam junto com os documentos: `prds/INDEX.md` (todas as PRDs) e
`prds/debito_tecnico/INDEX.md` (todos os DTs). As skills `/prd` e `/dt` já atualizam o
índice correspondente ao criar cada documento — mantenha-os assim em edições manuais também.

---

## Pré-requisitos

Para o harness funcionar 100% num repo-alvo:

- **`bash`** — os hooks são shell scripts. No Windows, use o bash do **Laragon** ou do
  **Git Bash** (o `settings.json` chama `bash .claude/hooks/...`).
- **`codex` CLI** (para o review) — `npm i -g @openai/codex` e depois `codex login`
  (cria `~/.codex/auth.json`). Sem isso, o review é **pulado sem travar** nada.
- **Skill UI UX Pro Max** (obrigatória) — `npm install -g uipro-cli` + `uipro init --ai claude`
  na raiz do repo. Requer **Python 3.x** (`python3 --version`) para o script de busca. Ver
  [seção dedicada](#skill-externa-obrigatória--ui-ux-pro-max).
- **`jq`** (opcional, recomendado) — o `lint.sh` usa para ler o JSON do evento; há
  *fallback* com `grep`/`sed` se faltar.
- **Framework de E2E** (opcional) — só se o projeto tiver testes E2E (ex.: Playwright);
  declare no Perfil. Se for "Nenhum", as skills geram checklist manual.

Rode `bash .claude/harness-doctor.sh` para checar todos estes pré-requisitos de uma vez.

---

## Bypasses de emergência

Para desligar algo pontualmente, exporte a variável (ou descomente no `harness.env`):

| Variável | Desliga |
|---|---|
| `HARNESS_SKIP_LINT=1` | o lint bloqueante (`lint.sh`) |
| `HARNESS_SKIP_CODEX_REVIEW=1` | o disparo do Codex (`codex-review.sh`) — o sherlock segue (modo solo) |
| `HARNESS_SKIP_SHERLOCK=1` | o sherlock no review — o Codex segue (modo solo) |
| `HARNESS_SKIP_MEMORY_SYNC=1` | a sincronização de memória (`sync-memory.sh`) |
| `HARNESS_SKIP_SAFE_MODE_PREFLIGHT=1` | o gate da Fase 0 do `/prd-exec` |
| `HARNESS_SKIP_NOTIFY=1` | o alerta + log de espera humana (`notify.sh`) |
| `HARNESS_SKIP_GUARD_BASH=1` | a guarda de temporários fora do projeto (`guard-bash.sh`) |

---

## Como manter esta cópia-mestre

Esta pasta (`projetos/referencias/harness/`) é a **fonte**. Quando você melhorar uma skill,
hook ou template **durante o trabalho em algum projeto**, traga a melhoria de volta para cá
— assim o próximo repo já nasce com ela. Regra prática:

1. Melhoria genérica (serve para qualquer stack) → **edite aqui** na cópia-mestre.
2. Ajuste específico de um projeto → fica **no Perfil daquele repo**, não aqui.
3. Mantenha o núcleo (skills/hooks/templates) **sem nada hardcoded** de projeto: se você
   se pegar escrevendo um caminho, credencial ou regra de negócio específica dentro de uma
   skill, isso é sinal de que o valor deveria estar no `PERFIL-PROJETO.md`.
4. **Editou uma skill canônica (`.claude/skills/`)?** Rode
   `bash .claude/scripts/gen-adapters.sh` e commite os stubs `.agents/skills/`
   regenerados **no mesmo commit** — stub defasado é a única forma de as duas
   plataformas divergirem. Nunca edite um stub à mão (são marcados como GERADO).

**Ao fechar uma versão nova**, cinco carimbos andam juntos no mesmo commit:

1. `HARNESS_VERSION` no `.claude/harness.env`;
2. a entrada no [CHANGELOG.md](CHANGELOG.md) (o histórico técnico completo);
3. a entrada na seção **"Decisões por versão"** do
   [`.claude/ONBOARDING.md`](.claude/ONBOARDING.md) — **só** o que exige decisão/ação de
   quem recebe o update (campo novo no Perfil, default que mudou, `.gitignore`). Se não
   exige nada, escreva "Ação: nenhuma". É esta entrada que o dev lê no repo portado.
4. o cabeçalho de versão deste **README** (linha 3) e o carimbo no topo do
   `harness-config.html` (comentário da 1ª linha) — espelham o `HARNESS_VERSION`; é fácil
   esquecê-los, então estão na lista (o doctor cobra o do HTML). Mexeu nos campos do Perfil?
   O `PERFIL_MAP` do `harness-ui.mjs` e a lista `GRUPOS` do HTML andam juntos.
5. os stubs `.agents/` regenerados (`bash .claude/scripts/gen-adapters.sh`) — se alguma
   skill canônica mudou na versão, o adapter tem que acompanhar no mesmo commit.

**Propagar as melhorias para os repos já portados.** Quando você atualiza esta cópia-mestre,
os repos que já a usam ficam defasados. O **`harness-sync.sh`** resolve — e desde a 2.0.0 é
**multi-target**: `--check <repo>` compara o núcleo do repo com a mestre (por `cmp`, exato),
`--dry-run <repo>` mostra o que o apply faria **sem escrever nada**, e `--apply <repo>` copia
o que está defasado/faltando **preservando o local** (perfil, settings.local, harness.env
salvo a versão/targets, memory, knowledge, PRDs reais; e os agentes corporativos Beta não são
propagados). `--target claude|codex|all` escolhe as superfícies (ausente = lê o
`HARNESS_TARGETS` do harness.env do alvo; default `claude`). Antes de sobrescrever, o apply
faz **backup** em `.claude/.harness-run/sync-backup/<timestamp>/`; e os arquivos **guardados**
(`AGENTS.md`, `.codex/hooks.json`) só são atualizados quando carregam o marcador
`harness:managed` — sem ele, saem como linha `CONFLITO|guardado|...` e o local é
**preservado** (mesclar é decisão humana, ver ONBOARDING 2.0.0). Ao aplicar, ele imprime a
linha `ONBOARDING|de -> para|...` lembrando o dev de revisar as "Decisões por versão". No
vault, o agente+skill **DEUS** (`/deus`) orquestra isso em massa: varre os projetos vizinhos,
roda o `harness-sync.sh` em cada um (em paralelo) e conduz a atualização sob confirmação.
Rode o `/deus` periodicamente para manter a frota alinhada à mestre.

**E quem não tem o vault?** Desde a 3.0.4 o núcleo carrega o par **`prometeu`** (agente + skill
`/prometeu`), que faz o mesmo trabalho tendo como fonte o **clone local do harness base** — a
réplica publicada. É a versão da equipe do `/deus`: mesmo `harness-sync.sh`, mesmos rótulos de
estado, mesma preservação do local; a diferença é que a fonte é read-only e que **commit e push
são sempre perguntados**. Ver [`/prometeu`](#prometeu--atualizar-e-portar-sozinho).

> **Quando você mexer nesta cópia-mestre, o par `prometeu` viaja junto** (`CORE_AGENTS` +
> `.claude/skills/`). Ele **não** conhece o vault, o `deus-config.md`, as réplicas nem os agentes
> corporativos Beta — de propósito: o que sai daqui para a equipe não pode carregar a operação
> interna.
