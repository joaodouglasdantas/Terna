---
name: manual
description: "Mantém o MANUAL VIVO do software (docs/manual/ — por módulo, dupla face: usuário final + dev) absorvendo em lote as PRDs da fila (_fila.md, alimentada pela cauda da /prd-exec). Na primeira rodada de um projeto (fila cheia, zero módulos escritos) conduz o BOOTSTRAP por módulo, em ondas. Use quando pedirem para atualizar/gerar o manual, processar a fila do manual, documentar features para usuários ou devs, ou no gatilho quinzenal do daily. Projetos com KB própria (Perfil → Manual vivo: kb-portal/seed) delegam a face de usuário ao mecanismo do projeto."
---

# Skill: `/manual` — o manual vivo do software

Mantém `docs/manual/` — a documentação **viva, por módulo**, com duas faces: **usuário final**
(como usar) e **dev** (o que existe, onde vive, decisões). "Vivo" porque cada PRD nova **edita a
seção do módulo** (delta), em vez de empilhar mais um documento — o leitor sempre encontra UM
arquivo por módulo, atual.

> **Por que existe (2.6.0):** o conhecimento das features morava nas PRDs históricas (arquivo de
> log, não manual) e, no melhor caso, em KBs específicas de um projeto (Portal TEF). O manual
> vivo generaliza o que o `/kb-tutorial` do Portal validou — tom de usuário final, artefato
> versionado que viaja pelo deploy, nunca INSERT direto em banco — sem exigir infra nova de
> nenhum projeto.

> **Custo desenhado para ser fora do caminho crítico:** a `/prd-exec` NAO gera manual — ela só
> appenda 1 linha na fila (`_fila.md`). A absorção acontece AQUI, em lote (1 subagente por PRD,
> em paralelo), quando o usuário quiser — o gatilho natural é a revisão quinzenal do daily
> (dias 1/15).

## Estrutura (criada sob demanda)

```
docs/manual/
  usuario/<modulo>.md    # face do usuário: o que faz + como usar, passo a passo
  dev/<modulo>.md        # face do dev: mapa da feature, arquivos, decisões, armadilhas
  img/<modulo>/          # screenshots (opcional)
  _fila.md               # PRDs aguardando absorção (alimentada pela /prd-exec)
  index.html             # índice navegável estático (regenerado por esta skill)
```

`<modulo>` = slug kebab-case da área funcional (ex.: `agenda`, `cobranca`, `relatorios`) — os
mesmos módulos que o Perfil/PRDs usam. Na dúvida entre criar módulo novo ou estender um
existente, prefira estender (manual fragmentado envelhece pior).

## Uso

```
/manual                    # processa a fila inteira (modo padrão, em lote)
/manual PRD-107            # absorve só essa PRD (com ou sem fila)
/manual <modulo>           # (re)escreve o manual de um módulo do zero (bootstrap/refresh)
/manual --status           # mostra a fila e a cobertura (módulos com/sem manual)
/manual --prints [modulo]  # rodada SÓ de captura: insere os prints pendentes/ausentes nos
                           # módulos já escritos (retrofit — 3.4.8; sem argumento, varre todos)
```

## Passo 0 — Perfil e mecanismo

Leia `.claude/PERFIL-RESUMO.md` (fallback: `PERFIL-PROJETO.md`) e o campo **"Manual vivo"** do
Perfil (`Manual vivo → mecanismo`):

- **`arquivo`** (default — campo ausente): fluxo integral desta skill (as duas faces em
  `docs/manual/`).
- **`kb-portal`** (ex.: newportaltefnet): a face de **usuário** é delegada à skill do projeto
  (`/kb-tutorial` — que já gera tutorial + screenshots + quiz no formato do sync do Portal);
  esta skill cuida só da face **dev** (`docs/manual/dev/`).
- **`seed`** (ex.: sagittarius): a face de usuário sai no formato do seed do projeto
  (`prds/_templates/TEMPLATE-TUTORIAL.md` + `TEMPLATE-META.yaml`, consumidos pelo
  `seed_base_conhecimento.php`); a face dev segue em `docs/manual/dev/`.

