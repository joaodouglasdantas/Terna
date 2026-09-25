import { PedidoPartida } from '@terna/compartilhado';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Salas } from './salas';

// WebSocket da partida 1v1, sem conta:
//   /api/partida?acao=criar&nome=Ana              → recebe `sala-criada` com o código
//   /api/partida?acao=entrar&codigo=K7P2Q&nome=Bia → a partida começa para os dois
// O pedido é validado antes do upgrade: nome ou código inválido nem abre a conexão (400).
export function rotaPartida(app: FastifyInstance, salas = new Salas()): Salas {
  const pedidos = new WeakMap<FastifyRequest, PedidoPartida>();

  app.get(
    '/partida',
    {
      websocket: true,
      // Criar e entrar em salas: 30 por minuto por endereço.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      preValidation: async (request, reply) => {
        const pedido = PedidoPartida.safeParse(request.query);
        if (!pedido.success) return reply.code(400).send({ erro: pedido.error.issues[0]?.message ?? 'pedido inválido' });
        pedidos.set(request, pedido.data);
      },
    },
    (socket, request) => {
      const pedido = pedidos.get(request);
      if (!pedido) return socket.close(4000, 'pedido inválido');
      const participante =
        pedido.acao === 'criar' ? salas.criar(pedido.nome, socket) : salas.entrar(pedido.codigo, pedido.nome, socket);
      if (!participante) return;
      socket.on('message', (dados) => salas.receber(participante, dados.toString()));
      socket.on('close', () => salas.sair(participante));
    },
  );
  return salas;
}
