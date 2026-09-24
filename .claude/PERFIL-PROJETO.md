# Perfil do Projeto

> **Irmão siamês (2.4.0):** `.claude/PERFIL-RESUMO.md` — destilado ~2 KB deste arquivo que os
> subagentes leem no lugar do Perfil completo. **Editou este arquivo? Atualize o resumo na
> mesma passada** (a última task de toda PRD cobra isso).
>
> **O QUE É ESTE ARQUIVO**
>
> Este é o **único** arquivo que você precisa editar ao portar o harness para um
> projeto novo. As skills (`/prd`, `/prd-exec`, `/dt`, `/codex-review`), os hooks
> e os templates são **stack-agnósticos** e leem os valores daqui. Sem este
> arquivo preenchido, as skills param e pedem para você criá-lo.
>
> **Como preencher:** ou edite os campos abaixo direto, ou copie um perfil pronto
> de `perfis/` (ex: `perfis/php-laragon.md`, `perfis/node-api.md`) por cima deste
> arquivo e ajuste. Tudo entre `<...>` é placeholder — substitua pelo valor real.
> Atalho visual: `/harness-config` abre uma tela para preencher tudo isto sem editar
> markdown na mão (gera este arquivo + o `harness.env`).
>
> **Onde fica no projeto-alvo:** `.claude/PERFIL-PROJETO.md` (raiz do repo).
>
> **Convenção de referência:** as skills citam campos por caminho, ex:
> "interpretador do Perfil → CLI → Interpretador". Mantenha os títulos de seção.

---

## Identificação

| Campo | Valor |
|-------|-------|
| **Nome do projeto** | `Terna` (jogo de plataforma 2D em pixel art) |
| **Slug** | `terna` |
| **Repositório / deploy** | `GitHub joaodouglasdantas/Terna, branch main; sem deploy automatizado ainda` |
| **Stack resumida** | `TypeScript em tudo. Cliente: Vite + Canvas 2D (web agora; app de PC via Tauri/Electron depois). Servidor: Node 22 + Fastify 5 + WebSocket + Drizzle ORM. Banco: PostgreSQL (PGlite embutido em dev/teste). Monorepo npm workspaces em jogo/` |

---

## CLI (ambiente local)

Caminhos absolutos dos executáveis. **Nunca assumir que estão no PATH** — declarar aqui.
Se o projeto roda em mais de um SO (ex: Windows e macOS), liste os dois; quem executa escolhe o ativo.

| Campo | Valor |
|-------|-------|
| **Interpretador (run/lint)** | `C:/Program Files/nodejs/node.exe` (padrão do instalador do Node 22.12+ — 🔧 confirmar nesta máquina) |
| **Interpretador (alt. SO)** | `N/A` |
| **Cliente de banco** | `N/A em dev` — o banco local é PGlite (arquivo em `jogo/apps/servidor/dados/banco/`), acessado só pelo servidor. Com Postgres de verdade: `psql` |
| **Cliente de banco (alt. SO)** | `N/A` |
| **Gerenciador de pacotes** | `npm` (workspaces; rodar sempre dentro de `jogo/`) |

---

## Execução autônoma — comandos conhecidos-seguros (allowlist)

> **Por que existe (1.9.0):** em auto mode, comando sem regra determinística é decidido
> por um **classificador** remoto. Quando ele fica **indisponível**, nega tudo em
> fail-closed — e a execução autônoma trava (incidente real: exec da PRD-007 do
> aec-backend, 09/07/2026). Regras **estreitas** em `permissions.allow` do
> `.claude/settings.json` **do projeto** resolvem **antes** do classificador e
> sobrevivem ao outage. **Atenção:** regra **larga** de interpretador (`Bash(php:*)`,
> `Bash(node:*)`, `Bash(composer:*)`) é **suspensa** em auto mode e cai no classificador
> mesmo assim — cobertura falsa.
>
> Liste abaixo os comandos **estreitos e orientados a tarefa** (comando + subcomando
> fixos; `*` só no fim, para argumentos) que este projeto considera seguros sem prompt.
> O gerador `bash .claude/harness-doctor.sh --gen-allowlist` converte esta tabela num
> bloco `permissions.allow` pronto para **revisar** e colar no settings.json — o Passo
> 0.2 da `/prd-exec` oferece isso na decolagem. Linhas com 🔧 são **ignoradas** pelo
> gerador — confirme o comando e remova o 🔧 para ativá-lo. **Default: tabela vazia =
> nada pré-liberado** (decisão consciente por projeto).

| Comando (estreito; `*` final = aceita argumentos) | Por que é seguro |
|---|---|
| `npm --prefix jogo run typecheck` | só checa tipos — não escreve nada |
| `npm --prefix jogo test` | testes unitários e de API com banco PGlite **em memória** — sem efeito externo |
| `npm --prefix jogo run build` | gera `dist/` do cliente e do servidor — idempotente |
| `npm --prefix jogo run arte:cenario` | regenera `assets/cenario.png` + `gerado/cenario-quadros.ts` a partir de `jogo/fontes/` — determinístico |
| `npm --prefix jogo run arte:personagem` | regenera o sprite do personagem a partir de `jogo/fontes/SpriteBase.png` — determinístico |

