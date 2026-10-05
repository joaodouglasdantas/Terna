// As duas tochas da tela da conta: grandes, uma de cada lado da caixa, nascendo do chão no fim da
// tela, na caverna do fundo (caverna.ts). Desenhadas no traço da arte da caverna
// (assets/tela-conta-caverna.webp), com as cores tiradas dela e o mesmo tamanho de pixel:
// - o poste é um cilindro de madeira marrom, como os postes da arte: sombreado macio de um lado
//   ao outro e poucas manchas de veio;
// - no alto, um colar redondo um pouco mais largo, com o tampo aceso pelo fogo, e fios de musgo
//   pendurados nele (como tudo na caverna);
// - o pé fica numa pedra coberta de musgo: o musgo sobe pelo poste em tufos que passam da
//   silhueta, com samambaias brotando dos lados e dois cogumelos vermelhos;
// - o fogo é pequeno e muito claro — miolo quase branco, amarelo, laranja só na borda — com um
//   brilho grande e macio em volta (uma cópia borrada do fogo, somando luz) e fagulhas subindo.
// O corpo e o fogo ficam em camadas separadas do mesmo tamanho e lugar: o corpo vai por baixo da
// escuridão da caverna e o fogo por cima (é luz).

import { contexto2d } from '../motor/imagens';
import { elemento } from './dom';

// O canvas da tocha, em pixels da arte (a caverna tem uns 170 de altura; a tocha, 90, mais da
// metade da tela): em cima, o espaço do fogo e das fagulhas; depois o colar, o poste e a pedra.
const LARGURA = 22;
const ALTURA = 90;
const MEIO = 11; // o meio do poste e do fogo
const COLAR = { x: 5, y: 33, w: 12, h: 6 };
const POSTE = { x: 7, w: 8, y: 39 };
const FOGO = { x: 1, y: 4, w: 20, h: 32 }; // a área do fogo; o pé dele pousa no tampo do colar
const ALTURA_DO_FOGO = 17;
const PEDRA_Y = 80; // onde começa a pedra do pé

// Onde fica o meio do fogo, em fração da tocha (para a luz da caverna sair dali).
export const MEIO_DO_FOGO = { x: MEIO / LARGURA, y: (COLAR.y - ALTURA_DO_FOGO * 0.4) / ALTURA };

// O cilindro de madeira, da beirada de sombra (esquerda) à beirada de luz (direita): as cores dos
// postes da arte da caverna.
const CILINDRO = ['#1b0e08', '#2f1612', '#43220d', '#57300f', '#6e4220', '#84552c', '#a57642'];
const CONTORNO = '#120804';
const VEIO = '#3a1d0c';
// O musgo, do fundo à ponta mais clara; a pedra, da sombra ao alto.
const MUSGO = ['#0a1f0a', '#1e3308', '#31460d', '#495815', '#607a31', '#8aa63c', '#a7c04a'];
const PEDRA = ['#06080c', '#11161c', '#201f27', '#2e3036', '#3b3f42'];

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
const PASSO_DO_FOGO = 1 / 24;

// A boca do colar: a borda da frente dela é curva (mais baixa no meio, como a beirada de um copo
// visto de cima) e o pé do fogo acaba logo acima dela — o fogo sai de dentro da boca em vez de
// pousar numa linha reta. A borda é pintada na madeira (por baixo da escuridão), não na camada do
// fogo: assim a luz da caverna a clareia junto com o resto do colar quando o fogo cresce.
// `curva`: quanto cada coluna da borda desce (o meio, no MEIO do fogo, desce mais), em ponta suave
// para não sobrar trecho reto.
const BOCA = { x: MEIO - 4, y: COLAR.y + 1, curva: [0, 1, 1, 2, 3, 2, 1, 1, 0] };
const FUNDO_DA_BOCA = Math.max(...BOCA.curva);
// O alto da borda na coluna `x` da tocha (fora da boca, o tampo do colar).
const altoDaBoca = (x: number): number => BOCA.y + (BOCA.curva[x - BOCA.x] ?? 0);

