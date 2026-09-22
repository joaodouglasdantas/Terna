#!/usr/bin/env node
// .claude/hooks/guard-folego.mjs (3.4.22 — item 7) — TETO DE FOLEGO ENFORCADO POR HOOK.
//
// Motivo (medido 01-04/09): hefesto/dedalo diziam "~60 chamadas" no contrato e mediram p90 de
// 121-125 turnos (max 253 — dedalo TASK-006, 141 min); hermes p90 105 com teto "120" que so
// AVISAVA. O watchdog por p90 age DEPOIS que o agente volta. Regra da casa: instrucao nao
// segura; hook segura. Aqui o teto vira DENY dentro do proprio subagente:
//   - conta as chamadas de ferramenta no transcript do agente (linhas "type":"assistant" com
//     blocos tool_use), com cursor por agente em .harness-run/folego/<agent>.json (le so o delta);
//   - acima do teto do papel, NEGA tudo, exceto Write/Edit do RELATORIO (.harness-run/relatorios,
//     codex-reviews, REVIEW-*.md) — o agente devolve PARCIAL-TEMPO e a sessao-pai decide;
//   - a sessao PAI nunca e negada (so transcript em <sessao>/subagents/);
//   - o agente NAO ve contador nem teto no prompt (modelos 5 tem "ansiedade de contexto"
//     documentada quando enxergam contagem regressiva); ele so descobre quando o hook nega.
//
// Onde roda (zero spawn extra por chamada): dentro do guard-bash.mjs (pre, Bash) e do daemon
// (rota /h/PreToolUse/guard-folego para Edit|Write, fallback `node` deste arquivo). Leitura pura
// (Read/Grep/Glob) NAO e conferida — cada hook e 2 processos e a maquina do Charles serializa
// spawn (3.4.21); o agente que so le cai no watchdog p90 (task-telemetry.mjs) como antes.
//
// Knobs (harness.env / ~/.harness.env.local):
//   HARNESS_GUARD_FOLEGO='on'|'off'      HARNESS_FOLEGO_DEFAULT='100'
//   HARNESS_FOLEGO_<papel>='N'  (hifen vira underscore: HARNESS_FOLEGO_tony_stark)
// Telemetria: .harness-run/folego.jsonl {ts,agent,papel,n,teto,tool,rotulo} (uma linha por deny)
//   + 3.4.23: a mesma negacao vira incidente tipo "folego" em prds/_metrics/incidentes/<dev>@<host>.jsonl.
//
// Uso: `node guard-folego.mjs` (stdin = JSON do hook PreToolUse) | modulo: checkFolego(input, {root})

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeCtx, subagenteDoPayload } from './presence.mjs';

const TETOS = {
  hefesto: 90, dedalo: 90, sherlock: 80, beholder: 60, michelangelo: 90, hermes: 120, ariadne: 80,   // 3.4.34: michelangelo 60 -> 90 (auditoria de UX da PRD-141 cortada)
  themis: 40, atlas: 60, 'tony-stark': 60, 'peter-quill': 60, prometeu: 60,
};
const RELATORIO_RE = /(\.harness-run[\\/]relatorios|codex-reviews|REVIEW-[A-Za-z0-9_-]*\.md|relatorio)/i;

