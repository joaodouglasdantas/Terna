// Os três poderes da Margo no mapa (números em compartilhado/conteudo/margo.ts), nas cores da
// cozinha dela — a madeira do rolo, o branco da farinha — e do ganso:
// - Bumerangue: o rolo de massa sai girando da mão dela na direção do cursor, vai até o alcance (ou
//   até bater no chão) e volta para a mão, seguindo-a. Cada passada (a ida e a volta) fere uma vez
//   quem pega. Enquanto ele voa a mão dela está vazia (personagem.ts, `roloFora`).
// - Farinha: o saco voa em arco e, no primeiro corpo ou no chão, estoura numa nuvem branca que fica
//   um tempo no chão: quem está nela fica enfarinhado (lento, sem arranco: `lento`, em
//   efeitos.ts) e perde uma lasquinha de vida de tempos em tempos.
// - Ganso Raivoso: o ganso dela (o companheiro, margo/ganso.ts) estufa, fica bravo e sai correndo
//   atrás do outro, bicando quem está perto do chão; quando a raiva passa, volta para ela.
//
// Online, cada efeito sai do mesmo uso nos dois lados e quem confere o acerto é o lado de quem
// apanha (efeitos.ts), como nos outros poderes; o `lento` do outro chega pela rede.

import { BUMERANGUE, FARINHA, GANSO, MUNDO, type PoderUsado } from '@terna/compartilhado';
import { ombroDe } from '../braco';
import {
  acertaCorpo,
  chao,
  dentroDaFaixa,
  elipse,
  faisca,
  ferirAlvo,
  vivos,
  type Alvo,
  type Ameacas,
  type CorpoAlvo,
  type Dono,
  type Nucleo,
} from '../efeitos';
import { alturaDoGansoBravo, desenharGansoBravo, voltarCompanheiro } from './ganso';

export type PoderMargo = 'bumerangue' | 'farinha' | 'ganso';

interface Bumerangue {
  tipo: 'bumerangue';
  dono: Dono;
  x: number;
  y: number;
  dx: number; // a direção da ida
  dy: number;
  voltando: boolean;
  percorrido: number;
  voltou: number; // px já andados na volta
  idade: number;
  acertou: Set<CorpoAlvo>; // nesta passada (a volta recomeça, depois de `SOLTA_NA_VOLTA`)
}

// Quem a ida pegou só pode ser pego de novo depois de o rolo andar isto na volta: virando dentro do
// corpo dele, no fim do alcance, ele não acerta duas vezes no mesmo instante.
const SOLTA_NA_VOLTA = 24;

interface Saco {
  tipo: 'saco';
  dono: Dono;
  x: number;
  y: number;
  vx: number;
  vy: number;
  idade: number;
}

interface Nuvem {
  tipo: 'nuvem';
  dono: Dono;
  x: number;
  idade: number;
  tiques: Map<CorpoAlvo, number>; // segundos de cada um dentro dela desde a última lasquinha
  fiapos: { dx: number; dy: number; r: number; fase: number }[]; // os tufos da nuvem
}

interface GansoBravo {
  tipo: 'ganso';
  dono: Dono;
  x: number;
  lado: 1 | -1;
  idade: number;
  fase: 'estufando' | 'correndo' | 'voltando';
  ateBicar: number; // segundos até a próxima bicada pronta
  bicou: number; // segundos desde a última bicada (o bote aparece um instante)
  andando: boolean;
  tempo: number; // da animação
}

export type EfeitoMargo = Bumerangue | Saco | Nuvem | GansoBravo;
type Efeitos = Nucleo<EfeitoMargo>;

// A madeira do rolo (a da folha dela), o branco da farinha e as penas.
const MADEIRA = { contorno: '#3c1c0e', escura: '#83421b', media: '#c66b37', clara: '#e88a43', brilho: '#f8ce98' };
const FARINHA_COR = { sombra: '#d8cdb8', meio: '#efe7d6', claro: '#fbf7ee', branco: '#ffffff' };
const PENAS = ['#ffffff', '#f4ede0', '#e2d8c8'];
const VAPOR = 'rgba(230, 230, 236, 0.9)';
const aoAcaso = <T>(lista: readonly T[]): T => lista[(Math.random() * lista.length) | 0];
const sortear = (min: number, max: number): number => min + Math.random() * (max - min);

