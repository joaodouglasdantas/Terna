// A tela de controles da partida (a tecla Tab abre e fecha; o Esc também fecha): um tutorial
// curto das funções de combate — andar, pular, pulo duplo, dash, pegar e largar arma, atacar,
// trocar para os poderes, a energia pixy e as transformações — e, embaixo, os poderes do seu
// personagem, com o ícone do painel e o que cada um faz. Sozinho, o jogo pausa enquanto ela está
// aberta; online, a partida segue (como o menu).

import {
  ARCO,
  DEFESA_GOLEM,
  DURACAO_ANJO,
  DURACAO_GOLEM,
  FLOR,
  NOME_PODER,
  PODERES_DO_HEROI,
  PODERES_GOLEM,
  SOBRE_HEROI,
  type Heroi,
  type IdPoder,
} from '@terna/compartilhado';
import { iconeDoPoder } from '../interface/painel';
import { contexto2d } from '../motor/imagens';
import { elemento } from './dom';
import { SOBRE_PODER } from './selecao';

// Uma linha: as teclas (cada item vira uma tecla desenhada; '/' vira "ou") e o que fazem.
type Linha = [teclas: string[], texto: string];

const MOVIMENTO: Linha[] = [
  [['A', 'D', '/', '←', '→'], 'Andar'],
  [['W', '/', '↑', '/', 'Espaço'], 'Pular'],
  [['Pular no ar'], 'Pulo duplo'],
  [['2× A', '/', '2× D'], 'Dash: um arranco curto, no chão ou no ar'],
];

const ARMAS: Linha[] = [
  [['Encostar'], 'Pegar a espada ou o arco que caiu do céu'],
  [['Clique esq.'], 'Atacar com a arma, na direção da mira'],
  [['Sem arma'], 'Clique esq. dá um soco: curto e fraquinho'],
  [['E'], 'Jogar fora a arma da mão (ela some)'],
];

const PODERES: Linha[] = [
  [['R'], 'Trocar o que o clique usa: a arma ou os poderes'],
  [['Clique dir.'], 'Passar para o próximo poder (o quadrinho aceso no painel)'],
  [['Clique esq.'], 'Usar o poder escolhido, na direção da mira'],
];

const PARTIDA: Linha[] = [
  [['Esc'], 'Menu (sozinho, pausa o jogo)'],
  [['Tab'], 'Abrir e fechar esta tela'],
];

function teclas(lista: string[]): HTMLElement {
  const caixa = elemento('span', 'inicio-ajuda-teclas');
  for (const t of lista) caixa.append(t === '/' ? elemento('span', 'inicio-ajuda-ou', 'ou') : elemento('kbd', '', t));
  return caixa;
}

function secao(titulo: string, linhas: Linha[], nota?: string): HTMLElement {
  const bloco = elemento('section', 'inicio-ajuda-secao');
  bloco.append(elemento('h2', '', titulo));
  const lista = elemento('dl', '');
  for (const [t, texto] of linhas) lista.append(elemento('dt', ''), elemento('dd', '', texto));
  // O <dt> recebe as teclas desenhadas (o elemento() só põe texto).
  lista.querySelectorAll('dt').forEach((dt, i) => dt.append(teclas(linhas[i][0])));
  bloco.append(lista);
  if (nota) bloco.append(elemento('p', 'inicio-ajuda-nota', nota));
  return bloco;
}

function poder(id: IdPoder, numero: number): HTMLElement {
  const item = elemento('li', '');
  const icone = elemento('canvas', 'inicio-ajuda-icone');
  const origem = iconeDoPoder(id);
  icone.width = origem.width;
  icone.height = origem.height;
  contexto2d(icone).drawImage(origem, 0, 0);
  icone.setAttribute('aria-hidden', 'true');
  const texto = elemento('span', '');
  texto.append(elemento('strong', '', `${numero} · ${NOME_PODER[id]}`), elemento('span', '', SOBRE_PODER[id]));
  item.append(icone, texto);
  return item;
}

