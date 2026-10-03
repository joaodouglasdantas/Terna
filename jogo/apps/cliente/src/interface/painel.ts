// Painel de cada personagem, num canto de cima da tela: o seu à esquerda e o do sósia à
// direita, espelhado. Fica sempre no mesmo canto, com a tela dividida ou não. Cada um tem a
// borda na cor do jogador (a mesma do nome em cima da cabeça) e, do canto para dentro: a foto
// do personagem, a barra de vida, a barra de energia pixy e, embaixo, os quadrinhos.
// A energia pixy é a força do cristal: enquanto carrega, a barra é amarela, no dourado do cristal,
// para todos. Quando enche, a energia se adapta a quem a carrega: a cor do personagem corre pela
// barra, do ícone para a ponta, com um clarão na frente, e ela fica assim (e brilhando) até ser
// gasta — verde na Leslie, marrom no Grow, lilás no Anjo.
// - Leslie: o da arma da mão e os três dos poderes, lado a lado; o que o clique esquerdo usa
//   agora (o botão direito passa por todos) fica com a moldura verde. A barra cheia é a Flor
//   Carnívora pronta.
// - Grow: de gente, como a Leslie (a barra cheia: dá para virar golem); de golem, a barra de pedra
//   com o tempo que resta, descendo, e os três poderes do golem.
// - Anjo: na forma base, a energia pixy (cheia, dá para virar anjo) e o quadrinho da arma; de
//   anjo, o tempo que resta e os três poderes.
// O escolhido fica em destaque. Em pixels da tela do jogo, desenhado por último, por cima da luz.
// Tudo sai do canto para dentro: as barras se esvaziam em direção à borda da tela, dos dois lados.

import { DADOS_ARMA, ENERGIA_PIXY, RECARGA_GOLEM, RECARGA_PODER, type IdPoder, type TipoArma } from '@terna/compartilhado';
import { barraDoAnjo } from '../entidades/anjo/anjo';
import { barraDoGolem } from '../entidades/grow/golem';
import { DESENHO_ICONE, PALETA_ICONE, type ArmaNaMao } from '../entidades/armas';
import {
  ALTURA_RETRATO,
  LARGURA_RETRATO,
  VIDA_MAXIMA,
  usaPoderes,
  custoDeEnergia,
  formaDo,
  personagemLivre,
  retratoDo,
  type Personagem,
} from '../entidades/personagem';
import { ALTURA_FONTE, textoEmPixels } from '../motor/fonte';
import { criarSprite } from '../motor/imagens';
import type { Paleta } from '../motor/tipos';

export type Canto = 'esquerda' | 'direita';

// A cor de quem é o painel: `cor` na borda do painel e da foto, `clara` no fundo da foto.
export interface CorDoJogador {
  cor: string;
  clara: string;
}

const MARGEM = 7; // pixels da borda da tela até o conteúdo do painel
const BARRA = 64; // largura das barras por dentro da moldura
const ESPACO = 13; // lado de cada espaço de habilidade (o ícone tem 11)
const ENTRE_ESPACOS = 3;
const ALERTA_ANJO = 10; // segundos: faltando isso de anjo, a barra pisca
const PISCADAS = 4; // por segundo

// Onde cada coisa fica, medido a partir do canto (x cresce para dentro da tela).
const VIDA_Y = 0;
const ANJO_Y = 9;
const ESPACOS_Y = 17;
const FOTO = { x: 0, w: LARGURA_RETRATO + 2, h: ALTURA_RETRATO + 2 }; // da altura de todo o resto (ESPACOS_Y + ESPACO)
const ICONE_X = FOTO.x + FOTO.w + 4;
const BARRA_X = ICONE_X + 9;
const FUNDO = { x: -4, y: -4, w: BARRA_X + BARRA + 2 + 8, h: FOTO.h + 8 };

const PALETA_ICONES: Paleta = { r: '#e8445e', c: '#ffb3c0', e: '#a8283e', y: '#ffd966', w: '#fff4c2' };
const CORACAO = criarSprite(['.rr.rr.', 'rcrrrrr', 'rrrrrrr', '.rrrrr.', '..rre..', '...e...'], PALETA_ICONES);
// O caco de cristal da energia pixy, igual para todos: um estilhaço do cristal da lore, com a
// luz na face da esquerda. L: o brilho, A: a face clara, b: a do meio, d: a da sombra. Ele tem as
// cores da barra do lado: amarelo carregando, a cor do personagem cheia, a pedra do golem ou o
// dourado do anjo durante a transformação.
const CACO = ['...L.', '..LAb', '.LAbd', 'LAAbd', '.Abd.', '..d..'];

interface CoresBarra {
  fundo: string;
  cheio: string;
  brilho: string; // a linha de cima do que está cheio
  sombra: string; // a linha de baixo
}

