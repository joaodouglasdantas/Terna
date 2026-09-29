// As raízes das plantas da frente, embaixo do chão. Desenhadas uma vez no canvas do chão (chao.ts),
// depois de a folha do cenário carregar: cada árvore tem o tronco lido do próprio sprite (a largura
// e a cor da casca na base), e dele saem as raízes — as de fora abrindo para os lados, as do meio
// descendo —, grossas no começo e afinando, com galhinhos e fiapos nas pontas. Os arbustos têm
// raízes finas e curtas. Perto do tronco, umas raízes aparecem saltando da grama.
//
// Luz como no resto do chão: borda de cima clara, de baixo escura, e uma linha de sombra na terra
// logo embaixo; escurecem com a profundidade como a terra (fatorTerra), só que menos.

import { QUADROS_CENARIO } from '../gerado/cenario-quadros';
import { contexto2d } from '../motor/imagens';
import { ESPESSURA_GRAMA, fatorTerra } from './chao';
import { ARBUSTOS_CHAO, ARVORES_CHAO, esquerdaDaPlanta, type PlantaNoMapa } from './cenario';
import { sorteador } from './cor';

const RAIZ = {
  comprimento: [14, 30] as const, // px das raízes principais das árvores (as maiores, mais longas)
  arbusto: [5, 11] as const,
  galho: 0.035, // chance, por passo, de brotar uma raiz fina
  fiapos: 2, // fiapos na ponta de cada raiz
  tremido: 0.16, // quanto a direção entorta a cada passo (radianos)
  gravidade: 0.06, // quanto ela é puxada para baixo a cada passo
  abertura: 1.0, // ângulo (radianos, a partir da vertical) das raízes de fora
};
const CORES = {
  casca: [132, 88, 56], // se a folha não puder ser lida
  sombraTerra: [46, 28, 18],
};

type Cor = [number, number, number];

interface Tronco {
  meio: number; // no mapa
  largura: number;
  cor: Cor;
}

// A base do tronco no primeiro quadro do sprite: o trecho opaco mais perto do meio da base, 2px
// acima do pé, e a cor média dele.
function lerTronco(folha: CanvasImageSource, planta: PlantaNoMapa, grupo: 'arvores' | 'arbustos'): Tronco {
  const q = QUADROS_CENARIO[grupo][planta.indice][0];
  const m = q.m ?? 0;
  const esquerda = esquerdaDaPlanta(q, planta.x);
  const padrao: Tronco = { meio: planta.x, largura: grupo === 'arvores' ? 5 : 6, cor: CORES.casca as Cor };
  try {
    const canvas = document.createElement('canvas');
    canvas.width = q.w;
    canvas.height = 3;
    const c = contexto2d(canvas, { willReadFrequently: true });
    c.drawImage(folha, q.x, q.y + q.h - 3, q.w, 3, 0, 0, q.w, 3);
    const d = c.getImageData(0, 0, q.w, 1).data;
    const meioBase = m + (q.w - m) / 2;
    let melhor: { a: number; b: number } | null = null;
    for (let x = 0; x < q.w; x++) {
      if (d[x * 4 + 3] < 128) continue;
      let fim = x;
      while (fim + 1 < q.w && d[(fim + 1) * 4 + 3] >= 128) fim++;
      if (!melhor || Math.abs((x + fim) / 2 - meioBase) < Math.abs((melhor.a + melhor.b) / 2 - meioBase)) melhor = { a: x, b: fim };
      x = fim;
    }
    if (!melhor) return padrao;
    const cor: Cor = [0, 0, 0];
    for (let x = melhor.a; x <= melhor.b; x++) for (let k = 0; k < 3; k++) cor[k] += d[x * 4 + k] / (melhor.b - melhor.a + 1);
    // Arbusto: a "base" é a folhagem; as raízes dele são marrom-claras, não verdes.
    return {
      meio: esquerda + (melhor.a + melhor.b) / 2,
      largura: melhor.b - melhor.a + 1,
      cor: grupo === 'arvores' ? cor : (CORES.casca as Cor),
    };
  } catch {
    return padrao;
  }
}

// Máscara das raízes: espessura por pixel (0 = terra).
class Mascara {
  readonly px: Uint8Array;
  constructor(
    readonly largura: number,
    readonly altura: number,
  ) {
    this.px = new Uint8Array(largura * altura);
  }
  marcar(x: number, y: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.largura && y < this.altura) this.px[y * this.largura + x] = 1;
  }
  tem(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.largura && y < this.altura && this.px[y * this.largura + x] === 1;
  }
}

