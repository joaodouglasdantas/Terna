// .claude/scripts/chunk.ts
// Quebra markdown em chunks de ~200 tokens (teto do MiniLM e 256), mantendo o
// heading mais proximo de cada chunk (usado para inferir a categoria no indexer).
// Remove frontmatter YAML do topo. Pacote por tamanho com respeito a fronteiras de heading.

export interface Chunk {
  text: string;
  heading: string;
}

const MAX_CHARS = 800; // ~200 tokens (heuristica chars/4)
const MIN_CHARS = 60; // fragmentos menores sao anexados ao chunk anterior, nao viram chunk solto

export function chunkMarkdown(md: string): Chunk[] {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n');

  // Pula frontmatter YAML (--- ... ---) no topo.
  let start = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) start = end + 1;
  }

  const chunks: Chunk[] = [];
  let heading = '';
  let buf: string[] = [];
  let curLen = 0;

  const flush = () => {
    const text = buf.join('\n').trim();
    buf = [];
    curLen = 0;
    if (!text) return;
    if (text.length >= MIN_CHARS) {
      chunks.push({ text, heading });
    } else if (chunks.length && chunks[chunks.length - 1].heading === heading) {
      chunks[chunks.length - 1].text += '\n' + text;
    } else {
      // fragmento curto sem chunk-irmao: ainda assim indexa (pode ser uma nota util)
      chunks.push({ text, heading });
    }
  };

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      heading = h[2].trim();
      continue;
    }
    if (curLen + line.length + 1 > MAX_CHARS && curLen > 0) {
      flush();
    }
    buf.push(line);
    curLen += line.length + 1;
    if (curLen > MAX_CHARS) flush(); // linha unica gigante
  }
  flush();

  return chunks;
}
