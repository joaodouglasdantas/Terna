# RAG do Harness — Decisões + Guia de Portabilidade

> Documento **portátil**. Resume o que foi decidido/construído na camada de RAG (captura de
> conhecimento) para você levá-la ao seu **harness padrão** e ativá-la **por projeto**.
> A camada operacional do dia a dia está em `.claude/RAG.md` (no repo de origem).

---

## ⚠️ Política: RAG é OPT-IN (ativado por projeto)

**Nem todo projeto precisa.** O harness padrão (lint, memory-sync, codex-review) funciona sem RAG.
A camada de RAG só compensa em projetos **longos e contínuos**, onde o aprendizado se acumula
(bugs com causa-raiz, convenções, decisões). Em projeto curto/one-off, **não ative**.

**Como tratar no harness padrão:**
- Distribua o RAG como **módulo opcional**, com `HARNESS_RAG_ENABLED='0'` por **default** no
  `harness.env` mestre. Assim, mesmo que o harness inteiro seja copiado, o RAG fica **dormente**
  (os hooks checam a flag e saem `0` imediatamente — custo ~zero, sem tocar em Node/API).
- **Ativar num projeto** = 3 passos conscientes: (1) `npm install` das deps; (2) flip
  `HARNESS_RAG_ENABLED='1'`; (3) garantir as entradas de hook no `settings.json`.
- **Desativar a qualquer momento:** `HARNESS_RAG_ENABLED='0'` (kill-switch global) ou os bypass
  pontuais `HARNESS_SKIP_RAG_CAPTURE=1` / `HARNESS_SKIP_RAG_INJECT=1`.

Regra de bolso: **ligue o RAG quando o projeto for durar o bastante para você esquecer o que
aprendeu nele.**

---

## O que a camada faz

Captura aprendizados técnicos automaticamente em 3 momentos e injeta o conhecimento relevante de
volta no contexto a cada prompt. **Evolui** o sistema de memória/DT existente (indexa o
auto-capturado **+** memória curada **+** débitos técnicos) — não cria um silo paralelo.

| Momento | Evento (hook) | Cadência | Ação |
|---|---|---|---|
| Fim de um agent | `PostToolUse` matcher `Agent\|Task` (async) | por subagent | resume e indexa o que o agent aprendeu |
| Fim da sessão | `SessionEnd` (async) | 1×/sessão | síntese da sessão inteira |
| Início do prompt | `UserPromptSubmit` (síncrono) | por prompt | injeta top-3 trechos via `additionalContext` |
| Bootstrap do índice | `SessionStart` (async) | 1×/sessão | reconstrói o índice se faltar/desatualizar (portabilidade) |

Fluxo: `payload do hook → summarize (LLM) → .claude/knowledge/*.md (versionado) → embed (LOCAL) →
rag.db (sqlite-vec) → search → additionalContext`.

---

## Decisões tomadas (com o porquê)

| # | Decisão | Por quê | O que é específico do projeto |
|---|---|---|---|
| 1 | **Arquitetura híbrida** (evoluir, não substituir) | Reaproveita memória/DT já curados; um só acervo pesquisável | As pastas-fonte a indexar (`.claude/memory/`, `prds/debito_tecnico/`) variam por projeto |
| 2 | **Runtime TS/Node** para embed/search/reindex | Libs maduras de vetor/embedding; tooling dev-only (trava de versão da linguagem do app não se aplica) | — (portável) |
| 3 | **Resumo via LLM** — 2 variantes prontas: `summarize.ts` (genérica, Node-only, chave via env) **e** `summarize.php` (reusa cliente do projeto) | Harness padrão usa a TS (zero PHP); projeto com cliente próprio usa a PHP | Seleção via `HARNESS_RAG_SUMMARIZER=ts\|php` (auto: PHP se presente, senão TS) — ver Adaptação #1 |
| 4 | **Embeddings 100% locais** (`all-MiniLM-L6-v2`, 384d) | LGPD/privacidade: nenhum dado sai da máquina; offline; grátis | — (portável; troque o modelo só se precisar de outra língua/dim) |
| 5 | **`PostToolUse[Agent\|Task]`** p/ fim-de-agent (em vez de `SubagentStop`) | Documentado e confiável; evita risco de captura dupla. `SubagentStop` ficou como alternativa | — (portável) |
| 6 | **`SessionEnd`** p/ síntese de sessão (não `Stop`) | `Stop` dispara a cada turno; síntese da sessão é 1×/sessão | — (portável) |
| 7 | **Portabilidade: fonte versionada, índice derivado** | `.md` viajam no git; `rag.db` é reconstruído por máquina (extensão nativa é por-SO; embeddings determinísticos → busca idêntica) | — (portável) |
| 8 | **Caminhos auto-detectados** (node/php) + override `harness.env.local` | Mesma base roda em MAMP (macOS) e Laragon (Windows) sem editar arquivo versionado | Os locais conhecidos a tentar variam por stack |

