# INDEX de Débitos Técnicos

Registro central de todos os DTs pendentes/resolvidos do projeto. Toda alteração de status
em um arquivo `DT-XXX-*.md` **deve** ser replicada nesta tabela, no mesmo commit (ver
`prds/_templates/TEMPLATE-DT.md`).

| ID | Título | Prioridade | Status | Origem |
|----|--------|------------|--------|--------|
| DT-001 | Régua do placar do duelo contaminada pelo histórico de duelos de PRD | Média | Resolvido (direto no mestre, 01/09/2026) | 1ª rodada de campo 3.4.6-3.4.8 (Mariana, 28/08) — evento pool cortou os 3 titulares; repetiu 01/09 00:04. Fix: era + janela (HARNESS_DUELO_PLACAR_JANELA), validado contra o jsonl real |
| DT-002 | Colisão de numeração de LOTE e DT entre worktrees/sessões paralelas | Alta | Resolvido (direto no mestre, 01/09/2026) | 2ª rodada de campo 3.4.10 (Mariana, 01/09) — dois LOTE-037 e dois pares DT-541/542 distintos em wt-sweep-a × wt-sweep-b |
| DT-003 | Adaptador `db-test.sh` dos projetos ignora o banco isolado do worktree | Média | Resolvido (direto no mestre, 01/09/2026) | DT-541 do Mariana (hefesto do LOTE-037, wt-sweep-b, 01/09) — db-test.sh virou canônico do harness; propagação no próximo /deus |
| DT-004 | Fatiar PRD deve criar o stub das partes -b/-c/-d na hora | Média | Resolvido (direto no mestre, 01/09/2026) | Decisão do Charles (01/09) na rodada PRD-133/134 do Mariana — fatia "pendente no INDEX" perde escopo e decisões da entrevista |
| DT-005 | Teto de ciclos divergente: skill/agentes dizem "teto absoluto 5", enforcement diz 3 | Média | Resolvido (direto no mestre, 01/09/2026) | Sessão PRD-134 (01/09, parada 10.3): guard-agent nega ciclo 4 citando teto 3 enquanto a /prd autorizava até o 5º |
| DT-006 | Worker local (ollama): prompt do duelo truncado a 16k em silêncio + fetch morre antes do 1º token | Alta | Resolvido (direto no mestre, 01/09/2026) | Duelo DT-540 (01/09): via nativa c/ num_ctx por request + http puro + detector de truncamento + capacidade (30b ≤6k est, local ≤16k est) — testado ao vivo no 14b |
| DT-007 | JSONL de telemetria corrompido por escrita concorrente sem lock | Média | Resolvido (direto no mestre, 01/09/2026) | Causa-raiz: grupo de printfs no `>>` do preflight. Lock `_jsonl-append.sh` nos 10 gravadores + `sanear` com quarentena; rajada 20/20 OK. Limpar o Mariana pós-execs |
| DT-008 | `perfil-frescor.sh` carimba FRESCO sem validar coerência interna do RESUMO | Média | Resolvido (direto no mestre, 01/09/2026) | Detector de PARES (3+ termos comuns) em `--carimbar`/`--coerencia`; heurística de termo-em-N-itens descartada por medição (9 FP) |
| DT-009 | Presença: subagentes viram cartões duplicados no Caronte (e são o dado dos "bonequinhos") | Média | Resolvido no lado harness (01/09/2026) | presence sh+mjs marcam agent:1 + agent_name + parent_session (testado E2E, hefesto real); lado Caronte = PRD própria gerada p/ o Charles |
| DT-011 | Duelo: 32 % de aproveitamento real nos últimos 50, 76 % dos vencedores por W.O. sem juiz, prompt do worker exige cópia literal de 83 KB | Alta | Parcial (3.5.6: aplicado obrigatório + --placar; themis-solo e prompt do worker propostos) | Pedido do Charles (15/09 noite). 16/50 usados; 10/26 vencedores descartados por bug que aplica (SQL, include, funcoesPDO, mini-spec); 11 "BUSCAR não encontrado". Propostas: themis-solo no W.O., `aplicado` obrigatório, âncora curta + casamento normalizado + anexos por trecho, escalação pelo placar real (qwen3.7-flash sobe, haiku/coder-next saem) |
| DT-010 | Pool de modelos do duelo tem de viajar com o base (sync), não por variável local por máquina | Alta | Resolvido (3.5.6 — hooks/_defaults.env; serial/novato atrás de flag off) | Charles no MacBook, `/dt-sweep` do sagittarius (15/09): 8 projetos com `gemini-3.7-flash` embutido no `harness-duelo.sh`, código citando o 3.8, placar 3×0 por W.O. (serial pula o B). Pool → `_defaults.env` versionado + preflight vs OpenRouter + teste do mestre + serial/novato |

<!-- Ao criar o primeiro DT (via skill /dt), substitua a linha-placeholder por:
| DT-001 | <título curto> | <Alta/Média/Baixa> | Pendente | <origem resumida> |
-->

## Legenda de Status

| Status | Significa |
|--------|-----------|
| `Pendente` | Registrado, ainda não resolvido. É a fila que a `/dt-exec` e a `/prd` leem. |
| `Em andamento` | Alguém está resolvendo agora, fora de PRD/lote. |
| `Resolvido (PRD-NNN)` | Absorvido pelo escopo daquela PRD. Detalhes em `prds/PRD-NNN-*/`. |
| `Resolvido (LOTE-NNN)` | Resolvido num **lote de DTs pequenos** executado via `/dt-exec`. O que o lote agrupou, o que foi **ejetado** (e por quê) e o que ficou **bloqueado** estão em `prds/debito_tecnico/lotes/LOTE-NNN-*.md` — ver a tabela "Lotes de DT" abaixo. |

## Lotes de DT

Lotes agrupam DTs pequenos resolvidos num único ciclo (skill `/dt-exec`). Os documentos vivem
em `prds/debito_tecnico/lotes/`. Cada documento carrega o **registro anti-escopo** — o que foi
avaliado e ficou de fora, com o motivo — que é o que evita reavaliar o mesmo DT a cada lote.

| Lote | Data | Módulo/área | DTs resolvidos | Fora do lote | Documento |
|------|------|-------------|----------------|--------------|-----------|
| — | — | — | — | — | — |

<!-- Ao concluir o primeiro lote (via skill /dt-exec), substitua a linha-placeholder por:
| LOTE-001 | AAAA-MM-DD | <módulo/área> | DT-003, DT-007 | DT-011 (ejetado: migration) · DT-014 (bloqueado por DT-009) | [LOTE-001-<slug>](lotes/LOTE-001-<slug>.md) |
-->
