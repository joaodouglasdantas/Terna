#!/usr/bin/env node
// .claude/hooks/harness-metrics.mjs
// Mede tokens (best-effort) de uma execucao do harness lendo os transcripts da sessao
// Claude Code — e, desde a 1.8.0, tambem os sinais de ESPERA HUMANA: o maior gap entre
// entradas do transcript (max_gap_min) e a espera medida a partir do log do hook
// notify.sh (permission-waits.jsonl). Node puro — SEM dependencias. Chamado pelo
// harness-metrics.sh no 'stop'.
//
// Uso:  node harness-metrics.mjs <startEpochSeconds> [projectCwd] [waitsFile] [platform] [gapWaitMin]
// Saida (stdout, 1 linha JSON):
//   { "ok": true, "input": N, "output": N, "cacheRead": N, "cacheCreation": N,
//     "total": N, "files": N, "maxGapMin": N.N, "permCount": N, "waitS": N,
//     "gapCount": N, "gapRawS": N, "gapBusyS": N, "gapThresholdMin": N,
//     "idleCount": N, "subagentN": N, "subagentBusyS": N, "subagentSpanS": N,
//     "askCount": N (3.4.23: tool_use AskUserQuestion no transcript principal),
//     "waitsInvalid": N (3.4.23: linhas invalidas do permission-waits.jsonl, ignoradas),
//     "thinkingPct": N, "subThinkingPct": N (3.5.3: % estimado de raciocinio invisivel,
//     inteiro — pai / conjunto dos subagentes; ausente quando output = 0) }
//   (maxGapMin/permCount/waitS/gap*/subagent* omitidos quando nao mensuraveis)
//   { "ok": false, "reason": "..." }
// Nunca lanca: qualquer falha vira { ok:false } e exit 0 (telemetria nao quebra a skill).
//
// ESPERA POR GAP (2.10.0): alem das janelas do notify.sh, TODO gap entre entradas
// consecutivas do transcript maior que gapWaitMin (default 10 min) vira janela de
// espera humana — sessao deixada aberta (overnight, almoco) nao gera evento de
// Notification nenhum, mas gera gap. As duas fontes sao MESCLADAS (janelas
// sobrepostas nao contam duas vezes) antes de somar o waitS. Limiar de 10 min e
// defensavel porque o timeout maximo de um Bash sincrono e 600s: gap maior que
// isso nao e ferramenta rodando. Configuravel via HARNESS_WAIT_GAP_MIN.
//
// GAP OCIOSO x GAP COM SUBAGENTE VIVO (2.12.0): a 2.10.0 contava TODO gap como
// espera humana — mas quando a sessao despacha um subagente em background o TURNO
// ENCERRA, e ate a notificacao de conclusao o transcript principal fica em silencio.
// Isso e indistinguivel de o operador ter saido para almocar (caso real: PRD-111 do
// dra-mariana-duarte, wait_human_min=850 com permission_prompts=0 — 506 min de
// ociosidade REAL somados a ~344 min de subagente TRABALHANDO). A partir daqui as
// janelas de trabalho dos subagentes sao medidas direto dos transcripts deles
// (<session>/subagents/agent-*.jsonl: primeiro e ultimo timestamp) e:
//   - waitS         = espera OCIOSA = (gaps U notify) MENOS as janelas de subagente
//                     vivo. So ELA desconta o elapsed_active_s e dispara o aviso ⚠️.
//   - gapBusyS      = a parcela dos gaps coberta por subagente vivo (e TRABALHO).
//   - subagentBusyS = SOMA das duracoes dos subagentes (numerador do fator de
//                     paralelismo; > span quando rodaram em paralelo).
//   - subagentSpanS = UNIAO das janelas (quanto tempo de parede teve algum vivo).
//
// DEDUP POR message.id (3.5.3, medido 12/09 na PRD-142-b-exec do dra-mariana-duarte): no
// transcript UMA mensagem do assistente vira VARIAS linhas {"type":"assistant"} — uma por
// bloco de conteudo (thinking, text, tool_use), todas com o MESMO message.id e com o
// usage.output_tokens CUMULATIVO dentro da mensagem (a ultima linha traz o total). Somar o
// usage de toda linha e contar cada linha como turno inflou a sessao pai 2,4x (1.078.168
// registrado vs 453.914 real) e a TASK-004 saiu com 292 turnos onde havia 151 mensagens.
// Agora: por message.id fica a linha de MAIOR output_tokens (e os demais campos de usage
// DESSA linha); linha sem id soma como antes; turnos = ids unicos (+1 por linha sem id).
// A serie anterior a 13/09/2026 esta inflada (~2,4x na pai, ~1x a 2x nos subagentes) —
// nao comparar cru com a nova.
//   thinkingPct / subThinkingPct: os blocos 'thinking' chegam com texto VAZIO (so a
// assinatura), entao o raciocinio so aparece como diferenca: visiveisTok = (chars dos blocos
// text + chars do JSON do input de cada tool_use) / 3,6 e thinkingPct = 100*(output -
// visiveisTok)/output (inteiro, >= 0). Estimativa, nao medida — o 3,6 chars/token e a media
// observada para texto+JSON em PT-BR/codigo.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function out(o) { process.stdout.write(JSON.stringify(o) + '\n'); process.exit(0); }
function fail(reason) { out({ ok: false, reason }); }

