// Peças comuns dos geradores de sprite de personagem (gerar-anjo.cjs, gerar-herois.cjs): achar
// um quadro na folha de referência, reduzir para o tamanho do jogo, deixar a redução nítida
// (afiar, contornar, limpar), montar a paleta e achar o eixo do corpo.

const OPACO = 128; // alfa mínimo para um pixel da folha contar como personagem

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

// A média de área deixa tudo meio borrado: puxa cada pixel para longe da média dos vizinhos
// opacos (3×3), o que devolve o contraste dos detalhes — olhos, rachaduras, dobras da roupa.
function afiar(red, forca) {
  const { lw, lh, px } = red;
  const saida = Float32Array.from(px);
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const o = (y * lw + x) * 4;
      if (!px[o + 3]) continue;
      const soma = [0, 0, 0];
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= lw || yy >= lh) continue;
          const q = (yy * lw + xx) * 4;
          if (!px[q + 3]) continue;
          soma[0] += px[q];
          soma[1] += px[q + 1];
          soma[2] += px[q + 2];
          n++;
        }
      }
      for (let c = 0; c < 3; c++) saida[o + c] = Math.max(0, Math.min(255, px[o + c] + forca * (px[o + c] - soma[c] / n)));
    }
  }
  return { lw, lh, px: saida };
}

const opacoEm = (red, x, y) => x >= 0 && y >= 0 && x < red.lw && y < red.lh && red.px[(y * red.lw + x) * 4 + 3] > 0;

// O contorno da folha original some na redução: escurece a borda da silhueta (os pixels opacos
// com um vizinho de lado vazio), e o personagem volta a se destacar do cenário.
function contornar(red, fator) {
  const { lw, lh, px } = red;
  const saida = Float32Array.from(px);
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const o = (y * lw + x) * 4;
      if (!px[o + 3]) continue;
      const borda = !opacoEm(red, x - 1, y) || !opacoEm(red, x + 1, y) || !opacoEm(red, x, y - 1) || !opacoEm(red, x, y + 1);
      if (borda) for (let c = 0; c < 3; c++) saida[o + c] = px[o + c] * fator;
    }
  }
  return { lw, lh, px: saida };
}

// Depois da paleta: tira o pixel solto (sem nenhum vizinho, nem na diagonal) e tapa o furo de um
// pixel (vazio com os quatro vizinhos de lado cheios) com a cor da paleta mais perto da média deles.
function limpar(red, paleta) {
  const { lw, lh, px } = red;
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const o = (y * lw + x) * 4;
      if (!px[o + 3]) continue;
      let vizinhos = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && opacoEm(red, x + dx, y + dy)) vizinhos++;
      if (!vizinhos) px[o + 3] = 0;
    }
  }
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const o = (y * lw + x) * 4;
      if (px[o + 3]) continue;
      const lados = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      if (!lados.every(([xx, yy]) => opacoEm(red, xx, yy))) continue;
      const media = [0, 0, 0];
      for (const [xx, yy] of lados) for (let c = 0; c < 3; c++) media[c] += px[(yy * lw + xx) * 4 + c] / 4;
      const cor = paleta[maisProxima(paleta, media)];
      px[o] = cor[0];
      px[o + 1] = cor[1];
      px[o + 2] = cor[2];
      px[o + 3] = 255;
    }
  }
  return red;
}

// Tapa as frestas do corpo (depois de limpar): o vazio de um pixel entre duas partes — cheio dos
// dois lados, na horizontal ou na vertical — e os bolsões de vazio fechados por dentro da
// silhueta. Reduzido, o vão entre uma pedra e outra (ou entre o braço e o tronco) virava um buraco
// por onde o cenário aparecia. Tapa com a cor dos vizinhos escurecida, na paleta: fica a sombra
// entre as partes, não um remendo claro. Repete até não sobrar (tapar uma fecha a do lado).
const SOMBRA_DA_FRESTA = 0.45;
function taparFrestas(red, paleta) {
  const { lw, lh, px } = red;
  const tapar = (x, y) => {
    const media = [0, 0, 0];
    let n = 0;
    for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (!opacoEm(red, xx, yy)) continue;
      for (let c = 0; c < 3; c++) media[c] += px[(yy * lw + xx) * 4 + c];
      n++;
    }
    const cor = paleta[maisProxima(paleta, media.map((v) => (v / n) * SOMBRA_DA_FRESTA))];
    px.set([...cor, 255], (y * lw + x) * 4);
  };
  for (let volta = 0; volta < 4; volta++) {
    const frestas = [];
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        if (opacoEm(red, x, y)) continue;
        const deLado = opacoEm(red, x - 1, y) && opacoEm(red, x + 1, y);
        const emPe = opacoEm(red, x, y - 1) && opacoEm(red, x, y + 1);
        if (deLado || emPe) frestas.push([x, y]);
      }
    }
    // Os bolsões: o vazio que não chega à borda do quadro andando por vazio (nem na diagonal).
    const fora = new Uint8Array(lw * lh);
    const pilha = [];
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        if ((x === 0 || y === 0 || x === lw - 1 || y === lh - 1) && !opacoEm(red, x, y)) {
          fora[y * lw + x] = 1;
          pilha.push(y * lw + x);
        }
      }
    }
    while (pilha.length) {
      const p = pilha.pop();
      const x = p % lw;
      const y = (p / lw) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= lw || ny >= lh || fora[ny * lw + nx] || opacoEm(red, nx, ny)) continue;
          fora[ny * lw + nx] = 1;
          pilha.push(ny * lw + nx);
        }
      }
    }
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) if (!opacoEm(red, x, y) && !fora[y * lw + x]) frestas.push([x, y]);
    if (!frestas.length) break;
    for (const [x, y] of frestas) if (!opacoEm(red, x, y)) tapar(x, y);
  }
  return red;
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

module.exports = { OPACO, recortarQuadro, reduzir, afiar, contornar, limpar, taparFrestas, kmeans, maisProxima, ancoraX };
