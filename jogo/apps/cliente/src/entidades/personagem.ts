// O corpo dos personagens: física, animação e desenho. É o mesmo para você e para o sósia (e
// para o outro jogador online): cada um recebe os seus `Controles` a cada quadro — os seus vêm
// do teclado, os do sósia do cérebro dele.
//
// Os personagens (compartilhado/conteudo/herois.ts):
// - Leslie, a dríade: sempre dríade. Pega as armas que caem do céu; a tecla R troca o que o
//   clique esquerdo usa, a arma ou os poderes dela. Quadros em assets/leslie.png, gerados de
//   fontes/leslie.png por ferramentas/gerar-herois.cjs.
// - Anjo (desligado por enquanto): luta com as armas e, com a tecla R, vira anjo por um tempo
//   (anjo/). Quadros em assets/anjo/base.png e anjo/anjo.png (a forma de anjo, nos mesmos
//   lugares), gerados de fontes/SpriteBase.png por ferramentas/gerar-anjo.cjs.
// - Grow, o metamorfo: de gente é como a Leslie (arma ou poderes, na tecla R); o terceiro poder,
//   com a barra cheia, o transforma em golem por um tempo (grow/golem.ts) — aí os três poderes são
//   os do golem, ele fica pesado e a pele de pedra absorve parte do dano. O cajado fica na mão
//   só no modo poderes (os poderes saem da pedra dele); no modo arma vai nas costas
//   (grow/cajado.ts). Quadros em assets/grow/base.png, grow/sem-cajado.png (o mesmo corpo sem o
//   cajado na mão) e grow/golem.png, gerados de fontes/grow.png e fontes/golem.png por
//   ferramentas/gerar-herois.cjs (que também gera os da Leslie).
// - Margo, a vovó do rolo de massa: sempre de gente, sem soco e sem arma do chão — o clique esquerdo
//   no primeiro quadrinho é a rolada (a fileira ATTACK da folha, `golpe`); no Bumerangue o rolo sai
//   da mão (`roloFora`) e o corpo é o da folha sem ele. O ganso dela anda atrás (margo/ganso.ts) e,
//   na ult, sai bravo atrás do outro (margo/poderes.ts). Quadros em assets/margo/base.png e
//   margo/sem-rolo.png, gerados de fontes/margo.png por ferramentas/gerar-herois.cjs.
// Os sprites são desenhados virados para a direita.

import {
  CORPO_GOLEM,
  DEFESA_GOLEM,
  ENERGIA_PIXY,
  FARINHA,
  MOVIMENTO_GOLEM,
  MUNDO,
  RAJADA,
  ROLO,
  VIDA_MAXIMA,
  type Heroi,
  type IdPoder,
} from '@terna/compartilhado';
import urlAnjoBase from '../assets/anjo/base.png';
import urlAnjoAnjo from '../assets/anjo/anjo.png';
import urlGrowBase from '../assets/grow/base.png';
import urlGrowGolem from '../assets/grow/golem.png';
import urlGrowSemCajado from '../assets/grow/sem-cajado.png';
import urlLeslie from '../assets/leslie.png';
import urlMargoBase from '../assets/margo/base.png';
import urlMargoSemRolo from '../assets/margo/sem-rolo.png';
import { QUADROS_ANJO } from '../gerado/anjo-quadros';
import { QUADROS_GOLEM } from '../gerado/golem-quadros';
import { QUADROS_GROW } from '../gerado/grow-quadros';
import { QUADROS_LESLIE } from '../gerado/leslie-quadros';
import { QUADROS_MARGO } from '../gerado/margo-quadros';
import { carregarImagem, contexto2d, novoCanvas } from '../motor/imagens';
import type { Luz, Sprite } from '../motor/tipos';
import { desenharSombra } from '../mundo/cenario';
import {
  ALTURA_AUREOLA,
  alternarForma,
  anjoPronto,
  alturaDaAureola,
  atualizarAnjo,
  criarAnjo,
  desenharAnjoAtras,
  desenharAnjoNaFrente,
  desenharAsasDoRetrato,
  enfeitarRetratoDeAnjo,
  formaAtual,
  transformando,
  type Anjo,
} from './anjo/anjo';
import { PAIRAR_NO_AR, criarVoo, decolar, voarNoAr, type Voo } from './anjo/voo';
import { desenharArmaNaMao, desenharSoco, type ArmaNaMao, type Ataque } from './armas';
import { BRACO_ANJO, BRACO_BASE, BRACO_GROW, BRACO_LESLIE, BRACO_MARGO, desenharBracoComMao, maisBraco, ombroDe, type CoresBraco } from './braco';
import { CORPO, manobraAcabou, pontoDaManobra, type Manobra, type Medida } from './efeitos';
import { carregarAguias } from './grow/aguia';
import { carregarFlor } from './leslie/flor';
import { atualizarCompanheiro, carregarGanso, criarCompanheiro, desenharCompanheiro, type Companheiro } from './margo/ganso';
import { desenharCajadoNasCostas } from './grow/cajado';
import {
  alternarGolem,
  atualizarGolem,
  criarGolem,
  desenharGolemAtras,
  desenharGolemNaFrente,
  golemPronto,
  golemTransformando,
  type Golem,
} from './grow/golem';
import {
  atualizarRecargas,
  avisar,
  criarPoderes,
  desenharEncanto,
  desenharEnfarinhado,
  desenharPreso,
  desenharVeneno,
  poderEscolhido,
  poderesDaForma,
  trocarLista,
  type Encanto,
  type Poderes,
} from './poderes';
import type { Pose, QuadroPersonagem } from './pose';
import { atualizarRastro, criarRastro, desenharRastro, marcarDash, marcarPuloDuplo, type Rastro, type TintaRastro } from './rastro';

export type { QuadroPersonagem };
export type NomeAnimacao = keyof typeof QUADROS_ANJO & keyof typeof QUADROS_LESLIE & keyof typeof QUADROS_GROW & keyof typeof QUADROS_GOLEM;
// `morto`: ajoelha, cai e fica deitado (quem perdeu). O Anjo não tem: caído, fica meio apagado.
// `retrato`: a pose da foto do painel, quando a forma tem uma própria (o golem, na altura dos
// outros); sem ela, a foto usa o primeiro quadro `parado`.
// `golpe`: a rolada da Margo (só ela tem).
export type AnimacoesPersonagem = Record<NomeAnimacao, Sprite[]> & { morto?: Sprite[]; retrato?: Sprite[]; golpe?: Sprite[] };
export type Forma = 'base' | 'anjo' | 'golem';
// O que o clique esquerdo da Leslie e do Grow (de gente) usa: a arma da mão ou os poderes (a
// tecla R troca).
export type Modo = 'arma' | 'poderes';

// Os quadros da Leslie e do Grow não têm as âncoras da forma de anjo: ficam neutras (nunca são lidas).
const SEM_ANCORAS = { olhos: [], ombro: [0, 0], tarja: [0, 0, 0, 0] } as const;

export function quadroPersonagem(heroi: Heroi, animacao: NomeAnimacao, quadro: number, forma: Forma = 'base'): QuadroPersonagem {
  if (heroi === 'anjo') return QUADROS_ANJO[animacao][quadro];
  const tabela = heroi === 'leslie' ? QUADROS_LESLIE : heroi === 'margo' ? QUADROS_MARGO : forma === 'golem' ? QUADROS_GOLEM : QUADROS_GROW;
  const { w, h } = tabela[animacao][quadro];
  return { w, h, ...SEM_ANCORAS };
}

type Recorte = { x: number; y: number; w: number; h: number; ax: number; axAnjo?: number; pedra?: readonly number[] };
type TabelaDeQuadros = Record<NomeAnimacao, readonly Recorte[]> & { morto?: readonly Recorte[]; retrato?: readonly Recorte[]; golpe?: readonly Recorte[] };

