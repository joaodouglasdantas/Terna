# Perfil pronto — Node.js + API (TypeScript/Express/Postgres)

> **Como usar:** copie por cima de `.claude/PERFIL-PROJETO.md` no projeto-alvo e ajuste
> o que estiver marcado com 🔧. Pensado para uma API Node moderna (Express/Fastify/Nest)
> com TypeScript, Postgres via Prisma/Knex, testes com Playwright (E2E) ou Vitest/Jest.

---

## Identificação

| Campo | Valor |
|-------|-------|
| **Nome do projeto** | `🔧 <API XPTO>` |
| **Slug** | `🔧 <api-xpto>` |
| **Repositório / deploy** | `🔧 <ex: GitHub Actions → deploy em Railway/Render/Fly/AWS>` |
| **Stack resumida** | Node 20 + TypeScript + Express + Postgres (Prisma) |

---

## CLI (ambiente local)

| Campo | Valor |
|-------|-------|
| **Interpretador (run/lint)** | `node` (no PATH) |
| **Interpretador (alt. SO)** | N/A |
| **Cliente de banco** | `psql` (no PATH) ou via `npx prisma` |
| **Cliente de banco (alt. SO)** | N/A |
| **Gerenciador de pacotes** | `🔧 <npm / pnpm / yarn>` |

---

## Execução autônoma — comandos conhecidos-seguros (allowlist)

> Regras **estreitas** em `permissions.allow` do `.claude/settings.json` do projeto
> resolvem **antes** do classificador do auto mode e sobrevivem quando ele fica
> indisponível (fail-closed — a execução autônoma trava sem elas). Regra **larga** de
> interpretador (`Bash(node:*)`, `Bash(npm:*)`) é **suspensa** em auto mode — não conta
> como cobertura. Gere o bloco pronto p/ colar com
> `bash .claude/harness-doctor.sh --gen-allowlist`. Linhas com 🔧 são **ignoradas** pelo
> gerador — confirme o comando e remova o 🔧 p/ ativar.

| Comando (estreito; `*` final = aceita argumentos) | Por que é seguro |
|---|---|
| 🔧 `npm test` | suite de testes local |
| 🔧 `npm run build` | build local — sem efeito externo |
| 🔧 `node --check *` | lint de sintaxe — read-only |
| 🔧 `npx playwright test *` | E2E headless contra o ambiente local |

> **Banco de dados:** nunca allowliste `psql` direto. Crie um wrapper **versionado** que
> só alcance o banco de TESTE (ex.: `.claude/scripts/db-test.sh`) e liste
> `bash .claude/scripts/db-test.sh *` — valide que a regra do wrapper não é tratada como
> interpretador wildcarded. **Workspace trust:** o `permissions.allow` do projeto só vale
> após aceitar o diálogo de confiança do workspace (uma vez, interativo).

---

## Banco de dados (teste local)

| Campo | Valor |
|-------|-------|
| **SGBD** | PostgreSQL |
| **Host** | `localhost:5432` |
| **Database** | `🔧 <xpto_dev>` |
| **Usuário** | `🔧 <postgres>` |
| **Senha** | `🔧 <senha-local>` |
| **Comando de smoke test** | `psql "postgresql://<user>:<senha>@localhost:5432/<db>" -c "SELECT 1;"` |
| **Soft delete** | `🔧 <coluna deleted_at NULL/timestamp — ou flag is_active — ou "N/A">` |

> Conexão real do app vem de `DATABASE_URL` no `.env` — aqui só o necessário para smoke test local.

---

## Aplicação (URL local)

| Campo | Valor |
|-------|-------|
| **Base URL local** | `🔧 http://localhost:3000` |
| **Base URL da API** | `🔧 http://localhost:3000/api` |
| **Como subir o dev server** | `🔧 <npm run dev>` |

---

## Lint automático (hook PostToolUse)

| Campo | Valor |
|-------|-------|
| **Comando de lint** | `node --check {file}` (só sintaxe; bloqueante) |
| **Extensões verificadas** | `js,mjs,cjs` |
| **Bloqueante?** | Sim |

> Em `.claude/harness.env`:
> `HARNESS_LINT_CMD='node --check {file}'`
> `HARNESS_LINT_EXT='js,mjs,cjs'`
>
> ⚠️ `node --check` **não** valida TypeScript. Para `.ts`/`.tsx`, `tsc` é por-projeto
> (não por-arquivo), então não cabe num hook por-arquivo bloqueante. Opções:
> - deixe o lint só para `.js` gerado/de config; rode `npx tsc --noEmit` no gate de testes;
> - ou use `HARNESS_LINT_CMD='npx eslint {file}'` com `HARNESS_LINT_EXT='ts,tsx,js'` e aceite
>   que estilo pode bloquear (avalie deixar `HARNESS_SKIP_LINT=1` e confiar no CI).

---

## Testes E2E

| Campo | Valor |
|-------|-------|
| **Framework** | `🔧 <Playwright (UI) / supertest+Vitest (API)>` |
| **Diretório dos specs** | `🔧 <tests/e2e/ ou test/>` |
| **Base URL** | `🔧 http://localhost:3000` |
| **Login de teste (usuário)** | `🔧 <test@exemplo.com — ou token de teste>` |
| **Login de teste (senha)** | `🔧 <senha-teste>` |
| **Seletores do login** | `🔧 <para API: header Authorization: Bearer <token-de-teste>>` |
| **Comando (spec único)** | `🔧 <npx playwright test <arquivo> — ou: npx vitest run <arquivo>>` |
| **Comando (suite completa)** | `🔧 <npm test>` |
| **Pasta de screenshots** | `🔧 <tests/e2e/screenshots/PRD-NNN/ — ou "N/A" p/ API pura>` |
| **Headless** | Sim |
| **Verificação visual (agentes)** | `🔧 <"N/A — API pura, sem front" OU: versão do @playwright/test + navegadores instalados + fatos desta máquina, carimbados [AAAA-MM-DD · origem]>` |

