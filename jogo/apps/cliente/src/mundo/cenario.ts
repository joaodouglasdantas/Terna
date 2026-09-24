// Os recortes vêm de assets/cenario.png, gerado a partir de fontes/ por
// ferramentas/gerar-cenario.cjs. Os índices abaixo apontam para QUADROS_CENARIO.

import { MUNDO } from '@terna/compartilhado';
import urlCenario from '../assets/cenario.png';
import { QUADROS_CENARIO } from '../gerado/cenario-quadros';
import { carregarImagem, contexto2d, criarSprite, desenharQuadro, novoCanvas, reduzirSprite } from '../motor/imagens';
import { sortear, suavizar } from '../motor/matematica';
import type { Luz, Paleta, Recorte } from '../motor/tipos';

// Quanto cada camada anda quando a câmera anda 1px: as distantes andam menos (paralaxe).
// A paisagem anda o suficiente para suas bordas coincidirem com as bordas do mapa.
const PARALAXE = {
  nuvens: 0.3,
  arvoresFundo: 0.85,
};

// Pássaro de perfil, virado para a direita: rabo levantado (T), corpo (B), cabeça (H), olho (E),
// bico (Y), barriga (L) e asa (W, ponta clara w) em três posições do bater de asas.
// O corpo ocupa as mesmas linhas nos três quadros; só a asa muda.
const QUADROS_PASSARO: Record<'cima' | 'meio' | 'baixo', string[]> = {
  cima: [
    '....ww......',
    '....wWW.....',
    '.....WWW....',
    '......WW.HH.',
    'T....BBBHHEY',
    'TTBBBBBBBH..',
    '...LLLLLL...',
    '............',
  ],
  meio: [
    '............',
    '............',
    '............',
    '..wwwWWW.HH.',
    'T..WWWWBHHEY',
    'TTBBBBBBBH..',
    '...LLLLLL...',
    '............',
  ],
  baixo: [
    '............',
    '............',
    '............',
    '.........HH.',
    'T....BBBHHEY',
    'TTBBBWWBBH..',
    '...LWWWLL...',
    '....wwW.....',
  ],
};

// Espécies (cores) de pássaro. Um bando é sempre todo da mesma cor.
export const CORES_PASSARO: Paleta[] = [
  // azulado
  { T: '#2a3346', W: '#33405a', w: '#6a7a96', B: '#4a5a76', H: '#4a5a76', E: '#11151f', L: '#c3ccd9', Y: '#e2a33b' },
  // pardal
  { T: '#3f2c1f', W: '#4f3826', w: '#9c7b55', B: '#7a5a3e', H: '#6b4c34', E: '#11151f', L: '#dccaa8', Y: '#d9a45a' },
  // cardeal
  { T: '#5e1616', W: '#7a1f1f', w: '#c2503e', B: '#ad2d25', H: '#bf3528', E: '#11151f', L: '#e3a38e', Y: '#f0b040' },
  // pintassilgo: amarelo com asas e cauda pretas, para não sumir na copa do ipê
  { T: '#1c1c22', W: '#1c1c22', w: '#e8e4d8', B: '#f0cf1e', H: '#f0cf1e', E: '#11151f', L: '#f6e27a', Y: '#e08a2b' },
  // melro, com o olho amarelo
  { T: '#121217', W: '#1d1d25', w: '#4d4d5c', B: '#2a2a34', H: '#2a2a34', E: '#f0c040', L: '#4a4a58', Y: '#f0a020' },
];

// Distâncias dos bandos: os de longe são menores, voam mais devagar, andam menos com a
// câmera e passam por trás das nuvens. O de perto usa o sprite no tamanho original.
const NIVEIS_PASSARO = [
  { escala: 1, paralaxe: 0.6, ritmo: 1, atrasDasNuvens: false },
  { escala: 0.75, paralaxe: 0.45, ritmo: 0.8, atrasDasNuvens: false },
  { escala: 0.5, paralaxe: 0.3, ritmo: 0.65, atrasDasNuvens: true },
];

