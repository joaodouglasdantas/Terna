// O braço que o personagem estica por cima do sprite: soltando um poder e segurando ou usando
// uma arma. Sai do ombro da frente, de lado, e vai pixel a pixel na direção
// pedida, com 2 px de grossura: a cor de cima e a sombra embaixo, e a mão na ponta.

// De lado, o ombro da frente fica 2 px à frente do eixo e 16 px acima dos pés.
export const OMBRO = { frente: 2, altura: 16 };

// O Grow, de gente, ataca com a mão de trás: o braço desenhado — a arma e o soco — sai do ombro
// de trás, passa por trás do corpo (é desenhado antes do sprite) e aparece na frente do peito;
// para alcançar o mesmo ponto, fica `maisBraco` mais comprido. (O cajado, nessa hora, vai nas
// costas: entidades/grow/cajado.ts.)
export interface ComOmbro {
  x: number;
  y: number;
  direcao: 1 | -1;
  maoLivreAtras?: boolean;
}
export const maisBraco = (c: ComOmbro): number => (c.maoLivreAtras ? 2 * OMBRO.frente : 0);

export interface CoresBraco {
  cima: string;
  sombra: string;
  mao: string;
}

// O anjo, sem roupa: pele clara e a mão branca (com o brilho rosa do poder, desenhado à parte).
export const BRACO_ANJO: CoresBraco = { cima: '#f6d3bd', sombra: '#bf8872', mao: '#ffffff' };
// A Leslie: o braço de pele, nas cores do próprio sprite dela.
export const BRACO_LESLIE: CoresBraco = { cima: '#d8a37d', sombra: '#966548', mao: '#f3c69c' };
// O Grow: o braço magro de pele, nas cores do próprio sprite dele.
export const BRACO_GROW: CoresBraco = { cima: '#b18874', sombra: '#6e4a3a', mao: '#d2a58a' };
// A forma base do Anjo: a manga do moletom preto e a mão, nas cores do próprio sprite.
export const BRACO_BASE: CoresBraco = { cima: '#252228', sombra: '#100c0f', mao: '#ac7c69' };

// O braço do soco é mais grosso e mais trabalhado que o das armas (armas.ts): contorno escuro,
// três tons, a manga saindo do ombro, uma faixa (o punho do casaco, a pulseira de folhas) e o punho
// fechado, com os nós dos dedos, o vinco entre eles e o dedão por cima. Nas cores de cada sprite.
interface Tons {
  luz: string;
  cima: string;
  sombra: string;
}
export interface CoresSoco {
  contorno: string;
  braco: Tons; // o antebraço
  manga?: Tons & { ate: number }; // do ombro até `ate` px (mais grossa que o braço)
  // A faixa: logo depois da manga, ou (`noPulso`) encostada no punho.
  faixa?: { cima: string; sombra: string; noPulso?: boolean };
  mao: Tons & { brilho: string; vinco: string };
}

// O Grow: a manga do casaco escuro, o punho de pelo claro (o da gola) e a pele do sprite.
export const SOCO_GROW: CoresSoco = {
  contorno: '#140b0a',
  manga: { luz: '#6c4337', cima: '#58352c', sombra: '#37201a', ate: 5 },
  faixa: { cima: '#fbe6cc', sombra: '#c7a18a' },
  braco: { luz: '#eac2a9', cima: '#c7a18a', sombra: '#8e705e' },
  mao: { brilho: '#fbe6cc', luz: '#eac2a9', cima: '#c7a18a', sombra: '#8e705e', vinco: '#7a5040' },
};
// A Leslie: o braço nu, com uma pulseira de folhas no pulso.
export const SOCO_LESLIE: CoresSoco = {
  contorno: '#2b1911',
  faixa: { cima: '#6c7d48', sombra: '#3d492a', noPulso: true },
  braco: { luz: '#f1c299', cima: '#e3a37c', sombra: '#ac7355' },
  mao: { brilho: '#fde2ba', luz: '#f1c299', cima: '#e3a37c', sombra: '#c88968', vinco: '#936147' },
};
// O Anjo, na forma base: a manga do moletom preto até o pulso, com o punho canelado.
export const SOCO_BASE: CoresSoco = {
  contorno: '#050305',
  faixa: { cima: '#46414a', sombra: '#2a262d', noPulso: true },
  braco: { luz: '#3a363d', cima: '#252228', sombra: '#100c0f' },
  mao: { brilho: '#e0b39c', luz: '#c8977f', cima: '#ac7c69', sombra: '#7d5445', vinco: '#5e3b30' },
};

export interface Ponto {
  x: number;
  y: number;
}

// O ombro do braço desenhado, em pixels inteiros do mapa: o da frente (ou o de trás, com a mão da
// frente ocupada).
export function ombroDe(c: ComOmbro): Ponto {
  const frente = c.maoLivreAtras ? -OMBRO.frente : OMBRO.frente;
  return { x: Math.round(c.x) + c.direcao * frente, y: Math.round(c.y) - OMBRO.altura };
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
