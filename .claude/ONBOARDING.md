# Onboarding do harness — primeira instalação e atualizações

> **Para que serve este arquivo.** Toda instalação ou atualização do harness envolve
> **decisões** — modelos dos agentes (custo de tokens!), lint, RAG, Codex — e herdá-las
> sem saber é como o consumo estoura sem ninguém perceber. Este arquivo é o checklist
> dessas decisões: passe por ele **ao portar** (seção A) e **a cada atualização** que o
> `/deus` / `harness-sync.sh --apply` trouxer (seção B + "Decisões por versão" na C).
>
> Ele viaja com o `.claude/` (versionado e propagado pelo sync). A versão instalada neste
> repo está em `.claude/harness.env` → `HARNESS_VERSION`; o histórico técnico completo
> fica no `CHANGELOG.md` da cópia-mestre (`vault/projetos/referencias/harness/`).

---

## A) Primeira instalação (port novo)

O passo a passo mecânico (copiar, perfil, doctor) está no README da cópia-mestre. O que
está aqui é o que o passo a passo **não decide por você**. Percorra os 7 itens:

### A1. Perfil preenchido de verdade

`.claude/PERFIL-PROJETO.md` sem `<placeholder>` — caminhos de CLI, banco de teste local,
armadilhas, compatibilidade de produção. Perfil pela metade = skills operando no escuro.

> **Atalho visual (recomendado): `/harness-config`.** Abre uma tela com o **preset de esforço** +
> todos os campos do Perfil + `harness.env`; você preenche/ajusta e ela gera os arquivos de volta
> (download ou "copiar p/ o Claude aplicar"). Na instalação nova, parte de um perfil base
> (php-laragon / node-api / generico). Reabra-a quando quiser ajustar algo (trocar preset, promover
> um agente a Opus, mudar o reasoning) — não precisa editar markdown na mão. **Abra-a também a cada
> atualização do harness** (seção B) para revisar campos/flags novos que a versão trouxe.

### A2. Modelos dos agentes — a decisão de CUSTO ⚠️

**Default: TODOS os agentes em Sonnet** (política Sonnet-first). Isso não é detalhe — é a
decisão que define o consumo de tokens do projeto, porque parte dos agentes roda
**automaticamente** no fluxo:

| Agente | Roda quando | Frequência |
|--------|-------------|------------|
| `tony-stark` | discovery de toda `/prd` | **toda PRD** |
| `beholder` | red-team no fim de toda `/prd` | **toda PRD** — em ciclos (ver abaixo) |
| `atlas` | `/prd` que toca módulo existente | quase toda PRD |
| `sherlock` | Fase 2 do `/prd-exec` + `/codex-review` | todo review — em ciclos (ver abaixo) |
| `hefesto` | Fase 1 do `/prd-exec` (N em paralelo) | toda execução |
| `michelangelo` | gate de UX na `/prd` (quando há UI) + Fase 2.9 do `/prd-exec` | **PRD com tela** — em ciclos |
| `dedalo` | projeta o front na `/prd` (Passo 7.1) + constrói as tasks `Tipo: front` | **PRD com tela** (2.9.0) |
| `ariadne` | maquete — só quando você pede (`/mockup`, entrevista da `/prd`, `/dt`) | sob demanda · Sonnet fixa |

**Decida conscientemente:** mantenha tudo `sonnet` (recomendado — é o default), ou
promova agentes **individualmente** a `opus` no Perfil (seção "Agentes do harness
(modelos)") **somente se a conta tem limite folgado**. Promova primeiro o que é sob
demanda; os automáticos por último e com consumo monitorado. `hefesto` é sempre Sonnet.

**E o segundo botão de custo — os limites de ciclos dos dois loops.** O harness tem dois
loops contados, ambos configuráveis no Perfil e com a mesma semântica (`preset`/ausente =
valor do preset ativo — economico 2 · equilibrado 3 · maximo 4; `0` = sem limite; conta
apertada: use o preset `economico`):

1. **Red-team do beholder** (`/prd`, Passo 10) — campo **"Ciclos do beholder"**, seção
   "Agentes do harness (modelos)". Ciclo = revisão da spec → correção → re-revisão.
2. **Code review dupla-cega** (Fase 2 do `/prd-exec` e `/codex-review`) — campo
   **"Limite de ciclos"**, seção "Codex review". Ciclo = review (Codex + sherlock) →
   correção dos bloqueantes. Na standalone, `--max-ciclos=N` sobrepõe pontualmente.

Em ambos, esgotar o limite **sem resolver** faz a skill **parar e perguntar**: seguir
(os achados restantes ficam explicitamente aceitos e registrados — riscos na PRD / DTs)
ou abortar. Ela nunca decide isso sozinha — e nunca roda ciclo extra por conta própria.

### A3. Lint

`HARNESS_LINT_CMD` + `HARNESS_LINT_EXT` no `.claude/harness.env`, apontando para a stack
do projeto. Vazio = lint desligado (decisão válida, mas tome-a — não herde).

### A4. RAG — ligado ou dormente?

Default **desligado** (`HARNESS_RAG_ENABLED='0'`). Ligue só em projeto longo/contínuo —
e saiba que o resumo via `claude -p` consome crédito Agent SDK (desde 15/jun/2026).
Guia: `.claude/RAG.md`. Projeto curto/one-off: deixe dormente, custo zero.

### A5. Codex (review dupla-cega)

`npm i -g @openai/codex` + `codex login` habilita a dupla-cega (Codex + sherlock). Sem
ele o review roda só com o sherlock — funciona, mas com uma perspectiva só. Decisão por
máquina/dev, não por repo.

### A6. Permissões — allowlist ESTREITA no projeto + prefixos pessoais ⚠️ CORRIGIDO na 1.9.0

> **Correção importante (1.9.0):** a versão anterior deste item sugeria que prefixos largos
> (`Bash("<cli>" :*)`) bastavam para a execução autônoma. **Não bastam:** em **auto mode**,
> regras largas que dão execução arbitrária (interpretador wildcarded — `Bash(php:*)`,
> `Bash("C:/.../php.exe" :*)`) são **SUSPENSAS** e caem no classificador remoto mesmo assim.
> Quando o classificador fica indisponível (outage real: 09/07/2026), ele nega TUDO em
> fail-closed — e só sobrevivem operações read-only e **regras ESTREITAS**.

**1) Allowlist ESTREITA, versionada, no `.claude/settings.json` DO PROJETO** (a que protege
a execução autônoma): comando + subcomando fixos, `*` só nos argumentos —
`Bash(php artisan test *)`, `Bash(composer dump-autoload)`, `Bash(vendor/bin/phpunit *)`.
Preencha a seção **"Execução autônoma — comandos conhecidos-seguros"** do Perfil e gere o
bloco para revisar/colar:

```bash
bash .claude/harness-doctor.sh --gen-allowlist
```

Nota: o `permissions.allow` do settings.json do projeto só vale depois de aceitar o
**diálogo de confiança do workspace** (uma vez, interativo). Banco de dados: nunca direto —
wrapper versionado do banco de TESTE (`.claude/scripts/db-test.sh`) e allowlist do wrapper.

**2) Prefixos pessoais no `settings.local.json`** (cortam prompt no modo **assistido**):
copie `.claude/settings.local.json.example` → `.claude/settings.local.json`, enxugue, e
adicione entradas de PREFIXO para os CLIs do Perfil — ex.:

```json
"Bash(\"C:/laragon/bin/php/php-8.1.10-Win32-vs16-x64/php.exe\" :*)",
"Bash(\"C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysql.exe\" :*)"
```

Em execução assistida isso evita dezenas de "always allow" exatos; em auto mode não conta
(regra larga suspensa). O doctor confere as duas coberturas
(`bash .claude/harness-doctor.sh --autonomia`).

### A7. Validação

```bash
bash .claude/harness-doctor.sh
```

Zere os `[FALTA]`; leia os `[WARN]` e decida cada um. O doctor também mostra os agentes
promovidos a Opus — confira se a lista é a que você decidiu no A2.

---

## B) Atualização do harness (via `/deus` ou `harness-sync.sh --apply`)

O sync atualiza o **núcleo** (skills, hooks, agentes genéricos, scripts, templates) e
preserva o local (Perfil, `settings.local.json`, memória, PRDs). Mas atualização de
núcleo pode **mudar defaults e criar campos novos** que o seu Perfil ainda não tem —
por isso a rotina abaixo (5 minutos):

1. **De → para:** veja a versão que o repo tinha e a que chegou (o `--apply` imprime a
   linha `ONBOARDING|...` com as duas; ou `git diff .claude/harness.env`).
2. **Leia a seção C** ("Decisões por versão") de cada versão na faixa que você pulou —
   ex.: estava em 1.0.0 e veio 1.2.0 → leia 1.1.0 **e** 1.2.0.
3. **Ajuste o que for pedido** (campos novos no Perfil, flags novas no `harness.env`,
   entradas de `.gitignore`).
4. **Rode o doctor** (`bash .claude/harness-doctor.sh`) e zere os `[FALTA]`.
5. **Commite** os ajustes junto com a atualização do harness.

> Regra geral: o sync **nunca** reverte suas decisões locais — mas versão nova pode
> introduzir decisões que você ainda não tomou. A seção C existe para você tomá-las.

---

## C) Decisões por versão

### 3.5.7 (2026-09-16) — nenhuma decisão do harness em variável local + cinco melhorias de performance

**A regra.** Toda DECISÃO do harness (duelo, guards, pipeline, faixas, noturno, watchdog, frentes, daemon, presença,
packets, RAG do resumo…) mora em `hooks/_defaults.env` — versionado no mestre, único lugar, chega pelo sync. O
`.claude/harness.env` do projeto fica só com as chaves de PROJETO (lista fechada em `hooks/_camadas.txt`: versão,
superfícies, lint, worktrees, numeração de migration, pastas, RAG on/off); `harness.env.local` e
`~/.harness.env.local` só com o que é da MÁQUINA (segredos, runtimes, ollama, Beholder, teto de frentes). Todo hook
`.sh` carrega pelo `hooks/_env.sh` e todo `.mjs` pelo `presence.mjs loadHarnessEnv()`, na mesma ordem
(`_defaults.env → harness.env → harness.env.local → ~/.harness.env.local`), e **a variável de ambiente da sessão
vence todas** (como o `harness.env.local.example` sempre documentou — até a 3.5.6 o arquivo vencia o ambiente).
Medido em 16/09: 58 decisões não existiam no `harness.env` da Mariana e caíam no default do código, que divergia do
mestre em `HARNESS_DUELO_TIMEOUT` (300/600), `HARNESS_OLLAMA_MODEL` (auto/qwen3-coder), `HARNESS_RAG_CAPTURE_AGENTS`
(0/1) e `HARNESS_TASK_MAX_LINHAS` (230/200); o `~/.harness.env.local` do PC sobrescrevia a pool do duelo para todos
os projetos.

- **CONFERIR (`/deus` / `harness-sync.sh --apply`):** o sync agora imprime `ENV|decisao-no-projeto|<chave>|<arquivo>|
  igual|difere|esperado`, `ENV|obsoleta|…` e `ENV|maquina-versionada|…`. No `--apply` a decisão declarada com o MESMO
  valor do default é COMENTADA no `harness.env` (marcador `[3.5.7 migrado: decisao do harness em hooks/_defaults.env]`)
  e entra no commit escopado; valor diferente é **preservado** como override consciente (`ENV|override-preservado`).
  Leia essas linhas: override consciente que ninguém lembra por quê é candidato a apagar.
- **DECISÃO (por projeto):** rode `bash .claude/harness-doctor.sh` — a seção **"Camadas de configuracao"** mostra a
  origem resolvida de cada decisão e avisa `OVERRIDE CONSCIENTE` (decisão redeclarada fora do esperado), `chave
  desconhecida` (obsoleta/erro de digitação) e **FALTA em `SEGREDO VERSIONADO`** (`HARNESS_BEHOLDER_TOKEN` ou
  `HARNESS_PRESENCE_TOKEN` no `harness.env` — mova para `harness.env.local`). **`OPENROUTER_API_KEY` NÃO é segredo
  para o doctor:** decisão do Charles (16/09) — é chave de PROJETO, nasce vazia no template e, preenchida, viaja pelo
  repositório (a equipe do projeto usa a mesma conta/limite); o `harness-sync.sh --apply` preenche o projeto a partir
  do `~/.harness.env.local` da máquina quando o campo está vazio (`ENV|preenchida|OPENROUTER_API_KEY`). Override
  ESPERADO (`HARNESS_VERBOSITY` no projeto, `HARNESS_DELEGATE_MODE` na máquina, `HARNESS_OLLAMA_*` na máquina,
  `HARNESS_FOLEGO_*` no projeto…) sai como `[info]`, sem WARN — a lista está em `hooks/_camadas.txt`.
- **AÇÃO (uma vez, na máquina do Charles, SÓ DEPOIS do `/deus` em todos os projetos):** apagar
  `HARNESS_DUELO_MODELS`, `HARNESS_DUELO_SUPLENTES`, `HARNESS_OLLAMA_MODEL` e `HARNESS_FRENTES_MAX` do
  `~/.harness.env.local` — enquanto houver projeto na 3.5.5 ou anterior essas linhas ainda o alimentam. Ficam:
  `OPENROUTER_API_KEY` (a pessoal, que o sync copia para o `harness.env` de cada projeto seu), `HARNESS_BEHOLDER_URL`,
  `HARNESS_BEHOLDER_TOKEN`.
- **Para mudar uma decisão do harness:** edite `hooks/_defaults.env` no MESTRE (ou pela tela `/harness-config` no
  mestre — ela grava na camada certa), rode `node tests/t-357-camadas.mjs` (o T8 falha se o default em código
  divergir) e publique pelo `/deus`. Num projeto, a mesma chave gravada pela tela vira override consciente no
  `harness.env` com o default anotado na linha de cima.
- **DECISÃO (projeto com front JS) — COSTURA (incidente PRD-144, 16/09):** o `stop PRD-NNN-exec` passa a NÃO fechar
  com `COSTURA-VEREDITO|bloqueia` (`window.X` consumido sem publicação, dublê de símbolo em spec, `route.fulfill` de
  endpoint da PRD no acceptance, marcador "NÃO VERIFICADO"/"a integrar na TASK-N" em código). Rode uma vez
  `node .claude/hooks/costura-check.mjs --codigo --base all` no projeto (`all` = o repo inteiro; `none` olha só o não
  commitado e passa vazio num checkout limpo; consumo dentro de `plugins/`, `vendor-manual/`, `dompdf/`, `ckeditor/`, `bootstrap/`, `*.min.js` e
  `*.bundle.js` não conta, e as APIs de navegador/libs de CDN já são conhecidas): se acusar `window-sem-publicacao` de
  publicação DINÂMICA legítima (`window[nome + 'Editor'] = …`), declare `HARNESS_COSTURA_IGNORAR='X,Y'` no
  `harness.env` ou `// costura-ok: <motivo>` na linha; dublê e marcador em specs/código antigos são dívida real —
  registre DT ou corrija. `HARNESS_GATE_COSTURA='aviso'` só reporta. Na Mariana: 6 dublês em 3 specs da 144 e o
  marcador em `busca_unificada.js:17` seguem vivos após o hotfix (o gate vai acusar na próxima exec que tocar ali).
  As tasks novas ganham `Produz`/`Consome` nos Metadados — "função global existente" só com `arquivo:linha`.
