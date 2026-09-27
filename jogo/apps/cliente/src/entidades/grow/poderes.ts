// Os poderes do Grow no mapa (números em compartilhado/conteudo/grow.ts). De gente, os da mata —
// pássaros e vento, que afastam e quase não ferem; de golem, os da pedra — pesados:
// - Revoada de Águias: três águias-carecas grandes (aguia.ts) voam em V da mão dele na direção do
//   cursor, batendo as asas. Pegando alguém, duas o agarram pelos ombros e a terceira puxa por
//   cima; sobem bem alto com ele e o carregam para longe; lá de cima, soltam e vão embora
//   planando: o tombo tira vida e levanta poeira. O golem é pesado: elas só bicam.
// - Vendaval: enquanto ele segura o botão, riscos de vento correm rente ao chão para o lado do
//   cursor, com folhas rodopiando, poeira e a grama deitando; quem está nele é empurrado para
//   longe (e, no ar, flutua e vai mais longe ainda).
// - Salto Esmagador: o golem agacha e pula alto; a marca do tombo aparece no chão onde ele vai
//   cair, cada vez mais forte. No tombo, a terra afunda e racha, a poeira abre em onda para os
//   dois lados e lascas voam.
// - Investida: bate o pé duas vezes (poeira) e corre abaixado, deixando um rastro de poeira e
//   torrões; quem ele atropela é jogado para longe, quicando.
// - Pedra: a terra na frente dele racha e um pedregulho enorme com musgo (pedregulho.ts) sai do
//   chão, sobe até acima da cabeça e é arremessado, girando, em arco. Onde bate (em alguém ou no
//   chão), estoura em lascas grandes.

import { REVOADA, CORPO_GOLEM, INVESTIDA, MUNDO, PEDRA as PEDRA_DADOS, SALTO, VENTO, type PoderUsado } from '@terna/compartilhado';
import {
  acertaCorpo,
  andamento,
  chao,
  dentroDaFaixa,
  elipse,
  empurrar,
  faisca,
  ferirAlvo,
  manobraAcabou,
  pontoDaManobra,
  redesenharGrama,
  vivos,
  type Alvo,
  type Ameacas,
  type CorpoAlvo,
  type Dono,
  type Manobra,
  type Nucleo,
} from '../efeitos';
import { desenharAguia } from './aguia';
import { desenharPedregulho, RAIO_DO_PEDREGULHO } from './pedregulho';
import { MUSGO, PEDRA } from './golem';

export type PoderGrow = 'aves' | 'vento' | 'golem' | 'salto' | 'investida' | 'pedra';
export const PODERES_DO_GROW: readonly PoderGrow[] = ['aves', 'vento', 'golem', 'salto', 'investida', 'pedra'];

// ---- Os efeitos ----

interface Aguia {
  dx: number; // lugar no V, em relação à da frente (para trás é negativo)
  dy: number;
  fase: number; // das asas (1 = uma batida)
}

