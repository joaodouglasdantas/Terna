// O fundo dos menus: a floresta ao pôr do sol (assets/tela-inicial.webp) — as árvores grandes
// emoldurando as beiradas, a bandeira, as lanternas, as tochas e a fogueira, o rio e as cachoeiras
// — e tudo o que dá vida a ela:
// - a arte respira devagar (um zoom que vai e volta) e segue de leve o mouse (paralaxe);
// - o vento balança as copas e a bandeira, e a água das cachoeiras e do rio ondula: esses pedaços
//   da arte são redesenhados por cima dela em faixas finas, cada faixa um pouco deslocada por uma
//   onda que corre (com a borda esfumada, para não mostrar o recorte);
// - as luzes da fogueira, das tochas e das lanternas tremulam, e o sol pulsa;
// - da fogueira e das tochas sobem fagulhas; bandos de pássaros cruzam o céu batendo as asas,
//   por trás das árvores das beiradas;
//   o rio brilha e as cachoeiras soltam espuma;
// - das copas caem folhas em pixel, balançando como pêndulo e rodopiando; flutua pólen na luz e
//   piscam vagalumes perto do chão.
// Fica por baixo da logo e dos botões, sempre dentro do quadro do jogo (as margens pretas ficam
// livres). É uma peça só, que passa de uma tela para a outra (inicial ↔ seleção ↔ multiplayer)
// sem recomeçar; o laço dela para sozinho quando ela sai da página (a partida começou).
//
// Os lugares da arte são frações do quadro (a arte e o quadro são 16:9): x da largura, y da altura.

import urlArvores from '../assets/tela-inicial-arvores.png';
import urlArte from '../assets/tela-inicial.webp';
import { carregarImagem, contexto2d, novoCanvas } from '../motor/imagens';
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

type Area = { x0: number; x1: number; y0: number; y1: number };

// As luzes que tremulam por cima da arte: o centro e o raio da luz (em % da largura).
const LUZES_DA_ARTE = [
  { tipo: 'fogo', x: 16.9, y: 81, r: 9 }, // a fogueira
  { tipo: 'fogo', x: 9.4, y: 71.5, r: 4 }, // a tocha da cerca
  { tipo: 'fogo', x: 35, y: 80.8, r: 4 }, // a tocha do meio
  { tipo: 'lanterna', x: 13.6, y: 44.8, r: 5 },
  { tipo: 'lanterna', x: 93.7, y: 69.7, r: 5 },
  { tipo: 'sol', x: 76.9, y: 32, r: 11 },
  { tipo: 'nevoa', x: 81, y: 50, r: 6 }, // a espuma no pé da cachoeira grande
  { tipo: 'nevoa', x: 79.8, y: 67.5, r: 4 }, // e na de baixo
] as const;

// Os pedaços da arte que se mexem: onde (fração do quadro; a borda é uma elipse esfumada) e
// como. `onda`: a força (em pixels da arte), o ritmo (rad/s), o tamanho da onda (rad por pixel
// da arte, de cima para baixo) e quanto a força cresce descendo (a bandeira presa em cima).
interface Pedaco {
  area: Area;
  onda: { forca: number; ritmo: number; passo: number; desce: number };
}
const PEDACOS: Pedaco[] = [
  // As copas: balançam devagar, mais em cima (a ponta dos galhos).
  { area: { x0: 0, x1: 0.3, y0: 0, y1: 0.36 }, onda: { forca: 2.2, ritmo: 1.1, passo: 0.018, desce: -0.6 } },
  { area: { x0: 0.72, x1: 1, y0: 0, y1: 0.32 }, onda: { forca: 2.2, ritmo: 1.25, passo: 0.02, desce: -0.6 } },
  { area: { x0: 0.9, x1: 1, y0: 0.22, y1: 0.62 }, onda: { forca: 1.4, ritmo: 1.4, passo: 0.03, desce: 0 } },
  { area: { x0: 0, x1: 0.07, y0: 0.3, y1: 0.7 }, onda: { forca: 1.4, ritmo: 1.2, passo: 0.03, desce: 0 } },
  // A bandeira tremula, presa na barra.
  { area: { x0: 0.066, x1: 0.13, y0: 0.4, y1: 0.63 }, onda: { forca: 2.4, ritmo: 3.2, passo: 0.09, desce: 1 } },
  // As cachoeiras: a água treme depressa, em ondas curtas.
  { area: { x0: 0.787, x1: 0.833, y0: 0.4, y1: 0.52 }, onda: { forca: 1.2, ritmo: 9, passo: 0.5, desce: 0 } },
  { area: { x0: 0.782, x1: 0.815, y0: 0.6, y1: 0.69 }, onda: { forca: 1, ritmo: 9, passo: 0.5, desce: 0 } },
  // O rio ondula.
  { area: { x0: 0.44, x1: 0.83, y0: 0.7, y1: 0.81 }, onda: { forca: 1.3, ritmo: 2.2, passo: 0.35, desce: 0 } },
];
const FAIXA = 2; // altura de cada faixa redesenhada, em pixels da arte

