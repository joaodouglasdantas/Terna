// A transformação do Grow em golem de pedra e musgo (o terceiro poder, com a barra de energia
// pixy cheia) e a volta. O sprite do golem vem pronto do gerador (assets/grow/golem.png); aqui
// fica o que acontece em volta:
// - Virando golem: a terra racha embaixo dele, pedras e tufos de musgo se soltam do chão e voam
//   em espiral para o corpo, que vai ficando cor de pedra. No pico a forma troca com um estouro de
//   lascas e poeira que cai e assenta no chão.
// - Voltando: rachaduras claras correm pelo golem, e a pedra se desfaz — as pedras caem e rolam
//   no chão, o musgo cai em fiapos — revelando o Grow.
// - De golem: cada passo levanta um pouco de poeira; o musgo solta um fiapo de vez em quando.
//
// A forma dura DURACAO_GOLEM (em compartilhado/conteudo/grow.ts); acabou, ele volta sozinho —
// mas nunca no meio de um Salto ou de uma Investida. O R desfaz antes. Enquanto a pedra se forma
// (ou se desfaz) o corpo não responde.

import { DURACAO_GOLEM, ENERGIA_PIXY, RECARGA_GOLEM } from '@terna/compartilhado';
import { contexto2d, novoCanvas } from '../../motor/imagens';
import { chao } from '../efeitos';
import type { Pose } from '../pose';

export type FormaGrow = 'base' | 'golem';
type Fase = 'parado' | 'formando' | 'assentando';

// Formando: o corpo parado enquanto a pedra sobe. Assentando: a poeira baixando, o corpo já livre.
const FORMAR: Record<FormaGrow, number> = { golem: 0.85, base: 0.5 };
const ASSENTAR: Record<FormaGrow, number> = { golem: 0.5, base: 0.35 };

export const PEDRA = { funda: '#2b241c', escura: '#4a3f33', media: '#75654f', clara: '#a8977a', luz: '#d2c3a2' };
export const MUSGO = { escuro: '#3d5a1e', medio: '#6b8a2a', claro: '#9cbc45' };
const POEIRA = ['#8a7a60', '#a8977a', '#6f624e'];

interface Lasca {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravidade: number;
  vida: number;
  total: number;
  cor: string;
  tam: number;
  pousar: boolean; // cai e para no chão
  atrai: boolean; // voa em espiral para o corpo (a pedra se formando)
  angulo: number;
  raio: number;
}

export interface Golem {
  forma: FormaGrow;
  fase: Fase;
  tempoFase: number;
  resta: number; // segundos que ainda restam de golem
  recarga: number; // segundos, de gente, até poder virar golem de novo
  lascas: Lasca[];
  sobra: number; // fração de lasca a soltar no próximo quadro
  passo: number; // segundos até a próxima nuvem de poeira dos pés
}

export function criarGolem(): Golem {
  return { forma: 'base', fase: 'parado', tempoFase: 0, resta: 0, recarga: 0, lascas: [], sobra: 0, passo: 0 };
}

// Enquanto a pedra se forma (ou se desfaz), o corpo fica parado.
export const golemTransformando = (g: Golem): boolean => g.fase === 'formando';

export const golemPronto = (g: Golem): boolean => g.forma === 'base' && g.fase === 'parado' && g.recarga <= 0;

function destino(g: Golem): FormaGrow {
  if (g.fase === 'formando') return g.forma === 'golem' ? 'base' : 'golem';
  return g.forma;
}

// Começa a troca (devolve se começou). De gente com a recarga correndo não começa, a não ser com
// `forcar` (o outro online: a forma dele vem da rede).
export function alternarGolem(g: Golem, forcar = false): boolean {
  if (g.fase === 'formando') return false;
  if (g.forma === 'base' && g.recarga > 0 && !forcar) return false;
  g.fase = 'formando';
  g.tempoFase = 0;
  return true;
}

