// Os raios de sol da partida e o que eles fazem na cena, em coordenadas de tela, por cima de tudo
// (menos os nomes e a interface):
// - os fachos: um leque de feixes largos e macios que sai do sol e desce até o chão, sempre
//   apontado para a arena (o sol na esquerda, eles descem para a direita, e vice-versa). Cada feixe
//   tem o miolo mais forte e as bordas se desfazendo, respira no seu ritmo e balança devagar. Com o
//   sol alto eles são curtos e brancos; baixo, mais compridos, dourados e mais fortes (a hora
//   dourada). Perto do horizonte somem, junto com a luz;
// - a cena reage: por onde o feixe passa, as copas, a grama e quem estiver ali ficam mais claros e
//   quentes (soft-light); as plantas que ele pega ganham um filete de luz na borda virada para o sol
//   (cenario.ts pergunta aqui: luzDoRaio); e onde ele bate no chão a grama brilha, com gotinhas de
//   orvalho cintilando — umas brancas, umas douradas e, de vez em quando, uma que refrata em azul ou
//   rosa;
// - a poeira no ar: grãozinhos dourados que flutuam pela cena e só aparecem dentro dos feixes,
//   piscando — a poeira que a gente só vê no facho de sol;
// - as nuvens: quando uma passa na frente do sol, os fachos, as poças e o calor da luz somem aos
//   poucos e a cena escurece um pouco (cenario.ts mede a cobertura: coberturaDoSol).

import { contexto2d, novoCanvas } from '../motor/imagens';
import { suavizar } from '../motor/matematica';
import type { Luz } from '../motor/tipos';

// Cada feixe: `desvio` do meio do leque (rad), `meia` largura (rad), `forca` relativa e o ritmo em
// que respira (`periodo` s, `fase`).
const FEIXES = [
  { desvio: -0.66, meia: 0.075, forca: 0.75, periodo: 11, fase: 0 },
  { desvio: -0.36, meia: 0.13, forca: 1, periodo: 7.5, fase: 1.3 },
  { desvio: -0.08, meia: 0.07, forca: 0.8, periodo: 13, fase: 2.1 },
  { desvio: 0.18, meia: 0.15, forca: 1, periodo: 9, fase: 0.7 },
  { desvio: 0.47, meia: 0.085, forca: 0.85, periodo: 12, fase: 3.2 },
  { desvio: 0.72, meia: 0.11, forca: 0.7, periodo: 8, fase: 4.4 },
];

// Camadas de cada feixe, da mais larga e fraca ao miolo: juntas, a borda fica macia.
const CAMADAS = [
  { largura: 1, alfa: 0.4 },
  { largura: 0.62, alfa: 0.35 },
  { largura: 0.3, alfa: 0.35 },
];

// A faixa da grama onde a luz deita (px a partir da linha do chão): a luz some de leve para cima
// (as pontas dos tufos) e para baixo (onde a grama vira terra), sem borda.
const CHAO = { meio: 1, altura: 3, de: -3, cheio: [-1, 2] as const, ate: 5 };

const RAIOS = {
  forca: 0.15, // alfa do facho visível (screen), com o sol forte
  aquece: 0.27, // alfa do que o facho clareia e esquenta embaixo dele (soft-light)
  horaDourada: 0.3, // quanto mais fortes os raios ficam com o sol baixo
  inicio: 9, // px a partir do centro do sol onde o facho começa (dentro do brilho)
  poca: 0.5, // a luz deitada na grama (soft-light: clareia e esquenta a grama, não brilha no ar)
  brilhoNoChao: 0.06, // e um quase nada dela brilhando (screen), só no miolo
  nuvem: 0.8, // quanto uma nuvem na frente do sol apaga os raios
  sombraDaNuvem: 0.1, // e quanto a cena escurece com ela
  seguir: 1.6, // por segundo: a cobertura muda aos poucos (a nuvem entrando e saindo do sol)
};

// Cor do facho: branca-quente com o sol alto, dourada com ele baixo.
const COR_ALTO = [255, 246, 214];
const COR_BAIXO = [255, 200, 118];