// `anjo`: usa o eixo do sprite do anjo — de lado a cabeça dele recua, e o eixo recua junto para
// a cabeça ficar no mesmo ponto do mapa nas duas formas.
function recortar(folha: HTMLImageElement, tabela: TabelaDeQuadros, anjo: boolean): AnimacoesPersonagem {
  const animacoes = {} as AnimacoesPersonagem;
  (Object.keys(tabela) as (NomeAnimacao | 'morto' | 'retrato' | 'golpe')[]).forEach((nome) => {
    animacoes[nome] = (tabela[nome] ?? []).map((q) => {
      const canvas = novoCanvas(q.w, q.h);
      contexto2d(canvas).drawImage(folha, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
      return { imagem: canvas, eixo: anjo ? (q.axAnjo ?? q.ax) : q.ax, pedra: q.pedra };
    });
  });
  return animacoes;
}

// Os sprites de cada personagem, por forma: todos têm a base; o Anjo, a de anjo; o Grow, a de golem
// e, de gente, a sem o cajado na mão (no modo arma o cajado vai nas costas: grow/cajado.ts); a
// Margo, a sem o rolo na mão (no Bumerangue).
export type SpritesDosHerois = Record<
  Heroi,
  { base: AnimacoesPersonagem; semCajado?: AnimacoesPersonagem; semRolo?: AnimacoesPersonagem } & Partial<Record<Forma, AnimacoesPersonagem>>
>;

// O Anjo também carrega (a arte é pequena), mesmo guardado: é só ligar para ele voltar.
export async function carregarHerois(): Promise<SpritesDosHerois> {
  const [leslie, anjoBase, anjoAnjo, growBase, growGolem, growSemCajado, margoBase, margoSemRolo] = await Promise.all([
    carregarImagem(urlLeslie),
    carregarImagem(urlAnjoBase),
    carregarImagem(urlAnjoAnjo),
    carregarImagem(urlGrowBase),
    carregarImagem(urlGrowGolem),
    carregarImagem(urlGrowSemCajado),
    carregarImagem(urlMargoBase),
    carregarImagem(urlMargoSemRolo),
    carregarAguias(), // as águias da Revoada do Grow
    carregarGanso(), // o ganso da Margo (e o Ganso Raivoso)
    carregarFlor(), // a Flor Carnívora da Leslie
  ]);
  return {
    leslie: { base: recortar(leslie, QUADROS_LESLIE, false) },
    anjo: { base: recortar(anjoBase, QUADROS_ANJO, false), anjo: recortar(anjoAnjo, QUADROS_ANJO, true) },
    grow: {
      base: recortar(growBase, QUADROS_GROW, false),
      golem: recortar(growGolem, QUADROS_GOLEM, false),
      semCajado: recortar(growSemCajado, QUADROS_GROW, false),
    },
    margo: { base: recortar(margoBase, QUADROS_MARGO, false), semRolo: recortar(margoSemRolo, QUADROS_MARGO, false) },
  };
}

// ---- Corpo ----

const QUADRO_MORTO = 0.14; // segundos por quadro caindo, até ficar deitado
const DURACAO_QUADRO: Record<NomeAnimacao, number> = {
  parado: 0.6,
  andando: 0.11,
  subindo: 0.2,
  caindo: 0.2,
  atacando: 1, // um quadro só: não é animação do estado, só a pose de atacar parado
};
// A rolada da Margo: a fileira ATTACK inteira no tempo do golpe (ROLO.golpe).
const QUADROS_DA_ROLADA = 7;

const VELOCIDADE = 90; // pixels por segundo (o golem, MOVIMENTO_GOLEM)
const FORCA_PULO = 240; // pixels por segundo — segurando o botão, sobe ~45px
// Forma base: apertar pulo de novo no ar dá um segundo pulo, uma vez só até pisar no chão.
// Segurando os dois, chega a ~80px — um pouco abaixo do anjo, que ainda por cima plana.
const FORCA_PULO_DUPLO = 210; // pixels por segundo — segurando o botão, sobe mais ~34px
const CORTE_PULO = 90; // pixels por segundo — ao soltar na subida, a velocidade cai para isto
const GRAVIDADE = 640; // pixels por segundo²
// Dash: dois toques no mesmo lado dão um arranco curto para lá, nas duas formas, no chão ou no ar.
const JANELA_TOQUE_DUPLO = 0.25; // segundos entre o primeiro toque e o segundo
export const VELOCIDADE_DASH = 300; // pixels por segundo
const DURACAO_DASH = 0.14; // segundos — anda ~42px, contra ~13px andando no mesmo tempo
const RECARGA_DASH = 0.45; // segundos depois de um dash até o próximo
// Soltou o lado correndo: segue para lá por este tempo. Cobre o vão de um toque rápido (soltar e
// apertar de novo para o dash) sem o corpo frear; parando de verdade, escorrega só ~9px.
const EMBALO = 0.1; // segundos
// Voo do anjo: o pulo vai um pouco mais alto que o longo. No alto, o voo com pairada
// (voo-anjo.ts, ligado em PAIRAR_NO_AR) para um instante e desce planando sozinho. Desligado,
// vale o voo antigo: segurando o botão na descida, ele desce planando devagar, batendo as asas;
// soltou, volta a gravidade inteira e ele despenca (QUEDA_PLANANDO e FREIO_ASAS são desse).
const FORCA_PULO_ANJO = 330; // pixels por segundo — segurando o botão, sobe ~85px
const QUEDA_PLANANDO = 30; // pixels por segundo — a descida lenta, planando
const FREIO_ASAS = 1200; // pixels por segundo² — apertou de novo caindo: as asas freiam a queda
// O sprite é desenhado alguns pixels abaixo da linha do chão: os pés afundam na grama em vez
// de ficar equilibrados na borda de cima dela.
const AFUNDAR_NA_GRAMA = 2;
// Os poderes do anjo tiram vida; chegando a 0, ele cai e a partida acaba.
export { VIDA_MAXIMA };
// De onde saem os poderes: o peito, acima dos pés (o golem é mais alto).
const ALTURA_DO_PEITO = 18;
const ALTURA_DO_PEITO_GOLEM = 26;
// O empurrão (vento, trombada) vai sumindo: no chão, o atrito freia rápido; no ar, devagar.
const FREIO_EMPURRAO = { chao: 5, ar: 1.5 }; // por segundo
// Enfeitiçado, anda até quem o acertou e para a esta distância dele.
const PERTO_DO_DONO = 14;
// O gesto de soltar um poder: o braço sai do ombro na direção da mira, fica um instante e volta.
const GESTO = { duracao: 0.34, braco: 10 }; // segundos e pixels
// De frente (o quadro "parado"), a mão da frente do próprio sprite: px para o lado do eixo e a
// linha do quadro. Parado com uma arma, ela fica nessa mão, sem o braço esticado.
const MAO_DE_FRENTE: Record<Heroi, { lado: number; linha: number }> = {
  anjo: { lado: 5, linha: 23 },
  leslie: { lado: 3, linha: 17 },
  grow: { lado: 5, linha: 19 },
  margo: { lado: 4, linha: 18 },
};
// O braço que segura a arma: a manga do moletom do Anjo, a pele da Leslie e do Grow.
const BRACO_DA_ARMA: Record<Heroi, CoresBraco> = { anjo: BRACO_BASE, leslie: BRACO_LESLIE, grow: BRACO_GROW, margo: BRACO_MARGO };
const BRACO_DO_PODER: Record<Heroi, { cores: CoresBraco; brilho: string }> = {
  anjo: { cores: BRACO_ANJO, brilho: '255, 95, 162' }, // rosa
  leslie: { cores: BRACO_LESLIE, brilho: '143, 212, 90' }, // verde
  grow: { cores: BRACO_GROW, brilho: '214, 236, 170' }, // o verde-claro do vento
  margo: { cores: BRACO_MARGO, brilho: '255, 246, 224' }, // o branco da farinha
};

// Os botões de um quadro: segurados ou não.
export interface Controles {
  esquerda: boolean;
  direita: boolean;
  pular: boolean;
  transformar: boolean;
}

// `x` é o eixo do corpo e `y` a linha dos pés: os quadros variam de largura e altura, o apoio não.
export interface Personagem {
  heroi: Heroi;
  modo: Modo; // só a Leslie: o que o clique esquerdo usa
  x: number;
  y: number;
  vx: number;
  vy: number;
  direcao: 1 | -1; // 1 = direita, -1 = esquerda
  noChao: boolean;
  planando: boolean; // descendo devagar com o botão de pulo segurado (só o anjo)
  puloDuplo: boolean; // ainda pode dar o segundo pulo neste voo (só a forma base)
  pularSegurado: boolean;
  transformarSegurado: boolean;
  esquerdaSegurada: boolean;
  direitaSegurada: boolean;
  ultimoToque: -1 | 0 | 1; // lado do último toque que ainda pode virar dash (0 = nenhum)
  janelaToque: number; // segundos que ainda faltam para o segundo toque valer
  embalo: number; // soltou o lado correndo: segundos que ainda segue para lá (o toque rápido de novo)
  dash: number; // segundos de dash que ainda faltam (0 = sem dash)
  recargaDash: number; // segundos até poder dar outro dash
  animacao: NomeAnimacao;
  quadro: number;
  tempoQuadro: number;
  vida: number; // de 0 a VIDA_MAXIMA
  morte: number; // segundos desde que a vida chegou a 0 (a queda até ficar deitado)
  ferido: number; // segundos do piscar de quem acabou de apanhar
  encanto: Encanto | null; // enfeitiçado pela Rajada: só anda, devagar, até quem o acertou
  preso: number; // segundos presos pelas Raízes da Leslie: não anda nem pula (0 = livre)
  veneno: number; // segundos envenenado pelo Chicote da Leslie (0 = limpo)
  venenoTique: number;
  lento: number; // segundos enfarinhado pela Farinha da Margo: anda devagar e sem arranco (0 = livre)
  gesto: { resta: number; angulo: number } | null; // o braço soltando um poder
  poderes: Poderes;
  arma: ArmaNaMao | null; // a espada ou o arco na mão (só a forma base)
  ataque: Ataque | null; // o golpe, a flechada ou o soco em curso
  recargaSoco: number; // segundos até o próximo soco (sem arma)
  // O Grow, de gente: a arma e o soco são da mão de trás (braco.ts); o cajado vai nas costas no
  // modo arma e na mão no modo poderes.
  maoLivreAtras: boolean;
  energia: number; // energia pixy, de 0 a ENERGIA_PIXY.maxima: vem do dano dado, enche a barra do anjo
  daRede: boolean; // o outro jogador online: a forma, o modo e a energia dele vêm da rede
  voo: Voo; // o voo com pairada do anjo (anjo/voo.ts)
  anjo: Anjo; // a transformação do Anjo (os outros têm uma parada, que nunca muda)
  golem: Golem; // a transformação do Grow em golem (idem)
  manobra: Manobra | null; // o Salto ou a Investida do golem levando o corpo
  canalizando: boolean; // o Grow soprando o Vendaval: fica parado
  levado: number; // segundos carregado pela Revoada (sem andar nem cair)
  empurrao: number; // px/s de empurrão de lado, que vai sumindo
  medida: Medida; // o corpo para os acertos (o golem é maior)
  defesa: number; // parte do dano que absorve (o golem)
  pesado: boolean; // o golem
  rastro: Rastro; // os efeitos do dash e do pulo duplo
  roloFora: boolean; // a Margo: o rolo está voando (o Bumerangue), a mão vazia
  ganso: Companheiro; // o ganso da Margo, que anda atrás dela (os outros têm um, parado e invisível)
}

let ANIMACOES: SpritesDosHerois;
let yChao = 0;

export function prepararPersonagens(animacoes: SpritesDosHerois, yDoChao: number): void {
  ANIMACOES = animacoes;
  yChao = yDoChao;
}

// Os quadros de um personagem, na forma dele.
export function spritesDo(heroi: Heroi, forma: Forma = 'base'): AnimacoesPersonagem {
  return ANIMACOES[heroi][forma] ?? ANIMACOES[heroi].base;
}

// O cajado do Grow, de gente: na mão só para os poderes. No modo arma (a arma do chão ou o soco)
// ele vai nas costas (grow/cajado.ts) e o corpo é o da folha sem o cajado na mão.
export function cajadoNasCostas(p: Personagem): boolean {
  return p.heroi === 'grow' && formaDo(p) === 'base' && p.modo === 'arma' && p.vida > 0;
}

// Os poderes do Grow, de gente, saem da pedra do cajado: sem braço esticado, ela brilha.
function pelaPedra(p: Personagem): boolean {
  return p.heroi === 'grow' && formaDo(p) === 'base';
}

// Os quadros que aparecem agora: os da forma, os do Grow sem o cajado na mão ou os da Margo sem o
// rolo (ele está voando).
function quadrosDo(p: Personagem): AnimacoesPersonagem {
  const semCajado = cajadoNasCostas(p) ? ANIMACOES.grow.semCajado : undefined;
  const semRolo = p.heroi === 'margo' && p.roloFora && p.vida > 0 ? ANIMACOES.margo.semRolo : undefined;
  return semCajado ?? semRolo ?? spritesDo(p.heroi, formaDo(p));
}

export function criarPersonagem(heroi: Heroi, x: number, direcao: 1 | -1 = 1): Personagem {
  return {
    heroi,
    modo: 'arma',
    x,
    y: yChao,
    vx: 0,
    vy: 0,
    direcao,
    noChao: true,
    planando: false,
    puloDuplo: false,
    pularSegurado: false,
    transformarSegurado: false,
    esquerdaSegurada: false,
    direitaSegurada: false,
    ultimoToque: 0,
    janelaToque: 0,
    embalo: 0,
    dash: 0,
    recargaDash: 0,
    animacao: 'parado',
    quadro: 0,
    tempoQuadro: 0,
    vida: VIDA_MAXIMA,
    morte: 0,
    ferido: 0,
    encanto: null,
    preso: 0,
    veneno: 0,
    venenoTique: 0,
    lento: 0,
    gesto: null,
    poderes: criarPoderes(heroi),
    arma: null,
    ataque: null,
    recargaSoco: 0,
    maoLivreAtras: heroi === 'grow',
    energia: 0,
    daRede: false,
    voo: criarVoo(),
    anjo: criarAnjo(),
    golem: criarGolem(),
    manobra: null,
    canalizando: false,
    levado: 0,
    empurrao: 0,
    medida: CORPO,
    defesa: 0,
    pesado: false,
    rastro: criarRastro(),
    roloFora: false,
    ganso: criarCompanheiro(x, direcao),
  };
}

export function formaDo(p: Personagem): Forma {
  if (p.heroi === 'anjo') return formaAtual(p.anjo);
  if (p.heroi === 'grow') return p.golem.forma;
  return 'base';
}

// Quanta energia pixy o poder pede (e gasta): os da Leslie e os do Grow de gente (o terceiro,
// virar golem, a barra cheia). O Anjo e o golem não gastam nos poderes.
export function custoDeEnergia(p: Personagem, poder: IdPoder = poderEscolhido(p.poderes)): number {
  const tabela: Partial<Record<IdPoder, number>> =
    p.heroi === 'leslie' ? ENERGIA_PIXY.custoLeslie : p.heroi === 'grow' ? ENERGIA_PIXY.custoGrow : p.heroi === 'margo' ? ENERGIA_PIXY.custoMargo : {};
  return tabela[poder] ?? 0;
}

// O clique esquerdo usa os poderes? O Anjo, de anjo; o golem, sempre; a Leslie e o Grow de
// gente, no modo poderes.
export function usaPoderes(p: Personagem): boolean {
  if (p.heroi === 'anjo') return formaDo(p) === 'anjo';
  if (formaDo(p) === 'golem') return true;
  return p.modo === 'poderes';
}

export function peitoDo(p: Personagem): { x: number; y: number } {
  return { x: p.x, y: p.y - (formaDo(p) === 'golem' ? ALTURA_DO_PEITO_GOLEM : ALTURA_DO_PEITO) };
}

// Por que o poder escolhido não sai agora (null = sai): vivo e sem estar enfeitiçado; o Anjo, só
// já transformado (não no meio da luz); a Leslie e o Grow de gente, no modo poderes e com a
// energia pixy do poder escolhido (começam vazios: primeiro se ganha energia dando dano com as
// armas) — o golem do Grow, também com a recarga dele pronta; o golem, fora de um Salto ou de
// uma Investida.
export function bloqueioDosPoderes(p: Personagem): string | null {
  if (p.vida <= 0) return 'CAIU';
  if (p.encanto) return 'ENFEITICADO';
  if (p.heroi === 'anjo') {
    if (formaDo(p) !== 'anjo' || !personagemLivre(p)) return 'SO NA FORMA DE ANJO';
    return null;
  }
  if (!personagemLivre(p)) return 'TRANSFORMANDO';
  if (p.manobra) return 'NO MEIO DO GOLPE';
  if (formaDo(p) === 'golem') return null;
  if (p.modo !== 'poderes') return 'ESCOLHA UM PODER (BOTAO DIREITO)';
  if (poderEscolhido(p.poderes) === 'golem' && p.golem.recarga > 0) return `GOLEM EM RECARGA: ${Math.ceil(p.golem.recarga)}S`;
  const custo = custoDeEnergia(p);
  if (p.energia < custo) return `ENERGIA PIXY: ${Math.floor(p.energia)} DE ${custo}`;
  return null;
}

export function podeUsarPoderes(p: Personagem): boolean {
  return bloqueioDosPoderes(p) === null;
}

// O mesmo para a arma da mão, na forma base (null = ataca, se a recarga dela deixar). Na Margo, o
// rolo: sem ele na mão (voando, no Bumerangue), nada de rolada.
export function bloqueioDaArma(p: Personagem): string | null {
  if (p.vida <= 0) return 'CAIU';
  if (p.encanto) return 'ENFEITICADO';
  if (!personagemLivre(p)) return 'TRANSFORMANDO';
  // O golem não pega arma nem soca: as mãos de pedra são dos poderes dele.
  if (formaDo(p) !== 'base') return 'SO PODERES'; // (a fonte do painel não tem acento)
  if (p.heroi === 'margo' && p.roloFora) return 'O ROLO ESTA VOANDO';
  return null;
}

// A arma (ou, sem ela, o soco) sai pronta se clicar agora?
export function armaPronta(p: Personagem): boolean {
  return bloqueioDaArma(p) === null && (p.arma ? p.arma.recarga : p.recargaSoco) <= 0;
}

// Só a forma base pega arma: vivo, com a mão livre e fora da transformação. A Margo nunca: idosa, a
// arma dela é o rolo de massa.
export function podePegarArma(p: Personagem): boolean {
  return p.heroi !== 'margo' && p.vida > 0 && !p.arma && formaDo(p) === 'base' && personagemLivre(p);
}

// Começou a virar anjo ou golem (ou já é) com uma arma na mão: ela cai no chão.
export function precisaLargarArma(p: Personagem): boolean {
  return p.arma !== null && (formaDo(p) !== 'base' || !personagemLivre(p));
}

// Começa a virar golem (o terceiro poder do Grow saiu; ou, online, o do outro chegou pela rede).
export function virarGolem(p: Personagem): void {
  if (p.heroi === 'grow' && formaDo(p) === 'base') alternarGolem(p.golem, true);
}

// A forma do outro online ficou diferente da recebida (um aviso se perdeu): troca aqui também.
export function trocarFormaNaMarra(p: Personagem): void {
  if (p.heroi === 'anjo') alternarForma(p.anjo, true);
  else if (p.heroi === 'grow' && !p.manobra) alternarGolem(p.golem, true);
}

// Vira o corpo para o lado de onde o poder foi mirado e estica o braço para lá. O Julgamento
// vem do céu: o braço aponta para cima, um pouco para a frente.
export function gesticular(p: Personagem, alvo: { x: number; y: number }, paraCima = false): void {
  if (Math.abs(alvo.x - p.x) >= 1 && p.dash <= 0) p.direcao = alvo.x > p.x ? 1 : -1;
  // O golem não estica braço de gente: vira para lá e faz a pose de golpe dele.
  const ombro = ombroDe(p);
  const angulo = paraCima ? Math.atan2(-1, p.direcao * 0.35) : Math.atan2(alvo.y - ombro.y, alvo.x - ombro.x);
  p.gesto = { resta: GESTO.duracao, angulo };
}

// A ponta do braço esticado no gesto: de onde os poderes saem (sem gesto, o peito). O Grow, de
// gente, os solta pela pedra do cajado.
export function maoDo(p: Personagem): { x: number; y: number } {
  if (!p.gesto || formaDo(p) === 'golem') return peitoDo(p);
  if (pelaPedra(p)) return pedraDoCajado(p) ?? peitoDo(p);
  const ombro = ombroDe(p);
  const braco = GESTO.braco + maisBraco(p);
  return { x: ombro.x + Math.cos(p.gesto.angulo) * braco, y: ombro.y + Math.sin(p.gesto.angulo) * braco };
}

// Foto do painel: a pose de frente na forma atual, do alto da cabeça (com uma folguinha em cima)
// até a borda de baixo da moldura — o corpo vai até o fim do quadro, sem sobrar vazio embaixo.
// Todos com 32 px em pé na foto (o golem tem um quadro só para ela, do mesmo tamanho: grandão
// como no jogo, ele parecia mais perto que os outros), então todas cortam no mesmo ponto do corpo.
// O anjo, com as asas abertas atrás dos ombros, os olhos de coração e a auréola (em cima dele
// sobra o lugar dela nas duas formas, para a cabeça ficar no mesmo ponto da foto quando ele se
// transforma; dos lados, o das asas). Uma por forma, feita uma vez.
export const LARGURA_RETRATO = 26; // a foto por dentro da moldura: sobra dos lados para as asas
export const ALTURA_RETRATO = 28; // por dentro da moldura (o painel: da barra de vida até os espaços)
const FOLGA_NO_ALTO = 2; // entre o alto da moldura e a cabeça
const retratos = new Map<string, HTMLCanvasElement>();

// Onde pôr a imagem para as colunas com pixel (nas `linhas` de cima, as que aparecem na foto)
// ficarem no meio da largura da foto.
function centrarNaFoto(imagem: HTMLCanvasElement, linhas: number): number {
  const { data } = contexto2d(imagem).getImageData(0, 0, imagem.width, linhas);
  let min = imagem.width;
  let max = -1;
  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < imagem.width; x++) {
      if (data[(y * imagem.width + x) * 4 + 3] === 0) continue;
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
  }
  if (max < 0) return (LARGURA_RETRATO - imagem.width) >> 1;
  return ((LARGURA_RETRATO - (max - min + 1)) >> 1) - min;
}

