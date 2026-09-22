---
name: mockup
description: "Desenha a maquete ANTES do codigo — dispara a ariadne para gerar mockup HTML navegavel e auto-contido (variantes, estados, dados fake em PT-BR), abre no preview e conduz o loop de refino ate o desenho estar certo. No fim, o mockup vira entrada de /prd, vira DT, e promovido para docs/ ou e descartado. Use quando pedirem 'faz um mockup', 'como ficaria essa tela', 'quero ver antes de especificar', 'monta um wireframe', 'mostra uma opcao pro cliente' — ou antes de abrir uma PRD com tela nova."
---

# /mockup — a maquete antes da obra

Skill de **exploração visual barata**. Ela existe porque, até a 2.8.0, o primeiro pixel de uma
tela só aparecia depois da `/prd-exec` — ou seja, todo refino visual acontecia com o código já
escrito, revisado e testado. Aqui o desenho vem **antes** da PRD técnica, das tasks e das ondas de
hefesto, quando mudar de ideia custa minutos.

Quem desenha é a **`ariadne`** (subagente). Esta skill é a condução — entender o pedido, disparar,
mostrar, refinar e decidir o destino.

## Uso

```
/mockup <descrição da tela ou fluxo>
/mockup --manter <descrição>        # já nasce em docs/mockups/ (versionado, para mostrar a cliente)
/mockup --variantes=N <descrição>   # força N variantes (default: a ariadne decide, 1 a 3)
/mockup --prd=NNN <descrição>       # amarra a maquete a uma PRD existente
/mockup refinar <slug|caminho>      # itera sobre uma maquete já feita
```

## Quando usar

