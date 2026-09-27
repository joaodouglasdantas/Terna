// A base dos efeitos de poder no mapa, de qualquer personagem: quem pode ser acertado, o acerto
// no corpo, o dano (com o número que sobe de quem apanhou) e a cura, as faíscas soltas e a
// elipse desenhada no chão. Os poderes de cada um ficam na pasta dele (anjo/poderes.ts,
// leslie/poderes.ts, grow/poderes.ts); entidades/poderes.ts junta todos.
//
// Dano e defesa: um corpo com `defesa` (o golem do Grow) absorve essa parte do dano que leva. O
// número de dano mostra o que passou e, em cima dele, o que a defesa segurou ("DEF 32").
//
// Online, cada um confere só o que acerta o próprio personagem: os efeitos do outro também
// passam pelo corpo dele aqui, mas só para a imagem — a vida dele chega pela rede.

import { VENENO, type ZonaDoCorpo } from '@terna/compartilhado';
import { ALTURA_FONTE, textoEmPixels } from '../motor/fonte';

// Quem pode ser acertado. `ferir`: tira vida de verdade (o seu personagem, ou os dois sozinho);
// sem ele o efeito só reage na imagem (o outro online, cuja vida vem pela rede).
export interface CorpoAlvo {
  x: number; // eixo do corpo
  y: number; // linha dos pés
  vy: number;
  noChao: boolean;
  medida: Medida; // o tamanho do corpo para os acertos (o golem é maior)
  defesa: number; // parte do dano que o corpo absorve (0 a 1; o golem, DEFESA_GOLEM)
  pesado: boolean; // o golem: o vento quase não empurra, os pássaros não levantam, as trombadas mal mexem
  levado: number; // segundos que ainda faltam carregado pela Revoada do Grow (sem andar nem cair)
  empurrao: number; // px/s de empurrão de lado (vento, trombada), que vai sumindo sozinho
  vida: number;
  ferido: number; // segundos do piscar de quem apanhou
  encanto: Encanto | null; // enfeitiçado pela Rajada de Amor do Anjo
  preso: number; // segundos que ainda faltam presos pelas Raízes da Leslie (0 = livre)
  veneno: number; // segundos que ainda faltam do veneno do Chicote da Leslie (0 = limpo)
  venenoTique: number; // segundos desde o último pinguinho de dano do veneno
}

// Enfeitiçado pela Rajada: até acabar, só anda, devagar, até `dono` (quem o acertou).
export interface Encanto {
  resta: number; // segundos
  dono: { x: number };
}

export interface Alvo {
  corpo: CorpoAlvo;
  ferir: boolean;
}

// Um movimento que o poder faz o próprio corpo fazer (o Salto e a Investida do golem): agacha
// `espera` segundos e vai de `x0` a `x1` em `duracao`, subindo até `altura` no meio (0 = rente ao
// chão). O corpo e o efeito leem o mesmo objeto; quem passa o tempo é o corpo.
export interface Manobra {
  tipo: 'salto' | 'investida';
  x0: number;
  x1: number;
  idade: number;
  espera: number;
  duracao: number;
  altura: number;
}

// Quem lança um poder: o corpo de onde ele sai (`y`: a linha dos pés). `manobra`: o golem, que o
// Salto e a Investida levam junto.
export type Dono = { x: number; y: number; direcao: 1 | -1; manobra?: Manobra | null };

export interface Medida {
  meiaLargura: number;
  altura: number;
}

// O corpo de gente para o acerto: do eixo para os lados e dos pés para cima.
export const CORPO: Medida = { meiaLargura: 6, altura: 30 };

// Quanto da manobra já foi (0 antes de sair do lugar, 1 no fim) e onde o corpo está nela.
export function andamento(m: Manobra): number {
  return Math.max(0, Math.min(1, (m.idade - m.espera) / m.duracao));
}

export function pontoDaManobra(m: Manobra, yChao: number): { x: number; y: number } {
  const u = andamento(m);
  return { x: m.x0 + (m.x1 - m.x0) * u, y: yChao - 4 * m.altura * u * (1 - u) };
}

export const manobraAcabou = (m: Manobra): boolean => m.idade >= m.espera + m.duracao;
const PISCAR = 0.3;

export interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravidade: number;
  vida: number;
  total: number;
  cor: string;
  somar: boolean; // soma luz (brilhos) em vez de pintar por cima (terra, folhas)
  pousar?: boolean; // cai e para no chão (torrões de terra, grama), em vez de atravessar
  tam?: number; // px de lado (1 sem ele): lascas de pedra
}

interface Numero {
  x: number;
  y: number;
  imagem: HTMLCanvasElement;
  sombra: HTMLCanvasElement; // o mesmo texto, escuro, um pixel abaixo: lê em cima de qualquer fundo
  vida: number;
  escala: number; // o crítico sai em dobro
}