export function retratoDo(p: Personagem): HTMLCanvasElement {
  return retrato(p.heroi, formaDo(p));
}

export function retrato(heroi: Heroi, forma: Forma = 'base'): HTMLCanvasElement {
  const chave = `${heroi}-${forma}`;
  const pronto = retratos.get(chave);
  if (pronto) return pronto;

  const sprites = spritesDo(heroi, forma);
  const { imagem, eixo } = (sprites.retrato ?? sprites.parado)[0];
  const y = heroi === 'anjo' ? ALTURA_AUREOLA : FOLGA_NO_ALTO;
  const linhas = Math.min(imagem.height, ALTURA_RETRATO - y);
  const foto = novoCanvas(LARGURA_RETRATO, ALTURA_RETRATO);
  const ctx = contexto2d(foto);
  // No meio da moldura: o eixo do corpo (o cajado do Grow sobra para o lado); o golem, largo e
  // quase do tamanho da foto, pelo que aparece dele, e mais 1px para a direita: ele tem 25px numa
  // foto de 26, e o braço grande do lado esquerdo pesa mais (encostado na borda, parecia torto).
  const x = forma === 'golem' ? centrarNaFoto(imagem, linhas) + 1 : Math.round(LARGURA_RETRATO / 2 - eixo);
  const quadro = quadroPersonagem(heroi, 'parado', 0);
  if (forma === 'anjo') desenharAsasDoRetrato(ctx, quadro, x, y);
  ctx.drawImage(imagem, 0, 0, imagem.width, linhas, x, y, imagem.width, linhas);
  if (forma === 'anjo') enfeitarRetratoDeAnjo(ctx, quadro, eixo, x, y);
  retratos.set(chave, foto);
  return foto;
}

