// Os poderes de cada personagem: os três que ele tem agora (na ordem dos quadrinhos do painel —
// o Grow troca de jogo ao virar golem), o escolhido e as recargas; e os efeitos no mapa, dos dois
// lados juntos. Cada efeito é desenhado e atualizado pela parte do personagem dono dele
// (anjo/poderes.ts, leslie/poderes.ts, grow/poderes.ts); a base comum — acerto, dano, defesa,
// números, faíscas — fica em efeitos.ts.

import {
  MUNDO,
  PODERES_DO_HEROI,
  PODERES_GOLEM,
  RECARGA_PODER,
  type Heroi,
  type IdPoder,
  type PoderUsado,
} from '@terna/compartilhado';
import {
  ameacasDoAnjo,
  atualizarEfeitoAnjo,
  desenharAnjoNaFrente,
  desenharAnjoNoChao,
  desenharPreviaAnjo,
  lancarPoderAnjo,
  PREVIA,
  type EfeitoAnjo,
  type PoderAnjo,
} from './anjo/poderes';
import {
  atualizarNucleo,
  atualizarVeneno,
  desenharNumeros,
  desenharParticulas,
  prepararEfeitos,
  type Alvo,
  type Ameacas,
  type Dono,
  type Nucleo,
} from './efeitos';
import {
  ameacasDoGrow,
  atualizarEfeitoGrow,
  desenharGrowNaFrente,
  desenharGrowNoChao,
  desenharPreviaGrow,
  lancarPoderGrow,
  PODERES_DO_GROW,
  pararVentoGrow,
  ventoDo,
  type EfeitoGrow,
  type PoderGrow,
} from './grow/poderes';
import {
  ameacasDaLeslie,
  atualizarEfeitoLeslie,
  desenharLeslieNaFrente,
  desenharLeslieNoChao,
  desenharPreviaLeslie,
  lancarPoderLeslie,
  type EfeitoLeslie,
  type PoderLeslie,
} from './leslie/poderes';

export { desenharBordaDoEncanto, desenharEncanto } from './anjo/poderes';
export { desenharPreso, desenharVeneno } from './leslie/poderes';
export { absorvidoDoQuePassou, acertaCorpo, ferirAlvo, mostrarCura, mostrarDano } from './efeitos';
export type { Alvo, Ameacas, CorpoAlvo, Encanto, Manobra, Medida } from './efeitos';

// ---- O que cada personagem tem ----

const AVISO = 1.1; // segundos que o aviso fica embaixo do painel
const TREMOR = 0.3; // segundos que o quadrinho treme quando o poder não sai

export interface Poderes {
  lista: readonly IdPoder[]; // os três do personagem agora, na ordem do painel
  selecionado: number; // índice na lista
  recarga: number[]; // segundos que faltam, por poder da lista
  guardadas: Map<IdPoder, number>; // as recargas do outro jogo (o Grow de golem guarda as de gente)
  aviso: { texto: string; resta: number } | null; // o motivo do último poder que não saiu
  tremor: number; // segundos do tremor do quadrinho escolhido
}

export function criarPoderes(heroi: Heroi): Poderes {
  const lista = PODERES_DO_HEROI[heroi];
  return { lista, selecionado: 0, recarga: lista.map(() => 0), guardadas: new Map(), aviso: null, tremor: 0 };
}

// Os três de agora: o Grow de golem tem os do golem; os outros, sempre os seus.
export function poderesDaForma(heroi: Heroi, golem: boolean): readonly IdPoder[] {
  return golem ? PODERES_GOLEM : PODERES_DO_HEROI[heroi];
}

// Trocou de jogo (virou golem ou voltou): guarda as recargas do jogo que sai e pega as do que
// entra; o escolhido volta ao primeiro.
export function trocarLista(p: Poderes, lista: readonly IdPoder[]): void {
  if (p.lista === lista) return;
  p.lista.forEach((poder, i) => p.guardadas.set(poder, p.recarga[i]));
  p.lista = lista;
  p.recarga = lista.map((poder) => p.guardadas.get(poder) ?? 0);
  for (const poder of lista) p.guardadas.delete(poder);
  p.selecionado = 0;
}

