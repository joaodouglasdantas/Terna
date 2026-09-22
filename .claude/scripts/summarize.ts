// .claude/scripts/summarize.ts
// Variante GENERICA (Node-only) do passo de RESUMO do RAG, para o harness PADRAO.
// Nao depende de PHP nem de cliente LLM do projeto. Por padrao (HARNESS_RAG_LLM_PROVIDER nao
// setado) usa o provider 'claude-cli' -> `claude -p`, autenticado pela ASSINATURA do Claude
// Code, SEM ANTHROPIC_API_KEY. Provider 'anthropic' (legado, opt-in) chama a API HTTP via
// fetch lendo ANTHROPIC_API_KEY de env (Node 18+ tem fetch global).
//
// Mantem o MESMO CONTRATO do summarize.php:
//   - Entrada: payload do hook no stdin (transcript_path OU tool_input+tool_output).
//   - Saida:  grava .claude/knowledge/AAAA-MM-DD-<agent>-<slug>-<hash>.md (frontmatter +
//             4 secoes) e IMPRIME o caminho no stdout (o hook embeda esse arquivo).
//   - Guards: anti-PII no prompt + scrub, gate de relevancia, gate de tamanho minimo.
//   - Mock:   HARNESS_RAG_SUMMARIZE_MOCK=1 (teste/CI, sem chamar a API).
//
// Uso (pelo hook):  printf '%s' "$INPUT" | node <tsx> summarize.ts --mode=agent --agent=Explore
//
// Por que TS e nao PHP no harness padrao: o modulo RAG ja exige Node (embed/search),
// entao manter o resumo em Node torna o modulo Node-only — portavel para qualquer stack.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { KNOWLEDGE_DIR } from './paths';

interface HookPayload {
  transcript_path?: string;
  tool_input?: { prompt?: string; description?: string } | Record<string, unknown>;
  tool_output?: unknown;
  tool_response?: unknown;
  output?: unknown;
  result?: unknown;
  session_id?: string;
  agent_type?: string;
  subagent_type?: string;
}

interface Distilled {
  relevante?: boolean;
  titulo?: string;
  descricao?: string;
  bug?: string[];
  arquitetura?: string[];
  padrao?: string[];
  falha?: string[];
}

const MIN_CHARS = parseInt(process.env.HARNESS_RAG_CAPTURE_MIN_CHARS || '800', 10) || 800;
const IS_MOCK = process.env.HARNESS_RAG_SUMMARIZE_MOCK === '1';
const MODEL = process.env.HARNESS_RAG_SUMMARIZE_MODEL || 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

// Provider do passo de resumo (interface multi-AI, 2.0.0 — ver PLATAFORMAS.md §9):
//   'claude-cli'  -> CLI `claude -p` (autentica pela ASSINATURA, sem ANTHROPIC_API_KEY).
//                    Default do CODIGO e do harness.env mestre.
//   'codex-cli'   -> CLI `codex exec` (read-only, --ephemeral; autentica pelo login do
//                    Codex em ~/.codex/auth.json). Mesmo guard de reentrancia.
//   'anthropic'   -> provider HTTP explicito via fetch, le ANTHROPIC_API_KEY de env.
//   'mock'        -> resposta sintetica (equivale a HARNESS_RAG_SUMMARIZE_MOCK=1) —
//                    testes/CI sem rede e sem custo.
//   'disabled'    -> resumo desligado: captura vira no-op silencioso (log do hook).
// Default = 'claude-cli': NAO exige chave de API (so o `claude` no PATH).
// PRIVACIDADE: qualquer provider nao-mock envia o transcript ao LLM configurado
// (Anthropic ou OpenAI) — e o unico egress do modulo RAG; embeddings sao locais.
const PROVIDER = (process.env.HARNESS_RAG_LLM_PROVIDER || 'claude-cli').toLowerCase();
const CLAUDE_BIN = process.env.HARNESS_RAG_CLAUDE_BIN || 'claude';
const CODEX_BIN = process.env.HARNESS_RAG_CODEX_BIN || 'codex';
const CLAUDE_MODEL = process.env.HARNESS_RAG_CLAUDE_MODEL || MODEL;
// Timeout do `claude -p` por tentativa (ms). A destilacao leva ~50s em maquina ociosa;
// sob carga (sessao + subagents) passa de 120s e estoura (ETIMEDOUT) -> aprendizado
// perdido. Como a captura roda ASYNC (nao bloqueia o usuario), um teto mais alto so
// ajuda. Configuravel: HARNESS_RAG_SUMMARIZE_TIMEOUT_MS. Default 180s.
const CLAUDE_TIMEOUT_MS = parseInt(process.env.HARNESS_RAG_SUMMARIZE_TIMEOUT_MS || '180000', 10) || 180000;
// Retries em falha TRANSITORIA do LLM (timeout/429/529/conexao). 0 desliga. Default 1.
const CLAUDE_RETRIES = Math.max(0, parseInt(process.env.HARNESS_RAG_SUMMARIZE_RETRIES || '1', 10) || 0);
// Sinaliza ao hook chamador que a falha foi do LLM (-> exit 3), e nao irrelevancia
// (-> exit 0). Sem isto, timeout e "{relevante:false}" viram o mesmo log indistinguivel.
let LLM_FAILED = false;

