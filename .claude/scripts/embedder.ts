// .claude/scripts/embedder.ts
// Embeddings 100% LOCAIS via all-MiniLM-L6-v2 (ONNX, @huggingface/transformers).
// Nenhum dado sai da maquina. Modelo cacheado em .claude/rag/model-cache (gitignored);
// baixa ~90MB no 1o uso e roda offline depois. Import dinamico porque o pacote e ESM-only.

import { MODEL, MODEL_CACHE } from './paths';

let extractorPromise: Promise<any> | null = null;

async function getExtractor(): Promise<any> {
  if (!extractorPromise) {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = MODEL_CACHE;
    env.allowRemoteModels = true; // permite o 1o download; depois usa cache
    extractorPromise = pipeline('feature-extraction', MODEL);
  }
  return extractorPromise;
}

// all-MiniLM-L6-v2 trunca em 256 tokens (~1000-1200 chars). Cortamos antes para
// nao desperdiciar — o chunker ja entrega blocos pequenos, isto e so um teto de seguranca.
const MAX_INPUT_CHARS = 1200;

/** Vetor normalizado de 384 dims (mean pooling). */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const clean = (text || '').slice(0, MAX_INPUT_CHARS);
  const out = await extractor(clean, { pooling: 'mean', normalize: true });
  return Array.from(out.data as Float32Array);
}

/** Pre-carrega o modelo (usado para medir/aquecer). */
export async function warmup(): Promise<void> {
  await getExtractor();
}
