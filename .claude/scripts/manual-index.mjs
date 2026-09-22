#!/usr/bin/env node
// .claude/scripts/manual-index.mjs (3.4.8, adendo 31/08) — gera docs/manual/index.html:
// um LEITOR completo do manual vivo, nao so um indice. Determinístico (mesmo espirito do
// harness-dashboard.mjs): a skill /manual roda este script no Passo 3 em vez de "escrever
// um index na mao" — zero variacao entre rodadas.
//
// O que a pagina gerada tem (pedido do Charles, 31/08 — 1a rodada real do manual no Mariana):
//   - BUSCA instantanea por palavra-chave/tema: titulo do modulo, headings E conteudo
//     (indice embutido; realca o termo; Enter abre o primeiro resultado);
//   - abas Usuario / Dev, sumario por modulo, leitura na propria pagina (markdown
//     renderizado client-side por um mini-parser embutido — sem CDN, sem dependencia);
//   - prints inline (img/ relativa) + contagem de 📷 por modulo e aviso "sem prints".
//
// Uso:  node .claude/scripts/manual-index.mjs   (na raiz do projeto; le docs/manual/)
// Saida: docs/manual/index.html (sobrescreve) + 1 linha MANUAL-INDEX|<modulos>|<bytes>.

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const BASE = path.join(ROOT, 'docs', 'manual');
if (!fs.existsSync(BASE)) { console.error('docs/manual/ nao existe — rode na raiz do projeto'); process.exit(2); }