### Tensão aceita (privacidade)
Embeddings locais **mas** o resumo manda o transcript ao **provider configurado** (Anthropic ou
OpenAI, conforme `HARNESS_RAG_LLM_PROVIDER` — escolher o provider é escolher para quem o
transcript vai). Mitigação embutida: o system prompt
**proíbe PII** (nome/CPF/telefone/e-mail de paciente) e há **scrub** de CPF/telefone na saída +
guard de produção. Validado: payload com PII fake → saída sem nenhuma PII.

---

## Componentes (o que copiar)

**Scripts** (`.claude/scripts/`):
- `paths.ts` — localizações + config (resolve raiz por `HARNESS_RAG_PROJECT_ROOT`/cwd)
- `db.ts` — abre `rag.db`, carrega `sqlite-vec`, schema (`knowledge` + `vec_knowledge float[384]`)
- `embedder.ts` — MiniLM local (cache project-local, import dinâmico ESM)
- `chunk.ts` — chunks ≤~200 tokens (teto do MiniLM é 256), preserva heading
- `indexer.ts` — `indexFile()` + `categoryFor()` (bug/arquitetura/padrao/falha/memoria/dt)
- `embed.ts` / `search.ts` / `reindex.ts` — CLIs (search tem modo `--hook`)
- `summarize.ts` — **passo do LLM, variante GENÉRICA Node-only.** Default do harness padrão. Provider via `HARNESS_RAG_LLM_PROVIDER`: **`claude-cli`** (`claude -p`, assinatura, sem chave) por padrão; `codex-cli` (`codex exec`, login do Codex); `anthropic` (legado) lê `ANTHROPIC_API_KEY`; `mock` (teste sem custo); `disabled`.
- `summarize.php` — variante específica de projeto (reusa o cliente LLM do projeto). Opcional.

**Hooks** (`.claude/hooks/`):
- `_rag-common.sh` — resolve node/php (PATH + MAMP/Laragon/nvm/Homebrew + `harness.env.local`), helpers
- `rag-capture-agent.sh`, `rag-capture-session.sh`, `rag-inject.sh`, `rag-ensure-index.sh`

**Config/wiring:** bloco RAG no `harness.env`, `harness.env.local.example`, snippet no
`settings.json`, `.gitignore` do índice, checks no `harness-doctor.sh`, doc `RAG.md`.

---

## Guia de portabilidade (checklist para o outro repo)

1. **Decidir** se o projeto quer RAG (ver política opt-in). Se não, pare aqui.
2. **Copiar** `.claude/scripts/*` e `.claude/hooks/{_rag-common,rag-*}.sh`.
3. **Deps npm** (devDependencies):
   ```bash
   npm install --save-dev tsx better-sqlite3 sqlite-vec @huggingface/transformers
   ```
   E os scripts `rag:embed` / `rag:search` / `rag:reindex` no `package.json`.
4. **Wiring** — adicionar ao `.claude/settings.json` (preservando os hooks existentes):
   ```json
   "SessionStart":    [{ "hooks": [{ "type":"command","command":"bash .claude/hooks/rag-ensure-index.sh","async":true,"timeout":600 }] }],
   "UserPromptSubmit":[{ "hooks": [{ "type":"command","command":"bash .claude/hooks/rag-inject.sh","timeout":15 }] }],
   "SessionEnd":      [{ "hooks": [{ "type":"command","command":"bash .claude/hooks/rag-capture-session.sh","async":true,"timeout":120 }] }],
   "PostToolUse":     [{ "matcher":"Agent|Task","hooks": [{ "type":"command","command":"bash .claude/hooks/rag-capture-agent.sh","async":true,"timeout":120 }] }]
   ```
   (`SessionStart`/`PostToolUse` provavelmente já existem — **acrescente** ao array, não substitua.)

   > **Host Codex (2.0.0):** o wiring equivalente vive em `.codex/hooks.json` — lá não há
   > `SessionEnd` nem `PostToolUse[Agent|Task]`: a captura de sessão usa **`Stop` com throttle**
   > (`HARNESS_RAG_STOP_THROTTLE_MIN`, default 30 min — `Stop` dispara a cada turno) e a
   > por-agente, **`SubagentStop`** (síncronos — não existe `async` no Codex). O extrator de
   > transcript é genérico: formato não reconhecido cai no gate de tamanho e vira no-op. O
   > `harness-sync.sh --target codex|all` instala esse arquivo.
