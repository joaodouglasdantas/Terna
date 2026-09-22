# TASK-[NNN]: [Titulo da acao no imperativo - ex: Criar endpoint, Modificar template, Implementar funcao]

> **INSTRUCOES DE USO DESTE TEMPLATE:**
>
> 1. Salve como: `prds/PRD-[NNN]-[nome-curto]/tasks/TASK-[NNN]-[descricao-curta].md`
> 2. Cada task deve ser atomica: uma unica responsabilidade, um ou poucos arquivos
> 3. Substitua todos os campos entre `[colchetes]` com os valores reais
> 3b. **Camadas (3.4.11):** OBRIGATORIAS = Metadados, Objetivo, Arquivo(s) Afetado(s),
>     Alteracoes Detalhadas (contrato), Checklist "Apos implementar" (aceite). CONDICIONAIS
>     (so quando a task pede) = Trecho de risco, Testes manuais, Cenarios E2E (LISTA; codigo de
>     referencia SO sem spec precedente), Rollback (migration/dado irreversivel), Notas Tecnicas.
>     **Teto: ~180 linhas por task.** Secao condicional sem conteudo: remova a secao inteira, nao
>     deixe placeholder. Medido 01/09: tasks de 133-177 linhas executaram igual; 371-403 linhas
>     dobraram o custo de cada gate e das correcoes.
> 4. Remova este bloco de instrucoes antes de finalizar
>
> **INSTRUCAO DE EXECUCAO:**
>
> Esta task **DEVE** ser executada usando o **modelo Sonnet**:
> ```
> Agent tool:
>   subagent_type: "general-purpose"
>   model: "sonnet"
>   prompt: "Leia a task em [caminho-completo-da-task] e execute todas as alteracoes descritas."
> ```
>
> — **No Codex CLI:** nao ha Agent tool/`subagent_type` — delegue ao subagente nativo
> equivalente (`worker`/`explorer`; ver `.claude/PLATAFORMAS.md` §3). A regra de
> paralelismo/isolamento e a mesma.
>
> Antes de implementar, o LLM deve obrigatoriamente validar (tudo a partir do
> **Perfil do Projeto**, `.claude/PERFIL-PROJETO.md`):
> - Ambiente ativo e caminhos de CLI (Perfil → CLI)
> - Credenciais locais do banco (Perfil → Banco de dados — apenas DEV local)
> - URL local da API (Perfil → Aplicacao)
> - REGRA CRITICA de data/hora: toda data de **negocio** vem da origem (frontend/script),
>   NUNCA do relogio do servidor/banco (Perfil → Timezone e datas de negocio)
> - REGRA de integracoes com efeito colateral: idempotencia na criacao (Perfil → Integracoes)
> - Nunca assumir binarios no PATH — usar os caminhos absolutos do Perfil
>
> **NAO REMOVA ESTA INSTRUCAO.**

---

## Metadados

| Campo | Valor |
|-------|-------|
| **PRD** | [PRD-[NNN]-[nome-curto].md](../PRD-[NNN]-[nome-curto].md) |
| **PRD Tecnica** | [PRD-TECNICA-[NNN]-[nome-curto].md](../PRD-TECNICA-[NNN]-[nome-curto].md) |
| **Status** | [Pendente / Em Andamento / Concluida / Bloqueada] |
| **Tipo** | [front / backend] |
| **Duelo** | [auto / sim / nao] |
| **Depende de** | [TASK-XXX [requires] — consome <artefato nomeado> · TASK-YYY [barrier] — <condicao de seguranca> · ou "Nenhuma"] |
| **Conflita com** | [TASK-ZZZ [mutex] — <recurso disputado: mesmos arquivos / mesmo banco / mesmo servidor de teste> ou "Nenhuma"] |
| **Bloqueia** | [TASK-XXX ou "Nenhuma"] |
| **Produz** | [simbolos que ESTA task publica para outras: `window.nomeDaFuncao` · `POST api/x.php` · campo `resposta.campo` · evento `nome` — um por item, separados por ` · ` — ou "Nenhum"] |
| **Consome** | [cada simbolo de fora que esta task usa, com a ORIGEM provada: `window.X — existente arquivo.js:123` (linha onde `window.X =` esta) · `api/y.php — TASK-003` (a TASK-003 lista `api/y.php` em Produz) — ou "Nenhum"] |

