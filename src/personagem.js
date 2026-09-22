const PALETA_PERSONAGEM = {
  K: '#171320', // contorno
  d: '#4a2a1e', // cabelo sombra
  H: '#7a4426', // cabelo
  J: '#a86a34', // cabelo luz
  t: '#a85f42', // pele sombra
  s: '#d98d63', // pele
  S: '#f2b98f', // pele luz
  W: '#f2ece0', // olho
  E: '#171320', // pupila
  n: '#1e4a4a', // túnica sombra
  v: '#2f7070', // túnica
  V: '#47968f', // túnica luz
  c: '#8c2b2b', // cachecol sombra
  C: '#c74141', // cachecol
  r: '#e56a4f', // cachecol luz
  p: '#2b3350', // calça sombra
  P: '#414d70', // calça
  o: '#2a1c18', // bota sombra
  O: '#4a3226', // bota
  G: '#6b4a33', // bota luz
  L: '#33241c', // cinto
  M: '#c9a227', // fivela
};

// Cada caractere é 1 pixel; '.' é transparente. Personagem virado para a direita.
// Os quadros são montados por composição: cabeça + tronco + pernas, todos 16 de largura.

const CABECA = [
  '.....dHHHd......',
  '...dHHJJHHHd....',
  '..dHHJJJHHHHd...',
  '..dHHHHHHHHHd...',
  '..dHtSSSSSStHd..',
  '..dHtSSWWESStd..',
  '..dHtSSSKKSStd..',
  '...dtsSSSSstd...',
];

// Os braços se separam do tronco por valor de cor, não por contorno: não há
// largura sobrando para uma linha escura entre braço e peito.
const TRONCO = [
  '...cCCCCCCCc....',
  '..KcCCCCCCcrr...',
  '..KvvVVVVVVvvK..',
  '..KnnVVVVVVnnK..',
  '..KnnVVVVVVnnK..',
  '..KtsVVVVVVstK..',
  '...KLLLMMLLLK...',
];

// Ponta do cachecol caída — alterna com a de cima para dar respiro.
const TRONCO_CACHECOL_BAIXO = [
  '...cCCCCCCCc....',
  '..KcCCCCCCcr....',
  '..KvvVVVVVVvvKr.',
  '..KnnVVVVVVnnK..',
  '..KnnVVVVVVnnK..',
  '..KtsVVVVVVstK..',
  '...KLLLMMLLLK...',
];

// Na caminhada um braço vem à frente (tom médio) e o outro vai atrás (escuro).
const TRONCO_BRACO_A = [
  '...cCCCCCCCc....',
  '..KcCCCCCCcrr...',
  '..KvvVVVVVVvvK..',
  '..KvvVVVVVVnnK..',
  '..KvvVVVVVVnnK..',
  '..KtsVVVVVVstK..',
  '...KLLLMMLLLK...',
];

const TRONCO_BRACO_B = [
  '...cCCCCCCCc....',
  '..KcCCCCCCcr....',
  '..KvvVVVVVVvvKr.',
  '..KnnVVVVVVvvK..',
  '..KnnVVVVVVvvK..',
  '..KtsVVVVVVstK..',
  '...KLLLMMLLLK...',
];

const PERNAS_PARADO = [
  '....KPPpPPpK....',
  '....KPPpPPpK....',
  '....KPp.KPpK....',
  '....KPp.KPpK....',
  '....KPp.KPpK....',
  '...KOGGo.KOGGo..',
  '...Koooo.Koooo..',
];

const PERNAS_PASSO_ESQUERDO = [
  '....KPPpPPpK....',
  '....KPPpPPpK....',
  '...KPPp.KPpK....',
  '..KPPp..KPPpK...',
  '..KPp....KPpK...',
  '.KOGGo...KOGGo..',
  '.Koooo...Koooo..',
];

const PERNAS_PASSAGEM = [
  '....KPPpPPpK....',
  '....KPPpPPpK....',
  '....KPp.KPpK....',
  '....KPp.KPpK....',
  '....KPp..KPK....',
  '...KOGGo.KOGo...',
  '...Koooo.Kooo...',
];

const PERNAS_PASSO_DIREITO = [
  '....KPPpPPpK....',
  '....KPPpPPpK....',
  '...KPp..KPPpK...',
  '...KPp...KPPpK..',
  '...KPK....KPpK..',
  '..KOGo....KOGGo.',
  '..Kooo....Koooo.',
];

// Na subida as pernas recolhem: as linhas de baixo ficam vazias de propósito.
const PERNAS_SUBINDO = [
  '....KPPpPPpK....',
  '...KPPpKPPpK....',
  '..KPPp..KPPpK...',
  '..KOGGo..KOGGo..',
  '..Koooo..Koooo..',
  '................',
  '................',
];

const PERNAS_CAINDO = [
  '....KPPpPPpK....',
  '....KPPpPPpK....',
  '...KPp...KPpK...',
  '..KPp.....KPpK..',
  '..KPp.....KPpK..',
  '.KOGGo....KOGGo.',
  '.Koooo....Koooo.',
];

// Deitado tem silhueta própria (24x10): cabeça à direita, pés à esquerda.
const DEITADO = [
  '..................dHHd..',
  '.................dHJJHd.',
  '................dHJJHHd.',
  '...........cCCdHtSSSSHd.',
  '.....KvvVVVcCCdtSWWESHd.',
  '..KPPPPvVVVVcCtsSSKKSHd.',
  '.KOGPPPPpvVVVcCtsSSSSHd.',
  'KOGGPPPPppvVVVcCtsSSHHd.',
  'KooooPPpppKvvvcCCtdHHdd.',
  '.KoooKPPppKvvvcCtdHHd...',
];

// Peito 1px mais cheio: o personagem respira enquanto está deitado.
const DEITADO_RESPIRANDO = [
  '..................dHHd..',
  '.................dHJJHd.',
  '................dHJJHHd.',
  '...........cCCdHtSSSSHd.',
  '....KvvVVVVcCCdtSWWESHd.',
  '..KPPPPvVVVVcCtsSSKKSHd.',
  '.KOGPPPPpvVVVcCtsSSSSHd.',
  'KOGGPPPPppvVVVcCtsSSHHd.',
  'KooooPPpppKvvvcCCtdHHdd.',
  '.KoooKPPppKvvvcCtdHHd...',
];

const QUADROS_PERSONAGEM = {
  parado: [
    [...CABECA, ...TRONCO, ...PERNAS_PARADO],
    [...CABECA, ...TRONCO_CACHECOL_BAIXO, ...PERNAS_PARADO],
  ],
  andando: [
    [...CABECA, ...TRONCO_BRACO_A, ...PERNAS_PASSO_ESQUERDO],
    [...CABECA, ...TRONCO_BRACO_B, ...PERNAS_PASSAGEM],
    [...CABECA, ...TRONCO_BRACO_B, ...PERNAS_PASSO_DIREITO],
    [...CABECA, ...TRONCO_BRACO_A, ...PERNAS_PASSAGEM],
  ],
  subindo: [[...CABECA, ...TRONCO, ...PERNAS_SUBINDO]],
  caindo: [[...CABECA, ...TRONCO, ...PERNAS_CAINDO]],
  deitado: [DEITADO, DEITADO_RESPIRANDO],
};

function criarSprite(linhas, paleta) {
  const canvas = document.createElement('canvas');
  canvas.width = linhas[0].length;
  canvas.height = linhas.length;
  const ctx = canvas.getContext('2d');
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
