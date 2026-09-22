# PRD Tecnica - PRD-[NNN]: [Titulo descritivo]

> **INSTRUCOES DE USO DESTE TEMPLATE:**
>
> 1. Este documento deve ser criado APOS a PRD de produto estar finalizada
> 2. Salve como: `prds/PRD-[NNN]-[nome-curto]/PRD-TECNICA-[NNN]-[nome-curto].md`
> 3. Apos finalizar, crie as Tasks na subpasta `tasks/` usando o `TEMPLATE-TASK.md`
> 4. Remova este bloco de instrucoes antes de finalizar
>
> ---
>
> **INSTRUCAO CRITICA PARA EXECUCAO:**
>
> A execucao desta PRD Tecnica e das Tasks derivadas **DEVE SEMPRE** ser feita
> utilizando o **modelo Sonnet** (subagent_type com model="sonnet") para otimizar
> custo e velocidade. Exemplo:
>
> ```
> Agent tool:
>   subagent_type: "general-purpose"
>   model: "sonnet"
>   prompt: "Execute a TASK-XXX conforme descrito em [caminho-da-task]"
> ```
>
> — **No Codex CLI:** nao ha Agent tool/`subagent_type` — delegue ao subagente nativo
> equivalente (`worker`/`explorer`; ver `.claude/PLATAFORMAS.md` §3). A regra de
> paralelismo/isolamento e a mesma.
>
> O modelo Opus deve ser usado apenas para:
> - Criacao e revisao de PRDs e PRDs Tecnicas
> - Decisoes arquiteturais complexas
> - Debug de problemas criticos
>
> Antes de executar qualquer Task, o LLM deve confirmar o ambiente ativo e as credenciais
> locais a partir do **Perfil do Projeto** (`.claude/PERFIL-PROJETO.md` → CLI, Banco de
> dados). Para comandos CLI, usar os caminhos absolutos do Perfil — nunca assumir que os
> binarios estao no PATH.
>
> **NAO REMOVA ESTA INSTRUCAO** - ela deve permanecer no documento final.
>
> ---

---

## Referencia

| Campo | Valor |
|-------|-------|
| **PRD de Produto** | [PRD-[NNN]-[nome-curto].md](./PRD-[NNN]-[nome-curto].md) |
| **Data** | [DD/MM/YYYY] |
| **Autor Tecnico** | [Nome] |
| **Versao** | 1.0 |

---

## Analise Tecnica do Sistema Atual

### Arquitetura Relevante

[Descreva brevemente a arquitetura da parte do sistema que sera afetada. Inclua: stack
(ver Perfil → Identificacao), padroes usados (ex: convencao de endpoints, camada de acesso a
dados, autenticacao), fluxo de dados (frontend → API → banco → integracao externa quando
aplicavel). Para convencoes gerais, referencie a doc raiz do projeto, Perfil → Estrutura →
"Doc raiz de convencoes".]

### Codigo Existente Relevante

| Arquivo | Linhas | Descricao |
|---------|--------|-----------|
| [caminho/do/arquivo] | [XX-YY] | [O que esse trecho faz] |

### Dependencias do Sistema

- [Bibliotecas/frameworks relevantes do projeto]
- [Servicos externos com efeito colateral — ver Perfil → Integracoes]
- [Versao especifica se necessario]

---

## Solucao Tecnica Proposta

### Abordagem

[Descreva a abordagem tecnica escolhida e o porque. Se houve alternativas, mencione
brevemente e justifique a escolha.]

### Diagrama de Fluxo (se aplicavel)

```
[Frontend (pagina + script)]
         |
         v
[Endpoint da API] --> [Banco de dados (tabela)]
         |                       |
         v                       v
[Cria registro de envio]   [Worker/integracao consome
                            e dispara efeito externo]
```

---

## Implementacao Detalhada

### [Componente/Arquivo 1]: [caminho/do/arquivo]

**Acao:** [Criar / Modificar]

**Descricao tecnica:**
[Explique o que deve ser feito neste arquivo, com detalhes suficientes para implementar sem
ambiguidade.]

**Codigo de referencia (antes):** (se for modificacao)
```
// Codigo atual - linha XX
[codigo atual]
```

