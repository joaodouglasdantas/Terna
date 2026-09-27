// Gera o sprite da Leslie, a dríade da floresta, a partir da folha de referência dela.
// Uso (na pasta jogo/): npm run arte:leslie
// Entrada: fontes/leslie.png (1536x1024, o fundo preto da folha original já transparente).
// Saída: apps/cliente/src/assets/leslie.png (quadros lado a lado) e
// apps/cliente/src/gerado/leslie-quadros.ts (recortes + eixo do corpo).
//
// A folha tem o mesmo desenho da do Anjo (fileiras IDLE, WALK, RUN, JUMP, FALL… à esquerda e a
// coluna FRENTE à direita), então os quadros saem do mesmo jeito (recorte-sprite.cjs).

const fs = require('fs');
const path = require('path');
const { lerPng, escreverPng } = require('./png.cjs');
const { recortarQuadro, reduzir, kmeans, maisProxima, ancoraX } = require('./recorte-sprite.cjs');

const RAIZ = path.join(__dirname, '..');
const FONTE = path.join(RAIZ, 'fontes', 'leslie.png');
const CLIENTE = path.join(RAIZ, 'apps', 'cliente', 'src');
const SAIDA_PNG = path.join(CLIENTE, 'assets', 'leslie.png');
const SAIDA_JS = path.join(CLIENTE, 'gerado', 'leslie-quadros.ts');

const ALTURA_EM_PE = 32; // altura em pé no jogo, em pixels (a mesma do Anjo)
const CORES = 28; // mais que o Anjo: o verde do cabelo e das folhas tem muitos tons

// Cada quadro é apontado por um ponto dentro dele na folha. `alturaRef`: a altura em pé daquele
// bloco da folha (a coluna FRENTE foi desenhada maior que as fileiras de lado).
const ANIMACOES = {
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
  // Fileira IDLE: de lado, em pé e com as pernas juntas — parada atacando, o braço do jogo vai por
  // cima. Fora da conta da paleta, como no Anjo.
  atacando: { alturaRef: 103, ancora: 'cabeca', foraDaPaleta: true, pontos: [[155, 75]] },
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

const img = mediana(lerPng(FONTE), 2);
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

escreverPng(SAIDA_PNG, larguraFolha, alturaFolha, folha);
fs.writeFileSync(
  SAIDA_JS,
  '// Gerado por ferramentas/gerar-leslie.cjs a partir de fontes/leslie.png — não editar à mão.\n' +
    '// x/y/w/h: recorte em assets/leslie.png; ax: eixo do corpo (os pés ficam na base do recorte).\n' +
    `export const QUADROS_LESLIE = ${JSON.stringify(quadros, null, 2)};\n`,
);
console.log(`${naFolha.length} quadros -> ${path.relative(RAIZ, SAIDA_PNG)} (${larguraFolha}x${alturaFolha})`);
