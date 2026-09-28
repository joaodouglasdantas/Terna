// O que aparece por cima do jogo durante a partida: a engrenagem ao lado do cronômetro, o menu
// que ela abre (ou o Esc), a tela de controles (a tecla Tab: ajuda.ts) e a tela de fim. Sozinho, o menu pausa o jogo; online ele só abre —
// a partida e o outro jogador seguem, e o seu personagem fica parado enquanto isso. A tela de fim
// oferece jogar de novo: sozinho, direto; online, com o mesmo oponente, se ele aceitar
// (revanche.ts).

import type { Heroi } from '@terna/compartilhado';
import { montarAjuda } from './ajuda';
import { botao, elemento, palco, sairComEsmaecer } from './dom';
import { botaoDaMusica } from './musica';
import type { Revanche } from './revanche';

export interface OpcoesMenus {
  online: boolean;
  heroi: Heroi; // o seu, para a tela de controles mostrar os poderes dele
  aoMudarMenu: (aberto: boolean) => void;
  aoSair: () => void;
}

export interface MenusDaPartida {
  // Termina a partida na tela: fecha o menu, tira a engrenagem e mostra o resultado. A promessa
  // termina quando a pessoa aperta "Voltar ao menu" ('menu') ou jogar de novo ('revanche'):
  // `'sozinho'`, contra a CPU, na hora; com uma `Revanche` (online), quando os dois pediram.
  mostrarFim(titulo: string, texto: string, revanche?: Revanche | 'sozinho'): Promise<'menu' | 'revanche'>;
  // Abre o menu, como o Esc, se nada estiver aberto (a janela ficou pequena demais: janela.ts).
  abrirMenu(): void;
  // Tira tudo da tela (saiu da partida).
  remover(): void;
}

// Engrenagem em pixels (13×13), no mesmo estilo da arte do jogo: o corpo redondo com o furo no
// meio e oito dentes quadrados, quatro nas pontas e quatro nas diagonais. De metal, com a luz
// vindo de cima e da esquerda: as beiradas viradas para lá claras, as do outro lado escuras (no
// furo, ao contrário: a parede de baixo e da direita é a que pega luz).
const ENGRENAGEM = [
  '.....###.....',
  '.##..###..##.',
  '.###########.',
  '..#########..',
  '..###...###..',
  '####.....####',
  '####.....####',
  '####.....####',
  '..###...###..',
  '..#########..',
  '.###########.',
  '.##..###..##.',
  '.....###.....',
];
const METAL = { brilho: '#e4e8f0', luz: '#b4bac8', meio: '#7e8492', sombra: '#4a4e5a' };

function iconeEngrenagem(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${ENGRENAGEM.length} ${ENGRENAGEM.length}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  const cheio = (x: number, y: number): boolean => ENGRENAGEM[y]?.[x] === '#';
  ENGRENAGEM.forEach((linha, y) =>
    [...linha].forEach((c, x) => {
      if (c !== '#') return;
      const acima = cheio(x, y - 1);
      const esquerda = cheio(x - 1, y);
      const cor =
        !acima && !esquerda
          ? METAL.brilho
          : !acima || !esquerda
            ? METAL.luz
            : !cheio(x, y + 1) || !cheio(x + 1, y)
              ? METAL.sombra
              : METAL.meio;
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', String(x));
      r.setAttribute('y', String(y));
      r.setAttribute('width', '1');
      r.setAttribute('height', '1');
      r.setAttribute('fill', cor);
      svg.append(r);
    }),
  );
  return svg;
}

