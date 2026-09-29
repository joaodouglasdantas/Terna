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

// Onde fica o rosto em cada retrato, em pixels da arte (os painéis têm 477 de largura): o meio dele
// e a linha dos olhos. Os cartões da tela dos personagens e os quadrinhos do mapa enquadram por
// aqui: as cabeças ficam na mesma altura e do mesmo tamanho nos dois.
const LARGURA_DO_RETRATO = 477;
const ROSTO: Partial<Record<Heroi, { x: number; olhos: number }>> = {
  leslie: { x: 268, olhos: 530 },
  grow: { x: 214, olhos: 600 },
};

// Põe o retrato de `heroi` em `img`, que fica dentro de uma moldura (position relative, overflow
// hidden) de altura = largura × `aspecto`: a moldura mostra `janela` pixels da arte de largura,
// com o rosto no meio e os olhos a `olhosEm` (fração) da altura.
export function enquadrarRetrato(img: HTMLImageElement, heroi: Heroi, janela: number, olhosEm: number, aspecto: number): void {
  const url = RETRATO[heroi];
  const rosto = ROSTO[heroi];
  if (!url || !rosto) return;
  img.src = url;
  img.style.width = `${(LARGURA_DO_RETRATO / janela) * 100}%`;
  img.style.left = `${(-(rosto.x - janela / 2) / janela) * 100}%`;
  img.style.top = `${(olhosEm - rosto.olhos / (janela * aspecto)) * 100}%`;
}

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