> **Esforco da sessao — fase EXECUTAR (3.5.3).** O Perfil ("Nivel de esforco" → linha "Esforco — fase executar",
> default `medium`; `high` no preset maximo) diz o esforco que a sessao deve ter nesta skill. No
> inicio, rode `bash .claude/hooks/esforco.sh executar --atual <nivel>` — o `<nivel>` vem de
> `mcp__ccd_session_mgmt__get_session` com `session_id: "self"` (campo `effort`) quando a ferramenta
> existir; sem ela, omita `--atual`. Saida `AJUSTAR` = avise UMA vez, *"Esforco: fase executar pede X; sessao
> em Y — ajuste com `/effort X` (ou responda 'seguir')"*, e espere a resposta antes de despachar subagente;
> `ok`/`n/d` = siga. Nenhum subagente tem esforco proprio — todos herdam o da sessao (medido 12/09,
> PRD-142-b: 83% dos tokens dos executores eram raciocinio herdado de uma sessao em `high`).

## Passo 1 — Ler a fila

`docs/manual/_fila.md` — formato (a `/prd-exec` appenda; crie com este cabeçalho se faltar):

```markdown
# Fila do manual vivo
> Alimentada pela cauda da /prd-exec. Processada pela /manual. Linha absorvida ganha ✅.

| PRD | Módulos | O que mudou (1 frase) | Data | Status |
|-----|---------|----------------------|------|--------|
| PRD-NNN | agenda, cobranca | Reagendamento em lote com notificação | 2026-07-30 | pendente |
```

- Sem fila e sem argumento → informe "fila vazia" e pare (ou ofereça `--status`).
- Argumento `PRD-NNN` sem linha na fila → siga mesmo assim (lendo a PRD do disco).
- **Fila com pendências mas o(s) módulo(s) citado(s) sem manual escrito** → NÃO processe como
  delta: vá para o **modo bootstrap** (seção abaixo). Delta sobre o vazio produz manual que
  conta "o que mudou" sem nunca dizer o que a tela É.

## Passo 2 — Absorver em LOTE (1 subagente por PRD, em paralelo)

Para cada PRD pendente, dispare **na mesma mensagem** um subagente (`general-purpose`,
**Sonnet** — trabalho de redação sobre fonte pronta, nunca passe `model` maior) com prompt
self-contained:

```
description: "Manual vivo: absorver PRD-NNN"
prompt: """
Atualize o MANUAL VIVO do projeto <raiz> absorvendo a PRD-NNN.
Fontes (leia nesta ordem, pare quando tiver o suficiente): docs/manual/usuario/<modulo>.md e
docs/manual/dev/<modulo>.md atuais (se existirem); prds/PRD-NNN-*/PRD-NNN-*.md (produto);
a PRD técnica SÓ se a face dev precisar de detalhe que o produto não tem.
Leia também .claude/PERFIL-RESUMO.md (caminhos reais).

FACE USUÁRIO (docs/manual/usuario/<modulo>.md) — regras de tom (herdadas do /kb-tutorial):
- Edite a seção existente do que mudou; crie seção nova só para feature nova. NUNCA apague
  conteúdo de features que continuam existindo; remova só o que a PRD tornou obsoleto.
- Tom de usuário final: nada de nome de arquivo, SQL, endpoint, código HTTP ou jargão interno.
- O que a feature faz + como usar passo a passo (onde clicar, o que preencher, resultado).
- NUNCA explique restrição de acesso nem mecanismo/motivo de regra interna — só o efeito
  visível ("um aviso informa quantas não foram incluídas"), nunca o porquê.
- Feature atrás de feature-flag (mesmo desligada em produção): escreva o manual COMPLETO
  normalmente, e abra o ARQUIVO do módulo (logo abaixo do título) com o aviso padrão:
  "> ⚠️ **Requer ativação:** este módulo só funciona com a chave `<flag>` ligada — sem ela,
  as telas descritas abaixo não aparecem." Se a flag cobre só uma feature do módulo (não ele
  inteiro), o mesmo aviso vai no topo da SEÇÃO, não do arquivo.
- PT-BR com acentuação completa. Markdown simples: ##/###, listas numeradas, **negrito** para
  botões/campos/telas.
- PRINTS (3.4.8 — contrato, não enfeite): toda tela/fluxo principal descrito leva **1 print**
  logo após o heading da seção — `![<tela>](../img/<modulo>/<tela>.png)` — capturado com
  `npx playwright screenshot "<Base URL do Perfil><rota>" docs/manual/img/<modulo>/<tela>.png
  --viewport-size=1280,800` (tela autenticada: acrescente `--load-storage <arquivo>` se o
  Perfil declarar "Storage state p/ screenshots"). Não conseguiu capturar (app fora do ar,
  sem storage state, tela exige dado específico)? NÃO trave: escreva na linha do print
  `📷 pendente: <tela> — <motivo em 3 palavras>` e siga — a pendência aparece no índice e o
  fechamento a cobra. Manual só-texto é leitura pesada (medido: 1º bootstrap saiu com 11
  módulos e zero prints).
- PRD 100% backend sem efeito visível → NÃO force seção de usuário (registre só na face dev).

FACE DEV (docs/manual/dev/<modulo>.md):
- Mapa da feature: o que existe, arquivos/paths REAIS (verificados), contratos/endpoints,
  decisões de design (e por quê), armadilhas específicas, PRDs de origem (PRD-NNN como
  referência de histórico, 1 linha).
- Delta-edit: atualize o mapa, não conte a história da mudança — o manual descreve o estado
  ATUAL; o histórico fica no git e nas PRDs.

Ao terminar: marque a linha da PRD-NNN em docs/manual/_fila.md como ✅ absorvida.
Devolva: módulos tocados + 1 linha por arquivo editado. NÃO commite nada.
"""
```