const MOLDURA = '#1a1428';
const VIDA: CoresBarra = { fundo: '#3b1622', cheio: '#e8445e', brilho: '#ff9aaa', sombra: '#a8283e' };
const ANJO: CoresBarra = { fundo: '#2a2442', cheio: '#ffd966', brilho: '#fff4c2', sombra: '#d9a53a' };
const ANJO_PISCANDO: CoresBarra = { fundo: '#2a2442', cheio: '#fff4c2', brilho: '#ffffff', sombra: '#ffd966' };
// A energia pixy carregando: o amarelo do cristal, igual para todos.
const CRISTAL: CoresBarra = { fundo: '#2a2210', cheio: '#ffc93c', brilho: '#fff1b0', sombra: '#d9961e' };
// Cheia, a cor de quem a carrega: o lilás do Anjo, o verde da floresta da Leslie, o marrom da terra
// do Grow. De golem, a barra vira pedra (e clareia piscando no fim).
const ENERGIA: CoresBarra = { fundo: '#2a2442', cheio: '#b48cff', brilho: '#e6d9ff', sombra: '#7c52e8' };
const ENERGIA_LESLIE: CoresBarra = { fundo: '#1c2a18', cheio: '#8fd45a', brilho: '#d4f7a8', sombra: '#4f9a38' };
const ENERGIA_GROW: CoresBarra = { fundo: '#241a12', cheio: '#b07a45', brilho: '#e6bf8e', sombra: '#7a4f2c' };
// As marquinhas dos poderes baratos na barra: escuras onde a energia já passou, claras onde falta.
const MARCA_CRISTAL = { passou: 'rgba(70, 44, 6, 0.55)', falta: 'rgba(255, 241, 176, 0.55)' };
const MARCA_CHEIA: Record<'leslie' | 'grow', string> = { leslie: 'rgba(20, 40, 16, 0.55)', grow: 'rgba(44, 26, 12, 0.55)' };
const ADAPTAR = 0.6; // segundos da cor do personagem correndo pela barra, quando ela enche
const GOLEM: CoresBarra = { fundo: '#221c16', cheio: '#a8977a', brilho: '#d2c3a2', sombra: '#75654f' };
const GOLEM_PISCANDO: CoresBarra = { fundo: '#221c16', cheio: '#d2c3a2', brilho: '#fff4dc', sombra: '#a8977a' };

// Desenha no espaço do painel: `x` é a distância do canto para dentro da tela.
interface Pincel {
  retangulo(x: number, y: number, w: number, h: number, cor: string): void;
  arredondado(x: number, y: number, w: number, h: number, cor: string): void;
  contorno(x: number, y: number, w: number, h: number, cor: string): void;
  imagem(img: HTMLCanvasElement, x: number, y: number, alfa?: number): void;
}

function pincel(ctx: CanvasRenderingContext2D, canto: Canto, largura: number): Pincel {
  const telaX = (x: number, w: number): number => (canto === 'esquerda' ? MARGEM + x : largura - MARGEM - x - w);
  const retangulo = (x: number, y: number, w: number, h: number, cor: string): void => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = cor;
    ctx.fillRect(telaX(x, w), MARGEM + y, w, h);
  };
  return {
    retangulo,
    // Retângulo com os quatro cantos cortados em 1 pixel, como tudo no jogo.
    arredondado(x, y, w, h, cor) {
      retangulo(x + 1, y, w - 2, h, cor);
      retangulo(x, y + 1, 1, h - 2, cor);
      retangulo(x + w - 1, y + 1, 1, h - 2, cor);
    },
    // Só a borda de 1 pixel do mesmo retângulo de cantos cortados.
    contorno(x, y, w, h, cor) {
      retangulo(x + 1, y, w - 2, 1, cor);
      retangulo(x + 1, y + h - 1, w - 2, 1, cor);
      retangulo(x, y + 1, 1, h - 2, cor);
      retangulo(x + w - 1, y + 1, 1, h - 2, cor);
    },
    // Ícones e foto não são virados no canto da direita: os ícones são simétricos e a foto é
    // o personagem de frente.
    imagem(img, x, y, alfa = 1) {
      ctx.globalAlpha = alfa;
      ctx.drawImage(img, telaX(x, img.width), MARGEM + y);
      ctx.globalAlpha = 1;
    },
  };
}

