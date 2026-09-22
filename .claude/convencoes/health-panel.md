---
slug: health-panel
nome: "Health panel — endpoints fixos de saúde (máquina, cron/workers, integrações e módulos)"
categoria: infra
resumo: "Todo software da Beta expõe dois endpoints fixos: GET /health (liveness público, 200/503) e GET /health/painel (token por instalação; recursos da máquina, cron e workers, integrações mascaradas e um check por módulo) — no mesmo envelope, para o Caronte monitorar o parque."
maturidade: experimental
aplica_se: [php]
depende_de: []
desde: 3.5.1
referencias:
  - projeto: caronte
    caminhos: ["api/src/Controller/HealthController.php", "api/src/Service/CronService.php", "api/src/Service/WatchdogService.php", "API_CONTRACT.md", "docs/DEPLOY.md", ".claude/PERFIL-PROJETO.md"]
  - projeto: beholder-mails
    caminhos: ["app/Http/Controllers/Health/HealthWorkerController.php", "app/Services/Monitoramento/ServicoHealthWorker.php", "config/monitoramento.php", "routes/api.php", "assistente_ia/prds/PRD-001-health-restart-worker/"]
  - projeto: palantir-app
    caminhos: ["api/health.php", "api/dependencias/ServiceHealthChecker.php", "api/sistema/status_servicos.php", "api/admin/tenant_health.php"]
  - projeto: dra-mariana-duarte
    caminhos: ["administrativo/api/configuracoes/saude_integracoes.php", "administrativo/api/manutencao/diagnostico_port.php", "administrativo/api/dependencias/segredos.php"]
  - projeto: sagittarius
    caminhos: ["modulos/whatsapp_lote_tick.php"]
---

# `health-panel` — saúde do software em endpoints fixos

> **Maturidade `experimental` de propósito.** Os pedaços existem e rodam em produção — o
> `GET /v1/health` do Caronte (banco + cron + presença, 200/503), o `GET /health/worker` do
> Beholder (PID + heartbeat em arquivo, `X-Health-Token`), o `api/health.php` do Palantír (banco,
> disco, crons, serviços opcionais) e a "Saúde das integrações" do Taurus (whitelist + máscara).
> O que **não** existe ainda é o contrato **único** que esta convenção fixa, nem o consumidor
> (o Caronte monitorando o parque). O primeiro port promove a `estavel`; o consumidor é uma PRD
> do Caronte (ver "O outro lado: o Caronte").

## Por que existe

Cada software da casa descobre que está doente pelo cliente. O worker de e-mail do Beholder
parava "sem nenhum aviso visível para o time até algum cliente reclamar" (PRD-001 do Beholder,
29/04/2026); a sessão WAHA do SAMA caía e os lotes de WhatsApp continuavam "processando"
(PRD-097 do Sagittarius); um clone novo do Taurus subia lendo credencial da clínica anterior
(PRD-072). Cada projeto resolveu o seu pedaço com um endpoint próprio, com nome, formato e
autenticação diferentes — e nenhum deles é lido por ninguém de fora.

A convenção fixa **dois endpoints com nome, envelope e regras iguais em todo software**, em
dois níveis: **máquina/recurso** (sempre que o host permitir) e **módulo** (cada módulo do
software responde se está saudável). O objetivo final é o **Caronte** — que já roda em outro
host, já tem scheduler, já fala com o Beholder e já guarda a licença de cada instalação —
consumir esses endpoints e virar o painel de saúde do parque.

## Quando aplicar — e quando NÃO

- **Aplique quando:** o software roda em servidor (API ou app web) para cliente final ou para
  a operação da Beta — Taurus core (e daí para os clones), Sagittarius/SAMA, 3S, Palantír,
  Beholder, Caronte, OpenGate, avulsos. Sistema interno também entra: o Beholder é o primeiro
  "cliente" do watchdog do Caronte.
- **Não aplique quando:** site estático/institucional sem backend próprio, app mobile (o app
  consome o backend que já expõe o health), script de linha de comando.
- **Não confunda com** a presença do harness (telemetria de dev) nem com a licença
  (`licenca-caronte`): os três falam com o Caronte por superfícies e tokens **diferentes**.

## Pré-requisitos no projeto

