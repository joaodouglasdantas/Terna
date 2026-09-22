# DT-006 — Worker local (ollama): prompt do duelo truncado a 16k em silêncio + fetch do broker morre antes do 1º token

**Prioridade:** Alta
**Status:** Resolvido (implementado direto no mestre, 2026-09-01 — 4 frentes: (1) via local migrada para a API NATIVA /api/chat com `num_ctx` POR REQUEST dimensionado pela entrada (est bytes/2 ×2 + folga de geração; o /v1 OpenAI-compat não aceita options) e `keep_alive` 15m; (2) transporte em `http` puro do Node — eliminado o headers-timeout de ~300s do fetch/undici, o timeout agora é o teto da delegação; (3) detector de truncamento por `prompt_eval_count` colado nas janelas de corte medidas do runner (~num_ctx/2 ou num_ctx cheio) → exit 13 com motivo legível, validado 6/6 contra os casos reais; (4) roteamento por capacidade no resolvedor: 30b só até `HARNESS_OLLAMA_MAX_TOKENS_GRANDE` (6000 est ≈ 12KB, decisão do Charles "30B apenas para pacotes menores"), local até `HARNESS_OLLAMA_MAX_TOKENS_PEQUENO` (16000 est ≈ 32KB), acima disso o duelo promove suplente REMOTO e a delegação avulsa falha com motivo — resolvedor testado 8/8, via nativa testada ao vivo no 14b com needle no fim de prompt de 15KB recuperada sem truncamento)
**Balde:** lote
**Origem:** Diagnóstico do duelo DT-540 do LOTE-038 (Mariana, 01/09/2026, madrugada da 3.4.10) —
worker A `ollama:qwen3-coder:30b` terminou `erro` (exit 12, stderr `fetch failed`, 318s), e os
diffs do `qwen2.5-coder:14b` nos outros duelos saíram inaplicáveis
**Duplicata:** verificada — nenhum DT do mestre cobre a via ollama do duelo (INDEX verificado em 2026-09-01)

## Problema (com prova)

Três causas encadeadas, todas medidas no `server.log` do Ollama e nos artefatos do duelo:

1. **Truncamento silencioso do prompt.** O packet do duelo do DT-540 tinha 141 KB
   (`prompt=42776` tokens), mas o runner subiu com contexto default de **16.386** —
   `level=WARN msg="truncating input prompt" limit=16386 prompt=42776 keep=4 new=16386`.
   O worker local recebeu **38% do prompt** (perdeu o meio do packet — arquivos-alvo e
   instruções). Vale para QUALQUER modelo local: o 14b "respondeu ok" nos DTs 535/537 mas os
   diffs não aplicavam — com um terço do contexto, não tinha como aplicar. O broker não sabe
   que truncou: o Ollama só loga o WARN no server dele.
2. **Modelo maior que a VRAM + máquina carregada.** `qwen3-coder:30b` Q4_K_M = 18 GB de pesos;
   a GPU (AMD RX 9060 XT) tem 16 GB — split GPU/CPU obrigatório, com a RAM do sistema a
   11.4 GiB livres no momento (4 sessões harness simultâneas; `free_swap` já em uso). Só o
   load levou ~78s; o prefill dos 16k tokens em split não terminou em tempo útil.
3. **Timeout do cliente antes do 1º token.** O fetch do broker desistiu aos ~318s
   (`fetch failed`, exit 12 — compatível com o headers-timeout default de ~300s do
   undici/Node), abaixo do teto de 600s do duelo. O worker morreu por transporte, não por
   mérito.

Agravante de plataforma: `GPU discovery watchdog timed out` / `failure during llama-server
GPU discovery` (ROCm na RX 9060 XT/RDNA4 no Windows) — o Ollama seguiu com leitura de
memória velha, escolhendo offload às cegas.

## O que precisa ser feito

- [ ] **`num_ctx` explícito na chamada** do broker ao Ollama (API `options.num_ctx`),
      dimensionado pelo tamanho real do prompt (ex.: `ceil(tokens*1.15)`), em vez de herdar
      o default de 16k do runner.
- [ ] **Roteamento por capacidade:** antes de escalar worker local, comparar tamanho do packet
      × contexto/memória viáveis do modelo local (ex.: packet > ~24k tokens → pula o local e
      vai de API; ou aciona o local só com packet compacto). O evento `pool`/`duelo` registra
      o motivo ("local pulado: packet 42k > capacidade").
- [ ] **Detectar o truncamento:** se a resposta do Ollama indicar `prompt_eval_count` ≪ tokens
      enviados, marcar o lado como `inaplicavel (contexto truncado)` em vez de deixar o diff
      lixo ir ao juiz.
- [ ] **Timeout de transporte ≥ teto do duelo** para a via ollama (o fetch não pode desistir
      aos 300s quando o teto é 600s) — e teto próprio maior para local em máquina carregada,
      ou `keep_alive`/warm-up do modelo antes do prompt.
- [ ] Documentar no harness.env: recomendação de modelo local ≤ VRAM (na máquina do PC:
      14b Q4 = 9 GB cabe nos 16 GB com KV de sobra; 30b Q4 = 18 GB NÃO cabe).

## Arquivos e tabelas relacionados

- `.claude/hooks/_delegate-common.sh` / broker da via ollama (chamada HTTP e opções)
- `.claude/hooks/harness-duelo.sh` (escalação; ponto do roteamento por capacidade)
- Evidência: `dra-mariana-duarte--wt-sweep-a/.claude/.harness-run/duelos/LOTE-037-DT-540-*-000450/`
  (A.status exit 12, A.log fetch failed 318s) + `%LOCALAPPDATA%\Ollama\server.log` (janela
  2026-09-01 00:06-00:08)

## Esforço

Médio (1-4h) — opções na chamada + gate de capacidade + leitura do prompt_eval_count.