// A foto no canto: moldura na cor do jogador, fundo claro dela com o chão um pouco mais
// escuro e o personagem de frente, no meio da moldura, com o corpo até a borda de baixo.
function desenharFoto(p: Pincel, retrato: HTMLCanvasElement, cores: CorDoJogador): void {
  p.retangulo(FOTO.x + 1, 1, FOTO.w - 2, FOTO.h - 2, cores.clara);
  p.retangulo(FOTO.x + 1, FOTO.h - 9, FOTO.w - 2, 8, 'rgba(20, 16, 40, 0.12)');
  p.imagem(retrato, FOTO.x + 1 + ((FOTO.w - 2 - retrato.width) >> 1), 1);
  p.contorno(FOTO.x, 0, FOTO.w, FOTO.h, cores.cor);
}

function desenharBarra(p: Pincel, y: number, altura: number, cheia: number, cores: CoresBarra): void {
  p.arredondado(BARRA_X, y, BARRA + 2, altura + 2, MOLDURA);
  p.retangulo(BARRA_X + 1, y + 1, BARRA, altura, cores.fundo);
  pintarTrecho(p, y, altura, 0, Math.round(BARRA * Math.max(0, Math.min(1, cheia))), cores);
}

// O cheio da barra de `de` a `ate` (px de dentro da barra), com a linha de brilho e a de sombra.
function pintarTrecho(p: Pincel, y: number, altura: number, de: number, ate: number, cores: CoresBarra): void {
  const w = ate - de;
  p.retangulo(BARRA_X + 1 + de, y + 1, w, altura, cores.cheio);
  p.retangulo(BARRA_X + 1 + de, y + 1, w, 1, cores.brilho);
  if (altura > 2) p.retangulo(BARRA_X + 1 + de, y + altura, w, 1, cores.sombra);
}

// A cor do meio entre duas (#rrggbb).
function meio(a: string, b: string): string {
  const [ra, ga, ba] = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const [rb, gb, bb] = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const h = (v: number): string => Math.round(v).toString(16).padStart(2, '0');
  return `#${h((ra + rb) / 2)}${h((ga + gb) / 2)}${h((ba + bb) / 2)}`;
}

const cacos = new Map<CoresBarra, HTMLCanvasElement>();
function cacoDe(cores: CoresBarra): HTMLCanvasElement {
  let caco = cacos.get(cores);
  if (!caco) {
    caco = criarSprite(CACO, { L: cores.brilho, A: cores.cheio, b: meio(cores.cheio, cores.sombra), d: cores.sombra });
    cacos.set(cores, caco);
  }
  return caco;
}

// O caco ao lado da barra de energia, nas cores dela. `brilhando`: a barra cheia e pronta — ele
// pulsa e uma faísca pisca na ponta.
function desenharCaco(p: Pincel, cores: CoresBarra, brilhando: boolean, tempo: number): void {
  const x = ICONE_X + 1;
  const y = ANJO_Y - 1;
  const pulso = 0.5 + 0.5 * Math.sin(tempo * 5);
  p.imagem(cacoDe(cores), x, y, brilhando ? 0.8 + 0.2 * pulso : 1);
  if (brilhando && Math.sin(tempo * 3.1) > 0.4) {
    // A faísca: uma cruzinha branca na ponta do caco.
    const forca = (Math.sin(tempo * 3.1) - 0.4) / 0.6;
    p.retangulo(x + 3, y - 1, 1, 3, `rgba(255, 255, 255, ${0.85 * forca})`);
    p.retangulo(x + 2, y, 3, 1, `rgba(255, 255, 255, ${0.85 * forca})`);
  }
}

// Desde quando a energia de cada personagem está cheia (em `tempo` do jogo); null carregando.
const cheiaDesde = new WeakMap<Personagem, number | null>();

// A barra da energia pixy: amarela carregando; cheia, a cor do personagem corre do ícone para a
// ponta em ADAPTAR segundos, com um clarão na frente, e fica. Devolve se está cheia.
function desenharEnergia(
  p: Pincel,
  personagem: Personagem,
  cheia: number,
  cores: CoresBarra,
  tempo: number,
): boolean {
  const completa = cheia >= 1;
  let desde = cheiaDesde.get(personagem) ?? null;
  if (!completa) desde = null;
  else if (desde === null || desde > tempo) desde = tempo; // (tempo menor: a partida recomeçou)
  cheiaDesde.set(personagem, desde);

  if (!completa) {
    desenharBarra(p, ANJO_Y, 3, cheia, CRISTAL);
    return false;
  }
  const t = Math.min(1, (tempo - (desde ?? tempo)) / ADAPTAR);
  const frente = Math.round(BARRA * (1 - (1 - t) ** 2)); // corre depressa e assenta
  p.arredondado(BARRA_X, ANJO_Y, BARRA + 2, 5, MOLDURA);
  pintarTrecho(p, ANJO_Y, 3, 0, frente, cores);
  pintarTrecho(p, ANJO_Y, 3, frente, BARRA, CRISTAL);
  if (t < 1) {
    // O clarão na frente da cor nova: uns pixels brancos que se apagam para trás.
    for (let i = 0; i < 4; i++) {
      const x = frente - i;
      if (x < 0 || x >= BARRA) continue;
      p.retangulo(BARRA_X + 1 + x, ANJO_Y + 1, 1, 3, `rgba(255, 255, 255, ${0.9 - i * 0.22})`);
    }
  }
  return true;
}