// Sequência do bater de asas em cada distância e cor: cima, meio, baixo, meio.
// BATER_ASAS[nivel][cor][quadro].
export const BATER_ASAS: HTMLCanvasElement[][][] = NIVEIS_PASSARO.map(({ escala }) =>
  CORES_PASSARO.map((paleta) => {
    const s = {
      cima: criarSprite(QUADROS_PASSARO.cima, paleta),
      meio: criarSprite(QUADROS_PASSARO.meio, paleta),
      baixo: criarSprite(QUADROS_PASSARO.baixo, paleta),
    };
    return [s.cima, s.meio, s.baixo, s.meio].map((sprite) => reduzirSprite(sprite, escala));
  }),
);

// Intervalos [mín, máx] sorteados a cada bando; tempos em segundos, velocidade em px/s
// (a do bando de perto; os de longe multiplicam pelo `ritmo` do nível).
export const PASSAROS = {
  primeiro: 6, // espera até o primeiro bando
  intervalo: [25, 55] as const, // espera entre um bando sair da tela e o próximo aparecer
  quantidade: [1, 4] as const,
  altura: [14, 78] as const,
  velocidade: [18, 28] as const,
  quadroAsa: 0.09,
  batendo: 1.3, // bate as asas por este tempo e depois plana até completar o ciclo
  ciclo: 2.4,
};

// O sol cruza o céu em arco, em coordenadas de tela: está tão longe que não anda quando a
// câmera anda. Vai de `deX` a `ateX`, com as pontas em `horizonte` e subindo `altura` no
// meio. Fora das frações `visivel` do caminho ele está abaixo de y=140, mais baixo que o
// ponto mais baixo do contorno das montanhas (y≈130), então fica escondido com a câmera em
// qualquer lugar do mapa. O trecho visível leva quase toda a `duracao`; o escondido — do
// poente à direita até nascer de novo à esquerda — passa em `escondido` da duração.
const SOL = {
  deX: -20,
  ateX: 500,
  horizonte: 170,
  altura: 140,
  duracao: 3600, // segundos para atravessar: uma hora, ~0,14px por segundo
  visivel: [0.07, 0.93] as const,
  escondido: 0.03,
  inicio: 0.3, // fração do tempo já andada quando o jogo abre (meio da manhã)
  raioBrilho: 26,
  periodoBrilho: 6, // o brilho respira devagar, sem mudar o disco
};

// `velocidade` em pixels por segundo, para a esquerda; as menores (mais longe) andam mais devagar.
const NUVENS = [
  { indice: 0, x: 20, y: 30, velocidade: 4 },
  { indice: 2, x: 190, y: 8, velocidade: 6 },
  { indice: 4, x: 330, y: 58, velocidade: 2.5 },
  { indice: 7, x: 90, y: 72, velocidade: 3 },
  { indice: 9, x: 400, y: 22, velocidade: 5 },
];

// Árvores da folha, por índice: 0–2 carvalhos altos, 3–9 pinheiros, 10–14 e 20–21 carvalhos,
// 15 cerejeira, 16 ipê amarelo, 17–19 pinheiros. Arbustos: 0–7 moitas, 8–15 folhagens soltas.
// `x` é o centro do sprite, em pixels do mapa (ou da camada, na fileira de trás).
export interface PlantaNoMapa {
  indice: number;
  x: number;
}
type GrupoPlantas = 'arvores' | 'arbustos';

// Fileira de trás: mais apagada pela névoa, com a base escondida atrás da grama. Anda com
// PARALAXE.arvoresFundo, então a camada tem 480 + (MUNDO - 480) * 0,85 = 1296px.
const ARVORES_FUNDO: PlantaNoMapa[] = [
  { indice: 6, x: 76 },
  { indice: 13, x: 168 },
  { indice: 3, x: 250 },
  { indice: 21, x: 328 },
  { indice: 5, x: 386 },
  { indice: 14, x: 458 },
  { indice: 12, x: 540 },
  { indice: 4, x: 610 },
  { indice: 7, x: 680 },
  { indice: 20, x: 760 },
  { indice: 3, x: 830 },
  { indice: 10, x: 905 },
  { indice: 5, x: 975 },
  { indice: 21, x: 1050 },
  { indice: 6, x: 1120 },
  { indice: 14, x: 1190 },
  { indice: 4, x: 1262 },
];

