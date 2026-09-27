// A cena da frente dos menus: árvores e moitas do próprio jogo, grandes, saindo de baixo nas
// duas beiradas do quadro do jogo, balançando com o mesmo vento do cenário. Entre as árvores
// de trás e as da frente caem folhas em pixel, balançando como pêndulo e rodopiando, flutua
// pólen na luz do verão e piscam vagalumes perto do chão. Fica por cima do cenário escurecido
// e por baixo da logo e dos botões, sempre dentro do quadro do jogo (as margens pretas ficam
// livres). É uma peça só, que passa de uma tela para a outra (inicial ↔ multiplayer) sem
// recomeçar; o laço dela para sozinho quando ela sai da página (a partida começou).

import { QUADROS_CENARIO } from '../gerado/cenario-quadros';
import { contexto2d, novoCanvas } from '../motor/imagens';
import { quadroDoVento } from '../mundo/cenario';
import { elemento, palco } from './dom';
import {
  cair,
  desenharBrilho,
  desenharFolha,
  desenharHalo,
  folhaPronta,
  inclinacao,
  type Folha as DesenhoDeFolha,
  type Queda,
  type TamanhoDeFolha,
} from './efeitos';

interface PlantaDaFrente {
  grupo: 'arvores' | 'arbustos';
  indice: number; // em QUADROS_CENARIO[grupo] (ver PlantaNoMapa em mundo/cenario.ts)
  lado: 'esquerda' | 'direita';
  centro: number; // do tronco até a beirada do quadro, em pixels do sprite das da frente
  escala: number; // 1 = as da frente; as de trás são menores e mais escuras
  afundar: number; // pixels do sprite abaixo da borda de baixo: o pé fica fora do quadro
  atraso: number; // ms até começar a subir
  folhas: number; // folhas soltas por segundo
}

// As de trás primeiro (a ordem é a da pintura). Carvalho alto na frente de cada lado, um
// pinheiro e um carvalho menores atrás, e uma moita cobrindo o pé.
const PLANTAS: PlantaDaFrente[] = [
  { grupo: 'arvores', indice: 9, lado: 'esquerda', centro: 58, escala: 0.8, afundar: 8, atraso: 140, folhas: 0.6 },
  { grupo: 'arvores', indice: 11, lado: 'direita', centro: 56, escala: 0.8, afundar: 8, atraso: 220, folhas: 0.6 },
  { grupo: 'arvores', indice: 0, lado: 'esquerda', centro: 12, escala: 1, afundar: 10, atraso: 0, folhas: 1.6 },
  { grupo: 'arvores', indice: 2, lado: 'direita', centro: 14, escala: 1, afundar: 10, atraso: 80, folhas: 1.6 },
  { grupo: 'arbustos', indice: 1, lado: 'esquerda', centro: 42, escala: 1, afundar: 3, atraso: 260, folhas: 0 },
  { grupo: 'arbustos', indice: 0, lado: 'direita', centro: 44, escala: 1, afundar: 3, atraso: 320, folhas: 0 },
];

// Tamanho de um pixel do sprite na tela: o carvalho da frente ocupa até 85% da altura do
// quadro e, em quadro estreito, até 26% da largura (senão cobriria os botões).
const ALTURA_REFERENCIA = 147;
const LARGURA_REFERENCIA = 71;

const SUBIDA_MS = 1100; // a subida da mais atrasada termina em SUBIDA_MS + o atraso dela

// Quantos pólens e vagalumes ficam no ar ao mesmo tempo, no máximo.
const POLENS = 34;
const VAGALUMES = 9;

interface Planta {
  config: PlantaDaFrente;
  canvas: HTMLCanvasElement;
  quadro: number; // o quadro do vento desenhado agora (-1: nenhum)
  cores: string[]; // alguns verdes da copa, para as folhas que caem
  caixa: { x: number; y: number; w: number; h: number }; // no quadro, em px
  acumulado: number; // folhas "devidas" desde a última que caiu
}