// Os ícones dos três poderes (11×11, dentro do quadrinho), nos rosas da referência dos poderes:
// a estrela do Impacto Angelical, o coração-cometa da Rajada de Amor e o emblema de asas com
// auréola do Julgamento Celestial. Cada quadrinho mostra o ícone do poder na ordem de PODERES.
const PALETA_PODERES: Paleta = {
  d: '#5a0f36',
  v: '#9e1450',
  m: '#e8207a',
  r: '#ff5fa2',
  c: '#ff9fcb',
  w: '#ffe3f1',
  W: '#ffffff',
};
// Os da Leslie, nos verdes e marrons da floresta: a vinha do chicote com espinhos, as raízes saindo da
// terra e a Flor Carnívora (no roxo dela).
const PALETA_LESLIE: Paleta = {
  t: '#3c2412',
  m: '#6b4424',
  c: '#9c6a3a',
  e: '#efe3b8',
  s: '#2f6b2a',
  g: '#4f9a38',
  v: '#8fd45a',
  w: '#d4f7a8',
  p: '#5a1a66', // o roxo da flor
  P: '#a8308e',
  q: '#e070c0',
  k: '#1e0a1e', // a boca por dentro
  y: '#b8f25a', // o veneno
};
// Os do Grow: os pássaros da Revoada, o vento com a folha do Vendaval e a cara do golem; os do
// golem nos cinzas da pedra com musgo: o Salto caindo na terra, a Investida e o pedregulho.
const PALETA_GROW: Paleta = {
  t: '#3c2412',
  m: '#6b4424',
  c: '#9c6a3a',
  p: '#e8d8b0',
  y: '#f0c040',
  w: '#f4f8ff',
  a: '#a9c6dc',
  g: '#6fb842',
  v: '#9cbc45',
  S: '#2b241c',
  k: '#75654f',
  l: '#a8977a',
  L: '#d2c3a2',
};
const ICONES: Record<IdPoder, HTMLCanvasElement> = {
  aves: criarSprite(
    [
      '...........',
      '.t...t.....',
      '..tmt......',
      '...cmmy....',
      '...ppm.....',
      '...........',
      '......t..t.',
      '.......tmt.',
      '........cmy',
      '........pm.',
      '...........',
    ],
    PALETA_GROW,
  ),
  vento: criarSprite(
    [
      '...........',
      '.aawwwwa...',
      '.......wa..',
      '..awwwa..w.',
      '.......w.a.',
      '.aawwa.w...',
      '.....wa..g.',
      '.awwwa..gvg',
      '.........g.',
      '..aawwwa...',
      '...........',
    ],
    PALETA_GROW,
  ),
  golem: criarSprite(
    [
      '...v.gv....',
      '..SvkvkkS..',
      '.SkllkllkS.',
      '.SkSySySkS.',
      '.SkkkkkkkS.',
      '..SklllkS..',
      '.vSkSSSkSv.',
      'SkkS...SkkS',
      'SllS...SllS',
      'SkkS...SkkS',
      '.SS.....SS.',
    ],
    PALETA_GROW,
  ),
  salto: criarSprite(
    [
      '.....L.....',
      '....lLl....',
      '.....L.....',
      '...SkvkS...',
      '..SkllkkS..',
      '..SkkkkkS..',
      '..SkS.SkS..',
      '.SkkS.SkkS.',
      'tSSStStSSSt',
      'mtmmtmtmmtm',
      't.t..t..t.t',
    ],
    PALETA_GROW,
  ),
  investida: criarSprite(
    [
      '...........',
      '.....SSvS..',
      '....SkllvS.',
      'w...SklllkS',
      '.ww.SkSykkS',
      'w...SkkkkkS',
      '.ww..SkkkS.',
      'w...SkSSkS.',
      '...SkS.SkS.',
      '..mSS..SSm.',
      '.mtmtmtmtmt',
    ],
    PALETA_GROW,
  ),
  pedra: criarSprite(
    [
      '...vgvv....',
      '..SvgvlkS..',
      '.SklLLlkkS.',
      '.SlLlllkkS.',
      'SklllkkkkSS',
      'SkllkkSkkkS',
      'SkkkkkkkkkS',
      '.SkkkkkkSS.',
      '.tSSkkSSSt.',
      'mtmSSSSmtmt',
      '.t.t.t.t.t.',
    ],
    PALETA_GROW,
  ),
  chicote: criarSprite(
    [
      '........e.c',
      '.......e.cm',
      '.......gs.e',
      '......gs...',
      '....wsg.e..',
      '...egs.....',
      '..vgs......',
      '.eg.s.e....',
      'vg.........',
      'gs.........',
      's..........',
    ],
    PALETA_LESLIE,
  ),
  raizes: criarSprite(
    [
      '.....e.....',
      '..e..c.....',
      '..c..m..e..',
      '..m.cm..c..',
      '.cm.m...m.e',
      '.m..mc.cm.c',
      '.mc..m.m..m',
      'ttmttmtmttm',
      'tmtttmmtttt',
      '.tt.t..tt.t',
      '...........',
    ],
    PALETA_LESLIE,
  ),
  // A Flor Carnívora: a boca roxa escancarada, com os dentes e o veneno pingando.
  flor: criarSprite(
    [
      '...pPPq....',
      '.pPPPPPPq..',
      'pPPPqPPPPPq',
      'pPPkekekeke',
      'pPkkkkkkkk.',
      'pPkkkkkkky.',
      'pPPekekeky.',
      '.pPPPPPPPy.',
      '..vsg...y..',
      '.vgsgv.....',
      '..tmtmt....',
    ],
    PALETA_LESLIE,
  ),
  rajada: criarSprite(
    [
      '.....rr.rr.',
      '.c..rwrrrrm',
      '....rrrrrrm',
      '.....rrrrm.',
      '....c.rrm..',
      '...rc..m...',
      '..mr.......',
      '.mr........',
      'dm.........',
      'd..........',
      '..........c',
    ],
    PALETA_PODERES,
  ),
  impacto: criarSprite(
    [
      '.....w.....',
      '.....r.....',
      '.c...r...c.',
      '..m..r..m..',
      '...mrcrm...',
      'wrrrcWcrrrw',
      '...mrcrm...',
      '..m..r..m..',
      '.c...r...c.',
      '.....r.....',
      '.....w.....',
    ],
    PALETA_PODERES,
  ),
  julgamento: criarSprite(
    [
      '...cwwwc...',
      '...r...r...',
      'c...rWr...c',
      'rc...w...cr',
      'rrc..w..crr',
      'rrrc.w.crrr',
      '.rrrcwcrrr.',
      '..rrmwmrr..',
      '...rmwmr...',
      '....mwm....',
      '.....m.....',
    ],
    PALETA_PODERES,
  ),
};
const ICONES_ARMAS: Record<TipoArma, HTMLCanvasElement> = {
  espada: criarSprite(DESENHO_ICONE.espada, PALETA_ICONE),
  arco: criarSprite(DESENHO_ICONE.arco, PALETA_ICONE),
};
// Sem arma na mão, o quadrinho mostra o punho fechado, de frente: os três dedos dobrados com a
// luz nos nós, o lado da mão na sombra e o dedão atravessado embaixo, com contorno escuro.
const PUNHO = criarSprite(
  [
    '...........',
    '..kkkkkkkk.',
    '.kWPkWPkWPk',
    'kopPkpPkpPk',
    'kosPkppkppk',
    'kospkppkpsk',
    'kosskspkssk',
    'kokkkkkkkk.',
    'kosPWPPPpk.',
    '.kkkkkkkk..',
    '...........',
  ],
  { k: '#1a0f0a', o: '#8a4a26', s: '#b8693a', p: '#e0955e', P: '#f4b27e', W: '#ffd8b0' },
);

