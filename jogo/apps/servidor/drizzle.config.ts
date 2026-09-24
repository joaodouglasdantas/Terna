import { defineConfig } from 'drizzle-kit';

// `npm run db:gerar` compara o schema com as migrações já geradas e cria a próxima em
// drizzle/. As migrações são versionadas e aplicadas sozinhas quando o servidor sobe.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/banco/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
});
