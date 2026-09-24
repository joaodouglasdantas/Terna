import { z } from 'zod';

// Um ranking por categoria (ex.: "fosseis-achados", "maior-pulo"). A categoria é livre
// para o jogo poder criar rankings novos sem mexer no banco.
export const Categoria = z.string().regex(/^[a-z0-9-]{1,40}$/, 'categoria: minúsculas, números e -');

export const EnviarPontuacao = z.object({
  categoria: Categoria,
  valor: z.number().int().min(0).max(1_000_000_000),
});
export type EnviarPontuacao = z.infer<typeof EnviarPontuacao>;

export const LinhaRanking = z.object({
  posicao: z.number().int(),
  jogador: z.string(),
  valor: z.number().int(),
  em: z.string(),
});
export type LinhaRanking = z.infer<typeof LinhaRanking>;
