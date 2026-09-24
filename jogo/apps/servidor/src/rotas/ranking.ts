import { Categoria, EnviarPontuacao } from '@terna/compartilhado';
import { desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Banco } from '../banco/conexao';
import { jogadores, recordes } from '../banco/schema';
import { exigirJogador, validar } from '../http';

const TAMANHO_RANKING = 50;

export function rotasRanking(app: FastifyInstance, banco: Banco): void {
  app.get<{ Params: { categoria: string } }>('/ranking/:categoria', async (request, reply) => {
    const categoria = validar(Categoria, request.params.categoria, reply);
    if (!categoria) return;
    const linhas = await banco
      .select({ jogador: jogadores.nome, valor: recordes.valor, em: recordes.atualizadoEm })
      .from(recordes)
      .innerJoin(jogadores, eq(jogadores.id, recordes.jogadorId))
      .where(eq(recordes.categoria, categoria))
      .orderBy(desc(recordes.valor), recordes.atualizadoEm)
      .limit(TAMANHO_RANKING);
    return reply.send(linhas.map((l, i) => ({ posicao: i + 1, jogador: l.jogador, valor: l.valor, em: l.em.toISOString() })));
  });

  // Guarda só a melhor marca de cada jogador. Atenção: por enquanto o valor vem do cliente;
  // quando o ranking valer algo, o servidor deve calcular a pontuação ele mesmo.
  app.post('/ranking', async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    const dados = validar(EnviarPontuacao, request.body, reply);
    if (!dados) return;
    await banco
      .insert(recordes)
      .values({ jogadorId: jogador.id, categoria: dados.categoria, valor: dados.valor })
      .onConflictDoUpdate({
        target: [recordes.jogadorId, recordes.categoria],
        set: { valor: sql`greatest(${recordes.valor}, excluded.valor)`, atualizadoEm: sql`case when excluded.valor > ${recordes.valor} then now() else ${recordes.atualizadoEm} end` },
      });
    return reply.code(204).send();
  });
}
