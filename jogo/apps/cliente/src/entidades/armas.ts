// As armas (números em compartilhado/conteudo/armas.ts): a espada e o arco que caem do céu de vez
// em quando, com uma coluna de luz dourada marcando onde vão cair e um brilho em volta enquanto
// esperam no chão; a arma na mão da forma base, com o braço segurando; o golpe da espada, que varre
// de cima para a frente, e a flecha do arco; e a arma quebrando quando o tempo dela acaba.
//
// Sozinho, o próprio jogo sorteia as quedas; online, elas chegam do servidor, que também decide
// quem pega. Como nos poderes, cada um confere só o que acerta o próprio personagem.

import {
  ARCO,
  DADOS_ARMA,
  ESPADA,
  MUNDO,
  QUEDA_DE_ARMAS,
  cabeOutraArma,
  sortearArma,
  sortearIntervaloDeArma,
  type ArmaNoMapa,
  type AtaqueUsado,
  type TipoArma,
} from '@terna/compartilhado';
import {
  BRACO_BASE,
  anguloNoMapa,
  desenharBracoEsticado,
  desenharMao,
  ombroDe,
  type Ponto,
} from './braco';
import { acertaCorpo, ferirAlvo, type Alvo, type CorpoAlvo, type Efeitos } from './poderes';

// ---- Na mão ----

export interface ArmaNaMao {
  tipo: TipoArma;
  durabilidade: number; // segundos até quebrar
  recarga: number; // segundos até o próximo ataque
}

// O ataque em curso, no corpo: o golpe da espada ou o arco esticado na direção da mira.
export interface Ataque {
  tipo: TipoArma;
  mira: number; // ângulo da mira no corpo (0 = para a frente, positivo = para baixo)
  idade: number;
  atingidos: CorpoAlvo[]; // a espada acerta cada um uma vez por golpe
}

// O que as armas precisam de um personagem (o corpo é de entidades/personagem.ts).
export interface CorpoArmado extends CorpoAlvo {
  direcao: 1 | -1;
  dash: number; // no dash o lado já está decidido: o ataque não vira o corpo
  arma: ArmaNaMao | null;
  ataque: Ataque | null;
}

// As poses, em ângulos do corpo (0 = frente, positivo = para baixo) e pixels. Parado com a arma,
// o braço desce um pouco para a frente: a espada aponta para o alto, pronta, e o arco fica em pé.
const POSE = {
  braco: 5, // o braço segurando, parado
  bracoGolpe: 7, // varrendo com a espada
  bracoArco: 9, // esticado mirando
  descanso: { espada: 0.9, arco: 1.05 }, // o braço parado
  espadaEmPe: -1.05, // a espada, parada
  // O golpe começa atrás da cabeça e termina para a frente e para baixo da mira.
  golpeDe: -1.9,
  golpeAte: 0.7,
  miraEspada: 0.8, // a espada mira no máximo isto para cima ou para baixo
  miraArco: 1.35,
};
const DURACAO_ATAQUE: Record<TipoArma, number> = { espada: ESPADA.golpe + 0.08, arco: 0.4 };
const LAMINA = { de: 3, ate: 14 }; // pixels da mão até o começo e a ponta da lâmina
const ACABANDO = 3; // segundos: com menos que isto de durabilidade, a arma pisca

const cores = {
  lamina: '#e6ecf3',
  laminaEscura: '#8a96a8',
  ponta: '#ffffff',
  guarda: '#d9a53a',
  guardaClara: '#ffd966',
  cabo: '#6b3f22',
  madeira: '#8a5a2b',
  madeiraClara: '#c7874a',
  corda: '#d8c8a4',
  haste: '#c9a26b',
  pena: '#ffffff',
  penaEscura: '#e8445e',
  dourado: '#ffd966',
  douradoClaro: '#fff4c2',
};

// O ângulo da mira no corpo, do ombro até o ponto mirado, limitado para a frente.
function anguloDaMira(c: CorpoArmado, alvo: Ponto, limite: number): number {
  const ombro = ombroDe(c);
  const dx = Math.max(1, (alvo.x - ombro.x) * c.direcao);
  return Math.max(-limite, Math.min(limite, Math.atan2(alvo.y - ombro.y, dx)));
}

