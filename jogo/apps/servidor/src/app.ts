import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Banco } from './banco/conexao';
import { correioDoTerminal, type Correio } from './email/correio';
import { ipDoPedido } from './http';
import { rotaPartida } from './partida/rota';
import { Salas } from './partida/salas';
import type { Turn } from './partida/turn';
import { rotasContas } from './rotas/contas';
import { rotasProgresso } from './rotas/progresso';
import { rotasRanking } from './rotas/ranking';
import { rotasSaves } from './rotas/saves';
import { rotaTempoReal } from './tempo-real/rota';

export interface OpcoesApp {
  banco: Banco;
  origens: string[];
  diasSessao: number;
  confiarProxy?: boolean;
  // Tentativas de criar conta / entrar por minuto, por IP.
  tentativasPorMinuto?: number;
  logger?: FastifyServerOptions['logger'];
  // O TURN do Cloudflare (partida/turn.ts), para as partidas online; sem ele, só o STUN.
  turn?: Turn;
  // Quem manda os e-mails dos códigos (email/correio.ts); sem ele, o terminal.
  correio?: Correio;
  // O jogo publicado, para a logo dos e-mails.
  urlDoJogo?: string;
  // As contas mestre e a rota que mostra o código no jogo em casa (rotas/contas.ts).
  mestres?: ReadonlySet<string>;
  codigosNaTela?: boolean;
}

// Monta o servidor sem abrir porta: o index.ts chama listen, os testes usam inject.
export async function criarApp({
  banco,
  origens,
  diasSessao,
  confiarProxy = false,
  tentativasPorMinuto = 10,
  logger = false,
  turn,
  correio,
  urlDoJogo = 'https://terna.pages.dev',
  mestres,
  codigosNaTela = false,
}: OpcoesApp): Promise<FastifyInstance> {
  const app = Fastify({ logger, bodyLimit: 256 * 1024, trustProxy: confiarProxy });

  // Os métodos precisam ser listados: o padrão do @fastify/cors é só GET, HEAD e POST, e o
  // jogo publicado em outro endereço não conseguiria gravar save (PUT) nem sair (DELETE).
  await app.register(cors, { origin: origens, methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'] });
  // O limite de tentativas é por IP (ipDoPedido: o de verdade, mesmo atrás do proxy).
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => ipDoPedido(request, confiarProxy),
    // Vira um erro lançado; o setErrorHandler abaixo responde { erro: message }.
    errorResponseBuilder: (_request, contexto) => ({
      statusCode: 429,
      message: `muitas tentativas; tente de novo em ${Math.ceil(contexto.ttl / 1000)} segundos`,
    }),
  });
  await app.register(websocket, { options: { maxPayload: 4 * 1024 } });

  app.setErrorHandler((erro: { statusCode?: number; message?: string }, request, reply) => {
    const status = erro.statusCode ?? 500;
    if (status >= 500) request.log.error(erro);
    return reply.code(status).send({ erro: status >= 500 ? 'erro interno do servidor' : (erro.message ?? 'erro') });
  });

  await app.register(
    async (api) => {
      // Só diz que o processo está de pé, SEM tocar no banco: é a rota da checagem de saúde
      // do host e a que o jogo chama para acordar o servidor. Se ela consultasse o banco,
      // o Neon nunca dormiria e as horas grátis dele acabariam no meio do mês.
      api.get('/vivo', async () => ({ ok: true }));

      // Esta consulta o banco: use para diagnóstico manual, não para monitoramento automático.
      api.get('/saude', async () => {
        await banco.execute(sql`select 1`);
        return { ok: true };
      });
      rotasContas(api, banco, {
        diasSessao,
        tentativasPorMinuto,
        correio: correio ?? correioDoTerminal(),
        urlDoJogo,
        mestres,
        codigosNaTela,
      });
      rotasProgresso(api, banco, mestres);
      rotasSaves(api, banco);
      rotasRanking(api, banco);
      rotaTempoReal(api, banco);
      rotaPartida(api, { confiarProxy, salas: new Salas(turn ? { ice: turn.servidores } : {}) });
    },
    { prefix: '/api' },
  );

  return app;
}
