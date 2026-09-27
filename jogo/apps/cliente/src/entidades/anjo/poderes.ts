// Os três poderes do Anjo no mapa (números em compartilhado/conteudo/anjo.ts): os dois corações
// da Rajada de Amor e o encanto que eles deixam, a fileira de círculos e explosões do Impacto
// Angelical, a marca e o pilar do Julgamento Celestial. Tudo em tons de rosa, vinho e branco,
// como a referência dos poderes. O Anjo está desligado por enquanto (ver conteudo/herois.ts).

import { IMPACTO, JULGAMENTO, MUNDO, RAJADA, type PoderUsado } from '@terna/compartilhado';
import { criarSprite } from '../../motor/imagens';
import {
  dentroDaFaixa,
  acertaCorpo,
  chao,
  elipse,
  faisca,
  ferirAlvo,
  limitarAoAlcance,
  vivos,
  type Alvo,
  type Ameacas,
  type CorpoAlvo,
  type Dono,
  type Encanto,
  type Nucleo,
} from '../efeitos';

export type PoderAnjo = 'impacto' | 'rajada' | 'julgamento';

// Um coração da Rajada. Voa numa linha reta (`bx`, `by`) e flutua para os lados dela; `x`, `y`
// é onde ele está de verdade, na linha mais a ondulação.
interface Rajada {
  tipo: 'rajada';
  dono: Dono;
  bx: number;
  by: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  percorrido: number;
  alcance: number;
  espera: number; // segundos até sair (o segundo coração sai logo depois do primeiro)
  fase: number; // da ondulação: os dois flutuam desencontrados
}

interface Area {
  tipo: 'impacto' | 'julgamento';
  dono: Dono;
  x: number; // centro, no chão
  idade: number; // negativa enquanto espera a vez (as explosões da fileira saem uma depois da outra)
  estourou: boolean;
  pontas: number[]; // alturas dos raios da explosão (sorteadas ao lançar), de 0 a 1
}

export type EfeitoAnjo = Rajada | Area;
type Efeitos = Nucleo<EfeitoAnjo>;

export const ROSA = {
  vinho: '#5a0f36',
  escuro: '#9e1450',
  magenta: '#e8207a',
  rosa: '#ff5fa2',
  claro: '#ff9fcb',
  branco: '#ffe3f1',
};
const CORES_FAISCA = [ROSA.branco, ROSA.claro, ROSA.rosa, ROSA.magenta];
const faiscaAoAcaso = (): string => CORES_FAISCA[(Math.random() * CORES_FAISCA.length) | 0];
const brilho = (e: Efeitos, x: number, y: number, forca: number, gravidade: number): void =>
  faisca(e, x, y, forca, gravidade, faiscaAoAcaso());

// O coração da Rajada: maior que os que flutuam em volta do anjo, para ler de longe.
const CORACAO_RAJADA = criarSprite(['.rr.rr.', 'rwrrrrr', 'rcrrrrm', '.rrrrm.', '..rrm..', '...m...'], {
  r: ROSA.rosa,
  c: ROSA.claro,
  w: ROSA.branco,
  m: ROSA.magenta,
});

// A fileira do Impacto: a primeira explosão na direção do cursor (nem perto nem longe demais) e
// as outras em seguida, cada uma começando onde a anterior acaba. Os centros, no mapa.
function fileiraDoImpacto(deX: number, alvoX: number): number[] {
  const lado = alvoX >= deX ? 1 : -1;
  const distancia = Math.max(IMPACTO.perto, Math.min(IMPACTO.alcance, Math.abs(alvoX - deX)));
  const centros: number[] = [];
  for (let i = 0; i < IMPACTO.explosoes; i++) {
    const x = deX + lado * (distancia + i * IMPACTO.raio * 2);
    if (x < 0 || x > MUNDO) break;
    centros.push(x);
  }
  return centros;
}

const pontasAoAcaso = (): number[] => Array.from({ length: 9 }, () => 0.35 + Math.random() * 0.65);

// Até onde cada poder pega (para a CPU): o Impacto, até o fim da fileira.
export const ALCANCE_ANJO: Record<PoderAnjo, number> = {
  rajada: RAJADA.alcance - 10,
  impacto: IMPACTO.alcance + IMPACTO.raio * 2 * (IMPACTO.explosoes - 1),
  julgamento: JULGAMENTO.alcance,
};