**Codigo de referencia (depois):**
```
[codigo novo completo]
```

**Pontos de atencao (principios — confronte com Perfil → Armadilhas):**
- **Autenticacao primeiro:** validar credencial/token na primeira linha, antes de tocar o
  banco ou disparar efeito.
- **Prepared statements:** nunca concatenar input direto na SQL — usar parametros.
- **Datas de negocio:** vem do payload da origem, nao do relogio do servidor/banco.
- **Resposta consistente:** retornar um envelope previsivel (ex: `{success, data|error}`).

---

### [Componente/Arquivo 2]: [caminho/do/arquivo]

[Repetir a estrutura acima para cada arquivo/componente]

---

## Consultas SQL (se aplicavel)

### [Nome da consulta]

**Objetivo:** [O que a consulta retorna]

```sql
[Query SQL completa e testavel]
```

**Parametros:**
| Parametro | Tipo | Descricao |
|-----------|------|-----------|
| [param1] | [string/int/date] | [descricao] |

**Resultado esperado:**
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| [coluna1] | [tipo] | [descricao] |

---

## Endpoints API (se aplicavel)

### [Metodo] [caminho do endpoint conforme Perfil → Estrutura]

**Arquivo:** [caminho/do/arquivo]

**Parametros de entrada:**
| Parametro | Tipo | Obrigatorio | Descricao |
|-----------|------|-------------|-----------|
| token (ou auth) | string | Sim | Credencial emitida pelo login |
| [param1] | [string] | [Sim/Nao] | [descricao] |

**Resposta (sucesso):**
```json
{
  "success": true,
  "data": { "id": 123 }
}
```

**Resposta (erro):**
```json
{
  "error": "mensagem de erro"
}
```

---

## Contrato de API (Obrigatorio para toda PRD que cria/altera endpoints, scripts CLI, jobs de cron ou contratos de integracao)

> **Quando preencher:** sempre que a PRD criar ou alterar pelo menos 1 endpoint HTTP, 1
> script CLI (cron de manutencao), ou 1 contrato consumido por integracao externa. Para PRDs
> puramente de UI/CSS/migration, omitir esta secao.
>
> **Por que existe:** as Tasks derivadas referenciam o contrato aqui em vez de duplicar
> payload em cada arquivo. Funciona como ponto unico de verdade do request/response.

### Endpoint: [Metodo] [caminho do endpoint]

| Atributo | Valor |
|----------|-------|
| **Tipo de operacao** | [Criar / Modificar / Remover] |
| **Autenticacao** | [esquema de auth do projeto] |
| **Consumido por (visao geral)** | [Frontend / Integracao externa / CRON / Deeplink / Outro endpoint] |
| **Consumidores (ARQUIVOS)** | [`administrativo/assets/js/x.js`, `administrativo/assets/js/y.js` — TODOS os arquivos que leem a resposta; 3.4.34: a costura confere nome a nome] |

#### Campos de entrada

| Campo | Tipo | Obrigatorio | Consumido por | Descricao |
|-------|------|-------------|---------------|-----------|
| token (ou auth) | string | Sim | Frontend, integracao | Credencial emitida pelo login OU header equivalente |
| id_recurso | int | Sim | Frontend | ID do recurso a manipular |
| data_negocio | string (YYYY-MM-DD HH:mm:ss) | Sim | Frontend | Gerada na origem; NUNCA relogio do servidor |
| [campo_X] | [tipo] | [Sim/Nao] | [consumidor] | [descricao] |

#### Campos de saida (sucesso)

> Os NOMES abaixo sao contrato: o JS le exatamente estas chaves. Medido 10/09 (PRD-141): back devolvia `pendentes`, dois JS liam `pendencias` — feature morta ate o review final.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| status | string | "OK" |
| id | int | ID do registro afetado |
| [campo_Y] | [tipo] | [descricao] |

#### Campos de saida (erro)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| status | string | "ERRO" |
| msg | string | Mensagem para log/UI |

#### Diff antes/depois (preencher APENAS se o endpoint ja existia antes desta PRD)

