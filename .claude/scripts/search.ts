// .claude/scripts/search.ts
// CLI: busca semantica. Embeda a pergunta, faz KNN no sqlite-vec, re-rankeia com
// boost por categoria inferida do prompt + leve preferencia ao conhecimento curado
// (source=memory), e imprime os TOPK trechos. Saida textual e consumida pelo hook
// de injecao (rag-inject.sh). Use --json para depuracao.
//   tsx search.ts "<pergunta>" [--json]

import { openDb, toVecBlob } from './db';
import { embed } from './embedder';
import { TOPK, PROJECT_ROOT } from './paths';

interface MetaRow {
  id: number;
  path: string;
  source: string;
  content: string;
  category: string;
  agent: string;
}

function inferBoostCategories(q: string): Set<string> {
  const s = q.toLowerCase();
  const cats = new Set<string>();
  if (/bug|erro|falha|quebr|n[aã]o funciona|travou|exception|stack|regress|vazament/.test(s)) {
    cats.add('bug');
    cats.add('falha');
    cats.add('dt');
  }
  if (/padr|conven|pattern|como (fa|deve|implement)|boa pr[aá]tica|boas pr[aá]ticas/.test(s)) {
    cats.add('padrao');
    cats.add('memoria');
  }
  if (/arquitet|decis|por que|porqu|trade|escolh|design/.test(s)) {
    cats.add('arquitetura');
  }
  return cats;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const asHook = argv.includes('--hook'); // emite JSON hookSpecificOutput para UserPromptSubmit
  const query = argv.filter((a) => a !== '--json' && a !== '--hook').join(' ').trim();
  if (!query) {
    if (!asHook) console.error('uso: tsx search.ts "<pergunta>" [--json|--hook]');
    process.exit(asHook ? 0 : 1);
  }

  const db = openDb();
  const count = (db.prepare('SELECT count(*) c FROM knowledge').get() as { c: number }).c;
  if (!count) {
    db.close();
    if (asJson) console.log('[]');
    return; // indice vazio: nada a injetar
  }

  const qvec = await embed(query);
  const k = Math.max(TOPK * 4, 12); // candidatos extras para o re-rank

  // KNN puro na tabela vetorial (forma validada), depois busca metadados por id.
  const knn = db
    .prepare('SELECT rowid, distance FROM vec_knowledge WHERE embedding MATCH ? ORDER BY distance LIMIT ?')
    .all(toVecBlob(qvec), k) as Array<{ rowid: number; distance: number }>;
  const getMeta = db.prepare('SELECT id, path, source, content, category, agent FROM knowledge WHERE id = ?');

  const boost = inferBoostCategories(query);
  const scored = knn
    .map((h) => {
      const m = getMeta.get(h.rowid) as MetaRow | undefined;
      if (!m) return null;
      let score = h.distance; // menor = mais similar
      if (boost.has(m.category)) score -= 0.05; // afinidade de categoria
      if (m.source === 'memory') score -= 0.02; // leve preferencia ao curado
      return { ...m, distance: h.distance, score };
    })
    .filter((x): x is MetaRow & { distance: number; score: number } => x !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, TOPK);

  db.close();

  if (asJson) {
    console.log(JSON.stringify(scored, null, 2));
    return;
  }

  const rel = (p: string) => (p.startsWith(PROJECT_ROOT) ? p.slice(PROJECT_ROOT.length + 1) : p);

  if (asHook) {
    if (!scored.length) return; // nada relevante => nao injeta contexto
    const lines = ['Conhecimento relevante do projeto (RAG — capturado de sessoes anteriores, DTs e memoria):', ''];
    for (const r of scored) {
      lines.push(`### [${r.category}] ${rel(r.path)}`);
      lines.push(r.content.trim());
      lines.push('');
    }
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: lines.join('\n') },
      })
    );
    return;
  }

  for (const r of scored) {
    console.log(`### [${r.category}] ${rel(r.path)}`);
    console.log(r.content.trim());
    console.log('');
  }
}

main().catch((e) => {
  console.error('[search] erro:', e?.message || e);
  process.exit(1);
});