// O orvalho na grama onde o feixe bate: uma gotinha em cada `raras` colunas do mapa (sempre as
// mesmas, presas na grama), cada uma piscando no seu ritmo.
const ORVALHO = {
  densidade: 0.32, // fração das colunas com uma gotinha
  acima: 4, // px acima da linha da grama onde elas podem estar (a ponta dos tufos)
  abaixo: 2,
  // As cores do brilho: quase todas brancas-quentes e douradas; umas poucas refratam.
  cores: [
    { ate: 0.55, cor: '255, 252, 228' },
    { ate: 0.83, cor: '255, 224, 136' },
    { ate: 0.92, cor: '190, 238, 255' },
    { ate: 1, cor: '255, 204, 238' },
  ],
};

const POEIRA = {
  quantos: 150,
  subida: [1.5, 5] as const, // px/s
  deriva: [-3, 3] as const, // px/s para os lados (e um balanço em cima)
  cor: '255, 240, 190',
};

interface Graos {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fase: number;
  pisca: number;
}

let poeira: Graos[] | null = null;

// Sorteio fixo (a poeira nasce sempre igual e dá a volta na tela).
function sorteador(semente: number): () => number {
  let s = semente;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function criarPoeira(): Graos[] {
  const aleatorio = sorteador(20260930);
  const entre = ([a, b]: readonly [number, number]): number => a + (b - a) * aleatorio();
  return Array.from({ length: POEIRA.quantos }, () => ({
    x: aleatorio(),
    y: aleatorio(),
    vx: entre(POEIRA.deriva),
    vy: -entre(POEIRA.subida),
    fase: aleatorio() * Math.PI * 2,
    pisca: 0.6 + aleatorio() * 1.6,
  }));
}

// A cobertura do sol pelas nuvens, 0–1, seguida aos poucos.
let cobertura = 0;
let coberturaAlvo = 0;
let ultimoTempo = 0;

// cenario.ts avisa, a cada vista desenhada, quanto das nuvens está na frente do sol; vale a maior
// do quadro (com a tela dividida, são duas).
export function avisarCobertura(c: number): void {
  coberturaAlvo = Math.max(coberturaAlvo, c);
}

// O que os raios fazem com a luz da cena neste quadro (desenharLuz usa para o calor e a sombra da
// nuvem): 1 com o sol limpo, menos com uma nuvem na frente.
export function solLivre(): number {
  return 1 - RAIOS.nuvem * cobertura;
}

export function sombraDaNuvem(): number {
  return RAIOS.sombraDaNuvem * cobertura;
}

// Anda a cobertura até a medida deste quadro. Chamado uma vez por quadro, antes de desenhar a luz.
export function acompanharNuvens(tempo: number): void {
  const dt = Math.max(0, Math.min(0.1, tempo - ultimoTempo));
  ultimoTempo = tempo;
  cobertura += (coberturaAlvo - cobertura) * Math.min(1, dt * RAIOS.seguir);
  coberturaAlvo = 0;
}

interface Feixe {
  angulo: number;
  meia: number;
  forca: number; // 0–1, já com a respiração
}

// Os feixes do quadro: o leque apontado do sol para o meio da arena, no chão.
function feixesDoQuadro(luz: Luz, tempo: number, largura: number, chao: number): Feixe[] {
  const meio = Math.atan2(chao - luz.y, largura / 2 - luz.x);
  // Sempre para baixo, mesmo com o sol quase no canto.
  const centro = Math.max(0.45, Math.min(Math.PI - 0.45, meio));
  return FEIXES.map((f) => {
    const respira = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin((2 * Math.PI * tempo) / f.periodo + f.fase));
    // Uma segunda onda, lenta, deixa um feixe às vezes mais fraco por um tempo.
    const vai = 0.7 + 0.3 * Math.sin(tempo * 0.05 + f.fase * 2.3);
    return {
      angulo: centro + f.desvio + 0.03 * Math.sin(tempo * 0.09 + f.fase),
      meia: f.meia * (0.9 + 0.1 * Math.sin(tempo * 0.13 + f.fase)),
      forca: f.forca * respira * vai,
    };
  });
}