interface Revoada {
  tipo: 'aves';
  dono: Dono;
  x: number; // centro do bando
  y: number;
  dx: number; // direção do voo
  dy: number;
  voado: number; // px voados
  idade: number;
  fase: 'voando' | 'levando' | 'soltou' | 'indo';
  tempoFase: number;
  preso: CorpoAlvo | null; // quem elas levam (ou largaram)
  de: { x: number; y: number }; // onde o pegaram
  lado: 1 | -1; // para que lado o levam (para longe do Grow)
  aguias: Aguia[];
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

interface Vendaval {
  tipo: 'vento';
  dono: Dono;
  lado: 1 | -1;
  idade: number;
  parar: boolean; // soltou o botão: acaba assim que passar o mínimo
  tiques: Map<CorpoAlvo, number>; // segundos desde a última lasquinha, por quem está no vento
  folhas: Folha[];
  sobraFolhas: number;
}

interface Salto {
  tipo: 'salto';
  dono: Dono;
  m: Manobra;
  estourou: boolean;
  depois: number; // segundos desde o tombo
  rachaduras: number[];
}

interface Investida {
  tipo: 'investida';
  dono: Dono;
  m: Manobra;
  lado: 1 | -1;
  atingidos: Set<CorpoAlvo>;
  passos: number; // batidas de pé já dadas no preparo
  depois: number; // segundos desde que parou
}

interface Pedregulho {
  tipo: 'pedra';
  dono: Dono;
  idade: number;
  fase: 'arrancando' | 'voando' | 'estourou';
  x: number;
  y: number;
  vx: number;
  vy: number;
  alvoX: number;
  alvoY: number;
  buraco: number; // x do buraco de onde ela saiu
  lado: 1 | -1;
  giro: number;
  depois: number;
  atingidos: Set<CorpoAlvo>;
}

export type EfeitoGrow = Revoada | Vendaval | Salto | Investida | Pedregulho;
type Efeitos = Nucleo<EfeitoGrow>;

const TERRA = ['#3c2412', '#5a381c', '#6b4424', '#8a5a2b'];
const POEIRA = ['#8a7a60', '#a8977a', '#6f624e', '#b8a888'];
const FOLHAS = ['#4f9a38', '#6fb842', '#8fd45a', '#9cbc45', '#c9a24a'];
const GRAMA = ['#4f9a38', '#6fb842', '#3f8a32'];
const PENAS = ['#f4efe0', '#6b4424', '#8a5a2b', '#3c2412'];
// O V das águias: a da frente e duas atrás, uma acima e uma abaixo.
const FORMACAO = [
  { dx: 0, dy: 0 },
  { dx: -16, dy: -10 },
  { dx: -18, dy: 10 },
];
const aoAcaso = <T>(lista: readonly T[]): T => lista[(Math.random() * lista.length) | 0];
const sortear = (min: number, max: number): number => min + Math.random() * (max - min);
const ladoDe = (de: number, para: number, senao: 1 | -1): 1 | -1 => (para > de + 0.5 ? 1 : para < de - 0.5 ? -1 : senao);

// Até onde cada poder pega (para a CPU). O golem não tem alcance: é virar.
export const ALCANCE_GROW: Record<PoderGrow, number> = {
  aves: REVOADA.alcance - 10,
  vento: VENTO.alcance - 20,
  golem: Infinity,
  salto: SALTO.alcance + SALTO.raio - 6,
  investida: INVESTIDA.alcance - 10,
  pedra: 250,
};

function direcao(uso: { x: number; y: number; alvoX: number; alvoY: number }): { dx: number; dy: number } {
  const dx = uso.alvoX - uso.x;
  const dy = uso.alvoY - uso.y;
  const d = Math.hypot(dx, dy);
  return d < 1 ? { dx: 1, dy: 0 } : { dx: dx / d, dy: dy / d };
}

// Onde o Salto cai: na direção do cursor, nem perto nem longe demais, dentro do mapa.
export function destinoDoSalto(deX: number, alvoX: number): number {
  const lado = alvoX >= deX ? 1 : -1;
  const distancia = Math.max(SALTO.perto, Math.min(SALTO.alcance, Math.abs(alvoX - deX)));
  return Math.max(12, Math.min(MUNDO - 12, deX + lado * distancia));
}

export function destinoDaInvestida(deX: number, lado: 1 | -1): number {
  return Math.max(12, Math.min(MUNDO - 12, deX + lado * INVESTIDA.alcance));
}

// De onde a Pedra sai: acima da cabeça do golem.
const acimaDaCabeca = (d: Dono): { x: number; y: number } => ({ x: d.x - d.direcao * 2, y: d.y - CORPO_GOLEM.altura - RAIO_DO_PEDREGULHO - 3 });

// A velocidade do arremesso: na direção do alvo, levantada o tanto que a gravidade vai baixar no
// caminho — ela chega perto de onde o cursor estava.
function arremesso(de: { x: number; y: number }, alvoX: number, alvoY: number): { vx: number; vy: number } {
  const { dx, dy } = direcao({ x: de.x, y: de.y, alvoX, alvoY });
  const distancia = Math.hypot(alvoX - de.x, alvoY - de.y);
  const t = Math.min(1.1, distancia / PEDRA_DADOS.velocidade);
  return { vx: dx * PEDRA_DADOS.velocidade, vy: dy * PEDRA_DADOS.velocidade - 0.5 * PEDRA_DADOS.gravidade * t };
}

// Põe no mapa o poder usado — o seu, o da CPU ou o do outro jogador que chegou pela rede. O golem
// (virar) não põe nada no mapa: é o corpo que se transforma (personagem.ts).
export function lancarPoderGrow(e: Efeitos, dono: Dono, uso: PoderUsado & { poder: PoderGrow }): void {
  if (uso.poder === 'aves') {
    const { dx, dy } = direcao(uso);
    // Rente ao chão o bando não desce: voa na altura do peito para baixo, no máximo.
    const [fx, fy] = dy > 0.35 ? [Math.sign(dx || dono.direcao) * 0.94, 0.35] : [dx, dy];
    e.lista.push({
      tipo: 'aves',
      dono,
      x: uso.x,
      y: uso.y,
      dx: fx,
      dy: fy,
      voado: 0,
      idade: 0,
      fase: 'voando',
      tempoFase: 0,
      preso: null,
      de: { x: 0, y: 0 },
      lado: ladoDe(uso.x, uso.alvoX, dono.direcao),
      aguias: FORMACAO.slice(0, REVOADA.aguias).map((f) => ({ ...f, fase: Math.random() })),
    });
    for (let k = 0; k < 10; k++) faisca(e, uso.x, uso.y, 40, 40, aoAcaso(PENAS), false);
    return;
  }
  if (uso.poder === 'vento') {
    e.lista.push({ tipo: 'vento', dono, lado: ladoDe(dono.x, uso.alvoX, dono.direcao), idade: 0, parar: false, tiques: new Map(), folhas: [], sobraFolhas: 0 });
    return;
  }
  if (uso.poder === 'salto') {
    const m: Manobra = { tipo: 'salto', x0: dono.x, x1: destinoDoSalto(dono.x, uso.alvoX), idade: 0, espera: SALTO.agachar, duracao: SALTO.voo, altura: SALTO.altura };
    dono.manobra = m;
    e.lista.push({ tipo: 'salto', dono, m, estourou: false, depois: 0, rachaduras: Array.from({ length: 8 }, () => Math.round(sortear(-SALTO.raio, SALTO.raio))) });
    return;
  }
  if (uso.poder === 'investida') {
    const lado = ladoDe(dono.x, uso.alvoX, dono.direcao);
    const x1 = destinoDaInvestida(dono.x, lado);
    const m: Manobra = { tipo: 'investida', x0: dono.x, x1, idade: 0, espera: INVESTIDA.preparo, duracao: Math.max(0.05, Math.abs(x1 - dono.x) / INVESTIDA.velocidade), altura: 0 };
    dono.manobra = m;
    e.lista.push({ tipo: 'investida', dono, m, lado, atingidos: new Set(), passos: 0, depois: 0 });
    return;
  }
  if (uso.poder === 'pedra') {
    const lado = ladoDe(dono.x, uso.alvoX, dono.direcao);
    const buraco = dono.x + lado * 10;
    e.lista.push({
      tipo: 'pedra',
      dono,
      idade: 0,
      fase: 'arrancando',
      x: buraco,
      y: chao(),
      vx: 0,
      vy: 0,
      alvoX: uso.alvoX,
      alvoY: uso.alvoY,
      buraco,
      lado,
      giro: 0,
      depois: 0,
      atingidos: new Set(),
    });
  }
}

// Soltou o botão do Vendaval (o seu, o da CPU ou o do outro online): o vento para assim que
// passar o mínimo.
export function pararVentoGrow(e: Nucleo<EfeitoGrow | { tipo: string; dono: Dono }>, dono: Dono): void {
  for (const ef of e.lista) if (ef.tipo === 'vento' && ef.dono === dono) (ef as Vendaval).parar = true;
}

// Ainda sopra (as folhas que sobram no ar depois de parar não contam: ele já está livre).
export function ventoDo(e: Nucleo<EfeitoGrow | { tipo: string; dono: Dono }>, dono: Dono): boolean {
  return e.lista.some((ef) => ef.tipo === 'vento' && ef.dono === dono && ventoSoprando(ef as Vendaval));
}

// ---- Revoada ----

// Um torrão (ou lasca, ou poeira) que voa e pousa no chão.
function torrao(e: Efeitos, x: number, y: number, forca: number, cores: readonly string[], tam = 1, abrir = 0.9): void {
  const a = -Math.PI / 2 + sortear(-abrir, abrir);
  const v = forca * sortear(0.5, 1);
  const total = sortear(0.7, 1.3);
  e.particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, gravidade: 420, vida: total, total, cor: aoAcaso(cores), somar: false, pousar: true, tam });
}

