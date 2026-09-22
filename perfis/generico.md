# Perfil pronto — Genérico (baseline neutro)

> **Como usar:** o ponto de partida mais enxuto. Copie por cima de
> `.claude/PERFIL-PROJETO.md` quando o stack não casar com `php-laragon` nem
> `node-api`. Vem com lint desligado, sem integrações de efeito colateral (Fase 0
> da `/prd-exec` pulada) e E2E opcional — você liga o que precisar. Preencha 🔧.

---

## Identificação

| Campo | Valor |
|-------|-------|
| **Nome do projeto** | `🔧 <Nome>` |
| **Slug** | `🔧 <nome>` |
| **Repositório / deploy** | `🔧 <como faz deploy>` |
| **Stack resumida** | `🔧 <linguagem + framework + banco>` |

---

## CLI (ambiente local)

| Campo | Valor |
|-------|-------|
| **Interpretador (run/lint)** | `🔧 <executável ou "N/A">` |
| **Interpretador (alt. SO)** | `N/A` |
| **Cliente de banco** | `🔧 <ou "N/A">` |
| **Cliente de banco (alt. SO)** | `N/A` |
| **Gerenciador de pacotes** | `🔧 <ou "N/A">` |

---

## Execução autônoma — comandos conhecidos-seguros (allowlist)

> Regras **estreitas** em `permissions.allow` do `.claude/settings.json` do projeto
> resolvem **antes** do classificador do auto mode e sobrevivem quando ele fica
> indisponível (fail-closed — a execução autônoma trava sem elas). Regra **larga** de
> interpretador (`Bash(<cli>:*)`) é **suspensa** em auto mode — não conta como
> cobertura. Gere o bloco pronto p/ colar com
> `bash .claude/harness-doctor.sh --gen-allowlist`. Linhas com 🔧 são **ignoradas** pelo
> gerador — confirme o comando e remova o 🔧 p/ ativar. Default: nada pré-liberado.

| Comando (estreito; `*` final = aceita argumentos) | Por que é seguro |
|---|---|
| 🔧 `<ex: <test-runner> *>` | 🔧 `<suite de testes local — sem efeito externo>` |
| 🔧 `<ex: <package-manager> install>` | 🔧 `<instala deps travadas no lock — idempotente>` |

> **Banco de dados:** nunca allowliste o cliente direto. Crie um wrapper **versionado**
> que só alcance o banco de TESTE (ex.: `.claude/scripts/db-test.sh`) e liste
> `bash .claude/scripts/db-test.sh *`. **Workspace trust:** o `permissions.allow` do
> projeto só vale após aceitar o diálogo de confiança do workspace (uma vez, interativo).

---

## Banco de dados (teste local)

| Campo | Valor |
|-------|-------|
| **SGBD** | `🔧 <ou "N/A">` |
| **Host** | `🔧 <localhost>` |
| **Database** | `🔧 <...>` |
| **Usuário** | `🔧 <...>` |
| **Senha** | `🔧 <...>` |
| **Comando de smoke test** | `🔧 <...>` |
| **Soft delete** | `🔧 <ou "N/A">` |

---

## Aplicação (URL local)

| Campo | Valor |
|-------|-------|
| **Base URL local** | `🔧 <http://localhost:...>` |
| **Base URL da API** | `🔧 <...>` |
| **Como subir o dev server** | `🔧 <comando>` |

---

## Lint automático (hook PostToolUse)

| Campo | Valor |
|-------|-------|
| **Comando de lint** | `(vazio — desligado)` |
| **Extensões verificadas** | `(nenhuma)` |
| **Bloqueante?** | Não |

> Desligado por padrão. Para ligar, defina em `.claude/harness.env`:
> `HARNESS_LINT_CMD='<comando-de-sintaxe> {file}'` e `HARNESS_LINT_EXT='<ext1,ext2>'`.
> Enquanto vazio, o hook é no-op (não atrapalha).

---

## Testes E2E

