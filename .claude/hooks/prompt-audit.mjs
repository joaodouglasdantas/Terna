#!/usr/bin/env node
// .claude/hooks/prompt-audit.mjs (3.4.25 — melhoria 1) — AUDITORIA DE PROMPTS do harness.
//
// Varre o que o modelo le como instrucao — .claude/agents/*.md, .claude/skills/*/SKILL.md,
// .claude/contratos/*.md (se existir), CLAUDE.md e .claude/PERFIL-RESUMO.md (se existirem) — e
// aponta, por arquivo e linha, os padroes DATADOS de prompt que a documentacao dos modelos 5
// manda tirar: pressao em caixa alta, contadores em prosa, scaffolds de raciocinio, filtro de
// severidade no revisor, fosseis (incidente datado como regra), repeticao entre arquivos, teto
// numerico de saida, "nao narre", proibicao de formatacao, nome de ferramenta em prosa e
// identidade sem contexto. So LE — nunca edita. A regua e o prompt-audit.md da skill claude-api
// (grupos 1a-1f, 2 e 3); cada "Signal" de la virou um grep aqui.
//
// Por que existe: cada geracao nova de modelo obedece mais literalmente. O "NUNCA" que segurou um
// modelo antigo derruba o recall do novo (o revisor que "so reporta bloqueantes" obedece e
// esconde o resto). O doctor mede; a decisao de mexer continua humana. Rito: a cada geracao nova
// de modelo, `bash .claude/harness-doctor.sh --prompt-audit`, decidir o que fica, gravar a
// baseline (`--prompt-audit-baseline`). Nas rodadas seguintes o doctor so ALERTA quando
// alto+medio SUBIU em relacao a baseline — nao grita todo dia sobre o que ja se decidiu manter.
//
// Saida (default):  AUDIT|<arquivo>|<id>|<nivel>|<linha>|<trecho ate 80 chars>   (uma por achado)
//                   AUDIT-BASELINE|<data>|base=N|atual=M|delta=+K|subiu|igual|desceu   (ou |ausente)
//                   AUDIT-RESUMO|arquivos=N|achados=N|alto=N|medio=N|baixo=N
// CLI:  node prompt-audit.mjs [--root <dir>] [--resumo] [--json] [--md] [--baseline]
//   --resumo    so as linhas AUDIT-BASELINE e AUDIT-RESUMO (o doctor usa)
//   --json      tudo em JSON
//   --md        grava prds/_metrics/prompt-audit-<AAAA-MM-DD>.md (tabela por arquivo) e imprime o caminho
//   --baseline  grava .claude/.harness-run/prompt-audit.baseline.json (alto/medio/baixo de hoje)
// Knobs (harness.env): HARNESS_PROMPT_AUDIT='on'|'off' · HARNESS_PROMPT_AUDIT_PRESSAO_POR_100='3'
//   · HARNESS_PROMPT_AUDIT_VERSAO_MAX='5' (versoes "(x.y.z)" por arquivo antes de virar narrativa).
// Niveis: alto = pressao (densidade), contador, severidade · medio = pressao (!!), scaffold, fossil
//   (incidente/medicao datada), repeticao, narracao, formatacao, identidade · baixo = pressao (enfase
//   sem porque), fossil (versao repetida, "agora/passou a" em regra), cap_numerico, tool_names.
// Exit sempre 0 (o doctor decide o que e warn). Nunca lanca excecao para fora.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeCtx } from './presence.mjs';

const ARGS = process.argv.slice(2);
const flag = f => ARGS.includes(f);
const argv = (f, d = '') => { const i = ARGS.indexOf(f); return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : d; };
const num = (v, d) => { const n = parseFloat(String(v ?? '').trim()); return Number.isFinite(n) ? n : d; };

