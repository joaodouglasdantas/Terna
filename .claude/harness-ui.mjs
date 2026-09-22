#!/usr/bin/env node
// .claude/harness-ui.mjs (2.8.0)
// BRIDGE LOCAL da tela do harness (.claude/harness-config.html). Node puro — SEM
// dependencias. Le o ecossistema REAL do projeto (Perfil, harness.env, skills,
// agentes, hooks, convencoes, telemetria, doctor) e GRAVA de volta o que a tela
// editou — edicao cirurgica, preservando comentarios e secoes nao tocadas.
//
// Uso:
//   node .claude/harness-ui.mjs [--port N] [--no-open] [--idle N]
//
// Imprime a URL com o token da sessao. Sem o token, todo request e 403.
//
// SEGURANCA (e um servidor que escreve arquivo — o desenho importa):
//   - bind SO em 127.0.0.1 (nunca 0.0.0.0);
//   - token aleatorio por execucao, exigido em toda rota /api/*;
//   - Host/Origin validados (anti DNS-rebinding);
//   - allowlist FIXA de escrita (ver GRAVAVEIS) + resolve/prefixo (sem '..');
//   - backup de todo arquivo antes de sobrescrever, em .claude/.harness-run/ui-backup/;
//   - convencoes so sao gravaveis quando HARNESS_ROLE='mestre' (harness.env).
//
// A tela funciona SEM este bridge (modo degradado: gera o texto p/ o Claude aplicar).
// Este arquivo so adiciona o "salvar direto".

import { createServer } from 'node:http';
import {
  readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, copyFileSync,
  openSync, readSync, closeSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
// 3.5.7: camadas de configuracao — a tela mostra a ORIGEM de cada chave (defaults|projeto|local|maquina|ambiente)
// e GRAVA na camada certa: decisao do harness -> hooks/_defaults.env (so no mestre; num projeto vira override
// consciente no harness.env), chave de projeto -> harness.env, chave de maquina -> harness.env.local.
import { resolver as resolverCamadas, classificar as classificarChave, lerCamadasTxt, lerArquivoEnv } from './hooks/harness-env.mjs';

const CLAUDE_DIR = dirname(fileURLToPath(import.meta.url));   // .../.claude
const ROOT = resolve(CLAUDE_DIR, '..');                        // raiz do projeto

// ---------------------------------------------------------------------------
// NUCLEO conhecido desta versao — usado so para classificar a ORIGEM de cada
// skill/agente na tela (nucleo do mestre vs extra local). Atualizar junto com
// a versao do harness; o harness-doctor.sh cobra a coerencia.
// ---------------------------------------------------------------------------
const NUCLEO = {
  skills: ['prd', 'prd-exec', 'dt', 'dt-exec', 'dt-sweep', 'codex-review', 'manual', 'prometeu',
           'harness-config', 'harness-report', 'convencao', 'mockup',
           'ui-ux-pro-max'],   // ui-ux-pro-max: skill de TERCEIRO versionada (2.9.0)
  agents: ['beholder', 'michelangelo', 'tony-stark', 'sherlock', 'atlas', 'hefesto', 'peter-quill',
           'ariadne', 'dedalo', 'prometeu', 'themis'],
  hooks:  ['lint.sh', 'codex-review.sh', 'external-review.sh', 'guard-bash.sh', 'denied.sh',
           'notify.sh', 'sync-memory.sh', 'rag-inject.sh', 'rag-capture-session.sh',
           'rag-capture-agent.sh', 'rag-ensure-index.sh', 'harness-metrics.sh',
           'harness-metrics.mjs', 'harness-dashboard.mjs', '_host-detect.sh', '_rag-common.sh',
           'harness-delegate.sh', '_delegate-common.sh', 'perfil-frescor.sh', 'presence.sh', 'task-packet.sh', 'harness-duelo.sh', 'harness-worktree.sh', 'guard-agent.sh'],
};

// Arquivos que a tela pode GRAVAR (relativos a raiz do projeto).
const GRAVAVEIS = [
  '.claude/PERFIL-PROJETO.md',
  '.claude/PERFIL-RESUMO.md',
  '.claude/harness.env',
  '.claude/settings.json',
];
// Arquivos que a tela pode LER (alem dos gravaveis). Segredos e estado por
// maquina ficam de fora de proposito.
const LEGIVEIS_EXTRA = ['.claude/ONBOARDING.md', '.claude/PLATAFORMAS.md', 'CHANGELOG.md'];
const NUNCA = ['.claude/settings.local.json', '.claude/harness.env.local'];

// 3.0.0 — O harness.env.local continua FORA da allowlist de arquivo (ele guarda
// segredo por maquina: HARNESS_PRESENCE_TOKEN, caminhos privados...). Mas o dial
// de economia PRECISA morar la — e a decisao pessoal ("minha conta esta apertada")
// nao pode virar commit no repo da equipe.
// A fresta e por CHAVE, nunca por arquivo: a tela so le e so grava estas chaves;
// o resto do .local nunca e enviado ao browser nem tocado na escrita (o setEnv e
// um patch cirurgico, entao um token existente permanece intacto e invisivel).
const ENV_LOCAL_CHAVES = [
  'HARNESS_DELEGATE_MODE', 'HARNESS_DELEGATE_FALLBACK', 'HARNESS_VERBOSITY',
  'HARNESS_DELEGATE_TIMEOUT', 'HARNESS_DELEGATE_MAX_PER_RUN',
  // 3.3.0/3.4.0 — duelo, OpenRouter, noturno (valores; a CHAVE de API nunca passa pela tela)
  'HARNESS_DUELO', 'HARNESS_DUELO_MODELS', 'HARNESS_DUELO_JUIZ', 'HARNESS_DUELO_JUIZ_MODEL', 'HARNESS_DUELO_REASONING',
  'HARNESS_DUELO_TOOLS', 'HARNESS_DUELO_ROTEAMENTO', 'HARNESS_OPENROUTER_MODEL', 'HARNESS_OPENROUTER_BUDGET_USD_DAY',
  'HARNESS_OPENROUTER_SORT', 'HARNESS_NOTURNO', 'HARNESS_NOTURNO_MAX_LOTES', 'HARNESS_DUELO_JUIZ_CLOUD', 'HARNESS_WT_DB',
];
const soChavesLocais = (obj) => Object.fromEntries(
  Object.entries(obj || {}).filter(([k]) => ENV_LOCAL_CHAVES.includes(k)));

// ---------------------------------------------------------------------------
// Utilitarios de arquivo
// ---------------------------------------------------------------------------
const ler = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
// Le so o INICIO do arquivo. A aba Trabalho abre ~1300 arquivos (335 DTs + as
// tasks de 108 PRDs) e so precisa do cabecalho de cada um — ler tudo custava
// 1,4s. Corta no ultimo \n para nao partir um caractere multibyte ao meio.
function lerInicio(p, bytes = 4096) {
  let fd;
  try {
    fd = openSync(p, 'r');
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    const txt = buf.subarray(0, n).toString('utf8');
    if (n < bytes) return txt;                    // arquivo inteiro coube
    const corte = txt.lastIndexOf('\n');
    return corte > 0 ? txt.slice(0, corte) : txt;
  } catch { return ''; } finally { if (fd !== undefined) { try { closeSync(fd); } catch { /* ja fechado */ } } }
}
const existe = (p) => { try { return existsSync(p); } catch { return false; } };
const semAcento = (s) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
const norm = (s) => semAcento(s).toLowerCase().replace(/[`*_]/g, '').trim();

function carimbo() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Resolve um caminho relativo contra a raiz, barrando escape de diretorio.
function caminhoSeguro(rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\0')) return null;
  const limpo = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (limpo.startsWith('/') || /^[a-zA-Z]:/.test(limpo)) return null;   // absoluto
  const abs = resolve(ROOT, limpo);
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) return null;         // escapou
  if (NUNCA.includes(limpo)) return null;
  return { abs, rel: limpo };
}

function podeGravar(rel) {
  if (GRAVAVEIS.includes(rel)) return true;
  // Convencoes: so no harness MESTRE (a regra "convencao nasce no harness base").
  if (/^\.claude\/convencoes\/[A-Za-z0-9._-]+\.md$/.test(rel)) return papel() === 'mestre';
  return false;
}
function podeLer(rel) {
  if (podeGravar(rel) || GRAVAVEIS.includes(rel) || LEGIVEIS_EXTRA.includes(rel)) return true;
  return /^\.claude\/(convencoes|skills|agents|hooks)\/.+$/.test(rel);
}

function backup(absArquivo, relArquivo, ts) {
  if (!existe(absArquivo)) return null;
  const destino = join(CLAUDE_DIR, '.harness-run', 'ui-backup', ts, relArquivo);
  mkdirSync(dirname(destino), { recursive: true });
  // .harness-run pode nao estar coberto pelo .gitignore do alvo (o sync nao
  // propaga .gitignore) — mesma defesa do harness-sync.sh.
  const gi = join(CLAUDE_DIR, '.harness-run', '.gitignore');
  if (!existe(gi)) { try { writeFileSync(gi, '*\n'); } catch { /* nao critico */ } }
  copyFileSync(absArquivo, destino);
  return relative(ROOT, destino).replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// harness.env — parse e escrita preservando comentarios
// ---------------------------------------------------------------------------
function parseEnv(texto) {
  const ativos = {}, comentados = {};
  for (const linha of texto.split(/\r?\n/)) {
    let m = linha.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) { ativos[m[1]] = despir(m[2]); continue; }
    m = linha.match(/^\s*#\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m && comentados[m[1]] === undefined) comentados[m[1]] = despir(m[2]);
  }
  return { ativos, comentados };
}
function despir(v) {
  const s = (v || '').trim().replace(/\s+#.*$/, '').trim();
  if (/^'.*'$/.test(s) || /^".*"$/.test(s)) return s.slice(1, -1);
  return s;
}
// Aspas simples nao admitem escape em sh; valor com ' vai entre aspas duplas.
function citar(v) {
  const s = String(v ?? '');
  if (!s.includes("'")) return `'${s}'`;
  return `"${s.replace(/(["$`\\])/g, '\\$1')}"`;
}

function setEnv(texto, patch) {
  const eol = texto.includes('\r\n') ? '\r\n' : '\n';
  let out = texto;
  for (const [k, v] of Object.entries(patch)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(k)) continue;
    const valor = `${k}=${citar(v)}`;
    // '[^\r\n]*' em vez de '.*': num arquivo CRLF o '$' de /m casa ANTES do
    // '\r', e um '.*' guloso pararia ali de qualquer forma — explicito e mais
    // seguro, e mantem o '\r' fora da substituicao (EOL preservado).
    const ativo = new RegExp(`^([ \\t]*)${k}=[^\\r\\n]*$`, 'm');
    if (ativo.test(out)) { out = out.replace(ativo, `$1${valor}`); continue; }
    const comentado = new RegExp(`^([ \\t]*)#[ \\t]*${k}=[^\\r\\n]*$`, 'm');
    if (comentado.test(out)) { out = out.replace(comentado, `$1${valor}`); continue; }
    out = out.replace(/\s*$/, eol) + `${valor}${eol}`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// PERFIL-PROJETO.md — parse e escrita CIRURGICA (nunca regenera o arquivo)
// ---------------------------------------------------------------------------
// Cada entrada: id -> [prefixo da secao, label do campo].
const PERFIL_MAP = {
  proj_nome:      ['Identificacao', 'Nome do projeto'],
  proj_slug:      ['Identificacao', 'Slug'],
  proj_repo:      ['Identificacao', 'Repositorio / deploy'],
  proj_stack:     ['Identificacao', 'Stack resumida'],
  cli_interp:     ['CLI', 'Interpretador (run/lint)'],
  cli_interp_alt: ['CLI', 'Interpretador (alt. SO)'],
  cli_db:         ['CLI', 'Cliente de banco'],
  cli_db_alt:     ['CLI', 'Cliente de banco (alt. SO)'],
  cli_pkg:        ['CLI', 'Gerenciador de pacotes'],
  db_sgbd:        ['Banco de dados', 'SGBD'],
  db_host:        ['Banco de dados', 'Host'],
  db_name:        ['Banco de dados', 'Database'],
  db_user:        ['Banco de dados', 'Usuario'],
  db_pass:        ['Banco de dados', 'Senha'],
  db_smoke:       ['Banco de dados', 'Comando de smoke test'],
  db_soft:        ['Banco de dados', 'Soft delete'],
  app_url:        ['Aplicacao', 'Base URL local'],
  app_api:        ['Aplicacao', 'Base URL da API'],
  app_dev:        ['Aplicacao', 'Como subir o dev server'],
  lint_cmd:       ['Lint automatico', 'Comando de lint'],
  lint_ext:       ['Lint automatico', 'Extensoes verificadas'],
  lint_block:     ['Lint automatico', 'Bloqueante?'],
  e2e_fw:         ['Testes E2E', 'Framework'],
  e2e_dir:        ['Testes E2E', 'Diretorio dos specs'],
  e2e_url:        ['Testes E2E', 'Base URL'],
  e2e_user:       ['Testes E2E', 'Login de teste (usuario)'],
  e2e_pass:       ['Testes E2E', 'Login de teste (senha)'],
  e2e_sel:        ['Testes E2E', 'Seletores do login'],
  e2e_one:        ['Testes E2E', 'Comando (spec unico)'],
  e2e_all:        ['Testes E2E', 'Comando (suite completa)'],
  e2e_shots:      ['Testes E2E', 'Pasta de screenshots'],
  e2e_headless:   ['Testes E2E', 'Headless'],
  sm_flag:        ['Safe Mode', 'Flag de ativacao'],
  sm_query:       ['Safe Mode', 'Query de validacao'],
  sm_white:       ['Safe Mode', 'Whitelist (se aplicavel)'],
  sm_detect:      ['Safe Mode', 'Como detectar "ambiente local"'],
  sm_unlock:      ['Safe Mode', 'SQL pronto p/ desbloquear'],
  cdx_reports:    ['Codex review', 'Pasta de relatorios'],
  cdx_ciclos:     ['Codex review', 'Limite de ciclos'],
  cdx_reasoning:  ['Codex review', 'Reasoning do Codex'],
  cdx_severity:   ['Codex review', 'Piso de severidade do review'],
  manual_mec:     ['Manual vivo', 'Mecanismo'],
  preset:         ['Nivel de esforco', 'Preset de esforco'],
  m_disc:         ['Agentes do harness', 'Modelo do discovery analitico'],
  m_sherlock:     ['Agentes do harness', 'Modelo do sherlock'],
  m_atlas:        ['Agentes do harness', 'Modelo do atlas'],
  m_tony:         ['Agentes do harness', 'Modelo do tony-stark'],
  m_beholder:     ['Agentes do harness', 'Modelo do beholder'],
  m_michel:       ['Agentes do harness', 'Modelo do michelangelo'],
  m_dedalo:       ['Agentes do harness', 'Modelo do dedalo'],
  m_esforco:      ['Agentes do harness', 'Esforco da sessao'],
  m_sher_refino:  ['Agentes do harness', 'Modelo do sherlock nos ciclos de refino'],
  m_gates_refino: ['Agentes do harness', 'Modelo dos gates nos ciclos de refino'],
  m_ciclos_beh:   ['Agentes do harness', 'Ciclos do beholder'],
  m_ciclos_mic:   ['Agentes do harness', 'Ciclos do michelangelo'],
  cmp_runtime:    ['Compatibilidade de producao', 'Runtime de producao'],
  cmp_outras:     ['Compatibilidade de producao', 'Outras restricoes'],
  tz_zone:        ['Timezone', 'Timezone do projeto'],
  tz_fmt:         ['Timezone', 'Formato de exibicao'],
  tz_origem:      ['Timezone', 'Origem das datas de negocio'],
  st_api:         ['Estrutura de diretorios', 'Endpoints / API'],
  st_views:       ['Estrutura de diretorios', 'Paginas / views'],
  st_js:          ['Estrutura de diretorios', 'JS de pagina'],
  st_migr:        ['Estrutura de diretorios', 'Migrations'],
  st_schema:      ['Estrutura de diretorios', 'Mapa do schema'],
  st_prds:        ['Estrutura de diretorios', 'PRDs'],
  st_dts:         ['Estrutura de diretorios', 'Debitos tecnicos'],
  st_docraiz:     ['Estrutura de diretorios', 'Doc raiz de convencoes'],
  plat_targets:   ['Plataformas', 'Superficies instaladas'],
  plat_reviewer:  ['Plataformas', 'Revisor externo do review'],
};
// Secoes de TEXTO LIVRE (corpo inteiro, nao tabela).
const PERFIL_BLOCOS = {
  integr: 'Integracoes com efeitos',
  arm:    'Armadilhas do projeto',
  armt:   'Armadilhas de teste',
};

// --- Roteamento de agentes externos (3.0.0) --------------------------------
// A tabela "Roteamento por papel" NAO cabe no PERFIL_MAP: as linhas dela sao
// "| discovery-dts | `codex-cli` | `native` | read-only |" — o rotulo nao vem em
// negrito, entao o acharCampo() (que casa "| **Label** |") nunca a enxerga.
// Por isso ela tem leitor e gravador proprios, cirurgicos como o setPerfilCampos:
// so as celulas dos papeis conhecidos sao tocadas; a prosa da secao fica intacta.
const PAPEIS_ROTA = [
  'discovery-dts', 'discovery-schema', 'discovery-codigo', 'discovery-prds',
  'inovacao', 'impacto', 'beholder', 'michelangelo',
];

function acharLinhaRota(linhas, papel) {
  const alvo = norm(papel);
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.startsWith('|')) continue;
    const c = l.split('|');
    if (c.length < 4) continue;
    if (norm(c[1]) === alvo) return i;
  }
  return -1;
}

function lerRoteamento(perfilTxt) {
  const rota = {};
  if (!perfilTxt) return rota;
  const linhas = perfilTxt.split(/\r?\n/);
  const cel = (s) => {
    const v = String(s || '').trim();
    const m = v.match(/`([^`]*)`/);
    return (m ? m[1] : v).trim();
  };
  for (const p of PAPEIS_ROTA) {
    const i = acharLinhaRota(linhas, p);
    if (i < 0) { rota[p] = null; continue; }   // null = a tabela nao tem esse papel
    const c = linhas[i].split('|');
    rota[p] = { executor: cel(c[2]), fallback: cel(c[3] || '') };
  }
  return rota;
}

function setRoteamento(texto, patch) {
  const eol = texto.includes('\r\n') ? '\r\n' : '\n';
  const linhas = texto.split(/\r?\n/);
  const naoAplicados = [];
  for (const [papel, v] of Object.entries(patch)) {
    if (!PAPEIS_ROTA.includes(papel)) continue;
    const i = acharLinhaRota(linhas, papel);
    if (i < 0) { naoAplicados.push(papel); continue; }
    const c = linhas[i].split('|');
    if (c.length < 4) { naoAplicados.push(papel); continue; }
    const exec = String(v.executor || 'preset').trim();
    // Papel nativo nao tem fallback — grava travessao para nao mentir na tabela.
    const fb = exec === 'native' ? '—' : String(v.fallback || 'preset').trim();
    c[2] = ` \`${exec}\` `;
    c[3] = ` \`${fb}\` `;
    linhas[i] = c.join('|');
  }
  return { texto: linhas.join(eol), naoAplicados };
}