> **Banco de dados:** nunca allowliste o cliente (`mysql`, `psql`) direto. Crie um
> wrapper **versionado** que só alcance o banco de TESTE (ex.: `.claude/scripts/db-test.sh`)
> e liste o wrapper: `bash .claude/scripts/db-test.sh *`. Valide no seu ambiente que a
> regra do wrapper não é tratada como "interpretador wildcarded" (suspensa em auto mode).
>
> **Workspace trust:** `permissions.allow` do settings.json do projeto só passa a valer
> depois de aceitar o diálogo de confiança do workspace (uma vez, interativo). Em projeto
> recém-clonado, abra uma sessão interativa antes da 1ª execução autônoma.

---

## Banco de dados (teste local)

> ⚠️ **Apenas credenciais de DESENVOLVIMENTO LOCAL.** Nunca colocar credenciais de
> produção aqui. Este arquivo pode ser versionado — trate-o como público.

| Campo | Valor |
|-------|-------|
| **SGBD** | `PostgreSQL` — em dev é o **PGlite** (Postgres compilado para WASM, embutido no Node); em produção, Postgres via `DATABASE_URL` |
| **Host** | `N/A (PGlite é um arquivo)` · Postgres opcional: `localhost:5432` via `jogo/docker-compose.yml` |
| **Database** | PGlite: `jogo/apps/servidor/dados/banco/` (gitignored) · testes: `memoria` (um banco novo por arquivo de teste) · Postgres opcional: `terna` |
| **Usuário** | Postgres opcional: `terna` |
| **Senha** | Postgres opcional: `terna` (só local, do docker-compose) |
| **Comando de smoke test** | `curl http://localhost:3001/api/saude` → `{"ok":true}` (faz `select 1` no banco) |
| **Soft delete** | `N/A` — apagar jogador apaga sessões, saves e recordes em cascata (FK `ON DELETE CASCADE`) |

---

## Worktrees isolados (3.4.0) — como este app descobre banco e URL

> O hook `harness-worktree.sh` lê **Database/Host/Usuário/Senha/smoke** (acima) e **Base URL**
> (abaixo) daqui, e as declarações de `.claude/harness.env` (seção WORKTREES): quais arquivos
> gitignored copiar, se o banco é clonado, e **como o app acha o banco do worktree** — por um
> arquivo de override gerado de template (`HARNESS_WT_DB_OVERRIDE_FILE/TPL`) e/ou por chaves no
> `.env` (`HARNESS_WT_ENV_MAP`). Preencha no `harness.env` do projeto; aqui só a nota de como o
> app resolve credenciais, para quem for declarar:

| Campo | Valor |
|-------|-------|
| **Como o app resolve o banco** | `DATABASE_URL` (Postgres) > `PASTA_BANCO` (PGlite) > padrão `./dados/banco`, lidos do ambiente ou de `jogo/apps/servidor/.env` |
| **URL muda por** | porta (dev server): `PORTA` do servidor e `--port` do Vite |

## Aplicação (URL local)

| Campo | Valor |
|-------|-------|
| **Base URL local** | `http://localhost:5173` (Vite) |
| **Base URL da API** | `http://localhost:5173/api` (o Vite repassa para o servidor em `http://localhost:3001/api`, inclusive o WebSocket `/api/tempo-real`) |
| **Como subir o dev server** | `cd jogo && npm install && npm run dev` (sobe servidor + cliente juntos) |

---

## Lint automático (hook PostToolUse)

O hook `.claude/hooks/lint.sh` valida sintaxe a cada Write/Edit e **bloqueia** (exit 2)
em erro. A configuração real fica em `.claude/harness.env` (lido pelo hook). Documente
aqui o que está configurado, para referência humana.

| Campo | Valor |
|-------|-------|
| **Comando de lint** | vazio (desligado) — TypeScript não tem checagem de sintaxe por arquivo confiável; a checagem é `npm --prefix jogo run typecheck` (projeto inteiro) |
| **Extensões verificadas** | `N/A` |
| **Bloqueante?** | `Não` — mas uma task só está pronta com `typecheck` e `test` passando |

> Regra: use uma checagem **somente de sintaxe** para bloquear (php -l, node --check,
> tsc --noEmit por arquivo). Lint de estilo (eslint full) é melhor não-bloqueante.

---

## Testes E2E

| Campo | Valor |
|-------|-------|
| **Framework** | `Nenhum E2E ainda` — unitários/API com **Vitest** (`jogo/apps/*/test/`, `jogo/packages/*/test/`) |
| **Diretório dos specs** | `N/A` (quando existir: `jogo/e2e/`) |
| **Base URL** | `http://localhost:5173` |
| **Login de teste (usuário)** | `N/A` — o jogo não exige login; contas de teste são criadas pelo próprio teste (`POST /api/contas`) |
| **Login de teste (senha)** | `N/A` |
| **Seletores do login** | `N/A` (ainda não há tela de login) |
| **Comando (spec único)** | `cd jogo/apps/<app> && npx vitest run test/<arquivo>.test.ts` |
| **Comando (suite completa)** | `npm --prefix jogo test` |
| **Pasta de screenshots** | `.claude/.harness-run/tmp/screenshots/` |
| **Headless** | `Sim (padrão — nunca usar --headed por conta própria)` |
| **Verificação visual (agentes)** | Playwright não instalado no projeto. Para conferir que o jogo não mudou: rodar com `Math.random` semeado e `requestAnimationFrame` controlado e comparar o canvas quadro a quadro (ver Armadilhas de teste). |