function lerFace(face) {
  const dir = path.join(BASE, face);
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort(); } catch {}
  return files.map(f => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const slug = f.replace(/\.md$/, '');
    const titulo = (raw.match(/^#\s+(.+)$/m) || [null, slug])[1].trim();
    const headings = [...raw.matchAll(/^#{2,3}\s+(.+)$/gm)].map(m => m[1].trim());
    const prints = (raw.match(/!\[[^\]]*\]\(/g) || []).length;
    const pendentes = (raw.match(/📷 pendente/g) || []).length;
    return { face, slug, titulo, headings, prints, pendentes, md: raw };
  });
}
const modulos = [...lerFace('usuario'), ...lerFace('dev')];
if (!modulos.length) { console.error('nenhum .md em docs/manual/{usuario,dev}/'); process.exit(2); }

const dados = JSON.stringify(modulos).replace(/<\/script>/gi, '<\\/script>');
const geradoEm = new Date().toISOString().slice(0, 16).replace('T', ' ');

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manual do sistema</title>
<style>
  :root { --azul:#0e2c52; --ciano:#1ba9e2; --fundo:#f5f7fa; --carta:#fff; --texto:#1c2733; --sub:#5b6b7c; --borda:#dde4ec; --marca:#fff3bf; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif; background:var(--fundo); color:var(--texto); }
  header { background:var(--azul); color:#fff; padding:14px 22px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; position:sticky; top:0; z-index:5; }
  header h1 { font-size:17px; margin:0; font-weight:600; }
  #busca { flex:1 1 280px; max-width:520px; padding:9px 14px; border-radius:8px; border:none; font-size:14px; }
  .abas { display:flex; gap:6px; }
  .abas button { background:rgba(255,255,255,.12); color:#fff; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px; }
  .abas button.ativa { background:var(--ciano); font-weight:600; }
  main { display:grid; grid-template-columns:290px 1fr; gap:0; min-height:calc(100vh - 60px); }
  nav { border-right:1px solid var(--borda); background:var(--carta); padding:10px 0; overflow-y:auto; max-height:calc(100vh - 60px); position:sticky; top:60px; }
  nav .mod { padding:9px 18px; cursor:pointer; border-left:3px solid transparent; }
  nav .mod:hover { background:var(--fundo); }
  nav .mod.ativo { border-left-color:var(--ciano); background:var(--fundo); font-weight:600; }
  nav .mod small { display:block; color:var(--sub); font-size:11.5px; }
  #painel { padding:26px 34px; max-width:940px; }
  #painel img { max-width:100%; border:1px solid var(--borda); border-radius:8px; box-shadow:0 2px 8px rgba(14,44,82,.08); margin:6px 0; }
  #painel h1 { color:var(--azul); border-bottom:2px solid var(--ciano); padding-bottom:8px; }
  #painel h2 { color:var(--azul); margin-top:30px; }
  #painel h3 { color:#23405f; }
  #painel code { background:#eef2f6; padding:1px 6px; border-radius:5px; font-size:13px; }
  #painel pre { background:#0f2233; color:#dce8f5; padding:14px; border-radius:8px; overflow-x:auto; font-size:13px; }
  #painel pre code { background:none; color:inherit; padding:0; }
  #painel blockquote { border-left:4px solid var(--ciano); margin:10px 0; padding:6px 14px; background:#eaf6fd; border-radius:0 8px 8px 0; }
  #painel table { border-collapse:collapse; width:100%; margin:10px 0; font-size:14px; }
  #painel th, #painel td { border:1px solid var(--borda); padding:7px 10px; text-align:left; }
  #painel th { background:var(--fundo); }
  mark { background:var(--marca); border-radius:3px; padding:0 2px; }
  .resultados { padding:16px 22px; }
  .hit { background:var(--carta); border:1px solid var(--borda); border-radius:10px; padding:12px 16px; margin-bottom:10px; cursor:pointer; }
  .hit:hover { border-color:var(--ciano); }
  .hit .onde { color:var(--sub); font-size:12px; }
  .badge { font-size:11px; color:var(--sub); }
  .semprint { color:#b3541e; }
  footer { padding:10px 22px; color:var(--sub); font-size:12px; }
  @media (max-width: 860px) { main { grid-template-columns:1fr; } nav { position:static; max-height:none; border-right:none; border-bottom:1px solid var(--borda); } }
</style>
</head>
<body>
<header>
  <h1>📖 Manual do sistema</h1>
  <input id="busca" type="search" placeholder="Buscar por palavra-chave ou tema… (ex.: remuneração, agendar, Pix)" autocomplete="off">
  <div class="abas">
    <button id="aba-usuario" class="ativa">Usuário</button>
    <button id="aba-dev">Dev</button>
  </div>
</header>
<main>
  <nav id="lista"></nav>
  <section id="painel"></section>
</main>
<footer>Gerado por manual-index.mjs em ${geradoEm} — regenerado a cada rodada da /manual.</footer>
<script id="dados" type="application/json">${dados}</script>
<script>
const MODS = JSON.parse(document.getElementById('dados').textContent);
let face = 'usuario', atual = null;
const $ = s => document.querySelector(s);

// ---- mini-parser de markdown (subconjunto usado pelo manual; sem dependencias)
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function inline(s){
  return esc(s)
    .replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/g, '<img alt="$1" src="$2" loading="lazy">')
    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2">$1</a>')
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
    .replace(/(^|\\s)\\*([^*\\s][^*]*)\\*/g, '$1<em>$2</em>');
}
function md2html(md){
  const out = []; const linhas = md.split('\\n');
  let i = 0, lista = null, tabela = null;
  const fechaLista = () => { if (lista) { out.push('</' + lista + '>'); lista = null; } };
  const fechaTabela = () => { if (tabela) { out.push('</tbody></table>'); tabela = null; } };
  while (i < linhas.length) {
    const l = linhas[i];
    if (/^\`\`\`/.test(l)) { fechaLista(); fechaTabela(); const buf = []; i++;
      while (i < linhas.length && !/^\`\`\`/.test(linhas[i])) { buf.push(linhas[i]); i++; }
      out.push('<pre><code>' + esc(buf.join('\\n')) + '</code></pre>'); i++; continue; }
    if (/^\\|/.test(l)) {
      const cels = l.replace(/^\\||\\|$/g,'').split('|').map(c => c.trim());
      if (/^\\|?\\s*:?-{2,}/.test(linhas[i+1] || '')) { fechaLista();
        out.push('<table><thead><tr>' + cels.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>');
        tabela = true; i += 2; continue; }
      if (tabela) { out.push('<tr>' + cels.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>'); i++; continue; }
    } else fechaTabela();
    let m;
    if ((m = l.match(/^(#{1,4})\\s+(.+)$/))) { fechaLista(); const n = m[1].length;
      out.push('<h' + n + ' id="h-' + slugify(m[2]) + '">' + inline(m[2]) + '</h' + n + '>'); }
    else if ((m = l.match(/^>\\s?(.*)$/))) { fechaLista(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); }
    else if ((m = l.match(/^\\s*[-*]\\s+(.+)$/))) { if (lista !== 'ul') { fechaLista(); out.push('<ul>'); lista = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); }
    else if ((m = l.match(/^\\s*\\d+[.)]\\s+(.+)$/))) { if (lista !== 'ol') { fechaLista(); out.push('<ol>'); lista = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); }
    else if (l.trim() === '') { fechaLista(); }
    else { fechaLista(); out.push('<p>' + inline(l) + '</p>'); }
    i++;
  }
  fechaLista(); fechaTabela();
  return out.join('\\n');
}
function slugify(s){ return s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

// ---- navegacao
function renderLista(){
  const el = $('#lista'); el.innerHTML = '';
  MODS.filter(m => m.face === face).forEach(m => {
    const d = document.createElement('div');
    d.className = 'mod' + (atual === m ? ' ativo' : '');
    d.innerHTML = '<div>' + esc(m.titulo) + '</div><small>' + m.headings.length + ' seções · ' +
      (m.prints ? '📷 ' + m.prints : '<span class="semprint">sem prints</span>') +
      (m.pendentes ? ' · <span class="semprint">📷 ' + m.pendentes + ' pendente(s)</span>' : '') + '</small>';
    d.onclick = () => abrir(m);
    el.appendChild(d);
  });
}
function abrir(m, anchor){
  atual = m; face = m.face;
  $('#aba-usuario').classList.toggle('ativa', face === 'usuario');
  $('#aba-dev').classList.toggle('ativa', face === 'dev');
  renderLista();
  const painel = $('#painel');
  painel.className = ''; painel.innerHTML = md2html(m.md);
  const termo = $('#busca').value.trim();
  if (termo) realcar(painel, termo);
  if (anchor) { const a = painel.querySelector('#h-' + anchor); if (a) a.scrollIntoView({behavior:'smooth'}); }
  else window.scrollTo(0, 0);
}
function realcar(raiz, termo){
  const re = new RegExp('(' + termo.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + ')', 'gi');
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  const alvos = [];
  while (walker.nextNode()) if (re.test(walker.currentNode.nodeValue)) alvos.push(walker.currentNode);
  alvos.forEach(n => { const s = document.createElement('span'); s.innerHTML = esc(n.nodeValue).replace(re, '<mark>$1</mark>'); n.replaceWith(s); });
}

// ---- busca (titulo > heading > conteudo)
function buscar(termo){
  const t = termo.trim().toLowerCase();
  const painel = $('#painel');
  if (t.length < 2) { if (atual) abrir(atual); else inicio(); return; }
  const hits = [];
  for (const m of MODS) {
    if (m.titulo.toLowerCase().includes(t)) hits.push({ m, onde: 'título do módulo', trecho: m.titulo, peso: 0 });
    m.headings.forEach(h => { if (h.toLowerCase().includes(t)) hits.push({ m, onde: 'seção', trecho: h, anchor: slugify(h), peso: 1 }); });
    const idx = m.md.toLowerCase().indexOf(t);
    if (idx >= 0) {
      const ini = Math.max(0, idx - 60);
      hits.push({ m, onde: 'conteúdo', trecho: '…' + m.md.slice(ini, idx + t.length + 90).replace(/\\n/g, ' ') + '…', peso: 2 });
    }
  }
  hits.sort((a, b) => a.peso - b.peso || (a.m.face === 'usuario' ? -1 : 1));
  painel.className = 'resultados';
  painel.innerHTML = '<p><strong>' + hits.length + '</strong> resultado(s) para “' + esc(termo) + '”</p>' +
    (hits.slice(0, 40).map((h, i) => '<div class="hit" data-i="' + i + '"><strong>' + esc(h.m.titulo) + '</strong> ' +
      '<span class="badge">(' + h.m.face + ' · ' + h.onde + ')</span><div class="onde">' + esc(h.trecho).replace(new RegExp('(' + t.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + ')', 'gi'), '<mark>$1</mark>') + '</div></div>').join('') || '<p>Nada encontrado — tente outro termo.</p>');
  painel.querySelectorAll('.hit').forEach(el => el.onclick = () => { const h = hits[+el.dataset.i]; abrir(h.m, h.anchor); });
  window._hits = hits;
}
function inicio(){
  const u = MODS.filter(m => m.face === 'usuario');
  $('#painel').className = '';
  $('#painel').innerHTML = '<h1>Bem-vindo ao manual</h1><p>Escolha um módulo à esquerda ou use a <strong>busca</strong> ' +
    'acima para encontrar qualquer tela, tarefa ou tema (' + u.length + ' módulos de usuário, ' + (MODS.length - u.length) + ' de dev).</p>';
}
$('#busca').addEventListener('input', e => buscar(e.target.value));
$('#busca').addEventListener('keydown', e => { if (e.key === 'Enter' && window._hits && window._hits.length) { const h = window._hits[0]; abrir(h.m, h.anchor); } });
$('#aba-usuario').onclick = () => { face = 'usuario'; atual = null; renderLista(); inicio(); };
$('#aba-dev').onclick = () => { face = 'dev'; atual = null; renderLista(); inicio(); };
renderLista(); inicio();
</script>
</body>
</html>`;

const OUT = path.join(BASE, 'index.html');
fs.writeFileSync(OUT, html);
const nU = modulos.filter(m => m.face === 'usuario').length;
const semPrint = modulos.filter(m => m.face === 'usuario' && m.prints === 0).length;
console.log(`MANUAL-INDEX|${nU}u+${modulos.length - nU}d|${fs.statSync(OUT).size}B|sem-prints:${semPrint}`);
