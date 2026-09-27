// As águias da Revoada do Grow: águias-carecas grandes (uns 25 px com as asas em cima), da folha
// "ÁGUIA - MOVIMENTO" (fontes/aguia.png, recortada por ferramentas/gerar-herois.cjs em
// assets/grow/aguia.png): oito quadros batendo as asas e seis planando, de asas esticadas. Olham
// para a direita; para a esquerda, o quadro é espelhado.

import urlAguia from '../../assets/grow/aguia.png';
import { QUADROS_AGUIA } from '../../gerado/aguia-quadros';
import { carregarImagem, contexto2d, novoCanvas } from '../../motor/imagens';
import type { Sprite } from '../../motor/tipos';

let voo: Sprite[] = [];
let planando: Sprite[] = [];

function recortar(folha: HTMLImageElement, tabela: readonly { x: number; y: number; w: number; h: number; ax: number }[]): Sprite[] {
  return tabela.map((q) => {
    const canvas = novoCanvas(q.w, q.h);
    contexto2d(canvas).drawImage(folha, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
    return { imagem: canvas, eixo: q.ax };
  });
}

export async function carregarAguias(): Promise<void> {
  const folha = await carregarImagem(urlAguia);
  voo = recortar(folha, QUADROS_AGUIA.voo);
  planando = recortar(folha, QUADROS_AGUIA.planando);
}

// Uma águia com o meio do corpo em (x, y), olhando para `lado`. `fase` corre com o tempo (1 = uma
// batida de asas; planando, uma volta do leve balanço das asas).
export function desenharAguia(ctx: CanvasRenderingContext2D, x: number, y: number, lado: 1 | -1, fase: number, plana = false): void {
  const quadros = plana ? planando : voo;
  if (!quadros.length) return;
  const i = (((Math.floor(fase * quadros.length) % quadros.length) + quadros.length) % quadros.length);
  const { imagem, eixo } = quadros[i];
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y - imagem.height / 2));
  ctx.scale(lado, 1);
  ctx.drawImage(imagem, -eixo, 0);
  ctx.restore();
}
