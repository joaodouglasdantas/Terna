// Tira o fundo preto de uma folha de referência de personagem (1536x1024, desenhada sobre preto)
// e grava a versão transparente em fontes/, que os geradores leem.
//
// O fundo é o preto (todos os canais até LIMITE) ligado à borda da folha. Um pedaço de preto
// fechado por dentro do desenho só vira fundo se for largo (o vão entre o braço e o corpo); os
// pequenos — pupilas, a sombra do pescoço, contornos — são do personagem e ficam, com a cor deles.
// (Antes, todo preto virava fundo e os sprites ficavam com buracos na cara.)
//
// Uso (na pasta jogo/): node ferramentas/tirar-fundo.cjs <folha original.png> <nome em fontes/>
//   [--cor-do-canto] [--xadrez] [--limite N]
// `--cor-do-canto`: o fundo não é preto, é a cor do canto de cima da folha (um azul-escuro, por
// exemplo), até N de diferença em cada canal.
// `--xadrez`: o fundo é o xadrez branco e cinza-claro de "transparente" pintado na folha (a da
// flor carnívora): todo pixel claro e sem cor, ligado à borda (ou num vão largo por dentro).
// `--xadrez-com-branco`: o xadrez, numa folha com branco no desenho (o ganso e o cabelo da Margo):
// só o cinza e o branco sem nenhuma cor (os brancos do desenho puxam para o creme ou o lilás) e, por
// dentro, só o vão que é xadrez de verdade — quase todo nos dois tons dele, o cinza e o branco
// (o branco do ganso tem sombras e tons no meio), com os dois aparecendo.

const path = require('path');
const { lerPng, escreverPng } = require('./png.cjs');

const LIMITE = 16; // o preto do fundo: nenhum canal acima disto (ou tão longe da cor do fundo)
const VAO = { area: 60, largura: 3 }; // um buraco de preto por dentro é fundo com esta área e esta folga

const XADREZ = { claro: 215, cor: 12 }; // o canal mais escuro pelo menos isto; a diferença entre canais até isto
// O xadrez com branco no desenho: sem cor nenhuma (até `cor` entre os canais), e os dois tons dele.
const XADREZ_FINO = { claro: 225, cor: 7, cinza: [231, 241], branco: 249, tons: 0.85, cadaTom: 0.1, area: 30 };

// No xadrez fino: o vão por dentro é xadrez de verdade (quase todo nos dois tons, com os dois)?
function vaoDeXadrez(px, pedaco) {
  let cinza = 0;
  let branco = 0;
  for (const i of pedaco) {
    const v = Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    if (v >= XADREZ_FINO.cinza[0] && v <= XADREZ_FINO.cinza[1]) cinza++;
    else if (v >= XADREZ_FINO.branco) branco++;
  }
  const n = pedaco.length;
  return n >= XADREZ_FINO.area && (cinza + branco) / n >= XADREZ_FINO.tons && cinza / n >= XADREZ_FINO.cadaTom && branco / n >= XADREZ_FINO.cadaTom;
}

function tirarFundo(img, cor = [0, 0, 0], limite = LIMITE, xadrez = false, fino = false) {
  const { largura, altura, px } = img;
  const n = largura * altura;
  // `escuro`: o que pode ser fundo (o nome vem do fundo preto; no xadrez, é o claro sem cor).
  const escuro = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
    if (fino) {
      escuro[i] = Math.min(r, g, b) >= XADREZ_FINO.claro && Math.max(r, g, b) - Math.min(r, g, b) <= XADREZ_FINO.cor ? 1 : 0;
      continue;
    }
    if (xadrez) {
      escuro[i] = Math.min(r, g, b) >= XADREZ.claro && Math.max(r, g, b) - Math.min(r, g, b) <= XADREZ.cor ? 1 : 0;
      continue;
    }
    const d = Math.max(Math.abs(r - cor[0]), Math.abs(g - cor[1]), Math.abs(b - cor[2]));
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
    const vao = fino ? vaoDeXadrez(px, pedaco) : largo && pedaco.length >= VAO.area;
    if (naBorda || vao) for (const i of pedaco) fundo[i] = 1;
  }
  const saida = Buffer.from(px);
  for (let i = 0; i < n; i++) saida[i * 4 + 3] = fundo[i] ? 0 : 255;
  return { largura, altura, px: saida };
}

const args = process.argv.slice(2);
const [origem, nome] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--limite');
if (!origem || !nome) throw new Error('uso: node ferramentas/tirar-fundo.cjs <folha original.png> <nome em fontes/> [--cor-do-canto] [--xadrez] [--xadrez-com-branco] [--limite N]');
const lida = lerPng(origem);
const corDoFundo = args.includes('--cor-do-canto') ? [lida.px[0], lida.px[1], lida.px[2]] : [0, 0, 0];
const limite = args.includes('--limite') ? Number(args[args.indexOf('--limite') + 1]) : LIMITE;
const img = tirarFundo(lida, corDoFundo, limite, args.includes('--xadrez'), args.includes('--xadrez-com-branco'));
const destino = path.join(__dirname, '..', 'fontes', nome);
escreverPng(destino, img.largura, img.altura, img.px);
console.log(`${path.basename(origem)} -> ${path.relative(path.join(__dirname, '..'), destino)}`);
