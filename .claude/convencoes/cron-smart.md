---
slug: cron-smart
nome: "Smart Scheduler — cron burro, banco inteligente"
categoria: infra
resumo: "Uma única linha de crontab no servidor: as rotinas temporais são cadastradas em tabela e um dispatcher decide o que roda a cada tick."
maturidade: estavel
aplica_se: [php]
depende_de: []
desde: 2.16.1
referencias:
  - projeto: caronte
    caminhos:
      - "api/cron/scheduler.php"
      - "api/cron/jobs.php"
      - "api/src/Service/CronService.php"
      - "api/src/Core/CronLock.php"
      - "api/database/migrations/0005_cron_config.php"
      - "api/src/Controller/CronController.php"
  - projeto: palantir-app
    caminhos:
      - "api/dependencias/CronScheduler.php"
      - "api/dependencias/CronLock.php"
      - "api/database/migrations/0019_criar_tabela_cron_config.php"
      - "api/database/migrations/0038_add_cron_failure_tracking.php"
      - "api/cron/monitorar_comentarios.php"
      - "prds/PRD-019-agendamento-crons/"
  - projeto: dra-mariana-duarte
    caminhos:
      - "administrativo/api/manutencao/scheduler.php"
      - "administrativo/api/dependencias/CronScheduler.php"
      - "administrativo/api/dependencias/CronLock.php"
      - "administrativo/api/database/migrations/0051_cron_config.php"
      - "administrativo/api/cron_config/listar.php"
      - "administrativo/api/cron_config/alterar.php"
---

# `cron-smart` — convenção da casa

## Por que existe

Toda rotina temporal nova acabava virando uma linha nova no crontab do servidor. O custo disso
não é a linha: é que **o agendamento passa a morar fora do sistema**. Mudar o horário de uma
rotina exige SSH (ou o painel da Cloudways); ninguém enxerga se a rotina rodou; e o dev que
entregou a feature depende de alguém lembrar de cadastrar a linha em produção.

Foi exatamente isso que aconteceu no Palantir: o cron `monitorar_comentarios` foi entregue pela
PRD-042, testado, aprovado — e **nunca rodou em produção**, porque a linha nunca foi cadastrada
no painel da Cloudways. O incidente está registrado no `DT-036`. Ninguém percebeu por semanas,
porque um cron que não existe não gera erro: gera silêncio.

A convenção move a decisão de **quando** para o banco e deixa no servidor uma única linha burra,
que roda a cada 2 minutos e pergunta ao banco o que fazer. Rotina nova passa a ser um `INSERT` +
código — nunca um pedido de acesso ao servidor.

## Quando aplicar — e quando NÃO

- **Aplique quando:** o projeto tem (ou vai ter) rotina que roda por tempo — faturamento diário,
  coleta periódica, limpeza semanal, varredura de estado.
- **Não aplique quando:**
  - **Não é temporal.** Ação disparada por evento do usuário (envio de e-mail ao salvar,
    processamento de upload) é fila ou chamada direta, não cron. Cron aqui só atrasa.
  - **Precisa de latência sub-minuto.** O tick é de 2 minutos e a granularidade da tabela é o
    minuto — o pior caso de espera é o tick inteiro. Para reação imediata, use fila com worker
    residente.
  - **O projeto é Laravel e já usa o `schedule:run` nativo.** O scheduler do framework já entrega
    a linha única de crontab, que é o ganho principal. Não porte por cima: mantenha o
    `schedule:run` e, se quiser o controle por banco, leia a definição da tabela de dentro do
    `Kernel`. Trocar um scheduler que funciona por outro é retrabalho sem ganho.

## Pré-requisitos no projeto

| Pré-requisito | Por quê |
|---------------|---------|
| Runner de migrations com numeração ordenável | a tabela `cron_config` e os seeds de rotina entram por migration, não por SQL manual |
| Acesso CLI ao PHP no servidor (caminho do binário conhecido) | o dispatcher roda por CLI; sem saber o caminho do binário, o disparo falha em silêncio (ver Armadilhas) |
| Logger com nível (INFO/WARN/ERROR) gravando em arquivo | o tick é a cada 2 min: sem log com nível, ou você não enxerga nada ou o disco enche |
| Tabela de auditoria (opcional, recomendado) | registrar apenas execuções **com efeito** dá a trilha sem poluir |
| Tela de administração com perfil admin (pode vir depois) | é o que devolve o controle operacional a quem não tem SSH — mas o port funciona sem ela |

