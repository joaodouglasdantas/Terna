# RAG / Captura de Conhecimento do Harness

Sistema que **captura aprendizados técnicos automaticamente** e **injeta o conhecimento
relevante de volta no contexto** a cada prompt. Evolui o sistema de memória/DT existente
(não o substitui): a busca semântica indexa o conhecimento auto-capturado **+** a memória
curada (`.claude/memory/`) **+** os débitos técnicos (`prds/debito_tecnico/`).

## Pré-requisitos (obrigatório quando o RAG está ligado)

Com `HARNESS_RAG_ENABLED='1'`, **as 4 dependências npm abaixo são obrigatórias** — sem elas os 3
momentos viram no-op silencioso (o `rag.db` nunca é construído, nada é capturado nem injetado):

| Dep (devDependency) | Papel |
|---|---|
| `tsx` | runtime dos scripts `.ts` (embed/search/reindex) |
| `better-sqlite3` | banco do índice (`rag.db`) |
| `sqlite-vec` | busca vetorial KNN |
| `@huggingface/transformers` | embeddings locais (MiniLM 384d) |

**`node_modules/` é gitignored** (não viaja no git) → após cada `git clone`/`git pull` **numa máquina
nova você PRECISA rodar `npm install`** na raiz. Um `git pull` sozinho deixa o RAG inerte mesmo com os
scripts e os `.md` de conhecimento versionados presentes — porque o passo de embed depende do `tsx`/deps.

```bash
npm install            # instala tsx + better-sqlite3 + sqlite-vec + @huggingface/transformers
npm run rag:reindex    # 1a vez baixa o modelo MiniLM (~90 MB) e constroi o rag.db
```

**Sintoma de que faltam:** a pasta `.claude/rag/` tem só o `rag.log`, e o log repete
`[capture] node/tsx ausente (embed) — pulado`. O `harness-doctor.sh` confirma: com o RAG ligado, deps
ausentes aparecem como **[FALTA]** (exit 1), não WARN.

## Os 3 momentos de captura/uso

| Momento | Evento (hook) | Script | O que faz |
|---|---|---|---|
| Fim de um agent | `PostToolUse` matcher `Agent\|Task` (async) | `rag-capture-agent.sh` | Resume o que o subagent aprendeu e indexa |
| Fim da sessão | `SessionEnd` (async) | `rag-capture-session.sh` | Síntese da sessão inteira |
| Início de um prompt | `UserPromptSubmit` (síncrono) | `rag-inject.sh` | Injeta top-3 trechos relevantes no contexto |
| (Portabilidade) | `SessionStart` (async) | `rag-ensure-index.sh` | Reconstrói o índice se faltar/desatualizar |

> **Nota sobre `SubagentStop`:** usamos `PostToolUse[Agent|Task]` (documentado e confiável) em vez de
> `SubagentStop` para capturar fim-de-agent — evita risco de captura dupla. `summarize.ts` também
> aceita o payload de `SubagentStop` (`transcript_path`), então trocar é só ajustar `settings.json`.
>
> **Host Codex (2.0.0):** lá não existem `SessionEnd` nem `PostToolUse[Agent|Task]` — o wiring
> (`.codex/hooks.json`) usa **`Stop` com throttle** (`HARNESS_RAG_STOP_THROTTLE_MIN`, default
> 30 min — `Stop` dispara a cada turno; o throttle deduplica por sessão) para a captura de sessão
> e **`SubagentStop`** para a por-agente (síncronos — o Codex não tem `async`). O extrator de
> transcript é **genérico**: formato que ele não reconhece cai no gate de tamanho e vira no-op
> (nunca inventa conteúdo).

## Fluxo

```
captura:  payload do hook (stdin)
          -> summarize.ts   (resumo via provider configurável — claude-cli|codex-cli|anthropic|mock|disabled — extrai 4 categorias, anti-PII)
          -> .claude/knowledge/AAAA-MM-DD-<agent>-<slug>-<hash>.md   (VERSIONADO)
          -> embed.ts       (MiniLM LOCAL -> vetores 384d)  ->  rag.db (vec0/sqlite-vec)

injeção:  prompt -> search.ts (embeda, KNN cosseno, boost por categoria/fonte)
          -> hookSpecificOutput.additionalContext  (top-3 trechos)
```

**4 categorias** (do resumo): `bug` (causa raiz), `arquitetura` (decisão + porquê),
`padrao` (padrões do time), `falha` (o que não funcionou). Memória e DT entram como `memoria`/`dt`.

