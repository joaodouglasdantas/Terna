# Contrato mecânico — GATE da criação (beholder, michelangelo em Modo C)

> Chega no topo do packet de revisão da PRD (`## 0. Contrato do papel`). Vale igual com ou sem
> packet. Só a mecânica compartilhada; as lentes, as severidades e o formato do relatório estão em
> `.claude/agents/<papel>.md`.

## Onde ler

Seu contexto está no packet: produto e técnica na íntegra, índice das tasks (metadados, objetivo,
arquivos, testes manuais) e o piso de severidade. Não releia a pasta inteira da PRD nem o Perfil
completo — quem montou o packet já pagou esse custo; abra uma task inteira em `tasks/` só quando um
achado exigir o contrato detalhado dela, e o Perfil completo só na seção que um achado pedir.
Grep por tema continua valendo na pasta da PRD (é como se verifica correção em todas as camadas).
Para ler arquivo, listar pasta ou procurar texto use Read, Glob e Grep; o hook `guard-bash` nega
leitura pura via Bash em subagente. Bash só para executar — e um gate quase nunca precisa.

## Ciclos

O número do ciclo vem no prompt. Em ciclo 2+, o relatório anterior está na pasta da PRD: comece
pela tabela de verificação achado a achado dos 🔴 anteriores, conferindo cada correção por TEMA
(grep pelo conceito — termo da regra, campo, valor — em todos os documentos, não só nos que a
sessão declarou ter tocado): FECHADO / PARCIAL (onde falta, com âncora) / REABERTO, mantendo o
número original. Só depois procure problemas novos, com prioridade para efeito colateral das
próprias correções. Esgotar ciclos sem zerar 🔴 não é seu problema: a sessão-pai para e pede a
decisão humana — você entrega o relatório honesto de cada ciclo. Zero 🔴 = gate fechado; diga isso
no veredito.

## Fôlego

Existe um teto de chamadas por despacho e você não o vê nem o conta. Quando o hook `guard-folego`
negar uma ferramenta, pare: grave o relatório com as lentes que passou e as que ficaram sem cobrir,
Veredito ⚠️ PARCIAL-TEMPO, e devolva. A sessão-pai decide.

## Temporários

Precisou de arquivo auxiliar? Scratchpad da sessão ou `.claude/.harness-run/tmp/` — nunca `/tmp`
nem caminho de raiz (no Git Bash do Windows isso cai fora do projeto e pendura a execução num
prompt de permissão que ninguém vê). O hook `guard-bash` bloqueia o padrão.

## Classificador de permissão indisponível

Comando negado com "temporarily unavailable" ou "cannot determine the safety" é o classificador do
auto mode fora do ar, não um juízo. Seu trabalho é read-only (Read/Grep/Glob não passam pelo
classificador): siga por aí; 1–2 tentativas no máximo e o que ficou sem rodar vira nota no
relatório.

## Cobertura e evidência

Reporte todo achado, inclusive os incertos e os de baixa severidade, cada um com confiança
(alta/média/baixa) e severidade estimada; a triagem é da sessão-pai, que confronta com o Perfil e
decide o que trava a execução. Um achado escondido por dúvida nunca chega a quem decide. Todo
achado aponta `arquivo:seção/RF/TASK` e diz como resolver. O piso de severidade controla só o
detalhamento do relatório (quais níveis ganham ficha completa), nunca a omissão de achado.

## Retorno

Devolva o relatório no formato do seu `.md`; você não corrige a PRD — expõe para a sessão-pai
decidir. Salve na pasta da PRD quando o prompt pedir (`REVIEW-<papel>.md`, sobrescrito por ciclo,
número do ciclo no topo).
