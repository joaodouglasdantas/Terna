// Os recortes vêm de assets/cenario.png, gerado a partir de fontes/ por
// ferramentas/gerar-cenario.cjs. Os índices abaixo apontam para QUADROS_CENARIO.

import { MUNDO } from '@terna/compartilhado';
import urlCenario from '../assets/cenario.png';
import { QUADROS_CENARIO } from '../gerado/cenario-quadros';
import { carregarImagem, contexto2d, criarSprite, desenharQuadro, novoCanvas, reduzirSprite } from '../motor/imagens';
import { sortear, suavizar } from '../motor/matematica';
import { paisagemViva } from './agua';
import { criarCeu, desenharCirros, desenharSerraDeLonge } from './ceu';
import { graduarImagem, type Graduacao } from './cor';
import { acompanharNuvens, avisarCobertura, desenharRaios, luzDoRaio, solLivre, sombraDaNuvem, type VistaDoChao } from './raios';
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

export const ARBUSTOS_CHAO: PlantaNoMapa[] = [
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
  lateral: 0.28, // lado das plantas virado para o sol clareia, o outro escurece
  topo: 0.14, // copa clareia por cima quando o sol está alto
  base: 0.3, // pé das plantas mais escuro (luz que não chega embaixo)
  contorno: 0.42, // filete de luz quente na borda das plantas virada para o sol, onde um raio bate
  contornoSombra: 0.22, // e a borda do outro lado, um pouco mais escura
  nevoa: 'rgba(92, 140, 188, 0.34)', // véu azul da distância nas árvores de trás
  sombra: 0.44, // sombra no chão, embaixo de plantas e do personagem
  calor: 0.2, // brilho quente em volta do sol, espalhado na cena
  ladoEscuro: 0.12, // o lado da tela longe do sol fica um pouco mais escuro
  entardecer: 0.22, // tom alaranjado quando o sol está baixo
  vinheta: 0.28, // cantos da tela mais escuros
};

// O acabamento de cor das nuvens e das plantas (cor.ts), feito uma vez numa cópia da folha: verdes
// mais vivos com a sombra puxando para o azul, e nuvens com o topo claro e a barriga azulada. A
// paisagem é acertada à parte (realce.ts), e o sol fica como está.
const COR_PLANTAS: Graduacao = { saturacao: 1.2, contraste: 1.14, pivo: 0.42, sombraFria: 0.7, luzQuente: 0.65 };
const COR_NUVENS: Graduacao = { saturacao: 1.08, contraste: 1.18, pivo: 0.72, sombraFria: 0.9, luzQuente: 0.5 };

export async function carregarFolhaCenario(): Promise<CanvasImageSource> {
  const imagem = await carregarImagem(urlCenario);
  const folha = novoCanvas(imagem.width, imagem.height);
  const c = contexto2d(folha, { willReadFrequently: true });
  c.drawImage(imagem, 0, 0);
  const graduar = (q: Recorte, cor: Graduacao): void => {
    const dados = c.getImageData(q.x, q.y, q.w, q.h);
    graduarImagem(dados, cor);
    c.putImageData(dados, q.x, q.y);
  };
  try {
    QUADROS_CENARIO.nuvens.forEach((q) => graduar(q, COR_NUVENS));
    [...QUADROS_CENARIO.arvores, ...QUADROS_CENARIO.arbustos].flat().forEach((q) => graduar(q, COR_PLANTAS));
  } catch {
    return imagem; // folha protegida (página aberta do disco): segue com as cores da arte
  }
  // O canvas lido pixel a pixel fica na memória comum; como bitmap, a folha vai para a placa de
  // vídeo e as nuvens e o sol desenhados a cada quadro saem dela sem custo.
  return typeof createImageBitmap === 'function' ? createImageBitmap(folha).catch(() => folha) : folha;
}

// A paisagem fica um pouco acima da base da tela: assim o rio do vale aparece por cima do chão e
// entre as árvores de trás (a faixa de baixo dela fica escondida atrás do chão).
const PAISAGEM_ACIMA = 26;
const CIRROS_Y = 6; // topo da faixa dos cirros na tela

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