function arg(name: string, def = ''): string {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
}

async function main(): Promise<void> {
  if (process.env.HARNESS_RAG_ENABLED === '0') return;

  const mode = arg('mode', 'agent');
  let agent = arg('agent', '');
  if (!agent) agent = mode === 'session' ? 'session' : 'agent';

  // --- le o payload do hook (stdin) ---
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return; // sem stdin -> nada a fazer
  }
  if (!raw.trim()) return;

  let payload: HookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // pode ter vindo so o caminho do transcript como texto puro
    payload = existsSync(raw.trim()) ? { transcript_path: raw.trim() } : {};
  }

  // --- monta o texto-fonte ---
  let source = construirTextoFonte(payload);
  if (source.length < MIN_CHARS) return; // nada substancial

  const CAP = 48000;
  if (source.length > CAP) {
    source = source.slice(0, 6000) + '\n\n[...trecho omitido...]\n\n' + source.slice(-(CAP - 6000));
  }

  // --- destila ---
  if (PROVIDER === 'disabled') return; // resumo desligado por config — no-op consciente
  const useMock = IS_MOCK || PROVIDER === 'mock';
  const data: Distilled | null = useMock ? dadosMock() : await destilar(source);
  if (!data) {
    if (LLM_FAILED) process.exitCode = 3; // hook loga FALHA (vs "nada relevante")
    return;
  }
  if (!data.relevante) return; // irrelevancia legitima -> exit 0

  // --- grava ---
  const path = gravarKnowledge(mode, agent, payload, data);
  if (path) process.stdout.write(path + '\n');
}

function construirTextoFonte(p: HookPayload): string {
  // 1) transcript JSONL (SubagentStop / SessionEnd / Stop)
  const tp = p.transcript_path || '';
  if (tp && existsSync(tp)) {
    try {
      // 1a) formato do Claude Code ({type:'user'|'assistant', message.content[]})
      const claude = extrairDeTranscript(tp);
      if (claude) return claude;
      // 1b) formato desconhecido (ex.: sessoes do Codex) — extrator generico:
      // varre cada linha JSON atras de campos textuais. Se nada sair, o gate
      // MIN_CHARS derruba a captura em silencio (degradacao honesta).
      const generic = extrairGenerico(tp);
      if (generic) return generic;
    } catch {
      /* cai pro fallback */
    }
  }
  // 2) fallback PostToolUse[Agent]: tarefa + resultado
  const ti = (p.tool_input || {}) as Record<string, unknown>;
  const prompt = (ti.prompt as string) || (ti.description as string) || '';
  let out: unknown = p.tool_output ?? p.tool_response ?? p.output ?? p.result ?? '';
  if (typeof out !== 'string') out = JSON.stringify(out);
  let txt = '';
  if (prompt) txt += 'TAREFA DO AGENTE:\n' + prompt + '\n\n';
  if (out) txt += 'RESULTADO DO AGENTE:\n' + (out as string) + '\n';
  return txt.trim();
}

