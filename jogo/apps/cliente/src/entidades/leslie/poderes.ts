// Os três poderes da Leslie no mapa (números em compartilhado/conteudo/leslie.ts), nos verdes e
// marrons da floresta. As raízes e as trepadeiras vêm de dentro da terra, e o chão reage:
// - Chicote de Espinhos: uma vinha com espinhos e folhas sai da mão dela em linha reta,
//   ondulando como um chicote, e volta para a mão. O acerto solta gotas de veneno; quem fica
//   envenenado solta bolhinhas verdes.
// - Raízes: uma fileira de três rodas, uma depois da outra (como o Impacto do Anjo). Em cada uma,
//   no aviso, as raízes sobem pela terra (o chão é visto de lado: dá para vê-las
//   atravessando o barro), a terra racha e a grama treme; na hora, rompem a superfície com
//   torrões de terra voando, prendem quem está em cima e, no fim, voltam para dentro do chão.
//   Quem fica preso ganha raízes enroladas nos pés.
// - Flor Carnívora: a terra treme, uma flor carnívora enorme sobe dela, vai atrás do outro e
//   cospe bolas de veneno de longe (flor.ts).
//
// A grama do chão é redesenhada por cima da base do que sai da terra (efeitos.ts): a base fica
// escondida atrás dela, e não parece uma imagem colada sobre o solo.

import { CHICOTE, MUNDO, RAIZES, type PoderUsado } from '@terna/compartilhado';
import { ombroDe } from '../braco';
import { ameacasDaFlor, atualizarFlor, criarFlor, desenharFlorNaFrente, desenharFlorNoChao, ondeBrota, type Flor } from './flor';
import {
  dentroDaFaixa,
  acertaCorpo,
  chao,
  CORPO,
  elipse,
  envenenar,
  faisca,
  ferirAlvo,
  redesenharGrama,
  vivos,
  type Alvo,
  type Ameacas,
  type CorpoAlvo,
  type Dono,
  type Nucleo,
} from '../efeitos';

export type PoderLeslie = 'chicote' | 'raizes' | 'flor';

// A vinha do chicote: sai da mão na direção (dx, dy) e estica até o alcance (ou até acertar); aí
// volta para a mão. A mão acompanha o corpo enquanto isso.
interface Chicote {
  tipo: 'chicote';
  dono: Dono;
  dx: number;
  dy: number;
  idade: number;
  comprimento: number; // px da mão até a ponta, agora
  voltaDe: number | null; // o comprimento quando começou a voltar (null: ainda esticando)
  voltando: number; // segundos voltando
}

// Uma raiz ou trepadeira: onde sai (em relação ao centro), até onde sobe, de que fundura vem e o
// balanço dela.
interface Rama {
  dx: number;
  altura: number;
  fundura: number; // px abaixo da linha do chão onde ela nasce
  fase: number;
  curva: number; // para que lado ela verga (−1 a 1)
}

interface Area {
  tipo: 'raizes';
  dono: Dono;
  x: number; // centro, no chão
  idade: number; // negativa enquanto espera a vez (as rodas das Raízes saem uma depois da outra)
  prende: number; // as Raízes: segundos que esta roda prende (e fica de fora da terra)
  indice: number; // as Raízes: a posição da roda na fileira (0 = a primeira)
  estourou: boolean;
  ramas: Rama[];
  rachaduras: number[]; // x das rachaduras na terra, em relação ao centro
  presos: Set<CorpoAlvo>; // as Raízes: quem esta roda já prendeu (cada um, uma vez)
}

export type EfeitoLeslie = Chicote | Area | Flor;
type Efeitos = Nucleo<EfeitoLeslie>;

