---
name: convencao
description: "Biblioteca de convencoes da casa (.claude/convencoes/) — o passo a passo de como a Beta implementa cada feature (MFA, auditoria, upload...), destilado de codigo que ja roda em producao. Lista, mostra, registra novas (so no harness mestre) e PORTA uma convencao para este projeto cruzando-a com o Perfil e alimentando a /prd com o discovery pronto. Use quando pedirem para implementar uma feature que a casa ja tem em outro projeto, para ver o catalogo de convencoes, ou para registrar como passamos a fazer algo."
---

# Skill: `/convencao` — as convenções da casa

Uma **convenção** é como a Beta faz uma feature — destilada de código que já roda em produção
num projeto nosso, escrita para quem vai **portar** a feature onde ela ainda não existe. Ela
carrega o que um projeto novo não tem como adivinhar: o modelo de dados que sobreviveu, os
contratos, e principalmente as **armadilhas** (com sintoma, causa e correção reais).

Elas vivem em `.claude/convencoes/`, **nascem no harness mestre** e viajam para todos os
projetos pelo `/deus`. O **estado de adoção** é de cada projeto e vive no Perfil.

## Uso

```
/convencao                    # catálogo + estado de adoção deste projeto
/convencao <slug>             # abre uma convenção
/convencao portar <slug>      # cruza com o Perfil e gera a PRD do port
/convencao nova               # registra uma convenção nova (SÓ no harness mestre)
/convencao status             # só a tabela de adoção
```

## Passo 0 — Onde estou

Leia `.claude/harness-role` (arquivo de 1 linha):

- **`mestre`** → você está na cópia-mestre (o vault). Aqui `nova` e a edição de convenções são
  permitidas; `portar` **não** faz sentido (não há projeto para portar).
- **ausente** (ou qualquer outro valor) → projeto-alvo. Aqui `portar` e `status` são o normal;
  `nova` é **bloqueada** (ver regra abaixo). As réplicas da equipe também caem neste caso, de
  propósito — o arquivo é excluído do espelhamento.

Leia também `.claude/PERFIL-RESUMO.md` (fallback: `PERFIL-PROJETO.md`) — você vai precisar da
stack, da estrutura de diretórios e das armadilhas locais.

## Modo: listar (padrão)

1. Leia o frontmatter de cada `.claude/convencoes/*.md` (ignore `_TEMPLATE-*` e `INDEX.md`).
2. Leia a seção **Convenções adotadas** do `PERFIL-PROJETO.md` (ausente = tudo `nao-adotada`).
3. Apresente **uma por linha**, agrupadas por categoria:

| # | Convenção | Categoria | Estado | Stacks | Maturidade |
|---|-----------|-----------|--------|--------|------------|
| 1 | `mfa` — Autenticação em dois fatores | seguranca | ⚪ não adotada | php | estável |

Estados: 🟢 adotada · 🟡 parcial · ⚪ não adotada · ➖ não se aplica.

Feche oferecendo: *"Portar alguma? `/convencao portar <slug>`"* — e lembre que a mesma
visão existe na aba **Convenções** da tela (`/harness-config`).

## Modo: mostrar (`/convencao <slug>`)

Leia o arquivo e apresente **resumido**: por que existe, pré-requisitos, quantos passos, e as
armadilhas em uma linha cada. Não despeje o markdown inteiro no chat — ofereça abrir o arquivo.
Se a convenção referencia projetos (`referencias`), diga onde a implementação real vive.

## Modo: portar (`/convencao portar <slug>`) — o coração da skill

> **O que esta skill resolve e o que NÃO resolve.** A convenção elimina o discovery da
> **feature** (o que construir, com que contratos, evitando o quê). Ela **não** elimina o
> discovery do **projeto-alvo** (que schema existe aqui, que código já faz coisa parecida,
> que precedentes há). A `/prd` continua fazendo o segundo — só chega nele com o primeiro pronto.

### 1. Bloqueios

