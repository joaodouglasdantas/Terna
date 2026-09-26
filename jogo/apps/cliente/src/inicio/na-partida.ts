// O que aparece por cima do jogo durante a partida: a engrenagem ao lado do cronômetro, o menu
// que ela abre (ou o Esc) e a tela de fim. Sozinho, o menu pausa o jogo; online ele só abre —
// a partida e o outro jogador seguem, e o seu personagem fica parado enquanto isso.

import { botao, elemento, palco, sairComEsmaecer } from './dom';

export interface OpcoesMenus {
  online: boolean;
  aoMudarMenu: (aberto: boolean) => void;
  aoSair: () => void;
}

export interface MenusDaPartida {
  // Termina a partida na tela: fecha o menu, tira a engrenagem e mostra o resultado. A promessa
  // termina quando a pessoa aperta "Voltar ao menu".
  mostrarFim(titulo: string, texto: string): Promise<void>;
  // Tira tudo da tela (saiu da partida).
  remover(): void;
}

// Engrenagem em pixels (13×13), no mesmo estilo da arte do jogo: o corpo redondo com o furo no
// meio e oito dentes quadrados, quatro nas pontas e quatro nas diagonais.
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

function iconeEngrenagem(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${ENGRENAGEM.length} ${ENGRENAGEM.length}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  ENGRENAGEM.forEach((linha, y) =>
    [...linha].forEach((c, x) => {
      if (c !== '#') return;
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', String(x));
      r.setAttribute('y', String(y));
      r.setAttribute('width', '1');
      r.setAttribute('height', '1');
      svg.append(r);
    }),
  );
  return svg;
}

export function montarMenus({ online, aoMudarMenu, aoSair }: OpcoesMenus): MenusDaPartida {
  const hud = document.getElementById('hud');
  if (!hud) throw new Error('faltou o <div id="hud"> na página');

  const engrenagem = elemento('button', 'hud-engrenagem');
  engrenagem.type = 'button';
  engrenagem.setAttribute('aria-label', online ? 'Menu' : 'Pausar');
  engrenagem.append(iconeEngrenagem());
  hud.append(engrenagem);

  let menu: HTMLElement | null = null;
  let acabou = false;

  const fecharMenu = (): void => {
    if (!menu) return;
    menu.remove();
    menu = null;
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
    caixa.append(continuar, sair);
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

  engrenagem.addEventListener('click', () => (menu ? fecharMenu() : abrirMenu()));
  const aoTeclar = (evento: KeyboardEvent): void => {
    if (evento.code !== 'Escape' || acabou) return;
    evento.preventDefault();
    if (menu) fecharMenu();
    else abrirMenu();
  };
  window.addEventListener('keydown', aoTeclar);

  const remover = (): void => {
    acabou = true;
    window.removeEventListener('keydown', aoTeclar);
    engrenagem.remove();
    menu?.remove();
    menu = null;
  };

  return {
    mostrarFim(titulo, texto) {
      remover();
      return new Promise((resolver) => {
        const tela = elemento('section', 'inicio-tela inicio-pausa');
        const caixa = elemento('div', 'inicio-caixa');
        const voltar = botao('Voltar ao menu', 'inicio-botao', () => void sairComEsmaecer(tela).then(resolver));
        caixa.append(elemento('h1', 'inicio-titulo', titulo), elemento('p', 'inicio-sub', texto), voltar);
        tela.append(caixa);
        palco().replaceChildren(tela);
        voltar.focus();
      });
    },
    remover,
  };
}
