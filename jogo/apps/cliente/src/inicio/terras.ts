// As terras de Terna: os biomas do mapa grande (a tela do mapa, mapa.ts) e os personagens de cada
// um, e os retratos dos personagens (a tela dos personagens, personagens.ts). Por enquanto só existe
// a Floresta da Divisa, o mapa da temporada 1; o resto do mapa grande fica coberto de nuvens.

import type { Heroi } from '@terna/compartilhado';
import urlFlorestaDaDivisa from '../assets/mapa/floresta-da-divisa.webp';
import urlRetratoGrow from '../assets/retratos/grow.webp';
import urlRetratoLeslie from '../assets/retratos/leslie.webp';
import { TEMPORADA } from './temporada';

// O retrato de cada personagem (de fontes/retratos-leslie-grow.png, um painel para cada). O Anjo,
// guardado até a atualização dele, ainda não tem.
export const RETRATO: Partial<Record<Heroi, string>> = { leslie: urlRetratoLeslie, grow: urlRetratoGrow };

// Um bioma no mapa grande: a arte vista de cima (de fontes/, quadrada), onde o centro dela fica no
// mapa (em pixels da arte; o mapa tem `MAPA_GRANDE` de tamanho) e os personagens que são dele.
export interface Bioma {
  nome: string;
  arte: string;
  lado: number; // largura e altura da arte, em pixels
  centro: { x: number; y: number };
  herois: readonly Heroi[];
}

// O mapa grande, em pixels da arte dos biomas: a Floresta da Divisa no meio e, em volta, as terras
// que ainda não apareceram (nuvens).
export const MAPA_GRANDE = { largura: 4200, altura: 3200 };

export const BIOMAS: readonly Bioma[] = [
  {
    nome: TEMPORADA.mapa,
    arte: urlFlorestaDaDivisa,
    lado: 1254,
    centro: { x: MAPA_GRANDE.largura / 2, y: MAPA_GRANDE.altura / 2 },
    herois: ['leslie', 'grow'],
  },
];

export const biomaDo = (heroi: Heroi): Bioma | undefined => BIOMAS.find((b) => b.herois.includes(heroi));