// De onde saem as folhas (as copas), as fagulhas (o fogo), a espuma (o pé das cachoeiras) e os
// brilhos do rio; e por onde passam os pássaros.
const COPAS: Area[] = [
  { x0: 0.02, x1: 0.24, y0: 0.03, y1: 0.3 },
  { x0: 0.76, x1: 0.99, y0: 0.02, y1: 0.24 },
];
const FOGOS = [
  { x: 0.169, y: 0.8, forca: 1 },
  { x: 0.094, y: 0.705, forca: 0.35 },
  { x: 0.35, y: 0.8, forca: 0.35 },
];
const PES_DAS_CACHOEIRAS = [
  { x: 0.81, y: 0.505, largura: 0.03 },
  { x: 0.798, y: 0.675, largura: 0.02 },
];
const RIO: Area = { x0: 0.46, x1: 0.8, y0: 0.72, y1: 0.8 };
const CEU: Area = { x0: 0, x1: 1, y0: 0.06, y1: 0.3 };

// Verdes das copas da arte, para as folhas que caem.
const VERDES = ['#2f6b2a', '#3f8a32', '#57a83a', '#7cc44a', '#9ad04a'];

// Quantos de cada ficam no ar ao mesmo tempo, no máximo.
const POLENS = 34;
const VAGALUMES = 10;
const FOLHAS_POR_SEGUNDO = 1.4; // por copa
const ENTRADA_MS = 1400;
// A paralaxe: até quanto (fração do quadro) a arte anda seguindo o mouse, e quão depressa chega.
const PARALAXE = 0.012;
const SEGUE = 2.5; // por segundo

interface FolhaCaindo extends Queda {
  desenho: DesenhoDeFolha;
  profundidade: number; // 1 = perto (maior, mais rápida); menos que isso, mais longe
}

// Pólen, vagalume, fagulha, espuma e brilho do rio: pontos de luz.
interface Luz {
  tipo: 'polen' | 'vagalume' | 'fagulha' | 'espuma' | 'brilho';
  x: number;
  y: number;
  vx: number;
  vy: number;
  rumo: number; // direção em que vai, rad (pólen e vagalume vagueiam)
  velocidade: number;
  fase: number;
  vida: number;
  duracao: number;
}

// Um bando de pássaros cruzando o céu.
interface Passaro {
  dx: number; // lugar no bando, em px
  dy: number;
  fase: number;
}
interface Bando {
  x: number;
  y: number;
  vx: number;
  passaros: Passaro[];
  tempo: number;
}

// O lugar fixo da cena: um quadro do tamanho do #inicio, logo atrás dele, que fica na página o
// tempo todo (as telas do menu passam por cima; entre uma e outra, a cena continua ali, e o jogo
// atrás não aparece). Escondido durante a partida.
let palcoDaCena: HTMLElement | null = null;
let camada: HTMLElement | null = null;
let arte: HTMLElement;
let tela: HTMLCanvasElement;
let folhas: FolhaCaindo[] = [];
let luzes: Luz[] = [];
let bandos: Bando[] = [];
let proximoBando = 3;
let rodando = false;
let pixel = 1; // um "pixel" da arte na tela
let largura = 0;
let altura = 0;
// A paralaxe: para onde o mouse puxa (de -1 a 1) e onde a arte está.
const mouse = { x: 0, y: 0 };
const paralaxe = { x: 0, y: 0 };

