// A vida, a energia pixy e os poderes de cada personagem (os números de cada poder ficam no
// arquivo do personagem: anjo.ts, leslie.ts e grow.ts). Cada personagem tem três poderes, na
// ordem dos quadrinhos do painel: 1 o básico, 2 o intermediário e 3 o especial. O Grow tem dois
// jogos de três: os de gente (o terceiro é virar golem) e os do golem.

import { IMPACTO, JULGAMENTO, PODERES_ANJO, RAJADA } from './anjo';
import type { Heroi } from './herois';
import { GOLEM, INVESTIDA, PEDRA, PODERES_GOLEM, PODERES_GROW, REVOADA, SALTO, VENTO } from './grow';
import { CHICOTE, FLOR, PODERES_LESLIE, RAIZES } from './leslie';
import { BUMERANGUE, FARINHA, GANSO, PODERES_MARGO } from './margo';

export * from './anjo';
export * from './leslie';
export * from './grow';
export * from './margo';

// A vida de cada um. Os números do jogo foram acertados juntos (BALANCEAMENTO.md, na pasta jogo/)
// para a luta entre dois do mesmo nível quase sempre acabar em até 3 minutos (as rápidas e as
// médias): os 3 a 5 do relógio ficam para as lutas difíceis ou peculiares.
export const VIDA_MAXIMA = 2500;

// A energia pixy vem do dano que o personagem dá no adversário (com poder, arma ou soco): com 0,215
// por ponto de dano, enche com ~465 de dano dado — pouco menos de um quinto da vida do outro; a do
// Grow, com 0,3, enche com ~333 (a barra cheia dele é o golem, e de gente ele bate pouco); a do
// Anjo, com 0,62, com ~161 (na forma base ele só tem as armas e o soco, que batem pouco: as armas
// são a segunda opção, abaixo dos poderes); a da Margo, com 0,27, com ~370 (sem arma do chão, só
// o rolo e os poderes). Numa luta, cada um usa a barra cheia umas 2 vezes. Ela começa vazia. O Anjo a gasta para virar anjo (e de anjo ela não carrega, para uma
// forma de anjo não emendar na outra). Os poderes 1 e 2 da Leslie e do Grow gastam quase nada (a
// barra é da ult); a Flor Carnívora e o golem pedem a barra cheia. De golem não gasta nada (a
// barra desce com o tempo da forma) e ela não carrega.
export const ENERGIA_PIXY = {
  maxima: 100,
  porDano: 0.215, // por ponto de dano dado no adversário
  porDanoGrow: 0.3, // o Grow enche mais depressa
  porDanoAnjo: 0.62, // e o Anjo mais ainda (a forma base só tem arma e soco)
  porDanoMargo: 0.27, // e a Margo, um pouco mais que a Leslie (não pega arma do chão)
  custoAnjo: 100,
  custoLeslie: { chicote: 2, raizes: 6, flor: 100 }, // o 1 e o 2: quase nada
  custoGrow: { aves: 2, vento: 3, golem: 100 }, // a Revoada e o Vendaval: quase nada
  custoMargo: { bumerangue: 2, farinha: 6, ganso: 100 }, // o Bumerangue e a Farinha: quase nada
};

// Todos os poderes do jogo (o formato das mensagens aceita qualquer um); cada personagem usa os seus.
export const PODERES = [...PODERES_ANJO, ...PODERES_LESLIE, ...PODERES_GROW, ...PODERES_GOLEM, ...PODERES_MARGO] as const;
export type IdPoder = (typeof PODERES)[number];

// Os da forma base (o Grow, de gente); os do golem ficam em PODERES_GOLEM.
export const PODERES_DO_HEROI: Record<Heroi, readonly IdPoder[]> = {
  anjo: PODERES_ANJO,
  leslie: PODERES_LESLIE,
  grow: PODERES_GROW,
  margo: PODERES_MARGO,
};
export const PODERES_POR_HEROI = 3;

const DADOS = {
  impacto: IMPACTO,
  rajada: RAJADA,
  julgamento: JULGAMENTO,
  chicote: CHICOTE,
  raizes: RAIZES,
  flor: FLOR,
  aves: REVOADA,
  vento: VENTO,
  golem: GOLEM,
  salto: SALTO,
  investida: INVESTIDA,
  pedra: PEDRA,
  bumerangue: BUMERANGUE,
  farinha: FARINHA,
  ganso: GANSO,
};

export const RECARGA_PODER = Object.fromEntries(PODERES.map((p) => [p, DADOS[p].recarga])) as Record<IdPoder, number>;
export const NOME_PODER = Object.fromEntries(PODERES.map((p) => [p, DADOS[p].nome])) as Record<IdPoder, string>;