// Até onde cada poder pega (para a CPU).
export const ALCANCE_MARGO: Record<PoderMargo, number> = {
  bumerangue: BUMERANGUE.alcance - 8,
  farinha: FARINHA.alcance,
  ganso: 400, // ele corre atrás
};

function direcao(uso: { x: number; y: number; alvoX: number; alvoY: number }): { dx: number; dy: number } {
  const dx = uso.alvoX - uso.x;
  const dy = uso.alvoY - uso.y;
  const d = Math.hypot(dx, dy);
  return d < 1 ? { dx: 1, dy: 0 } : { dx: dx / d, dy: dy / d };
}

// A mão dela, para onde o rolo volta: na ponta do braço, na altura do ombro.
function maoDa(dono: Dono): { x: number; y: number } {
  const ombro = ombroDe({ ...dono, heroi: 'margo' });
  return { x: ombro.x + dono.direcao * 4, y: ombro.y + 3 };
}

// Onde o ganso dela está agora (o companheiro); sem ele, um passo atrás dela.
const ondeEstaOGanso = (dono: Dono): number => dono.ganso?.x ?? dono.x - dono.direcao * 13;

export function lancarPoderMargo(e: Efeitos, dono: Dono, uso: PoderUsado & { poder: PoderMargo }): void {
  if (uso.poder === 'bumerangue') {
    const { dx, dy } = direcao(uso);
    e.lista.push({ tipo: 'bumerangue', dono, x: uso.x, y: uso.y, dx, dy, voltando: false, percorrido: 0, voltou: 0, idade: 0, acertou: new Set() });
    return;
  }
  if (uso.poder === 'farinha') {
    const { dx, dy } = direcao(uso);
    e.lista.push({ tipo: 'saco', dono, x: uso.x, y: uso.y, vx: dx * FARINHA.velocidade, vy: dy * FARINHA.velocidade, idade: 0 });
    return;
  }
  const x = ondeEstaOGanso(dono);
  if (dono.ganso) dono.ganso.fora = true;
  e.lista.push({
    tipo: 'ganso',
    dono,
    x,
    lado: uso.alvoX >= x ? 1 : -1,
    idade: 0,
    fase: 'estufando',
    ateBicar: 0,
    bicou: 9,
    andando: false,
    tempo: 0,
  });
  // A raiva: penas voando de onde ele estava.
  for (let k = 0; k < 12; k++) pena(e, x, chao() - 8, 60);
}

// ---- Bumerangue ----

function lascas(e: Efeitos, x: number, y: number): void {
  for (let k = 0; k < 8; k++) faisca(e, x, y, 60, 160, aoAcaso([MADEIRA.clara, MADEIRA.media, MADEIRA.brilho]), false);
  for (let k = 0; k < 5; k++) faisca(e, x, y, 45, 0, FARINHA_COR.branco);
}

function atualizarBumerangue(e: Efeitos, b: Bumerangue, dt: number, alvos: readonly Alvo[]): boolean {
  b.idade += dt;
  if (b.idade >= BUMERANGUE.maximo) return false;
  // Em passos curtos: o rolo rápido não atravessa ninguém entre dois quadros.
  const velocidade = b.voltando ? BUMERANGUE.volta : BUMERANGUE.velocidade;
  const partes = Math.max(1, Math.ceil((velocidade * dt) / 3));
  for (let i = 0; i < partes; i++) {
    const passo = (velocidade * dt) / partes;
    if (!b.voltando) {
      b.x += b.dx * passo;
      b.y += b.dy * passo;
      b.percorrido += passo;
      if (b.percorrido >= BUMERANGUE.alcance || b.y >= chao() - 2 || b.x <= 0 || b.x >= MUNDO) {
        // Chegou ao fim (ou bateu no chão, ou na beirada do mapa): volta, e a volta acerta de novo.
        if (b.y >= chao() - 2) {
          b.y = chao() - 2;
          for (let k = 0; k < 5; k++) faisca(e, b.x, b.y, 40, 200, aoAcaso(['#5a381c', '#8a5a2b']), false);
        }
        b.voltando = true;
      }
    } else {
      const mao = maoDa(b.dono);
      const dx = mao.x - b.x;
      const dy = mao.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d <= Math.max(6, passo)) return false; // de volta na mão
      b.x += (dx / d) * passo;
      b.y += (dy / d) * passo;
      const antes = b.voltou;
      b.voltou += passo;
      if (antes < SOLTA_NA_VOLTA && b.voltou >= SOLTA_NA_VOLTA) b.acertou.clear();
    }
    const alvo = vivos(alvos, b.dono).find((a) => !b.acertou.has(a.corpo) && acertaCorpo(a.corpo, b.x, b.y, BUMERANGUE.raio));
    if (alvo) {
      b.acertou.add(alvo.corpo);
      ferirAlvo(e, alvo, BUMERANGUE.dano);
      lascas(e, b.x, b.y);
    }
  }
  return true;
}

