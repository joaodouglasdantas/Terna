// Gera os sprites dos personagens a partir das folhas de referência (1536x1024, o fundo preto da
// folha original já transparente em fontes/, por ferramentas/tirar-fundo.cjs). Todas as folhas têm o mesmo desenho — fileiras IDLE,
// WALK, RUN, JUMP, FALL… à esquerda e a coluna FRENTE à direita —, então os quadros saem do mesmo
// jeito (recorte-sprite.cjs); cada personagem aponta os quadros dele e a altura no jogo.
//
// Uso (na pasta jogo/): npm run arte:leslie · npm run arte:grow (o Grow, o golem e as águias)
// ou: node ferramentas/gerar-herois.cjs <leslie|grow|golem|aguia|flor>...
// Saída, por folha: apps/cliente/src/assets/<png> (quadros lado a lado) e
// apps/cliente/src/gerado/<nome>-quadros.ts (recortes + eixo do corpo). O Anjo tem o gerador dele
// (gerar-anjo.cjs), que também desenha a forma de anjo.

const fs = require('fs');
const path = require('path');
const { lerPng, escreverPng } = require('./png.cjs');
const { recortarQuadro, reduzir, afiar, contornar, limpar, kmeans, maisProxima, ancoraX } = require('./recorte-sprite.cjs');

const RAIZ = path.join(__dirname, '..');
const CLIENTE = path.join(RAIZ, 'apps', 'cliente', 'src');