> **Produz/Consome (3.5.7 — incidente PRD-144):** "funcao global existente" sem `arquivo:linha` nao existe: o
> `costura-check.mjs --tasks` (rodado pelo `task-packet --check`) REPROVA consumo sem origem provada, origem
> "existente" cujo arquivo/trecho nao contem o simbolo, e "TASK-N" que nao o lista em Produz. Quem consome
> `window.X` que ninguem produz publica ele na MESMA task (`window.X = X` ao lado das exposicoes do modulo).

> **"Duelo" decide se dois modelos baratos escrevem antes do hefesto (3.3.0):** `auto` (default —
> a `/prd-exec` aplica os criterios: `backend`, ≤ 3 arquivos-alvo, sem migration, sem integracao
> de efeito colateral, sem auth, sem `[barrier]`), `sim` (forca, mesmo fora dos criterios — so se
> a task e mecanica de verdade) ou `nao` (nunca — task com julgamento de dominio). Ausente = `auto`.
>
> **"Tipo" decide QUEM forja (2.9.0):** `front` = a task constroi/altera interface (view, template,
> componente, CSS, JS de tela) e vai para o **dedalo**; `backend` = qualquer outra coisa, vai para o
> **hefesto**. Task mista deve ser fatiada; nao dando, marque `front` e descreva a parte de backend
> no objetivo. Campo ausente = o `/prd-exec` decide pela extensao dos arquivos citados.

> **O grafo e execucao, nao sugestao de ordem:** a Fase 1 do `/prd-exec` roda em PARALELO
> (mesma onda) todas as tasks cujas arestas ja fecharam. "Nenhuma" = entra na primeira onda.
> **A aresta e TIPADA (3.2.1)** — tres relacoes, tres tratamentos:
>
> - **`[requires]`** — esta task **le, importa ou consome** algo que a outra cria (coluna,
>   endpoint, helper, contrato, arquivo). **Nomeie o artefato:**
>   `TASK-003 [requires] — consome a coluna clientes.pix_tipo criada la`. Requires sem artefato
>   nomeado e **derrubado** pelo gate de largura do `/prd-exec` e a task sobe para a onda 1.
> - **`[barrier]`** — esta task precisa de uma **condicao de seguranca ou estabilizacao**, sem
>   consumir arquivo nenhum: `TASK-002 [barrier] — autenticacao estabilizada antes do teste`.
>   Barrier legitima **nao e derrubada** — o que se cobra e a condicao escrita. Nao use barrier
>   como disfarce de "faz mais sentido depois".
> - **`[mutex]`** (campo **`Conflita com`**) — nao ha dependencia logica, mas as duas **disputam
>   o mesmo recurso**: `TASK-005 [mutex] — escrevem os mesmos arquivos de view`. Mutex **nao vira
>   ordem**: as duas ficam na mesma onda e o `/prd-exec` escalona para nao coincidirem.
>
> Se a resposta e so *"faz mais sentido depois"*, **nao ha aresta** — escreva "Nenhuma". Caso
> medido (PRD-117): um elo de conveniencia reteve uma task de 155 min ate o minuto 85 e segurou
> 2h30 de execucao com 2 agentes vivos.
>
> **PRD antiga** com `Depende de: TASK-003` sem tipo continua valida: a sessao pai classifica a
> aresta antes de aplicar qualquer regra, e **nao a remove** so porque nao ha consumo literal de
> arquivo.

---

## Objetivo

[Descreva em 1-2 frases o que esta task deve realizar. Seja claro e direto.]

---

## Arquivo(s) Afetado(s)

> Localizacao por tipo no Perfil → "Estrutura de diretorios do projeto".

| Arquivo | Acao | Linhas de referencia |
|---------|------|----------------------|
| [caminho/do/arquivo] | [Criar/Modificar] | [Linhas XX-YY ou "Novo arquivo"] |

---

## Alteracoes Detalhadas

> **CONTRATO, nao copia de codigo (2.4.0).** Descreva O QUE muda (contrato: assinatura,
> entrada/saida, regras, estados) e **referencie** o "Componente N da PRD Tecnica" — nunca
> duplique codigo que ja esta la. Codigo inline SO para trecho de risco que nao esta na
> tecnica (migration/SQL delicado, regex, integracao) e curto (ate ~30 linhas).

