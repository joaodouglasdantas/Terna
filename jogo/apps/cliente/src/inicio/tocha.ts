// As duas tochas da tela da conta: grandes, uma de cada lado da caixa, nascendo do chão no fim da
// tela. Desenhadas no mesmo traço das tochas da arte do fundo (assets/tela-inicial.webp), com as
// cores tiradas dela: um poste grosso de madeira avermelhada com contorno escuro, a luz do fogo
// batendo de lado e de cima, um colar largo no alto com as pontas segurando o fogo, e o pé
// enterrado no mato. O fogo é uma gota que balança — o miolo quase branco, amarelo, laranja na
// borda — com línguas que se soltam em cima (um ruído que sobe), e as fagulhas sobem dele. Atrás,
// o brilho quente e macio que tremula com o fogo (o elemento `luz`, no CSS).

import { contexto2d } from '../motor/imagens';
import { elemento } from './dom';

// O canvas da tocha, em pixels da arte (o mesmo tamanho de pixel do fundo): em cima, o espaço do
// fogo e das fagulhas; depois o colar, o poste e o mato no chão.
const LARGURA = 30;
const ALTURA = 150;
const FOGO = { x: 3, y: 4, w: 24, h: 56 }; // a área do fogo (o fundo dela fica atrás do colar)
const MEIO = 15; // o meio do poste e do fogo
const COLAR = { x: 7, y: 54, w: 16, h: 8 };
const POSTE = { x: 10, w: 10, y: 62 };

// As cores da arte do fundo.
const CONTORNO = '#1c0602';
const MADEIRA = {
  sombra: '#4f1b00',
  funda: '#6f210b',
  meio: '#873a0d',
  quente: '#a64600',
  clara: '#c4601a',
  luz: '#e87e25', // a borda que o fogo ilumina
};
const MATO = ['#0c1e06', '#1a3a0c', '#2c5a12', '#467e1a', '#6aa42a'];

// O fogo, do frio ao quente (com a opacidade de cada um).
const CORES_DO_FOGO: [number, number, number, number][] = [
  [178, 52, 4, 140],
  [209, 100, 0, 220],
  [249, 141, 18, 255],
  [254, 182, 33, 255],
  [255, 225, 90, 255],
  [255, 245, 170, 255],
  [252, 255, 222, 255],
];
const PASSO_DO_FOGO = 1 / 24; // segundos entre um desenho do fogo e outro

interface Fagulha {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number; // segundos que ainda tem
  total: number;
}

export interface Tocha {
  el: HTMLElement;
  // Um quadro: `dt` em segundos. `acesa`: de 0 (apagada) a 1 (o fogo inteiro), para acender aos
  // poucos depois de a tocha subir.
  quadro(dt: number, acesa: number): void;
}

