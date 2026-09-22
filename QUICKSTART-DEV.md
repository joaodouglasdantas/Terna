# Quickstart do dev — trabalhando num projeto com harness

> Guia de 1 página para quem vai **usar** o harness num projeto já portado.
> Manual completo (portar, manter, configurar): [README.md](README.md).

## O essencial em 30 segundos

1. Abra o Claude Code na **raiz do repo**. Os hooks carregam sozinhos.
2. **Feature ou bug com escopo?** → `/prd Adicionar <coisa>` (cria a spec) e depois
   `/prd-exec PRD-NNN` (executa). Não pule a PRD para "ir mais rápido" — é ela que
   carrega os gates de segurança.
3. **Problema visto mas sem tempo de resolver?** → `/dt <descrição>`. Vira documento
   rastreável; a próxima PRD do módulo pode absorvê-lo.
4. **Mudança avulsa antes de commitar?** → `/codex-review` (review dupla-cega do
   working tree) ou só *"sherlock, revisa isso"* (review de bolso, mais rápido).
5. **Commit é SEU.** Nenhuma skill/agente commita. O `/prd-exec` te entrega a mensagem
   pronta (Fase 3); revise o diff e commite você mesmo.

## As regras que o harness vai te cobrar (melhor já saber)

- **O Perfil é a lei.** `.claude/PERFIL-PROJETO.md` define caminhos de CLI, banco de
  teste, armadilhas e compatibilidade de produção. Em dúvida, ele vence.
- **Datas de negócio** vêm da origem (payload/frontend), nunca de `NOW()` no servidor.
- **Auth na primeira linha** de todo endpoint novo.
- **Idempotência:** registro que um worker externo envia é marcado "enviado" na criação.
- **Compatibilidade de produção:** não use feature de runtime mais nova que a de prod
  (ex: sintaxe PHP 8 com prod em 7.4) — o review bloqueia.
- **Lint de sintaxe é bloqueante:** se o hook travar seu Write/Edit, o arquivo tem erro
  de sintaxe de verdade — corrija, não contorne.

## Quem é quem (os agentes que você vai ver trabalhando)

| Agente | Faz o quê | Quando aparece |
|--------|-----------|----------------|
| **tony-stark** | propõe melhorias (tecnologia + fluxo) | automático em toda `/prd` |
| **atlas** | mapeia o impacto/blast radius da mudança | `/prd` em módulo existente; ou *"atlas, o que quebra se eu mudar X?"* |
| **peter-quill** | explora código/schema/PRDs anteriores (scout read-only) | discovery da `/prd`; ou *"peter-quill, mapeia o módulo X"* |
| **beholder** | red-team da PRD antes de executar | automático no fim da `/prd`, em ciclos (limite no Perfil, `preset`/ausente = 2/3/4; esgotou sem zerar 🔴 → a decisão de seguir/abortar é SUA) |
| **hefesto** | implementa tasks de backend em paralelo | Fase 1 do `/prd-exec` |
| **dedalo** | **autor do front** — projeta a tela na PRD e depois a constrói | automático quando a PRD tem UI (Passo 7.1 da `/prd`) + tasks `Tipo: front` da `/prd-exec` e do `/dt-exec` |
| **ariadne** | maquete HTML navegável antes da spec (para você VER e refinar) | sob demanda — `/mockup`, entrevista da `/prd` quando há tela nova, ou `/dt` de interface |
| **sherlock** | review de código (dupla-cega com o revisor externo do outro modelo) | Fase 2 do `/prd-exec`, `/codex-review`, ou sob demanda |
| **michelangelo** | gate de UI/UX: critica a proposta e audita a tela construída | automático quando a PRD tem UI (Passo 10 da `/prd` + Fase 2.9 do `/prd-exec`, em ciclos); ou *"michelangelo, audita a tela X"* |

> **Sem Codex instalado?** Sem problema — o sherlock revisa sozinho. Com `codex login`
> feito, vocês ganham a dupla-cega (dois revisores independentes).
>
> **Custo de tokens:** TODOS os agentes rodam em **Sonnet** por padrão (política
> Sonnet-first do harness) — tony-stark e beholder entram em toda PRD, e em Opus isso
> estoura o limite da conta. Promover algum agente a Opus é decisão **por projeto**, no
> Perfil (seção "Agentes do harness (modelos)") — não mude sem combinar com o time.
> Dá para ajustar também os dois loops ao que a sua conta comporta: os **ciclos do
> beholder** (mesma seção do Perfil) e o **limite de ciclos do code review** (seção
> "Codex review") — defaults 4; `0` = sem limite. Esgotou sem resolver, a skill para e
> a decisão (seguir/abortar) é sua.

