import { z } from 'zod';
import { MUNDO } from './mundo';

// Cada jogador tem alguns espaços de save.
export const SLOTS_SAVE = 3;
export const Slot = z.coerce.number().int().min(1).max(SLOTS_SAVE);

// O conteúdo do save. Ao mudar o formato, crie a versão 2 aqui (sem apagar a 1) e ensine
// `atualizarSave` a converter; saves antigos continuam abrindo.
export const DadosSaveV1 = z.object({
  versao: z.literal(1),
  personagem: z.object({
    x: z.number().min(0).max(MUNDO),
    direcao: z.union([z.literal(1), z.literal(-1)]),
  }),
  tempoDeJogo: z.number().min(0), // segundos
});
export type DadosSaveV1 = z.infer<typeof DadosSaveV1>;

export const DadosSave = DadosSaveV1;
export type DadosSave = DadosSaveV1;

export function atualizarSave(dados: unknown): DadosSave {
  return DadosSave.parse(dados);
}

export const Save = z.object({
  slot: z.number().int(),
  dados: DadosSave,
  atualizadoEm: z.string(),
});
export type Save = z.infer<typeof Save>;
