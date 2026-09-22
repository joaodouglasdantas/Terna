#!/usr/bin/env node
// .claude/hooks/harness-daemon.mjs (3.4.21) — DAEMON de hooks: um Node persistente por maquina
// atende os hooks quentes (guard-bash pre/post + presenca) por HTTP local; o hook vira um `curl`
// (binario nativo, ~15-60 ms) em vez de bash + node (~250-500 ms em repouso, 1-5 s sob carga).
//
// Motivo (medido 04/09 no PC do Charles): a criacao de processo e SERIALIZADA (~20 processos/s
// no total, qualquer paralelismo — fork emulado do MSYS + HVCI + Defender), e cada chamada Bash
// de agente criava bash + comando + 3 hooks x (bash + bash + node) ~ 10 processos. Com o
// daemon: bash + comando + 2 x (bash + curl). Sem spawn de Node por ferramenta.
//
// Contrato (settings.json — o mesmo comando em todos os projetos):
//   if [ -f .claude/.harness-run/daemon.on ]; then curl -sf -m 8 --data-binary @- \
//       http://127.0.0.1:47831/h/<Evento>/<hook> || { rm -f .claude/.harness-run/daemon.on; <fallback>; }; \
//   else <fallback>; fi
//   - marcador `daemon.on` por PROJETO (escrito pelo --ensure no SessionStart, apagado no 1o erro);
//   - PreToolUse guard-bash: negacao volta como JSON permissionDecision=deny (exit 0 do curl);
//     se o curl falhar, o fallback e um deny "re-execute o comando" (fail-CLOSED: nunca deixa
//     passar um Bash sem guarda) e o marcador cai — a proxima chamada ja vai por `node` direto;
//   - PostToolUse/presenca: fallback = o hook em node (o stdin ja foi consumido: perde-se no
//     maximo UM heartbeat).
//   O daemon atende QUALQUER projeto da maquina (contexto por `cwd` do payload). Versao dos
//   hooks = hash do conteudo (guard-bash.mjs + presence.mjs + este); --ensure reinicia quando o
//   projeto que abre sessao tem hooks diferentes dos carregados.
//
// Uso:
//   node .claude/hooks/harness-daemon.mjs --ensure     (SessionStart: sobe se preciso + marcador)
//   node .claude/hooks/harness-daemon.mjs --status | --start | --stop | --foreground
// Knobs (harness.env / ~/.harness.env.local): HARNESS_DAEMON='on'|'off' (default on),
//   HARNESS_DAEMON_PORT (47831 — mudar exige reescrever os comandos do settings.json),
//   HARNESS_DAEMON_IDLE_MIN (360: sem requisicao por 6 h => encerra sozinho).
// Estado: ~/.harness-run/daemon.json (pid/porta/hash) · ~/.harness-run/daemon.log

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { guardBash } from './guard-bash.mjs';
import { runPresence, loadHarnessEnv } from './presence.mjs';
import { checkFolego } from './guard-folego.mjs';

const SELF = fileURLToPath(import.meta.url);
const HOOKS_DIR = path.dirname(SELF);
const CLAUDE_DIR = path.resolve(HOOKS_DIR, '..');
const ROOT = path.resolve(CLAUDE_DIR, '..');
const HOME_RUN = path.join(os.homedir(), '.harness-run');
const STATE = path.join(HOME_RUN, 'daemon.json');
const LOG = path.join(HOME_RUN, 'daemon.log');

const ENV = loadHarnessEnv(CLAUDE_DIR);   // 3.5.7: camadas pelo carregador unico do presence.mjs (ambiente vence)
const PORT = num(ENV.HARNESS_DAEMON_PORT, 47831);
const IDLE_MIN = num(ENV.HARNESS_DAEMON_IDLE_MIN, 360);
const VERSAO = ENV.HARNESS_VERSION || '?';