// O rolo girando: um bastão de 9 px com os dois cabos, contornado de escuro, virando com o tempo.
function desenharRolo(ctx: CanvasRenderingContext2D, x: number, y: number, angulo: number): void {
  const cos = Math.cos(angulo);
  const sin = Math.sin(angulo);
  const ponto = (k: number, lado: number, cor: string): void => {
    ctx.fillStyle = cor;
    ctx.fillRect(Math.round(x + cos * k - sin * lado), Math.round(y + sin * k + cos * lado), 1, 1);
  };
  // O contorno primeiro, um pouco mais largo que o rolo.
  for (let k = -6; k <= 6; k += 0.5) {
    const cabo = Math.abs(k) > 3.6;
    for (let l = cabo ? -1 : -1.5; l <= (cabo ? 1 : 1.5); l += 0.5) ponto(k, l, MADEIRA.contorno);
  }
  for (let k = -5.5; k <= 5.5; k += 0.5) {
    const cabo = Math.abs(k) > 3.6;
    if (cabo) {
      ponto(k, 0, MADEIRA.escura);
      continue;
    }
    ponto(k, -0.5, MADEIRA.clara);
    ponto(k, 0.5, MADEIRA.media);
  }
  ponto(-1, -0.5, MADEIRA.brilho);
}

// ---- Farinha ----

// O saco estoura e vira a nuvem (o mesmo efeito na lista: a lista é refeita enquanto os efeitos
// andam, e um efeito novo posto nela nessa hora se perderia).
function estourar(e: Efeitos, s: Saco, x: number, y: number): void {
  const cx = Math.max(10, Math.min(MUNDO - 10, x));
  const nuvem: Nuvem = {
    tipo: 'nuvem',
    dono: s.dono,
    x: cx,
    idade: 0,
    tiques: new Map(),
    fiapos: Array.from({ length: 11 }, (_, i) => ({
      dx: (i / 10 - 0.5) * FARINHA.raio * 1.8 + sortear(-3, 3),
      dy: sortear(4, FARINHA.altura * 0.7),
      r: sortear(5, 9),
      fase: sortear(0, Math.PI * 2),
    })),
  };
  Object.assign(s, nuvem);
  // O saco rasgando: farinha para todo lado e uns pedaços do pano.
  for (let k = 0; k < 26; k++) faisca(e, x, y, 90, 30, aoAcaso([FARINHA_COR.branco, FARINHA_COR.claro, FARINHA_COR.meio]), false);
  for (let k = 0; k < 4; k++) faisca(e, x, y, 70, 260, '#b89a6a', false);
}

function atualizarSaco(e: Efeitos, s: Saco, dt: number, alvos: readonly Alvo[]): boolean {
  s.idade += dt;
  const partes = Math.max(1, Math.ceil((Math.hypot(s.vx, s.vy) * dt) / 3));
  for (let i = 0; i < partes; i++) {
    const passo = dt / partes;
    s.vy += FARINHA.gravidade * passo;
    s.x += s.vx * passo;
    s.y += s.vy * passo;
    const alvo = vivos(alvos, s.dono).find((a) => acertaCorpo(a.corpo, s.x, s.y, 3));
    if (alvo) {
      ferirAlvo(e, alvo, FARINHA.dano);
      estourar(e, s, alvo.corpo.x, s.y);
      return true;
    }
    if (s.y >= chao() - 1 || s.x <= 0 || s.x >= MUNDO) {
      estourar(e, s, s.x, chao() - 2);
      return true;
    }
  }
  // Um fiozinho de farinha saindo do saco.
  if (Math.random() < dt * 25) faisca(e, s.x, s.y, 8, 40, FARINHA_COR.claro, false);
  return s.idade < 4;
}