// Uma raiz andando pixel a pixel: a direção entorta um pouco a cada passo e vai sendo puxada para
// baixo; a espessura cai de `grossura` a 1 ao longo do caminho.
function crescer(
  mascara: Mascara,
  aleatorio: () => number,
  x: number,
  y: number,
  angulo: number,
  comprimento: number,
  grossura: number,
  fundoMax: number,
  galhos = true,
): void {
  let a = angulo;
  for (let passo = 0; passo < comprimento; passo++) {
    const t = passo / comprimento;
    const g = Math.max(1, Math.round(grossura * (1 - t) ** 0.7));
    for (let k = 0; k < g; k++) {
      // A grossura vai para baixo quando a raiz anda de lado, e para o lado quando ela desce.
      if (Math.abs(Math.cos(a)) > 0.6) mascara.marcar(x, y + k);
      else mascara.marcar(x + k, y);
    }
    // Puxada para baixo (π/2) devagar, e um tremido.
    a += (Math.PI / 2 - a) * RAIZ.gravidade + (aleatorio() - 0.5) * RAIZ.tremido * 2;
    x += Math.cos(a);
    y += Math.sin(a);
    if (y >= fundoMax) break;
    if (galhos && t > 0.25 && t < 0.85 && aleatorio() < RAIZ.galho) {
      const lado = aleatorio() < 0.5 ? -1 : 1;
      crescer(mascara, aleatorio, x, y, a + lado * (0.6 + aleatorio() * 0.5), (comprimento - passo) * (0.3 + aleatorio() * 0.3), 1, fundoMax, false);
    }
  }
  // Fiapos na ponta.
  for (let f = 0; f < RAIZ.fiapos; f++) {
    let [fx, fy] = [x, y];
    const fa = a + (aleatorio() - 0.5) * 1.6;
    for (let k = 0; k < 2 + aleatorio() * 3; k++) {
      fx += Math.cos(fa);
      fy += Math.sin(fa);
      if (aleatorio() < 0.8) mascara.marcar(fx, fy);
    }
  }
}

