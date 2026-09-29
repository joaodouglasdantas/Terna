// O céu da partida, atrás de tudo:
// - o degradê, do azul fundo lá no alto ao horizonte claro e um pouco quente, em faixas com
//   pontilhado de pixel art (em vez da faixa lisa de antes);
// - os cirros, fiapos de nuvem bem alta que atravessam devagar, quase sem paralaxe;
// - a serra de longe, uma cordilheira azulada desenhada aqui mesmo, que espia por trás da serra da
//   paisagem e dá profundidade (ela anda menos que a paisagem quando a câmera anda).

import { contexto2d, novoCanvas } from '../motor/imagens';
import { BAYER, rgb, sorteador } from './cor';

// Cores do céu por altura na tela (y), de cima para baixo; entre duas paradas, faixas de
// FAIXA_CEU px com a borda pontilhada.
const PARADAS_CEU: [number, string][] = [
  [0, '#2446c4'],
  [45, '#3160dc'],
  [90, '#4a86ec'],
  [125, '#78adf4'],
  [150, '#abcdf6'],
  [175, '#d6e6f4'],
  [270, '#e4ecf0'],
];
const FAIXA_CEU = 6;

function corDoCeu(y: number): number[] {
  for (let k = 1; k < PARADAS_CEU.length; k++) {
    const [y1, c1] = PARADAS_CEU[k];
    if (y > y1) continue;
    const [y0, c0] = PARADAS_CEU[k - 1];
    const t = (y - y0) / (y1 - y0);
    const [a, b] = [rgb(c0), rgb(c1)];
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
  }
  return rgb(PARADAS_CEU[PARADAS_CEU.length - 1][1]);
}