// Indexa o markdown: linhas de secao + linhas de tabela "| **Label** | valor |".
// ATENCAO ao CRLF: em JS o '.' NAO casa '\r' (e line terminator), entao um
// split('\n') cru faz todo regex ancorado em '$' falhar num arquivo CRLF — que
// e o caso dos Perfis em Windows. Split tolerante + EOL original preservado na
// escrita (senao o git veria o arquivo inteiro como modificado).
function indexarPerfil(texto) {
  const eol = texto.includes('\r\n') ? '\r\n' : '\n';
  const linhas = texto.split(/\r?\n/);
  const secoes = [];      // { titulo, norm, ini, fim }
  const campos = [];      // { secao, label, valor, hint, idx }
  linhas.forEach((l, i) => {
    const m = l.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (secoes.length) secoes[secoes.length - 1].fim = i - 1;
      secoes.push({ titulo: m[1], norm: norm(m[1]), ini: i, fim: linhas.length - 1 });
    }
  });
  const secaoDe = (i) => secoes.find((s) => i > s.ini && i <= s.fim) || null;
  linhas.forEach((l, i) => {
    const m = l.match(/^\|\s*\*\*(.+?)\*\*\s*\|(.*)$/);
    if (!m) return;
    const s = secaoDe(i);
    const celulas = m[2].split('|');
    const bruto = celulas[0] || '';
    const grupos = [...bruto.matchAll(/`([^`]*)`/g)].map((g) => g[1]);
    let valor = '', hint = '';
    if (grupos.length === 0) valor = bruto.trim();
    else if (grupos.length === 1) valor = grupos[0].startsWith('<') ? '' : grupos[0];
    else { valor = grupos[0].startsWith('<') ? '' : grupos[0]; hint = grupos.slice(1).join('` `'); }
    campos.push({ secao: s ? s.norm : '', label: norm(m[1]), labelBruto: m[1], valor, hint, idx: i });
  });
  return { linhas, secoes, campos, eol };
}

function acharCampo(ix, prefixoSecao, label) {
  const ps = norm(prefixoSecao), pl = norm(label);
  const exato = ix.campos.find((c) => c.secao.startsWith(ps) && c.label === pl);
  if (exato) return exato;
  // 3.4.2 — TOLERANCIA A DERIVA DE ROTULO: Perfil antigo/customizado usa variantes do rotulo
  // ("Whitelist (WAHA)" × "Whitelist (se aplicavel)"). O parentetico e explicacao, nao
  // identidade: compare com ele removido. Falso "campo vazio" mandava o dev preencher o que
  // ja existia (aconteceu no dra-mariana-duarte, 23/08).
  const semPar = (s) => s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const plp = semPar(pl);
  return ix.campos.find((c) => c.secao.startsWith(ps) && semPar(c.label) === plp) || null;
}

// Reescreve SO as celulas de valor dos campos informados. Preserva o hint
// "<a / b / c>" e todas as colunas extras (ex.: "Quando o agente roda").
function setPerfilCampos(texto, patch) {
  const ix = indexarPerfil(texto);
  const linhas = ix.linhas;
  const naoAplicados = [];
  for (const [id, valor] of Object.entries(patch)) {
    const map = PERFIL_MAP[id];
    if (!map) continue;
    const campo = acharCampo(ix, map[0], map[1]);
    if (!campo) { naoAplicados.push(id); continue; }
    const l = linhas[campo.idx];
    const m = l.match(/^(\|\s*\*\*.+?\*\*\s*\|)([^|]*)(\|.*)?$/);
    if (!m) { naoAplicados.push(id); continue; }
    const v = String(valor ?? '').trim();
    const celula = ` \`${v}\`${campo.hint ? ` \`${campo.hint}\`` : ''} `;
    linhas[campo.idx] = m[1] + celula + (m[3] || '|');
  }
  return { texto: linhas.join(ix.eol), naoAplicados };
}

// Substitui o CORPO inteiro de uma secao (texto livre). Nao mexe no titulo.
function setPerfilBloco(texto, prefixoSecao, corpo) {
  const ix = indexarPerfil(texto);
  const ps = norm(prefixoSecao);
  const s = ix.secoes.find((x) => x.norm.startsWith(ps));
  if (!s) return { texto, ok: false };
  const linhas = ix.linhas;
  const antes = linhas.slice(0, s.ini + 1);
  const depois = linhas.slice(s.fim + 1);
  const corpoLinhas = String(corpo ?? '').replace(/\s+$/, '').split(/\r?\n/);
  return { texto: [...antes, '', ...corpoLinhas, ''].concat(depois).join(ix.eol), ok: true };
}

// Le a secao "Convencoes adotadas" -> { slug: {estado, obs} }
function lerAdocao(texto) {
  const ix = indexarPerfil(texto);
  const s = ix.secoes.find((x) => x.norm.startsWith('convencoes adotadas'));
  const out = {};
  if (!s) return out;
  for (let i = s.ini + 1; i <= s.fim; i++) {
    const m = ix.linhas[i].match(/^\|\s*`([a-z0-9-]+)`\s*\|\s*`([a-z-]+)`[^|]*\|(.*)\|\s*$/);
    if (m) out[m[1]] = { estado: m[2], obs: (m[3] || '').trim() };
  }
  return out;
}

const ADOCAO_HINT = '`<adotada / parcial / nao-adotada / nao-se-aplica>`';
function setAdocao(texto, adocao) {
  const corpo = [
    '',
    '| Convenção | Estado | Observação |',
    '|-----------|--------|------------|',
    ...Object.entries(adocao).map(([slug, v]) =>
      `| \`${slug}\` | \`${v.estado || 'nao-adotada'}\` ${ADOCAO_HINT} | ${(v.obs || '').trim()} |`),
    '',
    '> Estado de adoção das convenções da casa (`.claude/convencoes/`) NESTE projeto. Seção',
    '> ausente = tudo `nao-adotada`. Editável pela tela (`/harness-config`) ou pela `/convencao`.',
    '',
  ];
  const ix = indexarPerfil(texto);
  const arr = ix.linhas;
  const s = ix.secoes.find((x) => x.norm.startsWith('convencoes adotadas'));
  if (s) return [...arr.slice(0, s.ini + 1), ...corpo, ...arr.slice(s.fim + 1)].join(ix.eol);
  // Secao ainda nao existe: insere antes de "## Plataformas" (ou no fim).
  const bloco = ['## Convenções adotadas (2.7.0)', ...corpo];
  const plat = ix.secoes.find((x) => x.norm.startsWith('plataformas'));
  if (plat) return [...arr.slice(0, plat.ini), ...bloco, ...arr.slice(plat.ini)].join(ix.eol);
  return [...arr, '', ...bloco].join(ix.eol);
}

