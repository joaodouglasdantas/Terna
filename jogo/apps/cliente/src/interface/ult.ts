// A cena de ult: quando sai o especial de alguém (a Flor Carnívora da Leslie, o golem do Grow, a
// forma de anjo do Anjo), uma faixa inclinada atravessa o meio da tela com a arte dele, como nos
// jogos de luta. O jogo é online e não para: a faixa passa POR CIMA da partida, no tempo do
// aviso que a ult já tem (a terra tremendo antes da flor, a pedra subindo, a luz do anjo), e
// serve de alerta — a sua entra pela esquerda, na sua cor; a do outro, pela direita, na dele.
// Ela fica entre os painéis (em cima) e o chão (embaixo): a vida, as barras, os personagens e o
// aviso no chão continuam à vista.
//
// As artes vêm de fontes/ult-<heroi>.png, reduzidas a 1/3 (ferramentas/ult.py) para o pixel
// delas ficar do tamanho do pixel do cenário. Quem ainda não tem arte (o Anjo) aparece pela foto
// do painel ampliada, com os riscos de velocidade.

import { NOME_PODER, SOBRE_HEROI, type Heroi } from '@terna/compartilhado';
import urlGrow from '../assets/ult/grow.webp';
import urlLeslie from '../assets/ult/leslie.webp';
import { retrato } from '../entidades/personagem';
import { textoEmPixels } from '../motor/fonte';
import { carregarDecodificada } from '../motor/imagens';

export type QualUlt = 'flor' | 'golem' | 'anjo';

// Os tempos, em segundos. A Flor fica ~1,1 s avisando antes de ferir: a faixa já saiu quando
// ela brota.
const ENTRA = 0.14;
const SAI = 0.72; // começa a sair
const TOTAL = 0.92;
const CLARAO = 0.06; // o branco do primeiro instante

// A faixa, em pixels da tela.
const TOPO = 54; // abaixo dos painéis e do aviso deles
const ALTURA = 104;
const INCLINA = 16; // quanto a ponta de cima anda para o lado em relação à de baixo
// As artes reduzidas têm a largura da faixa com as duas pontas inclinadas (480 + 2 × 16): a arte
// anda junto com a faixa e cobre até a ponta, na entrada e na saída.
const ARTE_LARGURA = 512;
const MOLDURA = '#1a1428';
const RISCOS = 16;

interface Pedaco {
  de: number; // coluna da arte onde o pedaço começa
  y: number; // linha da arte que fica no alto da faixa
}

interface Estilo {
  fundo: string; // atrás da arte
  risco: string; // os riscos de velocidade
  url: string | null;
  // A arte é recortada em pedaços lado a lado, cada um na sua altura, separados por um corte
  // inclinado (para uma arte em que o rosto e a ult ficam longe um do outro). Hoje todos cabem
  // num pedaço só.
  pedacos: readonly Pedaco[];
}

// As cores de cada um são as da barra de energia pixy cheia dele (painel.ts).
const ESTILOS: Record<Heroi, Estilo> = {
  grow: { fundo: '#241a12', risco: '#e6bf8e', url: urlGrow, pedacos: [{ de: 0, y: 50 }] },
  leslie: { fundo: '#1c2a18', risco: '#d4f7a8', url: urlLeslie, pedacos: [{ de: 0, y: 58 }] },
  anjo: { fundo: '#2a2442', risco: '#fff4c2', url: null, pedacos: [] },
};

const NOME_ULT: Record<QualUlt, string> = {
  flor: NOME_PODER.flor,
  golem: NOME_PODER.golem,
  anjo: 'Forma de Anjo',
};

// As artes começam a carregar quando o jogo abre; se uma ainda não chegou, a faixa usa a foto.
const artes = new Map<Heroi, HTMLImageElement>();
for (const [heroi, estilo] of Object.entries(ESTILOS) as [Heroi, Estilo][]) {
  if (estilo.url) carregarDecodificada(estilo.url).then((img) => artes.set(heroi, img), () => undefined);
}

interface Risco {
  linha: number; // na faixa
  x: number;
  comprimento: number;
  velocidade: number;
}

export interface CorteDeUlt {
  heroi: Heroi;
  ult: QualUlt;
  quem: string; // o nome do jogador
  cor: string; // a cor dele (a mesma do painel e do nome em cima da cabeça)
  lado: 1 | -1; // 1: entra pela esquerda (você); -1: pela direita (o outro)
  t: number;
  riscos: Risco[];
}

