#!/usr/bin/env node
// .claude/hooks/frentes.mjs (3.4.21) — SEMAFORO de frentes pesadas por MAQUINA + fila.
//
// Motivo (medido 04/09): tres execucoes autonomas simultaneas no mesmo PC (136-b, 135-b, 138)
// levaram o spawn a 1.382 ms, o carga-maquina cortou os vivos para 2 em todas e a soma deu
// 858 min de parede para 27 tasks. A criacao de processo nesta maquina e serializada (~20/s),
// entao frentes paralelas nao somam: dividem. O `carga-maquina.sh` so reduz vivos DENTRO da
// sessao; este semaforo coordena ENTRE sessoes: 1 frente pesada por PC Windows (2 no macOS),
// as demais esperam na fila (modo autonomo) ou recebem a decisao (modo interativo).
//
// Slot = arquivo em ~/.harness-run/frentes/<label>.json com heartbeat. Quem segura: a execucao
// (/prd-exec, /dt-exec) — adquirido no despacho do 1o executor (guard-agent.sh, automatico) ou
// explicitamente na decolagem; renovado a cada despacho; liberado no stop da telemetria ou por
// inatividade (HARNESS_FRENTES_STALE_MIN, 45).
//
//   node .claude/hooks/frentes.mjs acquire --label PRD-137 --session <id> [--projeto X]
//   node .claude/hooks/frentes.mjs wait    --label PRD-137 --session <id> [--max-min 240] [--intervalo-s 30]
//   node .claude/hooks/frentes.mjs heartbeat|release --label PRD-137 | --session <id>
//   node .claude/hooks/frentes.mjs status
// Saida: FRENTES|ok|n/max|label · FRENTES|cheio|n/max|donos (exit 3) · FRENTES|timeout (exit 4)
//        FRENTES|off · FRENTES|liberado|label · FRENTE|label|projeto|sessao8|min-desde-heartbeat
// Knobs: HARNESS_FRENTES='on'|'off' · HARNESS_FRENTES_MAX (win32: 1, demais: 2) ·
//        HARNESS_FRENTES_STALE_MIN (45). Por maquina: ~/.harness.env.local.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { loadHarnessEnv } from './presence.mjs';

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_DIR = path.resolve(HOOKS_DIR, '..');
const ROOT = path.resolve(CLAUDE_DIR, '..');
const DIR = path.join(os.homedir(), '.harness-run', 'frentes');

const ENV = loadHarnessEnv(CLAUDE_DIR);   // 3.5.7: camadas (_defaults.env -> harness.env -> .local -> ~/.local; ambiente vence)

function num(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; }
const MAX = num(ENV.HARNESS_FRENTES_MAX, process.platform === 'win32' ? 1 : 2);
const STALE_MIN = num(ENV.HARNESS_FRENTES_STALE_MIN, 45);
const ON = (ENV.HARNESS_FRENTES || 'on').toLowerCase() !== 'off';

const args = process.argv.slice(2);
const cmd = args[0] || 'status';
const opt = (k, d = '') => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] || '') : d; };
// rotulo normalizado: PRD-137-exec / PRD-137-fase2 / PRD-137 sao a MESMA frente (o guard-agent
// adquire com o rotulo da PRD; o stop da telemetria libera com o rotulo da run)
const label = opt('label').replace(/[^A-Za-z0-9._-]/g, '').replace(/-(exec|fase[12])$/i, '').slice(0, 60);
const session = opt('session').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
const projeto = (opt('projeto') || path.basename(ROOT)).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 60);

