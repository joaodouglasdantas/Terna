# Balanceamento

A tabela de danos do jogo, anotada, e como os números foram acertados para uma partida de 5 minutos.
Os números ficam em `packages/compartilhado/src/conteudo/` (`poderes.ts`, `armas.ts`, `leslie.ts`,
`grow.ts`, `anjo.ts`). O simulador usado para acertá-los está em `ferramentas/simular-duelo.py`.

## O que se buscou

- **Duração:** uma luta entre dois jogadores do mesmo nível dura **de 3 a 4 minutos**, então os 5
  minutos do relógio viram margem e a maioria das partidas termina por KO.
- **Fim por tempo:** se o relógio zera, **vence quem tiver mais vida**. Com a vida igual, dá
  empate. Online, cada um avisa a própria vida ao servidor, e é ele quem decide.
- **Armas como complemento:** os poderes são o principal. A espada e o arco ajudam e enchem a
  energia, mas deixaram de ser o que mais tira dano no jogo.
- **Soco:** sem arma na mão, o clique esquerdo dá um soco. É o ataque mais fraco do jogo e o que
  menos enche a energia.
- **Nenhum personagem sobrando:** entre dois do mesmo nível, cada duelo fica perto de 50% para
  cada lado.
- **O Anjo**, mesmo escondido, entrou na conta e está pronto para quando voltar.

## Como foi medido

O `simular-duelo.py` simula milhares de duelos com o mesmo modelo para todos os personagens:

- A luta alterna **4 s trocando golpes e 3 s se reposicionando**, em média. Isso dá uns 57% do
  tempo em combate.
- Em combate, cada um usa a ação pronta que mais tira dano. A ult sai assim que a barra enche.
- Cada ataque acerta com uma chance fixa, a de dois jogadores do mesmo nível, com os avisos e as
  esquivas que o jogo dá:

  | Ataque | Chance de acerto |
  |---|---|
  | Espada, soco | 45% |
  | Chicote | 40% |
  | Arco, Revoada, Salto, Investida, Julgamento | 35% |
  | Pedra | 30% em cheio |
  | Cada explosão e cada coração do Anjo | 30% |

- O controle entra no modelo:
  - Preso nas raízes ou enfeitiçado: os golpes seguintes acertam 90%.
  - Levado pelas águias: fica 2 s sem atacar.
  - No vento: ataca pela metade.
  - O anjo, voando, desvia de 25% do que vem do chão.
- Sem arma, cada um pega uma a cada 8 s, em média, e ela dura 30 s na mão.

É uma aproximação: serve para comparar os personagens entre si e acertar a duração. A palavra final
é de gente jogando (veja **Para acompanhar**, no fim).

### Antes e depois

Mediana da duração da luta e quem vence (600 duelos de cada):

| Duelo | Antes | Depois | Vence (depois) | Dano das armas (depois) |
|---|---|---|---|---|
| Leslie × Leslie | 59 s | **189 s** | 48% × 52% | 37% |
| Leslie × Grow | 91 s | **218 s** | 51% × 49% | 37% |
| Leslie × Anjo | 73 s | **203 s** | 51% × 49% | 36% |
| Grow × Grow | 119 s | **252 s** | 48% × 52% | 19% |
| Grow × Anjo | 103 s | **234 s** | 60% × 40% | 19% |
| Anjo × Anjo | 90 s | **216 s** | 48% × 52% | 26% |

Antes:

- As lutas acabavam em 1 a 2 minutos.
- A Leslie ganhava de 64% a 65% dos duelos contra os outros.
- A espada sozinha era a maior fonte de dano do jogo: de 57% a 64% do dano da Leslie e do Anjo
  vinham das armas.
- A Fúria da Floresta quase não saía, porque o 1 e o 2 da Leslie gastavam a energia antes da
  barra encher.

## A tabela

"% da vida" é quanto um acerto tira da vida cheia. Antes a vida era 1000; agora é 2500.

### Geral

| | Antes | Depois | Por quê |
|---|---|---|---|
| Vida | 1000 | **2500** | A luta dura 3 a 4 min. Os números ficaram parecidos com os que já se conheciam, só que cada golpe pesa menos. |
| Energia por ponto de dano (Leslie) | 0,3 | **0,2** | A barra cheia pede 500 de dano dado. São umas 2 ults por luta. |
| Energia por ponto de dano (Grow) | 0,4 | **0,3** | Ele bate pouco de gente; enche com ~333. |
| Energia por ponto de dano (Anjo) | 0,3 | **0,45** | Na forma base ele só tem arma e soco; enche com ~222. |
| Relógio zerou | empate | **quem tem mais vida vence** | |

