// As duas tochas da tela da conta: grandes, uma de cada lado da caixa, nascendo do chão no fim da
// tela. Tudo em pixel, no canvas: o cabo de madeira com as voltas de corda, o cesto de ferro e,
// em cima, o fogo — um fogo de células (cada linha herda a de baixo, esfriando um pouco e
// escorregando de lado com o vento), então as chamas sobem e se desmancham sozinhas — e as
// faíscas que soltam do topo e sobem rodopiando até apagar. Atrás, um brilho quente que tremula
// com o fogo (o elemento `luz`, no CSS).

import { contexto2d } from '../motor/imagens';
import { elemento } from './dom';

// O canvas da tocha, em pixels da arte: em cima, o espaço das faíscas; depois o fogo, o cesto e
// o cabo até o chão.
const LARGURA = 34;
const ALTURA = 156;
const FOGO = { x: 5, y: 26, w: 24, h: 40 }; // a grade do fogo
const CESTO_Y = 60;
const CABO = { x: 14, w: 6, y: 72 };

// Do frio ao quente: o fogo vai do vermelho escuro, pelo laranja e o amarelo, ao branco.
const PALETA: [number, number, number][] = [
  [0, 0, 0],
  [60, 10, 6],
  [96, 18, 8],
  [140, 30, 10],
  [180, 46, 12],
  [214, 70, 14],
  [236, 100, 20],
  [248, 132, 28],
  [252, 162, 40],
  [255, 190, 60],
  [255, 214, 92],
  [255, 234, 140],
  [255, 246, 200],
  [255, 255, 236],
];
const QUENTE = PALETA.length - 1;
const PASSO_DO_FOGO = 1 / 30; // segundos entre um passo do fogo e outro

