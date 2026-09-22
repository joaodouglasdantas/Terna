---
name: codex-review
description: "Roda o loop de code review sobre o working tree atual em dupla-cega (revisor externo do outro modelo + persona sherlock), com triagem e ciclos de correcao limitados. Use antes de commitar mudancas relevantes."
---

# Code Review (dupla-cega: Codex + sherlock)

> **Multi-AI (2.0.0).** O revisor externo agora e resolvido pelo host via
> `.claude/hooks/external-review.sh`: host Claude Code → revisor externo = Codex CLI;
> host Codex → revisor externo = Claude CLI. Config: `HARNESS_HOST` e
> `HARNESS_EXTERNAL_REVIEWER` no `harness.env`; ver `.claude/PLATAFORMAS.md` §8.
> O helper `codex-review.sh` continua existindo como **shim compativel** — as chamadas
> desta skill seguem funcionando. Quando o revisor externo esta indisponivel (CLI ausente,
> sem login, **limite de uso** — ou `HARNESS_EXTERNAL_REVIEWER=none`), o review roda em
> **SOLO-2** (3.4.24): DOIS sherlocks na MESMA mensagem sobre o mesmo working tree, com lentes
> disjuntas `A` (correcao + seguranca + armadilhas do Perfil) e `B` (contratos + regressao +
> invariantes + banco + testes), cruzados na triagem como Codex + sherlock seriam. O relatorio
> final DEVE registrar `review: SOLO-2 (2 sherlocks, lentes A/B — externo: <motivo>)` — nunca
> descrever como dupla-cega. Um sherlock so (`modo solo (1 revisor)`) fica para o
> `--apenas-sherlock` explicito.

Skill standalone para rodar o loop de code review sobre o working tree atual, fora do
contexto de `/prd-exec`. Mesma mecanica da Fase 2: **dois revisores independentes em
paralelo** — o Codex CLI (helper `.claude/hooks/codex-review.sh`) e o agente **sherlock**
(Claude) — sem ver um ao outro (dupla-cega). Sem Codex no ambiente, roda so o sherlock.
Mesmas convencoes (relatorios na pasta do Perfil/`harness.env`) e o mesmo **limite de
ciclos do Perfil** (Codex review → "Limite de ciclos"; ausente = 4, `0` = sem limite —
alinhado com a Fase 2 de `.claude/skills/prd-exec/SKILL.md`).

## Passo 0 — Carregar o Perfil do Projeto

Leia `.claude/PERFIL-PROJETO.md` antes de comecar — especialmente as secoes
**Armadilhas do projeto** (regua da triagem), **Codex review** (pasta de relatorios,
limite de ciclos) e **Agentes do harness (modelos)** ("Modelo do sherlock": se `opus` ou `fable`,
passe `model: "<valor>"` nas chamadas Agent do sherlock; ausente = Sonnet default; o esforco
e o da sessao — nao ha por chamada, 3.4.25). Se o
projeto tiver um `CLAUDE.md` com bloco "Armadilhas", use os dois.

## Uso

```
/codex-review                       # dupla-cega no working tree atual (sem rotulo de PRD)
/codex-review PRD-NNN               # review rotulado como pertencente a uma PRD
/codex-review hotfix-modulo         # review rotulado com label livre
/codex-review --no-fix              # so reporta achados, nao tenta corrigir
/codex-review --max-ciclos=2        # sobrepoe o limite do Perfil neste run (0 = sem limite)
/codex-review --apenas-codex        # desliga o sherlock neste run
/codex-review --apenas-sherlock     # desliga o Codex neste run
```

- Sem argumento: usa label `WT` (working tree).
- Com argumento livre: usa como `<LABEL>` no nome do relatorio.
- `--no-fix`: pula o loop de auto-correcao — util quando voce quer so um diagnostico.
- `--max-ciclos=N`: override pontual do limite do Perfil (`0` = sem limite).
- `--apenas-codex` / `--apenas-sherlock`: forca modo solo (default e dupla-cega). As duas
  flags continuam validas em qualquer host — aqui "codex" significa "revisor externo":
  no host Codex, o revisor externo e o Claude CLI (ver PLATAFORMAS.md §8).

## Quando usar