// Põe no mapa o poder usado. Tudo sai do uso (origem e alvo), então os dois lados online montam
// o mesmo poder.
export function lancarPoderAnjo(e: Efeitos, dono: Dono, uso: PoderUsado & { poder: PoderAnjo }): void {
  if (uso.poder === 'rajada') {
    let dx = uso.alvoX - uso.x;
    let dy = uso.alvoY - uso.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) [dx, dy] = [1, 0];
    else [dx, dy] = [dx / d, dy / d];
    // O curto sai primeiro; o longo, logo atrás, flutuando do lado contrário.
    const coracao = (alcance: number, espera: number, fase: number): Rajada => ({
      tipo: 'rajada',
      dono,
      bx: uso.x,
      by: uso.y,
      x: uso.x,
      y: uso.y,
      vx: dx * RAJADA.velocidade,
      vy: dy * RAJADA.velocidade,
      percorrido: 0,
      alcance,
      espera,
      fase,
    });
    e.lista.push(coracao(RAJADA.alcanceCurto, 0, 0), coracao(RAJADA.alcance, RAJADA.atraso, Math.PI));
    // O brilho na mão, na saída.
    for (let i = 0; i < 8; i++) brilho(e, uso.x + dx * 6, uso.y + dy * 6, 40, 0);
    return;
  }
  if (uso.poder === 'impacto') {
    fileiraDoImpacto(uso.x, uso.alvoX).forEach((x, i) => {
      e.lista.push({ tipo: 'impacto', dono, x, idade: -i * IMPACTO.entre, estourou: false, pontas: pontasAoAcaso() });
    });
    return;
  }
  const x = limitarAoAlcance(uso.alvoX, uso.x, JULGAMENTO.alcance, MUNDO);
  e.lista.push({ tipo: 'julgamento', dono, x, idade: 0, estourou: false, pontas: pontasAoAcaso() });
}

// Cada coração que acerta soma um tanto ao encanto, até o dobro: os dois juntos, 2× mais tempo.
function enfeiticar(c: CorpoAlvo, dono: Dono): void {
  const resta = Math.min(RAJADA.encanto * 2, (c.encanto?.resta ?? 0) + RAJADA.encanto);
  c.encanto = { resta, dono };
}

// A ondulação cresce do zero na saída (sai da mão) e o coração vai de um lado ao outro da linha.
function ondular(r: Rajada): void {
  const d = Math.hypot(r.vx, r.vy) || 1;
  const lado = RAJADA.ondulacao * Math.min(1, r.percorrido / 30) * Math.sin(r.percorrido / 14 + r.fase);
  r.x = r.bx + (-r.vy / d) * lado;
  r.y = r.by + (r.vx / d) * lado;
}

function atualizarRajada(e: Efeitos, r: Rajada, dt: number, alvos: readonly Alvo[]): boolean {
  if (r.espera > 0) {
    r.espera -= dt;
    return true;
  }
  const yChao = chao();
  const passo = RAJADA.velocidade * dt;
  // Em passos curtos, para o coração rápido não atravessar ninguém entre dois quadros.
  const partes = Math.max(1, Math.ceil(passo / 4));
  for (let i = 0; i < partes; i++) {
    r.bx += (r.vx * dt) / partes;
    r.by += (r.vy * dt) / partes;
    r.percorrido += passo / partes;
    ondular(r);
    for (const alvo of vivos(alvos, r.dono)) {
      if (!acertaCorpo(alvo.corpo, r.x, r.y, RAJADA.raio)) continue;
      ferirAlvo(e, alvo, RAJADA.dano);
      // Online, o encanto do outro chega pela rede, com o estado dele.
      if (alvo.ferir) enfeiticar(alvo.corpo, r.dono);
      for (let k = 0; k < 16; k++) brilho(e, r.x, r.y, 70, 60);
      return false;
    }
    if (r.y >= yChao - 1) {
      for (let k = 0; k < 10; k++) brilho(e, r.x, yChao - 1, 50, 80);
      return false;
    }
    if (r.percorrido >= r.alcance || r.x < 0 || r.x > MUNDO) {
      for (let k = 0; k < 6; k++) brilho(e, r.x, r.y, 25, 0);
      return false;
    }
  }
  // O rastro: pontinhos que ficam para trás e somem.
  if (Math.random() < 0.9) {
    const total = 0.18 + Math.random() * 0.2;
    e.particulas.push({
      x: r.x - r.vx * 0.012 + (Math.random() - 0.5) * 3,
      y: r.y - r.vy * 0.012 + (Math.random() - 0.5) * 3,
      vx: -r.vx * 0.08,
      vy: -r.vy * 0.08,
      gravidade: 0,
      vida: total,
      total,
      cor: faiscaAoAcaso(),
      somar: true,
    });
  }
  return true;
}

