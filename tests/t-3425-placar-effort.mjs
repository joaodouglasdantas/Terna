#!/usr/bin/env node
// tests/t-3425-placar-effort.mjs — bateria da 3.4.25 (melhorias 3 e 5 aprovadas em 08/09):
//   melhoria 5 — "Placar interno por modelo" no harness-dashboard.mjs a partir de prds/_metrics/tasks/*.jsonl:
//                por papel x modelo (n, medianas, PARCIAL %), revisores por ciclo (c1 x c2+), A/B do gate c1
//                (beholder/michelangelo sonnet x opus) com leitura pronta, verif_sem_prova tolerante,
//                modelo vazio = n/d, reguas em texto (PARCIAL >= 30% com n >= 5; c1 Sonnet < 60% do Opus).
//   melhoria 3 — knob "Thinking dos julgadores" (palavra-gatilho no prompt) saiu; entra "Esforco da sessao"
//                (preset -> medium/high/xhigh; subagente herda) e `fable` opt-in nos overrides de modelo:
//                Perfil/perfis/UI/skills sem a palavra-gatilho, UI expondo fable e o esforco efetivo.
// Roda em SANDBOX proprio por pid em os.tmpdir(); nunca toca o projeto real. Precisa de node >= 18.
// Porta de teste da UI: 47921 (127.0.0.1; sobe na primeira livre a partir dela).
//   node tests/t-3425-placar-effort.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const MASTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = process.env.T_SANDBOX || path.join(os.tmpdir(), `harness-3425-sandbox-${process.pid}`);
const BASE = path.join(S, 'base'), HOME = path.join(S, 'home'), OUT = path.join(S, 'out');
const PROJ = path.join(S, 'proj'), HOOKS = path.join(PROJ, '.claude', 'hooks');
const ENVB = { ...process.env, USERPROFILE: HOME, HOME, CLAUDECODE: '1' };
const PORT = 47921;

fs.rmSync(S, { recursive: true, force: true });
for (const d of [BASE, HOME, OUT]) fs.mkdirSync(d, { recursive: true });
console.log('sandbox:', S);

let pass = 0, fail = 0;
const ok = (nome, cond, extra = '') => { if (cond) { pass++; console.log('PASS', nome); } else { fail++; console.log('FAIL', nome, String(extra).slice(0, 400)); } };
const NOW = Math.floor(Date.now() / 1000);
const GATILHO = new RegExp('ultra' + 'think', 'i');   // montada por partes: o proprio teste nao pode aparecer no grep
const H = 3600;

