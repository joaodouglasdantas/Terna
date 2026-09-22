// compara-prds.js [raiz-do-projeto] [N=10] — últimas N PRDs: criação (fase1+fase2) × execução, a partir de
// prds/_metrics/runs/*.jsonl (por dev/máquina, 3.5.0+) e prds/_metrics/harness-runs.jsonl (legado). Saída: tabela markdown + JSON.
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = process.argv[2] || 'C:\\laragon\\www\\dra-mariana-duarte';
const N = Number(process.argv[3] || 10);
const M = path.join(ROOT, 'prds', '_metrics');
const linhas = [];
const lerArq = (f) => { try { for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (!l.trim()) continue; try { linhas.push(JSON.parse(l)); } catch {} } } catch {} };
try { for (const f of fs.readdirSync(path.join(M, 'runs'))) if (f.endsWith('.jsonl')) lerArq(path.join(M, 'runs', f)); } catch {}
lerArq(path.join(M, 'harness-runs.jsonl'));
// dedup por label+ts_end (o arquivo por dev e o legado podem ter a mesma linha)
const seen = new Set(); const runs = [];
for (const r of linhas) { const k = r.label + '|' + r.ts_end; if (seen.has(k)) continue; seen.add(k); runs.push(r); }
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const min = (s) => (s == null ? '' : Math.round(s / 60));
const prds = new Map();
for (const r of runs) {
  const m = String(r.label || '').match(/^PRD-(\d{3,5})(-[a-z])?-(fase1|fase2|exec)(?:-.*)?$/);
  if (!m) continue;
  const key = 'PRD-' + m[1] + (m[2] || '');
  const p = prds.get(key) || { prd: key, fase1: [], fase2: [], exec: [] };
  p[m[3]].push(r); prds.set(key, p);
}
const ultimo = (arr) => arr.slice().sort((a, b) => (num(a.ts_end) || 0) - (num(b.ts_end) || 0)).pop();
const soma = (arr, campo) => arr.reduce((a, r) => a + (num(r[campo]) || 0), 0);
const out = [];
for (const p of prds.values()) {
  const f1 = ultimo(p.fase1), f2 = ultimo(p.fase2), ex = ultimo(p.exec);
  const criacaoS = (f1 ? num(f1.elapsed_s) || 0 : 0) + (f2 ? num(f2.elapsed_s) || 0 : 0);
  const criacaoAtivoS = (f1 ? num(f1.elapsed_active_s) ?? num(f1.elapsed_s) ?? 0 : 0) + (f2 ? num(f2.elapsed_active_s) ?? num(f2.elapsed_s) ?? 0 : 0);
  out.push({
    prd: p.prd,
    quando: ex ? new Date((num(ex.ts_end) || 0) * 1000).toISOString().slice(0, 10) : (f2 ? new Date((num(f2.ts_end) || 0) * 1000).toISOString().slice(0, 10) : ''),
    ordem: num((ex || f2 || f1 || {}).ts_end) || 0,
    harness_criacao: f2 ? (f2.harness || f2.versao || '') : '',
    criacao_min: f1 || f2 ? min(criacaoS) : '', criacao_ativo_min: f1 || f2 ? min(criacaoAtivoS) : '',
    criacao_tasks: f2 ? f2.tasks : '', criacao_ciclos: f2 ? f2.ciclos : '', criacao_achados: f2 ? f2.achados_por_ciclo : '',
    criacao_tokens_out_k: f1 || f2 ? Math.round(((f1 ? num(f1.tokens_output) || 0 : 0) + (f2 ? num(f2.tokens_output) || 0 : 0)) / 1000) : '',
    criacao_modo: f2 ? f2.modo : '', criacao_esforco: f2 ? f2.esforco : '',
    exec_min: ex ? min(num(ex.elapsed_s)) : '', exec_ativo_min: ex ? min(num(ex.elapsed_active_s)) : '',
    exec_tasks: ex ? ex.tasks : '', exec_ciclos: ex ? ex.ciclos : '', exec_subagentes: ex ? ex.subagents : '',
    exec_paralelismo: ex ? ex.parallel_factor : '', exec_vivos_max: ex ? ex.vivos_max : '', exec_limitou: ex ? ex.limitou : '',
    exec_thinking_sub: ex ? ex.tokens_thinking_pct_subagents : '', exec_esforco: ex ? ex.esforco : '',
    exec_tokens_out_k: ex ? Math.round((num(ex.tokens_output) || 0) / 1000) : '', exec_tokens_sub_out_k: ex ? Math.round((num(ex.tokens_output_subagents) || 0) / 1000) : '',
    exec_wait_human: ex ? ex.wait_human_min : '', exec_achados: ex ? ex.achados_por_ciclo : '', exec_tasks_est: ex ? ex.tasks_estouradas : '',
    exec_min_por_task: ex && num(ex.tasks) ? Math.round((num(ex.elapsed_active_s) ?? num(ex.elapsed_s) ?? 0) / 60 / num(ex.tasks) * 10) / 10 : '',
    harness_exec: ex ? (ex.harness || ex.versao || '') : '',
  });
}
for (const r of out) for (const k of Object.keys(r)) if (r[k] === undefined || r[k] === null) r[k] = '';
out.sort((a, b) => b.ordem - a.ordem);
const top = out.slice(0, N).reverse();
const cab = ['PRD', 'data', 'criação min (ativo)', 'tasks', 'ciclos·🔴/ciclo', 'tok out k', 'modo/esforço', 'exec min (ativo)', 'tasks', 'min/task', 'subag.', 'paralel.', 'vivos/limitou', 'think% sub', 'esforço', 'tok out k pai+sub', 'espera hum.', '🔴/ciclo', 'harness'];
console.log('| ' + cab.join(' | ') + ' |'); console.log('|' + cab.map(() => '---').join('|') + '|');
for (const r of top) console.log(`| ${r.prd} | ${r.quando} | ${r.criacao_min}${r.criacao_ativo_min !== '' ? ' (' + r.criacao_ativo_min + ')' : ''} | ${r.criacao_tasks} | ${r.criacao_ciclos}·${r.criacao_achados} | ${r.criacao_tokens_out_k} | ${r.criacao_modo}/${r.criacao_esforco} | ${r.exec_min}${r.exec_ativo_min !== '' ? ' (' + r.exec_ativo_min + ')' : ''} | ${r.exec_tasks} | ${r.exec_min_por_task} | ${r.exec_subagentes} | ${r.exec_paralelismo} | ${r.exec_vivos_max}/${r.exec_limitou} | ${r.exec_thinking_sub} | ${r.exec_esforco} | ${r.exec_tokens_out_k}+${r.exec_tokens_sub_out_k} | ${r.exec_wait_human} | ${r.exec_achados} | ${r.harness_exec} |`);
if (process.argv.includes('--json')) console.log(JSON.stringify(top, null, 1));
