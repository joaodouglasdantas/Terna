// .claude/scripts/indexer.ts
// Logica compartilhada de indexacao: dado 1 arquivo .md, quebra em chunks, infere
// categoria, gera embedding local e insere em knowledge + vec_knowledge.
// Idempotente por arquivo (deleteByPath antes de inserir).

import { readFileSync } from 'node:fs';
import { DB, toVecBlob, deleteByPath } from './db';
import { embed } from './embedder';
import { chunkMarkdown } from './chunk';

export type Source = 'knowledge' | 'memory' | 'dt';

/** Categoria do chunk: DT e memoria sao fixas; knowledge mapeia pelo heading. */
export function categoryFor(source: Source, heading: string): string {
  if (source === 'dt') return 'dt';
  if (source === 'memory') return 'memoria';
  const h = (heading || '').toLowerCase();
  if (/bug|erro|causa raiz|incid/.test(h)) return 'bug';
  if (/arquitet|decis|por que|porqu|trade-?off|escolh/.test(h)) return 'arquitetura';
  if (/padr|conven|pattern/.test(h)) return 'padrao';
  if (/n[ao]o funcion|n[aã]o funcion|falh|abandon|descart|evitar|armadilh|pegadinh/.test(h)) return 'falha';
  return 'padrao';
}

export async function indexFile(db: DB, filePath: string, source: Source, agent = 'manual'): Promise<number> {
  const md = readFileSync(filePath, 'utf8');
  const chunks = chunkMarkdown(md);
  deleteByPath(db, filePath); // re-index substitui versao anterior do mesmo arquivo
  if (!chunks.length) return 0;

  const createdAt = new Date().toISOString().slice(0, 10); // auditoria interna do indice (nao e data de negocio)
  const insMeta = db.prepare(
    'INSERT INTO knowledge(path, source, chunk_index, content, category, agent, created_at) VALUES (?,?,?,?,?,?,?)'
  );
  const insVec = db.prepare('INSERT INTO vec_knowledge(rowid, embedding) VALUES (?, ?)');

  let n = 0;
  for (let i = 0; i < chunks.length; i++) {
    const cat = categoryFor(source, chunks[i].heading);
    const vec = await embed(chunks[i].text);
    const info = insMeta.run(filePath, source, i, chunks[i].text, cat, agent, createdAt);
    insVec.run(BigInt(info.lastInsertRowid as any), toVecBlob(vec));
    n++;
  }
  return n;
}