// Quanto sobra em cima da cabeça além do corpo: a auréola do anjo (0 na forma base). O nome
// em cima dele sobe este tanto.
export function acimaDaCabeca(p: Personagem): number {
  if (p.heroi === 'anjo') return alturaDaAureola(p.anjo);
  // O golem é bem mais alto: o nome sobe junto (pela altura dele parado, para não pular a cada
  // quadro). Carregado pelas águias, o nome fica acima delas.
  // Caído, o nome desce junto com ele, deitado.
  const morto = spriteMorto(p);
  if (morto) return morto.imagem.height - AFUNDAR_NA_GRAMA - 31;
  const aguias = p.levado > 0 ? 16 : 0;
  return Math.max(0, spritesDo(p.heroi, formaDo(p)).parado[0].imagem.height - AFUNDAR_NA_GRAMA - 31) + aguias;
}

// Enquanto a luz (ou a pedra) da transformação sobe, o corpo não responde aos botões.
export function personagemLivre(p: Personagem): boolean {
  return !transformando(p.anjo) && !golemTransformando(p.golem);
}

function animacaoDoEstado(p: Personagem): NomeAnimacao {
  if (p.levado > 0) return 'caindo';
  if (!p.noChao) return p.vy < 0 ? 'subindo' : 'caindo';
  return p.vx !== 0 ? 'andando' : 'parado';
}

