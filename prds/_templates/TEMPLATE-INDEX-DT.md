# INDEX de Débitos Técnicos

Registro central de todos os DTs pendentes/resolvidos do projeto. Toda alteração de status
em um arquivo `DT-XXX-*.md` **deve** ser replicada nesta tabela, no mesmo commit (ver
`prds/_templates/TEMPLATE-DT.md`).

| ID | Título | Prioridade | Status | Origem |
|----|--------|------------|--------|--------|
| — | _Nenhum DT registrado ainda_ | — | — | — |

<!-- Ao criar o primeiro DT (via skill /dt), substitua a linha-placeholder por:
| DT-001 | <título curto> | <Alta/Média/Baixa> | Pendente | <origem resumida> |
-->

## Legenda de Status

| Status | Significa |
|--------|-----------|
| `Pendente` | Registrado, ainda não resolvido. É a fila que a `/dt-exec` e a `/prd` leem. |
| `Em andamento` | Alguém está resolvendo agora, fora de PRD/lote. |
| `Resolvido (PRD-NNN)` | Absorvido pelo escopo daquela PRD. Detalhes em `prds/PRD-NNN-*/`. |
| `Descartado (AAAA-MM-DD · motivo)` | Fechado **sem** codigo, com prova: arquivo/caminho citado nao existe mais, ja resolvido por outra PRD (cite-a), duplicata de DT-YYY, ou decisao do dono do projeto. Quem fecha assim e o humano ou o `/dt-sweep` sob confirmacao — e a prova fica na linha (3.2.2). |
| `Ideia` | Reclassificado: nao e divida, e desejo de produto. A linha de 1 frase foi para `prds/backlog/IDEIAS.md`; o arquivo `DT-XXX` fica como historico, mas **sai da fila** da `/dt-exec` e da `/prd` (3.2.2). |
| `Resolvido (LOTE-NNN)` | Resolvido num **lote de DTs pequenos** executado via `/dt-exec`. O que o lote agrupou, o que foi **ejetado** (e por quê) e o que ficou **bloqueado** estão em `prds/debito_tecnico/lotes/LOTE-NNN-*.md` — ver a tabela "Lotes de DT" abaixo. |

## Lotes de DT

Lotes agrupam DTs pequenos resolvidos num único ciclo (skill `/dt-exec`). Os documentos vivem
em `prds/debito_tecnico/lotes/`. Cada documento carrega o **registro anti-escopo** — o que foi
avaliado e ficou de fora, com o motivo — que é o que evita reavaliar o mesmo DT a cada lote.

| Lote | Data | Módulo/área | DTs resolvidos | Fora do lote | Documento |
|------|------|-------------|----------------|--------------|-----------|
| — | — | — | — | — | — |

<!-- Ao concluir o primeiro lote (via skill /dt-exec), substitua a linha-placeholder por:
| LOTE-001 | AAAA-MM-DD | <módulo/área> | DT-003, DT-007 | DT-011 (ejetado: migration) · DT-014 (bloqueado por DT-009) | [LOTE-001-<slug>](lotes/LOTE-001-<slug>.md) |
-->