// Cada quadro é apontado por um ponto dentro dele na folha. `alturaRef`: a altura em pé daquele
// bloco da folha (a coluna FRENTE foi desenhada maior que as fileiras de lado). `mediana`: o raio
// do filtro que limpa a textura fina antes de reduzir (0 = sem filtro).
//
// Depois de reduzir (média de área), cada quadro é afiado (`afiar`: devolve o contraste de olhos,
// rachaduras e dobras), ganha o contorno escuro de volta (`contorno`: o quanto a borda escurece) e,
// já na paleta, perde pixels soltos e furos de um pixel.
const NITIDEZ = { afiar: 0.5, contorno: 0.6 };
const FOLHAS = {
  // A Leslie, a dríade: 32 px em pé, como o Anjo.
  leslie: {
    fonte: 'leslie.png',
    png: 'leslie.png',
    constante: 'QUADROS_LESLIE',
    alturaEmPe: 32,
    cores: 32, // o verde do cabelo e das folhas tem muitos tons
    mediana: 0,
    animacoes: {
      // Coluna FRENTE: um quadro só no jogo; o outro entra só na conta da paleta.
      parado: { alturaRef: 117, ancora: 'cabeca', quadros: 1, pontos: [[1078, 275], [1078, 150]] },
      // Fileira RUN: passada aberta, as pernas continuam separadas em 32 px.
      andando: {
        alturaRef: 103,
        ancora: 'cabeca',
        pontos: [[159, 310], [249, 310], [337, 310], [424, 310], [515, 310], [609, 310], [711, 310]],
      },
      // Fileira JUMP: os dois quadros subindo, com o corpo esticado.
      subindo: { alturaRef: 103, ancora: 'cabeca', pontos: [[323, 430], [412, 420]] },
      // Fileira FALL: os dois quadros descendo, com as pernas para baixo.
      caindo: { alturaRef: 103, ancora: 'cabeca', pontos: [[438, 570], [531, 570]] },
      // Fileira IDLE: de lado, em pé e com as pernas juntas — parada atacando, o braço do jogo vai
      // por cima. Fora da conta da paleta, como no Anjo.
      atacando: { alturaRef: 103, ancora: 'cabeca', foraDaPaleta: true, pontos: [[155, 75]] },
      // Fileira DIE: ajoelha, cai e fica deitada no chão (quem perdeu a partida).
      morto: { alturaRef: 103, ancora: 'caixa', pontos: [[159, 971], [262, 974], [363, 983], [578, 986]] },
    },
  },
  // O Grow, o metamorfo, na forma humana: 32 px em pé, com o cajado passando um pouco da cabeça.
  grow: {
    fonte: 'grow.png',
    png: path.join('grow', 'base.png'),
    constante: 'QUADROS_GROW',
    alturaEmPe: 32,
    cores: 32,
    mediana: 0, // o cajado é fino: a mediana apagava ele
    animacoes: {
      // Da coluna FRENTE, só os quadros com um cajado (numa mão só): nos outros a folha desenhou dois.
      parado: { alturaRef: 104, ancora: 'cabeca', quadros: 1, pontos: [[1078, 150], [1078, 515]] },
      andando: {
        alturaRef: 90,
        ancora: 'cabeca',
        pontos: [[171, 302], [263, 302], [344, 303], [434, 306], [528, 301], [622, 302], [721, 302]],
      },
      subindo: { alturaRef: 90, ancora: 'cabeca', pontos: [[336, 422], [425, 415]] },
      caindo: { alturaRef: 90, ancora: 'cabeca', pontos: [[453, 552], [547, 559]] },
      atacando: { alturaRef: 90, ancora: 'cabeca', foraDaPaleta: true, pontos: [[173, 73]] },
      morto: { alturaRef: 90, ancora: 'caixa', pontos: [[172, 956], [266, 965], [371, 970], [587, 972]] },
      // A foto do painel: o mesmo quadro de frente do `parado`, um pouco menor (28 px em pé). A
      // folha desenhou o Grow cabeçudo, e com a mesma altura a cabeça dele saía bem maior que a da
      // Leslie na foto; assim as duas cabeças ficam do mesmo tamanho. Fora da conta da paleta.
      retrato: { alturaRef: 104 * (32 / 28), ancora: 'cabeca', foraDaPaleta: true, pontos: [[1078, 150]] },
    },
    // O musgo do cajado (como na folha, onde a ponta tem folhinhas e a pedra verde): reduzido a
    // 32 px, o verde some no marrom. Por quadro, onde fica a pedra da ponta no quadro já reduzido;
    // ali a pedra volta a brilhar verde, o musgo cobre a ponta, saem folhinhas e o cipó desce
    // pelo cabo. Deitado (morto), sem.
    musgo: {
      parado: [[3, 5]],
      andando: [[27, 7], [25, 6], [24, 6], [26, 6], [26, 7], [29, 7], [29, 7]],
      subindo: [[19, 4], [21, 7]],
      caindo: [[19, 6], [18, 7]],
      atacando: [[18, 5]],
      retrato: [[2, 5]],
    },
    // Sem o cajado na mão: no modo arma (armas e soco) ele vai nas costas. A variante sai dos
    // mesmos quadros já reduzidos (sem o musgo), apagando os pixels do cajado — por quadro, as
    // linhas [linha, de, até] — e contornando de escuro onde o corte encostou no corpo. Mesma
    // tabela de quadros, a outra folha.
    semCajado: {
      png: path.join('grow', 'sem-cajado.png'),
      cajado: {
        parado: [
          [[3, 0, 3], [4, 0, 4], [5, 1, 4], [6, 0, 4], [7, 0, 4], [8, 1, 4], [9, 3, 3], [10, 2, 4], [11, 4, 4], [12, 3, 4], [13, 4, 4], [14, 4, 5], [15, 5, 5], [20, 4, 5], [21, 4, 4], [22, 4, 4], [23, 4, 4], [24, 5, 5], [25, 5, 5], [26, 4, 4], [27, 4, 5], [29, 6, 6], [30, 6, 6]],
        ],
        andando: [
          [[4, 25, 28], [5, 25, 30], [6, 25, 30], [7, 25, 30], [8, 25, 30], [9, 25, 30], [10, 25, 28], [11, 25, 27], [12, 24, 27], [13, 24, 25], [14, 24, 25], [15, 23, 24], [16, 23, 24], [17, 22, 23], [18, 22, 23], [19, 22, 23], [20, 22, 22], [21, 22, 22]],
          [[3, 26, 26], [4, 22, 26], [5, 23, 28], [6, 23, 27], [7, 23, 27], [8, 23, 27], [9, 23, 28], [10, 23, 24], [11, 22, 26], [12, 22, 25], [13, 22, 23], [14, 21, 22], [15, 21, 21], [16, 20, 21], [17, 20, 20], [18, 19, 20], [19, 19, 19], [20, 19, 20]],
          [[4, 23, 27], [5, 23, 27], [6, 24, 27], [7, 24, 27], [8, 24, 27], [9, 23, 27], [10, 23, 25], [11, 23, 26], [12, 22, 24], [13, 22, 23], [14, 21, 23], [15, 21, 22], [16, 21, 23], [17, 21, 21], [18, 20, 21], [19, 20, 21], [20, 21, 21], [21, 21, 22], [22, 19, 19], [23, 19, 19]],
          [[4, 25, 27], [5, 25, 29], [6, 25, 28], [7, 25, 28], [8, 25, 29], [9, 25, 29], [10, 24, 26], [11, 23, 26], [12, 23, 26], [13, 23, 24], [14, 23, 23], [15, 22, 23], [16, 22, 22], [17, 21, 22], [18, 21, 21]],
          [[4, 24, 27], [5, 25, 29], [6, 25, 28], [7, 25, 28], [8, 25, 29], [9, 25, 29], [10, 25, 26], [11, 23, 27], [12, 24, 27], [13, 24, 25], [14, 23, 24], [15, 23, 24], [16, 23, 23], [17, 22, 23], [18, 22, 22], [19, 22, 23], [21, 19, 22], [22, 20, 21], [23, 20, 21], [24, 20, 20], [25, 20, 20]],
          [[4, 26, 30], [5, 28, 32], [6, 27, 32], [7, 28, 31], [8, 28, 31], [9, 28, 32], [10, 28, 31], [11, 27, 28], [12, 26, 29], [13, 26, 29], [14, 25, 26], [15, 25, 26], [16, 24, 25], [17, 24, 24], [18, 23, 24], [19, 22, 24], [20, 24, 24]],
          [[4, 27, 28], [5, 27, 32], [6, 27, 32], [7, 28, 31], [8, 28, 31], [9, 28, 32], [10, 28, 31], [11, 27, 28], [12, 26, 29], [13, 26, 29], [14, 26, 26], [15, 25, 26], [16, 24, 25], [17, 23, 25], [18, 23, 24], [19, 22, 24], [20, 23, 24], [21, 22, 23]],
        ],
        subindo: [
          [[2, 16, 20], [3, 17, 21], [4, 17, 22], [5, 17, 22], [6, 16, 21], [7, 15, 21], [8, 14, 19], [9, 16, 20], [10, 17, 19], [11, 15, 18], [12, 15, 17], [13, 16, 17], [14, 16, 17], [15, 15, 16], [16, 15, 15], [17, 15, 15], [18, 15, 15], [19, 15, 16], [20, 15, 15], [21, 15, 15], [23, 14, 14], [24, 14, 14], [25, 14, 14], [26, 14, 14], [27, 14, 14], [28, 13, 14], [29, 13, 14], [30, 13, 14]],
          [[3, 22, 22], [4, 19, 23], [5, 19, 23], [6, 19, 23], [7, 19, 23], [8, 19, 24], [9, 19, 24], [10, 19, 20], [11, 19, 21], [12, 18, 21], [13, 18, 20], [14, 18, 19], [15, 18, 19], [16, 18, 18], [17, 17, 18], [18, 17, 17], [19, 16, 17], [20, 16, 17], [21, 16, 17], [22, 16, 17], [23, 16, 16]],
        ],
        caindo: [
          [[3, 18, 20], [4, 18, 22], [5, 17, 22], [6, 17, 22], [7, 17, 22], [8, 17, 22], [9, 17, 19], [10, 17, 19], [11, 17, 20], [12, 17, 18], [13, 17, 17], [14, 16, 17], [15, 16, 16], [16, 15, 17], [17, 15, 16], [18, 15, 16], [21, 16, 16]],
          [[4, 16, 20], [5, 17, 21], [6, 17, 21], [7, 17, 21], [8, 17, 21], [9, 16, 21], [10, 16, 19], [11, 16, 19], [12, 16, 19], [13, 16, 17], [14, 16, 17], [15, 15, 16], [16, 15, 15], [17, 15, 15], [18, 15, 15], [19, 15, 15], [20, 15, 15], [21, 15, 15]],
        ],
        atacando: [
          [[2, 15, 19], [3, 16, 21], [4, 16, 21], [5, 16, 20], [6, 15, 21], [7, 15, 21], [8, 16, 21], [9, 16, 19], [10, 16, 19], [11, 16, 19], [12, 16, 17], [13, 16, 17], [14, 16, 17], [15, 15, 16], [16, 15, 16], [17, 15, 15], [18, 15, 15], [19, 15, 15], [20, 14, 15], [21, 15, 15], [22, 15, 15], [24, 14, 14], [25, 14, 14], [26, 14, 14], [27, 14, 14], [28, 14, 14]],
        ],
      },
    },
  },
  // O golem de pedra do Grow: bem maior, 46 px em pé.
  golem: {
    fonte: 'golem.png',
    png: path.join('grow', 'golem.png'),
    constante: 'QUADROS_GOLEM',
    alturaEmPe: 46,
    cores: 36, // a pedra e o musgo: muitos tons de bege, marrom e verde
    mediana: 0,
    animacoes: {
      parado: { alturaRef: 104, ancora: 'cabeca', quadros: 1, pontos: [[1079, 258], [1080, 375]] },
      // Fileira WALK (não a RUN): o golem é pesado e anda; na corrida da folha a cabeça ia na
      // frente do corpo e, reduzida, parecia solta dele.
      andando: {
        alturaRef: 91,
        ancora: 'cabeca',
        pontos: [[160, 180], [245, 180], [335, 180], [420, 180], [505, 180], [595, 180], [675, 180], [760, 180]],
      },
      subindo: { alturaRef: 91, ancora: 'cabeca', pontos: [[338, 414], [428, 410]] },
      caindo: { alturaRef: 91, ancora: 'cabeca', pontos: [[450, 545], [545, 546]] },
      atacando: { alturaRef: 91, ancora: 'cabeca', foraDaPaleta: true, pontos: [[167, 70]] },
      morto: { alturaRef: 91, ancora: 'caixa', pontos: [[170, 952], [279, 961], [388, 966], [629, 967]] },
      // A foto do painel: o mesmo quadro de frente do `parado`, mas com 30 px em pé (a Leslie e o
      // Grow têm 32) — assim o golem não parece maior que os outros no quadro e, largo como é,
      // ainda sobra um pixel de cada lado da moldura. Fora da conta da paleta (a folha não muda).
      retrato: { alturaRef: 104 * (46 / 30), ancora: 'caixa', foraDaPaleta: true, pontos: [[1079, 258]] },
    },
  },
  // A Flor Carnívora, a ult da Leslie (a folha "flor carnívora", de fundo xadrez tirado por
  // tirar-fundo.cjs --xadrez): uns 44 px em pé, bem maior que a gente. Olha para a direita.
  // A folha desenhou cada bloco num tamanho; `alturaRef` acerta todos pela cabeça.
  flor: {
    fonte: 'flor.png',
    png: path.join('leslie', 'flor.png'),
    constante: 'QUADROS_FLOR',
    alturaEmPe: 44,
    cores: 32,
    mediana: 0,
    animacoes: {
      parado: { alturaRef: 187, ancora: 'caixa', pontos: [[385, 210]] },
      andando: { alturaRef: 168, ancora: 'caixa', pontos: [[590, 220], [765, 220], [935, 220], [1120, 220]] },
      // Agachada, pronta para cuspir; cuspindo (boca escancarada, a língua para fora).
      cuspindo: { alturaRef: 185, ancora: 'caixa', pontos: [[270, 715], [320, 480]] },
      // Brotando do chão: agachada, antes de ficar de pé.
      brotando: { alturaRef: 185, ancora: 'caixa', pontos: [[110, 715]] },
      // Murchando no fim: debilitada, deitada, e a explosão de veneno.
      murchando: { alturaRef: 168, ancora: 'caixa', pontos: [[945, 735], [1330, 720]] },
    },
  },
  // As águias da Revoada do Grow (a folha "ÁGUIA - MOVIMENTO", de fundo azul-escuro): a fileira VOO,
  // batendo as asas, e a PLANANDO, de asas esticadas. Uns 25 px de altura com as asas em cima.
  aguia: {
    fonte: 'aguia.png',
    png: path.join('grow', 'aguia.png'),
    constante: 'QUADROS_AGUIA',
    alturaEmPe: 25,
    cores: 20,
    mediana: 0,
    animacoes: {
      voo: {
        alturaRef: 140,
        ancora: 'caixa',
        pontos: [[133, 183], [327, 183], [527, 183], [687, 183], [874, 183], [1048, 183], [1241, 183], [1435, 183]],
      },
      planando: {
        alturaRef: 140,
        ancora: 'caixa',
        pontos: [[140, 410], [387, 410], [641, 410], [901, 410], [1155, 410], [1408, 410]],
      },
    },
  },
};

