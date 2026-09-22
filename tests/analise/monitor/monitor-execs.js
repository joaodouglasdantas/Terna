// monitor-execs.js — vigia as execucoes do harness vivas nesta maquina e anota eventos novos.
// Uso: node monitor-execs.js [--once] [--max-min N] [--intervalo-s N] [--baseline]
//  - le incrementalmente transcripts (sessao + subagentes), .harness-run/*.jsonl, incidentes versionados,
//    estado de exec (*-exec.json/_auto-*.json), frentes globais, sonda de spawn e contagem de processos;
//  - grava eventos em EVENTOS_JSONL e linhas legiveis no NOTA_MD (secao "Linha do tempo (auto)");
//  - sai (exit 0) assim que houver evento NOTAVEL no ciclo, ou ao fim de --max-min (heartbeat).
'use strict';
const fs = require('fs'); const path = require('path'); const { spawnSync } = require('child_process');

const HOME = process.env.USERPROFILE || process.env.HOME;
const BASE = 'C:\\laragon\\www';
const PROJ_DIR = path.join(HOME, '.claude', 'projects');
const SCRATCH = __dirname;
const STATE_F = path.join(SCRATCH, 'monitor-state.json');
const EVENTOS_JSONL = path.join(SCRATCH, 'monitor-eventos.jsonl');
const NOTA_MD = 'C:\\laragon\\www\\vault\\projetos\\referencias\\harness\\prds\\MONITOR-EXECS-2026-09-15-noite.md';
const MARCA = '<!-- monitor:auto -->';

// rodada 4 (15/09 noite, 3.5.5): 3 execs do Mariana em worktrees novas (+ main)
const PROJETOS = [
  { nome: 'dra-mariana-duarte--wt-exec-141b', rotulo: 'PRD-141-b · /prd-exec' },
  { nome: 'dra-mariana-duarte--wt-exec-145',  rotulo: 'PRD-145 · /prd-exec' },
  { nome: 'dra-mariana-duarte--wt-exec-137c', rotulo: 'PRD-137-c · /prd-exec' },
  { nome: 'dra-mariana-duarte',               rotulo: 'main' },
];
const JANELA_H = 6; // transcripts tocados nas ultimas N horas

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ONCE = args.includes('--once'); const BASELINE = args.includes('--baseline');
const MAX_MIN = Number(opt('--max-min', 40)); const INTERVALO_S = Number(opt('--intervalo-s', 120));

const hh = (d = new Date()) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const j = (o) => JSON.stringify(o);
const lerJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
const tam = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
const slug = (p) => (BASE + '\\' + p).replace(/[\\/:]/g, '-');

let state = lerJson(STATE_F, { offsets: {}, execState: {}, frentes: {}, tarefas: {}, criado: Date.now() });

// ---- leitura incremental de arquivos de linhas
function novasLinhas(f) {
  const size = tam(f); if (!size) return [];
  const off = state.offsets[f] || 0;
  if (BASELINE || !(f in state.offsets)) { state.offsets[f] = size; return BASELINE ? [] : (off === 0 && state.criado < Date.now() - 1000 ? [] : []); }
  if (size < off) { state.offsets[f] = size; return []; }
  if (size === off) return [];
  const fd = fs.openSync(f, 'r'); const buf = Buffer.alloc(size - off);
  fs.readSync(fd, buf, 0, size - off, off); fs.closeSync(fd);
  const txt = buf.toString('utf8'); const lastNl = txt.lastIndexOf('\n');
  if (lastNl < 0) return [];               // linha parcial: espera completar
  state.offsets[f] = off + Buffer.byteLength(txt.slice(0, lastNl + 1), 'utf8');
  return txt.slice(0, lastNl).split('\n').filter(Boolean);
}