export function poderEscolhido(p: Poderes): IdPoder {
  return p.lista[p.selecionado];
}

// Botão direito: o próximo quadrinho, dando a volta no último.
export function trocarPoder(p: Poderes): void {
  p.selecionado = (p.selecionado + 1) % p.lista.length;
}

export function avisar(p: Poderes, texto: string): void {
  p.aviso = { texto, resta: AVISO };
  p.tremor = TREMOR;
}

export function atualizarRecargas(p: Poderes, dt: number): void {
  for (let i = 0; i < p.recarga.length; i++) p.recarga[i] = Math.max(0, p.recarga[i] - dt);
  for (const [poder, falta] of p.guardadas) p.guardadas.set(poder, Math.max(0, falta - dt));
  p.tremor = Math.max(0, p.tremor - dt);
  if (p.aviso && (p.aviso.resta -= dt) <= 0) p.aviso = null;
}

// Começa a recarga de um poder que acabou de sair (o seu, ou o do outro que chegou pela rede).
export function comecarRecarga(p: Poderes, poder: IdPoder): void {
  const i = p.lista.indexOf(poder);
  if (i >= 0) p.recarga[i] = RECARGA_PODER[poder];
}

// Botão esquerdo: usa o poder escolhido, de `origem` (o peito) para `alvo` (o cursor, no mapa).
// Não sai com `bloqueio` (o motivo: fora da forma de anjo, no modo arma, enfeitiçado, sem
// energia) nem em recarga — aí avisa o porquê e o quadrinho treme. O escolhido continua o mesmo
// depois de usar: o quadrinho mostra a recarga.
export function tentarUsar(
  p: Poderes,
  bloqueio: string | null,
  origem: { x: number; y: number },
  alvo: { x: number; y: number },
): PoderUsado | null {
  if (bloqueio) {
    avisar(p, bloqueio);
    return null;
  }
  const poder = poderEscolhido(p);
  const falta = p.recarga[p.selecionado];
  if (falta > 0) {
    avisar(p, `EM RECARGA: ${Math.ceil(falta)}S`);
    return null;
  }
  comecarRecarga(p, poder);
  return { poder, x: Math.max(0, Math.min(MUNDO, origem.x)), y: origem.y, alvoX: alvo.x, alvoY: alvo.y };
}

// ---- No mapa ----

type Efeito = EfeitoAnjo | EfeitoLeslie | EfeitoGrow;
export type Efeitos = Nucleo<Efeito>;

export function criarEfeitos(): Efeitos {
  return { lista: [], particulas: [], numeros: [], zonas: new Map() };
}

// `chaoDoMapa` e `folga`: o chão desenhado e os px de grama acima da linha dele (os poderes que
// saem da terra redesenham a grama por cima da base).
export function prepararPoderes(yDoChao: number, chaoDoMapa?: HTMLCanvasElement, folga = 0): void {
  prepararEfeitos(yDoChao, chaoDoMapa, folga);
}

const PODERES_LESLIE: readonly IdPoder[] = PODERES_DO_HEROI.leslie;
const daLeslie = (poder: IdPoder): poder is PoderLeslie => PODERES_LESLIE.includes(poder);
const efeitoDaLeslie = (ef: Efeito): ef is EfeitoLeslie =>
  ef.tipo === 'chicote' || ef.tipo === 'raizes' || ef.tipo === 'furia';
const doGrow = (poder: IdPoder): poder is PoderGrow => (PODERES_DO_GROW as readonly IdPoder[]).includes(poder);
const efeitoDoGrow = (ef: Efeito): ef is EfeitoGrow =>
  ef.tipo === 'aves' || ef.tipo === 'vento' || ef.tipo === 'salto' || ef.tipo === 'investida' || ef.tipo === 'pedra';