### Armas e soco (todos, na forma base)

| Ataque | Dano (antes → depois) | % da vida | Recarga | Observação |
|---|---|---|---|---|
| Espada | 35 → **26** | 1,0% | 0,6 → **1,15 s** | Cabeça ×1,5, pés ×0,6. Dura 30 s na mão. |
| Arco | 30 → **22** | 0,9% | 0,9 → **1,4 s** | Mesmas zonas. Dura 30 s na mão. |
| **Soco** (novo) | **4** | 0,16% | 0,45 s | Sem crítico. O ataque mais fraco do jogo; enche bem pouca energia (0,8 por acerto na Leslie). |

### Leslie, a dríade

| Poder | Dano (antes → depois) | % da vida | Recarga | Energia (antes → depois) |
|---|---|---|---|---|
| 1 · Chicote de Espinhos | 10 + veneno 6×6 = 46 → 10 + **4×6 = 34** | 1,4% | 1,4 s | 10 → **2** |
| 2 · Raízes | 14 por roda (até 42) | 1,7% | 9 s | 25 → **6** |
| 3 · Fúria da Floresta | 180 → **250**; cura 60 → **100** | 10% | 3 s | 100 (barra cheia) |

- **Vantagem:** o veneno. O dano dela continua depois do golpe, e isso é o que mais tira vida na
  luta.
- **Combo:** Raízes prendem, e a Fúria cai em quem está preso.

### Grow, de gente

| Poder | Dano (antes → depois) | % da vida | Recarga | Energia |
|---|---|---|---|---|
| 1 · Revoada de Águias | 20 → **55** (o tombo) | 2,2% | 6,5 s | 2 |
| 2 · Vendaval | 2 → **5** por lasquinha (até 60) | 2,4% | 8 s | 3 |
| 3 · Golem | — | — | 10 s depois de voltar | 100 (barra cheia) |

- **Vantagem:** controle. Tira o outro de perto, com as águias ou o vento, e a barra enche mais
  rápido para o golem.

### Golem (30 s, 40% de defesa, poderes sem gastar energia)

| Poder | Dano (antes → depois) | % da vida | Recarga |
|---|---|---|---|
| 1 · Salto Esmagador | 100 → **140** | 5,6% | 5 s |
| 2 · Investida | 80 → **130** | 5,2% | 6 s |
| 3 · Pedra | 95 → **125** em cheio; lascas 50 → **65** | 5,0% | 5 s |

- **Vantagem:** 30 s batendo forte com a pele de pedra segurando 40% do dano.
- **Continua valendo:** o veneno e as raízes da Leslie pegam nele; ele não pega arma, não dá pulo
  duplo e as águias só bicam (6).

### Anjo (escondido; pronto para voltar)

| | Antes | Depois |
|---|---|---|
| Forma de anjo | 25 s, recarga 10 s | **35 s, recarga 8 s** |
| 1 · Impacto Angelical | 50 por explosão (×3) | **80** (até 240, 9,6%) |
| 2 · Rajada de Amor | 40 por coração (×2) | **60** (até 120) |
| 3 · Julgamento Celestial | 230, recarga 22 s | **320** (12,8%), **recarga 18 s** |

- **Vantagem:** a forma de anjo é a mais forte do jogo e ele voa.
- **Desvantagem:** na forma base só tem arma e soco. Por isso a energia dele enche mais rápido.

## Para acompanhar

- **Grow × Grow** ficou a luta mais longa (252 s na mediana; 14% chegam ao fim do relógio, e aí
  vence quem tem mais vida). Se incomodar, a Revoada pode subir um pouco.
- **Grow × Anjo** deu 60% × 40%. O Anjo está escondido; quando ele voltar, vale medir de novo.
- O modelo não sabe de mira, de leitura de jogo nem da CPU. Depois de umas partidas de verdade,
  ajuste pelo que sentir e rode `python3 ferramentas/simular-duelo.py` de novo. Mudou um número
  no jogo, mude também em `NUMEROS`, no começo do simulador.
