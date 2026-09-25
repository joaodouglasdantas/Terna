// A mira do mouse dentro da partida, no lugar da seta do sistema (o canvas esconde a seta): uma
// cruz de pixels de braços claros com contorno escuro, que lê sobre o céu, as árvores e o chão, e
// um miolo que diz se o clique sai: verde (o da interface) quando o poder escolhido (de anjo) ou a
// arma da mão (na forma base) sai se clicar agora, cinza quando não sai (sem arma, em recarga,
// enfeitiçado). Em pixels da tela
// do jogo, desenhada por último.

import { criarSprite } from '../motor/imagens';

const DESENHO = [
  '......oco......',
  '......oco......',
  '......oco......',
  '.......o.......',
  '...............',
  '.......o.......',
  'ooo...ogo...ooo',
  'ccco.ogggo.occc',
  'ooo...ogo...ooo',
  '.......o.......',
  '...............',
  '.......o.......',
  '......oco......',
  '......oco......',
  '......oco......',
];
const MEIO = 7; // o centro, na linha e na coluna 7

const CONTORNO = '#0e0a18';

const MIRAS = {
  pronta: criarSprite(DESENHO, { o: CONTORNO, c: '#fff4dc', g: '#7fd66b' }),
  apagada: criarSprite(DESENHO, { o: CONTORNO, c: '#c9c3dc', g: '#8d86a8' }),
};

// `x`, `y`: onde o cursor está, em pixels da tela do jogo.
export function desenharMira(ctx: CanvasRenderingContext2D, x: number, y: number, pronta: boolean): void {
  ctx.drawImage(pronta ? MIRAS.pronta : MIRAS.apagada, Math.round(x) - MEIO, Math.round(y) - MEIO);
}