// Põe no mapa o poder usado — o seu, o da CPU ou o do outro jogador que chegou pela rede. Tudo
// sai do uso (origem e alvo), então os dois lados online montam o mesmo poder.
export function lancarPoder(e: Efeitos, dono: Dono, uso: PoderUsado): void {
  const poder = uso.poder;
  if (daLeslie(poder)) lancarPoderLeslie(e as Nucleo<EfeitoLeslie>, dono, { ...uso, poder });
  else if (doGrow(poder)) lancarPoderGrow(e as Nucleo<EfeitoGrow>, dono, { ...uso, poder });
  else lancarPoderAnjo(e as Nucleo<EfeitoAnjo>, dono, { ...uso, poder: poder as PoderAnjo });
}

// O Vendaval de `dono`: soltou o botão (para assim que passar o mínimo) e se ainda sopra.
export function pararVento(e: Efeitos, dono: Dono): void {
  pararVentoGrow(e, dono);
}

export function soprando(e: Efeitos, dono: Dono): boolean {
  return ventoDo(e, dono);
}

export function atualizarEfeitos(e: Efeitos, dt: number, alvos: readonly Alvo[]): void {
  e.lista = e.lista.filter((ef) =>
    efeitoDaLeslie(ef)
      ? atualizarEfeitoLeslie(e as Nucleo<EfeitoLeslie>, ef, dt, alvos)
      : efeitoDoGrow(ef)
        ? atualizarEfeitoGrow(e as Nucleo<EfeitoGrow>, ef, dt, alvos)
        : atualizarEfeitoAnjo(e as Nucleo<EfeitoAnjo>, ef, dt, alvos),
  );
  atualizarVeneno(e, alvos, dt);
  atualizarNucleo(e, dt);
}

// O que a CPU enxerga para desviar: as marcas no chão que ainda não estouraram e o que vem
// voando, de quem não é ela.
export function ameacasPara(e: Efeitos, corpo: Dono): Ameacas {
  const ameacas: Ameacas = { areas: [], projeteis: [] };
  for (const ef of e.lista) {
    if (ef.dono === corpo) continue;
    if (efeitoDaLeslie(ef)) ameacasDaLeslie(ef, ameacas);
    else if (efeitoDoGrow(ef)) ameacasDoGrow(ef, ameacas);
    else ameacasDoAnjo(ef, ameacas);
  }
  return ameacas;
}

// Antes dos personagens: as marcas no chão (eles ficam por cima delas).
export function desenharEfeitosNoChao(ctx: CanvasRenderingContext2D, e: Efeitos, tempo: number): void {
  for (const ef of e.lista) {
    if (efeitoDaLeslie(ef)) desenharLeslieNoChao(ctx, ef, tempo);
    else if (efeitoDoGrow(ef)) desenharGrowNoChao(ctx, ef, tempo);
    else desenharAnjoNoChao(ctx, ef, tempo);
  }
}

// Depois dos personagens: o que voa, estoura e brota, e as faíscas.
export function desenharEfeitosNaFrente(ctx: CanvasRenderingContext2D, e: Efeitos, tempo: number): void {
  for (const ef of e.lista) {
    if (efeitoDaLeslie(ef)) desenharLeslieNaFrente(ctx, ef, tempo);
    else if (efeitoDoGrow(ef)) desenharGrowNaFrente(ctx, ef, tempo);
    else desenharAnjoNaFrente(ctx, ef, tempo);
  }
  desenharParticulas(ctx, e);
}

export function desenharNumerosDeDano(ctx: CanvasRenderingContext2D, e: Efeitos): void {
  desenharNumeros(ctx, e);
}

// Com o poder escolhido pronto, mostra de leve onde ele vai cair se clicar agora.
export function desenharPreviaDoPoder(
  ctx: CanvasRenderingContext2D,
  poder: IdPoder,
  origem: { x: number; y: number },
  alvo: { x: number; y: number },
  tempo: number,
): void {
  ctx.save();
  ctx.globalAlpha = PREVIA.alfa * (0.8 + 0.2 * Math.sin(tempo * 4));
  if (daLeslie(poder)) desenharPreviaLeslie(ctx, poder, origem, alvo, tempo, PREVIA);
  else if (doGrow(poder)) desenharPreviaGrow(ctx, poder, origem, alvo, tempo, PREVIA);
  else desenharPreviaAnjo(ctx, poder as PoderAnjo, origem, alvo, tempo);
  ctx.restore();
}
