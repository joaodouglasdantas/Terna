#!/usr/bin/env node
// .claude/hooks/task-telemetry.mjs (3.4.22 — item 8) — TELEMETRIA POR TASK no SubagentStop.
//
// Motivo (medido 04/09): 0 linhas em watchdog-overruns.jsonl em projeto com 6 agentes > 60 min;
// 16 marcadores .start orfaos; o p90 do watchdog vinha de dashboards de 22-31/08; duracao por
// task so existia em prosa. Agora CADA subagente que termina vira uma linha em
//   prds/_metrics/tasks/<usuario>@<maquina>[~worktree].jsonl   (versionado, um arquivo por
//   dev/maquina = append-only sem conflito de merge, mesma regra dos runs/ da 3.2.2)
// com: ts, projeto, maquina, autor, harness, sessao, agent_id, papel, rotulo (TASK/DT/PRD/LOTE
// + ciclo), modelo, dur_s, turnos, chamadas por ferramenta (bash/read/grep/glob/edit/write/agent),
// tokens_in/out, status (✅/⚠️/⛔/PARCIAL do ultimo texto do agente), vermelhos (🔴 do relatorio
// de revisor), packet_kb/alvos (se o packet da task existe), worktree, thinking_pct (3.5.3).
// 3.5.3: turnos e tokens_in/out passam a ser POR MENSAGEM UNICA (dedup por message.id — ver
// medirTranscript); linhas anteriores a 13/09/2026 estao infladas, nao comparar cru.
//
// Quem chama: presence.mjs --agent-end (hook SubagentStop, tambem via daemon) — mesma
// requisicao, zero spawn extra. Consumidores: guard-agent.sh --post (aviso de overrun sem
// marcador .start), watchdog-baseline.sh (p90 por papel dos ultimos 30 dias), task-packet.sh
// --check (PREVISAO|min), harness-dashboard.mjs (tasks acima do envelope, duracao por papel).
//
// CLI:  node task-telemetry.mjs                       (stdin = JSON do hook SubagentStop)
//       node task-telemetry.mjs --p90 <papel> [dias]   -> segundos (vazio se n < 5)
//       node task-telemetry.mjs --ultima <papel> [seg] -> dur_s|turnos|rotulo|agent_id|status|verif_sem_prova (ultima linha do papel em N seg)
// 3.4.25 (melhoria 4): campos verif_total, verif_sem_prova e status_motivo — a secao "## Verificacoes" do
// relatorio e auditada (item que declara sucesso sem saida colada = sem prova; > 0 rebaixa ✅ para ⚠️).
//       node task-telemetry.mjs --previsao <papel> <kb> [alvos] -> min|n=<k>  (vazio = n/d)
//       node task-telemetry.mjs --tail [N]             -> ultimas N linhas (debug)
// Knob: HARNESS_TASK_TELEMETRY='on'|'off'.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeCtx } from './presence.mjs';

