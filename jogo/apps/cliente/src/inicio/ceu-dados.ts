// Gerado por ferramentas/ceu.py: a camada do céu, as nuvens que andam (onde ficam na arte e
// onde estão no atlas tela-inicial-nuvens.webp) e as estrelas, em pixels da arte.

export const ARTE_CEU = { largura: 1672, altura: 940 };
// A camada do céu (tela-inicial-ceu.webp e a máscara da frente) começa aqui na arte.
export const CEU_LIMPO = { x: 306, y: 16, w: 1253, h: 220 };
// Quanto (pixels da arte) as nuvens andam para cada lado, no máximo.
export const ANDA = 14;

// x, y: o canto na arte; w, h: o tamanho; ay: a linha onde ela começa no atlas.
export const NUVENS: readonly { x: number; y: number; w: number; h: number; ay: number }[] = [
  { x: 1069, y: 42, w: 88, h: 38, ay: 0 },
  { x: 885, y: 91, w: 172, h: 40, ay: 40 },
  { x: 498, y: 125, w: 47, h: 41, ay: 82 },
  { x: 472, y: 145, w: 29, h: 26, ay: 125 },
  { x: 934, y: 153, w: 211, h: 49, ay: 153 },
];

// x, y: o meio da estrela na arte; forca: de 0 a 1 (as mais fortes abrem brilho em cruz).
export const ESTRELAS: readonly { x: number; y: number; forca: number }[] = [
  { x: 621.0, y: 8.5, forca: 0.33 },
  { x: 387.0, y: 12.5, forca: 0.38 },
  { x: 846.5, y: 26.5, forca: 0.51 },
  { x: 541.0, y: 46.5, forca: 0.38 },
  { x: 539.0, y: 48.0, forca: 0.32 },
  { x: 975.0, y: 64.0, forca: 0.37 },
  { x: 859.0, y: 74.0, forca: 0.33 },
  { x: 834.3, y: 85.7, forca: 0.64 },
  { x: 835.0, y: 126.0, forca: 0.4 },
  { x: 779.0, y: 47.0, forca: 0.22 },
  { x: 743.0, y: 24.0, forca: 0.32 },
  { x: 738.0, y: 86.0, forca: 0.31 },
  { x: 634.0, y: 52.0, forca: 0.18 },
  { x: 1109.0, y: 40.0, forca: 0.25 },
  { x: 1183.0, y: 103.0, forca: 0.38 },
  { x: 1075.0, y: 97.0, forca: 0.2 },
  { x: 670.0, y: 69.0, forca: 0.44 },
  { x: 939.0, y: 77.0, forca: 0.24 },
  { x: 891.0, y: 37.0, forca: 0.41 },
  { x: 1014.0, y: 137.0, forca: 0.33 },
  { x: 1192.0, y: 24.0, forca: 0.42 },
  { x: 724.0, y: 133.0, forca: 0.27 },
  { x: 467.0, y: 108.0, forca: 0.28 },
  { x: 905.0, y: 143.0, forca: 0.25 },
  { x: 1136.0, y: 107.0, forca: 0.37 },
  { x: 498.0, y: 63.0, forca: 0.29 },
  { x: 1248.0, y: 98.0, forca: 0.31 },
  { x: 689.0, y: 102.0, forca: 0.23 },
  { x: 432.0, y: 52.0, forca: 0.25 },
  { x: 953.0, y: 141.0, forca: 0.33 },
  { x: 779.0, y: 136.0, forca: 0.22 },
  { x: 580.0, y: 23.0, forca: 0.36 },
  { x: 1058.0, y: 142.0, forca: 0.28 },
  { x: 994.0, y: 30.0, forca: 0.38 },
  { x: 1071.0, y: 30.0, forca: 0.42 },
  { x: 934.0, y: 36.0, forca: 0.23 },
  { x: 569.0, y: 74.0, forca: 0.19 },
  { x: 421.0, y: 139.0, forca: 0.28 },
  { x: 1015.0, y: 82.0, forca: 0.23 },
  { x: 899.0, y: 88.0, forca: 0.38 },
  { x: 699.0, y: 37.0, forca: 0.23 },
  { x: 1148.0, y: 24.0, forca: 0.41 },
  { x: 465.0, y: 23.0, forca: 0.26 },
  { x: 1045.0, y: 58.0, forca: 0.33 },
  { x: 794.0, y: 101.0, forca: 0.27 },
  { x: 518.0, y: 96.0, forca: 0.34 },
];
