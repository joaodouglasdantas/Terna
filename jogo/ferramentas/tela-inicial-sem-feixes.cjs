// Tira da arte de fundo dos menus (apps/cliente/src/assets/tela-inicial.webp) os feixes de luz
// parados que a arte tem no céu, acima do meio: a logo fica bem ali, e os raios dela girando na
// frente dos feixes parados de trás ficavam estranhos.
//
// Uso (na pasta jogo/), depois do ferramentas/tela-inicial.py:  npm run arte:tela-inicial-feixes
//
// Um feixe é luz somada ao céu: liso ao longo dele e esfumado dos lados. Para cada feixe, o céu
// sem ele é o que está logo dos dois lados (ligado em linha reta de um lado ao outro); a luz a mais
// no meio, alisada ao longo do feixe (a mediana de um trecho comprido, que ignora uma estrela ou a
// borda de uma nuvem no caminho), é o feixe — e só ela sai. O que passa por trás dele (as nuvens,
// as estrelas) fica.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ARQUIVO = path.join(__dirname, '..', 'apps', 'cliente', 'src', 'assets', 'tela-inicial.webp');

// Os feixes, em pixels da arte (1672×940): de onde a onde vão e a meia largura.
const FEIXES = [
  { de: [781, 22], ate: [811, 106], meia: 14 },
  { de: [891, 17], ate: [871, 101], meia: 14 },
  { de: [693, 88], ate: [848, 248], meia: 15 },
];
const LADO = 4; // quantos pixels de cada lado, fora do feixe, dizem a cor do céu
const ALISA = 14; // meia janela da mediana ao longo do feixe
const PONTAS = 10; // as pontas do feixe somem aos poucos nesta distância

function mediana(lista) {
  const l = lista.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return l.length ? l[Math.floor(l.length / 2)] : 0;
}

async function main() {
  const entrada = process.argv[2] ?? ARQUIVO;
  const saida = process.argv[3] ?? ARQUIVO;
  const { data, info } = await sharp(fs.readFileSync(entrada)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const img = Float32Array.from(data);
  const ler = (x, y, c) => {
    // Bilinear: o feixe é inclinado, e os pontos dele caem entre os pixels.
    const x0 = Math.max(0, Math.min(W - 2, Math.floor(x)));
    const y0 = Math.max(0, Math.min(H - 2, Math.floor(y)));
    const fx = x - x0;
    const fy = y - y0;
    const p = (xx, yy) => img[(yy * W + xx) * 3 + c];
    return (p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx) * (1 - fy) + (p(x0, y0 + 1) * (1 - fx) + p(x0 + 1, y0 + 1) * fx) * fy;
  };

  for (const { de, ate, meia } of FEIXES) {
    const dx = ate[0] - de[0];
    const dy = ate[1] - de[1];
    const comprimento = Math.hypot(dx, dy);
    const ao = [dx / comprimento, dy / comprimento]; // ao longo
    const atravessa = [-ao[1], ao[0]];
    const ponto = (s, t) => [de[0] + ao[0] * s + atravessa[0] * t, de[1] + ao[1] * s + atravessa[1] * t];
    const S = Math.ceil(comprimento);
    const T = meia;
    // A luz a mais em cada ponto (s, t) do feixe, por canal.
    const luz = [0, 1, 2].map(() => Array.from({ length: S + 1 }, () => new Float32Array(2 * T + 1)));
    for (let s = 0; s <= S; s++) {
      for (let c = 0; c < 3; c++) {
        const esquerda = mediana(Array.from({ length: LADO }, (_, k) => ler(...ponto(s, -T - 1 - k), c)));
        const direita = mediana(Array.from({ length: LADO }, (_, k) => ler(...ponto(s, T + 1 + k), c)));
        for (let t = -T; t <= T; t++) {
          const ceu = esquerda + ((direita - esquerda) * (t + T)) / (2 * T);
          luz[c][s][t + T] = ler(...ponto(s, t), c) - ceu;
        }
      }
    }
    // Alisada ao longo do feixe; só luz a mais (nunca escurece o que já era escuro).
    const feixe = luz.map((canal) =>
      canal.map((_, s) => {
        const linha = new Float32Array(2 * T + 1);
        for (let t = 0; t <= 2 * T; t++) {
          const janela = [];
          for (let k = Math.max(0, s - ALISA); k <= Math.min(S, s + ALISA); k++) janela.push(canal[k][t]);
          linha[t] = Math.max(0, mediana(janela));
        }
        return linha;
      }),
    );
    // Tira a luz de cada pixel dentro do feixe (achando o (s, t) dele), com as bordas e as pontas
    // esfumadas.
    const xs = [de[0], ate[0]];
    const ys = [de[1], ate[1]];
    for (let y = Math.floor(Math.min(...ys) - T - 2); y <= Math.ceil(Math.max(...ys) + T + 2); y++) {
      for (let x = Math.floor(Math.min(...xs) - T - 2); x <= Math.ceil(Math.max(...xs) + T + 2); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const rx = x - de[0];
        const ry = y - de[1];
        const s = rx * ao[0] + ry * ao[1];
        const t = rx * atravessa[0] + ry * atravessa[1];
        if (s < 0 || s > S || Math.abs(t) > T) continue;
        const peso = Math.min(1, s / PONTAS, (S - s) / PONTAS) * Math.min(1, (T - Math.abs(t)) / 2 + 0.5);
        const si = Math.round(s);
        const ti = Math.round(t) + T;
        for (let c = 0; c < 3; c++) img[(y * W + x) * 3 + c] -= feixe[c][si][ti] * Math.max(0, peso);
      }
    }
  }

  const bytes = Buffer.from(Uint8ClampedArray.from(img, (v) => Math.round(v)));
  const pronta = await sharp(bytes, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 92, effort: 6 }).toBuffer();
  fs.writeFileSync(saida, pronta); // a entrada e a saída podem ser o mesmo arquivo
  console.log(`sem os feixes: ${path.basename(saida)}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
