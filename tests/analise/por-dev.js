// agrega telemetria por dev/maquina em todos os repos — uso: HARNESS_BASE=<pasta-pai> node por-dev.js
const fs = require('fs'), path = require('path');
const BASE = process.env.HARNESS_BASE || 'C:/laragon/www';
const rows = []; const seen = new Set();
const isRuns = (f) => /[\\/]runs[\\/]/.test(f);
for (const d of fs.readdirSync(BASE)) {
  const m = path.join(BASE, d, 'prds', '_metrics'); if (!fs.existsSync(m)) continue;
  const files = [path.join(m, 'harness-runs.jsonl')];
  try { for (const r of fs.readdirSync(path.join(m, 'runs'))) if (r.endsWith('.jsonl')) files.push(path.join(m, 'runs', r)); } catch {}
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
      let o; try { o = JSON.parse(l); } catch { continue; }
      const h = o.harness || ''; const ts = +o.ts_start || 0;
      if (!(h >= '3.4.10' || ts >= 1787965200)) continue; // 29/08 00:00 BRT
      const k = (o.projeto || d) + '|' + o.label + '|' + o.ts_end; if (seen.has(k)) continue; seen.add(k);
      const maq = o.maquina || (isRuns(f) ? path.basename(f, '.jsonl') : '(sem maquina)');
      const proj = (o.projeto || d).replace(/--wt-.*/, '~wt');
      const el = +o.elapsed_s || 0, act = +o.elapsed_active_s || el; const lab = o.label || '';
      const grupo = /fase1/.test(lab) ? 'f1' : /fase2/.test(lab) ? 'f2' : /exec$/.test(lab) ? 'exec' : /^LOTE/.test(lab) ? 'lote' : 'outro';
      const ex = String(o.extra || '');
      const spawn = (ex.match(/spawn[=:]\s*(\d+)\s*ms/) || [])[1];
      const codex = /dupla-cega real|codex\+sherlock|codex real|revisor externo: codex|codex-cli \(reasoning|codex \d+ ciclos|codex low|codex gpt/i.test(ex) ? 'dupla'
        : /SOLO|solo|usage limit|sem cota|indisponivel|ausente|MUDO|sem credito/i.test(ex) ? 'solo' : '';
      rows.push({ proj, maq: maq.replace(/@.*/, ''), host: maq.replace(/.*@/, ''), h, lab, grupo, el: Math.round(el / 60), act: Math.round(act / 60),
        perm: +o.permission_prompts || 0, den: +o.classifier_denials || 0, waitH: +o.wait_human_min || 0, preset: o.preset || '', spawn, codex,
        lpt: +o.linhas_por_task || 0, tasks: +o.tasks || 0, sub: +o.subagents || 0, par: +o.parallel_factor || 0 });
    }
  }
}
const med = (a) => { a = a.filter((x) => x > 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : '-'; };
const G = {};
for (const r of rows) {
  const g = G[r.maq] = G[r.maq] || { n: 0, hosts: new Set(), projs: new Set(), h: new Set(), f1: [], f2: [], exec: [], lote: [], perm: 0, permN: [], den: 0, waitH: 0, presets: {}, spawn: new Set(), codex: {}, garbage: [], lpt: [], tasksExec: [], parExec: [] };
  g.n++; g.hosts.add(r.host); g.projs.add(r.proj); if (r.h) g.h.add(r.h); g.perm += r.perm; g.permN.push(r.perm); g.den += r.den; g.waitH += r.waitH;
  if (r.preset) g.presets[r.preset] = (g.presets[r.preset] || 0) + 1; if (r.spawn) g.spawn.add(r.spawn + 'ms'); if (r.codex) g.codex[r.codex] = (g.codex[r.codex] || 0) + 1;
  if (r.el > 720) { g.garbage.push(r.proj + ' ' + r.lab + ' ' + r.el + 'm'); continue; }
  if (g[r.grupo]) g[r.grupo].push(r.act); if (r.lpt) g.lpt.push(r.lpt); if (r.grupo === 'exec') { g.tasksExec.push(r.tasks); g.parExec.push(r.par); }
}
console.log('DEV | runs | hosts | projetos | harness | f1 med | f2 med | exec med (n) | tasks/exec | par exec | lpt | perm tot (med) | denials | waitH tot | presets | spawn | codex | lixo>12h');
for (const k of Object.keys(G).sort((a, b) => G[b].n - G[a].n)) {
  const g = G[k];
  console.log([k, g.n, [...g.hosts].join('/'), [...g.projs].join(','), [...g.h].sort().join(','), med(g.f1), med(g.f2), med(g.exec) + ' (' + g.exec.length + ')', med(g.tasksExec),
    (med(g.parExec.map((x) => Math.round(x * 100))) / 100) || '-', med(g.lpt), g.perm + ' (' + med(g.permN) + ')', g.den, g.waitH, JSON.stringify(g.presets), [...g.spawn].join('/') || '-', JSON.stringify(g.codex), g.garbage.length].join(' | '));
}
console.log('\nLIXO (>12h):'); for (const k in G) for (const x of G[k].garbage) console.log(' ', k, '|', x);
console.log('\nEXECs por dev (ativa min):');
for (const r of rows.filter((r) => r.grupo === 'exec' && r.el <= 720).sort((a, b) => a.maq.localeCompare(b.maq) || a.act - b.act))
  console.log(' ', r.maq.padEnd(18), r.proj.padEnd(22), r.h.padEnd(6), r.lab.padEnd(16), String(r.act).padStart(4) + 'm', 'tasks=' + r.tasks, 'par=' + r.par, 'perm=' + r.perm, 'waitH=' + r.waitH, 'codex=' + (r.codex || '?'), 'spawn=' + (r.spawn || '-'), r.preset);
console.log('\nFASE 2 por dev (ativa min):');
for (const r of rows.filter((r) => r.grupo === 'f2' && r.el <= 720 && r.act > 0).sort((a, b) => a.maq.localeCompare(b.maq) || a.act - b.act))
  console.log(' ', r.maq.padEnd(18), r.proj.padEnd(22), r.h.padEnd(6), r.lab.padEnd(18), String(r.act).padStart(4) + 'm', 'tasks=' + r.tasks, 'lpt=' + r.lpt, 'perm=' + r.perm, r.preset);
