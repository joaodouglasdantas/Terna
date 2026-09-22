# Análise de telemetria do harness — 3.4.5 → 3.4.10: onde piorou, e se é o modelo

> **Data:** 2026-09-01 (análise entre 20:39 e ~21:50; a PRD-011 do Caronte saiu do planejamento às 20:33 e entrou em exec às 20:51).
> **Recorte principal:** harness ≥ 3.3 (23/08/2026 em diante — a partir daí a telemetria carrega o campo `harness` e o schema 2.14). O histórico anterior (jun–ago) aparece só como contexto, marcado.
> **Pergunta central:** subimos da 3.4.5 para a 3.4.10; o que ficou mais lento é o harness ou são os modelos?
> **Escrita:** só este arquivo. Nada em skills, hooks, env ou git.

---

## 0. Resumo executivo

1. **Não é o modelo.** A latência por turno dos subagentes é a mesma desde julho: Sonnet 5 responde em 4,3–5,6 s por turno em todos os dias de 23/08 a 01/09 (5–8 s em julho); Opus 5 em 6,7–8,0 s (8–10 s em julho). Por agente, entre a era 3.4.3 e a 3.4.10, a diferença é ≤ 1,5 s/turno (beholder 7,8 → 8,8; hefesto 4,9 → 5,2; dedalo 4,8 → 5,0; atlas 4,8 → 4,5). Output por turno também estável (400–650 tokens).
2. **A fase 2 da `/prd` ficou 2,3× mais lenta na 3.4.10** (mediana ativa 86 min na 3.4.3 e 43 na 3.4.8 → 201 na 3.4.10, n=3). Causa medida: o `hermes` (Modo E + Modo C), o pré-gate e o dedalo Modo P mais longo. Onde a pai escrevia as 10 tasks em 5–9 min, o hermes leva 17–22 min e escreve tasks **2,6× maiores** (média 133–177 linhas por task até a 3.4.8 → 371–403 na 3.4.10), porque o agente manda "preencher TODAS as camadas do template". Onde a pai/dedalo corrigia um ciclo em 5–12 min, o hermes Modo C leva 27–47 min (398 turnos, 92 Read + 92 Edit). E como a pasta da PRD dobrou (134–257 KB → 335–425 KB), cada passada de gate também ficou 30–70% mais longa.
3. **A fase 1 não piorou na mediana (89 → 58 min) mas mudou de forma:** a votação leva tudo a COMPLETO (3 de 3 hoje, coincidindo com a proposta da pai) e o atlas passou de 5–16 min para 17–29 min (45–97 turnos → 96–130), sendo o caminho crítico em 3 de 3.
4. **A exec não regrediu** (3.4.3 mediana 240 min, 3.4.5 233, 3.4.8 179, 3.4.10 246; 18–32 min por task em todas). A lentidão da exec é estrutural e anterior: cauda serial (spec de acceptance 36–68 min com um só hefesto na 3.4.3, 52 min na 3.4.10), cadeia de dependências e revisor externo.
5. **A promessa de tokens do hermes não se realizou:** o motivo declarado na 3.4.10 era tirar da pai o maior output da criação (`tokens_total` de 832 M na PRD-125-fase2). Na prática, `tokens_total` da pai na fase 2 foi de 58–121 M (3.4.3) e 64 M (3.4.8) para 48–149 M (3.4.10), e o dos subagentes de 39–80 M para 162–288 M. A criação inteira saiu de 0,9–1,2 M tokens de output para 1,2–1,5 M.
6. **Caronte × Mariana:** preset `maximo` (3 ciclos base, Opus, Codex high) em 100% das linhas do Caronte, técnica maior (2.214 linhas) e mais paradas humanas. Hoje o Caronte perdeu 190 min por token OAuth expirado no meio do hermes, sem nenhum hook reagir.
7. **O que fazer primeiro:** devolver o tamanho das tasks ao patamar da 3.4.8 (o hermes Modo E com teto de camadas/linhas), trocar o hermes Modo C por patch em lote (ou pela pai, como na 3.4.8), e reorganizar o laço de gates (corrigir por gate assim que ele volta, confirmação só sobre o diff). Isso devolve 60–100 min por fase 2 sem mexer em modelo nem em número de gates.

---

## 1. Fontes, método e filtros

