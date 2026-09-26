// A logo da tela inicial, viva: flutua, respira uma aura roxa, um brilho passa pelas letras de
// tempos em tempos e cada parte da arte solta as suas partículas — faíscas azuis girando no
// redemoinho da espada, brasas subindo do fogo da arma, poeira roxa em volta das pedras
// flutuantes, esporos verdes do musgo, pingos do cristal de baixo e a estrela piscando no pico.
// As partículas são quadradinhos do tamanho do pixel da arte, para parecerem parte dela.

import logoUrl from '../assets/logo.png';
import { contexto2d } from '../motor/imagens';
import { elemento, imagemDaLogo } from './dom';

// Pontos da arte (logo.png, 1774×887) em frações da largura (u) e da altura (v).
const ESTRELA = { u: 0.499, v: 0.197 };
const REDEMOINHO = { u: 0.172, v: 0.6 };
const PONTA_DO_CRISTAL = { u: 0.497, v: 0.95 };
const CANO = { u: 0.965, v: 0.43 };
const PIXEL_DA_ARTE = 7 / 1774; // um "pixel" da arte, em frações da largura

// Quanto o canvas passa da logo (as partículas saem dela), em frações da logo. Igual ao CSS de
// .inicio-logo-particulas.
const SOBRA = { lados: 0.1, topo: 0.25, baixo: 0.15 };

type Tipo = 'azul' | 'fogo' | 'roxo' | 'verde' | 'pingo' | 'cano';

interface Particula {
  tipo: Tipo;
  u: number;
  v: number;
  vu: number; // frações da largura por segundo
  vv: number; // frações da altura por segundo
  vida: number;
  duracao: number;
  tamanho: number; // em pixels da arte
  fase: number;
  // Só as azuis: giram em volta do redemoinho.
  angulo?: number;
  raio?: number;
}

const CORES: Record<Tipo, string[]> = {
  azul: ['#9fd4ff', '#e0f2ff', '#ffffff', '#5fb2ff'], // claras: sobre o azul da arte, só as claras aparecem
  fogo: ['#ffe9a0', '#ffc15a', '#ff8a3a', '#ff5a3a'], // do mais quente ao mais frio: a brasa esfria subindo
  roxo: ['#8a5cff', '#b48cff', '#e3d4ff'],
  verde: ['#7fd66b', '#c8f5b0', '#9be05a'],
  pingo: ['#b48cff', '#e3d4ff'],
  cano: ['#ff5a67', '#ffb3ba'],
};

// Partículas por segundo de cada tipo.
const TAXA: Record<Tipo, number> = { azul: 24, fogo: 24, roxo: 12, verde: 6, pingo: 1.2, cano: 3 };

const sortear = (min: number, max: number): number => min + Math.random() * (max - min);
const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(Math.random() * lista.length)];

function nascer(tipo: Tipo): Particula {
  const base = { tipo, vida: 0, fase: sortear(0, Math.PI * 2), tamanho: Math.random() < 0.35 ? 2 : 1 };
  switch (tipo) {
    case 'azul': {
      const angulo = sortear(0, Math.PI * 2);
      return { ...base, u: 0, v: 0, vu: 0, vv: -0.03, duracao: sortear(1.2, 2.2), angulo, raio: sortear(0.04, 0.12) };
    }
    case 'fogo':
      return { ...base, u: sortear(0.76, 0.93), v: sortear(0.3, 0.82), vu: sortear(-0.01, 0.015), vv: -sortear(0.12, 0.26), duracao: sortear(0.8, 1.6) };
    case 'roxo':
      return { ...base, u: sortear(0.37, 0.64), v: sortear(0.02, 0.42), vu: sortear(-0.008, 0.008), vv: -sortear(0.04, 0.1), duracao: sortear(1.6, 3) };
    case 'verde':
      return { ...base, u: sortear(0.2, 0.82), v: sortear(0.36, 0.5), vu: sortear(-0.01, 0.01), vv: -sortear(0.04, 0.08), duracao: sortear(1.6, 2.6), tamanho: 1 };
    case 'pingo':
      return { ...base, u: PONTA_DO_CRISTAL.u + sortear(-0.005, 0.005), v: PONTA_DO_CRISTAL.v, vu: 0, vv: sortear(0.08, 0.14), duracao: sortear(1, 1.6), tamanho: 1 };
    case 'cano':
      return { ...base, u: CANO.u, v: CANO.v + sortear(-0.03, 0.03), vu: sortear(0.03, 0.07), vv: sortear(-0.04, 0.04), duracao: sortear(0.3, 0.6), tamanho: 1 };
  }
}

