#!/usr/bin/env node
// .claude/hooks/guard-playwright.mjs (3.5.1; 3.5.4 rodada real/redirecionamento/credito; 3.5.6 teto por TASK e por SPEC)
// REDEA DE TESTE NO EXECUTOR, ENFORCADA POR HOOK.
//
// Motivo (medido 12/09, PRD-142-b-exec no dra-mariana-duarte): hefesto/dedalo rodaram Playwright
// 126 vezes em 7 tasks + correcoes (7-19 rodadas por despacho, 2-5 falhas cada) = 60 min de parede;
// specs de agentes diferentes disputavam o mesmo banco e a falha falsa puxava mais uma rodada.
// O Contrato de Testes da /prd-exec ja dizia "executor roda so o menor teste local; familia e suite
// sao da sessao pai" — instrucao nao segurou. Regra da casa (3.4.21/3.4.22): hook segura.
// Mesmo molde do guard-folego.mjs: negacao com exit 2 dentro do guard-bash.mjs, zero spawn extra,
// sessao pai nunca negada, erro interno nunca bloqueia, o agente so descobre o teto quando o hook nega.
//
// Regra A — TETO DE RODADAS por TASK e por SPEC (3.5.6 — D5/D6/E1, medido 15-16/09 em 4 execs: 8 tetos e 2
//   continuacoes numa noite, TODOS em task que ESCREVE spec). O contador vive em .harness-run/playwright/<chave>.json,
//   onde chave = rotulo da task do despacho (TASK-NNN/DT-NNN, lido da description do agente) — a CONTINUACAO
//   ("Continua TASK-001") herda o saldo em vez de zerar; sem rotulo, chave = agent_id (comportamento 3.5.1).
//   Dentro da task, cada spec tem seu proprio contador: teto = HARNESS_PW_RUNS_MAX (4) por spec, e teto da task =
//   min(4 x specs distintos, HARNESS_PW_RUNS_MAX_TASK = 12). `for ... do playwright test ... done` e `--repeat-each N`
//   contam as ITERACOES (a 3.5.1 contava o comando: 4 execucoes = 1 credito). Acima do teto o Bash e negado e o
//   caminho e relatorio PARCIAL com o log da ULTIMA rodada — e a pai roda a ultima rodada ela mesma.
//   Rodada que morre em < HARNESS_PW_FALHA_AMBIENTE_S (20 s) por AMBIENTE (ECONNREFUSED, lock, "No tests found",
//   modulo ausente...) e creditada de volta no --post, como o e2e-lock ja era desde a 3.5.4.
// Regra B — EXECUTOR NAO RODA FAMILIA NEM SUITE: `playwright test` sem arquivo .spec. explicito, com
//   glob (*), com padrao de familia (PRD-NNN-*) ou com diretorio (tests/e2e/) e negado sem consumir
//   o contador — so o spec da propria task, --workers=1 [--grep]. 3.5.6 (D16): o corpo de heredoc e as
//   strings entre aspas NAO entram na deteccao (um `cat > x.js <<TAG` que cita require('playwright') nao e rodada).
// Regra C — ESPERA DO LOCK E2E (3.5.6 — D4, atras de HARNESS_PW_LOCK_ESPERA='on'; default off): se ha lock de
//   execucao vivo nesta worktree (HARNESS_PW_LOCK_GLOB, default .claude/.harness-run/tmp/*.lock com {pid}), o
//   comando e negado SEM consumir rodada e o executor recebe a receita de espera (`until [ ! -f <lock> ]...`),
//   em vez de gastar 3 turnos tentando sleep/wmic/PowerShell (medido 15/09).
// Papeis: todo subagente, exceto os que so leem (sherlock, beholder, michelangelo).
//
// Knobs (harness.env / ~/.harness.env.local):
//   HARNESS_GUARD_PW='on'|'off'          (default on — desliga as regras)
//   HARNESS_PW_RUNS_MAX='4'              (default 4 — rodadas por SPEC; a 5a e negada)
//   HARNESS_PW_RUNS_MAX_TASK='12'        (default 12 — teto da task = min(RUNS_MAX x specs distintos, este))
//   HARNESS_PW_FALHA_AMBIENTE_S='20'     (default 20 — falha mais rapida que isso com cara de ambiente nao conta)
//   HARNESS_PW_LOCK_ESPERA='off'|'on'    (default off — Regra C)
//   HARNESS_PW_LOCK_GLOB='.claude/.harness-run/tmp/*.lock'
//   HARNESS_PW_LOCK_MARCA='[e2e-lock]'   (marca da saida que credita a rodada no --post)
// Telemetria: .harness-run/playwright.jsonl {ts,agent,papel,regra,n,teto,rotulo,cmd} (uma linha por deny/credito)
//   + incidente tipo "playwright" em prds/_metrics/incidentes/<dev>@<host>.jsonl (gravarIncidente do folego).
//
// Onde roda: dentro do guard-bash.mjs (pre, Bash), logo apos o checkFolego — daemon e fallback `node`
// passam pelo mesmo guarda(). Uso direto: `node guard-playwright.mjs [--root <dir>]` (stdin = JSON do hook)
// | modulo: checkPlaywright(input, {root}) / creditarRodada(input, {root}).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeCtx, subagenteDoPayload } from './presence.mjs';
import { gravarIncidente } from './guard-folego.mjs';

