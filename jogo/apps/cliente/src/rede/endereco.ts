// Endereço da API. Em desenvolvimento o Vite repassa /api para o servidor; no site
// publicado, VITE_API_URL (em apps/cliente/.env.production) aponta para o servidor.
export const BASE_API = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') + '/api';

