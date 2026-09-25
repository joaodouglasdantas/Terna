// Os quadros vêm de assets/personagem.png (forma base) e assets/personagem-anjo.png (forma de
// anjo, com os quadros nos mesmos lugares), gerados a partir de fontes/SpriteBase.png por
// ferramentas/gerar-personagem.cjs. Personagem desenhado virado para a direita.
//
// O corpo (física, animação e desenho) é o mesmo para você e para o sósia: cada um recebe os
// seus `Controles` a cada quadro — os seus vêm do teclado, os do sósia do cérebro dele.

import { MUNDO } from '@terna/compartilhado';
import urlPersonagem from '../assets/personagem.png';
import urlPersonagemAnjo from '../assets/personagem-anjo.png';
import { QUADROS_PERSONAGEM } from '../gerado/personagem-quadros';
import { carregarImagem, contexto2d, novoCanvas } from '../motor/imagens';
import type { Luz, Sprite } from '../motor/tipos';
import { desenharSombra } from '../mundo/cenario';
import {
  ALTURA_AUREOLA,
  alternarForma,
  alturaDaAureola,
  atualizarAnjo,
  criarAnjo,
  desenharAnjoAtras,
  desenharAnjoNaFrente,
  enfeitarRetratoDeAnjo,
  formaAtual,
  transformando,
  type Anjo,
  type Pose,
} from './anjo';
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
// Voo do anjo: o pulo vai um pouco mais alto que o longo e, segurando o botão na descida, ele
// desce planando devagar, batendo as asas. Soltou, volta a gravidade inteira e ele despenca.
const FORCA_PULO_ANJO = 330; // pixels por segundo — segurando o botão, sobe ~85px
const QUEDA_PLANANDO = 30; // pixels por segundo — a descida lenta, planando
const FREIO_ASAS = 1200; // pixels por segundo² — apertou de novo caindo: as asas freiam a queda
// O sprite é desenhado alguns pixels abaixo da linha do chão: os pés afundam na grama em vez
// de ficar equilibrados na borda de cima dela.
const AFUNDAR_NA_GRAMA = 2;
// Ainda não há nada que tire vida: ela só aparece, cheia, no painel.
export const VIDA_MAXIMA = 100;

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
  dash: number; // segundos de dash que ainda faltam (0 = sem dash)
  recargaDash: number; // segundos até poder dar outro dash
  animacao: NomeAnimacao;
  quadro: number;
  tempoQuadro: number;
  vida: number; // de 0 a VIDA_MAXIMA
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
    dash: 0,
    recargaDash: 0,
    animacao: 'parado',
    quadro: 0,
    tempoQuadro: 0,
    vida: VIDA_MAXIMA,
    anjo: criarAnjo(),
    rastro: criarRastro(),
  };
}

export function formaDo(p: Personagem): Forma {
  return formaAtual(p.anjo);
}

// Foto do painel: a pose de frente cortada no começo do peito, na forma atual — o anjo com os
// olhos de coração e a auréola. Em cima sobra o lugar da auréola nas duas formas, para a
// cabeça ficar no mesmo ponto da foto quando ele se transforma. Uma por forma, feita uma vez.
const RETRATO_ATE = 21; // linhas do quadro de frente: do alto do cabelo ao começo do peito
const retratos = new Map<Forma, HTMLCanvasElement>();