| Fonte | Linhas | Como foi lida |
|---|---|---|
| `dra-mariana-duarte/prds/_metrics/harness-runs.jsonl` + `runs/*.jsonl` (+ worktree `--wt-prd-salas`) | 377 brutas → **278 únicas** (dedup por `label`+`ts_end`); **recorte ≥ 23/08: 51 linhas** (Mariana 46, Caronte 5) | Python; descartadas linhas com `elapsed_s < 120` e a `PRD-134-exec` corrompida (9.565 min; parede real 323 min medida no transcript). |
| `caronte/prds/_metrics/harness-runs.jsonl` + `runs/` | 25 (5 no recorte) | idem. Caronte não tem `harness-delegations.jsonl` (roteamento `off`). |
| `harness-delegations.jsonl` (Mariana + worktree) | 190 → **186 únicas**, 4 inválidas | Por papel, executor, status, duração e tokens. |
| Transcripts (`~/.claude/projects/...`) | 6 sessões de hoje + 9 sessões da era 3.4.2–3.4.8 (PRD-126/129/130/131/132 criação, PRD-130/131 exec) + varredura de todos os subagentes desde 23/08 (**418 subagentes**, 750 de antes como controle) | Parser próprio: gaps, janela por subagente, "esperando modelo" × "esperando ferramenta" por turno, tokens de `usage`. |
| `prd/SKILL.md`, `prd-exec/SKILL.md`, `agents/hermes.md`, `TEMPLATE-TASK.md`, CHANGELOG 3.3.0–3.4.10 | — | Lidos por um subagente e conferidos nos trechos citados. |

**Eras usadas nas comparações:** `3.4.2/3.4.3` = 23–27/08 (PRD-125 a 131), `3.4.5` = 27–28/08 (só PRD-130-exec), `3.4.8` = 28–31/08 (PRD-132, lotes), `3.4.10` = 31/08 23:00 em diante (PRD-133, 134, Caronte 011).

**Avisos de dado:** (a) os transcripts de 26–27/08 registram `output_tokens` de 1–9 por turno nos subagentes (PRD-130/131: beholder com 108 turnos e 702 tokens) — sub-registro do host, não do agente; por isso as comparações entre eras usam **turnos e minutos**, nunca tokens de subagente daquele dia; (b) hoje rodaram 2–3 sessões autônomas ao mesmo tempo no mesmo PC; (c) Codex e Ollama não têm transcript.

---

## 2. A transição 3.4.5 → 3.4.10, número a número

### 2.1 Telemetria por versão (Mariana + Caronte, 23/08 → 01/09)

| Fase | 3.4.2 (23/08) | 3.4.3 (24–27/08) | 3.4.5 (27/08) | 3.4.8 (28–31/08) | 3.4.10 (31/08–01/09) |
|---|---|---|---|---|---|
| **fase1** parede / ativa (min) | 62 (PRD-126) | 24 · 35 · 143* · 167** → med **89** | — | 34 ativa (PRD-132) | 46 · 58 · 109 (79 ativa) → med **58** |
| **fase2** parede / ativa | 106 (126+127 juntas) | 60 · 86 ativa · 170** → med ativa **86** | — | **43** (PRD-132) | 146 · 201 · 392 (202 ativa) → med ativa **201** |
| **exec** parede | 266 | 176 · 201 · 279 · 288 → med **240** | 233 | 179 | 246 (PRD-133) · 323 real (PRD-134) |
| min por task na exec | 30 | 18 · 20 · 29 · 31 | 29 | 20 | 25 · 32 |
| subagentes na fase2 | 8 | 4 · 7 · 8 | — | 4 | 9 · 10 · 12 |
| ciclos de gate na fase2 | 3 | 2 · 3 · 3 | — | 3 | 3 · 3 · 3 |
| `parallel_factor` fase2 | 1,69 | 1,00 · 0,99 · 1,15 | — | 0,84 | 1,08 · 1,12 · 1,35 |
| `out_tps_all` fase2 | 143 | 45 · 54 · 149 | — | 137 | 42 · 96 · 107 |
| `tokens_total` fase2 pai / subagentes (M) | 88 / 65 | 58/45 · 64/55 · 121/80 | — | 64 / 39 | 48/174 · 97/288 · 149/162 |
| output fase1+fase2 por PRD (pai+sub, k) | 1.167 | 466 · 765 · 1.288 | — | 484 | 1.232 · 1.378 · 1.434 |

\* PRD-130-fase1 inclui a fase 2 (a pai não fechou o `stop` da fase 1). \*\* PRD-128 com 35–97 min de gap ocioso.

Leitura: **a fase 2 é a regressão** (43–86 → 146–202 min ativos, 2,3–4,7×); fase 1 e exec ficaram no mesmo patamar. E o custo em tokens subiu junto com o tempo — não houve troca "mais tempo por menos token".

### 2.2 Harness ou modelo? Latência por turno dos mesmos agentes

Segundos por turno **esperando o modelo** (do `tool_result` até a resposta seguinte), agregados por dia sobre todos os subagentes daquele dia:

| Dia | Sonnet 5 (turnos) | Opus 5 (turnos) |
|---|---|---|
| 19–31/07 (controle) | 3,3–12,8 (mediana ~6,8) | 6,1–10,2 |
| 02–20/08 (controle) | 4,5–7,6 | 6,2–10,3 |
| 23/08 (3.4.2) | 5,6 (4.342) | 6,7 (213) |
| 24/08 (3.4.3) | 4,7 (4.375) | 6,7 (345) |
| 25/08 | 5,0 (7.537) | 7,3 (521) |
| 27/08 (3.4.3/3.4.5) | 5,4 (4.598) | 7,2 (969) |
| 28/08 (3.4.8) | 4,3 (2.484) | — |
| 31/08 | 5,2 (2.525) | 8,0 (157) |
| **01/09 (3.4.10)** | **5,6 (8.760)** | **7,9 (2.358)** |

