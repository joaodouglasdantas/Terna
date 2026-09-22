# Auditoria de prompts — os 14 agentes do harness para os modelos Claude 5

> **Data:** 2026-09-08 · **Harness:** 3.4.25 (Onda D, item 19 + melhoria 2) · **Régua:** `claude-api/shared/prompt-audit.md`
> (grupos 1a–1f, 2, 3, 4 e a keep list) + seções "Behavioral shifts" de `model-migration.md` para Sonnet 5, Opus 5 e
> Fable 5.1. A régua existia no diretório bundled (`bundled-skills/2.1.260/…/claude-api/shared/`) e foi lida inteira.
> **Regra da casa que vence o guia quando conflita:** "instrução não segura, hook segura" e "nunca escreva teto/contador no prompt".

## Escopo e modelo-alvo (Step 0)

- **Escopo:** `.claude/agents/*.md` (14 arquivos: 12 genéricos que viajam no sync + `datilografo`/`zelador`, só do vault),
  os adapters Codex `.codex/agents/*.toml` (10) e, como surface de comparação, os prompts de despacho das skills
  `prd`/`prd-exec`/`dt-exec`/`codex-review` (fora do escopo de edição desta onda — só `flag`).
- **Modelo-alvo:** Sonnet 5 (default de todos os genéricos), Opus 5 (override do Perfil no preset `maximo` e os dois
  agentes Beta) e Fable 5.1 (sessão-pai / host). Cruft é relativo a esses três.
- **Proveniência:** o `git blame` não foi necessário — os próprios textos datam-se: tags de versão `(3.4.12)`, `(2.4.0)`,
  narrativas "Medido 01–02/09: 418 das 619 chamadas…", "incidente real: `cat > /tmp_check.php` … 4h15".
- **Linhas citadas** referem-se aos arquivos ANTES da edição (snapshot 3.4.24, commit `d9d9c2b`).

## Resumo

| Grupo | Achados | Alta | Média | Baixa/flag |
|---|---|---|---|---|
| 1a Pressão (caixa alta sem porquê, hedges) | 6 | 1 | 5 | 0 |
| 1b Scaffolds substituídos por feature | 1 | 0 | 0 | 1 |
| 1c Sobre-especificação / repetição / duplicação | 7 | 3 | 3 | 1 |
| 1d Fósseis (narrativa de incidente, tag de versão, "agora funciona diferente", regra que o hook já segura) | 9 | 8 | 1 | 0 |
| 1e Clusters de proibição | 2 | 0 | 1 | 1 |
| 1f Coreografia de saída (tetos numéricos, contadores) | 4 | 2 | 1 | 1 |
| 2 Skill files (conteúdo datado, número divergente entre arquivos, específico volátil) | 4 | 1 | 2 | 1 |
| 3 Ferramentas (tools inválidas no contexto, contrato ≠ comportamento) | 4 | 3 | 1 | 0 |
| 4 Config/arquitetura (contador no contexto, agente redundante, prompt de skill) | 6 | 1 | 0 | 5 |
| **Total** | **43** | **19** | **14** | **10** |

**Ações:** 19 `move` (mecânica → contrato do papel), 13 `rewrite`, 3 `remove`, 2 `add`, 10 `flag` (6 fora do escopo desta
onda — skills/hook —, 4 de baixa confiança mantidos). Todos os de confiança alta e média foram **aplicados** nos `.md`
(e nos `.toml`); os `flag` ficam só aqui.

**Os três achados de maior impacto (em prosa):**