interface Fagulha {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number; // segundos que ainda tem
  total: number;
}

export interface Tocha {
  // O corpo (vai por baixo da escuridão da caverna) e o fogo com o brilho (por cima dela: é luz).
  // Os dois têm o mesmo tamanho e lugar.
  el: HTMLElement;
  fogo: HTMLElement;
  // Um quadro: `dt` em segundos. `acesa`: de 0 (apagada) a 1 (o fogo inteiro), para acender aos
  // poucos depois de a tocha subir.
  quadro(dt: number, acesa: number): void;
  // Quão forte o fogo está agora (tremula perto de 1; 0 apagado): a luz da caverna segue.
  forca(): number;
}

// Um número de 0 a 1 que é sempre o mesmo para o mesmo (x, y): os veios e o musgo.
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

const tomDe = (paleta: string[], k: number): string => paleta[Math.max(0, Math.min(paleta.length - 1, Math.round(k)))];

// Uma faixa de cilindro: `w` colunas com o sombreado do CILINDRO, `clarear` passos mais claro.
function cilindro(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, clarear = 0): void {
  for (let i = 0; i < w; i++) pixel(ctx, x + i, y, 1, h, tomDe(CILINDRO, (i / (w - 1)) * (CILINDRO.length - 1) + clarear));
}

// O poste e o colar (o fogo vem por cima do tampo do colar).
function pintarMadeira(ctx: CanvasRenderingContext2D): void {
  const { x, w, y } = POSTE;
  pixel(ctx, x, y, w, ALTURA - y, CONTORNO);
  cilindro(ctx, x + 1, y, w - 2, ALTURA - y);
  // Os veios: poucas manchas curtas, um tom mais escuro.
  for (let yy = y + 3; yy < ALTURA - 4; yy++) {
    if (sorteio(3, yy) < 0.12) pixel(ctx, x + 2 + Math.floor(sorteio(yy, 5) * (w - 4)), yy, 1, 1, VEIO);
  }
  // A sombra do colar no topo do poste: um tom abaixo da madeira, não preto (perto do fogo, um
  // risco preto vira furo).
  cilindro(ctx, x + 1, y, w - 2, 1, -1);

  // O colar: um cilindro mais largo, mais claro (perto do fogo), com o tampo redondo.
  const c = COLAR;
  pixel(ctx, c.x + 1, c.y, c.w - 2, c.h, CONTORNO);
  pixel(ctx, c.x, c.y + 1, c.w, c.h - 2, CONTORNO);
  cilindro(ctx, c.x + 1, c.y + 2, c.w - 2, c.h - 3, 1);
  // O tampo: a boca de onde sai o fogo, acesa por ele.
  pixel(ctx, c.x + 2, c.y + 1, c.w - 4, 1, '#c8702a');
  pixel(ctx, c.x + 3, c.y + 1, c.w - 6, 1, '#ffb040');
  cilindro(ctx, c.x + 1, c.y + c.h - 2, c.w - 2, 1);
  // Embaixo, onde o colar encosta no poste, a borda escura fica só nas pontas (a silhueta).
  cilindro(ctx, c.x + 2, c.y + c.h - 1, c.w - 4, 1, -1);
}