// Desenha as raízes no canvas do chão. `folga`: px de tufos acima da grama no canvas (a grama
// começa na linha `folga`).
export function desenharRaizes(chao: HTMLCanvasElement, folha: CanvasImageSource, folga: number): void {
  const largura = chao.width;
  const altura = chao.height;
  const topoTerra = folga + ESPESSURA_GRAMA;
  const alturaTerra = altura - topoTerra;
  const aleatorio = sorteador(271);
  const mascara = new Mascara(largura, altura);
  const saltadas = new Mascara(largura, altura); // as que aparecem por cima da grama
  const corDe = new Map<number, Cor>(); // cor da casca por pixel (da planta que o marcou por último)
  const corSaltada = new Map<number, Cor>();

  const plantar = (tronco: Tronco, arvore: boolean, alturaPlanta: number): void => {
    const antes = Uint8Array.from(mascara.px);
    const esquerda = tronco.meio - tronco.largura / 2;
    if (arvore) {
      // Maiores (mais altas) têm mais raízes, mais grossas e mais longas.
      const porte = Math.min(1, Math.max(0, (alturaPlanta - 60) / 90));
      const quantas = 3 + Math.round(porte * 3) + (tronco.largura > 6 ? 1 : 0);
      const [cMin, cMax] = RAIZ.comprimento;
      for (let r = 0; r < quantas; r++) {
        const u = quantas === 1 ? 0.5 : r / (quantas - 1); // 0 = a de fora da esquerda, 1 = da direita
        const x = esquerda + u * (tronco.largura - 1);
        // As de fora saem quase deitadas; as do meio, descendo.
        const angulo = Math.PI / 2 + (0.5 - u) * 2 * RAIZ.abertura * (0.85 + aleatorio() * 0.3);
        const comprimento = (cMin + (cMax - cMin) * porte) * (0.7 + aleatorio() * 0.45) * (1 - Math.abs(0.5 - u) * 0.3);
        const grossura = 2 + Math.round(porte * 0.6 + (tronco.largura > 7 ? 0.6 : 0) + (1 - Math.abs(0.5 - u) * 2) * 0.5);
        crescer(mascara, aleatorio, x, topoTerra - 1, angulo, comprimento, grossura, altura - 2);
      }
      // Saltando da grama, dos dois lados do tronco: um arco baixo de 3 a 6 px.
      for (const lado of [-1, 1]) {
        if (aleatorio() < 0.25 + porte * 0.5) {
          const x0 = lado < 0 ? Math.floor(esquerda) - 1 : Math.ceil(esquerda + tronco.largura);
          const n = 3 + Math.round(aleatorio() * 3 * (0.5 + porte));
          for (let k = 0; k < n; k++) {
            const y = folga + (k < n - 2 ? 0 : 1) + (k === 0 ? -1 : 0);
            saltadas.marcar(x0 + lado * k, y);
            corSaltada.set(y * largura + x0 + lado * k, tronco.cor);
            if (k < n / 2) {
              saltadas.marcar(x0 + lado * k, y + 1);
              corSaltada.set((y + 1) * largura + x0 + lado * k, tronco.cor);
            }
          }
        }
      }
    } else {
      const quantas = 2 + Math.round(aleatorio() * 2);
      const [cMin, cMax] = RAIZ.arbusto;
      for (let r = 0; r < quantas; r++) {
        const u = quantas === 1 ? 0.5 : r / (quantas - 1);
        const x = tronco.meio + (u - 0.5) * Math.min(10, tronco.largura);
        const angulo = Math.PI / 2 + (0.5 - u) * 1.6 + (aleatorio() - 0.5) * 0.3;
        crescer(mascara, aleatorio, x, topoTerra, angulo, cMin + aleatorio() * (cMax - cMin), 1, altura - 2, false);
      }
    }
    for (let p = 0; p < mascara.px.length; p++) if (mascara.px[p] && !antes[p]) corDe.set(p, tronco.cor);
  };

  ARVORES_CHAO.forEach((planta) => plantar(lerTronco(folha, planta, 'arvores'), true, QUADROS_CENARIO.arvores[planta.indice][0].h));
  ARBUSTOS_CHAO.forEach((planta) => plantar(lerTronco(folha, planta, 'arbustos'), false, 0));

  const ctx = contexto2d(chao, { willReadFrequently: true });
  const imagem = ctx.getImageData(0, 0, largura, altura);
  const d = imagem.data;
  const grama = (i: number): boolean => d[i + 1] > d[i] + 12 && d[i + 1] > d[i + 2];

  const pintar = (x: number, y: number, cor: readonly number[], fator: number): void => {
    const i = (y * largura + x) * 4;
    d[i] = cor[0] * fator;
    d[i + 1] = cor[1] * fator;
    d[i + 2] = cor[2] * fator;
    d[i + 3] = 255;
  };
  const tons = (casca: Cor) => ({
    luz: casca.map((v) => Math.min(255, v * 1.28 + 12)),
    corpo: casca.map((v) => v * 0.95),
    sombra: casca.map((v) => v * 0.58),
  });

  // Primeiro a sombra na terra, logo abaixo e à direita de cada raiz (a grama fica por cima).
  for (let y = topoTerra; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (mascara.tem(x, y) || !(mascara.tem(x, y - 1) || mascara.tem(x - 1, y - 1))) continue;
      const i = (y * largura + x) * 4;
      if (grama(i)) continue;
      d[i] = d[i] * 0.55 + CORES.sombraTerra[0] * 0.45 * fatorTerra(y - topoTerra, alturaTerra);
      d[i + 1] = d[i + 1] * 0.55 + CORES.sombraTerra[1] * 0.45 * fatorTerra(y - topoTerra, alturaTerra);
      d[i + 2] = d[i + 2] * 0.55 + CORES.sombraTerra[2] * 0.45 * fatorTerra(y - topoTerra, alturaTerra);
    }
  }
  // As raízes: borda de cima clara, de baixo escura, e escurecendo com a profundidade.
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (!mascara.tem(x, y)) continue;
      const i = (y * largura + x) * 4;
      if (grama(i)) continue; // a grama fica na frente
      const t = tons(corDe.get(y * largura + x) ?? (CORES.casca as Cor));
      const cor = !mascara.tem(x, y - 1) ? t.luz : !mascara.tem(x, y + 1) ? t.sombra : t.corpo;
      pintar(x, y, cor, fatorTerra(Math.max(0, y - topoTerra), alturaTerra, true));
    }
  }
  // As que saltam da grama: por cima de tudo, com luz em cima e sombra embaixo.
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (!saltadas.tem(x, y)) continue;
      const t = tons(corSaltada.get(y * largura + x) ?? (CORES.casca as Cor));
      pintar(x, y, !saltadas.tem(x, y - 1) ? t.luz : t.sombra, 1);
    }
  }
  ctx.putImageData(imagem, 0, 0);
}