const SO_LEEM = new Set(['sherlock', 'beholder', 'michelangelo']);
// 3.5.4: so comando que EXECUTA teste conta rodada. A alternativa solta `.spec.(js|ts)` contava `rm`, `grep -n`,
// `node --check` e `node -e` que citam o spec (medido 14/09, PRD-139-b: dedalo negado em n=5 com 2 rodadas reais;
// 5 PARCIAL fabricados na tarde), e `npx playwright` sozinho pegava install/codegen/show-report.
const TESTE_RE = /\bplaywright\s+test\b|\b(npm|pnpm|yarn)\s+(run\s+)?test\b|\bvitest\b|\bjest\b|\bphpunit\b|\bpytest\b/i;
// 3.5.4: token de redirecionamento nao e alvo de teste — `2>&1`, `>arquivo`, `2>/dev/null`, `&>x`; operador solto
// (`>`, `2>`, `<`) consome o proximo token. Medido 14/09: 14 de 14 despachos com Playwright cairam na Regra B por
// "diretorio/familia (2>&1)" — 100% dos executores comecam com `2>&1 | tail`.
const REDIR_SOLTO_RE = /^(\d*[<>]{1,2}|&>|>\|)$/;
const REDIR_COLADO_RE = /^(\d*[<>]{1,2}\S+|&>\S+|\d*>&\d+)$/;
const SCREENSHOT_RE = /\bplaywright\s+screenshot\b/i;
const PW_TEST_RE = /\bplaywright\s+test\b/i;
const SPEC_RE = /\.spec\.(js|ts|mjs)(:\d+)?$/i;
// 3.5.6: saida com cara de AMBIENTE (nao de teste) — credita a rodada quando a falha foi rapida
const AMBIENTE_RE = /ECONNREFUSED|ERR_CONNECTION_REFUSED|net::ERR_|No tests found|browserType\.launch|Executable doesn.t exist|EADDRINUSE|Cannot find module|MODULE_NOT_FOUND|Error: Cannot navigate|globalSetup|Access denied for user|ER_ACCESS_DENIED|Unknown database/i;
// flags do `playwright test` que consomem o token seguinte quando vem sem "="
const FLAGS_COM_VALOR = new Set(['--grep', '-g', '--grep-invert', '--workers', '-j', '--project', '--config', '-c',
  '--reporter', '--retries', '--timeout', '--output', '--repeat-each', '--max-failures', '-x', '--shard',
  '--global-timeout', '--trace', '--browser', '--ui-host', '--ui-port', '--tsconfig']);

