# PRD-[NNN]: [Titulo descritivo da funcionalidade/correção]

> **INSTRUCOES DE USO DESTE TEMPLATE:**
>
> 1. Copie este template para uma nova pasta: `prds/PRD-[NNN]-[nome-curto]/PRD-[NNN]-[nome-curto].md`
> 2. Substitua todos os campos entre `[colchetes]` com os valores reais
> 3. Apos finalizar esta PRD, crie a **PRD Tecnica** usando o template `TEMPLATE-PRD-TECNICA.md` na mesma pasta
> 4. Apos finalizar a PRD Tecnica, crie as **Tasks** usando o template `TEMPLATE-TASK.md` dentro da subpasta `tasks/`
> 5. **Ao concluir todas as Tasks**, atualizar a **doc raiz de convencoes** do projeto (Perfil → Estrutura → "Doc raiz de convencoes", ex: `CLAUDE.md`) com:
>    - Novos arquivos/endpoints/paginas relevantes
>    - Novas tabelas ou colunas
>    - Convencoes introduzidas (caso existam)
>    - Manter a doc raiz concisa (~150 linhas). Detalhes verbosos vao na propria PRD
> 6. Remova este bloco de instrucoes antes de finalizar
>
> **ESTRUTURA DE PASTAS OBRIGATORIA:**
> ```
> prds/
>   PRD-[NNN]-[nome-curto]/
>     PRD-[NNN]-[nome-curto].md              <-- Esta PRD (visao de produto)
>     PRD-TECNICA-[NNN]-[nome-curto].md      <-- PRD Tecnica (implementacao)
>     PROMPT-EXECUCAO.md                     <-- Prompt pronto para rodar a PRD
>     tasks/
>       TASK-001-[descricao-curta].md         <-- Tasks individuais
>       TASK-002-[descricao-curta].md
>       ...
> ```

---

## Resumo Executivo

| Campo         | Valor |
|---------------|-------|
| **ID**        | PRD-[NNN] |
| **Titulo**    | [Titulo descritivo] |
| **Tipo**      | [Nova Funcionalidade / Correção de Bug / Melhoria / Refatoração] |
| **Prioridade**| [Alta / Media / Baixa] |
| **Expande**   | [DT-XXX, DT-YYY ou "Nenhum" — preencher apenas se a PRD absorve debitos tecnicos] |
| **Solicitante** | [Nome do solicitante ou setor] |
| **Data**      | [DD/MM/YYYY] |
| **Autor**     | [Nome] |
| **Versao**    | 1.0 |
| **Skip HTML Roadmap** | Sim  (default desde 2.4.0 — o HTML interativo da Fase 4 e OPT-IN: escreva "Nao" APENAS quando quiser o roadmap navegavel no browser; ausente/Sim = so o bloco Markdown) |

---

## Problema / Motivação

[Descreva claramente o problema que existe hoje ou a necessidade que motivou esta demanda. Seja especifico com dados, evidencias, logs ou feedback quando possivel.]

### Impacto Atual

- **Quem e afetado:** [usuario final, equipe, area de negocio, integracao externa]
- **Frequencia:** [Diariamente, semanalmente, esporadicamente]
- **Gravidade:** [Bloqueante, degradacao de performance, inconveniencia, perda de dado, duplicacao de envio, etc.]

---

## Contexto

### Ambiente de Execucao (Obrigatorio)

Antes de implementar, confirmar o ambiente conforme o **Perfil do Projeto**
(`.claude/PERFIL-PROJETO.md`):

- **CLI (interpretador e cliente de banco):** Perfil → CLI (ambiente local)
- **Banco de teste local:** Perfil → Banco de dados (teste local)
- **URL local da aplicacao/API:** Perfil → Aplicacao
- **Deploy:** Perfil → Identificacao → "Repositorio / deploy"
- **Compatibilidade de producao:** Perfil → Compatibilidade de producao (restricoes de runtime
  a respeitar — ex: versao mais antiga em producao)

Se o ambiente nao estiver identificado antes da execucao, a Task deve ser considerada
bloqueada ate esta validacao ser feita.

### Fluxo Atual

[Descreva passo a passo como funciona hoje. Se for feature nova, descreva o contorno manual atual.]

1. [Passo 1]
2. [Passo 2]
3. [Passo 3]

### Fluxo Desejado

[Descreva como devera funcionar apos a implementacao.]

1. [Passo 1]
2. [Passo 2]
3. [Passo 3]

---