| Pré-requisito | Por quê |
|---------------|---------|
| Um ponto de configuração por instalação, fora do git e do dump | O `health_token` é segredo de instalação (mesmo padrão de `jwt_secret` e do `beholder_health_token` do Caronte: em `configuracoes` fora do schema editável; no Laravel, `.env`). |
| Tabela `migrations` do runner (ou equivalente) | `recursos.migrations_pendentes` compara arquivos × aplicadas. |
| Registro de última execução dos jobs (`cron_config.last_executed_at`, `cron_last_tick`…) | O dead man's switch do cron só existe se o scheduler grava o tick. Projeto com `cron-smart` já tem. |
| Worker de longa duração (se houver) escreve PID file + heartbeat em **arquivo** | Heartbeat em tabela gerou zumbis e falsos alertas no Beholder (armadilha 1). |
| Lista de módulos do software igual à do cadastro no Caronte (`software_modulos.codigo`) | `modulos[].codigo` é contrato com o cadastro — o painel do Caronte cruza por código, nunca por nome. |

## Modelo de dados

**Nenhuma tabela de estado.** O estado de saúde é **derivado a cada leitura**, nunca
materializado (regra do `WatchdogService` do Caronte e da `project-estado-licenca-derivado`).
O que se grava é só a **transição**, para histórico e alerta:

```sql
-- Opcional, só se o software alerta localmente (Palantír faz isso; Caronte usa `auditoria`).
-- Uma linha POR MUDANÇA de status de um check — nunca por tick (a cada 2 min seriam ~720/dia).
CREATE TABLE IF NOT EXISTS health_eventos (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo       VARCHAR(60)  NOT NULL,            -- check (modulo/integracao/worker/recurso/cron)
  status_de    VARCHAR(20)  NULL,                -- ok | degradado | falha | nao_configurado | nao_verificado
  status_para  VARCHAR(20)  NOT NULL,
  detalhe      VARCHAR(255) NULL,                -- texto curto, SEM segredo
  ocorrido_em  DATETIME     NOT NULL,            -- data de negócio (parâmetro), nunca NOW() do banco
  alertado_em  DATETIME     NULL,                -- debounce do alerta local
  INDEX idx_health_eventos_codigo (codigo, ocorrido_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

- Configuração por instalação (PHP vanilla, `configuracoes`, semeada vazia e idempotente com
  `WHERE NOT EXISTS` — a tabela do Taurus não tem UNIQUE em `config`): `health_token` (segredo,
  `editavel=0`), `health_instalacao` (slug desta instalação, ex.: `taurus-mariana`),
  `health_disco_min_mb` (default 500 degradado / 100 falha).
- Heartbeat de worker: **arquivo** (`storage/worker/<nome>.pid` + `<nome>.heartbeat`, mtime),
  como `config/monitoramento.php` do Beholder — nunca coluna.

## Contratos

### Envelope e vocabulário (iguais nos três endpoints)

- Envelope da casa: `{ "ok": bool, "data": {...}, "error": null|{code, message} }`.
- **Status de um check:** `ok` · `degradado` · `falha` · `nao_configurado` (a integração/módulo
  não está ligado nesta instalação) · `nao_verificado` (check caro, não rodou nesta chamada).
  Só `falha` de um check **`critico`** derruba o status geral para `down`.
- **Status geral:** `up` (tudo `ok`/`nao_*`) · `degradado` (algum `degradado`, ou `falha`
  não crítica) · `down` (`falha` crítica). HTTP **200 para `up` e `degradado`; 503 só para
  `down`** — o monitor externo (UptimeRobot, Caronte) decide "está no ar" pelo código HTTP e
  lê o resto no corpo.
- **Shape de um check** (o mesmo para módulo, integração, worker, cron e recurso):

```json
{ "codigo": "agenda", "nome": "Agenda", "tipo": "modulo",
  "status": "ok", "critico": true, "latencia_ms": 12,
  "detalhe": "texto curto, sem segredo, sem stack",
  "verificado_em": "2026-09-11T14:02:10-03:00", "ultimo_ok_em": "2026-09-11T14:02:10-03:00",
  "valor": { "fila_presa": 0, "ultimo_evento_min": 3 } }
