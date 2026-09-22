# Análise de telemetria do harness — semana de 09 a 11/09 (Charles + equipe) + 5 melhorias

> **Data:** 2026-09-11 (segunda passada, 23:10 — a primeira, às 22:30, leu clones locais desatualizados e
> errou o quadro da equipe; esta versão a substitui inteira).
> **Método:** `git fetch --all` + `pull --ff-only` em 34 repos com harness (5 atualizaram: bonifica 14
> commits, meuanuncio-api 16, ric-tur-frontend 51, sagittarius 9, 3s-regulacao 2; ric-tur-backend e
> clinica-revallie recusaram o pull por arquivos locais e foram lidos direto das branches remotas). A
> telemetria foi **unida de todas as branches remotas + working tree** de cada repo (`git cat-file --batch`),
> não só da branch local: 416 runs, 1.241 tasks, 20 incidentes. Commits contados com `git log --remotes
> --since=2026-09-09T00:00-03:00`, sem merge, únicos por hash.
> **Recorte pedido:** produção da equipe de quarta 09/09 a sexta 11/09; runs com `harness ≥ 3.4.34`.
> **Escrita:** só este arquivo.

---

## 0. Veredito

**A equipe produziu muito e o harness mediu pouco dela.** De quarta a sexta: 5 devs, 339 commits de produto
sem merge, 65 runs do harness — mas **56 dos 65 runs são de 3 pessoas** (Charles 37, Giovanny 10, João 9,
Derick 9) e **a Débora tem 51 commits e zero linha de telemetria em qualquer branch dos dois repos dela**.
Os runs `≥ 3.4.34` continuam sendo só os do Charles (8: PRD-142, PRD-015 e LOTE-023): a equipe recebeu a
3.4.34 pelo `/deus` de 11/09 e os runs dela nesta janela estão nas 3.4.19–3.4.30. **Saúde:** nenhum bloqueio
estrutural — mas três atritos claros e mensuráveis: rodadas de *fix* depois da exec (Charles), prompts de
permissão (João) e telemetria que não chega ao git (Débora, e em menor grau todos).

## 1. Commits por dev — quarta 09/09 00:00 → sexta 11/09 23:00 (todas as branches remotas, sem merge)

| Dev | Commits | Por dia (09 · 10 · 11) | Onde | Merges |
|---|---|---|---|---|
| **Charles** | **218** | 91 · 77 · 50 | vault 77 · Mariana core 52 (PRD-142, DT-589; contados via clone) · Sagittarius 31 (LOTE-023, DT-214/215/216, RBAC) · réplicas do harness 31 · Caronte 7 (PRD-015) · api-sagittarius 4 · 20× `harness: sync v3.4.34 (via DEUS)` | 5 |
| **Débora** | **51** | 17 · 21 · 13 | ric-tur-frontend 41 (LOTE-015, DT-061, manual vivo do Abastecimento) · ric-tur-backend 10 (DT-047, auditoria de abastecimento) | 4 |
| **Giovanny** | **31** | 18 · 13 · 0 | newportaltefnet 17 (PRD-125, DT-172/173/174, carta-alerta) · bonifica-pedidos 14 (primeiro-boleto) | 5 |
| **João Neto** | **26** | 13 · 3 · 10 | newportaltefnet 26 (PRD-119/120, DT-159/163/176, remoção de senha de 14 docs) | 1 |
| **Derick** | **13** | 1 · 10 · 1 (+1 de 08/09) | sistema-vs 9 (CI/deploy) · 3s-regulacao 2 (PRD-063) · meuanuncio-api 1 (PRD-091) · newportaltefnet 1 (PRD-121) | **13** |

Leitura: o Derick trabalha por merge request (13 merges para 13 commits); a Débora e o Giovanny por commits
diretos na `developer`/`main`. Dos 218 do Charles, ~90 são produto (Mariana, Sagittarius, Caronte) e o resto é
vault, harness e sync.

## 2. Produção no harness desde 09/09 — 65 runs