- **Antes (ate PRD-XXX):** payload `{campo_a, campo_b}`, resposta `{status, msg}`.
- **Depois (PRD-NNN):** payload `{campo_a, campo_b, campo_novo}`, resposta `{status, msg, id_novo}`.
- **Compatibilidade:** [retro-compativel / breaking change — listar consumidores impactados].

---

## Frontend / Interface (se aplicavel)

> **Design de UI/UX — use a skill UI UX Pro Max.** Para qualquer tela, componente, layout
> ou *design system*, conduza o trabalho de interface com a skill **UI UX Pro Max** (ver
> README do harness, secao "Skill externa obrigatoria"). Ela ativa sozinha ao descrever a
> UI (ex: "monte o componente X", "layout da tela Y") e gera o design coerente; aqui na
> PRD, documente o componente resultante (markup/JS) seguindo as convencoes do Perfil.

### Componente: [Nome do componente]

**Arquivo:** [caminho da pagina/view conforme Perfil → Estrutura]

**Posicao no layout:** [Descreva onde o componente sera adicionado]

**Markup / template:**
```html
<!-- markup conforme a biblioteca de templating do projeto -->
<div id="container-exemplo"></div>
```

**JavaScript (conforme convencao do projeto):**
```javascript
// Chamada ao endpoint conforme o cliente HTTP do projeto.
// Renderizar resultado conforme a biblioteca de templating adotada.
```

**Inclusao do script na pagina:** seguir a convencao vigente do projeto (ver doc raiz /
Perfil → Estrutura → "JS de pagina").

### REGRA CRITICA — Data/Hora (Frontend + Persistencia)

> **MOTIVO:** o timezone do servidor de producao e/ou do banco pode divergir do timezone do
> projeto, gerando datas incorretas na exibicao e nos relatorios. Ver Perfil → Timezone e
> datas de negocio.

- Exibir data/hora no formato definido no Perfil (ex: padrao BR `dd/mm/yyyy HH:mm:ss`).
- Toda data/hora de **negocio** DEVE ser gerada na origem (frontend/navegador ou o
  script/servico que origina o dado) e enviada no payload.
- **NUNCA** usar o relogio do servidor/banco (`NOW()`/`CURRENT_TIMESTAMP` ou equivalente)
  como fonte primaria de datas de negocio.
- Campos automaticos (`created_at`, `updated_at`) sao apenas controle interno e NAO devem ser
  usados como data de exibicao.
- Nunca renderizar a data crua do banco em listagens ou graficos.

### REGRA CRITICA — Integracoes com efeito colateral (idempotencia)

> **MOTIVO:** se um worker/integracao externa consome uma tabela e reprocessa registros nao
> marcados como "enviados", uma falha temporaria gera envios duplicados ao destino real.
> Ver Perfil → Integracoes.

- Marcar o registro como "enviado/processado" na **criacao**, mesmo que o envio real falhe
  depois.
- Erros de envio devem ser logados em campo proprio (ex: `erro_envio`, `tentativas`), nunca
  re-tentados automaticamente de forma a duplicar.

### REGRA — Cliente HTTP por chamada

- Nao reutilizar a mesma instancia de cliente HTTP/conexao entre chamadas distintas (estado
  residual de headers/token contamina a chamada seguinte). Ver Perfil → Armadilhas.

### REGRA — Strings de UI com ortografia correta

> **MOTIVO:** texto voltado ao usuario final sem acentuacao correta e percebido como bug/
> amadorismo e quebra pesquisa interna. (Aplica-se a projetos PT-BR; ajuste ao idioma do seu
> projeto.)

- Mensagens, labels, placeholders, options de `<select>`, titulos, breadcrumbs: ortografia
  completa do idioma do projeto.
- Endpoints que devolvem mensagem para exibir na UI seguem a mesma regra (o texto cru e
  renderizado como veio).
- Comentarios em codigo podem ser ASCII; strings de usuario, nao.

### REGRA — Quirks da biblioteca de UI

> Frameworks de UI (ex: temas/admin templates) costumam ter peculiaridades de markup que, se
> ignoradas, geram bugs visuais (icones duplicados, overlays bloqueados, z-index). Liste as
> recorrentes do SEU projeto no Perfil → Armadilhas e siga o padrao de markup correto
> documentado la / na doc raiz.