function atualizarNuvem(e: Efeitos, n: Nuvem, dt: number, alvos: readonly Alvo[]): boolean {
  n.idade += dt;
  const yChao = chao();
  for (const alvo of vivos(alvos, n.dono)) {
    const c = alvo.corpo;
    const dentro = dentroDaFaixa(c, n.x, FARINHA.raio) && yChao - c.y <= FARINHA.altura;
    if (!dentro) {
      n.tiques.delete(c);
      continue;
    }
    // Online, o "lento" do outro chega pela rede, com o estado dele.
    if (alvo.ferir) c.lento = Math.max(c.lento, FARINHA.depois);
    const tique = (n.tiques.get(c) ?? 0) + dt;
    if (tique >= FARINHA.tique) {
      ferirAlvo(e, alvo, FARINHA.danoTique);
      n.tiques.set(c, tique - FARINHA.tique);
    } else {
      n.tiques.set(c, tique);
    }
  }
  // A farinha no ar: grãozinhos subindo e caindo devagar.
  if (Math.random() < dt * 14) {
    const total = sortear(0.6, 1.2);
    e.particulas.push({
      x: n.x + sortear(-FARINHA.raio, FARINHA.raio),
      y: yChao - sortear(2, FARINHA.altura),
      vx: sortear(-6, 6),
      vy: sortear(-10, 4),
      gravidade: 8,
      vida: total,
      total,
      cor: aoAcaso([FARINHA_COR.branco, FARINHA_COR.claro]),
      somar: false,
    });
  }
  return n.idade < FARINHA.duracao;
}

// Quanto a nuvem está cheia (0 a 1): abre rápido, fica e se desfaz no fim.
function cheiaDaNuvem(n: Nuvem): number {
  const t = n.idade / FARINHA.duracao;
  const abre = Math.min(1, n.idade / 0.15);
  const some = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
  return Math.max(0, abre * some);
}

// Os tufos da nuvem: bolas de farinha translúcidas, mexendo devagar. `frente`: os da frente (mais
// claros e mais transparentes, por cima de quem está dentro).
function desenharNuvem(ctx: CanvasRenderingContext2D, n: Nuvem, tempo: number, frente: boolean): void {
  const cheia = cheiaDaNuvem(n);
  if (cheia <= 0) return;
  const yChao = chao();
  ctx.save();
  n.fiapos.forEach((f, i) => {
    if ((i % 2 === 1) !== frente) return;
    const r = Math.round(f.r * (0.6 + 0.4 * cheia));
    const x = Math.round(n.x + f.dx + Math.sin(tempo * 1.3 + f.fase) * 2);
    const y = Math.round(yChao - f.dy * (0.7 + 0.3 * cheia) + Math.cos(tempo * 1.1 + f.fase) * 1.5);
    ctx.globalAlpha = (frente ? 0.38 : 0.6) * cheia;
    ctx.fillStyle = FARINHA_COR.sombra;
    ctx.beginPath();
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.round(Math.sqrt(r * r - dy * dy));
      ctx.rect(x - w, y + dy + 1, w * 2 + 1, 1);
    }
    ctx.fill();
    ctx.fillStyle = frente ? FARINHA_COR.claro : FARINHA_COR.meio;
    ctx.beginPath();
    for (let dy = -r; dy <= r - 1; dy++) {
      const w = Math.round(Math.sqrt(r * r - dy * dy)) - 1;
      if (w >= 0) ctx.rect(x - w, y + dy, w * 2 + 1, 1);
    }
    ctx.fill();
  });
  // A farinha assentada no chão.
  if (!frente) {
    ctx.globalAlpha = 0.7 * cheia;
    ctx.fillStyle = FARINHA_COR.claro;
    ctx.fillRect(Math.round(n.x - FARINHA.raio), yChao - 1, FARINHA.raio * 2, 1);
    ctx.fillStyle = FARINHA_COR.branco;
    ctx.fillRect(Math.round(n.x - FARINHA.raio * 0.6), yChao - 2, Math.round(FARINHA.raio * 1.2), 1);
  }
  ctx.restore();
}

