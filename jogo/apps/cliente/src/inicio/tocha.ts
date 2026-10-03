// As duas tochas da tela da conta: grandes, uma de cada lado da caixa, nascendo do chão no fim da
// tela. Desenhadas no traço das tochas da arte do fundo (assets/tela-inicial.webp), com as cores
// tiradas dela e o mesmo tamanho de pixel:
// - o poste é um cilindro de madeira avermelhada: sombreado macio de um lado ao outro, a luz do
//   pôr do sol batendo pela direita (como em tudo na arte), poucas manchas de veio;
// - no alto, um colar redondo um pouco mais largo, com o tampo aceso pelo fogo;
// - o fogo é pequeno e muito claro — miolo quase branco, amarelo, laranja só na borda — com um
//   brilho grande e macio em volta (uma cópia borrada do fogo, somando luz) e fagulhas subindo;
// - o pé some numa moita de folhas redondas, nos verdes da vegetação da frente da arte.
// O canvas é desenhado em pixels e o CSS amacia de leve as bordas, como a arte (que também é
// macia no limite de cada pixel).

import { contexto2d } from '../motor/imagens';
import { elemento } from './dom';

// O canvas da tocha, em pixels da arte: em cima, o espaço do fogo e das fagulhas; depois o colar,
// o poste e a moita no chão.
const LARGURA = 30;
const ALTURA = 150;
const MEIO = 15; // o meio do poste e do fogo
const COLAR = { x: 8, y: 56, w: 14, h: 8 };
const POSTE = { x: 10, w: 10, y: 64 };
const FOGO = { x: 3, y: 10, w: 24, h: 50 }; // a área do fogo; o pé dele pousa no tampo do colar
const ALTURA_DO_FOGO = 26;

// O cilindro de madeira, da beirada de sombra (esquerda) à beirada de luz (direita): as cores das
// tochas e da cerca da arte.
const CILINDRO = ['#3e1a04', '#4f1600', '#62230a', '#7a2f12', '#8f3814', '#9b3b10', '#a83c0b', '#c14d0b'];
const CONTORNO = '#240a02';
const VEIO = '#5b1e06';
// Os verdes da vegetação da frente da arte, do fundo da moita à ponta da folha.
const FOLHAS = ['#0b2402', '#163310', '#264a10', '#3a6a0c', '#5a8a1a', '#8ab83a'];

// O fogo, do frio ao quente (com a opacidade de cada um).
const CORES_DO_FOGO: [number, number, number, number][] = [
  [238, 107, 21, 200],
  [255, 165, 50, 255],
  [255, 218, 37, 255],
  [254, 228, 68, 255],
  [255, 251, 146, 255],
  [253, 255, 186, 255],
  [254, 254, 224, 255],
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
  // O corpo (vai por baixo do véu escuro da tela, como a arte do fundo) e o fogo com o brilho (por
  // cima do véu: é luz). Os dois têm o mesmo tamanho e lugar.
  el: HTMLElement;
  fogo: HTMLElement;
  // Um quadro: `dt` em segundos. `acesa`: de 0 (apagada) a 1 (o fogo inteiro), para acender aos
  // poucos depois de a tocha subir.
  quadro(dt: number, acesa: number): void;
}

// Um número de 0 a 1 que é sempre o mesmo para o mesmo (x, y): os veios e a moita.
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

// Uma faixa de cilindro: `w` colunas com o sombreado do CILINDRO, `clarear` passos mais claro.
function cilindro(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, clarear = 0): void {
  for (let i = 0; i < w; i++) {
    const k = Math.min(CILINDRO.length - 1, Math.round((i / (w - 1)) * (CILINDRO.length - 1)) + clarear);
    pixel(ctx, x + i, y, 1, h, CILINDRO[Math.max(0, k)]);
  }
}

// O poste e o colar (o fogo vem por cima do tampo do colar).
function pintarCorpo(ctx: CanvasRenderingContext2D): void {
  const { x, w, y } = POSTE;
  // O poste: contorno e o cilindro por dentro.
  pixel(ctx, x, y, w, ALTURA - y, CONTORNO);
  cilindro(ctx, x + 1, y, w - 2, ALTURA - y);
  // Os veios: poucas manchas curtas, um tom mais escuro (como os nós da cerca da arte).
  for (let yy = y + 4; yy < ALTURA - 6; yy++) {
    if (sorteio(3, yy) < 0.1) {
      const xx = x + 2 + Math.floor(sorteio(yy, 5) * (w - 5));
      pixel(ctx, xx, yy, 1 + Math.round(sorteio(yy, 9)), 1, VEIO);
    }
  }
  // A sombra do colar no topo do poste.
  pixel(ctx, x + 1, y, w - 2, 1, '#2e0e02');
  pixel(ctx, x + 1, y + 1, w - 2, 1, CILINDRO[1]);

  // O colar: um cilindro mais largo, mais claro (perto do fogo), com o tampo redondo.
  const c = COLAR;
  pixel(ctx, c.x + 1, c.y, c.w - 2, c.h, CONTORNO);
  pixel(ctx, c.x, c.y + 1, c.w, c.h - 2, CONTORNO);
  cilindro(ctx, c.x + 1, c.y + 2, c.w - 2, c.h - 3, 1);
  // O tampo: a boca de onde sai o fogo, acesa por ele.
  pixel(ctx, c.x + 2, c.y + 1, c.w - 4, 1, '#d8661a');
  pixel(ctx, c.x + 1, c.y + 2, c.w - 2, 1, '#e87e25');
  pixel(ctx, c.x + 3, c.y + 2, c.w - 6, 1, '#ffb040');
  // A base do colar, na sombra.
  pixel(ctx, c.x + 1, c.y + c.h - 2, c.w - 2, 1, CILINDRO[1]);
}

