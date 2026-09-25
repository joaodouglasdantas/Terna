// Efeitos do dash e do pulo duplo, nas duas formas: ficam no mapa (não seguem o corpo) e se
// desenham atrás dele.
//
// - Dash: enquanto dura, o corpo deixa cópias claras de si para trás, que somem rápido; se
//   saiu do chão, os pés levantam um punhado de poeira para o lado de onde ele veio.
// - Pulo duplo: um anel de ar se abre sob os pés, com uns fiapos caindo dele.

import { contexto2d, novoCanvas } from '../motor/imagens';
import type { Forma } from './personagem';
import type { Pose } from './anjo';

interface Fantasma {
  imagem: HTMLCanvasElement; // já tingida
  eixo: number;
  x: number;
  topo: number;
  direcao: 1 | -1;
  vida: number;
}

// Um pontinho solto: poeira do dash ou fiapo do anel.
interface Grao {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  total: number;
}

interface Anel {
  x: number;
  y: number;
  vida: number;
}

export interface Rastro {
  fantasmas: Fantasma[];
  graos: Grao[];
  aneis: Anel[];
  ateOFantasma: number; // segundos até a próxima cópia, durante o dash
}

const FANTASMA = {
  intervalo: 0.035, // segundos entre uma cópia e outra — ~4 num dash
  vida: 0.22, // segundos até sumir
  alfa: 0.65, // a cópia recém-deixada
};
// A cor das cópias: azul-claro na forma base, dourado-claro no anjo. A tinta cobre o sprite
// quase todo, deixando só um resto do sombreado para a silhueta ainda ler como o personagem.
const TINTA: Record<Forma, string> = { base: 'rgba(200, 230, 255, 0.8)', anjo: 'rgba(255, 236, 170, 0.8)' };
const ANEL = { vida: 0.28, raio: [3, 12], altura: [1, 3], pontos: 18 };
const COR_AR = '255, 255, 255';

export function criarRastro(): Rastro {
  return { fantasmas: [], graos: [], aneis: [], ateOFantasma: 0 };
}

// Uma cópia tingida por sprite e forma, feita uma vez.
const tingidos = new Map<Forma, WeakMap<HTMLCanvasElement, HTMLCanvasElement>>();

function tingido(imagem: HTMLCanvasElement, forma: Forma): HTMLCanvasElement {
  let daForma = tingidos.get(forma);
  if (!daForma) tingidos.set(forma, (daForma = new WeakMap()));
  const pronto = daForma.get(imagem);
  if (pronto) return pronto;

  const canvas = novoCanvas(imagem.width, imagem.height);
  const ctx = contexto2d(canvas);
  ctx.drawImage(imagem, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = TINTA[forma];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  daForma.set(imagem, canvas);
  return canvas;
}

function deixarFantasma(r: Rastro, pose: Pose, forma: Forma): void {
  const { imagem, eixo, x, topo, direcao } = pose;
  r.fantasmas.push({ imagem: tingido(imagem, forma), eixo, x, topo, direcao, vida: FANTASMA.vida });
}

function soltarGrao(r: Rastro, x: number, y: number, vx: number, vy: number, total: number): void {
  r.graos.push({ x, y, vx, vy, vida: total, total });
}

// O dash começou: a primeira cópia sai já, e no chão os pés chutam a poeira para trás.
export function marcarDash(r: Rastro, pose: Pose, forma: Forma, xPes: number, yPes: number, noChao: boolean): void {
  deixarFantasma(r, pose, forma);
  r.ateOFantasma = FANTASMA.intervalo;
  if (!noChao) return;
  for (let i = 0; i < 6; i++) {
    soltarGrao(
      r,
      xPes - pose.direcao * (2 + Math.random() * 4),
      yPes - Math.random() * 2,
      -pose.direcao * (15 + Math.random() * 30),
      -(8 + Math.random() * 18),
      0.25 + Math.random() * 0.15,
    );
  }
}

export function marcarPuloDuplo(r: Rastro, xPes: number, yPes: number): void {
  r.aneis.push({ x: xPes, y: yPes, vida: ANEL.vida });
  for (let i = 0; i < 6; i++) {
    const lado = i % 2 === 0 ? 1 : -1;
    soltarGrao(r, xPes + lado * (2 + Math.random() * 4), yPes, lado * (12 + Math.random() * 18), 10 + Math.random() * 15, 0.3);
  }
}

export function atualizarRastro(r: Rastro, dt: number, emDash: boolean, pose: Pose, forma: Forma): void {
  if (emDash) {
    r.ateOFantasma -= dt;
    if (r.ateOFantasma <= 0) {
      deixarFantasma(r, pose, forma);
      r.ateOFantasma += FANTASMA.intervalo;
    }
  }
  for (const f of r.fantasmas) f.vida -= dt;
  r.fantasmas = r.fantasmas.filter((f) => f.vida > 0);

  for (const g of r.graos) {
    g.vida -= dt;
    g.vy += 60 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
  }
  r.graos = r.graos.filter((g) => g.vida > 0);

  for (const a of r.aneis) a.vida -= dt;
  r.aneis = r.aneis.filter((a) => a.vida > 0);
}

// Em coordenadas do mapa, antes do corpo.
export function desenharRastro(ctx: CanvasRenderingContext2D, r: Rastro): void {
  ctx.save();
  for (const f of r.fantasmas) {
    ctx.globalAlpha = FANTASMA.alfa * (f.vida / FANTASMA.vida);
    if (f.direcao === -1) {
      ctx.save();
      ctx.translate(f.x + f.eixo, f.topo);
      ctx.scale(-1, 1);
      ctx.drawImage(f.imagem, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(f.imagem, f.x - f.eixo, f.topo);
    }
  }
  ctx.restore();

  for (const a of r.aneis) {
    // Abre rápido e vai desacelerando, sumindo junto.
    const k = 1 - (a.vida / ANEL.vida) ** 2;
    const rx = ANEL.raio[0] + (ANEL.raio[1] - ANEL.raio[0]) * k;
    const ry = ANEL.altura[0] + (ANEL.altura[1] - ANEL.altura[0]) * k;
    ctx.fillStyle = `rgba(${COR_AR}, ${0.85 * (1 - k)})`;
    for (let i = 0; i < ANEL.pontos; i++) {
      const t = (i / ANEL.pontos) * Math.PI * 2;
      ctx.fillRect(Math.round(a.x + Math.cos(t) * rx), Math.round(a.y + Math.sin(t) * ry), 1, 1);
    }
  }

  for (const g of r.graos) {
    ctx.fillStyle = `rgba(${COR_AR}, ${0.7 * (g.vida / g.total)})`;
    ctx.fillRect(Math.round(g.x), Math.round(g.y), 1, 1);
  }
}