const semMovimento = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sortear = (min: number, max: number): number => min + Math.random() * (max - min);
const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(Math.random() * lista.length)];
const naArea = (a: Area): { x: number; y: number } => ({ x: sortear(a.x0, a.x1) * largura, y: sortear(a.y0, a.y1) * altura });

// O tamanho do quadro do jogo (o da cena, igual ao #inicio). Recém-mostrado ele pode ainda não ter
// tamanho: aí vale a mesma conta do CSS, e o observador acerta depois.
function tamanhoDoQuadro(): { w: number; h: number } {
  const quadro = palcoDaCena;
  if (quadro && quadro.clientWidth > 0 && quadro.clientHeight > 0) return { w: quadro.clientWidth, h: quadro.clientHeight };
  return {
    w: Math.min(innerWidth, (innerHeight * 16) / 9),
    h: Math.min(innerHeight, Math.max((innerWidth * 9) / 16, 400)),
  };
}

function medir(): void {
  const { w, h } = tamanhoDoQuadro();
  if (w === largura && h === altura && tela.width === largura) return;
  largura = w;
  altura = h;
  pixel = (0.85 * altura) / 147;
  tela.width = largura;
  tela.height = altura;
}

// Cada pedaço que se mexe, recortado da arte uma vez, com a borda esfumada (a elipse); e, dele,
// só as árvores das beiradas (`frente`, pela máscara assets/tela-inicial-arvores.png), que são
// redesenhadas por cima dos pássaros, com a mesma onda: eles passam por trás delas.
let recortes: { pedaco: Pedaco; canvas: HTMLCanvasElement; frente: HTMLCanvasElement }[] = [];

function recortar(img: HTMLImageElement, mascara: HTMLImageElement): void {
  recortes = PEDACOS.map((pedaco) => {
    const { x0, x1, y0, y1 } = pedaco.area;
    const sx = Math.round(x0 * img.naturalWidth);
    const sy = Math.round(y0 * img.naturalHeight);
    const w = Math.round((x1 - x0) * img.naturalWidth);
    const h = Math.round((y1 - y0) * img.naturalHeight);
    const canvas = novoCanvas(w, h);
    const c = contexto2d(canvas);
    c.drawImage(img, sx, sy, w, h, 0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    c.translate(w / 2, h / 2);
    c.scale(w / 2, h / 2);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, '#000');
    g.addColorStop(0.6, '#000');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = g;
    c.fillRect(-1, -1, 2, 2);
    const frente = novoCanvas(w, h);
    const f = contexto2d(frente);
    f.drawImage(img, sx, sy, w, h, 0, 0, w, h);
    f.globalCompositeOperation = 'destination-in';
    f.drawImage(mascara, Math.round(x0 * mascara.naturalWidth), Math.round(y0 * mascara.naturalHeight), Math.round((x1 - x0) * mascara.naturalWidth), Math.round((y1 - y0) * mascara.naturalHeight), 0, 0, w, h);
    return { pedaco, canvas, frente };
  });
}

// Os pedaços por cima da arte, em faixas: cada faixa deslocada para o lado pela onda. `frente`:
// só as árvores deles (por cima dos pássaros).
function mexer(c: CanvasRenderingContext2D, tempo: number, frente = false): void {
  for (const recorte of recortes) {
    const { pedaco } = recorte;
    const canvas = frente ? recorte.frente : recorte.canvas;
    const { x0, x1, y0, y1 } = pedaco.area;
    const { forca, ritmo, passo, desce } = pedaco.onda;
    const dx = x0 * largura;
    const dy = y0 * altura;
    const escalaX = ((x1 - x0) * largura) / canvas.width;
    const escalaY = ((y1 - y0) * altura) / canvas.height;
    for (let y = 0; y < canvas.height; y += FAIXA) {
      const h = Math.min(FAIXA, canvas.height - y);
      const fracao = y / canvas.height;
      const forcaAqui = forca * Math.max(0, desce >= 0 ? 1 - desce + desce * fracao : 1 + desce * fracao);
      const desvio = Math.sin(tempo * ritmo - y * passo) * forcaAqui * escalaX;
      c.drawImage(canvas, 0, y, canvas.width, h, Math.round(dx + desvio), Math.round(dy + y * escalaY), canvas.width * escalaX, Math.ceil(h * escalaY));
    }
  }
}