// O saco de farinha: 4×5, o pano bege amarrado em cima, girando de leve.
function desenharSaco(ctx: CanvasRenderingContext2D, s: Saco): void {
  const x = Math.round(s.x);
  const y = Math.round(s.y);
  const virado = Math.sin(s.idade * 14) > 0;
  ctx.fillStyle = '#5a4428';
  ctx.fillRect(x - 2, y - 2, 5, 6);
  ctx.fillStyle = '#d9c39a';
  ctx.fillRect(x - 1, y - 1, 3, 4);
  ctx.fillStyle = '#f4e6c4';
  ctx.fillRect(x - 1, y - 1, 1, virado ? 2 : 3);
  ctx.fillStyle = '#5a4428';
  ctx.fillRect(x, y - 3, 1, 1); // o nó
  ctx.fillStyle = FARINHA_COR.branco;
  ctx.fillRect(x + (virado ? 1 : 0), y - 4, 1, 1);
}

// ---- Ganso Raivoso ----

function pena(e: Efeitos, x: number, y: number, forca: number): void {
  const a = sortear(-Math.PI, 0);
  const v = forca * sortear(0.4, 1);
  const total = sortear(0.6, 1.1);
  e.particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, gravidade: 60, vida: total, total, cor: aoAcaso(PENAS), somar: false, pousar: true });
}

// Quem ele persegue: o outro de pé mais perto dele.
function presa(g: GansoBravo, alvos: readonly Alvo[]): Alvo | null {
  let melhor: Alvo | null = null;
  for (const a of vivos(alvos, g.dono)) if (!melhor || Math.abs(a.corpo.x - g.x) < Math.abs(melhor.corpo.x - g.x)) melhor = a;
  return melhor;
}

function atualizarGanso(e: Efeitos, g: GansoBravo, dt: number, alvos: readonly Alvo[]): boolean {
  g.idade += dt;
  g.tempo += dt;
  g.bicou += dt;
  g.ateBicar = Math.max(0, g.ateBicar - dt);
  g.andando = false;
  const yChao = chao();
  if (g.fase === 'estufando') {
    if (g.idade >= GANSO.estufa) {
      g.fase = 'correndo';
      for (let k = 0; k < 10; k++) pena(e, g.x, yChao - 12, 70);
    }
    return true;
  }
  if (g.fase === 'correndo') {
    if (g.idade >= GANSO.estufa + GANSO.duracao) {
      g.fase = 'voltando';
      for (let k = 0; k < 8; k++) pena(e, g.x, yChao - 12, 50);
      return true;
    }
    const alvo = presa(g, alvos);
    if (alvo) {
      const c = alvo.corpo;
      const dx = c.x - g.x;
      if (Math.abs(dx) >= 1) g.lado = dx > 0 ? 1 : -1;
      // Corre até encostar nele (o bico na frente do corpo dele).
      const encosta = c.medida.meiaLargura + GANSO.alcance - 2;
      if (Math.abs(dx) > encosta) {
        g.x = Math.max(8, Math.min(MUNDO - 8, g.x + g.lado * Math.min(Math.abs(dx) - encosta, GANSO.velocidade * dt)));
        g.andando = true;
        // A poeira das patinhas.
        if (Math.random() < dt * 20) faisca(e, g.x - g.lado * 4, yChao - 1, 25, 120, aoAcaso(['#8a5a2b', '#6b4424', '#a07a50']), false);
      }
      // Perto e com ele perto do chão: bica.
      const alcanca = Math.abs(dx) <= c.medida.meiaLargura + GANSO.alcance && yChao - c.y <= GANSO.altura;
      if (alcanca && g.ateBicar <= 0) {
        g.ateBicar = GANSO.intervalo;
        g.bicou = 0;
        ferirAlvo(e, alvo, GANSO.dano);
        const bx = g.x + g.lado * 9;
        for (let k = 0; k < 4; k++) pena(e, bx, yChao - 10, 40);
        for (let k = 0; k < 4; k++) faisca(e, bx, yChao - 10, 50, 0, '#fff4dc');
      }
    }
    // Bufando: um vaporzinho sai da cabeça de vez em quando.
    if (Math.random() < dt * 5) {
      const total = sortear(0.4, 0.7);
      e.particulas.push({ x: g.x - g.lado * 2, y: yChao - alturaDoGansoBravo(), vx: sortear(-8, 8), vy: -20, gravidade: -10, vida: total, total, cor: VAPOR, somar: false });
    }
    return true;
  }
  // Voltando: corre para a Margo e, ao chegar, vira o companheiro de novo.
  const casa = g.dono.x - g.dono.direcao * 13;
  const falta = casa - g.x;
  if (Math.abs(falta) <= 4 || g.idade > GANSO.estufa + GANSO.duracao + 5) {
    if (g.dono.ganso) voltarCompanheiro(g.dono.ganso, g.x, g.dono.direcao);
    return false;
  }
  g.lado = falta > 0 ? 1 : -1;
  g.x += g.lado * Math.min(Math.abs(falta), GANSO.volta * dt);
  g.andando = true;
  return true;
}

