#!/usr/bin/env node
// .claude/hooks/sessoes.mjs (3.4.21) — sessoes do Claude Code VIVAS nesta maquina: lista, aponta as
// ociosas e (a pedido) FECHA o processo. O transcript fica em ~/.claude/projects e a sessao segue
// retomavel (`claude --resume <id>` / lista do app) — fechar preserva o rastreio; arquivar aba no
// Desktop e que o perde (decisao do Charles, 04/09).
//
// Motivo (medido 04/09): 6 sessoes `claude-code` vivas (3 desde a manha) + 371 processos; em
// 25/08 eram 35 claude.exe, 2 com 27 h de CPU. Cada sessao viva segura RAM e, quando acorda,
// disputa a criacao de processo (serializada nesta maquina).
//
// Como decide "ociosa": (1) transcript mapeado (via --resume=<id> na linha de comando, ou por
// horario de criacao) => ociosa = minutos desde a ultima escrita no transcript; (2) sem mapa =>
// heuristica: sem processo filho + CPU parada desde a ultima amostra (estado em
// ~/.harness-run/sessoes.json, alimentado a cada SessionStart pelo doctor).
//
//   node .claude/hooks/sessoes.mjs                      lista (SESSAO|... + SESSOES|vivas=..)
//   node .claude/hooks/sessoes.mjs --doctor             linhas DOCTOR|sessao-ociosa|... (>= limiar)
//   node .claude/hooks/sessoes.mjs --fechar             fecha as ociosas >= limiar (HARNESS_SESSAO_OCIOSA_MIN, 120)
//   node .claude/hooks/sessoes.mjs --fechar --pid a,b   fecha estas (nunca a propria cadeia)
//   node .claude/hooks/sessoes.mjs --fechar --todas-ociosas   fecha toda sessao sem filho e sem CPU (2 amostras, 3 s)
//   flags: --min N (limiar em min) · --dry (mostra o que fecharia) · --json
// Windows: Get-CimInstance (1 chamada de PowerShell). macOS/Linux: ps.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { loadHarnessEnv } from './presence.mjs';

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_DIR = path.resolve(HOOKS_DIR, '..');
const HOME = os.homedir();
const RUN = path.join(HOME, '.harness-run');
const STATE = path.join(RUN, 'sessoes.json');
const LOGF = path.join(RUN, 'sessoes-fechadas.jsonl');
const PROJ = path.join(HOME, '.claude', 'projects');

const ENV = loadHarnessEnv(CLAUDE_DIR);   // 3.5.7: camadas (_defaults.env -> harness.env -> .local -> ~/.local; ambiente vence)
function num(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; }

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (k, d = '') => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] || '') : d; };
const LIMIAR = num(opt('min'), num(ENV.HARNESS_SESSAO_OCIOSA_MIN, 120));

