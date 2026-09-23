// Animais do mapa, em coordenadas do mapa (como o chão e o personagem). Todos se assustam
// com o personagem e vão embora de vez: o esquilo sobe na árvore mais próxima e some na copa
// (sem árvore por perto, foge pelo chão), o cervo dispara em galope, coelho e sapo saem aos
// pulos, borboletas e pássaros saem voando. Quem sai da tela some do mapa e, mais tarde,
// outro nasce fora da tela no lugar dele: cada bicho tem um `maximo` no mapa, então o mapa
// nunca fica cheio nem vazio. Os sprites estão em animais-quadros.js.

// Distâncias em pixels, medidas na horizontal do personagem ao animal; tempos em segundos;
// velocidades em px/s; [mín, máx] é sorteado. `lugares` é onde cada um está quando o jogo
// abre (um por vaga do `maximo`).
const ESQUILO = {
  maximo: 3,
  lugares: [470, 1010, 1290],
  susto: 80,
  corrida: 115, // mais rápido que o personagem
  passeio: 45,
  subida: 38,
  alcanceArvore: 220, // foge para uma árvore a menos disto; se não houver, corre pelo chão
  sentado: [2, 6],
  volta: 60, // passeia até esta distância de onde mora
};

const COELHO = {
  maximo: 3,
  lugares: [400, 800, 1330],
  susto: 55,
  sentado: [2, 6],
  pulos: [1, 3],
  pulo: { vx: 45, vy: 110 },
  puloFuga: { vx: 120, vy: 140 },
  volta: 60,
};

const SAPO = {
  maximo: 2,
  lugares: [610, 1120],
  susto: 28,
  parado: [2, 5],
  coaxadas: [2, 3],
  papo: 0.35,
  entreCoaxadas: 0.3,
  pulo: { vx: 45, vy: 115 },
  puloFuga: { vx: 75, vy: 125 },
  volta: 40,
};

const CERVO = {
  maximo: 2,
  lugares: [250, 1200],
  susto: 130,
  alerta: 0.5, // encara o personagem por este tempo antes de disparar
  passo: 14,
  galope: 125,
  parado: [2, 5],
  andando: [2, 5],
  olhando: [1.5, 3],
  volta: 80,
};

const BORBOLETA = {
  maximo: 5,
  lugares: [330, 660, 790, 1080, 1370],
  susto: 20, // o personagem passando por baixo dela
  alcance: 70, // voa até esta distância de onde mora
  altura: [6, 45],
  velocidade: 18,
  fuga: { vx: 35, vy: 28 },
  asa: 0.07,
  pousar: 0.15, // chance de pousar no chão a cada destino alcançado
  pousada: [2, 5],
};

// Pássaros pousam sempre um por vez, cada um chegando voando de fora da tela; podem pousar
// perto de outro que já está no chão ou na mesma árvore, e aí formam um grupinho.
const AVES = {
  maximo: 6, // pousados (ou chegando) no mapa ao mesmo tempo
  chegada: [4, 10], // intervalo entre um pássaro e o próximo
  junto: 0.5, // chance de pousar perto de um que já está pousado...
  mesmaCor: 0.7, // ...e de ser da mesma cor dele
  espaco: 10, // distância mínima entre dois pousados no mesmo lugar
  susto: { chao: 70, arvore: 45 },
  demoraSusto: [0, 0.3], // cada um levanta voo com um atraso próprio
  voo: 70,
  planar: 30, // plana de asas abertas nos últimos pixels antes de pousar
  fuga: { vx: [55, 75], vy: [45, 70], subida: 30 },
  parado: [1, 4],
  bicadas: [2, 4],
  bicada: 0.15,
  saltinho: { vx: 30, vy: 55 },
};

const CONFIG_ANIMAL = { esquilo: ESQUILO, coelho: COELHO, sapo: SAPO, cervo: CERVO, borboleta: BORBOLETA };
const REPOSICAO = [8, 20]; // espera até nascer um animal no lugar de um que sumiu
const LONGE_AO_NASCER = 200; // nasce fora da tela e pelo menos a esta distância do personagem
const MARGEM_TELA = 40; // quem passa desta distância da borda da tela saiu dela
const GRAVIDADE_ANIMAIS = 640;

// Desenhados na linha 0 e virados para a direita, como os outros sprites.
const spriteDe = ({ linhas, eixo }, paleta) => ({ imagem: criarSprite(linhas, paleta), eixo });

// Gira 90°: `sentido` -1 põe a cabeça (lado direito do sprite) para cima, 1 para baixo.
function girarSprite(sprite, sentido) {
  const canvas = document.createElement('canvas');
  canvas.width = sprite.height;
  canvas.height = sprite.width;
  const c = canvas.getContext('2d');
  if (sentido < 0) {
    c.translate(0, sprite.width);
  } else {
    c.translate(sprite.height, 0);
  }
  c.rotate((sentido * Math.PI) / 2);
  c.drawImage(sprite, 0, 0);
  return canvas;
}

