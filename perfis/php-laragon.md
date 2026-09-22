# Perfil pronto — PHP + Laragon + MySQL (frontend jQuery/Metronic)

> **Como usar:** copie este arquivo por cima de `.claude/PERFIL-PROJETO.md` no
> projeto-alvo e ajuste o que estiver entre `<...>` ou marcado com 🔧. Os caminhos
> CLI já estão nos defaults do Laragon — confira a versão instalada na sua máquina.
> Pensado para o stack típico da Beta: PHP procedural + MySQL + jQuery/Handlebars/Metronic.

---

## Identificação

| Campo | Valor |
|-------|-------|
| **Nome do projeto** | `🔧 <Nome do Projeto>` |
| **Slug** | `🔧 <nome-do-projeto>` |
| **Repositório / deploy** | `🔧 <ex: GitLab CI na branch main — substitui env.js por env.deploy.js no servidor>` |
| **Stack resumida** | PHP 7.4 (prod) / 8.1 (local) + MySQL 8 + jQuery + Handlebars + Metronic/Bootstrap 4 |

---

## CLI (ambiente local)

| Campo | Valor |
|-------|-------|
| **Interpretador (run/lint)** | `C:/laragon/bin/php/php-8.1.10-Win32-vs16-x64/php.exe` 🔧 confira versão |
| **Interpretador (alt. SO)** | `/Applications/MAMP/bin/php/php7.3.33/bin/php` (macOS/MAMP) |
| **Cliente de banco** | `C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysql.exe` 🔧 confira versão |
| **Cliente de banco (alt. SO)** | `/Applications/MAMP/Library/bin/mysql` (macOS/MAMP) |
| **Gerenciador de pacotes** | `composer` (backend) + `npm` (Playwright/assets) |

---

## Execução autônoma — comandos conhecidos-seguros (allowlist)

> Regras **estreitas** em `permissions.allow` do `.claude/settings.json` do projeto
> resolvem **antes** do classificador do auto mode e sobrevivem quando ele fica
> indisponível (fail-closed — a execução autônoma trava sem elas). Regra **larga** de
> interpretador (`Bash(php:*)`, `Bash(composer:*)`) é **suspensa** em auto mode — não
> conta como cobertura. Gere o bloco pronto p/ colar com
> `bash .claude/harness-doctor.sh --gen-allowlist`. Linhas com 🔧 são **ignoradas** pelo
> gerador — confirme o comando (caminho/versão da sua máquina) e remova o 🔧 p/ ativar.

| Comando (estreito; `*` final = aceita argumentos) | Por que é seguro |
|---|---|
| 🔧 `C:/laragon/bin/php/php-8.1.10-Win32-vs16-x64/php.exe -l *` | lint de sintaxe — read-only (confira caminho) |
| 🔧 `C:/laragon/bin/php/php-8.1.10-Win32-vs16-x64/php.exe artisan migrate *` | migrations no banco LOCAL (só projeto Laravel; senão remova a linha) |
| 🔧 `C:/laragon/bin/php/php-8.1.10-Win32-vs16-x64/php.exe artisan test *` | suite de testes local (só projeto Laravel) |
| 🔧 `composer install` | instala deps travadas no lock — idempotente |
| 🔧 `composer dump-autoload` | regenera autoload — idempotente |
| 🔧 `vendor/bin/phpunit *` | testes unitários locais |
| 🔧 `npx playwright test *` | E2E headless contra o ambiente local |

> **Banco de dados:** nunca allowliste `mysql` direto. Crie um wrapper **versionado** que
> só alcance o banco de TESTE (ex.: `.claude/scripts/db-test.sh`) e liste
> `bash .claude/scripts/db-test.sh *` — valide que a regra do wrapper não é tratada como
> interpretador wildcarded. **Workspace trust:** o `permissions.allow` do projeto só vale
> após aceitar o diálogo de confiança do workspace (uma vez, interativo).

---

## Banco de dados (teste local)