// Onde a mão fica mirando `alvo` com o arco: de onde sai a flecha.
function maoMirando(c: CorpoArmado, alvo: Ponto): Ponto {
  const ombro = ombroDe(c);
  const a = anguloNoMapa(anguloDaMira(c, alvo, POSE.miraArco), c.direcao);
  return { x: ombro.x + Math.cos(a) * POSE.bracoArco, y: ombro.y + Math.sin(a) * POSE.bracoArco };
}

// O braço do golpe da espada, `t` de 0 a 1: rápido no começo, freando no fim.
function anguloDoGolpe(mira: number, t: number): number {
  const e = 1 - (1 - Math.min(1, t)) ** 3;
  return mira + POSE.golpeDe + (POSE.golpeAte - POSE.golpeDe) * e;
}

// ---- No mapa ----

interface ArmaNoChao {
  id: number;
  tipo: TipoArma;
  x: number;
  y: number; // a ponta de baixo da arma
  vy: number;
  durabilidade: number;
  pousou: boolean;
  idade: number; // segundos desde que pousou (o brilho pulsa com ela)
  daMao: boolean; // largada por alguém: cai de perto, sem a coluna de luz
}

interface Flecha {
  dono: CorpoAlvo;
  x: number;
  y: number;
  vx: number;
  vy: number;
  percorrido: number;
  presa: number; // segundos fincada no chão (−1 voando)
}

interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravidade: number;
  vida: number;
  total: number;
  cor: string;
  somar: boolean; // luz (soma) ou pedaço (por cima)
}

export interface Arsenal {
  chao: ArmaNoChao[];
  flechas: Flecha[];
  particulas: Particula[];
  proximoId: number;
  ateCair: number | null; // sozinho: segundos até a próxima tentativa de queda (online: null)
}

// `sozinho`: o jogo sorteia as quedas; senão elas chegam do servidor.
export function criarArsenal(sozinho: boolean): Arsenal {
  return { chao: [], flechas: [], particulas: [], proximoId: 1, ateCair: sozinho ? QUEDA_DE_ARMAS.primeira : null };
}

let yChao = 0;
export function prepararArmas(yDoChao: number): void {
  yChao = yDoChao;
}

// No chão, a arma flutua um pouco acima da grama.
const FLUTUA = 5;
const TOPO_DO_CEU = -20;

// Põe no mapa uma arma que caiu do céu ou foi largada (a que chegou do servidor, ou a daqui).
// `daMao`: largada por alguém — cai de perto, sem a coluna de luz.
export function soltarNoMapa(a: Arsenal, arma: ArmaNoMapa, daMao = arma.de !== undefined): void {
  a.chao.push({
    id: arma.id,
    tipo: arma.tipo,
    x: arma.x,
    y: daMao ? yChao - 14 : TOPO_DO_CEU,
    vy: daMao ? -70 : QUEDA_DE_ARMAS.velocidade,
    durabilidade: arma.durabilidade,
    pousou: false,
    idade: 0,
    daMao,
  });
}

// Sozinho: de tempos em tempos tenta soltar uma do céu, se couber (`naMao`: com os personagens).
export function atualizarQuedas(a: Arsenal, dt: number, naMao: number): void {
  if (a.ateCair === null || (a.ateCair -= dt) > 0) return;
  a.ateCair = sortearIntervaloDeArma(Math.random);
  if (!cabeOutraArma(a.chao.length, naMao)) return;
  const { tipo, x } = sortearArma(Math.random);
  soltarNoMapa(a, { id: a.proximoId++, tipo, x, durabilidade: DADOS_ARMA[tipo].durabilidade });
}

// A arma que o corpo alcança agora (caindo ou já no chão), se houver.
export function armaAoAlcance(a: Arsenal, c: CorpoAlvo): { id: number } | undefined {
  return a.chao.find(
    (i) => Math.abs(i.x - c.x) <= QUEDA_DE_ARMAS.pegar && i.y >= c.y - 32 && i.y - 14 <= c.y,
  );
}

