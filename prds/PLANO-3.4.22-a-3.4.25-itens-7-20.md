# Plano de retomada — itens 7 a 20 (harness 3.4.22 → 3.4.25)

> **Gerado em:** 2026-09-05, no PC, ao fim da publicação da 3.4.21. **Para:** retomar do MacBook (ou em viagem)
> numa sessão nova, sem depender da memória desta conversa. Tudo que uma sessão nova precisa está aqui ou nos
> arquivos apontados.
> **Origem dos itens:** `prds/ANALISE-TELEMETRIA-2026-09-04.md` §9 (diagnóstico da máquina) e §10 (lista de 20).
> Os itens 1–6 viraram a **3.4.21** (CHANGELOG). Este plano cobre os **14 restantes**.
> **Regras da casa que valem aqui:** aprimorar o que existe (nada de fluxo paralelo) · tudo novo nasce LIGADO
> por padrão com kill switch · "instrução não segura, hook segura" · PATCH por onda e **perguntar ao Charles
> antes de bumpar** · commit nos repos do Charles = working tree inteiro (`git add -A`) + push; repos da equipe
> = commit escopado · validar em cada onda: Windows (Git Bash), macOS (bash 3.2, sem GNU-isms), telemetria não
> quebra (schema 2.15.0), Caronte/presença não quebra.

---

## 0. Onde as coisas estão (Mac × PC)

