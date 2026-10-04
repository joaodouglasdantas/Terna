// A logo da tela inicial, viva: a logo da temporada (as letras de madeira com musgo e flores da
// Floresta da Divisa) flutua devagar (no CSS), com a luz do pôr do sol do cenário batendo nela
// pela direita (uma camada quente presa ao formato da logo e as beiradas viradas para o sol
// acesas, respirando). O que é planta se mexe: os cipós soltos balançam no vento (mais na ponta
// que onde estão presos, com rajadas de vez em quando), as flores balançam e respiram e soltam
// pétalas, os cipós soltam pedacinhos de musgo, o orvalho pisca no musgo de cima e vagalumes
// passeiam em volta. Os cipós e as flores são recortes da própria arte (logo-partes.ts e
// assets/logo-partes.webp); a imagem da logo é o resto, sem eles.

import logoUrl from '../assets/logo.webp';
import luzUrl from '../assets/logo-luz.webp';
import partesUrl from '../assets/logo-partes.webp';
import { carregarDecodificada, contexto2d, umaVez } from '../motor/imagens';
import { elemento, imagemDaLogo } from './dom';
import { cair, desenharBrilho, desenharFolha, desenharHalo, folhaPronta, inclinacao, type Folha as DesenhoDeFolha, type Queda } from './efeitos';
import { LOGO, MUSGO_PRESO, PARTES, PONTAS_DOS_CIPOS } from './logo-partes';

export const carregarPartesDaLogo = umaVez(() => carregarDecodificada(partesUrl));

type Faixa = { u: readonly [number, number]; v: readonly [number, number] };
const EM_VOLTA: Faixa = { u: [-0.04, 1.04], v: [-0.15, 1.05] }; // por onde os vagalumes andam
// Um pixel da arte da logo, em pixels da imagem (o balanço anda de pixel em pixel, como pixel art).
const PIXEL = 6;
// O tamanho das partículas (frações da largura): o pixel do cenário.
const PIXEL_DAS_PARTICULAS = 11 / LOGO.largura;

// Quanto o canvas passa da logo (as folhas caem abaixo dela), em frações da logo. Igual ao CSS de
// .inicio-logo-particulas.
const SOBRA = { lados: 0.1, topo: 0.3, baixo: 0.7 };

// Os verdes do musgo da arte (oliva) e os rosas das flores.
const VERDES = ['#3f4d16', '#5c6b1d', '#7d8c27', '#a3b043'];
const ROSAS = ['#f6c3cc', '#fde3e7', '#e897a6', '#ffffff'];

type Tipo = 'musgo' | 'petala' | 'orvalho' | 'vagalume';

interface Particula {
  tipo: Tipo;
  u: number;
  v: number;
  vu: number; // frações da largura por segundo
  vv: number; // frações da altura por segundo
  vida: number;
  duracao: number;
  fase: number;
  cor: string;
  // Os pedacinhos que caem (musgo e pétalas).
  queda?: Queda;
  desenho?: DesenhoDeFolha;
}

// Partículas por segundo de cada tipo.
const TAXA: Record<Tipo, number> = { musgo: 1.1, petala: 0.9, orvalho: 1.2, vagalume: 1.1 };

const FLORES = PARTES.filter((p) => p.tipo === 'flor');
const CIPOS = PARTES.filter((p) => p.tipo === 'cipo');

const sortear = (min: number, max: number): number => min + Math.random() * (max - min);
const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(Math.random() * lista.length)];
const entre = (faixa: readonly [number, number]): number => sortear(faixa[0], faixa[1]);

function queda(x: number, y: number, descida: number): Queda {
  return {
    x,
    y,
    vento: -sortear(0.004, 0.015),
    // A altura da logo é menos da metade da largura: a descida (em frações da altura) é maior
    // para as coisas caírem no ritmo das folhas da floresta.
    descida,
    balanco: sortear(0.006, 0.012),
    ritmo: sortear(2, 3),
    fase: sortear(0, Math.PI * 2),
    giro: sortear(0, Math.PI * 2),
    rodopio: Math.random() < 0.5 ? sortear(3, 6) : sortear(-0.5, 0.5),
    vida: 0,
  };
}

