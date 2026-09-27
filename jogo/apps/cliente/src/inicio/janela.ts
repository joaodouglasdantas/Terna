// A janela pequena demais: abaixo de JANELA_MINIMA (em pixels da página, então o zoom do
// navegador conta), os menus se espremem e a interface desanda. Aí um aviso cobre tudo — o
// carregamento, os menus e a partida — com o tamanho de agora e o mínimo, até a janela crescer de
// novo. Enquanto ele está na tela, o resto da página não recebe clique, foco nem tecla (só as do
// próprio navegador, como o Ctrl e a tecla - do zoom). Na partida, ele abre o menu: sozinho, o
// jogo pausa; online, o personagem fica parado.

import { elemento } from './dom';

export const JANELA_MINIMA = { largura: 960, altura: 540 };

const pequena = (): boolean => innerWidth < JANELA_MINIMA.largura || innerHeight < JANELA_MINIMA.altura;

// `aoFicarPequena`: a janela acabou de passar do mínimo para baixo.
export function vigiarJanela(aoFicarPequena: () => void): void {
  const aviso = elemento('div', '');
  aviso.id = 'janela-pequena';
  aviso.setAttribute('role', 'dialog');
  aviso.setAttribute('aria-modal', 'true');
  aviso.setAttribute('aria-labelledby', 'janela-pequena-titulo');
  const caixa = elemento('div', 'janela-pequena-caixa');
  const titulo = elemento('h1', 'janela-pequena-titulo', 'Janela pequena demais');
  titulo.id = 'janela-pequena-titulo';
  const tecla = /Mac/i.test(navigator.userAgent) ? 'Cmd' : 'Ctrl';
  const medidas = elemento('p', 'janela-pequena-medidas');
  caixa.append(
    titulo,
    elemento('p', '', 'Para uma melhor experiência, jogue numa janela maior: aumente a janela do navegador (ou coloque em tela cheia).'),
    elemento('p', '', `Se o navegador estiver com zoom, diminua um pouco (${tecla} e a tecla -).`),
    medidas,
  );
  aviso.append(caixa);
  aviso.hidden = true;
  document.body.append(aviso);

  // O resto da página, parado por baixo do aviso.
  const resto = ['tela', 'inicio'].map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
  let bloqueada = false;
  const conferir = (): void => {
    const agora = pequena();
    medidas.textContent = `Agora: ${innerWidth} × ${innerHeight} · mínimo: ${JANELA_MINIMA.largura} × ${JANELA_MINIMA.altura}`;
    if (agora === bloqueada) return;
    bloqueada = agora;
    aviso.hidden = !agora;
    for (const el of resto) el.inert = agora;
    if (agora) aoFicarPequena();
  };
  // As teclas do jogo e dos menus (Esc, Tab, R…) não passam enquanto o aviso está na tela. Soltar
  // passa: uma tecla segurada não fica presa quando a janela cresce.
  window.addEventListener(
    'keydown',
    (evento) => {
      if (bloqueada) evento.stopImmediatePropagation();
    },
    true,
  );
  window.addEventListener('resize', conferir);
  conferir();
}
