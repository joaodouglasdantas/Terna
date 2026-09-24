/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Endereço do servidor quando o cliente não é servido por ele (ex.: app de PC).
  readonly VITE_API_URL?: string;
}
