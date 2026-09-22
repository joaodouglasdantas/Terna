#!/usr/bin/env node
// .claude/hooks/duelo-aplicar.mjs — converte a resposta do worker do duelo (blocos
// BUSCAR/SUBSTITUIR + ARQUIVO-NOVO) em ARQUIVOS APLICADOS numa arvore temporaria.
//
// Motivo (25/08, PRD-128): "unified diff" e o formato mais hostil a LLM barato —
// offsets absolutos + contexto exato = 10/11 diffs inaplicaveis no dia. Busca literal
// tolera posicao; o diff REAL (offsets perfeitos) e gerado depois pelo harness-duelo.sh
// com `diff -u` entre a arvore original e a aplicada — o resto da cadeia (git apply,
// juiz, hefesto) continua vendo um unified diff normal.
//
// uso: node duelo-aplicar.mjs <worker.md> <ROOT> <TREE>
//   - escreve cada arquivo alterado/novo em TREE/<caminho relativo>
//   - escreve TREE/.tocados com linhas "caminho<TAB>M|N" (Modificado | Novo)
//   - exit 0 = tudo aplicado; exit 3 = nenhum bloco no formato; exit 4 = bloco falhou
//     (BUSCAR nao encontrado, ambiguo ou caminho invalido) — detalhe no stderr.
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';

const [md, ROOT, TREE] = process.argv.slice(2);
if (!md || !ROOT || !TREE) { console.error('uso: duelo-aplicar.mjs <worker.md> <ROOT> <TREE>'); process.exit(2); }

const linhas = readFileSync(md, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
const dentro = p => { const a = resolve(ROOT, p); return a.startsWith(resolve(ROOT) + sep) ? a : null; };
const FENCE = /^```/;

// estado do parser
let arq = null, novo = null, buf = [], modo = 'idle';
const edits = new Map();   // rel -> [{buscar, subst}]
const novos = new Map();   // rel -> conteudo
let blocos = 0;

const commitReplace = (subst) => {
  if (!arq) { console.error('bloco BUSCAR/SUBSTITUIR fora de "### ARQUIVO:"'); process.exit(4); }
  if (!edits.has(arq)) edits.set(arq, []);
  edits.get(arq).push({ buscar: buf.join('\n'), subst: subst.join('\n') });
  blocos++;
};

let substBuf = null;
for (const l of linhas) {
  if (modo === 'idle' || modo === 'file') {
    if (l.startsWith('### ARQUIVO-NOVO:')) { novo = l.slice('### ARQUIVO-NOVO:'.length).trim(); buf = []; modo = 'novo'; continue; }
    if (l.startsWith('### ARQUIVO:')) { arq = l.slice('### ARQUIVO:'.length).trim(); modo = 'file'; continue; }
    if (l === '<<<<<<< BUSCAR') { buf = []; substBuf = null; modo = 'buscar'; continue; }
    continue;                                   // prosa, fences e notas sao ignorados
  }
  if (modo === 'buscar') {
    if (l === '=======') { substBuf = []; modo = 'subst'; continue; }
    buf.push(l); continue;
  }
  if (modo === 'subst') {
    if (l === '>>>>>>> FIM') { commitReplace(substBuf); modo = 'file'; continue; }
    substBuf.push(l); continue;
  }
  if (modo === 'novo') {
    if (l === '### FIM-ARQUIVO') {
      // tira fences de borda que o modelo possa ter posto
      while (buf.length && FENCE.test(buf[0])) buf.shift();
      while (buf.length && FENCE.test(buf[buf.length - 1])) buf.pop();
      novos.set(novo, buf.join('\n')); blocos++; novo = null; modo = 'idle'; continue;
    }
    buf.push(l); continue;
  }
}
if (blocos === 0) process.exit(3);              // nada no formato — quem chama tenta o fallback ```diff

const tocados = [];
for (const [rel, lista] of edits) {
  const abs = dentro(rel);
  if (!abs || !existsSync(abs)) { console.error(`ARQUIVO nao encontrado no repo: ${rel}`); process.exit(4); }
  let s = readFileSync(abs, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  for (const { buscar, subst } of lista) {
    const b = eol === '\r\n' ? buscar.split('\n').join('\r\n') : buscar;
    const t = eol === '\r\n' ? subst.split('\n').join('\r\n') : subst;
    const i = s.indexOf(b);
    if (i < 0) { console.error(`BUSCAR nao encontrado em ${rel}: "${buscar.split('\n')[0].slice(0, 80)}..."`); process.exit(4); }
    if (s.indexOf(b, i + 1) >= 0) { console.error(`BUSCAR ambiguo (2+ ocorrencias) em ${rel}: "${buscar.split('\n')[0].slice(0, 80)}..." — o worker deve incluir mais contexto`); process.exit(4); }
    s = s.slice(0, i) + t + s.slice(i + b.length);
  }
  const destino = resolve(TREE, rel);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, s);
  tocados.push(rel + '\tM');
}
for (const [rel, conteudo] of novos) {
  if (!dentro(rel)) { console.error(`caminho de ARQUIVO-NOVO fora do repo: ${rel}`); process.exit(4); }
  if (existsSync(resolve(ROOT, rel))) { console.error(`ARQUIVO-NOVO ja existe no repo: ${rel} — use blocos BUSCAR/SUBSTITUIR`); process.exit(4); }
  const destino = resolve(TREE, rel);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, conteudo.endsWith('\n') ? conteudo : conteudo + '\n');
  tocados.push(rel + '\tN');
}
mkdirSync(TREE, { recursive: true });
writeFileSync(resolve(TREE, '.tocados'), tocados.join('\n') + '\n');
process.exit(0);