> **Verificação visual (agentes) — obrigatório em projeto com front (3.0.3).** O caminho
> canônico de evidência visual de agente é **Playwright headless gravando arquivo**
> (`npx playwright test <spec>` / `npx playwright screenshot "<url>" <arquivo>.png`); o browser
> pane é sonda **opcional de uma tentativa**. Regra completa: `.claude/PLATAFORMAS.md` §7 —
> **não a reescreva aqui**. Este campo carrega só o que é **local**:
>
> 1. **Estado do Playwright** — instalado?, versão, navegadores baixados.
>    Ex.: `@playwright/test 1.58.2 + chromium/firefox/webkit instalados`. Sem front no
>    projeto: escreva `N/A — projeto sem front`.
> 2. **Fatos desta máquina** — ex.: *"o Browser pane não funciona aqui (não composita
>    frames)"*. Escritos **pela sessão principal**, nunca por subagente, com carimbo
>    `[AAAA-MM-DD · origem]`; depois rode `bash .claude/hooks/perfil-frescor.sh --carimbar`.
>    É isto que faz o próximo agente **nem tentar** o pane.
>
> Modelo: `**[2026-08-13 · PRD-001]** Playwright 1.58.2 + 3 navegadores OK. ⚠️ Browser pane
> NÃO funciona nesta máquina (Screenshot timed out — pane is not displayed): toda evidência
> via Playwright, PNGs em tests/e2e/screenshots/PRD-NNN/.`

---

## Integrações com efeitos colaterais irreversíveis

> **Por que importa:** estas integrações fazem coisas que NÃO dá para desfazer em
> ambiente local apontando para dados reais (mandar WhatsApp para cliente real,
> criar evento em calendário real, cobrar cartão, mandar e-mail). A skill
> `/prd` registra os pontos de disparo nos riscos; a `/prd-exec` (Fase 0) BLOQUEIA
> a execução em ambiente local se o safe-mode não estiver ativo.
>
> Liste cada integração. Se o projeto não tem nenhuma, escreva "Nenhuma" e a
> Fase 0 da `/prd-exec` será pulada automaticamente.

**Nenhuma.** O jogo não envia e-mail, mensagem nem cobrança. (Quando entrar e-mail de
recuperação de senha ou pagamento, registre aqui.)

---

## Safe Mode (Pre-flight da `/prd-exec` — Fase 0)

> Só relevante se houver pelo menos 1 integração com efeito colateral acima.

| Campo | Valor |
|-------|-------|
| **Flag de ativação** | `N/A — sem integrações com efeito colateral` |
| **Query de validação** | `N/A` |
| **Whitelist (se aplicável)** | `N/A` |
| **Como detectar "ambiente local"** | `DATABASE_URL` vazio (PGlite local) |
| **SQL pronto p/ desbloquear** | `N/A` |

---

## Codex review

> O review é **dupla-cega**: Codex CLI + agente `sherlock` (Claude) revisam em paralelo,
> sem ver um ao outro. Sem Codex no ambiente, o sherlock revisa sozinho (nunca fica sem review).

| Campo | Valor |
|-------|-------|
| **Pasta de relatórios** | `<ex: codex-reviews/ na raiz do repo (default) — definida em harness.env como HARNESS_CODEX_REPORTS>` |
| **Limite de ciclos** | `preset` `<ou um número; 0 = sem limite (roda até limpar)>` |
| **Reasoning do Codex** | `preset` `<ou low / medium / high — em harness.env como HARNESS_CODEX_REASONING>` |
| **Piso de severidade do review** | `harness.env` `<critico / alto / tudo — ou "harness.env" para herdar HARNESS_REVIEW_SEVERITY_FLOOR (default critico)>` |
| **Pré-requisitos do Codex** | `codex no PATH (npm i -g @openai/codex) + codex login (~/.codex/auth.json) — opcional: sem ele, roda só o sherlock` |

> **Piso de severidade** (1.6.0): controla, em TODOS os gates/reviews (beholder, michelangelo,
> sherlock), **o que é detalhado, o que bloqueia e o que gasta ciclo**. `critico` (default do mestre,
> via `harness.env`) = só 🔴 trava e itera; 🟠/🟡/🔵 viram observação/backlog automática, sem aceite
> nem ciclo. `alto` = 🔴 trava + 🟠 pede aceite. `tudo` = régua clássica (🔴 e 🟠 iteram). Deixe
> `harness.env` para herdar o default propagado; declare `tudo`/`alto` aqui só se este projeto exige
> mais rigor. **Não desliga revisor** — a dupla-cega (Codex + sherlock) segue rodando normal; o piso
> muda só o que é detalhado/travado, não quem revisa.

> Semântica do limite (igual aos "Ciclos do beholder"): 1 ciclo = review (dupla-cega) +
> correção dos bloqueantes. `preset`/ausente = **base** do preset ativo (economico 1 ·
> equilibrado 2 · maximo 3 — **2.5.0**) **+ escalada automática de no máximo +1 ciclo**, que só
> dispara se o último ciclo da base **corrigiu bloqueante E ainda resta 🔴** (convergindo →
> ganha 1 ciclo; estagnado → gate direto, ciclo extra seria desperdício). **Número explícito**
> aqui = limite duro, sem escalada (comportamento clássico). `0` = sem limite. Se esgotar
> **com bloqueantes restantes**, a Fase 2 do `/prd-exec` segue a decisão da Entrevista de
> decolagem (0.3) ou **para e pede decisão humana**. Dados de 35 sessões (29/07): ciclos 3-4
> quase só caçavam 🟡 — por isso a base caiu.
> **Reasoning** controla o esforço de raciocínio do Codex (`high` acha mais, custa mais); testar
> `high` no ciclo 1 pode reduzir o nº de ciclos.

