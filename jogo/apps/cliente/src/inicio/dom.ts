// Peças de DOM das telas por cima do jogo (carregamento, menus, multiplayer, pausa, fim).

import '@fontsource/tiny5/400.css';
import logoUrl from '../assets/logo.webp';
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

// Onde as telas moram: um <div id="inicio"> do tamanho do quadro do jogo, dentro das margens
// pretas (some quando está vazio).
let vigiando = false;

export function palco(): HTMLElement {
  const el = document.getElementById('inicio');
  if (!el) throw new Error('faltou o <div id="inicio"> na página');
  // Uma tela nova entrou: a cortina abre (se a de antes saiu escurecendo) — menos atrás das
  // telas opacas.
  if (!vigiando) {
    vigiando = true;
    new MutationObserver((mudancas) => {
      const telas = mudancas.flatMap((m) => [...m.addedNodes]).filter((n): n is HTMLElement => n instanceof HTMLElement && n.classList.contains('inicio-tela'));
      for (const tela of telas) barraDeRolagem(tela);
      // Uma tela opaca (o carregamento da temporada) cobre o jogo todo: a cortina fica fechada
      // atrás dela e ela aparece do escuro. Abrindo, o jogo aparecia por um instante antes dela.
      if (telas.some((t) => !t.classList.contains(TELA_OPACA))) void abrirCortina(400);
    }).observe(el, { childList: true });
  }
  return el;
}

export const ESMAECER_MS = 350;

// A classe das telas de fundo opaco, que cobrem o jogo inteiro (ver palco()).
export const TELA_OPACA = 'inicio-tela-opaca';

// As telas saindo: tiradas do palco quando terminam de esmaecer (voltando antes disso, ficam).
const saindo = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function tirarDepoisDeEsmaecer(tela: HTMLElement, aoTirar?: () => void): void {
  tela.classList.add('inicio-saindo');
  tela.inert = true; // sumindo: sem clique nem foco
  clearTimeout(saindo.get(tela));
  saindo.set(
    tela,
    setTimeout(() => {
      saindo.delete(tela);
      tela.remove();
      aoTirar?.();
    }, ESMAECER_MS),
  );
}

// Põe `nova` no palco no lugar da que está lá: as duas trocam ao mesmo tempo — a nova aparece
// por cima enquanto a de antes esmaece por baixo —, então não sobra nenhum quadro só com o fundo
// entre uma e outra (nem a tela nova surge de uma vez). Serve também para trazer de volta uma
// tela que estava saindo.
export function mostrarTela(nova: HTMLElement): void {
  const el = palco();
  for (const antiga of [...el.children]) {
    if (antiga !== nova && antiga instanceof HTMLElement) tirarDepoisDeEsmaecer(antiga);
  }
  clearTimeout(saindo.get(nova));
  saindo.delete(nova);
  nova.classList.remove('inicio-saindo');
  nova.inert = false;
  // Já é a de cima (a tela só trocou a caixa por dentro): fica onde está, sem recomeçar a entrada.
  if (el.lastElementChild !== nova) el.append(nova);
}

// Esmaece a tela e tira do lugar, escurecendo atrás junto (o jogo e a arte do menu: a próxima
// tela, ou a partida, aparece do escuro); a promessa termina quando ela sumiu.
export function sairComEsmaecer(tela: HTMLElement): Promise<void> {
  void fecharCortina(ESMAECER_MS);
  return new Promise((resolver) => tirarDepoisDeEsmaecer(tela, resolver));
}