| Campo | Valor |
|-------|-------|
| **SGBD** | MySQL 8 |
| **Host** | `localhost` |
| **Database** | `🔧 <meu_projeto_local>` |
| **Usuário** | `root` |
| **Senha** | `🔧 <senha-local>` |
| **Comando de smoke test** | `<cliente-mysql> -u root -p<senha> <db> -e "SELECT 1;"` |
| **Soft delete** | coluna `status` (1 ativo, 0 inativo); preferir `inativar.php` a `excluir.php`; nunca `DELETE` |

---

## Aplicação (URL local)

| Campo | Valor |
|-------|-------|
| **Base URL local** | `🔧 http://localhost/<meu-projeto>/` |
| **Base URL da API** | `🔧 http://localhost/<meu-projeto>/administrativo/api/` |
| **Como subir o dev server** | Laragon serve via Apache automaticamente |

---

## Lint automático (hook PostToolUse)

| Campo | Valor |
|-------|-------|
| **Comando de lint** | `<php-cli> -l {file}` |
| **Extensões verificadas** | `php` |
| **Bloqueante?** | Sim (erro de sintaxe PHP bloqueia o Write/Edit) |

> Em `.claude/harness.env`:
> `HARNESS_LINT_CMD='C:/laragon/bin/php/php-7.4.1-nts-Win32-vc15-x64/php.exe -l {file}'`
> `HARNESS_LINT_EXT='php'`
> (use o PHP **7.4** no lint para pegar incompatibilidades antes da produção)

---

## Testes E2E

| Campo | Valor |
|-------|-------|
| **Framework** | Playwright (`@playwright/test`) |
| **Diretório dos specs** | `tests/e2e/` |
| **Base URL** | `🔧 http://localhost/<meu-projeto>/administrativo/` |
| **Login de teste (usuário)** | `🔧 <ADMIN_TESTE>` |
| **Login de teste (senha)** | `🔧 <123456>` |
| **Seletores do login** | `input[name="login"]`, `input[name="senha"]`, `button[type="submit"]` → espera `waitForURL(/\?page=/)` |
| **Comando (spec único)** | `npx playwright test tests/e2e/<arquivo>.spec.js` |
| **Comando (suite completa)** | `npx playwright test` |
| **Pasta de screenshots** | `tests/e2e/screenshots/PRD-NNN/` |
| **Headless** | Sim — nunca `--headed` por conta própria |
| **Verificação visual (agentes)** | `🔧 <versão do @playwright/test + navegadores instalados; e fatos desta máquina, ex.: "Browser pane não funciona aqui" — carimbe [AAAA-MM-DD · origem]>` |

> Evidência visual de agente = **Playwright headless gravando PNG** na pasta acima; o browser
> pane é sonda opcional de **uma** tentativa. Regra completa em `.claude/PLATAFORMAS.md` §7 —
> aqui só o estado local. Preencha antes da primeira PRD com front (o
> `harness-doctor.sh --autonomia` cobra).

---

## Integrações com efeitos colaterais irreversíveis

### Integração: Gateway de WhatsApp (ex: WAHA / Z-API / Twilio)

| Campo | Valor |
|-------|-------|
| **O que faz** | envia mensagem WhatsApp para clientes/leads |
| **Helper/interceptor central** | `🔧 <enviarMensagemWhatsapp() — centralizar TODO envio aqui>` |
| **Palavras-chave de detecção** | `waha, whatsapp, enviarMensagem, alerta, cobranca, lembrete, recall, disparar` |
| **Como neutralizar em local** | flag de safe-mode redireciona envios para whitelist de números de teste |
| **Armadilha de idempotência** | marcar `enviado='S'` na criação do alerta **mesmo se o envio falhar** — senão o worker (N8N/fila) reprocessa e duplica |

### Integração: Calendário externo (ex: Google Calendar) 🔧 apague se não usar

| Campo | Valor |
|-------|-------|
| **O que faz** | cria/edita/cancela eventos em calendário real |
| **Helper/interceptor central** | `🔧 <criarEvento()/alterarEvento()/excluirEvento()>` |
| **Palavras-chave de detecção** | `agendamento, calendar, gcalendar, criarEvento, alterarEvento, excluirEvento` |
| **Como neutralizar em local** | safe-mode bloqueia os webhooks totalmente |