// Pernas do cervo: quadril, joelho e casco em (x, y) no quadro do corpo; o casco no chão fica
// na linha 39. As de trás dobram o jarrete para trás. `tp`/`tl`: traseiras de perto e de
// longe; `dp`/`dl`: dianteiras. As de longe ficam atrás do corpo e mais escuras.
const PERNAS_CERVO = {
  repouso: {
    tp: [[6, 27], [4, 33], [6, 39]],
    tl: [[10, 27], [8, 33], [10, 39]],
    dp: [[20, 27], [20, 33], [20, 39]],
    dl: [[23, 27], [23, 33], [23, 39]],
  },
  // Esticado no ar, recolhido e aterrissando; `dy` sobe o corpo no salto.
  galope: [
    { dy: -2, tp: [[6, 27], [1, 31], [-1, 35]], tl: [[10, 27], [5, 31], [3, 36]], dp: [[20, 27], [25, 31], [28, 34]], dl: [[23, 27], [27, 30], [31, 33]] },
    { dy: 0, tp: [[6, 27], [4, 33], [9, 38]], tl: [[10, 27], [9, 33], [12, 39]], dp: [[20, 27], [21, 33], [17, 38]], dl: [[23, 27], [22, 33], [20, 39]] },
    { dy: -1, tp: [[6, 27], [3, 33], [5, 39]], tl: [[10, 27], [7, 33], [9, 38]], dp: [[20, 27], [23, 32], [25, 37]], dl: [[23, 27], [26, 31], [28, 35]] },
  ],
};
const CORES_PERNA_CERVO = { perto: ['c', 'g', 'i'], longe: ['i', 'c', 'l'] }; // escura, clara, casco
const MARGEM_CERVO = 2; // o galope estica as pernas para fora do corpo

// Passo do cervo: pernas em diagonal andam juntas; a que vai para a frente sobe o casco.
function pernasAndando(fase) {
  const pernas = {};
  const defasagem = { tp: 0, dl: 0, tl: Math.PI, dp: Math.PI };
  Object.entries(PERNAS_CERVO.repouso).forEach(([nome, [quadril, joelho, casco]]) => {
    const f = fase + defasagem[nome];
    const dx = Math.round(2.5 * Math.cos(f));
    const sobe = Math.max(0, Math.round(2 * Math.sin(f)));
    const dobra = nome[0] === 't' ? -sobe : sobe;
    pernas[nome] = [quadril, [joelho[0] + Math.round(dx / 2) + dobra, joelho[1] - sobe], [casco[0] + dx, casco[1] - sobe]];
  });
  return pernas;
}

// Monta o quadro do cervo: pernas de longe, corpo e pernas de perto, nessa ordem. Cada perna
// tem 2px (escura atrás, clara na frente); as coxas de trás, 3px no alto.
function comporCervo(corpo, pernas, dy = 0) {
  const m = MARGEM_CERVO;
  // O casco dianteiro de longe chega à coluna 32 no galope.
  const largura = Math.max(CORPO_CERVO.frente[0].length, CORPO_CERVO.tras[0].length, 33) + 2 * m;
  const grade = Array.from({ length: 40 + m }, () => Array(largura).fill('.'));
  const pintar = (x, y, cor) => {
    if (grade[y + m] && x + m >= 0 && x + m < largura) grade[y + m][x + m] = cor;
  };
  const perna = (nome, [escura, clara, casco]) => {
    const pontos = pernas[nome].map(([x, y], i) => [x, i === 0 ? y + dy : y]);
    for (let s = 0; s < pontos.length - 1; s++) {
      const [x0, y0] = pontos[s];
      const [x1, y1] = pontos[s + 1];
      const passos = Math.max(Math.abs(y1 - y0), Math.abs(x1 - x0));
      for (let k = 0; k <= passos; k++) {
        const x = Math.round(x0 + ((x1 - x0) * k) / passos);
        const y = Math.round(y0 + ((y1 - y0) * k) / passos);
        const noCasco = s === pontos.length - 2 && y >= y1 - 1;
        if (s === 0 && k < 4 && nome[0] === 't') pintar(x - 1, y, escura);
        pintar(x, y, noCasco ? casco : escura);
        pintar(x + 1, y, noCasco ? casco : clara);
      }
    }
  };
  perna('tl', CORES_PERNA_CERVO.longe);
  perna('dl', CORES_PERNA_CERVO.longe);
  CORPO_CERVO[corpo].forEach((linha, y) => {
    [...linha].forEach((cor, x) => {
      if (cor !== '.') pintar(x, y + dy, cor);
    });
  });
  perna('tp', CORES_PERNA_CERVO.perto);
  perna('dp', CORES_PERNA_CERVO.perto);
  return { linhas: grade.map((linha) => linha.join('')), eixo: 15 + m };
}

const SPRITES_ANIMAIS = (() => {
  const lista = (quadros, paleta) => quadros.map((q) => spriteDe(q, paleta));
  const correndo = lista(QUADROS_ESQUILO.correndo, PALETA_ESQUILO);
  return {
    esquilo: {
      sentado: lista(QUADROS_ESQUILO.sentado, PALETA_ESQUILO),
      correndo,
      subindo: correndo.map(({ imagem }) => girarSprite(imagem, -1)),
    },
    coelho: Object.fromEntries(Object.entries(QUADROS_COELHO).map(([nome, q]) => [nome, spriteDe(q, PALETA_COELHO)])),
    sapo: Object.fromEntries(Object.entries(QUADROS_SAPO).map(([nome, q]) => [nome, spriteDe(q, PALETA_SAPO)])),
    cervo: {
      parado: spriteDe(comporCervo('frente', PERNAS_CERVO.repouso), PALETA_CERVO),
      olhando: spriteDe(comporCervo('tras', PERNAS_CERVO.repouso), PALETA_CERVO),
      andando: [0, 1, 2, 3].map((i) => spriteDe(comporCervo('frente', pernasAndando((i * Math.PI) / 2)), PALETA_CERVO)),
      galope: PERNAS_CERVO.galope.map(({ dy, ...pernas }) => spriteDe(comporCervo('frente', pernas, dy), PALETA_CERVO)),
    },
    // Uma versão por cor de CORES_PASSARO, com os pés (P).
    ave: CORES_PASSARO.map((cores) => {
      const paleta = { ...cores, P: '#8a5a2b' };
      return {
        pousado: spriteDe({ linhas: QUADROS_AVE_POUSADA.pousado, eixo: 5 }, paleta),
        bicando: spriteDe({ linhas: QUADROS_AVE_POUSADA.bicando, eixo: 5 }, paleta),
      };
    }),
    borboleta: CORES_BORBOLETA.map((cores) => ({
      aberta: criarSprite(QUADROS_BORBOLETA.aberta, { ...cores, b: '#2b1d14' }),
      fechada: criarSprite(QUADROS_BORBOLETA.fechada, { ...cores, b: '#2b1d14' }),
    })),
  };
})();