- **Nada a fazer (cinco melhorias, nascem ligadas):** (E6) slot de frente sem heartbeat só expira se a sessão dona
  morreu — `sessoes.mjs`; teto absoluto `HARNESS_FRENTES_TETO_H=24`; qualquer Agent de uma run viva renova o
  heartbeat. (E5) `guard-agent --post` avisa `[commit] task(s) ✅ desta run SEM commit` em branch `wt/*` — commit
  por task é passo mecânico 4a da `/prd-exec`; `HARNESS_GUARD_COMMIT_TASK=off` desliga. (E7) `harness-worktree.sh
  novo` roda `npm i --no-save` no principal quando `node_modules` falta e o `package.json` declara
  `@playwright/test` (`HARNESS_WT_NPM_INSTALL=off` desliga); o doctor e o `harness-worktree.sh doctor` acusam
  `@playwright/test` ausente. (Grafo) `task-packet.sh --check` imprime `GRAFO|…|fator_teorico=F` e
  `GRAFO-VEREDITO|serial` abaixo de `HARNESS_GRAFO_FATOR_MIN=2` — a `/prd` (Passo 8) replaneja antes do gate
  (medido: 7 das 10 últimas PRDs da Mariana eram seriais por construção, fator 1,5–1,8, e todas fecharam
  `limitou=dependencias`). (Review) SOLO-2 com packet em N partes = um sherlock por parte + um de costura, não dois
  por parte (144: 6 sherlocks para 4 bloqueantes).

### 3.5.6 (2026-09-16) — teto de teste por task/spec, reservas que sobrevivem à worktree, review desde a base, pool do duelo no base

- **CONFERIR (`/deus` / `harness-sync.sh --apply`):** chega `hooks/_defaults.env`. Se o `harness.env` do projeto (ou o
  `~/.harness.env.local` da máquina) ainda define `HARNESS_DUELO_MODELS`/`HARNESS_DUELO_SUPLENTES`/`HARNESS_OLLAMA_MODEL`,
  o doctor avisa `duelo: pool=… sobrescrita por …` — apague as chaves: a pool passa a ser a do base (deepseek-v4-flash +
  gemini-3.8; suplentes qwen3.7-flash + grok-build-0.1). Guarde a linha só em experimento consciente.
- **DECISÃO (projeto com E2E e lock de execução):** `HARNESS_PW_LOCK_ESPERA='on'` faz o executor esperar o lock em vez de
  gastar rodada e turnos — ligue quando o lock do projeto grava `{"pid":…}` em `.claude/.harness-run/tmp/*.lock`
  (Mariana: sim; `HARNESS_PW_LOCK_GLOB` ajusta o padrão). Default `off`.
- **AÇÃO (uma vez, na máquina do Charles):** apagar `HARNESS_DUELO_MODELS`/`HARNESS_DUELO_SUPLENTES` do
  `~/.harness.env.local` do PC — se ficarem, mascaram o teste de aceite do DT-010 e o doctor vai avisar em todo projeto.
- **Nada a fazer:** teto por task/spec, adoção de reserva morta, `--base auto` do review externo, `start` mantido, `.env`
  negado em subagente, packet com "Ambiente" e "Verificações", dedup de incidentes, `Diff do duelo` obrigatório e limite do
  Codex compartilhado nascem ligados. Executor negado ao gravar `_debug*.spec.js` ou um script no Temp é o esperado.
- **Comandos novos para quem lê exec:** `bash .claude/hooks/harness-duelo.sh --placar` (uso real por modelo),
  `--pool --validar` (pool e catálogo), `harness-worktree.sh doctor` (reservas órfãs), `external-review.sh … --dry-run`.

### 3.5.5 (2026-09-15) — esforço descoberto pelo hook, auto-start pela ferramenta Skill, telemetria de delegações e vereditos

- **CONFERIR (settings.json):** o bloco `hooks` viaja com o sync (3.4.12), então o `PreToolUse` com matcher `"Skill"` →
  `bash .claude/hooks/harness-metrics-auto.sh --skill` (timeout 10) chega sozinho no `/deus`/`harness-sync.sh --apply`
  (`SETTINGS|hooks|atualizado`). Só se o sync reportar `SETTINGS|hooks|local-preservado` (hooks locais fora do padrão)
  adicione o bloco à mão, logo após o `AskUserQuestion`. Sem ele o auto-start continua só pelo prompt (agora por
  posição — já resolve o caso "criar com /prd … a exec com /prd-exec depois").
- **DECISÃO (Perfil):** se você QUER criações em `xhigh`, declare `Esforço — fase pensar: xhigh` na tabela de esforço do
  Perfil; senão o `esforco.sh` vai acusar `AJUSTAR` (o Desktop abre sessões em `xhigh`) e a skill pergunta `/effort high`
  uma vez.
- Nada a fazer para o resto: `HARNESS_ESFORCO_AUTODETECT`, `HARNESS_GUARD_AGENT_CATALOGO`, `HARNESS_GUARD_BASH_SINTAXE`,
  `HARNESS_GUARD_WRITE_CONFLITO` nascem ligados; o daemon reinicia sozinho ao ver o hash novo dos hooks.
- Windows: o `esforco.sh` faz 1 chamada de PowerShell por decolagem (~250 ms). CLI puro sem Desktop: exporte
  `CLAUDE_CODE_EFFORT_LEVEL` ou passe `--atual`.

### 3.5.4 (2026-09-14) — correções da primeira tarde com a 3.5.3 (contador de rodadas, esforço, semáforo, telemetria)

- **Ação (1 min): confira `HARNESS_CODEX_REPORTS` no `.claude/harness.env` do projeto.** Se ainda apontar para
  `/tmp/...` (default antigo), troque para `codex-reviews` e adicione `/codex-reviews/` ao `.gitignore` — a GUARDA 1
  nega escrita em `/tmp` e cada sherlock perdia um turno. O `harness-doctor` acusa.
- **Hábito reforçado:** a sessão de exec nunca chama `set_session_effort` em si mesma; o `guard-agent` agora nega o
  primeiro executor sem `esforco.env` desta decolagem (`HARNESS_GUARD_ESFORCO='on'`; `off` desliga). Feche o `stop`
  com `--esforco-final=<get_session self>`.
- **Com `FRENTES CHEIAS`, espere na fila** (`frentes.mjs wait` em background) — a skill não vai mais recomendar
  "implemento direto". Suba `HARNESS_FRENTES_MAX` em `~/.harness.env.local` se quiser mais frentes (o Charles testa 4).
- **Projeto com DTs fora de `prds/debito_tecnico`** (ex.: `prds/dt`): o `reservar DT` detecta sozinho; outra pasta →
  `HARNESS_DTS_DIR`. Se o `.git/harness-locks/seq/` tiver marcadores `DT-1`/`DT-2` fabricados pelo bug, apague-os.
- **Telemetria:** o `stop` recusa marcador de start com mais de 24 h (`HARNESS_METRICS_STALE_H`) e pede para repetir;
  linha nova tem `origem_start` (`marcador` | `transcript` | `null`). Apague marcadores esquecidos em
  `.claude/.harness-run/*-exec.json` de execs que já fecharam.
- Knobs novos com default: `HARNESS_FOLEGO_PESO_LEITURA` (0.5), `HARNESS_PIPELINE_MAX_VIVOS_ALTA` (3),
  `HARNESS_PW_LOCK_MARCA` (`[e2e-lock]`), `HARNESS_WT_COPIAR_RUN` (`pw-login.mjs,pw-storage.json`).
- **Daemon de hooks:** `guard-playwright.mjs`/`guard-folego.mjs`/`guard-bash.mjs` mudaram — reinicie o daemon após o
  sync (`node .claude/hooks/harness-daemon.mjs --ensure`, ou feche/abra a sessão).

### 3.5.3 (2026-09-14) — sete freios de parede da `/prd-exec` + esforço por papel e por fase

- **Ação (2 min): acrescente ao Perfil**, na tabela "Nível de esforço", as linhas
  `| **Esforço — fase pensar** | \`preset\` |` e `| **Esforço — fase executar** | \`preset\` |` (o
  `perfil-doctor` acusa `FALTA` até lá). `preset` já resolve: pensar `high`, executar `medium` (maximo sobe um
  degrau). Só troque por um nível concreto com motivo — ex.: projeto de dinheiro com exec em `high`.
- **Hábito novo:** sessão de `/prd`, `/ideia`, `/dt`, `/mockup` em **`high`**; sessão de `/prd-exec`,
  `/dt-exec`, `/codex-review`, `/manual` em **`medium`** (`/effort medium` antes de decolar). A skill confere
  pelo `get_session self` e pede uma vez se divergir; hefesto/dedalo já rodam `medium` e os juízes `high`
  pelo frontmatter, então a sessão errada custa só a orquestradora — mas custa.
- Os knobs novos têm default: `HARNESS_PIPELINE_MAX_VIVOS_FOLGADO='6'`, `HARNESS_GRANDE_OK_MAX` (1),
  `HARNESS_GUARD_PW='on'` + `HARNESS_PW_RUNS_MAX` (4), `HARNESS_ESFORCO_GATE='on'`.
- **Projeto que subiu o fôlego (`HARNESS_FOLEGO_hefesto/dedalo` para 120–150) decide:** voltar a 90–100 e
  deixar o guard fatiar/continuar (recomendado — o PARCIAL agora vai a um executor novo, não à pai), ou manter
  com o motivo escrito no `harness.env`. O dra-mariana-duarte voltou para 100 em 13/09.
- **Telemetria:** `tokens_output`/`turnos`/`out_tps` mudam de significado (por mensagem única). Não compare
  cru com runs anteriores a 13/09/2026; o dashboard mostra o degrau. A pai passa a fechar o stop com
  `--vivos-max` e `--limitou` (o stop avisa se faltarem).
- **Daemon de hooks:** `guard-playwright.mjs` é importado pelo `guard-bash.mjs`; um daemon já vivo só o carrega
  ao reiniciar — após o sync, desligue/ligue o `daemon.on` (ou feche a sessão) antes da próxima exec.

### 3.5.1 (2026-09-11) — convenção `health-panel`

- **Ação: nenhuma** até a vez do projeto. `/convencao portar health-panel` gera a PRD do port. Projeto que já
  tem `health.php`/"saúde das integrações"/`status_servicos` (Palantír, Taurus, Beholder) porta
  **acrescentando** o envelope novo e fazendo a tela antiga consumir o painel — sem quebrar quem lê o formato
  antigo por um ciclo. Decisões do port: quais módulos são `critico` (só o que impede o cliente de operar), a
  timezone declarada do software e onde vive o `health_token` da instalação (nunca no git/dump). O
  consumidor (Caronte) é PRD própria.

### 3.5.0 (2026-09-11) — número por dev, migrations por timestamp, telemetria toda por dev/máquina, convenção de licença

- **Número de PRD/DT/LOTE por dev (faixas)** — nada a decidir se você está na tabela padrão da equipe
  (`hooks/_seq.sh`: Charles = bloco 0, Derick 1, Débora 2, Giovanny 3, João Neto 4; chave = e-mail do git).
  **Confira uma vez:** `git config user.email` neste checkout e `bash .claude/hooks/harness-worktree.sh faixa`
  (o doctor avisa se o e-mail estiver vazio ou fora da tabela). Dev externo deste projeto ⇒
  `HARNESS_SEQ_FAIXAS_EXTRA='email=<bloco livre>'` no `harness.env`. Números de 4–5 dígitos (`PRD-1001`,
  `DT-10001`) são normais e **nunca se renumera** — nem para "fechar buraco", nem para "ficar em ordem".
  Projeto onde isso não faz sentido (um dev só, série que precisa ser cronológica): `HARNESS_SEQ_FAIXAS='off'`.
- **Migrations — decisão POR PROJETO** (`HARNESS_MIG_NUMERACAO`): `seq` (default, como hoje: `NNNN_`, reserva
  por checkout; colide entre devs e renumera no merge) ou `timestamp` (`YYYYMMDDHHMMSS_`: ordem de criação
  entre devs, nunca renumera). Recomendação: **timestamp em todo projeto com mais de um dev criando
  migration**. Antes de ligar: (a) o runner precisa aplicar por nome, em ordem, aceitando 14 dígitos — no
  Taurus o `migrate.php` globa `[0-9][0-9][0-9][0-9]_*.php` (4 fixos) e **não veria o arquivo**: é um DT no core
  (trocar por `[0-9]*_*.php`) que viaja aos clones pelo `/propagar`; Caronte e Sagittarius já globam `*.php`;
  (b) nenhum legado com prefixo ≥ ano corrente (o doctor confere). Faixa por dev **nunca** se aplica a migration
  (quebraria a ordem em banco zero — CHANGELOG 3.5.0, item 2).
- **Telemetria:** depois do `/deus`, `git status` passa a mostrar `prds/_metrics/delegations/<você>@<máquina>.jsonl`
  e `duelos/<você>@<máquina>.jsonl` (o `stop` já faz `git add`) — commite junto com o trabalho, como os
  `runs/`. **Ação nos repos que o doctor acusar:** (1) `.gitignore` do projeto com as três linhas
  `prds/_metrics/harness-runs.jsonl`, `prds/_metrics/harness-dashboard-*`, `prds/_metrics/transcripts*/`;
  (2) `git rm --cached` de dashboard gerado e de transcript cru que estejam versionados; (3) nunca uma regra que
  ignore `prds/_metrics/` inteiro. Os arquivos legados `harness-delegations.jsonl`/`harness-duelos.jsonl`
  ficam como histórico — não apague.
- **Convenção `licenca-caronte`:** nada a decidir agora. Quando for a vez do projeto, `/convencao portar
  licenca-caronte` gera a PRD do port. Pré-requisito de produção: a chave pública de PRODUÇÃO do Caronte
  (a do `MANIFESTO.json` hoje é fixture — `docs/DEPLOY.md` do Caronte, "Go-live da assinatura").

### 3.4.26 (2026-09-09) — trechos citados no packet, poda do Perfil com prova (opt-in `auto-verde`)

- **Poda do Perfil (`hooks/perfil-poda.sh`)** — nada a decidir no default: `HARNESS_PERFIL_PODA='sugerir'` só
  LISTA candidatos no Output da `/prd`/`/prd-exec` (seção "Perfil — candidatos a poda"); a poda continua no
  `/deus` com o Charles no loop. Se quiser que o 🟢 provado (caminho/tabela que não existe mais) seja arquivado
  sozinho no fechamento da `/prd-exec`, ponha `HARNESS_PERFIL_PODA='auto-verde'` no `harness.env.local` — é
  reversível (`.claude/PERFIL-ARQUIVO.md` guarda texto + prova) e entra no commit sugerido junto com
  `PERFIL-PROJETO.md` e `PERFIL-RESUMO.md`. 🟡 nunca é aplicado por skill. Projeto anterior à 2.15.0 (entradas
  sem carimbo): o script só enxerga o que a entrada cita — carimbe retroativamente antes de confiar na régua
  de idade. Rode uma vez para conhecer o seu Perfil: `bash .claude/hooks/perfil-poda.sh --md`.

**Packet:** nada a decidir — trecho citado por linha entra sozinho (`HARNESS_PACKET_TRECHO_MARGEM`, 25); o `--check` acusa `TRECHOS|…|DEFASADA` quando a citação passa do fim do arquivo — corrija a citação antes de despachar.

