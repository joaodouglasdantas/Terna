// Folhas caindo das árvores da frente, em coordenadas do mapa. Caem balançando de um lado para o
// outro (virando de face, de lado e de face de novo), levadas de leve pelo vento para a esquerda,
// e ficam uns segundos na grama antes de sumir. Cada árvore solta a folha dela: verde nos
// carvalhos, agulhinhas escuras nos pinheiros, pétalas rosa na cerejeira e amarelas no ipê.
// Quem solta:
// - os pássaros, ao levantar voo de uma árvore ou ao pousar nela (animais.ts);
// - o esquilo, quando entra na copa;
// - o vento, de vez em quando, numa árvore que esteja na tela.

import { sortear } from '../motor/matematica';
import type { Vista } from '../motor/tipos';
import { QUADROS_CENARIO } from '../gerado/cenario-quadros';
import { ARVORES_CHAO, esquerdaDaPlanta } from './cenario';

type Tipo = 'folha' | 'agulha' | 'petala';

// As cores de cada tipo de árvore: [clara, escura] de cada folha sorteada.
const CORES: Record<'carvalho' | 'pinheiro' | 'cerejeira' | 'ipe', { tipo: Tipo; cores: [string, string][] }> = {
  // Mais claras que a copa (para não sumirem na frente dela), com a borda escura.
  carvalho: {
    tipo: 'folha',
    cores: [
      ['#b6ea6e', '#3f7f2e'],
      ['#9ad85a', '#35702a'],
      ['#e0d25a', '#8a7a22'], // uma ou outra já amarelando
    ],
  },
  pinheiro: { tipo: 'agulha', cores: [['#7fb85a', '#2f5a2a']] },
  cerejeira: {
    tipo: 'petala',
    cores: [
      ['#ffd6ea', '#ff9fc4'],
      ['#ffb7d5', '#f07eae'],
    ],
  },
  ipe: {
    tipo: 'petala',
    cores: [
      ['#ffe066', '#e0a820'],
      ['#f0cf1e', '#c98f18'],
    ],
  },
};

// Índices das árvores da folha do cenário (cenario.ts): 3–9 e 17–19 pinheiros, 15 cerejeira, 16 ipê.
function especie(indice: number): keyof typeof CORES {
  if (indice === 15) return 'cerejeira';
  if (indice === 16) return 'ipe';
  if ((indice >= 3 && indice <= 9) || (indice >= 17 && indice <= 19)) return 'pinheiro';
  return 'carvalho';
}

const FOLHAS = {
  maximo: 140,
  queda: { folha: [9, 14], agulha: [14, 20], petala: [6, 10] } as Record<Tipo, [number, number]>, // px/s
  balanco: [3, 7] as const, // px para cada lado
  ritmo: [1.6, 2.8] as const, // rad/s do balanço
  vento: -3.5, // px/s para a esquerda
  noChao: [3, 6] as const, // segundos na grama antes de sumir
  sumir: 1, // segundos para sumir
  // O vento solta uma folha numa árvore da tela a cada tantos segundos.
  ventoSolta: [1.2, 3.2] as const,
};

interface Folha {
  tipo: Tipo;
  x: number;
  y: number;
  vx: number; // impulso de quem a soltou (some aos poucos)
  vy: number;
  queda: number;
  balanco: number;
  ritmo: number;
  fase: number;
  clara: string;
  escura: string;
  chao: number; // y onde ela para
  deitada: number; // segundos na grama (-1 ainda caindo)
  ficar: number;
}

let folhas: Folha[] = [];
let yChao = 0;
let esperaVento: number = FOLHAS.ventoSolta[0];

export function prepararFolhas(yDoChao: number): void {
  yChao = yDoChao;
  folhas = [];
}

const doMapa = new Map(ARVORES_CHAO.map(({ indice, x }) => [x, indice]));

// Solta `quantas` folhas da árvore da frente em `arvoreX` (o x dela no mapa), em volta de (x, y).
// `forte`: com um empurrão para os lados (um pássaro levantando voo).
export function soltarFolhas(arvoreX: number, x: number, y: number, quantas: number, forte = false): void {
  const { tipo, cores } = CORES[especie(doMapa.get(arvoreX) ?? 0)];
  for (let i = 0; i < quantas && folhas.length < FOLHAS.maximo; i++) {
    const [clara, escura] = cores[Math.floor(Math.random() * cores.length)];
    folhas.push({
      tipo,
      x: x + sortear([-6, 6]),
      y: y + sortear([-4, 3]),
      vx: forte ? sortear([-22, 22]) : sortear([-4, 4]),
      vy: forte ? sortear([-14, -2]) : 0,
      queda: sortear(FOLHAS.queda[tipo]),
      balanco: sortear(FOLHAS.balanco),
      ritmo: sortear(FOLHAS.ritmo),
      fase: Math.random() * Math.PI * 2,
      clara,
      escura,
      chao: yChao - 1 + Math.floor(Math.random() * 4),
      deitada: -1,
      ficar: sortear(FOLHAS.noChao),
    });
  }
}

