# Balanceamento

A tabela de danos do jogo, anotada, e como os números foram acertados para as lutas acabarem em até
3 minutos (o relógio da partida segue em 5).
Os números ficam em `packages/compartilhado/src/conteudo/` (`poderes.ts`, `armas.ts`, `leslie.ts`,
`grow.ts`, `margo.ts`, `anjo.ts`). O simulador usado para acertá-los está em `ferramentas/simular-duelo.py`.

## O que se buscou

- **Duração:** uma luta entre dois jogadores do mesmo nível acaba **em até 3 minutos** quase
  sempre: são as partidas **rápidas e médias** (a mediana fica entre 1 min 40 s e 2 min 30 s). Os
  **3 a 5 minutos** do relógio ficam para as partidas **difíceis ou peculiares** (muito controle,
  muita fuga, quase sempre com o Grow), e passar de **4** é raro (veja **Luta de até 3 minutos**,
  logo abaixo, e **Armas abaixo dos poderes**, que é a etapa mais nova).
- **Fim por tempo:** se o relógio zera, **vence quem tiver mais vida**. Com a vida igual, dá
  empate. Online, cada um avisa a própria vida ao servidor, e é ele quem decide.
- **Armas como segunda opção:** os poderes é que carregam a luta. A espada e o arco ajudam e
  enchem a energia, mas o golpe de uma arma, **até no crítico na cabeça**, tira menos que **um uso
  inteiro de qualquer poder** (veja **Armas abaixo dos poderes**, logo abaixo). Um teste confere
  essa regra a cada mudança de número (`packages/compartilhado/test/armas-vs-poderes.test.ts`).
- **Soco:** sem arma na mão, o clique esquerdo dá um soco. É o ataque mais fraco do jogo e o que
  menos enche a energia.
- **Golem e armas:** de golem, o Grow só tem os poderes: nem o soco (o quadrinho do punho), nem
  arma do chão (ele não pega, e a da mão cai ao virar). A Leslie, até ultando, continua na forma
  humana e usa arma e soco. Um teste confere isso (`apps/cliente/test/golem-sem-arma.test.ts`).
- **Nenhum personagem sobrando:** entre dois do mesmo nível, cada duelo fica perto de 50% para
  cada lado — a Margo também, que entrou depois (veja **A Margo**, logo abaixo).
- **O Anjo**, mesmo escondido, entrou na conta e está pronto para quando voltar.

## A Margo (outubro de 2026)

A Margo é a vovó do rolo de massa, com o ganso dela. Idosa, **não dá soco e não pega as armas do
chão**: a arma dela é o rolo, e o primeiro quadrinho do painel (o do soco, nos outros) é a
**rolada**. Os poderes: o **Bumerangue** (o rolo vai e volta, e acerta na ida e na volta; sem ele na
mão, nada de rolada), a **Farinha** (o saco estoura numa nuvem que deixa quem está nela lento, sem
arranco, perdendo um pouquinho de vida) e, com a barra cheia, o **Ganso Raivoso** (o ganso fica
bravo, corre rápido atrás do outro e bica quem está perto do chão; ela continua lutando).

| Ataque | Dano | Recarga | Energia | Um uso inteiro |
|---|---|---|---|---|
| Rolada (no lugar do soco) | **25** | 0,6 s | — | 25 (sem crítico) |
| 1 · Bumerangue de Rolo | **48** por passada | 4 s | 2 | 96 (a ida e a volta) |
| 2 · Saco de Farinha | **30** o saco + **8** a cada 0,5 s na nuvem (3,5 s) | 9 s | 6 | 86 |
| 3 · Ganso Raivoso | **22** por bicada, a cada 0,38 s, por 9 s | 3 s | 100 (barra cheia) | ~506 |

- **A rolada fica abaixo dos poderes**, como as armas do chão: menos que um uso inteiro de qualquer
  poder (o mais fraco ainda é o Chicote, 50), e mais que o soco (o teste confere as duas coisas). É
  mais forte que o golpe de espada porque é a única arma dela.
- **A energia:** 0,27 por ponto de dano (a Leslie tem 0,215): sem arma do chão, a barra enche com
  ~370 de dano dado.