---

## Manual vivo (2.6.0)

| Campo | Valor |
|-------|-------|
| **Mecanismo** | `arquivo` `<arquivo / kb-portal / seed>` |

> Como a skill `/manual` publica a face de **usuário final** do manual (`docs/manual/`):
> `arquivo` (default — campo ausente) = as duas faces em `docs/manual/` (usuario/ + dev/);
> `kb-portal` = a face de usuário é delegada à skill própria do projeto (ex.: `/kb-tutorial`
> do Portal TEF — sync via pipeline) e a `/manual` cuida só da face dev;
> `seed` = face de usuário no formato dos templates de seed do projeto (TEMPLATE-TUTORIAL/META).
> A fila (`docs/manual/_fila.md`) é alimentada pela cauda da `/prd-exec` a custo ~zero e
> processada em lote pela `/manual` (gatilho natural: revisão quinzenal, dias 1/15).

## Nível de esforço (preset)

> **O dial macro do harness.** Em vez de configurar modelo/ciclos agente por agente, escolha
> **um preset** e ele resolve o pacote inteiro (modelos dos agentes, nº de ciclos, reasoning do
> Codex, profundidade do discovery). Os campos individuais abaixo **sobrescrevem** o preset ponto
> a ponto (override fino). As skills leem este campo + a tabela e aplicam na invocação.

| Campo | Valor |
|-------|-------|
| **Preset de esforço** | `equilibrado` `<economico / equilibrado / maximo>` |

**Tabela de expansão** (o que cada preset resolve — é a régua; ajuste via override abaixo, não aqui):

| Dial | `economico` (devs) | `equilibrado` (default) | `maximo` (alto impacto) |
|------|------|------|------|
| Discovery analítico (Agent A — DTs) | sonnet | sonnet | **opus** |
| tony-stark, atlas, sherlock | sonnet | sonnet | **opus** |
| **beholder** — ciclo 1 *(3.4.24, item 13)* | sonnet | sonnet | **opus** |
| **beholder** — ciclo 2 *(só se o c1 reabriu o desenho: ≥ 3 🔴 estruturais; uma vez; c3+ sonnet)* | sonnet | **opus** | sonnet |
| **michelangelo** — ciclo 1 *(quando há UI)* | sonnet | sonnet | **opus** |
| **michelangelo** — ciclo 2 *(mesma regra do beholder)* | sonnet | **opus** | sonnet |
| **dedalo** (autor do front) | sonnet | sonnet | **opus** |
| **hefesto** (executor) | sonnet | sonnet | sonnet *(sempre)* |
| **ariadne** (maquete) | sonnet | sonnet | sonnet *(sempre)* |
| Ciclos do beholder *(base; +1 de escalada se convergindo — **teto absoluto 3**, 3.3.0)* | 1 | 2 | 3 *(sem escalada)* |
| Ciclos do michelangelo *(quando há UI; mesma escalada e mesmo teto)* | 1 | 2 | 3 *(sem escalada)* |
| Ciclos do Codex review *(base; mesma escalada e mesmo teto)* | 1 | 2 | 3 *(sem escalada)* |
| Reasoning do Codex (`HARNESS_CODEX_REASONING`) | low | medium | high |
| **Esforço — fase PENSAR** *(3.5.3 — sessões de `/ideia` `/dt` `/prd` `/mockup` `/dt-sweep` `/convencao`; nível `effortLevel` do Claude Code, herdado por todo subagente; quem aplica é você, via `/effort`)* | high | high | xhigh |
| **Esforço — fase EXECUTAR** *(3.5.3 — sessões de `/prd-exec` `/dt-exec` `/codex-review` `/manual`; envelope fechado: packet, contrato, invariantes)* | medium | medium | high |
| **sherlock — ciclo 1 na fase executar** *(3.5.3 — compensa o `medium` da sessão com MODELO, não com esforço)* | sonnet | **opus** | **opus** |
| Discovery D (PRDs anteriores) | off | auto | on |
| Captura RAG por-agente (`HARNESS_RAG_CAPTURE_AGENTS`) | off | off | on |

> **Gates da `/prd` no `equilibrado` (3.4.24, item 13):** o ciclo 1 do beholder e do michelangelo
> roda em **Sonnet**; Opus entra **uma vez, no ciclo 2**, só quando o ciclo 1 **reabriu o desenho**
> (≥ 3 🔴 estruturais — achados que mudam escopo, divisão de tasks, schema ou integração). Os 2 ciclos
> base continuam. Medido até 04/09: o c1 acha (9,1,2 / 7,1,1 achados por ciclo) e Sonnet faz a mesma
> tabela em 10-17 min contra 18-28 do Opus. Para manter Opus no c1 neste projeto, declare
> `Modelo do beholder: opus` (e/ou `do michelangelo`) na seção de override abaixo — o override vence.
> `maximo` mantém Opus no c1. A telemetria (`min_gates`, `achados_por_ciclo`) mede o efeito.
>
> **Régua:** Opus onde há **julgamento** (discovery analítico, inovação, red-team, review, **design
> de front**); Sonnet onde há **mapeamento ou volume** (schema, código, scout, markup de maquete). O
> `hefesto` e a `ariadne` são Sonnet em qualquer preset — execução de task é mecânica e maquete é
> volume ancorado em evidência. Quem decide o modelo da **sessão principal** (que faz a síntese e
> escreve a PRD) é você, via `/model`/conta: rode `/prd` em **Opus** (ou **Fable** numa PRD de
> dinheiro/segurança — 2× o custo) e `/prd-exec` em **Sonnet** (ver nota no topo das skills). O
> **esforço** da sessão (`/effort`) é herdado pelos subagentes — linha "Esforço da sessão" acima.