export function comecarCorte(heroi: Heroi, ult: QualUlt, quem: string, cor: string, meu: boolean): CorteDeUlt {
  const riscos = Array.from({ length: RISCOS }, () => ({
    linha: Math.floor(Math.random() * ALTURA),
    x: Math.random() * 600,
    comprimento: 20 + Math.random() * 70,
    velocidade: 500 + Math.random() * 500,
  }));
  return { heroi, ult, quem, cor, lado: meu ? 1 : -1, t: 0, riscos };
}

// Devolve o corte ainda passando, ou null quando ele acabou.
export function atualizarCorte(c: CorteDeUlt | null, dt: number): CorteDeUlt | null {
  if (!c) return null;
  c.t += dt;
  return c.t >= TOTAL ? null : c;
}

const saindo = (x: number): number => 1 - (1 - x) ** 3;
const chegando = (x: number): number => x ** 3;

// Quanto a faixa está deslocada do lugar dela: vem de fora da tela, para e continua para o
// outro lado.
function deslocamento(c: CorteDeUlt, largura: number): number {
  const fora = largura + INCLINA + 4;
  if (c.t < ENTRA) return -c.lado * fora * (1 - saindo(c.t / ENTRA));
  if (c.t < SAI) return 0;
  return c.lado * fora * chegando((c.t - SAI) / (TOTAL - SAI));
}

// A inclinação de cada linha: a sua faixa pende para a direita (/), a do outro para a esquerda (\).
function inclinacao(c: CorteDeUlt, linha: number): number {
  const p = linha / (ALTURA - 1);
  return Math.round(INCLINA * (c.lado === 1 ? 1 - p : p));
}

// O caminho da faixa linha por linha, de `de` a `ate` (linhas da faixa, podendo passar das bordas
// para a moldura). Retângulos de 1 pixel de altura em coordenadas inteiras: a borda inclinada sai
// em degraus nítidos, sem o borrado do recorte suavizado do canvas. `esquerda` dá onde cada
// linha começa (por padrão, a ponta da faixa).
function caminho(
  ctx: CanvasRenderingContext2D,
  c: CorteDeUlt,
  dx: number,
  largura: number,
  de: number,
  ate: number,
  esquerda?: (linha: number) => number,
): void {
  ctx.beginPath();
  for (let l = de; l < ate; l++) {
    const s = inclinacao(c, l);
    const x0 = esquerda ? esquerda(l) : dx + s - INCLINA;
    const x1 = dx + largura + s;
    if (x1 > x0) ctx.rect(x0, TOPO + l, x1 - x0, 1);
  }
}

// A transparência do escurecimento e do texto: sobe na entrada, desce na saída.
function presenca(c: CorteDeUlt): number {
  if (c.t < ENTRA) return c.t / ENTRA;
  if (c.t < SAI) return 1;
  return 1 - (c.t - SAI) / (TOTAL - SAI);
}

function desenharArte(ctx: CanvasRenderingContext2D, c: CorteDeUlt, estilo: Estilo, dx: number, largura: number): void {
  const arte = artes.get(c.heroi);
  const x0 = Math.round(dx) - INCLINA;
  if (arte && estilo.pedacos.length) {
    estilo.pedacos.forEach((pedaco, i) => {
      ctx.save();
      if (i > 0) {
        // O corte entre os pedaços, inclinado como a faixa, com uma linha escura.
        const corte = (l: number): number => x0 + pedaco.de + inclinacao(c, l) - INCLINA / 2;
        // escuro, a cor do jogador, escuro — como a moldura
        ctx.fillStyle = MOLDURA;
        caminho(ctx, c, dx, largura, 0, ALTURA, (l) => corte(l) - 4);
        ctx.fill();
        ctx.fillStyle = c.cor;
        caminho(ctx, c, dx, largura, 0, ALTURA, (l) => corte(l) - 3);
        ctx.fill();
        ctx.fillStyle = MOLDURA;
        caminho(ctx, c, dx, largura, 0, ALTURA, (l) => corte(l) - 1);
        ctx.fill();
        caminho(ctx, c, dx, largura, 0, ALTURA, corte);
        ctx.clip();
      }
      // O pedaço vai até o fim da arte: o próximo, desenhado por cima, cobre a sobra.
      ctx.drawImage(arte, pedaco.de, pedaco.y, ARTE_LARGURA - pedaco.de, ALTURA, x0 + pedaco.de, TOPO, ARTE_LARGURA - pedaco.de, ALTURA);
      ctx.restore();
    });
    return;
  }
  // Sem arte: a foto do painel ampliada (em número inteiro, para o pixel continuar quadrado),
  // do lado de onde a faixa veio, com faixas de luz atrás.
  const foto = retrato(c.heroi, c.ult === 'anjo' ? 'anjo' : c.ult === 'golem' ? 'golem' : 'base');
  const escala = Math.floor((ALTURA - 8) / foto.height);
  const w = foto.width * escala;
  const h = foto.height * escala;
  ctx.fillStyle = estilo.risco;
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.08 + 0.04 * i;
    ctx.fillRect(Math.round(dx), TOPO + 10 + i * 18, largura, 6);
  }
  ctx.globalAlpha = 1;
  const x = c.lado === 1 ? Math.round(dx + 70) : Math.round(dx + largura - 70 - w);
  ctx.drawImage(foto, x, TOPO + ALTURA - h, w, h);
}

