// Gera os sprites do cenário a partir das folhas de referência em fontes/.
// Uso (na pasta jogo/): npm run arte:cenario
// Saída: apps/cliente/src/assets/cenario.png (tudo empacotado) e
// apps/cliente/src/gerado/cenario-quadros.ts (recortes).

const fs = require('fs');
const path = require('path');
const { lerPng, escreverPng } = require('./png.cjs');

const RAIZ = path.join(__dirname, '..');
const FONTES = path.join(RAIZ, 'fontes');
const CLIENTE = path.join(RAIZ, 'apps', 'cliente', 'src');
const SAIDA_PNG = path.join(CLIENTE, 'assets', 'cenario.png');
const SAIDA_JS = path.join(CLIENTE, 'gerado', 'cenario-quadros.ts');

const TELA = { altura: 270 }; // mesma altura do canvas do jogo
const ESCALA_ARVORES = 0.38; // um pouco maiores que os arbustos
const ESCALA_ARBUSTOS = 1 / 3;
const ESCALA_NUVENS = 1 / 5;
const DIAMETRO_SOL = 15; // só o disco: o brilho em volta é um degradê desenhado pelo jogo
const LIMITE_CEU = 24; // soma das diferenças RGB entre pixels vizinhos que ainda conta como céu
// Contorno das montanhas: uma coluna não desce mais que FOLGA_CONTORNO abaixo da mediana das
// VIZINHANCA_CONTORNO colunas de cada lado (em pixels da folha de origem).
const VIZINHANCA_CONTORNO = 40;
const FOLGA_CONTORNO = 6;
const ALTURA_MIN_ARVORE = 100; // na folha: abaixo disso é arbusto ou folhagem
const QUADROS_VENTO = 8; // quadros do balanço, do repouso à curvatura máxima
// Curvatura máxima da copa em pixels do jogo: base + altura da planta / porAltura.
const CURVA_VENTO = { base: 0.8, porAltura: 130 };
const AMOSTRAS_PALETA = 150000; // pixels usados para calcular cada paleta
const LARGURA_FOLHA = 1024;
// Folga (distância RGB ao quadrado) para um pixel de quadro de vento manter a cor do anterior.
const ESTABILIDADE_COR = 900;

// Rotula as manchas opacas; a vizinhança junta pedaços soltos por pixels semitransparentes.
function manchas(img, alfaMin, vizinhanca, tamanhoMin) {
  const { largura, altura, px } = img;
  const rotulo = new Int32Array(largura * altura);
  const lista = [];
  for (let inicio = 0; inicio < largura * altura; inicio++) {
    if (rotulo[inicio] || px[inicio * 4 + 3] < alfaMin) continue;
    const id = lista.length + 1;
    const pilha = [inicio];
    rotulo[inicio] = id;
    let x0 = largura;
    let y0 = altura;
    let x1 = 0;
    let y1 = 0;
    let n = 0;
    while (pilha.length) {
      const p = pilha.pop();
      const x = p % largura;
      const y = (p / largura) | 0;
      n++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -vizinhanca; dy <= vizinhanca; dy++) {
        for (let dx = -vizinhanca; dx <= vizinhanca; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= largura || ny >= altura) continue;
          const q = ny * largura + nx;
          if (!rotulo[q] && px[q * 4 + 3] >= alfaMin) {
            rotulo[q] = id;
            pilha.push(q);
          }
        }
      }
    }
    lista.push({ id, x0, y0, x1, y1, n });
  }
  return { rotulo, lista: lista.filter((m) => m.n >= tamanhoMin) };
}

// Ordem de leitura: faixas horizontais da folha, depois da esquerda para a direita.
function emOrdemDeLeitura(lista, cortesY) {
  const faixa = (m) => cortesY.filter((c) => m.y0 >= c).length;
  return [...lista].sort((a, b) => faixa(a) - faixa(b) || a.x0 - b.x0);
}