function atualizarArea(e: Efeitos, a: Area, dt: number, alvos: readonly Alvo[]): boolean {
  const n = a.tipo === 'impacto' ? IMPACTO : JULGAMENTO;
  const yChao = chao();
  a.idade += dt;
  if (a.idade < 0) return true; // ainda não é a vez dela na fileira
  if (!a.estourou && a.idade < n.aviso) {
    // O julgamento avisa com uma garoa de luz caindo sobre a marca.
    if (a.tipo === 'julgamento' && Math.random() < dt * 30) {
      const total = 0.5;
      e.particulas.push({
        x: a.x + (Math.random() - 0.5) * n.raio * 1.6,
        y: yChao - 70 - Math.random() * 60,
        vx: 0,
        vy: 140,
        gravidade: 0,
        vida: total,
        total,
        cor: Math.random() < 0.5 ? ROSA.claro : ROSA.branco,
        somar: true,
      });
    }
    return true;
  }
  if (!a.estourou) {
    a.estourou = true;
    for (const alvo of vivos(alvos, a.dono)) {
      const dentro = dentroDaFaixa(alvo.corpo, a.x, n.raio);
      // O impacto é baixo: quem está alto no pulo passa por cima. O pilar pega até no céu.
      const alcancaAltura = a.tipo === 'julgamento' || yChao - alvo.corpo.y <= IMPACTO.altura;
      if (dentro && alcancaAltura) ferirAlvo(e, alvo, n.dano);
    }
    const quantas = a.tipo === 'impacto' ? 26 : 50;
    for (let k = 0; k < quantas; k++) {
      brilho(e, a.x + (Math.random() - 0.5) * n.raio * 1.4, yChao - 2 - Math.random() * 8, a.tipo === 'impacto' ? 90 : 130, 120);
    }
  }
  return a.idade < n.aviso + n.duracao;
}

// Passa o tempo de um efeito do Anjo; devolve se ele continua no mapa.
export function atualizarEfeitoAnjo(e: Efeitos, ef: EfeitoAnjo, dt: number, alvos: readonly Alvo[]): boolean {
  return ef.tipo === 'rajada' ? atualizarRajada(e, ef, dt, alvos) : atualizarArea(e, ef, dt, alvos);
}

export function ameacasDoAnjo(ef: EfeitoAnjo, ameacas: Ameacas): void {
  if (ef.tipo === 'rajada') {
    if (ef.espera <= 0) ameacas.projeteis.push({ x: ef.x, y: ef.y, vx: ef.vx, vy: ef.vy });
  } else if (!ef.estourou) {
    const n = ef.tipo === 'impacto' ? IMPACTO : JULGAMENTO;
    ameacas.areas.push({ x: ef.x, raio: n.raio, resta: n.aviso - ef.idade, aviso: n.aviso, baixa: ef.tipo === 'impacto' });
  }
}

// ---- Desenho ----

// A marca de um poder de área antes de estourar: o círculo no chão piscando, que se enche de
// dentro para fora até a hora da explosão. O julgamento ainda tem o fio de luz descendo do céu.
function desenharMarca(ctx: CanvasRenderingContext2D, a: Area, tempo: number): void {
  const n = a.tipo === 'impacto' ? IMPACTO : JULGAMENTO;
  const yChao = chao();
  const p = Math.min(1, a.idade / n.aviso);
  const ry = Math.max(2, Math.round(n.raio / 7));
  const pisca = 0.7 + 0.3 * Math.sin(tempo * (a.tipo === 'impacto' ? 30 : 18 + p * 30));
  ctx.save();
  ctx.globalAlpha = 0.45 * pisca;
  elipse(ctx, a.x, yChao, n.raio, ry, ROSA.magenta, true);
  ctx.globalAlpha = 0.7;
  elipse(ctx, a.x, yChao, n.raio * p, Math.max(1, Math.round(ry * p)), ROSA.rosa, true);
  // A borda soma luz: acende sobre a grama em vez de sumir nela.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pisca;
  elipse(ctx, a.x, yChao, n.raio, ry, ROSA.claro, false);
  ctx.globalCompositeOperation = 'source-over';
  if (a.tipo === 'julgamento') {
    ctx.globalAlpha = 0.35 + 0.4 * p * pisca;
    ctx.fillStyle = ROSA.claro;
    ctx.fillRect(Math.round(a.x), 0, 1, yChao);
    ctx.globalAlpha = 0.15 * p;
    ctx.fillRect(Math.round(a.x) - 1, 0, 3, yChao);
  }
  ctx.restore();
}

