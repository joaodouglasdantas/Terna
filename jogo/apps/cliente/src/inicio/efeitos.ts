// Peças de desenho dos efeitos dos menus (a logo viva e a cena da frente): folhas em pixel que
// caem balançando e virando, brilhos de quatro pontas e halos de luz. Tudo é medido em
// "unidades", o tamanho de um pixel da arte na tela, para os efeitos parecerem parte da arte e
// não quadradinhos soltos por cima dela.

import { contexto2d, novoCanvas } from '../motor/imagens';

type Rgb = [number, number, number];

function lerCor(cor: string): Rgb {
  const rgb = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(cor);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const n = parseInt(cor.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const texto = ([r, g, b]: Rgb, a = 1): string => `rgba(${r}, ${g}, ${b}, ${a})`;

// Clareia (fator > 1) ou escurece (< 1), puxando um pouco para o amarelo ao clarear: a luz do
// verão é quente.
function tom([r, g, b]: Rgb, fator: number): Rgb {
  const quente = fator > 1 ? (fator - 1) * 40 : 0;
  const f = (c: number, extra: number): number => Math.max(0, Math.min(255, Math.round(c * fator + extra)));
  return [f(r, quente), f(g, quente * 0.8), f(b, 0)];
}

// ---- halos ----

// O círculo de luz de cada cor fica pronto num canvas: desenhar a imagem é bem mais barato
// que montar um gradiente por partícula a cada quadro.
const halos = new Map<string, HTMLCanvasElement>();

function haloPronto(cor: string): HTMLCanvasElement {
  let canvas = halos.get(cor);
  if (!canvas) {
    canvas = novoCanvas(64, 64);
    const ctx = contexto2d(canvas);
    const rgb = lerCor(cor);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, texto(rgb, 1));
    g.addColorStop(0.18, texto(rgb, 0.6));
    g.addColorStop(0.45, texto(rgb, 0.18));
    g.addColorStop(1, texto(rgb, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    halos.set(cor, canvas);
  }
  return canvas;
}

export function desenharHalo(ctx: CanvasRenderingContext2D, cor: string, x: number, y: number, raio: number, alfa: number): void {
  if (alfa <= 0 || raio <= 0) return;
  ctx.globalAlpha = Math.min(1, alfa);
  ctx.drawImage(haloPronto(cor), x - raio, y - raio, raio * 2, raio * 2);
}

// ---- brilho de quatro pontas ----

// Uma cruz de pixels: o miolo branco e os braços, que crescem com `forca` (0 a 1) e vão
// apagando para a ponta. `u` é o tamanho de um pixel da arte na tela.
export function desenharBrilho(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  forca: number,
  cor: string,
  alfa = 1,
): void {
  if (forca <= 0 || alfa <= 0) return;
  const cx = Math.round(x - u / 2);
  const cy = Math.round(y - u / 2);
  const bracos = Math.max(1, Math.round(forca * 3));
  ctx.fillStyle = cor;
  for (let i = 1; i <= bracos; i++) {
    ctx.globalAlpha = alfa * forca * (1 - ((i - 1) / bracos) * 0.75);
    ctx.fillRect(cx + i * u, cy, u, u);
    ctx.fillRect(cx - i * u, cy, u, u);
    ctx.fillRect(cx, cy + i * u, u, u);
    ctx.fillRect(cx, cy - i * u, u, u);
  }
  // Em brilho forte, as diagonais também acendem um pixel: a cruz vira estrela.
  if (forca > 0.6) {
    ctx.globalAlpha = alfa * (forca - 0.6);
    ctx.fillRect(cx + u, cy + u, u, u);
    ctx.fillRect(cx - u, cy + u, u, u);
    ctx.fillRect(cx + u, cy - u, u, u);
    ctx.fillRect(cx - u, cy - u, u, u);
  }
  ctx.globalAlpha = alfa;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx, cy, u, u);
}

// ---- folhas ----

// Folhas em pixel, deitadas com a ponta para a direita: M é o verde da copa, C a parte que
// pega luz, N a nervura clara, E a borda na sombra e T o cabinho.
const DESENHOS = {
  pequena: ['.MM..', 'TNNNC', '.EEM.'],
  media: ['..MMC..', '.MCCMM.', 'TNNNNNC', '.EEMEE.'],
  grande: ['...MMC..', '..MCCMMC', 'TNNNNNNM', '.EEMMEE.', '...EE...'],
} as const;

export type TamanhoDeFolha = keyof typeof DESENHOS;

// A frente e as costas (mais escuras) da mesma folha: ela mostra uma ou outra enquanto vira.
export interface Folha {
  frente: HTMLCanvasElement;
  costas: HTMLCanvasElement;
}

const TALO: Rgb = [92, 60, 30];

function pintarFolha(desenho: readonly string[], base: Rgb, luz: number): HTMLCanvasElement {
  const canvas = novoCanvas(desenho[0].length, desenho.length);
  const ctx = contexto2d(canvas);
  const cores: Record<string, Rgb> = {
    M: tom(base, luz),
    C: tom(base, luz * 1.28),
    N: tom(base, luz * 1.5),
    E: tom(base, luz * 0.62),
    T: tom(TALO, luz),
  };
  desenho.forEach((linha, y) => {
    [...linha].forEach((simbolo, x) => {
      const cor = cores[simbolo];
      if (!cor) return;
      ctx.fillStyle = texto(cor);
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return canvas;
}

const folhas = new Map<string, Folha>();

export function folhaPronta(cor: string, tamanho: TamanhoDeFolha): Folha {
  const chave = `${cor}|${tamanho}`;
  let folha = folhas.get(chave);
  if (!folha) {
    const base = lerCor(cor);
    folha = { frente: pintarFolha(DESENHOS[tamanho], base, 1), costas: pintarFolha(DESENHOS[tamanho], base, 0.72) };
    folhas.set(chave, folha);
  }
  return folha;
}

// Desenha a folha centrada em (x, y), inclinada `angulo` e virando: `giro` é o ângulo da volta
// que ela dá no próprio eixo — de lado ela fica fina, e passando da metade mostra as costas.
export function desenharFolha(
  ctx: CanvasRenderingContext2D,
  folha: Folha,
  x: number,
  y: number,
  u: number,
  angulo: number,
  giro: number,
  alfa: number,
): void {
  const largura = Math.cos(giro);
  if (Math.abs(largura) < 0.12 || alfa <= 0) return;
  const imagem = largura > 0 ? folha.frente : folha.costas;
  ctx.globalAlpha = Math.min(1, alfa);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angulo);
  ctx.scale(u * largura, u);
  ctx.drawImage(imagem, -imagem.width / 2, -imagem.height / 2);
  ctx.restore();
}

// O movimento de uma folha caindo: balança como um pêndulo — rápida no meio do balanço, quase
// parada nas pontas, inclinando para o lado para onde vai — e às vezes rodopia.
export interface Queda {
  x: number;
  y: number;
  vento: number; // deriva para o lado, px/s (negativo: para a esquerda)
  descida: number; // px/s no meio do balanço
  balanco: number; // amplitude do pêndulo, px
  ritmo: number; // rad/s
  fase: number;
  giro: number;
  rodopio: number; // rad/s da volta no próprio eixo
  vida: number;
}

export function cair(q: Queda, dt: number, rajada = 1): void {
  q.vida += dt;
  const a = q.vida * q.ritmo + q.fase;
  q.x += (q.vento * rajada + Math.cos(a) * q.balanco * q.ritmo) * dt;
  q.y += q.descida * (0.3 + 0.7 * Math.abs(Math.cos(a))) * dt;
  q.giro += q.rodopio * dt;
}

export const inclinacao = (q: Queda): number => Math.cos(q.vida * q.ritmo + q.fase) * 0.55;
