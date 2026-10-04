// A logo da tela inicial, viva: as letras de pedra com musgo flutuam devagar (no CSS), com a luz
// do pôr do sol do cenário batendo nelas pela direita (uma camada quente presa ao formato da logo
// e as beiradas viradas para o sol acesas, respirando). Por cima, o musgo solta folhinhas em pixel
// que caem balançando, umas gotas de orvalho piscam nele e vagalumes passeiam em volta das letras. Tudo é medido em pixels da arte, para os efeitos
// parecerem parte dela.

import logoUrl from '../assets/logo.webp';
import luzUrl from '../assets/logo-luz.webp';
import { contexto2d } from '../motor/imagens';
import { elemento, imagemDaLogo } from './dom';
import { cair, desenharBrilho, desenharFolha, desenharHalo, folhaPronta, inclinacao, type Folha as DesenhoDeFolha, type Queda } from './efeitos';

// Trechos da arte (logo.webp, 1086×366) em frações da largura (u) e da altura (v).
type Faixa = { u: readonly [number, number]; v: readonly [number, number] };
// As pontas de musgo de baixo de cada letra, de onde as folhas se soltam.
const MUSGO_DE_BAIXO: readonly Faixa[] = [
  { u: [0.06, 0.16], v: [0.74, 0.9] }, // T
  { u: [0.21, 0.3], v: [0.66, 0.78] }, // E
  { u: [0.38, 0.45], v: [0.64, 0.74] }, // R
  { u: [0.53, 0.58], v: [0.64, 0.72] },
  { u: [0.59, 0.66], v: [0.64, 0.74] }, // N
  { u: [0.75, 0.81], v: [0.76, 0.87] }, // A
  { u: [0.92, 0.98], v: [0.78, 0.9] },
];
// O musgo de cima das letras, onde o orvalho brilha.
const MUSGO_DE_CIMA: readonly Faixa[] = [
  { u: [0.02, 0.2], v: [0.04, 0.16] },
  { u: [0.3, 0.36], v: [0.12, 0.2] },
  { u: [0.39, 0.5], v: [0.04, 0.14] },
  { u: [0.56, 0.66], v: [0.1, 0.18] },
  { u: [0.69, 0.74], v: [0.12, 0.2] },
  { u: [0.79, 0.88], v: [0.04, 0.16] },
];
const EM_VOLTA: Faixa = { u: [-0.04, 1.04], v: [-0.15, 1.05] }; // por onde os vagalumes andam
const PIXEL_DA_ARTE = 8 / 1090; // um "pixel" da arte, em frações da largura

// Quanto o canvas passa da logo (as folhas caem abaixo dela), em frações da logo. Igual ao CSS de
// .inicio-logo-particulas.
const SOBRA = { lados: 0.1, topo: 0.3, baixo: 0.7 };

// Os verdes do musgo da arte.
const VERDES = ['#2f6a1c', '#4b8f22', '#6fb82c', '#9bd64a'];

type Tipo = 'folha' | 'orvalho' | 'vagalume';

interface Particula {
  tipo: Tipo;
  u: number;
  v: number;
  vu: number; // frações da largura por segundo
  vv: number; // frações da altura por segundo
  vida: number;
  duracao: number;
  fase: number;
  // Só as folhas.
  queda?: Queda;
  desenho?: DesenhoDeFolha;
}

// Partículas por segundo de cada tipo.
const TAXA: Record<Tipo, number> = { folha: 1.3, orvalho: 1.2, vagalume: 1.2 };

const sortear = (min: number, max: number): number => min + Math.random() * (max - min);
const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(Math.random() * lista.length)];
const entre = (faixa: readonly [number, number]): number => sortear(faixa[0], faixa[1]);