export const ARVORES_CHAO: PlantaNoMapa[] = [
  { indice: 0, x: 28 },
  { indice: 15, x: 124 },
  { indice: 9, x: 204 },
  { indice: 19, x: 234 },
  { indice: 16, x: 296 },
  { indice: 17, x: 356 },
  { indice: 11, x: 418 },
  { indice: 2, x: 508 },
  { indice: 7, x: 580 },
  { indice: 18, x: 614 },
  { indice: 10, x: 690 },
  { indice: 12, x: 772 },
  { indice: 6, x: 846 },
  { indice: 8, x: 874 },
  { indice: 1, x: 940 },
  { indice: 15, x: 1016 },
  { indice: 9, x: 1090 },
  { indice: 20, x: 1170 },
  { indice: 17, x: 1236 },
  { indice: 19, x: 1262 },
  { indice: 11, x: 1320 },
  { indice: 16, x: 1400 },
];

const ARBUSTOS_CHAO: PlantaNoMapa[] = [
  { indice: 0, x: 72 },
  { indice: 8, x: 98 },
  { indice: 1, x: 162 },
  { indice: 10, x: 180 },
  { indice: 3, x: 262 },
  { indice: 12, x: 276 },
  { indice: 5, x: 326 },
  { indice: 9, x: 382 },
  { indice: 2, x: 458 },
  { indice: 14, x: 474 },
  { indice: 4, x: 548 },
  { indice: 11, x: 600 },
  { indice: 6, x: 650 },
  { indice: 0, x: 720 },
  { indice: 13, x: 735 },
  { indice: 7, x: 806 },
  { indice: 3, x: 900 },
  { indice: 10, x: 918 },
  { indice: 1, x: 990 },
  { indice: 5, x: 1060 },
  { indice: 9, x: 1130 },
  { indice: 2, x: 1200 },
  { indice: 12, x: 1215 },
  { indice: 6, x: 1290 },
  { indice: 4, x: 1360 },
  { indice: 8, x: 1430 },
];

// O quanto cada planta verga (e as altas vergam mais) já vem nos quadros de vento da folha;
// aqui só se escolhe o quadro, de 0 (repouso) ao último (curvatura máxima).
const VENTO = {
  periodo: 5, // segundos de uma ida e volta da copa
  periodoRajada: 13, // a força do vento cresce e diminui devagar
  onda: 180, // pixels entre duas plantas que vergam juntas: a rajada atravessa a fileira
  fundo: 0.6, // a fileira de trás verga menos
};

// Intensidades máximas (alfa) da luz do sol sobre a cena; tudo bem suave.
const LUZ = {
  lateral: 0.22, // lado das plantas virado para o sol clareia, o outro escurece
  topo: 0.12, // copa clareia por cima quando o sol está alto
  base: 0.18, // pé das plantas mais escuro (luz que não chega embaixo)
  nevoa: 'rgba(56, 96, 110, 0.32)', // véu azulado das árvores de trás
  sombra: 0.34, // sombra no chão, embaixo de plantas e do personagem
  calor: 0.3, // brilho quente em volta do sol, espalhado na cena
  ladoEscuro: 0.12, // o lado da tela longe do sol fica um pouco mais escuro
  entardecer: 0.22, // tom alaranjado quando o sol está baixo
};

export function carregarFolhaCenario(): Promise<HTMLImageElement> {
  return carregarImagem(urlCenario);
}

// Quanto a paisagem desliza com a câmera em `camX`, em pixels inteiros.
function deslocamentoPaisagem(camX: number, largura: number): number {
  return Math.round((camX * (QUADROS_CENARIO.paisagem.w - largura)) / (MUNDO - largura));
}

// Onde o sol está na tela e quanto ele ilumina. `elevacao` vai de 0 (horizonte) a 1 (alto
// do arco), `lado` de -1 (sol na esquerda) a 1 (na direita) e `forca` apaga a luz perto do
// horizonte, antes de o sol sumir atrás do terreno.
export function luzDoSol(tempo: number, largura: number): Luz {
  const u = (tempo / SOL.duracao + SOL.inicio) % 1;
  const [nasce, poe] = SOL.visivel;
  const andando = 1 - SOL.escondido;
  const s = u < andando ? nasce + ((poe - nasce) * u) / andando : (poe + ((1 - poe + nasce) * (u - andando)) / SOL.escondido) % 1;
  const elevacao = Math.sin(Math.PI * s);
  const x = SOL.deX + (SOL.ateX - SOL.deX) * s;
  return {
    x,
    y: SOL.horizonte - SOL.altura * elevacao,
    elevacao,
    lado: Math.max(-1, Math.min(1, (x - largura / 2) / (largura / 2))),
    forca: suavizar(0.22, 0.6, elevacao),
  };
}

