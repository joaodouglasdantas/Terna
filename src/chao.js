const TILE = 16;

// Verdes e marrons puxados das árvores e colinas de assets/cenario.png, para o chão
// conversar com o resto da cena.
const CORES_CHAO = {
  gramaBrilho: '#9ad65e',
  gramaClara: '#63b84a',
  grama: '#3f9a3e',
  gramaMedia: '#2f8238',
  gramaEscura: '#1f6630',
  terraClara: '#9a6a45',
  terra: '#7a5034',
  terraMedia: '#66412a',
  terraEscura: '#4f3121',
  terraFunda: '#3a2418',
  sombra: '#2c1b12',
  raiz: '#8e6a4a',
  pedraClara: '#b5aea5',
  pedra: '#8a857f',
  pedraEscura: '#5d5853',
};

const CORES_FLORES = ['#f4f1e8', '#ffd54a', '#f28bb0'];
const MIOLO_FLOR = '#e8a93a';

// Matriz de Bayer 4x4: pontilhado ordenado para os degradês da terra.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Pedras: luz em cima à esquerda (L), corpo (P) e sombra embaixo à direita (D).
const PEDRAS = [
  ['LP', 'PD'],
  ['.LP.', 'LPPD', '.DD.'],
  ['.LLP.', 'LPPPD', 'PPPDD', '.DDD.'],
];

