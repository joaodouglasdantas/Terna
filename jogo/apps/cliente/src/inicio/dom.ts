// Peças de DOM das telas por cima do jogo (carregamento, menus, multiplayer, pausa, fim).

import '@fontsource/tiny5/400.css';
import logoUrl from '../assets/logo.png';
import './inicio.css';

export function elemento<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

export function botao(texto: string, classe: string, aoClicar: () => void): HTMLButtonElement {
  const b = elemento('button', classe, texto);
  b.type = 'button';
  b.addEventListener('click', aoClicar);
  return b;
}

export function imagemDaLogo(classe: string): HTMLImageElement {
  const logo = elemento('img', classe);
  logo.src = logoUrl;
  logo.alt = 'Terna';
  logo.draggable = false;
  return logo;
}

// Onde as telas moram: um <div id="inicio"> que cobre a janela (some quando está vazio).
export function palco(): HTMLElement {
  const el = document.getElementById('inicio');
  if (!el) throw new Error('faltou o <div id="inicio"> na página');
  return el;
}

export const ESMAECER_MS = 350;

// Esmaece a tela e tira do lugar; a promessa termina quando ela sumiu.
export function sairComEsmaecer(tela: HTMLElement): Promise<void> {
  tela.classList.add('inicio-saindo');
  return new Promise((resolver) =>
    setTimeout(() => {
      tela.remove();
      resolver();
    }, ESMAECER_MS),
  );
}

// Digitando num campo, as teclas são do campo, não dos atalhos da tela.
export function digitandoEm(evento: KeyboardEvent): boolean {
  return evento.target instanceof HTMLInputElement;
}