- **O Ganso Raivoso** é o que mais tira dela (como a Flor da Leslie): corre a 165 px/s (a gente anda a
  90) e não dá para ferir; escapa-se pulando por cima dele. No simulador, cada bicada a mais ou a
  menos mexe uns 5 pontos de vitória: com 15 ela perdia quase todas; com 24, ganhava 59% da Leslie.
- **A Farinha** é controle: enfarinhado, o outro anda a 55% da velocidade e não dá o arranco (no
  modelo, ela acerta 30% mais quem está lento).

No simulador (2 000 duelos de cada):

| Duelo | Mediana | Até 3 min | Vence |
|---|---|---|---|
| Leslie × Margo | 93 s | 100% | 46% × 53% |
| Grow × Margo | 117 s | 99% | 51% × 49% |
| Margo × Anjo | 107 s | 100% | 49% × 51% |
| Margo × Margo | 89 s | 100% | 51% × 49% |

A luta com ela fica entre as rápidas e médias, como a meta pede. O rolo dá de 27% a 31% do dano
dela (as armas do chão dão de 10% a 20% nos outros): é a arma dela, mas os poderes seguem sendo a
maior parte. Os números das lutas sem ela não mudaram.

## Armas abaixo dos poderes (outubro de 2026)

A regra: as armas do chão são a **segunda opção** e os poderes são o foco. Por isso o golpe de uma
arma, **até no crítico na cabeça** (×1,5), tem que tirar menos que **um uso inteiro de qualquer
poder**. "Um uso inteiro" é tudo acertando: o Chicote com o veneno, as três rodas das Raízes,
todas as cusparadas da Flor, o tombo da Revoada, o Vendaval soprando o tempo todo, e os golpes do
golem e do Anjo. O soco continua o ataque mais fraco de todos.

Antes, o poder mais fraco era o Chicote (13 + veneno 6 × 5 = **43**), e o crítico da espada (**60**)
e do arco (**51**) passavam dele; as armas davam de 30% a 33% do dano da Leslie. Agora a espada é
26 (crítico **39**), o arco é 22 (crítico **33**), o soco é 4, e o Chicote inteiro tira **50**.

Só baixar as armas desequilibrava: sem compensar, a Leslie caía para 41% contra o Grow e o Anjo
para 32% contra ele (a forma base do Anjo só tem arma e soco, então a energia dele demorava a
encher). Por isso
os poderes subiram ~15%, a energia por ponto de dano da Leslie foi de 0,2 para **0,215** e a do
Anjo de 0,45 para **0,62**.

| Ataque | Antes | Agora |
|---|---|---|
| Espada / Arco / Soco | 40 / 34 / 6 | **26 / 22 / 4** |
| Crítico (cabeça ×1,5) da espada / do arco | 60 / 51 | **39 / 33** |
| Chicote (acerto) / veneno (por pinguinho, ×5) | 13 / 6 | **15 / 7** (a cura segue 2 por pinguinho: 0,3 × 7 = 2,1, arredonda para 2) |
| Raízes (por roda) | 22 | **25** |
| Flor (por cusparada) | 40 | **46** |
| Revoada (tombo / bicada no golem) | 83 / 10 | **95 / 12** |
| Vendaval (por lasquinha) | 7 | **8** |
| Salto / Investida | 210 / 196 | **241 / 225** |
| Pedra (em cheio / lascas) | 187 / 97 | **215 / 112** |
| Anjo: Impacto / Rajada / Julgamento | 130 / 98 / 520 | **150 / 113 / 598** |
| Energia por ponto de dano: Leslie / Anjo | 0,2 / 0,45 | **0,215 / 0,62** |

| Duelo (2 000 de cada) | Mediana | Acabam em até 3 min | Passam de 4 min | Vence | Armas (% do dano do 1º) |
|---|---|---|---|---|---|
| Leslie × Grow, antes → **agora** | 127 s → **123 s** | 98% → **99%** | 0% → **0,1%** | 49% × 51% → **50% × 50%** | 33% → **19%** |
| Grow × Grow (quando houver) | 148 s → **145 s** | 82% → **86%** | 0,5% → **0,7%** | 49% × 51% → **51% × 49%** | 17% → **11%** |
| Leslie × Leslie (quando houver) | 100 s → **100 s** | 100% → **100%** | 0% → **0%** | 51% × 49% → **49% × 51%** | 30% → **18%** |
| Leslie × Anjo (quando houver) | 114 s → **113 s** | 99% → **99%** | 0% → **0%** | 47% × 53% → **48% × 52%** | 33% → **20%** |
| Grow × Anjo (quando houver) | 131 s → **129 s** | 94% → **93%** | 0,1% → **0,1%** | 52% × 48% → **55% × 45%** | 16% → **10%** |
| Anjo × Anjo (quando houver) | 120 s → **117 s** | 97% → **96%** | 0% → **0,1%** | 48% × 52% → **50% × 50%** | 21% → **14%** |