export function retratoDo(p: Personagem): HTMLCanvasElement {
  const forma = formaDo(p);
  const pronto = retratos.get(forma);
  if (pronto) return pronto;

  const { imagem, eixo } = ANIMACOES[forma].parado[0];
  const retrato = novoCanvas(imagem.width, ALTURA_AUREOLA + RETRATO_ATE);
  const ctx = contexto2d(retrato);
  ctx.drawImage(imagem, 0, 0, imagem.width, RETRATO_ATE, 0, ALTURA_AUREOLA, imagem.width, RETRATO_ATE);
  if (forma === 'anjo') enfeitarRetratoDeAnjo(ctx, quadroPersonagem('parado', 0), eixo, 0, ALTURA_AUREOLA);
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

function spriteAtual(p: Personagem): Sprite {
  return ANIMACOES[formaDo(p)][p.animacao][p.quadro];
}

function poseDe(p: Personagem): Pose {
  const { imagem, eixo } = spriteAtual(p);
  return {
    quadro: quadroPersonagem(p.animacao, p.quadro),
    imagem,
    eixo,
    x: Math.round(p.x),
    topo: Math.round(p.y) - imagem.height + AFUNDAR_NA_GRAMA,
    direcao: p.direcao,
    deFrente: p.animacao === 'parado',
  };
}

// `toque`: o lado que acabou de ser apertado neste quadro (0 = nenhum). O segundo toque no mesmo
// lado dentro da janela dispara o dash; um toque no outro lado recomeça a contagem.
function atualizarDash(p: Personagem, toque: -1 | 0 | 1, dt: number): void {
  p.dash = Math.max(0, p.dash - dt);
  p.recargaDash = Math.max(0, p.recargaDash - dt);
  p.janelaToque = Math.max(0, p.janelaToque - dt);
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
  marcarDash(p.rastro, poseDe(p), formaDo(p), p.x, p.y, p.noChao);
}

export function atualizarPersonagem(p: Personagem, controles: Controles, dt: number, tempo: number): void {
  // R alterna entre a forma base e a de anjo; durante a transformação o corpo não responde.
  if (controles.transformar && !p.transformarSegurado) alternarForma(p.anjo);
  p.transformarSegurado = controles.transformar;
  const livre = personagemLivre(p);

  const esquerda = livre && controles.esquerda;
  const direita = livre && controles.direita;
  const pular = livre && controles.pular;

  atualizarDash(p, esquerda && !p.esquerdaSegurada ? -1 : direita && !p.direitaSegurada ? 1 : 0, dt);
  if (!livre) p.dash = 0;
  p.esquerdaSegurada = esquerda;
  p.direitaSegurada = direita;

  p.vx = 0;
  if (p.dash > 0) {
    // No dash o lado já está decidido: os botões só voltam a mandar quando ele acaba.
    p.vx = p.direcao * VELOCIDADE_DASH;
  } else {
    if (esquerda) {
      p.vx = -VELOCIDADE;
      p.direcao = -1;
    }
    if (direita) {
      p.vx = VELOCIDADE;
      p.direcao = 1;
    }
  }
  const anjo = formaDo(p) === 'anjo';
  // Só pula ao apertar de novo: segurar o botão no pouso não emenda outro pulo. No ar, a forma
  // base ainda tem o pulo duplo; o anjo não — apertar de novo caindo é o freio das asas.
  if (pular && !p.pularSegurado) {
    if (p.noChao) {
      p.vy = -(anjo ? FORCA_PULO_ANJO : FORCA_PULO);
      p.noChao = false;
      p.puloDuplo = !anjo;
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

  // Anjo descendo com o botão segurado: plana. Do alto do pulo a gravidade leva à queda lenta
  // sem tranco; vindo de uma queda rápida (soltou e apertou de novo), as asas a freiam.
  p.planando = anjo && pular && !p.noChao && p.vy > 0;
  if (p.planando) {
    p.vy =
      p.vy < QUEDA_PLANANDO
        ? Math.min(QUEDA_PLANANDO, p.vy + GRAVIDADE * dt)
        : Math.max(QUEDA_PLANANDO, p.vy - FREIO_ASAS * dt);
  } else {
    p.vy += GRAVIDADE * dt;
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

  ctx.save();
  if (p.direcao === -1) {
    ctx.translate(x + eixo, topo);
    ctx.scale(-1, 1);
    ctx.drawImage(imagem, 0, 0);
  } else {
    ctx.drawImage(imagem, x - eixo, topo);
  }
  ctx.restore();
  desenharAnjoNaFrente(ctx, p.anjo, tempo, pose);
}
