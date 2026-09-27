// A luz de quem venceu: no fim por morte, um facho amarelo desce do céu sobre o vencedor, abre em
// meio segundo e fica: por trás dele, a coluna de luz com raios que tremulam e uma poça clara no
// chão; na frente, o brilho no corpo e faíscas douradas descendo devagar pelo facho.

const COR = '255, 226, 120';
const ABRIR = 0.6; // segundos para o facho abrir
const LARGURA = 26; // meia largura do facho aberto

// `x`, `yPes`: o vencedor; `ha`: segundos desde o fim.
export function desenharLuzAtras(ctx: CanvasRenderingContext2D, x: number, yPes: number, ha: number, tempo: number): void {
  const abre = Math.min(1, ha / ABRIR);
  const w = LARGURA * (0.3 + 0.7 * abre);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // A coluna, mais clara no meio.
  for (const [largura, forca] of [
    [w, 0.28],
    [w * 0.4, 0.25],
  ] as const) {
    const g = ctx.createLinearGradient(x - largura, 0, x + largura, 0);
    g.addColorStop(0, `rgba(${COR}, 0)`);
    g.addColorStop(0.5, `rgba(${COR}, ${forca * abre})`);
    g.addColorStop(1, `rgba(${COR}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(Math.floor(x - largura), 0, Math.ceil(largura * 2), yPes);
  }
  // Os raios, finos, tremulando dentro do facho.
  for (let i = 0; i < 4; i++) {
    const rx = Math.round(x + Math.sin(tempo * (0.9 + i * 0.37) + i * 1.9) * w * 0.55);
    ctx.fillStyle = `rgba(255, 244, 200, ${0.12 * abre * (0.6 + 0.4 * Math.sin(tempo * 3 + i))})`;
    ctx.fillRect(rx, 0, 1, yPes);
  }
  // A poça de luz no chão.
  const poca = ctx.createRadialGradient(x, yPes, 0, x, yPes, w * 1.2);
  poca.addColorStop(0, `rgba(${COR}, ${0.45 * abre})`);
  poca.addColorStop(1, `rgba(${COR}, 0)`);
  ctx.fillStyle = poca;
  ctx.fillRect(x - w * 1.2, yPes - 8, w * 2.4, 12);
  ctx.restore();
}

export function desenharLuzNaFrente(ctx: CanvasRenderingContext2D, x: number, yPes: number, alturaDoCorpo: number, ha: number, tempo: number): void {
  const abre = Math.min(1, ha / ABRIR);
  const cy = yPes - alturaDoCorpo / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const brilho = ctx.createRadialGradient(x, cy, 0, x, cy, alturaDoCorpo * 0.8);
  brilho.addColorStop(0, `rgba(${COR}, ${0.3 * abre * (0.85 + 0.15 * Math.sin(tempo * 3))})`);
  brilho.addColorStop(1, `rgba(${COR}, 0)`);
  ctx.fillStyle = brilho;
  ctx.fillRect(x - alturaDoCorpo, cy - alturaDoCorpo, alturaDoCorpo * 2, alturaDoCorpo * 2);
  // Faíscas descendo pelo facho, piscando.
  for (let i = 0; i < 16; i++) {
    const fy = (tempo * (22 + (i % 5) * 6) + i * 53) % yPes;
    const fx = Math.round(x + Math.sin(i * 2.1 + tempo * 1.2) * LARGURA * 0.6);
    const pisca = 0.5 + 0.5 * Math.sin(tempo * 7 + i * 1.3);
    ctx.fillStyle = `rgba(255, 246, 200, ${abre * pisca})`;
    ctx.fillRect(fx, Math.round(fy), 1, 1);
    if (i % 4 === 0 && pisca > 0.7) {
      ctx.fillRect(fx - 1, Math.round(fy), 3, 1);
      ctx.fillRect(fx, Math.round(fy) - 1, 1, 3);
    }
  }
  ctx.restore();
}