Por agente e modelo, era 3.4.2/3.4.3 → 3.4.10 (s/turno modelo · turnos por execução · minutos por execução):

| Agente | Modelo | 3.4.2/3.4.3 | 3.4.10 | Δ s/turno |
|---|---|---|---|---|
| beholder | Opus | 7,8 · 58 · 22,3 min (n=6) | 8,8 · 74 · 18,4 (n=5) | +1,0 |
| beholder | Sonnet | 9,3 · 46 · 10,9 (n=14) | 8,3 · 58 · 10,2 (n=7) | −1,0 |
| michelangelo | Opus | 7,6 · 90 · 16,1 (n=8) | 8,9 · 75 · 19,6 (n=5) | +1,3 |
| michelangelo | Sonnet | 6,7 · 50 · 12,2 (n=20) | 7,1 · 66 · 13,4 (n=5) | +0,4 |
| hefesto | Sonnet | 4,9 · 97 · 14,5 (n=79) | 5,2 · 108 · 16,1 (n=29) | +0,3 |
| dedalo | Sonnet | 4,8 · 111 · 16,8 (n=49) | 5,0 · 141 · 22,7 (n=13) | +0,2 |
| sherlock | Opus | 6,4 · 96 · 22,9 (n=7) | 8,0 · 76 · 13,3 (n=2) | +1,6 |
| sherlock | Sonnet | 4,9 · 75 · 9,8 (n=33) | 6,3 · 75 · 8,2 (n=7) | +1,4 |
| atlas | Opus | 4,8 · 71 · 11,0 (n=2) | 4,5 · 130 · 23,5 (n=3) | −0,3 |
| tony-stark | Opus | 6,9 · 33 · 3,7 (n=3) | 10,2 · 36 · 6,4 (n=3) | +3,3 (n pequeno) |
| hermes | Opus / Sonnet | não existia | 7,8 · 107–142 · 16,5–18,0 (n=9) | novo |

Conclusão: a variação por turno é de ±1,5 s (±20%), dentro da oscilação diária de julho e agosto. **O que mudou foi o número de agentes por fase, o número de turnos de alguns (atlas +80%, dedalo +27%) e o tamanho do que eles leem e escrevem.** O `thinking` passou de ~2% do output (antes de 23/08) para 45–72% desde a 3.3.0/3.4.2 — sem efeito visível no tempo por turno, com efeito no custo por token.

### 2.3 Composição da fase 2, era a era

| Bloco | PRD-131 (3.4.3, 60 min) | PRD-132 (3.4.8, 43 min) | PRD-134 (3.4.10, 148) | PRD-133 (3.4.10, 201) | Caronte 011 (3.4.10, 194 sem OAuth) |
|---|---|---|---|---|---|
| dedalo Modo P (+ pré-gate 7.2) | 5,8 | 9,0 | 28,4 (+9,0 pré-gate ∥) | 19,8 (+9,6) | 31,8 (+8,3) |
| Escrever as tasks | **pai, 9 min** | **pai, 5 min** | hermes E 16,9 | hermes E 18,0 + 17,6 de correção pós-amostragem | hermes E 21,5 |
| Gates (beholder + michelangelo, ciclos 1–3) | 30 (17,0 + 7,6 + 5,1) | 21 (10,9 + 4,8 + 5,2) | 46 (18,4 + 17,5 + 10,2) | 44 (19,3 + 19,6 + 4,7) | 75 (27,6 + 38,5 + 8,4) |
| Correções entre ciclos | dedalo R 7,8 | **pai, 5 min** | hermes C 10,2 + 16,2 + 13,9 = **40** | dedalo R 25,1 + hermes C **47,3** = 72 | hermes C 26,8 + pai 3 = 30 |
| Pai (técnica, síntese, snapshots) | ~7 | ~3 | ~8 | ~19 | ~40 (técnica 13, integração 6, patches 21) |
| **Laço gate + correção** | 38 (63%) | 26 (60%) | 86 (58%) | 116 (58%) | 105 (54%) |

O laço sempre foi 55–65% da fase 2; **o que a 3.4.10 fez foi triplicar o valor absoluto** de cada perna: gate 21–30 → 44–75 min, correção 5–8 → 30–72 min, tasks 5–9 → 17–36 min.

### 2.4 Os documentos dobraram — e todo mundo relê tudo