// A barra do painel: de gente, a energia pixy (cheia e com a recarga pronta, dá para virar); de
// golem, o tempo que resta, esvaziando.
export function barraDoGolem(g: Golem, energia: number): { cheia: number; ativa: boolean; resta: number; disponivel: boolean } {
  if (g.fase === 'formando' && destino(g) === 'golem') {
    return { cheia: Math.min(1, g.tempoFase / FORMAR.golem), ativa: true, resta: DURACAO_GOLEM, disponivel: false };
  }
  if (g.forma === 'golem') return { cheia: g.resta / DURACAO_GOLEM, ativa: true, resta: g.resta, disponivel: false };
  const cheia = Math.min(1, energia / ENERGIA_PIXY.custoGrow.golem);
  return { cheia, ativa: false, resta: DURACAO_GOLEM, disponivel: cheia >= 1 && golemPronto(g) };
}

// ---- Lascas ----

const aoAcaso = <T>(lista: readonly T[]): T => lista[(Math.random() * lista.length) | 0];
const sortear = (min: number, max: number): number => min + Math.random() * (max - min);

function lasca(g: Golem, l: Partial<Lasca> & { x: number; y: number }): void {
  const total = l.total ?? sortear(0.5, 1);
  g.lascas.push({
    vx: 0,
    vy: 0,
    gravidade: 0,
    cor: aoAcaso([PEDRA.escura, PEDRA.media, PEDRA.clara]),
    tam: 1,
    pousar: false,
    atrai: false,
    angulo: 0,
    raio: 0,
    ...l,
    vida: total,
    total,
  });
}

interface CorpoGolem {
  x: number;
  y: number;
  vx: number;
  noChao: boolean;
}

// Uma pedra (ou tufo de musgo) que sai do chão perto do corpo e voa em espiral até ele.
function pedraSubindo(g: Golem, corpo: CorpoGolem): void {
  const lado = Math.random() < 0.5 ? -1 : 1;
  const musgo = Math.random() < 0.3;
  lasca(g, {
    x: corpo.x + lado * sortear(8, 26),
    y: chao() - 1,
    atrai: true,
    angulo: lado > 0 ? 0 : Math.PI,
    raio: sortear(8, 26),
    total: 0.6,
    tam: musgo ? 1 : Math.random() < 0.4 ? 3 : 2,
    cor: musgo ? aoAcaso([MUSGO.medio, MUSGO.claro]) : aoAcaso([PEDRA.escura, PEDRA.media, PEDRA.clara]),
  });
}

// O estouro no pico: lascas e poeira para todos os lados, que caem e assentam no chão.
function estourar(g: Golem, corpo: CorpoGolem, virouGolem: boolean): void {
  const cy = corpo.y - (virouGolem ? 22 : 18);
  for (let i = 0; i < (virouGolem ? 26 : 34); i++) {
    const a = sortear(Math.PI * 1.05, Math.PI * 1.95) + (Math.random() < 0.2 ? Math.PI * 0.6 : 0);
    const v = sortear(40, virouGolem ? 130 : 90);
    const musgo = !virouGolem && Math.random() < 0.3;
    lasca(g, {
      x: corpo.x + sortear(-8, 8),
      y: cy + sortear(-14, 14),
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      gravidade: 420,
      pousar: true,
      tam: musgo ? 1 : Math.random() < 0.35 ? 2 : 1,
      cor: musgo ? aoAcaso([MUSGO.escuro, MUSGO.medio]) : aoAcaso([PEDRA.escura, PEDRA.media, PEDRA.clara, PEDRA.luz]),
      total: sortear(0.9, 1.6),
    });
  }
  poeira(g, corpo.x, 16, 22);
}

// Uma nuvem de poeira rente ao chão, abrindo para os lados.
function poeira(g: Golem, x: number, quantas: number, largura: number): void {
  for (let i = 0; i < quantas; i++) {
    const lado = Math.random() < 0.5 ? -1 : 1;
    lasca(g, {
      x: x + lado * sortear(0, largura * 0.4),
      y: chao() - sortear(1, 4),
      vx: lado * sortear(15, 55),
      vy: sortear(-18, -4),
      gravidade: 10,
      tam: 2,
      cor: aoAcaso(POEIRA),
      total: sortear(0.4, 0.8),
    });
  }
}

