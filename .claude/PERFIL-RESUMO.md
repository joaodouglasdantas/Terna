# Perfil — RESUMO para subagentes (2.4.0)

> **Sincronizado com o Perfil:** `191477373932522` (2026-08-13) — carimbo do `perfil-frescor.sh`; NAO edite a mao.

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

- **Projeto:** `<nome + slug>`
- **Stack:** `<ex: PHP 7.4 + MySQL + jQuery>`
- **Compatibilidade de produção (TETO):** `<ex: PHP 7.4 — nada de sintaxe 8.x>`

## CLI e banco (caminhos ABSOLUTOS — nunca assuma PATH)

- **Interpretador:** `<ex: C:/laragon/bin/php/php-7.4.33/php.exe>`
- **Cliente de banco:** `<ex: C:/laragon/bin/mysql/.../mysql.exe -u root -pSenha>`
- **Banco de teste local:** `<nome>` · **Smoke test:** `<comando>`
- **Base URL local:** `<ex: http://localhost/projeto>`

## Estrutura (onde as coisas ficam)

- **Endpoints/API:** `<caminho>` · **Páginas/views:** `<caminho>` · **JS:** `<caminho>`
- **Migrations:** `<caminho>` · **Mapa do schema:** `<arquivo>`
- **Doc raiz de convenções:** `<ex: CLAUDE.md>`

## Réguas críticas (a triagem do review ancora AQUI)

1. **Datas de negócio:** vêm da origem/payload, NUNCA `NOW()`/relógio do servidor
   (auditoria `created_at` pode). Timezone: `<tz>`.
2. **Auth na primeira linha** de todo endpoint, antes de banco/efeito.
3. **Idempotência de envios:** registro processado por worker externo é marcado
   "enviado" na criação.
4. **Soft delete:** `<sim/não — coluna>`; nunca DELETE físico se sim.
5. **Prepared statements sempre** — nunca concatenação em SQL.

## Armadilhas específicas do projeto

- `<colar/atualizar a lista curta de anti-patterns do Perfil → Armadilhas>`

## Integrações com efeito colateral irreversível

- `<listar: integração → helper/interceptor central → palavras-chave>` (ou "Nenhuma")
- **Safe mode:** `<flag + como validar>`

## Armadilhas de teste/seed (E2E)

- **Framework:** `<ex: Playwright>` · **Specs:** `<dir>` · **Screenshots:** `<pasta>`
- **Comando (spec único):** `<comando>`
- **Verificação visual (agentes):** `<estado do Playwright + fatos desta máquina — ex.: "1.58.2 + 3 navegadores; ⚠️ Browser pane NÃO funciona nesta máquina">` — evidência é PNG do Playwright na pasta acima; pane é sonda de **1 tentativa** (PLATAFORMAS.md §7)
- `<colar a lista curada de tropeços de seed/ambiente do Perfil>`

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