export const VERDE = {
  sombra: '#16361a',
  escuro: '#2f6b2a',
  medio: '#4f9a38',
  claro: '#8fd45a',
  brilho: '#d4f7a8',
  veneno: '#a8e05a',
};
export const MADEIRA = { funda: '#2a180c', escura: '#3c2412', media: '#6b4424', clara: '#9c6a3a' };
const ESPINHO = '#efe3b8';
const TERRA = ['#3c2412', '#5a381c', '#6b4424', '#8a5a2b'];
const GRAMA = ['#4f9a38', '#6fb842', '#3f8a32'];
const aoAcaso = <T>(lista: readonly T[]): T => lista[(Math.random() * lista.length) | 0];
const sortear = (min: number, max: number): number => min + Math.random() * (max - min);

// Até onde cada poder pega (para a CPU).
export const ALCANCE_LESLIE: Record<PoderLeslie, number> = {
  chicote: CHICOTE.alcance - 6,
  raizes: RAIZES.alcance + RAIZES.raio * 2 * (RAIZES.rodas - 1) + RAIZES.raio,
  flor: 300, // ela anda atrás e cospe de longe
};

// De onde o chicote sai: a mão dela, na ponta do braço esticado para a mira (o gesto dos poderes,
// em personagem.ts: 10 px e mais o que o ombro dela fica atrás do de sempre, braco.ts).
const BRACO_ESTICADO = 12;
function maoDe(c: Chicote): { x: number; y: number } {
  const ombro = ombroDe({ ...c.dono, heroi: 'leslie' });
  return { x: ombro.x + c.dx * BRACO_ESTICADO, y: ombro.y + c.dy * BRACO_ESTICADO };
}

function direcao(uso: { x: number; y: number; alvoX: number; alvoY: number }): { dx: number; dy: number } {
  const dx = uso.alvoX - uso.x;
  const dy = uso.alvoY - uso.y;
  const d = Math.hypot(dx, dy);
  return d < 1 ? { dx: 1, dy: 0 } : { dx: dx / d, dy: dy / d };
}

function ramas(quantas: number, raio: number, alturas: [number, number]): Rama[] {
  return Array.from({ length: quantas }, (_, i) => ({
    dx: Math.round((i / Math.max(1, quantas - 1) - 0.5) * raio * 1.7 + sortear(-2, 2)),
    altura: sortear(alturas[0], alturas[1]),
    fundura: sortear(14, 30),
    fase: sortear(0, Math.PI * 2),
    curva: sortear(-1, 1),
  }));
}

// Os números de uma roda: ela fica de fora da terra o tempo que prende.
function dados(a: Area): { aviso: number; raio: number; duracao: number; dano: number } {
  return { aviso: RAIZES.aviso, raio: RAIZES.raio, duracao: a.prende, dano: RAIZES.dano };
}

// A fileira das Raízes: a primeira roda na direção do cursor (nem perto nem longe demais) e as
// outras em seguida, cada uma começando onde a anterior acaba. Os centros, no mapa.
function fileiraDasRaizes(deX: number, alvoX: number): number[] {
  const lado = alvoX >= deX ? 1 : -1;
  const distancia = Math.max(RAIZES.perto, Math.min(RAIZES.alcance, Math.abs(alvoX - deX)));
  const centros: number[] = [];
  for (let i = 0; i < RAIZES.rodas; i++) {
    const x = deX + lado * (distancia + i * RAIZES.raio * 2);
    if (x < 0 || x > MUNDO) break;
    centros.push(x);
  }
  return centros;
}

const rachaduras = (raio: number, quantas: number): number[] =>
  Array.from({ length: quantas }, (_, i) => Math.round((i / Math.max(1, quantas - 1) - 0.5) * raio * 1.8 + sortear(-3, 3)));

