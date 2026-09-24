// Os quadros vêm de assets/personagem.png, gerado a partir de fontes/SpriteBase.png por
// ferramentas/gerar-personagem.cjs. Personagem desenhado virado para a direita.

import urlPersonagem from '../assets/personagem.png';
import { QUADROS_PERSONAGEM } from '../gerado/personagem-quadros';
import { carregarImagem, contexto2d, novoCanvas } from '../motor/imagens';
import type { Sprite } from '../motor/tipos';

export type NomeAnimacao = keyof typeof QUADROS_PERSONAGEM;
export type AnimacoesPersonagem = Record<NomeAnimacao, Sprite[]>;

export async function carregarAnimacoesPersonagem(): Promise<AnimacoesPersonagem> {
  const folha = await carregarImagem(urlPersonagem);
  const animacoes = {} as AnimacoesPersonagem;
  (Object.entries(QUADROS_PERSONAGEM) as [NomeAnimacao, (typeof QUADROS_PERSONAGEM)[NomeAnimacao]][]).forEach(
    ([nome, quadros]) => {
      animacoes[nome] = quadros.map((q) => {
        const canvas = novoCanvas(q.w, q.h);
        contexto2d(canvas).drawImage(folha, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
        return { imagem: canvas, eixo: q.ax };
      });
    },
  );
  return animacoes;
}