// Poeira rente ao chão, abrindo para os lados (ou só para `lado`).
function poeira(e: Efeitos, x: number, quantas: number, forca: number, lado = 0): void {
  for (let i = 0; i < quantas; i++) {
    const s = lado || (Math.random() < 0.5 ? -1 : 1);
    const total = sortear(0.4, 0.8);
    e.particulas.push({ x: x + sortear(-3, 3), y: chao() - sortear(1, 4), vx: s * forca * sortear(0.3, 1), vy: sortear(-20, -4), gravidade: 15, vida: total, total, cor: aoAcaso(POEIRA), somar: false, tam: 2 });
  }
}

const noChaoDoMapa = (c: CorpoAlvo): boolean => c.noChao || c.y >= chao() - 0.5;

function atualizarRevoada(e: Efeitos, r: Revoada, dt: number, alvos: readonly Alvo[]): boolean {
  r.idade += dt;
  r.tempoFase += dt;
  // Carregando, batem as asas bem mais depressa.
  for (const a of r.aguias) a.fase += dt * (r.fase === 'levando' ? 3.4 : 2.2);
  const yChao = chao();
  if (r.fase === 'voando') {
    const passo = REVOADA.velocidade * dt;
    // Em passos pequenos: o bando não atravessa ninguém entre dois quadros.
    for (let s = 0; s < passo; s += 2) {
      const d = Math.min(2, passo - s);
      r.x += r.dx * d;
      r.y += r.dy * d;
      r.voado += d;
      const alvo = vivos(alvos, r.dono).find((a) => acertaCorpo(a.corpo, r.x, r.y, REVOADA.raio));
      if (alvo) return pegar(e, r, alvo);
      if (r.voado >= REVOADA.alcance || r.y >= yChao - 3) {
        r.fase = 'indo';
        r.tempoFase = 0;
        return true;
      }
    }
    // Uma pena de vez em quando.
    if (Math.random() < dt * 8) faisca(e, r.x, r.y, 12, 30, aoAcaso(PENAS), false);
    return true;
  }
  if (r.fase === 'levando' && r.preso) {
    const c = r.preso;
    const alvo = alvos.find((a) => a.corpo === c);
    const t = Math.min(1, r.tempoFase / REVOADA.levando);
    const sobe = 1 - (1 - t) ** 2; // sai rápido e desacelera lá em cima
    if (alvo?.ferir) {
      // Quem se fere aqui é levado de verdade: os pássaros mandam no corpo até soltar.
      c.x = Math.max(4, Math.min(MUNDO - 4, r.de.x + r.lado * REVOADA.leva * t));
      c.y = r.de.y + (yChao - REVOADA.altura - r.de.y) * sobe;
      c.vy = 0;
      c.noChao = false;
      c.empurrao = 0;
      c.levado = Math.max(0.05, REVOADA.levando - r.tempoFase);
    }
    // As águias por cima da cabeça, com as garras descendo nos ombros.
    r.x = c.x;
    r.y = c.y - c.medida.altura - 4;
    // O outro online sobe pela rede; se lá ele escapou (não subiu), os pássaros desistem.
    const escapou = !alvo?.ferir && r.tempoFase > 0.35 && c.y > yChao - 6;
    if (!alvo || c.vida <= 0 || escapou) return soltar(r, alvo);
    if (Math.random() < dt * 10) faisca(e, r.x + sortear(-10, 10), r.y - 4, 14, 40, aoAcaso(PENAS), false);
    if (t >= 1) return soltar(r, alvo);
    return true;
  }
  if (r.fase === 'soltou' && r.preso) {
    // Largado lá de cima: o tombo, quando ele bate no chão.
    const c = r.preso;
    const alvo = alvos.find((a) => a.corpo === c);
    r.x += r.dx * 20 * dt;
    r.y -= 70 * dt;
    if (!alvo || r.tempoFase > 2.5) return false;
    if (r.tempoFase > 0.05 && noChaoDoMapa(c)) {
      ferirAlvo(e, alvo, REVOADA.dano);
      poeira(e, c.x, 10, 45);
      for (let k = 0; k < 5; k++) torrao(e, c.x + sortear(-4, 4), yChao - 1, 60, TERRA);
      r.preso = null;
      r.fase = 'indo';
      r.tempoFase = 0;
    }
    return true;
  }
  // Indo embora: cada um sobe para um lado e some.
  r.x += r.dx * 60 * dt;
  r.y -= 55 * dt;
  r.aguias.forEach((a, i) => {
    a.dx += (i === 1 ? -1 : 1) * 25 * dt;
    a.dy -= (10 + i * 8) * dt;
  });
  return r.tempoFase < 1.1;
}