// Põe no mapa o poder usado — o seu, o da CPU ou o do outro jogador que chegou pela rede.
export function lancarPoderLeslie(e: Efeitos, dono: Dono, uso: PoderUsado & { poder: PoderLeslie }): void {
  if (uso.poder === 'chicote') {
    const { dx, dy } = direcao(uso);
    e.lista.push({ tipo: 'chicote', dono, dx, dy, idade: 0, comprimento: 0, voltaDe: null, voltando: 0 });
    return;
  }
  if (uso.poder === 'raizes') {
    fileiraDasRaizes(uso.x, uso.alvoX).forEach((x, i) => {
      e.lista.push({
        tipo: 'raizes',
        dono,
        x,
        idade: -i * RAIZES.entre,
        prende: RAIZES.prende[Math.min(i, RAIZES.prende.length - 1)],
        estourou: false,
        indice: i,
        // A fileira cresce: a primeira roda baixa, a do meio mais alta e a última bem alta.
        ramas: ramas(5 + i, RAIZES.raio, RAIZES.alturaDasRaizes[Math.min(i, RAIZES.alturaDasRaizes.length - 1)] as [number, number]),
        rachaduras: rachaduras(RAIZES.raio, 4),
        presos: new Set(),
      });
    });
    return;
  }
  e.lista.push(criarFlor(dono, uso));
}

// ---- Chicote ----

function atualizarChicote(e: Efeitos, c: Chicote, dt: number, alvos: readonly Alvo[]): boolean {
  c.idade += dt;
  if (c.voltaDe === null) {
    const novo = Math.min(CHICOTE.alcance, (c.idade / CHICOTE.estica) * CHICOTE.alcance);
    const mao = maoDe(c);
    // Em passos de 2 px: a ponta não atravessa ninguém entre dois quadros.
    for (let s = c.comprimento; s <= novo; s += 2) {
      const px = mao.x + c.dx * s;
      const py = mao.y + c.dy * s;
      const alvo = vivos(alvos, c.dono).find((a) => acertaCorpo(a.corpo, px, py, CHICOTE.raio));
      if (alvo) {
        ferirAlvo(e, alvo, CHICOTE.dano);
        // Online, o veneno do outro chega pela rede, com o estado dele.
        if (alvo.ferir) envenenar(alvo.corpo);
        for (let k = 0; k < 10; k++) faisca(e, px, py, 55, 120, aoAcaso([VERDE.veneno, VERDE.claro, VERDE.brilho]), false);
        for (let k = 0; k < 5; k++) faisca(e, px, py, 40, 0, VERDE.brilho);
        c.comprimento = s;
        c.voltaDe = s;
        return true;
      }
      if (py >= chao() - 1) {
        // A ponta bateu no chão: levanta terra e volta.
        for (let k = 0; k < 6; k++) faisca(e, px, chao() - 1, 40, 200, aoAcaso(TERRA), false);
        particulaQuePousa(e, px, chao() - 2);
        c.comprimento = s;
        c.voltaDe = s;
        return true;
      }
    }
    c.comprimento = novo;
    if (novo >= CHICOTE.alcance) c.voltaDe = novo;
    return true;
  }
  c.voltando += dt;
  c.comprimento = c.voltaDe * Math.max(0, 1 - c.voltando / CHICOTE.volta);
  return c.voltando < CHICOTE.volta;
}