// ---------------------------------------------------------------- sinais (a regua)
const RX = {
  caps: /\b(MUST|NEVER|ALWAYS|CRITICAL|IMPORTANT|NUNCA|SEMPRE|OBRIGAT[OÓ]RI[OA]S?|PROIBID[OA]S?|JAMAIS)\b/g,
  porque: /\b(porque|pois|motivo|medid[oa]s?|incidente|raz[aã]o)\b/i,
  bangbang: /!!/,
  contador: /(~?\d+\s+(chamadas|turnos|acoes|ações)\b|or[cç]amento de \d+|\bem \d+,? grave\b|contagem regressiva|teto de \d+ turnos)/i,
  scaffold: /(think step by step|pense passo a passo|ultrathink|<thinking>|<scratchpad>|mostre seu racioc[ií]nio|raciocine antes)/i,
  severidade: /(em d[uú]vida,? (sugest|nit)|s[oó] (reporte|liste) (bloqueantes|cr[ií]ticos)|n[aã]o (liste|reporte) (nits|baixa))/i,
  fossil: /(medido \d{2}\/\d{2}|incidente real|PRD-\d{3,5}[^)\n]{0,40}\b(min|turnos|tokens)\b|caso LOTE-\d+)/i,
  versao: /\(\d\.\d\.\d+\)/g,
  mudanca: /\b(agora|no longer|deixou de|passou a)\b/i,
  regra: /\b(nunca|sempre|deve|devem|precisa|n[aã]o|regra|use|rode|despache|s[oó])\b/i,
  cap: /(at[eé] \d+ (linhas|palavras|bullets)|no m[aá]ximo \d+ (linhas|palavras))/i,
  narracao: /(n[aã]o narre|hold (all )?findings|sem atualiza[cç][oõ]es intermedi[aá]rias|no interim)/i,
  formatacao: /(nunca use (bullets|headers|negrito)|no (bullet|header|bold)\b)/i,
  tool: /(mcp__[a-z_]+|\bBash\()/,
  allow: /(permissions?|allow|allowlist|settings\.json|deny)/i,
  secaoSaida: /(formato|relat[oó]rio|sa[ií]da|output|template|entreg)/i,
  knob: /HARNESS_[A-Z0-9_]+=/,
  medicao: /(medid[oa]s?\b|\b\d{2}\/\d{2}\b)/i,
  revogada: /(substitui|antig[oa]\b|removid|deixou de|n[aã]o (vale|e|é) mais)/i,
  fence: /^\s*(```|~~~)/,
  heading: /^#{1,6}\s/,
};
const NIVEL = { alto: 0, medio: 1, baixo: 2 };

function trecho(s) { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > 80 ? t.slice(0, 77) + '...' : t; }

// Le um arquivo em linhas, marcando frontmatter e fences (linha 1-based no original).
function lerLinhas(file) {
  let txt; try { txt = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const raw = txt.split(/\r?\n/);
  const out = []; let fm = false, fence = false;
  if (raw[0] && raw[0].trim() === '---') fm = true;
  for (let i = 0; i < raw.length; i++) {
    const l = raw[i];
    if (fm) { out.push({ n: i + 1, t: l, fm: true, fence: false }); if (i > 0 && l.trim() === '---') fm = false; continue; }
    if (RX.fence.test(l)) { fence = !fence; out.push({ n: i + 1, t: l, fm: false, fence: true }); continue; }
    out.push({ n: i + 1, t: l, fm: false, fence });
  }
  return out;
}

function auditarArquivo(rel, linhas, opts) {
  const A = [];
  const add = (id, nivel, linha, tr) => A.push({ arquivo: rel, id, nivel, linha, trecho: trecho(tr) });
  const corpo = linhas.filter(l => !l.fm);
  const prosa = corpo.filter(l => !l.fence);            // fora de fence
  const naoVazias = corpo.filter(l => l.t.trim());
  const ehSkill = /skills\//.test(rel);

  // identidade — corpo curto demais (identidade sem contexto)
  if (naoVazias.length < 15) add('identidade', 'medio', naoVazias.length ? naoVazias[0].n : 1, `corpo com ${naoVazias.length} linha(s) alem do frontmatter — identidade sem contexto`);

  // pressao — densidade de caixa alta por 100 linhas + !! + enfase sem porque
  const densas = [];
  let totalCaps = 0;
  for (let i = 0; i < prosa.length; i++) {
    const l = prosa[i];
    const m = l.t.match(RX.caps);
    if (m && m.length) {
      totalCaps++; densas.push({ n: l.n, k: m.length, t: l.t });
      const prox = prosa.slice(i + 1).find(x => x.t.trim());
      if (!RX.porque.test(l.t) && !(prox && RX.porque.test(prox.t))) add('pressao', 'baixo', l.n, `enfase sem porque: ${l.t}`);
    }
    if (RX.bangbang.test(l.t)) add('pressao', 'medio', l.n, `"!!": ${l.t}`);
  }
  const base = Math.max(prosa.filter(l => l.t.trim()).length, 1);
  const dens = (totalCaps * 100) / base;
  if (dens > opts.pressaoPor100) {
    const top = densas.sort((a, b) => b.k - a.k || a.n - b.n).slice(0, 5);
    add('pressao', 'alto', top[0].n, `densidade ${dens.toFixed(1)}/100 (limiar ${opts.pressaoPor100}) — linhas ${top.map(x => x.n).join(',')}`);
  }

  // contador / scaffold / severidade / fossil / cap / narracao / formatacao / tool_names
  let secao = '';
  let versoes = 0, primeiraVersao = 0;
  for (const l of prosa) {
    if (RX.heading.test(l.t)) secao = l.t;
    const t = l.t;
    if (!t.trim()) continue;
    // contador: teto/contagem DIRIGIDA ao agente — medicao datada ("medido 01/09: 418 chamadas") e fossil, nao contador
    if (RX.contador.test(t) && !RX.knob.test(t) && !RX.medicao.test(t)) add('contador', 'alto', l.n, t);
    if (RX.scaffold.test(t)) add('scaffold', 'medio', l.n, t);
    if (RX.severidade.test(t) && !RX.revogada.test(t)) add('severidade', 'alto', l.n, t);
    if (RX.fossil.test(t)) add('fossil', 'medio', l.n, t);
    const v = t.match(RX.versao); if (v) { if (!versoes) primeiraVersao = l.n; versoes += v.length; }
    if (RX.mudanca.test(t) && RX.regra.test(t) && !RX.heading.test(t) && !RX.knob.test(t)) add('fossil', 'baixo', l.n, `"agora/passou a" em regra: ${t}`);
    if (RX.cap.test(t) && !RX.secaoSaida.test(secao)) add('cap_numerico', 'baixo', l.n, t);
    if (RX.narracao.test(t)) add('narracao', 'medio', l.n, t);
    if (RX.formatacao.test(t)) add('formatacao', 'medio', l.n, t);
    if (ehSkill && RX.tool.test(t) && !RX.allow.test(t)) add('tool_names', 'baixo', l.n, t);
  }
  if (versoes > opts.versaoMax) add('fossil', 'baixo', primeiraVersao, `versao "(x.y.z)" citada ${versoes}x (> ${opts.versaoMax}) — versao como narrativa`);
  return A;
}

// repeticao — bloco de >= 3 linhas (normalizadas) presente em 2+ arquivos
const norm = s => s.trim().toLowerCase().replace(/^[-*>\d.)\s]+/, '').replace(/\s+/g, ' ');
function repeticao(arqs) {
  const tri = new Map();          // chave -> [{arquivo, linha, t}]
  const seqs = new Map();
  for (const { rel, linhas } of arqs) {
    const el = linhas.filter(l => !l.fm && !l.fence).map(l => ({ n: l.n, k: norm(l.t), t: l.t })).filter(x => x.k.length >= 30 && !/^\|?[-:| ]+\|?$/.test(x.k));
    seqs.set(rel, el);
    for (let i = 0; i + 2 < el.length; i++) {
      if (el[i + 2].n - el[i].n > 4) continue;
      const key = el[i].k + '\n' + el[i + 1].k + '\n' + el[i + 2].k;
      if (!tri.has(key)) tri.set(key, []);
      tri.get(key).push({ arquivo: rel, linha: el[i].n, t: el[i].t });
    }
  }
  const A = []; const visto = new Set();
  for (const { rel } of arqs) {
    const el = seqs.get(rel) || [];
    for (let i = 0; i + 2 < el.length; i++) {
      if (el[i + 2].n - el[i].n > 4) continue;
      const key = el[i].k + '\n' + el[i + 1].k + '\n' + el[i + 2].k;
      const hits = tri.get(key) || [];
      const outros = [...new Set(hits.map(h => h.arquivo))].filter(a => a !== rel);
      if (!outros.length || visto.has(key)) continue;
      // estende o bloco enquanto os proximos trigramas repetem no mesmo conjunto de arquivos
      let fim = i + 2;
      for (let j = i + 1; j + 2 < el.length; j++) {
        const k2 = el[j].k + '\n' + el[j + 1].k + '\n' + el[j + 2].k;
        const o2 = [...new Set((tri.get(k2) || []).map(h => h.arquivo))].filter(a => a !== rel);
        if (!o2.length || el[j + 2].n - el[j].n > 4) break;
        visto.add(k2); fim = j + 2;
      }
      visto.add(key);
      A.push({ arquivo: rel, id: 'repeticao', nivel: 'medio', linha: el[i].n, trecho: trecho(`${fim - i + 1} linhas tambem em ${outros.join(', ')}: ${el[i].t}`) });
    }
  }
  return A;
}

// ---------------------------------------------------------------- inventario
function inventario(ROOT) {
  const out = [];
  const push = f => { if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(f); };
  const ls = (d, rx) => { try { return fs.readdirSync(d).filter(f => rx.test(f)).sort().map(f => path.join(d, f)); } catch { return []; } };
  for (const f of ls(path.join(ROOT, '.claude', 'agents'), /\.md$/)) push(f);
  let skills = []; try { skills = fs.readdirSync(path.join(ROOT, '.claude', 'skills')).sort(); } catch {}
  for (const s of skills) push(path.join(ROOT, '.claude', 'skills', s, 'SKILL.md'));
  for (const f of ls(path.join(ROOT, '.claude', 'contratos'), /\.md$/)) push(f);   // pode nao existir — ausencia e ok
  push(path.join(ROOT, 'CLAUDE.md'));
  push(path.join(ROOT, '.claude', 'PERFIL-RESUMO.md'));
  return out;
}

export function auditar(root, knobs = {}) {
  const ROOT = path.resolve(root);
  const opts = { pressaoPor100: num(knobs.pressaoPor100, 3), versaoMax: num(knobs.versaoMax, 5) };
  const files = inventario(ROOT);
  const arqs = [];
  for (const f of files) { const linhas = lerLinhas(f); if (linhas) arqs.push({ rel: path.relative(ROOT, f).replace(/\\/g, '/'), linhas }); }
  let achados = [];
  for (const a of arqs) { try { achados = achados.concat(auditarArquivo(a.rel, a.linhas, opts)); } catch {} }
  try { achados = achados.concat(repeticao(arqs)); } catch {}
  achados.sort((a, b) => a.arquivo.localeCompare(b.arquivo) || NIVEL[a.nivel] - NIVEL[b.nivel] || a.linha - b.linha);
  const resumo = { arquivos: arqs.length, achados: achados.length, alto: 0, medio: 0, baixo: 0, por_id: {} };
  for (const a of achados) { resumo[a.nivel]++; resumo.por_id[a.id] = (resumo.por_id[a.id] || 0) + 1; }
  return { root: ROOT, arquivos: arqs.map(a => a.rel), achados, resumo };
}

// ---------------------------------------------------------------- baseline
const baselinePath = ROOT => path.join(ROOT, '.claude', '.harness-run', 'prompt-audit.baseline.json');
function lerBaseline(ROOT) { try { return JSON.parse(fs.readFileSync(baselinePath(ROOT), 'utf8')); } catch { return null; } }
function compararBaseline(ROOT, resumo) {
  const b = lerBaseline(ROOT);
  const atual = resumo.alto + resumo.medio;
  if (!b) return { existe: false, linha: 'AUDIT-BASELINE|ausente|grave com --baseline' };
  const base = (Number(b.alto) || 0) + (Number(b.medio) || 0);
  const delta = atual - base;
  const estado = delta > 0 ? 'subiu' : (delta < 0 ? 'desceu' : 'igual');
  return { existe: true, base, atual, delta, estado, data: b.data || '', linha: `AUDIT-BASELINE|${b.data || '?'}|base=${base}|atual=${atual}|delta=${delta >= 0 ? '+' : ''}${delta}|${estado}` };
}
const hoje = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

function relatorioMd(R, cmp, versao) {
  const L = [];
  L.push(`# Auditoria de prompts — ${hoje()}`, '');
  L.push(`> Gerado por \`.claude/hooks/prompt-audit.mjs\` (harness ${versao || '?'}). So diagnostico: nenhum arquivo foi editado.`);
  L.push(`> Regua: prompt-audit.md da skill claude-api (grupos 1a-1f, 2, 3). Decida o que fica; depois grave a baseline: \`bash .claude/harness-doctor.sh --prompt-audit-baseline\`.`, '');
  L.push(`**Resumo:** ${R.resumo.arquivos} arquivo(s) · ${R.resumo.achados} achado(s) — alto ${R.resumo.alto} · medio ${R.resumo.medio} · baixo ${R.resumo.baixo}`);
  L.push(`**Baseline:** ${cmp.existe ? `${cmp.data} (alto+medio ${cmp.base}) → hoje ${cmp.atual} (${cmp.estado}, delta ${cmp.delta >= 0 ? '+' : ''}${cmp.delta})` : 'ausente'}`, '');
  L.push('| id | achados |', '|---|---|');
  for (const [id, n] of Object.entries(R.resumo.por_id).sort((a, b) => b[1] - a[1])) L.push(`| ${id} | ${n} |`);
  L.push('');
  const por = new Map();
  for (const a of R.achados) { if (!por.has(a.arquivo)) por.set(a.arquivo, []); por.get(a.arquivo).push(a); }
  for (const f of R.arquivos) {
    const as = por.get(f) || [];
    L.push(`## \`${f}\` — ${as.length} achado(s)`, '');
    if (!as.length) { L.push('limpo.', ''); continue; }
    L.push('| linha | id | nivel | trecho |', '|---:|---|---|---|');
    for (const a of as) L.push(`| ${a.linha} | ${a.id} | ${a.nivel} | ${a.trecho.replace(/\|/g, '\\|')} |`);
    L.push('');
  }
  return L.join('\n') + '\n';
}

function isMain() { try { return path.resolve(process.argv[1] || '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); } catch { return false; } }
if (isMain()) {
  try {
    let root = argv('--root', '');
    if (!root) { const c = process.cwd(); root = fs.existsSync(path.join(c, '.claude', 'harness.env')) ? c : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); }
    const ctx = makeCtx(root);
    const ENV = ctx.ENV;
    if (String(ENV.HARNESS_PROMPT_AUDIT || 'on').toLowerCase() === 'off') { process.stdout.write('AUDIT-RESUMO|off\n'); process.exit(0); }
    const R = auditar(ctx.ROOT, { pressaoPor100: ENV.HARNESS_PROMPT_AUDIT_PRESSAO_POR_100, versaoMax: ENV.HARNESS_PROMPT_AUDIT_VERSAO_MAX });
    const cmp = compararBaseline(ctx.ROOT, R.resumo);
    const resumoLinha = `AUDIT-RESUMO|arquivos=${R.resumo.arquivos}|achados=${R.resumo.achados}|alto=${R.resumo.alto}|medio=${R.resumo.medio}|baixo=${R.resumo.baixo}`;
    if (flag('--baseline')) {
      const f = baselinePath(ctx.ROOT);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify({ ts: Math.floor(Date.now() / 1000), data: hoje(), harness: ENV.HARNESS_VERSION || '', arquivos: R.resumo.arquivos, achados: R.resumo.achados, alto: R.resumo.alto, medio: R.resumo.medio, baixo: R.resumo.baixo, por_id: R.resumo.por_id }, null, 2) + '\n');
      process.stdout.write(`AUDIT-BASELINE|gravada|${hoje()}|alto=${R.resumo.alto}|medio=${R.resumo.medio}|baixo=${R.resumo.baixo}|${path.relative(ctx.ROOT, f).replace(/\\/g, '/')}\n${resumoLinha}\n`);
      process.exit(0);
    }
    if (flag('--json')) { process.stdout.write(JSON.stringify({ ...R, baseline: cmp.existe ? cmp : null }, null, 2) + '\n'); process.exit(0); }
    if (flag('--md')) {
      const f = path.join(ctx.ROOT, 'prds', '_metrics', `prompt-audit-${hoje()}.md`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, relatorioMd(R, cmp, ENV.HARNESS_VERSION));
      process.stdout.write(`AUDIT-MD|${path.relative(ctx.ROOT, f).replace(/\\/g, '/')}\n${cmp.linha}\n${resumoLinha}\n`);
      process.exit(0);
    }
    if (!flag('--resumo')) for (const a of R.achados) process.stdout.write(`AUDIT|${a.arquivo}|${a.id}|${a.nivel}|${a.linha}|${a.trecho}\n`);
    process.stdout.write(cmp.linha + '\n' + resumoLinha + '\n');
  } catch (e) {
    process.stdout.write(`AUDIT-RESUMO|erro|${String(e && e.message || e).replace(/[\r\n|]/g, ' ').slice(0, 120)}\n`);
  }
  process.exit(0);
}