function mover(p: Particula, dt: number): void {
  p.vida += dt;
  if (p.tipo === 'azul' && p.angulo !== undefined && p.raio !== undefined) {
    // Gira no sentido do redemoinho da arte, abrindo aos poucos e subindo um pouco.
    p.angulo -= dt * 2.4;
    p.raio += dt * 0.02;
    p.u = REDEMOINHO.u + Math.cos(p.angulo) * p.raio;
    p.v = REDEMOINHO.v + Math.sin(p.angulo) * p.raio * 2 + p.vv * p.vida; // ×2: a logo tem o dobro da largura
    return;
  }
  // Brasas e poeira sobem ondulando; pingos caem.
  const onda = p.tipo === 'pingo' || p.tipo === 'cano' ? 0 : Math.sin(p.vida * 3 + p.fase) * 0.012;
  p.u += (p.vu + onda) * dt;
  p.v += p.vv * dt;
}

function cor(p: Particula): string {
  const cores = CORES[p.tipo];
  if (p.tipo === 'fogo') return cores[Math.min(cores.length - 1, Math.floor((p.vida / p.duracao) * cores.length))];
  return cores[Math.floor(p.fase * 10) % cores.length];
}

// Aparece rápido, some devagar; a poeira roxa e os esporos também piscam.
function brilho(p: Particula): number {
  const t = p.vida / p.duracao;
  const entra = Math.min(1, t * 6);
  const sai = Math.min(1, (1 - t) * 2.5);
  const pisca = p.tipo === 'roxo' || p.tipo === 'verde' ? 0.55 + 0.45 * Math.sin(p.vida * 9 + p.fase) : 1;
  return Math.max(0, entra * sai * pisca);
}

// A logo e `ligar`, que põe as partículas para rodar: chamar depois de a logo entrar na página
// (e de novo quando ela volta). O laço para sozinho quando a logo sai.
export function logoViva(): { palco: HTMLElement; ligar: () => void } {
  const palco = elemento('div', 'inicio-logo-palco');
  const aura = elemento('div', 'inicio-logo-aura');
  // O brilho que passa usa a própria logo como máscara: só aparece em cima da arte.
  const reluz = elemento('div', 'inicio-logo-reluz');
  reluz.style.setProperty('--logo', `url("${logoUrl}")`);
  const canvas = elemento('canvas', 'inicio-logo-particulas');
  canvas.setAttribute('aria-hidden', 'true');
  palco.append(aura, imagemDaLogo('inicio-logo'), reluz, canvas);

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return { palco, ligar: () => undefined };

  const ctx = contexto2d(canvas);
  let particulas: Particula[] = [];
  const devidas: Record<Tipo, number> = { azul: 0, fogo: 0, roxo: 0, verde: 0, pingo: 0, cano: 0 };
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    const unidade = Math.max(2, Math.round(largura * PIXEL_DA_ARTE));
    const x = (u: number): number => Math.round((u + SOBRA.lados) * largura);
    const y = (v: number): number => Math.round((v + SOBRA.topo) * altura);

    for (const p of particulas) {
      const a = brilho(p);
      if (a <= 0) continue;
      const lado = unidade * p.tamanho;
      const px = x(p.u) - lado / 2;
      const py = y(p.v) - lado / 2;
      ctx.fillStyle = cor(p);
      // Um halo fraco em volta e o miolo cheio.
      ctx.globalAlpha = a * 0.3;
      ctx.fillRect(px - lado, py - lado, lado * 3, lado * 3);
      ctx.globalAlpha = a;
      ctx.fillRect(px, py, lado, lado);
    }
    desenharEstrela(ctx, x(ESTRELA.u), y(ESTRELA.v), unidade, agora / 1000);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };
  const ligar = (): void => {
    if (rodando) return;
    rodando = true;
    requestAnimationFrame(quadro);
  };
  return { palco, ligar };
}

// A estrela do pico: uma cruz de pixels que cresce e encolhe devagar e, a cada 5 s, dá um
// clarão com os braços compridos.
function desenharEstrela(ctx: CanvasRenderingContext2D, cx: number, cy: number, unidade: number, tempo: number): void {
  const ciclo = tempo % 5;
  const clarao = ciclo < 0.6 ? Math.sin((ciclo / 0.6) * Math.PI) : 0;
  const braco = Math.round((2 + Math.sin(tempo * 2.2) + clarao * 5) * unidade);
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, braco * 2.2);
  halo.addColorStop(0, `rgba(180, 140, 255, ${0.35 + 0.35 * clarao})`);
  halo.addColorStop(1, 'rgba(180, 140, 255, 0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = halo;
  ctx.fillRect(cx - braco * 2.2, cy - braco * 2.2, braco * 4.4, braco * 4.4);
  ctx.fillStyle = '#f4ecff';
  ctx.globalAlpha = 0.7 + 0.3 * clarao;
  const meio = Math.round(unidade / 2);
  ctx.fillRect(cx - meio, cy - braco, unidade, braco * 2);
  ctx.fillRect(cx - braco, cy - meio, braco * 2, unidade);
  ctx.globalAlpha = 1;
  ctx.fillRect(cx - unidade, cy - unidade, unidade * 2, unidade * 2);
}
