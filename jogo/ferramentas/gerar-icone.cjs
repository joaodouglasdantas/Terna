// Gera o ícone do site (a aba do navegador, a tela inicial do celular e o app instalado) a partir
// da grade abaixo: o cristal amarelo da logo, pousado numa ilhazinha de pedra com musgo e uma
// cachoeira, e duas pedrinhas flutuando, em pixel art de 32×32. O contorno escuro deixa o
// ícone legível em aba clara e escura.
//
// Uso (na pasta jogo/):  npm run arte:icone
//
// Saídas, em apps/cliente/public/ (vão como estão para o site):
// - icone.svg: a aba dos navegadores que aceitam SVG (nítido em qualquer tamanho);
// - icone-32.png: a aba dos outros;
// - icone-180.png: o ícone do iPhone/iPad (com fundo, que lá não pode ser transparente);
// - icone-192.png e icone-512.png: os do app instalado (manifest.webmanifest).

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SAIDA = path.join(__dirname, '..', 'apps', 'cliente', 'public');
const FUNDO = '#1b1b24'; // o fundo da página do jogo

// o: contorno; Y, y, O, r: as faces do cristal, da luz à sombra; p, w: o brilho em cruz;
// G, g: o musgo; R, k, K: a pedra; B, b: a água.
const PALETA = {
  o: '#2a1206',
  Y: '#fdf16c',
  y: '#fabd10',
  O: '#ee7901',
  r: '#b04e06',
  p: '#fff6c4',
  w: '#ffffff',
  G: '#86d44e',
  g: '#3f9a2e',
  R: '#8c8aa8',
  k: '#5f5c7c',
  K: '#3c3952',
  B: '#3f8fe8',
  b: '#bfe6ff',
};

const GRADE = [
  '...............oo...............',
  '..............oYro..............',
  '..............oYro..............',
  '.............oYpyro.............',
  '.............oYpyro.............',
  '............oYYpyyro............',
  '............oYYpyyro............',
  '...........oYYYpyyyro...........',
  '...........oYYYpyyyro......oo...',
  '..........oYYYYpyyyyro....oGgo..',
  '..........oYYYYwyyyyro....okKo..',
  '.........oYYppwwwpppyro....oo...',
  '...oo....oYYYYYwyyyyyro.........',
  '..ogGo...oOyyyypOOOOOro.........',
  '..okKo....oOyyypOOOOro..........',
  '...oo.....oOyyypOOOOro..........',
  '..........oOyyypOOOOro..........',
  '...........oOyypOOOro...........',
  '...........oOyypOOOro...........',
  '.........ooooOypOOroooo.........',
  '.......ooGGGGOypOOrGGGGoo.......',
  '......oggGggGgOpOrGggGggGo......',
  '.....oggRRRggROpOrRBBRRRggo.....',
  '.....ogRRRRRgRkOrkkBBkkkkgo.....',
  '......okkkkkkkkOrkkbBKKKKo......',
  '.......okkkkkkkkkkkBBKKKo.......',
  '........ooKKKKKKKKKBBKoo........',
  '..........ooKKKKKKKbBo..........',
  '............ooKKKKoBBo..........',
  '..............oKKooBBo..........',
  '...............oo.obBo..........',
  '...................oo...........',
];

const LADO = GRADE.length;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Os pixels em RGBA, com `fundo` (ou transparente) onde a grade tem '.'.
function pixels(fundo = null) {
  const dados = Buffer.alloc(LADO * LADO * 4);
  GRADE.forEach((linha, y) => {
    [...linha].forEach((c, x) => {
      const i = (y * LADO + x) * 4;
      const cor = c === '.' ? fundo : PALETA[c];
      if (!cor) return;
      const [r, g, b] = rgb(cor);
      dados[i] = r;
      dados[i + 1] = g;
      dados[i + 2] = b;
      dados[i + 3] = 255;
    });
  });
  return dados;
}

// PNG com cada pixel da grade virando `escala`×`escala` (sem suavizar), com `margem` px de
// `fundo` em volta.
async function png(nome, escala, fundo = null, margem = 0) {
  const lado = LADO * escala;
  let imagem = sharp(pixels(fundo), { raw: { width: LADO, height: LADO, channels: 4 } }).resize(lado, lado, { kernel: 'nearest' });
  if (margem) {
    const [r, g, b] = rgb(fundo);
    imagem = sharp(await imagem.png().toBuffer()).extend({ top: margem, bottom: margem, left: margem, right: margem, background: { r, g, b, alpha: 1 } });
  }
  await imagem.png().toFile(path.join(SAIDA, nome));
}

// SVG com um retângulo por trecho de pixels iguais na mesma linha.
function svg() {
  const partes = [];
  GRADE.forEach((linha, y) => {
    let x = 0;
    while (x < LADO) {
      const c = linha[x];
      let fim = x;
      while (fim + 1 < LADO && linha[fim + 1] === c) fim++;
      if (c !== '.') partes.push(`<rect x="${x}" y="${y}" width="${fim - x + 1}" height="1" fill="${PALETA[c]}"/>`);
      x = fim + 1;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LADO} ${LADO}" shape-rendering="crispEdges">${partes.join('')}</svg>\n`;
}

async function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  fs.writeFileSync(path.join(SAIDA, 'icone.svg'), svg());
  await png('icone-32.png', 1);
  await png('icone-180.png', 5, FUNDO, 10); // 160 + 2 × 10
  await png('icone-192.png', 6, FUNDO);
  await png('icone-512.png', 16, FUNDO);
  console.log('ícones gerados em', path.relative(process.cwd(), SAIDA));
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
