// Os ramos de folhas em pixel que abraçam as pontas dos botões grandes (Singleplayer,
// Multiplayer e o Jogar da seleção): um galho corre pela borda de cima e desce pela do lado,
// com folhas de vários tamanhos, uma florzinha e a luz do pôr do sol batendo na ponta das
// folhas, nas mesmas cores das copas da cena. O desenho é montado aqui (é mais fácil de ler e
// de mexer que um SVG escrito à mão no CSS) e vai para o CSS como a variável --ramo.
//
// A imagem é uma tira com três quadros do mesmo ramo: parado, e a brisa passando pela ponta de
// metade das folhas (um pixel) e depois pela da outra metade. O galho e a flor não se mexem. O CSS
// passa pelos quadros aos saltos (como pixel art), quase sempre no parado.

import { contexto2d, novoCanvas } from '../motor/imagens';

// O tamanho de um quadro, em pixels da arte, e onde fica nele o canto do botão (igual ao CSS de
// .inicio-jogar::before).
const LARGURA = 26;
const ALTURA = 18;
const CANTO = { x: 6, y: 9 };
const QUADROS = 3;

// h: a ponta da folha pegando o sol; l: luz; m: meio; d: sombra; s: o galho; f e c: a flor.
const CORES: Record<string, string> = {
  h: '#d9d46a',
  l: '#86b83e',
  m: '#4d8a2e',
  d: '#2b5622',
  s: '#7a4a24',
  f: '#fff0cf',
  c: '#ffb347',
  o: '#15210f', // o contorno, posto em volta de tudo
};

// As folhas: o desenho, de onde ela sai do galho (a primeira linha do desenho é a ponta) e para
// que lado o vento a dobra. `cima`: nasce em cima do galho e aponta para cima; `lado`: nasce à
// esquerda do galho de pé e aponta para a esquerda; `baixo`: pende embaixo do galho.
interface Folha {
  desenho: string[];
  x: number; // o canto de cima à esquerda do desenho
  y: number;
  jeito: 'cima' | 'lado' | 'baixo';
}

const FOLHA_GRANDE = ['..h.', '.hlm', 'hllm', 'lmmd', '.md.'];
const FOLHA = ['.h.', 'hlm', 'lmd', '.md'];
const FOLHA_DE_LADO = ['.hl.', 'hlmd', '.md.'];
const FOLHA_PENDENTE = ['.md', 'lmd', '.d.'];

const FOLHAS: Folha[] = [
  // Em cima do galho da borda de cima, do canto para a ponta, diminuindo.
  { desenho: FOLHA_GRANDE, x: 6, y: 4, jeito: 'cima' },
  { desenho: FOLHA, x: 10, y: 5, jeito: 'cima' },
  { desenho: FOLHA_GRANDE, x: 13, y: 4, jeito: 'cima' },
  { desenho: FOLHA, x: 18, y: 5, jeito: 'cima' },
  // Uma pendendo embaixo dele, perto da ponta (sem cobrir o texto).
  { desenho: FOLHA_PENDENTE, x: 20, y: 10, jeito: 'baixo' },
  // À esquerda do galho da borda do lado.
  { desenho: FOLHA_DE_LADO, x: 2, y: 10, jeito: 'lado' },
  { desenho: FOLHA_DE_LADO, x: 2, y: 13, jeito: 'lado' },
  // No canto, saindo para fora.
  { desenho: FOLHA_GRANDE, x: 2, y: 5, jeito: 'lado' },
];

// A flor, entre as folhas de cima.
const FLOR = { desenho: ['.f.', 'fcf', '.f.'], x: 16, y: 6 };

// O galho: pela borda de cima até a ponta enrolada, e pela borda do lado até a ponta de baixo.
const GALHO: [number, number][] = [
  ...Array.from({ length: 16 }, (_, i): [number, number] => [CANTO.x + i, CANTO.y]),
  [22, 8],
  [23, 7],
  [23, 6],
  ...Array.from({ length: 6 }, (_, i): [number, number] => [CANTO.x, CANTO.y + 1 + i]),
  [5, 16],
  [5, 17],
];

// O quadro `brisa`: 0 é o ramo parado; 1 mexe a ponta das folhas de ordem par, 2 a das ímpares.
// Só a ponta (a linha ou coluna mais longe do galho) anda, e só um pixel.
function pintarQuadro(brisa: number): string[][] {
  const grade: string[][] = Array.from({ length: ALTURA }, () => Array<string>(LARGURA).fill('.'));
  const pintar = (x: number, y: number, cor: string): void => {
    if (x >= 0 && y >= 0 && x < LARGURA && y < ALTURA) grade[y][x] = cor;
  };
  for (const [x, y] of GALHO) pintar(x, y, 's');
  FOLHAS.forEach((folha, n) => {
    const mexe = brisa > 0 && n % 2 === brisa - 1;
    const h = folha.desenho.length;
    const w = folha.desenho[0].length;
    folha.desenho.forEach((linha, j) =>
      [...linha].forEach((cor, i) => {
        if (cor === '.') return;
        // `cima`: a ponta é a primeira linha, e vai para a direita. `baixo`: a ponta é a última,
        // e vai para a direita também. `lado`: a ponta é a primeira coluna, e sobe.
        const ponta = folha.jeito === 'cima' ? j === 0 : folha.jeito === 'baixo' ? j === h - 1 : i === 0 && w > 1;
        const d = mexe && ponta ? 1 : 0;
        if (folha.jeito === 'lado') pintar(folha.x + i, folha.y + j - d, cor);
        else pintar(folha.x + i + d, folha.y + j, cor);
      }),
    );
  });
  FLOR.desenho.forEach((linha, j) =>
    [...linha].forEach((cor, i) => {
      if (cor !== '.') pintar(FLOR.x + i, FLOR.y + j, cor);
    }),
  );
  // O contorno escuro em volta de tudo: o ramo lê bem em cima da moldura e da floresta.
  const contorno = grade.map((linha) => [...linha]);
  for (let y = 0; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
      if (grade[y][x] !== '.') continue;
      const vizinho = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => grade[y + dy]?.[x + dx] && grade[y + dy][x + dx] !== '.');
      if (vizinho) contorno[y][x] = 'o';
    }
  }
  return contorno;
}

// Monta a tira dos três quadros e a entrega ao CSS. Chamar uma vez, antes da tela inicial.
export function prepararRamos(): void {
  const canvas = novoCanvas(LARGURA * QUADROS, ALTURA);
  const ctx = contexto2d(canvas);
  for (let q = 0; q < QUADROS; q++) {
    pintarQuadro(q).forEach((linha, y) =>
      linha.forEach((cor, x) => {
        if (cor === '.') return;
        ctx.fillStyle = CORES[cor];
        ctx.fillRect(q * LARGURA + x, y, 1, 1);
      }),
    );
  }
  document.documentElement.style.setProperty('--ramo', `url("${canvas.toDataURL()}")`);
}