// A moldura do escolhido é da interface (verde); a dos outros, clara e apagada. A da arma, com
// uma na mão, é o roxo da interface.
const MOLDURA_ESCOLHIDO = '#7fd66b';
const MOLDURA_ARMA = '#8a5cff';
const DURABILIDADE = { cheia: '#fff4dc', acabando: '#ff5a67', fundo: 'rgba(255, 250, 240, 0.18)' };
const ACABANDO = 3; // segundos: com menos que isto, a barrinha fica vermelha e o quadrinho pisca
const MOLDURA_ESPACO = 'rgba(255, 250, 240, 0.32)';
const COR_SEGUNDOS = '#ffffff';
const COR_AVISO = '#fff4dc';

// Um quadrinho de poder. Sem poder usar (caído, enfeitiçado, transformando) ou sem a energia dele,
// o ícone fica apagado; o escolhido tem a moldura verde. Em recarga, uma sombra cobre o ícone e
// desce, sumindo de cima para baixo conforme o tempo passa, com os segundos que faltam por cima.
function desenharEspaco(
  p: Pincel,
  x: number,
  y: number,
  icone: HTMLCanvasElement,
  escolhido: boolean,
  ativo: boolean,
  falta: number,
  total: number,
): void {
  p.arredondado(x, y, ESPACO, ESPACO, escolhido ? MOLDURA_ESCOLHIDO : MOLDURA_ESPACO);
  p.retangulo(x + 1, y + 1, ESPACO - 2, ESPACO - 2, 'rgba(26, 10, 22, 0.85)');
  p.imagem(icone, x + 1, y + 1, ativo ? (falta > 0 ? 0.55 : 1) : 0.3);
  if (falta <= 0) return;
  const coberto = Math.ceil((ESPACO - 2) * (falta / total));
  p.retangulo(x + 1, y + 1 + (ESPACO - 2 - coberto), ESPACO - 2, coberto, 'rgba(10, 4, 12, 0.6)');
  const segundos = textoEmPixels(String(Math.ceil(falta)), COR_SEGUNDOS);
  p.imagem(segundos, x + 1 + ((ESPACO - 2 - segundos.width) >> 1), y + 1 + ((ESPACO - 2 - ALTURA_FONTE) >> 1));
}