| PRD (versão) | PRD produto | Técnica | Tasks (total / n / média) | Pasta |
|---|---|---|---|---|
| PRD-126 (3.4.2) | 500 | 856 | 1.199 / 9 / **133** | 136 KB |
| PRD-128 (3.4.3) | 450 | 987 | 1.337 / 10 / **133** | 151 KB |
| PRD-129 (3.4.3) | 771 | 1.591 | 2.198 / 14 / **157** | 257 KB |
| PRD-130 (3.4.3) | 580 | 1.705 | 1.419 / 8 / **177** | 212 KB |
| PRD-131 (3.4.3) | 476 | 947 | 1.410 / 10 / **141** | 157 KB |
| PRD-132 (3.4.8) | 413 | 1.038 | 1.482 / 9 / **164** | 133 KB |
| **PRD-134 (3.4.10)** | 651 | 1.291 | 3.712 / 10 / **371** | 335 KB |
| **PRD-133 (3.4.10)** | 608 | 2.128 | 3.753 / 10 / **375** | 395 KB |
| **Caronte 011 (3.4.10)** | 727 | 2.214 | 4.033 / 10 / **403** | 425 KB |

A técnica também cresceu (947–1.705 → 1.291–2.214), mas o salto está nas tasks: **2,6× por task**. Origem: `agents/hermes.md`, Modo E, item 3 — *"Por task, preencha TODAS as camadas do template"*; o `TEMPLATE-TASK.md` tem 274 linhas e 11 seções (metadados, objetivo, arquivos, alterações detalhadas, checklist antes/durante/após, testes manuais, E2E com código de referência, rollback, notas). A pai, até a 3.4.8, preenchia o que a task pedia; o hermes preenche tudo. Consequência em cascata: beholder/michelangelo leem 2,5× mais por ciclo (beholder c1: 11–17 min → 18–28), o hermes C tem 2,5× mais texto para propagar, o `task-packet` da exec carrega tasks maiores (dedalo TASK-006: 555 turnos, 64 min).

### 2.5 Fase 1: votação, atlas e delegação em série

- **Votação (2.0):** 3 votantes Sonnet, 4 min, 15k tokens nas 3 PRDs — barata. Mas nas 3 a maioria foi COMPLETO, igual à proposta da pai (Caronte: MEDIO/COMPLETO/COMPLETO; PRD-133 e 134: COMPLETO). Resultado: frota inteira sempre, atlas com mandato cheio.
- **Atlas:** 5,6 min/45 turnos (PRD-131) e 16,4/97 (PRD-130) na 3.4.3 → 17,4/96, 23,5/130 e 28,6/130 na 3.4.10. Nada mudou no `atlas.md` entre as versões (CHANGELOG não cita atlas desde a 3.1.0): o que muda é o escopo COMPLETO e o tamanho das PRDs vinculantes que ele confere. Em 3 de 3 é o caminho crítico (os outros 5 agentes terminam em ≤ 5–9 min).
- **Codex:** `impacto` via codex falhou em 6 de 17 (35%), 2 de 2 hoje (374 s e 126 s perdidos), sempre com fallback nativo em série. Na PRD-133 as 4 delegações rodaram uma após a outra em `Bash` bloqueante (00:22 → 00:40, 18 min); na PRD-134, em background, 5 min.
- Mediana da fase 1 caiu (89 → 58) porque a era 3.4.3 tinha PRD-128 (35 min ociosos) e PRD-130 (fase 2 dentro). Comparando limpo: PRD-131 24 min e PRD-129 35 min contra 46–58 hoje.

### 2.6 Exec: sem regressão, mesmo gargalo de sempre

| Exec | Versão | Parede | Tasks | Cauda serial (spec de acceptance + fechamento) |
|---|---|---|---|---|
| PRD-131 | 3.4.3 | 241 | 10 | acceptance 36,3 min (1 agente) + TASK-010 14,2 |
| PRD-130 | 3.4.5 | 249 | 8 | acceptance **67,8 min** (361 turnos) + TASK-010 9,0 |
| PRD-132 | 3.4.8 | 179 | 9 | — |
| PRD-133 | 3.4.10 | 246 (272 real) | 10 | TASK-009 19,8 (∥ onda B) + TASK-010 20,9 |
| PRD-134 | 3.4.10 | 323 real | 10 | acceptance **52,5 min** (sozinho) + TASK-010 14,2 + suíte completa descartada 53 min |

Os três itens da 3.4.9 que miravam a exec (retorno em 2 níveis, aplicador enxuto, telemetria do pipeline) não pioraram nada; `parallel_factor` da exec ficou em 1,3–1,6 nas duas eras. A queixa "exec lenta" é verdadeira mas **anterior à 3.4.10**.

### 2.7 O que cada versão adicionou ao caminho crítico da criação (CHANGELOG)

| Versão | Etapa nova na `/prd` | Custo medido hoje |
|---|---|---|
| 3.4.6 | Edit-first (Write negado ≥150 linhas) | hermes C em 398 turnos (Read+Edit trecho a trecho) |
| 3.4.7 | watchdog p90 (avisa, não corta) | dedalo 64 min, hefesto 52 min sem intervenção |
| 3.4.9 | snapshot+diff, estado canônico, stub | neutros ou positivos |
| **3.4.10** | **hermes Modo E** | +8–13 min e tasks 2,6× maiores |
| **3.4.10** | **hermes Modo C** | +20–40 min por rodada de correção |
| **3.4.10** | **pré-gate 7.2** | +8–10 min (parcialmente ∥ ao dedalo) |
| **3.4.10** | **votação 2.0** | +4 min, e leva a COMPLETO |
| 3.4.10 | referência viva só na 1ª PRD | positivo |

