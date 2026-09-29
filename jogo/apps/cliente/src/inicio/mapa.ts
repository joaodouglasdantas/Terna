// A tela do mapa (o botão Mapa da tela inicial): o mapa grande das terras de Terna, visto de cima.
// Só aparece o que já existe — por enquanto a Floresta da Divisa (terras.ts) —; o resto está
// coberto por um mar de nuvens que anda devagar, com nuvens passando e as da beira da floresta
// subindo e descendo. Todas são a nuvem de fontes/nuvem.png (assets/mapa/nuvem.webp), em vários
// tamanhos, viradas para um lado ou para o outro.
//
// A chegada é clara, como a luz do sol: a tela abre branca, a luz baixa e as nuvens que cobrem a
// floresta se abrem para os lados, mostrando o bioma. O nome fica escrito em cima dele; com o
// mouse por cima do bioma, aparecem os personagens que são dele, em quadrinhos com o nome.
//
// Arrastando, o mapa desliza (e segue um pouco depois de soltar); a roda do mouse aproxima e
// afasta, em volta do ponteiro, sem nunca mostrar além da borda do mapa grande. No teclado: setas
// andam, + e - aproximam, C centraliza e Esc volta.

import { SOBRE_HEROI } from '@terna/compartilhado';
import urlNuvem from '../assets/mapa/nuvem.webp';
import { carregarImagem, contexto2d, novoCanvas } from '../motor/imagens';
import { esconderCena } from './cena';
import { botao, elemento, ESMAECER_MS, mostrarTela } from './dom';
import { BIOMAS, MAPA_GRANDE, enquadrarRetrato, type Bioma } from './terras';

const FUNDO = '#a8c4f0'; // entre as nuvens do mar: o azul da sombra da nuvem da arte

// Quanto a floresta ocupa da altura da tela quando está centralizada (um pouco abaixo do meio, em
// fração do tamanho dela: sobra lugar para o título em cima e o nome), e até onde aproxima (em
// relação a isso). Afastando, para antes de a borda do mapa grande entrar na tela.
const OCUPA = 0.78;
const ABAIXO = 0.06;
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 2.6;
const ATRITO = 4.5; // o quanto o deslize depois de soltar perde por segundo
const MAR_POR_SEGUNDO = 6; // pixels do mapa que o mar de nuvens anda, para a esquerda

// A chegada: a câmera, um pouco perto, afasta até a floresta caber, enquanto as nuvens de cima
// dela se abrem (a luz do sol é do CSS: .inicio-mapa-luz).
const ABRE_MS = 2300;
const ABRE_ATRASO_MS = 250;
const ABRE_DISTANCIA = 1500; // pixels do mapa que cada nuvem anda para fora

// O mar de nuvens: um ladrilho que emenda nos quatro lados, em pixels do mapa, e a resolução dele.
const LADO_MAR = 2400;
const RESOLUCAO_MAR = 0.5;

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

// A nuvem da arte e ela virada para o outro lado.
interface Nuvens {
  normal: HTMLImageElement;
  virada: HTMLCanvasElement;
}

// Uma nuvem no mapa: o centro, a largura (a altura segue a arte), para que lado e como anda.
interface NuvemNoMapa {
  x: number;
  y: number;
  largura: number;
  virada: boolean;
  velocidade: number; // para a esquerda, em pixels do mapa por segundo (0: fica, só sobe e desce)
  fase: number; // o sobe e desce
  sai?: { x: number; y: number }; // a das que se abrem na chegada: para onde anda (unitário)
}

