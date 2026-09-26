// Forma de anjo do personagem (tecla R). O sprite já vem redesenhado do gerador (pele clara e
// lisa, descalço, sem roupa, cabelo mais longo); aqui fica o que vai por cima e em volta dele: a
// tarja de mosaico no quadril, o brilho que toma o corpo na transformação, as asas batendo, os
// corações na frente dos olhos e os corações pequenos que flutuam dos lados e seguem o
// personagem. Tarja, olhos e asas saem das âncoras do quadro atual, então acompanham cada pose.

import { DURACAO_ANJO, ENERGIA_PIXY, RECARGA_ANJO } from '@terna/compartilhado';
import { contexto2d, criarSprite, novoCanvas } from '../motor/imagens';
import { suavizar } from '../motor/matematica';
import type { Paleta } from '../motor/tipos';
import type { Forma, QuadroPersonagem } from './personagem';

// O personagem, como o laço principal o guarda: `x` é o eixo do corpo e `y` a linha dos pés.
export interface CorpoAnjo {
  x: number;
  y: number;
  vx: number;
  vy: number;
  direcao: 1 | -1;
  noChao: boolean;
  planando: boolean; // descendo devagar com o botão de pulo segurado
}

// O quadro que vai para a tela e onde: `x` e `topo` já arredondados, como no desenho do sprite.
export interface Pose {
  quadro: QuadroPersonagem;
  imagem: HTMLCanvasElement;
  eixo: number;
  x: number;
  topo: number;
  direcao: 1 | -1;
  deFrente: boolean; // parado, o desenho olha para a tela
}

// ---- Transformação ----
// Acendendo: a luz nasce no peito e toma o corpo todo. No pico a forma troca e a luz apaga,
// revelando a outra forma. Para virar anjo demora mais (é o momento bonito); para voltar, menos.
const ACENDER: Record<Forma, number> = { anjo: 0.9, base: 0.55 };
const APAGAR: Record<Forma, number> = { anjo: 0.6, base: 0.4 };
const COR_LUZ = '255, 246, 222';
// A forma de anjo dura DURACAO_ANJO (em compartilhado/conteudo/poderes.ts, com a recarga e a
// energia pixy): acabado o tempo, ele volta sozinho à forma base — mesmo no ar, e aí despenca. O
// R desfaz antes, se quiser. De volta à forma base, espera RECARGA_ANJO e precisa da barra de
// energia cheia de novo para virar anjo.

type Fase = 'parado' | 'acendendo' | 'apagando';

// Tudo o que é de um anjo só: cada personagem (você e o sósia) tem o seu.
export interface Anjo {
  forma: Forma;
  fase: Fase;
  tempoFase: number;
  restaAnjo: number; // segundos que ainda restam na forma de anjo
  recarga: number; // segundos, na forma base, até poder virar anjo de novo
  batida: Batida;
  coracoes: Coracao[];
  faiscas: Faisca[];
  sobraFaiscas: number;
  plumas: Pluma[];
  sobraPlumas: number;
}

export function criarAnjo(): Anjo {
  return {
    forma: 'base',
    fase: 'parado',
    tempoFase: 0,
    restaAnjo: 0,
    recarga: 0,
    batida: { fase: 0, centro: 48, amplitude: 7, periodo: 1.8 },
    coracoes: [],
    faiscas: [],
    sobraFaiscas: 0,
    plumas: [],
    sobraPlumas: 0,
  };
}

export function formaAtual(anjo: Anjo): Forma {
  return anjo.forma;
}

// Enquanto a luz sobe o personagem fica parado: é a pose da transformação.
export function transformando(anjo: Anjo): boolean {
  return anjo.fase === 'acendendo';
}

// Pode virar anjo agora (na forma base e com a recarga pronta)?
export function anjoPronto(anjo: Anjo): boolean {
  return anjo.forma === 'base' && anjo.fase === 'parado' && anjo.recarga <= 0;
}

// Devolve se a troca começou. Na forma base com a recarga correndo, não começa — a não ser com
// `forcar`, para o outro jogador online, cuja forma vem da rede e manda mais que o relógio daqui.
export function alternarForma(anjo: Anjo, forcar = false): boolean {
  if (anjo.fase !== 'parado') return false;
  if (anjo.forma === 'base' && anjo.recarga > 0 && !forcar) return false;
  anjo.fase = 'acendendo';
  anjo.tempoFase = 0;
  if (anjo.forma === 'anjo') soltarCoracoes(anjo);
  return true;
}