// Árvores da frente (só elas: as da fileira de trás não recebem bicho) com o que os
// animais usam delas, em coordenadas do mapa: o tronco (onde o esquilo sobe), a altura onde
// começa a copa (onde ele some) e pontos do alto da copa (onde os pássaros pousam), lidos
// dos pixels da folha. Fica vazio se a folha não
// puder ser lida (página aberta direto do disco, com file://): aí o esquilo foge pelo chão e
// os pássaros só pousam no chão.
const ALTO_DA_COPA = 6; // poleiros até esta distância abaixo do ponto mais alto da árvore
let arvoresDoMapa = [];
let yChaoAnimais = 0;

function lerArvore(folha, quadros) {
  const { w, h, m } = quadros[0];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  // Primeira linha opaca de cada coluna (-1 se a coluna está vazia).
  const contorno = (q) => {
    c.clearRect(0, 0, w, h);
    c.drawImage(folha, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
    const dados = c.getImageData(0, 0, w, h).data;
    const opaco = (x, y) => dados[(y * w + x) * 4 + 3] > 128;
    return { opaco, topo: Array.from({ length: w }, (_, x) => {
      for (let y = 0; y < h; y++) if (opaco(x, y)) return y;
      return -1;
    }) };
  };
  const { opaco, topo } = contorno(quadros[0]);

  // Tronco: o trecho opaco mais perto do meio da base, um pouco acima do pé.
  const meioBase = m + (w - m) / 2;
  const yTronco = h - 8;
  let tronco = null;
  for (let x = 0; x < w; x++) {
    if (!opaco(x, yTronco)) continue;
    let fim = x;
    while (fim + 1 < w && opaco(fim + 1, yTronco)) fim++;
    if (!tronco || Math.abs((x + fim) / 2 - meioBase) < Math.abs(tronco.meio - meioBase)) {
      tronco = { meio: (x + fim) / 2, largura: fim - x + 1 };
    }
    x = fim;
  }
  if (!tronco) return null;

  // Copa: subindo pelo tronco, a primeira linha bem mais larga que ele.
  let copa = Math.round(h / 2);
  for (let y = h - 12; y > 0; y--) {
    let largura = 0;
    for (let x = 0; x < w; x++) if (opaco(x, y)) largura++;
    if (largura > tronco.largura + 12) {
      copa = y;
      break;
    }
  }

  // Poleiros: colunas do alto da copa com o contorno de cima quase plano em volta. Só no
  // alto: nos galhos de baixo, a copa de uma árvore de trás aparece em volta e o pássaro
  // parece pousado nela.
  const cume = Math.min(...topo.filter((y) => y >= 0));
  const poleiros = [];
  for (let x = 2; x < w - 2; x++) {
    const y = topo[x];
    if (y < 0 || y > cume + ALTO_DA_COPA || topo[x - 2] < 0 || topo[x + 2] < 0) continue;
    if (Math.abs(topo[x - 2] - y) <= 2 && Math.abs(topo[x + 2] - y) <= 2) poleiros.push({ x, y });
  }

  // Quanto a copa andou para a esquerda em cada quadro do vento, para o pássaro ir junto.
  const desvio = quadros.map((q, i) => {
    if (i === 0) return 0;
    const topoQuadro = contorno(q).topo;
    let melhor = { s: 0, erro: Infinity };
    for (let s = 0; s <= 4; s++) {
      let erro = 0;
      for (let x = s; x < w; x++) {
        if (topo[x] >= 0 && topoQuadro[x - s] >= 0) erro += Math.abs(topoQuadro[x - s] - topo[x]);
      }
      if (erro < melhor.erro) melhor = { s, erro };
    }
    return melhor.s;
  });
  return { tronco: tronco.meio, copa, poleiros, desvio, altura: h };
}

function analisarArvores(folha) {
  const lidas = new Map();
  try {
    arvoresDoMapa = ARVORES_CHAO.map(({ indice, x }) => {
      const quadros = QUADROS_CENARIO.arvores[indice];
      if (!lidas.has(indice)) lidas.set(indice, lerArvore(folha, quadros));
      const lida = lidas.get(indice);
      if (!lida) return null;
      // Mesmo apoio de desenharVegetacao: a base encosta 1px dentro da grama.
      const esquerda = esquerdaDaPlanta(quadros[0], x);
      const topo = yChaoAnimais + 1 - lida.altura;
      return {
        x,
        tronco: esquerda + lida.tronco,
        copa: topo + lida.copa,
        poleiros: lida.poleiros.map((p) => ({ x: esquerda + p.x, y: topo + p.y })),
        desvio: lida.desvio,
      };
    }).filter(Boolean);
  } catch (erro) {
    arvoresDoMapa = []; // folha protegida (file://): segue sem árvores
  }
}

let animais = [];
let aves = [];
let reposicoes = []; // vagas de animais que sumiram, esperando outro nascer
let esperaAve = AVES.chegada[0];

const sorteioInteiro = ([min, max]) => Math.floor(min + Math.random() * (max - min + 1));
const ladoAleatorio = () => (Math.random() < 0.5 ? -1 : 1);
const corAleatoria = () => Math.floor(Math.random() * CORES_PASSARO.length);
const limitarNoMapa = (x, margem = 8) => Math.max(margem, Math.min(MUNDO - margem, x));
const foraDaTela = (x, y, camX, largura) =>
  x < camX - MARGEM_TELA || x > camX + largura + MARGEM_TELA || y < -MARGEM_TELA;

const CRIAR_ANIMAL = {
  esquilo: () => ({ estado: 'sentado', espera: sortear(ESQUILO.sentado), quadro: 0 }),
  coelho: () => ({ estado: 'sentado', espera: sortear(COELHO.sentado), vx: 0, vy: 0, pulos: 0 }),
  sapo: () => ({ estado: 'parado', espera: sortear(SAPO.parado), vx: 0, vy: 0, coaxadas: 0 }),
  cervo: () => ({ estado: 'parado', espera: sortear(CERVO.parado) }),
  borboleta: () => ({
    estado: 'voando',
    cor: Math.floor(Math.random() * CORES_BORBOLETA.length),
    alvo: null,
    espera: 0,
    y: yChaoAnimais - sortear(BORBOLETA.altura),
  }),
};

function criarAnimal(tipo, x) {
  const base = { tipo, x, y: yChaoAnimais, casa: x, direcao: ladoAleatorio(), tempo: Math.random() * 10 };
  return { ...base, ...CRIAR_ANIMAL[tipo]() };
}

// Chamado depois de a folha do cenário carregar: lê as árvores e espalha os animais pelo mapa.
function prepararAnimais(folha, yChao) {
  yChaoAnimais = yChao;
  analisarArvores(folha);
  animais = Object.entries(CONFIG_ANIMAL).flatMap(([tipo, config]) =>
    config.lugares.slice(0, config.maximo).map((x) => criarAnimal(tipo, x)),
  );
  // Já começa com pássaros pousados: dois juntos no chão perto do início, um sozinho mais
  // longe e dois na cerejeira.
  const cor = corAleatoria();
  aves.push(novaAve({ x: 884, y: yChaoAnimais, arvore: null }, cor));
  aves.push(novaAve({ x: 897, y: yChaoAnimais, arvore: null }, cor));
  aves.push(novaAve({ x: 320, y: yChaoAnimais, arvore: null }, corAleatoria()));
  const cerejeira = arvoresDoMapa.find((a) => a.x === 1016);
  if (cerejeira) {
    const corArvore = corAleatoria();
    for (let i = 0; i < 2; i++) {
      const p = poleiroLivre(cerejeira);
      if (p) aves.push(novaAve({ x: p.x, y: p.y + 1, arvore: cerejeira }, corArvore));
    }
  }
}

// Onde o animal está em relação ao personagem: distância na horizontal e para que lado fugir.
function distancia(animal, jogador) {
  const dx = animal.x - jogador.x;
  return { longe: Math.abs(dx), fuga: Math.sign(dx) || ladoAleatorio() };
}

// Assusta de vez: daqui em diante o animal só quer ir embora, para o lado `fuga`.
function assustar(animal, fuga) {
  animal.medo = true;
  animal.direcao = fuga;
}

// --- Esquilo ---

function fugirEsquilo(e, fuga) {
  assustar(e, fuga);
  // Árvore mais perto à frente dele, do lado oposto ao personagem.
  let arvore = null;
  arvoresDoMapa.forEach((a) => {
    const ate = (a.tronco - e.x) * fuga;
    if (ate < -4 || ate > ESQUILO.alcanceArvore) return;
    if (!arvore || Math.abs(a.tronco - e.x) < Math.abs(arvore.tronco - e.x)) arvore = a;
  });
  e.arvore = arvore;
  if (arvore) e.direcao = Math.sign(arvore.tronco - e.x) || fuga;
  e.estado = 'fugindo';
}

function atualizarEsquilo(e, dt, jogador) {
  const { longe, fuga } = distancia(e, jogador);
  if (!e.medo && longe < ESQUILO.susto) fugirEsquilo(e, fuga);

  if (e.estado === 'sentado') {
    // De vez em quando se encolhe um instante (o quadro 1), como quem mastiga.
    e.quadro = e.tempo % 3 < 0.35 ? 1 : 0;
    e.espera -= dt;
    if (e.espera <= 0) {
      e.alvo = limitarNoMapa(e.casa + sortear([-ESQUILO.volta, ESQUILO.volta]));
      e.direcao = Math.sign(e.alvo - e.x) || e.direcao;
      e.estado = 'passeando';
    }
  } else if (e.estado === 'passeando') {
    const passo = Math.min(Math.abs(e.alvo - e.x), ESQUILO.passeio * dt);
    e.x += Math.sign(e.alvo - e.x) * passo;
    if (Math.abs(e.alvo - e.x) < 0.5) {
      e.estado = 'sentado';
      e.espera = sortear(ESQUILO.sentado);
    }
  } else if (e.estado === 'fugindo') {
    // Sem árvore, corre até sair da tela; com árvore, até o tronco.
    if (!e.arvore) {
      e.x += e.direcao * ESQUILO.corrida * dt;
      return;
    }
    const passo = Math.min(Math.abs(e.arvore.tronco - e.x), ESQUILO.corrida * dt);
    e.x += Math.sign(e.arvore.tronco - e.x) * passo;
    if (Math.abs(e.arvore.tronco - e.x) < 0.5) e.estado = 'subindo';
  } else if (e.estado === 'subindo') {
    e.y -= ESQUILO.subida * dt;
    if (e.y <= e.arvore.copa) e.sumiu = true; // entrou na copa: saiu do mapa
  }
}

function desenharEsquilo(ctx, e, luz) {
  const s = SPRITES_ANIMAIS.esquilo;
  if (e.estado === 'subindo') {
    // Tronco acima: o que passa da linha da copa some entre as folhas.
    const imagem = s.subindo[Math.floor(e.tempo / 0.1) % s.subindo.length];
    ctx.save();
    ctx.beginPath();
    ctx.rect(e.x - 20, e.arvore.copa, 40, yChaoAnimais - e.arvore.copa + 4);
    ctx.clip();
    ctx.drawImage(imagem, Math.round(e.x - imagem.width / 2), Math.round(e.y) - imagem.height);
    ctx.restore();
    return;
  }
  desenharSombra(ctx, luz, e.x, yChaoAnimais, 10, 0.7);
  if (e.estado === 'sentado') {
    desenharSprite(ctx, s.sentado[e.quadro], e.x, e.y, e.direcao);
  } else {
    const passo = e.estado === 'fugindo' ? 0.07 : 0.12;
    desenharSprite(ctx, s.correndo[Math.floor(e.tempo / passo) % s.correndo.length], e.x, e.y, e.direcao);
  }
}

// --- Pulos (coelho, sapo e o saltinho dos pássaros) ---

function pular(animal, { vx, vy }) {
  animal.vx = animal.direcao * vx;
  animal.vy = -vy;
  animal.estado = 'pulando';
  animal.noAr = 0;
}

// Pulo com gravidade; devolve true no quadro em que o animal volta ao chão. Só quem está
// fugindo pode passar da borda do mapa.
function cairPulo(animal, dt) {
  animal.noAr += dt;
  animal.vy += GRAVIDADE_ANIMAIS * dt;
  animal.x += animal.vx * dt;
  if (!animal.medo) animal.x = limitarNoMapa(animal.x);
  animal.y += animal.vy * dt;
  if (animal.y < yChaoAnimais) return false;
  animal.y = yChaoAnimais;
  animal.vx = 0;
  animal.vy = 0;
  return true;
}

// Direção de um passeio: volta para casa se estiver longe dela, senão qualquer lado.
function direcaoPasseio(animal, volta) {
  if (Math.abs(animal.x - animal.casa) > volta) return Math.sign(animal.casa - animal.x);
  return ladoAleatorio();
}

// --- Coelho ---

function atualizarCoelho(c, dt, jogador) {
  const { longe, fuga } = distancia(c, jogador);
  if (c.estado === 'sentado') {
    if (!c.medo && longe < COELHO.susto) {
      assustar(c, fuga);
      c.espera = 0;
    }
    c.espera -= dt;
    if (c.espera > 0) return;
    if (c.medo) {
      pular(c, COELHO.puloFuga);
      return;
    }
    if (c.pulos <= 0) {
      c.pulos = sorteioInteiro(COELHO.pulos);
      c.direcao = direcaoPasseio(c, COELHO.volta);
    }
    pular(c, COELHO.pulo);
  } else if (cairPulo(c, dt)) {
    c.estado = 'sentado';
    // Assustado, emenda um pulo no outro até sair da tela.
    if (c.medo) {
      c.espera = 0.08;
      return;
    }
    c.pulos--;
    c.espera = c.pulos > 0 ? 0.2 : sortear(COELHO.sentado);
  }
}

function desenharCoelho(ctx, c, luz) {
  const s = SPRITES_ANIMAIS.coelho;
  const altura = yChaoAnimais - c.y;
  desenharSombra(ctx, luz, c.x, yChaoAnimais, 11 * Math.max(0.4, 1 - altura / 30), 0.7);
  let sprite = s.sentado;
  if (c.estado === 'pulando') sprite = c.noAr < 0.1 ? s.impulso : s.salto;
  desenharSprite(ctx, sprite, c.x, c.y, c.direcao);
}

// --- Sapo ---

function atualizarSapo(s, dt, jogador) {
  const { longe, fuga } = distancia(s, jogador);
  if (!s.medo && longe < SAPO.susto) {
    assustar(s, fuga);
    if (s.estado !== 'pulando') {
      s.estado = 'agachado';
      s.espera = 0.08;
      s.depois = 'pulo';
    }
  }
  if (s.estado === 'pulando') {
    if (cairPulo(s, dt)) {
      // Assustado, agacha e já pula de novo até sair da tela.
      s.estado = 'agachado';
      s.espera = s.medo ? 0.06 : 0.1;
      s.depois = s.medo ? 'pulo' : 'parado';
    }
    return;
  }
  s.espera -= dt;
  if (s.espera > 0) return;

  if (s.estado === 'agachado') {
    if (s.depois === 'pulo') {
      pular(s, s.medo ? SAPO.puloFuga : SAPO.pulo);
    } else {
      s.estado = 'parado';
      s.espera = sortear(SAPO.parado);
    }
  } else if (s.estado === 'coaxando') {
    // Alterna papo cheio e vazio até acabar a sequência.
    s.cheio = !s.cheio;
    if (!s.cheio) s.coaxadas--;
    if (s.coaxadas <= 0) {
      s.estado = 'parado';
      s.espera = sortear(SAPO.parado);
    } else {
      s.espera = s.cheio ? SAPO.papo : SAPO.entreCoaxadas;
    }
  } else if (s.estado === 'boca') {
    s.estado = 'parado';
    s.espera = sortear(SAPO.parado);
  } else {
    const sorteio = Math.random();
    if (sorteio < 0.55) {
      s.estado = 'coaxando';
      s.coaxadas = sorteioInteiro(SAPO.coaxadas);
      s.cheio = true;
      s.espera = SAPO.papo;
    } else if (sorteio < 0.8) {
      s.estado = 'boca'; // pega um mosquito
      s.espera = 0.25;
    } else {
      s.direcao = direcaoPasseio(s, SAPO.volta);
      s.estado = 'agachado';
      s.espera = 0.12;
      s.depois = 'pulo';
    }
  }
}

function desenharSapo(ctx, s, luz) {
  const q = SPRITES_ANIMAIS.sapo;
  const altura = yChaoAnimais - s.y;
  desenharSombra(ctx, luz, s.x, yChaoAnimais, 11 * Math.max(0.4, 1 - altura / 30), 0.7);
  const sprites = { parado: q.parado, pulando: q.pulo, agachado: q.agachado, boca: q.boca };
  const sprite = s.estado === 'coaxando' ? (s.cheio ? q.papo : q.parado) : sprites[s.estado];
  desenharSprite(ctx, sprite, s.x, s.y, s.direcao);
}

// --- Cervo ---

function atualizarCervo(c, dt, jogador) {
  const { longe, fuga } = distancia(c, jogador);
  if (!c.medo && longe < CERVO.susto) {
    c.medo = true;
    c.estado = 'alerta';
    c.espera = CERVO.alerta;
    c.fuga = fuga;
    // Encara o personagem: se ele está atrás, vira a cabeça.
    c.olhandoPraTras = Math.sign(jogador.x - c.x) !== c.direcao;
  }

  c.espera -= dt;
  if (c.estado === 'alerta') {
    if (c.espera <= 0) {
      c.estado = 'fugindo';
      c.direcao = c.fuga;
    }
  } else if (c.estado === 'fugindo') {
    c.x += c.direcao * CERVO.galope * dt; // até sair da tela
  } else if (c.estado === 'andando') {
    c.x = limitarNoMapa(c.x + c.direcao * CERVO.passo * dt, 20);
    if (c.espera <= 0) {
      c.estado = 'parado';
      c.espera = sortear(CERVO.parado);
    }
  } else if (c.espera <= 0) {
    const sorteio = Math.random();
    if (sorteio < 0.5) {
      c.estado = 'andando';
      c.direcao = direcaoPasseio(c, CERVO.volta);
      c.espera = sortear(CERVO.andando);
    } else if (sorteio < 0.8 && c.estado !== 'olhando') {
      c.estado = 'olhando';
      c.espera = sortear(CERVO.olhando);
    } else {
      c.estado = 'parado';
      c.espera = sortear(CERVO.parado);
    }
  }
}

function desenharCervo(ctx, c, luz) {
  const s = SPRITES_ANIMAIS.cervo;
  desenharSombra(ctx, luz, c.x, yChaoAnimais, 24, 0.9);
  let sprite = s.parado;
  if (c.estado === 'olhando' || (c.estado === 'alerta' && c.olhandoPraTras)) sprite = s.olhando;
  else if (c.estado === 'andando') sprite = s.andando[Math.floor(c.tempo / 0.16) % s.andando.length];
  else if (c.estado === 'fugindo') sprite = s.galope[Math.floor(c.tempo / 0.09) % s.galope.length];
  desenharSprite(ctx, sprite, c.x, c.y, c.direcao);
}

// --- Borboleta ---

function novoDestinoBorboleta(b, podePousar = true) {
  const pousar = podePousar && Math.random() < BORBOLETA.pousar;
  b.alvo = {
    x: limitarNoMapa(b.casa + sortear([-BORBOLETA.alcance, BORBOLETA.alcance])),
    y: pousar ? yChaoAnimais - 1 : yChaoAnimais - sortear(BORBOLETA.altura),
    pousar,
  };
}

function atualizarBorboleta(b, dt, jogador) {
  // O personagem passando por baixo (ou por ela) a espanta: sobe e vai embora da tela.
  const { longe, fuga } = distancia(b, jogador);
  if (!b.medo && longe < BORBOLETA.susto && b.y > jogador.y - 45) {
    assustar(b, fuga);
    b.estado = 'voando';
  }
  if (b.medo) {
    b.x += b.direcao * BORBOLETA.fuga.vx * dt;
    b.y -= BORBOLETA.fuga.vy * dt;
    return;
  }

  if (b.estado === 'pousada') {
    b.espera -= dt;
    if (b.espera <= 0) {
      b.estado = 'voando';
      novoDestinoBorboleta(b, false);
    }
    return;
  }
  if (!b.alvo) novoDestinoBorboleta(b);
  const dx = b.alvo.x - b.x;
  const dy = b.alvo.y - b.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) {
    if (b.alvo.pousar) {
      b.estado = 'pousada';
      b.espera = sortear(BORBOLETA.pousada);
    }
    novoDestinoBorboleta(b);
    return;
  }
  const passo = Math.min(dist, BORBOLETA.velocidade * dt);
  b.x += (dx / dist) * passo;
  b.y += (dy / dist) * passo;
}