## Requisitos Funcionais

### RF-01: [Nome do requisito]

**Descricao:** [O que o sistema deve fazer]

**Regras de negocio:**
- [Regra 1]
- [Regra 2]

**Entrada:** [Dados necessarios para o requisito funcionar]

**Saida esperada:** [Resultado esperado]

---

### RF-02: [Nome do requisito]

[Repetir a estrutura acima para cada requisito funcional]

---

## Requisitos Não Funcionais (se aplicavel)

- **Performance:** [Ex: A consulta deve retornar em menos de 3 segundos]
- **Seguranca:** [Ex: Validar input contra XSS/SQL Injection; autenticacao na primeira linha
  de cada endpoint — ver Perfil → Armadilhas]
- **Compatibilidade:** [Ex: navegadores-alvo; runtime de producao — ver Perfil → Compatibilidade]
- **Acessibilidade:** [Ex: Responsivo em dispositivos moveis]
- **Data/hora:** exibicao no formato definido no Perfil → Timezone e datas de negocio. Campos
  vindos do banco em formato cru devem ser convertidos antes da exibicao.
- **REGRA CRITICA — Origem de data/hora para gravacao:** toda data/hora de **negocio** DEVE
  vir da origem (frontend/navegador ou o script/servico que gera o dado) e ser enviada no
  payload. **NUNCA** usar o relogio do servidor/banco (`NOW()`/`CURRENT_TIMESTAMP` ou
  equivalente) como fonte primaria — o timezone do servidor pode divergir do projeto. Ver
  Perfil → Timezone e datas de negocio. Campos automaticos (`created_at`, `updated_at`) sao
  apenas controle interno.
- **Integracoes com efeito colateral:** se a PRD dispara envio/cobranca/agendamento externo,
  garantir idempotencia (marcar "enviado/processado" na criacao) — ver Perfil → Integracoes.

---

## Arquivos/Telas Afetadas

> Use os caminhos reais do projeto. A localizacao por tipo esta no Perfil → "Estrutura de
> diretorios do projeto".

| Arquivo/Tela | Ação | Descricao |
|--------------|------|-----------|
| [endpoint/recurso/acao] | [Criar/Modificar] | [Breve descricao da mudanca] |
| [pagina/view] | [Criar/Modificar] | [Breve descricao da mudanca] |
| [JS de pagina, se aplicavel] | [Criar/Modificar] | [Breve descricao da mudanca] |

---

## Tabelas/Dados Envolvidos (se aplicavel)

| Tabela | Papel | Campos relevantes |
|--------|-------|-------------------|
| [nome_tabela] | [Descricao do papel] | [campo1, campo2, campo3] |

> Lembrar da politica de soft delete do projeto (Perfil → Banco de dados → "Soft delete"),
> se aplicavel.

---

## Criterios de Aceite

1. [ ] [Criterio mensuravel e verificavel 1]
2. [ ] [Criterio mensuravel e verificavel 2]
3. [ ] [Criterio mensuravel e verificavel 3]
4. [ ] [Criterio mensuravel e verificavel 4]
5. [ ] Testes E2E criados cobrindo happy path e cenarios de erro (ver PRD Tecnica). Se o
   Perfil declara "Nenhum" framework E2E, substituir por checklist de aceitacao manual.

---

## Faseamento (se aplicavel)

| Fase | Descricao | Esforco estimado |
|------|-----------|------------------|
| 1 | [Ex: Migration + endpoint base] | Pequeno |
| 2 | [Ex: Frontend + integracao] | Medio |
| 3 | [Ex: Testes E2E + atualizacao da doc raiz] | Pequeno |

---

## Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|---------------|---------|-----------|
| [Ex: duplicacao de envio em integracao externa] | Media | Alto | Marcar idempotencia na criacao (Perfil → Integracoes) |
| [Ex: timezone divergente do servidor] | Alta | Medio | Gerar data na origem, nao no banco (Perfil → Timezone) |

---

## Observações / Melhorias Futuras

- [Observacao ou melhoria que pode ser feita no futuro mas nao faz parte deste escopo]

---

## Documentos Relacionados

| Documento | Link |
|-----------|------|
| PRD Tecnica | [PRD-TECNICA-[NNN]-[nome-curto].md](./PRD-TECNICA-[NNN]-[nome-curto].md) |
| Prompt de Execucao | [PROMPT-EXECUCAO.md](./PROMPT-EXECUCAO.md) |
| Tasks | [tasks/](./tasks/) |
