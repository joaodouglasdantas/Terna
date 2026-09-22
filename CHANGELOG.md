# Changelog do harness

> O que mudou em cada versão da cópia-mestre. A versão de um repo portado está em
> `.claude/harness.env` (`HARNESS_VERSION`); o `/deus` propaga as atualizações.
> O que cada versão exige de DECISÃO/AÇÃO do dev fica em `.claude/ONBOARDING.md`
> ("Decisões por versão") — que viaja com o port.

## 3.5.7 — 2026-09-16 — nenhuma decisão do harness vive em variável local + cinco melhorias de performance medidas

**Frente A — camadas de configuração.** Inventário de 16/09: o `harness.env` do mestre tinha 75 chaves ativas e o da
Mariana 19; 58 decisões do harness (duelo, guards, pipeline, faixas, noturno, watchdog, frentes, daemon, presença…)
não existiam nos projetos e caíam no default do CÓDIGO — que divergia do mestre em quatro chaves
(`HARNESS_DUELO_TIMEOUT` 300/600, `HARNESS_OLLAMA_MODEL` auto/qwen3-coder, `HARNESS_RAG_CAPTURE_AGENTS` 0/1,
`HARNESS_TASK_MAX_LINHAS` 230/200, além de `HARNESS_RAG_ENABLED` 0/1 nos hooks de RAG); o `~/.harness.env.local` do
PC sobrescrevia a pool do duelo e o teto de frentes para todos os projetos; 14 variantes de loop de carga entre os
hooks (uns liam só o `harness.env`, outros pulavam o `~/.harness.env.local`, só três liam o `_defaults.env`) e o
`source` deixava o arquivo vencer o ambiente, ao contrário do documentado. Generalização do DT-010 (3.5.6):

1. **`hooks/_defaults.env` = TODA decisão do harness (201 chaves)**, com os comentários que viviam no `harness.env`
   e mais 33 defaults que só existiam em código. `hooks/_camadas.txt` classifica o resto: lista FECHADA de chaves
   de PROJETO (27), chaves de MÁQUINA (16, `segredo` marcado) e de AMBIENTE (kill switches), mais a lista das
   decisões cujo override é ESPERADO em alguma camada (`HARNESS_DELEGATE_MODE` na máquina, `HARNESS_VERBOSITY` no
   projeto…). O `harness.env` do mestre virou template só de projeto (16 chaves ativas).
2. **Carregador único.** `hooks/_env.sh` (bash, sem fork: `${!HARNESS_*}` fotografa o ambiente, sourceia as quatro
   camadas e devolve o ambiente por cima) e `presence.mjs loadHarnessEnv()/harnessEnvStamp()` (Node) — mesma ordem,
   mesmo resultado (suíte T2 compara o mapa inteiro). 27 hooks `.sh`, o doctor, o `noturno.sh` e 6 `.mjs` passaram a
   usar; `harness_env_origem KEY` diz a camada que define a chave. Defaults em código alinhados ao arquivo; o T8
   falha se voltarem a divergir.
3. **`harness-sync.sh`:** linhas `ENV|decisao-no-projeto|<chave>|<arquivo>|igual|difere|esperado`, `ENV|obsoleta`,
   `ENV|maquina-versionada`, `ENV|resumo`; `--apply` comenta a decisão igual ao default (marcador `[3.5.7 migrado…]`,
   `ENV|migrada`) e preserva a diferente (`ENV|override-preservado`); migrável conta como defasagem (exit 10).
   Medido nos alvos reais: Mariana 4 migráveis + 4 esperados; sagittarius 5 migráveis + **`OPENROUTER_API_KEY`
   versionada no `harness.env`**.
4. **`harness-doctor.sh`:** grupo **"Camadas de configuracao"** (via `hooks/harness-env.mjs --doctor`, uma chamada de
   node): origem resolvida de cada decisão, WARN por override inesperado e por chave desconhecida, `[info]` por
   override esperado e por decisão vinda do ambiente, **FALTA por segredo versionado** e por chave de projeto
   obrigatória ausente. Área `camadas` na matriz.
5. **`harness-ui.mjs`/`harness-config.html`:** valor RESOLVIDO e tag de origem por chave (`default do harness`,
   `projeto`, `máquina`, `ambiente`, `override do projeto`); a gravação vai à camada certa — decisão no mestre →
   `hooks/_defaults.env`; num projeto → override consciente no `harness.env` com o default anotado; chave de máquina
   → `harness.env.local`.
6. Suíte `tests/t-357-camadas.mjs` (19 casos, 61 asserções): ordem e precedência, paridade bash×mjs, decisão só no
   defaults chegando ao projeto, override e obsoleta acusadas, migração do sync, segredo versionado, teste do
   mestre (código = defaults), doctor, UI por HTTP, estático (nenhum hook lê o env por conta própria).

**Frente B — cinco melhorias de performance (provas em `prds/RELATORIO-3.5.7-2026-09-16.md`):**

7. **E6 — frente não expira com a exec viva.** `frentes.mjs`: slot sem heartbeat há mais de 45 min só cai se a
   sessão dona morreu (`sessoes.mjs --json`, consultado só quando há slot velho) ou passou o teto absoluto
   `HARNESS_FRENTES_TETO_H` (24 h); `status` marca `sessao-viva-sem-heartbeat`. `guard-agent`: TODO Agent de uma run
   viva renova o heartbeat (a Fase 2 não perde mais a vaga — 144 perdeu em review e a 140-b decolou junto).
8. **E5 — commit por task.** Passo mecânico 4a da `/prd-exec` (worktree); `guard-agent --post` cruza as tasks ✅ da
   run (`task-telemetry.mjs --fechadas <epoch>`) com o `git log` e avisa `[commit] task(s) ✅ desta run SEM commit`
   (só em `wt/*`; marcador de 15 min; incidente `commit`). 140-b: 7 tasks, 1 commit, 27 arquivos soltos.
9. **E7 — `node_modules` na worktree.** `harness-worktree.sh novo` roda `npm i --no-save` no principal quando falta
   e o `package.json` declara `@playwright/test` (`HARNESS_WT_NPM_INSTALL`), depois linka; `harness-worktree.sh
   doctor` e o doctor acusam `@playwright/test` ausente.
10. **Grafo de dependências.** `hooks/task-grafo.mjs` (níveis por caminho mais longo, largura, caminho crítico,
    gargalos, fator teórico = tasks/profundidade; faixas `TASK-001..007` expandem; prosa depois do " — " não vira
    aresta; ciclo é erro, não loop) — `task-packet.sh --check` imprime `GRAFO|…` e `GRAFO-VEREDITO|serial` abaixo de
    `HARNESS_GRAFO_FATOR_MIN` (2); `/prd` Passo 8 replaneja antes do gate; `/prd-exec` anuncia o fator no plano.
    Medido: 7 das 10 últimas PRDs da Mariana eram seriais por construção (1,5–1,8) — as mesmas que fecharam
    `limitou=dependencias` com paralelismo real 1,18–1,29 sob teto 6.
11. **Review SOLO-2 por parte.** Packet em N partes com Codex fora = um sherlock por parte (lente completa) + um de
    costura, não dois por parte (144: 6 sherlocks + michelangelo para 4 bloqueantes, 44 min de Fase 2).

**Adendo 1 — chave do OpenRouter é do PROJETO (decisão do Charles, 16/09 12:30).** `OPENROUTER_API_KEY` sai da camada
máquina e vira chave de projeto: nasce vazia no template do `harness.env` e, preenchida, viaja pelo repositório (a
equipe do projeto usa a mesma conta/limite). O `harness-sync.sh --apply` preenche o projeto a partir do
`~/.harness.env.local` da máquina quando o campo está vazio (`ENV|chave-vazia` no check, `ENV|preenchida` no apply); a
pessoal da máquina continua vencendo por cima. Deixa de ser "segredo versionado" para o doctor (o FALTA fica para
`HARNESS_BEHOLDER_TOKEN`/`HARNESS_PRESENCE_TOKEN`).

**Adendo 2 — COSTURA (incidente PRD-144, 16/09 12:30: 61 specs verdes, acceptance verde, SOLO-2 com 6 sherlocks e
michelangelo ✅ — e a fila "A abordar" inutilizável em produção por 4 defeitos de integração; hotfix `ab61d802` do
projeto, armadilhas 120–123 do Perfil).** Os gates verificavam cada task por dentro; ninguém verificava a costura, e o
dublê de símbolo de produção em spec era aceito. Seis peças, por impacto/custo:

12. **`hooks/costura-check.mjs`** (estático, ~10 s na Mariana): `window.X` lido em JS de produção tocado sem `window.X =`
    (ou alias `raiz.X =`, `Object.assign(window, {X})`, declaração de topo em script clássico ou `<script>` inline) em
    nenhum código de produção; `window.X = function/=>` em spec tocado sendo X consumido pelo produto (dublê);
    `route.fulfill`/`page.route` de endpoint que a PRD tocou (bloqueia só em spec de acceptance/gate); marcador
    "NÃO VERIFICADO"/"a integrar na TASK-N"/"TODO TASK-" em arquivo de produção tocado; `typeof window.X ===
    'function'` sem else/aviso (info). Escapes: `// costura-ok: <motivo>` na linha ou `HARNESS_COSTURA_IGNORAR` (projeto).
    Modo `--tasks`: Produz/Consome — consumo "existente" sem `arquivo:linha` provado, "TASK-N" que não lista o símbolo
    em Produz, consumo sem origem. **Medido na Mariana pós-hotfix (base `56a91534`):** 6 dublês ainda vivos em 3 specs
    da 144, o marcador "NÃO VERIFICADO" em `busca_unificada.js:17` e `window.inboxAguardandoLeadContatos` consumido sem
    publicação — o hotfix corrigiu os 4 sintomas e deixou as causas nos testes.
13. **Gate do `stop` (`harness-metrics.sh`):** `stop PRD-NNN-exec` NÃO fecha com `COSTURA-VEREDITO|bloqueia`
    (`TELEMETRIA|costura|bloqueia`, exit 3); `--costura-ok="<motivo>"` registra a decisão humana; `HARNESS_GATE_COSTURA=
    on|aviso|off`. **`review-packet.sh`** abre cada parte com a seção "Costura" (lista pronta para o sherlock);
    **`task-packet.sh --check`** imprime `COSTURA-TASK|…` da task; **`guard-write`** avisa spec de subagente que cria
    `window.X = function` (dublê) com a receita do espião real (`HARNESS_GUARD_WRITE_DUBLE`).
14. **Contrato Produz/Consome** nas tasks (`TEMPLATE-TASK` ganha as duas linhas de Metadados; hermes Modo E só aceita
    "existente" com `arquivo:linha` conferido; beholder lente 14 reprova consumo sem prova, produtora que não declara e
    acceptance sem os cenários obrigatórios); **cenários obrigatórios de integração** na task de acceptance da `/prd`
    (estado após o próximo refresh/polling e ao reabrir; item fora da primeira página; clique que chega ao destino real
    sem espião; campo novo com asserção de conteúdo); **lente 10 "Costura"** no sherlock com checklist fixo (window
    publicado, `typeof` que engole, pintura fora do render, mapa parcial como verdade global, helper em lote com
    `array_keys`) e a lente `costura` como o (N+1)-ésimo sherlock; **michelangelo Modo A 4b "uso de verdade"** (abrir
    item real, agir, esperar um ciclo de refresh, reabrir, item fora da página — com evidência); **CONTRATO-executor
    "Costura"** (publique o que consome na mesma task; guard que avisa, nunca engole; marcador é pendência de merge;
    sem dublê no spec).

Defaults novos em `_defaults.env`: `HARNESS_FRENTES_TETO_H='24'`, `HARNESS_GUARD_COMMIT_TASK='on'`,
`HARNESS_WT_NPM_INSTALL='on'`, `HARNESS_GRAFO_FATOR_MIN='2'`, `HARNESS_GATE_COSTURA='on'`,
`HARNESS_GUARD_WRITE_DUBLE='on'`, `HARNESS_COSTURA_EXCLUIR=''`; chave de projeto nova `HARNESS_COSTURA_IGNORAR`;
`HARNESS_DELEGATE_TOOLS_OFF_MODELS` esvaziado (o qwen3-coder-next saiu da pool na 3.4.25). Suítes t-354 (59), t-355
(38), t-356 (79, T21 ajustado à nova regra) e t-357 (T1–T23) verdes.

**Adendo 3 — costura na adoção (varredura `/deus` 16/09 em 16 projetos com front JS).** A "rodada única" do ONBOARDING
com `--base none` passava vazia em checkout limpo (`none` = HEAD = só o não commitado): nenhum projeto era de fato
varrido. Com o repo inteiro, ~90% dos `window-sem-publicacao` eram feature-detection de libs vendorizadas
(`webkitURL`, `ActiveXObject`, `MozMutationObserver`…) ou globais de CDN (`Zone`, `CodeMirror`, `JSZip`) — ruído que
travaria a primeira exec que tocasse um plugin. `costura-check.mjs`: **`--base all`** (árvore vazia do git = repo
inteiro; ONBOARDING passa a mandar esta); **consumo** em `plugins/`, `vendor-manual/`, `dompdf/`, `ckeditor/`, `bootstrap/`, `*.min.js` e
`*.bundle.js` não conta (a **publicação** desses arquivos continua contando — o app lê `window.Jodit` publicado por
plugin); `BROWSER_GLOBALS` ganha as APIs/prefixos de navegador e as libs de CDN medidas. Única publicação dinâmica
legítima encontrada: `window[editorVar] = editor` (`anotacoesEditor,evolucaoEditor`) em 3s-regulacao, doce-ana e
universitarias-vip → `HARNESS_COSTURA_IGNORAR` nesses projetos; e `GEOBLOQUEIO_CFG` no newportaltefnet (emitido por
`var` indentado em `<script>` inline da view — o check só reconhece `var` na coluna 0). `git()` ganha `maxBuffer`
de 256 MB: no newportaltefnet (27 mil arquivos) o `git diff` estourava o 1 MB padrão e o check passava com
`tocados=0`. t-357: 83 verdes.

## 3.5.6 — 2026-09-16 — cinco execs em paralelo numa noite: o gargalo virou o Playwright (e o duelo não estava sendo medido)

Monitor das 3 execs da noite de 15/09 (137-c, 145, 141-b — `prds/MONITOR-EXECS-2026-09-15-noite.md`, D1–D18) e das
2 da madrugada de 16/09 (144, e 140-b em criação noturna emendada com exec — `prds/MONITOR-EXECS-2026-09-16-madrugada.md`,
E1–E4), todas na 3.5.5. A 3.5.5 provou C1/C2/C6/C7/C8 em campo e a exec em `medium` fez o melhor min/task já medido
(8,4 na 137-c e 13,9 na 145, contra 28–31 na 3.5.4). O custo restante estava em outro lugar: **11 tetos de Playwright em
5 execs, todos em task que ESCREVE spec** (continuação com contador zerado, `for` de 4 rodadas contando 1, specs de
depuração fabricados pelo executor), 10 colisões de e2e-lock entre irmãos da mesma onda, uma migration renumerada por
reserva presa em worktree morta, um `git reset --soft` com executores vivos porque o Codex só via `--uncommitted`, a pool
do duelo congelada em string literal com um gemini-3.7 que ninguém mediu (DT-010) e só 32 % dos duelos virando código
(DT-011). Doze correções, todas com caso na suíte nova:

1. **Teto de Playwright por TASK e por SPEC (D5/D6/D18/E1/E2).** `guard-playwright.mjs`: o contador vive em
   `.harness-run/playwright/<TASK>.json` (a continuação herda o saldo), teto `HARNESS_PW_RUNS_MAX` (4) por spec e
   `min(4 × specs distintos, HARNESS_PW_RUNS_MAX_TASK=12)` por task; `for … do playwright test … done` e `--repeat-each N`
   contam as iterações; falha em menos de `HARNESS_PW_FALHA_AMBIENTE_S` (20 s) com cara de ambiente (ECONNREFUSED, lock,
   "No tests found", módulo ausente) é creditada no `--post`; corpo de heredoc e strings não contam como rodada nem como
   família (D16). A mensagem do teto pede a correção aplicada e o que falta reverificar — e a skill manda a pai rodar a
   última rodada ela mesma (receita de PARCIAL por teto) e dá a receita de flake da família (D18).
2. **Spec de depuração e Write fora do projeto negados no executor (D6/D7/E1).** `guard-write.sh` em subagente: `_debug*`,
   `_tmp-*`, `zz*`, `*-debug.spec.*` em `tests/` → negado (depuração é `--grep` no spec real); `file_path` fora do
   projeto e do scratchpad → negado com a receita `.claude/.harness-run/tmp/`. A sessão pai passa nas duas.
   `HARNESS_GUARD_WRITE_SPEC_DEBUG`, `HARNESS_GUARD_WRITE_FORA`.
3. **Reserva de migration não morre com a worktree (D2/B10).** `guard-migration.sh` adota reserva cujo dono não é
   checkout vivo (regrava `dono`, avisa por `additionalContext`); `harness-worktree.sh fechar` transfere `seq/*` da
   worktree ao checkout principal (`SEQ|transferida`); `doctor` lista `DOCTOR|reserva-orfa`. `HARNESS_GUARD_MIG_ADOTA`.
4. **Review externo desde a BASE (D11 + complemento do C7/D17).** `external-review.sh --base <ref>` /
   `HARNESS_REVIEW_BASE=auto`: em `wt/*` o merge-base com a main; no checkout principal o commit anterior ao start da
   run — commitado ou não, o revisor vê tudo (o Codex recebe o diff num arquivo dentro do projeto via `codex exec`;
   `review --uncommitted` só quando não há base). `--dry-run` para testes. O review grava `role=revisor-externo` no
   manifest de delegações — a run fecha com `codex=ok` e a duração real. A skill: nunca mais `git reset --soft`.
5. **`start` não sobrescreve marcador fresco (D1/B2).** `harness-metrics.sh start` de rótulo já ligado há menos de
   `HARNESS_METRICS_STALE_H` mantém epoch e origem (`TELEMETRIA|mantido`); `--forcar` reinicia.
6. **`.env` não é fonte de URL (D3).** `guard-bash.mjs` GUARDA 0b: subagente lendo `.env` (mesmo atrás de `test -f … &&`)
   é negado com o caminho certo (`worktree.env`, `db-test.sh`); a pai recebe a mesma dica por `additionalContext`.
   `HARNESS_GUARD_ENV`.
7. **Packet do executor com "6. Ambiente desta worktree" e "7. Verificações" pré-preenchidas (D3/D4/D7/D9/D16).**
   `task-packet.sh`: URL/banco/porta, `pw-storage.json`, temporários, lock E2E e teto de rodadas; comandos das
   invariantes do gate + spec da task + lint listados para o executor só colar a saída. `HARNESS_PACKET_AMBIENTE`.
8. **Miúdos medidos (D8/D9/D12/D13).** `_incidente.sh` dedup por assinatura em 600 s; `task-telemetry.mjs` lê
   `Status:`/`Veredito:` com ou sem negrito e olha o relatório ANTES do último texto; `verif_sem_prova_itens` diz QUAIS
   itens ficaram sem prova e o `guard-agent --post` os lista; `guard-agent` monta o task packet que faltou e nega uma vez
   só, já com o caminho.
9. **Pool do duelo viaja com o base (DT-010).** `hooks/_defaults.env` (versionado no mestre, sourceado antes do
   `harness.env` pelo bash e pelos `.mjs`): `google/gemini-3.8-flash` substitui o 3.7; haiku-4.5 e qwen3-coder-next saem
   dos suplentes; `harness-duelo.sh --pool [--validar]` mostra pool, origem e confere no catálogo público do OpenRouter
   (cache 24 h); o doctor acusa pool sobrescrita localmente; o teste do mestre exige que todo slug citado em código
   esteja na pool. `HARNESS_DUELO_SERIAL_NOVATO_MIN`/`_AMOSTRA` existem, desligados (escopo B).
10. **Aproveitamento real do duelo (DT-011, parte mecânica).** O contrato do executor exige `**Diff do duelo:** aplicado |
    parcial | reescrito (motivo) — <id>`; `guard-agent --post` grava o evento `aplicado` (ou cobra a linha);
    `harness-duelo.sh --placar` mostra `usado/venceu/disputou/desconhecido` e custo por diff USADO. Themis-solo no W.O. e
    o prompt do worker por trecho ficam propostos no relatório.
11. **Codex em limite é da máquina (D17, parte mecânica).** O preflight grava `~/.harness-run/codex-limite.json`; todo
    preflight `codex-cli` de qualquer projeto responde `limite-ate` sem pingar até lá (e replica no `.status` local);
    `doctor-cached` avisa. O orçamento diário fica proposto.
12. **e2e-lock: espera em vez de colisão (D4, escopo B).** `guard-playwright` Regra C atrás de
    `HARNESS_PW_LOCK_ESPERA='on'` (default off): lock vivo → nega sem contar e devolve
    `until [ ! -f <lock> ]; do sleep 5; done; <comando>`. A espera dentro do `adquirirLockExecucao()` do projeto Mariana
    fica como DT do projeto.

Suíte: `node tests/t-356-madrugada.mjs` (24 casos, 78 asserções); `t-354` e `t-355` seguem verdes. Relatório por item
(arquivo:linha, prova, melhoria esperada, como validar) em `prds/RELATORIO-3.5.6-2026-09-16.md`. Ficam para a 3.5.7:
B1 (auto-start no daemon), B5 (`grande-ok` por PRD), B14, B15, orçamento diário do Codex, themis-solo, prompt do worker
por trecho, Perfil da Mariana (linhas 92/94 do RESUMO).

## 3.5.5 — 2026-09-15 — quatro criações em paralelo mostraram o que a telemetria não via: esforço, delegações, vereditos

Monitor de 4 `/prd` simultâneas no PC do Charles (`prds/MONITOR-EXECS-2026-09-15.md`, C1–C12). A 3.5.4 provou a reserva
atômica de número, o auto-start da criação, a espera humana medida e o `prd-validacao-check` em 4/4 — e as quatro
fecharam em 33–57 min. Mas as quatro rodaram em `xhigh` com alvo `high` sem ninguém saber, um auto-start ligou um
cronômetro de EXEC numa criação, três fases 1 com Codex gravaram paralelismo 0,05–0,15 e dois beholders aprovados
viraram `⛔` na telemetria. Doze correções, todas mecânicas:

1. **Esforço real descoberto pelo hook (C1).** `esforco.sh` sem `--atual` sobe a cadeia de processos até o `claude.exe` e
   lê `--effort` (Windows: 1 PowerShell, ~250 ms; mac/linux: `ps`); a saída ganha `atual_origem=flag|env|processo|n/d` e o
   `esforco.env` também. `sessoes.mjs` grava `esforco`/`modelo` por pid. Skills `/prd` e `/prd-exec`: o passo deixa de
   depender de `get_session`, é obrigatório em qualquer rito, e `AJUSTAR` com humano na tela pergunta uma vez.
   `HARNESS_ESFORCO_AUTODETECT`, `HARNESS_ESFORCO_CMDLINE` (teste).
2. **Auto-start não erra mais a skill (C2).** Casamento solto por POSIÇÃO (a skill citada primeiro vence) em vez de
   `prd-exec > dt-exec > prd`; novo `PreToolUse` com matcher `Skill` (`harness-metrics-auto.sh --skill`) lê
   `tool_input.skill`/`args` — a forma inequívoca no Desktop — e remove marcador de outro tipo ligado pelo prompt há
   < 15 min; `start PRD-NNN-fase1` apaga `PRD-NNN-exec` do auto-start (< 6 h); o marcador passa a dizer `origem`
   (`auto-prompt`/`auto-skill`). O hook `Skill` entra pelo bloco `hooks` do `settings.json`, que o sync propaga desde a
   3.4.12 (`SETTINGS|hooks|atualizado`); projeto com hooks locais preservados adiciona à mão (ver ONBOARDING).
3. **Delegações contam como trabalho (C7).** `stop` soma `duration_s` das linhas de `prds/_metrics/delegations/*.jsonl`
   com o rótulo-base da run e `ts` na janela em `subagent_busy_min`/`subagent_measured`, preenche `codex=ok` e anota
   `delegacoes=N (Ss)` no extra.
4. **Veredito do gate lido da linha certa (C8).** `task-telemetry.mjs` `statusDoRelatorio()`: 1º emoji da linha
   `**Veredito:**`/`**Status:**` (ignorando alternativas `|`/`·`), senão o texto sem linhas de legenda; templates de
   beholder/michelangelo/sherlock pedem só o veredito escolhido.
5. **MODO LEVE não pula esforço nem ROTA (C5).** Passo 1.5 da `/prd` diz isso; `guard-agent` AVISA (additionalContext)
   `general-purpose`/`Explore`/`Plan` despachado durante uma skill do harness (`HARNESS_GUARD_AGENT_CATALOGO`).
6. **Prompt congelado não re-entrevista (C4).** Passo 0.1: "não re-entrevistar"/stub congelado = defaults em tudo, só
   pergunta o que o discovery contradisse (1 pergunta, ≤ 3 itens).
7. **Locks não ficam órfãos (C6/C11).** `fechar` aceita dono `<repo>--wt-<rot>` OU `<rot>` (lock feito com `--por`);
   `stop` libera locks deste checkout criados após o start (checkout principal).
8. **Aviso "paralelismo cego" só em run de exec (C9).**
9. **`bash -n` antes de executar comando multi-linha (C10).** `guard-bash.mjs` nega erro de sintaxe com a linha do bash e a
   receita Write + `bash arquivo.sh` (`HARNESS_GUARD_BASH_SINTAXE`).
10. **Write com marcador de conflito é negado (C12).** `guard-write.sh` (`HARNESS_GUARD_WRITE_CONFLITO`).
11. **`/prd` termina no aceite (B3).** Passo 11: nunca emenda `/prd-exec` na mesma sessão; se mandarem, pede `/effort medium`.
12. `HARNESS_REVIEW_MAX_CICLOS` documentado no `harness.env` (o código sempre leu com default 3).

Suíte: `node tests/t-355-criacoes.mjs`. Ficam para a 3.5.6 (nota da noite de 14/09): B1 auto-start no daemon, B5/B10/B4
estado preso por checkout, B18 reamostrar vivos por onda, B12/B13 teto por spec.

## 3.5.4 — 2026-09-14 — o que a primeira tarde com a 3.5.3 mostrou: os freios novos fabricavam PARCIAL

Monitor de 4 execuções paralelas no PC do Charles (`prds/MONITOR-EXECS-2026-09-14.md`, 17 achados). A 3.5.3 entregou a
velocidade: PRD-139-b 109 min e PRD-143 131 min para 9 tasks cada (142-b: 319), raciocínio dos executores 67–68 % (83).
Mas 5 dos 7 PARCIAL da tarde foram fabricados pelo contador de rodadas, 14 de 14 despachos com Playwright caíram num
falso positivo, e duas execs rodaram em `medium` com a telemetria dizendo `high`. Sete correções, todas mecânicas:

1. **`guard-playwright.mjs` sem falsos positivos.** Regra B ignora redirecionamento (`2>&1`, `>arq`, `2>/dev/null`);
   Regra A só conta comando que EXECUTA teste (`TESTE_RE` perde a alternativa solta `.spec.js` — `rm`, `grep -n`,
   `node --check`, `node -e` citando o spec não contam); rodada que o lock de E2E do projeto recusou volta ao contador
   (`creditarRodada`, no `guard-bash --post`, marca `HARNESS_PW_LOCK_MARCA` = `[e2e-lock]`); e o `checkPlaywright`
   passou a rodar DEPOIS da GUARDA 0 (leitura negada não consome rodada).
2. **Esforço por fase de verdade.** Skills `/prd-exec` e `/dt-exec`: nunca `set_session_effort self` (o Desktop recusa);
   após o `/effort` do usuário, reler `get_session self` e regravar `esforco.env`; `stop --esforco-final=<nivel>` grava
   o esforço efetivo. `guard-agent.sh` nega o 1º hefesto/dedalo sem `esforco.env` com `fase=executar` desta decolagem
   (`HARNESS_GUARD_ESFORCO='on'`); o `stop` ignora `esforco.env` gravado antes do start da run.
3. **Semáforo que enfileira.** Mensagem do `guard-agent` e das skills: com `FRENTES CHEIAS` a resposta padrão é
   `frentes.mjs wait` em background e encerrar o turno; "implementar direto na sessão pai" só se o usuário pedir com
   essas palavras. `carga-maquina.sh`: com `CARGA|alta` (3+ outras frentes) o teto de vivos cai para
   `HARNESS_PIPELINE_MAX_VIVOS_ALTA` (3). Regra de espera única nas skills: nada de `sleep`/`ScheduleWakeup`.
4. **Fôlego que não pune leitura.** `guard-folego.mjs` conta Read/Grep/Glob com `HARNESS_FOLEGO_PESO_LEITURA` (0,5) e
   grava `n_leitura`/`n_escrita` no `folego.jsonl` e no incidente. Teto segue 100/90.
5. **Telemetria que nunca mente.** `harness-metrics.sh stop`: marcador mais velho que `HARNESS_METRICS_STALE_H` (24 h)
   é recusado e apagado (`--forcar-stale` grava); sem marcador, o início vem do transcript da sessão
   (`origem_start=transcript`, nunca `ts_start=null` quando há transcript); `esforco.env` de outra decolagem é ignorado.
   `harness-metrics-auto.sh`: lê a skill pelo cabeçalho do prompt (`<command-name>`/"Base directory for this skill"),
   substitui marcador velho e loga toda decisão em `.harness-run/metrics-auto.log`. `guard-agent`: o resgate do
   cronômetro olha o marcador DESTE rótulo, não "qualquer .json".
6. **Caminhos coerentes com as guardas.** GUARDA 1 do `guard-bash` libera o scratchpad da sessão
   (`/claude/<x>/<y>/scratchpad/`); `harness-doctor` acusa `HARNESS_CODEX_REPORTS` fora do projeto;
   `harness-worktree.sh criar` copia `pw-login.mjs`/`pw-storage.json` (`HARNESS_WT_COPIAR_RUN`) para a worktree.
7. **`reservar DT|LOTE` acha a pasta certa.** `dts_dir()` (`HARNESS_DTS_DIR` ou `prds/debito_tecnico` |
   `prds/dt` | `prds/dts` com INDEX.md); sem pasta, morre sem consumir número (antes devolvia DT-1).

**Hotfix 3.5.4b (14/09 22:20, medido na rodada da noite):** `guard-agent.sh` passa a identificar a task do despacho pelo
packet citado no prompt (`packets/DT-593.packet.md`), depois pela `description`, e só então pelo primeiro rótulo do texto —
o "Contexto" colado no prompt cita o DT de origem (DT-592) e o guard exigia o packet errado para o lote inteiro
(`prds/MONITOR-EXECS-2026-09-14-noite.md`, B6). Caso T11 na suíte.

**Hotfix 3.5.4c (15/09 01:10):** `motivoFamilia` trata o `&` de background (`… > log 2>&1 &`) como fim dos argumentos —
era negado como "diretório/família (&)" (B16 da nota da noite).

Suíte: `node tests/t-354-freios-monitor.mjs` (59 casos). Suítes anteriores ajustadas à nova pré-condição: `t-3434`
(esforco.env no sandbox), `t-3423` (marcador recente em vez de epoch 111 — o velho agora é substituído),
`t-3422` (`HARNESS_FOLEGO_PESO_LEITURA='1'` para provar a mecânica do teto). Conhecido e fora desta versão: `t-3425`
acusa o bloco "Esforco da sessao — fase…" repetido em `codex-review`, `manual` e `dt` desde a 3.5.3 (deduplicar).
Daemon de hooks: reiniciar após o sync (hash dos hooks muda; `--ensure`).

## 3.5.3 — 2026-09-14 — a PRD-142-b levou 5h19 com 9 tasks: sete freios de parede + esforço por papel e por fase (publica também a 3.5.2)

Análise completa em `prds/ANALISE-PRD-142-b-EXEC-2026-09-13.md`. Resumo medido (12/09, dra-mariana-duarte, 3.4.34):
319 min de parede, paralelismo 1,74, **74 min sem nenhum subagente vivo**, 2,73M tokens de saída dos quais
**~83% eram raciocínio invisível** (esforço `high` herdado por todo subagente), e a telemetria dizia 1,08M
tokens/56 tok/s na pai quando o real era 454k/24 (usage somado por bloco de conteúdo). O esforço fica para
decisão à parte; esta versão implementa os freios mecânicos:

1. **Teto de vivos dinâmico** (`carga-maquina.sh`): `CARGA|vivos|N` sai sempre — 6 folgado
   (`HARNESS_PIPELINE_MAX_VIVOS_FOLGADO`), 4 com 2+ frentes (piso `HARNESS_PIPELINE_MAX_VIVOS`), 2 com spawn
   LENTO. A TASK-006 esperou 43 min por vaga com a máquina vazia.
2. **PARCIAL libera e não é da pai** (`/prd-exec` 1.3 item 2): PARCIAL/PARCIAL-TEMPO com código pronto sobe os
   `[requires]` no mesmo turno e a complementação vai a um executor novo. A pai completou 2 tasks sozinha por
   30 min e segurou outras 2 por 30–50 min.
3. **`grande-ok` é um por PRD** (`guard-agent.sh`, `HARNESS_GRANDE_OK_MAX`, default 1): o 2º marcador da mesma
   PRD é negado com o RE-FATIAR na cara. Os 3 `grande-ok` da PRD-142-b foram as 3 tasks de 49–59 min. Fôlego:
   o mestre continua 90; o `harness.env` avisa que esticar o fôlego para caber a task inverte a régua.
4. **Rédea de teste por hook** (`guard-playwright.mjs`, dentro do `guard-bash`; `HARNESS_GUARD_PW`,
   `HARNESS_PW_RUNS_MAX` default 4): executor não roda família/suíte/glob, e a 5ª rodada de teste no mesmo
   despacho é negada → PARCIAL com o log. 126 rodadas de Playwright (60 min) na PRD-142-b. Regra 8 do hefesto
   e "Teste com rédea" do dedalo.
5. **Partes de review nominais** (`review-packet.sh`): cada parte abre com "ARQUIVOS DESTA PARTE" e o script
   imprime `PACKET-REVIEW-PARTE|n/N|<arquivo>|<lista csv>`; a pai monta o prompt copiando a lista e exige
   `Cobertura: N/N`. O ciclo 2 da PRD-142-b atribuiu arquivos às partes por suposição e custou um 4º sherlock.
6. **"Trivial" tem definição** (`/prd-exec` 2.5 item 5): até 3 `Edit`, sem rodar spec e sem investigar; o resto
   é despacho. A pai gastou 41 min sozinha (armadilha de teste DT-318, red-green, 2 famílias).
7. **Telemetria por mensagem única** (`harness-metrics.mjs/.sh`, `task-telemetry.mjs`): usage e turnos
   deduplicados por `message.id` (série anterior a 13/09 inflada ~2,4× na pai); campos novos
   `tokens_thinking_pct`, `tokens_thinking_pct_subagents`, `vivos_max` (flag `--vivos-max`); run com tasks sem
   `--vivos-max`/`--limitou` recebe ⚠️ no stop. Dicionário em `prds/_metrics/README.md`.

8. **Esforço por PAPEL e por FASE** (decisão do Charles, 13/09 — "dois tipos de preset: pensar e executar").
   Duas camadas, porque o esforço é da sessão e todo subagente herda, salvo `effort:` no frontmatter:
   - **Por papel (mestre, viaja com o port):** `hefesto` e `dedalo` ganham `effort: medium` fixo (envelope
     fechado: packet, contrato, invariantes); `sherlock`, `beholder` e `michelangelo` ganham `effort: high`
     fixo (julgamento). Executor fica imune a uma sessão esquecida em `high`; juiz fica imune a uma exec em
     `medium`. `ariadne`/`hermes`/`themis`/`peter-quill`/`prometeu` já eram `medium` (3.4.25).
   - **Por fase (Perfil → "Nível de esforço"):** a linha "Esforço da sessão" vira duas — **fase pensar**
     (`/ideia` `/dt` `/prd` `/mockup` `/dt-sweep` `/convencao`: economico/equilibrado `high`, maximo `xhigh`)
     e **fase executar** (`/prd-exec` `/dt-exec` `/codex-review` `/manual`: economico/equilibrado `medium`,
     maximo `high`), com override fino por fase; a tabela ganha "sherlock — ciclo 1 na fase executar: opus
     no equilibrado" (modelo compensa esforço). Hook novo `hooks/esforco.sh <fase> [--atual <nível>]` resolve
     o alvo e devolve `ESFORCO|fase|alvo|atual|ok|AJUSTAR`; as 9 skills leem o esforço REAL da sessão por
     `mcp__ccd_session_mgmt__get_session {session_id:"self"}` (campo `effort` — confirmado no Desktop; no CLI,
     `CLAUDE_CODE_EFFORT_LEVEL`) e, se divergir, pedem `/effort <alvo>` UMA vez na decolagem (a sessão não
     pode mudar o próprio esforço: `set_session_effort` recusa `self`); modo autônomo/noturno anuncia e segue.
     O `stop` grava `esforco=alvo/atual` na run e avisa ⚠️ quando a exec rodou acima do alvo. Knob
     `HARNESS_ESFORCO_GATE`. `perfil-doctor` cobra as duas linhas novas do Perfil.

**Pendente (ideia, não patch):** worktree + banco clonado por EXECUTOR (hoje é por exec), que mataria a
contenção de lock entre specs. E a validação em campo: primeira exec em `medium` compara
`tokens_thinking_pct_subagents`, parede por task e achados por ciclo com a PRD-142-b.

## 3.5.2 — 2026-09-11 — o modelo do Codex é do harness, não do `~/.codex/config.toml`

Medido 11/09 13:xx: **todos** os projetos passaram a recusar o `codex-cli` com
`PREFLIGHT|indisponivel — config inválida: modelo gpt-6-astra rejeitado pelo serviço`, derrubando os 5 papéis
roteados a ele (discovery de DTs/schema/código/PRDs + impacto) para o fallback nativo. Ninguém tocou no harness:
o **app do Codex Desktop reescreveu o `~/.codex/config.toml`** no seu update e gravou `model = "gpt-6-astra"`,
enquanto o `codex` do PATH (npm global) seguia em **0.145.0**, velho demais para esse modelo. Config global +
CLI defasada = parque inteiro parado. A 3.4.33b só tinha tratado o sintoma (parar de trancar 24 h achando que era
limite de uso); a causa — **o harness depender de um arquivo que outro programa reescreve** — continuava de pé.

1. **`harness-delegate.sh`, delegação:** `--model` explícito, vindo de `HARNESS_DELEGATE_CODEX_MODEL`
   (default **`gpt-5.6-sol`**). `--model` na linha de comando continua ganhando; knob vazio (`''`) volta a
   herdar o config global de propósito.
2. **`harness-delegate.sh`, preflight:** o ping passa a usar o **mesmo** modelo da delegação. Antes ele testava
   o modelo do `config.toml` e reprovava o executor por um modelo que o harness nem usaria — foi assim que um
   arquivo de outro programa derrubou o pool inteiro.
3. **`harness.env`** documenta o knob; **`.codex/config.toml.example`** deixa de dizer que "não fixamos model"
   (agora fixamos, no lugar certo — o harness).

**Na máquina do Charles (11/09):** `npm i -g @openai/codex@latest` levou a CLI de 0.145.0 → **0.154.0**.
Slugs conferidos contra o serviço: `gpt-5.6-sol` ✅ · `gpt-5.6-codex` ❌ · `gpt-5.6` ❌.

**Lição (vale além do Codex):** ferramenta externa cuja configuração é um arquivo global **compartilhado com o
app do fornecedor** não é dependência estável — o harness precisa declarar o que usa na própria chamada. Todo
executor novo deve nascer com o modelo explícito.

## 3.5.1 — 2026-09-11 — convenção `health-panel` (endpoints fixos de saúde para o Caronte monitorar o parque)

Pedido do Charles (11/09): endpoints fixos em cada projeto para monitorar a saúde a nível de máquina/recurso
e a nível de módulo, para o Caronte consumir depois. Patch, não minor: convenção é conteúdo aditivo (regra do
`convencoes/INDEX.md`) — nenhum hook, skill ou contrato mudou.

1. **`.claude/convencoes/health-panel.md`** — dois endpoints com nome, envelope e regras iguais em todo software:
   `GET /health` (liveness público: 200 com banco ok, 503 com banco fora, nada mais no corpo, < 500 ms) e
   `GET /health/painel` (`X-Health-Token` por instalação, `hash_equals`, 401 sem token — e 401 não é queda):
   grupos `recursos` (disco, memória e carga quando o host permite, relógio/timezone, runtime, migrations
   pendentes), `cron` (dead man's switch do tick + um item por job), `workers` (PID + heartbeat em ARQUIVO),
   `integracoes` (configurado/fallback/faltando com máscara; ping real só com `?profundo=1`) e `modulos` (um
   check por módulo, código = `software_modulos.codigo` do Caronte). Shape único de check; cinco status por
   check, três gerais; só `falha` de item `critico` dá 503. Registro central de checks + executor com timeout
   por check e captura de exceção; um check só lê. Ações corretivas ficam fora do v1 (202 nunca é sucesso).
2. **Destilada de código em produção:** `/v1/health` + `WatchdogService` do Caronte, `/health/worker` do
   Beholder (PRD-001), `health.php` + `ServiceHealthChecker` do Palantír (PRD-038/047/074), "Saúde das
   integrações" do Taurus (PRD-072), health da sessão WAHA por tick do Sagittarius (PRD-097). 13 armadilhas
   datadas; passo a passo em 12 tasks; checklist de aceite; variações PHP vanilla / Laravel / Node.
3. **O consumidor** (Caronte monitorando o parque: `health_url` + token na licença, job `health_poll`, estado
   derivado em `auditoria` só na transição, alerta com debounce e canal alternativo, watchdog do Beholder
   migrando para o modelo) fica descrito na convenção como PRD futura do Caronte — não é task do port.
4. Catálogo (`convencoes/INDEX.md`), ONBOARDING 3.5.1 e carimbos de versão. Nenhum hook tocado; suítes da
   3.5.0 seguem válidas.

## 3.5.0 — 2026-09-11 — número por dev (PRD/DT/LOTE), migrations por timestamp, telemetria inteira por dev/máquina, convenção de licença do Caronte

Pedidos da equipe (11/09): (1) número de PRD/DT **diferente por dev** para acabar com colisão e renumeração
no merge; (2) o mesmo para migrations, sem quebrar a sequência que o banco precisa; (3) a convenção de como
o software valida licença no Caronte; (4) revisar o que do harness ainda não tinha dado versionado no repo.
Minor porque muda capacidade (numeração, guards, séries de telemetria novas) — a última minor foi a 3.4.0.

1. **Faixas de numeração por dev** (`hooks/_seq.sh`; `harness-worktree.sh reservar` e novo `faixa`). A
   reserva atômica (3.4.2) só alcança os checkouts da MESMA máquina (vive no `.git` comum); entre devs, dois
   `PRD-142` nasciam em máquinas diferentes e só se encontravam no merge. Agora cada dev tem um **bloco por
   série**: bloco k ⇒ `k·T+1 … (k+1)·T−1` (T = 1000; DT = 10000, a série que mais cresce — DT-580 no Mariana
   em 2 meses). Bloco 0 é a série legada (nada existente muda de nome): o Charles segue em `PRD-142`, o
   Derick recebe `PRD-1001`, a Débora `PRD-2001`… Chave = e-mail do git (a mesma identidade do campo `autor`
   da telemetria); tabela padrão da equipe em `_seq.sh`, `HARNESS_SEQ_FAIXAS` substitui, `_EXTRA` acrescenta,
   `off` volta à série única. O piso é o maior número visto **dentro da própria faixa** (+ reservas); número de
   outra faixa não entra. Dev fora da tabela cai no bloco 0 com AVISO (doctor cobra). Faixa esgotada ⇒ repita
   a chave com outro bloco. **Nunca renumerar** — a série deixou de ser cronológica de propósito (o INDEX tem
   a data). Sufixo de fatia (`-b`) continua não consumindo número.
2. **Migrations NÃO usam faixa — ganham o modo `timestamp`** (`HARNESS_MIG_NUMERACAO='seq'|'timestamp'`,
   default `seq` = como hoje). Análise: o `migrate.php` do Taurus/Caronte/Sagittarius aplica **por nome, em
   ordem lexicográfica, só as pendentes** (tabela `migrations`) — o banco precisa de **ordem e unicidade, não
   de contiguidade**. Faixa por dev quebraria a ordem em banco zero (a `0196` do Charles que altera a tabela
   criada na `1001` do Derick rodaria antes dela). Timestamp `YYYYMMDDHHMMSS_<slug>` preserva a ordem de
   criação entre devs sem coordenação e nunca renumera; `0193_` < `2026…_` ordena certo enquanto o legado for
   `< ano corrente`. `reservar MIG` devolve o instante (único por segundo via mkdir); `guard-migration.sh`
   nesse modo exige 14 dígitos, reserva deste checkout e janela de ±48 h (timestamp inventado reordena a
   série), e nega `NNNN_` novo. Pré-requisito por projeto: o runner aceitar prefixo de 14 dígitos — o glob
   `[0-9][0-9][0-9][0-9]_` do Taurus **não enxerga o arquivo** (o doctor confere e avisa).
3. **Rótulos com 4–5 dígitos:** `PRD-[0-9]{3}` virava `PRD-100` em `PRD-1001` (o `\b` falhava e o rótulo
   sumia) — `guard-agent.sh` (6 pontos), `harness-metrics.sh` (gate), `prd-validacao-check.sh`,
   `harness-metrics-auto.sh` (`{1,5}`), `prompt-audit.mjs`. Skills `/prd` (Passo 1 passa a reservar; Passo 5),
   `/dt`, `/dt-exec`, `/prd-exec` e `hefesto.md` explicam a faixa e proíbem renumerar.
4. **Telemetria: `delegations/` e `duelos/` por dev/máquina.** `harness-delegations.jsonl` e
   `harness-duelos.jsonl` eram UM arquivo por projeto — dois devs apendando o mesmo fim de arquivo conflitam em
   todo merge (a classe de problema que tirou os runs do arquivo único na 3.2.2). Helpers
   `harness_metrics_arquivo`/`harness_metrics_todos` em `_jsonl-append.sh` (o `_incidente.sh` passa a usá-lo);
   `harness-delegate.sh` (3 pontos: preflight, manifest, teto diário — o teto soma o arquivo DESTA máquina +
   legado, porque a chave do OpenRouter é pessoal), `harness-duelo.sh` (escreve no da máquina; **placar e
   contagem leem TODOS + legado** — o placar é da equipe), `guard-stop.sh` (vitória sem desfecho, da máquina),
   `doctor-cached.sh`, `harness-dashboard.mjs` (lê os dois formatos), `harness-metrics.sh` (`sanear` cobre as
   5 séries; o `stop` faz `git add` de `delegations/` e `duelos/` da máquina), `noturno-ci.yml` (artifacts).
   Legado fica como histórico; nenhuma linha nova entra nele.
5. **Quatro incidentes que só existiam em log local viram linha versionada** (schema único da 3.4.23):
   `denied` (classificador negou — `denied.sh`; antes só virava o contador `classifier_denials` da run),
   `stall` (agente vivo mudo — `agent-stall.sh`, 1 linha por agente via marcador `.harness-run/stall/<id>`),
   `pergunta` (AskUserQuestion negada em modo autônomo — `guard-question.sh`), `leitura` (leitura via Bash
   negada — GUARDA 0, `guard-bash.sh` e `guard-bash.mjs` via `gravarIncidente`). Painel, `/harness-report` e
   PLAYBOOK atualizados com a régua de leitura de cada um.
6. **Doctor — três perguntas por série** (`runs tasks incidentes delegations duelos`): está no git? está
   ignorado pelo `.gitignore` do projeto? há linhas nunca commitadas? Mais: dashboards gerados versionados,
   **transcripts crus versionados** (medido 11/09: Mariana com 11 dashboards e 118 transcripts/1,9 MB no git;
   Caronte com `harness-runs.jsonl` no git; `tasks/` sem commit em 2 repos), legado compartilhado (informativo),
   a **faixa do dev** (e-mail vazio / fora da tabela ⇒ warn) e o modo de migrations (runner com glob de 4
   dígitos fixos, legado ≥ ano corrente ⇒ warn). `.gitignore` do mestre e do README ganham
   `prds/_metrics/transcripts*/`. `prds/_metrics/README.md` reescreve a regra única.
7. **Convenção `licenca-caronte`** (`.claude/convencoes/licenca-caronte.md`): como o software da Beta consulta
   o status da própria licença no Caronte — cliente de referência `clientes/php/CaronteLicenca.php` (PRD-010,
   F4: fail-open irrestrito, cache 24 h com tolerância 48 h, assinatura Ed25519 pinada pelo integrador,
   `X-Caronte-Client` para a tela de adoção), passo a passo do port em 10 tasks, 12 armadilhas com incidente
   real e checklist de aceite. Até 11/09 nenhum consumidor integrou (a tela de adoção mostra `nunca` para o
   parque inteiro) — o Taurus core é o primeiro alvo (`/convencao portar licenca-caronte`).
8. Suítes `tests/t-350-seq-faixas.mjs` (faixas, `faixa`, MIG seq/timestamp, guard em ambos os modos, rótulos
   de 4 dígitos) e `tests/t-350-telemetria.mjs` (arquivo por dev, incidentes novos, `sanear`, painel lendo as
   pastas novas, doctor acusando dashboard/transcript versionado).

## 3.4.34 — 2026-09-10 — seis tetos aprendidos na PRD-141 (13 tasks, 6 h de exec, 12 bloqueantes no review final)

Diagnóstico da PRD-141 (aprovado pelo Charles): tasks superdimensionadas (150–270 turnos, 5 cortes de fôlego, 165 min
só de "resto") numa PRD de 13 tasks que ninguém fatiou; costura front↔back sem verificação (`pendentes` × `pendencias`,
`window.BRANDING` removido) descoberta só no review final; e o gate de acceptance (TASK-012) nunca rodou. Instrução não
segurou nenhum dos três — agora é hook.

1. **Teto de tasks = 9, mecânico** (`HARNESS_PRD_MAX_TASKS`): `prd-validacao-check` reprova a criação acima disso e o
   guard-agent não despacha executor (override humano: `.harness-run/PRD-NNN.tasks-ok`). Vale em noturno.
2. **Task GRANDE não é despachada** (`HARNESS_TASK_GRANDE='negar'`): o guard-agent roda `task-packet --check` no
   despacho; GRANDE (previsão > 45 min pelo histórico, alvos, linhas, KB) = fatiar (override `packets/TASK-NNN.grande-ok`).
3. **Gate de acceptance enforçado** (`HARNESS_GATE_ACCEPTANCE`): `stop PRD-NNN-exec*` exige spec em disco e execução
   registrada da task GATE/acceptance; sem isso não fecha (exit 3, `TELEMETRIA|gate|ausente`); `--gate-ok="<motivo>"`
   registra decisão humana.
4. **Costura por onda** (`HARNESS_COSTURA_ONDA`): em PRD com front e back, a onda N≥2 só despacha após o sherlock
   `Lente: costura` da onda N-1 (`review/PRD-NNN.costura-onda-<N-1>.md`).
5. **Contrato de API com consumidores nomeados**: template da técnica ganha a linha "Consumidores (ARQUIVOS)" e a nota
   de que nomes de chave são contrato; `prd-validacao-check` reprova técnica sem contrato quando tasks tocam `api/`.
6. **Michelangelo teto 90** (era 60; a auditoria de UX da PRD-141 foi cortada).
7. Suíte `tests/t-3434-tetos-prd141.mjs`.

## 3.4.33 — 2026-09-10 — migrations com número reservado (PRD-140 e PRD-141 planejaram a mesma 0193)

A orquestradora que mesclou a `wt/ideias` na main apontou: a PRD-141 planejava a migration 0193 e a PRD-140 a
criou — quinta colisão de migration seguida. A reserva atômica (3.4.2) cobria DT, LOTE e PRD, não migration.

1. **`harness-worktree.sh reservar MIG`**: série nova; piso = arquivos `NNNN_*` da pasta de migrations do checkout
   principal (`HARNESS_MIGRATIONS_DIR` ou a 1ª pasta `migrations` do repo) + reservas; `SEQ|MIG|0194` com zero à
   esquerda na largura dos arquivos existentes.
2. **`guard-migration.sh`** (PreToolUse Write, registrado no settings.json): arquivo novo `migrations/NNNN_*` só
   passa com o número reservado por este checkout — reservado por outro nega citando o dono; sem reserva nega
   citando o comando. Projeto sem `.git/harness-locks/seq` segue livre. `HARNESS_GUARD_MIG_SEQ=0` desliga.
3. `hefesto.md` manda reservar antes de numerar. Suíte `tests/t-3433-guard-migration.mjs`.
4. **Adendo (10/09 12:55):** a linha `**Status:**` do relatório manda na telemetria. A TASK-004 da PRD-141 tinha
   `**Status:** ✅ CONCLUÍDA` e a telemetria gravou ⛔ porque o texto citava "bloqueado pelo interceptor de safe
   mode" (palavra-chave). Agora o Status declarado sobrepõe a palavra-chave e o motivo fica em `status_motivo`.
5. **Adendo (10/09 14:35):** preflight do Codex classificava `400 invalid_request_error: The 'gpt-6-astra' model
   requires …` como LIMITE DE USO (casava "try again") e trancava o Codex por 24 h — o dia inteiro em SOLO-2 por
   um modelo inválido em `~/.codex/config.toml`. Agora erro de configuração (invalid_request, status 400, "model
   requires/unknown/not found") vira falha normal (TTL 30 min) com a dica de corrigir o `model =`.
   Causa real medida: `gpt-6-astra` exige Codex CLI mais novo que o 0.145.0 instalado (`npm i -g @openai/codex@latest`).
6. **Adendo:** `gen-adapters.sh` troca aspas duplas dentro da description por simples ao gerar o stub em
   `.agents/skills/` — o Codex recusava a `prometeu` ("invalid YAML … column 378") por causa de `"/prometeu"` na
   description. Só o stub muda; o canônico em `.claude/skills/` fica como está.

## 3.4.32 — 2026-09-10 — guard-dt exige número RESERVADO (colisão DT-578/579 entre main e worktree)

Medido 10/09 11:08: a exec da PRD-140 (checkout principal) registrou DT-578 e DT-579 por max(INDEX)+1 enquanto a
worktree `ideias` já tinha reservado 578–580 na madrugada (`harness-worktree.sh reservar DT`, 3.4.2). Resultado:
dois DT-578 e dois DT-579 com slugs diferentes esperando o merge. A reserva atômica existia desde a 3.4.2, mas só
a `/dt` e o `/dt-exec` a usavam; a `/prd-exec` registrava DTs de continuidade sem reservar.

1. **`guard-dt.sh`**: se o projeto usa reservas (existe `.git/harness-locks/seq`), todo DT NOVO precisa ter o
   número reservado por ESTE checkout — número reservado por outro checkout nega citando o dono; número sem
   reserva nega citando a última reserva e o comando. Editar DT existente segue livre; projeto sem `seq/`
   segue como antes. `HARNESS_GUARD_DT_SEQ=0` desliga.
2. `/prd-exec` (registro de DTs no fechamento) manda reservar antes de numerar.
3. Suíte `tests/t-3432-guard-dt-seq.mjs` (repo git de sandbox, reserva real).

## 3.4.31 — 2026-09-10 — daemon de hooks serve cada projeto com os hooks DO projeto; projeto atrasado não derruba daemon novo

Medido 09/09 23:38: o daemon é um por PC (porta 47831) e rodava os hooks do projeto que o subiu por último. Uma
sessão do `site-allyson-bezerra-2026` (3.4.25) fez `--ensure` no SessionStart, viu hash diferente e reiniciou o
daemon com os hooks dela; dali em diante o SubagentStop da exec do Mariana (3.4.30) foi processado pelo
`task-telemetry` de 3.4.25 — que ainda tinha o fallback "arquivo mais recente" — e o hefesto vivo da TASK-008
entrou 3 vezes na telemetria com duração crescente. Qualquer PC com dois projetos em versões diferentes tinha isso.

1. **Módulos por projeto** (`harness-daemon.mjs`): cada requisição carrega `guard-bash`/`presence`/`guard-folego`
   de `<cwd>/.claude/hooks` (import dinâmico, cache por pasta + hash; `?v=hash` reimporta quando o projeto
   atualiza). Projeto sem os módulos (harness antigo) cai nos do daemon. `/status` lista os projetos carregados.
2. **`--ensure` não derruba daemon mais novo**: hash diferente só reinicia se a versão do daemon ativo for ≤ a
   do projeto. Um projeto na 3.4.25 abrindo sessão deixa o daemon 3.4.31 no ar e é servido pelos próprios hooks.
   Enquanto os projetos atrasados não forem sincronizados, o daemon deles (sem esta regra) ainda pode assumir —
   rode o `/deus` nos projetos que abrem sessão na mesma máquina.
3. **Adendo (10/09 00:14):** o `?v=hash` no import só refrescava o módulo de entrada — o `task-telemetry.mjs`
   importado por dentro do `presence.mjs` ficou no cache do Node desde a carga anterior (3.4.29 da worktree) e
   gravou linha fantasma mesmo com o projeto já na 3.4.31. Agora os módulos do projeto são copiados para
   `~/.harness-run/mods/<hash>/` e importados de lá (imports internos resolvem na cópia), e o hash cobre
   TODOS os `.mjs` da pasta.
4. Suíte `tests/t-3431-daemon-multi.mjs` (inclui atualização em quente de dependência interna).
5. **Adendo (10/09 09:26):** o resgate do cronômetro (3.4.29) abriu `PRD-140-fase1` no ciclo de fix da exec —
   após o `stop` da exec o marcador some, e o 1º agente que citou PRD-140 parecia "criação". Agora o resgate
   também pula quando há marcador `PRD-NNN-exec*.json` (inclui `-exec-fix`) ou quando os runs já registram
   `PRD-NNN-exec` (PRD que já executou nunca volta a ser criação).
6. **Adendo (10/09 09:50):** `loadEnvFile` (presence.mjs) ignora comentário depois da aspa de fechamento
   (`KEY='150'   # motivo`). Medido: o teto do hefesto no Mariana virou 90 porque a linha tinha comentário — o
   bash aceita, o JS devolvia o valor inválido. Convenção continua: comentário na linha de cima.

## 3.4.30 — 2026-09-09 — leitura de validação da PRD (VALIDACAO.md): o humano confere ANTES de executar

Pedido do Charles (09/09): ao terminar a criação, uma leitura rápida do que a PRD virou — o fluxo, os
requisitos funcionais, o que estava no pedido e o que foi agregado por inovação/DT — para ele e a equipe
validarem antes de rodar, em vez de descobrir na exec o que faltou ou o que o modelo inventou.

1. **`prds/_templates/TEMPLATE-VALIDACAO.md`** — seis seções: (1) o pedido como entrou (escopo copiado +
   decisões da entrevista); (2) o fluxo como ficou (passos na voz do usuário); (3) tabela **RF → origem →
   tasks**, origem ∈ pedido · entrevista · inovacao · DT-NNN · gate · projeto · impacto — RF sem origem é
   invenção; (4) agregado no caminho, com custo; (5) fora/adiado (fatias, backlog, DTs de continuidade);
   (6) perguntas objetivas para conferir antes de aprovar.
2. **`/prd` Passo 10.9** (obrigatório, antes do aceite) escreve o `VALIDACAO.md`; o **aceite do Passo 11 é
   sobre ele** — ninguém mais precisa ler os 300 KB da pasta para aprovar.
3. **`prd-validacao-check.sh --label PRD-NNN`** prova cobertura mecanicamente: toda `### RF-NN` da PRD de
   produto tem linha, toda linha tem origem permitida, toda task de `tasks/` é citada, todo `DT-NNN` citado
   na PRD aparece, toda fatia existente está na seção 5. Saída `VALIDACAO|PRD-NNN|ok|rf=8/8|tasks=9/9|dts=2/2|fatias=1/1`
   ou `|falta|<motivos>` / `|ausente|`.
4. **`harness-metrics.sh stop PRD-NNN-fase2`** roda o check e grita se faltar (`TELEMETRIA|validacao|ausente|PRD-NNN`) —
   nunca bloqueia. Suíte `tests/t-3430-validacao.mjs`.
5. **Telemetria sem linha vazia** (`task-telemetry.mjs`): SubagentStop cujo `agent_transcript_path` não existe em
   disco (medido na exec da PRD-140: 2 linhas `general-purpose` com 0 turnos) não grava nada; transcript sem
   turnos nem tokens também não. Só o DT absorvido conta no check (citado nos RFs ou em "Expande/absorv") —
   a PRD-140 citava DT-184 como precedente e o check acusava.
6. **Corte de fôlego não pode virar "concluída"** (medido na exec da PRD-140, TASK-003): o hefesto devolveu
   `PARCIAL-TEMPO` no relatório (backend ok, spec E2E nunca escrito), mas o último texto era o Write negado (⛔),
   a telemetria gravou ⛔, o aviso do guard-agent (que só olhava `PARCIAL`) ficou mudo e a sessão-pai seguiu
   como concluída. Agora a telemetria lê o Status do relatório (bloco final ou `relatorios/<task>-<papel>.md`)
   e o guard-agent trata ⛔ como PARCIAL com ordem explícita: abrir "O que FALTA" e redespachar uma vez.

## 3.4.29 — 2026-09-09 — cronômetro da Fase 1 da /prd liga sozinho (prompt + 1º agente da criação)

Medido na PRD-140 (09/09): a skill manda `harness-metrics.sh start PRD-NNN-fase1` no Passo 1, no meio de um
passo cheio (marcador, reserva do número, cache do discovery, 6 agentes). A sessão rodou o `baseline` e pulou
o `start` — Fase 1 inteira (discovery + maquete, ~35 min) sem duração no histórico; só a Fase 2 (52 min) foi
medida. Regra da casa desde 24/08: instrução não segura, hook segura — o `/prd-exec` e o `/dt-exec` já
ligavam sozinhos; a criação era o único fluxo que dependia do modelo lembrar.

1. **`harness-metrics-auto.sh`**: o prompt `/prd` (com ou sem `--ideia N`) liga `_auto-prd-fase1` — a PRD
   ainda não tem número na invocação, como o `_auto-dt-exec`.
2. **`harness-metrics.sh start PRD-NNN-fase1`** ADOTA o início do `_auto-prd-fase1` (o epoch do prompt é o
   início real; o Passo 1 vem 2–4 min depois) e apaga o auto. **`stop`** herda marcador automático por
   FAMÍLIA: `*-fase1/*-fase2` só herdam `_auto-prd-*`; `LOTE-*`/`*-exec` só herdam os demais — antes uma
   fase1 sem start herdaria um `_auto-dt-exec` esquecido e gravaria duração inventada.
3. **`guard-agent.sh`** (2ª rede): o 1º agente da criação (peter-quill, tony-stark, atlas, ariadne, beholder,
   michelangelo, dedalo, hermes, themis, prometeu) que cita `PRD-NNN` sem marcador nenhum dessa PRD liga
   `PRD-NNN-fase1` — ou `-fase2`, se a fase1 dessa PRD já está gravada nos runs (retomada após o aceite,
   também instrução hoje). Nunca bloqueia; não age com `*-exec` da PRD, `_auto-*` presente ou prompt com
   packet de task (exec).
4. Skill `/prd` (Passo 1) diz que o start adota o cronômetro do prompt. Suíte `tests/t-3429-cronometro-prd.mjs`.

## 3.4.28 — 2026-09-09 — packet enxuto: Perfil filtrado pela task; worker de duelo recebe o alvo uma vez só

Medido nos 5 duelos do sweep do Mariana (09/09): a entrada do worker tinha 105–142 KB, mas o diff era de
1–2 KB. Onde estavam os bytes do DT-544 (142 KB): Perfil "resumo" 56 KB, Anexo do alvo 65 KB, esqueleto +
trechos do MESMO alvo 7 KB, contrato/regras 9 KB. Custo por duelo ~US$ 0,03 independente do tamanho do
diff — o packet era o preço. O mesmo Perfil pesa em todo packet de hefesto/sherlock (94 KB medidos).

1. **Perfil filtrado pela task** (`task-packet.sh`, todos os papéis): o PERFIL-RESUMO acumula um parágrafo
   por PRD (33 armadilhas, 52 dos 56 KB no Mariana). Nas seções de histórico (heading com
   armadilha|integra|hist|decis|prd) o bullet longo (> `HARNESS_PACKET_PERFIL_MIN`, 300 chars) só entra se
   citar um token da task — basename/pasta dos arquivos citados ou identificador em crase do contrato (com `_`
   ou ≥ 10 chars: `status`/`update`/`insert` casavam com meia dúzia de armadilhas cada) — ou
   se estiver entre os `HARNESS_PACKET_PERFIL_RECENTES` (3) mais recentes. Seções fixas (identificação, CLI,
   réguas, conduta), bullets curtos e as linhas de continuação do bullet mantido entram sempre. Rodapé no
   packet diz quantas ficaram e onde está o integral; `--check` imprime `PERFIL|<task>|filtrado|55 KB -> 23 KB|12/39`
   (medido: DT-544 55→23 KB, DT-542 55→13 KB; entrada do worker do DT-544 cai de 142 para ~100 KB, do DT-542 de 105 para ~40 KB).
   `HARNESS_PACKET_PERFIL='integral'` volta ao comportamento anterior.
2. **`task-packet.sh --worker`** (usado pelo `harness-duelo.sh`): o worker sem tools recebe os alvos inteiros
   como Anexo (`harness-delegate --attach`) — a seção 4 vira um índice (nome, bytes, "integral no Anexo") e,
   para arquivo grande, só o esqueleto (linha:assinatura) que orienta o BUSCAR. O DT-544 provou que o Anexo
   integral é indispensável (o diff caiu na linha 1184; os trechos citados eram 810 e 830) — ele fica; o que
   sai é a duplicata. Contexto (seção 5) segue como antes, porque não é anexado.
3. Suíte `tests/t-3428-packet-enxuto.mjs` (sandbox próprio).
4. **/prd — TURBO comum NÃO escreve o marcador de modo** (SKILL.md, Passo 0.3): o texto "(TURBO comum: `turbo`)"
   fez a sessão da PRD-140 (09/09, humano na tela) gravar `turbo`, e o `guard-question.sh` negou a própria
   pergunta da maquete; a sessão apagou o marcador, perguntou, e o reescreveu depois. Marcador só em
   `--noturno`/TURBO NOTURNO.
5. **guard-agent: isenção "Modo P/R" case-insensitive** — a /prd despacha o dedalo de projeto com "MODO P" em
   caixa alta; o guard exigiu packet de um DT absorvido citado no prompt e a sessão gerou 2 packets à toa
   (~2 min). Observado no mesmo run: marcadores `PRD-139-exec.json` (08/09) e `PRD-139-b-exec.json` (05/09)
   abertos anulavam a 2ª isenção (fase1/2 sem exec) — run aberta continua sendo alerta do doctor.

## 3.4.27 — 2026-09-09 — GUARDA 0 e teto de fôlego passam a valer de verdade em subagente; telemetria sem fantasmas; novato vai de A

Achados do primeiro dia de execução real (sweep do Mariana, sessões A e B em paralelo, 09/09):

1. **Detecção de subagente pelo payload** — `presence.mjs` (`subagenteDoPayload`, usado por `guard-bash.mjs`,
   `guard-folego.mjs` e pela presença): os hooks dentro do subagente NÃO trazem `/subagents/` no
   `transcript_path` (a doc do Claude Code 2.1 garante `agent_id`/`agent_type` em PreToolUse/PostToolUse e
   `agent_transcript_path` no SubagentStop). Medido: 0 arquivos em `.harness-run/folego/` e 0 pings com sufixo
   de agente depois de dezenas de Bash/Edit de hefesto e sherlock; um `cat … 2>&1 | head` de hefesto passou
   pela GUARDA 0. Ou seja, desde a 3.4.21 a GUARDA 0 e o teto de fôlego só negavam nas suítes. Agora `agent_id`
   no payload = subagente e o transcript do agente é derivado de `<sessão>/subagents/agent-<id>.jsonl`.
   `t-3422` ganhou o caso com o payload no formato real.
2. **Telemetria por task sem linhas fantasma** — `task-telemetry.mjs` usa `agent_transcript_path` do SubagentStop,
   NÃO cai mais no "arquivo mais recente" quando o `agent_id` não tem transcript (três SubagentStop de ids sem
   arquivo pegaram o hefesto vivo e gravaram 8 s/6 turnos), e deduplica por `agent_id` (o hefesto do DT-545
   foi gravado em dobro).
3. **Exploração acelerada de modelo novo no duelo** — `harness-duelo.sh`: no serial o B só é medido quando o
   A falha; enquanto um titular tiver menos de `HARNESS_DUELO_NOVATO_MIN` (5) duelos medidos na janela, ele vai
   de A a cada 2 duelos (`HARNESS_DUELO_NOVATO=off` desliga).
4. **Semáforo de frentes com rótulo do lote** — `guard-agent.sh` prefere `LOTE-NNN` a `PRD-NNN` (o prompt do
   `/dt-exec` cita a PRD de origem do DT e o slot nascia `PRD-136`, que o `stop` do LOTE-044 não liberava).

5. **`agent-stall.sh` enxerga agente em background** — o `tool_result` no pai chega na hora do lançamento
   ("Async agent launched"); a conclusão real é o `<task-notification><task-id>ID</task-id>`. O check antigo dizia
   `vivos=0` com um sherlock de 111 turnos em plena revisão — o `Monitor` da exec nunca teria disparado.
   `HARNESS_STALL_ROOT` permite vigiar outro projeto a partir de uma cópia do script.

6. **Item 18 corrigido no ONBOARDING** — allowlistar `AskUserQuestion` NÃO dispensa o prompt: a doc do Claude
   Code diz que a ferramenta exige interação humana em qualquer modo (medido na sessão A: prompt de permissão
   com a regra presente). A regra fica por documentar a intenção; o que reduz a parada é o `guard-question.sh`
   nos modos autônomos e as skills perguntarem uma única vez, no fechamento.

Observado e ainda aberto: o primeiro sherlock do SOLO-2 foi despachado sem `Lente: A` (rodou "completa"); a
skill já pede — reforçar no `/dt-exec` na próxima rodada. Números do dia (duas sessões em paralelo, main +
worktree, Sonnet alto na principal): LOTE-041 (3 itens) 22 min, LOTE-042 (2) 25 min, LOTE-043 (3) 90 min,
LOTE-044 (3) — 11 DTs fechados, todos com `review_modo=solo-2` (Codex CLI fora por modelo incompatível);
5 duelos, 5 diffs aplicados de primeira, ~US$ 0,03 cada, segundo worker nunca pago; 1 prompt de permissão
(o `AskUserQuestion` do fechamento); michelangelo do LOTE-043 levou 26 min/124 turnos (gate de UX ao vivo).

## 3.4.26 — 2026-09-09 — packet com os trechos citados por linha; rótulo do /dt-sweep na telemetria

1. **Trechos citados por linha entram no packet (achado do teste de modelos de 08/09)** — `hooks/task-packet.sh`:
   quando o contrato cita `arquivo:NNN`, `arquivo:NNN-MMM`, `(l. NNN)` ou `linha NNN` e o arquivo entra por
   ESQUELETO (código > 40 KB) ou por cabeçalho (não-código), o trecho citado entra com `HARNESS_PACKET_TRECHO_MARGEM`
   (25) linhas de margem, numerado. Linha além do fim do arquivo é marcada `referência DEFASADA` no packet e o
   `--check` imprime `TRECHOS|<task>|<arquivo>:<linhas>|ok|DEFASADA (arquivo tem N linhas)` — a `/prd` e o `/dt`
   corrigem a citação antes do despacho. Caso real: DT-543 do Mariana citava `:737` (a linha real era 1094) e o
   arquivo de 66 KB entrou por esqueleto sem o trecho — os três workers do duelo ficaram inaplicáveis, qualquer que
   fosse o modelo (o honesto recusou, o deepseek chutou). Teste: 4 casos novos na `t-3424-leve-packet.mjs`.
2. **`DT-SWEEP-<data>` aceito pelo `harness-metrics.sh`** — a recusa de rótulo sem número da 3.4.23 barrava o rótulo
   por DATA que a skill `/dt-sweep` usa (medido no sweep do Mariana de 09/09, que teve de usar `SWEEP-…`).
3. **Poda do Perfil com PROVA, mecânica (hooks/perfil-poda.sh)** — o P1 do `/deus` deixou de ser leitura manual:
   o hook classifica cada entrada podável do Perfil (armadilhas, ACL, integrações, estrutura — nunca as seções
   fixas) em 🟢 morto-provado (TODO caminho/arquivo/`tabela.coluna` citado não existe mais no repo, ou a PRD de
   origem está Revertida no `prds/INDEX.md`), 🟡 suspeito (parcialmente morta, carimbo > `HARNESS_PERFIL_PODA_MESES`
   sem referência viva, duplicata provável por 2 termos raros, regra que virou convenção, identificador morto
   sozinho) e 🔴 intocável, com a evidência colada (`test -e …`, `grep -rw …`). 1 `find` + 1 `grep -F` — ~25 s num
   Perfil de 140 KB. Saída `PODA|balde|seção|linha|80 chars|evidência` + `PODA-RESUMO|…`; `--md` grava
   `prds/_metrics/perfil-poda-<data>.md`; `--aplicar-verde` (opt-in) move os 🟢 para `.claude/PERFIL-ARQUIVO.md`
   com data + prova (nada é deletado) e avisa para recarimbar o resumo. Knob `HARNESS_PERFIL_PODA` (`sugerir`
   default: `/prd` e `/prd-exec` 5.6 listam os candidatos no Output; `auto-verde`: o 🟢 provado é arquivado no
   fechamento e entra no commit sugerido; `off`). Doctor: check informativo (Perfil > 40 KB imprime o
   PODA-RESUMO). Medido no core do Taurus: 256 entradas, 517 referências vivas, 0 🟢, 32 🟡 (duplicatas) —
   `prds/PODA-PERFIL-MARIANA-2026-09-09.md`. Teste: `tests/t-3426-perfil-poda.mjs` (61 casos em sandbox).

Testes: `tests/t-3426-perfil-poda.mjs` (61); `t-3424-leve-packet` 59 (4 casos novos), `t-3423-painel` 45 e `t-3425-contratos` 105 continuam verdes.

## 3.4.25 — 2026-09-08 — Onda D: contrato mecânico por papel no packet, agentes auditados para os modelos 5, gates com cobertura

Item 19 do plano de retomada + auditoria de prompts (régua `claude-api/shared/prompt-audit.md`, modelos-alvo Sonnet 5 /
Opus 5 / Fable 5.1) + melhoria 2 (cobertura nos gates). Regra da casa em tudo: instrução não segura, hook segura; nunca
teto/contador no prompt; contexto não é cruft.

1. **Contrato mecânico único por papel, injetado pelo packet (item 19)** — `.claude/contratos/CONTRATO-{executor,
   revisor,gate,escrivao,scout}.md` concentram a mecânica que os 12 agentes repetiam no `.md` (onde ler — o `guard-bash`
   nega leitura via Bash —, fôlego — o `guard-folego` nega acima do teto; devolva PARCIAL-TEMPO —, temporários,
   classificador indisponível, Edit-first — o `guard-write` nega Write grande —, lint do projeto nos arquivos tocados,
   invariantes do gate, verificação provada, retorno em dois níveis), cada bloco com o porquê em uma frase e sem número
   de incidente. `task-packet.sh` (executor), `review-packet.sh` (revisor) e `prd-packet.sh` (gate) prefixam o packet
   com "## 0. Contrato do papel" (helper `hooks/_contrato.sh`; `HARNESS_PACKET_CONTRATO='off'` tira a seção; o
   `--check` do task-packet não a mede). Os `.md` ficaram com persona + lentes + regras de negócio + formato de retorno
   e uma frase de referência ao contrato: 12 genéricos 1.580 → 1.266 linhas (−20 %; o restante é contexto e formato —
   cortar mais apagaria régua, lentes e contratos de saída). `review-packet.sh`/`prd-packet.sh` passam a informar pasta
   de relatórios e piso de severidade no cabeçalho — o revisor/gate não lê mais o `harness.env`. `dedalo` e `ariadne`
   perderam as ferramentas de browser pane do frontmatter (Playwright CLI é o canônico, PLATAFORMAS §7) e as leituras
   via Bash (`grep -rn | head`, `ls`, `cat tailwind.config.*`) que o `guard-bash` já negava viraram Grep/Glob/Read.
   `harness-sync.sh`: `.claude/contratos` entra em `CORE_DIRS`; `harness-doctor.sh` acusa pasta/contrato ausente;
   `gen-adapters.sh --check` exige que cada `.codex/agents/*.toml` aponte o contrato do papel (10 adapters atualizados
   à mão, com paridade).
2. **Auditoria dos 14 agentes para os modelos 5** — `prds/AUDITORIA-AGENTES-MODELOS-5-2026-09-08.md`: 43 achados (19
   alta, 14 média, 10 baixa/flag); ações: 19 move (mecânica → contrato), 13 rewrite, 3 remove, 2 add, 10 flag. Os três
   de maior impacto: (a) mecânica repetida 7×/3×/3× com narrativas de incidente e números divergentes entre arquivos;
   (b) contrato ≠ comportamento — leitura via Bash prescrita a dedalo/ariadne e negada pelo hook, browser pane no
   frontmatter, "leia TODOS os documentos + 3 templates" (beholder) e "leia o harness.env" (sherlock) contra o regime de
   packet; (c) filtro de severidade e contador de ciclos nos gates. Saíram ~45 tags de versão e frases "desde a X"/
   "substitui o antigo…", as histórias em "Por que você existe" viraram razão no presente, a caixa alta sem porquê
   baixou de volume. Alta e média aplicadas; `flag` só no relatório (6 fora do escopo: prompts das skills `prd`/
   `prd-exec` com "teto de 30 chamadas"/"CICLO N de M" e mecânica duplicada, `harness-duelo.sh` com "<=40 palavras").
3. **Gates com regra de cobertura (melhoria 2)** — `beholder.md` e `michelangelo.md` recebem a mesma regra do sherlock
   (3.4.24): reportam TODO achado com confiança alta/média/baixa + severidade estimada (placar `🔴 N (alta K · média L ·
   baixa M)`, campo `**Confiança:**` na ficha); a triagem é da sessão-pai; `HARNESS_REVIEW_SEVERITY_FLOOR` controla só o
   DETALHAMENTO (quais níveis ganham ficha) e nunca a omissão — texto explícito nos dois `.md`, no CONTRATO-gate e no
   cabeçalho do prd-packet. O contador "Ciclo: N de M (teto absoluto = HARNESS_REVIEW_MAX_CICLOS…)" saiu dos relatórios
   ("Ciclo: N, como veio no prompt"). `sherlock.toml` (Codex) alinhado ("em dúvida, é Sugestão" → cobertura).

Testes: `tests/t-3425-contratos.mjs` (105: seção 0 por papel nos 3 packets, knob off por env e por harness.env.local,
--check sem contrato, degradação sem a pasta, pasta/piso no cabeçalho, sync --check acusa FALTA dos 5 contratos e do
helper e --apply os leva, doctor acusa contrato/pasta ausente, frontmatter/LF dos 14, dedalo/ariadne sem browser, 12
genéricos sem blocos de mecânica e apontando o contrato certo, cobertura nos gates, contratos sem contador/incidente,
gen-adapters verde, contagem de linhas antes/depois). `t-3422-onda-a` (50), `t-3424-leve-packet` (55) e
`t-3423-permissao` (49) continuam verdes.
4. **Auditoria de prompts no doctor (melhoria 1)** — `hooks/prompt-audit.mjs` (novo) varre
   `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `.claude/contratos/*.md`, `CLAUDE.md` e
   `.claude/PERFIL-RESUMO.md` atrás dos padrões DATADOS de prompt que a documentação dos modelos 5 manda
   tirar — os "Signals" do `prompt-audit.md` da skill claude-api viraram greps: `pressao` (densidade de
   MUST/NEVER/NUNCA/SEMPRE… por 100 linhas acima de `HARNESS_PROMPT_AUDIT_PRESSAO_POR_100`, 3; `!!`; ênfase
   sem porquê), `contador` (teto/contagem em prosa: "orçamento de 40", "em 35, grave", "~30 turnos"),
   `scaffold` (pense passo a passo, ultrathink, `<thinking>`), `severidade` (filtro no revisor: "em dúvida,
   Sugestão", "só reporte bloqueantes"), `fossil` (medido dd/mm, incidente real, PRD-NNN…min, caso LOTE-N,
   versão como narrativa, "agora/passou a" em regra), `repeticao` (bloco ≥ 3 linhas em 2+ arquivos),
   `cap_numerico`, `narracao`, `formatacao`, `tool_names` (mcp__/Bash( em prosa de skill), `identidade`
   (< 15 linhas de corpo). Só diagnostica — imprime `AUDIT|<arquivo>|<id>|<nível>|<linha>|<trecho>` +
   `AUDIT-RESUMO|…`; `--md` grava `prds/_metrics/prompt-audit-<data>.md` (tabela por arquivo); `--json`;
   `--baseline` grava `.harness-run/prompt-audit.baseline.json`. O doctor completo ganha o check "auditoria
   de prompts": WARN **só quando alto+médio SUBIU** em relação à baseline (o que já se decidiu manter não
   grita todo dia); `bash .claude/harness-doctor.sh --prompt-audit` mostra tudo, `--prompt-audit-baseline`
   grava a régua. O SessionStart (`doctor-cached.sh`) não roda (custo). Rito: a cada geração nova de modelo.
   Motivo: cada geração obedece mais literalmente — o "NUNCA" que segurou um modelo antigo derruba o recall
   do novo (o "em dúvida, Sugestão" do sherlock, retirado na 3.4.24, é o caso medido). Medido 08/09 no
   mestre: 35 arquivos, 120 achados (8 alto, 41 médio) — 43 dos 49 alto+médio em `prd`/`prd-exec`/`dt-exec`.
   Knobs: `HARNESS_PROMPT_AUDIT` (on), `HARNESS_PROMPT_AUDIT_PRESSAO_POR_100` (3),
   `HARNESS_PROMPT_AUDIT_VERSAO_MAX` (5).
5. **Relatório auditado por hook (melhoria 4)** — "relatório honesto" era instrução; agora é medido.
   `task-telemetry.mjs` (SubagentStop) captura o RELATÓRIO do agente (último texto ≥ 200 chars) e, se há a
   seção `## Verificações`, avalia cada item que declara sucesso (OK/✅/passou/verde/N/N itens): a prova é um
   fence de código ou uma linha `saída:`/`>` até o item seguinte, ou o item citar um arquivo de log/relatório
   com caminho. Campos novos na linha de `prds/_metrics/tasks/`: `verif_total`, `verif_sem_prova`,
   `status_motivo`; `verif_sem_prova > 0` com Status ✅ rebaixa para ⚠️ (`status_motivo: verificacao sem prova
   (N)`). Sem seção = campos vazios; nunca lança. `--ultima` devolve o 6º campo (`…|status|verif_sem_prova`,
   ordem anterior mantida). `guard-agent.sh --post` injeta `[relatorio] <papel> (<rótulo>) declarou N
   verificação(ões) sem saída colada — trate como NÃO verificadas: rode você a verificação ou redespache
   pedindo a saída; Status rebaixado para ⚠️ na telemetria` e grava incidente tipo `relatorio` (schema único,
   versionado); os avisos do `--post` (relatorio, hermes, watchdog) saem num único `additionalContext`. O
   contrato do executor passa a exigir a saída colada (Onda D); o painel lê os campos depois. Knob:
   `HARNESS_VERIF_PROVA` (on; `off` só mede).
   Testes: `tests/t-3425-audit-relatorio.mjs` (52 casos, sandbox por pid); `t-3422-onda-a` e `t-3423-painel`
   continuam verdes.
6. **Esforço no lugar da palavra-gatilho de thinking; `fable` opt-in (melhoria 3)** — `PERFIL-PROJETO.md` + 3
   perfis, `harness-ui.mjs`/`harness-config.html`, skills `/prd` Passo 1, `/prd-exec` Passo 0/2.4/2.9.2,
   `/codex-review` Passo 0, `/dt-exec` 5.1. O knob "Thinking dos julgadores" (`padrao`/`estendido`/`ultrathink`)
   funcionava pondo a palavra no fim do prompt do agente; nos modelos Claude 5 o thinking é adaptativo e a
   profundidade vem do nível de ESFORÇO (`low`/`medium`/`high`/`xhigh`/`max`) — a documentação do Claude Code
   (model-config) diz que a palavra só acrescenta uma instrução em contexto e "the effort level sent to the API
   is unchanged": era um fóssil que dava sensação de controle. Saiu. Pesquisado (sub-agents, model-config,
   settings-reference): o Claude Code NÃO aceita esforço por chamada (o Agent tool só leva `model`); o subagente
   HERDA o esforço da sessão, salvo `effort:` no frontmatter do próprio agente — arquivo que viaja com o mestre.
   Por isso o dial que entrou é da SESSÃO: linha **"Esforço da sessão"** na tabela de expansão (economico
   `medium` · equilibrado `high` — o default do Claude Code · maximo `xhigh`) + override fino "Esforço da
   sessão" no Perfil; as skills resolvem, avisam UMA vez se `CLAUDE_CODE_EFFORT_LEVEL` divergir ("Perfil pede X;
   sessão em Y — `/effort X`") e não passam nada por chamada; quem aplica é o dev (`/effort`, `effortLevel` no
   `settings.local.json` ou `CLAUDE_CODE_EFFORT_LEVEL`). A `/harness-config` mostra o esforço efetivo e grava o
   override. **`fable`** (Fable 5.1 — o mais capaz, custo 2× Opus) entra como valor opt-in nos 7 campos "Modelo
   do <agente>" (`sonnet | opus | fable`), NUNCA nos presets; as skills que montavam `model: "opus"` passam
   `model: "<resolvido>"`; nota no Perfil: use para o gate c1 de PRD de dinheiro/segurança ou para a sessão
   principal da criação (`/model fable`). Régua de esforço POR PAPEL (frontmatter dos agentes do mestre) ficou
   como decisão pendente — é global, não por preset.
7. **Placar interno por modelo — decidir o preset com dados (melhoria 5)** — `hooks/harness-dashboard.mjs`
   (seção nova + `placarInterno`/`abGateC1` no JSON + 2 alertas), `/harness-report` SKILL, `PLAYBOOK-TELEMETRIA.md`.
   A partir de `prds/_metrics/tasks/*.jsonl` (o `modelo` REAL do transcript vira família sonnet/opus/haiku/fable;
   vazio = `n/d`): (a) por papel × modelo — n, duração/turnos/tokens_out medianos, PARCIAL %; revisores
   (sherlock, beholder, michelangelo) com 🔴 medianos e totais por CICLO (`rotulo` `-c1` ou sem sufixo = c1;
   `-c2`+ = demais); (b) o A/B que o item 13 (3.4.24) pediu — beholder e michelangelo no ciclo 1, sonnet × opus:
   n, 🔴 medianos, % das criações em que o c1 achou ≥ 1 🔴, duração/tokens, e a leitura pronta ("c1 em Sonnet
   acha X 🔴 vs Y em Opus em N/M criações"); (c) executores (hefesto, dedalo) por modelo: n, PARCIAL %, duração
   e, quando a linha traz `verif_sem_prova` (campo novo da mesma rodada; lido com tolerância), % de relatórios
   com verificação sem prova; (d) réguas em TEXTO, decisão humana: modelo com n ≥ 5 e PARCIAL ≥ 30 % no papel =
   investigar teto/packet (alerta "Placar por modelo"); c1 Sonnet com 🔴 medianos < 60 % do c1 Opus em n ≥ 5
   cada = reconsiderar o item 13 (alerta "Gate c1 (item 13)"); amostra curta = "amostra curta", não conclusão.
Testes: `tests/t-3425-placar-effort.mjs` (44 casos: dashboard `--all` e `--projeto=` sobre 2 projetos falsos com
tasks jsonl semeado — medianas 2,5 × 3, PARCIAL 33 %, c2 separado, n/d, `verif_sem_prova`, leitura A/B, os dois
alertas; Perfil/perfis/skills/UI sem a palavra-gatilho e com `fable`; UI sobe e o `/api/state` expõe `fable` por
override e `esforco.efetivo` por preset/override) — `node tests/t-3425-placar-effort.mjs`. `t-3423-painel` e
`t-3424-leve-packet` continuam verdes (a 3424 teve 1 linha ajustada: o replace hardcoded do hint do Perfil).
8. **Pool de duelo revisto com teste real (US$ 0,22)** — `prds/ANALISE-MODELOS-OPENROUTER-2026-09-08.md`:
   `google/gemini-3.8-flash` (02/09) custa o mesmo que o 3.7 (0,75/3,75 por 1M — o 0,375/1,875 de 22/08 era o
   `:batch`), 1M ctx, Terminal-Bench 90,8% vs 81,6%, diff aplicável nota 8,5 em 6 s → entrou no lugar do 3.7;
   `qwen/qwen3-coder-next` saiu (0/5 vitórias, 5/5 inaplicáveis); `deepseek/deepseek-v4-flash-0731` segue titular
   e estagiário (0,065/0,18; mesmo diff aplicável por 1/5,6 do preço do Gemini). A linha `grok-*-fast`/`grok-code-fast`
   foi retirada pela xAI (15/08); `x-ai/grok-build-0.1` (1,00/2,00; aplicável, nota 7,5, 56 s, US$ 0,038/chamada)
   entrou como SUPLENTE antes do haiku-4.5. Dois achados de harness no teste: packet por esqueleto pode não trazer o
   trecho-alvo quando o contrato cita `arquivo:linha` (todo worker fica inaplicável — pendente um check no
   `task-packet --check`), e no Mariana (3.4.21, sem teto de turnos) uma chamada `--tools` custou US$ 0,08 e 924k
   tokens — o `/deus` lá é urgente.
9. **`effort: medium` no frontmatter dos papéis mecânicos** (hermes, peter-quill, prometeu, themis, ariadne) — o
   Claude Code aceita esforço só no frontmatter do agente (herda a sessão por padrão); os demais papéis herdam.
   `tests/t-3424-review-duelo.mjs` fixa o pool antigo no sandbox (testa mecânica, não o pool real).

Testes desta versão: `tests/t-3425-contratos.mjs` (105), `t-3425-audit-relatorio.mjs` (52), `t-3425-placar-effort.mjs`
(44); as sete anteriores continuam verdes. Pendente de validação REAL: uma criação e uma exec sem regressão de 🔴 com
os agentes reescritos e os contratos no packet; auditoria das skills `prd`/`prd-exec`/`dt-exec` (43 dos 49 achados
alto+médio do prompt-audit estão nelas — "medido dd/mm" e contadores na prosa) fica para a próxima rodada.

## 3.4.24 — 2026-09-08 — Onda C: LEVE por padrão, gate c1 em Sonnet, packet por função, SOLO-2, duelo serial

Itens 12 (redação nova aprovada em 08/09), 13, 9, 10 e 11 (a/b/c/d) do plano de retomada.

1. **MODO LEVE vira o rito PADRÃO da `/prd`; o rito COMPLETO é exceção por RISCO (item 12 — redação
   nova, 08/09)** — `skills/prd/SKILL.md` 1.5/2.0/7.2/8/10.1, `agents/hermes.md`. Até aqui o LEVE
   entrava por fatia OU ≤ 6 tasks OU `--leve`, e o hermes Modo E a partir de 7 tasks de trabalho —
   com o teto duro de 8 (+2 obrigatórias), "LEVE para ≤ 8" era "LEVE sempre" sem dizer isso. Agora o
   rito é decidido por risco, não por tamanho: COMPLETO só com integração com efeito colateral NOVA,
   auth/dinheiro NOVOS, módulo inexistente, técnica > 800 linhas ou `--completo` explícito
   (`HARNESS_PRD_RITO='completo'` é o kill switch). No LEVE a pai redige as tasks mesmo com 7 ou 8
   (medido 5-9 min até 6; estimados 10-14 para 7-8, abaixo dos 17-22 min do hermes mais o degrau
   serial); hermes Modo E só no rito COMPLETO (aí em paralelo, 2 hermes, como antes); Modo C já não
   depende do rito (10.2 decide por documentos, 3.4.22). Ciclos no LEVE seguem "1 + confirmação".
   `--leve` continua aceito (no-op com aviso). Telemetria grava `--modo=leve|completo` no `stop` das
   duas fases (`--extra="modo: leve"` fica como redundância). Prova: único caso no alvo (fase 2 ≤ 60
   min) do Charles foi o LEVE (51 min); hermes E+C = 27-48 min (30-55% da fase 2); Derick em LEVE 28.
2. **Preset `equilibrado`: gate c1 em Sonnet, Opus só quando o c1 reabre o desenho (item 13)** —
   `PERFIL-PROJETO.md` + 3 perfis (tabela de expansão com linhas c1/c2 do beholder e michelangelo),
   `harness-ui.mjs`/`harness-config.html` (matriz e modelo efetivo por agente), `/prd` Passo 1 e
   10.1. Ciclo 1 do beholder e do michelangelo em Sonnet; ≥ 3 🔴 ESTRUTURAIS (mudam escopo, divisão
   de tasks, schema ou integração — `HARNESS_GATE_ESTRUTURAIS_OPUS`, 3) no c1 = o desenho reabriu e o
   c2 desse gate sobe para Opus UMA vez (c3+ Sonnet). `maximo` mantém Opus no c1; override
   `Modelo do beholder: opus` no Perfil vence. 2 ciclos base continuam. Medido até 04/09: equipe em
   Sonnet fecha a fase 2 em 28-63 min, Charles com Opus no c1 em 86-201; achados por ciclo 9,1,2 /
   7,1,1 — o c1 acha, os demais confirmam. Medir com `min_gates` e `achados_por_ciclo`.
3. **Packet por função para TODO arquivo > 40 KB (alvo e contexto) + fatiar por previsão (item 9)** —
   `hooks/task-packet.sh`: a seção "Arquivo(s) Afetado(s)" da task separa ALVO (o que muda) de
   CONTEXTO (citado fora dela — helper, precedente; nova seção 5 do packet; task sem a seção = tudo
   alvo, como antes); qualquer arquivo de código acima de `HARNESS_PACKET_ARQ_KB` (40) entra por
   esqueleto + corpo só das funções citadas, seja alvo ou contexto (`HARNESS_PACKET_ESQUELETO`
   on|alvos|off); arquivo grande sem funções (css/html/sql/json/yml/md) entra pelo cabeçalho (120
   linhas). `--check`: `PREVISAO` acima de `HARNESS_TASK_PREVISAO_MAX_MIN` (45) entra no VEREDITO —
   `PACKET-CHECK|…|GRANDE|previsao 60>45 min` (7º campo = motivos, só quando GRANDE) — e a `/prd`
   Passo 8 fatia antes do gate, igual ao GRANDE por linhas/KB/alvos; o hermes recebe "fatie quando o
   `--check` prever > 45 min" na mesma frase dos 230/4/300 KB. Prova: PRD-135-b, 4 de 8 tasks com
   66-141 min tendo 215 linhas (o teto de linhas não previu); packets de 62-134 KB.
4. **`Duelo: sim` só quando há chance real de aplicar (item 11c)** — `task-packet.sh --check` imprime
   `DUELO-CHECK|<task>|ok` ou `|inelegivel|<motivo>`: elegível só com ≤ 2 arquivos-alvo de PRODUÇÃO e
   nenhum arquivo NOVO (citado como afetado e ausente no repo = novo; spec/doc não contam). A `/prd`
   Passo 8 rebaixa `sim` → `nao — <motivo>` na própria task (o guard-agent lê o campo). Task com
   Duelo auto/nao sai `n/a`; `HARNESS_DUELO_CHECK='off'` desliga. Prova: 24 duelos desde 01/09, 4
   aplicados; diff de arquivo novo ou de 3+ alvos nunca aplicou (US$ 0,17 e 3 min por task).

Testes: `tests/t-3424-leve-packet.mjs` (sandbox próprio `harness-3424-leve-sandbox`: esqueleto para
alvo e contexto, knobs, cabeçalho de arquivo sem funções, compat sem seção de afetados, DUELO-CHECK
nos 6 casos, PREVISAO semeada > 45 → GRANDE no veredito, UI sobe e a matriz/`/api/state` expõem o
equilibrado com c1 Sonnet e o override vencendo, greps das frases novas/antigas) —
`node tests/t-3424-leve-packet.mjs`. `t-3422-onda-a.mjs` e `t-3421-maquina.mjs` continuam verdes.
5. **Codex com validade + SOLO oficial = SOLO-2 (item 10)** — `harness-delegate.sh --preflight codex-cli`
   reconhece resposta de LIMITE DE USO ("usage limit", "rate limit", "try again at …", "resets in …") e
   grava `ate=<epoch>` no `.harness-run/preflight-codex-cli.status` (data da mensagem — ISO, "2:05 PM on
   Sep 7", "in 3 hours"; sem data, +24 h — `HARNESS_DELEGATE_LIMITE_H`). Até lá o preflight responde
   `PREFLIGHT|indisponivel|codex-cli|limite-ate <dd/mm HH:MM>` SEM pingar (o TTL de 30 min não se aplica;
   `--force` pinga), o breaker recusa delegação ao Codex na hora e o SessionStart (`doctor-cached.sh`)
   anuncia "[doctor] Codex fora até <data> — review em SOLO-2". Medido 04/09: 5/5 preflights reprovando no
   PC (limite até 07/09) e o ping repetindo a cada run. **SOLO-2:** com o revisor externo fora, a Fase 2 da
   `/prd-exec`, a `/codex-review` e a `/dt-exec` despacham DOIS `sherlock` na MESMA mensagem sobre o MESMO
   review packet, com lentes DISJUNTAS por prompt (`Lente: A` = correção/lógica + segurança + armadilhas
   do Perfil + datas + idempotência; `Lente: B` = invariantes do gate + contratos/regressão + compat de
   produção + banco/migrations + testes) e a pai cruza como cruzaria Codex + sherlock (achado nos dois =
   quase certo; num só = verificar pela confiança declarada). Um sherlock só fica para `--apenas-sherlock`,
   lote leve e rito mínimo. O `sherlock.md` aceita `Lente: A|B|completa` (default completa = comportamento
   atual) e, em qualquer lente, aplica a **regra de cobertura**: reporta TODO achado (inclusive incertos e
   de baixa severidade) com confiança alta/média/baixa + severidade estimada — a triagem é da sessão-pai;
   só nit puro de estilo/nome fica de fora. Substitui o "em dúvida, Sugestão" (a documentação dos modelos 5
   mostra que filtro de severidade no prompt do revisor derruba o recall: o modelo obedece literalmente).
   O modo real vai ao stop das skills como `--review-modo=<dupla|solo-2|solo|partes>` (painel por dev
   mostra taxa de dupla real — item 15/Onda B). Medido 29/08–04/09: 100 % SOLO no Charles, 6/6 no João;
   Derick com dupla real em 6/7; a compensação "4 sherlocks" só existia ad hoc (PRD-135-b).
6. **Duelo só quando há chance real de aplicar; pool obedece ao placar (item 11 a/b/d)** —
   (a) `harness-duelo.sh` **SERIAL** (`HARNESS_DUELO_SERIAL='on'`): roda o worker A, faz `git apply --check`
   do diff A e SÓ paga o worker B se A não aplica; A aplicável = B não pago (evento `duelo` com
   `serial:"on"`, `pulou_b:"1"`, `status_b:"pulado"`; vencedor A por W.O. serial — hefesto aplica, lint,
   spec e gates seguem iguais); os dois inaplicáveis = `nenhum` sem juiz. `off` = paralelo + juiz (o duelo
   original). O check é isolado por construção (`git apply --check` não escreve e os workers são read-only —
   sem worktree temporário). Lado `pulado` não conta no placar do modelo. Medido 01–04/09: 24 duelos, 4
   aplicados (3 com remendo manual), 5 W.O., 3 nenhum; PRD-138 TASK-001 US$ 0,17 e 3 min por 0 diffs
   aplicáveis. (b) Loop `--tools` do executor openrouter com **teto de turnos**
   `HARNESS_DELEGATE_TOOLS_MAX_TURNOS='4'` (acima, o broker encerra pedindo o resultado final sem tools —
   `teto_turnos:1` no evento), kill switch `HARNESS_DELEGATE_TOOLS='off'` e lista por modelo
   `HARNESS_DELEGATE_TOOLS_OFF_MODELS='qwen/qwen3-coder-next'` (rodam como completion cega). Prompt caching:
   o broker só MEDE (`usage.prompt_tokens_details.cached_tokens` → `tokens_cached` no manifest); não há campo
   universal para pedir cache no OpenRouter e a 3.4.24 não inventa um. Medido: qwen3-coder-next 1,74 M tokens
   de entrada para packet de 104 KB (o loop reenviava o contexto e o provedor cobrava tudo), 0/5 vitórias,
   5/5 inaplicáveis. (d) Roteamento pelo placar **REMOVE** (`HARNESS_DUELO_PLACAR_REMOVE='on'`) o modelo que
   cruza a régua (≥ 5 duelos e < 20 % vitórias, ou > 40 % inaplicável): sai do pool da rodada INCLUSIVE do
   rodízio de exploração (cada 4º duelo) enquanto a régua valer na janela; sobrou < 2 mesmo promovendo
   suplentes = `DUELO|indisponivel` (nunca reabilita o reprovado em silêncio); evento `pool` ganha
   `removido:"<modelo>"`. Antes o modelo era só rebaixado e o rodízio o trazia de volta. `off` = rebaixa.
   Correção de tabela: `process.exit()` com sockets keep-alive vivos crashava o executor openrouter no
   Windows após vários turnos (Assertion UV_HANDLE_CLOSING, exit 127) — agora `process.exitCode` +
   `Connection: close`. `HARNESS_OPENROUTER_URL` permite apontar o executor (e o preflight) a um proxy/stub.

Ajustes cruzados: a `/prd` (preflight da decolagem) trata `limite-ate` como "não tente de novo nesta run";
o dashboard não conta o lado B `pulado` do duelo serial como duelo do modelo B. Testes:
`tests/t-3424-leve-packet.mjs` (55) e `tests/t-3424-review-duelo.mjs` (43); `t-3421`/`t-3422`/`t-3423-*`
continuam verdes.

## 3.4.23 — 2026-09-08 — Onda B: painel por dev/máquina, cobertura, incidentes, permissão por máquina

Itens 15, 16 (já na 3.4.22), 17, 18 e 11e do plano de retomada. Publicada junto com a 3.4.24 (mesmo
commit); a numeração segue a convenção PATCH por onda.

1. **Dashboard por dev/máquina, sem pontos cegos e sem lixo (item 15)** — `hooks/harness-dashboard.mjs`:
   (a) linha de WORKTREE (`projeto:"<nome>--wt-<x>"`, arquivo `~<x>`) entra no projeto `<nome>` com o rótulo
   `worktree=<x>` em runs/, tasks/ e incidentes/ (era descartada como "linhagem de clone" — as 3 execs mais
   pesadas de 03–04/09 não existiam no painel; medido agora: 43 execs de worktree do Charles voltaram);
   (b) o `harness-metrics.sh stop` grava campos ESTRUTURADOS `modo` (leve|turbo|noturno|normal), `limitou`,
   `review_modo` (dupla|solo|solo-2|partes), `codex` (ok|indisponivel), `stalls`, `tasks_estouradas`
   (derivado das linhas de tasks/ da máquina na janela da run, > 45 min), `spawn_ms` (spawn-history do
   doctor), `frentes` (ocupação do semáforo no fechamento), `perguntas` (AskUserQuestion no transcript
   principal — separado de `permission_prompts`) e `waits_invalidas` (parser tolerante do
   permission-waits, item 15f) — o `extra` livre continua; schema segue `2.15.0` (só acrescenta);
   (c) run com `elapsed_s` > 12 h é "suspeita": fora de mediana/p90/top/alertas, seção própria (7 runs de
   até 21.901 min entravam nas medianas; hoje 10 na janela de 30 d);
   (d) dedup também por mesmo label + `ts_end` a ≤ 60 s (Caronte PRD-013-fase2 2×, newportaltefnet
   PRD-114-b-fase2 3× — 92 duplicatas removidas na base real); `metrics-auto` NÃO sobrescreve marcador já
   existente do mesmo rótulo e recusa `/prd-exec` sem número; `start` recusa `PRD-000-exec`/`PRD--exec`;
   (e) seção fixa "Por dev / máquina" (a §8.1 da análise de 04/09): n runs, versões, f1/f2/exec medianos,
   prompts (total · por run), perguntas, negações, preset/review/modo mais usados, codex ok/indisponível,
   spawn mediano, stalls, tasks acima do envelope, suspeitas, worktrees — e o mesmo corte "Por versão";
   (g) INCIDENTES com schema único `{ts, projeto, maquina, harness, tipo, papel, rotulo, agent, detalhe}`
   em `prds/_metrics/incidentes/<dev>@<host>.jsonl` (versionado; o stop faz `git add`): `overrun` do
   `guard-agent --post`, `folego` do `guard-folego`, `frentes` do semáforo (`stall`/`denied` reservados);
   os logs locais antigos continuam. Seção "Incidentes" por tipo/papel/dev. Helper `hooks/_incidente.sh`;
   (i) `tree_tocado=SIM` em delegação read-only vira "investigar" (fingerprint = git status + diff --stat;
   pode ser index refresh), não alerta 🔴.
2. **Cobertura e frescor (item 17)** — seção "Cobertura" no `--all`: por repo (versão do `harness.env`,
   branch via `.git/HEAD`, último run de toda a história, devs, runs em 14 d, run ABERTA = marcador
   `.harness-run/*-exec.json|*-fase*.json` com start há > 12 h) e por dev (repos, último run, silêncio em
   dias, prompts/negações por run). Repo com harness e zero runs aparece (o ponto cego: na base real,
   16 repos com harness e `nunca`/0 runs; meuanuncio-api com 9 marcadores abertos há ~80 dias;
   caronte PRD-1642-exec aberta há 85 h). Uma linha `COBERTURA|<repo>|<versão>|<branch>|<último run>|<devs>|<runs14d>|<aberta?>`
   por repo no stdout — o `/prometeu --check` pode montar a coluna a partir dela (nota na skill).
3. **Duelo: custo por diff APLICADO (item 11e)** — por modelo: custo total ÷ duelos em que venceu E o
   evento `aplicado` foi `ok` (PRD-138: US$ 0,17 por 0 diffs = n/d), coluna "candidato a sair" quando cruza
   a régua (≥ 5 duelos e < 20% vitórias, ou > 40% inaplicável/falho) e alerta quando pagou ≥ 3 duelos
   sem aplicar nada.
Knobs: `HARNESS_DASHBOARD_SUSPEITA_H` (12), `HARNESS_DASHBOARD_DEDUP_S` (60), `HARNESS_DASHBOARD_COBERTURA` (1),
`HARNESS_DASHBOARD_ABERTA_H` (12), `HARNESS_METRICS_DERIVAR` (1), `HARNESS_METRICS_AUTO_REUSA` (1),
`HARNESS_INCIDENTES` (on). Testes: `tests/t-3423-painel.mjs` (45 casos: dashboard --all com 3 projetos
falsos + worktree + run > 12 h + duplicada ±30 s, por dev/versão, cobertura, incidentes, duelo, stop com
flags e derivados, start/auto recusando rótulo sem número e não sobrescrevendo, incidentes reais via
guard-agent --post / guard-folego / frentes cheias, git add).
4. **Permissão por máquina (item 18)** — medido 04/09: João 76 prompts de permissão em 11 runs,
   Giovanny 52 negações do classificador em 33 runs, Charles 27 prompts "permission to use
   AskUserQuestion" em 2 dias e 59 min de espera humana numa exec "noturna autônoma";
   `permissions.allow` do Mariana vazio. Quatro peças, todas ligadas por padrão:
   (a) **a allowlist viaja no sync, por UNIÃO** — `harness-sync.sh` leva a seção
   `permissions.allow` do settings.json do mestre para o projeto além da `hooks`: o que o projeto
   já tem fica, o que falta entra, nada é removido (linha `SETTINGS|permissions|ok|difere|
   atualizado|local-preservado|criado|desligado`; escape `"harness":{"permissions":"local"}`,
   `hooks:"local"` vale para as duas; `HARNESS_SYNC_PERMISSIONS=0` desliga). Mínimo canônico do
   mestre (19 regras ESTREITAS, formato documentado `Bash(cmd sub:*)`): **`AskUserQuestion`**
   (decisão do Charles 08/09 — a pergunta já é a parada; a permissão para perguntar era uma
   segunda parada inútil), helpers do harness (doctor, metrics, worktree info/lock/unlock,
   task-packet, review-packet, perfil-frescor, agent-stall, carga-maquina, frentes, task-telemetry)
   e git read-only (status/diff/log/show/rev-parse/ls-files). Regra de projeto (php/node/wrapper
   de banco) continua vindo do Perfil: `--gen-allowlist` agora emite `:*`, inclui o canônico, e o
   NOVO `--apply-allowlist [--sugeridas]` aplica por união com backup em
   `.harness-run/allowlist-backup/`.
   (b) **`hooks/guard-question.sh`** (PreToolUse `AskUserQuestion`, BLOQUEANTE): em modo autônomo
   a pergunta é NEGADA com "decida pelo default declarado no Passo 0.3 e registre em Decisões
   pendentes". Modo autônomo = `HARNESS_MODO=noturno|turbo` no ambiente OU marcador
   `.claude/.harness-run/modo` (1ª linha `noturno`/`turbo`), escrito pela `/prd-exec --noturno`
   (novo flag), `/dt-exec --aceito`, TURBO NOTURNO e `scripts/noturno.sh` (que também exporta a
   variável). Ninguém apaga o marcador: com mtime > `HARNESS_MODO_TTL_H` (12 h) ele é ignorado.
   Fora do modo autônomo passa sempre — a entrevista única continua legítima. Skills: Passo 0.3
   item 7 (prd-exec) / Passo 0.3 (dt-exec) declaram os defaults (escopo → o menor; nome → o do
   glossário/Perfil; teste → `n/d (coberto pelo acceptance)`; tolerância → SEGUIR + DT) e o Output
   ganhou "Decisões pendentes". `HARNESS_GUARD_QUESTION=off` desliga.
   (c) telemetria: perguntas negadas em `.harness-run/guard-question.jsonl`, separadas de
   `permission-waits.jsonl` (prompts + negações do classificador) — o `harness-metrics` conta
   `perguntas` a partir daí (item 15).
   (d) **negação recorrente vira sugestão**: `denied.sh` conta por comando normalizado
   (`php artisan test`, `npx playwright test`) em `.harness-run/denied-recorrentes.jsonl`; o
   doctor lista os negados 3+ vezes em 7 dias com a regra estreita pronta
   (`Bash(npx playwright test:*)`), o `--gen-allowlist` os traz numa seção "sugeridas pelas
   negações" e `--apply-allowlist --sugeridas` aplica. Um token só (`php`, `mysql`) nunca vira
   regra larga. Manutenção de carona: o doctor 3.4.22 referenciava `$PROJECT_ROOT` (inexistente)
   e, com `set -u`, morria no meio do `check_autonomia` — corrigido para `$PROJECT_DIR`.
   Testes: `node tests/t-3423-permissao.mjs` (49).

Ajustes cruzados desta onda: `/prd` escreve o marcador `.harness-run/modo` em `--noturno`/TURBO NOTURNO;
`tests/t-3422-onda-a.mjs` ganhou sandbox por pid e `--stop` do daemon ao sair (um daemon órfão segurava o
sandbox da rodada seguinte). Testes: `tests/t-3423-painel.mjs` (45) e `tests/t-3423-permissao.mjs` (49).

## 3.4.22 — 2026-09-08 — Onda A: fôlego por hook, telemetria por task, hermes por documento, manutenção

Itens 7, 8, 14, 16 e 20 do plano de retomada (`prds/PLANO-3.4.22-a-3.4.25-itens-7-20.md`), aprovados
pelo Charles em 08/09 com os refinamentos abaixo. Regra da casa em todos: instrução não segura, hook
segura; tudo nasce ligado com kill switch; o agente não vê contador (modelos 5 têm ansiedade de
contexto documentada quando enxergam contagem regressiva).

1. **Teto de fôlego ENFORÇADO (item 7)** — `hooks/guard-folego.mjs`: em subagente, acima do teto
   de chamadas do papel (hefesto/dedalo 90 · sherlock 80 · beholder/michelangelo 60 · hermes 120 ·
   themis 40 · default 100 — `HARNESS_FOLEGO_<papel>`), toda ferramenta é NEGADA exceto Write/Edit
   do relatório; o agente devolve PARCIAL-TEMPO e a sessão-pai decide. Conta `tool_use` do
   transcript com cursor por agente (`.harness-run/folego/`). Roda dentro do `guard-bash` (Bash) e
   do daemon (rota `/h/PreToolUse/guard-folego` para `Edit|Write`, fallback `node`) — zero spawn
   novo; leitura pura não é conferida de propósito (custo de spawn, 3.4.21). Sessão pai nunca.
   Telemetria `.harness-run/folego.jsonl`. Os contratos de hefesto/dedalo/hermes trocaram "~60/80/120
   chamadas" por "o hook nega; devolva PARCIAL". Prosa das skills idem.
   **Barreira do `general-purpose` (7b):** despacho de TASK/DT com packet ou review "ciclo N" em
   `general-purpose` é negado pelo `guard-agent` com o papel certo na cara (escape: `fallback:` no
   prompt; `HARNESS_GUARD_GP=off`). Discovery/votação da `/prd` segue passando.
2. **Telemetria por task no SubagentStop (item 8)** — `hooks/task-telemetry.mjs`, chamado pelo
   `presence.mjs --agent-end` (mesma requisição, também no daemon): uma linha por subagente terminado
   em `prds/_metrics/tasks/<dev>@<máquina>[~wt].jsonl` (versionado, append-only por dev) com papel,
   rótulo (TASK/DT/PRD/LOTE + ciclo), **modelo real**, duração, turnos, chamadas por ferramenta,
   tokens, status (✅/⚠️/⛔/PARCIAL), 🔴 do revisor, KB/alvos do packet, worktree. Os marcadores
   `.harness-run/watchdog/*.start` da 3.4.7 morreram (o doctor apaga os órfãos); o `guard-agent
   --post` lê a última linha do papel e avisa overrun/PARCIAL; o `watchdog-baseline.sh` deriva o p90
   dessas linhas (30 dias, ≥ 5 amostras) antes do dashboard; `task-packet.sh --check` imprime
   `PREVISAO|<task>|<min>|n=<k>` (mediana do papel com packet de tamanho parecido; > 45 min = GRANDE;
   sem histórico `n/d`). Dashboard: seção "Tasks medidas no SubagentStop" (duração por papel, acima do
   envelope) + `tasksPorPapel`/`tasksAcima` no JSON. Isso é o que permite decidir preset por dados
   (achados e duração por modelo) — item 13 e a melhoria 5 da revisão de modelos.
3. **Hermes por documento (item 14)** — na `/prd` 10.2 quem aplica os patches se decide pelo nº de
   DOCUMENTOS: até 3 a pai aplica com script; 4+ = um hermes Modo C por documento, todos na mesma
   mensagem. O teto de 120 do hermes virou deny natural do guard-folego (era aviso); o `--post` avisa
   quando o retorno veio PARCIAL para a pai despachar o restante daquele documento.
4. **Telemetria chega ao git sozinha (item 16)** — `harness-metrics.sh stop` faz `git add` só dos
   arquivos DESTA máquina (`runs/` e `tasks/`; nunca `_metrics/` inteiro, nunca commit) e imprime a
   linha "Telemetria no git: staged"; `guard-stop.sh` bloqueia 1×/dia quando há telemetria
   modificada há > 1 h fora do stage. Skills citam no fechamento. `HARNESS_METRICS_GIT_ADD=0` desliga.
5. **Manutenção (item 20)** — `agent-stall.sh` sem `find -printf` (macOS devolvia `vivos=0` em
   silêncio; agora `stat` GNU/BSD); `guard-agent` aceita o sufixo de fatia no review-packet
   (`PRD-136-b` ou o da mãe); `denied.sh`/`notify.sh` limpam controle/tab/quebra de linha do
   `permission-waits.jsonl` (16/83 linhas inválidas); doctor apaga `.start` órfãos e cobra o wiring
   do guard-folego. **Pedidos à equipe (não é código do mestre):** Giovanny — renomear
   `tests/e2e/com9/` do `modulo_agente` (nome reservado no Windows, pull falha) e versionar o
   `.claude/harness.env` do `bonifica-pedidos` (o `*.env` do `.gitignore` o engole); Marcos — fechar a
   run `PRD-002-exec` da `integracao-tefnet-fiserv` aberta há 15 dias; Débora — com o item 16 os
   runs sobem sozinhos no próximo stop. Item 20.6 (delegações read-only com `tree_tocado=SIM`): o
   fingerprint é `git status --porcelain -- .` + `git diff HEAD --stat -- .`; fica marcado como
   "investigar" no painel por dev da Onda B (3.4.23).

Testes: `tests/t-3422-onda-a.mjs` (sandbox próprio: guard-folego pai/sub/teto/relatório/knob, daemon
via rota, task-telemetry com transcript fake, p90 e PREVISAO, guard-agent general-purpose e fatia,
agent-stall, denied/notify, metrics stop com git add, guard-stop) — `node tests/t-3422-onda-a.mjs`.
`node tests/t-3421-maquina.mjs` continua verde (69).

## 3.4.21 — 2026-09-05 — a máquina: menos processos por chamada

Diagnóstico (`prds/ANALISE-TELEMETRIA-2026-09-04.md`, §9): no PC do Charles a criação de processo é
SERIALIZADA (~20/s em qualquer paralelismo — fork emulado do MSYS + Integridade de Memória (HVCI)
ligada + Defender), e o harness criava ~10 processos por chamada Bash de agente (bash + comando +
3 hooks × bash + bash + node). Com 3 frentes o spawn foi a 1.382 ms; em repouso é 29 ms (= Derick).
65% das 3.007 chamadas Bash de subagente em 2 dias eram leitura pura. Seis peças, todas hook/código
(a dica da 3.4.12 provou que instrução não segura):

1. **GUARDA 0 do `guard-bash`** (`.mjs` + `.sh`): leitura pura via Bash em SUBAGENTE é NEGADA com a
   ferramenta certa na cara (`Read "arquivo" offset/limit`, `Grep pattern= path= output_mode=`,
   `Glob pattern=`). Pipeline só de leitura também. Awk/sort/php/git/npx passam.
   `HARNESS_GUARD_READ_VIA_BASH='agentes'|'todos'|'off'`. Telemetria: `.harness-run/guard-bash-leitura.jsonl`.
2. **`guard-bash --post` faz a presença no mesmo processo** — o hook `presence.mjs --prompt` saiu
   do matcher `Bash` (2 hooks → 1 por Bash; o throttle de 5/10 min decide dentro, sem spawn).
3. **`harness-daemon.mjs`** — Node persistente por máquina (127.0.0.1:47831) atende guard-bash
   pre/post e presença de TODOS os projetos (contexto por `cwd`); o hook vira `curl` nativo com
   fallback `node` (pré-guard fail-CLOSED: deny "re-execute uma vez"; pós/presença fail-open de 1
   heartbeat). Sobe no SessionStart (`--ensure`), marcador `.harness-run/daemon.on` por projeto,
   reinicia sozinho quando o hash dos hooks muda (sync), encerra após 6 h ocioso. `HARNESS_DAEMON=off`.
4. **Doctor mede o spawn a cada sessão** (`doctor-cached.sh`: mediana de 5 `bash -c true`, histórico
   em `~/.harness-run/spawn-history.jsonl`, alerta acima de 4× `HARNESS_SPAWN_REF_MS`=33) e o
   `harness-doctor.sh` cobra daemon/curl/frentes. Exclusões do Defender e HVCI são decisão da
   máquina (ONBOARDING 3.4.21).
5. **Semáforo de frentes por máquina** (`frentes.mjs` + `guard-agent.sh`): 1 frente pesada por PC
   Windows (2 no macOS, `HARNESS_FRENTES_MAX`); slot por rótulo em `~/.harness-run/frentes`,
   adquirido no 1º despacho de executor, renovado a cada despacho, liberado no `stop` da telemetria
   (expira em 45 min). Cheio ⇒ deny com `frentes.mjs wait` (autônomo) ou decisão do usuário.
   `noturno.sh` recusa rodar LOCAL em Windows (Mac ou `--cloud`; `--forcar-windows`).
6. **`sessoes.mjs`** — lista as sessões do Claude Code vivas na máquina, aponta as ociosas (transcript
   ou CPU/filhos entre amostras) e FECHA sob comando (`--fechar [--pid N]`), preservando o transcript
   (retomável). O doctor de worktree lista (`DOCTOR|sessao-ociosa|…`) em vez do bloco PowerShell
   antigo; `HARNESS_SESSAO_OCIOSA_MIN`=120.

Testes: `tests/t-3421-maquina.mjs` (69 casos em sandbox próprio: classificador `.mjs` e `.sh`, presença
in-process, daemon via HTTP e via `curl -sf`, reinício por hash, frentes com stale/off/max, sessões) —
`node tests/t-3421-maquina.mjs`. Validado ponta a ponta no Mariana com o comando real do settings
(deny em 196 ms pelo daemon; fallback fail-closed e volta ao `node` conferidos). Publicado 05/09 em
dra-mariana-duarte, caronte, universitarias-vip e nas réplicas; demais projetos via `/deus`.
Decisões de máquina (Defender/HVCI) no ONBOARDING 3.4.21.

## 3.4.20 — 2026-09-03 — cinco melhorias das execs da madrugada (PRD-137 210 min; PRD-012-b)

Primeira exec inteira no harness novo: PRD-137 em **210 min** (136: 351; 135: 468), 1 ciclo, 74 M
tokens (172 M / 301 M). O que ainda limitou e o que muda:

1. **Dono de arquivo na criação** — `task-matrix.sh "<glob>"` monta a matriz arquivo × task e acusa
   `MATRIZ-HUB` para arquivo de produção em 3+ tasks (137: `sugerir_resposta.php` em 5 tasks →
   `limitou=mutex`). Roda na conferência mecânica do Passo 8 e após cada lote de correção; hub vira
   task própria ou módulo novo + 1 linha. Hermes recusa plano com 3+ tasks no mesmo arquivo.
2. **Watchdog que age** — (a) michelangelo perdeu as ferramentas do browser pane: evidência só por
   `npx playwright screenshot` (137: dois michelangelos 10 min mudos no pane); (b) a última task
   (doc raiz/DT INDEX/Perfil) é da sessão pai, como a acceptance (o hefesto travou; a pai fez em
   3 min); (c) `agent-stall.sh N` lista agente vivo sem escrever no transcript há N min — a exec
   arma `Monitor` com ele a cada onda e faz `TaskStop` + redespacho único (`HARNESS_STALL_MIN`, 4).
3. **Hermes Modo C em dois** — patches em 4+ documentos = dois hermes na mesma mensagem (produto +
   técnica | tasks), com o teto de 120 chamadas lembrado no prompt (012-b: 19 min / 239 turnos em
   série, o maior bloco da fase 2).
4. **Reconferir depois de corrigir** — `--check` conta linhas a partir de "## Objetivo" (desconta
   as ~29 do cabeçalho) e roda de novo, com a matriz, após cada lote de correção do gate (012-b:
   216 → 224 linhas após o Modo C).
5. **Orçamento com contingência + stop que se preenche** — envelope ganha "+50% se um gate reabrir
   o desenho"; ao passar de 1,5× anuncia e segue, registrando no `--extra`. O `stop` deriva
   `subagents` (janelas medidas), `ciclos` (maior "ciclo N" dos revisores) e `tasks` (arquivos da
   PRD) quando a sessão não passa — a 135 gravou os três vazios.
6. Codificado: nits 🟡/🔵 baratos podem virar um grupo próprio **só** em paralelo com os
   bloqueantes (137: 4 nits num hefesto, custo zero de parede).

## 3.4.19 — 2026-09-02 — cinco otimizações da execução (medidas nas execs PRD-135/136)

1. **Review antecipado do backend (1.3 item 4b).** Quando todas as tasks `backend` fecharam e só
   resta front em voo, o sherlock "ciclo 1 (backend)" sobe na hora com o packet só dos alvos do
   backend (`review-packet.sh --so-alvos`); o front recebe "ciclo 1 (front)" ao fechar e o ciclo 2
   já é delta. Na PRD-135 o backend estava pronto às 18:26 e o review só subiu às 19:21.
2. **Review packet em PARTES, nunca truncado.** Acima de `HARNESS_REVIEW_PACKET_KB` o diff é
   fatiado por arquivo em `<LABEL>.review-packet.md`, `-2.md`, ... (cada parte com stat +
   contratos); saída ganha `|<N partes>` e a skill dispara um sherlock por parte, em paralelo.
   Arquivos NOVOS (untracked) entram como diff de criação — o sherlock da 135 leu 16 do disco.
3. **Lint do projeto dentro do executor.** Hefesto/dedalo rodam o comando de lint do Perfil nos
   arquivos que tocaram, antes de devolver; a 1.4 só confirma e nunca abre rodada de lint com
   agente (PRD-135: 23 min em duas rodadas).
4. **Rerun transversal da família em paralelo com o ciclo 2**, em background e, com Playwright e
   6+ specs, em dois shards. Na 135 a família inteira rodou em série antes do ciclo 2.
5. **Packet por FUNÇÃO para arquivo-alvo gigante** (> `HARNESS_PACKET_ARQ_KB`, 40): esqueleto com
   assinaturas + corpo só das funções que a task cita (TASK-004 das duas PRDs: 51–57 min sobre
   arquivos de 60–120 KB inteiros). **Duelo desligado em task que cria arquivo**
   (`DUELO|desligado|…|arquivo-novo`; `HARNESS_DUELO_ARQUIVO_NOVO=1` força) — o vencedor da TASK-003
   da 135 "aplicou" com métodos inexistentes.
6. **Telemetria honesta de novo (correções, 02/09 23:50, achadas pela exec/criação do Caronte no
   Mac):** (a) `harness-metrics-auto.sh` lê o número IMEDIATAMENTE após `/prd-exec` (prompt combinado
   gerava `PRD-4610-exec.json`, e `PRD-012` com zero à esquerda virava OCTAL no `printf %03d` →
   `PRD-010-exec.json`; exec com duração zero); (b) `stop` sem marcador de start grava
   `ts_start`/`elapsed_s` = null e imprime AVISO + `TELEMETRIA|sem-start|<label>`, nunca "0min 0s"
   mudo; (c) `baseline` lia `duration_min` (schema antigo) e devolvia 0 desde a 2.14 — agora
   `elapsed_active_s`/`elapsed_s` em MEDIANA, ignorando linhas sem start e > 24 h; (d) Passo 0.2 das
   duas skills: pull que trouxe `harness.env`/a própria SKILL avisa e PARA (a skill em contexto é a
   velha); (e) `/prd-exec` 0.3 confere o marcador do cronômetro antes de decolar.
7. **Calibração pela PRD-012-b do Caronte (03/09):** `task-packet.sh --check` conta só arquivo de
   PRODUÇÃO no critério de alvos (saída `<prod>/<total>`; specs e docs de uma linha marcavam GRANDE
   falso em 3 de 9 tasks); alvo de tamanho passa a **~200 linhas, teto duro 230** (dois hermes
   convergiram em 218 com o "~180" no prompt); `guard-agent` não exige packet fora do contexto de
   exec (dedalo Modo P/R na criação era negado por rótulo DT citado no prompt).

## 3.4.18 — 2026-09-02 — refino da EXECUÇÃO (medido nas execs PRD-135/136)

Duas execs de 12 e 10 tasks levaram 256 min de parede cada até o ciclo 2 (faixa histórica
176–282). Onde foi o tempo, com dado, e o que muda:

1. **Front constrói contra o CONTRATO e sobe para a onda 1.** Nas duas execs o front esperou o
   endpoint existir (PRD-135: TASK-007 esperou 2h pela TASK-004 de 57 min) para consumir um
   contrato escrito na técnica desde a criação. Agora `[requires]` de task `front` sobre
   endpoint/payload com contrato na técnica é **derrubado** pelo gate de largura (vira
   `[barrier: integração]`, cobrada na acceptance da onda B); o dedalo constrói com fixture local.
   E **duas tasks de front nunca escrevem o mesmo arquivo** (PRD-136: mutex de front = 110 min em
   série): código novo nasce em módulo próprio; `[mutex]` entre fronts é defeito de fatiamento.
2. **Tamanho de task ENFORCADO na criação.** `task-packet.sh --check` mede cada task
   (`PACKET-CHECK|TASK|KB|alvos|linhas|ok|GRANDE`; GRANDE = > 300 KB, > 4 alvos ou > 230 linhas —
   `HARNESS_PACKET_MAX_KB`, `HARNESS_TASK_MAX_LINHAS`) na conferência mecânica do Passo 8, e task
   GRANDE é fatiada **antes do ciclo 2 dos gates**, nunca na exec (a 135 refatiou duas em voo).
   O hermes recusa escrever task acima do teto e devolve a proposta de corte.
3. **Teto de carga só pela medição.** `carga-maquina.sh` deixa de cortar executores por contagem
   de frentes: até 3 frentes = paralelismo pleno; 4+ = alerta (`CARGA|alta`), nunca corte; só
   spawn LENTO medido imprime `CARGA|vivos|2`. Medido 02/09: 2 execs + 1 sessão com spawn de
   0,15–0,8 s o dia inteiro, e a PRD-135 se cortou para 2 vivos por "3 frentes".
4. **🔴 da criação vira INVARIANTE VERIFICÁVEL.** Os 8 bloqueantes de código do ciclo 1 da exec
   da 135 (overpayment, taxa da financeira, resíduo de arredondamento) eram da mesma família dos
   🔴 que o beholder marcou e a spec "corrigiu" em 4 ciclos — a regra existia em prosa e ninguém a
   provou. Agora cada 🔴 de regra corrigido no Passo 10.2 ganha uma linha na seção nova
   **"Invariantes do gate"** da task implementadora (TEMPLATE-TASK: regra + prova executável +
   origem); o hefesto/dedalo **roda a prova antes de devolver** (PARCIAL sem ela) e o sherlock
   **começa o ciclo 1 por ela** (aberto = 🔴). Hermes Modo C grava a linha quando o patch pronto
   a traz.

5. **Sufixo de fatia no id da task** (`TASK-006b`): `task-packet.sh`, `guard-agent.sh` (watchdog e
   packet) e `harness-duelo.sh` passam a incluir a letra no id — antes `TASK-006b` gerava/procurava
   `TASK-006.packet.md` e colidia com a TASK-006 (PRD-136, 02/09).

Pendências registradas para a 3.4.19: review-packet truncado em 200 KB (diff de 3.004 linhas na
135 — o sherlock leu o resto do disco); `HARNESS_CODEX_REPORTS=/tmp` bloqueado no Windows (caiu
no default).

## 3.4.17 — 2026-09-02 (fecha a limitação da 3.4.16)

**Agente com identidade única por despacho na presença.** A 3.4.16 chaveava a linha do agente
por `<pai>-<tipo>`; dois agentes do mesmo tipo em paralelo (o caso normal do `/prd-exec`: "onda 3:
TASK-006 dedalo, TASK-007 dedalo") faziam upsert na mesma linha e o painel mostrava 1 avatar —
regressão contra o cenário 3 da PRD-011 do Caronte ("dois hefesto na mesma onda são DOIS avatares").
Agora `session = <pai>-<tipo>-<8 primeiros do agent_id>` e o payload leva `agent_id` inteiro:
1. **Anúncio sai dos hooks `SubagentStart`/`SubagentStop`** (settings.json, viaja no sync), que
   entregam `agent_id` + `agent_type` no input. O anúncio pelo pai no guard-agent (3.4.14) não tinha
   id; virou fallback opt-in `HARNESS_PRESENCE_ANUNCIA_PRE=1` (ligado junto com os hooks, duplica).
2. **Heartbeat do subagente** usa o mesmo id (sufixo de `subagents/agent-<id>.jsonl`, que é o
   `agent_id` dos hooks) e prefere `agent_type` do input ao `.meta.json`.
3. Utilitários (`general-purpose`, `Explore`, `Plan`) seguem sem anúncio.
4. **Premissa da 3.4.14 corrigida:** o `bridge_session_id` NÃO é estável por janela (medido 02/09:
   a mesma janela gerou 3 transcripts em 70 min com 3 ids diferentes, sem encadeamento). Fica como
   campo informativo; o receptor não deve agrupar por ele (DT-032 do Caronte).
Cabe no `VARCHAR(64)` da coluna `sessao` (36+1+15+1+8 = 61). O Caronte não precisa de schema novo;
`agent_id` é campo extra opcional. Contagem "N agentes do tipo X na sessão" passa a ser exata.

## 3.4.16 — 2026-09-02 (hotfix da 3.4.14)

**Agente com `session` própria no payload de presença.** O receptor (Caronte, `PresencaService`)
guarda uma linha por `sessao` e grava `encerrada_em` em todo `end`; o subagente herda o
`session_id` do pai. Com a 3.4.14, o heartbeat do agente sobrescrevia a linha do pai com
`agent_name` e o `--agent-end` **encerrava o cartão do pai** — medido 02/09 16:40: painel sem as
duas execs da Mariana e sem a criação do Caronte, só o sagittarius (3.4.10, sem anúncio) vivo. Agora
o agente manda `session = <pai>-<agent_name>` (heartbeat e anúncio na mesma linha; `parent_session`
continua sendo o pai, que é por onde o painel agrupa). Dois agentes do mesmo tipo em paralelo
compartilham a linha (mostra 1) — limitação aceita até o receptor chavear por transcript.
Cartões já encerrados pela 3.4.14 não revivem (regra do receptor); voltam na próxima sessão.

## 3.4.15 — 2026-09-02

**Dez aceleradores da criação de PRD (fase 1 + 2).** Medido em 02/09 com a 3.4.14 (PRD-135/136/137,
três criações simultâneas): fase 2 de 87–109 min, dos quais gates 53–71 (50–66%), hermes E 15,
dedalo P 10–25, pré-gate 8; fase 1 de 15–40 min, dos quais atlas 10–24 e maquete 30. Cada item ataca
um desses blocos; o item 9 muda o rito inteiro para PRD pequena.

1. **Packet de revisão da criação** — `hooks/prd-packet.sh --label PRD-NNN` (produto + técnica na
   íntegra, tasks por índice; ~40% da pasta) e `guard-agent` nega beholder/michelangelo de "ciclo N"
   sem packet (`HARNESS_GUARD_PRD_PACKET=0` desliga; pré-gate e Modo A da exec não são afetados).
2. **Ciclo 1 na mesma mensagem dos dois hermes** (packet só com produto + técnica; ciclo 2 recebe o
   índice das tasks).
3. **Escalada só com 🔴 novo**, e o ciclo extra é de confirmação (diff, Sonnet, teto 30 chamadas).
4. **Pré-gate em paralelo com o dedalo Modo P** (técnica sem front).
5. **Ariadne despachada na leva do discovery, em background**; o 6.1.1 só colhe e pergunta a variante.
6. **Cache de discovery vale para atlas e tony-stark** (< 24 h e seção presente); `_discovery-cache`
   passa a guardar "Impacto (atlas)" e "Inovação (tony-stark)".
7. **Decisão com default:** "fora do envelope" em TURBO adota a recomendação conservadora e carimba
   "pendente de ratificação"; 10.3 segue sozinho quando os 🔴 convergiram e restam ≤ 3.
8. **Equilibrado = Sonnet em todos os ciclos dos gates** (o Passo 1 já dizia; o 10.1 contradizia);
   Opus no c1 só no `maximo`/override. Experimento medido por `achados_por_ciclo`.
9. **MODO LEVE** (Passo 1.5) para fatia `-b` ou ≤ 6 tasks com escopo fechado: sem votação, sem
   pré-gate, pai redige as tasks, 1 ciclo + confirmação, michelangelo só com tela nova. Meta 40–50 min.
10. **Michelangelo com maquete aprovada** = checklist de 1 ciclo (estados, WCAG, responsividade,
    microcopy), sem ciclos seguintes sem 🔴.

Estimativa somada (itens 1–4 e 6 em toda PRD): fase 2 de ~100 para 50–60 min; com 5, 9 e 10 onde se
aplicam, criação inteira abaixo de 1 h.

## 3.4.14 — 2026-09-02

**Painel do Caronte fiel: sem cartão fantasma e com todo subagente visível.** Dois achados de
02/09 (sessões `caronte-a5` e `WT-OA-Mariana-PRD Ideia 033`, mais a medição desta sessão):

1. **Start adiado ao 1º prompt** (`presence.mjs`/`presence.sh`): todo processo `claude` que nasce
   dispara `SessionStart` — aba do Desktop aberta e nunca usada, `--resume` que só lista, processo
   auxiliar — e virava cartão "Ativo" (medido na Mariana em 02/09: 61 `start`, 17 `end`, 4 sessões
   reais; o painel mostrava 16). Agora o `--start` só deixa `presence-pending-<sessão>`; o 1º
   `UserPromptSubmit` envia o `start` real; `--end` de sessão sem prompt apaga a marca e não envia.
2. **Pai anuncia o subagente** (`guard-agent.sh` → `presence.mjs --agent-start|--agent-end <tipo>`):
   agente 100% read-only (tony-stark, peter-quill) nunca bate no matcher `Bash|Agent|Task|Write|Edit`
   e por isso não existia no painel mesmo com o carimbo próprio da 3.4.13. O `guard-agent` já roda
   no despacho e no retorno de todo `Agent`: anuncia `agent:1` com `agent_name`=tipo e
   `parent_session`=sessão, em background, só no exit 0 do pre (despacho negado não vira bonequinho).
   Heartbeats do agente (Bash/Write/Edit) continuam iguais. **Zero spawn novo por ferramenta** — a
   alternativa (matcher `*`) devolveria um `node` por Read/Grep, exatamente o custo cortado na 3.4.12.
   Utilitários (`general-purpose`, `Explore`, `Plan`) não são anunciados.
3. **`bridge_session_id` no payload** (3º achado, sessão `WT-OA-Mariana-PRD Ideia 033`; decisão do
   Charles: caminho B): cada reconexão do bridge do app desktop (retomada, restart, rede, troca de
   modelo) gera um `session_id` novo — 8 cartões "dra-mariana-duarte main" para 1 janela. A
   identidade da janela é o `bridgeSessionId` da 1ª linha do transcript
   (`{"type":"bridge-session",...}`), que não muda. Os dois emissores leem SÓ a 1ª linha (`read`
   builtin no .sh, 4 KB no .mjs; transcript do pai quando é subagente) e mandam o campo opcional
   `bridge_session_id`; ausente em CLI puro. O Caronte passa a agrupar por ele (DT do lado servidor,
   fallback `session`).

## 3.4.13 — 2026-09-02

**Presença de subagente finalmente chega ao Caronte.** Diagnóstico da sessão
`SE-UV-EXEC-PRD-UV-011` (02/09): o throttle por sessão (2.16.0) rodava ANTES da detecção de
subagente (DT-009) e usava a mesma chave, porque o subagente herda o `session_id` do pai — o pai
renovava o carimbo a cada `PostToolUse` e nenhum heartbeat de agente furava (6 dedalos reais, zero
`agent:1`). Fix nos dois emissores (`presence.mjs`/`presence.sh`): carimbo próprio por agente
(chave = sessão + nome do transcript em `/subagents/`), throttle do agente em 5 min
(`HARNESS_PRESENCE_THROTTLE_AGENT_MIN`; TTL do painel = 15), e o matcher da presença no
`settings.json` passa a `Bash|Agent|Task|Write|Edit` — sem `Write|Edit`, agentes sem `Bash` (hermes,
peter-quill) ficariam invisíveis. Custo de spawn: zero a mais (roda no mesmo processo já criado).
Validado ponta a ponta: ping de teste com `agent:1`/`agent_name` aceito pelo receptor (HTTP 200).

## 3.4.12 — 2026-09-02

**Spawn lento no Windows — 5 pontos contra a fila de processos.** Medido 01–02/09 (transcripts dos
agentes): latência do modelo por turno estável (2,8–4,0 s em todos os períodos), mas a latência de
cada chamada de ferramenta explodiu com 3 frentes vivas — `ls`/`cat`/`grep` via Bash p90 de 3,3 s
(2 frentes, ontem) para 40–88 s; Playwright/PHP mediana de 4,4 s para 48 s; um `cmp` sozinho 1,8 s.
CPU/RAM moderadas: é fila de criação de processo (fork do MSYS + Defender), não processamento. Os
agentes do Caronte passaram 85–93% do tempo esperando ferramenta. Detalhe: `prds/ANALISE-TELEMETRIA-2026-09-01.md`.

1. **Wiring Node em todo projeto + presença só onde importa** (`settings.json` do mestre e dos
   projetos sincronizados): `guard-bash.mjs`/`presence.mjs` no lugar dos `.sh` (3,9×/8,6× por
   chamada) e o `presence.mjs --prompt` de PostToolUse passa a matcher `Bash|Agent|Task` — Read,
   Grep, Glob, Edit e Write deixam de criar processo a cada chamada.
2. **Presença sem spawn em ferramenta de leitura** (mesmo item, lado do harness): o ping continua
   com throttle de 10 min; nada muda no receptor.
3. **Ferramenta certa para ler** — regra nos contratos de hefesto, dedalo, sherlock, beholder,
   michelangelo, atlas e hermes (Read/Glob/Grep para ler; Bash só para executar; agrupar
   execuções), e `guard-bash.mjs` devolve `additionalContext` (não bloqueia) quando o comando é
   `cat`/`head`/`sed -n`/`ls`/`grep` trivial (`HARNESS_GUARD_BASH_DICA=0` desliga).
4. **`carga-maquina.sh` mede o custo de spawn** (`CARGA|spawn|<ms>|ok|LENTO`, régua
   `HARNESS_SPAWN_LENTO_MS`=1000) e emite `CARGA|vivos|2` quando lento ou com 3+ frentes; a
   `/prd-exec` obedece (`HARNESS_PIPELINE_MAX_VIVOS` efetivo 2, correções em até 2 agentes,
   `spawn=<ms>` no `--extra`).
5. **Worktree pronta para testar**: `harness-worktree.sh criar` linka `node_modules`/`vendor` do
   checkout principal (junction no Windows, symlink no resto; `HARNESS_WT_LINKS`) — fim do
   "Playwright não está instalado neste worktree" (PRD-133 e 133-b).

Também: `harness-sync.sh` copia por temporário + rename (nunca sobrescreve hook em execução —
incidente da PRD-134-b em 01/09). E, **regra nova do Charles (02/09): configuração de otimização
viaja no mestre** — o sync passa a levar a seção `hooks` do `.claude/settings.json` para o projeto
(wiring Node, matcher da presença, watchdog), preservando `permissions`/`env`/o resto; escape
`"harness": {"hooks": "local"}` no settings do projeto. Fim do "esqueci de ligar".

**No Windows, fora do harness (decisão do dono):** exclusões do Defender para `C:\laragon\www`,
`C:\Program Files\Git`, `nodejs`, `%USERPROFILE%\.claude`, `%LOCALAPPDATA%\Temp\claude` e os
processos `bash.exe`/`node.exe`/`git.exe`/`php.exe`; reiniciar (181 h de uptime, 26 `claude.exe`
vivos); no máximo 2 frentes autônomas; indexação do Windows Search fora de `C:\laragon\www`.

## 3.4.11 — 2026-09-01

**Dieta da criação de PRD (7 itens) — reversão parcial da 3.4.10, com números.** Fonte:
`prds/ANALISE-TELEMETRIA-2026-09-01.md` (telemetria ≥ 3.3 + transcripts das PRDs 126–134 e
Caronte 011). Achado: a fase 2 da `/prd` foi de 43–86 min ativos (3.4.3/3.4.8) para 146–202
(3.4.10), **sem mudança nos modelos** (Sonnet 5 em 4,3–5,6 s/turno e Opus 5 em 6,7–8,0 s/turno em
todos os dias de 23/08 a 01/09). O que mudou foi o hermes: tasks 2,6× maiores (133–177 → 371–403
linhas), Modo C em 226–398 turnos por ciclo, e `tokens_total` da criação subindo em vez de cair.

1. **Hermes Modo E — camadas condicionais + teto ~180 linhas/task** (`agents/hermes.md` item 3,
   `TEMPLATE-TASK.md` 3b + cabeçalhos marcados): obrigatórias = metadados, objetivo, arquivos,
   contrato, aceite; o resto só quando a task pede (E2E como lista, código de referência só sem
   spec precedente, rollback só com migration). Era "preencha TODAS as camadas".
2. **Modo E em duas mãos com GLOSSÁRIO** (`/prd` Passo 8): ≥ 7 tasks → dois hermes na mesma
   mensagem, cada um com sua fatia, os componentes da técnica que suas tasks referenciam (nunca a
   técnica inteira) e o mesmo glossário; ≤ 6 tasks (fatia `PRD-NNN-b`) → a pai redige (5–9 min
   medidos na 3.4.8 contra 17–22 do hermes).
3. **Modo C com Write por documento** (`hermes.md` regra 7 + Modo C item 2; `guard-write.sh`
   libera `Write` em `prds/PRD-*/*.md` e `prds/*/tasks/*.md`, knob `HARNESS_GUARD_WRITE_DOCS=1`
   restaura o Edit-first também para documentos). Um Read + um Write por arquivo, agrupando
   achados; orçamento de 80 (E) / 120 (C) chamadas de ferramenta com `PARCIAL-TURNOS`.
4. **Patch pronto na triagem; até 5 🔴 a pai aplica** (`/prd` 10.2): a triagem escreve
   `documento:seção → texto novo`; lote ≤ 5 sem multi-camada = script da pai (3–5 min medidos);
   acima disso, hermes Modo C com os patches prontos.
5. **Hermes só quando compensa + conferência mecânica** (`/prd` Passo 8 item 3): `grep` de ids,
   Tipo, arestas tipadas e componentes contra o plano antes da amostragem; divergência volta com
   patch pronto (PRD-133: 18 min de "propagar correções" por divergência em prosa).
6. **Corrigir por gate e confirmar só no diff** (`/prd` 10.1/10.2): assim que um gate devolve,
   sua correção parte (UX → dedalo R + seção de front/tasks `front`; beholder → resto), lotes
   disjuntos em paralelo; ciclo após ≤ 2 🔴 fechados = CONFIRMAÇÃO (Sonnet, só `delta-cN.diff`,
   teto 30 chamadas, sem leitura integral). Votação do Passo 2.0 só quando a proposta da pai é
   < COMPLETO (3/3 votações confirmaram COMPLETO em 4 min sem mudar nada).
7. **Telemetria que segura a regressão** (`harness-metrics.sh/.mjs`, schema **2.15.0**;
   `guard-agent --post`): campos novos `achados_por_ciclo` (`--achados=4,1,0`), `linhas_por_task`,
   `min_hermes_e`, `min_hermes_c`, `turnos_hermes`, `min_gates` (por papel, via `.meta.json` do
   subagente); aviso ⚠️ no `stop` com tasks > 200 linhas (`HARNESS_TASK_MAX_LINHAS`) ou hermes
   > 250 turnos na fase; `guard-agent --post` avisa no retorno de cada hermes (tasks > 200 linhas
   na média, chamada > 120 turnos — `HARNESS_HERMES_MAX_TURNOS`). O watchdog lista o hermes.

8. **Sufixo de fatia preservado nos hooks** (achado da PRD-134-b, 01/09): `guard-agent.sh` (PRD da
   task → packet e rótulo do `_auto`), `harness-duelo.sh` (rótulo pelo diretório) e
   `harness-metrics-auto.sh` (`/prd-exec 134-b` → `PRD-134-b-exec`) passam a manter o `-b`; antes o
   packet de `PRD-134-b` caía no glob da mãe e o `stop PRD-134-b-exec` não achava o state (duração 0
   na telemetria). O `stop` da fase 1 da PRD-134-b falhou por outro motivo: o `harness-metrics.sh` foi
   substituído por cópia enquanto rodava (bash lê o script incrementalmente) — sempre trocar hook
   com `cp` para temporário + `mv`, nunca `cp` por cima.

9. **`harness-sync.sh` em passada única (Node)** — medido 02/09 no Windows com 3 sessões autônomas
   vivas: cada processo do Git Bash custava ~1,8 s e o sync abria 300–500 (um `cmp` por arquivo em
   dois loops, `mkdir`+`cp`+backup por cópia): dry-run > 10 min, `--apply` morto por timeout com 20
   arquivos. Agora a comparação e a cópia de todo o núcleo rodam em UM processo Node (lista no
   stdin, `OK|DIFERE|FALTA` / `COPIADO|COPIARIA|ERRO`, backup e bit de execução preservados);
   `collect` é chamada uma vez. Medido: `--check` 50 s, `--apply` de 105 arquivos 67 s. Sem Node
   (`HARNESS_SYNC_NODE=0` ou ausente) cai no caminho antigo. O `/deus` herda o ganho sem mudar.

Também nesta versão (numerando o que estava "no mestre, sem bump"):

**DT-001/002/003/004/005 do mestre resolvidos (achados da 1ª noite de campo da 3.4.10 no
Mariana — 4 sessões paralelas; ordem do Charles: "não temos o costume de ter DT no mestre,
resolva"). DT-006 registrado (pendente).**

- **Régua do placar com ERA + JANELA (DT-001):** o bloco do placar no `harness-duelo.sh` agora
  considera só duelos do mesmo tipo do duelo atual (task `^TASK-` = PRD; resto = lote) e,
  dentro do tipo, os últimos `HARNESS_DUELO_PLACAR_JANELA` (default 30, knob novo no
  harness.env). Antes lia o jsonl inteiro e a era PRD (abolida na 3.4.5) cortou os 3 titulares
  duas vezes (28/08 e 01/09 00:04). Validado contra o jsonl real do Mariana: com o fix, zero
  cortes na era de lotes (deepseek 5/9 vitórias lá); era PRD segue reprovando os 3.
- **Telemetria sem corrida (DT-007):** helper novo `_jsonl-append.sh`
  (`harness_jsonl_append` — lock por mkdir, roubo de lock órfão >30s, timeout com append
  garantido) adotado nos 10 pontos de append de `_metrics` (duelo ×7, delegate ×2, metrics ×1);
  a causa-raiz da corrupção de 18/08 (grupo de printfs direto no `>>` do preflight) foi
  eliminada montando a linha inteira antes do append. `harness-metrics.sh sanear` valida os
  jsonl e move linha inválida para `.quarentena` (rewrite atômico sob o mesmo lock) — os
  leitores deixam de descartar em silêncio. Testado: rajada de 20 appends concorrentes 20/20.
- **Coerência do derivado (DT-008):** `perfil-frescor.sh` ganha o detector de redação
  empilhada da sessão PRD-134 — par de itens de lista compartilhando 3+ termos entre crases
  = redações da mesma informação (auto-merge de N branches empilha sem conflito e o carimbo
  segue FRESCO). Avisos em stderr no `--carimbar` e no modo avulso `--coerencia`; fora da
  verificação rotineira de propósito (falso positivo residual medido viraria alarme crônico).
- **Worker local confiável (DT-006, "a quente" por ordem do Charles):** a via ollama migra
  do `/v1` OpenAI-compat para a **API nativa `/api/chat`** — `num_ctx` POR REQUEST
  (dimensionado pela entrada: est bytes/2 ×2 + folga; o setx global de OLLAMA_CONTEXT_LENGTH
  fica dispensável), `keep_alive` 15m, transporte em `http` puro (fim do headers-timeout de
  ~300s do fetch que matava worker antes do 1º token), e **detector de truncamento** por
  `prompt_eval_count` nas janelas de corte medidas do runner (falha exit 13 legível em vez
  de diff lixo ao juiz). **Roteamento por capacidade** (política: "30b apenas para pacotes
  menores"): 30b ≤ 6k tokens est (~12KB), local ≤ 16k est (~32KB); acima, o duelo promove
  suplente REMOTO no lugar e a delegação avulsa falha com motivo. Knobs novos:
  `HARNESS_OLLAMA_MAX_TOKENS_GRANDE/PEQUENO`, `HARNESS_OLLAMA_NUM_CTX_MAX`. Testado ao
  vivo no 14b: needle no fim de prompt de 15KB recuperada sem truncamento; resolvedor 8/8;
  detector 6/6 contra os casos reais da madrugada.

- **Numeração atômica entre worktrees (DT-002):** subcomando novo
  `harness-worktree.sh reservar <DT|LOTE|PRD> [--qtd N] [--por dono]` — reserva por `mkdir`
  no `.git` comum (`harness-locks/seq/`), piso = INDEX + disco do checkout principal +
  reservas; imune a zero-à-esquerda octal e a sufixo de fatia. `/dt` (Fase 3), `/dt-exec`
  (Passo 2 e Passo 7.4) e `/prd` (Passo 5) agora numeram por reserva. Motivo medido: dois
  LOTE-037 e dois pares DT-541/542 distintos cunhados por wt-sweep-a × wt-sweep-b em 01/09.
  Testado: rajada concorrente 2×5 em worktrees sem duplicata. Aposenta a reserva manual
  (`prd-reserva-numeros.md`).
- **`db-test.sh` canônico e worktree-aware (DT-003):** o wrapper do banco de teste vira
  script do harness (viaja em `.claude/scripts`): banco do Perfil → override do
  `worktree.env` (clone do worktree) → `DBTEST_DB`; credenciais/cliente do Perfil com
  overrides `DBTEST_*`. Substitui os adaptadores hardcoded por projeto (que dentro de
  worktree consultavam o banco do principal em silêncio — achado do hefesto no DT-541 do
  Mariana). Testado nos 4 caminhos; o Mariana já roda a correção local desde 01/09.
- **Fatiar PRD materializa as fatias (DT-004, regra do Charles):** o Gate de split da `/prd`
  agora cria na hora o stub `PRD-NNN-b` (escopo congelado, decisões datadas, dependência
  verificável da mãe, exigência de discovery próprio), linha `Aguardando fatia mãe` no
  INDEX e DTs absorvidos marcados `reservado pela PRD-NNN-b` nas duas pontas. Sufixo não
  consome número da série; parser de descoberta ignora sufixo de fatia. Casos de origem:
  PRD-134-b e PRD-133-b do Mariana (01/09).

## 3.4.10 — 2026-08-31

**Aceleração da /prd (5 itens aprovados em bloco) + o agente novo `hermes`.**

- **`hermes` (agente novo — nome escolhido pelo Charles):** o escrivão de spec. **Modo E**
  materializa todos os `TASK-NNN.md` a partir da técnica + PLANO da sessão-pai (a pai DECIDE
  — grafo tipado, Duelo, componentes; ele REDIGE, um só para coerência); **Modo C** aplica os
  achados 🔴 dos gates com a propagação em todas as camadas (2.10.0) no contrato, devolvendo
  declaração achado-a-achado. Retorno em 2 níveis nos dois modos; nunca decide
  produto/escopo/partido ("Decisões pendentes" volta à pai). Coberto pelo watchdog (p90
  default 1200s). Motivo: redigir 8+ tasks + correções na sessão principal era o maior output
  da criação (mecanismo dos 832M de tokens_total da PRD-125-fase2).
- **Passo 2.0 — dimensionamento do discovery por VOTAÇÃO** (pedido do Charles: sem juiz
  único, para não viciar a rota): a pai propõe MINIMO/MEDIO/COMPLETO e 3 votantes paralelos
  (lentes escopo/risco/histórico) conferem; maioria decide, empate triplo ou 2+ votos acima
  da proposta → o maior nível (fail-safe). ~30k tokens de votação contra 100k+ por agente de
  frota evitado.
- **Passo 7.2 — PRÉ-GATE estrutural do beholder** (shift-left): passada única e enxuta na
  técnica ANTES das tasks existirem — 🔴 estrutural custa 1 edit aqui, não correção em cascata
  em 5 camadas × 8 tasks (PRD-132: 2 dos bloqueantes do gate eram estruturais). Não conta
  ciclo; o gate completo do Passo 10 continua o mesmo.
- **Passo 10.2 — correções de gate pelo hermes Modo C:** a pai triara e confere (grep de 1
  achado por amostragem); não reescreve documento na mão. Dedalo Modo R segue dono do texto
  de UX; o hermes grava.
- **Passo 4 — referência viva só na 1ª PRD do projeto:** da 2ª em diante, template + histórico
  do módulo bastam (reler uma PRD inteira por criação era custo fixo sem retorno).

## 3.4.9 — 2026-08-31

**Pacote de otimização de consumo/velocidade da /prd e /prd-exec (9 itens aprovados pelo
Charles em bloco; nascidos dos dados da PRD-132: parallel 1,06 e 112M de tokens_total).**

- **#1 Duelos em PARALELO entre si** (/prd-exec 1.3): 2+ tasks elegíveis = todos os
  `harness-duelo.sh` na mesma mensagem + N themis juntos no julgamento. Mata a fila indiana
  medida na 132 (vereditos 12:24 → 13:01 → 13:33).
- **#2 Retorno em DOIS NÍVEIS** (contrato do hefesto/dedalo + /prd-exec): relatório completo
  vai a `.harness-run/relatorios/`, ao chat volta só o sumário de ≤12 linhas — o que volta ao
  chat é relido em todos os turnos seguintes (o multiplicador que restou).
- **#3 ESTADO CANÔNICO entre fases** (/prd-exec): `estado-PRD-NNN.md` reescrito ao fechar
  cada fase; fases consultam o arquivo, nunca re-derivam do transcript. Bônus: retomada de
  sessão caída sem re-executar nada.
- **#5 Snapshot+DIFF para os gates da criação** (/prd 10.1): ciclo 2+ do beholder/michelangelo
  recebe o delta real dos documentos (sem `REVIEW-*.md`, que mudam por ciclo); leitura
  integral só do que o diff toca. Mecânica validada com a pasta real da PRD-132.
- **#6 Aplicador ENXUTO** (/prd-exec): vencedor de duelo é aplicado com diff + itens do juiz +
  lint/spec — sem reler packet de 300KB nem PRD.
- **#7 Delta no re-review externo:** verificado — JÁ existia (2.14.0, 4º arg `delta` no ciclo
  2+); nada a mudar.
- **#8 `/prd --noturno`:** decolagem headless sem entrevista (defaults registrados
  `(default --noturno)`) + TURBO NOTURNO automático — o modo que o noturno v2 consome.
- **#9 Telemetria do pipeline** (/prd-exec): `--extra="pipeline: vivos_max=N,
  limitou=<dependencias|duelo|teto|tasks-curtas>"` — a régua para tunar o pipeline 3.4.8.
- **#10 PROMPT-EXECUCAO.md virou STUB** (~12 linhas; validado antes: a exec o lê 1× "se
  existir" e fases/grafo/contratos moram na técnica+tasks): /prd Passo 9 enxuto e lente 12
  do beholder ajustada (executabilidade se afere nas tasks).
- Manual vivo sem pergunta na entrevista (sempre fila) entrou junto — decisão do Charles.
- Adiado a pedido: **#4 discovery incremental por módulo** (mapa persistente em
  `.claude/knowledge/modulos/`) — anotado como melhoria futura.

## 3.4.8 — 2026-08-28

**Onda 3 (final) do pacote de 15 melhorias: hooks de hot-path em Node, pipeline por
dependência e o noturno v2 (fila inteligente, dormente).**

- **Hot-path em Node (#7).** Forks de bash a 6–9s sob carga no Windows — e presence roda a
  cada prompt/tool-use, guard-bash em TODO Bash. Ports completos com **paridade testada**:
  `presence.mjs` (payload byte-idêntico ao .sh — chaves, ordem e valores; mesma fila offline/
  throttle/log; identidade via `os.userInfo()` = imune ao bug de codepage 1252; branch lida de
  `.git/HEAD` incl. worktree; git_email parseado dos configs — menos 3 spawns) e
  `guard-bash.mjs` (guardas 1 e 2 idênticas; contadores anti-espiral **interoperáveis** com o
  .sh — mesmo cksum POSIX reimplementado e conferido; fusível aceita wiring .sh|.mjs).
  **Medido no PC (10 execuções):** presence 1,83s → 0,47s/hook (3,9×) · guard-bash 3,89s →
  0,45s/hook (**8,6×**). Wiring do mestre trocado para os .mjs; os .sh ficam para fallback e
  host Codex (mudança de payload/regra deve tocar os dois). Doctor aceita ambos e sugere a
  troca. Lock de worktree ficou fora (não é hot-path).
- **Pipeline por dependência (#15).** `/prd-exec` 1.3 abandona as ondas com barreira: fila
  contínua — task liberada despacha NO RETORNO que a destravou, até o teto
  `HARNESS_PIPELINE_MAX_VIVOS` (4). Medido: paralelismo 1,3–1,8 com barreira (PRD-123: 9
  tasks em 7 ondas; waitGap 45–76 min/run); alvo 2,5+. `[barrier]`, estabilização 1.4 e onda
  B continuam barreiras reais; gate de LARGURA continua auditando o grafo; `--waves` grava
  gerações de despacho (compatível com o histórico).
- **Adendo 31/08 — `ollama:auto` (seleção dinâmica por memória).** Campo da PRD-132 mostrou o
  7B local incapaz do formato de diff (0/3 aplicáveis). Novo par por máquina: `HARNESS_OLLAMA_
  MODEL='auto'` escolhe NA HORA entre `MODEL_GRANDE` (qwen3-coder:30b — MoE, melhor) e
  `MODEL_PEQUENO` (qwen2.5-coder:14b — cabe na VRAM) pela memória livre real (RAM Available ≥
  12GB e VRAM em uso ≤ 3GB → grande; jogo aberto/apertado → pequeno; medição com cache de
  120s). No pool do duelo: `ollama:auto` — telemetria e placar registram o modelo REAL.
  ⚠️ Setup: `setx OLLAMA_CONTEXT_LENGTH 32768` + restart (o default ~4k truncava o packet de
  ~25k tokens em silêncio — causa provável do fracasso do 7B).
- **Adendo 31/08 — manual vivo com BUSCA e PRINTS (feedback da 1ª rodada real).** O bootstrap
  do Mariana saiu ótimo em texto mas com **zero prints** (a regra era "opcional") e um índice
  sem busca. Dois consertos: (a) novo `scripts/manual-index.mjs` — o Passo 3 da `/manual`
  deixa de escrever HTML na mão e roda o script, que gera um **leitor completo** auto-contido
  (busca instantânea por palavra-chave/tema em títulos+seções+conteúdo com destaque, abas
  usuário/dev, markdown renderizado na página, prints inline, placar de 📷 por módulo);
  (b) prints viraram **contrato da face usuário** (1 por tela principal, Playwright na Base
  URL do Perfil, `--load-storage` se o Perfil declarar "Storage state p/ screenshots") com
  degradação declarada (`📷 pendente: ...`) — nunca silêncio — e recaptura obrigatória quando
  a PRD absorvida mudou a tela. Novo modo **`/manual --prints [modulo]`**: rodada só de
  captura (retrofit dos módulos já escritos). Validado ao vivo no manual real do Mariana
  (22 módulos, busca por "adiantamento" acertando a seção).
- **Noturno v2 — fila inteligente (#10, DORMENTE).** `noturno.sh --fila` (ou
  `HARNESS_NOTURNO_FILA='on'`): etapa 1 = sweep com DTs de **Prioridade Alta primeiro**;
  etapa 2 = ideias `pronta-para-prd` viram **RASCUNHO de PRD** (`prds/backlog/
  RASCUNHO-IDEIA-NNN.md`, premissas declaradas, teto `HARNESS_NOTURNO_MAX_RASCUNHOS`=2/noite,
  commit no MR da noite) para refinar de manhã com `/prd --ideia`. Dormente até o noturno v1
  rodar em produção (pendência Cloudways) — a madrugada vira esteira, não só faxina.

## 3.4.7 — 2026-08-28

**Onda 2 do pacote de 15 melhorias: envelope de decolagem, dieta de contexto fechada com
enforcement, watchdog por p90 e o executor ollama (GPU local).**

- **Envelope de decolagem (#2).** O maior wait medido (208 min, PRD-129, madrugada) era o
  aceite humano atravessando a noite. `/prd` ganha o modo **TURBO NOTURNO** na entrevista:
  aceite final pré-assinado **condicionado a gates limpos** (beholder sem 🔴; michelangelo sem
  🔴 quando há UI) → status `PRE-ACEITA (envelope noturno)`, sessão encerra sem aguardar e a
  `/prd-exec` aceita sem novo aceite; qualquer 🔴 = `Aguardando aceite` normal (bloqueante
  nunca é pré-aceito). `/prd-exec` e `/dt-exec` ganham envelope **quantificado**: teto objetivo
  de subagentes = `HARNESS_ENVELOPE_FATOR` (2) × o baseline; estouro = UMA pergunta objetiva
  (na fila, só entre lotes).
- **Dieta de contexto fechada (#4).** A 3.4.5 criou o review-packet, mas o prompt-exemplo do
  sherlock na `/prd-exec` ainda mandava reler PRD+Perfil+git (parte dos 166–488M tokens_total/
  exec). Prompt corrigido (packet-first, remontado a cada ciclo) e **enforcement**: o
  guard-agent NEGA sherlock com rótulo PRD/LOTE sem packet montado (mesmo princípio do
  task-packet; `HARNESS_GUARD_REVIEW_PACKET=0` desliga). Beholder ciclo 2+ e michelangelo
  Modo A já eram enxutos — nada mudou lá.
- **Watchdog por p90 (#13).** Caso LOTE-028 (5h37/1 task): agente que espirala só era visto no
  fim. Três camadas: mandato de **PARCIAL-TEMPO** no contrato do hefesto/dedalo (~60 ações sem
  fechar → devolve parcial honesto); `guard-agent --post` (PostToolUse Agent — wiring no
  settings, doctor cobra) mede cada agente terminado contra o teto do papel
  (`watchdog-baseline.sh` = `HARNESS_WATCHDOG_FATOR`×p90 do dashboard local, defaults da casa
  sem dashboard) e avisa a sessão via additionalContext no estouro; log em
  `.harness-run/watchdog-overruns.jsonl`. A skill obriga a decisão (dividir/replanejar) em 1
  linha no Output. `HARNESS_WATCHDOG=0` desliga.
- **Executor `ollama` (#3).** O mesmo motor HTTP do openrouter apontado para a GPU local
  (`{HARNESS_OLLAMA_URL}/v1`, API OpenAI-compatível): custo zero, sem rede externa, imune a
  429. Modelo com prefixo **`ollama:`** no pool/suplentes do duelo roda local (pool 100% ollama
  liga o duelo SEM chave OpenRouter); preflight confere daemon e modelo puxado; executor
  reprovado no preflight sai do pool só naquela rodada (filtro logado). Setup opt-in por
  máquina no ONBOARDING. Default: `HARNESS_OLLAMA_MODEL='qwen3-coder'`.

## 3.4.6 — 2026-08-28

**Onda 1 do pacote de 15 melhorias (28/08): falha rápida, placar autônomo, funil sem buraco,
lote com piso, Edit-first e e-mail de espera.** Seis itens pequenos, todos nascidos de medição:

- **Preflight + circuit-breaker do executor externo** (`harness-delegate.sh`). Medido 20–24/08:
  codex-cli falhou **4/4** delegações com binário e login presentes — cada uma queimou até 600s
  de parede antes do fallback, em silêncio. Novo `--preflight <executor>` (ping real barato:
  codex = exec trivial; openrouter = `GET /auth/key`, zero token; cache com TTL de 30 min,
  renovado por sucesso real) roda na decolagem da `/prd` e na largada do duelo; broker ganhou
  breaker: preflight reprovado na validade OU **2 falhas consecutivas** do executor no label =
  recusa em <1s com fallback orientado. Knobs: `HARNESS_DELEGATE_PREFLIGHT*`,
  `HARNESS_DELEGATE_BREAKER*`. Falhas de preflight aparecem no `harness-delegations.jsonl`
  (label `PREFLIGHT`) — o dashboard de executores passa a enxergar a saúde.
- **Placar do duelo decide o pool sozinho** (`harness-duelo.sh`). A régua já existia
  (≥5 duelos e <20% vitórias, ou >40% inaplicável); agora, cortado um titular e faltando
  escolhíveis, um **suplente** de `HARNESS_DUELO_SUPLENTES` é promovido na ordem declarada.
  Mudança de escalação vira evento `{"ev":"pool"}` no `harness-duelos.jsonl` (1× por mudança)
  + 1 linha de log. Default de suplentes: `qwen3.7-flash`, `claude-haiku-4.5`.
- **`--aplicado` enforçado** (`guard-stop.sh`). O funil vitória→aplicação tinha buraco
  estatístico (sessões esqueciam o desfecho). O Stop cobra **1×** os vereditos A|B novos sem
  evento `aplicado` (cursor por linha — sem parsing de data; primeiro uso ignora o backlog
  histórico). Nunca inventa resultado: duelo de outra sessão é reportado ao usuário.
  Knob: `HARNESS_GUARD_DUELO_APLICADO=0`.
- **Piso de lote no `/dt-exec`: < 3 itens não decola.** Medido 25/08: LOTE-028 gastou 5h37 e
  817k tokens para **1 item**; paralelismo 0,30–0,97 em lotes de 1–2. O Passo 1.3 agora
  **funde** grupos pequenos ou converte em **execução avulsa de rito mínimo** (sem mini-spec;
  safe-mode, packet/duelo, sherlock solo 1 ciclo, commit + fechamento 7.7 integrais; telemetria
  `--extra="rito-minimo"`). Migration/tela nunca entram no rito mínimo. O MINI-LOTE (2.3.0)
  morre como decolagem — substituído por isso.
- **Edit-first nos executores** (`guard-write.sh`, PreToolUse Write + contrato do hefesto/
  dedalo). Output é o token mais caro/lento (dedalo: 121k out/task reescrevendo arquivo
  inteiro). Write sobre arquivo **existente** com ≥150 linhas é negado com instrução de Edit
  cirúrgico; arquivo novo passa; reescrita genuína = `rm` consciente + Write.
  Wiring local (settings.json, matcher `Write`) — o doctor cobra.
- **E-mail de espera via Beholder** (`notify.sh`). A espera mais cara medida foi **208 min de
  madrugada** (PRD-129) — logada, nunca avisada. Com `HARNESS_BEHOLDER_URL` +
  `HARNESS_BEHOLDER_TOKEN` na máquina (`~/.harness.env.local`, opt-in como a chave OpenRouter),
  prompt pendente/idle dispara e-mail ao próprio dev (`git_email`, mesma identidade do
  presence) com throttle de 10 min. Mesmo contrato do Caronte: `POST {url}/api/fila`,
  `software_id` 1 (Beta), `corpo_msg {destinatario, assunto, corpo}`. Substitui o plano
  WAHA — decisão do Charles (28/08).

## 3.4.5 — 2026-08-27

**Duelo com elegibilidade preditiva: em task de PRD só `Duelo: sim` explícito duela.**
Medido em ~19 duelos pós-fixes (26–27/08): DT de lote mecânico o juiz aprova (notas
8,3–8,5, vitórias aplicadas, ganho de 3–10× em tempo de escrita); task de PRD ele
reprova mesmo com dois diffs aplicáveis (nota máxima 4,5, zero aprovação) — o duelo
virava pedágio de 3–9 min por task. O `auto` em `TASK-NNN` agora vai direto ao
executor (guard-agent + `/prd-exec`); em `DT-NNN` de lote nada muda. O planejador
(`/prd`) reserva `sim` para task genuinamente mecânica ("trocar/adicionar/remover X
em Y"). Knob: `HARNESS_DUELO_PRD='auto'` restaura o comportamento anterior.
Revisão do juiz themis agendada para a régua de 30 duelos no placar.

**Pacote pré-propagação (27/08, mesma versão):**
- **Worktree safe-by-default:** `novo` RECUSA criar worktree em projeto sem `HARNESS_WT_DB`
  declarado (classe de acidente do DT-502 — app/banco apontando para a árvore principal em
  silêncio); doctor avisa `wt-sem-declaracao`.
- **Doctor do SessionStart cacheado** (`doctor-cached.sh`): resultado instantâneo do cache,
  renovação em background no máx. 1×/12h (`HARNESS_DOCTOR_CACHE_H`) — o doctor síncrono
  chegava a 30–150s sob carga no Windows. Inclui 1 linha com o estado do DUELO
  (ativo+placar / dormente+como ligar).
- **ONBOARDING "Decisões 3.4.2–3.4.5"**: chave OpenRouter pessoal, declaração de worktree,
  gate de DTs/ideias — o que cada dev decide ao receber a versão.
- **REVIEW PACKET** (`review-packet.sh`): dieta de contexto do sherlock — diff + arquivos
  tocados + contratos das tasks, proibido reler Perfil/PRD inteiros (respondiam por boa
  parte dos 166–488M de tokens_total/exec). Efeito A SER MEDIDO no dashboard "por agente".
- **Consciência de carga da máquina** (`carga-maquina.sh`, instrutivo): conta frentes
  harness ativas e recomenda reduzir paralelismo com 3+ (regra: máx 2 frentes pesadas —
  medido 25/08: 429/529 por rajada de fan-out mesmo no plano 20x).
- **Fix Caronte/acentos:** `presence.sh` agora garante UTF-8 válido no payload — no Windows
  o Git Bash entrega `whoami` em Windows-1252 e "Débora" (0xE9) invalidava o JSON: o ping
  era descartado e o dev sumia do painel; o `cut -c` também podia partir multibyte. Converte
  1252→UTF-8, sanea cauda truncada, degrada a ASCII sem iconv.

## 3.4.4 — 2026-08-27

**`/manual`: bootstrap na primeira rodada, flags documentadas com aviso, LOTE de polimento sem
inflar.** Três regras nascidas do primeiro caso real (dra-mariana-duarte: 21 linhas na fila,
zero módulo escrito):

- **Modo bootstrap explícito** — fila com pendências + módulo sem manual → proibido processar
  como delta (delta sobre o vazio conta a mudança sem dizer o que a tela é). O caminho: mapa de
  módulos com o usuário (tela ≠ módulo, ~8–15 grupos), bootstrap em **ondas** (uso diário →
  gestão → cauda), 1 subagente por módulo a partir do **código atual** (que já contém todas as
  PRDs da fila — absorção de graça), e fila baixada com nota `absorvida via bootstrap`.
- **Feature atrás de flag é documentada COMPLETA** (decisão do Charles, 27/08) — o obrigatório
  é o aviso `⚠️ Requer ativação` no topo do arquivo do módulo (ou da seção, se a flag cobre só
  uma feature). A task que ligar a flag deve incluir "ajustar o aviso no manual".
- **LOTE de polimento de UI** sem mudança de comportamento → `✅ sem impacto de manual` ou
  ajuste de 1 linha; o manual ensina a usar, changelog visual fica no git.

Nenhuma decisão de instalação — conteúdo da skill apenas (sem entrada no ONBOARDING).

## 3.4.3 — 2026-08-24

**Regra decidida = regra forçada; deriva e resíduo detectados sozinhos.** Três pedidos do Charles
após o primeiro dia real de worktrees + duelo:

- **`hooks/perfil-doctor.sh`** — compara o Perfil do projeto com a estrutura canônica do template
  (seções + campos que skills/tela leem), com matching tolerante a acentos/parentético. Saída
  `SECAO-AUSENTE|FALTA|VAZIO` + `RESUMO|faltas=N`; o `harness-doctor` chama e avisa. Motivo: os
  "13 campos vazios" do Mariana eram deriva silenciosa de Perfil antigo.
- **Enforcement do que era só texto:** `external-review.sh` **recusa ciclo > 3**
  (`HARNESS_REVIEW_MAX_CICLOS`, exit 3) e o `guard-agent` nega sherlock/beholder/michelangelo
  convocados para "ciclo 4+" — o teto S5 agora segura dos dois lados da dupla-cega. `guard-stop.sh`
  (Stop hook) **bloqueia 1× por sessão** o encerramento em worktree com arquivo rastreado sem
  commit — a regra "commit automático em worktree" (3.4.2) deixou de depender de obediência.
- **`harness-worktree.sh doctor [--limpar]`** — faxina: worktree parado > 48h, banco `_wt_*`
  órfão, lock preso > 24h/dono morto; `--limpar` remove só banco órfão e lock morto (worktree
  parado é decisão humana). Roda no SessionStart (aviso curto) e está no doctor.
- Wiring novo em `settings.json` (Stop + SessionStart) — settings é local: não viaja no /deus;
  o doctor cobra.

## 3.4.2 — 2026-08-23

**Enforcement do passo 0 da Fase 1.3: `hooks/guard-agent.sh` (PreToolUse Agent).** Medido na
primeira execução real com duelo ligado (PRD-125, 23/08): a skill mandava, a sessão leu, julgou
"opcional" e despachou TASK-002/003/005 direto ao hefesto (22+ min seriais cada, duelo zero).
Instrução não segura; hook segura — o mesmo princípio do `guard-bash.sh`:
- `Agent hefesto|dedalo` para uma `TASK-NNN` **sem task packet** → negado (exit 2) com o comando
  exato para rodar; `Agent hefesto` para task **elegível a duelo** (backend, ≤ 3 arquivos-alvo,
  sem migration/integração/auth/`[barrier]`, `Duelo ≠ nao`) **sem a pasta do duelo** → negado com o
  comando do `harness-duelo.sh`. Outros agentes e uso avulso (sem TASK-NNN) passam.
- Dormente sem `OPENROUTER_API_KEY` (só exige o packet); `HARNESS_GUARD_AGENT=0` desliga;
  `HARNESS_SKIP_DUELO=1`/`HARNESS_DUELO=off` liberam só a parte do duelo.
- Wiring em `.claude/settings.json` (`PreToolUse` → matcher `Agent`) — settings é local ao projeto:
  o `/deus` não propaga; o doctor passa a cobrar. A 1.3 ganhou o **passo 0** escrito como gate.

## 3.4.1 — 2026-08-23

**Loop noturno independente do PC do dev (modo cloud).** O noturno da 3.4.0 dependia do checkout
e do banco locais. Agora ele roda num runner (GitLab CI agendado, Caronte ou cron de servidor):

- `noturno.sh --cloud`: sem worktree (o checkout do runner já é isolado), branch `wt/noturno-<data>`
  criada no runner, **banco EXTERNO** declarado por variáveis (`HARNESS_DB_EXT_HOST/USER/PASS/NAME`,
  `HARNESS_URL_EXT`) via `harness-worktree.sh apontar` — o mesmo override/`.env` do worktree local,
  só que apontando para fora; juiz no OpenRouter por default no cloud (`HARNESS_DUELO_JUIZ_CLOUD`);
  MR pela **API do GitLab** (`GITLAB_TOKEN`), `glab` como alternativa.
- Orquestrador no runner = Claude Code headless com `CLAUDE_CODE_OAUTH_TOKEN` (token da assinatura
  via `claude setup-token`) ou `ANTHROPIC_API_KEY`; mãos e juiz = OpenRouter.
- Modelos prontos, sincronizáveis: `.claude/scripts/noturno-ci.yml` (job agendado, artefatos de log
  e telemetria) e `.claude/scripts/noturno-db-clone.sh` (cron no servidor: `prod → <db>_noturno`
  toda noite, com bloco de anonimização). Ativação é **por projeto**: schedule + 6 CI variables.
- `harness-worktree.sh apontar <rótulo>` também serve para apontar qualquer checkout a um banco
  externo (ex.: testar contra o `_noturno` na sua máquina).


## 3.4.0 — 2026-08-23

**Sessões paralelas sem se atropelar, loop noturno de DTs, workers com ferramentas e roteamento
pelo placar — o harness fica menos acoplado a um modelo e mais visual.**
Origem: pedido do Charles (23/08): 2–3 sessões no mesmo projeto sujavam o git uma da outra
(review vendo diff alheio, E2E quebrando por banco compartilhado); e a vontade de resolver DTs
de madrugada com modelos baratos. MINOR (hook, script e endpoints novos); **nada obrigatório**.

### Worktrees isolados — `hooks/harness-worktree.sh` (genérico por declaração)
- `novo <rótulo>` cria `git worktree` na pasta irmã `<repo>--wt-<rótulo>` (branch `wt/<rótulo>`),
  copia os gitignored declarados (`HARNESS_WT_COPIAR`, com `src:dst`), **clona o banco** do
  Perfil (`<db>_wt_<rótulo>`, MySQL via dump|restore; Postgres via `createdb -T`), gera o
  **arquivo de override** que o app lê (`HARNESS_WT_DB_OVERRIDE_FILE/TPL` com `{db}`…) e/ou
  anexa chaves ao `.env` (`HARNESS_WT_ENV_MAP`), e resolve a URL por **pasta** (Laragon/MAMP)
  ou **porta** (dev server). Nada do projeto é hardcoded: tudo vem do Perfil e do `harness.env`.
- **Locks compartilhados** no `.git` comum (`lock|unlock|locks`): `/prd-exec` trava a PRD,
  `/dt-exec` trava cada DT — duas sessões (ou o noturno) nunca pegam o mesmo trabalho.
- `fechar <rótulo> --merge` faz merge local, remove a pasta e dá DROP no banco clonado. Push
  continua humano. Telemetria por worktree: `runs/<dev>@<máquina>~<rótulo>.jsonl`.
- **Medido no core (23/08):** clone de 124 MB em 11 s; PHP do worktree lendo o banco clonado;
  `.env` com `E2E_*` apontando para a URL da pasta irmã. Bug corrigido no caminho: o awk do
  Git Bash não casa `[aá]` em UTF-8 (usuário do Perfil saía vazio → `ODBC`).
- Perfil ganha a seção **"Worktrees isolados"** (como o app resolve banco/URL); `/prd-exec`
  0.1.1 e `/dt-exec` 0.0.2 usam `worktree.env` (banco/URL próprios) e os locks.

### Loop noturno de DTs — `scripts/noturno.sh` + `/dt-sweep --autonomo`
- Worktree `noturno-<data>` com banco clonado → `claude -p "/dt-sweep --loop --autonomo"`: sweep
  (só 🔵 ideia aplicada sozinha), lotes 🟢 com lock por DT, lote leve (sherlock solo), **duelo**
  nos itens mecânicos, 1 commit por item na branch `wt/noturno-*` → push da branch + `glab mr
  create`. Nunca toca a principal. Agendável por routine do Claude Code, cron ou Caronte.
  `HARNESS_NOTURNO='on'`, `HARNESS_NOTURNO_MAX_LOTES='3'`.

### Workers com ferramentas (OpenRouter) — `harness-delegate.sh --tools`
- O worker deixa de ser completion cega: mini-agente **read-only** com `read_file`, `list_files`,
  `grep` e `lint` (roda o `HARNESS_LINT_CMD` do Perfil num rascunho em `.harness-run/tmp`, nunca
  no repo). Teto `HARNESS_OPENROUTER_TOOL_TURNS=12`. Ligado no duelo por default
  (`HARNESS_DUELO_TOOLS='on'`). Medido: gemini leu o arquivo-alvo e respondeu em 6 s, 1 tool call.

### Roteamento do duelo pelo placar — `HARNESS_DUELO_ROTEAMENTO='placar'`
- Os 2 workers são os de melhor histórico **neste projeto** (`vitórias − ½·reprovações −
  inaplicáveis` por duelo); modelo abaixo da régua (≥ 5 duelos e < 20% de vitórias, ou > 40%
  inaplicável) sai do pool; a cada 4º duelo volta o rodízio (exploração). `rodizio` desliga.

### Tela do harness (mais visual)
- **Economia:** card "Duelo de modelos & OpenRouter" — liga/desliga, juíza, roteamento,
  ferramentas, reasoning, teto diário, pool, noturno — gravando em `harness.env`/`.local`
  (a chave de API nunca passa pela tela); botão com o **placar dos duelos**.
- **Trabalho:** card "Sessões paralelas" — worktrees ativos, onde você está (banco/URL), locks,
  comandos prontos (novo worktree, testar noturno). Endpoint `/api/worktrees` (read-only).


## 3.3.0 — 2026-08-23

**Velocidade na execução e na fila de DTs: duelo de modelos, task packet, zero paradas, e a
telemetria (inclusive custo em dólar) ligada por padrão para todo mundo.**
Origem: pedido do Charles (22/08) sobre a semana 15→22/08 (27 execuções, 26,7M tokens, 1.635 min
de sessão parada, LOTE-011 em 11h20, 26 DTs novos no core numa semana — metade não era dívida)
e a primeira amostra da 3.2.1 (PRD-121..125 no core: exec entre 2h23 e 3h45, paralelismo 1,5–1,8,
tokens 1,9–3,5M). MINOR porque há superfície nova (hook, agente, skill, executor, arquivos de
telemetria) — mas **nada exige ação do dev**: tudo nasce ligado, com fallback nativo e kill switch.

### Duelo de modelos (S8) — `hooks/harness-duelo.sh` + agente `themis` — ATIVO POR PADRÃO
- Task **mecânica** (`Tipo: backend`, ≤ 3 arquivos-alvo, sem migration/integração/auth/`[barrier]`)
  é escrita por **dois workers baratos** do OpenRouter em paralelo, a partir do mesmo task packet;
  cada um devolve um unified diff; `git apply --check --recount` filtra o inaplicável; um **juiz**
  escolhe ou reprova os dois; o hefesto **aplica o vencedor** e roda lint + spec local. Gates
  (acceptance, dupla-cega, UX) **seguem iguais**. Campo novo `Duelo: auto|sim|nao` no
  `TEMPLATE-TASK.md` (ausente = auto).
- Pool default `HARNESS_DUELO_MODELS='deepseek/deepseek-v4-flash-0731,google/gemini-3.7-flash,qwen/qwen3-coder-next'`
  com rodízio (todo modelo enfrenta todo modelo). **Grok descartado**: a linha barata da xAI foi
  aposentada em 15/05/2026 e o `grok-build-0.1` custa 16× o DeepSeek sem benchmark independente.
- Juiz default **`themis`** (Sonnet, dentro da assinatura — zero API). Alternativas:
  `openrouter` (`deepseek-v4-pro`, medido US$ 0,015 por julgamento — 7× os dois workers juntos) e
  `claude-cli` (haiku via `claude -p` — consome crédito Agent SDK desde 15/06).
- `HARNESS_DUELO='auto'`: liga sozinho quando há `OPENROUTER_API_KEY` na máquina; sem chave o
  hook devolve `desligado` e nada muda para o dev. Kill switch `HARNESS_SKIP_DUELO=1`.
- **Medido em 4 duelos reais (22/08, task de validação PHP):** gemini 13–14 s / US$ 0,004–0,009;
  qwen3-coder-next 5–6 s / US$ 0,0005–0,001; deepseek-0731 com reasoning alto estourou 240 s e
  com reasoning desligado devolveu vazio (o provider queima a saída em raciocínio) — por isso
  `HARNESS_DUELO_REASONING='low'`. Modelos **erram a contagem do hunk** com frequência: o
  `--recount` é obrigatório.
- **Telemetria versionada `prds/_metrics/harness-duelos.jsonl`** (eventos `duelo`/`veredito`/
  `aplicado`): o dashboard mostra **vitórias, derrotas, reprovações, diffs inaplicáveis, nota e
  custo POR MODELO**, com régua de alerta (< 20% de vitórias em ≥ 5 duelos, ou > 40% inaplicável
  = candidato a sair do pool).

### Task packet (S3) — `hooks/task-packet.sh`
- Contrato da task + `PERFIL-RESUMO` + componente referenciado da PRD técnica + arquivos-alvo
  (teto 300 KB). **Todo executor** (hefesto/dedalo/worker de duelo) recebe o packet e a ordem
  "não leia o Perfil inteiro nem a PRD inteira". Motivo medido: tokens por `/prd-exec` dobraram
  (1,02M → 2,04M; PRD-123: 3,55M), hefesto 84k e dedalo 121k por chamada.

### Zero paradas depois da decolagem (S2) · Re-fatiar automático (S7) · Teto de 3 ciclos (S5)
- `/prd-exec` 0.3: tabela de **defaults automáticos** para toda pergunta do meio do run (ambiguidade,
  ambiente, lint falhou, review esgotou, UX, duelo reprovado, conflito, classificador, checkpoint).
  Só param as três exceções já existentes. Medido: 1.635 min de ociosidade na semana, 412/492/507
  min num único prompt.
- `/prd-exec` 1.3: na **2ª task** da mesma PRD que estoura o envelope, a sessão **fatia na hora**
  toda task ainda não despachada com > 3 arquivos (`TASK-00Xa`/`00Xb`). Medido: hefesto 44–51 min
  (3–3,5× a global) no palantir-app e aec-erp-frontend.
- `/prd` Passo 10 e Perfil: **teto absoluto de 3 ciclos** por gate em qualquer preset (o `maximo`
  perde a escalada); ciclo 2+ sempre Sonnet. Medido: caronte PRD-009-fase2, 5 ciclos, 2h47.

### Lote leve (S4) e delegação `apoio` por padrão (S6)
- `/dt-exec`: lote **≤ 3 itens sem migration e sem tela** roda review **solo** (sherlock, 1 ciclo).
  Medido: LOTE-013/015 (3 itens) 89 e 120 min com 3 ciclos de dupla-cega; LOTE-014 (2 itens) 29 min.
- `HARNESS_DELEGATE_MODE='apoio'` vira default (era `off`): discovery mecânico vai ao Codex quando
  há login; indisponível/falhou volta ao nativo sozinho. Atenção: no Mac do Charles o codex-cli
  falhou 4/4 na semana — o fallback cobre, mas vale diagnosticar.

### OpenRouter no broker (vem da 3.2.2) — com freios e custo em dólar
- `harness-delegate.sh --executor openrouter` (+ `--attach`), roteamento por **throughput**,
  `reasoning` configurável, **teto diário em USD** (`HARNESS_OPENROUTER_BUDGET_USD_DAY='2'`),
  teto por execução, `cost_usd` em cada linha do manifest/`harness-delegations.jsonl`. O dashboard
  ganha a seção **"OpenRouter — custo por modelo"** (total, por dia, por papel) e alerta acima de
  US$ 1,50/dia. Chave **só** no ambiente ou `harness.env.local` — opt-in por dev.
- Correção: o manifest era escrito por vários `printf` → dois workers em paralelo intercalavam
  campos na mesma linha (custo do A atribuído ao B). Agora a linha é montada e gravada com um write.

### Fila de DTs (vem da 3.2.2) — `/dt-sweep`, triagem de classe, e a tela
- `/dt`, `/prd`, `/prd-exec` classificam antes de criar DT (só bug/dívida vira `DT-XXX`; ideia →
  `prds/backlog/IDEIAS.md`; harness → mestre; dimensionamento → telemetria; teto de 3 por PRD).
- Skill **`/dt-sweep`** (5 baldes com prova, fila de lotes por sessão paralela, `--loop`, `--aplicar`).
- **Tela do harness (aba Trabalho): card "Saneamento da fila"** — pré-classifica os pendentes na
  hora (heurística, read-only), monta a fila por sessão com o comando pronto e o prompt do
  `/dt-sweep` para copiar. Medido no core: 97 pendentes → 29 lote · 33 PRD · 15 ideia · 8 decidir.

### Telemetria da equipe no repo (vem da 3.2.2)
- `prds/_metrics/runs/<dev>@<maquina>.jsonl` (versionado, append-only, com `projeto`/`autor`/
  `maquina`/`harness`/`extra`); o dashboard lê `runs/*.jsonl` + legado local e descarta linhagem de
  clone. Grupo `sweep` no dashboard. `prds/_metrics/README.md` viaja no sync.

**Não replicado ainda** (decisão do Charles): esta versão fica no mestre até ele validar o duelo
numa PRD real; `/deus --sync` e `/deus --replica` depois.


## 3.2.1 — 2026-08-21

**A validacao virou UMA onda paralela, e o direito de rodar teste passou a ter dono.**
A 3.2.0 atacou o tamanho da PRD e a largura do grafo; sobrou o outro lado do wall time — a
**validacao em serie** (acceptance fechava a Fase 1, e so entao os revisores subiam) e a
**disputa por quem roda o que** (executor "aproveitando" um comando que varria a familia
inteira, suites concorrentes contra o mesmo servidor, familia repetida depois de cada ajuste).
PATCH porque nao ha superficie nova: o pipeline e o mesmo, os gates sao os mesmos e a qualidade
nao cai — o que muda e a ordem e a autoridade.

Pipeline oficial:

```
[A] implementacao  ->  [B] acceptance + dupla-cega + UX  ->  [C] triagem e correcoes
                           (em PARALELO, todos read-only)          |
[E] fechamento  <-  [D] verificacao FOCADA (lint + specs afetados + review delta)
```

- **Onda B — as tres trilhas sobem na mesma mensagem.** O acceptance central da familia
  `PRD-NNN-*` deixou de fechar a Fase 1 e passou a correr **ao lado** da dupla-cega e do
  michelangelo. As tres sao **read-only sobre a implementacao**, entao dividem a janela sem se
  atrapalhar; a independencia dos revisores segue inviolavel (nenhum ve o parecer do outro antes
  de entregar o seu). O preco esta declarado: acceptance que reprova invalida o review daquele
  ciclo — vale, porque reprovacao e a excecao e a espera em serie era a regra.
- **A Fase 1.4 virou "estabilizacao do working tree".** Ela agora garante o que a onda B exige:
  sintaxe validada, **nenhum executor em voo**, doc raiz e DTs fechados. Executor ainda
  escrevendo enquanto o gate roda e o principal invalidador de resultado, e era invisivel.
- **CONTRATO DE TESTES — declaracao normativa unica.** Uma tabela curta de ownership
  (verificacao × executor × sessao pai × momento) mais o que cada lado pode. **Executor:** lint
  dos arquivos que tocou, typecheck focado, o menor spec estritamente local — e **nunca**
  "aproveita" comando cujo glob varra specs de outras tasks. **Sessao pai:** a familia da PRD
  (uma vez, tree estabilizado) e a suite completa (mantida a politica vigente: so em PRD
  multiplo de 5). Qualquer instrucao em outra secao que contrarie a tabela esta **revogada** —
  e as que existiam foram reescritas, nao empilhadas: a 1.4 encolheu, a 2.8 virou verificacao
  focada, e o `TEMPLATE-TASK.md` perdeu o checklist que mandava o executor rodar a suite
  completa em PRD multiplo de 5. O limite tambem entrou nos contratos do **hefesto** e do
  **dedalo**, que sao quem executa.
- **[D] Verificacao FOCADA depois de cada lote de correcao** — lint dos arquivos corrigidos,
  specs **diretamente afetados**, **review delta** (so os achados corrigidos), UX so nas telas
  alteradas. Familia e suite **nao voltam automaticamente**.
- **"Correcao TRANSVERSAL" ganhou definicao fechada** — sete condicoes (middleware/bootstrap ·
  auth/sessao · schema/migration · helper ou fixture de teste compartilhada · componente usado
  por 2+ modulos · contrato global de data/id/idempotencia/serializacao · invalidacao material
  do gate anterior). So elas reabrem familia ou suite, e o Output registra **qual** disparou.
  Mudanca em um componente, endpoint ou spec isolado **nao** e transversal: "por precaucao" nao
  e criterio.
- **Contencao de recursos.** Paralelismo de agente nao e paralelismo de comando pesado: a
  sessao pai serializa **apenas os comandos em disputa** (duas suites Playwright no mesmo
  servidor, acceptance com executor escrevendo, suite e familia juntas, reinicios do mesmo
  banco), nunca o trabalho de analise e review. **Executor nunca roda `taskkill` indiscriminado,
  `pkill -f node` ou derruba o servidor de teste** para resolver contencao — reporta e devolve a
  decisao a pai.
- **Dependencias TIPADAS — corrige a ambiguidade da 3.2.0**, que tratava toda aresta como
  consumo de artefato e empurrava condicao de seguranca legitima para fora do grafo:
  - `[requires]` — consome artefato/contrato/decisao ⇒ **auditado**; sem artefato nomeado, cai;
  - `[barrier]` — espera condicao de seguranca/estabilizacao, sem consumir arquivo ⇒
    **preservado** quando a condicao esta escrita;
  - `[mutex]` (campo novo **`Conflita com`**) — sem dependencia logica, mas disputam o mesmo
    recurso ⇒ **preservado como escalonamento, nunca como ordem** (as duas ficam na mesma onda).

  O **gate de largura** passa a calcular **paralelismo real** (vagas simultaneas, descontando
  mutex) em vez de contar tasks sem dependencia. **Compatibilidade:** PRD antiga sem tipo segue
  valida — a aresta e **auditada e classificada** pela sessao pai, e **nao removida
  automaticamente** so porque nao ha consumo literal de arquivo (muita aresta antiga e barrier
  disfarcada).
- **Checkpoints de parede: SLO de 2h.** **~90 min** — checkpoint preventivo com cinco linhas
  (fase · tasks restantes · validacoes restantes · onde o tempo esta concentrado · previsao +
  **acao tomada para encurtar o caminho critico**). **~120 min** — violacao do SLO, com
  **causa dominante obrigatoria** escolhida entre oito (task superdimensionada · dependencia
  artificial · conflito de escrita · contencao de testes · repeticao de suite · ciclos de review
  · falha de ambiente · estimativa incorreta). Os 3h da 3.2.0 avisavam quando o caminho critico
  ja estava formado.
- **Telemetria do Output** — duracao por etapa ([A]/[B]/[C]/[D]), execucoes da familia, da suite
  e de specs focados, testes locais de executor, reruns por correcao transversal (com a condicao
  citada), ciclos de review e a causa de qualquer parede acima de 2h. Todos os campos sao
  preenchiveis pela propria run; nada de metrica que so poderia ser chutada.
- **Correcao factual da 3.2.0:** o texto dizia que "a rajada de 6-7 agentes existe em 7,4% do
  tempo". Errado — 7,4% e a soma de **3 ou mais** agentes vivos (6,3% com 3-5 **+** 1,1% com 6+).
  A distribuicao correta consta agora inteira: 1,1% / 6,3% / 57,9% (1-2) / 34,6% (nenhum).

**Preservado da 3.2.0, sem mexer:** teto de 8 work tasks, gate de split, task de acceptance,
task de doc raiz, teto de 3 ondas, envelope de ~45 min por task com DT de dimensionamento.

**Fora desta versao** (candidatos a 3.3.0): daemon ou servico global de locks; reescrita do
scheduler; formato novo de PRD; migracao obrigatoria das PRDs antigas; refatoracao dos prompts
para "task packets".

## 3.2.0 — 2026-08-21

**Teto de 8 tasks por PRD e enforcement de paralelismo na execucao: os dois freios que a
telemetria pediu.**
Origem: pedido do Charles (20/08) — *"nao da pra simplesmente passar 10h para rodar uma PRD"* —
em cima do diagnostico da janela 22/07–20/08 (234 execucoes, 10 projetos, 1.258 subagentes).
MINOR porque muda **contrato**: a `/prd` ganha um gate que PARA o fluxo, o campo `Depende de`
passa a exigir o artefato nomeado, e a `/prd-exec` ganha um gate que **reescreve o grafo
recebido**. Nada do que existia quebra — PRD antiga sem artefato nomeado simplesmente tem os
elos nao justificados derrubados, que e exatamente o comportamento desejado.

O que a medicao mostrou, e que motiva cada trava:

- **Os ciclos de review escalam com o TAMANHO da PRD, nao com a qualidade da spec** — `≤7 tasks:
  1 ciclo` · `8–11: 2 ciclos` · `≥12: 4 ciclos` (34 execucoes). O sherlock revisa codigo
  construido; ele nao sabe se o plano era bom. Spec melhor produz mais tasks, mais tasks
  produzem mais superficie, mais superficie produz mais ciclos — e cada ciclo e serial.
- **A frota so existe no comeco.** Em 41 execucoes (16.102 min de parede): **1,1%** do tempo com
  6+ agentes vivos, **6,3%** com 3–5, **57,9% com 1–2** e **34,6% com nenhum**. Por terco: 18% do
  inicio tem ≥3 agentes; no meio e no fim, 2–3%.
- **A causa nao era a `/prd-exec` desobedecer.** Era o grafo. Na PRD-117 do `dra-mariana-duarte`,
  `TASK-004` (lint de segredo no front) declarava `Depende de: TASK-002` (widget da topbar) sem
  consumir nada dela: ficou retida ate o minuto 85, levou 155 min e segurou 2h30 de execucao
  praticamente sozinha. A skill obedeceu um grafo errado — obedecer nao pode significar nao conferir.

### `/prd` — o tamanho vira limite, a dependencia vira contrato

- **Teto duro: 8 tasks de trabalho + as 2 obrigatorias** (acceptance + doc-raiz/DTs) = 10. O
  antigo *"maximo recomendado: 8-10 (exclui as 2 finais)"* nunca freou nada: a mediana real e 10
  tasks de trabalho, com PRDs de 17, 18 e 20.
- **Gate de split (Passo 8), obrigatorio e humano.** 9+ tasks de trabalho ⇒ a skill **para** e
  propoe o corte pelo grafo, na fronteira que deixa a fatia 1 entregavel sozinha: fatia 1 (≤8
  tasks, o que ela entrega), fatia 2 (titulo + objetivo, registrada como pendente no INDEX, nao
  especificada agora) e a saida honesta — seguir com a PRD grande assumindo 4 ciclos e o dobro
  de parede, **com o motivo escrito no Resumo Executivo**. Nao ha fatiamento automatico: o corte
  e decisao de produto. Nao ha "passa em silencio": ou o usuario aceita um corte, ou assume o
  custo por escrito. Aviso antecipado na Entrevista unica (0.1), quando ja da para ver.
- **Dependencia MATERIAL — o teste da saida.** B depende de A **somente se** B le, importa ou
  consome um artefato que A cria. *"Faz mais sentido depois"*, ordem narrativa, "mesmo modulo",
  "parece mais seguro" e "continuacao natural" **nao sao dependencia**. E o artefato passa a ser
  **obrigatorio na declaracao**: `Depende de: TASK-003 (consome a coluna clientes.pix_tipo criada
  la)`. Elo seco e elo nao justificado.
- **Teto de ondas: 3** para as tasks de trabalho (as 2 obrigatorias sao as ondas seguintes).
  Task-raiz que todas consomem e legitima, mas tem de ser **minima** — enquanto ela roda, a PRD
  inteira espera.
- **Orcamento de parede por task: ~45 min.** O orcamento antigo (~4 arquivos / ~3 cenarios) e
  sobre conteudo; este e sobre tempo. Task que nao cabe no envelope vira a cauda que derruba a
  ocupacao para 1 agente — fatie mesmo que caiba nos ~4 arquivos.
- **`TEMPLATE-TASK.md`** carrega o contrato novo no proprio campo e no bloco explicativo.

### `/prd-exec` — tres travas na Fase 1.3

- **Gate de LARGURA, antes do primeiro despacho.** Conte `T` (tasks de trabalho) e `L1` (largura
  da onda 1). `T ≥ 6` e `L1 < 3` ⇒ nao dispare: reabra o grafo e aplique o teste da saida elo a
  elo; **elo sem artefato nomeado e derrubado** e a task sobe para a onda 1. O que mudou e
  anunciado em uma linha e registrado no Output como **desvio de grafo** — e a materia-prima que
  faz a `/prd` seguinte escrever grafo melhor. **Elo duvidoso permanece:** entre 20 min de parede
  e um artefato compartilhado corrompido, o elo fica.
- **Teto de duracao por task (~45 min).** Estourou ⇒ **DT de dimensionamento** (`TASK-NNN levou
  Xmin, envelope 45 — o que ela varria`), sem interromper a execucao: a task ja esta rodando, e
  matar trabalho feito e pior que a cauda. **Duas tasks estourando na mesma PRD** e diagnostico de
  PRD mal fatiada, e sai dito assim no Output.
- **Checkpoint de PAREDE: 3h de parede ativa, depois a cada 90 min.** Nao e pedido de permissao
  para gastar (o orcamento foi aprovado na decolagem) — e o freio que impede a run de 10h passar
  despercebida. Quatro linhas fixas: onde esta · **por que demorou** (a causa dominante, escolhida
  pelo que a run mediu: cauda, ciclos, ocupacao baixa ou espera humana) · quanto falta (em tasks e
  ciclos, nao em minutos redondos) · as opcoes (seguir / fechar o pronto e mover o resto para uma
  PRD de continuacao / abortar). Emitido **entre** despachos, nunca no meio de uma onda: o
  trabalho em voo termina. **Nunca silenciado** por `HARNESS_VERBOSITY` — e decisao, nao narracao.
- **Output Esperado** ganha o bloco **Paralelismo**: largura do grafo e elos derrubados, estouros
  do envelope de 45 min e os checkpoints emitidos com a decisao de cada um.

### Escopo desta versao

Fora: a `/dt-exec` (o LOTE ja roda a 144k tokens e 34 min medianos — nao e onde o problema esta),
a paralelizacao dos ciclos de review (serial por construcao: review → correcao → review) e a
poda dos Perfis obesos, que e a outra ponta do diagnostico e tem trabalho proprio.

## 3.1.0 — 2026-08-18

**A telemetria ganhou olhos: `harness-dashboard.mjs` — agregador determinístico + dashboard
HTML, com custo e duração POR AGENTE e POR MODELO.**
Até aqui a gravação por execução era boa (schema 2.14.0) e as regras de leitura eram maduras
(PLAYBOOK), mas o `/harness-report` agregava o jsonl **"na mão"** a cada rodada — scripts
ad-hoc do modelo, caro, lento e não reprodutível (a rodada de 04/08 levou uma sessão inteira) —
e a pergunta que mais importa para diagnosticar, **"qual agente/fluxo está lento, e em qual
projeto?"**, não tinha resposta: a linha do `harness-runs.jsonl` não carrega nada por agente
(só `models` como texto e o `ciclos` do gate). MINOR porque entra um artefato novo no núcleo e a
skill muda de contrato (o script vira o Passo 0); nada do que já existia quebra.

- **`.claude/hooks/harness-dashboard.mjs`** (Node puro, sem deps, read-only sobre os projetos):
  lê os `prds/_metrics/harness-runs.jsonl` (+ `harness-delegations.jsonl`) do projeto atual ou
  de **todos os irmãos** (`--all`, pasta-pai = `HARNESS_DASHBOARD_BASE` ou pai do repo),
  deduplica pela chave da skill, filtra a janela (`--periodo=Nd` ou `--de/--ate`) **e a janela
  anterior de mesmo tamanho**, e aplica **exatamente** as regras do `/harness-report`: mediana
  (nunca média), fronteira de `schema`, duração só quando confiável (`wait_gap_threshold_min`
  presente ou `max_gap_min ≤ 30`), custo real = principal + subagentes, mockup fora, executor
  externo nunca somado com Claude, e as 8 réguas de alerta (🔴/🟠). Emite
  `harness-dashboard-<de>_<ate>.html` (auto-contido, gráficos SVG inline, claro/escuro, paleta
  validada) + `.json` com os mesmos números. Medido: **104 execuções de 8 projetos em 3,7 s**.
- **Por agente / por modelo — a novidade.** O script cruza com `~/.claude/projects/<slug>`:
  cada `tool_use Agent` da sessão principal (`subagent_type`) → `toolUseResult.agentId` (e
  `resolvedModel`) → `<sessão>/subagents/agent-<id>.jsonl` (janela + `usage.output_tokens`), e
  atribui o agente à execução cujo intervalo contém o disparo. Sai: n, duração mediana/p90 e
  tokens por agente (hefesto, dedalo, beholder, michelangelo, sherlock, peter-quill, tony-stark,
  atlas, ariadne…), por modelo, e **agente × projeto** com a razão contra a mediana global do
  agente — "o dedalo não é lento; o dedalo no caronte é 2,1× mais lento". Em 2026-08: 517
  subagentes casados. Sem transcripts acessíveis (ou `--sem-transcripts` /
  `HARNESS_DASHBOARD_TRANSCRIPTS='0'`) a seção sai **n/d**, nunca zero.
- **Duas réguas novas:** 🟠 **Agente lento** (mediana do agente num projeto ≥ 2× a global, n ≥ 3
  — investigue o projeto, não o modelo) e 🟠 **Harness velho** (≥ metade das execuções do
  projeto sem `schema` — está rodando `harness-metrics.sh` pré-2.12.0; rode `/deus`/`/prometeu`).
  A rodada de 01–17/08 pegou 4 projetos assim (55 de 104 linhas).
- **Skill `/harness-report` reescrita em cima do script:** Passo 0 roda o agregador, a skill
  **lê o JSON e escreve a leitura** (3 respostas curtas: geral / projeto / agente-fluxo +
  recomendações). Os Passos 1–3 ficam como especificação e fallback (Node ausente ⇒ na mão,
  declarado). `--html` segue aceito (o HTML é sempre gerado). Cadência recomendada: quinzenal.
- **`harness.env`:** `HARNESS_DASHBOARD_BASE` (pasta-pai do `--all`; vazio = pai do repo) e
  `HARNESS_DASHBOARD_TRANSCRIPTS` (`'1'` default). O script lê o `harness.env` do repo
  diretamente (variável de ambiente do processo tem prioridade).
- **Doctor** cobra `harness-dashboard.mjs`; **`harness-ui.mjs`** e o **painel** o listam entre
  os helpers chamados por skill (não por evento).
- Primeiro dashboard real: `docs/relatorios/harness-dashboard-2026-08-01_2026-08-17.html`
  (104 execuções, 8 projetos: tokens/exec −26% vs quinzena anterior; fase 2 e `/prd-exec` mais
  lentos em parede sem gastar mais — fator de paralelismo mediano 1,20; `dra-mariana-duarte`
  com 59% dos tokens; 12 delegações Codex read-only com `tree_tocado=SIM`).

## 3.0.4 — 2026-08-17

**A equipe ganhou o próprio propagador de harness: a skill `/prometeu` + o agente `prometeu`.**
Até aqui, atualizar o harness de um projeto era privilégio de quem tem o vault: o `/deus` roda
contra a cópia-mestre e a equipe só recebia o resultado (ou copiava arquivo na mão a partir do
clone do harness base, sem diagnóstico e sem rede de segurança). O PROMETEU é a mesma mecânica —
**mesmo `harness-sync.sh`, mesmos rótulos de estado, mesmo respeito ao que é local** — apontada
para a **fonte que a equipe tem**: o clone local do harness base. PATCH porque nada de contrato
muda: quem não usar a skill não sente diferença nenhuma.

- **Skill `/prometeu`** (`.claude/skills/prometeu/`, **Sonnet**) — dois modos, escolhidos pelo
  diretório em que a sessão foi aberta:
  - **projeto** (dentro de um repo com harness): diagnostica **aquele** repo, mostra um bloco
    curto (estado, versão, git/branch, Perfil, defasagem, extras, risco) e sincroniza sob
    confirmação;
  - **hub** (dentro do clone do harness base, ou com `--all`): varre o `base_dir`, dispara o
    agente `prometeu` em **lotes paralelos**, consolida o painel de saúde e conduz o sync em lote.
  - Argumentos: `--check` · `--sync` · `--pull` · `--all` · `<projeto>` · `--portar`.
- **Agente `prometeu`** (`.claude/agents/prometeu.md`, **Sonnet**) — worker por-projeto: roda o
  `harness-sync.sh --check`, coleta contexto (git/branch/tree, Perfil, `perfil-frescor.sh`,
  `HARNESS_RAG_ENABLED`, `HARNESS_TARGETS`) e devolve veredito estruturado. **Read-only** — nunca
  `--apply`, nunca commit, nunca push. **Entrou no núcleo** (`CORE_AGENTS` do `harness-sync.sh`):
  a partir desta versão ele viaja para todo projeto portado, junto com a skill.
- **`--portar`: instalação do zero, guiada.** Cobre os 7 passos do README (copiar `.claude/` +
  `prds/`, escolher perfil em `perfis/`, preencher, decidir modelos, `CLAUDE.md`, UI UX Pro Max,
  doctor). Se a máquina não tiver o harness base clonado, a skill **pede o link do repositório** e
  clona ao lado — é o caso de quem está começando e ainda não tem fonte nenhuma.
- **`prometeu-config.md` na raiz da fonte** (versionado, com defaults) + `prometeu-config.local.md`
  (gitignored) para os caminhos de cada máquina: `fonte`, `base_dir`, `lote_paralelo`, `blacklist`,
  `via_upstream`, `push`. O caminho da fonte descoberto por um projeto fica em
  `.claude/prometeu.env` (também gitignored).
- **Três salvaguardas que diferenciam o PROMETEU do `/deus`:**
  1. **A fonte é read-only** — a skill nunca escreve, commita ou dá push no clone do harness base
     (é espelho publicado; edição local se perde no `git pull` seguinte), e nunca o usa como alvo
     de sync;
  2. **Commit e push são de quem trabalha** — vale a regra da casa *"commit é SEU"*: a skill monta
     o comando **escopado** (só as linhas `COPIADO|…` + `harness.env`) e **pergunta** antes de
     commitar, **pergunta de novo** antes do push (`push: perguntar|nunca|sempre` no config).
     Nunca `git add -A`;
  3. **Fonte fresca antes de diagnosticar** — `git fetch` no clone e aviso se estiver atrás do
     remoto (fonte velha produz painel mentiroso: projeto "alinhado" contra uma versão que já
     passou).
- **Tudo em Sonnet** (skill e agente), por política: o trabalho exato é do `harness-sync.sh`; o
  modelo só interpreta a saída.
- **`.gitignore`** ganhou `prometeu-config.local.md` e `.claude/prometeu.env`.

## 3.0.3 — 2026-08-13

**Playwright headless é o caminho CANÔNICO de verificação visual; o Browser pane nunca é
caminho crítico.**
Origem: `site-allyson-bezerra-2026`, 13/08/2026 — o pane parou de compositar frames nesta
máquina (`Screenshot timed out... pane is not displayed`). O `dedalo` queimou minutos de
Modo P e os executores do `/prd-exec` (PRD-001) atrasaram a fase de verificação insistindo
nele, com Playwright 1.58 + 3 navegadores instalados e **parados** ao lado. Custo silencioso e
repetível **por agente e por ciclo** — o tipo de perda que nenhum relatório acusa.
PATCH porque nada de contrato quebra: quem já usava o pane e tem pane funcionando segue
usando; a mudança é de **prioridade** (o pane deixa de ser dependência e vira bônus).

- **Regra-base em UM lugar: `.claude/PLATAFORMAS.md` §7**, reescrita. Evidência visual de
  agente = `npx playwright test <spec>` (headless sempre) ou
  `npx playwright screenshot "<url>" <arquivo>.png`, **sempre gravando arquivo** na "Pasta de
  screenshots" do Perfil. *Evidência que só existiu numa janela de preview não é evidência.*
- **O pane vira SONDA ÚNICA opcional:** no máximo **uma** tentativa, no início da tarefa;
  falhou (timeout/erro) → registra `pane indisponível` no relatório e segue 100% Playwright.
  **Proibido intercalar novas tentativas** ao longo da tarefa. Onde o pane funciona, segue
  permitido como inspeção interativa — só nunca como dependência.
- **Agentes atualizados (referenciam §7, não a reescrevem):** `michelangelo` (Modo A e Modo C,
  regras de qualidade e formato do relatório — evidência agora é *caminho de PNG*), `dedalo`
  (Modo P item 6, "veja o que ergueu", retorno) e `ariadne` (Fase 1 item 4, Fase 3 item 1,
  retorno).
- **Skills atualizadas:** `/prd-exec` (Passo 0.2, Fase 2.9.1/2.9.2/2.9.3), `/mockup` (Passo 3 e
  regra 5), `/dt-exec` (5.1 — gate de UX do lote).
- **Perfil ganha o campo `Verificação visual (agentes)`** (seção Testes E2E) no template e nos
  3 perfis prontos. Ele carrega **só o que é local**: versão do Playwright + navegadores, e os
  fatos desta máquina (ex.: "o pane não funciona aqui"), escritos pela **sessão principal** com
  carimbo `[AAAA-MM-DD · origem]` + `perfil-frescor.sh --carimbar`. Fato de máquina nunca sobe
  para a regra-base.
- **`harness-doctor.sh` — grupo novo `visual`** (roda no padrão E em `--autonomia`, que é o
  pré-flight da `/prd-exec`): projeto com front sem Playwright instalado, sem navegadores
  baixados, ou com o campo do Perfil ausente/placeholder → **WARN** (nunca FALTA; projeto sem
  front é N/A). Detecção de front: "Pasta de screenshots" preenchida no Perfil ou ≥3 arquivos
  de UI no repo (podando `node_modules`, `vendor`, `docs`, `.claude`…).
- **Efeito prático:** num projeto com pane quebrado, um agente de front gasta no máximo **uma**
  chamada com o pane e entrega PNG do Playwright no caminho padrão; num projeto sem Playwright,
  o gap aparece **antes** de implementar.

## 3.0.2 — 2026-08-13

**Fix: o lint de PHP estava DESLIGADO EM SILÊNCIO em todo projeto Windows.**
Origem: descoberto no `newportaltefnet` (12/08) e portado ao mestre pelo `/deus` (13/08).
No Windows/Laragon, `php.exe -l` sai com **rc 127 também em erro de sintaxe** (não só 255
como no Unix) — e o `lint.sh` tratava 127 como "binário ausente → exit 0". Resultado: o
hook bloqueante de sintaxe **nunca bloqueou nada** nesta plataforma, mesmo configurado certo.

- **`lint.sh`:** a existência do binário passa a ser checada **antes** de executar (1º token
  do `HARNESS_LINT_CMD`, via `-x`/`command -v`). Binário ausente → aviso + exit 0 (como
  antes, sem bloquear colaborador). Binário existe + rc ≠ 0 → **falha de lint, bloqueia** —
  distinguir pelo rc é impossível; a existência é o único sinal confiável. Testado nos 3
  cenários (sintaxe quebrada bloqueia com rc 2; código ok passa; binário inexistente avisa
  e libera).

## 3.0.1 — 2026-08-13

**Presença confiável: prova local de envio, fila offline (store-and-forward) e self-test no doctor.**
Origem: pings da equipe (Derick/João/Débora) sumindo às vezes do painel do Caronte — e como o
hook era 100% silencioso *por design*, era impossível distinguir "hook não rodou" de "curl
bloqueado pelo firewall" de "rede piscou" de "identidade atribuída errado". PATCH porque nada
muda de contrato: payload (`v:1`), eventos e wiring são exatamente os mesmos.

- **`presence.sh` — prova de envio:** cada tentativa deixa uma linha em
  `.claude/.harness-run/presence.jsonl` (`{ts, evento, http, ok}`), com rotação automática no
  `--start` (>400 linhas → mantém 200). Continua sem stdout = zero token, nada versionado.
- **`presence.sh` — fila offline:** falha de rede não perde mais o ping — o payload vai para
  `.claude/.harness-run/presence-queue/<epoch>-<pid>.json` e o próximo evento com rede drena a
  fila (até 20 por vez, mais antigos primeiro, para no 1º erro). TTL de 30 min + teto de 40
  arquivos: presença é dado **perecível** — o painel usa o relógio do servidor, replay velho
  viraria "agora". Envio em *double-fork*: a drenagem escapa da árvore do hook e sobrevive ao
  timeout de 10s do host.
- **`presence.sh` — teto do curl 3s → 8s + 1 retry:** o `-m 3` estourava em rede de escritório
  com DNS frio; pior, o throttle já estava carimbado — ping perdido abria um buraco de 15 min.
  Segue em background; caminho quente inalterado.
- **Throttle 15 → 10 min** (default do hook e `harness.env` do mestre): contra o verde do
  painel (< 20 min), 15 deixava margem de só 5 — UM heartbeat perdido degradava o dev para
  amarelo. Projeto já portado preserva o `harness.env` local: ajuste a var na mão (ONBOARDING).
- **`harness-doctor.sh --presence`** (aceita `--presenca`): self-test de ponta a ponta —
  módulo ligado?, `presence.sh` no disco?, curl?, wiring no `settings.json` (o sync não mexe
  nele — o check pega projeto portado com hook morto), último envio logado, fila represada, e
  um ping REAL de teste com o http_code na cara (`000` = saída bloqueada por firewall/AV/proxy;
  `401` = token; `2xx` = ok — aparece no painel como sessão `doctor-selftest`). O run padrão
  ganhou o grupo `presenca` na matriz (só checks locais, zero rede).
- Novas variáveis opcionais (comentadas no `harness.env`): `HARNESS_PRESENCE_TIMEOUT` (8) e
  `HARNESS_PRESENCE_QUEUE_TTL_MIN` (30).
- O lado servidor (folga do semáforo 20→25 min, identidade compartilhada sem auto-vínculo,
  alerta de versão do harness no painel, expiração de sessão sem `end`, painel de diagnóstico
  de ingestão) é PRD no repo do **caronte** — este PATCH é só o emissor.

## 3.0.0 — 2026-08-07

**Multi-CLI: o harness passa a delegar mini-tasks read-only a outros CLIs da máquina — e ganha
dois dials para gastar menos.**
Origem: pedido do Charles (07/08) — *"quando minha conta Claude estiver perto de acabar, quero
usar mais o Codex e o Claude mais pra orquestrar"*, somado a *"o harness fala demais"*. Major
porque há **superfície nova** (executor externo delegado), seção nova no Perfil e mudança de
schema no `harness-runs.jsonl` — não porque quebre port: o default `off` é bit a bit o
comportamento da 2.16.1, e há teste dedicado a isso (t20, "Perfil legado").

A 2.0.0 tornou o harness capaz de **rodar** em dois runtimes. Esta versão acrescenta o eixo que
faltava: **de onde sai o trabalho**. A separação de responsabilidades é o desenho inteiro —
**roteador** (a skill, lendo o Perfil) decide onde; **broker** (script determinístico) executa,
cronometra e normaliza; **juiz** (a sessão principal) lê, confronta e escreve. O juiz nunca é
delegado: é isso que "o Claude orquestrando" significa, e é por isso que não existe uma chamada
extra só para juntar textos.

- **`.claude/hooks/harness-delegate.sh`** — o broker. Recebe um envelope, dispara `codex exec`
  ou `claude -p` **read-only**, aplica teto de tempo, captura stdout/stderr separados, mede o
  custo real e devolve status normalizado. O **exit code é o canal do fallback** (`0` ok · `10`
  indisponível · `11` timeout · `12` erro · `13` vazio · `20` reentrada · `2` uso) — diferente do
  `external-review.sh`, que sai 0 sempre por ser defensivo; aqui quem chama é uma skill.
  Injeta sozinho o preâmbulo obrigatório (modo, o que ler, proibições, teto de palavras,
  independência), então **envelope malfeito ainda carrega as regras**. Modo `--rota <papel>`
  resolve `modo → papel → executor` de forma determinística: as skills perguntam em vez de
  parsear a tabela do Perfil cada uma do seu jeito.
- **`.claude/hooks/_delegate-common.sh`** — o núcleo genérico extraído do `external-review.sh`
  (teto de tempo portátil com o probe de capacidade do Git Bash, probe de executor, raiz do
  projeto, guard de reentrância). Duplicá-lo no broker significaria **duas implementações do
  watchdog divergindo** — e o watchdog é a peça que impede processo órfão. O `external-review.sh`
  passou a sourceá-lo: contrato, flags, escopo delta e o shim `codex-review.sh` **inalterados**.
- **Segurança é prova, não promessa.** Codex roda em `--sandbox read-only` (SO) + `--ephemeral` +
  `approval_policy=never`; Claude em `--tools "Read,Glob,Grep"` + `--disallowedTools`. A
  assimetria (sandbox de SO × restrição de ferramentas) está **declarada**, não maquiada — e o
  broker tira impressão do working tree antes e depois, registrando `tree_tocado` no manifest.
  Zero `--dangerously-*`, zero API key, zero commit, nunca sem teto de tempo.
- **Telemetria real do Codex.** `codex exec --json` emite `turn.completed.usage` com
  `input_tokens`/`output_tokens`/`reasoning_output_tokens`, e `-o` entrega a resposta limpa em
  separado — então o custo do lado Codex é **medido**, não estimado (quando um executor não
  reporta, o campo sai `n/d`, nunca um chute com cara de medição). Manifest granular por
  delegação em `.claude/.harness-run/delegations/<LABEL>/manifest.jsonl`. **Tokens de Codex e de
  Claude nunca são somados num número só** — contas, quotas e preços diferentes.
- **Dial de delegação** (`HARNESS_DELEGATE_MODE`): `off` (default) · `apoio` (mapeamento mecânico
  ao Codex) · `economia` (todo o read-only da `/prd`). Precedência `env > harness.env.local >
  Perfil > harness.env` — com **resgate da variável de ambiente antes do source**, senão o
  `harness.env` versionado comeria a virada pontual `HARNESS_DELEGATE_MODE=economia claude`. A
  camada certa para uso pessoal é o `.local` (gitignored): não viaja para a equipe no `/deus`.
- **O fallback se INVERTE em `economia`.** Nos outros modos, executor externo que falha volta para
  `native`. Em `economia` isso devolveria o trabalho justamente à conta que se está poupando — em
  silêncio, no meio de uma PRD. Lá o default é **parar e perguntar**.
- **michelangelo e dedalo nunca são delegados**, e não por conservadorismo: a `ui-ux-pro-max` é
  deliberadamente excluída dos adapters Codex pelo `gen-adapters.sh` — delegá-los degradaria o
  gate de UX em silêncio.
- **`HARNESS_VERBOSITY`** (`normal` · `conciso` **novo default** · `minimo`) — quanto as skills
  falam *durante* o processo. Não é cosmético: texto emitido é token de **output** (o mais caro e
  o mais lento) **e vira input em todos os turnos seguintes** — narração intermediária é o único
  gasto do harness que **compõe**. Uma síntese de 800 palavras no Passo 3 não é paga uma vez; é
  relida até o fim da PRD. Generaliza o padrão que o `HARNESS_REVIEW_SEVERITY_FLOOR='critico'` já
  provou nos gates. **Guard-rail inegociável, testado:** concisão não silencia a pergunta da
  decolagem, degradação (modo solo, fallback, gate sem evidência), 🔴, erro que exige decisão nem
  o relatório final — e o arquivo em disco sai completo em qualquer nível. Concisão não pode
  virar omissão.
- **Orçamento na decolagem, sem parada nova.** `harness-metrics.sh baseline` deriva o custo típico
  do histórico **real do projeto**, e vira **uma linha** dentro da entrevista que já existia na
  `/prd` (0.1), `/prd-exec` (0.3) e `/dt-exec` (1.4). Sem histórico: "sem baseline" — estimativa
  sem dado é chute com cara de medição. A única reabertura por custo é o **estouro objetivo** do
  envelope (gate no ciclo 4+, teto de delegações, fallback `perguntar`). A 2.4.0 mediu ~8 min de
  espera humana por parada no meio do fluxo, ~5h em 35 sessões: essa regressão não volta.
- **Teto anti-espiral de gasto** (`HARNESS_DELEGATE_MAX_PER_RUN`, default 8) — o análogo do
  `HARNESS_GUARD_SPIRAL_N` para quota externa: lá o alvo é o comando repetido, aqui é a skill em
  loop de ciclos queimando delegação sem ninguém ver.
- **Reentrância:** flag genérica `HARNESS_IN_EXTERNAL_AGENT` convivendo com a histórica
  `HARNESS_IN_EXTERNAL_REVIEW`; `_rag-common.sh` e `presence.sh` reconhecem as duas (sem isso, um
  executor delegado pingaria o Caronte como "sessão" nova, inflando o painel com subprocessos da
  mesma pessoa no mesmo minuto).
- **Testes:** t19 (broker — os 7 desfechos, paralelismo, colisão de relatório, envelope, working
  tree intacto, nenhuma API key exigida), t20 (roteamento — Perfil legado, os 3 modos, override
  fino vencendo o modo, precedência, executor inválido degradando alto), t21 (compatibilidade do
  `external-review.sh` + degradação explícita sem a lib). **Mocks de binário: a suíte não consome
  quota de Claude nem de Codex.**
- **Aba "Economia" no `/harness-config`** — modo de delegação, fallback, verbosidade e a tabela
  de roteamento por papel (com a coluna **Efetivo**, que mostra o que vai valer depois de aplicar
  modo + override). Os três dials têm **destino escolhível**: `máquina` grava no
  `harness.env.local` (gitignored, não viaja no `/deus`) e `projeto` no `harness.env`. O default é
  **máquina** de propósito — "minha conta está apertada esta semana" não pode virar commit no repo
  da equipe. O `harness.env.local` **continua fora** da allowlist de arquivo da tela (ele guarda
  segredo por máquina); a fresta é por **chave** (`ENV_LOCAL_CHAVES`), então um
  `HARNESS_PRESENCE_TOKEN` existente nunca é lido pelo browser nem tocado na escrita. O
  `michelangelo` aparece travado em `native` na tabela, pelo mesmo motivo de sempre.
- **Escopo desta versão:** delegação só na `/prd`, só read-only. `/prd-exec` e `/dt-exec` recebem
  apenas verbosidade e orçamento. Fora: Kimi (a extensão está preparada — um ramo em
  `run_executor()`), OpenRouter, API direta, worktree por executor, execução de código por agente
  externo.

## 2.16.1 — 2026-08-06

**Convenção `cron-smart`: uma linha de crontab, rotinas controladas por banco.**
Patch, não minor — e isso vira regra: convenção é conteúdo **aditivo** (não muda o que o harness
faz, não exige decisão do dev, não quebra port), então gasta patch. Minor fica reservado a
mudança de capacidade — skill, agente, hook, contrato.

- **`.claude/convencoes/cron-smart.md`** — *Smart Scheduler: cron burro, banco inteligente*.
  Destilada de **três** implementações em produção, que são três gerações do mesmo padrão:
  palantir-app (PRD-019, N linhas de crontab, sem dispatcher), dra-mariana-duarte (PRD-025,
  dispatcher que orquestra e o filho decide) e caronte (PRD-004, dispatcher que decide e executa
  closures registradas em código) — esta última é a forma canônica. Traz o DDL de `cron_config`,
  o contrato das duas entradas do dispatcher, o passo a passo do port em 11 itens, **17
  armadilhas** (5 com incidente real de produção: DT-036, DT-042, DT-082, DT-085 e a lista
  paralela de scripts fora de sincronia) e checklist de aceite. Extensões opcionais documentadas:
  sharding para volume alto, alerta ativo após 3 falhas consecutivas e reconexão defensiva de PDO.
- **Regra de versionamento das convenções** escrita nos dois lugares que a aplicam: seção *Regras*
  do `.claude/convencoes/INDEX.md` e modo `nova` do `.claude/skills/convencao/SKILL.md`. A skill
  também passa a ser explícita em **não** bumpar `CHANGELOG`/`HARNESS_VERSION` por conta própria.
  O `mfa` (`2.7.0`) é anterior à regra e fica como registro histórico.

## 2.16.0 — 2026-08-06

**Presença: o sinal sobrevive à tarefa longa, e duas sessões no mesmo repo não se silenciam.**
Origem: painel "Equipe agora" do Caronte (PRD-006) — sessão executando uma PRD por 40 min sem
input humano não pingava nada (os gatilhos eram só start/prompt/end), era rebaixada a "sem
sinal" aos 20 min e REMOVIDA do board aos 60 — a telemetria ficava cega exatamente no pico de
atividade. O receptor já tinha sido corrigido (caronte `1a9ce4c`); estes dois ajustes são no
EMISSOR.

- **Heartbeat no `PostToolUse` (sem matcher), wired no `settings.json` e no `.codex/hooks.json`.**
  Toda ferramenta executada conta como presença; o throttle de 15 min é o que segura o volume —
  a esmagadora maioria das chamadas morre na primeira comparação. Contrato de custo zero
  mantido: `async: true` no Claude, nunca imprime em stdout, `exit 0` sempre. Para caber no
  caminho por-tool-use, a extração do `session_id` saiu do `jq` e virou **regex nativo do bash**
  (zero processo; `jq` só como fallback) — necessária porque ela se moveu para ANTES do throttle.
- **Throttle POR SESSÃO, não por projeto.** O carimbo era `presence-last-ping` único no
  `.harness-run` do repo: com duas sessões abertas no mesmo repositório (RF-05, modo normal de
  trabalho), a primeira que pingava silenciava a outra por até 15 min e a segunda janela
  aparecia falsamente parada. Agora o carimbo é `presence-last-ping-<session_id sanitizado>`
  (sanitização bash-nativa, trunca em 64); sem `session_id` no stdin, degrada para o carimbo
  global antigo. **Poda:** carimbos com mais de 1 dia são apagados no `--start` (1× por sessão,
  best-effort) — o `.harness-run` não acumula lixo de sessões mortas.

## 2.15.0 — 2026-08-05

**O loop do Perfil fechou nas três pontas: frescor na entrada da execução, procedência na
escrita, poda com prova no `/deus`.**
Origem: pedido do Charles (05/08) — "regra antes de toda PRD para ler o Perfil e podar, para
ele não inchar". A ideia foi implementada **separando** o que ele juntava: regenerar o *resumo*
é barato, determinístico e cabe no caminho crítico; **podar o Perfil** é caro, arriscado e
raro — e não pode acontecer com o modelo sem contexto, antes de começar a trabalhar.

- **Hook novo `perfil-frescor.sh` + gate no Passo 0 de `/prd`, `/prd-exec` e `/dt-exec`.** Todo
  subagente lê o `PERFIL-RESUMO.md`, não o Perfil — e resumo defasado é a pior falha do harness:
  **silenciosa e confiante** (20 agentes trabalham sobre um fato que mudou). O hook compara a
  **impressão digital** do Perfil com o carimbo gravado dentro do resumo e devolve `FRESCO` /
  `DEFASADO` / `SEM-CARIMBO` / `SEM-RESUMO` / `SEM-PERFIL`. `DEFASADO` = regere o resumo **antes**
  de despachar o primeiro subagente e feche com `--carimbar`. Custo em execução normal:
  milissegundos. **Por que carimbo e não mtime:** `git checkout` reescreve mtime em ordem
  arbitrária — a checagem por mtime do doctor (2.10.0) acusava defasagem falsa e, pior, aprovava
  resumo defasado de verdade. O doctor passa a usar o hook, com o mtime só como fallback.
- **Procedência obrigatória na escrita.** Entrada nova no Perfil sai como
  `**[AAAA-MM-DD · PRD-NNN]** <armadilha> — *Por quê:* <...>` — regra na última task da `/prd` e
  na 5.6 da `/prd-exec`, documentada no template do Perfil. **É isto que torna a poda possível:**
  sem data e origem, ninguém sabe se uma armadilha ainda vale, e podar vira chute. Entradas
  antigas não precisam ser reescritas em massa; carimba-se a que se tocar.
- **Poda no `/deus`, com PROVA e sob confirmação** (seção nova). Três baldes: **🟢 morto
  provado** (o arquivo citado não existe, o comando falha, a coluna não está no schema) → poda;
  **🟡 suspeito** (procedência > 12 meses sem referência viva, duplicata, virou convenção da
  casa) → decisão individual do Charles; **🔴 intocável** (regra fixa do harness, ou qualquer
  entrada cuja evidência você não conseguiu produzir) → fica. **"Parece obsoleto" não é prova.**
  O que sai **não é deletado**: vai para `.claude/PERFIL-ARQUIVO.md` com a data e a evidência —
  poda é mudança de lugar, e é isso que a torna reversível. Commit escopado, **não**
  pré-autorizado (é conteúdo do projeto, não harness). O agente `deus` passa a reportar o
  veredito de frescor e o tamanho do Perfil no painel.
- **Bug pego no próprio desenvolvimento:** o `--carimbar` sobrescrevia qualquer linha que
  *citasse* o marcador (a prosa que explica o carimbo virou carimbo). Corrigido com prefixo
  exato + substituição só da primeira ocorrência.

## 2.14.0 — 2026-08-05

**O custo registrado era 1/3,65 do custo real — e o re-review parou de reler o diff inteiro.**

- **Tokens de subagente entraram na conta (`tokens_output_subagents`, `tokens_total_subagents`,
  `out_tps_all`).** O medidor lia só os `.jsonl` do **topo** do diretório da sessão; subagente
  vive em `<session>/subagents/` e por isso **nunca** foi somado. Medido na PRD-111: **489k de
  output na sessão principal contra 1,30M nos 23 subagentes** — custo real **3,65×** o
  registrado. Isso subestimava sistematicamente `/prd` e `/prd-exec` (10–25 agentes) e quase não
  afetava `/dt-exec` de 1–2 itens: comparar os dois grupos no histórico antigo comparava
  **medidas diferentes**, e a PRD parecia mais barata do que é. Verificado que não há dupla
  contagem: o transcript principal da PRD-111 tem **0 de 1.050** entradas `isSidechain`. Os
  campos entram **separados** para não reescrever o significado do `tokens_output` no meio da
  série — custo real de uma linha nova = `tokens_output + tokens_output_subagents`. O
  `/harness-report` passa a usar a soma em toda comparação de custo.
- **Re-review em escopo DELTA (ciclos 2+).** 4º argumento do `external-review.sh`/`codex-review.sh`
  (`delta`, ou `HARNESS_REVIEW_SCOPE`). Como não há commit entre ciclos, o helper grava a
  impressão digital por arquivo do estado revisado em
  `.claude/.harness-run/review-scope-<LABEL>.tsv` e, no ciclo seguinte, manda ao revisor **só o
  que mudou desde então** — com prompt próprio ("a correção fechou de fato? introduziu bug
  novo?"). **Degradação segura em três pontos:** ciclo 1 é sempre full; sem snapshot → full com
  aviso; delta vazio → full com aviso (a "correção" não tocou código é sinal por si só). No
  provider `codex-cli` o recorte não se aplica (`review --uncommitted` não aceita filtro): o
  relatório sai completo **com a lista do delta no cabeçalho**, para a triagem separar regressão
  do ciclo de achado pré-existente. `/prd-exec` 2.6 e `/dt-exec` Passo 5 passam a chamar com
  `delta` e a instruir o sherlock na mesma régua.

## 2.13.0 — 2026-08-05

**`/dt-exec` ganhou vazão: fila multi-lote, execução em grupos disjuntos e migration aditiva.**
Origem: pedido do Charles (05/08) — "dar vazão aos DTs". As três alavancas atacam custos
diferentes; nenhuma delas mexe na rede de segurança (safe-mode, review dupla-cega, verificação
por item e gate documental continuam **por lote**).

- **Fila multi-lote (`--fila`, `--fila=N`, teto absoluto 5).** O maior custo por DT não era a
  implementação — era a **decolagem repetida**: cada `/dt-exec` pagava entrevista + sync +
  safe-mode para 3–5 itens (medido no LOTE-002: ~25 min de implementação contra ~2h de gates).
  Agora o Passo 1.3 particiona os elegíveis em até N **lotes coesos** (um por módulo/área,
  ordenados por risco crescente — sem DDL primeiro), a entrevista do 1.4 aprova a fila inteira
  de uma vez e os Passos 2–7 rodam por lote. **Parada da fila** em lote Bloqueado, safe-mode
  reprovado, >10 bloqueantes no ciclo 1 ou gate 7.7 sujo: o Output mostra o que fechou, o que
  quebrou e o que não rodou. Lotes da fila não podem compartilhar arquivo-alvo (seriam um lote só).
- **Passo 3.2: grupos disjuntos viraram o default** (o inverso do que era). A justificativa
  antiga — "lote coeso ⇒ itens tocam os mesmos arquivos" — não se sustenta: coeso por *módulo*
  raramente significa mesmo *arquivo*, e a lista de arquivos-alvo já é coletada no Passo 1.1.
  Agora: agrupar por alvo, um executor por grupo, todos na mesma mensagem; série só por colisão
  real de arquivo (item com migration fica sozinho — schema é recurso compartilhado); mini-lote
  de 1–2 itens não monta grupo. O `parallel_factor` (2.12.0) audita se o plano anunciado foi
  mesmo despachado junto.
- **Migration ADITIVA deixou de ser critério de ejeção absoluto (1.2).** "Qualquer schema vira
  PRD" empurrava para a cerimônia cara o DT pequeno mais comum: *falta uma coluna* — e a PRD não
  acrescentava segurança nenhuma ali. Passa no lote, com **checklist fechado** (não julgamento):
  só `CREATE TABLE` nova / `ADD COLUMN` nullable ou com default / `CREATE INDEX`; zero
  `DROP`/`RENAME`/mudança de tipo/backfill; sem contrato externo consumindo; rollback declarado
  em uma linha; máx. 1 migration por item e 2 no lote; Perfil declarando como rodar migration
  local. Caixa desmarcada = ejeção. Novo passo **4.1**: a sessão pai aplica e prova o estado
  final via `information_schema` (comparar só nome de tabela esconde drift de
  nullability/collation/índice). `--sem-migration` força a ejeção de todo DDL no run.
- Campos novos na mini-spec por item: **`Grupo de execucao`** e **`Migration`** (DDL + rollback +
  consulta de prova). O Output ganhou as linhas `Execucao` e `Migrations`, e a fila ganhou uma
  tabela-resumo final.

## 2.12.0 — 2026-08-05

**O termômetro parou de esconder a doença: telemetria que separa ocioso de subagente vivo,
e paralelismo virou regra também na fase de correção.**
Origem: autópsia da `/prd-exec` da PRD-111 (`dra-mariana-duarte`, 05/08). Dois achados que se
reforçavam — a métrica **escondia** o problema que a skill **não prevenia**.

- **`wait_idle_min` x `wait_gap_min`: gap ocioso deixou de ser confundido com subagente
  trabalhando.** Desde a 2.10.0 todo gap do transcript principal virava espera humana — mas
  quando a sessão despacha um subagente em background **o turno encerra** e o transcript
  silencia até a notificação: indistinguível de operador ausente. A PRD-111 gravou
  `wait_human_min=850` com `permission_prompts=0` — eram **506 min de ociosidade real +
  ~344 min de subagente trabalhando** somados no mesmo campo. O medidor agora lê as janelas
  reais dos subagentes (`<session>/subagents/agent-*.jsonl`, primeiro e último timestamp) e
  classifica: `wait_idle_min` (ociosidade — **a única** que desconta `elapsed_active_s` e
  dispara o aviso ⚠️), `wait_gap_min` (gap com subagente vivo = trabalho),
  `subagent_busy_min` (soma das durações) e `subagent_measured` (quantos foram medidos —
  cruze com o `subagents` declarado pela skill). `wait_human_min` passa a valer a ociosidade.
- **`parallel_factor` = `subagent_busy_min` / duração ativa.** O número que faltava para a
  regra de paralelismo deixar de depender de disciplina. Régua no PLAYBOOK: **`< 1,3` com
  `subagents >= 10` = execução SERIAL** e merece post-mortem — e o resumo da telemetria
  imprime o alerta sozinho. Medido na PRD-111: **1,04** com 22 subagentes.
- **`out_tps` baixo não acusa mais espera quando há subagente em voo.** O `out_tps` só conta o
  transcript principal; execução com muito subagente sai artificialmente baixa (PRD-111: 5,18).
  O aviso ⚠️ agora exige ociosidade real, ou `out_tps` baixo **com** a parede desocupada
  (< 30% coberta por subagente). Aviso que dispara em execução saudável treina o leitor a
  ignorá-lo — o oposto do que o PLAYBOOK quer.
- **Fronteira de versão explícita: campo `schema` na linha do JSONL.** Linha sem `schema` é
  pré-2.12.0 e **não é comparável** em espera/duração ativa (lá, execução bem paralelizada com
  operador ausente e execução 100% serial produziam a MESMA linha — e o `/harness-report`,
  cujo propósito é apontar regressão de custo, não tinha como distinguir). O relatório passa a
  declarar quantas linhas da janela são pré e pós-`schema`; tokens/ciclos/contadores seguem
  comparáveis em todo o histórico. **No host Codex** não há transcript por subagente: os campos
  novos saem vazios (n/d, nunca zero) e a espera de lá mantém a ambiguidade da 2.10.0.
- **`/prd-exec` 2.5 e 2.9.3: correção em GRUPOS DISJUNTOS, no molde da 1.3.** A skill já era
  enfática na Fase 1 (*"paralelo é o comportamento padrão"*) — e funcionou. O tempo se perdeu
  onde ela silenciava: a fase de correção virava um subagente monolítico por ciclo. Na PRD-111
  foram **4 rodadas em série somando 175 min** (50+39+59+27), cada uma agrupando itens de
  arquivos distintos (retrieval / CLI / mídia / um comentário). Agora: depois da triagem,
  agrupar por arquivo/módulo alvo, **anunciar o plano no chat** (*"ciclo 2: 3 grupos disjuntos
  (retrieval / CLI / frontend)"*) e disparar um agente por grupo na MESMA mensagem; série só
  por colisão real de arquivo; bloqueante trivial e isolado nunca espera por estrutural. O
  plano vai para o Output Esperado (Fase 2 e 2.9) — o que é anunciado é conferível.
- **Teste de aceitação `t16`** fixa a semântica com transcript sintético (gap de 30 min COM
  subagente vivo + gap de 40 min ocioso): o primeiro tem de sair como trabalho, o segundo como
  espera, e a linha do JSONL tem de carregar `schema`/`wait_idle_min`/`subagent_busy_min`/
  `parallel_factor`.

## 2.11.0 — 2026-08-05

**Presença: o harness passou a responder "quem está mexendo em quê, agora" — no Caronte.**
Origem: pedido do Charles (05/08) — visibilidade da equipe interna (João, Derick, Débora)
sem precisar perguntar, sem custo de token e sem atrapalhar o fluxo de ninguém.

- **Hook novo `presence.sh`** (SessionStart `--start`, UserPromptSubmit `--prompt`
  com throttle, SessionEnd `--end`; no Codex, Stop reusa `--prompt`). Envia **só
  metadados** — `{evento, projeto, branch, git_email, claude_email, os_user, host,
  session, harness}` — nunca prompt, diff ou nome de arquivo. Custo zero por design:
  hook 100% silencioso (nada no stdout = nada no contexto = zero token), `curl -m 3`
  em **background** (mesmo nos hooks síncronos do Codex) e fail-silent absoluto —
  endpoint fora do ar, DNS sem resolver, curl ausente: ninguém percebe.
- **Identidade sem config por dev.** Multi-dev resolvido no lado certo: o hook coleta
  o que a máquina já sabe (`git config user.email` do `~/.gitconfig`, e-mail do login
  do Claude Code em `~/.claude.json` best-effort, `usuario@hostname`) e o **servidor**
  mapeia e-mail → pessoa (interno/externo). Dev novo aparece sozinho no painel como
  "não mapeado"; mapeia-se 1x lá.
- **Config no `harness.env`:** `HARNESS_PRESENCE_URL` com **default embutido no hook**
  (`https://caronte.app.br/api/v1/presenca/ping`) — variável AUSENTE = default ligado
  (cobre os projetos já portados, cujo `harness.env` o sync preserva); `''` explícito
  = desligado no repo;
  `HARNESS_PRESENCE_THROTTLE_MIN` (default 15) e bypass `HARNESS_SKIP_PRESENCE=1`.
  Token opcional (`HARNESS_PRESENCE_TOKEN`) só via `harness.env.local` — nunca
  versionado. Throttle carimbado em `.claude/.harness-run/presence-last-ping`.
- **Receptor:** DT-013 do caronte (endpoint `POST /v1/presenca/ping` + tabelas de
  identidade + painel "Equipe agora"). Até o DT ser executado e o DNS apontar, os
  pings simplesmente se perdem em silêncio — comportamento esperado.

## 2.10.0 — 2026-08-04

**A telemetria parou de mentir sobre duração — e o gate da fase 2 ganhou as regras que faltavam.**
Origem: revisão quinzenal de 04/08 (281 execuções, 7 projetos). Três instrumentos estavam
quebrados: 82% dos runs tinham `elapsed_active_s` idêntico ao bruto (sessão overnight contava
como 19h "ativas"), 63,6% das linhas do `--all` eram duplicata de linhagem, e a fase 2 do core
do Taurus rodava 8-11 ciclos de gate contra base 2-3.

- **Espera humana derivada de GAPS (`harness-metrics.mjs`/`.sh`).** O notify.sh só vê prompt de
  permissão/idle — sessão deixada aberta não gerava espera nenhuma. Agora todo gap do transcript
  maior que `HARNESS_WAIT_GAP_MIN` (novo no `harness.env`, default 10 min — teto do Bash síncrono
  é 600s, gap maior não é ferramenta) vira janela de espera; as janelas das duas fontes são
  **mescladas** (sem dupla contagem) e descontadas do `elapsed_active_s`. Campos novos na linha:
  `wait_gap_min` e `wait_gap_threshold_min` — a **presença** do segundo é o discriminador de
  linha pós-2.10.0 (duração ativa confiável). Linha antiga com campo vazio segue lida como
  **n/d, nunca zero**. No host codex os gaps são a única fonte (não há notify lá).
- **`/harness-report`: dedup OBRIGATÓRIA no `--all` + régua de confiabilidade.** Dedup por
  `(label, ts_start, ts_end, tokens_output, elapsed_s)`, dono = projeto de histórico mais longo
  (medido: sem isso o core do Taurus contava 7×). Mediana de duração só sobre runs confiáveis:
  linha nova (discriminador presente) OU linha antiga com `max_gap_min <= 30`; o resto sai da
  mediana de duração/out_tps e o relatório declara quantos — tokens e ciclos nunca são
  descartados (métricas limpas).
- **Telemetria fora do git (política).** `harness-runs.jsonl` versionado viaja no merge da
  `/propagar` e em bootstrap por cópia de pasta (o doce-ana NASCEU com 124 registros do core e
  zero próprios). O doctor agora acusa telemetria rastreada no git (com o fix pronto na
  mensagem); o `.gitignore` do core do Taurus ganhou a regra + `git rm --cached`. A cópia-mestre
  (vault) é exceção consciente.
- **Fase 2 que não converge: as três regras que faltavam.** Investigação nas PRD-104→110 do
  Taurus (8-11 ciclos, ~25 min/ciclo extra): os 🔴 tardios NÃO eram gate inflando — eram a MESMA
  correção entrando em 3 das 4 camadas onde a regra vive (prosa produto / técnica / critério de
  aceite / cenário E2E) e voltando para sempre, mais achados iatrogênicos (o fix do ciclo N cria
  o 🔴 do N+1). (1) **Propagação em todas as camadas**: corrigir 🔴 agora exige grep temático em
  TODOS os documentos da PRD + declaração de onde tocou; (2) **tabela de verificação** no re-run
  dos gates: cada 🔴 anterior vira FECHADO / PARCIAL (onde falta) / REABERTO **mantendo o número**
  — parcial não é achado novo; (3) **enforcement do teto**: cabeçalho `Ciclo: N de L (teto
  absoluto 5)` mesmo com Perfil `0`, e **zero 🔴 FECHA o gate** — no piso `critico`, ciclo novo
  por 🟠/🟡/🔵 é bug de processo (caso real: PRD-104, ciclos 6-10 sem nenhum 🔴).
- **Campo `ciclos` da fase2 mudou de unidade:** era a SOMA dos gates (beholder 3 + michelangelo
  5 = "8" — disparava alerta falso); agora é o **maior** ciclo entre os gates, com o detalhe em
  `--extra="gates: beholder cN, michelangelo cM"`. O `/harness-report` desconta a soma ao ler
  linha antiga.
- **`/prd-exec`: despacho CONTÍNUO — a onda virou plano, não barreira.** Medido (runs sem gap):
  3 ondas = 32 min · 5 = 1h42m · 6 = 2h18m — o tempo estava na serialização (a onda esperava a
  task mais lenta). Agora cada task concluída libera NA HORA as dependentes prontas; BLOQUEADA
  congela despacho novo; `--waves` continua sendo as ondas do plano (comparável com o histórico).
- **PERFIL-RESUMO cobrado.** 24 de 25 projetos não tinham o destilado da 2.4.0 — no core do
  Taurus (Perfil de 111 KB, ~8,5 subagentes/run) eram ~940 KB de releitura POR EXECUÇÃO. Doctor
  ganhou o check (ausente com Perfil > 20 KB = WARN; resumo mais velho que o Perfil = WARN) e o
  `/deus` (no vault) oferece gerar em lote sob confirmação.
- **PLAYBOOK:** régua de `out_tps` agora é POR GRUPO (criação ~127-139 · execução ~62 · lote ~76,
  medidas limpas de 2026-08) — execução na metade da criação é regime (ferramenta/CLI externo
  rodando sem output de token), não lentidão.



**O front ganhou um autor.** Até aqui o harness tinha um crítico de interface excelente (o
michelangelo, com suas 10 lentes) e nenhum responsável pelo desenho. O Passo 7 da `/prd` mandava
*"conduza o design com a skill UI UX Pro Max"* — e quem conduzia era a **sessão que estava
escrevendo a técnica**, com o contexto lotado de discovery, no meio de outra tarefa. Sem autor
dedicado, o design saía do preset genérico da skill (a "cara de IA") e o michelangelo virava o
único dono do front — mas ele critica, não constrói. Na execução, quem erguia a tela era o
`hefesto`, cujo contrato diz textualmente *"sua virtude não é criatividade, é fidelidade ao
desenho"*: desenho com lacuna de UX vira lacuna implementada com fidelidade.

- **Agente novo — `dedalo` (o autor do front).** Três modos: **(P)** projeta no papel e devolve a
  seção *Frontend / Interface* pronta (**Passo 7.1** da `/prd`, novo); **(O)** constrói as tasks
  `Tipo: front` na `/prd-exec` e no `/dt-exec`, no lugar do hefesto, carregando o mesmo contrato de
  execução **mais** o julgamento de front; **(R)** corrige os 🔴 do michelangelo — porque quem
  desenhou o sistema é quem consegue corrigir sem desmanchá-lo. Modelo `preset`.
  **Fase 0 de ancoragem, inegociável:** antes de qualquer decisão visual ele lê o Perfil, o
  `design-system/MASTER.md`, os tokens CSS reais, os componentes existentes e a maquete aprovada —
  e só consulta a base de design quando **não há precedente**, declarando que inventou. Regra de
  ouro: **reusar vence inventar**; ancoragem não citada a um arquivo real é invenção.
- **Agente novo — `ariadne` (a maquetista).** Mockup HTML **auto-contido** (abre com duplo clique,
  sem build, sem CDN), com variantes que discordam numa decisão de fundo, **andaime de estados**
  (com dados / vazio / carregando / erro) e dados fake plausíveis em PT-BR. Sonnet fixa, sob
  demanda. A maquete aprovada não é descartada: vira entrada do dedalo.
- **Skill nova — `/mockup`.** O loop barato de exploração e refino: gera, abre, *"o que muda?"*,
  itera. No fim, três destinos — vira `/prd`, vira DT, ou é descartada (fica em pasta gitignored).
  `--manter` promove para `docs/mockups/` quando o alvo é mostrar a cliente.
- **Onde eles entram:** entrevista da `/prd` (item 6, só quando há tela nova) → **Passo 6.1.1**
  (maquete) → **Passo 7.1** (projeto do front) → Passo 10 (michelangelo critica, correção volta ao
  dedalo) → `/prd-exec` Fase 1 (ondas mistas hefesto/dedalo) e 2.9 (correção pelo dedalo) →
  `/dt` Fase 4.1 (o "como deveria ser" de um DT de UI) → `/dt-exec` 3.2 e **5.1**.
- **`/dt-exec` ganhou gate de UX (Passo 5.1).** Lacuna real da 2.8.0: um lote inteiro de DTs de
  interface ia para o commit sem nenhum revisor de front, enquanto a `/prd-exec` tinha a Fase 2.9.
  Roda em paralelo ao ciclo 1 do review, para não somar caminho crítico.
- **Campo `Tipo` (`front`/`backend`) nas tasks** (template + Passo 8 da `/prd`): é o que decide o
  executor. Ausente (PRD anterior) → detecção por extensão de arquivo, sem quebrar nada.
- **`ui-ux-pro-max` versionada** em `.claude/skills/ui-ux-pro-max/` (~1,8 MB, 37 arquivos, Python 3
  puro) — na release mais nova disponível (85 estilos, 161 paletas, 74 tipografias, 16 stacks),
  encontrada instalada no `site-allyson-bezerra-2026` durante a varredura e adotada como canônica. Ela vivia só em `~/.claude/skills/`: fora da máquina de quem instalou, o Passo 7 degradava
  **em silêncio**. Agora viaja com o `/deus`, e quem a consome degrada **barulhento** quando ela
  falta. O `gen-adapters.sh` ganhou lista de skills de terceiro (sem stub Codex).
- **Flags novas:** `HARNESS_SKIP_MOCKUP=1` (não oferece maquete) e `HARNESS_SKIP_DEDALO=1` (front
  volta ao comportamento 2.8.0 — útil só para comparar custo).

> **Achado colateral corrigido:** o nome do servidor MCP do browser pane mudou entre versões do
> Claude Code (`mcp__Claude_Preview__*` → `mcp__Claude_Browser__*`), e o michelangelo declarava só
> o nome antigo — evidência visual podia estar degradando sem aviso. Os três agentes de front agora
> declaram **os dois conjuntos** e usam o que existir; `PLATAFORMAS.md` §7 documenta a equivalência.

## 2.8.0 — 2026-07-31

**A aba "Trabalho": a fila de DTs e PRDs visível, com próximo passo.** A 2.7.0 mostrou *como o
harness está configurado*; faltava *o que há para fazer*. Perguntar "quantos DTs estão abertos"
ou "qual PRD eu pego agora" custava um turno de chat e uma releitura dos mesmos arquivos.

- **Aba nova (8ª) na tela**, alimentada por `GET /api/trabalho` — rota **separada e preguiçosa**,
  fora do `/api/state`: lê ~1400 arquivos (347 DTs + as tasks de 108 PRDs no maior projeto) em
  **~100ms**, graças a um `lerInicio()` que pega só o cabeçalho de cada arquivo (ler tudo custava
  1,4s).
- **Painel "Próximo passo"** — heurística explícita e conservadora, nesta ordem: PRD em execução
  com tasks restantes → PRD em Rascunho → lote de DTs pequenos da mesma área (`/dt-exec`, teto de
  6 por lote) → DTs Pendentes de prioridade Alta. Cada card copia o comando pronto. Fila vazia
  diz isso, sem inventar trabalho.
- **Lista de DTs** com contadores por status, filtro de prioridade/área, busca e **troca de
  status inline** — que grava **no arquivo E na linha do INDEX.md na mesma ação**. É justamente
  o passo que se esquece na mão: no `dra-mariana-duarte` os arquivos diziam 49 pendentes e o
  índice, 41. Botão **Reconciliar** (com preview antes de aplicar) corrige o índice a partir dos
  arquivos — o arquivo é a fonte de verdade.
- **Lista de PRDs** com progresso de tasks (X/N) e última execução vinda da telemetria; marca
  como incoerente a PRD `Concluída` que ainda tem task não concluída.
- **Doctor** ganhou os checks da fila reusando o *mesmo* parser
  (`harness-ui.mjs --dump-trabalho <dir> --linhas`) — uma implementação só, não duas divergindo.

Formatos tratados (levantados nos projetos, não presumidos): a pasta de DT é
`prds/debito_tecnico/` na maioria e `prds/dt/` no sagittarius/gsa — **o Perfil já declara qual**,
e é dele que sai; o INDEX de DT é **opcional** (o sagittarius não tem); as colunas do índice
variam (`Área` × `Prioridade`), então o parse é **pelo cabeçalho**; e há DT que existe **só na
linha do índice**, sem arquivo — 12 casos reais, alguns pendentes, que entram na lista marcados
em vez de sumirem.

> **Duas armadilhas de parse corrigidas no caminho:** linhas de índice com `|` dentro de crases
> quebram um `split('|')` ingênuo (split que respeita crase); e a linha-exemplo dentro do
> comentário HTML do template do INDEX criava um DT fantasma em todo projeto recém-portado.

## 2.7.0 — 2026-07-31

**O painel do ecossistema + a biblioteca de convenções da casa.** Duas frentes que atacam o
mesmo problema por lados opostos: o harness cresceu para 9 skills, 9 agentes, 15 hooks e ~40
flags, mas a única superfície visual era um formulário que cobria 2 arquivos e **não gravava
nada** (o dev preenchia, copiava um JSON e o Claude aplicava). E o conhecimento de "como a casa
faz feature X" seguia preso ao projeto onde a feature nasceu.

- **Bridge local (`.claude/harness-ui.mjs`) — arquivo novo.** Servidor Node de arquivo único,
  **sem dependências**: `node .claude/harness-ui.mjs` sobe em `127.0.0.1` e imprime a URL com um
  token por execução. Lê o ecossistema real (`/api/state`) e **grava** (`/api/save`) com
  **edição cirúrgica** — reescreve só a célula do campo alterado, preservando hint, colunas
  extras e todo o resto do arquivo. Backup automático em `.claude/.harness-run/ui-backup/<ts>/`.
  Segurança: bind só em loopback, token obrigatório nas rotas de dados, `Host`/`Origin`
  validados (anti DNS-rebinding), allowlist fixa de escrita, path traversal barrado.
- **A tela (`harness-config.html`) reescrita em 7 abas** — *Visão geral* (estado, diagnóstico,
  doctor sob demanda, telemetria), *Perfil*, *Esforço & custo* (presets + matriz + override por
  agente), *Skills*, *Agentes* (modelo **efetivo** resolvido + alerta de agente invisível),
  *Hooks & flags* (wiring do `settings.json` + `HARNESS_*`) e *Convenções*. Mantém o nome do
  arquivo de propósito (já viajava no sync). **Modo degradado**: sem o bridge, cai no fluxo
  clássico de copiar a config para o Claude — quem não tem Node não perde nada.
- **Convenções da casa (`.claude/convencoes/`) — pasta nova.** Um `.md` por feature com o passo
  a passo **genérico** de portá-la: modelo de dados, contratos, passo a passo, **armadilhas
  reais** (sintoma → causa → correção, com data) e checklist de aceite. Frontmatter padronizado
  vira o card na tela. Semente: **`mfa`**, destilada do Portal TEF (4 migrations, os endpoints
  `auth_mfa_*`, a skill `/ativar-mfa` e as 4 notas de incidente do `.claude/knowledge/` de lá).
- **Skill `/convencao` — nova.** `listar` · `<slug>` · **`portar <slug>`** (cruza a convenção com
  o Perfil do projeto-alvo, produz o briefing, pede aceite e alimenta a `/prd` com o discovery
  da feature pronto — o discovery do *projeto* segue normal) · `nova` (só no mestre) · `status`.
- **Estado de adoção é local:** nova seção *Convenções adotadas* no `PERFIL-PROJETO.md`
  (`adotada` / `parcial` / `nao-adotada` / `nao-se-aplica`). Ausente = tudo `nao-adotada`.
- **`.claude/harness-role` — arquivo novo (1 linha).** Declara a cópia-mestre. Fica **fora** do
  `harness.env` de propósito: o env é espelhado inteiro para as réplicas da equipe, e o papel no
  env faria toda réplica se declarar mestre — convenção criada nela se perderia no próximo
  espelhamento. O `harness-replica-sync.sh` exclui o arquivo; ausente = `projeto`.
- **Propagação:** `CORE_DIRS` += `.claude/convencoes`, `CORE_FILES` += `.claude/harness-ui.mjs`.
  Novos checks no doctor (bridge presente, `node` no PATH, convenções, seção de adoção no
  Perfil, papel do repo).

> **Bug corrigido de quebra:** o parser de Perfil precisou tratar CRLF explicitamente — em JS o
> `.` não casa `\r` (é line terminator), então todo regex ancorado em `$` falha silenciosamente
> num arquivo CRLF, que é o caso dos Perfis em Windows. O EOL original é preservado na escrita
> (senão o git veria o arquivo inteiro como modificado).

## 2.6.0 — 2026-07-30

**Manual vivo do software (`/manual`).** O conhecimento das features morava nas PRDs
históricas (log, não manual) e em KBs específicas de um projeto. Agora todo projeto tem
`docs/manual/` — documentação **por módulo** (delta sobre estado, nunca log), com **duas
faces**: `usuario/` (como usar, com as regras de tom validadas no `/kb-tutorial` do Portal:
sem jargão, sem explicar permissão/mecanismo, só o efeito visível) e `dev/` (mapa da feature:
arquivos reais, contratos, decisões, armadilhas — e fonte para o RAG). Desenho de custo:

- **A `/prd-exec` NÃO gera manual** — a cauda só appenda 1 linha em `docs/manual/_fila.md`
  (custo ~zero; opção na Entrevista única: FILA default / AGORA / PULAR). O `/dt-exec` idem,
  quando o lote muda comportamento visível.
- **A `/manual` absorve a fila em LOTE** (1 subagente Sonnet por PRD, em paralelo) — gatilho
  natural: a revisão quinzenal (dias 1/15). Screenshots recortados opcionais quando o preview
  está de pé; nunca bloqueante.
- **Adapter por projeto** (Perfil → "Manual vivo → mecanismo"): `arquivo` (default),
  `kb-portal` (delega a face usuário à skill própria, ex. `/kb-tutorial` — nada é jogado
  fora) ou `seed` (formato TEMPLATE-TUTORIAL/META do projeto). Campo ausente = `arquivo`.
- Princípios herdados do Portal: artefato versionado que viaja pelo deploy; nunca INSERT em
  banco; nunca commita; gate humano de publicação onde houver.

## 2.5.0 — 2026-07-30

**Continuação da 2.4.0, mesma motivação (velocidade), quatro frentes novas:**

- **Ciclos de review: base 2 + escalada (+1 se convergindo).** Preset agora resolve a BASE
  (economico 1 · equilibrado 2 · maximo 3; antes 2/3/4) para Codex review, beholder e
  michelangelo; ausente = 2. Ao esgotar a base, +1 ciclo automático **somente** se o último
  ciclo corrigiu bloqueante e ainda resta 🔴 (convergindo); estagnou → gate direto. Número
  explícito no Perfil = limite duro sem escalada; `0` = sem limite. Motivo: nos dados de
  35 sessões, ciclos 3-4 quase só caçavam 🟡 (~16min/ciclo de sherlock). `/dt-exec` usa a
  base −1 (mín 1), sem escalada.
- **Fase 2.9 em paralelo com a Fase 2 (`/prd-exec`).** O michelangelo (auditoria da tela
  construída) é disparado na MESMA mensagem do ciclo 1 do review — a tela já existe
  (acceptance 1.4.2 passou) e UX não depende de review de código. A triagem (2.9.3) continua
  após a Fase 2 fechar; correção da Fase 2 que tocou UI auditada → revalidação pontual.
  Corta 6-20min de caminho crítico nas PRDs com UI.
- **`/harness-report` (skill nova).** Relatório comparativo da telemetria
  (`prds/_metrics/harness-runs.jsonl`): mediana/p90 de duração ativa, tokens, ciclos, espera
  humana e denials por tipo de execução; `--all` varre os projetos irmãos; réguas de
  regressão (🔴/🟠) + tendência vs janela anterior. Rodar mensalmente do vault — teria pego a
  degradação de julho semanas antes.
- **Cache de discovery por módulo (`/prd` Passo 2 / 6.1).** `prds/_discovery-cache/<modulo>.md`
  guarda o mapa reutilizável (schema + código + precedentes) com `commit` e `paths`;
  invalidação por `git log <commit>..HEAD -- <paths>` + 30 dias. Cache válido → pula os
  Agents B/C (e D); A (DTs), tony-stark e atlas rodam SEMPRE (dependem do escopo novo).
  PRDs sequenciais no mesmo módulo pulam metade do discovery.

## 2.4.0 — 2026-07-30

**A versão da velocidade.** Mineração de 35 sessões reais (29/07) decompôs onde o tempo das
PRDs de 2-3h realmente ia: **hefesto 17h acumuladas** (os 4 maiores spawns, de 51-85 min, eram
acceptance gates cujo relatório era descartado), **sherlock 6,6h** (até 4 ciclos por PRD),
**~5h parado em AskUserQuestion no meio do fluxo** (37 paradas × 8 min), **14,4M tokens de
output** (código escrito 2× — no documento e no repo) e **2,2 bi de tokens de cache read**
(Perfil de 22 KB relido por ~30 subagentes por ciclo). Sete mudanças atacam isso:

- **Acceptance sem hefesto (`/prd-exec` 1.3/1.4.2).** A task de acceptance é executada
  DIRETAMENTE pela sessão pai, uma vez só — o hefesto de 50-85 min rodava a suite e o
  anti-alucinação mandava a pai re-rodar tudo de novo (verificação em dose tripla).
- **Roadmap HTML vira OPT-IN (Fase 4).** `Skip HTML Roadmap` ausente agora = pula a 4.2
  (era a peça mais cara da cauda de ~40 min). Só gera com `Nao` explícito na PRD.
  Template da PRD atualizado (default `Sim`).
- **Regra de refino: ciclos 2+ em Sonnet.** sherlock, beholder e michelangelo usam o modelo
  do preset SÓ no ciclo 1; ciclos seguintes (conferir correções pontuais) rodam SEMPRE em
  Sonnet — e releem SÓ o relatório anterior + arquivos alterados, não a PRD inteira.
  Reasoning do Codex idem (`high` no ciclo 1 → `medium` nos seguintes). Opt-out no Perfil.
- **ENTREVISTA ÚNICA (`/prd` 0.1, `/prd-exec` 0.3, `/dt-exec` 1.4).** Todas as decisões
  humanas (escopo, split, políticas de DT/inovação, tolerâncias dos gates 2.7/2.9, pendências
  de sync/doctor) são colhidas numa ÚNICA AskUserQuestion no início, com o usuário presente;
  o fluxo roda autônomo até o fim. `/prd` ganhou modo **TURBO (default)**: um único aceite no
  Passo 11 (pacote completo); modo CLASSICO (parada no 6.2) segue disponível na entrevista.
- **`PERFIL-RESUMO.md` (novo).** Destilado ~2 KB do Perfil com só os fatos operativos;
  TODOS os subagentes (hefesto, sherlock, beholder, michelangelo, atlas, peter-quill) o leem
  no lugar do Perfil de 22 KB (fallback: Perfil completo). A última task de toda PRD mantém
  o resumo em sincronia quando o Perfil muda.
- **Tasks por CONTRATO (`/prd` Passos 7-8 + TEMPLATE-TASK).** Código completo SÓ nos
  componentes de risco (migration, SQL, regex, integração, algoritmo); o rotineiro é
  especificado por contrato (assinatura/regras/critérios) referenciando o Componente N da
  técnica — o código nasce UMA vez. Contrato do hefesto atualizado.
- **Hooks mais baratos.** Os 4 hooks de RAG ganham **early-exit antes do `source`** (com RAG
  desligado, `rag-inject.sh` pagava globs de filesystem procurando PHP/node em TODO
  UserPromptSubmit — síncrono). `external-review.sh` ganha **watchdog portável**: sem GNU
  timeout (Git Bash/Windows), o revisor externo rodava SEM teto nenhum; agora um watchdog em
  shell mata em `HARNESS_EXTERNAL_REVIEW_TIMEOUT`s.

**Gates que continuam parando SEMPRE** (independente da entrevista): safe-mode reprovado,
falha não-recuperável de task, >10 bloqueantes no ciclo 1 e 🔴 sem decisão prévia aplicável.
Nenhuma rede de segurança foi removida — o corte é de REPETIÇÃO e espera, não de verificação.

## 2.3.0 — 2026-07-24

**Três agentes do harness ficaram invisíveis por 4 dias e ninguém foi avisado.** Em 19/07 os arquivos `hefesto.md`, `michelangelo.md` e `peter-quill.md` foram regravados com CRLF; o parser de frontmatter do host descarta **em silêncio** o agente cujo arquivo combina **CRLF + `: ` (dois-pontos+espaço) no valor da description** (LF com `: ` funciona; CRLF sem `: ` funciona; só a combinação mata — confirmado empiricamente com `claude -p`). Resultado: de 21 a 24/07, toda `/prd-exec` caiu de hefesto (Sonnet, contrato fixo) para `general-purpose` (modelo da sessão, sem contrato), o gate de UX rodou sem o michelangelo e o discovery sem o peter-quill — execuções a 2-3h e mais ciclos de review, sem um único aviso. A telemetria do dia também mostrou dois custos estruturais: ~40 min de **cauda de fechamento serial** por execução e ~2h de **gates fixos num lote de 2 DTs** (LOTE-002). Esta versão ataca as quatro frentes:

- **`harness-doctor.sh` — check de agente invisível (núcleo E `--autonomia`).** Helper
  `agent_visibility()`: CRLF + `: ` na description = **[FALTA]** com o conserto na mensagem
  (`dos2unix`); CRLF sem gatilho = **[WARN]** (risco latente — o próximo `: ` mata). O pre-flight
  da `/prd-exec` (Passo 0.2) agora acusa o problema ANTES de decolar. Também cobra o
  `.gitattributes` da pasta de agentes (sem ele, `core.autocrlf=true` re-CRLFa tudo no próximo
  checkout e o bug volta).
- **`.claude/agents/.gitattributes` (novo, viaja no sync)** — `*.md text eol=lf`; entra em
  `CORE_FILES` do `harness-sync.sh`.
- **Fallback de agente BARULHENTO (`/prd`, `/prd-exec`, `/dt-exec`).** `Agent type not found` →
  não re-tentar o tipo no run; avisar o usuário na hora; usar o substituto **com o contrato do
  agente colado no prompt** (o que não pode se perder é o contrato, não o nome); registrar
  `fallback: <nome> → <substituto>` no Output/telemetria.
- **`/prd-exec` — cauda de fechamento em PARALELO (Fases 3-5).** O roadmap HTML (4.2) vai para um
  subagente enquanto a sessão pai redige commit (3), roadmap MD (4.1) e DTs (5). Nada na cauda
  depende de nada; medição real: ~40 min de fila desnecessária.
- **`/dt-exec` — regime de MINI-LOTE (≤2 itens).** 1 ciclo de review (independente do Perfil),
  revisor externo com teto de **300s** (`HARNESS_EXTERNAL_REVIEW_TIMEOUT=300` inline) e beholder
  da mini-spec em modo enxuto (só 🔴/🟠, 1 linha cada). Proporcional corta repetição, nunca rede de
  segurança: safe-mode e review continuam obrigatórios.
- **`external-review.sh` — `HARNESS_EXTERNAL_REVIEW_TIMEOUT`** (default 600s, documentada no
  `harness.env`): o teto do revisor externo deixa de ser hardcoded.
- **`/prd` — teto anti-degeneração nos gates (Passo 10).** Mesmo com limite `0`: 5º ciclo de
  qualquer gate → 10.3 (humano). Anti-churn: mesma task reescrita em 2 ciclos seguidos e
  reapontada → 10.3 no ato (é disputa de critério, não falta de ciclo). Caso real: PRD-106 com 6
  ciclos e a TASK-003 reescrita 4x (~7h de criação).

## 2.2.0 — 2026-07-21

**O fechamento documental era o único passo sem gate — e foi exatamente ele que falhou.** Num `/dt-exec` real (LOTE-001), o INDEX de DTs saiu correto e **2 dos 3 arquivos de DT ficaram `Pendente`** — commitados e pushados assim. O terceiro estava certo e mascarou o drift numa conferência superficial; só apareceu porque o operador desconfiou e pediu auditoria. A instrução das "duas pontas" **estava lá e foi lida**: o que faltava era prova. As skills já aplicavam a régua certa na verificação técnica (Passo 4 da `/dt-exec`: "cole a saída bruta") e no review (não-negociável) — o fechamento ficou como o elo sem gate.

- **`/dt-exec` — Passo 7.7, gate de fechamento documental (não-negociável).** Depois de escrever
  os status, a skill roda um `grep` sobre **cada DT do lote** (arquivo + linha do INDEX), sobre os
  **ejetados/bloqueados** (o recibo `LOTE-NNN` nas Observações) e sobre o **documento do lote**, e
  **cola a saída bruta**. Critério explícito de reprovação: qualquer DT que não apareça com
  `Resolvido (LOTE-NNN)` nas duas pontas ⇒ **o lote não está concluído** — corrigir e rodar de
  novo, sem apresentar o Output Esperado, sem fechar telemetria e sem liberar o commit (os
  arquivos de fechamento viajam nos commits do Passo 6, então commitar antes do gate é o que
  **congela o drift no histórico**).
- **`/dt-exec` — Passo 7.5, o lote deixa de nascer órfão.** A skill mandava criar
  `prds/debito_tecnico/lotes/LOTE-NNN-*.md` e marcá-lo `Concluido`, mas **nunca** registrá-lo no
  índice. Resultado: o INDEX exibia `Resolvido (LOTE-001)` e nada ali dizia o que era LOTE-001, o
  que agrupou, o que foi ejetado, nem onde estava o documento — a rastreabilidade só funcionava de
  lote → DTs, e o lado que as pessoas realmente consultam (índice → lote) não existia. Isso
  esvaziava o **registro anti-escopo** (o que foi ejetado e por quê), que é justamente o que evita
  reavaliar o mesmo DT em todo lote futuro: ele morava num arquivo que só achava quem já sabia da
  pasta. Agora é item obrigatório: linha na tabela **"Lotes de DT"** (data, área, DTs resolvidos,
  o que ficou fora, link relativo) **+** a legenda do status `Resolvido (LOTE-NNN)`.
- **`prds/_templates/TEMPLATE-INDEX-DT.md` (novo) — a correção precisava viajar.** O
  `prds/debito_tecnico/INDEX.md` da cópia-mestre é só esqueleto: **não está em `CORE_DIRS`**, logo
  o `harness-sync.sh` nunca o propaga (e nem deve — é conteúdo real do projeto). Mudar só ele não
  chegaria a nenhum dos ~60 repos. O modelo canônico do índice virou um **template**, que viaja no
  núcleo via `prds/_templates/`, já com legenda de status e seção de lotes. Índices legados não
  precisam de migração manual: a `/dt-exec` cria as duas seções ao fechar o primeiro lote.
- **`/prd-exec` — Fase 1.4.6 com o mesmo gate.** A verificação de DTs absorvidos tinha a mesma
  classe de falha ("Confirmar que o INDEX foi atualizado" + "confirmar que o status no arquivo
  também foi" — sem prova). Agora roda o `grep` das duas pontas sobre os DTs do campo "Expande" e
  cola a saída, com bloqueio antes da Fase 2. No Output Esperado, a linha `INDEX.md atualizado:
  OK` foi substituída pela **saída bruta colada** — era literalmente a afirmação que já saiu
  errada. PRD sem DT absorvido registra "n/a" (não se inventa gate).
- **`TEMPLATE-DT.md` e `/dt` alinhados.** O template ganhou o passo de prova no "Ao concluir" (é
  a fonte canônica da regra das duas pontas, citada pelas duas skills). A `/dt` deixou de embutir
  um esqueleto de índice mais curto e passa a criar o INDEX a partir do template novo — índice sem
  legenda gera status que ninguém decifra depois.
- **Regra inviolável nova na `/dt-exec` (nº 7):** *estado persistente em mais de um arquivo exige
  gate executável*. Escrever em N lugares e declarar "atualizado" é a forma mais barata de mentir
  sem querer; onde a skill espalha estado, ela roda um comando e cola a saída.

## 2.1.1 — 2026-07-20

**Correção de dois falsos positivos que só apareciam em Windows/Linux — o harness em si não tinha regressão.** Ambos encontrados rodando a suíte de aceitação da 2.1.0 num checkout Windows (Git Bash), onde ela deu 2 FAIL contra os 0 FAIL do ambiente de origem (macOS). Nenhum dos dois afetava código de produção.

- **`gen-adapters.sh --check` acusava DRIFT nos 6 adapters em TODA máquina Windows.** Com
  `core.autocrlf=true` (e sem `.gitattributes`) o git materializa os `.agents/skills/*/SKILL.md`
  com **CRLF**, enquanto o stub é gerado com LF — o `cmp -s` byte-a-byte via diferença onde o
  conteúdo era idêntico. Agora a comparação normaliza o `\r` (`tr -d '\r'`) antes de comparar.
  **Continua detectando drift real** (validado adulterando um adapter: exit 1). Sem o fix, o
  `harness-doctor.sh` passaria a gritar DRIFT falso em todo projeto Windows no dia em que o
  target **codex** fosse ligado (com `HARNESS_TARGETS='claude'` o check nem roda — por isso o
  doctor ficava limpo e só a suíte pegava).
- **`t09-hooks-payloads` era FLAKY (~1 em 3) por um BSD-ism no próprio teste.** O idiom
  `stat -f %m || stat -c %Y` assume que `-f` é *format* (BSD/macOS); no **GNU stat** `-f` é
  *filesystem* e **não falha** — imprime info do FS, incluindo **blocos livres**, que mudam
  entre as duas leituras. O teste comparava essas strings e acusava "throttle não segurou" com
  o mtime intacto. Ordem invertida (GNU primeiro, BSD como fallback) + comentário explicando,
  para não regredir. O throttle do `rag-capture-session.sh` **sempre esteve correto** —
  verificado com instrumentação: `mtime` idêntico e `find -mmin` acertando o alvo.
- Suíte de aceitação no Windows: **15 PASS · 0 FAIL · 2 SKIP** (era 13/2/2); t09 estável em 8
  rodadas seguidas. Os 2 SKIP são ambientais (`node_modules` ausente — `npm install` habilita).
- **Carimbo do `harness-config.html` alinhado (3 pontos), incluindo um defasado desde a 2.0.0:**
  o `genClaudeBlock()` gerava a config com `version:'2.0.0'` — a tela `/harness-config` carimbava
  versão errada em quem a usasse para configurar um projeto. O check do doctor (item 4) só olha
  se a versão atual aparece **em algum lugar** do arquivo, então as outras duas ocorrências
  mascaravam essa. Agora os três (`harness-config-data`, `genEnv()`, `genClaudeBlock()`) citam a
  versão corrente.

## 2.1.0 — 2026-07-19

**Skill nova `/dt-exec`: o degrau que faltava entre `/dt` e `/prd`.** Havia dois extremos e nada no meio — a `/dt` registra e para; a `/prd` abre a artilharia inteira (discovery paralelo com 6 agentes, duas fases, PRD produto + técnica + tasks + gates em ciclos + roadmap). Resultado: DT pequeno ou virava PRD cara demais, ou apodrecia no INDEX. A `/dt-exec` agrupa **DTs pequenos já registrados** num LOTE coeso, escreve **uma** mini-spec e executa de ponta a ponta.

- **Cerimônia proporcional — o que corta:** discovery paralelo, as duas fases, PRD produto/técnica
  separadas, arquivos de task individuais, roadmap HTML. **O que mantém SEMPRE:** pre-flight de
  **safe-mode** (mudança pequena dispara integração real igual à grande) e **review dupla-cega**
  (com o limite de ciclos do Perfil **menos 1**, mínimo 1). **Condicionais:** beholder só se algum
  item tocar auth/integração/schema; michelangelo só se tocar UI.
- **Critérios de EJEÇÃO (a régua que protege a skill de virar atalho):** item que exige
  migration/mudança de schema, toca integração com efeito colateral, altera contrato de
  API/payload, tem decisão de design em aberto, ou é Grande (>4h) **sai do lote e vira PRD**. Item
  que depende de outro DT/PRD fica **bloqueado** (volta num lote futuro). O motivo é registrado no
  documento do lote **e** nas "Observações" do próprio DT — evita reavaliar a mesma coisa todo mês.
- **Seleção do lote:** lê `prds/debito_tecnico/INDEX.md` para os candidatos e **abre cada DT** para
  os sinais de agrupamento — o INDEX não traz esforço nem arquivos. Coesão pelo campo "Arquivos e
  tabelas relacionados" (blast radius): lote do mesmo módulo = um review, um ciclo de teste.
  `Estimativa de esforço` é opcional no template — quando falta, a skill **infere e declara como
  inferida** (nunca apresenta palpite como dado do DT).
- **Gate humano único e barato:** a aprovação do lote acontece depois de apenas ler o índice
  (na `/prd`, o aceite vem depois do discovery + PRD de produto). É onde o escopo se corrige, antes
  de qualquer trabalho. `--dry-run` para na proposta.
- **Execução SEQUENCIAL por default — inversão proposital em relação à `/prd-exec`:** lá as tasks
  são *desenhadas* para serem independentes (ondas paralelas de hefestos); aqui o lote é agrupado
  *por coesão*, então os itens tendem a tocar os MESMOS arquivos. Paralelo só quando os conjuntos
  de arquivos-alvo forem comprovadamente disjuntos.
- **Uma mensagem de commit POR ITEM** (a skill nunca commita): revert continua cirúrgico — item que
  der problema em produção se reverte sozinho, sem derrubar o lote.
- **Rastreabilidade bidirecional:** cada DT vira `Resolvido (LOTE-NNN)` no arquivo **e** no INDEX,
  no mesmo commit da correção (regra do `TEMPLATE-DT.md`, agora generalizado para aceitar
  `LOTE-NNN` além de `PRD-NNN`). Documentos em `prds/debito_tecnico/lotes/LOTE-NNN-<slug>.md`.
- **Nasce multi-AI:** frontmatter `name`/`description` e stub `.agents/skills/dt-exec/` gerado pelo
  `gen-adapters.sh` — descoberta automática nas duas plataformas, sem passo manual. Doctor e suíte
  de aceitação passam a cobrar 6 skills.
- **Sem campo novo no Perfil** (decisão consciente): limites saem do preset ativo (itens por lote:
  economico 3 · equilibrado 5 · maximo 5), com `--max-itens=N` como override pontual. O harness já
  tem dials demais; adicionamos depois se doer.

## 2.0.0 — 2026-07-17

**O harness virou multi-AI: Claude Code + Codex CLI, com um corpo canônico só.** A fonte de verdade continua sendo `.claude/` (skills em `.claude/skills/*/SKILL.md`, agentes em `.claude/agents/*.md`); o que a 2.0.0 adiciona é a **superfície Codex** por cima dela — adapters finos gerados que apontam para o canônico, nunca uma segunda cópia dos corpos. A regra que atravessa a versão inteira: **nunca fingir suporte** — capacidade sem equivalente na outra plataforma degrada explícito (e fica documentada como N/A), nunca em silêncio. O documento canônico de equivalências (superfícies, vocabulário de ferramentas, eventos de hook, presets→effort, permissões, review, RAG, telemetria) é o novo **`.claude/PLATAFORMAS.md`**. Quem fica só no Claude não muda nada — retrocompatibilidade total.

- **Adapters finos gerados (nunca editados à mão):** stubs `.agents/skills/<nome>/SKILL.md`
  gerados por `bash .claude/scripts/gen-adapters.sh` (apontam o canônico); agentes
  `.codex/agents/<nome>.toml` cujo `developer_instructions` manda ler o `.md` canônico —
  campo `model` **omitido de propósito** (herda o modelo da sessão; slug de modelo muda
  rápido demais para hardcodar), o dial fino é `model_reasoning_effort`; `AGENTS.md` na
  raiz e `.codex/hooks.json` carregam o marcador **`harness:managed`** (o sync só
  sobrescreve o que tem o marcador).
- **`harness-sync.sh` multi-target:** `--target claude|codex|all` (ausente = lê
  `HARNESS_TARGETS` do `harness.env` do alvo; default `claude`), novo `--dry-run`
  (mostra o que o apply faria sem escrever), **backup** do que vai sobrescrever em
  `.claude/.harness-run/sync-backup/<timestamp>/`, arquivos **guardados** (`AGENTS.md`/
  `.codex/hooks.json` sem o marcador) preservados com linha `CONFLITO|guardado|...`,
  `HARNESS_TARGETS` registrado no env do alvo após apply codex/all e `harness.env`
  mínimo criado quando ausente.
- **`harness-doctor.sh` multi-AI:** matriz de checks por superfície instalada
  (`HARNESS_TARGETS` — adapters presentes/em paridade, trust do projeto no Codex);
  novo **`--gen-rules`** (converte a tabela "Execução autônoma" do Perfil em
  `prefix_rule()` Starlark p/ revisar e salvar em `.codex/rules/` — experimental);
  heurística de placeholders melhorada (só linhas de tabela/🔧 contam — menos falso
  positivo em prosa); check de **divergência de interpretador** (versão PHP do Perfil
  vs binário do lint vs SO).
- **Review dupla-cega consciente do host:** novo helper `.claude/hooks/external-review.sh`
  (o `codex-review.sh` virou **shim** compatível) + `HARNESS_HOST` e
  `HARNESS_EXTERNAL_REVIEWER` (`auto|codex-cli|claude-cli|none`): no host Claude o
  revisor externo é o Codex CLI; no host Codex, o `claude -p` sobre o diff. Sem CLI
  externo disponível = **modo solo explícito** — registrado como solo, nunca descrito
  como dupla-cega. Guard de reentrância `HARNESS_IN_EXTERNAL_REVIEW=1`: hooks de
  RAG/telemetria saem no-op dentro do subprocesso do revisor.
- **RAG multi-provider:** `HARNESS_RAG_LLM_PROVIDER` aceita
  `claude-cli|codex-cli|anthropic|mock|disabled`. No host Codex a captura de sessão é
  via **`Stop` com throttle** (`HARNESS_RAG_STOP_THROTTLE_MIN`, default 30 min — `Stop`
  dispara a cada turno) e a por-agente via `SubagentStop`; **extrator genérico de
  transcript** (formato não reconhecido cai no gate de tamanho e vira no-op — nunca
  inventa conteúdo). Privacidade documentada: embeddings seguem 100% locais; o resumo
  envia o transcript ao provider configurado (Anthropic OU OpenAI).
- **Telemetria com campo `platform`:** cada linha do `harness-runs.jsonl` grava
  `platform` (`claude`|`codex`); no Codex, tokens/gaps são **best-effort** sobre
  `~/.codex/sessions` — sem parse confiável os campos saem **`n/d`** honesto, nunca
  inventados. Espera humana/classificador seguem sinais do host Claude.
- **Hooks no Codex (`.codex/hooks.json`):** wiring apenas nos eventos que existem lá
  (sem `async` — tudo síncrono; sem `SessionEnd`/`Notification`/`PermissionDenied`/
  `PostToolUseFailure`). **Trust por hash:** o arquivo só carrega com o projeto
  *trusted* e cada atualização de hook **re-pende a aprovação** via `/hooks` — decisão
  humana por máquina (o doctor confere).
- **Anti-espiral, `denied.sh` e `notify.sh` documentados como Claude-only por design:**
  não há classificador remoto (nem os eventos correspondentes) no Codex — a aprovação
  lá é determinística (sandbox + `approval_policy` + rules); as guardas ficam dormentes
  e a tabela do §4 do `PLATAFORMAS.md` registra cada linha (não é gap, é ausência de
  contraparte).
- **Skills canônicas ganharam frontmatter `name`/`description`** (padrão
  agentskills.io) — exigido pelos stubs `.agents/` e inócuo no Claude.
- **Correção de carimbo:** o cabeçalho do README dizia "Versão 1.8.0" desde a 1.9.0
  (carimbo 4 esquecido) — corrigido para 2.0.0. O release ganhou um **5º carimbo**:
  rodar `gen-adapters.sh` e commitar os stubs regenerados junto.
- **Testes de aceitação em `tests/acceptance/`** (fixtures) cobrindo gen-adapters,
  sync multi-target, host-detect, external-review e o extrator de transcript.
- ⚠️ **Limitação conhecida:** a tela `/harness-config` ainda NÃO expõe os campos novos
  (`HARNESS_TARGETS`, `HARNESS_HOST`, `HARNESS_EXTERNAL_REVIEWER`) — edite o
  `harness.env` direto (mesmo padrão das 1.8.0/1.9.0).

## 1.9.0 — 2026-07-09

**Resiliência à indisponibilidade do classificador de permissão do auto mode.** Resposta a um incidente real (exec da PRD-007 do aec-backend, 09/07/2026): o classificador remoto do auto mode ficou indisponível → **fail-closed** em todo comando sem regra determinística (16+ negações "temporarily unavailable", até `php -v`; 3 negações de **Agent** em seguida) → a sessão espiralou re-tentando e re-agendando, seguindo o "wait briefly and try again" da própria mensagem de negação. Contexto agravante: 3+ sessões autônomas overnight em paralelo. Fato-chave verificado na doc oficial: **em auto mode, regras LARGAS de execução arbitrária (`Bash(php:*)`, interpretador wildcarded) são SUSPENSAS** e caem no classificador mesmo assim — só regra **ESTREITA e orientada a tarefa** resolve antes dele e sobrevive ao outage (isso **corrige o conselho A6 da 1.8.0**).

- **Allowlist ESTREITA versionada no `settings.json` do projeto:** nova seção do Perfil
  ("Execução autônoma — comandos conhecidos-seguros", template + 3 perfis com sugestões da
  stack) + novo modo **`harness-doctor.sh --gen-allowlist`** que converte a tabela do Perfil
  num bloco `permissions.allow` pronto p/ revisar e colar. Default: vazio (nada pré-liberado).
  Banco de dados só via wrapper versionado do banco de TESTE. O Passo 0.2 da `/prd-exec`
  oferece a geração na decolagem (último momento com humano presente).
- **Novo hook `denied.sh` (PermissionDenied, sem matcher — pega Bash E Agent):** a cada
  negação do classificador, loga `{"type":"denied"}` no `permission-waits.jsonl`, alerta via
  `HARNESS_NOTIFY_CMD` com **throttle** (1º imediato, depois máx 1/5min) e injeta
  `additionalContext` curto com o protocolo. **Nunca** devolve `retry:true` (re-tentar
  automático é a espiral). Bypass: `HARNESS_SKIP_DENIED=1`.
- **Anti-espiral determinístico no `guard-bash.sh` (GUARDA 2):** contador por hash do comando
  em `.claude/.harness-run/exec-attempts/` (PreToolUse incrementa; `--post` limpa quando o
  comando EXECUTOU — wired em `PostToolUse` **e** `PostToolUseFailure`, senão teste vermelho
  re-rodado viraria falso positivo). Na 3ª tentativa sem execução (janela 15min): nega exit 2
  com mensagem DEFINITIVA (parar a fase autônoma, Status "Bloqueada", opções de destrave),
  alerta via notify.sh (`[spiral]` → `type:"spiral"`) e loga p/ telemetria. **Fusível:** só
  arma com o wiring `--post` ×2 no settings.json — sem ele fica dormente (doctor avisa).
  Config: `HARNESS_GUARD_SPIRAL`/`_N`/`_WINDOW_MIN`; bypass `HARNESS_SKIP_GUARD_SPIRAL=1`.
- **Protocolo de indisponibilidade nas skills/agentes:** `/prd-exec` (nova subseção nas Regras
  de Execução + Tratamento de Erros + nota "use Bash, não PowerShell, em execução autônoma"),
  `hefesto` (regra 11), `sherlock` (nota). Distinguir negação por **INFRA** (assinatura
  "temporarily unavailable"/"cannot determine the safety" — máx 1-2 retentativas intercaladas
  com read-only, reformular p/ allowlist, senão PARAR com Status "Bloqueada — classificador de
  permissão indisponível") de negação por **JUÍZO** (nunca re-tentar). NUNCA
  ScheduleWakeup/sleep p/ "esperar o classificador" (também são classificados).
- **Regra de paralelismo:** máx **2 execuções autônomas simultâneas** por máquina
  (`HARNESS_MAX_ACTIVE_SESSIONS='2'`); check best-effort no doctor `--autonomia` (transcripts
  com mtime <10min; WARN acima do limite; nunca bloqueia).
- **Doctor `--autonomia` ampliado:** confere wiring `--post` ×2 (anti-espiral armado), wiring
  `denied.sh`, allowlist estreita no settings.json (WARN se só houver regra larga de
  interpretador — citando a suspensão em auto mode) e contagem de sessões ativas.
- **Telemetria:** `harness-runs.jsonl` ganha `classifier_denials` e `spiral_blocks`; o
  `harness-metrics.mjs` conta os types `denied`/`spiral` SEM somá-los como espera humana
  (senão outage inflaria `wait_human_min`); o resumo do `stop` imprime linha de aviso quando
  >0. `PLAYBOOK-TELEMETRIA.md` ganha a seção **"Classificador de permissão indisponível —
  diagnóstico e destrave rápido"** (assinatura, o que segue funcionando, destrave: Shift+Tab,
  `/permissions` → Recently denied + tecla `r`, `--gen-allowlist`, ≤2 sessões, aguardar).
- **README — seção Permissões reescrita:** baseline = allowlist estreita versionada no
  settings.json do projeto; prefixos largos do `settings.local.json` continuam úteis SÓ no
  modo assistido (em auto mode são suspensos); nota de workspace trust (o `permissions.allow`
  do projeto só vale após aceitar o diálogo de confiança, uma vez, interativo).
- ⚠️ **Limitação conhecida:** a tela `/harness-config` ainda NÃO expõe os campos novos
  (`HARNESS_GUARD_SPIRAL*`, `HARNESS_MAX_ACTIVE_SESSIONS`) — edite o `harness.env` direto
  (mesmo padrão da 1.8.0).

## 1.8.0 — 2026-07-08

**Blindagem contra "execução autônoma pendurada" + telemetria honesta.** Resposta direta a um incidente real: numa execução de PRD com 12 tasks, a telemetria registrou 348 min, mas 73% (4h15) era UM comando Bash de subagent pendurado num prompt de permissão — o subagent criou `cat > /tmp_check.php` (no Git Bash/Windows, `/foo` resolve para `C:\Program Files\Git\`, fora do projeto → o sandbox pediu aprovação e ninguém estava na tela). O sintoma na telemetria: `out_tps` de 17 tok/s (saudável: 100–270).

- **Regra de arquivos temporários (a causa raiz):** temporários vão SEMPRE no scratchpad da
  sessão ou em `.claude/.harness-run/tmp/` — nunca `/tmp`, nunca caminho de raiz (`/arquivo`).
  Embutida no contrato do `hefesto` (regra 9), nas regras do `sherlock`, nas Regras de Execução
  da `/prd-exec` e como **regra fixa** na seção "Armadilhas do projeto" do Perfil (template +
  3 perfis prontos).
- **Novo hook `guard-bash.sh` (PreToolUse Bash, BLOQUEANTE):** enforcement determinístico da
  regra acima — nega (exit 2) redirecionamento/tee para caminho de raiz fora do projeto e
  devolve a instrução ao Claude, que se autocorrige na hora sem esperar humano. A regra em
  prompt ensina; o hook garante. Config: `HARNESS_GUARD_BASH` (default ligado); bypass
  `HARNESS_SKIP_GUARD_BASH=1`.
- **Novo hook `notify.sh` (Notification):** quando um pedido de permissão fica aguardando o
  humano (ou o Claude fica idle), (1) **loga a espera** em
  `.claude/.harness-run/permission-waits.jsonl` e (2) dispara alerta local via
  `HARNESS_NOTIFY_CMD` (som/toast/webhook — exemplos no `harness.env`). Sem config = só loga
  (no-op seguro). Execução autônoma nunca mais pendura em silêncio.
- **Telemetria honesta:** o `harness-runs.jsonl` ganha `ts_start`, `out_tps`
  (tokens_output/elapsed_s), `max_gap_min` (maior gap do transcript), `wait_human_min` +
  `permission_prompts` (espera humana **medida** cruzando o log do notify.sh com o transcript),
  `elapsed_active_s` (duração descontada) e `waves`. O `stop` imprime **aviso automático de
  provável espera humana** (`out_tps < 30` com duração alta, ou espera medida > 5 min) — regra
  de leitura: espera humana NÃO é lentidão de modelo; não ajustar preset por causa dela.
- **Allowlist de PREFIXO orientada ao Perfil:** prática documentada (ONBOARDING A6) — os CLIs
  da stack (interpretador, cliente de banco, test runner) ganham entradas de prefixo no
  `settings.local.json`, revisadas uma vez, em vez de dezenas de "always allow" exatos. O
  **doctor** confere e avisa (nunca bloqueia).
- **`harness-doctor.sh --autonomia` (modo focado):** roda só os checks de execução autônoma
  (hooks presentes + wired no settings.json, `HARNESS_NOTIFY_CMD`, allowlist de prefixo).
  Exit 0 = pronto p/ rodar não-assistido; exit 3 = há avisos. A varredura completa também
  ganhou a seção.
- **`/prd-exec` — Passo 0.2 (pre-flight de autonomia):** roda o doctor `--autonomia` ANTES de
  decolar; com avisos, mostra ao usuário ("esta execução pode pendurar em prompt sem ninguém
  ver") e devolve a decisão — é o último ponto garantido com humano na tela.
- **`/prd-exec` — paralelismo por ondas é o DEFAULT explícito (Fase 1.3):** as tasks são
  agrupadas em ondas topológicas pelo grafo "Depende de"; cada onda dispara TODOS os hefestos
  na mesma mensagem. Sequencial virou exceção que exige dependência declarada — execução
  sequencial de tasks independentes custou ~2h extras numa PRD real de 13 tasks.
- **Grafo `Depende de` mecânico (`/prd` + TEMPLATE-TASK):** o campo passa a ser documentado
  como grafo de execução (não sugestão de ordem) — só dependência REAL; o PROMPT-EXECUCAO
  ganha a tabela de ondas de paralelismo; a telemetria grava `waves` p/ medir o ganho.
- **Novo `.claude/PLAYBOOK-TELEMETRIA.md`:** runbook forense "a PRD demorou demais" — regra de
  leitura do `out_tps`, análise de gaps do transcript (sessão e subagents), confirmação via
  allowlist local e desconto de pausas do operador. Propagado pelo sync (CORE_FILES).
- **Atenção no port/update:** o `settings.json` NÃO é propagado pelo sync — o wiring dos
  blocos `Notification` e `PreToolUse` é ação manual por repo (ONBOARDING 1.8.0); o doctor
  avisa. A tela `/harness-config` ainda não expõe `HARNESS_NOTIFY_CMD`/`HARNESS_GUARD_BASH`.

## 1.7.0 — 2026-06-23

**`/prd-exec` sugere renomear a sessão para `{repo}-Exec-PRD-{NNN}`** — pra você achar, na lista do `/resume`, qual janela está executando qual PRD.

- Na **Fase 1.1** (assim que resolve o número da PRD, junto do start da telemetria), a skill calcula `{repo}` (`basename` da raiz do git) e **exibe o comando `/rename {repo}-Exec-PRD-{NNN}` pronto para colar** (ex: `dr-thiago-couto-Exec-PRD-043`).
- É **apenas sugestão, não bloqueia**: o Claude Code não permite renomear a sessão via skill/hook no meio dela — o campo `sessionTitle` só existe no hook `SessionStart` (abertura/resume) e o `/rename` é manual/interativo. Por isso a skill entrega o comando mastigado em vez de tentar (em vão) renomear sozinha.
- **Sem mudança de fluxo:** roda `/prd-exec` como sempre; o rename é um enter opcional.

## 1.6.0 — 2026-06-17

**Modo crítico de review — os ciclos passam a focar (e travar) só nos 🔴; o resto vira observação automática.** Resposta direta à lentidão dos ciclos de beholder / michelangelo / code review. Nenhum revisor é desligado — a dupla-cega Codex + sherlock segue rodando normal.

- **Novo dial `HARNESS_REVIEW_SEVERITY_FLOOR` (piso de severidade), default `critico`.** Fonte única em
  `harness.env` (propaga pelo `/deus`); o Perfil → "Codex review" → "Piso de severidade do review"
  sobrescreve por projeto. Três níveis:
  - `critico` (default): beholder, michelangelo e sherlock **detalham só 🔴**; 🟠/🟡/🔵 viram placar
    agregado + observação/backlog **sem exigir aceite nem gastar ciclo**. Só 🔴 bloqueia e itera.
  - `alto`: detalha 🔴+🟠; 🔴 trava, 🟠 pede aceite explícito.
  - `tudo`: régua clássica (🔴 e 🟠 iteram/pedem aceite — comportamento ≤ 1.5.1).
- **Loop do `/prd` (Passo 10) e Fase 2.9 do `/prd-exec` deixam de gastar ciclo/aceite em 🟠** no piso
  `critico` — antes 🟠 forçava correção ou decisão humana, inflando ciclos e paradas. **Esse é o ganho
  central.**
- **Não desliga revisor.** A dupla-cega (Codex + sherlock) e o reasoning do Codex seguem como antes —
  o piso mexe só na severidade que itera/trava, não em quem revisa nem na profundidade.
- **Reversível:** subir o rigor de um projeto = `HARNESS_REVIEW_SEVERITY_FLOOR='tudo'` (ou `'alto'`) no
  `harness.env` ou no Perfil. Os agentes continuam **investigando** por todas as lentes — o piso muda
  só o que é detalhado/travado, não a profundidade da análise.

## 1.5.1 — 2026-06-16

**Robustez do passo de resumo do RAG — a captura deixa de morrer (em silêncio) no timeout do `claude -p`.**

- **Timeout do resumo configurável e maior (120s fixo → 180s).** A destilação via `claude -p` leva
  ~50–77s já em máquina ociosa; sob carga (sessão + subagents do `/prd`) passava dos 120s e estourava
  (`ETIMEDOUT`), perdendo o aprendizado. Como a captura roda async, o teto alto só ajuda. Tunável:
  `HARNESS_RAG_SUMMARIZE_TIMEOUT_MS`.
- **Retry com backoff em falha transitória** (timeout/429/529/conexão; espera 3s, depois 6s). Erro
  permanente (binário ausente etc.) não re-tenta. Tunável: `HARNESS_RAG_SUMMARIZE_RETRIES` (default 1).
- **O log distingue `FALHA no resumo` de `nada relevante`.** O `summarize.ts` sai com **exit 3** em
  falha de LLM e o `_rag-common.sh` loga distinto — antes os dois casos eram idênticos no `rag.log`,
  o que escondeu uma fila de capturas perdidas por dias.
- **Diagnóstico que motivou:** o `claude -p` **não** foi bloqueado pelo crédito Agent SDK de 15/jun
  (testado — responde normal sob a assinatura); o que matava a captura era o timeout sob carga + um
  projeto sem `npm install`. `HARNESS_RAG_CAPTURE_AGENTS='0'` (default desde 1.3.0) evita a rajada
  de `claude -p` da captura por-agent.

## 1.5.0 — 2026-06-16

**`/prd` quebrada em duas fases, com aceite humano no meio — valida o produto antes de gastar o grosso e não estoura a sessão de contas menores.**

- **Fase 1 (`/prd <descrição>`) escreve só a PRD de produto e PARA (Passo 6.2).** Perfil, entrevista,
  discovery em paralelo e a PRD de produto — então a skill apresenta o documento e **aguarda aceite
  explícito**. Nenhuma PRD técnica, task, PROMPT-EXECUCAO ou gate (beholder/michelangelo) roda sem o
  "ok". Validar o escopo barato aqui evita re-escrever técnica + tasks + gates (o grosso do custo)
  quando o escopo muda.
- **Fase 2 (detalhamento) só com aceite — e retomável em sessão nova.** PRD técnica, tasks,
  PROMPT-EXECUCAO e os dois gates rodam **(a) inline**, se o usuário aceitar na hora, ou **(b)
  depois**: fecha a sessão e, numa janela nova / horário melhor, roda `/prd` de novo — o **Passo 0.0**
  (novo) detecta a PRD de produto pendente e retoma. Começar a parte pesada com a sessão zerada é o
  que protege a conta menor.
- **`_discovery.md` — estado persistido entre as fases (novo).** No fim da Fase 1, a `/prd` grava a
  síntese do discovery (escopo final, schema/gaps, código/helpers, inovações aprovadas, mapa de
  impacto do atlas, efeitos colaterais, preset/modelos) em `prds/PRD-NNN-<nome>/_discovery.md`. A Fase
  2 numa sessão nova lê esse arquivo **em vez de re-rodar os agents do discovery** — sem custo
  duplicado. Ele também é o **marcador** que o Passo 0.0 usa para reconhecer a PRD pendente (produto +
  `_discovery.md`, sem PRD técnica).
- **Telemetria agora é por fase.** Como as fases podem rodar em sessões diferentes, cada uma tem
  cronômetro próprio — `PRD-NNN-fase1` (Passo 1 → 6.2) e `PRD-NNN-fase2` (retomada → Passo 11); medir
  uma só cruzando o aceite humano inflaria a duração. O comparativo em `prds/_metrics/` passa a ter
  entradas por fase.
- **INDEX ganha o status `Aguardando Fase 2`.** A Fase 1 registra a PRD nesse status (sinal de
  retomada do Passo 0.0); a Fase 2 promove para `Rascunho` ao concluir.
- **Sem nova decisão de Perfil/custo.** Não há campo novo no Perfil nem flag — a quebra é
  comportamento automático. Modelos dos agentes, presets e ciclos seguem como em 1.4.0.

## 1.4.0 — 2026-06-15

**Gate automático de UI/UX (`michelangelo`) — o front ganha o mesmo rigor que a correção já tinha.**

- **Novo gate de UX na `/prd` (Passo 10), em paralelo ao beholder.** Quando a PRD tem trabalho de
  interface, o `michelangelo` entra **automaticamente** e em **paralelo** ao beholder (mesma
  mensagem — lentes ortogonais, ambos só leem a PRD do disco): o beholder ataca a **correção da
  spec**, o michelangelo critica o **design de front-end proposto** (hierarquia, carga cognitiva,
  estados, WCAG, prevenção de erro, consistência, responsividade, microcopy). Fecha a simetria que
  faltava: **tony-stark propõe antes ↔ beholder ataca a correção depois**; **UI UX Pro Max gera o
  design ↔ michelangelo critica o design depois**. Lema: *garantir sempre o melhor front possível*.
- **michelangelo ganhou o modo "REVISÃO DE PROPOSTA" (Modo C):** lê os documentos da PRD do disco
  (seção "Frontend / Interface" da técnica + componentes de UI nas tasks) e critica a tela **no
  papel** (ela ainda não existe), por severidade, com veredito (Excelente / Bom com ajustes /
  Precisa repensar) e gate — como o beholder. Salva `REVIEW-michelangelo.md` na pasta da PRD e roda
  em **ciclos** (revisar → corrigir → re-revisar até zerar os 🔴 de UX). Os modos AUDITORIA (tela
  que existe) e CONSULTORIA seguem.
- **Disparo só quando há UI:** detecta por seção "Frontend / Interface" preenchida OU componentes de
  UI nas tasks. PRD puramente backend/migration/config: pulado, sem ruído (como o atlas pula em
  greenfield). (`Skip HTML Roadmap` **não** é gatilho — o default dele é "Não" e a semântica é "gerar
  o HTML da Fase 4?", não "tem UI?".)
- **Gate bloqueante:** 🔴 de UX corrige na PRD antes de finalizar; 🟠 corrige ou aceita
  explicitamente (decisão do usuário, nunca do agente); 🟡/🔵 vão para "Melhorias Futuras"/backlog.
  Esgotou os ciclos com 🔴 → a `/prd` para e pede decisão humana (igual ao beholder).
- **Segunda camada na `/prd-exec` — Fase 2.9 (AUDITORIA):** após o code review, o michelangelo
  audita a tela **construída** via preview, confrontando com o que a PRD propôs (e com o
  `REVIEW-michelangelo.md`): os 🔴/🟠 de UX foram resolvidos na implementação? Fecha o ciclo
  proposto→construído. Pulada quando não há UI ou `HARNESS_SKIP_MICHELANGELO=1`.
- **Config ajustável (tela + arquivos), como os outros agentes:** campo novo **"Ciclos do
  michelangelo"** no Perfil (override de ciclos) e na tela `/harness-config`; "Modelo do
  michelangelo" (já existia) agora resolve pelo preset também no fluxo automático (sonnet · sonnet ·
  opus). O preset expande os dois loops de gate em paralelo. Bypass: `HARNESS_SKIP_MICHELANGELO=1`.

## 1.3.0 — 2026-06-13

**Presets de esforço, telemetria, tela de configuração, scout `peter-quill` — e a carta de teste que chega aos executores.**

- **Preset de esforço (dial macro):** o Perfil ganhou a seção **"Nível de esforço (preset)"** —
  `economico` / `equilibrado` / `maximo` resolve de uma vez os modelos dos agentes, o nº de ciclos
  (beholder + Codex) e o reasoning do Codex. Os campos de modelo passam a aceitar `preset` (default)
  ou `sonnet`/`opus` (override fino). Régua: **Opus onde há julgamento, Sonnet onde há mapeamento**.
- **Discovery analítico parametrizável:** o Agent A (DTs) do `/prd` deixou de herdar o modelo da
  janela — campo novo **"Modelo do discovery analítico"** (preset; opus no `maximo`). Recomendação
  nova no topo das skills: **criar PRD em Opus, executar em Sonnet**.
- **Thinking dos julgadores:** dial `padrao`/`estendido`/`ultrathink` — esforço de raciocínio extra
  **sem trocar de modelo** (candidato a posição intermediária mais barata que Opus; validar com a
  telemetria antes de virar padrão).
- **Novo agente `peter-quill`** (scout read-only, Sonnet): substitui o `Explore` genérico no
  discovery do `/prd` (Agents B/C/D) com contrato Beta — Perfil primeiro, mapa estruturado em PT-BR,
  honesto sobre o não-verificável.
- **Telemetria automática:** `harness-metrics.sh` (+ `harness-metrics.mjs`, Node puro sem deps) gera
  um resumo de **duração + tokens** ao fim de `/prd` e `/prd-exec` e mantém o histórico comparativo
  em `prds/_metrics/harness-runs.jsonl`. Best-effort — falha nunca bloqueia a skill.
- **Tela de configuração visual:** `/harness-config` abre um HTML (`harness-config.html`) onde o dev
  **vê/edita todo o Perfil + harness.env** com presets e gera os arquivos de volta. Para abrir ao
  instalar, ao atualizar e sob demanda.
- **Carta de armadilhas de teste:** seção nova no Perfil **"Armadilhas de teste/seed (E2E)"** que o
  `hefesto` lê **antes** de escrever spec — fecha a fuga em que cada executor redescobria tropeços de
  seed na marra (o RAG só beneficiava o orquestrador, não os subagentes). A **Fase 5 do `/prd-exec`**
  passa a **curá-la** com os "Desvios e observações" dos hefestos.
- **Captura RAG por-agente desligada por default** (`HARNESS_RAG_CAPTURE_AGENTS=0`): numa PRD de 13
  hefestos + 3 sherlocks eram ~16 chamadas ao resumidor (crédito Agent SDK pós-15/jun); a Fase 5
  curada substitui com melhor sinal e menor custo.
- **Reasoning do Codex configurável:** `HARNESS_CODEX_REASONING` (ou o preset) → o `codex-review.sh`
  injeta `-c model_reasoning_effort=<nível>`. Vazio = comportamento histórico. Testar `high` no
  ciclo 1 pode poupar um ciclo.
- **`/prd`:** gate de **split por urgência** (bug em produção vira PRD própria, fecha antes da
  feature); **orçamento de tamanho de task** (>4 arquivos de produção ou >3 cenários de spec →
  fatiar); **política de poda do doc raiz** (migrar PRDs antigas para `CLAUDE-HISTORICO.md`).
- **`/prd-exec`:** **anti-alucinação no gate** (a sessão pai sempre re-roda os specs e cola o stdout
  bruto, nunca confia no relatório parafraseado do subagente); **validação única** (só specs tocados
  por correção + um batch final, em vez de re-rodar a suite a cada ciclo).

## 1.2.1 — 2026-06-11

**`/prd`, `/dt` e `/prd-exec` sincronizam o repo antes de tocar o código.**

- **Novo passo de sincronização** no início das três skills, antes de qualquer leitura ou
  escrita de código: `/prd` ganhou o **Passo 0.2** (antes do discovery), `/dt` o **Passo
  0.1** (antes de investigar) e `/prd-exec` o **Passo 0.1** (antes da Fase 0 / safe-mode).
  Motivo: discovery e implementação operavam sobre o estado **local**, que podia estar
  atrás do remoto — a PRD/DT nasciam sobre código velho (gaps já resolvidos, `arquivo:linha`
  defasados) e a execução implementava sobre base desatualizada (conflito no commit,
  retrabalho, review sobre diff sujo de mudanças alheias).
- **Rotina segura de pull (nunca destrutiva), idêntica nas três:** só roda em repo git com
  remote; com working tree **limpo** faz `git pull --ff-only` no branch atual e reporta os
  commits trazidos; com working tree **sujo** NÃO faz pull — roda `git fetch`, informa
  quantos commits atrás está e **pergunta** se segue no estado atual ou para para commitar/
  stashar. Divergência (ff-only recusa) ou erro de rede/auth também param e perguntam.
  Proibido `reset --hard`, `checkout .`, `clean` e pull com merge/rebase automático —
  `--ff-only` só avança, nunca descarta o local.
- **`/prd-exec`:** o passo roda **uma vez** no início (não confundir com o `git status` da
  Fase 2.1, que inspeciona o diff pós-implementação) e **pula em CI/deploy** (working tree
  já no commit-alvo / detached HEAD — o checkout do pipeline já sincronizou).
- **Regra "não commit/push" reconciliada** em `/dt` e `/prd-exec`: aberta exceção explícita
  ao `git pull --ff-only` de sincronização (avanço/leitura, não altera histórico nem remoto).
- **Sem mudança de Perfil ou flag:** comportamento automático, nada a configurar (ver
  ONBOARDING seção C).

## 1.2.0 — 2026-06-11

**Política Sonnet-first + onboarding de instalação/atualização.**

- **TODOS os agentes genéricos agora rodam em Sonnet por padrão** — `beholder`,
  `tony-stark` e `michelangelo` deixaram de ser Opus fixo no frontmatter. Motivo:
  tony-stark e beholder entram automaticamente em **toda** PRD; em Opus, eram a causa
  primária de alto consumo de tokens nas contas dos devs. Opus virou **opt-in por
  agente** no Perfil — a seção "Agentes do harness (modelos)" foi estendida de 2 para
  **5 campos** (sherlock, atlas, tony-stark, beholder, michelangelo), com tabela de
  frequência e regra de bolso de custo. Perfil antigo sem os campos novos cai no
  default `sonnet` — nada quebra.
- **`/prd` lê o modelo do tony-stark (Passo 2) e do beholder (Passo 10) no Perfil**,
  como já fazia com atlas/sherlock, e passa o override na chamada Agent.
- **Red-team do beholder em CICLOS com limite configurável:** o Passo 10 do `/prd` agora
  é um loop contado (revisão → correção → re-revisão), limitado pelo campo novo
  **"Ciclos do beholder"** do Perfil (default `4`; `0` = sem limite). Esgotou o limite
  sem zerar os 🔴 → a skill **para e exige decisão humana**: seguir (achados restantes
  viram "Riscos aceitos no red-team" na PRD) ou abortar (PRD marcada
  `⛔ Não executável — red-team não convergiu` no INDEX). Em re-run o beholder verifica
  primeiro se os achados do ciclo anterior foram resolvidos (relatório ganha "Ciclo" e
  "Resolvidos desde o ciclo anterior") e tem regra anti-inflação ("convirja, não
  recomece").
- **Limite de ciclos do code review também configurável** (mesma semântica): o campo
  "Limite de ciclos" do Perfil (seção "Codex review") deixou de ser `4 (fixo)` — default
  `4`, `0` = sem limite. A Fase 2 do `/prd-exec` lê o campo e, ao esgotar com bloqueantes,
  **para e exige decisão humana** (novo gate 2.7): seguir (bloqueantes aceitos viram
  candidatos a DT na Fase 5; Output marca `⚠️ concluída com bloqueantes aceitos`) ou
  abortar (comportamento clássico: PRD "Bloqueada"). No `/codex-review` standalone, o
  default passa a vir do Perfil e `--max-ciclos=N` (sem clamp em 4; `0` = sem limite)
  vira override pontual — esgotou, reporta e devolve a decisão ao usuário.
- **Novo `.claude/ONBOARDING.md`** (viaja no port e no sync): checklist das decisões da
  primeira instalação (seção A — modelos/custo, lint, RAG, Codex, permissões), rotina
  de atualização (seção B) e a tabela **"Decisões por versão"** (seção C) — o dev que
  recebe um update do `/deus` lê ali o que mudou e o que precisa ajustar.
- **`harness-sync.sh`:** propaga o `ONBOARDING.md` (novo CORE_FILE) e, no `--apply` com
  cópias feitas, imprime a linha `ONBOARDING|de -> para|...` lembrando de revisar as
  "Decisões por versão" e rodar o doctor.
- **`harness-doctor.sh`:** confere o `ONBOARDING.md`; alerta Perfil sem a seção de
  modelos; e **lista os agentes promovidos a Opus** (a decisão de custo fica visível).
- **README:** port agora tem 7 passos (novo Passo 4 — "Decidir os modelos dos agentes");
  nova seção "Onboarding: decisões de instalação e atualização"; regra de manutenção
  (toda versão nova carimba `harness.env` + CHANGELOG + ONBOARDING no mesmo commit).
- **QUICKSTART-DEV:** nota de custo Sonnet-first + rotina "o harness foi atualizado no
  repo?".

## 1.1.0 — 2026-06-09

**Code review dupla-cega + agentes de impacto e execução.**

- **Novo agente `sherlock`** (review de código, Sonnet): a Fase 2 do `/prd-exec` e o
  `/codex-review` agora rodam **dupla-cega** — Codex CLI + sherlock em paralelo, sem ver
  um ao outro; achado apontado pelos dois = alta confiança. **Sem Codex no ambiente, o
  sherlock revisa sozinho** (review nunca mais é pulado em silêncio). Standalone:
  *"sherlock, revisa isso"*.
- **Novo agente `atlas`** (arquitetura + análise de impacto, Sonnet): mapeia o blast
  radius de uma mudança (consumidores, contratos, regressões) com `arquivo:linha`.
  Entra como **Agent F** no discovery do `/prd` quando a PRD toca módulo existente; a
  PRD Técnica ganha subseção "Análise de impacto" em Riscos; o beholder ganhou a
  **13ª lente** (cobra a cobertura dos pontos 🔴/🟠).
- **Novo agente `hefesto`** (executor de task, Sonnet): a delegação paralela da Fase 1
  do `/prd-exec` agora usa um agente com contrato fixo (Perfil primeiro, escopo estrito,
  regras críticas, nunca commita, relatório padronizado) em vez de agente genérico.
- **Modelos opt-in por Perfil:** nova seção "Agentes do harness (modelos)" no
  `PERFIL-PROJETO.md` — sherlock/atlas em `sonnet` (default) ou `opus` (contas com mais
  limite). Perfis antigos sem a seção caem no default.
- **Relatórios de review persistentes:** default de `HARNESS_CODEX_REPORTS` mudou de
  `/tmp/harness-codex-reviews` para **`codex-reviews/` na raiz do repo** (path relativo
  é ancorado na raiz; mantenha a pasta no `.gitignore`).
- **Lint estendido (opcional, não-bloqueante):** `HARNESS_LINT_CMD_EXTRA` no
  `harness.env` roda análise estática (phpstan/eslint) após a sintaxe passar; falha vira
  aviso ao Claude, nunca bloqueia.
- **Novo bypass:** `HARNESS_SKIP_SHERLOCK=1` (desliga o sherlock no review; o Codex
  segue, modo solo).
- **Novo `QUICKSTART-DEV.md`:** guia de 1 página para devs em projeto já portado.
- `harness-sync.sh` e `harness-doctor.sh` atualizados para os 3 agentes novos
  (propagam como genéricos, junto com beholder/michelangelo/tony-stark).

## 1.0.0 — 2026-06-02

- Versão inicial carimbada: 4 skills (`/prd`, `/prd-exec`, `/dt`, `/codex-review`),
  hooks (sync-memory, lint bloqueante, codex-review), sistema de perfis, templates de
  PRD/Task/DT/Roadmap, memória dupla, agentes (beholder, michelangelo, tony-stark +
  datilografo/zelador Beta) e módulo RAG opt-in.