// Monta a cena uma vez.
export function prepararCena(): void {
  camada = elemento('div', 'inicio-cena');
  camada.setAttribute('aria-hidden', 'true');
  camada.style.setProperty('--arte', `url("${urlArte}")`);
  arte = elemento('div', 'inicio-cena-arte');
  const fundo = elemento('div', 'inicio-cena-fundo');
  void Promise.all([carregarImagem(urlArte), carregarImagem(urlArvores)]).then(([img, mascara]) => recortar(img, mascara));
  const luzesDaArte = LUZES_DA_ARTE.map(({ x, y, r, tipo }, i) => {
    const luz = elemento('div', `inicio-cena-luz inicio-cena-luz-${tipo}`);
    luz.style.setProperty('--x', `${x}%`);
    luz.style.setProperty('--y', `${y}%`);
    luz.style.setProperty('--r', `${r}%`);
    luz.style.setProperty('--atraso', `${-i * 0.37}s`);
    return luz;
  });
  tela = elemento('canvas', 'inicio-cena-folhas');
  arte.append(fundo, tela, ...luzesDaArte);
  camada.append(arte);
  palcoDaCena = elemento('div', 'inicio-cena-palco');
  palcoDaCena.hidden = true;
  palcoDaCena.append(camada);
  palco().after(palcoDaCena);
  // A arte segue o mouse de leve.
  window.addEventListener('pointermove', (evento) => {
    mouse.x = Math.max(-1, Math.min(1, (evento.clientX / innerWidth) * 2 - 1));
    mouse.y = Math.max(-1, Math.min(1, (evento.clientY / innerHeight) * 2 - 1));
  });
  // A camada cobre o quadro: mudou de tamanho (a janela, ou o quadro que apareceu), mede de novo.
  new ResizeObserver(() => {
    if (palcoDaCena && !palcoDaCena.hidden) medir();
  }).observe(camada);
}

// Mostra a cena atrás das telas do menu. `entrar`: a arte aparece chegando (ao abrir a tela
// inicial); passando entre os menus, ela só continua. (A tela não muda nada: a cena fica no lugar
// dela, atrás do #inicio.)
export function anexarCena(_telaDoMenu?: HTMLElement, entrar = false): void {
  if (!camada || !palcoDaCena) return;
  const estavaEscondida = palcoDaCena.hidden;
  palcoDaCena.hidden = false;
  if (estavaEscondida) largura = altura = 0; // mede de novo
  medir();
  if (entrar && !semMovimento()) {
    const el = camada;
    folhas = [];
    luzes = [];
    el.classList.remove('inicio-cena-entrando');
    // Espera dois quadros: o primeiro depois do carregamento é pesado e comeria a entrada.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.classList.add('inicio-cena-entrando');
        setTimeout(() => el.classList.remove('inicio-cena-entrando'), ENTRADA_MS);
      }),
    );
  }
  if (!rodando) {
    rodando = true;
    requestAnimationFrame(quadro);
  }
}

// Tira a cena (a partida vai começar): some e para de desenhar.
export function esconderCena(): void {
  if (palcoDaCena) palcoDaCena.hidden = true;
}

let ultimo = 0;
function quadro(agora: number): void {
  if (!palcoDaCena || palcoDaCena.hidden) {
    rodando = false;
    ultimo = 0;
    return;
  }
  const dt = ultimo ? Math.min((agora - ultimo) / 1000, 1 / 20) : 0;
  ultimo = agora;
  const tempo = agora / 1000;
  if (!semMovimento()) {
    soltar(dt, tempo);
    atualizar(dt, tempo);
    // A paralaxe: a arte vai devagar para o lado contrário do mouse.
    const k = 1 - Math.exp(-SEGUE * dt);
    paralaxe.x += (-mouse.x * PARALAXE - paralaxe.x) * k;
    paralaxe.y += (-mouse.y * PARALAXE - paralaxe.y) * k;
    arte.style.setProperty('--px', `${(paralaxe.x * largura).toFixed(2)}px`);
    arte.style.setProperty('--py', `${(paralaxe.y * altura).toFixed(2)}px`);
  }
  desenhar(tempo);
  requestAnimationFrame(quadro);
}