function pegar(e: Efeitos, r: Revoada, alvo: Alvo): boolean {
  const c = alvo.corpo;
  for (let k = 0; k < 12; k++) faisca(e, r.x, r.y, 45, 60, aoAcaso(PENAS), false);
  if (c.pesado) {
    // Pesado demais: bicam e vão embora.
    ferirAlvo(e, alvo, REVOADA.bicada);
    r.fase = 'indo';
    r.tempoFase = 0;
    return true;
  }
  r.preso = c;
  r.de = { x: c.x, y: c.y };
  // Para longe do Grow.
  r.lado = ladoDe(r.dono.x, c.x, r.lado);
  r.fase = 'levando';
  r.tempoFase = 0;
  return true;
}

function soltar(r: Revoada, alvo: Alvo | undefined): boolean {
  if (alvo?.ferir && r.preso) {
    r.preso.levado = 0;
    r.preso.vy = 0;
  }
  r.fase = r.preso && alvo ? 'soltou' : 'indo';
  r.tempoFase = 0;
  return true;
}

function desenharRevoada(ctx: CanvasRenderingContext2D, r: Revoada): void {
  const levando = r.fase === 'levando';
  const lado: 1 | -1 = levando || r.fase === 'soltou' ? r.lado : r.dx >= 0 ? 1 : -1;
  // Soltou (ou errou): vão embora planando, de asas esticadas.
  const plana = r.fase === 'soltou' || r.fase === 'indo';
  ctx.save();
  if (r.fase === 'indo') ctx.globalAlpha = Math.max(0, 1 - r.tempoFase / 1.1);
  // A de cima primeiro: as dos ombros ficam na frente dela.
  [...r.aguias.entries()].reverse().forEach(([i, a]) => {
    // Levando: duas nos ombros (uma de cada lado) e a terceira por cima, puxando.
    const [dx, dy] = levando ? ([[7, 0], [-7, 2], [0, -13]][i] ?? [0, -13]) : [lado * a.dx, a.dy + Math.sin(a.fase * Math.PI * 2) * 1.5];
    desenharAguia(ctx, r.x + dx, r.y + dy, lado, plana ? a.fase * 0.3 : a.fase, plana);
  });
  ctx.restore();
}

// ---- Vendaval ----

// A faixa do vento no mapa, da mão para a frente.
function faixaDoVento(v: Vendaval): { de: number; ate: number } {
  const de = v.dono.x + v.lado * 4;
  return { de, ate: de + v.lado * VENTO.alcance };
}

function noVento(v: Vendaval, c: CorpoAlvo): boolean {
  const { de, ate } = faixaDoVento(v);
  const [a, b] = de < ate ? [de, ate] : [ate, de];
  return c.x + c.medida.meiaLargura >= a && c.x - c.medida.meiaLargura <= b && chao() - c.y <= VENTO.altura;
}

function atualizarVendaval(e: Efeitos, v: Vendaval, dt: number, alvos: readonly Alvo[]): boolean {
  v.idade += dt;
  const { de } = faixaDoVento(v);
  const yChao = chao();
  // Parou: não empurra mais (as folhas que sobraram só terminam de voar).
  for (const alvo of ventoSoprando(v) ? vivos(alvos, v.dono) : []) {
    const c = alvo.corpo;
    if (!noVento(v, c)) {
      v.tiques.delete(c);
      continue;
    }
    // Mais forte perto da mão.
    const perto = 1 - 0.35 * Math.min(1, Math.abs(c.x - de) / VENTO.alcance);
    if (alvo.ferir) {
      empurrar(c, v.lado * VENTO.forca * perto, VENTO.pesado);
      if (!c.noChao && !c.pesado) c.vy -= VENTO.sustentar * dt;
    }
    const tique = (v.tiques.get(c) ?? VENTO.tique * 0.5) + dt;
    if (tique >= VENTO.tique) {
      ferirAlvo(e, alvo, VENTO.dano);
      v.tiques.set(c, tique - VENTO.tique);
    } else {
      v.tiques.set(c, tique);
    }
  }
  // Folhas rodopiando e poeira correndo rente ao chão.
  v.sobraFolhas += dt * 42;
  for (; v.sobraFolhas >= 1; v.sobraFolhas--) {
    v.folhas.push({
      x: de + v.lado * sortear(0, 20),
      y: yChao - sortear(2, VENTO.altura - 4),
      vx: v.lado * sortear(170, 250),
      vy: sortear(-20, 20),
      fase: sortear(0, Math.PI * 2),
      cor: aoAcaso(FOLHAS),
      vida: VENTO.alcance / 200,
    });
  }
  if (Math.random() < dt * 20) {
    const total = sortear(0.3, 0.6);
    e.particulas.push({ x: de + v.lado * sortear(0, VENTO.alcance * 0.7), y: yChao - sortear(1, 3), vx: v.lado * sortear(120, 200), vy: sortear(-12, 0), gravidade: 0, vida: total, total, cor: aoAcaso(POEIRA), somar: false });
  }
  for (const f of v.folhas) {
    f.vida -= dt;
    f.fase += dt * 14;
    f.x += f.vx * dt;
    f.y += (f.vy + Math.sin(f.fase) * 40) * dt;
    f.y = Math.min(yChao - 1, f.y);
  }
  v.folhas = v.folhas.filter((f) => f.vida > 0);
  const acabou = v.idade >= VENTO.duracao || (v.parar && v.idade >= VENTO.minimo);
  // Parou: as folhas que já estão no ar terminam de voar, sem vento novo.
  if (acabou) v.sobraFolhas = -Infinity;
  return !acabou || v.folhas.length > 0;
}