**Adapter:** mecanismo `kb-portal` → em vez da face usuário acima, rode a skill do projeto
(`/kb-tutorial PRD-NNN`) — na sessão principal, não no subagente (ela tem regras próprias de
screenshot/quiz); o subagente faz só a face dev. Mecanismo `seed` → o subagente escreve o par
TUTORIAL/META no formato dos templates do projeto no lugar da face usuário.

**Screenshots — contrato com degradação declarada (3.4.8; era "opcional" e o resultado
medido foi um manual inteiro sem 1 print):** a face de usuário NASCE com prints (regra no
bloco de tom acima). A captura é *nunca-bloqueante* mas *sempre-declarada*: o que não deu
para capturar vira `📷 pendente: ...` no próprio .md — nunca silêncio. Preferências: recorte
do componente quando a seção fala de um elemento; página inteira quando apresenta a tela.
Tela autenticada sem storage state declarado no Perfil = pendência legítima (anote; o
`--prints` resolve depois com o app logado). **PRD absorvida que MUDOU uma tela obriga a
recaptura do print daquela tela** — print velho é manual mentindo em imagem.

**Modo `--prints` (retrofit):** varre `docs/manual/usuario/*.md` atrás de `📷 pendente` e de
seções de tela sem imagem, captura em lote (app local de pé; storage state se houver) e
substitui as pendências pelas referências reais. 1 subagente por módulo, mesmo paralelismo
do Passo 2. Termina rodando o Passo 3 (o índice recontará os 📷).

## Modo bootstrap (`/manual <modulo>`) — e a PRIMEIRA rodada

Vale para (re)escrever um módulo do zero — e é o caminho **obrigatório** na primeira rodada de
um projeto que acumulou fila sem nunca ter manual. O insight que barateia tudo: **o código de
hoje já contém todas as PRDs da fila (e as anteriores a ela)** — bootstrap a partir do código
atual absorve a fila inteira de graça, sem processar linha a linha.

1. **Mapa de módulos primeiro, com o usuário.** Tela ≠ módulo: agrupe as páginas em ~8–15
   módulos funcionais (ex.: contas a pagar + fornecedores + categorias de despesa = um módulo
   `financeiro`). Use os módulos que o Perfil/PRDs já usam; proponha o mapa e confirme antes de
   disparar.
2. **Ondas, não tudo de uma vez** (cada onda precisa caber numa revisão humana):
   - **Onda 1** — módulos de uso diário da operação (o que a equipe abre todo dia);
   - **Onda 2** — gestão e análises (o que o dono usa para decidir);
   - **Onda 3** — configuração e cauda (muda pouco, urgência baixa).