function destino(anjo: Anjo): Forma {
  if (anjo.fase === 'acendendo') return anjo.forma === 'anjo' ? 'base' : 'anjo';
  return anjo.forma;
}

// A barra de transformação: quanto dela está cheio (0 a 1), se está em uso (de anjo) e, na forma
// base, se dá para virar agora. Virando anjo, ela enche junto com a luz; de anjo, esvazia com o
// tempo; voltando, fica onde parou. Na forma base ela é a energia pixy (`energia`): cheia e com a
// recarga pronta, a transformação está disponível.
export function barraDoAnjo(
  anjo: Anjo,
  energia: number,
): { cheia: number; ativa: boolean; resta: number; disponivel: boolean } {
  if (anjo.fase === 'acendendo') {
    const p = Math.min(1, anjo.tempoFase / ACENDER[destino(anjo)]);
    if (destino(anjo) === 'anjo') return { cheia: p, ativa: true, resta: DURACAO_ANJO, disponivel: false };
    return { cheia: anjo.restaAnjo / DURACAO_ANJO, ativa: true, resta: anjo.restaAnjo, disponivel: false };
  }
  if (anjo.forma === 'anjo') {
    return { cheia: anjo.restaAnjo / DURACAO_ANJO, ativa: true, resta: anjo.restaAnjo, disponivel: false };
  }
  const cheia = Math.min(1, energia / ENERGIA_PIXY.custoAnjo);
  return { cheia, ativa: false, resta: DURACAO_ANJO, disponivel: cheia >= 1 && anjoPronto(anjo) };
}

// Quanto a luz cobre o corpo (raio a partir do peito) e com que força.
function luzNoCorpo(anjo: Anjo): { raio: number; forca: number } {
  if (anjo.fase === 'acendendo') {
    const p = anjo.tempoFase / ACENDER[destino(anjo)];
    return { raio: 2 + p * p * 30, forca: 0.35 + 0.65 * p };
  }
  if (anjo.fase === 'apagando') {
    const p = anjo.tempoFase / APAGAR[anjo.forma];
    return { raio: 40, forca: (1 - p) ** 1.5 };
  }
  return { raio: 0, forca: 0 };
}

// 0 = asas recolhidas (somem), 1 = abertas. Abrem com um leve passo além do fim.
function aberturaAsas(anjo: Anjo): number {
  if (anjo.forma !== 'anjo') return 0;
  if (anjo.fase === 'apagando') {
    const p = Math.min(1, anjo.tempoFase / APAGAR.anjo);
    return 1 + 1.6 * (p - 1) ** 3 + 0.6 * (p - 1) ** 2;
  }
  if (anjo.fase === 'acendendo') return 1 - suavizar(0, 1, anjo.tempoFase / ACENDER.base);
  return 1;
}

// ---- Asas ----
// Cada asa é um leque de penas desenhado pixel a pixel: a borda de ataque sai do ombro para
// trás e para cima no ângulo pedido e as penas descem em leque a partir dela. De lado, as duas
// ficam atrás do corpo, a de longe um pouco mais à frente, mais alta e na sombra; de frente,
// uma abre para cada lado.
const COMPRIMENTO_ASA = 17;
const LEQUE_ASA = 78; // graus entre a borda de ataque e a última pena
const PENAS = 5;
const CORES_ASA = {
  perto: { borda: [186, 190, 220], vinco: [226, 228, 242], pena: [245, 246, 252], pluma: [255, 255, 252] },
  longe: { borda: [150, 152, 188], vinco: [196, 198, 222], pena: [218, 220, 236], pluma: [232, 233, 244] },
};

interface Asa {
  imagem: HTMLCanvasElement;
  raiz: number; // a raiz fica no pixel (raiz, raiz) da imagem
}

const asasProntas = new Map<string, Asa>();

