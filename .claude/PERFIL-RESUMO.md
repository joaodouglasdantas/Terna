# Perfil — RESUMO para subagentes (2.4.0)

> **Sincronizado com o Perfil:** `32405125337816` (2026-09-23) — carimbo do `perfil-frescor.sh`; NAO edite a mao.

> **O QUE É ESTE ARQUIVO.** Destilado (~2 KB) do `PERFIL-PROJETO.md` com SÓ os fatos
> operativos que um subagente (hefesto, sherlock, beholder, michelangelo, atlas,
> peter-quill, tony-stark, dedalo, ariadne) precisa para trabalhar. Motivo medido: num ciclo completo de
> PRD, ~30 subagentes releem o Perfil inteiro (~22 KB) + prosa que não usam — este resumo
> corta a maior fonte de tokens repetidos do harness.
>
> **Sincronia (regra):** quem edita o `PERFIL-PROJETO.md` atualiza este resumo NA MESMA
> PASSADA (a última task de toda PRD já cobra isso, junto da poda do doc raiz) e fecha com
> `bash .claude/hooks/perfil-frescor.sh --carimbar`. O resumo NUNCA contradiz o Perfil — em
> dúvida, o Perfil completo vence.
>
> **Carimbo (2.15.0):** a linha do topo guarda a impressão digital do Perfil no momento em que
> este resumo foi gerado — é ela que o `perfil-frescor.sh` compara (mtime não serve: `git
> checkout` reescreve mtime em ordem arbitrária). `/prd`, `/prd-exec` e `/dt-exec` verificam
> isso no Passo 0 e regeneram o resumo antes de despachar subagente. **Não edite o carimbo à
> mão** — quem o escreve é o `--carimbar`.
>
> **Fallback:** se este arquivo não existir no projeto, os subagentes leem o
> `PERFIL-PROJETO.md` completo (comportamento pré-2.4.0).

## Identificação e stack

- **Projeto:** Terna (`terna`) — jogo de plataforma 2D em pixel art
- **Stack:** TypeScript em tudo; monorepo npm workspaces em `jogo/`. Cliente: Vite + Canvas 2D
  (web; app de PC depois). Servidor: Node 22 + Fastify 5 + WebSocket + Drizzle. Banco: Postgres
  (PGlite embutido em dev/teste). Contratos e dados do jogo: `@terna/compartilhado` (zod).
- **Compatibilidade de produção (TETO):** Node >= 22.12; navegador ES2022; nenhuma dependência nativa.

## CLI e banco (caminhos ABSOLUTOS — nunca assuma PATH)

- **Interpretador:** `C:/Program Files/nodejs/node.exe` (🔧 confirmar) · pacotes: `npm`, sempre em `jogo/`
- **Cliente de banco:** N/A em dev (PGlite em `jogo/apps/servidor/dados/banco/`)
- **Banco de teste:** PGlite em memória, um por arquivo de teste · **Smoke test:** `curl http://localhost:3001/api/saude`
- **Base URL local:** `http://localhost:5173` (API em `/api`, repassada pelo Vite para a porta 3001)
- **Verificar:** `npm --prefix jogo run typecheck` e `npm --prefix jogo test`

## Estrutura (onde as coisas ficam)

- **API:** `jogo/apps/servidor/src/rotas/` · **Tempo real:** `src/tempo-real/` · **Jogo:** `jogo/apps/cliente/src/`
- **Migrations:** `jogo/apps/servidor/drizzle/` · **Mapa do schema:** `jogo/apps/servidor/src/banco/schema.ts`
- **Contratos/dados do jogo:** `jogo/packages/compartilhado/src/` · **Arte:** `jogo/fontes/` → `jogo/ferramentas/`
- **Doc raiz de convenções:** `jogo/README.md`

## Réguas críticas (a triagem do review ancora AQUI)

1. **Auth antes de tudo:** rota de jogador chama `exigirJogador` antes de tocar o banco; o
   WebSocket autentica no `preValidation` (antes do upgrade).
2. **Toda entrada validada com o esquema zod de `@terna/compartilhado`** (HTTP e WebSocket).
3. **Drizzle com query builder/`sql` template** — nunca concatenar texto em SQL.
4. **Segredos:** senha só como hash scrypt; token de sessão só como hash sha256 no banco.
5. **Sem datas de negócio:** só carimbos técnicos `timestamptz` (ISO UTC na API).

## Armadilhas específicas do projeto

- Contrato novo → só em `@terna/compartilhado`, nunca duplicado num lado.
- Save mudou de formato → `DadosSaveV2` + conversão em `atualizarSave`; nunca editar a V1.
- `src/gerado/` e `src/assets/*.png` do cliente são gerados: mude o gerador ou a fonte.
- Dado do jogo (números, itens, mapa) vai em `compartilhado/src/conteudo/`, não no banco.
- Valor vindo do cliente (pontuação, posição) só tem validação de faixa: não confie para prêmio.

## Integrações com efeito colateral irreversível

- Nenhuma. **Safe mode:** N/A.

## Armadilhas de teste/seed (E2E)

- **Framework:** Vitest (sem E2E ainda) · **Specs:** `jogo/apps/*/test/`, `jogo/packages/*/test/`
- **Comando (spec único):** `cd jogo/apps/<app> && npx vitest run test/<arquivo>.test.ts`
- **Verificação visual (agentes):** Playwright não instalado no projeto; comparar canvas com
  `Math.random` semeado e `requestAnimationFrame` controlado (Perfil → Armadilhas de teste).
- Nomes de conta únicos por teste (banco em memória vive o arquivo inteiro).
- WebSocket: ouvir em `onInit` do `injectWS(url, {}, { onInit })` — o `bem-vindo` chega na conexão.

## Convenções da casa adotadas aqui

- `<listar só as com estado adotada/parcial — ex: mfa (adotada, PRD-057)>` (ou "Nenhuma")
- Ao implementar algo que já é convenção da casa, **siga `.claude/convencoes/<slug>.md`** —
  o modelo de dados, os contratos e as armadilhas já estão resolvidos lá.

## Regras de conduta do subagente (fixas)

- Temporários SÓ no scratchpad da sessão ou `.claude/.harness-run/tmp/` — nunca `/tmp`
  nem caminho de raiz.
- NUNCA commitar/`git add`.
- **Respeite o teto de palavras do seu prompt** (3.0.0). Relatório volta para o contexto da
  sessão principal e é relido a cada turno: estourar o teto é defeito, não zelo. Sem prosa de
  abertura, sem recapitular o pedido — comece pelo achado.
- **O que você não verificou vai numa seção "Não verificado"** — nunca preencha lacuna com
  suposição apresentada como fato. Vale para agente nativo e para CLI externo delegado.
- Negação com "temporarily unavailable"/"cannot determine the safety" = classificador
  indisponível: máx 1-2 retentativas intercaladas com read-only; persiste → reporte
  BLOQUEADA.
