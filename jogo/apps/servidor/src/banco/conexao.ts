import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migrarPg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migrarPglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import * as schema from './schema';

// O resto do servidor só enxerga `Banco`: não importa se por baixo é PGlite ou Postgres.
export type Banco = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface ConexaoBanco {
  banco: Banco;
  tipo: 'pglite' | 'postgres';
  migrar(): Promise<void>;
  fechar(): Promise<void>;
}

export interface OpcoesBanco {
  url: string | null; // Postgres; null = PGlite
  pasta: string; // pasta do PGlite, ou 'memoria'
  pastaMigracoes: string;
}

export async function abrirBanco({ url, pasta, pastaMigracoes }: OpcoesBanco): Promise<ConexaoBanco> {
  const pastaDrizzle = { migrationsFolder: pastaMigracoes };
  if (url) {
    // Poucas conexões e fechadas logo que ficam paradas: o Neon só dorme (e só para de
    // gastar horas do plano) quando não há conexão aberta. O tempo de conexão é longo
    // porque o Neon leva alguns segundos para acordar.
    const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 30_000 });
    const banco = drizzlePg(pool, { schema, casing: 'snake_case' });
    return {
      banco,
      tipo: 'postgres',
      migrar: () => migrarPg(banco, pastaDrizzle),
      fechar: () => pool.end(),
    };
  }
  if (pasta !== 'memoria') mkdirSync(pasta, { recursive: true });
  const cliente = new PGlite(pasta === 'memoria' ? undefined : pasta);
  await cliente.waitReady;
  const banco = drizzlePglite(cliente, { schema, casing: 'snake_case' });
  return {
    banco,
    tipo: 'pglite',
    migrar: () => migrarPglite(banco, pastaDrizzle),
    fechar: () => cliente.close(),
  };
}