### 3.4.25 (2026-09-08) — Onda D: contratos por papel, agentes auditados para os modelos 5, prompt-audit, relatório provado, esforço por sessão, placar por modelo

- **Nada a decidir; três coisas a saber.** (1) A pasta `.claude/contratos/` viaja no sync (`/prometeu`/`/deus`): sem
  ela o doctor acusa `fail` e os packets saem sem a seção "## 0. Contrato do papel". (2) Os agentes ficaram mais curtos
  — a mecânica (onde ler, fôlego, temporários, Edit-first, lint, invariantes, verificação provada, dois níveis) chega
  pelo topo do packet; mecânica nova entra no contrato do papel, nunca no `.md` do agente. (3) beholder e michelangelo
  agora reportam TODO achado com confiança + severidade, como o sherlock: espere relatórios maiores e triagem na sessão
  pai; o piso (`HARNESS_REVIEW_SEVERITY_FLOOR`) só controla quanto detalhar.
- **Knob:** `HARNESS_PACKET_CONTRATO='off'` tira a seção 0 dos três packets (o agente ainda sabe o caminho do contrato).
- **Codex:** os `.codex/agents/*.toml` apontam o contrato do papel — o Codex não recebe packet com seção 0, o adapter
  manda ler o arquivo. `gen-adapters.sh --check` cobra isso.
- **dedalo/ariadne:** sem browser pane no frontmatter; evidência visual é `npx playwright screenshot` (PLATAFORMAS §7).

**Auditoria de prompts — rito por geração de modelo.** Toda vez que uma geração nova de modelo entra no
harness (ou o Perfil muda o modelo de um agente), rode `bash .claude/harness-doctor.sh --prompt-audit`
(`--prompt-audit --md` grava o relatório em `prds/_metrics/prompt-audit-<data>.md`). Leia achado a achado:
cada linha traz arquivo, linha, padrão e trecho. Decida o que sai (pressão em caixa alta sem porquê,
contador de turnos em prosa, filtro de severidade no revisor, "pense passo a passo") e o que fica de
propósito (contexto, contrato de ferramenta, proibição contra falha que ainda se reproduz, texto de
gatilho). Terminou? `bash .claude/harness-doctor.sh --prompt-audit-baseline` grava a régua do dia; dali em
diante o doctor completo só avisa (`[WARN] auditoria de prompts SUBIU`) quando alto+médio cresceu — o
SessionStart não roda isso. A baseline é local (`.harness-run/`), por máquina: quem porta/atualiza grava
a sua. Desligar: `HARNESS_PROMPT_AUDIT='off'`.

**O que muda no relatório do executor.** Na seção `## Verificações`, toda linha que declara sucesso
(OK/✅/passou/N/N itens) precisa da saída colada logo abaixo — um fence com o comando e o resultado, uma
linha `saída: …`, ou o caminho do log/relatório na própria linha. O hook mede: item sem prova conta em
`verif_sem_prova`, o Status ✅ vira ⚠️ na telemetria e a sessão-pai recebe `[relatorio] … trate como NÃO
verificadas` no retorno do agente (incidente `relatorio` no painel por dev). "Sintaxe: OK (hook lint)"
sem a saída já não vale como verificado. `HARNESS_VERIF_PROVA='off'` volta a só medir.

Duas mudanças no Perfil, nenhuma exige ação — só saiba o que mudou:

1. **O knob "Thinking dos julgadores" SUMIU.** Ele punha a palavra-gatilho de thinking no fim do prompt do
   agente; nos modelos Claude 5 isso não muda o esforço enviado à API (o thinking é adaptativo e a profundidade
   vem do nível de esforço). No lugar entrou **"Esforço da sessão"** (seção "Agentes do harness (modelos)"):
   `preset` = economico `medium` · equilibrado `high` · maximo `xhigh`. Não há esforço por chamada — TODO
   subagente herda o da sua sessão. As skills só avisam ("Perfil pede X; sessão em Y") — quem aplica é você:
   `/effort high` na sessão, ou `"effortLevel": "high"` no `.claude/settings.local.json`, ou
   `CLAUDE_CODE_EFFORT_LEVEL=high`. Perfil antigo com a linha "Thinking dos julgadores" continua válido (a linha
   é ignorada); a `/harness-config` já mostra o esforço efetivo.
2. **`fable` nos overrides de modelo.** "Modelo do <agente>" aceita `fable` (Fable 5.1, o mais capaz — custo
   2× Opus), NUNCA vem de preset. Quando usar: `Modelo do beholder: fable` no gate c1 de uma PRD de dinheiro ou
   segurança, ou `/model fable` na sessão principal da criação. Conta apertada = não use.

Para ler: o dashboard (`/harness-report`) ganhou "Placar interno por modelo" — por papel × modelo e o A/B do
gate c1 (Sonnet × Opus) com leitura pronta. Os alertas "Placar por modelo" e "Gate c1 (item 13)" são réguas em
texto; o preset só muda por decisão humana.

**Pool de duelo:** `gemini-3.8-flash` no lugar do 3.7 e `grok-build-0.1` como suplente (antes do haiku) — se o seu
`~/.harness.env.local` sobrescreve `HARNESS_DUELO_MODELS`/`HARNESS_DUELO_SUPLENTES`, espelhe. Nada mais a decidir.

### 3.4.24 (2026-09-08) — Onda C: LEVE por padrão, gate c1 em Sonnet, packet por função, duelo elegível

Duas decisões, as duas com default já escolhido — só mexa se discordar:

1. **A `/prd` agora roda em MODO LEVE por padrão** (sem votação de discovery, sem pré-gate, a sessão-pai
   redige as tasks — até 8 —, 1 ciclo de gate + confirmação). O rito COMPLETO entra sozinho por RISCO
   (integração com efeito colateral nova, auth/dinheiro novos, módulo inexistente, técnica > 800
   linhas) — e você pode forçá-lo com `/prd --completo <descrição>`. `--leve` ainda funciona (é no-op).
   Para voltar ao rito completo SEMPRE neste projeto: `HARNESS_PRD_RITO='completo'` no `harness.env`.
   O `stop` da telemetria grava `--modo=leve|completo` — em 2 semanas o dashboard compara as trilhas.
2. **No preset `equilibrado` o ciclo 1 do beholder e do michelangelo roda em Sonnet.** Opus só entra uma
   vez, no ciclo 2, quando o ciclo 1 devolveu ≥ 3 🔴 estruturais (o desenho reabriu). `maximo` mantém
   Opus no c1. Quer Opus no c1 neste projeto? Declare `Modelo do beholder: opus` (e/ou `Modelo do
   michelangelo: opus`) em "Agentes do harness (modelos)" do Perfil — override vence o preset. A
   tela `/harness-config` mostra o modelo efetivo por agente.

Nada a decidir no resto: o `task-packet.sh` passa a entregar arquivo > 40 KB por esqueleto + funções
citadas também para os arquivos de contexto (o executor lê o trecho que faltar com `Read
offset/limit`), a previsão de minutos entra no veredito do `--check`, e `Duelo: sim` com 3+ alvos ou
arquivo novo é rebaixado para `nao` na criação. Knobs: `HARNESS_PACKET_ESQUELETO`,
`HARNESS_PACKET_ARQ_KB`, `HARNESS_DUELO_CHECK`, `HARNESS_GATE_ESTRUTURAIS_OPUS`.

**Itens 10 e 11 (SOLO-2, Codex com validade, duelo serial):**
- **Duelo SERIAL é o default** (`HARNESS_DUELO_SERIAL='on'`): o worker B só é pago quando o diff de A não
  aplica; com A aplicável o duelo vira "primeiro diff aplicável vence" (W.O. serial, `pulou_b=1`) e o
  themis não entra. Quem quiser COMPARAR modelos de verdade (dois diffs + juiz) põe
  `HARNESS_DUELO_SERIAL='off'` no `harness.env.local`. Nada muda nos gates: hefesto aplica, lint + spec
  + sherlock/michelangelo seguem iguais.
- **Placar REMOVE, não rebaixa** (`HARNESS_DUELO_PLACAR_REMOVE='on'`): modelo que cruza a régua some do
  pool (inclusive do rodízio de exploração) enquanto a régua valer na janela; se sobrar < 2 mesmo com
  `HARNESS_DUELO_SUPLENTES`, o duelo fica `indisponivel` e o hefesto escreve. Quer o comportamento antigo
  (rebaixar e deixar o rodízio trazer de volta)? `HARNESS_DUELO_PLACAR_REMOVE='off'`. Para reabilitar um
  modelo cortado: `HARNESS_DUELO_ROTEAMENTO='rodizio'` por uma rodada, ou esperar a janela (30 duelos) girar.
- **Ferramentas do worker openrouter:** teto de 4 turnos (`HARNESS_DELEGATE_TOOLS_MAX_TURNOS`) e
  `qwen/qwen3-coder-next` roda SEM tools (`HARNESS_DELEGATE_TOOLS_OFF_MODELS`). Adicione à lista qualquer
  modelo cujo `tokens_in` no manifest explodir com `--tools`; `HARNESS_DELEGATE_TOOLS='off'` desliga para todos.
- **Codex em limite de uso:** nada a fazer — o preflight guarda a data (`ate=`), ninguém pinga até lá, o
  SessionStart avisa "Codex fora até <data>" e o review roda em SOLO-2. Liberou antes da data?
  `bash .claude/hooks/harness-delegate.sh --preflight codex-cli --force`.
- **SOLO-2 é o SOLO oficial:** sem Codex, a Fase 2 despacha dois sherlocks com lentes A/B — custa um
  sherlock a mais (Sonnet) por ciclo. Quem quiser um só usa `/codex-review --apenas-sherlock`; lote leve e
  rito mínimo da `/dt-exec` seguem com um só de propósito. O sherlock agora reporta TUDO com confiança
  (alta/média/baixa): espere relatórios mais longos e triagem mais séria na sessão-pai — é intencional.

### 3.4.23 (2026-09-08) — Onda B: painel por dev/máquina, cobertura, incidentes, permissão por máquina

**Painel/telemetria (itens 15, 17, 11e):** nada a decidir — Tudo liga sozinho e é aditivo. Duas observações operacionais (não decisão):
- As skills de fechamento (prd-exec Fase 3, prd 10.x, dt-exec) podem passar `--modo= --review-modo= --codex=`
  no `stop` para o campo sair preenchido; sem a flag sai `normal`/vazio (n/d). Quem edita as skills na
  Onda C decide onde colocar (o campo `review_modo=solo-2` é o do item 10).
- Marcadores de run aberta há dias (meuanuncio-api ×9, caronte PRD-1642, aec-erp-frontend PRD-021,
  site-allyson PRD-002) aparecem agora como alerta "Run aberta": fechar com `stop` ou apagar o `.json`.

**Permissão por máquina (item 18) — HÁ decisão:**

1. **A allowlist do mestre entra no seu `settings.json` por UNIÃO.** O `/deus` (harness-sync
   `--apply`) passa a somar ao `permissions.allow` do projeto as 19 regras canônicas do mestre
   (helpers do harness, git read-only e `AskUserQuestion`). Nada do que você já tinha é removido.
   Se você NÃO quer isso no seu projeto, declare `"harness": {"permissions": "local"}` no
   settings.json (o `"hooks": "local"` já existente vale para as duas seções). Reveja a lista
   uma vez: `bash .claude/harness-doctor.sh --gen-allowlist`.
2. **`AskUserQuestion` está na allowlist, mas isso NÃO tira o prompt** (medido 09/09 e confirmado
   na doc do Claude Code): a ferramenta exige interação humana em qualquer modo, inclusive o auto
   mode — regra de `allow` não a dispensa. A regra fica por documentar a intenção e não faz mal.
   O que reduz a parada de verdade: em run autônomo o hook `guard-question.sh` NEGA a pergunta e o
   agente decide pelo default declarado; em sessão interativa as skills perguntam UMA vez, no
   fechamento (o "commit?" da `/dt-exec` e da `/prd-exec`). Se o prompt aparecer, é essa pergunta.
3. **Marcador de modo autônomo.** Para um run sem humano na tela, escreva
   `mkdir -p .claude/.harness-run && printf 'noturno\n' > .claude/.harness-run/modo` (ou
   `turbo`), ou exporte `HARNESS_MODO=noturno`. A `/prd-exec --noturno`, a `/dt-exec --aceito` e o
   `scripts/noturno.sh` fazem isso sozinhos. O marcador expira em 12 h (`HARNESS_MODO_TTL_H`) —
   ninguém precisa apagar; para sair antes: `rm .claude/.harness-run/modo`. De manhã, leia a
   seção "Decisões pendentes" do Output: é onde ficou tudo que o run decidiu por default.
4. **Negação recorrente:** se o doctor (`--autonomia`) listar "comando negado 3+ vezes em 7 dias"
   com a regra pronta, revise e aplique com `bash .claude/harness-doctor.sh --apply-allowlist
   --sugeridas` (backup automático em `.harness-run/allowlist-backup/`). Regra de 1 token
   (`php`, `mysql`) nunca é sugerida — allowliste um subcomando ou um wrapper versionado.
Nada a fazer se você aceita os defaults: tudo nasce ligado e o sync cuida do wiring.

### 3.4.22 (2026-09-08) — Onda A: fôlego por hook, telemetria por task, hermes por documento

Nada a decidir no Perfil: tudo nasce ligado. O que muda no seu dia a dia:

1. **Subagente que passa do teto de chamadas do papel é NEGADO** (`guard-folego`) e devolve
   PARCIAL-TEMPO — não é erro, é o esperado; a sessão-pai decide dividir/redespachar. Tetos em
   `HARNESS_FOLEGO_<papel>` (defaults no `harness.env`); `HARNESS_GUARD_FOLEGO=off` desliga.
   `general-purpose` não executa task com packet nem review de ciclo (o guard aponta o papel).
2. **`prds/_metrics/tasks/<você>@<máquina>.jsonl` nasce sozinho** (uma linha por subagente) e o
   `harness-metrics.sh stop` já deixa esse arquivo e o `runs/` STAGED — inclua-os no commit do
   fechamento (o commit escopado da skill já os leva). Nunca `git add prds/_metrics/` inteiro.
3. **settings.json:** o sync traz o bloco `PreToolUse` `Edit|Write` (guard-folego via daemon). Se o
   seu settings tem `"harness": {"hooks": "local"}`, copie o bloco à mão (o doctor cobra).
4. macOS: `agent-stall.sh` voltou a funcionar (era `find -printf`). Nada a fazer.

### 3.4.21 (2026-09-05) — a máquina: menos processos por chamada

Nada a decidir no Perfil: tudo nasce ligado (GUARDA 0 de leitura via Bash em subagente, presença
dentro do `guard-bash --post`, daemon de hooks, semáforo de frentes, spawn no doctor). O que é
DECISÃO DA MÁQUINA (não viaja no sync — cada dev faz na sua):

1. **Exclusões do Defender** (admin): pastas dos projetos (`C:\laragon\www`), `C:\Program Files\Git`,
   `C:\Program Files\nodejs`, `%USERPROFILE%\.claude`; processos `bash.exe`, `node.exe`, `claude.exe`,
   `conhost.exe`. Windows Security → Proteção contra vírus e ameaças → Gerenciar configurações →
   Exclusões.