A duração e o equilíbrio ficaram onde estavam; o que mudou foi quem carrega a luta (as armas
davam de 16% a 33% do dano e agora dão de 10% a 20%). O Grow × Anjo é o duelo mais desigual: nas
várias rodadas do simulador o Grow ganhou de 52% a 55%. O Anjo está escondido, então o duelo que
existe hoje é o Leslie × Grow, em 50% × 50%. `python3 ferramentas/simular-duelo.py antesarmas` roda
os números de antes desta etapa.

## Luta de até 3 minutos (outubro de 2026, antes das armas abaixo dos poderes)

Etapa anterior, mantida como história (os números de agora estão na seção acima). A meta mudou: a luta entre dois do mesmo nível deve acabar **em até 3 minutos** na grande maioria
das vezes (as partidas **rápidas e médias**), e os **3 a 5 minutos** do relógio ficam para as
**difíceis ou peculiares**. Com os números de antes, só 63% das Leslie × Grow e 44% das
Grow × Grow acabavam em até 3 min. O dano subiu de novo, **~20%** em média; a vida continua 2 500,
o relógio continua em 5 min e a cura do veneno continua em 2 por pinguinho.

| Duelo (2 000 de cada) | Mediana | 9 de 10 até | Acabam em até 3 min | Passam de 4 min | Vence |
|---|---|---|---|---|---|
| Leslie × Grow, antes → **agora** | 170 s → **127 s** | 207 s → **161 s** | 63% → **98%** | 1,1% → **0%** | 50% × 50% → **49% × 51%** |
| Grow × Grow (quando houver) | 186 s → **148 s** | 242 s → **193 s** | 44% → **82%** | 11% → **0,5%** | 50% × 50% → **49% × 51%** |
| Leslie × Leslie (quando houver) | 140 s → **100 s** | 170 s → **123 s** | 95% → **100%** | 0% → **0%** | 50% × 50% → **51% × 49%** |
| Leslie × Anjo (quando houver) | 152 s → **114 s** | 191 s → **145 s** | 82% → **99%** | 0,5% → **0%** | 49% × 51% → **47% × 53%** |
| Grow × Anjo (quando houver) | 172 s → **131 s** | 225 s → **171 s** | 57% → **94%** | 4,8% → **0,1%** | 58% × 42% → **52% × 48%** |
| Anjo × Anjo (quando houver) | 154 s → **120 s** | 209 s → **160 s** | 73% → **97%** | 2,7% → **0%** | 50% × 50% → **48% × 52%** |

Nenhuma luta do modelo chega aos 5 min do relógio. No modelo, os 3 a 5 min ficam com o Grow (o
Grow × Grow é o duelo mais longo: 18% passam de 3 min, e quase nenhum de 4). O resto das lutas
"difíceis ou peculiares" é o que o simulador não vê: ele não sabe de mira, de leitura de jogo nem
da CPU, então só jogando de verdade dá para saber quanto da cauda de 3 a 5 min aparece.

Subir tudo igual (×1,2) desequilibrava: a Leslie caía para 44% contra o Grow e o Grow ganhava 58%
do Anjo. O golem dura 30 s fixos e pesa mais numa luta curta, e a cura do veneno é fixa (2 por
pinguinho) e vale menos quando tudo bate mais forte. Por isso tudo subiu ×1,2, **menos a Flor
(29 → 40, em vez de 35) e o Anjo (×1,3)**, que subiram um pouco mais. Como a energia pixy vem do
dano dado, as ults (a Flor e o golem) também chegam antes, e isso já está na conta.

