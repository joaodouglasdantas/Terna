# DT-010 — Pool de modelos do duelo tem de viajar com o base (sync), não por variável local por máquina

**Prioridade:** Alta
**Status:** Resolvido na 3.5.6 (16/09/2026) — itens 1–3 implementados; item 4 (serial/novato) entregue atrás de flag DESLIGADA (decisão do Charles)
**Balde:** lote
**Origem:** Achado do Charles no MacBook durante um `/dt-sweep` no sagittarius (15/09/2026), ao conferir por que o placar de
duelos mostrava 3×0 sem nenhum duelo real; prompt gerado pela sessão do macOS, transcrito abaixo. No PC o pool certo
só existia porque `~/.harness.env.local` define `HARNESS_DUELO_MODELS` (09/09) — exatamente a variável local que este DT elimina.
**Duplicata:** verificada — DT-001 (régua do placar) e DT-006 (worker local) tocam o duelo, mas nenhum cobre a FONTE do pool
(INDEX verificado em 2026-09-15).

## Problema (com prova)

O `harness-duelo.sh` define a pool como string literal embutida (linha 155 do mestre, 152 na versão que chegou aos projetos):

```
POOL="${MODELS:-${HARNESS_DUELO_MODELS:-deepseek/deepseek-v4-flash-0731,google/gemini-3.7-flash,qwen/qwen3-coder-next}}"
```

O modelo Google na pool embutida é o **gemini-3.7-flash**. O MESMO arquivo, ~114 linhas abaixo, já fala do 3.8 como titular
(comentário da lógica 3.4.27 de exploração acelerada): `# um titular recem-chegado (gemini-3.8 em 09/09) ficaria sem historico
por muito tempo`. Chegou aos projetos o código que TRATA o gemini-3.8 como novato da pool sem o gemini-3.8 ESTAR na pool — a
exploração acelerada nunca teve o que acelerar. O `harness.env` do MESTRE tem `HARNESS_DUELO_MODELS='deepseek/deepseek-v4-flash-0731,
google/gemini-3.8-flash'` (linha 230), mas o `harness.env` de cada projeto é local e o sync não propaga essa chave.

Provas reproduzíveis (macOS, `/Applications/MAMP/htdocs/*`, 15/09):

1. Levantamento em 8 projetos: TODOS com `google/gemini-3.7-flash`. Os 4 na versão mais nova têm o arquivo byte-idêntico
   (md5 `ed36f7bcb7dd97d163ef129e0b60ce1b`, 526 linhas, HARNESS_VERSION 3.4.34) — não é edição local: foi assim que o base entregou.
   ```
   for d in */.claude/hooks/harness-duelo.sh; do
     echo "$d $(grep -m1 '^POOL=' $d | grep -oE 'google/[^,]*') $(md5 -q $d | cut -c1-8)"
   done
   ```
2. `HARNESS_DUELO_MODELS` não está definida em lugar nenhum dessa máquina (nem `harness.env`, nem `harness.env.local`, nem
   `~/.harness.env.local`, que sequer existe). O default embutido não é fallback: é a pool de fato.
3. `google/gemini-3.8-flash` existe e está disponível no catálogo público, sem chave:
   ```
   curl -s https://openrouter.ai/api/v1/models | python3 -c "import sys,json;print([m['id'] for m in json.load(sys.stdin)['data'] if 'gemini-3.8' in m['id']])"
   => ['google/gemini-3.8-flash', 'google/gemini-3.8-flash:batch']
   ```

Por que não é cosmético: no modo serial (`serial: on`) o worker B só é pago quando o diff de A falha. Nos 3 duelos registrados no
sagittarius (`prds/_metrics/harness-duelos.jsonl`) o B foi PULADO nas 3 (`status_b: "pulado"`, `custo_b: null`, `juiz: "auto"`,
motivo `"serial: diff A aplica — B nao pago (pulou_b)"`). Placar aparente DeepSeek 3 × 0 Gemini; placar real: 3 vitórias por W.O.,
o themis nunca julgou e o modelo Google (3.7 ou 3.8) nunca produziu um diff. E os 2 duelos com desfecho têm `"ev":"aplicado",
"resultado":"falhou"` (o diff "vencedor" foi descartado nas duas vezes: caminho errado de arquivo; migration que a mini-spec do lote
tinha ejetado). O placar por modelo está cego em dois eixos ao mesmo tempo, e a pool desatualizada garante que continue assim.

## Proposta

1. **A pool vem do base e chega pelo sync.** Tirar a string literal do `harness-duelo.sh`: os hooks passam a sourcear um arquivo
   VERSIONADO do mestre que o sync propaga — `.claude/hooks/_defaults.env` (ou `.claude/harness-defaults.env`, dentro do "núcleo"
   do `harness-sync.sh`) — carregado ANTES de `harness.env`/`harness.env.local`/`~/.harness.env.local`, que continuam podendo
   sobrescrever. Um lugar óbvio para olhar e um diff legível quando mudar. `HARNESS_DUELO_MODELS`, `HARNESS_DUELO_SUPLENTES` e
   `HARNESS_OLLAMA_MODEL` saem do `harness.env` de projeto (que fica só com o que é local de verdade).
2. **Google = `google/gemini-3.8-flash`, SUBSTITUINDO o 3.7** (decisão registrada aqui, não implícita): o 3.7 nunca chegou a ser
   medido, não há histórico que justifique mantê-lo, e pool maior com serial ligado significa ainda menos medição por modelo.
   Pool titular: `deepseek/deepseek-v4-flash-0731,google/gemini-3.8-flash`; suplentes como no mestre (`qwen/qwen3.7-flash,
   x-ai/grok-build-0.1,anthropic/claude-haiku-4.5`).
