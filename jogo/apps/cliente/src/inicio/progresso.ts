// O progresso da conta nas telas: os ícones em pixel dos azios (a moeda do jogo) e do XP, o selo
// do nível do perfil com a barrinha de XP, o contador de azios e a partida da conta (a partida
// começa e termina no servidor, que soma o XP e os pontos do passe: progresso.ts de
// @terna/compartilhado).

import {
  nivelDoPerfil,
  type FimDaPartidaDaConta,
  type Jogador,
  type ModoDaPartidaDaConta,
  type ResultadoDaPartida,
} from '@terna/compartilhado';
import { api } from '../rede/api';
import { atualizarConta, contaAtual } from '../save/sessao';
import { elemento } from './dom';

// ---- Os ícones em pixel ----

type Paleta = Record<string, string>;

// Um desenho em pixels (cada letra é uma cor da paleta; '.' é vazio) num SVG nítido.
function svgDePixels(linhas: readonly string[], paleta: Paleta, classe: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${linhas[0].length} ${linhas.length}`);
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('shape-rendering', 'crispEdges');
  linhas.forEach((linha, y) => {
    // Um retângulo por trecho da mesma cor.
    for (const trecho of linha.matchAll(/([^.])\1*/g)) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', String(trecho.index));
      r.setAttribute('y', String(y));
      r.setAttribute('width', String(trecho[0].length));
      r.setAttribute('height', '1');
      r.setAttribute('fill', paleta[trecho[1]] ?? '#f0f');
      svg.append(r);
    }
  });
  return svg;
}

// O azio: uma moeda de cristal azul, com a borda mais clara do lado da luz (em cima e à
// esquerda) e um losango brilhante no meio. Sai de um círculo, pixel a pixel.
const AZIO: readonly string[] = (() => {
  const lado = 12;
  const c = (lado - 1) / 2;
  const linhas: string[] = [];
  for (let y = 0; y < lado; y++) {
    let linha = '';
    for (let x = 0; x < lado; x++) {
      const d = Math.hypot(x - c, y - c);
      const luz = x + y < lado - 1; // do lado de cima e da esquerda
      const losango = Math.abs(x - c) + Math.abs(y - c);
      if (d > 6.1) linha += '.';
      else if (d > 5.1) linha += 'o';
      else if (d > 4.1) linha += luz ? 'l' : 'r';
      else if (losango <= 1.5) linha += 'w';
      else if (losango <= 2.5) linha += luz ? 'c' : 'm';
      else linha += luz ? 'b' : 'd';
    }
    linhas.push(linha);
  }
  return linhas;
})();
const PALETA_AZIO: Paleta = {
  o: '#140f26', // contorno
  l: '#8fd8ff', // a borda na luz
  r: '#2a5fa6', // a borda na sombra
  b: '#4aa6e6', // o corpo na luz
  d: '#2f74bd', // o corpo na sombra
  c: '#bdeaff', // o losango
  m: '#86c8f2',
  w: '#f4fcff', // o brilho do meio
};

// O XP: uma estrela dourada de cinco pontas, contornada de escuro, mais clara em cima.
const FORMA_DA_ESTRELA = [
  '.....#.....',
  '....###....',
  '....###....',
  '###########',
  '.#########.',
  '..#######..',
  '...#####...',
  '...#####...',
  '..###.###..',
  '..##...##..',
  '.#.......#.',
];
const ESTRELA: readonly string[] = (() => {
  const alto = FORMA_DA_ESTRELA.length + 2;
  const largo = FORMA_DA_ESTRELA[0].length + 2;
  const dentro = (x: number, y: number): boolean => FORMA_DA_ESTRELA[y - 1]?.[x - 1] === '#';
  const linhas: string[] = [];
  for (let y = 0; y < alto; y++) {
    let linha = '';
    for (let x = 0; x < largo; x++) {
      if (dentro(x, y)) linha += y <= 4 ? 'w' : y <= 7 ? 'a' : 's';
      else if (dentro(x - 1, y) || dentro(x + 1, y) || dentro(x, y - 1) || dentro(x, y + 1)) linha += 'o';
      else linha += '.';
    }
    linhas.push(linha);
  }
  return linhas;
})();
const PALETA_ESTRELA: Paleta = { o: '#2e1a0a', w: '#fff0a8', a: '#f6c94a', s: '#d58f22' };

export const iconeAzio = (classe = 'inicio-icone-azio'): SVGSVGElement => svgDePixels(AZIO, PALETA_AZIO, classe);
export const iconeXp = (classe = 'inicio-icone-xp'): SVGSVGElement => svgDePixels(ESTRELA, PALETA_ESTRELA, classe);

// "1.250" (o ponto dos milhares, como no Brasil).
export const numero = (n: number): string => n.toLocaleString('pt-BR');

// ---- Na tela inicial ----

// O contador de azios: o ícone e o saldo da conta (`mostrar` de novo quando ela mudar).
export function contadorDeAzios(classe: string): { el: HTMLElement; mostrar: () => void } {
  const el = elemento('div', `inicio-azios ${classe}`);
  el.title = 'Azios, a moeda do Terna';
  const valor = elemento('span', 'inicio-azios-valor');
  el.append(iconeAzio(), valor);
  const mostrar = (): void => {
    const azios = contaAtual()?.azios ?? 0;
    valor.textContent = numero(azios);
    el.setAttribute('aria-label', `${numero(azios)} azios`);
  };
  mostrar();
  return { el, mostrar };
}

// O nível do perfil: o número num selo e a barra do XP no nível (com o texto, se `comTexto`).
export function barraDeNivel(classe: string, comTexto = false): { el: HTMLElement; mostrar: (j: Jogador) => void } {
  const el = elemento('div', `inicio-nivel ${classe}`);
  const selo = elemento('span', 'inicio-nivel-selo');
  const trilho = elemento('span', 'inicio-nivel-trilho');
  const cheio = elemento('span', 'inicio-nivel-cheio');
  trilho.append(cheio);
  trilho.setAttribute('role', 'progressbar');
  trilho.setAttribute('aria-valuemin', '0');
  const texto = elemento('span', 'inicio-nivel-texto');
  el.append(selo, trilho);
  if (comTexto) el.append(texto);
  const mostrar = (j: Jogador): void => {
    const n = nivelDoPerfil(j.xp);
    selo.textContent = `Nv ${n.nivel}`;
    const parte = n.xpParaSubir ? n.xpNoNivel / n.xpParaSubir : 1;
    cheio.style.width = `${(parte * 100).toFixed(1)}%`;
    trilho.setAttribute('aria-valuemax', String(n.xpParaSubir || 1));
    trilho.setAttribute('aria-valuenow', String(n.xpParaSubir ? n.xpNoNivel : 1));
    const falta = n.xpParaSubir
      ? `${numero(n.xpNoNivel)} / ${numero(n.xpParaSubir)} XP para o nível ${n.nivel + 1}`
      : 'Nível máximo';
    trilho.setAttribute('aria-label', `Nível ${n.nivel}: ${falta}`);
    texto.textContent = falta;
  };
  const j = contaAtual();
  if (j) mostrar(j);
  return { el, mostrar };
}

// ---- A partida da conta ----

// Abre a partida no servidor (sozinho ou online; o treino não conta) e devolve como terminar: o
// resultado vai para o servidor, a conta guardada é atualizada e a promessa traz o que a partida
// deu (null: não deu para falar com o servidor, ou a partida não abriu). Nada disso segura o jogo.
export function comecarPartidaDaConta(modo: ModoDaPartidaDaConta): { terminar: (resultado: ResultadoDaPartida) => Promise<FimDaPartidaDaConta | null> } {
  const id = contaAtual()
    ? api.comecarPartida(modo).catch((erro: unknown) => {
        console.warn('não consegui abrir a partida da conta', erro);
        return null;
      })
    : Promise.resolve(null);
  let terminada: Promise<FimDaPartidaDaConta | null> | null = null;
  return {
    terminar(resultado) {
      terminada ??= id.then(async (partida) => {
        if (!partida) return null;
        try {
          const fim = await api.terminarPartida(partida, resultado);
          atualizarConta(fim.jogador);
          return fim;
        } catch (erro) {
          console.warn('não consegui fechar a partida da conta', erro);
          return null;
        }
      });
      return terminada;
    },
  };
}

// O que a partida deu, para a tela de fim: "+40 XP · +30 pontos do passe" e, subindo, o nível novo.
export function linhaDoGanho(fim: FimDaPartidaDaConta): HTMLElement {
  const el = elemento('div', 'inicio-ganho');
  if (!fim.ganho.xp && !fim.ganho.pontos) {
    el.append(elemento('p', 'inicio-ganho-nada', 'Esta partida não contou para o XP e o passe.'));
    return el;
  }
  const linha = elemento('p', 'inicio-ganho-linha');
  const xp = elemento('span', 'inicio-ganho-item');
  xp.append(iconeXp(), `+${numero(fim.ganho.xp)} XP`);
  const pontos = elemento('span', 'inicio-ganho-item');
  pontos.append(elemento('span', 'inicio-ganho-passe', 'Passe'), `+${numero(fim.ganho.pontos)} pontos`);
  linha.append(xp, pontos);
  el.append(linha);
  if (fim.subiuPara) el.append(elemento('p', 'inicio-ganho-subiu', `Você subiu para o nível ${fim.subiuPara}!`));
  return el;
}