function campo(input, nome) { const m = input.match(new RegExp('"' + nome + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"')); return m ? m[1].replace(/\\\\/g, '\\').replace(/\\\//g, '/').replace(/\\"/g, '"') : ''; }
const clean = s => String(s || '').replace(/[\x00-\x1f"\\]/g, '').slice(0, 200);

function arquivoTasks(ctx) {
  const { ROOT, CLAUDE_DIR } = ctx;
  let user = 'dev', host = 'maquina';
  try { user = os.userInfo().username || user; } catch {}
  try { host = (os.hostname() || host).split('.')[0]; } catch {}
  let wt = '';
  try { const m = fs.readFileSync(path.join(CLAUDE_DIR, '.harness-run', 'worktree.env'), 'utf8').match(/^rotulo=(.*)$/m); if (m && m[1].trim()) wt = '~' + m[1].trim(); } catch {}
  const nome = (user + '@' + host + wt).replace(/[^A-Za-z0-9@._~-]/g, '_') + '.jsonl';
  return path.join(ROOT, 'prds', '_metrics', 'tasks', nome);
}
function gitEmail(ROOT) {
  for (const f of [path.join(ROOT, '.git', 'config'), path.join(os.homedir(), '.gitconfig')]) {
    try { const m = fs.readFileSync(f, 'utf8').match(/^\s*email\s*=\s*(.+)$/m); if (m) return m[1].trim(); } catch {}
  }
  return '';
}

// Localiza o transcript do subagente a partir do payload do SubagentStop (agent_id + transcript
// do pai). Fallback: arquivo mais recente da pasta subagents/ da sessao.
function acharTranscript(input) {
  const id = campo(input, 'agent_id');
  // 3.4.27: o SubagentStop traz agent_transcript_path (o do proprio agente) — usa-lo primeiro
  let tp = (campo(input, 'agent_transcript_path') || campo(input, 'transcript_path')).replace(/\\/g, '/');
  if (!tp) return { file: '', id };
  const ix = tp.indexOf('/subagents/');
  // 3.4.30: agent_transcript_path que NAO existe em disco (SubagentStop de agente que nunca escreveu — medido 09/09,
  // exec PRD-140: 2 linhas general-purpose com 0 turnos) nao e transcript: cai no 'sem arquivo' e nao grava linha.
  if (ix > 0) { const f = tp; if ((!id || f.includes(id)) && fs.existsSync(f)) return { file: f, id: id || path.basename(f).replace(/\.jsonl$/, '').replace(/^agent-/, '') }; tp = tp.slice(0, ix) + '.jsonl'; }
  const dir = tp.replace(/\.jsonl$/, '') + '/subagents';
  if (id) { const f = path.join(dir, 'agent-' + id + '.jsonl'); if (fs.existsSync(f)) return { file: f, id }; }
  // 3.4.27: com agent_id no payload e SEM arquivo, NAO cai no "mais recente" — medido 09/09 no Mariana:
  // tres SubagentStop com ids sem transcript pegaram o hefesto/sherlock VIVO e gravaram linhas
  // fantasma (8 s / 6 turnos) que poluem p90 e placar. Fallback so quando o payload nao traz id.
  if (id) return { file: '', id };
  try {
    const cands = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => ({ f: path.join(dir, f), m: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
    if (cands.length && Date.now() - cands[0].m < 5 * 60000) return { file: cands[0].f, id: path.basename(cands[0].f).replace(/\.jsonl$/, '').replace(/^agent-/, '') };
  } catch {}
  return { file: '', id };
}

// 3.4.25 (melhoria 4) — RELATORIO AUDITADO. O relatorio do agente e o ultimo bloco de texto do
// assistente com >= 200 chars. Se ele tem a secao "## Verificacoes", cada item (`- ...`) que
// DECLARA sucesso (OK/✅/passou/verde/N/N itens) precisa de PROVA no proprio item: um fence de
// codigo (```) ou uma linha `saida:`/`saída:`/`>` ate o item seguinte, ou o item citar um arquivo de
// relatorio/log com caminho. Sem secao => campos vazios. Nunca lanca.
const RX_VERIF_SECAO = /^#{1,6}\s*verifica(c|ç)(o|õ)es\b/i;
const RX_ITEM = /^\s{0,1}(?:[-*]|\d+[.)])\s+/;
const RX_SUCESSO = /(✅|\bOK\b|\bok\b|\bpassou\b|\bverde\b|\b\d+\/\d+\s+ite(m|ns)\b)/;
const RX_PROVA_LINHA = /^\s*(?:[-*]\s+)?(?:```|~~~|sa[ií]da\s*:|>)/i;
const RX_PROVA_CAMINHO = /((\.harness-run|relat[oó]rios?|logs?|reports?)\/[\w.\-/]+|[\w\-.]+\/[\w\-./]*\.(log|txt|jsonl|json|xml|html|md))\b/;
export function avaliarVerificacoes(relatorio) {
  const out = { verif_total: '', verif_sem_prova: '' };
  try {
    const ls = String(relatorio || '').split(/\r?\n/);
    let ini = -1;
    for (let i = 0; i < ls.length; i++) if (RX_VERIF_SECAO.test(ls[i])) { ini = i; break; }
    if (ini < 0) return out;
    let fim = ls.length;
    for (let i = ini + 1; i < ls.length; i++) if (/^#{1,6}\s/.test(ls[i])) { fim = i; break; }
    const sec = ls.slice(ini + 1, fim);
    const itens = [];
    for (let i = 0; i < sec.length; i++) if (RX_ITEM.test(sec[i])) itens.push(i);
    let total = 0, sem = 0; const semItens = [];
    for (let k = 0; k < itens.length; k++) {
      const a = itens[k], b = k + 1 < itens.length ? itens[k + 1] : sec.length;
      const item = sec[a].replace(RX_ITEM, '');
      if (!RX_SUCESSO.test(item)) continue;
      total++;
      let prova = RX_PROVA_CAMINHO.test(item);
      for (let j = a + 1; j < b && !prova; j++) if (RX_PROVA_LINHA.test(sec[j])) prova = true;
      if (!prova) { sem++; semItens.push(item.replace(/[`*|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 70)); }   // 3.5.6 (D9): QUAIS itens
    }
    out.verif_total = total; out.verif_sem_prova = sem; out.verif_sem_prova_itens = semItens;
  } catch {}
  return out;
}

