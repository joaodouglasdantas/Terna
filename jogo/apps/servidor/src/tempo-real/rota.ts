import type { FastifyInstance, FastifyRequest } from 'fastify';
import { jogadorDoToken, type JogadorAutenticado } from '../auth/sessoes';
import type { Banco } from '../banco/conexao';
import { Sala } from './sala';

// WebSocket em /api/tempo-real?token=<token da sessão>. A autenticação acontece antes do
// upgrade: sem token válido a conexão nem abre (401).
export function rotaTempoReal(app: FastifyInstance, banco: Banco, sala = new Sala()): Sala {
  const autenticados = new WeakMap<FastifyRequest, JogadorAutenticado>();

  app.get<{ Querystring: { token?: string } }>(
    '/tempo-real',
    {
      websocket: true,
      preValidation: async (request, reply) => {
        const token = request.query.token;
        const jogador = token ? await jogadorDoToken(banco, token) : null;
        if (!jogador) return reply.code(401).send({ erro: 'entre na sua conta para jogar online' });
        autenticados.set(request, jogador);
      },
    },
    (socket, request) => {
      const jogador = autenticados.get(request);
      if (!jogador) return socket.close(4001, 'sem sessão');
      sala.entrar(jogador.id, jogador.nome, socket);
      socket.on('message', (dados) => sala.receber(jogador.id, dados.toString()));
      socket.on('close', () => sala.sair(jogador.id, socket));
    },
  );
  return sala;
}
