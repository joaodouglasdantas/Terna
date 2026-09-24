// Comportamento dos animais do mapa. Distâncias em pixels, medidas na horizontal do
// personagem ao animal; tempos em segundos; velocidades em px/s; [mín, máx] é sorteado.
// `lugares` é onde cada um está quando o jogo abre (um por vaga do `maximo`).

export type Intervalo = readonly [number, number];

export const ESQUILO = {
  maximo: 3,
  lugares: [470, 1010, 1290],
  susto: 80,
  corrida: 115, // mais rápido que o personagem
  passeio: 45,
  subida: 38,
  alcanceArvore: 220, // foge para uma árvore a menos disto; se não houver, corre pelo chão
  sentado: [2, 6] as Intervalo,
  volta: 60, // passeia até esta distância de onde mora
};

export const COELHO = {
  maximo: 3,
  lugares: [400, 800, 1330],
  susto: 55,
  sentado: [2, 6] as Intervalo,
  pulos: [1, 3] as Intervalo,
  pulo: { vx: 45, vy: 110 },
  puloFuga: { vx: 120, vy: 140 },
  volta: 60,
};

export const SAPO = {
  maximo: 2,
  lugares: [610, 1120],
  susto: 28,
  parado: [2, 5] as Intervalo,
  coaxadas: [2, 3] as Intervalo,
  papo: 0.35,
  entreCoaxadas: 0.3,
  pulo: { vx: 45, vy: 115 },
  puloFuga: { vx: 75, vy: 125 },
  volta: 40,
};

export const CERVO = {
  maximo: 2,
  lugares: [250, 1200],
  susto: 130,
  alerta: 0.5, // encara o personagem por este tempo antes de disparar
  passo: 14,
  galope: 125,
  parado: [2, 5] as Intervalo,
  andando: [2, 5] as Intervalo,
  olhando: [1.5, 3] as Intervalo,
  volta: 80,
};

export const BORBOLETA = {
  maximo: 5,
  lugares: [330, 660, 790, 1080, 1370],
  susto: 20, // o personagem passando por baixo dela
  alcance: 70, // voa até esta distância de onde mora
  altura: [6, 45] as Intervalo,
  velocidade: 18,
  fuga: { vx: 35, vy: 28 },
  asa: 0.07,
  pousar: 0.15, // chance de pousar no chão a cada destino alcançado
  pousada: [2, 5] as Intervalo,
};

// Pássaros pousam sempre um por vez, cada um chegando voando de fora da tela; podem pousar
// perto de outro que já está no chão ou na mesma árvore, e aí formam um grupinho.
export const AVES = {
  maximo: 6, // pousados (ou chegando) no mapa ao mesmo tempo
  chegada: [4, 10] as Intervalo, // intervalo entre um pássaro e o próximo
  junto: 0.5, // chance de pousar perto de um que já está pousado...
  mesmaCor: 0.7, // ...e de ser da mesma cor dele
  espaco: 10, // distância mínima entre dois pousados no mesmo lugar
  susto: { chao: 70, arvore: 45 },
  demoraSusto: [0, 0.3] as Intervalo, // cada um levanta voo com um atraso próprio
  voo: 70,
  planar: 30, // plana de asas abertas nos últimos pixels antes de pousar
  fuga: { vx: [55, 75] as Intervalo, vy: [45, 70] as Intervalo, subida: 30 },
  parado: [1, 4] as Intervalo,
  bicadas: [2, 4] as Intervalo,
  bicada: 0.15,
  saltinho: { vx: 30, vy: 55 },
};

export const CONFIG_ANIMAL = { esquilo: ESQUILO, coelho: COELHO, sapo: SAPO, cervo: CERVO, borboleta: BORBOLETA };
export type TipoAnimal = keyof typeof CONFIG_ANIMAL;

export const REPOSICAO_ANIMAIS: Intervalo = [8, 20]; // espera até nascer um animal no lugar de um que sumiu
export const LONGE_AO_NASCER = 200; // nasce fora da tela e pelo menos a esta distância do personagem
export const GRAVIDADE_ANIMAIS = 640;