// A parte comum de todo efeito na lista: de quem é (para não acertar o dono).
export interface EfeitoBase {
  dono: Dono;
}

export interface Nucleo<E extends EfeitoBase> {
  lista: E[];
  particulas: Particula[];
  numeros: Numero[];
  // Online, a arma acertou o outro aqui, mas a vida dele chega depois, pela rede: onde pegou
  // (e por quantos segundos ainda vale), para o número sair do jeito certo quando ela chegar.
  zonas: Map<CorpoAlvo, { zona: ZonaDoCorpo; resta: number }>;
}

let yChao = 0;
let imagemDoChao: HTMLCanvasElement | null = null;
let folgaDoChao = 0;
// `chaoDoMapa`: o chão desenhado (mundo/chao.ts), com `folga` px de tufos de grama acima da linha
// do chão. Os poderes que saem da terra redesenham a grama por cima da base deles.
export function prepararEfeitos(yDoChao: number, chaoDoMapa?: HTMLCanvasElement, folga = 0): void {
  yChao = yDoChao;
  imagemDoChao = chaoDoMapa ?? null;
  folgaDoChao = folga;
}
export const chao = (): number => yChao;

// A grama do chão (os tufos e a faixa de cima), de `x0` a `x1`, desenhada de novo por cima do que
// já está na tela: o que sai da terra fica com a base escondida atrás dela, como se viesse de
// dentro. `levantar`: px que ela sobe (a terra estufando); `faixa`: px de terra abaixo da linha.
export function redesenharGrama(ctx: CanvasRenderingContext2D, x0: number, x1: number, levantar = 0, faixa = 3): void {
  if (!imagemDoChao) return;
  const a = Math.max(0, Math.floor(x0));
  const b = Math.min(imagemDoChao.width, Math.ceil(x1));
  if (b <= a) return;
  const h = folgaDoChao + faixa;
  ctx.drawImage(imagemDoChao, a, 0, b - a, h, a, yChao - folgaDoChao - levantar, b - a, h);
}

// Uma faísca: sai do ponto numa direção qualquer. `somar`: brilho (soma luz); sem ele, pinta
// por cima (lascas de terra, pedaços de folha).
export function faisca(
  e: Nucleo<EfeitoBase>,
  x: number,
  y: number,
  forca: number,
  gravidade: number,
  cor: string,
  somar = true,
): void {
  const a = Math.random() * Math.PI * 2;
  const v = forca * (0.4 + Math.random() * 0.6);
  const total = 0.3 + Math.random() * 0.4;
  e.particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, gravidade, vida: total, total, cor, somar });
}

// Tira a vida, faz piscar e solta o número. Também usado de fora para o outro jogador online,
// quando a vida dele cai pela rede (aí `dano` é quanto caiu e a vida já veio certa).
let ladoDoNumero: 1 | -1 = 1;
// O número pela parte do corpo que a arma pegou: o crítico (cabeça) em dourado, em dobro e com o
// aviso em cima; nos pés, apagado. Sem zona (os poderes), o de sempre.
const COR_DO_NUMERO: Record<ZonaDoCorpo, string> = { cabeca: '#ffd966', corpo: '#fff1e6', pes: '#c9b4a8' };
const SOMBRA_DO_NUMERO = '#3a1420';
const COR_DA_CURA = '#b8f59a';
const COR_DO_VENENO = '#a8e05a';
const COR_DA_DEFESA = '#a9c6dc'; // o cinza-azulado da pedra
const SOMBRA_DA_DEFESA = '#1a2430';
const SOMBRA_DA_CURA = '#16361a';
const ZONA_VALE = 1; // segundos: a vida do outro chegou até isto depois do acerto, é dele

function numero(e: Nucleo<EfeitoBase>, alvo: { x: number; y: number; medida?: Medida }, texto: string, cor: string, sombra: string, escala = 1, vida = 0.9): { x: number; y: number } {
  // Sai de um lado da cabeça, um de cada vez: dois acertos seguidos não se empilham, e nenhum
  // nasce em cima do nome.
  ladoDoNumero = ladoDoNumero === 1 ? -1 : 1;
  const medida = alvo.medida ?? CORPO;
  const x = alvo.x + ladoDoNumero * (14 + medida.meiaLargura);
  const y = alvo.y - medida.altura + 2;
  e.numeros.push({ x, y, imagem: textoEmPixels(texto, cor), sombra: textoEmPixels(texto, sombra), vida, escala });
  return { x, y };
}