- Hotfix manual fora de PRD: quer um sanity check antes de commit.
- Mudancas grandes em arquivo unico.
- Antes de abrir PR/merge em branch que nao passou por `/prd-exec`.
- Apos resolver um DT pequeno sem PRD formal.
- Diagnostico standalone: `--no-fix` para so listar achados.

## Quando NAO usar

- Durante uma `/prd-exec` em andamento — a Fase 2 ja faz isto e e o ponto certo.
- Para validar working tree limpo (`git status --porcelain` vazio) — o helper retorna
  sem fazer nada.
- Para revisar commits ja feitos: o helper le `--uncommitted` (working tree local).
  Para commits, use `/codex:review` do plugin Codex.

## Pre-condicoes e modo de operacao

Mesma logica da Fase 2 do `/prd-exec`:

- **Codex disponivel?** `command -v codex` OK + `~/.codex/auth.json` existe +
  `HARNESS_SKIP_CODEX_REVIEW` nao e `1` + sem `--apenas-sherlock` + preflight ok:
  `bash .claude/hooks/harness-delegate.sh --preflight codex-cli` (3.4.24; cacheado, <1s). Se
  devolver `PREFLIGHT|indisponivel|codex-cli|limite-ate <data>`, o Codex esta em limite de uso
  ate aquela data — **nao tente de novo nesta run**; review em SOLO-2 com motivo
  `limite de uso ate <data>`.
- **Sherlock disponivel?** `.claude/agents/sherlock.md` existe + `HARNESS_SKIP_SHERLOCK`
  nao e `1` + sem `--apenas-codex`.
- **Ha o que revisar?** Working tree com mudancas (`git status --porcelain` nao vazio).

Modos: ambos OK = **DUPLA-CEGA** (padrao); Codex indisponivel = **SOLO-2** (dois sherlocks,
lentes A/B — avisar por que o externo faltou); `--apenas-sherlock` = solo (1 sherlock,
lente completa); `--apenas-codex` ou sherlock indisponivel = CODEX-SOLO; nenhum OK ou working
tree limpo = registrar warning e parar — nunca bloquear o usuario.

> **Esforco da sessao — fase EXECUTAR (3.5.3).** O Perfil ("Nivel de esforco" → linha "Esforco — fase executar",
> default `medium`; `high` no preset maximo) diz o esforco que a sessao deve ter nesta skill. No
> inicio, rode `bash .claude/hooks/esforco.sh executar --atual <nivel>` — o `<nivel>` vem de
> `mcp__ccd_session_mgmt__get_session` com `session_id: "self"` (campo `effort`) quando a ferramenta
> existir; sem ela, omita `--atual`. Saida `AJUSTAR` = avise UMA vez, *"Esforco: fase executar pede X; sessao
> em Y — ajuste com `/effort X` (ou responda 'seguir')"*, e espere a resposta antes de despachar subagente;
> `ok`/`n/d` = siga. Nenhum subagente tem esforco proprio — todos herdam o da sessao (medido 12/09,
> PRD-142-b: 83% dos tokens dos executores eram raciocinio herdado de uma sessao em `high`).

## Procedimento

### 1. Parsear argumentos

- Capturar `<LABEL>` (default `WT`).
- Capturar flags: `--no-fix`, `--max-ciclos=N` (default = Perfil → Codex review →
  "Limite de ciclos"; ausente/invalido = 4; `0` = sem limite), `--apenas-codex`,
  `--apenas-sherlock`. Anunciar o limite efetivo ao usuario antes do ciclo 1.

### 2. Listar arquivos do working tree

```bash
git status --porcelain
git diff --stat
```

Mostrar resumo curto pro usuario antes de disparar (numero de arquivos, +linhas/-linhas).

### 3. Ciclo 1 — disparar os revisores EM PARALELO

No modo dupla-cega, disparar os dois **na mesma mensagem** (Bash + Agent, mesmo turno):

```bash
bash .claude/hooks/codex-review.sh <LABEL> 1   # (shim de external-review.sh)
```

```
subagent_type: "sherlock"
description: "Review sherlock <LABEL> ciclo 1"
prompt: """
Revise o working tree atual deste repositorio. Rotulo: <LABEL>, ciclo 1.
Leia o Perfil e o harness.env, levante o diff via git, investigue pelas suas lentes,
salve o relatorio na pasta de relatorios e devolva o relatorio completo.
NAO leia relatorios de review existentes (dupla-cega).
"""
```

