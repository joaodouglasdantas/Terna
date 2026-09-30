// Os raios de sol da partida e o que eles fazem na cena, em coordenadas de tela, por cima de tudo
// (menos os nomes e a interface):
// - os fachos: um leque de feixes largos e macios que sai do sol e desce até o chão, sempre
//   apontado para a arena (o sol na esquerda, eles descem para a direita, e vice-versa). Cada feixe
//   tem o miolo mais forte e as bordas se desfazendo, respira no seu ritmo e balança devagar. Com o
//   sol alto eles são curtos e brancos; baixo, mais compridos, dourados e mais fortes (a hora
//   dourada). Perto do horizonte somem, junto com a luz;
// - a cena reage: por onde o feixe passa, as copas, a grama e quem estiver ali ficam mais claros e
//   quentes (soft-light), e onde ele bate no chão abre uma poça de luz na grama;
// - a poeira no ar: grãozinhos dourados que flutuam pela cena e só aparecem dentro dos feixes,
//   piscando — a poeira que a gente só vê no facho de sol;
// - as nuvens: quando uma passa na frente do sol, os fachos, as poças e o calor da luz somem aos
//   poucos e a cena escurece um pouco (cenario.ts mede a cobertura: coberturaDoSol).

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

const RAIOS = {
  forca: 0.34, // alfa do facho visível (screen), com o sol forte
  aquece: 0.6, // alfa do que o facho clareia e esquenta embaixo dele (soft-light)
  horaDourada: 0.7, // quanto mais fortes os raios ficam com o sol baixo
  inicio: 9, // px a partir do centro do sol onde o facho começa (dentro do brilho)
  poca: 0.36, // a poça de luz no chão
  nuvem: 0.8, // quanto uma nuvem na frente do sol apaga os raios
  sombraDaNuvem: 0.1, // e quanto a cena escurece com ela
  seguir: 1.6, // por segundo: a cobertura muda aos poucos (a nuvem entrando e saindo do sol)
};

// Cor do facho: branca-quente com o sol alto, dourada com ele baixo.
const COR_ALTO = [255, 246, 214];
const COR_BAIXO = [255, 200, 118];

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

// Onde cada feixe bate no chão, uma poça de luz achatada na grama, da largura do feixe ali.
function pintarPocas(ctx: CanvasRenderingContext2D, feixes: Feixe[], luz: Luz, cor: number[], alfa: number, chao: number): void {
  const altura = chao - luz.y;
  if (altura <= 0) return;
  const [r, g, b] = cor;
  for (const f of feixes) {
    const s = Math.sin(f.angulo);
    if (s < 0.2) continue;
    const distancia = altura / s;
    const x = luz.x + Math.cos(f.angulo) * distancia;
    const meiaLargura = Math.max(6, (distancia * Math.tan(f.meia)) / s);
    const forca = alfa * f.forca;
    if (forca < 0.004) continue;
    ctx.save();
    ctx.translate(x, chao + 1);
    ctx.scale(meiaLargura, 5);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${forca})`);
    grad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${forca * 0.45})`);
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

// Os raios, a luz que eles jogam na cena, as poças no chão e a poeira. `chao`: a linha da grama na
// tela.
export function desenharRaios(ctx: CanvasRenderingContext2D, luz: Luz, tempo: number, largura: number, altura: number, chao: number): void {
  const horaDourada = 1 + RAIOS.horaDourada * (1 - suavizar(0.3, 0.8, luz.elevacao));
  const forca = luz.forca * solLivre() * horaDourada;
  if (forca < 0.02) return;
  const feixes = feixesDoQuadro(luz, tempo, largura, chao);
  const cor = corDoFacho(luz);
  const alcance = Math.hypot(largura, altura) * 1.05;
  ctx.save();
  // Os fachos param na grama (a terra embaixo não pega sol); as poças ficam na linha dela.
  ctx.beginPath();
  ctx.rect(0, 0, largura, chao + 4);
  ctx.clip();
  // A cena embaixo do facho clareia e esquenta (as copas, a grama, quem estiver ali)...
  pintarFeixes(ctx, feixes, luz, cor, RAIOS.aquece * forca, alcance, 'soft-light');
  pintarPocas(ctx, feixes, luz, cor, RAIOS.poca * 1.4 * forca, chao);
  // ...e o próprio facho aparece no ar.
  pintarFeixes(ctx, feixes, luz, cor, RAIOS.forca * forca, alcance, 'screen');
  ctx.globalCompositeOperation = 'screen';
  pintarPocas(ctx, feixes, luz, cor, RAIOS.poca * forca, chao);
  pintarPoeira(ctx, feixes, luz, tempo, Math.min(1, 1.6 * forca), largura, chao);
  ctx.restore();
}
