// A vida, a energia pixy e os poderes de cada personagem (os números de cada poder ficam no
// arquivo do personagem: anjo.ts, leslie.ts e grow.ts). Cada personagem tem três poderes, na
// ordem dos quadrinhos do painel: 1 o básico, 2 o intermediário e 3 o especial. O Grow tem dois
// jogos de três: os de gente (o terceiro é virar golem) e os do golem.

import { IMPACTO, JULGAMENTO, PODERES_ANJO, RAJADA } from './anjo';
import type { Heroi } from './herois';
import { GOLEM, INVESTIDA, PEDRA, PODERES_GOLEM, PODERES_GROW, REVOADA, SALTO, VENTO } from './grow';
import { CHICOTE, FLOR, PODERES_LESLIE, RAIZES } from './leslie';

export * from './anjo';
export * from './leslie';
export * from './grow';

// A vida de cada um. Os números do jogo foram acertados juntos (BALANCEAMENTO.md, na pasta jogo/)
// para uma luta entre dois do mesmo nível durar uns 2 minutos e meio a 3, e quase nunca passar de 4:
// os 5 do relógio são a exceção, uma luta muito dura.
export const VIDA_MAXIMA = 2500;

// A energia pixy vem do dano que o personagem dá no adversário (com poder, arma ou soco): com 0,2
// por ponto de dano, enche com 500 de dano dado — um quinto da vida do outro; a do Grow, com 0,3,
// enche com ~333 (a barra cheia dele é o golem, e de gente ele bate pouco); a do Anjo, com 0,45,
// com ~222 (na forma base ele só tem as armas e o soco). Numa luta, cada um usa a barra cheia umas
// 2 vezes. Ela começa vazia. O Anjo a gasta para virar anjo (e de anjo ela não carrega, para uma
// forma de anjo não emendar na outra). Os poderes 1 e 2 da Leslie e do Grow gastam quase nada (a
// barra é da ult); a Flor Carnívora e o golem pedem a barra cheia. De golem não gasta nada (a
// barra desce com o tempo da forma) e ela não carrega.
export const ENERGIA_PIXY = {
  maxima: 100,
  porDano: 0.2, // por ponto de dano dado no adversário
  porDanoGrow: 0.3, // o Grow enche mais depressa
  porDanoAnjo: 0.45, // e o Anjo mais ainda (a forma base só tem arma e soco)
  custoAnjo: 100,
  custoLeslie: { chicote: 2, raizes: 6, flor: 100 }, // o 1 e o 2: quase nada
  custoGrow: { aves: 2, vento: 3, golem: 100 }, // a Revoada e o Vendaval: quase nada
};

// Todos os poderes do jogo (o formato das mensagens aceita qualquer um); cada personagem usa os seus.
export const PODERES = [...PODERES_ANJO, ...PODERES_LESLIE, ...PODERES_GROW, ...PODERES_GOLEM] as const;
export type IdPoder = (typeof PODERES)[number];

// Os da forma base (o Grow, de gente); os do golem ficam em PODERES_GOLEM.
export const PODERES_DO_HEROI: Record<Heroi, readonly IdPoder[]> = {
  anjo: PODERES_ANJO,
  leslie: PODERES_LESLIE,
  grow: PODERES_GROW,
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
};

export const RECARGA_PODER = Object.fromEntries(PODERES.map((p) => [p, DADOS[p].recarga])) as Record<IdPoder, number>;
export const NOME_PODER = Object.fromEntries(PODERES.map((p) => [p, DADOS[p].nome])) as Record<IdPoder, string>;
