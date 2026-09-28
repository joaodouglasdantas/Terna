// O botão de ligar e desligar a música (som/musica.ts): no menu da partida e, pequeno, no canto
// da tela inicial.

import { ligarMusica, musicaLigada } from '../som/musica';
import { botao } from './dom';

export function botaoDaMusica(classe = 'inicio-botao inicio-botao-claro'): HTMLButtonElement {
  const texto = (): string => `Música: ${musicaLigada() ? 'ligada' : 'desligada'}`;
  const b = botao(texto(), classe, () => {
    ligarMusica(!musicaLigada());
    b.textContent = texto();
    b.setAttribute('aria-pressed', String(musicaLigada()));
  });
  b.setAttribute('aria-pressed', String(musicaLigada()));
  return b;
}