2. **Integridade de Memória (HVCI)**: Windows Security → Segurança do dispositivo → Isolamento do
   núcleo → Integridade da memória → desligar → reiniciar. Reduz a proteção contra drivers
   maliciosos; em PC de desenvolvimento com Defender ativo é uma troca aceitável — decisão de cada
   um. O doctor imprime `[doctor] spawn N ms` a cada sessão: compare antes/depois (referência da
   equipe: 33 ms; Charles em 04/09: 74–87 ms em repouso, 1.382 sob 3 frentes).
3. **Windows re-liga proteções após atualizações grandes.** Para fixar: `gpedit.msc` →
   Configuração do Computador → Modelos Administrativos → Sistema → Device Guard → "Ativar
   Segurança Baseada em Virtualização" = Desabilitado (HVCI); Defender só fica desligado de forma
   estável com a Proteção contra Adulteração desligada + política "Desativar o Antivírus do
   Microsoft Defender" — não recomendado: as exclusões acima já tiram o custo do caminho quente.
4. **Frentes**: 1 exec pesada por vez no PC (o guard-agent segura a 2ª); noturno no Mac ou
   `--cloud`. Sessões ociosas: `node .claude/hooks/sessoes.mjs` lista, `--fechar` encerra
   (transcript preservado, `claude --resume <id>` retoma).
5. **Daemon**: porta 47831 fixa; conflito de porta → `HARNESS_DAEMON_PORT` no `~/.harness.env.local`
   E reescrever os comandos do settings.json (o doctor avisa). `node .claude/hooks/harness-daemon.mjs
   --status|--stop|--ensure`.

### 3.4.20 (2026-09-03) — dono de arquivo, watchdog que age, hermes C em dois, reconferir, orçamento

Decisões do Charles (03/09, após as execs da madrugada): arquivo de produção em 3+ tasks é hub e se
replaneja na criação; michelangelo não usa mais o browser pane (só Playwright CLI); a última task
de doc é da sessão pai; agente mudo por 4 min é abortado e redespachado uma vez; hermes Modo C
roda em dois quando toca 4+ documentos; `--check` desconta o cabeçalho e roda de novo após cada
correção de gate; orçamento leva contingência de redesenho. Hooks novos: `task-matrix.sh`,
`agent-stall.sh`. Knobs: `HARNESS_MATRIZ_HUB` (3), `HARNESS_STALL_MIN` (4).

### 3.4.19 (2026-09-02) — cinco otimizações da execução

Sem decisão nova. O que muda para quem executa: (1) o sherlock do backend sobe antes do front
fechar; (2) review packet grande vira partes (um sherlock por parte) e arquivos novos entram no
diff; (3) o executor roda o lint do projeto antes de devolver; (4) rerun da família de acceptance
corre em background junto com o ciclo 2; (5) arquivo-alvo gigante entra no packet por função, e
task que cria arquivo não duela. Knobs novos: `HARNESS_PACKET_ARQ_KB` (40),
`HARNESS_DUELO_ARQUIVO_NOVO` (0).

### 3.4.18 (2026-09-02) — refino da execução: front na onda 1, tamanho enforçado, invariantes

Decisões do Charles (02/09): (a) front constrói contra o contrato da técnica e sobe para a onda 1
— a integração real é cobrada na acceptance; (b) teto de carga por contagem de frentes vira só
alerta a partir de 4 (a máquina aguentou 3 o dia inteiro); só spawn lento reduz executores;
(c) task acima de 230 linhas / 4 arquivos / 300 KB de packet é fatiada na criação, nunca na exec;
(d) 🔴 de regra corrigido na criação vira "Invariante do gate" na task, com prova executável que o
executor roda antes de devolver e o sherlock confere primeiro. Se você mantém PRDs em andamento
criadas antes desta versão, o gate de largura do `/prd-exec` já aplica (a) e (b) sem mexer nas
tasks; (c) e (d) só valem para PRDs criadas daqui em diante.

### 3.4.17 (2026-09-02) — agente com identidade única por despacho na presença

Sem decisão. Dois agentes do mesmo tipo em paralelo viram dois avatares no Caronte (antes dividiam
uma linha). O anúncio de agente passou para os hooks `SubagentStart`/`SubagentStop` do
`settings.json` — se o seu projeto não recebe a seção `hooks` do mestre (escape
`"harness": {"hooks":"local"}`), copie os dois blocos à mão.

### 3.4.16 (2026-09-02) — hotfix: agente com sessão própria na presença

Sem decisão. Corrige a 3.4.14: o `end` do subagente encerrava o cartão do pai no Caronte. Se um
cartão seu sumiu hoje, ele volta na próxima sessão (o receptor não revive sessão encerrada).

### 3.4.15 (2026-09-02) — dez aceleradores da criação de PRD

Sem decisão obrigatória. O que muda ao criar PRD: gates leem um packet (`prd-packet.sh`, o guard
cobra), ciclo 1 sobe junto com os hermes, pré-gate em paralelo com o dedalo, ariadne em background
desde o discovery, cache de discovery cobre atlas/tony-stark por 24 h, decisões com recomendação
clara seguem sozinhas em TURBO (ficam "pendentes de ratificação" para o aceite), `equilibrado` =
Sonnet em todos os ciclos, e PRD pequena/fatia entra no **MODO LEVE** (Passo 1.5).
- **⚙️ Opcional:** `HARNESS_GUARD_PRD_PACKET=0` desliga a cobrança do packet; `--leve` força o
  modo leve; Perfil com `Modelo do beholder: opus` mantém Opus no ciclo 1.

### 3.4.14 (2026-09-02) — painel do Caronte fiel

Sem decisão. Sessão só aparece no painel a partir do 1º prompt (aba aberta e não usada não vira
cartão), e o pai anuncia cada subagente no despacho e no retorno (`guard-agent.sh`), então
tony-stark, peter-quill e outros agentes só de leitura passam a aparecer no cartão do pai. Se um
projeto tinha `presence.sh` no wiring, o sync já trocou por `presence.mjs`.

### 3.4.13 (2026-09-02) — presença de subagente no Caronte

Sem decisão. Os subagentes (hefesto, dedalo, hermes...) passam a aparecer agrupados no cartão da
sessão-pai no painel do Caronte: carimbo de throttle próprio por agente (antes o pai engolia o
heartbeat deles), throttle 5 min (`HARNESS_PRESENCE_THROTTLE_AGENT_MIN`) e presença também em
`Write|Edit` (matcher `Bash|Agent|Task|Write|Edit`, que viaja no sync). Se um projeto não
mostrar agentes em 5 min de exec, rode `harness-doctor.sh --presence`.

### 3.4.12 (2026-09-02) — spawn lento no Windows

**Sem decisão obrigatória.** A seção `hooks` do `.claude/settings.json` agora VIAJA com o sync
(wiring Node, `presence.mjs --prompt` só em `Bash|Agent|Task`, watchdog): `permissions`, `env` e o
resto do seu settings ficam intactos. Precisa de wiring próprio? Ponha `"harness": {"hooks": "local"}`
no settings do projeto e o sync preserva. Fora do harness (Windows): no máximo 2 frentes
autônomas por máquina, reiniciar a máquina de tempos em tempos; exclusões do Defender ajudam na
margem (medido 02/09: desligar o Defender não mudou a latência — o gargalo é a fila de spawn do
Git Bash com muitos shells).
- O que muda sozinho: dica Read/Grep no `guard-bash` (`HARNESS_GUARD_BASH_DICA=0` desliga),
  `carga-maquina.sh` mede spawn e a `/prd-exec` baixa para 2 vivos quando lento, worktree nova
  linka `node_modules`/`vendor` (`HARNESS_WT_LINKS`).

### 3.4.11 (2026-09-01) — dieta da criação de PRD (hermes)

Sem decisão obrigatória. O que muda sozinho: tasks menores (só as camadas que a task exige,
teto ~180 linhas), hermes em dois na fase 2 (≥ 7 tasks), correções com patch pronto (até 5 a
própria sessão aplica), gate de confirmação só sobre o diff, votação do discovery só quando pode
baixar o nível, telemetria com `linhas_por_task`/`achados_por_ciclo`/`min_hermes_*` (schema
2.15.0). `Write` volta a ser aceito em documento da pasta da PRD (`guard-write.sh`).
- **⚙️ Opcional:** `HARNESS_GUARD_WRITE_DOCS=1` no `harness.env` se quiser o Edit-first também
  nos documentos; `HARNESS_TASK_MAX_LINHAS` (200) e `HARNESS_HERMES_MAX_TURNOS` (120) ajustam os avisos.
- Por quê: `prds/ANALISE-TELEMETRIA-2026-09-01.md` (fase 2 da `/prd` 2,3× mais lenta na 3.4.10,
  modelos estáveis).

### 3.4.8 (2026-08-28) — hooks em Node, pipeline, noturno v2 (Onda 3)

**Uma decisao SUA (recomendada — e a maior melhoria de qualidade de vida no Windows):**

1. **Trocar o wiring de presence e guard-bash para os ports Node:** no
   `.claude/settings.json` do projeto, substitua `bash .claude/hooks/presence.sh <arg>` por
   `node .claude/hooks/presence.mjs <arg>` (4 entradas) e `bash .claude/hooks/guard-bash.sh`
   por `node .claude/hooks/guard-bash.mjs` (3 entradas, incluindo os dois `--post`). Medido:
   presence 3,9x e guard-bash 8,6x mais rapidos por chamada — e eles rodam em TODO
   prompt/Bash. Paridade total (payload do Caronte identico; contadores anti-espiral
   compartilhados). Sem a troca, tudo continua funcionando no .sh; o doctor da a dica.

**O que mudou sem decisao sua:** `/prd-exec` 1.3 virou PIPELINE por dependencia (task
liberada despacha na hora, teto de 4 executores vivos — fim das ondas-barreira); o noturno
ganhou o modo `--fila` (DTs Alta primeiro + rascunhos de PRD de ideias maduras), dormente
ate o noturno v1 estar em producao (`HARNESS_NOTURNO_FILA='on'` liga).

### 3.4.7 (2026-08-28) — envelope, watchdog, ollama (Onda 2)

**Duas decisoes SUAS (nenhuma obrigatoria):**

1. **Wiring do watchdog (recomendado):** no `.claude/settings.json` do projeto, adicione em
   `PostToolUse` um bloco com matcher `Agent` chamando `bash .claude/hooks/guard-agent.sh
   --post` (timeout 15). Sem ele: agente que estoura o p90 do papel nao gera aviso (caso
   LOTE-028: 5h37/1 task); o doctor avisa.