function atualizarLascas(g: Golem, dt: number, corpo: CorpoGolem): void {
  const yChao = chao();
  for (const l of g.lascas) {
    l.vida -= dt;
    if (l.atrai) {
      // Espiral para o peito: o raio fecha, o ângulo gira e ela sobe.
      const p = 1 - l.vida / l.total;
      l.angulo += dt * 9;
      const raio = l.raio * (1 - p);
      l.x = corpo.x + Math.cos(l.angulo) * raio;
      l.y = yChao - 1 - (yChao - (corpo.y - 20)) * Math.min(1, p * 1.3) + Math.sin(l.angulo) * raio * 0.25;
      continue;
    }
    l.vy += l.gravidade * dt;
    l.x += l.vx * dt;
    l.y += l.vy * dt;
    if (l.pousar && l.y >= yChao - 1) {
      l.y = yChao - 1;
      l.vy = 0;
      l.vx *= 0.3; // rola um pouquinho e para
      l.gravidade = 0;
    }
    if (!l.pousar) l.vx *= Math.max(0, 1 - dt * 3); // a poeira freia
  }
  g.lascas = g.lascas.filter((l) => l.vida > 0);
}

// ---- Laço ----

export function atualizarGolem(g: Golem, dt: number, corpo: CorpoGolem, emManobra: boolean): void {
  if (g.fase !== 'parado') {
    g.tempoFase += dt;
    const indo = destino(g);
    if (g.fase === 'formando') {
      // A pedra sobe do chão para o corpo (virando golem); voltando, a luz das rachaduras.
      if (indo === 'golem') {
        g.sobra += dt * 34;
        for (; g.sobra >= 1; g.sobra--) pedraSubindo(g, corpo);
      } else if (Math.random() < dt * 30) {
        lasca(g, { x: corpo.x + sortear(-10, 10), y: corpo.y - sortear(4, 40), vy: sortear(10, 40), gravidade: 300, pousar: true, total: 1 });
      }
      if (g.tempoFase >= FORMAR[indo]) {
        g.forma = indo;
        g.fase = 'assentando';
        g.tempoFase = 0;
        estourar(g, corpo, indo === 'golem');
        if (indo === 'golem') g.resta = DURACAO_GOLEM;
        else g.recarga = RECARGA_GOLEM;
      }
    } else if (g.tempoFase >= ASSENTAR[g.forma]) {
      g.fase = 'parado';
    }
  }
  // O tempo de golem corre desde a troca; acabou, a volta começa sozinha (fora de um golpe).
  if (g.forma === 'golem' && g.fase !== 'formando') {
    g.resta = Math.max(0, g.resta - dt);
    if (g.resta === 0 && !emManobra) alternarGolem(g);
  }
  if (g.forma === 'base' && g.fase !== 'formando') g.recarga = Math.max(0, g.recarga - dt);
  // Os passos pesados do golem levantam poeira; o musgo solta um fiapo de vez em quando.
  if (g.forma === 'golem') {
    g.passo -= dt;
    if (corpo.noChao && Math.abs(corpo.vx) > 1 && g.passo <= 0) {
      g.passo = 0.28;
      poeira(g, corpo.x - Math.sign(corpo.vx) * 6, 4, 10);
    }
    if (Math.random() < dt * 1.5) {
      lasca(g, { x: corpo.x + sortear(-9, 9), y: corpo.y - sortear(20, 40), vx: sortear(-6, 6), vy: 8, gravidade: 60, pousar: true, cor: aoAcaso([MUSGO.medio, MUSGO.claro]), total: 1.4 });
    }
  }
  atualizarLascas(g, dt, corpo);
}

// Uma nuvem grande de poeira no chão (o tombo do Salto, o fim da Investida): de fora, pelos poderes.
export function levantarPoeira(g: Golem, x: number, quantas = 18, largura = 40): void {
  poeira(g, x, quantas, largura);
}

// ---- Desenho ----