function nascer(tipo: Tipo): Particula {
  const base = { tipo, vida: 0, fase: sortear(0, Math.PI * 2), vu: 0, vv: 0, u: 0, v: 0, cor: '' };
  switch (tipo) {
    case 'musgo': {
      // Um pedacinho de musgo se soltando da ponta de um cipó.
      const p = escolher(PONTAS_DOS_CIPOS);
      return {
        ...base,
        duracao: sortear(2.4, 3.4),
        cor: escolher(VERDES),
        queda: queda(p.u + sortear(-0.004, 0.004), p.v - 0.01, sortear(0.16, 0.24)),
        desenho: folhaPronta(escolher(VERDES), Math.random() < 0.75 ? 'pequena' : 'media'),
      };
    }
    case 'petala': {
      // Uma pétala se soltando de uma flor: cai devagar, rodando.
      const f = escolher(FLORES);
      return {
        ...base,
        duracao: sortear(2.8, 4),
        cor: escolher(ROSAS),
        queda: queda((f.x + f.w * sortear(0.2, 0.8)) / LOGO.largura, (f.y + f.h * 0.5) / LOGO.altura, sortear(0.1, 0.16)),
      };
    }
    case 'orvalho': {
      const m = escolher(MUSGO_PRESO);
      return { ...base, u: entre(m.u), v: entre(m.v), duracao: sortear(0.5, 0.9) };
    }
    case 'vagalume':
      return { ...base, u: entre(EM_VOLTA.u), v: entre(EM_VOLTA.v), duracao: sortear(2.4, 4) };
  }
}

function mover(p: Particula, dt: number): void {
  p.vida += dt;
  if (p.queda) {
    // Na queda, x anda em frações da largura e y em frações da altura.
    cair(p.queda, dt);
    p.u = p.queda.x;
    p.v = p.queda.y;
    return;
  }
  if (p.tipo === 'vagalume') {
    p.vu = Math.cos(p.vida * 1.4 + p.fase) * 0.012;
    p.vv = Math.sin(p.vida * 1.9 + p.fase) * 0.05;
  }
  p.u += p.vu * dt;
  p.v += p.vv * dt;
}

// Aparece rápido, some devagar.
function alfa(p: Particula): number {
  const t = p.vida / p.duracao;
  return Math.max(0, Math.min(1, t * 6) * Math.min(1, (1 - t) * 2.5));
}

// O vento: uma brisa que vai e volta e, de vez em quando, uma rajada mais forte.
function vento(tempo: number): number {
  const rajada = Math.max(0, Math.sin(tempo * 0.23) * Math.sin(tempo * 0.61 + 1)) ** 2;
  return 0.55 + 0.45 * Math.sin(tempo * 0.4) + rajada * 1.4;
}

