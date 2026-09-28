// A Leslie, a dríade da floresta. Ela não se transforma: é sempre dríade. Pega as armas que caem
// do céu como qualquer um, e a tecla R troca o que o clique esquerdo usa — a arma da mão ou os
// poderes (o botão direito passa para o próximo poder). Os poderes dela são mais fracos que os
// do anjo: ele é uma transformação curta que bate forte; ela tem os dela o tempo todo.
// Distâncias em pixels, tempos em segundos, velocidades em px/s.
//
// A energia pixy (poderes.ts) é o combustível: começa vazia e enche com o dano que ela dá. O 1 e o
// 2 gastam quase nada; a Flor Carnívora pede a barra cheia.
//
// Cada um se desvia de um jeito:
// - 1 · Chicote de Espinhos: uma vinha com espinhos sai da mão dela em linha reta na direção do
//   cursor e volta para a mão como um chicote. Pega o primeiro que encontrar: pouco dano, mas
//   deixa envenenado (perde um pouquinho de vida de tempos em tempos) — sai-se da linha ou pula.
//   Cada pinguinho do veneno cura a Leslie em metade do que tirou.
// - 2 · Raízes: uma fileira de três rodas de raízes, como o Impacto do Anjo: a primeira na direção
//   do cursor e as outras duas logo em seguida, cada uma depois de onde a anterior acaba. Em cada
//   uma a terra racha e as raízes saem do chão e prendem quem está em cima (sem andar nem pular);
//   enquanto ficam de fora, quem encostar nelas também fica preso, até elas voltarem para a terra.
//   A fileira vai crescendo: a primeira roda é baixa, a do meio mais alta e a última bem alta —
//   quanto mais para o fim, mais alto pega (pular a última é difícil) e mais tempo prende; a
//   última, o bastante para a Flor acertar umas cusparadas. Pulando na hora, ou saindo da rachadura, escapa.
// - 3 · Flor Carnívora: só com a barra de energia pixy cheia, e gasta a barra. A terra treme onde
//   ela mirou e brota uma flor carnívora enorme, que fica um tempo de pé: vai atrás do outro (sem
//   chegar colada) — e, se ele foge para longe, entra na terra e sai perto dele — e cospe bolas
//   de veneno nele, rápidas e de muito longe (cada uma envenena, como o chicote). Não dá para
//   matar a flor: é desviar das bolas (pular, andar; ela agacha antes de cuspir) e sair de cima
//   da terra rachando onde ela vai sair, até ela murchar.

export const PODERES_LESLIE = ['chicote', 'raizes', 'flor'] as const;

export const CHICOTE = {
  nome: 'Chicote de Espinhos',
  dano: 8, // no acerto; o veneno tira o resto aos poucos
  recarga: 1.4,
  alcance: 130, // até onde a vinha estica, da mão
  estica: 0.2, // segundos para esticar tudo
  volta: 0.24, // segundos para voltar para a mão
  raio: 3, // da ponta, para o acerto
};

// O veneno do chicote: tira `dano` a cada `intervalo`, por `duracao` segundos (5 × 4 = 20). Um novo
// acerto recomeça a contagem (não soma). A cada pinguinho, a Leslie recupera `cura` do que ele
// tirou (a metade: 4 de veneno, 2 de cura; no golem, que segura parte, a metade do que passou).
export const VENENO = {
  duracao: 2.5,
  intervalo: 0.5,
  dano: 4, // por tique: 20 no total
  cura: 0.5, // da vida que o veneno tirou, volta para a Leslie
};

export const RAIZES = {
  nome: 'Raízes',
  dano: 14, // por roda da fileira
  recarga: 9,
  alcance: 140, // da Leslie até o centro da primeira roda, na horizontal
  perto: 30, // a primeira nunca fica mais perto que isto dela
  rodas: 3,
  entre: 0.14, // segundos entre uma roda e a seguinte
  aviso: 0.5, // a terra rachando antes das raízes de cada roda saírem: andando, dá para sair ~45 px
  raio: 18, // cada roda; a seguinte começa onde a anterior acaba
  // Por roda, a fileira crescendo: até que altura (dos pés, acima do chão) as raízes pegam quem
  // pula, e a altura das raízes na tela (de–até, sorteada em cada raiz).
  altura: [18, 28, 40],
  alturaDasRaizes: [
    [10, 20],
    [20, 34],
    [34, 54],
  ],
  // Segundos sem andar nem pular, por roda. As raízes ficam de fora da terra esse tempo.
  prende: [1.1, 1.6, 2.4],
};

// A Flor Carnívora. Brota a até `alcance` da Leslie, na direção do cursor: a terra treme por
// `aviso` segundos e ela sobe da terra em `brota`. De pé por `duracao` segundos, vai atrás do
// outro a `velocidade` e para a `distancia` dele; de `intervalo` em `intervalo` segundos agacha
// (`prepara`) e cospe uma bola de veneno na direção dele, que voa reto a `tiro.velocidade` até
// `tiro.alcance` (quase a tela inteira) ou até bater em alguém ou no chão; quem ela acerta fica
// envenenado (VENENO, o mesmo do chicote). No fim, murcha e estoura
// em veneno (só a imagem: não tira vida).
//
// A toca: com ele mais longe que `toca.longe` (e ela há pelo menos `toca.espera` segundos fora da
// terra), ela afunda em `toca.afunda`, corre por baixo da terra a `toca.velocidade` (a terra
// estufa por onde ela passa) e para a `distancia` dele, do lado de onde veio; ali a terra racha e
// brilha por `toca.aviso` (dá para sair de perto) e ela sobe em `toca.sobe`. Embaixo da terra ela
// não cospe, e esse tempo não conta na `duracao`.
//
// Balanceamento (BALANCEAMENTO.md): mais tempo de pé (14 s, eram 10), a bola mais rápida (320
// px/s, eram 230) e o par (alta e baixa: o pulo simples não escapa) acertam bem mais; cada
// cusparada tira 23 (eram 45) e a Leslie continua perto de 50% contra o Grow no simulador.
export const FLOR = {
  nome: 'Flor Carnívora',
  recarga: 3, // curta: quem segura o especial é a barra de energia
  alcance: 120,
  aviso: 0.6,
  brota: 0.5,
  duracao: 14,
  velocidade: 42, // a pé (a Leslie anda a 90); longe, ela vai por baixo da terra (toca)
  distancia: 60,
  primeiro: 0.5, // segundos de pé até a primeira cusparada
  intervalo: 1.6, // ~9 cusparadas
  prepara: 0.3,
  murcha: 1,
  // Cada cusparada é um par de bolas: uma mirada nas pernas (`alturas[0]` px acima do chão, onde
  // ele está) e outra na altura de quem pula (`alturas[1]`): parado, a baixa pega; num pulo
  // simples (até ~45 px), a alta. Só o pulo duplo, na hora, passa por cima das duas. O par fere
  // uma vez só: acertando uma, a outra atravessa quem foi acertado (o golem, alto, pegaria as duas).
  tiro: { dano: 23, velocidade: 320, alcance: 420, raio: 3, alturas: [6, 42] }, // ~9 × 23 = 207, e envenena
  toca: { longe: 140, espera: 2.5, afunda: 0.45, velocidade: 220, aviso: 0.45, sobe: 0.4 },
};
