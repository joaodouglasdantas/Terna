// Minhocas dentro da terra, em coordenadas do mapa. Cada uma sai de um buraco na parede de
// terra (o corpo vai aparecendo a partir dele), rasteja devagar quase na horizontal, sobe e
// desce um pouco, dá meia-volta de vez em quando e ondula o corpo; depois de um tempo entra
// de novo na parede por outro buraco e, mais tarde, sai por um buraco novo em outro lugar
// do mapa: é assim que elas "renascem". Ficam mais
// escuras quanto mais fundo estão, como a terra em volta, só que menos (fatorTerra, em
// chao.ts), para continuarem à vista.

import { MUNDO } from '@terna/compartilhado';
import { sortear } from '../motor/matematica';
import { ESPESSURA_GRAMA, fatorTerra } from './chao';

const MINHOCAS = {
  quantidade: 8,
  comprimento: [6, 9] as const, // pixels de corpo
  velocidade: [2, 4] as const,
  inclinacao: 0.45, // no máximo sobe/desce isto por pixel andado
  meiaVolta: [8, 20] as const, // segundos entre uma meia-volta e outra
  ondulacao: 6, // velocidade da onda que corre pelo corpo
  margem: 6, // não chega mais perto que isto da grama e do fundo da tela
  passeio: [10, 25] as const, // segundos andando fora da parede até entrar de novo
  dentro: [3, 8] as const, // segundos dentro da parede até sair por outro buraco
  buraco: '#140b06',
  bordaBuraco: '#a8764c', // terra remexida em volta do buraco, para ele não parecer uma mancha
  buracoFica: 1.2, // o buraco continua à vista este tempo depois que ela acaba de sair ou entrar
  cabeca: '#f2b4ac',
  corpo: ['#e8948e', '#c87470'], // o corpo alterna as duas a cada 2px, como anéis
};

type Pixel = [number, number];

interface Minhoca {
  x: number;
  y: number;
  fase: number;
  direcao: number;
  inclinacao: number;
  velocidade: number;
  comprimento: number;
  corpo: Pixel[]; // pixels inteiros, da cabeça para o rabo
  estado: 'saindo' | 'andando' | 'entrando' | 'dentro';
  buraco: { x: number; y: number; tempo: number } | null;
  passeio: number;
  meiaVolta: number;
  andou: number;
  espera: number;
}

let minhocas: Minhoca[] = [];
let terraMinhocas = { topo: 0, altura: 0 };

// `yChao` é a linha do chão e `alturaChao` a altura da faixa de chão até a base da tela.
export function prepararMinhocas(yChao: number, alturaChao: number): void {
  terraMinhocas = { topo: yChao + ESPESSURA_GRAMA, altura: alturaChao - ESPESSURA_GRAMA };
  const faixa = terraMinhocas.altura - 2 * MINHOCAS.margem;
  // Metade já começa fora da parede, andando; a outra metade sai dela logo no começo.
  minhocas = Array.from({ length: MINHOCAS.quantidade }, (_, i) => {
    const x = ((i + 0.2 + Math.random() * 0.6) * MUNDO) / MINHOCAS.quantidade;
    const y = terraMinhocas.topo + MINHOCAS.margem + Math.random() * faixa;
    const m = sairDaParede({ fase: Math.random() * 10, andou: 0, espera: 0 }, x, y);
    if (i % 2 === 0) {
      m.corpo = Array.from({ length: m.comprimento }, (_, k): Pixel => [Math.round(x) - m.direcao * k, Math.round(y)]);
      m.estado = 'andando';
      m.buraco = null;
    }
    return m;
  });
}

// A minhoca começa a sair da parede por um buraco em (x, y): o corpo tem só a cabeça, no
// buraco, e vai crescendo conforme ela anda.
function sairDaParede(m: Pick<Minhoca, 'fase' | 'andou' | 'espera'> & Partial<Minhoca>, x: number, y: number): Minhoca {
  return Object.assign(m, {
    x,
    y,
    direcao: Math.random() < 0.5 ? 1 : -1,
    inclinacao: 0,
    velocidade: sortear(MINHOCAS.velocidade),
    comprimento: Math.round(sortear(MINHOCAS.comprimento)),
    corpo: [[Math.round(x), Math.round(y)]], // pixels inteiros, da cabeça para o rabo
    estado: 'saindo' as const,
    buraco: { x: Math.round(x), y: Math.round(y), tempo: 0 },
    passeio: sortear(MINHOCAS.passeio),
    meiaVolta: sortear(MINHOCAS.meiaVolta),
  });
}

// Um lugar qualquer da faixa de terra para um buraco novo.
function lugarNaTerra(): [number, number] {
  const faixa = terraMinhocas.altura - 2 * MINHOCAS.margem;
  return [10 + Math.random() * (MUNDO - 20), terraMinhocas.topo + MINHOCAS.margem + Math.random() * faixa];
}