// A pedra do pé, coberta de musgo; o musgo subindo pelo poste e no colar; os fios pendurados; as
// samambaias e os cogumelos. `lado` só muda o sorteio (as duas tochas não ficam iguais).
//
// O musgo é uma máscara (onde há musgo) feita de ruído, sombreada como na arte: a beirada de cima
// pega luz (verde-amarelo), o miolo é verde com pintas claras (os tufos) e a beirada de baixo fica
// escura, com uma sombra na madeira logo abaixo.
function pintarMusgo(ctx: CanvasRenderingContext2D, lado: 'esquerda' | 'direita'): void {
  const s = lado === 'esquerda' ? 0 : 50;
  const { x: px, w: pw } = POSTE;
  const topoDaPedra = (x: number): number => {
    const u = (x - MEIO + 0.5) / (LARGURA / 2);
    return PEDRA_Y + 1 + u * u * 6;
  };

  // A pedra: um monte arredondado, com a luz no alto à direita e o contorno escuro.
  for (let x = 0; x < LARGURA; x++) {
    const topo = Math.round(topoDaPedra(x) + sorteio(x + s, 1) * 1.5);
    pixel(ctx, x, topo, 1, ALTURA - topo, PEDRA[0]);
    for (let y = topo + 1; y < ALTURA; y++) {
      const fundo = (y - topo) / (ALTURA - topo);
      const luz = x / LARGURA;
      pixel(ctx, x, y, 1, 1, tomDe(PEDRA, 1 + luz * 2.4 - fundo * 2 + (sorteio(x + s, y) - 0.5) * 0.9));
    }
  }

  // A máscara do musgo.
  const tem = new Uint8Array(LARGURA * ALTURA);
  const marcar = (x: number, y: number): void => {
    if (x >= 0 && x < LARGURA && y >= 0 && y < ALTURA) tem[y * LARGURA + x] = 1;
  };
  const ha = (x: number, y: number): boolean => x >= 0 && x < LARGURA && y >= 0 && y < ALTURA && tem[y * LARGURA + x] === 1;
  // No chão: cobre o alto da pedra, com a beirada de cima em calombos.
  for (let x = 0; x < LARGURA; x++) {
    const calombo = ruido(x * 0.55 + s, 3) * 3.2;
    const topo = Math.round(topoDaPedra(x) - 1.5 - calombo);
    const grosso = 3 + Math.round(ruido(x * 0.4 + s, 9) * 3);
    for (let y = topo; y < topo + grosso; y++) marcar(x, y);
  }
  // No pé do poste: o musgo do chão sobe só um pouco, passando um pixel da silhueta (mais alto,
  // os tufos que subiam pelo poste viravam bloco). O limite sobe e desce de coluna em coluna:
  // uma linha reta ali acendia como um risco. Mais acima, só o ramo fino (mais abaixo).
  for (let y = 54; y < PEDRA_Y + 2; y++) {
    const subida = Math.max(0, (PEDRA_Y - y) / (PEDRA_Y - 54)); // 0 embaixo, 1 no alto
    for (let x = px - 1; x <= px + pw; x++) {
      if (y < PEDRA_Y - 2 - Math.round(ruido(x * 1.3 + s, 5) * 5)) continue;
      const lado = (x - px) / pw; // 0 à esquerda (sombra), 1 à direita
      const n = ruido(x * 0.7 + s, y * 0.32);
      if (n > 0.12 + subida * 0.95 + lado * 0.15) marcar(x, y);
    }
  }
  // Só fica o musgo do poste que encosta no do chão (um caminho de musgo até a pedra): sem
  // quadradinho solto no meio da madeira.
  {
    const ligado = new Uint8Array(LARGURA * ALTURA);
    const fila: number[] = [];
    for (let x = 0; x < LARGURA; x++) for (let y = PEDRA_Y - 3; y < ALTURA; y++) if (ha(x, y)) fila.push(y * LARGURA + x);
    for (const i of fila) ligado[i] = 1;
    while (fila.length) {
      const i = fila.pop()!;
      const x = i % LARGURA;
      const y = (i - x) / LARGURA;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = (y + dy) * LARGURA + x + dx;
        if (ha(x + dx, y + dy) && !ligado[v]) {
          ligado[v] = 1;
          fila.push(v);
        }
      }
    }
    for (let y = 0; y < COLAR.y; y++) for (let x = 0; x < LARGURA; x++) if (!ligado[y * LARGURA + x]) tem[y * LARGURA + x] = 0;
    for (let y = COLAR.y + COLAR.h + 1; y < PEDRA_Y - 3; y++) for (let x = 0; x < LARGURA; x++) if (!ligado[y * LARGURA + x]) tem[y * LARGURA + x] = 0;
  }

  // No colar: um tapete no tampo de um lado e escorrendo pela borda.
  for (let x = COLAR.x - 1; x <= COLAR.x + COLAR.w; x++) {
    for (let y = COLAR.y; y < COLAR.y + COLAR.h + 1; y++) {
      const daqui = lado === 'esquerda' ? (x - COLAR.x) / COLAR.w : 1 - (x - COLAR.x) / COLAR.w;
      if (ruido(x * 0.8 + s, y * 0.6) > 0.35 + daqui * 0.7) marcar(x, y);
    }
  }

  // O sombreado.
  for (let y = 0; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
      if (!ha(x, y)) continue;
      const pinta = sorteio(x + s, y);
      let tom: number;
      if (!ha(x, y - 1)) tom = pinta > 0.5 ? 6 : 5; // a beirada de cima, na luz
      else if (!ha(x, y - 2)) tom = 4;
      else if (!ha(x, y + 1)) tom = y < POSTE.y + 3 ? 2 : 1; // a beirada de baixo, na sombra (no colar, perto do fogo, menos)
      else tom = pinta > 0.84 ? 4 : pinta < 0.18 ? 2 : 3; // o miolo, com pintas
      if (!ha(x - 1, y) && tom > 2) tom -= 1; // o lado esquerdo, mais escuro
      pixel(ctx, x, y, 1, 1, tomDe(MUSGO, tom));
      // A sombra do musgo na madeira logo abaixo.
      // (No colar e no alto do poste, perto do fogo, não: ali a madeira está acesa e a sombra
      // virava pontinhos pretos.)
      if (!ha(x, y + 1) && y + 1 < PEDRA_Y && y >= POSTE.y + 3 && x >= px && x < px + pw) pixel(ctx, x, y + 1, 1, 1, '#1a0d06');
    }
  }

  // O ramo que sobe pelo poste do lado da sombra: um fio de musgo grudado na beirada, com botões
  // de 2 pixels de tempos em tempos, afinando até acabar numa pontinha clara.
  const sombraEsq = lado === 'esquerda';
  const ramoX = sombraEsq ? px : px + pw - 1;
  const ramoTopo = PEDRA_Y - 23 - Math.round(sorteio(2 + s, 8) * 3);
  for (let y = PEDRA_Y - 10; y >= ramoTopo; y--) {
    const k = PEDRA_Y - 10 - y;
    pixel(ctx, ramoX, y, 1, 1, tomDe(MUSGO, y === ramoTopo ? 5 : 2 + (k % 4 === 0 ? 1 : 0)));
    if (k % 5 === 2 && y > ramoTopo + 2) {
      const dentro = sombraEsq ? 1 : -1;
      pixel(ctx, ramoX + dentro, y, 1, 1, tomDe(MUSGO, 4));
      pixel(ctx, ramoX + dentro, y + 1, 1, 1, tomDe(MUSGO, 2));
    }
  }

  // As samambaias: folhas arqueadas saindo do musgo, com folíolos dos dois lados.
  const samambaia = (x0: number, y0: number, dir: number, tamanho: number): void => {
    for (let k = 0; k < tamanho; k++) {
      const t = k / tamanho;
      const x = Math.round(x0 + dir * t * tamanho * 0.7);
      const y = Math.round(y0 - Math.sin(t * Math.PI * 0.8) * tamanho * 0.6 - t * 2);
      pixel(ctx, x, y, 1, 1, tomDe(MUSGO, 3));
      if (k > 0 && k < tamanho - 1) {
        const folio = k % 2 === 0 ? -1 : 1;
        pixel(ctx, x, y + folio, 1, 1, tomDe(MUSGO, folio < 0 ? 5 : 3));
        if (k < tamanho - 3) pixel(ctx, x - dir, y + folio * 2, 1, 1, tomDe(MUSGO, folio < 0 ? 4 : 2));
      }
      if (k === tamanho - 1) pixel(ctx, x + dir, y, 1, 1, tomDe(MUSGO, 6));
    }
  };
  samambaia(px - 1, PEDRA_Y - 1, -1, 10);
  samambaia(px - 2, PEDRA_Y + 1, -1, 6);
  samambaia(px + pw, PEDRA_Y, 1, 9);

  // Fios de musgo pendurados no colar (como os da caverna): ondulam, com a ponta clara.
  const fios = lado === 'esquerda' ? [COLAR.x, COLAR.x + 2, COLAR.x + 10] : [COLAR.x + 1, COLAR.x + 9, COLAR.x + 11];
  fios.forEach((fx, i) => {
    const comprimento = [6, 11, 4][i] + Math.round(sorteio(fx + s, 3) * 3);
    const y0 = COLAR.y + COLAR.h;
    for (let k = 0; k < comprimento; k++) {
      const x = fx + Math.round(Math.sin(k * 0.6 + i) * 0.6);
      const tom = k >= comprimento - 2 ? 5 : k % 3 === 0 ? 4 : 3;
      pixel(ctx, x, y0 + k, 1, 1, tomDe(MUSGO, tom));
      if (k % 3 === 1 && k < comprimento - 2) pixel(ctx, x + (i % 2 ? 1 : -1), y0 + k, 1, 1, tomDe(MUSGO, 2));
    }
  });

  // Cogumelos vermelhos na pedra, como os da arte: chapéu com pintas e o pé claro.
  const cogumelo = (cx: number, base: number, grande: boolean): void => {
    pixel(ctx, cx, base - 2, 1, 2, '#d8cbb8');
    if (grande) {
      pixel(ctx, cx - 1, base - 4, 3, 2, '#cd5f2c');
      pixel(ctx, cx - 1, base - 4, 3, 1, '#ed823c');
      pixel(ctx, cx - 2, base - 3, 1, 1, '#a8451c');
      pixel(ctx, cx + 2, base - 3, 1, 1, '#a8451c');
      pixel(ctx, cx, base - 4, 1, 1, '#ffd6b0');
    } else {
      pixel(ctx, cx - 1, base - 3, 2, 1, '#ed823c');
      pixel(ctx, cx, base - 3, 1, 1, '#ffd6b0');
    }
  };
  if (lado === 'esquerda') {
    cogumelo(3, Math.round(topoDaPedra(3)) - 1, true);
    cogumelo(5, Math.round(topoDaPedra(5)) - 1, false);
  } else {
    cogumelo(18, Math.round(topoDaPedra(18)) - 1, true);
  }
}

