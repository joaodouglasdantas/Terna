import { z } from 'zod';
import { MUNDO } from './mundo';

// Mensagens de tempo real (WebSocket em /api/tempo-real?token=...). Todas são JSON com
// um campo `tipo`. O servidor valida tudo o que chega; o cliente valida o que recebe.

const Posicao = {
  x: z.number().min(0).max(MUNDO),
  y: z.number().min(-1000).max(1000),
  direcao: z.union([z.literal(1), z.literal(-1)]),
  animacao: z.string().max(20),
};

export const MensagemDoCliente = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('posicao'), ...Posicao }),
  z.object({ tipo: z.literal('ping'), t: z.number() }),
]);
export type MensagemDoCliente = z.infer<typeof MensagemDoCliente>;

export const JogadorNoMundo = z.object({
  id: z.string(),
  nome: z.string(),
  ...Posicao,
});
export type JogadorNoMundo = z.infer<typeof JogadorNoMundo>;

export const MensagemDoServidor = z.discriminatedUnion('tipo', [
  // Ao conectar: quem você é e quem já está no mundo.
  z.object({ tipo: z.literal('bem-vindo'), id: z.string(), jogadores: z.array(JogadorNoMundo) }),
  z.object({ tipo: z.literal('entrou'), jogador: JogadorNoMundo }),
  z.object({ tipo: z.literal('saiu'), id: z.string() }),
  z.object({ tipo: z.literal('posicao'), id: z.string(), ...Posicao }),
  z.object({ tipo: z.literal('pong'), t: z.number() }),
  z.object({ tipo: z.literal('erro'), erro: z.string() }),
]);
export type MensagemDoServidor = z.infer<typeof MensagemDoServidor>;
