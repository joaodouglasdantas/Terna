// O pedregulho da Pedra do golem: uma pedra enorme (uns 26 px de lado a lado, quase do tamanho de
// gente), de contorno irregular, com a luz vindo de cima, faces e rachaduras, e musgo por cima.
// A luz fica parada e a pedra (com o musgo e as rachaduras) gira: cada ângulo é desenhado uma vez,
// pixel a pixel, e guardado.

import { contexto2d, novoCanvas } from '../../motor/imagens';
import { MUSGO, PEDRA } from './golem';

const RAIO = 12.5;
const TAM = 29;
const ANGULOS = 24;
const LUZ = normalizar([-0.45, -0.65, 0.62]);
const prontos: (HTMLCanvasElement | undefined)[] = [];

function normalizar(v: number[]): number[] {
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
}

// Um sorteio fixo por ponto da pedra (a textura não pisca quando ela gira).
function acaso(u: number, v: number): number {
  const s = Math.sin(Math.round(u) * 12.9898 + Math.round(v) * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// O contorno: um círculo amassado, sempre o mesmo na pedra.
const raioNo = (a: number): number => RAIO * (1 + 0.07 * Math.sin(3 * a + 1.3) + 0.05 * Math.sin(5 * a + 0.4) + 0.03 * Math.sin(9 * a + 2));

// As rachaduras, no espaço da pedra: segmentos (u0, v0) → (u1, v1).
const RACHADURAS = [
  [-7, 1, -1, 4],
  [-1, 4, 3, 9],
  [2, -3, 8, 1],
  [-3, -1, 1, -2],
];

function naRachadura(u: number, v: number): boolean {
  return RACHADURAS.some(([u0, v0, u1, v1]) => {
    const [du, dv] = [u1 - u0, v1 - v0];
    const t = Math.max(0, Math.min(1, ((u - u0) * du + (v - v0) * dv) / (du * du + dv * dv)));
    return Math.hypot(u - (u0 + du * t), v - (v0 + dv * t)) < 0.55;
  });
}

function desenharAngulo(giro: number): HTMLCanvasElement {
  const canvas = novoCanvas(TAM, TAM);
  const ctx = contexto2d(canvas);
  const c = (TAM - 1) / 2;
  const [cos, sin] = [Math.cos(-giro), Math.sin(-giro)];
  for (let py = 0; py < TAM; py++) {
    for (let px = 0; px < TAM; px++) {
      const dx = px - c;
      const dy = py - c;
      const d = Math.hypot(dx, dy);
      // No espaço da pedra (gira com ela).
      const u = dx * cos - dy * sin;
      const v = dx * sin + dy * cos;
      const r = raioNo(Math.atan2(v, u));
      if (d > r) continue;
      let cor: string;
      if (d > r - 1.1) {
        cor = PEDRA.funda; // o contorno
      } else {
        const nz = Math.sqrt(Math.max(0, 1 - (d / r) ** 2));
        // As faces da pedra: a luz muda um pouco de uma para outra.
        const face = 0.18 * Math.sin(u * 0.55 + v * 0.3) + 0.12 * Math.sin(v * 0.7 - u * 0.2) + 0.1 * (acaso(u / 2, v / 2) - 0.5);
        const luz = (dx / r) * LUZ[0] + (dy / r) * LUZ[1] + nz * LUZ[2] + face;
        // O musgo cresce no "alto" da pedra (no espaço dela), em tufos.
        const musgo = v < -RAIO * 0.3 + 3 * Math.sin(u * 0.6) && acaso(u / 1.5, v / 1.5) > 0.3;
        if (musgo) {
          cor = luz > 0.75 ? MUSGO.claro : luz > 0.35 ? MUSGO.medio : MUSGO.escuro;
        } else if (naRachadura(u, v)) {
          cor = PEDRA.funda;
        } else {
          cor = luz > 0.95 ? PEDRA.luz : luz > 0.6 ? PEDRA.clara : luz > 0.25 ? PEDRA.media : luz > -0.1 ? PEDRA.escura : PEDRA.funda;
        }
      }
      ctx.fillStyle = cor;
      ctx.fillRect(px, py, 1, 1);
    }
  }
  return canvas;
}

// Com o centro em (x, y), girada de `giro` radianos.
export function desenharPedregulho(ctx: CanvasRenderingContext2D, x: number, y: number, giro: number): void {
  const i = ((Math.round((giro / (Math.PI * 2)) * ANGULOS) % ANGULOS) + ANGULOS) % ANGULOS;
  const imagem = (prontos[i] ??= desenharAngulo((i / ANGULOS) * Math.PI * 2));
  ctx.drawImage(imagem, Math.round(x) - (TAM >> 1), Math.round(y) - (TAM >> 1));
}

export const RAIO_DO_PEDREGULHO = RAIO;
