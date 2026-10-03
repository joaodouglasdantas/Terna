// A Leslie e o Grow na tela inicial: sentados de costas na grama, na beira do barranco, vendo o
// pôr do sol (cena.ts os desenha por cima da arte do fundo, só na tela inicial). De vez em quando
// um vira a cabeça para o outro e fala (um balãozinho com reticências que vão aparecendo); às vezes o outro vira também e responde; depois os dois voltam a olhar o
// sol. Os quadros (de costas, virado para a esquerda e para a direita) e a contraluz do sol estão
// prontos em assets/conversa.png (ferramentas/gerar-conversa.py).

import urlConversa from '../assets/conversa.png';
import { carregarDecodificada, umaVez } from '../motor/imagens';

// Os quadros de assets/conversa.png: faixas de 32×32, nesta ordem.
const QUADRO = 32;
const ORDEM = ['grow-costas', 'grow-esquerda', 'grow-direita', 'leslie-costas', 'leslie-esquerda', 'leslie-direita'] as const;
type Jeito = 'costas' | 'esquerda' | 'direita';

// Onde cada um senta (fração do quadro: o meio do corpo e a grama embaixo dele) e para que lado
// fica o outro.
const LUGARES = {
  leslie: { x: 0.65, y: 0.888, outro: 'direita' as const },
  grow: { x: 0.699, y: 0.888, outro: 'esquerda' as const },
};
type Quem = keyof typeof LUGARES;

// Os passos da conversa: quem está virado para o outro, quem fala e por quanto tempo.
interface Passo {
  virados: Quem[];
  fala?: Quem;
  dura: number; // segundos
}

const sortear = (min: number, max: number): number => min + Math.random() * (max - min);

// Uma conversa nova: olham o sol um tempo; um vira e fala; às vezes o outro vira e responde; os
// dois se olham um instante e voltam para o sol.
function novaConversa(): Passo[] {
  const a: Quem = Math.random() < 0.5 ? 'leslie' : 'grow';
  const b: Quem = a === 'leslie' ? 'grow' : 'leslie';
  const passos: Passo[] = [{ virados: [], dura: sortear(4, 8) }, { virados: [a], dura: 0.6 }, { virados: [a], fala: a, dura: sortear(2, 3) }];
  if (Math.random() < 0.7) {
    passos.push({ virados: [a, b], dura: 0.5 }, { virados: [a, b], fala: b, dura: sortear(1.8, 2.8) }, { virados: [a, b], dura: 0.9 }, { virados: [a], dura: 0.4 });
  } else {
    passos.push({ virados: [a], dura: 0.8 });
  }
  return passos;
}

export const carregarConversa = umaVez(() => carregarDecodificada(urlConversa));

let folha: HTMLImageElement | null = null;
let passos: Passo[] = novaConversa();
let noPasso = 0;
let tempoNoPasso = 0;
let visivel = 0; // 0 a 1: aparece e some devagar com a tela inicial

// Anda a conversa. `naTela`: a tela inicial está aberta (nas outras telas do menu eles somem).
export function atualizarConversa(dt: number, naTela: boolean): void {
  if (!folha) {
    void carregarConversa().then((img) => (folha = img), () => undefined);
    return;
  }
  visivel = Math.max(0, Math.min(1, visivel + (naTela ? dt : -dt) * 2.5));
  tempoNoPasso += dt;
  while (tempoNoPasso >= passos[noPasso].dura) {
    tempoNoPasso -= passos[noPasso].dura;
    noPasso++;
    if (noPasso >= passos.length) {
      passos = novaConversa();
      noPasso = 0;
    }
  }
}

// Desenha os dois na tela da cena (`largura` × `altura`, o quadro da arte).
export function desenharConversa(c: CanvasRenderingContext2D, largura: number, altura: number): void {
  if (!folha || visivel <= 0) return;
  const passo = passos[noPasso];
  // Um pixel do desenho: grande o bastante para eles ficarem do tamanho de gente perto da tocha e do
  // baú do cenário (sentados, mais altos que a tocha).
  const u = Math.max(2, Math.round(altura / 225));
  c.save();
  c.imageSmoothingEnabled = false;
  c.globalAlpha = visivel;
  for (const quem of ['leslie', 'grow'] as const) {
    const lugar = LUGARES[quem];
    const jeito: Jeito = passo.virados.includes(quem) ? lugar.outro : 'costas';
    const i = ORDEM.indexOf(`${quem}-${jeito}`);
    const x = Math.round(lugar.x * largura - (QUADRO * u) / 2);
    const chao = Math.round(lugar.y * altura);
    const falando = passo.fala === quem;
    // A sombra na grama.
    c.globalAlpha = visivel * 0.35;
    c.fillStyle = '#0d0a14';
    c.beginPath();
    c.ellipse(lugar.x * largura, chao - u, 8 * u, 2 * u, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = visivel;
    c.drawImage(folha, i * QUADRO, 0, QUADRO, QUADRO, x, chao - QUADRO * u, QUADRO * u, QUADRO * u);
    if (falando) desenharBalao(c, lugar.x * largura + (lugar.outro === 'direita' ? 4 : -4) * u, chao - 34 * u, u, tempoNoPasso);
  }
  c.restore();
}

// O balãozinho com reticências que vão aparecendo, uma por vez.
function desenharBalao(c: CanvasRenderingContext2D, x: number, y: number, u: number, tempo: number): void {
  const w = 11;
  const h = 6;
  const x0 = Math.round(x - (w * u) / 2);
  const y0 = Math.round(y - h * u);
  c.fillStyle = '#1a1020';
  c.fillRect(x0 + u, y0 - u, (w - 2) * u, u);
  c.fillRect(x0 + u, y0 + h * u, (w - 2) * u, u);
  c.fillRect(x0 - u + u, y0, u, h * u);
  c.fillRect(x0 + (w - 1) * u, y0, u, h * u);
  c.fillStyle = '#fff4e2';
  c.fillRect(x0 + u, y0, (w - 2) * u, h * u);
  // A pontinha, apontando para quem fala.
  c.fillStyle = '#1a1020';
  c.fillRect(x0 + 4 * u, y0 + (h + 1) * u, 2 * u, u);
  c.fillStyle = '#fff4e2';
  c.fillRect(x0 + 4 * u, y0 + h * u, 2 * u, u);
  // As reticências: uma, duas, três, e de novo.
  const pontos = 1 + (Math.floor(tempo * 3) % 3);
  c.fillStyle = '#6a4a3a';
  for (let k = 0; k < pontos; k++) c.fillRect(x0 + (2 + k * 3) * u, y0 + 2 * u, 2 * u, 2 * u);
}
