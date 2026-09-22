# Convenções da casa

> **O que é isto.** Uma convenção é **como a Beta faz uma feature** — destilado de código que
> já roda em produção num projeto nosso, escrito para quem vai **portar** a feature num projeto
> que ainda não a tem. Não é tutorial genérico: se não dá para apontar o repo e os arquivos
> reais, não é convenção (é ideia — vira DT ou PRD).

## Como usar

| Quero… | Faça |
|--------|------|
| ver o catálogo com o estado de adoção deste projeto | `/convencao` — ou a aba **Convenções** da tela (`/harness-config`) |
| ler uma convenção | `/convencao <slug>` |
| **trazer a feature para este projeto** | `/convencao portar <slug>` → gera a PRD com o discovery pronto |
| registrar uma convenção nova | `/convencao nova` — **só no harness mestre** |
| marcar o que este projeto já adota | tela → aba Convenções (grava no Perfil) |

## Catálogo

| Slug | Nome | Categoria | Maturidade | Stacks | Desde |
|------|------|-----------|------------|--------|-------|
| `mfa` | Autenticação em dois fatores (TOTP) | seguranca | estável | php | 2.7.0 |
| `cron-smart` | Smart Scheduler — cron burro, banco inteligente | infra | estável | php | 2.16.1 |
| `licenca-caronte` | Validação de licença no Caronte (software consumidor) | integracao | experimental (servidor estável; o 1º port valida) | php | 3.5.0 |
| `health-panel` | Health panel — `GET /health` público + `GET /health/painel` por token (máquina, cron/workers, integrações, módulos) | infra | experimental (peças em produção em 4 projetos; contrato único novo) | php | 3.5.1 |

## Regras

- **Convenção nasce no mestre.** Sempre em `projetos/referencias/harness/.claude/convencoes/`,
  nunca direto num projeto — de lá o `/deus` propaga para todos. Uma convenção criada dentro de
  um projeto-alvo aparece como `EXTRA|alvo|` no sync e morre na primeira atualização.
- **O estado de adoção é local.** Vive na seção *Convenções adotadas* do
  `.claude/PERFIL-PROJETO.md` de cada projeto (`adotada` / `parcial` / `nao-adotada` /
  `nao-se-aplica`). Seção ausente = tudo `nao-adotada`.
- **Armadilha sem incidente não entra.** A seção *Armadilhas* é o que justifica o documento
  existir — cada item precisa de sintoma, causa e correção reais, com data.
- **Convenção envelhece.** Mudou o jeito da casa? Atualize aqui **primeiro**, depois propague.
  Convenção que não descreve mais a realidade vira `maturidade: descontinuada`, não é apagada
  (os projetos que a seguiram precisam saber).
- **Convenção nova é bump de PATCH, nunca de minor.** De `2.16.0` a próxima convenção sai em
  `2.16.1`, não em `2.17.0`. O motivo: uma convenção é **conteúdo aditivo** — não muda o que o
  harness faz, não pede decisão do dev, não quebra port nenhum. Minor fica reservado para mudança
  de capacidade (skill, agente, hook, contrato). O `desde:` do frontmatter e a coluna *Desde*
  desta tabela sempre carregam esse patch. (O `mfa`, em `2.7.0`, é anterior à regra — fica como
  registro histórico, não se reescreve.)

## Como escrever uma nova

Copie `_TEMPLATE-convencao.md`, preencha o frontmatter (o `referencias` é obrigatório — é a
prova de que existe) e siga as seções canônicas. A `/convencao nova` conduz a entrevista e
escreve o arquivo já no formato.