// Reduz a caixa por média de área para lw x lh. Modo 'recorte': alfa binário e cor só dos
// pixels da mancha (borda nítida, sem sujar a cor). Modo 'alfa': mantém a transparência média.
// `curva(sy)`, se dada, desloca a amostragem de cada linha da origem em pixels fracionários
// (positivo = o desenho vai para a esquerda), para entortar antes de reduzir.
function reduzir(img, caixa, lw, lh, modo, rotulo, id, curva) {
  const { largura, px } = img;
  const saida = new Float32Array(lw * lh * 4);
  const passoX = (caixa.x1 - caixa.x0 + 1) / lw;
  const passoY = (caixa.y1 - caixa.y0 + 1) / lh;
  for (let ty = 0; ty < lh; ty++) {
    for (let tx = 0; tx < lw; tx++) {
      const sx0 = caixa.x0 + tx * passoX;
      const sy0 = caixa.y0 + ty * passoY;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let peso = 0;
      let total = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy0 + passoY); sy++) {
        const bx0 = sx0 + (curva ? curva(sy) : 0);
        for (let sx = Math.floor(bx0); sx < Math.ceil(bx0 + passoX); sx++) {
          const cobre =
            Math.max(0, Math.min(sx + 1, bx0 + passoX) - Math.max(sx, bx0)) *
            Math.max(0, Math.min(sy + 1, sy0 + passoY) - Math.max(sy, sy0));
          if (!cobre) continue;
          total += cobre;
          if (sx < 0 || sx >= largura || sx > caixa.x1 || sy < caixa.y0 || sy > caixa.y1) continue;
          if (!rotulo && sx < caixa.x0) continue;
          const i = sy * largura + sx;
          if (rotulo && rotulo[i] !== id) continue;
          const w = modo === 'alfa' ? (cobre * px[i * 4 + 3]) / 255 : cobre;
          r += px[i * 4] * w;
          g += px[i * 4 + 1] * w;
          b += px[i * 4 + 2] * w;
          a += w;
          peso += cobre;
        }
      }
      const o = (ty * lw + tx) * 4;
      if (modo === 'alfa') {
        if (!a) continue;
        saida[o] = r / a;
        saida[o + 1] = g / a;
        saida[o + 2] = b / a;
        saida[o + 3] = (255 * a) / total;
      } else if (peso / total >= 0.45) {
        saida[o] = r / a;
        saida[o + 1] = g / a;
        saida[o + 2] = b / a;
        saida[o + 3] = 255;
      }
    }
  }
  return { lw, lh, px: saida };
}