5. **harness.env** — colar o bloco RAG. No harness **mestre**, default `HARNESS_RAG_ENABLED='0'`
   (dormente); o projeto que quiser liga `'1'`.
6. **.gitignore** — ignorar o índice derivado e o override local:
   ```
   .claude/rag/
   .claude/harness.env.local
   ```
   **Versionar** `.claude/knowledge/` (com um `.gitkeep`).
7. **Resumo:** use `summarize.ts` (default). Escolha o provider em `HARNESS_RAG_LLM_PROVIDER`
   (`claude-cli` | `codex-cli` | `anthropic` | `mock` | `disabled`):
   - **`claude-cli`** (recomendado no host Claude): usa `claude -p`, que autentica pela **assinatura** do Claude Code — **sem chave, sem custo de API avulsa**. Requer só o `claude` no PATH.
   - **`codex-cli`**: usa `codex exec`, autenticado pelo login do Codex (OpenAI) — sem chave avulsa. Escolha natural no host Codex.
   - **`anthropic`** (legado): API HTTP via `fetch` — `export ANTHROPIC_API_KEY='sk-ant-...'`.
   - **`mock`**: resumo fake — **teste/CI sem custo** (mesmo efeito do `HARNESS_RAG_SUMMARIZE_MOCK=1`).
   - **`disabled`**: sem resumo (o resto do RAG segue funcionando).
   - ⚠️ **Privacidade:** embeddings são locais, mas o **resumo envia o transcript ao provider
     configurado** — Anthropic OU OpenAI, conforme a escolha. **Anti-reentrância genérica:** o
     subprocesso do resumo roda com `HARNESS_RAG_IN_SUMMARIZE=1` (e o do revisor externo da
     dupla-cega, com `HARNESS_IN_EXTERNAL_REVIEW=1`) — os hooks dos dois hosts respeitam os dois
     guards e saem no-op lá dentro.
   - Só traga `summarize.php` se quiser reusar um cliente LLM do projeto (ver Adaptação #1).
8. **harness-doctor.sh** — colar os checks de RAG (node/deps/scripts/hooks/db).
9. **Validar**: `npm run rag:reindex` → `npm run rag:search -- "uma pergunta do domínio"` →
   simular `rag-inject.sh` e `rag-capture-agent.sh` (modo mock: `HARNESS_RAG_SUMMARIZE_MOCK=1`).

---

## Pontos de adaptação por projeto

**#1 — O passo de resumo (o que mais varia por projeto).** Há **DUAS variantes prontas**, com o mesmo contrato:
- **`summarize.ts` (default do harness padrão):** Node-only, não exige PHP → cai em qualquer stack. Resumo via provider configurável (`HARNESS_RAG_LLM_PROVIDER`): **`claude-cli`** por padrão (`claude -p`, assinatura, **sem chave**); `codex-cli` (`codex exec`, login do Codex — natural no host Codex); `anthropic` (legado) lê `ANTHROPIC_API_KEY` e chama a API via `fetch`; `mock` (teste sem custo); `disabled` (sem resumo). **Use esta no harness padrão.**
- **`summarize.php` (específica de projeto):** reusa o cliente LLM do projeto (ex.: resolve a chave de um banco/serviço). Use quando já houver um cliente que valha reaproveitar.

Seleção (em `_rag-common.sh`): `HARNESS_RAG_SUMMARIZER=ts|php` força; sem ela, **auto** = PHP se `summarize.php` existir + php resolvido, senão TS. **No harness padrão, distribua só `summarize.ts`** (e, se quiser ser explícito, `HARNESS_RAG_SUMMARIZER=ts`). Trocar de cliente LLM = editar só `chamarAnthropic()` no `summarize.ts`.

O **contrato** com o resto do sistema é o que importa, e deve ser mantido:
- **Entrada:** payload do hook no stdin (campos `transcript_path` **ou** `tool_input`+`tool_output`).
- **Saída:** grava `.claude/knowledge/AAAA-MM-DD-<agent>-<slug>-<hash>.md` (frontmatter + 4 seções:
  `## Bugs…`, `## Decisões de arquitetura`, `## Padrões…`, `## O que não funcionou`) e **imprime o
  caminho no stdout** (o hook embeda esse arquivo).
- **Guards obrigatórios:** anti-PII no prompt + scrub, guard de produção, gate de relevância
  (`{"relevante": false}` ⇒ não grava), gate de tamanho mínimo.
- **Modo mock** (`HARNESS_RAG_SUMMARIZE_MOCK=1`) para teste/CI sem custo.

**#2 — Fontes a indexar** (`reindex.ts`): ajuste as pastas (`.claude/memory/`,
`prds/debito_tecnico/`, etc.) ao que o projeto tem; pule índices puros (`MEMORY.md`/`INDEX.md`).

