// O Terna é jogado no computador (teclado para andar, mouse para mirar): no celular e no tablet o
// jogo nem carrega — aparece só um aviso para abrir num notebook ou computador.
//
// Conta como celular/tablet: o navegador que se diz móvel (userAgentData), um nome de aparelho
// móvel no userAgent (Android, iPhone, iPad…), o iPad que se apresenta como Mac (o Mac não tem
// tela de toque) e, por fim, qualquer aparelho sem nenhum mouse ou touchpad — só o dedo. Um
// notebook com tela de toque tem touchpad, então passa.

import { logoSimples } from './inicio';
import { elemento, palco } from './dom';

const NOME_DE_MOVEL = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|KF[A-Z]{2,4}Wi|PlayBook|BlackBerry|BB10|IEMobile|Opera Mini|webOS/i;

export function aparelhoMovel(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData?.mobile) return true;
  const ua = navigator.userAgent;
  if (NOME_DE_MOVEL.test(ua)) return true;
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  const temMouse = matchMedia('(any-pointer: fine)').matches;
  const temToque = matchMedia('(any-pointer: coarse)').matches;
  return !temMouse && temToque;
}

// O aviso, no lugar do carregamento. Fica para sempre: não há o que fazer neste aparelho.
export function telaSoNoComputador(): void {
  const tela = elemento('section', 'inicio-tela inicio-carregando inicio-bloqueio');
  const caixa = elemento('div', 'inicio-caixa');
  caixa.append(
    elemento('h1', 'inicio-titulo', 'Jogue no computador'),
    elemento('p', 'inicio-sub', 'O Terna é feito para notebook ou computador, com teclado e mouse.'),
    elemento('p', 'inicio-sub', 'Abra este mesmo endereço no computador para jogar.'),
  );
  tela.append(logoSimples(), caixa);
  palco().replaceChildren(tela);
}
