import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { apagarSessoesVencidas } from '../src/auth/sessoes';
import { sessoes } from '../src/banco/schema';
import { eq } from 'drizzle-orm';
import type { Banco, ConexaoBanco } from '../src/banco/conexao';
import { criarConta, novoServidor } from './ajuda';

let app: FastifyInstance;
let conexao: ConexaoBanco;
const autorizado = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  ({ app, conexao } = await novoServidor());
});
afterAll(async () => {
  await app.close();
  await conexao.fechar();
});

describe('saúde', () => {
  it('responde com o banco no ar', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/saude' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
  });

  // A checagem de saúde do host bate em /api/vivo o tempo todo: se ela tocasse o banco, o
  // Neon nunca dormiria e as horas grátis dele acabariam no meio do mês.
  it('/api/vivo responde sem tocar no banco', async () => {
    const bancoQueExplode = new Proxy({} as Banco, {
      get() {
        throw new Error('o banco foi usado');
      },
    });
    const semBanco = await criarApp({ banco: bancoQueExplode, origens: [], diasSessao: 30 });
    expect((await semBanco.inject({ method: 'GET', url: '/api/vivo' })).statusCode).toBe(200);
    expect((await semBanco.inject({ method: 'GET', url: '/api/saude' })).statusCode).toBe(500);
    await semBanco.close();
  });
});