// A vinha: da mão até a ponta, com uma onda que corre por ela (mais forte no meio), 2 px de
// grossura, espinhos alternando os lados, folhas de vez em quando e um botão de espinhos na ponta.
function desenharChicote(ctx: CanvasRenderingContext2D, c: Chicote, tempo: number): void {
  const mao = maoDe(c);
  const len = Math.round(c.comprimento);
  if (len < 2) return;
  const [nx, ny] = [-c.dy, c.dx]; // a perpendicular, para a onda
  const voltando = c.voltaDe !== null;
  const forca = voltando ? 2.2 : 1.4;
  ctx.save();
  for (let s = 0; s <= len; s++) {
    const t = s / len;
    const onda = Math.sin(t * Math.PI) * Math.sin(s * 0.35 - tempo * 28) * forca;
    const x = Math.round(mao.x + c.dx * s + nx * onda);
    const y = Math.round(mao.y + c.dy * s + ny * onda);
    ctx.fillStyle = VERDE.sombra;
    ctx.fillRect(x, y + 1, 1, 1);
    ctx.fillStyle = s % 3 === 0 ? VERDE.medio : VERDE.escuro;
    ctx.fillRect(x, y, 1, 1);
    if (s > 3 && s % 4 === 0) {
      const lado = (s / 4) % 2 === 0 ? 1 : -1;
      ctx.fillStyle = ESPINHO;
      ctx.fillRect(Math.round(x + nx * lado * 2), Math.round(y + ny * lado * 2), 1, 1);
    }
    if (s > 6 && s % 13 === 6) {
      const lado = (s / 13) % 2 < 1 ? 1 : -1;
      ctx.fillStyle = VERDE.claro;
      ctx.fillRect(Math.round(x + nx * lado * 2), Math.round(y + ny * lado * 2) - 1, 2, 2);
    }
  }
  // O botão da ponta: um nó de madeira com espinhos em cruz.
  const px = Math.round(mao.x + c.dx * len);
  const py = Math.round(mao.y + c.dy * len);
  ctx.fillStyle = MADEIRA.media;
  ctx.fillRect(px - 1, py - 1, 3, 3);
  ctx.fillStyle = MADEIRA.clara;
  ctx.fillRect(px - 1, py - 1, 1, 1);
  ctx.fillStyle = ESPINHO;
  ctx.fillRect(px + Math.round(c.dx * 3), py + Math.round(c.dy * 3), 1, 1);
  ctx.fillRect(px - 2, py - 2, 1, 1);
  ctx.fillRect(px + 2, py + 2, 1, 1);
  ctx.fillRect(px + 2, py - 2, 1, 1);
  ctx.fillRect(px - 2, py + 2, 1, 1);
  ctx.restore();
}

// ---- Raízes ----

// Um torrão de terra (ou fiapo de grama) que voa e pousa no chão.
function particulaQuePousa(e: Efeitos, x: number, y: number, forca = 70, grama = false): void {
  const a = -Math.PI / 2 + sortear(-0.9, 0.9);
  const v = forca * sortear(0.5, 1);
  const total = sortear(0.7, 1.2);
  e.particulas.push({
    x,
    y,
    vx: Math.cos(a) * v,
    vy: Math.sin(a) * v,
    gravidade: 420,
    vida: total,
    total,
    cor: grama ? aoAcaso(GRAMA) : aoAcaso(TERRA),
    somar: false,
    pousar: true,
  });
}

// Raízes presas nos pés: segundos que faltam, sem somar (vale a roda que prende mais).
function prender(c: CorpoAlvo, segundos: number): void {
  c.preso = Math.max(c.preso, segundos);
}