---

## Seguranca

### Validacoes Obrigatorias

- [ ] Validacao de autenticacao/token na **primeira linha** de toda API (Perfil → Armadilhas)
- [ ] Sanitizacao de input (escape em saidas; prepared statements em SQL)
- [ ] Protecao contra SQL Injection (placeholders — NUNCA concatenar input)
- [ ] Protecao contra XSS (escape de output na biblioteca de templating)
- [ ] Validacao de permissoes/multi-tenancy conforme o projeto
- [ ] [Outras validacoes especificas do contexto]

### Dados Sensiveis

- [Listar dados sensiveis manipulados — ex: CPF, telefone, dados pessoais]
- [Descrever como sao protegidos — ex: prepared statements, HTTPS, auth obrigatorio, soft delete]

---

## Impacto e Riscos

| Aspecto | Antes | Depois | Risco |
|---------|-------|--------|-------|
| [Aspecto 1] | [Estado atual] | [Estado futuro] | [Baixo/Medio/Alto] |

### Plano de Rollback

[Descreva como reverter as mudancas. Seja especifico: quais linhas restaurar, quais arquivos
remover, qual migration/SQL reverter.]

---

## Tasks Derivadas

| Task | Descricao | Arquivo(s) | Teste E2E | Dependencias |
|------|-----------|------------|-----------|--------------|
| [TASK-001](./tasks/TASK-001-[desc].md) | [Descricao curta] | [arquivo] | `<spec>` | - |
| [TASK-002](./tasks/TASK-002-[desc].md) | [Descricao curta] | [arquivo] | `<spec>` | TASK-001 |

### Sequencia de Execucao

```
TASK-001 --> TASK-002 --> TASK-003
   |             |            |
   |             |            └─ [Descricao] + E2E
   |             └─ [Descricao] + E2E
   └─ [Descricao] + E2E
```

**Todas as Tasks devem ser executadas usando o modelo Sonnet.**
**Toda Task com impacto visual/funcional DEVE incluir criacao/atualizacao de testes E2E
(se o Perfil declarar um framework E2E).**

---

## Estrategia de Testes E2E

> **OBRIGATORIO** (quando o Perfil declarar um framework E2E): cada Task derivada com impacto
> visual/funcional DEVE incluir testes E2E, criados durante a implementacao e executados
> antes de concluir. Se o Perfil declara "Nenhum", substituir por checklist de aceitacao
> manual.

### Configuracao

Tudo a partir do **Perfil → Testes E2E**:

- **Framework:** Perfil → Testes E2E → "Framework"
- **Diretorio:** Perfil → Testes E2E → "Diretorio dos specs"
- **Base URL / login de teste / seletores:** Perfil → Testes E2E
- **Execucao:** Comando (spec unico) e Comando (suite completa) do Perfil

### Mapeamento de Testes por Task

| Task | Arquivo de Teste | Cenarios Principais |
|------|-----------------|---------------------|
| [TASK-001] | `<spec>` | [Cenarios cobertos] |

### Convencoes para Testes E2E

- **Nomenclatura:** `[modulo]-[funcionalidade].spec.<ext>` (kebab-case)
- **Estrutura:** agrupar por modulo/funcionalidade
- **Cenarios minimos por task:** happy path; validacao de erro; estado vazio (quando aplicavel)
- **Seletores:** preferir `data-testid` ou seletores semanticos (role, label). Evitar
  seletores frageis (classes CSS de estilo)
- **Dados de teste:** usar dados criados pelo proprio teste; limpar apos quando necessario

#### Specs UX devem usar fluxo real (NAO invocacoes diretas via JS)

> **Regra critica para specs de UX/integracao.** Um spec que manipula o estado da UI
> diretamente (injetando JS para abrir um modal, disparar um evento, etc.) **pula a cadeia
> real de eventos** (`click → handler → request → success → callback → atualizacao de tela`).
> Bugs em qualquer ponto dessa cadeia ficam invisiveis a specs que saltam para o estado
> final — o teste passa verde sobre uma feature quebrada.

Especificamente para specs que validam **comportamento de UI** (modais empilhados, listeners
de evento, callbacks pos-acao, refresh de listagem, atualizacao de badge, etc.):

