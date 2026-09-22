const CORES_FUNDO = {
  colinaLongeCorpo: '#84b184',
  colinaLongeTopo: '#9bc396',
  colinaPertoCorpo: '#3f8438',
  colinaPertoTopo: '#57a544',
};

const SPRITE_NUVEM = [
  '....WWWW....',
  '..WWWWWWWW..',
  '.WWWWWWWWWW.',
  'WWWWWWWWWWWW',
  '.SSSSSSSSSS.',
];

const PALETA_NUVEM = {
  W: '#ffffff',
  S: '#d6e7f4',
};

const SPRITE_PASSARO = [
  '.KK.KK.',
  'K..K..K',
];

const PALETA_PASSARO = {
  K: '#40506a',
};

const SPRITE_ARVORE = [
  '...LLLLL...',
  '..LLGGGGL..',
  '.LLGGGGGGD.',
  'LLGGGGGGGDD',
  'LGGGGGGGGDD',
  'LGGGGGGGGDD',
  '.LGGGGGGDD.',
  '..DGGGGDD..',
  '...DDGDD...',
  '....TT.....',
  '....TT.....',
  '....Tt.....',
  '...TTTT....',
];

const SPRITE_MATO = [
  '..LLL..',
  '.LGGGL.',
  'LGGGGGL',
  'DGGGGGD',
];

const SPRITE_PLANTA = [
  '..F..',
  '.FFF.',
  '..S..',
  '.LSL.',
  '..S..',
];

const PALETA_VEGETACAO = {
  L: '#6fc25c',
  G: '#4a9440',
  D: '#2f6b31',
  T: '#5e3719',
  t: '#43260f',
  S: '#3b8f2e',
  F: '#e8637a',
};

// Árvores pequenas apoiadas na superfície da colina da frente.
const ARVORES_COLINA = [30, 78, 132, 196, 258, 312, 366, 430];

// Vegetação na linha do chão: `x` é o centro do sprite.
const ARVORES_CHAO = [
  { x: 24, escala: 2 },
  { x: 268, escala: 2 },
  { x: 446, escala: 2 },
];

const MATOS_CHAO = [
  { x: 96, escala: 2 },
  { x: 190, escala: 2 },
  { x: 330, escala: 2 },
  { x: 410, escala: 1 },
];

const PLANTAS_CHAO = [
  { x: 46, escala: 2 },
  { x: 140, escala: 2 },
  { x: 232, escala: 1 },
  { x: 300, escala: 2 },
  { x: 378, escala: 2 },
  { x: 462, escala: 1 },
];

const NUVENS = [
  { x: 36, y: 38, escala: 2 },
  { x: 140, y: 20, escala: 3 },
  { x: 244, y: 54, escala: 2 },
  { x: 320, y: 30, escala: 2 },
  { x: 398, y: 88, escala: 2 },
];

const PASSAROS = [
  { x: 118, y: 78, escala: 2 },
  { x: 140, y: 88, escala: 1 },
  { x: 156, y: 70, escala: 1 },
  { x: 296, y: 98, escala: 2 },
  { x: 318, y: 108, escala: 1 },
];

// Perfil de picos: para cada coluna guarda a altura acima da base (o maior pico vence).
function perfilColinas(largura, aleatorio, alturaMin, alturaMax, baseMin, baseMax) {
  const perfil = new Array(largura).fill(0);
  let x = -30;
  while (x < largura + 30) {
    const meiaBase = baseMin + Math.floor(aleatorio() * (baseMax - baseMin));
    const altura = alturaMin + Math.floor(aleatorio() * (alturaMax - alturaMin));
    for (let i = -meiaBase; i <= meiaBase; i++) {
      const coluna = x + meiaBase + i;
      if (coluna < 0 || coluna >= largura) continue;
      const h = Math.round(altura * (1 - Math.abs(i) / meiaBase));
      if (h > perfil[coluna]) perfil[coluna] = h;
    }
    // Avança menos que a base inteira para os morros se sobreporem.
    x += meiaBase + Math.floor(aleatorio() * meiaBase);
  }
  return perfil;
}

function desenharColinas(ctx, perfil, yBase, corpo, topo) {
  perfil.forEach((h, coluna) => {
    if (h <= 0) return;
    const y = yBase - h;
    ctx.fillStyle = corpo;
    ctx.fillRect(coluna, y, 1, h);
    ctx.fillStyle = topo;
    ctx.fillRect(coluna, y, 1, 1);
  });
}

function desenharApoiado(ctx, sprite, centroX, yBase, escala) {
  const largura = sprite.width * escala;
  const altura = sprite.height * escala;
  ctx.drawImage(sprite, Math.round(centroX - largura / 2), yBase - altura, largura, altura);
}

// Pré-renderiza colinas, árvores de fundo, nuvens e pássaros; `yHorizonte` é a linha de apoio.
function criarFundo(largura, yHorizonte) {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = yHorizonte;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Semente fixa: o fundo sai igual em toda carga.
  let semente = 23;
  const aleatorio = () => (semente = (semente * 16807) % 2147483647) / 2147483647;

  const longe = perfilColinas(largura, aleatorio, 50, 78, 26, 46);
  desenharColinas(ctx, longe, yHorizonte, CORES_FUNDO.colinaLongeCorpo, CORES_FUNDO.colinaLongeTopo);

  const perto = perfilColinas(largura, aleatorio, 28, 48, 34, 58);
  desenharColinas(ctx, perto, yHorizonte, CORES_FUNDO.colinaPertoCorpo, CORES_FUNDO.colinaPertoTopo);

  const arvore = criarSprite(SPRITE_ARVORE, PALETA_VEGETACAO);
  ARVORES_COLINA.forEach((x) => {
    // Em vale raso a árvore cairia no nível da grama, sem parecer apoiada na colina.
    if (perto[x] < 10) return;
    desenharApoiado(ctx, arvore, x, yHorizonte - perto[x], 1);
  });

  const nuvem = criarSprite(SPRITE_NUVEM, PALETA_NUVEM);
  NUVENS.forEach(({ x, y, escala }) => {
    ctx.drawImage(nuvem, x, y, nuvem.width * escala, nuvem.height * escala);
  });

  const passaro = criarSprite(SPRITE_PASSARO, PALETA_PASSARO);
  PASSAROS.forEach(({ x, y, escala }) => {
    ctx.drawImage(passaro, x, y, passaro.width * escala, passaro.height * escala);
  });

  return canvas;
}

// Árvores, matos e plantas apoiados na grama; desenhado depois do chão.
function criarVegetacao(largura, altura, yBase) {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // +1 para a base encostar dentro da grama, sem vão.
  const apoio = yBase + 1;

  const arvore = criarSprite(SPRITE_ARVORE, PALETA_VEGETACAO);
  ARVORES_CHAO.forEach(({ x, escala }) => desenharApoiado(ctx, arvore, x, apoio, escala));

  const mato = criarSprite(SPRITE_MATO, PALETA_VEGETACAO);
  MATOS_CHAO.forEach(({ x, escala }) => desenharApoiado(ctx, mato, x, apoio, escala));

  const planta = criarSprite(SPRITE_PLANTA, PALETA_VEGETACAO);
  PLANTAS_CHAO.forEach(({ x, escala }) => desenharApoiado(ctx, planta, x, apoio, escala));

  return canvas;
}
