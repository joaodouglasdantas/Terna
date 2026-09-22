# Contrato mecânico — ESCRIVÃO (hermes)

> O hermes não recebe packet: a `/prd` aponta os arquivos no prompt. Leia este contrato quando o
> prompt o citar — ou sempre que rodar sem ele. Só a mecânica; o que escrever e como está em
> `.claude/agents/hermes.md`.

## Onde ler

Leia só o que o prompt aponta: `.claude/PERFIL-RESUMO.md` (fallback: Perfil completo), a PRD
técnica — só os componentes que o plano referencia para as suas tasks; técnica longa nunca é lida
inteira, o glossário garante a terminologia — e o template uma vez. Não leia PRDs de outros
projetos nem relatórios de review de outros papéis. Para ler, listar e procurar use Read, Glob e
Grep (o hook `guard-bash` nega leitura pura via Bash em subagente); caminhos citados em texto
existem de verdade porque você os conferiu com Glob/Grep.

## Um Read e um Write por documento

Os arquivos de `prds/PRD-NNN-*/` são documentos, não código: o `guard-write` libera Write neles.
Agrupe tudo que cai num arquivo e grave-o de uma vez — nunca um Edit por ocorrência. É o que
mantém você longe do teto de fôlego e o que o snapshot+diff da `/prd` audita depois.

## Fôlego

Existe um teto de chamadas por despacho e você não o vê nem o conta. Quando o hook `guard-folego`
negar uma ferramenta, pare: grave o relatório no caminho indicado (Write nele segue liberado) com o
que já está pronto e o que falta em "Decisões pendentes", devolva `PARCIAL-TEMPO` — a sessão-pai
despacha outro hermes por documento.

## Temporários

Rascunho ou lista auxiliar: scratchpad da sessão ou `.claude/.harness-run/tmp/` — nunca `/tmp` nem
caminho de raiz (no Git Bash do Windows isso cai fora do projeto e pendura a execução num prompt de
permissão que ninguém vê).

## Classificador de permissão indisponível

Seu trabalho é Read/Glob/Grep/Write, que não passam pelo classificador do auto mode. Comando negado
com "temporarily unavailable"/"cannot determine the safety" não se re-tenta em loop: 1–2 tentativas
e o que ficou sem rodar vai em "Decisões pendentes".

## Retorno em dois níveis

Grave o relatório completo em `.claude/.harness-run/relatorios/PRD-NNN-hermes-<modo>.md` e
devolva no chat só o sumário de até 12 linhas do seu modo. O que volta ao chat é relido pela
sessão-pai em todos os turnos seguintes.

## Nunca

Não commite. Não altere código do projeto — seu território é a pasta da PRD. Não decida produto,
escopo, grafo ou partido de design: lacuna que exigiria decidir vai em "Decisões pendentes".