// A borda da frente da boca, na madeira: em cada coluna, do alto da curva até o corpo do colar.
// O alto é o fio que o fogo de dentro acende; abaixo, a madeira nos tons do meio para o claro.
function pintarBoca(ctx: CanvasRenderingContext2D): void {
  const n = BOCA.curva.length;
  BOCA.curva.forEach((desce, i) => {
    const x = BOCA.x + i;
    const topo = BOCA.y + desce;
    pixel(ctx, x, topo, 1, 1, desce > 0 && desce < 3 ? '#e8923a' : '#c8702a');
    for (let y = topo + 1; y <= COLAR.y + FUNDO_DA_BOCA; y++) pixel(ctx, x, y, 1, 1, tomDe(CILINDRO, 3 + (i / (n - 1)) * 3));
  });
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

  // A madeira e o musgo, pintados uma vez só em canvas à parte e copiados a cada quadro.
  const madeira = elemento('canvas', '');
  madeira.width = LARGURA;
  madeira.height = ALTURA;
  pintarMadeira(contexto2d(madeira));
  pintarBoca(contexto2d(madeira));
  const musgo = elemento('canvas', '');
  musgo.width = LARGURA;
  musgo.height = ALTURA;
  pintarMusgo(contexto2d(musgo), lado);

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
  let forca = 0;

  const desenharFogo = (acesa: number): void => {
    vento = Math.sin(tempo * 0.7) * 0.6 + Math.sin(tempo * 1.9) * 0.4;
    forca = (0.9 + Math.sin(tempo * 11) * 0.05 + ruido(tempo * 6, 3) * 0.1) * acesa;
    const altura = ALTURA_DO_FOGO * (0.5 + 0.5 * acesa) * (0.92 + ruido(tempo * 3, 9) * 0.16);
    const base = COLAR.y + 1 - FOGO.y; // o pé do fogo, no tampo do colar
    const meio = MEIO - FOGO.x - 0.5;
    for (let y = 0; y < FOGO.h; y++) {
      // t: 0 no pé do fogo, 1 na ponta.
      const t = (base - y) / altura;
      for (let x = 0; x < FOGO.w; x++) {
        const i = (y * FOGO.w + x) * 4;
        pixels.data[i + 3] = 0;
        if (t > 1.2 || acesa <= 0) continue;
        // O pé desce para dentro da boca até a borda da frente (curva) e sobe nas beiradas, com
        // línguas que mudam com o tempo: não sobra linha reta.
        const dx = Math.abs(x - meio);
        const pe = Math.min(altoDaBoca(x + FOGO.x) - 1 - FOGO.y, base + FUNDO_DA_BOCA + 0.5 - (dx / 3) ** 2 * 2 + (ruido(x * 0.9 + 3, tempo * 5) - 0.55) * 1.6);
        if (y > pe) continue;
        const tt = Math.max(0, t);
        // A gota: redonda embaixo, afinando em ponta, balançando mais em cima.
        const balanco = (Math.sin(tempo * 3.4 - tt * 3) * 0.8 + vento * 1) * tt * tt;
        const largura = 4.3 * Math.pow(1 - Math.min(tt, 1), 0.7) * Math.sqrt(Math.min(1, (tt + 0.1) / 0.3)) + 0.35;
        const d = Math.abs(x - meio - balanco) / largura;
        // As línguas: um ruído que sobe arranca pedaços da borda e da ponta.
        const n = ruido(x * 0.6, y * 0.45 + tempo * 7.5);
        const calor = (1 - d) * 1.6 - tt * 0.55 + (n - 0.5) * 0.6;
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
      x: MEIO + (Math.random() - 0.5) * 3,
      y: COLAR.y - ALTURA_DO_FOGO * 0.6,
      vx: (Math.random() - 0.5) * 4 + vento * 3,
      vy: -(9 + Math.random() * 10),
      vida: total,
      total,
    });
  };

  return {
    el,
    fogo: camadaDoFogo,
    forca: () => forca,
    quadro(dt, acesa) {
      tempo += dt;
      acumulado += dt;
      if (acumulado >= PASSO_DO_FOGO) {
        acumulado %= PASSO_DO_FOGO;
        desenharFogo(acesa);
      }
      if (Math.random() < dt * 3.5 * acesa) soltarFagulha();
      // As fagulhas sobem, rodopiam com o vento e apagam.
      for (const f of fagulhas) {
        f.vida -= dt;
        f.x += (f.vx + Math.sin(f.vida * 7) * 3) * dt;
        f.y += f.vy * dt;
        f.vy *= 1 - 0.4 * dt;
      }
      for (let i = fagulhas.length - 1; i >= 0; i--) if (fagulhas[i].vida <= 0 || fagulhas[i].y < 0) fagulhas.splice(i, 1);

      ctx.clearRect(0, 0, LARGURA, ALTURA);
      ctx.drawImage(madeira, 0, 0);
      // A luz do fogo esquenta o colar e o alto do poste (só onde há madeira) e tremula com ele.
      ctx.globalCompositeOperation = 'source-atop';
      const quente = ctx.createLinearGradient(0, COLAR.y, 0, COLAR.y + 26);
      quente.addColorStop(0, `rgba(255, 170, 60, ${(0.45 * forca).toFixed(3)})`);
      quente.addColorStop(1, 'rgba(255, 150, 50, 0)');
      ctx.fillStyle = quente;
      ctx.fillRect(0, COLAR.y, LARGURA, 26);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(musgo, 0, 0);

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
      brilho.style.opacity = String((0.85 * forca).toFixed(3));
      luz.style.opacity = String(forca.toFixed(3));
    },
  };
}
