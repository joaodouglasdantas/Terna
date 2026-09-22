#!/usr/bin/env node
// .claude/hooks/presence.mjs (3.4.8; modulo 3.4.21) — PORT do presence.sh para Node (hot-path #7).
// Motivo (medido 25/08): forks de bash a 6-9s sob carga no Windows — e o presence roda a
// CADA prompt/tool use. Em Node o hook fica ~80-150ms e ainda elimina spawns: identidade
// via os.userInfo()/os.hostname() (imune ao bug de codepage 1252 do whoami no Git Bash),
// branch lida de .git/HEAD, git_email parseado de .git/config + ~/.gitconfig.
//
// PARIDADE: mesmo contrato do presence.sh (payload v1 com os MESMOS campos e ordem;
// mesmos arquivos de estado .harness-run/presence*.{jsonl,-last-ping*}; mesma fila
// offline com TTL/teto; mesmo throttle por sessao). O Caronte NAO percebe a troca.
// O presence.sh continua no repo como fallback e para o host Codex — mudanca de payload
// deve tocar os DOIS arquivos.
//
// 3.4.21 — MODULO alem de CLI. Medido 04/09 no PC do Charles: cada hook custa 2 bash + 1 node
// (~250-500 ms em repouso, 1-5 s sob 3 frentes) e este arquivo nascia a cada Bash/Edit/Write so
// para descobrir que ainda estava dentro do throttle. Agora `runPresence(input, argv, {root})`
// e exportado: o guard-bash.mjs --post o chama no MESMO processo (1 hook a menos por Bash) e o
// harness-daemon.mjs o serve sem spawn nenhum (`sendInProcess`). O comportamento como CLI e o
// mesmo de antes; `root` permite ao daemon atender varios projetos (contexto por cwd).
//
// Wiring (settings.json): `node .claude/hooks/presence.mjs X` (SessionStart --start |
// UserPromptSubmit/PostToolUse --prompt | SessionEnd --end | SubagentStart --agent-start |
// SubagentStop --agent-end) — ou, com o daemon ativo, o curl do settings para /h/<evento>/presence.
//
// Uso interno: --send <payload-file> [root] (processo filho detached que envia + drena a fila).

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { recordTask } from './task-telemetry.mjs';

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = 'https://caronte.app.br/api/v1/presenca/ping';

// ---- harness.env / harness.env.local (formato controlado: VAR='...' | VAR="..." | VAR=...)
// Paridade com o `source` do bash: valor do ARQUIVO sobrescreve o do ambiente quando a
// variavel esta declarada; ausente no arquivo => vale o ambiente.
export function loadEnvFile(file, env) {
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const raw of txt.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    // 3.4.31c: valor entre aspas seguido de comentario (KEY='150'   # motivo) — o bash aceita, o parser antigo
    // devolvia "'150'   # motivo" e o teto de folego caia no default (medido 10/09: hefesto 150 virou 90).
    const q = v[0];
    if (q === "'" || q === '"') { const j = v.indexOf(q, 1); v = j > 0 ? v.slice(1, j) : v.slice(1); }
    else v = v.replace(/\s+#.*$/, '').trim();
    env[m[1]] = v;
  }
}