---

## Agentes do harness (modelos) — override fino

> **Sonnet-first + preset.** Cada campo aceita: `preset` (herda o preset acima — **default**),
> `sonnet`, `opus` ou `fable` (override explícito que vence o preset; `fable` = Fable 5.1, o mais
> capaz, **custo 2× Opus** — opt-in, 3.4.25, NUNCA vem de preset). Campo ausente = `preset`. As
> skills passam o override na invocação (`model: "<resolvido>"`). O `hefesto` é sempre Sonnet — sem opt-in.

| Campo | Valor | Quando o agente roda |
|-------|-------|----------------------|
| **Modelo do discovery analítico** | `preset` `<sonnet / opus / fable>` | Agent A (DTs) no discovery da `/prd` |
| **Modelo do sherlock** | `preset` `<sonnet / opus / fable>` | review — Fase 2 do `/prd-exec` e `/codex-review` |
| **Modelo do atlas** | `preset` `<sonnet / opus / fable>` | impacto — `/prd` quando toca módulo existente |
| **Modelo do tony-stark** | `preset` `<sonnet / opus / fable>` | inovação — discovery de **toda** `/prd` |
| **Modelo do beholder** | `preset` `<sonnet / opus / fable>` | red-team — fim de **toda** `/prd` |
| **Modelo do michelangelo** | `preset` `<sonnet / opus / fable>` | gate de UX — `/prd` quando há UI (Passo 10, em paralelo ao beholder) + `/prd-exec` Fase 2.9 (auditoria da tela construída) + `/dt-exec` 5.1; também sob demanda |
| **Modelo do dedalo** | `preset` `<sonnet / opus / fable>` | autor do front — `/prd` Passo 7.1 (projeto) + tasks `Tipo: front` da `/prd-exec` + itens de UI do `/dt-exec` + correção dos 🔴 de UX (Modo R) |
| **Esforço — fase pensar** | `preset` `<preset / low / medium / high / xhigh / max>` | 3.5.3 — esforço da sessão nas skills de julgamento (`/ideia` `/dt` `/prd` `/mockup` `/dt-sweep` `/convencao`); `preset` = economico/equilibrado `high`, maximo `xhigh`. A skill lê o esforço real (`get_session self`) e roda `hooks/esforco.sh pensar`; divergiu → pede `/effort` uma vez |
| **Esforço — fase executar** | `preset` `<preset / low / medium / high / xhigh / max>` | 3.5.3 — esforço da sessão nas skills de execução (`/prd-exec` `/dt-exec` `/codex-review` `/manual`); `preset` = economico/equilibrado `medium`, maximo `high`. Medido 12/09 (PRD-142-b em `high`): 83% dos tokens dos executores eram raciocínio |
| **Esforço da sessão** | `preset` | legado (3.4.25) — se for um nível concreto, vale para as DUAS fases quando a linha da fase estiver em `preset`; prefira as duas linhas acima. Todo subagente **herda** o esforço da sessão — não há parâmetro por chamada |
| **Modelo do sherlock nos ciclos de refino** | `sonnet` `<sonnet / opus>` | ciclos 2+ da Fase 2 (2.4.0: default Sonnet SEMPRE — o modelo acima vale só p/ o ciclo 1; `opus` aqui é opt-out consciente) |
| **Modelo dos gates nos ciclos de refino** | `sonnet` `<sonnet / opus>` | ciclos 2+ do beholder/michelangelo no Passo 10 da `/prd` (mesma regra 2.4.0) |

> 💡 **Custo:** o que pesa é o que roda **automático** no fluxo — tony-stark e beholder em **toda**
> PRD; atlas quando toca módulo existente; **michelangelo e dedalo quando a PRD tem UI** (o dedalo
> projeta no Passo 7.1 e o michelangelo critica no Passo 10; os dois seguem na execução); sherlock
> no ciclo de review. Promova a Opus **por agente**, conforme o que a conta comporta (o sob-demanda
> primeiro, os automáticos por último) — ou use o preset `maximo` de uma vez.
> A **ariadne** não entra nessa conta: só roda quando você pede (entrevista da `/prd`, `/dt` ou
> `/mockup`) e é Sonnet fixa.
>
> 🧠 **Esforço, não palavra-gatilho (3.4.25).** Nos modelos Claude 5 o thinking é **adaptativo** e a
> profundidade vem do nível de **esforço** (`low`/`medium`/`high`/`xhigh`/`max`); a palavra-gatilho de
> thinking no fim do prompt só acrescenta uma instrução em contexto e **não muda o esforço enviado à
> API** — o knob "Thinking dos julgadores" saiu por isso. O Claude Code **não aceita esforço por chamada**
> (`Agent` só leva `model`) e o subagente **herda o esforço da sessão**, salvo `effort:` no frontmatter do
> próprio agente — arquivo que viaja com o mestre (régua por papel é decisão do mestre, não do projeto).
> Logo o dial é o **esforço da sessão POR FASE** (3.5.3, linhas "Esforço — fase pensar/executar" acima):
> o preset resolve (pensar: economico/equilibrado `high`, maximo `xhigh` · executar: economico/equilibrado
> `medium`, maximo `high`), a skill lê o esforço real da sessão (`get_session self`), roda
> `hooks/esforco.sh <fase>` e pede `/effort` uma vez se divergir; quem aplica é você. O `stop` da
> telemetria grava `esforco=alvo/atual` e avisa quando a exec rodou acima do alvo.
>
> 💸 **`fable` (Fable 5.1)** — custo 2× Opus; use para o gate c1 de PRD de dinheiro/segurança
> (`Modelo do beholder: fable`) ou para a sessão principal da criação (`/model fable`). Nunca vem de preset.