// ---------------------------------------------------------------- processos
function tabela() { // -> [{pid, ppid, name, start(ms), cpu(s), cmd}]
  if (process.platform === 'win32') {
    const ps = `$a = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,KernelModeTime,UserModeTime,CommandLine,@{n='S';e={ if ($_.CreationDate) { [int64](($_.CreationDate.ToUniversalTime()) - (Get-Date '1970-01-01')).TotalMilliseconds } else { 0 } }}; $a | ConvertTo-Json -Compress -Depth 2`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-InputFormat', 'None', '-Command', ps], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    let a = []; try { a = JSON.parse(r.stdout || '[]'); } catch { return []; }
    if (!Array.isArray(a)) a = [a];
    return a.map(p => ({ pid: p.ProcessId, ppid: p.ParentProcessId, name: String(p.Name || ''), start: Number(p.S) || 0,
      cpu: ((Number(p.KernelModeTime) || 0) + (Number(p.UserModeTime) || 0)) / 1e7, cmd: String(p.CommandLine || '') }));
  }
  const r = spawnSync('ps', ['-axo', 'pid=,ppid=,etimes=,time=,args='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const out = []; const now = Date.now();
  for (const l of (r.stdout || '').split('\n')) {
    const m = l.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/); if (!m) continue;
    const t = m[4].split(/[-:]/).map(Number); let s = 0; while (t.length) s = s * 60 + t.shift();
    out.push({ pid: +m[1], ppid: +m[2], name: path.basename((m[5].split(' ')[0]) || ''), start: now - (+m[3]) * 1000, cpu: s, cmd: m[5] });
  }
  return out;
}
function ehSessaoCli(p) {
  if (process.platform === 'win32') {
    if (!/claude\.exe$/i.test(p.name)) return false;
    if (!p.cmd) return false;                           // app principal (sem linha de comando visivel)
    if (/--type=/.test(p.cmd)) return false;            // renderer/gpu/utility do Electron
    if (/crashpad/i.test(p.cmd)) return false;
    // CLI de verdade: binario do claude-code (Desktop) ou ~/.local/bin/claude (terminal) — nunca o
    // processo principal do app (matar esse derruba o Desktop inteiro)
    return /claude-code[\\/]/i.test(p.cmd) || /\.local[\\/]bin[\\/]claude/i.test(p.cmd) || /--output-format|--input-format|--resume|-p\s/.test(p.cmd);
  }
  if (!/(^|[\/ ])claude(\.js|\.mjs)?(\s|$)/.test(p.cmd)) return false;
  if (/Claude\.app|claude-desktop|Helper/i.test(p.cmd)) return false;
  return true;
}
function ancestrais(tab, pid) { const by = new Map(tab.map(p => [p.pid, p])); const s = new Set(); let cur = by.get(pid); let n = 0; while (cur && n++ < 30) { s.add(cur.pid); cur = by.get(cur.ppid); } return s; }

// ---------------------------------------------------------------- transcripts
function transcripts() { // [{id, projeto, file, birth, mtime}]
  const out = [];
  let projs = []; try { projs = fs.readdirSync(PROJ); } catch { return out; }
  for (const pr of projs) {
    const d = path.join(PROJ, pr);
    let fl = []; try { fl = fs.readdirSync(d).filter(f => /^[0-9a-f-]{36}\.jsonl$/.test(f)); } catch { continue; }
    for (const f of fl) {
      try { const st = fs.statSync(path.join(d, f)); out.push({ id: f.slice(0, 36), projeto: pr.replace(/^C--laragon-www-/i, '').replace(/^-Users-[^-]+-/, '~'), file: path.join(d, f), birth: st.birthtimeMs || st.ctimeMs, mtime: st.mtimeMs }); } catch {}
    }
  }
  return out;
}

// ---------------------------------------------------------------- estado (amostras anteriores)
function lerEstado() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } }
function gravarEstado(o) { try { fs.mkdirSync(RUN, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(o)); } catch {} }

function analisar(tab, prev, agoraMs) {
  const filhos = new Map();
  for (const p of tab) { if (/conhost/i.test(p.name)) continue; filhos.set(p.ppid, (filhos.get(p.ppid) || 0) + 1); }
  const trs = transcripts();
  const usados = new Set();
  const cli = tab.filter(ehSessaoCli);
  const pais = new Set(cli.map(p => p.ppid));            // quem tem sessao CLI como filho e o app, nao sessao
  const sess = cli.filter(p => !pais.has(p.pid)).map(p => {
    const rm = p.cmd.match(/--resume[= ]([0-9a-f-]{36})/);
    let tr = rm ? trs.find(t => t.id === rm[1]) : null;
    if (!tr) { // por horario de criacao: transcript nascido ate 3 min depois do processo
      const cands = trs.filter(t => !usados.has(t.id) && t.birth >= p.start - 5000 && t.birth <= p.start + 180000).sort((a, b) => a.birth - b.birth);
      tr = cands[0] || null;
    }
    if (tr) usados.add(tr.id);
    const mdl = (p.cmd.match(/--model\s+(\S+)/) || [])[1] || '';
    const st = prev[p.pid] || null;
    const cpuDelta = st ? p.cpu - (st.cpu || 0) : null;
    const temFilho = (filhos.get(p.pid) || 0) > 0;
    let ativoTs = st && st.ativoTs ? st.ativoTs : p.start;
    let base = 'cpu';
    if (tr) { ativoTs = Math.max(tr.mtime, temFilho ? agoraMs : 0); base = 'transcript'; }
    else if (temFilho || cpuDelta === null || cpuDelta >= 0.5) ativoTs = agoraMs;
    const ociosoMin = Math.max(0, Math.round((agoraMs - ativoTs) / 60000));
    const esforco = (p.cmd.match(/--effort[= ]+(\S+)/) || [])[1] || '';   // 3.5.5 (C1): esforco real da sessao, da linha de comando
    return { pid: p.pid, cpu: Math.round(p.cpu), start: p.start, modelo: mdl, esforco, projeto: tr ? tr.projeto : '?', sessao: tr ? tr.id : '',
      temFilho, cpuDelta, ociosoMin, base, estado: temFilho ? 'ativa' : (ociosoMin >= LIMIAR ? 'ociosa' : (ociosoMin >= 10 ? 'parada' : 'ativa')) };
  });
  const novo = {};
  for (const s of sess) novo[s.pid] = { cpu: s.cpu, ts: agoraMs, ativoTs: agoraMs - s.ociosoMin * 60000, start: s.start, modelo: s.modelo, esforco: s.esforco };
  gravarEstado(novo);
  return sess;
}