const ventoSoprando = (v: Vendaval): boolean => v.sobraFolhas !== -Infinity;

function desenharVendaval(ctx: CanvasRenderingContext2D, v: Vendaval, tempo: number): void {
  const { de } = faixaDoVento(v);
  const yChao = chao();
  const forca = ventoSoprando(v) ? Math.min(1, v.idade / 0.15) : 0;
  ctx.save();
  if (forca > 0) {
    // A grama deitando com o vento: fiapos inclinados rente ao chão, balançando.
    for (let s = 2; s < VENTO.alcance; s += 3) {
      const x = Math.round(de + v.lado * s);
      const deita = 1 + Math.round((0.5 + 0.5 * Math.sin(tempo * 16 - s * 0.3)) * 1.5);
      ctx.fillStyle = GRAMA[(s / 3) % GRAMA.length | 0];
      for (let k = 0; k < 3; k++) ctx.fillRect(x + v.lado * Math.round((k * deita) / 2), yChao - 2 - k + Math.round(k / 2), 1, 1);
    }
    // Os riscos do vento: correm para o lado, em alturas diferentes, ondulando de leve.
    for (let i = 0; i < 14; i++) {
      const altura = 3 + ((i * 17) % (VENTO.altura - 6));
      const comprimento = 8 + ((i * 7) % 14);
      const corre = (tempo * (240 + (i % 4) * 30) + i * 53) % (VENTO.alcance + comprimento);
      ctx.globalAlpha = 0.6 * forca * (i % 3 === 0 ? 1 : 0.65);
      ctx.fillStyle = '#f4f8ff';
      for (let k = 0; k < comprimento; k++) {
        const s = corre - k;
        if (s < 0 || s > VENTO.alcance) continue;
        const onda = Math.round(Math.sin(s * 0.12 + i) * 1.5);
        ctx.fillRect(Math.round(de + v.lado * s), Math.round(yChao - altura + onda), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }
  // As folhas, virando no ar: ora deitadas (2×1), ora de pé (1×2).
  for (const f of v.folhas) {
    ctx.fillStyle = f.cor;
    const deitada = Math.cos(f.fase) > 0;
    ctx.fillRect(Math.round(f.x), Math.round(f.y), deitada ? 2 : 1, deitada ? 1 : 2);
  }
  ctx.restore();
}

// ---- Salto Esmagador ----

function atualizarSalto(e: Efeitos, s: Salto, dt: number, alvos: readonly Alvo[]): boolean {
  const yChao = chao();
  if (!s.estourou) {
    // Agachando: a terra solta um pouco de poeira dos pés.
    if (s.m.idade < s.m.espera && Math.random() < dt * 30) poeira(e, s.m.x0, 1, 25);
    if (!manobraAcabou(s.m)) return true;
    s.estourou = true;
    for (const alvo of vivos(alvos, s.dono)) {
      const c = alvo.corpo;
      if (!dentroDaFaixa(c, s.m.x1, SALTO.raio) || yChao - c.y > SALTO.alturaDoTombo) continue;
      ferirAlvo(e, alvo, SALTO.dano);
      if (alvo.ferir) {
        empurrar(c, ladoDe(s.m.x1, c.x, s.dono.direcao) * SALTO.empurrao);
        if (!c.pesado) {
          c.vy = -150;
          c.noChao = false;
        }
      }
    }
    // O tombo: lascas e torrões voando, poeira abrindo para os dois lados.
    for (let k = 0; k < 22; k++) torrao(e, s.m.x1 + sortear(-SALTO.raio * 0.6, SALTO.raio * 0.6), yChao - 1, 150, [...TERRA, PEDRA.media, PEDRA.clara], k % 3 === 0 ? 2 : 1);
    poeira(e, s.m.x1 - 8, 14, 90, -1);
    poeira(e, s.m.x1 + 8, 14, 90, 1);
    return true;
  }
  s.depois += dt;
  return s.depois < 0.9;
}

function desenharSaltoNoChao(ctx: CanvasRenderingContext2D, s: Salto, tempo: number): void {
  const yChao = chao();
  if (!s.estourou) {
    // A marca do tombo: mais forte quanto mais perto de cair.
    const u = andamento(s.m);
    const pisca = 0.75 + 0.25 * Math.sin(tempo * (10 + u * 20));
    ctx.save();
    ctx.globalAlpha = (0.25 + 0.6 * u) * pisca;
    elipse(ctx, s.m.x1, yChao + 1, SALTO.raio * (0.6 + 0.4 * u), 3, 'rgba(40, 28, 16, 0.5)', true);
    elipse(ctx, s.m.x1, yChao, SALTO.raio, 4, PEDRA.clara, false);
    ctx.restore();
    return;
  }
  // A terra afundada e rachada onde ele caiu, sumindo aos poucos.
  const some = Math.max(0, 1 - s.depois / 0.9);
  ctx.save();
  ctx.globalAlpha = some;
  ctx.fillStyle = PEDRA.funda;
  for (const [i, rx] of s.rachaduras.entries()) {
    let x = Math.round(s.m.x1 + rx);
    for (let d = 0; d < 3 + (i % 3) * 2; d++) {
      if (d % 2) x += i % 2 ? 1 : -1;
      ctx.fillRect(x, yChao + d, 1, 1);
    }
  }
  ctx.restore();
}

function desenharSaltoNaFrente(ctx: CanvasRenderingContext2D, s: Salto): void {
  if (!s.estourou || s.depois > 0.45) return;
  // A onda de choque: dois arcos de poeira correndo pelo chão para os lados.
  const yChao = chao();
  const t = s.depois / 0.45;
  const alcance = SALTO.raio * (0.4 + 1.1 * t);
  ctx.save();
  ctx.globalAlpha = 0.8 * (1 - t);
  for (const lado of [-1, 1]) {
    const x = Math.round(s.m.x1 + lado * alcance);
    ctx.fillStyle = POEIRA[1];
    ctx.fillRect(x - 2, yChao - 3, 5, 3);
    ctx.fillStyle = POEIRA[3];
    ctx.fillRect(x - 1, yChao - 5, 3, 2);
  }
  ctx.restore();
}

// ---- Investida ----

function atualizarInvestida(e: Efeitos, iv: Investida, dt: number, alvos: readonly Alvo[]): boolean {
  const yChao = chao();
  const m = iv.m;
  if (m.idade < m.espera) {
    // Bate o pé duas vezes: poeira e a terra tremendo.
    const passo = Math.floor((m.idade / m.espera) * 2);
    if (passo > iv.passos - 1 && iv.passos < 2) {
      iv.passos++;
      poeira(e, m.x0, 6, 40);
      for (let k = 0; k < 3; k++) torrao(e, m.x0 + sortear(-6, 6), yChao - 1, 50, TERRA);
    }
    return true;
  }
  if (!manobraAcabou(m)) {
    const gx = pontoDaManobra(m, yChao).x;
    for (const alvo of vivos(alvos, iv.dono)) {
      const c = alvo.corpo;
      if (iv.atingidos.has(c)) continue;
      if (Math.abs(c.x - gx) > CORPO_GOLEM.meiaLargura + c.medida.meiaLargura || yChao - c.y > INVESTIDA.altura) continue;
      iv.atingidos.add(c);
      ferirAlvo(e, alvo, INVESTIDA.dano);
      if (alvo.ferir) {
        empurrar(c, iv.lado * INVESTIDA.empurrao);
        if (!c.pesado) {
          c.vy = -INVESTIDA.quique;
          c.noChao = false;
        }
      }
      for (let k = 0; k < 8; k++) faisca(e, c.x, c.y - 14, 60, 200, aoAcaso([PEDRA.clara, PEDRA.luz, '#fff1e6']), false);
    }
    // O rastro: poeira e torrões saindo de trás dos pés.
    if (Math.random() < dt * 40) poeira(e, gx - iv.lado * 8, 1, 50, -iv.lado as 1 | -1);
    if (Math.random() < dt * 14) torrao(e, gx - iv.lado * 6, yChao - 1, 70, TERRA, 1, 0.5);
    return true;
  }
  if (iv.depois === 0) poeira(e, m.x1 + iv.lado * 6, 10, 60, iv.lado);
  iv.depois += dt;
  return iv.depois < 0.3;
}

// ---- Pedra ----

function atualizarPedra(e: Efeitos, p: Pedregulho, dt: number, alvos: readonly Alvo[]): boolean {
  const yChao = chao();
  p.idade += dt;
  if (p.fase === 'arrancando') {
    // Sai do chão na frente dele e sobe até acima da cabeça.
    const t = Math.min(1, p.idade / PEDRA_DADOS.preparo);
    const topo = acimaDaCabeca(p.dono);
    const sobe = t < 0.35 ? 0 : (t - 0.35) / 0.65;
    const curva = 1 - (1 - sobe) ** 2;
    p.x = p.buraco + (topo.x - p.buraco) * curva;
    // Primeiro rompe a terra (sai de dentro, atrás da grama), depois sobe.
    const fora = yChao - RAIO_DO_PEDREGULHO + 2; // a pedra inteira acima da grama
    p.y = t < 0.35 ? yChao + RAIO_DO_PEDREGULHO - (t / 0.35) * (2 * RAIO_DO_PEDREGULHO - 2) : fora - (fora - topo.y) * curva;
    if (t < 0.4 && Math.random() < dt * 70) torrao(e, p.buraco + sortear(-10, 10), yChao - 1, 90, TERRA, Math.random() < 0.3 ? 2 : 1);
    if (t < 0.35 && Math.random() < dt * 20) poeira(e, p.buraco, 1, 30);
    if (t >= 1) {
      p.fase = 'voando';
      const v = arremesso(topo, p.alvoX, p.alvoY);
      p.vx = v.vx;
      p.vy = v.vy;
      p.x = topo.x;
      p.y = topo.y;
    }
    return true;
  }
  if (p.fase === 'voando') {
    p.giro += dt * 12 * Math.sign(p.vx || 1);
    const passos = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy) * dt) / 2));
    for (let i = 0; i < passos; i++) {
      const d = dt / passos;
      p.vy += PEDRA_DADOS.gravidade * d;
      p.x += p.vx * d;
      p.y += p.vy * d;
      const alvo = vivos(alvos, p.dono).find((a) => !p.atingidos.has(a.corpo) && acertaCorpo(a.corpo, p.x, p.y, PEDRA_DADOS.raio));
      if (alvo) {
        p.atingidos.add(alvo.corpo);
        ferirAlvo(e, alvo, PEDRA_DADOS.dano);
        if (alvo.ferir) empurrar(alvo.corpo, Math.sign(p.vx || 1) * PEDRA_DADOS.empurrao);
        return estourar(e, p, alvos);
      }
      if (p.y >= yChao - RAIO_DO_PEDREGULHO + 2) {
        p.y = yChao - RAIO_DO_PEDREGULHO + 2;
        return estourar(e, p, alvos);
      }
      if (p.x < -20 || p.x > MUNDO + 20) return false;
    }
    if (Math.random() < dt * 12) faisca(e, p.x, p.y, 10, 60, aoAcaso([MUSGO.medio, PEDRA.media]), false);
    return true;
  }
  p.depois += dt;
  return p.depois < 0.6;
}