function kmeans(amostras, k) {
  const ordenadas = [...amostras].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centros = Array.from({ length: k }, (_, i) => [...ordenadas[Math.floor(((i + 0.5) * ordenadas.length) / k)]]);
  for (let volta = 0; volta < 20; volta++) {
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

// Reduz a paleta do grupo inteiro de uma vez, para os sprites irmãos dividirem as mesmas cores.
// Com muitos pixels (os quadros do vento), a paleta é calculada sobre uma amostra espaçada.
function quantizar(reduzidos, cores) {
  const pixels = reduzidos.reduce((soma, red) => soma + red.lw * red.lh, 0);
  const salto = Math.max(1, Math.floor(pixels / AMOSTRAS_PALETA));
  const amostras = [];
  let contador = 0;
  for (const red of reduzidos) {
    for (let i = 0; i < red.lw * red.lh; i++) {
      if (red.px[i * 4 + 3] && contador++ % salto === 0) {
        amostras.push([red.px[i * 4], red.px[i * 4 + 1], red.px[i * 4 + 2]]);
      }
    }
  }
  const paleta = kmeans(amostras, cores);
  const distancia = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  // Quadros de vento (com `anterior`, na ordem): o pixel mantém a cor que tinha no quadro
  // anterior enquanto ela for quase tão boa quanto a melhor da paleta. Sem isso, a mudança
  // mínima de média entre dois quadros troca a cor de 1/4 da copa e ela "ferve".
  for (const red of reduzidos) {
    for (let i = 0; i < red.lw * red.lh; i++) {
      if (!red.px[i * 4 + 3]) continue;
      const bruta = [red.px[i * 4], red.px[i * 4 + 1], red.px[i * 4 + 2]];
      let cor = paleta[maisProxima(paleta, bruta)];
      const antes = red.anterior && red.anterior.px[i * 4 + 3] ? red.anterior.px.subarray(i * 4, i * 4 + 3) : null;
      if (antes && distancia(bruta, antes) <= distancia(bruta, cor) + ESTABILIDADE_COR) cor = antes;
      red.px.set(cor, i * 4);
    }
  }
}

// Cada mancha vira um recorte. Com `vento`, vira QUADROS_VENTO recortes: a planta entortada
// na folha grande (base parada, copa vergando para a esquerda com o quadrado da altura), do
// repouso até a curvatura máxima, e só depois reduzida. A curva cai entre os pixels do jogo e
// a redução a transforma em pequenas trocas de cor no contorno, em vez de faixas deslocadas.
// Todos os quadros têm o mesmo tamanho: `margem` px a mais à esquerda para a copa vergar.
// `escala` pode ser um número ou uma função da altura da mancha na folha de origem.
function recortarGrupo(arquivo, { alfaMin, vizinhanca, tamanhoMin, cortesY, escala: escalaGrupo, vento = false }) {
  const img = lerPng(path.join(FONTES, arquivo));
  const { rotulo, lista } = manchas(img, alfaMin, vizinhanca, tamanhoMin);
  return emOrdemDeLeitura(lista, cortesY).map((m) => {
    const alturaFolha = m.y1 - m.y0 + 1;
    const escala = typeof escalaGrupo === 'function' ? escalaGrupo(alturaFolha) : escalaGrupo;
    const lw = Math.max(1, Math.round((m.x1 - m.x0 + 1) * escala));
    const lh = Math.max(1, Math.round(alturaFolha * escala));
    if (!vento) return { alturaFolha, quadros: [reduzir(img, m, lw, lh, 'recorte', rotulo, m.id)] };

    const curvaMax = CURVA_VENTO.base + lh / CURVA_VENTO.porAltura; // em pixels do jogo
    const margem = Math.ceil(curvaMax);
    const caixa = { ...m, x0: m.x1 + 1 - (lw + margem) / escala };
    const quadros = [];
    for (let k = 0; k < QUADROS_VENTO; k++) {
      const topo = ((curvaMax / escala) * k) / (QUADROS_VENTO - 1);
      const curva = (sy) => topo * ((m.y1 + 1 - sy) / alturaFolha) ** 2;
      const red = reduzir(img, caixa, lw + margem, lh, 'recorte', rotulo, m.id, curva);
      quadros.push(Object.assign(red, { margem, anterior: quadros[k - 1] }));
    }
    return { alturaFolha, quadros };
  });
}

// O céu da paisagem é um degradê vertical liso: descendo cada coluna, a cor muda pouco de
// um pixel para o outro até bater na montanha. Em encostas sombreadas quase da cor do céu
// a descida escorrega e abre um "dente" estreito no contorno; esses dentes são aparados
// pela mediana das colunas vizinhas. Devolve a máscara do terreno (1) e a cor do céu por
// linha (mediana das colunas, que o céu é igual na horizontal).
function separarCeu(img) {
  const { largura, altura, px } = img;
  const cor = (x, y) => px.subarray((y * largura + x) * 4, (y * largura + x) * 4 + 3);
  const perto = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < LIMITE_CEU;
  const amostras = Array.from({ length: altura }, () => [[], [], []]);
  const contorno = [];
  for (let x = 0; x < largura; x++) {
    let ref = cor(x, 0);
    let y = 0;
    for (; y < altura; y++) {
      const c = cor(x, y);
      if (perto(c, ref)) {
        ref = c;
        amostras[y].forEach((canal, i) => canal.push(c[i]));
        continue;
      }
      // Um pixel solto fora do degradê é ruído; montanha é quando os de baixo também saem.
      const ruido = y + 2 < altura && (perto(cor(x, y + 1), ref) || perto(cor(x, y + 2), ref));
      if (!ruido) break;
    }
    contorno.push(y);
  }

  const mediana = (v) => [...v].sort((a, b) => a - b)[v.length >> 1];
  const terreno = new Int32Array(largura * altura);
  for (let x = 0; x < largura; x++) {
    const vizinhas = contorno.slice(Math.max(0, x - VIZINHANCA_CONTORNO), x + VIZINHANCA_CONTORNO + 1);
    const topo = Math.min(contorno[x], mediana(vizinhas) + FOLGA_CONTORNO);
    for (let y = topo; y < altura; y++) terreno[y * largura + x] = 1;
  }

  const linhas = [];
  let ultima = [0, 0, 0];
  for (const canais of amostras) {
    if (canais[0].length) ultima = canais.map(mediana);
    linhas.push(ultima);
  }
  return { terreno, linhas };
}

// Paisagem de fundo: a folha inteira reduzida para a altura da tela, mantendo a proporção.
// Ela é mais larga que a tela e o jogo a desliza devagar quando a câmera anda (paralaxe).
const imgPaisagem = lerPng(path.join(FONTES, 'paisagem.png'));
const { terreno, linhas: linhasCeu } = separarCeu(imgPaisagem);
const paisagem = reduzir(
  imgPaisagem,
  { x0: 0, y0: 0, x1: imgPaisagem.largura - 1, y1: imgPaisagem.altura - 1 },
  Math.round((imgPaisagem.largura * TELA.altura) / imgPaisagem.altura),
  TELA.altura,
  'recorte',
  terreno,
  1,
);
quantizar([paisagem], 64);

// Céu: a cor do degradê em cada linha da tela, pintada pelo jogo atrás do sol.
const colunaCeu = { largura: 1, altura: linhasCeu.length, px: Buffer.alloc(linhasCeu.length * 4) };
linhasCeu.forEach((c, y) => colunaCeu.px.set([...c.map(Math.round), 255], y * 4));
const reduzidoCeu = reduzir(colunaCeu, { x0: 0, y0: 0, x1: 0, y1: linhasCeu.length - 1 }, 1, TELA.altura, 'recorte');
const ceu = Array.from({ length: TELA.altura }, (_, y) =>
  '#' + [0, 1, 2].map((c) => Math.round(reduzidoCeu.px[y * 4 + c]).toString(16).padStart(2, '0')).join(''),
);

// Sol: só o disco opaco da folha (o brilho pontudo em volta fica de fora), reduzido e
// recortado num círculo. A borda é suavizada pela fração de cada pixel que cai dentro do
// círculo (alfa parcial), senão o contorno de 15px sai quadrado; a volta de fora recebe a
// cor da borda laranja da folha.
const imgSol = lerPng(path.join(FONTES, 'sol.png'));
const [disco] = manchas(imgSol, 250, 1, 1000).lista.sort((a, b) => b.n - a.n);
const raioFolha = (disco.x1 - disco.x0 + disco.y1 - disco.y0 + 2) / 4;
const cxFolha = (disco.x0 + disco.x1) / 2;
const cyFolha = (disco.y0 + disco.y1) / 2;
const sol = reduzir(imgSol, disco, DIAMETRO_SOL, DIAMETRO_SOL, 'recorte');
const bordaSol = [0, 1, 2].map((c) => {
  const amostras = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => {
    const x = Math.round(cxFolha + dx * raioFolha * 0.96);
    const y = Math.round(cyFolha + dy * raioFolha * 0.96);
    return imgSol.px[(y * imgSol.largura + x) * 4 + c];
  });
  return amostras.reduce((a, b) => a + b, 0) / amostras.length;
});
const raioSol = DIAMETRO_SOL / 2;
const SUBAMOSTRAS = 8;
for (let y = 0; y < DIAMETRO_SOL; y++) {
  for (let x = 0; x < DIAMETRO_SOL; x++) {
    let dentro = 0;
    for (let sy = 0; sy < SUBAMOSTRAS; sy++) {
      for (let sx = 0; sx < SUBAMOSTRAS; sx++) {
        const dx = x + (sx + 0.5) / SUBAMOSTRAS - raioSol;
        const dy = y + (sy + 0.5) / SUBAMOSTRAS - raioSol;
        if (dx * dx + dy * dy <= raioSol * raioSol) dentro++;
      }
    }
    const cobertura = dentro / SUBAMOSTRAS ** 2;
    const o = (y * DIAMETRO_SOL + x) * 4;
    if (cobertura < 0.06) {
      sol.px.fill(0, o, o + 4);
      continue;
    }
    if (Math.hypot(x + 0.5 - raioSol, y + 0.5 - raioSol) > raioSol - 1.3) sol.px.set(bordaSol, o);
    sol.px[o + 3] = 255 * cobertura;
  }
}

const nuvens = recortarGrupo('nuvens.png', {
  alfaMin: 128,
  vizinhanca: 3,
  tamanhoMin: 200,
  cortesY: [340, 540],
  escala: ESCALA_NUVENS,
}).map((q) => q.quadros[0]);
quantizar(nuvens, 12);

const vegetacao = recortarGrupo('arvores.png', {
  alfaMin: 128,
  vizinhanca: 3,
  tamanhoMin: 200,
  cortesY: [400, 650],
  escala: (alturaFolha) => (alturaFolha >= ALTURA_MIN_ARVORE ? ESCALA_ARVORES : ESCALA_ARBUSTOS),
  vento: true,
});
quantizar(
  vegetacao.flatMap((q) => q.quadros),
  40,
);
const arvores = vegetacao.filter((q) => q.alturaFolha >= ALTURA_MIN_ARVORE).map((q) => q.quadros);
const arbustos = vegetacao.filter((q) => q.alturaFolha < ALTURA_MIN_ARVORE).map((q) => q.quadros);

// Empacota em prateleiras de até LARGURA_FOLHA px, na ordem da lista, com 1px de folga; os
// quadros de vento de uma planta ficam lado a lado.
const ESPACO = 1;
const recortes = [paisagem, sol, ...nuvens, ...arvores.flat(), ...arbustos.flat()];
const posicoes = new Map();
let cursor = 0;
let topo = 0;
let alturaPrateleira = 0;
for (const red of recortes) {
  if (cursor + red.lw > LARGURA_FOLHA) {
    topo += alturaPrateleira + ESPACO;
    cursor = 0;
    alturaPrateleira = 0;
  }
  posicoes.set(red, { x: cursor, y: topo });
  cursor += red.lw + ESPACO;
  alturaPrateleira = Math.max(alturaPrateleira, red.lh);
}
const larguraFolha = LARGURA_FOLHA;
const alturaFolha = topo + alturaPrateleira;
const folha = Buffer.alloc(larguraFolha * alturaFolha * 4);
for (const red of recortes) {
  const { x: x0, y: y0 } = posicoes.get(red);
  for (let y = 0; y < red.lh; y++) {
    for (let x = 0; x < red.lw; x++) {
      const i = (y * red.lw + x) * 4;
      if (!red.px[i + 3]) continue;
      const o = ((y0 + y) * larguraFolha + x0 + x) * 4;
      for (let c = 0; c < 4; c++) folha[o + c] = Math.round(red.px[i + c]);
    }
  }
}
const recorte = (red) => ({ ...posicoes.get(red), w: red.lw, h: red.lh, ...(red.margem ? { m: red.margem } : {}) });
const quadros = {
  paisagem: recorte(paisagem),
  sol: recorte(sol),
  nuvens: nuvens.map(recorte),
  arvores: arvores.map((q) => q.map(recorte)),
  arbustos: arbustos.map((q) => q.map(recorte)),
};
quadros.ceu = ceu;

escreverPng(SAIDA_PNG, larguraFolha, alturaFolha, folha);
fs.writeFileSync(
  SAIDA_JS,
  '// Gerado por ferramentas/gerar-cenario.cjs a partir de fontes/ — não editar à mão.\n' +
    '// x/y/w/h: recorte em assets/cenario.png; ceu: cor de cada linha da tela.\n' +
    '// Árvores e arbustos: lista de quadros do vento (repouso → curvatura máxima); m é a\n' +
    '// margem à esquerda por onde a copa verga (a base ocupa os w - m px da direita).\n' +
    '// Árvores, arbustos e nuvens seguem a ordem de leitura da folha de origem\n' +
    '// (fileira por fileira, da esquerda para a direita).\n' +
    `export const QUADROS_CENARIO = ${JSON.stringify(quadros)};\n`,
);
console.log(
  `céu + paisagem + sol + ${nuvens.length} nuvens + ${arvores.length} árvores + ${arbustos.length} arbustos` +
    ` -> ${path.relative(RAIZ, SAIDA_PNG)} (${larguraFolha}x${alturaFolha})`,
);
