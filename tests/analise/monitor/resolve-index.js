// resolve-index.js <arquivo> — resolve conflitos de merge onde os DOIS lados só ADICIONAM linhas
// (tabelas de INDEX/IDEIAS): mantém os dois lados, ordenando linhas de tabela por número de PRD/IDEIA.
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
const CRLF = /\r\n/.test(s);
const re = /^<<<<<<< [^\r\n]*\r?\n([\s\S]*?)^=======\r?\n([\s\S]*?)^>>>>>>> [^\r\n]*\r?\n/gm;
let n = 0;
s = s.replace(re, (_, ours, theirs) => {
  n++;
  const linhas = (ours + theirs).split(/\r?\n/).filter((l) => l.length);
  const num = (l) => { const m = l.match(/\|\s*(?:PRD|IDEIA|DT|LOTE)-0*(\d+)(-([a-z]))?/); return m ? Number(m[1]) * 100 + (m[3] ? m[3].charCodeAt(0) - 96 : 0) : Number.MAX_SAFE_INTEGER; };
  const uniq = [...new Set(linhas)];
  const tab = uniq.every((l) => l.startsWith('|'));
  if (tab) uniq.sort((a, b) => num(a) - num(b));
  const nl = CRLF ? '\r\n' : '\n';
  return uniq.join(nl) + nl;
});
fs.writeFileSync(f, s);
console.log(`${f}: ${n} conflito(s) resolvido(s) (união dos dois lados)`);
if (/^(<<<<<<<|=======|>>>>>>>)/m.test(s)) { console.error('AINDA HÁ MARCADORES DE CONFLITO'); process.exit(1); }
