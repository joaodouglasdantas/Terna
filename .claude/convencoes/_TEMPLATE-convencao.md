---
slug: nome-curto-kebab
nome: "Nome legível da convenção"
categoria: seguranca          # seguranca | dados | ui | integracao | infra | qualidade
resumo: "Uma frase: o que esta convenção entrega. É o texto do card na tela."
maturidade: experimental      # estavel | experimental | descontinuada
aplica_se: [php, node]        # stacks onde já foi validada
depende_de: []                # slugs de outras convenções que precisam vir antes
desde: 2.7.0                  # versão do harness em que entrou
referencias:                  # onde isto EXISTE de verdade — a fonte da destilação
  - projeto: nome-do-repo
    caminhos: ["caminho/real/1.php", "db/migrations/0001_x.sql"]
---

<!-- COMO USAR ESTE TEMPLATE
     Convenção NÃO é tutorial genérico de internet: é como ESTA CASA faz a feature,
     destilado de código que já roda em produção. Se você não consegue apontar o
     projeto e os arquivos reais no frontmatter, ainda não é uma convenção — é uma
     ideia. Registre como DT ou PRD.

     Escreva para quem vai PORTAR num projeto que não tem a feature. A skill
     /convencao lê este arquivo, cruza com o Perfil do projeto-alvo e alimenta a
     /prd: as seções "Modelo de dados", "Contratos" e "Checklist de aceite" viram
     insumo direto da PRD técnica; "Armadilhas" vira o briefing do beholder.
     Apague estes comentários ao criar a sua.                                    -->

# `<nome>` — convenção da casa

## Por que existe

Um parágrafo: que problema real motivou, e o que dá errado sem isto. Cite o incidente
ou a demanda que originou, com data quando houver.

## Quando aplicar — e quando NÃO

- **Aplique quando:** `<condição objetiva>`
- **Não aplique quando:** `<condição objetiva>` — e diga o que fazer no lugar.

## Pré-requisitos no projeto

O que o projeto-alvo já precisa ter. Se faltar algo, é isso que a PRD do port
resolve primeiro.

| Pré-requisito | Por quê |
|---------------|---------|
| `<ex: tabela de usuários com id numérico>` | `<ex: as tabelas abaixo referenciam id_usuario>` |

## Modelo de dados

As tabelas/colunas, com o **porquê** de cada decisão não óbvia (tipo, índice, default).
DDL real, não pseudo-schema. Marque o que é idempotente e o que é destrutivo.

## Contratos

Endpoints, payloads, estados e transições. O que é **função pura** (reusável por outros
canais) e o que é acoplado ao canal.

## Passo a passo do port

Numerado e acionável — cada item deve virar uma task da PRD.

1. `<passo>`
2. `<passo>`

## Armadilhas

O que já quebrou de verdade. Uma por item, com **sintoma → causa → correção**. Esta é a
seção mais valiosa do documento: é o que o port de um projeto novo não tem como adivinhar.

## Checklist de aceite

Vira o critério de aceite da PRD. Cada item deve ser verificável por alguém que não
implementou.

- [ ] `<verificável>`
- [ ] `<verificável>`

## Variações por stack

Como muda em cada stack onde já rodou. Se só rodou numa, diga isso — e o que ainda é
incógnita nas outras.
