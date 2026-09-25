import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Prepara uma vez o banco já migrado que cada arquivo de teste copia (ver test/banco-modelo.ts).
    globalSetup: ['./test/banco-modelo.ts'],
    // Mesmo copiado, abrir o PGlite compila o WASM do Postgres (~3 s nesta máquina): folga para
    // máquinas mais lentas e para os arquivos de teste que rodam em paralelo.
    hookTimeout: 30_000,
  },
});