| Campo | Valor |
|-------|-------|
| **Framework** | `🔧 <ou "Nenhum">` |
| **Diretório dos specs** | `🔧 <tests/>` |
| **Base URL** | `🔧 <...>` |
| **Login de teste (usuário)** | `🔧 <...>` |
| **Login de teste (senha)** | `🔧 <...>` |
| **Seletores do login** | `🔧 <...>` |
| **Comando (spec único)** | `🔧 <...>` |
| **Comando (suite completa)** | `🔧 <...>` |
| **Pasta de screenshots** | `🔧 <ou "N/A">` |
| **Headless** | Sim |
| **Verificação visual (agentes)** | `🔧 <"N/A — projeto sem front" OU: Playwright instalado? versão + navegadores; + fatos desta máquina, carimbados [AAAA-MM-DD · origem]>` |

> Se não há E2E, escreva "Nenhum" no Framework. As skills tratam o gate de
> acceptance como manual nesse caso (checklist em vez de specs automatizados).
>
> **Projeto com front:** evidência visual de agente = **Playwright headless gravando PNG**;
> o browser pane é sonda opcional de **uma** tentativa. Regra completa em
> `.claude/PLATAFORMAS.md` §7 — este campo carrega só o estado local (versão instalada e o
> que não funciona nesta máquina).

---

## Integrações com efeitos colaterais irreversíveis

**Nenhuma.**

> Enquanto estiver "Nenhuma", a Fase 0 (Pre-flight Safe Mode) da `/prd-exec` é
> pulada automaticamente. Ao adicionar uma integração que manda algo para o mundo
> real (e-mail, SMS, pagamento, push, webhook), copie o bloco de integração do
> `PERFIL-PROJETO.md` canônico e preencha — aí o gate passa a proteger você.

---

## Safe Mode (Pre-flight da `/prd-exec` — Fase 0)

`N/A` enquanto não houver integrações com efeito colateral.

---

## Codex review

> Dupla-cega: Codex CLI + agente `sherlock` (Claude) em paralelo. Sem Codex, roda só o sherlock.

| Campo | Valor |
|-------|-------|
| **Pasta de relatórios** | `codex-reviews/` na raiz do repo (default; em `harness.env` → `HARNESS_CODEX_REPORTS`) |
| **Limite de ciclos** | `preset` |
| **Reasoning do Codex** | `preset` `<low / medium / high>` |

> **Limite de ciclos:** máx. de rodadas review→correção (`0` = sem limite; conta apertada:
> `2`–`3`). Esgotou com bloqueantes → a Fase 2 para e pede decisão humana (seguir/abortar).
| **Pré-requisitos do Codex** | `codex` no PATH + `codex login` (opcional — sem ele, só sherlock) |

---

## Nível de esforço (preset)

| Campo | Valor |
|-------|-------|
| **Preset de esforço** | `equilibrado` `<economico / equilibrado / maximo>` |

> Resolve modelos + ciclos + reasoning de uma vez. `economico` (devs): Sonnet, 1 ciclo base, low.
> `equilibrado` (default): Sonnet, 2 ciclos base, medium. `maximo`: julgadores em Opus, 3 ciclos, high.
> **Gates da `/prd` no `equilibrado` (3.4.24, item 13):** beholder e michelangelo rodam o ciclo 1 em
> Sonnet; Opus só no ciclo 2, uma vez, se o ciclo 1 reabriu o desenho (≥ 3 🔴 estruturais). Para
> manter Opus no c1, declare `Modelo do beholder: opus` abaixo (override vence o preset).
> **Esforço da sessão (3.4.25):** economico `medium` · equilibrado `high` · maximo `xhigh` — os subagentes
> HERDAM o esforço da sessão (não há esforço por chamada); quem aplica é você (`/effort`), a skill confere e avisa.
> Tabela de expansão e régua completas: ver o `PERFIL-PROJETO.md` canônico do harness.

## Agentes do harness (modelos) — override fino

> `preset` (herda — default), `sonnet`, `opus` ou `fable` (override explícito; `fable` = Fable 5.1, custo 2× Opus —
> opt-in para gate c1 de PRD de dinheiro/segurança, nunca vem de preset — 3.4.25). `hefesto` é sempre Sonnet.

| Campo | Valor |
|-------|-------|
| **Modelo do discovery analítico** | `preset` |
| **Modelo do sherlock** | `preset` |
| **Modelo do atlas** | `preset` |
| **Modelo do tony-stark** | `preset` |
| **Modelo do beholder** | `preset` |
| **Modelo do michelangelo** | `preset` |
| **Modelo do dedalo** | `preset` |
| **Esforço da sessão** | `preset` `<preset / low / medium / high / xhigh / max>` |
| **Ciclos do beholder** | `preset` `<ou número; 0 = sem limite>` |
| **Ciclos do michelangelo** | `preset` `<ou número; 0 = sem limite — gate de UX, só quando há UI>` |