// Tira do chão e põe na mão (o seu, o da CPU, ou o do outro quando o servidor avisa).
export function pegarArma(a: Arsenal, c: CorpoArmado, id: number): void {
  const i = a.chao.findIndex((arma) => arma.id === id);
  if (i < 0) return;
  const [arma] = a.chao.splice(i, 1);
  c.arma = { tipo: arma.tipo, durabilidade: arma.durabilidade, recarga: 0 };
  c.ataque = null;
  // Um estalo de luz dourada onde ela estava.
  for (let k = 0; k < 14; k++) faisca(a, arma.x, arma.y - 7, 45, -20, k % 2 ? cores.dourado : cores.douradoClaro);
}

// Tira da mão para largar no chão (virou anjo com ela): o que vai para o mapa.
export function tirarDaMao(c: CorpoArmado): { tipo: TipoArma; x: number; durabilidade: number } | null {
  if (!c.arma) return null;
  const largada = { tipo: c.arma.tipo, x: Math.max(0, Math.min(MUNDO, c.x)), durabilidade: c.arma.durabilidade };
  c.arma = null;
  c.ataque = null;
  return largada;
}

// A arma acabou: some da mão em pedaços.
export function quebrarArma(a: Arsenal, c: CorpoArmado): void {
  if (!c.arma) return;
  const tipo = c.arma.tipo;
  c.arma = null;
  c.ataque = null;
  const mao = ombroDe(c);
  const pedacos = tipo === 'espada' ? [cores.lamina, cores.laminaEscura, cores.guarda] : [cores.madeira, cores.madeiraClara, cores.corda];
  for (let k = 0; k < 16; k++) {
    const cor = pedacos[k % pedacos.length];
    const total = 0.5 + Math.random() * 0.4;
    const ang = -Math.PI * Math.random();
    const v = 40 + Math.random() * 60;
    a.particulas.push({ x: mao.x, y: mao.y + 3, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, gravidade: 380, vida: total, total, cor, somar: false });
  }
  for (let k = 0; k < 8; k++) faisca(a, mao.x, mao.y + 3, 50, 0, cores.ponta);
}

// Passa o tempo da arma na mão: a recarga entre ataques e a durabilidade. Devolve se quebrou agora.
// `podeQuebrar`: o seu e o da CPU; o do outro online só quebra quando ele avisa.
export function gastarArma(a: Arsenal, c: CorpoArmado, dt: number, podeQuebrar: boolean): boolean {
  if (!c.arma) return false;
  c.arma.recarga = Math.max(0, c.arma.recarga - dt);
  c.arma.durabilidade = Math.max(0, c.arma.durabilidade - dt);
  if (c.arma.durabilidade > 0 || !podeQuebrar) return false;
  quebrarArma(a, c);
  return true;
}

// Botão esquerdo com uma arma na mão: ataca na direção de `alvo` se a recarga deixar (clique
// antes disso não faz nada). Volta o ataque, para lançar aqui e mandar pela rede.
export function tentarAtacar(c: CorpoArmado, alvo: Ponto): AtaqueUsado | null {
  if (!c.arma || c.arma.recarga > 0) return null;
  c.arma.recarga = DADOS_ARMA[c.arma.tipo].recarga;
  virarPara(c, alvo);
  const mao = c.arma.tipo === 'arco' ? maoMirando(c, alvo) : ombroDe(c);
  return { arma: c.arma.tipo, x: Math.max(0, Math.min(MUNDO, mao.x)), y: mao.y, alvoX: alvo.x, alvoY: alvo.y };
}

function virarPara(c: CorpoArmado, alvo: Ponto): void {
  if (Math.abs(alvo.x - c.x) >= 1 && c.dash <= 0) c.direcao = alvo.x > c.x ? 1 : -1;
}

