// O braço que o personagem estica por cima do sprite: segurando ou usando uma arma, dando um soco
// (armas.ts) e soltando um poder (personagem.ts). Sai do ombro, de lado, na direção pedida: um
// braço de verdade, com contorno escuro, luz, cor e sombra, a roupa de cada um (a manga e o punho
// do casaco do Grow, a pulseira de folhas da Leslie, a manga da blusa da Margo, a do moletom do
// Anjo) e a mão fechada
// na ponta, segurando o que tiver.

// De lado, o ombro da frente fica 2 px à frente do eixo e 16 px acima dos pés. O da Leslie, que é
// miúda e tem o pescoço comprido no sprite, fica mais baixo e no eixo: senão o braço saía do queixo.
export const OMBRO = { frente: 2, altura: 16 };
const OMBRO_DA_LESLIE = { frente: 0, altura: 14 };

// O Grow, de gente, ataca com a mão de trás: o braço desenhado — a arma e o soco — sai do ombro
// de trás, passa por trás do corpo (é desenhado antes do sprite) e aparece na frente do peito;
// para alcançar o mesmo ponto, fica `maisBraco` mais comprido. (O cajado, nessa hora, vai nas
// costas: entidades/grow/cajado.ts.)
export interface ComOmbro {
  x: number;
  y: number;
  direcao: 1 | -1;
  maoLivreAtras?: boolean;
  heroi?: string;
}
const ombroDo = (c: ComOmbro): { frente: number; altura: number } => (c.heroi === 'leslie' ? OMBRO_DA_LESLIE : OMBRO);
// Quanto o braço cresce para a mão chegar no mesmo ponto: o que o ombro dele fica atrás do de sempre.
export const maisBraco = (c: ComOmbro): number => (c.maoLivreAtras ? 2 * OMBRO.frente : OMBRO.frente - ombroDo(c).frente);

interface Tons {
  luz: string;
  cima: string;
  sombra: string;
}
// As cores do braço, nas do próprio sprite de cada um.
export interface CoresBraco {
  contorno: string;
  braco: Tons; // o antebraço
  manga?: Tons & { ate: number }; // do ombro até `ate` px (mais grossa que o braço)
  // A faixa: logo depois da manga, ou (`noPulso`) encostada na mão.
  faixa?: { cima: string; sombra: string; noPulso?: boolean };
  mao: Tons & { brilho: string; vinco: string };
  // Delicado (a Leslie): o braço de 3 px, sem o contorno de cima, e a mão menor.
  fino?: boolean;
}

// O Grow: a manga do casaco escuro, o punho de pelo claro (o da gola) e a pele do sprite.
export const BRACO_GROW: CoresBraco = {
  contorno: '#140b0a',
  manga: { luz: '#6c4337', cima: '#58352c', sombra: '#37201a', ate: 5 },
  faixa: { cima: '#fbe6cc', sombra: '#c7a18a' },
  braco: { luz: '#eac2a9', cima: '#c7a18a', sombra: '#8e705e' },
  mao: { brilho: '#fbe6cc', luz: '#eac2a9', cima: '#c7a18a', sombra: '#8e705e', vinco: '#7a5040' },
};
// A Leslie: o braço nu, fino como o dela, com uma pulseira de folhas no pulso.
export const BRACO_LESLIE: CoresBraco = {
  fino: true,
  contorno: '#4e3425',
  faixa: { cima: '#6c7d48', sombra: '#3d492a', noPulso: true },
  braco: { luz: '#f1c299', cima: '#e3a37c', sombra: '#ac7355' },
  mao: { brilho: '#fde2ba', luz: '#f1c299', cima: '#e3a37c', sombra: '#c88968', vinco: '#936147' },
};
// A Margo: a manga bufante da blusa branca, o braço e a mão de pele, nas cores da folha dela.
export const BRACO_MARGO: CoresBraco = {
  contorno: '#28252a',
  manga: { luz: '#fcf7ec', cima: '#e6d8d2', sombra: '#bba8a6', ate: 5 },
  braco: { luz: '#f8ce98', cima: '#ecab76', sombra: '#be8d6f' },
  mao: { brilho: '#fde8c4', luz: '#f8ce98', cima: '#ecab76', sombra: '#be8d6f', vinco: '#9a6040' },
};
// O Anjo, na forma base: a manga do moletom preto até o pulso, com o punho canelado.
export const BRACO_BASE: CoresBraco = {
  contorno: '#050305',
  faixa: { cima: '#46414a', sombra: '#2a262d', noPulso: true },
  braco: { luz: '#3a363d', cima: '#252228', sombra: '#100c0f' },
  mao: { brilho: '#e0b39c', luz: '#c8977f', cima: '#ac7c69', sombra: '#7d5445', vinco: '#5e3b30' },
};
// O anjo, sem roupa: a pele clara e a mão mais clara ainda (com o brilho rosa do poder, à parte).
export const BRACO_ANJO: CoresBraco = {
  contorno: '#4a2430',
  braco: { luz: '#fde7d8', cima: '#f6d3bd', sombra: '#bf8872' },
  mao: { brilho: '#ffffff', luz: '#fff1ea', cima: '#f6d3bd', sombra: '#d9a08c', vinco: '#bf8872' },
};