// Quanto o ponto (x, y) está dentro de algum feixe, 0–1 (o miolo vale 1, a borda cai macia).
function dentroDosFeixes(feixes: Feixe[], luz: Luz, x: number, y: number): number {
  const dx = x - luz.x;
  const dy = y - luz.y;
  if (dy < 0) return 0;
  const a = Math.atan2(dy, dx);
  let v = 0;
  for (const f of feixes) {
    const d = Math.abs(a - f.angulo) / f.meia;
    if (d < 1) v = Math.max(v, f.forca * (1 - d * d));
  }
  return v;
}

function corDoFacho(luz: Luz): number[] {
  const baixo = 1 - suavizar(0.25, 0.75, luz.elevacao);
  return COR_ALTO.map((c, i) => Math.round(c + (COR_BAIXO[i] - c) * baixo));
}

// Desenha o leque inteiro com a operação `modo`: cada feixe em camadas, o degradê radial a partir
// do sol (começa dentro do brilho, é mais forte no meio do caminho e ainda chega ao chão).
function pintarFeixes(
  ctx: CanvasRenderingContext2D,
  feixes: Feixe[],
  luz: Luz,
  cor: number[],
  alfa: number,
  alcance: number,
  modo: GlobalCompositeOperation,
): void {
  const [r, g, b] = cor;
  ctx.globalCompositeOperation = modo;
  for (const f of feixes) {
    const forca = alfa * f.forca;
    if (forca < 0.004) continue;
    const grad = ctx.createRadialGradient(luz.x, luz.y, RAIOS.inicio, luz.x, luz.y, alcance);
    // Nasce fraco dentro do brilho do sol, é mais forte na altura das copas e ainda chega ao chão.
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
    grad.addColorStop(0.08, `rgba(${r}, ${g}, ${b}, ${forca * 0.55})`);
    grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${forca})`);
    grad.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, ${forca * 0.8})`);
    grad.addColorStop(0.9, `rgba(${r}, ${g}, ${b}, ${forca * 0.3})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = grad;
    for (const c of CAMADAS) {
      const w = f.meia * c.largura;
      ctx.globalAlpha = c.alfa;
      ctx.beginPath();
      ctx.moveTo(luz.x, luz.y);
      ctx.lineTo(luz.x + Math.cos(f.angulo - w) * alcance, luz.y + Math.sin(f.angulo - w) * alcance);
      ctx.lineTo(luz.x + Math.cos(f.angulo + w) * alcance, luz.y + Math.sin(f.angulo + w) * alcance);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// Onde cada feixe bate no chão, a luz deitada na grama: bem achatada (o chão visto quase de lado),
// da largura do feixe ali e com a borda sumindo devagar. Vai na camada do chão (pintarLuzNoChao).
function pintarPocas(ctx: CanvasRenderingContext2D, feixes: Feixe[], luz: Luz, cor: number[], alfa: number, chao: number): void {
  const [r, g, b] = cor;
  for (const f of feixes) {
    const alvo = noChao(f, luz, chao);
    const forca = alfa * f.forca;
    if (!alvo || forca < 0.004) continue;
    ctx.save();
    ctx.translate(alvo.x, chao + CHAO.meio);
    ctx.scale(alvo.meia * 1.25, CHAO.altura);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${forca})`);
    grad.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${forca * 0.8})`);
    grad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${forca * 0.4})`);
    grad.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, ${forca * 0.12})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// A poeira dando a volta na tela, acima do chão; cada grão só acende dentro de um feixe.