// Desenhada acima de todos, com um sobe e desce do bater de asas.
function desenharBorboleta(ctx, b) {
  const sprites = SPRITES_ANIMAIS.borboleta[b.cor];
  let imagem;
  let y = b.y;
  if (b.estado === 'pousada') {
    // Parada, abre as asas de vez em quando.
    imagem = b.tempo % 1.4 < 0.5 ? sprites.aberta : sprites.fechada;
  } else {
    imagem = Math.floor(b.tempo / BORBOLETA.asa) % 2 ? sprites.aberta : sprites.fechada;
    y += 1.5 * Math.sin(b.tempo * 7);
  }
  ctx.drawImage(imagem, Math.round(b.x) - 2, Math.round(y) - imagem.height);
}

// --- Pássaros ---

// Onde o pássaro está pousado, ou vai pousar se ainda está chegando.
const lugarDaAve = (ave) => (ave.estado === 'chegando' ? ave.alvo : ave);

// Nenhum outro pássaro pousado (ou chegando) no mesmo lugar — mesma árvore, ou o chão — a
// menos de AVES.espaco de `x`.
function lugarLivre(x, arvore) {
  return aves.every((ave) => {
    if (ave.estado === 'voando') return true;
    const lugar = lugarDaAve(ave);
    return lugar.arvore !== arvore || Math.abs(lugar.x - x) >= AVES.espaco;
  });
}

