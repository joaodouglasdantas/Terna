#!/usr/bin/env node
// .claude/hooks/harness-dashboard.mjs (3.1.0)
// AGREGADOR DETERMINISTICO da telemetria do harness — o motor do /harness-report.
// Le os prds/_metrics/harness-runs.jsonl (+ harness-delegations.jsonl) do projeto atual ou de
// TODOS os projetos irmaos, deduplica, aplica as regras de confiabilidade do
// PLAYBOOK-TELEMETRIA e da skill /harness-report (mediana, fronteira de schema, gap > 30 min
// descarta duracao, custo real = principal + subagentes, executor nunca somado), cruza com os
// transcripts do Claude Code (~/.claude/projects) para medir POR AGENTE / POR MODELO — o que a
// linha do jsonl NAO grava — e emite um HTML auto-contido (graficos SVG inline, sem libs,
// claro/escuro) + um JSON com os mesmos numeros (a skill le o JSON e escreve a narrativa).
//
// Por que existe (3.1.0): ate a 3.0.x a agregacao do /harness-report era feita "na mao" pelo
// modelo a cada rodada — cara, lenta e nao reprodutivel; e "qual agente esta lento?" nao tinha
// resposta, porque a telemetria por execucao nao carrega nada por agente. O transcript carrega:
// cada tool_use Agent (subagent_type) -> toolUseResult.agentId -> <sessao>/subagents/agent-<id>
// .jsonl (janela + tokens). Medido em 2026-08: 517 subagentes casados em 104 execucoes, 3,7 s.
//
// Node puro — SEM dependencias. Read-only sobre os projetos: so escreve em --out.
//
// Uso:
//   node .claude/hooks/harness-dashboard.mjs [--all] [--periodo=30d | --de=AAAA-MM-DD --ate=AAAA-MM-DD]
//        [--base=<pasta-pai-dos-projetos>] [--out=<dir>] [--sem-transcripts] [--projeto=<nome>]
//   sem --all  : so o projeto atual (cwd) — equivale a --projeto=<basename do cwd>
//   --all      : todos os irmaos sob --base (default: pai do cwd, ou HARNESS_DASHBOARD_BASE)
//   --out      : default prds/_metrics/ do cwd se existir, senao o cwd
//   Le .claude/harness.env do cwd (HARNESS_DASHBOARD_BASE, HARNESS_DASHBOARD_TRANSCRIPTS);
//   variavel de ambiente do processo tem prioridade sobre o arquivo.
//   Saida: harness-dashboard-<de>_<ate>.html + .json; 1 linha no stdout com o resumo.
//
// 3.4.23 (Onda B, itens 15/17/11e): projeto normalizado (worktree <nome>--wt-<x> entra em <nome>
// com rotulo worktree=<x>), dedup tambem por label + ts_end ± 60 s, runs > 12 h em "suspeitas" (fora
// de toda mediana), secao por DEV/MAQUINA e por VERSAO (campos estruturados modo/review_modo/codex/
// spawn_ms/perguntas...), INCIDENTES (prds/_metrics/incidentes/), COBERTURA e frescor por repo/dev
// no --all (+ linha COBERTURA|... no stdout), custo por diff aplicado no duelo, tree_tocado=SIM
// vira "investigar". Knobs: HARNESS_DASHBOARD_SUSPEITA_H, _DEDUP_S, _COBERTURA, _ABERTA_H.
//
// Regras herdadas (nao mexer sem atualizar a skill /harness-report):
//   - dedup por (label, ts_start, ts_end, tokens_output, elapsed_s); dono = arquivo mais longo
//   - MEDIANA, nunca media
//   - duracao confiavel: wait_gap_threshold_min presente -> elapsed_active_s; senao
//     max_gap_min <= 30 -> elapsed_active_s||elapsed_s; senao n/d (fora das medianas)
//   - custo real = tokens_output + tokens_output_subagents (linha antiga = subestimada, n/d)
//   - MOCKUP-* fora das medianas de PRD; campos vazios = n/d, nunca zero
//   - por-executor separado (delegacoes Codex NUNCA somadas com Claude)

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------- args + harness.env
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const CWD = process.cwd();
// 3.5.7: camadas (_defaults.env -> harness.env -> .local -> ~/.local; ambiente vence) pelo carregador unico
const { loadHarnessEnv } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'presence.mjs')).href);
const ENV_CFG = loadHarnessEnv(join(CWD, '.claude'));
const cfg = k => ENV_CFG[k] ?? '';
const BASE = resolve(args.base || cfg('HARNESS_DASHBOARD_BASE') || join(CWD, '..'));
const OUT = resolve(args.out || (existsSync(join(CWD, 'prds')) ? join(CWD, 'prds', '_metrics') : CWD));
const HOJE = new Date();
const ate = args.ate ? new Date(args.ate + 'T23:59:59') : HOJE;
const periodoDias = (() => { const m = String(args.periodo || '').match(/^(\d+)d?$/); return m ? Number(m[1]) : 30; })();
const de = args.de ? new Date(args.de + 'T00:00:00') : new Date(ate.getTime() - periodoDias * 864e5);
// 3.5.0: fim da janela arredondado para CIMA — evento gravado no mesmo segundo em que o painel roda (ts com ms)
// ficava fora por 300 ms (medido na suite t-350-telemetria: duelo escrito e lido no mesmo segundo sumia).
const DE_S = Math.floor(de.getTime() / 1000), ATE_S = Math.ceil(ate.getTime() / 1000);
const JANELA_S = ATE_S - DE_S;
const SEM_TRANSCRIPTS = !!args['sem-transcripts'] || cfg('HARNESS_DASHBOARD_TRANSCRIPTS') === '0';
const SO_PROJETO = args.projeto || (args.all ? null : basename(CWD));

