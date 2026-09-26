// A cena da frente dos menus: árvores e moitas do próprio jogo, grandes, saindo de baixo nas
// duas beiradas da tela, balançando com o mesmo vento do cenário e soltando folhas. Fica por
// cima do cenário escurecido e por baixo da logo e dos botões. É uma peça só, que passa de uma
// tela para a outra (inicial ↔ multiplayer) sem recomeçar; o laço dela para sozinho quando ela
// sai da página (a partida começou).

import { QUADROS_CENARIO } from '../gerado/cenario-quadros';
import { contexto2d, novoCanvas } from '../motor/imagens';
import { quadroDoVento } from '../mundo/cenario';
import { elemento } from './dom';

interface PlantaDaFrente {
  grupo: 'arvores' | 'arbustos';
  indice: number; // em QUADROS_CENARIO[grupo] (ver PlantaNoMapa em mundo/cenario.ts)
  lado: 'esquerda' | 'direita';
  centro: number; // do tronco até a beirada da tela, em pixels do sprite das da frente
  escala: number; // 1 = as da frente; as de trás são menores e mais escuras
  afundar: number; // pixels do sprite abaixo da borda de baixo: o pé fica fora da tela
  atraso: number; // ms até começar a subir
  folhas: number; // folhas soltas por segundo
}

// As de trás primeiro (a ordem é a da pintura). Carvalho alto na frente de cada lado, um
// pinheiro e um carvalho menores atrás, e uma moita cobrindo o pé.
const PLANTAS: PlantaDaFrente[] = [
  { grupo: 'arvores', indice: 9, lado: 'esquerda', centro: 58, escala: 0.8, afundar: 8, atraso: 140, folhas: 0.5 },
  { grupo: 'arvores', indice: 11, lado: 'direita', centro: 56, escala: 0.8, afundar: 8, atraso: 220, folhas: 0.5 },
  { grupo: 'arvores', indice: 0, lado: 'esquerda', centro: 12, escala: 1, afundar: 10, atraso: 0, folhas: 1.4 },
  { grupo: 'arvores', indice: 2, lado: 'direita', centro: 14, escala: 1, afundar: 10, atraso: 80, folhas: 1.4 },
  { grupo: 'arbustos', indice: 1, lado: 'esquerda', centro: 42, escala: 1, afundar: 3, atraso: 260, folhas: 0 },
  { grupo: 'arbustos', indice: 0, lado: 'direita', centro: 44, escala: 1, afundar: 3, atraso: 320, folhas: 0 },
];

// Tamanho de um pixel do sprite na tela: o carvalho da frente ocupa até 85% da altura da tela
// e, em tela estreita, até 26% da largura (senão cobriria os botões).
const ALTURA_REFERENCIA = 147;
const LARGURA_REFERENCIA = 71;
const pixelNaTela = (): number =>
  Math.min((0.85 * innerHeight) / ALTURA_REFERENCIA, (0.26 * innerWidth) / LARGURA_REFERENCIA);

const SUBIDA_MS = 1100; // a subida da mais atrasada termina em SUBIDA_MS + o atraso dela

interface Planta {
  config: PlantaDaFrente;
  canvas: HTMLCanvasElement;
  quadro: number; // o quadro do vento desenhado agora (-1: nenhum)
  cores: string[]; // cores da copa, para as folhas que caem
  caixa: { x: number; y: number; w: number; h: number }; // na tela, em px
  acumulado: number; // folhas "devidas" desde a última que caiu
}

interface Folha {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fase: number;
  cor: string;
  vida: number;
}

let camada: HTMLElement | null = null;
let folhaCenario: HTMLImageElement;
let plantas: Planta[] = [];
let telaFolhas: HTMLCanvasElement;
let folhas: Folha[] = [];
let rodando = false;
let pixel = 1;

const semMovimento = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sortear = (min: number, max: number): number => min + Math.random() * (max - min);

// As cores da metade de cima do sprite (a copa), para as folhas saírem da cor da árvore.
function coresDaCopa(canvas: HTMLCanvasElement): string[] {
  const { width: w, height: h } = canvas;
  const px = contexto2d(canvas).getImageData(0, 0, w, Math.ceil(h * 0.5)).data;
  const cores: string[] = [];
  for (let i = 0; i < px.length; i += 4 * 7) {
    if (px[i + 3] > 200) cores.push(`rgb(${px[i]}, ${px[i + 1]}, ${px[i + 2]})`);
  }
  return cores.length ? cores : ['#4f8a3a'];
}