// Um poleiro livre da árvore, se possível a menos de 24px de `perto`.
function poleiroLivre(arvore, perto = null) {
  const livres = arvore.poleiros.filter(
    (p) => lugarLivre(p.x, arvore) && (perto === null || Math.abs(p.x - perto) < 24),
  );
  return livres.length ? livres[Math.floor(Math.random() * livres.length)] : null;
}

function novaAve(lugar, cor) {
  return {
    ...lugar,
    cor,
    direcao: ladoAleatorio(),
    estado: 'pousado',
    espera: sortear(AVES.parado),
    tempo: Math.random() * 3,
  };
}

// Lugar para um pássaro que vai chegar: às vezes perto de um já pousado (e muitas vezes da
// mesma cor dele), senão numa árvore da frente ou no chão, na tela e longe do personagem.
function escolherPouso(jogador, camX, largura) {
  const naTela = (x) => x > camX + 20 && x < camX + largura - 20;
  const longeDoJogador = (x, arvore) =>
    Math.abs(x - jogador.x) > (arvore ? AVES.susto.arvore : AVES.susto.chao) + 30;
  const pousadas = aves.filter((ave) => ave.estado !== 'voando');

  if (pousadas.length && Math.random() < AVES.junto) {
    const par = pousadas[Math.floor(Math.random() * pousadas.length)];
    const { x, arvore } = lugarDaAve(par);
    let lugar = null;
    if (arvore) {
      const p = poleiroLivre(arvore, x);
      if (p) lugar = { x: p.x, y: p.y + 1, arvore };
    } else {
      const xPerto = x + ladoAleatorio() * sortear([AVES.espaco, 18]);
      if (xPerto > 8 && xPerto < MUNDO - 8 && lugarLivre(xPerto, null)) lugar = { x: xPerto, y: yChaoAnimais, arvore: null };
    }
    if (lugar && longeDoJogador(lugar.x, lugar.arvore)) {
      return { lugar, cor: Math.random() < AVES.mesmaCor ? par.cor : corAleatoria() };
    }
  }

  if (arvoresDoMapa.length && Math.random() < 0.5) {
    const arvores = arvoresDoMapa
      .filter((a) => naTela(a.x) && longeDoJogador(a.x, a))
      .sort(() => Math.random() - 0.5);
    for (const arvore of arvores) {
      const p = poleiroLivre(arvore);
      if (p) return { lugar: { x: p.x, y: p.y + 1, arvore }, cor: corAleatoria() };
    }
  }
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const x = camX + 30 + Math.random() * (largura - 60);
    if (longeDoJogador(x, null) && lugarLivre(x, null)) {
      return { lugar: { x, y: yChaoAnimais, arvore: null }, cor: corAleatoria() };
    }
  }
  return null;
}