// O ladrilho do mar: nuvens numa grade com sorteio (cobrem tudo, sem buracos grandes), cada uma
// também do outro lado das bordas que ela passa, e todas desenhadas de cima para baixo (a de baixo
// na frente).
function marDeNuvens(nuvens: Nuvens, sortear: () => number): HTMLCanvasElement {
  const lado = LADO_MAR * RESOLUCAO_MAR;
  const canvas = novoCanvas(lado, lado);
  const ctx = contexto2d(canvas);
  ctx.fillStyle = FUNDO;
  ctx.fillRect(0, 0, lado, lado);
  const proporcao = nuvens.normal.height / nuvens.normal.width;
  const colunas = 6;
  const linhas = 11;
  const copias: { x: number; y: number; w: number; virada: boolean }[] = [];
  for (let l = 0; l < linhas; l++) {
    for (let c = 0; c < colunas; c++) {
      const w = (420 + sortear() * 360) * RESOLUCAO_MAR;
      const x = ((c + (l % 2) * 0.5 + (sortear() - 0.5) * 0.6) * lado) / colunas;
      const y = ((l + (sortear() - 0.5) * 0.5) * lado) / linhas;
      const virada = sortear() < 0.5;
      for (const dx of [-lado, 0, lado]) {
        for (const dy of [-lado, 0, lado]) {
          const cx = x + dx;
          const cy = y + dy;
          if (cx + w / 2 < 0 || cx - w / 2 > lado || cy + (w * proporcao) / 2 < 0 || cy - (w * proporcao) / 2 > lado) continue;
          copias.push({ x: cx, y: cy, w, virada });
        }
      }
    }
  }
  copias.sort((a, b) => a.y - b.y);
  ctx.imageSmoothingQuality = 'high';
  for (const { x, y, w, virada } of copias) {
    const h = w * proporcao;
    ctx.drawImage(virada ? nuvens.virada : nuvens.normal, Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
  }
  return canvas;
}

// As nuvens do mapa: as da beira de cada bioma (escondem a divisa quadrada da arte), as que
// passam em fileiras acima e abaixo da floresta e as que a cobrem na chegada e se abrem.
function nuvensDoMapa(sortear: () => number): { beira: NuvemNoMapa[]; passando: NuvemNoMapa[]; cortina: NuvemNoMapa[] } {
  const beira: NuvemNoMapa[] = [];
  const cortina: NuvemNoMapa[] = [];
  for (const b of BIOMAS) {
    const x0 = b.centro.x - b.lado / 2;
    const y0 = b.centro.y - b.lado / 2;
    const passo = 230;
    for (let d = 0; d <= b.lado + 1; d += passo) {
      for (const [x, y] of [[x0 + d, y0], [x0 + d, y0 + b.lado], [x0, y0 + d], [x0 + b.lado, y0 + d]]) {
        beira.push({ x: x + (sortear() - 0.5) * 60, y: y + (sortear() - 0.5) * 60, largura: 520 + sortear() * 200, virada: sortear() < 0.5, velocidade: 0, fase: sortear() * Math.PI * 2 });
      }
    }
    // A cortina: uma grade de nuvens grandes por cima de todo o bioma.
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 5; j++) {
        const x = x0 + ((i + 0.5) / 4) * b.lado + (sortear() - 0.5) * 120;
        const y = y0 + ((j + 0.5) / 5) * b.lado + (sortear() - 0.5) * 100;
        const dx = x - b.centro.x + (sortear() - 0.5) * 80;
        const dy = y - b.centro.y + (sortear() - 0.5) * 80;
        const d = Math.hypot(dx, dy) || 1;
        cortina.push({ x, y, largura: 760 + sortear() * 260, virada: sortear() < 0.5, velocidade: 0, fase: 0, sai: { x: dx / d, y: dy / d } });
      }
    }
  }
  cortina.sort((a, b) => a.y - b.y);
  const floresta = BIOMAS[0];
  const alto = floresta.centro.y - floresta.lado / 2 - 220;
  const baixo = floresta.centro.y + floresta.lado / 2 + 220;
  const passando: NuvemNoMapa[] = [];
  for (let i = 0; i < 30; i++) {
    const emCima = i % 2 === 0;
    const y = emCima ? 100 + sortear() * (alto - 100) : baixo + sortear() * (MAPA_GRANDE.altura - 100 - baixo);
    passando.push({ x: sortear() * MAPA_GRANDE.largura, y, largura: 480 + sortear() * 340, virada: sortear() < 0.5, velocidade: 10 + sortear() * 12, fase: sortear() * Math.PI * 2 });
  }
  passando.sort((a, b) => a.y - b.y);
  return { beira, passando, cortina };
}

// A arte da nuvem, o mar e as nuvens saem sempre iguais (a semente é fixa): feitos na primeira
// vez que o mapa abre, ficam.
let feitas: Promise<{ nuvens: Nuvens; mar: HTMLCanvasElement } & ReturnType<typeof nuvensDoMapa>> | null = null;
function prepararNuvens(): NonNullable<typeof feitas> {
  feitas ??= carregarImagem(urlNuvem).then((normal) => {
    const virada = novoCanvas(normal.width, normal.height);
    const ctx = contexto2d(virada);
    ctx.scale(-1, 1);
    ctx.drawImage(normal, -normal.width, 0);
    const nuvens = { normal, virada };
    const sortear = sorteador(1729);
    return { nuvens, mar: marDeNuvens(nuvens, sortear), ...nuvensDoMapa(sortear) };
  });
  return feitas;
}