function num(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; }
function campo(input, nome) { const m = input.match(new RegExp('"' + nome + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"')); return m ? m[1].replace(/\\\\/g, '\\').replace(/\\\//g, '/').replace(/\\"/g, '"') : ''; }

// 3.4.23 (item 15g): incidente com schema UNICO, versionado por dev/maquina em
// prds/_metrics/incidentes/<usuario>@<maquina>[~worktree].jsonl (espelho em Node do _incidente.sh;
// o folego.jsonl local continua). Knob HARNESS_INCIDENTES='off'. Best-effort: nunca lanca.
export function gravarIncidente(ctx, { tipo, papel, rotulo, agent, detalhe }) {
  try {
    const { ENV, ROOT, CLAUDE_DIR } = ctx;
    if ((ENV.HARNESS_INCIDENTES || 'on').toLowerCase() === 'off') return;
    let user = 'dev', host = 'maquina';
    try { user = os.userInfo().username || user; } catch {}
    try { host = (os.hostname() || host).split('.')[0]; } catch {}
    let wt = ''; try { const m = fs.readFileSync(path.join(CLAUDE_DIR, '.harness-run', 'worktree.env'), 'utf8').match(/^rotulo=(.*)$/m); if (m && m[1].trim()) wt = '~' + m[1].trim(); } catch {}
    const f = path.join(ROOT, 'prds', '_metrics', 'incidentes', (user + '@' + host + wt).replace(/[^A-Za-z0-9@._~-]/g, '_') + '.jsonl');
    const clean = (s, n) => String(s || '').replace(/[\x00-\x1f"\\]/g, ' ').slice(0, n);
    const linha = { ts: Math.floor(Date.now() / 1000), projeto: path.basename(ROOT), maquina: user + '@' + host, harness: ENV.HARNESS_VERSION || '',
      tipo: clean(tipo, 16), papel: clean(papel, 40), rotulo: clean(rotulo, 40), agent: clean(agent, 40), detalhe: clean(detalhe, 200) };
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, JSON.stringify(linha) + '\n');
  } catch {}
}

export function tetoDoPapel(papel, ENV) {
  const k = 'HARNESS_FOLEGO_' + String(papel || '').replace(/-/g, '_');
  if (ENV[k]) return num(ENV[k], TETOS[papel] || 100);
  if (TETOS[papel]) return TETOS[papel];
  return num(ENV.HARNESS_FOLEGO_DEFAULT, 100);
}

// Conta tool_use no transcript a partir do cursor gravado (delta). Retorna { n, n_leitura, n_escrita }.
// 3.5.4: PESO POR FERRAMENTA — Read/Grep/Glob nao criam processo e sao o que a 3.4.21 mandou usar no lugar do
// Bash; contar cada leitura como uma chamada inteira pune quem obedeceu. Medido 14/09 (PRD-143, hefesto
// TASK-005): cortado em n=107 com 77 leituras (Read 27 + Grep 41 + Glob 9) e so 29 chamadas de trabalho
// (Bash 23 + Write 4 + Edit 2), sem entregar o spec. Leitura pesa HARNESS_FOLEGO_PESO_LEITURA (default 0.5);
// Bash/Write/Edit/Agent e o resto pesam 1. n e o total PESADO (o que se compara ao teto); n_leitura/n_escrita
// sao contagens cruas para a telemetria decidir com numero.
const LEITURA_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead']);
export function contarChamadas(transcript, stateFile, pesoLeitura = 1) {
  let st = { bytes: 0, n: 0, n_leitura: 0, n_escrita: 0 };
  try { st = { n_leitura: 0, n_escrita: 0, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) }; } catch {}
  const vazio = () => ({ n: st.n, n_leitura: st.n_leitura, n_escrita: st.n_escrita });
  let size = 0; try { size = fs.statSync(transcript).size; } catch { return { n: 0, n_leitura: 0, n_escrita: 0 }; }
  if (size < st.bytes) st = { bytes: 0, n: 0, n_leitura: 0, n_escrita: 0 };            // transcript recriado
  if (size === st.bytes) return vazio();
  const fd = fs.openSync(transcript, 'r');
  const buf = Buffer.alloc(size - st.bytes);
  const lidos = fs.readSync(fd, buf, 0, buf.length, st.bytes);
  fs.closeSync(fd);
  const txt = buf.toString('utf8', 0, lidos);
  const corte = txt.lastIndexOf('\n');                       // so linhas completas
  if (corte < 0) return vazio();
  let n = st.n, nl = st.n_leitura, ne = st.n_escrita;
  const peso = Number.isFinite(Number(pesoLeitura)) && Number(pesoLeitura) >= 0 ? Number(pesoLeitura) : 1;
  const RE = /"type":"tool_use"(?:,"id":"[^"]*")?,"name":"([^"]*)"/g;
  for (const line of txt.slice(0, corte).split('\n')) {
    if (!line.includes('"type":"assistant"')) continue;
    let m, achou = 0;
    while ((m = RE.exec(line)) !== null) { achou++; if (LEITURA_TOOLS.has(m[1])) { nl++; n += peso; } else { ne++; n += 1; } }
    if (!achou) { const c = (line.match(/"type":"tool_use"/g) || []).length; ne += c; n += c; }   // forma inesperada: conta cheio
  }
  n = Math.round(n * 100) / 100;
  try { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify({ bytes: st.bytes + corte + 1, n, n_leitura: nl, n_escrita: ne })); } catch {}
  return { n, n_leitura: nl, n_escrita: ne };
}

export function checkFolego(input, opts = {}) {
  const out = { exit: 0, stdout: '', stderr: '' };
  try {
    const ctx = makeCtx(opts.root);
    const { ENV, STATE_DIR } = ctx;
    if ((ENV.HARNESS_GUARD_FOLEGO || 'on').toLowerCase() === 'off') return out;
    const sp = subagenteDoPayload(input);                     // 3.4.27: agent_id/agent_type do payload
    if (!sp.sub) return out;                                  // sessao pai: nunca
    const tp = sp.transcript; const agentId = sp.id;
    if (!agentId || !tp) return out;
    let papel = sp.tipo || campo(input, 'agent_type');
    if (!papel) { try { const mm = fs.readFileSync(tp.replace(/\.jsonl$/, '.meta.json'), 'utf8').match(/"agentType"\s*:\s*"([^"]*)"/); if (mm) papel = mm[1]; } catch {} }
    papel = (papel || 'agente').replace(/[^A-Za-z0-9-]/g, '');
    const teto = tetoDoPapel(papel, ENV);
    const stateFile = path.join(STATE_DIR, 'folego', agentId + '.json');
    const pesoL = ENV.HARNESS_FOLEGO_PESO_LEITURA === undefined || ENV.HARNESS_FOLEGO_PESO_LEITURA === '' ? 0.5 : Number(ENV.HARNESS_FOLEGO_PESO_LEITURA);   // 3.5.4
    const { n, n_leitura, n_escrita } = contarChamadas(tp, stateFile, pesoL);
    if (n <= teto) return out;
    const tool = campo(input, 'tool_name');
    const fp = campo(input, 'file_path');
    if ((tool === 'Write' || tool === 'Edit') && RELATORIO_RE.test(fp)) return out;   // o relatorio sempre pode sair
    // rotulo (TASK/DT/PRD/LOTE) da descricao do meta.json — so para a telemetria/mensagem
    let rotulo = '';
    try { const d = (fs.readFileSync(tp.replace(/\.jsonl$/, '.meta.json'), 'utf8').match(/"description"\s*:\s*"([^"]*)"/) || [])[1] || ''; rotulo = ((d.match(/(TASK|DT)-\d{2,4}[a-z]?/) || d.match(/(PRD|LOTE)-\d{2,4}(-[a-z])?/) || [''])[0]); } catch {}
    try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.appendFileSync(path.join(STATE_DIR, 'folego.jsonl'), JSON.stringify({ ts: Math.floor(Date.now() / 1000), agent: agentId, papel, n, n_leitura, n_escrita, peso_leitura: pesoL, teto, tool, rotulo }) + '\n'); } catch {}
    gravarIncidente(ctx, { tipo: 'folego', papel, rotulo, agent: agentId, detalhe: `n=${n} teto=${teto} tool=${tool} leitura=${n_leitura} escrita=${n_escrita} peso_leitura=${pesoL}` });
    const rel = '.claude/.harness-run/relatorios/' + (rotulo || 'avulso') + '-' + papel + '.md';
    out.exit = 2;
    out.stderr = `[guard-folego] ${papel} ultrapassou o teto de folego (${n} chamadas de ferramenta pesadas — ${n_escrita} de trabalho + ${n_leitura} de leitura a ${pesoL}; teto ${teto}). PARE AGORA e devolva PARCIAL-TEMPO: grave o relatorio completo em ${rel} (Write/Edit nesse caminho continuam liberados) com Status ⚠️ PARCIAL-TEMPO — o que fez, o que falta, onde travou e sua recomendacao (dividir? outra abordagem?) — e encerre com o sumario de ate 12 linhas apontando o relatorio. Nenhuma outra ferramenta sera liberada; a sessao-pai decide como continuar. Parcial honesto vale mais que maratona.\n`;
    return out;
  } catch { return out; }                                    // guarda com erro interno nunca bloqueia
}

function isMain() { try { return path.resolve(process.argv[1] || '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); } catch { return false; } }
if (isMain()) {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch {}
  let root = '';
  try { const c = campo(input, 'cwd'); if (c && fs.existsSync(path.join(c, '.claude', 'harness.env'))) root = c; } catch {}
  const r = checkFolego(input, { root: root || undefined });
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.exit);
}
