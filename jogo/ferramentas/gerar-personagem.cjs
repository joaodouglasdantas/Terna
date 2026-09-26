// Gera o sprite do personagem a partir da folha de referência SpriteBase.png.
// Uso (na pasta jogo/): npm run arte:personagem
// Saída: apps/cliente/src/assets/personagem.png (quadros lado a lado), personagem-anjo.png
// (a forma de anjo, nos mesmos lugares) e apps/cliente/src/gerado/personagem-quadros.ts
// (recortes + âncoras).

const fs = require('fs');
const path = require('path');
const { lerPng, escreverPng } = require('./png.cjs');

const RAIZ = path.join(__dirname, '..');
const FONTE = path.join(RAIZ, 'fontes', 'SpriteBase.png');
const CLIENTE = path.join(RAIZ, 'apps', 'cliente', 'src');
const SAIDA_PNG = path.join(CLIENTE, 'assets', 'personagem.png');
const SAIDA_ANJO = path.join(CLIENTE, 'assets', 'personagem-anjo.png');
const SAIDA_JS = path.join(CLIENTE, 'gerado', 'personagem-quadros.ts');

const ALTURA_EM_PE = 32; // altura do personagem parado no jogo, em pixels
const OPACO = 128; // alfa mínimo para um pixel da folha contar como personagem
const CORES = 24;

// Cada quadro é apontado por um ponto dentro dele na folha (1536x1024).
// As fileiras da esquerda e a coluna "FRENTE" foram desenhadas em escalas diferentes;
// `alturaRef` é a altura em pé daquele bloco, usada para igualar as duas.
const ANIMACOES = {
  // Coluna FRENTE da folha: parado, o personagem olha para a tela. Vai um quadro só para o jogo
  // (`quadros: 1`) — ele não respira: os quadros dessa coluna foram desenhados um a um e,
  // alternando, o desenho tremia. O segundo continua na conta da paleta, para as cores de
  // todos os quadros não mudarem.
  parado: { alturaRef: 109, ancora: 'cabeca', frente: true, quadros: 1, pontos: [[1076, 150], [1076, 277]] },
  // Fileira RUN da folha: a da WALK tem passo curto e, em 32px, as pernas escuras se fundem
  // num bloco só; aqui a passada é aberta e as pernas continuam separadas no tamanho do jogo.
  andando: {
    alturaRef: 98,
    ancora: 'cabeca',
    pontos: [[166, 312], [253, 312], [335, 312], [420, 311], [513, 311], [604, 312], [702, 312]],
  },
  subindo: { alturaRef: 98, ancora: 'cabeca', pontos: [[322, 430], [410, 420]] },
  caindo: { alturaRef: 98, ancora: 'cabeca', pontos: [[530, 570], [626, 570]] },
  // Fileira IDLE da folha: de lado e em pé, com as pernas juntas. Parado atacando (ou soltando um
  // poder), o corpo vira para o lado da mira sem a passada da corrida; o braço que ataca o jogo
  // desenha por cima. Fica fora da conta da paleta (`foraDaPaleta`): as cores dos outros quadros
  // continuam as mesmas, e este usa as mais próximas delas.
  atacando: { alturaRef: 98, ancora: 'cabeca', foraDaPaleta: true, pontos: [[160, 80]] },
  // Deitado: o personagem não deita mais, então nenhum quadro vai para o jogo (`quadros: 0`);
  // a fileira continua só na conta da paleta, para as cores dos outros quadros não mudarem.
  deitado: { alturaRef: 98, ancora: 'caixa', quadros: 0, pontos: [[468, 985], [575, 985]] },
};

// Inunda a partir do ponto e devolve a caixa do personagem; a vizinhança de 2px junta
// mechas de cabelo e cadarços que ficam soltos por um pixel semitransparente.
function recortarQuadro(img, px0, py0) {
  const { largura, altura, px } = img;
  const opaco = (x, y) => px[(y * largura + x) * 4 + 3] >= OPACO;
  let inicio = -1;
  for (let r = 0; r < 30 && inicio < 0; r++) {
    for (let dy = -r; dy <= r && inicio < 0; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (opaco(px0 + dx, py0 + dy)) {
          inicio = (py0 + dy) * largura + px0 + dx;
          break;
        }
      }
    }
  }
  if (inicio < 0) throw new Error(`nenhum quadro perto de (${px0}, ${py0})`);

  const visto = new Uint8Array(largura * altura);
  const pilha = [inicio];
  visto[inicio] = 1;
  let x0 = largura;
  let y0 = altura;
  let x1 = 0;
  let y1 = 0;
  while (pilha.length) {
    const p = pilha.pop();
    const x = p % largura;
    const y = (p / largura) | 0;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= largura || ny >= altura) continue;
        const q = ny * largura + nx;
        if (!visto[q] && opaco(nx, ny)) {
          visto[q] = 1;
          pilha.push(q);
        }
      }
    }
  }
  return { x0, y0, x1, y1, mascara: visto };
}