function avancarAnimacao(p: Personagem, dt: number): void {
  const animacao = animacaoDoEstado(p);
  if (animacao !== p.animacao) {
    p.animacao = animacao;
    p.quadro = 0;
    p.tempoQuadro = 0;
    return;
  }
  // Planando, o corpo fica numa pose só e quem se mexe são as asas: os dois quadros da queda
  // têm a cabeça 1 px fora do lugar um do outro, e alterná-los por segundos a fio fazia a
  // cabeça ir e voltar.
  if (p.planando) {
    p.quadro = 0;
    p.tempoQuadro = 0;
    return;
  }

  p.tempoQuadro += dt;
  // Na Investida o golem corre com as pernas em dobro.
  const passo = DURACAO_QUADRO[animacao] * (p.manobra?.tipo === 'investida' ? 0.5 : 1);
  if (p.tempoQuadro >= passo) {
    p.tempoQuadro -= passo;
    p.quadro = (p.quadro + 1) % spritesDo(p.heroi, formaDo(p))[animacao].length;
  }
}

// O quadro que aparece: parado, ele olha para a tela (com a arma, se tiver, na mão do sprite);
// soltando um poder ou atacando com a arma, vira de lado, em pé e com as pernas juntas, para o
// braço sair para o lado da mira. Correndo ou no ar, o ataque vai por cima do quadro de sempre.
// A rolada da Margo é a própria folha: o quadro da fileira ATTACK no ponto do golpe.
function quadroMostrado(p: Personagem): { animacao: NomeAnimacao | 'golpe'; quadro: number } {
  if (p.ataque?.tipo === 'rolo') {
    return { animacao: 'golpe', quadro: Math.min(QUADROS_DA_ROLADA - 1, Math.floor((p.ataque.idade / ROLO.golpe) * QUADROS_DA_ROLADA)) };
  }
  // Agachando para o Salto ou batendo o pé antes da Investida: a pose de golpe do golem.
  if (p.manobra && p.manobra.idade < p.manobra.espera) return { animacao: 'atacando', quadro: 0 };
  if ((p.gesto || p.ataque || p.canalizando) && p.animacao === 'parado') return { animacao: 'atacando', quadro: 0 };
  return { animacao: p.animacao, quadro: p.quadro };
}

// Caído: a queda da fileira DIE, parando no último quadro (deitado).
function spriteMorto(p: Personagem): Sprite | null {
  if (p.vida > 0) return null;
  const quadros = spritesDo(p.heroi, formaDo(p)).morto;
  if (!quadros?.length) return null;
  return quadros[Math.min(quadros.length - 1, Math.floor(p.morte / QUADRO_MORTO))];
}

function spriteAtual(p: Personagem): Sprite {
  const morto = spriteMorto(p);
  if (morto) return morto;
  const { animacao, quadro } = quadroMostrado(p);
  const quadros = (animacao === 'golpe' ? spritesDo(p.heroi).golpe : quadrosDo(p)[animacao]) ?? quadrosDo(p).atacando;
  return quadros[Math.min(quadro, quadros.length - 1)];
}

// A pedra na ponta do cajado do Grow, no mapa (null sem o cajado na mão).
function pedraDoCajado(p: Personagem): { x: number; y: number } | null {
  const { pedra } = spriteAtual(p);
  if (!pedra) return null;
  const { x, topo, eixo, direcao } = poseDe(p);
  return { x: x + direcao * (pedra[0] + 0.5 - eixo), y: topo + pedra[1] + 0.5 };
}

// A tinta das cópias do dash: a da Leslie, a do Grow (ou do golem), a da Margo ou a da forma do Anjo.
const tintaDo = (p: Personagem): TintaRastro =>
  p.heroi === 'leslie' ? 'leslie' : p.heroi === 'margo' ? 'margo' : p.heroi === 'grow' ? (formaDo(p) === 'golem' ? 'golem' : 'grow') : formaDo(p) === 'anjo' ? 'anjo' : 'base';

function poseDe(p: Personagem): Pose {
  const { imagem, eixo } = spriteAtual(p);
  const { animacao, quadro } = quadroMostrado(p);
  const morto = spriteMorto(p) !== null;
  return {
    quadro:
      morto || animacao === 'golpe'
        ? { w: imagem.width, h: imagem.height, ...SEM_ANCORAS }
        : quadroPersonagem(p.heroi, animacao, Math.min(quadro, spritesDo(p.heroi, formaDo(p))[animacao].length - 1), formaDo(p)),
    imagem,
    eixo,
    x: Math.round(p.x),
    topo: Math.round(p.y) - imagem.height + AFUNDAR_NA_GRAMA,
    direcao: p.direcao,
    // Parado, todos olham para a tela — o golem também (ele é um personagem, não um efeito).
    deFrente: animacao === 'parado' && !morto,
  };
}

// `toque`: o lado que acabou de ser apertado neste quadro (0 = nenhum); `solto`: o lado que acabou
// de ser solto, sem o outro apertado. O segundo toque no mesmo lado dentro da janela dispara o
// dash; um toque no outro lado recomeça a contagem. Soltar também abre a janela, como o pulo
// duplo: correndo, basta soltar e apertar de novo rápido, sem parar antes. E, nesse meio-tempo,
// o corpo segue no embalo em vez de frear.
function atualizarDash(p: Personagem, toque: -1 | 0 | 1, solto: -1 | 0 | 1, dt: number): void {
  p.dash = Math.max(0, p.dash - dt);
  p.recargaDash = Math.max(0, p.recargaDash - dt);
  p.janelaToque = Math.max(0, p.janelaToque - dt);
  p.embalo = Math.max(0, p.embalo - dt);
  if (solto !== 0 && p.recargaDash <= 0) {
    // Com a janela do aperto ainda aberta foi só um toque, não uma corrida: sem embalo.
    p.embalo = p.janelaToque > 0 ? 0 : EMBALO;
    p.ultimoToque = solto;
    p.janelaToque = JANELA_TOQUE_DUPLO;
    return;
  }
  if (toque === 0) return;

  if (toque === p.ultimoToque && p.janelaToque > 0) {
    comecarDash(p, toque);
  } else {
    p.ultimoToque = toque;
    p.janelaToque = JANELA_TOQUE_DUPLO;
  }
}