// O degradê em faixas: cada faixa tem a cor do seu meio, e as 2 linhas da borda com a de baixo
// se misturam no pontilhado de Bayer.
export function criarCeu(largura: number, altura: number): HTMLCanvasElement {
  const canvas = novoCanvas(largura, altura);
  const ctx = contexto2d(canvas);
  const img = ctx.createImageData(largura, altura);
  for (let y = 0; y < altura; y++) {
    const faixa = Math.floor(y / FAIXA_CEU);
    const dentro = y - faixa * FAIXA_CEU;
    const esta = corDoCeu((faixa + 0.5) * FAIXA_CEU);
    const proxima = corDoCeu((faixa + 1.5) * FAIXA_CEU);
    // Nas duas últimas linhas da faixa, 1/4 e depois 1/2 dos pixels já são da próxima.
    const fracao = dentro === FAIXA_CEU - 1 ? 8 : dentro === FAIXA_CEU - 2 ? 4 : 0;
    for (let x = 0; x < largura; x++) {
      const c = BAYER[y % 4][x % 4] < fracao ? proxima : esta;
      const i = (y * largura + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---- Cirros ----

const CIRROS = {
  largura: 960, // a faixa dá a volta
  altura: 90,
  quantos: 9,
  velocidade: 1.6, // px/s para a esquerda
  paralaxe: 0.12,
};

let cirros: HTMLCanvasElement | null = null;

// Cada fiapo é um feixe de 2 a 4 riscos compridos, finos e contínuos, levemente curvos: cheios no
// meio e se desfazendo nas pontas (a transparência sobe e uns pixels somem); a luz em cima, quase
// branca, e 1px azulado embaixo em parte do comprimento.
function criarCirros(): HTMLCanvasElement {
  const canvas = novoCanvas(CIRROS.largura, CIRROS.altura);
  const ctx = contexto2d(canvas);
  const aleatorio = sorteador(4242);
  for (let n = 0; n < CIRROS.quantos; n++) {
    const x0 = Math.floor(aleatorio() * CIRROS.largura);
    const y0 = 10 + Math.floor(aleatorio() * (CIRROS.altura - 26));
    const riscos = 2 + Math.floor(aleatorio() * 3);
    const comprimento = 60 + Math.floor(aleatorio() * 110);
    const curva = (aleatorio() - 0.5) * 6;
    for (let r = 0; r < riscos; r++) {
      const dx = Math.floor(r * (6 + aleatorio() * 14));
      const dy = r * 3 + Math.floor(aleatorio() * 2);
      const len = Math.floor(comprimento * (0.45 + aleatorio() * 0.55));
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const cheio = Math.sin(Math.PI * t);
        if (cheio < 0.25 && aleatorio() > cheio * 3) continue; // as pontas se desfazem
        const x = (x0 + dx + i) % CIRROS.largura;
        const y = Math.round(y0 + dy + curva * Math.sin(Math.PI * t) - t * 2);
        ctx.fillStyle = `rgba(248, 251, 255, ${(0.16 + 0.34 * cheio).toFixed(3)})`;
        ctx.fillRect(x, y, 1, 1);
        if (cheio > 0.45) {
          ctx.fillStyle = `rgba(210, 228, 255, ${(0.1 + 0.18 * cheio).toFixed(3)})`;
          ctx.fillRect(x, y + 1, 1, 1);
        }
      }
    }
  }
  return canvas;
}

export function desenharCirros(ctx: CanvasRenderingContext2D, tempo: number, camX: number, largura: number, y: number): void {
  cirros ||= criarCirros();
  const andou = -(tempo * CIRROS.velocidade + camX * CIRROS.paralaxe);
  const x = ((Math.round(andou) % CIRROS.largura) + CIRROS.largura) % CIRROS.largura;
  for (let px = x - CIRROS.largura; px < largura; px += CIRROS.largura) ctx.drawImage(cirros, px, y);
}

// ---- Serra de longe ----

const SERRA = {
  largura: 760, // mais larga que a tela; desliza devagar com a câmera
  altura: 80,
  y: 52, // onde fica o topo da faixa na tela
  base: 70, // até onde a serra desce (o resto fica escondido atrás da paisagem)
  paralaxe: 0.06,
  neve: 30, // abaixo do pico mais alto, até onde vai a neve (px)
};

const CORES_SERRA = {
  rochaLuz: rgb('#a3b8ea'),
  rochaSombra: rgb('#8599d6'),
  neveLuz: rgb('#eef4ff'),
  neveSombra: rgb('#cad6f4'),
  veu: rgb('#b9d3f6'),
};

let serra: HTMLCanvasElement | null = null;

// Contorno de cordilheira: picos sorteados ligados por encostas retas com um pouco de ruído;
// cada coluna tem o topo `alto[x]`. A face virada para a esquerda (de onde vem a luz) é clara;
// a outra, escura. A neve cobre os picos e desce em línguas pelas ravinas.
function criarSerra(): HTMLCanvasElement {
  const { largura, altura } = SERRA;
  const canvas = novoCanvas(largura, altura);
  const ctx = contexto2d(canvas);
  const aleatorio = sorteador(913);

  const picos: [number, number][] = [];
  for (let x = -20; x < largura + 40; x += 34 + Math.floor(aleatorio() * 46)) {
    picos.push([x, 6 + Math.floor(aleatorio() * 30)]);
  }
  const alto = new Float32Array(largura);
  for (let x = 0; x < largura; x++) {
    let k = 0;
    while (k < picos.length - 2 && picos[k + 1][0] < x) k++;
    const [xa, ya] = picos[k];
    const [xb, yb] = picos[k + 1];
    // Vale em V entre dois picos: o fundo do vale é o ponto mais baixo das duas encostas.
    const meio = (xa + xb) / 2 + (yb - ya) * 0.4;
    const fundo = Math.max(ya, yb) + 10 + ((xb - xa) * 0.18);
    const y = x < meio ? ya + ((fundo - ya) * (x - xa)) / (meio - xa) : fundo + ((yb - fundo) * (x - meio)) / (xb - meio);
    alto[x] = y + Math.sin(x * 0.9) * 0.6 + (aleatorio() - 0.5) * 1.2;
  }
  const maisAlto = Math.min(...alto);

  const img = ctx.createImageData(largura, altura);
  for (let x = 0; x < largura; x++) {
    const topo = Math.round(alto[x]);
    const sobe = alto[Math.min(largura - 1, x + 2)] < alto[Math.max(0, x - 2)]; // encosta subindo para a direita: virada para a luz
    const linhaNeve = maisAlto + SERRA.neve * (0.6 + 0.4 * Math.sin(x * 0.07)) + Math.sin(x * 0.37) * 3;
    for (let y = Math.max(0, topo); y < altura; y++) {
      const profundo = y - topo;
      const neve = y < linhaNeve && profundo < 14 + 6 * Math.sin(x * 0.21);
      // Ravinas: listras diagonais escuras que descem as encostas.
      const ravina = (x + y * (sobe ? 1 : -1) + Math.floor(Math.sin(y * 0.3) * 2)) % 11 === 0;
      let luz = sobe !== ravina;
      if (profundo === 0) luz = true; // a crista pega luz
      const cor = neve ? (luz ? CORES_SERRA.neveLuz : CORES_SERRA.neveSombra) : luz ? CORES_SERRA.rochaLuz : CORES_SERRA.rochaSombra;
      // O véu da distância engrossa para baixo.
      const veu = 0.22 + Math.min(1, Math.max(0, (y - maisAlto) / (SERRA.base - maisAlto))) ** 1.2 * 0.7;
      const i = (y * largura + x) * 4;
      img.data[i] = cor[0] + (CORES_SERRA.veu[0] - cor[0]) * veu;
      img.data[i + 1] = cor[1] + (CORES_SERRA.veu[1] - cor[1]) * veu;
      img.data[i + 2] = cor[2] + (CORES_SERRA.veu[2] - cor[2]) * veu;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function desenharSerraDeLonge(ctx: CanvasRenderingContext2D, camX: number, largura: number, descer: number): void {
  serra ||= criarSerra();
  const folga = SERRA.largura - largura;
  const x = Math.min(folga, Math.round(folga * 0.2 + camX * SERRA.paralaxe));
  ctx.drawImage(serra, -x, SERRA.y + descer);
}