// `dano`: o que passou (a vida que caiu); `absorvido`: o que a defesa segurou, mostrado em cima.
export function mostrarDano(e: Nucleo<EfeitoBase>, alvo: CorpoAlvo, dano: number, zona?: ZonaDoCorpo, absorvido = 0): void {
  alvo.ferido = PISCAR;
  const pendente = e.zonas.get(alvo);
  e.zonas.delete(alvo);
  const onde = zona ?? pendente?.zona ?? 'corpo';
  const critico = onde === 'cabeca';
  const cor = COR_DO_NUMERO[onde];
  const { x, y } = numero(e, alvo, `-${Math.round(dano)}`, cor, SOMBRA_DO_NUMERO, critico ? 2 : 1, critico ? 1.1 : 0.9);
  // Os avisos ficam logo acima do número (o crítico em dobro cresce para cima), com um pixel entre.
  let acima = y - (critico ? 2 : 1) * ALTURA_FONTE - 2;
  const aviso = (texto: string, cor: string, sombra: string): void => {
    e.numeros.push({ x, y: acima, imagem: textoEmPixels(texto, cor), sombra: textoEmPixels(texto, sombra), vida: 1.1, escala: 1 });
    acima -= ALTURA_FONTE + 2;
  };
  if (critico) aviso('CRÍTICO!', cor, SOMBRA_DO_NUMERO);
  if (Math.round(absorvido) > 0) aviso(`DEF ${Math.round(absorvido)}`, COR_DA_DEFESA, SOMBRA_DA_DEFESA);
}

// O que a defesa do corpo segura de um dano.
export const absorvidoPor = (c: { defesa: number }, dano: number): number => Math.round(dano * c.defesa);

// Online, a vida do outro caiu `passou` pela rede: quanto a defesa dele deve ter segurado.
export const absorvidoDoQuePassou = (c: { defesa: number }, passou: number): number =>
  c.defesa > 0 && c.defesa < 1 ? Math.round((passou * c.defesa) / (1 - c.defesa)) : 0;

// A vida que voltou (a Fúria da Floresta cura a Leslie): o número sobe em verde, com um "+".
export function mostrarCura(e: Nucleo<EfeitoBase>, alvo: { x: number; y: number }, cura: number): void {
  numero(e, alvo, `+${Math.round(cura)}`, COR_DA_CURA, SOMBRA_DA_CURA, 1, 1.1);
}

// Também usado pelas armas (entidades/armas.ts): o golpe e a flecha ferem do mesmo jeito, com a
// parte do corpo que pegaram (`zona`).
export function ferirAlvo(e: Nucleo<EfeitoBase>, alvo: Alvo, dano: number, zona?: ZonaDoCorpo): void {
  if (alvo.ferir) {
    const absorvido = absorvidoPor(alvo.corpo, dano);
    const passou = dano - absorvido;
    alvo.corpo.vida = Math.max(0, alvo.corpo.vida - passou);
    mostrarDano(e, alvo.corpo, passou, zona, absorvido);
  } else {
    alvo.corpo.ferido = PISCAR;
    if (zona) e.zonas.set(alvo.corpo, { zona, resta: ZONA_VALE });
  }
}

// Um ponto (com `raio` de folga) dentro do corpo: do eixo para os lados e dos pés para cima.
export function acertaCorpo(c: CorpoAlvo, x: number, y: number, raio: number): boolean {
  const { meiaLargura, altura } = c.medida;
  return Math.abs(x - c.x) <= meiaLargura + raio && y >= c.y - altura - raio && y <= c.y + raio;
}

// O corpo encosta na faixa do chão de `x - raio` a `x + raio`?
export const dentroDaFaixa = (c: CorpoAlvo, x: number, raio: number): boolean => Math.abs(c.x - x) <= raio + c.medida.meiaLargura;

// Empurra para o lado (`forca` em px/s, com sinal): o pesado sente só uma parte. Não soma: vale o
// empurrão mais forte.
export function empurrar(c: CorpoAlvo, forca: number, pesado = 0.35): void {
  const f = c.pesado ? forca * pesado : forca;
  if (Math.abs(f) > Math.abs(c.empurrao) || Math.sign(f) !== Math.sign(c.empurrao)) c.empurrao = f;
}

// Os alvos que o efeito de `dono` pode acertar: os outros, de pé.
export const vivos = (alvos: readonly Alvo[], dono: Dono): Alvo[] =>
  alvos.filter((a) => (a.corpo as object) !== dono && a.corpo.vida > 0);

export const limitarAoAlcance = (x: number, de: number, alcance: number, mundo: number): number =>
  Math.max(0, Math.min(mundo, Math.max(de - alcance, Math.min(de + alcance, x))));