function asa(comprimento: number, angulo: number, lado: keyof typeof CORES_ASA): Asa {
  const c = Math.max(3, Math.round(comprimento));
  const a = Math.round(angulo / 4) * 4;
  const chave = `${c}:${a}:${lado}`;
  const pronta = asasProntas.get(chave);
  if (pronta) return pronta;

  const raiz = c + 2;
  const tam = raiz * 2 + 1;
  const alcance = (u: number) =>
    c * (1 - 0.45 * u ** 1.3) * (0.84 + 0.16 * Math.abs(Math.sin(Math.PI * u * PENAS)) ** 0.5);
  const polar = (i: number, j: number) => {
    const dx = i - raiz;
    const dy = j - raiz;
    // 0° aponta para trás (x negativo), positivo para cima.
    const phi = (Math.atan2(-dy, -dx) * 180) / Math.PI;
    return { u: (a - phi) / LEQUE_ASA, r: Math.hypot(dx, dy) };
  };
  const cheio = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= tam || j >= tam) return false;
    const { u, r } = polar(i, j);
    return u >= 0 && u <= 1 && r >= 1 && r <= alcance(u);
  };

  const imagem = novoCanvas(tam, tam);
  const ctx = contexto2d(imagem);
  const dados = ctx.createImageData(tam, tam);
  const cores = CORES_ASA[lado];
  for (let j = 0; j < tam; j++) {
    for (let i = 0; i < tam; i++) {
      if (!cheio(i, j)) continue;
      const { u, r } = polar(i, j);
      const borda = !cheio(i - 1, j) || !cheio(i + 1, j) || !cheio(i, j - 1) || !cheio(i, j + 1);
      const cor = borda
        ? cores.borda
        : r < 0.42 * alcance(u)
          ? cores.pluma
          : (u * PENAS) % 1 < 0.2
            ? cores.vinco
            : cores.pena;
      const o = (j * tam + i) * 4;
      dados.data.set([cor[0], cor[1], cor[2], 255], o);
    }
  }
  ctx.putImageData(dados, 0, 0);
  const nova = { imagem, raiz };
  asasProntas.set(chave, nova);
  return nova;
}

// A batida muda com o que o corpo faz: devagar parado, mais viva andando, forte subindo, larga e
// compassada planando (segurando o ar) e quase parada caindo solto, com as asas levantadas pelo
// vento. Centro e amplitude mudam aos poucos.
interface Batida {
  fase: number;
  centro: number;
  amplitude: number;
  periodo: number;
}

function atualizarBatida(batida: Batida, dt: number, corpo: CorpoAnjo): void {
  let alvo = { centro: 48, amplitude: 7, periodo: 1.8 };
  if (!corpo.noChao) {
    if (corpo.vy < 0) alvo = { centro: 34, amplitude: 38, periodo: 0.3 };
    else if (corpo.planando) alvo = { centro: 26, amplitude: 30, periodo: 0.45 };
    else alvo = { centro: 64, amplitude: 4, periodo: 0.5 };
  } else if (corpo.vx !== 0) {
    alvo = { centro: 40, amplitude: 14, periodo: 0.7 };
  }
  const k = 1 - Math.exp(-dt * 8);
  batida.centro += (alvo.centro - batida.centro) * k;
  batida.amplitude += (alvo.amplitude - batida.amplitude) * k;
  batida.periodo += (alvo.periodo - batida.periodo) * k;
  batida.fase += (dt * Math.PI * 2) / batida.periodo;
}