// A explosão do impacto: a coluna de luz curta e os raios que sobem do chão, e o anel que abre.
function desenharExplosao(ctx: CanvasRenderingContext2D, a: Area): void {
  const yChao = chao();
  const t = Math.min(1, (a.idade - IMPACTO.aviso) / IMPACTO.duracao);
  const forca = (1 - t) ** 0.7;
  const subida = Math.min(1, t / 0.25);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const luz = ctx.createRadialGradient(a.x, yChao - 10, 0, a.x, yChao - 10, IMPACTO.raio + 10);
  luz.addColorStop(0, `rgba(255, 95, 162, ${0.55 * forca})`);
  luz.addColorStop(1, 'rgba(255, 95, 162, 0)');
  ctx.fillStyle = luz;
  ctx.fillRect(a.x - IMPACTO.raio - 10, yChao - IMPACTO.raio - 20, (IMPACTO.raio + 10) * 2, IMPACTO.raio + 30);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = forca;
  a.pontas.forEach((h, i) => {
    const dx = Math.round((i / (a.pontas.length - 1) - 0.5) * IMPACTO.raio * 1.5);
    const meio = 1 - Math.abs(dx) / IMPACTO.raio; // mais altos no meio
    const altura = Math.round(IMPACTO.altura * h * (0.35 + 0.65 * meio) * subida);
    const x = Math.round(a.x) + dx;
    ctx.fillStyle = ROSA.magenta;
    ctx.fillRect(x - 1, yChao - altura, 3, altura);
    ctx.fillStyle = ROSA.claro;
    ctx.fillRect(x, yChao - altura, 1, altura);
    ctx.fillStyle = ROSA.branco;
    ctx.fillRect(x, yChao - altura, 1, 2);
  });
  // A coluna do meio, mais grossa e clara.
  const alto = Math.round(IMPACTO.altura * 1.1 * subida);
  ctx.fillStyle = ROSA.magenta;
  ctx.fillRect(Math.round(a.x) - 5, yChao - alto + 4, 11, alto - 4);
  ctx.fillStyle = ROSA.rosa;
  ctx.fillRect(Math.round(a.x) - 3, yChao - alto, 7, alto);
  ctx.fillStyle = ROSA.branco;
  ctx.fillRect(Math.round(a.x) - 1, yChao - alto, 3, alto);
  const ry = Math.max(2, Math.round(IMPACTO.raio / 7));
  elipse(ctx, a.x, yChao, IMPACTO.raio * (0.6 + 0.6 * t), Math.round(ry * (0.6 + 0.6 * t)), ROSA.claro, false);
  ctx.restore();
}