---

## 3. Respostas às perguntas originais (a–e)

### a) Para onde vai o tempo — por fase e por papel

**Recorte ≥ 3.3 (n=51):** fase1 mediana 46 min (p25 35, p75 109), fase2 146 (60–201), exec 240 (179–279). Contexto histórico (jun–set, n=278): fase1 22 → 29 → 59 → 52; fase2 37 → 46 → 82 → 174; exec 126 → 288 → 272 → 246 — a criação já vinha subindo antes da 3.3 (2,4× de junho a agosto), e a 3.4.10 deu o salto final.

**Por papel na criação (3 sessões de hoje, 788 min de subagente):** beholder 191 min (24%), hermes 188 (24%), dedalo 105 (13%), ariadne 103 (13%, só Caronte), michelangelo 99 (13%), atlas 70 (9%), tony-stark 20, peter-quill 6, votação 4. Pai (Opus): 48–72 min "esperando o modelo" por sessão; escrever a PRD leva 3–3,5 min e a técnica 3,5–5,5 min.

**Por papel na exec (2 sessões, 785 min):** hefesto 424 (54%), dedalo 239 (30%), michelangelo 63 (8%), sherlock 59 (7%), Codex ~55 min (sem transcript).

Composição por fase: seção 2.3 (fase 2) e 2.5 (fase 1).

### b) Mariana × Caronte

| Fator | Mariana | Caronte | Efeito |
|---|---|---|---|
| Preset (Perfil) | `equilibrado` | **`maximo`** em 25/25 linhas | 3 ciclos base, julgadores Opus no c1, Codex high. Fase 2: 3–6 ciclos (PRD-004 580 min; PRD-009 168 min/5 ciclos). |
| Técnica | 1.291–2.128 linhas | 2.214 | Beholder c2: 38,5 min contra 17,5–19,6. |
| `HARNESS_VERBOSITY` | `minimo` | default | Tetos de palavras 30% maiores. |
| Repo | 7.899 arquivos, 830k LOC | 768 arquivos, 52k LOC | Irrelevante: o atlas fez 84 Bash nos dois. |
| Paradas humanas na criação | 0–2 (7 min) | 3 perguntas + maquete = 37 min + 190 min OAuth | O Caronte é onde o Charles mais interage. |
| Maquete | não | ariadne 2 rodadas (27 + 29 min) | 25% da fase 1. |
| Natureza | features de produto | infra do próprio harness (presença, cron) | Red-team acha 4🔴 no c1 (Mariana 1–2). |

Mesma versão, mesma máquina: **é configuração (preset), documento (técnica maior) e operador (paradas)**, não o código-base.

### c) Trabalho real vs. espera

| Projeto/fase (schema 2.14) | n | parede | ativa | ociosa | gap com subagente vivo | `parallel_factor` mediano |
|---|---|---|---|---|---|---|
| Mariana fase1 | 21 | 4.920 | 1.380 | 3.538 (72%, sessões abertas) | 171 | 0,80 |
| Mariana fase2 | 18 | 2.750 | 1.674 | 1.074 (39%) | 318 | 1,14 |
| Mariana exec | 23 | 5.734 | 5.186 | 541 (9%) | 2.072 (40% da ativa) | 1,44 |
| Caronte fase2 | 4 | 711 | 522 | 189 (27%) | 236 (45% da ativa) | 0,95 |

Serialização evitável, com evidência: (1) o hermes C só parte quando o beholder volta, 6–8 min depois do michelangelo (6 de 6 ciclos); (2) correções em série (PRD-134: 3 hermes seguidos, 40 min sem outro agente); (3) ciclo 3 com zero 🔴 em 3 de 3 (5–10 min cada); (4) atlas sozinho no fim do discovery (24 min no Caronte); (5) codex em `Bash` bloqueante (18 min na PRD-133) e fallback serial após falha; (6) cauda da exec com um agente (36–68 min); (7) suíte completa competindo com 6 agentes (PRD-134: 53 min descartados + 30 min triando falhas alheias); (8) a pai fazendo trabalho de executor com 670k de contexto (PRD-133 exec: 12 `npx playwright`, investigação de bug de 22 min); (9) watchdog só avisa (dedalo 64 min, hefesto 52 min).

Esperas humanas prescritas: entrevista única (5,8–7,3 min) e decolagem (4,2 min). No Caronte mais duas que a skill permite mas não obriga: "fora do envelope" (29,5 min) e variante da maquete (1,2 min). O 401 OAuth (190 min) não é do harness — mas nenhum hook o detectou.

### d) Onde os tokens vão sem retorno proporcional