// O veneno: quem está envenenado perde VENENO.dano a cada VENENO.intervalo, até acabar. Só tira
// vida de quem se fere de verdade aqui (online, o do outro chega pela rede); o tempo corre para
// todos, para a imagem.
export function atualizarVeneno(e: Nucleo<EfeitoBase>, alvos: readonly Alvo[], dt: number): void {
  for (const alvo of alvos) {
    const c = alvo.corpo;
    if (c.veneno <= 0) {
      c.venenoTique = 0;
      continue;
    }
    c.veneno = Math.max(0, c.veneno - dt);
    if (!alvo.ferir || c.vida <= 0) continue;
    c.venenoTique += dt;
    while (c.venenoTique >= VENENO.intervalo) {
      c.venenoTique -= VENENO.intervalo;
      const passou = VENENO.dano - absorvidoPor(c, VENENO.dano);
      c.vida = Math.max(0, c.vida - passou);
      numero(e, c, `-${passou}`, COR_DO_VENENO, SOMBRA_DA_CURA, 1, 0.7);
    }
  }
}

export function envenenar(c: CorpoAlvo): void {
  c.veneno = VENENO.duracao;
  c.venenoTique = 0;
}

// Passa o tempo das faíscas, dos números e das zonas pendentes.
export function atualizarNucleo(e: Nucleo<EfeitoBase>, dt: number): void {
  for (const p of e.particulas) {
    p.vida -= dt;
    p.vy += p.gravidade * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.pousar && p.y >= yChao - 1) {
      // Pousou: fica no chão, parado, e some aos poucos.
      p.y = yChao - 1;
      p.vx = 0;
      p.vy = 0;
      p.gravidade = 0;
    }
  }
  e.particulas = e.particulas.filter((p) => p.vida > 0);
  for (const n of e.numeros) {
    n.vida -= dt;
    n.y -= 18 * dt;
  }
  e.numeros = e.numeros.filter((n) => n.vida > 0);
  for (const [corpo, pendente] of e.zonas) if ((pendente.resta -= dt) <= 0) e.zonas.delete(corpo);
}

// ---- Desenho ----

// Elipse no chão, pixel a pixel: `cheia` preenche por dentro (translúcida), senão só a borda.
export function elipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, cor: string, cheia: boolean): void {
  if (rx < 1) return;
  ctx.fillStyle = cor;
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
    if (cheia) {
      ctx.fillRect(x0 - w, y0 + dy, w * 2 + 1, 1);
      continue;
    }
    const acima = Math.abs(dy) === ry ? 0 : Math.round(rx * Math.sqrt(Math.max(0, 1 - ((Math.abs(dy) + 1) / (ry + 0.5)) ** 2)));
    const borda = Math.max(1, w - acima);
    ctx.fillRect(x0 - w, y0 + dy, borda, 1);
    ctx.fillRect(x0 + w - borda + 1, y0 + dy, borda, 1);
  }
}

// As faíscas: primeiro as que pintam por cima, depois as que somam luz.
export function desenharParticulas(ctx: CanvasRenderingContext2D, e: Nucleo<EfeitoBase>): void {
  ctx.save();
  for (const somar of [false, true]) {
    ctx.globalCompositeOperation = somar ? 'lighter' : 'source-over';
    for (const p of e.particulas) {
      if (p.somar !== somar) continue;
      ctx.globalAlpha = Math.min(1, (p.vida / p.total) * 1.6);
      ctx.fillStyle = p.cor;
      const tam = p.tam ?? 1;
      ctx.fillRect(Math.round(p.x), Math.round(p.y) - (tam - 1), tam, tam);
    }
  }
  ctx.restore();
}

// Os números de dano e de cura, por cima de tudo do mapa (e dos nomes): desenhados junto com
// eles, depois da luz, para não se esconderem atrás das placas.
export function desenharNumeros(ctx: CanvasRenderingContext2D, e: Nucleo<EfeitoBase>): void {
  for (const n of e.numeros) {
    const largura = n.imagem.width * n.escala;
    const altura = n.imagem.height * n.escala;
    const x = Math.round(n.x - largura / 2);
    // O crítico cresce para cima, sem cobrir o aviso.
    const y = Math.round(n.y) - (altura - n.imagem.height);
    // Sem placa: só o texto, com a sombra meio transparente embaixo, e um pouco translúcido.
    const alfa = 0.9 * Math.min(1, n.vida / 0.3);
    ctx.save();
    ctx.imageSmoothingEnabled = false; // o crítico em dobro, com os pixels nítidos
    ctx.globalAlpha = 0.55 * alfa;
    ctx.drawImage(n.sombra, x, y + n.escala, largura, altura);
    ctx.globalAlpha = alfa;
    ctx.drawImage(n.imagem, x, y, largura, altura);
    ctx.restore();
  }
}

// O que a CPU enxerga para desviar: as marcas no chão que ainda não estouraram e o que vem voando,
// de quem não é ela. `baixa`: dá para escapar pulando por cima (senão, só saindo de baixo).
export interface Ameacas {
  areas: { x: number; raio: number; resta: number; aviso: number; baixa: boolean }[];
  projeteis: { x: number; y: number; vx: number; vy: number }[];
}