// Faz o ataque no corpo (o seu, o da CPU, ou o do outro que chegou pela rede): a pose e, no
// arco, a flecha saindo de onde o ataque diz.
export function lancarAtaque(a: Arsenal, c: CorpoArmado, uso: AtaqueUsado): void {
  const alvo = { x: uso.alvoX, y: uso.alvoY };
  virarPara(c, alvo);
  const limite = uso.arma === 'espada' ? POSE.miraEspada : POSE.miraArco;
  c.ataque = { tipo: uso.arma, mira: anguloDaMira(c, alvo, limite), idade: 0, atingidos: [] };
  if (uso.arma !== 'arco') return;
  let dx = uso.alvoX - uso.x;
  let dy = uso.alvoY - uso.y;
  const d = Math.hypot(dx, dy);
  [dx, dy] = d < 1 ? [c.direcao, 0] : [dx / d, dy / d];
  a.flechas.push({ dono: c, x: uso.x, y: uso.y, vx: dx * ARCO.velocidade, vy: dy * ARCO.velocidade, percorrido: 0, presa: -1 });
}

function faisca(a: Arsenal, x: number, y: number, forca: number, subir: number, cor: string): void {
  const ang = Math.random() * Math.PI * 2;
  const v = forca * (0.4 + Math.random() * 0.6);
  const total = 0.3 + Math.random() * 0.4;
  a.particulas.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v + subir, gravidade: 0, vida: total, total, cor, somar: true });
}

const vivos = (alvos: readonly Alvo[], dono: CorpoAlvo): Alvo[] =>
  alvos.filter((alvo) => alvo.corpo !== dono && alvo.corpo.vida > 0);

// A lâmina durante o golpe: confere os pontos dela nos corpos, cada um uma vez por golpe.
function golpear(e: Efeitos, a: Arsenal, c: CorpoArmado, ataque: Ataque, alvos: readonly Alvo[]): void {
  const t = ataque.idade / ESPADA.golpe;
  if (t < 0.12 || t > 1) return;
  const ombro = ombroDe(c);
  const ang = anguloNoMapa(anguloDoGolpe(ataque.mira, t), c.direcao);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  for (const alvo of vivos(alvos, c)) {
    if (ataque.atingidos.includes(alvo.corpo)) continue;
    for (let k = 0; k <= LAMINA.ate; k += 3) {
      const x = ombro.x + cos * (POSE.bracoGolpe + k);
      const y = ombro.y + sin * (POSE.bracoGolpe + k);
      if (!acertaCorpo(alvo.corpo, x, y, 2)) continue;
      ataque.atingidos.push(alvo.corpo);
      ferirAlvo(e, alvo, ESPADA.dano);
      for (let n = 0; n < 12; n++) faisca(a, x, y, 70, 0, n % 3 ? cores.lamina : cores.ponta);
      break;
    }
  }
}

function atualizarFlecha(e: Efeitos, a: Arsenal, f: Flecha, dt: number, alvos: readonly Alvo[]): boolean {
  if (f.presa >= 0) return (f.presa += dt) < 0.9;
  // Em passos curtos, para a flecha rápida não atravessar ninguém entre dois quadros.
  const partes = Math.max(1, Math.ceil((ARCO.velocidade * dt) / 4));
  const passo = dt / partes;
  for (let i = 0; i < partes; i++) {
    f.vy += ARCO.gravidade * passo;
    f.x += f.vx * passo;
    f.y += f.vy * passo;
    f.percorrido += Math.hypot(f.vx, f.vy) * passo;
    for (const alvo of vivos(alvos, f.dono)) {
      if (!acertaCorpo(alvo.corpo, f.x, f.y, 1)) continue;
      ferirAlvo(e, alvo, ARCO.dano);
      for (let n = 0; n < 10; n++) faisca(a, f.x, f.y, 60, 0, n % 2 ? cores.haste : cores.ponta);
      return false;
    }
    if (f.y >= yChao) {
      // Finca no chão, inclinada, e some logo depois.
      f.y = yChao;
      f.presa = 0;
      return true;
    }
    if (f.percorrido >= ARCO.alcance || f.x < 0 || f.x > MUNDO) return false;
  }
  return true;
}

