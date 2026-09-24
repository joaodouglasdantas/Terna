// Tipos básicos de desenho usados em todo o cliente.

// Recorte de uma folha de sprites; `m` é a margem à esquerda por onde a copa verga.
export interface Recorte {
  x: number;
  y: number;
  w: number;
  h: number;
  m?: number;
}

// Imagem já recortada e a coluna do centro do corpo, que fica sobre o `x` de quem a usa.
export interface Sprite {
  imagem: HTMLCanvasElement;
  eixo: number;
}

// Símbolo da matriz de pixels → cor.
export type Paleta = Record<string, string>;

// Onde o sol está e quanto ele ilumina (ver luzDoSol em mundo/cenario.ts).
export interface Luz {
  x: number;
  y: number;
  elevacao: number;
  lado: number;
  forca: number;
}