describe('contas e sessões', () => {
  it('cria conta, entra e sai', async () => {
    const criada = await app.inject({
      method: 'POST',
      url: '/api/contas',
      payload: { nome: 'Douglas', senha: 'minha-senha-1', email: 'Douglas@Exemplo.com' },
    });
    expect(criada.statusCode).toBe(201);
    expect(criada.json().jogador.nome).toBe('Douglas');

    const eu = await app.inject({ method: 'GET', url: '/api/eu', headers: autorizado(criada.json().token) });
    expect(eu.json().nome).toBe('Douglas');

    // Entra pelo nome (sem diferenciar maiúsculas) ou pelo e-mail.
    for (const login of ['douglas', 'douglas@exemplo.com']) {
      const r = await app.inject({ method: 'POST', url: '/api/sessoes', payload: { login, senha: 'minha-senha-1' } });
      expect(r.statusCode).toBe(200);
    }

    const token = criada.json().token;
    expect((await app.inject({ method: 'DELETE', url: '/api/sessoes', headers: autorizado(token) })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/eu', headers: autorizado(token) })).statusCode).toBe(401);
  });

  it('recusa nome repetido, senha errada e dados inválidos', async () => {
    await criarConta(app, 'repetido');
    const repetido = await app.inject({ method: 'POST', url: '/api/contas', payload: { nome: 'REPETIDO', senha: '12345678' } });
    expect(repetido.statusCode).toBe(409);

    const errada = await app.inject({ method: 'POST', url: '/api/sessoes', payload: { login: 'repetido', senha: 'outra-senha' } });
    expect(errada.statusCode).toBe(401);
    const inexistente = await app.inject({ method: 'POST', url: '/api/sessoes', payload: { login: 'ninguem', senha: 'x' } });
    expect(inexistente.statusCode).toBe(401);
    expect(inexistente.json().erro).toBe(errada.json().erro); // não revela se o nome existe

    const curta = await app.inject({ method: 'POST', url: '/api/contas', payload: { nome: 'novo', senha: '123' } });
    expect(curta.statusCode).toBe(400);
    expect(curta.json().erro).toMatch(/senha/);
  });

  it('apaga sessões vencidas', async () => {
    const token = await criarConta(app, 'vencido');
    const [{ id }] = await conexao.banco.query.jogadores.findMany({ where: (j, { eq }) => eq(j.nome, 'vencido') });
    await conexao.banco.update(sessoes).set({ expiraEm: new Date(Date.now() - 1000) }).where(eq(sessoes.jogadorId, id));
    expect((await app.inject({ method: 'GET', url: '/api/eu', headers: autorizado(token) })).statusCode).toBe(401);
    expect(await apagarSessoesVencidas(conexao.banco)).toBeGreaterThan(0);
    expect(await conexao.banco.query.sessoes.findMany({ where: (s, { eq }) => eq(s.jogadorId, id) })).toHaveLength(0);
  });

  it('não guarda a senha nem o token em texto no banco', async () => {
    const token = await criarConta(app, 'segredo', 'senha-secreta-9');
    const linhas = JSON.stringify(await conexao.banco.query.jogadores.findMany());
    expect(linhas).not.toContain('senha-secreta-9');
    expect(JSON.stringify(await conexao.banco.query.sessoes.findMany())).not.toContain(token);
  });
});

describe('limite de tentativas', () => {
  it('barra quem tenta entrar muitas vezes seguidas', async () => {
    const limitado = await criarApp({ banco: conexao.banco, origens: [], diasSessao: 30, tentativasPorMinuto: 2 });
    const tentar = () => limitado.inject({ method: 'POST', url: '/api/sessoes', payload: { login: 'x', senha: 'y' } });
    expect((await tentar()).statusCode).toBe(401);
    expect((await tentar()).statusCode).toBe(401);
    const barrada = await tentar();
    expect(barrada.statusCode).toBe(429);
    expect(barrada.json().erro).toMatch(/muitas tentativas/);
    await limitado.close();
  });
});

describe('saves', () => {
  it('grava, lê e sobrescreve só o save do próprio jogador', async () => {
    const ana = await criarConta(app, 'ana');
    const beto = await criarConta(app, 'beto');
    const dados = { versao: 1, personagem: { x: 500, direcao: -1 }, tempoDeJogo: 12 };

    expect((await app.inject({ method: 'GET', url: '/api/saves/1', headers: autorizado(ana) })).statusCode).toBe(404);
    const gravado = await app.inject({ method: 'PUT', url: '/api/saves/1', headers: autorizado(ana), payload: dados });
    expect(gravado.statusCode).toBe(200);
    await app.inject({ method: 'PUT', url: '/api/saves/1', headers: autorizado(ana), payload: { ...dados, tempoDeJogo: 99 } });

    const lido = await app.inject({ method: 'GET', url: '/api/saves/1', headers: autorizado(ana) });
    expect(lido.json().dados.tempoDeJogo).toBe(99);
    expect((await app.inject({ method: 'GET', url: '/api/saves/1', headers: autorizado(beto) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/saves', headers: autorizado(ana) })).json()).toHaveLength(1);
  });

  it('recusa slot inexistente, save inválido e quem não entrou', async () => {
    const token = await criarConta(app, 'carla');
    const dados = { versao: 1, personagem: { x: 500, direcao: 1 }, tempoDeJogo: 0 };
    expect((await app.inject({ method: 'PUT', url: '/api/saves/9', headers: autorizado(token), payload: dados })).statusCode).toBe(400);
    expect(
      (await app.inject({ method: 'PUT', url: '/api/saves/1', headers: autorizado(token), payload: { versao: 1 } })).statusCode,
    ).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/saves/1', payload: dados })).statusCode).toBe(401);
  });
});

describe('ranking', () => {
  it('guarda a melhor marca de cada um e ordena', async () => {
    const a = await criarConta(app, 'primeiro');
    const b = await criarConta(app, 'segundo');
    const enviar = (token: string, valor: number) =>
      app.inject({ method: 'POST', url: '/api/ranking', headers: autorizado(token), payload: { categoria: 'fosseis', valor } });
    await enviar(a, 5);
    await enviar(b, 3);
    await enviar(b, 8);
    await enviar(a, 2); // pior que a marca dele: não muda nada

    const r = await app.inject({ method: 'GET', url: '/api/ranking/fosseis' });
    expect(r.json().map((l: { jogador: string; valor: number }) => [l.jogador, l.valor])).toEqual([
      ['segundo', 8],
      ['primeiro', 5],
    ]);
    expect((await app.inject({ method: 'GET', url: '/api/ranking/Nome Ruim' })).statusCode).toBe(400);
  });
});
