// Nome em cima de cada personagem ("PLAYER 1" em azul, "PLAYER 2" em vermelho) numa placa
// escura com uma setinha apontando para a cabeça: as letras não se misturam com o céu nem com
// as árvores. Em coordenadas do mapa, presa à linha dos pés — o topo do quadro muda de altura
// de uma pose para outra e faria o nome tremer. Desenhada depois da luz, para a cor do nome
// não ser tingida pelo sol.

import { ALTURA_FONTE, textoEmPixels } from '../motor/fonte';
import { suavizar } from '../motor/matematica';
import type { Vista } from '../motor/tipos';

export interface Etiqueta {
  texto: string;
  cor: string;
}

// Um nome a desenhar e de quem: `x` é o eixo do corpo e `y` a linha dos pés, no mapa.
// `acima`: pixels a mais em cima da cabeça que o nome precisa deixar livres (a auréola do anjo).
export interface EtiquetaNoMapa {
  etiqueta: Etiqueta;
  x: number;
  y: number;
  acima?: number;
}

const TOPO_DA_CABECA = 30; // pixels acima da linha dos pés
const FOLGA = 3; // pixels entre a cabeça e a ponta da seta
const RESPIRO = 2; // pixels entre as letras e a borda da placa
const BEIRADA = 2; // pixels mínimos entre a placa e a borda da vista
const COR_PLACA = 'rgba(10, 10, 22, 0.78)';
// Um nome sobe este tanto quando o de trás e o da frente se cobririam (personagens juntos):
// a placa, os 2 px da seta e 1 de vão.
const DEGRAU = ALTURA_FONTE + 2 * RESPIRO + 3;

function desenharEtiqueta(
  ctx: CanvasRenderingContext2D,
  { etiqueta, x, y, acima = 0 }: EtiquetaNoMapa,
  subir: number,
  vista: Vista,
): void {
  const meio = Math.round(x);
  if (meio < vista.x || meio > vista.x + vista.largura) return; // quem não está nesta vista
  const texto = textoEmPixels(etiqueta.texto, etiqueta.cor);
  const w = texto.width + 2 * RESPIRO;
  const h = texto.height + 2 * RESPIRO;
  // Com o personagem na beirada do mapa (a câmera para ali), a placa não passa da borda da
  // vista: desliza para dentro e só a seta continua em cima da cabeça.
  const esquerda = Math.max(
    vista.x + BEIRADA,
    Math.min(vista.x + vista.largura - BEIRADA - w, meio - Math.floor(w / 2)),
  );
  const seta = Math.max(esquerda + 2, Math.min(esquerda + w - 3, meio));
  // A seta tem duas linhas (3 px e 1 px) e a ponta fica FOLGA acima da cabeça.
  const topo = Math.round(y - TOPO_DA_CABECA - acima - FOLGA - subir) - 1 - h;

  // Placa com os cantos cortados em 1 px, sem sobrepor pedaços (o fundo é translúcido).
  ctx.fillStyle = COR_PLACA;
  ctx.fillRect(esquerda + 1, topo, w - 2, h);
  ctx.fillRect(esquerda, topo + 1, 1, h - 2);
  ctx.fillRect(esquerda + w - 1, topo + 1, 1, h - 2);
  ctx.fillRect(seta - 1, topo + h, 3, 1);
  ctx.fillRect(seta, topo + h + 1, 1, 1);
  ctx.drawImage(texto, esquerda + RESPIRO, topo + RESPIRO);
}

// Na ordem da lista: o primeiro fica atrás. Chegando perto de um que vem depois, o de trás
// sobe um degrau aos poucos (começa a subir a 12 px de encostar e termina ao encostar), e os
// dois nomes nunca se cobrem. `vista` é o trecho do mapa onde estão sendo desenhados (com a
// tela dividida, o de uma das metades).
export function desenharEtiquetas(
  ctx: CanvasRenderingContext2D,
  itens: readonly EtiquetaNoMapa[],
  vista: Vista,
): void {
  itens.forEach((item, i) => {
    const largura = textoEmPixels(item.etiqueta.texto, item.etiqueta.cor).width + 2 * RESPIRO;
    let perto = 0;
    for (const outro of itens.slice(i + 1)) {
      perto = Math.max(perto, suavizar(largura + 12, largura, Math.abs(outro.x - item.x)));
    }
    desenharEtiqueta(ctx, item, DEGRAU * perto, vista);
  });
}