// ---------------------------------------------------------------- melhoria 5: projeto falso com tasks jsonl semeado
function projeto(nome) {
  const d = path.join(BASE, nome);
  fs.mkdirSync(path.join(d, '.claude', '.harness-run'), { recursive: true });
  fs.mkdirSync(path.join(d, 'prds', '_metrics', 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(d, '.git'), { recursive: true });
  fs.writeFileSync(path.join(d, '.claude', 'harness.env'), `HARNESS_VERSION='3.4.25'\n`);
  fs.writeFileSync(path.join(d, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  return d;
}
let seq = 0;
const linha = (projeto, papel, rotulo, modelo, extra = {}) => JSON.stringify({
  ts: NOW - (++seq) * 600, projeto, maquina: 'dev@MAQ', autor: 'dev@beta', harness: '3.4.25', sessao: 's1', agent_id: 'a' + seq,
  papel, rotulo, modelo, dur_s: extra.dur ?? 900, turnos: extra.turnos ?? 20, bash: 3, read: 5, grep: 1, glob: 0, edit: 1, write: 0, agent: 0,
  tokens_in: 1000, tokens_out: extra.tok ?? 4000, status: extra.status ?? '✅', vermelhos: extra.verm ?? '', packet_kb: 40, alvos: 2, worktree: '',
  ...(extra.vsp !== undefined ? { verif_sem_prova: extra.vsp } : {}),
});
const zeta = projeto('zeta');
const L = [];
// beholder c1 sonnet x6 com 🔴 2,3,1,4,2,3 (mediana 2,5; total 15)
[2, 3, 1, 4, 2, 3].forEach((v, i) => L.push(linha('zeta', 'beholder', `PRD-10${i + 1}-c1`, 'claude-sonnet-5', { verm: v, dur: 700 + i * 10, tok: 3000 })));
// beholder c1 opus x5 com 🔴 3,2,4,3,3 (mediana 3; total 15)
[3, 2, 4, 3, 3].forEach((v, i) => L.push(linha('zeta', 'beholder', `PRD-20${i + 1}-c1`, 'claude-opus-4-6', { verm: v, dur: 1300 + i * 10, tok: 6000 })));
// beholder c2 opus x1 (nao entra no c1) com 🔴 1
L.push(linha('zeta', 'beholder', 'PRD-201-c2', 'claude-opus-4-6', { verm: 1 }));
// hefesto sonnet x6 com 2 PARCIAL; 3 linhas com verif_sem_prova (1 true, 1 "0", 1 false)
[0, 1, 2, 3, 4, 5].forEach((i) => L.push(linha('zeta', 'hefesto', `TASK-00${i + 1}`, 'claude-sonnet-5', { status: i < 2 ? 'PARCIAL' : '✅', ...(i === 0 ? { vsp: true } : i === 1 ? { vsp: '0' } : i === 2 ? { vsp: false } : {}) })));
// dedalo opus x3
[0, 1, 2].forEach((i) => L.push(linha('zeta', 'dedalo', `TASK-01${i + 1}`, 'claude-opus-4-6')));
// sherlock com modelo VAZIO (transcript sem message.model) => n/d
L.push(linha('zeta', 'sherlock', 'TASK-001-c1', '', { verm: 0 }));
fs.writeFileSync(path.join(zeta, 'prds', '_metrics', 'tasks', 'dev@MAQ.jsonl'), L.join('\n') + '\n');
// projeto eta: c1 Sonnet acha 1 vs Opus 3 (33% < 60%, n = 5/5) => alerta "reconsiderar o item 13"
const eta = projeto('eta');
const E = [];
[1, 1, 1, 1, 1].forEach((v, i) => E.push(linha('eta', 'michelangelo', `PRD-30${i + 1}-c1`, 'claude-sonnet-5', { verm: v })));
[3, 3, 3, 3, 3].forEach((v, i) => E.push(linha('eta', 'michelangelo', `PRD-40${i + 1}-c1`, 'claude-opus-4-6', { verm: v })));
fs.writeFileSync(path.join(eta, 'prds', '_metrics', 'tasks', 'dev@MAQ.jsonl'), E.join('\n') + '\n');

const dash = (args, cwd) => spawnSync(process.execPath, [path.join(MASTER, '.claude', 'hooks', 'harness-dashboard.mjs'), ...args], { encoding: 'utf8', cwd, env: ENVB });
let r = dash(['--all', `--base=${BASE}`, `--out=${OUT}`, '--sem-transcripts', '--periodo=30d'], zeta);
ok('dashboard --all roda sobre a base falsa (OK ... no stdout)', /OK \d+ execucoes/.test(r.stdout), r.stdout + r.stderr);
const jsonPath = fs.readdirSync(OUT).find((f) => f.endsWith('.json')), htmlPath = fs.readdirSync(OUT).find((f) => f.endsWith('.html'));
let J = null; try { J = JSON.parse(fs.readFileSync(path.join(OUT, jsonPath), 'utf8')); } catch {}
ok('JSON de saida existe e parseia', !!J);
const html = htmlPath ? fs.readFileSync(path.join(OUT, htmlPath), 'utf8') : '';
const P = (J && J.placarInterno) || [];
const pi = (papel, modelo) => P.find((l) => l.papel === papel && l.modelo === modelo);
ok('JSON: `placarInterno` e `abGateC1` presentes', Array.isArray(J && J.placarInterno) && Array.isArray(J && J.abGateC1));
const bs = pi('beholder', 'sonnet'), bo = pi('beholder', 'opus'), hs = pi('hefesto', 'sonnet'), dop = pi('dedalo', 'opus'), snd = pi('sherlock', 'n/d');
ok('beholder x sonnet: n=6, c1 🔴 mediana 2,5, total 15, 6 com 🔴, c2+ vazio', bs && bs.n === 6 && bs.c1.n === 6 && bs.c1.vermMed === 2.5 && bs.c1.vermTot === 15 && bs.c1.comVermelho === 6 && bs.cN.n === 0, JSON.stringify(bs));
ok('beholder x opus: n=6 (5 c1 + 1 c2), c1 🔴 mediana 3, total 15; c2+: n=1, 🔴 1', bo && bo.n === 6 && bo.c1.n === 5 && bo.c1.vermMed === 3 && bo.c1.vermTot === 15 && bo.cN.n === 1 && bo.cN.vermMed === 1, JSON.stringify(bo));
ok('modelo real vira familia (claude-sonnet-5 -> sonnet; claude-opus-4-6 -> opus)', !!bs && !!bo && !P.find((l) => /claude-/.test(l.modelo)));
ok('hefesto x sonnet: n=6, PARCIAL 2 (33%), executor, verif_sem_prova 1/3 (33%) lido com tolerancia', hs && hs.n === 6 && hs.parciais === 2 && hs.parcialPct === 33 && hs.executor === true && hs.verifSemProva && hs.verifSemProva.n === 3 && hs.verifSemProva.sim === 1 && hs.verifSemProvaPct === 33, JSON.stringify(hs));
ok('dedalo x opus: n=3, sem campo verif_sem_prova => null', dop && dop.n === 3 && dop.verifSemProva === null, JSON.stringify(dop));
ok('modelo vazio conta como n/d (sherlock)', snd && snd.n === 1 && snd.revisor === true, JSON.stringify(snd));
const ab = (J && J.abGateC1 || []).find((g) => g.papel === 'beholder'), abm = (J && J.abGateC1 || []).find((g) => g.papel === 'michelangelo');
ok('A/B beholder: sonnet n=6 / opus n=5, 🔴 med 2,5 x 3, criacoes 6/5 com 100% x 100% >= 1 🔴', ab && ab.sonnet.n === 6 && ab.opus.n === 5 && ab.sonnet.vermMed === 2.5 && ab.opus.vermMed === 3 && ab.sonnet.criacoes === 6 && ab.opus.criacoes === 5 && ab.sonnet.criacoesComVermelhoPct === 100 && ab.opus.criacoesComVermelhoPct === 100, JSON.stringify(ab));
ok('A/B beholder: razao 0,83, amostra ok (n >= 5 cada), NAO reconsiderar (>= 60%)', ab && ab.razao === 0.83 && ab.amostra === true && ab.reconsiderar === false, JSON.stringify(ab));
ok('A/B beholder: leitura pronta "c1 em Sonnet acha 2,5 🔴 vs 3 em Opus em 6/5 criacoes"', ab && ab.leitura.includes('c1 em Sonnet acha 2,5 🔴 vs 3 em Opus em 6/5 criacoes') && ab.leitura.includes('dentro da regua'), ab && ab.leitura);
const al = (J && J.alertas) || [];
ok('alerta "Placar por modelo" para hefesto · sonnet (PARCIAL 33% >= 30% com n=6)', al.some((a) => a.tipo === 'Placar por modelo' && a.quem === 'hefesto · sonnet' && /33%/.test(a.txt)), JSON.stringify(al.filter((a) => a.tipo === 'Placar por modelo')));
ok('sem alerta "Gate c1 (item 13)" na base zeta (razao 83%)', !al.some((a) => a.tipo === 'Gate c1 (item 13)' && a.quem === 'beholder'));
ok('HTML: secao "Placar interno por modelo" + A/B do gate + linha do beholder sonnet', html.includes('Placar interno por modelo (3.4.25)') && html.includes('A/B do gate no ciclo 1 (item 13)') && /<td><b>beholder<\/b><\/td><td>sonnet<\/td><td class="n">6<\/td>/.test(html));
ok('HTML: reguas em texto (PARCIAL >= 30 % · < 60 % do c1 Opus)', /PARCIAL ≥ 30 %/.test(html) && /&lt; 60 % do c1 Opus/.test(html));
// eta em --all: michelangelo c1 sonnet 1 x opus 3 => reconsiderar
ok('A/B michelangelo (eta, no --all): razao 33% com n=5/5 => reconsiderar=true + alerta "Gate c1 (item 13)"', abm && abm.reconsiderar === true && abm.razao === 0.33 && al.some((a) => a.tipo === 'Gate c1 (item 13)' && a.quem === 'michelangelo' && /reconsiderar o item 13/.test(a.txt)), JSON.stringify(abm) + JSON.stringify(al.filter((a) => a.tipo === 'Gate c1 (item 13)')));
// so o projeto zeta (sem --all): michelangelo nao existe la => leitura "sem ciclo 1"
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
r = dash(['--projeto=zeta', `--base=${BASE}`, `--out=${OUT}`, '--sem-transcripts', '--periodo=30d'], zeta);
let J2 = null; try { J2 = JSON.parse(fs.readFileSync(path.join(OUT, fs.readdirSync(OUT).find((f) => f.endsWith('.json'))), 'utf8')); } catch {}
ok('--projeto=zeta: placar so do zeta (sem michelangelo; beholder sonnet n=6)', J2 && !J2.placarInterno.find((l) => l.papel === 'michelangelo') && (J2.placarInterno.find((l) => l.papel === 'beholder' && l.modelo === 'sonnet') || {}).n === 6, r.stdout + r.stderr);
const abm2 = J2 && (J2.abGateC1 || []).find((g) => g.papel === 'michelangelo');
ok('--projeto=zeta: A/B michelangelo sem ciclo 1 medido — leitura diz isso, sem reconsiderar', abm2 && abm2.sonnet.n === 0 && abm2.opus.n === 0 && /sem ciclo 1 medido/.test(abm2.leitura) && abm2.reconsiderar === false, JSON.stringify(abm2));

// ---------------------------------------------------------------- melhoria 3: Perfil / perfis / skills (greps)
const ler = (...p) => fs.readFileSync(path.join(MASTER, ...p), 'utf8');
const perfilM = ler('.claude', 'PERFIL-PROJETO.md');
ok('Perfil: knob "Thinking dos julgadores" saiu da tabela; entrou "Esforço da sessão"', !perfilM.includes('| **Thinking dos julgadores** |') && perfilM.includes('| **Esforço da sessão** | `preset` `<preset / low / medium / high / xhigh / max>` |'));
ok('Perfil: tabela de expansao com a linha de esforco (medium / high / xhigh)', /\| \*\*Esforço da sessão\*\*[^|]*\| medium \| high[^|]*\| xhigh \|/.test(perfilM));
ok('Perfil: overrides aceitam fable (<sonnet / opus / fable>) nos 7 campos', (perfilM.match(/`<sonnet \/ opus \/ fable>`/g) || []).length === 7);
ok('Perfil: nota do fable (custo 2× Opus; gate c1 de dinheiro/seguranca ou sessao principal)', perfilM.includes('custo 2× Opus') && /gate c1 de PRD de dinheiro\/segurança/.test(perfilM));
ok('Perfil: sem a palavra-gatilho', !GATILHO.test(perfilM));
for (const p of ['php-laragon', 'node-api', 'generico']) {
  const t = ler('perfis', `${p}.md`);
  ok(`perfis/${p}.md: Esforço da sessão no lugar do Thinking; fable no override; sem palavra-gatilho`, t.includes('| **Esforço da sessão** | `preset` `<preset / low / medium / high / xhigh / max>` |') && !t.includes('Thinking dos julgadores') && t.includes('`fable`') && !GATILHO.test(t));
}
for (const sk of ['prd', 'prd-exec', 'codex-review', 'dt-exec', 'harness-report']) {
  const t = ler('.claude', 'skills', sk, 'SKILL.md');
  ok(`skills/${sk}: sem palavra-gatilho de thinking`, !GATILHO.test(t));
}
const prd = ler('.claude', 'skills', 'prd', 'SKILL.md'), prdExec = ler('.claude', 'skills', 'prd-exec', 'SKILL.md');
ok('/prd Passo 1: resolve "Esforco da sessao" (herda; avisa se CLAUDE_CODE_EFFORT_LEVEL diferir) e fable no model:', prd.includes('**Esforco da sessao** (3.4.25') && prd.includes('CLAUDE_CODE_EFFORT_LEVEL') && prd.includes('`model: "<resolvido>"`') && prd.includes('`"fable"`'));
ok('/prd-exec Passo 0: idem + fable', prdExec.includes('**Esforco da sessao** (3.4.25') && prdExec.includes('`model: "fable"`') && !prdExec.includes('inclua a palavra'));
ok('harness-report SKILL + PLAYBOOK: leitura do placar e reguas', ler('.claude', 'skills', 'harness-report', 'SKILL.md').includes('## Placar interno por modelo (3.4.25') && ler('.claude', 'PLAYBOOK-TELEMETRIA.md').includes('## Placar interno por modelo — decidir o preset com dados (3.4.25)'));
// varredura: nenhuma referencia viva a palavra-gatilho fora do CHANGELOG, dos backups da UI e do DETECTOR do prompt-audit
const vivos = [];
(function varrer(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (['.git', 'node_modules', '.harness-run'].includes(e.name)) continue; varrer(p); } else if (/\.(md|mjs|js|sh|html|json|txt)$/.test(e.name)) { if (e.name === 'CHANGELOG.md' || e.name === 'prompt-audit.mjs') continue; try { if (GATILHO.test(fs.readFileSync(p, 'utf8'))) vivos.push(path.relative(MASTER, p)); } catch {} } } })(MASTER);
ok('grep -rn da palavra-gatilho no mestre = zero fora do CHANGELOG (+ detector do prompt-audit)', !vivos.length, vivos.join(', '));

// ---------------------------------------------------------------- melhoria 3: UI sobe, lista fable e expoe o esforco efetivo
fs.mkdirSync(path.join(PROJ, '.claude', 'agents'), { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'hooks'), HOOKS, { recursive: true });
fs.cpSync(path.join(MASTER, '.claude', 'agents'), path.join(PROJ, '.claude', 'agents'), { recursive: true });
for (const f of ['harness.env', 'settings.json', 'PERFIL-PROJETO.md', 'harness-ui.mjs', 'harness-config.html']) fs.copyFileSync(path.join(MASTER, '.claude', f), path.join(PROJ, '.claude', f));
fs.writeFileSync(path.join(PROJ, '.claude', 'harness.env.local'), `HARNESS_PRESENCE_URL=''\nHARNESS_FRENTES='off'\nHARNESS_RAG_ENABLED='0'\nHARNESS_DAEMON='off'\n`);
fs.writeFileSync(path.join(PROJ, '.claude', 'PERFIL-RESUMO.md'), '# Resumo\n\nprojeto de teste.\n');
fs.mkdirSync(path.join(PROJ, 'prds'), { recursive: true });
const httpGet = (url) => new Promise((res) => { const rq = http.get(url, (rs) => { let b = ''; rs.on('data', (d) => b += d); rs.on('end', () => res({ status: rs.statusCode, body: b })); }); rq.on('error', () => res(null)); rq.setTimeout(5000, () => { rq.destroy(); res(null); }); });
async function subirUi(porta) {
  const ui = spawn(process.execPath, [path.join(PROJ, '.claude', 'harness-ui.mjs'), '--port', String(porta), '--idle', '2'], { cwd: PROJ, env: ENVB, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; ui.stdout.on('data', (d) => out += d); ui.stderr.on('data', (d) => out += d);
  const url = await new Promise((res) => { const t0 = Date.now(); const iv = setInterval(() => { const m = out.match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f-]+/); if (m || Date.now() - t0 > 15000) { clearInterval(iv); res(m ? m[0] : ''); } }, 100); });
  return { ui, url, out };
}
{
  const { ui, url, out } = await subirUi(PORT);
  ok('harness-ui.mjs sobe (Perfil default)', !!url, out.slice(0, 300));
  if (url) {
    const u = new URL(url);
    const h = await httpGet(url);
    ok('HTML: selects de modelo listam fable (2 renderizadores)', !!h && (h.body.match(/\['preset','sonnet','opus','fable'\]/g) || []).length === 2);
    ok('HTML: matriz com a linha "Esforço da sessão" (medium/high/xhigh) e select f_m_esforco; sem m_think/palavra-gatilho', !!h && /\['Esforço da sessão[^']*','medium','high','xhigh'\]/.test(h.body) && h.body.includes('f_m_esforco') && !h.body.includes('m_think') && !GATILHO.test(h.body));
    const st = await httpGet(`${u.origin}/api/state?t=${u.searchParams.get('t')}`);
    let js = null; try { js = JSON.parse(st.body); } catch {}
    ok('/api/state: esforco efetivo = high (preset equilibrado, origem preset) + modelosOverride com fable', js && js.esforco && js.esforco.efetivo === 'high' && js.esforco.origem === 'preset' && Array.isArray(js.modelosOverride) && js.modelosOverride.includes('fable'), st && st.body.slice(0, 300));
    ok('/api/state: perfilCampos.m_esforco = preset e nao existe m_think', js && js.perfilCampos && js.perfilCampos.m_esforco === 'preset' && !('m_think' in js.perfilCampos));
  }
  ui.kill();
}
{
  const perfil = path.join(PROJ, '.claude', 'PERFIL-PROJETO.md');
  fs.writeFileSync(perfil, fs.readFileSync(perfil, 'utf8')
    .replace('| **Modelo do beholder** | `preset` `<sonnet / opus / fable>` |', '| **Modelo do beholder** | `fable` |')
    .replace('| **Esforço da sessão** | `preset` `<preset / low / medium / high / xhigh / max>` |', '| **Esforço da sessão** | `xhigh` |'));
  const { ui, url } = await subirUi(PORT + 1);
  ok('harness-ui.mjs sobe (Perfil com overrides fable + xhigh)', !!url);
  if (url) {
    const u = new URL(url);
    const st = await httpGet(`${u.origin}/api/state?t=${u.searchParams.get('t')}`);
    let js = null; try { js = JSON.parse(st.body); } catch {}
    const beh = js && js.agentes.find((a) => a.slug === 'beholder');
    ok('/api/state: "Modelo do beholder: fable" vence o preset (modelo efetivo = fable)', beh && beh.modelo === 'fable' && beh.overrideValor === 'fable', beh && JSON.stringify(beh));
    ok('/api/state: "Esforço da sessão: xhigh" => efetivo xhigh, origem override', js && js.esforco.efetivo === 'xhigh' && js.esforco.origem === 'override' && js.esforco.preset === 'high', js && JSON.stringify(js.esforco));
  }
  ui.kill();
}

console.log(`\n== RESULTADO: ${pass} PASS, ${fail} FAIL ==`);
if (!fail) { try { fs.rmSync(S, { recursive: true, force: true }); } catch {} }
process.exit(fail ? 1 : 0);