- Sem o slug → liste e pergunte qual.
- `maturidade: descontinuada` → avise e **pare**; pergunte o que substituiu.
- Estado já `adotada` → confirme antes de seguir ("já consta como adotada neste projeto —
  é uma evolução/correção, ou o registro está errado?").
- `depende_de` com convenção `nao-adotada` → avise que a dependência vem primeiro e pergunte
  se quer portar as duas (na ordem) ou só a dependência agora.

### 2. Cruzamento com o Perfil (faça isto ANTES de chamar a /prd)

Monte um **briefing de port** confrontando a convenção com a realidade do projeto:

| Da convenção | Confronte com o Perfil | Produza |
|--------------|------------------------|---------|
| `aplica_se` | Stack resumida + Compatibilidade de produção | a stack bate? Se não, o que muda (ver *Variações por stack*) |
| Pré-requisitos | Banco, Estrutura de diretórios, Aplicação | o que já existe · o que falta · o que é incógnita |
| Modelo de dados | Migrations + Mapa do schema | onde as migrations vivem aqui, qual o próximo número, que tipos usar |
| Contratos | Endpoints/API + Páginas/views + JS | os caminhos reais deste projeto |
| Armadilhas | Armadilhas do projeto + Compatibilidade | quais se aplicam aqui, e se alguma armadilha **local** agrava |
| Checklist de aceite | Testes E2E + Safe Mode | como cada item será verificado aqui |

Verifique de fato o que dá para verificar (o schema existe? a tabela de usuários tem `id`
numérico?) em vez de assumir — leia o mapa do schema e os diretórios citados no Perfil.

**Apresente o briefing ao Charles e peça o aceite** antes de chamar a `/prd`. É uma parada
barata que evita uma PRD inteira em cima de premissa errada.

### 3. Chamar a `/prd`

Com o aceite, invoque a `/prd` passando o briefing como **contexto de entrada**, explicitando:

- **Já resolvido pela convenção** (não re-descobrir): objetivo, modelo de dados, contratos,
  passo a passo, armadilhas conhecidas, critérios de aceite.
- **A descobrir no projeto** (discovery normal): schema real, código existente que faz algo
  parecido, precedentes/PRDs anteriores, impacto (atlas), DTs relacionados.
- **Decisões em aberto** que o cruzamento revelou — cada uma com sua recomendação.

Passe as **armadilhas da convenção** para o gate do beholder: elas são o briefing de red-team
mais barato que existe (já são falhas reais, não hipóteses).

### 4. Registrar

Depois que a PRD for **executada e aceita** (não antes), atualize a seção *Convenções adotadas*
do `PERFIL-PROJETO.md`: estado `adotada` (ou `parcial`, com a observação do que ficou de fora) e
a PRD na coluna de observação. A tela (`/harness-config`, aba Convenções) faz isso visualmente.

Se o port revelou uma armadilha **nova** ou uma variação de stack ainda não documentada:
**volte ao mestre e atualize a convenção**. É assim que ela melhora — e é o único caminho:
editar a cópia local do projeto é perda garantida no próximo `/deus`.

## Modo: nova (`/convencao nova`) — só no mestre

> **Regra dura.** Se `.claude/harness-role` não disser `mestre`, **recuse** e oriente: *"Convenção nasce no
> harness base. Rode `/convencao nova` no vault (`projetos/referencias/harness`) — de lá o
> `/deus` propaga para todos os projetos. Criada aqui, ela vira `EXTRA|alvo|` no sync e some na
> próxima atualização."* Ofereça registrar um lembrete no daily.

Entrevista curta — pare na primeira resposta que reprove o critério de existência:

1. **Onde isso já roda?** Projeto + arquivos reais. **Sem isto não há convenção** — é ideia;
   ofereça abrir um DT ou uma PRD.
2. **Que problema resolve, e o que dá errado sem?** (vira *Por que existe*)
3. **Quando NÃO usar?**
4. **O que o projeto precisa ter antes?** (pré-requisitos)
5. **Modelo de dados e contratos** — leia os arquivos reais citados no item 1 e **destile**;
   não peça ao Charles para ditar o que está no código.
6. **O que já quebrou?** Sintoma → causa → correção, com data. Vale ouro: procure no
   `.claude/knowledge/` do projeto de origem, que costuma ter as notas de incidente.
7. **Como se verifica que ficou pronto?** (checklist de aceite)

Escreva o arquivo a partir de `_TEMPLATE-convencao.md`, atualize a tabela do `INDEX.md`, e
avise que o `/deus` é quem leva isso aos projetos.

**Versão (`desde:`) — bump de PATCH, nunca de minor.** Leia a versão atual no `CHANGELOG.md` e
incremente só o último dígito: de `2.16.0` a convenção sai em `2.16.1`. Convenção é conteúdo
aditivo — não muda o que o harness faz nem exige decisão do dev, então não gasta minor, que fica
para mudança de capacidade (skill, agente, hook, contrato). Grave o mesmo patch no frontmatter e
na coluna *Desde* do `INDEX.md`. **Não bumpe** o `CHANGELOG.md` nem o `HARNESS_VERSION` por conta
própria: pergunte ao Charles, que costuma ter outra sessão mexendo no harness em paralelo.

## Regras

- **Convenção nasce no mestre, sempre.** Em projeto-alvo ela é somente-leitura.
- **Sem referência real, não é convenção.** O `referencias` do frontmatter é a prova de que o
  padrão sobreviveu ao contato com produção.
- **Nunca implemente direto.** Esta skill produz o briefing e chama a `/prd`; quem executa é a
  `/prd-exec`. Convenção não é atalho para pular o fluxo — é para o fluxo começar informado.
- **Armadilha é o ativo principal.** Ao portar, se algo quebrar de um jeito novo, isso volta
  para a convenção no mestre. Sem esse retorno, a biblioteca envelhece.
- **Não confunda com o manual vivo.** `/manual` documenta o que **este** projeto tem
  (`docs/manual/`); `/convencao` descreve como a **casa** faz, para levar a outro projeto.