```

- Headers: `Content-Type: application/json; charset=utf-8`, **`Cache-Control: no-store`**.
- Timeouts: `/health` responde em **< 500 ms** (`set_time_limit(5)`); `/health/painel` em
  **≤ 5 s** no total, **≤ 2 s por check**; `?profundo=1` libera até 20 s para checks caros.
- **Nunca** um segredo, nome de dev, nome de cliente de outro tenant ou stack trace no corpo.
  Detalhe de exceção vai para o `error_log`, não para a resposta (Caronte `HealthController`).

### `GET /health` — liveness público

Sem autenticação. Diz **só** se o processo e o banco respondem — é o que o UptimeRobot e o
Caronte batem a cada minuto.

```json
{ "ok": true, "data": { "status": "up", "db": true, "versao": "2.31.0", "ts": "2026-09-11T14:02:10-03:00" }, "error": null }
```

- Banco fora ⇒ **503** com `db:false` e `status:"down"` (única rota onde a exceção do PDO é
  capturada localmente — nas demais ela sobe até o handler global).
- **Nada além disso** nesta rota. O `/v1/health` do Caronte devolve `cron` e `presenca` porque
  nasceu antes desta convenção e é **agregado sem nomes**; software novo não cresce a rota
  pública — cresce o painel.

### `GET /health/painel` — o painel, protegido por token

Header `X-Health-Token: <token da instalação>` (comparado com `hash_equals`; `?token=` só
como alternativa documentada, nunca em log). Sem token ou token errado ⇒ **401** — e **401 não
é queda** (armadilha 2).

```json
{ "ok": true, "data": {
  "status": "degradado", "ts": "2026-09-11T14:02:10-03:00", "duracao_ms": 840, "profundo": false,
  "software": { "codigo": "taurus", "versao": "2.31.0", "instalacao": "taurus-mariana", "harness": "3.5.0" },
  "recursos": { "status": "ok", "checks": [
    { "codigo": "disco",      "tipo": "recurso", "status": "ok",        "critico": true,  "valor": { "livre_mb": 18240, "caminho": "storage/" } },
    { "codigo": "memoria",    "tipo": "recurso", "status": "nao_verificado", "critico": false, "detalhe": "sem /proc/meminfo neste host" },
    { "codigo": "carga",      "tipo": "recurso", "status": "ok",        "critico": false, "valor": { "load_1m": 0.42 } },
    { "codigo": "relogio",    "tipo": "recurso", "status": "ok",        "critico": false, "valor": { "hora": "2026-09-11T14:02:10-03:00", "timezone": "America/Fortaleza" } },
    { "codigo": "runtime",    "tipo": "recurso", "status": "ok",        "critico": false, "valor": { "php": "7.4.33", "so": "Linux" } },
    { "codigo": "migrations", "tipo": "recurso", "status": "degradado", "critico": false, "valor": { "pendentes": 1 }, "detalhe": "0194_x.php não aplicada" }
  ]},
  "cron": { "status": "ok", "checks": [
    { "codigo": "scheduler", "tipo": "cron", "status": "ok", "critico": true, "valor": { "ultimo_tick": "2026-09-11T14:01:00-03:00", "minutos_desde": 1, "atrasado": false } },
    { "codigo": "cobrar",    "tipo": "cron", "status": "ok", "critico": false, "valor": { "ultima_execucao": "2026-09-11T06:00:00-03:00", "intervalo_min": 1440, "ultimo_status": "ok" } }
  ]},
  "workers": { "status": "ok", "checks": [
    { "codigo": "worker_email", "tipo": "worker", "status": "ok", "critico": true, "valor": { "alive": true, "pid": 12345, "heartbeat_idade_s": 12 } }
  ]},
  "integracoes": { "status": "ok", "checks": [
    { "codigo": "waha", "tipo": "integracao", "status": "ok", "critico": false, "valor": { "configurado": true, "mascara": "••••a9f2", "sessao": "WORKING" } },
    { "codigo": "s3",   "tipo": "integracao", "status": "nao_configurado", "critico": false, "valor": { "configurado": false } },
    { "codigo": "anthropic", "tipo": "integracao", "status": "nao_verificado", "critico": false, "detalhe": "só com ?profundo=1" }
  ]},
  "modulos": { "status": "ok", "checks": [
    { "codigo": "agenda",  "tipo": "modulo", "status": "ok", "critico": true,  "valor": { "ultimo_evento_min": 3 } },
    { "codigo": "inbox",   "tipo": "modulo", "status": "ok", "critico": false, "valor": { "fila_presa": 0, "webhook_ultimo_min": 1 } },
    { "codigo": "financeiro", "tipo": "modulo", "status": "nao_configurado", "critico": false }
  ]}
}, "error": null }
```

- `software.codigo` = `softwares.slug` do Caronte; `modulos[].codigo` = `software_modulos.codigo`
  do Caronte. É por esses códigos que o painel do Caronte cruza licença × saúde.
- `?profundo=1` roda os checks caros (ping real na Anthropic/Apify/S3, teste de sessão WAHA) —
  fora disso eles saem `nao_verificado`, nunca `falha`.
- `GET /health/painel?grupo=modulos` (opcional) devolve só um grupo; `GET /health/modulos/{codigo}`
  (opcional) devolve um check — mesmo shape. Servem para o Caronte re-checar um item sem pagar o painel inteiro.

### O registro de checks (função pura) e o executor (do canal)

- **Registro único** por software (`api/health/checks.php` no PHP vanilla; `app/Health/Checks.php`
  no Laravel): um mapa `codigo => [nome, tipo, critico, callable]`. Cada módulo escreve o seu
  `callable` ao lado do próprio código, mas **registra aqui** — é a mesma "fonte única" que a
  PRD-072 usou para os segredos (`_mapaSegredosPort()` alimenta tela e CLI sem divergir).
- **Um check só lê.** Nunca envia mensagem, nunca chama IA, nunca reinicia nada. Responde três
  perguntas: (1) o que o módulo precisa existe? (tabela, config, arquivo); (2) o último trabalho
  aconteceu no prazo? (dead man's switch por módulo: último evento/última execução); (3) há fila
  presa ou erro acumulado acima do limiar?
- **Executor** (`healthExecutar($checks, $timeoutTotal)`): mede latência, aplica o timeout por
  check, captura `Throwable` e devolve `falha` com `detalhe` genérico (o `getMessage()` vai para o
  log), agrega o status do grupo e o geral. É código do canal — a mesma função serve ao endpoint,
  a um CLI de diagnóstico e a uma tela admin.
- **Ações corretivas** (restart de worker etc.) ficam **fora** deste contrato v1. Quando existirem,
  entram como `POST /health/acoes/{codigo}` com as duas invariantes do Beholder/Caronte: **202
  nunca é sucesso** e **cura só se prova por PID diferente** na recheca.

### O outro lado: o Caronte (consumidor — PRD futura, fora deste port)

Registrado aqui para o port já nascer compatível; **não** é task do software consumidor.

- `licencas.health_url` (base do software) + `health_token` (segredo por licença) — a licença
  já é a identidade da instalação (`api_key`, `cliente_nome/versao`), o health pendura nela.
- Job `health_poll` no `CronService` (`depende_de => null`, como `beholder_watchdog`): a cada
  5 min bate `GET /health` de todas; a cada 30 min (e sob demanda na tela) bate `/health/painel`.
- Estado **derivado**, gravado em `auditoria` (`entidade='health_software'`) **só na transição**
  — mesmo molde do `WatchdogService`: tempo caído, quedas no mês e "desde quando" são COUNT/MAX
  na leitura.
- Três estados exclusivos por instalação, nunca inferidos de lista vazia: **nunca consultado**
  (sem `health_url` — não é falha), **mudo** (timeout/rede N vezes seguidas), **respondendo**
  (com o status que ele devolveu). "Ausência não é falha" vem da PRD-008 do Caronte.
- Alerta WhatsApp (primário) + e-mail (best-effort) na transição para `down`/`mudo`, com
  debounce de 6 h (`ALERTA_DEBOUNCE_HORAS`), e **canal alternativo quando o doente é o próprio
  WAHA** (armadilha 9).
- Tela "Saúde dos softwares": parque × grupos (recursos, cron, workers, integrações, módulos)
  com o `verificado_em` de cada célula. O watchdog do Beholder migra para este modelo: o
  `/health/worker` vira o item `workers[].worker_email` do painel do Beholder.

## Passo a passo do port

Cada item vira uma task da PRD (`/convencao portar health-panel` monta a PRD com este roteiro).

1. **Token e configuração** — semear `health_token` (vazio, `editavel=0`), `health_instalacao`
   e `health_disco_min_mb` (PHP vanilla: migration idempotente em `configuracoes`; Laravel:
   `config/health.php` lendo `.env`). Token gerado no deploy da instalação (`bin2hex(random_bytes(24))`),
   gravado por SQL/`.env`, nunca no git nem no dump que viaja para outro clone.
2. **`GET /health`** — copiar o molde do `HealthController` do Caronte: `SELECT 1`, catch local
   do PDO, 503 com `db:false`, `no-store`, `set_time_limit(5)`, versão do app. Sem mais nada.
3. **Registro + executor** — `health/checks.php` (mapa) e `health/executor.php` (`healthExecutar`):
   timeout por check, `Throwable` ⇒ `falha` genérica + `error_log`, latência, agregação. Testável
   sem HTTP.
4. **Recursos** — `disco` (do diretório de storage/log; < 500 MB degradado, < 100 MB falha
   crítica), `memoria` (`/proc/meminfo` quando existir; senão `nao_verificado`), `carga`
   (`sys_getloadavg()` quando existir), `relogio` (hora + timezone do processo — o Palantír fixa
   `America/Sao_Paulo`, o Caronte `America/Fortaleza`: declare a sua), `runtime` (PHP/SO),
   `migrations` (arquivos × tabela `migrations`; pendente ⇒ degradado, nunca falha).
5. **Cron e workers** — `scheduler` = dead man's switch do tick (`atrasado` quando `minutos_desde`
   > 5× o tick, como o Caronte; Palantír usa 2× o intervalo por job); um check por job habilitado
   (`ultima_execucao`, `ultimo_status`); worker de longa duração = PID + heartbeat em arquivo
   (`alive`, `pid`, `heartbeat_idade_s`, `razao` ∈ `sem_pid_file|processo_inexistente|heartbeat_envelhecido|erro_io_local`).
6. **Integrações** — reusar o mapa whitelist de segredos (Taurus: `_mapaSegredosPort()`), status
   `configurado|fallback|faltando` ⇒ `ok|degradado|nao_configurado`, máscara `••••1234`; ping real
   só com `?profundo=1` (WAHA: sessão `WORKING`; Apify: saldo; Anthropic: request mínimo).
7. **Módulos** — um check por módulo declarado no Perfil e no cadastro do Caronte, com as três
   perguntas (existe / trabalhou no prazo / fila presa). `critico` só para o módulo sem o qual o
   cliente não opera (agenda no Taurus, lote no SAMA). Módulo desligado nesta instalação ⇒
   `nao_configurado`.
8. **`GET /health/painel`** — token com `hash_equals`, 401 sem token, `?profundo=1`, `?grupo=`,
   `duracao_ms`, `software{codigo,versao,instalacao,harness}`.
9. **Tela admin opcional** — se o software já tem "saúde das integrações"/"status dos serviços"
   (Taurus, Palantír), a tela passa a **consumir o painel** (uma fonte só). Item de menu admin.
10. **Testes E2E (stub onde precisar)** — `/health` 200 com `db:true`; `/health/painel` 401 sem
    token e 200 com token; corpo **não contém** nenhum valor de segredo conhecido (grep no JSON);
    todo módulo do Perfil aparece em `modulos[]`; check que lança exceção vira `falha` sem 500;
    `?profundo` ausente ⇒ integrações caras `nao_verificado`; tempo total < 5 s; recurso não
    crítico em `falha` não derruba para 503.
11. **DEPLOY e Perfil** — smoke `GET /health` = 200 no pipeline (o `docs/DEPLOY.md` do Caronte já
    faz isso no passo 6); provisionamento do token; Perfil com a convenção `adotada`, os códigos
    de módulo e as armadilhas locais; 1 linha em `docs/manual/_fila.md` (tela admin).
12. **Cadastro no Caronte** — quando a PRD do consumidor existir: `health_url` + token na licença
    da instalação; conferir na tela "Saúde dos softwares" que o estado saiu de `nunca consultado`.

## Armadilhas

1. **[2026-04-29 · Beholder PRD-001] Heartbeat de worker em TABELA.** *Sintoma:* "workers
   parcialmente mortos", registros zumbi, falsos alertas — a tabela `worker_heartbeats` mentia sobre
   o SO e o próprio worker tinha `limparZumbis()`. *Causa:* estado do processo materializado em
   banco. *Correção:* PID file + `posix_kill`/`tasklist` + heartbeat em **arquivo** (mtime), sem
   tocar banco; o endpoint responde em < 50 ms.
2. **[2026-08-19 · Caronte PRD-009] 202 não é sucesso; 401 não é queda.** *Sintoma:* o vigia
   "curava" reiniciando um worker saudável ou dava por resolvido um restart só agendado. *Causa:*
   códigos HTTP lidos ao contrário. *Correção:* cura provada por **PID diferente** na recheca;
   401 = **nosso** token errado, nunca `down` (`WatchdogService::consultarSaude()`).
3. **[2026-08 · Caronte PRD-008] "Nunca recebeu" tratado como "mudo".** *Sintoma:* receptor
   acendia "mudo" com a ingestão comprovadamente saudável (só o selftest do doctor pingava).
   *Causa:* ausência de dado inferida como falha; selftest não contava como sinal. *Correção:*
   três estados exclusivos (nunca / mudo / saudável), cada um com a sua condição explícita; sinal de
   teste alimenta o indicador; recusas em massa viram `degradado`, não "saudável".
4. **[2026-09-01 · Caronte PRD-011] Número que muda de base sem avisar.** *Sintoma:* `pings_24h`
   saltou 4–6× no dia em que os agentes passaram a pingar; quem olhou o health "abriu incidente à
   toa". *Correção:* cada número declara **o que conta** (`valor` com nomes explícitos) e a mudança
   de base entra no contrato do dia; três números vizinhos com bases diferentes ficam documentados.
5. **[2026-08 · Caronte PRD-008] Rota pública que expõe nome interno.** *Sintoma:* contadores por
   dev/projeto iam para o `/v1/health` público. *Correção:* público = agregado **sem nomes**;
   detalhe só na rota autenticada. Vale para `/health` (nada) × `/health/painel` (token).
6. **[2026-08 · Taurus PRD-072, achado beholder A2] Endpoint de saúde com `?config=` livre.**
   *Sintoma:* nova superfície de vazamento de segredo. *Correção:* whitelist **fixa no servidor**
   (`_mapaSegredosPort()`), máscara `••••1234`, admin/token; CLI `diagnostico_port.php` usa o
   mesmo mapa e nunca imprime valor.
7. **[lido no código, sem incidente registrado · Palantír `api/health.php`] Recurso não crítico
   derrubando o liveness.** `disk_free_space()` que **não consegue ler** vira `ERRO` e 503 — um
   monitor externo trataria "não sei o disco" como "fora do ar". *Regra:* no `/health` só o banco
   decide; no painel, recurso ilegível é `nao_verificado` e só `critico` em `falha` dá 503.
8. **[2026-08 · Sagittarius PRD-097] Check de saúde com efeito colateral.** O tick de lote
   consulta a sessão WAHA 1× por tick e **pausa o lote** quando ela não está `WORKING` (lista
   invertida, fail-safe). *Regra:* isso é lógica do módulo, certa; o **painel só lê** — o check
   `waha` do painel informa `sessao`, nunca pausa nem reinicia nada.
9. **[Palantír `ServiceHealthChecker::tentarAlerta`] Alertar pelo canal que está doente.**
   *Sintoma:* "serviço offline mas WAHA também offline — não pode alertar" (o log é o único
   rastro). *Correção:* alerta só na **transição** de estado, com debounce (60 min no Palantír,
   6 h no Caronte) e **canal alternativo** (e-mail via Beholder) quando o WAHA é o doente.
10. **[Caronte `WatchdogService`] Vigia no mesmo host do vigiado.** "Um watchdog que morre junto
    com o vigiado não serve" — por isso o monitor vive no Caronte (outro host, com scheduler).
    *Regra:* o software expõe; **quem vigia é o Caronte**. Alerta local é complemento, não o vigia.
11. **[Caronte `HealthController`] Catch de PDO fora do health.** A única rota onde a exceção de
    conexão é capturada localmente é o health (precisa responder 503 com `db:false`); replicar o
    catch em outra rota esconde erro real atrás de 200. *Regra:* nas demais rotas a exceção sobe
    ao handler global.
12. **[Palantír `status_servicos.php`] Check caro no caminho rápido.** Três serviços × 5 s =
    `set_time_limit(20)`; Anthropic só com `?incluir_anthropic=1`. *Regra:* `/health` em ms;
    caro só com `?profundo=1` — senão lentidão vira "queda" no monitor.
13. **[Palantír PRD-074 / DT-082] Hora do banco no lugar da hora de negócio.** `NOW()` do MySQL
    e `TIMESTAMPDIFF` com coluna UNSIGNED distorceram "há quanto tempo". *Regra:* `verificado_em`
    e `minutos_desde` calculados no PHP com a timezone declarada do software; `CAST(... AS SIGNED)`
    antes de subtrair.

## Checklist de aceite

- [ ] `GET /health` sem token: 200 `{status:'up', db:true, versao, ts}` em < 500 ms; banco fora ⇒ 503 `db:false`; nada além disso no corpo.
- [ ] `GET /health/painel` sem token ⇒ 401; com token ⇒ 200 e `duracao_ms` < 5000 sem `?profundo`.
- [ ] Nenhum segredo, stack trace ou nome de outro cliente no corpo (teste faz grep dos valores reais das configs).
- [ ] `software.codigo` = slug do software no Caronte; `modulos[].codigo` = códigos do cadastro; todo módulo do Perfil aparece.
- [ ] Um check que lança exceção sai `falha` com detalhe genérico e o endpoint continua 200/503 conforme `critico` — nunca 500.
- [ ] Recurso ilegível ⇒ `nao_verificado`; recurso não crítico em `falha` ⇒ `degradado` geral, não 503.
- [ ] `scheduler.atrasado` fica `true` quando o tick para (teste manipula `cron_last_tick`/`last_executed_at`).
- [ ] Worker (se houver): PID + heartbeat em arquivo; `razao` correta em cada caso de queda.
- [ ] Integrações: `configurado|fallback|faltando` mapeados; máscara; ping real só com `?profundo=1`.
- [ ] `Cache-Control: no-store` nos dois endpoints; `?token=` nunca aparece em log de acesso mascarável.
- [ ] Pipeline de deploy faz smoke `GET /health` = 200; token provisionado por instalação e documentado no DEPLOY.
- [ ] Perfil: convenção `adotada`, códigos de módulo e timezone declarados; tela admin (se existir) consome o painel.

## Variações por stack

- **PHP vanilla (Taurus core e clones, Sagittarius/SAMA, 3S, Palantír):** arquivos
  `api/health.php` e `api/health/painel.php` (URLs fixas relativas à base da API — o Caronte
  guarda a base e completa `health` / `health/painel`); registro em `api/health/checks.php`;
  executor em `api/health/executor.php`. O Palantír já tem `health.php` no formato antigo
  (`status: OK|WARN|ERRO`, checks como objeto): o port **acrescenta** o envelope novo sem quebrar
  quem lê o antigo por um ciclo, depois remove. No Taurus a `saude_integracoes` vira o grupo
  `integracoes` do painel e a tela passa a consumi-lo.
- **Laravel (Beholder, aec-backend, ticket Grupo Porto):** `Route::group(['prefix' => 'health'])`
  como o Beholder já faz; token em `config/health.php` ← `.env`; checks em `app/Health/`; worker
  com PID/heartbeat em `storage/app/worker/` (molde `ServicoHealthWorker`). O `GET /health/worker`
  atual do Beholder permanece (o watchdog do Caronte o consome) e passa a **também** aparecer em
  `workers[]` do painel.
- **Node/TypeScript (OpenGate, meuanuncio-api):** mesmas rotas e mesmo JSON em Express/Fastify;
  worker via `process.pid` + heartbeat em arquivo. Sem implementação de referência ainda —
  incógnita declarada; o primeiro port registra aqui o que mudou.
- **Caronte (consumidor e também produtor):** produtor já quase conforme (`/v1/health`); o painel
  próprio entra junto com a PRD do consumidor ("F5 — Saúde dos softwares"), reaproveitando
  `CronService`, `WatchdogService` (alerta, debounce, canal) e `auditoria`.