// Um pássaro chega voando de fora da tela, do lado mais longe do personagem, e pousa.
function chegarAve(jogador, camX, largura) {
  const pouso = escolherPouso(jogador, camX, largura);
  if (!pouso) return;
  const { lugar, cor } = pouso;
  const lado = Math.sign(lugar.x - jogador.x) || 1;
  const ave = novaAve(lugar, cor);
  ave.estado = 'chegando';
  ave.alvo = { ...lugar };
  ave.x = lado > 0 ? camX + largura + 20 : camX - 20;
  ave.y = sortear([10, 60]);
  ave.direcao = -lado;
  aves.push(ave);
}

function levantarVoo(ave, fuga) {
  ave.estado = 'voando';
  ave.direcao = fuga;
  ave.vx = fuga * sortear(AVES.fuga.vx);
  ave.vy = -sortear(AVES.fuga.vy);
  ave.arvore = null;
}

function atualizarAve(ave, dt, jogador) {
  const { longe, fuga } = distancia(ave, jogador);
  if (ave.estado === 'voando') {
    ave.vy -= AVES.fuga.subida * dt;
    ave.x += ave.vx * dt;
    ave.y += ave.vy * dt;
    return;
  }
  if (ave.estado === 'chegando') {
    const dx = ave.alvo.x - ave.x;
    const dy = ave.alvo.y - ave.y;
    const dist = Math.hypot(dx, dy);
    const passo = Math.min(dist, AVES.voo * dt);
    ave.x += (dx / dist || 0) * passo;
    ave.y += (dy / dist || 0) * passo;
    if (dist - passo < 0.5) {
      ave.estado = 'pousado';
      ave.espera = sortear(AVES.parado);
    }
    return;
  }

  // Pousado: com o personagem perto, levanta voo depois do seu atraso.
  const susto = ave.arvore ? AVES.susto.arvore : AVES.susto.chao;
  if (longe < susto) {
    if (ave.assustada === undefined) ave.assustada = sortear(AVES.demoraSusto);
    ave.assustada -= dt;
    if (ave.assustada <= 0) levantarVoo(ave, fuga);
    return;
  }
  ave.assustada = undefined;

  if (ave.estado === 'pulando') {
    if (cairPulo(ave, dt)) {
      ave.estado = 'pousado';
      ave.espera = sortear(AVES.parado);
    }
    return;
  }
  ave.espera -= dt;
  if (ave.espera > 0) return;
  if (ave.estado === 'bicando') {
    ave.estado = 'pousado';
    ave.espera = sortear(AVES.parado);
    return;
  }
  // No galho só olha para os lados; no chão também bica e dá saltinhos.
  const sorteio = Math.random();
  if (ave.arvore || sorteio < 0.3) {
    ave.direcao *= -1;
    ave.espera = sortear(AVES.parado);
  } else if (sorteio < 0.75) {
    ave.estado = 'bicando';
    ave.espera = sorteioInteiro(AVES.bicadas) * 2 * AVES.bicada;
  } else {
    pular(ave, AVES.saltinho);
  }
}

