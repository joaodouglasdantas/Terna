#!/usr/bin/env node
// .claude/hooks/guard-bash.mjs (3.4.8; modulo 3.4.21) — PORT do guard-bash.sh para Node (hot-path #7).
// Roda em TODO Bash tool call (PreToolUse) + --post (PostToolUse/PostToolUseFailure);
// no Windows o fork do bash custava 6-9s sob carga — em Node fica ~80-150ms, sem jq.
//
// PARIDADE integral com o guard-bash.sh: GUARDA 1 (temporarios fora do projeto) e
// GUARDA 2 (anti-espiral com fusivel de wiring), mesmos arquivos de estado
// (.harness-run/exec-attempts/<cksum>), mesmas mensagens, mesmos exit codes
// (0 ok / 2 bloqueado). O guard-bash.sh continua no repo p/ fallback e host Codex —
// mudanca de regra deve tocar os DOIS.
//
// 3.4.21 — tres mudancas, todas medidas em 04/09 no PC do Charles (149 subagentes, 2 dias):
//   GUARDA 0  1.966 das 3.007 chamadas Bash de subagente eram LEITURA pura (grep/sed -n/cat/ls/wc)
//             apesar da dica instrutiva da 3.4.12 estar em 9 agentes. Agora, em subagente, leitura
//             pura e NEGADA (exit 2) com a ferramenta certa na cara (Read/Grep/Glob). Cada Bash
//             custa 0,3-5 s so de criacao de processo (bash + hooks); Read responde em 0,1 s.
//             HARNESS_GUARD_READ_VIA_BASH = 'agentes' (default) | 'todos' | 'off'.
//   --post    roda a presenca (presence.mjs) NO MESMO processo: eram 2 hooks (2 bash + 2 node)
//             por Bash; agora 1. O throttle de 5/10 min fica dentro — sem spawn para descobrir
//             que nao ha nada a enviar.
//   modulo    `guardBash(input, mode, {root})` exportado para o harness-daemon.mjs atender sem
//             spawn; o CLI (`node guard-bash.mjs [--post]`) continua identico para o fallback.
//
// Wiring (settings.json): PreToolUse Bash -> `node .claude/hooks/guard-bash.mjs` (ou o curl do
// daemon com este comando de fallback); PostToolUse + PostToolUseFailure Bash ->
// `node .claude/hooks/guard-bash.mjs --post`. O fusivel da GUARDA 2 aceita o wiring .sh OU .mjs
// (>= 2 ocorrencias de '--post').

import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { runPresence, loadHarnessEnv, harnessEnvStamp, subagenteDoPayload } from './presence.mjs';
import { gravarIncidente } from './guard-folego.mjs';   // 3.5.0: incidente 'leitura' versionado por dev/maquina
import { checkFolego } from './guard-folego.mjs';
import { checkPlaywright, creditarRodada } from './guard-playwright.mjs';   // 3.5.1: redea de teste no executor (teto de rodadas + so o proprio spec); 3.5.4: credito no e2e-lock

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- contexto por projeto
const ctxCache = new Map();
function makeCtx(rootDir) {
  const ROOT = path.resolve(rootDir || path.resolve(HOOKS_DIR, '..', '..'));
  const CLAUDE_DIR = path.join(ROOT, '.claude');
  const stamp = harnessEnvStamp(CLAUDE_DIR);   // 3.5.7: camadas (_defaults.env -> harness.env -> .local -> ~/.local; ambiente vence)
  const hit = ctxCache.get(ROOT);
  if (hit && hit.stamp === stamp) return hit;
  const ENV = loadHarnessEnv(CLAUDE_DIR);
  const ctx = { ROOT, CLAUDE_DIR, ENV, stamp,
    RUN_DIR: path.join(CLAUDE_DIR, '.harness-run'),
    ATT_DIR: path.join(CLAUDE_DIR, '.harness-run', 'exec-attempts') };
  ctxCache.set(ROOT, ctx);
  return ctx;
}