1. **Contexto da pai:** 313–670k tokens por turno; 75–447 M relidos por sessão — 2,3× (Caronte) a 13,5× (PRD-133 exec) o custo do output dela (cache a 10% do input, output ≈ 5× input). `tokens_total` mediano de uma exec em agosto: 166 M para ~500k de output.
2. **Tasks 2,6× maiores (3.4.10)** relidas por 5 papéis a cada ciclo (seção 2.4).
3. **Hermes Modo C em Edit-first:** 398 turnos, 194k tokens, 47 min por rodada (PRD-133); 226 turnos/98 Edits no Caronte.
4. **Thinking** = 45–72% do output dos julgadores desde a 3.3.0 (era ~2%); tempo por turno igual, custo maior.
5. **Ciclo 3 de confirmação:** 16–36k tokens e 5–10 min por gate, zero achado em 3/3.
6. **Codex de discovery:** 1,58 M tokens de input por chamada (1,4 M em cache) para 9k de output; `impacto` falha 35% e o fallback custa 17–28 min de atlas.
7. **Duelos:** 91 workers, 21% erro/vazio, US$ 5,85 no mês — barato; custo é de tempo quando cai para background (TASK-008 da PRD-133: 25 min até despachar).
8. **Suíte completa descartada** (PRD-134): 53 min de Playwright + contenção sobre 6 agentes.
9. **Retornos gigantes** apesar do "dois níveis" (3.4.9): dedalo Modo P devolveu 71 KB/970 linhas no Caronte; a pai colou 863 linhas na técnica.

### e) PRD-011 do Caronte — linha do tempo (sessão `2d9f6d99`, 11:57 → 20:35, 518 min)

| Hora | Δ | O que aconteceu | Vivo | Classe |
|---|---|---|---|---|
| 11:57–12:03 | 6 | Perfil (39 KB lido 3× por `sed`), resumo DEFASADO regerado, baseline | pai | preâmbulo |
| 12:03–12:09 | **5,8** | pergunta do orçamento | — | espera humana |
| 12:09–12:12 | 3 | git, entrevista, `reservar` (SEQ 11), votação → COMPLETO | 3 votantes | preâmbulo |
| 12:12:36 | | `start fase1` | | |
| 12:12–12:20 | 8 | cache de discovery inválido; 6 agentes: A 1,1 min, 3× peter-quill 0,8–4,7, tony-stark 5,2 | 5 | paralelo |
| 12:20–12:44 | **23,6** | só o atlas (28,6 min, 130 turnos, 84 Bash) | atlas | **serial** |
| 12:44–12:45 | 1 | síntese: 2 achados fora do envelope | pai | trabalho |
| 12:45–13:15 | **29,5** | pergunta ao Charles sobre o achado do atlas | — | espera humana |
| 13:15–13:24 | 9 | PRD de produto (Write 35 KB, 3,4 min), INDEX, `_discovery.md`, cache | pai | trabalho |
| 13:24–13:52 | **27** | ariadne rodada 1 (bloqueante) | ariadne | serial prescrito |
| 13:52–13:54 | 1,2 | escolha da variante | — | espera humana |
| 13:55 | | ariadne rodada 2 em background (29 min efetivos) | ariadne | paralelo |
| 13:55–14:01 | 6 | renumerar RFs via 4 scripts (2 falharam) | pai | retrabalho |
| 14:01:04 | | `stop fase1` → 109 min (79 ativos) | | |
| 14:02–14:15 | 13 | `start fase2`; técnica (Write 52 KB, 5 min) + correções | pai | trabalho |
| 14:15–14:24 | **9** | pai parada esperando a ariadne (catálogo de ícones) | ariadne | espera evitável |
| 14:25–14:57 | **32** | dedalo Modo P (31,8 min, 93k, retorno 71 KB) ∥ pré-gate beholder (8,3 min, 4 bloqueadores) | 2 | crítico = dedalo |
| 14:57–15:03 | 6 | cola o front (863 linhas), aplica correções, deriva tasks, stub | pai | trabalho |
| 15:03–15:25 | **21,5** | hermes Modo E — 10 tasks, 4.033 linhas | hermes | serial |
| 15:25–15:27 | 2 | amostragem, snapshot c1 | pai | trabalho |
| 15:27–15:55 | **28** | c1: beholder Opus 27,6 (4🔴) ∥ michelangelo Opus 19,6 (1🔴) | 2 | 8 min só o beholder |
| 15:56–15:57 | 1,5 | triagem | pai | trabalho |
| 15:57–16:24 | **26,8** | hermes Modo C (226 turnos, 98 Edits) — morre: `401 OAuth access token has expired` | hermes | serial |
| 16:24–19:34 | **189,6** | sessão muda; nenhum hook reage | — | **incidente** |
| 19:34–19:42 | 8 | "a escrita caiu no meio, continue": confere o hermes, fecha B1 | pai | retomada manual |
| 19:42–20:21 | **38,5** | c2: beholder Sonnet 38,5 (1🔴 novo, iatrogênico) ∥ michelangelo Sonnet 20,6 (fechado) | 2 | 18 min só o beholder |
| 20:21–20:24 | 3 | B5 corrigido em 6 docs por script | pai | trabalho |
| 20:24–20:33 | **8,4** | c3: beholder Sonnet, zero 🔴 | beholder | confirmação |
| 20:33:35 | | `stop fase2` → 392 min (202 ativos, 189 ociosos) | | |

