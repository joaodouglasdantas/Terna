// Painel de cada personagem, num canto de cima da tela: o seu à esquerda e o do sósia à
// direita, espelhado. Fica sempre no mesmo canto, com a tela dividida ou não. Cada um tem a
// borda na cor do jogador (a mesma do nome em cima da cabeça) e, do canto para dentro: a foto
// do personagem, a barra de vida, a barra do tempo de anjo e os três espaços das habilidades
// que ainda virão. Em pixels da tela do jogo, desenhado por último, por cima da luz. Tudo sai
// do canto para dentro: as barras se esvaziam em direção à borda da tela, dos dois lados.

import { barraDoAnjo } from '../entidades/anjo';
import { VIDA_MAXIMA, retratoDo, type Personagem } from '../entidades/personagem';
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
const ESPACOS_HABILIDADE = 3;
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

// Espaço de habilidade ainda vazio: moldura clara, miolo escuro e um pontinho no meio. Mais
// apagado que as barras, que é o que conta por enquanto.
function desenharEspaco(p: Pincel, x: number, y: number): void {
  p.arredondado(x, y, ESPACO, ESPACO, 'rgba(255, 250, 240, 0.32)');
  p.retangulo(x + 1, y + 1, ESPACO - 2, ESPACO - 2, 'rgba(16, 14, 32, 0.6)');
  p.retangulo(x + 1, y + 1, ESPACO - 2, 1, 'rgba(0, 0, 0, 0.35)');
  p.retangulo(x + (ESPACO >> 1), y + (ESPACO >> 1), 1, 1, 'rgba(255, 250, 240, 0.3)');
}

export function desenharPainel(
  ctx: CanvasRenderingContext2D,
  personagem: Personagem,
  cores: CorDoJogador,
  canto: Canto,
  largura: number,
  tempo: number,
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

  for (let i = 0; i < ESPACOS_HABILIDADE; i++) {
    desenharEspaco(p, BARRA_X + i * (ESPACO + ENTRE_ESPACOS), ESPACOS_Y);
  }
  ctx.restore();
}