function atualizarNoChao(a: Arsenal, i: ArmaNoChao, dt: number): void {
  if (i.pousou) {
    i.idade += dt;
    // Faíscas douradas subindo devagar em volta, para chamar a atenção de longe.
    if (Math.random() < dt * 6) {
      const total = 0.9 + Math.random() * 0.5;
      a.particulas.push({
        x: i.x + (Math.random() - 0.5) * 16,
        y: i.y - Math.random() * 8,
        vx: 0,
        vy: -18 - Math.random() * 10,
        gravidade: 0,
        vida: total,
        total,
        cor: Math.random() < 0.5 ? cores.dourado : cores.douradoClaro,
        somar: true,
      });
    }
    return;
  }
  const pouso = yChao - FLUTUA;
  if (i.daMao) i.vy += 400 * dt;
  i.y += i.vy * dt;
  if (i.y < pouso || i.vy < 0) return;
  i.y = pouso;
  i.vy = 0;
  i.pousou = true;
  // Pousou: a poeira de luz que abre para os lados.
  for (let k = 0; k < (i.daMao ? 8 : 22); k++) {
    const lado = k % 2 ? 1 : -1;
    const total = 0.4 + Math.random() * 0.3;
    a.particulas.push({
      x: i.x + lado * Math.random() * 4,
      y: yChao - 1,
      vx: lado * (30 + Math.random() * 50),
      vy: -10 - Math.random() * 25,
      gravidade: 60,
      vida: total,
      total,
      cor: k % 3 ? cores.dourado : cores.douradoClaro,
      somar: true,
    });
  }
}