### 1. [Descricao da alteracao]

**Localizacao:** [arquivo], linha [XX]
**Referencia:** Componente [N] da PRD Tecnica (o codigo de referencia, quando houver, esta la)

**Contrato:**
- [assinatura/endpoint/estrutura — entrada e saida]
- [regras de negocio que se aplicam (das Reguas criticas do Perfil)]
- [estados/erros a cobrir]

**Trecho de risco (SO se nao estiver na PRD Tecnica; ate ~30 linhas):**
```
[codigo do trecho critico — completo e funcional, nunca pseudocodigo]
```

**Explicacao:** [Por que essa mudanca e necessaria]

---

### 2. [Descricao da alteracao]

[Repetir a estrutura acima para cada alteracao dentro desta task]

---

## Checklist de Implementacao

### Antes de implementar (so os itens que se aplicam)
- [ ] Confirmar que os arquivos de referencia existem e as linhas estao corretas
- [ ] Verificar dependencias (tasks anteriores ja concluidas)
- [ ] Confirmar ambiente ativo e caminhos de CLI (Perfil → CLI)
- [ ] Confirmar regra CRITICA de data/hora (Perfil → Timezone e datas de negocio)
- [ ] Confirmar regra de idempotencia de integracoes, quando aplicavel (Perfil → Integracoes)
- [ ] [Verificacao especifica do contexto]

### Durante a implementacao (so os itens que se aplicam)
- [ ] [Acao 1]
- [ ] [Acao 2]
- [ ] [Acao 3 — ex: Testar sintaxe do arquivo]
- [ ] Criar/atualizar arquivo de teste E2E (se houver impacto visual/funcional) no diretorio
      do Perfil → Testes E2E. **Para specs de UX/integracao** (modais, callbacks pos-acao,
      refetch de listagem, atualizacao de estado): usar **fluxo real** — clicar nos
      elementos como um usuario, aguardar a request HTTP e validar o estado pos-acao real.
      NAO invocar handlers diretamente via JS (pula a cadeia de eventos e mascara bugs).
      Ver detalhamento em `prds/_templates/TEMPLATE-PRD-TECNICA.md > "Specs UX devem usar
      fluxo real"`.
- [ ] Se endpoint novo: validar autenticacao/token na **primeira linha** (Perfil → Armadilhas)
- [ ] Seguir as convencoes de frontend do projeto (doc raiz / Perfil → Armadilhas)

### Apos implementar
- [ ] Validar sintaxe de cada arquivo modificado usando o comando de lint do Perfil → Lint
      automatico (o hook `lint.sh` ja faz isso a cada Write/Edit)
- [ ] **Compatibilidade de producao:** revisar codigo novo contra as restricoes do Perfil →
      Compatibilidade de producao (ex: nao usar features de runtime mais novo que producao)
- [ ] Testar a funcionalidade modificada manualmente (Perfil → Aplicacao para a URL local)
- [ ] Verificar que funcionalidades existentes nao foram quebradas
- [ ] Executar **o menor spec estritamente local** desta task (Comando spec unico do Perfil).
      **Contrato de testes (3.2.1):** o executor roda lint dos arquivos que tocou, typecheck
      focado e o spec da SUA task — **nunca** a familia `PRD-NNN-*` inteira nem a suite completa
      do projeto (as duas sao da sessao pai, uma vez, com o tree estabilizado), e **nunca**
      "aproveita" comando cujo glob varra specs de outras tasks. Sem spec local isolavel:
      registre `teste local: n/d (coberto pelo acceptance central)` no relatorio
- [ ] [Verificacao especifica do contexto]
- [ ] **Se esta e a ultima task da PRD:** atualizar a doc raiz de convencoes (Perfil →
      Estrutura → "Doc raiz de convencoes"). Ver checklist "Pos-Conclusao da PRD" na PRD Tecnica.

---

## Invariantes do gate — condicional (3.4.18): so quando um 🔴 dos gates da criacao caiu nesta task

> Regra de negocio/seguranca/dinheiro que um gate da criacao marcou 🔴 e que ESTA task implementa.
> Cada linha traz a PROVA executavel (spec, comando, consulta) com os numeros esperados. O executor
> roda a prova ANTES de devolver (sem prova = Status PARCIAL); o sherlock comeca o review por ela.