// A folha da Leslie é muito detalhada (cada mecha e cada folha da roupa): reduzida direto para
// 32 px, vira um chuvisco. Antes de reduzir, cada canal passa por uma mediana 5×5 (só entre os
// pixels do desenho): a textura fina some e ficam as manchas grandes — cabelo, rosto, roupa, pele.
function mediana(img, raio) {
  const { largura, altura, px } = img;
  const saida = Buffer.from(px);
  const r = [];
  const g = [];
  const b = [];
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const o = (y * largura + x) * 4;
      if (px[o + 3] < 128) continue;
      r.length = g.length = b.length = 0;
      for (let dy = -raio; dy <= raio; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= altura) continue;
        for (let dx = -raio; dx <= raio; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= largura) continue;
          const q = (yy * largura + xx) * 4;
          if (px[q + 3] < 128) continue;
          r.push(px[q]);
          g.push(px[q + 1]);
          b.push(px[q + 2]);
        }
      }
      const meio = r.length >> 1;
      const numerica = (a, c) => a - c;
      saida[o] = r.sort(numerica)[meio];
      saida[o + 1] = g.sort(numerica)[meio];
      saida[o + 2] = b.sort(numerica)[meio];
    }
  }
  return { largura, altura, px: saida };
}

// O musgo: tons do escuro ao claro, e a pedra da ponta (acesa e a parte de baixo, mais escura).
const MUSGO = [[0x2c, 0x44, 0x20], [0x4a, 0x70, 0x2c], [0x76, 0xa6, 0x40]];
const PEDRA_VERDE = [[0x9c, 0xf0, 0x7c], [0x3c, 0xa0, 0x50]];