// A logo e `ligar`, que põe tudo para rodar: chamar depois de a logo entrar na página (e de novo
// quando ela volta). O laço para sozinho quando a logo sai.
export function logoViva(): { palco: HTMLElement; ligar: () => void } {
  const palco = elemento('div', 'inicio-logo-palco');
  // A luz do sol: o calor da tarde por cima da logo (só onde há logo: a própria imagem é a
  // máscara) e as beiradas viradas para o sol (logo-luz.webp, feita da mesma arte).
  const sol = elemento('div', 'inicio-logo-sol');
  sol.style.setProperty('--mascara', `url("${logoUrl}")`);
  const beiradas = elemento('img', 'inicio-logo-beiradas');
  beiradas.src = luzUrl;
  beiradas.alt = '';
  beiradas.draggable = false;
  const canvas = elemento('canvas', 'inicio-logo-particulas');
  canvas.setAttribute('aria-hidden', 'true');
  palco.append(imagemDaLogo('inicio-logo'), sol, beiradas, canvas);

  const ctx = contexto2d(canvas);
  let atlas: HTMLImageElement | null = null;
  void carregarPartesDaLogo().then((img) => (atlas = img), () => undefined);
  // Sem movimento (a preferência do sistema): os cipós e as flores ficam parados no lugar deles.
  const parado = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let particulas: Particula[] = [];
  const devidas: Record<Tipo, number> = { musgo: 0, petala: 0, orvalho: 0, vagalume: 0 };
  let ultimo = 0;
  let rodando = false;
  let largura = 0; // da logo, em px da tela
  let altura = 0;

  const quadro = (agora: number): void => {
    if (!palco.isConnected) {
      rodando = false;
      ultimo = 0;
      return;
    }
    requestAnimationFrame(quadro);
    const dt = ultimo ? Math.min((agora - ultimo) / 1000, 1 / 20) : 0;
    ultimo = agora;
    const tempo = parado ? 0 : agora / 1000;

    // Acompanha o tamanho da logo (a janela pode mudar).
    const w = palco.clientWidth;
    const h = palco.clientHeight;
    const dpr = devicePixelRatio || 1;
    if (w !== largura || h !== altura) {
      largura = w;
      altura = h;
      canvas.width = Math.round(w * (1 + 2 * SOBRA.lados) * dpr);
      canvas.height = Math.round(h * (1 + SOBRA.topo + SOBRA.baixo) * dpr);
    }

    if (!parado) {
      for (const tipo of Object.keys(TAXA) as Tipo[]) {
        devidas[tipo] += TAXA[tipo] * dt;
        while (devidas[tipo] >= 1) {
          devidas[tipo]--;
          particulas.push(nascer(tipo));
        }
      }
      for (const p of particulas) mover(p, dt);
      particulas = particulas.filter((p) => p.vida < p.duracao);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = largura / LOGO.largura; // px da tela por px da imagem da logo
    const X = (px: number): number => SOBRA.lados * largura + px * k;
    const Y = (py: number): number => SOBRA.topo * altura + py * (altura / LOGO.altura);
    const ar = Math.max(1, k * PIXEL); // um pixel da arte, em px da tela

    if (atlas) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const forca = vento(tempo);
      // Os cipós: faixas de um pixel da arte, cada uma deslocada pelo vento; o deslocamento
      // cresce do ponto preso (em cima) para a ponta e anda de pixel em pixel.
      for (const c of CIPOS) {
        const fase = c.x * 0.006;
        for (let sy = 0; sy < c.h; sy += PIXEL) {
          const fundo = (sy + PIXEL / 2) / c.h;
          const onda = Math.sin(tempo * 1.7 + fase - fundo * 1.2) * 0.75 + Math.sin(tempo * 0.9 + fase * 1.7) * 0.25;
          const dx = Math.round((onda * forca * 1.6 * fundo ** 1.4 * PIXEL * k) / ar) * ar;
          const hh = Math.min(PIXEL, c.h - sy);
          ctx.drawImage(atlas, c.ax, sy, c.w, hh, Math.round(X(c.x) + dx), Math.round(Y(c.y + sy)), Math.ceil(c.w * k), Math.ceil(hh * k) + 1);
        }
      }
      // As flores: balançam um pouco e respiram, cada uma no seu ritmo.
      for (const f of FLORES) {
        const fase = f.x * 0.011;
        const giro = Math.sin(tempo * 1.3 + fase) * 0.09 * (0.6 + 0.4 * forca);
        const escala = 1 + Math.sin(tempo * 2.1 + fase) * 0.04;
        ctx.save();
        ctx.translate(X(f.x + f.w / 2), Y(f.y + f.h / 2));
        ctx.rotate(giro);
        ctx.scale(escala, escala);
        ctx.drawImage(atlas, f.ax, 0, f.w, f.h, (-f.w / 2) * k, (-f.h / 2) * k, f.w * k, f.h * k);
        ctx.restore();
      }
    }

    const u = Math.max(2, Math.round(largura * PIXEL_DAS_PARTICULAS));
    const x = (pu: number): number => (pu + SOBRA.lados) * largura;
    const y = (pv: number): number => (pv + SOBRA.topo) * altura;

    // A luz: orvalho e vagalumes somam brilho.
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particulas) {
      const a = alfa(p);
      if (a <= 0) continue;
      const px = x(p.u);
      const py = y(p.v);
      if (p.tipo === 'orvalho') {
        const forca = Math.sin((p.vida / p.duracao) * Math.PI);
        desenharHalo(ctx, '#e4ffc0', px, py, u * 2.5, forca * 0.35);
        desenharBrilho(ctx, px, py, u, forca * 0.75, '#f6ffe8');
      } else if (p.tipo === 'vagalume') {
        const acende = Math.max(0, Math.sin(p.vida * 3.2 + p.fase)) ** 2;
        desenharHalo(ctx, '#c8f25a', px, py, u * 4, a * acende * 0.5);
        ctx.globalAlpha = a * (0.25 + 0.75 * acende);
        ctx.fillStyle = '#f7ffd0';
        ctx.fillRect(Math.round(px - u / 2), Math.round(py - u / 2), u, u);
      }
    }

    // O que cai tem cor própria: sem somar luz.
    ctx.globalCompositeOperation = 'source-over';
    for (const p of particulas) {
      const a = alfa(p);
      if (a <= 0 || !p.queda) continue;
      if (p.tipo === 'musgo' && p.desenho) {
        desenharFolha(ctx, p.desenho, x(p.u), y(p.v), u * 0.9, inclinacao(p.queda), p.queda.giro, a);
      } else if (p.tipo === 'petala') {
        // A pétala: dois pixels que viram um conforme ela roda no ar.
        const virada = Math.abs(Math.cos(p.queda.giro + p.vida * 3));
        ctx.globalAlpha = a;
        ctx.fillStyle = p.cor;
        ctx.fillRect(Math.round(x(p.u) - u), Math.round(y(p.v) - u / 2), virada > 0.4 ? u * 2 : u, u);
      }
    }
    ctx.globalAlpha = 1;
  };
  const ligar = (): void => {
    if (rodando) return;
    rodando = true;
    requestAnimationFrame(quadro);
  };
  return { palco, ligar };
}
