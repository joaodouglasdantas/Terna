// O cajado do Grow nas costas. De gente, no modo arma (a arma do chão ou o soco), ele não segura o
// cajado: a folha é a sem cajado (assets/grow/sem-cajado.png) e o cajado vai atravessado nas
// costas, desenhado antes do corpo — a ponta com a pedra aparece atrás da cabeça e o cabo desce
// pelas costas. No modo poderes ele volta para a mão (o sprite de sempre).
//
// Desenhado aqui, pixel a pixel: a ponta (a pedra verde no meio do musgo, como a do cajado da mão)
// e o cabo, reto e inclinado. Olhando para a direita; para a esquerda, espelhado com o corpo.

import { contexto2d, novoCanvas } from '../../motor/imagens';
import type { Pose } from '../pose';

// A ponta, de cima para baixo; o cabo sai da coluna `PRESO` da última linha.
const PONTA = [
  '..M..M..',
  '.kmMkmk.',
  'kmsmmsmk',
  'ksmeEmsk',
  'kmsEEsmk',
  '.ksmmsdk',
  '..kWdk..',
  '..kwWk..',
  '...kwk..',
];
const PRESO = 4;
const COR: Record<string, string> = {
  k: '#140b0a', // contorno
  W: '#6a4a3a', // madeira clara
  w: '#4e3229',
  d: '#37201a', // madeira escura (os nós)
  m: '#4a702c', // musgo
  M: '#76a640',
  s: '#2c4420',
  e: '#c8ffb0', // a pedra: o brilho
  E: '#6fd05c',
};

// De lado, o cajado desce pelas costas quase em pé; de frente, atravessado (a ponta aparece por
// cima do ombro). `inclinacao`: px para trás por linha do cabo; `cabo`: linhas do cabo.
// `x`: onde fica o começo do cabo, em px do eixo do corpo (para trás é negativo); `y`: o alto do
// cajado, em px do alto do desenho (a ponta do cabelo).
const JEITOS = {
  deLado: { inclinacao: 0.4, cabo: 18, espelhado: false, x: -8, y: -2 },
  deFrente: { inclinacao: 1, cabo: 16, espelhado: true, x: -8, y: 1 },
};
type Jeito = keyof typeof JEITOS;

interface Cajado {
  imagem: HTMLCanvasElement;
  preso: number; // a coluna do começo do cabo na imagem
}

const cajados = new Map<Jeito, Cajado>();

function montar(jeito: Jeito): Cajado {
  const { inclinacao, cabo, espelhado } = JEITOS[jeito];
  const folga = Math.ceil(inclinacao * cabo) + 2;
  const largura = PONTA[0].length + folga;
  const altura = PONTA.length + cabo;
  const imagem = novoCanvas(largura, altura);
  const ctx = contexto2d(imagem);
  const ponto = (x: number, y: number, cor: string): void => {
    ctx.fillStyle = cor;
    ctx.fillRect(espelhado ? largura - 1 - x : x, y, 1, 1);
  };
  // O cabo: o miolo de madeira (clara e média alternando, um nó escuro de vez em quando) com o
  // contorno dos dois lados; a ponta de baixo fechada.
  const miolo = Array.from({ length: cabo }, (_, i) => ({
    x: folga + PRESO - Math.floor(inclinacao * (i + 1)),
    y: PONTA.length + i,
  }));
  for (const { x, y } of miolo) {
    ponto(x - 1, y, COR.k);
    ponto(x + 1, y, COR.k);
  }
  miolo.forEach(({ x, y }, i) => ponto(x, y, i === cabo - 1 ? COR.k : i % 5 === 3 ? COR.d : i % 2 ? COR.w : COR.W));
  PONTA.forEach((linha, y) => [...linha].forEach((c, x) => c !== '.' && ponto(folga + x, y, COR[c])));
  const preso = folga + PRESO;
  return { imagem, preso: espelhado ? largura - 1 - preso : preso };
}

// A primeira linha com pixel de cada quadro (o alto do cabelo): o cajado vai por ela.
const altos = new WeakMap<HTMLCanvasElement, number>();

function altoDo(imagem: HTMLCanvasElement): number {
  let alto = altos.get(imagem);
  if (alto === undefined) {
    const { width: w, height: h } = imagem;
    const { data } = contexto2d(imagem).getImageData(0, 0, w, h);
    const temPixel = (y: number): boolean => {
      for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 0) return true;
      return false;
    };
    alto = 0;
    while (alto < h - 1 && !temPixel(alto)) alto++;
    altos.set(imagem, alto);
  }
  return alto;
}

// O cajado nas costas do corpo na `pose` (antes de desenhar o corpo, que o cobre).
export function desenharCajadoNasCostas(ctx: CanvasRenderingContext2D, pose: Pose, alfa = 1): void {
  const nome: Jeito = pose.deFrente ? 'deFrente' : 'deLado';
  const jeito = JEITOS[nome];
  let cajado = cajados.get(nome);
  if (!cajado) cajados.set(nome, (cajado = montar(nome)));
  // Nas coordenadas do quadro (olhando para a direita), como o próprio sprite.
  const x = pose.eixo + jeito.x - cajado.preso;
  const y = altoDo(pose.imagem) + jeito.y;
  ctx.save();
  ctx.globalAlpha = alfa;
  if (pose.direcao === -1) {
    ctx.translate(pose.x + pose.eixo, pose.topo);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(pose.x - pose.eixo, pose.topo);
  }
  ctx.drawImage(cajado.imagem, x, y);
  ctx.restore();
}