// Estourou (em alguém ou no chão): lascas para todo lado; quem está perto do chão, ali, apanha.
function estourar(e: Efeitos, p: Pedregulho, alvos: readonly Alvo[]): boolean {
  const yChao = chao();
  p.fase = 'estourou';
  const noChao = p.y >= yChao - RAIO_DO_PEDREGULHO - 4;
  for (const alvo of vivos(alvos, p.dono)) {
    const c = alvo.corpo;
    if (p.atingidos.has(c)) continue;
    const perto = noChao ? dentroDaFaixa(c, p.x, PEDRA_DADOS.raioLascas) && yChao - c.y <= PEDRA_DADOS.alturaLascas : acertaCorpo(c, p.x, p.y, PEDRA_DADOS.raioLascas * 0.6);
    if (!perto) continue;
    p.atingidos.add(c);
    ferirAlvo(e, alvo, PEDRA_DADOS.lascas);
    if (alvo.ferir) empurrar(c, ladoDe(p.x, c.x, p.lado) * PEDRA_DADOS.empurrao * 0.6);
  }
  // As lascas: muitas, as maiores com 3 px, saindo de toda a pedra.
  for (let k = 0; k < 48; k++) {
    const a = Math.random() * Math.PI * 2;
    const v = sortear(60, 170);
    const total = sortear(0.7, 1.4);
    const x = p.x + Math.cos(a) * sortear(0, RAIO_DO_PEDREGULHO * 0.8);
    const y = p.y + Math.sin(a) * sortear(0, RAIO_DO_PEDREGULHO * 0.8);
    e.particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 70, gravidade: 420, vida: total, total, cor: aoAcaso([PEDRA.funda, PEDRA.escura, PEDRA.media, PEDRA.clara, MUSGO.medio]), somar: false, pousar: true, tam: k % 4 === 0 ? 3 : k % 2 ? 2 : 1 });
  }
  if (noChao) {
    poeira(e, p.x - 10, 14, 80, -1);
    poeira(e, p.x + 10, 14, 80, 1);
  } else {
    for (let k = 0; k < 10; k++) faisca(e, p.x, p.y, 50, 40, aoAcaso(POEIRA), false);
  }
  return true;
}

