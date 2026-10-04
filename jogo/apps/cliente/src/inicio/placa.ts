// A placa de madeira da tela inicial, com a logo entalhada no painel: o quadro fica no alto (os
// botões vêm embaixo dele, entre as pernas) e as duas pernas descem até o chão do cenário. A
// altura até o chão muda com a tela, então as pernas são um trecho de madeira que se repete para
// baixo, medido a cada mudança de tamanho. No pé, a grama da própria arte do cenário
// (tela-inicial-grama.webp, recortada no mesmo lugar dela) passa na frente da madeira, para a
// placa sair do chão como uma coisa só com ele. A arte do fundo fica parada (cena.ts), senão a
// placa parecia se soltar do chão. As imagens saem de ferramentas/montar-placa.py e
// ferramentas/grama-do-chao.py.

import gramaUrl from '../assets/tela-inicial-grama.webp';
import tufoUrl from '../assets/tela-inicial-tufo.webp';
import pernaDirUrl from '../assets/placa-perna-dir.webp';
import pernaEsqUrl from '../assets/placa-perna-esq.webp';
import quadroUrl from '../assets/placa-quadro.webp';
import { carregarDecodificada } from '../motor/imagens';
import { elemento } from './dom';

// Medidas das imagens (px): o quadro, onde ficam as pernas nele e o trecho da perna.
const QUADRO = { largura: 1170, altura: 563 };
const PERNAS = [
  { x: 86, url: pernaEsqUrl },
  { x: 982, url: pernaDirUrl },
];
const PERNA = { largura: 110, altura: 120 };
// Onde o pé da perna termina, em fração da altura da tela (no alto da terra do chão, por baixo
// da grama).
const PE = 0.9;
// A faixa da grama recortada da arte, nas linhas exatas dela (a arte tem 1672 × 940 e cobre a
// tela inteira: as duas são 16:9), para cada pixel da grama cair em cima do mesmo pixel da arte.
const ARTE = { largura: 1672, altura: 940 };
const GRAMA = { topo: 810 / ARTE.altura, base: 879 / ARTE.altura };
// O tufo do pé (folhas altas da mesma grama, em moita): 100 × 33 pixels da arte, com a base no
// tapete de grama (a linha 843 da arte).
const TUFO = { largura: 100, altura: 33, base: 843 / ARTE.altura };

export const carregarPlaca = (): Promise<unknown> =>
  Promise.all([quadroUrl, pernaEsqUrl, pernaDirUrl, gramaUrl, tufoUrl].map((u) => carregarDecodificada(u)));

// A placa: `el` vai no alto da tela inicial (`tela`, para medir o chão).
export function criarPlaca(tela: HTMLElement): { el: HTMLElement } {
  const el = elemento('div', 'inicio-placa');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Terna');
  const quadro = elemento('img', 'inicio-placa-quadro');
  quadro.src = quadroUrl;
  quadro.alt = '';
  quadro.draggable = false;
  const pes: HTMLElement[] = [];
  const tufos: HTMLElement[] = [];
  const pernas = PERNAS.map((p, i) => {
    const perna = elemento('div', 'inicio-placa-perna');
    perna.style.backgroundImage = `url("${p.url}")`;
    perna.style.left = `${(p.x / QUADRO.largura) * 100}%`;
    perna.style.width = `${(PERNA.largura / QUADRO.largura) * 100}%`;
    const grama = elemento('div', 'inicio-placa-grama');
    grama.style.backgroundImage = `url("${gramaUrl}")`;
    pes.push(grama);
    // Na frente, uma moita de folhas altas nascendo em volta da perna (espelhada na da direita).
    const tufo = elemento('div', `inicio-placa-tufo${i === 1 ? ' inicio-placa-tufo-espelhado' : ''}`);
    tufo.style.backgroundImage = `url("${tufoUrl}")`;
    tufos.push(tufo);
    perna.append(grama, tufo);
    return perna;
  });
  // As pernas vão por trás do quadro (saem de baixo da viga).
  el.append(...pernas, quadro);

  // Mede em px do quadro do jogo (sem a escala dele na janela): a altura das pernas, do pé do
  // quadro até o chão, e a faixa de grama de cada pé, posta exatamente onde ela está na arte.
  const medir = (): void => {
    if (!el.isConnected) return;
    const caixa = tela.getBoundingClientRect();
    const escala = caixa.height / Math.max(1, tela.clientHeight);
    const larguraTela = tela.clientWidth;
    const alturaTela = tela.clientHeight;
    const pe = (el.getBoundingClientRect().bottom - caixa.top) / escala;
    const altura = Math.max(0, alturaTela * PE - pe);
    const larguraDaPerna = (el.clientWidth * PERNA.largura) / QUADRO.largura;
    for (const perna of pernas) {
      perna.style.height = `${altura}px`;
      perna.style.backgroundSize = `${larguraDaPerna}px ${(larguraDaPerna * PERNA.altura) / PERNA.largura}px`;
    }
    const faixa = (GRAMA.base - GRAMA.topo) * alturaTela;
    for (const grama of pes) {
      // Embaixo da perna: do alto da faixa (acima do pé) até a base dela (abaixo do pé).
      grama.style.height = `${faixa}px`;
      grama.style.bottom = `${(PE - GRAMA.base) * alturaTela}px`;
      grama.style.backgroundSize = `${larguraTela}px ${faixa}px`;
      const x = (grama.getBoundingClientRect().left - caixa.left) / escala;
      grama.style.backgroundPosition = `${-x}px 0`;
    }
    // O tufo no pixel da arte: do tamanho que ele tem nela, no meio da perna, com a base no tapete.
    const w = (TUFO.largura * larguraTela) / ARTE.largura;
    const h = (TUFO.altura * alturaTela) / ARTE.altura;
    for (const tufo of tufos) {
      tufo.style.width = `${w}px`;
      tufo.style.height = `${h}px`;
      tufo.style.left = `${(larguraDaPerna - w) / 2}px`;
      tufo.style.bottom = `${(PE - TUFO.base) * alturaTela}px`;
    }
  };
  new ResizeObserver(medir).observe(tela);
  new ResizeObserver(medir).observe(el);
  requestAnimationFrame(medir);
  return { el };
}
