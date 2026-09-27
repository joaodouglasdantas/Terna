// As bordas da sua tela contam o que está acontecendo com o seu personagem: acabou de apanhar,
// piscam em vermelho (mais forte quanto maior o golpe); envenenado, ficam verdes, pulsando, e
// cada gotinha do veneno pisca; preso pelas raízes, marrons; carregado pelas águias, azul-claro
// do céu; curado, um verde-claro. (Enfeitiçado, a borda rosa vem de anjo/poderes.ts.) Com a tela
// dividida, só a metade que é sua.

import type { Personagem } from '../entidades/personagem';

export interface Bordas {
  vidaAntes: number;
  dano: number; // força do vermelho, de 0 a 1, sumindo
  gota: number; // o verde da gotinha de veneno, sumindo
  cura: number;
}

export function criarBordas(): Bordas {
  return { vidaAntes: Infinity, dano: 0, gota: 0, cura: 0 };
}

// A vida do quadro anterior contra a de agora: perdeu (golpe ou veneno) ou ganhou.
export function sentirBordas(b: Bordas, p: Personagem, dt: number): void {
  b.dano = Math.max(0, b.dano - dt * 2.2);
  b.gota = Math.max(0, b.gota - dt * 3);
  b.cura = Math.max(0, b.cura - dt * 1.6);
  const perdeu = b.vidaAntes - p.vida;
  if (perdeu > 0 && Number.isFinite(perdeu)) {
    // Envenenado, a perda pequena é a gotinha; o resto é golpe.
    if (p.veneno > 0 && perdeu <= 8) b.gota = 1;
    else b.dano = Math.min(1, Math.max(b.dano, 0.45 + perdeu / 150));
  } else if (perdeu < 0 && Number.isFinite(perdeu)) {
    b.cura = 1;
  }
  b.vidaAntes = p.vida;
}

function borda(ctx: CanvasRenderingContext2D, rgb: string, forca: number, x: number, w: number, altura: number): void {
  if (forca <= 0.01) return;
  const cx = x + w / 2;
  const cy = altura / 2;
  const g = ctx.createRadialGradient(cx, cy, Math.min(w, altura) * 0.42, cx, cy, Math.hypot(w, altura) * 0.56);
  g.addColorStop(0, `rgba(${rgb}, 0)`);
  g.addColorStop(1, `rgba(${rgb}, ${Math.min(0.75, forca)})`);
  ctx.fillStyle = g;
  ctx.fillRect(x, 0, w, altura);
}

// `x` e `w`: o pedaço da tela que é seu (a tela toda, ou a sua metade).
export function desenharBordas(ctx: CanvasRenderingContext2D, b: Bordas, p: Personagem, x: number, w: number, altura: number, tempo: number): void {
  if (p.vida <= 0) return;
  const pulso = 0.75 + 0.25 * Math.sin(tempo * 6);
  ctx.save();
  if (p.levado > 0) borda(ctx, '200, 232, 255', 0.4, x, w, altura);
  if (p.preso > 0) borda(ctx, '130, 76, 28', 0.65 * Math.min(1, p.preso / 0.3), x, w, altura);
  if (p.veneno > 0 || b.gota > 0) borda(ctx, '120, 210, 50', (p.veneno > 0 ? 0.42 * pulso : 0) + 0.35 * b.gota, x, w, altura);
  borda(ctx, '190, 255, 170', 0.4 * b.cura, x, w, altura);
  borda(ctx, '230, 30, 40', 0.7 * b.dano, x, w, altura);
  ctx.restore();
}