// As duas asas, em pixels do quadro (o `ctx` já no canto de cima dele), com `comprimento` px e
// a borda de ataque no `angulo` (graus, para cima).
function desenharAsas(
  ctx: CanvasRenderingContext2D,
  quadro: QuadroPersonagem,
  deFrente: boolean,
  comprimento: number,
  angulo: number,
): void {
  const [ox, oy] = quadro.ombro;
  if (deFrente) {
    // Raízes um pouco para dentro dos ombros, para as asas saírem de trás das costas; a direita
    // é o espelho da esquerda no eixo do corpo (`meio`).
    const { imagem, raiz } = asa(comprimento, angulo - 14, 'perto');
    ctx.drawImage(imagem, ox + 2 - raiz, oy - raiz);
    ctx.save();
    ctx.translate((quadro.meio ?? quadro.w - 1) - (ox + 2) + raiz + 1, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(imagem, 0, oy - raiz);
    ctx.restore();
    return;
  }
  const longe = asa(comprimento * 0.92, angulo + 10, 'longe');
  ctx.drawImage(longe.imagem, ox + 2 - longe.raiz, oy - 1 - longe.raiz);
  const perto = asa(comprimento, angulo, 'perto');
  ctx.drawImage(perto.imagem, ox - perto.raiz, oy - perto.raiz);
}

// Centro de um pixel do quadro, no mapa.
function noMapa(pose: Pose, c: number, r: number): { x: number; y: number } {
  const esquerda = pose.direcao === 1 ? pose.x - pose.eixo : pose.x + pose.eixo;
  return { x: esquerda + pose.direcao * (c + 0.5), y: pose.topo + r + 0.5 };
}

// ---- Corações ----
// Pequenos, dos dois lados do corpo, cada um no seu lugar e balançando no ar. O lugar é medido
// a partir do corpo, então eles nunca ficam para trás nem atravessam o personagem: só se
// arrastam um pouco contra o movimento, cada um no seu tempo. Nascem do peito na
// transformação e sobem sumindo quando ela se desfaz.
const PALETA_CORACAO: Paleta = { r: '#ff6fa8', c: '#ffc8de', e: '#dc437c' };
const CORACAO_PEQUENO = criarSprite(['c.r', 'rrr', '.e.'], PALETA_CORACAO);
const CORACAO = criarSprite(['cr.rr', 'rrrrr', '.rre.', '..e..'], PALETA_CORACAO);

// Lugar de cada um em relação ao eixo do corpo e aos pés (em pé).
const LUGARES_CORACOES: { x: number; y: number; grande: boolean }[] = [
  { x: -14, y: -28, grande: false },
  { x: -16, y: -19, grande: true },
  { x: -12, y: -10, grande: false },
  { x: 14, y: -25, grande: false },
  { x: 16, y: -15, grande: true },
  { x: 12, y: -6, grande: false },
];

interface Coracao {
  x: number; // no mapa
  y: number;
  dx: number; // em relação aos pés do personagem
  dy: number;
  lugar: (typeof LUGARES_CORACOES)[number];
  fase: number;
  seguir: number; // quanto maior, mais rápido volta para o lugar
  idade: number;
  saindo: boolean; // subindo e sumindo
  resta: number; // segundos até sumir, quando saindo
}

const INDO = 0.8;
const ARRASTO = 0.03; // segundos: a 90 px/s o coração fica ~3 px para trás do lugar

function soltarCoracoesDoPeito(anjo: Anjo, corpo: CorpoAnjo): void {
  anjo.coracoes = LUGARES_CORACOES.map((lugar, i) => ({
    x: corpo.x,
    y: corpo.y - 16,
    dx: 0,
    dy: -16,
    lugar,
    fase: i * 1.7,
    seguir: 4 + (i % 3) * 1.5,
    idade: 0,
    saindo: false,
    resta: INDO,
  }));
}

function soltarCoracoes(anjo: Anjo): void {
  for (const c of anjo.coracoes) c.saindo = true;
}

function atualizarCoracoes(anjo: Anjo, dt: number, tempo: number, corpo: CorpoAnjo): void {
  for (const c of anjo.coracoes) {
    c.idade += dt;
    if (c.saindo) {
      c.resta -= dt;
      c.y -= 22 * dt;
      c.x += Math.sin(tempo * 4 + c.fase) * 6 * dt;
      continue;
    }
    const alvoX = c.lugar.x - corpo.vx * ARRASTO + Math.sin(tempo * 1.3 + c.fase) * 1.2;
    const alvoY = c.lugar.y - corpo.vy * ARRASTO * 0.5 + Math.sin(tempo * 2.1 + c.fase) * 1.6;
    const k = 1 - Math.exp(-dt * c.seguir);
    c.dx += (alvoX - c.dx) * k;
    c.dy += (alvoY - c.dy) * k;
    c.x = corpo.x + c.dx;
    c.y = corpo.y + c.dy;
  }
  anjo.coracoes = anjo.coracoes.filter((c) => c.resta > 0);
}

function desenharCoracoes(ctx: CanvasRenderingContext2D, coracoes: readonly Coracao[], tempo: number): void {
  for (const c of coracoes) {
    const sprite = c.lugar.grande ? CORACAO : CORACAO_PEQUENO;
    const surgir = Math.min(1, c.idade / 0.25);
    const sumir = c.saindo ? c.resta / INDO : 1;
    const alfa = surgir * sumir * (0.8 + 0.2 * Math.sin(tempo * 5 + c.fase));
    const x = Math.round(c.x - sprite.width / 2);
    const y = Math.round(c.y - sprite.height / 2);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, sprite.width + 1);
    halo.addColorStop(0, `rgba(255, 110, 170, ${0.35 * alfa})`);
    halo.addColorStop(1, 'rgba(255, 110, 170, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(c.x - sprite.width - 1, c.y - sprite.width - 1, sprite.width * 2 + 2, sprite.width * 2 + 2);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.drawImage(sprite, x, y);
    ctx.restore();
  }
}

// ---- Faíscas ----
// Pontinhos de luz que sobem do corpo enquanto ele acende e estouram no pico.
interface Faisca {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  total: number;
  cor: string;
}

const CORES_FAISCA = ['#fffbe8', '#ffe79a', '#ffd0e4'];

function novaFaisca(anjo: Anjo, x: number, y: number, vx: number, vy: number): void {
  const total = 0.5 + Math.random() * 0.5;
  anjo.faiscas.push({ x, y, vx, vy, vida: total, total, cor: CORES_FAISCA[(Math.random() * CORES_FAISCA.length) | 0] });
}

function atualizarFaiscas(anjo: Anjo, dt: number, pose: Pose): void {
  if (anjo.fase === 'acendendo') {
    anjo.sobraFaiscas += dt * 40;
    for (; anjo.sobraFaiscas >= 1; anjo.sobraFaiscas--) {
      const { x, y } = noMapa(pose, Math.random() * pose.quadro.w, Math.random() * pose.quadro.h);
      novaFaisca(anjo, x, y, (Math.random() - 0.5) * 10, -15 - Math.random() * 25);
    }
  }
  for (const f of anjo.faiscas) {
    f.vida -= dt;
    f.vy -= 12 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
  }
  anjo.faiscas = anjo.faiscas.filter((f) => f.vida > 0);
}

function estourarFaiscas(anjo: Anjo, corpo: CorpoAnjo): void {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const v = 30 + Math.random() * 30;
    novaFaisca(anjo, corpo.x, corpo.y - 16, Math.cos(a) * v, Math.sin(a) * v - 10);
  }
}