interface FolhaCaindo extends Queda {
  desenho: DesenhoDeFolha;
  profundidade: number; // 1 = perto (maior, mais rápida); menos que isso, mais longe
}

// Pólen e vagalume: pontos de luz que vagueiam.
interface Luz {
  tipo: 'polen' | 'vagalume';
  x: number;
  y: number;
  rumo: number; // direção em que vai, rad
  velocidade: number; // px/s
  fase: number;
  vida: number;
  duracao: number;
}

let camada: HTMLElement | null = null;
let folhaCenario: HTMLImageElement;
let plantas: Planta[] = [];
let telaFolhas: HTMLCanvasElement;
let folhas: FolhaCaindo[] = [];
let luzes: Luz[] = [];
let rodando = false;
let pixel = 1;
// O tamanho do quadro do jogo, onde a cena mora (ver #inicio em inicio.css).
let largura = 0;
let altura = 0;

const semMovimento = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sortear = (min: number, max: number): number => min + Math.random() * (max - min);
const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(Math.random() * lista.length)];

// Alguns verdes da metade de cima do sprite (a copa), para as folhas saírem da cor da árvore.
// Poucos e bem diferentes entre si: cada cor vira um desenho de folha guardado.
function coresDaCopa(canvas: HTMLCanvasElement): string[] {
  const { width: w, height: h } = canvas;
  const px = contexto2d(canvas).getImageData(0, 0, w, Math.ceil(h * 0.5)).data;
  const todas: [number, number, number][] = [];
  for (let i = 0; i < px.length; i += 4 * 5) {
    const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    // Só o verde das folhas (o marrom dos galhos fica de fora).
    if (a > 200 && g > r + 12 && g > b + 12) todas.push([r, g, b]);
  }
  if (!todas.length) return ['#4f8a3a'];
  todas.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  // Cinco tons, do escuro ao claro, sem os extremos.
  return [0.2, 0.38, 0.55, 0.7, 0.85].map((f) => {
    const [r, g, b] = todas[Math.floor(f * (todas.length - 1))];
    return `rgb(${r}, ${g}, ${b})`;
  });
}