| Ataque | Antes | Agora |
|---|---|---|
| Espada / Arco / Soco | 33 / 28 / 5 | **40 / 34 / 6** |
| Chicote (acerto) / veneno (por pinguinho, ×5) | 11 / 5 | **13 / 6** (a cura segue 2 por pinguinho: 0,4 × 6 = 2,4, arredonda para 2) |
| Raízes (por roda) | 18 | **22** |
| Flor (por cusparada) | 29 | **40** |
| Revoada (tombo / bicada no golem) | 69 / 8 | **83 / 10** |
| Vendaval (por lasquinha) | 6 | **7** |
| Salto / Investida | 175 / 163 | **210 / 196** |
| Pedra (em cheio / lascas) | 156 / 81 | **187 / 97** |
| Anjo: Impacto / Rajada / Julgamento | 100 / 75 / 400 | **130 / 98 / 520** |

`python3 ferramentas/simular-duelo.py antes3min` roda os números de antes desta subida (e `mais`,
no fim, usa 2 000 duelos de cada em vez de 600).

## Dano +25% (outubro de 2026, antes da luta de até 3 minutos)

Etapa anterior, mantida como história (os números de agora estão na seção acima). Com os números
de antes dela, a luta durava 3 a 4 minutos e uma boa parte passava de 4 (Leslie × Grow, o único
duelo possível hoje: 44% passavam de 4 min e 3% chegavam ao fim do relógio). Todo o dano subiu
**~25%**, a vida continuou 2 500 e a cura do veneno ficou igual (2 por pinguinho).

| Duelo (2 400 de cada) | Mediana | 9 de 10 até | 99 de 100 até | Passam de 4 min | Chegam aos 5 min |
|---|---|---|---|---|---|
| Leslie × Grow, antes | 234 s | 281 s | 300 s | 44% | 2,6% |
| **Leslie × Grow, depois do +25%** | **169 s** | **208 s** | **245 s** | **1,4%** | **0,1%** |
| Grow × Grow (quando houver), depois do +25% | 186 s | 241 s | 283 s | 10% | 0,4% |
| Leslie × Leslie (quando houver), depois do +25% | 140 s | 168 s | 201 s | 0% | 0% |

Quem vencia continuou perto de 50% × 50% (Leslie × Grow: 49% × 51%).

| Ataque | Antes | Depois do +25% |
|---|---|---|
| Espada / Arco / Soco | 26 / 22 / 4 | **33 / 28 / 5** |
| Chicote (acerto) / veneno (por pinguinho, ×5) | 8 / 4 | **11 / 5** (a cura: 0,4 do que tira = 2, igual) |
| Raízes (por roda) | 14 | **18** |
| Flor (por cusparada) | 23 | **29** |
| Revoada (tombo / bicada no golem) | 55 / 6 | **69 / 8** |
| Vendaval (por lasquinha) | 5 | **6** |
| Salto / Investida | 140 / 130 | **175 / 163** |
| Pedra (em cheio / lascas) | 125 / 65 | **156 / 81** |
| Anjo: Impacto / Rajada / Julgamento | 80 / 60 / 320 | **100 / 75 / 400** |

As tabelas abaixo contam a história do primeiro balanceamento, com os números daquela época.
`python3 ferramentas/simular-duelo.py anterior` roda os números de antes do +25%.

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
  | Cada cusparada da Flor (o par de bolas, alta e baixa, a 320 px/s) | 60% |
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
| Leslie × Leslie | 59 s | **209 s** | 50% × 50% | 38% |
| Leslie × Grow | 91 s | **236 s** | 53% × 47% | 39% |
| Leslie × Anjo | 73 s | **215 s** | 50% × 50% | 39% |
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
| 1 · Chicote de Espinhos | 10 + veneno 6×6 = 46 → **8 + veneno 5×4 = 28**; o veneno cura a Leslie em **2 por pinguinho** (10) | 1,1% | 1,4 s | 10 → **2** |
| 2 · Raízes | 14 por roda (até 42) | 1,7% | 9 s | 25 → **6** |
| 3 · Flor Carnívora (no lugar da Fúria) | 45 → **23 por cusparada, ~9 cusparadas (até ~207)**, e cada uma envenena | 0,9% cada | 3 s | 100 (barra cheia) |

