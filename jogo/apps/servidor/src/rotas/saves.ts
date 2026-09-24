import { DadosSave, Slot } from '@terna/compartilhado';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Banco } from '../banco/conexao';
import { saves } from '../banco/schema';
import { exigirJogador, validar } from '../http';

const formatar = (s: typeof saves.$inferSelect) => ({ slot: s.slot, dados: s.dados, atualizadoEm: s.atualizadoEm.toISOString() });

export function rotasSaves(app: FastifyInstance, banco: Banco): void {
  app.get('/saves', async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    const lista = await banco.select().from(saves).where(eq(saves.jogadorId, jogador.id)).orderBy(asc(saves.slot));
    return reply.send(lista.map(formatar));
  });

  app.get<{ Params: { slot: string } }>('/saves/:slot', async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    const slot = validar(Slot, request.params.slot, reply);
    if (slot === null) return;
    const [save] = await banco
      .select()
      .from(saves)
      .where(and(eq(saves.jogadorId, jogador.id), eq(saves.slot, slot)));
    if (!save) return reply.code(404).send({ erro: 'esse espaço de save está vazio' });
    return reply.send(formatar(save));
  });

  app.put<{ Params: { slot: string } }>('/saves/:slot', async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    const slot = validar(Slot, request.params.slot, reply);
    if (slot === null) return;
    const dados = validar(DadosSave, request.body, reply);
    if (!dados) return;
    const agora = new Date();
    const [save] = await banco
      .insert(saves)
      .values({ jogadorId: jogador.id, slot, versao: dados.versao, dados, atualizadoEm: agora })
      .onConflictDoUpdate({ target: [saves.jogadorId, saves.slot], set: { versao: dados.versao, dados, atualizadoEm: agora } })
      .returning();
    return reply.send(formatar(save));
  });
}