// --- algebra de intervalos (2.12.0) -----------------------------------------
// Janelas sao pares [inicioMs, fimMs]. 'unir' normaliza (ordena + funde
// sobrepostas), 'somar' devolve a duracao total e 'subtrair' remove de A tudo que
// cair dentro de B (A e B PRECISAM vir de 'unir'). E com isso que separamos gap
// ocioso (espera de verdade) de gap com subagente vivo (trabalho).
function unir(janelas) {
  if (!janelas.length) return [];
  const ord = janelas.slice().sort((a, b) => a[0] - b[0]);
  const res = [ord[0].slice()];
  for (let i = 1; i < ord.length; i++) {
    const cur = res[res.length - 1];
    if (ord[i][0] <= cur[1]) { if (ord[i][1] > cur[1]) cur[1] = ord[i][1]; }
    else res.push(ord[i].slice());
  }
  return res;
}
function somar(janelas) { let t = 0; for (const [s, e] of janelas) t += e - s; return t; }
function subtrair(a, b) {
  if (!b.length) return a.slice();
  const res = [];
  for (const [ini, fim] of a) {
    let s = ini;
    for (const [bs, be] of b) {
      if (be <= s) continue;
      if (bs >= fim) break;
      if (bs > s) res.push([s, Math.min(bs, fim)]);
      s = Math.max(s, be);
      if (s >= fim) break;
    }
    if (s < fim) res.push([s, fim]);
  }
  return res;
}