Balanço: incidente 198 (38%) · esperas humanas 37 (7%) · gates 83 (16%) · correções 38 (7%) · discovery 30 (6%) · maquete 36 (7%) · dedalo P 32 (6%) · hermes E 22 (4%) · pai ~42 (8%).

---

## 4. Ranking das 10 maiores oportunidades (revisado pelo recorte 3.3+)

Nada abaixo repete o que a 3.4.9/3.4.10 já fez. As três primeiras são **reversões parciais da 3.4.10**, com os números que as justificam.

| # | Oportunidade | Evidência | Economia | Mudança concreta | Esforço | Risco |
|---|---|---|---|---|---|---|
| **1** | **Tasks de volta ao tamanho da 3.4.8** (hermes Modo E com teto) | Média por task 133–177 → 371–403 linhas; pasta 133–257 KB → 335–425 KB; gates +30–70% por passada; hermes C 2,5× mais texto; packets maiores | **20–40 min por fase 2** (gates + correções + hermes E) e ~30% dos tokens de gate | `agents/hermes.md` Modo E item 3: trocar "preencha TODAS as camadas" por "camadas que a task exige; código inline só em risco (já é a regra do item 24); **teto de ~180 linhas por task** (o patamar da 3.4.8), E2E por referência ao spec, não código completo"; `guard-agent --post` avisa quando `tasks/*.md` médio > 200 linhas | trivial | baixo — as tasks da 3.4.3–3.4.8 executaram com a mesma taxa de bloqueantes (2–3 ciclos) |
| **2** | **Hermes Modo C → patch em lote (ou a pai, como na 3.4.8)** | Correção de um ciclo: pai 5 min (PRD-132), dedalo R 8 min (PRD-131) → hermes C 27–47 min, 226–398 turnos, 92 Read + 92 Edit | **20–40 min por fase 2** | Opção A: exceção no `guard-write.sh` para `prds/**/*.md` (Write liberado em documento; o snapshot+diff da 3.4.9 audita) e hermes C com "patch script" em lote; Opção B: voltar à 3.4.8 (a pai aplica 🔴 ≤ 5 com script, hermes C só acima disso); teto de 120 turnos no Modo C via watchdog `--post` | baixo | baixo — docs, não código |
| **3** | **Laço de gates: corrigir por gate, confirmar só no diff** | Michelangelo volta 6–8 min antes do beholder (6/6); correções em série; c3 zero 🔴 em 3/3 (5–10 min) | **15–30 min por fase 2** | `prd/SKILL.md` Passo 10: despachar a correção de UX (dedalo R) assim que o michelangelo volta, sem esperar o beholder; correção do beholder em 2 agentes por arquivos disjuntos (PRD+técnica × tasks); ciclo de confirmação **só sobre `delta-cN.diff`**, Sonnet, teto 30 turnos, sem Bash exploratório | médio | baixo |
| **4** | **Discovery: atlas nativo com teto + delegação assíncrona** | Atlas 17–29 min no crítico em 3/3 (130 turnos); codex `impacto` falha 35% e o fallback é serial; 4 `Bash` bloqueantes = 18 min | **15–25 min por fase 1** | rota `impacto` → `native`; breaker **por papel, persistente entre labels**; `harness-delegate.sh --async` (ou `run_in_background`); mandato do atlas com "PARCIAL-TEMPO aos 10 min"; incluir F no cache de discovery quando o módulo não mudou | baixo | baixo |
| **5** | **Votação: só vale a pena se puder baixar o nível** | 3/3 votações deram COMPLETO = proposta da pai; 4 min e um turno extra sem mudar nada | 4–6 min por fase 1 | Rodar a votação só quando a pai propõe < COMPLETO (ela existe para conferir economia, não para confirmar o máximo); ou pular no preset `maximo` | trivial | nenhum |
| **6** | **Detectar 401/5xx e retomar do estado canônico** | 190 min mudos na PRD-011; retomada manual de 8 min | até 190 min num caso | Hook `Stop`/`SubagentStop` lê `isApiErrorMessage`/`apiErrorStatus` → grava `RETOMAR-<label>` + `notify.sh` (Beholder e-mail hoje só cobre espera); `/prd` Passo 0 oferece "retomar do estado"; pré-flight checa validade do token antes de fase > 60 min | baixo–médio | nenhum |
| **7** | **Exec: cauda fora do caminho serial** | Spec de acceptance 36–68 min com 1 agente em 4 de 5 execs (3.4.3 e 3.4.10); TASK-010 9–22 min ao final | **30–50 min por exec** | `prd-exec/SKILL.md`: escrita do spec sobe junto com a onda B (como a PRD-133 fez); TASK-010 em rascunho durante o último ciclo; task > 300 linhas ou > 45 min de p90 vai ao gate de largura como candidata a fatiar antes do 1º despacho | baixo | baixo |
| **8** | **Suíte completa nunca com executor vivo** | PRD-134: 53 min descartados + 30 min triando falhas alheias; 3 frentes no PC | 30–60 min nas execs que rodam suíte | `guard-bash.mjs`: bloquear `npx playwright test` sem filtro enquanto houver agente vivo; "só PRD múltipla de 5" vira regra dura | baixo (10 linhas) | nenhum |
| **9** | **Contexto da pai: dieta e compactação por fase** | 313–670k por turno; 75–447 M relidos por sessão (2–13× o output); Perfil inteiro no Passo 0; retorno de 71 KB do dedalo P | 30–50% dos tokens da pai; 10–20% do tempo dela | `guard-agent --post` também para dedalo P e discovery (retorno > 12 linhas → arquivo); Passo 0 lê `PERFIL-RESUMO`; `/compact` nas fronteiras fase1→fase2 e ondas→revisão (protegido pelo estado canônico); `HARNESS_VERBOSITY=minimo` no Caronte; pai não roda Playwright nem investiga bug (delega) | médio | baixo–médio |
| **10** | **Caronte: preset `equilibrado`** (+ dedalo P mais cedo) | 25/25 em `maximo`; fase 2 mediana ativa 124 contra 82; c3 confirmou zero; dedalo P 32 min serial | 10–30 min por fase 2 do Caronte | Perfil → `equilibrado` mantendo Opus no beholder c1; despachar dedalo P no fim da fase 1 e pré-gate em paralelo com ele | trivial | médio (infra do harness) |