// ---- Plumas ----
// Andando ou voando, o anjo solta das asas pontinhos brancos e suaves que ficam para trás e
// descem devagar, balançando, até sumir — como penugem. Nascem num ponto qualquer da asa de
// perto, na batida em que ela está. Ficam no mapa (não seguem o corpo) e terminam de cair
// mesmo se ele voltar à forma base.
interface Pluma {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  total: number;
  fase: number; // do balanço
  suave: boolean; // com um halo fraco em volta do ponto
}

const PLUMAS_POR_SEGUNDO = 14;

function soltarPlumas(anjo: Anjo, dt: number, corpo: CorpoAnjo, pose: Pose): void {
  const andandoOuVoando = !corpo.noChao || corpo.vx !== 0;
  if (anjo.forma !== 'anjo' || anjo.fase === 'acendendo' || !andandoOuVoando || pose.deFrente) return;
  anjo.sobraPlumas += dt * PLUMAS_POR_SEGUNDO;
  const [ox, oy] = pose.quadro.ombro;
  const angulo = anjo.batida.centro + anjo.batida.amplitude * Math.sin(anjo.batida.fase);
  for (; anjo.sobraPlumas >= 1; anjo.sobraPlumas--) {
    // Um ponto do leque: `phi` a partir de trás (0°), subindo; `r` da raiz até perto da ponta.
    const phi = ((angulo - LEQUE_ASA * (0.15 + 0.85 * Math.random())) * Math.PI) / 180;
    const r = COMPRIMENTO_ASA * (0.5 + 0.45 * Math.random());
    const { x, y } = noMapa(pose, ox - Math.cos(phi) * r, oy - Math.sin(phi) * r);
    const total = 1.1 + Math.random() * 0.9;
    anjo.plumas.push({
      x,
      y,
      vx: -corpo.direcao * (2 + Math.random() * 6),
      vy: 3 + Math.random() * 5,
      vida: total,
      total,
      fase: Math.random() * Math.PI * 2,
      suave: Math.random() < 0.5,
    });
  }
}

function atualizarPlumas(anjo: Anjo, dt: number, tempo: number): void {
  for (const p of anjo.plumas) {
    p.vida -= dt;
    p.x += (p.vx + Math.sin(tempo * 3 + p.fase) * 5) * dt;
    p.y += p.vy * dt;
  }
  anjo.plumas = anjo.plumas.filter((p) => p.vida > 0);
}