> Esgotou os ciclos sem zerar os bloqueadores -> a `/prd` para e pede decisão humana (seguir ou abortar).
> O **michelangelo** (gate de UX) roda em paralelo ao beholder no Passo 10 quando a PRD tem interface.
> O **dedalo** (autor do front) projeta a interface no Passo 7.1 da `/prd` e constrói as tasks `Tipo: front`
> na `/prd-exec`; a **ariadne** (maquete) é Sonnet fixa e só roda quando você pede.

---

## Compatibilidade de produção

| Campo | Valor |
|-------|-------|
| **Runtime de produção** | `🔧 <versão da runtime em prod — para não usar feature mais nova que ela>` |
| **Outras restrições** | `🔧 <ou "Nenhuma">` |

---

## Timezone e datas de negócio

| Campo | Valor |
|-------|-------|
| **Timezone do projeto** | `🔧 <ex: UTC>` |
| **Formato de exibição** | `🔧 <...>` |
| **Origem das datas de negócio** | gerar na origem/payload, não no relógio do servidor (fuso diverge); campos automáticos só p/ auditoria |

---

## Estrutura de diretórios do projeto

| Tipo | Caminho |
|------|---------|
| **Endpoints / API** | `🔧 <...>` |
| **Páginas / views** | `🔧 <ou "N/A">` |
| **JS de página** | `🔧 <ou "N/A">` |
| **Migrations** | `🔧 <ou "N/A">` |
| **Mapa do schema** | `🔧 <ou "N/A">` |
| **PRDs** | `prds/` |
| **Débitos técnicos** | `prds/debito_tecnico/` |
| **Doc raiz de convenções** | `🔧 <CLAUDE.md / AGENTS.md>` |

---

## Armadilhas do projeto (anti-patterns)

> Comece vazio e adicione conforme descobrir os anti-patterns recorrentes do
> projeto. Cada um: **o que** evitar + **por quê**. Esta lista é a régua que a
> triagem do Codex usa para separar bug real de falso positivo.

1. **Arquivo temporário fora do projeto** *(regra fixa do harness — não remova)* — nunca criar
   script/dump em `/tmp` nem em caminho de raiz (`/arquivo`); no Git Bash/Windows isso resolve
   para `C:\Program Files\Git\` → prompt de permissão que pendura execução autônoma por horas.
   Temporários: scratchpad da sessão ou `.claude/.harness-run/tmp/`.
2. `🔧 <anti-pattern 1 — por quê>`
3. `🔧 <anti-pattern 2 — por quê>`

---

## Armadilhas de teste/seed (E2E)

> A régua do `hefesto` ao escrever specs (o beholder e o sherlock também leem). A Fase 5 da
> `/prd-exec` alimenta esta lista. Expanda com os tropeços de seed do SEU projeto.

1. **FK RESTRICT no cleanup** — apague filho->pai, ou use o helper de cleanup do projeto.
2. **`LAST_INSERT_ID()` = 0 entre conexões** — use `SELECT MAX(id)` quando o helper abre conexão nova por chamada.
3. **Coluna inexistente na tabela** — confira o schema real antes do seed (ex: `created_at` onde não existe).
4. **Lock de scheduler na 2ª execução** — libere o lock entre runs (ex: `CronLock`), ou seede o estado direto.
5. **`LIMIT N` + filtro de data** — seede com a data antiga que o `WHERE data < X` exige.
6. **Assert frágil com seed inválido** — asserir `not.toBe('N')` em vez de `toBe('S')`, ou seede dado válido.

---

## Plataformas (multi-AI)

| Campo | Valor |
|-------|-------|
| **Superfícies instaladas** | `claude` `<claude / codex / claude,codex — espelha HARNESS_TARGETS do harness.env; o /deus e o doctor cobram o que estiver listado>` |
| **Revisor externo do review** | `auto` `<auto / codex-cli / claude-cli / none — HARNESS_EXTERNAL_REVIEWER>` |

> No Codex os modelos **não** são configurados por este Perfil — o agente herda o modelo da sessão
> (esforço fino por agente em `.codex/agents/*.toml`). A tabela de capacidades vive em `.claude/PLATAFORMAS.md` §5.
