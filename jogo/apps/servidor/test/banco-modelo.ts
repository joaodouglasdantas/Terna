// Setup global do vitest: cria UM banco PGlite, aplica as migrações e guarda uma cópia dele num
// arquivo temporário. Cada arquivo de teste abre o seu banco a partir dessa cópia (novoServidor,
// em ajuda.ts). Criar um PGlite do zero roda o initdb do Postgres em WASM e leva de 6 a 12 s por
// banco — passava do tempo-limite do beforeAll; a partir da cópia leva ~1 s.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { TestProject } from 'vitest/node';
import { conexaoPglite } from '../src/banco/conexao';

declare module 'vitest' {
  export interface ProvidedContext {
    // Caminho do .tar com o banco já migrado.
    bancoModelo: string;
  }
}

export const PASTA_MIGRACOES = join(import.meta.dirname, '..', 'drizzle');

export default async function montar(projeto: TestProject): Promise<() => void> {
  const cliente = new PGlite();
  const conexao = await conexaoPglite(cliente, PASTA_MIGRACOES);
  await conexao.migrar();
  const copia = await cliente.dumpDataDir('none');
  await conexao.fechar();

  const pasta = mkdtempSync(join(tmpdir(), 'terna-teste-'));
  const arquivo = join(pasta, 'banco-modelo.tar');
  writeFileSync(arquivo, Buffer.from(await copia.arrayBuffer()));
  projeto.provide('bancoModelo', arquivo);
  return () => rmSync(pasta, { recursive: true, force: true });
}
