#!/usr/bin/env node
// .claude/hooks/task-grafo.mjs (3.5.7) — GRAFO DE DEPENDENCIAS das tasks de uma PRD: profundidade x largura.
//
// Motivo (medido 15-16/09 em TODAS as execs da 3.5.5: 137-c, 145, 141-b, 144, 140-b): a run fechou com
// `limitou=dependencias`, paralelismo real 1,18-1,29 e vivos_max 4-5 com teto 6 — o teto de executores nunca foi
// o gargalo; o PLANO era serial por construcao (cadeias TASK-001 > 003 > 006 > 008 com 9 tasks). O `task-packet
// --check` mede cada task isolada e o `task-matrix` mede hubs de arquivo; nada media o grafo. Aqui: niveis por
// caminho mais longo, largura por nivel, caminho critico e o FATOR TEORICO = tasks / profundidade (teto do
// paralelismo que o plano permite). Abaixo de HARNESS_GRAFO_FATOR_MIN (2) a /prd (Passo 8) replaneja ANTES do gate:
// extrai a interface do gargalo numa task curta, quebra o encadeamento em tasks disjuntas por arquivo.
//
//   node .claude/hooks/task-grafo.mjs prds/PRD-144-*/tasks            (pasta, glob simples com * ou um TASK-*.md)
// Saida (uma linha por item):
//   GRAFO|<PRD>|tasks=N|profundidade=D|largura_max=W|fator_teorico=F|caminho_critico=A>B>C
//   GRAFO-NIVEL|<n>|<TASK-ids csv>                              (ordem topologica por nivel)
//   GRAFO-GARGALO|<TASK>|dependentes=<n diretos>|alcance=<n transitivos>|<ids>   (tasks com >= 2 dependentes diretos)
//   GRAFO-VEREDITO|ok|fator F >= MIN   ·   GRAFO-VEREDITO|serial|fator F < MIN|<sugestao>
//   GRAFO-ERRO|ciclo|<ids>  ·  GRAFO-ERRO|dependencia-inexistente|<TASK>|<id citado>
// Le `**Depende de**` (ids TASK-NNN[a-z]?; '—', 'nenhuma', vazio = raiz). `[requires]`/`[after]` no texto nao mudam a
// aresta. Read-only; exit 0 (2 = uso).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadHarnessEnv } from './presence.mjs';

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_DIR = path.resolve(HOOKS_DIR, '..');