3. **Guard contra a repetição** (as três, são baratas):
   - preflight do duelo valida a pool contra `https://openrouter.ai/api/v1/models` (endpoint público, cache de 24 h em
     `~/.harness-run/openrouter-models.json`) e AVISA `DUELO|pool|modelo-inexistente|<slug>` (não derruba o duelo; tira o modelo);
   - teste do mestre (`tests/t-356-pool-duelo.mjs`): todo slug `provedor/modelo` citado em `hooks/*.sh|*.mjs` e nas skills tem de
     constar da pool/suplentes do `_defaults.env` — foi exatamente esse o sintoma (3.8 citado no código, ausente da pool);
   - `harness-doctor.sh` imprime a pool resolvida (`DOCTOR|duelo|pool=<...>|origem=<defaults|harness.env|local>`), para o drift
     aparecer na abertura da sessão.
4. **Revisar o `serial` junto:** colocar o 3.8 na pool sem mexer no serial só troca qual modelo nunca é medido. Regra proposta:
   a exploração acelerada de novato (3.4.27) passa a agir ANTES do pulo do B — enquanto um titular tiver < N duelos julgados
   (`HARNESS_DUELO_NOVATO_MIN`, default 5), o serial NÃO pula o B; e, fora disso, o serial roda o B a cada K duelos
   (`HARNESS_DUELO_SERIAL_AMOSTRA`, default 5) para o placar ter dado dos dois lados.

## Critério de aceite

- Projeto recém-sincronizado com o base mostra `google/gemini-3.8-flash` na pool **sem** nenhuma variável local definida
  (`bash .claude/hooks/harness-duelo.sh --pool` ou a linha do doctor).
- O levantamento do item 1 das provas, numa máquina com vários projetos, devolve a pool nova em todos os sincronizados.
- Existe mecanismo que teria pegado este caso (modelo citado no código mas fora da pool; modelo da pool inexistente no
  provedor) ANTES de propagar — o teste do mestre falha vermelho com a pool velha.
- Um duelo com titular novato registra `status_b` diferente de `pulado` (o B rodou) até completar N duelos julgados.

## Arquivos

- `.claude/hooks/harness-duelo.sh` (POOL na linha 155; preflight; serial/exploração acelerada ~linha 261–275)
- `.claude/hooks/_defaults.env` (novo, versionado, sourceado por `harness-duelo.sh`, `harness-delegate.sh`, `harness-doctor.sh`)
- `.claude/harness-sync.sh` (núcleo: incluir o `_defaults.env`)
- `.claude/harness.env` do mestre (remover as chaves do duelo, deixar comentário apontando o `_defaults.env`)
- `.claude/harness-doctor.sh` (linha `DOCTOR|duelo|pool=…`)
- `tests/t-356-pool-duelo.mjs` (novo)
- `~/.harness.env.local` do PC do Charles: apagar `HARNESS_DUELO_MODELS`/`HARNESS_DUELO_SUPLENTES` depois da 3.5.6 (deixam de
  ser necessários; se ficarem, mascaram o teste de aceite).

## Esforço

Médio (2–3 h): mover a pool e sourcear o defaults (30 min), preflight com cache (45 min), teste do mestre (30 min), regra do
serial/novato (45 min), sync + `/deus` nos projetos (o `_defaults.env` viaja sozinho).

## Resolução (3.5.6, 16/09/2026 — sessão autônoma da madrugada)

- **Item 1 — pool viaja com o base:** `.claude/hooks/_defaults.env` (versionado no mestre, dentro do núcleo do sync), sourceado ANTES do
  `harness.env` por `harness-duelo.sh`, `harness-delegate.sh`, `presence.mjs` (`makeCtx`) e `harness-daemon.mjs`. O literal saiu do
  `harness-duelo.sh`; `HARNESS_DUELO_MODELS/SUPLENTES` e `HARNESS_OLLAMA_MODEL` viraram comentário no `harness.env` do mestre.
- **Item 2 — 3.8 substitui o 3.7:** `HARNESS_DUELO_MODELS=deepseek/deepseek-v4-flash-0731,google/gemini-3.8-flash`; suplentes
  `qwen/qwen3.7-flash,x-ai/grok-build-0.1` (haiku e qwen3-coder-next fora — placar real do DT-011).
- **Item 3 — guards:** `harness-duelo.sh --pool [--validar]` (pool + origem + catálogo público do OpenRouter, cache 24 h,
  `DUELO|pool|modelo-inexistente|<slug>`); `harness-doctor.sh` imprime `duelo: pool=… (origem: …)` e avisa override local;
  teste do mestre `tests/t-356-madrugada.mjs` T20–T21 (slug citado em código ⊆ pool; 3.8 titular, 3.7 ausente).
- **Item 4 — serial/novato:** `HARNESS_DUELO_SERIAL_NOVATO_MIN` e `HARNESS_DUELO_SERIAL_AMOSTRA` existem no `harness-duelo.sh`, default
  `0` (= 3.4.24). Ligar dobra o custo do duelo enquanto o novato não tem histórico — escopo B do handoff, decisão do Charles.
- **Critério de aceite:** provado na Mariana (`--pool` → `origem=defaults` para titulares); os DEMAIS projetos (sagittarius incluído:
  3.4.34, literal 3.7) só recebem via `/deus`. Só depois do `/deus` apagar `HARNESS_DUELO_*` do `~/.harness.env.local` do PC — hoje
  ele ainda sobrescreve os SUPLENTES (haiku + ollama:auto) e o doctor da Mariana acusa `origem=.harness.env.local`.
