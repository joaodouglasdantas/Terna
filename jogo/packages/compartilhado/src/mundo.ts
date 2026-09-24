// Largura do mapa em pixels: a tela mostra 480 de cada vez e a câmera segue o personagem.
export const MUNDO = 1440;

// Tela do jogo em pixels (o canvas é ampliado na janela sem suavizar).
export const TELA = { largura: 480, altura: 270 } as const;

export type Direcao = 1 | -1; // 1 = direita, -1 = esquerda