function desenharAve(ctx, ave, luz, tempo) {
  if (ave.estado === 'voando' || ave.estado === 'chegando') {
    const quadros = BATER_ASAS[0][ave.cor];
    const planando = ave.estado === 'chegando' && Math.hypot(ave.alvo.x - ave.x, ave.alvo.y - ave.y) < AVES.planar;
    const sprite = planando ? quadros[1] : quadros[Math.floor(ave.tempo / PASSAROS.quadroAsa) % quadros.length];
    const direcao = ave.estado === 'voando' ? Math.sign(ave.vx) : Math.sign(ave.alvo.x - ave.x) || ave.direcao;
    desenharSprite(ctx, { imagem: sprite, eixo: 6 }, ave.x, ave.y + 1, direcao);
    return;
  }
  let { x, y } = ave;
  if (ave.arvore) {
    // Vai junto com a copa quando o vento a verga.
    const quadro = quadroDoVento(tempo, ave.arvore.x, ave.arvore.desvio.length);
    x -= ave.arvore.desvio[quadro];
  } else {
    desenharSombra(ctx, luz, x, yChaoAnimais, 7, 0.6);
  }
  const s = SPRITES_ANIMAIS.ave[ave.cor];
  const bicando = ave.estado === 'bicando' && Math.floor(ave.tempo / AVES.bicada) % 2 === 0;
  desenharSprite(ctx, bicando ? s.bicando : s.pousado, x, y, ave.direcao);
}