## Modelo de dados

Uma tabela só. O DDL abaixo é o do Caronte (`0005_cron_config.php`), que já é a terceira
iteração do schema — o do Palantir (`0019`) é o mesmo sem `monthly`, sem
`consecutive_failures` e sem `last_alert_sent_at`, que foram adicionados depois pela `0038`.
**Comece pelo schema completo**: as três colunas custam nada agora e são migration nova depois.

```sql
CREATE TABLE IF NOT EXISTS cron_config (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  script_name VARCHAR(100) NOT NULL,        -- slug do job; par no registro do código
  display_name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  schedule_type ENUM('interval','daily','weekly','monthly') NOT NULL DEFAULT 'interval',
  interval_minutes INT UNSIGNED NULL DEFAULT NULL,
  run_at_hour TINYINT UNSIGNED NULL DEFAULT NULL,
  run_at_minute TINYINT UNSIGNED NULL DEFAULT 0,
  run_on_day TINYINT UNSIGNED NULL DEFAULT NULL,  -- weekly: 0-6 (dom=0) | monthly: 1-31
  last_executed_at DATETIME NULL DEFAULT NULL,    -- gravado em PHP, no fuso da aplicação
  last_duration_seconds DECIMAL(10,2) NULL DEFAULT NULL,
  last_status ENUM('success','error','running') NULL DEFAULT NULL,
  last_error_message TEXT NULL,
  consecutive_failures INT NOT NULL DEFAULT 0,
  last_alert_sent_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cron_config_script (script_name),
  KEY idx_cron_config_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
```

Decisões não óbvias:

- **`script_name` é chave lógica, nunca caminho de arquivo.** Ele indexa um mapa no código. Não
  concatene em `require` nem em shell — o banco é editável pela tela, e um `script_name` virando
  caminho é execução arbitrária a um `UPDATE` de distância. (O Taurus faz o contrário, com
  sanitização `[^a-z_]` como defesa; funciona, mas depende de a sanitização nunca afrouxar — ver
  *Variações*.)
- **`UNIQUE` em `script_name`** é o que torna todo seed idempotente (`INSERT IGNORE` /
  `ON DUPLICATE KEY UPDATE`).
- **Não existe coluna `proxima_execucao`.** O próximo horário é derivado de `last_executed_at` no
  momento da checagem. Coluna de "próxima" é estado duplicado que sai de sincronia toda vez que
  alguém edita o agendamento.
- **`last_executed_at` é gravado na LARGADA**, junto com `last_status='running'`, não no fim. É
  intencional: o timestamp é o relógio do agendador, e gravá-lo no fim faria uma rotina lenta
  disparar de novo antes de terminar. A consequência (rotina longa parece "não devida") é tratada
  pelo lock, não pelo timestamp — ver Armadilhas.
- **`last_error_message` é truncado** em ~5000 chars na escrita. Stack trace inteiro de erro
  recorrente incha a tabela que a tela lê a cada 30s.
- **O seed é migration, não SQL manual** — e **rotina com efeito externo nasce
  `is_enabled = 0`.** No Caronte os jobs de cobrança nascem desligados com a justificativa
  escrita na migration: a primeira execução em produção cobraria o estoque inteiro de
  inadimplentes de uma vez. Ligar é ato consciente.
- **`down()` remove apenas as próprias linhas** (`DELETE ... WHERE script_name IN (...)`), nunca
  dá `DROP` na tabela quando a migration só semeou.

Heartbeat fica **fora** desta tabela: uma chave `cron_last_tick` na tabela de configurações
genérica, escrita a cada tick. É o dead man's switch — sem ela, "nenhuma rotina rodou hoje" e
"o cron está morto" são indistinguíveis.

## Contratos

### Servidor — uma linha, e só

