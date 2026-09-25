// O braço que o personagem estica por cima do sprite: soltando um poder (o anjo) e segurando ou
// usando uma arma (a forma base). Sai do ombro da frente, de lado, e vai pixel a pixel na direção
// pedida, com 2 px de grossura: a cor de cima e a sombra embaixo, e a mão na ponta.

// De lado, o ombro da frente fica 2 px à frente do eixo e 16 px acima dos pés.
export const OMBRO = { frente: 2, altura: 16 };

export interface CoresBraco {
  cima: string;
  sombra: string;
  mao: string;
}

// O anjo, sem roupa: pele clara e a mão branca (com o brilho rosa do poder, desenhado à parte).
export const BRACO_ANJO: CoresBraco = { cima: '#f6d3bd', sombra: '#bf8872', mao: '#ffffff' };
// A forma base: a manga do moletom preto e a mão, nas cores do próprio sprite.
export const BRACO_BASE: CoresBraco = { cima: '#252228', sombra: '#100c0f', mao: '#ac7c69' };

export interface Ponto {
  x: number;
  y: number;
}

// O ombro da frente, em pixels inteiros do mapa.
export function ombroDe(c: { x: number; y: number; direcao: 1 | -1 }): Ponto {
  return { x: Math.round(c.x) + c.direcao * OMBRO.frente, y: Math.round(c.y) - OMBRO.altura };
}

// O ângulo no mapa de um ângulo "do corpo": 0 = para a frente, positivo = para baixo. Assim uma
// pose vale para os dois lados.
export function anguloNoMapa(angulo: number, direcao: 1 | -1): number {
  return direcao === 1 ? angulo : Math.PI - angulo;
}

// Desenha o braço (sem a mão, com `comprimento` < 2 não desenha nada) e devolve a ponta dele.
export function desenharBracoEsticado(
  ctx: CanvasRenderingContext2D,
  ombro: Ponto,
  angulo: number,
  comprimento: number,
  cores: CoresBraco,
): Ponto {
  const cos = Math.cos(angulo);
  const sin = Math.sin(angulo);
  if (comprimento >= 2) {
    for (let i = 0; i < comprimento; i++) {
      const x = Math.round(ombro.x + cos * i);
      const y = Math.round(ombro.y + sin * i);
      ctx.fillStyle = cores.sombra;
      ctx.fillRect(x, y + 1, 1, 1);
      ctx.fillStyle = cores.cima;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { x: ombro.x + cos * comprimento, y: ombro.y + sin * comprimento };
}

// A mão, 2×2, na ponta do braço.
export function desenharMao(ctx: CanvasRenderingContext2D, mao: Ponto, cores: CoresBraco): void {
  ctx.fillStyle = cores.mao;
  ctx.fillRect(Math.round(mao.x) - 1, Math.round(mao.y) - 1, 2, 2);
}