// Pré-renderiza o chão uma vez; `folgaTufos` é o espaço acima da grama para tufos e flores.
function criarChao(largura, alturaChao, folgaTufos = 4) {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = alturaChao + folgaTufos;
  const ctx = canvas.getContext('2d');
  const altura = canvas.height;

  // Semente fixa: o chão sai igual em toda carga, sem "piscar".
  let semente = 7;
  const aleatorio = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
  const inteiro = (max) => Math.floor(aleatorio() * max);
  const ponto = (x, y, cor) => {
    ctx.fillStyle = cor;
    ctx.fillRect(x, y, 1, 1);
  };

  const topoGrama = folgaTufos;
  const espessuraGrama = 6;
  const topoTerra = topoGrama + espessuraGrama;

  // Borda de baixo da grama, coluna a coluna: reta com escorridos arredondados.
  const fundoGrama = new Array(largura).fill(topoTerra);
  for (let x = inteiro(6); x < largura; x += 7 + inteiro(10)) {
    const larguraEscorrido = 3 + inteiro(5);
    const comprimento = 1 + inteiro(4);
    for (let i = 0; i < larguraEscorrido && x + i < largura; i++) {
      const t = ((i + 0.5) / larguraEscorrido) * 2 - 1;
      fundoGrama[x + i] = Math.max(fundoGrama[x + i], topoTerra + Math.round(comprimento * (1 - t * t)));
    }
  }

  // Terra escurecendo com a profundidade, em faixas pontilhadas em vez de cor chapada.
  const niveis = [CORES_CHAO.terra, CORES_CHAO.terra, CORES_CHAO.terraMedia, CORES_CHAO.terraEscura];
  for (let y = topoTerra; y < altura; y++) {
    const v = ((y - topoTerra) / (altura - topoTerra)) * (niveis.length - 1);
    const base = Math.min(Math.floor(v), niveis.length - 2);
    for (let x = 0; x < largura; x++) {
      ponto(x, y, (v - base) * 16 > BAYER[y % 4][x % 4] ? niveis[base + 1] : niveis[base]);
    }
  }

  // Veios: camadas onduladas e interrompidas, com a linha clara em cima e a sombra embaixo.
  for (let camada = 0; camada < 3; camada++) {
    const y0 = topoTerra + 9 + camada * 11 + inteiro(3);
    const fase = aleatorio() * 10;
    let ligado = aleatorio() < 0.5;
    for (let x = 0; x < largura; x++) {
      if (aleatorio() < 0.07) ligado = !ligado;
      if (!ligado) continue;
      const y = y0 + Math.round(1.5 * Math.sin(x / 17 + fase));
      if (y + 1 >= altura) continue;
      ponto(x, y, camada === 0 ? CORES_CHAO.terraClara : CORES_CHAO.terra);
      ponto(x, y + 1, CORES_CHAO.terraFunda);
    }
  }

  // Grãos soltos: furinhos escuros e pontos de luz.
  const alturaTerra = altura - topoTerra;
  for (let i = 0; i < (largura * alturaTerra) / 14; i++) {
    const x = inteiro(largura);
    const y = topoTerra + 3 + inteiro(alturaTerra - 3);
    const r = aleatorio();
    if (r < 0.4) {
      ponto(x, y, CORES_CHAO.terraFunda);
    } else if (r < 0.65) {
      ctx.fillStyle = CORES_CHAO.terraEscura;
      ctx.fillRect(x, y, 2, 1);
    } else if (r < 0.9) {
      ponto(x, y, CORES_CHAO.terraClara);
    } else {
      ponto(x, y, CORES_CHAO.sombra);
    }
  }

  // Pedras com volume: cada uma projeta uma linha de sombra logo abaixo.
  const coresPedra = { L: CORES_CHAO.pedraClara, P: CORES_CHAO.pedra, D: CORES_CHAO.pedraEscura };
  for (let i = 0; i < largura / 22; i++) {
    const forma = PEDRAS[aleatorio() < 0.5 ? 0 : aleatorio() < 0.7 ? 1 : 2];
    const x0 = inteiro(largura - forma[0].length);
    const y0 = topoTerra + 5 + inteiro(alturaTerra - 6 - forma.length);
    forma.forEach((linha, dy) => {
      [...linha].forEach((simbolo, dx) => {
        if (coresPedra[simbolo]) ponto(x0 + dx, y0 + dy, coresPedra[simbolo]);
      });
    });
    ctx.fillStyle = CORES_CHAO.terraFunda;
    ctx.fillRect(x0 + 1, y0 + forma.length, forma[0].length - 1, 1);
  }

  // Sombra que a grama projeta na terra logo abaixo da borda.
  for (let x = 0; x < largura; x++) {
    ponto(x, fundoGrama[x], CORES_CHAO.sombra);
    if ((x + fundoGrama[x]) % 2) ponto(x, fundoGrama[x] + 1, CORES_CHAO.terraFunda);
  }

  // Raízes finas saindo de baixo da grama e descendo tortas.
  for (let i = 0; i < largura / 30; i++) {
    let x = inteiro(largura);
    let y = fundoGrama[x] + 1;
    const comprimento = 4 + inteiro(7);
    for (let passo = 0; passo < comprimento && y < altura; passo++, y++) {
      ponto(x, y, CORES_CHAO.raiz);
      if (aleatorio() < 0.35) x = Math.max(0, Math.min(largura - 1, x + (aleatorio() < 0.5 ? -1 : 1)));
      if (aleatorio() < 0.12) ponto(x + 1, y, CORES_CHAO.raiz);
    }
  }

  // Corpo da grama: topo iluminado, meio texturizado e base escurecendo até a borda.
  for (let x = 0; x < largura; x++) {
    for (let y = topoGrama; y < fundoGrama[x]; y++) {
      const d = y - topoGrama;
      let cor = CORES_CHAO.grama;
      if (d === 0) cor = aleatorio() < 0.3 ? CORES_CHAO.gramaBrilho : CORES_CHAO.gramaClara;
      else if (d === 1) cor = x % 2 ? CORES_CHAO.gramaClara : CORES_CHAO.grama;
      else if (y === fundoGrama[x] - 1) cor = CORES_CHAO.gramaEscura;
      else if (d >= espessuraGrama - 2) cor = (x + y) % 2 ? CORES_CHAO.gramaMedia : CORES_CHAO.grama;
      ponto(x, y, cor);
    }
  }

  // Folhas desenhadas no corpo: risco escuro de 2px com a ponta clara em cima.
  for (let x = 0; x < largura; x++) {
    if (aleatorio() > 0.35) continue;
    const y = topoGrama + 2 + inteiro(espessuraGrama - 3);
    if (y + 1 >= fundoGrama[x] - 1) continue;
    ponto(x, y - 1, CORES_CHAO.gramaClara);
    ctx.fillStyle = CORES_CHAO.gramaMedia;
    ctx.fillRect(x, y, 1, 2);
  }

  // Touceiras acima da faixa: 2 a 4 folhas em leque, as de fora inclinadas para os lados.
  for (let x = 0; x < largura; x++) {
    if (aleatorio() > 0.12) continue;
    const folhas = 2 + inteiro(3);
    for (let j = 0; j < folhas; j++) {
      const deslocamento = j - Math.floor(folhas / 2);
      const alt = 1 + inteiro(folgaTufos);
      const bx = x + deslocamento;
      for (let k = 1; k <= alt; k++) {
        // A ponta das folhas externas pende 1px para fora.
        const px = k === alt && alt > 2 && deslocamento ? bx + Math.sign(deslocamento) : bx;
        if (px < 0 || px >= largura) continue;
        const cor = k === alt ? CORES_CHAO.gramaBrilho : k === 1 ? CORES_CHAO.grama : CORES_CHAO.gramaClara;
        ponto(px, topoGrama - k, cor);
      }
    }
  }

  // Florzinhas raras: caule de 2px e flor em cruz com miolo.
  if (folgaTufos >= 4) {
    for (let x = 6 + inteiro(20); x < largura - 2; x += 28 + inteiro(40)) {
      const cor = CORES_FLORES[inteiro(CORES_FLORES.length)];
      ponto(x, topoGrama - 1, CORES_CHAO.gramaMedia);
      ponto(x, topoGrama - 2, CORES_CHAO.gramaMedia);
      ponto(x - 1, topoGrama - 3, cor);
      ponto(x + 1, topoGrama - 3, cor);
      ponto(x, topoGrama - 4, cor);
      ponto(x, topoGrama - 3, MIOLO_FLOR);
    }
  }

  return canvas;
}
