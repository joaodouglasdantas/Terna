import { defineConfig } from 'tsup';

// Gera dist/index.js para produção. O pacote compartilhado é TypeScript puro, então entra
// dentro do bundle; as outras dependências são lidas de node_modules.
export default defineConfig({
  entry: ['src/index.ts', 'src/banco/migrar.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@terna/compartilhado'],
});
