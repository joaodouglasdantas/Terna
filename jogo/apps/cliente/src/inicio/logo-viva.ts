// A logo da tela inicial, viva. É a logo do verão: o cristal amarelo no pico é o sol da
// estação. A logo flutua; atrás do cristal giram raios de sol e uma aura dourada respira (no
// CSS); um reflexo passa pelas letras de tempos em tempos. Por cima, cada parte da arte solta
// as suas partículas — poeira dourada subindo do cristal e brilhos de quatro pontas piscando
// nele, reflexos descendo a cachoeira, gotas e névoa onde ela cai, folhas em pixel caindo das
// duas árvores, vagalumes nas copas e terra se soltando da ilha flutuante.
// Tudo é medido em pixels da arte, para os efeitos parecerem parte dela.

import logoUrl from '../assets/logo.webp';
import { contexto2d } from '../motor/imagens';
import { elemento, imagemDaLogo } from './dom';
import {
  cair,
  desenharBrilho,
  desenharFolha,
  desenharHalo,
  folhaPronta,
  inclinacao,
  type Folha as DesenhoDeFolha,
  type Queda,
} from './efeitos';

// Pontos da arte (logo.webp, 1101×931) em frações da largura (u) e da altura (v).
const CRISTAL = { u: 0.5, v: 0.135 }; // o meio do cristal
const PONTA_DO_CRISTAL = { u: 0.5, v: 0.02 };
const AREA_DO_CRISTAL = { u: [0.465, 0.535], v: [0.03, 0.235] } as const;
// A cachoeira aparece em dois trechos: descendo do pico em degraus (atrás das letras ela some) e
// caindo de baixo da ilha. Cada trecho é uma linha de pontos, de cima para baixo.
const CACHOEIRA_DE_CIMA = [
  { u: 0.5, v: 0.3 },
  { u: 0.502, v: 0.34 },
  { u: 0.53, v: 0.38 },
  { u: 0.556, v: 0.45 },
  { u: 0.558, v: 0.49 },
];
const CACHOEIRA_DE_BAIXO = [
  { u: 0.518, v: 0.72 },
  { u: 0.522, v: 0.8 },
  { u: 0.521, v: 0.9 },
  { u: 0.522, v: 0.975 },
];
const PE_DA_CACHOEIRA = { u: 0.522, v: 0.975 };
// As copas das duas árvores e a parte de baixo da ilha.
const COPAS = [
  { u: [0.05, 0.26], v: [0.27, 0.45] },
  { u: [0.76, 0.96], v: [0.27, 0.44] },
] as const;
const FUNDO_DA_ILHA = { u: [0.2, 0.85], v: [0.8, 0.9] } as const;
const PIXEL_DA_ARTE = 10 / 1101; // um "pixel" da arte, em frações da largura

// Quanto o canvas passa da logo (as partículas saem dela), em frações da logo. Igual ao CSS de
// .inicio-logo-particulas.
const SOBRA = { lados: 0.1, topo: 0.25, baixo: 0.15 };

// Verdes das folhas que caem, tirados das copas da arte.
const VERDES = ['#1f4a1c', '#2f6a22', '#4b8425', '#7faf38'];

type Tipo = 'ouro' | 'brilho' | 'reflexo' | 'gota' | 'nevoa' | 'folha' | 'vagalume' | 'terra';

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
  // Só os reflexos: o trecho da cachoeira por onde descem.
  trecho?: readonly { u: number; v: number }[];
  // Só as folhas.
  queda?: Queda;
  desenho?: DesenhoDeFolha;
}

// Partículas por segundo de cada tipo.
const TAXA: Record<Tipo, number> = {
  ouro: 14,
  brilho: 3.5,
  reflexo: 5,
  gota: 7,
  nevoa: 2.5,
  folha: 1.1,
  vagalume: 1.4,
  terra: 2.5,
};

const OURO = ['#ffe9a0', '#ffd24a', '#fff6d6', '#ffb838'];

