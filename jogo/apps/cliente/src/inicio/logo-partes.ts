// Gerado a partir do que ferramentas/separar-logo.py tira da logo da temporada (logo-partes.json): onde fica cada parte
// que se mexe (os cipós soltos e as flores) na logo e no atlas (assets/logo-partes.webp), as pontas
// dos cipós (de onde caem os pedacinhos de musgo) e o musgo preso nas letras (onde o orvalho brilha).
// Medidas em pixels da imagem da logo (logo.webp); u e v em frações dela.

export const LOGO = { largura: 1626, altura: 708 };

export interface Parte {
  tipo: 'cipo' | 'flor';
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number; // onde começa no atlas (todas as partes estão no alto dele)
}

export const PARTES: readonly Parte[] = [
  { tipo: 'cipo', x: 1458, y: 78, w: 17, h: 29, ax: 0 },
  { tipo: 'cipo', x: 9, y: 103, w: 26, h: 40, ax: 19 },
  { tipo: 'cipo', x: 18, y: 158, w: 19, h: 26, ax: 47 },
  { tipo: 'cipo', x: 329, y: 186, w: 32, h: 60, ax: 68 },
  { tipo: 'cipo', x: 18, y: 193, w: 18, h: 28, ax: 102 },
  { tipo: 'cipo', x: 336, y: 264, w: 19, h: 42, ax: 122 },
  { tipo: 'cipo', x: 748, y: 343, w: 21, h: 35, ax: 143 },
  { tipo: 'cipo', x: 1079, y: 349, w: 30, h: 91, ax: 166 },
  { tipo: 'cipo', x: 133, y: 363, w: 30, h: 30, ax: 198 },
  { tipo: 'cipo', x: 136, y: 408, w: 25, h: 31, ax: 230 },
  { tipo: 'cipo', x: 1415, y: 433, w: 25, h: 27, ax: 257 },
  { tipo: 'cipo', x: 1129, y: 434, w: 24, h: 54, ax: 284 },
  { tipo: 'cipo', x: 872, y: 448, w: 16, h: 20, ax: 310 },
  { tipo: 'cipo', x: 995, y: 453, w: 28, h: 26, ax: 328 },
  { tipo: 'cipo', x: 486, y: 455, w: 17, h: 24, ax: 358 },
  { tipo: 'cipo', x: 1432, y: 460, w: 15, h: 21, ax: 377 },
  { tipo: 'cipo', x: 442, y: 473, w: 21, h: 46, ax: 394 },
  { tipo: 'cipo', x: 1424, y: 481, w: 35, h: 46, ax: 417 },
  { tipo: 'cipo', x: 1136, y: 496, w: 17, h: 22, ax: 454 },
  { tipo: 'cipo', x: 1016, y: 545, w: 17, h: 20, ax: 473 },
  { tipo: 'cipo', x: 1432, y: 549, w: 15, h: 24, ax: 492 },
  { tipo: 'cipo', x: 1508, y: 560, w: 29, h: 30, ax: 509 },
  { tipo: 'cipo', x: 128, y: 582, w: 21, h: 39, ax: 540 },
  { tipo: 'cipo', x: 1510, y: 591, w: 28, h: 51, ax: 563 },
  { tipo: 'cipo', x: 157, y: 597, w: 21, h: 29, ax: 593 },
  { tipo: 'cipo', x: 1487, y: 598, w: 15, h: 35, ax: 616 },
  { tipo: 'cipo', x: 154, y: 627, w: 20, h: 49, ax: 633 },
  { tipo: 'cipo', x: 1513, y: 666, w: 17, h: 26, ax: 655 },
  { tipo: 'flor', x: 70, y: 44, w: 54, h: 48, ax: 674 },
  { tipo: 'flor', x: 1394, y: 51, w: 62, h: 62, ax: 730 },
  { tipo: 'flor', x: 742, y: 229, w: 47, h: 46, ax: 794 },
  { tipo: 'flor', x: 437, y: 262, w: 45, h: 50, ax: 843 },
  { tipo: 'flor', x: 1468, y: 315, w: 51, h: 54, ax: 890 },
  { tipo: 'flor', x: 1477, y: 358, w: 71, h: 73, ax: 943 },
  { tipo: 'flor', x: 160, y: 421, w: 56, h: 58, ax: 1016 },
  { tipo: 'flor', x: 135, y: 462, w: 41, h: 40, ax: 1074 },
];