| Dev | Runs | Versões | O que rodou | Fase 2 (min) | Exec ativa (min) | Paralelo na exec | Prompts | Negações | Review |
|---|---|---|---|---|---|---|---|---|---|
| Charles PC + Mac | 37 | 3.4.20 → 3.4.34 | PRD-140 (+fix), 141 (+fix), 142; Caronte PRD-015; Sagittarius LOTE-016…023, PRD-115, 2 sweeps | 52 · 66 · 86 · 109 | 244+102 · 221+143 · 112 · 146 · **228 (LOTE-023, 2 tasks)** | 1,30 · 2,25 · 2,10 · 2,29 | 9 | 2 | solo-2 (Codex config) / dupla no Mac |
| Giovanny | 10 | 3.4.19 → 3.4.30 | PRD-119, 120, 123, 124 (LEVE), 1 mockup | 46 · 81 · 58 | 158 · 163 | 1,29 · 1,48 | 4 | 2 | n/d (versão sem campo) |
| João Neto | 9 | 3.4.19 | PRD-119, 120, LOTE-023, triagem DT-163 | **23 · 28** | 60 · 93 · 34 | 0,82 · 1,83 | **46** | 1 | n/d |
| Derick | 9 | 3.4.20 → 3.4.25 | sistema-vs PRD-013, 014 (LEVE); meuanuncio PRD-091 | 73 · 58 · 45 | 139 · 88 · 76 | 1,33 · 1,28 · 1,31 | 3 | 0 | **dupla** (Codex ok) |
| Débora | **0** | 3.4.28 (master) | LOTE-015, DT-047/061 pelos commits — sem run gravado no git | – | – | – | – | – | – |

O que salta:

- **João Neto cria uma PRD de 7–10 tasks em 23–28 min de fase 2** (Charles: 52–109; Derick 45–73; Giovanny
  46–81). Preset econômico, sem dedalo, hermes curto. Qualidade dessa criação não está medida (versão 3.4.19
  não grava `vermelhos` nem `review_modo`) — é o primeiro ponto a comparar quando ele rodar na 3.4.34.
- **As rodadas de fix são o custo escondido do Charles:** PRD-140 exec 244 min + fix 102; PRD-141 exec 221 +
  fix 143 (+60% do tempo); LOTE-023 no Sagittarius: 273 min de parede para **2 tasks** com "rodada extra de
  correção após o ciclo 2". Na 3.4.34 (gate de acceptance + costura por onda) **PRD-142 e PRD-015 não
  precisaram de fix** — 2 de 2. É a evidência mais importante da semana.
- **Paralelismo:** Charles na 3.4.31+ roda a exec a 2,1–2,3 (pipeline com `vivos_max` 3–4); a equipe,
  nas 3.4.19–3.4.25, fica em 1,3. A 3.4.34 chegou nos repos deles hoje — o fator deles na próxima semana
  diz se o ganho é do harness ou da máquina.
- **Derick é o único com dupla-cega funcionando** (`review_modo=dupla` em 2 de 3 execs). No Charles, 100%
  `solo-2` por config do Codex (`gpt-6-astra`) — **corrigido hoje na 3.5.2 do mestre** (o harness passa
  `--model` explícito). Giovanny e João não têm o campo (versão antiga).
- **Permissão:** João pagou 46 prompts em 9 runs (12 e 16 numa exec); os outros 3–9. Regras de allowlist
  faltando na máquina dele.

## 3. O que a 3.4.34 mediu (8 runs, só Charles, 11/09)

| Run | Preset | Parede / ativa | Tasks · ciclos · sub | Paralelo | tok_out sessão + sub | Gates | Nota do próprio run |
|---|---|---|---|---|---|---|---|
| Mariana PRD-142-fase1 | equilibrado | 27 / 23 | – · 0 · 10 | 0,97 | 435 k + 60 k | – | votação 3/3; codex indisponível |
| Caronte PRD-015-fase1 | máximo | 42 / 38 | – · 0 · 7 | 0,84 | 1,09 M + 54 k | – | 4 caches inválidos; fatia -b pela pai |
| Mariana PRD-142-fase2 | equilibrado | 86 / 85 | 9 · 2 · 5 | 0,68 | 1,15 M + 248 k | 38 | pré-gate 5 🔴; corte 11 → 9 tasks |
| Caronte PRD-015-fase2 | máximo | 109 / 109 | 9 · 2 · 21 | 1,56 | **4,95 M** + 615 k | 52 | cortes -b/-c; aceite pré-assinado (usuário ausente) |
| Mariana PRD-142-exec | equilibrado | 112 / 112 | 9 · 2 · 16 | **2,10** | 456 k + 974 k | 83 | acceptance 24/24 + regressão 78/78; **sem fix** |
| Caronte PRD-015-exec | máximo | 187 / 146 | 7 · 3 · 25 | **2,29** | 1,73 M + 1,34 M | **160** | suíte 1.100 testes/1 worker = 52 min; c1 9 bloqueantes; 33 falhas pré-existentes; **sem fix** |
| Sagittarius LOTE-023 (Mac) | equilibrado | **273 / 228** | 2 · 2 · 12 | 0,86 | 556 k + 641 k | 77 | 1 grupo único (arquivo compartilhado); rodada extra pós-ciclo 2 |
| Sagittarius `_auto-dt-exec` | – | 0 | – | – | 17 k | – | wakeup duplicado do LOTE-023 (ruído) |

