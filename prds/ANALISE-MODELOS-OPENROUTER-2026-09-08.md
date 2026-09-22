# Análise de modelos do OpenRouter para o pool de duelo — 2026-09-08

> Pesquisa + teste real com teto de US$ 0,30 (gasto: **US$ 0,2192**, 8 chamadas pagas + 1 preflight).
> Sandbox: `git clone --local` do `dra-mariana-duarte` em `%TEMP%\or-sandbox-mariana` (harness 3.4.21 do
> projeto, sem remote, sem push; apagado no fim). Nenhuma telemetria do projeto original foi tocada.
> O `harness.env` do mestre **não** foi editado — as linhas prontas estão na seção 5.

## 1. Pesquisa

Fonte primária: API pública `GET https://openrouter.ai/api/v1/models` (431 modelos, lida em 08/09/2026 — preço,
contexto, max output e `supported_parameters` vêm dela e são exatos). Páginas: <https://openrouter.ai/google/gemini-3.8-flash>,
<https://openrouter.ai/google/gemini-3.7-flash>, <https://openrouter.ai/x-ai/grok-build-0.1>, <https://openrouter.ai/x-ai>,
<https://openrouter.ai/google>; changelog Google <https://ai.google.dev/gemini-api/docs/changelog>; xAI
<https://x.ai/news/grok-build-0-1> e <https://docs.x.ai/developers/migration/may-15-retirement>.

| id exato (OpenRouter) | in / out (US$ por 1M) | cache read | contexto | max output | tools / structured / reasoning | throughput | benchmark de código | observações |
|---|---|---|---|---|---|---|---|---|
| `google/gemini-3.8-flash` | **0,75 / 3,75** | 0,075 | 1.048.576 | 65.536 | sim / sim / `reasoning_effort` | não publicado no OpenRouter; **medido aqui: 892 tok em 6 s** (chamada inteira) | Terminal-Bench 2.1 **90,8%** (3.7: 81,6%); SWE-Bench Pro 61,6% (3.7: 60,4%); SWE-Atlas 51,9% (48,0%) — DataCamp/anúncio. SWE-bench Verified: **não confirmado** (BenchLM cita "SWE-bench (Vals) 80,0%" e LiveCodeBench (Vals) 89,5% — terceiros). Aider polyglot: **não achado** | Lançado 02/09/2026 (changelog Google confirma o id `gemini-3.8-flash`). **Mesmo preço** do 3.7. Variante `:batch` 0,375/1,875. DataCamp diz que o preço vai a 1,50/7,50 em 01/01/2027 — **não confirmado** na fonte (o changelog só diz "introductory price through December 31, 2026" para o 3.7) |
| `google/gemini-3.7-flash` (atual no pool) | **0,75 / 3,75** | 0,075 | 1.048.576 | 65.536 | sim / sim / `reasoning_effort` | medido: 643 tok em 6 s | ver acima (é o comparativo do 3.8) | Lançado 13/08/2026. **Correção da referência de 22/08:** 0,375/1,875 é o preço do `:batch`; a chamada normal custa 0,75/3,75 — a telemetria do Mariana confirma (21 chamadas, US$ 1,32, 2,66 M tokens de entrada = **US$ 0,496/M efetivo**, com cache) |
| `deepseek/deepseek-v4-flash-0731` (controle / estagiário) | **0,065 / 0,18** | 0,016 | 1.310.720 | 943.718 | sim / sim / `reasoning_effort` + `parallel_tool_calls` | medido: 5,5k tok em 48 s (~115 tok/s) | — | Subiu desde 22/08 (era 0,056/0,11): +16% entrada, +64% saída. Segue **11,5× mais barato** que o Gemini Flash na entrada e 21× na saída |
| `x-ai/grok-build-0.1` | **1,00 / 2,00** | 0,20 | 256.000 | 230.400 | sim / sim / `reasoning` (sem `reasoning_effort`) | xAI: "100+ tok/s"; medido: 7,1k tok em 56 s (~128 tok/s) | SWE-bench Verified ~70,8% — **não confirmado** (terceiros: pickurai/arturmarkus; a página da xAI não publica número) | Lançado 20/05/2026 (API 29/05). É o **único Grok de código** vivo no OpenRouter. Custo por token: **15× o deepseek** na entrada e **11×** na saída; vs. Gemini Flash: 1,3× na entrada e 0,53× na saída |
| `x-ai/grok-code-fast-1`, `x-ai/grok-4-fast`, `x-ai/grok-4.1-fast` | — | — | — | — | — | — | — | **Retirados**: deprecados em 15/05/2026 e desligados em 15/08/2026 (docs.x.ai). As páginas no OpenRouter devolvem 404 e os ids **não existem mais** na API de modelos. Requests aos slugs antigos eram roteados para grok-build-0.1 / grok-4.3 a preço de grok-4.3 (1,25/2,50) |
| `x-ai/grok-4.3` / `grok-4.5` / `grok-4.6` | 1,25/2,50 · 2/6 · 2/6 | 0,20–0,50 | 1M · 500k · 500k | 900k · 450k · 450k | sim | — | — | Linha generalista; mais caros que o grok-build. Fora de cogitação para worker barato |
| `qwen/qwen3.7-flash` (suplente atual) | 0,03 / 0,13 | 0,006 | 1.000.000 | 65.536 | tools sim; **sem `structured_outputs`** | — | — | Medido no Mariana: 19 chamadas, US$ 0,148 (0,093/M efetivo) |
| `anthropic/claude-haiku-4.5` (suplente atual) | 1,00 / 5,00 | 0,10 | 200.000 | 64.000 | sim / sim | — | — | Medido no Mariana: 13 chamadas, **US$ 2,19** (1,148/M efetivo) — o suplente mais caro da casa |

