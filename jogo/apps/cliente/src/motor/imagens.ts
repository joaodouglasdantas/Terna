import type { Paleta, Recorte } from './tipos';

export function novoCanvas(largura: number, altura: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  return canvas;
}

export function contexto2d(canvas: HTMLCanvasElement, opcoes?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', opcoes);
  if (!ctx) throw new Error('o navegador não deu um contexto 2D para o canvas');
  return ctx;
}

export function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const imagem = new Image();
    imagem.onload = () => resolve(imagem);
    imagem.onerror = () => reject(new Error(`não foi possível carregar ${url}`));
    imagem.src = url;
  });
}

// A imagem carregada e já decodificada: mostrada depois, aparece inteira no primeiro quadro. Se o
// decode falhar (a imagem carregou), o navegador decodifica ao mostrar.
export async function carregarDecodificada(url: string): Promise<HTMLImageElement> {
  const imagem = await carregarImagem(url);
  await imagem.decode().catch(() => undefined);
  return imagem;
}

// `carregar` feito uma vez só: as chamadas seguintes recebem a mesma promessa. Falhando, ela não
// fica guardada — o "Tentar de novo" do carregamento tenta de verdade, em vez de receber a falha
// de antes para sempre.
export function umaVez<T>(carregar: () => Promise<T>): () => Promise<T> {
  let promessa: Promise<T> | null = null;
  return () => {
    promessa ??= carregar().catch((erro: unknown) => {
      promessa = null;
      throw erro;
    });
    return promessa;
  };
}

export function desenharQuadro(ctx: CanvasRenderingContext2D, folha: CanvasImageSource, q: Recorte, x: number, y: number): void {
  ctx.drawImage(folha, q.x, q.y, q.w, q.h, x, y, q.w, q.h);
}

// Cada caractere das matrizes é 1 pixel; '.' (ou qualquer símbolo fora da paleta) é transparente.
export function criarSprite(linhas: readonly string[], paleta: Paleta): HTMLCanvasElement {
  const canvas = novoCanvas(linhas[0].length, linhas.length);
  const ctx = contexto2d(canvas);
  linhas.forEach((linha, y) => {
    [...linha].forEach((simbolo, x) => {
      const cor = paleta[simbolo];
      if (cor) {
        ctx.fillStyle = cor;
        ctx.fillRect(x, y, 1, 1);
      }
    });
  });
  return canvas;
}

// Reduz o sprite por média de área, só com os pixels opacos: o contorno continua nítido e
// as cores vêm do próprio desenho (sem o borrado da suavização do navegador).
export function reduzirSprite(sprite: HTMLCanvasElement, escala: number): HTMLCanvasElement {
  if (escala === 1) return sprite;
  const w = sprite.width;
  const origem = contexto2d(sprite).getImageData(0, 0, w, sprite.height).data;
  const canvas = novoCanvas(Math.round(w * escala), Math.round(sprite.height * escala));
  const ctx = contexto2d(canvas);
  const passo = 1 / escala;
  for (let ty = 0; ty < canvas.height; ty++) {
    for (let tx = 0; tx < canvas.width; tx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let opaco = 0;
      let total = 0;
      for (let sy = Math.floor(ty * passo); sy < Math.ceil((ty + 1) * passo); sy++) {
        for (let sx = Math.floor(tx * passo); sx < Math.ceil((tx + 1) * passo); sx++) {
          const cobre =
            (Math.min(sx + 1, (tx + 1) * passo) - Math.max(sx, tx * passo)) *
            (Math.min(sy + 1, (ty + 1) * passo) - Math.max(sy, ty * passo));
          if (cobre <= 0 || sx >= w || sy >= sprite.height) continue;
          total += cobre;
          const i = (sy * w + sx) * 4;
          if (!origem[i + 3]) continue;
          r += origem[i] * cobre;
          g += origem[i + 1] * cobre;
          b += origem[i + 2] * cobre;
          opaco += cobre;
        }
      }
      if (opaco / total < 0.4) continue;
      ctx.fillStyle = `rgb(${r / opaco}, ${g / opaco}, ${b / opaco})`;
      ctx.fillRect(tx, ty, 1, 1);
    }
  }
  return canvas;
}