- Tasks ≥ 3.4.34: 285 linhas. hefesto p50 12–22 min (máx 26), 0 estouradas; **dedalo Caronte p50 23 min,
  102 turnos (máx 159), 3 de 6 sem ✅** e o único incidente de fôlego da janela (91 > 90).
- Campos que nascem vazios em 8 de 8 runs: `codex`, `limitou` (o texto está no `extra`), `stalls`.
- Custo a investigar: fase 2 do Caronte com 4,95 M tokens de saída na sessão principal (4× o Mariana para as
  mesmas 9 tasks; coerente com o `out_tps_all` de 850, então não é erro de soma).

## 4. Saúde — furos encontrados (com dono)

1. **Telemetria que não chega (Débora, 100%; todos, em parte).** Os dois repos da Débora não têm
   `prds/_metrics/` em nenhuma branch, com 51 commits na semana e o harness 3.4.28 instalado (que já faz o
   `git add` das runs no `stop`). Causa mais provável: **commit escopado** (`git commit <caminhos>`) — a regra
   da casa para a equipe — ignora o que o `stop` deixou staged. O mesmo explica runs "nunca commitados" que o
   doctor 3.5.0 passou a acusar. Sem isso, o painel da equipe é o painel de quem lembra de incluir o arquivo.
2. **Rodadas de fix (Charles):** 2 das 3 execs de PRD desta semana antes da 3.4.34 reabriram (+245 min); 0 das
   2 na 3.4.34. Precisa de uma semana a mais para virar conclusão, mas é o efeito esperado dos tetos da PRD-141.
3. **Suíte de testes inteira dentro da exec** (Caronte: 52 min em 1 worker; 33 falhas pré-existentes de
   ambiente re-triadas a cada review).
4. **Prompts de permissão (João: 46 em 9 runs).**
5. **dedalo:** 9 dos 20 incidentes de fôlego da semana; no Charles 11 de 37 tasks de dedalo saíram PARCIAL
   (30%), p50 18 min, máx 56 min. No Derick 6 de 11 ✅.
6. **Painel mente por omissão:** `codex`/`limitou`/`stalls` vazios; `status` vazio em papéis sem contrato
   (hermes, discovery) conta como "não-✅"; 15 marcadores órfãos neste PC (meuanuncio 9 × 166 h, Caronte
   `PRD-1642` de rótulo falso, aec 861/1.014 h) + `site-allyson PRD-002-exec` fechado com **25 dias** de parede.
7. **Codex config inválida** — resolvido hoje (3.5.2); a evidência de que voltou é `review_modo=dupla` nas
   próximas execs do Charles.

## 5. As 5 melhorias (revistas com os dados reais)

### M1 · Observabilidade — a telemetria tem que chegar, e o painel tem que ser fiel
- **Commit escopado leva a telemetria junto:** o `stop` já imprime `GIT_STAGED`; as skills (`/prd`,
  `/prd-exec`, `/dt-exec`) passam a **incluir esses caminhos no comando de commit sugerido** (o dev copia e
  cola) e o relatório final ganha a linha "telemetria: N arquivo(s) no stage — vão no commit". O doctor 3.5.0
  já acusa "nunca commitado"; o `/deus` e o `/prometeu --check` passam a mostrar por dev **runs locais × runs
  no git** e a Débora (0/51) aparece na primeira rodada.
- **Campos derivados no `stop`:** `codex` da última linha de preflight em `delegations/`, `limitou` extraído
  do `extra`, `stalls` dos marcadores `.harness-run/stall/`; `status` de papel sem contrato vira `n/d`.
- **Marcadores:** SessionStart arquiva marcador > 24 h em `.harness-run/expirados/`; `stop` de marcador > 12 h
  grava `suspeita=1`; `metrics-auto` recusa número fora do intervalo do projeto.