interface Faisca {
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

// O cabo, o cesto e as cordas: pintados uma vez só (não mexem).
function pintarCorpo(ctx: CanvasRenderingContext2D): void {
  const px = (x: number, y: number, w: number, h: number, cor: string): void => {
    ctx.fillStyle = cor;
    ctx.fillRect(x, y, w, h);
  };
  // O cabo de madeira, com a luz do fogo do lado de dentro e os veios.
  px(CABO.x, CABO.y, CABO.w, ALTURA - CABO.y, '#5a3a1c');
  px(CABO.x, CABO.y, 1, ALTURA - CABO.y, '#2e1c0c');
  px(CABO.x + CABO.w - 1, CABO.y, 1, ALTURA - CABO.y, '#2e1c0c');
  px(CABO.x + 1, CABO.y, 1, ALTURA - CABO.y, '#8a5a2c');
  for (let y = CABO.y + 6; y < ALTURA; y += 9) px(CABO.x + 3, y, 1, 4, '#3e2610');
  // As voltas de corda, perto do cesto e no meio do cabo.
  for (const y0 of [CABO.y + 2, CABO.y + 38]) {
    for (let k = 0; k < 3; k++) {
      px(CABO.x - 1, y0 + k * 3, CABO.w + 2, 2, '#c9a55a');
      px(CABO.x - 1, y0 + k * 3 + 1, CABO.w + 2, 1, '#8a6a30');
    }
  }
  // O cesto de ferro: a boca larga, as barras e o fundo estreitando até o cabo.
  const ferro = '#3a3a44';
  const ferroClaro = '#6e6e7c';
  const ferroBrilho = '#a8a8b8';
  px(4, CESTO_Y, LARGURA - 8, 3, ferro);
  px(4, CESTO_Y, LARGURA - 8, 1, ferroBrilho);
  for (let i = 0; i < 4; i++) {
    const largura = LARGURA - 10 - i * 4;
    const x = (LARGURA - largura) / 2;
    px(x, CESTO_Y + 3 + i * 2, largura, 2, i % 2 ? ferro : '#2a2a32');
    px(x, CESTO_Y + 3 + i * 2, 1, 2, ferroClaro);
  }
  for (const x of [8, 13, 20, 25]) px(x, CESTO_Y - 4, 1, 7, ferroClaro);
  // A brasa entre as barras.
  px(9, CESTO_Y - 1, LARGURA - 18, 1, '#ff8a2a');
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

  // O corpo, pintado num canvas à parte e copiado a cada quadro por baixo do fogo.
  const corpo = elemento('canvas', '');
  corpo.width = LARGURA;
  corpo.height = ALTURA;
  pintarCorpo(contexto2d(corpo));

  // O fogo: a grade de calor e a imagem dela.
  const calor = new Uint8Array(FOGO.w * FOGO.h);
  const fogo = elemento('canvas', '');
  fogo.width = FOGO.w;
  fogo.height = FOGO.h;
  const fogoCtx = contexto2d(fogo);
  const pixels = fogoCtx.createImageData(FOGO.w, FOGO.h);
  const faiscas: Faisca[] = [];
  let acumulado = 0;
  let vento = 0;
  let semente = lado === 'esquerda' ? 0.3 : 0.8; // as duas não mexem iguais

  const passoDoFogo = (acesa: number): void => {
    // O vento muda devagar e empurra as chamas para um lado ou para o outro.
    semente += 0.07;
    vento = Math.sin(semente) * 0.5 + Math.sin(semente * 2.3) * 0.3;
    const meio = (FOGO.w - 1) / 2;
    // A linha de baixo é a brasa: quente no meio do cesto, menos nas bordas.
    for (let x = 0; x < FOGO.w; x++) {
      const borda = Math.abs(x - meio) / meio;
      const forca = borda > 0.78 ? 0 : (1 - borda * 0.55) * acesa;
      calor[(FOGO.h - 1) * FOGO.w + x] = Math.round(QUENTE * forca * (0.82 + Math.random() * 0.18));
    }
    // Cada célula herda a de baixo, um pouco mais fria, escorregando de lado.
    for (let y = 0; y < FOGO.h - 1; y++) {
      for (let x = 0; x < FOGO.w; x++) {
        const deBaixo = calor[(y + 1) * FOGO.w + x];
        const esfria = Math.random() < 0.42 ? 1 : 0;
        // Mais alto e mais longe do meio, esfria mais: a chama afina em ponta.
        const ponta = Math.abs(x - meio) / meio > 0.55 && Math.random() < 0.35 ? 1 : 0;
        const desvio = Math.round((Math.random() - 0.5) * 2 + vento * Math.random());
        const destino = Math.min(FOGO.w - 1, Math.max(0, x + desvio));
        calor[y * FOGO.w + destino] = Math.max(0, deBaixo - esfria - ponta);
      }
    }
    // A imagem: frio é transparente; o calor pinta pela paleta.
    for (let i = 0; i < calor.length; i++) {
      const c = calor[i];
      const [r, g, b] = PALETA[c];
      pixels.data[i * 4] = r;
      pixels.data[i * 4 + 1] = g;
      pixels.data[i * 4 + 2] = b;
      pixels.data[i * 4 + 3] = c === 0 ? 0 : c < 3 ? 150 : 255;
    }
    fogoCtx.putImageData(pixels, 0, 0);
  };

  const soltarFaisca = (): void => {
    const total = 0.7 + Math.random() * 0.9;
    faiscas.push({
      x: FOGO.x + FOGO.w / 2 + (Math.random() - 0.5) * 10,
      y: FOGO.y + FOGO.h * 0.45,
      vx: (Math.random() - 0.5) * 8 + vento * 6,
      vy: -(22 + Math.random() * 26),
      vida: total,
      total,
    });
  };

  return {
    el,
    quadro(dt, acesa) {
      acumulado += dt;
      while (acumulado >= PASSO_DO_FOGO) {
        acumulado -= PASSO_DO_FOGO;
        passoDoFogo(acesa);
        if (Math.random() < 0.28 * acesa) soltarFaisca();
      }
      // As faíscas sobem, rodopiam com o vento e apagam.
      for (const f of faiscas) {
        f.vida -= dt;
        f.x += (f.vx + Math.sin(f.vida * 9) * 6) * dt;
        f.y += f.vy * dt;
        f.vy *= 1 - 0.6 * dt;
      }
      for (let i = faiscas.length - 1; i >= 0; i--) if (faiscas[i].vida <= 0 || faiscas[i].y < 0) faiscas.splice(i, 1);

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, LARGURA, ALTURA);
      ctx.drawImage(corpo, 0, 0);
      ctx.drawImage(fogo, FOGO.x, FOGO.y);
      for (const f of faiscas) {
        const t = f.vida / f.total;
        ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.fillStyle = t > 0.6 ? '#fff4c2' : t > 0.3 ? '#ffb43c' : '#e8602a';
        ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
      }
      ctx.globalAlpha = 1;
      // O brilho de trás tremula com o fogo.
      const tremor = 0.82 + Math.sin(semente * 3.1) * 0.08 + Math.random() * 0.1;
      luz.style.opacity = String((tremor * acesa).toFixed(3));
    },
  };
}