**#3 — Detecção de runtime** (`_rag-common.sh`): a lista de locais de `php`/`node` reflete
MAMP/Laragon/nvm. Em outra stack, ajuste ou confie no override `harness.env.local`.

**#4 — Embedding**: `all-MiniLM-L6-v2` é 384d e trunca em 256 tokens (por isso chunk ≤~200).
Se trocar o modelo, **atualize `EMBED_DIM`** em `paths.ts` e o `float[N]` do `vec0` em `db.ts`.

---

## Gotchas técnicos (economizam horas no port)

- **sqlite-vec exige `rowid` como `BigInt`** no INSERT do `vec0` (senão *"Only integers are allowed
  for primary key"*). Embedding entra como **BLOB Float32 little-endian**.
- **`vec0` com `distance_metric=cosine`** + embeddings **normalizados** (mean pooling + normalize).
- **MiniLM trunca em 256 tokens** → chunks ≤ ~200 tokens (o "200–300" de receitas genéricas estoura).
- **`node:sqlite` vs `better-sqlite3`**: usamos `better-sqlite3` (precisa de build tools nativos —
  Xcode CLT no macOS). `sqlite-vec` tem suporte de 1ª classe a ele.
- **`node` pode não estar no PATH do contexto do hook** (ex.: nvm) → resolução explícita é obrigatória.
- **`async`/`timeout` nos hooks**: confirme suporte na sua versão do CLI. Se ignorado, degrada para
  síncrono (mais lento, não quebra).
- **Latência da injeção** (`UserPromptSubmit` síncrono): carregar o modelo é ~2–4s frio. Aceitável no
  v1 com degradação graciosa; otimização futura = daemon de embedding quente.

---

## Snippets prontos para colar

**`package.json` (scripts):**
```json
"rag:embed":   "tsx .claude/scripts/embed.ts",
"rag:search":  "tsx .claude/scripts/search.ts",
"rag:reindex": "tsx .claude/scripts/reindex.ts"
```

**`.claude/harness.env` (bloco RAG — default DESLIGADO no harness padrão):**
```bash
# ===== RAG / captura de conhecimento (modulo OPCIONAL) =====
# Default DESLIGADO. Ligue por projeto que precise (ver RAG-PORTING.md).
HARNESS_RAG_ENABLED='0'
HARNESS_RAG_TOPK='3'
HARNESS_RAG_CAPTURE_MIN_CHARS='800'
# HARNESS_RAG_MODEL='Xenova/all-MiniLM-L6-v2'
# HARNESS_RAG_SUMMARIZER='ts'   # harness padrao: TS (Node-only). Resumo via claude-cli (sem chave) por default.
# Bypass: HARNESS_SKIP_RAG_CAPTURE=1 / HARNESS_SKIP_RAG_INJECT=1
```

**`.gitignore`:**
```
.claude/rag/
.claude/harness.env.local
```

(O snippet do `settings.json` está na seção "Guia de portabilidade", passo 4.)

## Evolução futura (fora do v1)
- Daemon de embedding quente (elimina cold-start da injeção).
- Promoção de conhecimento auto-capturado valioso para a memória curada.
- Trocar `PostToolUse[Agent]` por `SubagentStop` se quiser o transcript completo do agent.