// Reduz por média de área, só com os pixels opacos, para a borda semitransparente não sujar a cor.
function reduzir(img, quadro, escala) {
  const { largura, px } = img;
  const lw = Math.ceil((quadro.x1 - quadro.x0 + 1) * escala);
  const lh = Math.ceil((quadro.y1 - quadro.y0 + 1) * escala);
  const saida = new Float32Array(lw * lh * 4);
  const passo = 1 / escala;
  for (let ty = 0; ty < lh; ty++) {
    for (let tx = 0; tx < lw; tx++) {
      const sx0 = quadro.x0 + tx * passo;
      const sy0 = quadro.y1 + 1 - (lh - ty) * passo;
      let r = 0;
      let g = 0;
      let b = 0;
      let peso = 0;
      let total = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy0 + passo); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx0 + passo); sx++) {
          const cobre =
            Math.max(0, Math.min(sx + 1, sx0 + passo) - Math.max(sx, sx0)) *
            Math.max(0, Math.min(sy + 1, sy0 + passo) - Math.max(sy, sy0));
          if (!cobre) continue;
          total += cobre;
          if (sx < quadro.x0 || sx > quadro.x1 || sy < quadro.y0 || sy > quadro.y1) continue;
          const i = sy * largura + sx;
          if (!quadro.mascara[i]) continue;
          r += px[i * 4] * cobre;
          g += px[i * 4 + 1] * cobre;
          b += px[i * 4 + 2] * cobre;
          peso += cobre;
        }
      }
      const o = (ty * lw + tx) * 4;
      if (peso / total >= 0.45) {
        saida[o] = r / peso;
        saida[o + 1] = g / peso;
        saida[o + 2] = b / peso;
        saida[o + 3] = 255;
      }
    }
  }
  return { lw, lh, px: saida };
}

function kmeans(amostras, k) {
  const ordenadas = [...amostras].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centros = Array.from({ length: k }, (_, i) => [...ordenadas[Math.floor(((i + 0.5) * ordenadas.length) / k)]]);
  for (let volta = 0; volta < 30; volta++) {
    const soma = centros.map(() => [0, 0, 0, 0]);
    for (const a of amostras) {
      const c = maisProxima(centros, a);
      soma[c][0] += a[0];
      soma[c][1] += a[1];
      soma[c][2] += a[2];
      soma[c][3]++;
    }
    centros = soma.map((s, i) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centros[i]));
  }
  return centros.map((c) => c.map(Math.round));
}

function maisProxima(centros, cor) {
  let melhor = 0;
  let menor = Infinity;
  centros.forEach((c, i) => {
    const d = (c[0] - cor[0]) ** 2 + (c[1] - cor[1]) ** 2 + (c[2] - cor[2]) ** 2;
    if (d < menor) {
      menor = d;
      melhor = i;
    }
  });
  return melhor;
}

// Âncora horizontal = centro da cabeça (topo do quadro): o tronco balança no andar e
// a caixa muda de largura com as pernas, mas a cabeça fica no mesmo eixo.
function ancoraX(red, modo) {
  if (modo === 'caixa') return red.lw / 2;
  const limite = Math.max(1, Math.round(red.lh * 0.35));
  let soma = 0;
  let n = 0;
  for (let y = 0; y < limite; y++) {
    for (let x = 0; x < red.lw; x++) {
      if (red.px[(y * red.lw + x) * 4 + 3]) {
        soma += x + 0.5;
        n++;
      }
    }
  }
  return soma / n;
}