// O corpo coberto de uma cor só (a pedra se formando por cima do Grow, as rachaduras de luz).
const tingidos = new Map<string, WeakMap<HTMLCanvasElement, HTMLCanvasElement>>();

function tingido(imagem: HTMLCanvasElement, cor: string): HTMLCanvasElement {
  let porCor = tingidos.get(cor);
  if (!porCor) tingidos.set(cor, (porCor = new WeakMap()));
  let t = porCor.get(imagem);
  if (!t) {
    t = novoCanvas(imagem.width, imagem.height);
    const c = contexto2d(t);
    c.drawImage(imagem, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = cor;
    c.fillRect(0, 0, t.width, t.height);
    porCor.set(imagem, t);
  }
  return t;
}

function desenharNoCorpo(ctx: CanvasRenderingContext2D, pose: Pose, imagem: HTMLCanvasElement, alfa: number): void {
  if (alfa <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alfa);
  if (pose.direcao === -1) {
    ctx.translate(pose.x + pose.eixo, pose.topo);
    ctx.scale(-1, 1);
    ctx.drawImage(imagem, 0, 0);
  } else {
    ctx.drawImage(imagem, pose.x - pose.eixo, pose.topo);
  }
  ctx.restore();
}

// Antes do sprite: as rachaduras no chão embaixo dele enquanto a pedra se forma.
export function desenharGolemAtras(ctx: CanvasRenderingContext2D, g: Golem, pose: Pose): void {
  if (g.fase !== 'formando' || destino(g) !== 'golem') return;
  const p = Math.min(1, g.tempoFase / FORMAR.golem);
  const yChao = chao();
  ctx.save();
  ctx.fillStyle = PEDRA.funda;
  for (let i = 0; i < 6; i++) {
    const lado = i % 2 ? 1 : -1;
    let x = Math.round(pose.x + lado * (4 + (i >> 1) * 7));
    const fundo = Math.round((2 + (i % 3)) * p * 2);
    for (let d = 0; d < fundo; d++) {
      if (d % 2) x += lado;
      ctx.fillRect(x, yChao + d, 1, 1);
    }
  }
  ctx.restore();
}

// Depois do sprite: a pedra cobrindo o corpo (ou as rachaduras de luz na volta) e as lascas.
export function desenharGolemNaFrente(ctx: CanvasRenderingContext2D, g: Golem, tempo: number, pose: Pose): void {
  if (g.fase === 'formando') {
    const p = Math.min(1, g.tempoFase / FORMAR[destino(g)]);
    if (destino(g) === 'golem') {
      // A pedra cobre o Grow de baixo para cima (o corpo todo vai ficando cor de pedra).
      desenharNoCorpo(ctx, pose, tingido(pose.imagem, PEDRA.media), p * p * 0.95);
    } else {
      // Rachaduras claras piscando pelo golem, cada vez mais.
      const pisca = 0.5 + 0.5 * Math.sin(tempo * (20 + p * 40));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      desenharNoCorpo(ctx, pose, tingido(pose.imagem, '#c8e090'), 0.35 * p * pisca);
      ctx.restore();
    }
  } else if (g.fase === 'assentando' && g.forma === 'golem') {
    // Recém-formado: a cor de pedra some do sprite do golem, revelando o musgo.
    desenharNoCorpo(ctx, pose, tingido(pose.imagem, PEDRA.clara), 0.8 * (1 - g.tempoFase / ASSENTAR.golem));
  }
  ctx.save();
  for (const l of g.lascas) {
    ctx.globalAlpha = l.atrai ? Math.min(1, (l.total - l.vida) * 6) : Math.min(1, (l.vida / l.total) * 2);
    ctx.fillStyle = l.cor;
    ctx.fillRect(Math.round(l.x), Math.round(l.y) - (l.tam - 1), l.tam, l.tam);
    if (l.tam >= 2 && !l.atrai) {
      // A luz de cima da pedrinha.
      ctx.fillStyle = PEDRA.luz;
      ctx.fillRect(Math.round(l.x), Math.round(l.y) - (l.tam - 1), 1, 1);
    }
  }
  ctx.restore();
}