// Um quadro das armas: as que caem e esperam, as flechas, os golpes de espada em curso (de
// `corpos`, acertando `alvos`) e as partículas.
export function atualizarArsenal(
  a: Arsenal,
  e: Efeitos,
  dt: number,
  corpos: readonly CorpoArmado[],
  alvos: readonly Alvo[],
): void {
  for (const i of a.chao) atualizarNoChao(a, i, dt);
  for (const c of corpos) {
    const ataque = c.ataque;
    if (!ataque) continue;
    ataque.idade += dt;
    if (ataque.tipo === 'espada') golpear(e, a, c, ataque, alvos);
    if (ataque.idade >= DURACAO_ATAQUE[ataque.tipo]) c.ataque = null;
  }
  a.flechas = a.flechas.filter((f) => atualizarFlecha(e, a, f, dt, alvos));
  for (const p of a.particulas) {
    p.vida -= dt;
    p.vy += p.gravidade * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  a.particulas = a.particulas.filter((p) => p.vida > 0);
}

// Para a CPU: onde estão as armas que dá para ir pegar.
export function armasNoChao(a: Arsenal): { x: number; pousou: boolean }[] {
  return a.chao.map((i) => ({ x: i.x, pousou: i.pousou }));
}

// ---- Desenho ----

// Um pixel a `k` pixels da origem ao longo de `ang` e `lado` pixels para o lado.
function pixel(ctx: CanvasRenderingContext2D, o: Ponto, ang: number, k: number, lado: number, cor: string): void {
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  ctx.fillStyle = cor;
  ctx.fillRect(Math.round(o.x + cos * k - sin * lado), Math.round(o.y + sin * k + cos * lado), 1, 1);
}

// A espada com o cabo em `mao`, apontando para `ang` (no mapa): pomo, cabo, guarda dourada,
// lâmina de 2 px (clara em cima, escura embaixo) e a ponta branca.
function desenharEspada(ctx: CanvasRenderingContext2D, mao: Ponto, ang: number): void {
  pixel(ctx, mao, ang, -2, 0, cores.guarda);
  for (let k = -1; k <= 1; k += 0.5) pixel(ctx, mao, ang, k, 0, cores.cabo);
  for (let l = -2; l <= 2; l += 0.5) pixel(ctx, mao, ang, 2, l, Math.abs(l) < 1 ? cores.guardaClara : cores.guarda);
  for (let k = LAMINA.de; k < LAMINA.ate; k += 0.5) {
    pixel(ctx, mao, ang, k, 0.5, cores.laminaEscura);
    pixel(ctx, mao, ang, k, -0.5, cores.lamina);
  }
  pixel(ctx, mao, ang, LAMINA.ate, 0, cores.ponta);
}

// O arco com a empunhadura em `mao`, virado para `ang` (no mapa): as duas pontas curvam para trás
// e a corda fica reta entre elas — ou puxada para trás, `puxar` de 0 a 1.
function desenharArco(ctx: CanvasRenderingContext2D, mao: Ponto, ang: number, puxar: number): void {
  const meia = 7;
  const curva = 3;
  for (let s = -meia; s <= meia; s += 0.5) {
    const k = curva * (1 - (s / meia) ** 2) - curva;
    pixel(ctx, mao, ang, k, s, Math.abs(s) < 1.5 ? cores.madeiraClara : cores.madeira);
    pixel(ctx, mao, ang, k - 1, s, cores.madeira);
  }
  // A corda: das pontas até o meio, que vai para trás quando puxada.
  const meio = -curva - 1 - puxar * 4;
  for (const lado of [-1, 1]) {
    for (let t = 0; t <= 1; t += 0.04) {
      pixel(ctx, mao, ang, -curva - 1 + (meio + curva + 1) * t, lado * meia * (1 - t), cores.corda);
    }
  }
}

// Uma flecha com a ponta em `o`, voando para `ang`: ponta de metal, haste e as penas atrás.
function desenharFlechaEm(ctx: CanvasRenderingContext2D, o: Ponto, ang: number): void {
  pixel(ctx, o, ang, 0, 0, cores.ponta);
  pixel(ctx, o, ang, -1, 0, cores.lamina);
  for (let k = -2; k >= -8; k -= 0.5) pixel(ctx, o, ang, k, 0, cores.haste);
  for (const k of [-8, -9]) {
    pixel(ctx, o, ang, k, -1, cores.pena);
    pixel(ctx, o, ang, k, 1, cores.penaEscura);
  }
}

// A arma parada, de pé: a espada de ponta para baixo e o arco em pé, com a ponta de baixo em `y`.
function desenharArmaEmPe(ctx: CanvasRenderingContext2D, tipo: TipoArma, x: number, y: number): void {
  if (tipo === 'espada') desenharEspada(ctx, { x, y: y - LAMINA.ate }, Math.PI / 2);
  else desenharArco(ctx, { x: x + 1, y: y - 8 }, -0.0001, 0);
}

function brilho(ctx: CanvasRenderingContext2D, x: number, y: number, raio: number, forca: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, raio);
  g.addColorStop(0, `rgba(255, 230, 140, ${forca})`);
  g.addColorStop(1, 'rgba(255, 217, 102, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - raio, y - raio, raio * 2, raio * 2);
}

// Antes dos personagens: as armas caindo e no chão, com a luz em volta.
export function desenharArmasNoChao(ctx: CanvasRenderingContext2D, a: Arsenal, tempo: number): void {
  for (const i of a.chao) {
    const pulso = 0.75 + 0.25 * Math.sin(tempo * 5 + i.id);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (!i.pousou && !i.daMao) {
      // Caindo do céu: a coluna de luz do alto até ela e a marca no chão de onde vai pousar.
      const coluna = ctx.createLinearGradient(i.x - 6, 0, i.x + 6, 0);
      coluna.addColorStop(0, 'rgba(255, 217, 102, 0)');
      coluna.addColorStop(0.5, `rgba(255, 236, 170, ${0.3 * pulso})`);
      coluna.addColorStop(1, 'rgba(255, 217, 102, 0)');
      ctx.fillStyle = coluna;
      ctx.fillRect(i.x - 6, 0, 12, yChao);
      ctx.globalAlpha = 0.5 * pulso;
      ctx.fillStyle = cores.douradoClaro;
      ctx.fillRect(Math.round(i.x), 0, 1, Math.round(i.y));
      ctx.globalAlpha = 0.6 * pulso;
      ctx.fillStyle = cores.dourado;
      const rx = 9;
      ctx.fillRect(Math.round(i.x) - rx, yChao - 1, rx * 2 + 1, 1);
      ctx.fillRect(Math.round(i.x) - rx + 3, yChao - 2, rx * 2 - 5, 1);
      ctx.globalAlpha = 1;
    }
    if (i.pousou) {
      // Esperando: um facho curto subindo e o chão aceso embaixo.
      const facho = ctx.createLinearGradient(0, i.y - 40, 0, yChao);
      facho.addColorStop(0, 'rgba(255, 217, 102, 0)');
      facho.addColorStop(1, `rgba(255, 236, 170, ${0.28 * pulso})`);
      ctx.fillStyle = facho;
      ctx.fillRect(i.x - 5, i.y - 40, 10, yChao - i.y + 40);
      brilho(ctx, i.x, yChao, 14, 0.35 * pulso);
    }
    brilho(ctx, i.x, i.y - 8, 14, 0.35 * pulso);
    ctx.restore();
    // Pousada, sobe e desce devagar.
    const balanco = i.pousou ? Math.round(Math.sin(i.idade * 2.4) * 1.2) : 0;
    desenharArmaEmPe(ctx, i.tipo, Math.round(i.x), Math.round(i.y) + balanco);
  }
}

// Depois dos personagens: as flechas e as partículas.
export function desenharArmasNaFrente(ctx: CanvasRenderingContext2D, a: Arsenal): void {
  for (const f of a.flechas) {
    ctx.save();
    if (f.presa >= 0) ctx.globalAlpha = Math.min(1, (0.9 - f.presa) / 0.3);
    desenharFlechaEm(ctx, { x: f.x, y: f.y }, Math.atan2(f.vy, f.vx));
    ctx.restore();
  }
  for (const p of a.particulas) {
    ctx.save();
    if (p.somar) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, (p.vida / p.total) * 1.6);
    ctx.fillStyle = p.cor;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    ctx.restore();
  }
}

