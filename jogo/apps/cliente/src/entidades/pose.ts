// O quadro de um personagem e onde ele vai para a tela, usado pelo corpo (personagem.ts), pelo
// rastro do dash e pelo que o anjo desenha em volta dele.

// Um quadro do sprite. `w`/`h`: o tamanho do recorte. As âncoras (olhos, ombro, tarja) são da
// forma de anjo (anjo/anjo.ts) e só existem nos quadros do Anjo; nos da Leslie ficam neutras.
export interface QuadroPersonagem {
  w: number;
  h: number;
  olhos: readonly (readonly number[])[];
  ombro: readonly number[];
  tarja: readonly number[]; // x, y, largura e altura do mosaico sobre o quadril
  meio?: number; // de frente: eixo do corpo, a coluna x se espelha em meio − x
}

// O quadro que vai para a tela e onde: `x` e `topo` já arredondados, como no desenho do sprite.
export interface Pose {
  quadro: QuadroPersonagem;
  imagem: HTMLCanvasElement;
  eixo: number;
  x: number;
  topo: number;
  direcao: 1 | -1;
  deFrente: boolean; // parado, o desenho olha para a tela
}