export function lerTasks(alvo) { // pasta | glob com * | arquivo -> [{id, file, deps:[], tipo}]
  let files = [];
  const abs = path.resolve(alvo);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) files = fs.readdirSync(abs).filter(f => /^TASK-\d+[a-z]?.*\.md$/i.test(f)).map(f => path.join(abs, f));
  else if (fs.existsSync(abs) && fs.statSync(abs).isFile()) { const d = path.dirname(abs); files = fs.readdirSync(d).filter(f => /^TASK-\d+[a-z]?.*\.md$/i.test(f)).map(f => path.join(d, f)); }
  else if (alvo.includes('*')) {
    // glob simples: prds/PRD-144-*/tasks/TASK-*.md  => expande so o '*' de cada segmento
    const partes = alvo.replace(/\\/g, '/').split('/');
    let acc = ['.'];
    if (/^[A-Za-z]:$/.test(partes[0] || '')) acc = [partes.shift() + '/'];      // C:/...
    else if (partes[0] === '') { partes.shift(); acc = ['/']; }                   // /abs (posix)
    for (const seg of partes) {
      if (!seg) continue;
      const next = [];
      for (const base of acc) {
        if (!seg.includes('*')) { next.push(path.join(base, seg)); continue; }
        const re = new RegExp('^' + seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
        let ents = []; try { ents = fs.readdirSync(base); } catch {}
        for (const e of ents) if (re.test(e)) next.push(path.join(base, e));
      }
      acc = next;
    }
    for (const f of acc) {   // o glob pode terminar na PASTA das tasks ou nos arquivos
      try { const st = fs.statSync(f); if (st.isFile()) files.push(f); else if (st.isDirectory()) files.push(...fs.readdirSync(f).filter(x => /^TASK-\d+[a-z]?.*\.md$/i.test(x)).map(x => path.join(f, x))); } catch {}
    }
  }
  const tasks = [];
  for (const f of files.sort()) {
    const id = (path.basename(f).match(/^(TASK-\d+[a-z]?)/i) || [])[1]; if (!id) continue;
    const txt = fs.readFileSync(f, 'utf8');
    // so a ESPECIFICACAO da dependencia (antes do " — " explicativo): `TASK-003 [barrier: integracao] — integração: ...`
    // cita outras tasks na prosa e virava aresta falsa (medido 16/09 na 144: ciclo TASK-005>008>007>008). Faixa
    // `TASK-001..TASK-007` expande; `[barrier]` sem id = sem dependencia de task (barreira de decisao).
    let dep = ((txt.match(/^\|\s*\*\*Depende de\*\*\s*\|([^|\n]*)/mi) || [])[1] || '').split(/\s[—–]\s/)[0];
    dep = dep.replace(/TASK-(\d+)[a-z]?\s*\.\.\s*TASK-(\d+)/gi, (m, a, b) => { const out = []; for (let n = +a; n <= +b && out.length < 200; n++) out.push('TASK-' + String(n).padStart(a.length, '0')); return out.join(','); });
    const deps = [...new Set((dep.match(/TASK-\d+[a-z]?/gi) || []).map(s => s.toUpperCase()))].filter(d => d !== id.toUpperCase());
    const tipo = ((txt.match(/^\|\s*\*\*Tipo\*\*\s*\|\s*([^|\n]*)/mi) || [])[1] || '').trim().toLowerCase();
    tasks.push({ id: id.toUpperCase(), file: f, deps, tipo });
  }
  return tasks;
}

export function grafo(tasks, { fatorMin = 2 } = {}) {
  const ids = new Set(tasks.map(t => t.id)); const by = new Map(tasks.map(t => [t.id, t]));
  const erros = [];
  for (const t of tasks) for (const d of t.deps) if (!ids.has(d)) erros.push(`GRAFO-ERRO|dependencia-inexistente|${t.id}|${d}`);
  // nivel = 1 + max(nivel das deps existentes); deteccao de ciclo por DFS
  const nivel = new Map(); const visitando = new Set(); let ciclo = null;
  const calc = (id, trilha) => {
    if (nivel.has(id)) return nivel.get(id);
    if (visitando.has(id)) { ciclo = ciclo || [...trilha, id]; return 1; }
    visitando.add(id);
    const t = by.get(id); let n = 1;
    for (const d of (t ? t.deps : [])) if (ids.has(d)) n = Math.max(n, 1 + calc(d, [...trilha, id]));
    visitando.delete(id); nivel.set(id, n); return n;
  };
  for (const t of tasks) calc(t.id, []);
  if (ciclo) erros.push(`GRAFO-ERRO|ciclo|${ciclo.join('>')}`);
  const prof = tasks.length ? Math.max(...[...nivel.values()]) : 0;
  const niveis = []; for (let n = 1; n <= prof; n++) niveis.push(tasks.filter(t => nivel.get(t.id) === n).map(t => t.id));
  const largura = niveis.length ? Math.max(...niveis.map(l => l.length)) : 0;
  // caminho critico: reconstroi a partir da task de maior nivel seguindo a dep de maior nivel (bounded: um ciclo nao
  // pode virar loop infinito — medido no 1o teste real, 16/09)
  let cc = []; if (tasks.length) { let cur = tasks.filter(t => nivel.get(t.id) === prof)[0]; const vis = new Set(); while (cur && !vis.has(cur.id) && cc.length <= tasks.length) { vis.add(cur.id); cc.unshift(cur.id); const ds = cur.deps.filter(d => ids.has(d) && !vis.has(d)).sort((a, b) => nivel.get(b) - nivel.get(a)); cur = ds.length ? by.get(ds[0]) : null; } }
  // dependentes diretos e alcance transitivo
  const dependentes = new Map(); for (const t of tasks) for (const d of t.deps) if (ids.has(d)) dependentes.set(d, [...(dependentes.get(d) || []), t.id]);
  const alcance = (id) => { const s = new Set(); const st = [...(dependentes.get(id) || [])]; while (st.length) { const x = st.pop(); if (s.has(x)) continue; s.add(x); st.push(...(dependentes.get(x) || [])); } return s.size; };
  const gargalos = tasks.filter(t => (dependentes.get(t.id) || []).length >= 2).map(t => ({ id: t.id, diretos: dependentes.get(t.id).length, alcance: alcance(t.id), ids: dependentes.get(t.id) })).sort((a, b) => b.alcance - a.alcance);
  const fator = prof ? +(tasks.length / prof).toFixed(2) : 0;
  const veredito = tasks.length === 0 ? 'vazio' : (fator >= fatorMin ? 'ok' : 'serial');
  let sugestao = '';
  if (veredito === 'serial') {
    const g = gargalos[0];
    const folhas = tasks.filter(t => !t.deps.length && !(dependentes.get(t.id) || []).length).map(t => t.id);
    sugestao = g ? `${g.id} segura ${g.alcance} task(s) (${g.ids.join(',')}): extraia a INTERFACE (helper/contrato/migration) numa task curta e libere as consumidoras no mesmo nivel; ` : '';
    sugestao += `caminho critico de ${prof} niveis para ${tasks.length} tasks — quebre as cadeias em tasks disjuntas por arquivo (front e back da mesma feature em tasks irmas, nao encadeadas)`;
    if (folhas.length) sugestao += `; ja disjuntas: ${folhas.join(',')}`;
  }
  return { tasks: tasks.length, profundidade: prof, largura, fator, caminhoCritico: cc, niveis, gargalos, veredito, sugestao, erros };
}