// Um ponto ao acaso na copa da árvore da frente em `arvoreX`.
function pontoNaCopa(indice: number, arvoreX: number): { x: number; y: number } {
  const q = QUADROS_CENARIO.arvores[indice][0];
  const esquerda = esquerdaDaPlanta(q, arvoreX);
  const apoio = yChao + 1;
  return { x: esquerda + q.w * sortear([0.25, 0.75]), y: apoio - q.h * sortear([0.5, 0.85]) };
}

export function atualizarFolhas(dt: number, tempo: number, vistas: readonly Vista[]): void {
  // O vento solta uma de vez em quando, numa árvore que esteja na tela (pinheiro, raramente).
  esperaVento -= dt;
  if (esperaVento <= 0 && yChao) {
    esperaVento = sortear(FOLHAS.ventoSolta);
    const naTela = ARVORES_CHAO.filter(({ x }) => vistas.some((v) => x > v.x && x < v.x + v.largura));
    const escolhida = naTela[Math.floor(Math.random() * naTela.length)];
    if (escolhida && (especie(escolhida.indice) !== 'pinheiro' || Math.random() < 0.3)) {
      const p = pontoNaCopa(escolhida.indice, escolhida.x);
      soltarFolhas(escolhida.x, p.x, p.y, 1);
    }
  }

  for (const f of folhas) {
    if (f.deitada >= 0) {
      f.deitada += dt;
      continue;
    }
    // O empurrão passa, e ela assenta na queda dela.
    f.vx *= Math.max(0, 1 - dt * 2.5);
    f.vy += (f.queda - f.vy) * Math.min(1, dt * 2);
    const balanco = Math.cos(tempo * f.ritmo + f.fase) * f.balanco * f.ritmo;
    f.x += (f.vx + FOLHAS.vento + balanco) * dt;
    // No meio do balanço ela desce mais; nas pontas, quase para (como folha de verdade).
    const freia = 0.55 + 0.45 * Math.abs(Math.cos(tempo * f.ritmo + f.fase));
    f.y += f.vy * (f.vy > 0 ? freia : 1) * dt;
    if (f.y >= f.chao) {
      f.y = f.chao;
      f.deitada = 0;
    }
  }
  folhas = folhas.filter((f) => f.deitada < f.ficar + FOLHAS.sumir);
}

// Os desenhos de cada tipo nas quatro poses do balanço: de face, inclinada, de lado (fininha) e
// inclinada para o outro lado. C: a cor clara, E: a escura (a borda e a nervura).
const DESENHOS: Record<Tipo, string[][]> = {
  folha: [
    ['.CC', 'CCE', '.E.'],
    ['CC.', '.CE'],
    ['EEE'],
    ['.CC', 'CE.'],
  ],
  petala: [
    ['CC', 'CE'],
    ['C.', 'CE'],
    ['CE'],
    ['.C', 'EC'],
  ],
  agulha: [['CCE'], ['C..', '.C.', '..E'], ['CE'], ['..C', '.C.', 'E..']],
};

// A folha em pixels, conforme o balanço (deitada na grama, de face).
function pintarFolha(ctx: CanvasRenderingContext2D, f: Folha, tempo: number, alfa: number): void {
  const x = Math.round(f.x);
  const y = Math.round(f.y);
  ctx.globalAlpha = alfa;
  const giro = f.deitada >= 0 ? 1 : Math.sin(tempo * f.ritmo + f.fase);
  const pose = giro > 0.45 ? 0 : giro > 0 ? 1 : giro > -0.45 ? 2 : 3;
  const desenho = DESENHOS[f.tipo][pose];
  desenho.forEach((linha, dy) => {
    for (let dx = 0; dx < linha.length; dx++) {
      const c = linha[dx];
      if (c === '.') continue;
      ctx.fillStyle = c === 'C' ? f.clara : f.escura;
      ctx.fillRect(x + dx - 1, y + dy - desenho.length + 1, 1, 1);
    }
  });
  ctx.globalAlpha = 1;
}

// Em coordenadas do mapa (o chamador já transladou pela câmera `camX`).
export function desenharFolhas(ctx: CanvasRenderingContext2D, tempo: number, camX: number, largura: number): void {
  for (const f of folhas) {
    if (f.x < camX - 4 || f.x > camX + largura + 4) continue;
    const alfa = f.deitada < f.ficar ? 1 : Math.max(0, 1 - (f.deitada - f.ficar) / FOLHAS.sumir);
    pintarFolha(ctx, f, tempo, alfa);
  }
}
