// Fonte de pixels 3×5 para os textos do jogo: letras maiúsculas, números e alguns sinais, com
// um pixel de espaço entre as letras. Desenhada pixel a pixel, fica nítida em qualquer
// ampliação, como o resto da arte (o texto do navegador sairia borrado no canvas ampliado).

import { criarSprite } from './imagens';

export const ALTURA_FONTE = 5;

// '#' = pixel aceso. Todos com 3 colunas.
const GLIFOS: Record<string, readonly string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  ' ': ['...', '...', '...', '...', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
};

const prontos = new Map<string, HTMLCanvasElement>();

// O texto desenhado na cor pedida, numa imagem do tamanho exato dele. Minúsculas viram
// maiúsculas; o que a fonte não tem vira espaço.
export function textoEmPixels(texto: string, cor: string): HTMLCanvasElement {
  const chave = `${cor}|${texto}`;
  const pronto = prontos.get(chave);
  if (pronto) return pronto;

  const glifos = [...texto.toUpperCase()].map((c) => GLIFOS[c] ?? GLIFOS[' ']);
  const linhas = Array.from({ length: ALTURA_FONTE }, (_, y) => glifos.map((g) => g[y]).join('.'));
  const imagem = criarSprite(linhas, { '#': cor });
  prontos.set(chave, imagem);
  return imagem;
}