- **Prova:** Débora com runs no git em 1 semana; `codexOk` deixa de ser 0/0; alertas "run aberta/suspeita" → 0.

### M2 · Velocidade — testes na exec: specs da PRD + smoke; suíte inteira no noturno/CI; baseline de falhas
- Caronte PRD-015-exec: 160 de 187 min em gates, 52 min só na suíte completa em 1 worker, 33 falhas
  pré-existentes triadas de novo.
- Acceptance da exec = specs da PRD + `@smoke`; suíte completa no noturno (3.4.1) e no CI;
  `HARNESS_TEST_WORKERS` (CPU/2) com banco por worker onde `HARNESS_WT_DB=clone`; `tests/BASELINE-FALHAS.md`
  por ambiente, descontado pelo sherlock (informativo, não bloqueante).
- **Prova:** gates ÷ parede ≤ 50%; exec ativa do Caronte de 146 para ≤ 100 min.

### M3 · Velocidade (equipe) — zero prompt de permissão por run, allowlist entregue pelo `/deus`
- João: 46 prompts em 9 runs (12 e 16 numa exec). Cada prompt é parede parada.
- O `/deus` e o `/prometeu` entregam o `--gen-allowlist` do doctor por máquina no fim do sync (regra
  estreita pronta para o `settings.local.json`); painel com prompts/run e negações/run por dev, meta ≤ 1; o
  `denied` versionado (3.5.0) lista os 10 comandos mais negados por dev.
- **Prova:** prompts/run do João < 1 na próxima semana.

### M4 · Qualidade — task de front dimensionada e PARCIAL que não passa
- dedalo: 9 de 20 incidentes de fôlego; Charles 11/37 tasks PARCIAL, p50 18 min, máx 56; Derick 6/11 ✅ com
  tasks menores (p50 20 min, 136 turnos).
- Régua na `/prd` e no `task-packet --check`: task de front = 1 tela ou 1 componente, ≤ 4 arquivos, ≤ 150
  linhas; acima é GRANDE e não despacha. Packet do dedalo com mockup/DS resumido. Task PARCIAL de dedalo
  reabre a onda e entra em `tasksAcima`.
- **Prova:** dedalo p90 < 20 min, PARCIAL < 10%, 0 fôlego em 2 semanas.

### M5 · Qualidade + velocidade — medir e zerar as rodadas de fix; validar a 3.4.34 na equipe
- Métrica nova no painel: **`fix_runs`** por PRD (rótulos `-exec-fix`) e "minutos de fix ÷ minutos de exec",
  com meta 0. Hoje: PRD-140 +42%, PRD-141 +65%, PRD-142 0, PRD-015 0.
- Regra: ciclo 1 do review com ≥ 6 bloqueantes (Caronte teve 9) **pausa a exec e reabre a técnica** em vez de
  virar 3 ciclos + fix; o gate de acceptance e a costura por onda (3.4.34) ficam obrigatórios em toda exec.
- **Validação na equipe:** com todos na 3.4.34 desde hoje, comparar na próxima semana fase 2 (João 23–28 vs
  Charles 86–109), paralelismo da exec (1,3 → ≥ 2) e `review_modo=dupla` (Derick como referência; Charles
  com a 3.5.2). Se o João mantiver 25 min de fase 2 **com** `vermelhos` baixos no gate, o preset econômico
  vira o default recomendado da criação.

## 6. Régua da próxima semana (`/harness-report --all --periodo=7d`, com `git pull` antes)

| Métrica | Esta semana | Meta |
|---|---|---|
| Devs com runs no git / devs ativos | 4 / 5 (Débora 0) | 5 / 5 |
| Runs ≥ 3.4.34 da equipe | 0 | ≥ 1 por dev |
| Fix runs ÷ execs (Charles) | 2 / 5 (0 / 2 na 3.4.34) | 0 |
| Fase 2 (7–10 tasks) | João 23–28 · Derick 45–73 · Giovanny 46–81 · Charles 52–109 | ≤ 60 |
| Exec ativa (7–10 tasks) | 60–244 | ≤ 100 |
| Paralelo na exec (equipe) | 1,3 | ≥ 2 |
| Prompts/run (João) | 5,1 | ≤ 1 |
| `review_modo=dupla` (Charles) | 0% | ≥ 80% |
| Incidentes de fôlego (dedalo) | 9 | 0 |
| Marcadores órfãos neste PC | 15 | 0 |