export function atualizarMinhocas(dt: number): void {
  const cima = terraMinhocas.topo + MINHOCAS.margem;
  const baixo = terraMinhocas.topo + terraMinhocas.altura - MINHOCAS.margem;
  minhocas.forEach((m) => {
    m.fase += dt * MINHOCAS.ondulacao;
    if (m.buraco) m.buraco.tempo += dt;

    if (m.estado === 'dentro') {
      m.espera -= dt;
      if (m.espera <= 0) sairDaParede(m, ...lugarNaTerra());
      return;
    }
    if (m.estado === 'entrando') {
      // A cabeça fica parada no buraco e o resto do corpo vai entrando atrás dela.
      m.andou += m.velocidade * dt;
      while (m.andou >= 1 && m.corpo.length) {
        m.corpo.pop();
        m.andou -= 1;
      }
      if (!m.corpo.length) {
        m.estado = 'dentro';
        m.espera = sortear(MINHOCAS.dentro);
        if (m.buraco) m.buraco.tempo = 0;
      }
      return;
    }
    m.passeio -= dt;
    if (m.estado === 'andando' && m.passeio <= 0) {
      m.estado = 'entrando';
      m.andou = 0;
      m.buraco = { x: m.corpo[0][0], y: m.corpo[0][1], tempo: 0 };
      return;
    }

    m.meiaVolta -= dt;
    // Meia-volta: o rabo vira a cabeça.
    const podeVirar = m.estado === 'andando'; // saindo, o rabo ainda está na parede
    if (podeVirar && (m.meiaVolta <= 0 || m.x < 4 || m.x > MUNDO - 4)) {
      m.corpo.reverse();
      [m.x, m.y] = m.corpo[0];
      m.direcao = -m.direcao;
      m.meiaVolta = sortear(MINHOCAS.meiaVolta);
    }
    m.inclinacao += (Math.random() - 0.5) * 2 * dt;
    m.inclinacao = Math.max(-MINHOCAS.inclinacao, Math.min(MINHOCAS.inclinacao, m.inclinacao));
    if (m.y < cima) m.inclinacao = Math.abs(m.inclinacao) || 0.2;
    if (m.y > baixo) m.inclinacao = -Math.abs(m.inclinacao) || -0.2;
    m.x += m.direcao * m.velocidade * dt;
    m.y += m.inclinacao * m.velocidade * dt;
    // O corpo segue o caminho da cabeça, um pixel por vez.
    const cabeca: Pixel = [Math.round(m.x), Math.round(m.y)];
    const [cx, cy] = m.corpo[0];
    if (cabeca[0] !== cx || cabeca[1] !== cy) {
      m.corpo.unshift(cabeca);
      // Saindo, o corpo cresce até o tamanho todo; depois só acompanha a cabeça.
      if (m.corpo.length > m.comprimento) m.corpo.pop();
      if (m.estado === 'saindo' && m.corpo.length >= m.comprimento) {
        m.estado = 'andando';
        if (m.buraco) m.buraco.tempo = 0;
      }
    }
  });
}

// Cor escurecida pela profundidade, guardada por degrau para não recalcular a cada quadro.
const coresMinhoca = new Map<string, string>();
function corNaTerra(cor: string, y: number): string {
  const fator = Math.round(fatorTerra(y - terraMinhocas.topo, terraMinhocas.altura, true) * 20) / 20;
  const chave = cor + fator;
  if (!coresMinhoca.has(chave)) {
    const [r, g, b] = [1, 3, 5].map((i) => Math.round(parseInt(cor.slice(i, i + 2), 16) * fator));
    coresMinhoca.set(chave, `rgb(${r}, ${g}, ${b})`);
  }
  return coresMinhoca.get(chave) as string;
}

// Desenhada logo depois do chão, em coordenadas do mapa (o chamador já transladou pela
// câmera). A onda que corre do rabo à cabeça desloca cada pixel do corpo 1px para cima ou
// para baixo. O buraco por onde ela sai ou entra fica à vista um pouco, embaixo do corpo.
export function desenharMinhocas(ctx: CanvasRenderingContext2D, camX: number, largura: number): void {
  minhocas.forEach((m) => {
    if (m.x < camX - 20 || m.x > camX + largura + 20) return;
    const { buraco } = m;
    const buracoAberto = buraco !== null && (m.estado === 'saindo' || m.estado === 'entrando' || buraco.tempo < MINHOCAS.buracoFica);
    if (buracoAberto) {
      ctx.fillStyle = corNaTerra(MINHOCAS.bordaBuraco, buraco.y);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => ctx.fillRect(buraco.x + dx, buraco.y + dy, 1, 1));
      ctx.fillStyle = MINHOCAS.buraco;
      ctx.fillRect(buraco.x - 1, buraco.y, 3, 1);
      ctx.fillRect(buraco.x, buraco.y - 1, 1, 3);
    }
    m.corpo.forEach(([x, y], i) => {
      const onda = i === 0 ? 0 : Math.round(0.9 * Math.sin(m.fase - i * 1.1));
      const cor = i === 0 ? MINHOCAS.cabeca : MINHOCAS.corpo[Math.floor(i / 2) % 2];
      ctx.fillStyle = corNaTerra(cor, y + onda);
      ctx.fillRect(x, y + onda, 1, 1);
    });
  });
}
