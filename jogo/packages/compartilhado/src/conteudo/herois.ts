// Os personagens jogáveis. A Leslie, a dríade da floresta, e o Grow, o metamorfo que vira golem de
// pedra, são os do lançamento do mapa da floresta. O Anjo (o corpo de moletom com a transformação
// em anjo na tecla R) está pronto, mas fica desligado até a atualização dele: `LIBERADO.anjo` é a
// chave. Desligado, ele não aparece na tela de seleção, a CPU não o sorteia e o servidor não
// aceita que alguém o escolha.

export const HEROIS = ['leslie', 'grow', 'anjo'] as const;
export type Heroi = (typeof HEROIS)[number];

export const LIBERADO: Record<Heroi, boolean> = {
  leslie: true,
  grow: true,
  anjo: false, // volta numa atualização: ligar aqui
};

export const HEROIS_LIBERADOS: readonly Heroi[] = HEROIS.filter((h) => LIBERADO[h]);

// O personagem de quem não escolheu a tempo (e o da CPU, quando for preciso um).
export const HEROI_PADRAO: Heroi = 'leslie';

// Para a tela de seleção: nome, um título curto e uma frase.
export const SOBRE_HEROI: Record<Heroi, { nome: string; titulo: string; frase: string }> = {
  leslie: {
    nome: 'Leslie',
    titulo: 'Dríade da floresta',
    frase: 'Nasceu de uma semente do bosque e luta com espinhos, raízes e trepadeiras. Pega as armas que caem do céu e, com R, troca a arma pelos poderes. A energia começa vazia: dar dano enche, e cada poder gasta a dele.',
  },
  grow: {
    nome: 'Grow',
    titulo: 'Metamorfo da floresta',
    frase: 'Druida de cajado: chama pássaros e vento para afastar quem chega perto. Com a energia cheia, vira um golem de pedra e musgo, duro de ferir e de golpes fortes.',
  },
  anjo: {
    nome: 'Anjo',
    titulo: 'Guerreiro celestial',
    frase: 'Luta com as armas que caem do céu e, com a energia pixy cheia, vira anjo por um tempo.',
  },
};