// cksum POSIX (CRC-32/cksum + length), identico ao `cksum` do coreutils — os contadores
// sao COMPARTILHADOS com o guard-bash.sh (mesma chave p/ o mesmo comando).
function cksumPosix(str) {
  const buf = Buffer.from(str, 'utf8');
  let crc = 0;
  const table = cksumPosix._t || (cksumPosix._t = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i << 24;
      for (let j = 0; j < 8; j++) c = (c & 0x80000000) ? ((c << 1) ^ 0x04c11db7) >>> 0 : (c << 1) >>> 0;
      t[i] = c >>> 0;
    }
    return t;
  })());
  for (const b of buf) crc = ((crc << 8) ^ table[((crc >>> 24) ^ b) & 0xff]) >>> 0;
  let len = buf.length;
  while (len > 0) { crc = ((crc << 8) ^ table[((crc >>> 24) ^ (len & 0xff)) & 0xff]) >>> 0; len >>>= 8; }
  return ((~crc) >>> 0) + '-' + buf.length;
}

// ---------------------------------------------------------------- GUARDA 0 — classificador de leitura
// Leitura PURA = uma linha, sem redirecao/substituicao, com `cd X &&` inicial opcional, cujos
// segmentos (| ; && ||) sao TODOS comandos de leitura (ou neutros: echo/printf/true/pwd/date).
// Qualquer segmento com outro comando (awk, sort, php, git, node, npx, mysql...) => nao e leitura
// pura e o Bash passa — a regra so pega o que Read/Grep/Glob fazem melhor e sem processo.
const LEITURA = new Set(['cat', 'head', 'tail', 'less', 'more', 'tac', 'nl', 'grep', 'egrep', 'fgrep', 'rg',
  'ls', 'dir', 'tree', 'find', 'wc', 'sed']);
const NEUTRO = new Set(['echo', 'printf', 'true', ':', 'pwd', 'date', 'type']);

