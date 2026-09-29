// O botão "Nos ajude com sua opinião": abre o formulário de opinião sobre o jogo (Google Forms)
// numa aba nova, sem tirar a pessoa do jogo. Fica no canto de baixo da tela inicial, no menu da
// partida e na tela de fim (logo depois de jogar é quando a opinião está fresca).

import { elemento } from './dom';

export const FORMULARIO_DE_OPINIAO =
  'https://docs.google.com/forms/d/e/1FAIpQLSfmYq7RrPEQatX1N3XRn5JdRzSYiC2mOf5CvGZ0xY68r6f4CA/viewform';

export const TEXTO_DA_OPINIAO = 'Nos ajude com sua opinião';

// Um balão de fala em pixels ('#' aceso), no mesmo jeito dos ícones dos atalhos.
const ICONE_BALAO = ['.#######.', '#########', '##.#.#.##', '#########', '.#######.', '..##.....', '..#......'];

function iconeDoBalao(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${ICONE_BALAO[0].length} ${ICONE_BALAO.length}`);
  svg.setAttribute('class', 'inicio-atalho-icone');
  svg.setAttribute('aria-hidden', 'true');
  ICONE_BALAO.forEach((linha, y) => {
    for (const trecho of linha.matchAll(/#+/g)) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', String(trecho.index));
      r.setAttribute('y', String(y));
      r.setAttribute('width', String(trecho[0].length));
      r.setAttribute('height', '1');
      svg.append(r);
    }
  });
  return svg;
}

// Um link com cara de botão (as classes de botão do jogo): é um link de verdade, então o
// navegador abre a aba nova sem bloquear e o botão do meio do mouse também funciona.
export function botaoDaOpiniao(classe = 'inicio-botao inicio-botao-claro'): HTMLAnchorElement {
  const a = elemento('a', `${classe} inicio-opiniao`);
  a.href = FORMULARIO_DE_OPINIAO;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-label', `${TEXTO_DA_OPINIAO} (abre o formulário numa aba nova)`);
  a.append(iconeDoBalao(), elemento('span', '', TEXTO_DA_OPINIAO));
  return a;
}