// O quadrinho da arma: sem arma, o punho do soco; com ela, o ícone e, embaixo, a barrinha do
// tempo que ela ainda dura, que se esvazia até quebrar. `ativo`: o clique esquerdo usa a arma agora.
// `naFileira` (a Leslie e o Grow de gente): o quadrinho é o primeiro da fileira que o botão direito
// percorre; escolhido, ganha a moldura verde, e não escolhido só perde a moldura (o ícone não apaga).
function desenharEspacoDaArma(p: Pincel, arma: ArmaNaMao | null, tempo: number, ativo = true, naFileira = false): void {
  const ARMA_X = BARRA_X; // a arma abre a fileira
  const acabando = arma !== null && arma.durabilidade < ACABANDO;
  const apaga = acabando && Math.floor(tempo * 8) % 2 === 0;
  const moldura = naFileira ? (ativo ? MOLDURA_ESCOLHIDO : MOLDURA_ESPACO) : arma && ativo ? MOLDURA_ARMA : MOLDURA_ESPACO;
  const apagado = naFileira ? 1 : 0.3; // o ícone apaga quando o clique não usa a arma, menos na fileira
  p.arredondado(ARMA_X, ESPACOS_Y, ESPACO, ESPACO, moldura);
  p.retangulo(ARMA_X + 1, ESPACOS_Y + 1, ESPACO - 2, ESPACO - 2, 'rgba(26, 10, 22, 0.85)');
  if (!arma) {
    // Sem arma: o soco (apagadinho — é o ataque mais fraco).
    p.imagem(PUNHO, ARMA_X + 1, ESPACOS_Y + 1, ativo || naFileira ? 0.85 : apagado);
    return;
  }
  p.imagem(ICONES_ARMAS[arma.tipo], ARMA_X + 1, ESPACOS_Y + 1, !ativo ? apagado : apaga ? 0.45 : 1);
  const largura = ESPACO - 2;
  const cheia = Math.ceil(largura * Math.min(1, arma.durabilidade / DADOS_ARMA[arma.tipo].durabilidade));
  p.retangulo(ARMA_X + 1, ESPACOS_Y + ESPACO - 2, largura, 1, DURABILIDADE.fundo);
  p.retangulo(ARMA_X + 1, ESPACOS_Y + ESPACO - 2, cheia, 1, acabando ? DURABILIDADE.acabando : DURABILIDADE.cheia);
}

// Embaixo do painel: por que o poder (ou a transformação) não saiu, numa placa escura.
function desenharAviso(p: Pincel, texto: string, resta: number): void {
  const img = textoEmPixels(texto, COR_AVISO);
  const y = FUNDO.y + FUNDO.h + 3;
  const alfa = Math.min(1, resta / 0.25);
  p.arredondado(FUNDO.x, y, img.width + 6, ALTURA_FONTE + 4, `rgba(14, 12, 28, ${0.75 * alfa})`);
  p.imagem(img, FUNDO.x + 3, y + 2, alfa);
}