// O nome do bioma, escrito em cima dele, e os quadrinhos dos personagens dele (aparecem com o
// mouse por cima do bioma).
function rotuloDo(b: Bioma): { el: HTMLElement; herois: HTMLElement } {
  const el = elemento('div', 'inicio-mapa-rotulo');
  const herois = elemento('ul', 'inicio-mapa-herois');
  herois.setAttribute('aria-label', `Personagens da ${b.nome}`);
  for (const heroi of b.herois) {
    const item = elemento('li', '');
    const quadro = elemento('span', 'inicio-mapa-rosto');
    const img = elemento('img', '');
    img.alt = '';
    img.draggable = false;
    enquadrarRetrato(img, heroi, 180, 0.46, 1);
    quadro.append(img);
    item.append(quadro, elemento('span', 'inicio-mapa-heroi-nome', SOBRE_HEROI[heroi].nome));
    herois.append(item);
  }
  el.append(elemento('strong', 'inicio-mapa-nome', b.nome), herois);
  return { el, herois };
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
    botoes.append(
      botao('Centralizar', 'inicio-botao inicio-botao-claro', () => irPara(BIOMAS[0])),
      botao('Voltar', 'inicio-botao inicio-botao-claro', () => sair()),
    );
    topo.append(titulo, botoes);
    const rotulos = BIOMAS.map((b) => ({ b, ...rotuloDo(b) }));
    // A luz do sol da chegada, por cima de tudo: clara até a arte carregar, depois baixa (CSS).
    const luz = elemento('div', 'inicio-mapa-luz');
    luz.setAttribute('aria-hidden', 'true');
    luz.addEventListener('animationend', () => luz.remove());
    tela.append(canvas, ...rotulos.map((r) => r.el), topo, luz);

    let pronto: Awaited<ReturnType<typeof prepararNuvens>> | null = null;
    let padrao: CanvasPattern | null = null;
    const artes = new Map<Bioma, HTMLImageElement>();
    for (const b of BIOMAS) void carregarImagem(b.arte).then((img) => artes.set(b, img));

    // A câmera: o ponto do mapa no meio da tela e o zoom (pixels da tela por pixel do mapa).
    const cam = { x: BIOMAS[0].centro.x, y: BIOMAS[0].centro.y, z: 1 };
    const vel = { x: 0, y: 0 }; // o deslize depois de soltar, em pixels do mapa por segundo
    let largura = 0;
    let altura = 0;
    let ajuste = 1; // o zoom com a floresta ocupando OCUPA da altura
    let animacao: { de: typeof cam; para: typeof cam; inicio: number; ms: number } | null = null;
    let abertura = -1; // performance.now() do começo das nuvens se abrindo (-1: ainda não, ou sem)

    // Afastando, a tela nunca passa da borda do mapa grande.
    const limitarZoom = (z: number): number =>
      Math.min(ajuste * ZOOM_MAX, Math.max(ajuste * ZOOM_MIN, largura / MAPA_GRANDE.largura, altura / MAPA_GRANDE.altura, z));
    const limitarCamera = (): void => {
      const meiaL = largura / (2 * cam.z);
      const meiaA = altura / (2 * cam.z);
      cam.x = Math.min(MAPA_GRANDE.largura - meiaL, Math.max(meiaL, cam.x));
      cam.y = Math.min(MAPA_GRANDE.altura - meiaA, Math.max(meiaA, cam.y));
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
      const para = { x: b.centro.x, y: b.centro.y - b.lado * ABAIXO, z: ajuste };
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

    // O mouse em cima de um bioma (um pouco para dentro da beira de nuvens): os personagens dele.
    const sobre = (sx: number, sy: number): void => {
      const x = cam.x + (sx - largura / 2) / cam.z;
      const y = cam.y + (sy - altura / 2) / cam.z;
      for (const { b, herois } of rotulos) {
        const dentro = Math.abs(x - b.centro.x) < b.lado * 0.42 && Math.abs(y - b.centro.y) < b.lado * 0.42;
        herois.classList.toggle('inicio-mapa-herois-visiveis', dentro);
      }
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
      const caixa = canvas.getBoundingClientRect();
      sobre(evento.clientX - caixa.left, evento.clientY - caixa.top);
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
    canvas.addEventListener('pointerleave', () => {
      for (const { herois } of rotulos) herois.classList.remove('inicio-mapa-herois-visiveis');
    });
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

    // Uma nuvem da arte, centrada em (x, y) do mapa. `escala`: a mais (as que se abrem crescem).
    const nuvem = (n: NuvemNoMapa, x: number, y: number, escala = 1): void => {
      if (!pronto) return;
      const img = n.virada ? pronto.nuvens.virada : pronto.nuvens.normal;
      const w = n.largura * escala;
      const h = (w * img.height) / img.width;
      // Diminuindo a arte, lisa; aumentando, em pixels.
      ctx.imageSmoothingEnabled = (cam.z * (window.devicePixelRatio || 1) * w) / img.width < 1;
      ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    };

    // Um quadro: o mar, as nuvens que passam, as artes dos biomas, as nuvens da beira e, na
    // chegada, as que se abrem.
    let anterior = performance.now();
    const desenhar = (agora: number): void => {
      if (acabou && !tela.isConnected) return;
      requestAnimationFrame(desenhar);
      const dt = Math.min(0.05, (agora - anterior) / 1000);
      anterior = agora;
      const tempo = semMovimento() ? 0 : agora / 1000;

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
      const vista = { x: cam.x - largura / (2 * cam.z), y: cam.y - altura / (2 * cam.z), w: largura / cam.z, h: altura / cam.z };

      if (pronto) {
        // O mar de nuvens, andando devagar para a esquerda, cobrindo tudo o que está na tela.
        padrao ??= ctx.createPattern(pronto.mar, 'repeat');
        if (padrao) {
          const andou = (tempo * MAR_POR_SEGUNDO) % LADO_MAR;
          padrao.setTransform(new DOMMatrix().translateSelf(-andou, 0).scaleSelf(1 / RESOLUCAO_MAR, 1 / RESOLUCAO_MAR));
          ctx.imageSmoothingEnabled = true;
          ctx.fillStyle = padrao;
          ctx.fillRect(vista.x - 10, vista.y - 10, vista.w + 20, vista.h + 20);
        }
        const volta = MAPA_GRANDE.largura + 900;
        for (const n of pronto.passando) {
          const x = ((((n.x - tempo * n.velocidade + 450) % volta) + volta) % volta) - 450;
          nuvem(n, x, n.y + Math.sin(tempo * 0.4 + n.fase) * 6);
        }
      }
      for (const b of BIOMAS) {
        const img = artes.get(b);
        if (!img) continue;
        // Afastado, a arte fica lisa em vez de serrilhada; perto, em pixels.
        ctx.imageSmoothingEnabled = z < 1;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, b.centro.x - b.lado / 2, b.centro.y - b.lado / 2, b.lado, b.lado);
      }
      if (pronto) {
        for (const n of pronto.beira) nuvem(n, n.x, n.y + Math.sin(tempo * 0.7 + n.fase) * 5);
        // A chegada: as nuvens em cima da floresta se abrem para fora e crescem um pouco, como se
        // a câmera passasse por elas. Antes da arte carregar, ficam paradas cobrindo tudo.
        const p = abertura < 0 ? (semMovimento() ? 1 : 0) : Math.min(1, Math.max(0, (agora - abertura - ABRE_ATRASO_MS) / ABRE_MS));
        if (p < 1) {
          const k = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
          for (const n of pronto.cortina) {
            const sai = n.sai ?? { x: 0, y: 0 };
            nuvem(n, n.x + sai.x * ABRE_DISTANCIA * k, n.y + sai.y * ABRE_DISTANCIA * k, 1 + 0.35 * k);
          }
        }
      }

      // Os nomes acompanham o mapa, em cima de cada bioma, crescendo e diminuindo com o zoom (até
      // um ponto, para continuarem legíveis).
      const escala = Math.min(1.5, Math.max(0.6, cam.z / ajuste));
      for (const { b, el } of rotulos) {
        const x = (b.centro.x - cam.x) * cam.z + largura / 2;
        const y = (b.centro.y - b.lado / 2 + 40 - cam.y) * cam.z + altura / 2;
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translateX(-50%) scale(${escala.toFixed(3)})`;
      }
    };

    const observador = new ResizeObserver(() => medir());
    observador.observe(canvas);
    mostrarTela(tela);
    medir();
    // A chegada: a câmera começa um pouco perto e afasta até a floresta, junto com as nuvens se
    // abrindo — as duas esperam a nuvem e a arte da floresta carregarem.
    const comecar = (): void => {
      if (semMovimento()) {
        luz.remove();
        cam.z = limitarZoom(ajuste);
        limitarCamera();
        return;
      }
      luz.classList.add('inicio-mapa-luz-baixando');
      cam.z = limitarZoom(ajuste * 1.15);
      limitarCamera();
      abertura = performance.now();
      irPara(BIOMAS[0], ABRE_MS + ABRE_ATRASO_MS);
    };
    cam.z = limitarZoom(ajuste * 1.15);
    limitarCamera();
    void Promise.all([prepararNuvens(), carregarImagem(BIOMAS[0].arte)]).then(
      ([nuvens]) => {
        pronto = nuvens;
        comecar();
      },
      () => luz.remove(), // sem a arte, o mapa fica só com o fundo, mas a luz não prende a tela
    );
    requestAnimationFrame(desenhar);
    // A arte do menu fica atrás do mapa, que cobre tudo: depois da troca, para de desenhar.
    setTimeout(() => {
      if (!acabou && tela.isConnected) esconderCena();
    }, ESMAECER_MS);
  });
}