// ---------------------------------------------------------------------------
// Frontmatter YAML raso (o suficiente p/ skills, agentes e convencoes)
// ---------------------------------------------------------------------------
function frontmatter(texto) {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  let chaveLista = null;
  for (const linha of m[1].split(/\r?\n/)) {
    const item = linha.match(/^\s+-\s+(.*)$/);
    if (item && chaveLista) { out[chaveLista].push(limpaEscalar(item[1])); continue; }
    const kv = linha.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    if (v === '') { chaveLista = k; out[k] = []; continue; }
    chaveLista = null;
    if (/^\[.*\]$/.test(v)) out[k] = v.slice(1, -1).split(',').map((x) => limpaEscalar(x)).filter(Boolean);
    else out[k] = limpaEscalar(v);
  }
  return out;
}
const limpaEscalar = (s) => (s || '').trim().replace(/^["'](.*)["']$/, '$1').trim();

// ---------------------------------------------------------------------------
// Coletores do ecossistema
// ---------------------------------------------------------------------------
const listarDir = (p) => { try { return readdirSync(p, { withFileTypes: true }); } catch { return []; } };
const mtime = (p) => { try { return statSync(p).mtime.toISOString().slice(0, 10); } catch { return ''; } };

function coletarSkills() {
  const base = join(CLAUDE_DIR, 'skills');
  return listarDir(base).filter((d) => d.isDirectory()).map((d) => {
    const arq = join(base, d.name, 'SKILL.md');
    const txt = ler(arq);
    const fm = frontmatter(txt);
    return {
      slug: d.name,
      nome: fm.name || d.name,
      descricao: fm.description || '',
      origem: NUCLEO.skills.includes(d.name) ? 'nucleo' : 'local',
      crlf: txt.includes('\r\n'),
      bytes: txt.length,
      mtime: mtime(arq),
      ok: !!txt && !!fm.name,
    };
  }).sort((a, b) => a.slug.localeCompare(b.slug));
}

// Replica agent_visibility() do harness-doctor.sh (2.3.0). Só a COMBINACAO
// CRLF + ': ' dentro do valor NAO-QUOTADO da description mata o agente: LF com
// ': ' funciona (atlas), CRLF sem ': ' funciona (sherlock). Description entre
// aspas nunca dispara. -> 'ok' | 'risco' (CRLF sem gatilho) | 'invisivel'.
function visibilidadeAgente(txt) {
  if (!txt.includes('\r')) return 'ok';
  const m = txt.match(/^description:[ \t]*(.*)$/m);   // '.' nao casa '\r': valor ja vem limpo
  const desc = m ? m[1] : '';
  if (/^["']/.test(desc)) return 'risco';
  return desc.includes(': ') ? 'invisivel' : 'risco';
}

// 3.4.24 (item 13) — gates da /prd cujo ciclo 1 roda em Sonnet no preset `equilibrado` (Opus so no
// c2, uma vez, se o c1 reabriu o desenho). Espelha a MATRIZ do harness-config.html e a tabela do Perfil.
const GATES_C1 = ['beholder', 'michelangelo'];
export const PRESET_MATRIX = {
  beholder:     { economico: 'sonnet', equilibrado: 'sonnet c1 → opus 1x no c2 se o c1 reabrir o desenho', maximo: 'opus c1' },
  michelangelo: { economico: 'sonnet', equilibrado: 'sonnet c1 → opus 1x no c2 se o c1 reabrir o desenho', maximo: 'opus c1' },
};
// 3.4.25 (melhoria 3) — ESFORCO DA SESSAO por preset. O Claude Code nao aceita esforco por chamada
// (o Agent tool so leva `model`); o subagente HERDA o esforco da sessao salvo `effort:` no frontmatter
// do agente (arquivo que viaja com o mestre). Logo o dial e da sessao: o preset resolve, o Perfil pode
// sobrescrever ("Esforco da sessao"), a skill confere/avisa e quem aplica e o dev (/effort,
// effortLevel no settings.local.json ou CLAUDE_CODE_EFFORT_LEVEL). A palavra-gatilho de thinking no
// prompt nao muda o esforco enviado a API — o knob "Thinking dos julgadores" saiu.
export const ESFORCO_PRESET = { economico: 'medium', equilibrado: 'high', maximo: 'xhigh' };
export const ESFORCO_NIVEIS = ['low', 'medium', 'high', 'xhigh', 'max'];
// Valores aceitos no override fino "Modelo do <agente>": fable (Fable 5.1, custo 2x Opus) e opt-in
// explicito — nunca vem de preset.
export const MODELOS_OVERRIDE = ['preset', 'sonnet', 'opus', 'fable'];
export function resolverEsforco(preset, override) {
  const ov = String(override || 'preset').trim().toLowerCase();
  const doPreset = ESFORCO_PRESET[preset] || ESFORCO_PRESET.equilibrado;
  const valido = ESFORCO_NIVEIS.includes(ov);
  return { preset: doPreset, override: ov, efetivo: valido ? ov : doPreset, origem: valido ? 'override' : 'preset', invalido: ov !== 'preset' && !valido ? ov : '' };
}

function coletarAgentes(perfilTxt, presetAtivo) {
  const base = join(CLAUDE_DIR, 'agents');
  const overrides = {
    beholder: 'm_beholder', michelangelo: 'm_michel', 'tony-stark': 'm_tony',
    sherlock: 'm_sherlock', atlas: 'm_atlas', dedalo: 'm_dedalo',
  };
  const ix = indexarPerfil(perfilTxt);
  const valorDe = (id) => {
    const map = PERFIL_MAP[id]; if (!map) return '';
    const c = acharCampo(ix, map[0], map[1]); return c ? c.valor : '';
  };
  const doPreset = presetAtivo === 'maximo' ? 'opus' : 'sonnet';
  return listarDir(base).filter((f) => f.isFile() && f.name.endsWith('.md')).map((f) => {
    const arq = join(base, f.name);
    const txt = ler(arq);
    const fm = frontmatter(txt);
    const slug = f.name.replace(/\.md$/, '');
    const ov = overrides[slug] ? valorDe(overrides[slug]) : '';
    let modelo = 'n/a';
    if (slug === 'hefesto' || slug === 'ariadne') modelo = 'sonnet (sempre)';
    else if (overrides[slug]) modelo = (ov && ov !== 'preset') ? ov : `${doPreset} (preset)`;
    // 3.4.24 (item 13): gates da /prd no equilibrado — c1 Sonnet; Opus uma vez no c2 so se o c1
    // reabriu o desenho (>= 3 vermelhos estruturais). Override explicito no Perfil vence (ramo acima).
    if (GATES_C1.includes(slug) && presetAtivo === 'equilibrado' && (!ov || ov === 'preset')) {
      modelo = 'sonnet (preset; c1 — opus 1x no c2 so se o c1 reabrir o desenho)';
    }
    return {
      slug,
      nome: fm.name || slug,
      descricao: fm.description || '',
      origem: NUCLEO.agents.includes(slug) ? 'nucleo' : 'local',
      crlf: txt.includes('\r\n'),
      visibilidade: visibilidadeAgente(txt),   // ok | risco | invisivel
      modelo,
      override: overrides[slug] || null,
      overrideValor: ov || 'preset',
      mtime: mtime(arq),
    };
  }).sort((a, b) => a.slug.localeCompare(b.slug));
}

function coletarHooks() {
  const base = join(CLAUDE_DIR, 'hooks');
  const arquivos = listarDir(base).filter((f) => f.isFile()).map((f) => f.name);
  let settings = {};
  try { settings = JSON.parse(ler(join(CLAUDE_DIR, 'settings.json')) || '{}'); } catch { settings = {}; }
  const wiring = {};                       // arquivo do hook -> [eventos]
  const eventos = settings.hooks || {};
  for (const [evento, grupos] of Object.entries(eventos)) {
    for (const g of (Array.isArray(grupos) ? grupos : [])) {
      for (const h of (g.hooks || [])) {
        const cmd = h.command || '';
        const m = cmd.match(/hooks\/([\w.-]+)/);
        if (!m) continue;
        (wiring[m[1]] ||= []).push(evento + (g.matcher ? `[${g.matcher}]` : ''));
      }
    }
  }
  // 3.4.2 — HELPERS: scripts que moram em hooks/ mas sao CHAMADOS POR SKILL (broker, duelo,
  // worktree, packet, frescor) ou pelo /harness-report — nao tem evento para "wirar".
  // Marca-los como "sem wiring" era falso alarme (aconteceu no dra-mariana-duarte, 23/08).
  const HELPERS = new Set(['harness-delegate.sh', 'harness-duelo.sh', 'harness-worktree.sh',
    'task-packet.sh', 'perfil-frescor.sh', 'harness-metrics.sh', 'harness-metrics.mjs',
    'harness-dashboard.mjs', 'codex-review.sh', 'external-review.sh']);
  return arquivos.filter((n) => !n.startsWith('_')).map((n) => ({
    arquivo: n,
    origem: NUCLEO.hooks.includes(n) ? 'nucleo' : 'local',
    eventos: wiring[n] || [],
    wired: !!wiring[n],
    helper: HELPERS.has(n) && !wiring[n],
    mtime: mtime(join(base, n)),
  })).sort((a, b) => a.arquivo.localeCompare(b.arquivo));
}

function coletarConvencoes(adocao) {
  const base = join(CLAUDE_DIR, 'convencoes');
  return listarDir(base)
    .filter((f) => f.isFile() && f.name.endsWith('.md') && !f.name.startsWith('_') && f.name !== 'INDEX.md')
    .map((f) => {
      const arq = join(base, f.name);
      const txt = ler(arq);
      const fm = frontmatter(txt);
      const slug = fm.slug || f.name.replace(/\.md$/, '');
      const secoes = [...txt.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
      // Passos = so os da secao "Passo a passo" (as armadilhas tambem sao lista
      // numerada; contar o documento inteiro inflaria o numero no card).
      const secPasso = txt.split(/^##\s+/m).find((b) => /^passo a passo/i.test(b)) || '';
      const passos = (secPasso.match(/^\s*\d+\.\s+/gm) || []).length;
      const aceite = (txt.match(/^\s*-\s+\[[ x]\]/gm) || []).length;
      return {
        slug,
        arquivo: `.claude/convencoes/${f.name}`,
        nome: fm.nome || slug,
        categoria: fm.categoria || 'geral',
        resumo: fm.resumo || '',
        maturidade: fm.maturidade || 'experimental',
        aplica_se: fm.aplica_se || [],
        depende_de: fm.depende_de || [],
        desde: fm.desde || '',
        secoes, passos, aceite,
        estado: (adocao[slug] && adocao[slug].estado) || 'nao-adotada',
        obs: (adocao[slug] && adocao[slug].obs) || '',
        mtime: mtime(arq),
      };
    }).sort((a, b) => a.slug.localeCompare(b.slug));
}

function coletarTelemetria() {
  const arq = join(ROOT, 'prds', '_metrics', 'harness-runs.jsonl');
  if (!existe(arq)) return null;
  const linhas = ler(arq).split('\n').filter(Boolean).slice(-60);
  const runs = [];
  for (const l of linhas) { try { runs.push(JSON.parse(l)); } catch { /* linha corrompida */ } }
  if (!runs.length) return null;
  const mediana = (xs) => {
    const a = xs.filter((n) => typeof n === 'number' && n > 0).sort((x, y) => x - y);
    return a.length ? a[Math.floor(a.length / 2)] : 0;
  };
  const porTipo = {};
  for (const r of runs) {
    const t = r.kind || r.tipo || r.skill || 'outro';
    (porTipo[t] ||= []).push(r);
  }
  return {
    total: runs.length,
    tipos: Object.entries(porTipo).map(([tipo, rs]) => ({
      tipo, n: rs.length,
      minutos: Math.round(mediana(rs.map((r) => r.active_min ?? r.duration_min ?? 0))),
      tokens: mediana(rs.map((r) => (r.tokens && r.tokens.total) || r.total_tokens || 0)),
      ciclos: mediana(rs.map((r) => r.cycles ?? r.ciclos ?? 0)),
    })).sort((a, b) => b.n - a.n).slice(0, 6),
  };
}

// ---------------------------------------------------------------------------
// TRABALHO: debitos tecnicos e PRDs (2.8.0)
// ---------------------------------------------------------------------------
// Os formatos variam entre projetos e foram levantados, nao presumidos:
//   - a pasta de DT e 'prds/debito_tecnico/' na maioria e 'prds/dt/' no
//     sagittarius/gsa. O PERFIL ja declara qual e — usamos ele, com fallback.
//   - o INDEX de DT e OPCIONAL (o sagittarius nao tem). A FONTE DE VERDADE do
//     status e o proprio arquivo DT-NNN.md; o indice e complemento (traz a
//     coluna 'Area') e alvo de RECONCILIACAO quando diverge.
//   - as colunas do INDEX variam (Area x Prioridade) => parse pelo CABECALHO.
//   - a PRD nao carrega status no arquivo — so o prds/INDEX.md tem.

// Split de linha de tabela markdown que respeita crases: ha linhas de INDEX
// reais com '|' dentro de `codigo`, e um split('|') ingenuo as parte errado.
function celulasTabela(linha) {
  const out = [];
  let atual = '', emCrase = false;
  for (const c of linha) {
    if (c === '`') emCrase = !emCrase;
    if (c === '|' && !emCrase) { out.push(atual); atual = ''; continue; }
    atual += c;
  }
  out.push(atual);
  if (out.length && out[0].trim() === '') out.shift();
  if (out.length && out[out.length - 1].trim() === '') out.pop();
  return out.map((s) => s.trim());
}

// 'Resolvido (PRD-008)' -> 'Resolvido' · 'Pendente — adiado pela...' -> 'Pendente'
function normalizarStatus(v) {
  const s = norm(v).split('(')[0].split('—')[0].split(' -- ')[0].trim();
  if (s.startsWith('pendente')) return 'Pendente';
  if (s.startsWith('em andamento')) return 'Em andamento';
  if (s.startsWith('em execucao')) return 'Em execução';
  if (s.startsWith('resolvido')) return 'Resolvido';
  if (s.startsWith('concluid')) return 'Concluída';
  if (s.startsWith('descartado') || s.startsWith('cancelad')) return 'Descartado';
  if (s.startsWith('rascunho')) return 'Rascunho';
  return (v || '').split(/[(—]/)[0].trim();
}
function normalizarPrioridade(v) {
  const s = norm(v);
  if (s.startsWith('alta')) return 'Alta';
  if (s.startsWith('media')) return 'Média';
  if (s.startsWith('baixa')) return 'Baixa';
  return (v || '').trim();
}
const ORDEM_PRIORIDADE = { Alta: 0, 'Média': 1, Baixa: 2, '': 3 };

// Le uma tabela de INDEX pelo CABECALHO. Retorna as linhas cujo 1o campo casa
// <prefixo>-NNN — assim outras tabelas do mesmo arquivo (legenda, lotes) sao
// ignoradas sem precisar delimitar secao.
function lerIndex(caminho, prefixo) {
  const txt = ler(caminho);
  if (!txt) return null;
  const linhas = txt.split(/\r?\n/);
  let cols = null;
  for (const l of linhas) {
    if (!/^\s*\|/.test(l)) continue;
    const cs = celulasTabela(l).map((c) => norm(c));
    if (cs.includes('id') && cs.includes('status')) { cols = cs; break; }
    // Formato alternativo do prds/INDEX.md: 1a coluna chamada 'prd'.
    if (cs.includes('prd') && cs.includes('status')) { cols = cs.map((c) => (c === 'prd' ? 'id' : c)); break; }
  }
  if (!cols) return null;
  const re = new RegExp(`^\\[?(${prefixo}-\\d+)`, 'i');
  const itens = [];
  // Os INDEX do template trazem a linha-exemplo dentro de um comentario HTML
  // ('<!-- | DT-001 | <titulo> | ... -->'). Sem pular o bloco, todo projeto
  // recem-portado ganharia um DT fantasma.
  let emComentario = false;
  linhas.forEach((l, idx) => {
    if (emComentario) { if (l.includes('-->')) emComentario = false; return; }
    if (l.includes('<!--')) { if (!l.includes('-->')) emComentario = true; return; }
    if (!/^\s*\|/.test(l)) return;
    const cs = celulasTabela(l);
    const m = (cs[0] || '').match(re);
    if (!m) return;
    const campo = (nome) => {
      const i = cols.indexOf(nome);
      return i >= 0 && cs[i] !== undefined ? cs[i].replace(/^`|`$/g, '') : '';
    };
    itens.push({
      id: m[1].toUpperCase(), linha: idx, celulas: cs,
      status: campo('status'), titulo: campo('titulo') || campo('titulo curto'),
      area: campo('area'), prioridade: campo('prioridade'), origem: campo('origem'),
    });
  });
  return { cols, itens, caminho };
}

// Resolve as pastas de PRD e DT: Perfil primeiro (ele JA declara), fallback nos
// dois nomes conhecidos. Devolve caminhos relativos a raiz.
function descobrirCaminhos(raiz, perfilTxt) {
  const ix = perfilTxt ? indexarPerfil(perfilTxt) : null;
  const doPerfil = (label) => {
    if (!ix) return '';
    const c = acharCampo(ix, 'Estrutura de diretorios', label);
    if (!c || !c.valor) return '';
    // O valor pode vir anotado: 'prds/dt/ (1 arquivo por DT, sem INDEX)'
    return c.valor.split(/[ (]/)[0].replace(/\/+$/, '');
  };
  let prds = doPerfil('PRDs') || 'prds';
  let dts = doPerfil('Debitos tecnicos');
  if (!dts || !existe(join(raiz, dts))) {
    dts = ['prds/debito_tecnico', 'prds/dt'].find((c) => existe(join(raiz, c))) || dts || 'prds/debito_tecnico';
  }
  if (!existe(join(raiz, prds))) prds = 'prds';
  return { prds, dts };
}

const RE_TITULO_DT = /^#\s*(DT-\d+)\s*[:—-]\s*(.*)$/m;
function camposCabecalho(txt) {
  // So o cabecalho: os pares '- **Campo:** valor' antes da 1a secao '## '.
  const corte = txt.search(/^##\s/m);
  const cabecalho = corte > 0 ? txt.slice(0, corte) : txt;
  const out = {};
  for (const m of cabecalho.matchAll(/^[-*]\s*\*\*(.+?):?\*\*:?\s*(.*)$/gm)) {
    out[norm(m[1])] = m[2].trim();
  }
  return out;
}

function coletarDTs(raiz, dtDir) {
  const base = join(raiz, dtDir);
  if (!existe(base)) return { dir: dtDir, existe: false, itens: [], index: null, divergencias: [] };
  const index = lerIndex(join(base, 'INDEX.md'), 'DT');
  const porId = {};
  (index ? index.itens : []).forEach((i) => { porId[i.id] = i; });

  const itens = [];
  for (const f of listarDir(base)) {
    if (!f.isFile() || !/^DT-\d+.*\.md$/i.test(f.name)) continue;
    const arq = join(base, f.name);
    const txt = lerInicio(arq, 4096);
    const t = txt.match(RE_TITULO_DT);
    const id = (t ? t[1] : f.name.match(/^(DT-\d+)/i)?.[1] || '').toUpperCase();
    if (!id) continue;
    const c = camposCabecalho(txt);
    const noIndex = porId[id] || null;
    const status = normalizarStatus(c.status || '');
    itens.push({
      id,
      num: Number(id.split('-')[1]) || 0,
      titulo: (t ? t[2] : '').trim() || (noIndex ? noIndex.titulo : ''),
      arquivo: `${dtDir}/${f.name}`.replace(/\\/g, '/'),
      status,
      statusBruto: c.status || '',
      prioridade: normalizarPrioridade(c.prioridade || (noIndex ? noIndex.prioridade : '')),
      area: noIndex ? noIndex.area : '',
      origem: c.origem || (noIndex ? noIndex.origem : ''),
      data: (c['data de registro'] || c.data || '').trim(),
      esforco: (c['estimativa de esforco'] || c.esforco || '').trim(),
      semStatus: !c.status,
      // Divergencia so faz sentido quando HA indice e ele lista este DT.
      statusIndex: noIndex ? normalizarStatus(noIndex.status) : null,
    });
  }
  // DT que existe SO na linha do indice, sem arquivo proprio: e um registro
  // legitimo (12 casos reais no dra-mariana-duarte, alguns Pendentes) — NAO e
  // erro. Entra na lista marcado, senao a tela esconderia trabalho de verdade.
  const idsArquivo = new Set(itens.map((i) => i.id));
  for (const i of (index ? index.itens : [])) {
    if (idsArquivo.has(i.id)) continue;
    itens.push({
      id: i.id,
      num: Number(i.id.split('-')[1]) || 0,
      titulo: i.titulo,
      arquivo: '',
      status: normalizarStatus(i.status),
      statusBruto: i.status,
      prioridade: normalizarPrioridade(i.prioridade),
      area: i.area,
      origem: i.origem,
      data: '',
      esforco: '',
      semStatus: !i.status,
      statusIndex: normalizarStatus(i.status),
      soIndex: true,
    });
  }
  itens.sort((a, b) => b.num - a.num);
  const divergencias = itens
    .filter((i) => !i.soIndex && i.statusIndex !== null && i.statusIndex !== i.status)
    .map((i) => ({ id: i.id, arquivo: i.status, index: i.statusIndex }));
  const soIndex = itens.filter((i) => i.soIndex).map((i) => i.id);
  return { dir: dtDir, existe: true, itens, index: index ? { cols: index.cols, n: index.itens.length } : null, divergencias, soIndex };
}

function coletarPRDs(raiz, prdsDir) {
  const base = join(raiz, prdsDir);
  if (!existe(base)) return { dir: prdsDir, existe: false, itens: [] };
  const index = lerIndex(join(base, 'INDEX.md'), 'PRD');
  const porId = {};
  (index ? index.itens : []).forEach((i) => { porId[i.id] = i; });

  // Ultima execucao por PRD, pela telemetria (label 'PRD-109-exec').
  const ultima = {};
  const jsonl = join(base, '_metrics', 'harness-runs.jsonl');
  if (existe(jsonl)) {
    for (const l of ler(jsonl).split('\n')) {
      if (!l.trim()) continue;
      try {
        const r = JSON.parse(l);
        const m = String(r.label || '').match(/^(PRD-\d+)/i);
        if (!m) continue;
        const id = m[1].toUpperCase();
        const ts = Number(r.ts_end || r.ts_start || 0);
        if (!ultima[id] || ts > ultima[id].ts) ultima[id] = { ts, label: r.label };
      } catch { /* linha corrompida */ }
    }
  }

  const itens = [];
  for (const d of listarDir(base)) {
    if (!d.isDirectory()) continue;
    const m = d.name.match(/^(PRD-\d+)/i);
    if (!m) continue;
    const id = m[1].toUpperCase();
    const pasta = join(base, d.name);
    // Tasks: '| **Status** | Concluida |' dentro de tasks/TASK-*.md
    let total = 0, feitas = 0;
    const tdir = join(pasta, 'tasks');
    for (const tf of listarDir(tdir)) {
      if (!tf.isFile() || !/^TASK-.*\.md$/i.test(tf.name)) continue;
      total++;
      const st = lerInicio(join(tdir, tf.name), 3072).match(/\|\s*\*\*Status\*\*\s*\|\s*([^|]+)\|/i);
      if (st && /conclu/i.test(norm(st[1]))) feitas++;
    }
    // Data do Resumo Executivo da PRD de produto.
    let data = '';
    for (const pf of listarDir(pasta)) {
      if (!pf.isFile() || !/^PRD-\d+.*\.md$/i.test(pf.name)) continue;
      const md = lerInicio(join(pasta, pf.name), 4096);
      const dm = md.match(/\|\s*\*\*Data\*\*\s*\|\s*([^|]+)\|/i);
      if (dm) { data = dm[1].trim(); break; }
    }
    const noIndex = porId[id] || null;
    itens.push({
      id,
      num: Number(id.split('-')[1]) || 0,
      pasta: `${prdsDir}/${d.name}`.replace(/\\/g, '/'),
      titulo: noIndex ? noIndex.titulo : d.name.replace(/^PRD-\d+-/, '').replace(/-/g, ' '),
      status: noIndex ? normalizarStatus(noIndex.status) : '',
      semIndex: !noIndex,
      tasks: { total, feitas },
      data,
      ultimaExecucao: ultima[id] ? ultima[id].label : '',
    });
  }
  itens.sort((a, b) => b.num - a.num);
  return { dir: prdsDir, existe: true, itens, temIndex: !!index };
}

// Heuristica do "proximo passo" — explicita e conservadora: nunca inventa
// trabalho, so ordena o que ja esta registrado.
function proximoPasso(dts, prds) {
  const cards = [];
  const emExec = prds.itens.filter((p) => p.status === 'Em execução');
  for (const p of emExec) {
    const resta = p.tasks.total - p.tasks.feitas;
    cards.push({
      tipo: 'prd-exec', titulo: `${p.id} em execução`,
      detalhe: p.tasks.total ? `${p.tasks.feitas}/${p.tasks.total} tasks concluídas${resta ? ` — faltam ${resta}` : ''}` : 'sem tasks registradas',
      comando: `/prd-exec ${p.id}`, alvo: p.id,
    });
  }
  for (const p of prds.itens.filter((x) => x.status === 'Rascunho')) {
    cards.push({
      tipo: 'prd-rascunho', titulo: `${p.id} pronta para executar`,
      detalhe: p.titulo.slice(0, 110), comando: `/prd-exec ${p.id}`, alvo: p.id,
    });
  }
  const pendentes = dts.itens.filter((d) => d.status === 'Pendente');
  // Lote: DTs pequenos pendentes agrupados por area (ou origem, sem area).
  const grupos = {};
  for (const d of pendentes) {
    if (!/pequen/i.test(norm(d.esforco))) continue;
    const chave = d.area || d.origem.split(/[(—]/)[0].trim() || 'sem área';
    (grupos[chave] ||= []).push(d);
  }
  const TETO_LOTE = 6;   // um lote da /dt-exec so e coeso ate ~6 itens
  for (const [chave, g] of Object.entries(grupos).sort((a, b) => b[1].length - a[1].length)) {
    if (g.length < 2) continue;
    const escolhidos = g.slice(0, TETO_LOTE);
    cards.push({
      tipo: 'dt-lote',
      titulo: `Lote de DTs pequenos — ${chave}`,
      detalhe: g.length > TETO_LOTE
        ? `${escolhidos.map((d) => d.id).join(', ')} — ${escolhidos.length} dos ${g.length} candidatos (o resto fica p/ o próximo lote)`
        : escolhidos.map((d) => d.id).join(', '),
      comando: `/dt-exec ${escolhidos.map((d) => d.id).join(' ')}`, alvo: chave,
    });
  }
  const altas = pendentes.filter((d) => d.prioridade === 'Alta')
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  for (const d of altas.slice(0, 5)) {
    cards.push({
      tipo: 'dt-alta', titulo: `${d.id} — prioridade Alta`,
      detalhe: d.titulo.slice(0, 110), comando: `/dt-exec ${d.id}`, alvo: d.id,
    });
  }
  return cards;
}

function coletarTrabalho(raiz) {
  const perfilTxt = ler(join(raiz, '.claude', 'PERFIL-PROJETO.md'));
  const caminhos = descobrirCaminhos(raiz, perfilTxt);
  const dts = coletarDTs(raiz, caminhos.dts);
  const prds = coletarPRDs(raiz, caminhos.prds);
  const conta = (arr, s) => arr.filter((x) => x.status === s).length;
  return {
    ok: true,
    caminhos,
    dts,
    prds,
    proximo: proximoPasso(dts, prds),
    resumo: {
      dtPendentes: conta(dts.itens, 'Pendente'),
      dtAndamento: conta(dts.itens, 'Em andamento'),
      dtTotal: dts.itens.length,
      dtSemStatus: dts.itens.filter((d) => d.semStatus).length,
      prdAbertas: prds.itens.filter((p) => p.status === 'Em execução' || p.status === 'Rascunho').length,
      prdTotal: prds.itens.length,
      divergencias: dts.divergencias.length,
    },
  };
}

// --- Worktrees + locks + duelos (3.4.0, read-only) ---------------------------
function coletarWorktrees(raiz) {
  const out = { ok: true, worktrees: [], locks: [], duelos: null, atual: null };
  try {
    const r = execFileSync('bash', [join(raiz, '.claude', 'hooks', 'harness-worktree.sh'), 'lista'], { cwd: raiz, encoding: 'utf8', timeout: 15000 });
    for (const l of r.split('\n')) { const c = l.split('|'); if (c[0] === 'WT') out.worktrees.push({ dir: c[1], branch: (c[2] || '').replace('refs/heads/', '') }); if (c[0] === 'LOCK') out.locks.push({ id: c[1], por: c[2], quando: c[3], quem: c[4] }); }
    const i = execFileSync('bash', [join(raiz, '.claude', 'hooks', 'harness-worktree.sh'), 'info'], { cwd: raiz, encoding: 'utf8', timeout: 15000 });
    out.atual = Object.fromEntries(i.split('\n').filter(Boolean).map(l => { const c = l.split('|'); return [c[1], c.slice(2).join('|')]; }));
  } catch (e) { out.erro = String(e.message || e).slice(0, 200); }
  try {
    const L = ler(join(raiz, 'prds', '_metrics', 'harness-duelos.jsonl')).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const d = new Map(); for (const e of L) if (e.ev === 'duelo') d.set(e.id, { ...e });
    for (const e of L) { const x = d.get(e.id); if (!x) continue; if (e.ev === 'veredito') Object.assign(x, { vencedor: e.vencedor, nota_a: e.nota_a, nota_b: e.nota_b }); if (e.ev === 'aplicado') x.aplicado = e.resultado; }
    const st = {};
    for (const x of d.values()) for (const lado of ['A', 'B']) { const m = x['modelo_' + lado.toLowerCase()]; if (!m) continue; st[m] ||= { modelo: m, n: 0, v: 0, rep: 0, na: 0, custo: 0 }; const o = st[m]; o.n++; if (x.vencedor === lado) o.v++; if (x.vencedor === 'nenhum') o.rep++; if (x['aplica_' + lado.toLowerCase()] === 'nao') o.na++; o.custo += Number(x['custo_' + lado.toLowerCase()]) || 0; }
    out.duelos = { total: d.size, porModelo: Object.values(st).sort((a, b) => (b.v / (b.n || 1)) - (a.v / (a.n || 1))) };
  } catch {}
  return out;
}

// --- Sweep: pre-classificacao (3.3.0, read-only) ---------------------------
const RE_IDEIA = /seria (bom|interessante|util)|futuro modulo|permitir que|adicionar (opcao|suporte)|melhoria de ux|melhorias futuras|desejo|feature nova|nova funcionalidade|sugest/i;
const RE_PRD = /migration|backfill|drop |rename |integra[cç][aã]o|waha|whatsapp|calendar|pagamento|pix|s3|auth|sess[aã]o|permiss|contrato de api|payload|redesenh|refator|m[oó]dulo novo|grande/i;
// "agente"/"skill" NAO entram: sao termos de PRODUTO em varios projetos (ex.: agentes de IA do Taurus).
const RE_HARNESS = /\bharness\b|subagente|hefesto|dedalo|sherlock|michelangelo|beholder|themis|prd-exec|dt-exec|dt-sweep|classificador do auto mode/i;
// --- Ideias (25/08 — skill /ideia + aba Ideias) -----------------------------
// Ciclo: semente -> refinada -> pronta-para-prd -> virou PRD-NNN | descartada.
// Indice: prds/backlog/IDEIAS.md (linhas legadas de 1 linha continuam valendo,
// com estado proprio); arquivo dedicado: prds/ideias/IDEIA-NNN-slug.md.
const IDEIAS_IDX = ['prds', 'backlog', 'IDEIAS.md'];
const IDEIAS_DIR = ['prds', 'ideias'];
const ESTADOS_IDEIA = ['semente', 'refinada', 'pronta-para-prd', 'descartada'];
function lerIdeias(raiz) {
  const itens = [];
  const dirAbs = join(raiz, ...IDEIAS_DIR);
  for (const f of listarDir(dirAbs)) {
    const m = f.name.match(/^IDEIA-(\d+)-(.+)\.md$/i); if (!m) continue;
    const txt = ler(join(dirAbs, f.name));
    const titulo = ((txt.match(/^# IDEIA-\d+:\s*(.+)$/m) || [])[1] || m[2].replace(/-/g, ' ')).trim();
    const estado = ((txt.match(/\*\*Estado:\*\*\s*([^\n]+)/) || [])[1] || 'semente').trim();
    const data = ((txt.match(/\*\*Data:\*\*\s*([0-9-]{10})/) || [])[1] || '');
    const bruto = (txt.split(/##\s*Despejo original/i)[1] || '').replace(/##[\s\S]*$/, '').trim();
    itens.push({ n: Number(m[1]), id: 'IDEIA-' + m[1].padStart(3, '0'), titulo: titulo.slice(0, 160),
      estado, data, resumo: bruto.split('\n').slice(0, 3).join(' ').slice(0, 260),
      arquivo: ['', ...IDEIAS_DIR, f.name].join('/').slice(1) });
  }
  const idx = ler(join(raiz, ...IDEIAS_IDX));
  if (idx) for (const l of idx.split('\n')) {
    const c = l.split('|').map((s) => s.trim());
    if (c.length < 7 || !c[2] || c[2].startsWith('_') || c[2] === 'Ideia (1 linha)') continue;
    if (/^IDEIA-\d+/i.test(c[1])) continue;                       // ja veio do arquivo dedicado
    if (c[1] === '—' || c[1] === '-' || c[1] === '') {
      itens.push({ n: null, id: null, titulo: c[2].replace(/\*\*/g, '').slice(0, 200),
        estado: (c[6] || 'Aberta').toLowerCase() === 'aberta' ? 'semente' : c[6], data: c[5] || '',
        resumo: '', arquivo: null, legado: true, area: c[3] || '' });
    }
  }
  itens.sort((a, b) => (b.n || 0) - (a.n || 0));
  return { itens };
}
function proximoNumIdeia(raiz) {
  let max = 0;
  for (const f of listarDir(join(raiz, ...IDEIAS_DIR))) {
    const m = f.name.match(/^IDEIA-(\d+)-/i); if (m) max = Math.max(max, Number(m[1]));
  }
  const idx = ler(join(raiz, ...IDEIAS_IDX));
  for (const m of idx.matchAll(/IDEIA-(\d+)/g)) max = Math.max(max, Number(m[1]));
  return max + 1;
}
function capturarIdeia(raiz, { texto, titulo, origem }) {
  const bruto = String(texto || '').trim();
  if (!bruto) return { ok: false, avisos: ['texto vazio'] };
  const tit = String(titulo || bruto.split('\n')[0]).trim().slice(0, 90);
  const n = proximoNumIdeia(raiz);
  const num = String(n).padStart(3, '0');
  const slug = tit.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ideia';
  const hoje = new Date().toISOString().slice(0, 10);
  const rel = [...IDEIAS_DIR, `IDEIA-${num}-${slug}.md`];
  const abs = join(raiz, ...rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `# IDEIA-${num}: ${tit}\n\n- **Estado:** semente\n- **Data:** ${hoje} · **Atualizada:** ${hoje}\n- **Origem:** ${String(origem || 'tela do harness').slice(0, 120)}\n\n## Despejo original\n\n${bruto}\n\n## Refino\n\n_(preenchido pelo \`/ideia refinar ${num}\` — problema e quem sofre, valor e metrica, escopo minimo vs sonho, riscos, provocacoes/inovacoes, decisoes em aberto)_\n`, 'utf8');
  // linha no indice (apos o separador da tabela; remove o placeholder se existir)
  const idxAbs = join(raiz, ...IDEIAS_IDX);
  let itxt = ler(idxAbs);
  if (itxt) {
    itxt = itxt.split('\n').filter((l) => !l.includes('_Nenhuma ideia registrada ainda_')).join('\n');
    const linha = `| IDEIA-${num} | ${tit.replace(/\|/g, '/')} | — | ${String(origem || 'tela').replace(/\|/g, '/').slice(0, 60)} | ${hoje} | Semente |`;
    const linhas = itxt.split('\n');
    const sep = linhas.findIndex((l) => /^\|-{3,}|^\|---\|/.test(l.replace(/\s/g, '')));
    if (sep >= 0) linhas.splice(sep + 1, 0, linha); else linhas.push(linha);
    writeFileSync(idxAbs, linhas.join('\n'), 'utf8');
  }
  return { ok: true, id: `IDEIA-${num}`, n, arquivo: rel.join('/') };
}
function mudarIdeia(raiz, { id, estado, motivo }) {
  const m = String(id || '').match(/IDEIA-(\d+)/i);
  if (!m) return { ok: false, avisos: [`id invalido: ${id}`] };
  const alvoEstado = String(estado || '').toLowerCase();
  if (!ESTADOS_IDEIA.includes(alvoEstado) && !/^virou prd-\d+/i.test(alvoEstado))
    return { ok: false, avisos: [`estado invalido: ${estado}`] };
  const estadoTxt = alvoEstado === 'descartada' ? `descartada — ${String(motivo || 'sem motivo').slice(0, 120)}` : alvoEstado;
  const dirAbs = join(raiz, ...IDEIAS_DIR);
  const arq = listarDir(dirAbs).map((f) => f.name).find((nm) => new RegExp(`^IDEIA-0*${Number(m[1])}-`, 'i').test(nm));
  if (!arq) return { ok: false, avisos: [`arquivo da ${id} nao encontrado em prds/ideias/`] };
  const abs = join(dirAbs, arq);
  const ts = carimbo(); const hoje = new Date().toISOString().slice(0, 10);
  let txt = ler(abs);
  txt = txt.replace(/(\*\*Estado:\*\*\s*)[^\n]+/, `$1${estadoTxt}`)
           .replace(/(\*\*Atualizada:\*\*\s*)[0-9-]{10}/, `$1${hoje}`);
  backup(abs, [...IDEIAS_DIR, arq].join('/'), ts);
  writeFileSync(abs, txt, 'utf8');
  // celula de status no indice
  const idxAbs = join(raiz, ...IDEIAS_IDX);
  let itxt = ler(idxAbs);
  if (itxt) {
    const re = new RegExp(`^(\\| IDEIA-0*${Number(m[1])} \\|(?:[^|]*\\|){4})[^|]*\\|`, 'm');
    if (re.test(itxt)) { itxt = itxt.replace(re, `$1 ${estadoTxt.charAt(0).toUpperCase() + estadoTxt.slice(1)} |`); writeFileSync(idxAbs, itxt, 'utf8'); }
  }
  return { ok: true, id: `IDEIA-${String(Number(m[1])).padStart(3, '0')}`, estado: estadoTxt };
}

function preClassificarSweep(raiz, paralelo) {
  const perfilTxt = ler(join(raiz, '.claude', 'PERFIL-PROJETO.md'));
  const caminhos = descobrirCaminhos(raiz, perfilTxt);
  const dts = coletarDTs(raiz, caminhos.dts).itens.filter((d) => d.status === 'Pendente' || d.status === 'Em andamento');
  const hoje = Date.now();
  const idadeDias = (d) => { const m = String(d.data || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? Math.round((hoje - Date.parse(m[0])) / 86400000) : null; };
  const baldes = { descartar: [], ideia: [], lote: [], prd: [], decidir: [], harness: [] };
  for (const d of dts) {
    const txt = `${d.titulo} ${d.origem}`;
    const idade = idadeDias(d);
    let balde = 'lote', motivo = '';
    if (!d.arquivo) { balde = 'decidir'; motivo = 'so no indice, sem arquivo'; }
    else if (RE_HARNESS.test(txt) && !/api|endpoint|tela|tabela/i.test(txt)) { balde = 'harness'; motivo = 'problema do harness, nao do produto'; }
    else if (RE_IDEIA.test(txt) || /melhorias futuras|observa[cç][oõ]es/i.test(d.origem || '')) { balde = 'ideia'; motivo = 'desejo de produto (sem custo de nao fazer)'; }
    else if (RE_PRD.test(txt) || /grande/i.test(d.esforco || '')) { balde = 'prd'; motivo = 'migration/integracao/contrato/grande — ejecao da /dt-exec'; }
    else if (idade != null && idade > 90 && d.prioridade === 'Baixa') { balde = 'decidir'; motivo = `Baixa, sem toque ha ${idade} dias`; }
    else if (/pequeno/i.test(d.esforco || '') || (!d.esforco && d.prioridade !== 'Alta')) { balde = 'lote'; motivo = d.esforco ? 'esforco Pequeno' : 'esforco nao declarado (inferido pequeno)'; }
    else { balde = 'lote'; motivo = d.esforco || 'sem esforco'; }
    baldes[balde].push({ id: d.id, titulo: d.titulo, area: d.area || 'geral', prioridade: d.prioridade, esforco: d.esforco, idade, motivo });
  }
  // fila de lotes por area (ate 5 itens), distribuida em N sessoes — areas distintas por sessao
  const porArea = {};
  for (const it of baldes.lote) (porArea[it.area] ||= []).push(it);
  const lotes = [];
  for (const [area, itens] of Object.entries(porArea).sort((a, b) => b[1].length - a[1].length)) {
    for (let i = 0; i < itens.length; i += 5) lotes.push({ area, dts: itens.slice(i, i + 5).map((x) => x.id) });
  }
  // teto da /dt-exec --fila: 5 lotes por sessao. O que sobrar e "proxima rodada" (o --loop reemite).
  const sessoes = Array.from({ length: paralelo }, (_, i) => ({ nome: String.fromCharCode(65 + i), lotes: [] }));
  const sobra = [];
  lotes.forEach((l, i) => { const sx = sessoes[i % paralelo]; if (sx.lotes.length < 5) sx.lotes.push(l); else sobra.push(l); });
  const repo = raiz.replace(/\\/g, '/');
  for (const sx of sessoes) {
    const ids = sx.lotes.flatMap((l) => l.dts);
    sx.comando = ids.length ? `cd "${repo}" && claude "/dt-exec${sx.lotes.length > 1 ? ' --fila=' + sx.lotes.length : ''} ${ids.join(' ')}"` : '';
  }
  const prompt = `/dt-sweep --paralelo=${paralelo}` + (baldes.descartar.length + baldes.ideia.length + baldes.harness.length ? ' --aplicar' : '');
  return { ok: true, pendentes: dts.length, baldes, lotes, sessoes, sobra, prompt,
    resumo: Object.fromEntries(Object.entries(baldes).map(([k, v]) => [k, v.length])) };
}

// --- Escrita de DT (status/prioridade) ------------------------------------
// SEGURANCA: o cliente manda apenas o ID ('DT-042'), nunca um caminho. O
// arquivo e resolvido a partir do dtDir descoberto no Perfil — travessia de
// diretorio e impossivel por construcao, sem depender de allowlist.
const RE_ID_DT = /^DT-\d{1,6}$/;

function setCampoCabecalho(texto, campo, valor) {
  const eol = texto.includes('\r\n') ? '\r\n' : '\n';
  const linhas = texto.split(/\r?\n/);
  const alvo = norm(campo);
  const corte = linhas.findIndex((l) => /^##\s/.test(l));
  const limite = corte > 0 ? corte : linhas.length;
  for (let i = 0; i < limite; i++) {
    const m = linhas[i].match(/^([-*]\s*\*\*)(.+?)(:?\*\*:?\s*)(.*)$/);
    if (!m || norm(m[2]) !== alvo) continue;
    linhas[i] = m[1] + m[2] + m[3] + valor;
    return { texto: linhas.join(eol), achou: true };
  }
  return { texto, achou: false };
}

// Troca UMA celula de UMA linha de tabela, preservando as demais.
function setCelulaTabela(texto, linhaIdx, colIdx, valor) {
  const eol = texto.includes('\r\n') ? '\r\n' : '\n';
  const linhas = texto.split(/\r?\n/);
  if (linhaIdx < 0 || linhaIdx >= linhas.length) return { texto, achou: false };
  const cs = celulasTabela(linhas[linhaIdx]);
  if (colIdx < 0 || colIdx >= cs.length) return { texto, achou: false };
  cs[colIdx] = valor;
  linhas[linhaIdx] = `| ${cs.join(' | ')} |`;
  return { texto: linhas.join(eol), achou: true };
}

// Atualiza o DT no ARQUIVO e, se houver indice que o liste, na linha do INDEX —
// na mesma acao. E o passo que se esquece na mao e gera a dessincronia.
function gravarDT(raiz, { id, status, prioridade }) {
  const escritos = [], backups = [], avisos = [];
  if (!RE_ID_DT.test(String(id || '').toUpperCase())) return { ok: false, avisos: [`id invalido: ${id}`] };
  const ID = String(id).toUpperCase();
  const perfilTxt = ler(join(raiz, '.claude', 'PERFIL-PROJETO.md'));
  const { dts: dtDir } = descobrirCaminhos(raiz, perfilTxt);
  const base = join(raiz, dtDir);

  const arquivo = listarDir(base).map((f) => f.name)
    .find((n) => new RegExp(`^${ID}(?![0-9])`, 'i').test(n) && /\.md$/i.test(n));
  const ts = carimbo();

  // Sem arquivo o DT ainda pode ser legitimo: ha registros que existem SO na
  // linha do indice (12 casos reais no dra-mariana-duarte). Nesse caso o indice
  // e o unico alvo — nao e erro.
  if (arquivo) {
    const abs = join(base, arquivo);
    let txt = ler(abs);
    let mudou = false;
    if (status) {
      const r = setCampoCabecalho(txt, 'Status', status);
      if (r.achou) { txt = r.texto; mudou = true; } else avisos.push(`${ID}: sem linha "**Status:**" no cabecalho — nao alterado`);
    }
    if (prioridade) {
      const r = setCampoCabecalho(txt, 'Prioridade', prioridade);
      if (r.achou) { txt = r.texto; mudou = true; } else avisos.push(`${ID}: sem linha "**Prioridade:**" no cabecalho`);
    }
    if (mudou) {
      const rel = `${dtDir}/${arquivo}`.replace(/\\/g, '/');
      const b = backup(abs, rel, ts); if (b) backups.push(b);
      writeFileSync(abs, txt, 'utf8');
      escritos.push(rel);
    }
  }

  // Espelha no indice, quando existe e lista este DT.
  const idxAbs = join(base, 'INDEX.md');
  const idx = lerIndex(idxAbs, 'DT');
  if (idx) {
    const item = idx.itens.find((i) => i.id === ID);
    if (item) {
      let itxt = ler(idxAbs);
      let imudou = false;
      const trocar = (col, valor) => {
        const c = idx.cols.indexOf(col);
        if (c < 0 || !valor) return;
        const r = setCelulaTabela(itxt, item.linha, c, valor);
        if (r.achou) { itxt = r.texto; imudou = true; }
      };
      trocar('status', status);
      trocar('prioridade', prioridade);
      if (imudou) {
        const rel = `${dtDir}/INDEX.md`.replace(/\\/g, '/');
        const b = backup(idxAbs, rel, ts); if (b) backups.push(b);
        writeFileSync(idxAbs, itxt, 'utf8');
        escritos.push(rel);
      }
    } else if (arquivo) {
      avisos.push(`${ID} nao esta no INDEX.md — so o arquivo foi atualizado.`);
    }
  }
  if (!arquivo) {
    if (escritos.length) avisos.push(`${ID} nao tem arquivo proprio em ${dtDir}/ — atualizado so no INDEX.`);
    else return { ok: false, avisos: [`${ID}: nao existe nem como arquivo nem no INDEX de ${dtDir}/`] };
  }
  return { ok: escritos.length > 0, escritos, backups, avisos, ts };
}

// Reconciliacao: o ARQUIVO manda, o indice se ajusta. Sem 'aplicar', so devolve
// o preview — nada e gravado num GET nem numa chamada de conferencia.
function reconciliarDTs(raiz, aplicar) {
  const perfilTxt = ler(join(raiz, '.claude', 'PERFIL-PROJETO.md'));
  const { dts: dtDir } = descobrirCaminhos(raiz, perfilTxt);
  const dados = coletarDTs(raiz, dtDir);
  const plano = dados.divergencias.map((d) => ({ ...d, acao: `INDEX: ${d.index} -> ${d.arquivo}` }));
  if (!aplicar || !plano.length) return { ok: true, aplicado: false, plano, orfaosIndex: dados.orfaosIndex };

  const idxAbs = join(raiz, dtDir, 'INDEX.md');
  const idx = lerIndex(idxAbs, 'DT');
  if (!idx) return { ok: false, aplicado: false, plano, avisos: ['sem INDEX.md para reconciliar'] };
  const c = idx.cols.indexOf('status');
  if (c < 0) return { ok: false, aplicado: false, plano, avisos: ['INDEX.md sem coluna Status'] };

  let itxt = ler(idxAbs);
  let n = 0;
  for (const d of plano) {
    const item = idx.itens.find((i) => i.id === d.id);
    if (!item) continue;
    const r = setCelulaTabela(itxt, item.linha, c, d.arquivo);
    if (r.achou) { itxt = r.texto; n++; }
  }
  const rel = `${dtDir}/INDEX.md`.replace(/\\/g, '/');
  const b = backup(idxAbs, rel, carimbo());
  writeFileSync(idxAbs, itxt, 'utf8');
  return { ok: true, aplicado: true, corrigidos: n, plano, backup: b, orfaosIndex: dados.orfaosIndex };
}

// ---------------------------------------------------------------------------
// Estado completo (/api/state)
// ---------------------------------------------------------------------------
// Papel do REPO, declarado em .claude/harness-role (1 linha). Fica fora do
// harness.env de proposito: o env e espelhado inteiro para as replicas da equipe,
// e o harness-role e excluido do replica-sync — senao toda replica se declararia
// mestre. Arquivo ausente = 'projeto'.
function papel() {
  return ler(join(CLAUDE_DIR, 'harness-role')).trim().toLowerCase() === 'mestre' ? 'mestre' : 'projeto';
}

function montarEstado() {
  const envTxt = ler(join(CLAUDE_DIR, 'harness.env'));
  const env = parseEnv(envTxt);
  const perfilTxt = ler(join(CLAUDE_DIR, 'PERFIL-PROJETO.md'));
  const ix = indexarPerfil(perfilTxt);

  const campos = {};
  const faltando = [];
  for (const [id, map] of Object.entries(PERFIL_MAP)) {
    const c = acharCampo(ix, map[0], map[1]);
    if (c) campos[id] = c.valor; else { campos[id] = ''; faltando.push(id); }
  }
  // Blocos de texto livre.
  const blocos = {};
  for (const [id, prefixo] of Object.entries(PERFIL_BLOCOS)) {
    const s = ix.secoes.find((x) => x.norm.startsWith(norm(prefixo)));
    blocos[id] = s ? ix.linhas.slice(s.ini + 1, s.fim + 1).join('\n').trim() : '';
  }

  const preset = campos.preset || 'equilibrado';
  const adocao = lerAdocao(perfilTxt);
  // 3.4.25: esforco da sessao resolvido (preset + override do Perfil) — a tela mostra; quem aplica e o dev.
  const esforco = resolverEsforco(preset, campos.m_esforco);

  return {
    ok: true,
    projeto: campos.proj_nome || basenameDe(ROOT),
    raiz: ROOT.replace(/\\/g, '/'),
    papel: papel(),
    versao: env.ativos.HARNESS_VERSION || '',
    targets: env.ativos.HARNESS_TARGETS || 'claude',
    host: env.ativos.HARNESS_HOST || 'auto',
    preset,
    esforco,
    modelosOverride: MODELOS_OVERRIDE,
    perfilExiste: !!perfilTxt,
    perfilCampos: campos,
    perfilBlocos: blocos,
    perfilFaltando: faltando,
    env: env.ativos,
    envComentados: env.comentados,
    // 3.5.7: valor RESOLVIDO (defaults -> projeto -> local -> maquina -> ambiente) e origem por chave; a tela
    // deixa de mostrar "comentada" para uma decisao que na verdade vem de hooks/_defaults.env.
    ...(() => { try {
      const r = resolverCamadas(CLAUDE_DIR);
      const envResolvido = {}, envOrigem = {}, envClasse = {};
      for (const [k, c] of Object.entries(r.chaves)) { envResolvido[k] = c.valor; envOrigem[k] = c.origem; envClasse[k] = c.classe; }
      return { envResolvido, envOrigem, envClasse, envDefaults: r.defaults, envOverrides: r.overrides, envObsoletas: r.obsoletas };
    } catch { return { envResolvido: {}, envOrigem: {}, envClasse: {}, envDefaults: {}, envOverrides: [], envObsoletas: [] }; } })(),
    // 3.0.0 — economia/delegacao. `envLocal` e a camada POR MAQUINA (gitignored):
    // a tela precisa distinguir "o projeto decidiu" de "eu decidi nesta maquina",
    // senao o dial pessoal (conta apertada) vazaria para a equipe no /deus.
    envLocal: soChavesLocais(parseEnv(existe(join(CLAUDE_DIR, 'harness.env.local'))
      ? ler(join(CLAUDE_DIR, 'harness.env.local')) : '').ativos),
    roteamento: lerRoteamento(perfilTxt),
    skills: coletarSkills(),
    agentes: coletarAgentes(perfilTxt, preset),
    hooks: coletarHooks(),
    convencoes: coletarConvencoes(adocao),
    telemetria: coletarTelemetria(),
    resumoExiste: existe(join(CLAUDE_DIR, 'PERFIL-RESUMO.md')),
    settingsExiste: existe(join(CLAUDE_DIR, 'settings.json')),
  };
}
const basenameDe = (p) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop();

// ---------------------------------------------------------------------------
// Gravacao (/api/save)
// ---------------------------------------------------------------------------
// corpo: { perfilCampos?, perfilBlocos?, env?, adocao?, arquivos?[{path,content}] }
function gravar(corpo) {
  const ts = carimbo();
  const escritos = [], backups = [], avisos = [];

  const perfilAbs = join(CLAUDE_DIR, 'PERFIL-PROJETO.md');
  const temPerfil = corpo.perfilCampos || corpo.perfilBlocos || corpo.adocao || corpo.roteamento;
  if (temPerfil) {
    if (!existe(perfilAbs)) {
      avisos.push('PERFIL-PROJETO.md ausente — nada gravado no Perfil. Rode /harness-config para criar a partir de um perfil base.');
    } else {
      let txt = ler(perfilAbs);
      if (corpo.perfilCampos && Object.keys(corpo.perfilCampos).length) {
        const r = setPerfilCampos(txt, corpo.perfilCampos);
        txt = r.texto;
        if (r.naoAplicados.length) avisos.push(`campos sem linha correspondente no Perfil: ${r.naoAplicados.join(', ')}`);
      }
      for (const [id, corpoTxt] of Object.entries(corpo.perfilBlocos || {})) {
        const prefixo = PERFIL_BLOCOS[id];
        if (!prefixo) continue;
        const r = setPerfilBloco(txt, prefixo, corpoTxt);
        if (r.ok) txt = r.texto; else avisos.push(`seção de texto livre não encontrada: ${id}`);
      }
      if (corpo.roteamento && Object.keys(corpo.roteamento).length) {
        const r = setRoteamento(txt, corpo.roteamento);
        txt = r.texto;
        if (r.naoAplicados.length) {
          avisos.push(`papéis sem linha na tabela "Roteamento por papel" do Perfil: ${r.naoAplicados.join(', ')} — copie a seção "Economia e controle de custo" da cópia-mestre.`);
        }
      }
      if (corpo.adocao) txt = setAdocao(txt, corpo.adocao);
      backups.push(backup(perfilAbs, '.claude/PERFIL-PROJETO.md', ts));
      writeFileSync(perfilAbs, txt, 'utf8');
      escritos.push('.claude/PERFIL-PROJETO.md');
    }
  }

  if (corpo.env && Object.keys(corpo.env).length) {
    // 3.5.7: cada chave vai para a CAMADA certa (hooks/_camadas.txt + hooks/_defaults.env):
    //   decisao do harness -> no MESTRE grava em hooks/_defaults.env (viaja no sync); num PROJETO vira override
    //   consciente no harness.env, com o default do mestre anotado na linha de cima (o doctor avisa, o sync preserva)
    //   chave de projeto -> harness.env · chave de maquina -> harness.env.local (gitignored)
    const camadasTxt = lerCamadasTxt(CLAUDE_DIR);
    const defaultsAbs = join(CLAUDE_DIR, 'hooks', '_defaults.env');
    const defaults = lerArquivoEnv(defaultsAbs).ativos;
    const paraDefaults = {}, paraProjeto = {}, paraLocal = {}, overrideNovo = [];
    for (const [k, v] of Object.entries(corpo.env)) {
      const cls = classificarChave(k, camadasTxt, defaults).classe;
      if (cls === 'decisao' && papel() === 'mestre') paraDefaults[k] = v;
      else if (cls === 'maquina') paraLocal[k] = v;
      else { paraProjeto[k] = v; if (cls === 'decisao' && v !== defaults[k]) overrideNovo.push(k); }
    }
    if (Object.keys(paraDefaults).length) {
      const atual = existe(defaultsAbs) ? ler(defaultsAbs) : "# .claude/hooks/_defaults.env — criado pela tela do harness\n";
      if (existe(defaultsAbs)) backups.push(backup(defaultsAbs, '.claude/hooks/_defaults.env', ts));
      writeFileSync(defaultsAbs, setEnv(atual, paraDefaults), 'utf8');
      escritos.push('.claude/hooks/_defaults.env');
      avisos.push(`decisao do harness gravada em hooks/_defaults.env (mestre): ${Object.keys(paraDefaults).join(', ')} — publique pelo /deus.`);
    }
    if (Object.keys(paraProjeto).length) {
      const envAbs = join(CLAUDE_DIR, 'harness.env');
      let atual = existe(envAbs) ? ler(envAbs) : "# .claude/harness.env — criado pela tela do harness\n";
      if (existe(envAbs)) backups.push(backup(envAbs, '.claude/harness.env', ts));
      // override consciente que ainda nao existe no arquivo: anota o default do mestre na linha de cima
      const eol = atual.includes('\r\n') ? '\r\n' : '\n';
      for (const k of overrideNovo) {
        if (new RegExp(`^[ \\t]*#?[ \\t]*${k}=`, 'm').test(atual)) continue;
        atual = atual.replace(/\s*$/, eol) + `# override consciente (3.5.7) — default do harness em hooks/_defaults.env: ${k}=${citar(defaults[k] ?? '')}${eol}`;
      }
      writeFileSync(envAbs, setEnv(atual, paraProjeto), 'utf8');
      escritos.push('.claude/harness.env');
      if (overrideNovo.length) avisos.push(`override consciente de decisao do harness neste projeto: ${overrideNovo.join(', ')} — o doctor vai avisar e o /deus preserva.`);
    }
    if (Object.keys(paraLocal).length) {
      const localAbs = join(CLAUDE_DIR, 'harness.env.local');
      const atual = existe(localAbs) ? ler(localAbs) : "# .claude/harness.env.local — OVERRIDES POR MAQUINA (gitignored).\n";
      if (existe(localAbs)) backups.push(backup(localAbs, '.claude/harness.env.local', ts));
      writeFileSync(localAbs, setEnv(atual, paraLocal), 'utf8');
      escritos.push('.claude/harness.env.local');
    }
  }

  // 3.0.0 — camada POR MAQUINA (gitignored). Existe para que "minha conta esta
  // apertada esta semana" nao vire commit no repo da equipe: o /deus propaga o
  // harness.env, nunca o .local.
  const patchLocal = soChavesLocais(corpo.envLocal);
  if (Object.keys(patchLocal).length) {
    const localAbs = join(CLAUDE_DIR, 'harness.env.local');
    const cabecalho = "# .claude/harness.env.local — OVERRIDES POR MAQUINA (gitignored).\n"
      + "# Criado/editado pela tela do harness. Sobrescreve o harness.env.\n";
    const atual = existe(localAbs) ? ler(localAbs) : cabecalho;
    if (existe(localAbs)) backups.push(backup(localAbs, '.claude/harness.env.local', ts));
    writeFileSync(localAbs, setEnv(atual, patchLocal), 'utf8');
    escritos.push('.claude/harness.env.local');
  }

  for (const arq of (corpo.arquivos || [])) {
    const seguro = caminhoSeguro(arq.path);
    if (!seguro) { avisos.push(`caminho recusado: ${arq.path}`); continue; }
    if (!podeGravar(seguro.rel)) { avisos.push(`fora da allowlist de escrita: ${seguro.rel}`); continue; }
    if (typeof arq.content !== 'string') { avisos.push(`conteúdo inválido: ${seguro.rel}`); continue; }
    mkdirSync(dirname(seguro.abs), { recursive: true });
    const b = backup(seguro.abs, seguro.rel, ts);
    if (b) backups.push(b);
    writeFileSync(seguro.abs, arq.content, 'utf8');
    escritos.push(seguro.rel);
  }

  return { ok: escritos.length > 0, escritos, backups: backups.filter(Boolean), avisos, ts };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const argVal = (nome, def) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const envInicial = parseEnv(ler(join(CLAUDE_DIR, 'harness.env')));
const PORTA_BASE = Number(argVal('--port', envInicial.ativos.HARNESS_UI_PORT || '7337')) || 7337;
const IDLE_MIN = Number(argVal('--idle', '30')) || 30;
const TOKEN = randomUUID();

// Diagnostico read-only: imprime o JSON da aba Trabalho de um diretorio e sai,
// SEM subir servidor. Serve para conferir o parse num projeto cujo formato de
// DT/PRD e diferente (as pastas variam) sem depender da tela.
//   node .claude/harness-ui.mjs --dump-trabalho <dir>
{
  const alvo = argVal('--dump-trabalho', '');
  if (alvo) {
    const raiz = resolve(alvo);
    if (!existe(raiz)) { console.error(`diretorio inexistente: ${raiz}`); process.exit(2); }
    const t0 = Date.now();
    const r = coletarTrabalho(raiz);
    r.ms = Date.now() - t0;
    // '--linhas': saida parseavel em shell (o harness-doctor.sh consome isto —
    // assim o parse de DT/PRD tem UMA implementacao so, nao duas divergindo).
    if (args.includes('--linhas')) {
      const l = [
        ['dtDir', r.caminhos.dts], ['prdsDir', r.caminhos.prds],
        ['dtExiste', r.dts.existe ? 1 : 0], ['dtIndex', r.dts.index ? 1 : 0],
        ['dtTotal', r.resumo.dtTotal], ['dtPendentes', r.resumo.dtPendentes],
        ['dtSemStatus', r.resumo.dtSemStatus], ['divergencias', r.resumo.divergencias],
        ['prdTotal', r.resumo.prdTotal], ['prdAbertas', r.resumo.prdAbertas],
      ];
      process.stdout.write(l.map(([k, v]) => `TRABALHO|${k}|${v}`).join('\n') + '\n');
      process.exit(0);
    }
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    process.exit(0);
  }
}

let ultimoAcesso = Date.now();

function json(res, code, obj) {
  const corpo = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(corpo),
    'cache-control': 'no-store',
  });
  res.end(corpo);
}

// Host/Origin so podem ser o proprio loopback (defesa contra DNS-rebinding:
// uma pagina externa nao consegue falar com este servidor).
function origemOk(req, porta) {
  const host = (req.headers.host || '').toLowerCase();
  if (host !== `127.0.0.1:${porta}` && host !== `localhost:${porta}`) return false;
  const origin = req.headers.origin;
  if (origin && !new RegExp(`^http://(127\\.0\\.0\\.1|localhost):${porta}$`).test(origin)) return false;
  return true;
}
function tokenOk(req, url) {
  const t = url.searchParams.get('t') || req.headers['x-harness-token'] || '';
  return t === TOKEN;
}

function lerCorpo(req, limite = 4 * 1024 * 1024) {
  return new Promise((resolveP, rejeitar) => {
    let dados = '', tamanho = 0;
    req.on('data', (c) => {
      tamanho += c.length;
      if (tamanho > limite) { rejeitar(new Error('corpo grande demais')); req.destroy(); return; }
      dados += c;
    });
    req.on('end', () => { try { resolveP(dados ? JSON.parse(dados) : {}); } catch (e) { rejeitar(e); } });
    req.on('error', rejeitar);
  });
}

function criarServidor(porta) {
  return createServer(async (req, res) => {
    ultimoAcesso = Date.now();
    const url = new URL(req.url, `http://127.0.0.1:${porta}`);

    if (!origemOk(req, porta)) return json(res, 403, { ok: false, erro: 'origem nao permitida' });

    // A pagina e servida sem token (o token vai na URL e o JS o guarda); as
    // rotas /api/* exigem o token — e o que protege leitura e escrita.
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = ler(join(CLAUDE_DIR, 'harness-config.html'));
      if (!html) { res.writeHead(500); return res.end('harness-config.html ausente'); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    }

    if (!url.pathname.startsWith('/api/')) { res.writeHead(404); return res.end('nao encontrado'); }
    if (!tokenOk(req, url)) return json(res, 403, { ok: false, erro: 'token invalido ou ausente' });

    try {
      if (url.pathname === '/api/state' && req.method === 'GET') {
        return json(res, 200, montarEstado());
      }

      if (url.pathname === '/api/file' && req.method === 'GET') {
        const seguro = caminhoSeguro(url.searchParams.get('path') || '');
        if (!seguro) return json(res, 400, { ok: false, erro: 'caminho invalido' });
        if (!podeLer(seguro.rel)) return json(res, 403, { ok: false, erro: 'leitura nao permitida' });
        if (!existe(seguro.abs)) return json(res, 404, { ok: false, erro: 'arquivo inexistente' });
        return json(res, 200, { ok: true, path: seguro.rel, content: ler(seguro.abs), gravavel: podeGravar(seguro.rel) });
      }

      if (url.pathname === '/api/save' && req.method === 'POST') {
        const corpo = await lerCorpo(req);
        return json(res, 200, gravar(corpo));
      }

      // Aba Trabalho: rota SEPARADA e preguicosa — le ~1400 arquivos (DTs +
      // tasks), caro demais para entrar no /api/state de toda abertura.
      if (url.pathname === '/api/trabalho' && req.method === 'GET') {
        const t0 = Date.now();
        const r = coletarTrabalho(ROOT);
        r.ms = Date.now() - t0;
        return json(res, 200, r);
      }

      // 3.3.0 — pre-classificacao da fila de DTs (read-only). E a versao "na tela" do Passo 2 do
      // /dt-sweep: heuristica sobre titulo/origem/esforco/idade, NUNCA escreve nada. A prova
      // (test -e, git log -S) continua sendo da skill — aqui so se reduz a digitacao.
      // 3.4.0 — worktrees ativos + locks + placar de duelos (read-only)
      if (url.pathname === '/api/worktrees' && req.method === 'GET') {
        return json(res, 200, coletarWorktrees(ROOT));
      }

      if (url.pathname === '/api/trabalho/sweep' && req.method === 'GET') {
        const paralelo = Math.max(1, Math.min(4, Number(url.searchParams.get('paralelo')) || 2));
        return json(res, 200, preClassificarSweep(ROOT, paralelo));
      }

      if (url.pathname === '/api/trabalho/dt' && req.method === 'POST') {
        const corpo = await lerCorpo(req, 64 * 1024);
        return json(res, 200, gravarDT(ROOT, corpo || {}));
      }

      if (url.pathname === '/api/trabalho/reconciliar' && req.method === 'POST') {
        const corpo = await lerCorpo(req, 64 * 1024);
        return json(res, 200, reconciliarDTs(ROOT, !!(corpo && corpo.aplicar)));
      }

      if (url.pathname === '/api/ideias' && req.method === 'GET') {
        return json(res, 200, lerIdeias(ROOT));
      }
      if (url.pathname === '/api/ideias' && req.method === 'POST') {
        const corpo = await lerCorpo(req, 128 * 1024);
        return json(res, 200, capturarIdeia(ROOT, corpo || {}));
      }
      if (url.pathname === '/api/ideias/estado' && req.method === 'POST') {
        const corpo = await lerCorpo(req, 32 * 1024);
        return json(res, 200, mudarIdeia(ROOT, corpo || {}));
      }

      if (url.pathname === '/api/doctor' && req.method === 'POST') {
        return execFile('bash', ['.claude/harness-doctor.sh'], { cwd: ROOT, timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
          (erro, stdout, stderr) => json(res, 200, {
            ok: !erro || erro.code === 1,          // exit 1 = ha [FALTA], nao e falha do bridge
            saida: String(stdout || '') + String(stderr || ''),
            indisponivel: !!(erro && erro.code === 'ENOENT'),
          }));
      }

      return json(res, 404, { ok: false, erro: 'rota desconhecida' });
    } catch (e) {
      return json(res, 500, { ok: false, erro: String(e && e.message || e) });
    }
  });
}

// Sobe na primeira porta livre a partir da base (ate +10).
function subir(porta, tentativas = 0) {
  const srv = criarServidor(porta);
  srv.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && tentativas < 10) return subir(porta + 1, tentativas + 1);
    console.error(`[harness-ui] falhou: ${e.message}`);
    process.exit(1);
  });
  srv.listen(porta, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${porta}/?t=${TOKEN}`;
    console.log('');
    console.log(`  Tela do harness — ${basenameDe(ROOT)} (${papel()})`);
    console.log(`  ${url}`);
    console.log('');
    console.log(`  Ctrl+C para encerrar. Encerra sozinho apos ${IDLE_MIN} min sem uso.`);
    console.log('');
    setInterval(() => {
      if (Date.now() - ultimoAcesso > IDLE_MIN * 60000) {
        console.log('[harness-ui] ocioso — encerrando.');
        process.exit(0);
      }
    }, 60000).unref();
  });
}

subir(PORTA_BASE);