const sortear = (min: number, max: number): number => min + Math.random() * (max - min);
const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(Math.random() * lista.length)];
const entre = (faixa: readonly [number, number]): number => sortear(faixa[0], faixa[1]);

// O ponto da cachoeira na altura v (os trechos são linhas quebradas).
function naCachoeira(trecho: readonly { u: number; v: number }[], v: number): number {
  for (let i = 1; i < trecho.length; i++) {
    const [a, b] = [trecho[i - 1], trecho[i]];
    if (v <= b.v) return a.u + ((b.u - a.u) * (v - a.v)) / (b.v - a.v);
  }
  return trecho[trecho.length - 1].u;
}

function nascer(tipo: Tipo): Particula {
  const base = { tipo, vida: 0, fase: sortear(0, Math.PI * 2), tamanho: 1, vu: 0, vv: 0 };
  switch (tipo) {
    case 'ouro':
      // Poeira de sol: sai do cristal e sobe se abrindo, devagar.
      return {
        ...base,
        u: entre(AREA_DO_CRISTAL.u),
        v: entre(AREA_DO_CRISTAL.v),
        vu: sortear(-0.035, 0.035),
        vv: -sortear(0.03, 0.09),
        duracao: sortear(1.6, 3.2),
        tamanho: Math.random() < 0.3 ? 2 : 1,
      };
    case 'brilho': {
      // Brilhos de quatro pontas: quase todos no cristal, alguns na água.
      const naAgua = Math.random() < 0.3;
      const trecho = Math.random() < 0.5 ? CACHOEIRA_DE_CIMA : CACHOEIRA_DE_BAIXO;
      const v = naAgua ? sortear(trecho[0].v, trecho[trecho.length - 1].v) : entre(AREA_DO_CRISTAL.v);
      const u = naAgua ? naCachoeira(trecho, v) : entre(AREA_DO_CRISTAL.u);
      return { ...base, u, v, duracao: sortear(0.5, 0.9), tamanho: naAgua ? 1 : 2 };
    }
    case 'reflexo': {
      // Um fio de luz descendo a água.
      const trecho = Math.random() < 0.4 ? CACHOEIRA_DE_CIMA : CACHOEIRA_DE_BAIXO;
      const v = trecho[0].v;
      return { ...base, u: naCachoeira(trecho, v), v, vv: sortear(0.3, 0.42), duracao: 2, trecho };
    }
    case 'gota':
      return {
        ...base,
        u: PE_DA_CACHOEIRA.u + sortear(-0.008, 0.008),
        v: PE_DA_CACHOEIRA.v,
        vu: sortear(-0.03, 0.03),
        vv: sortear(0.02, 0.1),
        duracao: sortear(0.6, 1),
      };
    case 'nevoa':
      return {
        ...base,
        u: PE_DA_CACHOEIRA.u + sortear(-0.01, 0.01),
        v: PE_DA_CACHOEIRA.v + sortear(-0.01, 0.02),
        vu: sortear(-0.02, 0.02),
        vv: sortear(0.005, 0.03),
        duracao: sortear(1.2, 2),
      };
    case 'folha': {
      const copa = escolher(COPAS);
      return {
        ...base,
        u: 0,
        v: 0,
        duracao: sortear(2.4, 3.4),
        queda: {
          x: entre(copa.u),
          y: entre(copa.v),
          vento: -sortear(0.005, 0.02),
          descida: sortear(0.1, 0.16),
          balanco: sortear(0.01, 0.018),
          ritmo: sortear(2, 3),
          fase: sortear(0, Math.PI * 2),
          giro: sortear(0, Math.PI * 2),
          rodopio: Math.random() < 0.5 ? sortear(3, 6) : sortear(-0.5, 0.5),
          vida: 0,
        },
        desenho: folhaPronta(escolher(VERDES), Math.random() < 0.6 ? 'pequena' : 'media'),
      };
    }
    case 'vagalume': {
      const copa = escolher(COPAS);
      return { ...base, u: entre(copa.u), v: entre(copa.v) + 0.08, duracao: sortear(2, 3.6) };
    }
    case 'terra':
      return {
        ...base,
        u: entre(FUNDO_DA_ILHA.u),
        v: entre(FUNDO_DA_ILHA.v),
        vv: sortear(0.04, 0.08),
        duracao: sortear(0.8, 1.4),
      };
  }
}

