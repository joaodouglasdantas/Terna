// O botão "Continuar com o Google" da tela da conta. É desenhado pelo jogo, no padrão oficial do
// Google para fundo escuro (developers.google.com/identity/branding-guidelines): fundo #131314,
// borda #8E918F, o G colorido direto no fundo, 12 px antes da logo e 10 px depois, texto #E3E3E3.
// (O botão pronto do Google vinha com o G num quadrado branco colado em cima e embaixo, num quadro
// que o jogo não consegue estilizar.) Clicou, abre a janelinha oficial do Google (Google Identity
// Services, o script vem do Google quando a tela precisa); escolhida a conta, o Google devolve um
// acesso e quem pediu o manda para o servidor (POST /sessoes/google), que confere com o Google de
// que app e de quem ele é e abre a sessão.
//
// O Client ID é o do Terna (GOOGLE_CLIENT_ID, em @terna/compartilhado); VITE_GOOGLE_CLIENT_ID troca
// por outro. Vazio, o botão não aparece e a tela fica só com o e-mail e a senha.

import { GOOGLE_CLIENT_ID } from '@terna/compartilhado';

const ID_DO_CLIENTE = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? GOOGLE_CLIENT_ID).trim();

const SCRIPT = 'https://accounts.google.com/gsi/client';
const ESCOPOS = 'openid email profile'; // só quem é: o e-mail e o nome, nada mais da conta

interface RespostaDoGoogle {
  access_token?: string;
  error?: string;
}

interface ClienteDoGoogle {
  requestAccessToken(opcoes?: { prompt?: string }): void;
}

interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(opcoes: {
        client_id: string;
        scope: string;
        callback: (r: RespostaDoGoogle) => void;
        error_callback?: (e: { type?: string }) => void;
      }): ClienteDoGoogle;
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
    if (window.google?.accounts?.oauth2) return resolver(window.google);
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.google?.accounts?.oauth2 ? resolver(window.google) : recusar(new Error('o Google não carregou')));
    script.onerror = () => recusar(new Error('o Google não carregou'));
    document.head.append(script);
  }).catch((erro: unknown) => {
    carregando = null; // da próxima vez tenta de novo
    throw erro;
  });
  return carregando;
}

// O G do Google, nas cores oficiais (não pode ser mudado: branding-guidelines).
const LOGO = `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

// Quem recebe a resposta agora: a vista que mostrou o botão por último (o cliente do Google é um
// só para a página toda).
let aoEntrar: ((acesso: string) => void) | null = null;
let aoErrar: ((mensagem: string | null) => void) | null = null;
let cliente: ClienteDoGoogle | null = null;

// O botão. `entrou`: o acesso que o Google devolveu. `aoErrar`: a janelinha não abriu ou deu erro
// (null: a pessoa só fechou a janelinha). `aoFalhar`: o script do Google não carregou (sem
// internet, bloqueador) — a tela esconde o botão e segue com o e-mail.
export function botaoDoGoogle(
  entrou: (acesso: string) => void,
  erro: (mensagem: string | null) => void,
  aoFalhar: () => void,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'inicio-google';
  b.innerHTML = `<span class="inicio-google-logo">${LOGO}</span><span class="inicio-google-texto">Continuar com o Google</span>`;
  b.disabled = true; // até o script chegar
  aoEntrar = entrou;
  aoErrar = erro;
  carregarGoogle().then(
    (google) => {
      cliente ??= google.accounts.oauth2.initTokenClient({
        client_id: ID_DO_CLIENTE,
        scope: ESCOPOS,
        callback: (r) => {
          if (r.access_token) aoEntrar?.(r.access_token);
          else aoErrar?.(r.error === 'access_denied' ? null : 'O Google não confirmou a conta; tente de novo.');
        },
        error_callback: (e) => {
          if (e.type === 'popup_failed_to_open') aoErrar?.('O navegador bloqueou a janela do Google: permita pop-ups para este site e tente de novo.');
          else aoErrar?.(null); // fechou a janelinha
        },
      });
      b.disabled = false;
    },
    () => {
      if (b.isConnected) aoFalhar();
    },
  );
  // A janelinha precisa abrir no próprio clique (senão o navegador a bloqueia).
  b.addEventListener('click', () => {
    aoEntrar = entrou;
    aoErrar = erro;
    cliente?.requestAccessToken({ prompt: 'select_account' });
  });
  return b;
}
