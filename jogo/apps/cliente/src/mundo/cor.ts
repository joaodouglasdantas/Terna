// Acabamento de cor da cena da partida, aplicado uma vez nos pixels da arte (a paisagem, as
// plantas, a serra): mais saturação e contraste, sombras puxando para o azul-violeta e luzes para
// o dourado — o mesmo clima da tela inicial e do mapa, em vez do azul lavado de antes.

export interface Graduacao {
  saturacao: number; // 1 = igual; acima, cores mais vivas
  contraste: number; // 1 = igual; em volta do meio-tom `pivo`
  pivo?: number; // 0–1
  brilho?: number; // somado depois, em 0–255
  sombraFria?: number; // 0–1: quanto as sombras puxam para o azul-violeta
  luzQuente?: number; // 0–1: quanto as luzes puxam para o dourado
}

const SOMBRA_FRIA = [-14, -6, 18];
const LUZ_QUENTE = [16, 9, -10];

export const luminancia = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

// Gradua a cor (r, g, b) e devolve em `saida` (valores 0–255, ainda sem arredondar).
export function graduarCor(r: number, g: number, b: number, o: Graduacao, saida: number[]): number[] {
  const cinza = luminancia(r, g, b);
  r = cinza + (r - cinza) * o.saturacao;
  g = cinza + (g - cinza) * o.saturacao;
  b = cinza + (b - cinza) * o.saturacao;
  const pivo = (o.pivo ?? 0.5) * 255;
  r = pivo + (r - pivo) * o.contraste;
  g = pivo + (g - pivo) * o.contraste;
  b = pivo + (b - pivo) * o.contraste;
  const t = Math.max(0, Math.min(1, cinza / 255));
  const fria = (o.sombraFria ?? 0) * (1 - t) * (1 - t);
  const quente = (o.luzQuente ?? 0) * t * t;
  const brilho = o.brilho ?? 0;
  saida[0] = r + SOMBRA_FRIA[0] * fria + LUZ_QUENTE[0] * quente + brilho;
  saida[1] = g + SOMBRA_FRIA[1] * fria + LUZ_QUENTE[1] * quente + brilho;
  saida[2] = b + SOMBRA_FRIA[2] * fria + LUZ_QUENTE[2] * quente + brilho;
  return saida;
}

// Gradua todos os pixels visíveis de uma imagem. `escolher(x, y, r, g, b)` pode trocar a graduação
// por pixel (a montanha e o verde da paisagem pedem acertos diferentes).
export function graduarImagem(
  imagem: ImageData,
  padrao: Graduacao,
  escolher?: (x: number, y: number, r: number, g: number, b: number) => Graduacao,
): void {
  const { data, width } = imagem;
  const cor = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const p = i >> 2;
    const o = escolher ? escolher(p % width, (p / width) | 0, data[i], data[i + 1], data[i + 2]) : padrao;
    graduarCor(data[i], data[i + 1], data[i + 2], o, cor);
    data[i] = cor[0];
    data[i + 1] = cor[1];
    data[i + 2] = cor[2];
  }
}

// Mistura a cor do pixel `i` com `alvo` na proporção `k`.
export function misturarPixel(data: Uint8ClampedArray, i: number, alvo: readonly number[], k: number): void {
  data[i] += (alvo[0] - data[i]) * k;
  data[i + 1] += (alvo[1] - data[i + 1]) * k;
  data[i + 2] += (alvo[2] - data[i + 2]) * k;
}

// Converte '#rrggbb' em [r, g, b].
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Sorteio fixo por semente (o mesmo desenho em toda carga).
export function sorteador(semente: number): () => number {
  let s = semente;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Matriz de Bayer 4x4: o pontilhado ordenado dos degradês em pixel art.
export const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
