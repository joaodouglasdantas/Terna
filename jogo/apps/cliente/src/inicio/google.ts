// O botão "Continuar com o Google" da tela da conta. É o botão oficial do Google (Google Identity
// Services): o script vem do Google na primeira vez que a tela precisa dele e o botão é desenhado
// por ele, num quadro dentro do lugar que a tela reserva. Clicou e escolheu a conta, o Google
// devolve a credencial (um token assinado) e quem pediu a manda para o servidor
// (POST /sessoes/google), que confere e abre a sessão.
//
// O Client ID é o do Terna (GOOGLE_CLIENT_ID, em @terna/compartilhado); VITE_GOOGLE_CLIENT_ID troca
// por outro. Vazio, o botão não aparece e a tela fica só com o e-mail e a senha.

import { GOOGLE_CLIENT_ID } from '@terna/compartilhado';

const ID_DO_CLIENTE = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? GOOGLE_CLIENT_ID).trim();
const SCRIPT = 'https://accounts.google.com/gsi/client';

interface RespostaDoGoogle {
  credential?: string;
}

interface Gis {
  accounts: {
    id: {
      initialize(opcoes: {
        client_id: string;
        callback: (r: RespostaDoGoogle) => void;
        ux_mode?: 'popup' | 'redirect';
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        itp_support?: boolean;
      }): void;
      renderButton(
        lugar: HTMLElement,
        opcoes: { type?: 'standard'; theme?: string; size?: string; text?: string; shape?: string; logo_alignment?: string; width?: number; locale?: string },
      ): void;
    };
  };
}

declare global {
  interface Window {
    google?: Gis;
  }
}

export const googleLigado = (): boolean => ID_DO_CLIENTE !== '';

let carregando: Promise<Gis> | null = null;

function carregarGoogle(): Promise<Gis> {
  carregando ??= new Promise<Gis>((resolver, recusar) => {
    if (window.google?.accounts?.id) return resolver(window.google);
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.google?.accounts?.id ? resolver(window.google) : recusar(new Error('o Google não carregou')));
    script.onerror = () => recusar(new Error('o Google não carregou'));
    document.head.append(script);
  }).catch((erro: unknown) => {
    carregando = null; // da próxima vez tenta de novo
    throw erro;
  });
  return carregando;
}

// Quem recebe a credencial agora: a vista que mostrou o botão por último (o initialize do Google é
// um só para a página toda).
let aoEntrar: ((credencial: string) => void) | null = null;
let iniciado = false;

// O lugar do botão: aparece vazio na hora e o Google desenha o botão dentro quando o script chega.
// `aoFalhar`: o script não carregou (sem internet, bloqueador) — a tela avisa e segue com o e-mail.
export function botaoDoGoogle(entrou: (credencial: string) => void, aoFalhar: () => void): HTMLElement {
  const lugar = document.createElement('div');
  lugar.className = 'inicio-google';
  aoEntrar = entrou;
  carregarGoogle().then(
    (google) => {
      if (!lugar.isConnected) return;
      if (!iniciado) {
        google.accounts.id.initialize({
          client_id: ID_DO_CLIENTE,
          callback: (r) => {
            if (r.credential) aoEntrar?.(r.credential);
          },
          ux_mode: 'popup',
          auto_select: false,
          itp_support: true,
        });
        iniciado = true;
      }
      // A largura do lugar, menos o respiro dos lados (o Google aceita de 200 a 400 px).
      const estilo = getComputedStyle(lugar);
      const dentro = lugar.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
      const largura = Math.round(Math.max(200, Math.min(400, dentro || 320)));
      google.accounts.id.renderButton(lugar, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'center',
        width: largura,
        locale: 'pt-BR',
      });
    },
    () => {
      if (lugar.isConnected) aoFalhar();
    },
  );
  return lugar;
}