(Lembrete: `model: "opus"`/`"fable"` na chamada Agent se o Perfil pedir — ver Passo 0.)

**SOLO-2 (Codex indisponivel, 3.4.24):** no lugar do helper, dispare **dois** sherlocks na
MESMA mensagem com o prompt acima e uma linha a mais no fim de cada: `Lente: A` no primeiro
(`description: "Review sherlock <LABEL> ciclo 1 lente A"`) e `Lente: B` no segundo. Sem
`Lente:` o sherlock roda `completa` (modo de um sherlock so). Nao escreva teto nem contagem
no prompt.

Capturar `stdout` do helper (path do relatorio Codex) → ler via `Read`; o sherlock
devolve o relatorio direto. Em CODEX-SOLO/`--apenas-sherlock`, disparar apenas o revisor
disponivel; em SOLO-2, os dois sherlocks.

### 4. Triagem (com cruzamento dupla-cega)

**Cruzar os achados primeiro** (quando ha dois relatorios — Codex + sherlock, ou os dois
sherlocks do SOLO-2), casando por `arquivo:linha`/tema: apontado pelos DOIS = quase certeza de
problema real; apontado por UM so = validar com mais ceticismo (ler o codigo antes de aceitar;
na duvida, Sugestao). Em SOLO-2 as lentes sao disjuntas de proposito — achado de um so e o
caso normal; use a **confianca** declarada pelo sherlock (3.4.24: alta/media/baixa por achado)
como peso da validacao, nunca descarte `baixa` sem ler o codigo.

Para cada achado (da uniao dos relatorios):

- **Bloqueante** — bug confirmado, regressao, violacao das **Armadilhas do projeto**
  (ver Perfil), security (injection, XSS, token, prepared statements), schema (FK,
  charset, soft delete), perda de dados.
- **Sugestao** — estilo, refatoracao, dead code, naming. Cosmetico.

Em duvida: tratar como Sugestao (conservador).

### 5. Guarda

- **>10 bloqueantes no ciclo 1:** parar imediatamente. Reportar lista resumida + path
  do relatorio + recomendacao de revisao manual. NAO entrar no loop de auto-correcao.
- **Modo `--no-fix`:** pular para o passo 7 direto, sem tentar corrigir.

### 6. Loop de auto-correcao + re-review (apenas se nao for `--no-fix`)

Para cada Bloqueante:

1. `Read` no `arquivo:linha` citado.
2. **Validar criticamente** confrontando com:
   - **Armadilhas do projeto** (Perfil → Armadilhas; e/ou `CLAUDE.md`).
   - Memorias do projeto em `.claude/memory/` (se houver).
   - Intencao deliberada (ex: usar o relogio do servidor num campo de auditoria
     `created_at` — permitido; ja em data de negocio — proibido, ver Perfil).
3. **Decisao:**
   - **Valido** → aplicar `Edit`. O hook de lint (`lint.sh`) valida sintaxe
     automaticamente. Registrar em "Bloqueantes corrigidos".
   - **Falso positivo** → documentar justificativa citando convencao/memoria. Registrar
     em "Falsos positivos justificados". NAO aplicar correcao.

Apos tratar todos os bloqueantes do ciclo `N`:

- Se `N == limite` (e limite > 0): parar e reportar (passo 7) — **a decisao de continuar
  e humana**: no reporte, oferecer as opcoes (re-rodar com `--max-ciclos` maior, revisar
  manualmente, ou aceitar os bloqueantes restantes). Nunca rodar ciclo extra por conta
  propria.
- Caso contrario: rodar ciclo `N+1` — re-disparando **os mesmos revisores do ciclo 1, em
  paralelo** (mesma mecanica do passo 3, trocando o numero do ciclo):
  ```bash
  bash .claude/hooks/codex-review.sh <LABEL> <N+1>   # (shim de external-review.sh)
  ```
  (+ a chamada Agent do sherlock com "ciclo <N+1>", na mesma mensagem, se dupla-cega.)
  Re-triagem com cruzamento. Se zero bloqueantes → parar (sucesso). Se ainda houver →
  voltar ao loop.