function desenharPedraNoChao(ctx: CanvasRenderingContext2D, p: Pedregulho): void {
  // O buraco de onde ela saiu, fechando aos poucos.
  const some = Math.max(0, 1 - p.idade / 1.2);
  if (some <= 0) return;
  const yChao = chao();
  ctx.save();
  ctx.globalAlpha = some;
  elipse(ctx, p.buraco, yChao + 1, RAIO_DO_PEDREGULHO, 2, PEDRA.funda, true);
  ctx.restore();
}

function desenharPedraNaFrente(ctx: CanvasRenderingContext2D, p: Pedregulho): void {
  if (p.fase === 'estourou') return;
  const yChao = chao();
  ctx.save();
  if (p.fase === 'arrancando') {
    // Saindo da terra: a parte ainda enterrada não aparece.
    ctx.beginPath();
    ctx.rect(p.x - 40, p.y - 40, 80, yChao + 2 - (p.y - 40));
    ctx.clip();
  }
  desenharPedregulho(ctx, p.x, p.y, p.giro);
  ctx.restore();
  // Saindo da terra, a grama na frente da base dela.
  if (p.fase === 'arrancando' && p.y > yChao - RAIO_DO_PEDREGULHO - 2) {
    redesenharGrama(ctx, p.buraco - RAIO_DO_PEDREGULHO - 2, p.buraco + RAIO_DO_PEDREGULHO + 2);
  }
}

// ---- Juntando ----

export function atualizarEfeitoGrow(e: Efeitos, ef: EfeitoGrow, dt: number, alvos: readonly Alvo[]): boolean {
  switch (ef.tipo) {
    case 'aves':
      return atualizarRevoada(e, ef, dt, alvos);
    case 'vento':
      return atualizarVendaval(e, ef, dt, alvos);
    case 'salto':
      return atualizarSalto(e, ef, dt, alvos);
    case 'investida':
      return atualizarInvestida(e, ef, dt, alvos);
    case 'pedra':
      return atualizarPedra(e, ef, dt, alvos);
  }
}