// ---------------------------------------------------------------- utils
const num = v => (v === '' || v == null) ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const mediana = arr => { const a = arr.filter(x => x != null).sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const p90 = arr => { const a = arr.filter(x => x != null).sort((x, y) => x - y); if (!a.length) return null; return a[Math.min(a.length - 1, Math.floor(a.length * 0.9))]; };
const soma = arr => arr.reduce((s, x) => s + (x || 0), 0);
const fmtDur = s => { if (s == null) return 'n/d'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`; };
const fmtK = n => { if (n == null) return 'n/d'; if (n >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + 'M'; if (n >= 1e3) return Math.round(n / 1e3) + 'k'; return String(n); };
const fmtN = n => n == null ? 'n/d' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtData = ts => { const d = new Date(ts * 1000); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmtDataFull = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const grupoDe = label => /MOCKUP-/i.test(label) ? 'mockup' : /-fase1/i.test(label) ? 'criacao-f1' : /-fase2/i.test(label) ? 'criacao-f2' : /-exec/i.test(label) ? 'execucao' : /^LOTE-/i.test(label) ? 'lote' : /^DT-SWEEP-/i.test(label) ? 'sweep' : /^DT-d+-registro/i.test(label) ? 'dt' : 'outros';
const GRUPOS = ['criacao-f1', 'criacao-f2', 'execucao', 'lote', 'sweep', 'dt', 'outros', 'mockup'];
const NOME_GRUPO = { 'criacao-f1': 'Criação — fase 1', 'criacao-f2': 'Criação — fase 2', execucao: 'Execução (/prd-exec)', lote: 'Lote (/dt-exec)', sweep: 'Saneamento (/dt-sweep)', dt: 'Registro de DT (/dt)', outros: 'Outros', mockup: 'Mockup' };

// ---------------------------------------------------------------- 1) coleta + dedup
function lerJsonl(p) { try { return readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}
// 3.4.23 (item 15a): PROJETO NORMALIZADO. Um worktree do harness vive em <nome>--wt-<x> (pasta
// irma) e a linha gravada la carrega projeto:"<nome>--wt-<x>" — ao voltar por merge para o repo
// principal, "projeto !== pasta" a descartava (as 3 execs mais pesadas de 03-04/09 nao existiam no
// painel); e a pasta do worktree, se ainda existir, virava um "projeto" a parte. Agora a linha
// entra no projeto <nome> com o rotulo worktree=<x>, tanto em runs/ quanto em tasks/ e incidentes/.
const normProj = s => String(s || '').replace(/--wt-.+$/, '');
const wtDe = s => (String(s || '').match(/--wt-(.+)$/) || [])[1] || '';
const SUSPEITA_S = (Number(cfg('HARNESS_DASHBOARD_SUSPEITA_H')) || 12) * 3600;
const DEDUP_S = Number(cfg('HARNESS_DASHBOARD_DEDUP_S') || 60);
const projetosMap = new Map();
let pastasLidas = [];
try { pastasLidas = readdirSync(BASE); } catch { pastasLidas = []; }
for (const d of pastasLidas) {
  const nome = normProj(d);
  if (SO_PROJETO && nome !== normProj(SO_PROJETO)) continue;
  const f = join(BASE, d, 'prds', '_metrics', 'harness-runs.jsonl');
  const dele = join(BASE, d, 'prds', '_metrics', 'harness-delegations.jsonl');
  const duel = join(BASE, d, 'prds', '_metrics', 'harness-duelos.jsonl');
  const pertence = o => !o.projeto || normProj(o.projeto) === nome;
  const comWt = (o, arq) => ({ ...o, _worktree: o.worktree || wtDe(o.projeto) || wtDe(d) || (String(arq || '').match(/~([^.]+)\.jsonl$/) || [])[1] || '' });
  // 3.2.2: alem do historico LOCAL, le os arquivos VERSIONADOS por dev/maquina em
  // prds/_metrics/runs/*.jsonl (e onde a telemetria da equipe chega via git). Linha
  // com campo "projeto" de OUTRO projeto e linhagem de clone (viajou no merge) — fora.
  const runsDir = join(BASE, d, 'prds', '_metrics', 'runs');
  let versionadas = [];
  try { for (const r of readdirSync(runsDir)) if (r.endsWith('.jsonl')) versionadas.push(...lerJsonl(join(runsDir, r)).map(o => comWt({ ...o, _autor: o.autor || '', _maquina: o.maquina || r.replace(/~.*$/, '').replace(/\.jsonl$/, '') }, r))); } catch {}
  // 3.4.22 (item 8): telemetria POR TASK do SubagentStop — prds/_metrics/tasks/<dev>@<host>.jsonl
  const tasksDir = join(BASE, d, 'prds', '_metrics', 'tasks');
  let tarefas = [];
  try { for (const r of readdirSync(tasksDir)) if (r.endsWith('.jsonl')) tarefas.push(...lerJsonl(join(tasksDir, r)).filter(pertence).map(o => comWt(o, r))); } catch {}
  // 3.4.23 (item 15g): incidentes com schema unico — prds/_metrics/incidentes/<dev>@<host>.jsonl
  const incDir = join(BASE, d, 'prds', '_metrics', 'incidentes');
  let incidentes = [];
  try { for (const r of readdirSync(incDir)) if (r.endsWith('.jsonl')) incidentes.push(...lerJsonl(join(incDir, r)).filter(pertence).map(o => comWt(o, r))); } catch {}
  // 3.5.0: delegacoes e duelos tambem POR DEV/MAQUINA (delegations/<dev>@<host>.jsonl, duelos/<dev>@<host>.jsonl) —
  // o arquivo compartilhado conflitava no merge entre devs; o painel le os dois formatos (o legado fica como historico).
  // Lidos ANTES do `continue`: projeto que so tem estas series (sem run/task/incidente) tambem entra no painel.
  let deleDev = [], duelDev = [];
  try { for (const r of readdirSync(join(BASE, d, 'prds', '_metrics', 'delegations'))) if (r.endsWith('.jsonl')) deleDev.push(...lerJsonl(join(BASE, d, 'prds', '_metrics', 'delegations', r))); } catch {}
  try { for (const r of readdirSync(join(BASE, d, 'prds', '_metrics', 'duelos'))) if (r.endsWith('.jsonl')) duelDev.push(...lerJsonl(join(BASE, d, 'prds', '_metrics', 'duelos', r))); } catch {}
  if (!existsSync(f) && !versionadas.length && !existsSync(dele) && !existsSync(duel) && !tarefas.length && !incidentes.length && !deleDev.length && !duelDev.length) continue;
  const linhas = [...(existsSync(f) ? lerJsonl(f) : []).map(o => comWt(o, '')), ...versionadas].filter(pertence);
  const p = projetosMap.get(nome) || { nome, dir: join(BASE, nome), linhas: [], delegacoes: [], duelos: [], tarefas: [], incidentes: [], pastas: [] };
  p.pastas.push(d);
  p.linhas.push(...linhas); p.tarefas.push(...tarefas); p.incidentes.push(...incidentes);
  if (existsSync(dele)) p.delegacoes.push(...lerJsonl(dele));
  if (existsSync(duel)) p.duelos.push(...lerJsonl(duel));
  p.delegacoes.push(...deleDev); p.duelos.push(...duelDev);   // 3.5.0: series por dev/maquina (lidas acima)
  projetosMap.set(nome, p);
}
const projetos = [...projetosMap.values()];
if (!projetos.length && !args.all) { console.log(SO_PROJETO ? `sem historico de telemetria em ${SO_PROJETO} (prds/_metrics/harness-runs.jsonl ausente) — use --all para os projetos irmaos` : `nenhum prds/_metrics/harness-runs.jsonl sob ${BASE}`); process.exit(0); }
// dono da execucao = projeto com historico mais longo entre os que carregam a chave
const chave = o => [o.label, o.ts_start, o.ts_end, o.tokens_output, o.elapsed_s].join('|');
const donos = new Map();
for (const p of projetos.slice().sort((a, b) => b.linhas.length - a.linhas.length))
  for (const o of p.linhas) { const k = chave(o); if (!donos.has(k)) donos.set(k, p.nome); }
let brutas = 0, brutasJanela = 0;
const runs = [], runsAnt = [];
const emJanela = (o, a, b) => num(o.ts_end) != null && o.ts_end >= a && o.ts_end < b;
for (const p of projetos) for (const o of p.linhas) {
  brutas++;
  if (donos.get(chave(o)) !== p.nome) continue;
  const r = normalizar(o, p.nome);
  if (emJanela(o, DE_S, ATE_S + 1)) { runs.push(r); brutasJanela++; }
  else if (emJanela(o, DE_S - JANELA_S, DE_S)) runsAnt.push(r);
}
// dedup dentro do mesmo arquivo (retry dobrado) + 3.4.23 (item 15d): mesmo projeto + mesmo label
// com ts_end a menos de DEDUP_S (60 s) = a MESMA execucao gravada duas vezes (auto-start + start
// manual, ou harness-runs.jsonl local + runs/ versionado com ts_start divergente — Caronte
// PRD-013-fase2 2x, newportaltefnet PRD-114-b-fase2 3x). Fica a linha mais completa (maior elapsed).
function dedupProximas(rs) {
  const vistos = new Set();
  const porChave = rs.filter(r => { const k = r.projeto + '|' + r.chave; if (vistos.has(k)) return false; vistos.add(k); return true; });
  const ord = porChave.slice().sort((a, b) => (b.elapsed || 0) - (a.elapsed || 0));
  const mantidas = [];
  for (const r of ord) {
    if (mantidas.some(m => m.projeto === r.projeto && m.label === r.label && r.ts_end != null && m.ts_end != null && Math.abs(m.ts_end - r.ts_end) <= DEDUP_S)) continue;
    mantidas.push(r);
  }
  return mantidas.sort((a, b) => (a.ts_end || 0) - (b.ts_end || 0));
}
const runsDedup = dedupProximas(runs);
const removidas = runs.length - runsDedup.length;
// 3.4.23 (item 15c): run com elapsed_s > 12 h e SUSPEITA (marcador esquecido, sessao aberta por dias —
// 7 runs de ate 21.901 min entravam nas medianas em 04/09): fora de mediana/p90/topCaras/alertas,
// listada na secao propria "Runs suspeitas".
const suspeitas = runsDedup.filter(r => r.elapsed != null && r.elapsed > SUSPEITA_S);
const runsU = runsDedup.filter(r => !(r.elapsed != null && r.elapsed > SUSPEITA_S));
for (const r of runsU) r.suspeita = false; for (const r of suspeitas) r.suspeita = true;

function normalizar(o, projeto) {
  const elapsed = num(o.elapsed_s), ativo = num(o.elapsed_active_s), maxGap = num(o.max_gap_min);
  const temSchema = !!o.schema, temGapThr = num(o.wait_gap_threshold_min) != null;
  let durConf = null, motivo = '';
  if (temGapThr) { durConf = ativo ?? elapsed; motivo = 'ativa (>=2.10)'; }
  else if (maxGap != null && maxGap <= 30) { durConf = ativo ?? elapsed; motivo = 'gap<=30'; }
  else if (maxGap != null) motivo = `gap ${Math.round(maxGap)}min > 30`;
  else motivo = 'sem max_gap';
  const tokOut = num(o.tokens_output), tokSub = num(o.tokens_output_subagents);
  const tokReal = tokOut == null ? null : tokOut + (tokSub || 0);
  return {
    projeto, label: o.label, grupo: grupoDe(o.label), schema: o.schema || null, platform: o.platform || 'claude',
    ts_start: num(o.ts_start), ts_end: num(o.ts_end), elapsed, ativo, durConf, motivo, maxGap,
    tasks: num(o.tasks), ciclos: num(o.ciclos), subagents: num(o.subagents), waves: num(o.waves), preset: o.preset || '', models: o.models || '',
    tokOut, tokSub, tokReal, tokIn: num(o.tokens_input), tokTotal: num(o.tokens_total),
    outTps: num(o.out_tps), outTpsAll: num(o.out_tps_all),
    waitIdle: num(o.wait_idle_min) ?? (temSchema ? null : num(o.wait_human_min)), waitGap: num(o.wait_gap_min),
    subBusy: num(o.subagent_busy_min), subMeasured: num(o.subagent_measured), parallel: num(o.parallel_factor),
    perm: num(o.permission_prompts), denials: num(o.classifier_denials), spiral: num(o.spiral_blocks),
    chave: chave(o), agentes: [], subOutTranscript: null, autor: o._autor || o.autor || '', maquina: o._maquina || o.maquina || '', harness: o.harness || '', extra: o.extra || '',
    // 3.4.23 (item 15a/15b): worktree + campos estruturados do controle da run (vazio = n/d).
    // spawn_ms cai no `spawn=<ms>` do extra (3.4.12-3.4.22) quando a linha e anterior ao campo.
    worktree: o._worktree || o.worktree || '', modo: o.modo || '', limitou: o.limitou || '', reviewModo: o.review_modo || '', codex: o.codex || '',
    stalls: num(o.stalls), tasksEst: num(o.tasks_estouradas), spawnMs: num(o.spawn_ms) ?? num((String(o.extra || '').match(/spawn[^0-9;,]{0,12}(\d+)\s*ms/i) || [])[1]),
    frentes: o.frentes || '', perguntas: num(o.perguntas), waitsInvalidas: num(o.waits_invalidas), linhasTask: num(o.linhas_por_task),
  };
}

// ---------------------------------------------------------------- 2) transcripts -> por agente
// Casa cada chamada Agent da sessao principal (tool_use -> toolUseResult.agentId) com o
// transcript do subagente (<sessao>/subagents/agent-<id>.jsonl) e atribui ao run cujo
// intervalo contem o instante do disparo. Best-effort: sem ~/.claude/projects => secao n/d.
const agentesTodos = []; let sessoesLidas = 0, agentesForaDeRun = 0;
if (!SEM_TRANSCRIPTS) {
  const projectsDir = join(homedir(), '.claude', 'projects');
  const porProjeto = new Map(); for (const r of runsU) { if (!porProjeto.has(r.projeto)) porProjeto.set(r.projeto, []); porProjeto.get(r.projeto).push(r); }
  for (const [nome, rs] of porProjeto) {
    // 3.4.23: as pastas de worktree (<nome>--wt-<x>) tem transcripts proprios — todas entram
    const pastas = (projetosMap.get(nome) || { pastas: [nome] }).pastas;
    for (const pasta of pastas) {
    const slug = join(BASE, pasta).replace(/[^a-zA-Z0-9]/g, '-');
    const dir = join(projectsDir, slug);
    if (!existsSync(dir)) continue;
    const minMs = Math.min(...rs.map(r => r.ts_start)) * 1000;
    let arquivos; try { arquivos = readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of arquivos) {
      const p = join(dir, f); let st; try { st = statSync(p); } catch { continue; }
      if (st.mtimeMs < minMs) continue;
      sessoesLidas++;
      const sessao = basename(f, '.jsonl');
      const chamadas = new Map(); // tool_use id -> {type, desc, ts}
      let text; try { text = readFileSync(p, 'utf8'); } catch { continue; }
      for (const line of text.split('\n')) {
        if (!line.includes('"Agent"') && !line.includes('toolUseResult')) continue;
        let o; try { o = JSON.parse(line); } catch { continue; }
        const c = o.message && o.message.content;
        if (o.type === 'assistant' && Array.isArray(c)) {
          for (const b of c) if (b.type === 'tool_use' && b.name === 'Agent' && b.input)
            chamadas.set(b.id, { type: b.input.subagent_type || 'general-purpose', desc: b.input.description || '', ts: Date.parse(o.timestamp) });
        } else if (o.type === 'user' && o.toolUseResult && Array.isArray(c)) {
          const r = o.toolUseResult; if (!r.agentId) continue;
          const tu = c.find(b => b.type === 'tool_result'); const ch = tu && chamadas.get(tu.tool_use_id);
          if (!ch) continue;
          agentesTodos.push({ projeto: nome, sessao, agentId: r.agentId, tipo: r.agentType || ch.type, desc: ch.desc, modelo: r.resolvedModel || '', ts: ch.ts, durS: r.totalDurationMs ? r.totalDurationMs / 1000 : null, tokOut: null, tools: r.totalToolUseCount ?? null, async: !!r.isAsync });
        }
      }
    }
    // transcript do subagente: janela + tokens
    for (const a of agentesTodos.filter(a => a.projeto === nome && !a.run && !a._semRun)) {
      const sp = join(dir, a.sessao, 'subagents', `agent-${a.agentId}.jsonl`);
      if (!existsSync(sp)) continue;
      let ini = Infinity, fim = 0, out = 0;
      for (const line of readFileSync(sp, 'utf8').split('\n')) {
        if (!line.trim()) continue; let o; try { o = JSON.parse(line); } catch { continue; }
        const t = Date.parse(o.timestamp); if (!Number.isNaN(t)) { if (t < ini) ini = t; if (t > fim) fim = t; }
        const u = o.message && o.message.usage; if (u) out += u.output_tokens || 0;
      }
      if (Number.isFinite(ini) && fim > ini) a.durS = (fim - ini) / 1000;
      a.tokOut = out;
    }
    // atribuir aos runs
    for (const a of agentesTodos.filter(a => a.projeto === nome && !a.run && !a._semRun)) {
      const run = rs.find(r => a.ts >= r.ts_start * 1000 - 60e3 && a.ts <= r.ts_end * 1000 + 60e3);
      if (!run) { agentesForaDeRun++; a._semRun = true; continue; }
      a.run = run.label; run.agentes.push(a);
    }
    }
  }
  for (const r of runsU) if (r.agentes.length) r.subOutTranscript = soma(r.agentes.map(a => a.tokOut));
}
const agentes = agentesTodos.filter(a => a.run);

// ---------------------------------------------------------------- 3) agregacoes
function agregar(rs) {
  const conf = rs.filter(r => r.durConf != null);
  return {
    n: rs.length, nConf: conf.length, nSchema: rs.filter(r => r.schema).length,
    durMed: mediana(conf.map(r => r.durConf)), durP90: p90(conf.map(r => r.durConf)),
    tokMed: mediana(rs.map(r => r.tokReal)), tokTot: soma(rs.map(r => r.tokReal)),
    ciclosMed: mediana(rs.map(r => r.ciclos)), subMed: mediana(rs.map(r => r.subagents)),
    idle: soma(rs.map(r => r.waitIdle)), denials: soma(rs.map(r => r.denials)), spiral: soma(rs.map(r => r.spiral)), perm: soma(rs.map(r => r.perm)),
    parMed: mediana(rs.map(r => r.parallel)), nPar: rs.filter(r => r.parallel != null).length,
    tpsMed: mediana(rs.map(r => r.outTpsAll ?? r.outTps)),
  };
}
const prd = runsU.filter(r => r.grupo !== 'mockup');
const porGrupo = Object.fromEntries(GRUPOS.map(g => [g, agregar(runsU.filter(r => r.grupo === g))]));
const porGrupoAnt = Object.fromEntries(GRUPOS.map(g => [g, agregar(runsAnt.filter(r => r.grupo === g))]));
const nomesProj = [...new Set(runsU.map(r => r.projeto))].sort((a, b) => runsU.filter(r => r.projeto === b).length - runsU.filter(r => r.projeto === a).length);
const porProjeto = Object.fromEntries(nomesProj.map(p => [p, agregar(runsU.filter(r => r.projeto === p))]));
const geral = agregar(prd), geralAnt = agregar(runsAnt.filter(r => r.grupo !== 'mockup'));

// por dia
const dias = []; for (let t = DE_S; t <= ATE_S; t += 86400) { const rs = runsU.filter(r => r.ts_end >= t && r.ts_end < t + 86400); dias.push({ dia: fmtData(t), n: rs.length, tokMed: mediana(rs.map(r => r.tokReal)), tokTot: soma(rs.map(r => r.tokReal)), denials: soma(rs.map(r => r.denials)) }); }

// por agente
const tipos = [...new Set(agentes.map(a => a.tipo))];
const porAgente = tipos.map(t => { const as = agentes.filter(a => a.tipo === t); const mods = {}; for (const a of as) mods[a.modelo || 'n/d'] = (mods[a.modelo || 'n/d'] || 0) + 1;
  return { tipo: t, n: as.length, durMed: mediana(as.map(a => a.durS)), durP90: p90(as.map(a => a.durS)), tokMed: mediana(as.map(a => a.tokOut)), tokTot: soma(as.map(a => a.tokOut)), modelos: mods, projetos: [...new Set(as.map(a => a.projeto))].length }; }).sort((a, b) => b.n - a.n);
const modelos = [...new Set(agentes.map(a => a.modelo || 'n/d'))];
const porModelo = modelos.map(m => { const as = agentes.filter(a => (a.modelo || 'n/d') === m); return { modelo: m, n: as.length, durMed: mediana(as.map(a => a.durS)), tokMed: mediana(as.map(a => a.tokOut)), tokTot: soma(as.map(a => a.tokOut)) }; }).sort((a, b) => b.n - a.n);
// agente x projeto (duracao mediana) — o "quem esta lento onde"
const agProj = [];
for (const ag of porAgente) for (const p of nomesProj) { const as = agentes.filter(a => a.tipo === ag.tipo && a.projeto === p); if (as.length >= 2) agProj.push({ tipo: ag.tipo, projeto: p, n: as.length, durMed: mediana(as.map(a => a.durS)), tokMed: mediana(as.map(a => a.tokOut)), ratio: ag.durMed ? mediana(as.map(a => a.durS)) / ag.durMed : null }); }

// ---------------------------------------------------------------- 2b) TASKS medidas no SubagentStop (3.4.22, item 8)
// Uma linha por subagente terminado (task-telemetry.mjs). Diferente da secao "por agente" acima
// (que depende de casar transcripts), aqui a fonte e versionada e chega da equipe pelo git.
const ENVELOPE_MIN = Number(cfg('HARNESS_TASK_PREVISAO_MAX_MIN')) || 45;
const tarefas = []; for (const p of projetos) for (const t of (p.tarefas || [])) { const ts = num(t.ts); if (ts != null && ts >= DE_S && ts <= ATE_S) tarefas.push({ ...t, projeto: p.nome }); }
const tasksPorPapel = [...new Set(tarefas.map(t => t.papel || 'n/d'))].map(pp => {
  const ts = tarefas.filter(t => (t.papel || 'n/d') === pp); const durs = ts.map(t => num(t.dur_s));
  return { papel: pp, n: ts.length, durMed: mediana(durs), durP90: p90(durs), turnosMed: mediana(ts.map(t => num(t.turnos))), bashMed: mediana(ts.map(t => num(t.bash))), readMed: mediana(ts.map(t => num(t.read))),
    acima: ts.filter(t => (num(t.dur_s) || 0) > ENVELOPE_MIN * 60).length, parciais: ts.filter(t => t.status === 'PARCIAL').length, tokOutMed: mediana(ts.map(t => num(t.tokens_out))),
    modelos: Object.entries(ts.reduce((acc, t) => (acc[t.modelo || 'n/d'] = (acc[t.modelo || 'n/d'] || 0) + 1, acc), {})).sort((a, b) => b[1] - a[1]) };
}).sort((a, b) => b.n - a.n);
const tasksAcima = tarefas.filter(t => (num(t.dur_s) || 0) > ENVELOPE_MIN * 60).sort((a, b) => num(b.dur_s) - num(a.dur_s)).slice(0, 15);

// ---------------------------------------------------------------- 2b') PLACAR INTERNO POR MODELO (3.4.25, melhoria 5)
// Decidir preset com dados: por papel x FAMILIA de modelo (sonnet/opus/haiku/fable — o `modelo` real da
// linha, ex. claude-sonnet-5, vira a familia; vazio = n/d), n, medianas de duracao/turnos/tokens_out e
// PARCIAL %. Revisores (sherlock/beholder/michelangelo) ganham 🔴 medianos e totais por CICLO — `rotulo`
// com sufixo -cN; SEM sufixo conta como c1 (o prompt nao dizia "ciclo N") — separando c1 dos demais.
// Executores (hefesto/dedalo): PARCIAL % e, quando a linha traz `verif_sem_prova` (campo novo, lido com
// tolerancia: true/1/"sim"/numero > 0 = relatorio com verificacao sem prova), o % desses relatorios.
// `abGateC1` e o comparativo A/B que o item 13 (3.4.24) pediu: beholder e michelangelo no ciclo 1,
// sonnet x opus — n, 🔴 medianos, % das criacoes (PRD) em que o c1 achou >= 1 🔴, tokens/duracao — e a
// leitura pronta em texto. A regua (PLAYBOOK) so ALERTA; a decisao e humana.
const REVISORES = ['sherlock', 'beholder', 'michelangelo'];
const EXECUTORES = ['hefesto', 'dedalo'];
const familiaModelo = m => { const s = String(m || '').trim(); if (!s) return 'n/d'; const f = (s.match(/sonnet|opus|haiku|fable/i) || [])[0]; return f ? f.toLowerCase() : s; };
const cicloDe = t => { const m = String(t.rotulo || '').match(/-c(\d+)$/); return m ? Number(m[1]) : null; };
const criacaoDe = t => `${t.projeto}|${String(t.rotulo || '').replace(/-c\d+$/, '') || ('id:' + (t.agent_id || t.ts))}`;
const pctDe = (a, b) => b ? Math.round(100 * a / b) : null;
const semProva = v => v === true || (typeof v === 'number' && v > 0) || /^(1|true|sim|yes)$/i.test(String(v ?? '')) || (/^\d+$/.test(String(v ?? '')) && Number(v) > 0);
const vermDe = arr => arr.map(t => num(t.vermelhos)).filter(v => v != null);
const placarInterno = [];
for (const papel of [...new Set(tarefas.map(t => t.papel || 'n/d'))].sort()) {
  const doPapel = tarefas.filter(t => (t.papel || 'n/d') === papel);
  for (const modelo of [...new Set(doPapel.map(t => familiaModelo(t.modelo)))].sort()) {
    const ts = doPapel.filter(t => familiaModelo(t.modelo) === modelo);
    const linha = { papel, modelo, n: ts.length, durMed: mediana(ts.map(t => num(t.dur_s))), turnosMed: mediana(ts.map(t => num(t.turnos))), tokOutMed: mediana(ts.map(t => num(t.tokens_out))), parciais: ts.filter(t => t.status === 'PARCIAL').length };
    linha.parcialPct = pctDe(linha.parciais, linha.n);
    linha.revisor = REVISORES.includes(papel); linha.executor = EXECUTORES.includes(papel);
    if (linha.revisor) {
      const c1 = ts.filter(t => (cicloDe(t) ?? 1) === 1), cN = ts.filter(t => (cicloDe(t) ?? 1) >= 2);
      const ciclo = arr => ({ n: arr.length, vermMed: mediana(vermDe(arr)), vermTot: soma(vermDe(arr)), comVermelho: arr.filter(t => (num(t.vermelhos) || 0) >= 1).length, durMed: mediana(arr.map(t => num(t.dur_s))), tokOutMed: mediana(arr.map(t => num(t.tokens_out))) });
      linha.c1 = ciclo(c1); linha.cN = ciclo(cN);
    }
    if (linha.executor) {
      const comCampo = ts.filter(t => t.verif_sem_prova !== undefined && t.verif_sem_prova !== null && t.verif_sem_prova !== '');
      linha.verifSemProva = comCampo.length ? { n: comCampo.length, sim: comCampo.filter(t => semProva(t.verif_sem_prova)).length } : null;
      linha.verifSemProvaPct = linha.verifSemProva ? pctDe(linha.verifSemProva.sim, linha.verifSemProva.n) : null;
    }
    placarInterno.push(linha);
  }
}
placarInterno.sort((a, b) => a.papel.localeCompare(b.papel) || b.n - a.n);
const fmtVerm = v => v == null ? 'n/d' : String(v).replace('.', ',');
const abGateC1 = ['beholder', 'michelangelo'].map(papel => {
  const c1 = tarefas.filter(t => t.papel === papel && (cicloDe(t) ?? 1) === 1);
  const lado = modelo => {
    const ts = c1.filter(t => familiaModelo(t.modelo) === modelo);
    const criacoes = new Map(); for (const t of ts) { const k = criacaoDe(t); criacoes.set(k, Math.max(criacoes.get(k) || 0, num(t.vermelhos) || 0)); }
    const comVermelho = [...criacoes.values()].filter(v => v >= 1).length;
    return { n: ts.length, criacoes: criacoes.size, criacoesComVermelho: comVermelho, criacoesComVermelhoPct: pctDe(comVermelho, criacoes.size), vermMed: mediana(vermDe(ts)), vermTot: soma(vermDe(ts)), durMed: mediana(ts.map(t => num(t.dur_s))), tokOutMed: mediana(ts.map(t => num(t.tokens_out))) };
  };
  const sonnet = lado('sonnet'), opus = lado('opus');
  const razao = (sonnet.vermMed != null && opus.vermMed) ? sonnet.vermMed / opus.vermMed : null;
  const amostra = sonnet.n >= 5 && opus.n >= 5;
  const reconsiderar = amostra && razao != null && razao < 0.6;
  let leitura;
  if (!sonnet.n && !opus.n) leitura = `${papel}: sem ciclo 1 medido na janela.`;
  else if (!sonnet.n || !opus.n) leitura = `${papel}: so ${sonnet.n ? 'sonnet' : 'opus'} no c1 na janela (n=${sonnet.n || opus.n}; 🔴 med ${fmtVerm(sonnet.n ? sonnet.vermMed : opus.vermMed)}) — sem par para comparar.`;
  else leitura = `${papel}: c1 em Sonnet acha ${fmtVerm(sonnet.vermMed)} 🔴 vs ${fmtVerm(opus.vermMed)} em Opus em ${sonnet.criacoes}/${opus.criacoes} criacoes (≥ 1 🔴 no c1: ${sonnet.criacoesComVermelhoPct ?? 'n/d'}% vs ${opus.criacoesComVermelhoPct ?? 'n/d'}%; duracao med ${fmtDur(sonnet.durMed)} vs ${fmtDur(opus.durMed)}; tokens out med ${fmtK(sonnet.tokOutMed)} vs ${fmtK(opus.tokOutMed)}). ` +
    (razao == null ? 'Razao n/d.' : `Razao ${Math.round(razao * 100)}% do Opus` + (!amostra ? ` — amostra curta (regua pede n ≥ 5 de cada; ha ${sonnet.n}/${opus.n}).` : reconsiderar ? ' — < 60% com n ≥ 5 de cada: RECONSIDERAR o item 13 (decisao humana).' : ' — dentro da regua (≥ 60%): o c1 em Sonnet segue.'));
  return { papel, sonnet, opus, razao: razao == null ? null : Math.round(razao * 100) / 100, amostra, reconsiderar, leitura };
});

// ---------------------------------------------------------------- 2c) POR DEV/MAQUINA e POR VERSAO (3.4.23, item 15e)
// A tabela §8.1 da ANALISE-TELEMETRIA-2026-09-04 virou secao fixa: chave = campo `maquina` (user@host)
// da linha versionada, com fallback no `autor` (git email) e, sem os dois, "n/d". Mediana por grupo
// (f1/f2/exec), prompts de permissao (total · mediana por run), negacoes do classificador, preset e
// review_modo mais usados, codex ok/indisponivel, spawn mediano, perguntas, runs suspeitas.
const maisUsado = arr => { const c = {}; for (const v of arr) if (v) c[v] = (c[v] || 0) + 1; const e = Object.entries(c).sort((a, b) => b[1] - a[1]); return e.length ? { valor: e[0][0], n: e[0][1], total: arr.filter(Boolean).length } : null; };
const versoesDe = rs => { const v = [...new Set(rs.map(r => r.harness).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); return v.length ? (v.length === 1 ? v[0] : `${v[0]}→${v[v.length - 1]}`) : 'n/d'; };
const chaveDev = r => r.maquina || r.autor || 'n/d';
function agregarDev(rs, susp) {
  const g = gr => rs.filter(r => r.grupo === gr && r.durConf != null);
  const ex = rs.filter(r => r.grupo === 'execucao');
  const codexOk = rs.filter(r => /^ok$/i.test(r.codex)).length, codexIndisp = rs.filter(r => /indispon/i.test(r.codex)).length;
  return {
    n: rs.length, versoes: versoesDe(rs), projetos: [...new Set(rs.map(r => r.projeto))],
    f1Med: mediana(g('criacao-f1').map(r => r.durConf)), f1N: g('criacao-f1').length,
    f2Med: mediana(g('criacao-f2').map(r => r.durConf)), f2N: g('criacao-f2').length,
    execMed: mediana(g('execucao').map(r => r.durConf)), execN: g('execucao').length,
    tasksExecMed: mediana(ex.map(r => r.tasks)), parExecMed: mediana(ex.map(r => r.parallel)), linhasTaskMed: mediana(rs.map(r => r.linhasTask)),
    permTot: soma(rs.map(r => r.perm)), permMed: mediana(rs.map(r => r.perm)), perguntasMed: mediana(rs.map(r => r.perguntas)), perguntasTot: soma(rs.map(r => r.perguntas)),
    denials: soma(rs.map(r => r.denials)), spiral: soma(rs.map(r => r.spiral)),
    preset: maisUsado(rs.map(r => r.preset)), reviewModo: maisUsado(rs.map(r => r.reviewModo)), modo: maisUsado(rs.map(r => r.modo)),
    codexOk, codexIndisp, spawnMed: mediana(rs.map(r => r.spawnMs)), stalls: soma(rs.map(r => r.stalls)), tasksEst: soma(rs.map(r => r.tasksEst)),
    suspeitas: susp.length, ultimo: Math.max(0, ...rs.map(r => r.ts_end || 0), ...susp.map(r => r.ts_end || 0)) || null,
    tokMed: mediana(rs.map(r => r.tokReal)), worktrees: rs.filter(r => r.worktree).length,
  };
}
const devs = [...new Set([...runsU, ...suspeitas].map(chaveDev))].sort((a, b) => runsU.filter(r => chaveDev(r) === b).length - runsU.filter(r => chaveDev(r) === a).length);
const porDev = devs.map(d => ({ dev: d, ...agregarDev(runsU.filter(r => chaveDev(r) === d), suspeitas.filter(r => chaveDev(r) === d)) }));
const versoes = [...new Set([...runsU, ...suspeitas].map(r => r.harness || 'n/d'))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const porVersao = versoes.map(v => ({ versao: v, ...agregarDev(runsU.filter(r => (r.harness || 'n/d') === v), suspeitas.filter(r => (r.harness || 'n/d') === v)), devs: [...new Set(runsU.filter(r => (r.harness || 'n/d') === v).map(chaveDev))].length }));

// ---------------------------------------------------------------- 2d) INCIDENTES (3.4.23, item 15g)
// prds/_metrics/incidentes/<dev>@<host>.jsonl — schema unico {ts,projeto,tipo,papel,rotulo,agent,detalhe}.
// Fontes: overrun (guard-agent --post), folego (guard-folego deny), frentes (semaforo cheio); 3.5.0: denied
// (classificador negou — denied.sh), stall (agente mudo — agent-stall.sh), pergunta (AskUserQuestion negada em
// modo autonomo — guard-question.sh), leitura (leitura via Bash negada — GUARDA 0 do guard-bash).
const incidentes = []; for (const p of projetos) for (const i of (p.incidentes || [])) { const ts = num(i.ts); if (ts != null && ts >= DE_S && ts <= ATE_S) incidentes.push({ ...i, projeto: p.nome }); }
const contar = (arr, f) => Object.entries(arr.reduce((acc, x) => { const k = f(x) || 'n/d'; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
const incidentesResumo = { n: incidentes.length, porTipo: contar(incidentes, i => i.tipo), porPapel: contar(incidentes, i => i.papel), porDev: contar(incidentes, i => i.maquina), porProjeto: contar(incidentes, i => i.projeto),
  ultimos: incidentes.slice().sort((a, b) => num(b.ts) - num(a.ts)).slice(0, 20) };

// ---------------------------------------------------------------- 2e) COBERTURA e FRESCOR (3.4.23, item 17) — so no --all
// Por repo: versao do .claude/harness.env, branch (.git/HEAD), ultimo run (toda a historia, nao so a
// janela), devs vistos, runs em 14 d, run ABERTA (marcador .harness-run/*-exec.json|*-fase*.json com
// start ha > ABERTA_H). Por dev: repos, ultimo run, silencio em dias, prompts/negacoes por run.
// Pasta de worktree (<nome>--wt-<x>) conta como o repo <nome>. Projeto com harness.env e ZERO runs
// aparece (e o ponto cego que o painel antigo nao mostrava — Debora em 2 repos com 9 PRDs).
const ABERTA_H = Number(cfg('HARNESS_DASHBOARD_ABERTA_H')) || 12;
const COBERTURA_ON = !!args.all && cfg('HARNESS_DASHBOARD_COBERTURA') !== '0';
function lerVersao(dir) { try { const m = readFileSync(join(dir, '.claude', 'harness.env'), 'utf8').match(/^\s*HARNESS_VERSION=['"]?([^'"\n]*)/m); return m ? m[1].trim() : ''; } catch { return ''; } }
function lerBranch(dir) {
  try {
    let g = join(dir, '.git'); const st = statSync(g);
    if (st.isFile()) { const m = readFileSync(g, 'utf8').match(/gitdir:\s*(.+)/); if (!m) return ''; g = resolve(dir, m[1].trim()); }
    const head = readFileSync(join(g, 'HEAD'), 'utf8').trim();
    const m = head.match(/^ref:\s*refs\/heads\/(.+)$/); return m ? m[1] : head.slice(0, 8);
  } catch { return ''; }
}
function runAberta(dir) {
  try {
    const rd = join(dir, '.claude', '.harness-run'); const agora = Date.now() / 1000; const out = [];
    for (const f of readdirSync(rd)) {
      if (!/-(exec|fase\d)\.json$/.test(f)) continue;
      const s = num((readFileSync(join(rd, f), 'utf8').match(/"start":\s*(\d+)/) || [])[1]);
      if (s != null && agora - s > ABERTA_H * 3600) out.push(`${f.replace(/\.json$/, '')} (${Math.round((agora - s) / 3600)} h)`);
    }
    return out;
  } catch { return []; }
}
const cobertura = { repos: [], devs: [] };
if (COBERTURA_ON) {
  const reposMap = new Map();
  for (const d of pastasLidas) {
    const dir = join(BASE, d); let st; try { st = statSync(dir); } catch { continue; }
    if (!st.isDirectory() || !existsSync(join(dir, '.claude', 'harness.env'))) continue;
    const nome = normProj(d);
    const rep = reposMap.get(nome) || { repo: nome, versao: '', branch: '', worktrees: [], abertas: [] };
    if (d === nome) { rep.versao = lerVersao(dir); rep.branch = lerBranch(dir); rep.abertas.push(...runAberta(dir)); }
    else { rep.worktrees.push(wtDe(d)); rep.abertas.push(...runAberta(dir).map(a => a + ' wt=' + wtDe(d))); if (!rep.versao) rep.versao = lerVersao(dir); }
    reposMap.set(nome, rep);
  }
  const t14 = ATE_S - 14 * 86400;
  // toda a historia do projeto, com a MESMA dedup do painel (chave exata + label/ts_end ± DEDUP_S)
  const historia = p => dedupProximas(p.linhas.filter(o => donos.get(chave(o)) === p.nome).map(o => normalizar(o, p.nome))).filter(r => r.ts_end != null).map(r => ({ ts: r.ts_end, dev: chaveDev(r) === 'n/d' ? '' : chaveDev(r), projeto: r.projeto, perm: r.perm, den: r.denials, harness: r.harness }));
  for (const rep of reposMap.values()) {
    const p = projetosMap.get(rep.repo);
    const todas = p ? historia(p) : [];
    rep.ultimoRun = todas.length ? Math.max(...todas.map(o => o.ts)) : null;
    rep.devs = [...new Set(todas.map(o => o.dev).filter(Boolean))];
    rep.runs14d = todas.filter(o => o.ts >= t14 && o.ts <= ATE_S).length;
    rep.runsTotal = todas.length;
    rep.silencioDias = rep.ultimoRun ? Math.floor((ATE_S - rep.ultimoRun) / 86400) : null;
    cobertura.repos.push(rep);
  }
  cobertura.repos.sort((a, b) => (b.runs14d - a.runs14d) || a.repo.localeCompare(b.repo));
  // por dev: toda a historia (frescor) + a janela (prompts/negacoes por run)
  const todasLinhas = []; for (const p of projetos) for (const o of historia(p)) todasLinhas.push({ ...o, dev: o.dev || 'n/d' });
  for (const dev of [...new Set(todasLinhas.map(o => o.dev))]) {
    const ls = todasLinhas.filter(o => o.dev === dev); const ultimo = Math.max(...ls.map(o => o.ts));
    const jan = runsU.filter(r => chaveDev(r) === dev);
    cobertura.devs.push({ dev, repos: [...new Set(ls.map(o => o.projeto))], runsTotal: ls.length, runs14d: ls.filter(o => o.ts >= t14 && o.ts <= ATE_S).length, ultimoRun: ultimo, silencioDias: Math.floor((ATE_S - ultimo) / 86400),
      versoes: versoesDe(ls), permPorRun: mediana(jan.map(r => r.perm)), denialsPorRun: jan.length ? Math.round((soma(jan.map(r => r.denials)) / jan.length) * 10) / 10 : null, nJanela: jan.length });
  }
  cobertura.devs.sort((a, b) => a.silencioDias - b.silencioDias);
}

// delegacoes (por executor, nunca somadas)
const delegs = []; for (const p of projetos) for (const d of p.delegacoes) { const ts = num(d.ts) ?? (d.ts ? Date.parse(d.ts) / 1000 : null); if (ts != null && ts >= DE_S && ts <= ATE_S) delegs.push({ ...d, projeto: p.nome }); }
const executores = [...new Set(delegs.map(d => d.executor || 'n/d'))].map(e => { const ds = delegs.filter(d => (d.executor || 'n/d') === e); const ok = ds.filter(d => /ok|sucesso|success/i.test(d.status || '')).length; return { executor: e, n: ds.length, ok, falha: ds.length - ok, tokOut: ds.some(d => d.tokens_fonte === 'medido') ? soma(ds.filter(d => d.tokens_fonte === 'medido').map(d => num(d.tokens_out))) : null, durMed: mediana(ds.map(d => num(d.duration_s))), treeTocado: ds.filter(d => /sim/i.test(d.tree_tocado || '')).length, papeis: Object.entries(ds.reduce((m, d) => (m[d.role || '?'] = (m[d.role || '?'] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 4) }; });

// ---------------------------------------------------------------- 3b) OpenRouter: custo POR MODELO (3.3.0)
// Tudo que passa pelo executor openrouter carrega cost_usd no manifest (dinheiro real). A
// pergunta que o Charles faz e "quanto gastei, em que, e qual modelo vale a pena" — por isso
// o corte e por modelo e por papel, nunca um total unico.
const orDelegs = delegs.filter(d => (d.executor || '') === 'openrouter');
const custoPorModelo = [...new Set(orDelegs.map(d => d.model || 'n/d'))].map(m => {
  const ds = orDelegs.filter(d => (d.model || 'n/d') === m);
  const custos = ds.map(d => num(d.cost_usd)).filter(c => c != null);
  const ok = ds.filter(d => /^ok$/i.test(d.status || '')).length;
  return { modelo: m, n: ds.length, ok, falha: ds.length - ok, custoTot: soma(custos) || 0, custoMed: mediana(custos), durMed: mediana(ds.map(d => num(d.duration_s))),
    tokIn: soma(ds.map(d => num(d.tokens_in))) || 0, tokOut: soma(ds.map(d => num(d.tokens_out))) || 0,
    papeis: Object.entries(ds.reduce((acc, d) => (acc[d.role || '?'] = (acc[d.role || '?'] || 0) + 1, acc), {})).sort((a, b) => b[1] - a[1]).slice(0, 4) };
}).sort((a, b) => b.custoTot - a.custoTot);
const custoOpenRouter = { total: soma(orDelegs.map(d => num(d.cost_usd))) || 0, n: orDelegs.length,
  porDia: Object.entries(orDelegs.reduce((acc, d) => { const k = String(d.ts || '').slice(0, 10); acc[k] = (acc[k] || 0) + (num(d.cost_usd) || 0); return acc; }, {})).sort() };

// ---------------------------------------------------------------- 3c) DUELOS: vitorias / reprovacoes POR MODELO (3.3.0)
// Eventos: duelo (2 modelos), veredito (vencedor A|B|nenhum), aplicado (ok|falhou). Merge por id.
const duelosRaw = []; for (const p of projetos) for (const e of (p.duelos || [])) { const ts = e.ts ? Date.parse(e.ts) / 1000 : null; duelosRaw.push({ ...e, projeto: p.nome, tsS: ts }); }
const duelosMap = new Map();
for (const e of duelosRaw) {
  if (e.ev === 'duelo') { if (e.tsS != null && (e.tsS < DE_S || e.tsS > ATE_S)) continue; duelosMap.set(e.id, { ...e }); }
}
for (const e of duelosRaw) { const d = duelosMap.get(e.id); if (!d) continue; if (e.ev === 'veredito') Object.assign(d, { vencedor: e.vencedor, nota_a: e.nota_a, nota_b: e.nota_b, motivo: e.motivo, juizReal: e.juiz, custo_juiz: e.custo_juiz }); if (e.ev === 'aplicado') Object.assign(d, { aplicado: e.resultado, motivoAplic: e.motivo }); }
const duelos = [...duelosMap.values()];
const modelosDuelo = [...new Set(duelos.flatMap(d => [d.modelo_a, d.modelo_b]).filter(Boolean))];
const duelosPorModelo = modelosDuelo.map(m => {
  // 3.4.24 (item 11a): no duelo SERIAL o lado B "pulado" nao foi pago nem rodou — nao conta para o modelo B
  const part = duelos.filter(d => d.modelo_a === m || (d.modelo_b === m && d.status_b !== 'pulado'));
  const lado = d => (d.modelo_a === m ? 'A' : 'B');
  const venceu = part.filter(d => d.vencedor === lado(d)).length;
  const perdeu = part.filter(d => d.vencedor && d.vencedor !== 'nenhum' && d.vencedor !== lado(d)).length;
  const reprovado = part.filter(d => d.vencedor === 'nenhum').length;
  const naoAplica = part.filter(d => (lado(d) === 'A' ? d.aplica_a : d.aplica_b) === 'nao').length;
  const falhou = part.filter(d => !/^ok$/i.test((lado(d) === 'A' ? d.status_a : d.status_b) || '')).length;
  const notas = part.map(d => num(lado(d) === 'A' ? d.nota_a : d.nota_b)).filter(x => x != null);
  const custos = part.map(d => num(lado(d) === 'A' ? d.custo_a : d.custo_b)).filter(x => x != null);
  const durs = part.map(d => num(lado(d) === 'A' ? d.dur_a : d.dur_b)).filter(x => x != null);
  const aplicOk = part.filter(d => d.vencedor === lado(d) && d.aplicado === 'ok').length;
  const aplicFalhou = part.filter(d => d.vencedor === lado(d) && d.aplicado === 'falhou').length;
  // 3.4.23 (item 11e): custo por diff APLICADO = custo total do modelo / duelos em que ele venceu E o
  // evento `aplicado` foi ok — o unico numero que diz se o duelo pagou (PRD-138: US$ 0,17 por 0 diffs).
  // "candidato a sair" = a regua do placar (>= 5 duelos e < 20% vitorias, ou > 40% inaplicavel/falho).
  const custoTot = soma(custos) || 0;
  const taxaVitoria = part.length ? venceu / part.length : null;
  const inaplicavel = part.length ? (naoAplica + falhou) / part.length : null;
  const candidatoSair = part.length >= 5 && ((taxaVitoria != null && taxaVitoria < 0.2) || (inaplicavel != null && inaplicavel > 0.4));
  return { modelo: m, duelos: part.length, venceu, perdeu, reprovado, naoAplica, falhou, notaMed: mediana(notas), custoTot, custoMed: mediana(custos), durMed: mediana(durs), aplicOk, aplicFalhou, taxaVitoria,
    custoPorAplicado: aplicOk ? custoTot / aplicOk : null, candidatoSair, motivoSair: candidatoSair ? (taxaVitoria < 0.2 ? `${Math.round(taxaVitoria * 100)}% de vitorias` : `${Math.round(inaplicavel * 100)}% inaplicavel/falho`) : '' };
}).sort((a, b) => (b.taxaVitoria || 0) - (a.taxaVitoria || 0));
const duelosResumo = { n: duelos.length, comVencedor: duelos.filter(d => d.vencedor && d.vencedor !== 'nenhum').length, reprovados: duelos.filter(d => d.vencedor === 'nenhum').length, semVeredito: duelos.filter(d => !d.vencedor).length, custoTot: soma(duelos.flatMap(d => [num(d.custo_a), num(d.custo_b), num(d.custo_juiz)]).filter(x => x != null)) || 0, juizes: Object.entries(duelos.reduce((acc, d) => (acc[d.juizReal || d.juiz || '?'] = (acc[d.juizReal || d.juiz || '?'] || 0) + 1, acc), {})) };

// ---------------------------------------------------------------- 3.6) fluxo de DTs (economia da fila, 25/08)
// Criar DT custa 30s, resolver custa 30+min — sem medir o fluxo a fila so e notada quando vira
// sweep de 98. Le o INDEX do proprio projeto (CWD): criacao = data (AAAA-MM-DD) na celula Origem;
// resolucao = data na celula Status ("Resolvido (XXX, AAAA-MM-DD)" — regra nova das skills).
const fluxoDTs = (() => {
  const p = join(CWD, 'prds', 'debito_tecnico', 'INDEX.md');
  if (!existsSync(p)) return null;
  const DATA_RE = /(\d{4}-\d{2}-\d{2})/g;
  const rows = readFileSync(p, 'utf8').split('\n')
    .map(l => l.split('|').map(c => c.trim()))
    .filter(c => c.length >= 6 && /^\[?DT-\d+/.test(c[1] || ''));
  const dias = s => { const ms = HOJE - new Date(s + 'T12:00:00'); return ms / 86400000; };
  let pend = 0, criados7 = 0, criados14 = 0, res7 = 0, res14 = 0, resSemData = 0;
  for (const c of rows) {
    const status = c[4] || '', origem = c[5] || '';
    if (/^Pendente/i.test(status)) pend++;
    const dc = [...origem.matchAll(DATA_RE)].pop();
    if (dc) { const d = dias(dc[1]); if (d >= 0 && d < 7) criados7++; else if (d >= 7 && d < 14) criados14++; }
    if (/^Resolvido/i.test(status)) {
      const dr = [...status.matchAll(DATA_RE)].pop();
      if (dr) { const d = dias(dr[1]); if (d >= 0 && d < 7) res7++; else if (d >= 7 && d < 14) res14++; }
      else resSemData++;
    }
  }
  return { total: rows.length, pendentes: pend, criados7, criados14, resolvidos7: res7, resolvidos14: res14, resolvidosSemData: resSemData };
})();

// ---------------------------------------------------------------- 4) alertas (reguas do /harness-report)
const alertas = [];
if (fluxoDTs) {
  const cap = parseInt(cfg('HARNESS_DT_WIP_MAX') || '60', 10) || 60;
  if (fluxoDTs.pendentes > cap) alertas.push({ nivel: 'laranja', tipo: 'Fila de DTs', quem: 'debito_tecnico', txt: `${fluxoDTs.pendentes} pendentes > teto ${cap} (HARNESS_DT_WIP_MAX) — guard-dt so admite Alta/bloqueante` });
  if (fluxoDTs.criados7 > fluxoDTs.resolvidos7 && fluxoDTs.criados14 > fluxoDTs.resolvidos14 && fluxoDTs.criados7 > 0)
    alertas.push({ nivel: 'vermelho', tipo: 'Fila de DTs', quem: 'debito_tecnico', txt: `enxugando gelo: criados > resolvidos ha 2 semanas (7d: +${fluxoDTs.criados7}/-${fluxoDTs.resolvidos7} · 7-14d: +${fluxoDTs.criados14}/-${fluxoDTs.resolvidos14})` });
}
for (const r of prd) {
  const g = porGrupo[r.grupo]; const id = `${r.projeto} · ${r.label}`;
  if (r.durConf != null && g.durMed && r.durConf > 2 * g.durMed && g.nConf >= 4) alertas.push({ nivel: 'vermelho', tipo: 'Duração ativa', quem: id, txt: `${fmtDur(r.durConf)} > 2× a mediana do grupo (${fmtDur(g.durMed)})` });
  if (r.ciclos != null && r.ciclos > 4) alertas.push({ nivel: 'vermelho', tipo: 'Ciclos', quem: id, txt: `${r.ciclos} ciclos de gate (régua: base+1 ≈ 4)${r.schema ? '' : ' — linha antiga pode somar gates, descontar'}` });
  if (r.parallel != null && r.subagents != null && r.subagents >= 10 && r.parallel < 1.3) alertas.push({ nivel: 'vermelho', tipo: 'Paralelismo', quem: id, txt: `fator ${r.parallel} com ${r.subagents} subagentes — execução SERIAL` });
  if (r.denials) alertas.push({ nivel: 'vermelho', tipo: 'Classificador', quem: id, txt: `${r.denials} negação(ões)${r.spiral ? ` + ${r.spiral} anti-espiral` : ''}` });
  if (r.waitIdle != null && r.waitIdle > 30) alertas.push({ nivel: 'laranja', tipo: 'Ociosidade', quem: id, txt: `${Math.round(r.waitIdle)} min ocioso (> 30)` });
  if (r.tokReal != null && g.tokMed && r.tokReal > 2 * g.tokMed && g.n >= 4) alertas.push({ nivel: 'laranja', tipo: 'Tokens', quem: id, txt: `${fmtK(r.tokReal)} > 2× a mediana do grupo (${fmtK(g.tokMed)})` });
  const tps = r.outTpsAll ?? r.outTps; const subExplica = r.subBusy != null && r.elapsed && r.subBusy * 60 >= 0.3 * r.elapsed;
  if (tps != null && tps < 30 && r.elapsed > 600 && !subExplica && r.durConf != null) alertas.push({ nivel: 'laranja', tipo: 'Throughput', quem: id, txt: `${tps} tok/s com ${fmtDur(r.elapsed)} e sem subagente explicando — espera não medida?` });
}
for (const g of GRUPOS) { const a = porGrupo[g], b = porGrupoAnt[g]; if (a.n >= 4 && b.n >= 4 && a.tokMed && b.tokMed && a.tokMed > 1.5 * b.tokMed) alertas.push({ nivel: 'laranja', tipo: 'Tendência', quem: NOME_GRUPO[g], txt: `tokens/exec mediano ${fmtK(b.tokMed)} → ${fmtK(a.tokMed)} (+${Math.round((a.tokMed / b.tokMed - 1) * 100)}%) vs janela anterior` }); if (a.nConf >= 4 && b.nConf >= 4 && a.durMed && b.durMed && a.durMed > 1.5 * b.durMed) alertas.push({ nivel: 'laranja', tipo: 'Tendência', quem: NOME_GRUPO[g], txt: `duração ativa mediana ${fmtDur(b.durMed)} → ${fmtDur(a.durMed)} vs janela anterior` }); }
for (const x of agProj) if (x.ratio != null && x.ratio >= 2 && x.n >= 3) alertas.push({ nivel: 'laranja', tipo: 'Agente lento', quem: `${x.projeto} · ${x.tipo}`, txt: `mediana ${fmtDur(x.durMed)} = ${x.ratio.toFixed(1)}× a mediana global do ${x.tipo} (n=${x.n})` });
for (const p of nomesProj) { const a = porProjeto[p]; if (a.n >= 3 && a.nSchema < a.n / 2) alertas.push({ nivel: 'laranja', tipo: 'Harness velho', quem: p, txt: `${a.n - a.nSchema} de ${a.n} execuções sem \`schema\` na janela — harness-metrics.sh anterior à 2.12.0 na maior parte do período (espera/duração ativa não confiáveis; custo de subagente n/d)` }); }
for (const m of duelosPorModelo) { if (m.duelos >= 5 && m.taxaVitoria != null && m.taxaVitoria < 0.2) alertas.push({ nivel: 'laranja', tipo: 'Duelo', quem: m.modelo, txt: `venceu ${m.venceu}/${m.duelos} duelos (< 20%) — candidato a sair do pool` }); if (m.duelos >= 5 && (m.naoAplica + m.falhou) / m.duelos > 0.4) alertas.push({ nivel: 'laranja', tipo: 'Duelo', quem: m.modelo, txt: `${m.naoAplica + m.falhou}/${m.duelos} diffs inaplicaveis ou falhos (> 40%)` }); if (m.duelos >= 3 && m.custoTot > 0 && !m.aplicOk) alertas.push({ nivel: 'laranja', tipo: 'Duelo', quem: m.modelo, txt: `US$ ${m.custoTot.toFixed(2)} em ${m.duelos} duelos e 0 diffs aplicados (custo por aplicado = n/d)` }); }
// 3.4.25 (melhoria 5): reguas do placar interno — so texto, a decisao e humana.
for (const l of placarInterno) if (l.n >= 5 && l.parcialPct != null && l.parcialPct >= 30) alertas.push({ nivel: 'laranja', tipo: 'Placar por modelo', quem: `${l.papel} · ${l.modelo}`, txt: `PARCIAL ${l.parciais}/${l.n} (${l.parcialPct}% ≥ 30% com n ≥ 5) — investigar teto/packet do papel antes de trocar de modelo` });
for (const g of abGateC1) if (g.reconsiderar) alertas.push({ nivel: 'laranja', tipo: 'Gate c1 (item 13)', quem: g.papel, txt: `c1 em Sonnet acha ${fmtVerm(g.sonnet.vermMed)} 🔴 medianos = ${Math.round(g.razao * 100)}% do Opus (${fmtVerm(g.opus.vermMed)}) com n=${g.sonnet.n}/${g.opus.n} — regua < 60%: reconsiderar o item 13 (decisao humana, nao automatica)` });
if (custoOpenRouter.total > 0) { const top = custoOpenRouter.porDia.filter(([, v]) => v >= 1.5); for (const [dia, v] of top) alertas.push({ nivel: 'laranja', tipo: 'Custo', quem: 'openrouter · ' + dia, txt: `US$ ${v.toFixed(2)} no dia (teto default 2,00)` }); }
// 3.4.23 (item 15i / 20.6): tree_tocado=SIM em delegacao read-only NAO e mais alerta vermelho — o fingerprint
// e `git status --porcelain` + `git diff HEAD --stat` e pode mudar por index refresh do proprio git (codex-cli 8,
// openrouter 7, ollama 5 na janela 29/08-04/09, sem arquivo escrito comprovado). Fica como "investigar".
for (const e of executores) { if (e.n && e.falha / e.n > 0.2) alertas.push({ nivel: 'vermelho', tipo: 'Delegação', quem: e.executor, txt: `${e.falha}/${e.n} falhas (> 20%)` }); if (e.treeTocado) alertas.push({ nivel: 'laranja', tipo: 'Delegação', quem: e.executor, txt: `${e.treeTocado} delegação(ões) read-only com tree_tocado=SIM — investigar (fingerprint = git status + diff --stat; pode ser index refresh, não escrita do worker)` }); }
// 3.4.23 (item 17): cobertura — run aberta ha > ABERTA_H e repo/dev em silencio
for (const rep of cobertura.repos) { for (const a of rep.abertas) alertas.push({ nivel: 'laranja', tipo: 'Run aberta', quem: rep.repo, txt: `marcador ${a} sem stop — a linha, quando fechar, sera suspeita (> ${ABERTA_H} h); rode o stop ou apague o marcador` }); }
for (const s of suspeitas) alertas.push({ nivel: 'laranja', tipo: 'Run suspeita', quem: `${s.projeto} · ${s.label}`, txt: `${fmtDur(s.elapsed)} de parede (> ${Math.round(SUSPEITA_S / 3600)} h) — fora das medianas; provavel marcador esquecido` });
const ordemNivel = { vermelho: 0, laranja: 1 }; alertas.sort((a, b) => ordemNivel[a.nivel] - ordemNivel[b.nivel]);
const topCaras = prd.filter(r => r.tokReal != null).sort((a, b) => b.tokReal - a.tokReal).slice(0, 10);