// A moita do pé: folhas redondas empilhadas, as de trás mais escuras, as da frente com a ponta
// clara, como as da vegetação da frente da arte.
function pintarMoita(ctx: CanvasRenderingContext2D, lado: 'esquerda' | 'direita'): void {
  const folha = (fx: number, fy: number, tom: number): void => {
    // Uma folha de 4×3 com os cantos de cima comidos e a luz no alto à direita.
    const base = FOLHAS[Math.max(0, Math.min(FOLHAS.length - 1, tom))];
    const clara = FOLHAS[Math.max(0, Math.min(FOLHAS.length - 1, tom + 1))];
    const escura = FOLHAS[Math.max(0, tom - 1)];
    pixel(ctx, fx + 1, fy, 2, 1, base);
    pixel(ctx, fx, fy + 1, 4, 1, base);
    pixel(ctx, fx, fy + 2, 4, 1, escura);
    pixel(ctx, fx + 2, fy, 1, 1, clara);
    pixel(ctx, fx + 2, fy + 1, 2, 1, clara);
  };
  const semente = lado === 'esquerda' ? 1 : 2;
  // Três camadas: o fundo (escuro, mais alto), o meio e a frente (clara, baixa).
  const camadas = [
    { n: 14, alto: 16, tom: 1 },
    { n: 16, alto: 11, tom: 2 },
    { n: 14, alto: 6, tom: 3 },
  ];
  camadas.forEach((camada, k) => {
    for (let i = 0; i < camada.n; i++) {
      const s1 = sorteio(i * 3 + k, semente);
      const s2 = sorteio(i * 7 + k, semente + 4);
      const fx = Math.round(1 + s1 * (LARGURA - 6));
      // Mais alto perto do poste: a moita abraça o pé dele.
      const perto = 1 - Math.min(1, Math.abs(fx + 2 - MEIO) / 13);
      const fy = ALTURA - 3 - Math.round(s2 * camada.alto * (0.4 + perto * 0.6));
      folha(fx, fy, camada.tom + (s2 > 0.7 ? 1 : 0));
    }
  });
  // O chão escuro no fim, sob a moita.
  pixel(ctx, 0, ALTURA - 2, LARGURA, 2, FOLHAS[0]);
}