// 3.4.27 — DETECCAO DE SUBAGENTE PELO PAYLOAD. Medido 09/09 no Mariana: 0 arquivos em .harness-run/folego/
// e 0 pings com sufixo de agente depois de dezenas de Bash/Edit de hefesto/sherlock — o transcript_path
// dos hooks dentro do subagente NAO traz "/subagents/"; a doc do Claude Code 2.1 garante agent_id/agent_type
// em PreToolUse/PostToolUse e agent_transcript_path no SubagentStop. Regra: agent_id no payload = subagente;
// o transcript dele e <pasta>/<sessao>/subagents/agent-<id>.jsonl quando o caminho nao vier pronto.
export function subagenteDoPayload(input) {
  const g = (k) => { const m = String(input || '').match(new RegExp('"' + k + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"')); return m ? m[1].replace(/\\\\/g, '\\').replace(/\\\//g, '/').replace(/\\"/g, '"') : ''; };
  let tp = (g('agent_transcript_path') || g('transcript_path')).replace(/\\/g, '/');
  let id = g('agent_id').replace(/[^A-Za-z0-9.-]/g, '').slice(0, 40);
  const tipo = g('agent_type').replace(/[^A-Za-z0-9-]/g, '');
  const ix = tp.indexOf('/subagents/');
  if (ix > 0) { if (!id) id = path.basename(tp).replace(/\.jsonl$/, '').replace(/^agent-/, '').replace(/[^A-Za-z0-9.-]/g, '').slice(0, 40); return { sub: true, id, tipo, transcript: tp }; }
  if (!id) return { sub: false, id: '', tipo, transcript: '' };
  return { sub: true, id, tipo, transcript: tp ? tp.replace(/\.jsonl$/, '') + '/subagents/agent-' + id + '.jsonl' : '' };
}

// ---- CAMADAS DE CONFIGURACAO (3.5.7) — paridade com hooks/_env.sh. Ordem de carga (a ultima que define vence):
// hooks/_defaults.env (decisao do harness) -> harness.env (projeto) -> harness.env.local (maquina) ->
// ~/.harness.env.local (usuario); a variavel de AMBIENTE da sessao vence todas (documentado desde a 3.4.2 no
// harness.env.local.example — ate a 3.5.6 o arquivo vencia o ambiente, ao contrario do documentado).
// Todo .mjs que precisa de config usa loadHarnessEnv(); nenhum monta a propria lista de arquivos.
export function harnessEnvFiles(claudeDir) {
  return [
    path.join(claudeDir, 'hooks', '_defaults.env'),
    path.join(claudeDir, 'harness.env'),
    path.join(claudeDir, 'harness.env.local'),
    path.join(os.homedir(), '.harness.env.local'),
  ];
}
export function loadHarnessEnv(claudeDir, base = process.env) {
  const arq = {};
  for (const f of harnessEnvFiles(claudeDir)) loadEnvFile(f, arq);
  const env = { ...arq };
  for (const [k, v] of Object.entries(base)) if (v !== undefined) env[k] = v;   // ambiente vence
  return env;
}
export function harnessEnvStamp(claudeDir) {
  return harnessEnvFiles(claudeDir).map(f => { try { return String(fs.statSync(f).mtimeMs); } catch { return '0'; } }).join('|');
}

// ---- contexto por projeto (3.4.21). Cache por raiz + mtime dos env (o daemon vive horas e o
// harness.env pode mudar por sync no meio).
const ctxCache = new Map();
export function makeCtx(rootDir) {
  const ROOT = path.resolve(rootDir || path.resolve(HOOKS_DIR, '..', '..'));
  const CLAUDE_DIR = path.join(ROOT, '.claude');
  const stamp = harnessEnvStamp(CLAUDE_DIR);
  const hit = ctxCache.get(ROOT);
  if (hit && hit.stamp === stamp) return hit;
  const ENV = loadHarnessEnv(CLAUDE_DIR);
  const ctx = {
    ROOT, CLAUDE_DIR, ENV, stamp,
    STATE_DIR: path.join(CLAUDE_DIR, '.harness-run'),
    LOG_FILE: path.join(CLAUDE_DIR, '.harness-run', 'presence.jsonl'),
    QUEUE_DIR: path.join(CLAUDE_DIR, '.harness-run', 'presence-queue'),
  };
  ctxCache.set(ROOT, ctx);
  return ctx;
}

// ---------------------------------------------------------------- CLI
function isMain() {
  try { return path.resolve(process.argv[1] || '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); }
  catch { return false; }
}
if (isMain()) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--send') {                       // filho de envio (--send <payload> [root])
    await enviarEDrenar(makeCtx(argv[2]), argv[1]);
    process.exit(0);
  }
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch {}   // stdin PRECISA ser drenado (o host escreve JSON no pipe)
  try { runPresence(input, argv); } catch { /* presence NUNCA quebra o host */ }
  process.exit(0);
}

// ---------------------------------------------------------------- hook principal (modulo)
// input = JSON do hook (texto); argv = ['--prompt'|'--start'|'--end'|'--agent-start'|'--agent-end', ...]
// opts.root = raiz do projeto (default: o projeto deste arquivo); opts.sendInProcess = envia sem
// spawn (daemon). Retorna { evento, enviado } para diagnostico; nunca lanca para o chamador
// (excecoes viram 'erro').
export function runPresence(input, argv, opts = {}) {
  try { return hook(input || '', argv || [], makeCtx(opts.root), opts); }
  catch (e) { return { evento: 'erro', enviado: false, erro: String(e && e.message || e) }; }
}

function hook(input, argv, ctx, opts) {
  const { ENV, ROOT, STATE_DIR, LOG_FILE, QUEUE_DIR } = ctx;
  // 3.4.22 (item 8): o SubagentStop tambem grava a TELEMETRIA POR TASK — mesma requisicao,
  // zero spawn extra; roda antes de qualquer saida antecipada da presenca (presenca desligada
  // nao pode apagar a medicao). task-telemetry.mjs nunca lanca.
  if (argv[0] === '--agent-end') { try { recordTask(input, { root: ROOT }); } catch {} }
  if (ENV.HARNESS_SKIP_PRESENCE === '1') return { evento: 'off', enviado: false };
  if (process.env.HARNESS_IN_EXTERNAL_AGENT === '1' || process.env.HARNESS_IN_EXTERNAL_REVIEW === '1') return { evento: 'off', enviado: false };

  // URL: 3 estados (unset -> default da casa; '' -> desligado; valor -> usa).
  const url = ('HARNESS_PRESENCE_URL' in ENV) ? ENV.HARNESS_PRESENCE_URL : DEFAULT_URL;
  if (!url) return { evento: 'off', enviado: false };

  // 3.4.14: --agent-start <tipo> / --agent-end <tipo> — o PAI anuncia o subagente no despacho e
  // no retorno (guard-agent.sh). Agente 100% read-only (tony-stark, peter-quill) nunca dispara
  // PostToolUse com o matcher Bash|Agent|Task|Write|Edit; sem isso ele nao existia no painel.
  // 3.4.17: --agent-start/--agent-end vem dos hooks SubagentStart/SubagentStop (input traz
  // agent_type + agent_id); argv[1]/argv[2] (tipo, id) sao fallback do anuncio pelo pai (3.4.14).
  const isAnun = (argv[0] === '--agent-start' || argv[0] === '--agent-end');
  const inTypeM = input.match(/"agent_type"\s*:\s*"([^"]*)"/);
  const inIdM = input.match(/"agent_id"\s*:\s*"([^"]*)"/);
  const inType = inTypeM ? clean(inTypeM[1]) : '';
  const inId = inIdM ? clean(inIdM[1]) : '';
  const agentAnun = isAnun ? (inType || clean(argv[1] || '')) : '';
  const agentAnunId = isAnun ? (inId || clean(argv[2] || '')) : '';
  // utilitarios sem papel no painel (paridade com o guard-agent 3.4.14)
  if (isAnun && (!agentAnun || /^(general-purpose|Explore|Plan|claude)$/.test(agentAnun))) return { evento: 'ignorado', enviado: false };
  let evento = (argv[0] === '--start' || argv[0] === '--agent-start') ? 'start'
    : (argv[0] === '--end' || argv[0] === '--agent-end') ? 'end' : 'heartbeat';
  const now = Math.floor(Date.now() / 1000);
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); } catch {}

  let session = '';
  const sm = input.match(/"session_id"\s*:\s*"([^"]*)"/);
  if (sm) session = sm[1];
  const sessionKey = session.replace(/[^A-Za-z0-9.-]/g, '').slice(0, 64);
  // 3.4.12c: SUBAGENTE tem carimbo PROPRIO. Ele herda o session_id do pai, e o carimbo por sessao
  // (2.16.0) era renovado pelo pai a cada PostToolUse — o heartbeat do agente nunca furava o
  // throttle e a deteccao DT-009 (abaixo) nunca rodava (medido 02/09: 6 dedalos reais, zero
  // linhas agent:1 no Caronte). Chave = sessao + nome do transcript do agente (unico por agente).
  let agentKey = '';
  { const sp = subagenteDoPayload(input); if (sp.sub && sp.id) agentKey = ('agent-' + sp.id).slice(0, 40); }   // 3.4.27: agent_id do payload
  const lastFile = path.join(STATE_DIR, 'presence-last-ping' + (sessionKey ? '-' + sessionKey : '') + (agentKey ? '-' + agentKey : ''));

  const queueTtlMin = num(ENV.HARNESS_PRESENCE_QUEUE_TTL_MIN, 30);

  // 3.4.14: START ADIADO ao 1o prompt. Todo processo `claude` que nasce dispara SessionStart —
  // aba do Desktop aberta e nunca usada, `--resume` que so lista, processo auxiliar — e virava
  // cartao "Ativo" no Caronte (medido 02/09 na Mariana: 61 start, 17 end, 4 sessoes reais).
  // Agora o --start so deixa um marcador; o 1o UserPromptSubmit envia o 'start' de verdade;
  // --end de sessao que nunca teve prompt apaga o marcador e nao envia nada.
  const pendingFile = path.join(STATE_DIR, 'presence-pending' + (sessionKey ? '-' + sessionKey : ''));
  let startAdiado = false;
  if (!agentAnun) {
    if (evento === 'start') {
      try { fs.writeFileSync(pendingFile, String(now)); } catch {}
      sweep(STATE_DIR, /^presence-pending-/, 1440);
      startAdiado = true;                       // housekeeping abaixo roda; envio nao
    } else if (fs.existsSync(pendingFile)) {
      try { fs.unlinkSync(pendingFile); } catch {}
      if (evento === 'end') return { evento: 'end-sem-prompt', enviado: false };   // nunca teve prompt: nao existe no painel
      if (evento === 'heartbeat' && !agentKey) { evento = 'start'; } // 1o prompt = start real
    }
  }

  if (evento === 'start') {
    // poda carimbos de sessoes mortas (>1 dia) + rotacao do log + higiene da fila
    sweep(STATE_DIR, /^presence-last-ping-/, 1440);
    try {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
      if (lines.length > 400) fs.writeFileSync(LOG_FILE, lines.slice(-200).join('\n') + '\n');
    } catch {}
    sweep(QUEUE_DIR, /\.json$/, queueTtlMin);
    try {
      const q = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json')).sort();
      for (let i = 0; i < q.length - 40; i++) { try { fs.unlinkSync(path.join(QUEUE_DIR, q[i])); } catch {} }
    } catch {}
  }

  if (startAdiado) return { evento: 'start-adiado', enviado: false };

  if (evento === 'heartbeat' && !agentAnun) {
    // agente: 5 min (HARNESS_PRESENCE_THROTTLE_AGENT_MIN) — o TTL do painel e 15 min sem sinal;
    // com 10 min o agente ficava no limite de sumir da tela entre dois pings.
    const throttleMin = agentKey ? num(ENV.HARNESS_PRESENCE_THROTTLE_AGENT_MIN, 5) : num(ENV.HARNESS_PRESENCE_THROTTLE_MIN, 10);
    let last = 0;
    try { last = parseInt(fs.readFileSync(lastFile, 'utf8').trim(), 10) || 0; } catch {}
    if (now - last < throttleMin * 60) return { evento: 'throttle', enviado: false };
  }

  // ---- identidade (best-effort; vazio e aceitavel — o servidor decide)
  const gitEmail = clean(gitConfigEmail(ROOT));
  let claudeEmail = '';
  try {
    const cj = fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8');
    const m = cj.match(/"emailAddress"\s*:\s*"([^"]*)"/);
    if (m) claudeEmail = m[1];
  } catch {}
  claudeEmail = clean(claudeEmail);

  let user = '?', hostn = '?';
  try { user = os.userInfo().username || '?'; } catch {}
  try { hostn = (os.hostname() || '?').split('.')[0]; } catch {}
  const osUser = clean(user + '@' + hostn);

  const projeto = clean(path.basename(ROOT));
  const branch = clean(gitBranch(ROOT));
  const host = detectHost(ENV);

  // ---- subagente NATIVO (DT-009, 01/09/2026 — paridade com o presence.sh):
  // transcript de subagente vive em <sessao-pai>/subagents/agent-*.jsonl e o nome
  // esta no .meta.json ao lado (agentType). Sessao humana: payload identico ao v1;
  // subagente ganha agent:1 + agent_name + parent_session (o Caronte agrupa no pai).
  let agentExtra = null;
  if (agentAnun) agentExtra = { agent: 1, agent_name: agentAnun, parent_session: clean(session), ...(agentAnunId ? { agent_id: agentAnunId } : {}) };
  const tm = agentAnun ? null : input.match(/"transcript_path"\s*:\s*"([^"]*)"/);
  if (tm) {
    const tp = tm[1].replace(/\\\\/g, '/').replace(/\\/g, '/');
    const ix = tp.indexOf('/subagents/');
    if (ix > 0) {
      const parent = path.basename(tp.slice(0, ix));
      let agentName = inType;   // 3.4.17: hook dentro do subagente ja traz agent_type; meta.json e fallback
      if (!agentName) {
        try {
          const meta = fs.readFileSync(tp.replace(/\.jsonl$/, '.meta.json'), 'utf8');
          const am = meta.match(/"agentType"\s*:\s*"([^"]*)"/);
          if (am) agentName = am[1];
        } catch {}
      }
      // id unico por despacho = sufixo do arquivo agent-<id>.jsonl (== agent_id dos hooks Subagent*)
      const agentId = inId || clean(path.basename(tp).replace(/\.jsonl$/, '').replace(/^agent-/, ''));
      agentExtra = { agent: 1, agent_name: clean(agentName), parent_session: clean(parent), ...(agentId ? { agent_id: agentId } : {}) };
    }
  }

  // 3.4.14: bridge_session_id — 1a linha do transcript do app desktop
  // ({"type":"bridge-session","bridgeSessionId":"cse_..."}). Ausente em CLI puro. Le SO a 1a
  // linha (arquivos de centenas de KB). Em subagente/anuncio, le o transcript do PAI.
  // 3.4.17 (correcao da premissa): medido 02/09 no PC — a MESMA janela gerou 3 transcripts em
  // 70 min com 3 cse_ diferentes e sem encadeamento; o id muda a cada reconexao, igual ao
  // session_id. Campo INFORMATIVO: o receptor nao deve agrupar por ele (DT-032 do Caronte).
  let bridge = '';
  try {
    const tmB = input.match(/"transcript_path"\s*:\s*"([^"]*)"/);
    if (tmB) {
      let tpB = tmB[1].replace(/\\\\/g, '/').replace(/\\/g, '/');
      const ixB = tpB.indexOf('/subagents/');
      if (ixB > 0) tpB = tpB.slice(0, ixB) + '.jsonl';
      const fd = fs.openSync(tpB, 'r');
      const buf = Buffer.alloc(4096);
      const n = fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
      const first = buf.toString('utf8', 0, n).split('\n')[0];
      if (first.includes('"bridge-session"')) {
        const mb = first.match(/"bridgeSessionId"\s*:\s*"([^"]*)"/);
        if (mb) bridge = clean(mb[1]).slice(0, 80);
      }
    }
  } catch {}

  // 3.4.16: o receptor (Caronte, PresencaService) guarda UMA linha por `session` e grava
  // `encerrada_em` em todo evento 'end' — sessao encerrada nao revive. O subagente herda o
  // session_id do pai; com ele no payload, o heartbeat do agente sobrescrevia a linha do pai e o
  // `--agent-end` (3.4.14) ENCERRAVA o cartao do pai (medido 02/09 16:40: painel sem as duas execs
  // da Mariana, so o sagittarius 3.4.10 vivo). Agente ganha `session` propria: <pai>-<agent_name>;
  // `parent_session` continua sendo o pai (e por ele que o painel agrupa).
  // 3.4.17: dois agentes do MESMO tipo em paralelo (padrao do /prd-exec: "onda 3: TASK-006 dedalo,
  // TASK-007 dedalo") colidiam na mesma linha com <pai>-<tipo>. Chave = <pai>-<tipo>-<8 do agent_id>,
  // o mesmo id no anuncio (SubagentStart/Stop) e no heartbeat (arquivo do transcript). 36+1+15+1+8
  // = 61 <= VARCHAR(64) da coluna `sessao` do Caronte. Sem id (fallback do pai): <pai>-<tipo>.
  const sessionOut = (agentExtra && agentExtra.agent_name)
    ? clean(session) + '-' + agentExtra.agent_name + (agentExtra.agent_id ? '-' + agentExtra.agent_id.slice(0, 8) : '')
    : clean(session);
  const payload = JSON.stringify({
    v: 1, evento, ts: now, projeto, branch,
    git_email: gitEmail, claude_email: claudeEmail, os_user: osUser,
    host, session: sessionOut, harness: ENV.HARNESS_VERSION || '?',
    ...(bridge ? { bridge_session_id: bridge } : {}),
    ...(agentExtra || {}),
  });

  // carimba o throttle ANTES do envio (paridade: evita rajada) — anuncio de agente nao carimba
  if (!agentAnun) { try { fs.writeFileSync(lastFile, String(now)); } catch {} }

  const pf = path.join(STATE_DIR, `presence-out-${now}-${process.pid}-${Math.floor(Math.random() * 1e6)}.json`);
  try { fs.writeFileSync(pf, payload); } catch { return { evento, enviado: false }; }
  if (opts && opts.sendInProcess) {
    // daemon (3.4.21): envia no proprio processo, sem bloquear a resposta ao hook
    enviarEDrenar(ctx, pf).catch(() => {});
    return { evento, enviado: true, modo: 'in-process' };
  }
  // envio em processo DETACHED (o hook retorna ja; o filho tem o proprio teto)
  try {
    spawn(process.execPath, [fileURLToPath(import.meta.url), '--send', pf, ROOT],
      { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {}
  return { evento, enviado: true, modo: 'detached' };
}

// ---------------------------------------------------------------- envio (filho ou daemon)
export async function enviarEDrenar(ctx, payloadFile) {
  const { ENV, LOG_FILE, QUEUE_DIR } = ctx;
  const url = ('HARNESS_PRESENCE_URL' in ENV) ? ENV.HARNESS_PRESENCE_URL : DEFAULT_URL;
  if (!url) return;
  let payload = '';
  try { payload = fs.readFileSync(payloadFile, 'utf8'); fs.unlinkSync(payloadFile); } catch { return; }
  if (!payload) return;
  let evento = 'heartbeat', ts = Math.floor(Date.now() / 1000);
  try { const p = JSON.parse(payload); evento = p.evento || evento; ts = p.ts || ts; } catch {}
  const queueTtlMin = num(ENV.HARNESS_PRESENCE_QUEUE_TTL_MIN, 30);

  const code = await envia(ENV, url, payload);
  if (String(code).startsWith('2')) {
    logLine(LOG_FILE, `{"ts":${ts},"evento":"${evento}","http":"${code}","ok":1}`);
    // rede viva: drena a fila (mais antigos primeiro; para no 1o erro; max 20)
    sweep(QUEUE_DIR, /\.json$/, queueTtlMin);
    let n = 0;
    let q = [];
    try { q = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json')).sort(); } catch {}
    for (const f of q) {
      if (n >= 20) break;
      let body = '';
      try { body = fs.readFileSync(path.join(QUEUE_DIR, f), 'utf8'); } catch { continue; }
      const rc = await envia(ENV, url, body);
      if (String(rc).startsWith('2')) { try { fs.unlinkSync(path.join(QUEUE_DIR, f)); } catch {} n++; }
      else break;
    }
    if (n > 0) logLine(LOG_FILE, `{"ts":${ts},"fila_drenada":${n},"ok":1}`);
  } else {
    logLine(LOG_FILE, `{"ts":${ts},"evento":"${evento}","http":"${code}","ok":0}`);
    try { fs.mkdirSync(QUEUE_DIR, { recursive: true }); } catch {}
    try { fs.writeFileSync(path.join(QUEUE_DIR, `${ts}-${process.pid}.json`), payload); } catch {}
  }
}

async function envia(ENV, url, body) { // -> http code como string; '000' = sem conexao
  const timeoutS = num(ENV.HARNESS_PRESENCE_TIMEOUT, 8);
  const headers = { 'Content-Type': 'application/json' };
  if (ENV.HARNESS_PRESENCE_TOKEN) headers['X-Presence-Token'] = ENV.HARNESS_PRESENCE_TOKEN;
  for (let tent = 0; tent < 2; tent++) {  // 1 retry, paridade com curl --retry 1
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutS * 1000);
    try {
      const r = await fetch(url, { method: 'POST', headers, body, signal: ctl.signal });
      clearTimeout(t);
      try { await r.arrayBuffer(); } catch {}
      return String(r.status);
    } catch { clearTimeout(t); }
  }
  return '000';
}

// ---------------------------------------------------------------- helpers
function num(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; }
function logLine(file, s) { try { fs.appendFileSync(file, s + '\n'); } catch {} }

function sweep(dir, re, olderMin) { // apaga entradas casando re com mtime mais velho que olderMin
  try {
    const lim = Date.now() - olderMin * 60 * 1000;
    for (const f of fs.readdirSync(dir)) {
      if (!re.test(f)) continue;
      const full = path.join(dir, f);
      try { if (fs.statSync(full).mtimeMs < lim) fs.unlinkSync(full); } catch {}
    }
  } catch {}
}

function clean(s) { // paridade com _clean: sem aspas/backslash/CRLF, 120 chars, UTF-8 valido
  if (!s) return '';
  let out = String(s).replace(/["\\]/g, '').replace(/[\r\n]/g, '');
  out = out.slice(0, 120);
  // strings em JS ja sao UTF-16 validas; surrogates soltos (corte no meio) sao removidos
  return out.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1');
}

function iniEmail(file) { // parse minimo de [user] email = ... (gitconfig)
  try {
    const txt = fs.readFileSync(file, 'utf8');
    let inUser = false;
    for (const raw of txt.split('\n')) {
      const line = raw.trim();
      if (/^\[/.test(line)) { inUser = /^\[user\]/i.test(line); continue; }
      if (!inUser) continue;
      const m = line.match(/^email\s*=\s*(.+)$/i);
      if (m) return m[1].trim();
    }
  } catch {}
  return '';
}

function gitDir(root) { // resolve .git (diretorio ou arquivo "gitdir:" de worktree)
  const g = path.join(root, '.git');
  try {
    const st = fs.statSync(g);
    if (st.isDirectory()) return g;
    const m = fs.readFileSync(g, 'utf8').match(/^gitdir:\s*(.+)\s*$/m);
    if (m) return path.resolve(root, m[1].trim());
  } catch {}
  return '';
}

function gitConfigEmail(root) { // local vence global (paridade com `git config user.email`)
  const gd = gitDir(root);
  if (gd) {
    // worktree: config fica no gitdir COMUM (dois niveis acima de worktrees/<x>)
    const candidates = [path.join(gd, 'config'), path.join(gd, '..', '..', 'config')];
    for (const c of candidates) { const e = iniEmail(c); if (e) return e; }
  }
  return iniEmail(path.join(os.homedir(), '.gitconfig'));
}

function gitBranch(root) { // paridade com `git rev-parse --abbrev-ref HEAD` (detached => "HEAD")
  const gd = gitDir(root);
  if (!gd) return '';
  try {
    const head = fs.readFileSync(path.join(gd, 'HEAD'), 'utf8').trim();
    const m = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    return m ? m[1] : 'HEAD';
  } catch { return ''; }
}

export function detectHost(ENV) { // paridade com _host-detect.sh
  const h = ((ENV && ENV.HARNESS_HOST) || 'auto').toLowerCase();
  if (h === 'claude' || h === 'codex') return h;
  if (process.env.CLAUDECODE || process.env.CLAUDE_PROJECT_DIR) return 'claude';
  for (const k of Object.keys(process.env)) if (k.startsWith('CODEX_')) return 'codex';
  return 'claude';
}