function pintarPoeira(ctx: CanvasRenderingContext2D, feixes: Feixe[], luz: Luz, tempo: number, alfa: number, largura: number, chao: number): void {
  poeira ||= criarPoeira();
  ctx.globalCompositeOperation = 'source-over';
  for (const p of poeira) {
    const x = (((p.x * largura + tempo * p.vx + 2 * Math.sin(tempo * 0.7 + p.fase)) % largura) + largura) % largura;
    const y = (((p.y * chao + tempo * p.vy) % chao) + chao) % chao;
    const dentro = dentroDosFeixes(feixes, luz, x, y);
    if (dentro < 0.05) continue;
    const pisca = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(tempo * p.pisca * 2 + p.fase));
    const a = Math.min(1, alfa * dentro * pisca);
    if (a < 0.03) continue;
    const px = Math.round(x);
    const py = Math.round(y);
    ctx.fillStyle = `rgba(${POEIRA.cor}, ${a.toFixed(3)})`;
    ctx.fillRect(px, py, 1, 1);
    // Os mais acesos ganham uma cruzinha de brilho.
    if (a > 0.55) {
      ctx.fillStyle = `rgba(${POEIRA.cor}, ${(a * 0.35).toFixed(3)})`;
      ctx.fillRect(px - 1, py, 1, 1);
      ctx.fillRect(px + 1, py, 1, 1);
      ctx.fillRect(px, py - 1, 1, 1);
      ctx.fillRect(px, py + 1, 1, 1);
    }
  }
}

