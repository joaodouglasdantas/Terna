# Contrato mecânico — EXECUTOR (hefesto, dedalo em Modo O)

> Chega no topo do task packet (`## 0. Contrato do papel`). Vale igual com ou sem packet. É só a
> mecânica compartilhada dos executores; a persona, as lentes e as regras de negócio estão no
> `.claude/agents/<papel>.md`.

## Onde ler

Seu contexto está no packet: contrato da task, resumo do Perfil, componente da técnica e os
arquivos-alvo. Não leia o Perfil completo nem a PRD inteira — quem montou o packet já pagou esse
custo; abra outro arquivo só quando o contrato citar e o packet não trouxer, e o que faltar vai
em "Não verificado" no relatório. Para ler arquivo, listar pasta ou procurar texto use Read, Glob e
Grep; o hook `guard-bash` nega leitura pura via Bash em subagente, porque cada Bash cria um
processo e passa pelos hooks. Bash é para executar (lint, teste, git, migrate, CLI do projeto) —
agrupe o que precisa de Bash num comando só.

## Fôlego

Existe um teto de chamadas por despacho e você não o vê nem o conta. Quando o hook `guard-folego`
negar uma ferramenta, pare: grave o relatório completo no caminho indicado (Write/Edit nele seguem
liberados) com Status ⚠️ PARCIAL-TEMPO — o que fez, o que falta, onde travou, sua recomendação — e
devolva o sumário. Percebeu antes disso que está num ciclo de tentativa-erro sem progresso? Devolva
PARCIAL por conta própria: a sessão-pai decide dividir ou continuar, e um parcial honesto vale mais
que uma maratona.

## Temporários

Script de verificação, dump, CSV intermediário: no scratchpad da sessão (caminho no seu system
prompt) ou em `.claude/.harness-run/tmp/` (crie com `mkdir -p`; é gitignored). Nunca em `/tmp` nem
em caminho de raiz (`/arquivo`) — no Git Bash do Windows isso resolve fora do projeto e pendura a
execução num prompt de permissão que ninguém vê. O hook `guard-bash` bloqueia o padrão; escreva
certo de primeira.

## Classificador de permissão indisponível

Comando negado com "temporarily unavailable" ou "cannot determine the safety" é o classificador do
auto mode fora do ar, não um juízo sobre o seu comando — e o "try again" da mensagem é convite a
espiral. No máximo 1–2 retentativas, intercaladas com trabalho read-only (Read/Grep/Glob não passam
pelo classificador); prefira reformular para um comando da allowlist do Perfil ("Execução
autônoma"). Persistiu? Devolva ⛔ BLOQUEADA — classificador de permissão indisponível (comando X
negado N×) — e a sessão-pai destrava. Nunca espere "até voltar". No host Codex não há classificador:
negação vem do sandbox e é determinística — ajuste o comando ou reporte.

## Edit-first

Em arquivo existente, use Edit cirúrgico (vários blocos pequenos no mesmo arquivo são bem-vindos);
o hook `guard-write` nega Write sobre arquivo existente grande, porque output é o token mais caro do
harness e reescrita total arrisca truncamento. Write é para arquivo novo — ou reescrita genuína de
mais da metade, precedida de `rm` consciente.

## Validação — o que é seu e o que é da sessão-pai

O hook `lint.sh` valida sintaxe a cada Write/Edit e bloqueia em erro (corrija na hora); em host sem
esse hook garantido, rode você o lint do Perfil após cada arquivo. Antes de devolver, rode o lint do
PROJETO (comando do Perfil → "Lint") restrito aos arquivos que você tocou, num comando só, e as
verificações da própria task. Lint reprovado se corrige antes de devolver — nunca ✅ com lint
pendente.

Seu teste é o menor teste estritamente local que prova a SUA task. A família `PRD-NNN-*` e a suíte
completa pertencem à sessão-pai, que as roda uma vez com o working tree estabilizado — não as
inicie, e não "aproveite" um comando cujo glob varra specs de outras tasks, porque isso invalida o
gate central e disputa o servidor de teste com os seus irmãos. Sem spec local isolável, escreva
`teste local: n/d (coberto pelo acceptance central)`.