```
*/2 * * * * /usr/bin/php7.4 ~/public_html/api/cron/scheduler.php >> ~/public_html/storage/logs/cron.log 2>&1
```

Registre-a onde o servidor de fato lê. Em Cloudways é o painel "Cron Job Management" — o arquivo
`deploy/crontab.txt` do repositório é **referência para humanos, o servidor não o lê** (ver
Armadilhas).

### Ponto de entrada — dois modos, uma entrada

```
php api/cron/scheduler.php                    → DISPATCHER (é o que o crontab chama)
php api/cron/scheduler.php --job=<slug>       → EXECUTOR síncrono de uma rotina
php api/cron/scheduler.php --job=<slug> --force → ignora o agendamento
php api/cron/scheduler.php --dry-run          → imprime o que faria
php api/cron/scheduler.php --data=YYYY-MM-DD  → injeta o "hoje" (determinismo em teste)
```

Guardas obrigatórias na entrada: recusar `PHP_SAPI !== 'cli'` e **setar o timezone
explicitamente** — o CLI não passa pelo front controller, então não herda o TZ da aplicação.

### Registro de uma rotina — mapa de closures, não classe

O banco governa **se e quando**; o código governa **o quê e a ordem**. Cada entrada:

```php
'<slug>' => [
    'rotulo'     => '<nome curto para log>',
    'depende_de' => null,          // ou o slug do antecessor
    'executar'   => static function (?string $data): array {
        // ...
        return ['mensagem' => '...', 'efeito' => true];  // efeito=true → registra em auditoria
    },
],
```

A **ordem do array é a ordem de largada**. Linha em `cron_config` sem par no mapa é ignorada
(loga e segue) — nunca derruba o tick.

### Decisão de agendamento — sem cron expression, e self-healing

Quatro tipos (`interval` / `daily` / `weekly` / `monthly`). A regra que sustenta todos:

> **Nunca compare igualdade de horário.** Pergunte "o horário já passou E ainda não rodou hoje?".

Comparar `HH:MM == tick` faz o dia inteiro ser pulado em silêncio se o servidor esteve fora na
hora marcada. Num sistema de faturamento isso é fatura não gerada. Com a comparação por
"passou e não rodou", a rotina se recupera sozinha assim que o servidor volta.

### Estado da execução

```
registrarInicio()  → last_executed_at = agora, last_status = 'running', last_error_message = NULL
registrarSucesso() → last_status = 'success', last_duration_seconds = X, consecutive_failures = 0
registrarErro()    → last_status = 'error', last_error_message = trunc(msg, 5000),
                     consecutive_failures = consecutive_failures + 1
```

### Administração (recomendado, pode vir numa segunda PRD)

- `GET /cron` — lista com estado, última execução e próxima prevista
- `PUT /cron/{id}` — edita **apenas** `is_enabled`, `interval_minutes`, `run_at_hour`,
  `run_at_minute`, `run_on_day`. **`schedule_type` não é editável pela API** — trocar o tipo
  invalida as demais colunas e é mudança de código, não de operação.
- `POST /cron/{id}/executar` — "Rodar agora"; **checa o lock ANTES** de disparar (senão responde
  200 para execução que não aconteceu)

Tudo sob perfil admin, com auditoria distinguindo liga/desliga de mudança de agendamento.

## Passo a passo do port

1. **Migration da tabela `cron_config`** com o DDL completo acima.
2. **Migration de seed** das rotinas que hoje estão no crontab, uma linha por rotina. As de efeito
   externo (envio, cobrança) entram com `is_enabled = 0`.
3. **Lock** (`CronLock`): `GET_LOCK`/`RELEASE_LOCK` do MySQL se houver MySQL; arquivo com PID como
   alternativa. **Um lock por rotina**, nomeado `<projeto>_job_<slug>` — nunca um lock global.
4. **Serviço de agendamento** com `deveExecutar()`, os gravadores de estado e o heartbeat.
5. **Registro de rotinas** (o mapa de closures), com a ordem de largada.
6. **Dispatcher** (`scheduler.php`): tick → heartbeat → varre o registro → executa os devidos,
   **cada um em seu próprio `try/catch`**.