// 3.5.7 (E6): slot sem heartbeat ha mais de STALE_MIN so expira se a SESSAO dona MORREU. Medido 16/09 (144): o
// heartbeat so renovava no despacho de hefesto/dedalo; a Fase 2 (review, 45 min sem executor) deixou o slot expirar,
// a 140-b entrou junto e as duas dividiram o spawn. Agora o guard-agent renova em TODO Agent de uma run viva e,
// mesmo sem heartbeat, o slot fica enquanto a sessao (sessoes.mjs --json, so consultado quando ha slot velho)
// existir — ate o teto absoluto HARNESS_FRENTES_TETO_H (24 h), que protege de sessao esquecida aberta por dias.
const TETO_H = num(ENV.HARNESS_FRENTES_TETO_H, 24);
let _vivas = null;
function sessoesVivas() { // Set de ids de sessao vivos nesta maquina (lazy, 1 chamada por processo; vazio = nao soube)
  if (_vivas) return _vivas;
  _vivas = new Set();
  try {
    let j;
    if (ENV.HARNESS_FRENTES_SESSOES_JSON) j = JSON.parse(fs.readFileSync(ENV.HARNESS_FRENTES_SESSOES_JSON, 'utf8'));   // so para teste (suite t-357)
    else { const r = spawnSync(process.execPath, [path.join(HOOKS_DIR, 'sessoes.mjs'), '--json'], { encoding: 'utf8', windowsHide: true, timeout: 20000 }); j = JSON.parse(r.stdout || '{}'); }
    for (const s of (j.sessoes || [])) if (s.sessao) _vivas.add(s.sessao);
    _vivas.ok = true;
  } catch { _vivas.ok = false; }
  return _vivas;
}
function slots() { // vivos (stale de sessao MORTA removidos)
  try { fs.mkdirSync(DIR, { recursive: true }); } catch {}
  const now = Date.now(); const out = [];
  let files = []; try { files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')); } catch {}
  for (const f of files) {
    const p = path.join(DIR, f);
    let o = null; try { o = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
    const hb = o && o.heartbeat ? o.heartbeat : 0;
    let stale = false;
    if (!o) { try { fs.unlinkSync(p); } catch {} continue; }
    if (now - hb > STALE_MIN * 60000) {
      const tetoEstourado = now - (o.criado || hb) > TETO_H * 3600000;
      const viva = !tetoEstourado && o.session && (() => { const v = sessoesVivas(); return v.ok && v.has(o.session); })();
      if (!viva) { try { fs.unlinkSync(p); } catch {} continue; }
      stale = true;   // sessao viva sem heartbeat: segue ocupando (a run pode estar em review/gate)
    }
    out.push({ ...o, file: p, idadeMin: Math.round((now - hb) / 60000), stale });
  }
  return out.sort((a, b) => a.criado - b.criado);
}
function meu(list) { return list.find(s => (label && s.label === label) || (session && s.session === session)); }
function donos(list) { return list.map(s => `${s.label}@${s.projeto}(${s.idadeMin}min)`).join(', ') || '-'; }
function gravar(o) { try { fs.writeFileSync(path.join(DIR, o.label + '.json'), JSON.stringify(o)); } catch {} }

function acquire() {
  if (!ON) { console.log('FRENTES|off'); return 0; }
  if (!label) { console.log('FRENTES|erro|--label obrigatorio'); return 2; }
  const list = slots();
  const m = meu(list);
  const now = Date.now();
  if (m) { m.heartbeat = now; if (session && !m.session) m.session = session; gravar(m); console.log(`FRENTES|ok|${list.length}/${MAX}|${m.label}|renovado`); return 0; }
  if (list.length >= MAX) { console.log(`FRENTES|cheio|${list.length}/${MAX}|${donos(list)}`); return 3; }
  gravar({ label, session, projeto, host: os.hostname().split('.')[0], criado: now, heartbeat: now });
  console.log(`FRENTES|ok|${list.length + 1}/${MAX}|${label}`);
  return 0;
}
function heartbeat() {
  if (!ON) { console.log('FRENTES|off'); return 0; }
  const m = meu(slots()); if (!m) { console.log('FRENTES|sem-slot'); return 0; }
  m.heartbeat = Date.now(); gravar(m); console.log(`FRENTES|ok|heartbeat|${m.label}`); return 0;
}
function release() {
  const m = meu(slots()); if (!m) { console.log('FRENTES|sem-slot'); return 0; }
  try { fs.unlinkSync(m.file); } catch {}
  console.log(`FRENTES|liberado|${m.label}`); return 0;
}
function status() {
  const list = slots();
  console.log(`FRENTES|status|${list.length}/${MAX}|max=${MAX}|stale=${STALE_MIN}min|${ON ? 'on' : 'off'}|teto=${TETO_H}h`);
  for (const s of list) console.log(`FRENTE|${s.label}|${s.projeto}|${(s.session || '').slice(0, 8)}|${s.idadeMin}${s.stale ? '|sessao-viva-sem-heartbeat' : ''}`);
  return 0;
}
async function wait() {
  if (!ON) { console.log('FRENTES|off'); return 0; }
  const maxMin = num(opt('max-min'), 240), intervaloS = num(opt('intervalo-s'), 30);
  const t0 = Date.now(); let aviso = 0;
  for (;;) {
    const list = slots();
    const m = meu(list);
    if (m || list.length < MAX) { return acquire(); }
    const min = Math.round((Date.now() - t0) / 60000);
    if (Date.now() - aviso > 120000) { console.log(`FRENTES|esperando|${list.length}/${MAX}|${donos(list)}|${min}min`); aviso = Date.now(); }
    if (min >= maxMin) { console.log(`FRENTES|timeout|${maxMin}min|${donos(list)}`); return 4; }
    await new Promise(r => setTimeout(r, intervaloS * 1000));
  }
}

let rc = 0;
if (cmd === 'acquire') rc = acquire();
else if (cmd === 'heartbeat') rc = heartbeat();
else if (cmd === 'release') rc = release();
else if (cmd === 'wait') rc = await wait();
else rc = status();
process.exit(rc);
