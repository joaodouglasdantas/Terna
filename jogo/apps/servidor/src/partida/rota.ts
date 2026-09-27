import { IdDaAba, PedidoPartida, type PartidaNaRede } from '@terna/compartilhado';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ipDoPedido } from '../http';
import { vigiarConexao } from './batimento';
import { redeDoEndereco } from './rede';
import { Salas } from './salas';

// WebSocket da partida 1v1, sem conta:
//   /api/partida?acao=criar&nome=Ana              → recebe `sala-criada` com o código (internet)
//   /api/partida?acao=hospedar&nome=Ana           → o mesmo, mas a partida aparece para quem
//                                                   está na mesma rede (GET /api/partida/rede)
//   /api/partida?acao=entrar&codigo=K7P2Q&nome=Bia → a partida começa para os dois
// O pedido é validado antes do upgrade: nome ou código inválido nem abre a conexão (400). Cada
// conexão aberta ganha o batimento (batimento.ts): mede o atraso dela e derruba a que morreu.
export function rotaPartida(
  app: FastifyInstance,
  { salas = new Salas(), confiarProxy = false }: { salas?: Salas; confiarProxy?: boolean } = {},
): Salas {
  const pedidos = new WeakMap<FastifyRequest, PedidoPartida>();
  const redeDe = (request: FastifyRequest): string => redeDoEndereco(ipDoPedido(request, confiarProxy));

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
        pedido.acao === 'criar'
          ? salas.criar(pedido.nome, socket)
          : pedido.acao === 'hospedar'
            ? salas.criar(pedido.nome, socket, redeDe(request), pedido.eu ?? null)
            : salas.entrar(pedido.codigo, pedido.nome, socket, redeDe(request));
      if (!participante) return;
      const parar = vigiarConexao(socket, (idaEVoltaMs) => salas.medirPing(participante, idaEVoltaMs));
      socket.on('message', (dados) => salas.receber(participante, dados.toString()));
      socket.on('close', () => {
        parar();
        salas.sair(participante);
      });
    },
  );

  // As partidas hospedadas na rede de quem pergunta (menos as da própria aba: `?eu=`). A tela da
  // rede pergunta a cada ~2,5 s, e todo mundo da rede conta como um endereço só: a folga é para
  // uns poucos procurando juntos.
  app.get('/partida/rede', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request): Promise<{ partidas: PartidaNaRede[] }> => {
    const eu = IdDaAba.safeParse((request.query as { eu?: unknown }).eu);
    return { partidas: salas.naRede(redeDe(request), eu.success ? eu.data : undefined) };
  });
  return salas;
}
