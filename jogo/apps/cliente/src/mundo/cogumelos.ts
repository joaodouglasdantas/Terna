// Cogumelos pequenos na grama, em coordenadas do mapa: quase todos no pé das árvores e das moitas,
// em grupinhos, e um ou outro sozinho no meio do caminho. Três tipos: o vermelho de pintas brancas,
// o marrom em touceira (um grande e um pequeno) e o claro, fininho e alto. Cada um tem uma sombrinha
// no chão e, com o raio de sol batendo, o chapéu clareia um pouco (a luz é da camada de raios).

import { criarSprite } from '../motor/imagens';
import type { Luz } from '../motor/tipos';
import { desenharSombra } from './cenario';

// Chapéu (R/r, b/B, c/C: claro e sombra), pintas (w), a parte de baixo do chapéu (t) e o pé (s,
// com a sombra S). A última linha fica 1px dentro da grama.
const PALETA = {
  R: '#e8483c',
  r: '#a82a2a',
  w: '#fff4e8',
  b: '#b07a45',
  B: '#d9a468',
  c: '#dccba2',
  C: '#f6eed6',
  t: '#6b4424',
  s: '#f0e6d0',
  S: '#bfae8c',
};

const TIPOS = {
  vermelho: criarSprite(['..RR..', '.RwRR.', 'RRRRwR', 'rrrrrr', '..sS..', '..sS..'], PALETA),
  touceira: criarSprite(['.BB....', 'BbBb...', 'tttt.B.', '.sS.BbB', '.sS.ttt', '.sS..s.'], PALETA),
  claro: criarSprite(['.CC.', 'CCcc', 'tttt', '.sS.', '.sS.', '.sS.', '.sS.'], PALETA),
};
type TipoCogumelo = keyof typeof TIPOS;

// `x` é o meio do cogumelo no mapa.
const COGUMELOS: { x: number; tipo: TipoCogumelo }[] = [
  { x: 40, tipo: 'touceira' },
  { x: 110, tipo: 'vermelho' },
  { x: 117, tipo: 'claro' },
  { x: 214, tipo: 'touceira' },
  { x: 288, tipo: 'claro' },
  { x: 345, tipo: 'vermelho' },
  { x: 430, tipo: 'touceira' },
  { x: 437, tipo: 'claro' },
  { x: 520, tipo: 'vermelho' },
  { x: 664, tipo: 'claro' },
  { x: 700, tipo: 'touceira' },
  { x: 784, tipo: 'vermelho' },
  { x: 790, tipo: 'vermelho' },
  { x: 858, tipo: 'claro' },
  { x: 952, tipo: 'touceira' },
  { x: 1004, tipo: 'vermelho' },
  { x: 1102, tipo: 'claro' },
  { x: 1108, tipo: 'touceira' },
  { x: 1182, tipo: 'vermelho' },
  { x: 1300, tipo: 'touceira' },
  { x: 1332, tipo: 'claro' },
  { x: 1412, tipo: 'vermelho' },
];

// Em coordenadas do mapa (o chamador já transladou pela câmera `camX`), depois das plantas.
export function desenharCogumelos(ctx: CanvasRenderingContext2D, luz: Luz, yChao: number, camX: number, largura: number): void {
  for (const { x, tipo } of COGUMELOS) {
    const sprite = TIPOS[tipo];
    if (x + sprite.width < camX || x - sprite.width > camX + largura) continue;
    desenharSombra(ctx, luz, x, yChao, sprite.width + 2, 0.45);
    ctx.drawImage(sprite, Math.round(x - sprite.width / 2), yChao + 1 - sprite.height);
  }
}