// A barra de rolagem do jogo numa tela (a do navegador fica escondida: inicio.css). Aparece só
// quando o conteúdo não cabe; a alça acompanha a rolagem, dá para arrastá-la e clicar no trilho
// passa uma página. Uma por tela, feita quando ela entra no palco.
function barraDeRolagem(tela: HTMLElement): void {
  if (tela.querySelector(':scope > .inicio-rolagem')) return;
  const trilho = elemento('div', 'inicio-rolagem');
  const alca = elemento('div', 'inicio-rolagem-alca');
  trilho.setAttribute('aria-hidden', 'true');
  trilho.append(alca);
  tela.append(trilho);

  const medidas = (): { sobra: number; curso: number; altura: number } => {
    const sobra = tela.scrollHeight - tela.clientHeight; // o quanto rola
    const trilhoAltura = trilho.clientHeight;
    const altura = Math.max(28, Math.round((trilhoAltura * tela.clientHeight) / Math.max(1, tela.scrollHeight)));
    return { sobra, curso: Math.max(1, trilhoAltura - altura), altura };
  };
  const atualizar = (): void => {
    const rola = tela.scrollHeight > tela.clientHeight + 1;
    trilho.hidden = !rola;
    if (!rola) return;
    const { sobra, curso, altura } = medidas();
    alca.style.height = `${altura}px`;
    alca.style.transform = `translateY(${Math.round((curso * tela.scrollTop) / Math.max(1, sobra))}px)`;
  };
  tela.addEventListener('scroll', atualizar, { passive: true });
  // O tamanho do quadro e o conteúdo (telas que trocam de caixa por dentro) mudam a rolagem.
  new ResizeObserver(atualizar).observe(tela);
  new MutationObserver(() => requestAnimationFrame(atualizar)).observe(tela, { childList: true, subtree: true });
  requestAnimationFrame(atualizar);

  // Arrastar a alça.
  let arrasto: { y: number; topo: number } | null = null;
  alca.addEventListener('pointerdown', (evento) => {
    evento.preventDefault();
    evento.stopPropagation();
    alca.setPointerCapture(evento.pointerId);
    arrasto = { y: evento.clientY, topo: tela.scrollTop };
    trilho.classList.add('inicio-rolagem-arrastando');
  });
  alca.addEventListener('pointermove', (evento) => {
    if (!arrasto) return;
    const { sobra, curso } = medidas();
    // Os pixels da tela passam pela escala do quadro (o palco pode estar ampliado).
    const escala = trilho.getBoundingClientRect().height / Math.max(1, trilho.clientHeight);
    tela.scrollTop = arrasto.topo + ((evento.clientY - arrasto.y) / escala) * (sobra / curso);
  });
  const soltar = (): void => {
    arrasto = null;
    trilho.classList.remove('inicio-rolagem-arrastando');
  };
  alca.addEventListener('pointerup', soltar);
  alca.addEventListener('pointercancel', soltar);
  // Clique no trilho: uma página para aquele lado.
  trilho.addEventListener('pointerdown', (evento) => {
    if (evento.target !== trilho) return;
    const alcaCaixa = alca.getBoundingClientRect();
    const lado = evento.clientY < alcaCaixa.top ? -1 : 1;
    tela.scrollBy({ top: lado * tela.clientHeight * 0.9, behavior: 'smooth' });
  });
}

// A cortina: um preto por cima do jogo e da arte do menu (cena.ts), mas por baixo das telas. A
// transição entre as telas: a que sai esmaece e tudo atrás escurece junto; a próxima (ou a
// partida) aparece e a cortina abre.
function cortina(): HTMLElement {
  let el = document.getElementById('cortina');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cortina';
    document.body.append(el);
  }
  return el;
}

function moverCortina(opacidade: number, ms: number): Promise<void> {
  const el = cortina();
  el.style.transition = `opacity ${ms}ms ease`;
  el.style.opacity = String(opacidade);
  return new Promise((resolver) => setTimeout(resolver, ms));
}

export const abrirCortina = (ms = 500): Promise<void> => moverCortina(0, ms);
export const fecharCortina = (ms = 320): Promise<void> => moverCortina(1, ms);

// Digitando num campo, as teclas são do campo, não dos atalhos da tela.
export function digitandoEm(evento: KeyboardEvent): boolean {
  return evento.target instanceof HTMLInputElement;
}