// De tempos em tempos vem uma rajada: as folhas caem mais e vão mais para o lado.
function rajada(tempo: number): number {
  const onda = Math.max(0, Math.sin(tempo * 0.45));
  return 1 + 1.4 * onda ** 4;
}

const acumulado = { folhas: [0, 0], fagulhas: [0, 0, 0], espuma: [0, 0], brilhos: 0 };

// Tudo o que nasce neste quadro: folhas, pólen, vagalumes, fagulhas, espuma, brilhos do rio e,
// de vez em quando, um bando de pássaros.
function soltar(dt: number, tempo: number): void {
  const vento = rajada(tempo);
  const u = pixel / 4;
  COPAS.forEach((copa, i) => {
    acumulado.folhas[i] += FOLHAS_POR_SEGUNDO * vento * dt;
    for (; acumulado.folhas[i] >= 1; acumulado.folhas[i]--) soltarFolha(copa);
  });
  FOGOS.forEach((fogo, i) => {
    acumulado.fagulhas[i] += 9 * fogo.forca * dt;
    for (; acumulado.fagulhas[i] >= 1; acumulado.fagulhas[i]--) {
      nova('fagulha', fogo.x * largura + sortear(-6, 6) * u * fogo.forca, fogo.y * altura, sortear(-8, 8) * u, -sortear(40, 80) * u, sortear(0.7, 1.5));
    }
  });
  PES_DAS_CACHOEIRAS.forEach((pe, i) => {
    acumulado.espuma[i] += 14 * dt;
    for (; acumulado.espuma[i] >= 1; acumulado.espuma[i]--) {
      nova('espuma', (pe.x + sortear(-pe.largura, pe.largura) / 2) * largura, pe.y * altura, sortear(-14, 14) * u, -sortear(10, 30) * u, sortear(0.5, 1));
    }
  });
  acumulado.brilhos += 5 * dt;
  for (; acumulado.brilhos >= 1; acumulado.brilhos--) {
    const { x, y } = naArea(RIO);
    nova('brilho', x, y, sortear(4, 10) * u, 0, sortear(0.6, 1.2));
  }
  const polens = luzes.filter((l) => l.tipo === 'polen').length;
  if (polens < POLENS && Math.random() < dt * 9) {
    nova('polen', sortear(0, largura), sortear(altura * 0.08, altura * 0.92), 0, 0, sortear(4, 8)).velocidade = sortear(6, 16) * u;
  }
  const vagalumes = luzes.filter((l) => l.tipo === 'vagalume').length;
  if (vagalumes < VAGALUMES && Math.random() < dt * 2) {
    const x = Math.random() < 0.5 ? sortear(0, largura * 0.35) : sortear(largura * 0.62, largura);
    nova('vagalume', x, sortear(altura * 0.5, altura * 0.9), 0, 0, sortear(5, 9)).velocidade = sortear(14, 26) * u;
  }
  proximoBando -= dt;
  if (proximoBando <= 0) {
    proximoBando = sortear(7, 15);
    soltarBando();
  }
}

function nova(tipo: Luz['tipo'], x: number, y: number, vx: number, vy: number, duracao: number): Luz {
  const l: Luz = { tipo, x, y, vx, vy, rumo: sortear(0, Math.PI * 2), velocidade: 0, fase: sortear(0, Math.PI * 2), vida: 0, duracao };
  luzes.push(l);
  return l;
}