function atualizarArea(e: Efeitos, a: Area, dt: number, alvos: readonly Alvo[]): boolean {
  const n = dados(a);
  const yChao = chao();
  a.idade += dt;
  if (a.idade < 0) return true; // ainda não é a vez dela na fileira
  if (!a.estourou && a.idade < n.aviso) {
    const p = a.idade / n.aviso;
    // A terra solta poeira e torrõezinhos pelas rachaduras, mais perto da hora.
    if (Math.random() < dt * 12 * (0.4 + p)) {
      particulaQuePousa(e, a.x + aoAcaso(a.rachaduras) + sortear(-2, 2), yChao - 1, 30 + 40 * p);
    }
    return true;
  }
  if (!a.estourou) {
    a.estourou = true;
    for (const alvo of vivos(alvos, a.dono)) {
      const dentro = dentroDaFaixa(alvo.corpo, a.x, n.raio);
      // As raízes pegam só quem está perto do chão.
      const alcancaAltura = yChao - alvo.corpo.y <= RAIZES.altura[Math.min(a.indice, RAIZES.altura.length - 1)];
      if (!dentro || !alcancaAltura) continue;
      ferirAlvo(e, alvo, n.dano);
      // Online, o "preso" do outro chega pela rede, com o estado dele.
      a.presos.add(alvo.corpo);
      if (alvo.ferir) prender(alvo.corpo, a.prende);
    }
    // A terra rompe: torrões e grama voando de onde cada rama sai.
    for (const r of a.ramas) {
      for (let k = 0; k < 3; k++) particulaQuePousa(e, a.x + r.dx, yChao - 2, 80, k === 0);
    }
  }
  // Enquanto as raízes estão de fora, quem encostar nelas também fica preso (uma vez por roda),
  // até elas voltarem para a terra.
  if (subida(a) > 0.3) {
    const resta = n.aviso + n.duracao - a.idade;
    const altura = RAIZES.altura[Math.min(a.indice, RAIZES.altura.length - 1)];
    for (const alvo of vivos(alvos, a.dono)) {
      if (a.presos.has(alvo.corpo)) continue;
      const dentro = dentroDaFaixa(alvo.corpo, a.x, n.raio);
      if (!dentro || yChao - alvo.corpo.y > altura) continue;
      a.presos.add(alvo.corpo);
      // Online, o "preso" do outro chega pela rede, com o estado dele.
      if (alvo.ferir) prender(alvo.corpo, Math.max(0.6, resta));
      for (let k = 0; k < 4; k++) particulaQuePousa(e, alvo.corpo.x, yChao - 2, 40);
    }
  }
  return a.idade < n.aviso + n.duracao;
}

// Quanto cada rama já saiu da terra (0 a 1): brota rápido, fica e, no fim, volta para dentro.
function subida(a: Area): number {
  const n = dados(a);
  if (!a.estourou) return 0;
  const t = Math.min(1, (a.idade - n.aviso) / n.duracao);
  const cresce = Math.min(1, t / (a.tipo === 'raizes' ? 0.06 : 0.12));
  const volta = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
  return cresce * volta;
}

// A parte de baixo da terra: cada rama subindo pelo barro, da fundura dela até a superfície (no
// aviso, a ponta ainda a caminho). Escura e meio apagada: está dentro da terra.
function desenharDentroDaTerra(ctx: CanvasRenderingContext2D, a: Area, tempo: number): void {
  const n = dados(a);
  const yChao = chao();
  const p = a.estourou ? 1 : Math.min(1, a.idade / n.aviso);
  const some = a.estourou ? Math.min(1, subida(a) * 3) : 1; // voltando para dentro, apaga
  ctx.save();
  ctx.globalAlpha = 0.8 * some;
  for (const r of a.ramas) {
    const ate = Math.round(r.fundura * (1 - p)); // px abaixo da linha do chão onde está a ponta
    for (let d = Math.round(r.fundura); d >= ate; d--) {
      const lado = Math.round(Math.sin(d * 0.4 + r.fase) * 1.5 + r.curva * (d / r.fundura) * 3);
      const x = Math.round(a.x + r.dx + lado);
      ctx.fillStyle = d % 5 === 0 ? MADEIRA.media : MADEIRA.escura;
      ctx.fillRect(x, yChao + d, 1, 1);
      // Raizinhas laterais, de tempos em tempos.
      if (d % 7 === 3) {
        ctx.fillStyle = MADEIRA.funda;
        ctx.fillRect(x + (d % 2 ? 1 : -1), yChao + d + 1, 1, 1);
      }
    }
    // A ponta que ainda sobe brilha um pouco.
    if (!a.estourou) {
      ctx.fillStyle = MADEIRA.clara;
      ctx.fillRect(Math.round(a.x + r.dx), yChao + ate, 1, 1);
    }
  }
  // As rachaduras: riscos escuros descendo da superfície, abrindo com o aviso.
  if (p > 0.25 && subida(a) < 0.95) {
    const abre = Math.min(1, (p - 0.25) / 0.5);
    ctx.globalAlpha = some;
    ctx.fillStyle = MADEIRA.funda;
    for (const [i, rx] of a.rachaduras.entries()) {
      const fundo = Math.round((3 + (i % 3) * 2) * abre);
      let x = Math.round(a.x + rx);
      for (let d = 1; d <= fundo; d++) {
        if (d % 2 === 0) x += i % 2 ? 1 : -1;
        ctx.fillRect(x, yChao + d, 1, 1);
      }
    }
  }
  ctx.restore();
}

