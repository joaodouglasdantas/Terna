// Os quadros vêm de assets/personagem.png (forma base) e assets/personagem-anjo.png (forma de
// anjo, com os quadros nos mesmos lugares), gerados a partir de fontes/SpriteBase.png por
// ferramentas/gerar-personagem.cjs. Personagem desenhado virado para a direita.
//
// O corpo (física, animação e desenho) é o mesmo para você e para o sósia: cada um recebe os
// seus `Controles` a cada quadro — os seus vêm do teclado, os do sósia do cérebro dele.

import { ENERGIA_PIXY, MUNDO, RAJADA, VIDA_MAXIMA } from '@terna/compartilhado';
import urlPersonagem from '../assets/personagem.png';
import urlPersonagemAnjo from '../assets/personagem-anjo.png';
import { QUADROS_PERSONAGEM } from '../gerado/personagem-quadros';
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
  type Pose,
} from './anjo';
import { desenharArmaNaMao, type ArmaNaMao, type Ataque } from './armas';
import { BRACO_ANJO, desenharBracoEsticado, desenharMao, ombroDe } from './braco';
import { atualizarRecargas, avisar, criarPoderes, desenharEncanto, type Encanto, type Poderes } from './poderes';
import { PAIRAR_NO_AR, criarVoo, decolar, voarNoAr, type Voo } from './voo-anjo';
import { atualizarRastro, criarRastro, desenharRastro, marcarDash, marcarPuloDuplo, type Rastro } from './rastro';

export type NomeAnimacao = keyof typeof QUADROS_PERSONAGEM;
export type AnimacoesPersonagem = Record<NomeAnimacao, Sprite[]>;
export type Forma = 'base' | 'anjo';

// Âncoras da forma de anjo, em pixels dentro do recorte (ver o gerador).
export interface QuadroPersonagem {
  w: number;
  h: number;
  olhos: readonly (readonly number[])[];
  ombro: readonly number[];
  tarja: readonly number[]; // x, y, largura e altura do mosaico sobre o quadril
  meio?: number; // de frente: eixo do corpo, a coluna x se espelha em meio − x
}

export function quadroPersonagem(animacao: NomeAnimacao, quadro: number): QuadroPersonagem {
  return QUADROS_PERSONAGEM[animacao][quadro];
}