// ---- classificacao de tool_result
function classifica(s, isError) {
  if (/CARGA\|spawn\|\d+ms\|LENTO/.test(s)) return { tipo: 'carga-lenta', notavel: true };
  if (/CARGA\|vivos\|/.test(s)) return { tipo: 'carga', notavel: false };
  if (/\[guard-bash\] SINTAXE/.test(s)) return { tipo: 'sintaxe-deny', notavel: true };
  if (/\[guard-write\] Write NEGADO[^\n]*marcadores de conflito/.test(s)) return { tipo: 'conflito-deny', notavel: true };
  if (/fora do catalogo/.test(s)) return { tipo: 'catalogo-aviso', notavel: false };
  if (/LOCK\|livre\|/.test(s)) return { tipo: 'lock-livre', notavel: false };
  if (/delegacoes=\d+/.test(s)) return { tipo: 'delegacoes', notavel: false };
  if (/ESFORCO\|[^\n]*atual=n\/d/.test(s)) return { tipo: 'esforco-nd', notavel: true };
  if (/ESFORCO\|[^\n]*AJUSTAR/.test(s)) return { tipo: 'esforco-ajustar', notavel: true };
  if (/\[metrics-auto\][^\n]*LIGADO/.test(s)) return { tipo: 'metrics-auto', notavel: false };
  if (/SEQ\|PRD\|/.test(s)) return { tipo: 'seq', notavel: false };
  if (/VALIDACAO\|[^\n]*\|(ok|falta)|GATE\|/.test(s)) return { tipo: 'gate', notavel: false };
  if (/^STALL\|/m.test(s)) return { tipo: 'stall', notavel: true };
  if (/PACKET-CHECK\|[^\n]*GRANDE/.test(s)) return { tipo: 'packet-grande', notavel: false };
  if (/VALIDACAO\|[^\n]*\|falta/.test(s)) return { tipo: 'validacao-falta', notavel: false };
  if (/MATRIZ-HUB/.test(s)) return { tipo: 'matriz-hub', notavel: false };
  if (!isError) return null;                                   // conteudo lido (Read/packet/Perfil) nunca e erro
  if (/\[guard-bash\] BLOQUEADO: leitura via Bash/.test(s)) return { tipo: 'leitura-deny', notavel: false };          // GUARDA 0: esperado, contado via incidentes
  if (/\[guard-playwright\] executor roda SÓ o spec/.test(s)) return { tipo: 'playwright-regraB', notavel: false };  // A1 (falso positivo 2>&1) ja anotado
  if (/\[guard-folego\]|\[guard-playwright\] .* já rodou testes/.test(s)) return { tipo: 'deny-teto', notavel: false };  // o incidente versionado ja acorda o monitor
  if (/\[guard-bash\] BLOQUEADO: o comando escreve em/.test(s)) return { tipo: 'guarda1-deny', notavel: false };        // A14/A15 ja anotados; so registrar
  if (/hook error|blocked by hook|\[guard-|\[GUARD|PreToolUse:[^\n]*hook|PostToolUse:[^\n]*hook/i.test(s)) return { tipo: 'hook-deny', notavel: true };
  if (/<tool_use_error>/.test(s)) return { tipo: 'cc-block', notavel: false };   // sleep/arquivo inexistente: ja anotado (A6), so registrar
  if (/Agent stalled: no progress for \d+s|Agent .{0,40}timed out|no progress for \d+s \(stream watchdog/i.test(s)) return { tipo: 'stall', notavel: true };
  if (/API Error: (429|529)|\bHTTP\/?[0-9.]*\s?(429|529)\b|status(?: code)?[:= ]\s?(429|529)\b|rate_limit_error|overloaded_error|too many requests/i.test(s)) return { tipo: 'rate-limit', notavel: true };
  if (/Refusing to change this session/i.test(s)) return { tipo: 'effort-self', notavel: true };
  if (/FRENTES\|cheio/.test(s)) return { tipo: 'frentes-cheio', notavel: true };
  return null;
}
const resumo = (s, n = 260) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);
function textoDe(x) { if (typeof x.content === 'string') return x.content; if (Array.isArray(x.content)) return x.content.map((y) => y.text || '').join('\n'); return j(x.content || ''); }

function eventosDoTranscript(f, projeto, origem) {
  const ev = [];
  for (const l of novasLinhas(f)) {
    let o; try { o = JSON.parse(l); } catch { continue; }
    const ts = (o.timestamp || '').slice(11, 19) + 'Z';
    const c = o.message && o.message.content;
    if (o.type === 'system' && typeof o.content === 'string' && /stall|watchdog|hook|error/i.test(o.content)) ev.push({ ts, projeto, origem, tipo: 'system', notavel: /stall|watchdog/i.test(o.content), detalhe: resumo(o.content) });
    if (!Array.isArray(c)) {
      if (o.type === 'user' && typeof c === 'string' && /<task-notification>[\s\S]*<status>(failed|error)/.test(c)) ev.push({ ts, projeto, origem, tipo: 'agent-failed', notavel: true, detalhe: resumo(c, 300) });
      continue;
    }
    for (const x of c) {
      if (x.type === 'tool_result') {
        const s = textoDe(x); const cl = classifica(s, !!x.is_error);
        if (cl) ev.push({ ts, projeto, origem, tipo: cl.tipo, notavel: cl.notavel, detalhe: resumo(s, cl.notavel ? 420 : 240) });
        else if (x.is_error) ev.push({ ts, projeto, origem, tipo: 'tool-error', notavel: false, detalhe: resumo(s, 200) });
      }
      if (x.type === 'text' && o.type === 'user' && /<task-notification>[\s\S]*<status>(failed|error)/.test(x.text || '')) ev.push({ ts, projeto, origem, tipo: 'agent-failed', notavel: true, detalhe: resumo(x.text, 300) });
      if (x.type === 'tool_use' && (x.name === 'Agent' || x.name === 'Task')) ev.push({ ts, projeto, origem, tipo: 'despacho', notavel: false, detalhe: `${(x.input && x.input.subagent_type) || '?'}: ${resumo((x.input && x.input.description) || '', 80)}` });
      if (x.type === 'tool_use' && x.name === 'Skill') ev.push({ ts, projeto, origem, tipo: 'skill', notavel: /exec/.test((x.input && x.input.skill) || ''), detalhe: `${x.input && x.input.skill} ${resumo((x.input && x.input.args) || '', 80)}` });
      if (x.type === 'tool_use' && x.name === 'AskUserQuestion') ev.push({ ts, projeto, origem, tipo: 'pergunta', notavel: true, detalhe: resumo(((x.input && x.input.questions) || []).map((q) => q.question).join(' | '), 200) });
      if (x.type === 'tool_use' && /set_session_effort/.test(x.name || '')) ev.push({ ts, projeto, origem, tipo: 'effort-self', notavel: true, detalhe: `chamou ${x.name} ${j(x.input)}` });
    }
  }
  return ev;
}

function ciclo() {
  const ev = []; const agora = Date.now();
  // frentes globais
  const fr = {}; try { for (const f of fs.readdirSync(path.join(HOME, '.harness-run', 'frentes'))) { const o = lerJson(path.join(HOME, '.harness-run', 'frentes', f), null); if (o) fr[o.label] = o.projeto; } } catch {}
  for (const k of Object.keys(fr)) if (!state.frentes[k]) ev.push({ ts: hh(), projeto: fr[k], origem: 'frentes', tipo: 'frente-aberta', notavel: false, detalhe: k });
  for (const k of Object.keys(state.frentes)) if (!fr[k]) ev.push({ ts: hh(), projeto: state.frentes[k], origem: 'frentes', tipo: 'frente-liberada', notavel: true, detalhe: `${k} liberou o semaforo (exec terminou ou stop rodou)` });
  state.frentes = fr;

  for (const p of PROJETOS) {
    const root = path.join(BASE, p.nome); const run = path.join(root, '.claude', '.harness-run');
    const pdir = path.join(PROJ_DIR, slug(p.nome));
    // transcripts recentes (sessao + subagentes)
    let sessoes = []; try { sessoes = fs.readdirSync(pdir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(pdir, f)).filter((f) => mtime(f) > agora - JANELA_H * 3600e3); } catch {}
    for (const s of sessoes) {
      ev.push(...eventosDoTranscript(s, p.nome, 'sessao'));
      const sub = s.replace(/\.jsonl$/, '') + path.sep + 'subagents';
      try { for (const a of fs.readdirSync(sub).filter((f) => /^agent-.*\.jsonl$/.test(f))) { const af = path.join(sub, a); if (mtime(af) > agora - JANELA_H * 3600e3) ev.push(...eventosDoTranscript(af, p.nome, a.replace(/^agent-|\.jsonl$/g, '').slice(0, 8))); } } catch {}
    }
    // .harness-run jsonl
    for (const l of novasLinhas(path.join(run, 'permission-waits.jsonl'))) { const o = lerJson_(l); if (!o) continue; ev.push({ ts: hh(new Date(o.ts * 1000)), projeto: p.nome, origem: 'permission-waits', tipo: o.type === 'denied' ? 'classificador-negou' : 'espera-humana', notavel: o.type === 'denied', detalhe: resumo(o.detail || o.message || '', 160) + (o.tool ? ` [${o.tool}]` : '') }); }
    for (const l of novasLinhas(path.join(run, 'metrics-auto.log'))) ev.push({ ts: hh(), projeto: p.nome, origem: 'metrics-auto', tipo: 'metrics-auto-' + (l.split('|')[1] || '?'), notavel: /corrigiu-prompt|start-falhou|substituiu-velho/.test(l), detalhe: resumo(l, 160) });
    for (const l of novasLinhas(path.join(run, 'harness-incidentes.jsonl'))) ev.push({ ts: hh(), projeto: p.nome, origem: 'harness-incidentes', tipo: 'incidente-declarado', notavel: true, detalhe: resumo(l, 400) });
    for (const l of novasLinhas(path.join(run, 'tasks-ultimas.jsonl'))) { const o = lerJson_(l); if (!o) continue; ev.push({ ts: hh(new Date(o.ts * 1000)), projeto: p.nome, origem: 'tasks', tipo: 'agente-terminou', notavel: /❌/.test(o.status || ''), detalhe: `${o.papel} ${o.rotulo} ${o.modelo} ${Math.round(o.dur_s / 60)}min turnos=${o.turnos} status=${o.status || '-'} thinking=${o.thinking_pct}% out=${o.tokens_out}` }); }
    for (const l of novasLinhas(path.join(run, 'playwright.jsonl'))) { const o = lerJson_(l) || {}; ev.push({ ts: hh(), projeto: p.nome, origem: 'guard-playwright', tipo: 'playwright-negado-' + (o.regra || '?'), notavel: o.regra === 'teto', detalhe: `${o.papel} ${o.rotulo} n=${o.n}/${o.teto}: ${resumo(o.cmd, 160)}` }); }
    // incidentes versionados
    const incd = path.join(root, 'prds', '_metrics', 'incidentes');
    try { for (const f of fs.readdirSync(incd).filter((f) => f.endsWith('.jsonl'))) { let leituras = 0; for (const l of novasLinhas(path.join(incd, f))) { const o = lerJson_(l); if (!o) continue; if (o.tipo === 'leitura') { leituras++; continue; } ev.push({ ts: hh(new Date(o.ts * 1000)), projeto: p.nome, origem: 'incidentes', tipo: 'incidente-' + o.tipo, notavel: !/^(playwright|leitura|task_grande|relatorio)$/.test(o.tipo), detalhe: `${o.papel} ${o.rotulo} ${o.agent}: ${o.detalhe}` }); } if (leituras) ev.push({ ts: hh(), projeto: p.nome, origem: 'incidentes', tipo: 'leitura-via-bash', notavel: false, detalhe: `${leituras} negacao(oes) GUARDA 0 (subagente lendo via Bash)` }); } } catch {}
    // estado de exec
    let est = {}; try { for (const f of fs.readdirSync(run).filter((f) => /-exec\.json$|-fase[12]\.json$|^_auto-.*\.json$/.test(f))) est[f] = lerJson(path.join(run, f), {}).start || 0; } catch {}
    const ant = state.execState[p.nome] || {};
    for (const k of Object.keys(est)) if (!(k in ant)) ev.push({ ts: hh(), projeto: p.nome, origem: 'exec', tipo: 'cronometro-ligado', notavel: false, detalhe: `${k} start=${est[k] ? hh(new Date(est[k] * 1000)) : '?'}` });
    for (const k of Object.keys(ant)) if (!(k in est)) {
      let linha = ''; try { const rd = path.join(root, 'prds', '_metrics', 'runs'); for (const f of fs.readdirSync(rd)) { const ls = fs.readFileSync(path.join(rd, f), 'utf8').trim().split('\n'); const o = lerJson_(ls[ls.length - 1]); if (o && o.label === k.replace(/\.json$/, '') && (o.ts_end || 0) * 1000 > agora - 900e3) linha = ` · runs: ${Math.round((o.elapsed_s || 0) / 60)}min ativo=${Math.round((o.elapsed_active_s || 0) / 60)}min tasks=${o.tasks} ciclos=${o.ciclos} subagentes=${o.subagents} paralelismo=${o.parallel_factor} out=${o.tokens_output} thinking_sub=${o.tokens_thinking_pct_subagents}% esforco=${o.esforco}`; } } catch {}
      ev.push({ ts: hh(), projeto: p.nome, origem: 'exec', tipo: 'exec-terminou', notavel: true, detalhe: `${k} removido (stop rodou)${linha}` });
    }
    state.execState[p.nome] = est;
    // sessao parada?
    const ult = Math.max(0, ...sessoes.map(mtime)); const paradaMin = ult ? Math.round((agora - ult) / 60e3) : null;
    if (paradaMin !== null && paradaMin >= 30 && Object.keys(est).length && !(state.avisoParada || {})[p.nome]) { state.avisoParada = state.avisoParada || {}; state.avisoParada[p.nome] = agora; ev.push({ ts: hh(), projeto: p.nome, origem: 'sessao', tipo: 'sessao-parada', notavel: true, detalhe: `transcript sem escrita ha ${paradaMin} min com cronometro ligado (${Object.keys(est).join(',')})` }); }
    if (paradaMin !== null && paradaMin < 5 && state.avisoParada && state.avisoParada[p.nome]) delete state.avisoParada[p.nome];
  }
  // sonda de spawn (MSYS) + processos
  let spawnMs = -1; try { const t0 = Date.now(); spawnSync('C:\\Program Files\\Git\\usr\\bin\\bash.exe', ['-c', 'true'], { timeout: 60000 }); spawnMs = Date.now() - t0; } catch {}
  let procs = ''; try { const r = spawnSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 30000 }); const cnt = {}; for (const l of (r.stdout || '').split('\n')) { const m = l.match(/^"([^"]+)"/); if (m && /^(bash|node|claude|php|mysqld|chrome|msedge)\.exe$/i.test(m[1])) cnt[m[1].toLowerCase()] = (cnt[m[1].toLowerCase()] || 0) + 1; } procs = Object.entries(cnt).map(([k, v]) => `${k.replace('.exe', '')}=${v}`).join(' '); } catch {}
  ev.push({ ts: hh(), projeto: 'maquina', origem: 'sonda', tipo: spawnMs > 2000 ? 'spawn-lento' : 'spawn', notavel: spawnMs > 2000 && !(state.ultSpawnLento && state.ultSpawnLento > agora - 20 * 60e3), detalhe: `bash -c true = ${spawnMs} ms · ${procs}` });
  if (spawnMs > 2000) state.ultSpawnLento = agora;
  return ev;
}
function lerJson_(l) { try { return JSON.parse(l); } catch { return null; } }

function persistir(ev) {
  fs.writeFileSync(STATE_F, j(state));
  if (!ev.length) return;
  fs.appendFileSync(EVENTOS_JSONL, ev.map((e) => j({ ...e, gravado: new Date().toISOString() })).join('\n') + '\n');
  // linha do tempo no .md (so o que interessa ao humano)
  const publica = ev.filter((e) => e.notavel || /agente-terminou|espera-humana|exec-terminou|cronometro-ligado|leitura-via-bash|despacho|pergunta|carga|frente-|skill|esforco|gate|seq|metrics-auto|sessao-parada|sintaxe|conflito|catalogo|lock-livre|delegacoes|playwright|incidente/.test(e.tipo));
  if (!publica.length || !fs.existsSync(NOTA_MD)) return;
  const linhas = publica.map((e) => `- ${e.ts} · \`${e.projeto}\`${e.origem && e.origem !== 'sessao' ? ` · ${e.origem}` : ''} · **${e.tipo}**${e.notavel ? ' ⚠️' : ''} — ${e.detalhe.replace(/\|/g, '¦')}`);
  let md = fs.readFileSync(NOTA_MD, 'utf8');
  if (!md.includes(MARCA)) md += `\n\n## Linha do tempo (auto)\n\n${MARCA}\n`;
  const i = md.indexOf(MARCA) + MARCA.length;
  md = md.slice(0, i) + '\n' + linhas.join('\n') + md.slice(i);
  fs.writeFileSync(NOTA_MD, md);
}

(async () => {
  const fim = Date.now() + MAX_MIN * 60e3; let ciclos = 0;
  for (;;) {
    ciclos++; const ev = ciclo(); persistir(ev);
    const not = ev.filter((e) => e.notavel);
    const info = ev.filter((e) => !e.notavel && !/^spawn$|^despacho$/.test(e.tipo));
    if (BASELINE) { console.log(`BASELINE gravada (${Object.keys(state.offsets).length} arquivos)`); return; }
    if (not.length || ONCE) {
      console.log(`CICLO ${ciclos} ${hh()} — ${not.length} notavel(is), ${info.length} info`);
      for (const e of not) console.log(`NOTAVEL ${e.ts} ${e.projeto} [${e.origem}] ${e.tipo}: ${e.detalhe}`);
      for (const e of info) console.log(`info    ${e.ts} ${e.projeto} [${e.origem}] ${e.tipo}: ${e.detalhe}`);
      const sp = ev.find((e) => e.origem === 'sonda'); if (sp) console.log(`sonda   ${sp.detalhe}`);
      return;
    }
    if (info.length) { for (const e of info) console.log(`info    ${e.ts} ${e.projeto} [${e.origem}] ${e.tipo}: ${e.detalhe}`); }
    if (Date.now() >= fim) { console.log(`HEARTBEAT ${hh()} — ${ciclos} ciclos, sem evento notavel. frentes=${j(state.frentes)}`); return; }
    await new Promise((r) => setTimeout(r, INTERVALO_S * 1000));
  }
})();