**Override de ciclos (opcional).** O nº de ciclos dos loops de gate vem do preset (tabela acima);
declare aqui só para sobrescrever:

| Campo | Valor |
|-------|-------|
| **Ciclos do beholder** | `preset` `<ou um número; 0 = sem limite (roda até zerar os 🔴)>` |
| **Ciclos do michelangelo** | `preset` `<ou um número; 0 = sem limite — gate de UX, só quando a PRD tem UI>` |

> `preset`/ausente = **base** do preset ativo (economico 1 · equilibrado 2 · maximo 3 — 2.5.0)
> **+ escalada de no máximo +1 ciclo** se o último ciclo corrigiu algo E ainda resta 🔴 (número
> explícito = limite duro, sem escalada). `0` = sem limite. Esgotou **sem zerar os 🔴** → a `/prd`
> **para e pede decisão humana** (seguir aceitando os riscos, ou abortar). O **beholder** (correção)
> e o **michelangelo** (UX) rodam em paralelo no Passo 10, cada um com seu contador. O limite do
> Codex review fica na seção "Codex review" acima.

---

## Economia e controle de custo (3.0.0)

> **O dial de ONDE o trabalho roda** — ortogonal ao "Nível de esforço", que decide **quão caro**
> ele é. Aqui se define quanto do trabalho *read-only* da `/prd` sai da sessão principal e vai
> para um **CLI externo autenticado na máquina** (hoje: Codex CLI, Claude CLI), quanto o harness
> **fala** enquanto trabalha, e o que acontece quando o executor externo falha.
>
> **Seção ausente = tudo `native`.** Um projeto que não tem estas tabelas se comporta
> exatamente como antes da 3.0.0. Nada aqui é obrigatório.

### Modo de delegação

| Campo | Valor |
|-------|-------|
| **Modo de delegação** | `off` `<off / apoio / economia — ou "harness.env" para herdar HARNESS_DELEGATE_MODE>` |
| **Política de fallback** | `preset` `<preset / native / perguntar / pular>` |
| **Verbosidade** | `preset` `<preset / normal / conciso / minimo>` |

**Tabela de expansão** (o que cada modo resolve — é a régua; ajuste por papel na tabela abaixo):

| Papel / tarefa | `off` (default) | `apoio` | `economia` |
|---|---|---|---|
| discovery-dts (Agent A) | native | native | **codex-cli** |
| discovery-schema (Agent B) | native | **codex-cli** | **codex-cli** |
| discovery-codigo (Agent C) | native | **codex-cli** | **codex-cli** |
| discovery-prds (Agent D) | native | **codex-cli** | **codex-cli** |
| inovacao (tony-stark) | native | native | **codex-cli** |
| impacto (atlas) | native | native | **codex-cli** |
| beholder (red-team) | native | native | **codex-cli** |
| michelangelo (gate de UX) | native | native | native *(sempre)* |
| síntese, julgamento e escrita | native | native | native *(sempre)* |
| **Fallback quando o externo falha** | n/a | `native` | `perguntar` |
| **Verbosidade arrastada** | `normal` | `conciso` | `minimo` |

> **Por que o michelangelo nunca é delegado:** a base de design que ele usa (`ui-ux-pro-max`) é
> skill de terceiro **deliberadamente excluída** da geração de adapters Codex
> (`gen-adapters.sh`). Delegá-lo degradaria o gate de UX em silêncio — o pecado que o harness
> mais persegue. Mesma lógica vale para o `dedalo`, que por isso não aparece na tabela.
>
> **Por que a síntese nunca é delegada:** o juiz é a sessão principal. "Claude orquestrando" é
> exatamente isto — ele lê os relatórios, confronta e escreve. Delegar o juiz não economizaria
> nada e destruiria a única visão do conjunto.
>
> **O fallback se INVERTE em `economia`** (e essa é a parte que não é óbvia): nos outros modos,
> executor externo que falha volta para `native`. Em `economia` isso derrotaria o propósito —
> o recurso escasso é justamente a conta Claude — então o default é **parar e perguntar**, nunca
> voltar em silêncio para o recurso que se está tentando poupar.

### Roteamento por papel (override fino — vence o modo)

> Preencha só as linhas que quiser desviar do modo. Linha ausente = o que o modo resolveu.
> Valores: `native` · `claude-cli` · `claude-cli:sonnet` · `codex-cli` · `off` (pula o papel).

| Papel/tarefa | Executor primário | Fallback | Modo |
|---|---|---|---|
| discovery-dts | `preset` | `preset` | read-only |
| discovery-schema | `preset` | `preset` | read-only |
| discovery-codigo | `preset` | `preset` | read-only |
| discovery-prds | `preset` | `preset` | read-only |
| inovacao | `preset` | `preset` | read-only |
| impacto | `preset` | `preset` | read-only |
| beholder | `preset` | `preset` | read-only |
| michelangelo | `native` | — | read-only |