export function desenharPainel(
  ctx: CanvasRenderingContext2D,
  personagem: Personagem,
  cores: CorDoJogador,
  canto: Canto,
  largura: number,
  tempo: number,
  comAviso = false, // só o seu painel diz por que o poder não saiu
): void {
  const p = pincel(ctx, canto, largura);
  ctx.save();
  p.arredondado(FUNDO.x, FUNDO.y, FUNDO.w, FUNDO.h, 'rgba(14, 12, 28, 0.4)');
  p.contorno(FUNDO.x, FUNDO.y, FUNDO.w, FUNDO.h, cores.cor);

  desenharFoto(p, retratoDo(personagem), cores);

  p.imagem(CORACAO, ICONE_X, VIDA_Y);
  desenharBarra(p, VIDA_Y, 5, personagem.vida / VIDA_MAXIMA, VIDA);

  const { poderes } = personagem;
  if (personagem.heroi === 'grow') {
    const golem = barraDoGolem(personagem.golem, personagem.energia);
    const piscando = golem.ativa && golem.resta <= ALERTA_ANJO && Math.floor(tempo * PISCADAS) % 2 === 0;
    const barraGolem = piscando ? GOLEM_PISCANDO : GOLEM;
    desenharCaco(p, golem.ativa ? barraGolem : golem.cheia >= 1 ? ENERGIA_GROW : CRISTAL, golem.disponivel, tempo);
    if (golem.ativa) {
      cheiaDesde.delete(personagem);
      desenharBarra(p, ANJO_Y, 3, golem.cheia, barraGolem);
    } else {
      const completa = desenharEnergia(p, personagem, golem.cheia, ENERGIA_GROW, tempo);
      // Marquinhas onde a Revoada e o Vendaval já saem.
      for (const poder of ['aves', 'vento'] as const) {
        const custo = ENERGIA_PIXY.custoGrow[poder];
        const x = Math.round((BARRA * custo) / ENERGIA_PIXY.maxima);
        const cor = completa ? MARCA_CHEIA.grow : personagem.energia >= custo ? MARCA_CRISTAL.passou : MARCA_CRISTAL.falta;
        p.retangulo(BARRA_X + 1 + x, ANJO_Y + 1, 1, 3, cor);
      }
    }
    if (golem.disponivel) desenharBrilho(p, ANJO_Y, 3, tempo, ENERGIA_GROW.brilho);
    // De golem, só os três poderes dele (a mão não segura arma).
    if (formaDo(personagem) === 'golem') {
      desenharPoderes(p, personagem);
    } else {
      desenharEspacoDaArma(p, personagem.arma, tempo, personagem.modo === 'arma', true);
      desenharPoderes(p, personagem, ESPACO + ENTRE_ESPACOS);
    }
  } else if (personagem.heroi === 'leslie') {
    // A energia pixy, que enche para a Flor; e a arma e os poderes lado a lado.
    const cheia = personagem.energia >= ENERGIA_PIXY.maxima;
    desenharCaco(p, cheia ? ENERGIA_LESLIE : CRISTAL, cheia, tempo);
    desenharEnergia(p, personagem, personagem.energia / ENERGIA_PIXY.maxima, ENERGIA_LESLIE, tempo);
    // Marquinhas na barra onde o 1 e o 2 já saem.
    for (const poder of ['chicote', 'raizes'] as const) {
      const custo = ENERGIA_PIXY.custoLeslie[poder];
      const x = Math.round((BARRA * custo) / ENERGIA_PIXY.maxima);
      const cor = cheia ? MARCA_CHEIA.leslie : personagem.energia >= custo ? MARCA_CRISTAL.passou : MARCA_CRISTAL.falta;
      p.retangulo(BARRA_X + 1 + x, ANJO_Y + 1, 1, 3, cor);
    }
    if (cheia) desenharBrilho(p, ANJO_Y, 3, tempo, ENERGIA_LESLIE.brilho);
    desenharEspacoDaArma(p, personagem.arma, tempo, personagem.modo === 'arma', true);
    desenharPoderes(p, personagem, ESPACO + ENTRE_ESPACOS);
  } else {
    const anjo = barraDoAnjo(personagem.anjo, personagem.energia);
    const piscando = anjo.ativa && anjo.resta <= ALERTA_ANJO && Math.floor(tempo * PISCADAS) % 2 === 0;
    const barraAnjo = piscando ? ANJO_PISCANDO : ANJO;
    desenharCaco(p, anjo.ativa ? barraAnjo : anjo.cheia >= 1 ? ENERGIA : CRISTAL, anjo.disponivel, tempo);
    if (anjo.ativa) {
      cheiaDesde.delete(personagem);
      desenharBarra(p, ANJO_Y, 3, anjo.cheia, barraAnjo);
    } else {
      desenharEnergia(p, personagem, anjo.cheia, ENERGIA, tempo);
    }
    if (anjo.disponivel) desenharBrilho(p, ANJO_Y, 3, tempo, ENERGIA.brilho);
    // Os poderes só aparecem de anjo; na forma base, só a arma (menos coisa na tela).
    if (!usaPoderes(personagem)) desenharEspacoDaArma(p, personagem.arma, tempo);
    else desenharPoderes(p, personagem);
  }
  if (comAviso && poderes.aviso) desenharAviso(p, poderes.aviso.texto, poderes.aviso.resta);
  ctx.restore();
}

