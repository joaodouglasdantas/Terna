---
slug: licenca-caronte
nome: "Validação de licença no Caronte (software consumidor)"
categoria: integracao
resumo: "Como o software licenciado da Beta (Taurus e clones, SAMA, 3S, avulsos) consulta o status da própria licença no Caronte — fail-open irrestrito, cache de 24 h, assinatura Ed25519 pinada e módulos por código — via o cliente de referência CaronteLicenca.php."
maturidade: experimental
aplica_se: [php]
depende_de: []
desde: 3.5.0
referencias:
  - projeto: caronte
    caminhos: ["clientes/php/CaronteLicenca.php", "clientes/php/MANIFESTO.json", "clientes/php/README.md", "API_CONTRACT.md", "api/tools/gerar-chave-assinatura.php", "api/src/Controller/LicencaStatusController.php", "api/src/Core/AssinaturaLicenca.php", "tests/e2e/PRD-010-failopen.spec.js", "tests/e2e/PRD-010-cliente-guard.spec.js", "tests/e2e/fixtures/caronte-stub/", "docs/DEPLOY.md", "prds/PRD-010-consumidores-assinatura-adocao/"]
---

# `licenca-caronte` — validação de licença no Caronte

> **Maturidade `experimental` de propósito.** O lado servidor (endpoint `GET /api/v1/licencas/status`,
> assinatura, tela de adoção) está em produção no Caronte desde a PRD-010 (04/09/2026) com 20 cenários
> hostis provados contra stub. O lado **consumidor** — o que esta convenção descreve — ainda não foi
> portado a nenhum software da casa (11/09/2026: a tela de adoção do Caronte mostra `nunca` para o parque
> inteiro). O primeiro port (alvo: Taurus core) promove a convenção a `estavel` e alimenta as armadilhas
> locais que hoje só existem no lado servidor.

## Por que existe