7. **Migrar as rotinas existentes** para o formato de closure. Cada uma retorna
   `['mensagem' => ..., 'efeito' => bool]` e **lança exceção em erro** — não faz `exit(1)` por
   conta própria, senão mata os irmãos do mesmo tick.
8. **Substituir o crontab do servidor pela linha única.** Remova as antigas **no mesmo momento**
   em que a nova entra: as duas convivendo é execução duplicada.
9. **Reconexão defensiva de banco** se alguma rotina tem espera longa (API externa, polling).
10. **Tela de administração + endpoints** (pode ser PRD separada).
11. **Diagnóstico**: expor no health check o `cron_last_tick`, as rotinas desabilitadas e as com
    `consecutive_failures >= 3`.

## Armadilhas

Marcadas com **[incidente]** as que já quebraram em produção, e **[defesa]** as que foram
previstas em review e nunca chegaram a doer — as duas entram, mas não confunda uma com a outra.

1. **[incidente] O arquivo de crontab do repositório é ficção.** `DT-036` do Palantir: o cron
   `monitorar_comentarios` foi entregue e nunca executou em produção, porque a Cloudways não lê
   `deploy/crontab.txt` — o agendamento real vive no painel. *Sintoma:* feature aprovada que
   simplesmente não produz dado, sem erro nenhum. *Causa:* o repositório documenta um agendamento
   que o servidor desconhece. *Correção:* a linha única do dispatcher é cadastrada **uma vez** no
   painel; a partir daí rotina nova nunca mais depende disso. Enquanto o projeto tiver N linhas,
   toda entrega de rotina tem um passo manual de produção — e é ele que falha.

2. **[incidente] Conexão de banco morre em rotina lenta e o erro é engolido.** `DT-042` do
   Palantir: a Cloudways derruba conexão ociosa em ~30–40s; depois de um polling de API externa a
   conexão está morta. *Sintoma:* dedup vira falso-negativo, `INSERT` vira "inserção fantasma"
   (`novos=56, analisados=0`), e um `SELECT` de tenants ativos voltando vazio fez o job concluir
   que o tenant estava inativo e **se encerrar permanentemente**. *Causa:* PDO stale + `try/catch`
   silencioso. *Correção:* `ensureConnection()` antes de cada bloco que escreve depois de espera
   longa — reconectando em `server has gone away` / código 2006 — e aplicar em **todos** os
   arquivos de rotina, não só no que está sendo debugado. Atenção: reconectar o PDO do serviço de
   agendamento **não** conserta o PDO da aplicação; são conexões diferentes.

3. **[incidente] Dois fusos na mesma tabela.** `DT-082` do Palantir e `DT-059` do Taurus. *Sintoma:*
   `TIMESTAMPDIFF` dando +3h, guardrail de atraso mascarado ou disparando falso positivo. *Causa:*
   `last_executed_at` gravado pelo PHP no fuso local e comparado com `NOW()` do MySQL, que volta
   UTC em produção; agrava quando um arquivo seta `America/Fortaleza` e outro `America/Sao_Paulo`.
   *Correção:* agendamento é **infraestrutura, não data de negócio** — todo cálculo com
   `DateTimeZone` explícito no PHP, **nunca** `NOW()` do banco, e o timezone setado no ponto de
   entrada do CLI. Um fuso só no projeto inteiro.

4. **[incidente] Rotina nova invisível na tela.** `DT-085` do Palantir: linhas semeadas sem
   `display_name`/`description` viram cards em branco. *Correção:* os dois campos são obrigatórios
   no seed — a migration seguinte já nasceu preenchida.

5. **[incidente] Lista paralela de rotinas sai de sincronia.** O `$scriptMap` do "Executar agora"
   do Palantir é uma segunda lista mantida à mão; hoje faltam entradas e o botão responde HTTP 400
   (também origem do `DT-036`: *"Script nao mapeado"*). *Correção:* uma fonte só — o registro de
   closures. Se a API precisa saber o que existe, ela lê o registro, não uma cópia.