// A barra cheia com a transformação disponível: uma faixa de luz corre por ela, a borda pulsa (na
// cor clara do personagem, `borda`) e soltam-se faíscas para cima.
function desenharBrilho(p: Pincel, y: number, altura: number, tempo: number, borda: string): void {
  const pulso = 0.5 + 0.5 * Math.sin(tempo * 5);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(borda.slice(i, i + 2), 16));
  p.contorno(BARRA_X - 1, y - 1, BARRA + 4, altura + 4, `rgba(${r}, ${g}, ${b}, ${0.25 + 0.45 * pulso})`);
  const faixa = 8;
  const volta = BARRA + faixa * 3; // a faixa sai da barra e espera um pouco antes de voltar
  const inicio = Math.floor((tempo * 70) % volta) - faixa;
  for (let i = 0; i < faixa; i++) {
    const x = inicio + i;
    if (x < 0 || x >= BARRA) continue;
    const forca = 1 - Math.abs(i - faixa / 2) / (faixa / 2);
    p.retangulo(BARRA_X + 1 + x, y + 1, 1, altura, `rgba(255, 255, 255, ${0.75 * forca})`);
  }
  for (let k = 0; k < 3; k++) {
    const ciclo = tempo * 1.4 + k / 3;
    const fase = ciclo % 1;
    const x = (Math.floor(ciclo) * 29 + k * 23) % (BARRA - 2);
    // Sobem só 2 linhas: acima delas começa a barra de vida.
    p.retangulo(BARRA_X + 2 + x, y - 1 - Math.floor(fase * 2), 1, 1, `rgba(255, 244, 255, ${1 - fase})`);
  }
}

// Os três quadrinhos de poder, a partir de `desde` px depois do começo da fileira.
function desenharPoderes(p: Pincel, personagem: Personagem, desde = 0): void {
  const { poderes } = personagem;
  // Fora do modo poderes (a arma escolhida) eles seguem acesos: o botão direito passa por eles.
  const prontos = personagemLivre(personagem) && !personagem.encanto && personagem.vida > 0;
  const naMao = usaPoderes(personagem);
  poderes.lista.forEach((poder, i) => {
    const escolhido = naMao && i === poderes.selecionado;
    // Tentou usar e não saiu: o quadrinho escolhido treme de lado.
    const tremor = escolhido && poderes.tremor > 0 ? Math.round(Math.sin(poderes.tremor * 70)) : 0;
    const x = BARRA_X + desde + i * (ESPACO + ENTRE_ESPACOS) + tremor;
    const semEnergia = personagem.energia < custoDeEnergia(personagem, poder);
    const ativo = prontos && !semEnergia;
    // O quadrinho do golem mostra a recarga da transformação (depois de voltar a ser gente).
    const [falta, total] =
      poder === 'golem' && personagem.golem.recarga > poderes.recarga[i]
        ? [personagem.golem.recarga, RECARGA_GOLEM]
        : [poderes.recarga[i], RECARGA_PODER[poder]];
    desenharEspaco(p, x, ESPACOS_Y, ICONES[poder], escolhido, ativo, falta, total);
  });
}

// Onde fica cada parte do seu painel (o da esquerda), em pixels da tela do jogo: o tutorial aponta
// para elas. `comArma`: a fileira começa pelo quadrinho da arma (a Leslie e o Grow de gente); sem
// ele (o golem, o Anjo de anjo), os poderes começam no lugar dela.
export type ParteDoPainel = 'vida' | 'energia' | 'arma' | 'poderes' | 'poder1' | 'poder2' | 'poder3';
export function areaNoSeuPainel(parte: ParteDoPainel, comArma = true): { x: number; y: number; w: number; h: number } {
  const x = MARGEM + BARRA_X;
  const passo = ESPACO + ENTRE_ESPACOS;
  const poderes = x + (comArma ? passo : 0);
  switch (parte) {
    case 'vida':
      return { x, y: MARGEM + VIDA_Y, w: BARRA + 2, h: 7 };
    case 'energia':
      return { x, y: MARGEM + ANJO_Y, w: BARRA + 2, h: 5 };
    case 'arma':
      return { x, y: MARGEM + ESPACOS_Y, w: ESPACO, h: ESPACO };
    case 'poderes':
      return { x: poderes, y: MARGEM + ESPACOS_Y, w: 3 * ESPACO + 2 * ENTRE_ESPACOS, h: ESPACO };
    default: {
      const i = Number(parte.slice(-1)) - 1;
      return { x: poderes + i * passo, y: MARGEM + ESPACOS_Y, w: ESPACO, h: ESPACO };
    }
  }
}

// O ícone de um poder (11×11), para a tela de seleção mostrar os poderes de cada personagem.
export function iconeDoPoder(poder: IdPoder): HTMLCanvasElement {
  return ICONES[poder];
}
