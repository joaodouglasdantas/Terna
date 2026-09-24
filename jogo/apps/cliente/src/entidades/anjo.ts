// Forma de anjo do personagem (tecla R). O sprite já vem redesenhado do gerador (pele clara e
// lisa, descalço, sem roupa, cabelo mais longo); aqui fica o que vai por cima e em volta dele: a
// tarja de mosaico no quadril, o brilho que toma o corpo na transformação, as asas batendo, os
// corações na frente dos olhos e os corações pequenos que flutuam dos lados e seguem o
// personagem. Tarja, olhos e asas saem das âncoras do quadro atual, então acompanham cada pose.

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

type Fase = 'parado' | 'acendendo' | 'apagando';
const estado = {
  forma: 'base' as Forma,
  fase: 'parado' as Fase,
  tempoFase: 0,
};

export function formaAtual(): Forma {
  return estado.forma;
}

// Enquanto a luz sobe o personagem fica parado: é a pose da transformação.
export function transformando(): boolean {
  return estado.fase === 'acendendo';
}

export function alternarForma(): void {
  if (estado.fase !== 'parado') return;
  estado.fase = 'acendendo';
  estado.tempoFase = 0;
  if (estado.forma === 'anjo') soltarCoracoes();
}

function destino(): Forma {
  if (estado.fase === 'acendendo') return estado.forma === 'anjo' ? 'base' : 'anjo';
  return estado.forma;
}

// Quanto a luz cobre o corpo (raio a partir do peito) e com que força.
function luzNoCorpo(): { raio: number; forca: number } {
  if (estado.fase === 'acendendo') {
    const p = estado.tempoFase / ACENDER[destino()];
    return { raio: 2 + p * p * 30, forca: 0.35 + 0.65 * p };
  }
  if (estado.fase === 'apagando') {
    const p = estado.tempoFase / APAGAR[estado.forma];
    return { raio: 40, forca: (1 - p) ** 1.5 };
  }
  return { raio: 0, forca: 0 };
}