// --- Todos ---

// Desenha com o `eixo` do sprite em `x` e os pés em `y`, virado para `direcao` (1 = direita).
function desenharSprite(ctx, { imagem, eixo }, x, y, direcao) {
  const px = Math.round(x);
  const topo = Math.round(y) - imagem.height;
  if (direcao === 1) {
    ctx.drawImage(imagem, px - eixo, topo);
    return;
  }
  ctx.save();
  ctx.translate(px + eixo + 1, topo);
  ctx.scale(-1, 1);
  ctx.drawImage(imagem, 0, 0);
  ctx.restore();
}

const ATUALIZAR_ANIMAL = {
  esquilo: atualizarEsquilo,
  coelho: atualizarCoelho,
  sapo: atualizarSapo,
  cervo: atualizarCervo,
  borboleta: atualizarBorboleta,
};

// Um lugar do mapa fora da tela e longe do personagem para um animal nascer (null se não
// achar desta vez).
function lugarParaNascer(jogador, camX, largura) {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const x = 30 + Math.random() * (MUNDO - 60);
    if (foraDaTela(x, yChaoAnimais, camX, largura) && Math.abs(x - jogador.x) > LONGE_AO_NASCER) return x;
  }
  return null;
}

// `jogador` é o personagem (x = eixo do corpo, no mapa); `camX` a borda esquerda da tela.
function atualizarAnimais(dt, jogador, camX, largura) {
  animais.forEach((animal) => {
    animal.tempo += dt;
    ATUALIZAR_ANIMAL[animal.tipo](animal, dt, jogador);
    // Assustado e fora da tela: foi embora do mapa.
    if (animal.medo && foraDaTela(animal.x, animal.y, camX, largura)) animal.sumiu = true;
  });

  // Cada um que sumiu abre uma vaga; depois de um tempo nasce outro fora da tela.
  animais.forEach((a) => {
    if (a.sumiu) reposicoes.push({ tipo: a.tipo, espera: sortear(REPOSICAO) });
  });
  animais = animais.filter((a) => !a.sumiu);
  reposicoes.forEach((vaga) => {
    vaga.espera -= dt;
    if (vaga.espera > 0) return;
    const x = lugarParaNascer(jogador, camX, largura);
    if (x === null) return;
    animais.push(criarAnimal(vaga.tipo, x));
    vaga.preenchida = true;
  });
  reposicoes = reposicoes.filter((vaga) => !vaga.preenchida);

  aves.forEach((ave) => {
    ave.tempo += dt;
    atualizarAve(ave, dt, jogador);
  });
  aves = aves.filter((ave) => ave.estado !== 'voando' || !foraDaTela(ave.x, ave.y, camX, largura));

  // Pássaros novos chegam um de cada vez, até o máximo.
  if (aves.filter((ave) => ave.estado !== 'voando').length >= AVES.maximo) return;
  esperaAve -= dt;
  if (esperaAve <= 0) {
    chegarAve(jogador, camX, largura);
    esperaAve = sortear(AVES.chegada);
  }
}

const naVista = (x, camX, largura, margem = MARGEM_TELA) => x > camX - margem && x < camX + largura + margem;

// Bichos no chão e nas árvores, com sombra: depois da vegetação e antes do personagem. Os
// maiores primeiro, para os pequenos não sumirem atrás deles.
const ORDEM_DESENHO = ['cervo', 'coelho', 'sapo', 'esquilo'];
const DESENHAR_ANIMAL = { cervo: desenharCervo, coelho: desenharCoelho, sapo: desenharSapo, esquilo: desenharEsquilo };

function desenharAnimais(ctx, luz, tempo, camX, largura) {
  ORDEM_DESENHO.forEach((tipo) => {
    animais.forEach((animal) => {
      if (animal.tipo === tipo && naVista(animal.x, camX, largura)) DESENHAR_ANIMAL[tipo](ctx, animal, luz);
    });
  });
  aves.forEach((ave) => {
    if (ave.estado !== 'voando' && ave.estado !== 'chegando' && naVista(ave.x, camX, largura)) {
      desenharAve(ctx, ave, luz, tempo);
    }
  });
}

// O que voa passa na frente do personagem: pássaros em voo e borboletas.
function desenharAnimaisNoAr(ctx, luz, tempo, camX, largura) {
  animais.forEach((animal) => {
    if (animal.tipo === 'borboleta' && naVista(animal.x, camX, largura)) desenharBorboleta(ctx, animal);
  });
  aves.forEach((ave) => {
    if ((ave.estado === 'voando' || ave.estado === 'chegando') && naVista(ave.x, camX, largura, 80)) {
      desenharAve(ctx, ave, luz, tempo);
    }
  });
}