function desenharPlumas(ctx: CanvasRenderingContext2D, plumas: readonly Pluma[]): void {
  for (const p of plumas) {
    // Surge rápido e some devagar.
    const alfa = Math.min(1, (p.total - p.vida) / 0.12) * (p.vida / p.total) ** 0.6;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    ctx.fillStyle = `rgba(255, 255, 255, ${alfa})`;
    ctx.fillRect(x, y, 1, 1);
    if (p.suave) {
      ctx.fillStyle = `rgba(255, 255, 255, ${alfa * 0.4})`;
      ctx.fillRect(x - 1, y, 1, 1);
      ctx.fillRect(x + 1, y, 1, 1);
      ctx.fillRect(x, y - 1, 1, 1);
      ctx.fillRect(x, y + 1, 1, 1);
    }
  }
}

// ---- Auréola ----
// Um anel dourado flutuando em cima da cabeça, com um brilho em volta que pulsa e, de tempos
// em tempos, um reflexo que corre pela borda de cima. Fica sobre o eixo do corpo (que no anjo
// é o da cabeça) e acompanha o topo de cada pose; aparece e some junto com as asas.
const AUREOLA = criarSprite(['..wwwww..', '.y.....y.', '..yyyyy..'], { w: '#fffbe6', y: '#ffd966' });
const ACIMA_DA_CABECA = 2; // pixels entre o topo da cabeça e a auréola
const REFLEXO = { ciclo: 1.8, corrida: 0.45 }; // segundos: de quanto em quanto e quanto dura
// Quanto o que fica em cima da cabeça (o nome) sobe para dar lugar à auréola, com ela aberta.
const LUGAR_DA_AUREOLA = 7;

export function alturaDaAureola(anjo: Anjo): number {
  return LUGAR_DA_AUREOLA * Math.max(0, Math.min(1, aberturaAsas(anjo)));
}

// Espaço que a auréola ocupa em cima da cabeça, parada (sem flutuar).
export const ALTURA_AUREOLA = ACIMA_DA_CABECA + AUREOLA.height;

// Para a foto do painel, antes do corpo: as duas asas abertas e paradas atrás dos ombros do
// quadro de frente que vai ser desenhado com o canto de cima em (x, y). Mais curtas que no jogo
// e mais levantadas, para as pontas aparecerem dos lados da cabeça dentro da foto.
export const ASAS_DO_RETRATO = { comprimento: 15, angulo: 74 };

export function desenharAsasDoRetrato(ctx: CanvasRenderingContext2D, quadro: QuadroPersonagem, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  desenharAsas(ctx, quadro, true, ASAS_DO_RETRATO.comprimento, ASAS_DO_RETRATO.angulo);
  ctx.restore();
}

// Para a foto do painel: olhos de coração e auréola parados sobre um quadro já desenhado com o
// canto de cima em (x, y) e o eixo do corpo na coluna `eixo`.
export function enfeitarRetratoDeAnjo(
  ctx: CanvasRenderingContext2D,
  quadro: QuadroPersonagem,
  eixo: number,
  x: number,
  y: number,
): void {
  for (const [c, r] of quadro.olhos) ctx.drawImage(CORACAO_PEQUENO, x + c - 1, y + r - 1);
  ctx.drawImage(AUREOLA, x + eixo - (AUREOLA.width >> 1), y - ALTURA_AUREOLA);
}

function desenharAureola(ctx: CanvasRenderingContext2D, pose: Pose, abertura: number, tempo: number): void {
  const alfa = Math.max(0, Math.min(1, abertura));
  const flutua = Math.round(Math.sin(tempo * 2.2) * 0.8);
  const x = pose.x - (AUREOLA.width >> 1);
  const y = pose.topo - ACIMA_DA_CABECA - AUREOLA.height + flutua;
  const cx = pose.x + 0.5;
  const cy = y + AUREOLA.height / 2;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulso = 0.8 + 0.2 * Math.sin(tempo * 3.1);
  const brilho = ctx.createRadialGradient(cx, cy, 0, cx, cy, 9);
  brilho.addColorStop(0, `rgba(255, 232, 150, ${0.5 * alfa * pulso})`);
  brilho.addColorStop(1, 'rgba(255, 232, 150, 0)');
  ctx.fillStyle = brilho;
  ctx.fillRect(cx - 9, cy - 9, 18, 18);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.drawImage(AUREOLA, x, y);
  // O reflexo: um ponto branco que atravessa a borda de cima, da esquerda para a direita.
  const noCiclo = tempo % REFLEXO.ciclo;
  if (noCiclo < REFLEXO.corrida) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 2 + Math.floor((noCiclo / REFLEXO.corrida) * 5), y, 1, 1);
  }
  ctx.restore();
}

