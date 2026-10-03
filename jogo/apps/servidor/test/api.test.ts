import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { ERRO_EMAIL_NAO_CONFIRMADO } from '@terna/compartilhado';
import { apagarCodigosEcadastrosVencidos } from '../src/auth/codigos';
import { apagarSessoesVencidas } from '../src/auth/sessoes';
import { codigosEmail, jogadores, sessoes } from '../src/banco/schema';
import { eq } from 'drizzle-orm';
import type { Banco, ConexaoBanco } from '../src/banco/conexao';
import { criarConta, emailDe, novoServidor, type CorreioDeTeste } from './ajuda';

let app: FastifyInstance;
let conexao: ConexaoBanco;
let correio: CorreioDeTeste;
const autorizado = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  ({ app, conexao, correio } = await novoServidor());
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
  it('cadastra, confirma o e-mail com o código, entra e sai', async () => {
    const cadastro = await app.inject({
      method: 'POST',
      url: '/api/contas',
      payload: { nome: 'Douglas', senha: 'minha-senha-1', email: 'Douglas@Exemplo.com' },
    });
    expect(cadastro.statusCode).toBe(201);
    expect(cadastro.json()).toEqual({ email: 'douglas@exemplo.com', reenviarEm: 60 });

    // O e-mail chegou, bonito e com o código no texto e no HTML.
    const mensagem = correio.caixa.findLast((m) => m.para === 'douglas@exemplo.com');
    expect(mensagem?.assunto).toMatch(/código/i);
    const codigo = correio.ultimoCodigo('douglas@exemplo.com');
    expect(mensagem?.html).toContain('Douglas');
    expect(mensagem?.html).toContain(`>${codigo[0]}</td>`);

    // Sem confirmar, a senha certa não entra: manda para a tela do código.
    const antes = await app.inject({ method: 'POST', url: '/api/sessoes', payload: { login: 'douglas@exemplo.com', senha: 'minha-senha-1' } });
    expect(antes.statusCode).toBe(403);
    expect(antes.json().erro).toBe(ERRO_EMAIL_NAO_CONFIRMADO);

    const confirmada = await app.inject({ method: 'POST', url: '/api/contas/confirmar', payload: { email: 'douglas@exemplo.com', codigo } });
    expect(confirmada.statusCode).toBe(200);
    expect(confirmada.json().jogador.nome).toBe('Douglas');
    const token = confirmada.json().token;

    const eu = await app.inject({ method: 'GET', url: '/api/eu', headers: autorizado(token) });
    expect(eu.json().nome).toBe('Douglas');

    // Entra pelo e-mail ou pelo nome (sem diferenciar maiúsculas).
    for (const login of ['douglas@exemplo.com', 'DOUGLAS']) {
      const r = await app.inject({ method: 'POST', url: '/api/sessoes', payload: { login, senha: 'minha-senha-1' } });
      expect(r.statusCode).toBe(200);
    }

    expect((await app.inject({ method: 'DELETE', url: '/api/sessoes', headers: autorizado(token) })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/eu', headers: autorizado(token) })).statusCode).toBe(401);
  });

  it('recusa nome repetido, e-mail que já tem conta, senha errada e dados inválidos', async () => {
    await criarConta(app, 'repetido');
    const nomeRepetido = await app.inject({
      method: 'POST',
      url: '/api/contas',
      payload: { nome: 'REPETIDO', email: 'outro@exemplo.com', senha: '12345678' },
    });
    expect(nomeRepetido.statusCode).toBe(409);
    expect(nomeRepetido.json().erro).toMatch(/nome/);
    const emailRepetido = await app.inject({
      method: 'POST',
      url: '/api/contas',
      payload: { nome: 'outronome', email: emailDe('repetido'), senha: '12345678' },
    });
    expect(emailRepetido.statusCode).toBe(409);
    expect(emailRepetido.json().erro).toMatch(/e-mail/);

    const errada = await app.inject({ method: 'POST', url: '/api/sessoes', payload: { login: emailDe('repetido'), senha: 'outra-senha' } });
    expect(errada.statusCode).toBe(401);
    const inexistente = await app.inject({ method: 'POST', url: '/api/sessoes', payload: { login: 'ninguem@exemplo.com', senha: 'x' } });
    expect(inexistente.statusCode).toBe(401);
    expect(inexistente.json().erro).toBe(errada.json().erro); // não revela se o e-mail existe

    const curta = await app.inject({ method: 'POST', url: '/api/contas', payload: { nome: 'novo', email: 'novo@exemplo.com', senha: '123' } });
    expect(curta.statusCode).toBe(400);
    expect(curta.json().erro).toMatch(/senha/);
    const semEmail = await app.inject({ method: 'POST', url: '/api/contas', payload: { nome: 'novo', senha: '12345678' } });
    expect(semEmail.statusCode).toBe(400);
  });

  it('código errado conta tentativa; errando demais, precisa pedir outro', async () => {
    const email = 'teimoso@exemplo.com';
    await app.inject({ method: 'POST', url: '/api/contas', payload: { nome: 'teimoso', email, senha: 'senha-boa-123' } });
    const certo = correio.ultimoCodigo(email);
    const errado = certo === '000000' ? '111111' : '000000';
    const tentar = (codigo: string) => app.inject({ method: 'POST', url: '/api/contas/confirmar', payload: { email, codigo } });
    for (let i = 0; i < 4; i++) {
      const r = await tentar(errado);
      expect(r.statusCode).toBe(400);
      expect(r.json().erro).toMatch(/errado/);
    }
    expect((await tentar(errado)).json().erro).toMatch(/tentativas demais/);
    // Nem o certo serve mais: o código foi apagado.
    expect((await tentar(certo)).json().erro).toMatch(/peça um código novo/);
  });

  it('código vencido não confirma', async () => {
    const email = 'atrasado@exemplo.com';
    await app.inject({ method: 'POST', url: '/api/contas', payload: { nome: 'atrasado', email, senha: 'senha-boa-123' } });
    const codigo = correio.ultimoCodigo(email);
    await conexao.banco.update(codigosEmail).set({ expiraEm: new Date(Date.now() - 1000) });
    const r = await app.inject({ method: 'POST', url: '/api/contas/confirmar', payload: { email, codigo } });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro).toMatch(/venceu/);
  });

  it('reenviar espera um minuto entre um código e outro', async () => {
    const email = 'apressado@exemplo.com';
    await app.inject({ method: 'POST', url: '/api/contas', payload: { nome: 'apressado', email, senha: 'senha-boa-123' } });
    const enviados = () => correio.caixa.filter((m) => m.para === email).length;
    expect(enviados()).toBe(1);
    const cedo = await app.inject({ method: 'POST', url: '/api/contas/reenviar', payload: { email } });
    expect(cedo.statusCode).toBe(200);
    expect(cedo.json().reenviarEm).toBeGreaterThan(50);
    expect(enviados()).toBe(1); // ainda vale o de antes: nada novo

    // Passou o minuto: sai outro código, e o de antes deixa de valer.
    const primeiro = correio.ultimoCodigo(email);
    await conexao.banco.update(codigosEmail).set({ criadoEm: new Date(Date.now() - 61_000) });
    const depois = await app.inject({ method: 'POST', url: '/api/contas/reenviar', payload: { email } });
    expect(depois.json().reenviarEm).toBe(60);
    expect(enviados()).toBe(2);
    const segundo = correio.ultimoCodigo(email);
    if (primeiro !== segundo) {
      const velho = await app.inject({ method: 'POST', url: '/api/contas/confirmar', payload: { email, codigo: primeiro } });
      expect(velho.statusCode).toBe(400);
    }
    const novo = await app.inject({ method: 'POST', url: '/api/contas/confirmar', payload: { email, codigo: segundo } });
    expect(novo.statusCode).toBe(200);
  });

  it('cadastrar de novo sem ter confirmado atualiza o cadastro que esperava', async () => {
    const email = 'indeciso@exemplo.com';
    await app.inject({ method: 'POST', url: '/api/contas', payload: { nome: 'indeciso', email, senha: 'primeira-senha' } });
    await conexao.banco.update(codigosEmail).set({ criadoEm: new Date(Date.now() - 61_000) });
    const deNovo = await app.inject({ method: 'POST', url: '/api/contas', payload: { nome: 'decidido', email, senha: 'segunda-senha' } });
    expect(deNovo.statusCode).toBe(201);
    const confirmada = await app.inject({ method: 'POST', url: '/api/contas/confirmar', payload: { email, codigo: correio.ultimoCodigo(email) } });
    expect(confirmada.json().jogador.nome).toBe('decidido');
    const entrar = (senha: string) => app.inject({ method: 'POST', url: '/api/sessoes', payload: { login: email, senha } });
    expect((await entrar('primeira-senha')).statusCode).toBe(401);
    expect((await entrar('segunda-senha')).statusCode).toBe(200);
  });

  it('esqueci a senha: o código troca a senha e derruba as outras sessões', async () => {
    const tokenAntigo = await criarConta(app, 'esquecido', 'senha-velha-1');
    const email = emailDe('esquecido');
    const pedido = await app.inject({ method: 'POST', url: '/api/senha/esqueci', payload: { email } });
    expect(pedido.statusCode).toBe(200);
    const mensagem = correio.caixa.findLast((m) => m.para === email);
    expect(mensagem?.assunto).toMatch(/senha/i);
    const codigo = correio.ultimoCodigo(email);

    // O código do cadastro não serve para a senha (e vice-versa).
    const troca = await app.inject({ method: 'POST', url: '/api/senha/trocar', payload: { email, codigo, senha: 'senha-nova-2' } });
    expect(troca.statusCode).toBe(200);
    expect(troca.json().jogador.nome).toBe('esquecido');
    expect((await app.inject({ method: 'GET', url: '/api/eu', headers: autorizado(tokenAntigo) })).statusCode).toBe(401);
    const entrar = (senha: string) => app.inject({ method: 'POST', url: '/api/sessoes', payload: { login: email, senha } });
    expect((await entrar('senha-velha-1')).statusCode).toBe(401);
    expect((await entrar('senha-nova-2')).statusCode).toBe(200);

    // O mesmo código não serve duas vezes.
    const deNovo = await app.inject({ method: 'POST', url: '/api/senha/trocar', payload: { email, codigo, senha: 'outra-senha-3' } });
    expect(deNovo.statusCode).toBe(400);
  });

  it('esqueci a senha responde igual para e-mail sem conta (e não manda nada)', async () => {
    const antes = correio.caixa.length;
    const r = await app.inject({ method: 'POST', url: '/api/senha/esqueci', payload: { email: 'fantasma@exemplo.com' } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ email: 'fantasma@exemplo.com', reenviarEm: 60 });
    expect(correio.caixa.length).toBe(antes);
  });

  it('o e-mail não saindo, avisa e deixa pedir outro na hora', async () => {
    const quebrado = await criarApp({
      banco: conexao.banco,
      origens: [],
      diasSessao: 30,
      tentativasPorMinuto: 1000,
      correio: {
        tipo: 'teste',
        enviar: async () => {
          throw new Error('caixa postal fechada');
        },
      },
    });
    const email = 'semsorte@exemplo.com';
    const r = await quebrado.inject({ method: 'POST', url: '/api/contas', payload: { nome: 'semsorte', email, senha: 'senha-boa-123' } });
    expect(r.statusCode).toBe(502);
    expect(r.json().erro).toMatch(/e-mail/);
    await quebrado.close();
    // Com o correio de volta, o reenvio sai sem esperar o minuto.
    const reenvio = await app.inject({ method: 'POST', url: '/api/contas/reenviar', payload: { email } });
    expect(reenvio.json().reenviarEm).toBe(60);
    expect(correio.ultimoCodigo(email)).toMatch(/^\d{6}$/);
  });

  it('apaga sessões vencidas', async () => {
    const token = await criarConta(app, 'vencido');
    const [{ id }] = await conexao.banco.query.jogadores.findMany({ where: (j, { eq }) => eq(j.nome, 'vencido') });
    await conexao.banco.update(sessoes).set({ expiraEm: new Date(Date.now() - 1000) }).where(eq(sessoes.jogadorId, id));
    expect((await app.inject({ method: 'GET', url: '/api/eu', headers: autorizado(token) })).statusCode).toBe(401);
    expect(await apagarSessoesVencidas(conexao.banco)).toBeGreaterThan(0);
    expect(await conexao.banco.query.sessoes.findMany({ where: (s, { eq }) => eq(s.jogadorId, id) })).toHaveLength(0);
  });

  it('apaga cadastros que nunca confirmaram o e-mail depois de uma semana', async () => {
    await app.inject({ method: 'POST', url: '/api/contas', payload: { nome: 'sumido', email: 'sumido@exemplo.com', senha: 'senha-boa-123' } });
    await criarConta(app, 'firme');
    const oitoDias = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await conexao.banco.update(jogadores).set({ criadoEm: oitoDias });
    await apagarCodigosEcadastrosVencidos(conexao.banco);
    const nomes = (await conexao.banco.query.jogadores.findMany()).map((j) => j.nome);
    expect(nomes).not.toContain('sumido');
    expect(nomes).toContain('firme');
  });

  it('não guarda a senha, o token nem o código em texto no banco', async () => {
    const token = await criarConta(app, 'segredo', 'senha-secreta-9');
    const linhas = JSON.stringify(await conexao.banco.query.jogadores.findMany());
    expect(linhas).not.toContain('senha-secreta-9');
    expect(JSON.stringify(await conexao.banco.query.sessoes.findMany())).not.toContain(token);
    await app.inject({ method: 'POST', url: '/api/senha/esqueci', payload: { email: emailDe('segredo') } });
    const codigo = correio.ultimoCodigo(emailDe('segredo'));
    expect(JSON.stringify(await conexao.banco.query.codigosEmail.findMany())).not.toContain(codigo);
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