- **NAO usar** invocacoes diretas via JS para forcar o estado (ex: chamar a API do componente
  por dentro do `evaluate` do navegador). Isso pula handlers, listeners e o fluxo natural.
- **USAR** o fluxo real do usuario: clicar nos botoes/triggers como uma pessoa faria.
- Validar tambem o **estado pos-acao real** (nao so a presenca do elemento no DOM):
  - Modais com z-index: confirmar visibilidade + que o overlay nao esta bloqueado.
  - Refetch de listagem: aguardar a request HTTP completar e validar que o DOM novo refletiu
    (contagem diferente, item especifico desapareceu).
  - Callbacks de modal pai: validar que o elemento do pai mudou apos o submit do filho — sem
    fechar o filho artificialmente.

**Exemplo conceitual:**
```javascript
// RUIM — passa em codigo quebrado (pula a cadeia de eventos)
await page.evaluate(() => abrirModalDiretamentePorJS());

// BOM — pega o bug real (dispara a cadeia completa)
await page.click('.btn-abrir-registro');            // abre pelo fluxo real
await page.click('button:has-text("Editar")');      // dispara o handler real
await page.waitForResponse(/listar/);               // aguarda a request real
await expect(page.locator('.item-X')).toHaveCount(0); // valida o estado pos-acao
```

---

## Verificacao Final

### Checklist Pre-Deploy

- [ ] Todos os arquivos criados/modificados conforme especificado
- [ ] Sintaxe validada em todos os arquivos modificados (comando de lint do Perfil → Lint
      automatico; o hook `lint.sh` ja cobre incrementalmente)
- [ ] **Compatibilidade de producao confirmada** — codigo nao usa features de runtime mais
      novo que producao (Perfil → Compatibilidade de producao)
- [ ] Consultas SQL testadas isoladamente
- [ ] Endpoints retornando dados corretos com/sem autenticacao
- [ ] Interface funcionando conforme esperado
- [ ] Validacoes de seguranca implementadas
- [ ] Sem erros no console do navegador
- [ ] Sem erros no log do servidor
- [ ] Rollback documentado e testavel
- [ ] **Schema explicito em CREATE TABLE:** se a PRD criou tabela nova, a migration declara
      engine/charset/collation explicitamente (nao depender do default do SGBD, que varia
      entre versoes e pode quebrar joins/unions com tabelas legadas).

### Checklist de Testes E2E

- [ ] Testes E2E criados para todas as Tasks com impacto visual/funcional
- [ ] Todos os testes E2E passando individualmente (Comando spec unico do Perfil)
- [ ] Sintaxe validada em todos os arquivos modificados/criados
- [ ] **Suite E2E completa** — executar APENAS se o numero da PRD for multiplo de 5. Comando:
      Perfil → Testes E2E → "Comando (suite completa)"
- [ ] Testes cobrem happy paths de todas as funcionalidades implementadas
- [ ] Testes cobrem cenarios de erro/validacao (quando aplicavel)

### Checklist Pos-Conclusao da PRD

- [ ] **Atualizar a doc raiz de convencoes** (Perfil → Estrutura → "Doc raiz de convencoes",
      manter concisa) — apenas:
  - Novos arquivos/servicos criados (1 linha por item)
  - Novas tabelas ou colunas relevantes
  - Novas convencoes/regras introduzidas
- [ ] Atualizar status de todas as Tasks para "Concluida"
- [ ] Se a PRD absorveu DTs: atualizar status nos arquivos DT correspondentes e no
      `prds/debito_tecnico/INDEX.md` (`Pendente` → `Resolvido (PRD-NNN)`)
- [ ] **Devolver mensagem de commit no chat** (NAO commitar) — gerar uma mensagem pronta para
      o usuario colar manualmente. Formato:
  - 1a linha (titulo): `PRD-NNN: <resumo curto da entrega em uma frase>`
  - Linha em branco
  - Bullets curtos: novas tabelas/migrations, novos endpoints/arquivos, mudancas de UI, DTs
    absorvidos, testes E2E adicionados, resultado do code review Codex
  - Sem co-author, sem assinatura — apenas o texto cru
