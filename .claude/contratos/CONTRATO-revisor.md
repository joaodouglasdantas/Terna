# Contrato mecânico — REVISOR (sherlock)

> Chega no topo do review packet (`## 0. Contrato do papel`). Vale igual com ou sem packet. Só a
> mecânica compartilhada; a persona, as lentes e a régua do Perfil estão em
> `.claude/agents/sherlock.md`.

## Onde ler

Seu contexto de review está no packet: diff, arquivos tocados, contratos das tasks, pasta de
relatórios e piso de severidade. Não leia a PRD inteira, o Perfil completo, o `harness.env` nem
arquivos fora do diff — quem montou o packet já pagou esse custo; lacuna essencial para julgar um
trecho vira achado `não-verificável`, nunca caçada de contexto. Para ler arquivo, listar pasta ou
procurar texto use Read, Glob e Grep; o hook `guard-bash` nega leitura pura via Bash em subagente.
Bash é para executar (git read-only, lint, um teste focado) — agrupe num comando só.

## Cegueira

Não leia relatórios de review existentes (`codex-reviews/`, `*-ciclo*-*.md`, `REVIEW-*.md`) antes
de fechar o seu: a dupla-cega vale pela independência, e espiar o outro revisor transforma
cruzamento de achados em eco.

## Fôlego

Existe um teto de chamadas por despacho e você não o vê nem o conta. Quando o hook `guard-folego`
negar uma ferramenta, pare: grave o relatório no caminho indicado (Write nele segue liberado) com o
que já investigou e o que ficou sem cobrir, Veredito ⚠️ PARCIAL-TEMPO, e devolva. A sessão-pai
decide se despacha outro revisor para o restante.

## Temporários

Diff salvo, lista de arquivos, script auxiliar: no scratchpad da sessão ou em
`.claude/.harness-run/tmp/` — nunca em `/tmp` nem em caminho de raiz, porque no Git Bash do Windows
isso cai fora do projeto e pendura a execução num prompt de permissão que ninguém vê. O hook
`guard-bash` bloqueia o padrão.

## Classificador de permissão indisponível

Comando negado com "temporarily unavailable" ou "cannot determine the safety" é o classificador do
auto mode fora do ar, não um juízo sobre o comando. Sua investigação é majoritariamente read-only
(Read/Grep/Glob e git read-only não passam pelo classificador): siga por aí. Comando essencial
persistindo negado após 1–2 tentativas vira nota no relatório ("investigação parcial —
classificador de permissão indisponível"), nunca espera nem insistência.

## Invariantes do gate — primeira lente

Se as tasks do packet trazem a seção "Invariantes do gate", comece por ela: para cada invariante,
prove no código (leia; execute se precisar) e registre FECHADO/ABERTO com evidência
(`arquivo:linha` ou saída). Invariante ABERTO é 🔴 automático — os 🔴 da execução costumam ser da
mesma família dos 🔴 da criação.

## Cobertura e evidência

Reporte todo achado, inclusive os incertos e os de baixa severidade, cada um com confiança
(alta/média/baixa) e severidade estimada; a triagem é da sessão-pai, que cruza com o outro revisor
e confronta com o Perfil. Um achado escondido por dúvida nunca chega a quem decide. Achado sem
`arquivo:linha` e trecho não existe. O piso de severidade controla só o detalhamento das
Sugestões no relatório, nunca a omissão de achado.

## Retorno

Salve o relatório na pasta de relatórios indicada no packet como
`<LABEL>-sherlock-ciclo<N>-<timestamp>.md` (crie a pasta se faltar) e devolva o mesmo conteúdo no
chat. Você reporta — não corrige código; Write é só para o relatório.
