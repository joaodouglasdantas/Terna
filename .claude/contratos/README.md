# Contratos mecânicos dos papéis (harness 3.4.25, item 19)

A mecânica que todo subagente repete — onde ler, fôlego, temporários, classificador indisponível,
Edit-first, lint, invariantes, verificação provada, retorno em dois níveis — vive aqui, uma vez por
papel, e chega ao agente pelo topo do packet (`## 0. Contrato do papel`). O `.md` do agente fica
com persona, lentes, regras de negócio e formato de retorno.

| Contrato | Papéis | Quem injeta |
|---|---|---|
| `CONTRATO-executor.md` | hefesto, dedalo (Modo O) | `hooks/task-packet.sh` |
| `CONTRATO-revisor.md` | sherlock | `hooks/review-packet.sh` |
| `CONTRATO-gate.md` | beholder, michelangelo (Modo C) | `hooks/prd-packet.sh` |
| `CONTRATO-escrivao.md` | hermes | (sem packet — o `.md` aponta o arquivo) |
| `CONTRATO-scout.md` | peter-quill, atlas, tony-stark, themis, prometeu, ariadne | (sem packet — o `.md` aponta o arquivo) |

Knob: `HARNESS_PACKET_CONTRATO='on'|'off'` (harness.env; `off` tira a seção 0 dos packets).
A pasta viaja no `harness-sync.sh` (CORE_DIRS); o `harness-doctor.sh` acusa contrato ausente.
Regra de edição: mecânica nova entra AQUI (no contrato do papel), não no `.md` do agente.