// ---------------------------------------------------------------- 5) HTML
const C = { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', s4: '#eda100', s5: '#e87ba4', s6: '#008300', s7: '#4a3aa7', s8: '#e34948' };
const SERIE = [C.s1, C.s2, C.s3, C.s4, C.s5, C.s6, C.s7, C.s8];
const corProj = Object.fromEntries(nomesProj.map((p, i) => [p, i < 8 ? SERIE[i] : '#898781']));

function barrasH(items, { valor, rotulo, fmt = fmtN, cor = () => 'var(--s1)', largura = 620, sub = () => '' }) {
  const max = Math.max(...items.map(valor).filter(v => v != null), 0) || 1;
  const lh = 26, h = items.length * lh + 6, lab = 210, plot = largura - lab - 90;
  let s = `<svg viewBox="0 0 ${largura} ${h}" width="100%" style="max-width:${largura}px" role="img">`;
  items.forEach((it, i) => { const v = valor(it); const w = v == null ? 0 : Math.max(2, (v / max) * plot); const y = i * lh + 4;
    s += `<text x="${lab - 8}" y="${y + 13}" text-anchor="end" class="lbl">${esc(rotulo(it))}</text>`;
    s += `<rect x="${lab}" y="${y}" width="${w}" height="16" rx="3" fill="${cor(it)}"><title>${esc(rotulo(it))}: ${esc(fmt(v))} ${esc(sub(it))}</title></rect>`;
    s += `<text x="${lab + w + 6}" y="${y + 13}" class="val">${esc(fmt(v))}${sub(it) ? ` <tspan class="mut">${esc(sub(it))}</tspan>` : ''}</text>`; });
  return s + '</svg>';
}
function barrasV(items, { valor, rotulo, fmt = fmtN, cor = 'var(--s1)', largura = 760, altura = 200 }) {
  const max = Math.max(...items.map(valor).filter(v => v != null), 0) || 1; const pad = { l: 40, r: 10, t: 14, b: 26 };
  const pw = largura - pad.l - pad.r, ph = altura - pad.t - pad.b, bw = pw / items.length;
  let s = `<svg viewBox="0 0 ${largura} ${altura}" width="100%" style="max-width:${largura}px" role="img">`;
  for (let k = 0; k <= 4; k++) { const y = pad.t + ph - (ph * k) / 4; s += `<line x1="${pad.l}" x2="${largura - pad.r}" y1="${y}" y2="${y}" class="grid"/><text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" class="tick">${esc(fmt(Math.round((max * k) / 4)))}</text>`; }
  items.forEach((it, i) => { const v = valor(it); const hh = v == null ? 0 : (v / max) * ph; const x = pad.l + i * bw + bw * 0.15, y = pad.t + ph - hh;
    s += `<rect x="${x}" y="${y}" width="${bw * 0.7}" height="${hh}" rx="3" fill="${cor}"><title>${esc(rotulo(it))}: ${esc(fmt(v))}</title></rect>`;
    if (items.length <= 20 || i % 2 === 0) s += `<text x="${x + bw * 0.35}" y="${altura - 8}" text-anchor="middle" class="tick">${esc(rotulo(it))}</text>`; });
  return s + `<line x1="${pad.l}" x2="${largura - pad.r}" y1="${pad.t + ph}" y2="${pad.t + ph}" class="axis"/></svg>`;
}
function linha(items, { valor, rotulo, fmt = fmtN, cor = 'var(--s2)', largura = 760, altura = 200 }) {
  const vals = items.map(valor); const max = Math.max(...vals.filter(v => v != null), 0) || 1; const pad = { l: 44, r: 10, t: 14, b: 26 };
  const pw = largura - pad.l - pad.r, ph = altura - pad.t - pad.b, step = pw / Math.max(1, items.length - 1);
  let s = `<svg viewBox="0 0 ${largura} ${altura}" width="100%" style="max-width:${largura}px" role="img">`;
  for (let k = 0; k <= 4; k++) { const y = pad.t + ph - (ph * k) / 4; s += `<line x1="${pad.l}" x2="${largura - pad.r}" y1="${y}" y2="${y}" class="grid"/><text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" class="tick">${esc(fmt(Math.round((max * k) / 4)))}</text>`; }
  let d = '', pts = '';
  items.forEach((it, i) => { const v = vals[i]; if (v == null) return; const x = pad.l + i * step, y = pad.t + ph - (v / max) * ph; d += (d ? 'L' : 'M') + x + ',' + y; pts += `<circle cx="${x}" cy="${y}" r="4" fill="${cor}" stroke="var(--surface)" stroke-width="2"><title>${esc(rotulo(it))}: ${esc(fmt(v))}</title></circle>`; });
  s += `<path d="${d}" fill="none" stroke="${cor}" stroke-width="2"/>${pts}`;
  items.forEach((it, i) => { if (items.length <= 20 || i % 2 === 0) s += `<text x="${pad.l + i * step}" y="${altura - 8}" text-anchor="middle" class="tick">${esc(rotulo(it))}</text>`; });
  return s + `<line x1="${pad.l}" x2="${largura - pad.r}" y1="${pad.t + ph}" y2="${pad.t + ph}" class="axis"/></svg>`;
}
const tile = (v, l, sub = '') => `<div class="tile"><div class="tv">${v}</div><div class="tl">${l}</div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`;
const delta = (a, b, fmt) => (a == null || b == null || !b) ? '' : `<span class="mut">(ant. ${fmt(b)}, ${a >= b ? '+' : ''}${Math.round((a / b - 1) * 100)}%)</span>`;
const dot = p => `<span class="dot" style="background:${corProj[p]}"></span>`;

const janelaTxt = `${fmtDataFull(de)} → ${fmtDataFull(ate)}`;
const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Harness Dashboard — ${esc(janelaTxt)}</title>
<style>
:root{color-scheme:light;--page:#f9f9f7;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--mut:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--ring:rgba(11,11,11,.10);--s1:${C.s1};--s2:${C.s2};--s3:${C.s3};--s4:${C.s4};--brand:#0e2c52;--good:#0ca30c;--warn:#fab219;--ser:#ec835a;--crit:#d03b3b}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--page:#0d0d0d;--surface:#1a1a19;--ink:#fff;--ink2:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--brand:#1ba9e2}}
:root[data-theme=dark]{color-scheme:dark;--page:#0d0d0d;--surface:#1a1a19;--ink:#fff;--ink2:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--brand:#1ba9e2}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:28px 20px 60px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:34px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--grid)}h3{font-size:14px;margin:18px 0 6px;color:var(--ink2)}
.sub{color:var(--ink2)}.mut{color:var(--mut)}.small{font-size:12px}
.card{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:16px 18px;margin:12px 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:12px;margin:14px 0}
.tile{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:14px 16px}.tv{font-size:26px;font-weight:600;letter-spacing:-.01em}.tl{color:var(--ink2);margin-top:2px}.ts{color:var(--mut);font-size:12px;margin-top:2px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:860px){.grid2{grid-template-columns:1fr}}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:6px 10px;text-align:left;border-bottom:1px solid var(--grid);white-space:nowrap}th{color:var(--ink2);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.03em}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
svg .lbl{font-size:12px;fill:var(--ink)}svg .val{font-size:12px;fill:var(--ink2)}svg .mut{fill:var(--mut)}svg .tick{font-size:11px;fill:var(--mut)}svg .grid{stroke:var(--grid);stroke-width:1}svg .axis{stroke:var(--axis)}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.al{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--grid);align-items:flex-start}.al:last-child{border:0}.badge{flex:none;font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;color:#fff}.b-vermelho{background:var(--crit)}.b-laranja{background:var(--ser)}
.note{border-left:3px solid var(--brand);padding:8px 12px;background:var(--surface);color:var(--ink2);margin:10px 0;border-radius:0 8px 8px 0}
details summary{cursor:pointer;color:var(--ink2);margin:8px 0}code{font-size:12px;background:var(--surface);border:1px solid var(--ring);padding:1px 5px;border-radius:4px}
.legend{display:flex;flex-wrap:wrap;gap:12px;margin:6px 0 10px;font-size:12px;color:var(--ink2)}
</style></head><body><main>
<h1>Harness Dashboard <span class="sub" style="font-weight:400">— ${esc(janelaTxt)}</span></h1>
<div class="sub">${runsU.length} execuções únicas · ${nomesProj.length} projetos com execução · gerado em ${fmtDataFull(HOJE)} · janela anterior: ${runsAnt.length} execuções (${fmtDataFull(new Date((DE_S - JANELA_S) * 1000))} → ${fmtDataFull(de)})</div>
<div class="note small"><b>Método:</b> ${projetos.length} projeto(s) lidos (${brutas} linhas brutas; ${brutasJanela} na janela; ${removidas} duplicata(s) removida(s) — chave exata ou mesmo label com <code>ts_end</code> a ≤ ${DEDUP_S} s; ${suspeitas.length} run(s) suspeita(s) &gt; ${Math.round(SUSPEITA_S / 3600)} h fora das medianas; worktrees <code>--wt-*</code> entram no projeto de origem). <b>Medianas, nunca médias.</b> Duração só entra na mediana quando é confiável (linha ≥ 2.10 com <code>wait_gap_threshold_min</code>, ou <code>max_gap_min ≤ 30</code>): <b>${geral.nConf} de ${geral.n}</b> execuções de PRD. Custo real = <code>tokens_output + tokens_output_subagents</code>; linha antiga (sem <code>schema</code>) subestima o custo — <b>${geral.nSchema} de ${geral.n}</b> linhas da janela têm <code>schema</code>. Mockups (${porGrupo.mockup.n}) ficam fora das medianas de PRD. Seção por agente: ${sessoesLidas} sessões lidas em <code>~/.claude/projects</code>, ${agentes.length} subagentes casados a execuções (${agentesForaDeRun} fora de execução, ignorados).</div>

<div class="tiles">
${tile(fmtN(geral.n), 'execuções de PRD/lote', delta(geral.n, geralAnt.n, fmtN))}
${tile(fmtK(geral.tokTot), 'tokens de output (real)', delta(geral.tokTot, geralAnt.tokTot, fmtK))}
${tile(fmtK(geral.tokMed), 'tokens / execução (mediana)', delta(geral.tokMed, geralAnt.tokMed, fmtK))}
${tile(fmtDur(geral.durMed), 'duração ativa mediana', `sobre ${geral.nConf} confiáveis · p90 ${fmtDur(geral.durP90)}`)}
${tile(geral.parMed == null ? 'n/d' : geral.parMed.toFixed(2), 'fator de paralelismo', `mediana sobre ${geral.nPar} · saudável ≥ 1,3`)}
${tile(fmtN(Math.round(geral.idle)), 'min ociosos somados', 'espera humana real (≥ 2.12)')}
${tile(fmtN(geral.denials), 'negações do classificador', geral.spiral ? `+ ${geral.spiral} anti-espiral` : 'zero anti-espiral')}
${tile(String(alertas.filter(a => a.nivel === 'vermelho').length), 'alertas 🔴', `${alertas.filter(a => a.nivel === 'laranja').length} 🟠`)}
</div>

<h2>Está fluindo? — por tipo de execução</h2>
<div class="card"><div class="tw"><table><thead><tr><th>Grupo</th><th class="n">n</th><th class="n">Dur. ativa med</th><th class="n">p90</th><th class="n">n confiável</th><th class="n">Ciclos med</th><th class="n">Subag. med</th><th class="n">Tokens med</th><th class="n">Tokens total</th><th class="n">tok/s med</th><th class="n">Ocioso (min)</th><th class="n">Paralelo (n)</th><th class="n">Denials</th></tr></thead><tbody>
${GRUPOS.map(g => { const a = porGrupo[g]; if (!a.n) return ''; return `<tr><td>${NOME_GRUPO[g]}</td><td class="n">${a.n}</td><td class="n">${fmtDur(a.durMed)}</td><td class="n">${fmtDur(a.durP90)}</td><td class="n">${a.nConf}/${a.n}</td><td class="n">${a.ciclosMed ?? 'n/d'}</td><td class="n">${a.subMed ?? 'n/d'}</td><td class="n">${fmtK(a.tokMed)}</td><td class="n">${fmtK(a.tokTot)}</td><td class="n">${a.tpsMed == null ? 'n/d' : Math.round(a.tpsMed)}</td><td class="n">${Math.round(a.idle)}</td><td class="n">${a.parMed == null ? 'n/d' : a.parMed.toFixed(2)} (${a.nPar})</td><td class="n">${a.denials}</td></tr>`; }).join('')}
</tbody></table></div>
<div class="grid2"><div><h3>Duração ativa mediana por grupo (só execuções confiáveis)</h3>${barrasH(GRUPOS.filter(g => porGrupo[g].nConf).map(g => ({ g, ...porGrupo[g] })), { valor: x => x.durMed, rotulo: x => NOME_GRUPO[x.g], fmt: fmtDur, sub: x => `n=${x.nConf}` })}</div>
<div><h3>Tokens de output por execução (mediana, real)</h3>${barrasH(GRUPOS.filter(g => porGrupo[g].n).map(g => ({ g, ...porGrupo[g] })), { valor: x => x.tokMed, rotulo: x => NOME_GRUPO[x.g], fmt: fmtK, cor: () => 'var(--s2)', sub: x => `n=${x.n}` })}</div></div></div>

<h3>Tendência vs janela anterior (mesmo tamanho)</h3>
<div class="card"><div class="tw"><table><thead><tr><th>Grupo</th><th class="n">n ant → atual</th><th class="n">Dur. ativa med (ant → atual)</th><th class="n">Δ</th><th class="n">Tokens med (ant → atual)</th><th class="n">Δ</th></tr></thead><tbody>
${GRUPOS.map(g => { const a = porGrupo[g], b = porGrupoAnt[g]; if (!a.n && !b.n) return ''; const dd = (a.durMed && b.durMed) ? Math.round((a.durMed / b.durMed - 1) * 100) : null, dt = (a.tokMed && b.tokMed) ? Math.round((a.tokMed / b.tokMed - 1) * 100) : null; const flag = v => v == null ? 'n/d' : `${v > 0 ? '+' : ''}${v}% ${v > 50 ? '🟠' : v > 0 ? '🟡' : '✅'}`; return `<tr><td>${NOME_GRUPO[g]}</td><td class="n">${b.n} → ${a.n}</td><td class="n">${fmtDur(b.durMed)} → ${fmtDur(a.durMed)} <span class="mut">(n ${b.nConf}→${a.nConf})</span></td><td class="n">${flag(dd)}</td><td class="n">${fmtK(b.tokMed)} → ${fmtK(a.tokMed)}</td><td class="n">${flag(dt)}</td></tr>`; }).join('')}
</tbody></table></div><div class="small mut">⚠️ Duração da janela anterior pode ter menos linhas confiáveis (harness mais antigo) — compare tokens como métrica limpa.</div></div>

<h2>Curva diária</h2>
<div class="card"><div class="grid2"><div><h3>Execuções concluídas por dia</h3>${barrasV(dias, { valor: d => d.n, rotulo: d => d.dia, cor: 'var(--s1)' })}</div><div><h3>Tokens por execução (mediana do dia)</h3>${linha(dias, { valor: d => d.tokMed, rotulo: d => d.dia, fmt: fmtK, cor: 'var(--s2)' })}</div></div></div>

<h2>Algum projeto está demorando mais? — por projeto</h2>
<div class="card"><div class="tw"><table><thead><tr><th>Projeto</th><th class="n">n</th><th class="n">c/ schema</th><th class="n">Dur. ativa med (n)</th><th class="n">p90</th><th class="n">Ciclos med</th><th class="n">Tokens total</th><th class="n">Tokens med</th><th class="n">Ocioso</th><th class="n">Paralelo (n)</th><th class="n">Denials</th></tr></thead><tbody>
${nomesProj.map(p => { const a = porProjeto[p]; return `<tr><td>${dot(p)}${esc(p)}</td><td class="n">${a.n}</td><td class="n">${a.nSchema}/${a.n}${a.nSchema === 0 ? ' ⚠️' : ''}</td><td class="n">${fmtDur(a.durMed)} (${a.nConf})</td><td class="n">${fmtDur(a.durP90)}</td><td class="n">${a.ciclosMed ?? 'n/d'}</td><td class="n">${fmtK(a.tokTot)}</td><td class="n">${fmtK(a.tokMed)}</td><td class="n">${Math.round(a.idle)}</td><td class="n">${a.parMed == null ? 'n/d' : a.parMed.toFixed(2)} (${a.nPar})</td><td class="n">${a.denials}</td></tr>`; }).join('')}
</tbody></table></div>
<div class="grid2"><div><h3>Tokens de output total (real) por projeto</h3>${barrasH(nomesProj.map(p => ({ p, ...porProjeto[p] })), { valor: x => x.tokTot, rotulo: x => x.p, fmt: fmtK, cor: x => corProj[x.p], sub: x => `n=${x.n}` })}</div>
<div><h3>Duração ativa mediana por projeto (só confiáveis)</h3>${barrasH(nomesProj.filter(p => porProjeto[p].nConf).map(p => ({ p, ...porProjeto[p] })), { valor: x => x.durMed, rotulo: x => x.p, fmt: fmtDur, cor: x => corProj[x.p], sub: x => `n=${x.nConf}` })}</div></div>
<h3>Duração ativa mediana por projeto × grupo (n confiável)</h3><div class="tw"><table><thead><tr><th>Projeto</th>${GRUPOS.filter(g => porGrupo[g].n).map(g => `<th class="n">${NOME_GRUPO[g]}</th>`).join('')}</tr></thead><tbody>
${nomesProj.map(p => `<tr><td>${dot(p)}${esc(p)}</td>${GRUPOS.filter(g => porGrupo[g].n).map(g => { const a = agregar(runsU.filter(r => r.projeto === p && r.grupo === g)); return `<td class="n">${a.n ? `${fmtDur(a.durMed)} <span class="mut">(${a.nConf}/${a.n})</span>` : '—'}</td>`; }).join('')}</tr>`).join('')}
</tbody></table></div></div>

<h2>Por dev / máquina (3.4.23) — medianas ativas; runs &gt; ${Math.round(SUSPEITA_S / 3600)} h fora</h2>
<div class="card"><div class="small mut">Chave = <code>maquina</code> (user@host) da linha versionada, fallback <code>autor</code>. f1/f2/exec = duração ativa mediana do grupo (n confiável). Prompts = permissão (total · mediana por run); perguntas = <code>AskUserQuestion</code> (3.4.23, separado). Codex = runs com <code>codex=ok</code> / <code>indisponivel</code>. Spawn = mediana de <code>spawn_ms</code> (ou <code>spawn=</code> do extra). Campo vazio = n/d.</div>
<div class="tw"><table><thead><tr><th>Dev · máquina</th><th class="n">runs</th><th>versões</th><th class="n">f1</th><th class="n">f2</th><th class="n">exec (n)</th><th class="n">tasks/exec</th><th class="n">par. exec</th><th class="n">linhas/task</th><th class="n">prompts (tot · run)</th><th class="n">perguntas</th><th class="n">negações</th><th>preset</th><th>review</th><th>modo</th><th class="n">codex ok/ind.</th><th class="n">spawn</th><th class="n">stalls</th><th class="n">tasks&gt;env.</th><th class="n">suspeitas</th><th class="n">wt</th><th>projetos</th></tr></thead><tbody>
${porDev.map(d => `<tr><td><b>${esc(d.dev)}</b></td><td class="n">${d.n}</td><td class="small">${esc(d.versoes)}</td><td class="n">${d.f1N ? fmtDur(d.f1Med) : '—'}</td><td class="n">${d.f2N ? fmtDur(d.f2Med) : '—'}</td><td class="n">${d.execN ? `${fmtDur(d.execMed)} (${d.execN})` : '—'}</td><td class="n">${d.tasksExecMed ?? 'n/d'}</td><td class="n">${d.parExecMed == null ? 'n/d' : d.parExecMed.toFixed(2)}</td><td class="n">${d.linhasTaskMed ?? 'n/d'}</td><td class="n">${d.permTot} · ${d.permMed ?? 'n/d'}</td><td class="n">${d.perguntasMed ?? 'n/d'}</td><td class="n">${d.denials}${d.spiral ? ` (+${d.spiral})` : ''}</td><td class="small">${d.preset ? `${esc(d.preset.valor)} ${Math.round(d.preset.n / d.preset.total * 100)}%` : 'n/d'}</td><td class="small">${d.reviewModo ? `${esc(d.reviewModo.valor)} ${d.reviewModo.n}/${d.reviewModo.total}` : 'n/d'}</td><td class="small">${d.modo ? esc(d.modo.valor) : 'n/d'}</td><td class="n">${d.codexOk || d.codexIndisp ? `${d.codexOk} / ${d.codexIndisp}` : 'n/d'}</td><td class="n">${d.spawnMed == null ? 'n/d' : Math.round(d.spawnMed) + ' ms'}</td><td class="n">${d.stalls || ''}</td><td class="n">${d.tasksEst || ''}</td><td class="n">${d.suspeitas || ''}</td><td class="n">${d.worktrees || ''}</td><td class="small">${d.projetos.map(p => esc(p)).join(', ')}</td></tr>`).join('')}
</tbody></table></div>
<h3>Por versão do harness</h3><div class="tw"><table><thead><tr><th>Versão</th><th class="n">runs</th><th class="n">devs</th><th class="n">f1</th><th class="n">f2</th><th class="n">exec (n)</th><th class="n">tasks/exec</th><th class="n">par. exec</th><th class="n">prompts/run</th><th class="n">perguntas/run</th><th class="n">negações</th><th>preset</th><th>review</th><th class="n">spawn</th><th class="n">tokens med</th><th class="n">suspeitas</th></tr></thead><tbody>
${porVersao.map(v => `<tr><td><b>${esc(v.versao)}</b></td><td class="n">${v.n}</td><td class="n">${v.devs}</td><td class="n">${v.f1N ? fmtDur(v.f1Med) : '—'}</td><td class="n">${v.f2N ? fmtDur(v.f2Med) : '—'}</td><td class="n">${v.execN ? `${fmtDur(v.execMed)} (${v.execN})` : '—'}</td><td class="n">${v.tasksExecMed ?? 'n/d'}</td><td class="n">${v.parExecMed == null ? 'n/d' : v.parExecMed.toFixed(2)}</td><td class="n">${v.permMed ?? 'n/d'}</td><td class="n">${v.perguntasMed ?? 'n/d'}</td><td class="n">${v.denials}</td><td class="small">${v.preset ? esc(v.preset.valor) : 'n/d'}</td><td class="small">${v.reviewModo ? esc(v.reviewModo.valor) : 'n/d'}</td><td class="n">${v.spawnMed == null ? 'n/d' : Math.round(v.spawnMed) + ' ms'}</td><td class="n">${fmtK(v.tokMed)}</td><td class="n">${v.suspeitas || ''}</td></tr>`).join('')}
</tbody></table></div></div>

${suspeitas.length ? `<h2>Runs suspeitas (&gt; ${Math.round(SUSPEITA_S / 3600)} h de parede) — fora de mediana, p90 e top</h2>
<div class="card"><div class="small mut">Marcador de start esquecido, sessão aberta por dias, ou exec real de dias inteiros. Não entram em nenhuma mediana; se for exec real, o dado por task (SubagentStop) continua válido.</div><div class="tw"><table><thead><tr><th>Fim</th><th>Projeto</th><th>Label</th><th>Dev</th><th class="n">Dur. bruta</th><th class="n">Dur. ativa</th><th class="n">Tasks</th><th class="n">Subag.</th><th class="n">Tokens real</th><th>Harness</th></tr></thead><tbody>
${suspeitas.slice().sort((a, b) => b.elapsed - a.elapsed).map(r => `<tr><td>${fmtData(r.ts_end)}</td><td>${dot(r.projeto)}${esc(r.projeto)}${r.worktree ? ` <span class="mut">wt=${esc(r.worktree)}</span>` : ''}</td><td>${esc(r.label)}</td><td class="small">${esc(chaveDev(r))}</td><td class="n">${fmtDur(r.elapsed)}</td><td class="n">${fmtDur(r.ativo)}</td><td class="n">${r.tasks ?? ''}</td><td class="n">${r.subagents ?? ''}</td><td class="n">${fmtK(r.tokReal)}</td><td class="small">${esc(r.harness)}</td></tr>`).join('')}
</tbody></table></div></div>` : ''}

<h2>Algum agente/fluxo está mais lento? — por agente (medido nos transcripts)</h2>
${agentes.length ? `<div class="card"><div class="tw"><table><thead><tr><th>Agente</th><th class="n">n</th><th class="n">Projetos</th><th class="n">Dur. med</th><th class="n">p90</th><th class="n">Tokens out med</th><th class="n">Tokens out total</th><th>Modelos</th></tr></thead><tbody>
${porAgente.map(a => `<tr><td><b>${esc(a.tipo)}</b></td><td class="n">${a.n}</td><td class="n">${a.projetos}</td><td class="n">${fmtDur(a.durMed)}</td><td class="n">${fmtDur(a.durP90)}</td><td class="n">${fmtK(a.tokMed)}</td><td class="n">${fmtK(a.tokTot)}</td><td class="small">${Object.entries(a.modelos).sort((x, y) => y[1] - x[1]).map(([m, n]) => `${esc(m.replace('claude-', ''))} ${n}`).join(' · ')}</td></tr>`).join('')}
</tbody></table></div>
<div class="grid2"><div><h3>Duração mediana por agente</h3>${barrasH(porAgente, { valor: a => a.durMed, rotulo: a => a.tipo, fmt: fmtDur, cor: () => 'var(--s3)', sub: a => `n=${a.n}` })}</div>
<div><h3>Tokens de output total por agente</h3>${barrasH(porAgente, { valor: a => a.tokTot, rotulo: a => a.tipo, fmt: fmtK, cor: () => 'var(--s2)', sub: a => `med ${fmtK(a.tokMed)}` })}</div></div>
<h3>Por modelo</h3><div class="tw"><table><thead><tr><th>Modelo</th><th class="n">n</th><th class="n">Dur. med</th><th class="n">Tokens out med</th><th class="n">Tokens out total</th></tr></thead><tbody>
${porModelo.map(m => `<tr><td>${esc(m.modelo)}</td><td class="n">${m.n}</td><td class="n">${fmtDur(m.durMed)}</td><td class="n">${fmtK(m.tokMed)}</td><td class="n">${fmtK(m.tokTot)}</td></tr>`).join('')}</tbody></table></div>
<h3>Agente × projeto — onde cada agente está mais lento (razão vs mediana global do agente; ≥ 2 execuções)</h3><div class="tw"><table><thead><tr><th>Agente</th><th>Projeto</th><th class="n">n</th><th class="n">Dur. med</th><th class="n">× global</th><th class="n">Tokens out med</th></tr></thead><tbody>
${(() => { const ord = agProj.slice().sort((a, b) => (b.ratio || 0) - (a.ratio || 0)); const linhaAP = x => `<tr><td>${esc(x.tipo)}</td><td>${dot(x.projeto)}${esc(x.projeto)}</td><td class="n">${x.n}</td><td class="n">${fmtDur(x.durMed)}</td><td class="n">${x.ratio == null ? 'n/d' : x.ratio.toFixed(2) + (x.ratio >= 2 ? ' 🟠' : x.ratio <= 0.5 ? ' ⚡' : '')}</td><td class="n">${fmtK(x.tokMed)}</td></tr>`; return ord.slice(0, 12).map(linhaAP).join('') + (ord.length > 12 ? `</tbody></table><details><summary class="small">+ ${ord.length - 12} combinações agente × projeto</summary><table><tbody>${ord.slice(12).map(linhaAP).join('')}</tbody></table></details><table><tbody>` : ''); })()}
</tbody></table></div>
<div class="small mut">Duração do agente = primeiro→último timestamp do transcript do subagente (inclui espera de ferramenta/permissão dentro dele). Tokens = soma do <code>usage.output_tokens</code> do transcript. Chamada síncrona sem transcript usa <code>totalDurationMs</code>.</div></div>` : `<div class="card mut">Sem transcripts acessíveis em <code>~/.claude/projects</code> (ou <code>--sem-transcripts</code>) — seção n/d.</div>`}

${orDelegs.length ? `<h2>OpenRouter — custo por modelo (US$, dinheiro real)</h2><div class="card"><div class="small mut">Total na janela: <b>US$ ${custoOpenRouter.total.toFixed(4)}</b> em ${custoOpenRouter.n} chamada(s) · por dia: ${custoOpenRouter.porDia.map(([d, v]) => `${d} US$ ${v.toFixed(3)}`).join(' · ') || '—'}</div><div class="tw"><table><thead><tr><th>Modelo</th><th class="n">Chamadas</th><th class="n">OK</th><th class="n">Falha</th><th class="n">US$ total</th><th class="n">US$ med</th><th class="n">Tempo med</th><th class="n">Tokens in/out</th><th>Papéis</th></tr></thead><tbody>
${custoPorModelo.map(m => `<tr><td>${esc(m.modelo)}</td><td class="n">${m.n}</td><td class="n">${m.ok}</td><td class="n">${m.falha}</td><td class="n">${m.custoTot.toFixed(4)}</td><td class="n">${m.custoMed == null ? 'n/d' : m.custoMed.toFixed(4)}</td><td class="n">${m.durMed == null ? 'n/d' : Math.round(m.durMed) + 's'}</td><td class="n">${fmtK(m.tokIn)} / ${fmtK(m.tokOut)}</td><td class="small">${m.papeis.map(([r, n]) => `${esc(r)} ${n}`).join(' · ')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
${duelos.length ? `<h2>Duelos de modelos (3.3.0) — quem vence, quem reprova, quanto custa</h2><div class="card"><div class="small mut">${duelosResumo.n} duelo(s) · ${duelosResumo.comVencedor} com vencedor · ${duelosResumo.reprovados} reprovado(s) pelo juiz · ${duelosResumo.semVeredito} sem veredito · custo total (workers + juiz) <b>US$ ${duelosResumo.custoTot.toFixed(4)}</b> · juízes: ${duelosResumo.juizes.map(([j, n]) => `${esc(j)} ${n}`).join(' · ')}</div><div class="tw"><table><thead><tr><th>Modelo</th><th class="n">Duelos</th><th class="n">Venceu</th><th class="n">Perdeu</th><th class="n">Reprovado</th><th class="n">Diff inaplicável</th><th class="n">Falhou</th><th class="n">Nota med</th><th class="n">US$ med</th><th class="n">US$ total</th><th class="n">US$ / diff aplicado</th><th class="n">Tempo med</th><th class="n">Aplicado ok/falhou</th><th>Candidato a sair</th></tr></thead><tbody>
${duelosPorModelo.map(m => `<tr><td>${esc(m.modelo)}</td><td class="n">${m.duelos}</td><td class="n"><b>${m.venceu}</b> (${m.taxaVitoria == null ? '—' : Math.round(m.taxaVitoria * 100) + '%'})</td><td class="n">${m.perdeu}</td><td class="n">${m.reprovado}</td><td class="n">${m.naoAplica}</td><td class="n">${m.falhou}</td><td class="n">${m.notaMed == null ? 'n/d' : m.notaMed}</td><td class="n">${m.custoMed == null ? 'n/d' : m.custoMed.toFixed(4)}</td><td class="n">${m.custoTot.toFixed(4)}</td><td class="n">${m.custoPorAplicado == null ? (m.custoTot > 0 ? 'n/d (0 aplicados)' : 'n/d') : '<b>' + m.custoPorAplicado.toFixed(4) + '</b>'}</td><td class="n">${m.durMed == null ? 'n/d' : Math.round(m.durMed) + 's'}</td><td class="n">${m.aplicOk} / ${m.aplicFalhou}</td><td>${m.candidatoSair ? `🟠 sim — ${esc(m.motivoSair)}` : (m.duelos >= 5 ? '✅ não' : `<span class="mut">n=${m.duelos} &lt; 5</span>`)}</td></tr>`).join('')}</tbody></table></div>
<div class="small mut">Régua: modelo com &lt; 20% de vitórias em ≥ 5 duelos, ou &gt; 40% de diffs inaplicáveis, é candidato a sair do pool (<code>HARNESS_DUELO_MODELS</code>). <b>US$ / diff aplicado</b> (3.4.23, item 11e) = custo total do modelo ÷ duelos em que ele venceu <i>e</i> o diff foi aplicado com <code>ok</code> — o único número que diz se o duelo pagou. "Reprovado" = o juiz rejeitou os dois. Fonte: <code>prds/_metrics/harness-duelos.jsonl</code>.</div></div>` : ''}
${executores.length ? `<h2>Delegação externa (por executor — nunca somado com Claude)</h2><div class="card"><div class="tw"><table><thead><tr><th>Executor</th><th class="n">Delegações</th><th class="n">Sucesso</th><th class="n">Falha</th><th class="n">Tokens out</th><th class="n">Tempo med</th><th class="n">tree_tocado</th><th>Papéis</th></tr></thead><tbody>
${executores.map(e => `<tr><td>${esc(e.executor)}</td><td class="n">${e.n}</td><td class="n">${e.ok}</td><td class="n">${e.falha}</td><td class="n">${e.tokOut == null ? 'n/d' : fmtK(e.tokOut) + ' (medido)'}</td><td class="n">${e.durMed == null ? 'n/d' : Math.round(e.durMed) + 's'}</td><td class="n">${e.treeTocado}${e.treeTocado ? ' <span class="mut">investigar</span>' : ''}</td><td class="small">${e.papeis.map(([r, n]) => `${esc(r)} ${n}`).join(' · ')}</td></tr>`).join('')}</tbody></table></div>
<div class="small mut"><code>tree_tocado=SIM</code> em delegação read-only = <b>investigar</b>, não alerta (3.4.23): o fingerprint é <code>git status --porcelain</code> + <code>git diff HEAD --stat</code> e pode mudar por index refresh do próprio git, sem o worker escrever nada.</div></div>` : ''}

${incidentes.length ? `<h2>Incidentes (3.4.23) — ${incidentesResumo.n} na janela</h2>
<div class="card"><div class="small mut">Schema único em <code>prds/_metrics/incidentes/&lt;dev&gt;@&lt;host&gt;.jsonl</code>: <b>overrun</b> (guard-agent --post: task acima do teto do papel), <b>folego</b> (guard-folego negou acima do teto de chamadas), <b>frentes</b> (semáforo cheio); desde a 3.5.0 também <b>denied</b> (classificador negou), <b>stall</b> (agente vivo mudo), <b>pergunta</b> (AskUserQuestion negada em modo autônomo) e <b>leitura</b> (leitura via Bash negada — GUARDA 0).</div>
<div class="grid2"><div><h3>Por tipo</h3>${barrasH(incidentesResumo.porTipo, { valor: x => x[1], rotulo: x => x[0], cor: () => 'var(--s2)' })}</div><div><h3>Por papel</h3>${barrasH(incidentesResumo.porPapel.slice(0, 10), { valor: x => x[1], rotulo: x => x[0], cor: () => 'var(--s3)' })}</div></div>
<h3>Por dev / máquina</h3><div class="tw"><table><thead><tr><th>Dev · máquina</th><th class="n">incidentes</th>${incidentesResumo.porTipo.map(([t]) => `<th class="n">${esc(t)}</th>`).join('')}</tr></thead><tbody>
${incidentesResumo.porDev.map(([d, n]) => `<tr><td>${esc(d)}</td><td class="n">${n}</td>${incidentesResumo.porTipo.map(([t]) => `<td class="n">${incidentes.filter(i => (i.maquina || 'n/d') === d && (i.tipo || 'n/d') === t).length || ''}</td>`).join('')}</tr>`).join('')}
</tbody></table></div>
<h3>Últimos 20</h3><div class="tw"><table><thead><tr><th>Quando</th><th>Projeto</th><th>Tipo</th><th>Papel</th><th>Rótulo</th><th>Dev</th><th>Detalhe</th></tr></thead><tbody>
${incidentesResumo.ultimos.map(i => `<tr><td>${fmtData(num(i.ts))}</td><td>${dot(i.projeto)}${esc(i.projeto)}${i._worktree ? ` <span class="mut">wt=${esc(i._worktree)}</span>` : ''}</td><td><b>${esc(i.tipo)}</b></td><td>${esc(i.papel || '')}</td><td>${esc(i.rotulo || '')}</td><td class="small">${esc(i.maquina || '')}</td><td class="small">${esc(i.detalhe || '')}</td></tr>`).join('')}
</tbody></table></div></div>` : ''}

${COBERTURA_ON ? `<h2>Cobertura e frescor (3.4.23, item 17) — quem roda o quê, em que versão, há quanto tempo</h2>
<div class="card"><div class="small mut">Por repo: versão do <code>.claude/harness.env</code>, branch atual, último run (toda a história), devs vistos nas linhas, runs em 14 d e marcador de run ABERTA (<code>.harness-run/*-exec.json|*-fase*.json</code> com start há &gt; ${ABERTA_H} h). Repo com harness e zero runs é o ponto cego. Linha <code>COBERTURA|…</code> no stdout para o <code>/prometeu --check</code>.</div>
<div class="tw"><table><thead><tr><th>Repo</th><th>Versão</th><th>Branch</th><th>Último run</th><th class="n">Silêncio (d)</th><th>Devs</th><th class="n">Runs 14 d</th><th class="n">Total</th><th>Worktrees</th><th>Run aberta</th></tr></thead><tbody>
${cobertura.repos.map(r => `<tr><td><b>${esc(r.repo)}</b></td><td>${esc(r.versao || 'n/d')}</td><td class="small">${esc(r.branch || 'n/d')}</td><td>${r.ultimoRun ? fmtDataFull(new Date(r.ultimoRun * 1000)) : '<span class="mut">nunca</span>'}</td><td class="n">${r.silencioDias ?? '—'}${r.silencioDias != null && r.silencioDias > 14 ? ' 🟠' : ''}</td><td class="small">${r.devs.map(esc).join(', ') || '<span class="mut">nenhum</span>'}</td><td class="n">${r.runs14d}</td><td class="n">${r.runsTotal}</td><td class="small">${r.worktrees.map(esc).join(', ')}</td><td class="small">${r.abertas.length ? '🟠 ' + r.abertas.map(esc).join('; ') : ''}</td></tr>`).join('')}
</tbody></table></div>
<h3>Por dev</h3><div class="tw"><table><thead><tr><th>Dev · máquina</th><th>Repos</th><th class="n">Runs total</th><th class="n">Runs 14 d</th><th>Último run</th><th class="n">Silêncio (d)</th><th>Versões</th><th class="n">Prompts/run (janela)</th><th class="n">Negações/run (janela)</th></tr></thead><tbody>
${cobertura.devs.map(d => `<tr><td><b>${esc(d.dev)}</b></td><td class="small">${d.repos.map(esc).join(', ')}</td><td class="n">${d.runsTotal}</td><td class="n">${d.runs14d}</td><td>${fmtDataFull(new Date(d.ultimoRun * 1000))}</td><td class="n">${d.silencioDias}${d.silencioDias > 14 ? ' 🟠' : ''}</td><td class="small">${esc(d.versoes)}</td><td class="n">${d.permPorRun ?? 'n/d'}</td><td class="n">${d.denialsPorRun ?? 'n/d'}</td></tr>`).join('')}
</tbody></table></div></div>` : ''}

${fluxoDTs ? `<h2>Fila de débitos técnicos — está enxugando gelo?</h2><div class="card"><div class="small">Pendentes: <b>${fluxoDTs.pendentes}</b> de ${fluxoDTs.total} · últimos 7 dias: <b>+${fluxoDTs.criados7}</b> criados / <b>−${fluxoDTs.resolvidos7}</b> resolvidos · 7–14 dias: +${fluxoDTs.criados14} / −${fluxoDTs.resolvidos14}${fluxoDTs.resolvidosSemData ? ` · <span class="mut">${fluxoDTs.resolvidosSemData} resolvidos sem data (linhas antigas — não entram no fluxo)</span>` : ''}</div><div class="small mut">Régua: criados &gt; resolvidos por 2 semanas seguidas = alerta 🔴. Fila &gt; teto (HARNESS_DT_WIP_MAX) = só Alta/bloqueante entra (guard-dt).</div></div>` : ''}

${tarefas.length ? `<h2>Tasks medidas no SubagentStop (3.4.22) — duração por papel e tasks acima do envelope (${ENVELOPE_MIN} min)</h2>
<div class="card"><div class="small mut">${tarefas.length} subagente(s) medidos · fonte versionada <code>prds/_metrics/tasks/*.jsonl</code> · p90 daqui alimenta o watchdog; PREVISAO do packet usa a mediana por tamanho.</div>
<div class="tw"><table><thead><tr><th>Papel</th><th class="n">n</th><th class="n">Dur. med</th><th class="n">p90</th><th class="n">Turnos med</th><th class="n">Bash / Read med</th><th class="n">Tok out med</th><th class="n">&gt; ${ENVELOPE_MIN} min</th><th class="n">PARCIAL</th><th>Modelos</th></tr></thead><tbody>
${tasksPorPapel.map(a => `<tr><td><b>${esc(a.papel)}</b></td><td class="n">${a.n}</td><td class="n">${fmtDur(a.durMed)}</td><td class="n">${fmtDur(a.durP90)}</td><td class="n">${a.turnosMed ?? 'n/d'}</td><td class="n">${a.bashMed ?? 'n/d'} / ${a.readMed ?? 'n/d'}</td><td class="n">${fmtK(a.tokOutMed)}</td><td class="n">${a.acima}</td><td class="n">${a.parciais}</td><td class="small">${a.modelos.map(([m, n]) => `${esc(String(m).replace('claude-', ''))} ${n}`).join(' · ')}</td></tr>`).join('')}
</tbody></table></div>
${tasksAcima.length ? `<h3>Acima do envelope</h3><div class="tw"><table><thead><tr><th>Projeto</th><th>Rótulo</th><th>Papel</th><th class="n">Dur.</th><th class="n">Turnos</th><th class="n">Packet KB</th><th>Status</th><th>Máquina</th></tr></thead><tbody>
${tasksAcima.map(t => `<tr><td>${dot(t.projeto)}${esc(t.projeto)}</td><td>${esc(t.rotulo || '')}</td><td>${esc(t.papel)}</td><td class="n">${fmtDur(num(t.dur_s))}</td><td class="n">${t.turnos ?? ''}</td><td class="n">${t.packet_kb ?? ''}</td><td>${esc(t.status || '')}</td><td class="small">${esc(t.maquina || '')}</td></tr>`).join('')}
</tbody></table></div>` : ''}</div>

<h2>Placar interno por modelo (3.4.25) — decidir o preset com dados</h2>
<div class="card"><div class="small mut">Fonte: as mesmas linhas por task (<code>prds/_metrics/tasks/*.jsonl</code>); <code>modelo</code> = família do modelo REAL do transcript (vazio = <b>n/d</b>). Revisores (sherlock, beholder, michelangelo): 🔴 do relatório por CICLO — rótulo <code>-c1</code> (ou sem sufixo) = c1; <code>-c2</code>+ = demais. Executores (hefesto, dedalo): PARCIAL % e, quando a linha traz <code>verif_sem_prova</code>, % de relatórios com verificação sem prova. <b>Réguas (PLAYBOOK):</b> n ≥ 5 e PARCIAL ≥ 30 % no papel = investigar teto/packet; c1 Sonnet com 🔴 medianos &lt; 60 % do c1 Opus em n ≥ 5 cada = reconsiderar o item 13. Só texto — a decisão é humana.</div>
<h3>Por papel × modelo</h3>
<div class="tw"><table><thead><tr><th>Papel</th><th>Modelo</th><th class="n">n</th><th class="n">Dur. med</th><th class="n">Turnos med</th><th class="n">Tok out med</th><th class="n">PARCIAL</th><th class="n">c1: n · 🔴 med · 🔴 tot · c/ 🔴</th><th class="n">c2+: n · 🔴 med · 🔴 tot</th><th class="n">verif. sem prova</th></tr></thead><tbody>
${placarInterno.map(l => `<tr><td><b>${esc(l.papel)}</b></td><td>${esc(l.modelo)}</td><td class="n">${l.n}</td><td class="n">${fmtDur(l.durMed)}</td><td class="n">${l.turnosMed ?? 'n/d'}</td><td class="n">${fmtK(l.tokOutMed)}</td><td class="n">${l.parciais} (${l.parcialPct ?? 0}%)${l.n >= 5 && l.parcialPct >= 30 ? ' 🟠' : ''}</td><td class="n">${l.c1 ? `${l.c1.n} · ${fmtVerm(l.c1.vermMed)} · ${l.c1.vermTot} · ${l.c1.comVermelho}` : '—'}</td><td class="n">${l.cN ? `${l.cN.n} · ${fmtVerm(l.cN.vermMed)} · ${l.cN.vermTot}` : '—'}</td><td class="n">${l.executor ? (l.verifSemProva ? `${l.verifSemProva.sim}/${l.verifSemProva.n} (${l.verifSemProvaPct}%)` : '<span class="mut">sem campo</span>') : '—'}</td></tr>`).join('')}
</tbody></table></div>
<h3>A/B do gate no ciclo 1 (item 13) — Sonnet × Opus</h3>
<div class="tw"><table><thead><tr><th>Gate</th><th>Modelo</th><th class="n">n (c1)</th><th class="n">criações</th><th class="n">🔴 med</th><th class="n">🔴 tot</th><th class="n">criações c/ ≥ 1 🔴</th><th class="n">Dur. med</th><th class="n">Tok out med</th></tr></thead><tbody>
${abGateC1.flatMap(g => ['sonnet', 'opus'].map(m => { const s = g[m]; return `<tr><td><b>${esc(g.papel)}</b></td><td>${m}</td><td class="n">${s.n}</td><td class="n">${s.criacoes}</td><td class="n">${fmtVerm(s.vermMed)}</td><td class="n">${s.vermTot}</td><td class="n">${s.criacoesComVermelho}/${s.criacoes} (${s.criacoesComVermelhoPct ?? 'n/d'}%)</td><td class="n">${fmtDur(s.durMed)}</td><td class="n">${fmtK(s.tokOutMed)}</td></tr>`; })).join('')}
</tbody></table></div>
${abGateC1.map(g => `<div class="small" style="margin-top:6px">${g.reconsiderar ? '🟠 ' : ''}${esc(g.leitura)}</div>`).join('')}
</div>` : ''}

<h2>Alertas (réguas do /harness-report)</h2>
<div class="card">${alertas.length ? [...new Set(alertas.map(a => a.nivel + '|' + a.tipo))].map(k => { const [nivel, tipo] = k.split('|'); const as = alertas.filter(a => a.nivel === nivel && a.tipo === tipo); return `<details ${nivel === 'vermelho' ? 'open' : ''}><summary><span class="badge b-${nivel}">${nivel === 'vermelho' ? '🔴' : '🟠'} ${esc(tipo)}</span> <b>${as.length}</b></summary>${as.map(a => `<div class="al"><div><b>${esc(a.quem)}</b> — ${esc(a.txt)}</div></div>`).join('')}</details>`; }).join('') : '✅ sem regressão na janela'}</div>

<h2>Top 10 execuções mais caras (tokens de output real)</h2>
<div class="card"><div class="tw"><table><thead><tr><th>Projeto</th><th>Label</th><th class="n">Tokens real</th><th class="n">Sub (jsonl / transcript)</th><th class="n">Dur. bruta</th><th class="n">Dur. ativa</th><th class="n">Ciclos</th><th class="n">Subag.</th><th class="n">Paralelo</th><th>Preset</th></tr></thead><tbody>
${topCaras.map(r => `<tr><td>${dot(r.projeto)}${esc(r.projeto)}</td><td>${esc(r.label)}</td><td class="n">${fmtK(r.tokReal)}</td><td class="n">${fmtK(r.tokSub)} / ${fmtK(r.subOutTranscript)}</td><td class="n">${fmtDur(r.elapsed)}</td><td class="n">${r.durConf != null ? fmtDur(r.durConf) : `n/d <span class="mut">(${esc(r.motivo)})</span>`}</td><td class="n">${r.ciclos ?? 'n/d'}</td><td class="n">${r.subagents ?? 'n/d'}</td><td class="n">${r.parallel ?? 'n/d'}</td><td>${esc(r.preset)}</td></tr>`).join('')}
</tbody></table></div></div>

<details><summary>Todas as execuções da janela (${runsU.length}${suspeitas.length ? ` + ${suspeitas.length} suspeitas` : ''})</summary><div class="card"><div class="tw"><table><thead><tr><th>Fim</th><th>Projeto</th><th>Label</th><th>Grupo</th><th>Dev</th><th>Harness</th><th>Schema</th><th class="n">Dur. bruta</th><th class="n">Dur. ativa</th><th>Confiável?</th><th class="n">Tokens real</th><th class="n">Ciclos</th><th class="n">Subag.</th><th class="n">Paralelo</th><th class="n">Ocioso</th><th class="n">Denials</th><th class="n">Prompts</th><th class="n">Perguntas</th><th>Modo</th><th>Review</th><th>Codex</th><th class="n">Spawn</th><th class="n">Agentes medidos</th></tr></thead><tbody>
${[...runsU, ...suspeitas].sort((a, b) => b.ts_end - a.ts_end).map(r => `<tr${r.suspeita ? ' class="mut"' : ''}><td>${fmtData(r.ts_end)}</td><td>${dot(r.projeto)}${esc(r.projeto)}${r.worktree ? ` <span class="mut">wt=${esc(r.worktree)}</span>` : ''}</td><td>${esc(r.label)}${r.suspeita ? ' ⚠️' : ''}</td><td>${r.grupo}</td><td class="small">${esc(chaveDev(r))}</td><td class="small">${esc(r.harness)}</td><td>${r.schema || '—'}</td><td class="n">${fmtDur(r.elapsed)}</td><td class="n">${fmtDur(r.ativo)}</td><td class="small">${r.suspeita ? '✗ suspeita' : r.durConf != null ? '✅ ' + r.motivo : '✗ ' + r.motivo}</td><td class="n">${fmtK(r.tokReal)}</td><td class="n">${r.ciclos ?? ''}</td><td class="n">${r.subagents ?? ''}</td><td class="n">${r.parallel ?? ''}</td><td class="n">${r.waitIdle ?? ''}</td><td class="n">${r.denials ?? ''}</td><td class="n">${r.perm ?? ''}</td><td class="n">${r.perguntas ?? ''}</td><td class="small">${esc(r.modo)}</td><td class="small">${esc(r.reviewModo)}</td><td class="small">${esc(r.codex)}</td><td class="n">${r.spawnMs ?? ''}</td><td class="n">${r.agentes.length || ''}</td></tr>`).join('')}
</tbody></table></div></div></details>

<p class="small mut" style="margin-top:30px">Fonte: <code>${esc(BASE)}\\*\\prds\\_metrics\\harness-runs.jsonl</code> (+ <code>harness-delegations.jsonl</code>) e <code>~/.claude/projects/*</code>. Read-only sobre os projetos. Regras: PLAYBOOK-TELEMETRIA.md · skill /harness-report · gerado por .claude/hooks/harness-dashboard.mjs (3.1.0).</p>
</main></body></html>`;

mkdirSync(OUT, { recursive: true });
const tag = `${args.de || fmtDataFull(de).split('/').reverse().join('-')}_${args.ate || fmtDataFull(ate).split('/').reverse().join('-')}`;
const outHtml = join(OUT, `harness-dashboard-${tag}.html`), outJson = join(OUT, `harness-dashboard-${tag}.json`);
writeFileSync(outHtml, html, 'utf8');
writeFileSync(outJson, JSON.stringify({ janela: { de: de.toISOString(), ate: ate.toISOString() }, metodo: { brutas, brutasJanela, removidas, dedupS: DEDUP_S, suspeitaH: SUSPEITA_S / 3600 }, geral, geralAnt, porGrupo, porGrupoAnt, porProjeto, dias, porAgente, porModelo, agProj, executores, custoOpenRouter, custoPorModelo, duelosResumo, duelosPorModelo, fluxoDTs, alertas, tasksPorPapel, tasksAcima, envelopeMin: ENVELOPE_MIN,
  // 3.4.25 (melhoria 5): placar interno por papel x modelo + A/B do gate c1 (item 13)
  placarInterno, abGateC1,
  // 3.4.23: por dev/maquina, por versao, suspeitas, incidentes, cobertura
  porDev, porVersao, suspeitas: suspeitas.map(r => ({ ...r, agentes: r.agentes.length })), incidentes: incidentesResumo, cobertura: COBERTURA_ON ? cobertura : null,
  topCaras: topCaras.map(r => ({ projeto: r.projeto, label: r.label, tokReal: r.tokReal, elapsed: r.elapsed, durConf: r.durConf })), runs: runsU.map(r => ({ ...r, agentes: r.agentes.length })) }, null, 1), 'utf8');
// 3.4.23 (item 17): uma linha por repo no stdout para o /prometeu --check reaproveitar
if (COBERTURA_ON) for (const r of cobertura.repos) console.log(`COBERTURA|${r.repo}|${r.versao || 'n/d'}|${r.branch || 'n/d'}|${r.ultimoRun ? fmtDataFull(new Date(r.ultimoRun * 1000)) : 'nunca'}|${r.devs.join(',') || '-'}|${r.runs14d}|${r.abertas.length ? 'ABERTA:' + r.abertas.join(';') : 'nao'}`);
console.log(`OK ${runsU.length} execucoes · ${suspeitas.length} suspeitas · ${nomesProj.length} projetos · ${porDev.length} devs · ${agentes.length} agentes · ${incidentes.length} incidentes · ${alertas.length} alertas (${alertas.filter(a => a.nivel === 'vermelho').length} vermelhos) → ${outHtml} | ${outJson}`);