// O que muda de um personagem para outro: as dicas e, se ele se transforma, a lista da outra forma.
function dicasDo(heroi: Heroi): { dicas: string[]; outra?: { titulo: string; poderes: readonly IdPoder[] } } {
  if (heroi === 'leslie') {
    return {
      dicas: [
        'O Chicote envenena: o outro vai perdendo vida aos poucos.',
        'O veneno do Chicote cura você: a metade do que ele tira.',
        'A última roda das Raízes prende por mais tempo — dá para emendar a Flor.',
        `A Flor Carnívora só sai com a barra cheia: fica ${FLOR.duracao} s de pé, persegue o outro e cospe veneno de longe.`,
      ],
    };
  }
  if (heroi === 'grow') {
    return {
      dicas: [
        'O cajado: no modo poderes fica na mão, e os poderes saem da pedra dele; no modo arma (arma ou soco) vai nas costas.',
        'Vendaval: segure o clique esquerdo para soprar; soltando, o vento para.',
        `Golem: com a barra cheia, o 3 vira golem por ${DURACAO_GOLEM} s (o R desfaz antes).`,
        `De golem: os poderes não gastam energia, a pele de pedra segura ${Math.round(DEFESA_GOLEM * 100)}% do dano (DEF), e ele não pega arma, não dá soco nem pulo duplo.`,
      ],
      outra: { titulo: 'De golem', poderes: PODERES_GOLEM },
    };
  }
  return {
    dicas: [`Com a barra cheia, o R vira anjo por ${DURACAO_ANJO} s: ele voa (segure o pulo) e usa os poderes; a arma da mão cai.`],
  };
}

function seuPersonagem(heroi: Heroi): HTMLElement {
  const bloco = elemento('section', 'inicio-ajuda-secao inicio-ajuda-heroi');
  bloco.append(elemento('h2', '', `Seu personagem: ${SOBRE_HEROI[heroi].nome}`));
  const { dicas, outra } = dicasDo(heroi);
  const listas = elemento('div', 'inicio-ajuda-poderes');
  const lista = (titulo: string | null, ids: readonly IdPoder[]): void => {
    const coluna = elemento('div', '');
    if (titulo) coluna.append(elemento('h3', '', titulo));
    const ul = elemento('ul', '');
    ids.forEach((id, i) => ul.append(poder(id, i + 1)));
    coluna.append(ul);
    listas.append(coluna);
  };
  lista(outra ? 'De gente' : null, PODERES_DO_HEROI[heroi]);
  if (outra) lista(outra.titulo, outra.poderes);
  bloco.append(listas);
  const ul = elemento('ul', 'inicio-ajuda-dicas');
  for (const d of dicas) ul.append(elemento('li', '', d));
  bloco.append(ul);
  return bloco;
}

export function montarAjuda(heroi: Heroi, aoFechar: () => void): HTMLElement {
  const tela = elemento('section', 'inicio-tela inicio-pausa inicio-ajuda');
  const caixa = elemento('div', 'inicio-caixa inicio-ajuda-caixa');
  const topo = elemento('div', 'inicio-ajuda-topo');
  const fechar = elemento('button', 'inicio-botao inicio-botao-claro inicio-ajuda-fechar', 'Fechar (Tab)');
  fechar.type = 'button';
  fechar.addEventListener('click', aoFechar);
  topo.append(elemento('h1', 'inicio-titulo', 'Como lutar'), fechar);

  const colunas = elemento('div', 'inicio-ajuda-colunas');
  const esquerda = elemento('div', '');
  esquerda.append(
    secao('Movimento', MOVIMENTO, 'O golem é pesado: sem pulo duplo.'),
    secao('Armas', ARMAS, `Cada arma dura ${ARCO.durabilidade} s na mão e quebra. Na cabeça o golpe tira mais; nos pés, menos.`),
  );
  const direita = elemento('div', '');
  direita.append(
    secao(
      'Poderes e energia',
      PODERES,
      'A energia pixy (a barra de baixo, no painel) enche com o dano que você dá, e cada poder gasta a dele. A mira fica verde quando o clique está pronto.',
    ),
    secao('Partida', PARTIDA, 'Derrube o outro antes de o relógio zerar; zerando, vence quem tiver mais vida.'),
  );
  colunas.append(esquerda, direita);

  caixa.append(topo, colunas, seuPersonagem(heroi));
  tela.append(caixa);
  // Clicar fora da caixa fecha, como no menu.
  tela.addEventListener('click', (evento) => {
    if (evento.target === tela) aoFechar();
  });
  return tela;
}