> **`claude-cli` no host Claude é quase sempre desperdício** e o broker avisa quando acontece: é o
> **mesmo modelo** da sessão (zero diversidade) e o `claude -p` headless consome **crédito Agent
> SDK separado, a preço de API** (desde 15/06/2026). Ele só faz sentido quando o host é **Codex**.
> O valor real do multi-CLI aqui é o Codex: modelo diferente, conta diferente, quota diferente.
>
> **Onde configurar o quê (precedência):**
> `env da sessão` → `.claude/harness.env.local` (por máquina, **gitignored**) → esta seção →
> `.claude/harness.env` (default do projeto, versionado) → `off`.
> A camada certa para *"minha conta está apertada esta semana"* é o **`harness.env.local`**:
> é decisão sua, da sua máquina, e não deve viajar para o repositório nem para a equipe no `/deus`.
> Virada rápida sem editar arquivo: `HARNESS_DELEGATE_MODE=economia claude`.

### Orçamento e verbosidade

- **Orçamento é aprovado na DECOLAGEM, uma vez.** A entrevista única da `/prd` (Passo 0.1), a de
  decolagem da `/prd-exec` e a do `/dt-exec` apresentam o plano de custo (quantos subagentes
  nativos, quantas delegações, estimativa baseada no histórico real deste projeto). Depois disso o
  fluxo é autônomo — **só volta a parar se o custo real estourar o envelope aprovado**. Isto é
  deliberado: a 2.4.0 mediu ~8 min de espera humana por parada no meio do fluxo, e não vamos
  reintroduzir isso.
- **Verbosidade corta prosa, nunca declaração.** Em qualquer nível continuam saindo: a pergunta da
  decolagem, toda degradação (modo solo, fallback usado, executor indisponível, gate sem evidência
  visual, ciclos esgotados), todo 🔴 e todo erro que exige decisão. O relatório final é sempre
  emitido, e o **arquivo em disco permanece completo** — auditoria não encolhe. O que encolhe é o
  que volta ao contexto e o que vai para a tela.

---

## Compatibilidade de produção

> Restrições da runtime de PRODUÇÃO que o código local (talvez mais novo) deve respeitar.

| Campo | Valor |
|-------|-------|
| **Runtime de produção** | Servidor: `Node >= 22.12` (usa `process.loadEnvFile`, top-level await, ESM). Cliente: navegadores com ES2022 + Canvas 2D (Chrome/Edge/Firefox/Safari atuais; WebView do Tauri) |
| **Outras restrições** | Sem dependência nativa no servidor (tem de instalar no Windows sem compilador): hash de senha é `scrypt` do próprio Node, banco dev é PGlite (WASM) |

---

## Timezone e datas de negócio

| Campo | Valor |
|-------|-------|
| **Timezone do projeto** | `America/Fortaleza` (só para exibição) |
| **Formato de exibição** | `dd/mm/yyyy HH:mm` (BR) |
| **Origem das datas de negócio** | Não há datas de negócio: só carimbos técnicos (`criado_em`, `atualizado_em`, `expira_em`) em `timestamptz`, gerados pelo servidor e trafegados em ISO-8601 UTC |

---

## Estrutura de diretórios do projeto

Onde as skills devem procurar/criar código. Ajuste aos nomes reais do projeto.

| Tipo | Caminho |
|------|---------|
| **Endpoints / API** | `jogo/apps/servidor/src/rotas/` (HTTP) e `jogo/apps/servidor/src/tempo-real/` (WebSocket) |
| **Páginas / views** | `jogo/apps/cliente/src/` — `main.ts` (laço do jogo), `mundo/`, `entidades/`, `motor/` |
| **JS de página** | `N/A` (cliente é um jogo em canvas, não páginas) · rede/save do cliente: `jogo/apps/cliente/src/rede/`, `src/save/` |
| **Migrations** | `jogo/apps/servidor/drizzle/` (geradas por `npm run db:gerar`; aplicadas ao subir o servidor) |
| **Mapa do schema** | `jogo/apps/servidor/src/banco/schema.ts` |
| **PRDs** | `prds/` |
| **Débitos técnicos** | `prds/debito_tecnico/` |
| **Doc raiz de convenções** | `jogo/README.md` (arquitetura e comandos do jogo) |

---

## Armadilhas do projeto (anti-patterns)

> O equivalente ao bloco "Armadilhas" do `CLAUDE.md`. São as regras que a triagem
> do Codex (`/codex-review` e Fase 2 da `/prd-exec`) usa para separar bug real de
> falso positivo. Liste as recorrentes do SEU projeto — cada uma com **o que** e
> **por quê**. Exemplos genéricos (substitua/expanda):
>
> **PROCEDÊNCIA — obrigatória em toda entrada NOVA (2.15.0).** Formato:
> `**[AAAA-MM-DD · PRD-NNN | DT-NNN | incidente]** <armadilha> — *Por quê:* <...>`.
> Sem isso o Perfil só cresce: ninguém sabe se uma armadilha ainda vale, e podar vira
> chute — motivo pelo qual a poda (feita pelo `/deus`, com prova) exige carimbo para
> agir com segurança. Entradas antigas sem carimbo não precisam ser reescritas em
> massa; carimbe a que você tocar. As **regras fixas do harness** (marcadas como tal)
> não levam carimbo — não são desta ou daquela PRD.