2. **Worker de duelo GRATIS na sua GPU (opcional):** instale o Ollama (https://ollama.com),
   rode `ollama pull qwen3-coder` e acrescente `ollama:qwen3-coder` ao
   `HARNESS_DUELO_MODELS` ou `HARNESS_DUELO_SUPLENTES` do projeto (ou do
   `~/.harness.env.local` p/ valer em todos). Sem OPENROUTER_API_KEY, um pool 100% ollama
   tambem liga o duelo. Sem daemon: tudo degrada com aviso (preflight reprova, pool filtra).

**O que mudou sem decisao sua:** `/prd` ganhou o modo TURBO NOTURNO na entrevista (aceite
pre-assinado condicionado a gates limpos — voce escolhe POR RODADA, nao e knob); envelope de
custo quantificado na `/prd-exec` e `/dt-exec` (2× o baseline de subagentes, estouro = 1
pergunta); sherlock agora e NEGADO sem review-packet montado (o prompt da skill foi corrigido
junto); executores tem mandato de PARCIAL-TEMPO no contrato.

### 3.4.6 (2026-08-28) — falha rápida, Edit-first, e-mail de espera (Onda 1)

**Duas decisoes SUAS (nenhuma obrigatoria — sem elas tudo degrada com aviso do doctor):**

1. **Wiring do guard-write (recomendado):** no `.claude/settings.json` do projeto (local, o
   /deus nao propaga), adicione em `PreToolUse` um bloco com matcher `Write` chamando
   `bash .claude/hooks/guard-write.sh` — igual ao bloco do guard-agent, trocando matcher e
   script. Sem o wiring: reescrita integral de arquivo existente nao e bloqueada (o executor
   mais caro paga output a toa); o doctor avisa.
2. **E-mail de espera via Beholder (opcional, recomendado p/ quem roda execucao autonoma):**
   no `~/.harness.env.local` (chmod 600), declare `HARNESS_BEHOLDER_URL='https://<beholder>'`
   e `HARNESS_BEHOLDER_TOKEN='<token da fila>'` (peca os dois ao Charles). Com isso, sessao
   pendurada em prompt/permissao manda e-mail ao SEU git_email (throttle 10 min). Sem os
   valores: nada muda (so o log da telemetria, como antes). Desligar por escolha:
   `HARNESS_NOTIFY_EMAIL='0'`.

**O que mudou sem decisao sua:** delegacao externa ganhou preflight (ping na decolagem) +
circuit-breaker (2 falhas consecutivas = fallback imediato, sem pagar timeout de 600s);
placar do duelo promove suplente sozinho quando a regua corta titular (evento no jsonl);
o Stop cobra 1x duelo vencido sem `--aplicado` registrado; `/dt-exec` ganhou piso de 3
itens (1-2 = fusao ou rito minimo); hefesto/dedalo agora sao Edit-first por contrato.

### 3.4.2–3.4.5 (2026-08-24 a 27) — duelo funcional, worktrees seguros, economia de DTs

**Tres decisoes SUAS (nenhuma obrigatoria — sem elas tudo degrada com aviso):**

1. **Duelo de modelos (opcional, recomendado):** crie `~/.harness.env.local` (chmod 600)
   com `OPENROUTER_API_KEY='sk-or-...'` (chave PESSOAL — https://openrouter.ai/keys, poe
   US$ 5). Com a chave, tasks mecanicas de LOTE sao escritas por 2 modelos baratos em
   segundos e um juiz escolhe — medido: 3-10x mais rapido que o executor escrever, custo
   de centavos (teto diario US$ 2, `HARNESS_OPENROUTER_BUDGET_USD_DAY`). Sem chave: nada
   muda, o doctor mostra "duelo dormente". Em task de PRD so `Duelo: sim` explicito duela
   (3.4.5). Placar por modelo: `node .claude/hooks/harness-dashboard.mjs`.
2. **Worktrees (por projeto):** `harness-worktree.sh novo` agora RECUSA criar worktree em
   projeto sem `HARNESS_WT_DB` declarado no `harness.env` (protecao DT-502: worktree sem
   declaracao apontava app/banco para a arvore PRINCIPAL em silencio). Declare a secao
   WORKTREES (db clone/compartilhado/off + overrides de config gitignored com URL/banco —
   `HARNESS_WT_OVERRIDES`) antes de usar.
3. **DTs e ideias:** DT novo exige prova `arquivo:linha`, `**Duplicata:**` verificada e
   `**Balde:**` (o guard-dt NEGA o Write sem isso); fila > 60 pendentes so aceita
   Alta/bloqueante. "Seria bom ter" NAO e DT: use `/ideia` (captura em segundos; refina
   depois; aba Ideias na tela). Resolucao de DT agora leva DATA: `Resolvido (X, AAAA-MM-DD)`.

**O que mudou sem decisao sua:** telemetria liga sozinha (hook + resgate no guard);
teto de 3 ciclos de review dos dois lados; commit automatico em worktree (guard-stop);
doctor do SessionStart virou cacheado (instantaneo; renova em background); pings de
presenca sanitizados em UTF-8 (nome com acento nao some mais do Caronte).

### 3.4.1 (2026-08-23) — noturno em cloud (por projeto)

Para o loop noturno rodar sem o seu PC: o caminho recomendado e um **servidor de homolog** (espelho do prod) com cron — 4 etapas na aba **Noturno** da tela (`/harness-config`); no servidor, `bash .claude/scripts/noturno-setup.sh` instala, pergunta os segredos, valida tudo e agenda os crons (`--check` para conferir depois). Doc: `.claude/scripts/NOTURNO-SETUP.md`. Alternativa: no GitLab do projeto, cole o job de `.claude/scripts/noturno-ci.yml`, crie a Pipeline Schedule (~01:30, variavel `NOTURNO=1`) e as CI variables `CLAUDE_CODE_OAUTH_TOKEN` (ou `ANTHROPIC_API_KEY`), `OPENROUTER_API_KEY`, `HARNESS_DB_EXT_*` e, opcionalmente, `HARNESS_URL_EXT` e `GITLAB_TOKEN`. No servidor, agende `.claude/scripts/noturno-db-clone.sh` para recriar o `<db>_noturno` toda noite. Nada disso e obrigatorio; sem schedule, nada roda.

### 3.4.0 (2026-08-23) — worktrees isolados, loop noturno, workers com ferramentas

**Nada obrigatório.** Para usar o isolamento por sessão, declare no `.claude/harness.env` do projeto
(seção WORKTREES) como o app acha o banco do worktree: `HARNESS_WT_DB_OVERRIDE_FILE/TPL` (arquivo
gitignored gerado de template com `{db}`) e/ou `HARNESS_WT_ENV_MAP` (chaves no `.env`), mais os
gitignored a copiar (`HARNESS_WT_COPIAR`) e se a URL muda por pasta ou porta. Sem declaração, o
hook cria o worktree com **banco compartilhado** (avisa). Exemplo do core (PHP + Playwright):

```
HARNESS_WT_COPIAR='.env,.claude/harness.env.local,.claude/settings.local.json,api/conexao.local.php:api/conexao.local.base.php'
HARNESS_WT_DB_OVERRIDE_FILE='api/conexao.local.php'
HARNESS_WT_DB_OVERRIDE_TPL='<?php $b = __DIR__ . "/conexao.local.base.php"; $o = is_file($b) ? (array) require $b : []; $o["name"] = "{db}"; return $o;'
HARNESS_WT_ENV_MAP='E2E_DB={db},E2E_BASE_URL={url}administrativo,E2E_APP_ROOT={url}'
```

- **Loop noturno:** agende `bash .claude/scripts/noturno.sh` (routine do Claude Code / cron). Exige
  `claude` logado; `OPENROUTER_API_KEY` opcional (sem ela o hefesto nativo escreve); `glab` para o MR.
- Kill switches: `HARNESS_NOTURNO=off`, `HARNESS_DUELO_TOOLS=off`, `HARNESS_DUELO_ROTEAMENTO=rodizio`.

### 3.3.0 (2026-08-23) — duelo de modelos, task packet, OpenRouter com custo, telemetria no repo

**Nada obrigatório.** Tudo nasce ligado com fallback nativo:

- **OpenRouter (opcional, por dev):** quer duelo/triagem barata? Crie a chave em openrouter.ai/keys,
  ponha limite de gasto nela e declare `OPENROUTER_API_KEY` em **`~/.harness.env.local`** (chmod 600 —
  vale para todos os projetos da maquina e funciona no Claude Desktop; `setx`/env so valem para
  processos abertos depois) ou em `.claude/harness.env.local` do projeto (gitignored). Sem chave, `HARNESS_DUELO=auto` fica dormente e o
  executor `openrouter` devolve `indisponivel` — a skill segue nativa. Teto diário default US$ 2
  (`HARNESS_OPENROUTER_BUDGET_USD_DAY`).
- **Telemetria versionada:** `prds/_metrics/runs/<voce>@<maquina>.jsonl` e `harness-duelos.jsonl` (desde a
  3.5.0, `duelos/<voce>@<maquina>.jsonl`)
  passam a aparecer no `git status` depois de cada `/prd`, `/prd-exec`, `/dt-exec` — **commite
  junto com o trabalho** (é assim que a telemetria da equipe chega ao mestre).
- **Delegação `apoio` por padrão:** se o `codex` não está logado, nada muda (fallback nativo).
  Para desligar nesta máquina: `HARNESS_DELEGATE_MODE=off` no `harness.env.local`.
- **Tasks novas ganham o campo `Duelo`** (ausente = auto). PRDs antigas continuam válidas.
- Kill switches: `HARNESS_SKIP_DUELO=1`, `HARNESS_DUELO=off`, `HARNESS_SKIP_DELEGATE=1`.

### 3.1.0 (2026-08-18) — dashboard da telemetria (`harness-dashboard.mjs`)

- **Nenhuma ação obrigatória.** O `/harness-report` passa a rodar
  `node .claude/hooks/harness-dashboard.mjs` (Node puro, já exigido pelo RAG/telemetria) e a
  gerar `prds/_metrics/harness-dashboard-<de>_<ate>.html` + `.json` — HTML auto-contido com
  gráficos, com custo/duração **por agente e por modelo** (vem dos transcripts do Claude Code
  em `~/.claude/projects`; sem eles a seção sai n/d).
- **⚙️ Opcional:** no `harness.env`, `HARNESS_DASHBOARD_BASE` (pasta-pai dos projetos que o
  `--all` varre — deixe vazio se seus repos ficam lado a lado) e
  `HARNESS_DASHBOARD_TRANSCRIPTS='0'` se não quiser que o dashboard leia os transcripts.
- **⚙️ `.gitignore` (30 s):** adicione `prds/_metrics/harness-dashboard-*` — o HTML/JSON são
  relatório gerado, regerável; sem a linha eles aparecem como untracked a cada `/harness-report`.
- **Vale rodar uma vez:** `/harness-report --periodo=30d` — o dashboard te diz se este projeto
  gravou telemetria com `schema` (harness ≥ 2.12.0) na janela; se sair 🟠 *Harness velho*, é
  porque a atualização chegou agora e as próximas execuções já entram certas.

### 3.0.4 (2026-08-17) — `/prometeu`: você atualiza (e instala) o harness sozinho

- **⚙️ Ação (1 min, uma vez por máquina):** a partir desta versão, para atualizar o harness deste
  repo você não depende mais de ninguém. Abra o Claude Code na raiz do projeto e rode:

  ```
  /prometeu
  ```

  Na primeira execução ele procura o **harness base** na sua máquina (a pasta com `perfis/` +
  `.claude/harness-sync.sh` — o clone de `equipe-tefnet-harness-base` ou
  `base-conhecimento/referencias/harness`). Não achou? Ele **pergunta o caminho ou o link do
  repositório** e clona. O que você responder fica gravado em `.claude/prometeu.env` (gitignored) e
  não é perguntado de novo.
- **O que ele faz:** `git fetch` na fonte (fonte velha = painel mentiroso) → `harness-sync.sh
  --check` neste repo → painel com estado, versão de→para, defasagem, extras e risco → sync **sob
  confirmação** → doctor. `--check` só diagnostica; `--pull` atualiza a fonte antes; `--all` varre
  todos os seus projetos de uma vez; `--portar` instala o harness num repo novo, do zero.
- **Commit e push continuam SEUS.** A skill monta o comando escopado (só os arquivos que o sync
  copiou + `harness.env`) e **pergunta** antes de commitar e antes do push. Ela nunca faz
  `git add -A` e nunca escreve no clone do harness base — que é espelho: qualquer edição local lá
  se perde no `git pull` seguinte.
- **Nada a decidir no Perfil.** Esta versão não cria campo novo nem muda default: só acrescenta a
  skill `/prometeu` e o agente `prometeu` (ambos Sonnet) ao núcleo. Se você não usar, nada muda.

### 3.0.3 (2026-08-13) — Playwright headless é o caminho canônico de evidência visual

- **⚙️ Ação (projeto COM front, 2 min):** acrescente ao Perfil, na seção **Testes E2E**, a
  linha nova **`| **Verificação visual (agentes)** | ... |`** (copie do template
  `.claude/PERFIL-PROJETO.md` da cópia-mestre) e preencha com **o que é local**:
  1. estado do Playwright — instalado?, versão, navegadores baixados;
  2. fatos desta máquina — ex.: *"o Browser pane não funciona aqui (não composita frames)"*,
     com carimbo `[AAAA-MM-DD · origem]`.

  Depois rode `bash .claude/hooks/perfil-frescor.sh --carimbar`. Projeto sem front: escreva
  `N/A — projeto sem front` e o doctor para de cobrar.
- **⚙️ Ação (projeto com front sem Playwright):** instale antes da próxima PRD de front —
  `npm i -D @playwright/test && npx playwright install`. O `harness-doctor.sh --autonomia`
  (Passo 0.2 da `/prd-exec`) agora **acusa isso no pré-flight**, e não na fase de verificação
  com a PRD já implementada.
- **O que muda de comportamento:** evidência visual de agente (`michelangelo` Modo A, `dedalo`,
  `ariadne`, gate de UX da `/prd-exec` e da `/dt-exec`) passa a ser **Playwright headless
  gravando arquivo** — `npx playwright test <spec>` / `npx playwright screenshot "<url>"
  <arquivo>.png`, PNG na "Pasta de screenshots" do Perfil. O **browser pane** vira **sonda
  opcional de UMA tentativa**: falhou, o agente registra "pane indisponível" e segue 100%
  Playwright, **sem retentar**. Onde o pane funciona ele continua permitido como inspeção
  interativa — só nunca como dependência.
- **Regra completa (fonte única):** `.claude/PLATAFORMAS.md` §7. Agentes, skills e doctor
  apenas referenciam — não duplique o enunciado em lugar nenhum.
- **Novo grupo no doctor:** `visual` na matriz (WARN, nunca FALTA — projeto sem front é N/A).

### 3.0.2 (2026-08-13) — fix: lint de PHP inoperante no Windows

- **Nada a configurar** — mas saiba o que muda: no Windows, `php.exe -l` sai com rc 127
  também em **erro de sintaxe**, e o `lint.sh` tratava 127 como "binário ausente" → o lint
  de PHP nunca bloqueou nada nesta plataforma. Agora a existência do binário é checada
  antes de rodar; com binário presente, erro de sintaxe **volta a bloquear** o Write/Edit.
- Efeito prático: projetos PHP no Windows podem começar a ver bloqueios de lint que antes
  passavam batido. É o comportamento correto — se o binário do `HARNESS_LINT_CMD` estiver
  errado, o hook avisa (e libera) em vez de fingir que está tudo bem.

### 3.0.1 (2026-08-13) — presença confiável: prova de envio, fila offline e `doctor --presence`

- **⚙️ Ação (projeto JÁ portado, 30s):** SÓ se o seu `harness.env` declara
  `HARNESS_PRESENCE_THROTTLE_MIN='15'` explicitamente, mude para `'10'` (o sync preserva o
  env local, então isso não viaja sozinho). Var **ausente** = nada a fazer: o default do
  hook 3.0.1 já é 10. Motivo: contra o verde do painel do Caronte (< 20 min), 15 deixava
  margem de só 5 min — UM heartbeat perdido já tirava o dev do verde.
- **Diagnóstico em 1 comando** (rode na máquina de quem "não aparece" no painel):
  `bash .claude/harness-doctor.sh --presence` — checa módulo/wiring/curl, mostra o último
  envio logado e a fila, e dispara um ping REAL de teste com o http_code na cara
  (`000` = saída bloqueada por firewall/antivírus/proxy; `401` = token; `2xx` = ok de ponta
  a ponta). O run padrão do doctor ganhou o grupo `presenca` (só checks locais, sem rede).
- **Nada de novo a configurar:** cada tentativa de envio agora deixa prova em
  `.claude/.harness-run/presence.jsonl` (rotação automática) e ping que falha vai para a
  fila offline `.claude/.harness-run/presence-queue/`, reenviada sozinha no próximo evento
  com rede (TTL 30 min — replay velho viraria presença falsa). Teto do curl: 3s → 8s + 1
  retry. Zero token, zero stdout, nada versionado — o custo continua o de antes.

> Cada versão lista **somente o que exige decisão ou ação do dev** — o changelog técnico
> completo fica na cópia-mestre. Mantida pela cópia-mestre; não edite localmente.

### 3.0.0 (2026-08-07) — delegação a CLI externo, dial de economia e verbosidade

> **Major, e o motivo é honesto:** o harness ganha uma **superfície nova** (executor externo
> delegado), o Perfil ganha uma seção nova, e o schema do `harness-runs.jsonl` muda. Nada disso
> quebra projeto portado — mas é mudança de capacidade, não de conteúdo.

- **✅ Nada a fazer para continuar como está.** O default é `HARNESS_DELEGATE_MODE='off'`:
  todo papel roda no subagente **nativo**, exatamente como na 2.16.1. Projeto sem a seção nova no
  Perfil se comporta como antes — isso é testado (t20, cenário "Perfil legado").
- **⚙️ Decisão (opcional): quer usar o Codex para aliviar a conta Claude?** Copie a seção
  **"Economia e controle de custo"** do Perfil da cópia-mestre para o seu
  `.claude/PERFIL-PROJETO.md` e escolha o modo. Recomendação para começar: `apoio` (só
  mapeamento mecânico vai para o Codex — schema, código, PRDs anteriores). Amplie para
  `economia` depois de olhar a telemetria.
- **🖥️ O jeito fácil: `/harness-config` → aba "Economia".** Modo, fallback, verbosidade e o
  roteamento papel a papel, com um seletor de **destino** (`máquina` = `harness.env.local`,
  gitignored; `projeto` = `harness.env`, versionado). A coluna **Efetivo** mostra o que vai valer
  de verdade depois de aplicar modo + override — é a forma mais rápida de conferir se o que você
  configurou é o que vai rodar.
- **⚙️ Onde ligar o modo pessoal:** `HARNESS_DELEGATE_MODE` no **`.claude/harness.env.local`**
  (por máquina, gitignored) — **não** no `harness.env`, que é versionado e viaja para a equipe
  no `/deus`. "Minha conta está apertada esta semana" é decisão sua, da sua máquina.
  Virada pontual: `HARNESS_DELEGATE_MODE=economia claude`.
- **Pré-requisito do modo externo:** `codex` no PATH + `codex login`. Sem isso, **todo** papel
  externo cai em fallback — o `harness-doctor.sh` avisa em alto e bom som se você ligar o modo
  sem ter o CLI pronto.
- **🔊 Mudança de default que você VAI notar: `HARNESS_VERBOSITY='conciso'`.** As skills passam a
  falar bem menos durante o processo (sem preâmbulo, sem recapitulação, síntese do discovery em
  1-3 linhas em vez do bloco de 6 seções). O relatório final continua completo, e os documentos em
  disco não encolhem. Quer a narração antiga de volta? `HARNESS_VERBOSITY='normal'` no seu
  `harness.env.local`. Motivo: texto emitido é output (caro e lento) **e vira input em todos os
  turnos seguintes** — é o único gasto do harness que compõe.
- **Orçamento na decolagem:** `/prd`, `/prd-exec` e `/dt-exec` passam a mostrar o custo estimado
  (média real das últimas execuções **deste projeto**) dentro da entrevista que já existia.
  **Não** há parada nova — a 2.4.0 mediu ~8 min por parada no meio do fluxo e essa regressão não
  volta. Sem histórico, a skill diz "sem baseline" em vez de inventar número.
- **Compatibilidade:** o `external-review.sh` passou a compartilhar a lib
  `_delegate-common.sh` com o broker. Contrato, flags e escopo delta **inalterados** — as três
  skills que dependem dele (`/prd-exec`, `/dt-exec`, `/codex-review`) e o shim histórico
  `codex-review.sh` seguem funcionando (t14, t17 e t21 provam).

### 2.16.0 (2026-08-06) — presença viva em tarefa longa + throttle por sessão

- **⚙️ Ação (projeto JÁ portado, 1 min): adicione o gatilho `PostToolUse` no seu
  `.claude/settings.json`** — o sync atualiza o `presence.sh` mas **não** mexe no seu
  `settings.json` (decisão local, preservada). No array `hooks.PostToolUse`, acrescente uma
  entrada **sem `matcher`** (vale para toda ferramenta):
  `bash .claude/hooks/presence.sh --prompt` (async true, timeout 10). Sem isso, uma sessão
  que trabalha 40 min sem input humano some do painel "Equipe agora" do Caronte.
- **Projeto multi-AI:** o `.codex/hooks.json` novo chega pelo sync (marcador
  `harness:managed`) já com o gatilho — a atualização **re-pende o trust** dos hooks no
  Codex: re-aprove via `/hooks`.
- O throttle do heartbeat agora é **por sessão** (duas janelas no mesmo repo não se
  silenciam mais) — automático, sem ação; carimbos velhos são podados sozinhos.

### 2.15.0 (2026-08-05) — frescor do PERFIL-RESUMO, procedência e poda com prova

- **⚙️ Ação (1 min, uma vez por repo): carimbe o seu resumo.** Se o projeto já tem
  `.claude/PERFIL-RESUMO.md`, ele veio sem carimbo de sincronia. Confira por alto se ainda bate
  com o Perfil, ajuste o que estiver velho e rode:
  `bash .claude/hooks/perfil-frescor.sh --carimbar`. Sem isso, toda `/prd`/`/prd-exec` vai abrir
  com `SEM-CARIMBO` e te pedir isso mesmo.
- **Não tem resumo e o Perfil passa de 20 KB?** Gere agora (o `/deus` faz em lote) — sem ele,
  cada subagente relê o Perfil inteiro a cada ciclo.
- **Hábito novo ao editar o Perfil:** entrada nova sai carimbada com procedência —
  `**[AAAA-MM-DD · PRD-NNN]** <armadilha> — *Por quê:* <...>`. As skills já fazem isso sozinhas
  na última task da PRD; vale para você também quando editar à mão. É o que permite podar depois
  com segurança em vez de chutar.
- **Poda do Perfil:** existe, mas **não** roda dentro da PRD — é o `/deus`, com prova
  (arquivo citado não existe, comando falha), sob confirmação, e o que sai vai para
  `.claude/PERFIL-ARQUIVO.md` em vez de ser deletado.

### 2.14.0 (2026-08-05) — custo real (tokens de subagente) + re-review em delta

- **Ação: nenhuma.** Tudo automático nos hooks.
- **Leitura que muda:** `tokens_output` sempre mediu **só a sessão principal** — os subagentes
  nunca entraram. Na medição que originou o fix, o custo real era **3,65×** o registrado. Se
  você tem número de custo de PRD anotado de antes, ele está subestimado (quanto mais
  subagentes, pior). Custo real agora = `tokens_output` + `tokens_output_subagents`; o
  throughput real é o `out_tps_all`.
- **Review mais rápido a partir do ciclo 2:** o revisor externo passa a receber só o que mudou
  desde o ciclo anterior. Se você revisar os relatórios, vai ver o cabeçalho **Escopo: DELTA**
  com a lista de arquivos. Sem snapshot ou sem mudança, ele avisa e revisa completo — nunca
  revisa "menos" em silêncio. No Codex CLI o recorte não se aplica (a lista vai no cabeçalho,
  para a triagem).

### 2.13.0 (2026-08-05) — `/dt-exec` com fila, paralelismo e migration aditiva

- **Ação: nenhuma no `harness.env`.** Mas **confira uma coisa no Perfil**: a `/dt-exec` agora
  aceita migration **aditiva** dentro do lote, e para isso ela exige que a seção de banco do
  Perfil declare **como rodar migration no ambiente local**. Se o seu Perfil não declara,
  todo item com DDL vai continuar sendo ejetado para `/prd` (comportamento seguro, só mais lento).
- **Novidade que muda seu hábito: `/dt-exec --fila`** roda até 3 lotes (`--fila=N`, teto 5) com
  **uma única entrevista**, um sync e um safe-mode. É a resposta para backlog de DT grande:
  cada módulo vira um lote coeso. Cada lote continua com review dupla-cega, verificação e gate
  documental próprios — a fila corta repetição de decolagem, não rede de segurança.
- **O que passou a caber no lote:** `CREATE TABLE` nova, `ADD COLUMN` nullable/com default,
  `CREATE INDEX` — com rollback declarado e prova via `information_schema`. **O que continua
  fora:** `DROP`/`RENAME`, mudança de tipo/nullability, backfill, mais de 2 migrations no lote.
  `--sem-migration` força a ejeção de todo DDL num run.
- **A execução do lote virou paralela por default** (grupos de arquivos disjuntos). Se você
  costumava ver um hefesto de cada vez, agora verá vários juntos; item com migration roda sozinho.

### 2.12.0 (2026-08-05) — telemetria que separa ocioso de subagente vivo + paralelismo na correção

- **Ação: nenhuma.** Nada de novo no `harness.env`, no Perfil ou no `settings.json` — o
  medidor passou a ler sozinho os transcripts dos subagentes.
- **Leitura que muda (importante):** a linha do `harness-runs.jsonl` ganhou o carimbo
  **`schema`**. Linha **sem** ele é pré-2.12.0 e **não é comparável** com as novas em
  espera e duração ativa — antes, gap com subagente rodando em background contava como
  "espera humana" igual a operador ausente (um run com `wait_human_min=850` e
  `permission_prompts=0` era, na verdade, 506 min parado + 344 min de subagente
  trabalhando). Se você tem relatório antigo com conclusão sobre espera/custo, ele foi
  tirado de um número ambíguo.
- **Campo novo que vale olhar: `parallel_factor`** (trabalho somado dos subagentes ÷
  duração ativa). `< 1,3` com 10+ subagentes = a execução rodou praticamente em fila; o
  resumo da telemetria imprime o alerta sozinho e o `/harness-report` sinaliza 🔴.
- **`/prd-exec` mudou de comportamento na correção:** os bloqueantes da Fase 2 (e os 🔴 de
  UX da 2.9) passam a ser agrupados por arquivo/módulo alvo e corrigidos por **agentes
  simultâneos**, com o plano anunciado no chat ("ciclo 2: 3 grupos disjuntos"). Antes era
  um agente por ciclo, em série — medido em 175 min de correção serial numa PRD real.
  Nada a configurar; só não estranhe ver vários hefestos/dedalos juntos no meio da Fase 2.
- **No Codex:** os campos novos saem vazios (o Codex não expõe transcript por subagente) —
  `n/d`, nunca zero.

### 2.11.0 (2026-08-05) — presença: ping "quem está mexendo em quê" para o Caronte

- **⚙️ Ação (projeto JÁ portado, 2 min): wire o hook no `.claude/settings.json`** — o
  sync copia o `presence.sh` mas **não** mexe no seu `settings.json` (decisão local,
  preservada). Adicione as 3 entradas (mesmo formato dos hooks existentes):
  `SessionStart` → `bash .claude/hooks/presence.sh --start` (async, timeout 10);
  `UserPromptSubmit` → `... --prompt` (async, timeout 10);
  `SessionEnd` → `... --end` (async, timeout 10).
  Projeto multi-AI: o `.codex/hooks.json` chega pelo sync (se tiver o marcador
  `harness:managed`) — re-aprove os hooks via `/hooks` no Codex.
  Port NOVO não precisa de nada (o `settings.json` do mestre já vem com o wiring).
- A URL do receptor tem **default embutido no hook** (`https://caronte.app.br/...`) —
  funciona sem tocar no `harness.env`. O módulo é inofensivo: endpoint fora do ar =
  ping se perde em silêncio (zero erro, zero espera).
- **Transparência (leia e repasse à equipe):** a cada sessão do Claude Code/Codex neste
  repo, o hook `presence.sh` envia ao Caronte **apenas metadados** — evento
  (start/heartbeat/end), nome do projeto, branch, e-mail do git, e-mail do login do
  Claude Code, `usuario@hostname` e host (claude/codex). **Nunca** envia prompt, código,
  diff ou nome de arquivo. Heartbeat no máximo 1x a cada 15 min.
- **Para desligar neste repo/máquina** (ex.: projeto de cliente externo que não deva
  reportar): `HARNESS_SKIP_PRESENCE=1` no ambiente ou `HARNESS_PRESENCE_URL=''` no
  `harness.env` local do repo.
- **Custo:** zero token (hook silencioso não entra no contexto), `curl -m 3` em
  background — não bloqueia nem o Codex (cujos hooks são síncronos).

### 2.10.0 (2026-08-04) — telemetria honesta de verdade + regras de convergência do gate

- **Ação (1 min): tire a telemetria do git.** Se `prds/_metrics/harness-runs.jsonl` está
  rastreado neste repo (o doctor passou a acusar), rode:
  `git rm --cached prds/_metrics/harness-runs.jsonl` e adicione a linha
  `prds/_metrics/harness-runs.jsonl` ao `.gitignore`. O histórico local fica no disco;
  versionado, ele contamina forks/cópias e o `/harness-report --all` (medido: 63,6% de
  duplicatas em 2026-08). Clones que recebem merge de upstream ganham a correção pelo core.
- **Decisão: limiar de gap.** `HARNESS_WAIT_GAP_MIN` (novo no `harness.env`, default `10`
  min): gap de transcript acima disso conta como espera humana e é descontado do
  `elapsed_active_s`. 10 min é defensável (teto do Bash síncrono = 600s); só mexa se o
  projeto roda ferramenta síncrona mais longa que isso.
- **Ação recomendada: gere o `PERFIL-RESUMO.md`.** O doctor agora avisa quando o Perfil
  passa de 20 KB sem o destilado — sem ele, todo subagente relê o Perfil inteiro a cada
  ciclo. Template na cópia-mestre; o `/deus` oferece gerar em lote.
- **Hábito novo no gate da `/prd`: correção de 🔴 propaga em TODAS as camadas** (prosa
  produto, técnica, critério de aceite, cenário E2E, task) — o gate seguinte verifica por
  tema e reporta PARCIAL com o mesmo número do achado. Teto de ciclos: 5 absoluto, mesmo
  com Perfil `0`; ciclo que termina sem 🔴 fecha o gate. Se suas PRDs vinham rodando 8+
  ciclos, é isso que muda.
- **Telemetria da fase2:** o campo `--ciclos` do `stop` agora é o MAIOR ciclo entre os
  gates (não a soma); o detalhe por gate vai em `--extra`. Nada a fazer — só não estranhe
  o número menor.
- **`/prd-exec` ficou mais rápida em PRD com muitas ondas:** o despacho virou contínuo
  (task concluída libera as dependentes na hora). Nada a decidir; `--waves` segue igual.

### 2.9.0 (2026-08-02) — o front ganhou autor (dedalo + ariadne + `/mockup`)

- **Ação: nenhuma obrigatória.** Os dois agentes e a skill chegam pelo sync e entram sozinhos no
  fluxo. O que muda no dia a dia: quando a PRD tem interface, quem escreve a seção *Frontend /
  Interface* é o **dedalo** (Passo 7.1 da `/prd`) — não mais a sessão que redige a técnica. O
  michelangelo continua sendo o crítico, agora criticando um autor de verdade.
- **Decisão: modelo do dedalo.** Entrou na tabela *Agentes do harness (modelos)* do Perfil como
  `preset` (sonnet no econômico/equilibrado, opus no máximo). Ele roda **automático em toda PRD com
  UI** — se a conta é apertada, deixe `preset`; se o front do projeto é o produto (site, portal,
  app de cliente), `opus` aqui é o melhor lugar para gastar. A **ariadne** é Sonnet fixa e não entra
  nessa conta: só roda quando você pede.
- **Hábito novo: `/mockup` antes de PRD com tela nova.** `/mockup "tela de X"` gera uma maquete
  HTML navegável (abre com duplo clique, sem build) em minutos; você refina ali e só depois abre a
  `/prd`. A entrevista da `/prd` também passa a **perguntar** se quer maquete quando detecta tela
  nova — no modo TURBO ela vira a única parada do fluxo, e você foi avisado disso na pergunta.
  Não quer nunca? `HARNESS_SKIP_MOCKUP=1` no `harness.env`.
- **Novo campo nas tasks: `Tipo` (`front` / `backend`).** É ele que a `/prd-exec` lê para decidir
  quem forja — task de front vai ao dedalo, o resto ao hefesto. PRDs escritas antes da 2.9.0 não têm
  o campo e continuam funcionando: a skill cai na detecção por extensão de arquivo.
- **`/dt-exec` passou a ter gate de UX** (Passo 5.1): lote que toca tela agora é auditado pelo
  michelangelo, como já acontecia na `/prd-exec`. Antes, o caminho barato de consertar tela era o
  único sem revisor de front.
- **A `ui-ux-pro-max` agora é versionada** em `.claude/skills/ui-ux-pro-max/` (~1,8 MB, 37
  arquivos, só precisa de Python 3). Antes ela vivia em `~/.claude/skills/` — ou seja, na máquina de
  quem instalou, e em qualquer outra o design degradava **em silêncio**. **Não edite** nada nessa
  pasta (é cópia de terceiro; veja o `README-HARNESS.md` dentro dela).
- **Atenção ao criar agente novo no projeto:** o frontmatter continua sendo o ponto frágil —
  arquivo em **LF** e **sem `": "` na description** (o doctor cobra; `dos2unix` conserta).

### 2.8.0 (2026-07-31) — aba "Trabalho" (DTs e PRDs na tela, com próximo passo)

- **Ação: nenhuma obrigatória.** A aba lê o que já existe em `prds/`. Se o projeto não tem DT
  nem PRD, ela mostra "fila limpa" e pronto.
- **Confira o caminho no Perfil.** A aba usa a linha **Débitos técnicos** da seção *Estrutura de
  diretórios* para achar a pasta (`prds/debito_tecnico/` na maioria, `prds/dt/` em alguns). Se o
  doctor avisar que a pasta não existe, é o Perfil que está desatualizado — corrija lá.
- **Decisão: reconciliar o índice, se houver divergência.** O doctor agora compara o status no
  arquivo `DT-NNN.md` com a linha do `INDEX.md`. Divergiu? O **arquivo manda**. Corrija pela aba
  Trabalho (botão *Reconciliar*, com preview) — ou aceite conscientemente e siga.
- **Hábito novo: trocar status pela tela.** O seletor de status/prioridade de cada DT grava no
  arquivo **e** no índice de uma vez — é o passo que se esquecia e criava a divergência.
- **Sem `node`?** A aba avisa que precisa do bridge. As demais abas seguem funcionando em modo
  leitura, como antes.

### 2.7.0 (2026-07-31) — painel do ecossistema (tela que grava) + convenções da casa

- **Ação: nenhuma obrigatória.** Tudo chega pelo sync. A tela antiga continua funcionando; a
  nova só fica melhor quando você sobe o bridge.
- **Hábito novo: `node .claude/harness-ui.mjs`** antes de abrir a tela. Ele imprime a URL **com
  token** (sem o token as rotas de dados dão 403) e encerra sozinho após 30 min sem uso.
  Prefira chamar por `/harness-config`, que já faz isso. Sem `node` na máquina, a tela abre em
  modo somente-leitura e nada se perde — é o fluxo de antes.
- **Decisão (recomendada): preencher a seção nova "Convenções adotadas" do Perfil.** Ela diz
  quais convenções da casa este projeto já segue. Ausente = tudo `nao-adotada`, e o doctor
  passa a avisar. Marque pela tela (aba Convenções) ou por `/convencao status`.
- **Decisão (por projeto): o que fazer com a `mfa`.** Se o projeto tem login próprio e acesso a
  dado de terceiro, `/convencao portar mfa` monta a PRD com o discovery pronto. Se a autenticação
  é delegada a um IdP que já impõe MFA, marque `nao-se-aplica` com a observação — é informação,
  não pendência.
- **Atenção ao editar:** `harness-config.html` e `harness-ui.mjs` são **template versionado**
  (só o `/deus` os atualiza). Alterar num projeto-alvo = vira `EXTRA|alvo|` e some no próximo
  sync. O mesmo vale para as convenções: elas nascem no mestre.
- **O `.claude/harness-role` NÃO deve existir no seu projeto.** Ele só marca a cópia-mestre (o
  vault do Charles). Se aparecer aqui, apague — com ele, a `/convencao nova` gravaria convenções
  que o próximo `/deus` sobrescreve.

### 2.6.0 (2026-07-30) — manual vivo (/manual + fila na cauda da /prd-exec)

- **Ação: nenhuma obrigatória.** A fila (`docs/manual/_fila.md`) nasce sozinha na primeira
  `/prd-exec`; a estrutura `docs/manual/` nasce na primeira rodada da `/manual`.
- **Decisão (opcional): declarar o mecanismo no Perfil** (seção nova "Manual vivo"). Ausente =
  `arquivo` (default certo p/ quase todos). Projeto com KB própria: `kb-portal` (Portal TEF —
  a `/manual` delega a face usuário ao `/kb-tutorial`) ou `seed` (sagittarius).
- **Hábito novo: bootstrap sob demanda** — `/manual <modulo>` gera o manual inicial de um
  módulo existente; vale começar pelos 2-3 módulos mais usados do projeto em vez de tentar
  cobrir tudo de uma vez.

### 2.5.0 (2026-07-30) — ciclos base 2 + escalada, 2.9 paralela, /harness-report, cache de discovery

- **Ação: nenhuma obrigatória** — tudo chega pelo sync e é automático.
- **Decisão: conferir o novo default de ciclos.** Preset agora é BASE (economico 1 ·
  equilibrado 2 · maximo 3) **+ escalada de +1 só se o loop estiver convergindo**. Projeto que
  precisa do comportamento antigo: declare o número explícito no Perfil (limite duro, sem
  escalada) — ex.: `Ciclos do beholder: 4`.
- **Hábito novo (recomendado): `/harness-report --all` 1x/mês** (do vault) — é o alarme de
  regressão de custo que faltava. O cache de discovery (`prds/_discovery-cache/`) é versionado;
  nada a configurar.

### 2.4.0 (2026-07-30) — a versão da velocidade (entrevista única, refino em Sonnet, acceptance sem hefesto, PERFIL-RESUMO)

- **Ação (uma vez, por repo): gere o `.claude/PERFIL-RESUMO.md`.** Peça na sessão: *"gere o
  PERFIL-RESUMO.md a partir do meu PERFIL-PROJETO.md, seguindo o template da cópia-mestre"*
  (~2 KB, só os fatos operativos). Sem ele nada quebra (os subagentes caem no Perfil completo),
  mas o corte de tokens/latência — ~30 subagentes por ciclo deixam de reler 22 KB cada — só
  acontece com o resumo criado. **Regra nova:** quem editar o Perfil atualiza o resumo na mesma
  passada (a última task de toda PRD nova já cobra).
- **Decisão: conferir os novos defaults** (todos têm opt-out):
  - `/prd` agora roda em modo **TURBO** por default (entrevista única no início + UM aceite no
    final, Passo 11). Quer manter a parada no aceite da PRD de produto? Escolha CLASSICO na
    entrevista.
  - **Roadmap HTML da Fase 4 virou opt-in** — só gera com `Skip HTML Roadmap = Nao` explícito
    na PRD. PRDs antigas sem o campo deixam de gerar o HTML.
  - **Ciclos 2+ de review/gates rodam em Sonnet** mesmo com preset máximo (opt-out no Perfil:
    "Modelo ... nos ciclos de refino: opus").
  - A task de **acceptance não vai mais a hefesto** — a sessão pai roda os specs direto (era
    verificação em dose tripla, 50-85 min de subagente descartado).
- O resto chega pelo sync: entrevistas únicas nas 3 skills (`/prd` 0.1, `/prd-exec` 0.3,
  `/dt-exec` 1.4), tasks por contrato (código completo só em componente de risco), hooks RAG
  com early-exit e watchdog portável no revisor externo (Windows/Git Bash deixava o Codex sem
  teto de tempo).

### 2.3.0 (2026-07-24) — agente invisível detectado + execução proporcional (cauda paralela, mini-lote, teto de ciclos)

- **Ação (uma vez, por máquina/repo): rode `bash .claude/harness-doctor.sh`.** Se ele acusar
  **agente INVISÍVEL** (CRLF + `: ` na description — o host descarta o agente em silêncio e as
  skills caem em `general-purpose` sem avisar), rode `dos2unix .claude/agents/*.md`. O
  `.gitattributes` novo em `.claude/agents/` (viaja no sync) impede o checkout de re-CRLFar.
  Incidente real: hefesto/michelangelo/peter-quill invisíveis em ~20 projetos, 21-24/07/2026 —
  execuções de PRD a 2-3h com executor errado e ninguém avisado.
- **Decisão: nenhuma.** O resto chega pelo sync e é comportamento automático: fallback de agente
  agora é **barulhento** (aviso imediato + contrato colado no prompt + registro no Output);
  `/prd-exec` paraleliza a **cauda de fechamento** (roadmap HTML via subagente); `/dt-exec` tem
  regime de **mini-lote** (≤2 itens: 1 ciclo de review, revisor externo com teto de 300s, beholder
  enxuto); `/prd` ganhou **teto anti-degeneração** nos gates (5º ciclo ou reescrita repetida da
  mesma task → intervenção humana). Flag nova opcional: `HARNESS_EXTERNAL_REVIEW_TIMEOUT`
  (`harness.env`, default 600s — só ajuste se o revisor externo estoura/sobra cronicamente).

### 2.2.0 (2026-07-21) — fechamento documental com gate (`/dt-exec` e `/prd-exec`)

- **Ação: nenhuma.** Chega pelo sync; nenhum campo novo no Perfil nem no `harness.env`.
- **O que muda na prática:** fechar DT deixou de ser instrução e virou **gate executável**. A
  `/dt-exec` (Passo 7.7) e a `/prd-exec` (Fase 1.4.6) agora **rodam um `grep` e colam a saída
  bruta** provando que o status bate nas **duas pontas** (arquivo do DT *e* INDEX) antes de
  declarar o trabalho concluído. Motivo: no LOTE-001 real, 2 de 3 DTs foram commitados e
  pushados ainda como `Pendente` — o INDEX estava certo e mascarou o drift.
- **Seu INDEX de DTs vai ganhar duas seções novas** na primeira vez que um lote fechar:
  **"Legenda de Status"** (explica `Resolvido (PRD-NNN)` e `Resolvido (LOTE-NNN)`) e
  **"Lotes de DT"** (uma linha por lote, com DTs resolvidos, o que foi ejetado e link para o
  documento). Antes disso, `Resolvido (LOTE-001)` aparecia no índice sem nada explicando o que
  era LOTE-001 nem onde achá-lo. Modelo em `prds/_templates/TEMPLATE-INDEX-DT.md` (novo, viaja
  no sync) — dá para copiar as duas seções na mão a qualquer momento.
- **Hábito que isso encerra:** relatar "INDEX atualizado: OK" sem prova. A régua agora é a mesma
  da verificação técnica — rodar o comando e colar a saída.

### 2.1.0 (2026-07-19) — skill nova `/dt-exec` (lote de DTs)

- **Ação: nenhuma obrigatória.** A skill chega pelo sync e o stub do Codex vem junto (gerado).
  Nenhum campo novo no Perfil, nenhuma flag nova no `harness.env` — os limites saem do preset.
- **Decisão (quando usar):** DTs **Pequenos** acumulados no `prds/debito_tecnico/INDEX.md`, de
  preferência do mesmo módulo → `/dt-exec` agrupa num LOTE, escreve uma mini-spec e executa.
  DT grande sozinho continua sendo `/prd`; incidente urgente em produção continua sendo correção
  direta + `/codex-review` (a `/dt-exec` pressupõe calma e agrupamento, não pressa).
- **O que ela NÃO faz por você:** item que exige migration, toca integração com efeito colateral,
  muda contrato de API ou tem decisão de design em aberto é **ejetado do lote e vira PRD**. Isso é
  a skill funcionando, não uma limitação — e o motivo fica registrado no DT.
- **Hábito novo que ajuda muito:** preencher a **Estimativa de esforço** e os **Arquivos e tabelas
  relacionados** ao registrar um DT (`/dt`). São os dois campos que a seleção usa para montar um
  lote coeso; sem eles a skill infere e te pergunta no aceite (funciona, mas você trabalha mais).
- **Rastreabilidade:** DT resolvido em lote vira `Resolvido (LOTE-NNN)` no arquivo **e** no INDEX,
  no mesmo commit da correção. O `TEMPLATE-DT.md` foi generalizado para aceitar `LOTE-NNN`.
- **Commits:** a skill redige **uma mensagem por item** (nunca commita) — revert cirúrgico.

### 2.0.0 (2026-07-17) — harness multi-AI (Claude Code + Codex)

> **Contexto:** o harness agora roda em Claude Code, em Codex CLI, ou nos dois. A fonte
> canônica continua `.claude/` (skills/agentes); a superfície Codex são adapters finos
> gerados (`AGENTS.md`, stubs `.agents/skills/`, `.codex/`). A tabela de equivalências
> vive em `.claude/PLATAFORMAS.md`. **Ação obrigatória: NENHUMA para quem fica só no
> Claude — retrocompatibilidade total.**

- **Decisão: `HARNESS_TARGETS` no `harness.env`.** `claude` é o default — nada muda.
  Adicionar `codex` (ou `claude,codex`) faz o próximo `harness-sync.sh --apply
  --target codex|all` instalar `AGENTS.md` + `.agents/` + `.codex/` no repo.
- **Ação (host Codex): confiar o projeto e aprovar os hooks.** O `.codex/hooks.json` só
  carrega com o projeto *trusted* (`trust_level` no `~/.codex/config.toml`) e cada hook
  exige aprovação por hash via `/hooks` — **TODA atualização de hook re-pende o trust**
  (o doctor avisa). É decisão humana por máquina; o harness nunca auto-confia.
- **Atenção: `AGENTS.md` e `.codex/hooks.json` têm o marcador `harness:managed`.** Se o
  projeto já tiver um `AGENTS.md` próprio, o sync **NÃO sobrescreve** — sai a linha
  `CONFLITO|guardado|...` e o local é preservado. Mesclar é manual: mova o conteúdo
  próprio para o Perfil/`CLAUDE.md` (e deixe o sync assumir o arquivo), ou remova o
  marcador e assuma você a manutenção manual dele dali em diante.
- **Decisão (review): confira `HARNESS_EXTERNAL_REVIEWER`** (`auto` resolve pelo host —
  Codex revisa no host Claude; `claude -p` revisa no host Codex). Sem CLI externo, o
  review roda e é **registrado como modo solo** — nunca descrito como dupla-cega.
- **Decisão (RAG): provider `codex-cli` disponível** em `HARNESS_RAG_LLM_PROVIDER`
  (junto de `claude-cli`/`anthropic`/`mock`/`disabled`). Privacidade documentada:
  embeddings continuam locais; o **resumo envia o transcript ao provider configurado**
  (Anthropic OU OpenAI) — escolha ciente disso.
- **Ação (opcional, host Codex): gerar as rules** com
  `bash .claude/harness-doctor.sh --gen-rules` — converte a tabela "Execução autônoma"
  do Perfil em `.codex/rules/` (Starlark, **experimental**; revise antes de salvar).

### 1.9.0 (2026-07-09) — resiliência à indisponibilidade do classificador do auto mode

> **Contexto:** o classificador de permissão do auto mode (remoto, não configurável) pode
> ficar indisponível e negar TUDO em fail-closed — a sessão espirala re-tentando (incidente
> real: exec da PRD-007 do aec-backend, 09/07/2026). A 1.9.0 reduz a dependência dele
> (allowlist estreita) e corta a espiral (hooks novos + protocolo nas skills).

- **Wirings novos ×3 no `settings.json` (ação OBRIGATÓRIA — o sync não propaga settings.json):**
  copie da cópia-mestre os blocos `PermissionDenied` (→ `denied.sh`, hook novo), `PostToolUse`
  matcher `Bash` (→ `guard-bash.sh --post`) e `PostToolUseFailure` matcher `Bash` (idem).
  Sem os dois `--post`, o anti-espiral fica **dormente** (fusível de segurança); sem o
  `PermissionDenied`, negação do classificador não gera alerta nem protocolo. O doctor
  `--autonomia` confere os três.
- **Gere a allowlist ESTREITA do projeto (ação):** preencha a seção nova do Perfil
  ("Execução autônoma — comandos conhecidos-seguros") e rode
  `bash .claude/harness-doctor.sh --gen-allowlist`; revise e cole o bloco no
  `.claude/settings.json`. **A6 foi CORRIGIDO:** prefixo largo de interpretador é suspenso
  em auto mode — não protege a execução autônoma (ver A6).
- **Flags novas** — os defaults já vêm EMBUTIDOS nos hooks (funcionam mesmo sem entrada no
  `harness.env`, que é local e NÃO viaja no sync): `HARNESS_GUARD_SPIRAL` ('1'),
  `HARNESS_GUARD_SPIRAL_N` ('3'), `HARNESS_GUARD_SPIRAL_WINDOW_MIN` ('15'),
  `HARNESS_MAX_ACTIVE_SESSIONS` ('2') + bypasses `HARNESS_SKIP_GUARD_SPIRAL`/
  `HARNESS_SKIP_DENIED`. **Ação (opcional):** copie o bloco "RESILIENCIA AO CLASSIFICADOR"
  do `harness.env` da mestre p/ o seu, só se quiser customizar/documentar.
  ⚠️ A tela `/harness-config` ainda não expõe os campos novos — edite o `harness.env` direto.
- **Regra de paralelismo (decisão operacional):** máx **2 execuções autônomas simultâneas**
  por máquina — 3+ estrangulam o classificador compartilhado. O doctor avisa (best-effort).
- **Workspace trust (nota de port):** `permissions.allow` do settings.json do projeto só
  vale após aceitar o diálogo de confiança do workspace — em repo recém-clonado, abra uma
  sessão interativa antes da 1ª execução autônoma.
- **Protocolo nas skills/agentes** (chega pelo sync): `/prd-exec` (Passo 0.2 oferece a
  allowlist na decolagem + protocolo de indisponibilidade nas Regras de Execução), hefesto
  (regra 11), sherlock (nota). Telemetria ganha `classifier_denials`/`spiral_blocks`; runbook
  de destrave no `PLAYBOOK-TELEMETRIA.md`. **Ação:** nenhuma.

### 1.8.0 (2026-07-08) — blindagem de execução autônoma + telemetria honesta

- **2 hooks novos chegam pelo sync** (`notify.sh` — alerta+log de espera humana; `guard-bash.sh`
  — bloqueia arquivo temporário fora do projeto), **MAS o wiring é local**: o `settings.json`
  NÃO é propagado pelo sync. **Ação (obrigatória):** adicione os blocos `Notification` e
  `PreToolUse` ao `.claude/settings.json` do repo (copie da cópia-mestre). O doctor avisa se
  faltar (`bash .claude/harness-doctor.sh --autonomia`).
- **Decisão: configure `HARNESS_NOTIFY_CMD`** no `harness.env` (som/toast/webhook — exemplos
  prontos no arquivo, por SO). Vazio = sem alerta; a espera segue sendo logada p/ telemetria.
  ⚠️ A tela `/harness-config` ainda não expõe os campos novos — edite o `harness.env` direto.
- **Allowlist de PREFIXO para os CLIs do Perfil** (ver A6): declare no `settings.local.json`
  entradas de prefixo p/ interpretador, cliente de banco e test runner — em vez de acumular
  "always allow" exatos. **Ação:** revise uma vez por repo/dev; o doctor passa a conferir.
- **Telemetria ganhou campos novos** (`ts_start`, `out_tps`, `max_gap_min`, `wait_human_min`,
  `permission_prompts`, `elapsed_active_s`, `waves`) e **aviso automático de provável espera
  humana** no fechamento. Linhas antigas do `harness-runs.jsonl` não têm os campos — histórico
  misto é normal. **Ação:** nenhuma.
- **`/prd-exec`:** Passo 0.2 novo (pre-flight de autonomia — roda o doctor `--autonomia` antes
  de decolar e devolve a decisão ao usuário) + **paralelismo por ondas virou o default
  explícito** da Fase 1.3 (sequencial = exceção com dependência declarada). **Ação:** nenhuma.
- **Regra de arquivos temporários** (scratchpad, nunca `/tmp` nem `/arquivo`) embutida no
  hefesto/sherlock, nas skills e como **regra fixa** na seção Armadilhas do Perfil. Perfis já
  portados: copie o item novo da seção "Armadilhas do projeto" do `perfis/generico.md`.
- **Playbook forense novo:** `.claude/PLAYBOOK-TELEMETRIA.md` ("a PRD demorou demais") — leia
  ANTES de mexer em preset/modelo por causa de duração. **Ação:** nenhuma (chega pelo sync).

### 1.7.0 (2026-06-23) — /prd-exec sugere renomear a sessão (Exec-PRD-NNN)

- **Ação: nenhuma.** Transparente. Ao rodar `/prd-exec`, na Fase 1.1 a skill passa a exibir um
  `/rename {repo}-Exec-PRD-{NNN}` pronto para colar (rotula a janela na lista do `/resume`). É
  **opcional** — o Claude Code não renomeia a sessão sozinho no meio dela (`sessionTitle` só no
  `SessionStart`; `/rename` é manual), então o comando vem mastigado pra você dar um enter.

### 1.6.0 (2026-06-17) — modo crítico de review (ciclos focam só nos 🔴)

- **Novo default: review só mira o vermelho.** O piso `HARNESS_REVIEW_SEVERITY_FLOOR='critico'`
  (em `harness.env`) faz beholder/michelangelo/sherlock detalharem e travarem **só 🔴**; 🟠/🟡/🔵 viram
  observação/backlog sem aceite nem ciclo. **Nenhum revisor é desligado** — a dupla-cega Codex +
  sherlock segue rodando como antes.
- **Decisão (por projeto):** quanto rigor a conta/criticidade pedem? Mantenha `critico` (rápido) na
  maioria; em projeto de alto impacto, suba para `tudo`/`alto` no Perfil → "Codex review" → "Piso de
  severidade do review" (ou direto no `harness.env`).
- **Ação:** nenhuma obrigatória — defaults aplicam no próximo `/prd`/`/prd-exec`/`/codex-review`. Os
  agentes seguem investigando por todas as lentes; muda só o que é detalhado/travado.

### 1.5.1 (2026-06-16) — robustez do resumo do RAG (a captura para de morrer no timeout)

- **O resumo do RAG ganhou timeout maior/configurável (120s→180s), retry com backoff e um sinal de
  FALHA distinto no log.** **Decisão:** nenhuma — defaults seguros, sem campo novo no Perfil.
  **Ação:** só nos projetos com **RAG ligado** e muitos subagents (`/prd`): confirme
  `HARNESS_RAG_CAPTURE_AGENTS='0'` no `harness.env` (default do mestre desde 1.3.0) — sem isso a
  rajada de `claude -p` por-agent estoura o timeout. Tunáveis novos (opcionais):
  `HARNESS_RAG_SUMMARIZE_TIMEOUT_MS` (180000), `HARNESS_RAG_SUMMARIZE_RETRIES` (1).
- **O `rag.log` agora separa `FALHA no resumo` (LLM timeout/indisponível) de `nada relevante`
  (resumo OK, sem aprendizado técnico).** **Ação:** nenhuma — ajuda a flagrar captura perdida.
- **Por quê:** a destilação leva ~50–77s; sob carga passava dos 120s fixos e o aprendizado se perdia,
  mascarado como "nada relevante". Não era custo/billing do `claude -p` (testado, OK).

### 1.5.0 (2026-06-16) — `/prd` em duas fases (aceite humano no meio)

- **A `/prd` agora para após a PRD de produto e exige aceite explícito** para seguir ao detalhamento
  (PRD técnica + tasks + PROMPT-EXECUCAO + gates). **Decisão:** nenhuma — comportamento automático,
  sem campo novo no Perfil nem flag. **Ação:** nenhuma; só saiba que a skill vai **parar** depois da
  PRD de produto e pedir o seu "ok".
- **A Fase 2 é retomável em sessão nova:** se você não aceitar na hora, rode `/prd` de novo (mesma ou
  nova janela) e ela detecta a PRD pendente e continua — ou use `/prd continuar PRD-NNN`. A Fase 1
  grava `prds/PRD-NNN-<nome>/_discovery.md` para a Fase 2 não refazer o discovery. **Ação:** se você
  versiona `prds/`, o `_discovery.md` viaja junto (é rastreabilidade; pode apagá-lo após a Fase 2).
- **Telemetria virou por fase** (`PRD-NNN-fase1` / `PRD-NNN-fase2` em `prds/_metrics/`). **Ação:**
  nenhuma — automática e best-effort.
- **Por quê:** validar o produto antes de gastar o grosso (evita re-escrita) e não estourar a sessão
  de contas menores num horário ruim — a parte pesada pode começar com a sessão zerada.

### 1.4.0 (2026-06-15) — gate automático de UI/UX (michelangelo)

- **O `michelangelo` passou a rodar automaticamente quando a PRD tem UI** — gate de UX no Passo 10
  da `/prd` (em paralelo ao beholder) e Fase 2.9 da `/prd-exec` (auditoria da tela construída). Antes
  era só sob demanda. **Decisão de custo:** ele agora entra no fluxo automático **das PRDs com tela**
  — se a conta é apertada, mantenha `Modelo do michelangelo = preset` (Sonnet nos presets econômico/
  equilibrado). Promova a `opus` só com limite folgado, como os outros automáticos.
- **Campo novo no Perfil — "Ciclos do michelangelo"** (seção "Agentes do harness (modelos)" →
  override de ciclos). **Decisão:** quantos ciclos de revisão de UX a conta comporta (mesma
  semântica dos "Ciclos do beholder"; `preset`/ausente = 2/3/4 conforme o preset; `0` = sem limite).
  Perfil sem o campo = `preset` (nada quebra). **Ação:** copie a linha do `perfis/generico.md` da
  mestre, ou rode `/harness-config` (a tela ganhou o campo).
- **Gate bloqueante por padrão:** 🔴 de UX impedem finalizar a PRD sem resolução ou aceite
  explícito do **usuário** (a skill nunca decide sozinha). Para pular o gate pontualmente:
  `HARNESS_SKIP_MICHELANGELO=1` (uso restrito — ex.: UI trivial já auditada à mão).
- **Ação:** nenhuma obrigatória além do campo de ciclos — o `/prd` e o `/prd-exec` passam a acionar
  o michelangelo sozinhos quando detectam trabalho de interface. Rode `/harness-config` para revisar.

### 1.3.0 (2026-06-13) — presets de esforço, telemetria, tela de config, peter-quill

- **Preset de esforço (a decisão de custo principal):** o Perfil tem a seção nova "Nível de esforço
  (preset)". **Decida:** `economico` (devs/conta apertada — tudo Sonnet, menos ciclos),
  `equilibrado` (default — equivale ao comportamento 1.2.x) ou `maximo` (julgadores em Opus,
  reasoning high). Os campos de modelo agora aceitam `preset` (herda) além de `sonnet`/`opus`.
  **Ação:** copie a seção "Nível de esforço" + a tabela de modelos atualizada do `perfis/generico.md`
  da mestre (ou rode `/harness-config`). Perfil sem a seção = `equilibrado` + campos `sonnet` — nada
  quebra.
- **Tela de configuração — `/harness-config`:** atalho visual para ver/editar o Perfil + harness.env
  com presets. **Ação:** rode `/harness-config` para revisar após este update. Adicione ao
  `.gitignore`: `.claude/.harness-run/` e `.claude/harness-config.local.html`.
- **Captura RAG por-agente: default mudou para `0`** (`HARNESS_RAG_CAPTURE_AGENTS`). **Decisão:**
  deixe `0` (recomendado — a Fase 5 do `/prd-exec` cura os desvios dos hefestos numa entrada só) ou
  suba para `1` em projeto crítico. Escolha já setada é preservada.
- **Telemetria automática:** `/prd` e `/prd-exec` gravam duração + tokens em `prds/_metrics/`.
  **Ação:** nenhuma — automático e best-effort (os tokens precisam do `node` no PATH; sem ele, só a
  duração). Versione `prds/_metrics/` (o comparativo viaja no git).
- **Novo agente `peter-quill`** (scout do discovery) e **reasoning do Codex**
  (`HARNESS_CODEX_REASONING`): chegam pelo sync. **Ação:** nenhuma — o `/prd` usa o peter-quill
  automaticamente; o reasoning segue o preset (vazio no env = comportamento histórico).
- **Carta de armadilhas de teste:** seção nova no Perfil ("Armadilhas de teste/seed (E2E)").
  **Ação:** copie do `perfis/generico.md` (vem com exemplos genéricos) e expanda com os tropeços de
  seed do SEU projeto — o `hefesto` a lê antes de escrever cada spec.

### 1.2.1 (2026-06-11) — `/prd`, `/dt` e `/prd-exec` sincronizam o repo antes de tocar o código

- **As skills `/prd` (Passo 0.2), `/dt` (Passo 0.1) e `/prd-exec` (Passo 0.1) passam a
  atualizar o repo** antes de ler ou escrever código — `git pull --ff-only` quando o working
  tree está limpo; sujo, divergente ou offline, elas **param e perguntam** (nunca descartam
  trabalho local). Em `/prd-exec` via CI/deploy o passo é pulado (o pipeline já fez checkout).
- **Decisão:** nenhuma. **Ação:** nenhuma — comportamento automático, sem campo novo no
  Perfil nem flag. Só saiba que, ao rodar essas skills, elas podem pedir confirmação se o
  repo estiver sujo ou divergente.

### 1.2.0 (2026-06-11) — política Sonnet-first

- **`beholder`, `tony-stark` e `michelangelo` deixaram de ser Opus fixo** — agora rodam
  em **Sonnet por padrão**, como sherlock/atlas. Motivo: os dois primeiros entram
  automaticamente em **toda** PRD e eram a principal causa de alto consumo de tokens.
  - **Decisão:** se você **quer** algum deles em Opus, declare no Perfil — a seção
    "Agentes do harness (modelos)" ganhou 3 campos novos (`tony-stark`, `beholder`,
    `michelangelo`). Perfil antigo sem os campos = tudo `sonnet` (nada quebra).
  - **Ação:** copie a seção atualizada do `perfis/generico.md` da mestre (ou adicione as
    3 linhas) para a escolha ficar explícita no seu Perfil.
- **Red-team do beholder agora roda em CICLOS com limite configurável** (Passo 10 do
  `/prd`): campo novo **"Ciclos do beholder"** no Perfil — default `4`, `0` = sem limite.
  Esgotou sem zerar os 🔴 → a `/prd` para e pede decisão humana (seguir aceitando os
  riscos ou abortar a PRD).
  - **Decisão:** quantos ciclos a sua conta comporta? Default `4` serve para a maioria;
    conta apertada → `2`–`3`. Perfil sem o campo = `4` (nada quebra).
- **Limite de ciclos do code review também virou configurável** (Fase 2 do `/prd-exec` +
  `/codex-review`): o campo "Limite de ciclos" (Perfil, seção "Codex review") deixou de
  ser fixo — default `4`, `0` = sem limite; na standalone, `--max-ciclos=N` vira override
  pontual. Esgotou com bloqueantes → decisão humana: seguir (bloqueantes aceitos viram
  DTs na Fase 5) ou abortar (PRD "Bloqueada").
  - **Decisão:** idem beholder — ajuste ao que a conta comporta. Perfil antigo com
    `4 (fixo)` continua valendo como `4` (nada quebra).
- **Este `ONBOARDING.md` é novo** e passa a viajar no port/sync. **Ação:** nenhuma —
  só saiba que ele existe e use a rotina da seção B nas próximas atualizações.

### 1.1.0 (2026-06-09) — dupla-cega + agentes novos

- **3 agentes novos** (`sherlock`, `atlas`, `hefesto`) chegam pelo sync. **Ação:** nenhuma
  obrigatória; o review e o `/prd` passam a usá-los automaticamente.
- **Seção nova no Perfil** "Agentes do harness (modelos)". **Decisão:** sonnet (default)
  ou opus para sherlock/atlas. Perfil sem a seção = sonnet.
- **Default de relatórios de review mudou** de `/tmp/...` para `codex-reviews/` na raiz.
  **Ação:** adicione `/codex-reviews/` ao `.gitignore` do repo.
- **`HARNESS_LINT_CMD_EXTRA`** (análise estática não-bloqueante) disponível no
  `harness.env`. **Decisão:** opcional — configure se o projeto tem phpstan/eslint.

### 1.0.0 (2026-06-02) — baseline

- Versão inicial (4 skills, hooks, perfis, templates, memória dupla, RAG opt-in). As
  decisões de instalação são as da seção A.