6. **[defesa] `exec("comando &")` retorna 0 mesmo com binário inexistente** — quem sai com 0 é o
   shell que colocou o processo em background. *Correção:* antes de confiar no disparo, prove que o
   binário responde (`php -r "echo 42;"`). Sem isso, caminho de PHP errado vira "disparei com
   sucesso" e a rotina para em silêncio.

7. **[defesa] `PHP_BINARY` sob SAPI web aponta para o Apache/PHP-FPM**, não para o CLI. Só é
   confiável quando o chamador já é CLI. *Correção:* caminho do binário configurável, com
   `PHP_BINARY` apenas como fallback.

8. **[defesa] Rotina longa parece "não devida".** Como `last_executed_at` é gravado na largada,
   uma rotina que passa do tick já aparece como não devida — e uma dependente sairia junto,
   trabalhando sobre dado pela metade. *Correção:* a fonte da verdade sobre "está rodando" é o
   **lock**, não o timestamp. Consulte-o de forma não-destrutiva (`IS_USED_LOCK`) antes de disparar
   dependente.

9. **[defesa] Uma rotina que estoura não pode derrubar as irmãs.** Cada uma em seu `try/catch` no
   laço do dispatcher; o processo sai com código ≠ 0 no fim para a falha chegar ao log do cron,
   mas sem esconder as que rodaram.

10. **[defesa] Sem fallback, uma restrição do servidor para tudo em silêncio.** Se o disparo em
    background não for possível (`disable_functions`), execute **in-process** no mesmo tick. Nunca
    trate "não consegui disparar" como "não havia o que fazer".

11. **[defesa] `--force` propaga pela cadeia de dependência.** Um "Rodar agora" na tela dispararia
    a rotina dependente fora do agendamento — no Caronte isso significaria **envio real de
    WhatsApp/e-mail para clientes**. *Correção:* rotina com efeito externo fica fora do grafo de
    dependência (`depende_de => null`), mesmo tendo relação lógica com a anterior.

12. **[defesa] Sharding e rotina única são mutuamente exclusivos.** Locks são por `script_name`,
    então `rotina` e `rotina_shard_0` **não se bloqueiam**. Manter os dois habilitados processa
    tudo em duplicidade. Ligar shard é sempre `UPDATE` ligando os shards **e** desligando o
    original, na mesma migration.

13. **[defesa] Drift de intervalo.** Com tick de 2 min, um intervalo de 60 min vira 62 e vai
    acumulando. *Correção:* considerar devido a partir de `intervalo - 1 minuto`.

14. **[defesa] `monthly` no dia 31 em mês de 30 dias nunca rodaria.** *Correção:*
    `min(dia_configurado, último_dia_do_mês)`.

15. **[defesa] `last_status='running'` preso = processo morto.** Lock de escopo de conexão
    (`GET_LOCK`) se libera sozinho quando o processo morre, mas a **coluna** fica `running` para
    sempre. Sinalize na tela acima de um limite (30 min) em vez de confiar no status.

16. **[defesa] Lock com timeout que expira substitui o lock sem matar o processo** — dois
    processos passam a coexistir. Timeout de lock deve ser maior que a pior duração conhecida da
    rotina, e rotina cara merece o seu próprio.

17. **[defesa] Heartbeat vivo não significa sistema saudável.** Rotina desabilitada e rotina
    falhando sempre mantêm o tick chegando. O diagnóstico precisa olhar as três coisas:
    tick recente, rotinas desabilitadas, `consecutive_failures >= 3`.

## Checklist de aceite

- [ ] O crontab do servidor tem **uma única linha** apontando para o dispatcher; as linhas antigas
      foram removidas no mesmo momento
- [ ] Uma rotina nova entra em produção sem tocar no crontab e sem acesso ao servidor
- [ ] Toda rotina que existia antes tem linha correspondente em `cron_config`, com
      `display_name` e `description` preenchidos
- [ ] Rotina com efeito externo foi semeada com `is_enabled = 0`
- [ ] Desabilitar uma rotina pelo banco impede a execução no tick seguinte
- [ ] Rodar o dispatcher duas vezes em paralelo executa a rotina **uma vez** (a segunda sai pelo
      lock, sem erro)
- [ ] Simular o servidor fora do ar na hora marcada: a rotina diária roda ao voltar, **no mesmo
      dia** — não pula o dia
