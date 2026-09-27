// A Leslie, a dríade da floresta. Ela não se transforma: é sempre dríade. Pega as armas que caem
// do céu como qualquer um, e a tecla R troca o que o clique esquerdo usa — a arma da mão ou os
// poderes (o botão direito passa para o próximo poder). Os poderes dela são mais fracos que os
// do anjo: ele é uma transformação curta que bate forte; ela tem os dela o tempo todo.
// Distâncias em pixels, tempos em segundos, velocidades em px/s.
//
// A energia pixy (poderes.ts) é o combustível: começa vazia, enche com o dano que ela dá (no começo,
// só com as armas) e cada poder só sai com a energia dele — o 1 pede pouco, o 2 mais e a Fúria a
// barra cheia — e a gasta.
//
// Cada um se desvia de um jeito:
// - 1 · Chicote de Espinhos: uma vinha com espinhos sai da mão dela em linha reta na direção do
//   cursor e volta para a mão como um chicote. Pega o primeiro que encontrar: pouco dano, mas
//   deixa envenenado (perde um pouquinho de vida de tempos em tempos) — sai-se da linha ou pula.
// - 2 · Raízes: uma fileira de três rodas de raízes, como o Impacto do Anjo: a primeira na direção
//   do cursor e as outras duas logo em seguida, cada uma depois de onde a anterior acaba. Em cada
//   uma a terra racha e as raízes saem do chão e prendem quem está em cima (sem andar nem pular);
//   enquanto ficam de fora, quem encostar nelas também fica preso, até elas voltarem para a terra.
//   A fileira vai crescendo: a primeira roda é baixa, a do meio mais alta e a última bem alta —
//   quanto mais para o fim, mais alto pega (pular a última é difícil) e mais tempo prende; a
//   última, o bastante para a Fúria cair nele. Pulando na hora, ou saindo da rachadura, escapa.
// - 3 · Fúria da Floresta: só com a barra de energia pixy cheia, e gasta a barra. A terra treme
//   numa área grande e brotam trepadeiras com espinhos — pular não adianta, só saindo de baixo.
//   A Leslie recupera vida na hora em que usa.

export const PODERES_LESLIE = ['chicote', 'raizes', 'furia'] as const;

export const CHICOTE = {
  nome: 'Chicote de Espinhos',
  dano: 10, // no acerto; o veneno tira o resto aos poucos
  recarga: 1.4,
  alcance: 130, // até onde a vinha estica, da mão
  estica: 0.2, // segundos para esticar tudo
  volta: 0.24, // segundos para voltar para a mão
  raio: 3, // da ponta, para o acerto
};

// O veneno do chicote: tira `dano` a cada `intervalo`, por `duracao` segundos (6 × 6 = 36). Um novo
// acerto recomeça a contagem (não soma).
export const VENENO = {
  duracao: 3,
  intervalo: 0.5,
  dano: 6,
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
  // Segundos sem andar nem pular, por roda: a última prende o bastante para trocar para a Fúria e
  // ela cair (o aviso dela é de 1 s). As raízes ficam de fora da terra esse tempo.
  prende: [1.1, 1.6, 2.4],
};

export const FURIA = {
  nome: 'Fúria da Floresta',
  dano: 130,
  recarga: 3, // curta: quem segura o especial é a barra de energia
  alcance: 260,
  aviso: 1, // a terra tremendo antes das trepadeiras: andando, dá para sair ~90 px
  raio: 50, // metade da largura da área
  duracao: 0.9,
  cura: 60, // vida que a Leslie recupera ao usar
};