function desenharPlanta(p: Planta, quadro: number): void {
  if (p.quadro === quadro) return;
  p.quadro = quadro;
  const q = QUADROS_CENARIO[p.config.grupo][p.config.indice][quadro];
  const c = contexto2d(p.canvas);
  c.clearRect(0, 0, p.canvas.width, p.canvas.height);
  c.drawImage(folhaCenario, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
}

// Tamanho e lugar de cada planta para o tamanho atual da janela.
function posicionar(): void {
  pixel = pixelNaTela();
  for (const p of plantas) {
    const { w, h, m = 0 } = QUADROS_CENARIO[p.config.grupo][p.config.indice][0];
    const escala = pixel * p.config.escala;
    // O centro do tronco fica em `centro` da beirada; o recorte tem `m` px a mais à esquerda
    // para a copa vergar (ver esquerdaDaPlanta em mundo/cenario.ts).
    const centro = p.config.centro * pixel;
    const meioDoTronco = (m + (w - m) / 2) * escala;
    const x = p.config.lado === 'esquerda' ? centro - meioDoTronco : innerWidth - centro - meioDoTronco;
    const y = innerHeight - (h - p.config.afundar) * escala;
    Object.assign(p.canvas.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${w * escala}px`,
      height: `${h * escala}px`,
    });
    p.caixa = { x, y, w: w * escala, h: h * escala };
  }
  telaFolhas.width = innerWidth;
  telaFolhas.height = innerHeight;
}

// Monta a cena uma vez, com a folha do cenário já carregada.
export function prepararCena(folha: HTMLImageElement): void {
  folhaCenario = folha;
  camada = elemento('div', 'inicio-cena');
  camada.setAttribute('aria-hidden', 'true');
  telaFolhas = elemento('canvas', 'inicio-cena-folhas');
  plantas = PLANTAS.map((config) => {
    const q = QUADROS_CENARIO[config.grupo][config.indice][0];
    const canvas = novoCanvas(q.w, q.h);
    canvas.className = `inicio-planta${config.escala < 1 ? ' inicio-planta-atras' : ''}`;
    canvas.style.setProperty('--atraso', `${config.atraso}ms`);
    const planta: Planta = { config, canvas, quadro: -1, cores: [], caixa: { x: 0, y: 0, w: 0, h: 0 }, acumulado: 0 };
    desenharPlanta(planta, 0);
    planta.cores = coresDaCopa(canvas);
    return planta;
  });
  // As folhas caem entre as plantas de trás e as da frente.
  const atras = plantas.filter((p) => p.config.escala < 1).map((p) => p.canvas);
  const frente = plantas.filter((p) => p.config.escala >= 1).map((p) => p.canvas);
  camada.append(...atras, telaFolhas, ...frente);
  addEventListener('resize', () => {
    if (camada?.isConnected) posicionar();
  });
}

// Põe a cena no fundo da tela (por baixo do conteúdo dela). `entrar`: as plantas sobem de
// baixo — ao abrir a tela inicial; passando entre os menus, ela só muda de lugar.
export function anexarCena(tela: HTMLElement, entrar = false): void {
  if (!camada) return;
  tela.prepend(camada);
  posicionar();
  if (entrar && !semMovimento()) {
    const el = camada;
    folhas = [];
    el.classList.remove('inicio-cena-entrando');
    el.classList.add('inicio-cena-escondida');
    // Espera dois quadros escondida: o primeiro depois do carregamento é pesado e comeria a subida.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.classList.replace('inicio-cena-escondida', 'inicio-cena-entrando');
        const fim = SUBIDA_MS + Math.max(...PLANTAS.map((p) => p.atraso));
        setTimeout(() => el.classList.remove('inicio-cena-entrando'), fim);
      }),
    );
  }
  if (!rodando) {
    rodando = true;
    requestAnimationFrame(quadro);
  }
}

let ultimo = 0;
function quadro(agora: number): void {
  if (!camada?.isConnected) {
    rodando = false;
    ultimo = 0;
    return;
  }
  const dt = ultimo ? Math.min((agora - ultimo) / 1000, 1 / 20) : 0;
  ultimo = agora;
  const parado = semMovimento();
  const tempo = agora / 1000;
  const subindo = camada.classList.contains('inicio-cena-entrando') || camada.classList.contains('inicio-cena-escondida');

  for (const p of plantas) {
    const total = QUADROS_CENARIO[p.config.grupo][p.config.indice].length;
    // O mesmo vento do cenário: a fase vem do lugar da planta, como no mapa.
    desenharPlanta(p, parado ? 0 : quadroDoVento(tempo, p.caixa.x / pixel, total));
    if (parado || subindo || !p.config.folhas) continue;
    p.acumulado += p.config.folhas * dt;
    while (p.acumulado >= 1) {
      p.acumulado--;
      soltarFolha(p);
    }
  }
  atualizarFolhas(dt);
  desenharFolhas();
  requestAnimationFrame(quadro);
}

// Uma folha sai de um ponto da copa e cai para a esquerda, com o vento, balançando.
function soltarFolha(p: Planta): void {
  const { x, y, w, h } = p.caixa;
  const escala = pixel / 4; // as velocidades foram acertadas com o pixel do sprite em 4 px
  folhas.push({
    x: x + w * sortear(0.15, 0.85),
    y: y + h * sortear(0.08, 0.45),
    vx: -sortear(18, 46) * escala,
    vy: sortear(22, 40) * escala,
    fase: sortear(0, Math.PI * 2),
    cor: p.cores[Math.floor(Math.random() * p.cores.length)],
    vida: 0,
  });
}

function atualizarFolhas(dt: number): void {
  for (const f of folhas) {
    f.vida += dt;
    f.x += (f.vx + Math.sin(f.vida * 2.6 + f.fase) * 28 * (pixel / 4)) * dt;
    f.y += f.vy * dt;
  }
  folhas = folhas.filter((f) => f.y < innerHeight + 10 && f.x > -20);
}

// Cada folha é um retângulo (2×1 pixels e meio do sprite) que fica de pé e deitado enquanto gira.
function desenharFolhas(): void {
  const c = contexto2d(telaFolhas);
  c.clearRect(0, 0, telaFolhas.width, telaFolhas.height);
  const lado = Math.max(3, Math.round(pixel * 1.5));
  for (const f of folhas) {
    const deitada = Math.sin(f.vida * 5 + f.fase) > 0;
    c.globalAlpha = Math.min(1, f.vida * 3);
    c.fillStyle = f.cor;
    c.fillRect(Math.round(f.x), Math.round(f.y), deitada ? lado * 2 : lado, deitada ? lado : lado * 2);
  }
  c.globalAlpha = 1;
}
