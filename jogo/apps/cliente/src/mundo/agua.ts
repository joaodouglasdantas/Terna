// A água da paisagem de fundo, viva: o rio e os córregos brilham em ondinhas que correm, com um
// reflexo branco piscando de vez em quando (mais vezes e mais forte com o sol limpo e alto); as
// cascatas descem em listras claras. Os pixels de
// água vêm do gerador (QUADROS_CENARIO.agua, achados pela cor na arte); aqui a paisagem é copiada
// para um canvas próprio e só esses pixels são repintados, umas 20 vezes por segundo.

import { QUADROS_CENARIO } from '../gerado/cenario-quadros';
import { contexto2d, novoCanvas } from '../motor/imagens';
import { realcarPaisagem } from './realce';

const PASSO = 1 / 20; // segundos entre uma repintura e outra
const CLARO = [206, 234, 255];
const ESPUMA = [246, 251, 255];

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D;
let quadro: ImageData;
let base: Uint8ClampedArray; // as cores da arte, sem animação
let agua: Int32Array; // [índice no quadro, x, y, tipo] por pixel de água
let caixa = { x: 0, y: 0, w: 0, h: 0 }; // o retângulo em volta da água: só ele é repintado
let ultimo = -Infinity;

function preparar(folha: CanvasImageSource): void {
  const { x, y, w, h } = QUADROS_CENARIO.paisagem;
  canvas = novoCanvas(w, h);
  ctx = contexto2d(canvas);
  ctx.drawImage(folha, x, y, w, h, 0, 0, w, h);
  quadro = ctx.getImageData(0, 0, w, h);
  realcarPaisagem(quadro); // as cores e o relevo acertados uma vez (realce.ts)
  ctx.putImageData(quadro, 0, 0);
  base = Uint8ClampedArray.from(quadro.data);
  const lista: number[] = [];
  for (const [fy, fx, n, tipo] of QUADROS_CENARIO.agua) {
    for (let k = 0; k < n; k++) lista.push((fy * w + fx + k) * 4, fx + k, fy, tipo);
  }
  agua = Int32Array.from(lista);
  let [x0, y0, x1, y1] = [w, h, 0, 0];
  for (let p = 0; p < agua.length; p += 4) {
    x0 = Math.min(x0, agua[p + 1]);
    x1 = Math.max(x1, agua[p + 1] + 1);
    y0 = Math.min(y0, agua[p + 2]);
    y1 = Math.max(y1, agua[p + 2] + 1);
  }
  caixa = x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}

// Um sorteio fixo por ponto (e por instante, quando `t` muda).
function acaso(x: number, y: number, t: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + t * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

function misturar(d: Uint8ClampedArray, i: number, cor: readonly number[], k: number): void {
  d[i] = base[i] + (cor[0] - base[i]) * k;
  d[i + 1] = base[i + 1] + (cor[1] - base[i + 1]) * k;
  d[i + 2] = base[i + 2] + (cor[2] - base[i + 2]) * k;
}

// A água mais escura (a sombra da onda e a da cascata): a cor da arte vezes `r`, `g`, `b`.
function escurecer(d: Uint8ClampedArray, i: number, r: number, g: number, b: number): void {
  d[i] = base[i] * r;
  d[i + 1] = base[i + 1] * g;
  d[i + 2] = base[i + 2] * b;
}

function animar(t: number, sol: number): void {
  const d = quadro.data;
  const piscada = Math.floor(t * 3);
  for (let p = 0; p < agua.length; p += 4) {
    const i = agua[p];
    const x = agua[p + 1];
    const y = agua[p + 2];
    const tipo = agua[p + 3];
    if (tipo === 2) {
      // Cascata: listras claras descendo, cada coluna no seu passo.
      const fase = (y - t * 32) / 5 + acaso(x, 0, 0) * 3;
      const f = fase - Math.floor(fase);
      if (f < 0.35) misturar(d, i, ESPUMA, 0.75);
      else if (f > 0.82) escurecer(d, i, 0.8, 0.85, 0.9);
      else misturar(d, i, ESPUMA, 0);
      continue;
    }
    // Rio: duas ondas cruzadas correndo; onde as duas sobem juntas, o brilho da água.
    const onda = Math.sin(x * 0.45 - t * 2.4 + y * 1.3) + 0.8 * Math.sin(x * 0.13 + t * 1.1 - y * 0.4);
    if (acaso(x, y, piscada) > 0.997 - 0.006 * sol) misturar(d, i, ESPUMA, 0.9);
    else if (onda > 1.35) misturar(d, i, CLARO, 0.4 + 0.25 * sol);
    else if (onda > 1.0) misturar(d, i, CLARO, 0.22);
    else if (onda < -1.45) escurecer(d, i, 0.82, 0.86, 0.92);
    else misturar(d, i, CLARO, 0);
  }
  // Só o retângulo da água volta para a imagem (o resto da paisagem não muda).
  ctx.putImageData(quadro, 0, 0, caixa.x, caixa.y, caixa.w, caixa.h);
}

// A paisagem com a água no instante `tempo` (segundos). `sol`: 0–1, o quanto o sol bate (a água
// cintila mais com ele forte).
export function paisagemViva(folha: CanvasImageSource, tempo: number, sol = 0): HTMLCanvasElement {
  if (!canvas) preparar(folha);
  if (tempo - ultimo >= PASSO || tempo < ultimo) {
    animar(tempo, sol);
    ultimo = tempo;
  }
  return canvas!;
}