function desenharFaiscas(ctx: CanvasRenderingContext2D, faiscas: readonly Faisca[]): void {
  for (const f of faiscas) {
    ctx.globalAlpha = Math.min(1, (f.vida / f.total) * 1.5);
    ctx.fillStyle = f.cor;
    ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
  }
  ctx.globalAlpha = 1;
}

// ---- Laço ----

export function atualizarAnjo(anjo: Anjo, dt: number, tempo: number, corpo: CorpoAnjo, pose: Pose): void {
  if (anjo.fase !== 'parado') {
    anjo.tempoFase += dt;
    if (anjo.fase === 'acendendo' && anjo.tempoFase >= ACENDER[destino(anjo)]) {
      anjo.forma = destino(anjo);
      anjo.fase = 'apagando';
      anjo.tempoFase = 0;
      estourarFaiscas(anjo, corpo);
      if (anjo.forma === 'anjo') {
        anjo.restaAnjo = DURACAO_ANJO;
        soltarCoracoesDoPeito(anjo, corpo);
      } else {
        anjo.recarga = RECARGA_ANJO;
      }
    } else if (anjo.fase === 'apagando' && anjo.tempoFase >= APAGAR[anjo.forma]) {
      anjo.fase = 'parado';
    }
  }
  // O minuto de anjo corre desde a troca; acabou, a volta começa sozinha.
  if (anjo.forma === 'anjo' && anjo.fase !== 'acendendo') {
    anjo.restaAnjo = Math.max(0, anjo.restaAnjo - dt);
    if (anjo.restaAnjo === 0) alternarForma(anjo);
  }
  if (anjo.forma === 'base' && anjo.fase !== 'acendendo') anjo.recarga = Math.max(0, anjo.recarga - dt);
  atualizarBatida(anjo.batida, dt, corpo);
  atualizarCoracoes(anjo, dt, tempo, corpo);
  atualizarFaiscas(anjo, dt, pose);
  soltarPlumas(anjo, dt, corpo, pose);
  atualizarPlumas(anjo, dt, tempo);
}

// Coloca o contexto no espaço do quadro: (0, 0) é o canto de cima do recorte, e o eixo x
// aponta para onde o personagem olha (o desenho do sprite é virado para a direita).
function noQuadro(ctx: CanvasRenderingContext2D, pose: Pose): void {
  ctx.translate(pose.direcao === 1 ? pose.x - pose.eixo : pose.x + pose.eixo, pose.topo);
  ctx.scale(pose.direcao, 1);
}

// Antes do sprite: a aura, as asas e as plumas que saem delas (o que fica atrás do corpo). As
// plumas já soltas terminam de cair mesmo depois de ele voltar à forma base.
export function desenharAnjoAtras(ctx: CanvasRenderingContext2D, anjo: Anjo, tempo: number, pose: Pose): void {
  if (anjo.forma !== 'anjo') {
    desenharPlumas(ctx, anjo.plumas);
    return;
  }
  const abertura = aberturaAsas(anjo);

  const centro = noMapa(pose, pose.quadro.w / 2, pose.quadro.h * 0.5);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const aura = ctx.createRadialGradient(centro.x, centro.y, 0, centro.x, centro.y, 22);
  aura.addColorStop(0, `rgba(${COR_LUZ}, ${0.16 * abertura * (0.85 + 0.15 * Math.sin(tempo * 2))})`);
  aura.addColorStop(1, `rgba(${COR_LUZ}, 0)`);
  ctx.fillStyle = aura;
  ctx.fillRect(centro.x - 22, centro.y - 22, 44, 44);
  ctx.restore();

  if (abertura > 0.05) {
    ctx.save();
    noQuadro(ctx, pose);
    const { batida } = anjo;
    const angulo = batida.centro + batida.amplitude * Math.sin(batida.fase);
    desenharAsas(ctx, pose.quadro, pose.deFrente, COMPRIMENTO_ASA * abertura, angulo);
    ctx.restore();
  }
  desenharPlumas(ctx, anjo.plumas);
}

const silhuetas = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
const rascunho = novoCanvas(48, 48);
const ctxRascunho = contexto2d(rascunho);

