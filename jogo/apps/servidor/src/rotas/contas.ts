import { CriarConta, Entrar } from '@terna/compartilhado';
import { eq, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { conferirSenha, gastarTempoComoSeConferisse, gerarHashSenha } from '../auth/senha';
import { criarSessao, encerrarSessao, tokenDoCabecalho } from '../auth/sessoes';
import type { Banco } from '../banco/conexao';
import { jogadores } from '../banco/schema';
import { exigirJogador, jogadorPublico, validar } from '../http';

// Poucas tentativas por minuto em criar conta e entrar: segura quem tenta adivinhar senha.
export function rotasContas(app: FastifyInstance, banco: Banco, diasSessao: number, tentativasPorMinuto: number): void {
  const LIMITE = { config: { rateLimit: { max: tentativasPorMinuto, timeWindow: '1 minute' } } };

  app.post('/contas', LIMITE, async (request, reply) => {
    const dados = validar(CriarConta, request.body, reply);
    if (!dados) return;
    const nomeNormalizado = dados.nome.toLowerCase();
    const email = dados.email?.toLowerCase() ?? null;

    const conflito = await banco
      .select({ nome: jogadores.nomeNormalizado, email: jogadores.email })
      .from(jogadores)
      .where(email ? or(eq(jogadores.nomeNormalizado, nomeNormalizado), eq(jogadores.email, email)) : eq(jogadores.nomeNormalizado, nomeNormalizado));
    if (conflito.some((c) => c.nome === nomeNormalizado)) return reply.code(409).send({ erro: 'esse nome já está em uso' });
    if (conflito.length) return reply.code(409).send({ erro: 'esse e-mail já tem conta' });

    const [jogador] = await banco
      .insert(jogadores)
      .values({ nome: dados.nome, nomeNormalizado, email, senhaHash: await gerarHashSenha(dados.senha) })
      .returning();
    const sessao = await criarSessao(banco, jogador.id, diasSessao);
    return reply.code(201).send({ token: sessao.token, expiraEm: sessao.expiraEm.toISOString(), jogador: jogadorPublico(jogador) });
  });

  app.post('/sessoes', LIMITE, async (request, reply) => {
    const dados = validar(Entrar, request.body, reply);
    if (!dados) return;
    const login = dados.login.toLowerCase();
    const [jogador] = await banco
      .select()
      .from(jogadores)
      .where(or(eq(jogadores.nomeNormalizado, login), eq(jogadores.email, login)))
      .limit(1);
    if (!jogador) {
      await gastarTempoComoSeConferisse(dados.senha);
      return reply.code(401).send({ erro: 'nome ou senha incorretos' });
    }
    if (!(await conferirSenha(dados.senha, jogador.senhaHash))) {
      return reply.code(401).send({ erro: 'nome ou senha incorretos' });
    }
    const sessao = await criarSessao(banco, jogador.id, diasSessao);
    return reply.send({ token: sessao.token, expiraEm: sessao.expiraEm.toISOString(), jogador: jogadorPublico(jogador) });
  });

  app.delete('/sessoes', async (request, reply) => {
    const token = tokenDoCabecalho(request.headers.authorization);
    if (token) await encerrarSessao(banco, token);
    return reply.code(204).send();
  });

  app.get('/eu', async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    return reply.send(jogadorPublico(jogador));
  });
}