1. **A mecânica repetida com números divergentes (achados D1–D7).** Sete blocos "Ferramenta certa para LER", três
   "classificador indisponível", três "dois níveis", dois "Edit-first", três "invariantes", dois "lint do projeto" e três
   "fôlego" — cada cópia com a sua narrativa de incidente (datas, PRD, "418 das 619 chamadas", "4h15", "398 turnos e 47
   min"). Para um modelo que trata cada frase como sinal acionável, isso é reconciliação de versões e ancoragem na
   falha; e a regra já é segurada por hook (`guard-bash` GUARDA 0/1, `guard-folego`, `guard-write`, `lint.sh`).
   Saiu dos `.md` e virou **um contrato por papel** injetado no topo do packet (`.claude/contratos/`), com o porquê em
   uma frase e sem número de incidente.
2. **Contrato ≠ comportamento (achados T1–T4).** `dedalo`/`ariadne` mandavam ler tokens com `grep -rn … | head`, `ls`,
   `cat tailwind.config.*` via Bash — exatamente o que o `guard-bash` nega em subagente desde a 3.4.21: o agente seguia a
   própria instrução e era bloqueado. Os dois também anunciavam ferramentas de browser pane que não existem no subagente
   (a armadilha que travou o michelangelo). `beholder` mandava "ler TODOS os documentos + 3 templates" e `sherlock` "ler o
   `harness.env`" enquanto o prompt da skill dizia "leia o packet; NÃO leia o harness.env". Corrigido nos `.md`; a pasta de
   relatórios e o piso agora vêm no cabeçalho do packet (`review-packet.sh`/`prd-packet.sh`), o que remove a razão de o
   revisor abrir o `harness.env`.
3. **Filtro de severidade e contador nos gates (achados S1–S3, F1).** `beholder`/`michelangelo` pediam "não invente
   problema… relatório inflado perde credibilidade" e "no máximo uma linha cada", sem a regra de cobertura que o sherlock
   ganhou na 3.4.24 — a documentação do Sonnet 5 é explícita: a instrução é obedecida literalmente e o recall cai. E o
   cabeçalho do relatório pedia `Ciclo: N de M (teto absoluto = HARNESS_REVIEW_MAX_CICLOS, default 3)` — contador no
   contexto, que o Fable 5.1 documenta como gatilho de encerramento precoce. Cobertura (confiança + severidade; triagem na
   sessão-pai; piso só detalha) entrou nos dois gates e no contrato; o contador saiu ("Ciclo: N, como veio no prompt").

---

## Achados — confiança ALTA

### D1 · Bloco "Ferramenta certa para LER (3.4.12)" repetido 7× com narrativa de medição
- **Onde:** `hefesto.md:74-78` · `dedalo.md:25-29` · `sherlock.md:25-29` · `hermes.md:15-19` · `beholder.md:14-18` · `michelangelo.md:14-18` · `atlas.md:14-18`
- **Evidência:** "Medido 01–02/09 no Windows: 418 das 619 chamadas dos executores eram `cat`/`ls`/`grep` via Bash, e cada Bash custou 4–40 s sob carga"
- **Padrão:** 1d fósseis (narrativa de incidente + regra que o hook já enforça — `guard-bash` GUARDA 0 nega leitura via Bash em subagente) · 1c repetição como reforço
- **Por que obsoleto:** modelos 5 seguem a instrução na primeira vez; a arqueologia não acrescenta sinal, e sete cópias custam reconciliação. Regra da casa: regra que o hook segura vira uma linha.
- **Ação:** `move` → `.claude/contratos/CONTRATO-<papel>.md` § "Onde ler" ("use Read/Glob/Grep; o hook `guard-bash` nega leitura pura via Bash em subagente, porque cada Bash cria um processo e passa pelos hooks").

### D2 · Teto de fôlego descrito 3× (uma com contagem)
- **Onde:** `hefesto.md:65-71` · `dedalo.md:122` · `hermes.md:37-42`
- **Evidência:** "medido (PRD-133, 01/09), Edit por ocorrência deu 398 turnos e 47 min para um ciclo"
- **Padrão:** 1d fóssil · 4 "budget countdown rendered into context" (números de turnos no prompt)
- **Por que obsoleto:** o `guard-folego` (3.4.22) nega acima do teto; o agente não precisa (nem deve) ver número. Fable 5.1: contagem de contexto/turnos no prompt → ansiedade de contexto e encerramento precoce.
- **Ação:** `move` → contrato § "Fôlego" ("existe um teto e você não o vê nem o conta; quando o hook negar, PARCIAL-TEMPO").

### D3 · "Classificador indisponível" 3× com incidente
- **Onde:** `hefesto.md:72` · `dedalo.md:125` · `sherlock.md:146-151`
- **Evidência:** "incidente real: 16+ negações re-tentadas até em `php -v`"
- **Padrão:** 1d narrativa de incidente · 1c repetição
- **Por que obsoleto:** a regra (1–2 tentativas, read-only no meio, BLOQUEADA) é contrato de ferramenta e fica; a arqueologia sai. Uma cópia por papel basta.
- **Ação:** `move` → contrato § "Classificador de permissão indisponível" (mantido o porquê: "o 'try again' da mensagem é convite a espiral").

### D4 · Temporários (`/tmp`, caminho de raiz) 3× com incidente
- **Onde:** `hefesto.md:56-63` · `dedalo.md:124` · `sherlock.md:142-145`
- **Evidência:** "incidente real: `cat > /tmp_check.php` segurou uma execução por 4h15"
- **Padrão:** 1d (hook `guard-bash` GUARDA 1 bloqueia o padrão) · 1a ("SEMPRE no scratchpad… NUNCA em `/tmp`, NUNCA em caminho de raiz, NUNCA fora do projeto")
- **Ação:** `move` → contrato § "Temporários", com o porquê (Git Bash resolve `/foo` fora do projeto e pendura a execução num prompt que ninguém vê) e uma frase de volume normal.

### D5 · Retorno em dois níveis 3× com tag de versão
- **Onde:** `hefesto.md:91-96` · `dedalo.md:123` · `hermes.md:33-36`
- **Evidência:** "em DOIS NÍVEIS quando a sessão-pai pedir (3.4.9, padrão nas skills)"
- **Padrão:** 1d tag de versão / 1c repetição
- **Ação:** `move` → contrato § "Retorno em dois níveis". O `.md` mantém só o formato do relatório (format-sensitive — keep list 7).

### D6 · Edit-first 2× com medição
- **Onde:** `hefesto.md:84-89` · `dedalo.md:119`
- **Evidência:** "você é o executor mais caro por task justamente por reescrever demais (medido: 121k tokens de output/task)"
- **Padrão:** 1d (o `guard-write` nega Write grande) · 1a ("**nunca reescreva o arquivo inteiro com Write**")
- **Ação:** `move` → contrato § "Edit-first" ("o hook `guard-write` nega Write sobre arquivo existente grande, porque output é o token mais caro"). Fable 5.1 documenta a tendência a reescrever arquivo inteiro — a instrução fica, sem número.

### D7 · Limite de teste, lint do projeto e invariantes — blocos de 3.2.1/3.4.18/3.4.19 repetidos
- **Onde:** `hefesto.md:29-52` · `dedalo.md:131-143` · `sherlock.md:37-42`
- **Evidência:** "(PRD-135: 23 min de rodadas de lint depois da onda)"; "Medido 02/09: os 🔴 do ciclo 1 da exec eram da mesma familia dos 🔴 da criacao"
- **Padrão:** 1d fóssil · 1c repetição · 1a ("inegociavel", "SEMPRE roda")
- **Ação:** `move` → CONTRATO-executor § "Validação" e § "Invariantes do gate"; CONTRATO-revisor § "Invariantes — primeira lente". `sherlock.md` mantém a lente em uma linha (é regra de julgamento, não mecânica).

### D8 · Tags de versão e frases migração-relativas (≈45 ocorrências)
- **Onde:** todos os 12 genéricos — ex.: `hefesto.md:18` "(destilado p/ subagentes, 2.4.0)", `sherlock.md:94` "(3.4.24 — substitui o antigo 'em dúvida, Sugestão')", `beholder.md:75` "Desde a 3.4.9 o `PROMPT-EXECUCAO.md` é um STUB", `michelangelo.md:10` "Desde a versão 1.4.0", `michelangelo.md:41` "(NOVO, é o gate da `/prd`)", `hermes.md:50` "3.4.24 (item 12):", `hermes.md:3` "(3.4.10; dieta 3.4.11)"
- **Padrão:** 1d "migration-relative phrasing" — o texto é um diff contra uma versão que o modelo nunca viu.
- **Ação:** `remove` as tags; `rewrite` "como se as regras atuais fossem as únicas". Aplicado em todos; `hermes.md` preserva as frases que a suíte `t-3424` confere.

### D9 · "Por que você existe" como história do harness
- **Onde:** `hefesto.md:12-14` ("Antes, a delegação paralela do `/prd-exec` usava agentes genéricos com prompt improvisado") · `sherlock.md:14-19` ("O harness revisava código com um único revisor externo… Dois problemas") · `peter-quill.md:14-16` ("O discovery da `/prd` usava o agente `Explore` padrão")
- **Padrão:** 2 "history narratives: past tense" — a autoridade da regra é o comportamento, não o incidente.
- **Ação:** `rewrite` para a razão no presente (contexto fica: "as regras críticas não podem depender de alguém colar no prompt"; "sem revisor externo o review não pode ser pulado em silêncio").

### T1 · Leitura via Bash prescrita ao agente — o hook nega
- **Onde:** `dedalo.md:47-55` · `ariadne.md:36-41`
- **Evidência:** ```grep -rn -- "--[a-z-]\+:" --include="*.css" . | head -40``` · ```ls tailwind.config.* 2>/dev/null && cat tailwind.config.*```
- **Padrão:** 3 contrato ≠ comportamento (o `guard-bash` GUARDA 0 nega `grep`/`ls`/`cat` em subagente desde a 3.4.21)
- **Por que obsoleto:** o agente que obedece ao `.md` é bloqueado e gasta tentativas; modelos 5 obedecem literalmente.
- **Ação:** `rewrite` → "Grep por `--[a-z-]+:` … nos `*.css`; Glob `tailwind.config.*` e leia-o". Aplicado.

### T2 · Ferramentas de browser pane no frontmatter de dedalo/ariadne
- **Onde:** `dedalo.md:4` · `ariadne.md:4` (`mcp__Claude_Browser__*`, `mcp__Claude_Preview__*`) e a prosa "sonda opcional de uma tentativa" em `dedalo.md:58,129` · `ariadne.md:44,109`
- **Padrão:** 3 "don't expose tools that are invalid in the current configuration"; Playwright CLI é o canônico (PLATAFORMAS §7).
- **Ação:** `remove` do `tools`; prosa `rewrite` para Playwright só. Os TOMLs deixam de citar `mcp__Claude_Browser__*` como exemplo.

### T3 · Regime de leitura contradiz o packet
- **Onde:** `beholder.md:44-45` ("Ler **todos** os documentos… Ler os 3 templates") · `hefesto.md:18` ("Perfil primeiro… antes de qualquer coisa") · `sherlock.md:34` ("Ler `.claude/harness.env`")
- **Evidência:** o prompt da `/prd` diz "SEU CONTEXTO COMPLETO esta em <prd-packet> — leia-o em vez da pasta"; o da `/prd-exec` ao sherlock diz "NAO leia a PRD inteira, o Perfil completo, o harness.env".
- **Padrão:** 1d instrução contraditória (o modelo reconcilia gastando leitura em dobro) · 3 contrato de contexto.
- **Ação:** `rewrite` — "o molde é o packet; sem packet, leia X". Mecânico: `review-packet.sh` e `prd-packet.sh` passam a imprimir **pasta de relatórios** e **piso de severidade** no cabeçalho, eliminando a razão de abrir o `harness.env`.

### T4 · michelangelo — fóssil riscado sobre o browser pane
- **Onde:** `michelangelo.md:60`
- **Evidência:** "Browser pane: NÃO (3.4.20)… Medido 03/09 (PRD-137): dois michelangelos ficaram 10 min mudos… ~~Sonda opcional (uma tentativa só).~~ O browser pane era bônus…"
- **Padrão:** 1d (texto riscado = diff contra versão anterior) · narrativa de incidente
- **Ação:** `rewrite` em uma frase ("como subagente você não tem browser pane; sem Playwright, análise estática declarada").

### F1 · Contador de ciclos no relatório e no Passo 0
- **Onde:** `beholder.md:46,107` · `michelangelo.md:50,119`
- **Evidência:** "**Ciclo:** [N de M (teto absoluto = HARNESS_REVIEW_MAX_CICLOS, default 3) — Perfil `0` = "N de T (Perfil sem limite; teto absoluto T = …)"]"; "limite definido no Perfil ('Ciclos do beholder'; default 4, `0` = sem limite)"
- **Padrão:** 4 "budget countdowns rendered into context" + regra da casa "nunca escreva teto/contador no prompt".
- **Por que obsoleto:** Fable 5.1 documenta encerramento precoce quando enxerga contagem regressiva; o teto é da `/prd`, não do gate.
- **Ação:** `rewrite` → "**Ciclo:** [N, como veio no prompt]"; a mecânica de ciclos foi para o CONTRATO-gate sem número.

### S1 · Gates sem regra de cobertura — filtro qualitativo de severidade (melhoria 2)
- **Onde:** `beholder.md:51` ("Não invente problema onde não há — um relatório inflado com nits perde credibilidade") · `beholder.md:92` / `michelangelo.md:102` ("no máximo, como **uma linha cada**") · `michelangelo.md:184` ("Severidade honesta. Não promova nit…")
- **Padrão:** documentado em Sonnet 5 → "Code review harnesses" e Opus 5 → "Severity filters still depress measured recall".
- **Por que obsoleto:** o modelo obedece o filtro literalmente e investiga igual, mas não reporta — o achado some antes de chegar a quem decide.
- **Ação:** `add` — regra de COBERTURA (todo achado, confiança alta/média/baixa + severidade; triagem da sessão-pai; piso controla só o detalhamento) nos dois gates e no CONTRATO-gate; `rewrite` de "Severidade honesta" para "a confiança declarada é o que permite à sessão-pai triar". Formatos ganham `**Confiança:**` e placar `(alta K · média L · baixa M)`.

### S2 · sherlock.toml (Codex) contradiz a cobertura da 3.4.24
- **Onde:** `.codex/agents/sherlock.toml:8`
- **Evidência:** "em dúvida, é Sugestão, não Bloqueante"
- **Padrão:** mesma linha do S1 (filtro de severidade); paridade Codex ficou para trás.
- **Ação:** `rewrite` → "Reporte todo achado, inclusive os incertos e os de baixa severidade, com confiança e severidade — a triagem é da sessão pai". Aplicado; `gen-adapters --check` passa a exigir referência ao contrato do papel.

### S3 · Piso de severidade descrito como controle de investigação
- **Onde:** `beholder.md:47,88-96` · `michelangelo.md:51,98-106` · `sherlock.md:34,109`
- **Evidência:** "Ele define **o que você detalha**… Não muda como você **investiga**" (correto) mas a seção "Piso" de beholder/michelangelo não dizia que achado não se omite — só "colapse".
- **Padrão:** 1c (regra em dois lugares com ênfase diferente) + S1.
- **Ação:** `rewrite` — "controla só **quanto detalhar**, nunca o que reportar" nos três; o packet agora traz o piso resolvido.

### R1 · Números divergentes entre description e corpo (hermes)
- **Onde:** `hermes.md:3` ("teto ~180 linhas") × `hermes.md:77-81` ("Alvo: ~200 linhas por task; teto duro: 230… convergem em ~218 mesmo instruídos a 180 (PRD-012-b, 03/09)")
- **Padrão:** 2 "duplicated info drifts apart" · 1d narrativa
- **Ação:** `rewrite` — a description (texto de roteamento) perde o número; o corpo mantém alvo 200 / teto 230 (é spec do artefato, medida pelo `task-packet.sh --check`, não contador do agente) e perde a arqueologia.

### R2 · datilografo — proibição repetida 3× e incidente
- **Onde:** `datilografo.md:25,68,146` ("Igor foi desligado — nunca atribua a ele" / "Nunca atribua ao Igor" / "**Nunca o Igor.**") · `datilografo.md:101` ("(Já houve duplicação por retry sem checagem — não repita.)")
- **Padrão:** 1c repetição como reforço · 1e proibição sem razão ao lado · 2 narrativa
- **Ação:** `rewrite` — uma ocorrência com a razão ("o `asana-team.md` lista só o time ativo"); idempotência com o porquê ("um retry sem checagem cria a mesma demanda duas vezes e polui a métrica"). Aplicado.

## Achados — confiança MÉDIA

### P1 · Caixa alta / "inegociável" sem porquê ao lado
- **Onde:** `hefesto.md:16` ("O contrato (inegociável)"), `:53` ("**NUNCA commite.** Nem `git add`"), `:56` ("⚠️ Arquivos temporários: SEMPRE…"); `dedalo.md:40` ("INEGOCIÁVEL, nos três modos"); `ariadne.md:30`; `hermes.md:31` ("**NUNCA commite. NUNCA altere código**"); `peter-quill.md:24`; `sherlock.md:21`; `datilografo.md:14` / `zelador.md:14` ("(SEMPRE)"); `zelador.md:28` ("⚠️ Regras…")
- **Padrão:** 1a — ênfase sem "porquê" over-dispara e deixa o modelo rígido; o registro ansioso do prompt vira o registro da saída.
- **Ação:** `rewrite` no volume normal com a razão ("não commite: o working tree é revisado pela dupla-cega e commitado pelo humano"). Mantidas as duas ou três restrições reais.

### P2 · Parágrafo de política de modelo repetido em 8 agentes
- **Onde:** `sherlock.md:10`, `beholder.md:10`, `michelangelo.md:10`, `atlas.md:10`, `peter-quill.md:10`, `tony-stark.md:10`, `ariadne.md:12`, `dedalo.md:12`
- **Evidência:** "Se o Perfil (`Agentes do harness (modelos)` → `Modelo do X`) declarar `opus`, quem te invoca passa o override — você não decide isso."
- **Padrão:** 1c padding (a mesma frase em oito redações); keep list 8 diz que redundância que funciona não é cruft — aqui as redações divergem.
- **Ação:** `rewrite` em uma frase por agente ("o Perfil pode declarar `opus`; quem te invoca passa o override"). Contexto (por que Sonnet: barato para rodar sempre) mantido.

### P3 · michelangelo — dois formatos de retorno quase idênticos
- **Onde:** `michelangelo.md:110-171`
- **Padrão:** 1c example over-indexing / duplicação (60 linhas de dois formatos com 5 campos de diferença)
- **Ação:** `rewrite` — formato do Modo C completo; Modo A/B descrito pelas três diferenças. Format-sensitive fica (keep list 7).

### P4 · Panteão do michelangelo desatualizado
- **Onde:** `michelangelo.md:22-29`
- **Evidência:** "| **UI UX Pro Max** (skill) | Passo 7 da `/prd` | **gera** o design |" — desde que o `dedalo` existe, quem gera é o dedalo (com a Pro Max como base).
- **Padrão:** 2 "volatile specifics… rot as code ships"
- **Ação:** `rewrite` ("a `ui-ux-pro-max` e o dedalo geram; você critica").

### P5 · Time e desligamento datados em agentes genéricos
- **Onde:** `beholder.md:28` · `tony-stark.md:32` ("Igor foi desligado em 26/05/2026 — não é mais referência")
- **Padrão:** 2 time-sensitive content (data que apodrece; agentes que viajam para 19 projetos)
- **Ação:** `remove` a menção; lista do time ativo fica.

### P6 · tony-stark — validar nome recente (re-baseline, acréscimo)
- **Onde:** `tony-stark.md:28`
- **Padrão:** keep list 11 / Fable 5.1 "Search triggering at low effort: recognizing a name is not the same as knowing its current state"
- **Ação:** `add` — "reconhecer o nome de uma biblioteca não é saber o estado atual dela: valide com WebSearch/WebFetch antes de recomendar".

### P7 · themis — teto numérico de palavras na saída
- **Onde:** `themis.md:41` (`"motivo":"<=40 palavras, o fato decisivo"`)
- **Padrão:** 1f numeric output ceiling
- **Ação:** `rewrite` → "o fato decisivo, em uma frase". (O `harness-duelo.sh:468` ainda escreve `<=40 palavras` no `prompt-juiz.md` — ver flag X5.)

### P8 · beholder/michelangelo/sherlock — "Severidade honesta" sem a peça da confiança
- **Onde:** `beholder.md:146` · `michelangelo.md:184` · `sherlock.md:139`
- **Padrão:** 1c strategy coaching ("não promova nit a bloqueador para parecer rigoroso") que, sem a confiança declarada, empurra para omitir.
- **Ação:** `rewrite` — mantida a calibragem, acrescentado "a confiança declarada é o que permite à sessão-pai triar".

### P9 · Frontmatter `description` do hermes e do sherlock com arqueologia
- **Onde:** `hermes.md:3` ("(3.4.10; dieta 3.4.11)", "desde a 3.4.24") · `sherlock.md:3` (sem SOLO-2)
- **Padrão:** 3 trigger text — pode ter urgência calibrada, não histórico de versão.
- **Ação:** `rewrite` — descriptions sem versão; sherlock ganha "SOLO-2" e "reporta tudo com confiança" (roteamento fiel ao comportamento atual).

## Achados — BAIXA / `flag` (não editados)

### X1 · `prd/SKILL.md:1749-1752` (despacho do michelangelo) — "teto de 30 chamadas" no prompt
- **Padrão:** 4 contador no contexto. **Fora do escopo desta onda** (skill em edição por outro agente).
- **Texto sugerido:** "rode como CHECKLIST (estados, WCAG, responsividade, microcopy), sem reabrir o partido" — o `guard-folego` já limita.

### X2 · `prd/SKILL.md:1698-1702` (despacho do beholder) — "Este e o CICLO <N> de <limite efetivo> (teto absoluto = HARNESS_REVIEW_MAX_CICLOS, default 3)"
- **Padrão:** 4 contador. **Fora do escopo.** Sugestão: "Este é o ciclo <N>." (o teto é decisão da skill, não informação para o gate).

### X3 · `prd-exec/SKILL.md:667-690` (despacho do hefesto/dedalo) — repete a mecânica que agora está na seção 0 do packet
- **Evidência:** "RETORNO EM DOIS NIVEIS (3.4.9 — melhoria #2)… (PRD-132: 112M de tokens_total com 883k de output)"; "Nao leia o Perfil completo nem a PRD inteira"
- **Padrão:** 1c duplicação + 1d narrativa. **Fora do escopo.** Sugestão: reduzir o prompt a "Implemente a TASK-NNN; seu contexto e o seu contrato mecânico estão em `<packet>`; relatório completo em `<caminho>`" — o packet já traz o resto.

### X4 · `prd-exec/SKILL.md:1281-1291` (despacho do sherlock) — "PRIMEIRA LENTE (3.4.18)" e "NAO leia… o harness.env" agora duplicam o CONTRATO-revisor
- **Fora do escopo.** Sugestão: manter só rótulo, ciclo, packet e `Lente: A|B`.

### X5 · `hooks/harness-duelo.sh:468` — `"motivo":"<=40 palavras"` no `prompt-juiz.md`
- **Padrão:** 1f teto numérico em prompt gerado por hook. Não editado (prompt de hook, fora da lista desta onda). Sugestão: "o fato decisivo, em uma frase".

### X6 · `datilografo.md:36` — caminho temporário fixo `C:\tmp\datilografo_body.json`
- **Padrão:** 2 volatile specifics (caminho fora do projeto; a regra da casa para agentes do harness é scratchpad/`.harness-run/tmp`). Agente só do vault, roda na sessão-pai (sem `guard-bash` de subagente). Sugestão: `$env:TEMP\datilografo_body.json`. Baixa confiança — mantido.

### X7 · "Use raciocínio real. Você roda em Opus porque…" (`datilografo.md:10`, `zelador.md:10`)
- **Padrão:** 1d identity stub? Não — é contexto de por que o modelo é o Opus. Mantido (keep list 9). Baixa.

### X8 · "sumário de até 12 linhas" (contratos e formatos)
- **Padrão:** 1f teto numérico de saída. **Conflito guia × casa:** a casa mede o multiplicador do relatório relido pela sessão-pai e mantém o teto por decisão (task desta onda). Mantido com o porquê; registrado aqui.

### X9 · `tony-stark.md:68-69` "Gere mais ideias do que vai recomendar; depois corte sem dó"
- **Padrão:** 1c strategy coaching. É o método da persona (brainstorm → corte); mantido. Baixa.

### X10 · Tabelas "Onde você se encaixa no panteão" em `ariadne`/`dedalo`/`michelangelo`
- **Padrão:** keep list 8 (redundância que funciona e não diverge). Mantidas.

### Verificações do Grupo 4 sem achado
- **Agentes redundantes:** nenhum par com mesma ferramenta e prompt quase igual (ariadne × dedalo Modo P produzem artefatos diferentes; beholder × michelangelo têm lentes disjuntas por construção). Roster inalterado.
- **Scaffold de raciocínio** ("think step by step", `<scratchpad>`): nenhum nos 14.
- **Supressores de narração** ("não narre", "hold findings"): nenhum. O "sumário ≤ 12 linhas" é formato de retorno, não supressão de progresso.
- **Auto-verificação extra (Opus 5):** as verificações que os executores rodam são exigidas pelo harness (verificação provada — melhoria 4, enforçada pelo `guard-agent --post`); não é scaffold de "double-check", é contrato. Mantido.
- **Token accounting:** existe (telemetria por task e por agente).

---

## Diff proposto e aplicado (Step 6)

- **Aplicado** (alta + média): os 12 genéricos reescritos (persona + lentes + regras de negócio com o porquê + formato de
  retorno; mecânica → `.claude/contratos/CONTRATO-{executor,revisor,gate,escrivao,scout}.md` injetados pelo
  `task-packet.sh` / `review-packet.sh` / `prd-packet.sh` como "## 0. Contrato do papel"); `datilografo`/`zelador` com
  os ajustes R2/P1; 10 adapters Codex com a referência ao contrato do papel (S2 corrigido); `harness-sync.sh`
  (`.claude/contratos` em `CORE_DIRS`), `harness-doctor.sh` (checa a pasta e os 5 contratos), `gen-adapters.sh`
  (paridade exige o contrato), `harness.env` (`HARNESS_PACKET_CONTRATO`).
- **Linhas dos 12 genéricos:** 1.580 → 1.266 (−20 %). O alvo de −40 % não foi atingido de propósito: o que sobrou é
  contexto (lentes, régua do Perfil, formato de retorno, contrato de saída do `harness-sync.sh` no prometeu, snippet de
  contraste, andaime de estados da ariadne) — keep list 1, 3, 4 e 7. "Cruft ≠ length": cortar mais seria apagar o que
  só o autor sabe.
- **Verificação (Step 7):** suíte `tests/t-3425-contratos.mjs` (105 casos) + `t-3422-onda-a` (50) + `t-3424-leve-packet`
  (55) + `t-3423-permissao` (49) verdes; `bash -n`/`node --check` em tudo; frontmatter e LF conferidos byte a byte.
  Aceite comportamental (exec e criação reais sem regressão de 🔴; turnos por agente no dashboard) fica para a próxima
  PRD real — removal is a hypothesis.