// Também chamado de fora para o outro jogador online, quando o estado dele chega em dash e o
// toque duplo dele se perdeu no caminho. Não faz nada se ainda está na recarga.
export function comecarDash(p: Personagem, lado: 1 | -1): void {
  // Enfarinhado (a Farinha da Margo) não dá o arranco.
  if (p.recargaDash > 0 || !personagemLivre(p) || p.lento > 0) return;
  p.dash = DURACAO_DASH;
  p.recargaDash = DURACAO_DASH + RECARGA_DASH;
  p.direcao = lado;
  // Um terceiro toque logo em seguida não emenda outro dash: precisa de dois toques novos.
  p.ultimoToque = 0;
  p.janelaToque = 0;
  p.embalo = 0;
  marcarDash(p.rastro, poseDe(p), tintaDo(p), p.x, p.y, p.noChao);
}

// Enfeitiçado, os botões não mandam: ele anda até quem o acertou e para perto dele.
function controlesDoEncanto(p: Personagem, encanto: Encanto): Controles {
  const dx = encanto.dono.x - p.x;
  return { esquerda: dx < -PERTO_DO_DONO, direita: dx > PERTO_DO_DONO, pular: false, transformar: false };
}

// O poder `i` da lista está carregado: a recarga acabou e há energia pixy para ele (o golem, a
// recarga da transformação também). Só os carregados podem ser escolhidos.
export function poderCarregado(p: Personagem, i: number): boolean {
  const poder = p.poderes.lista[i];
  if (p.poderes.recarga[i] > 0) return false;
  if (poder === 'golem' && p.golem.recarga > 0) return false;
  return p.energia >= custoDeEnergia(p, poder);
}

// Ficou sem energia pixy para o poder escolhido (acabou de gastar nele, ou de gastar em outro): o
// quadrinho verde volta para trás, para o carregado anterior a ele — na Leslie e no Grow de gente,
// até a arma (ou o soco), no começo da fileira. Sem nenhum antes, procura do fim da fileira para
// trás (o Anjo de anjo e o golem, que não têm arma). Só o seu: o do outro online vem da rede.
// A recarga sozinha não volta (o quadrinho mostra quanto falta), nem com o Vendaval soprando.
export function voltarSeSemEnergia(p: Personagem): void {
  if (p.daRede || p.canalizando) return;
  if (p.heroi === 'anjo' && formaDo(p) !== 'anjo') return;
  const comArma = p.heroi !== 'anjo' && formaDo(p) === 'base';
  if (comArma && p.modo === 'arma') return;
  const { poderes } = p;
  if (p.energia >= custoDeEnergia(p, poderEscolhido(poderes))) return;
  for (let i = poderes.selecionado - 1; i >= 0; i--) {
    if (!poderCarregado(p, i)) continue;
    poderes.selecionado = i;
    return;
  }
  if (comArma) {
    p.modo = 'arma';
    return;
  }
  for (let i = poderes.lista.length - 1; i > poderes.selecionado; i--) {
    if (!poderCarregado(p, i)) continue;
    poderes.selecionado = i;
    return;
  }
}

// Botão direito: passa para o próximo quadrinho da fileira. Na Leslie e no Grow de gente a fileira
// é a arma (ou o soco) e os três poderes, e a volta fecha no começo: arma, 1, 2, 3, arma… (a
// arma na mão no primeiro; os poderes e as imagens deles nos outros). Poder que não está carregado
// é pulado; se nenhum outro serve, a escolha fica onde está. O Anjo de anjo e o golem não têm
// arma: passam só pelos poderes carregados. Na forma base do Anjo não há o que escolher.
export function passarSelecao(p: Personagem): void {
  const { poderes } = p;
  const comArma = p.heroi !== 'anjo' && formaDo(p) === 'base';
  if (p.heroi === 'anjo' && formaDo(p) !== 'anjo') return;
  // -1 é o quadrinho da arma; 0, 1, 2 são os poderes.
  const fileira = poderes.lista.map((_, i) => i);
  if (comArma) fileira.unshift(-1);
  const agora = comArma && p.modo === 'arma' ? -1 : poderes.selecionado;
  const posicao = fileira.indexOf(agora);
  for (let passo = 1; passo < fileira.length; passo++) {
    const quadrinho = fileira[(posicao + passo) % fileira.length];
    if (quadrinho === -1) {
      p.modo = 'arma';
      return;
    }
    if (!poderCarregado(p, quadrinho)) continue;
    poderes.selecionado = quadrinho;
    if (comArma) p.modo = 'poderes';
    return;
  }
}

// Apertou R. O golem do Grow desfaz a pedra. O Anjo, na forma base, só vira anjo com a barra de energia pixy
// cheia e a recarga pronta (senão avisa o que falta) e a transformação gasta a energia. O outro
// online vira quando ele virou lá: a energia dele vem da rede e já chega gasta.
function apertouTransformar(p: Personagem): void {
  if (p.heroi === 'grow' && formaDo(p) === 'golem') {
    // De golem, o R desfaz a pedra antes do tempo (fora de um Salto ou de uma Investida).
    if (!p.manobra) alternarGolem(p.golem, p.daRede);
    return;
  }
  // A Leslie e o Grow de gente não trocam mais de modo no R: arma e poderes estão na mesma
  // fileira, e o botão direito passa por todos (passarSelecao).
  if (p.heroi !== 'anjo') return;
  const base = formaDo(p) === 'base' && !transformando(p.anjo);
  if (base && !p.daRede) {
    if (p.anjo.recarga > 0) return avisar(p.poderes, `ANJO EM RECARGA: ${Math.ceil(p.anjo.recarga)}S`);
    if (p.energia < ENERGIA_PIXY.custoAnjo) {
      return avisar(p.poderes, `ENERGIA PIXY: ${Math.floor(p.energia)} DE ${ENERGIA_PIXY.custoAnjo}`);
    }
  }
  if (alternarForma(p.anjo, p.daRede) && base && !p.daRede) p.energia -= ENERGIA_PIXY.custoAnjo;
}

// Pode virar anjo agora (para a CPU decidir): o Anjo na forma base, com a recarga pronta e a energia.
export function podeVirarAnjo(p: Personagem): boolean {
  return p.heroi === 'anjo' && anjoPronto(p.anjo) && p.energia >= ENERGIA_PIXY.custoAnjo;
}

// Pode virar golem agora (para a CPU decidir): o Grow de gente, com a recarga pronta e a barra cheia.
export function podeVirarGolem(p: Personagem): boolean {
  return p.heroi === 'grow' && golemPronto(p.golem) && p.energia >= ENERGIA_PIXY.custoGrow.golem;
}

// `p` tirou `dano` de vida do adversário: na forma base, carrega a energia pixy (de anjo ou de
// golem, não).
export function ganharEnergia(p: Personagem, dano: number): void {
  if (dano <= 0 || formaDo(p) !== 'base' || !personagemLivre(p)) return;
  const porDano =
    p.heroi === 'grow' ? ENERGIA_PIXY.porDanoGrow : p.heroi === 'anjo' ? ENERGIA_PIXY.porDanoAnjo : p.heroi === 'margo' ? ENERGIA_PIXY.porDanoMargo : ENERGIA_PIXY.porDano;
  p.energia = Math.min(ENERGIA_PIXY.maxima, p.energia + dano * porDano);
}