Não confirmado (não achei fonte primária): SWE-bench Verified e Aider polyglot do Gemini 3.8 Flash; throughput oficial do Gemini 3.8 no
OpenRouter; SWE-bench Verified do grok-build-0.1 pela xAI; aumento de preço do Gemini Flash em 2027.

## 2. Teste real (sandbox, worker do duelo reproduzido)

Método: mesmo `prompt-worker.md` que o `harness-duelo.sh` monta (cabeçalho BUSCAR/SUBSTITUIR + packet), mesma linha de
chamada do `run_worker` (`harness-delegate.sh --executor openrouter --model <id> --role duelo-worker --attach "" --max-words 4000
--timeout 300 --reasoning low`, `HARNESS_OPENROUTER_MAX_OUTPUT_TOKENS=8000`), mesma cadeia de conversão (`duelo-aplicar.mjs`
→ `diff -u` → `git apply --check`, com fallback `--recount --ignore-whitespace`). Custo lido do `cost_usd` do manifest do clone.
Packets regenerados no clone com `task-packet.sh` (o menor possível ficou em 72–78 KB — nenhum packet de LOTE cabe em 60 KB
com o Perfil-resumo incluído). Tasks: **DT-542** (`anexos/cadastrar.php` ignora retorno do `InsertSql`; 3 arquivos no packet,
78 KB, Pendente) e **DT-543** (`webhook_waha.php` usa `ObjectURL` cru; 2 arquivos, 72 KB, Pendente). DT-455/456/475/493 já
estavam Resolvidos no repo (packets antigos, defasados) — descartados.

| modelo | task | tools | aplicável | tempo API | tokens in / out (reasoning) | custo US$ | nota (0–10) | leitura do diff contra o contrato |
|---|---|---|---|---|---|---|---|---|
| deepseek-v4-flash-0731 | DT-543 | **on** (3.4.21: 12 turnos) | **não** | 80 s | **924.218** / 5.501 (3.953) | **0,0800** | 1 | Achou o trecho certo (l. 1087-1094) com `read_file`, mas morreu no teto de turnos "validando com o lint" sem emitir bloco. O loop reenviou o contexto 12× — o mesmo estouro do qwen3-coder-next; a 3.4.24 do mestre limita a 4 turnos, o Mariana ainda está na 3.4.21 |
| gemini-3.8-flash | DT-543 | off | não | 7 s | 23.677 / 398 (0) | 0,0193 | 6 | Recusou honestamente: o packet (esqueleto do arquivo de 66 KB) não trazia o trecho da l. 737 com contexto; listou o que faltava em "Não verificado". Zero chute |
| grok-build-0.1 | DT-543 | off | não | 34 s | 21.524 / 4.289 (3.980) | 0,0300 | 6 | Mesma recusa honesta, com notas disciplinadas. Gastou 4k tokens de reasoning apesar de `low` |
| deepseek-v4-flash-0731 | DT-543 | off | não | 49 s | 24.293 / 3.899 (2.871) | 0,0034 | 3 | Chutou um BUSCAR de 1 linha, sem indentação e sem contexto → `BUSCAR nao encontrado`. Repetiu o bloco 2× na resposta |
| gemini-3.8-flash | DT-542 | off | **sim** | 6 s | 26.103 / 892 (0) | 0,0229 | **8,5** | Guard `is_string`, `error_log` com key, `deleteObject` best-effort em `\Throwable`, 500/ERRO + `exit`. Renomeou `$usuario`→`$ret` (ok) e acrescentou `header()` no caminho de sucesso (fora do contrato, inofensivo) |
| grok-build-0.1 | DT-542 | off | **sim** | 56 s | 23.431 / 7.143 (5.709) | 0,0376 | 7,5 | Correto e fiel ao molde do LOTE-037, mas reinstancia `criarClienteS3()` dentro do guard (`$clientS3` já está em escopo, l. 36) e protege `$renamer` com `!empty` supérfluo. O mais lento e o mais caro por chamada |
| deepseek-v4-flash-0731 | DT-542 | off | **sim** | 48 s | 27.001 / 5.528 (4.586) | 0,0041 | 8 | Correto; loga depois de compensar (ordem inversa ao molde), comentário longo em PT-BR. **5,6× mais barato que o Gemini e 9× que o Grok** pelo mesmo resultado |
| gemini-3.7-flash | DT-542 | off | **sim** | 6 s | 26.103 / 643 (0) | 0,0220 | 8,5 | Mesmo conteúdo do 3.8, mais enxuto, sem tocar o caminho de sucesso. Indistinguível do 3.8 nesta task |