function num(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; }
function log(s) {
  try {
    fs.mkdirSync(HOME_RUN, { recursive: true });
    try { if (fs.statSync(LOG).size > 1024 * 1024) { const t = fs.readFileSync(LOG, 'utf8').split('\n'); fs.writeFileSync(LOG, t.slice(-400).join('\n')); } } catch {}
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`);
  } catch {}
}
function hooksHash() { return hooksHashDe(HOOKS_DIR) || '000000000000'; }
// 3.4.31 — MODULOS POR PROJETO. O daemon e um so por PC (porta fixa) e ate aqui rodava os hooks do projeto
// que o subiu por ultimo: medido 09/09 23:38, uma sessao do site-allyson (3.4.25) reiniciou o daemon e o
// SubagentStop do Mariana (3.4.30) passou a ser processado pelo task-telemetry antigo (fallback "arquivo mais
// recente" — o hefesto vivo foi medido 3x). Agora cada requisicao carrega os modulos de <cwd>/.claude/hooks
// (cache por pasta + hash; `?v=hash` forca reimport quando o projeto atualiza); sem modulos la, usa os proprios.
const PROPRIOS = { guardBash, runPresence, checkFolego, hash: 'proprio' };
const MODS = new Map();
// hash de TODOS os .mjs da pasta (3.4.31b): uma dependencia interna (task-telemetry importado pelo presence)
// tambem muda o hash — medido 10/09 00:14: presence.mjs recarregado com ?v=hash, mas o task-telemetry.mjs
// importado por dentro ficou no cache do Node desde a carga anterior (3.4.29) e gravou linha fantasma.
function mjsDe(dir) { try { return fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).sort(); } catch { return []; } }
function hooksHashDe(dir) {
  const h = crypto.createHash('sha1'); let n = 0;
  for (const f of mjsDe(dir)) { try { h.update(f); h.update(fs.readFileSync(path.join(dir, f))); n++; } catch {} }
  return n ? h.digest('hex').slice(0, 12) : '';
}
async function modulosDe(root) {
  const dir = path.join(root, '.claude', 'hooks');
  if (path.resolve(dir).toLowerCase() === path.resolve(HOOKS_DIR).toLowerCase()) return PROPRIOS;
  const h = hooksHashDe(dir);
  if (!h) return PROPRIOS;
  const c = MODS.get(dir);
  if (c && c.hash === h) return c.mods;
  try {
    // copia isolada por hash: os imports relativos dentro dos modulos (presence -> task-telemetry) resolvem na
    // copia, nunca no cache de uma versao anterior do mesmo caminho. ~/.harness-run/mods/<hash>/ (limpa as antigas).
    const MODS_DIR = path.join(HOME_RUN, 'mods'); const cp = path.join(MODS_DIR, h);
    if (!fs.existsSync(path.join(cp, 'presence.mjs'))) {
      fs.mkdirSync(cp, { recursive: true });
      for (const f of mjsDe(dir)) fs.copyFileSync(path.join(dir, f), path.join(cp, f));
      try { for (const d of fs.readdirSync(MODS_DIR)) if (d !== h && ![...MODS.values()].some(x => x.hash === d)) fs.rmSync(path.join(MODS_DIR, d), { recursive: true, force: true }); } catch {}
    }
    const u = (f) => pathToFileURL(path.join(cp, f)).href;
    const [gb, pr, gf] = await Promise.all([import(u('guard-bash.mjs')), import(u('presence.mjs')), import(u('guard-folego.mjs'))]);
    if (typeof gb.guardBash !== 'function' || typeof pr.runPresence !== 'function' || typeof gf.checkFolego !== 'function') throw new Error('exports ausentes');
    const mods = { guardBash: gb.guardBash, runPresence: pr.runPresence, checkFolego: gf.checkFolego, hash: h };
    MODS.set(dir, { hash: h, mods });
    log(`modulos do projeto ${root} carregados (hooks ${h})`);
    return mods;
  } catch (e) {
    log(`modulos de ${root} indisponiveis (${e && e.message}) — usando os proprios (${VERSAO})`);
    return PROPRIOS;
  }
}
// versao "3.4.31" > "3.4.9"; '?' conta como 0
function cmpVer(a, b) {
  const A = String(a || '').split('.').map(x => parseInt(x, 10) || 0), B = String(b || '').split('.').map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(A.length, B.length); i++) { const d = (A[i] || 0) - (B[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
function readState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return null; } }
function writeState(o) { try { fs.mkdirSync(HOME_RUN, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(o)); } catch {} }
function markerPath(root) { return path.join(root, '.claude', '.harness-run', 'daemon.on'); }

async function httpJson(method, p, body, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, timeout: timeoutMs,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {} }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve({ status: res.statusCode, json: d ? JSON.parse(d) : null, text: d }); } catch { resolve({ status: res.statusCode, json: null, text: d }); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { try { req.destroy(); } catch {} resolve(null); });
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------- servidor
function servir() {
  let ultimo = Date.now(), n = 0, erros = 0;
  const started = Date.now();
  const hash = hooksHash();
  const srv = http.createServer((req, res) => {
    ultimo = Date.now();
    const url = req.url || '/';
    if (req.method === 'GET' && url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ pid: process.pid, port: PORT, started, uptime_min: Math.round((Date.now() - started) / 60000), requests: n, erros, hash, versao: VERSAO, hooks_dir: HOOKS_DIR, projetos: [...MODS.keys()] }));
      return;
    }
    if (req.method === 'POST' && url === '/stop') {
      res.writeHead(200); res.end('bye');
      log(`stop pedido (requests=${n})`);
      setTimeout(() => process.exit(0), 50);
      return;
    }
    const m = url.match(/^\/h\/([A-Za-z]+)\/([a-z-]+)$/);
    if (!m || req.method !== 'POST') { res.writeHead(404); res.end('rota'); return; }
    const [, evento, hook] = m;
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 2 * 1024 * 1024) { try { req.destroy(); } catch {} } else chunks.push(c); });
    req.on('end', async () => {
      n++;
      const body = Buffer.concat(chunks).toString('utf8');
      let cwd = '';
      try { cwd = (JSON.parse(body).cwd || ''); } catch {
        // payload fora do JSON estrito (paridade com o fallback por regex dos hooks): extrai o cwd
        const m2 = body.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (m2) cwd = m2[1].replace(/\\\\/g, '\\').replace(/\\\//g, '/');
      }
      const root = cwd && fs.existsSync(path.join(cwd, '.claude', 'harness.env')) ? cwd : '';
      if (!root) { erros++; res.writeHead(404); res.end('cwd sem harness'); return; }
      try {
        let out = '';
        const M = await modulosDe(root);   // 3.4.31: hooks do PROJETO que chamou, nao os do daemon
        if (hook === 'guard-bash') {
          const r = M.guardBash(body, 'pre', { root });
          if (r.exit === 2) {
            out = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: r.stderr.trim() } }) + '\n';
          } else out = r.stdout || '';
        } else if (hook === 'guard-bash-post') {
          const r = M.guardBash(body, 'post', { root, sendInProcess: true });
          out = r.stdout || '';
        } else if (hook === 'guard-folego') {
          // 3.4.22 (item 7): teto de folego em Edit|Write (o Bash passa pelo guard-bash acima)
          const r = M.checkFolego(body, { root });
          if (r.exit === 2) {
            out = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: r.stderr.trim() } }) + '\n';
          } else out = '';
        } else if (hook === 'presence') {
          const argv = evento === 'SessionStart' ? ['--start'] : evento === 'SessionEnd' ? ['--end']
            : evento === 'SubagentStart' ? ['--agent-start'] : evento === 'SubagentStop' ? ['--agent-end'] : ['--prompt'];
          M.runPresence(body, argv, { root, sendInProcess: true });
          out = '';
        } else { erros++; res.writeHead(404); res.end('hook'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(out);
      } catch (e) {
        erros++; log(`erro ${evento}/${hook}: ${e && e.message}`);
        res.writeHead(500); res.end('erro');
      }
    });
  });
  srv.on('error', (e) => { log(`servidor: ${e && e.message}`); process.exit(1); });
  srv.listen(PORT, '127.0.0.1', () => {
    writeState({ pid: process.pid, port: PORT, started, hash, versao: VERSAO, hooks_dir: HOOKS_DIR });
    log(`ativo pid=${process.pid} porta=${PORT} hash=${hash} versao=${VERSAO} (${HOOKS_DIR})`);
  });
  setInterval(() => {
    if (Date.now() - ultimo > IDLE_MIN * 60000) { log(`ocioso ha ${IDLE_MIN} min — encerrando (requests=${n})`); process.exit(0); }
  }, 60000).unref();
  // encerra limpo se o pai morrer e o stdio fechar (detached: nunca acontece; foreground: ctrl-c)
  process.on('SIGTERM', () => process.exit(0));
}

// ---------------------------------------------------------------- comandos
async function status() {
  const r = await httpJson('GET', '/status');
  return r && r.status === 200 && r.json ? r.json : null;
}
function iniciarDetached() {
  const ch = spawn(process.execPath, [SELF, '--foreground'], { detached: true, stdio: 'ignore', windowsHide: true, cwd: ROOT });
  ch.unref();
}
async function esperarAtivo(ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await status(); if (s) return s;
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}
async function start() {
  const s0 = await status();
  if (s0) return s0;
  iniciarDetached();
  return esperarAtivo();
}
async function stop() {
  const s = await status();
  if (!s) return false;
  await httpJson('POST', '/stop');
  await new Promise(r => setTimeout(r, 300));
  return true;
}
async function ensure(alvoRoot) {
  const marker = markerPath(alvoRoot);
  if ((ENV.HARNESS_DAEMON || 'on').toLowerCase() === 'off') {
    try { fs.unlinkSync(marker); } catch {}
    console.log('[daemon] harness-daemon desligado (HARNESS_DAEMON=off) — hooks em modo direto (node)');
    return 0;
  }
  const meu = hooksHash();
  let s = await status();
  if (s && s.hash !== meu) {
    // 3.4.31: um projeto ATRASADO nao derruba o daemon de um projeto mais novo — o daemon novo serve cada
    // requisicao com os modulos do proprio projeto que chamou. Mesma versao com hash diferente (edicao local,
    // sync parcial) ainda reinicia, como antes.
    if (cmpVer(s.versao, VERSAO) > 0) {
      log(`ensure: daemon ${s.versao} (hash ${s.hash}) e mais novo que este projeto (${VERSAO}) — mantido; modulos por projeto`);
    } else {
      log(`ensure: hash ${s.hash} != ${meu} (${s.versao || '?'} -> ${VERSAO}) — reiniciando`);
      await stop();
      s = null;
    }
  }
  if (!s) s = await start();
  if (!s) {
    try { fs.unlinkSync(marker); } catch {}
    console.log('[daemon] harness-daemon INDISPONIVEL (nao subiu na porta ' + PORT + ') — hooks em modo direto (node). Log: ' + LOG);
    return 1;
  }
  try { fs.mkdirSync(path.dirname(marker), { recursive: true }); fs.writeFileSync(marker, `${s.port}\n${s.pid}\n`); } catch {}
  console.log(`[daemon] harness-daemon ativo (porta ${s.port}, pid ${s.pid}, ${s.requests} req, hooks ${s.hash}) — Bash/presenca sem spawn de node`);
  return 0;
}

const cmd = process.argv[2] || '--status';
if (cmd === '--foreground') servir();
else if (cmd === '--start') { const s = await start(); console.log(s ? `DAEMON|ativo|${s.port}|${s.pid}` : 'DAEMON|falhou'); process.exit(s ? 0 : 1); }
else if (cmd === '--stop') { const ok = await stop(); console.log(ok ? 'DAEMON|parado' : 'DAEMON|inativo'); process.exit(0); }
else if (cmd === '--ensure') { process.exit(await ensure(process.argv[3] || process.cwd())); }
else { // --status
  const s = await status();
  console.log(s ? `DAEMON|ativo|porta=${s.port}|pid=${s.pid}|uptime=${s.uptime_min}min|requests=${s.requests}|erros=${s.erros}|hooks=${s.hash}|versao=${s.versao}` : 'DAEMON|inativo');
  process.exit(0);
}