// Um sorteio fixo por coluna do mapa (o orvalho fica sempre no mesmo lugar da grama).
function acaso(x: number, sal: number): number {
  const s = Math.sin(x * 12.9898 + sal * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// Onde o feixe bate no chão: o centro e a meia largura dele ali, em px da tela.
function noChao(f: Feixe, luz: Luz, chao: number): { x: number; meia: number } | null {
  const s = Math.sin(f.angulo);
  if (s < 0.2 || chao <= luz.y) return null;
  const distancia = (chao - luz.y) / s;
  return { x: luz.x + Math.cos(f.angulo) * distancia, meia: Math.max(6, (distancia * Math.tan(f.meia)) / s) };
}

// O orvalho cintilando na grama onde o feixe bate: gotinhas de 1px, as mais acesas com uma cruz
// (e as mais ainda, com as pontas longas). `camX`: a câmera, para as gotinhas ficarem presas no
// mapa quando ela anda.
function pintarOrvalho(ctx: CanvasRenderingContext2D, feixes: Feixe[], luz: Luz, tempo: number, alfa: number, chao: number, camX: number): void {
  ctx.globalCompositeOperation = 'source-over';
  for (const f of feixes) {
    const alvo = noChao(f, luz, chao);
    const forca = alfa * f.forca;
    if (!alvo || forca < 0.02) continue;
    const de = Math.floor(alvo.x - alvo.meia);
    const ate = Math.ceil(alvo.x + alvo.meia);
    for (let x = de; x <= ate; x++) {
      const coluna = x + Math.round(camX);
      if (acaso(coluna, 1) > ORVALHO.densidade) continue;
      const borda = (x - alvo.x) / alvo.meia;
      const miolo = 1 - borda * borda;
      if (miolo <= 0) continue;
      const pisca = Math.sin(tempo * (1.2 + 3 * acaso(coluna, 2)) + acaso(coluna, 3) * 40);
      if (pisca < 0.25) continue;
      const a = Math.min(1, forca * 1.6 * miolo * ((pisca - 0.25) / 0.75));
      if (a < 0.05) continue;
      const y = Math.round(chao - ORVALHO.acima + acaso(coluna, 4) * (ORVALHO.acima + ORVALHO.abaixo));
      const tom = acaso(coluna, 5);
      const brilho = ORVALHO.cores.find((c) => tom <= c.ate)!.cor;
      ctx.fillStyle = `rgba(${brilho}, ${a.toFixed(3)})`;
      ctx.fillRect(x, y, 1, 1);
      if (a > 0.35) {
        ctx.fillStyle = `rgba(${brilho}, ${(a * 0.5).toFixed(3)})`;
        ctx.fillRect(x - 1, y, 1, 1);
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x, y - 1, 1, 1);
        ctx.fillRect(x, y + 1, 1, 1);
      }
      if (a > 0.65) {
        ctx.fillStyle = `rgba(${brilho}, ${(a * 0.2).toFixed(3)})`;
        ctx.fillRect(x - 2, y, 1, 1);
        ctx.fillRect(x + 2, y, 1, 1);
      }
    }
  }
}

// Os feixes do quadro, calculados uma vez (prepararRaios) antes de desenhar a cena: as plantas
// perguntam por eles (luzDoRaio) e desenharRaios os pinta no fim.
let quadro: { tempo: number; luz: Luz; feixes: Feixe[]; forca: number } | null = null;

// Chamado uma vez por quadro, antes de desenhar a cena. `luz`: o sol na tela; `chao`: a linha da
// grama na tela.
export function prepararRaios(luz: Luz, tempo: number, largura: number, chao: number): void {
  const horaDourada = 1 + RAIOS.horaDourada * (1 - suavizar(0.3, 0.8, luz.elevacao));
  quadro = { tempo, luz, feixes: feixesDoQuadro(luz, tempo, largura, chao), forca: luz.forca * solLivre() * horaDourada };
}

// Quanto os raios deste quadro batem no ponto (x, y) da tela, 0–1.
export function luzDoRaio(x: number, y: number): number {
  if (!quadro || quadro.forca < 0.02) return 0;
  return Math.min(1, dentroDosFeixes(quadro.feixes, quadro.luz, x, y) * quadro.forca);
}

// Os fachos, as poças e a faixa de luz na grama mudam devagar (respiram em 7 a 13 s, e o sol
// anda mais devagar ainda): em vez de pintar ~40 formas com degradê por cima da cena a cada
// quadro (cada uma, no modo soft-light, faz a placa de vídeo ler a tela de volta), eles são
// pintados em duas camadas guardadas, refeitas umas REFAZER vezes por segundo, e cada quadro só
// cola as duas: a que clareia e esquenta (soft-light) e a que aparece no ar (screen). Entre uma
// refeita e outra, as camadas acompanham o sol na tela (a câmera subindo num pulo). O orvalho e a
// poeira piscam rápido e continuam a cada quadro.
const REFAZER = 20;
// As camadas pegam um pouco além da tela (o deslocamento entre duas refeitas não deixa borda).
const MARGEM = 24;

interface Camadas {
  aquece: HTMLCanvasElement;
  facho: HTMLCanvasElement;
  chao: HTMLCanvasElement;
  tempo: number;
  luz: { x: number; y: number };
  base: number; // a linha do chão (na tela) em que a camada do chão foi pintada
  largura: number;
  altura: number;
}

let camadas: Camadas | null = null;

function pintarCamadas(c: Camadas, feixes: Feixe[], luz: Luz, cor: number[], forca: number, chao: number): void {
  const alcance = Math.hypot(c.largura, c.altura) * 1.05;
  // Nas camadas, o ponto (0, 0) da tela fica em (MARGEM, MARGEM).
  const mover = { ...luz, x: luz.x + MARGEM, y: luz.y + MARGEM };
  const yChao = chao + MARGEM;
  const aquece = contexto2d(c.aquece);
  aquece.setTransform(1, 0, 0, 1, 0, 0);
  aquece.clearRect(0, 0, c.aquece.width, c.aquece.height);
  pintarFeixes(aquece, feixes, mover, cor, RAIOS.aquece * forca, alcance, 'source-over');

  const facho = contexto2d(c.facho);
  facho.setTransform(1, 0, 0, 1, 0, 0);
  facho.clearRect(0, 0, c.facho.width, c.facho.height);
  pintarFeixes(facho, feixes, mover, cor, RAIOS.forca * forca, alcance, 'source-over');

  pintarLuzNoChao(c.chao, feixes, mover, cor, forca, yChao);
}

// A luz que os feixes deitam na grama, numa camada só dela: as poças, e por cima uma máscara que
// some para cima e para baixo da faixa da grama (CHAO), para a luz ficar no chão e não flutuar
// por cima dele nem acabar numa linha reta.
function pintarLuzNoChao(tela: HTMLCanvasElement, feixes: Feixe[], luz: Luz, cor: number[], forca: number, chao: number): void {
  const ctx = contexto2d(tela);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, tela.width, tela.height);
  pintarPocas(ctx, feixes, luz, cor, Math.min(1, RAIOS.poca * forca), chao);
  const de = chao + CHAO.de;
  const ate = chao + CHAO.ate;
  const altura = ate - de;
  const mascara = ctx.createLinearGradient(0, de, 0, ate);
  mascara.addColorStop(0, 'rgba(0, 0, 0, 0)');
  mascara.addColorStop((CHAO.cheio[0] - CHAO.de) / altura, 'rgba(0, 0, 0, 1)');
  mascara.addColorStop((CHAO.cheio[1] - CHAO.de) / altura, 'rgba(0, 0, 0, 1)');
  mascara.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = mascara;
  ctx.fillRect(0, 0, tela.width, tela.height);
  ctx.globalCompositeOperation = 'source-over';
}