// Brilho em degradê radial liso atrás do disco; os dois ficam entre o céu e a paisagem,
// então o sol nasce e se põe por trás das montanhas.
function desenharSol(ctx: CanvasRenderingContext2D, folha: CanvasImageSource, luz: Luz, tempo: number): void {
  const raio = SOL.raioBrilho * (1 + 0.05 * Math.sin((2 * Math.PI * tempo) / SOL.periodoBrilho));
  const f = luz.forca;
  const brilho = ctx.createRadialGradient(luz.x, luz.y, 0, luz.x, luz.y, raio);
  brilho.addColorStop(0, `rgba(255, 248, 210, ${0.8 * f})`);
  brilho.addColorStop(0.3, `rgba(255, 240, 180, ${0.42 * f})`);
  brilho.addColorStop(0.6, `rgba(255, 232, 160, ${0.14 * f})`);
  brilho.addColorStop(1, 'rgba(255, 232, 160, 0)');
  ctx.fillStyle = brilho;
  ctx.fillRect(luz.x - raio, luz.y - raio, raio * 2, raio * 2);

  // O disco anda uma fração de pixel por segundo: desenhado em posição fracionária e com
  // suavização, ele desliza em vez de pular 1px de vez em quando.
  const q = QUADROS_CENARIO.sol;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  desenharQuadro(ctx, folha, q, luz.x - q.w / 2, luz.y - q.h / 2);
  ctx.restore();
}

// Posição calculada direto do tempo e da câmera: a nuvem sai por um lado e volta pelo outro.
function desenharNuvens(ctx: CanvasRenderingContext2D, folha: CanvasImageSource, tempo: number, camX: number, largura: number): void {
  NUVENS.forEach(({ indice, x, y, velocidade }) => {
    const q = QUADROS_CENARIO.nuvens[indice];
    const volta = largura + q.w;
    const andou = x - velocidade * tempo - camX * PARALAXE.nuvens;
    const deslocado = (((andou + q.w) % volta) + volta) % volta;
    desenharQuadro(ctx, folha, q, Math.round(deslocado - q.w), y);
  });
}

// Cada pássaro guarda `x` na camada do seu nível; na tela ele fica em x - camX * paralaxe.
interface PassaroDeFundo {
  nivel: number;
  cor: number;
  x: number;
  y: number;
  vx: number;
  tempo: number;
}

let passaros: PassaroDeFundo[] = [];
let esperaBando = PASSAROS.primeiro;

const naTela = (p: PassaroDeFundo, camX: number): number => p.x - camX * NIVEIS_PASSARO[p.nivel].paralaxe;

// Solta um bando em V entrando por um dos lados da tela, numa distância sorteada; os
// seguidores vêm atrás e alternam acima/abaixo. Cada fileira recua um passo fixo maior que
// o sprite, e o sorteio só varia um pouco dentro dele: dois pássaros nunca se sobrepõem.
function soltarBando(largura: number, camEsquerda: number, camDireita: number): void {
  const nivel = Math.floor(Math.random() * NIVEIS_PASSARO.length);
  const { escala, paralaxe, ritmo } = NIVEIS_PASSARO[nivel];
  const direcao = Math.random() < 0.5 ? 1 : -1;
  // Com a tela dividida, quem entra pela esquerda entra na metade da esquerda e quem entra pela
  // direita, na da direita.
  const camX = direcao === 1 ? camEsquerda : camDireita;
  const velocidade = sortear(PASSAROS.velocidade) * ritmo;
  const yLider = sortear(PASSAROS.altura);
  const largo = BATER_ASAS[nivel][0][0].width;
  const cor = Math.floor(Math.random() * CORES_PASSARO.length);
  const xLider = (direcao === 1 ? -largo : largura) + camX * paralaxe;
  const quantidade = Math.round(sortear(PASSAROS.quantidade));
  for (let i = 0; i < quantidade; i++) {
    const fileira = Math.ceil(i / 2);
    passaros.push({
      nivel,
      cor,
      x: xLider - direcao * fileira * (largo + (3 + Math.random() * 2) * escala),
      y: yLider + (i % 2 ? -1 : 1) * fileira * (7 + Math.random() * 2) * escala,
      vx: direcao * velocidade, // mesma velocidade para o V não se desfazer na travessia
      tempo: Math.random() * PASSAROS.ciclo, // cada um bate as asas no seu próprio ritmo
    });
  }
}

