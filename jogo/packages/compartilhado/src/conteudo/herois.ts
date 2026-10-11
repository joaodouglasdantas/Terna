// Os personagens jogáveis. A Leslie, a dríade da floresta, e o Grow, o metamorfo que vira golem de
// pedra, são os do lançamento do mapa da floresta — e os dois iniciais: o tutorial (o treino) é
// sempre só com eles (HEROIS_DO_TUTORIAL). A Margo, a vovó do rolo de massa com o ganso dela, veio
// depois. O Anjo (o corpo de moletom com a transformação
// em anjo na tecla R) está pronto, mas fica desligado até a atualização dele: `LIBERADO.anjo` é a
// chave. Desligado, ele não aparece na tela de seleção, a CPU não o sorteia e o servidor não
// aceita que alguém o escolha.
//
// Numa partida, cada personagem é de um jogador só: não há dois iguais em campo. Online, o que um
// escolhe fica bloqueado para o outro; sozinho, a CPU espera a sua escolha e fica com outro. Por
// isso precisa haver sempre pelo menos dois liberados.

export const HEROIS = ['leslie', 'grow', 'margo', 'anjo'] as const;
export type Heroi = (typeof HEROIS)[number];

export const LIBERADO: Record<Heroi, boolean> = {
  leslie: true,
  grow: true,
  margo: true,
  anjo: false, // volta numa atualização: ligar aqui
};

export const HEROIS_LIBERADOS: readonly Heroi[] = HEROIS.filter((h) => LIBERADO[h]);

// O tutorial é sempre com os dois iniciais: escolhe-se um deles para treinar, e o boneco é o outro.
export const HEROIS_DO_TUTORIAL: readonly Heroi[] = ['leslie', 'grow'];

// O nome e o codinome aparecem no cartão da tela de seleção. A frase fica para a futura seção
// dos personagens: na escolha não aparece o que cada um faz (os poderes do seu estão no Tab).
export const SOBRE_HEROI: Record<Heroi, { nome: string; codinome: string; frase: string }> = {
  leslie: {
    nome: 'Leslie',
    codinome: 'A Primeira Semente',
    frase: 'Nasceu de uma semente do bosque e luta com espinhos, raízes e trepadeiras. Pega as armas que caem do céu e, com R, troca a arma pelos poderes. A energia começa vazia: dar dano enche, e cada poder gasta a dele.',
  },
  grow: {
    nome: 'Grow',
    codinome: 'A Rocha Profunda',
    frase: 'Druida de cajado: chama pássaros e vento para afastar quem chega perto. Com a energia cheia, vira um golem de pedra e musgo, duro de ferir e de golpes fortes.',
  },
  margo: {
    nome: 'Margo',
    codinome: 'A Avó do Ganso',
    frase: 'Uma vovó brava que nunca larga o rolo de massa: bate com ele, arremessa como um bumerangue e joga farinha em quem chega perto. Velha demais para socos e armas do chão, tem o ganso dela — que, com a energia cheia, fica raivoso e sai bicando o outro.',
  },
  anjo: {
    nome: 'Anjo',
    codinome: 'Guerreiro celestial',
    frase: 'Luta com as armas que caem do céu e, com a energia pixy cheia, vira anjo por um tempo.',
  },
};