Nunca rode comando global de encerramento de processo (`taskkill` indiscriminado, `pkill -f node`,
derrubar o servidor de teste) para resolver contenção: isso mata o trabalho dos outros executores e
da própria sessão-pai. Contenção detectada se reporta.

## Invariantes do gate

Se a task traz a seção "Invariantes do gate", cada prova dela roda ANTES de devolver (é local e
focada por construção) e a saída vai colada em "Verificações". Invariante que não fechou = Status
⚠️ PARCIAL com o motivo, nunca ✅ — é a regra que um gate da criação já marcou 🔴 uma vez; devolver
sem prová-la é entregar o mesmo bug duas vezes.

## Verificação provada

Cada linha ✅ da seção "Verificações" do relatório vem com a saída colada — comando e resultado, em
fence — porque a sessão-pai não reexecuta o que você declarou. Verificação sem saída é registrada
como não-provada e rebaixa o Status para ⚠️; o hook `guard-agent --post` confere e diz QUAL item
faltou. O packet já traz a seção **"7. Verificações desta task"** com os comandos (invariantes do
gate, spec da task, lint): copie cada item para "## Verificações" e cole a saída — não invente
verificação nova nem declare feita a que não rodou.

## Testes: só o seu spec, e nunca um spec de depuração

Rodadas de teste têm teto por spec e por task (o hook `guard-playwright` conta; continuação da
mesma task herda o saldo). Não crie spec de sondagem (`_debug*`, `_tmp-*`, `zz*` — o `guard-write`
nega): depure no spec real com `--grep "<cenário>"` e `--workers=1`. Se o lock E2E de outro executor
desta worktree estiver vivo, espere num Bash só (`until [ ! -f <lock> ]; do sleep 5; done; <comando>`)
em vez de repetir a rodada. A seção "6. Ambiente desta worktree" do packet tem URL, banco, login do
Playwright e o caminho do lock — não leia o `.env` para descobrir nada disso.

## Diff do duelo

Se o seu prompt trouxe um diff vencedor de duelo (`DUELO|ok`, pasta `.claude/.harness-run/duelos/<id>/`),
o relatório traz obrigatoriamente a linha `**Diff do duelo:** aplicado | parcial (o que refez) |
reescrito (motivo) — <id>`. O hook `guard-agent --post` grava o evento a partir dela; sem a linha o
vencedor fica "desconhecido" no placar e o modelo que acertou não é medido.

## Retorno em dois níveis

Grave o relatório completo no caminho indicado no prompt (`.claude/.harness-run/relatorios/…`) e
devolva no chat só o sumário de até 12 linhas: Status; arquivos tocados (lista); verificações (1
linha cada); desvios e não-verificado (1 linha cada); caminho do relatório. O que volta ao chat é
relido pela sessão-pai em todos os turnos seguintes — sumário enxuto é economia composta.

## Costura (3.5.7 — incidente PRD-144)

Símbolo de fora que a sua task usa (`window.X`, endpoint, campo de resposta) existe só se você provou:
`grep "window.X ="` (ou a rota/o campo) em código de PRODUÇÃO, com `arquivo:linha` no relatório. Não
existe e nenhuma task o produz? Publique na SUA task (`window.X = X` ao lado das exposições do módulo)
e declare em "Desvios". Guard `if (typeof window.X === 'function')` sobre dependência obrigatória
avisa (`console.error` uma vez), nunca engole. Estado pintado em elemento que mora dentro de um
contêiner que outra função re-renderiza vai no FIM dessa função de render. Cabeçalho com "NÃO
VERIFICADO"/"a integrar na TASK-N" é pendência de merge: resolva ou devolva ⛔ BLOQUEADA. No spec,
nunca crie no `window` a dependência que o produto consome (dublê): espião só envolvendo a função
real (`const orig = window.X; expect(typeof orig).toBe('function')`), e sem `route.fulfill` do
endpoint da própria PRD no acceptance — o `costura-check` (packet do review e gate do `stop`) reprova.

## Nunca

Não commite nem faça `git add`: o working tree é revisado pela dupla-cega e commitado pelo humano.
Não decida por conta própria onde a task é ambígua — pare e devolva a dúvida com Status ⛔
BLOQUEADA; decisão arbitrária sua vira bug do time.
