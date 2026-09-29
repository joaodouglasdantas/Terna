// A tela do mapa (o botão Mapa da tela inicial): o mapa grande das terras de Terna, visto de cima.
// Só aparece o que já existe — por enquanto a Floresta da Divisa, com o nome dela e os personagens
// que são dela (terras.ts) —; o resto está coberto por um mar de nuvens que anda devagar, com
// tufos passando e os da beira da floresta subindo e descendo.
//
// Arrastando, o mapa desliza (e segue um pouco depois de soltar); a roda do mouse aproxima e
// afasta, em volta do ponteiro. No teclado: setas andam, + e - aproximam, C centraliza e Esc volta.
// As nuvens são pixel art feita aqui, com as cores das nuvens da borda da arte da floresta.

import { SOBRE_HEROI } from '@terna/compartilhado';
import { carregarImagem, contexto2d, novoCanvas } from '../motor/imagens';
import { esconderCena } from './cena';
import { botao, elemento, ESMAECER_MS, mostrarTela } from './dom';
import { BIOMAS, MAPA_GRANDE, RETRATO, type Bioma } from './terras';

// As cores das nuvens, do brilho em cima à sombra azulada embaixo (as da borda da arte).
const NUVEM = ['#f4f8fc', '#e4ecf4', '#d4dcec', '#c4d4e4', '#b4c4e4', '#a4b4d4'];
const FUNDO = '#ccd8ea'; // o mar de nuvens por baixo dos tufos
const PIXEL = 4; // cada pixel das nuvens vale 4 pixels da arte (o tamanho dos pixels dela)

// Quanto a floresta ocupa da altura da tela quando está centralizada, e até onde aproxima e afasta
// (em relação a isso).
const OCUPA = 0.84;
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 2.6;
const ENTRADA_MS = 1100; // a chegada: o mapa abre um pouco afastado e aproxima
const ATRITO = 4.5; // o quanto o deslize depois de soltar perde por segundo
const MAR_POR_SEGUNDO = 5; // pixels da arte que o mar de nuvens anda, para a esquerda