**Custo total gasto: US$ 0,2192** (teto 0,30; parada programada em 0,25). Não sobrou orçamento para gemini-3.7 na DT-543
nem para rodar os modelos novos **com** `--tools` — o comportamento do Gemini 3.8 e do Grok no loop de ferramentas fica
**não medido**.

Achados de harness (não de modelo), de graça:
1. **Packet por esqueleto pode não conter o trecho-alvo** (DT-543: arquivo de 66 KB entrou como esqueleto e a linha citada
   no contrato ficou fora). Aí todo worker é inaplicável, qualquer que seja o modelo; o honesto recusa (Gemini/Grok), o
   deepseek chuta. Vale um check no `task-packet.sh --check`: linha `arquivo:NNN` citada no contrato precisa estar no packet.
2. **Contrato com linha defasada** (DT-543 cita `:737`; a linha real é 1094). O worker sem tools confia no número.
3. **Mariana em 3.4.21 sem o teto de 4 turnos**: 1 chamada com tools = US$ 0,08 e 924k tokens. Rodar `/deus` no Mariana.

## 3. Respostas às perguntas

**(1) Gemini Flash novo.** É o `google/gemini-3.8-flash` (02/09/2026): 0,75/3,75 por 1M — **o mesmo preço do 3.7** (a referência
de 22/08 de 0,375/1,875 era o `:batch`), contexto 1M, saída 65.536, tools + structured outputs + `reasoning_effort`. Benchmarks de
código sobem (Terminal-Bench 2.1 90,8% vs 81,6%; SWE-Bench Pro 61,6% vs 60,4%). No teste, 3.7 e 3.8 empataram (ambos aplicáveis,
8,5, 6 s, ~US$ 0,022). **Vale trocar**: custo igual, modelo mais novo, e a Google já sinaliza que o 3.7 era preço introdutório.
Sem risco de regressão medido.

**(2) Grok barato.** A linha `grok-*-fast` / `grok-code-fast` **acabou** (retirada em 15/08/2026, ids fora do OpenRouter). O único
Grok de código é o `x-ai/grok-build-0.1` a 1,00/2,00 — **15× o deepseek na entrada e 11× na saída**; contra o Gemini Flash é 1,3×
na entrada e metade na saída, mas na prática saiu mais caro por chamada (US$ 0,038 vs 0,023) porque raciocina muito mesmo em
`low` (5,7k tokens) e é 9× mais lento que o Gemini. Entregou diff aplicável e correto (7,5). **Não entra no pool** (não há
ganho de custo nem de tempo); **entra como suplente** no lugar-de-ordem antes do haiku-4.5, que custa 1/5 e rendeu US$ 2,19 em 13
chamadas no Mariana — é a reserva mais barata que provou aplicar diff. Tools: suporta (`tools`/`tool_choice`/`structured_outputs`);
não medido no loop — não precisa entrar em `HARNESS_DELEGATE_TOOLS_OFF_MODELS` por enquanto.

**(3) Estagiário.** Manter `deepseek/deepseek-v4-flash-0731`. O preço subiu (0,065/0,18) mas continua 11× abaixo do Gemini e
foi o único que fez a DT-542 por US$ 0,004; `qwen/qwen3.7-flash` (0,03/0,13) segue a alternativa para triagem em massa, já
documentada no env. Atualizar o comentário de preço no `harness.env`.

## 4. Recomendação objetiva