const img = lerPng(FONTE);
const reduzidos = [];
for (const [nome, anim] of Object.entries(ANIMACOES)) {
  const escala = ALTURA_EM_PE / anim.alturaRef;
  anim.pontos.forEach(([x, y], i) => {
    const red = reduzir(img, recortarQuadro(img, x, y), escala);
    reduzidos.push({
      nome,
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
const paleta = kmeans(amostras, CORES);
const naFolha = reduzidos.filter((q) => !q.soPaleta);

const ESPACO = 1;
const larguraFolha = naFolha.reduce((s, q) => s + q.red.lw + ESPACO, 0);
const alturaFolha = Math.max(...naFolha.map((q) => q.red.lh));
const folha = Buffer.alloc(larguraFolha * alturaFolha * 4);
const quadros = {};
let cursor = 0;
for (const { nome, red, ancora } of naFolha) {
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
  (quadros[nome] ||= []).push({ x: cursor, y: 0, w: red.lw, h: red.lh, ax: Math.round(ancoraX(red, ancora)) });
  cursor += red.lw + ESPACO;
}

// ---- Forma de anjo ----
// Mesmos quadros, redesenhados: sem moletom, calça nem tênis. O corpo vira pele lisa (a mesma
// paleta do rosto e das mãos, um tom mais clara que a original); as pernas perdem a sobra da
// calça e do tênis, e de lado a parte de cima do corpo é refeita (o tronco do moletom era um
// bloco). O quadril fica só pele, sem detalhe: por cima dele o jogo desenha uma tarja de
// mosaico, como a dos Sims. O cabelo cresce até os ombros, de lado. A tarja, os olhos
// (corações), as asas, o brilho e os corações em volta são desenhados no jogo por cima
// (entidades/anjo.ts), presos às âncoras abaixo.

const pele = (r, g, b) => r > 90 && r - b > 25;
const quente = (r, g, b) => r - b >= 6; // cabelo e sombra da pele; o pano é cinza-frio
const luminancia = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const suavizar = (de, ate, v) => {
  const t = Math.max(0, Math.min(1, (v - de) / (ate - de)));
  return t * t * (3 - 2 * t);
};

const PELE = { sombra: [176, 118, 96], media: [212, 160, 132], clara: [236, 194, 166], luz: [250, 218, 194] };
// Pele original (rosto e mãos) → pele do anjo, pela luminância: tudo um tom mais claro.
const tomDePele = (lum) => (lum < 85 ? PELE.sombra : lum < 115 ? PELE.media : lum < 155 ? PELE.clara : PELE.luz);
const ALTURA_QUADRIL = 2; // linhas do quadril: da barra do moletom até a calça
const TARJA = { largura: 6, altura: 4 }; // caixa do mosaico (uma faixa), em blocos de 2 px
const CABELO = { mecha: [47, 34, 34], brilho: [75, 48, 43], ponta: [30, 23, 24] };
const CABECA_A_FRENTE = 1; // de lado: quanto o centro da cabeça fica à frente do meio dos ombros

// `fonte` (opcional): o quadro já com a cabeça recuada `recuo` px (ver abaixo), no lugar da folha.
function formaDeAnjo(q, deFrente, fonte = null, recuo = 0) {
  const { x: fx, w, h, ax } = q;
  const em = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const cor = (x, y) => {
    const [px, o] = fonte ? [fonte, (y * w + x) * 4] : [folha, (y * larguraFolha + fx + x) * 4];
    return px[o + 3] ? [px[o], px[o + 1], px[o + 2]] : null;
  };
  const tipo = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const c = cor(x, y);
      if (!c) return '';
      if (pele(...c)) return 'pele';
      return quente(...c) ? 'quente' : 'pano';
    }),
  );

  // Cabelo: a mancha quente que começa no alto da cabeça.
  const cabelo = new Set();
  const pilha = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (tipo[y][x] === 'quente' && y <= 4) pilha.push([x, y]);
    }
  }
  while (pilha.length) {
    const [x, y] = pilha.pop();
    const k = y * w + x;
    if (!em(x, y) || cabelo.has(k) || tipo[y][x] !== 'quente') continue;
    cabelo.add(k);
    pilha.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  const vizinhoPele = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (em(x + dx, y + dy) && tipo[y + dy][x + dx] === 'pele') return true;
    }
    return false;
  };
  const vizinhoCabelo = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (cabelo.has((y + dy) * w + x + dx) && em(x + dx, y + dy)) return true;
    }
    return false;
  };

  // Rosto: a pele que encosta no cabelo, e o que estiver ligado a ela. O pescoço é o fim dele.
  const rosto = new Set();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (tipo[y][x] === 'pele' && vizinhoCabelo(x, y)) pilha.push([x, y]);
  }
  while (pilha.length) {
    const [x, y] = pilha.pop();
    const k = y * w + x;
    if (!em(x, y) || rosto.has(k) || tipo[y][x] !== 'pele') continue;
    rosto.add(k);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) pilha.push([x + dx, y + dy]);
  }
  const doRosto = (x, y) => em(x, y) && rosto.has(y * w + x);
  let pescoco = 0;
  for (const k of rosto) pescoco = Math.max(pescoco, (k / w) | 0);

  // Cintura: a primeira linha depois do pescoço em que a calça (cinza mais claro) aparece.
  let cintura = h;
  for (let y = pescoco + 1; y < h && cintura === h; y++) {
    let calca = 0;
    for (let x = 0; x < w; x++) {
      const c = cor(x, y);
      if (c && tipo[y][x] === 'pano' && luminancia(...c) >= 48) calca++;
    }
    if (calca >= 3) cintura = y;
  }
  // O quadril: da linha acima da calça (a barra do moletom) até onde as pernas começam.
  const faixa = cintura - 1;
  const abaixoDaFaixa = faixa + ALTURA_QUADRIL;
  // O meio da calça na cintura: o meio do quadril, de lado.
  const meioDaCalca = (() => {
    let soma = 0;
    let n = 0;
    for (const y of [cintura, cintura + 1]) {
      for (let x = 0; x < w; x++) {
        const c = em(x, y) && cor(x, y);
        if (c && tipo[y][x] === 'pano' && luminancia(...c) >= 48) {
          soma += x;
          n++;
        }
      }
    }
    return n ? soma / n : null;
  })();

  // Quadro de trabalho: cor por pixel (null = transparente).
  const novo = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => cor(x, y)));
  const cabeca = (x, y) => y < pescoco;
  const corpo = (x, y) => novo[y][x] && !cabelo.has(y * w + x) && !cabeca(x, y);
  const mao = (x, y) => tipo[y][x] === 'pele' || (tipo[y][x] === 'quente' && vizinhoPele(x, y));

  // De lado, a cabeça do desenho vai bem à frente do corpo: a forma base corre inclinada, e o
  // volume do moletom disfarçava. Sem ele a cabeça parecia descolar do corpo. Então ela (tudo
  // acima do queixo, mais o rosto) recua até ficar CABECA_A_FRENTE px à frente do meio dos
  // ombros, e o quadro é refeito com ela no lugar novo. O eixo do sprite do anjo recua junto
  // (`axAnjo`): no mapa a cabeça fica onde sempre esteve e o corpo passa a ficar embaixo dela.
  if (!deFrente && !fonte) {
    const meios = [];
    for (let y = pescoco + 1; y <= pescoco + 3 && y < h; y++) {
      const xs = [];
      for (let x = 0; x < w; x++) if (corpo(x, y) && !mao(x, y) && !rosto.has(y * w + x)) xs.push(x);
      if (xs.length) meios.push(xs.reduce((s, x) => s + x, 0) / xs.length);
    }
    // O queixo e o pescoço de pele logo abaixo do rosto vão junto: deixados para trás, viravam
    // pixels soltos na frente do pescoço.
    const queixo = new Set();
    const fila = [...rosto].map((k) => [k % w, (k / w) | 0]);
    while (fila.length) {
      const [qx, qy] = fila.pop();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx;
          const ny = qy + dy;
          const k = ny * w + nx;
          if (!em(nx, ny) || ny < pescoco || ny > pescoco + 2 || queixo.has(k) || rosto.has(k)) continue;
          if (!novo[ny][nx] || !mao(nx, ny)) continue;
          queixo.add(k);
          fila.push([nx, ny]);
        }
      }
    }
    const daCabeca = (x, y) => novo[y][x] && (y < pescoco || rosto.has(y * w + x) || queixo.has(y * w + x));
    let folga = w;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (daCabeca(x, y)) folga = Math.min(folga, x);
    const ombrosX = meios.reduce((s, m) => s + m, 0) / Math.max(1, meios.length);
    const dx = meios.length ? Math.max(0, Math.min(folga, Math.round(ax - ombrosX - CABECA_A_FRENTE))) : 0;
    if (dx > 0) {
      const recuada = Buffer.alloc(w * h * 4);
      // O corpo primeiro, a cabeça por cima, já no lugar novo.
      for (const ehCabeca of [false, true]) {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const c = cor(x, y);
            if (!c || daCabeca(x, y) !== ehCabeca) continue;
            recuada.set([c[0], c[1], c[2], 255], (y * w + x - (ehCabeca ? dx : 0)) * 4);
          }
        }
      }
      return formaDeAnjo(q, deFrente, recuada, dx);
    }
  }
  const eixoCabeca = ax - recuo;

  // Braços: de frente, eles caem rentes ao tronco e só a linha escura da manga os separa. Essa
  // coluna, da axila até a cintura, vira uma linha de sombra da pele: o tronco fica reto e o
  // braço se lê encostado nele. (Um vão transparente afastava demais os braços; abrir só na
  // cintura desenhava uma ampulheta.)
  const vaos = [];
  if (deFrente) {
    // A coluna da manga de cada lado: onde a linha escura mais aparece no tronco.
    const vezes = new Array(w).fill(0);
    const axila = new Array(w).fill(h);
    for (let y = pescoco + 3; y < faixa; y++) {
      for (let x = 1; x < w - 1; x++) {
        const c = cor(x, y);
        if (c && novo[y][x] && novo[y][x - 1] && novo[y][x + 1] && !mao(x, y) && luminancia(...c) < 14) {
          vezes[x]++;
          axila[x] = Math.min(axila[x], y);
        }
      }
    }
    const maisVezes = (de, ate) => {
      let melhor = -1;
      for (let x = de; x < ate; x++) if (vezes[x] >= 2 && (melhor < 0 || vezes[x] > vezes[melhor])) melhor = x;
      return melhor;
    };
    for (const x of [maisVezes(0, ax), maisVezes(ax + 1, w)]) if (x >= 0) vaos.push({ x, axila: axila[x] });
  }

  // Afina as pernas: abaixo da faixa, em cada linha, cada trecho de corpo com 4+ px perde a
  // ponta de cada lado — a sobra da calça e do tênis. A sola (última linha) fica inteira, para o
  // pé ficar plano no chão. Do quadril para cima a silhueta é a da forma base: afinada, ela
  // mudava a proporção do corpo e deixava degraus nos ombros.
  for (let y = abaixoDaFaixa; y < h - 1; y++) {
    let x = 0;
    while (x < w) {
      if (!corpo(x, y)) {
        x++;
        continue;
      }
      let fim = x;
      while (fim + 1 < w && corpo(fim + 1, y)) fim++;
      if (fim - x + 1 >= 4) for (const ponta of [x, fim]) if (!mao(ponta, y)) novo[y][ponta] = null;
      x = fim + 1;
    }
  }
  const linhaDoBraco = (x, y) => vaos.some((v) => x === v.x && y >= v.axila && y < faixa);

  // De lado, a parte de cima do corpo é redesenhada: no original ela é o moletom inteiro (braços
  // e tronco num bloco só), e só recortar o contorno deixava um tronco quadrado ou em "T". O corpo
  // é refeito sobre pontos do próprio quadro:
  // - tronco: reto, 7 px, da linha dos ombros (o meio do moletom logo abaixo da cabeça, sem as
  //   mãos) até o meio do quadril (o meio da calça na cintura). Fica embaixo da parte de trás da
  //   cabeça, como o moletom — preso atrás do queixo, ele virava um pescoço comprido e torto, e a
  //   cabeça parecia descolar. O pescoço é curto (4 px no queixo, 6 px na linha de baixo) e as
  //   costas ganham uma coluna de sombra, para o tronco ter volume;
  // - braços: 2 px de espessura, do alto do tronco a cada mão, dobrados no cotovelo; o da frente
  //   passa por cima do tronco (com uma linha de sombra), o de trás fica atrás e um tom mais escuro;
  // - quadril: 1 px a menos de cada lado. Mãos, cabeça e pernas ficam como estão.
  const bracos = new Map(); // pixel → 'frente' | 'tras'
  const troncoLado = new Set();
  const costasLado = new Set(); // coluna de sombra das costas, dentro do tronco
  if (!deFrente && faixa < h && meioDaCalca !== null) {
    const meioDoMoletom = (y) => {
      let soma = 0;
      let n = 0;
      for (let x = 0; x < w; x++) {
        if (corpo(x, y) && !mao(x, y) && !rosto.has(y * w + x)) {
          soma += x;
          n++;
        }
      }
      return n ? soma / n : null;
    };
    const ombros = [pescoco + 1, pescoco + 2, pescoco + 3].map(meioDoMoletom).filter((m) => m !== null);
    const ombrosX = ombros.length ? ombros.reduce((s, m) => s + m, 0) / ombros.length : meioDaCalca;
    const eixo = (y) => {
      const t = Math.max(0, Math.min(1, (y - pescoco - 1) / Math.max(1, faixa - pescoco - 1)));
      return ombrosX + (meioDaCalca - ombrosX) * t;
    };
    const larguraNa = (y) => (y === pescoco ? 4 : y === pescoco + 1 ? 6 : 7);
    for (let y = pescoco; y < faixa; y++) {
      const esquerda = Math.round(eixo(y) - larguraNa(y) / 2);
      for (let x = esquerda; x < esquerda + larguraNa(y); x++) {
        if (!em(x, y)) continue;
        troncoLado.add(y * w + x);
        if (x === esquerda + 1 && y > pescoco + 1) costasLado.add(y * w + x);
      }
    }

    // Mãos: grupos de pixels de pele (ou da sombra dela) abaixo do queixo.
    const visto = new Set();
    const grupos = [];
    for (let y = pescoco + 2; y < Math.min(h, abaixoDaFaixa + 2); y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (visto.has(k) || rosto.has(k) || !novo[y][x] || !mao(x, y)) continue;
        const grupo = [];
        const fila = [[x, y]];
        visto.add(k);
        while (fila.length) {
          const [gx, gy] = fila.pop();
          grupo.push([gx, gy]);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = gx + dx;
              const ny = gy + dy;
              const nk = ny * w + nx;
              if (!em(nx, ny) || ny < pescoco + 2 || visto.has(nk) || rosto.has(nk) || !novo[ny][nx] || !mao(nx, ny)) continue;
              visto.add(nk);
              fila.push([nx, ny]);
            }
          }
        }
        if (grupo.length >= 2) grupos.push(grupo);
      }
    }

    const ombroP = { x: eixo(pescoco + 2), y: pescoco + 2 };
    const distancia = (px, py, a, b) => {
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / (vx * vx + vy * vy || 1)));
      return Math.hypot(px - (a.x + vx * t), py - (a.y + vy * t));
    };
    for (const grupo of grupos) {
      const maoP = {
        x: grupo.reduce((s, [x]) => s + x, 0) / grupo.length,
        y: grupo.reduce((s, [, y]) => s + y, 0) / grupo.length,
      };
      const lado = maoP.x >= eixo(maoP.y) ? 'frente' : 'tras';
      const cotovelo = { x: ombroP.x + (maoP.x - ombroP.x) * 0.5, y: Math.max(ombroP.y, maoP.y) + 1.5 };
      for (let y = pescoco + 1; y < Math.min(h, abaixoDaFaixa + 2); y++) {
        for (let x = 0; x < w; x++) {
          if (distancia(x + 0.5, y + 0.5, ombroP, cotovelo) > 0.9 && distancia(x + 0.5, y + 0.5, cotovelo, maoP) > 0.9) continue;
          const k = y * w + x;
          if (!bracos.has(k) || lado === 'frente') bracos.set(k, lado);
        }
      }
    }

    for (let y = pescoco; y < faixa; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (cabelo.has(k) || rosto.has(k) || (novo[y][x] && mao(x, y))) continue;
        if (troncoLado.has(k) || bracos.has(k)) {
          if (!novo[y][x]) novo[y][x] = PELE.luz;
          continue;
        }
        novo[y][x] = null;
      }
    }
    for (let y = faixa; y < Math.min(abaixoDaFaixa, h); y++) {
      const xs = [];
      for (let x = 0; x < w; x++) if (corpo(x, y) && !mao(x, y) && !bracos.has(y * w + x)) xs.push(x);
      if (xs.length >= 4) for (const x of [xs[0], xs[xs.length - 1]]) novo[y][x] = null;
    }
  }

  // O capuz: na cabeça, o pano do moletom que não encosta no cabelo nem no rosto sai. Ficam o
  // cabelo e o contorno de 1 px dele — com o capuz em volta, cabelo e capuz formavam um bloco
  // liso, como um capacete.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!cabeca(x, y) || !novo[y][x] || tipo[y][x] !== 'pano' || cabelo.has(y * w + x)) continue;
      let encosta = false;
      for (let dy = -1; dy <= 1 && !encosta; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = (y + dy) * w + x + dx;
          if (em(x + dx, y + dy) && (cabelo.has(k) || rosto.has(k))) encosta = true;
        }
      }
      if (!encosta) novo[y][x] = null;
    }
  }

  // Furos de 1 px que sobram dos recortes (um pixel vazio com 3 ou 4 vizinhos cheios) ganham a
  // cor de um vizinho: no corpo a pintura abaixo refaz a cor da pele; no cabelo, fica cabelo.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (novo[y][x]) continue;
      const cheios = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => novo[y + dy][x + dx]);
      if (cheios.length < 3) continue;
      const [dx, dy] = cheios.find(([cx, cy]) => cabelo.has((y + cy) * w + x + cx)) ?? cheios[0];
      novo[y][x] = novo[y + dy][x + dx];
      if (cabelo.has((y + dy) * w + x + dx)) cabelo.add(y * w + x);
    }
  }

  // De frente, o eixo do corpo (onde espelhar) é a soma média das bordas de cada linha abaixo
  // da cabeça: o desenho não é centrado na coluna do eixo da cabeça.
  let meio = w - 1;
  if (deFrente) {
    let soma = 0;
    let n = 0;
    for (let y = pescoco + 1; y < h; y++) {
      const xs = [];
      for (let x = 0; x < w; x++) if (novo[y][x]) xs.push(x);
      if (xs.length) {
        soma += xs[0] + xs[xs.length - 1];
        n++;
      }
    }
    if (n) meio = Math.round(soma / n);
  }
  // De frente, as pernas vêm da calça, coladas: um vinco suave no eixo, da tarja até os
  // tornozelos, separa uma da outra.
  const vincoDasPernas = (x, y) =>
    deFrente && y >= faixa + TARJA.altura && y < h - 2 && Math.abs(x * 2 + 1 - (meio + 1)) <= 1;

  // Pele lisa: contorno num tom médio, miolo claro; só as linhas mais escuras da roupa (onde o
  // braço se separa do tronco) viram um tom de sombra suave. O rosto segue a própria luz, um tom
  // mais claro. As mãos também, mas nunca abaixo do tom médio — com a sombra escura da manga
  // elas pareciam soltas na ponta do braço claro.
  const borda = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !em(x + dx, y + dy) || !novo[y + dy][x + dx]);
  const tomDaMao = (lum) => (lum < 115 ? PELE.media : lum < 155 ? PELE.clara : PELE.luz);
  const pintura = Array.from({ length: h }, () => new Array(w).fill(null));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = novo[y][x];
      if (!c || cabelo.has(y * w + x)) continue;
      if (rosto.has(y * w + x)) pintura[y][x] = tomDePele(luminancia(...c));
      else if (cabeca(x, y)) continue;
      else if (tipo[y][x] === 'pele') pintura[y][x] = tomDaMao(luminancia(...c));
      else if (mao(x, y)) pintura[y][x] = PELE.media;
      else if (borda(x, y) || linhaDoBraco(x, y)) pintura[y][x] = PELE.media;
      else if (costasLado.has(y * w + x) && !bracos.has(y * w + x)) pintura[y][x] = PELE.clara;
      else if (vincoDasPernas(x, y)) pintura[y][x] = PELE.clara;
      else if (bracos.get(y * w + x) === 'tras' && !troncoLado.has(y * w + x)) pintura[y][x] = PELE.clara;
      else if (bracos.get(y * w + x) === 'frente' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => troncoLado.has((y + dy) * w + x + dx) && !bracos.has((y + dy) * w + x + dx))) pintura[y][x] = PELE.clara;
      else if (troncoLado.size) pintura[y][x] = PELE.luz;
      else pintura[y][x] = luminancia(...c) < 14 ? PELE.clara : PELE.luz;
    }
  }

  // Tarja: a faixa de mosaico sobre o quadril, 6x4 px, no espaço do quadro, começando na linha
  // de cima do quadril: de frente, no eixo do corpo (acertada abaixo, junto com os olhos); de
  // lado, no meio da calça (fixa em relação ao quadril, ela acompanha a corrida sem mudar de
  // tamanho).
  const tarja = [
    deFrente ? null : Math.round((meioDaCalca ?? ax) - TARJA.largura / 2 + 0.5),
    faixa,
    TARJA.largura,
    TARJA.altura,
  ];

  // Cabelo até os ombros, de lado: cada coluna de trás da cabeça desce alguns pixels além de
  // onde terminava, mais comprido quanto mais longe do rosto, em mechas de tamanhos alternados.
  // De frente a cabeça fica igual à da forma base (as mechas dos lados mudavam o rosto).
  if (!deFrente) {
    const fundo = new Array(w).fill(-1);
    for (const k of cabelo) fundo[k % w] = Math.max(fundo[k % w], (k / w) | 0);
    for (let x = 0; x < w; x++) {
      if (fundo[x] < 0) continue;
      const longe = eixoCabeca - 2 - x;
      if (longe < 0) continue;
      const tamanho = Math.min(5, 2 + longe) - (x % 2);
      for (let i = 1; i <= tamanho; i++) {
        const y = fundo[x] + i;
        if (y >= h || doRosto(x, y)) break;
        novo[y][x] = [0, 0, 0];
        pintura[y][x] = i === tamanho ? CABELO.ponta : i === 1 && x % 3 === 0 ? CABELO.brilho : CABELO.mecha;
      }
    }
  }

  // Pontas desfiadas: a borda de fora do cabelo era um oval liso, como um capacete. Na metade
  // de baixo da cabeça, cerca de 2 em cada 5 pixels da borda ganham uma ponta de mecha de 1 ou
  // 2 px para fora (para baixo, ou para o lado); na de cima, 1 em cada 5 ganha um tufo de 1 px
  // (para cima, ou para o lado). As pontas levam a cor do
  // próprio contorno; nada a menos de 3 px do rosto, que fica igual ao da forma base. Depois, o
  // contorno de cima do cabelo (onde bate a luz) passa de quase preto para o marrom das mechas —
  // o contorno escuro por igual, em volta da cabeça toda, é que fazia a casca do capacete — e,
  // logo abaixo dele, um brilho em fios (com falhas entre as mechas) dá volume ao cabelo.
  if (cabelo.size) {
    let somaY = 0;
    let somaX = 0;
    for (const k of cabelo) {
      somaX += k % w;
      somaY += (k / w) | 0;
    }
    const cx = somaX / cabelo.size;
    const cy = somaY / cabelo.size;
    const pertoDoRosto = (x, y) => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (doRosto(x + dx, y + dy)) return true;
      return false;
    };
    const pontas = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = pintura[y][x] || novo[y][x];
        if (!c || luminancia(...c) >= 90 || !(cabeca(x, y) || cabelo.has(y * w + x)) || pertoDoRosto(x, y)) continue;
        const embaixo = y >= cy;
        const sorte = (x * 73 + y * 151) % 5;
        if (sorte > (embaixo ? 1 : 0)) continue;
        const lado = [x < cx ? -1 : 1, 0];
        const direcoes = embaixo ? [[0, 1], lado] : [[0, -1], lado];
        const livre = direcoes.find(([dx, dy]) => em(x + dx, y + dy) && !novo[y + dy][x + dx]);
        if (livre) pontas.push({ x, y, d: livre, c, tamanho: embaixo && sorte === 0 ? 2 : 1 });
      }
    }
    for (const { x, y, d, c, tamanho } of pontas) {
      for (let i = 1; i <= tamanho; i++) {
        const px = x + d[0] * i;
        const py = y + d[1] * i;
        if (!em(px, py) || novo[py][px]) break;
        novo[py][px] = c;
        pintura[py][px] = c;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = pintura[y][x] || novo[y][x];
        if (!c || luminancia(...c) >= 22 || !(cabeca(x, y) || cabelo.has(y * w + x))) continue;
        if (y > 0 && novo[y - 1][x]) continue;
        pintura[y][x] = CABELO.mecha;
      }
    }
    let xMin = w;
    let xMax = -1;
    for (const k of cabelo) {
      xMin = Math.min(xMin, k % w);
      xMax = Math.max(xMax, k % w);
    }
    for (let x = xMin + 2; x <= xMax - 2; x++) {
      let topo = -1;
      for (let y = 0; y < h && topo < 0; y++) if (cabelo.has(y * w + x)) topo = y;
      if (topo < 0) continue;
      for (const [linha, fio] of [[1, x % 3 !== 2], [2, x % 3 === 0]]) {
        const y = topo + linha;
        if (fio && y < h && cabelo.has(y * w + x) && !pertoDoRosto(x, y)) pintura[y][x] = CABELO.brilho;
      }
    }
  }

  // Olhos: o centro de cada um, na mesma linha — a primeira do rosto com 3+ pixels de pele.
  // De frente, dois, simétricos no eixo do corpo e uma linha acima, entre a franja,
  // onde o desenho tem os olhos; de lado, um só, na frente do rosto (o desenho olha para a
  // direita). O jogo desenha um coraçãozinho na frente de cada olho, centrado nele.
  if (tarja[0] === null) tarja[0] = Math.floor(meio / 2) - TARJA.largura / 2 + 1;
  const olhos = [];
  for (let y = 0; y < h && !olhos.length; y++) {
    const xs = [];
    for (let x = 0; x < w; x++) if (doRosto(x, y)) xs.push(x);
    if (xs.length < 3) continue;
    const esquerdo = Math.floor(meio / 2) - 2;
    olhos.push(...(deFrente ? [[esquerdo, y - 1], [meio - esquerdo, y - 1]] : [[xs[xs.length - 1] - 2, y]]));
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * larguraFolha + fx + x) * 4;
      const c = pintura[y][x] || novo[y][x];
      if (!c) {
        anjo[o + 3] = 0;
        continue;
      }
      anjo.set([c[0], c[1], c[2], 255], o);
    }
  }

  // Ombro (onde nascem as asas): nas costas, logo abaixo do pescoço (o desenho olha para a
  // direita).
  const oy = Math.min(h - 1, pescoco + 2);
  let ox = 0;
  while (ox < w - 1 && !novo[oy][ox]) ox++;
  return {
    axAnjo: eixoCabeca, // eixo do sprite do anjo: o da forma base menos o recuo da cabeça
    olhos,
    ombro: [ox + 2, oy],
    tarja,
    ...(deFrente ? { meio } : {}),
    pescoco, // só para o espelho abaixo; não vai para o jogo
  };
}

