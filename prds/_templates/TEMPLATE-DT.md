# DT-XXX: [Titulo curto do debito tecnico]

- **Origem:** PRD-XXX (Nome da PRD) — [Requisito ou contexto que originou] **ou** Observacao operacional / Bug em producao / Feedback de usuario
- **Data de registro:** YYYY-MM-DD
- **Status:** Pendente | Em andamento | Resolvido (PRD-NNN | LOTE-NNN, YYYY-MM-DD)
- **Prioridade:** Alta | Media | Baixa
- **Estimativa de esforco:** [Pequeno (< 1h) / Medio (1-4h) / Grande (> 4h) — opcional]
- **Duplicata:** nenhuma (INDEX verificado em YYYY-MM-DD) **ou** similar a DT-NNN — [por que este e distinto]
- **Balde:** lote (pequeno e mecanico) | prd (grande, exige spec) | decidir (depende de decisao de produto)

## Contexto

[Descreva o que foi implementado e por que ficou pendente. Inclua informacoes suficientes para que alguem que nao participou da PRD original consiga entender a situacao. Inclua: comportamento atual, impacto operacional (usuario final / dados / equipe), como foi descoberto, passos para reproduzir se for bug.]

## O que precisa ser feito

- [ ] [Tarefa 1 — comece com verbo]
- [ ] [Tarefa 2]
- [ ] [Tarefa 3]

## Arquivos e tabelas relacionados

> Use os caminhos reais do projeto. A localizacao por tipo (endpoints, paginas, JS,
> migrations, etc.) esta no Perfil → "Estrutura de diretorios do projeto".

- **Tabelas:** [tabelas do banco envolvidas]
- **Arquivos:** [caminhos reais verificados no codigo, com linhas quando possivel]

## Observacoes

[Informacoes adicionais, riscos, dependencias com outros DTs/PRDs, consideracoes de performance, seguranca, timezone (ver Perfil → Timezone e datas de negocio) ou integracoes com efeito colateral (ver Perfil → Integracoes). Se o DT puder virar PRD, indique quais decisoes de design ainda estao em aberto.]

---

## Ao concluir (ou alterar o status) deste DT — obrigatorio

Para manter a lista de debitos tecnicos sempre coerente, **toda alteracao de status deste arquivo deve ser replicada no `prds/debito_tecnico/INDEX.md`**:

1. Atualizar o campo `**Status:**` deste arquivo (ex: `Pendente` → `Resolvido (PRD-XXX)`, ou
   `Resolvido (LOTE-NNN)` quando o DT foi resolvido num lote via `/dt-exec`)
2. Atualizar a linha correspondente no `INDEX.md` com o mesmo status
3. **Provar que as duas pontas batem** — antes de commitar, rode e leia a saida:
   ```bash
   grep -Hn '\*\*Status:\*\*' prds/debito_tecnico/DT-XXX*.md
   grep -Hn 'DT-XXX' prds/debito_tecnico/INDEX.md
   ```
   O mesmo status tem de aparecer nas duas. Bateu so uma? Nao esta fechado — as skills
   `/dt-exec` (Passo 7.7) e `/prd-exec` (Fase 1.4.6) fazem esse gate automaticamente.
4. Commitar as duas alteracoes **juntas** no mesmo commit (evita drift entre INDEX e arquivos DT)
5. Se o DT foi absorvido por um PRD sem arquivo DT dedicado, criar o arquivo retroativamente apontando para as tasks do PRD que o resolveram

> Regra: se voce mexeu no codigo por causa de um DT, mexeu tambem no INDEX.md no mesmo commit. Sem excecao.
>
> Por que o passo 3 existe: "atualizei as duas" e uma afirmacao que ja saiu errada em producao —
> INDEX certo, arquivo do DT ainda `Pendente`, os dois no mesmo commit. Um commit sincronizado com
> conteudo dessincronizado e pior que o drift obvio: parece fechado.
