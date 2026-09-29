// Gera a logo da tela inicial (apps/cliente/src/assets/logo.webp) a partir da arte original
// (fontes/logo.png), acertando as cores dela com as da floresta ao pôr do sol que fica atrás
// (assets/tela-inicial.webp). A arte original é de dia: verdes claros e frios, água ciano, pedras
// cinza. Na cena é fim de tarde: as copas são escuras com a ponta amarelada pelo sol, a água é
// azul-lavanda, as pedras e as montanhas puxam para o roxo, e o sol (à direita) acende as bordas.
//
// Uso (na pasta jogo/):  npm run arte:logo
//
// O que muda, pixel a pixel (a transparência fica igual):
// - verdes: mais escuros, com a sombra puxando para o verde-azulado e a luz para o amarelo, como
//   nas copas da cena;
// - azuis (a cachoeira e o contorno): viram o azul-lavanda da água da cena;
// - pedras (cinzas): um toque de roxo, como as montanhas;
// - letras (bege): um pouco mais quentes, pegando o pôr do sol;
// - o cristal (laranja e amarelo) fica como está: ele é o sol da estação;
// - sombra roxa em tudo que é escuro, a parte de baixo da ilha mais escura que o topo, e uma luz
//   quente nas bordas viradas para o sol (em cima e à direita), fria nas do outro lado.

const path = require('path');
const sharp = require('sharp');

const RAIZ = path.join(__dirname, '..');
const FONTE = path.join(RAIZ, 'fontes', 'logo.png');
const SAIDA = path.join(RAIZ, 'apps', 'cliente', 'src', 'assets', 'logo.webp');

// Um "pixel" da arte mede uns 10 px da imagem: a luz das bordas é conferida a esta distância.
const BORDA = 9;
const LUZ_DO_SOL = [255, 176, 96]; // a luz quente das bordas viradas para o sol
const LUZ_DO_CEU = [150, 128, 255]; // a luz fria do céu, do outro lado
const SOMBRA = [30, 20, 58]; // o roxo que entra no escuro

const limitar = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const misturar = (a, b, t) => a + (b - a) * t;

function paraHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function deHsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// A cor de um pixel no pôr do sol (sem as luzes das bordas). `v`: a altura na arte, de 0 a 1.
function corrigir(r, g, b, v) {
  let [h, s, l] = paraHsl(r, g, b);
  const cristal = h >= 22 && h <= 62 && s > 0.55 && l > 0.3;
  if (cristal) return [r, g, b];

  if (h >= 60 && h <= 178 && s > 0.12) {
    // Verde: a luz vai para o amarelo (75°), o meio fica no verde (110°), a sombra no
    // verde-azulado (140°); tudo mais escuro, a sombra bem mais.
    const alvo = l > 0.36 ? misturar(100, 72, limitar((l - 0.36) / 0.2)) : misturar(142, 108, limitar((l - 0.08) / 0.28));
    h = misturar(h, alvo, 0.7);
    l = Math.pow(l, 1.1) * 0.93;
    s = limitar(s * (l < 0.15 ? 0.95 : 0.9));
  } else if (h > 178 && h <= 250 && s > 0.2) {
    // Azul: a água e o contorno ficam azul-lavanda.
    h = misturar(h, 226, 0.8);
    s *= 0.78;
    l = l > 0.3 ? misturar(l, 0.62, 0.25) : l * 0.95;
  } else if (s < 0.2) {
    // Cinza (as pedras): um pouco de roxo.
    h = 262;
    s = Math.max(s, 0.1 + 0.08 * (1 - l));
    l *= 0.92;
  } else if (h >= 8 && h < 60 && l > 0.45) {
    // Bege (as letras): mais quente.
    h = misturar(h, 22, 0.35);
    s = limitar(s * 1.08);
    l *= 0.97;
  } else {
    // Marrons (troncos e terra): um pouco mais escuros e avermelhados.
    h = h < 60 ? misturar(h, 18, 0.3) : h;
    l *= 0.9;
  }
  // A ilha escurece descendo: o topo pega a luz do cristal e do céu, o fundo fica na sombra.
  l *= 1.04 - 0.14 * Math.pow(v, 1.4);
  let [rr, gg, bb] = deHsl(h, s, limitar(l));
  // Sombra roxa no escuro.
  const escuro = Math.pow(1 - limitar(l / 0.35), 2) * 0.45;
  rr = misturar(rr, SOMBRA[0], escuro);
  gg = misturar(gg, SOMBRA[1], escuro);
  bb = misturar(bb, SOMBRA[2], escuro);
  return [rr, gg, bb];
}

async function main() {
  const { data, info } = await sharp(FONTE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const alfa = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : data[(y * W + x) * 4 + 3]);
  const saida = Buffer.alloc(data.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = data[i + 3];
      saida[i + 3] = a;
      if (a === 0) continue;
      let [r, g, b] = corrigir(data[i], data[i + 1], data[i + 2], y / H);
      // As bordas: o que tem vazio em cima e à direita pega o sol; em cima e à esquerda, o céu.
      const sol = (1 - alfa(x + BORDA, y - BORDA) / 255) * 0.7 + (1 - alfa(x + BORDA, y) / 255) * 0.3;
      const ceu = (1 - alfa(x - BORDA, y - BORDA) / 255) * 0.22;
      const luz = paraHsl(r, g, b)[2];
      const forcaSol = sol * (0.35 + 0.65 * (1 - luz)) * (1 - 0.5 * (y / H));
      // Soma de luz com teto (screen): acende sem estourar.
      r = 255 - ((255 - r) * (255 - LUZ_DO_SOL[0] * forcaSol)) / 255;
      g = 255 - ((255 - g) * (255 - LUZ_DO_SOL[1] * forcaSol)) / 255;
      b = 255 - ((255 - b) * (255 - LUZ_DO_SOL[2] * forcaSol)) / 255;
      r = 255 - ((255 - r) * (255 - LUZ_DO_CEU[0] * ceu)) / 255;
      g = 255 - ((255 - g) * (255 - LUZ_DO_CEU[1] * ceu)) / 255;
      b = 255 - ((255 - b) * (255 - LUZ_DO_CEU[2] * ceu)) / 255;
      saida[i] = Math.round(limitar(r, 0, 255));
      saida[i + 1] = Math.round(limitar(g, 0, 255));
      saida[i + 2] = Math.round(limitar(b, 0, 255));
    }
  }
  const destino = process.argv[2] ?? SAIDA;
  await sharp(saida, { raw: { width: W, height: H, channels: 4 } })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(destino);
  console.log(`logo gravada em ${path.relative(RAIZ, destino)}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