## Portabilidade entre máquinas (Mac/MAMP + Windows/Laragon)

Versiona-se a **fonte**; o **índice é derivado por máquina**:

- **No git:** scripts, hooks, `package.json`, `.claude/knowledge/*.md` (o conhecimento é texto).
- **Gitignored (por máquina):** `.claude/rag/` (`rag.db` + cache do modelo + log), `node_modules/`,
  `.claude/harness.env.local`.
- Após `git pull` no outro PC, o `SessionStart` (`rag-ensure-index.sh`) reconstrói o `rag.db` a partir
  dos `.md` versionados. Embeddings são determinísticos → busca idêntica nas duas máquinas.
- `node`/`php` são **auto-detectados** (PATH + MAMP/Laragon/nvm/Homebrew). Se falhar, defina
  `HARNESS_RAG_NODE`/`HARNESS_RAG_PHP` em `.claude/harness.env.local` (veja o `.example`).

## Privacidade (LGPD)

- **Embeddings 100% locais** (`all-MiniLM-L6-v2`/ONNX) — nenhum dado sai da máquina.
- **Resumo via LLM: o único egress.** O transcript vai ao **provider configurado** em
  `HARNESS_RAG_LLM_PROVIDER` — `claude-cli`/`anthropic` = Anthropic; `codex-cli` = OpenAI.
  Escolher o provider é escolher **para quem** o transcript vai. O system prompt **proíbe** PII
  de paciente (nome/CPF/telefone/e-mail) e há um **scrub** defensivo de CPF/telefone na saída.
  O conteúdo capturado é só aprendizado de engenharia.
- **Escopo dev:** a captura só roda na máquina de desenvolvimento (hooks do Claude Code); não há captura em produção.

## Comandos

```bash
npm run rag:reindex                 # reconstrói o rag.db das fontes versionadas
npm run rag:search -- "sua pergunta"   # busca (texto); --json para inspeção
npm run rag:embed -- <arquivo.md> [knowledge|memory|dt]   # indexa 1 arquivo

# teste sem chamar o modelo (resumo fake):
echo '<payload-json>' | HARNESS_RAG_SUMMARIZE_MOCK=1 \
  node node_modules/tsx/dist/cli.mjs .claude/scripts/summarize.ts --mode=agent --agent=x
```

## Configuração (`.claude/harness.env`)

| Var | Default | Para que |
|---|---|---|
| `HARNESS_RAG_ENABLED` | `1` | `0` desliga tudo (hooks viram no-op) |
| `HARNESS_RAG_TOPK` | `3` | trechos injetados por prompt |
| `HARNESS_RAG_CAPTURE_MIN_CHARS` | `800` | tamanho mínimo do transcript p/ resumir |
| `HARNESS_RAG_MODEL` | `Xenova/all-MiniLM-L6-v2` | modelo de embedding local |
| `HARNESS_RAG_LLM_PROVIDER` | `claude-cli` | provider do resumo: `claude-cli` (`claude -p`, assinatura, **sem chave**) · `codex-cli` (`codex exec`, login do Codex, sem chave) · `anthropic` (API key) · `mock` (fake, teste sem custo) · `disabled` (sem resumo) |
| `HARNESS_RAG_STOP_THROTTLE_MIN` | `30` | host Codex: intervalo mínimo (min) entre capturas via `Stop` — que dispara a cada turno |
| `HARNESS_RAG_CLAUDE_MODEL` | Haiku | modelo do `claude-cli` (alias ou nome completo) |
| `HARNESS_RAG_SUMMARIZE_TIMEOUT_MS` | `180000` | timeout por tentativa do resumo (era 120s fixo; subido p/ não estourar sob carga) |
| `HARNESS_RAG_SUMMARIZE_RETRIES` | `1` | retries em falha transitória (timeout/429/529), backoff 3s/6s |

Bypass pontual: `HARNESS_SKIP_RAG_CAPTURE=1`, `HARNESS_SKIP_RAG_INJECT=1`.
Override de caminhos por máquina: `.claude/harness.env.local` (gitignored).