- Antes de abrir uma `/prd` que tem **tela nova** — a maquete corrige o escopo enquanto ele é papel.
- Quando o pedido do cliente é **visual e ambíguo** ("queria uma tela pra acompanhar os
  atendimentos") e conversar sobre texto não converge.
- Para **mostrar a um cliente** antes de fechar orçamento ou contrato (`--manter`).
- Quando duas soluções de tela são defensáveis e a discussão está travada — duas variantes
  resolvem em 10 minutos o que meia hora de reunião não resolve.

## Quando NÃO usar

- A tela é **irmã evidente** de outra que já existe (mesmo formulário, outro cadastro) → vá direto
  para a `/prd`; o `dedalo` herda o padrão sozinho.
- O trabalho é **backend/migration/config** sem interface.
- A tela **já existe** e o problema é qualidade dela → é caso do `michelangelo` (auditoria), não de
  maquete nova.
- **Já existe PRD técnica escrita** com a seção Frontend fechada → maquetar depois é retrabalho;
  ou você está corrigindo a PRD (aí sim, vale) ou está atrasando a execução.

## Passo 0 — Perfil do projeto

Leia `.claude/PERFIL-RESUMO.md` (fallback `.claude/PERFIL-PROJETO.md`). Sem nenhum dos dois, avise
que o projeto não está portado e siga assim mesmo — a maquete é exploratória e não escreve código
de produção, mas **declare** que rodou sem Perfil.

**Telemetria** (best-effort, nunca bloqueia):
`bash .claude/hooks/harness-metrics.sh start MOCKUP-<slug>`

> **Esforco da sessao — fase PENSAR (3.5.3).** O Perfil ("Nivel de esforco" → linha "Esforco — fase pensar",
> default `high`; `xhigh` no preset maximo) diz o esforco que a sessao deve ter nesta skill. No
> inicio, rode `bash .claude/hooks/esforco.sh pensar --atual <nivel>` — o `<nivel>` vem de
> `mcp__ccd_session_mgmt__get_session` com `session_id: "self"` (campo `effort`) quando a ferramenta
> existir; sem ela, omita `--atual`. Saida `AJUSTAR` = avise UMA vez, *"Esforco: fase pensar pede X; sessao
> em Y — ajuste com `/effort X` (ou responda 'seguir')"*, e espere a resposta antes de despachar subagente;
> `ok`/`n/d` = siga. Nenhum subagente tem esforco proprio — todos herdam o da sessao (medido 12/09,
> PRD-142-b: 83% dos tokens dos executores eram raciocinio herdado de uma sessao em `high`).

## Passo 1 — Entender o pedido (UMA pergunta, só se precisar)

Se a descrição já responde os quatro pontos abaixo, **não pergunte nada** — velocidade é o valor
desta skill. Faltando algum, junte tudo numa **única** mensagem (`AskUserQuestion` quando
disponível, senão texto):

1. **Quem usa** — operador interno (densidade, atalho, uso diário) ou cliente final (clareza,
   primeira impressão)? Muda a régua inteira do desenho.
2. **A tarefa principal** — o que a pessoa vem fazer nesta tela? (uma frase; vira a ação primária)
3. **Tem tela irmã?** — existe algo parecido no sistema que a maquete deve imitar? (se o usuário
   não souber, a ariadne procura — não insista)
4. **Uma opção ou alternativas?** — caminho óbvio pede 1 variante; decisão em aberto pede 2 ou 3.

## Passo 2 — Disparar a ariadne

**Um** agente `ariadne` (subagente, contexto limpo). Nunca dispare vários em paralelo para o mesmo
pedido: as variantes precisam nascer do **mesmo partido visual**, e partidos diferentes por
variante transformam a comparação em ruído.

```
Agent tool:
subagent_type: "ariadne"
model: "sonnet"
prompt: |
  Desenhe a maquete de <tela/fluxo> para o projeto <nome>.

  Contexto do pedido:
  - Público: <interno | cliente final>
  - Tarefa principal: <frase>
  - Tela irmã indicada: <caminho | nenhuma indicada — procure>
  - Variantes: <N | decida você (1 a 3)>
  - Destino dos arquivos: <prds/PRD-NNN-<slug>/mockup/ | .claude/.harness-run/mockups/<slug>/ |
    docs/mockups/<slug>/>

  Siga integralmente o seu contrato (.claude/agents/ariadne.md): extraia o partido visual REAL do
  projeto ANTES de desenhar, todo estado obrigatório no andaime, dados fake plausíveis em PT-BR,
  zero CDN, e capture a maquete com `npx playwright screenshot` (desktop + 375px) antes de
  entregar — evidência é arquivo, não janela (PLATAFORMAS.md §7). Escreva o MOCKUP.md ao lado dos
  arquivos e devolva o relatório no formato do contrato.
```

## Passo 3 — Mostrar

Não devolva só um caminho de arquivo — **mostre**:

1. Capture a maquete com **Playwright headless** (canônico — PLATAFORMAS.md §7), gravando arquivo
   ao lado dos HTMLs:

   ```bash
   npx playwright screenshot "file:///<caminho absoluto do HTML>" <pasta>/<slug>-preview.png
   npx playwright screenshot --viewport-size=375,812 "file:///<...>" <pasta>/<slug>-375.png
   ```

   O browser pane é **sonda opcional de uma tentativa** (bom para clicar e ver estados onde
   funciona). Falhou → não retente: diga "pane indisponível" e siga com os PNGs.
2. Apresente, em bloco curto:
   - o **partido visual** adotado e de onde ele veio (herdado de tal tela / novo);
   - a tabela de variantes com a aposta de cada uma;
   - as **decisões que a ariadne tomou** e que o Charles pode derrubar;
   - o caminho de cada arquivo (clicável) e o do `MOCKUP.md`.
3. Diga como abrir na mão, porque o arquivo é auto-contido:

   ```bash
   start .claude/.harness-run/mockups/<slug>/<arquivo>.html
   ```

## Passo 4 — Loop de refino (o coração da skill)

Pergunte objetivamente: **"o que muda?"** e itere. Cada rodada dispara a ariadne de novo, em modo
refino — ela lê o `MOCKUP.md` e o HTML atual, aplica só o pedido e **preserva o resto**.

- **Sem limite de ciclos** — quem decide quando parar é o humano, e cada ciclo é barato (um Sonnet
  editando um HTML).
- **Versione as rodadas relevantes** (`-v2`, `-v3`) só quando o Charles quiser comparar o antes e
  o depois; caso contrário, sobrescreva — o valor está na maquete atual, não no histórico.
- **Registre no `MOCKUP.md`** o que mudou e por quê. É esse acúmulo que vira briefing do dedalo.
- Se o refino começar a pedir **regra de negócio, permissão ou dado real**, pare e diga: isso não
  é decisão de maquete, é escopo de PRD.

## Passo 5 — Destino (sempre pergunte antes de encerrar)

| Destino | O que fazer |
|---|---|
| **Vira PRD** | Rode a `/prd` informando a maquete. O partido visual, o fluxo e a copy validados entram como **entrada do Passo 7** — o `dedalo` parte do que já foi aprovado em vez de recomeçar. Mova os arquivos para `prds/PRD-NNN-<slug>/mockup/`. |
| **Vira DT** | Rode a `/dt` e anexe o caminho da maquete no campo de evidência. DT de interface com "como deveria ser" desenhado ainda é executável meses depois. |
| **Manter** | Mova para `docs/mockups/<slug>/` (versionado) — é o caso de mostrar a cliente, anexar a orçamento ou guardar como referência de padrão. |
| **Descartar** | Deixe em `.claude/.harness-run/mockups/` (gitignored) e siga a vida. **Não** apague nada sem confirmação — o custo de manter é zero. |

**Telemetria:** `bash .claude/hooks/harness-metrics.sh stop MOCKUP-<slug> --subagents=<n de rodadas da ariadne> --preset=<preset>`

## Regras (invioláveis)

1. **A maquete nunca vira produção.** Nada do que sai daqui é copiado para view/componente do
   projeto por esta skill. Quem constrói o front real é o `dedalo`, dentro da `/prd-exec`, com
   task, review e gate de UX. O HTML da ariadne é referência visual — não código-fonte.
2. **Nunca escreva fora das pastas de mockup.** `prds/PRD-NNN-<slug>/mockup/`,
   `.claude/.harness-run/mockups/`, `docs/mockups/`, `prds/debito_tecnico/mockups/`.
3. **Nunca commite.** Nem `git add`. Quem commita é o humano.
4. **Dado real não entra na maquete.** Se foi preciso ler dados do banco para entender o domínio,
   os dados da maquete continuam fictícios e obviamente fictícios.
5. **Sem Perfil ou sem verificação visual, degrade barulhento.** A maquete é conferida com
   Playwright headless (PNG em disco); o pane é bônus de uma tentativa. Sem nenhum dos dois, diga
   o que faltou — nunca finja que a maquete foi conferida rodando.
6. **Esta skill não substitui gate nenhum.** Maquete aprovada não dispensa o `michelangelo` na
   `/prd` nem na `/prd-exec` — ela só faz esses gates começarem de um lugar muito melhor.

## Output esperado

```
## 🧵 Maquete — <tela/fluxo>

**Partido visual:** <herdado de X | novo, via ui-ux-pro-max>
**Arquivos:** <caminhos>  ·  **Rodadas de refino:** <N>

| # | Variante | Aposta | Ganha em | Perde em |
|---|----------|--------|----------|----------|

**Decisões da ariadne (derrubáveis):** <lista curta>
**Não decidido aqui:** <o que fica para a PRD>

**Destino:** <vira PRD-NNN | vira DT-NNN | mantido em docs/mockups/ | descartado>
```
