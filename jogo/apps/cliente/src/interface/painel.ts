// Painel de cada personagem, num canto de cima da tela: o seu à esquerda e o do sósia à
// direita, espelhado. Fica sempre no mesmo canto, com a tela dividida ou não. Cada um tem a
// borda na cor do jogador (a mesma do nome em cima da cabeça) e, do canto para dentro: a foto
// do personagem, a barra de vida, a barra do tempo de anjo (ou da recarga dele), os três
// quadrinhos dos poderes, com o escolhido em destaque, e, no fim da fileira, o da arma da mão. Em pixels da tela do jogo, desenhado por
// último, por cima da luz. Tudo sai do canto para dentro: as barras se esvaziam em direção à
// borda da tela, dos dois lados.

import { DADOS_ARMA, PODERES, RECARGA_PODER, type IdPoder, type TipoArma } from '@terna/compartilhado';
import { barraDoAnjo } from '../entidades/anjo';
import { DESENHO_ICONE, PALETA_ICONE, type ArmaNaMao } from '../entidades/armas';
import { VIDA_MAXIMA, podeUsarPoderes, retratoDo, type Personagem } from '../entidades/personagem';
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
const ESPACO = 11; // lado de cada espaço de habilidade
const ENTRE_ESPACOS = 3;
const ALERTA_ANJO = 10; // segundos: faltando isso de anjo, a barra pisca
const PISCADAS = 4; // por segundo

// Onde cada coisa fica, medido a partir do canto (x cresce para dentro da tela).
const VIDA_Y = 0;
const ANJO_Y = 9;
const ESPACOS_Y = 17;
const FOTO = { x: 0, w: 22, h: ESPACOS_Y + ESPACO }; // da altura de todo o resto
const ICONE_X = FOTO.x + FOTO.w + 4;
const BARRA_X = ICONE_X + 9;
const FUNDO = { x: -4, y: -4, w: BARRA_X + BARRA + 2 + 8, h: FOTO.h + 8 };

const PALETA_ICONES: Paleta = { r: '#e8445e', c: '#ffb3c0', e: '#a8283e', y: '#ffd966', w: '#fff4c2' };
const CORACAO = criarSprite(['.rr.rr.', 'rcrrrrr', 'rrrrrrr', '.rrrrr.', '..rre..', '...e...'], PALETA_ICONES);
const AUREOLA = criarSprite(['.wyyyy.', 'y.....y', '.yyyyy.'], PALETA_ICONES);

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
const ANJO_PRONTO: CoresBarra = { fundo: '#2a2442', cheio: '#8e8a7a', brilho: '#b8b3a0', sombra: '#6c685c' };

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
// escuro e o personagem de frente, encostado embaixo e centrado.
function desenharFoto(p: Pincel, retrato: HTMLCanvasElement, cores: CorDoJogador): void {
  p.retangulo(FOTO.x + 1, 1, FOTO.w - 2, FOTO.h - 2, cores.clara);
  p.retangulo(FOTO.x + 1, FOTO.h - 9, FOTO.w - 2, 8, 'rgba(20, 16, 40, 0.12)');
  p.imagem(retrato, FOTO.x + 1 + ((FOTO.w - 2 - retrato.width) >> 1), FOTO.h - 1 - retrato.height);
  p.contorno(FOTO.x, 0, FOTO.w, FOTO.h, cores.cor);
}

function desenharBarra(p: Pincel, y: number, altura: number, cheia: number, cores: CoresBarra): void {
  p.arredondado(BARRA_X, y, BARRA + 2, altura + 2, MOLDURA);
  p.retangulo(BARRA_X + 1, y + 1, BARRA, altura, cores.fundo);
  const w = Math.round(BARRA * Math.max(0, Math.min(1, cheia)));
  p.retangulo(BARRA_X + 1, y + 1, w, altura, cores.cheio);
  p.retangulo(BARRA_X + 1, y + 1, w, 1, cores.brilho);
  if (altura > 2) p.retangulo(BARRA_X + 1, y + altura, w, 1, cores.sombra);
}