function extrairDeTranscript(file: string): string {
  const lines = readFileSync(file, 'utf8').split('\n');
  const partes: string[] = [];
  const maxLinhas = 4000;
  for (let i = 0; i < lines.length && partes.length < maxLinhas; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const tipo = obj?.type;
    if (tipo !== 'user' && tipo !== 'assistant') continue;
    const msg = obj.message || {};
    const role = msg.role || tipo;
    const content = msg.content;
    let texto = '';
    if (typeof content === 'string') {
      texto = content;
    } else if (Array.isArray(content)) {
      for (const blk of content) {
        if (!blk || typeof blk !== 'object') continue;
        if (blk.type === 'text' && blk.text) texto += blk.text + '\n';
        else if (blk.type === 'tool_use' && blk.name) texto += `[ferramenta: ${blk.name}]\n`;
        // tool_result ignorado de proposito (ruidoso/enorme)
      }
    }
    texto = texto.trim();
    if (!texto) continue;
    if (texto.length > 4000) texto = texto.slice(0, 4000) + ' [...]';
    partes.push(String(role).toUpperCase() + ': ' + texto);
  }
  return partes.join('\n\n').trim();
}

// Extrator GENERICO para transcript JSONL de formato desconhecido (ex.: Codex).
// Colhe valores string "conversacionais" (text/content/message) de cada linha JSON,
// ignorando metadados curtos. Best-effort de proposito: melhor um texto bruto que o
// LLM destila do que fingir que o formato e conhecido.
function extrairGenerico(file: string): string {
  const lines = readFileSync(file, 'utf8').split('\n');
  const partes: string[] = [];
  const KEYS = ['text', 'content', 'message', 'output', 'input', 'payload'];
  const coleta = (v: unknown, depth: number): void => {
    if (partes.length >= 4000 || depth > 4 || v == null) return;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length >= 40) partes.push(t.length > 4000 ? t.slice(0, 4000) + ' [...]' : t);
      return;
    }
    if (Array.isArray(v)) { for (const x of v) coleta(x, depth + 1); return; }
    if (typeof v === 'object') {
      for (const k of KEYS) {
        const o = v as Record<string, unknown>;
        if (k in o) coleta(o[k], depth + 1);
      }
    }
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try { coleta(JSON.parse(t), 0); } catch { /* linha nao-JSON: ignora */ }
  }
  return partes.join('\n\n').trim();
}

async function destilar(source: string): Promise<Distilled | null> {
  const system = systemPrompt();
  let lastErr: any;
  // Tenta ate CLAUDE_RETRIES+1 vezes, mas SO re-tenta em falha transitoria de transporte
  // (timeout/429/529/conexao). Erro permanente (ex.: binario ausente) nao re-tenta.
  for (let attempt = 0; attempt <= CLAUDE_RETRIES; attempt++) {
    try {
      const text = await chamarModelo(system, source);
      let data = decodificarJsonFlexivel(text);
      if (!data) {
        // 1 retry com instrucao reforcada (JSON invalido != falha de transporte)
        const text2 = await chamarModelo(system, source + '\n\nATENCAO: responda APENAS com JSON valido.');
        data = decodificarJsonFlexivel(text2);
        if (!data) {
          // 2x JSON invalido = FALHA do LLM (exit 3 no hook), nao "nada relevante" —
          // sem isto a falha viraria exit 0 indistinguivel de irrelevancia.
          process.stderr.write('[summarize.ts] resposta do LLM nao e JSON apos retry: ' + String(text2).slice(0, 120) + '\n');
          LLM_FAILED = true;
        }
      }
      return data;
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      const transitorio = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|\b429\b|\b529\b|overloaded|rate.?limit/i.test(msg);
      if (attempt < CLAUDE_RETRIES && transitorio) {
        const espera = 3000 * (attempt + 1); // backoff linear: 3s, 6s, ... da tempo da carga baixar
        process.stderr.write(`[summarize.ts] LLM falhou (${msg.slice(0, 80)}) — retry ${attempt + 1}/${CLAUDE_RETRIES} em ${espera}ms\n`);
        await new Promise((r) => setTimeout(r, espera));
        continue;
      }
      break; // sem mais retries, ou erro permanente
    }
  }
  process.stderr.write('[summarize.ts] LLM indisponivel (provider=' + PROVIDER + '): ' + (lastErr?.message || lastErr) + '\n');
  LLM_FAILED = true; // best-effort: nunca quebra a sessao, mas sinaliza a falha (exit 3)
  return null;
}

// Despacha o resumo para o provider configurado (HARNESS_RAG_LLM_PROVIDER).
async function chamarModelo(system: string, user: string): Promise<string> {
  if (PROVIDER === 'claude-cli') return chamarClaudeCli(system, user);
  if (PROVIDER === 'codex-cli') return chamarCodexCli(system, user);
  if (PROVIDER === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY ausente (provider=anthropic)');
    return chamarAnthropic(apiKey, system, user);
  }
  throw new Error(`HARNESS_RAG_LLM_PROVIDER desconhecido: '${PROVIDER}' (use claude-cli|codex-cli|anthropic|mock|disabled)`);
}