// O Salto e a Investida levam o corpo (o mesmo caminho nos dois lados online: sai do uso).
function seguirManobra(p: Personagem, m: Manobra, dt: number): void {
  m.idade += dt;
  const antes = { x: p.x, y: p.y };
  const ponto = pontoDaManobra(m, yChao);
  p.x = ponto.x;
  p.y = ponto.y;
  p.vx = dt > 0 ? (p.x - antes.x) / dt : 0;
  p.vy = dt > 0 ? (p.y - antes.y) / dt : 0;
  p.noChao = p.y >= yChao - 0.01;
  if (Math.abs(m.x1 - m.x0) >= 1) p.direcao = m.x1 > m.x0 ? 1 : -1;
  p.empurrao = 0;
  p.dash = 0;
  if (manobraAcabou(m)) {
    p.manobra = null;
    p.y = yChao;
    p.vy = 0;
    p.vx = 0;
    p.noChao = true;
  }
}

// O corpo para os acertos, a defesa e o peso: os do golem, de golem; os de gente, senão.
function ajustarCorpo(p: Personagem): void {
  const golem = formaDo(p) === 'golem';
  p.medida = golem ? CORPO_GOLEM : CORPO;
  p.defesa = golem ? DEFESA_GOLEM : 0;
  p.pesado = golem;
  if (p.heroi === 'grow') trocarLista(p.poderes, poderesDaForma(p.heroi, golem));
}

export function atualizarPersonagem(p: Personagem, recebidos: Controles, dt: number, tempo: number): void {
  if (p.encanto && (p.encanto.resta -= dt) <= 0) p.encanto = null;
  p.preso = Math.max(0, p.preso - dt);
  p.lento = Math.max(0, p.lento - dt);
  const encanto = p.encanto;
  // Preso pelas Raízes: não anda, não pula e não dá dash (os poderes e a arma continuam). Soprando
  // o Vendaval, também não; carregado pela Revoada ou no meio de um Salto ou de uma Investida,
  // quem manda no corpo é o poder.
  if (p.vida <= 0) {
    // Caiu: nada mais o prende nem o envenena; só a queda até o chão.
    p.morte += dt;
    p.encanto = null;
    p.preso = p.veneno = p.levado = p.lento = 0;
    p.canalizando = false;
    p.gesto = null;
  }
  const levado = p.levado > 0;
  p.levado = Math.max(0, p.levado - dt);
  const preso = p.preso > 0 || p.canalizando || levado || p.manobra !== null;
  const controles = encanto ? controlesDoEncanto(p, encanto) : recebidos;
  if (p.gesto && (p.gesto.resta -= dt) <= 0) p.gesto = null;
  // Soprando, o braço fica esticado para o lado do vento.
  if (p.canalizando && p.gesto) p.gesto.resta = Math.max(p.gesto.resta, GESTO.duracao / 2);
  // R alterna entre a forma base e a de anjo; durante a transformação o corpo não responde.
  if (controles.transformar && !p.transformarSegurado) apertouTransformar(p);
  p.transformarSegurado = controles.transformar;
  p.ferido = Math.max(0, p.ferido - dt);
  atualizarRecargas(p.poderes, dt);
  const livre = personagemLivre(p);

  const esquerda = livre && !preso && controles.esquerda;
  const direita = livre && !preso && controles.direita;
  const pular = livre && !preso && controles.pular;

  // Enfeitiçado não dá dash: os passos dele até o dono não contam como toques.
  const toque = encanto ? 0 : esquerda && !p.esquerdaSegurada ? -1 : direita && !p.direitaSegurada ? 1 : 0;
  const nenhum = !esquerda && !direita;
  const solto = encanto || !nenhum ? 0 : p.esquerdaSegurada ? -1 : p.direitaSegurada ? 1 : 0;
  atualizarDash(p, toque, solto, dt);
  if (!livre || encanto) p.dash = 0;
  p.esquerdaSegurada = esquerda;
  p.direitaSegurada = direita;

  const golem = formaDo(p) === 'golem';
  p.vx = 0;
  if (p.dash > 0) {
    // No dash o lado já está decidido: os botões só voltam a mandar quando ele acaba.
    p.vx = p.direcao * VELOCIDADE_DASH;
  } else {
    const normal = encanto ? RAJADA.andarEncantado : golem ? MOVIMENTO_GOLEM.velocidade : VELOCIDADE;
    const velocidade = p.lento > 0 ? normal * FARINHA.lento : normal;
    if (esquerda) {
      p.vx = -velocidade;
      p.direcao = -1;
    }
    if (direita) {
      p.vx = velocidade;
      p.direcao = 1;
    }
    if (nenhum && p.embalo > 0 && p.ultimoToque !== 0) p.vx = p.ultimoToque * velocidade;
  }
  const anjo = formaDo(p) === 'anjo';
  const apertouNoAr = pular && !p.pularSegurado && !p.noChao;
  // Só pula ao apertar de novo: segurar o botão no pouso não emenda outro pulo. No ar, a forma
  // base ainda tem o pulo duplo; o anjo não — apertar de novo caindo é o freio das asas.
  if (pular && !p.pularSegurado) {
    if (p.noChao) {
      p.vy = -(anjo ? FORCA_PULO_ANJO : golem ? MOVIMENTO_GOLEM.pulo : FORCA_PULO);
      p.noChao = false;
      p.puloDuplo = !anjo && !golem; // o golem é pesado demais para o segundo pulo
      if (anjo && PAIRAR_NO_AR) decolar(p.voo); // voo com pairada (voo-anjo.ts)
    } else if (p.puloDuplo && !anjo) {
      p.vy = -FORCA_PULO_DUPLO;
      p.puloDuplo = false;
      marcarPuloDuplo(p.rastro, p.x, p.y);
    }
  }

  // Soltar o botão ainda na subida corta o impulso: toque rápido = pulo curto, segurar = pulo alto.
  if (!pular && p.vy < -CORTE_PULO) {
    p.vy = -CORTE_PULO;
  }
  p.pularSegurado = pular;

  if (anjo && PAIRAR_NO_AR && !p.noChao) {
    // Voo com pairada (voo-anjo.ts): para no alto e desce planando sozinho.
    const voo = voarNoAr(p.voo, p.vy, apertouNoAr, GRAVIDADE, dt);
    p.vy = voo.vy;
    p.planando = voo.planando;
  } else {
    // Voo antigo — anjo descendo com o botão segurado: plana. Do alto do pulo a gravidade leva
    // à queda lenta sem tranco; vindo de uma queda rápida (soltou e apertou de novo), as asas a
    // freiam.
    p.planando = anjo && pular && !p.noChao && p.vy > 0;
    if (p.planando) {
      p.vy =
        p.vy < QUEDA_PLANANDO
          ? Math.min(QUEDA_PLANANDO, p.vy + GRAVIDADE * dt)
          : Math.max(QUEDA_PLANANDO, p.vy - FREIO_ASAS * dt);
    } else {
      p.vy += GRAVIDADE * dt;
    }
  }
  if (p.manobra) {
    seguirManobra(p, p.manobra, dt);
  } else if (levado) {
    // A Revoada põe o corpo onde ele está: aqui ele só não cai.
    p.vx = 0;
    p.vy = 0;
  } else {
    // Preso pelas Raízes, o empurrão não o arranca do lugar.
    p.x += (p.vx + (p.preso > 0 ? 0 : p.empurrao)) * dt;
    p.y += p.vy * dt;
  }
  p.empurrao *= Math.exp(-dt * (p.noChao ? FREIO_EMPURRAO.chao : FREIO_EMPURRAO.ar));
  if (Math.abs(p.empurrao) < 4) p.empurrao = 0;

  if (p.y >= yChao && !levado) {
    p.y = yChao;
    p.vy = 0;
    p.noChao = true;
    p.planando = false;
    p.puloDuplo = false;
  }

  avancarAnimacao(p, dt);
  p.maoLivreAtras = p.heroi === 'grow' && formaDo(p) === 'base';
  const { imagem, eixo } = spriteAtual(p);
  const esquerdaDoEixo = p.direcao === 1 ? eixo : imagem.width - eixo;
  p.x = Math.max(esquerdaDoEixo, Math.min(MUNDO - (imagem.width - esquerdaDoEixo), p.x));

  const pose = poseDe(p);
  atualizarRastro(p.rastro, dt, p.dash > 0, pose, tintaDo(p));
  if (p.heroi === 'anjo') atualizarAnjo(p.anjo, dt, tempo, p, pose);
  // Caído de golem, fica golem (a pedra não se desfaz em cima de quem perdeu).
  if (p.heroi === 'grow') atualizarGolem(p.golem, dt, p, p.manobra !== null || p.vida <= 0);
  if (p.heroi === 'margo') atualizarCompanheiro(p.ganso, p, dt);
  ajustarCorpo(p);
}

