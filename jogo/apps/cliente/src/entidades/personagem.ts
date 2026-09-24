// Os quadros vêm de assets/personagem.png (forma base) e assets/personagem-anjo.png (forma de
// anjo, com os quadros nos mesmos lugares), gerados a partir de fontes/SpriteBase.png por
// ferramentas/gerar-personagem.cjs. Personagem desenhado virado para a direita.

import urlPersonagem from '../assets/personagem.png';
import urlPersonagemAnjo from '../assets/personagem-anjo.png';
import { QUADROS_PERSONAGEM } from '../gerado/personagem-quadros';
import { carregarImagem, contexto2d, novoCanvas } from '../motor/imagens';
import type { Sprite } from '../motor/tipos';

export type NomeAnimacao = keyof typeof QUADROS_PERSONAGEM;
export type AnimacoesPersonagem = Record<NomeAnimacao, Sprite[]>;
export type Forma = 'base' | 'anjo';

// Âncoras da forma de anjo, em pixels dentro do recorte (ver o gerador).
export interface QuadroPersonagem {
  w: number;
  h: number;
  olhos: readonly (readonly number[])[];
  ombro: readonly number[];
  tarja: readonly number[]; // x, y, largura e altura do mosaico sobre o quadril
  meio?: number; // de frente: eixo do corpo, a coluna x se espelha em meio − x
}

export function quadroPersonagem(animacao: NomeAnimacao, quadro: number): QuadroPersonagem {
  return QUADROS_PERSONAGEM[animacao][quadro];
}

// `anjo`: usa o eixo do sprite do anjo — de lado a cabeça dele recua, e o eixo recua junto para
// a cabeça ficar no mesmo ponto do mapa nas duas formas.
function recortar(folha: HTMLImageElement, anjo: boolean): AnimacoesPersonagem {
  const animacoes = {} as AnimacoesPersonagem;
  (Object.entries(QUADROS_PERSONAGEM) as [NomeAnimacao, (typeof QUADROS_PERSONAGEM)[NomeAnimacao]][]).forEach(
    ([nome, quadros]) => {
      animacoes[nome] = quadros.map((q) => {
        const canvas = novoCanvas(q.w, q.h);
        contexto2d(canvas).drawImage(folha, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
        return { imagem: canvas, eixo: anjo ? q.axAnjo : q.ax };
      });
    },
  );
  return animacoes;
}

export async function carregarAnimacoesPersonagem(): Promise<Record<Forma, AnimacoesPersonagem>> {
  const [base, anjo] = await Promise.all([carregarImagem(urlPersonagem), carregarImagem(urlPersonagemAnjo)]);
  return { base: recortar(base, false), anjo: recortar(anjo, true) };
}