// `anjo`: usa o eixo do sprite do anjo — de lado a cabeça dele recua, e o eixo recua junto para
// a cabeça ficar no mesmo ponto do mapa nas duas formas.
function recortar(folha: HTMLImageElement, anjo: boolean): AnimacoesPersonagem {
  const animacoes = {} as AnimacoesPersonagem;
  (Object.entries(QUADROS_PERSONAGEM) as [NomeAnimacao, (typeof QUADROS_PERSONAGEM)[NomeAnimacao]][]).forEach(
    ([nome, quadros]) => {
      animacoes[nome] = quadros.map((q) => {
        const canvas = novoCanvas(q.w, q.h);
        contexto2d(canvas).drawImage(folha, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
        return { imagem: canvas, eixo: anjo ? q.axAnjo : q.ax };
      });
    },
  );
  return animacoes;
}

export async function carregarAnimacoesPersonagem(): Promise<Record<Forma, AnimacoesPersonagem>> {
  const [base, anjo] = await Promise.all([carregarImagem(urlPersonagem), carregarImagem(urlPersonagemAnjo)]);
  return { base: recortar(base, false), anjo: recortar(anjo, true) };
}

// ---- Corpo ----

const DURACAO_QUADRO: Record<NomeAnimacao, number> = {
  parado: 0.6,
  andando: 0.11,
  subindo: 0.2,
  caindo: 0.2,
  atacando: 1, // um quadro só: não é animação do estado, só a pose de atacar parado
};

const VELOCIDADE = 90; // pixels por segundo
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
// De onde saem os poderes: o peito, acima dos pés.
const ALTURA_DO_PEITO = 18;
// Enfeitiçado, anda até quem o acertou e para a esta distância dele.
const PERTO_DO_DONO = 14;
// O gesto de soltar um poder: o braço sai do ombro na direção da mira, fica um instante e volta.
const GESTO = { duracao: 0.34, braco: 10 }; // segundos e pixels
// De frente (o quadro "parado"), a mão da frente do próprio sprite: 5 px para o lado do eixo e na
// linha 23 do quadro. Parado com uma arma, ela fica nessa mão, sem o braço esticado.
const MAO_DE_FRENTE = { lado: 5, linha: 23 };

// Os botões de um quadro: segurados ou não.
export interface Controles {
  esquerda: boolean;
  direita: boolean;
  pular: boolean;
  transformar: boolean;
}

// `x` é o eixo do corpo e `y` a linha dos pés: os quadros variam de largura e altura, o apoio não.
export interface Personagem {
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
  ferido: number; // segundos do piscar de quem acabou de apanhar
  encanto: Encanto | null; // enfeitiçado pela Rajada: só anda, devagar, até quem o acertou
  gesto: { resta: number; angulo: number } | null; // o braço soltando um poder
  poderes: Poderes;
  arma: ArmaNaMao | null; // a espada ou o arco na mão (só a forma base)
  ataque: Ataque | null; // o golpe ou a flechada em curso
  energia: number; // energia pixy, de 0 a ENERGIA_PIXY.maxima: vem do dano dado, enche a barra do anjo
  daRede: boolean; // o outro jogador online: a forma e a energia dele vêm da rede
  voo: Voo; // o voo com pairada do anjo (voo-anjo.ts)
  anjo: Anjo;
  rastro: Rastro; // os efeitos do dash e do pulo duplo
}

let ANIMACOES: Record<Forma, AnimacoesPersonagem>;
let yChao = 0;

export function prepararPersonagens(animacoes: Record<Forma, AnimacoesPersonagem>, yDoChao: number): void {
  ANIMACOES = animacoes;
  yChao = yDoChao;
}

export function criarPersonagem(x: number, direcao: 1 | -1 = 1): Personagem {
  return {
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
    ferido: 0,
    encanto: null,
    gesto: null,
    poderes: criarPoderes(),
    arma: null,
    ataque: null,
    energia: 0,
    daRede: false,
    voo: criarVoo(),
    anjo: criarAnjo(),
    rastro: criarRastro(),
  };
}

export function formaDo(p: Personagem): Forma {
  return formaAtual(p.anjo);
}

export function peitoDo(p: Personagem): { x: number; y: number } {
  return { x: p.x, y: p.y - ALTURA_DO_PEITO };
}

// Por que os poderes não saem agora (null = saem): só do anjo já transformado (não no meio da
// luz), vivo e sem estar enfeitiçado.
export function bloqueioDosPoderes(p: Personagem): string | null {
  if (p.vida <= 0) return 'CAIU';
  if (p.encanto) return 'ENFEITICADO';
  if (formaDo(p) !== 'anjo' || !personagemLivre(p)) return 'SO NA FORMA DE ANJO';
  return null;
}

export function podeUsarPoderes(p: Personagem): boolean {
  return bloqueioDosPoderes(p) === null;
}

// O mesmo para a arma da mão, na forma base (null = ataca, se a recarga dela deixar).
export function bloqueioDaArma(p: Personagem): string | null {
  if (p.vida <= 0) return 'CAIU';
  if (p.encanto) return 'ENFEITICADO';
  if (!p.arma) return 'SEM ARMA';
  if (!personagemLivre(p)) return 'TRANSFORMANDO';
  return null;
}

// A arma sai pronta se clicar agora?
export function armaPronta(p: Personagem): boolean {
  return bloqueioDaArma(p) === null && (p.arma?.recarga ?? 1) <= 0;
}

// Só a forma base pega arma: vivo, com a mão livre e fora da transformação.
export function podePegarArma(p: Personagem): boolean {
  return p.vida > 0 && !p.arma && formaDo(p) === 'base' && personagemLivre(p);
}

// Começou a virar anjo (ou já é) com uma arma na mão: ela cai no chão.
export function precisaLargarArma(p: Personagem): boolean {
  return p.arma !== null && (formaDo(p) === 'anjo' || transformando(p.anjo));
}

// Vira o corpo para o lado de onde o poder foi mirado e estica o braço para lá. O Julgamento
// vem do céu: o braço aponta para cima, um pouco para a frente.
export function gesticular(p: Personagem, alvo: { x: number; y: number }, paraCima = false): void {
  if (Math.abs(alvo.x - p.x) >= 1 && p.dash <= 0) p.direcao = alvo.x > p.x ? 1 : -1;
  const ombro = ombroDe(p);
  const angulo = paraCima ? Math.atan2(-1, p.direcao * 0.35) : Math.atan2(alvo.y - ombro.y, alvo.x - ombro.x);
  p.gesto = { resta: GESTO.duracao, angulo };
}

// A ponta do braço esticado no gesto: de onde os poderes saem (sem gesto, o peito).
export function maoDo(p: Personagem): { x: number; y: number } {
  if (!p.gesto) return peitoDo(p);
  const ombro = ombroDe(p);
  return { x: ombro.x + Math.cos(p.gesto.angulo) * GESTO.braco, y: ombro.y + Math.sin(p.gesto.angulo) * GESTO.braco };
}

// Foto do painel: a pose de frente cortada no começo do peito, na forma atual — o anjo com as
// asas abertas atrás dos ombros, os olhos de coração e a auréola. Em cima sobra o lugar da
// auréola nas duas formas, para a cabeça ficar no mesmo ponto da foto quando ele se transforma;
// dos lados, o das asas. Uma por forma, feita uma vez.
const RETRATO_ATE = 21; // linhas do quadro de frente: do alto do cabelo ao começo do peito
export const LARGURA_RETRATO = 26; // a foto por dentro da moldura: sobra dos lados para as asas
const retratos = new Map<Forma, HTMLCanvasElement>();

export function retratoDo(p: Personagem): HTMLCanvasElement {
  const forma = formaDo(p);
  const pronto = retratos.get(forma);
  if (pronto) return pronto;

  const { imagem, eixo } = ANIMACOES[forma].parado[0];
  const retrato = novoCanvas(LARGURA_RETRATO, ALTURA_AUREOLA + RETRATO_ATE);
  const ctx = contexto2d(retrato);
  const x = (LARGURA_RETRATO - imagem.width) >> 1;
  const quadro = quadroPersonagem('parado', 0);
  if (forma === 'anjo') desenharAsasDoRetrato(ctx, quadro, x, ALTURA_AUREOLA);
  ctx.drawImage(imagem, 0, 0, imagem.width, RETRATO_ATE, x, ALTURA_AUREOLA, imagem.width, RETRATO_ATE);
  if (forma === 'anjo') enfeitarRetratoDeAnjo(ctx, quadro, eixo, x, ALTURA_AUREOLA);
  retratos.set(forma, retrato);
  return retrato;
}

// Quanto sobra em cima da cabeça além do corpo: a auréola do anjo (0 na forma base). O nome
// em cima dele sobe este tanto.
export function acimaDaCabeca(p: Personagem): number {
  return alturaDaAureola(p.anjo);
}

// Enquanto a luz da transformação sobe, o corpo não responde aos botões.
export function personagemLivre(p: Personagem): boolean {
  return !transformando(p.anjo);
}

function animacaoDoEstado(p: Personagem): NomeAnimacao {
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
  const passo = DURACAO_QUADRO[animacao];
  if (p.tempoQuadro >= passo) {
    p.tempoQuadro -= passo;
    p.quadro = (p.quadro + 1) % ANIMACOES.base[animacao].length;
  }
}

// O quadro que aparece: parado, ele olha para a tela (com a arma, se tiver, na mão do sprite);
// soltando um poder ou atacando com a arma, vira de lado, em pé e com as pernas juntas, para o
// braço sair para o lado da mira. Correndo ou no ar, o ataque vai por cima do quadro de sempre.
function quadroMostrado(p: Personagem): { animacao: NomeAnimacao; quadro: number } {
  if ((p.gesto || p.ataque) && p.animacao === 'parado') return { animacao: 'atacando', quadro: 0 };
  return { animacao: p.animacao, quadro: p.quadro };
}

function spriteAtual(p: Personagem): Sprite {
  const { animacao, quadro } = quadroMostrado(p);
  return ANIMACOES[formaDo(p)][animacao][quadro];
}

function poseDe(p: Personagem): Pose {
  const { imagem, eixo } = spriteAtual(p);
  const { animacao, quadro } = quadroMostrado(p);
  return {
    quadro: quadroPersonagem(animacao, quadro),
    imagem,
    eixo,
    x: Math.round(p.x),
    topo: Math.round(p.y) - imagem.height + AFUNDAR_NA_GRAMA,
    direcao: p.direcao,
    deFrente: animacao === 'parado',
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
  if (p.recargaDash > 0 || !personagemLivre(p)) return;
  p.dash = DURACAO_DASH;
  p.recargaDash = DURACAO_DASH + RECARGA_DASH;
  p.direcao = lado;
  // Um terceiro toque logo em seguida não emenda outro dash: precisa de dois toques novos.
  p.ultimoToque = 0;
  p.janelaToque = 0;
  p.embalo = 0;
  marcarDash(p.rastro, poseDe(p), formaDo(p), p.x, p.y, p.noChao);
}

// Enfeitiçado, os botões não mandam: ele anda até quem o acertou e para perto dele.
function controlesDoEncanto(p: Personagem, encanto: Encanto): Controles {
  const dx = encanto.dono.x - p.x;
  return { esquerda: dx < -PERTO_DO_DONO, direita: dx > PERTO_DO_DONO, pular: false, transformar: false };
}

// Apertou R. Na forma base, só vira anjo com a barra de energia pixy cheia e a recarga pronta
// (senão avisa o que falta) e a transformação gasta a energia. O outro online vira quando ele
// virou lá: a energia dele vem da rede e já chega gasta.
function apertouTransformar(p: Personagem): void {
  const base = formaDo(p) === 'base' && !transformando(p.anjo);
  if (base && !p.daRede) {
    if (p.anjo.recarga > 0) return avisar(p.poderes, `ANJO EM RECARGA: ${Math.ceil(p.anjo.recarga)}S`);
    if (p.energia < ENERGIA_PIXY.custoAnjo) {
      return avisar(p.poderes, `ENERGIA PIXY: ${Math.floor(p.energia)} DE ${ENERGIA_PIXY.custoAnjo}`);
    }
  }
  if (alternarForma(p.anjo, p.daRede) && base && !p.daRede) p.energia -= ENERGIA_PIXY.custoAnjo;
}

// Pode virar anjo agora (para a CPU decidir): na forma base, com a recarga pronta e a energia.
export function podeVirarAnjo(p: Personagem): boolean {
  return anjoPronto(p.anjo) && p.energia >= ENERGIA_PIXY.custoAnjo;
}

// `p` tirou `dano` de vida do adversário: na forma base, carrega a energia pixy (de anjo, não).
export function ganharEnergia(p: Personagem, dano: number): void {
  if (dano <= 0 || formaDo(p) !== 'base' || transformando(p.anjo)) return;
  p.energia = Math.min(ENERGIA_PIXY.maxima, p.energia + dano * ENERGIA_PIXY.porDano);
}

export function atualizarPersonagem(p: Personagem, recebidos: Controles, dt: number, tempo: number): void {
  if (p.encanto && (p.encanto.resta -= dt) <= 0) p.encanto = null;
  const encanto = p.encanto;
  const controles = encanto ? controlesDoEncanto(p, encanto) : recebidos;
  if (p.gesto && (p.gesto.resta -= dt) <= 0) p.gesto = null;
  // R alterna entre a forma base e a de anjo; durante a transformação o corpo não responde.
  if (controles.transformar && !p.transformarSegurado) apertouTransformar(p);
  p.transformarSegurado = controles.transformar;
  p.ferido = Math.max(0, p.ferido - dt);
  atualizarRecargas(p.poderes, dt);
  const livre = personagemLivre(p);

  const esquerda = livre && controles.esquerda;
  const direita = livre && controles.direita;
  const pular = livre && controles.pular;

  // Enfeitiçado não dá dash: os passos dele até o dono não contam como toques.
  const toque = encanto ? 0 : esquerda && !p.esquerdaSegurada ? -1 : direita && !p.direitaSegurada ? 1 : 0;
  const nenhum = !esquerda && !direita;
  const solto = encanto || !nenhum ? 0 : p.esquerdaSegurada ? -1 : p.direitaSegurada ? 1 : 0;
  atualizarDash(p, toque, solto, dt);
  if (!livre || encanto) p.dash = 0;
  p.esquerdaSegurada = esquerda;
  p.direitaSegurada = direita;

  p.vx = 0;
  if (p.dash > 0) {
    // No dash o lado já está decidido: os botões só voltam a mandar quando ele acaba.
    p.vx = p.direcao * VELOCIDADE_DASH;
  } else {
    const velocidade = encanto ? RAJADA.andarEncantado : VELOCIDADE;
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
      p.vy = -(anjo ? FORCA_PULO_ANJO : FORCA_PULO);
      p.noChao = false;
      p.puloDuplo = !anjo;
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
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  if (p.y >= yChao) {
    p.y = yChao;
    p.vy = 0;
    p.noChao = true;
    p.planando = false;
    p.puloDuplo = false;
  }

  avancarAnimacao(p, dt);
  const { imagem, eixo } = spriteAtual(p);
  const esquerdaDoEixo = p.direcao === 1 ? eixo : imagem.width - eixo;
  p.x = Math.max(esquerdaDoEixo, Math.min(MUNDO - (imagem.width - esquerdaDoEixo), p.x));

  const pose = poseDe(p);
  atualizarRastro(p.rastro, dt, p.dash > 0, pose, formaDo(p));
  atualizarAnjo(p.anjo, dt, tempo, p, pose);
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
  desenharAnjoAtras(ctx, p.anjo, tempo, pose);

  // Caído (vida 0), fica meio apagado.
  const alfa = p.vida > 0 ? 1 : 0.45;
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
  desenhar(imagem, alfa);
  // Acabou de apanhar: o corpo pisca em branco-rosado, duas vezes.
  if (p.ferido > 0 && Math.floor(p.ferido * 14) % 2 === 0) desenhar(tingido(imagem), 0.8 * alfa);
  if (p.gesto) desenharBraco(ctx, p, p.gesto);
  const maoDeFrente = pose.deFrente
    ? { x: x + p.direcao * MAO_DE_FRENTE.lado, y: topo + MAO_DE_FRENTE.linha }
    : undefined;
  desenharArmaNaMao(ctx, p, tempo, maoDeFrente);
  desenharAnjoNaFrente(ctx, p.anjo, tempo, pose);
  desenharEncanto(ctx, p, tempo);
}

// O braço do gesto (entidades/braco.ts): sai do ombro da frente na direção da mira, com a mão
// mais clara e um brilho rosa. Estica rápido, fica e recolhe no fim.
function desenharBraco(ctx: CanvasRenderingContext2D, p: Personagem, gesto: { resta: number; angulo: number }): void {
  const t = 1 - gesto.resta / GESTO.duracao; // 0 → 1
  const estica = t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1;
  const comprimento = Math.round(GESTO.braco * estica);
  if (comprimento < 2) return;
  const mao = desenharBracoEsticado(ctx, ombroDe(p), gesto.angulo, comprimento, BRACO_ANJO);
  const [mx, my] = [mao.x, mao.y];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const brilho = ctx.createRadialGradient(mx, my, 0, mx, my, 6);
  brilho.addColorStop(0, `rgba(255, 95, 162, ${0.7 * estica})`);
  brilho.addColorStop(1, 'rgba(255, 95, 162, 0)');
  ctx.fillStyle = brilho;
  ctx.fillRect(mx - 6, my - 6, 12, 12);
  ctx.restore();
  desenharMao(ctx, mao, BRACO_ANJO);
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