- **A Flor Carnívora:** brota a até 120 px dela, fica **14 s** de pé (eram 10), vai atrás do outro
  a 42 px/s e para a 60 px; a cada **1,6 s** agacha (0,3 s de aviso) e cospe **um par de bolas**
  de veneno a **320 px/s** (eram uma, a 230), por até 420 px: uma nas pernas (6 px do chão) e uma
  na altura de quem pula (42 px). Parado, a baixa pega; num pulo simples (até ~45 px), a alta.
  Só o pulo duplo na hora passa por cima das duas. O par fere uma vez só (o golem, alto, pegaria
  as duas). Quem é acertado fica envenenado (o mesmo veneno do chicote, que também cura a Leslie). Com ele a mais de 140 px, ela **entra na terra**,
  corre por baixo a 220 px/s e sai a 60 px dele: a terra racha e brilha 0,45 s antes, dá para
  sair de perto. Embaixo da terra ela não cospe, e esse tempo não conta nos 14 s. Não dá para
  matar a flor: é desviar das bolas. Ela continua cuspindo mesmo com a luta parada, e por isso
  foi medida valendo o tempo todo (fugir dela não adianta mais, o que o modelo já supunha).
- **Flor mais longa, mais rápida e em par:** com 14 s, a bola a 320 px/s e o par (acerto de 35%
  para 60% no modelo), a cusparada de 35 deixava a Leslie vencendo 59% do Grow; a de 45, mais
  ainda. Com **23**, em 2 000 duelos de cada: Leslie × Grow **52%** (era 51% com uma bola só, e
  47% antes da Flor mais longa), × Anjo 54%, espelho 49%. A Flor acerta muito mais vezes, cada
  acerto tira um pouco menos, e o veneno (que cura a Leslie) entra com mais constância.
- **A cura:** a Fúria curava 100 de uma vez; agora quem cura é o veneno do chicote — **metade do
  que cada pinguinho tira** (4 de veneno, 2 de cura; no golem, que segura parte, a metade do que
  passou). Para a Leslie não ficar forte demais com a cura, o chicote tira 8 no acerto (era 10) e
  o veneno dura 2,5 s (era 3). Sem esses dois ajustes, com a Flor e a cura ela vencia de 64% a 66%.
- **Vantagem:** o veneno. O dano dela continua depois do golpe, cura ela, e isso é o que mais tira
  vida na luta.
- **Combo:** Raízes prendem, e a Flor acerta as cusparadas em quem está preso.
- **O veneno da Flor** vale menos do que parece: ele não soma, recomeça (como o do chicote), e na
  luta o outro quase sempre já está envenenado. Por isso a cusparada só baixou de 50 para 45 quando
  passou a envenenar (no simulador, de 40 a 50 dá tudo entre 46% e 53%).

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
- **Continua valendo:** o veneno (e a cura dele) e as raízes da Leslie pegam nele; ele não pega arma, não dá pulo
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

- **Grow × Grow** continua a luta mais longa (145 s na mediana; 86% acabam em até 3 min e só 0,7%
  passam de 4). Se na prática passar muito de 3 min, a Revoada ou o Vendaval podem subir um pouco.
- **Grow × Anjo** deu 55% × 45% (de 52% a 55% nas rodadas; era 58% × 42% com tudo ×1,2). O Anjo está escondido; quando ele
  voltar, vale medir de novo.
- **A Margo** é nova: o modelo não sabe de quanto o ganso grudado acerta de verdade (pular por cima
  dele, fugir com o arranco antes de ser enfarinhado). Se o Ganso Raivoso decidir as lutas demais (ou
  de menos), o primeiro número a mexer é o dano da bicada (`GANSO.dano`).
- O modelo não sabe de mira, de leitura de jogo nem da CPU. Depois de umas partidas de verdade,
  ajuste pelo que sentir e rode `python3 ferramentas/simular-duelo.py` de novo. Mudou um número
  no jogo, mude também em `NUMEROS`, no começo do simulador. (`simular-duelo.py furia` roda com a
  Fúria da Floresta de antes, para comparar.)
- **A Flor Carnívora** é a coisa mais difícil de medir: o modelo não sabe desviar. Se na prática
  as bolas acertarem demais (ou de menos), mexa no dano da cusparada (`FLOR.tiro.dano`): no
  simulador, cada 1 de dano a mais nela vale de 0,5 a 0,8 ponto de vitória para a Leslie.
