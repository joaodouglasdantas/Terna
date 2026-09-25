// O tempo que resta da partida, no meio de cima da tela, entre os dois painéis: "04:59" com a
// fonte do jogo em tamanho dobrado, numa placa escura como a dos nomes. Nos últimos segundos
// fica vermelho e pisca. Desenhado por último, por cima da luz.

import { textoEmPixels } from '../motor/fonte';

const ESCALA = 2;
const TOPO = 3; // pixels da borda de cima da tela até a placa
const RESPIRO = 3; // pixels entre os números e a borda da placa
const COR_PLACA = 'rgba(10, 10, 22, 0.78)';
const COR = '#fff4dc';
const COR_ALERTA = '#ff5a67';
const ALERTA_MS = 30_000; // a partir daqui fica vermelho
const PISCA_MS = 10_000; // a partir daqui também pisca

// Onde a placa fica (a engrenagem, em HTML, se alinha a ela): centralizada em x, de TOPO a
// TOPO + ALTURA_CRONOMETRO.
export const ALTURA_CRONOMETRO = 5 * ESCALA + 2 * RESPIRO;

export function formatarTempo(ms: number): string {
  const segundos = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function desenharCronometro(ctx: CanvasRenderingContext2D, restanteMs: number, largura: number, tempo: number): void {
  const alerta = restanteMs <= ALERTA_MS;
  const apagado = restanteMs > 0 && restanteMs <= PISCA_MS && tempo % 1 > 0.7;
  const texto = textoEmPixels(formatarTempo(restanteMs), alerta ? COR_ALERTA : COR);
  const w = texto.width * ESCALA + 2 * RESPIRO;
  const x = Math.round((largura - w) / 2);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = COR_PLACA;
  // Cantos cortados em 1 px, como a placa dos nomes.
  ctx.fillRect(x + 1, TOPO, w - 2, ALTURA_CRONOMETRO);
  ctx.fillRect(x, TOPO + 1, 1, ALTURA_CRONOMETRO - 2);
  ctx.fillRect(x + w - 1, TOPO + 1, 1, ALTURA_CRONOMETRO - 2);
  if (!apagado) {
    ctx.drawImage(texto, x + RESPIRO, TOPO + RESPIRO, texto.width * ESCALA, texto.height * ESCALA);
  }
  ctx.restore();
}