const anjo = Buffer.from(folha);
for (const [nome, lista] of Object.entries(quadros)) {
  for (const q of lista) Object.assign(q, formaDeAnjo(q, Boolean(ANIMACOES[nome].frente)));
}

// Parado, de frente: o corpo desenhado no original não é simétrico (um braço, uma perna e um pé
// saíam mais grossos que os do outro lado). Do pescoço para baixo, o lado direito vira o espelho
// do esquerdo no eixo do corpo (`meio`: coluna x ↔ meio − x); nos pés, ao contrário, porque o pé
// esquerdo é o mais grosso. A cabeça fica como na forma base.
function espelharCorpo(q) {
  const PES = 3; // linhas de baixo
  for (let y = q.pescoco + 1; y < q.h; y++) {
    for (let x = 0; x < q.w; x++) {
      const destinoDireito = x * 2 > q.meio;
      if (y < q.h - PES ? !destinoDireito : destinoDireito) continue;
      const d = (y * larguraFolha + q.x + x) * 4;
      const espelho = q.meio - x;
      if (espelho < 0 || espelho >= q.w) anjo.fill(0, d, d + 4);
      else anjo.copy(anjo, d, (y * larguraFolha + q.x + espelho) * 4, (y * larguraFolha + q.x + espelho) * 4 + 4);
    }
  }
}
for (const q of quadros.parado) espelharCorpo(q);
for (const lista of Object.values(quadros)) for (const q of lista) delete q.pescoco;

escreverPng(SAIDA_PNG, larguraFolha, alturaFolha, folha);
escreverPng(SAIDA_ANJO, larguraFolha, alturaFolha, anjo);
fs.writeFileSync(
  SAIDA_JS,
  '// Gerado por ferramentas/gerar-personagem.cjs a partir de fontes/SpriteBase.png — não editar à mão.\n' +
    '// x/y/w/h: recorte em assets/personagem.png (e em personagem-anjo.png, no mesmo lugar);\n' +
    '// ax: eixo do corpo (os pés ficam na base do recorte). Âncoras da forma de anjo, dentro do\n' +
    '// recorte: axAnjo (o eixo do sprite do anjo: de lado a cabeça recua), olhos (centro de cada\n' +
    '// olho), ombro (onde nascem as asas) e tarja (x, y, largura e altura do mosaico no quadril).\n' +
    `export const QUADROS_PERSONAGEM = ${JSON.stringify(quadros, null, 2)};\n`,
);
console.log(`${naFolha.length} quadros -> ${path.relative(RAIZ, SAIDA_PNG)} e personagem-anjo.png (${larguraFolha}x${alturaFolha})`);