function nascer(tipo: Tipo): Particula {
  const base = { tipo, vida: 0, fase: sortear(0, Math.PI * 2), vu: 0, vv: 0 };
  switch (tipo) {
    case 'folha': {
      const musgo = escolher(MUSGO_DE_BAIXO);
      return {
        ...base,
        u: 0,
        v: 0,
        duracao: sortear(2.6, 3.6),
        queda: {
          x: entre(musgo.u),
          y: entre(musgo.v),
          vento: -sortear(0.004, 0.015),
          // A altura da logo é um terço da largura: a descida (em frações da altura) é maior para
          // as folhas caírem no mesmo ritmo das da floresta.
          descida: sortear(0.22, 0.34),
          balanco: sortear(0.008, 0.014),
          ritmo: sortear(2, 3),
          fase: sortear(0, Math.PI * 2),
          giro: sortear(0, Math.PI * 2),
          rodopio: Math.random() < 0.5 ? sortear(3, 6) : sortear(-0.5, 0.5),
          vida: 0,
        },
        desenho: folhaPronta(escolher(VERDES), Math.random() < 0.7 ? 'pequena' : 'media'),
      };
    }
    case 'orvalho': {
      const musgo = escolher(MUSGO_DE_CIMA);
      return { ...base, u: entre(musgo.u), v: entre(musgo.v), duracao: sortear(0.5, 0.9) };
    }
    case 'vagalume':
      return { ...base, u: entre(EM_VOLTA.u), v: entre(EM_VOLTA.v), duracao: sortear(2.4, 4) };
  }
}

function mover(p: Particula, dt: number): void {
  p.vida += dt;
  if (p.tipo === 'folha' && p.queda) {
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

// A logo e `ligar`, que põe as partículas para rodar: chamar depois de a logo entrar na página
// (e de novo quando ela volta). O laço para sozinho quando a logo sai.
export function logoViva(): { palco: HTMLElement; ligar: () => void } {
  const palco = elemento('div', 'inicio-logo-palco');
  const canvas = elemento('canvas', 'inicio-logo-particulas');
  canvas.setAttribute('aria-hidden', 'true');
  // A luz do sol: o calor da tarde por cima da logo (só onde há logo: a própria imagem é a
  // máscara) e as beiradas viradas para o sol (logo-luz.webp, feita da mesma arte).
  const sol = elemento('div', 'inicio-logo-sol');
  sol.style.setProperty('--mascara', `url("${logoUrl}")`);
  const beiradas = elemento('img', 'inicio-logo-beiradas');
  beiradas.src = luzUrl;
  beiradas.alt = '';
  beiradas.draggable = false;
  palco.append(imagemDaLogo('inicio-logo'), sol, beiradas, canvas);

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return { palco, ligar: () => undefined };

  const ctx = contexto2d(canvas);
  let particulas: Particula[] = [];
  const devidas: Record<Tipo, number> = { folha: 0, orvalho: 0, vagalume: 0 };
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

    for (const tipo of Object.keys(TAXA) as Tipo[]) {
      devidas[tipo] += TAXA[tipo] * dt;
      while (devidas[tipo] >= 1) {
        devidas[tipo]--;
        particulas.push(nascer(tipo));
      }
    }
    for (const p of particulas) mover(p, dt);
    particulas = particulas.filter((p) => p.vida < p.duracao);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const u = Math.max(2, Math.round(largura * PIXEL_DA_ARTE)); // um pixel da arte, em px
    const x = (pu: number): number => (pu + SOBRA.lados) * largura;
    const y = (pv: number): number => (pv + SOBRA.topo) * altura;

    // A luz: orvalho e vagalumes somam brilho.
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particulas) {
      const a = alfa(p);
      if (a <= 0) continue;
      const px = x(p.u);
      const py = y(p.v);
      if (p.tipo === 'orvalho') {
        const forca = Math.sin((p.vida / p.duracao) * Math.PI);
        desenharHalo(ctx, '#d8ffb0', px, py, u * 2.5, forca * 0.4);
        desenharBrilho(ctx, px, py, u, forca * 0.8, '#f2ffe0');
      } else if (p.tipo === 'vagalume') {
        const acende = Math.max(0, Math.sin(p.vida * 3.2 + p.fase)) ** 2;
        desenharHalo(ctx, '#c8f25a', px, py, u * 4, a * acende * 0.5);
        ctx.globalAlpha = a * (0.25 + 0.75 * acende);
        ctx.fillStyle = '#f7ffd0';
        ctx.fillRect(Math.round(px - u / 2), Math.round(py - u / 2), u, u);
      }
    }

    // As folhas têm cor própria: sem somar luz.
    ctx.globalCompositeOperation = 'source-over';
    for (const p of particulas) {
      const a = alfa(p);
      if (a > 0 && p.tipo === 'folha' && p.queda && p.desenho) {
        desenharFolha(ctx, p.desenho, x(p.u), y(p.v), u * 0.9, inclinacao(p.queda), p.queda.giro, a);
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