O Caronte é o sistema interno da Beta que controla **licenças, contratos e faturas** dos clientes ("o
barqueiro que só atravessa quem paga"). Sem o software do cliente consultar a própria licença, bloqueio
por inadimplência, carência e liberação de módulo são intervenção manual no servidor de cada cliente —
lenta, sem trilha e fácil de esquecer. A fase F4 do plano de licenças (PRD-010 do Caronte, entrevista do
Charles em 03/09/2026) fechou o **contrato estável** do endpoint e entregou um **cliente de referência**
(`clientes/php/CaronteLicenca.php`, arquivo único, PHP 7.4, zero dependências) para ser copiado para cada
consumidor. Esta convenção é o passo a passo desse port e as regras que não podem ser "consertadas" no
caminho — a mais cara delas: **fail-open é lei**.

## Quando aplicar — e quando NÃO

- **Aplique quando:** o software é licenciado a um cliente final com contrato/licença cadastrados no
  Caronte — Taurus core (e daí para os clones via `/propagar`), Sagittarius/SAMA, 3S, sistemas avulsos.
- **Não aplique quando:** sistema interno da Beta (Caronte, Beholder, Palantír interno, vault), site
  institucional/político sem licença recorrente, app mobile ou front (a **decisão é do backend**: o app
  consome o backend que já decidiu — nunca coloque `api_key` no cliente). Nesses casos não há nada a
  fazer: marque `nao-se-aplica` no Perfil.
- **Não confunda com a presença do harness:** o hook `presence.mjs` fala com `/api/v1/presenca/ping`
  (telemetria de dev, token próprio). Licença é do **software do cliente em produção**, com `X-Api-Key`
  da licença. URLs, tokens e cache de um nunca servem ao outro.

## Pré-requisitos no projeto

| Pré-requisito | Por quê |
|---------------|---------|
| PHP ≥ 7.4 com `curl` e `json`; `ext-sodium` **opcional** | O cliente é single-file 7.4. Sem sodium ele **não verifica** a assinatura e continua operando (`verificada=false`, anuncia `verifica=0`) — nunca deixa de funcionar por falta de extensão. |
| Um lugar de configuração **por instalação** (não no código, não no git) | Três valores: `base_url`, `api_key` (`car_<48 hex>`, uma por licença/instalação), `chave_publica` (base64, 32 bytes). No Taurus/Sagittarius é a tabela `configuracoes` (`config`/`dado_config`, como `jwt_secret`); no Laravel é `.env`/`config/`. |
| Diretório gravável pelo processo PHP, **fora do docroot** | `cache_path`: um JSON por instalação, escrito atomicamente (tmp + `rename`). Nunca compartilhado entre licenças. |
| Licença cadastrada no Caronte | Contrato + licença (1:1) → `api_key` emitida no `POST /contratos`; módulos liberados por **código** (slug imutável) no cadastro do software. Sem isso o endpoint responde 401 e o consumidor opera em fail-open para sempre — e a tela de adoção mostra `nunca`. |
| Chave pública **de produção** pinada pelo integrador | A do `MANIFESTO.json` em 11/09/2026 ainda é **fixture de teste**; o par de produção nasce no go-live (`docs/DEPLOY.md` do Caronte, "Go-live da assinatura de licença"). Sem a chave certa o cliente só não verifica — não quebra. |
| Um ponto de execução ~1×/dia | `consultar()` no boot da aplicação (o throttle interno já segura a rede) ou no cron da casa (convenção `cron-smart`, se adotada). |

## Modelo de dados

**Não há tabela nova no consumidor.** O veredito vive no arquivo de cache do cliente de referência; a
configuração vive onde o projeto já guarda segredos. Idempotente e não destrutivo:

```sql
-- PHP vanilla (Taurus/Sagittarius/3S): tabela `configuracoes` já existente (config/dado_config).
-- `configuracoes.config` NÃO tem UNIQUE no Taurus (armadilha 71 do Perfil): a migration semeia com
-- WHERE NOT EXISTS. NUNCA gravar a api_key real na migration — só a chave vazia.
INSERT INTO configuracoes (config, dado_config)
SELECT 'caronte_base_url', 'https://caronte.app.br/api/v1/' WHERE NOT EXISTS (SELECT 1 FROM configuracoes WHERE config = 'caronte_base_url');
INSERT INTO configuracoes (config, dado_config)
SELECT 'caronte_api_key', '' WHERE NOT EXISTS (SELECT 1 FROM configuracoes WHERE config = 'caronte_api_key');
INSERT INTO configuracoes (config, dado_config)
SELECT 'caronte_chave_publica', '' WHERE NOT EXISTS (SELECT 1 FROM configuracoes WHERE config = 'caronte_chave_publica');
```

- `caronte_api_key` e `caronte_chave_publica` são **segredos de instalação**: preenchidos no deploy de
  cada cliente (nunca no dump que viaja para outro clone — a mesma regra do `jwt_secret` que o
  `dr-tarcisio-lucena-pdf` ensinou: nunca transferir a tabela `configuracoes` inteira).
- `cache_path`: `<storage gravável>/caronte-licenca.json` (Taurus: fora de `administrativo/`; Laravel:
  `storage/app/`). Entra no `.gitignore`. Conteúdo: `{veredito: {status, modulos, mensagem, obtido_em},
  etag, ultima_tentativa_rede}` — **só o último veredito VERIFICADO**.
- Nada de coluna "status da licença" no banco. Telas administrativas leem o cache via
  `consultar()`/getters; duplicar o estado em tabela cria a segunda fonte de verdade que a F4 evitou.

## Contratos

### O endpoint (lado Caronte — CONTRATO ESTÁVEL, evolução só aditiva)

`GET /api/v1/licencas/status` com header `X-Api-Key: car_…` (classe própria de autenticação; rate limit
60 req/min por licença; `Bearer` não serve aqui).

```json
{ "ok": true, "data": { "status": "ativa", "vence_em": "2026-08-05", "dias_em_atraso": 0,
  "mensagem": null, "modulos": ["agenda_avancada", "relatorios_bi"], "cache_ttl_recomendado": 86400 }, "error": null }
```

- `status` ∈ `ativa | carencia | bloqueada | suspensa` (precedência `suspensa > bloqueada > carencia > ativa`,
  derivado ao vivo; estado desconhecido é "estado do futuro" — fail-open).
- `modulos[]` são **códigos** (slug), nunca ids. `mensagem` é texto livre para o cliente final.
- `ETag` + `Cache-Control: private, max-age=21600`; `If-None-Match` igual ⇒ **304 sem corpo** (e ainda conta
  como consulta na telemetria de adoção).
- **Resposta assinada (aditivo, PRD-010):** `X-Caronte-Signature: keyid=<id>,alg=ed25519,created=<epoch>,v1=<base64url>`
  no 200 **e** no 304; ausente quando o servidor não tem par provisionado (nunca 5xx). String canônica de 5 linhas
  (`caronte-status-v1` | keyid | created | `licenca_ref` | sha256 do corpo cru; no 304 a 5ª linha é o `ETag`
  **com aspas**). **`licenca_ref = sha256(api_key)` é computado pelo consumidor** — o servidor nunca o transmite
  (é o que fecha o replay cruzado entre licenças).
- Header de requisição opcional `X-Caronte-Client: caronte-php/<versao>; sha256=<hash do arquivo>; verifica=<0|1>` —
  o cliente de referência envia sozinho; alimenta `GET /api/v1/licencas/adocao` (quem integrou de verdade,
  quem cacheia, quem verifica, quem roda cópia `antiga`/`divergente`).
- Erros: 401 key ausente/inválida/regenerada; 429 com `Retry-After`. **Para o consumidor, todo erro = endpoint
  indisponível = fail-open.**

### O cliente de referência (lado consumidor — API pública fechada)

```php
require_once __DIR__ . '/vendor-beta/CaronteLicenca.php';   // arquivo copiado INTEIRO, sem editar
$c = new CaronteLicenca([
    'base_url'      => $cfg['caronte_base_url'],
    'api_key'       => $cfg['caronte_api_key'],
    'cache_path'    => STORAGE . '/caronte-licenca.json',
    'chave_publica' => $cfg['caronte_chave_publica'],   // ausente => opera sem verificar (verifica=0)
]);
$r = $c->consultar();      // toca a rede no máximo 1×/dia; NUNCA lança; atualiza o cache
                           // ['status','modulos','mensagem','origem'=>'rede|cache|nenhum','verificada'=>bool,
                           //  'motivo'=>null|'rede'|'http'|'json'|'assinatura'|'expirada'|'outra_licenca']
$c->bloqueado();           // bool — a ÚNICA função que decide; nunca toca rede
$c->moduloLiberado('x');   // bool — true quando não há veredito utilizável (sem dado não se tira feature)
```

**Tabela de decisão `status → bloqueado()` (fechada e exaustiva — não é adjetivo do executor):**

| `status` verificado e válido | `bloqueado()` |
|---|---|
| `ativa` | `false` |
| **`carencia`** | **`false`** — existe justamente para NÃO bloquear |
| `bloqueada` | `true` |
| `suspensa` | `true` |
| outro valor / ausente / não verificado / expirado (> 48 h) / rede fora | `false` (fail-open) |

**Máquina do cache (o que vale entre consultas):** guarda só o último veredito **verificado**; tolerância
de frescor = 2 × `cache_ttl_recomendado` = **48 h** (fixa no cliente); **304 verificado renova** a validade;
resposta que não verifica **nunca substitui** o veredito bom anterior nem cria veredito novo.

### O que é função pura e o que é do canal

- **Pura (reusável por qualquer canal):** `bloqueado()`, `moduloLiberado()` — leem o cache, decidem.
- **Do canal (o projeto escreve):** o gate de sessão que chama `bloqueado()`, a tela de bloqueio, o banner de
  carência, o mapeamento `modulos[]` → features, a tela administrativa "Licença". Nada disso entra no arquivo
  do cliente de referência.

## Passo a passo do port

Cada item vira uma task da PRD (`/convencao portar licenca-caronte` monta a PRD com este roteiro).

1. **Copiar o cliente** — `clientes/php/CaronteLicenca.php` do repo do Caronte para uma pasta de terceiros do
   projeto (ex.: `administrativo/api/dependencias/CaronteLicenca.php`), **byte a byte**. Conferir:
   `php -r "echo hash('sha256', file_get_contents('CaronteLicenca.php'));"` = hash da `versao_corrente` no
   `MANIFESTO.json`. Não editar nunca (ver armadilha 7).
2. **Configuração** — migration idempotente semeando as 3 chaves vazias (SQL acima); leitura por um helper
   único (`caronteConfig()`), nunca `SELECT` espalhado. `api_key` mascarada em qualquer log (`car_…` + 4 últimos).
3. **Cache** — `cache_path` fora do docroot, no `.gitignore`, diretório criado no deploy com permissão do
   processo PHP; um por instalação.
4. **Ponto de consulta (1×/dia)** — `consultar()` no boot da API (custo: leitura de um JSON; a rede só
   1×/dia) **ou** job do cron da casa. Nunca no meio de um request de usuário que já é lento; nunca em loop
   "para garantir".
5. **Ponto de decisão ÚNICO (backend)** — no gate de sessão/login e no middleware de autorização:
   `bloqueado()` ⇒ resposta 402/403 padronizada `{ok:false, error:{code:'licenca_bloqueada', mensagem}}` e
   tela de bloqueio com a `mensagem` do Caronte + contato da Beta. `status = carencia` ⇒ **não bloqueia**;
   banner não intrusivo com `mensagem`, `vence_em`, `dias_em_atraso` (dados do cache).
6. **Módulos** — tabela de mapeamento `codigo Caronte → feature/rota do projeto` num único arquivo;
   `moduloLiberado('codigo')` no **endpoint** da feature (o front só esconde o menu — nunca decide). Os códigos
   são contrato com o cadastro do software no Caronte: registrar no Perfil.
7. **Tela/endpoint administrativo "Licença"** — status, `vence_em`, `origem`, `verificada`/`motivo`, última
   consulta, versão do cliente e `verifica` — tudo do cache, sem tocar rede. É por aqui que o suporte entende
   "por que bloqueou / por que não bloqueou".
8. **Testes E2E com stub** — copiar o padrão de `tests/e2e/fixtures/caronte-stub/` do Caronte (servidor HTTP
   descartável que responde os cenários) e cobrir no mínimo: feliz `ativa`; `suspensa` verificada bloqueia;
   `carencia` não bloqueia; rede fora não bloqueia; sem `chave_publica` não bloqueia e anuncia `verifica=0`;
   `suspensa` + rede fora na chamada seguinte continua bloqueado (cache); cache > 48 h + rede fora volta a
   liberar. Os 20 casos completos estão em `PRD-010-failopen.spec.js` — não reinvente, adapte.
9. **Perfil e manual** — registrar a adoção (`adotada`), os códigos de módulo e as armadilhas locais no
   `PERFIL-PROJETO.md`; 1 linha em `docs/manual/_fila.md` para a tela de bloqueio/banner entrar no manual vivo.
10. **Go-live por cliente** — cadastrar contrato + licença no Caronte (gera `api_key`); gravar `api_key` e a
    chave pública **de produção** na instalação; confirmar em `GET /licencas/adocao`: `estado=consultando`,
    `cacheia=true`, `verifica=true`, `versao_estado=atual`. `nunca` depois de 24 h = a instalação não está
    consultando (config errada, cache sem permissão, boot que não chama `consultar()`).

## Armadilhas

1. **[2026-09-03 · PRD-010, discovery] Tolerância anti-replay menor que o TTL do cache.** *Sintoma:* toda
   resposta servida do cache local "falha a verificação". *Causa:* o consumidor cacheia por até
   `cache_ttl_recomendado` (24 h) e a assinatura prova **origem, não frescor**; tolerância de 1 h rejeita a
   própria resposta legítima. *Correção:* tolerância = 2 × TTL (48 h), fixa no cliente. Não "aperte".
2. **[2026-09-03 · pré-gate da PRD-010] Chave pública como constante dentro do arquivo do cliente.** *Sintoma:*
   o parque inteiro aparece `divergente` na tela de adoção. *Causa:* o par de produção nasce no go-live; o
   arquivo versionado pinaria a chave de teste e a cópia do Taurus outra — dois hashes, o manifesto conhece
   um. *Correção:* a chave é **pinada pelo integrador na configuração**; o arquivo é idêntico em repo, teste
   e produção. Integrador que esquece só não verifica (`verifica=0` visível na adoção) — não quebra.
3. **[2026-09-04 · sherlock na exec da PRD-010] "Não verificou" tratado como adulteração/bloqueio.** *Sintoma:*
   cliente em dia bloqueado após deploy sem `ext-sodium`. *Causa:* `verificada=false` (sem chave, sem
   extensão, header ausente) é **ausência de sinal**, nunca evidência. *Correção:* só veredito **verificado**
   com `status ∈ {bloqueada, suspensa}` bloqueia — tudo o mais é `false`.
4. **[2026-09-02/03 · red-team D-01/D-02 da PRD-010] "Vamos fazer fail-close, é mais seguro".** *Sintoma:*
   queda de rede/DNS/5xx derruba o ERP de um cliente que pagou. *Causa:* contra o adversário real (quem edita
   o próprio fonte) o fail-open dá o mesmo resultado que forjar a resposta — fail-close só troca um risco
   inexistente por um que acontece todo dia. *Correção:* fail-open irrestrito; a F4 encarece a fraude
   tornando-a um ato **deliberado e auditável** (adoção mostra quem parou de consultar / roda cópia editada).
5. **[2026-09-04 · caso 20 do `PRD-010-failopen.spec.js`] `carencia` bloqueando.** *Sintoma:* cliente em
   atraso tolerado pelo Caronte fica sem sistema. *Causa:* "status desfavorável" interpretado por adjetivo.
   *Correção:* a tabela de decisão é fechada — `carencia ⇒ false`. É a linha mais fácil de errar; tem teste.
6. **[2026-09-03 · PRD-010, decisão "o ETag não muda"] Consumidor que recalcula ETag próprio ou inclui
   `created` no cache.** *Sintoma:* o 304 nunca acontece; toda consulta baixa corpo. *Causa:* `created`/`keyid`
   vivem só em header e **não** entram no ETag de propósito. *Correção:* guardar o `ETag` recebido cru e
   mandar `If-None-Match` com ele — o cliente de referência já faz.
7. **Editar o `CaronteLicenca.php` no consumidor ("só um log a mais").** *Sintoma:* instalação classificada
   `divergente` na adoção (hash anunciado ≠ manifesto) — o único estado âmbar acionável da tela vira ruído.
   *Correção:* nunca editar; melhoria = PRD no Caronte + bump (`README.md` → "Bump de versão": arquivo →
   sha256 → `MANIFESTO.json` → `VERSAO`). Logs/adaptações ficam **fora** do arquivo, no código do projeto.
8. **[PRD-010-b, ainda não executada em 11/09/2026] Regenerar a key mata a antiga no ato.** *Sintoma:* após
   `POST /licencas/{id}/regenerar-key`, o consumidor recebe 401 e cai em fail-open "endpoint indisponível"
   até alguém trocar a config. *Causa:* a janela de duas chaves válidas (010-b: expira por **uso observado**
   da nova, não por relógio) é uma fatia pendente. *Correção hoje:* rotação planejada = combinar com o
   cliente e trocar a config no mesmo dia; revogação de emergência = aceitar o fail-open até a troca.
9. **`cache_path` compartilhado entre instalações** (clones do Taurus no mesmo servidor, `/tmp` comum).
   *Sintoma:* o veredito do cliente A decide o bloqueio do cliente B. *Correção:* um caminho por instalação,
   dentro do storage da própria instalação.
10. **`consultar()` a cada request.** *Sintoma:* IO de leitura/gravação do cache em todo request; sob
    concorrência, `rename` disputado. *Causa:* o throttle segura a rede, não o cache. *Correção:*
    `consultar()` no boot/cron; `bloqueado()`/`moduloLiberado()` por request (só leem).
11. **Presença ≠ licença.** *Sintoma:* "vamos reaproveitar o token da presença / a URL do harness".
    *Causa:* são superfícies diferentes do Caronte (`/presenca/ping` com token de dev; `/licencas/status` com
    `X-Api-Key` da licença). *Correção:* configurações separadas; a presença vive no harness, a licença no
    software do cliente.
12. **Timeout envolvente maior que o do cliente.** *Sintoma:* boot "trava 30 s" quando o Caronte está fora.
    *Causa:* o cliente já limita 5 s de conexão / 10 s total; envolvê-lo num timeout maior ou chamá-lo dentro
    de um request síncrono expõe o usuário a esse tempo. *Correção:* chamar no boot assíncrono/cron; nunca no
    caminho crítico de uma tela.

## Checklist de aceite

- [ ] `sha256` do `CaronteLicenca.php` copiado = hash da `versao_corrente` do `MANIFESTO.json` do Caronte (guard test no projeto).
- [ ] As 3 configs existem, vazias no dump, preenchidas só no deploy da instalação; `api_key` nunca aparece inteira em log.
- [ ] `cache_path` fora do docroot, gitignored, gravável; um por instalação.
- [ ] `consultar()` roda no boot ou cron (1×/dia) — provado com a telemetria de adoção do Caronte (`consultas_periodo ≥ 1`, `cacheia=true`).
- [ ] Um único ponto de decisão no backend; `bloqueado()==true` ⇒ resposta padronizada + tela de bloqueio com a `mensagem`.
- [ ] `carencia` ⇒ acesso liberado + banner. Provado por spec.
- [ ] Rede fora / 5xx / JSON inválido / sem chave pública / sem sodium ⇒ acesso liberado. Provado por spec (stub).
- [ ] `suspensa` verificada + rede fora ⇒ continua bloqueado; cache > 48 h + rede fora ⇒ libera. Provado por spec.
- [ ] Módulos: `moduloLiberado()` no endpoint (não só no menu); códigos registrados no Perfil e iguais ao cadastro do software no Caronte.
- [ ] Tela administrativa "Licença" mostra status/origem/verificada/última consulta sem tocar rede.
- [ ] Adoção no Caronte após 24 h: `consultando`, `verifica=true` (chave de produção), `versao_estado=atual`.
- [ ] Perfil: convenção `adotada`, armadilhas locais registradas; manual vivo com a tela de bloqueio.

## Variações por stack

- **PHP vanilla (Taurus core e clones, Sagittarius/SAMA, 3S):** config em `configuracoes`
  (`config`/`dado_config`, sem UNIQUE — semear com `WHERE NOT EXISTS`); cliente em `administrativo/api/dependencias/`;
  gate no helper de sessão da API; cache no storage da instalação. Nos **clones do Taurus** o port entra pelo
  core e viaja no `/propagar` — a `api_key` de cada clone é provisionada por cliente no deploy (nunca no core,
  nunca no dump). É a única stack onde a implementação existe (o cliente de referência é PHP).
- **Laravel (aec-backend, ticket Grupo Porto):** cliente em `app/Support/`, config em `config/caronte.php` lendo
  `.env`, cache em `storage/app/caronte-licenca.json`, middleware `LicencaAtiva` nas rotas autenticadas. Ainda
  não rodou em nenhum projeto — o primeiro port Laravel registra aqui o que mudou.
- **Node/TypeScript (opengate, meuanuncio-api):** **não há cliente de referência** — portar exige uma PRD no
  Caronte que publique `clientes/node/` com o mesmo contrato (fail-open, cache, verificação Ed25519 via
  `crypto.verify`, manifesto com hash). Incógnita declarada; até lá, `nao-se-aplica`.
- **Front web / mobile:** nunca. A decisão é do backend; o app só exibe o que o backend respondeu.
