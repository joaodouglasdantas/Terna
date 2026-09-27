// Tira o fundo preto de uma folha de referência de personagem (1536x1024, desenhada sobre preto)
// e grava a versão transparente em fontes/, que os geradores leem.
//
// O fundo é o preto (todos os canais até LIMITE) ligado à borda da folha. Um pedaço de preto
// fechado por dentro do desenho só vira fundo se for largo (o vão entre o braço e o corpo); os
// pequenos — pupilas, a sombra do pescoço, contornos — são do personagem e ficam, com a cor deles.
// (Antes, todo preto virava fundo e os sprites ficavam com buracos na cara.)
//
// Uso (na pasta jogo/): node ferramentas/tirar-fundo.cjs <folha original.png> <nome em fontes/>
//   [--cor-do-canto] [--limite N]
// `--cor-do-canto`: o fundo não é preto, é a cor do canto de cima da folha (um azul-escuro, por
// exemplo), até N de diferença em cada canal.

const path = require('path');
const { lerPng, escreverPng } = require('./png.cjs');

const LIMITE = 16; // o preto do fundo: nenhum canal acima disto (ou tão longe da cor do fundo)
const VAO = { area: 60, largura: 3 }; // um buraco de preto por dentro é fundo com esta área e esta folga

function tirarFundo(img, cor = [0, 0, 0], limite = LIMITE) {
  const { largura, altura, px } = img;
  const n = largura * altura;
  const escuro = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d = Math.max(Math.abs(px[i * 4] - cor[0]), Math.abs(px[i * 4 + 1] - cor[1]), Math.abs(px[i * 4 + 2] - cor[2]));
    escuro[i] = d <= limite ? 1 : 0;
  }

  // Um pixel escuro "folgado": tudo escuro num quadrado de raio `folga - 1` em volta.
  const folgado = (i) => {
    const x = i % largura;
    const y = (i / largura) | 0;
    const r = VAO.largura - 1;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= largura || yy >= altura || !escuro[yy * largura + xx]) return false;
      }
    }
    return true;
  };

  const fundo = new Uint8Array(n);
  const visto = new Uint8Array(n);
  for (let inicio = 0; inicio < n; inicio++) {
    if (!escuro[inicio] || visto[inicio]) continue;
    // Um pedaço de preto (vizinhos de lado): liga na borda? é largo?
    const pedaco = [];
    const pilha = [inicio];
    visto[inicio] = 1;
    let naBorda = false;
    let largo = false;
    while (pilha.length) {
      const i = pilha.pop();
      pedaco.push(i);
      const x = i % largura;
      const y = (i / largura) | 0;
      if (x === 0 || y === 0 || x === largura - 1 || y === altura - 1) naBorda = true;
      if (!largo && folgado(i)) largo = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= largura || yy >= altura) continue;
        const q = yy * largura + xx;
        if (escuro[q] && !visto[q]) {
          visto[q] = 1;
          pilha.push(q);
        }
      }
    }
    if (naBorda || (largo && pedaco.length >= VAO.area)) for (const i of pedaco) fundo[i] = 1;
  }
  const saida = Buffer.from(px);
  for (let i = 0; i < n; i++) saida[i * 4 + 3] = fundo[i] ? 0 : 255;
  return { largura, altura, px: saida };
}

const args = process.argv.slice(2);
const [origem, nome] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--limite');
if (!origem || !nome) throw new Error('uso: node ferramentas/tirar-fundo.cjs <folha original.png> <nome em fontes/> [--cor-do-canto] [--limite N]');
const lida = lerPng(origem);
const corDoFundo = args.includes('--cor-do-canto') ? [lida.px[0], lida.px[1], lida.px[2]] : [0, 0, 0];
const limite = args.includes('--limite') ? Number(args[args.indexOf('--limite') + 1]) : LIMITE;
const img = tirarFundo(lida, corDoFundo, limite);
const destino = path.join(__dirname, '..', 'fontes', nome);
escreverPng(destino, img.largura, img.altura, img.px);
console.log(`${path.basename(origem)} -> ${path.relative(path.join(__dirname, '..'), destino)}`);
