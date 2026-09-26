// A mira do mouse dentro da partida, no lugar da seta do sistema: uma cruz de pixels de braços
// claros com contorno escuro, que lê sobre o céu, as árvores e o chão, e um miolo que diz se o
// clique sai: verde (o da interface) quando o poder escolhido (de anjo) ou a arma da mão (na
// forma base) sai se clicar agora, cinza quando não sai (sem arma, em recarga, enfeitiçado).
//
// Ela vira o próprio cursor do sistema (CSS `cursor: url(...)`), ampliada no tamanho dos pixels
// do jogo: quem desenha é o sistema, na hora em que o mouse mexe e no ponto exato dele. Desenhada
// dentro do canvas, ela chegava um quadro atrasada e andava de pixel do jogo em pixel do jogo.

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
const LADO = DESENHO.length;
const MAIOR_CURSOR = 128; // pixels: o maior cursor que os navegadores aceitam

const CONTORNO = '#0e0a18';

const MIRAS = {
  pronta: criarSprite(DESENHO, { o: CONTORNO, c: '#fff4dc', g: '#7fd66b' }),
  apagada: criarSprite(DESENHO, { o: CONTORNO, c: '#c9c3dc', g: '#8d86a8' }),
};
export type EstadoMira = keyof typeof MIRAS;

// Os cursores prontos, por estado e ampliação: o valor inteiro do `cursor` do CSS.
const prontos = new Map<string, string>();

function cursorDaMira(estado: EstadoMira, escala: number): string {
  const chave = `${estado}|${escala}`;
  const pronto = prontos.get(chave);
  if (pronto) return pronto;
  const lado = LADO * escala;
  const tela = document.createElement('canvas');
  tela.width = lado;
  tela.height = lado;
  const ctx = tela.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(MIRAS[estado], 0, 0, lado, lado);
  // O ponto quente é o meio do pixel do centro.
  const centro = MEIO * escala + (escala >> 1);
  const valor = `url(${tela.toDataURL()}) ${centro} ${centro}, crosshair`;
  prontos.set(chave, valor);
  return valor;
}

let aplicado = '';

// A cada quadro: põe no canvas a mira no `estado` pedido, ou tira (null: fica sem cursor, como fora
// da partida). Só mexe no estilo quando muda.
export function aplicarMira(canvas: HTMLCanvasElement, estado: EstadoMira | null): void {
  let valor = '';
  if (estado) {
    const pixel = canvas.getBoundingClientRect().width / canvas.width; // pixels da página por pixel do jogo
    const escala = Math.max(1, Math.min(Math.floor(MAIOR_CURSOR / LADO), Math.round(pixel)));
    valor = cursorDaMira(estado, escala);
  }
  if (valor === aplicado) return;
  aplicado = valor;
  canvas.style.cursor = valor;
}