// Um "sorteio" fixo por pixel: o mesmo quadro sai sempre igual.
const mistura = (x, y, k) => ((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) & 0xffff;

// Pinta o musgo em volta da pedra (gx, gy) do quadro que está em (x0, 0) da folha, w×h.
function pintarMusgo(folha, larguraFolha, x0, w, h, gx, gy) {
  const o = (x, y) => (y * larguraFolha + x0 + x) * 4;
  const cheio = (x, y) => x >= 0 && x < w && y >= 0 && y < h && folha[o(x, y) + 3] > 0;
  const pintar = (x, y, cor) => {
    folha.set(cor, o(x, y));
    folha[o(x, y) + 3] = 255;
  };
  const novo = [];
  // A ponta: 70% dos pixels em volta da pedra viram musgo (o contorno, bem escuro, fica).
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = gx + dx;
      const y = gy + dy;
      if ((dx === 0 && (dy === 0 || dy === 1)) || !cheio(x, y)) continue;
      const i = o(x, y);
      if ((folha[i] + folha[i + 1] + folha[i + 2]) / 3 < 28) continue;
      if (mistura(x, y, 1) % 100 < 70) novo.push([x, y, MUSGO[[0, 1, 1, 2][mistura(x, y, 2) % 4]]]);
    }
  }
  // Folhinhas para fora: até três pixels na volta de raio 3, encostados na ponta.
  const folhinhas = [];
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = gx + dx;
      const y = gy + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 3 || x < 0 || x >= w || y < 0 || y >= h || cheio(x, y)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => cheio(x + a, y + b))) folhinhas.push([x, y]);
    }
  }
  folhinhas.sort((a, b) => mistura(a[0], a[1], 3) - mistura(b[0], b[1], 3));
  for (const [x, y] of folhinhas.slice(0, 3)) novo.push([x, y, MUSGO[1 + (mistura(x, y, 4) % 2)]]);
  // A pedra acesa.
  novo.push([gx, gy, PEDRA_VERDE[0]]);
  if (cheio(gx, gy + 1)) novo.push([gx, gy + 1, PEDRA_VERDE[1]]);
  for (const [x, y, cor] of novo) pintar(x, y, cor);

  // O cipó descendo pelo cabo: segue o cajado (a parte fina) para baixo e, a cada 5 linhas, um
  // nó de musgo com uma folhinha ao lado (três, no máximo).
  let x = gx;
  let nos = 0;
  for (let y = gy + 3; y < Math.min(h - 3, gy + 22); y++) {
    const fino = (xx) => cheio(xx, y) && (!cheio(xx - 1, y) || !cheio(xx + 1, y));
    const opcoes = [x - 1, x, x + 1].filter(fino);
    if (!opcoes.length) continue;
    x = opcoes.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    if ((y - gy) % 5 !== 0 || nos >= 3) continue;
    pintar(x, y, MUSGO[1]);
    nos++;
    for (const lado of [1, -1]) {
      const xl = x + lado;
      if (!cheio(xl, y) && xl >= 0 && xl < w && mistura(x, y, 5) % 2 === (lado > 0 ? 1 : 0)) {
        pintar(xl, y, MUSGO[nos % 2 ? 2 : 0]);
        break;
      }
    }
  }
}