const semMovimento = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Sorteio com semente: as nuvens saem iguais toda vez.
function sorteador(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Um tufo de nuvem, em pixels (1 pixel = PIXEL da arte): bolhas juntas numa fileira e outras
// menores em cima. Cada pixel pega a bolha em que está mais por dentro e a cor vem da altura nela
// (luz em cima, sombra embaixo), em faixas, como na arte.
function tufo(sortear: () => number, raio: number): HTMLCanvasElement {
  const bolhas: { x: number; y: number; r: number }[] = [];
  const n = 3 + Math.floor(sortear() * 3);
  for (let i = 0; i < n; i++) {
    bolhas.push({
      x: (i - (n - 1) / 2) * raio * 0.85 + (sortear() - 0.5) * raio * 0.3,
      y: (sortear() - 0.5) * raio * 0.25,
      r: raio * (0.6 + sortear() * 0.4),
    });
  }
  const cima = 1 + Math.floor(sortear() * 3);
  for (let i = 0; i < cima; i++) {
    bolhas.push({ x: (sortear() - 0.5) * raio * n * 0.55, y: -raio * (0.4 + sortear() * 0.3), r: raio * (0.5 + sortear() * 0.35) });
  }
  const x0 = Math.floor(Math.min(...bolhas.map((b) => b.x - b.r))) - 1;
  const y0 = Math.floor(Math.min(...bolhas.map((b) => b.y - b.r))) - 1;
  const w = Math.ceil(Math.max(...bolhas.map((b) => b.x + b.r))) + 1 - x0;
  const h = Math.ceil(Math.max(...bolhas.map((b) => b.y + b.r))) + 1 - y0;
  const canvas = novoCanvas(w, h);
  const ctx = contexto2d(canvas);
  const pixels = ctx.createImageData(w, h);
  const cores = NUVEM.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
  const dentro = (px: number, py: number): { b: (typeof bolhas)[number]; fundo: number } | null => {
    let melhor: { b: (typeof bolhas)[number]; fundo: number } | null = null;
    for (const b of bolhas) {
      const fundo = b.r - Math.hypot(px - b.x, py - b.y);
      if (fundo > 0 && (!melhor || fundo > melhor.fundo)) melhor = { b, fundo };
    }
    return melhor;
  };
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = px + x0 + 0.5;
      const y = py + y0 + 0.5;
      const aqui = dentro(x, y);
      if (!aqui) continue;
      const { b } = aqui;
      const v = ((y - b.y) / b.r) * 0.85 - ((x - b.x) / b.r) * 0.25;
      // Embaixo da nuvem inteira (o pixel de baixo já é fora): a sombra mais funda.
      let cor = v < -0.5 ? 0 : v < -0.05 ? 1 : v < 0.3 ? 2 : v < 0.55 ? 3 : v < 0.78 ? 4 : 5;
      if (!dentro(x, y + 1)) cor = 5;
      else if (!dentro(x, y + 2)) cor = Math.max(cor, 4);
      const i = (py * w + px) * 4;
      [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]] = cores[cor];
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

// O mar de nuvens: um ladrilho que emenda nos quatro lados (o tufo que passa da borda volta do
// outro lado), coberto de tufos, repetido pelo mapa todo.
function marDeNuvens(sortear: () => number): HTMLCanvasElement {
  const lado = 200;
  const canvas = novoCanvas(lado, lado);
  const ctx = contexto2d(canvas);
  ctx.fillStyle = FUNDO;
  ctx.fillRect(0, 0, lado, lado);
  const tufos = Array.from({ length: 46 }, () => ({ t: tufo(sortear, 7 + sortear() * 12), x: sortear() * lado, y: sortear() * lado }));
  tufos.sort((a, b) => a.y - b.y); // os de baixo por cima, como vistos de cima e de lado
  for (const { t, x, y } of tufos) {
    for (const dx of [-lado, 0, lado]) {
      for (const dy of [-lado, 0, lado]) ctx.drawImage(t, Math.round(x - t.width / 2 + dx), Math.round(y - t.height / 2 + dy));
    }
  }
  return canvas;
}

interface TufoNoMapa {
  t: HTMLCanvasElement;
  x: number; // o centro, em pixels da arte
  y: number;
  velocidade: number; // pixels da arte por segundo, para a esquerda (0: parado, na beira)
  fase: number; // o sobe e desce
}

// Os tufos da beira de cada bioma (escondem a divisa quadrada da arte, subindo e descendo) e os que
// passam longe dele, em fileiras acima e abaixo, andando para a esquerda.
function tufosDoMapa(sortear: () => number): TufoNoMapa[] {
  const tufos: TufoNoMapa[] = [];
  for (const b of BIOMAS) {
    const x0 = b.centro.x - b.lado / 2;
    const y0 = b.centro.y - b.lado / 2;
    const passo = 105;
    for (let d = 0; d <= b.lado; d += passo) {
      for (const [x, y] of [[x0 + d, y0], [x0 + d, y0 + b.lado], [x0, y0 + d], [x0 + b.lado, y0 + d]]) {
        tufos.push({ t: tufo(sortear, 13 + sortear() * 10), x: x + (sortear() - 0.5) * 50, y: y + (sortear() - 0.5) * 50, velocidade: 0, fase: sortear() * Math.PI * 2 });
      }
    }
  }
  const floresta = BIOMAS[0];
  const alto = floresta.centro.y - floresta.lado / 2 - 160;
  const baixo = floresta.centro.y + floresta.lado / 2 + 160;
  for (let i = 0; i < 34; i++) {
    const emCima = i % 2 === 0;
    const y = emCima ? sortear() * alto : baixo + sortear() * (MAPA_GRANDE.altura - baixo);
    tufos.push({ t: tufo(sortear, 14 + sortear() * 14), x: sortear() * MAPA_GRANDE.largura, y, velocidade: 8 + sortear() * 10, fase: sortear() * Math.PI * 2 });
  }
  return tufos;
}

// As nuvens saem sempre iguais (a semente é fixa): feitas na primeira vez que o mapa abre, ficam.
let nuvens: { mar: HTMLCanvasElement; tufos: TufoNoMapa[] } | null = null;
function nuvensDoMapa(): { mar: HTMLCanvasElement; tufos: TufoNoMapa[] } {
  if (!nuvens) {
    const sortear = sorteador(1729);
    nuvens = { mar: marDeNuvens(sortear), tufos: tufosDoMapa(sortear) };
  }
  return nuvens;
}

// A placa de um bioma, presa na beira de baixo dele: o nome e os personagens que são dele.
function placaDo(b: Bioma): HTMLElement {
  const placa = elemento('div', 'inicio-mapa-placa');
  placa.append(elemento('strong', 'inicio-mapa-placa-nome', b.nome));
  const herois = elemento('ul', 'inicio-mapa-herois');
  herois.setAttribute('aria-label', `Personagens da ${b.nome}`);
  for (const heroi of b.herois) {
    const item = elemento('li', '');
    const rosto = elemento('span', 'inicio-mapa-rosto');
    const url = RETRATO[heroi];
    if (url) rosto.style.backgroundImage = `url("${url}")`;
    rosto.setAttribute('aria-hidden', 'true');
    item.append(rosto, elemento('span', '', SOBRE_HEROI[heroi].nome));
    herois.append(item);
  }
  placa.append(herois);
  return placa;
}

// Termina quando a pessoa volta para a tela inicial.
export function telaMapa(): Promise<void> {
  return new Promise((resolver) => {
    const tela = elemento('section', 'inicio-tela inicio-mapa-tela');
    const canvas = elemento('canvas', 'inicio-mapa-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Mapa das terras de Terna: ${BIOMAS.map((b) => b.nome).join(', ')}, cercada de nuvens`);
    const ctx = contexto2d(canvas);

    const topo = elemento('div', 'inicio-mapa-topo');
    const titulo = elemento('div', 'inicio-mapa-titulo');
    titulo.append(elemento('h1', 'inicio-titulo', 'Terras de Terna'), elemento('p', 'inicio-sub', 'Arraste para explorar · a roda do mouse aproxima'));
    const botoes = elemento('div', 'inicio-mapa-botoes');
    const centralizar = botao('Centralizar', 'inicio-botao inicio-botao-claro', () => irPara(BIOMAS[0]));
    const voltar = botao('Voltar', 'inicio-botao inicio-botao-claro', () => sair());
    botoes.append(centralizar, voltar);
    topo.append(titulo, botoes);
    const placas = BIOMAS.map((b) => ({ b, el: placaDo(b) }));
    tela.append(canvas, ...placas.map((p) => p.el), topo);

    const { mar, tufos } = nuvensDoMapa();
    const padrao = ctx.createPattern(mar, 'repeat');
    const artes = new Map<Bioma, HTMLImageElement>();
    for (const b of BIOMAS) void carregarImagem(b.arte).then((img) => artes.set(b, img));

    // A câmera: o ponto do mapa no meio da tela e o zoom (pixels da tela por pixel da arte).
    const cam = { x: BIOMAS[0].centro.x, y: BIOMAS[0].centro.y, z: 1 };
    const vel = { x: 0, y: 0 }; // o deslize depois de soltar, em pixels da arte por segundo
    let largura = 0;
    let altura = 0;
    let ajuste = 1; // o zoom com a floresta ocupando OCUPA da altura
    let animacao: { de: typeof cam; para: typeof cam; inicio: number; ms: number } | null = null;

    const limitarZoom = (z: number): number => Math.min(ajuste * ZOOM_MAX, Math.max(ajuste * ZOOM_MIN, z));
    const limitarCamera = (): void => {
      const meiaL = largura / (2 * cam.z);
      const meiaA = altura / (2 * cam.z);
      cam.x = meiaL * 2 >= MAPA_GRANDE.largura ? MAPA_GRANDE.largura / 2 : Math.min(MAPA_GRANDE.largura - meiaL, Math.max(meiaL, cam.x));
      cam.y = meiaA * 2 >= MAPA_GRANDE.altura ? MAPA_GRANDE.altura / 2 : Math.min(MAPA_GRANDE.altura - meiaA, Math.max(meiaA, cam.y));
    };
    const medir = (): void => {
      const antes = ajuste;
      largura = canvas.clientWidth;
      altura = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(largura * dpr));
      canvas.height = Math.max(1, Math.round(altura * dpr));
      ajuste = (altura * OCUPA) / BIOMAS[0].lado;
      cam.z = limitarZoom(cam.z * (ajuste / antes));
      limitarCamera();
    };
    // Vai até o bioma, com o zoom de centralizado, deslizando.
    const irPara = (b: Bioma, ms = 650): void => {
      vel.x = vel.y = 0;
      const para = { x: b.centro.x, y: b.centro.y, z: ajuste };
      if (semMovimento()) {
        Object.assign(cam, para);
        limitarCamera();
        return;
      }
      animacao = { de: { ...cam }, para, inicio: performance.now(), ms };
    };
    // Aproxima (fator > 1) ou afasta mantendo parado o ponto do mapa em (sx, sy) da tela.
    const aproximar = (fator: number, sx = largura / 2, sy = altura / 2): void => {
      animacao = null;
      const antes = { x: cam.x + (sx - largura / 2) / cam.z, y: cam.y + (sy - altura / 2) / cam.z };
      cam.z = limitarZoom(cam.z * fator);
      cam.x = antes.x - (sx - largura / 2) / cam.z;
      cam.y = antes.y - (sy - altura / 2) / cam.z;
      limitarCamera();
    };

    // Arrastar (o mouse ou o dedo): o mapa acompanha e, soltando, continua um pouco.
    let arrasto: { id: number; x: number; y: number; t: number } | null = null;
    canvas.addEventListener('pointerdown', (evento) => {
      if (evento.button !== 0) return;
      canvas.setPointerCapture(evento.pointerId);
      arrasto = { id: evento.pointerId, x: evento.clientX, y: evento.clientY, t: performance.now() };
      animacao = null;
      vel.x = vel.y = 0;
      canvas.classList.add('inicio-mapa-arrastando');
    });
    canvas.addEventListener('pointermove', (evento) => {
      if (!arrasto || evento.pointerId !== arrasto.id) return;
      const agora = performance.now();
      const dx = (evento.clientX - arrasto.x) / cam.z;
      const dy = (evento.clientY - arrasto.y) / cam.z;
      cam.x -= dx;
      cam.y -= dy;
      limitarCamera();
      const dt = Math.max(1, agora - arrasto.t) / 1000;
      // A velocidade de agora pesa mais que a de antes (um puxão no fim é o que conta).
      vel.x = vel.x * 0.5 + (-dx / dt) * 0.5;
      vel.y = vel.y * 0.5 + (-dy / dt) * 0.5;
      arrasto = { id: arrasto.id, x: evento.clientX, y: evento.clientY, t: agora };
    });
    const soltar = (evento: PointerEvent): void => {
      if (!arrasto || evento.pointerId !== arrasto.id) return;
      // Parado um tempo antes de soltar: não desliza.
      if (performance.now() - arrasto.t > 90 || semMovimento()) vel.x = vel.y = 0;
      arrasto = null;
      canvas.classList.remove('inicio-mapa-arrastando');
    };
    canvas.addEventListener('pointerup', soltar);
    canvas.addEventListener('pointercancel', soltar);
    canvas.addEventListener(
      'wheel',
      (evento) => {
        evento.preventDefault();
        const caixa = canvas.getBoundingClientRect();
        aproximar(Math.exp(-evento.deltaY * 0.0015), evento.clientX - caixa.left, evento.clientY - caixa.top);
      },
      { passive: false },
    );

    const aoTeclar = (evento: KeyboardEvent): void => {
      const passo = 70 / cam.z;
      const andar: Record<string, [number, number]> = {
        ArrowLeft: [-passo, 0],
        ArrowRight: [passo, 0],
        ArrowUp: [0, -passo],
        ArrowDown: [0, passo],
        KeyA: [-passo, 0],
        KeyD: [passo, 0],
        KeyW: [0, -passo],
        KeyS: [0, passo],
      };
      if (evento.code === 'Escape') sair();
      else if (andar[evento.code]) {
        animacao = null;
        cam.x += andar[evento.code][0];
        cam.y += andar[evento.code][1];
        limitarCamera();
      } else if (evento.key === '+' || evento.key === '=') aproximar(1.2);
      else if (evento.key === '-' || evento.key === '_') aproximar(1 / 1.2);
      else if (evento.code === 'KeyC') irPara(BIOMAS[0]);
      else return;
      evento.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);

    let acabou = false;
    const sair = (): void => {
      if (acabou) return;
      acabou = true;
      window.removeEventListener('keydown', aoTeclar);
      observador.disconnect();
      resolver();
    };

    // Um quadro: o mar, os tufos que passam, as artes dos biomas e os tufos da beira deles.
    let anterior = performance.now();
    const desenhar = (agora: number): void => {
      if (acabou && !tela.isConnected) return;
      requestAnimationFrame(desenhar);
      const dt = Math.min(0.05, (agora - anterior) / 1000);
      anterior = agora;
      const parado = semMovimento();
      const tempo = parado ? 0 : agora / 1000;

      if (animacao) {
        const p = Math.min(1, (agora - animacao.inicio) / animacao.ms);
        const k = 1 - (1 - p) ** 3;
        cam.x = animacao.de.x + (animacao.para.x - animacao.de.x) * k;
        cam.y = animacao.de.y + (animacao.para.y - animacao.de.y) * k;
        cam.z = animacao.de.z + (animacao.para.z - animacao.de.z) * k;
        limitarCamera();
        if (p >= 1) animacao = null;
      } else if (!arrasto && (vel.x || vel.y)) {
        cam.x += vel.x * dt;
        cam.y += vel.y * dt;
        const perde = Math.exp(-ATRITO * dt);
        vel.x = Math.abs(vel.x * perde) < 2 ? 0 : vel.x * perde;
        vel.y = Math.abs(vel.y * perde) < 2 ? 0 : vel.y * perde;
        limitarCamera();
      }

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = FUNDO;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const z = cam.z * dpr;
      ctx.setTransform(z, 0, 0, z, (largura / 2) * dpr - cam.x * z, (altura / 2) * dpr - cam.y * z);
      ctx.imageSmoothingEnabled = false;

      // O mar de nuvens, andando devagar para a esquerda.
      if (padrao) {
        padrao.setTransform(new DOMMatrix().translateSelf(-((tempo * MAR_POR_SEGUNDO) % (mar.width * PIXEL)), 0).scaleSelf(PIXEL, PIXEL));
        ctx.fillStyle = padrao;
        ctx.fillRect(0, 0, MAPA_GRANDE.largura, MAPA_GRANDE.altura);
      }
      const volta = MAPA_GRANDE.largura + 600;
      const tufoEm = (t: TufoNoMapa, x: number, y: number): void =>
        ctx.drawImage(t.t, Math.round(x - (t.t.width * PIXEL) / 2), Math.round(y - (t.t.height * PIXEL) / 2), t.t.width * PIXEL, t.t.height * PIXEL);
      for (const t of tufos) {
        if (!t.velocidade) continue;
        const x = ((((t.x - tempo * t.velocidade + 300) % volta) + volta) % volta) - 300;
        tufoEm(t, x, t.y + Math.sin(tempo * 0.4 + t.fase) * 6);
      }
      for (const b of BIOMAS) {
        const img = artes.get(b);
        if (!img) continue;
        // Afastado, a arte (que não é de pixels inteiros) fica lisa em vez de serrilhada.
        ctx.imageSmoothingEnabled = cam.z < 1;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, b.centro.x - b.lado / 2, b.centro.y - b.lado / 2, b.lado, b.lado);
        ctx.imageSmoothingEnabled = false;
      }
      for (const t of tufos) {
        if (t.velocidade) continue;
        tufoEm(t, t.x, t.y + Math.sin(tempo * 0.7 + t.fase) * 5);
      }

      // As placas acompanham o mapa, presas na beira de baixo de cada bioma.
      for (const { b, el } of placas) {
        const x = (b.centro.x - cam.x) * cam.z + largura / 2;
        const y = (b.centro.y + b.lado * 0.4 - cam.y) * cam.z + altura / 2;
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
      }
    };

    const observador = new ResizeObserver(() => medir());
    observador.observe(canvas);
    mostrarTela(tela);
    medir();
    // A chegada: começa um pouco afastado e aproxima até a floresta.
    cam.z = limitarZoom(ajuste * (semMovimento() ? 1 : 0.72));
    limitarCamera();
    irPara(BIOMAS[0], ENTRADA_MS);
    requestAnimationFrame(desenhar);
    // A arte do menu fica atrás do mapa, que cobre tudo: depois da troca, para de desenhar.
    setTimeout(() => {
      if (!acabou && tela.isConnected) esconderCena();
    }, ESMAECER_MS);
  });
}