// A arma na mão, por cima do sprite: o braço saindo do ombro da frente e a arma na mão. Parado,
// a pose de segurar; atacando, a espada varrendo (com o risco de luz da ponta) ou o arco esticado
// na direção da mira, com a corda voltando depois de soltar a flecha. Acabando, pisca.
export function desenharArmaNaMao(ctx: CanvasRenderingContext2D, c: CorpoArmado, tempo: number): void {
  const arma = c.arma;
  if (!arma) return;
  const ombro = ombroDe(c);
  const ataque = c.ataque?.tipo === arma.tipo ? c.ataque : null;
  ctx.save();
  if (arma.durabilidade < ACABANDO && Math.floor(tempo * 8) % 2 === 0) ctx.globalAlpha = 0.45;
  if (arma.tipo === 'espada') {
    if (ataque) {
      const t = ataque.idade / ESPADA.golpe;
      desenharRisco(ctx, c, ombro, ataque.mira, Math.min(1, t));
      const ang = anguloNoMapa(anguloDoGolpe(ataque.mira, t), c.direcao);
      const mao = desenharBracoEsticado(ctx, ombro, ang, POSE.bracoGolpe, BRACO_BASE);
      desenharEspada(ctx, mao, ang);
      desenharMao(ctx, mao, BRACO_BASE);
    } else {
      const mao = desenharBracoEsticado(ctx, ombro, anguloNoMapa(POSE.descanso.espada, c.direcao), POSE.braco, BRACO_BASE);
      desenharEspada(ctx, mao, anguloNoMapa(POSE.espadaEmPe, c.direcao));
      desenharMao(ctx, mao, BRACO_BASE);
    }
  } else if (ataque) {
    // Mirando: estica rápido, fica, e a corda treme de volta depois da flecha sair.
    const t = ataque.idade / DURACAO_ATAQUE.arco;
    const estica = t < 0.15 ? 0.6 + (t / 0.15) * 0.4 : t > 0.8 ? 1 - ((t - 0.8) / 0.2) * 0.4 : 1;
    const ang = anguloNoMapa(ataque.mira, c.direcao);
    const mao = desenharBracoEsticado(ctx, ombro, ang, Math.round(POSE.bracoArco * estica), BRACO_BASE);
    const treme = t < 0.35 ? Math.abs(Math.sin(t * 60)) * (1 - t / 0.35) * 0.6 : 0;
    desenharArco(ctx, mao, ang, treme);
    desenharMao(ctx, mao, BRACO_BASE);
  } else {
    const mao = desenharBracoEsticado(ctx, ombro, anguloNoMapa(POSE.descanso.arco, c.direcao), POSE.braco, BRACO_BASE);
    desenharArco(ctx, mao, anguloNoMapa(0, c.direcao), 0);
    desenharMao(ctx, mao, BRACO_BASE);
  }
  ctx.restore();
}