## A conta de IA está apertada? (3.0.0)

O harness sabe mandar parte do trabalho **read-only** da `/prd` para o **Codex CLI**, deixando o
Claude só orquestrando. Precisa de `codex` instalado e `codex login` feito — nada de API nem
chave. Uma variável resolve:

```bash
HARNESS_DELEGATE_MODE=economia claude
```

`off` (default, nada muda) · `apoio` (mapeamento mecânico vai para o Codex) · `economia` (todo o
read-only vai; a sessão só sintetiza, julga e escreve). Para deixar fixo **na sua máquina**, use
`.claude/harness.env.local` — nunca o `harness.env`, que é versionado e viaja para o time.

Se o Codex não estiver disponível, o papel volta para o agente nativo (ou pergunta, em `economia`)
— e isso **sempre aparece** no relatório. O gate de UX (michelangelo) nunca é delegado.

## O harness fala demais? (3.0.0)

`HARNESS_VERBOSITY`: `normal` (como era até a 2.16.1) · `conciso` (**novo default**) · `minimo`
(só marcos de uma linha durante o processo; relatório completo no fim). Vale a pena: o que a
sessão escreve é token de output **e** vira input em todos os turnos seguintes.

Independente do nível, você continua vendo: pergunta de decolagem, qualquer degradação, todo 🔴,
todo erro que exige sua decisão, e o relatório final. Os arquivos em disco nunca encolhem.

## Atualizar o harness deste repo você mesmo: `/prometeu` (3.0.4)

Não precisa esperar ninguém sincronizar por você. Na raiz do projeto:

```
/prometeu
```

Ele acha o **harness base** na sua máquina (o clone de `equipe-tefnet-harness-base` ou
`base-conhecimento/referencias/harness`), compara com este repo e mostra um painel — estado,
versão de→para, o que está defasado, o que é customização sua (preservada) e o risco. **Só
sincroniza depois do seu OK**, e **pergunta** antes de commitar e antes de dar push (commit é
seu — e sempre escopado só aos arquivos do harness).

Primeira vez na máquina e ainda não tem o harness base clonado? Ele **pede o link do
repositório** e clona ao lado.

| Comando | Para quê |
|---------|----------|
| `/prometeu` | diagnostica este projeto e oferece o sync |
| `/prometeu --check` | só o painel, não mexe em nada |
| `/prometeu --pull` | atualiza o clone do harness base antes (recomendado) |
| `/prometeu --all` | varre **todos** os seus projetos e mostra quem está defasado |
| `/prometeu --portar` | instala o harness do zero num repo novo (os 7 passos, guiados) |

> Nunca edite o clone do harness base: ele é um espelho publicado — sua alteração se perde no
> próximo `git pull`. Melhoria que deveria virar padrão da casa? Fale com o mantenedor.

## O harness foi atualizado no repo? (commit do /deus ou do /prometeu)

Quando chegar um commit atualizando o `.claude/` (sync da cópia-mestre), abra o
`.claude/ONBOARDING.md` → seção **"Decisões por versão"** e leia as entradas da faixa
que o repo pulou (a versão está em `.claude/harness.env` → `HARNESS_VERSION`). Versão
nova pode criar campo novo no Perfil ou mudar default — são 5 minutos para conferir se
algo precisa de ajuste, e depois `bash .claude/harness-doctor.sh`.

## E no Codex?

Repo com `HARNESS_TARGETS` incluindo `codex`? Abra o **Codex CLI na raiz do repo**,
confie o projeto (trust) e aprove os hooks via `/hooks` — re-aprovar depois de cada
atualização de hook é normal. As skills viram `$prd` / `$prd-exec` / `$dt` /
`$codex-review` (ou invocação em linguagem natural); o resto do fluxo é idêntico.
Tabela completa de equivalências: [`.claude/PLATAFORMAS.md`](.claude/PLATAFORMAS.md).

## Se algo travar

- `bash .claude/harness-doctor.sh` — diagnóstico completo do ambiente (o que falta).
- Bypasses de emergência (use com critério, são para destravar, não para fugir do
  processo): ver "Bypasses" no [README.md](README.md) e em `.claude/harness.env`.
- Aprendeu algo que o time todo deveria saber (convenção, armadilha, decisão)? Registre
  em `.claude/memory/` (copie o `_TEMPLATE-memoria.md`) — viaja com o repo.