// O sol na tela com a câmera descida `olharY` (ele desce um pouco com ela: ACOMPANHA.sol). A luz
// da cena (desenharLuz) sai daqui, para os raios saírem de onde o disco está.
export function luzNaTela(luz: Luz, olharY: number): Luz {
  return { ...luz, y: luz.y + Math.round(olharY * ACOMPANHA.sol) };
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
function posicaoDaNuvem(indice: number, x: number, velocidade: number, tempo: number, camX: number, largura: number): number {
  const q = QUADROS_CENARIO.nuvens[indice];
  const volta = largura + q.w;
  const andou = x - velocidade * tempo - camX * PARALAXE.nuvens;
  const deslocado = (((andou + q.w) % volta) + volta) % volta;
  return Math.round(deslocado - q.w);
}

function desenharNuvens(ctx: CanvasRenderingContext2D, folha: CanvasImageSource, tempo: number, camX: number, largura: number): void {
  NUVENS.forEach(({ indice, x, y, velocidade }) => {
    desenharQuadro(ctx, folha, QUADROS_CENARIO.nuvens[indice], posicaoDaNuvem(indice, x, velocidade, tempo, camX, largura), y);
  });
}

// Quanto do disco do sol as nuvens cobrem, 0–1: uns pontos do disco testados contra o miolo de
// cada nuvem (uma elipse um pouco menor que o recorte, que é fofo nas bordas). `sobeSol` e
// `sobeNuvens`: quanto cada camada desceu com a câmera (ACOMPANHA).
const PONTOS_DO_SOL = [
  [0, 0], [4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3],
];

function coberturaDoSol(luz: Luz, tempo: number, camX: number, largura: number, desceSol: number, desceNuvens: number): number {
  if (luz.forca <= 0) return 0;
  let cobertos = 0;
  for (const [dx, dy] of PONTOS_DO_SOL) {
    const px = luz.x + dx;
    const py = luz.y + desceSol + dy;
    const coberto = NUVENS.some(({ indice, x, y, velocidade }) => {
      const q = QUADROS_CENARIO.nuvens[indice];
      const nx = posicaoDaNuvem(indice, x, velocidade, tempo, camX, largura);
      const cx = nx + q.w / 2;
      const cy = y + desceNuvens + q.h * 0.55;
      const u = (px - cx) / (q.w * 0.42);
      const v = (py - cy) / (q.h * 0.38);
      return u * u + v * v < 1;
    });
    if (coberto) cobertos++;
  }
  return cobertos / PONTOS_DO_SOL.length;
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

let ceu: HTMLCanvasElement | null = null; // o degradê (ceu.ts), pintado uma vez

// Quanto cada camada de trás acompanha a câmera quando ela sobe atrás do seu personagem (a
// fração de `olharY`): o que está longe mexe menos — é a paralaxe na vertical, e lá de cima a
// paisagem parece subir por trás das árvores, mostrando mais do vale e do rio. A fileira de
// árvores de trás anda junto com o chão, que cobre a base dela. O céu (a faixa de cores) fica.
const ACOMPANHA = { sol: 0.3, cirros: 0.25, serra: 0.35, paisagem: 0.45, ceu: 0.6, arvoresFundo: 1 };

// Tudo o que fica atrás do chão, em coordenadas de tela: céu (parado), sol e paisagem
// (deslizando devagar, com a água do rio e das cascatas se mexendo: agua.ts), pássaros e nuvens e
// a fileira de árvores de trás, cuja base o chão cobre depois. `olharY`: px que a câmera desceu a
// cena (o seu personagem no alto, pulando ou voando); cada camada desce a sua parte (ACOMPANHA).
export function desenharFundo(
  ctx: CanvasRenderingContext2D,
  folha: CanvasImageSource,
  tempo: number,
  luz: Luz,
  camX: number,
  largura: number,
  altura: number,
  yBase: number,
  olharY = 0,
): void {
  ceu ||= criarCeu(largura, altura);
  ctx.drawImage(ceu, 0, 0);
  const descer = (camada: keyof typeof ACOMPANHA): void => {
    ctx.save();
    ctx.translate(0, Math.round(olharY * ACOMPANHA[camada]));
  };
  descer('sol');
  desenharSol(ctx, folha, luz, tempo);
  ctx.restore();
  avisarCobertura(
    coberturaDoSol(luz, tempo, camX, largura, Math.round(olharY * ACOMPANHA.sol), Math.round(olharY * ACOMPANHA.ceu)),
  );
  descer('cirros');
  desenharCirros(ctx, tempo, camX, largura, CIRROS_Y);
  ctx.restore();
  desenharSerraDeLonge(ctx, camX, largura, Math.round(olharY * ACOMPANHA.serra));
  ctx.drawImage(
    paisagemViva(folha, tempo, luz.forca * solLivre()),
    -deslocamentoPaisagem(camX, largura),
    Math.round(olharY * ACOMPANHA.paisagem) - PAISAGEM_ACIMA,
  );
  descer('ceu');
  desenharPassaros(ctx, camX, true);
  desenharNuvens(ctx, folha, tempo, camX, largura);
  desenharPassaros(ctx, camX, false);
  ctx.restore();

  const camFundo = Math.round(camX * PARALAXE.arvoresFundo);
  descer('arvoresFundo');
  ctx.translate(-camFundo, 0);
  desenharFileira(ctx, folha, tempo, luz, 'arvores', ARVORES_FUNDO, yBase + 3, camFundo, largura, olharY, true);
  ctx.restore();
}

// Cópias das plantas já com luz e sombra do sol, e o filete de luz da borda à parte (`borda`), que
// só aparece onde um raio bate. O sol anda devagar, então cada cópia só é refeita quando a direção
// ou a altura da luz mudam um degrau.
interface PlantaIluminada {
  canvas: HTMLCanvasElement;
  borda: HTMLCanvasElement | null;
  degrau: string;
}
const plantasIluminadas = new Map<string, PlantaIluminada>();

function plantaIluminada(
  folha: CanvasImageSource,
  grupo: GrupoPlantas,
  indice: number,
  quadro: number,
  luz: Luz,
  nevoa: boolean,
): PlantaIluminada {
  const q = QUADROS_CENARIO[grupo][indice][quadro];
  const chave = `${grupo}:${indice}:${quadro}:${nevoa}`;
  const degrau = `${Math.round(luz.lado * 16)}:${Math.round(luz.elevacao * 8)}:${Math.round(luz.forca * 8)}`;
  const guardada = plantasIluminadas.get(chave);
  if (guardada && guardada.degrau === degrau) return guardada;

  const canvas = guardada ? guardada.canvas : novoCanvas(q.w, q.h);
  canvas.width = q.w;
  canvas.height = q.h;
  const c = contexto2d(canvas, { willReadFrequently: true });
  c.drawImage(folha, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
  if (grupo === 'arbustos' && indice in AMORAS) pintarAmoras(c, q.w, q.h, q.m ?? 0, indice);
  const borda = contornoDeLuz(c, q.w, q.h, luz, nevoa, guardada?.borda ?? null);
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
  const pronta = { canvas, borda, degrau };
  plantasIluminadas.set(chave, pronta);
  return pronta;
}

// Amoras em algumas moitas (índice da moita → quantas): cachinhos de 2×2 no meio da folhagem, a
// maioria madura (roxo quase preto, com um brilho) e umas ainda vermelhas. Sempre nos mesmos
// lugares da moita (sorteio fixo por índice), pintadas antes da luz, para a sombra pegar nelas.
const AMORAS: Record<number, number> = { 0: 6, 1: 7, 3: 5, 5: 5 };
const MADURA = { brilho: '#b58ac4', meio: '#4a1a52', fundo: '#24091f' };
const VERDE = { brilho: '#ff9a8a', meio: '#c8323a', fundo: '#861a26' };

function pintarAmoras(c: CanvasRenderingContext2D, w: number, h: number, m: number, indice: number): void {
  let dados: ImageData;
  try {
    dados = c.getImageData(0, 0, w, h);
  } catch {
    return;
  }
  const opaco = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && dados.data[(y * w + x) * 4 + 3] > 0;
  // Dentro da folhagem: o 2×2 e a volta dele opacos.
  const cabe = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) if (!opaco(x + dx, y + dy)) return false;
    return true;
  };
  let semente = indice * 7919 + 17;
  const acaso = (): number => {
    semente = (semente * 16807) % 2147483647;
    return semente / 2147483647;
  };
  const postas: [number, number][] = [];
  for (let tentativa = 0; tentativa < 60 && postas.length < AMORAS[indice]; tentativa++) {
    const x = m + 2 + Math.floor(acaso() * (w - m - 5));
    const y = 2 + Math.floor(acaso() * (h * 0.65));
    const madura = acaso() < 0.72;
    if (!cabe(x, y) || postas.some(([px, py]) => Math.abs(px - x) < 4 && Math.abs(py - y) < 3)) continue;
    postas.push([x, y]);
    const cor = madura ? MADURA : VERDE;
    c.fillStyle = cor.meio;
    c.fillRect(x, y, 2, 2);
    c.fillStyle = cor.fundo;
    c.fillRect(x + 1, y + 1, 1, 1);
    c.fillStyle = cor.brilho;
    c.fillRect(x, y, 1, 1);
  }
}

// Pixel art de luz: a borda da planta do lado de lá do sol ganha um pouco de sombra, sempre. O
// filete quente na borda virada para ele (do lado dele e em cima, com o sol alto) fica numa cópia à
// parte, só com esses pixels, que desenharFileira pinta por cima quando um raio pega a planta — e
// só o quanto o raio bate, acendendo e apagando com ele. Sem raio, a planta fica sem o contorno
// claro. Na fileira de trás, mais fraco. Devolve a cópia do filete (null com a folha protegida).
const LUZ_CONTORNO = [255, 222, 140];

function contornoDeLuz(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  luz: Luz,
  nevoa: boolean,
  reaproveitar: HTMLCanvasElement | null,
): HTMLCanvasElement | null {
  let dados: ImageData;
  try {
    dados = c.getImageData(0, 0, w, h);
  } catch {
    return null; // folha protegida: sem o filete
  }
  const d = dados.data;
  const original = Uint8ClampedArray.from(d);
  const borda = new ImageData(w, h);
  const b = borda.data;
  const opaco = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && original[(y * w + x) * 4 + 3] > 0;
  const lado = luz.lado >= 0 ? 1 : -1;
  const fraco = nevoa ? 0.5 : 1;
  const deLado = LUZ.contorno * (0.35 + 0.65 * Math.abs(luz.lado));
  const deCima = LUZ.contorno * 0.75 * luz.elevacao;
  const sombra = LUZ.contornoSombra * (0.4 + 0.6 * luz.forca) * fraco;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!original[i + 3]) continue;
      let k = 0;
      if (!opaco(x + lado, y)) k = Math.max(k, deLado);
      if (!opaco(x, y - 1)) k = Math.max(k, deCima);
      if (!opaco(x + lado, y - 1) && !opaco(x + 2 * lado, y)) k = Math.max(k, deLado * 0.5);
      if (k > 0) {
        b[i] = d[i] + (LUZ_CONTORNO[0] - d[i]) * k;
        b[i + 1] = d[i + 1] + (LUZ_CONTORNO[1] - d[i + 1]) * k;
        b[i + 2] = d[i + 2] + (LUZ_CONTORNO[2] - d[i + 2]) * k;
        b[i + 3] = Math.round(255 * fraco);
      } else if (!opaco(x - lado, y)) {
        d[i] *= 1 - sombra;
        d[i + 1] *= 1 - sombra;
        d[i + 2] *= 1 - sombra * 0.6;
      }
    }
  }
  c.putImageData(dados, 0, 0);
  const canvas = reaproveitar ?? novoCanvas(w, h);
  canvas.width = w;
  canvas.height = h;
  contexto2d(canvas).putImageData(borda, 0, 0);
  return canvas;
}