// Tira do quadro (em `x0` da folha, w×h) os pixels das linhas [linha, de, até] e contorna de
// escuro o que sobrou encostado no corte (o corpo que o cajado tampava fica com borda).
const CONTORNO_DO_CORTE = [26, 17, 12];
function tirarDoQuadro(folha, larguraFolha, x0, w, h, linhas) {
  const o = (x, y) => (y * larguraFolha + x0 + x) * 4;
  const cortado = new Set();
  for (const [y, de, ate] of linhas) {
    for (let x = de; x <= ate; x++) {
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (folha[o(x, y) + 3]) cortado.add(y * w + x);
      folha.fill(0, o(x, y), o(x, y) + 4);
    }
  }
  const escurecer = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = o(x, y);
      if (!folha[i + 3]) continue;
      const encosta = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cortado.has((y + dy) * w + x + dx) && x + dx >= 0 && x + dx < w);
      const luz = folha[i] * 0.3 + folha[i + 1] * 0.59 + folha[i + 2] * 0.11;
      if (encosta && luz > 45) escurecer.push(i);
    }
  }
  for (const i of escurecer) {
    for (let c = 0; c < 3; c++) folha[i + c] = Math.round(folha[i + c] * 0.35 + CONTORNO_DO_CORTE[c] * 0.65);
  }
}