export function ameacasDoGrow(ef: EfeitoGrow, ameacas: Ameacas): void {
  const yChao = chao();
  if (ef.tipo === 'aves' && ef.fase === 'voando') {
    ameacas.projeteis.push({ x: ef.x, y: ef.y, vx: ef.dx * REVOADA.velocidade, vy: ef.dy * REVOADA.velocidade });
  } else if (ef.tipo === 'vento' && ventoSoprando(ef)) {
    const { de, ate } = faixaDoVento(ef);
    ameacas.areas.push({ x: (de + ate) / 2, raio: VENTO.alcance / 2, resta: 0, aviso: 0.3, baixa: false });
  } else if (ef.tipo === 'salto' && !ef.estourou) {
    const total = ef.m.espera + ef.m.duracao;
    ameacas.areas.push({ x: ef.m.x1, raio: SALTO.raio, resta: total - ef.m.idade, aviso: total, baixa: true });
  } else if (ef.tipo === 'investida' && !manobraAcabou(ef.m)) {
    const x = pontoDaManobra(ef.m, yChao).x;
    ameacas.projeteis.push({ x, y: yChao - 14, vx: ef.lado * INVESTIDA.velocidade, vy: 0 });
  } else if (ef.tipo === 'pedra' && ef.fase === 'voando') {
    ameacas.projeteis.push({ x: ef.x, y: ef.y, vx: ef.vx, vy: ef.vy });
  }
}

// Antes dos personagens: as marcas no chão.
export function desenharGrowNoChao(ctx: CanvasRenderingContext2D, ef: EfeitoGrow, tempo: number): void {
  if (ef.tipo === 'salto') desenharSaltoNoChao(ctx, ef, tempo);
  else if (ef.tipo === 'pedra') desenharPedraNoChao(ctx, ef);
}

// Depois dos personagens: o que voa e o vento.
export function desenharGrowNaFrente(ctx: CanvasRenderingContext2D, ef: EfeitoGrow, tempo: number): void {
  if (ef.tipo === 'aves') desenharRevoada(ctx, ef);
  else if (ef.tipo === 'vento') desenharVendaval(ctx, ef, tempo);
  else if (ef.tipo === 'salto') desenharSaltoNaFrente(ctx, ef);
  else if (ef.tipo === 'pedra') desenharPedraNaFrente(ctx, ef);
}

// ---- Prévia da mira ----
// Revoada: a linha pontilhada até onde o bando vai. Vendaval: a faixa do vento. Salto: onde ele
// cai. Investida: a linha no chão até onde ele corre. Pedra: o arco do arremesso.
export function desenharPreviaGrow(
  ctx: CanvasRenderingContext2D,
  poder: PoderGrow,
  origem: { x: number; y: number },
  alvo: { x: number; y: number },
  tempo: number,
  cores: { cor: string; sombra: string; passo: number },
): void {
  const yChao = chao();
  const ponto = (x: number, y: number): void => {
    ctx.fillStyle = cores.sombra;
    ctx.fillRect(Math.round(x), Math.round(y) + 1, 1, 1);
    ctx.fillStyle = cores.cor;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  const corre = (tempo * 20) % cores.passo;
  const lado = ladoDe(origem.x, alvo.x, 1);
  if (poder === 'aves') {
    const { dx, dy } = direcao({ x: origem.x, y: origem.y, alvoX: alvo.x, alvoY: alvo.y });
    const [fx, fy] = dy > 0.35 ? [Math.sign(dx || 1) * 0.94, 0.35] : [dx, dy];
    for (let s = 6 + corre; s <= REVOADA.alcance; s += cores.passo) {
      const y = origem.y + fy * s;
      if (y >= yChao - 3) break;
      ponto(origem.x + fx * s, y);
    }
  } else if (poder === 'vento') {
    const de = origem.x + lado * 4;
    for (let s = corre; s <= VENTO.alcance; s += cores.passo) {
      ponto(de + lado * s, yChao - VENTO.altura);
      ponto(de + lado * s, yChao - 1);
    }
    for (let h = 0; h <= VENTO.altura; h += cores.passo) ponto(de + lado * VENTO.alcance, yChao - h);
  } else if (poder === 'salto') {
    const x1 = destinoDoSalto(origem.x, alvo.x);
    const ry = 4;
    elipse(ctx, x1, yChao + 1, SALTO.raio, ry, cores.sombra, false);
    elipse(ctx, x1, yChao, SALTO.raio, ry, cores.cor, false);
    // O arco do pulo.
    const m: Manobra = { tipo: 'salto', x0: origem.x, x1, idade: 0, espera: 0, duracao: 1, altura: SALTO.altura };
    for (let u = (corre / cores.passo) * 0.05; u < 1; u += 0.05) {
      m.idade = u;
      const p = pontoDaManobra(m, yChao - 20);
      ponto(p.x, p.y);
    }
  } else if (poder === 'investida') {
    const x1 = destinoDaInvestida(origem.x, lado);
    for (let s = 6 + corre; s <= Math.abs(x1 - origem.x); s += cores.passo) ponto(origem.x + lado * s, yChao - 2);
    // A ponta da seta.
    ponto(x1 - lado, yChao - 4);
    ponto(x1 - lado, yChao);
  } else if (poder === 'pedra') {
    // `origem` é o peito do golem (26 px acima dos pés): a pedra sai de cima da cabeça.
    const topo = { x: origem.x, y: origem.y + 26 - CORPO_GOLEM.altura - RAIO_DO_PEDREGULHO - 3 };
    const v = arremesso(topo, alvo.x, alvo.y);
    let [x, y, vy] = [topo.x, topo.y, v.vy];
    const dt = 0.02;
    for (let i = 0; i < 90; i++) {
      vy += PEDRA_DADOS.gravidade * dt;
      x += v.vx * dt;
      y += vy * dt;
      if (y >= yChao - 2) break;
      if ((i + Math.floor(corre)) % 3 === 0) ponto(x, y);
    }
  }
}