// A sombra fica no chão durante o pulo, menor e mais fraca quanto mais alto ele está. Vem antes
// de todos os personagens, para a sombra de um não escurecer os pés do outro.
export function desenharSombraDoPersonagem(ctx: CanvasRenderingContext2D, p: Personagem, luz: Luz): void {
  const alturaPulo = yChao - p.y;
  const perto = Math.max(0.3, 1 - alturaPulo / 90);
  desenharSombra(ctx, luz, p.x, yChao, 18 * perto, perto);
}

// Em coordenadas do mapa: o rastro do dash e do pulo duplo, as asas atrás, o sprite e, na
// frente, o que o anjo põe por cima.
export function desenharPersonagem(ctx: CanvasRenderingContext2D, p: Personagem, tempo: number): void {
  const pose = poseDe(p);
  const { imagem, eixo, x, topo } = pose;
  desenharRastro(ctx, p.rastro);
  if (p.heroi === 'anjo') desenharAnjoAtras(ctx, p.anjo, tempo, pose);
  if (p.heroi === 'grow') desenharGolemAtras(ctx, p.golem, pose);
  // O ganso da Margo anda atrás dela: desenhado antes.
  if (p.heroi === 'margo') desenharCompanheiro(ctx, p.ganso, yChao, AFUNDAR_NA_GRAMA);

  // Caído (vida 0): deitado no chão; o Anjo, sem a queda desenhada, fica meio apagado.
  const alfa = p.vida > 0 || spriteMorto(p) ? 1 : 0.45;
  const desenhar = (img: HTMLCanvasElement, a: number): void => {
    ctx.save();
    ctx.globalAlpha = a;
    if (p.direcao === -1) {
      ctx.translate(x + eixo, topo);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
    } else {
      ctx.drawImage(img, x - eixo, topo);
    }
    ctx.restore();
  };
  const golem = formaDo(p) === 'golem';
  const mao = MAO_DE_FRENTE[p.heroi];
  const maoDeFrente = pose.deFrente ? { x: x + p.direcao * mao.lado, y: topo + mao.linha } : undefined;
  // O braço do gesto, a arma na mão e o soco. No modo poderes, a arma da Leslie e do Grow fica
  // guardada (a mão é dos poderes); o Grow não estica braço: quem brilha é a pedra do cajado.
  const bracos = (): void => {
    if (p.gesto && !golem && !pelaPedra(p)) desenharBraco(ctx, p, p.gesto);
    // A Margo não tem arma nem soco: o rolo é do próprio sprite.
    if (p.vida > 0 && !(p.heroi !== 'anjo' && p.modo === 'poderes') && !golem && p.heroi !== 'margo') {
      desenharArmaNaMao(ctx, p, tempo, maoDeFrente, BRACO_DA_ARMA[p.heroi]);
      desenharSoco(ctx, p, BRACO_DA_ARMA[p.heroi]); // sem arma na mão
    }
  };
  // O Grow, no modo arma: o cajado nas costas, atrás de tudo. O braço da arma e do soco é o de
  // trás: vem antes do corpo, que o cobre até ele sair na frente do peito. De frente, a arma fica
  // na mão do próprio sprite, na frente.
  if (cajadoNasCostas(p)) desenharCajadoNasCostas(ctx, pose);
  const bracoAtras = p.maoLivreAtras && !pose.deFrente;
  if (bracoAtras) bracos();
  desenhar(imagem, alfa);
  // Acabou de apanhar: o corpo pisca em branco-rosado, duas vezes.
  if (p.ferido > 0 && Math.floor(p.ferido * 14) % 2 === 0) desenhar(tingido(imagem), 0.8 * alfa);
  if (!bracoAtras) bracos();
  if (p.gesto && pelaPedra(p)) desenharBrilhoDaPedra(ctx, p, p.gesto, tempo);
  if (p.heroi === 'anjo') desenharAnjoNaFrente(ctx, p.anjo, tempo, pose);
  if (p.heroi === 'grow') desenharGolemNaFrente(ctx, p.golem, tempo, pose);
  desenharEncanto(ctx, p, tempo);
  desenharPreso(ctx, p, tempo);
  desenharVeneno(ctx, p, tempo);
  desenharEnfarinhado(ctx, p, tempo);
}

// O braço do gesto (entidades/braco.ts): sai do ombro da frente na direção da mira, com a mão
// fechada na ponta e um brilho na cor dos poderes em volta dela (rosa no Anjo, verde na Leslie).
// Estica rápido, fica e recolhe no fim.
function desenharBraco(ctx: CanvasRenderingContext2D, p: Personagem, gesto: { resta: number; angulo: number }): void {
  const t = 1 - gesto.resta / GESTO.duracao; // 0 → 1
  const estica = t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1;
  const comprimento = Math.round((GESTO.braco + maisBraco(p)) * estica);
  if (comprimento < 2) return;
  const braco = BRACO_DO_PODER[p.heroi];
  desenharBracoComMao(ctx, ombroDe(p), gesto.angulo, comprimento, p.direcao, braco.cores, ({ x, y }) => {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const brilho = ctx.createRadialGradient(x, y, 0, x, y, 7);
    brilho.addColorStop(0, `rgba(${braco.brilho}, ${0.75 * estica})`);
    brilho.addColorStop(1, `rgba(${braco.brilho}, 0)`);
    ctx.fillStyle = brilho;
    ctx.fillRect(x - 7, y - 7, 14, 14);
    ctx.restore();
  });
}

// O Grow soltando um poder: a pedra do cajado acende na cor do vento, com um brilho em volta e
// duas faíscas girando. Acende rápido, fica e apaga no fim, como o braço dos outros.
function desenharBrilhoDaPedra(ctx: CanvasRenderingContext2D, p: Personagem, gesto: { resta: number }, tempo: number): void {
  const pedra = pedraDoCajado(p);
  if (!pedra) return;
  const t = 1 - gesto.resta / GESTO.duracao; // 0 → 1
  const forca = t < 0.2 ? t / 0.2 : t > 0.75 ? (1 - t) / 0.25 : 1;
  const cor = BRACO_DO_PODER.grow.brilho;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const brilho = ctx.createRadialGradient(pedra.x, pedra.y, 0, pedra.x, pedra.y, 8);
  brilho.addColorStop(0, `rgba(${cor}, ${0.85 * forca})`);
  brilho.addColorStop(0.45, `rgba(${cor}, ${0.3 * forca})`);
  brilho.addColorStop(1, `rgba(${cor}, 0)`);
  ctx.fillStyle = brilho;
  ctx.fillRect(pedra.x - 8, pedra.y - 8, 16, 16);
  ctx.fillStyle = `rgba(255, 255, 240, ${forca})`;
  ctx.fillRect(Math.floor(pedra.x), Math.floor(pedra.y), 1, 1);
  for (const lado of [0, Math.PI]) {
    const a = tempo * 9 + lado;
    ctx.fillStyle = `rgba(${cor}, ${0.9 * forca})`;
    ctx.fillRect(Math.round(pedra.x + Math.cos(a) * 4), Math.round(pedra.y + Math.sin(a) * 3), 1, 1);
  }
  ctx.restore();
}

const tingidos = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

function tingido(imagem: HTMLCanvasElement): HTMLCanvasElement {
  let t = tingidos.get(imagem);
  if (!t) {
    t = novoCanvas(imagem.width, imagem.height);
    const c = contexto2d(t);
    c.drawImage(imagem, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#ffe3f1';
    c.fillRect(0, 0, t.width, t.height);
    tingidos.set(imagem, t);
  }
  return t;
}
