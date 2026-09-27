// Peças comuns dos geradores de sprite de personagem (gerar-anjo.cjs, gerar-leslie.cjs): achar
// um quadro na folha de referência, reduzir para o tamanho do jogo, montar a paleta e achar o
// eixo do corpo.

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

module.exports = { OPACO, recortarQuadro, reduzir, kmeans, maisProxima, ancoraX };