export function criarTocha(lado: 'esquerda' | 'direita'): Tocha {
  const el = elemento('div', `inicio-tocha inicio-tocha-${lado}`);
  el.setAttribute('aria-hidden', 'true');
  const canvas = elemento('canvas', 'inicio-tocha-arte');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  el.append(canvas);
  const ctx = contexto2d(canvas);
  // O fogo, numa camada à parte do mesmo tamanho: o halo, a chama com as fagulhas e o brilho (o
  // mesmo fogo, borrado pelo CSS e somando luz).
  const camadaDoFogo = elemento('div', `inicio-tocha inicio-tocha-fogo inicio-tocha-${lado}`);
  camadaDoFogo.setAttribute('aria-hidden', 'true');
  const luz = elemento('div', 'inicio-tocha-luz');
  const chama = elemento('canvas', 'inicio-tocha-chama');
  chama.width = LARGURA;
  chama.height = ALTURA;
  const brilho = elemento('canvas', 'inicio-tocha-brilho');
  brilho.width = LARGURA;
  brilho.height = ALTURA;
  camadaDoFogo.append(luz, chama, brilho);
  const chamaCtx = contexto2d(chama);
  const brilhoCtx = contexto2d(brilho);

  // O corpo e a moita, pintados uma vez só em canvas à parte e copiados a cada quadro.
  const corpo = elemento('canvas', '');
  corpo.width = LARGURA;
  corpo.height = ALTURA;
  pintarCorpo(contexto2d(corpo));
  const moita = elemento('canvas', '');
  moita.width = LARGURA;
  moita.height = ALTURA;
  pintarMoita(contexto2d(moita), lado);

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
  let forca = 1;

  const desenharFogo = (acesa: number): void => {
    vento = Math.sin(tempo * 0.7) * 0.6 + Math.sin(tempo * 1.9) * 0.4;
    forca = 0.9 + Math.sin(tempo * 11) * 0.05 + ruido(tempo * 6, 3) * 0.1;
    const altura = ALTURA_DO_FOGO * (0.5 + 0.5 * acesa) * (0.92 + ruido(tempo * 3, 9) * 0.16);
    const base = COLAR.y + 2 - FOGO.y; // o pé do fogo, no tampo do colar
    const meio = MEIO - FOGO.x - 0.5;
    for (let y = 0; y < FOGO.h; y++) {
      // t: 0 no pé do fogo, 1 na ponta.
      const t = (base - y) / altura;
      for (let x = 0; x < FOGO.w; x++) {
        const i = (y * FOGO.w + x) * 4;
        pixels.data[i + 3] = 0;
        if (t < 0 || t > 1.2 || acesa <= 0) continue;
        // A gota: larga e redonda embaixo, afinando em ponta, balançando mais em cima.
        const balanco = (Math.sin(tempo * 3.4 - t * 3) * 1.2 + vento * 1.5) * t * t;
        const largura = 6 * Math.pow(1 - Math.min(t, 1), 0.7) * Math.sqrt(Math.min(1, t * 2.5 + 0.55)) + 0.4;
        const d = Math.abs(x - meio - balanco) / largura;
        // As línguas: um ruído que sobe arranca pedaços da borda e da ponta.
        const n = ruido(x * 0.5, y * 0.35 + tempo * 7.5);
        const calor = (1 - d) * 1.6 - t * 0.55 + (n - 0.5) * 0.6;
        if (calor <= 0.08) continue;
        const c = CORES_DO_FOGO[Math.min(CORES_DO_FOGO.length - 1, Math.floor(calor * CORES_DO_FOGO.length))];
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
      x: MEIO + (Math.random() - 0.5) * 5,
      y: COLAR.y - ALTURA_DO_FOGO * 0.6,
      vx: (Math.random() - 0.5) * 6 + vento * 4,
      vy: -(14 + Math.random() * 16),
      vida: total,
      total,
    });
  };

  return {
    el,
    fogo: camadaDoFogo,
    quadro(dt, acesa) {
      tempo += dt;
      acumulado += dt;
      if (acumulado >= PASSO_DO_FOGO) {
        acumulado %= PASSO_DO_FOGO;
        desenharFogo(acesa);
      }
      if (Math.random() < dt * 4 * acesa) soltarFagulha();
      // As fagulhas sobem, rodopiam com o vento e apagam.
      for (const f of fagulhas) {
        f.vida -= dt;
        f.x += (f.vx + Math.sin(f.vida * 7) * 5) * dt;
        f.y += f.vy * dt;
        f.vy *= 1 - 0.4 * dt;
      }
      for (let i = fagulhas.length - 1; i >= 0; i--) if (fagulhas[i].vida <= 0 || fagulhas[i].y < 0) fagulhas.splice(i, 1);

      ctx.clearRect(0, 0, LARGURA, ALTURA);
      ctx.drawImage(corpo, 0, 0);
      // A luz do fogo esquenta o colar e o alto do poste (só onde há madeira) e tremula com ele.
      ctx.globalCompositeOperation = 'source-atop';
      const quente = ctx.createLinearGradient(0, COLAR.y, 0, COLAR.y + 40);
      quente.addColorStop(0, `rgba(255, 170, 60, ${(0.45 * acesa * forca).toFixed(3)})`);
      quente.addColorStop(1, 'rgba(255, 150, 50, 0)');
      ctx.fillStyle = quente;
      ctx.fillRect(0, COLAR.y, LARGURA, 40);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(moita, 0, 0);

      chamaCtx.clearRect(0, 0, LARGURA, ALTURA);
      chamaCtx.drawImage(fogo, FOGO.x, FOGO.y);
      for (const f of fagulhas) {
        const t = f.vida / f.total;
        chamaCtx.globalAlpha = Math.min(1, t * 1.8);
        chamaCtx.fillStyle = t > 0.55 ? '#fff6b0' : t > 0.25 ? '#ffc23a' : '#f08a1e';
        chamaCtx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
      }
      chamaCtx.globalAlpha = 1;

      brilhoCtx.clearRect(0, 0, LARGURA, ALTURA);
      brilhoCtx.drawImage(fogo, FOGO.x, FOGO.y);
      brilho.style.opacity = String((0.85 * forca * acesa).toFixed(3));
      luz.style.opacity = String((forca * acesa).toFixed(3));
    },
  };
}