// --- acumulador de usage com dedup por message.id (3.5.3) ---------------------
// Uma instancia por conjunto que se quer somar (sessao principal; todos os subagentes; um
// subagente so, para os turnos por papel). 'acumular' recebe a linha ja parseada (e ja
// clampada por startMs pelo chamador — a mensagem inteira fica de um lado so do start);
// 'fechar' devolve os totais deduplicados.
function novoAcumulador() {
  return { porId: new Map(), idsTurno: new Set(), semId: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, turnosSemId: 0, visChars: 0 };
}
function acumular(acc, obj) {
  const msg = (obj && obj.message) || null;
  const u = (msg && msg.usage) || (obj && obj.usage);
  const id = msg && msg.id ? String(msg.id) : '';
  if (obj && obj.type === 'assistant') {
    // chars VISIVEIS (text + input das ferramentas): cada bloco aparece numa linha so — sem dedup
    const c = msg && Array.isArray(msg.content) ? msg.content : [];
    for (const b of c) {
      if (!b) continue;
      if (b.type === 'text') acc.visChars += String(b.text || '').length;
      else if (b.type === 'tool_use') { try { acc.visChars += JSON.stringify(b.input === undefined ? {} : b.input).length; } catch {} }
    }
    if (id) acc.idsTurno.add(id); else acc.turnosSemId++;   // turno = mensagem unica (id), nao linha
  }
  if (!u) return;
  const cur = { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheCreation: u.cache_creation_input_tokens || 0 };
  if (!id) {
    acc.semId.input += cur.input; acc.semId.output += cur.output;
    acc.semId.cacheRead += cur.cacheRead; acc.semId.cacheCreation += cur.cacheCreation;
    return;
  }
  const ant = acc.porId.get(id);
  if (!ant || cur.output > ant.output) acc.porId.set(id, cur);   // fica a linha de MAIOR output (o total da mensagem)
}
function fechar(acc) {
  const t = { input: acc.semId.input, output: acc.semId.output, cacheRead: acc.semId.cacheRead, cacheCreation: acc.semId.cacheCreation };
  for (const v of acc.porId.values()) { t.input += v.input; t.output += v.output; t.cacheRead += v.cacheRead; t.cacheCreation += v.cacheCreation; }
  t.turnos = acc.idsTurno.size + acc.turnosSemId;
  t.visiveisTok = Math.round(acc.visChars / 3.6);
  t.thinkingPct = t.output > 0 ? Math.max(0, Math.round(100 * (t.output - t.visiveisTok) / t.output)) : '';
  return t;
}

// Janelas de trabalho + TOKENS dos subagentes desta execucao (2.12.0 / 2.14.0).
// O Claude Code grava cada subagente em <projectDir>/<session>/subagents/agent-*.jsonl;
// a janela dele e [primeiro timestamp, ultimo timestamp], clampada ao intervalo do run.
//
// TOKENS (2.14.0): o scan principal le so os .jsonl do TOPO do diretorio do projeto —
// subagente vive em subpasta e por isso NUNCA entrou no tokens_output. Medido: a PRD-111
// registrou 322k de output com 22 subagentes invisiveis, e o transcript principal nao tem
// entrada isSidechain nenhuma (conferido: 0 de 1050) — nao ha risco de dupla contagem.
// Os tokens de subagente saem em campos SEPARADOS (tokens_*_subagents) para nao quebrar a
// serie historica de tokens_output.
// Best-effort: diretorio ausente/ilegivel => lista vazia (campos saem n/d, nunca zero).
// 3.5.3: 'tok' e um acumulador (novoAcumulador) — usage e turnos deduplicados por message.id.
function janelasSubagentes(dir, startMs, nowMs, tok, porPapel) {
  const janelas = [];
  let entradas;
  try { entradas = readdirSync(dir); } catch { return janelas; }
  for (const d of entradas) {
    const sub = join(dir, d, 'subagents');
    let st; try { st = statSync(sub); } catch { continue; }
    if (!st.isDirectory()) continue;
    let arquivos; try { arquivos = readdirSync(sub); } catch { continue; }
    for (const f of arquivos) {
      if (!f.endsWith('.jsonl')) continue;
      const p = join(sub, f);
      let fst; try { fst = statSync(p); } catch { continue; }
      if (startMs && fst.mtimeMs < startMs) continue;   // subagente de execucao anterior
      let text; try { text = readFileSync(p, 'utf8'); } catch { continue; }
      // 3.4.11: papel do subagente (meta.json ao lado) — tempo e turnos POR PAPEL na linha
      let papel = '', desc = '';
      try { const m = JSON.parse(readFileSync(p.replace(/\.jsonl$/, '.meta.json'), 'utf8')); papel = String(m.agentType || ''); desc = String(m.description || ''); } catch {}
      const accLocal = novoAcumulador();   // 3.5.3: turnos deste subagente = mensagens unicas
      let ini = Infinity, fim = 0;
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let o; try { o = JSON.parse(line); } catch { continue; }
        const t = o.timestamp ? Date.parse(o.timestamp) : NaN;
        // tokens/turnos do subagente: so entradas DENTRO do intervalo do run (o arquivo pode
        // ter sido tocado depois; a janela ja e clampada, os tokens tambem precisam ser)
        if (!(startMs && !Number.isNaN(t) && t < startMs)) {
          acumular(accLocal, o);
          if (tok) acumular(tok, o);
        }
        if (Number.isNaN(t)) continue;
        if (t < ini) ini = t;
        if (t > fim) fim = t;
      }
      const turnos = fechar(accLocal).turnos;
      if (!Number.isFinite(ini) || fim <= ini) continue;
      const s = startMs ? Math.max(ini, startMs) : ini;
      const e = Math.min(fim, nowMs);
      if (e > s) {
        janelas.push([s, e]);
        if (porPapel && papel) {
          // hermes: Modo C quando a descricao fala em corrigir/propagar/aplicar achado; senao Modo E
          let k = papel;
          if (papel === 'hermes') k = /modo c|corrig|propag|aplic|achado/i.test(desc) ? 'hermes-c' : 'hermes-e';
          // 3.4.20: maior "ciclo N" dos gates/revisores -> ciclos da run (o stop usa quando a sessao nao passa --ciclos)
          if (/^(sherlock|beholder|michelangelo)$/.test(papel)) { const cm = desc.match(/ciclo\s*(\d+)/i); if (cm) { const cn = parseInt(cm[1], 10); if (cn > (porPapel._ciclosMax || 0)) porPapel._ciclosMax = cn; } }
          const a = porPapel[k] || (porPapel[k] = { n: 0, busyS: 0, turnos: 0 });
          a.n++; a.busyS += Math.round((e - s) / 1000); a.turnos += turnos;
        }
      }
    }
  }
  return janelas;
}

