// Os três poderes do anjo, na ordem dos quadrinhos do painel: 1 o básico, 2 o intermediário e
// 3 o especial. Só o anjo usa; o botão direito do mouse passa para o próximo e o esquerdo usa
// o escolhido, mirando onde o cursor está. Distâncias em pixels, tempos em segundos,
// velocidades em px/s.
//
// Cada um se desvia de um jeito:
// - 1 · Impacto Angelical: uma fileira de três explosões no chão correndo rápido em linha reta,
//   a primeira na direção do cursor e as outras duas logo em seguida, cada uma depois de onde a
//   anterior acaba — em pouca altura: pulando alto (o pulo duplo ou o do anjo) ou saindo da
//   fileira, escapa.
// - 2 · Rajada de Amor: dois corações flutuando rápido na direção do cursor, um de alcance curto
//   e outro longo — pula-se por cima ou sai da linha. O que acerta enfeitiça: o enfeitiçado só
//   anda, devagar, até quem o acertou; os dois acertando, o dobro do tempo.
// - 3 · Julgamento Celestial: marca uma área grande e desce um pilar do céu — pular não adianta,
//   só saindo de baixo.

export const VIDA_MAXIMA = 1000;

// Depois de voltar à forma base, quanto espera até poder virar anjo de novo.
export const RECARGA_ANJO = 20;

export const PODERES = ['impacto', 'rajada', 'julgamento'] as const;
export type IdPoder = (typeof PODERES)[number];

export const IMPACTO = {
  nome: 'Impacto Angelical',
  dano: 50, // por explosão da fileira
  recarga: 4,
  alcance: 150, // do anjo até o centro da primeira explosão, na horizontal
  perto: 30, // a primeira nunca fica mais perto que isto do anjo
  explosoes: 3,
  entre: 0.1, // segundos entre uma explosão da fileira e a seguinte: a fileira corre ~520 px/s
  aviso: 0.35, // o círculo no chão antes de cada explosão: andando, dá para sair ~30 px
  raio: 26, // cada explosão; a seguinte começa onde a anterior acaba
  altura: 40, // a explosão só pega quem está com os pés até esta altura do chão
  duracao: 0.45, // a luz da explosão na tela (o dano é no primeiro instante)
};

export const RAJADA = {
  nome: 'Rajada de Amor',
  dano: 40, // por coração: os dois acertando, 80
  recarga: 8,
  alcanceCurto: 110, // até onde o primeiro coração vai antes de sumir
  alcance: 220, // e o segundo
  atraso: 0.12, // o segundo sai logo depois do primeiro
  velocidade: 300, // o longo chega aos 220 px em ~0,7 s
  ondulacao: 4, // pixels para cada lado da linha: o coração flutua enquanto voa
  raio: 3, // do coração, para o acerto
  encanto: 2, // segundos de encanto por coração que acerta (os dois: 4 s)
  andarEncantado: 35, // px/s do enfeitiçado andando até quem o acertou (o normal é 90)
};

export const JULGAMENTO = {
  nome: 'Julgamento Celestial',
  dano: 230,
  recarga: 22,
  alcance: 280,
  aviso: 1.1, // a marca no chão antes de o pilar descer: andando, dá para sair ~100 px
  raio: 45, // metade da largura do pilar
  duracao: 0.7,
};

export const RECARGA_PODER: Record<IdPoder, number> = {
  impacto: IMPACTO.recarga,
  rajada: RAJADA.recarga,
  julgamento: JULGAMENTO.recarga,
};
