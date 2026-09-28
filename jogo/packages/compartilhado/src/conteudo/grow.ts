// O Grow, o metamorfo da floresta. Na forma humana é um druida magrelo de cajado: pega as armas
// que caem do céu, e a tecla R troca o que o clique esquerdo usa — a arma ou os poderes (o botão
// direito passa para o próximo), como a Leslie. Os poderes dele, de gente, quase não tiram vida:
// servem para afastar. Com a barra de energia pixy cheia, o terceiro quadrinho o transforma num
// golem de pedra com musgo — uma transformação curta, como a do Anjo, que bate forte.
// Distâncias em pixels, tempos em segundos, velocidades em px/s.
//
// A energia pixy (poderes.ts): começa vazia e enche com o dano que ele dá. A Revoada e o Vendaval
// pedem quase nada dela e a gastam; o golem pede a barra cheia. De golem, os poderes não gastam
// nada: a barra só vai descendo com o tempo que resta da forma, e ela não carrega.
//
// Forma humana — cada um se desvia de um jeito:
// - 1 · Revoada de Águias: três águias grandes saem da mão dele na direção do cursor. Quem elas
//   pegam é levado bem alto, carregado para longe dele e largado lá de cima: o tombo tira um pouco
//   de vida. Sai-se da linha ou pula por cima. O golem é pesado demais: elas só bicam.
// - 2 · Vendaval: enquanto ele segura o botão (até `duracao`), uma ventania com folhas sopra para
//   o lado do cursor e empurra para longe quem está nela, tirando uma lasquinha de vida de tempos
//   em tempos. Ele fica parado soprando. Anda-se contra o vento devagar… ou sai-se de cima pulando.
// - 3 · Golem: com a barra cheia, vira golem por DURACAO_GOLEM.
//
// De golem — a pele de pedra segura o golpe: `DEFESA` do dano que ele leva é absorvida (aparece em
// cima do número, como "DEF"). Ele é pesado: anda mais devagar, não tem o pulo duplo, não pega arma
// (a da mão cai ao virar), o vento quase não o empurra e os pássaros não o levantam.
// - 1 · Salto Esmagador: pula muito alto e cai onde o cursor apontava: a sombra dele marca o chão
//   durante o voo. Quem está embaixo, perto do chão, apanha e é jogado para longe — pular na hora
//   ou sair de baixo escapa.
// - 2 · Investida: bate o pé, abaixa a cabeça e corre em linha reta para o lado do cursor,
//   atropelando quem estiver no caminho. Pula-se por cima (ele é alto: precisa de um pulo bom).
// - 3 · Pedra: arranca do chão um pedregulho enorme (quase do tamanho de gente) e o arremessa na
//   direção do cursor, em arco. Acertar em cheio dói muito; e onde ele cai, estoura em lascas que
//   pegam quem está perto do chão — difícil de desviar.

export const PODERES_GROW = ['aves', 'vento', 'golem'] as const;
export const PODERES_GOLEM = ['salto', 'investida', 'pedra'] as const;

// A forma de golem: dura DURACAO_GOLEM (acabou, volta sozinho; o R desfaz antes) e, de volta,
// espera RECARGA_GOLEM até poder virar de novo (e a barra precisa encher outra vez).
export const DURACAO_GOLEM = 30;
export const RECARGA_GOLEM = 10;
export const DEFESA_GOLEM = 0.4; // parte do dano que a pele de pedra absorve

// O corpo do golem, para os acertos: mais largo e mais alto que o de gente.
export const CORPO_GOLEM = { meiaLargura: 10, altura: 42 };
export const MOVIMENTO_GOLEM = {
  velocidade: 72, // gente anda a 90
  pulo: 230, // gente: 240, e ainda tem o pulo duplo
};

export const REVOADA = {
  nome: 'Revoada de Águias',
  recarga: 6.5,
  alcance: 175, // até onde as águias voam, da mão
  velocidade: 200,
  raio: 10, // o bando, para o acerto
  aguias: 3,
  // Pegou: sobe até `altura` (acima do chão) e vai `leva` px para longe do Grow em `levando`
  // segundos; aí larga. O tombo dá `dano` ao bater no chão.
  altura: 125,
  leva: 130,
  levando: 1.15,
  dano: 55, // o tombo lá de cima
  bicada: 6, // no golem, que elas não levantam
};

export const VENTO = {
  nome: 'Vendaval',
  recarga: 8, // conta da hora em que começa a soprar
  duracao: 3.6, // no máximo, segurando o botão
  minimo: 0.8, // um clique rápido ainda sopra isto
  alcance: 150, // comprimento da ventania, da mão para a frente
  altura: 46, // do chão para cima
  forca: 190, // px/s de empurrão em quem está nela (gente anda a 90)
  pesado: 0.3, // o golem sente só isto do empurrão
  sustentar: 520, // px/s² para cima em quem está no ar dentro dela: flutua e vai longe
  tique: 0.3, // segundos entre uma lasquinha e outra
  dano: 5, // por lasquinha: até 60 soprando o tempo todo
};

export const GOLEM = {
  nome: 'Golem de Pedra',
  recarga: 1, // o que segura é a barra cheia e RECARGA_GOLEM
};

export const SALTO = {
  nome: 'Salto Esmagador',
  dano: 140,
  recarga: 5,
  alcance: 170, // até onde ele pula, na horizontal
  perto: 20,
  agachar: 0.18, // segundos agachado antes de sair do chão
  voo: 1.05, // segundos no ar
  altura: 105, // o alto do salto, acima do chão
  raio: 34, // a área do tombo
  alturaDoTombo: 16, // só pega quem está com os pés até esta altura do chão
  empurrao: 230, // px/s para longe do centro
};

export const INVESTIDA = {
  nome: 'Investida',
  dano: 130,
  recarga: 6,
  preparo: 0.32, // bate o pé antes de correr: o aviso
  alcance: 280, // até onde ele corre (~1 s a 270 px/s)
  velocidade: 270,
  altura: 26, // pula por cima quem está com os pés acima disto
  empurrao: 280,
  quique: 170, // px/s para cima em quem é atropelado
};

export const PEDRA = {
  nome: 'Pedra',
  dano: 125, // em cheio
  lascas: 65, // o estouro onde ela cai
  recarga: 5,
  preparo: 0.5, // arrancando o pedregulho do chão e levantando
  velocidade: 270,
  gravidade: 330,
  raio: 13, // o pedregulho (uns 26 px de lado a lado)
  raioLascas: 44,
  alturaLascas: 26,
  empurrao: 230,
};