// O risco de luz que a ponta da espada deixa no golpe: um arco que se apaga para trás.
function desenharRisco(ctx: CanvasRenderingContext2D, c: CorpoArmado, ombro: Ponto, mira: number, t: number): void {
  const raio = POSE.bracoGolpe + LAMINA.ate;
  const de = Math.max(0, t - 0.55);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Passos miúdos: no começo o golpe corre rápido, e com passos grandes o risco saía pontilhado.
  for (let s = de; s <= t; s += 0.004) {
    const ang = anguloNoMapa(anguloDoGolpe(mira, s), c.direcao);
    ctx.globalAlpha = 0.6 * ((s - de) / Math.max(0.01, t - de));
    for (const r of [raio, raio - 1]) {
      ctx.fillStyle = r === raio ? cores.ponta : cores.lamina;
      ctx.fillRect(Math.round(ombro.x + Math.cos(ang) * r), Math.round(ombro.y + Math.sin(ang) * r), 1, 1);
    }
  }
  ctx.restore();
}

// Com o arco pronto: por onde a flecha vai se clicar agora — pontinhos seguindo a queda dela.
export function desenharPreviaDoArco(ctx: CanvasRenderingContext2D, c: CorpoArmado, alvo: Ponto, tempo: number): void {
  const mao = maoMirando(c, alvo);
  let dx = alvo.x - mao.x;
  let dy = alvo.y - mao.y;
  const d = Math.hypot(dx, dy) || 1;
  [dx, dy] = [dx / d, dy / d];
  let x = mao.x;
  let y = mao.y;
  let vx = dx * ARCO.velocidade;
  let vy = dy * ARCO.velocidade;
  const passo = 1 / 120;
  let andou = 0;
  let proximo = 8 + ((tempo * 20) % 6);
  ctx.save();
  ctx.globalAlpha = 0.55 * (0.8 + 0.2 * Math.sin(tempo * 4));
  while (andou < ARCO.alcance * 0.6 && y < yChao) {
    vy += ARCO.gravidade * passo;
    x += vx * passo;
    y += vy * passo;
    andou += Math.hypot(vx, vy) * passo;
    if (andou < proximo) continue;
    proximo += 6;
    ctx.fillStyle = '#3a2a10';
    ctx.fillRect(Math.round(x), Math.round(y) + 1, 1, 1);
    ctx.fillStyle = cores.douradoClaro;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  ctx.restore();
}

// Os ícones do painel (9×8), um por arma: a espada na diagonal e o arco com a flecha.
export const DESENHO_ICONE: Record<TipoArma, readonly string[]> = {
  espada: ['.......wl', '......wld', '.....wld.', '.g..wld..', '..gwld...', '..cg.....', '.c..g....', 'c........'],
  arco: ['..mM.....', '.m..s....', 'm...s....', 'm.hhhhhhw', 'm...s....', '.m..s....', '..mM.....', '.........'],
};
export const PALETA_ICONE = {
  w: cores.ponta,
  l: cores.lamina,
  d: cores.laminaEscura,
  g: cores.guarda,
  c: cores.cabo,
  m: cores.madeira,
  M: cores.madeiraClara,
  s: cores.corda,
  h: cores.haste,
};
