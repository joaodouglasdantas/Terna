// Endereço da API. Em desenvolvimento o Vite repassa /api para o servidor; no site
// publicado, VITE_API_URL (em apps/cliente/.env.production) aponta para o servidor.
export const BASE_API = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') + '/api';

// O servidor grátis dorme depois de 15 min parado e leva ~1 min para acordar. Chamar isto
// quando o jogo abre faz ele ir acordando enquanto o jogador ainda está olhando a tela.
// /vivo não toca no banco (não gasta as horas do Neon). Erros são ignorados: sem servidor,
// o jogo segue normal.
export function acordarServidor(): void {
  fetch(BASE_API + '/vivo').catch(() => undefined);
}