function desenharPlanta(p: Planta, quadro: number): void {
  if (p.quadro === quadro) return;
  p.quadro = quadro;
  const q = QUADROS_CENARIO[p.config.grupo][p.config.indice][quadro];
  const c = contexto2d(p.canvas);
  c.clearRect(0, 0, p.canvas.width, p.canvas.height);
  c.drawImage(folhaCenario, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
}

// O tamanho do quadro do jogo (o #inicio). Quando a cena entra, a tela nova ainda pode não estar
// na página e o #inicio, vazio, fica escondido (tamanho 0: as árvores sumiam na volta de uma
// partida). Aí vale a mesma conta do CSS do #inicio, e o observador acerta quando ele aparece.
function tamanhoDoQuadro(): { w: number; h: number } {
  const quadro = palco();
  if (quadro.clientWidth > 0 && quadro.clientHeight > 0) return { w: quadro.clientWidth, h: quadro.clientHeight };
  return {
    w: Math.min(innerWidth, (innerHeight * 16) / 9),
    h: Math.min(innerHeight, Math.max((innerWidth * 9) / 16, 400)),
  };
}

// Tamanho e lugar de cada planta para o tamanho atual do quadro.
function posicionar(): void {
  const { w: larguraQuadro, h: alturaQuadro } = tamanhoDoQuadro();
  if (larguraQuadro === largura && alturaQuadro === altura && telaFolhas.width === largura) return;
  largura = larguraQuadro;
  altura = alturaQuadro;
  pixel = Math.min((0.85 * altura) / ALTURA_REFERENCIA, (0.26 * largura) / LARGURA_REFERENCIA);
  for (const p of plantas) {
    const { w, h, m = 0 } = QUADROS_CENARIO[p.config.grupo][p.config.indice][0];
    const escala = pixel * p.config.escala;
    // O centro do tronco fica em `centro` da beirada; o recorte tem `m` px a mais à esquerda
    // para a copa vergar (ver esquerdaDaPlanta em mundo/cenario.ts).
    const centro = p.config.centro * pixel;
    const meioDoTronco = (m + (w - m) / 2) * escala;
    const x = p.config.lado === 'esquerda' ? centro - meioDoTronco : largura - centro - meioDoTronco;
    const y = altura - (h - p.config.afundar) * escala;
    Object.assign(p.canvas.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${w * escala}px`,
      height: `${h * escala}px`,
    });
    p.caixa = { x, y, w: w * escala, h: h * escala };
  }
  telaFolhas.width = largura;
  telaFolhas.height = altura;
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
  // A camada cobre o quadro: mudou de tamanho (a janela, ou o quadro que apareceu), reposiciona.
  new ResizeObserver(() => {
    if (camada?.isConnected) posicionar();
  }).observe(camada);
}

// Põe a cena no fundo da tela (por baixo do conteúdo dela). `entrar`: as plantas sobem de
// baixo — ao abrir a tela inicial; passando entre os menus, ela só muda de lugar.
export function anexarCena(tela: HTMLElement, entrar = false): void {
  if (!camada) return;
  tela.prepend(camada);
  largura = altura = 0; // mede de novo
  posicionar();
  if (entrar && !semMovimento()) {
    const el = camada;
    folhas = [];
    luzes = [];
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
    p.acumulado += p.config.folhas * rajada(tempo) * dt;
    while (p.acumulado >= 1) {
      p.acumulado--;
      soltarFolha(p);
    }
  }
  if (!parado && !subindo) soltarLuzes(dt);
  atualizar(dt, tempo);
  desenhar(tempo);
  requestAnimationFrame(quadro);
}

// De tempos em tempos vem uma rajada: as folhas caem mais e vão mais para o lado.
function rajada(tempo: number): number {
  const onda = Math.max(0, Math.sin(tempo * 0.45));
  return 1 + 1.4 * onda ** 4;
}

// Uma folha sai de um ponto da copa e cai para a esquerda, com o vento, balançando. As das
// árvores de trás são menores e mais lentas; algumas das da frente são grandes, como se
// passassem perto.
function soltarFolha(p: Planta): void {
  const { x, y, w, h } = p.caixa;
  const perto = p.config.escala >= 1;
  const tamanho: TamanhoDeFolha = perto ? escolher(['pequena', 'media', 'media', 'grande']) : escolher(['pequena', 'pequena', 'media']);
  const profundidade = perto ? sortear(0.85, 1.15) : sortear(0.55, 0.75);
  const passo = (pixel / 4) * profundidade; // as velocidades foram acertadas com o pixel do sprite em 4 px
  const rodopia = Math.random() < 0.55;
  folhas.push({
    x: x + w * sortear(0.15, 0.85),
    y: y + h * sortear(0.08, 0.42),
    vento: -sortear(10, 30) * passo,
    descida: sortear(34, 58) * passo,
    balanco: sortear(10, 22) * passo,
    ritmo: sortear(1.6, 2.6),
    fase: sortear(0, Math.PI * 2),
    giro: sortear(0, Math.PI * 2),
    rodopio: rodopia ? sortear(2.5, 6) * (Math.random() < 0.5 ? -1 : 1) : sortear(-0.6, 0.6),
    vida: 0,
    desenho: folhaPronta(escolher(p.cores), tamanho),
    profundidade,
  });
}

// O pólen flutua em qualquer lugar do quadro; os vagalumes, perto do chão e das árvores.
function soltarLuzes(dt: number): void {
  const polens = luzes.filter((l) => l.tipo === 'polen').length;
  if (polens < POLENS && Math.random() < dt * 9) {
    luzes.push({
      tipo: 'polen',
      x: sortear(0, largura),
      y: sortear(altura * 0.08, altura * 0.92),
      rumo: sortear(0, Math.PI * 2),
      velocidade: sortear(6, 16) * (pixel / 4),
      fase: sortear(0, Math.PI * 2),
      vida: 0,
      duracao: sortear(4, 8),
    });
  }
  const vagalumes = luzes.length - polens;
  if (vagalumes < VAGALUMES && Math.random() < dt * 2) {
    const lado = Math.random() < 0.5;
    luzes.push({
      tipo: 'vagalume',
      x: lado ? sortear(0, largura * 0.3) : sortear(largura * 0.7, largura),
      y: sortear(altura * 0.55, altura * 0.95),
      rumo: sortear(0, Math.PI * 2),
      velocidade: sortear(14, 26) * (pixel / 4),
      fase: sortear(0, Math.PI * 2),
      vida: 0,
      duracao: sortear(5, 9),
    });
  }
}

function atualizar(dt: number, tempo: number): void {
  const vento = rajada(tempo);
  for (const f of folhas) cair(f, dt, vento);
  const margem = pixel * 12;
  folhas = folhas.filter((f) => f.y < altura + margem && f.x > -margem);

  for (const l of luzes) {
    l.vida += dt;
    // Vagueiam: o rumo vira devagar para um lado e para o outro.
    l.rumo += Math.sin(l.vida * (l.tipo === 'vagalume' ? 1.3 : 0.7) + l.fase) * dt * 1.6;
    const subir = l.tipo === 'polen' ? -3 * (pixel / 4) : 0; // o pólen sobe no ar quente
    l.x += (Math.cos(l.rumo) * l.velocidade - (vento - 1) * 12) * dt;
    l.y += (Math.sin(l.rumo) * l.velocidade * 0.6 + subir) * dt;
  }
  luzes = luzes.filter((l) => l.vida < l.duracao);
}

function desenhar(tempo: number): void {
  const c = contexto2d(telaFolhas);
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, telaFolhas.width, telaFolhas.height);
  const u = Math.max(2, Math.round(pixel * 0.5)); // um pixel das luzes

  // Primeiro as luzes (por trás das folhas), somando luz.
  c.globalCompositeOperation = 'lighter';
  for (const l of luzes) {
    const t = l.vida / l.duracao;
    const entra = Math.min(1, t * 5) * Math.min(1, (1 - t) * 4);
    if (l.tipo === 'polen') {
      const pisca = 0.6 + 0.4 * Math.sin(tempo * 3 + l.fase);
      const a = entra * pisca;
      desenharHalo(c, '#ffe7a3', l.x, l.y, u * 3.2, a * 0.35);
      c.globalAlpha = a * 0.9;
      c.fillStyle = '#fff6d6';
      c.fillRect(Math.round(l.x - u / 2), Math.round(l.y - u / 2), u, u);
    } else {
      // O vagalume acende e apaga devagar, e às vezes dá uma piscada forte com brilho em cruz.
      const acende = Math.max(0, Math.sin(tempo * 1.7 + l.fase)) ** 2;
      const a = entra * (0.15 + 0.85 * acende);
      desenharHalo(c, '#c8f25a', l.x, l.y, u * 5.5, a * 0.45);
      desenharHalo(c, '#f4ffc0', l.x, l.y, u * 2, a * 0.6);
      if (acende > 0.9) desenharBrilho(c, l.x, l.y, u, (acende - 0.9) * 10 * 0.6, '#eaffa8', entra);
      c.globalAlpha = a;
      c.fillStyle = '#fbffe0';
      c.fillRect(Math.round(l.x - u / 2), Math.round(l.y - u / 2), u, u);
    }
  }

  // Depois as folhas, com a própria cor.
  c.globalCompositeOperation = 'source-over';
  const unidadeFolha = Math.max(2, pixel * 0.6);
  for (const f of folhas) {
    const alfa = Math.min(1, f.vida * 4) * (f.profundidade < 0.8 ? 0.85 : 1);
    desenharFolha(c, f.desenho, f.x, f.y, unidadeFolha * f.profundidade, inclinacao(f), f.giro, alfa);
  }
  c.globalAlpha = 1;
}