try {
  const startEpoch = Number(process.argv[2] || 0);          // segundos
  const cwd = process.argv[3] || process.cwd();
  const waitsFile = process.argv[4] || '';
  const platform = (process.argv[5] || 'claude').toLowerCase(); // 2.0.0: claude | codex
  // 2.10.0: limiar (min) acima do qual um gap do transcript conta como espera
  // humana. <= 0 desliga a derivacao por gap (volta ao comportamento 1.8.0).
  const gapWaitMin = Number(process.argv[6] || 10) || 0;
  const gapWaitMs = gapWaitMin > 0 ? gapWaitMin * 60000 : Infinity;
  const startMs = startEpoch > 0 ? startEpoch * 1000 : 0;
  const nowMs = Date.now();

  // Host Codex (2.0.0): as sessoes ficam em ~/.codex/sessions num formato proprio
  // NAO documentado. Best-effort: somar campos usage/token de linhas JSON dos
  // .jsonl tocados desde o start. Nada parseavel => ok:false (a telemetria
  // reporta n/d — nunca inventa numero).
  if (platform === 'codex') {
    medirCodex(startMs, nowMs, gapWaitMs, gapWaitMin); // sempre termina o processo via out()/fail()
  }

  const projectsDir = join(homedir(), '.claude', 'projects');
  if (!existsSync(projectsDir)) fail('sem ~/.claude/projects');

  // 1) slug candidato do cwd: qualquer nao-alfanumerico vira '-' (convencao real
  // do Claude Code — '.'/'_' tambem viram '-', nao so / \ :)
  const slug = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  let dir = join(projectsDir, slug);

  // 2) fallback: o subdir com o .jsonl modificado mais recentemente
  if (!existsSync(dir)) {
    let best = null, bestM = 0;
    for (const d of readdirSync(projectsDir)) {
      const full = join(projectsDir, d);
      let st; try { st = statSync(full); } catch { continue; }
      if (!st.isDirectory()) continue;
      for (const f of readdirSync(full)) {
        if (!f.endsWith('.jsonl')) continue;
        let fst; try { fst = statSync(join(full, f)); } catch { continue; }
        if (fst.mtimeMs > bestM) { bestM = fst.mtimeMs; best = full; }
      }
    }
    if (!best) fail('nenhum transcript encontrado');
    dir = best;
  }

  // 3) somar usage de todos os .jsonl do dir modificados >= start (cobre a sessao
  //    principal + sidechains de subagente que caiam no mesmo diretorio) e coletar
  //    os timestamps das entradas (base do max_gap e da medicao de espera).
  //    3.5.3: usage DEDUPLICADO por message.id (ver cabecalho) — o clamp por startMs continua
  //    por linha (a mensagem inteira fica de um lado so do start).
  let files = 0;
  const accPai = novoAcumulador();
  // 3.4.23 (item 15b/18c): PERGUNTAS ao humano (tool_use AskUserQuestion no transcript PRINCIPAL)
  // contadas separadas de permission_prompts — a pergunta e a parada; a permissao para perguntar
  // e uma segunda parada (medido 04/09: 27 prompts "permission to use AskUserQuestion" em 2 dias).
  let askCount = 0;
  const tsList = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue;
    const path = join(dir, f);
    let st; try { st = statSync(path); } catch { continue; }
    if (startMs && st.mtimeMs < startMs) continue;   // arquivo inteiro anterior ao run
    files++;
    let text; try { text = readFileSync(path, 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let obj; try { obj = JSON.parse(line); } catch { continue; }
      let tMs = NaN;
      if (obj.timestamp) tMs = Date.parse(obj.timestamp);
      if (startMs && !Number.isNaN(tMs) && tMs < startMs) continue;
      if (!Number.isNaN(tMs)) tsList.push(tMs);
      if (obj.type === 'assistant' && line.includes('AskUserQuestion')) {
        const c = obj.message && Array.isArray(obj.message.content) ? obj.message.content : [];
        for (const b of c) if (b && b.type === 'tool_use' && b.name === 'AskUserQuestion') askCount++;
      }
      acumular(accPai, obj);
    }
  }
  const pai = fechar(accPai);
  const { input, output, cacheRead, cacheCreation } = pai;
  const total = input + output + cacheRead + cacheCreation;
  const result = { ok: true, input, output, cacheRead, cacheCreation, total, files, askCount };
  // 3.5.3: % estimado de raciocinio invisivel da sessao principal (inteiro; ausente quando output = 0)
  if (pai.thinkingPct !== '') result.thinkingPct = pai.thinkingPct;

  // 4) max_gap_min (diagnostico) + janelas de espera por GAP (2.10.0): todo
  //    intervalo entre entradas consecutivas maior que o limiar vira janela —
  //    e a fonte que pega a sessao deixada aberta sem prompt pendente, que o
  //    notify.sh nao ve (incidentes reais: gaps de 811-864 min com wait = 0).
  tsList.sort((a, b) => a - b);
  const gapWindows = [];
  let gapBrutoMs = 0;
  if (tsList.length >= 2) {
    let maxGap = 0;
    for (let i = 1; i < tsList.length; i++) {
      const g = tsList[i] - tsList[i - 1];
      if (g > maxGap) maxGap = g;
      if (g > gapWaitMs) { gapWindows.push([tsList[i - 1], tsList[i]]); gapBrutoMs += g; }
    }
    result.maxGapMin = Math.round((maxGap / 60000) * 10) / 10;
    if (gapWaitMin > 0) {
      result.gapCount = gapWindows.length;
      result.gapRawS = Math.round(gapBrutoMs / 1000);
      result.gapThresholdMin = gapWaitMin;
    }
  }

  // 4.1) janelas de TRABALHO dos subagentes (2.12.0) — o discriminador entre
  //      "sessao parada" e "sessao aguardando subagente em background".
  const accSub = novoAcumulador();   // 3.5.3: dedup por message.id tambem nos subagentes
  const porPapel = {};
  const subWindows = janelasSubagentes(dir, startMs, nowMs, accSub, porPapel);
  const busy = unir(subWindows);
  if (subWindows.length) {
    const subTok = fechar(accSub);
    result.subagentN = subWindows.length;
    result.ciclosMax = porPapel._ciclosMax || 0; delete porPapel._ciclosMax;
    result.subagentBusyS = Math.round(somar(subWindows) / 1000);  // SOMA (paralelismo)
    result.subagentSpanS = Math.round(somar(busy) / 1000);        // UNIAO (parede ocupada)
    result.subOutput = subTok.output;
    result.subInput = subTok.input;
    result.subTotal = subTok.input + subTok.output + subTok.cacheRead + subTok.cacheCreation;
    if (subTok.thinkingPct !== '') result.subThinkingPct = subTok.thinkingPct;   // 3.5.3
    // 3.4.11: dieta da criacao — tempo do hermes por modo, turnos dele e tempo dos gates
    const g = (k) => porPapel[k] || { n: 0, busyS: 0, turnos: 0 };
    result.hermesEBusyS = g('hermes-e').busyS; result.hermesCBusyS = g('hermes-c').busyS;
    result.hermesTurns = g('hermes-e').turnos + g('hermes-c').turnos;
    result.gatesBusyS = g('beholder').busyS + g('michelangelo').busyS + g('sherlock').busyS;
    result.porPapel = porPapel;
  }

  // 5) espera humana MEDIDA: cada linha do permission-waits.jsonl (hook notify.sh)
  //    abre uma janela que fecha na proxima entrada do transcript (o humano voltou).
  //    1.9.0: linhas type 'denied' (hook denied.sh) e 'spiral' (guard-bash.sh) sao
  //    negacoes do CLASSIFICADOR, nao espera humana — contam em deniedN/spiralN e
  //    ficam FORA das janelas (senao inflariam wait_human_min num outage).
  //    2.10.0: as janelas do notify e as de gap sao MESCLADAS antes de somar —
  //    um prompt pendurado de 4h aparece nas duas fontes e nao pode contar dobrado.
  const notifyWindows = [];
  if (waitsFile && existsSync(waitsFile)) {
    let deniedN = 0, spiralN = 0, waitsInvalid = 0;
    let text; try { text = readFileSync(waitsFile, 'utf8'); } catch { text = ''; }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      // 3.4.23 (item 15f): parser TOLERANTE — linha invalida (comando multi-linha gravado antes do
      // 20.8) e ignorada e CONTADA (waits_invalidas na linha da run) em vez de sumir em silencio.
      let w; try { w = JSON.parse(line); } catch { waitsInvalid++; continue; }
      if (!w || typeof w !== 'object') { waitsInvalid++; continue; }
      const wMs = Number(w.ts || 0) * 1000;
      if (!wMs || (startMs && wMs < startMs) || wMs > nowMs) continue;
      if (w.type === 'denied') { deniedN++; continue; }
      if (w.type === 'spiral') { spiralN++; continue; }
      let end = nowMs;
      for (const t of tsList) { if (t > wMs) { end = t; break; } }
      if (end > wMs) notifyWindows.push([wMs, end]);
    }
    result.deniedN = deniedN;
    result.spiralN = spiralN;
    result.permCount = notifyWindows.length;
    result.waitsInvalid = waitsInvalid;
  }
  //    2.12.0: da espera bruta (gaps U notify) sao SUBTRAIDAS as janelas de
  //    subagente vivo — o que sobra e a ociosidade REAL (waitS), a unica que
  //    desconta o elapsed_active_s. O que foi subtraido dos gaps vira gapBusyS
  //    (trabalho fora do transcript principal, nao espera).
  const esperaBruta = unir(gapWindows.concat(notifyWindows));
  if (esperaBruta.length) {
    const ocioso = subtrair(esperaBruta, busy);
    result.waitS = Math.round(somar(ocioso) / 1000);
    result.idleCount = ocioso.length;
    if (gapWindows.length) {
      const gapsUnidos = unir(gapWindows);
      const gapOcioso = somar(subtrair(gapsUnidos, busy));
      result.gapBusyS = Math.round((somar(gapsUnidos) - gapOcioso) / 1000);
    }
  } else if (tsList.length >= 2 || (waitsFile && existsSync(waitsFile))) {
    // espera mensuravel e nenhuma janela achada => espera zero DE VERDADE
    // (diferente de "nao mensuravel", que omite o campo e vira n/d)
    result.waitS = 0;
  }

  out(result);
} catch (e) {
  fail(String((e && e.message) || e));
}

