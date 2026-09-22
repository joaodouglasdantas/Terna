// .claude/scripts/paths.ts
// Localizacoes e config compartilhadas do RAG. Resolve a raiz do projeto de forma
// robusta (env HARNESS_RAG_PROJECT_ROOT, senao sobe a partir do cwd ate achar .claude/),
// para funcionar tanto via `npm run rag:*` (cwd = raiz) quanto via hooks.
// Todos os caminhos tem default portavel; env vars sao apenas override por maquina.

import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

function findProjectRoot(): string {
  const envRoot = process.env.HARNESS_RAG_PROJECT_ROOT;
  if (envRoot && existsSync(join(envRoot, '.claude'))) return resolve(envRoot);
  let dir = process.cwd();
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, '.claude'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export const PROJECT_ROOT = findProjectRoot();

// Derivado por maquina (gitignored) — reconstruivel via reindex.
export const RAG_DIR = process.env.HARNESS_RAG_DIR || join(PROJECT_ROOT, '.claude', 'rag');
export const DB_PATH = process.env.HARNESS_RAG_DB || join(RAG_DIR, 'rag.db');
export const MODEL_CACHE = process.env.HARNESS_RAG_MODEL_CACHE || join(RAG_DIR, 'model-cache');

// Fontes de conhecimento (versionadas, viajam no git).
export const KNOWLEDGE_DIR = process.env.HARNESS_RAG_KNOWLEDGE_DIR || join(PROJECT_ROOT, '.claude', 'knowledge');
export const MEMORY_DIR = join(PROJECT_ROOT, '.claude', 'memory');
export const DT_DIR = join(PROJECT_ROOT, 'prds', 'debito_tecnico');

// Modelo de embedding local (offline apos 1o download).
export const MODEL = process.env.HARNESS_RAG_MODEL || 'Xenova/all-MiniLM-L6-v2';
export const EMBED_DIM = 384; // all-MiniLM-L6-v2

export const TOPK = parseInt(process.env.HARNESS_RAG_TOPK || '3', 10) || 3;