---

## Safe Mode (Pre-flight da `/prd-exec` — Fase 0)

| Campo | Valor |
|-------|-------|
| **Flag de ativação** | tabela `configuracoes`, `config='dev_safe_mode'`, valor esperado `'1'` |
| **Query de validação** | `<cliente-mysql> -u root -p<senha> <db> -e "SELECT config, dado_config FROM configuracoes WHERE config IN ('dev_safe_mode','waha_test_numbers');"` |
| **Whitelist (se aplicável)** | `config='waha_test_numbers'` deve ter ≥1 número de teste (≥10 dígitos) — só se a PRD toca WhatsApp |
| **Como detectar "ambiente local"** | baseURL contém `localhost`/`127.0.0.1`; ou `gethostname()` ≠ servidor de produção |
| **SQL pronto p/ desbloquear** | `UPDATE configuracoes SET dado_config='1' WHERE config='dev_safe_mode';` |

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
| **Runtime de produção** | PHP 7.4 (Cloudways) — **proibido**: `match`, named args, `?->` nullsafe, `readonly`, `enum`, union types (`int\|string`), constructor property promotion. **Permitido**: arrow functions, typed properties, `??=`, spread em arrays |
| **Outras restrições** | `CREATE TABLE` sempre com `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci` explícito (não depender do default do MySQL 8) |

---

## Timezone e datas de negócio

| Campo | Valor |
|-------|-------|
| **Timezone do projeto** | `🔧 America/Sao_Paulo` (ajuste — ex: `America/Fortaleza`) |
| **Formato de exibição** | `dd/mm/yyyy HH:mm:ss` (BR) via `moment(data).format('DD/MM/YYYY HH:mm:ss')` |
| **Origem das datas de negócio** | SEMPRE geradas no frontend/origem; NUNCA `NOW()`/`CURRENT_TIMESTAMP`. `created_at`/`updated_at` são só controle interno, nunca exibidos |

---

## Estrutura de diretórios do projeto

| Tipo | Caminho |
|------|---------|
| **Endpoints / API** | `administrativo/api/<recurso>/<acao>.php` (padrão `cadastrar/listar/alterar/inativar`) |
| **Páginas / views** | `administrativo/pages/<modulo>.php` |
| **JS de página** | `administrativo/assets/js/paginas/<modulo>.js` (incluído inline no fim da página) |
| **Migrations** | `administrativo/api/database/migrations/` |
| **Mapa do schema** | `database.md` na raiz |
| **PRDs** | `prds/` |
| **Débitos técnicos** | `prds/debito_tecnico/` |
| **Doc raiz de convenções** | `CLAUDE.md` / `AGENTS.md` (multi-AI: mantenha os dois finos apontando o Perfil; leitura obrigatória no início das skills) |

---

## Armadilhas do projeto (anti-patterns)

1. **Datas de negócio com `NOW()`/`CURRENT_TIMESTAMP`** — timezone do servidor diverge
   de `<TZ do projeto>` → data errada. Gerar na origem.
2. **Alerta sem `enviado='S'` na criação** — worker externo (N8N) reprocessa em erro →
   WhatsApp duplicado para o cliente.
3. **Endpoint sem `validaToken($_GET['token'] ?? '')` na primeira linha** — efeito antes da auth.
4. **Reuso de instância `ApiRequest` entre chamadas AJAX** — usar `new ApiRequest()` por chamada.
5. **`DELETE` físico** — usar soft delete via coluna `status`.
6. **Botão "X" de modal sem `<span aria-hidden="true">&times;</span>`** — Metronic injeta ícone
   via `::before`; sem o `<span>` aparecem **dois X** sobrepostos.
7. **String de UI sem acento** ("Nao", "Historico") — quebra busca e parece bug. Endpoints que
   devolvem `msg` para toastr seguem a mesma regra.
8. **Tabela de listagem** — confirmar a lib usada no projeto (jQuery DataTables vs KTDatatable do
   Metronic) antes de copiar inicialização de outra tela.
9. **Arquivo temporário fora do projeto** *(regra fixa do harness — não remova)* — nunca criar
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