// --- host Codex (2.0.0): leitura best-effort de ~/.codex/sessions ------------
// Formato interno do Codex nao e documentado; procuramos linhas JSON com objetos
// de usage (input_tokens/output_tokens ou equivalentes) nos .jsonl tocados desde
// o start. Encontrou => soma honesta; nao encontrou => ok:false (vira n/d).
function medirCodex(startMs, nowMs, gapWaitMs, gapWaitMin) {
  const base = join(homedir(), '.codex', 'sessions');
  if (!existsSync(base)) fail('sem ~/.codex/sessions (telemetria de tokens n/d no host codex)');
  let input = 0, output = 0, files = 0, achouUsage = false;
  const tsList = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      const full = join(dir, name);
      let st; try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { walk(full, depth + 1); continue; }
      if (!name.endsWith('.jsonl')) continue;
      if (startMs && st.mtimeMs < startMs) continue;
      files++;
      let text; try { text = readFileSync(full, 'utf8'); } catch { continue; }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let obj; try { obj = JSON.parse(line); } catch { continue; }
        const ts = obj.timestamp || obj.ts || (obj.payload && obj.payload.timestamp);
        const tMs = ts ? Date.parse(ts) : NaN;
        if (!Number.isNaN(tMs)) {
          if (startMs && tMs < startMs) continue;
          tsList.push(tMs);
        }
        // usage em qualquer nivel raso conhecido
        const cands = [obj.usage, obj.token_usage, obj.info && obj.info.token_usage,
          obj.payload && obj.payload.usage, obj.payload && obj.payload.info && obj.payload.info.token_usage];
        for (const u of cands) {
          if (!u || typeof u !== 'object') continue;
          const inp = u.input_tokens ?? u.prompt_tokens;
          const outp = u.output_tokens ?? u.completion_tokens;
          if (typeof inp === 'number' || typeof outp === 'number') {
            input += Number(inp) || 0;
            output += Number(outp) || 0;
            achouUsage = true;
          }
        }
      }
    }
  };
  walk(base, 0);
  if (!achouUsage) fail('sessoes Codex sem usage parseavel (formato desconhecido) — tokens n/d');
  const result = { ok: true, input, output, cacheRead: 0, cacheCreation: 0, total: input + output, files };
  // 2.10.0: espera por gap tambem no host codex (nao ha notify.sh la — os gaps
  // sao a UNICA fonte de espera humana nessa plataforma).
  // 2.12.0: o Codex nao expoe transcript por subagente, entao NAO da para separar
  // gap ocioso de gap com subagente vivo aqui — subagentBusyS sai AUSENTE (n/d,
  // nunca zero) e o waitS segue sendo o gap bruto. Leia com essa ressalva: uma
  // execucao Codex com muito subagente aparece com espera inflada, como toda
  // linha pre-2.12.0 (ver PLAYBOOK-TELEMETRIA).
  tsList.sort((a, b) => a - b);
  if (tsList.length >= 2) {
    let maxGap = 0, gapCount = 0, gapMs = 0;
    for (let i = 1; i < tsList.length; i++) {
      const g = tsList[i] - tsList[i - 1];
      if (g > maxGap) maxGap = g;
      if (g > gapWaitMs) { gapCount++; gapMs += g; }
    }
    result.maxGapMin = Math.round((maxGap / 60000) * 10) / 10;
    if (gapWaitMin > 0) {
      result.gapCount = gapCount;
      result.gapRawS = Math.round(gapMs / 1000);
      result.gapBusyS = 0;
      result.gapThresholdMin = gapWaitMin;
      result.idleCount = gapCount;
      result.waitS = Math.round(gapMs / 1000);
    }
  }
  out(result);
}