function gerar(nome) {
  const folhaRef = FOLHAS[nome];
  if (!folhaRef) throw new Error(`folha desconhecida: ${nome} (use ${Object.keys(FOLHAS).join(', ')})`);
  const lida = lerPng(path.join(RAIZ, 'fontes', folhaRef.fonte));
  const img = folhaRef.mediana ? mediana(lida, folhaRef.mediana) : lida;
  const reduzidos = [];
  for (const [animacao, anim] of Object.entries(folhaRef.animacoes)) {
    const escala = folhaRef.alturaEmPe / anim.alturaRef;
    anim.pontos.forEach(([x, y], i) => {
      const red = contornar(afiar(reduzir(img, recortarQuadro(img, x, y), escala), NITIDEZ.afiar), NITIDEZ.contorno);
      reduzidos.push({
        nome: animacao,
        red,
        ancora: anim.ancora,
        soPaleta: i >= (anim.quadros ?? Infinity),
        foraDaPaleta: Boolean(anim.foraDaPaleta),
      });
    });
  }

  const amostras = [];
  for (const { red, foraDaPaleta } of reduzidos) {
    if (foraDaPaleta) continue;
    for (let i = 0; i < red.lw * red.lh; i++) {
      if (red.px[i * 4 + 3]) amostras.push([red.px[i * 4], red.px[i * 4 + 1], red.px[i * 4 + 2]]);
    }
  }
  const paleta = kmeans(amostras, folhaRef.cores);
  const naFolha = reduzidos.filter((q) => !q.soPaleta);

  const ESPACO = 1;
  const larguraFolha = naFolha.reduce((s, q) => s + q.red.lw + ESPACO, 0);
  const alturaFolha = Math.max(...naFolha.map((q) => q.red.lh));

  // A folha: cada quadro na paleta, limpo, lado a lado. `semCajado`: a variante, com o cajado
  // tirado (e sem o musgo, que é dele), no mesmo lugar e com o mesmo eixo.
  const montar = (semCajado) => {
    const folha = Buffer.alloc(larguraFolha * alturaFolha * 4);
    const quadros = {};
    let cursor = 0;
    for (const { nome: animacao, red: bruto, ancora } of naFolha) {
      // Na paleta, e depois limpo (pixel solto, furo de um pixel).
      const red = { lw: bruto.lw, lh: bruto.lh, px: Float32Array.from(bruto.px) };
      for (let i = 0; i < red.lw * red.lh; i++) {
        if (!red.px[i * 4 + 3]) continue;
        const cor = paleta[maisProxima(paleta, [red.px[i * 4], red.px[i * 4 + 1], red.px[i * 4 + 2]])];
        red.px.set(cor, i * 4);
      }
      limpar(red, paleta);
      for (let y = 0; y < red.lh; y++) {
        for (let x = 0; x < red.lw; x++) {
          const i = (y * red.lw + x) * 4;
          if (!red.px[i + 3]) continue;
          const cor = paleta[maisProxima(paleta, [red.px[i], red.px[i + 1], red.px[i + 2]])];
          const o = (y * larguraFolha + cursor + x) * 4;
          folha[o] = cor[0];
          folha[o + 1] = cor[1];
          folha[o + 2] = cor[2];
          folha[o + 3] = 255;
        }
      }
      const indice = quadros[animacao]?.length ?? 0;
      const ax = Math.round(ancoraX(red, ancora)); // antes de cortar: o corpo não pula ao trocar de folha
      if (semCajado) {
        const linhas = folhaRef.semCajado.cajado[animacao]?.[indice];
        if (linhas) tirarDoQuadro(folha, larguraFolha, cursor, red.lw, red.lh, linhas);
      } else {
        const ponta = folhaRef.musgo?.[animacao]?.[indice];
        if (ponta) pintarMusgo(folha, larguraFolha, cursor, red.lw, red.lh, ponta[0], ponta[1]);
      }
      // A pedra da ponta do cajado (o Grow): de onde os poderes saem, no modo poderes.
      const pedra = !semCajado && folhaRef.musgo?.[animacao]?.[indice];
      (quadros[animacao] ||= []).push({ x: cursor, y: 0, w: red.lw, h: red.lh, ax, ...(pedra ? { pedra } : {}) });
      cursor += red.lw + ESPACO;
    }
    return { folha, quadros };
  };

  const { folha, quadros } = montar(false);
  const saidaPng = path.join(CLIENTE, 'assets', folhaRef.png);
  fs.mkdirSync(path.dirname(saidaPng), { recursive: true });
  escreverPng(saidaPng, larguraFolha, alturaFolha, folha);
  if (folhaRef.semCajado) {
    const saida = path.join(CLIENTE, 'assets', folhaRef.semCajado.png);
    escreverPng(saida, larguraFolha, alturaFolha, montar(true).folha);
    console.log(`  sem o cajado -> ${path.relative(RAIZ, saida)}`);
  }
  fs.writeFileSync(
    path.join(CLIENTE, 'gerado', `${nome}-quadros.ts`),
    `// Gerado por ferramentas/gerar-herois.cjs a partir de fontes/${folhaRef.fonte} — não editar à mão.\n` +
      `// x/y/w/h: recorte em assets/${folhaRef.png.split(path.sep).join('/')}; ax: eixo do corpo (os pés ficam na base do recorte)` +
      (folhaRef.musgo ? `;\n// pedra: a ponta do cajado no quadro (quem tem).\n` : `.\n`) +
      (folhaRef.semCajado ? `// A mesma tabela vale para assets/${folhaRef.semCajado.png.split(path.sep).join('/')}.\n` : '') +
      `export const ${folhaRef.constante} = ${JSON.stringify(quadros, null, 2)};\n`,
  );
  console.log(`${naFolha.length} quadros -> ${path.relative(RAIZ, saidaPng)} (${larguraFolha}x${alturaFolha})`);
}

const pedidos = process.argv.slice(2);
for (const nome of pedidos.length ? pedidos : Object.keys(FOLHAS)) gerar(nome);