// O texto com contorno escuro de 1 pixel, ampliado `escala` vezes.
function texto(ctx: CanvasRenderingContext2D, frase: string, cor: string, x: number, y: number, escala: number, alinhar: 1 | -1): void {
  const claro = textoEmPixels(frase, cor);
  const escuro = textoEmPixels(frase, MOLDURA);
  const w = claro.width * escala;
  const h = claro.height * escala;
  const xi = Math.round(alinhar === 1 ? x : x - w);
  const yi = Math.round(y);
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, 2], [1, 2], [-1, 2]]) {
    ctx.drawImage(escuro, xi + ox, yi + oy, w, h);
  }
  ctx.drawImage(claro, xi, yi, w, h);
}

export function desenharCorte(ctx: CanvasRenderingContext2D, c: CorteDeUlt | null, largura: number, altura: number): void {
  if (!c) return;
  const estilo = ESTILOS[c.heroi];
  const dx = deslocamento(c, largura);
  const forca = presenca(c);
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // O resto da tela escurece um pouco (continua à vista: o jogo não para) e pisca no começo.
  ctx.fillStyle = `rgba(8, 6, 16, ${0.38 * forca})`;
  ctx.fillRect(0, 0, largura, altura);
  if (c.t < CLARAO) {
    ctx.fillStyle = `rgba(255, 250, 235, ${0.4 * (1 - c.t / CLARAO)})`;
    ctx.fillRect(0, 0, largura, altura);
  }

  // A moldura: escuro, a cor do jogador e escuro de novo, em cima e embaixo.
  ctx.fillStyle = MOLDURA;
  caminho(ctx, c, dx, largura, -4, ALTURA + 4);
  ctx.fill();
  ctx.fillStyle = c.cor;
  caminho(ctx, c, dx, largura, -3, -1);
  ctx.fill();
  caminho(ctx, c, dx, largura, ALTURA + 1, ALTURA + 3);
  ctx.fill();

  // Por dentro: o fundo, a arte e os riscos de velocidade, presos na faixa.
  ctx.save();
  caminho(ctx, c, dx, largura, 0, ALTURA);
  ctx.clip();
  ctx.fillStyle = estilo.fundo;
  ctx.fillRect(0, TOPO, largura, ALTURA);
  desenharArte(ctx, c, estilo, dx, largura);
  ctx.fillStyle = estilo.risco;
  const volta = largura + 200;
  for (const r of c.riscos) {
    const andou = (((r.x + c.lado * r.velocidade * c.t) % volta) + volta) % volta - 100;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(Math.round(andou), TOPO + r.linha, Math.round(r.comprimento), 1);
  }
  ctx.globalAlpha = 1;
  // Uma sombra em cima e embaixo, para a arte afundar na moldura.
  ctx.fillStyle = 'rgba(8, 6, 16, 0.35)';
  ctx.fillRect(0, TOPO, largura, 3);
  ctx.fillRect(0, TOPO + ALTURA - 3, largura, 3);
  ctx.restore();

  // O nome da ult (e de quem é) no canto de baixo do lado para onde a faixa vai; chega um
  // pouquinho depois dela.
  ctx.globalAlpha = forca;
  const atraso = c.t < ENTRA ? (1 - saindo(c.t / ENTRA)) * 24 : 0;
  const margem = 18;
  const x = c.lado === 1 ? dx + largura - margem - atraso : dx + margem + atraso;
  const alinhar = c.lado === 1 ? -1 : 1;
  const base = TOPO + ALTURA - 8;
  texto(ctx, NOME_ULT[c.ult], '#fff4dc', x, base - 10, 2, alinhar);
  texto(ctx, `${c.quem} - ${SOBRE_HEROI[c.heroi].nome}`, c.cor, x, base - 21, 1, alinhar);
  ctx.restore();
}
