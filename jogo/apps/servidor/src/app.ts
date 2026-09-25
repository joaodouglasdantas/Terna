import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Banco } from './banco/conexao';
import { rotaPartida } from './partida/rota';
import { rotasContas } from './rotas/contas';
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
}

// Monta o servidor sem abrir porta: o index.ts chama listen, os testes usam inject.
export async function criarApp({
  banco,
  origens,
  diasSessao,
  confiarProxy = false,
  tentativasPorMinuto = 10,
  logger = false,
}: OpcoesApp): Promise<FastifyInstance> {
  const app = Fastify({ logger, bodyLimit: 256 * 1024, trustProxy: confiarProxy });

  // Os métodos precisam ser listados: o padrão do @fastify/cors é só GET, HEAD e POST, e o
  // jogo publicado em outro endereço não conseguiria gravar save (PUT) nem sair (DELETE).
  await app.register(cors, { origin: origens, methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'] });
  // O limite de tentativas é por IP. Atrás de proxy, o Render acrescenta o IP real ao fim do
  // X-Forwarded-For mas mantém o que o cliente mandou no começo; o CF-Connecting-IP vem da
  // borda do Cloudflare (por onde o Render recebe o tráfego) e não pode ser forjado.
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => {
      const borda = confiarProxy ? request.headers['cf-connecting-ip'] : undefined;
      return typeof borda === 'string' && borda ? borda : request.ip;
    },
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
      rotasContas(api, banco, diasSessao, tentativasPorMinuto);
      rotasSaves(api, banco);
      rotasRanking(api, banco);
      rotaTempoReal(api, banco);
      rotaPartida(api);
    },
    { prefix: '/api' },
  );

  return app;
}