function desenharGanso(ctx: CanvasRenderingContext2D, g: GansoBravo, tempo: number): void {
  const estufa = g.fase === 'estufando' ? Math.min(1, g.idade / GANSO.estufa) : 1;
  desenharGansoBravo(ctx, g.x, chao(), g.lado, g.tempo, 2, {
    estufa,
    bicando: g.fase === 'correndo' && g.bicou < 0.15,
    correndo: g.andando,
  });
  // Bravo, um "!" vermelho pisca em cima da cabeça no começo da raiva.
  if (g.fase === 'correndo' && g.idade < GANSO.estufa + 0.8 && Math.floor(tempo * 8) % 2 === 0) {
    const x = Math.round(g.x + g.lado * 3);
    const y = chao() - alturaDoGansoBravo() - 7;
    ctx.fillStyle = '#3a0c0c';
    ctx.fillRect(x - 1, y - 1, 3, 7);
    ctx.fillStyle = '#ff4040';
    ctx.fillRect(x, y, 1, 3);
    ctx.fillRect(x, y + 4, 1, 1);
  }
}

// ---- O resto ----

// Passa o tempo de um efeito da Margo; devolve se ele continua no mapa.
export function atualizarEfeitoMargo(e: Efeitos, ef: EfeitoMargo, dt: number, alvos: readonly Alvo[]): boolean {
  if (ef.tipo === 'bumerangue') return atualizarBumerangue(e, ef, dt, alvos);
  if (ef.tipo === 'saco') return atualizarSaco(e, ef, dt, alvos);
  if (ef.tipo === 'nuvem') return atualizarNuvem(e, ef, dt, alvos);
  return atualizarGanso(e, ef, dt, alvos);
}

export function ameacasDaMargo(ef: EfeitoMargo, ameacas: Ameacas): void {
  if (ef.tipo === 'bumerangue') {
    const v = ef.voltando ? BUMERANGUE.volta : BUMERANGUE.velocidade;
    const mao = maoDa(ef.dono);
    const [dx, dy] = ef.voltando ? [mao.x - ef.x, mao.y - ef.y] : [ef.dx, ef.dy];
    const d = Math.hypot(dx, dy) || 1;
    ameacas.projeteis.push({ x: ef.x, y: ef.y, vx: (dx / d) * v, vy: (dy / d) * v });
  } else if (ef.tipo === 'saco') {
    ameacas.projeteis.push({ x: ef.x, y: ef.y, vx: ef.vx, vy: ef.vy });
  } else if (ef.tipo === 'nuvem') {
    // A nuvem já está no chão: sai dela (pular não adianta: ela é alta).
    ameacas.areas.push({ x: ef.x, raio: FARINHA.raio, resta: 0, aviso: 1, baixa: false });
  } else if (ef.fase === 'correndo') {
    // O ganso vem correndo rente ao chão: pula-se por cima.
    ameacas.projeteis.push({ x: ef.x, y: chao() - 6, vx: ef.lado * GANSO.velocidade, vy: 0 });
  }
}

// O rolo voando de `dono` (a mão dela está vazia).
export function roloDoDono(lista: readonly { tipo: string; dono: Dono }[], dono: Dono): boolean {
  return lista.some((ef) => ef.tipo === 'bumerangue' && ef.dono === dono);
}

// Antes dos personagens: a parte de trás da nuvem e o ganso (eles passam na frente dele).
export function desenharMargoNoChao(ctx: CanvasRenderingContext2D, ef: EfeitoMargo, tempo: number): void {
  if (ef.tipo === 'nuvem') desenharNuvem(ctx, ef, tempo, false);
  else if (ef.tipo === 'ganso') desenharGanso(ctx, ef, tempo);
}

