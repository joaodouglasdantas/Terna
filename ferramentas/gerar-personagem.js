// Gera o sprite do personagem a partir da folha de referência SpriteBase.png.
// Uso: node ferramentas/gerar-personagem.js
// Saída: assets/personagem.png (quadros lado a lado) e src/personagem-quadros.js (recortes + âncoras).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAIZ = path.join(__dirname, '..');
const FONTE = path.join(RAIZ, 'SpriteBase.png');
const SAIDA_PNG = path.join(RAIZ, 'assets', 'personagem.png');
const SAIDA_JS = path.join(RAIZ, 'src', 'personagem-quadros.js');

const ALTURA_EM_PE = 40; // altura do personagem parado no jogo, em pixels
const OPACO = 128; // alfa mínimo para um pixel da folha contar como personagem
const CORES = 24;

// Cada quadro é apontado por um ponto dentro dele na folha (1536x1024).
// As fileiras da esquerda e a coluna "FRENTE" foram desenhadas em escalas diferentes;
// `alturaRef` é a altura em pé daquele bloco, usada para igualar as duas.
const ANIMACOES = {
  parado: { alturaRef: 109, ancora: 'cabeca', pontos: [[1076, 150], [1076, 277]] },
  andando: {
    alturaRef: 98,
    ancora: 'cabeca',
    pontos: [[161, 196], [240, 196], [324, 196], [406, 196], [488, 196], [568, 196], [648, 196], [729, 196]],
  },
  subindo: { alturaRef: 98, ancora: 'cabeca', pontos: [[322, 430], [410, 420]] },
  caindo: { alturaRef: 98, ancora: 'cabeca', pontos: [[530, 570], [626, 570]] },
  deitado: { alturaRef: 98, ancora: 'caixa', pontos: [[468, 985], [575, 985]] },
};

function lerPng(arquivo) {
  const buf = fs.readFileSync(arquivo);
  let off = 8;
  let largura = 0;
  let altura = 0;
  const partes = [];
  while (off < buf.length) {
    const tam = buf.readUInt32BE(off);
    const tipo = buf.toString('ascii', off + 4, off + 8);
    if (tipo === 'IHDR') {
      largura = buf.readUInt32BE(off + 8);
      altura = buf.readUInt32BE(off + 12);
      if (buf[off + 16] !== 8 || buf[off + 17] !== 6 || buf[off + 20] !== 0) {
        throw new Error('SpriteBase.png precisa ser RGBA 8 bits sem entrelaçamento');
      }
    }
    if (tipo === 'IDAT') partes.push(buf.subarray(off + 8, off + 8 + tam));
    if (tipo === 'IEND') break;
    off += 12 + tam;
  }
  const bruto = zlib.inflateSync(Buffer.concat(partes));
  const passo = largura * 4;
  const px = Buffer.alloc(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    const filtro = bruto[y * (passo + 1)];
    const ini = y * (passo + 1) + 1;
    for (let x = 0; x < passo; x++) {
      const a = x >= 4 ? px[y * passo + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * passo + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * passo + x - 4] : 0;
      let v = bruto[ini + x];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * passo + x] = v & 255;
    }
  }
  return { largura, altura, px };
}

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABELA_CRC[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function escreverPng(arquivo, largura, altura, px) {
  const bloco = (tipo, dados) => {
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corpo));
    return Buffer.concat([tam, corpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const linhas = Buffer.alloc(altura * (largura * 4 + 1));
  for (let y = 0; y < altura; y++) {
    px.copy(linhas, y * (largura * 4 + 1) + 1, y * largura * 4, (y + 1) * largura * 4);
  }
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(
    arquivo,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      bloco('IHDR', ihdr),
      bloco('IDAT', zlib.deflateSync(linhas, { level: 9 })),
      bloco('IEND', Buffer.alloc(0)),
    ]),
  );
}

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
  for (const [x, y] of anim.pontos) {
    const red = reduzir(img, recortarQuadro(img, x, y), escala);
    reduzidos.push({ nome, red, ancora: anim.ancora });
  }
}

const amostras = [];
for (const { red } of reduzidos) {
  for (let i = 0; i < red.lw * red.lh; i++) {
    if (red.px[i * 4 + 3]) amostras.push([red.px[i * 4], red.px[i * 4 + 1], red.px[i * 4 + 2]]);
  }
}
const paleta = kmeans(amostras, CORES);

const ESPACO = 1;
const larguraFolha = reduzidos.reduce((s, q) => s + q.red.lw + ESPACO, 0);
const alturaFolha = Math.max(...reduzidos.map((q) => q.red.lh));
const folha = Buffer.alloc(larguraFolha * alturaFolha * 4);
const quadros = {};
let cursor = 0;
for (const { nome, red, ancora } of reduzidos) {
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
  '// Gerado por ferramentas/gerar-personagem.js a partir do SpriteBase.png — não editar à mão.\n' +
    '// x/y/w/h: recorte em assets/personagem.png; ax: eixo do corpo (os pés ficam na base do recorte).\n' +
    `const QUADROS_PERSONAGEM = ${JSON.stringify(quadros, null, 2)};\n`,
);
console.log(`${reduzidos.length} quadros -> ${path.relative(RAIZ, SAIDA_PNG)} (${larguraFolha}x${alturaFolha})`);