// A grama da área tremendo no aviso: redesenhada 1 px acima, aos trancos, perto da hora.
function tremerGrama(ctx: CanvasRenderingContext2D, a: Area, tempo: number): void {
  const n = dados(a);
  const p = a.idade / n.aviso;
  if (p < 0.35) return;
  const treme = Math.sin(tempo * 38 + a.x) > 0 ? 1 : 0;
  if (treme) redesenharGrama(ctx, a.x - n.raio, a.x + n.raio, 1, 1);
}

// Uma rama (raiz ou trepadeira) de `altura` px acima do chão, de `grossura` px, vergando para o
// lado da curva e ondulando: marrom com a luz de um lado; nas trepadeiras, folhas; nas duas,
// espinhos. A base fica atrás da grama (redesenhada depois).
function desenharRama(ctx: CanvasRenderingContext2D, x0: number, yChao: number, r: Rama, altura: number, grossura: number, folhas: boolean, tempo: number): void {
  if (altura < 1) return;
  const pontos: [number, number][] = [];
  for (let i = -2; i <= altura; i++) {
    const t = Math.max(0, i) / Math.max(1, r.altura);
    const lado = r.curva * t * t * 8 + Math.sin(t * 5 + r.fase + tempo * 3) * 1.5 * t;
    pontos.push([Math.round(x0 + r.dx + lado), yChao - i]);
  }
  for (const [k, [x, y]] of pontos.entries()) {
    const i = k - 2;
    const fina = i > altura - 4 ? 1 : grossura; // a ponta afina
    ctx.fillStyle = folhas ? VERDE.escuro : MADEIRA.media;
    ctx.fillRect(x - (fina >> 1), y, fina, 1);
    ctx.fillStyle = folhas ? VERDE.medio : MADEIRA.clara;
    ctx.fillRect(x - (fina >> 1), y, 1, 1);
    if (i > 3 && i % 5 === 0) {
      const lado = (i / 5) % 2 === 0 ? 1 : -1;
      ctx.fillStyle = ESPINHO;
      ctx.fillRect(x + lado * (1 + (fina >> 1)), y, 1, 1);
    }
    if (folhas && i > 5 && i % 9 === 4) {
      const lado = (i / 9) % 2 < 1 ? 1 : -1;
      ctx.fillStyle = VERDE.claro;
      ctx.fillRect(x + lado * 2, y - 1, 2, 2);
      ctx.fillStyle = VERDE.brilho;
      ctx.fillRect(x + lado * 3, y - 1, 1, 1);
    }
  }
  const [px, py] = pontos[pontos.length - 1];
  ctx.fillStyle = folhas ? VERDE.brilho : ESPINHO;
  ctx.fillRect(px, py - 1, 1, 1);
}