function num(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; }
function campo(input, nome) { const m = input.match(new RegExp('"' + nome + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"')); return m ? m[1].replace(/\\\\/g, '\\').replace(/\\\//g, '/').replace(/\\"/g, '"') : ''; }

function comandoDoPayload(input) {
  try { return String((JSON.parse(input).tool_input || {}).command || ''); } catch {
    const m = input.match(/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    return m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\') : '';
  }
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

// 3.5.6 (D16): corpo de heredoc (`<<TAG ... TAG`, `<<-'TAG'`) sai da analise — e conteudo de arquivo, nao comando.
export function semHeredoc(cmd) {
  return String(cmd || '').replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '<<HEREDOC');
}
function semStrings(s) { return String(s || '').replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'[^']*'/g, "''"); }

// Regra B: `playwright test` so com spec explicito da propria task. Retorna o motivo da negacao ou ''.
export function motivoFamilia(cmd) {
  const s = semHeredoc(cmd);
  if (!PW_TEST_RE.test(s)) return '';
  for (const seg of s.split(/\|\||&&|;|\|/)) {
    if (!PW_TEST_RE.test(seg)) continue;
    const toks = tokens(seg.trim());
    const i = toks.findIndex((t, k) => /^playwright$/i.test(t) && /^test$/i.test(toks[k + 1] || ''));
    if (i < 0) continue;
    const args = toks.slice(i + 2);
    const specs = []; const outros = [];
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (a === '&') break;                                      // 3.5.4c: `... > log &` (background) — fim dos argumentos, nao e diretorio
      if (REDIR_SOLTO_RE.test(a)) { k++; continue; }            // 3.5.4: `> out.txt` — pula o operador e o alvo
      if (REDIR_COLADO_RE.test(a)) continue;                     // 3.5.4: `2>&1`, `2>/dev/null`, `&>x`
      if (a.startsWith('-')) { if (!a.includes('=') && FLAGS_COM_VALOR.has(a)) k++; continue; }
      if (/[*?[]/.test(a)) return 'glob (' + a + ')';
      if (SPEC_RE.test(a)) specs.push(a); else outros.push(a);
    }
    if (outros.length) return 'diretorio/familia (' + outros[0] + ')';
    if (!specs.length) return 'sem spec explicito (suite inteira)';
  }
  return '';
}

export function ehComandoDeTeste(cmd) {
  const s = semStrings(semHeredoc(cmd)).replace(SCREENSHOT_RE, ' ');   // evidencia visual nao e rodada; heredoc/strings nao sao comando
  return TESTE_RE.test(s);
}

// 3.5.6: specs citados no comando (basename, sem :linha); comando de teste sem spec (npm test, phpunit) => '(sem-spec)'
export function specsDoComando(cmd) {
  const s = semHeredoc(cmd); const out = [];
  for (const seg of s.split(/\|\||&&|;|\||\n/)) {
    if (!TESTE_RE.test(semStrings(seg))) continue;
    for (const t of tokens(seg.trim())) {
      if (REDIR_SOLTO_RE.test(t) || REDIR_COLADO_RE.test(t) || t.startsWith('-')) continue;
      if (SPEC_RE.test(t)) out.push(t.replace(/:\d+$/, '').replace(/^.*[\\/]/, ''));
    }
  }
  return out.length ? [...new Set(out)] : ['(sem-spec)'];
}

// 3.5.6 (D6): quantas RODADAS o comando executa — segmentos com comando de teste x iteracoes do `for` x --repeat-each
export function rodadasDoComando(cmd) {
  const s = semHeredoc(cmd);
  const segs = s.split(/\|\||&&|;|\n/).filter((seg) => TESTE_RE.test(semStrings(seg).replace(SCREENSHOT_RE, ' ')));
  let n = Math.max(1, segs.length);
  const f = s.match(/\bfor\s+\w+\s+in\s+([^;\n]+?)\s*(?:;|\n)\s*do\b/);
  if (f) {
    const itens = f[1].trim(); let k = 1;
    const br = itens.match(/^\{(\d+)\.\.(\d+)\}$/);
    if (br) k = Math.abs(Number(br[2]) - Number(br[1])) + 1;
    else if (/\$\(|`|\$\{?[A-Za-z_]/.test(itens)) k = 3;                   // lista dinamica: assume 3
    else k = itens.split(/\s+/).filter(Boolean).length;
    n *= Math.max(1, k);
  }
  const rep = s.match(/--repeat-each[= ](\d+)/); if (rep) n *= Math.max(1, Number(rep[1]));
  const wm = s.match(/\bwhile\b[\s\S]*\bplaywright\s+test\b/); if (wm && !f) n = Math.max(n, 3);   // while: pelo menos 3
  return n;
}

function rotuloDe(sp) { // TASK-NNN | DT-NNN | PRD-NNN da description do despacho (meta.json do transcript do agente)
  const tp = sp.transcript || ''; if (!tp) return '';
  try { const d = (fs.readFileSync(tp.replace(/\.jsonl$/, '.meta.json'), 'utf8').match(/"description"\s*:\s*"([^"]*)"/) || [])[1] || ''; return ((d.match(/(TASK|DT)-\d{2,4}[a-z]?/) || d.match(/(PRD|LOTE)-\d{2,4}(-[a-z])?/) || [''])[0]); } catch { return ''; }
}
function papelDe(sp, input) {
  const tp = sp.transcript || '';
  let papel = sp.tipo || campo(input, 'agent_type');
  if (!papel && tp) { try { const mm = fs.readFileSync(tp.replace(/\.jsonl$/, '.meta.json'), 'utf8').match(/"agentType"\s*:\s*"([^"]*)"/); if (mm) papel = mm[1]; } catch {} }
  return (papel || 'agente').replace(/[^A-Za-z0-9-]/g, '');
}
// 3.5.6: a CHAVE do contador e a task (continuacao herda o saldo); sem rotulo, o agente. Prefixo = rotulo da RUN viva
// (marcador *-exec.json / LOTE-*.json / _auto-*.json mais novo) — duas execs sucessivas no mesmo checkout tem TASK-001 cada.
function prefixoDaRun(STATE_DIR) {
  try {
    let best = '', bt = 0;
    for (const f of fs.readdirSync(STATE_DIR)) {
      if (!/-exec\.json$|^LOTE-[^/]*\.json$|^_auto-[^/]*\.json$/.test(f)) continue;
      const t = fs.statSync(path.join(STATE_DIR, f)).mtimeMs; if (t > bt) { bt = t; best = f; }
    }
    return best ? best.replace(/\.json$/, '').replace(/^_auto-/, '').replace(/[^A-Za-z0-9-]/g, '') + '-' : '';
  } catch { return ''; }
}
function chaveDe(sp, rotulo, STATE_DIR) { const base = String(rotulo || sp.id || 'agente').replace(/[^A-Za-z0-9-]/g, '') || 'agente'; return (rotulo && STATE_DIR ? prefixoDaRun(STATE_DIR) : '') + base; }
function lerEstado(f) {
  let st = { n: 0, ts: 0, specs: {}, agentes: [] };
  try { st = { ...st, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch {}
  if (st.ts && Math.floor(Date.now() / 1000) - st.ts > 12 * 3600) st = { n: 0, ts: 0, specs: {}, agentes: [] };   // estado de outra run (> 12 h) nao conta
  st.specs = st.specs || {}; st.agentes = st.agentes || []; return st;
}
function processoVivo(pid) { try { process.kill(pid, 0); return true; } catch (e) { return !!(e && e.code === 'EPERM'); } }
// Regra C: lock de execucao E2E vivo nesta worktree? -> caminho do lock ou ''
export function lockVivo(root, ENV) {
  const glob = ENV.HARNESS_PW_LOCK_GLOB || '.claude/.harness-run/tmp/*.lock';
  const dir = path.join(root, path.dirname(glob)); const suf = path.basename(glob).replace(/^\*/, '');
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(suf)) continue;
      const p = path.join(dir, f); let o = null; try { o = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
      if (o && Number.isInteger(o.pid) && o.pid !== process.pid && processoVivo(o.pid)) return p;
    }
  } catch {}
  return '';
}

export function checkPlaywright(input, opts = {}) {
  const out = { exit: 0, stdout: '', stderr: '' };
  try {
    const ctx = makeCtx(opts.root);
    const { ENV, STATE_DIR, ROOT } = ctx;
    if ((ENV.HARNESS_GUARD_PW || 'on').toLowerCase() === 'off') return out;
    const sp = subagenteDoPayload(input);
    if (!sp.sub) return out;                                  // sessao pai: nunca
    if (campo(input, 'tool_name') !== 'Bash') return out;
    const cmd = comandoDoPayload(input);
    if (!cmd || !ehComandoDeTeste(cmd)) return out;
    const agentId = sp.id || 'agente';
    const papel = papelDe(sp, input);
    if (SO_LEEM.has(papel)) return out;
    const rotulo = rotuloDe(sp);
    const teto = num(ENV.HARNESS_PW_RUNS_MAX, 4);
    const tetoMax = num(ENV.HARNESS_PW_RUNS_MAX_TASK, 12);
    const cmdCurto = cmd.replace(/\s+/g, ' ').slice(0, 160);
    const registra = (regra, n, detalhe, tetoN = teto) => {
      try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.appendFileSync(path.join(STATE_DIR, 'playwright.jsonl'), JSON.stringify({ ts: Math.floor(Date.now() / 1000), agent: agentId, papel, regra, n, teto: tetoN, rotulo, cmd: cmdCurto }) + '\n'); } catch {}
      gravarIncidente(ctx, { tipo: 'playwright', papel, rotulo, agent: agentId, detalhe });
    };

    // ---- Regra B: familia/suite nao e do executor (nao consome o contador)
    const motivo = motivoFamilia(cmd);
    if (motivo) {
      registra('familia', null, `regra=B ${motivo}`);
      out.exit = 2;
      out.stderr = `[guard-playwright] executor roda SÓ o spec da própria task (Contrato de Testes da /prd-exec): npx playwright test tests/e2e/<seu-spec>.spec.js --workers=1 [--grep "<cenário que está corrigindo>"]. Família PRD-NNN-* e suíte completa são da sessão pai, uma vez, com o tree parado. (negado: ${motivo})\n`;
      return out;
    }

    // ---- Regra C (3.5.6, flag): lock E2E vivo => espere, sem gastar rodada
    if ((ENV.HARNESS_PW_LOCK_ESPERA || 'off').toLowerCase() === 'on') {
      const raiz = ROOT || opts.root || process.cwd();
      const lk = lockVivo(raiz, ENV);
      if (lk) {
        const rel = path.relative(raiz, lk).replace(/\\/g, '/');
        registra('lock', null, `regra=C lock vivo ${rel}`);
        out.exit = 2;
        out.stderr = `[guard-playwright] outra rodada de Playwright desta worktree está VIVA (lock ${rel}). Não tente de novo agora — espere o lock sumir e rode o mesmo comando, num Bash só (o Claude Code aceita sleep dentro de until):\n  until [ ! -f "${rel}" ]; do sleep 5; done; ${cmdCurto}\nA rodada não foi contada. (3.5.6/D4 — HARNESS_PW_LOCK_ESPERA=off desliga)\n`;
        return out;
      }
    }

    // ---- Regra A: teto por TASK e por SPEC (incrementa ANTES de decidir)
    const chave = chaveDe(sp, rotulo, STATE_DIR);
    const stateFile = path.join(STATE_DIR, 'playwright', chave + '.json');
    const st = lerEstado(stateFile);
    if (!st.agentes.includes(agentId)) st.agentes.push(agentId);
    const specs = specsDoComando(cmd); const spec = specs[0]; const rod = rodadasDoComando(cmd);
    const agora = Math.floor(Date.now() / 1000);
    const nAntes = st.n, nSpecAntes = st.specs[spec] || 0;
    st.n = nAntes + rod; st.specs[spec] = nSpecAntes + rod; st.ts = agora; st.papel = papel; st.ultimo = { spec, ts: agora, rodadas: rod };
    try { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(st)); } catch {}
    const distintos = Object.keys(st.specs).length;
    const tetoTask = Math.min(teto * distintos, tetoMax);
    if (st.specs[spec] <= teto && st.n <= tetoTask) return out;
    registra('teto', st.n, `n=${st.n} teto=${tetoTask} spec=${spec}:${st.specs[spec]}/${teto}${rod > 1 ? ' rodadas-no-comando=' + rod : ''}${st.agentes.length > 1 ? ' continuacao' : ''}`, tetoTask);
    out.exit = 2;
    out.stderr = `[guard-playwright] ${papel} já rodou testes ${nAntes} vezes ${rotulo ? 'na ' + rotulo : 'neste despacho'} (teto ${tetoTask}${distintos > 1 ? ' = ' + teto + ' por spec × ' + distintos + ' specs distintos, máx ' + tetoMax : ''}; spec ${spec}: ${nSpecAntes}/${teto})${rod > 1 ? ' — e este comando contava ' + rod + ' rodadas (for/--repeat-each/while): rode UMA vez' : ''}${st.agentes.length > 1 ? ' — a continuação herda o saldo da task (3.5.6)' : ''}. Não rode de novo: grave o relatório com Status ⚠️ PARCIAL — o que passa, o que falha (nomes dos specs/cenários e o trecho do log da ÚLTIMA rodada), sua hipótese, a correção que já aplicou e o que falta reverificar — e devolva. A sessão pai roda a última rodada ela mesma (1 comando) ou muda a abordagem. Rodada que falhou em < 20 s por ambiente/lock não conta (crédito automático). Rodada repetida sem mudança de hipótese é o que mais custa parede.\n`;
    return out;
  } catch { return out; }                                    // guarda com erro interno nunca bloqueia
}

// 3.5.4: CREDITO DE RODADA — a Regra A incrementa ANTES de rodar; quando o comando nem rodou porque o `e2e-lock`
// do projeto recusou ("execucao concorrente de Playwright detectada"), a rodada volta. Medido 14/09: 5 colisoes de
// lock em 2 worktrees (executores da mesma onda + a pai rodando spec), cada uma consumindo 1 das 4 rodadas — 2 PARCIAL
// so por isso. 3.5.6 (D5): falha RAPIDA (< HARNESS_PW_FALHA_AMBIENTE_S) com cara de ambiente tambem credita.
// Chamado pelo guard-bash.mjs --post (PostToolUse/PostToolUseFailure); nunca lanca.
export function creditarRodada(input, opts = {}) {
  try {
    const ctx = makeCtx(opts.root);
    const { ENV, STATE_DIR } = ctx;
    if ((ENV.HARNESS_GUARD_PW || 'on').toLowerCase() === 'off') return false;
    if (campo(input, 'tool_name') !== 'Bash') return false;
    const sp = subagenteDoPayload(input);
    if (!sp.sub || !sp.id) return false;
    const cmd = comandoDoPayload(input);
    if (!cmd || !ehComandoDeTeste(cmd)) return false;
    const rotulo = rotuloDe(sp);
    const stateFile = path.join(STATE_DIR, 'playwright', chaveDe(sp, rotulo, STATE_DIR) + '.json');
    if (!fs.existsSync(stateFile)) return false;
    const st = lerEstado(stateFile);
    if (!(st.n > 0)) return false;
    const txt = String(input); const marca = ENV.HARNESS_PW_LOCK_MARCA || '[e2e-lock]';
    let motivo = '';
    if (txt.includes(marca)) motivo = 'e2e-lock';
    if (!motivo) {
      const dt = Math.floor(Date.now() / 1000) - ((st.ultimo && st.ultimo.ts) || 0);
      if (dt >= 0 && dt <= num(ENV.HARNESS_PW_FALHA_AMBIENTE_S, 20) && AMBIENTE_RE.test(txt)) motivo = 'ambiente';
    }
    if (!motivo) return false;
    const rod = (st.ultimo && st.ultimo.rodadas) || 1; const sp0 = st.ultimo && st.ultimo.spec;
    st.n = Math.max(0, st.n - rod);
    if (sp0 && st.specs[sp0]) st.specs[sp0] = Math.max(0, st.specs[sp0] - rod);
    st.creditos = (st.creditos || 0) + 1;
    fs.writeFileSync(stateFile, JSON.stringify(st));
    try { fs.appendFileSync(path.join(STATE_DIR, 'playwright.jsonl'), JSON.stringify({ ts: Math.floor(Date.now() / 1000), agent: sp.id, papel: st.papel || sp.tipo || '', regra: 'credito', n: st.n, teto: num(ENV.HARNESS_PW_RUNS_MAX, 4), rotulo, motivo, cmd: cmd.replace(/\s+/g, ' ').slice(0, 160) }) + '\n'); } catch {}
    return true;
  } catch { return false; }
}

function isMain() { try { return path.resolve(process.argv[1] || '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); } catch { return false; } }
if (isMain()) {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch {}
  let root = '';
  const ir = process.argv.indexOf('--root');
  if (ir > 0 && process.argv[ir + 1]) root = process.argv[ir + 1];
  else { try { const c = campo(input, 'cwd'); if (c && fs.existsSync(path.join(c, '.claude', 'harness.env'))) root = c; } catch {} }
  const r = checkPlaywright(input, { root: root || undefined });
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.exit);
}