1. **[2026-09-23 · reestruturação]** **Contrato só em `@terna/compartilhado`** — formato de
   request/response, mensagem de tempo real ou save definido direto no cliente ou no servidor.
   *Por quê:* os dois lados validam com os mesmos esquemas zod; duplicar faz um lado aceitar o
   que o outro não entende.
2. **[2026-09-23 · reestruturação]** **Mudar o formato do save sem versão nova** — alterar
   `DadosSaveV1` em vez de criar `DadosSaveV2` + conversão em `atualizarSave`. *Por quê:* saves
   já gravados (navegador e banco) deixam de abrir.
3. **[2026-09-23 · reestruturação]** **Editar `src/gerado/` ou `src/assets/*.png` à mão** — são
   saída de `jogo/ferramentas/` a partir de `jogo/fontes/`. *Por quê:* a próxima geração apaga a
   mudança; mude o gerador ou a fonte.
4. **[2026-09-23 · reestruturação]** **Dado do jogo no banco** — números de comportamento, itens,
   posições do mapa vão em `@terna/compartilhado/src/conteudo/`, não em tabela. *Por quê:* o banco
   é do jogador; conteúdo precisa de revisão/versão junto do código e o servidor valida com ele.
5. **[2026-09-23 · reestruturação]** **Confiar em valor que vem do cliente** — pontuação de
   ranking e posição são enviadas pelo jogador. *Por quê:* hoje só há validação de faixa; qualquer
   coisa que valha prêmio/competição precisa ser calculada pelo servidor.
6. **Arquivo temporário fora do projeto** *(regra fixa do harness — não remova ao adaptar)* —
   criar script de verificação/dump/CSV em `/tmp` ou em caminho de raiz (`/arquivo`).
   *Por quê:* no Git Bash/Windows, `/foo` resolve para `C:\Program Files\Git\` — fora do
   sandbox → prompt de permissão que **pendura execução autônoma por horas**. Temporários vão
   no **scratchpad da sessão** ou em `.claude/.harness-run/tmp/` (o hook `guard-bash.sh`
   bloqueia o padrão).

> Mantenha esta lista curta e específica. Ela é lida toda vez que o Codex aponta algo.

---

## Armadilhas de teste/seed (E2E)

> **A régua do `hefesto` ao escrever specs.** Estas são as armadilhas que fazem um teste
> falhar por motivo de **seed/ambiente de teste** — não por bug real do código. Cada uma já
> custou um ciclo de tentativa-erro de alguém; documentá-las aqui faz o próximo `hefesto` já
> nascer sabendo. O hefesto, o beholder (lente de tasks/teste) e o sherlock leem esta seção.
> A Fase 5 do `/prd-exec` alimenta esta lista com os "Desvios e observações" dos hefestos.
>
> Comece pelos padrões abaixo (genéricos) e **substitua/expanda com os do SEU projeto** —
> cada um com **o que** quebra e **como** contornar:

1. **[2026-09-23 · reestruturação]** **Banco compartilhado entre testes** — testes de API usam
   `novoServidor()` (`apps/servidor/test/ajuda.ts`): PGlite em memória, migrado, um por arquivo.
   *Contorno:* nomes de conta únicos por teste (o banco vive o arquivo inteiro).
2. **[2026-09-23 · reestruturação]** **Mensagem de boas-vindas perdida no WebSocket** — o
   servidor manda `bem-vindo` assim que conecta. *Contorno:* ouvir em `onInit` do `injectWS`
   (3º parâmetro: `app.injectWS(url, {}, { onInit })`), não depois do `await`.
3. **[2026-09-23 · reestruturação]** **Comparar o jogo antes/depois de uma refatoração** —
   `Math.random` e o relógio mudam cada execução. *Contorno:* no Playwright, `addInitScript`
   trocando `Math.random` por um gerador com semente e `requestAnimationFrame` por uma fila
   disparada com tempos fixos; aí o canvas (`toDataURL`) tem de sair idêntico.

> Mantenha curta e específica. É lida toda vez que um spec é criado/editado.

---

## Convenções adotadas (2.7.0)

| Convenção | Estado | Observação |
|-----------|--------|------------|
| `mfa` | `nao-adotada` `<adotada / parcial / nao-adotada / nao-se-aplica>` |  |

> Estado de adoção das convenções da casa (`.claude/convencoes/`) NESTE projeto. Seção
> ausente = tudo `nao-adotada`. Editável pela tela (`/harness-config`) ou pela `/convencao`.
> As convenções em si nascem no **harness mestre** e viajam pelo `/deus` — aqui só mora o
> que este projeto já adotou. `parcial` pede uma observação dizendo o que ficou de fora.

---

## Plataformas (multi-AI)

| Campo | Valor |
|-------|-------|
| **Superfícies instaladas** | `claude` `<claude / codex / claude,codex — espelha HARNESS_TARGETS do harness.env; o /deus e o doctor cobram o que estiver listado>` |
| **Revisor externo do review** | `auto` `<auto / codex-cli / claude-cli / none — HARNESS_EXTERNAL_REVIEWER>` |

> No Codex os modelos **não** são configurados por este Perfil — o agente herda o modelo da sessão
> (esforço fino por agente em `.codex/agents/*.toml`). A tabela de capacidades vive em `.claude/PLATAFORMAS.md` §5.