// Depois dos personagens: o rolo, o saco e a frente da nuvem (por cima de quem está nela).
export function desenharMargoNaFrente(ctx: CanvasRenderingContext2D, ef: EfeitoMargo, tempo: number): void {
  if (ef.tipo === 'bumerangue') desenharRolo(ctx, ef.x, ef.y, ef.idade * (ef.dx >= 0 ? 22 : -22));
  else if (ef.tipo === 'saco') desenharSaco(ctx, ef);
  else if (ef.tipo === 'nuvem') desenharNuvem(ctx, ef, tempo, true);
}

// Enfarinhado: o corpo solta grãozinhos brancos que caem, e fica um tico mais claro (o branco por
// cima dos pés).
export function desenharEnfarinhado(ctx: CanvasRenderingContext2D, c: CorpoAlvo, tempo: number): void {
  if (c.lento <= 0) return;
  const forca = Math.min(1, c.lento / 0.3);
  ctx.save();
  ctx.globalAlpha = 0.85 * forca;
  for (let i = 0; i < 5; i++) {
    const ciclo = (tempo * 0.8 + i / 5) % 1;
    const x = Math.round(c.x + Math.sin(i * 2.1 + tempo * 2) * (c.medida.meiaLargura - 1));
    const y = Math.round(c.y - c.medida.altura + 4 + ciclo * (c.medida.altura - 2));
    ctx.fillStyle = i % 2 ? FARINHA_COR.branco : FARINHA_COR.meio;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = FARINHA_COR.claro;
  ctx.globalAlpha = 0.5 * forca;
  ctx.fillRect(Math.round(c.x - c.medida.meiaLargura), Math.round(c.y) - 1, c.medida.meiaLargura * 2, 1);
  ctx.restore();
}

// ---- Prévia da mira ----
// O Bumerangue: a linha pontilhada até onde o rolo chega. A Farinha: o arco do saco até o chão e o
// contorno da nuvem onde ele cai. O Ganso: o contorno embaixo do ganso, de onde ele sai.
export function desenharPreviaMargo(
  ctx: CanvasRenderingContext2D,
  poder: PoderMargo,
  origem: { x: number; y: number },
  alvo: { x: number; y: number },
  tempo: number,
  cores: { cor: string; sombra: string; passo: number },
  dono?: Dono,
): void {
  const yChao = chao();
  const ponto = (x: number, y: number): void => {
    ctx.fillStyle = cores.sombra;
    ctx.fillRect(Math.round(x), Math.round(y) + 1, 1, 1);
    ctx.fillStyle = cores.cor;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  if (poder === 'bumerangue') {
    const { dx, dy } = direcao({ x: origem.x, y: origem.y, alvoX: alvo.x, alvoY: alvo.y });
    const corre = (tempo * 20) % cores.passo;
    for (let s = 6 + corre; s <= BUMERANGUE.alcance; s += cores.passo) {
      const y = origem.y + dy * s;
      if (y >= yChao) break;
      ponto(origem.x + dx * s, y);
    }
    return;
  }
  if (poder === 'farinha') {
    const { dx, dy } = direcao({ x: origem.x, y: origem.y, alvoX: alvo.x, alvoY: alvo.y });
    let x = origem.x;
    let y = origem.y;
    let vx = dx * FARINHA.velocidade;
    let vy = dy * FARINHA.velocidade;
    const passo = 1 / 120;
    let andou = 0;
    let proximo = 6 + ((tempo * 20) % cores.passo);
    for (let i = 0; i < 600 && y < yChao - 1; i++) {
      vy += FARINHA.gravidade * passo;
      x += vx * passo;
      y += vy * passo;
      andou += Math.hypot(vx, vy) * passo;
      if (andou >= proximo) {
        proximo += cores.passo;
        ponto(x, y);
      }
    }
    const ry = Math.max(2, Math.round(FARINHA.raio / 7));
    elipse(ctx, x, yChao + 1, FARINHA.raio, ry, cores.sombra, false);
    elipse(ctx, x, yChao, FARINHA.raio, ry, cores.cor, false);
    return;
  }
  const x = dono ? ondeEstaOGanso(dono) : origem.x;
  elipse(ctx, x, yChao + 1, 8, 2, cores.sombra, false);
  elipse(ctx, x, yChao, 8, 2, cores.cor, false);
}