Somando as medianas: itens 1–3 devolvem **60–100 min por fase 2** (de 146–201 para ~80–110, o patamar da 3.4.3 com os gates novos mantidos); 4–5 devolvem 20–30 min por fase 1; 7–8 devolvem 30–60 min por exec.

---

## 5. Top-3 para aplicar primeiro

1. **#1 Teto de tamanho das tasks no hermes Modo E.** É uma linha no `hermes.md`, reverte a causa-raiz que infla tudo o que vem depois (gates, correções, packets) e não tira nenhum gate do caminho. As PRDs 126–132 executaram com tasks de 133–177 linhas e a mesma taxa de bloqueantes.
2. **#2 Hermes Modo C por patch em lote (ou pela pai até 5 achados).** Segunda maior perna nova da 3.4.10 (20–40 min por fase 2); mudança de ferramenta, não de rigor; o snapshot+diff já audita o resultado.
3. **#3 Laço de gates: corrigir por gate e confirmar só no diff.** Vale nas duas eras (55–65% da fase 2 desde a 3.4.3) e é o que sobra depois de 1 e 2.

Junto com o primeiro lote, por custarem quase nada: **#5** (votação só quando pode baixar o nível), **#8** (suíte × agentes) e **#6** (401 → retomar).

---

## 6. Meta — tempo, monitoramento e limitações

**Tempo:** 20:39 → ~21:50 (≈70 min de parede, dos quais ~30 na revisão do recorte por versão), com um subagente lendo as skills (4 min) em paralelo. Scripts em Python no scratchpad da sessão (parser de transcripts, consolidação de runs, delegações, latência por turno por era, contexto por turno).

**Exec do Caronte (pedido no meio da análise):** sessão `242fec76` iniciou 20:39:51; pré-flight até 20:47 (doctor acusou *watchdog de subagente dormente* e falta de notificação); decolagem respondida em 4,2 min; `start PRD-011-exec` 20:51:43; Onda 1 despachada 20:58 (TASK-001 hefesto Sonnet, TASK-002 dedalo **Opus** pelo preset `maximo`); às 21:03 os dois vivos há 3–4 min, sem anomalia. Concorre com as criações da PRD-134b e PRD-133b em worktrees (3 frentes no PC, `HARNESS_MAX_ACTIVE_SESSIONS=2`).

**Limitações:**

- Recorte 3.4.10 tem **n=3 criações e n=2 execs**, em dia de 2–3 sessões simultâneas; 3.4.5 tem n=1 (só a exec da PRD-130); 3.4.8 n=1 criação. As conclusões por versão são de composição (o que cada fase contém), não de estatística.
- **Tokens de subagente de 26–27/08 sub-registrados** (1–9 por turno) nos transcripts; comparações entre eras usam turnos e minutos. Os `tokens_output_subagents` de PRD-130/131 no `harness-runs.jsonl` (25k/41k) herdam o mesmo defeito.
- `PRD-134-exec` corrompida (start órfão) excluída; PRD-130-fase1 inclui a fase 2; PRD-128 com 35–97 min ociosos.
- O "tempo de ferramenta" da pai inclui `Agent` bloqueantes; a divisão modelo × ferramenta só é limpa dentro dos subagentes.
- Codex/Ollama sem transcript; `cost_usd` só para openrouter; custo em moeda não calculado (razões cache/output em ordem de grandeza).
- **Qualidade não medida:** tempo e tokens apenas. A hipótese de que tasks menores mantêm a taxa de bloqueantes vem de 6 PRDs (126–132) com 2–3 ciclos; para confirmar, gravar `achados_por_ciclo` na telemetria nas próximas 10 PRDs.
