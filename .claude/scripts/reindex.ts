// .claude/scripts/reindex.ts
// CLI: reconstroi o rag.db do zero a partir das fontes VERSIONADAS.
// E o que torna o RAG portatil: o .db e derivado, nao versionado.
// Apaga o arquivo do banco e regenera (clean rebuild — sem residuo de schema antigo).
//
// Fontes (genericas/portateis):
//   - .claude/knowledge/   (auto-capturado)            -> source=knowledge
//   - .claude/memory/      (memoria curada)            -> source=memory
//   - prds/debito_tecnico/ (DTs)  SE EXISTIR           -> source=dt   (skip gracioso)
//   - extras via env HARNESS_RAG_SOURCES (CSV de "path[:source]"; path relativo a raiz
//     ou absoluto; source ∈ knowledge|memory|dt, default knowledge). Ex.:
//       HARNESS_RAG_SOURCES='docs,notas:knowledge,/abs/dir:dt'
// Dirs inexistentes sao ignorados. Indices puros (MEMORY.md/INDEX.md) sao pulados.

import { existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, basename, isAbsolute, resolve } from 'node:path';
import { openDb } from './db';
import { indexFile, Source } from './indexer';
import { DB_PATH, PROJECT_ROOT, KNOWLEDGE_DIR, MEMORY_DIR, DT_DIR } from './paths';

function mdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .map((f) => join(dir, f))
    .filter((p) => statSync(p).isFile());
}

function extraSources(): Array<[string, Source]> {
  const raw = process.env.HARNESS_RAG_SOURCES || '';
  const out: Array<[string, Source]> = [];
  for (const entry of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [p, src] = entry.split(':');
    const dir = isAbsolute(p) ? p : join(PROJECT_ROOT, p);
    const source: Source = src === 'memory' || src === 'dt' || src === 'knowledge' ? src : 'knowledge';
    out.push([dir, source]);
  }
  return out;
}

async function main(): Promise<void> {
  // clean rebuild: remove db + sidecars do WAL
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    if (existsSync(f)) rmSync(f);
  }

  const db = openDb();

  const groups: Array<[string, Source]> = [
    [KNOWLEDGE_DIR, 'knowledge'],
    [MEMORY_DIR, 'memory'],
    [DT_DIR, 'dt'], // ignorado se nao existir (mdFiles retorna [])
    ...extraSources(),
  ];

  const seenDirs = new Set<string>();
  let total = 0;
  let fileCount = 0;
  const indexedDirs: string[] = [];

  for (const [dir, source] of groups) {
    const key = resolve(dir);
    if (seenDirs.has(key)) continue; // evita reindexar a mesma pasta 2x
    seenDirs.add(key);

    const files = mdFiles(dir);
    if (!files.length) continue;
    indexedDirs.push(`${dir.replace(PROJECT_ROOT + '/', '')} [${source}]`);

    for (const f of files) {
      const base = basename(f).toUpperCase();
      if (base === 'MEMORY.MD' || base === 'INDEX.MD') continue; // indices puros de navegacao
      const n = await indexFile(db, f, source);
      if (n) {
        total += n;
        fileCount++;
      }
    }
  }

  const counts = db.prepare('SELECT category, count(*) c FROM knowledge GROUP BY category ORDER BY c DESC').all();
  db.close();

  console.log(`reindex ok: ${fileCount} arquivos, ${total} chunks`);
  console.log('fontes:', indexedDirs.length ? indexedDirs.join(' | ') : '(nenhuma encontrada)');
  console.log('por categoria:', JSON.stringify(counts));
}

main().catch((e) => {
  console.error('[reindex] erro:', e?.message || e);
  process.exit(1);
});