// Acima do chão: as ramas, a grama redesenhada na frente da base delas e um montinho de terra
// empurrada ao lado de cada uma.
function desenharForaDaTerra(ctx: CanvasRenderingContext2D, a: Area, tempo: number): void {
  const n = dados(a);
  const yChao = chao();
  const quanto = subida(a);
  ctx.save();
  // A última roda, a mais alta, tem as raízes mais grossas.
  const grossura = a.indice >= 2 ? 3 : 2;
  for (const r of a.ramas) desenharRama(ctx, a.x, yChao, r, Math.round(r.altura * quanto), grossura, false, tempo);
  redesenharGrama(ctx, a.x - n.raio - 3, a.x + n.raio + 3);
  // A terra empurrada: um montinho de cada lado da base, enquanto a rama está de fora.
  ctx.globalAlpha = Math.min(1, quanto * 2);
  for (const r of a.ramas) {
    const x = Math.round(a.x + r.dx);
    ctx.fillStyle = MADEIRA.media;
    ctx.fillRect(x - 2, yChao - 1, 5, 1);
    ctx.fillStyle = MADEIRA.escura;
    ctx.fillRect(x - 1, yChao - 2, 1, 1);
    ctx.fillRect(x + 2, yChao - 2, 1, 1);
  }
  ctx.restore();
}

// Passa o tempo de um efeito da Leslie; devolve se ele continua no mapa.
export function atualizarEfeitoLeslie(e: Efeitos, ef: EfeitoLeslie, dt: number, alvos: readonly Alvo[]): boolean {
  if (ef.tipo === 'chicote') return atualizarChicote(e, ef, dt, alvos);
  if (ef.tipo === 'flor') return atualizarFlor(e, ef, dt, alvos);
  return atualizarArea(e, ef, dt, alvos);
}

export function ameacasDaLeslie(ef: EfeitoLeslie, ameacas: Ameacas): void {
  if (ef.tipo === 'chicote') {
    if (ef.voltaDe !== null) return;
    const mao = maoDe(ef);
    const v = CHICOTE.alcance / CHICOTE.estica;
    ameacas.projeteis.push({ x: mao.x + ef.dx * ef.comprimento, y: mao.y + ef.dy * ef.comprimento, vx: ef.dx * v, vy: ef.dy * v });
  } else if (ef.tipo === 'flor') {
    ameacasDaFlor(ef, ameacas);
  } else if (!ef.estourou) {
    const n = dados(ef);
    ameacas.areas.push({ x: ef.x, raio: n.raio, resta: n.aviso - ef.idade, aviso: n.aviso, baixa: ef.tipo === 'raizes' && ef.indice < 2 }); // a última roda é alta demais para pular
  }
}

// Antes dos personagens: o que está dentro da terra, as rachaduras, a grama tremendo e a flor.
export function desenharLeslieNoChao(ctx: CanvasRenderingContext2D, ef: EfeitoLeslie, tempo: number): void {
  if (ef.tipo === 'flor') return desenharFlorNoChao(ctx, ef, tempo);
  if (ef.tipo === 'chicote' || ef.idade < 0) return; // a roda ainda não chegou na vez dela
  desenharDentroDaTerra(ctx, ef, tempo);
  if (!ef.estourou) tremerGrama(ctx, ef, tempo);
}

// Depois dos personagens: o chicote, o que rompeu a terra e as bolas de veneno da flor.
export function desenharLeslieNaFrente(ctx: CanvasRenderingContext2D, ef: EfeitoLeslie, tempo: number): void {
  if (ef.tipo === 'chicote') desenharChicote(ctx, ef, tempo);
  else if (ef.tipo === 'flor') desenharFlorNaFrente(ctx, ef);
  else if (ef.estourou) desenharForaDaTerra(ctx, ef, tempo);
}

