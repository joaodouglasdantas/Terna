// .claude/scripts/embed.ts
// CLI: indexa 1+ arquivos .md no rag.db.
//   tsx embed.ts <arquivo.md> [<arquivo2.md> ...] [knowledge|memory|dt]
// Default source = knowledge (uso tipico: arquivo recem-gerado por summarize.php).

import { existsSync } from 'node:fs';
import { openDb } from './db';
import { indexFile, Source } from './indexer';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('uso: tsx embed.ts <arquivo.md> [...] [knowledge|memory|dt]');
    process.exit(1);
  }

  let source: Source = 'knowledge';
  let files = args;
  const last = args[args.length - 1];
  if (last === 'knowledge' || last === 'memory' || last === 'dt') {
    source = last;
    files = args.slice(0, -1);
  }

  const db = openDb();
  let total = 0;
  for (const f of files) {
    if (!existsSync(f)) {
      console.error('pulado (nao existe):', f);
      continue;
    }
    const n = await indexFile(db, f, source);
    console.log(`indexado: ${f} (${n} chunks, source=${source})`);
    total += n;
  }
  db.close();
  console.log(`total: ${total} chunks`);
}

main().catch((e) => {
  console.error('[embed] erro:', e?.message || e);
  process.exit(1);
});
