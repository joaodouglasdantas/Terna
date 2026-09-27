// A vida, a energia pixy e os poderes de cada personagem (os números de cada poder ficam no
// arquivo do personagem: anjo.ts, leslie.ts e grow.ts). Cada personagem tem três poderes, na
// ordem dos quadrinhos do painel: 1 o básico, 2 o intermediário e 3 o especial. O Grow tem dois
// jogos de três: os de gente (o terceiro é virar golem) e os do golem.

import { IMPACTO, JULGAMENTO, PODERES_ANJO, RAJADA } from './anjo';
import type { Heroi } from './herois';
import { GOLEM, INVESTIDA, PEDRA, PODERES_GOLEM, PODERES_GROW, REVOADA, SALTO, VENTO } from './grow';
import { CHICOTE, FURIA, PODERES_LESLIE, RAIZES } from './leslie';

export * from './anjo';
export * from './leslie';
export * from './grow';

export const VIDA_MAXIMA = 1000;

// A energia pixy vem do dano que o personagem dá no adversário (com poder ou com arma): com 0,3
// por ponto de dano, enche com ~333 de dano dado — um terço da vida do outro, uns 10 golpes de
// espada; a do Grow, com 0,4, enche com 250 (a barra cheia dele é o golem). Ela começa vazia. O Anjo a gasta para virar anjo (e de anjo ela não carrega, para uma
// forma de anjo não emendar na outra). Cada poder da Leslie só sai com a energia dele, e a gasta:
// o 1 pede pouco (um golpe de espada dá), o 2 mais e a Fúria da Floresta a barra cheia. O Grow,
// de gente, gasta quase nada na Revoada e no Vendaval e a barra cheia para virar golem; de golem
// não gasta nada (a barra desce com o tempo da forma) e ela não carrega.
export const ENERGIA_PIXY = {
  maxima: 100,
  porDano: 0.3, // por ponto de dano dado no adversário
  porDanoGrow: 0.4, // o Grow enche mais depressa
  custoAnjo: 100,
  custoLeslie: { chicote: 10, raizes: 25, furia: 100 },
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
  furia: FURIA,
  aves: REVOADA,
  vento: VENTO,
  golem: GOLEM,
  salto: SALTO,
  investida: INVESTIDA,
  pedra: PEDRA,
};

export const RECARGA_PODER = Object.fromEntries(PODERES.map((p) => [p, DADOS[p].recarga])) as Record<IdPoder, number>;
export const NOME_PODER = Object.fromEntries(PODERES.map((p) => [p, DADOS[p].nome])) as Record<IdPoder, string>;
