/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Endereço do servidor quando o cliente não é servido por ele (ex.: app de PC).
  readonly VITE_API_URL?: string;
  // Endereço (DSN) do projeto no Sentry, que recebe os erros dos jogadores.
  readonly VITE_SENTRY_DSN?: string;
  // Outro Client ID para o "Entrar com o Google" (inicio/google.ts); sem ele, vale o do Terna.
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