function fmt(ms) { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function linha(s) { return `SESSAO|${s.pid}|${s.estado}|${s.ociosoMin}min|cpu=${s.cpu}s|inicio=${fmt(s.start)}|${s.projeto}|${s.sessao.slice(0, 8) || '?'}|${s.modelo || '?'}|${s.base}|${s.esforco || '?'}`; }

// ---------------------------------------------------------------- main
const agora = Date.now();
let tab = tabela();
if (!tab.length) { console.log('SESSOES|indisponivel|nao consegui listar processos'); process.exit(0); }
let sess = analisar(tab, lerEstado(), agora);
const minha = ancestrais(tab, process.pid);

if (has('--todas-ociosas') || (has('--fechar') && !opt('pid') && !Object.keys(lerEstado()).length)) {
  // segunda amostra (3 s) para quem nao tem transcript mapeado
  await new Promise(r => setTimeout(r, 3000));
  tab = tabela(); sess = analisar(tab, lerEstado(), Date.now());
}

const ociosas = sess.filter(s => !minha.has(s.pid) && (has('--todas-ociosas') ? (!s.temFilho && (s.base === 'transcript' ? s.ociosoMin >= 10 : (s.cpuDelta !== null && s.cpuDelta < 0.05))) : (s.estado === 'ociosa')));

if (has('--json')) { console.log(JSON.stringify({ limiar: LIMIAR, sessoes: sess, ociosas: ociosas.map(s => s.pid), propria: [...minha] })); process.exit(0); }

if (has('--doctor')) {
  for (const s of ociosas) console.log(`DOCTOR|sessao-ociosa|${s.pid}|${s.ociosoMin}min|${s.projeto}|cpu=${s.cpu}s|fechar: node .claude/hooks/sessoes.mjs --fechar --pid ${s.pid}`);
  console.log(`DOCTOR|sessoes|vivas=${sess.length}|ociosas=${ociosas.length}|limiar=${LIMIAR}min${ociosas.length ? '|fechar todas: node .claude/hooks/sessoes.mjs --fechar' : ''}`);
  process.exit(0);
}

if (has('--fechar')) {
  let alvo = ociosas;
  if (opt('pid')) { const ids = new Set(opt('pid').split(',').map(x => parseInt(x, 10)).filter(Boolean)); alvo = sess.filter(s => ids.has(s.pid) && !minha.has(s.pid)); }
  if (!alvo.length) { console.log(`SESSOES|nada-a-fechar|vivas=${sess.length}|limiar=${LIMIAR}min`); process.exit(0); }
  for (const s of alvo) {
    if (has('--dry')) { console.log(`SESSAO|fecharia|${s.pid}|${s.ociosoMin}min|${s.projeto}`); continue; }
    let ok = false;
    try { process.kill(s.pid); ok = true; } catch (e) { console.log(`SESSAO|erro|${s.pid}|${e && e.message}`); }
    if (ok) {
      console.log(`SESSAO|fechada|${s.pid}|${s.ociosoMin}min|${s.projeto}|${s.sessao.slice(0, 8) || '?'}|retomar: claude --resume ${s.sessao || '<id>'}`);
      try { fs.mkdirSync(RUN, { recursive: true }); fs.appendFileSync(LOGF, JSON.stringify({ ts: Math.floor(Date.now() / 1000), pid: s.pid, projeto: s.projeto, sessao: s.sessao, ocioso_min: s.ociosoMin, cpu_s: s.cpu, inicio: s.start }) + '\n'); } catch {}
    }
  }
  process.exit(0);
}

for (const s of sess.sort((a, b) => b.ociosoMin - a.ociosoMin)) console.log(linha(s) + (minha.has(s.pid) ? '|(esta sessao)' : ''));
console.log(`SESSOES|vivas=${sess.length}|ociosas=${ociosas.length}|limiar=${LIMIAR}min|fechar: node .claude/hooks/sessoes.mjs --fechar [--pid N]`);