export interface Ponto {
  x: number;
  y: number;
}

// O ombro do braço desenhado, em pixels inteiros do mapa: o da frente (ou o de trás, no Grow).
export function ombroDe(c: ComOmbro): Ponto {
  const ombro = ombroDo(c);
  const frente = c.maoLivreAtras ? -ombro.frente : ombro.frente;
  return { x: Math.round(c.x) + c.direcao * frente, y: Math.round(c.y) - ombro.altura };
}

// O ângulo no mapa de um ângulo "do corpo": 0 = para a frente, positivo = para baixo. Assim uma
// pose vale para os dois lados.
export function anguloNoMapa(angulo: number, direcao: 1 | -1): number {
  return direcao === 1 ? angulo : Math.PI - angulo;
}

// O braço, de `ombro` até `ate` px na direção `ang` (sem a mão). Cada pixel perto da linha do
// braço é pintado pela distância a ela: assim a grossura é a mesma em qualquer ângulo, sem buraco
// na diagonal. De cima para baixo: o contorno, a cor (a luz perto da mão) e a sombra, e o contorno
// de novo; a manga (quem tem) é 1 px mais grossa. Começa 2 px para dentro do ombro, para não
// parecer solto do corpo. `pulso`: onde a mão começa (a pulseira encosta nele).
export function desenharBracoGrosso(
  ctx: CanvasRenderingContext2D,
  ombro: Ponto,
  ang: number,
  ate: number,
  cores: CoresBraco,
  pulso = ate,
): void {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  // A normal aponta sempre para baixo: o lado da sombra, olhando para qualquer lado.
  const [nx, ny] = ux >= 0 ? [-uy, ux] : [uy, -ux];
  const ox = ombro.x + 0.5;
  const oy = ombro.y + 0.5;
  const { manga, faixa, braco } = cores;
  // Onde fica a faixa, ao longo do braço: logo depois da manga ou encostada na mão.
  const faixaDe = faixa ? (faixa.noPulso ? pulso - 2 : (manga?.ate ?? 0)) : Infinity;
  const faixaAte = faixa ? (faixa.noPulso ? pulso : faixaDe + 1) : -Infinity;
  const x0 = Math.floor(Math.min(ox, ox + ux * ate)) - 3;
  const x1 = Math.ceil(Math.max(ox, ox + ux * ate)) + 3;
  const y0 = Math.floor(Math.min(oy, oy + uy * ate)) - 3;
  const y1 = Math.ceil(Math.max(oy, oy + uy * ate)) + 3;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5 - ox;
      const cy = y + 0.5 - oy;
      const t = cx * ux + cy * uy; // ao longo do braço
      const d = cx * nx + cy * ny; // para o lado (positivo = para baixo)
      if (t < -2 || t > ate) continue;
      let cor: string | null = null;
      if (manga && t < manga.ate) {
        if (d >= -1.5 && d < 1.5) cor = d < -0.5 ? manga.luz : d < 0.5 ? manga.cima : manga.sombra;
        else if (d >= -2.5 && d < 2.5) cor = cores.contorno;
      } else if (faixa && t >= faixaDe && t < faixaAte) {
        const meia = faixa.noPulso ? 1 : 1.5; // o punho do casaco é da grossura da manga
        if (d >= -meia && d < meia) cor = d < 0 ? faixa.cima : faixa.sombra;
        else if (d >= (cores.fino ? meia : -meia - 1) && d < meia + 1) cor = cores.contorno;
      } else if (d >= -1 && d < 1) {
        cor = d < 0 ? (t > pulso - 3 ? braco.luz : braco.cima) : braco.sombra;
      } else if (d >= (cores.fino ? 1 : -2) && d < 2) {
        cor = cores.contorno;
      }
      if (!cor) continue;
      ctx.fillStyle = cor;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// A mão fechada em volta do cabo (5×5), olhando para a frente: o dedão e os nós dos dedos claros
// em cima, o vinco entre os dedos, a sombra embaixo. O contorno (`k`) é desenhado antes do braço
// e o miolo depois da arma: assim o pulso fica aberto do lado de onde o braço chega, qualquer que
// seja o ângulo, e o cabo da arma aparece saindo da mão dos dois lados.
const MAO = [
  '.kkk.',
  'kBLLk',
  'kCvLk',
  'kSCSk',
  '.kkk.',
];
// A da Leslie, delicada (4×4).
const MAO_FINA = [
  '.kk.',
  'kBLk',
  'kCSk',
  '.kk.',
];

function pintarMao(ctx: CanvasRenderingContext2D, mao: Ponto, direcao: 1 | -1, cores: CoresBraco, contorno: boolean): void {
  const { mao: tons } = cores;
  const cor: Record<string, string> = { k: cores.contorno, B: tons.brilho, L: tons.luz, C: tons.cima, S: tons.sombra, v: tons.vinco };
  const mx = Math.round(mao.x);
  const my = Math.round(mao.y);
  const desenho = cores.fino ? MAO_FINA : MAO;
  const meio = desenho.length >> 1;
  desenho.forEach((linha, y) =>
    [...linha].forEach((ch, x) => {
      if (ch === '.' || (ch === 'k') !== contorno) return;
      ctx.fillStyle = cor[ch];
      ctx.fillRect(mx + direcao * (x - meio), my + y - meio, 1, 1);
    }),
  );
}

// O braço esticado de `ombro` até `comprimento` na direção `ang`, com a mão fechada na ponta
// segurando o que `segurar` desenhar nela (a arma, virada para onde quiser). Sem nada, a mão
// fechada vazia (o gesto dos poderes). Devolve onde fica a mão.
export function desenharBracoComMao(
  ctx: CanvasRenderingContext2D,
  ombro: Ponto,
  ang: number,
  comprimento: number,
  direcao: 1 | -1,
  cores: CoresBraco,
  segurar?: (mao: Ponto) => void,
): Ponto {
  const mao = { x: ombro.x + Math.cos(ang) * comprimento, y: ombro.y + Math.sin(ang) * comprimento };
  pintarMao(ctx, mao, direcao, cores, true);
  if (comprimento >= 2) desenharBracoGrosso(ctx, ombro, ang, comprimento, cores, comprimento - 2);
  segurar?.(mao);
  pintarMao(ctx, mao, direcao, cores, false);
  return mao;
}

// Só a mão, sem o braço (de frente, a mão do próprio sprite segurando a arma).
export function desenharMaoSegurando(
  ctx: CanvasRenderingContext2D,
  mao: Ponto,
  direcao: 1 | -1,
  cores: CoresBraco,
  segurar: (mao: Ponto) => void,
): void {
  pintarMao(ctx, mao, direcao, cores, true);
  segurar(mao);
  pintarMao(ctx, mao, direcao, cores, false);
}
