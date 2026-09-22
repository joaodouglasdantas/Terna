# Plataformas do harness — Claude Code × Codex CLI (multi-AI)

> **O que é este arquivo.** A partir da 2.0.0 o harness roda em **Claude Code**, em
> **Codex CLI**, ou nos dois. O **corpo canônico** de cada workflow continua num lugar
> só (`.claude/skills/*/SKILL.md`, `.claude/agents/*.md`); o que muda por plataforma é
> a **superfície** (como o runtime descobre instruções/skills/agentes/hooks) e o
> **vocabulário** (nomes de ferramentas, eventos, modelos). Este documento é a tabela
> de tradução — as skills e agentes canônicos mandam ler este arquivo quando a sessão
> não estiver rodando no Claude Code.
>
> **Regra de ouro:** nunca edite um adapter gerado (`.agents/skills/*`, marcados como
> GERADO) — edite o canônico e rode `bash .claude/scripts/gen-adapters.sh`.
> Convenções Codex verificadas na doc oficial em 17/07/2026
> (learn.chatgpt.com/docs/*, ex-developers.openai.com/codex; CLI 0.144.x). Se algo
> divergir na sua versão, a doc atual vence — e avise a cópia-mestre.

---

## 1. Onde cada plataforma descobre o quê

| Superfície | Claude Code | Codex CLI | Fonte canônica |
|---|---|---|---|
| Instruções do repo | `CLAUDE.md` (raiz) | `AGENTS.md` (raiz; teto 32 KiB combinados) | os dois são **capas finas** → Perfil + convenções |
| Fonte de verdade do projeto | `.claude/PERFIL-PROJETO.md` | idem (lido via ponteiro no `AGENTS.md`) | ele mesmo |
| Skills | `.claude/skills/<n>/SKILL.md` | `.agents/skills/<n>/SKILL.md` (stub gerado) | `.claude/skills/<n>/SKILL.md` |
| Agentes | `.claude/agents/<n>.md` | `.codex/agents/<n>.toml` (adapter) | `.claude/agents/<n>.md` |
| Hooks | `.claude/settings.json` (wiring local) | `.codex/hooks.json` (exige projeto *trusted* + trust por hash via `/hooks`) | scripts em `.claude/hooks/` (compartilhados) |
| Config dos hooks | `hooks/_defaults.env` (decisões do harness) + `.claude/harness.env` (projeto) + `.local` (máquina) — 3.5.7 | idem — mesmos arquivos | eles mesmos |
| Permissões | `settings.json` `permissions.allow` (regras estreitas) + classificador em auto mode | sandbox (`read-only`/`workspace-write`/`danger-full-access`) + `approval_policy` + `.codex/rules/*.rules` (Starlark, experimental) | tabela "Execução autônoma" do Perfil |
| Memória do projeto | `.claude/memory/` → espelhada p/ `~/.claude/projects/<slug>/memory/` (hook `sync-memory.sh`) | `.claude/memory/` lida diretamente (ponteiro no `AGENTS.md`); sem espelho | `.claude/memory/` (versionada) |
| Telemetria | transcripts `~/.claude/projects/` | sessões `~/.codex/` (best-effort; sem parse → `n/d`) | `prds/_metrics/harness-runs.jsonl` |

**Invocação de skills:** Claude Code = `/prd`, `/prd-exec`, `/dt`, `/codex-review`,
`/harness-config`. Codex = `$prd` (menção com `$`), comando `/skills`, ou pedido em
linguagem natural que case com a `description` (invocação implícita).

## 2. Detectar o host em runtime

Ordem de resolução (implementada em `.claude/hooks/_host-detect.sh`):

1. `HARNESS_HOST` explícito no ambiente ou no `harness.env` (`claude` | `codex`) — vence sempre.
2. Sinais do runtime: variáveis `CLAUDECODE`/`CLAUDE_PROJECT_DIR` ⇒ `claude`;
   variáveis `CODEX_*` (ex. `CODEX_HOME` setada pelo runtime de hook) ⇒ `codex`.
3. Fallback: `claude` (comportamento histórico) — logado como palpite, nunca como certeza.

`HARNESS_TARGETS` (no `harness.env`) é outra coisa: diz quais **superfícies** este repo
mantém instaladas (`claude`, `codex` ou `claude,codex`). O `harness-sync.sh` e o doctor
leem esse campo; `HARNESS_HOST` diz onde a sessão atual está rodando.

## 3. Ferramentas — vocabulário equivalente

Quando o corpo canônico citar uma ferramenta do Claude Code e você estiver no Codex:

| No canônico (Claude) | No Codex | Observação |
|---|---|---|
| `Agent` tool / `subagent_type: "X"` | subagente nativo (`.codex/agents/X.toml`); peça "delegue ao agente X" | built-ins `default`/`worker`/`explorer` existem; custom com mesmo nome vence |
| Várias chamadas `Agent` numa mensagem (paralelismo) | delegação paralela nativa (`[agents] max_threads`, default 6) | `max_depth=1`: subagente não spawna subagente — fluxos aninhados são achatados pelo orquestrador |
| `AskUserQuestion` | pergunta em texto simples e aguarde resposta | as skills já têm fallback textual |
| `Read`/`Glob`/`Grep`/`Bash` | leitura/busca/shell nativos | nomes de tool internos diferem (`apply_patch`, shell unificado) — irrelevante para o corpo, relevante p/ matchers de hook |
| `Write`/`Edit` | edição nativa (`apply_patch`) | lint por hook cobre os dois hosts (matcher por plataforma) |
| `mcp__Claude_Browser__*` / `mcp__Claude_Preview__*` (browser pane) | browser integrado do Codex (feature `browser_use`/`in_app_browser`) ou Playwright (skill/CLI) | ver §7 — evidência visual |
| `WebSearch`/`WebFetch` | busca web do Codex (`web_search`), se habilitada | tony-stark degrada para "sem pesquisa temporal" e declara isso no relatório |
| `TaskCreate`/`TodoWrite` | lista de tarefas em texto no plano | cosmético |
| `/model`, `/permissions`, `/rename`, Shift+Tab | `/model`, `/permissions`, `/status` do Codex; sandbox/approvals via flags | protocolo do classificador (§6) é Claude-only |
| scratchpad da sessão (system prompt) | use `.claude/.harness-run/tmp/` (gitignored) | regra de temporários vale igual nos dois hosts |

## 4. Eventos de hook — o que existe onde

Scripts em `.claude/hooks/` são compartilhados; o **wiring** é por plataforma.
O Claude Code wira em `.claude/settings.json`; o Codex em `.codex/hooks.json`
(10 eventos oficiais; **sem `async`** — a opção é parseada e ignorada, então todo
hook roda síncrono lá).

| Propósito | Evento Claude | Evento Codex | Status no Codex |
|---|---|---|---|
| Espelhar memória no início | `SessionStart` | `SessionStart` | ✅ (o espelho `~/.claude` é irrelevante lá; o hook detecta o host e vira no-op) |
| Reindexar RAG no início | `SessionStart` (async) | `SessionStart` (síncrono) | ⚠️ degradado: roda síncrono; rápido quando o índice está fresco |
| Injetar conhecimento por prompt | `UserPromptSubmit` | `UserPromptSubmit` | ⚠️ best-effort: `additionalContext` não confirmado na doc p/ este evento — se ignorado, só não injeta |
| Guarda de temporários (Bash) | `PreToolUse` [Bash] | `PreToolUse` [matcher shell] | ⚠️ exit 2 bloqueia (confirmado), mas os NOMES de tool do matcher (`shell`/`local_shell`/…) não são documentados — se nenhum casar, a guarda não dispara (degradação silenciosa; valide com um comando-teste na sua versão) |
| Lint pós-escrita | `PostToolUse` [Write\|Edit] | `PostToolUse` [matcher edição] | ⚠️ idem: matcher cobre os nomes conhecidos (`apply_patch` etc.) sem confirmação oficial — valide na sua versão |
| Anti-espiral (classificador) | `PostToolUse`+`PostToolUseFailure` [Bash] | — | 🚫 **N/A por design**: não há `PostToolUseFailure` nem classificador no Codex; a guarda fica dormente (fusível) |
| Alerta de espera humana | `Notification` | — | 🚫 sem equivalente; o `notify` do config.toml (`agent-turn-complete`) é outro sinal — decisão local, não wired pelo harness |
| Negação do classificador | `PermissionDenied` | — | 🚫 N/A (sem classificador; `PermissionRequest` existe mas tem semântica de pré-decisão — não usado pelo harness) |
| Captura RAG da sessão | `SessionEnd` (async) | `Stop` + **throttle** | ⚠️ `Stop` dispara a cada turno; o hook aplica dedupe por sessão (`HARNESS_RAG_STOP_THROTTLE_MIN`, default 30 min) |
| Captura RAG por agente | `PostToolUse` [Agent\|Task] | `SubagentStop` | ⚠️ transcript do Codex tem formato próprio; o extrator tenta, senão cai no gate de tamanho e vira no-op |

**Trust (Codex):** `.codex/hooks.json` do repo só carrega com o projeto *trusted*
(`[projects."<path>"] trust_level = "trusted"` no `~/.codex/config.toml`) e cada hook
exige aprovação por hash via `/hooks` — **toda atualização de hook re-pende o trust**
(o sync avisa; o doctor confere o trust do projeto). Não há como o harness "auto-confiar"
— é decisão humana por máquina, e está certo assim.

## 5. Presets de capacidade → modelo por plataforma

O Perfil continua decidindo por **capacidade**, nunca por slug de modelo do outro lado.
Regra: **nos TOMLs do Codex o campo `model` é omitido**; o dial fino lá é
`model_reasoning_effort` (`minimal|low|medium|high|xhigh`).

> [!important] 3.5.2 — quem escolhe o slug é o harness, não o `config.toml`
> A delegação **e o preflight** passam `--model` explícito, vindo de
> `HARNESS_DELEGATE_CODEX_MODEL` (default `gpt-5.6-sol`). Antes o modelo vinha do
> `~/.codex/config.toml` — arquivo **global e reescrito pelo app do Codex Desktop** a cada
> update: em 11/09/2026 ele gravou `gpt-6-astra` e derrubou o `codex-cli` em todos os
> projetos de uma vez. Slugs seguem mudando rápido (`gpt-5.2`/`gpt-5.3-codex` já foram
> deprecados), mas agora a troca é **uma linha no `harness.env`**, versionada com o projeto.
> Knob vazio (`''`) volta a herdar o config global, se algum dia isso for desejável.

| Capacidade | Papéis | Claude (Perfil/preset) | Codex |
|---|---|---|---|
| Exploração rápida | peter-quill | sonnet | herda modelo; effort `low` |
| Execução | hefesto | sonnet (sempre) | herda; effort `medium` |
| Julgamento arquitetural | atlas, tony-stark, beholder | sonnet → opus no preset `maximo` | herda; effort `high` |
| Review profundo | sherlock | sonnet → opus no preset `maximo` | herda; effort `high` |
| UX | michelangelo | sonnet → opus no preset `maximo` | herda; effort `medium` + evidência visual (§7) |

Override por projeto: seção "Agentes do harness (modelos)" do Perfil segue mandando no
Claude; para o Codex, o override é editar o TOML do agente no repo (campo
`model_reasoning_effort`, ou `model` se você **quiser** fixar um slug conscientemente).

## 6. Permissões e segurança — modelos diferentes, política única

A política canônica é a tabela **"Execução autônoma — comandos conhecidos-seguros"** do
Perfil + as seções de integrações/safe-mode. Cada plataforma a materializa no seu modelo:

- **Claude Code:** `permissions.allow` estreito no `settings.json` do projeto
  (`bash .claude/harness-doctor.sh --gen-allowlist`), porque em auto mode regra larga é
  suspensa e o **classificador remoto pode ficar indisponível** (nega tudo em
  fail-closed — incidente de 09/07/2026). Defesas 1.9.0 (denied.sh, anti-espiral,
  máx 2 sessões) são **específicas deste host** e continuam.
- **Codex:** não há classificador remoto — aprovação é **determinística**: sandbox
  (`workspace-write` sem rede por default) + `approval_policy` + `.rules`
  (`bash .claude/harness-doctor.sh --gen-rules` converte a mesma tabela do Perfil em
  `prefix_rule()` Starlark para revisar e salvar em `.codex/rules/`). O análogo do
  "workspace trust" é o `trust_level` do projeto.
- **Nunca** copie `permissions.allow` literalmente para o Codex nem vice-versa; os dois
  derivam da mesma tabela do Perfil.
- **Safe-mode** (WAHA, Calendar, S3, pagamentos, e-mail, APIs de IA): a Fase 0 da
  `/prd-exec` é a mesma skill canônica nos dois hosts — o gate roda igual. No Codex,
  lembre que `workspace-write` bloqueia rede por default: isso é uma **camada extra** de
  proteção contra disparo acidental de integração, não um defeito. Só habilite
  `network_access` conscientemente.

## 7. Evidência visual — Playwright headless é o caminho CANÔNICO (3.0.3)

> **Esta seção é a fonte única desta regra.** Agentes (`michelangelo`, `dedalo`, `ariadne`),
> skills (`/prd-exec`, `/mockup`, `/dt-exec`) e o `harness-doctor.sh` **referenciam**
> "PLATAFORMAS.md §7" — nenhum deles reescreve o enunciado. Mudou aqui, mudou para todos.

**A regra.** Verificação visual e evidência de agente **nunca dependem do browser pane**.
O caminho canônico, em qualquer host e em qualquer máquina, é **Playwright headless
gravando arquivo**:

| Necessidade | Comando canônico |
|---|---|
| Rodar spec E2E (com screenshots) | `npx playwright test <spec>` — **sempre headless**; nunca `--headed` por conta própria |
| Screenshot avulso de uma URL | `npx playwright screenshot "<url>" <arquivo>.png` |
| Onde a evidência mora | a **"Pasta de screenshots"** do Perfil → Testes E2E (ex.: `tests/e2e/screenshots/PRD-NNN/`) |

**Evidência que só existiu numa janela de preview não é evidência.** O relatório aponta um
**arquivo em disco** ou declara que não houve evidência visual — não há terceira opção.

**O pane é SONDA ÚNICA, opcional.** Ele continua permitido e continua útil onde funciona
(inspeção interativa: `read_page`, `computer`, `resize_window`, console) — mas como **bônus,
nunca como dependência**:

1. **No máximo UMA tentativa**, no início da tarefa.
2. Falhou (timeout, "pane is not displayed", erro de MCP) → **não retenta**. Registre
   `pane indisponível` no relatório e siga **100% Playwright**.
3. **Proibido intercalar novas tentativas** ao longo da tarefa. Sonda queimada é assunto
   encerrado até a próxima tarefa.
4. Funcionou → use à vontade para inspecionar; a **evidência entregue continua sendo o PNG
   do Playwright**, não o que se viu na janela.

> **Incidente que originou a regra** (site-allyson-bezerra-2026, 13/08/2026): o pane não
> compositava frames nesta máquina; o `dedalo` queimou minutos de Modo P e os executores da
> `/prd-exec` (PRD-001) atrasaram a fase de verificação insistindo nele — com Playwright
> 1.58 + 3 navegadores instalados e parados ao lado. Custo silencioso, repetível **por agente
> e por ciclo**.

**Fato de máquina não mora aqui.** "O pane não funciona nesta máquina" é dado **local**: vai
no **Perfil do projeto** → Testes E2E → campo **"Verificação visual (agentes)"**, escrito pela
**sessão principal** (nunca por subagente), com carimbo `[AAAA-MM-DD · origem]`, seguido de
`bash .claude/hooks/perfil-frescor.sh --carimbar`. É isso que faz o **próximo** agente nem
tentar. A regra-base é igual em toda máquina; o fato é por máquina.

**Pré-requisito de projeto.** Todo projeto **com front** declara no Perfil o estado do
Playwright (framework, versão e navegadores instalados). Projeto com trabalho de front e sem
Playwright instalado é **gap acusado no PRE-FLIGHT** (`bash .claude/harness-doctor.sh
--autonomia`, Passo 0.2 da `/prd-exec`) — não descoberta na fase de verificação, com a PRD já
implementada.

**Por host** (só muda a sonda opcional; o canônico é o mesmo):

- **Claude Code:** sonda = browser pane. O nome do servidor MCP mudou entre versões — hoje é
  `mcp__Claude_Browser__*` (`preview_start`, `preview_list`, `navigate`, `read_page`,
  `computer`, `resize_window`); versões anteriores expunham `mcp__Claude_Preview__*`
  (`preview_snapshot`, `preview_inspect`, `preview_screenshot`, `preview_click`). Os agentes
  declaram **os dois conjuntos** no frontmatter e usam o que existir — ferramenta declarada e
  ausente é ignorada pelo host.
- **Codex:** sonda = browser integrado (`browser_use`/`in_app_browser`), quando disponível.
- **Os dois:** canônico = `npx playwright test` / `npx playwright screenshot` (no Codex, a
  skill `playwright` bundled serve igual).

**Sem Playwright E sem sonda:** degrade explicitamente para análise estática de código +
roteiro de verificação manual — e **declare no relatório** que não houve evidência visual.
Nunca fingir que houve.

## 8. Review multi-AI (dupla-cega consciente do host)

Config no `harness.env`: `HARNESS_HOST` e `HARNESS_EXTERNAL_REVIEWER`
(`auto` | `codex-cli` | `claude-cli` | `none`). Helper: `.claude/hooks/external-review.sh`
(o antigo `codex-review.sh` virou shim compatível).

| Host da sessão | Persona interna | Revisor externo (`auto`) | É dupla-cega? |
|---|---|---|---|
| Claude Code | sherlock (Claude) | Codex CLI (`codex exec review`) | ✅ dois modelos distintos |
| Codex | sherlock (agente Codex) | Claude CLI (`claude -p` sobre o diff) | ✅ dois modelos distintos |
| Qualquer, sem CLI externo | sherlock | — | ❌ **modo solo** — registrado como solo; nunca descrever como dupla-cega |

Cegueira preservada (nenhum revisor vê o relatório do outro), loops de correção e limite
de ciclos continuam os do Perfil. Reentrância: o helper exporta
`HARNESS_IN_EXTERNAL_REVIEW=1` — todos os hooks RAG/telemetria saem no-op dentro do
subprocesso do revisor (mesmo mecanismo do resumidor do RAG).

## 9. RAG e memória

- **Portátil (igual nos dois hosts):** fontes `.md` versionadas, embeddings locais
  (MiniLM/ONNX), SQLite/sqlite-vec, índice derivado por máquina, scrub anti-PII, mock.
- **Provider do resumo** (`HARNESS_RAG_LLM_PROVIDER`): `claude-cli` | `codex-cli` |
  `anthropic` (HTTP explícito, `ANTHROPIC_API_KEY` do ambiente) | `mock` | `disabled`.
  Guard de reentrância genérico: `HARNESS_RAG_IN_SUMMARIZE=1` no subprocesso, respeitado
  pelos hooks dos dois hosts (que herdam o ambiente).
- **Privacidade:** embeddings nunca saem da máquina; o **resumo por LLM envia o
  transcript ao provider configurado** (Anthropic ou OpenAI, conforme o provider) — é o
  único egress do módulo, e o system prompt + scrub anti-PII se aplicam sempre.
- **Memória:** a fonte é `.claude/memory/` (versionada). O espelho para
  `~/.claude/projects/<slug>/memory/` é um **adapter do host Claude** (hook
  `sync-memory.sh`, no-op nos outros hosts). No Codex, o `AGENTS.md` aponta o índice
  `MEMORY.md` — instruções obrigatórias continuam em documentos versionados, nunca só
  na memória gerada.

## 10. Telemetria

`harness-metrics.sh`/`.mjs` gravam o campo `platform` em cada linha do
`harness-runs.jsonl`. Tokens/gaps: no Claude, lidos do transcript (`~/.claude/projects`);
no Codex, best-effort sobre `~/.codex/sessions` — quando o formato não for parseável, os
campos saem **`n/d`** (nunca inventados). Espera humana medida: as janelas do notify.sh
(`permission_prompts`) são sinal do host Claude; desde a 2.10.0 os **gaps do transcript**
(> `HARNESS_WAIT_GAP_MIN`) também contam como espera nas DUAS plataformas — no Codex eles
são a única fonte (`wait_human_min` lá vem só de gap). **Assimetria da 2.12.0:** no Claude
o medidor lê os transcripts por subagente (`<session>/subagents/agent-*.jsonl`) e separa
gap **ocioso** de gap **com subagente vivo** (`wait_idle_min`/`wait_gap_min`/
`subagent_busy_min`/`parallel_factor`); o Codex não expõe transcript por subagente, então
lá esses campos saem **vazios** (n/d, nunca zero) e a espera mantém a ambiguidade da
2.10.0 — leia execução Codex com muito subagente sabendo disso. Negações do classificador
(`classifier_denials`/`spiral_blocks`) seguem exclusivas do host Claude; no Codex saem
vazias. Nada disso jamais bloqueia um workflow.

## 11. Delegação a CLI externo — mini-tasks read-only (3.0.0)

Até a 2.16.1 o multi-AI era sobre **onde a sessão roda** (host) e **quem revisa** (dupla-cega).
A 3.0.0 acrescenta um terceiro eixo: **para onde parte do trabalho da sessão pode ser
despachada**. O harness passa a delegar mini-tasks **read-only** da `/prd` a um CLI externo já
autenticado na máquina — sem API, sem chave, sem segundo login.

**Três responsabilidades, deliberadamente separadas:**

| Papel | Quem faz | Onde vive |
|---|---|---|
| **Roteador** — decide o executor de cada papel | a skill, lendo o Perfil | `/prd` Passo 1 + Perfil → "Economia e controle de custo" |
| **Broker** — executa, cronometra, captura, normaliza status | script determinístico | `.claude/hooks/harness-delegate.sh` |
| **Juiz** — lê os relatórios, confronta, sintetiza, escreve | a **sessão principal** | `/prd` Passos 3 e 10.2 |

O juiz nunca é delegado: é isso que significa "o Claude orquestrando". E não há chamada extra só
para juntar textos — a síntese acontece no fluxo que já existia.

### Comandos por executor — o que é print mode em cada CLI

| Executor | Modo não-interativo | Enforcement read-only | Tokens |
|---|---|---|---|
| `claude-cli` | **`claude -p`** (print mode oficial) | `--tools "Read,Glob,Grep"` + `--disallowedTools` + `--permission-mode dontAsk` | não reportados → `n/d` |
| `codex-cli` | **`codex exec`** | `--sandbox read-only` (SO) + `approval_policy=never` + `--ephemeral` | **medidos** (evento `turn.completed.usage`) |

> ⚠️ **`codex -p` NÃO é print mode.** No Codex, `-p` é `--profile` (camada de configuração). O
> modo não-interativo é `codex exec "<prompt>"` ou `codex exec -` (prompt pelo stdin). Confundir
> os dois é o erro mais fácil de cometer aqui — e ele falha de um jeito silencioso.

**Assimetria honesta de segurança:** o Codex tem sandbox de **sistema operacional** — o processo
não consegue escrever, ponto. O Claude CLI tem restrição de **ferramentas** — o modelo não recebe
Write/Edit/Bash. É forte, mas é enforcement do harness, não do SO. Por isso o broker tira uma
impressão do working tree antes e depois de cada delegação e registra `tree_tocado` no manifest:
prova, não promessa.

### Status e fallback

O broker devolve `DELEGACAO|<status>|<executor>|<path>` no stdout e usa o **exit code** como canal
de fallback: `0` ok · `10` indisponível · `11` timeout · `12` erro · `13` vazio · `20` reentrada ·
`2` uso. Diferente do `external-review.sh` (que sai 0 sempre por ser defensivo), aqui exit ≠ 0 é
informação — quem chama é uma skill, não um hook wired.

Indisponibilidade **nunca é escondida**: sem `codex` no PATH ou sem login, o papel cai no fallback
declarado e isso vai para o relatório final. Mesma regra do "modo solo" do §8 — degradação se
declara, não se disfarça.

### Onde o Codex NÃO entra

- **michelangelo e dedalo:** a base de design deles (`ui-ux-pro-max`) é excluída de propósito da
  geração de adapters Codex (`gen-adapters.sh`). Delegá-los degradaria o gate de UX em silêncio.
- **`/prd-exec` e `/dt-exec`:** nesta versão o externo **não implementa nada**. Delegação é só
  leitura, e dois CLIs jamais editam o mesmo working tree.
- **Síntese, julgamento e escrita:** sempre na sessão principal.

### Reentrância

O broker exporta `HARNESS_IN_EXTERNAL_AGENT=1` (nova, genérica) **e**
`HARNESS_IN_EXTERNAL_REVIEW=1` (histórica) no subprocesso. Os hooks reconhecem as duas durante a
transição — `_rag-common.sh` e `presence.sh` saem no-op dentro de um executor externo, e o próprio
broker recusa rodar (exit 20) se já estiver dentro de um. Um agente externo nunca spawna outro.

### Extensão futura (ex.: `kimi-cli`)

Um executor novo é **um ramo em `run_executor()`** no broker + **um caso em
`harness_executor_available()`** no `_delegate-common.sh`. Mais nada muda: roteador, envelope,
telemetria e fallback são agnósticos. Valor não previsto na tabela do Perfil degrada para `native`
**com aviso no stderr** — nunca em silêncio.

## 12. Como adicionar peça nova sem divergir

- **Skill nova:** crie só `.claude/skills/<n>/SKILL.md` (com frontmatter
  `name`/`description`) e rode `bash .claude/scripts/gen-adapters.sh` — o stub
  `.agents/skills/<n>/SKILL.md` é gerado. Nunca escreva o stub à mão.
- **Agente novo:** crie `.claude/agents/<n>.md` (canônico) e um `.codex/agents/<n>.toml`
  cujo `developer_instructions` **manda ler o canônico** e fixa só o que é da
  plataforma (sandbox, effort). O doctor confere a paridade name/description.
- **Hook novo:** script em `.claude/hooks/` (host-agnóstico: use `_host-detect.sh`,
  resolva caminhos pelo próprio script — nunca pelo cwd) + wiring nos DOIS arquivos
  (`settings.json` e `.codex/hooks.json`) **somente nos eventos que existem em cada
  plataforma**. Sem equivalente seguro? Degrade explícito e registre a linha na tabela
  do §4 — não finja suporte.
