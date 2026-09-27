// A contagem antes da partida: 3, 2, 1 bem grandes no meio da tela, cada número pulando de
// grande para o tamanho dele e sumindo no fim do segundo; depois, "LUTEM!" por um instante. Com a
// fonte do jogo ampliada em pixels inteiros e uma sombra escura embaixo.

import { textoEmPixels } from '../motor/fonte';

const COR = '#fff1c9';
const COR_LUTEM = '#ffd966';
const SOMBRA = '#3a1420';
const LUTEM = 0.8; // segundos que o "LUTEM!" fica
const ESCALA = 7; // o número assentado
const PULO = 4; // quanto maior ele nasce

function desenharTexto(ctx: CanvasRenderingContext2D, texto: string, cor: string, escala: number, alfa: number, cx: number, cy: number): void {
  const img = textoEmPixels(texto, cor);
  const sombra = textoEmPixels(texto, SOMBRA);
  const w = img.width * escala;
  const h = img.height * escala;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alfa * 0.7;
  ctx.drawImage(sombra, x, y + Math.ceil(escala / 2), w, h);
  ctx.globalAlpha = alfa;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

// `contagem`: segundos que faltam; `depois`: segundos desde que ela acabou (negativo antes).
export function desenharContagem(ctx: CanvasRenderingContext2D, contagem: number, depois: number, largura: number, altura: number): void {
  const cx = largura / 2;
  const cy = altura * 0.4;
  if (contagem > 0) {
    // Um véu escuro de leve: a atenção vai para o número.
    ctx.fillStyle = 'rgba(10, 8, 20, 0.18)';
    ctx.fillRect(0, 0, largura, altura);
    const numero = Math.ceil(contagem);
    const t = 1 - (contagem - (numero - 1)); // 0 → 1 ao longo do segundo deste número
    const escala = Math.round(ESCALA + PULO * Math.max(0, 1 - t / 0.15));
    const alfa = t > 0.8 ? (1 - t) / 0.2 : Math.min(1, t / 0.08);
    desenharTexto(ctx, String(numero), COR, escala, alfa, cx, cy);
    return;
  }
  if (depois < 0 || depois > LUTEM) return;
  const t = depois / LUTEM;
  const escala = Math.round(5 + 2 * Math.max(0, 1 - t / 0.2));
  desenharTexto(ctx, 'LUTEM!', COR_LUTEM, escala, t > 0.6 ? (1 - t) / 0.4 : 1, cx, cy);
}