// 3.5.3 (medido 12/09, PRD-142-b-exec): UMA mensagem do assistente vira VARIAS linhas no transcript
// (uma por bloco: thinking/text/tool_use), todas com o MESMO message.id e usage.output_tokens
// CUMULATIVO (a ultima linha traz o total). Contar linha = turno e somar toda linha deu 292 turnos /
// 173k na TASK-004 onde havia 151 mensagens / 171,5k. Agora: turnos = ids unicos (+1 por linha sem
// id); tokIn/tokOut = soma, por id, da linha de MAIOR output_tokens (tokIn da MESMA linha). As
// contagens de ferramenta NAO mudam (cada tool_use e um bloco, aparece uma vez).
// thinkingPct: os blocos 'thinking' vem com texto vazio (so assinatura) — o raciocinio so aparece
// como diferenca: visiveisTok = (chars de text + chars do JSON do input de cada tool_use) / 3,6;
// thinkingPct = 100*(tokOut - visiveisTok)/tokOut (inteiro >= 0; '' quando tokOut = 0).
// Linhas de task anteriores a 13/09/2026 estao infladas em turnos (~2x) e tokens_out (ate ~2x).
export function medirTranscript(file) {
  const r = { turnos: 0, tools: {}, tokIn: 0, tokOut: 0, ini: Infinity, fim: 0, modelo: '', ultimoTexto: '', primeiroPrompt: '', relatorio: '', visiveisTok: 0, thinkingPct: '' };
  let txt; try { txt = fs.readFileSync(file, 'utf8'); } catch { return r; }
  const porId = new Map();   // message.id -> { inp, out } da linha de maior output
  let visChars = 0;
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const t = o.timestamp ? Date.parse(o.timestamp) : NaN;
    if (!Number.isNaN(t)) { if (t < r.ini) r.ini = t; if (t > r.fim) r.fim = t; }
    const msg = o.message || {};
    if (o.type === 'user' && !r.primeiroPrompt && typeof msg.content === 'string') r.primeiroPrompt = msg.content.slice(0, 400);
    if (o.type !== 'assistant') continue;
    const id = msg.id ? String(msg.id) : '';
    if (!id) r.turnos++;
    if (msg.model && !r.modelo) r.modelo = String(msg.model);
    const u = msg.usage || o.usage;
    if (u) {
      const inp = u.input_tokens || 0, out = u.output_tokens || 0;
      if (!id) { r.tokIn += inp; r.tokOut += out; }
      else { const ant = porId.get(id); if (!ant || out > ant.out) porId.set(id, { inp, out }); }
    } else if (id && !porId.has(id)) porId.set(id, { inp: 0, out: 0 });
    const c = Array.isArray(msg.content) ? msg.content : [];
    for (const b of c) {
      if (b && b.type === 'tool_use') { const k = String(b.name || '?').toLowerCase(); r.tools[k] = (r.tools[k] || 0) + 1; try { visChars += JSON.stringify(b.input === undefined ? {} : b.input).length; } catch {} }
      else if (b && b.type === 'text' && b.text && b.text.trim()) {
        visChars += b.text.length;
        r.ultimoTexto = b.text.slice(-1500);
        if (b.text.trim().length >= 200) r.relatorio = b.text.slice(0, 40000);   // 3.4.25: relatorio = ultimo bloco >= 200 chars
      }
    }
  }
  r.turnos += porId.size;
  for (const v of porId.values()) { r.tokIn += v.inp; r.tokOut += v.out; }
  r.visiveisTok = Math.round(visChars / 3.6);
  r.thinkingPct = r.tokOut > 0 ? Math.max(0, Math.round(100 * (r.tokOut - r.visiveisTok) / r.tokOut)) : '';
  return r;
}
function statusDe(txt) {
  const t = txt || '';
  if (/PARCIAL/i.test(t)) return 'PARCIAL';
  if (/⛔|BLOQUEAD/i.test(t)) return '⛔';
  if (/⚠️|RESSALVA|Bloqueantes encontrados/i.test(t)) return '⚠️';
  if (/✅|CONCLU[IÍ]D|Limpo|Pronta para executar|sem achados/i.test(t)) return '✅';
  return '';
}
function vermelhosDe(txt) { const m = (txt || '').match(/🔴\s*(\d+)/); return m ? parseInt(m[1], 10) : ''; }
// 3.5.5 (C8): a linha **Veredito:**/**Status:** do relatorio manda — e a LEGENDA do template ("✅ … | ⚠️ … | ⛔ …") ou a
// citacao do ciclo anterior NAO contam. Medido 15/09: dois beholders aprovados (✅ 0 🔴) gravados como ⛔ (141-b c1, 144 c2)
// e os outros 7 gates da tarde com status vazio. Ordem: 1o emoji da linha de veredito; senao o texto sem linhas de legenda.
// 3.5.6 (D13): a linha vale com ou sem negrito — `Status: ✅ CONCLUÍDO` (dedalo TASK-002 da 141-b, 15/09) gravava status vazio.
export function statusDoRelatorio(txt) {
  const t = String(txt || '');
  const decl = t.match(/(?:^|\n)[ \t]*\*{0,2}(Veredito|Status):\*{0,2}[ \t]*([^\n]{0,160})/);
  if (decl) {
    const primeiro = decl[2].split(/\s+\|\s+|\s+·\s+/)[0];
    if (/^\s*[<\[]/.test(primeiro)) return '';   // placeholder do template ecoado ("<escreva SO o escolhido ...>") = sem veredito
    const s = statusDe(primeiro); if (s) return s;
  }
  const semLegenda = t.split('\n').filter(l => !(((l.match(/✅|⚠️|⛔|ℹ️/g) || []).length >= 2) && /\||·/.test(l))).join('\n');
  return statusDe(semLegenda);
}

export function recordTask(input, opts = {}) {
  try {
    const ctx = makeCtx(opts.root);
    const { ENV, ROOT, CLAUDE_DIR } = ctx;
    if ((ENV.HARNESS_TASK_TELEMETRY || 'on').toLowerCase() === 'off') return null;
    const { file, id } = acharTranscript(input);
    if (!file) return null;
    let papel = campo(input, 'agent_type'), desc = '';
    try { const meta = fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'); if (!papel) papel = (meta.match(/"agentType"\s*:\s*"([^"]*)"/) || [])[1] || ''; desc = (meta.match(/"description"\s*:\s*"([^"]*)"/) || [])[1] || ''; } catch {}
    const m = medirTranscript(file);
    if (!m.turnos && !m.tokOut) return null;   // 3.4.30: transcript vazio = nada medido, nada gravado
    const fonte = desc + ' ' + m.primeiroPrompt;
    const rot = (fonte.match(/(TASK|DT)-\d{2,4}[a-z]?/) || fonte.match(/(PRD|LOTE)-\d{2,4}(-[a-z])?/) || [''])[0];
    const ciclo = (fonte.match(/ciclo\s*(\d+)/i) || [])[1] || '';
    const rotulo = rot + (ciclo ? '-c' + ciclo : '');
    let packetKb = '', alvos = '';
    if (/^(TASK|DT)-/.test(rot)) {
      try { const p = path.join(CLAUDE_DIR, '.harness-run', 'packets', rot + '.packet.md'); const st = fs.statSync(p); packetKb = Math.round(st.size / 1024); alvos = (fs.readFileSync(p, 'utf8').match(/^### `/gm) || []).length; } catch {}
    }
    let wt = ''; try { wt = (fs.readFileSync(path.join(CLAUDE_DIR, '.harness-run', 'worktree.env'), 'utf8').match(/^rotulo=(.*)$/m) || [])[1] || ''; } catch {}
    let user = 'dev', host = 'maquina';
    try { user = os.userInfo().username || user; } catch {}
    try { host = (os.hostname() || host).split('.')[0]; } catch {}
    // 3.4.25 (melhoria 4): verificacao declarada sem prova rebaixa ✅ para ⚠️ (HARNESS_VERIF_PROVA=off so mede)
    // 3.5.6 (D13): o RELATORIO vem ANTES do ultimo texto — a linha Status/Veredito do relatorio (ultimo bloco longo do
    // transcript + o arquivo .harness-run/relatorios/<rot>-<papel>.md), com ou sem negrito, decide; o ultimoTexto (sumario
    // curto, muitas vezes sem emoji) e fallback. Antes: ultimoTexto primeiro (3.5.5) e so `**Status:**` em negrito.
    let relTxt = String(m.relatorio || '').slice(0, 2400);
    try { if (rot && papel) relTxt += '\n' + fs.readFileSync(path.join(CLAUDE_DIR, '.harness-run', 'relatorios', rot + '-' + papel + '.md'), 'utf8').slice(0, 2400); } catch {}
    const sUlt = statusDoRelatorio(m.ultimoTexto);
    const sRel = statusDoRelatorio(relTxt);
    let status = sRel || sUlt, statusMotivo = '';
    if (sRel && sUlt && sRel !== sUlt) statusMotivo = 'linha Status/Veredito do relatorio (' + sRel + ') sobrepoe o texto final (' + sUlt + ')';
    else if (sRel && !sUlt) statusMotivo = 'status lido do relatorio (texto final sem veredito)';
    // 3.4.30: o ULTIMO texto de um agente cortado pelo folego e o Write negado (⛔) — o Status real esta no
    // relatorio. Medido 09/09 (PRD-140 TASK-003): relatorio dizia PARCIAL-TEMPO, telemetria gravou ⛔, o aviso ao pai nao saiu.
    if (status !== 'PARCIAL' && /PARCIAL/i.test(relTxt.slice(0, 1600))) { status = 'PARCIAL'; statusMotivo = 'relatorio declara PARCIAL'; }
    const verif = avaliarVerificacoes(m.relatorio || m.ultimoTexto);
    if (Number(verif.verif_sem_prova) > 0 && status === '✅' && (ENV.HARNESS_VERIF_PROVA || 'on').toLowerCase() !== 'off') {
      status = '⚠️'; statusMotivo = `verificacao sem prova (${verif.verif_sem_prova})`;
    }
    const linha = {
      ts: Math.floor((m.fim || Date.now()) / 1000), projeto: path.basename(ROOT), maquina: user + '@' + host, autor: clean(gitEmail(ROOT)),
      harness: ENV.HARNESS_VERSION || '', sessao: clean(campo(input, 'session_id')).slice(0, 36), agent_id: clean(id).slice(0, 40),
      papel: clean(papel || 'general-purpose'), rotulo: clean(rotulo), modelo: clean(m.modelo),
      dur_s: (Number.isFinite(m.ini) && m.fim > m.ini) ? Math.round((m.fim - m.ini) / 1000) : '',
      turnos: m.turnos, bash: m.tools.bash || 0, read: m.tools.read || 0, grep: m.tools.grep || 0, glob: m.tools.glob || 0,
      edit: m.tools.edit || 0, write: m.tools.write || 0, agent: m.tools.agent || 0,
      tokens_in: m.tokIn, tokens_out: m.tokOut, status, vermelhos: vermelhosDe(m.ultimoTexto),
      packet_kb: packetKb, alvos, worktree: clean(wt.trim()),
      verif_total: verif.verif_total, verif_sem_prova: verif.verif_sem_prova, status_motivo: statusMotivo,
      thinking_pct: m.thinkingPct,   // 3.5.3: % estimado de raciocinio invisivel ('' = n/d)
    };
    const f = arquivoTasks(ctx);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    // 3.4.27: dedup — o SubagentStop chegou 2x para o mesmo agente (medido 09/09: hefesto DT-545 em dobro)
    try { const ult = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).slice(-20); if (linha.agent_id && ult.some(l => l.includes('"agent_id":"' + linha.agent_id + '"'))) return null; } catch {}
    fs.appendFileSync(f, JSON.stringify(linha) + '\n');
    // tambem o legado local (nao versionado), para o proprio projeto olhar sem depender do git
    try { fs.appendFileSync(path.join(CLAUDE_DIR, '.harness-run', 'tasks-ultimas.jsonl'), JSON.stringify(linha) + '\n'); } catch {}
    return linha;
  } catch { return null; }
}

// ---- leitura (consumidores)
export function lerTasks(root, dias = 30) {
  const ROOT = path.resolve(root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const dir = path.join(ROOT, 'prds', '_metrics', 'tasks');
  const desde = Math.floor(Date.now() / 1000) - dias * 86400;
  const out = [];
  let arqs = []; try { arqs = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { return out; }
  const projeto = path.basename(ROOT);
  for (const a of arqs) {
    let txt; try { txt = fs.readFileSync(path.join(dir, a), 'utf8'); } catch { continue; }
    for (const l of txt.split('\n')) { if (!l.trim()) continue; let o; try { o = JSON.parse(l); } catch { continue; } if (o.ts >= desde && (!o.projeto || o.projeto === projeto)) out.push(o); }
  }
  return out;
}
const p90 = arr => { const a = arr.filter(x => Number.isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; return a[Math.min(a.length - 1, Math.floor(a.length * 0.9))]; };
const mediana = arr => { const a = arr.filter(x => Number.isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

export function p90PorPapel(root, papel, dias = 30) {
  const ds = lerTasks(root, dias).filter(o => o.papel === papel && Number.isFinite(Number(o.dur_s)) && Number(o.dur_s) > 0).map(o => Number(o.dur_s));
  return ds.length >= 5 ? p90(ds) : null;
}
export function previsao(root, papel, kb, alvos) {
  const k = Number(kb) || 0;
  const cands = lerTasks(root, 60).filter(o => o.papel === papel && Number(o.dur_s) > 0 && Number(o.packet_kb) > 0)
    .filter(o => k <= 0 || (Number(o.packet_kb) >= k * 0.6 && Number(o.packet_kb) <= k * 1.6))
    .filter(o => !alvos || !o.alvos || Math.abs(Number(o.alvos) - Number(alvos)) <= 2);
  if (cands.length < 3) return null;
  return { min: Math.round(mediana(cands.map(o => Number(o.dur_s))) / 60), n: cands.length };
}
export function ultimaDoPapel(root, papel, seg = 180) {
  const ctx = makeCtx(root);
  const agora = Math.floor(Date.now() / 1000);
  let txt = ''; try { txt = fs.readFileSync(path.join(ctx.CLAUDE_DIR, '.harness-run', 'tasks-ultimas.jsonl'), 'utf8'); } catch { return null; }
  const ls = txt.split('\n').filter(Boolean).slice(-60);
  for (let i = ls.length - 1; i >= 0; i--) { let o; try { o = JSON.parse(ls[i]); } catch { continue; } if (o.papel === papel && agora - o.ts <= seg) return o; }
  return null;
}

function isMain() { try { return path.resolve(process.argv[1] || '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); } catch { return false; } }
if (isMain()) {
  const a = process.argv.slice(2);
  const root = process.cwd();
  if (a[0] === '--p90') { const v = p90PorPapel(root, a[1] || '', parseInt(a[2] || '30', 10) || 30); process.stdout.write(v == null ? '' : String(Math.round(v))); process.exit(0); }
  if (a[0] === '--previsao') { const v = previsao(root, a[1] || 'hefesto', a[2] || 0, a[3] || 0); process.stdout.write(v ? `${v.min}|n=${v.n}` : ''); process.exit(0); }
  // 3.4.25: 6o campo verif_sem_prova (vazio = sem secao de verificacoes); ordem dos 5 primeiros inalterada
  if (a[0] === '--ultima') { const o = ultimaDoPapel(root, a[1] || '', parseInt(a[2] || '180', 10) || 180); process.stdout.write(o ? [o.dur_s, o.turnos, o.rotulo, o.agent_id, o.status, o.verif_sem_prova ?? '', String(o.verif_sem_prova_itens || '').replace(/\|/g, '/')].join('|') : ''); process.exit(0); }   // 3.5.6 (D9): 7o campo = itens sem prova
  if (a[0] === '--tail') { const n = parseInt(a[1] || '10', 10) || 10; const ls = lerTasks(root, 365).slice(-n); for (const o of ls) console.log(JSON.stringify(o)); process.exit(0); }
  // 3.5.7 (E5): tasks de executor fechadas ✅ desde <epoch> nesta arvore (tasks-ultimas.jsonl) — rotulo|ts|papel, a
  // linha mais recente de cada rotulo. O guard-agent --post cruza com o git log para avisar task ✅ sem commit.
  if (a[0] === '--fechadas') {
    const t0 = parseInt(a[1] || '0', 10) || 0; const ctx = makeCtx(root);
    let txt = ''; try { txt = fs.readFileSync(path.join(ctx.CLAUDE_DIR, '.harness-run', 'tasks-ultimas.jsonl'), 'utf8'); } catch {}
    const ult = new Map();
    for (const l of txt.split('\n').filter(Boolean).slice(-300)) { let o; try { o = JSON.parse(l); } catch { continue; } if (o.ts >= t0 && /^(hefesto|dedalo)$/.test(o.papel) && /^(TASK|DT)-/.test(o.rotulo || '') && String(o.status || '').includes('✅')) ult.set(o.rotulo, o); }
    for (const o of ult.values()) console.log(`${o.rotulo}|${o.ts}|${o.papel}`);
    process.exit(0);
  }
  let input = ''; try { input = fs.readFileSync(0, 'utf8'); } catch {}
  let r = ''; try { const c = campo(input, 'cwd'); if (c && fs.existsSync(path.join(c, '.claude', 'harness.env'))) r = c; } catch {}
  const l = recordTask(input, { root: r || undefined });
  if (l) console.log(`TASK|${l.papel}|${l.rotulo}|${l.dur_s}s|${l.turnos} turnos|${l.status}`);
  process.exit(0);
}