- **Substituir** `google/gemini-3.7-flash` → `google/gemini-3.8-flash` no pool (mesmo preço, mais novo, sem regressão medida).
- **Grok**: `x-ai/grok-build-0.1` como **suplente** (2º da ordem de promoção), não titular.
- **Estagiário**: manter deepseek-v4-flash-0731.
- **Tools off**: manter só `qwen/qwen3-coder-next` (nenhum modelo novo provou falhar com tools — mas também não foi medido).
- Ação fora do env: `/deus` no Mariana para levar o teto de 4 turnos (3.4.24) — uma chamada com tools na 3.4.21 custou
  mais que todo o resto do teste somado.

## 5. Linhas prontas do `harness.env` (propostas — não aplicadas no mestre)

```bash
# Pool de workers (ids do OpenRouter, csv). 08/09/2026: gemini-3.8-flash substitui o 3.7 (mesmo preco 0,75/3,75 —
# a referencia 0,375/1,875 de 22/08 era o :batch; teste DT-542: ambos aplicaveis, 6s, ~US$0,022 por chamada).
HARNESS_DUELO_MODELS='deepseek/deepseek-v4-flash-0731,google/gemini-3.8-flash'
# SUPLENTES — 08/09/2026: grok-build-0.1 (US$1/2 por 1M; unico Grok de codigo vivo — a linha grok-*-fast foi
# retirada em 15/08) entra antes do haiku-4.5 (US$1/5, o suplente mais caro medido: US$2,19 em 13 chamadas).
HARNESS_DUELO_SUPLENTES='qwen/qwen3.7-flash,x-ai/grok-build-0.1,anthropic/claude-haiku-4.5'
# Estagiario: mantido. Preco medido em 08/09/2026: US$0,065/0,18 por 1M (in/out), 1,3M de contexto.
HARNESS_OPENROUTER_MODEL='deepseek/deepseek-v4-flash-0731'
# Sem mudanca — nenhum modelo novo precisou de completion cega (loop com tools nao medido nos novos).
HARNESS_DELEGATE_TOOLS_OFF_MODELS='qwen/qwen3-coder-next'
```

Atenção: o `~/.harness.env.local` do Charles **sobrescreve** `HARNESS_DUELO_SUPLENTES` (user-level vence o do projeto, com o
worker ollama no fim) — a linha de suplentes tem de ser espelhada lá também, senão o grok nunca entra nesta máquina.

## 6. Custo estimado por duelo com o pool proposto (packet de 50 KB)

Razão medida: 72–78 KB de prompt → 21,5–27k tokens (~0,34 tok/byte) ⇒ packet de 50 KB ≈ **17k tokens** de entrada.

| peça | sem tools | com tools (teto 4 turnos, 3.4.24) |
|---|---|---|
| worker deepseek-v4-flash-0731 (17k in + ~5k out c/ reasoning) | ≈ US$ 0,002 | ≈ US$ 0,006 |
| worker gemini-3.8-flash (17k in + ~1k out) | ≈ US$ 0,017 | ≈ US$ 0,055 |
| suplente grok-build-0.1 (17k in + ~6k out) | ≈ US$ 0,029 | ≈ US$ 0,09 |
| juiz `themis` (Sonnet na assinatura) | US$ 0 de API | US$ 0 |
| juiz `openrouter` deepseek-v4-pro (~20k in + 1k out) | ≈ US$ 0,021 | — |

- Duelo **serial** (default): A aplicável ⇒ paga só A: **US$ 0,002–0,017** (+ juiz 0). Os dois pagos (A inaplicável):
  **≈ US$ 0,019** sem tools / ≈ 0,06 com tools; com juiz no OpenRouter, +0,021.
- Duelo paralelo (`HARNESS_DUELO_SERIAL=off`, 2 workers + juiz themis): **≈ US$ 0,019** sem tools / **≈ 0,06** com tools.
- Trocar 3.7→3.8 **não altera** o custo; o Grok como suplente só custa quando promovido pela régua do placar.

## 7. O que ficou "não confirmado" / não medido

- SWE-bench Verified, LiveCodeBench e Aider polyglot do Gemini 3.8 Flash em fonte primária (só terceiros).
- SWE-bench Verified do grok-build-0.1 pela xAI (só terceiros, ~70,8%).
- Throughput oficial do Gemini 3.8 no OpenRouter (página não exibe).
- Reajuste do Gemini Flash em 01/01/2027 (1,50/7,50 — DataCamp).
- Comportamento de Gemini 3.8 e Grok **no loop `--tools`** (orçamento acabou antes).
- Amostra pequena: 1 task aplicável por modelo (DT-542). A DT-543 mediu honestidade, não implementação.