// Provider 'claude-cli': chama o CLI `claude -p`, que autentica pela ASSINATURA do
// Claude Code (sem ANTHROPIC_API_KEY). Roda com HARNESS_RAG_IN_SUMMARIZE=1 para que os
// hooks RAG disparados pelo subprocesso saiam no-op (anti-reentrancia — ver _rag-common.sh).
// Sincrono de proposito (spawnSync): a captura ja roda em hook async, sem bloquear o usuario.
function chamarClaudeCli(system: string, user: string): string {
  const res = spawnSync(
    CLAUDE_BIN,
    ['-p', '--model', CLAUDE_MODEL, '--system-prompt', system, '--no-session-persistence', '--output-format', 'text'],
    {
      input: user,
      encoding: 'utf8',
      env: { ...process.env, HARNESS_RAG_IN_SUMMARIZE: '1' },
      maxBuffer: 16 * 1024 * 1024,
      timeout: CLAUDE_TIMEOUT_MS,
    }
  );
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`claude -p saiu ${res.status}: ${String(res.stderr || '').slice(0, 300)}`);
  }
  return String(res.stdout || '');
}

// Provider 'codex-cli': chama `codex exec` nao-interativo em sandbox read-only e
// sessao efemera (nada persiste). O prompt via stdin ('-'); nao ha flag de system
// prompt no codex exec, entao o system vai concatenado no inicio do prompt.
// Reentrancia: HARNESS_RAG_IN_SUMMARIZE=1 no spawn — os hooks do projeto (de
// QUALQUER host) herdam a env e saem no-op (_rag-common.sh). --skip-git-repo-check
// permite rodar fora de repo (ex.: testes); effort 'low' mantem o custo minimo.
function chamarCodexCli(system: string, user: string): string {
  const res = spawnSync(
    CODEX_BIN,
    [
      'exec',
      '--sandbox', 'read-only',
      '--ephemeral',
      '--skip-git-repo-check',
      '-c', 'model_reasoning_effort=low',
      '-',
    ],
    {
      input: system + '\n\n---\n\nTRANSCRIPT A DESTILAR:\n\n' + user,
      encoding: 'utf8',
      env: { ...process.env, HARNESS_RAG_IN_SUMMARIZE: '1' },
      maxBuffer: 16 * 1024 * 1024,
      timeout: CLAUDE_TIMEOUT_MS,
    }
  );
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`codex exec saiu ${res.status}: ${String(res.stderr || '').slice(0, 300)}`);
  }
  // codex exec: stdout carrega SO a mensagem final; progresso vai ao stderr.
  return String(res.stdout || '');
}

async function chamarAnthropic(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const text = json?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('resposta Anthropic mal formada');
  return text;
}

function decodificarJsonFlexivel(texto: string): Distilled | null {
  let t = (texto || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const o = JSON.parse(t);
    return o && typeof o === 'object' ? (o as Distilled) : null;
  } catch {
    return null;
  }
}

function systemPrompt(): string {
  return (
    'Voce e um extrator de APRENDIZADOS TECNICOS de engenharia de software. ' +
    'Recebe o transcript de um agente/sessao de trabalho num projeto de software. ' +
    'Extraia SOMENTE aprendizados reutilizaveis, em 4 categorias:\n' +
    '1) bugs resolvidos com causa raiz;\n' +
    '2) decisoes de arquitetura e o porque;\n' +
    '3) padroes adotados pelo time;\n' +
    '4) o que NAO funcionou e por que.\n\n' +
    'REGRAS CRITICAS:\n' +
    '- NUNCA inclua dados pessoais/sensiveis (nomes proprios de usuarios finais, CPF, ' +
    'telefone, e-mail, endereco, segredos/chaves). Fale de codigo/padroes de forma generica.\n' +
    '- So extraia o que tem valor de REUSO futuro (uma causa-raiz, uma convencao, uma decisao). ' +
    'Ignore exploracao trivial, leitura de arquivos e conversa sem conclusao.\n' +
    '- Se NAO houver aprendizado tecnico relevante, responda {"relevante": false}.\n' +
    '- Caso haja, responda JSON: {"relevante": true, "titulo": "<frase curta>", ' +
    '"descricao": "<1 linha>", "bug": ["..."], "arquitetura": ["..."], "padrao": ["..."], ' +
    '"falha": ["..."]}. Cada array e lista de bullets concisos (pode ser vazio).'
  );
}

