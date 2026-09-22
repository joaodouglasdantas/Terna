// .claude/scripts/db.ts
// Abre o rag.db (SQLite), carrega a extensao sqlite-vec e garante o schema.
// Convencao critica (sqlite-vec): rowid do vec0 precisa ser BigInt; o embedding
// e gravado como BLOB de Float32 little-endian. distance_metric=cosine + vetores
// normalizados (ver embedder.ts) => ranking por similaridade de cosseno.

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH, EMBED_DIM } from './paths';

export type DB = Database.Database;

export function openDb(): DB {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  sqliteVec.load(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      path        TEXT,
      source      TEXT,    -- 'knowledge' | 'memory' | 'dt'
      chunk_index INTEGER,
      content     TEXT,
      category    TEXT,    -- 'bug' | 'arquitetura' | 'padrao' | 'falha' | 'memoria' | 'dt'
      agent       TEXT,    -- subagent de origem | 'session' | 'manual'
      created_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_path     ON knowledge(path);
    CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category);
  `);

  // rowid da tabela vetorial == knowledge.id (join 1:1).
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS vec_knowledge USING vec0(embedding float[${EMBED_DIM}] distance_metric=cosine)`
  );

  return db;
}

/** Converte vetor JS em BLOB Float32 que o sqlite-vec entende. */
export function toVecBlob(vec: number[] | Float32Array): Buffer {
  return Buffer.from(Float32Array.from(vec).buffer);
}

/** Remove todos os chunks (meta + vetor) de um arquivo — re-index idempotente. */
export function deleteByPath(db: DB, filePath: string): void {
  const rows = db.prepare('SELECT id FROM knowledge WHERE path = ?').all(filePath) as { id: number }[];
  if (!rows.length) return;
  const delVec = db.prepare('DELETE FROM vec_knowledge WHERE rowid = ?');
  for (const r of rows) delVec.run(BigInt(r.id));
  db.prepare('DELETE FROM knowledge WHERE path = ?').run(filePath);
}