// Uma folha sai de um ponto da copa e cai com o vento, balançando.
function soltarFolha(copa: Area): void {
  const { x, y } = naArea(copa);
  const perto = Math.random() < 0.6;
  const tamanho: TamanhoDeFolha = perto ? escolher(['pequena', 'media', 'media', 'grande']) : escolher(['pequena', 'pequena', 'media']);
  const profundidade = perto ? sortear(0.85, 1.15) : sortear(0.55, 0.75);
  const passo = (pixel / 4) * profundidade;
  const rodopia = Math.random() < 0.55;
  folhas.push({
    x,
    y,
    vento: -sortear(10, 30) * passo,
    descida: sortear(34, 58) * passo,
    balanco: sortear(10, 22) * passo,
    ritmo: sortear(1.6, 2.6),
    fase: sortear(0, Math.PI * 2),
    giro: sortear(0, Math.PI * 2),
    rodopio: rodopia ? sortear(2.5, 6) * (Math.random() < 0.5 ? -1 : 1) : sortear(-0.6, 0.6),
    vida: 0,
    desenho: folhaPronta(escolher(VERDES), tamanho),
    profundidade,
  });
}

// Um bando de 3 a 6 pássaros em V, entrando por um lado do céu e saindo pelo outro.
function soltarBando(): void {
  const daDireita = Math.random() < 0.6;
  const n = 3 + Math.floor(Math.random() * 4);
  const u = pixel * 0.55;
  const passaros: Passaro[] = [];
  for (let i = 0; i < n; i++) {
    const fileira = Math.ceil(i / 2);
    const lado = i % 2 ? -1 : 1;
    passaros.push({ dx: fileira * 9 * u * (daDireita ? 1 : -1), dy: lado * fileira * 5 * u + sortear(-1, 1) * u, fase: sortear(0, Math.PI * 2) });
  }
  const { y } = naArea(CEU);
  bandos.push({ x: daDireita ? largura + 40 * u : -40 * u, y, vx: (daDireita ? -1 : 1) * sortear(0.05, 0.08) * largura, passaros, tempo: 0 });
}

function atualizar(dt: number, tempo: number): void {
  const vento = rajada(tempo);
  const u = pixel / 4;
  for (const f of folhas) cair(f, dt, vento);
  const margem = pixel * 12;
  folhas = folhas.filter((f) => f.y < altura + margem && f.x > -margem);

  for (const l of luzes) {
    l.vida += dt;
    if (l.tipo === 'polen' || l.tipo === 'vagalume') {
      // Vagueiam: o rumo vira devagar para um lado e para o outro.
      l.rumo += Math.sin(l.vida * (l.tipo === 'vagalume' ? 1.3 : 0.7) + l.fase) * dt * 1.6;
      const subir = l.tipo === 'polen' ? -3 * u : 0; // o pólen sobe no ar quente
      l.x += (Math.cos(l.rumo) * l.velocidade - (vento - 1) * 12) * dt;
      l.y += (Math.sin(l.rumo) * l.velocidade * 0.6 + subir) * dt;
      continue;
    }
    // A fagulha sobe ziguezagueando; a espuma sobe um pouco e cai; o brilho do rio só desliza.
    if (l.tipo === 'fagulha') l.vx += Math.sin(l.vida * 7 + l.fase) * 40 * u * dt;
    if (l.tipo === 'espuma') l.vy += 40 * u * dt;
    l.x += l.vx * dt;
    l.y += l.vy * dt;
  }
  luzes = luzes.filter((l) => l.vida < l.duracao);

  for (const b of bandos) {
    b.tempo += dt;
    b.x += b.vx * dt;
    b.y += Math.sin(b.tempo * 0.8) * 4 * u * dt;
  }
  bandos = bandos.filter((b) => (b.vx < 0 ? b.x > -60 * pixel : b.x < largura + 60 * pixel));
}

// Um pássaro em pixel, de asas para cima ou para baixo (a batida), na cor das silhuetas da arte.
const ASAS = [
  ['x.....x', '.x...x.', '..x.x..', '...x...'],
  ['.......', '...x...', '.xx.xx.', 'x.....x'],
];