> Só se o projeto tiver front. Evidência visual de agente = **Playwright headless gravando
> PNG**; o browser pane é sonda opcional de **uma** tentativa. Regra completa em
> `.claude/PLATAFORMAS.md` §7 — aqui só o estado local.

---

## Integrações com efeitos colaterais irreversíveis

### Integração: Pagamentos (ex: Stripe) 🔧 apague se não usar

| Campo | Valor |
|-------|-------|
| **O que faz** | cobra cartão / cria assinatura |
| **Helper/interceptor central** | `🔧 <paymentClient — usar test keys em dev (sk_test_...)>` |
| **Palavras-chave de detecção** | `stripe, charge, payment, invoice, subscription, payout` |
| **Como neutralizar em local** | usar SEMPRE chaves de teste; nunca a live key no `.env` local |

### Integração: E-mail / SMS transacional (ex: SendGrid / Twilio) 🔧 apague se não usar

| Campo | Valor |
|-------|-------|
| **O que faz** | envia e-mail/SMS para usuários reais |
| **Helper/interceptor central** | `🔧 <mailer.send() / sms.send() — centralizar>` |
| **Palavras-chave de detecção** | `sendgrid, twilio, sendMail, sendEmail, sendSms, notify` |
| **Como neutralizar em local** | `MAIL_SINK=1` redireciona para mailtrap/console; nunca destinatário real em dev |
| **Armadilha de idempotência** | usar idempotency key por job; marcar enviado antes de retry para não duplicar |

---

## Safe Mode (Pre-flight da `/prd-exec` — Fase 0)

| Campo | Valor |
|-------|-------|
| **Flag de ativação** | `🔧 <var de ambiente: SAFE_MODE=1 em .env.local>` |
| **Query de validação** | `🔧 <checar process.env / ler .env.local: grep SAFE_MODE .env.local>` |
| **Whitelist (se aplicável)** | `🔧 <TEST_EMAIL / TEST_PHONE preenchidos>` |
| **Como detectar "ambiente local"** | `NODE_ENV !== 'production'` e baseURL = localhost |
| **SQL/comando p/ desbloquear** | `🔧 <echo "SAFE_MODE=1" >> .env.local>` |

> Se o projeto não tem integrações com efeito colateral, escreva "Nenhuma" na seção
> acima e a Fase 0 da `/prd-exec` é pulada automaticamente.

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
| **Runtime de produção** | `🔧 <Node 20 LTS — mesma major do dev; sem APIs experimentais>` |
| **Outras restrições** | `🔧 <ex: ESM vs CJS; engines no package.json; sem deps nativas que não buildam no host>` |

---

## Timezone e datas de negócio

| Campo | Valor |
|-------|-------|
| **Timezone do projeto** | `🔧 <UTC no banco; converter na borda>` |
| **Formato de exibição** | `🔧 <ISO 8601 na API; formatação no frontend>` |
| **Origem das datas de negócio** | gravar em UTC; `created_at`/`updated_at` automáticos só p/ auditoria; datas de negócio vêm do payload validado |

---

## Estrutura de diretórios do projeto

| Tipo | Caminho |
|------|---------|
| **Endpoints / API** | `🔧 <src/routes/ ou src/controllers/>` |
| **Páginas / views** | `🔧 <N/A p/ API pura — ou src/pages/ no front>` |
| **JS de página** | `🔧 <N/A>` |
| **Migrations** | `🔧 <prisma/migrations/ ou migrations/>` |
| **Mapa do schema** | `🔧 <prisma/schema.prisma ou src/db/schema.ts>` |
| **PRDs** | `prds/` |
| **Débitos técnicos** | `prds/debito_tecnico/` |
| **Doc raiz de convenções** | `🔧 <CLAUDE.md ou AGENTS.md>` |

---

## Armadilhas do projeto (anti-patterns)

> Substitua pelos anti-patterns reais do seu projeto. Exemplos comuns em Node/API:

1. **`await` faltando em chamada async** — promessa pendente engole erro / ordem errada.
2. **Datas como `new Date()` no servidor para data de negócio** — fuso do host diverge;
   prefira a data validada do payload e armazene em UTC.
3. **Chave `live` de pagamento/e-mail no `.env` local** — risco de cobrar/enviar de verdade.
4. **Query sem parametrização** (string interpolada) — SQL injection; usar prepared/ORM.
5. **N+1 em listagens** — usar `include`/join em vez de loop de queries.
6. **Vazar segredo em log/response** — nunca logar token/PII; checar o que o handler retorna.
7. **Faltou `idempotency key`** em job que pode ser re-tentado — duplica efeito externo.
8. **Arquivo temporário fora do projeto** *(regra fixa do harness — não remova)* — nunca criar
   script/dump em `/tmp` nem em caminho de raiz (`/arquivo`); no Git Bash/Windows isso resolve
   para `C:\Program Files\Git\` → prompt de permissão que pendura execução autônoma por horas.
   Temporários: scratchpad da sessão ou `.claude/.harness-run/tmp/`.

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