// Sai quando passa da borda para onde voa; se a câmera o deixar muito para trás, também. As
// câmeras são as das duas metades da tela (iguais quando ela não está dividida): a borda
// para onde ele voa é a da metade daquele lado.
export function atualizarPassaros(dt: number, largura: number, camEsquerda: number, camDireita: number): void {
  passaros.forEach((p) => {
    p.x += p.vx * dt;
    p.tempo += dt;
  });
  passaros = passaros.filter((p) => {
    const x = naTela(p, p.vx > 0 ? camDireita : camEsquerda);
    const largo = BATER_ASAS[p.nivel][0][0].width;
    if (x < -300 || x > largura + 300) return false;
    return p.vx > 0 ? x < largura : x > -largo;
  });

  if (passaros.length) return;
  esperaBando -= dt;
  if (esperaBando <= 0) {
    soltarBando(largura, camEsquerda, camDireita);
    esperaBando = sortear(PASSAROS.intervalo);
  }
}

function desenharPassaros(ctx: CanvasRenderingContext2D, camX: number, atrasDasNuvens: boolean): void {
  passaros.forEach((p) => {
    const nivel = NIVEIS_PASSARO[p.nivel];
    if (nivel.atrasDasNuvens !== atrasDasNuvens) return;
    const noCiclo = p.tempo % PASSAROS.ciclo;
    const quadros = BATER_ASAS[p.nivel][p.cor];
    const quadro = noCiclo < PASSAROS.batendo ? Math.floor(noCiclo / PASSAROS.quadroAsa) % quadros.length : 1;
    const sprite = quadros[quadro];
    const x = Math.round(naTela(p, camX));
    const y = Math.round(p.y + 1.5 * nivel.escala * Math.sin(p.tempo * 2));
    ctx.save();
    if (p.vx < 0) {
      ctx.translate(x + sprite.width, y);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0);
    } else {
      ctx.drawImage(sprite, x, y);
    }
    ctx.restore();
  });
}

let ceu: HTMLCanvasElement | null = null;

// Degradê do céu pintado uma vez, linha a linha, com as cores tiradas da paisagem.
function criarCeu(largura: number, altura: number): HTMLCanvasElement {
  const canvas = novoCanvas(largura, altura);
  const ctxCeu = contexto2d(canvas);
  QUADROS_CENARIO.ceu.forEach((cor, y) => {
    ctxCeu.fillStyle = cor;
    ctxCeu.fillRect(0, y, largura, 1);
  });
  return canvas;
}

// Tudo o que fica atrás do chão, em coordenadas de tela: céu (parado), sol e paisagem
// (deslizando devagar), pássaros e nuvens e a fileira de árvores de trás, cuja base o chão
// cobre depois.
export function desenharFundo(
  ctx: CanvasRenderingContext2D,
  folha: CanvasImageSource,
  tempo: number,
  luz: Luz,
  camX: number,
  largura: number,
  altura: number,
  yBase: number,
): void {
  ceu ||= criarCeu(largura, altura);
  ctx.drawImage(ceu, 0, 0);
  desenharSol(ctx, folha, luz, tempo);
  desenharQuadro(ctx, folha, QUADROS_CENARIO.paisagem, -deslocamentoPaisagem(camX, largura), 0);
  desenharPassaros(ctx, camX, true);
  desenharNuvens(ctx, folha, tempo, camX, largura);
  desenharPassaros(ctx, camX, false);

  const camFundo = Math.round(camX * PARALAXE.arvoresFundo);
  ctx.save();
  ctx.translate(-camFundo, 0);
  desenharFileira(ctx, folha, tempo, luz, 'arvores', ARVORES_FUNDO, yBase + 3, camFundo, largura, true);
  ctx.restore();
}

// Cópias das plantas já com luz e sombra do sol. O sol anda devagar, então cada cópia só é
// refeita quando a direção ou a altura da luz mudam um degrau.
const plantasIluminadas = new Map<string, { canvas: HTMLCanvasElement; degrau: string }>();