function silhueta(imagem: HTMLCanvasElement): HTMLCanvasElement {
  let s = silhuetas.get(imagem);
  if (!s) {
    s = novoCanvas(imagem.width, imagem.height);
    const c = contexto2d(s);
    c.drawImage(imagem, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = `rgb(${COR_LUZ})`;
    c.fillRect(0, 0, s.width, s.height);
    silhuetas.set(imagem, s);
  }
  return s;
}

// ---- Tarja ----
// A faixa de mosaico sobre o quadril, como a dos Sims: blocos de 2 px em tons de pele, da mais
// clara à mais funda, sem desenho nenhum por baixo. A caixa vem de cada quadro (âncora `tarja`),
// então acompanha o corpo sem atraso. Os tons são sorteados de novo algumas vezes por segundo
// (e a cada quadro da animação): o mosaico cintila sempre, parado ou correndo.
const TONS_TARJA = ['#fff1e6', '#f6d3bd', '#e6b89c', '#d19c82', '#bf8872', '#efcab4'];
const TROCAS_TARJA = 6; // sorteios de tons por segundo

function tomDaTarja(bx: number, by: number, semente: number): string {
  let h = (bx * 374761393 + by * 668265263 + semente * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return TONS_TARJA[(h >>> 0) % TONS_TARJA.length];
}

function desenharTarja(ctx: CanvasRenderingContext2D, quadro: QuadroPersonagem, tempo: number): void {
  const [x, y, largura, altura] = quadro.tarja;
  const semente = quadro.w * 131 + quadro.h * 17 + x * 7 + y + Math.floor(tempo * TROCAS_TARJA) * 7919;
  for (let by = 0; by < altura / 2; by++) {
    for (let bx = 0; bx < largura / 2; bx++) {
      ctx.fillStyle = tomDaTarja(bx, by, semente);
      ctx.fillRect(x + bx * 2, y + by * 2, 2, 2);
    }
  }
}

// Depois do sprite: a tarja, os corações dos olhos, a auréola, a luz da transformação, os
// corações em volta e as faíscas.
export function desenharAnjoNaFrente(ctx: CanvasRenderingContext2D, anjo: Anjo, tempo: number, pose: Pose): void {
  if (anjo.forma === 'anjo') {
    ctx.save();
    noQuadro(ctx, pose);
    desenharTarja(ctx, pose.quadro, tempo);
    // Olhos de coração: o mesmo coração pequeno que flutua em volta, parado na frente de cada
    // olho. Sem brilho somado: sobre a pele clara ele amarelava.
    for (const [c, r] of pose.quadro.olhos) ctx.drawImage(CORACAO_PEQUENO, c - 1, r - 1);
    ctx.restore();
    const abertura = aberturaAsas(anjo);
    if (abertura > 0.05) desenharAureola(ctx, pose, abertura, tempo);
  }

  const { raio, forca } = luzNoCorpo(anjo);
  if (forca > 0) {
    const { w, h } = pose.quadro;
    const peito = { x: w / 2, y: h * 0.5 };
    ctxRascunho.clearRect(0, 0, rascunho.width, rascunho.height);
    ctxRascunho.globalCompositeOperation = 'source-over';
    ctxRascunho.drawImage(silhueta(pose.imagem), 0, 0);
    ctxRascunho.globalCompositeOperation = 'destination-in';
    const alcance = ctxRascunho.createRadialGradient(peito.x, peito.y, 0, peito.x, peito.y, Math.max(1, raio));
    alcance.addColorStop(0, 'rgba(0, 0, 0, 1)');
    alcance.addColorStop(Math.max(0, 1 - 3 / Math.max(1, raio)), 'rgba(0, 0, 0, 1)');
    alcance.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctxRascunho.fillStyle = alcance;
    ctxRascunho.fillRect(0, 0, rascunho.width, rascunho.height);

    ctx.save();
    noQuadro(ctx, pose);
    ctx.globalAlpha = forca;
    ctx.drawImage(rascunho, 0, 0);
    ctx.restore();

    const centro = noMapa(pose, peito.x, peito.y);
    const r = 10 + Math.min(raio, 26);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(centro.x, centro.y, 0, centro.x, centro.y, r);
    halo.addColorStop(0, `rgba(${COR_LUZ}, ${0.55 * forca})`);
    halo.addColorStop(1, `rgba(${COR_LUZ}, 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(centro.x - r, centro.y - r, r * 2, r * 2);
    ctx.restore();
  }

  desenharCoracoes(ctx, anjo.coracoes, tempo);
  desenharFaiscas(ctx, anjo.faiscas);
}