// 0 = asas recolhidas (somem), 1 = abertas. Abrem com um leve passo além do fim.
function aberturaAsas(): number {
  if (estado.forma !== 'anjo') return 0;
  if (estado.fase === 'apagando') {
    const p = Math.min(1, estado.tempoFase / APAGAR.anjo);
    return 1 + 1.6 * (p - 1) ** 3 + 0.6 * (p - 1) ** 2;
  }
  if (estado.fase === 'acendendo') return 1 - suavizar(0, 1, estado.tempoFase / ACENDER.base);
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

// A batida muda com o que o corpo faz: devagar parado, mais viva andando, forte subindo e
// quase parada (asas abertas, planando) caindo. Centro e amplitude mudam aos poucos.
const batida = { fase: 0, centro: 48, amplitude: 7, periodo: 1.8 };

function atualizarBatida(dt: number, corpo: CorpoAnjo): void {
  let alvo = { centro: 48, amplitude: 7, periodo: 1.8 };
  if (!corpo.noChao) {
    alvo = corpo.vy < 0 ? { centro: 34, amplitude: 38, periodo: 0.3 } : { centro: 20, amplitude: 6, periodo: 0.6 };
  } else if (corpo.vx !== 0) {
    alvo = { centro: 40, amplitude: 14, periodo: 0.7 };
  }
  const k = 1 - Math.exp(-dt * 8);
  batida.centro += (alvo.centro - batida.centro) * k;
  batida.amplitude += (alvo.amplitude - batida.amplitude) * k;
  batida.periodo += (alvo.periodo - batida.periodo) * k;
  batida.fase += (dt * Math.PI * 2) / batida.periodo;
}

function desenharAsas(ctx: CanvasRenderingContext2D, pose: Pose, abertura: number): void {
  const [ox, oy] = pose.quadro.ombro;
  const comprimento = COMPRIMENTO_ASA * abertura;
  const angulo = batida.centro + batida.amplitude * Math.sin(batida.fase);
  if (pose.deFrente) {
    // Raízes um pouco para dentro dos ombros, para as asas saírem de trás das costas; a direita
    // é o espelho da esquerda no eixo do corpo (`meio`).
    const { imagem, raiz } = asa(comprimento, angulo - 14, 'perto');
    ctx.drawImage(imagem, ox + 2 - raiz, oy - raiz);
    ctx.save();
    ctx.translate((pose.quadro.meio ?? pose.quadro.w - 1) - (ox + 2) + raiz + 1, 0);
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
let coracoes: Coracao[] = [];

function soltarCoracoesDoPeito(corpo: CorpoAnjo): void {
  coracoes = LUGARES_CORACOES.map((lugar, i) => ({
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

function soltarCoracoes(): void {
  for (const c of coracoes) c.saindo = true;
}

function atualizarCoracoes(dt: number, tempo: number, corpo: CorpoAnjo): void {
  for (const c of coracoes) {
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
  coracoes = coracoes.filter((c) => c.resta > 0);
}

function desenharCoracoes(ctx: CanvasRenderingContext2D, tempo: number): void {
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
let faiscas: Faisca[] = [];
let sobraFaiscas = 0;

function novaFaisca(x: number, y: number, vx: number, vy: number): void {
  const total = 0.5 + Math.random() * 0.5;
  faiscas.push({ x, y, vx, vy, vida: total, total, cor: CORES_FAISCA[(Math.random() * CORES_FAISCA.length) | 0] });
}

function atualizarFaiscas(dt: number, pose: Pose): void {
  if (estado.fase === 'acendendo') {
    sobraFaiscas += dt * 40;
    for (; sobraFaiscas >= 1; sobraFaiscas--) {
      const { x, y } = noMapa(pose, Math.random() * pose.quadro.w, Math.random() * pose.quadro.h);
      novaFaisca(x, y, (Math.random() - 0.5) * 10, -15 - Math.random() * 25);
    }
  }
  for (const f of faiscas) {
    f.vida -= dt;
    f.vy -= 12 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
  }
  faiscas = faiscas.filter((f) => f.vida > 0);
}

function estourarFaiscas(corpo: CorpoAnjo): void {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const v = 30 + Math.random() * 30;
    novaFaisca(corpo.x, corpo.y - 16, Math.cos(a) * v, Math.sin(a) * v - 10);
  }
}

function desenharFaiscas(ctx: CanvasRenderingContext2D): void {
  for (const f of faiscas) {
    ctx.globalAlpha = Math.min(1, (f.vida / f.total) * 1.5);
    ctx.fillStyle = f.cor;
    ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
  }
  ctx.globalAlpha = 1;
}

// ---- Laço ----

export function atualizarAnjo(dt: number, tempo: number, corpo: CorpoAnjo, pose: Pose): void {
  if (estado.fase !== 'parado') {
    estado.tempoFase += dt;
    if (estado.fase === 'acendendo' && estado.tempoFase >= ACENDER[destino()]) {
      estado.forma = destino();
      estado.fase = 'apagando';
      estado.tempoFase = 0;
      estourarFaiscas(corpo);
      if (estado.forma === 'anjo') soltarCoracoesDoPeito(corpo);
    } else if (estado.fase === 'apagando' && estado.tempoFase >= APAGAR[estado.forma]) {
      estado.fase = 'parado';
    }
  }
  atualizarBatida(dt, corpo);
  atualizarCoracoes(dt, tempo, corpo);
  atualizarFaiscas(dt, pose);
}

// Coloca o contexto no espaço do quadro: (0, 0) é o canto de cima do recorte, e o eixo x
// aponta para onde o personagem olha (o desenho do sprite é virado para a direita).
function noQuadro(ctx: CanvasRenderingContext2D, pose: Pose): void {
  ctx.translate(pose.direcao === 1 ? pose.x - pose.eixo : pose.x + pose.eixo, pose.topo);
  ctx.scale(pose.direcao, 1);
}

// Antes do sprite: a aura e as asas (o que fica atrás do corpo).
export function desenharAnjoAtras(ctx: CanvasRenderingContext2D, tempo: number, pose: Pose): void {
  if (estado.forma !== 'anjo') return;
  const abertura = aberturaAsas();

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
    desenharAsas(ctx, pose, abertura);
    ctx.restore();
  }
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

// Depois do sprite: a tarja, os corações dos olhos, a luz da transformação, os corações em volta
// e as faíscas.
export function desenharAnjoNaFrente(ctx: CanvasRenderingContext2D, tempo: number, pose: Pose): void {
  if (estado.forma === 'anjo') {
    ctx.save();
    noQuadro(ctx, pose);
    desenharTarja(ctx, pose.quadro, tempo);
    // Olhos de coração: o mesmo coração pequeno que flutua em volta, parado na frente de cada
    // olho. Sem brilho somado: sobre a pele clara ele amarelava.
    for (const [c, r] of pose.quadro.olhos) ctx.drawImage(CORACAO_PEQUENO, c - 1, r - 1);
    ctx.restore();
  }

  const { raio, forca } = luzNoCorpo();
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

  desenharCoracoes(ctx, tempo);
  desenharFaiscas(ctx);
}