function plantaIluminada(
  folha: CanvasImageSource,
  grupo: GrupoPlantas,
  indice: number,
  quadro: number,
  luz: Luz,
  nevoa: boolean,
): HTMLCanvasElement {
  const q = QUADROS_CENARIO[grupo][indice][quadro];
  const chave = `${grupo}:${indice}:${quadro}:${nevoa}`;
  const degrau = `${Math.round(luz.lado * 16)}:${Math.round(luz.forca * 8)}`;
  const guardada = plantasIluminadas.get(chave);
  if (guardada && guardada.degrau === degrau) return guardada.canvas;

  const canvas = guardada ? guardada.canvas : novoCanvas(q.w, q.h);
  canvas.width = q.w;
  canvas.height = q.h;
  const c = contexto2d(canvas);
  c.drawImage(folha, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
  // 'source-atop' pinta só por cima dos pixels da planta, sem sair do contorno.
  c.globalCompositeOperation = 'source-atop';

  const lateral = LUZ.lateral * luz.forca * Math.abs(luz.lado);
  const lado = c.createLinearGradient(luz.lado < 0 ? 0 : q.w, 0, luz.lado < 0 ? q.w : 0, 0);
  lado.addColorStop(0, `rgba(255, 238, 185, ${lateral})`);
  lado.addColorStop(0.5, 'rgba(255, 238, 185, 0)');
  lado.addColorStop(0.5, 'rgba(12, 28, 30, 0)');
  lado.addColorStop(1, `rgba(12, 28, 30, ${lateral})`);
  c.fillStyle = lado;
  c.fillRect(0, 0, q.w, q.h);

  const vertical = c.createLinearGradient(0, 0, 0, q.h);
  vertical.addColorStop(0, `rgba(255, 242, 195, ${LUZ.topo * luz.forca * luz.elevacao})`);
  vertical.addColorStop(0.55, 'rgba(255, 242, 195, 0)');
  vertical.addColorStop(0.75, 'rgba(10, 24, 18, 0)');
  vertical.addColorStop(1, `rgba(10, 24, 18, ${LUZ.base})`);
  c.fillStyle = vertical;
  c.fillRect(0, 0, q.w, q.h);

  if (nevoa) {
    c.fillStyle = LUZ.nevoa;
    c.fillRect(0, 0, q.w, q.h);
  }
  plantasIluminadas.set(chave, { canvas, degrau });
  return canvas;
}

// A copa só verga para o lado do vento (esquerda, como as nuvens) e volta ao repouso, sem
// ir e vir de um lado ao outro. A força do vento escolhe o quadro: cada um é a planta
// entortada na folha grande antes de reduzir, então de um quadro para o outro só mudam uns
// poucos pixels do contorno. `vistaX` é a borda esquerda da tela na camada: plantas fora da
// tela não são desenhadas.
function desenharFileira(
  ctx: CanvasRenderingContext2D,
  folha: CanvasImageSource,
  tempo: number,
  luz: Luz,
  grupo: GrupoPlantas,
  plantas: PlantaNoMapa[],
  apoio: number,
  vistaX: number,
  largura: number,
  nevoa = false,
): void {
  plantas.forEach(({ indice, x }) => {
    const quadros = QUADROS_CENARIO[grupo][indice];
    const { w, h } = quadros[0];
    const esquerda = esquerdaDaPlanta(quadros[0], x);
    if (esquerda + w + 2 < vistaX || esquerda - 2 > vistaX + largura) return;
    const quadro = quadroDoVento(tempo, x, quadros.length, nevoa);
    ctx.drawImage(plantaIluminada(folha, grupo, indice, quadro, luz, nevoa), esquerda, apoio - h);
  });
}

// O recorte tem `m` px a mais à esquerda para a copa vergar; a base ocupa o resto.
export function esquerdaDaPlanta({ w, m = 0 }: Recorte, x: number): number {
  return Math.round(x - (w - m) / 2) - m;
}

// Quadro do vento da planta em `x` no instante `tempo` (0 = repouso).
export function quadroDoVento(tempo: number, x: number, totalQuadros: number, nevoa = false): number {
  const rajada = 0.65 + 0.35 * Math.sin((2 * Math.PI * tempo) / VENTO.periodoRajada);
  const fase = 2 * Math.PI * (tempo / VENTO.periodo + x / VENTO.onda);
  const forca = (rajada * (1 - Math.cos(fase))) / 2 * (nevoa ? VENTO.fundo : 1);
  return Math.round(forca * (totalQuadros - 1));
}

// Sombra macia e achatada no chão, deslocada para o lado oposto ao sol e mais comprida
// quando ele está baixo. Sem sol (escondido atrás das montanhas) ela volta a ficar
// centrada, só de luz ambiente. `largura` é a do objeto que faz a sombra.
export function desenharSombra(
  ctx: CanvasRenderingContext2D,
  luz: Luz,
  centroX: number,
  yBase: number,
  largura: number,
  intensidade = 1,
): void {
  const comprimento = largura * (0.6 + 0.7 * (1 - luz.elevacao) * luz.forca);
  const cx = centroX - luz.lado * largura * 0.35 * (1 - 0.5 * luz.elevacao) * luz.forca;
  const alfa = LUZ.sombra * (0.45 + 0.55 * luz.forca) * intensidade;
  ctx.save();
  ctx.translate(cx, yBase + 2);
  ctx.scale(comprimento / 2, 2.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(12, 32, 14, ${alfa})`);
  g.addColorStop(0.55, `rgba(12, 32, 14, ${alfa * 0.6})`);
  g.addColorStop(1, 'rgba(12, 32, 14, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Sombras e plantas da frente, em coordenadas do mapa (o chamador já transladou pela
// câmera `camX`); desenhado depois do chão.
export function desenharVegetacao(
  ctx: CanvasRenderingContext2D,
  folha: CanvasImageSource,
  tempo: number,
  luz: Luz,
  yBase: number,
  camX: number,
  largura: number,
): void {
  // +1 para a base encostar dentro da grama, sem vão.
  const apoio = yBase + 1;
  ARVORES_CHAO.forEach(({ indice, x }) => {
    const { w, m = 0 }: Recorte = QUADROS_CENARIO.arvores[indice][0];
    desenharSombra(ctx, luz, x, yBase, (w - m) * 0.8);
  });
  ARBUSTOS_CHAO.forEach(({ indice, x }) => {
    const { w, m = 0 }: Recorte = QUADROS_CENARIO.arbustos[indice][0];
    desenharSombra(ctx, luz, x, yBase, w - m, 0.6);
  });
  desenharFileira(ctx, folha, tempo, luz, 'arvores', ARVORES_CHAO, apoio, camX, largura);
  desenharFileira(ctx, folha, tempo, luz, 'arbustos', ARBUSTOS_CHAO, apoio, camX, largura);
}

// Última camada, em coordenadas de tela: calor em volta do sol, o lado longe dele um pouco
// mais escuro e um tom alaranjado quando ele está baixo. Tudo bem de leve.
export function desenharLuz(ctx: CanvasRenderingContext2D, luz: Luz, largura: number, altura: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  const calor = ctx.createRadialGradient(luz.x, luz.y, 0, luz.x, luz.y, largura * 1.1);
  calor.addColorStop(0, `rgba(255, 226, 160, ${LUZ.calor * luz.forca})`);
  calor.addColorStop(1, 'rgba(255, 226, 160, 0)');
  ctx.fillStyle = calor;
  ctx.fillRect(0, 0, largura, altura);

  const entardecer = LUZ.entardecer * (1 - suavizar(0.2, 0.6, luz.elevacao)) * suavizar(0, 0.15, luz.elevacao);
  if (entardecer > 0.005) {
    ctx.fillStyle = `rgba(255, 140, 70, ${entardecer})`;
    ctx.fillRect(0, 0, largura, altura);
  }

  ctx.globalCompositeOperation = 'multiply';
  const escuro = LUZ.ladoEscuro * luz.forca * Math.abs(luz.lado);
  const lado = ctx.createLinearGradient(luz.lado < 0 ? 0 : largura, 0, luz.lado < 0 ? largura : 0, 0);
  lado.addColorStop(0, 'rgba(40, 50, 90, 0)');
  lado.addColorStop(1, `rgba(40, 50, 90, ${escuro})`);
  ctx.fillStyle = lado;
  ctx.fillRect(0, 0, largura, altura);
  ctx.restore();
}