- [ ] Rotina que lança exceção grava `last_status='error'`, a mensagem e incrementa
      `consecutive_failures`, **sem impedir** as demais rotinas do mesmo tick
- [ ] Após um sucesso, `consecutive_failures` volta a zero
- [ ] `last_duration_seconds` é preenchido e bate com a duração real
- [ ] Tick sem trabalho sai em tempo desprezível e **não** gera linha de log
- [ ] O log registra o que executou, com duração e resultado
- [ ] O heartbeat (`cron_last_tick`) avança a cada tick e o health check o expõe
- [ ] Nenhum cálculo de horário usa `NOW()` do banco; o timezone é setado no ponto de entrada
- [ ] `script_name` não aparece em nenhum `require`, `include` ou string de shell
- [ ] Se há tela: editar o agendamento vale no tick seguinte, `schedule_type` não é editável, e
      "Rodar agora" com a rotina em execução responde conflito — não 200

## Variações por stack

**PHP puro (validado — 3 projetos).** É a forma canônica descrita acima. Caronte é a referência
completa. Restrição real dos três: **PHP 7.4** em produção — sem `match`, sem `?->`, sem
`str_contains`, sem enum, sem promoção de propriedade no construtor.

O padrão foi ficando mais apertado a cada projeto. As três gerações, do mais antigo ao alvo:

| | **v1 — Palantir** (PRD-019) | **v1.5 — Taurus** (PRD-025) | **v2 — Caronte** (PRD-004) ✅ alvo |
|---|---|---|---|
| Crontab | N linhas, uma por rotina | **1 linha** | **1 linha** |
| Papel do dispatcher | não existe | orquestrador: dispara **todas** as habilitadas em background | decide **quem é devido** e só então executa |
| Quem decide o "quando" | cada script, na sua linha | cada script filho | o dispatcher, antes de gastar processo |
| Rotina é… | arquivo `.php` | arquivo `.php` — `script_name` **vira caminho** (sanitizado `[^a-z_]`) | **closure num mapa**; `script_name` nunca toca o filesystem |
| Dependência entre rotinas | — | — | `depende_de` com encadeamento |
| Custo do tick ocioso | N processos PHP | N processos PHP (forks espaçados em 500ms) | 1 processo, 1 SELECT |

**v1 (Palantir)** ainda é o estado atual do projeto e mantém o passo manual de produção que causou
o `DT-036`. **v1.5 (Taurus)** já resolve a linha única — o ganho principal — mas continua pagando
um processo PHP por rotina a cada tick, mesmo quando nenhuma é devida, e reintroduz o
`script_name` como caminho de arquivo. Os dois são **referência de leitura, não alvo de port
novo**; e ambos são candidatos legítimos a evoluir para a v2.

**Extensões que só o Palantir tem** (portáveis para qualquer projeto, sob demanda):

- **Sharding** — `--shard=N --total=M` no argumento, `script_name` composto em runtime
  (`rotina_shard_0`), uma linha em `cron_config` e um lock por shard, e filtro
  `WHERE (chave % :total) = :shard` na consulta. É a resposta para *"preciso de temporalidade mas o
  volume é alto"*: no `monitorar_comentarios` o ciclo caiu de ~20 min para ~7 min. Leia a
  armadilha 12 antes de ligar.
- **Alerta ativo de falha** — a partir de 3 falhas consecutivas, mensagem por WhatsApp ao admin,
  com debounce de 1h via `last_alert_sent_at`. É o que transforma `consecutive_failures` de coluna
  em salvaguarda. (No Palantir o destinatário está fixo no código — ao portar, leia do cadastro.)
- **Reconexão defensiva de PDO** — obrigatória se alguma rotina espera por API externa. Ver
  armadilha 2.

**Laravel — não portado, e provavelmente não deve ser.** O `schedule:run` já entrega a linha única
de crontab. Se o projeto quiser o controle por banco, o caminho é ler `cron_config` de dentro do
`Kernel` e manter o scheduler nativo — não substituí-lo. Ainda é incógnita: ninguém fez.

**Node / outras stacks — incógnita.** Nunca rodou.