// O pilar do julgamento: abre rápido, fica e afina até sumir. Branco no meio, rosa e magenta
// para fora, com riscos de luz correndo para baixo; uma auréola grande no alto, o anel no chão
// e, no primeiro instante, um clarão que toma a vista.
function desenharPilar(ctx: CanvasRenderingContext2D, a: Area, tempo: number): void {
  const yChao = chao();
  const t = Math.min(1, (a.idade - JULGAMENTO.aviso) / JULGAMENTO.duracao);
  const abre = Math.min(1, t / 0.12);
  const fecha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
  const meia = Math.max(1, Math.round(JULGAMENTO.raio * abre * (0.3 + 0.7 * fecha)));
  const x = Math.round(a.x);

  ctx.save();
  if (t < 0.18) {
    ctx.globalAlpha = 0.3 * (1 - t / 0.18);
    ctx.fillStyle = ROSA.branco;
    ctx.fillRect(x - 600, -10, 1200, yChao + 100);
  }
  ctx.globalCompositeOperation = 'lighter';
  const luz = ctx.createLinearGradient(x - meia * 2, 0, x + meia * 2, 0);
  luz.addColorStop(0, 'rgba(232, 32, 122, 0)');
  luz.addColorStop(0.5, `rgba(232, 32, 122, ${0.45 * fecha})`);
  luz.addColorStop(1, 'rgba(232, 32, 122, 0)');
  ctx.fillStyle = luz;
  ctx.fillRect(x - meia * 2, 0, meia * 4, yChao);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.75 * fecha;
  ctx.fillStyle = ROSA.magenta;
  ctx.fillRect(x - meia, 0, meia * 2 + 1, yChao);
  ctx.globalAlpha = 0.9 * fecha;
  ctx.fillStyle = ROSA.rosa;
  const meio = Math.max(1, Math.round(meia * 0.6));
  ctx.fillRect(x - meio, 0, meio * 2 + 1, yChao);
  ctx.globalAlpha = fecha;
  ctx.fillStyle = ROSA.branco;
  const miolo = Math.max(1, Math.round(meia * 0.28));
  ctx.fillRect(x - miolo, 0, miolo * 2 + 1, yChao);
  // Riscos descendo pelo pilar.
  ctx.fillStyle = ROSA.claro;
  for (let i = 0; i < 7; i++) {
    const rx = x - meia + Math.round((((i * 37) % 100) / 100) * meia * 2);
    const ry = Math.round(((tempo * 260 + i * 53) % (yChao + 30)) - 30);
    ctx.fillRect(rx, ry, 1, 12);
  }
  // A auréola no alto e o anel no chão.
  elipse(ctx, x, 26, meia * 0.9, Math.max(2, Math.round(meia / 6)), ROSA.branco, false);
  const ry = Math.max(2, Math.round(JULGAMENTO.raio / 7));
  elipse(ctx, x, yChao, JULGAMENTO.raio * (0.9 + 0.5 * t), Math.round(ry * (0.9 + 0.5 * t)), ROSA.claro, false);
  ctx.restore();
}

function desenharRajada(ctx: CanvasRenderingContext2D, r: Rajada, tempo: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, 9);
  halo.addColorStop(0, `rgba(255, 95, 162, ${0.55 + 0.15 * Math.sin(tempo * 25)})`);
  halo.addColorStop(1, 'rgba(255, 95, 162, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(r.x - 9, r.y - 9, 18, 18);
  // A cauda: uma linha que afina para trás, na direção de onde veio.
  const d = Math.hypot(r.vx, r.vy) || 1;
  for (let i = 1; i <= 10; i++) {
    const px = Math.round(r.x - (r.vx / d) * i * 1.6);
    const py = Math.round(r.y - (r.vy / d) * i * 1.6);
    ctx.fillStyle = i < 4 ? ROSA.claro : i < 7 ? ROSA.rosa : ROSA.magenta;
    ctx.globalAlpha = 1 - i / 11;
    ctx.fillRect(px, py, 1, 1);
    if (i < 6) ctx.fillRect(px, py + 1, 1, 1);
  }
  ctx.restore();
  ctx.drawImage(CORACAO_RAJADA, Math.round(r.x - CORACAO_RAJADA.width / 2), Math.round(r.y - CORACAO_RAJADA.height / 2));
}

// Antes dos personagens: as marcas no chão (eles ficam por cima delas).
export function desenharAnjoNoChao(ctx: CanvasRenderingContext2D, ef: EfeitoAnjo, tempo: number): void {
  if (ef.tipo !== 'rajada' && !ef.estourou && ef.idade >= 0) desenharMarca(ctx, ef, tempo);
}

// Depois dos personagens: os corações, as explosões e os pilares.
export function desenharAnjoNaFrente(ctx: CanvasRenderingContext2D, ef: EfeitoAnjo, tempo: number): void {
  if (ef.tipo === 'rajada') {
    if (ef.espera <= 0) desenharRajada(ctx, ef, tempo);
  } else if (ef.estourou && ef.tipo === 'impacto') desenharExplosao(ctx, ef);
  else if (ef.estourou) desenharPilar(ctx, ef, tempo);
}

// ---- Prévia da mira ----
// Com o poder escolhido pronto, mostra de leve onde ele vai cair se clicar agora: os círculos da
// fileira do Impacto, a linha pontilhada dos corações da Rajada (com uma marca onde o primeiro
// some) e o anel do Julgamento. Fraca e só de contorno, para não brigar com o jogo.
export const PREVIA = { alfa: 0.65, cor: '#fff1e6', sombra: '#3a1420', passo: 5 };