export function classificarLeitura(cmd) {
  let s = String(cmd || '').trim();
  if (!s || /\n/.test(s)) return null;
  const semRuido = s.replace(/2>&1/g, '').replace(/[12]?>\s*\/dev\/null/g, '');
  if (/[<>]/.test(semRuido)) return null;                    // redirecao real (escrita/leitura por <)
  if (/\$\(|`/.test(s)) return null;                          // substituicao de comando
  s = s.replace(/^cd\s+("[^"]*"|'[^']*'|\S+)\s*(&&|;)\s*/, '');
  const segs = s.split(/\|\||&&|;|\|/).map(x => x.trim()).filter(Boolean);
  if (!segs.length) return null;
  let primeiro = null;
  for (const seg of segs) {
    const toks = tokens(seg);
    if (!toks.length) return null;
    let w = toks[0].replace(/^.*[\\/]/, '');                  // /usr/bin/grep -> grep
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) return null;      // VAR=x cmd — nao arrisca
    if (NEUTRO.has(w)) continue;
    if (!LEITURA.has(w)) return null;
    if (w === 'sed' && !(toks.includes('-n') && !toks.some(t => /^-i/.test(t)) && toks.some(t => /p['"]?$/.test(t) || /^-n$/.test(t)))) return null;
    if (w === 'sed' && toks.some(t => /^-i/.test(t))) return null;
    if (w === 'find' && toks.some(t => /^-(exec|execdir|delete|ok)$/.test(t))) return null;
    if (!primeiro) primeiro = { w, toks };
  }
  if (!primeiro) return null;                                 // so neutros: deixa passar
  return { ...primeiro, dica: dicaPara(primeiro.w, primeiro.toks) };
}

function tokens(seg) { // split simples respeitando aspas
  const out = []; let cur = ''; let q = '';
  for (const ch of seg) {
    if (q) { if (ch === q) q = ''; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ''; } continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// 3.5.6 (D3): `.env` nao e o lugar da URL/porta/banco da worktree — e a credencial nao precisa entrar no contexto.
// Medido 15/09 (145): dedalo fez `cat .env` atras da baseURL, o classificador negou ("Credential Materialization"),
// e ele leu o mesmo .env pela ferramenta Read no turno seguinte.
const DICA_ENV = 'a URL/porta/banco DESTA worktree estao em Read ".claude/.harness-run/worktree.env" (url=, porta=, db=) — no checkout principal, "Base URL local" do Perfil; conexao ao banco: bash .claude/scripts/db-test.sh. Nao leia o .env: a credencial nao precisa entrar no seu contexto (3.5.6/D3)';
export function ehLeituraDeEnv(cmd) { return /(^|[\s"'\/])\.env(\.[A-Za-z0-9_.-]+)?(?=[\s"'|;&)]|$)/.test(String(cmd || '')); }
function dicaPara(w, toks) {
  const args = toks.slice(1);
  const pos = args.filter(a => !a.startsWith('-'));
  const flags = args.filter(a => a.startsWith('-'));
  const alvo = pos[pos.length - 1] || '<arquivo>';
  if (pos.some(p => /^(.*[\/])?\.env(\.[A-Za-z0-9_.-]+)?$/.test(p))) return DICA_ENV;
  if (['cat', 'head', 'tail', 'less', 'more', 'tac', 'nl', 'sed'].includes(w)) {
    let extra = '';
    const n = (args.find(a => /^-n?\d+$/.test(a)) || '').replace(/^-n?/, '') || (args[args.indexOf('-n') + 1] || '');
    if (w === 'head' && /^\d+$/.test(n)) extra = ` com limit=${n}`;
    if (w === 'tail' && /^\d+$/.test(n)) extra = ` (offset a partir do fim: use limit=${n} depois de saber o total, ou Grep)`;
    if (w === 'sed') { const r = args.find(a => /^\d+,\d+p?$/.test(a.replace(/['"]/g, ''))); if (r) { const [a, b] = r.replace(/[^\d,]/g, '').split(','); extra = ` com offset=${a} limit=${Number(b) - Number(a) + 1}`; } }
    const files = pos.filter(p => !/^\d+(,\d+)?p?$/.test(p));
    return `Read ${files.length > 1 ? files.map(f => `"${f}"`).join(', ') : `"${alvo}"`}${extra}`;
  }
  if (['grep', 'egrep', 'fgrep', 'rg'].includes(w)) {
    const pat = pos[0] || '<padrao>';
    const p = pos.length > 1 ? pos[pos.length - 1] : '.';
    let mode = 'content';
    if (flags.some(f => /^-[a-zA-Z]*c/.test(f))) mode = 'count';
    else if (flags.some(f => /^-[a-zA-Z]*l/.test(f))) mode = 'files_with_matches';
    const ci = flags.some(f => /^-[a-zA-Z]*i/.test(f)) ? ', -i: true' : '';
    return `Grep pattern="${pat}" path="${p}" output_mode="${mode}"${ci}${mode === 'content' ? ', -n: true' : ''}`;
  }
  if (w === 'wc') return `Read "${alvo}" (o total de linhas vem no proprio retorno) ou Grep pattern="." path="${alvo}" output_mode="count"`;
  if (w === 'find') {
    const i = args.findIndex(a => /^-i?name$/.test(a));
    const nm = i >= 0 ? (args[i + 1] || '*') : '*';
    return `Glob pattern="**/${nm}" path="${pos[0] || '.'}"`;
  }
  // ls / dir / tree
  return `Glob pattern="${pos[0] ? pos[0].replace(/\/+$/, '') + '/*' : '*'}"${flags.some(f => /R/.test(f)) || w === 'tree' ? ' (ou "**/*" para recursivo)' : ''}`;
}

// ---------------------------------------------------------------- guarda (modulo)
// Retorna { exit: 0|2, stdout, stderr } — nunca lanca. mode = 'pre' | 'post'.
export function guardBash(input, mode, opts = {}) {
  const out = { exit: 0, stdout: '', stderr: '' };
  try { return guarda(input || '', mode === 'post' ? 'post' : 'pre', makeCtx(opts.root), opts, out); }
  catch (e) { out.stderr = ''; out.exit = 0; return out; }   // guarda com erro interno nunca bloqueia
}

function guarda(input, MODE, ctx, opts, out) {
  const { ENV, ROOT, CLAUDE_DIR, RUN_DIR, ATT_DIR } = ctx;

  // ---------------------------------------------------------------- modo --post
  if (MODE === 'post') {
    // 3.4.21: presenca no mesmo processo (era o hook `presence.mjs --prompt` do matcher Bash)
    try { runPresence(input, ['--prompt'], { root: ROOT, sendInProcess: !!opts.sendInProcess }); } catch {}
  }

  let cmd = '';
  try { cmd = (JSON.parse(input).tool_input || {}).command || ''; } catch {
    const m = input.match(/"command"\s*:\s*"([^"]*)"/); if (m) cmd = m[1];
  }
  if (!cmd) return out;
  const cmdHash = cksumPosix(cmd);

  // 3.5.5 (C10): comando MULTI-LINHA com erro de sintaxe (aspas/heredoc desbalanceados) e negado ANTES de rodar, com a
  // linha que o bash apontou. Medido 15/09: 3x "unexpected EOF while looking for matching `'" em 2 sessoes — scripts de
  // 60-110 linhas colados no Bash tool, um turno perdido cada. So comandos com >= 8 linhas pagam o `bash -n` (1 processo).
  if (MODE === 'pre' && (ENV.HARNESS_GUARD_BASH_SINTAXE || 'on') !== 'off' && cmd.split('\n').length >= 8) {
    try {
      const r = spawnSync('bash', ['-n'], { input: cmd, encoding: 'utf8', timeout: 4000, windowsHide: true });
      if (typeof r.status === 'number' && r.status !== 0) {
        const erro = String(r.stderr || '').split('\n').filter(Boolean).slice(0, 2).join(' | ').replace(/bash: (-c: )?/g, '').slice(0, 240);
        out.exit = 2;
        out.stderr = `[guard-bash] SINTAXE: bash -n recusou o comando (${erro}). Nada foi executado. Script com mais de ~20 linhas: grave com Write em .claude/.harness-run/tmp/<nome>.sh e rode "bash .claude/.harness-run/tmp/<nome>.sh" — aspas simples dentro de heredoc/strings longas quebram no Bash tool. (HARNESS_GUARD_BASH_SINTAXE=off desliga)`;
        return out;
      }
    } catch {}
  }

  if (MODE === 'post') {
    // 3.5.4: rodada de teste que o e2e-lock do projeto recusou devolve o credito ao contador do executor
    try { creditarRodada(input, { root: ROOT }); } catch {}
    try { fs.unlinkSync(path.join(ATT_DIR, cmdHash)); } catch {}
    try { // higiene oportunista: contadores parados ha mais de 60 min
      const lim = Date.now() - 60 * 60 * 1000;
      for (const f of fs.readdirSync(ATT_DIR)) {
        const full = path.join(ATT_DIR, f);
        try { if (fs.statSync(full).mtimeMs < lim) fs.unlinkSync(full); } catch {}
      }
    } catch {}
    return out;
  }

  // 3.4.22 (item 7): TETO DE FOLEGO — em subagente acima do teto do papel, o Bash e negado
  // (guard-folego.mjs; so o Write/Edit do relatorio passa). Mesmo processo, zero spawn extra.
  { const f = checkFolego(input, { root: ROOT }); if (f.exit === 2) { out.exit = 2; out.stderr = f.stderr; return out; } }

  // subagente? (transcript em <sessao>/subagents/agent-*.jsonl — mesma deteccao do presence 3.4.12c)
  let agentKey = '';
  { const sp = subagenteDoPayload(input); if (sp.sub && sp.id) agentKey = sp.id.slice(0, 16); }   // 3.4.27: agent_id do payload (transcript_path nao traz /subagents/)

  // ---------------------------------------------------------------- GUARDA 0b (3.5.6 — D3): subagente lendo .env
  // `test -f .env && cat .env || ...` passa pela GUARDA 0 (o `test` nao e leitura pura) e cai no classificador do auto
  // mode ("Credential Materialization"); no turno seguinte o agente le o mesmo .env pela ferramenta Read. O que ele
  // procura (URL/porta/banco da worktree) esta em worktree.env e db-test.sh — e a credencial nao precisa entrar no contexto.
  if (agentKey && (ENV.HARNESS_GUARD_ENV || 'on').toLowerCase() !== 'off' && ENV.HARNESS_SKIP_GUARD_BASH !== '1'
      && /(^|[\s;&|(`])(cat|head|tail|less|more|sed|grep|egrep|fgrep|source|\.)\s+(-[^\s]+\s+)*["']?(\.\/)?\.env(\.[A-Za-z0-9_.-]+)?["']?(\s|$|[|;&)])/.test(cmd)) {
    try { gravarIncidente(ctx, { tipo: 'leitura', papel: 'sub', rotulo: '', agent: agentKey, detalhe: 'env: ' + cmd.slice(0, 120).replace(/\s+/g, ' ') }); } catch {}
    out.stderr = `[guard-bash] BLOQUEADO: leitura de .env em subagente ("${cmd.replace(/\s+/g, ' ').slice(0, 90)}").\n${DICA_ENV}.\n(harness 3.5.6 — HARNESS_GUARD_ENV='off' desliga)\n`;
    out.exit = 2;
    return out;
  }

  // ---------------------------------------------------------------- GUARDA 0 (3.4.21) — leitura via Bash
  const modoLeitura = (ENV.HARNESS_GUARD_READ_VIA_BASH || 'agentes').toLowerCase();
  const guardaLeituraAtiva = ENV.HARNESS_SKIP_GUARD_BASH !== '1' && modoLeitura !== 'off'
    && (modoLeitura === 'todos' || agentKey);
  if (guardaLeituraAtiva) {
    const c = classificarLeitura(cmd);
    if (c) {
      try {
        fs.mkdirSync(RUN_DIR, { recursive: true });
        fs.appendFileSync(path.join(RUN_DIR, 'guard-bash-leitura.jsonl'),
          JSON.stringify({ ts: Math.floor(Date.now() / 1000), agente: agentKey || 'sessao', cmd: cmd.slice(0, 120).replace(/\s+/g, ' '), ferramenta: c.dica.split(' ')[0] }) + '\n');
      } catch {}
      // 3.5.0: incidente VERSIONADO (tipo leitura) — o painel mostra qual papel/dev insiste em ler via Bash
      try { gravarIncidente(ctx, { tipo: 'leitura', papel: agentKey ? 'sub' : 'sessao', rotulo: '', agent: agentKey, detalhe: c.dica.split(' ')[0] + ': ' + cmd.slice(0, 120).replace(/\s+/g, ' ') }); } catch {}
      out.stderr =
`[guard-bash] BLOQUEADO: leitura via Bash ("${cmd.replace(/\s+/g, ' ').slice(0, 90)}").
Isto e leitura pura (${c.w}); cada Bash custa 0,3-5 s so de criacao de processo nesta maquina
(bash + hooks) e Read/Grep/Glob respondem em ~0,1 s sem processo nenhum. Use agora:
  -> ${c.dica}
Bash e para EXECUTAR (lint, teste, git, migrate, CLI do projeto). Pipeline com awk/sort/cut ou
comando do projeto continua passando — a regra so pega leitura pura (cat/head/tail/sed -n/grep/
ls/find/wc). Nao re-tente o mesmo comando: troque pela ferramenta acima.
(harness 3.4.21 — HARNESS_GUARD_READ_VIA_BASH='off' desliga; 'todos' aplica tambem a sessao pai)
`;
      out.exit = 2;
      return out;
    }
  }

  // 3.5.1: REDEA DE TESTE — em subagente executor, `playwright test`/npm test/etc. acima de
  // HARNESS_PW_RUNS_MAX rodadas por despacho e negado (relatorio ⚠️ PARCIAL), e familia/suite e negada
  // sempre (so o spec da propria task). guard-playwright.mjs; mesmo processo, zero spawn extra.
  // 3.5.4: roda DEPOIS da GUARDA 0 — um `grep -n ... x.spec.js` negado por leitura nao pode consumir rodada
  // (medido 14/09: contava antes de negar).
  { const p = checkPlaywright(input, { root: ROOT }); if (p.exit === 2) { out.exit = 2; out.stderr = p.stderr; return out; } }

  // ---------------------------------------------------------------- DICA 0 (3.4.12) — leitura trivial via Bash
  // Medido 01-02/09 no Windows: 418 das 619 chamadas dos executores do Caronte eram cat/ls/grep/head
  // de UM arquivo via Bash; cada Bash custa 4-40 s sob carga (spawn + hooks) enquanto Read/Grep/Glob
  // respondem em 0,1 s sem processo. Nao bloqueia: devolve additionalContext com a ferramenta certa.
  // (3.4.21: em subagente a GUARDA 0 acima ja NEGA; a dica fica para a sessao pai / modo 'off'.)
  if ((ENV.HARNESS_GUARD_BASH_DICA || '1') === '1') {
    const one = cmd.trim();
    const simples = !/[|;&<>`$]/.test(one) && !/\n/.test(one);
    const mLeitura = one.match(/^(cat|head|tail|less|more)\s+(-n\s*\d+\s+|-\d+\s+)?["']?([^\s"']+)["']?$/);
    const mSed = one.match(/^sed\s+-n\s+["']?[0-9,p;]+["']?\s+["']?([^\s"']+)["']?$/);
    const mLs = one.match(/^(ls|dir)(\s+-[a-zA-Z]+)*(\s+["']?[^\s"']+["']?)?$/);
    const mGrep = one.match(/^(grep|rg|egrep)\s+(-[a-zA-Z]+\s+)*["']?[^"']+["']?\s+["']?[^\s"']+["']?$/);
    let dica = '';
    if (simples && (mLeitura || mSed)) dica = 'Read (arquivo inteiro ou offset/limit)';
    else if (simples && mLs) dica = 'Glob (padrao de arquivos)';
    else if (simples && mGrep) dica = 'Grep (padrao + path/glob)';
    if (dica && ehLeituraDeEnv(one)) dica = DICA_ENV;   // 3.5.6 (D3): sessao pai lendo .env tambem recebe o caminho certo
    if (dica) {
      out.stdout += JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse',
        additionalContext: `[guard-bash] Leitura trivial via Bash ("${one.slice(0, 60)}"). Use a ferramenta ${dica}: nao cria processo e responde em ~0,1 s; cada Bash custa 4-40 s nesta maquina sob carga (harness 3.4.12). Bash so para EXECUTAR (lint, teste, git, migrate).` } }) + '\n';
    }
  }

  // ---------------------------------------------------------------- GUARDA 1 — temporarios
  if (ENV.HARNESS_SKIP_GUARD_BASH !== '1' && (ENV.HARNESS_GUARD_BASH || '1') === '1') {
    // raiz em forma POSIX do Git Bash (/c/laragon/...): escrita DENTRO do projeto e legitima
    let projPosix = ROOT.replace(/\\/g, '/');
    const dm = projPosix.match(/^([A-Za-z]):\//);
    if (dm) projPosix = '/' + dm[1].toLowerCase() + projPosix.slice(2);

    // buffer quote-aware: desaspa alvos de redirect/tee, remove demais strings quotadas
    const scan = cmd
      .replace(/(>>?\s*)["']([^"']*)["']/g, '$1$2')
      .replace(/(tee\s+(?:-a\s+)?)["']([^"']*)["']/g, '$1$2')
      .replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');

    const targets = [];
    const re = /(?:>>?\s*|tee\s+(?:-a\s+)?)(\/[^\s;|&<>"')]+)/g;
    let mm;
    while ((mm = re.exec(scan)) !== null) targets.push(mm[1]);

    let bad = '';
    // 3.5.4: o SCRATCHPAD da sessao (…/Temp/claude/<projeto>/<sessao>/scratchpad/ no Windows, …/T/claude/… no macOS)
    // e o lugar que o Claude Code libera sem prompt — e o que a mensagem abaixo recomenda. Medido 14/09: a
    // /dt-exec da main foi negada ao gravar ali. Regex: qualquer raiz + /claude/<x>/<y>/scratchpad/.
    const SCRATCHPAD_RE = /\/claude\/[^/]+\/[^/]+\/scratchpad(\/|$)/i;
    for (const t of targets) {
      if (/^\/(dev|proc|sys)\//.test(t)) continue;
      if (t.startsWith(projPosix + '/')) continue;
      if (SCRATCHPAD_RE.test(t)) continue;
      bad = t; break;
    }
    if (bad) {
      out.stderr +=
`[guard-bash] BLOQUEADO: o comando escreve em '${bad}' — caminho de raiz FORA do projeto.
No Git Bash/Windows, '/arquivo' resolve para dentro de C:\\Program Files\\Git\\ e '/tmp'
fica fora do sandbox do projeto => prompt de permissao que, em execucao nao-assistida,
PENDURA a PRD por horas.
Grave arquivos temporarios (scripts de verificacao, dumps, CSVs intermediarios):
  1. no scratchpad da sessao (caminho indicado no seu system prompt); ou
  2. dentro do projeto, em .claude/.harness-run/tmp/ (crie com mkdir -p; e gitignored).
Reescreva o comando com um desses caminhos e re-execute.
`;
      out.exit = 2;
      return out;
    }
  }

  // ---------------------------------------------------------------- GUARDA 2 — anti-espiral
  if (ENV.HARNESS_SKIP_GUARD_SPIRAL === '1') return out;
  if ((ENV.HARNESS_GUARD_SPIRAL || '1') !== '1') return out;

  // host claude only (paridade com _host-detect.sh)
  const hostCfg = (ENV.HARNESS_HOST || 'auto').toLowerCase();
  let host = 'claude';
  if (hostCfg === 'claude' || hostCfg === 'codex') host = hostCfg;
  else if (process.env.CLAUDECODE || process.env.CLAUDE_PROJECT_DIR) host = 'claude';
  else if (Object.keys(process.env).some(k => k.startsWith('CODEX_'))) host = 'codex';
  if (host !== 'claude') return out;

  // fusivel: wiring '--post' >= 2x no settings.json (aceita guard-bash.sh OU .mjs)
  let postN = 0;
  try {
    const sj = fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8');
    postN = (sj.match(/guard-bash\.(?:sh|mjs) --post/g) || []).length;
  } catch {}
  if (postN < 2) return out;

  const now = Math.floor(Date.now() / 1000);
  let spiralN = parseInt(ENV.HARNESS_GUARD_SPIRAL_N, 10); if (!Number.isFinite(spiralN) || spiralN <= 0) spiralN = 3;
  let windowMin = parseInt(ENV.HARNESS_GUARD_SPIRAL_WINDOW_MIN, 10); if (!Number.isFinite(windowMin) || windowMin <= 0) windowMin = 15;

  try { fs.mkdirSync(ATT_DIR, { recursive: true }); } catch { return out; }
  const stateFile = path.join(ATT_DIR, cmdHash);
  let count = 0;
  try {
    const lines = fs.readFileSync(stateFile, 'utf8').split('\n');
    const lastTs = parseInt(lines[1], 10) || 0;
    if (now - lastTs <= windowMin * 60) count = parseInt(lines[0], 10) || 0;
  } catch {}
  count += 1;

  const excerpt = cmd.split('\n')[0].replace(/["\\]/g, '').slice(0, 120);
  try { fs.writeFileSync(stateFile, `${count}\n${now}\n${excerpt}\n`); } catch {}

  if (count < spiralN) return out;

  // espiral detectada: alerta local (notify) + negacao definitiva
  const msg = `[spiral] comando bloqueado ${count}x sem executar (classificador de permissao indisponivel?): ${excerpt}`;
  try {
    const notify = path.join(HOOKS_DIR, 'notify.sh');
    if (fs.existsSync(notify)) {
      const ch = spawn('bash', [notify], { detached: true, stdio: ['pipe', 'ignore', 'ignore'], cwd: ROOT, windowsHide: true });
      ch.stdin.write(JSON.stringify({ message: msg }));
      ch.stdin.end();
      ch.unref();
    }
  } catch {}

  out.stderr +=
`[guard-bash] BLOQUEADO (anti-espiral): este MESMO comando ja foi tentado ${count} vezes sem
conseguir executar. Assinatura tipica: o classificador de permissao do modo autonomo esta
INDISPONIVEL (ele nega em fail-closed e pede "try again" — nao obedeca) ou o comando vem
sendo negado repetidamente por outro motivo. NAO RE-TENTE este comando.

O que fazer AGORA, nesta ordem:
1. Existe alternativa que case com a allowlist do projeto (permissions.allow no
   .claude/settings.json) ou operacao read-only que destrave o proximo passo? Use-a.
   Regras de allowlist sao ESTREITAS — prefira o comando exato documentado no Perfil
   (secao "Execucao autonoma") a variacoes com flags novas.
2. Senao, PARE a fase autonoma AGORA. Devolva o controle ao usuario com:
   Status: "Bloqueada — classificador de permissao indisponivel (comando negado ${count}x)"
   e as opcoes de destrave: trocar o modo de permissao (Shift+Tab), aprovar/re-tentar
   pela aba "Recently denied" do /permissions, ampliar a allowlist
   (bash .claude/harness-doctor.sh --gen-allowlist), reduzir sessoes autonomas
   paralelas (max 2), ou aguardar a normalizacao do servico.
3. NAO use ScheduleWakeup/espera ativa para "esperar o classificador voltar" — o
   reagendamento tambem passa pelo classificador e alimenta a espiral.

O operador ja foi alertado (notify.sh) e o evento foi logado para a telemetria.
Runbook: .claude/PLAYBOOK-TELEMETRIA.md — secao "Classificador indisponivel".
`;
  out.exit = 2;
  return out;
}

// ---------------------------------------------------------------- CLI (fallback / wiring direto)
function isMain() {
  try { return path.resolve(process.argv[1] || '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); }
  catch { return false; }
}
if (isMain()) {
  const mode = process.argv[2] === '--post' ? 'post' : 'pre';
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch {}
  const r = guardBash(input, mode);
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.exit);
}
