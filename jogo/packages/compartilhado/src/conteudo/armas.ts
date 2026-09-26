import { MUNDO } from '../mundo';
import type { Intervalo } from './animais';

// As armas que caem do céu de vez em quando: a espada e o arco. Só a forma base pega e usa (o
// anjo tem os poderes): encostou numa, ela vai para a mão, e o botão esquerdo do mouse ataca na
// direção do cursor. Cada uma dura um tempo na mão e quebra. Virando anjo com uma na mão, ela cai
// no chão, com o tempo que ainda tinha, e qualquer um dos dois pode pegar. A tecla E descarta a
// da mão: ela cai e some, e ninguém mais pega.
//
// Onde o golpe pega muda o dano (`ZONAS`): na cabeça é crítico, no corpo é o normal e nos pés é
// menos.
//
// Caem com frequência, mas sem entupir o mapa: no máximo `maximo` no mapa inteiro, contando as que estão na mão
// (uma por personagem), e no máximo `noChao` esperando no chão. Online quem sorteia e marca a
// hora de cada queda é o servidor; sozinho, o próprio jogo, com os mesmos números.
// Distâncias em pixels, tempos em segundos, velocidades em px/s.

export const ARMAS = ['espada', 'arco'] as const;
export type TipoArma = (typeof ARMAS)[number];

export const QUEDA_DE_ARMAS = {
  maximo: 6, // no mapa: no chão + na mão
  noChao: 4, // esperando alguém pegar
  primeira: 6, // do começo da partida até a primeira tentativa
  intervalo: [6, 14] as Intervalo, // entre uma tentativa de queda e a próxima
  margem: 60, // das beiradas do mapa
  velocidade: 75, // descendo do céu: ~3 s até o chão, dá tempo de ver onde vai cair
  pegar: 10, // do eixo do corpo até a arma, para pegar
};

export const ESPADA = {
  nome: 'Espada',
  dano: 35,
  recarga: 0.6, // entre dois golpes
  durabilidade: 30, // segundos na mão até quebrar
  golpe: 0.26, // o movimento do golpe, de cima para a frente
};

export const ARCO = {
  nome: 'Arco',
  dano: 30,
  recarga: 0.9, // entre duas flechas
  durabilidade: 30,
  velocidade: 340, // da flecha, ao sair
  gravidade: 200, // a flecha cai um pouco no caminho
  alcance: 300, // some depois de voar isto
};

export const DADOS_ARMA: Record<TipoArma, { dano: number; recarga: number; durabilidade: number }> = {
  espada: ESPADA,
  arco: ARCO,
};

// As partes do corpo, pela altura do acerto acima dos pés (o corpo tem 30 px): a cabeça começa no
// queixo do sprite e os pés vão até o joelho. `dano`: quanto do dano da arma cada uma leva.
export type ZonaDoCorpo = 'cabeca' | 'corpo' | 'pes';
export const ZONAS = {
  cabeca: 18, // daqui para cima
  pes: 8, // abaixo disto
  dano: { cabeca: 1.5, corpo: 1, pes: 0.6 } as Record<ZonaDoCorpo, number>,
};

// A parte do corpo que um acerto a `altura` pixels acima dos pés pega.
export function zonaDoAcerto(altura: number): ZonaDoCorpo {
  if (altura >= ZONAS.cabeca) return 'cabeca';
  return altura < ZONAS.pes ? 'pes' : 'corpo';
}

// O dano de um acerto de `dano` na `zona`, arredondado.
export function danoNaZona(dano: number, zona: ZonaDoCorpo): number {
  return Math.round(dano * ZONAS.dano[zona]);
}

// Cabe mais uma caindo do céu? `noChao`: esperando no chão; `naMao`: com os personagens.
export function cabeOutraArma(noChao: number, naMao: number): boolean {
  return noChao < QUEDA_DE_ARMAS.noChao && noChao + naMao < QUEDA_DE_ARMAS.maximo;
}

// A próxima queda: qual arma e onde. `aleatorio` devolve de 0 a 1 (Math.random, ou um fixo nos testes).
export function sortearArma(aleatorio: () => number): { tipo: TipoArma; x: number } {
  const tipo = ARMAS[Math.min(ARMAS.length - 1, Math.floor(aleatorio() * ARMAS.length))];
  const { margem } = QUEDA_DE_ARMAS;
  return { tipo, x: Math.round(margem + aleatorio() * (MUNDO - 2 * margem)) };
}

// Segundos até a próxima tentativa de queda.
export function sortearIntervaloDeArma(aleatorio: () => number): number {
  const [min, max] = QUEDA_DE_ARMAS.intervalo;
  return min + aleatorio() * (max - min);
}
