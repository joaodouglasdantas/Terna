# PRD-[NNN] — Leitura de validação (antes de executar)

> Gerado no Passo 10.9 da `/prd` (3.4.30). **Cinco minutos de leitura, sem abrir a PRD.** Serve para
> você e a equipe conferirem, ANTES da `/prd-exec`, três coisas: (1) o pedido entrou inteiro? (2) o que
> foi agregado no caminho faz sentido? (3) algum requisito **sem origem** — isso é o sinal de invenção.
> A conferência mecânica é `bash .claude/hooks/prd-validacao-check.sh --label PRD-[NNN]`.

## 1. O pedido, como entrou

- **Origem:** [IDEIA-NNN | pedido direto de <quem> em <data> | DT-NNN promovido]
- **Escopo pedido, em itens** (copie do despejo/ideia/pedido, sem reescrever):
  1. [item 1 do pedido]
  2. [item 2]
- **Decisões da entrevista (Passo 0.1):** [escopo escolhido · split · política de DTs/inovação · condução]
  — em TURBO NOTURNO, marque `(default --noturno)` nas que não foram respondidas por humano.

## 2. O fluxo, como ficou

[5 a 12 passos na voz do usuário do sistema — "a recepcionista abre X, escolhe Y, o sistema faz Z".
Cite tela/endpoint entre crases. Se houver maquete aprovada, aponte a variante. Um leitor que nunca
viu a PRD precisa enxergar a feature funcionando aqui.]

1. [passo]
2. [passo]

## 3. Requisitos funcionais — de onde veio cada um

| RF | Em uma linha | Origem | Tasks |
|---|---|---|---|
| RF-01 | [o que faz] | pedido | TASK-001, TASK-003 |
| RF-02 | [o que faz] | entrevista | TASK-002 |
| RF-03 | [o que faz] | inovacao | TASK-004 |
| RF-04 | [o que faz] | DT-566, DT-572 | TASK-005 |
| RF-05 | [o que faz] | gate | TASK-006 |
| — | Transversais: acceptance, doc raiz, DTs de continuidade | projeto | TASK-008, TASK-009 |

Origens permitidas (uma ou mais, separadas por vírgula): `pedido` · `entrevista` · `inovacao` (tony-stark)
· `DT-NNN` (absorvido) · `gate` (beholder/michelangelo) · `projeto` (dedalo/ariadne) · `impacto` (atlas).
Task que não é de RF (acceptance, doc) entra na linha `| — | ... |` — **toda task de `tasks/` precisa aparecer**.
**Toda RF da PRD de produto tem uma linha aqui, e toda linha tem origem** — RF sem origem não existe:
apague da PRD ou justifique a origem.

## 4. Agregado no caminho (não estava no pedido)

| Item | Tipo | Por quê entrou | Custo |
|---|---|---|---|
| [nome] | inovacao | [1 linha] | [N tasks / pontos] |
| [DT-NNN — título] | dt-absorvido | [caminho direto desta PRD] | [tasks] |
| [achado do gate] | gate | [🔴/🟠 do beholder/michelangelo c<N>] | [tasks] |
| [D-NN decisão travada que ampliou] | decisao | [por quê] | [tasks] |

Se nada foi agregado, escreva "nada — a PRD entrega exatamente o pedido".

## 5. Fora / adiado

- **Fatia(s):** [PRD-NNN-b — o que ficou lá e por quê] ou "nenhuma"
- **Backlog de inovação (🟡/🔵):** [lista curta] ou "nenhum"
- **DTs de continuidade abertos por esta PRD:** [DT-NNN …] ou "nenhum"
- **Fora de escopo declarado:** [itens]

## 6. Confira antes de aprovar

- [ ] [pergunta objetiva sobre uma decisão tomada por default — ex.: "o nome automático NÃO leva o nome da paciente; ok?"]
- [ ] [outra]
- [ ] [outra]