| # | Invariante (1 linha) | Prova executavel (comando/spec + saida esperada) | Origem |
|---|---|---|---|
| I1 | [ex.: taxa da financeira incide sobre o BRUTO sacado] | [ex.: `npx playwright test e2e/fin-taxa.spec.js` → despesa 50,00 para bruto 1.000,00 a 5%] | [beholder c1/B3] |

---

## Testes de Verificacao (Manuais) — condicional: so com tela/fluxo

### Teste 1: [Nome do teste]
- **Acao:** [O que fazer para testar — ex: acessar <URL local do Perfil>, clicar em X, preencher formulario]
- **Resultado esperado:** [O que deve acontecer — ex: registro criado, estado atualizado, idempotencia gravada]

### Teste 2: [Nome do teste]
- **Acao:** [O que fazer para testar]
- **Resultado esperado:** [O que deve acontecer]

---

## Testes E2E

> **OBRIGATORIO (quando houver impacto visual/funcional, e o Perfil declarar um framework
> E2E):** toda task deve criar/atualizar testes E2E que cubram as funcionalidades
> implementadas ou modificadas, executados e passando antes de concluir a task. Se o Perfil
> declara "Nenhum" framework E2E, substituir por uma checklist de aceitacao manual.

### Arquivo de Teste

| Campo | Valor |
|-------|-------|
| **Arquivo** | `<diretorio E2E do Perfil>/[modulo]-[funcionalidade].spec.<ext>` |
| **Cria novo arquivo?** | [Sim / Nao — atualiza existente] |

### Cenarios E2E

#### Cenario 1: [Descricao do cenario]
- **Tipo:** [Happy path / Erro / Edge case]
- **Passos:**
  1. [Navegar para URL X]
  2. [Interagir com elemento Y]
  3. [Verificar resultado Z]
- **Assertion principal:** [O que deve ser verificado]

#### Cenario 2: [Descricao do cenario]
- **Tipo:** [Happy path / Erro / Edge case]
- **Passos:**
  1. [Passo]
- **Assertion principal:** [Verificacao]

### Codigo de Referencia do Teste E2E — condicional (3.4.11)

> SO quando NAO existe spec precedente no diretorio E2E do Perfil. Havendo precedente, cite o
> arquivo (`ver <dir E2E>/<spec-precedente>.spec.js, padrao de login e helpers`) e OMITA este bloco.

> Exemplo em Playwright. Substitua o login, os seletores e a base URL pelos valores do
> Perfil → Testes E2E. Se o projeto usa outro framework, adapte.

```javascript
// <diretorio E2E do Perfil>/[modulo]-[funcionalidade].spec.js
const { test, expect } = require('@playwright/test');

test.describe('[Modulo] - [Funcionalidade]', () => {
  test.beforeEach(async ({ page }) => {
    // Login de teste — valores e seletores no Perfil → Testes E2E
    await page.goto('<pagina de login>');
    await page.fill('<seletor usuario>', '<login de teste>');
    await page.fill('<seletor senha>', '<senha de teste>');
    await page.click('<seletor submit>');
  });

  test('[descricao do cenario 1]', async ({ page }) => {
    // [Passos e assertions]
  });

  test('[descricao do cenario 2]', async ({ page }) => {
    // [Passos e assertions]
  });
});
```

### Checklist E2E

- [ ] Arquivo de teste criado/atualizado no diretorio do Perfil → Testes E2E
- [ ] Todos os cenarios happy path cobertos
- [ ] Cenarios de erro/validacao cobertos (quando aplicavel)
- [ ] Spec local desta task executado (Comando spec unico do Perfil) e passando
- [ ] **Familia da PRD e suite completa: NAO sao do executor** — a sessao pai roda a familia uma
      vez na onda de validacao, e a suite completa (PRD multiplo de 5) no fechamento

---

## Rollback — condicional: so migration/dado irreversivel

[Descreva como desfazer esta task especifica, caso necessario]

```
// Restaurar linha XX para:
[codigo original]
```

---

## Notas Tecnicas — condicional: so armadilha real

- [Qualquer observacao relevante para quem vai implementar]
- [Armadilhas conhecidas, edge cases, restricoes do projeto — confronte com o Perfil →
  Armadilhas do projeto]
