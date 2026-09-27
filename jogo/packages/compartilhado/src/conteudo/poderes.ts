// A vida, a energia pixy e os poderes de cada personagem (os números de cada poder ficam no
// arquivo do personagem: anjo.ts e leslie.ts). Cada personagem tem três poderes, na ordem dos
// quadrinhos do painel: 1 o básico, 2 o intermediário e 3 o especial.

import { IMPACTO, JULGAMENTO, PODERES_ANJO, RAJADA } from './anjo';
import type { Heroi } from './herois';
import { CHICOTE, FURIA, PODERES_LESLIE, RAIZES } from './leslie';

export * from './anjo';
export * from './leslie';

export const VIDA_MAXIMA = 1000;

// A energia pixy vem do dano que o personagem dá no adversário (com poder ou com arma): com 0,3
// por ponto de dano, enche com ~333 de dano dado — um terço da vida do outro, uns 10 golpes de
// espada. Ela começa vazia. O Anjo a gasta para virar anjo (e de anjo ela não carrega, para uma
// forma de anjo não emendar na outra). Cada poder da Leslie só sai com a energia dele, e a gasta:
// o 1 pede pouco (um golpe de espada dá), o 2 mais e a Fúria da Floresta a barra cheia.
export const ENERGIA_PIXY = {
  maxima: 100,
  porDano: 0.3, // por ponto de dano dado no adversário
  custoAnjo: 100,
  custoLeslie: { chicote: 10, raizes: 25, furia: 100 },
};

// Todos os poderes do jogo (o formato das mensagens aceita qualquer um); cada personagem usa os seus.
export const PODERES = [...PODERES_ANJO, ...PODERES_LESLIE] as const;
export type IdPoder = (typeof PODERES)[number];

export const PODERES_DO_HEROI: Record<Heroi, readonly IdPoder[]> = {
  anjo: PODERES_ANJO,
  leslie: PODERES_LESLIE,
};
export const PODERES_POR_HEROI = 3;

const DADOS = { impacto: IMPACTO, rajada: RAJADA, julgamento: JULGAMENTO, chicote: CHICOTE, raizes: RAIZES, furia: FURIA };

export const RECARGA_PODER = Object.fromEntries(PODERES.map((p) => [p, DADOS[p].recarga])) as Record<IdPoder, number>;
export const NOME_PODER = Object.fromEntries(PODERES.map((p) => [p, DADOS[p].nome])) as Record<IdPoder, string>;