// Um pedaço da tela com o seu chão: a tela inteira, ou cada metade dela dividida. Cada metade tem
// a sua câmera, e com ela a sua linha da grama (`chao`, na tela) e o seu `camX` (o orvalho fica
// preso no mapa daquela metade).
export interface VistaDoChao {
  x0: number;
  largura: number;
  chao: number;
  camX: number;
}

// Os raios, a luz que eles jogam na cena, as poças e o brilho na grama e a poeira. O sol e os
// fachos são da tela (iguais nas duas metades); o que fica no chão — a luz deitada na grama e o
// orvalho — é pintado em cada vista com o chão e a câmera dela. A primeira vista é a que os
// feixes do quadro usaram (prepararRaios).
export function desenharRaios(
  ctx: CanvasRenderingContext2D,
  luz: Luz,
  tempo: number,
  largura: number,
  altura: number,
  vistas: VistaDoChao[],
): void {
  const base = vistas[0].chao;
  if (!quadro || quadro.tempo !== tempo) prepararRaios(luz, tempo, largura, base);
  const { feixes, forca } = quadro!;
  if (forca < 0.02) return;
  const cor = corDoFacho(luz);
  if (!camadas || camadas.largura !== largura || camadas.altura !== altura) {
    const w = largura + 2 * MARGEM;
    const h = altura + 2 * MARGEM;
    camadas = { aquece: novoCanvas(w, h), facho: novoCanvas(w, h), chao: novoCanvas(w, h), tempo: -Infinity, luz: { x: luz.x, y: luz.y }, base, largura, altura };
  }
  if (Math.abs(tempo - camadas.tempo) >= 1 / REFAZER) {
    // As camadas são pintadas com o sol e o chão de agora; entre uma refeita e outra, andam junto
    // com o sol (o chão anda junto com ele na tela: os dois descem com a câmera).
    pintarCamadas(camadas, feixes, luz, cor, forca, base);
    camadas.tempo = tempo;
    camadas.luz = { x: luz.x, y: luz.y };
    camadas.base = base;
  }
  const dx = Math.round(luz.x - camadas.luz.x) - MARGEM;
  const dy = Math.round(luz.y - camadas.luz.y) - MARGEM;
  for (const v of vistas) {
    ctx.save();
    // Os fachos param na grama (a terra embaixo não pega sol); as poças ficam na linha dela.
    ctx.beginPath();
    ctx.rect(v.x0, 0, v.largura, v.chao + CHAO.ate);
    ctx.clip();
    // A cena embaixo do facho clareia e esquenta (as copas, a grama, quem estiver ali)...
    ctx.globalCompositeOperation = 'soft-light';
    ctx.drawImage(camadas.aquece, dx, dy);
    // ...e o próprio facho aparece no ar.
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(camadas.facho, dx, dy);
    // A luz deitada na grama desta vista (a camada foi pintada no chão da primeira): clareia e
    // esquenta a própria grama, e só um quase nada brilha.
    const noChaoDaVista = Math.round(v.chao - camadas.base) - MARGEM;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.drawImage(camadas.chao, dx, noChaoDaVista);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = RAIOS.brilhoNoChao / RAIOS.poca;
    ctx.drawImage(camadas.chao, dx, noChaoDaVista);
    ctx.globalAlpha = 1;
    pintarOrvalho(ctx, feixes, luz, tempo, Math.min(1, forca), v.chao, v.camX);
    pintarPoeira(ctx, feixes, luz, tempo, Math.min(1, 1.1 * forca), largura, v.chao);
    ctx.restore();
  }
}