export const PONTAS_DOS_CIPOS: readonly { u: number; v: number }[] = [
  { u: 0.9019, v: 0.1511 },
  { u: 0.0135, v: 0.202 },
  { u: 0.0169, v: 0.2599 },
  { u: 0.2122, v: 0.3475 },
  { u: 0.0166, v: 0.3121 },
  { u: 0.2125, v: 0.4322 },
  { u: 0.4665, v: 0.5339 },
  { u: 0.6728, v: 0.6215 },
  { u: 0.091, v: 0.5551 },
  { u: 0.0913, v: 0.6201 },
  { u: 0.8779, v: 0.6497 },
  { u: 0.7017, v: 0.6893 },
  { u: 0.5412, v: 0.661 },
  { u: 0.6205, v: 0.6766 },
  { u: 0.3041, v: 0.6766 },
  { u: 0.8853, v: 0.6794 },
  { u: 0.2783, v: 0.7331 },
  { u: 0.8865, v: 0.7444 },
  { u: 0.7039, v: 0.7316 },
  { u: 0.6301, v: 0.798 },
  { u: 0.8853, v: 0.8093 },
  { u: 0.9363, v: 0.8333 },
  { u: 0.0852, v: 0.8771 },
  { u: 0.9373, v: 0.9068 },
  { u: 0.103, v: 0.8842 },
  { u: 0.9191, v: 0.8941 },
  { u: 0.1009, v: 0.9548 },
  { u: 0.9357, v: 0.9774 },
];

export const MUSGO_PRESO: readonly { u: readonly [number, number]; v: readonly [number, number] }[] = [
  { u: [0.0055, 0.2054], v: [0.0113, 0.2048] },
  { u: [0.7891, 0.9231], v: [0.0494, 0.2627] },
  { u: [0.4077, 0.4649], v: [0.0607, 0.2062] },
  { u: [0.2355, 0.2651], v: [0.0621, 0.1003] },
  { u: [0.5603, 0.6531], v: [0.0989, 0.3121] },
  { u: [0.2817, 0.3438], v: [0.1215, 0.2726] },
  { u: [0.73, 0.7558], v: [0.2161, 0.2924] },
  { u: [0.6458, 0.7042], v: [0.2232, 0.4506] },
  { u: [0.7681, 0.7952], v: [0.2613, 0.3319] },
  { u: [0.4287, 0.5], v: [0.2994, 0.4322] },
  { u: [0.9016, 0.9416], v: [0.3701, 0.4534] },
  { u: [0.5277, 0.559], v: [0.4096, 0.4929] },
  { u: [0.2786, 0.3426], v: [0.4421, 0.5664] },
  { u: [0.7491, 0.7724], v: [0.452, 0.5141] },
  { u: [0.8702, 0.925], v: [0.4605, 0.6017] },
  { u: [0.9311, 0.9625], v: [0.4675, 0.5339] },
  { u: [0.0953, 0.1298], v: [0.4915, 0.5565] },
  { u: [0.0732, 0.0916], v: [0.5395, 0.6073] },
  { u: [0.9354, 0.9723], v: [0.5621, 0.6342] },
  { u: [0.1704, 0.1962], v: [0.5819, 0.6681] },
  { u: [0.0504, 0.0947], v: [0.6116, 0.7797] },
  { u: [0.2891, 0.321], v: [0.613, 0.8263] },
  { u: [0.0953, 0.1445], v: [0.6582, 0.8559] },
  { u: [0.6199, 0.6384], v: [0.6582, 0.7867] },
  { u: [0.9157, 0.9416], v: [0.7797, 0.8701] },
  { u: [0.9262, 0.9459], v: [0.8927, 0.9562] },
];