function isMain() { try { return path.resolve(process.argv[1] || '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); } catch { return false; } }
if (isMain()) {
  const alvo = process.argv[2];
  if (!alvo) { console.error('uso: task-grafo.mjs <pasta das tasks | glob | TASK-*.md>'); process.exit(2); }
  const ENV = loadHarnessEnv(CLAUDE_DIR);
  const fatorMin = parseFloat(ENV.HARNESS_GRAFO_FATOR_MIN || '2') || 2;
  const tasks = lerTasks(alvo);
  const g = grafo(tasks, { fatorMin });
  // rotulo: PRD-144 de "PRD-144-chat-wpp-…" e PRD-140-b de "PRD-140-b-desconto-…" (fatia = 1 letra seguida de '-' ou fim)
  const pasta = (tasks[0] ? path.basename(path.dirname(path.dirname(tasks[0].file))) : path.basename(path.dirname(path.resolve(alvo).replace(/\\/g, '/'))));
  const prd = (pasta.match(/^(PRD|LOTE)-\d+(-[a-z](?=-|$))?/i) || [])[0] || pasta || '?';
  console.log(`GRAFO|${prd}|tasks=${g.tasks}|profundidade=${g.profundidade}|largura_max=${g.largura}|fator_teorico=${g.fator}|caminho_critico=${g.caminhoCritico.join('>')}`);
  g.niveis.forEach((l, i) => console.log(`GRAFO-NIVEL|${i + 1}|${l.join(',')}`));
  for (const x of g.gargalos) console.log(`GRAFO-GARGALO|${x.id}|dependentes=${x.diretos}|alcance=${x.alcance}|${x.ids.join(',')}`);
  for (const e of g.erros) console.log(e);
  console.log(g.veredito === 'ok' ? `GRAFO-VEREDITO|ok|fator ${g.fator} >= ${fatorMin}` : (g.veredito === 'vazio' ? 'GRAFO-VEREDITO|vazio|nenhuma task encontrada' : `GRAFO-VEREDITO|serial|fator ${g.fator} < ${fatorMin}|${g.sugestao}`));
  process.exit(0);
}