function dadosMock(): Distilled {
  return {
    relevante: true,
    titulo: 'Captura RAG (mock de teste)',
    descricao: 'Entrada de teste gerada em modo mock para validar o pipeline (variante TS).',
    bug: ['Exemplo: rowid do sqlite-vec precisa ser BigInt, senao "Only integers are allowed".'],
    arquitetura: ['Exemplo: versionar a fonte (.md) e derivar o indice (.db) por maquina.'],
    padrao: ['Exemplo: resumo via provider claude-cli (`claude -p`, assinatura, sem chave de API).'],
    falha: [],
  };
}

// Normaliza campo do JSON do LLM na fronteira de uso: array -> strings;
// string solta vira lista de 1 (LLM as vezes devolve "bug": "texto" — sem isto
// o for..of iteraria os CARACTERES e o indice ganharia bullets de 1 letra).
function comoLista(x: unknown): string[] {
  if (Array.isArray(x)) return x.map((v) => String(v));
  if (typeof x === 'string' && x.trim()) return [x];
  return [];
}

function gravarKnowledge(mode: string, agent: string, payload: HookPayload, data: Distilled): string {
  if (!existsSync(KNOWLEDGE_DIR)) mkdirSync(KNOWLEDGE_DIR, { recursive: true });

  const titulo = String(data.titulo || 'Aprendizado').trim();
  const descricao = String(data.descricao || '').trim();
  const sessao = String(payload.session_id || '');

  const hoje = new Date().toISOString().slice(0, 10); // auditoria do indice, nao data de negocio
  const titSlug = slug(titulo).slice(0, 40) || 'nota';
  const hash = createHash('md5').update(`${sessao}|${titulo}|${process.hrtime.bigint()}`).digest('hex').slice(0, 6);
  const nome = `${hoje}-${slug(agent) || 'agent'}-${titSlug}-${hash}.md`;
  const path = join(KNOWLEDGE_DIR, nome);

  const secoes: Array<[string, string[]]> = [
    ['Bugs e causa raiz', comoLista(data.bug)],
    ['Decisoes de arquitetura', comoLista(data.arquitetura)],
    ['Padroes do time', comoLista(data.padrao)],
    ['O que nao funcionou', comoLista(data.falha)],
  ];
  if (!secoes.some(([, itens]) => itens.length > 0)) return ''; // nada a indexar

  let md = '---\n';
  md += `name: ${escFront(titulo)}\n`;
  md += `description: ${escFront(descricao || titulo)}\n`;
  md += 'type: knowledge\n';
  md += `agent: ${escFront(agent)}\n`;
  md += `source: ${escFront(mode)}\n`;
  md += `created: ${hoje}\n`;
  if (sessao) md += `session: ${escFront(sessao.slice(0, 12))}\n`;
  md += '---\n\n';
  md += `# ${titulo}\n\n`;
  if (descricao) md += `${descricao}\n\n`;

  for (const [tit, itens] of secoes) {
    if (!itens.length) continue;
    md += `## ${tit}\n\n`;
    for (const b of itens) {
      const clean = scrubPII(String(b).trim());
      if (clean) md += `- ${clean}\n`;
    }
    md += '\n';
  }

  try {
    writeFileSync(path, md);
  } catch (e: any) {
    process.stderr.write('[summarize.ts] falha ao gravar: ' + (e?.message || e) + '\n');
    return '';
  }
  return path;
}

// scrub defensivo: CPF (BR) e sequencias longas de digitos (telefone). Ajuste por projeto.
function scrubPII(s: string): string {
  return s
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF]')
    .replace(/\b\d{11}\b/g, '[CPF]')
    .replace(/(\(?\d{2}\)?\s?)?9?\d{4}[- ]?\d{4}\b/g, '[TEL]');
}

function slug(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function escFront(s: string): string {
  return String(s).replace(/[\r\n]+/g, ' ').replace(/"/g, "'");
}

main().catch((e) => {
  process.stderr.write('[summarize.ts] erro: ' + (e?.message || e) + '\n');
  process.exit(0); // captura e best-effort — nunca quebra o hook
});