// Os ícones dos três poderes (9×9, dentro do quadrinho), nos rosas da referência dos poderes:
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
const ICONES: Record<IdPoder, HTMLCanvasElement> = {
  rajada: criarSprite(
    ['....cr.rr', '.c..rwrrm', '.....rrm.', '....c.m..', '...rc....', '..mr.....', '.mr......', 'dm......c', 'd........'],
    PALETA_PODERES,
  ),
  impacto: criarSprite(
    ['....w....', '.c..r..c.', '..m.r.m..', '...rcr...', 'wrrcWcrrw', '...rcr...', '..m.r.m..', '.c..r..c.', '....w....'],
    PALETA_PODERES,
  ),
  julgamento: criarSprite(
    ['..cwwwc..', '..r...r..', 'c..rWr..c', 'rc..w..cr', 'rrc.w.crr', '.rrcwcrr.', '..rmwmr..', '...mwm...', '....m....'],
    PALETA_PODERES,
  ),
};
const ICONES_ARMAS: Record<TipoArma, HTMLCanvasElement> = {
  espada: criarSprite(DESENHO_ICONE.espada, PALETA_ICONE),
  arco: criarSprite(DESENHO_ICONE.arco, PALETA_ICONE),
};
// A moldura do escolhido é da interface (verde); a dos outros, clara e apagada. A da arma, com
// uma na mão, é o roxo da interface.
const MOLDURA_ESCOLHIDO = '#7fd66b';
const MOLDURA_ARMA = '#8a5cff';
const ARMA_X = BARRA_X + BARRA + 2 - ESPACO; // o quadrinho da arma fecha a fileira, na ponta da barra
const DURABILIDADE = { cheia: '#fff4dc', acabando: '#ff5a67', fundo: 'rgba(255, 250, 240, 0.18)' };
const ACABANDO = 3; // segundos: com menos que isto, a barrinha fica vermelha e o quadrinho pisca
const MOLDURA_ESPACO = 'rgba(255, 250, 240, 0.32)';
const COR_SEGUNDOS = '#ffffff';
const COR_AVISO = '#fff4dc';

// Um quadrinho de poder. Fora da forma de anjo, o ícone fica apagado. Em recarga, uma sombra
// cobre o ícone e desce, sumindo de cima para baixo conforme o tempo passa, com os segundos
// que faltam por cima.
function desenharEspaco(
  p: Pincel,
  x: number,
  y: number,
  icone: HTMLCanvasElement,
  escolhido: boolean,
  anjo: boolean,
  falta: number,
  total: number,
): void {
  p.arredondado(x, y, ESPACO, ESPACO, escolhido ? MOLDURA_ESCOLHIDO : MOLDURA_ESPACO);
  p.retangulo(x + 1, y + 1, ESPACO - 2, ESPACO - 2, 'rgba(26, 10, 22, 0.85)');
  p.imagem(icone, x + 1, y + 1, anjo ? (falta > 0 ? 0.55 : 1) : 0.3);
  if (falta <= 0) return;
  const coberto = Math.ceil((ESPACO - 2) * (falta / total));
  p.retangulo(x + 1, y + 1 + (ESPACO - 2 - coberto), ESPACO - 2, coberto, 'rgba(10, 4, 12, 0.6)');
  const segundos = textoEmPixels(String(Math.ceil(falta)), COR_SEGUNDOS);
  p.imagem(segundos, x + 1 + ((ESPACO - 2 - segundos.width) >> 1), y + 3);
}

// O quadrinho da arma: vazio e apagado sem arma; com ela, o ícone e, embaixo, a barrinha do tempo
// que ela ainda dura, que se esvazia até quebrar.
function desenharEspacoDaArma(p: Pincel, arma: ArmaNaMao | null, tempo: number): void {
  const acabando = arma !== null && arma.durabilidade < ACABANDO;
  const apaga = acabando && Math.floor(tempo * 8) % 2 === 0;
  p.arredondado(ARMA_X, ESPACOS_Y, ESPACO, ESPACO, arma ? MOLDURA_ARMA : MOLDURA_ESPACO);
  p.retangulo(ARMA_X + 1, ESPACOS_Y + 1, ESPACO - 2, ESPACO - 2, 'rgba(26, 10, 22, 0.85)');
  if (!arma) return;
  p.imagem(ICONES_ARMAS[arma.tipo], ARMA_X + 1, ESPACOS_Y + 1, apaga ? 0.45 : 1);
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

  const anjo = barraDoAnjo(personagem.anjo);
  const piscando = anjo.ativa && anjo.resta <= ALERTA_ANJO && Math.floor(tempo * PISCADAS) % 2 === 0;
  p.imagem(AUREOLA, ICONE_X, ANJO_Y + 1, anjo.ativa ? 1 : 0.5);
  desenharBarra(p, ANJO_Y, 3, anjo.cheia, !anjo.ativa ? ANJO_PRONTO : piscando ? ANJO_PISCANDO : ANJO);

  const { poderes } = personagem;
  const anjoPronto = podeUsarPoderes(personagem);
  PODERES.forEach((poder, i) => {
    const escolhido = i === poderes.selecionado;
    // Tentou usar e não saiu: o quadrinho escolhido treme de lado.
    const tremor = escolhido && poderes.tremor > 0 ? Math.round(Math.sin(poderes.tremor * 70)) : 0;
    const x = BARRA_X + i * (ESPACO + ENTRE_ESPACOS) + tremor;
    desenharEspaco(p, x, ESPACOS_Y, ICONES[poder], escolhido, anjoPronto, poderes.recarga[i], RECARGA_PODER[poder]);
  });
  desenharEspacoDaArma(p, personagem.arma, tempo);
  if (comAviso && poderes.aviso) desenharAviso(p, poderes.aviso.texto, poderes.aviso.resta);
  ctx.restore();
}
