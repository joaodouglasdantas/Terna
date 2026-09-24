import { defineConfig } from 'vite';

// Em desenvolvimento o Vite repassa /api (HTTP e WebSocket) para o servidor do jogo, então
// o cliente usa sempre caminhos relativos. `base: './'` deixa o build funcionar aberto de
// qualquer pasta, inclusive dentro do app de PC.
const SERVIDOR = process.env.TERNA_SERVIDOR ?? 'http://localhost:3001';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': { target: SERVIDOR, ws: true, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0, // as folhas de sprite ficam como arquivo (o jogo lê os pixels delas)
  },
});