function desenharPassaro(c: CanvasRenderingContext2D, x: number, y: number, u: number, batida: number): void {
  c.fillStyle = '#2a1830';
  ASAS[batida].forEach((linha, j) =>
    [...linha].forEach((ch, i) => {
      if (ch === 'x') c.fillRect(Math.round(x + (i - 3) * u), Math.round(y + (j - 2) * u), Math.ceil(u), Math.ceil(u));
    }),
  );
}

function desenhar(tempo: number): void {
  const c = tela.getContext('2d');
  if (!c) return;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, tela.width, tela.height);
  const u = Math.max(2, Math.round(pixel * 0.5)); // um pixel das luzes
  c.imageSmoothingEnabled = true;
  if (!semMovimento()) mexer(c, tempo);
  c.imageSmoothingEnabled = false;

  // Os pássaros, lá longe no céu.
  const up = Math.max(1, pixel * 0.55);
  c.globalAlpha = 0.9;
  for (const b of bandos) {
    for (const p of b.passaros) desenharPassaro(c, b.x + p.dx, b.y + p.dy, up, Math.sin(b.tempo * 9 + p.fase) > 0 ? 0 : 1);
  }
  // As árvores das beiradas na frente deles.
  c.globalAlpha = 1;
  c.imageSmoothingEnabled = true;
  if (bandos.length && !semMovimento()) mexer(c, tempo, true);
  c.imageSmoothingEnabled = false;

  // As luzes, somando luz.
  c.globalCompositeOperation = 'lighter';
  for (const l of luzes) {
    const t = l.vida / l.duracao;
    const entra = Math.min(1, t * 5) * Math.min(1, (1 - t) * 4);
    if (l.tipo === 'polen') {
      const a = entra * (0.6 + 0.4 * Math.sin(tempo * 3 + l.fase));
      desenharHalo(c, '#ffe7a3', l.x, l.y, u * 3.2, a * 0.35);
      c.globalAlpha = a * 0.9;
      c.fillStyle = '#fff6d6';
      c.fillRect(Math.round(l.x - u / 2), Math.round(l.y - u / 2), u, u);
    } else if (l.tipo === 'vagalume') {
      // Acende e apaga devagar, e às vezes dá uma piscada forte com brilho em cruz.
      const acende = Math.max(0, Math.sin(tempo * 1.7 + l.fase)) ** 2;
      const a = entra * (0.15 + 0.85 * acende);
      desenharHalo(c, '#c8f25a', l.x, l.y, u * 5.5, a * 0.45);
      desenharHalo(c, '#f4ffc0', l.x, l.y, u * 2, a * 0.6);
      if (acende > 0.9) desenharBrilho(c, l.x, l.y, u, (acende - 0.9) * 10 * 0.6, '#eaffa8', entra);
      c.globalAlpha = a;
      c.fillStyle = '#fbffe0';
      c.fillRect(Math.round(l.x - u / 2), Math.round(l.y - u / 2), u, u);
    } else if (l.tipo === 'fagulha') {
      // Amarela saindo do fogo, laranja e depois vermelha, apagando.
      const cor = t < 0.3 ? '#ffe28a' : t < 0.65 ? '#ff9a3c' : '#e8502a';
      const a = entra * (0.7 + 0.3 * Math.sin(tempo * 20 + l.fase));
      desenharHalo(c, '#ff9a3c', l.x, l.y, u * 2.5, a * 0.35);
      c.globalAlpha = a;
      c.fillStyle = cor;
      c.fillRect(Math.round(l.x - u / 2), Math.round(l.y - u / 2), u, u);
    } else if (l.tipo === 'espuma') {
      c.globalAlpha = entra * 0.7;
      c.fillStyle = '#e8f6ff';
      c.fillRect(Math.round(l.x - u / 2), Math.round(l.y - u / 2), u, u);
    } else {
      // O brilho do sol no rio: um risquinho que acende e apaga.
      const a = entra * Math.max(0, Math.sin(t * Math.PI));
      desenharHalo(c, '#ffd6a0', l.x, l.y, u * 3, a * 0.3);
      c.globalAlpha = a * 0.9;
      c.fillStyle = '#fff1d8';
      c.fillRect(Math.round(l.x - u), Math.round(l.y - u / 2), u * 2, Math.max(1, Math.round(u / 2)));
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