**Limite:** lido do Perfil (Codex review → "Limite de ciclos"; ausente = 4; `0` = sem
limite), com override pontual via `--max-ciclos=N`. Esgotou com bloqueantes → reporta e
para; quem decide o proximo passo e o usuario.

### 7. Reportar

Saida estruturada:

```
## Code Review — <LABEL>

**Modo:** <DUPLA-CEGA | SOLO-2 (2 sherlocks, lentes A/B — codex: motivo) | SHERLOCK-SOLO (--apenas-sherlock) | CODEX-SOLO (sherlock: motivo)>
**Modelo do sherlock:** <sonnet (default) | opus (Perfil)>

| Ciclo | Bloqueantes (ambos/so 1) | Sugestoes | Status     |
|-------|--------------------------|-----------|------------|
| 1     | N (K/J)                  | M         | corrigido  |
| 2     | N' (K'/J')               | M'        | corrigido  |
| 3     | 0                        | M''       | LIMPO      |

### Bloqueantes corrigidos
- arquivo:linha — descricao curta da correcao

### Falsos positivos justificados
- arquivo:linha — justificativa: ...

### Sugestoes pendentes (informativo, nao foram tratadas)
- arquivo:linha — descricao

### Relatorios
- <pasta-de-relatorios>/<LABEL>-ciclo1-*.md (Codex)
- <pasta-de-relatorios>/<LABEL>-sherlock-ciclo1-*.md (sherlock)
- ... (um par por ciclo)

### Status final
<LIMPO no ciclo N | ABORT no ciclo final com K bloqueantes restantes | NO-FIX (so diagnostico)>
```

Se ABORT (ciclos esgotados com bloqueantes): anexar recomendacao de revisao manual **e**
as opcoes para o usuario decidir — re-rodar com `--max-ciclos` maior, revisar manualmente,
ou aceitar os bloqueantes restantes (registrando-os, ex. via `/dt`). A skill nunca decide
sozinha.

## Diferencas vs Fase 2 do `/prd-exec`

| Aspecto                  | `/codex-review`                       | Fase 2 do `/prd-exec`                           |
|--------------------------|---------------------------------------|-------------------------------------------------|
| Quando                   | Sob demanda, qualquer hora            | Automatico, apos Fase 1 do `/prd-exec`          |
| Rotulo                   | `<LABEL>` (default `WT`)              | `PRD-NNN`                                       |
| Bloqueio                 | Nunca bloqueia commit                 | Bloqueia mensagem de commit em ABORT            |
| Output                   | Tabela standalone neste arquivo       | Bloco "Code Review Codex" em "PRD-NNN Executada" |
| Atualiza Status da PRD   | Nao                                   | Sim (em ABORT)                                  |
| `--no-fix`/`--max-ciclos`/`--apenas-*` | Sim                     | Nao (loop completo, limite do Perfil, dupla-cega) |

## Bypass / overrides

- `HARNESS_SKIP_CODEX_REVIEW=1` — desativa o Codex (review em SOLO-2: dois sherlocks, lentes A/B).
- `HARNESS_SKIP_SHERLOCK=1` — desativa o sherlock (Codex segue rodando, modo solo).
- `HARNESS_CODEX_REPORTS=path` — muda a pasta de relatorios (definir em `harness.env`;
  default `codex-reviews/` na raiz do repo).

## Limitacoes conhecidas

- **NAO substitui a Fase 2 do `/prd-exec`.** Se voce esta executando uma PRD, deixe
  `/prd-exec` rodar a Fase 2 — ela tem gating no Output e no Status da PRD.
- **NAO funciona em commits ja feitos.** Helper e sherlock olham o working tree. Para
  commits, use `/codex:review` do plugin.
- **Working tree limpo encerra silencioso.** Nao ha o que revisar.

## Referencias

- Helper: `.claude/hooks/external-review.sh` (chamado aqui via shim compativel
  `.claude/hooks/codex-review.sh`)
- Config dos hooks: `.claude/harness.env`
- Perfil do projeto: `.claude/PERFIL-PROJETO.md`
- Fase equivalente: `.claude/skills/prd-exec/SKILL.md` (secao "Fase 2 — Code Review por Codex")