export function montarMenus({ online, heroi, aoMudarMenu, aoSair }: OpcoesMenus): MenusDaPartida {
  const hud = document.getElementById('hud');
  if (!hud) throw new Error('faltou o <div id="hud"> na página');

  const engrenagem = elemento('button', 'hud-engrenagem');
  engrenagem.type = 'button';
  engrenagem.setAttribute('aria-label', online ? 'Menu' : 'Pausar');
  engrenagem.append(iconeEngrenagem());
  hud.append(engrenagem);

  // O que está aberto por cima do jogo: o menu da engrenagem ou a tela de controles.
  let menu: HTMLElement | null = null;
  let ajudaAberta = false;
  let acabou = false;

  const fecharMenu = (): void => {
    if (!menu) return;
    menu.remove();
    menu = null;
    ajudaAberta = false;
    aoMudarMenu(false);
    engrenagem.focus({ preventScroll: true });
  };

  const abrirMenu = (): void => {
    if (menu || acabou) return;
    const tela = elemento('section', 'inicio-tela inicio-pausa');
    const caixa = elemento('div', 'inicio-caixa');
    const titulo = elemento('h1', 'inicio-titulo', online ? 'Menu' : 'Pausado');
    const continuar = botao('Continuar', 'inicio-botao', fecharMenu);
    const sair = botao('Sair da partida', 'inicio-botao inicio-botao-claro', () => {
      remover();
      aoSair();
    });
    caixa.append(titulo);
    if (online) caixa.append(elemento('p', 'inicio-sub', 'A partida continua enquanto o menu está aberto.'));
    const controles = botao('Controles (Tab)', 'inicio-botao inicio-botao-claro', abrirAjuda);
    caixa.append(continuar, controles, botaoDaMusica(), sair);
    tela.append(caixa);
    // Clicar fora da caixa fecha, como o Esc.
    tela.addEventListener('click', (evento) => {
      if (evento.target === tela) fecharMenu();
    });
    palco().replaceChildren(tela);
    menu = tela;
    aoMudarMenu(true);
    continuar.focus();
  };

  // A tela de controles: no lugar do menu, se ele estava aberto.
  const abrirAjuda = (): void => {
    if (acabou || ajudaAberta) return;
    const tela = montarAjuda(heroi, fecharMenu);
    palco().replaceChildren(tela);
    const estava = Boolean(menu);
    menu = tela;
    ajudaAberta = true;
    if (!estava) aoMudarMenu(true);
    tela.querySelector<HTMLButtonElement>('.inicio-ajuda-fechar')?.focus({ preventScroll: true });
  };

  engrenagem.addEventListener('click', () => (menu ? fecharMenu() : abrirMenu()));
  // Esc: abre o menu ou fecha o que estiver aberto. Tab: abre e fecha os controles (e não passa
  // o foco de botão em botão, como faria na página).
  const aoTeclar = (evento: KeyboardEvent): void => {
    if (acabou) return;
    if (evento.code === 'Tab') {
      evento.preventDefault();
      if (evento.repeat) return;
      if (ajudaAberta) fecharMenu();
      else abrirAjuda();
    } else if (evento.code === 'Escape') {
      evento.preventDefault();
      if (menu) fecharMenu();
      else abrirMenu();
    }
  };
  window.addEventListener('keydown', aoTeclar);

  const remover = (): void => {
    acabou = true;
    window.removeEventListener('keydown', aoTeclar);
    engrenagem.remove();
    menu?.remove();
    menu = null;
    ajudaAberta = false;
  };

  return {
    mostrarFim(titulo, texto, revanche) {
      remover();
      return new Promise((resolver) => {
        const tela = elemento('section', 'inicio-tela inicio-pausa');
        const caixa = elemento('div', 'inicio-caixa');
        let acabou = false;
        const sair = (como: 'menu' | 'revanche'): void => {
          if (acabou) return;
          acabou = true;
          void sairComEsmaecer(tela).then(() => resolver(como));
        };
        const voltar = botao('Voltar ao menu', revanche ? 'inicio-botao inicio-botao-claro' : 'inicio-botao', () => sair('menu'));
        caixa.append(elemento('h1', 'inicio-titulo', titulo), elemento('p', 'inicio-sub', texto));
        if (revanche === 'sozinho') {
          // Contra a CPU: jogar de novo volta direto à escolha de personagem.
          const jogar = botao('Jogar novamente', 'inicio-botao', () => sair('revanche'));
          caixa.append(jogar, voltar);
          tela.append(caixa);
          palco().replaceChildren(tela);
          jogar.focus();
          return;
        }
        if (revanche) {
          // Jogar de novo: pede a revanche; o outro pedindo também (ou já tendo pedido), a escolha
          // de personagem volta, na mesma sala.
          const estado = elemento('p', 'inicio-revanche-estado');
          estado.setAttribute('aria-live', 'polite');
          const jogar = botao('Jogar novamente', 'inicio-botao', () => revanche.pedir());
          const atualizar = (): void => {
            jogar.disabled = revanche.saiu || revanche.pedi;
            if (revanche.saiu) {
              estado.textContent = `${revanche.oponente} saiu da sala.`;
              jogar.textContent = 'Jogar novamente';
            } else if (revanche.pedi) {
              estado.textContent = revanche.outroQuer ? 'Voltando à escolha…' : `Esperando ${revanche.oponente} aceitar…`;
              jogar.textContent = 'Pronto!';
            } else if (revanche.outroQuer) {
              estado.textContent = `${revanche.oponente} quer jogar de novo!`;
              jogar.textContent = 'Aceitar e jogar';
            }
            estado.dataset.destaque = String(revanche.outroQuer && !revanche.pedi && !revanche.saiu);
          };
          revanche.aoMudar = atualizar;
          atualizar();
          void revanche.pronta.then(() => sair('revanche'));
          caixa.append(estado, jogar, voltar);
          tela.append(caixa);
          palco().replaceChildren(tela);
          jogar.focus();
          return;
        }
        caixa.append(voltar);
        tela.append(caixa);
        palco().replaceChildren(tela);
        voltar.focus();
      });
    },
    abrirMenu,
    remover,
  };
}