**Pré-requisito do resumo:** depende de `HARNESS_RAG_LLM_PROVIDER`. Com **`claude-cli`** (default):
o `claude` no PATH, autenticado pela **assinatura** — **sem chave**, sem custo de API avulsa. Com
**`codex-cli`**: o `codex` no PATH, logado (`codex login`) — resumo via OpenAI, também sem chave
avulsa. Com **`anthropic`**: `ANTHROPIC_API_KEY` no ambiente. **`mock`** = resumo fake para
teste/CI **sem custo**; **`disabled`** = sem resumo (embeddings/busca seguem funcionando).
⚠️ **Privacidade:** os embeddings são locais, mas o resumo **envia o transcript ao provider
configurado** — Anthropic OU OpenAI, conforme a escolha. **Anti-reentrância genérica:** o
subprocesso do resumo roda com `HARNESS_RAG_IN_SUMMARIZE=1` (e o do revisor externo da dupla-cega,
com `HARNESS_IN_EXTERNAL_REVIEW=1`) — os hooks dos dois hosts respeitam os dois guards e saem
no-op lá dentro. Sem o provider disponível, a captura é um **no-op gracioso** (não quebra nada).

## Arquivos

- Scripts: `.claude/scripts/{summarize.ts, paths.ts, db.ts, embedder.ts, chunk.ts, indexer.ts, embed.ts, search.ts, reindex.ts}`
  - **Resumo:** `summarize.ts` (Node-only). Provider via `HARNESS_RAG_LLM_PROVIDER` — `claude-cli` (default; `claude -p`, assinatura, **sem chave**), `codex-cli` (`codex exec`, login do Codex), `anthropic` (API key), `mock` (teste sem custo) ou `disabled`. (O harness ainda suporta uma variante `summarize.php` específica de projeto via `HARNESS_RAG_SUMMARIZER=php`; não é usada por padrão.)
- Hooks: `.claude/hooks/{_rag-common.sh, rag-inject.sh, rag-capture-agent.sh, rag-capture-session.sh, rag-ensure-index.sh}`
- Wiring: `.claude/settings.json` · Config: `.claude/harness.env` (+ `.local` por máquina)
- Índice (derivado): `.claude/rag/rag.db` · Log: `.claude/rag/rag.log`

## Troubleshooting

- **RAG inerte / `node/tsx ausente (embed) — pulado` no `rag.log` (e a pasta `rag/` só tem o `.log`):**
  as **devDeps não estão instaladas**. Rode `npm install` na raiz + `npm run rag:reindex`. **Atenção:** o
  `node` estar no PATH **não** basta — o que falta é o `tsx` (e as outras 3 deps) em `node_modules/`, que é
  gitignored. NÃO é caso de mexer em `HARNESS_RAG_NODE` (ver a entrada do binário abaixo). Ver "Pré-requisitos".
- **Não injeta nada:** índice vazio? `npm run rag:reindex`. Veja `.claude/rag/rag.log`.
- **Captura não grava:** `anthropic_api_key` vazia, ou transcript < `MIN_CHARS`, ou resumo
  `{"relevante": false}` (nada técnico). Tudo é no-op silencioso — confira `rag.log`.
- **`FALHA no resumo (LLM timeout/indisponivel)` no `rag.log`:** o `claude -p` estourou o
  timeout (default 180s) ou a API ficou indisponível (429/529). O resumo já re-tenta 1× com
  backoff; se persistir, é carga local alta (muitos `claude -p` simultâneos de captura
  por-agent — confirme `HARNESS_RAG_CAPTURE_AGENTS='0'`) ou suba `HARNESS_RAG_SUMMARIZE_TIMEOUT_MS`.
  **Distinto de `nada relevante`** (resumo rodou OK, só não havia aprendizado técnico). Antes
  da 1.5.1 os dois casos logavam igual — foi o que escondeu uma fila de capturas perdidas.
- **O binário `node`/`php` não é encontrado no hook** (ex.: instalado via nvm, fora do PATH do hook —
  distinto de "deps ausentes" acima): defina `HARNESS_RAG_NODE`/`HARNESS_RAG_PHP` em `harness.env.local`.
- **Latência do prompt:** a injeção carrega o modelo (~2–4s frio). Se incomodar, suba o `timeout`
  do hook em `settings.json` ou (futuro) rode um daemon de embedding quente.

## Evolução futura (não no v1)

- Daemon de embedding quente (elimina o cold-start da injeção).
- Promoção de conhecimento auto-capturado valioso para `.claude/memory/` curada.
- Captura via `SubagentStop` (transcript completo do agent) se preferir mais riqueza que o resultado.