// Um número de 0 a 1 que é sempre o mesmo para o mesmo (x, y): a textura da madeira e do mato.
function sorteio(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Ruído macio (interpolado entre os sorteios da grade): as línguas do fogo.
function ruido(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = sorteio(x0, y0);
  const b = sorteio(x0 + 1, y0);
  const c = sorteio(x0, y0 + 1);
  const d = sorteio(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cor: string): void {
  ctx.fillStyle = cor;
  ctx.fillRect(x, y, w, h);
}

// O poste e o mato do pé (por trás do fogo). `lado`: de que lado bate a luz forte (o de dentro,
// virado para a caixa), para as duas tochas ficarem espelhadas.
function pintarPoste(ctx: CanvasRenderingContext2D, lado: 'esquerda' | 'direita'): void {
  const { x, w, y } = POSTE;
  // As colunas do poste, da borda de luz à borda de sombra (antes de espelhar).
  const colunas = [
    MADEIRA.sombra,
    MADEIRA.sombra,
    MADEIRA.funda,
    MADEIRA.meio,
    MADEIRA.meio,
    MADEIRA.funda,
    MADEIRA.funda,
    MADEIRA.quente,
  ];
  for (let i = 0; i < colunas.length; i++) {
    const coluna = lado === 'esquerda' ? colunas[i] : colunas[colunas.length - 1 - i];
    pixel(ctx, x + 1 + i, y, 1, ALTURA - y, coluna);
  }
  // A borda iluminada pelo fogo (forte em cima, sumindo para baixo), do lado de dentro.
  const borda = lado === 'esquerda' ? x + w - 2 : x + 1;
  for (let yy = y; yy < ALTURA; yy++) {
    const t = (yy - y) / 50;
    if (sorteio(borda, yy) > t) pixel(ctx, borda, yy, 1, 1, MADEIRA.luz);
  }
  // A textura: veios curtos e manchas, como na arte.
  for (let yy = y + 2; yy < ALTURA; yy++) {
    for (let xx = x + 2; xx < x + w - 2; xx++) {
      const s = sorteio(xx, yy);
      if (s < 0.07) pixel(ctx, xx, yy, 1, 2, MADEIRA.funda);
      else if (s > 0.96) pixel(ctx, xx, yy, 1, 1, MADEIRA.clara);
    }
  }
  // Um nó na madeira.
  pixel(ctx, x + 4, y + 34, 3, 4, MADEIRA.sombra);
  pixel(ctx, x + 5, y + 35, 1, 2, MADEIRA.funda);
  pixel(ctx, x + 4, y + 34, 1, 1, MADEIRA.meio);
  // A sombra do colar no topo do poste.
  pixel(ctx, x + 1, y, w - 2, 2, MADEIRA.sombra);
  pixel(ctx, x + 1, y + 2, w - 2, 1, MADEIRA.funda);
  // O contorno.
  pixel(ctx, x, y, 1, ALTURA - y, CONTORNO);
  pixel(ctx, x + w - 1, y, 1, ALTURA - y, CONTORNO);

  // O mato do pé: folhas finas subindo do chão, mais densas embaixo.
  for (let xx = 0; xx < LARGURA; xx++) {
    const altura = 4 + Math.floor(sorteio(xx, 7) * 9) + (Math.abs(xx - MEIO) < 8 ? 3 : 0);
    for (let k = 0; k < altura; k++) {
      const yy = ALTURA - 1 - k;
      const cor = MATO[Math.min(MATO.length - 1, Math.floor(((altura - k) / altura) * 2.2 + sorteio(xx, yy) * 2.2))];
      pixel(ctx, xx, yy, 1, 1, cor);
    }
    pixel(ctx, xx, ALTURA - altura - 1, 1, 1, MATO[1]);
  }
  // Algumas folhas mais altas, encostando no poste.
  for (const [fx, fh] of [
    [x - 2, 14],
    [x + w + 1, 17],
    [x + 1, 9],
    [x + w - 3, 11],
  ]) {
    for (let k = 0; k < fh; k++) {
      const xx = fx + Math.round(Math.sin(k * 0.35) * (k / fh) * 2);
      pixel(ctx, xx, ALTURA - 1 - k, 1, 1, k > fh - 3 ? MATO[3] : k > fh * 0.5 ? MATO[2] : MATO[1]);
    }
  }
}

// O colar do alto e as pontas que seguram o fogo (pintados por cima do pé do fogo).
function pintarColar(ctx: CanvasRenderingContext2D, lado: 'esquerda' | 'direita'): void {
  const { x, y, w, h } = COLAR;
  const dentro = lado === 'esquerda' ? 1 : -1; // para que lado fica a caixa
  // As pontas: quatro dentes de madeira em volta do fogo.
  for (const px0 of [x + 1, x + 5, x + w - 7, x + w - 3]) {
    pixel(ctx, px0 - 1, y - 4, 4, 5, CONTORNO);
    pixel(ctx, px0, y - 3, 2, 4, MADEIRA.meio);
    pixel(ctx, px0 + (dentro > 0 ? 1 : 0), y - 3, 1, 4, MADEIRA.luz);
  }
  // O corpo do colar.
  pixel(ctx, x, y, w, h, CONTORNO);
  pixel(ctx, x + 1, y + 1, w - 2, h - 2, MADEIRA.meio);
  pixel(ctx, x + 1, y + 1, w - 2, 1, MADEIRA.luz); // o topo, aceso pelo fogo
  pixel(ctx, x + 1, y + 2, w - 2, 1, MADEIRA.clara);
  pixel(ctx, x + 1, y + h - 2, w - 2, 1, MADEIRA.sombra);
  pixel(ctx, lado === 'esquerda' ? x + w - 2 : x + 1, y + 2, 1, h - 4, MADEIRA.luz);
  pixel(ctx, lado === 'esquerda' ? x + 1 : x + w - 2, y + 2, 1, h - 4, MADEIRA.funda);
  // A faixa do meio do colar e os pregos.
  pixel(ctx, x + 1, y + 4, w - 2, 1, MADEIRA.funda);
  for (const px0 of [x + 3, x + w - 4]) pixel(ctx, px0, y + 3, 1, 1, '#2a120a');
}

export function criarTocha(lado: 'esquerda' | 'direita'): Tocha {
  const el = elemento('div', `inicio-tocha inicio-tocha-${lado}`);
  el.setAttribute('aria-hidden', 'true');
  const luz = elemento('div', 'inicio-tocha-luz');
  const canvas = elemento('canvas', 'inicio-tocha-arte');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  el.append(luz, canvas);
  const ctx = contexto2d(canvas);

  // O poste e o colar, pintados uma vez só em canvas à parte e copiados a cada quadro.
  const poste = elemento('canvas', '');
  poste.width = LARGURA;
  poste.height = ALTURA;
  pintarPoste(contexto2d(poste), lado);
  const colar = elemento('canvas', '');
  colar.width = LARGURA;
  colar.height = ALTURA;
  pintarColar(contexto2d(colar), lado);

  // O fogo: a imagem dele, redesenhada a cada PASSO_DO_FOGO.
  const fogo = elemento('canvas', '');
  fogo.width = FOGO.w;
  fogo.height = FOGO.h;
  const fogoCtx = contexto2d(fogo);
  const pixels = fogoCtx.createImageData(FOGO.w, FOGO.h);
  const fagulhas: Fagulha[] = [];
  let acumulado = 0;
  let tempo = lado === 'esquerda' ? 0 : 7.3; // as duas não mexem iguais
  let vento = 0;
  let brilho = 1;

  const desenharFogo = (acesa: number): void => {
    vento = Math.sin(tempo * 0.7) * 0.6 + Math.sin(tempo * 1.9) * 0.4;
    brilho = 0.9 + Math.sin(tempo * 11) * 0.05 + ruido(tempo * 6, 3) * 0.1;
    const altura = 34 * (0.55 + 0.45 * acesa) * (0.94 + ruido(tempo * 3, 9) * 0.12);
    const base = FOGO.h - 4; // a linha de onde o fogo nasce (dentro do colar)
    const meio = MEIO - FOGO.x - 0.5;
    for (let y = 0; y < FOGO.h; y++) {
      // t: 0 no pé do fogo, 1 na ponta.
      const t = (base - y) / altura;
      for (let x = 0; x < FOGO.w; x++) {
        const i = (y * FOGO.w + x) * 4;
        pixels.data[i + 3] = 0;
        if (t < -0.1 || t > 1.15 || acesa <= 0) continue;
        const tt = Math.max(0, t);
        // A gota: larga e redonda embaixo, afinando em ponta, balançando mais em cima.
        const balanco = (Math.sin(tempo * 3.4 - tt * 3) * 1.4 + vento * 1.8) * tt * tt;
        const largura = 9.5 * Math.pow(1 - Math.min(tt, 1), 0.8) * Math.sqrt(Math.min(1, tt * 3 + 0.45)) + 0.4;
        const d = Math.abs(x - meio - balanco) / largura;
        // As línguas: um ruído que sobe arranca pedaços da borda e da ponta.
        const n = ruido(x * 0.45, y * 0.32 + tempo * 7.5);
        const calor = (1 - d) * 1.5 - tt * 0.6 + (n - 0.5) * 0.7 + (t < 0 ? t * 4 : 0);
        if (calor <= 0.05) continue;
        const c = CORES_DO_FOGO[Math.min(CORES_DO_FOGO.length - 1, Math.floor(calor * 0.95 * CORES_DO_FOGO.length))];
        pixels.data[i] = c[0];
        pixels.data[i + 1] = c[1];
        pixels.data[i + 2] = c[2];
        pixels.data[i + 3] = c[3];
      }
    }
    fogoCtx.putImageData(pixels, 0, 0);
  };

  const soltarFagulha = (): void => {
    const total = 0.9 + Math.random() * 1.1;
    fagulhas.push({
      x: MEIO + (Math.random() - 0.5) * 6,
      y: FOGO.y + FOGO.h - 34,
      vx: (Math.random() - 0.5) * 6 + vento * 4,
      vy: -(16 + Math.random() * 18),
      vida: total,
      total,
    });
  };

  return {
    el,
    quadro(dt, acesa) {
      tempo += dt;
      acumulado += dt;
      if (acumulado >= PASSO_DO_FOGO) {
        acumulado %= PASSO_DO_FOGO;
        desenharFogo(acesa);
      }
      if (Math.random() < dt * 5 * acesa) soltarFagulha();
      // As fagulhas sobem, rodopiam com o vento e apagam.
      for (const f of fagulhas) {
        f.vida -= dt;
        f.x += (f.vx + Math.sin(f.vida * 7) * 5) * dt;
        f.y += f.vy * dt;
        f.vy *= 1 - 0.4 * dt;
      }
      for (let i = fagulhas.length - 1; i >= 0; i--) if (fagulhas[i].vida <= 0 || fagulhas[i].y < 0) fagulhas.splice(i, 1);

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, LARGURA, ALTURA);
      ctx.drawImage(poste, 0, 0);
      // A luz do fogo esquenta o alto do poste (só onde há madeira) e tremula com ele.
      ctx.globalCompositeOperation = 'source-atop';
      const quente = ctx.createLinearGradient(0, POSTE.y, 0, POSTE.y + 46);
      quente.addColorStop(0, `rgba(255, 150, 50, ${(0.14 * acesa * brilho).toFixed(3)})`);
      quente.addColorStop(1, 'rgba(255, 150, 50, 0)');
      ctx.fillStyle = quente;
      ctx.fillRect(0, POSTE.y, LARGURA, 46);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(fogo, FOGO.x, FOGO.y);
      ctx.drawImage(colar, 0, 0);
      for (const f of fagulhas) {
        const t = f.vida / f.total;
        ctx.globalAlpha = Math.min(1, t * 1.8);
        ctx.fillStyle = t > 0.55 ? '#fff6b0' : t > 0.25 ? '#ffc23a' : '#f08a1e';
        ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
      }
      ctx.globalAlpha = 1;
      luz.style.opacity = String((brilho * acesa).toFixed(3));
    },
  };
}