| O quê | macOS (MAMP) | Windows (Laragon) |
|---|---|---|
| Vault (fonte de verdade) | `/Applications/MAMP/htdocs/vault` | `C:\laragon\www\vault` |
| Harness mestre | `<vault>/projetos/referencias/harness` | idem |
| Projetos irmãos (`base_dir` do DEUS) | `/Applications/MAMP/htdocs` | `C:/laragon/www` |
| Réplicas | `…/base-conhecimento/referencias/harness` e `…/equipe-tefnet-harness-base` (raiz) | idem |
| Config do DEUS (tem `dir_mac`) | `<vault>/projetos/referencias/deus-config.md` | idem |
| Sync projeto ← mestre | `bash <mestre>/.claude/harness-sync.sh --check\|--apply <projeto>` | idem |
| Espelho réplica ← mestre | `bash <vault>/projetos/referencias/harness-replica-sync.sh --check\|--apply <réplica>` | idem |
| Suíte da 3.4.21 | `node <mestre>/tests/t-3421-maquina.mjs` (sandbox em `os.tmpdir()`) | idem |
| Scripts de análise (re-medição) | `<mestre>/tests/analise/*.js` (ver §6) | idem |
| Estado por máquina | `~/.harness-run/` (daemon.json/log, frentes/, sessoes.json, spawn-history.jsonl) | `%USERPROFILE%\.harness-run\` |

Memória do Claude Code é por caminho de projeto: a sessão do Mac **não vê** as memórias do PC. Leia este arquivo,
o CHANGELOG (3.4.11 → 3.4.21) e o ONBOARDING §C antes de mexer.

## 1. Primeira coisa no Mac — smoke da 3.4.21 (30 min)

A 3.4.21 nasceu no Windows. No Mac o fork é nativo (5–20 ms), então o ganho é menor, mas os hooks precisam
funcionar. Checklist, na ordem:

1. `cd <vault> && git pull` · `cd <projeto ex. dra-mariana-duarte> && git pull` (os 3 projetos do Charles e as
   2 réplicas já estão na 3.4.21 no remoto).
2. `node <mestre>/tests/t-3421-maquina.mjs` → esperado 68 PASS. Falhas prováveis no Mac e o que fazer:
   - `sessoes.mjs` — enumeração via `ps -axo pid=,ppid=,etimes=,time=,args=` e filtro `ehSessaoCli` (regex
     `claude(.js|.mjs)?` e exclusão de `Claude.app`); confirmar que lista as sessões CLI e NÃO o app.
   - `curl -sf --data-binary @-` (curl do sistema) — deve funcionar; `[ -f …]` é builtin.
   - `frentes.mjs`: `HARNESS_FRENTES_MAX` default 2 no macOS (`process.platform !== 'win32'`).
3. Num projeto: `node .claude/hooks/harness-daemon.mjs --ensure "$(pwd)"` → `[daemon] harness-daemon ativo`;
   `bash .claude/hooks/doctor-cached.sh` → linha `[doctor] spawn N ms` (esperado 5–30 ms) e `daemon de hooks ATIVO`.
4. Abrir uma sessão real e rodar um Bash qualquer: o hook do settings passa pelo `curl` (marcador
   `.claude/.harness-run/daemon.on` presente); `node .claude/hooks/harness-daemon.mjs --status` deve mostrar
   `requests` crescendo.
5. `bash .claude/hooks/agent-stall.sh 4` → hoje devolve `vivos=0` no macOS por causa do `find -printf` (item 20).
6. Registrar o resultado no `spawn-history.jsonl` (o doctor já faz) e anotar aqui embaixo em "Validação macOS".

**Validação macOS:** _(preencher)_

## 2. Ondas propostas (PATCH por onda; perguntar antes de bumpar)

| Onda | Versão | Itens | Tema | Risco |
|---|---|---|---|---|
| A | 3.4.22 | 7, 8, 14, 20 | enforcement por hook + telemetria por task + manutenção | baixo (hooks) |
| B | 3.4.23 | 15, 16, 17, 18 | controle/volume: painel por dev, telemetria no git, cobertura, permissões | baixo/médio |
| C | 3.4.24 | 12, 13, 9, 10, 11 | velocidade de criação e exec: LEVE default, preset, packet por função, SOLO ×2, duelo | médio (toca skills) |
| D | 3.4.25 | 19 | agentes: contrato mecânico único via packet | médio/alto (refactor dos 12 agentes) |

Cada onda fecha com: suíte de testes (`tests/t-<versão>-*.mjs`, sandbox próprio como a 3.4.21), CHANGELOG,
ONBOARDING §C (o que é decisão do dev), `harness-sync.sh --apply` nos 3 projetos do Charles + réplicas +
commits/push, e `/deus` para os demais quando ele mandar.

---

## 3. Os 14 itens — especificação para executar

Formato: prova (medida) · proposta · arquivos · aceite · esforço. Números vêm da análise de 04/09.

### 7 — Teto de fôlego enforçado por hook + barrar `general-purpose`  ·  Onda A
- **Prova:** hefesto/dedalo dizem "~60 chamadas" e medem p90 121–125 turnos, máx 253 (dedalo TASK-006, 141 min);
  5 `general-purpose` na janela sem contrato/packet/guard. O watchdog p90 só avisa DEPOIS.
- **Proposta:** novo `hooks/guard-folego.mjs` em `PreToolUse` matcher `*` (ou no daemon), **só em subagente**
  (`transcript_path` com `/subagents/`): conta `tool_use` no transcript do agente (barato: contar ocorrências
  de `"type":"tool_use"` no arquivo; cachear offset por agente em `.harness-run/folego/<agent>.n`) e, a partir
  do teto por papel (`HARNESS_FOLEGO_hefesto=90`, `dedalo=90`, `sherlock=80`, `beholder=60`, `michelangelo=60`,
  `hermes=120`, default 100), NEGA tudo exceto `Write`/`Edit` do relatório (`.harness-run/relatorios/…`) com
  a mensagem "devolva PARCIAL-TEMPO agora: o que fez, o que falta, recomendação". Papel = `agent_type` do
  payload ou `agentType` do `.meta.json`. `guard-agent.sh` (pre) nega `subagent_type=general-purpose` quando o
  prompt contém rótulo TASK/DT/PRD e há papel do panteão (mensagem aponta o agente certo); knob
  `HARNESS_GUARD_GP=off`. Telemetria: `.harness-run/folego.jsonl` (agente, papel, turnos, negado).
- **Arquivos:** `hooks/guard-folego.mjs` (novo), `hooks/harness-daemon.mjs` (rota `/h/PreToolUse/guard-folego`
  opcional), `settings.json` (wiring com fallback node), `hooks/guard-agent.sh`, `harness.env` (tetos),
  agentes (trocar "~60 chamadas" por "o hook avisa/nega em N — devolva PARCIAL").
- **Aceite:** teste com transcript fake de 95 tool_use → deny; 40 → passa; Write do relatório passa acima do
  teto; sessão pai nunca negada. Rodar uma exec real e ver `folego.jsonl`.
- **Esforço:** P/M.

### 8 — Telemetria por task no `SubagentStop` (substitui os marcadores `.start`) + previsão de minutos  ·  Onda A
- **Prova:** 0 `watchdog-overruns.jsonl` em qualquer projeto com 6 agentes > 60 min; 16 `.start` órfãos em
  `.harness-run/watchdog/`; p90 do watchdog vem de dashboards de 22–31/08; duração por task só em prosa.
- **Proposta:** hook `SubagentStop` (já existe para presença) grava `prds/_metrics/harness-tasks.jsonl`:
  `{ts, projeto, maquina, papel, rotulo (TASK/DT/PRD-ciclo extraído do prompt/description do meta.json),
  agent_id, dur_s (1º→último timestamp do transcript), turnos, bash, read, edit, write, tokens_out,
  status (✅/⚠️/⛔/PARCIAL do último texto do agente), packet_kb (se `.harness-run/packets/<TASK>.packet.md`
  existe), worktree}`. `watchdog-baseline.sh` passa a calcular o p90 daqui (por papel e projeto, últimos 30
  dias) e `guard-agent --post` deixa de criar/consumir `.start` (remover o dir). `task-packet.sh --check` ganha
  `PREVISAO|<min>`: regressão simples sobre `harness-tasks.jsonl` do projeto (KB do packet × nº de alvos ×
  nº de specs) — sem histórico, imprime `n/d`. Dashboard: seção "tasks acima do envelope (45 min)" e
  "duração por papel" lendo o novo jsonl. Implementar em Node (`hooks/task-telemetry.mjs`), chamado pelo
  `presence.mjs --agent-end`? Não: hook separado no `SubagentStop` para não acoplar; via daemon opcional.
- **Arquivos:** `hooks/task-telemetry.mjs` (novo), `settings.json` (SubagentStop), `hooks/watchdog-baseline.sh`,
  `hooks/guard-agent.sh` (limpar .start), `hooks/task-packet.sh`, `hooks/harness-dashboard.mjs`,
  `prds/_metrics/README.md`, PLAYBOOK-TELEMETRIA.
- **Aceite:** SubagentStop fake com transcript de 3 turnos → linha correta; p90 muda com o histórico; um
  `--check` num projeto com histórico imprime PREVISAO.
- **Esforço:** M.

### 14 — Hermes: teto 120 vira deny; Modo C sempre por documento em paralelo  ·  Onda A
- **Prova:** PRD-139: 436 turnos de hermes em 2 E + 2 C; hermes por chamada p90 105, máx 118 (perto do teto);
  o guard-agent só AVISA acima de 120 (`H_T > HARNESS_HERMES_MAX_TURNOS`).
- **Proposta:** com o item 7 o teto vira deny natural (`HARNESS_FOLEGO_hermes=120`). Na `/prd` (Passo 7.2/10.2):
  Modo C sempre em N hermes = N documentos tocados pelos patches (não só "4+ docs"), na mesma mensagem, cada um
  com sua fatia; a pai só reconcilia. Registrar `turnos_hermes` por chamada na telemetria (item 8 cobre).
- **Arquivos:** `skills/prd/SKILL.md` (7.2, 10.2), `agents/hermes.md` (nota), `hooks/guard-agent.sh` (aviso vira
  referência ao guard-folego).
- **Aceite:** criação real com ≥ 3 docs corrigidos mostra N hermes C paralelos e nenhum acima de 120.
- **Esforço:** P.

### 20 — Manutenção em lote  ·  Onda A
1. `hooks/agent-stall.sh`: trocar `find … -printf '%T@ %p\n'` por loop com `stat -c %Y || stat -f %m`
   (macOS) — hoje devolve `vivos=0` no Mac em silêncio.
2. `hooks/guard-agent.sh`: rótulo do packet com sufixo de fatia (`PRD-136-b`) — o grep `PRD-[0-9]{3}(-[a-z])?`
   já existe; o incidente 04/09 foi o `review-packet` exigido como `PRD-136` — conferir `review-packet.sh
   --label` e o guard do sherlock (linha `RLBL`).
3. Apagar `.harness-run/watchdog/*.start` órfãos ao ligar o item 8 (doctor pode listar/limpar).
4. `modulo_agente` (Giovanny): renomear `tests/e2e/com9/` — nome reservado no Windows; pull falha em todo PC.
   É repo da equipe: abrir DT/pedido, não mexer.
5. `bonifica-pedidos`: `.gitignore` tem `*.env` e engole `.claude/harness.env` (telemetria nasce sem versão) —
   pedir ao Giovanny para versionar o `harness.env` (exceção no `.gitignore`).
6. Delegações read-only com `tree_tocado=SIM` (codex-cli 8, openrouter 7, ollama 5 na janela 29/08–04/09):
   `_delegate-common.sh` mede `git status` antes/depois — investigar se é o próprio git (index refresh) ou o
   worker escrevendo; se for ruído, marcar como tal no dashboard.
7. `integracao-tefnet-fiserv`: `PRD-002-exec` aberta há 15 dias (103 subagentes, 32 prompts) — a linha
   contamina o painel; item 15 cobre (runs > 12 h fora); avisar o Marcos.
8. `hooks/denied.sh`: escapar quebras de linha em `detail` (16 de 83 linhas de `permission-waits.jsonl`
   inválidas); parser tolerante no dashboard.
9. Débora (ric-tur): zero telemetria versionada apesar de PRDs 031–039 — item 16 resolve; enquanto isso pedir
   que inclua `prds/_metrics/runs/*.jsonl` no commit.
- **Esforço:** P (tudo junto, meia onda).

### 15 — Dashboard por dev/máquina, sem pontos cegos e sem lixo  ·  Onda B
- **Prova:** `harness-dashboard.mjs:96` descarta linha com `projeto !== pasta` (worktrees `--wt-*` somem: as 3
  execs mais pesadas de 03–04/09 não existiam no painel); Caronte PRD-013-fase2 gravada 2× (auto-start +
  start), newportaltefnet PRD-114-b-fase2 3×, `PRD-000-exec` (rótulo sem número); 7 runs > 12 h (até 21.901 min)
  entram nas medianas; `harness`, `maquina`, `extra` só no `runs/` (o consolidado não tem); comparação
  Charles × equipe exigiu script à mão (`tests/analise/por-dev.js`).
- **Proposta:** (a) normalizar `projeto` (strip `--wt-<x>`) e rotular `worktree`; (b) `harness-metrics stop`
  grava campos estruturados `harness, maquina, modo (leve|turbo|noturno|normal), limitou, review_modo
  (dupla|solo|solo-2|partes), codex (ok|indisponivel), stalls, tasks_estouradas, spawn_ms, frentes` (o `extra`
  livre continua); (c) linha com `elapsed_s > 12h` = "suspeita": fora de mediana/p90/topCaras, listada à parte;
  (d) dedup por `label + ts_end ± 60 s`; `harness-metrics-auto.sh` não liga se já há marcador do mesmo rótulo;
  rótulo sem número é recusado; (e) painel corta por **versão** e por **dev/máquina** (spawn, perm, negações,
  preset, codex) — a tabela §8.1 da análise vira seção fixa; (f) parser tolerante do `permission-waits.jsonl`;
  (g) `harness-incidentes.jsonl` com schema único e seção no painel.
- **Arquivos:** `hooks/harness-dashboard.mjs`, `hooks/harness-metrics.mjs/.sh`, `hooks/harness-metrics-auto.sh`,
  `hooks/denied.sh`, skills (flags novas do stop), `PLAYBOOK-TELEMETRIA.md`.
- **Aceite:** `--all` no PC mostra as execs de worktree; Caronte PRD-013-fase2 aparece 1×; runs > 12 h em
  "suspeitas"; seção por dev com Derick/João/Giovanny/Charles.
- **Esforço:** M.

### 16 — Telemetria chega ao git sozinha  ·  Onda B
- **Prova:** `runs/<dev>@<host>.jsonl` só chega quando o dev o inclui no commit (newportaltefnet: Giovanny 13×,
  João 4×, Derick 2×; Débora 0× em 2 repos com 9 PRDs). Nenhuma skill/hook o commita.
- **Proposta:** no fechamento das skills (`/prd`, `/prd-exec`, `/dt-exec` — o passo que já escreve a mensagem
  de commit) incluir `git add prds/_metrics/runs/<self>.jsonl` (o próprio arquivo da máquina, nunca `_metrics/`
  inteiro) e o `guard-stop.sh` avisar 1× quando o arquivo está modificado e não staged há > 1 h. Alternativa
  sem depender da skill: `harness-metrics stop` faz `git add` do arquivo (é do dev; não commita). Documentar
  no PLAYBOOK e no ONBOARDING (decisão: nenhuma).
- **Arquivos:** `hooks/harness-metrics.sh/.mjs` (stop), `hooks/guard-stop.sh`, skills (fechamento).
- **Aceite:** após um stop, `git status` mostra o runs staged; Débora aparece no painel na semana seguinte.
- **Esforço:** P.

### 17 — Cobertura e frescor por dev/repo no painel  ·  Onda B
- **Prova:** equipe sobe versão sozinha via `/prometeu` (ric-tur/3s/aec/sagittarius/fiserv em 3.4.20; 14
  projetos do Charles em 3.4.10); bonifica sem `harness.env` versionado; sistema-vs só na `developer`;
  Débora sem runs; run da fiserv aberta há 15 dias.
- **Proposta:** seção "Cobertura" no dashboard `--all`: por repo (versão, branch, último run, dev(s), runs
  em 14 d) e por dev (repos, último run, "silêncio há N dias", prompts/negações por run). Fonte: `harness.env`
  de cada pasta + `runs/*.jsonl`. `/deus --check` reaproveita (uma linha por dev).
- **Arquivos:** `hooks/harness-dashboard.mjs`, `skills/deus/SKILL.md` (painel), `skills/harness-report`.
- **Aceite:** painel lista Débora com "0 runs / 2 repos" e o fiserv com "run aberta".
- **Esforço:** P.

### 18 — Permissão por máquina  ·  Onda B
- **Prova:** João 76 prompts em 11 runs (8/run, 16 numa exec); Giovanny 52 negações do classificador em 33
  runs (+ anti-espiral); Charles 27 prompts "permission to use AskUserQuestion" em 2 dias e 59 min de espera
  humana numa exec "noturno autônomo"; `permissions.allow` do Mariana vazio (auto-edição barrada pelo
  classificador).
- **Proposta:** (a) `harness-sync.sh`/doctor aplicam a allowlist do Perfil ("Execução autônoma") na seção
  `permissions.allow` do `settings.json` versionado (hoje só a seção `hooks` viaja) — preservando o que o
  projeto já tem; `AskUserQuestion` entra na allowlist (a pergunta já é a parada; a permissão para perguntar
  é uma segunda parada inútil); (b) `hooks/guard-question.sh` (PreToolUse `AskUserQuestion`): em
  `--noturno`/TURBO (estado em `.harness-run/*-exec.json` ou marcador `modo`) nega e devolve "decida pelo
  default declarado no Passo 0.3 e registre em Decisões pendentes"; (c) telemetria separa `perguntas` de
  `permission_prompts` e conta `classifier_denials` por dev (item 15); (d) negação recorrente do mesmo
  comando (`denied.sh`, 3× em 7 dias) vira sugestão pronta de allowlist no doctor (`--gen-allowlist` já
  existe — ligar as duas pontas).
- **Arquivos:** `harness-sync.sh`, `harness-doctor.sh`, `hooks/guard-question.sh` (novo), `hooks/denied.sh`,
  `settings.json`, skills (0.3 declara defaults), ONBOARDING (decisão: allowlist vem do Perfil).
- **Aceite:** João roda uma exec com ≤ 1 prompt; exec `--noturno` fecha com `wait_human_min=0`.
- **Esforço:** P/M.

### 12 — MODO LEVE por padrão em fatia e PRD ≤ 8 tasks; hermes só ≥ 9  ·  Onda C
- **Prova:** único caso no alvo (fase 2 ≤ 60 min) do Charles foi o MODO LEVE (51 min, 153 linhas/task, sem
  hermes); hermes E+C = 27–48 min (30–55% da fase 2); Derick em LEVE: 28 min.
- **Proposta:** `/prd` Passo 1.5: LEVE vira default (sem pergunta) para `-b/-c` e planos ≤ 8 tasks; a pai
  escreve as tasks (como na 3.4.8) e o Modo C é patch da pai; hermes só ≥ 9 tasks ou técnica > 800 linhas
  (aí em paralelo, item 14). `modo` vai para a telemetria (item 15) para comparar as trilhas em 2 semanas.
- **Arquivos:** `skills/prd/SKILL.md` (1.5, 8, 10.2), `agents/hermes.md`.
- **Aceite:** próximas 5 criações ≤ 8 tasks fecham a fase 2 em ≤ 60 min ativos sem perda de 🔴 no c1.
- **Esforço:** P.

### 13 — Preset do Charles: gate c1 em Sonnet, Opus só quando o c1 reabre o desenho  ·  Onda C
- **Prova:** equipe (econômico: Sonnet, 1–2 ciclos) fecha fase 2 em 28–63 min; Charles (equilibrado/máximo:
  Opus no c1, 2–3 ciclos) em 86–201; achados por ciclo 9,1,2 / 7,1,1 — o c1 acha, os demais confirmam.
  Contraponto medido: no econômico as correções pós-teto saem "sem re-verificação" (Giovanny G112a, João 116).
- **Proposta:** no preset `equilibrado`: beholder/michelangelo c1 em **Sonnet**; escalar para Opus só se o c1
  reabrir o desenho (≥ 3 🔴 estruturais) — regra no Perfil "Agentes do harness (modelos)" e na `/prd` 10.1.
  Manter 2 ciclos (não 1). **Decisão do Charles** antes de aplicar no Mariana/Caronte (é o gate de qualidade
  dele). Medir `min_gates` e `achados_por_ciclo` antes/depois.
- **Arquivos:** `harness-config.html`/`harness-ui.mjs` (PRESET_MATRIX), `skills/prd/SKILL.md` (10.1),
  Perfis dos 3 projetos, ONBOARDING (decisão).
- **Aceite:** 3 criações com c1 Sonnet: `min_gates` ≤ 40 e 🔴 do c1 ≥ 80% dos 🔴 totais.
- **Esforço:** P.

### 9 — Packet por função para todo alvo > 40 KB e fatiar por previsão  ·  Onda C
- **Prova:** PRD-135-b: 4 de 8 tasks com 66–141 min (envelope 45) tendo 215 linhas/task (o teto de 230 não
  previu); packets de 62–134 KB; TASK-005 68 min com 113 Bash e 2 Read. O packet por função (3.4.19) só vale
  para arquivo-alvo > `HARNESS_PACKET_ARQ_KB` (40) — aplicar a TODOS os alvos grandes e ao contexto (não só
  ao alvo principal).
- **Proposta:** `task-packet.sh`: esqueleto + corpo só das funções citadas para qualquer arquivo > 40 KB
  (alvo ou contexto); `--check` usa `PREVISAO|min` (item 8) além de linhas/KB/alvos: previsão > 45 →
  `GRANDE` (fatiar antes do gate). Hermes recebe a regra ("fatie quando o `--check` prever > 45").
- **Arquivos:** `hooks/task-packet.sh`, `agents/hermes.md`, `skills/prd/SKILL.md` (Passo 8).
- **Aceite:** próxima exec do Mariana com 0 tasks > 60 min; packet médio < 80 KB.
- **Esforço:** P (depende do item 8 para a previsão).

### 10 — SOLO oficial = 2 sherlocks com lentes disjuntas; Codex por dev com validade  ·  Onda C
- **Prova:** 5/5 preflights do Codex falhando no PC (limite até 07/09) e repetindo o ping a cada run (breaker
  TTL 30 min); 100% SOLO no Charles, 6/6 no João; Derick com dupla real em 6/7; a compensação "4 sherlocks" só
  na 135-b, ad hoc. codex-cli 14/40 falhas na equipe.
- **Proposta:** (a) `harness-delegate.sh --preflight`: quando a resposta é usage limit, grava
  `preflight-codex-cli.status` com `ate=<data>` (parse da mensagem; sem data, +24 h) e o doctor/SessionStart
  anunciam "Codex fora até <data> — review em SOLO-2"; skills não tentam antes; (b) SOLO oficial = 2 sherlocks
  na mesma mensagem, lentes disjuntas por prompt: A = correção + segurança + Perfil/armadilhas; B = contratos +
  regressão + invariantes do gate + testes; a pai cruza (achado nos dois = quase certo); `review_modo=solo-2`
  na telemetria; (c) painel por dev mostra taxa de dupla real.
- **Arquivos:** `hooks/harness-delegate.sh`, `hooks/doctor-cached.sh`, `skills/prd-exec/SKILL.md` (Fase 2),
  `skills/codex-review`, `agents/sherlock.md` (lente A/B por prompt), `hooks/review-packet.sh` (mesmo packet).
- **Aceite:** com Codex fora, exec mostra 2 sherlocks c1 em paralelo e `review_modo=solo-2`; sem ping ao Codex.
- **Esforço:** P/M.

### 11 — Duelo só quando há chance real de aplicar; pool obedece ao placar  ·  Onda C
- **Prova:** 24 eventos desde 01/09: 4 aplicados (3 com remendo manual), 5 W.O., 3 nenhum; PRD-138 TASK-001:
  US$ 0,17 e 3 min por 0 diffs aplicáveis; qwen3-coder-next 1,74 M tokens de entrada para packet de 104 KB
  (loop `--tools` reenvia o contexto e o provedor cobra tudo) e 0/5 vitórias, 5/5 inaplicáveis — a régua do
  placar marca "candidato a sair" e o pool não remove.
- **Proposta:** (a) `harness-duelo.sh`: `git apply --check` do diff A em worktree temporário ANTES de pagar B e
  o juiz; A inaplicável → tenta B; os dois → `nenhum` sem juiz; (b) `--tools` com teto de 4 turnos e prompt
  caching quando o provedor tiver, senão tools off para o modelo; (c) `Duelo: sim` só passa no `--check` com
  ≤ 2 alvos de produção e sem arquivo novo (a matriz sabe); (d) roteamento pelo placar REMOVE o modelo que
  cruza a régua (hoje rebaixa) — `harness-duelos.jsonl` `ev:pool` com `removido`; (e) painel: custo por diff
  aplicado, por modelo.
- **Arquivos:** `hooks/harness-duelo.sh`, `hooks/harness-delegate.sh`, `hooks/duelo-aplicar.mjs`,
  `hooks/task-packet.sh --check`, `hooks/harness-dashboard.mjs`.
- **Aceite:** 10 duelos seguintes: custo por diff aplicado < US$ 0,05; 0 duelos com 2 diffs inaplicáveis pagos.
- **Esforço:** M.

### 19 — Contrato mecânico único injetado pelo packet; persona no `.md`; sem browser pane em dedalo/ariadne  ·  Onda D
- **Prova:** 12 agentes / 1.786 linhas; bloco "Ferramenta certa para LER" repetido 9×, "classificador
  indisponível" 3×, "teto de fôlego" 2× com números diferentes (60 × 80/120 × p90 real 121–125), "dois
  níveis" 3×, "lint do projeto" 2×, "invariantes" 3×; beholder manda "ler TODOS os documentos + 3 templates" e
  hefesto "Perfil primeiro" enquanto o guard exige packet ("não leia Perfil/PRD inteiros") — leitura em dobro.
  `dedalo` e `ariadne` ainda têm `mcp__Claude_Browser__*`/`mcp__Claude_Preview__*` (a armadilha que travou o
  michelangelo 2× por 10 min; a 3.4.20 tirou só dele).
- **Proposta:** `.claude/contratos/CONTRATO-<papel>.md` (leitura via Read/Grep/Glob — agora enforçado pelo
  guard, dizer isso —, fôlego (item 7), temporários, classificador, dois níveis, Edit-first, lint, invariantes)
  anexado pelo `task-packet.sh`/`prd-packet.sh`/`review-packet.sh` (uma seção "Contrato" no topo do packet);
  o `.md` do agente fica com persona + lentes + formato de retorno (alvo −40% de linhas). Remover as
  ferramentas de pane de dedalo/ariadne (Playwright CLI é o canônico). Alinhar beholder/hefesto/michelangelo ao
  regime de packet ("seu contexto está no packet; abra o Perfil só se um achado exigir"). `harness-sync.sh`:
  `contratos/` entra em CORE_DIRS; `CORE_AGENTS` inalterado.
- **Arquivos:** `agents/*.md` (12), `.claude/contratos/*` (novo), `hooks/task-packet.sh`, `hooks/prd-packet.sh`,
  `hooks/review-packet.sh`, `harness-sync.sh`, `harness-doctor.sh` (checa contratos), `.codex/agents/*.toml`
  (paridade Codex — `gen-adapters.sh`).
- **Aceite:** diff dos agentes só remove mecânica; uma exec e uma criação reais sem regressão de 🔴; dashboard
  por agente sem aumento de turnos.
- **Esforço:** M/alto — última onda, com Charles por perto.

---

## 4. Decisões que só o Charles toma (perguntar antes)

1. Bump de cada onda (PATCH).
2. Item 13 (gate c1 em Sonnet no preset dele) — muda o gate de qualidade do Mariana/Caronte.
3. Item 18 (a) — `AskUserQuestion` na allowlist versionada dos projetos.
4. Item 14/7 — hermes acima de 120 e executores acima do teto passam a ser NEGADOS (não avisados).
5. HVCI/Defender no PC (ONBOARDING 3.4.21) — ação dele; medir `spawn` antes/depois.
6. `HARNESS_FRENTES_MAX` no PC (1 hoje) — quando quiser 2 execs simultâneas conscientemente.

## 5. Como fechar cada onda (checklist)

- [ ] Suíte `tests/t-<versão>-*.mjs` verde (sandbox próprio; `USERPROFILE/HOME` falsos; nunca o `~/.harness-run` real).
- [ ] `bash -n` nos `.sh`; `node --check` nos `.mjs`; nada de GNU-ism novo (`find -printf`, `sed -i` sem sufixo, `${x,,}`).
- [ ] CHANGELOG (o que + por quê + números) e ONBOARDING §C (decisões do dev; nada = dizer "nada a decidir").
- [ ] `harness.env` com knobs comentados; tudo ligado por padrão.
- [ ] `harness-sync.sh --check` nos 3 projetos do Charles → `--apply`; `harness-replica-sync.sh --apply` nas 2 réplicas (`difere=0`).
- [ ] Commits: repos do Charles = `git add -A` + push (Mariana = deploy prod pelo CI); réplicas = tudo; vault = tudo.
- [ ] `/deus` nos demais projetos só quando ele mandar; clones do Taurus via `/propagar`.
- [ ] Uma criação e uma exec reais medidas depois (telemetria compara antes/depois — `tests/analise/por-dev.js`).

## 6. Scripts de análise versionados (`tests/analise/`)

Usados na análise de 04/09; rodam em qualquer máquina com Node ≥ 18 (`HARNESS_BASE` = pasta-pai dos projetos;
default `C:/laragon/www` — no Mac `HARNESS_BASE=/Applications/MAMP/htdocs`):

| Script | O que faz |
|---|---|
| `runs.js <jsonl…>` / `runs2.js <jsonl…>` | tabula linhas de `harness-runs.jsonl`/`runs/*.jsonl` por versão (dur, ativa, tasks, ciclos, sub, par, tokens, gates, hermes, waitH, perm, extra) |
| `por-dev.js` | agrega por dev/máquina (f1/f2/exec medianos, perm, negações, preset, spawn, codex, lixo > 12 h) em todos os repos sob `HARNESS_BASE` |
| `agents-tail.js` | varre `~/.claude/projects/*/subagents/*.jsonl` da janela: duração, turnos, Bash × Read por papel + cauda longa |
| `bash-cmds.js` | classifica os comandos Bash dos subagentes (leitura pura × execução) por papel |
| `deleg.js <jsonl> [desde]` · `duelos.js <jsonl> [desde]` | resumo de `harness-delegations.jsonl` / `harness-duelos.jsonl` |

Dashboard oficial continua sendo `node .claude/hooks/harness-dashboard.mjs --all --base=<HARNESS_BASE> --de=… --ate=…`.

## 7. Estado ao gerar este plano (05/09, 02:00)

- 3.4.21 publicada: vault `597e1a2`, Mariana `146a2761` (main, CI de prod), Caronte `15e4d0f`, universitarias
  `ac5b333`, equipe-tefnet `42c5bbe`, base-conhecimento `7a05e9c`. Réplicas `difere=0`.
- Daemon ativo no PC (porta 47831); marcadores nos 3 projetos. Sessões abertas antes da publicação seguem com
  o settings antigo (node direto) até reabrir.
- 14 projetos ainda na 3.4.10 (aguardam `/deus`); clones do Taurus 2.8.0–3.1.0 (aguardam `/propagar`).
- Codex do Charles em limite até 07/09; do João até 09/09.
- Análise completa: `prds/ANALISE-TELEMETRIA-2026-09-04.md`.