// Raízes enroladas nos pés de quem está preso, afrouxando no fim. No corpo largo (o golem), mais
// raízes, mais altas e grossas, contornadas de escuro: as de gente caberiam entre as pernas de
// pedra e sumiriam na cor dela.
export function desenharPreso(ctx: CanvasRenderingContext2D, c: CorpoAlvo, tempo: number): void {
  if (c.preso <= 0) return;
  const forca = Math.min(1, c.preso / 0.3);
  const grande = c.medida.meiaLargura > CORPO.meiaLargura;
  const x = Math.round(c.x);
  const y = Math.round(c.y);
  ctx.save();
  ctx.globalAlpha = forca;
  for (let i = 0; i < (grande ? 6 : 4); i++) {
    const lado = i % 2 === 0 ? -1 : 1;
    const base = x + lado * (2 + (i >> 1) * 3);
    const altura = (grande ? 10 : 6) + (i % 3) * 2;
    for (let k = 0; k < altura; k++) {
      const dx = Math.round(Math.sin(k * 0.8 + i + tempo * 2) * 2) - lado * Math.round(k / 3);
      const px = base + dx;
      if (grande) {
        ctx.fillStyle = MADEIRA.funda;
        ctx.fillRect(px - 1, y - k, 4, 1);
        ctx.fillStyle = k % 2 ? MADEIRA.media : MADEIRA.clara;
        ctx.fillRect(px + 1, y - k, 1, 1);
      }
      ctx.fillStyle = k % 4 === 3 ? ESPINHO : k % 2 ? MADEIRA.clara : MADEIRA.media;
      ctx.fillRect(px, y - k, 1, 1);
    }
  }
  ctx.restore();
}

// Envenenado: bolhinhas verdes subindo do corpo, que estouram em cima da cabeça.
export function desenharVeneno(ctx: CanvasRenderingContext2D, c: CorpoAlvo, tempo: number): void {
  if (c.veneno <= 0) return;
  const forca = Math.min(1, c.veneno / 0.4);
  ctx.save();
  ctx.globalAlpha = 0.9 * forca;
  for (let i = 0; i < 4; i++) {
    const ciclo = (tempo * 0.9 + i / 4) % 1;
    const x = Math.round(c.x + Math.sin(i * 2.3 + tempo * 3) * 5);
    const y = Math.round(c.y - 8 - ciclo * (c.medida.altura + 4));
    ctx.fillStyle = i % 2 ? VERDE.veneno : VERDE.claro;
    if (ciclo < 0.85) {
      ctx.fillRect(x, y, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
    } else {
      // Estourando: um anelzinho.
      ctx.fillRect(x - 1, y, 1, 1);
      ctx.fillRect(x + 1, y, 1, 1);
      ctx.fillRect(x, y - 1, 1, 1);
      ctx.fillRect(x, y + 1, 1, 1);
    }
  }
  ctx.restore();
}

// ---- Prévia da mira ----
// O Chicote: a linha pontilhada até onde a vinha chega. Raízes: o contorno das três rodas da
// fileira. Flor: o contorno de onde ela brota.
export function desenharPreviaLeslie(
  ctx: CanvasRenderingContext2D,
  poder: PoderLeslie,
  origem: { x: number; y: number },
  alvo: { x: number; y: number },
  tempo: number,
  cores: { cor: string; sombra: string; passo: number },
): void {
  const yChao = chao();
  if (poder === 'chicote') {
    const { dx, dy } = direcao({ x: origem.x, y: origem.y, alvoX: alvo.x, alvoY: alvo.y });
    const corre = (tempo * 20) % cores.passo;
    for (let s = 6 + corre; s <= CHICOTE.alcance; s += cores.passo) {
      const y = origem.y + dy * s;
      if (y >= yChao) break;
      const x = Math.round(origem.x + dx * s);
      ctx.fillStyle = cores.sombra;
      ctx.fillRect(x, Math.round(y) + 1, 1, 1);
      ctx.fillStyle = cores.cor;
      ctx.fillRect(x, Math.round(y), 1, 1);
    }
    return;
  }
  const n = poder === 'raizes' ? RAIZES : { raio: 18 };
  const centros = poder === 'raizes' ? fileiraDasRaizes(origem.x, alvo.x) : [ondeBrota(origem.x, alvo.x)];
  const ry = Math.max(2, Math.round(n.raio / 7));
  for (const x of centros) {
    elipse(ctx, x, yChao + 1, n.raio, ry, cores.sombra, false);
    elipse(ctx, x, yChao, n.raio, ry, cores.cor, false);
  }
}
