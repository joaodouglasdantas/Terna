// Checagens de saúde do servidor e do banco, usadas pela tela de carregamento.

import { BASE_API } from './endereco';

export type ResultadoChecagem = { ok: true } | { ok: false; motivo: string };

// O servidor grátis dorme e leva até ~1 min para acordar: cada tentativa espera pouco e
// repete, até estourar `limiteMs`. `aoTentar` avisa a tela de quantas tentativas já foram.
async function chamar(caminho: string, limiteMs: number, aoTentar?: (tentativa: number) => void): Promise<ResultadoChecagem> {
  const inicio = Date.now();
  let tentativa = 0;
  let motivo = 'sem resposta';
  while (Date.now() - inicio < limiteMs) {
    aoTentar?.(++tentativa);
    try {
      const resposta = await fetch(BASE_API + caminho, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (resposta.ok) return { ok: true };
      // 5xx com o servidor de pé: o problema não é acordar, então não adianta insistir.
      return { ok: false, motivo: `respondeu erro ${resposta.status}` };
    } catch {
      motivo = 'sem resposta';
      await new Promise((resolver) => setTimeout(resolver, 1500));
    }
  }
  return { ok: false, motivo };
}

// O processo do servidor está de pé (não toca no banco).
export const checarServidor = (aoTentar?: (tentativa: number) => void): Promise<ResultadoChecagem> =>
  chamar('/vivo', 90_000, aoTentar);

// O banco responde a uma consulta. Só faz sentido depois de `checarServidor` dar certo.
// O banco grátis também dorme, então dá mais tempo antes de desistir.
export const checarBanco = (aoTentar?: (tentativa: number) => void): Promise<ResultadoChecagem> =>
  chamar('/saude', 40_000, aoTentar);