function mover(p: Particula, dt: number): void {
  p.vida += dt;
  switch (p.tipo) {
    case 'folha':
      if (p.queda) {
        // Na queda, x anda em frações da largura e y em frações da altura.
        cair(p.queda, dt);
        p.u = p.queda.x;
        p.v = p.queda.y;
      }
      return;
    case 'reflexo':
      p.v += p.vv * dt;
      if (p.trecho) {
        p.u = naCachoeira(p.trecho, p.v);
        if (p.v > p.trecho[p.trecho.length - 1].v) p.vida = p.duracao; // chegou ao fim do trecho
      }
      return;
    case 'gota':
    case 'terra':
      p.vv += 0.5 * dt; // gravidade
      break;
    case 'vagalume':
      p.vu = Math.cos(p.vida * 1.4 + p.fase) * 0.02;
      p.vv = Math.sin(p.vida * 1.9 + p.fase) * 0.025;
      break;
    case 'ouro':
      p.vu += Math.sin(p.vida * 3 + p.fase) * 0.02 * dt; // ondula subindo
      break;
    default:
      break;
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
  const raios = elemento('div', 'inicio-logo-raios');
  const aura = elemento('div', 'inicio-logo-aura');
  // O brilho que passa usa a própria logo como máscara: só aparece em cima da arte.
  const reluz = elemento('div', 'inicio-logo-reluz');
  reluz.style.setProperty('--logo', `url("${logoUrl}")`);
  const canvas = elemento('canvas', 'inicio-logo-particulas');
  canvas.setAttribute('aria-hidden', 'true');
  palco.append(raios, aura, imagemDaLogo('inicio-logo'), reluz, canvas);

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return { palco, ligar: () => undefined };

  const ctx = contexto2d(canvas);
  let particulas: Particula[] = [];
  const devidas = Object.fromEntries(Object.keys(TAXA).map((t) => [t, 0])) as Record<Tipo, number>;
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
    const tempo = agora / 1000;

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

    // O calor do cristal: um halo dourado que pulsa por cima dele.
    ctx.globalCompositeOperation = 'lighter';
    const pulso = 0.5 + 0.5 * Math.sin(tempo * 2.1);
    desenharHalo(ctx, '#ffc93c', x(CRISTAL.u), y(CRISTAL.v), largura * (0.13 + 0.02 * pulso), 0.28 + 0.2 * pulso);
    desenharHalo(ctx, '#fff3c4', x(CRISTAL.u), y(CRISTAL.v), largura * 0.05, 0.25 + 0.2 * pulso);

    for (const p of particulas) {
      const a = alfa(p);
      if (a <= 0) continue;
      const px = x(p.u);
      const py = y(p.v);
      switch (p.tipo) {
        case 'ouro': {
          const pisca = 0.6 + 0.4 * Math.sin(p.vida * 8 + p.fase);
          const cor = OURO[Math.floor(p.fase * 10) % OURO.length];
          desenharHalo(ctx, cor, px, py, u * (2.2 + p.tamanho), a * pisca * 0.4);
          ctx.globalAlpha = a * pisca;
          ctx.fillStyle = cor;
          const lado = u * p.tamanho;
          ctx.fillRect(Math.round(px - lado / 2), Math.round(py - lado / 2), lado, lado);
          break;
        }
        case 'brilho': {
          const forca = Math.sin((p.vida / p.duracao) * Math.PI);
          desenharHalo(ctx, p.tamanho > 1 ? '#ffe28a' : '#bfefff', px, py, u * 3, forca * 0.5);
          desenharBrilho(ctx, px, py, u, forca * (p.tamanho > 1 ? 1 : 0.6), p.tamanho > 1 ? '#fff0b0' : '#e6fbff');
          break;
        }
        case 'reflexo': {
          // Um risco claro de três pixels, com a ponta de baixo mais forte.
          ctx.fillStyle = '#e8fbff';
          const rx = Math.round(px - u / 2);
          for (let i = 0; i < 3; i++) {
            ctx.globalAlpha = a * (0.35 + i * 0.25);
            ctx.fillRect(rx, Math.round(py + (i - 2) * u), u, u);
          }
          break;
        }
        case 'gota': {
          // Pingo de dois pixels de altura: a ponta clara em cima, o corpo azul.
          const gx = Math.round(px - u / 2);
          const gy = Math.round(py);
          ctx.globalAlpha = a;
          ctx.fillStyle = '#5ec4ff';
          ctx.fillRect(gx, gy + u, u, u);
          ctx.fillStyle = '#e4f7ff';
          ctx.fillRect(gx, gy, u, u);
          break;
        }
        case 'nevoa': {
          const t = p.vida / p.duracao;
          desenharHalo(ctx, '#d8f2ff', px, py, u * (3 + t * 7), a * 0.22);
          break;
        }
        case 'vagalume': {
          const acende = Math.max(0, Math.sin(p.vida * 3.2 + p.fase)) ** 2;
          desenharHalo(ctx, '#c8f25a', px, py, u * 4, a * acende * 0.5);
          ctx.globalAlpha = a * (0.25 + 0.75 * acende);
          ctx.fillStyle = '#f7ffd0';
          ctx.fillRect(Math.round(px - u / 2), Math.round(py - u / 2), u, u);
          break;
        }
        default:
          break;
      }
    }

    // Folhas e terra têm cor própria: sem somar luz.
    ctx.globalCompositeOperation = 'source-over';
    for (const p of particulas) {
      const a = alfa(p);
      if (a <= 0) continue;
      if (p.tipo === 'folha' && p.queda && p.desenho) {
        desenharFolha(ctx, p.desenho, x(p.u), y(p.v), u * 0.9, inclinacao(p.queda), p.queda.giro, a);
      } else if (p.tipo === 'terra') {
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = p.fase > Math.PI ? '#5a3a20' : '#3c3a36';
        ctx.fillRect(Math.round(x(p.u) - u / 2), Math.round(y(p.v)), u, u);
      }
    }

    desenharPontaDoCristal(ctx, x(PONTA_DO_CRISTAL.u), y(PONTA_DO_CRISTAL.v), u, tempo);
    ctx.globalAlpha = 1;
  };
  const ligar = (): void => {
    if (rodando) return;
    rodando = true;
    requestAnimationFrame(quadro);
  };
  return { palco, ligar };
}

// A ponta do cristal: um brilho em cruz que respira e, a cada 5 s, dá um clarão de sol com os
// braços compridos.
function desenharPontaDoCristal(ctx: CanvasRenderingContext2D, cx: number, cy: number, u: number, tempo: number): void {
  const ciclo = tempo % 5;
  const clarao = ciclo < 0.7 ? Math.sin((ciclo / 0.7) * Math.PI) : 0;
  ctx.globalCompositeOperation = 'lighter';
  desenharHalo(ctx, '#ffd86a', cx, cy, u * (5 + clarao * 10), 0.35 + 0.5 * clarao);
  ctx.globalCompositeOperation = 'source-over';
  const braco = Math.round((2 + Math.sin(tempo * 2.2) + clarao * 6) * u);
  const meio = Math.round(u / 2);
  ctx.fillStyle = '#fff8dc';
  ctx.globalAlpha = 0.55 + 0.45 * clarao;
  ctx.fillRect(Math.round(cx) - meio, Math.round(cy) - braco, u, braco * 2);
  ctx.fillRect(Math.round(cx) - braco, Math.round(cy) - meio, braco * 2, u);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.round(cx) - u, Math.round(cy) - u, u * 2, u * 2);
}