export function desenharPreviaAnjo(
  ctx: CanvasRenderingContext2D,
  poder: PoderAnjo,
  origem: { x: number; y: number },
  alvo: { x: number; y: number },
  tempo: number,
): void {
  const yChao = chao();
  if (poder === 'rajada') {
    let dx = alvo.x - origem.x;
    let dy = alvo.y - origem.y;
    const d = Math.hypot(dx, dy) || 1;
    [dx, dy] = [dx / d, dy / d];
    // Os pontos andam para a frente, devagar: lê como "vai para lá". Cada um com uma sombra
    // embaixo, para não sumir sobre o céu claro.
    const corre = (tempo * 20) % PREVIA.passo;
    const ponto = (x: number, y: number, w: number, h: number): void => {
      ctx.fillStyle = PREVIA.sombra;
      ctx.fillRect(x, y + 1, w, h);
      ctx.fillStyle = PREVIA.cor;
      ctx.fillRect(x, y, w, h);
    };
    for (let s = 8 + corre; s <= RAJADA.alcance; s += PREVIA.passo) {
      const y = origem.y + dy * s;
      if (y >= yChao) break;
      ponto(Math.round(origem.x + dx * s), Math.round(y), 1, 1);
    }
    // A marca de onde o coração curto some.
    const cx = Math.round(origem.x + dx * RAJADA.alcanceCurto);
    const cy = Math.round(origem.y + dy * RAJADA.alcanceCurto);
    if (cy < yChao) {
      ponto(cx - 1, cy, 3, 1);
      ponto(cx, cy - 1, 1, 3);
    }
    return;
  }
  const n = poder === 'impacto' ? IMPACTO : JULGAMENTO;
  const centros =
    poder === 'impacto' ? fileiraDoImpacto(origem.x, alvo.x) : [limitarAoAlcance(alvo.x, origem.x, JULGAMENTO.alcance, MUNDO)];
  const ry = Math.max(2, Math.round(n.raio / 7));
  // O contorno com uma sombra 1 px abaixo: destaca da grama sem encher o chão.
  for (const x of centros) {
    elipse(ctx, x, yChao + 1, n.raio, ry, PREVIA.sombra, false);
    elipse(ctx, x, yChao, n.raio, ry, PREVIA.cor, false);
  }
}

// ---- Encanto ----
// Em volta de quem está enfeitiçado: um brilho rosa no corpo e três coraçõezinhos girando por
// cima da cabeça. E, na tela de quem está enfeitiçado, a borda fica rosa, pulsando.
const CORACAO_ENCANTO = criarSprite(['c.r', 'rrr', '.m.'], { r: ROSA.rosa, c: ROSA.claro, m: ROSA.magenta });
const SUMIR_ENCANTO = 0.3; // segundos: no fim, o encanto se apaga aos poucos

export function desenharEncanto(ctx: CanvasRenderingContext2D, c: CorpoAlvo, tempo: number): void {
  if (!c.encanto) return;
  const forca = Math.min(1, c.encanto.resta / SUMIR_ENCANTO);
  const cx = c.x;
  const cy = c.y - c.medida.altura / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const luz = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
  luz.addColorStop(0, `rgba(255, 95, 162, ${0.35 * forca * (0.8 + 0.2 * Math.sin(tempo * 8))})`);
  luz.addColorStop(1, 'rgba(255, 95, 162, 0)');
  ctx.fillStyle = luz;
  ctx.fillRect(cx - 20, cy - 20, 40, 40);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = forca;
  for (let i = 0; i < 3; i++) {
    const a = tempo * 4 + (i * Math.PI * 2) / 3;
    const x = Math.round(cx + Math.cos(a) * 8 - 1);
    const y = Math.round(c.y - c.medida.altura - 6 + Math.sin(a) * 2 - 1);
    ctx.drawImage(CORACAO_ENCANTO, x, y);
  }
  ctx.restore();
}

// A borda rosa na tela de quem está enfeitiçado, em pixels da tela, por cima do mapa.
export function desenharBordaDoEncanto(
  ctx: CanvasRenderingContext2D,
  encanto: Encanto,
  largura: number,
  altura: number,
  tempo: number,
): void {
  const forca = Math.min(1, encanto.resta / SUMIR_ENCANTO) * (0.75 + 0.25 * Math.sin(tempo * 6));
  const cx = largura / 2;
  const cy = altura / 2;
  const borda = ctx.createRadialGradient(cx, cy, altura * 0.45, cx, cy, largura * 0.62);
  borda.addColorStop(0, 'rgba(255, 95, 162, 0)');
  borda.addColorStop(1, `rgba(232, 32, 122, ${0.55 * forca})`);
  ctx.save();
  ctx.fillStyle = borda;
  ctx.fillRect(0, 0, largura, altura);
  ctx.restore();
}