3. **1 subagente por módulo, em paralelo** — mesmo modelo e regras de tom do Passo 2 (a regra
   de PRINTS inclusa — bootstrap sem prints foi exatamente o buraco da 1ª rodada real),
   adaptando o prompt: em vez de "absorver a PRD-NNN", "escrever as duas faces do módulo
   `<modulo>` DO ZERO a partir do CÓDIGO ATUAL" (páginas/telas do módulo + Perfil como fontes
   primárias; as PRDs entram só como referência de histórico na face dev, 1 linha cada).
4. **Ao fim de cada onda, baixe a fila:** marque ✅ as linhas cujos módulos foram cobertos, com
   nota `absorvida via bootstrap de <data>`. Linha de módulo ainda não bootstrapado permanece
   `pendente` — ela cai na onda seguinte, nunca no esquecimento.

## Passo 3 — Índice navegável (gerado por SCRIPT — 3.4.8)

Rode, na raiz do projeto:

```bash
node .claude/scripts/manual-index.mjs
```

Ele regenera `docs/manual/index.html` deterministicamente (nada de escrever HTML na mão —
mesma filosofia do harness-dashboard): um **leitor completo** auto-contido, sem CDN, com
**busca instantânea por palavra-chave/tema** (título, seções e conteúdo, com destaque do
termo), abas usuário/dev, markdown renderizado na própria página com os prints inline, e a
contagem de 📷 por módulo (denuncia `sem prints` e `📷 pendente`). A saída
`MANUAL-INDEX|...|sem-prints:N` vai para o fechamento. Módulo novo/renomeado não exige nada:
o script escaneia as pastas. (Projeto que sirva `docs/` publicamente não existe por padrão —
o `.htaccess` da casa bloqueia `/docs/`; o index é consumo local/dev, e a face dentro do
produto é responsabilidade do projeto, ex. PRD-132 do Mariana.)

## Passo 4 — Fechamento

1. Confirme a fila: toda linha processada está ✅ (cole o trecho da tabela).
2. Resuma: módulos atualizados, arquivos tocados, **prints capturados e prints pendentes**
   (o `sem-prints:N` do Passo 3 é o placar — N > 0 vira sugestão explícita de
   `/manual --prints` na próxima janela com o app de pé).
3. **Sugira a mensagem de commit** (a skill NUNCA commita — regra padrão do harness):
   `docs: manual vivo — absorve PRD-NNN, PRD-MMM (modulos: X, Y)`
4. Cobertura: se `--status` ou se notar módulo relevante sem manual, liste como pendência
   (candidato a `/manual <modulo>` de bootstrap).

## Regras

- **Delta sobre estado, nunca log.** O manual descreve o software COMO É; mudanças editam
  seções. Se uma seção precisa contar "antes era X, agora é Y", está errada.
- **Duas faces, dois leitores, zero vazamento:** jargão técnico não entra em `usuario/`;
  passo-a-passo de tela não entra em `dev/` (lá é mapa, não tutorial).
- **Nunca conecta em banco, nunca commita, nunca publica** — arquivo versionado viaja pelo
  fluxo normal de commit/deploy do projeto (princípio validado no Portal TEF).
- **Batch primeiro.** Absorver 1 PRD por vez a cada execução desperdiça o custo fixo; o gatilho
  quinzenal do daily existe para acumular e amortizar.
- **Flag desligada não bloqueia manual.** Feature entregue atrás de flag é documentada
  COMPLETA; o que é obrigatório é o aviso de ativação no topo (do arquivo, se a flag cobre o
  módulo; da seção, se cobre só a feature). A task que ligar a flag em produção deve incluir o
  passo "remover/ajustar o aviso no manual" — flag ligada com aviso de desligada é manual
  mentindo.
- **LOTE de polimento não infla manual.** Correção de UI sem mudança de comportamento (badge
  que piscava, texto truncado, botão pequeno demais no celular) → marque a linha ✅ com nota
  `sem impacto de manual`, ou absorva como ajuste de 1 linha na seção existente. O manual
  ensina a usar; changelog visual fica no git.
- **PT-BR com acentuação completa** em tudo.