// Quanto os raios pegam a planta (0–1), pela copa: o topo, o meio e o lado virado para o sol. Em
// px da tela: `centro` e `apoio` já com a câmera.
function raioNaPlanta(centro: number, apoio: number, w: number, h: number, luz: Luz): number {
  const lado = luz.lado >= 0 ? 1 : -1;
  return Math.max(
    luzDoRaio(centro, apoio - h * 0.85),
    luzDoRaio(centro, apoio - h * 0.55),
    luzDoRaio(centro + lado * w * 0.35, apoio - h * 0.6),
    luzDoRaio(centro - lado * w * 0.3, apoio - h * 0.7),
  );
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
  olharY: number,
  nevoa = false,
): void {
  plantas.forEach(({ indice, x }) => {
    const quadros = QUADROS_CENARIO[grupo][indice];
    const { w, h } = quadros[0];
    const esquerda = esquerdaDaPlanta(quadros[0], x);
    if (esquerda + w + 2 < vistaX || esquerda - 2 > vistaX + largura) return;
    const quadro = quadroDoVento(tempo, x, quadros.length, nevoa);
    const planta = plantaIluminada(folha, grupo, indice, quadro, luz, nevoa);
    ctx.drawImage(planta.canvas, esquerda, apoio - h);
    if (!planta.borda) return;
    // O filete de luz na borda, só o quanto um raio bate nela agora.
    const raio = raioNaPlanta(x - vistaX, apoio + Math.round(olharY), w, h, luz);
    if (raio < 0.03) return;
    ctx.globalAlpha = raio;
    ctx.drawImage(planta.borda, esquerda, apoio - h);
    ctx.globalAlpha = 1;
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
  const alfa = Math.round(LUZ.sombra * (0.45 + 0.55 * luz.forca) * intensidade * 500) / 500;
  ctx.save();
  ctx.translate(cx, yBase + 2);
  ctx.scale(comprimento / 2, 2.5);
  ctx.fillStyle = degradeDaSombra(ctx, alfa);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// O degradê da sombra é o mesmo para todas com o mesmo alfa (o círculo de raio 1 é esticado no
// lugar): guardado, em vez de um novo por sombra a cada quadro.
const degradesDaSombra = new Map<number, CanvasGradient>();
function degradeDaSombra(ctx: CanvasRenderingContext2D, alfa: number): CanvasGradient {
  let g = degradesDaSombra.get(alfa);
  if (g) return g;
  if (degradesDaSombra.size > 64) degradesDaSombra.clear();
  g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(12, 32, 14, ${alfa})`);
  g.addColorStop(0.55, `rgba(12, 32, 14, ${alfa * 0.6})`);
  g.addColorStop(1, 'rgba(12, 32, 14, 0)');
  degradesDaSombra.set(alfa, g);
  return g;
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
  olharY = 0,
): void {
  // +1 para a base encostar dentro da grama, sem vão.
  const apoio = yBase + 1;
  // Só as que aparecem (a sombra vai até ~1,3 largura do objeto para o lado).
  const naVista = (x: number, w: number): boolean => x + 1.5 * w >= camX && x - 1.5 * w <= camX + largura;
  ARVORES_CHAO.forEach(({ indice, x }) => {
    const { w, m = 0 }: Recorte = QUADROS_CENARIO.arvores[indice][0];
    if (naVista(x, w)) desenharSombra(ctx, luz, x, yBase, (w - m) * 0.8);
  });
  ARBUSTOS_CHAO.forEach(({ indice, x }) => {
    const { w, m = 0 }: Recorte = QUADROS_CENARIO.arbustos[indice][0];
    if (naVista(x, w)) desenharSombra(ctx, luz, x, yBase, w - m, 0.6);
  });
  desenharFileira(ctx, folha, tempo, luz, 'arvores', ARVORES_CHAO, apoio, camX, largura, olharY);
  desenharFileira(ctx, folha, tempo, luz, 'arbustos', ARBUSTOS_CHAO, apoio, camX, largura, olharY);
}

// Última camada, em coordenadas de tela: calor em volta do sol, o lado longe dele um pouco
// mais escuro, um tom alaranjado quando ele está baixo, a vinheta nos cantos e os raios de sol
// (raios.ts), que também clareiam o que está embaixo deles. Uma nuvem na frente do sol apaga o
// calor e os raios aos poucos e escurece a cena um tanto. Tudo bem de leve. `vistas`: a tela
// inteira ou as duas metades da tela dividida, cada uma com a sua linha da grama e a sua câmera.
//
// O calor e o tom do entardecer vão numa camada (soft-light), e o lado escuro, a sombra da nuvem e
// a vinheta noutra (multiply): cada uma é pintada à parte e só refeita quando o sol anda um pixel
// ou a luz muda um degrau; a cada quadro, a cena recebe as duas coladas, em vez de cinco degradês
// e misturas pela tela inteira.
interface CamadasDaLuz {
  suave: HTMLCanvasElement;
  escura: HTMLCanvasElement;
  chave: string;
}
let camadasDaLuz: CamadasDaLuz | null = null;
const degrau = (v: number): number => Math.round(v * 200);

export function desenharLuz(
  ctx: CanvasRenderingContext2D,
  luz: Luz,
  largura: number,
  altura: number,
  tempo = 0,
  vistas: VistaDoChao[] = [{ x0: 0, largura, chao: altura, camX: 0 }],
): void {
  acompanharNuvens(tempo);
  const calorForca = LUZ.calor * luz.forca * solLivre();
  const entardecer = LUZ.entardecer * (1 - suavizar(0.2, 0.6, luz.elevacao)) * suavizar(0, 0.15, luz.elevacao);
  const escuro = LUZ.ladoEscuro * luz.forca * Math.abs(luz.lado);
  const nuvem = sombraDaNuvem() * luz.forca;
  const chave = [Math.round(luz.x), Math.round(luz.y), Math.sign(luz.lado), degrau(calorForca), degrau(entardecer), degrau(escuro), degrau(nuvem), largura, altura].join(':');
  if (!camadasDaLuz || camadasDaLuz.suave.width !== largura || camadasDaLuz.suave.height !== altura) {
    camadasDaLuz = { suave: novoCanvas(largura, altura), escura: novoCanvas(largura, altura), chave: '' };
  }
  const camadas = camadasDaLuz;
  if (camadas.chave !== chave) {
    camadas.chave = chave;
    const s = contexto2d(camadas.suave);
    s.clearRect(0, 0, largura, altura);
    const calor = s.createRadialGradient(luz.x, luz.y, 0, luz.x, luz.y, largura * 1.1);
    calor.addColorStop(0, `rgba(255, 226, 160, ${calorForca})`);
    calor.addColorStop(1, 'rgba(255, 226, 160, 0)');
    s.fillStyle = calor;
    s.fillRect(0, 0, largura, altura);
    if (entardecer > 0.005) {
      s.fillStyle = `rgba(255, 140, 70, ${entardecer})`;
      s.fillRect(0, 0, largura, altura);
    }

    const e = contexto2d(camadas.escura);
    e.clearRect(0, 0, largura, altura);
    const lado = e.createLinearGradient(luz.lado < 0 ? 0 : largura, 0, luz.lado < 0 ? largura : 0, 0);
    lado.addColorStop(0, 'rgba(40, 50, 90, 0)');
    lado.addColorStop(1, `rgba(40, 50, 90, ${escuro})`);
    e.fillStyle = lado;
    e.fillRect(0, 0, largura, altura);
    // A sombra da nuvem que passa na frente do sol: a cena toda um pouco mais fria e escura.
    if (nuvem > 0.004) {
      e.fillStyle = `rgba(70, 86, 130, ${nuvem})`;
      e.fillRect(0, 0, largura, altura);
    }
    // Vinheta: os cantos um pouco mais escuros, puxando o olho para o meio da cena.
    const vinheta = e.createRadialGradient(largura / 2, altura * 0.45, altura * 0.35, largura / 2, altura * 0.45, largura * 0.62);
    vinheta.addColorStop(0, 'rgba(30, 26, 60, 0)');
    vinheta.addColorStop(1, `rgba(30, 26, 60, ${LUZ.vinheta})`);
    e.fillStyle = vinheta;
    e.fillRect(0, 0, largura, altura);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.drawImage(camadas.suave, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(camadas.escura, 0, 0);
  ctx.restore();

  desenharRaios(ctx, luz, tempo, largura, altura, vistas);
}
